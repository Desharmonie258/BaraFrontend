/**
 * 检定预设 —— 每个规则族一份，决定掷什么、怎么判、怎么输出。
 *
 * 结构对齐骰子系统的 `AdvancedDicePreset`：骰式、难度档、判定分级、
 * 输出模板。**没有任何规则写死在代码里** —— 换规则就是换这个对象。
 *
 * 判定分级按 `priority` 升序求值，**第一个条件成立的胜出**，全不成立
 * 时落到最后一条。所以大成功（priority 1）要排在成功（30）之前，
 * 顺序由数据决定，不是 if-else 链。
 */
import type { RuleFamily } from '../rule-systems';

/** 判定结果的定性，供界面着色。与具体规则无关。 */
export type OutcomeTone = 'critSuccess' | 'success' | 'partial' | 'failure' | 'fumble';

export interface Outcome {
  id: string;
  name: { 'zh-CN': string; 'en-US': string };
  /** 条件表达式，见 expr.ts。留空表示恒成立（兜底档） */
  condition: string;
  /** 求值顺序，升序；越小越先判 */
  priority: number;
  tone: OutcomeTone;
}

export interface DifficultyTier {
  id: string;
  name: { 'zh-CN': string; 'en-US': string };
  /**
   * 目标值倍率（百分骰族用：困难 ½、极难 ⅕）。
   * 与 `dcDelta` 二选一，另一个留空。
   */
  targetMultiplier?: number;
  /** 难度值增量（d20 族用），或所需成功数增量（骰池族用） */
  dcDelta?: number;
}

export interface CheckPreset {
  family: RuleFamily;
  /**
   * 骰式。可引用 `$attr`（属性值）—— 骰池族的骰子数就是属性值。
   * 求值前会先代入上下文。
   */
  dice: string;
  /** 默认难度值。d20 族是 DC，骰池族是所需成功数，百分骰族不用 */
  defaultDc: number;
  difficulties: readonly DifficultyTier[];
  /**
   * 默认难度档 id。**显式指定，不取 difficulties[0]** ——
   * 那样默认值会跟着显示顺序变：把「简单」排到最前，默认就成了简单。
   */
  defaultDifficulty: string;
  outcomes: readonly Outcome[];
  /** 元叙事模板，占位符见 resolve.ts 的 renderTemplate */
  template: string;
}

const zh = (a: string, b: string) => ({ 'zh-CN': a, 'en-US': b });

/**
 * 上下文变量（三族通用）：
 * - `$roll`  骰子结果（骰池族为成功数）
 * - `$attr`  属性值（已按难度缩放）
 * - `$attrRaw` 未缩放的原始属性值
 * - `$mod`   调整值（d20 族由属性值推算，其余族为 0）
 * - `$dc`    难度值 / 所需成功数
 * - `$total` `$roll + $mod`
 * - `$ones`  自然 1 的个数
 */
export const CHECK_PRESETS: Record<RuleFamily, CheckPreset> = {
  /** 百分骰：掷 d100，不大于目标值即成功。难度靠缩小目标值实现。 */
  brp: {
    family: 'brp',
    dice: '1d100',
    defaultDc: 0,
    defaultDifficulty: 'normal',
    difficulties: [
      { id: 'normal', name: zh('普通', 'Normal'), targetMultiplier: 1 },
      { id: 'hard', name: zh('困难', 'Hard'), targetMultiplier: 0.5 },
      { id: 'extreme', name: zh('极难', 'Extreme'), targetMultiplier: 0.2 },
    ],
    outcomes: [
      { id: 'crit', name: zh('大成功', 'Critical'), condition: '$roll == 1', priority: 1, tone: 'critSuccess' },
      {
        id: 'fumble',
        name: zh('大失败', 'Fumble'),
        // 目标值低于 50 时 96 起大失败，否则只有 100 —— 这是百分骰族的通例
        condition: '($attrRaw < 50 && $roll >= 96) || ($attrRaw >= 50 && $roll == 100)',
        priority: 5,
        tone: 'fumble',
      },
      { id: 'extreme', name: zh('极难成功', 'Extreme Success'), condition: '$roll <= $attr / 5', priority: 10, tone: 'critSuccess' },
      { id: 'hard', name: zh('困难成功', 'Hard Success'), condition: '$roll <= $attr / 2', priority: 20, tone: 'success' },
      { id: 'success', name: zh('成功', 'Success'), condition: '$roll <= $attr', priority: 30, tone: 'success' },
      { id: 'failure', name: zh('失败', 'Failure'), condition: '', priority: 90, tone: 'failure' },
    ],
    template:
      '<meta:检定结果>\n元叙事：$actor 发起了 $attrName 检定（$difficulty），' +
      '$formula=$roll，目标值 $attr，判定为【$outcome】\n</meta:检定结果>',
  },

  /** d20：掷 d20 加调整值，达到或超过难度值即成功。 */
  d20: {
    family: 'd20',
    dice: '1d20',
    defaultDc: 15,
    defaultDifficulty: 'normal',
    difficulties: [
      { id: 'easy', name: zh('简单', 'Easy'), dcDelta: -5 },
      { id: 'normal', name: zh('普通', 'Normal'), dcDelta: 0 },
      { id: 'hard', name: zh('困难', 'Hard'), dcDelta: 5 },
      { id: 'extreme', name: zh('极难', 'Extreme'), dcDelta: 10 },
    ],
    outcomes: [
      // 自然 20 / 1 不看调整值，这是 d20 族的固定规则
      { id: 'crit', name: zh('大成功', 'Critical'), condition: '$roll == 20', priority: 1, tone: 'critSuccess' },
      { id: 'fumble', name: zh('大失败', 'Fumble'), condition: '$roll == 1', priority: 5, tone: 'fumble' },
      { id: 'success', name: zh('成功', 'Success'), condition: '$total >= $dc', priority: 30, tone: 'success' },
      // 差 1-2 点算「险些」，给叙事一个中间态
      { id: 'near', name: zh('险些成功', 'Near Miss'), condition: '$total >= $dc - 2', priority: 40, tone: 'partial' },
      { id: 'failure', name: zh('失败', 'Failure'), condition: '', priority: 90, tone: 'failure' },
    ],
    template:
      '<meta:检定结果>\n元叙事：$actor 发起了 $attrName 检定（$difficulty），' +
      '$formula=$roll，调整值 $mod，总计 $total，难度 $dc，判定为【$outcome】\n</meta:检定结果>',
  },

  /** 骰池：掷「属性值」颗 d10，8 以上each 记一个成功。 */
  d10: {
    family: 'd10',
    // $attr 颗骰子；成功线 8 写在骰式里，因此 $roll 直接就是成功数
    dice: '$attrd10>=8',
    defaultDc: 1,
    defaultDifficulty: 'normal',
    difficulties: [
      { id: 'normal', name: zh('普通', 'Normal'), dcDelta: 0 },
      { id: 'hard', name: zh('困难', 'Hard'), dcDelta: 2 },
      { id: 'extreme', name: zh('极难', 'Extreme'), dcDelta: 4 },
    ],
    outcomes: [
      { id: 'crit', name: zh('大成功', 'Critical'), condition: '$roll >= $dc + 3', priority: 1, tone: 'critSuccess' },
      // 零成功且掷出 1 才是大失败；单纯零成功只是失败
      { id: 'fumble', name: zh('大失败', 'Fumble'), condition: '$roll == 0 && $ones > 0', priority: 5, tone: 'fumble' },
      { id: 'success', name: zh('成功', 'Success'), condition: '$roll >= $dc', priority: 30, tone: 'success' },
      { id: 'partial', name: zh('勉强', 'Partial'), condition: '$roll > 0', priority: 40, tone: 'partial' },
      { id: 'failure', name: zh('失败', 'Failure'), condition: '', priority: 90, tone: 'failure' },
    ],
    template:
      '<meta:检定结果>\n元叙事：$actor 发起了 $attrName 检定（$difficulty），' +
      '掷 $pool 颗 d10 得 $roll 个成功，需 $dc 个，判定为【$outcome】\n</meta:检定结果>',
  },
};

export function getCheckPreset(family: RuleFamily): CheckPreset {
  return CHECK_PRESETS[family] ?? CHECK_PRESETS.brp;
}

/** 取难度档。id 为空或无效时落到该族的默认档。 */
export function getDifficulty(family: RuleFamily, id?: string): DifficultyTier {
  const p = getCheckPreset(family);
  const wanted = id ?? p.defaultDifficulty;
  return (
    p.difficulties.find((d) => d.id === wanted) ??
    p.difficulties.find((d) => d.id === p.defaultDifficulty) ??
    p.difficulties[0]
  );
}
