/**
 * 审核基线 —— 记住「上一次确认时的数据」，用来算出这一轮 AI 改了什么。
 *
 * 移植自骰子系统的审核面板。两处关键设计照搬：
 *
 * 1. **基线带上下文指纹。** 切换聊天后旧基线必须作废，否则会拿上一个
 *    聊天的数据来比，报出满屏假变更。骰子系统用 `_contextId` 做这件事
 *    （`loadSnapshot` 里核对指纹），这里同理。
 * 2. **基线只在用户确认后更新。** 自动跟随当前数据的话，永远比不出东西 ——
 *    基线的意义就是「停在上一个已知状态」。
 *
 * 基线存在酒馆变量里，与界面设置同一通路（见 ui-store）。
 */
import { readSnapshot } from '../db-gateway';
import { diffSnapshots, type Change, type Snapshot } from '../../domain/review/diff';

const VAR_KEY = 'bara_review_baseline';

interface StoredBaseline {
  /** 上下文指纹，切聊天后不匹配即作废 */
  contextId: string;
  /** 建立基线的时刻，仅用于展示 */
  at: number;
  data: Snapshot;
}

/** 逐级回退查找运行时函数。与 tavern-runtime 同策略，不缓存。 */
function runtimeFn<T extends (...a: any[]) => any>(name: string): T | null {
  const wins = [window as any, (window as any).parent, (window as any).top];
  for (const w of wins) {
    try {
      if (typeof w?.[name] === 'function') return w[name].bind(w) as T;
      const helper = w?.TavernHelper;
      if (typeof helper?.[name] === 'function') return helper[name].bind(helper) as T;
    } catch {
      /* 跨域，继续 */
    }
  }
  return null;
}

/**
 * 当前聊天的指纹。
 *
 * 取不到聊天标识时返回空串 —— 此时基线**一律视为失效**，宁可让用户
 * 重新建立，也不能拿不确定归属的基线去比。
 */
export function contextId(): string {
  for (const name of ['getChatId', 'getCurrentChatId', 'getCurrentMessageId']) {
    const fn = runtimeFn<() => unknown>(name);
    try {
      const v = fn?.();
      if (v !== undefined && v !== null && String(v) !== '') return String(v);
    } catch {
      /* 换下一个 */
    }
  }
  return '';
}

function readVar(): unknown {
  const get = runtimeFn<(opts?: unknown) => Record<string, unknown>>('getVariables');
  try {
    return get?.({ type: 'chat' })?.[VAR_KEY];
  } catch (e) {
    console.warn('[蔷薇前端] 读取审核基线失败', e);
    return undefined;
  }
}

function writeVar(value: StoredBaseline | null): boolean {
  const replace = runtimeFn<(updater: unknown, opts?: unknown) => unknown>('replaceVariables');
  if (!replace) return false;
  try {
    replace(
      (vars: Record<string, unknown>) => {
        if (value === null) delete vars[VAR_KEY];
        else vars[VAR_KEY] = value;
        return vars;
      },
      { type: 'chat' },
    );
    return true;
  } catch (e) {
    console.warn('[蔷薇前端] 写入审核基线失败', e);
    return false;
  }
}

/** 取基线。指纹不匹配或格式不对时返回 null。 */
export function loadBaseline(): StoredBaseline | null {
  const raw = readVar();
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<StoredBaseline>;
  if (!b.data || typeof b.data !== 'object') return null;

  const now = contextId();
  // 指纹取不到时不敢用旧基线：无法确认它属于当前聊天
  if (!now || b.contextId !== now) return null;
  return { contextId: b.contextId, at: Number(b.at) || 0, data: b.data as Snapshot };
}

/** 把当前数据存为新基线。返回是否成功。 */
export function captureBaseline(): boolean {
  const current = readSnapshot();
  if (!current) return false;
  return writeVar({ contextId: contextId(), at: Date.now(), data: current as Snapshot });
}

/** 清除基线。清除后视为「尚未建立」，不再报变更。 */
export function clearBaseline(): boolean {
  return writeVar(null);
}

export interface ReviewState {
  /** 基线是否存在且属于当前聊天 */
  hasBaseline: boolean;
  /** 基线建立时刻 */
  at: number;
  changes: Change[];
}

/** 比对当前数据与基线。没有基线时返回空列表而非报错。 */
export function readReview(): ReviewState {
  const baseline = loadBaseline();
  const current = (readSnapshot() ?? {}) as Snapshot;
  return {
    hasBaseline: baseline !== null,
    at: baseline?.at ?? 0,
    changes: baseline ? diffSnapshots(baseline.data, current) : [],
  };
}

/** 变更数。坞角标用，不需要完整列表。 */
export function countChanges(): number {
  return readReview().changes.length;
}
