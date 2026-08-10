/**
 * 表的识别规则 —— 在别人的数据库模板里找出「哪张表是角色表」这类问题。
 *
 * 三条通道并列，任一命中即可，**不存在谁优先**：
 *
 * - **sheet key**：官方衍生的模板保留原 key（SQL_v4.3、limiz 零随机 key），
 *   但用户重制过的模板会把 key 全换掉（NTRS 8/12、caikis 11/21 是随机 key，
 *   连「重要角色表」都成了 `sheet_NcBlYRH5`）。
 * - **展示名**：反过来，NTRS 的表名规规矩矩就叫「重要角色表」。
 *   实测九份模板中「重要角色表」这个名字命中六份 —— 改名远不如重制常见。
 * - **列名指纹**：两条都不中时的最后手段（caikis 的「追踪人设基线」、
 *   NTRS 的「黄毛表」，key 与名字都对不上）。
 *
 * key 失效于重制，名字失效于改名，两者覆盖的是互不相同的场景。
 * 早先曾以为「key 比展示名稳定、应当 key 优先」，扩大样本后并不成立。
 *
 * 本模块是纯函数，不碰快照，便于单测。
 */

/** 匹配所需的最小信息，避免 domain 依赖 data 层的快照类型 */
export interface SheetLike {
  key: string;
  name: string;
  headers: readonly string[];
}

export type MatchVia = 'key' | 'name' | 'fingerprint';

export interface SheetMatch {
  key: string;
  name: string;
  via: MatchVia;
}

export interface SheetSpec {
  id: string;
  /** sheet key 候选 */
  keys: readonly string[];
  /** 展示名候选 */
  names: readonly string[];
  /**
   * 列名指纹：**全部**列同时存在才算命中。
   *
   * 要求多列同时命中是刻意的 —— 指纹最危险的失败模式是误命中，
   * 而误命中比不命中难排查得多：不命中会显示明确提示，误命中会显示
   * 看起来正常的错误数据。宁可判不出，也不要判错。
   */
  fingerprint?: readonly string[];
  /**
   * 已被这些规格认走的表不再参与本规格的匹配。
   *
   * 用于把列结构相近、语义却不同的表分开 —— 见 CHARACTERS 的说明。
   */
  excludes?: readonly SheetSpec[];
}

/**
 * 主角信息。
 *
 * **刻意不加指纹**：主角表计划在下个代号版本并入重要角色表 ——
 * 主角是一种角色，不是一张表。现在为「主角表」这个概念加固，
 * 合并时就要拆掉。这里只做最小的双通道匹配。
 */
export const PROTAGONIST: SheetSpec = {
  id: 'protagonist',
  keys: ['sheet_protagonist'],
  names: ['主角信息', '主角信息表'],
};

/**
 * 角色表。
 *
 * 「恋爱对象表」与「重要角色表」在定位上是同一类东西 —— 都是值得单独建档、
 * 会持续互动的角色（列结构不一定相同）。YO、瑟瑟灵感系把它们拆成并列的
 * 两张表，因此这里的匹配结果**可能有多张**，调用方必须全部读取。
 */
export const CHARACTERS: SheetSpec = {
  id: 'characters',
  keys: ['sheet_important_npc', 'sheet_romance_targets', 'sheet_important_non_romance'],
  // 1.1 起自家模板把主角并入本表并改名「角色表」；旧名保留，用户可能还没重导
  names: ['角色表', '追踪角色表', '重要角色表', '重要人物表', '恋爱对象表'],
  // 这三列在九份模板的各类角色表里都稳定存在，正是「定位相同」的那部分；
  // 恋爱内容之类会变的部分不进指纹。
  fingerprint: ['姓名', '基础属性', '特有属性'],
  /*
   * **主角表必须排除。** 它的列结构与角色表几乎一样 —— 姓名、基础属性、
   * 特有属性一个不少，指纹必然误命中：实测十份模板里七份中招，
   * 后果是主角在「重要角色」列表里重复出现一遍。
   *
   * 这正是指纹最危险的失败模式：不命中会显示明确提示，误命中却显示
   * 一份看起来正常的错误数据，很难被发现。
   *
   * **1.1 合并主角表之后这条依然要留着。** 曾预计「主角并入角色表后
   * PROTAGONIST 规格会消失、这条排除随之移除」，但那只对自家模板成立：
   * 外部模板不会跟着合并，它们的主角表照样会被指纹误命中。
   * 合并改变的是自家模板的形态，不是兼容层的职责。
   */
  excludes: [PROTAGONIST],
};

/** 检定建议。`展示文本` + `骰子命令` 这对列名在九份模板里完全一致。 */
export const SUGGESTIONS: SheetSpec = {
  id: 'suggestions',
  keys: ['sheet_check_suggestions', 'sheet_bwxtt33d5'],
  names: ['检定建议表'],
  fingerprint: ['展示文本', '骰子命令'],
};

export const ITEMS: SheetSpec = {
  id: 'items',
  keys: ['sheet_inventory'],
  // NTRS 叫「背包物品表」，秋枫暮霞叫「重要物品表」
  names: ['物品表', '背包物品表', '重要物品表'],
};

export const EQUIPMENT: SheetSpec = {
  id: 'equipment',
  keys: ['sheet_equipment'],
  names: ['装备表'],
};

/**
 * 全局状态（1.11）—— 当前时间与所在地点，仪表盘的全局面板用。
 *
 * 指纹只要「当前时间」一列。这张表在各家模板里叫法差得远（全局数据表、
 * 世界状态表、时间地点表），但凡有这个概念的模板都会有一列时间；
 * 要求更多列同时命中会把大多数模板挡在外面，而这块面板认不出就整块消失，
 * 误命中的代价只是显示一个空面板 —— 与角色表那种「显示错人」不同。
 */
export const GLOBAL: SheetSpec = {
  id: 'global',
  keys: ['sheet_global', 'sheet_global_data'],
  names: ['全局数据表', '全局数据', '世界状态表', '全局状态表'],
  fingerprint: ['当前时间'],
};

/**
 * 人物关系（1.11）—— 关系图面板用。
 *
 * 指纹要求两个角色列同时存在：只有一列角色名的表（大事记、日记）与它
 * 列结构相近，而关系图误认出这类表会画出一张**看起来正常的错误图**。
 */
export const RELATIONS: SheetSpec = {
  id: 'relations',
  keys: ['sheet_relations'],
  names: ['关系表', '人物关系表', '关系网络表'],
  fingerprint: ['角色A', '角色B'],
};

/** 角色资源。九份外部模板无一具备 —— 认不出时该让资源能力整体消失。 */
export const RESOURCES: SheetSpec = {
  id: 'resources',
  keys: ['sheet_resources'],
  names: ['角色资源表'],
  fingerprint: ['资源ID', '当前值', '上限'],
};

function hasAll(headers: readonly string[], required: readonly string[]): boolean {
  return required.every((c) => headers.includes(c));
}

/**
 * 找出符合规格的全部表，保持传入顺序。
 *
 * 同一张表只会出现一次，`via` 记录它是怎么被认出来的 ——
 * 供诊断面板说明「这张表是靠指纹推测的」。
 */
export function matchSheets(spec: SheetSpec, sheets: readonly SheetLike[]): SheetMatch[] {
  // 排除项先解析：被别的规格认走的表不参与本轮匹配
  const taken = new Set(
    (spec.excludes ?? []).flatMap((ex) => matchSheets(ex, sheets).map((m) => m.key)),
  );

  const out: SheetMatch[] = [];
  for (const s of sheets) {
    if (taken.has(s.key)) continue;
    const via: MatchVia | null = spec.keys.includes(s.key)
      ? 'key'
      : spec.names.includes(s.name)
        ? 'name'
        : spec.fingerprint && hasAll(s.headers, spec.fingerprint)
          ? 'fingerprint'
          : null;
    if (via) out.push({ key: s.key, name: s.name, via });
  }
  return out;
}

/** 是否至少命中一张 */
export function hasMatch(spec: SheetSpec, sheets: readonly SheetLike[]): boolean {
  return matchSheets(spec, sheets).length > 0;
}
