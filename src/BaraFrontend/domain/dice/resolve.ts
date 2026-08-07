/**
 * 检定执行 —— 掷骰、判定、渲染元叙事文本。
 *
 * 流程与骰子系统一致：
 *   骰式求值 → 建上下文 → 按 priority 升序找第一个成立的判定 → 套模板
 *
 * 全流程是纯函数（随机源可注入），因此可以完整测试 ——
 * 检定结果一旦发出去就进了聊天记录，没有回头路，值得把它测透。
 */
import { evalFormula, type RandomFn } from './roller';
import { isTruthy } from './expr';
import {
  getCheckPreset,
  getDifficulty,
  type CheckPreset,
  type Outcome,
  type OutcomeTone,
} from './check-presets';
import type { RuleFamily } from '../rule-systems';
import type { Lang } from '../../stores/ui-store';

export interface CheckRequest {
  family: RuleFamily;
  /** 发起者姓名 */
  actor: string;
  /** 属性名，原样取自表格 */
  attrName: string;
  /** 属性值 */
  attrValue: number;
  /** 调整值。d20 族由属性值推算后传入；其余族传 null */
  modifier?: number | null;
  /** 难度档 id，默认取该族的第一档 */
  difficulty?: string;
  /** 覆盖难度值。留空则用该族默认值 */
  dc?: number;
}

export interface CheckResult {
  request: CheckRequest;
  preset: CheckPreset;
  /** 实际掷出的骰式（已代入属性值） */
  formula: string;
  /** 骰子结果；骰池族为成功数 */
  roll: number;
  /** 自然 1 的个数 */
  ones: number;
  /** 每颗骰子的点数，供界面展示 */
  dice: number[];
  /** 生效的目标值 / 难度值 */
  target: number;
  outcome: Outcome;
  tone: OutcomeTone;
  /** 求值上下文，模板渲染与排错都用它 */
  context: Record<string, number>;
}

/**
 * 建立求值上下文。
 *
 * 百分骰族的难度作用在**目标值**上（困难 = 目标值减半），
 * 另两族作用在**难度值**上。两种口径不能混，因此在这里分开处理，
 * 不让判定表达式自己去区分。
 */
function buildTarget(preset: CheckPreset, req: CheckRequest): { attr: number; dc: number } {
  const tier = getDifficulty(req.family, req.difficulty);
  const baseDc = req.dc ?? preset.defaultDc;

  if (tier.targetMultiplier !== undefined) {
    // 目标值缩放后向下取整：向上取整会让「困难」在奇数目标值上偏松
    return { attr: Math.floor(req.attrValue * tier.targetMultiplier), dc: baseDc };
  }
  return { attr: req.attrValue, dc: baseDc + (tier.dcDelta ?? 0) };
}

export function runCheck(req: CheckRequest, rnd?: RandomFn, diceOverride?: string): CheckResult {
  const preset = getCheckPreset(req.family);
  const { attr, dc } = buildTarget(preset, req);
  const mod = req.modifier ?? 0;

  /*
   * 骰式可被覆盖（奖惩骰会把 `1d100` 改写成 `2d100kl1` 这类）。
   * 覆盖只作用于本次调用，**不改预设** —— 改了的话一次带奖励骰的检定
   * 会污染之后所有检定。
   *
   * 骰式里可以引用 $attr（骰池族的骰子数就是属性值）。用未经难度缩放的
   * 原始属性值 —— 缩放是判定阶段的事，不该改变掷几颗骰子。
   */
  const dice = diceOverride || preset.dice;
  const detail = evalFormula(dice, { $attr: req.attrValue }, rnd);
  const roll = detail.total;

  const context: Record<string, number> = {
    $roll: roll,
    $attr: attr,
    // 未经难度缩放的原始值。大失败线按角色本身的能力算，
    // 不该因为这次判定被调成困难就跟着变。
    $attrRaw: req.attrValue,
    $mod: mod,
    $dc: dc,
    $total: roll + mod,
    $ones: detail.ones,
    $pool: detail.terms[0]?.rolls.length ?? 0,
  };

  const outcome = resolveOutcome(preset.outcomes, context);

  return {
    request: req,
    preset,
    formula: detail.formula,
    roll,
    ones: detail.ones,
    dice: detail.terms.flatMap((t) => t.rolls),
    target: attr,
    outcome,
    tone: outcome.tone,
    context,
  };
}

/**
 * 按 priority 升序找第一个成立的判定。
 *
 * 全不成立时返回**优先级最大的那条**（兜底档），而不是抛错 ——
 * 检定已经掷完了，此时报错等于把结果丢掉。
 */
export function resolveOutcome(
  outcomes: readonly Outcome[],
  context: Record<string, number>,
): Outcome {
  const sorted = [...outcomes].sort((a, b) => a.priority - b.priority);
  for (const o of sorted) {
    // 空条件是兜底档，恒成立
    if (!o.condition.trim()) return o;
    if (isTruthy(o.condition, context)) return o;
  }
  return sorted[sorted.length - 1];
}

/**
 * 渲染元叙事文本。
 *
 * 占位符按名字长度降序替换，避免 `$roll` 被 `$ro` 之类的短名截断。
 * 未知占位符原样保留 —— 悄悄替换成空串会让人以为模板写对了。
 */
export function renderTemplate(result: CheckResult, lang: Lang): string {
  const { request: req, preset } = result;
  const tier = getDifficulty(req.family, req.difficulty);

  const vars: Record<string, string> = {
    $actor: req.actor,
    $attrName: req.attrName,
    $attr: String(result.target),
    $attrRaw: String(req.attrValue),
    $roll: String(result.roll),
    $formula: result.formula.replace('$attr', String(req.attrValue)),
    $mod: result.context.$mod >= 0 ? `+${result.context.$mod}` : String(result.context.$mod),
    $total: String(result.context.$total),
    $dc: String(result.context.$dc),
    $pool: String(result.context.$pool),
    $ones: String(result.ones),
    $dice: result.dice.join(', '),
    $difficulty: tier.name[lang],
    $outcome: result.outcome.name[lang],
  };

  let out = preset.template;
  for (const key of Object.keys(vars).sort((a, b) => b.length - a.length)) {
    out = out.split(key).join(vars[key]);
  }
  return out;
}

/** 一步到位：掷 + 判 + 渲染 */
export function performCheck(
  req: CheckRequest,
  lang: Lang,
  rnd?: RandomFn,
  diceOverride?: string,
): { result: CheckResult; text: string } {
  const result = runCheck(req, rnd, diceOverride);
  return { result, text: renderTemplate(result, lang) };
}
