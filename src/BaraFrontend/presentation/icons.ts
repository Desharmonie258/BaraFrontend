/**
 * 图标登记处 —— 全项目的图标从这里取，不在组件里各自 import。
 *
 * 用 `@vicons/fluent`。它有 10072 个图标、57MB，**完全依赖 tree shaking**
 * 才能用：包已声明 `sideEffects: false` 且提供 ESM 入口，实测按名引入时
 * 每个图标约 850 字节（压缩后），增量随数量线性增长。
 *
 * 因此有两条纪律：
 * 1. **只用具名导入**，绝不 `import * as icons`——那会把 57MB 全打进来。
 * 2. 图标集中在本文件登记。散落各处时，某个组件被删掉后它引的图标
 *    很容易被漏掉，而漏掉的代价是包里多躺一个没人用的组件。
 *
 * 图标名必须先核对存在性：Fluent 的命名不好猜，`Dice24Regular` 与
 * `Calendar24Regular` 都不存在（分别是 Cube 与 CalendarLtr）。
 */
import type { Component } from 'vue';
import {
  Board24Regular,
  ArrowSwap24Regular,
  Code24Regular,
  Settings24Regular,
  Map24Regular,
  Diamond24Regular,
  Star24Regular,
  People24Regular,
  Person24Regular,
  Emoji24Regular,
  Pulse24Regular,
  Flash24Regular,
  Sparkle24Regular,
  BatteryCharge24Regular,
  PeopleTeam24Regular,
  Box24Regular,
  Backpack24Regular,
  Checkmark24Regular,
  Cube24Regular,
  CalendarLtr24Regular,
  Note24Regular,
  Book24Regular,
  ClipboardTaskListLtr24Regular,
  Document24Regular,
  ChevronDown24Regular,
  ChevronRight24Regular,
  Grid24Regular,
  List24Regular,
  Eye24Regular,
  EyeOff24Regular,
  Dismiss24Regular,
  Send24Regular,
  Edit24Regular,
  Color24Regular,
  Info24Regular,
  Wrench24Regular,
} from '@vicons/fluent';

/** 界面动作图标 */
export const ICONS = {
  settings: Settings24Regular,
  expand: ChevronDown24Regular,
  collapse: ChevronRight24Regular,
  layoutGrid: Grid24Regular,
  layoutFlow: List24Regular,
  iconOn: Eye24Regular,
  iconOff: EyeOff24Regular,
  send: Send24Regular,
  edit: Edit24Regular,
  ok: Checkmark24Regular,
  fail: Dismiss24Regular,
} as const;

/** 设置面板的分组图标 */
export const GROUP_ICONS = {
  appearance: Color24Regular,
  layout: Grid24Regular,
  rules: Cube24Regular,
  interaction: Flash24Regular,
  dock: Box24Regular,
  about: Info24Regular,
  advanced: Wrench24Regular,
} as const;

/** 功能入口（非表格）的固定图标 */
export const FUNCTION_ICONS: Record<string, Component> = {
  dashboard: Board24Regular,
  review: ArrowSwap24Regular,
  variables: Code24Regular,
  interactions: Flash24Regular,
};

/**
 * 交互总览的分区图标（1.11）。
 *
 * 键与 `domain/interaction-rules` 的 `SectionKind` 一一对应 ——
 * 少一个键就会在那个分区留一个空图标位。
 */
export const SECTION_ICONS: Record<string, Component> = {
  character: People24Regular,
  map: Map24Regular,
  item: Backpack24Regular,
  equipment: Box24Regular,
  task: ClipboardTaskListLtr24Regular,
  skill: Sparkle24Regular,
  faction: PeopleTeam24Regular,
  generic: Document24Regular,
};

/**
 * 表名关键字 → 图标。按数组顺序匹配，先命中先用。
 *
 * 匹配不到时回落到通用文档图标 —— **不要因为没有图标就不显示该表**
 * （§8.9c）。用户的自定义表必然匹配不到任何关键字。
 */
const TABLE_ICON_RULES: Array<[RegExp, Component]> = [
  [/全局|设置/, Settings24Regular],
  [/地图|地点/, Map24Regular],
  [/元素/, Diamond24Regular],
  [/主角/, Star24Regular],
  [/追踪角色|重要角色|NPC/, People24Regular],
  [/生理|身体/, Person24Regular],
  [/心理|人设/, Emoji24Regular],
  [/临场|状态/, Pulse24Regular],
  [/技能/, Flash24Regular],
  [/特性|法术/, Sparkle24Regular],
  [/资源/, BatteryCharge24Regular],
  [/关系|社交/, PeopleTeam24Regular],
  [/物品|背包/, Box24Regular],
  [/装备/, Backpack24Regular],
  [/任务/, Checkmark24Regular],
  [/检定|建议/, Cube24Regular],
  [/日历/, CalendarLtr24Regular],
  [/日记|备忘/, Note24Regular],
  [/纪要|总结/, Book24Regular],
  [/大事记|履历|实录/, ClipboardTaskListLtr24Regular],
];

const FALLBACK = Document24Regular;

export function iconForSheet(name: string): Component {
  for (const [pattern, icon] of TABLE_ICON_RULES) {
    if (pattern.test(name)) return icon;
  }
  return FALLBACK;
}
