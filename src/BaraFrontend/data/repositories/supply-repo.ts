/**
 * 物资 —— 物品与装备的列表读写（1.11）。
 *
 * 1.1 的仪表盘只显示两个计数。计数看得出「有没有」，看不出「有什么」，
 * 更没法改；把列表摊开是行级操作（加行/删行/改字段）的前提。
 *
 * 两张表结构不同（物品有「数量」，装备有「状态」），但对面板而言形态一致：
 * 一个名称、一个持有人、其余列按表头顺序展开。所以这里不为两者各写一份
 * 读取，只在规格与名称列上分开。
 */
import { cell, resolveSheet, type SheetSnapshot } from '../snapshot-repo';
import { ITEMS, EQUIPMENT, type SheetSpec } from '../../domain/sheet-binding';
import { replaceUserPlaceholders } from '../persona';
import { addRow, removeRow, writeCell, type EditOutcome } from './cell-editor';

export interface SupplyRow {
  /** 数据库行号，0 为表头 */
  rowIndex: number;
  /** 名称列的值，卡片标题用 */
  name: string;
  /** 除名称外的列：展示名 → 值。空值也保留，编辑时要能给它填上 */
  cells: Record<string, string>;
}

export interface SupplyList {
  /** 表认不认得出。认不出时面板整块隐藏，而不是显示一个空列表 */
  available: boolean;
  sheetName: string;
  /** 名称列的展示名 */
  nameColumn: string;
  /** 除 row_id 外的全部列，顺序即表头顺序 */
  columns: string[];
  rows: SupplyRow[];
}

export type SupplyKind = 'items' | 'equipment';

const SPECS: Record<SupplyKind, SheetSpec> = { items: ITEMS, equipment: EQUIPMENT };

const EMPTY: SupplyList = {
  available: false, sheetName: '', nameColumn: '', columns: [], rows: [],
};

/**
 * 名称列 = 第一个非 row_id 列。
 *
 * 不写死「物品名称」/「装备名称」—— 别家模板叫「名称」「道具名」的都有，
 * 而两张表的第一列恒为名称，这个规律比列名可靠。
 */
function nameColumnOf(sheet: SheetSnapshot): string {
  return sheet.headers.find((h) => h !== 'row_id') ?? '';
}

export function readSupplies(kind: SupplyKind): SupplyList {
  const sheet = resolveSheet(SPECS[kind]);
  if (!sheet) return EMPTY;

  const nameColumn = nameColumnOf(sheet);
  if (!nameColumn) return EMPTY;

  const columns = sheet.headers.filter((h) => h !== 'row_id' && h !== nameColumn);

  return {
    available: true,
    sheetName: sheet.name,
    nameColumn,
    columns,
    rows: sheet.rows.map((row, i) => ({
      // 快照的 rows 已去掉表头，+1 还原成数据库口径
      rowIndex: i + 1,
      name: replaceUserPlaceholders(cell(sheet, row, nameColumn)),
      cells: Object.fromEntries(
        columns.map((c) => [c, replaceUserPlaceholders(cell(sheet, row, c))]),
      ),
    })),
  };
}

/** 改一个字段 */
export function setSupplyCell(
  list: SupplyList,
  rowIndex: number,
  column: string,
  value: string,
): Promise<EditOutcome> {
  return writeCell({ sheetName: list.sheetName, rowIndex, column }, value);
}

/**
 * 加一件物资。只要一个名字 —— 其余字段留空，由用户随后逐个填。
 *
 * 要求名字非空：没有名字的行在列表里是一条点不着的空白，
 * 而它已经落库了，用户只能去表格坞里找出来删掉。
 */
export function addSupply(list: SupplyList, name: string): Promise<EditOutcome> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.resolve({ ok: false, message: '名称不能为空' });
  return addRow(list.sheetName, { [list.nameColumn]: trimmed });
}

/** 删一件物资。不可撤销，调用方必须先确认。 */
export function removeSupply(list: SupplyList, rowIndex: number): Promise<EditOutcome> {
  return removeRow(list.sheetName, rowIndex);
}
