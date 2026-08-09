/**
 * 表格视图策略 —— 哪张表允许哪些视图。
 *
 * 大多数表三种视图都有意义，但少数表天然只有一种读法：
 * 小日历表、小日记表按日排布，用卡片或列表看等于把日历拆散了重排一遍，
 * 既丢掉时间轴又更难读。对这类表只开放日历。
 *
 * 与 enum-policy 同样按**展示名**匹配并留候选名，模板改名不至于失效。
 */

export type ViewMode = 'card' | 'list' | 'calendar' | 'map';

/** 只提供日历视图的表 */
const CALENDAR_ONLY: readonly (readonly string[])[] = [
  ['小日历表', '日历表'],
  ['小日记表', '日记表'],
];

export function isCalendarOnly(sheetName: string): boolean {
  return CALENDAR_ONLY.some((names) => names.includes(sheetName));
}

/**
 * 地图视图默认打开的表。
 *
 * 与日历那批表不同，这里**不做「只给地图」** —— 地点的描述、探索状态、
 * 交互选项在图上放不下，卡片视图仍然是主要读法，地图只是默认落点。
 */
const MAP_FIRST: readonly (readonly string[])[] = [
  ['世界地图点', '世界地图点表'],
  ['本地地图表', '地图元素表'],
];

export function isMapFirst(sheetName: string): boolean {
  return MAP_FIRST.some((names) => names.includes(sheetName));
}

export interface ViewCapabilities {
  /** 是否探测到日期列 —— 没有日期列就渲染不出日历 */
  hasDate: boolean;
  /** 是否探测到 X/Y 坐标两列 —— 缺一列就渲染不出地图 */
  hasCoords: boolean;
}

/**
 * 某表可用的视图列表。
 *
 * 视图的开放条件一律**按列探测**，不按表名：外部模板的地图表没有坐标列，
 * 认不出即退回卡片视图，而不是给一个点开是空白的地图切换。
 */
export function availableViews(sheetName: string, caps: ViewCapabilities): ViewMode[] {
  if (caps.hasDate && isCalendarOnly(sheetName)) return ['calendar'];
  const views: ViewMode[] = ['card', 'list'];
  if (caps.hasDate) views.push('calendar');
  if (caps.hasCoords) views.push('map');
  // 地图表把地图挪到首位 —— 首位即无记忆时的默认落点
  if (caps.hasCoords && isMapFirst(sheetName)) {
    return ['map', ...views.filter((v) => v !== 'map')];
  }
  return views;
}

/**
 * 把记忆的视图模式收敛到当前可用范围内。
 *
 * 需要这一步是因为模式**按表持久化**：换了模板、改了表名之后，
 * 存档里可能留着一个当前已不可用的模式，直接用会渲染出空视图。
 */
export function resolveView(
  sheetName: string,
  caps: ViewCapabilities,
  remembered: ViewMode,
): ViewMode {
  const views = availableViews(sheetName, caps);
  return views.includes(remembered) ? remembered : views[0];
}
