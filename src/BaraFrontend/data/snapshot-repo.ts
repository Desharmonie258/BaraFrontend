/**
 * 表格快照 —— 本项目**唯一**的读取入口。
 *
 * 数据库插件把处理好的表格以只读快照的形式暴露出来，形态是
 * `{ sheet_xxx: { name, content: [[表头], [行1], ...], sourceData } }`。
 * 读取就是二维数组索引，不需要走 SQL。
 *
 * 为什么不用 SQL：
 * - `querySql` / `executeSqlBatch` 只在 SQLite 模式且 runtime 完整 ready
 *   后才发布，而快照没有这个前提；
 * - 返回行的形态没有文档承诺（数组还是对象），而 `content` 明确是二维数组；
 * - SQL 只是插件内部的存储方式，处理好的内容没必要再按 SQL 读回来。
 *
 * 骰子系统与 Caikis 状态栏都是这么做的。写入则走 CRUD 方法（见 db-gateway）。
 */
import { readSnapshot } from './db-gateway';

export interface SheetSnapshot {
  key: string;
  name: string;
  /** 物理表名，来自 DDL；仅用于展示与排错 */
  table: string;
  /** 展示用列名，即 content[0] */
  headers: string[];
  /** 数据行，已去掉表头 */
  rows: string[][];
  /**
   * 枚举列的可选值：展示名 → 候选值。
   * 从 DDL 的 `CHECK(col IN (...))` 解析，供界面渲染成可点选项。
   */
  enums: Record<string, string[]>;
}

/**
 * 从 DDL 提取枚举约束。
 *
 * 模板里每列写作 `  col TYPE ... CHECK(col IN ('a','b')), -- 中文名`，
 * 因此按行解析即可同时拿到物理列名、候选值与展示名。
 *
 * 只认单列的 `IN` 约束；表级 CHECK、区间约束（BETWEEN / >=）不在此列 ——
 * 那些不是「几选一」，不适合渲染成选项。
 */
function parseEnums(ddl: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of (ddl ?? '').split('\n')) {
    const s = line.trim();
    const col = /^([A-Za-z_][A-Za-z0-9_]*)\s/.exec(s)?.[1];
    if (!col) continue;

    // CHECK 里引用的列必须是本列自身，避免误取跨列约束
    const check = new RegExp(`CHECK\\(\\s*${col}\\s+IN\\s*\\(([^)]*)\\)`, 'i').exec(s);
    if (!check) continue;

    const values = [...check[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
      m[1].replace(/''/g, "'"),
    );
    if (values.length === 0) continue;

    const label = /--\s*(.+?)\s*$/.exec(s)?.[1] ?? col;
    out[label] = values;
  }
  return out;
}

let cache: Map<string, SheetSnapshot> | null = null;

function parseTableName(ddl: string): string {
  return /CREATE TABLE\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(ddl ?? '')?.[1] ?? '';
}

function toRow(v: unknown): string[] {
  return Array.isArray(v) ? v.map((c) => (c === null || c === undefined ? '' : String(c))) : [];
}

/**
 * 从原始快照对象构建索引。导出以便单测 —— 它是纯函数，
 * 不依赖 window 与数据库插件。
 */
export function buildSnapshot(raw: Record<string, any> | null): Map<string, SheetSnapshot> {
  const out = new Map<string, SheetSnapshot>();
  if (!raw) return out;

  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('sheet_') || !value?.name) continue;
    const content: unknown[] = Array.isArray(value.content) ? value.content : [];
    const headers = toRow(content[0]);
    // content[0] 是表头，其余为数据行
    const rows = content.slice(1).map(toRow).filter((r) => r.length > 0);

    const ddl: string = value?.sourceData?.ddl ?? '';
    out.set(key, {
      key,
      name: String(value.name),
      table: parseTableName(ddl),
      headers,
      rows,
      enums: parseEnums(ddl),
    });
  }
  return out;
}

/** 取快照。首次调用或失效后重新拉取，其余走缓存。 */
export function getSnapshot(): Map<string, SheetSnapshot> {
  if (cache) return cache;
  cache = buildSnapshot(readSnapshot());
  return cache;
}

/**
 * 使缓存失效。表格更新回调触发时调用 —— 快照是值拷贝，
 * 插件那边改了数据我们这份不会自动更新。
 */
export function invalidate(): void {
  cache = null;
}

export function getSheet(key: string): SheetSnapshot | undefined {
  return getSnapshot().get(key);
}

/** 按展示名查表，支持多个候选名（兼容模板改名） */
export function findSheetByName(names: readonly string[]): SheetSnapshot | undefined {
  for (const sheet of getSnapshot().values()) {
    if (names.includes(sheet.name)) return sheet;
  }
  return undefined;
}

/** 列的下标。找不到返回 -1。 */
export function colIndex(sheet: SheetSnapshot, label: string): number {
  return sheet.headers.indexOf(label);
}

/** 按列名取值，列不存在时返回空串而不是抛错 */
export function cell(sheet: SheetSnapshot, row: string[], label: string): string {
  const i = colIndex(sheet, label);
  return i < 0 ? '' : (row[i] ?? '');
}
