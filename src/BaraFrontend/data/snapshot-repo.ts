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
import { checkSheet, type SheetIssueKind } from '../domain/sheet-health';
import { matchSheets, type SheetSpec, type MatchVia } from '../domain/sheet-binding';

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

/**
 * 按展示名查**全部**命中的表，保持模板定义的顺序。
 *
 * 有些模板把同一类内容拆成并列的多张表 —— 例如 YO 与瑟瑟灵感系同时有
 * 「恋爱对象表」与「重要角色表」，两者定位相同，都是值得单独建档的角色。
 * 这种情况下 `findSheetByName` 只取到其中一张，另一张的角色会整个消失，
 * 而且取到哪张取决于快照的枚举顺序 —— 是一种很难察觉的数据缺失。
 */
export function findSheetsByName(names: readonly string[]): SheetSnapshot[] {
  return [...getSnapshot().values()].filter((sheet) => names.includes(sheet.name));
}

export interface ResolvedSheet {
  sheet: SheetSnapshot;
  /** 靠哪条通道认出来的，供诊断面板说明「这张表是推测的」 */
  via: MatchVia;
}

/**
 * 仪表盘预设的兜底识别（1.11）。
 *
 * 注册点而非直接依赖：预设存在酒馆变量里，由 presentation 层管理，
 * 而 snapshot-repo 是纯数据层，不该反过来依赖它。
 *
 * **只在内置三通道全不中时才调**。内置绑定经过十份真实模板的回归测试，
 * 用户手填的关键词不该有机会盖过它 —— 那等于把验证过的规则换成猜的。
 */
type PresetFallback = (spec: SheetSpec, all: readonly SheetSnapshot[]) => SheetSnapshot[];
let presetFallback: PresetFallback | null = null;

export function setPresetFallback(fn: PresetFallback | null): void {
  presetFallback = fn;
}

/**
 * 按识别规格查表，走 key / 展示名 / 列名指纹三条通道（见 domain/sheet-binding）。
 *
 * 这是比 findSheetsByName 更全的入口：只按展示名匹配，会漏掉重制过 key
 * 但改了表名的模板，也漏掉两者都不符、只能靠列结构辨认的自定义表。
 */
export function resolveSheets(spec: SheetSpec): ResolvedSheet[] {
  const all = [...getSnapshot().values()];
  const byKey = new Map(all.map((s) => [s.key, s]));
  const built = matchSheets(spec, all).flatMap((m) => {
    const sheet = byKey.get(m.key);
    return sheet ? [{ sheet, via: m.via }] : [];
  });
  if (built.length > 0 || !presetFallback) return built;

  /*
   * 内置三通道全不中，交给预设。标为 fingerprint 通道 ——
   * 它与指纹同性质：**推测**，诊断面板会据此标注「推测」，
   * 万一认错了，那行标注是用户唯一的线索。
   */
  try {
    return presetFallback(spec, all).map((sheet) => ({ sheet, via: 'fingerprint' as MatchVia }));
  } catch (e) {
    console.warn('[蔷薇前端] 仪表盘预设匹配失败', e);
    return [];
  }
}

/** 取符合规格的第一张表。用于本就唯一的表（主角信息等）。 */
export function resolveSheet(spec: SheetSpec): SheetSnapshot | undefined {
  return resolveSheets(spec)[0]?.sheet;
}

export interface BindingReport {
  /** 能力标识，与 domain/sheet-binding 里各 spec 的 id 一致 */
  id: string;
  matched: Array<{ name: string; via: MatchVia }>;
}

/**
 * 各项能力认到了哪些表、是怎么认出来的。
 *
 * 供设置面板的「模板适配情况」展示 —— 用户能据此回答「为什么我这里
 * 没有资源条」，而不必猜是坏了还是不支持。指纹命中要标注出来：
 * 那是推测，可能推错。
 */
export function describeBindings(specs: readonly SheetSpec[]): BindingReport[] {
  return specs.map((spec) => ({
    id: spec.id,
    matched: resolveSheets(spec).map(({ sheet, via }) => ({ name: sheet.name, via })),
  }));
}

export interface SheetDigest {
  key: string;
  name: string;
  /** 物理表名，来自 DDL */
  table: string;
  rows: number;
  /** 结构判定结果，见 domain/sheet-health */
  health: SheetIssueKind;
  /** 除 row_id 外的列名，完整列出 —— 排查失配时这是最关键的一手信息 */
  columns: string[];
  /** 解析出候选值的枚举列数 */
  enums: number;
}

/**
 * 表清单摘要 —— 供 `BaraFrontend.diagnose()` 输出。
 *
 * 「换了模板后表格显示不出来」这类报告，光看截图要反复推断多轮才能定位，
 * 而真正需要的信息只有「有哪些表、每张表的列叫什么」。把它做成一句话
 * 就能拿到的东西，远程排查的成本从几个来回降到一次。
 */
export function describeSheets(): SheetDigest[] {
  return [...getSnapshot().values()].map((s) => ({
    key: s.key,
    name: s.name,
    table: s.table,
    rows: s.rows.length,
    health: checkSheet(s.headers).kind,
    columns: s.headers.filter((h) => h !== 'row_id'),
    enums: Object.keys(s.enums).length,
  }));
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
