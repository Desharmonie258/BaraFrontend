/**
 * 通用表格仓储 —— 任意模板表的读写。
 *
 * 分层纪律（§8.2）：只有本层可以调 db-gateway。上层拿到的是
 * 已经整理好的 ViewModel，不接触 SQL 也不接触原始二维数组。
 */
import { querySql, executeBatch, refresh, type WriteFailure } from '../db-gateway';
import { buildSelect, buildUpdate, batch } from '../sql-builder';
import type { SheetSchema } from '../../stores/schema-store';

export interface TableRow {
  /** 主键 row_id，写回时定位用 */
  rowId: number | null;
  /** 列名（中文展示名）→ 值 */
  cells: Record<string, unknown>;
}

export interface TablePage {
  rows: TableRow[];
  total: number;
}

/**
 * 读取一页数据。
 *
 * 用 DDL 中的英文列名查询，返回时映射回中文展示名 —— 上层只认展示名。
 * §2.2 提到只读 SQL 支持展示名，但写入路径不支持，为保持读写一致
 * 这里统一用物理列名。
 */
export function readPage(
  schema: SheetSchema,
  limit: number,
  offset: number,
): TablePage | null {
  if (!schema.table || schema.columns.length === 0) return null;

  const physical = schema.columns.map((c) => c.db).filter(Boolean);
  if (physical.length === 0) return null;

  let sql: string;
  try {
    sql = buildSelect({ table: schema.table, columns: physical, limit, offset });
  } catch (e) {
    console.warn('[蔷薇前端] 构造查询失败', e);
    return null;
  }

  const res = querySql(sql);
  if (!res?.rows) return null;

  const rows: TableRow[] = res.rows.map((raw) => {
    const cells: Record<string, unknown> = {};
    schema.columns.forEach((col, i) => {
      cells[col.label] = raw[i];
    });
    const idIndex = schema.columns.findIndex((c) => c.db === 'row_id');
    const rowId = idIndex >= 0 ? Number(raw[idIndex]) : null;
    return { rowId: Number.isFinite(rowId as number) ? (rowId as number) : null, cells };
  });

  const countRes = querySql(`SELECT COUNT(*) FROM ${schema.table}`);
  const total = Number(countRes?.rows?.[0]?.[0]) || rows.length;

  return { rows, total };
}

/**
 * 更新单个单元格。
 *
 * 一律以 row_id 为键 —— 它是全部模板表的主键，比按业务列定位更可靠，
 * 也天然避开了复合唯一约束下"只按名称更新会误改同名条目"的问题。
 */
export async function updateCell(
  schema: SheetSchema,
  rowId: number,
  label: string,
  value: unknown,
): Promise<{ ok: true } | { ok: false; failure: WriteFailure }> {
  const col = schema.columns.find((c) => c.label === label);
  if (!col?.db) {
    return {
      ok: false,
      failure: { kind: 'column_unresolved', message: `找不到列: ${label}`, raw: null },
    };
  }

  let sql: string;
  try {
    sql = buildUpdate(schema.table, { [col.db]: value }, { row_id: rowId });
  } catch (e) {
    return {
      ok: false,
      failure: {
        kind: 'unknown',
        message: e instanceof Error ? e.message : String(e),
        raw: null,
      },
    };
  }

  const result = await executeBatch(batch([sql]), [schema.key]);
  if (result.ok) await refresh();
  return result;
}
