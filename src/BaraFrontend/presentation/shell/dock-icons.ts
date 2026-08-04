/**
 * 表格坞图标映射。
 *
 * 按表名关键字匹配，缺失时回落到通用表格图标 —— **不要因为没有图标
 * 就不显示该表**（§8.9c）。用户的自定义表必然匹配不到任何关键字。
 */

/** 功能入口（非表格）的固定图标 */
export const FUNCTION_ICONS: Record<string, string> = {
  dashboard: '◱',
};

/** 表名关键字 → 图标。按数组顺序匹配，先命中先用。 */
const TABLE_ICON_RULES: Array<[RegExp, string]> = [
  [/全局|设置/, '◉'],
  [/地图|地点/, '◈'],
  [/元素/, '◇'],
  [/主角/, '★'],
  [/追踪角色|重要角色|NPC/, '☰'],
  [/生理|身体/, '◐'],
  [/心理|人设/, '◑'],
  [/临场|状态/, '◔'],
  [/技能/, '⚔'],
  [/特性|法术/, '✦'],
  [/资源/, '❖'],
  [/关系|社交/, '⇄'],
  [/物品|背包/, '▣'],
  [/装备/, '⛨'],
  [/任务/, '✓'],
  [/检定|建议/, '⚁'],
  [/日历/, '▤'],
  [/日记|备忘/, '✎'],
  [/纪要|总结/, '▦'],
  [/大事记|履历|实录/, '❋'],
];

const FALLBACK = '▢';

export function iconForSheet(name: string): string {
  for (const [pattern, icon] of TABLE_ICON_RULES) {
    if (pattern.test(name)) return icon;
  }
  return FALLBACK;
}
