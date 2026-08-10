/**
 * 角色仓储 —— 主角与重要角色的读取。
 *
 * 读走快照（见 snapshot-repo），不走 SQL。
 *
 * 表与列都按**展示名**定位，并对模板改名做兼容：用户可能用自己改过的
 * 模板，写死物理表名或物理列名必然失配。
 */
import { resolveSheet, resolveSheets, cell, type SheetSnapshot } from '../snapshot-repo';
import { CHARACTERS, PROTAGONIST, ITEMS, EQUIPMENT } from '../../domain/sheet-binding';
import { parse, type AttributeEntry } from '../../domain/attribute-codec';
import { resolveUserName, replaceUserPlaceholders } from '../persona';

/**
 * 角色表的列展示名。
 *
 * 导出是给写回路径用的（`character-editor`）—— 读用哪个名字，写就得用
 * 同一个名字，各写一份必然在某次模板改名后只改了一边。
 */
export const COL = {
  name: '姓名',
  aliases: '别称',
  identity: '身份',
  base: '基础属性',
  special: '特有属性',
  location: '所在地点',
  presence: '在场状态',
  track: '跟踪状态',
  /** 1.1 起：生命周期状态，主角恒为「永固」 */
  profile: '角色定位',
} as const;

/** 角色定位的最高保护级别。主角必为此值，玩家也可以钉住重要 NPC。 */
const PINNED = '永固';

/**
 * 在角色表里定位主角那一行，返回行内下标（0 起）。
 *
 * 1.1 把主角并入角色表之后，主角不再有数据层的显式标记 —— **它就是 persona**。
 * 三级兜底，与 doc/1.1-Gigantea-设计.md 一致：
 *
 * 1. **姓名匹配 persona 名**（含 `{{user}}` 占位符归一）—— 主路径。
 *    模板注入提示词时不展开 `{{user}}` 宏，AI 会把字面量写进姓名列，
 *    所以两侧都要过 resolveUserName 归一后再比。
 * 2. **第一个「永固」行** —— 玩家改过 persona 名、或 AI 写了别的名字时兜住。
 * 3. 都不中返回 null，由调用方降级（面板整块隐藏，而不是显示错人）。
 *
 * 第 2 级在「玩家把别的角色也设成永固」时可能取错人：可接受 ——
 * 那种情况下第 1 级通常已命中，真取错了用户一眼能看出来，
 * 而不是像空白那样无从判断。
 */
function findProtagonistIndex(sheet: SheetSnapshot): number | null {
  const me = resolveUserName('');
  if (me) {
    /*
     * 姓名为空的行必须先排掉：resolveUserName('') 返回的是兜底文案「主角」，
     * 而取不到 persona 时 me 同样是「主角」—— 不加这层，任何空姓名行
     * 都会被认成主角行。
     */
    const hit = sheet.rows.findIndex((row) => {
      const raw = cell(sheet, row, COL.name).trim();
      return raw !== '' && resolveUserName(raw) === me;
    });
    if (hit !== -1) return hit;
  }
  const pinned = sheet.rows.findIndex((row) => cell(sheet, row, COL.profile) === PINNED);
  return pinned === -1 ? null : pinned;
}

/** 主角所在的表与行下标。合并前的旧模板走 PROTAGONIST 通路，这里认不出。 */
function locateProtagonist(): { sheet: SheetSnapshot; index: number } | null {
  for (const { sheet } of resolveSheets(CHARACTERS)) {
    const index = findProtagonistIndex(sheet);
    if (index !== null) return { sheet, index };
  }
  return null;
}

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

/**
 * 主角。
 *
 * 两条通路并存，缺一不可：
 * - **新结构（1.1 起）**：主角是角色表里的一行，按 persona / 永固定位。
 * - **旧结构**：独立的主角信息表，取第一行。外部模板不会跟着我们合并，
 *   用户手上没重导的旧模板也还是分表的，所以这条通路要长期保留。
 */
export function readProtagonist(): CharacterVM | null {
  const found = locateProtagonist();
  if (found) return toVM(found.sheet, found.sheet.rows[found.index], found.index + 1, true);

  const sheet = resolveSheet(PROTAGONIST);
  if (!sheet || sheet.rows.length === 0) return null;
  return toVM(sheet, sheet.rows[0], 1, true);
}

/**
 * 玩家角色名，供不依赖主角行的场景使用（如判断关系表的哪一方是玩家）。
 * 优先 persona，其次表里已写好的真名。
 */
export function readUserName(): string {
  const found = locateProtagonist();
  if (found) return resolveUserName(cell(found.sheet, found.sheet.rows[found.index], COL.name));

  const sheet = resolveSheet(PROTAGONIST);
  const inTable = sheet?.rows.length ? cell(sheet, sheet.rows[0], COL.name) : '';
  return resolveUserName(inTable);
}

/**
 * 重要角色列表，**不含主角**。
 *
 * 合并之后主角就在这张表里，不排除的话它会在「重要角色」中重复出现 ——
 * 这正是 sheet-binding 里 `CHARACTERS.excludes` 一直在防的那个问题，
 * 只是合并后它从「跨表误认」变成了「同表重复」，得在这里挡。
 */
export function readTrackedCharacters(): CharacterVM[] {
  // 多张角色表并存时全部读取，顺序随模板定义（见 domain/sheet-binding 的 CHARACTERS）
  return resolveSheets(CHARACTERS).flatMap(({ sheet }) => {
    const protagonist = findProtagonistIndex(sheet);
    return sheet.rows
      // rowIndex 从 1 起：0 是表头。行号是**表内**的，写回时配合 sheetName 定位
      .map((row, i) => (i === protagonist ? null : toVM(sheet, row, i + 1, false)))
      .filter((c): c is CharacterVM => c !== null && c.name !== '');
  });
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
    /*
     * 合并后主角在角色表里，所以「有角色表」就等于有承载主角的地方。
     *
     * **刻意不用 locateProtagonist()**：那会把「表在、但还没初始化出主角行」
     * 判成能力缺失，面板先隐藏、初始化后再冒出来 —— 正是本注释开头说的
     * 「布局随数据增减跳动」。认不认得出主角是**数据**问题，交给
     * readProtagonist() 返回 null，仪表盘那边已有空态分支。
     */
    protagonist: resolveSheets(CHARACTERS).length > 0 || !!resolveSheet(PROTAGONIST),
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
