/**
 * 角色卡的数据来源与关联规则（开发文档 §8.3，四页版）。
 *
 * **本文件是模板改动时唯一需要改的地方。** 各表如何认定「这一行属于哪个
 * 角色」目前并不统一 —— 多数表有 `持有人`，但 `追踪大事记` 用 `记录者`、
 * `性爱生涯实录` 用 `主角外对象`。把这些差异集中在这里，上层只问
 * 「这个角色在这一区有哪些行」，不关心是靠哪一列匹配的。
 *
 * 表名与列名都按**展示名**匹配并留候选，模板改名不至于整块失效。
 */

/** 角色卡的四个页签 */
export type SheetTab = 'summary' | 'inventory' | 'feature' | 'bio';

export interface SectionSpec {
  /** 分区标识，同时用作 i18n 键后缀 */
  id: string;
  tab: SheetTab;
  /** 表的展示名候选 */
  sheets: readonly string[];
  /**
   * 用于匹配角色的列，按序尝试第一个存在的。
   * 空数组表示整表只有一行属于该角色（生理 / 心理走 `姓名`，仍在此列出）。
   */
  ownerColumns: readonly string[];
  /**
   * 主角是否拥有整表。
   *
   * `性爱生涯实录` 的 `主角外对象` 记的是**对方**，每一行都隐含主角参与；
   * 因此主角应看到全部行，其他角色只看到自己作为对象的那些。
   * 这是数据结构决定的不对称，不是设计选择。
   */
  allForProtagonist?: boolean;
  /** 该分区一个角色至多一行（生理、心理） */
  single?: boolean;
}

export const SECTIONS: readonly SectionSpec[] = [
  // ── 总览 ──
  { id: 'resources', tab: 'summary', sheets: ['角色资源表'], ownerColumns: ['持有人'] },
  { id: 'skills', tab: 'summary', sheets: ['技能表'], ownerColumns: ['持有人'] },

  // ── 库存 ──
  { id: 'equipment', tab: 'inventory', sheets: ['装备表'], ownerColumns: ['持有人'] },
  { id: 'items', tab: 'inventory', sheets: ['物品表'], ownerColumns: ['持有人'] },

  // ── 特性 ──
  { id: 'traits', tab: 'feature', sheets: ['特性表'], ownerColumns: ['持有人'] },
  { id: 'statuses', tab: 'feature', sheets: ['状态表'], ownerColumns: ['持有人'] },

  // ── 传记 ──
  {
    id: 'physiology',
    tab: 'bio',
    sheets: ['重要角色生理'],
    ownerColumns: ['姓名'],
    single: true,
  },
  {
    id: 'psychology',
    tab: 'bio',
    sheets: ['重要角色心理'],
    ownerColumns: ['姓名'],
    single: true,
  },
  { id: 'chronicle', tab: 'bio', sheets: ['追踪大事记'], ownerColumns: ['记录者'] },
  {
    id: 'intimacy',
    tab: 'bio',
    sheets: ['性爱生涯实录'],
    ownerColumns: ['主角外对象'],
    allForProtagonist: true,
  },
  // 关系表两列都可能是本人，匹配任一即可
  { id: 'relations', tab: 'bio', sheets: ['关系表'], ownerColumns: ['角色A', '角色B'] },
];

/**
 * 属性来源：主角与其他重要角色分处两表。
 *
 * 候选名需与 data/repositories/character-repo 的 PROTAGONIST_NAMES /
 * NPC_NAMES 保持一致 —— 两处认得的表不一样时，仪表盘上有的角色在
 * 属性同步里会突然不存在。
 */
export const ATTRIBUTE_SOURCES = {
  protagonist: ['主角信息', '主角信息表'],
  npc: ['追踪角色表', '重要角色表', '重要人物表', '恋爱对象表'],
} as const;

/**
 * 传记页的分区顺序与归组（文档 §8.3b）。
 *
 * 「近期变化」置顶且需视觉区分 —— 它是唯一随剧情变动的部分，
 * 与静态设定混排会让人看不出哪些是「当下」、哪些是「设定」。
 */
export const BIO_GROUPS: ReadonlyArray<{
  id: string;
  /** 心理/生理表中归入本组的列（展示名） */
  columns: readonly string[];
  /** 随剧情变动，需视觉区分 */
  volatile?: boolean;
  /** 成人向，默认折叠且记忆状态 */
  adult?: boolean;
}> = [
  {
    id: 'recent',
    volatile: true,
    columns: [
      '近期情绪状态', '对主角的互动逻辑', '被强化的性格侧面',
      '被弱化的性格侧面', '行为模式变化', '生理状态',
    ],
  },
  {
    id: 'appearance',
    columns: [
      '相貌', '常用发型', '身高/体重', '身材/特异性征', '体格/胸围',
      '胸膛外观', '腰腹外观', '臀部外观', '腿部外观', '体毛', '清洁度',
    ],
  },
  {
    id: 'personality',
    columns: [
      '性格主色调', '主色调衍生一', '主色调衍生二', '主色调衍生三', '主色调用语把捉',
      '性格底色', '底色衍生一', '底色衍生二', '底色衍生三', '底色用语把捉',
      '性格点缀', '点缀衍生一', '点缀衍生二', '点缀衍生三', '点缀用语把捉',
    ],
  },
  { id: 'history', columns: ['履历', '他者声部', '作者声部'] },
  {
    id: 'body',
    adult: true,
    columns: [
      '口腔', '肩颈腋窝', '肌肤触感', '身体气味', '阴茎与阴囊', '后庭剖面',
      '肛门', '足码/脚型', '足部外观', '泌乳与特殊体液', '敏感部位',
      '龟头与包皮', '前列腺',
    ],
  },
  {
    id: 'preference',
    adult: true,
    columns: [
      '喜好日常衣物', '喜好NSFW衣物', '喜好体位1', '喜好原因1', '喜好体位2',
      '喜好原因2', '喜好玩法', '喜好原因3', '拒绝性爱方式', '床上淫语风格',
      '性偏好部位', '事后状态习惯', '主角初次记录', '性经验', '性技巧',
      '最近性行为', '主角性爱次数',
    ],
  },
];

export function sectionsOf(tab: SheetTab): SectionSpec[] {
  return SECTIONS.filter((s) => s.tab === tab);
}
