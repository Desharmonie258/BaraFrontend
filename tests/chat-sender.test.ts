/**
 * @vitest-environment jsdom
 *
 * 本文件需要 DOM：发送链的兜底路径要操作酒馆的输入框与发送按钮，
 * 建议仓储则通过挂在 window 上的插件 API 取快照。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendChatText, fillComposer, canSend } from '../src/BaraFrontend/data/chat-sender';

function clearRuntime(): void {
  for (const k of ['createChatMessages', 'triggerSlash', 'TavernHelper', 'SillyTavern']) {
    delete (window as any)[k];
  }
  document.body.innerHTML = '';
}

function addComposer(): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.id = 'send_textarea';
  document.body.appendChild(ta);
  return ta;
}

beforeEach(clearRuntime);

describe('聊天发送器', () => {
  it('优先走 createChatMessages，并补发 /trigger', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const slash = vi.fn().mockResolvedValue(undefined);
    (window as any).createChatMessages = create;
    (window as any).triggerSlash = slash;

    expect(await sendChatText('撬锁进入库房')).toBe('api');
    expect(create).toHaveBeenCalledWith(
      [{ role: 'user', message: '撬锁进入库房' }],
      { refresh: 'affected' },
    );
    expect(slash).toHaveBeenCalledWith('/trigger');
  });

  it('createChatMessages 抛错时降级到 triggerSlash', async () => {
    (window as any).createChatMessages = vi.fn().mockRejectedValue(new Error('boom'));
    const slash = vi.fn().mockResolvedValue(undefined);
    (window as any).triggerSlash = slash;

    expect(await sendChatText('行动')).toBe('slash');
    expect(slash.mock.calls[0][0]).toContain('/send raw=true');
  });

  it('Slash 参数转义引号与反斜杠', async () => {
    const slash = vi.fn().mockResolvedValue(undefined);
    (window as any).triggerSlash = slash;

    await sendChatText('说 "你好" \\ 结束');
    expect(slash.mock.calls[0][0]).toBe('/send raw=true "说 \\"你好\\" \\\\ 结束"');
  });

  it('从 TavernHelper 命名空间也能找到函数', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    (window as any).TavernHelper = { createChatMessages: create };
    expect(await sendChatText('行动')).toBe('api');
    expect(create).toHaveBeenCalled();
  });

  it('原生接口返回 isError 时继续降级到输入框', async () => {
    (window as any).SillyTavern = {
      executeSlashCommandsWithOptions: vi.fn().mockResolvedValue({ isError: true }),
    };
    const ta = addComposer();
    const btn = document.createElement('button');
    btn.id = 'send_but';
    const clicked = vi.fn();
    btn.addEventListener('click', clicked);
    document.body.appendChild(btn);

    expect(await sendChatText('行动')).toBe('composer');
    expect(ta.value).toBe('行动');
    expect(clicked).toHaveBeenCalled();
  });

  it('没有发送按钮时退到回车键', async () => {
    const ta = addComposer();
    const keydown = vi.fn();
    ta.addEventListener('keydown', keydown);

    expect(await sendChatText('行动')).toBe('composer');
    expect(keydown).toHaveBeenCalled();
  });

  it('空文本不发送 —— 避免误触发一次空回合', async () => {
    const create = vi.fn();
    (window as any).createChatMessages = create;
    expect(await sendChatText('   ')).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('全部通道缺失时返回 null 而非抛错', async () => {
    expect(await sendChatText('行动')).toBeNull();
  });

  it('fillComposer 只填入不发送', () => {
    const ta = addComposer();
    const btn = document.createElement('button');
    btn.id = 'send_but';
    const clicked = vi.fn();
    btn.addEventListener('click', clicked);
    document.body.appendChild(btn);

    expect(fillComposer('待编辑的行动')).toBe(true);
    expect(ta.value).toBe('待编辑的行动');
    expect(clicked).not.toHaveBeenCalled();
  });

  it('填入后派发 input 事件，否则框架读不到新值', () => {
    const ta = addComposer();
    const onInput = vi.fn();
    ta.addEventListener('input', onInput);
    fillComposer('x');
    expect(onInput).toHaveBeenCalled();
  });

  it('canSend 在无任何通道时为 false', () => {
    expect(canSend()).toBe(false);
    addComposer();
    expect(canSend()).toBe(true);
  });
});
