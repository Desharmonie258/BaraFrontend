/**
 * 数据库网关 —— 唯一与 SP·数据库插件通信的出口。
 *
 * 两条硬性纪律（开发文档 §2.2）：
 * 1. API 挂在顶层窗口，本脚本可能运行在 iframe 内，必须逐级回退。
 * 2. SQL 方法不是常驻的：仅在 SQLite 模式且 runtime 进入 ready 后才发布。
 *    聊天切换、数据库重载期间为 undefined，因此每次调用前都要检查，
 *    不得缓存函数引用。
 */

export interface SqlQueryResult {
  rows: unknown[][];
  columns?: string[];
}

export interface SqlBatchResult {
  success: boolean;
  errors?: string[];
  changes?: number;
}

export interface SqlApiError {
  method: string;
  code: string;
  message: string;
  at?: number;
}

/** 写入失败的分类，对应开发文档 §10.2 */
export type WriteFailureKind =
  | 'runtime_not_ready'
  | 'alias_conflict'
  | 'table_missing'
  | 'column_unresolved'
  | 'readonly_violation'
  | 'unknown';

export interface WriteFailure {
  kind: WriteFailureKind;
  message: string;
  raw?: SqlApiError | null;
}

interface DbApi {
  // ── 读：只读快照。本项目的唯一读取入口（见 snapshot-repo）──
  getCurrentData?: () => unknown;
  exportTableAsJson?: () => unknown;

  // ── 写：CRUD。数据库本体把只读快照与写入分成两套接口 ──
  updateCell?: (
    tableName: string,
    rowIndex: number,
    colIdentifier: string | number,
    value: unknown,
  ) => Promise<boolean>;
  insertRow?: (tableName: string, data: Record<string, unknown>) => Promise<number>;
  deleteRow?: (tableName: string, rowIndex: number) => Promise<boolean>;

  refreshDataAndWorldbook?: () => Promise<boolean>;
  registerTableUpdateCallback?: (cb: (data: unknown) => void) => void;
  unregisterTableUpdateCallback?: (cb: (data: unknown) => void) => void;
  getTableTemplate?: () => unknown;
  importTemplateFromData?: (
    data: unknown,
    options?: { scope?: 'global' | 'chat'; presetName?: string },
  ) => Promise<{ success: boolean; message: string }>;

  // ── SQL：本项目不再使用，仅保留类型以便将来需要时可用 ──
  querySql?: (sql: string, params?: unknown[]) => SqlQueryResult | null;
  queryTableRows?: (options: Record<string, unknown>) => SqlQueryResult | null;
  executeSqlBatch?: (options: {
    sql: string;
    targetSheetKeys?: string[];
    silent?: boolean;
  }) => Promise<SqlBatchResult>;
  getLastSqlApiError?: () => SqlApiError | null;
}

/** 逐级回退查找 API 宿主。每次调用都重新探测，不缓存。 */
function resolveApi(): DbApi | null {
  const candidates: Array<() => unknown> = [
    () => (window as any).top?.AutoCardUpdaterAPI,
    () => (window as any).parent?.AutoCardUpdaterAPI,
    () => (window as any).AutoCardUpdaterAPI,
  ];
  for (const get of candidates) {
    try {
      const api = get();
      if (api) return api as DbApi;
    } catch {
      // 跨域访问 top/parent 会抛异常，忽略并继续回退
    }
  }
  return null;
}

/** SQL 只读 + 批写接口是否已发布 */
export function isSqlReady(): boolean {
  const api = resolveApi();
  return !!(
    api &&
    typeof api.querySql === 'function' &&
    typeof api.executeSqlBatch === 'function'
  );
}

/** 数据库插件本身是否存在（不代表 SQL 可用） */
export function isDbPresent(): boolean {
  return resolveApi() !== null;
}

function classify(err: SqlApiError | null): WriteFailureKind {
  if (!err) return 'unknown';
  const code = (err.code || '').toLowerCase();
  if (code.includes('alias')) return 'alias_conflict';
  if (code.includes('table')) return 'table_missing';
  if (code.includes('column')) return 'column_unresolved';
  if (code.includes('readonly') || code.includes('read_only')) return 'readonly_violation';
  if (code.includes('not_ready')) return 'runtime_not_ready';
  return 'unknown';
}

/**
 * 读取最近一次只读失败的分类信息。
 * 现有三个状态栏脚本都没调用这个接口，失败时只能拿到 null，丢失诊断能力。
 */
export function lastError(): SqlApiError | null {
  const api = resolveApi();
  try {
    return api?.getLastSqlApiError?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * 读取只读快照 —— 本项目的读取入口。
 *
 * 优先 `getCurrentData()`，缺失时回退 `exportTableAsJson()`。数据库本体
 * 当前把只读快照暴露在后者，但前者是更明确的语义，两个都探测更稳。
 *
 * 快照不依赖 SQLite 模式与 runtime ready —— 这正是不走 SQL 的主要原因。
 */
export function readSnapshot(): Record<string, any> | null {
  const api = resolveApi();
  if (!api) return null;
  for (const fn of [api.getCurrentData, api.exportTableAsJson]) {
    if (typeof fn !== 'function') continue;
    try {
      const data = fn.call(api);
      if (data && typeof data === 'object') return data as Record<string, any>;
    } catch (e) {
      console.warn('[蔷薇前端] 读取表格快照失败', e);
    }
  }
  return null;
}

/** 快照读取能力是否可用 */
export function canRead(): boolean {
  const api = resolveApi();
  return !!(
    api &&
    (typeof api.getCurrentData === 'function' || typeof api.exportTableAsJson === 'function')
  );
}

/** CRUD 写入能力是否可用 */
export function canWrite(): boolean {
  const api = resolveApi();
  return !!(
    api &&
    typeof api.updateCell === 'function' &&
    typeof api.insertRow === 'function' &&
    typeof api.deleteRow === 'function'
  );
}

/**
 * 更新单元格。
 *
 * 行号沿用数据库本体的口径：**0 为表头，1 为第一行数据**。
 * 列用展示名（中文表头），不是 DDL 的物理列名。
 */
export async function updateCell(
  tableName: string,
  rowIndex: number,
  columnLabel: string,
  value: unknown,
): Promise<{ ok: true } | { ok: false; failure: WriteFailure }> {
  const api = resolveApi();
  if (!api || typeof api.updateCell !== 'function') {
    return { ok: false, failure: { kind: 'runtime_not_ready', message: '数据库写入接口不可用', raw: null } };
  }
  try {
    const ok = await api.updateCell(tableName, rowIndex, columnLabel, value);
    if (ok) return { ok: true };
    return { ok: false, failure: { kind: 'unknown', message: '写入被拒绝', raw: lastError() } };
  } catch (e) {
    return {
      ok: false,
      failure: {
        kind: 'unknown',
        message: e instanceof Error ? e.message : String(e),
        raw: lastError(),
      },
    };
  }
}

/** 表尾追加一行。data 的键是展示名。成功返回新行号，失败返回 -1。 */
export async function insertRow(
  tableName: string,
  data: Record<string, unknown>,
): Promise<number> {
  const api = resolveApi();
  if (!api || typeof api.insertRow !== 'function') return -1;
  try {
    return await api.insertRow(tableName, data);
  } catch (e) {
    console.warn('[蔷薇前端] 插入行失败', e);
    return -1;
  }
}

/** 删除行。rowIndex 为 0（表头）时会被拒绝。 */
export async function deleteRow(tableName: string, rowIndex: number): Promise<boolean> {
  const api = resolveApi();
  if (!api || typeof api.deleteRow !== 'function') return false;
  try {
    return await api.deleteRow(tableName, rowIndex);
  } catch (e) {
    console.warn('[蔷薇前端] 删除行失败', e);
    return false;
  }
}

/** 取当前生效的表格模板 */
export function getTableTemplate(): Record<string, any> | null {
  const api = resolveApi();
  if (!api || typeof api.getTableTemplate !== 'function') return null;
  try {
    const tpl = api.getTableTemplate();
    return tpl && typeof tpl === 'object' ? (tpl as Record<string, any>) : null;
  } catch (e) {
    console.warn('[蔷薇前端] 读取表格模板失败', e);
    return null;
  }
}

/**
 * 写回表格模板。
 *
 * **这是本项目风险最高的写操作** —— 单元格写坏只影响一格，模板写坏整套
 * 表结构都要重导。因此：
 * - 只接受对象形态的模板，其余一律拒绝而非「尽力而为」；
 * - 默认 `scope: 'chat'`，只改当前聊天的模板副本，不动全局模板 ——
 *   不同聊天可以用不同规则族；
 * - 结果如实返回，不把失败吞成成功。
 *
 * 用法参照骰子系统 `updateTemplateForActivePreset` 的写回段。
 */
export async function importTemplate(
  template: Record<string, any>,
  options: { scope?: 'global' | 'chat'; presetName?: string } = {},
): Promise<{ success: boolean; message: string }> {
  const api = resolveApi();
  if (!api || typeof api.importTemplateFromData !== 'function') {
    return { success: false, message: 'importTemplateFromData 不可用' };
  }
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    return { success: false, message: '模板不是对象形态，拒绝写入' };
  }
  try {
    const res = await api.importTemplateFromData(template, { scope: 'chat', ...options });
    return {
      success: !!res?.success,
      message: String(res?.message ?? ''),
    };
  } catch (e) {
    console.warn('[蔷薇前端] 写回表格模板失败', e);
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 把查询结果统一成「按请求列顺序排列的二维数组」。
 *
 * 上游返回的行可能是位置数组，也可能是按列名键控的对象 —— 两种形态
 * 都出现过，且没有文档承诺。直接按下标取值在对象形态下会全取到
 * undefined，表现为「行数对但每格都空」，很难一眼看出。
 *
 * 因此所有读取路径都必须经过本函数，不要自己解 res.rows。
 */
export function toMatrix(
  res: SqlQueryResult | null,
  columns: string[],
): unknown[][] {
  if (!res?.rows || !Array.isArray(res.rows)) return [];
  return res.rows.map((row) => {
    if (Array.isArray(row)) return row;
    if (row && typeof row === 'object') {
      const obj = row as Record<string, unknown>;
      // 优先按请求的列名取；列名对不上时回退到对象自身的值顺序
      const byName = columns.map((c) => obj[c]);
      return byName.some((v) => v !== undefined) ? byName : Object.values(obj);
    }
    return [row];
  });
}

/** 取单个标量结果（COUNT 一类） */
export function scalar(res: SqlQueryResult | null): unknown {
  const m = toMatrix(res, []);
  return m.length > 0 ? m[0][0] : undefined;
}

/** 自由只读查询。runtime 未就绪或失败时返回 null。 */
export function querySql(sql: string, params?: unknown[]): SqlQueryResult | null {
  const api = resolveApi();
  if (!api || typeof api.querySql !== 'function') return null;
  try {
    return api.querySql(sql, params) ?? null;
  } catch {
    return null;
  }
}

/** 结构化只读查询。 */
export function queryTableRows(options: Record<string, unknown>): SqlQueryResult | null {
  const api = resolveApi();
  if (!api || typeof api.queryTableRows !== 'function') return null;
  try {
    return api.queryTableRows(options) ?? null;
  } catch {
    return null;
  }
}

/**
 * 批量写入。这是主力写接口。
 *
 * 注意：executeSqlBatch 在官方 API 文档的目录与版本历史中均无记录，
 * 仅在正文段落被顺带提及，因此不受上游公开 API 兼容承诺保护。
 * 全部写入集中在此函数，签名若变更只需改这一处。
 */
export async function executeBatch(
  sql: string,
  targetSheetKeys?: string[],
  silent = true,
): Promise<{ ok: true } | { ok: false; failure: WriteFailure }> {
  const api = resolveApi();
  if (!api || typeof api.executeSqlBatch !== 'function') {
    return {
      ok: false,
      failure: {
        kind: 'runtime_not_ready',
        message: '数据库未就绪，请稍后重试',
        raw: null,
      },
    };
  }
  try {
    const result = await api.executeSqlBatch({ sql, targetSheetKeys, silent });
    if (result?.success) return { ok: true };
    const raw = lastError();
    return {
      ok: false,
      failure: {
        kind: classify(raw),
        message: result?.errors?.join('; ') || raw?.message || '写入失败',
        raw,
      },
    };
  } catch (e) {
    const raw = lastError();
    return {
      ok: false,
      failure: {
        kind: classify(raw),
        message: e instanceof Error ? e.message : String(e),
        raw,
      },
    };
  }
}

/** 写入后刷新数据与世界书 */
export async function refresh(): Promise<boolean> {
  const api = resolveApi();
  if (!api || typeof api.refreshDataAndWorldbook !== 'function') return false;
  try {
    return await api.refreshDataAndWorldbook();
  } catch {
    return false;
  }
}

/** 订阅表格更新。返回取消订阅函数。 */
export function onTableUpdate(cb: (data: unknown) => void): () => void {
  const api = resolveApi();
  if (!api || typeof api.registerTableUpdateCallback !== 'function') {
    return () => {};
  }
  api.registerTableUpdateCallback(cb);
  return () => {
    try {
      resolveApi()?.unregisterTableUpdateCallback?.(cb);
    } catch {
      // 宿主已卸载，忽略
    }
  };
}

