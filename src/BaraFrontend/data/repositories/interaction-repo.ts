/**
 * 交互总览的对象清单（1.11）。
 *
 * 扫描全部表，把每一行变成一个能点的对象。
 *
 * ## 只收有动作的表
 *
 * 没有任何规则命中的表整张跳过。收进来只会得到一屏点不动的圆圈 ——
 * 交互总览的用途是「我现在能做什么」，不是又一个表清单。
 *
 * ## 名称列的取法
 *
 * 先按关键词找（姓名/名称/标题…），找不到就退回第一个非 row_id 列。
 * 后者在本项目的表里恒为唯一名（详细地点、元素名称、物品名称……），
 * 这个规律比列名可靠 —— 别家模板的列名千差万别，位置却一致。
 */
import { cell, getSnapshot, type SheetSnapshot } from '../snapshot-repo';
import { replaceUserPlaceholders } from '../persona';
import {
  actionsForSheet, sectionOf,
  type ActionItem, type ActionPreset, type SectionKind,
} from '../../domain/interaction-rules';

/** 名称列的关键词。顺序即优先级。 */
const NAME_KEYWORDS = [
  '姓名', '名称', '名字', '标题', '显示名', '详细地点', '地点名', '地名', 'name', 'title',
];

/**
 * **不能当名称的列。**
 *
 * 「持有人」「所在地点」这类是**外键** —— 指向别的表里的对象，不是这一行
 * 自己的名字。角色资源表的第一列恰好就是「持有人」，退回「第一个非 row_id 列」
 * 时会把它当名字，于是一个角色有几条资源就出现几次。
 *
 * 骰子系统的同名清单里没有这几个词，它在这张表上会犯同样的错，
 * 所以这里没有照抄。
 */
const NON_NAME_KEYWORDS = [
  '持有人', '所属', '所在', '归属', '拥有者', '主人', '角色', '对象',
  '类型', '种类', '状态', '等级', '数值', '描述', '备注', '说明',
  '序号', '编号', '索引', 'id',
];

function isNonName(header: string): boolean {
  const h = header.toLowerCase();
  return NON_NAME_KEYWORDS.some((k) => h.includes(k.toLowerCase()));
}

export interface InteractionObject {
  /** 同一分区内唯一，供列表 key 与展开状态使用 */
  id: string;
  name: string;
  sheetName: string;
  rowIndex: number;
  /** 摘要，弹出菜单里显示 —— 光有名字认不出是哪一个「铁剑」 */
  detail: string;
  actions: ActionItem[];
}

export interface InteractionSection {
  kind: SectionKind;
  objects: InteractionObject[];
}

/**
 * 名称列。取不到时返回 null，**整张表跳过**。
 *
 * 三步：精确匹配关键词 → 包含匹配 → 退回第一个非 row_id 列。
 * 只有第三步要查 `NON_NAME_KEYWORDS` —— 前两步是明确的名称列，
 * 「角色名称」这种同时含「角色」的列不该被排除掉。
 *
 * 第三步兜的是没适配过的模板（它们的第一列通常就是唯一名）；
 * 挡的是把外键当名字，那会让一个对象重复出现很多次。
 */
function nameColumnOf(sheet: SheetSnapshot): string | null {
  for (const k of NAME_KEYWORDS) {
    const exact = sheet.headers.find((h) => h === k);
    if (exact) return exact;
  }
  for (const k of NAME_KEYWORDS) {
    const loose = sheet.headers.find((h) => h.toLowerCase().includes(k.toLowerCase()));
    if (loose) return loose;
  }

  const first = sheet.headers.find((h) => h !== 'row_id');
  if (!first || isNonName(first)) return null;
  return first;
}

/**
 * 摘要：除名称与 row_id 外，前两个非空列的值。
 *
 * 不写死列名 —— 各表结构不同，而「前两个有值的字段」在任何表上都能给出
 * 一点辨识度（持有人、类型、所在地点之类恰好排在前面）。
 */
function detailOf(sheet: SheetSnapshot, row: string[], nameColumn: string): string {
  return sheet.headers
    .filter((h) => h !== 'row_id' && h !== nameColumn)
    .map((h) => cell(sheet, row, h).trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('　');
}

/**
 * 读出全部可交互对象，按分区归组。
 *
 * 分区顺序由 `SECTIONS` 决定，空分区不返回 —— 一个永远没有内容的分组
 * 标题只是噪声。
 */
export function readInteractions(preset: ActionPreset): InteractionSection[] {
  const grouped = new Map<SectionKind, InteractionObject[]>();
  /** 同分区内按名字去重的索引 */
  const seen = new Map<string, InteractionObject>();

  for (const sheet of getSnapshot().values()) {
    const actions = actionsForSheet(preset, sheet.name);
    if (actions.length === 0) continue;

    const nameColumn = nameColumnOf(sheet);
    if (!nameColumn) continue;

    const kind = sectionOf(sheet.name);
    const bucket = grouped.get(kind) ?? [];

    sheet.rows.forEach((row, i) => {
      const name = replaceUserPlaceholders(cell(sheet, row, nameColumn)).trim();
      // 无名的行点开也不知道是什么，而模板里的空行是常态
      if (!name) return;

      /*
       * 同一分区里同名只留一个。一个角色常常同时出现在角色表与几张附表里，
       * 摊开就是同一个名字连出现好几次 —— 用户只想点一次「李牧」。
       *
       * 动作取并集：两张表各自的规则命中的动作都该能用。
       * 其余字段保留先出现的那份，出图才不会随快照枚举顺序抖动。
       */
      const key = `${kind}#${name}`;
      const exist = seen.get(key);
      if (exist) {
        for (const a of actions) {
          if (!exist.actions.some((x) => x.label === a.label)) exist.actions.push(a);
        }
        if (!exist.detail) {
          exist.detail = replaceUserPlaceholders(detailOf(sheet, row, nameColumn));
        }
        return;
      }

      const object: InteractionObject = {
        id: `${sheet.key}#${i + 1}`,
        name,
        sheetName: sheet.name,
        rowIndex: i + 1,
        detail: replaceUserPlaceholders(detailOf(sheet, row, nameColumn)),
        // 复制一份：合并时会往里追加，共用引用会污染其余对象
        actions: [...actions],
      };
      seen.set(key, object);
      bucket.push(object);
    });

    if (bucket.length > 0) grouped.set(kind, bucket);
  }

  // 按 SECTIONS 的顺序输出，未在其中的（generic）排最后
  const order: SectionKind[] = [
    'character', 'map', 'item', 'equipment', 'task', 'skill', 'faction', 'generic',
  ];
  return order
    .filter((kind) => grouped.has(kind))
    .map((kind) => ({ kind, objects: grouped.get(kind)! }));
}
