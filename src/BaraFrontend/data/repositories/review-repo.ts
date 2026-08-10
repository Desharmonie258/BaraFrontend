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

/**
 * 把基线里的一个格子改成新值。
 *
 * 手改表格后调用。**不能用 `captureBaseline()` 代替** —— 那是整库重拍，
 * 会把 AI 这一轮尚未审核的改动一并吞进基线，用户再也看不到它们改了什么。
 * 只补手改的那一格，AI 的未审改动仍留在 diff 里。
 *
 * 没有基线时返回 false 而不是建立基线：用户还没开始审核，不该由一次
 * 手改替他决定从哪里开始比。
 *
 * 行号沿用数据库本体口径（0 为表头），`Sheet.content` 恰好同口径。
 */
export function patchBaselineCell(
  sheetKey: string,
  rowIndex: number,
  column: string,
  value: string,
): boolean {
  const baseline = loadBaseline();
  const sheet = baseline?.data?.[sheetKey];
  if (!baseline || !sheet || !Array.isArray(sheet.content) || sheet.content.length === 0) {
    return false;
  }
  const col = sheet.content[0]?.indexOf(column) ?? -1;
  const row = sheet.content[rowIndex];
  // 基线里没有这一列或这一行：多半是基线建立后表结构变了，补不了就别补
  if (col < 0 || !Array.isArray(row)) return false;

  row[col] = value;
  return writeVar(baseline);
}

/**
 * 把一次手动加行/删行同步进基线。
 *
 * 与 `patchBaselineCell` 同一个理由：手改不该出现在「AI 这轮改了什么」里。
 * 行级操作还多一层麻烦 —— 删掉一行会让它后面每一行的行号都往前挪，
 * 基线不跟着删的话，diff 会把后面所有行报成「改了」。
 *
 * `row` 为 undefined 表示删除该行；给了 `row` 则在表尾追加。
 * 追加只支持表尾，因为数据库本体的 `insertRow` 也只能追加。
 */
export function patchBaselineRow(
  sheetKey: string,
  rowIndex: number,
  row?: readonly string[],
): boolean {
  const baseline = loadBaseline();
  const sheet = baseline?.data?.[sheetKey];
  if (!baseline || !sheet || !Array.isArray(sheet.content) || sheet.content.length === 0) {
    return false;
  }

  if (row) {
    sheet.content.push([...row]);
    return writeVar(baseline);
  }

  // 0 是表头，删它会让整张表在基线里错位一列
  if (rowIndex <= 0 || rowIndex >= sheet.content.length) return false;
  sheet.content.splice(rowIndex, 1);
  return writeVar(baseline);
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
