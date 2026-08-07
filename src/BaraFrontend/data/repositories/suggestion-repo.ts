/**
 * 检定建议仓储 —— 读取检定建议表的 6 个固定槽位。
 *
 * 表结构（模板 §3.8）：
 *   行号 1-3  建议类型恒为「主角」
 *   行号 4-5  「角色」：由在场重要角色发起；无在场角色时退化为主角
 *   行号 6    「快进」：推进剧情，骰子命令恒为 '无'
 *
 * 列按**展示名**定位并留有回退（骰子系统用「包含匹配」找列，
 * 这里沿用同样的思路），用户改过模板列名时不至于整块失效。
 */
import { findSheetByName, colIndex, type SheetSnapshot } from '../snapshot-repo';
import { resolveUserName, replaceUserPlaceholders, isUserPlaceholder } from '../persona';

const SHEET_NAMES = ['检定建议表', '检定建议'] as const;

/** 快进类建议的骰子命令占位值，不应被当成真命令发出 */
const NO_COMMAND = new Set(['无', '-', '—', '']);

export type SuggestionKind = '主角' | '角色' | '快进';

export interface SuggestionVM {
  /** 数据库行号：0 为表头，1 为第一行数据 */
  rowIndex: number;
  /** 槽位号，取自 row_id；缺失时退化为出现顺序 */
  slot: number;
  kind: SuggestionKind;
  /** 发起者。主角类通常为空 */
  actor: string;
  /** 按钮上显示的文字，也是发送出去的内容 */
  displayText: string;
  /** 骰子命令。快进类为空 —— 已把 '无' 一类的占位值归一掉 */
  diceCommand: string;
}

/**
 * 找列。先精确匹配展示名，再退到「包含」匹配。
 * 都找不到返回 fallback 下标，让整表不至于因一列改名而读不出来。
 */
function findCol(sheet: SheetSnapshot, label: string, keyword: string, fallback: number): number {
  const exact = colIndex(sheet, label);
  if (exact >= 0) return exact;
  const fuzzy = sheet.headers.findIndex((h) => String(h ?? '').includes(keyword));
  return fuzzy >= 0 ? fuzzy : fallback;
}

function toKind(raw: string): SuggestionKind {
  if (raw.includes('快进')) return '快进';
  if (raw.includes('角色')) return '角色';
  return '主角';
}

/**
 * 读取全部建议。
 *
 * 展示文本为空的行**整条丢弃** —— 那是没填的槽位，渲染成空按钮
 * 只会让人以为坏了。表不存在时返回空数组而非抛错：模板可能还没导入。
 */
export function readSuggestions(): SuggestionVM[] {
  const sheet = findSheetByName(SHEET_NAMES);
  if (!sheet) return [];

  const cType = findCol(sheet, '建议类型', '类型', 1);
  const cActor = findCol(sheet, '发起者', '发起', 2);
  const cText = findCol(sheet, '展示文本', '展示', 3);
  const cCmd = findCol(sheet, '骰子命令', '命令', 4);

  const out: SuggestionVM[] = [];
  sheet.rows.forEach((row, i) => {
    const displayText = String(row[cText] ?? '').trim();
    if (!displayText) return;

    const rawCmd = String(row[cCmd] ?? '').trim();
    const slot = Number.parseInt(String(row[0] ?? ''), 10);

    out.push({
      rowIndex: i + 1,
      slot: Number.isFinite(slot) ? slot : i + 1,
      kind: toKind(String(row[cType] ?? '')),
      // 主角类建议的发起者常被 AI 写成未展开的 {{user}}
      actor: isUserPlaceholder(row[cActor])
        ? resolveUserName(row[cActor])
        : String(row[cActor] ?? '').trim(),
      displayText: replaceUserPlaceholders(displayText),
      diceCommand: NO_COMMAND.has(rawCmd) ? '' : rawCmd,
    });
  });

  // 按槽位排序：模板规定 1-3 主角、4-5 角色、6 快进，
  // 顺序本身携带语义，不能依赖数据行的物理顺序。
  return out.sort((a, b) => a.slot - b.slot);
}

/** 建议表是否存在。不存在时界面不显示这一块，而不是显示一个空面板。 */
export function hasSuggestionSheet(): boolean {
  return findSheetByName(SHEET_NAMES) !== undefined;
}
