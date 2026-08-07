/**
 * 聊天发送器 —— 把一段文本作为用户消息发出并触发 AI 回复。
 *
 * 实现移植自骰子系统（`sendChatTextAndTrigger`，AFPL / 阿拉丁公共许可证，
 * 与本项目所用的 Tavern Helper Template 同源）。移植时去掉了它的骰子专属
 * 逻辑（结果占位符、textarea 骰子缓存、隐藏真实点数），只保留发送链本身。
 *
 * 为什么是四级兜底而不是直接调一个 API：酒馆的发送入口在不同版本、
 * 不同加载方式下都不一样，且脚本可能运行在 iframe 内。任何单一入口
 * 都会在某些环境下静默失效 —— 点了没反应是最难排查的故障。
 *
 * 顺序（先直接、后模拟）：
 *   1. createChatMessages  —— 助手 API，直接写入消息，最干净
 *   2. triggerSlash        —— 助手的 Slash 通道
 *   3. SillyTavern 原生 executeSlashCommandsWithOptions
 *   4. 输入框模拟          —— 填 #send_textarea 再点 #send_but
 *
 * 前三级发完都要再发一次 `/trigger`：写入消息本身不会让 AI 开始生成。
 */

import { findRuntimeFunction, runtimeWindows, hostDocuments } from './tavern-runtime';

export type SendMode = 'api' | 'slash' | 'composer' | null;

function findSlashRunner(): ((cmd: string) => Promise<any>) | null {
  for (const w of runtimeWindows()) {
    const ST = (w as any)?.SillyTavern;
    if (typeof ST?.executeSlashCommandsWithOptions === 'function') {
      return ST.executeSlashCommandsWithOptions.bind(ST);
    }
  }
  return null;
}

/** Slash 参数要整体加引号，内部的反斜杠与引号需转义 */
function quoteSlashArgument(text: string): string {
  return `"${String(text ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function triggerGeneration(): Promise<boolean> {
  const slash = findRuntimeFunction<(c: string) => Promise<any>>('triggerSlash');
  if (slash) {
    await slash('/trigger');
    return true;
  }
  const runner = findSlashRunner();
  if (runner) {
    await runner('/trigger');
    return true;
  }
  return false;
}

function getComposer(): HTMLTextAreaElement | null {
  for (const doc of hostDocuments()) {
    const ta = doc.querySelector<HTMLTextAreaElement>('#send_textarea');
    if (ta) return ta;
  }
  return null;
}

/**
 * 找发送按钮。优先可见且未禁用的那个 —— 酒馆在某些布局下
 * 页面里会同时存在多个 `#send_but`（移动端 / 桌面端各一份）。
 */
function findSendButton(): HTMLElement | null {
  for (const doc of hostDocuments()) {
    const buttons = Array.from(doc.querySelectorAll<HTMLElement>('#send_but'));
    const visible = buttons.find((b) => {
      if ((b as HTMLButtonElement).disabled) return false;
      const rect = b.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (visible) return visible;
    if (buttons[0] && !(buttons[0] as HTMLButtonElement).disabled) return buttons[0];
  }
  return null;
}

/**
 * 直接赋值 textarea.value 不会触发 Vue/React 的双向绑定，
 * 必须补一个 input 事件通知框架。
 */
function setComposerValue(ta: HTMLTextAreaElement, value: string): void {
  ta.value = value;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 第四级兜底：填输入框再模拟点击，最后退到回车键 */
async function sendViaComposer(text: string): Promise<SendMode> {
  const ta = getComposer();
  if (!ta) return null;

  setComposerValue(ta, text);
  // 给框架一帧时间响应 input，否则点发送时它可能仍读到空值
  await new Promise((r) => setTimeout(r, 50));

  const btn = findSendButton();
  if (btn) {
    btn.click();
    return 'composer';
  }

  const win = ta.ownerDocument.defaultView ?? window;
  ta.dispatchEvent(
    new win.KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit),
  );
  return 'composer';
}

/**
 * 发送文本并触发生成。返回实际走通的路径，全部失败返回 null。
 *
 * 每一级失败只降级、不抛出 —— 调用方只需要知道成没成，
 * 具体哪条路走通了是排障信息，记在控制台即可。
 */
export async function sendChatText(messageText: string): Promise<SendMode> {
  const text = String(messageText ?? '').trim();
  if (!text) return null;

  const createChatMessages = findRuntimeFunction<
    (msgs: Array<{ role: string; message: string }>, opts?: unknown) => Promise<unknown>
  >('createChatMessages');
  if (createChatMessages) {
    let ok = true;
    try {
      await createChatMessages([{ role: 'user', message: text }], { refresh: 'affected' });
    } catch (e) {
      console.warn('[蔷薇前端] createChatMessages 发送失败，降级到 Slash', e);
      ok = false;
    }
    if (ok) {
      try {
        if (!(await triggerGeneration())) {
          console.warn('[蔷薇前端] 消息已写入，但未找到 /trigger 入口');
        }
      } catch (e) {
        console.warn('[蔷薇前端] 消息已写入，但 /trigger 触发失败', e);
      }
      return 'api';
    }
  }

  const triggerSlash = findRuntimeFunction<(c: string) => Promise<any>>('triggerSlash');
  if (triggerSlash) {
    let ok = true;
    try {
      await triggerSlash(`/send raw=true ${quoteSlashArgument(text)}`);
    } catch (e) {
      console.warn('[蔷薇前端] triggerSlash 发送失败，降级到原生接口', e);
      ok = false;
    }
    if (ok) {
      try {
        await triggerSlash('/trigger');
      } catch (e) {
        console.warn('[蔷薇前端] 已发送消息，但 /trigger 触发失败', e);
      }
      return 'slash';
    }
  }

  const runner = findSlashRunner();
  if (runner) {
    try {
      const result = await runner(`/send raw=true ${quoteSlashArgument(text)}`);
      if (!result?.isError && !result?.isAborted) {
        try {
          await runner('/trigger');
        } catch (e) {
          console.warn('[蔷薇前端] 已发送消息，但 /trigger 触发失败', e);
        }
        return 'slash';
      }
      console.warn('[蔷薇前端] 原生接口 send 失败', result);
    } catch (e) {
      console.warn('[蔷薇前端] 原生接口失败，降级到输入框模拟', e);
    }
  }

  return sendViaComposer(text);
}

/**
 * 只填入输入框、不发送 —— 供「先看看再改」的使用方式。
 * 填入后聚焦，光标落到末尾便于继续编辑。
 */
export function fillComposer(text: string): boolean {
  const ta = getComposer();
  if (!ta) return false;
  setComposerValue(ta, String(text ?? ''));
  try {
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  } catch {
    /* 个别环境下 textarea 不可聚焦，不影响已填入的内容 */
  }
  return true;
}

/** 输入框是否存在。不存在时界面应给出提示而不是让按钮点了没反应。 */
export function canSend(): boolean {
  return (
    getComposer() !== null ||
    findRuntimeFunction('createChatMessages') !== null ||
    findRuntimeFunction('triggerSlash') !== null ||
    findSlashRunner() !== null
  );
}
