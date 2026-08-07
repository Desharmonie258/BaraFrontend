/**
 * 快照比对 —— 算出「上一轮基线」到「当前数据」之间发生了什么。
 *
 * 移植自骰子系统的审核面板（`createDiffRowMatcher` / `getDiffRowIdentityKeys`
 * 那一组函数）。纯函数，不碰 window 与数据库。
 *
 * ## 为什么不能按行号比对
 *
 * AI 每轮重写整张表，行的**顺序会变**：插一行、删一行、重排，都会让
 * 同一条记录换行号。纯按下标比会把一次插入报成「后面每一行都改了」。
 *
 * 因此先按**身份键**配对：优先用姓名/名称一类的标识列，其次整行内容，
 * 最后才退回行号。配过的行会被标记占用，避免两条新行抢同一条旧行。
 */

export type ChangeType =
  | 'table_added'
  | 'table_deleted'
  | 'table_structure_changed'
  | 'row_added'
  | 'row_deleted'
  | 'row_modified'
  | 'cell_modified';

export interface FieldChange {
  colIndex: number;
  header: string;
  oldValue: string;
  newValue: string;
}

export interface Change {
  type: ChangeType;
  /** 表的展示名 */
  tableName: string;
  sheetKey: string;
  /** 行在当前数据中的下标（0 为第一行数据）。表级变更时为 undefined。 */
  rowIndex?: number;
  /** 用于人类辨认的行标题，通常是姓名/名称列 */
  title?: string;
  /** cell_modified 用 */
  field?: FieldChange;
  /** row_modified 用：同一行的多个字段改动 */
  fields?: FieldChange[];
  /** row_added / row_deleted 用 */
  headers?: string[];
  row?: string[];
}

/** 可能承载行标识的列名关键词。命中的列优先用于配对。 */
const ID_HEADER_KEYWORDS = [
  '姓名', '名称', '名字', 'name', '标题', 'title',
  '角色', '持有人', '物品', '装备', '技能', '特性', '状态',
  '资源id', 'id', '日期', '时间',
];

export interface Sheet {
  name: string;
  /** content[0] 是表头，其余为数据行 */
  content: string[][];
}

export type Snapshot = Record<string, Sheet>;

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function headerKey(v: unknown): string {
  return text(v).toLowerCase();
}

function normalizeRow(row: unknown): string[] {
  return Array.isArray(row) ? row.map((c) => String(c ?? '')) : [];
}

/**
 * 优先用于配对的列下标。
 *
 * 顺序即优先级：标识类列 → 第 1 列 → 第 0 列。第 0 列通常是 row_id，
 * 放最后是因为它在 AI 重写整表时最不稳定 —— 行序一变它就全变了。
 */
export function preferredColumns(headers: string[]): number[] {
  const out: number[] = [];
  const add = (i: number) => {
    if (i >= 0 && i < headers.length && !out.includes(i)) out.push(i);
  };

  headers.forEach((h, i) => {
    /*
     * 第 0 列一律跳过关键词匹配。它是 row_id，而 `row_id` 本身就包含
     * 关键词 `id` —— 不跳过的话它会排到最前，于是「row_id 相同」成了
     * 配对依据，AI 一重排行就全部配错。它仍会在最后作为兜底加入。
     */
    if (i === 0) return;
    const k = headerKey(h);
    if (k && ID_HEADER_KEYWORDS.some((kw) => k.includes(kw))) add(i);
  });
  add(1);
  add(0);
  return out;
}

/**
 * 一行的身份键，按优先级排列。
 *
 * 同时产出「列名+值」与「列号+值」两种键：模板改过列序时前者仍能配上，
 * 改过列名时后者仍能配上。最后兜底一个整行内容键。
 */
export function identityKeys(headers: string[], row: string[]): string[] {
  const keys: string[] = [];
  const add = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k);
  };

  for (const i of preferredColumns(headers)) {
    /*
     * 第 0 列（row_id）**完全不参与身份键**。AI 每轮重写整表都会重排
     * 行号，用它配对会让「插入一行」变成「这行改了 + 末尾新增一行」。
     * 它只在 preferredColumns 里保留，供 rowTitle 兜底。
     */
    if (i === 0) continue;
    const v = text(row[i]);
    if (!v) continue;
    const hk = headerKey(headers[i]);
    if (hk) add(`h:${hk}:${v}`);
    add(`c:${i}:${v}`);
  }

  /*
   * 整行兜底键。用 U+0001 作分隔符 —— 它不会出现在正文里，
   * 因此不会让 `["a","b"]` 与 `["a b"]` 撞成同一个键。
   * 全空的行不产生键，否则两行空行会互相配上。
   */
  const SEP = String.fromCharCode(1);
  const full = row.slice(1).map(text).join(SEP);
  if (full.split(SEP).some((v) => v !== '')) add(`full:${full}`);

  return keys;
}

interface Matcher {
  byKey: Map<string, Array<{ index: number; row: string[] }>>;
  rows: string[][];
  used: Set<number>;
}

function createMatcher(headers: string[], rows: string[][]): Matcher {
  const byKey = new Map<string, Array<{ index: number; row: string[] }>>();
  rows.forEach((row, index) => {
    for (const key of identityKeys(headers, row)) {
      const queue = byKey.get(key) ?? [];
      queue.push({ index, row });
      byKey.set(key, queue);
    }
  });
  return { byKey, rows, used: new Set() };
}

/**
 * 按身份键找一条旧行。找到即标记占用，**同一条旧行不会被配两次** ——
 * 否则重复的同名行会互相顶掉，报出一堆假的「新增」。
 */
function takeByKey(
  m: Matcher,
  headers: string[],
  row: string[],
): { index: number; row: string[] } | null {
  for (const key of identityKeys(headers, row)) {
    const queue = m.byKey.get(key);
    while (queue?.length) {
      const c = queue.shift()!;
      if (!m.used.has(c.index)) {
        m.used.add(c.index);
        return c;
      }
    }
  }
  return null;
}

/**
 * 全表配对，**分两趟**。
 *
 * 第一趟只按身份键配，第二趟才让剩下的行按行号兜底。
 *
 * 不能合成一趟：单趟从上往下走时，一条真正的新行会在按键配失败后
 * 用行号抢走「本该属于下一行」的旧行 —— 中间插一行会因此被报成
 * 「这一行改了 + 末尾新增一行」，而不是「新增一行」。
 *
 * 行号兜底本身不能去掉：改名的行按键配不上，只有靠行号才能认出
 * 它是「同一行改了名」而非「删一行加一行」。
 */
function matchRows(
  m: Matcher,
  headers: string[],
  newRows: string[][],
): Map<number, { index: number; row: string[] }> {
  const matched = new Map<number, { index: number; row: string[] }>();

  newRows.forEach((row, i) => {
    const hit = takeByKey(m, headers, row);
    if (hit) matched.set(i, hit);
  });

  newRows.forEach((row, i) => {
    if (matched.has(i)) return;
    const positional = m.rows[i];
    if (positional && !m.used.has(i)) {
      m.used.add(i);
      matched.set(i, { index: i, row: positional });
    }
  });

  return matched;
}

/** 行标题：取第一个有值的标识列，都没有就用行号 */
export function rowTitle(headers: string[], row: string[], rowIndex: number): string {
  for (const i of preferredColumns(headers)) {
    if (i === 0) continue; // row_id 不适合作标题
    const v = text(row[i]);
    if (v) return v;
  }
  return text(row[0]) || `行 ${rowIndex + 1}`;
}

/**
 * 比对两份快照。
 *
 * @param baseline 上一轮的基线，null 表示尚未建立基线
 * @param current  当前数据
 */
export function diffSnapshots(baseline: Snapshot | null, current: Snapshot): Change[] {
  const changes: Change[] = [];
  if (!baseline) return changes;

  const matchedKeys = new Set<string>();

  for (const [sheetKey, sheet] of Object.entries(current)) {
    if (!sheetKey.startsWith('sheet_') || !sheet?.name || !Array.isArray(sheet.content)) continue;

    const old = baseline[sheetKey];
    if (old) matchedKeys.add(sheetKey);

    const tableName = sheet.name;
    const headers = normalizeRow(sheet.content[0]);

    if (!old?.content) {
      changes.push({ type: 'table_added', tableName, sheetKey });
      continue;
    }

    const oldHeaders = normalizeRow(old.content[0]);
    if (JSON.stringify(headers) !== JSON.stringify(oldHeaders)) {
      // 表结构变了就不再逐行比 —— 列对不上时的逐行比对全是噪声
      changes.push({ type: 'table_structure_changed', tableName, sheetKey });
      continue;
    }

    const newRows = sheet.content.slice(1).map(normalizeRow);
    const oldRows = old.content.slice(1).map(normalizeRow);
    const matcher = createMatcher(oldHeaders, oldRows);
    const matches = matchRows(matcher, headers, newRows);

    newRows.forEach((row, rowIndex) => {
      const matched = matches.get(rowIndex);
      const title = rowTitle(headers, row, rowIndex);

      if (!matched) {
        changes.push({
          type: 'row_added', tableName, sheetKey, rowIndex, title, headers, row,
        });
        return;
      }

      const fields: FieldChange[] = [];
      row.forEach((cell, colIndex) => {
        // 跳过 row_id：AI 重排行时它必然变，报出来全是噪声
        if (colIndex === 0) return;
        const oldValue = String(matched.row[colIndex] ?? '');
        const newValue = String(cell ?? '');
        if (oldValue !== newValue) {
          fields.push({ colIndex, header: headers[colIndex] || `列${colIndex}`, oldValue, newValue });
        }
      });

      if (fields.length === 1) {
        changes.push({
          type: 'cell_modified', tableName, sheetKey, rowIndex, title, field: fields[0],
        });
      } else if (fields.length > 1) {
        // 同一行的多处改动合并成一条，否则改 10 个字段会刷出 10 条
        changes.push({
          type: 'row_modified', tableName, sheetKey, rowIndex, title, fields, headers, row,
        });
      }
    });

    oldRows.forEach((row, i) => {
      if (matcher.used.has(i)) return;
      changes.push({
        type: 'row_deleted',
        tableName, sheetKey, rowIndex: i,
        title: rowTitle(oldHeaders, row, i),
        headers: oldHeaders, row,
      });
    });
  }

  // 基线里有、当前没有的表
  for (const [sheetKey, sheet] of Object.entries(baseline)) {
    if (!sheetKey.startsWith('sheet_')) continue;
    if (matchedKeys.has(sheetKey) || current[sheetKey]) continue;
    changes.push({ type: 'table_deleted', tableName: sheet?.name || sheetKey, sheetKey });
  }

  return changes;
}

/** 变更总数。坞上的角标用它，不需要拿到完整列表。 */
export function countChanges(baseline: Snapshot | null, current: Snapshot): number {
  return diffSnapshots(baseline, current).length;
}

/** 按表分组，保持各表内变更的原有顺序 */
export function groupByTable(changes: Change[]): Array<{ tableName: string; items: Change[] }> {
  const map = new Map<string, Change[]>();
  for (const c of changes) {
    const list = map.get(c.tableName);
    if (list) list.push(c);
    else map.set(c.tableName, [c]);
  }
  return [...map.entries()].map(([tableName, items]) => ({ tableName, items }));
}
