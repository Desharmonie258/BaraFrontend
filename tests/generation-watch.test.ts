/**
 * 「AI 正在生成」的探测。
 *
 * 这个模块的失败方式比它的成功更要紧：探测不出来时必须报「没在生成」，
 * 卡在「生成中」会让编辑入口永远不出现，而用户无从知道为什么。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  watchGeneration, isGenerating, onGenerationChange, resetGenerationWatch,
} from '../src/BaraFrontend/data/generation-watch';

(globalThis as any).window = globalThis;

/** 事件名 → 处理函数。同名可有多个订阅。 */
let handlers: Record<string, Array<(...a: unknown[]) => void>>;

function serveEventOn(): void {
  handlers = {};
  (globalThis as any).eventOn = (event: string, fn: (...a: unknown[]) => void) => {
    (handlers[event] ??= []).push(fn);
  };
}

function fire(event: string): void {
  for (const fn of handlers[event] ?? []) fn();
}

beforeEach(() => {
  resetGenerationWatch();
  delete (globalThis as any).eventOn;
  handlers = {};
});

describe('探测', () => {
  it('没有 eventOn 时一律报没在生成 —— 探测不出来不该挡住用户改数据', () => {
    watchGeneration();
    expect(isGenerating()).toBe(false);
  });

  it('开始与结束事件切换状态', () => {
    serveEventOn();
    watchGeneration();

    fire('GENERATION_STARTED');
    expect(isGenerating()).toBe(true);

    fire('GENERATION_ENDED');
    expect(isGenerating()).toBe(false);
  });

  it('小写事件名也认 —— 宿主换过命名，两条都订上', () => {
    serveEventOn();
    watchGeneration();

    fire('generation_started');
    expect(isGenerating()).toBe(true);
    fire('generation_stopped');
    expect(isGenerating()).toBe(false);
  });

  it('重复订阅不会重复绑定', () => {
    serveEventOn();
    watchGeneration();
    watchGeneration();
    expect(handlers['GENERATION_STARTED']).toHaveLength(1);
  });
});

describe('订阅', () => {
  it('状态变化时通知订阅者', () => {
    serveEventOn();
    watchGeneration();

    const seen: boolean[] = [];
    onGenerationChange((v) => seen.push(v));

    fire('GENERATION_STARTED');
    fire('GENERATION_ENDED');
    expect(seen).toEqual([true, false]);
  });

  it('同一状态重复触发不重复通知 —— 多个结束事件会一起到', () => {
    serveEventOn();
    watchGeneration();

    const seen: boolean[] = [];
    onGenerationChange((v) => seen.push(v));

    fire('GENERATION_STARTED');
    fire('GENERATION_STARTED');
    fire('GENERATION_ENDED');
    fire('GENERATION_STOPPED');
    expect(seen).toEqual([true, false]);
  });

  it('一个订阅者抛错不影响其余的', () => {
    serveEventOn();
    watchGeneration();

    const seen: boolean[] = [];
    onGenerationChange(() => { throw new Error('boom'); });
    onGenerationChange((v) => seen.push(v));

    fire('GENERATION_STARTED');
    expect(seen).toEqual([true]);
  });

  it('退订后不再收到通知', () => {
    serveEventOn();
    watchGeneration();

    const seen: boolean[] = [];
    const stop = onGenerationChange((v) => seen.push(v));
    fire('GENERATION_STARTED');
    stop();
    fire('GENERATION_ENDED');
    expect(seen).toEqual([true]);
  });
});

describe('兜底超时', () => {
  it('结束事件漏了一次也不会永久卡在生成中', () => {
    serveEventOn();
    watchGeneration();
    fire('GENERATION_STARTED');
    expect(isGenerating()).toBe(true);

    const realNow = Date.now;
    Date.now = () => realNow() + 200_000;
    try {
      expect(isGenerating()).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });
});
