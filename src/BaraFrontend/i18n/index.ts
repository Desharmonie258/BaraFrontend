/**
 * 自有消息目录（开发文档 §8.7c）
 *
 * 不引入 vue-i18n：对本项目规模而言过重。目录以扁平键组织，键名用英文语义命名。
 *
 * 边界：**插件自己产生的字符串要翻译，从数据库读出来的不翻译。**
 * 表名、列名、AI 写入的正文一律保持原样 —— 那是用户的存档数据，
 * 其语言由用户的模板决定。
 */
import type { Lang } from '../stores/ui-store';

type Catalog = Record<string, string>;

const zhCN: Catalog = {
  'app.title': '蔷薇前端',

  'shell.expand': '展开内容',
  'shell.collapse': '收起内容',

  'dest.dashboard': '仪表盘',
  'dest.tables': '表格',
  'dest.variables': '变量',
  'vars.refresh': '刷新',
  'vars.search': '搜索变量…',
  'vars.none': '未检测到',
  'vars.empty': '没有匹配的变量',
  'vars.noFramework': '未检测到变量框架（MVU / ERA / LWB）。该角色卡可能没有使用变量系统。',
  'vars.eraUnavailable': '检测到 ERA 框架，但其数据需要通过异步接口获取，本面板暂时读不到。',

  'dest.review': '变更审核',
  'review.count': '{n} 处变更',
  'review.capture': '建立基线',
  'review.confirm': '确认并更新基线',
  'review.clear': '清除基线',
  'review.captured': '已把当前数据存为新基线',
  'review.noBaseline': '尚未建立基线。基线是「上一次确认时的数据」，建立后即可看出 AI 每轮改了什么。',
  'review.noChange': '与基线一致，没有变更',
  'review.type.table_added': '新增表',
  'review.type.table_deleted': '删除表',
  'review.type.table_structure_changed': '表结构变化',
  'review.type.row_added': '新增',
  'review.type.row_deleted': '删除',
  'review.type.row_modified': '多处修改',
  'review.type.cell_modified': '修改',



  'dock.layout.grid': '等宽网格（点击切换为流式）',
  'dock.layout.flow': '流式排列（点击切换为网格）',
  'dock.toggleIcons': '显示 / 隐藏图标',
  'dock.noSheet': '未识别到表格，请先导入本插件的表格模板',

  'dashboard.subtitle': '综合状态总览',
  'dashboard.protagonist': '主角',
  'dashboard.importantChars': '重要角色',
  'dashboard.scene': '场景',
  'dashboard.supplies': '物资',
  'dashboard.showPresent': '在场',
  'dashboard.showAll': '全部',
  'dashboard.openSheet': '角色卡',
  'dashboard.items': '物品',
  'dashboard.equipment': '装备',
  'card.rollHint': '点击用「{attr}」发起检定',
  'dashboard.empty.chars': '暂无重要角色',
  /*
   * 面板全部不适用时的兜底。**不能留空白页** —— 仪表盘对这份模板确实
   * 无从显示，但用户需要知道「不是坏了，是这份模板没有这些表」，
   * 以及数据该去哪里看。
   */
  'dashboard.unsupported': '当前数据库模板不含角色相关的表，仪表盘没有可显示的内容。',
  'dashboard.unsupported.hint': '表格数据仍可从下方的表格列表查看。',
  'dashboard.empty.items': '暂无物品',
  'dashboard.empty.equipment': '暂无装备',

  'suggest.title': '检定建议',
  'suggest.group.protagonist': '主角行动',
  'suggest.group.character': '角色行动',
  'suggest.group.skip': '推进',
  'suggest.hintSend': '点击发送并触发回复',
  'suggest.hintFill': '点击填入输入框',
  'suggest.fillOnly': '只填入输入框，不发送',
  'suggest.autoSend': '点击即发送',
  'suggest.noComposer': '未找到酒馆输入框，暂时无法发送',
  'suggest.sent': '已发送：{text}',
  'suggest.filled': '已填入输入框',
  'suggest.failed': '发送失败，请手动复制内容发送',
  'suggest.empty': '本轮暂无检定建议',

  'check.err.checkShape': '骰子命令格式不完整，已只发送行动文本',
  'check.err.contestShape': '对抗命令格式不完整，已只发送行动文本',
  'check.err.unknownVerb': '无法识别的骰子命令，已只发送行动文本',
  'check.err.contestUnsupported': '对抗检定尚未支持，已只发送行动文本',
  'check.err.actorNotFound': '找不到角色「{detail}」，已只发送行动文本',
  'check.err.attrNotFound': '该角色没有属性「{detail}」，已只发送行动文本',

  'check.difficulty': '难度',
  'check.dc': '难度值',
  'check.roll': '掷骰',
  'check.reroll': '重掷',
  'check.fill': '填入输入框',
  'check.send': '发送',
  'check.filled': '已填入输入框，可再编辑后发送',
  'check.sent': '已发送',

  'sheet.close': '关闭',
  'sheet.tab.summary': '总览',
  'sheet.tab.inventory': '库存',
  'sheet.tab.feature': '特性',
  'sheet.tab.bio': '传记',

  'sheet.attrs.base': '基础属性',
  'sheet.attrs.special': '特有属性',
  'sheet.section.resources': '资源',
  'sheet.section.skills': '技能',
  'sheet.section.traits': '能力',
  'sheet.section.statuses': '状态',
  'sheet.section.relations': '关系',
  'sheet.section.chronicle': '大事记',
  'sheet.section.intimacy': '亲密经历',

  'sheet.bio.recent': '近期变化',
  'sheet.bio.appearance': '外貌形象',
  'sheet.bio.personality': '性格',
  'sheet.bio.history': '履历与声部',
  'sheet.bio.body': '身体特征',
  'sheet.bio.preference': '性向与经验',
  'sheet.bio.volatile': '随剧情变动',
  'sheet.bio.adult': '成人向',

  'sheet.vitals.reserved': '生命 / 经验待模板支持；置顶「角色资源表」中的资源即显示在此',
  'sheet.empty.skills': '暂无技能',
  'sheet.empty.traits': '暂无能力',
  'sheet.empty.statuses': '暂无状态',
  'sheet.empty.bio': '暂无传记内容',

  'sheet.page.stats': '属性技能特性',
  'sheet.page.biography': '人物小传',
  'sheet.page.relations': '关系社交',

  'table.view.card': '卡片',
  'table.view.list': '列表',
  'table.view.calendar': '日历',
  'calendar.storyToday': '剧情当前',
  'calendar.prev': '上一月',
  'calendar.next': '下一月',


  'table.search': '搜索全部…',
  'table.saved': '已将「{label}」设为「{value}」',
  'table.count': '{range} / 共 {total} 项',

  /*
   * 结构失配的提示。**不能与空态共用一句话** —— 「就是没有数据」和
   * 「这张表我读不懂」对用户是完全不同的信息，混在一起就没法自助排查。
   */
  'table.broken.title': '这张表的结构与当前前端预期不符',
  'table.broken.noHeaders': '没有读到表头。可能是数据库插件尚未完成初始化，可稍后重试。',
  'table.broken.onlyRowId': '除内部主键外没有任何数据列，因此没有内容可显示。',
  'table.broken.sqlHeaders': '列名是英文而非中文，多半是该表的结构注释在某次重建中丢失了。表格内容仍可查看，但按列名匹配的功能会失效。',
  'table.broken.columns': '实际列名：{columns}',

  // ── 模板适配情况（设置面板）──
  'compat.title': '模板适配情况',
  'compat.hint': '各项功能在当前数据库模板下认到了哪些表。认不出的功能会自动隐藏，不影响表格本身的查看。',
  'compat.none': '未认出',
  'compat.via.key': '按表标识',
  'compat.via.name': '按表名',
  // 指纹是推测，必须让用户看得出来 —— 万一推错了，这是唯一的线索
  'compat.via.fingerprint': '按列结构推测',
  'compat.cap.characters': '角色',
  'compat.cap.protagonist': '主角',
  'compat.cap.suggestions': '检定建议',
  'compat.cap.items': '物品',
  'compat.cap.equipment': '装备',
  'compat.cap.resources': '资源条',

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

  'settings.title': '设置',
  'settings.close': '返回',
  'settings.cancel': '取消',
  'settings.on': '开',
  'settings.off': '关',

  'settings.group.appearance': '外观样式',
  'settings.group.layout': '布局与浏览',
  'settings.group.rules': '游戏模式与规则',
  'settings.group.interaction': '面板与交互',
  'settings.group.dock': '表格坞管理',
  'settings.group.about': '关于',
  'settings.group.advanced': '高级设置',

  'settings.lang.hint': '只影响插件界面，表格内容保持模板原文',
  'settings.fontScale': '字号',

  'settings.dockLayout': '坞布局',
  'settings.dock.grid': '等宽网格',
  'settings.dock.flow': '流式',
  'settings.dockIcons': '坞图标',
  'settings.contentHeight': '内容区高度',
  'settings.contentHeight.hint': '过高会把后续对话推出很远',
  'settings.pageSize': '每页行数',
  'settings.fullWidth': '宽度校正',
  'settings.fullWidth.hint': '把面板撑到聊天区满宽。排版异常时可关闭',

  'settings.sync.title': '同步属性量纲到模板',
  'settings.sync.hint': '把当前规则族的取值范围与示例写进模板的「属性规则」段，供 AI 参照',
  'settings.sync.preview': '预览改动',
  'settings.sync.apply': '确认写入',
  'settings.sync.affected': '将改写：{sheets}（仅当前聊天的模板副本）',
  'settings.sync.done': '已写入 {n} 张表',
  'settings.sync.noTemplate': '读不到表格模板，请确认数据库插件已就绪',
  'settings.sync.noTaggedSheet': '模板中没有带「属性规则」段的表，无法同步',
  'settings.sync.newChat': '切换规则族后，已有存档的属性值仍是旧量纲，由 AI 在后续剧情中自行收敛。建议新开聊天以获得一致的数值。',

  'settings.ruleSystem': '规则族',
  'settings.ruleSystem.hint': '决定检定的判定方式与资源类型。三族均为通用参数化实现，具体数值由预设提供',
  'settings.ruleSystem.licenses': '许可与版权声明见「关于」栏目',
  'about.licenses': '许可与版权',
  'about.credit': '致谢：{name}　作者 {author}',
  'about.licenses.intro': '以下声明为各规则来源的许可条件，恒以英文原文展示，不随界面语言变化。',
  'about.license.show': '查看完整许可证',
  'about.license.hide': '收起许可证',
  'settings.clickSuggestion': '点击检定建议后',
  'settings.clickSuggestion.hint': '发送不可撤销，可改为只填入输入框',
  'settings.send.auto': '直接发送',
  'settings.send.fill': '填入输入框',

  'settings.qa.default': '默认',
  'settings.qa.debug': '调试模式',
  'settings.qa.hint': '默认只放行 NPC 表的归档状态；调试模式放开全部枚举列，供校验模板约束',

  'settings.dockManage': '坞内条目',
  'settings.dockManage.hint': '点击切换显示 / 隐藏，隐藏不影响表格数据',
  'settings.showAll': '全部显示',
  'settings.sheetHide': '点击隐藏',
  'settings.sheetShow': '点击显示',

  'settings.diagnostics': '环境自检',
  'settings.diag.plugin': '数据库插件',
  'settings.diag.read': '读取快照',
  'settings.diag.write': '写入接口',
  'settings.diag.send': '发送通道',
  'settings.diag.sheets': '已识别表',
  'settings.reset': '恢复默认',
  'settings.reset.hint': '抹掉全部偏好设置，语言除外',
  'settings.reset.confirm': '确认恢复？',

  'settings.theme': '主题',
  'settings.theme.hint': '色块为当前深浅设置下的实际配色',
  'settings.mode': '深浅',
  'settings.mode.light': '浅色',
  'settings.mode.dark': '深色',
  'settings.mode.auto': '跟随',
  'settings.lang': '语言',

  'error.dbNotReady': '数据库未就绪，请稍后重试',
  'error.aliasConflict': '表或列名冲突，请检查表格模板',
  'error.tableMissing': '缺少必要的表，请导入本插件的表格模板',
  'error.columnUnresolved': '列不存在，可能需要更新表格模板',
  'error.readonlyViolation': '该表已锁定，无法写入',
  'error.unknown': '操作失败',
};

const enUS: Catalog = {
  'app.title': 'Bara Frontend',

  'shell.expand': 'Expand',
  'shell.collapse': 'Collapse',

  'dest.dashboard': 'Dashboard',
  'dest.tables': 'Tables',
  'dest.variables': 'Variables',
  'vars.refresh': 'Refresh',
  'vars.search': 'Search variables…',
  'vars.none': 'Not detected',
  'vars.empty': 'No matching variables',
  'vars.noFramework': 'No variable framework detected (MVU / ERA / LWB). This character card may not use one.',
  'vars.eraUnavailable': 'ERA detected, but its data requires an async API this panel cannot reach yet.',

  'dest.review': 'Review',
  'review.count': '{n} change(s)',
  'review.capture': 'Set baseline',
  'review.confirm': 'Confirm & update baseline',
  'review.clear': 'Clear baseline',
  'review.captured': 'Current data saved as the new baseline',
  'review.noBaseline': 'No baseline yet. The baseline is the data as of your last confirmation; set one to see what the AI changes each turn.',
  'review.noChange': 'No changes since the baseline',
  'review.type.table_added': 'Table added',
  'review.type.table_deleted': 'Table deleted',
  'review.type.table_structure_changed': 'Structure changed',
  'review.type.row_added': 'Added',
  'review.type.row_deleted': 'Deleted',
  'review.type.row_modified': 'Multiple edits',
  'review.type.cell_modified': 'Edited',



  'dock.layout.grid': 'Uniform grid (click for flow)',
  'dock.layout.flow': 'Flow layout (click for grid)',
  'dock.toggleIcons': 'Show / hide icons',
  'dock.noSheet': 'No sheets found; import the plugin template first',

  'dashboard.subtitle': 'Overview',
  'dashboard.protagonist': 'Protagonist',
  'dashboard.importantChars': 'Key Characters',
  'dashboard.scene': 'Scene',
  'dashboard.supplies': 'Supplies',
  'dashboard.showPresent': 'Present',
  'dashboard.showAll': 'All',
  'dashboard.openSheet': 'Sheet',
  'dashboard.items': 'Items',
  'dashboard.equipment': 'Equipment',
  'card.rollHint': 'Roll with {attr}',
  'dashboard.empty.chars': 'No key characters',
  'dashboard.unsupported': 'This database template has no character-related sheets, so the dashboard has nothing to show.',
  'dashboard.unsupported.hint': 'Sheet data is still available from the sheet list below.',
  'dashboard.empty.items': 'No items',
  'dashboard.empty.equipment': 'No equipment',

  'suggest.title': 'Check Suggestions',
  'suggest.group.protagonist': 'Protagonist',
  'suggest.group.character': 'Characters',
  'suggest.group.skip': 'Skip Ahead',
  'suggest.hintSend': 'Click to send and trigger a reply',
  'suggest.hintFill': 'Click to fill the composer',
  'suggest.fillOnly': 'Fill composer without sending',
  'suggest.autoSend': 'Send on click',
  'suggest.noComposer': 'Composer not found, sending unavailable',
  'suggest.sent': 'Sent: {text}',
  'suggest.filled': 'Filled into composer',
  'suggest.failed': 'Send failed, please copy and send manually',
  'suggest.empty': 'No suggestions this turn',

  'check.err.checkShape': 'Incomplete dice command; sent the action text only',
  'check.err.contestShape': 'Incomplete contest command; sent the action text only',
  'check.err.unknownVerb': 'Unrecognised dice command; sent the action text only',
  'check.err.contestUnsupported': 'Contested checks are not supported yet; sent the action text only',
  'check.err.actorNotFound': 'Character "{detail}" not found; sent the action text only',
  'check.err.attrNotFound': 'That character has no attribute "{detail}"; sent the action text only',

  'check.difficulty': 'Difficulty',
  'check.dc': 'DC',
  'check.roll': 'Roll',
  'check.reroll': 'Reroll',
  'check.fill': 'Fill composer',
  'check.send': 'Send',
  'check.filled': 'Filled into the composer; edit before sending',
  'check.sent': 'Sent',

  'sheet.close': 'Close',
  'sheet.tab.summary': 'Summary',
  'sheet.tab.inventory': 'Inventory',
  'sheet.tab.feature': 'Feature',
  'sheet.tab.bio': 'Bio',

  'sheet.attrs.base': 'Base Attributes',
  'sheet.attrs.special': 'Special Attributes',
  'sheet.section.resources': 'Resources',
  'sheet.section.skills': 'Skills',
  'sheet.section.traits': 'Abilities',
  'sheet.section.statuses': 'Statuses',
  'sheet.section.relations': 'Relations',
  'sheet.section.chronicle': 'Chronicle',
  'sheet.section.intimacy': 'Intimate History',

  'sheet.bio.recent': 'Recent Changes',
  'sheet.bio.appearance': 'Appearance',
  'sheet.bio.personality': 'Personality',
  'sheet.bio.history': 'History & Voices',
  'sheet.bio.body': 'Physical Details',
  'sheet.bio.preference': 'Preferences & Experience',
  'sheet.bio.volatile': 'changes with the story',
  'sheet.bio.adult': 'adult',

  'sheet.vitals.reserved': 'HP / XP pending template support; pin a resource in the resource table to show it here',
  'sheet.empty.skills': 'No skills',
  'sheet.empty.traits': 'No abilities',
  'sheet.empty.statuses': 'No statuses',
  'sheet.empty.bio': 'No biography yet',

  'sheet.page.stats': 'Stats & Abilities',
  'sheet.page.biography': 'Biography',
  'sheet.page.relations': 'Relations',

  'table.view.card': 'Cards',
  'table.view.list': 'List',
  'table.view.calendar': 'Calendar',
  'calendar.storyToday': 'Story date',
  'calendar.prev': 'Previous month',
  'calendar.next': 'Next month',


  'table.search': 'Search all…',
  'table.saved': 'Set {label} to {value}',
  'table.count': '{range} / {total} total',

  'table.broken.title': "This sheet's structure doesn't match what the frontend expects",
  'table.broken.noHeaders': 'No header row was read. The database plugin may still be initialising — try again shortly.',
  'table.broken.onlyRowId': 'No data columns besides the internal primary key, so there is nothing to show.',
  'table.broken.sqlHeaders': 'Column names are in English rather than Chinese, most likely because this sheet lost its schema comments during a rebuild. Contents remain viewable, but features that match on column names will not work.',
  'table.broken.columns': 'Actual columns: {columns}',

  'compat.title': 'Template compatibility',
  'compat.hint': 'Which sheets each feature found in the current database template. Features that cannot be identified are hidden automatically; sheet browsing is unaffected.',
  'compat.none': 'Not found',
  'compat.via.key': 'by sheet id',
  'compat.via.name': 'by sheet name',
  'compat.via.fingerprint': 'inferred from columns',
  'compat.cap.characters': 'Characters',
  'compat.cap.protagonist': 'Protagonist',
  'compat.cap.suggestions': 'Check suggestions',
  'compat.cap.items': 'Items',
  'compat.cap.equipment': 'Equipment',
  'compat.cap.resources': 'Resources',

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

  'settings.title': 'Settings',
  'settings.close': 'Back',
  'settings.cancel': 'Cancel',
  'settings.on': 'On',
  'settings.off': 'Off',

  'settings.group.appearance': 'Appearance',
  'settings.group.layout': 'Layout & Browsing',
  'settings.group.rules': 'Game Mode & Rules',
  'settings.group.interaction': 'Panel & Interaction',
  'settings.group.dock': 'Table Dock',
  'settings.group.about': 'About',
  'settings.group.advanced': 'Advanced',

  'settings.lang.hint': 'Affects the plugin UI only; table content stays as authored',
  'settings.fontScale': 'Font size',

  'settings.dockLayout': 'Dock layout',
  'settings.dock.grid': 'Grid',
  'settings.dock.flow': 'Flow',
  'settings.dockIcons': 'Dock icons',
  'settings.contentHeight': 'Content height',
  'settings.contentHeight.hint': 'Too tall pushes the conversation far down',
  'settings.pageSize': 'Rows per page',
  'settings.fullWidth': 'Width correction',
  'settings.fullWidth.hint': 'Stretch to the chat width. Turn off if layout breaks',

  'settings.sync.title': 'Sync attribute scale to template',
  'settings.sync.hint': "Writes the current rule family's ranges and examples into the template's attribute-rule block",
  'settings.sync.preview': 'Preview changes',
  'settings.sync.apply': 'Write',
  'settings.sync.affected': "Will rewrite: {sheets} (this chat's template copy only)",
  'settings.sync.done': 'Wrote {n} sheet(s)',
  'settings.sync.noTemplate': 'Cannot read the table template; check that the database plugin is ready',
  'settings.sync.noTaggedSheet': 'No sheet in the template has an attribute-rule block',
  'settings.sync.newChat': 'After switching rule families, existing saves keep the old scale; the AI will converge over time. Starting a new chat is recommended for consistent values.',

  'settings.ruleSystem': 'Rule family',
  'settings.ruleSystem.hint': 'Determines resolution and resource types. All three are generic parameterised engines; values come from presets',
  'settings.ruleSystem.licenses': 'Licences and copyright notices are in the About section',
  'about.licenses': 'Licences & Copyright',
  'about.credit': 'Credit: {name} — by {author}',
  'about.licenses.intro': 'These notices are licence conditions of the rule sources. They are always shown in the original English and do not follow the interface language.',
  'about.license.show': 'View full licence',
  'about.license.hide': 'Hide licence',
  'settings.clickSuggestion': 'On suggestion click',
  'settings.clickSuggestion.hint': 'Sending cannot be undone; can fill the composer instead',
  'settings.send.auto': 'Send',
  'settings.send.fill': 'Fill composer',

  'settings.qa.default': 'Default',
  'settings.qa.debug': 'Debug',
  'settings.qa.hint': 'Default allows only NPC archive status; Debug unlocks every enum column for template checks',

  'settings.dockManage': 'Dock entries',
  'settings.dockManage.hint': 'Click to show / hide. Hiding does not affect data',
  'settings.showAll': 'Show all',
  'settings.sheetHide': 'Click to hide',
  'settings.sheetShow': 'Click to show',

  'settings.diagnostics': 'Diagnostics',
  'settings.diag.plugin': 'Database plugin',
  'settings.diag.read': 'Snapshot read',
  'settings.diag.write': 'Write API',
  'settings.diag.send': 'Send channel',
  'settings.diag.sheets': 'Sheets found',
  'settings.reset': 'Reset',
  'settings.reset.hint': 'Clears all preferences except language',
  'settings.reset.confirm': 'Confirm reset?',

  'settings.theme': 'Theme',
  'settings.theme.hint': 'Swatches show the actual palette for your current light/dark setting',
  'settings.mode': 'Mode',
  'settings.mode.light': 'Light',
  'settings.mode.dark': 'Dark',
  'settings.mode.auto': 'Auto',
  'settings.lang': 'Language',

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
