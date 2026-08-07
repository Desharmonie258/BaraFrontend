/**
 * 等待数据库插件就绪 —— 启动竞态的修复。
 *
 * ## 为什么需要它
 *
 * 数据库本体的启动是异步的：它要轮询 chatId 最多 15 秒，拿不到还会继续
 * 等待宿主的 CHAT_CHANGED 事件（其控制台原话："chatId still not available
 * after 15000ms polling. Waiting for CHAT_CHANGED event."）。
 *
 * 而本脚本几百毫秒就初始化完毕。谁先跑完不确定 —— 这正是「有时刷新一下
 * 就正常」的由来。抢先跑完的代价是双重的：读到 0 张表，且订阅不上表格
 * 更新回调（插件缺席时 `onTableUpdate` 返回空的取消函数），于是**再没有
 * 任何东西**会触发第二次读取，面板永远停在空状态。
 *
 * ## 退出条件
 *
 * 表清单非空即收工，此后由更新回调接手。表清单为空也可能是合法状态
 * （没导入模板），因此到达期限后放弃而不是无限轮询 —— 一个永远在后台
 * 空转的定时器比一次明确的失败更难排查。
 *
 * 依赖全部注入，本模块不碰 window 与数据库插件，可直接单测。
 */

/**
 * 退避间隔。累计约 37 秒，覆盖插件那 15 秒的 chatId 轮询并留出余量。
 * 前几次密集是为了让正常情况（插件已就绪）尽快收敛。
 */
export const WAIT_DELAYS_MS: readonly number[] = [
  200, 300, 500, 800, 1200, 2000, 3000, 4000, 5000, 5000, 5000, 5000, 5000,
];

export interface WaitDeps {
  /** 订阅表格更新。插件未挂载时返回 false，稍后重试。 */
  attach: () => boolean;
  /** 重读表清单 */
  reload: () => void;
  /** 当前表数量 */
  count: () => number;
  /** 就绪回调，attempt 为第几次探测（0 表示首次同步命中） */
  onReady?: (attempt: number, count: number) => void;
  /** 期限内始终为空 */
  onTimeout?: () => void;
}

/**
 * 启动等待循环，返回取消函数。
 *
 * 首次探测是**同步**的：插件已就绪时不应白等 200ms。
 */
export function waitForDatabase(deps: WaitDeps): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  function step(attempt: number): void {
    if (cancelled) return;

    if (deps.attach()) deps.reload();

    const n = deps.count();
    if (n > 0) {
      deps.onReady?.(attempt, n);
      return;
    }

    if (attempt >= WAIT_DELAYS_MS.length) {
      deps.onTimeout?.();
      return;
    }

    timer = setTimeout(() => step(attempt + 1), WAIT_DELAYS_MS[attempt]);
  }

  step(0);

  return () => {
    cancelled = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
