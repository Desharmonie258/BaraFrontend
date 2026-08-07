/**
 * 通用表格仓储 —— 任意表的读写。
 *
 * 读走快照（二维数组），写走 CRUD。不使用 SQL：见 snapshot-repo 的说明。
 *
 * 分层纪律（§8.2）：只有本层可以调 db-gateway 与 snapshot-repo。
 * 上层拿到的是整理好的 ViewModel，不接触原始数组。
 */
import { updateCell as apiUpdateCell, deleteRow as apiDeleteRow, refresh, type WriteFailure } from '../db-gateway';
import { getSheet, invalidate, type SheetSnapshot } from '../snapshot-repo';

export interface TableRow {
  /**
   * 数据库本体的行号口径：0 为表头，1 为第一行数据。
   * 写回时直接用它定位，不需要再找主键。
   */
  rowIndex: number;
  /** 列展示名 → 值 */
  cells: Record<string, string>;
}

export interface TablePage {
  headers: string[];
  rows: TableRow[];
  total: number;
}

/** 读取一页。offset/limit 针对数据行，不含表头。 */
export function readPage(sheetKey: string, limit: number, offset = 0): TablePage | null {
  const sheet = getSheet(sheetKey);
  if (!sheet) return null;

  const slice = sheet.rows.slice(offset, offset + limit);
  const rows: TableRow[] = slice.map((raw, i) => {
    const cells: Record<string, string> = {};
    sheet.headers.forEach((label, col) => {
      cells[label] = raw[col] ?? '';
    });
    // +1 跳过表头，+offset 还原到全表位置
    return { rowIndex: offset + i + 1, cells };
  });

  return { headers: sheet.headers, rows, total: sheet.rows.length };
}

/** 整表读取，用于行数不多的表 */
export function readAll(sheetKey: string): TablePage | null {
  const sheet = getSheet(sheetKey);
  return sheet ? readPage(sheetKey, sheet.rows.length, 0) : null;
}

/**
 * 更新单元格。
 *
 * 用**表名 + 行号 + 列展示名**定位，这是数据库本体 CRUD 接口的口径 ——
 * 不需要自己拼 SQL，也就不存在复合唯一约束下误改同名条目的问题。
 */
export async function updateCell(
  sheet: SheetSnapshot,
  rowIndex: number,
  columnLabel: string,
  value: unknown,
): Promise<{ ok: true } | { ok: false; failure: WriteFailure }> {
  if (!sheet.headers.includes(columnLabel)) {
    return {
      ok: false,
      failure: { kind: 'column_unresolved', message: `找不到列: ${columnLabel}`, raw: null },
    };
  }
  const result = await apiUpdateCell(sheet.name, rowIndex, columnLabel, value);
  if (result.ok) {
    // 快照是值拷贝，写入后必须失效，否则界面仍显示旧值
    invalidate();
    await refresh();
  }
  return result;
}

export async function deleteRow(sheet: SheetSnapshot, rowIndex: number): Promise<boolean> {
  if (rowIndex <= 0) return false; // 0 是表头
  const ok = await apiDeleteRow(sheet.name, rowIndex);
  if (ok) {
    invalidate();
    await refresh();
  }
  return ok;
}
