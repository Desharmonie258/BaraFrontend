/**
 * 模板结构：表清单、列元信息与行数徽标。
 *
 * 三条要求：
 * 1. 表清单运行时枚举，不硬编码（§8.9c）。
 * 2. 行数徽标走**单次聚合查询** —— 20 张表逐次往返会造成明显卡顿。
 * 3. 列元信息同时保留中文展示名与物理列名 —— 展示用前者，
 *    SQL 用后者（§2.2 的标识符对应关系）。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { querySql, isSqlReady } from '../data/db-gateway';

export interface ColumnMeta {
  /** 中文展示名，来自 content[0] 表头 */
  label: string;
  /** 物理列名，来自 DDL */
  db: string;
}

export interface SheetSchema {
  key: string;
  name: string;
  table: string;
  columns: ColumnMeta[];
  rowCount: number;
}

/**
 * 从 DDL 提取 (物理列名, 中文注释) 序列。
 *
 * 模板约定每列写作 `  col_name TYPE ..., -- 中文名`（§3.2b），
 * 因此按行匹配即可。表级约束行（UNIQUE / CHECK）没有注释，会被跳过。
 */
function parseDdlColumns(ddl: string): ColumnMeta[] {
  const out: ColumnMeta[] = [];
  for (const line of ddl.split('\n')) {
    const m = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s+[^-]*?--\s*(.+?)\s*$/.exec(line);
    if (m) out.push({ db: m[1], label: m[2] });
  }
  return out;
}

/**
 * 合并 DDL 与表头。
 *
 * 以 DDL 为准 —— 它是 SQL 的事实来源。表头仅用于校正展示名：
 * 两者顺序一致时按位置对齐，不一致时保留 DDL 的注释名并告警。
 */
function mergeColumns(ddl: string, headers: unknown): ColumnMeta[] {
  const fromDdl = parseDdlColumns(ddl);
  if (!Array.isArray(headers) || headers.length === 0) return fromDdl;

  if (headers.length !== fromDdl.length) {
    console.warn(
      `[蔷薇前端] 表头(${headers.length}) 与 DDL 列数(${fromDdl.length}) 不一致，以 DDL 为准`,
    );
    return fromDdl;
  }
  return fromDdl.map((c, i) => ({ db: c.db, label: String(headers[i] ?? c.label) }));
}

/** 从模板 JSON 枚举 sheet */
export function enumerateSheets(template: Record<string, any> | null): SheetSchema[] {
  if (!template) return [];
  const out: SheetSchema[] = [];
  for (const [key, value] of Object.entries(template)) {
    if (!key.startsWith('sheet_') || !value?.name) continue;
    const ddl: string = value?.sourceData?.ddl ?? '';
    const table = /CREATE TABLE\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(ddl)?.[1] ?? '';
    out.push({
      key,
      name: String(value.name),
      table,
      columns: mergeColumns(ddl, value?.content?.[0]),
      rowCount: 0,
    });
  }
  return out;
}

export const useSchemaStore = defineStore('schema', () => {
  const sheets = ref<SheetSchema[]>([]);
  const loaded = ref(false);

  function setTemplate(template: Record<string, any> | null): void {
    sheets.value = enumerateSheets(template);
    loaded.value = true;
  }

  function get(key: string): SheetSchema | undefined {
    return sheets.value.find((s) => s.key === key);
  }

  /** 单次聚合查询取全部表行数，不逐表往返 */
  function refreshCounts(): void {
    if (!isSqlReady() || sheets.value.length === 0) return;
    const parts = sheets.value
      .filter((s) => s.table)
      .map((s) => `SELECT '${s.key}' AS k, COUNT(*) AS n FROM ${s.table}`);
    if (parts.length === 0) return;

    const res = querySql(parts.join(' UNION ALL '));
    if (!res?.rows) return;

    const counts = new Map<string, number>();
    for (const row of res.rows) counts.set(String(row[0]), Number(row[1]) || 0);

    sheets.value = sheets.value.map((s) => ({
      ...s,
      rowCount: counts.get(s.key) ?? s.rowCount,
    }));
  }

  return { sheets, loaded, setTemplate, get, refreshCounts };
});
