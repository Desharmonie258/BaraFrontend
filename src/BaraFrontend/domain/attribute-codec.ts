/**
 * 属性打包串编解码 —— 纯函数，不引用 window / Vue / SQL。
 *
 * 存储形态（开发文档 §3.2）：`{属性名}:{数值}` 分号分隔，存于单列。
 *   例：`力量:19; 敏捷:64; 体质:50`
 *
 * 特有属性可再带第三段「关联的基础属性」：`{名}:{值}:{关联属性}`
 *   例：`野猪狩猎:7:敏捷`
 * 第三段可省略，因此旧数据无需迁移。d20 与百分骰族要求填写，
 * 骰池族不使用（见 domain/attribute-presets）。
 *
 * 设计约束：
 * - 分隔符容错：分号后可有可无空格，末尾分号可有可无。
 * - 数值非法时**不静默丢弃**，保留原文并标记，避免吞掉用户数据。
 * - 序列化保持原有顺序，新属性追加到末尾。顺序变动会让 AI 每轮
 *   都误判为「有改动」。
 */

export interface AttributeEntry {
  /** 属性名 */
  name: string;
  /** 解析成功的数值；解析失败时为 null */
  value: number | null;
  /** 关联的基础属性名。未填写时为 undefined。 */
  key?: string;
  /** 解析失败时保留的原始文本 */
  raw?: string;
}

export interface AttributeRange {
  min: number;
  max: number;
}

/** 基准模板的两档取值范围 */
export const RANGE_BASE: AttributeRange = { min: 5, max: 95 };
export const RANGE_SPECIAL: AttributeRange = { min: 0, max: 100 };

/**
 * 解析打包串。
 * 空串返回空数组。重复键保留首次出现的位置，后续同名项覆盖其值。
 */
export function parse(packed: string | null | undefined): AttributeEntry[] {
  if (!packed) return [];
  const out: AttributeEntry[] = [];
  const index = new Map<string, number>();

  for (const chunk of packed.split(';')) {
    const seg = chunk.trim();
    if (!seg) continue;

    const sep = seg.indexOf(':');
    if (sep < 0) {
      // 没有冒号，整段视为无法解析的残片，保留原文
      out.push({ name: seg, value: null, raw: seg });
      continue;
    }

    const name = seg.slice(0, sep).trim();
    const rest = seg.slice(sep + 1);
    if (!name) continue;

    // 第二个冒号之后是关联的基础属性，可省略
    const sep2 = rest.indexOf(':');
    const valueText = (sep2 < 0 ? rest : rest.slice(0, sep2)).trim();
    const key = sep2 < 0 ? undefined : rest.slice(sep2 + 1).trim() || undefined;

    const num = Number(valueText);
    const entry: AttributeEntry =
      valueText !== '' && Number.isFinite(num)
        ? { name, value: num, key }
        : { name, value: null, key, raw: valueText };

    const existing = index.get(name);
    if (existing !== undefined) {
      out[existing] = entry; // 同名覆盖值，但保持首次出现的位置
    } else {
      index.set(name, out.length);
      out.push(entry);
    }
  }
  return out;
}

/** 序列化为打包串。顺序即数组顺序。 */
export function serialize(entries: AttributeEntry[]): string {
  return entries
    .map((e) => {
      const v = e.value === null ? (e.raw ?? '') : e.value;
      // 没有关联属性时不写第三段，避免在旧数据上凭空加出一个空冒号
      return e.key ? `${e.name}:${v}:${e.key}` : `${e.name}:${v}`;
    })
    .join('; ');
}

/** 按范围钳制。DDL 无法对打包列内的数值加 CHECK，必须在此补上。 */
export function clamp(value: number, range: AttributeRange): number {
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

/** 读取单个属性值。不存在或无法解析时返回 undefined。 */
export function get(entries: AttributeEntry[], name: string): number | undefined {
  const found = entries.find((e) => e.name === name);
  return found && found.value !== null ? found.value : undefined;
}

/**
 * 应用一批变更并返回新数组（不修改入参）。
 *
 * 这是**唯一**应当用于修改属性的入口。开发文档附录 B 要求：
 * 一次检定可能同时改多个属性（效果链、二级效果），逐个写会互相覆盖
 * ——后写的基于旧值序列化，先写的丢失。因此必须先在内存中合并全部变更。
 */
export function applyDeltas(
  entries: AttributeEntry[],
  deltas: Array<{ name: string; delta?: number; set?: number }>,
  range: AttributeRange,
): AttributeEntry[] {
  const next = entries.map((e) => ({ ...e }));
  const index = new Map(next.map((e, i) => [e.name, i]));

  for (const d of deltas) {
    const i = index.get(d.name);
    if (i === undefined) {
      // 属性不存在：set 时新建，纯 delta 时忽略（不凭空造属性）
      if (d.set !== undefined) {
        index.set(d.name, next.length);
        next.push({ name: d.name, value: clamp(d.set, range) });
      }
      continue;
    }
    const current = next[i].value;
    if (current === null) continue; // 无法解析的项不参与运算，保持原样

    const raw = d.set !== undefined ? d.set : current + (d.delta ?? 0);
    // 保住 key —— 改数值不该把关联属性抹掉
    next[i] = { name: d.name, value: clamp(raw, range), key: next[i].key };
  }
  return next;
}

/** SQL 字符串字面量转义（单引号加倍）。写入前必须经过。 */
export function sqlEscape(text: string): string {
  return text.replace(/'/g, "''");
}
