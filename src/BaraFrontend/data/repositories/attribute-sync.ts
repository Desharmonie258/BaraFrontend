/**
 * 属性规则同步 —— 把当前规则族的量纲写进表格模板的 `<属性规则>` 段。
 *
 * 做法照搬骰子系统的 `updateTemplateForActivePreset`：
 * 1. 取模板对象，拿不到就放弃（不猜测形态）
 * 2. 用预设公式**当场掷**一组示例值 —— 示例写死的话，换族后 AI
 *    还会照着旧量纲写
 * 3. 区间由各条属性 `range` 聚合而来，不另设字段，避免与公式不一致
 * 4. 只替换 `<属性规则>…</属性规则>` 标签内的内容，note 其余部分不动 ——
 *    用户自己加的说明不能被冲掉
 * 5. 写回时 `scope: 'chat'`，只改当前聊天的副本
 *
 * 本模块**只在用户显式点击时执行**，不随规则族切换自动触发：
 * 写模板是不可撤销的高风险操作，需要看过预览再决定。
 */
import { getTableTemplate, importTemplate } from '../db-gateway';
import { rollAttribute } from '../../domain/dice/roller';
import {
  getAttributePreset,
  unionRange,
  buildScale,
  type AttributePreset,
} from '../../domain/attribute-presets';
import type { RuleFamily } from '../../domain/rule-systems';

const TAG = '属性规则';

/** 带 `<属性规则>` 段的表 —— 主角信息与追踪角色表 */
function hasTag(note: unknown): note is string {
  return typeof note === 'string' && note.includes(`<${TAG}>`);
}

/** 只替换标签内内容，标签外原样保留 */
export function replaceTag(text: string, tag: string, content: string): string {
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g');
  return text.replace(re, `<${tag}>\n${content}\n</${tag}>`);
}

/**
 * 生成一组示例属性值。
 *
 * 派生属性可以引用先算出的属性（如 `敏捷/2`），因此按顺序求值并把
 * 已得结果喂回上下文。
 */
export interface ExamplePair {
  name: string;
  value: number;
  /** 关联的基础属性，仅 linksToBase 的族有 */
  key?: string;
}

export function rollExamples(preset: AttributePreset): {
  base: ExamplePair[];
  special: ExamplePair[];
} {
  const ctx: Record<string, number> = {};
  const base = preset.base.map((spec) => {
    const value = rollAttribute(spec.formula, spec.range, ctx);
    ctx[spec.name] = value;
    return { name: spec.name, value };
  });
  const special = preset.special.map((spec) => {
    const value = rollAttribute(spec.formula, spec.range, ctx);
    ctx[spec.name] = value;
    // 不挂靠基础属性的族不写第三段
    return { name: spec.name, value, key: preset.linksToBase ? spec.key : undefined };
  });
  return { base, special };
}

/** 构造要写入 `<属性规则>` 的完整内容块 */
export function buildRuleBlock(family: RuleFamily): string {
  const preset = getAttributePreset(family);
  const { base, special } = rollExamples(preset);
  const baseRange = unionRange(preset.base);
  const specialRange = unionRange(preset.special);

  const fmt = (pairs: ExamplePair[]) =>
    pairs.map((p) => (p.key ? `${p.name}:${p.value}:${p.key}` : `${p.name}:${p.value}`)).join('; ');

  // 特有属性的格式说明随族而变：要不要第三段、值是绝对值还是加值
  const specialFormat = preset.linksToBase
    ? '格式: "{特有属性}:{数值}:{关联基础属性}"，第三段必填，取自上列六个基础属性之一。'
    : '格式: "{特有属性}:{数值}"。';
  const specialMeaning =
    preset.specialKind === 'bonus'
      ? '数值记的是**检定加值本身**（可为负），不是能力值，不要再做换算。'
      : '数值记的是能力值本身。';

  return `${preset.summary['zh-CN']}

基础属性: "{基础属性}:{数值}"，数值范围[${baseRange[0]},${baseRange[1]}]
示例: "${fmt(base)}"

特有属性: 角色的特殊能力与技能，体现世界观特色与个体差异。
${specialFormat}${specialMeaning}数值范围[${specialRange[0]},${specialRange[1]}]
${preset.specialtyNote['zh-CN']}
示例: "${fmt(special)}"

【属性标尺】
${buildScale(baseRange, preset.bands)}。基准: 依角色[身份背景]生成，当前值受[当前状态]修正。`;
}

export interface SyncPreview {
  /** 将被改写的表（展示名） */
  sheets: string[];
  /** 新的规则块内容 */
  block: string;
  /** 无法进行的原因，为 null 表示可以执行 */
  blocker: string | null;
}

/**
 * 预览将要发生的改动，不写入任何东西。
 *
 * 界面必须先展示这个再让用户确认 —— 模板写坏了整套表结构都要重导。
 */
export function previewSync(family: RuleFamily): SyncPreview {
  const block = buildRuleBlock(family);
  const tpl = getTableTemplate();

  if (!tpl) {
    return { sheets: [], block, blocker: 'noTemplate' };
  }

  const sheets: string[] = [];
  for (const value of Object.values(tpl)) {
    if (value && typeof value === 'object' && hasTag((value as any).sourceData?.note)) {
      sheets.push(String((value as any).name ?? ''));
    }
  }

  return {
    sheets,
    block,
    blocker: sheets.length ? null : 'noTaggedSheet',
  };
}

export interface SyncResult {
  success: boolean;
  /** 实际改写的表数量 */
  changed: number;
  message: string;
}

/**
 * 执行同步。
 *
 * 注意预览与执行会**各掷一次示例值**，因此写入的示例与预览显示的不同。
 * 若要求一致，把 previewSync 得到的 block 传进来。
 */
export async function applySync(family: RuleFamily, block?: string): Promise<SyncResult> {
  const tpl = getTableTemplate();
  if (!tpl) return { success: false, changed: 0, message: 'noTemplate' };

  const content = block ?? buildRuleBlock(family);
  let changed = 0;

  for (const value of Object.values(tpl)) {
    if (!value || typeof value !== 'object') continue;
    const sd = (value as any).sourceData;
    if (!hasTag(sd?.note)) continue;

    const next = replaceTag(sd.note, TAG, content);
    if (next !== sd.note) {
      sd.note = next;
      changed++;
    }
  }

  // 没有实际改动就不写 —— 无谓的写入同样有失败风险
  if (changed === 0) return { success: true, changed: 0, message: 'noChange' };

  const res = await importTemplate(tpl, { scope: 'chat' });
  return { success: res.success, changed, message: res.message };
}
