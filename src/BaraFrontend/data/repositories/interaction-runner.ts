/**
 * 执行一个交互动作（1.11）。
 *
 * 交互总览与表格坞的卡片/列表视图都从这里走。两处各写一份的话，
 * 「`<user>` 在哪一层展开」「填入还是发送」这类判断迟早有一边写歪 ——
 * 而写歪的表现是发出去一句带着 `<user>` 字面量的话。
 *
 * 分工：`{Name}` 由 domain 的 `renderTemplate` 填，`<user>` 在这里展开
 * （要读 persona，是 data 层的事）。
 */
import { renderTemplate, type ActionItem } from '../../domain/interaction-rules';
import { replaceUserPlaceholders } from '../persona';
import { sendChatText, fillComposer } from '../chat-sender';

export type RunResult =
  | { ok: true; mode: 'sent' | 'filled'; text: string }
  | { ok: false; reason: 'no_composer' | 'send_failed'; text: string };

/**
 * 把动作模板渲染成最终要发的那句话。
 *
 * 单独导出是为了给按钮的 tooltip 用 —— 点之前就该看得到会发出去什么。
 */
export function previewAction(action: ActionItem, name: string): string {
  return replaceUserPlaceholders(renderTemplate(action.template, name));
}

/**
 * 跑一个动作。`autoSend` 为假时只填进输入框，让用户改完再发。
 *
 * 失败分两种且必须分开报：找不到输入框（换个发送方式还有救）与
 * 发送链整条走不通（四级兜底都失败了，只能手动复制）。
 */
export async function runAction(
  action: ActionItem,
  name: string,
  autoSend: boolean,
): Promise<RunResult> {
  const text = previewAction(action, name);

  if (!autoSend) {
    return fillComposer(text)
      ? { ok: true, mode: 'filled', text }
      : { ok: false, reason: 'no_composer', text };
  }

  const mode = await sendChatText(text);
  return mode
    ? { ok: true, mode: 'sent', text }
    : { ok: false, reason: 'send_failed', text };
}
