/**
 * 仪表盘预设（1.11）—— 让仪表盘认得别人的模板。
 *
 * `DashboardPage` 顶部那段注释里的问题：「用别的数据库模板的用户看到的
 * 正是这个（如小剧场3.3 没有任何角色表）」。面板不是空，是**根本找不到表**。
 * 预设给识别层补一组表名与列名候选，认得出就点亮。
 *
 * ## 预设是补充，不是替代
 *
 * `sheet-binding` 的三通道（key / 展示名 / 列名指纹）经过十份真实模板的
 * 回归测试，其中 `excludes` 那类规则是踩过坑才有的（指纹曾把主角信息表
 * 误认成角色表，十份里七份中招）。预设若替代它，等于把这些验证过的
 * 规则换成用户手填的关键词。
 *
 * 所以顺序是：**内置绑定先跑，认不出的能力才由预设补**。已经能用的模板
 * 不会因为装了预设而变差。
 *
 * ## 格式与骰子系统一致
 *
 * `acu_dashboard_preset_v1`，两边的预设可以互相导入。本前端用不上的模块
 * （`location` / `quest` 等对应的面板这里没有）**照样解析并保留** ——
 * 丢掉它们会让预设在两个前端之间来回导一次就残缺了。
 *
 * ## 预设只改识别，不改布局
 *
 * 与骰子系统同一条边界：不接受 `layout`、`render`、`display`、自定义 CSS。
 * 一旦允许预设改布局，预设就变成了没人维护得动的小型模板语言。
 */

export const PRESET_FORMAT = 'acu_dashboard_preset_v1';

/** 模块名。前四个本前端会用，其余解析后原样保留。 */
export const MODULE_NAMES = [
  'global', 'player', 'npc', 'bag', 'equip', 'location', 'quest', 'relationshipGraph',
] as const;
export type ModuleName = (typeof MODULE_NAMES)[number];

/** 本前端真正会拿去识别的模块 */
export const USED_MODULES: readonly ModuleName[] = [
  'global', 'player', 'npc', 'bag', 'equip', 'relationshipGraph',
];

export interface PresetModule {
  /** 表展示名的候选关键词。表名**包含**任一关键词即命中。 */
  tableKeywords: string[];
  /** 字段 → 列名关键词。字段名沿用骰子系统的键。 */
  columns: Record<string, string[]>;
}

export interface DashboardPreset {
  name: string;
  description: string;
  modules: Partial<Record<ModuleName, PresetModule>>;
}

export interface ParseResult {
  preset: DashboardPreset | null;
  /** 出错或被忽略的地方。**一条都不能吞** —— 用户手写的 JSON 出错时，
   *  「导入失败」四个字帮不了他找出是哪一行写坏了。 */
  problems: string[];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v !== '');
}

/**
 * 解析一个模块。
 *
 * `columns` 里每一项既接受骰子系统的 `{ keywords: [...] }`，也接受直接给
 * 字符串数组 —— 后者是手写时最自然的写法，为它多写三行比让用户反复试错划算。
 */
function parseModule(name: string, raw: unknown, problems: string[]): PresetModule | null {
  if (!raw || typeof raw !== 'object') {
    problems.push(`模块 ${name}：不是一个对象，已跳过`);
    return null;
  }
  const obj = raw as Record<string, unknown>;

  const tableKeywords = asStringArray(obj.tableKeywords);
  const columns: Record<string, string[]> = {};

  if (obj.columns && typeof obj.columns === 'object') {
    for (const [field, spec] of Object.entries(obj.columns as Record<string, unknown>)) {
      const keywords = Array.isArray(spec)
        ? asStringArray(spec)
        : asStringArray((spec as Record<string, unknown>)?.keywords);
      if (keywords.length === 0) {
        problems.push(`模块 ${name} 的字段 ${field}：没有可用的关键词，已跳过`);
        continue;
      }
      columns[field] = keywords;
    }
  }

  if (tableKeywords.length === 0 && Object.keys(columns).length === 0) {
    problems.push(`模块 ${name}：既没有表名关键词也没有列关键词，已跳过`);
    return null;
  }
  return { tableKeywords, columns };
}

/**
 * 解析预设。
 *
 * 宽进严出：`format` 不对只警告不拒绝（骰子系统的裸 `{ modules }` 对象
 * 也要能导入），但整体结构不成形时返回 null。
 */
export function parsePreset(input: unknown): ParseResult {
  const problems: string[] = [];

  if (!input || typeof input !== 'object') {
    return { preset: null, problems: ['不是一个 JSON 对象'] };
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.format === 'string' && obj.format !== PRESET_FORMAT) {
    problems.push(`format 是「${obj.format}」，期望「${PRESET_FORMAT}」，仍按本格式解析`);
  }

  const rawModules = obj.modules;
  if (!rawModules || typeof rawModules !== 'object') {
    return { preset: null, problems: [...problems, '缺少 modules'] };
  }

  const modules: Partial<Record<ModuleName, PresetModule>> = {};
  for (const [key, raw] of Object.entries(rawModules as Record<string, unknown>)) {
    if (!(MODULE_NAMES as readonly string[]).includes(key)) {
      problems.push(`模块 ${key}：不是已知模块名，已跳过`);
      continue;
    }
    const parsed = parseModule(key, raw, problems);
    if (parsed) modules[key as ModuleName] = parsed;
  }

  if (Object.keys(modules).length === 0) {
    return { preset: null, problems: [...problems, '没有任何可用的模块'] };
  }

  return {
    preset: {
      name: typeof obj.name === 'string' ? obj.name : '未命名预设',
      description: typeof obj.description === 'string' ? obj.description : '',
      modules,
    },
    problems,
  };
}

/** 序列化成可导出的 JSON 文本。带 format 包装，便于与骰子系统互导。 */
export function serializePreset(preset: DashboardPreset): string {
  return JSON.stringify(
    {
      format: PRESET_FORMAT,
      name: preset.name,
      description: preset.description,
      modules: Object.fromEntries(
        Object.entries(preset.modules).map(([name, m]) => [
          name,
          {
            tableKeywords: m.tableKeywords,
            columns: Object.fromEntries(
              Object.entries(m.columns).map(([field, keywords]) => [field, { keywords }]),
            ),
          },
        ]),
      ),
    },
    null,
    2,
  );
}

/**
 * 内置样例。
 *
 * **刻意不为具体模板内置成品预设。** 适配好的模板应当进 `sheet-binding`
 * —— 那里有十份真实模板的回归测试兜底，而预设是用户手填的、没人验证。
 * 把「我们已经适配好的」做成预设，等于把有测试的东西换成没测试的。
 *
 * 所以内置的是一份能照着改的样例：关键词都取自常见叫法，
 * 用户改几个词就能试，比对着文档从空白写起快得多。
 */
export const SAMPLE_PRESET: DashboardPreset = {
  name: '样例：按表名关键词认表',
  description: '把关键词换成你那份模板里的叫法。表名包含任一关键词即命中。',
  modules: {
    global: {
      tableKeywords: ['全局', '世界状态', '时间'],
      columns: {
        currentTime: ['当前时间', '时间'],
        currentLocation: ['当前地点', '所在地点', '地点'],
      },
    },
    npc: {
      tableKeywords: ['角色', '人物', '登场'],
      columns: { name: ['姓名', '名字', '名称'] },
    },
    bag: {
      tableKeywords: ['物品', '背包', '道具'],
      columns: { name: ['物品名称', '名称'] },
    },
    equip: {
      tableKeywords: ['装备', '装扮', '穿戴'],
      columns: { name: ['装备名称', '名称'] },
    },
  },
};

/** 表的最小信息，与 sheet-binding 的 SheetLike 一致，避免依赖 data 层 */
export interface SheetLike {
  key: string;
  name: string;
  headers: readonly string[];
}

/**
 * 用预设在一堆表里找某个模块对应的表。
 *
 * 表名**包含**任一关键词即命中，命中多张时全部返回 —— 与 `findSheetsByName`
 * 同样的理由：有些模板把角色拆成两张并列的表，只取第一张会让另一张
 * 整个消失。
 *
 * 匹配不区分大小写，但不做别的归一（不去空格、不转简繁）：
 * 猜得越多，误命中越多，而误命中显示的是**看起来正常的错误数据**。
 */
export function matchSheets<T extends SheetLike>(
  sheets: readonly T[],
  module: PresetModule | undefined,
): T[] {
  if (!module || module.tableKeywords.length === 0) return [];
  const keywords = module.tableKeywords.map((k) => k.toLowerCase());
  return sheets.filter((s) => {
    const name = s.name.toLowerCase();
    return keywords.some((k) => name.includes(k));
  });
}

/**
 * 用预设在表头里找某个字段对应的列。
 *
 * 先精确匹配再包含匹配 —— 关键词「地点」在有「所在地点」与「地点」两列的
 * 表里应当取后者，包含匹配会按表头顺序取到前者。
 */
export function matchColumn(
  headers: readonly string[],
  module: PresetModule | undefined,
  field: string,
): string | null {
  const keywords = module?.columns[field];
  if (!keywords?.length) return null;

  for (const k of keywords) {
    const exact = headers.find((h) => h === k);
    if (exact) return exact;
  }
  for (const k of keywords) {
    const lower = k.toLowerCase();
    const loose = headers.find((h) => h.toLowerCase().includes(lower));
    if (loose) return loose;
  }
  return null;
}
