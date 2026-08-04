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
  querySql?: (sql: string, params?: unknown[]) => SqlQueryResult | null;
  queryTableRows?: (options: Record<string, unknown>) => SqlQueryResult | null;
  executeSqlBatch?: (options: {
    sql: string;
    targetSheetKeys?: string[];
    silent?: boolean;
  }) => Promise<SqlBatchResult>;
  getLastSqlApiError?: () => SqlApiError | null;
  refreshDataAndWorldbook?: () => Promise<boolean>;
  registerTableUpdateCallback?: (cb: (data: unknown) => void) => void;
  unregisterTableUpdateCallback?: (cb: (data: unknown) => void) => void;
  importTemplateFromData?: (
    data: unknown,
    options?: { scope?: 'global' | 'chat'; presetName?: string },
  ) => Promise<{ success: boolean; message: string }>;
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

/** 导入表格模板（仅作用于当前聊天，不污染用户全局模板库） */
export async function importTemplate(
  data: unknown,
  presetName: string,
): Promise<{ success: boolean; message: string }> {
  const api = resolveApi();
  if (!api || typeof api.importTemplateFromData !== 'function') {
    return { success: false, message: '数据库未就绪' };
  }
  try {
    return await api.importTemplateFromData(data, { scope: 'chat', presetName });
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }
}
