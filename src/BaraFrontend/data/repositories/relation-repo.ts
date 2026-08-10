/**
 * 人物关系的读取（1.11）。
 *
 * 关系表的两列都是角色名，第三列是描述。列名按展示名找，并对各家模板的
 * 叫法留了候选 —— 与 sheet-binding 同一条纪律：写死一个名字，用户改过
 * 模板就整块失效。
 *
 * 关系图只画**表里出现过的名字**，不去角色表核对是否存在：AI 会写出
 * 「路人甲」这类没有建档的角色，把它们剔掉会让关系图缺一大块，
 * 而用户看图是为了看关系，不是为了看谁建了档。
 */
import { cell, resolveSheets } from '../snapshot-repo';
import { RELATIONS } from '../../domain/sheet-binding';
import { replaceUserPlaceholders } from '../persona';
import type { RelationInput } from '../../domain/relation-graph';

const COL_A = ['角色A', '角色 A', '甲方', '发起者'];
const COL_B = ['角色B', '角色 B', '乙方', '对象'];
const COL_LABEL = ['关系描述', '关系', '描述'];

function pick(headers: readonly string[], candidates: readonly string[]): string | null {
  return candidates.find((c) => headers.includes(c)) ?? null;
}

export interface RelationData {
  /** 表认不认得出。认不出时面板整块隐藏。 */
  available: boolean;
  relations: RelationInput[];
}

export function readRelations(): RelationData {
  const out: RelationInput[] = [];
  let available = false;

  // 多张关系表并存时全部读 —— 与角色表同理，只读一张会让另一张整个消失
  for (const { sheet } of resolveSheets(RELATIONS)) {
    const a = pick(sheet.headers, COL_A);
    const b = pick(sheet.headers, COL_B);
    if (!a || !b) continue;
    available = true;

    const label = pick(sheet.headers, COL_LABEL);
    for (const row of sheet.rows) {
      out.push({
        a: replaceUserPlaceholders(cell(sheet, row, a)),
        b: replaceUserPlaceholders(cell(sheet, row, b)),
        label: label ? replaceUserPlaceholders(cell(sheet, row, label)) : '',
      });
    }
  }

  return { available, relations: out };
}
