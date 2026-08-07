/**
 * 属性预设 —— 每个规则族一份，决定属性的**生成公式与取值范围**。
 *
 * 结构对齐骰子系统的 `acu_attr_preset_v1`：每条属性三件事 ——
 * 生成公式、取值范围、成长修正。`formula` 里可以引用其他属性名
 * （如 `敏捷/2`），派生属性因此不需要额外机制。
 *
 * ## 为什么属性名三族共用
 *
 * 六个基础属性名（力量/敏捷/体质/智力/感知/魅力）在三族里保持一致。
 * 属性是打包在单个文本列里的（`力量:62; 敏捷:87`），换族时若连名字也换，
 * 已有存档的每一行都会失配。共用名字后，换族只改**量纲**，
 * 旧数据仍能被读出来，只是数值偏大或偏小 —— 由 AI 在后续剧情中自行收敛。
 *
 * ## range 与 formula 的关系
 *
 * `range` 是该属性的**合法区间**，`formula` 只是初始生成手段，
 * 生成结果会被夹到 range 内。两者可以不等宽：BRP 的 `3d6*5` 掷出 15–90，
 * 但 range 是 [5,95] —— 因为重伤、肾上腺素这类临场状态会把当前值推出生成范围。
 */
import type { RuleFamily } from './rule-systems';

export interface AttributeSpec {
  name: string;
  /** 初始生成公式 */
  formula: string;
  /** 合法区间，生成结果会被夹进来 */
  range: readonly [number, number];
  /** 成长检定的加值公式 */
  modifier?: string;
  /**
   * 关联的基础属性。仅特有属性用，且仅在 `linksToBase` 的族里有意义。
   * 会写进打包串的第三段：`铁匠工具:6:力量`
   */
  key?: string;
}

export interface AttributePreset {
  family: RuleFamily;
  /** 量纲的一句话说明，写进模板 note 供 AI 参考 */
  summary: { 'zh-CN': string; 'en-US': string };
  base: readonly AttributeSpec[];
  special: readonly AttributeSpec[];
  /** 属性标尺的分档标签，从低到高 */
  bands: readonly string[];
  /**
   * 基础属性的调整值规则。有值时前端从能力值推算调整值并展示（`24 +7`），
   * 检定时一并传给检定模块。
   *
   * **只作用于基础属性。** 特有属性看 `specialKind`。
   *
   * 模板里只存能力值本身，不存调整值 —— 两个数放在同一列会让 AI
   * 有机会写出互相矛盾的一对，而调整值本来就是能算出来的。
   */
  modifierRule?: 'dnd';
  /**
   * 特有属性记的是什么。
   *
   * - `value`：绝对值（百分骰族的技能百分比、骰池族的点数）
   * - `bonus`：**加值本身**（d20 族，参照 Pathfinder 1e 的技能加值）
   *
   * 这两者不能混：把 d20 的技能加值当绝对值去推调整值，会得出
   * 「加值 25 → 再 +7」这种双重计算。
   */
  specialKind: 'value' | 'bonus';
  /**
   * 括号语义说明。三族不同，必须写进模板 —— 否则 AI 会照着别族的
   * 写法生成，比如给百分骰族的一条技能塞进三个专精。
   */
  specialtyNote: { 'zh-CN': string; 'en-US': string };
  /**
   * 特有属性与技能是否需要关联一项基础属性。
   *
   * d20 与百分骰族要求填写（打包串写作 `野猪狩猎:7:敏捷`）；
   * 骰池族的技能自带独立点数，不挂靠基础属性。
   */
  linksToBase: boolean;
}

const SIX = ['力量', '敏捷', '体质', '智力', '感知', '魅力'] as const;

function six(formula: string, range: readonly [number, number], modifier?: string): AttributeSpec[] {
  return SIX.map((name) => ({ name, formula, range, modifier }));
}

export const ATTRIBUTE_PRESETS: Record<RuleFamily, AttributePreset> = {
  /**
   * 百分骰族。数值即成功率，检定为 d100 ≤ 目标值。
   * 区间沿用模板现有的 [5,95] / [0,100]，切到本族不改变量纲 ——
   * 模板本来就是按这一族写的。
   */
  brp: {
    family: 'brp',
    summary: {
      'zh-CN': '数值即成功率百分比，检定掷 d100，结果不大于目标值即成功。',
      'en-US': 'Values are success percentages; roll d100 under the target.',
    },
    base: six('3d6*5', [5, 95], '1d10-5'),
    special: [
      { name: '驾驶（汽车）', formula: '5+4d20', range: [0, 100], key: '敏捷' },
      { name: '置闰仪式', formula: '1+2d20', range: [0, 100], key: '智力' },
      { name: '语言（弗里吉亚语）', formula: '5+3d20', range: [0, 100], key: '智力' },
      { name: '图书馆使用', formula: '5+4d20', range: [0, 100], key: '智力' },
      { name: '格斗（电锯）', formula: '5+4d20', range: [0, 100], key: '力量' },
    ],
    bands: ['能力缺失', '弱项', '平均', '精英', '极限', '破格'],
    specialKind: 'value',
    linksToBase: true,
    specialtyNote: {
      'zh-CN':
        '技能名中的括号是专精方向。**每个专精是一条独立技能**，' +
        '同名不同专精之间互不关联、各自单独记值 —— ' +
        '「乐器（卡祖笛）」与「乐器（三角铁）」是两条毫无关系的技能。',
      'en-US':
        'Parentheses mark a specialty. **Each specialty is its own skill** with its ' +
        'own rating; "Instrument (kazoo)" and "Instrument (triangle)" are unrelated.',
    },
  },

  /**
   * d20 族。基础与特有属性都存**能力值本身**，调整值由前端推算。
   *
   * 不让模板存调整值：两个数放在同一列，AI 有机会写出互相矛盾的一对
   * （`力量:8 +3`），而调整值本来就是能算出来的。存一份、算一份最稳。
   */
  d20: {
    family: 'd20',
    summary: {
      'zh-CN':
        '基础属性填能力值本身（3-20），其调整值由前端按 (值-10)/2 向下取整算出；' +
        '特有属性则直接填**检定加值**。检定掷 d20 加上对应加值，' +
        '达到或超过难度值即成功。',
      'en-US':
        'Base abilities are scores (3-20); their modifier is derived as ' +
        'floor((score - 10) / 2). Special attributes store the check bonus directly. ' +
        'Roll d20 plus the relevant bonus against a DC.',
    },
    base: six('4d6dl1', [3, 20], '1d4-2'),
    /*
     * 特有属性记**加值本身**，参照 Pathfinder 1e 的技能加值 ——
     * 那里一条技能的加值已经把属性调整、等级、熟练全算进去了。
     * 检定就是 d20 + 该加值，不再二次推算。
     */
    special: [
      { name: '专业（屠夫）', formula: '1d8-2', range: [-5, 25], key: '感知' },
      { name: '赌具（游戏王）', formula: '1d8-2', range: [-5, 25], key: '感知' },
      { name: '铁匠工具', formula: '1d8-2', range: [-5, 25], key: '力量' },
      { name: '法术辨识', formula: '1d8-2', range: [-5, 25], key: '智力' },
      { name: '使用魔法装置', formula: '1d8-2', range: [-5, 25], key: '魅力' },
    ],
    bands: ['羸弱', '低于常人', '常人', '出众', '卓越', '传奇'],
    modifierRule: 'dnd',
    specialKind: 'bonus',
    linksToBase: true,
    specialtyNote: {
      'zh-CN':
        '技能名中的括号是专精方向。**每个专精是一条独立技能**，' +
        '同名不同专精之间互不关联、各自单独记值 —— ' +
        '「乐器（卡祖笛）」与「乐器（三角铁）」是两条毫无关系的技能。',
      'en-US':
        'Parentheses mark a specialty. **Each specialty is its own skill** with its ' +
        'own rating; "Instrument (kazoo)" and "Instrument (triangle)" are unrelated.',
    },
  },

  /**
   * d10 骰池族。属性与技能都是 1–5 点，检定掷「属性+技能」颗 d10 数成功。
   * 点数少、每一点权重大，因此**不要按百分比思维填值** —— 4 点已是精通。
   */
  d10: {
    family: 'd10',
    summary: {
      'zh-CN':
        '属性与技能均为 0-5 点。检定掷「属性+技能」颗 d10，' +
        '每颗达到成功线记 1 个成功。点数权重大，4 点即为精通。',
      'en-US':
        'Attributes and skills are 0-5 dots. Roll a pool of (attribute + skill) d10 ' +
        'and count successes. Four dots already means mastery.',
    },
    base: six('1d3+1', [1, 5]),
    special: [
      { name: '格斗（对持械凡人、酒馆斗殴、对吸血鬼）', formula: '1d3+1', range: [0, 5] },
      { name: '运动（忍耐）', formula: '1d3', range: [0, 5] },
      { name: '白刃（木桩）', formula: '1d3', range: [0, 5] },
      { name: '潜行', formula: '1d3', range: [0, 5] },
      { name: '威吓（侮辱、瞪眼）', formula: '1d3', range: [0, 5] },
    ],
    bands: ['无能', '生疏', '普通', '熟练', '精通'],
    specialKind: 'value',
    // 骰池族的技能自带独立点数，检定掷「属性+技能」颗骰，
    // 关联关系体现在骰池组成上，不需要在数据里再挂一次
    linksToBase: false,
    specialtyNote: {
      'zh-CN':
        '技能名中的括号是**专精**，一个技能可以有多个专精，' +
        '专精并不会拆成独立技能，用顿号分隔' +
        '（如「格斗（对持械凡人、酒馆斗殴、对吸血鬼）」是一条技能）。' +
        '专精只在契合的场合提供额外骰，不改变技能本身的点数。',
      'en-US':
        'Parentheses mark specialties. One skill may carry several, separated by 、; ' +
        'they are not split into separate skills and add dice only in fitting situations.',
    },
  },
};

/** 属性分类。两者的调整值语义不同，不能共用一套推算。 */
export type AttributeKind = 'base' | 'special';

/**
 * 属性值 → 调整值。没有调整值概念时返回 null。
 *
 * - 基础属性（d20 族）：`floor((值 - 10) / 2)`，10→+0、24→+7、6→−2
 * - 特有属性（d20 族）：值**本身就是加值**，不再推算，返回 null
 * - 其余族：无调整值概念，返回 null
 *
 * 分开处理是必须的：把技能加值 25 当能力值去推，会得出「25 再 +7」
 * 这种双重计算 —— 那正是改造前界面上显示的样子。
 */
export function attributeModifier(
  family: RuleFamily,
  value: number,
  kind: AttributeKind = 'base',
): number | null {
  const preset = getAttributePreset(family);
  if (!Number.isFinite(value)) return null;
  if (kind === 'special') return null;
  if (preset.modifierRule !== 'dnd') return null;
  return Math.floor((value - 10) / 2);
}

/**
 * 检定时该属性提供的加值。
 *
 * 基础属性走调整值推算，特有属性按 `specialKind` 决定：
 * 记加值的族直接用值本身，记绝对值的族没有加值（返回 0）。
 */
export function checkBonus(
  family: RuleFamily,
  value: number,
  kind: AttributeKind,
): number {
  const preset = getAttributePreset(family);
  if (!Number.isFinite(value)) return 0;
  if (kind === 'special') return preset.specialKind === 'bonus' ? value : 0;
  return attributeModifier(family, value, 'base') ?? 0;
}

/** 带正负号的显示形式：`+7` / `-2` / `+0` */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : String(mod);
}

export function getAttributePreset(family: RuleFamily): AttributePreset {
  return ATTRIBUTE_PRESETS[family] ?? ATTRIBUTE_PRESETS.brp;
}

/** 一组属性的全局区间，取各条 range 的并集 —— 不另设字段，避免与公式不一致 */
export function unionRange(specs: readonly AttributeSpec[]): [number, number] {
  if (!specs.length) return [0, 100];
  return [
    Math.min(...specs.map((s) => s.range[0])),
    Math.max(...specs.map((s) => s.range[1])),
  ];
}

/**
 * 按区间与档位标签生成属性标尺，形如
 * `5-14:能力缺失 | 15-41:弱项 | …`
 *
 * 分档不等宽：低段窄、高段更窄，中段最宽 —— 绝大多数角色落在中段，
 * 等宽分档会让「平均」这一档失去区分度。
 */
export function buildScale(range: readonly [number, number], bands: readonly string[]): string {
  const [lo, hi] = range;
  const span = hi - lo;
  const n = bands.length;
  if (span <= 0 || n === 0) return '';

  // 权重：两端窄、中间宽
  const weights = bands.map((_, i) => {
    const d = Math.abs(i - (n - 1) / 2);
    return 1 + (n / 2 - d);
  });
  const sum = weights.reduce((a, b) => a + b, 0);

  const parts: string[] = [];
  let cur = lo;
  bands.forEach((label, i) => {
    const isLast = i === n - 1;
    const width = Math.max(1, Math.round((span * weights[i]) / sum));
    const end = isLast ? hi : Math.min(hi - (n - 1 - i), cur + width - 1);
    // 单值档写成 `3:普通` 而不是 `3-3:普通` —— 骰池族的 1-5 刻度每档只有
    // 一个值，写成区间形式既啰嗦又像是哪里算错了
    parts.push(cur === end ? `${cur}:${label}` : `${cur}-${end}:${label}`);
    cur = end + 1;
  });
  return parts.join(' | ');
}
