/**
 * 交互规则（1.11）—— 移植自骰子系统的「交互总览」。
 *
 * 一句话：**把表里的每一行变成一个能点的对象**。表名决定它属于哪个分区、
 * 能做哪些动作；点动作就按模板生成一句话发给 AI。
 *
 * ## 格式与骰子系统一致
 *
 * `acu_action_preset_v1`，字段名照搬（`table_keywords` 的蛇形命名也保留），
 * 两边的规则预设可以互相导入。骰子系统的内置默认规则原样带过来 ——
 * 那套动词是社区里用熟了的，改掉只会让从骰子系统过来的人重新适应。
 *
 * ## 模板里的两个占位
 *
 * - `{Name}`：对象名
 * - `<user>`：主角。蔷薇这边由 `data/persona` 的 `replaceUserPlaceholders`
 *   统一展开，它同时认 `{{user}}` 与 `<user>`，所以骰子系统的模板直接可用。
 *
 * 本模块是纯函数，不碰快照与 window，便于单测。
 */

export const ACTION_PRESET_FORMAT = 'acu_action_preset_v1';

/** 一个可点的动作 */
export interface ActionItem {
  label: string;
  /** 文本模板，含 `{Name}` 与 `<user>` */
  template: string;
}

/** 一条规则：表名命中任一关键词的表，都拥有这组动作 */
export interface ActionRule {
  tableKeywords: string[];
  actions: ActionItem[];
}

export interface ActionPreset {
  name: string;
  description: string;
  rules: ActionRule[];
}

/**
 * 分区。顺序即展示顺序 —— 角色在最前，因为交互绝大多数发生在人身上。
 *
 * `keywords` 与规则里的 `table_keywords` 是两套东西：这里决定表**归到哪一栏**，
 * 那里决定表**有哪些动作**。分开是刻意的 —— 用户改了动作规则不该让分区跟着乱，
 * 而一张认不出分区的表仍然可以有动作（落到「通用」栏）。
 */
export type SectionKind =
  | 'character' | 'map' | 'item' | 'equipment' | 'task' | 'skill' | 'faction' | 'generic';

export interface SectionMeta {
  kind: SectionKind;
  keywords: readonly string[];
  /** 命中这些词就**不**算这个分区，即便 keywords 也命中了。见 ATTACHMENT_KEYWORDS。 */
  exclude?: readonly string[];
}

/**
 * 附表关键词 —— 「某个对象的附属数据」，不是对象本身。
 *
 * 「角色资源表」「重要角色生理」都含「角色」，但它们的每一行不是一个角色，
 * 而是某个角色的一项数据。不排掉的话，一个角色会按他有几条资源、
 * 几张附表重复出现几次 —— 实测一个角色刷了 6 遍。
 *
 * 这些词只用于**分区归属**：一张附表仍可能落到「通用」栏，
 * 由 `interaction-repo` 的名称列判定决定它到底收不收。
 */
const ATTACHMENT_KEYWORDS = [
  '资源', '属性', '生理', '心理', '临场', '记忆', '关系',
  '日记', '日志', '记录', '实录', '大事记', '纪要', '小传',
];

export const SECTIONS: readonly SectionMeta[] = [
  {
    kind: 'character',
    keywords: ['主角', '角色', '人物', 'NPC', 'npc', '女主', '关键人物', '重要人物', '伙伴', '队友', '恋爱对象'],
    exclude: ATTACHMENT_KEYWORDS,
  },
  {
    kind: 'map',
    keywords: ['地点', '地图', 'Location', 'Map', '世界', '场所', '地区', '位置', '地标'],
    exclude: ATTACHMENT_KEYWORDS,
  },
  { kind: 'item', keywords: ['物品', '背包', '道具', '材料', '消耗品'], exclude: ATTACHMENT_KEYWORDS },
  { kind: 'equipment', keywords: ['装备', '武器', '防具', '护甲', '饰品', '装扮'], exclude: ATTACHMENT_KEYWORDS },
  { kind: 'task', keywords: ['任务', '备忘', '事项', '委托', '目标'], exclude: ATTACHMENT_KEYWORDS },
  { kind: 'skill', keywords: ['技能', '能力', '法术', '神通', '特性'], exclude: ATTACHMENT_KEYWORDS },
  { kind: 'faction', keywords: ['势力', '组织', '阵营', '派系'], exclude: ATTACHMENT_KEYWORDS },
];

/** 认不出分区的表落这里，而不是被丢掉 —— 它仍然可能有动作 */
export const DEFAULT_SECTION: SectionKind = 'generic';

/**
 * 这张表是不是某个对象的附属数据。
 *
 * 动作匹配也要用它：用户配的规则写着「角色」，不该让「角色资源表」
 * 也长出「交谈/观察/战斗」三个按钮。放在这里而不是让每个用户在自己的
 * 规则里写排除词 —— 那是所有人都要重复一遍的同一件事。
 */
export function isAttachmentSheet(sheetName: string): boolean {
  const name = sheetName.toLowerCase();
  return ATTACHMENT_KEYWORDS.some((k) => name.includes(k.toLowerCase()));
}

/**
 * 内置默认规则。**原样取自骰子系统**，连动词都没改。
 *
 * 这套动词是社区用熟了的，换一批只会让从骰子系统过来的人重新适应，
 * 而它们本来就是「够用且不出错」的通用动作。
 */
export const BUILTIN_ACTIONS: ActionPreset = {
  name: '默认交互规则',
  description: '基于表格类型的默认交互选项，涵盖地点、人物、物品、装备、技能、任务、势力',
  rules: [
    {
      tableKeywords: ['地点', '地图', 'Location', 'Map', '世界', '场所'],
      actions: [
        { label: '前往', template: '<user>前往{Name}。' },
        { label: '探索', template: '<user>探索{Name}。' },
        { label: '停留', template: '<user>在{Name}停留。' },
      ],
    },
    {
      tableKeywords: ['人物', 'NPC', '重要人物', '角色', '女主', '恋爱对象'],
      actions: [
        { label: '交谈', template: '<user>与{Name}交谈。' },
        { label: '观察', template: '<user>观察{Name}。' },
        { label: '战斗', template: '<user>与{Name}战斗。' },
      ],
    },
    {
      tableKeywords: ['物品', '背包', '道具'],
      actions: [
        { label: '使用', template: '<user>使用了{Name}。' },
        { label: '查看', template: '<user>查看了{Name}。' },
        { label: '丢弃', template: '<user>丢弃了{Name}。' },
      ],
    },
    {
      tableKeywords: ['装备', '武器', '防具'],
      actions: [
        { label: '装备', template: '<user>装备了{Name}。' },
        { label: '卸下', template: '<user>卸下了{Name}。' },
        { label: '卖出', template: '<user>卖出了{Name}。' },
      ],
    },
    {
      tableKeywords: ['技能', '能力'],
      actions: [
        { label: '使用', template: '<user>使用{Name}。' },
        { label: '练习', template: '<user>练习{Name}。' },
      ],
    },
    {
      tableKeywords: ['备忘', '任务', '事项'],
      actions: [
        { label: '追踪', template: '<user>将{Name}设为当前追踪目标。' },
        { label: '整理', template: '<user>整理关于{Name}的信息。' },
        { label: '放弃', template: '<user>放弃了{Name}。' },
      ],
    },
    {
      tableKeywords: ['势力', '组织', '阵营'],
      actions: [
        { label: '打探', template: '<user>打探{Name}的情报。' },
        { label: '加入', template: '<user>申请加入{Name}。' },
        { label: '合作', template: '<user>向{Name}请求合作。' },
      ],
    },
  ],
};

/** 表归到哪个分区。命中多条时取第一条 —— SECTIONS 的顺序即优先级。 */
export function sectionOf(sheetName: string): SectionKind {
  const name = sheetName.toLowerCase();
  const hit = SECTIONS.find(
    (s) =>
      s.keywords.some((k) => name.includes(k.toLowerCase())) &&
      !s.exclude?.some((k) => name.includes(k.toLowerCase())),
  );
  return hit?.kind ?? DEFAULT_SECTION;
}

/**
 * 一张表有哪些动作。
 *
 * 多条规则命中时**全部合并**，按 label 去重（先出现的胜）。
 * 「恋爱对象表」既像人物又像角色，两条规则都命中是常态，
 * 只取第一条会让用户少掉一半动作。
 */
export function actionsForSheet(preset: ActionPreset, sheetName: string): ActionItem[] {
  // 附表一律没有动作：「角色资源表」不该长出「交谈/观察/战斗」
  if (isAttachmentSheet(sheetName)) return [];

  const name = sheetName.toLowerCase();
  const out: ActionItem[] = [];
  const seen = new Set<string>();

  for (const rule of preset.rules) {
    if (!rule.tableKeywords.some((k) => name.includes(k.toLowerCase()))) continue;
    for (const action of rule.actions) {
      if (seen.has(action.label)) continue;
      seen.add(action.label);
      out.push(action);
    }
  }
  return out;
}

/**
 * 渲染模板。
 *
 * 只替换 `{Name}`。`<user>` 留给 `replaceUserPlaceholders` —— 那是 data 层
 * 的事（要读 persona），domain 不该知道当前是谁在玩。
 */
export function renderTemplate(template: string, name: string): string {
  return template.replace(/\{Name\}/g, name);
}

export interface ParseResult {
  preset: ActionPreset | null;
  /** 出错或被忽略的地方。一条都不吞 —— 手写 JSON 出错是常态。 */
  problems: string[];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

/**
 * 解析规则预设。
 *
 * 同时认蛇形 `table_keywords`（骰子系统的写法）与驼峰 `tableKeywords` ——
 * 从骰子系统导过来的预设必须原样能用，那是这套格式存在的全部意义。
 */
export function parseActionPreset(input: unknown): ParseResult {
  const problems: string[] = [];
  if (!input || typeof input !== 'object') {
    return { preset: null, problems: ['不是一个 JSON 对象'] };
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.format === 'string' && obj.format !== ACTION_PRESET_FORMAT) {
    problems.push(`format 是「${obj.format}」，期望「${ACTION_PRESET_FORMAT}」，仍按本格式解析`);
  }
  if (!Array.isArray(obj.rules)) {
    return { preset: null, problems: [...problems, '缺少 rules'] };
  }

  const rules: ActionRule[] = [];
  obj.rules.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      problems.push(`第 ${i + 1} 条规则不是一个对象，已跳过`);
      return;
    }
    const r = raw as Record<string, unknown>;
    const tableKeywords = asStringArray(r.table_keywords ?? r.tableKeywords);
    if (tableKeywords.length === 0) {
      problems.push(`第 ${i + 1} 条规则没有表名关键词，已跳过`);
      return;
    }

    const actions: ActionItem[] = [];
    for (const rawAction of Array.isArray(r.actions) ? r.actions : []) {
      const a = rawAction as Record<string, unknown>;
      const label = asString(a?.label);
      const template = asString(a?.template);
      if (!label || !template) {
        problems.push(`第 ${i + 1} 条规则里有动作缺少 label 或 template，已跳过`);
        continue;
      }
      actions.push({ label, template });
    }

    if (actions.length === 0) {
      problems.push(`第 ${i + 1} 条规则没有可用的动作，已跳过`);
      return;
    }
    rules.push({ tableKeywords, actions });
  });

  if (rules.length === 0) {
    return { preset: null, problems: [...problems, '没有任何可用的规则'] };
  }

  return {
    preset: {
      name: asString(obj.name) || '未命名规则',
      description: asString(obj.description),
      rules,
    },
    problems,
  };
}

/** 序列化。用蛇形键，与骰子系统互导。 */
export function serializeActionPreset(preset: ActionPreset): string {
  return JSON.stringify(
    {
      format: ACTION_PRESET_FORMAT,
      name: preset.name,
      description: preset.description,
      rules: preset.rules.map((r) => ({
        table_keywords: r.tableKeywords,
        actions: r.actions.map((a) => ({ label: a.label, template: a.template })),
      })),
    },
    null,
    2,
  );
}
