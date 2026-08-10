/**
 * 「AI 正在生成」的探测（1.11）。
 *
 * 手改表格与 AI 写表是两个会互相覆盖的写入方。生成期间用户改的值，
 * 几乎必然被这一轮的表格更新盖掉 —— 改了、看着变了、下一秒变回去，
 * 而用户完全不知道发生了什么。
 *
 * 所以生成期间收起编辑入口，并说明原因。**不是禁用按钮**：
 * 禁用按钮解释不了「为什么现在不能改」，一句话的说明可以。
 *
 * ## 为什么不订阅事件常量
 *
 * 酒馆的事件名在不同版本里换过（`GENERATION_STARTED` 与 `generation_started`
 * 都出现过），而这个模块拿不到宿主的 `tavern_events` 常量表时只能猜。
 * 所以两条都订上，谁先到算谁 —— 多订一个不存在的事件不会有副作用。
 *
 * 订阅失败（没有 eventOn）时一律报「没在生成」：探测不出来就不该
 * 挡住用户改数据，那是比偶尔被覆盖更糟的失败方式。
 */
import { findRuntimeFunction } from './tavern-runtime';

type Handler = (...args: unknown[]) => void;

const START_EVENTS = ['GENERATION_STARTED', 'generation_started'];
const END_EVENTS = [
  'GENERATION_ENDED', 'generation_ended',
  'GENERATION_STOPPED', 'generation_stopped',
];

let generating = false;
let bound = false;
/**
 * 兜底超时。
 *
 * 结束事件漏了一次（生成被中断、宿主换了事件名）就会永久卡在「生成中」，
 * 编辑入口再也不出现。宁可偶尔提前解除，也不能一直挡着。
 */
const MAX_GENERATION_MS = 180_000;
let startedAt = 0;

/** 状态变化的订阅者。界面靠它重渲染 —— 轮询探测状态是白付电。 */
const listeners = new Set<(generating: boolean) => void>();

function notify(): void {
  for (const cb of listeners) {
    try { cb(generating); } catch { /* 一个订阅者出错不该拖垮其余的 */ }
  }
}

function markStart(): void {
  if (generating) return;
  generating = true;
  startedAt = Date.now();
  notify();
}

function markEnd(): void {
  if (!generating) return;
  generating = false;
  startedAt = 0;
  notify();
}

/** 订阅状态变化，返回退订函数 */
export function onGenerationChange(cb: (generating: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * 订阅一次。重复调用无副作用 —— 组件挂载时调用，不需要配对的解绑：
 * 这几个监听器活到页面销毁为止，与宿主同寿。
 */
export function watchGeneration(): void {
  if (bound) return;
  const on = findRuntimeFunction<(event: string, handler: Handler) => void>('eventOn');
  if (!on) return;

  bound = true;
  for (const e of START_EVENTS) {
    try { on(e, markStart); } catch { /* 事件名不存在，忽略 */ }
  }
  for (const e of END_EVENTS) {
    try { on(e, markEnd); } catch { /* 同上 */ }
  }
}

/** 当前是否正在生成。探测不出来时返回 false。 */
export function isGenerating(): boolean {
  if (!generating) return false;
  if (Date.now() - startedAt > MAX_GENERATION_MS) {
    markEnd();
    return false;
  }
  return true;
}

/** 仅供测试：重置内部状态 */
export function resetGenerationWatch(): void {
  generating = false;
  bound = false;
  startedAt = 0;
  listeners.clear();
}
