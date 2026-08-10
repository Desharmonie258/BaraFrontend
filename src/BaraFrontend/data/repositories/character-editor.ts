/**
 * 角色字段的手改 —— 仪表盘与角色卡的写回路径。
 *
 * 走 `cell-editor` 落库，这一层只管把「改一个属性」翻译成「改一个格子」。
 *
 * ## 属性为什么不能照着界面上的值改
 *
 * 一行角色的全部基础属性挤在**同一个格子**里，形如
 * `力量:19; 敏捷:64; 体质:50`。改其中一项等于重写整串，所以必须：
 *
 * 1. **从最新快照重读**这一串，而不是拿界面上那份 —— 界面那份可能是
 *    AI 刚覆盖之前读的，拿它序列化会把 AI 这一轮改的其余属性一起抹回去
 * 2. 用 `applyDeltas` 合并，而不是自己拼字符串 —— 它保住了顺序、
 *    关联属性（第三段）和无法解析的残片
 *
 * ## 范围跟着规则族走
 *
 * 钳制区间取自当前规则族的属性预设，不写死 —— d20 族的特有属性记的是
 * 加值（-5..25），百分骰族记的是百分比（0..100），用同一个区间会把
 * 其中一族的合法值夹掉。
 */
import { cell, findSheetByName } from '../snapshot-repo';
import { parse, serialize, applyDeltas, type AttributeEntry } from '../../domain/attribute-codec';
import { getAttributePreset, unionRange, type AttributeKind } from '../../domain/attribute-presets';
import type { RuleFamily } from '../../domain/rule-systems';
import { writeCell, type EditOutcome } from './cell-editor';
import { COL, type CharacterVM } from './character-repo';

/** 属性两档对应的列 */
const ATTR_COLUMN: Record<AttributeKind, string> = {
  base: COL.base,
  special: COL.special,
};

/** 当前规则族下某一档属性的合法区间 */
export function attributeRange(family: RuleFamily, kind: AttributeKind): { min: number; max: number } {
  const preset = getAttributePreset(family);
  const [min, max] = unionRange(kind === 'base' ? preset.base : preset.special);
  return { min, max };
}

/** 从最新快照重读角色那一行的某一列。取不到返回 null（行没了/表没了）。 */
function freshCell(character: CharacterVM, column: string): string | null {
  const sheet = findSheetByName([character.sheetName]);
  if (!sheet) return null;
  // rowIndex 是数据库口径（1 为第一行数据），快照的 rows 已去掉表头
  const row = sheet.rows[character.rowIndex - 1];
  return row ? cell(sheet, row, column) : null;
}

/**
 * 改一个属性值。
 *
 * 属性不在打包串里时会被新建 —— 用户只能点到界面上显示的属性，
 * 而界面上显示的必然来自这一串，所以这条路走不到；真走到了，
 * 新建也比静默什么都不做诚实。
 */
export async function setAttribute(
  character: CharacterVM,
  kind: AttributeKind,
  name: string,
  value: number,
  family: RuleFamily,
): Promise<EditOutcome> {
  const column = ATTR_COLUMN[kind];
  const packed = freshCell(character, column);
  if (packed === null) {
    return { ok: false, message: '这一行已经不在表里了，刷新后再试' };
  }

  const next: AttributeEntry[] = applyDeltas(
    parse(packed),
    [{ name, set: value }],
    attributeRange(family, kind),
  );

  return writeCell(
    { sheetName: character.sheetName, rowIndex: character.rowIndex, column },
    serialize(next),
  );
}

/** 资源里可以手改的两个字段。其余（恢复策略、阈值带）是模板的设定，不是局中数据。 */
export type ResourceField = 'current' | 'max';

const RESOURCE_COLUMN: Record<ResourceField, string> = {
  current: '当前值',
  max: '上限',
};

/**
 * 改一条资源的当前值或上限。
 *
 * **不做「当前值不得超过上限」的校验。** 超出上限在规则里是常见状态
 * （临时护盾、过量治疗、增益把上限顶上去了），前端替作者定这条规矩
 * 只会挡住合法操作；真正的约束应当写在模板的 CHECK 里，
 * 那时数据库会拒绝，失败提示会说明原因。
 */
export async function setResource(
  resource: { sheetName: string; rowIndex: number },
  field: ResourceField,
  value: number,
): Promise<EditOutcome> {
  return writeCell(
    { sheetName: resource.sheetName, rowIndex: resource.rowIndex, column: RESOURCE_COLUMN[field] },
    String(value),
  );
}

/** 改所在地点。自由文本，不做校验 —— 地名是作者的领域。 */
export async function setLocation(character: CharacterVM, value: string): Promise<EditOutcome> {
  return writeCell(
    { sheetName: character.sheetName, rowIndex: character.rowIndex, column: COL.location },
    value,
  );
}

/**
 * 改在场状态。
 *
 * 主角恒为在场（`CharacterVM.present` 对主角写死 true），改它没有意义，
 * 因此这里直接拒绝而不是写一个不会被读回来的值。
 */
export async function setPresence(character: CharacterVM, present: boolean): Promise<EditOutcome> {
  if (character.isProtagonist) {
    return { ok: false, message: '主角恒为在场' };
  }
  return writeCell(
    { sheetName: character.sheetName, rowIndex: character.rowIndex, column: COL.presence },
    present ? '在场' : '离场',
  );
}
