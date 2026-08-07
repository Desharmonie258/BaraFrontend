/**
 * 启动竞态的回归测试。
 *
 * 真实场景：数据库本体轮询 chatId 最多 15 秒才就绪，而本脚本几百毫秒
 * 就初始化完毕。修复前，抢先跑完就永远停在空面板 —— 这里锁住「插件晚
 * 到也能自愈」这个行为。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForDatabase, WAIT_DELAYS_MS } from '../src/BaraFrontend/data/db-ready';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** 造一个「第 readyAfterMs 毫秒才就绪」的假数据库 */
function fakeDb(readyAfterMs: number, sheetCount = 23) {
  const start = Date.now();
  const present = () => Date.now() - start >= readyAfterMs;
  let subscribed = false;
  return {
    get subscribed() {
      return subscribed;
    },
    reloads: 0,
    deps: {
      attach(): boolean {
        if (!present()) return false;
        subscribed = true;
        return true;
      },
      reload(): void {
        // 由外层计数
      },
      count(): number {
        return present() && subscribed ? sheetCount : 0;
      },
    },
  };
}

describe('waitForDatabase', () => {
  it('插件已就绪时同步命中，不空等一轮', () => {
    const db = fakeDb(0);
    const onReady = vi.fn();
    waitForDatabase({ ...db.deps, onReady });

    // 未推进任何定时器就应已就绪
    expect(onReady).toHaveBeenCalledWith(0, 23);
  });

  it('插件晚到 15 秒仍能自愈', () => {
    const db = fakeDb(15_000);
    const onReady = vi.fn();
    const onTimeout = vi.fn();
    waitForDatabase({ ...db.deps, onReady, onTimeout });

    // 首次同步探测扑空
    expect(onReady).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20_000);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][1]).toBe(23);
    expect(db.subscribed).toBe(true);
  });

  it('订阅只发生一次，不反复退订重订', () => {
    const db = fakeDb(3_000);
    const attach = vi.fn(db.deps.attach);
    waitForDatabase({ ...db.deps, attach });

    vi.advanceTimersByTime(20_000);

    // attach 会被多次调用（每轮探测），但成功订阅后循环即结束
    const successes = attach.mock.results.filter((r) => r.value === true).length;
    expect(successes).toBe(1);
  });

  it('始终为空时到期放弃，不无限轮询', () => {
    const onReady = vi.fn();
    const onTimeout = vi.fn();
    waitForDatabase({
      attach: () => true,
      reload: () => {},
      count: () => 0, // 合法的空状态：没导入模板
      onReady,
      onTimeout,
    });

    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(onReady).not.toHaveBeenCalled();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    // 到期后不应再有待触发的定时器
    expect(vi.getTimerCount()).toBe(0);
  });

  it('取消后不再探测', () => {
    const count = vi.fn(() => 0);
    const cancel = waitForDatabase({ attach: () => false, reload: () => {}, count });

    const callsBefore = count.mock.calls.length;
    cancel();
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(count.mock.calls.length).toBe(callsBefore);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('探测总时长足以覆盖插件的 15 秒 chatId 轮询', () => {
    const total = WAIT_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(15_000);
  });
});
