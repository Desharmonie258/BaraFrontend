/**
 * 枚举列的可编辑策略。
 *
 * 快照里凡是带 `CHECK(col IN (...))` 的列都会被解析成枚举，界面据此渲染
 * 成一排可点的选项。这在通用性上是对的，但**绝大多数枚举列不该由玩家改**：
 * 天气、状态、与今天的关系这些是 AI 依剧情写的，玩家点一下就把叙事改了，
 * 而且下一轮 AI 还会覆盖回去 —— 既无效又容易误触。
 *
 * 因此默认只放行一处：NPC 表的归档状态。它是**玩家的决定**（把谁纳入
 * 跟踪），本来就该由玩家来点，也是晋升流程的触发点。
 *
 * 调试模式放开全部，用于验证模板的 CHECK 约束是否按预期工作。
 */

/** QASmoke 挡位 */
export type QaSmoke = 'default' | 'debug';

/**
 * 默认挡位下允许编辑的枚举列。
 *
 * 表名与列名都按**展示名**匹配，并对模板改名留了多个候选 ——
 * 写死单一名字会在用户改过模板后整个失效。
 */
export const EDITABLE_ENUMS: ReadonlyArray<{
  sheets: readonly string[];
  columns: readonly string[];
}> = [
  {
    sheets: ['NPC表', 'NPC 表', '普通角色表'],
    columns: ['归档状态'],
  },
];

/**
 * 某列在当前挡位下是否可编辑。
 *
 * @param sheetName 表的展示名
 * @param column    列的展示名
 */
export function isEnumEditable(sheetName: string, column: string, mode: QaSmoke): boolean {
  if (mode === 'debug') return true;
  return EDITABLE_ENUMS.some(
    (rule) => rule.sheets.includes(sheetName) && rule.columns.includes(column),
  );
}

/**
 * 某表在当前挡位下有没有可编辑的枚举列。
 * 用于决定是否要为整张表准备写入路径。
 */
export function hasEditableEnums(sheetName: string, mode: QaSmoke): boolean {
  if (mode === 'debug') return true;
  return EDITABLE_ENUMS.some((rule) => rule.sheets.includes(sheetName));
}
