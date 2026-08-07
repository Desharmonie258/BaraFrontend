/**
 * 表格视图策略 —— 哪张表允许哪些视图。
 *
 * 大多数表三种视图都有意义，但少数表天然只有一种读法：
 * 小日历表、小日记表按日排布，用卡片或列表看等于把日历拆散了重排一遍，
 * 既丢掉时间轴又更难读。对这类表只开放日历。
 *
 * 与 enum-policy 同样按**展示名**匹配并留候选名，模板改名不至于失效。
 */

export type ViewMode = 'card' | 'list' | 'calendar';

/** 只提供日历视图的表 */
const CALENDAR_ONLY: readonly (readonly string[])[] = [
  ['小日历表', '日历表'],
  ['小日记表', '日记表'],
];

export function isCalendarOnly(sheetName: string): boolean {
  return CALENDAR_ONLY.some((names) => names.includes(sheetName));
}

/**
 * 某表可用的视图列表。
 *
 * @param sheetName  表的展示名
 * @param hasDate    是否探测到日期列 —— 没有日期列就渲染不出日历
 */
export function availableViews(sheetName: string, hasDate: boolean): ViewMode[] {
  if (hasDate && isCalendarOnly(sheetName)) return ['calendar'];
  return hasDate ? ['card', 'list', 'calendar'] : ['card', 'list'];
}

/**
 * 把记忆的视图模式收敛到当前可用范围内。
 *
 * 需要这一步是因为模式**按表持久化**：换了模板、改了表名之后，
 * 存档里可能留着一个当前已不可用的模式，直接用会渲染出空视图。
 */
export function resolveView(
  sheetName: string,
  hasDate: boolean,
  remembered: ViewMode,
): ViewMode {
  const views = availableViews(sheetName, hasDate);
  return views.includes(remembered) ? remembered : views[0];
}
