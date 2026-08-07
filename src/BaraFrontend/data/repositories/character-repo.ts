/**
 * 角色仓储 —— 主角与重要角色的读取。
 *
 * 读走快照（见 snapshot-repo），不走 SQL。
 *
 * 表与列都按**展示名**定位，并对模板改名做兼容：用户可能用自己改过的
 * 模板，写死物理表名或物理列名必然失配。
 */
import { resolveSheet, resolveSheets, findSheetByName, cell, type SheetSnapshot } from '../snapshot-repo';
import { CHARACTERS, PROTAGONIST, ITEMS, EQUIPMENT } from '../../domain/sheet-binding';
import { parse, type AttributeEntry } from '../../domain/attribute-codec';
import { resolveUserName, replaceUserPlaceholders } from '../persona';

const COL = {
  name: '姓名',
  aliases: '别称',
  identity: '身份',
  base: '基础属性',
  special: '特有属性',
  location: '所在地点',
  presence: '在场状态',
  track: '跟踪状态',
} as const;

export interface CharacterVM {
  /** 行号，0 为表头、1 为第一行数据。写回时定位用。 */
  rowIndex: number;
  /** 所属表的展示名，写回时需要 */
  sheetName: string;
  name: string;
  aliases: string;
  identity: string;
  location: string;
  /** 主角恒为 true */
  present: boolean;
  trackStatus: string;
  baseAttrs: AttributeEntry[];
  specialAttrs: AttributeEntry[];
  isProtagonist: boolean;
}

function toVM(
  sheet: SheetSnapshot,
  row: string[],
  rowIndex: number,
  isProtagonist: boolean,
): CharacterVM {
  return {
    rowIndex,
    sheetName: sheet.name,
    /*
     * 主角名不能信表里的值：模板注入提示词时不展开 {{user}} 宏，
     * AI 会把字面量写进姓名列。改由 persona 解析（见 data/persona.ts）。
     * 重要角色的名字是 AI 依剧情写的真名，不做替换。
     */
    name: isProtagonist
      ? resolveUserName(cell(sheet, row, COL.name))
      : cell(sheet, row, COL.name),
    aliases: cell(sheet, row, COL.aliases),
    // 身份、地点等长文本里可能内嵌占位符，逐个替换而非整体替换
    identity: replaceUserPlaceholders(cell(sheet, row, COL.identity)),
    location: replaceUserPlaceholders(cell(sheet, row, COL.location)),
    present: isProtagonist ? true : cell(sheet, row, COL.presence) === '在场',
    trackStatus: cell(sheet, row, COL.track),
    baseAttrs: parse(cell(sheet, row, COL.base)),
    specialAttrs: parse(cell(sheet, row, COL.special)),
    isProtagonist,
  };
}

export function readProtagonist(): CharacterVM | null {
  const sheet = resolveSheet(PROTAGONIST);
  if (!sheet || sheet.rows.length === 0) return null;
  return toVM(sheet, sheet.rows[0], 1, true);
}

/**
 * 玩家角色名，供不依赖主角信息表的场景使用（如判断关系表的哪一方是玩家）。
 * 优先 persona，其次主角信息表里已写好的真名。
 */
export function readUserName(): string {
  const sheet = resolveSheet(PROTAGONIST);
  const inTable = sheet?.rows.length ? cell(sheet, sheet.rows[0], COL.name) : '';
  return resolveUserName(inTable);
}

export function readTrackedCharacters(): CharacterVM[] {
  // 多张角色表并存时全部读取，顺序随模板定义（见 domain/sheet-binding 的 CHARACTERS）
  return resolveSheets(CHARACTERS).flatMap(({ sheet }) =>
    sheet.rows
      // rowIndex 从 1 起：0 是表头。行号是**表内**的，写回时配合 sheetName 定位
      .map((row, i) => toVM(sheet, row, i + 1, false))
      .filter((c) => c.name !== ''),
  );
}

/**
 * 各模块依赖的表在当前模板里存不存在。
 *
 * **表不存在**与**表里没数据**必须分开：后者是动态的，隐藏面板会让布局
 * 随数据增减跳动；前者在一份模板下是恒定的 —— 小剧场3.3 这类模板压根
 * 没有角色概念，那个面板永远不会有内容，留着只是一块空壳。
 */
export interface CharacterCapabilities {
  protagonist: boolean;
  characters: boolean;
  supplies: boolean;
}

export function readCapabilities(): CharacterCapabilities {
  return {
    protagonist: !!resolveSheet(PROTAGONIST),
    characters: resolveSheets(CHARACTERS).length > 0,
    supplies: !!resolveSheet(ITEMS) || !!resolveSheet(EQUIPMENT),
  };
}

export interface SupplyCounts {
  items: number;
  equipment: number;
}

/** 物资计数直接取快照行数，不需要 COUNT 查询 */
export function readSupplyCounts(): SupplyCounts {
  return {
    items: resolveSheet(ITEMS)?.rows.length ?? 0,
    equipment: resolveSheet(EQUIPMENT)?.rows.length ?? 0,
  };
}
