/**
 * 酒馆运行时接口的定位工具。
 *
 * 脚本可能运行在 iframe 内，而助手接口挂在顶层窗口，因此每处调用都要
 * 逐级回退 top → parent → self，再看 TavernHelper 命名空间。
 *
 * **绝不缓存函数引用**：聊天切换、脚本重载期间这些接口会短暂消失，
 * 缓存下来的引用会指向已销毁的上下文。与 db-gateway 的纪律一致。
 */

/** 逐级回退的窗口候选。跨域访问 top/parent 会抛异常，逐个 try。 */
export function runtimeWindows(): Window[] {
  const out: Window[] = [];
  const push = (get: () => Window | null | undefined): void => {
    try {
      const w = get();
      if (w && !out.includes(w)) out.push(w);
    } catch {
      /* 跨域，跳过 */
    }
  };
  push(() => window.top);
  push(() => window.parent);
  push(() => window);
  return out;
}

/** 找一个运行时函数。先看窗口全局，再看 TavernHelper 命名空间。 */
export function findRuntimeFunction<T extends (...args: any[]) => any>(
  name: string,
): T | null {
  for (const w of runtimeWindows()) {
    const direct = (w as any)?.[name];
    if (typeof direct === 'function') return direct.bind(w) as T;

    const helper = (w as any)?.TavernHelper;
    const fn = helper?.[name];
    if (typeof fn === 'function') return fn.bind(helper) as T;
  }
  const g = (globalThis as any)?.[name];
  return typeof g === 'function' ? (g.bind(globalThis) as T) : null;
}

/** 可访问的宿主文档列表，从顶层到自身 */
export function hostDocuments(): Document[] {
  const out: Document[] = [];
  for (const w of runtimeWindows()) {
    try {
      if (w.document && !out.includes(w.document)) out.push(w.document);
    } catch {
      /* 跨域，跳过 */
    }
  }
  if (!out.includes(document)) out.push(document);
  return out;
}
