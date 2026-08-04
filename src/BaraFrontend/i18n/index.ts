/**
 * 自有消息目录（开发文档 §8.7c）
 *
 * Naive UI 的 locale 只翻译它自身组件的内建字符串（分页、日期选择器、
 * 空状态等）。插件的自有文案它一概不管，因此必须有这一层。
 *
 * 不引入 vue-i18n：对本项目规模过重，且会增加 CDN 产物体积。
 *
 * 边界：**插件自己产生的字符串要翻译，从数据库读出来的不翻译。**
 * 表名、列名、AI 写入的正文一律保持原样 —— 那是用户的存档数据，
 * 其语言由用户的模板决定。
 */
import type { Lang } from '../stores/ui-store';

type Catalog = Record<string, string>;

const zhCN: Catalog = {
  'app.title': '蔷薇前端',

  'dest.dashboard': '仪表盘',
  'dest.tables': '表格',

  'dock.layout.grid': '等宽网格（点击切换为流式）',
  'dock.layout.flow': '流式排列（点击切换为网格）',
  'dock.toggleIcons': '显示 / 隐藏图标',

  'dashboard.protagonist': '主角',
  'dashboard.importantChars': '重要角色',
  'dashboard.scene': '场景',
  'dashboard.supplies': '物资',
  'dashboard.showPresent': '在场',
  'dashboard.showAll': '全部',
  'dashboard.openSheet': '角色卡',
  'dashboard.empty.chars': '暂无重要角色',
  'dashboard.empty.items': '暂无物品',
  'dashboard.empty.equipment': '暂无装备',

  'sheet.page.stats': '属性技能特性',
  'sheet.page.biography': '人物小传',
  'sheet.page.relations': '关系社交',

  'table.view.card': '卡片',
  'table.view.list': '列表',
  'table.search': '搜索全部…',
  'table.count': '{range} / 共 {total} 项',

  // 枚举显示名：库里存键，界面显译文
  'refresh.manual': '手动',
  'refresh.scene': '场景',
  'refresh.session': '会话',
  'refresh.shortRest': '短休',
  'refresh.longRest': '长休',

  'status.增益': '增益',
  'status.减益': '减益',
  'status.中性': '中性',

  'presence.在场': '在场',
  'presence.离场': '离场',

  'settings.theme': '主题',
  'settings.mode': '深浅',
  'settings.mode.light': '浅色',
  'settings.mode.dark': '深色',
  'settings.mode.auto': '跟随',
  'settings.lang': '语言',
  'settings.easterEgg': '彩蛋',

  'error.dbNotReady': '数据库未就绪，请稍后重试',
  'error.aliasConflict': '表或列名冲突，请检查表格模板',
  'error.tableMissing': '缺少必要的表，请导入本插件的表格模板',
  'error.columnUnresolved': '列不存在，可能需要更新表格模板',
  'error.readonlyViolation': '该表已锁定，无法写入',
  'error.unknown': '操作失败',
};

const enUS: Catalog = {
  'app.title': 'Bara Frontend',

  'dest.dashboard': 'Dashboard',
  'dest.tables': 'Tables',

  'dock.layout.grid': 'Uniform grid (click for flow)',
  'dock.layout.flow': 'Flow layout (click for grid)',
  'dock.toggleIcons': 'Show / hide icons',

  'dashboard.protagonist': 'Protagonist',
  'dashboard.importantChars': 'Key Characters',
  'dashboard.scene': 'Scene',
  'dashboard.supplies': 'Supplies',
  'dashboard.showPresent': 'Present',
  'dashboard.showAll': 'All',
  'dashboard.openSheet': 'Sheet',
  'dashboard.empty.chars': 'No key characters',
  'dashboard.empty.items': 'No items',
  'dashboard.empty.equipment': 'No equipment',

  'sheet.page.stats': 'Stats & Abilities',
  'sheet.page.biography': 'Biography',
  'sheet.page.relations': 'Relations',

  'table.view.card': 'Cards',
  'table.view.list': 'List',
  'table.search': 'Search all…',
  'table.count': '{range} / {total} total',

  'refresh.manual': 'Manual',
  'refresh.scene': 'Scene',
  'refresh.session': 'Session',
  'refresh.shortRest': 'Short Rest',
  'refresh.longRest': 'Long Rest',

  'status.增益': 'Buff',
  'status.减益': 'Debuff',
  'status.中性': 'Neutral',

  'presence.在场': 'Present',
  'presence.离场': 'Away',

  'settings.theme': 'Theme',
  'settings.mode': 'Mode',
  'settings.mode.light': 'Light',
  'settings.mode.dark': 'Dark',
  'settings.mode.auto': 'Auto',
  'settings.lang': 'Language',
  'settings.easterEgg': 'Easter Egg',

  'error.dbNotReady': 'Database not ready, please retry',
  'error.aliasConflict': 'Table or column name conflict, check your template',
  'error.tableMissing': 'Required table missing, import the plugin template',
  'error.columnUnresolved': 'Column not found, the template may need updating',
  'error.readonlyViolation': 'This table is locked',
  'error.unknown': 'Operation failed',
};

const CATALOGS: Record<Lang, Catalog> = { 'zh-CN': zhCN, 'en-US': enUS };

/** 取译文。缺键时回落到键名本身，便于开发期发现遗漏。 */
export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  let text = CATALOGS[lang]?.[key] ?? CATALOGS['zh-CN'][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

/** 开发期用：列出两份目录的键差异 */
export function missingKeys(): { inZhOnly: string[]; inEnOnly: string[] } {
  const zh = new Set(Object.keys(zhCN));
  const en = new Set(Object.keys(enUS));
  return {
    inZhOnly: [...zh].filter((k) => !en.has(k)),
    inEnOnly: [...en].filter((k) => !zh.has(k)),
  };
}
