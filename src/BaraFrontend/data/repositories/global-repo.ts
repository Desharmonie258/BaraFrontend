/**
 * 全局状态 —— 当前时间与所在地点（1.11）。
 *
 * 这张表**只有一行**（模板 note 里写死「本表唯一且仅一行」），所以这里
 * 一律读第一行、写第一行。行数多于一行时也只认第一行：多出来的行是
 * AI 违反 note 插的，把它们显示出来会让人以为有两个「当前时间」。
 *
 * 列按展示名取，取不到就是这份模板没有这个概念 —— 字段级缺失不影响
 * 其余字段，面板逐字段判断有没有，而不是整块要求齐全。
 */
import { cell, resolveSheet, type SheetSnapshot } from '../snapshot-repo';
import { GLOBAL } from '../../domain/sheet-binding';
import { replaceUserPlaceholders } from '../persona';
import { writeCell, type EditOutcome } from './cell-editor';

/** 全局面板认得的字段。键是内部标识，值是列展示名候选。 */
const FIELDS = {
  time: ['当前时间'],
  location: ['当前详细地点', '当前地点', '所在地点'],
  minorRegion: ['当前次要地区'],
  majorRegion: ['当前主要地区'],
  elapsed: ['经过的时间'],
} as const;

export type GlobalField = keyof typeof FIELDS;

export interface GlobalEntry {
  field: GlobalField;
  /** 实际命中的列展示名，写回时要用它 */
  column: string;
  value: string;
}

export interface GlobalState {
  /** 表在不在。不在时面板整块不渲染，而不是显示一排空字段。 */
  available: boolean;
  sheetName: string;
  entries: GlobalEntry[];
}

const EMPTY: GlobalState = { available: false, sheetName: '', entries: [] };

/** 在表头里找出这个字段实际用的列名 */
function pickColumn(sheet: SheetSnapshot, candidates: readonly string[]): string | null {
  return candidates.find((c) => sheet.headers.includes(c)) ?? null;
}

export function readGlobalState(): GlobalState {
  const sheet = resolveSheet(GLOBAL);
  const row = sheet?.rows[0];
  if (!sheet || !row) return EMPTY;

  const entries: GlobalEntry[] = [];
  for (const [field, candidates] of Object.entries(FIELDS) as [GlobalField, readonly string[]][]) {
    const column = pickColumn(sheet, candidates);
    if (!column) continue;
    // 地点一类的长文本里可能内嵌 {{user}}，与角色卡同样处理
    entries.push({ field, column, value: replaceUserPlaceholders(cell(sheet, row, column)) });
  }

  return { available: entries.length > 0, sheetName: sheet.name, entries };
}

/**
 * 玩家此刻所在的主要/次要地区。
 *
 * 地图视图靠它决定打开时停在哪一层 —— 从世界层点两次才到脚下，
 * 而看地图九成是想看「我周围有什么」。
 */
export function currentRegions(): { major?: string; minor?: string } {
  const state = readGlobalState();
  const pick = (field: GlobalField) =>
    state.entries.find((e) => e.field === field)?.value.trim() || undefined;
  return { major: pick('majorRegion'), minor: pick('minorRegion') };
}

/**
 * 改一个全局字段。
 *
 * 行号写死 1 —— 这张表只有一行，且面板读的也是第一行。
 * 把 rowIndex 做成参数只会让调用方有机会传一个与显示不一致的行。
 */
export async function setGlobalField(column: string, value: string): Promise<EditOutcome> {
  const sheet = resolveSheet(GLOBAL);
  if (!sheet) return { ok: false, message: '这份模板里没有全局数据表' };
  return writeCell({ sheetName: sheet.name, rowIndex: 1, column }, value);
}
