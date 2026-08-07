/**
 * 骰子命令解析 —— 把检定建议表「骰子命令」列里的 DSL 变成可执行的请求。
 *
 * DSL 由模板的 note 定义，AI 照着写：
 *
 *   普通检定：检定 <角色> <属性> [难度=普通|困难|极难] [奖惩=奖励1|惩罚1]
 *   对抗检定：对抗 <发起者> <属性> vs <对手> <属性> [难度=...] [奖惩=...]
 *   固定成功：必成    固定失败：必败    无需检定：无
 *
 * 解析失败**不抛错**，返回 `kind: 'invalid'` 并带上原文。AI 写错格式是
 * 常态，一条写坏的命令不该让整个建议条崩掉 —— 界面据此降级为「只发
 * 展示文本」，玩家仍然能继续玩。
 */
import type { RuleFamily } from '../rule-systems';
import { getCheckPreset } from './check-presets';

export type DiceCommand =
  | { kind: 'none' }
  | { kind: 'auto'; outcome: 'success' | 'failure' }
  | {
      kind: 'check';
      actor: string;
      attrName: string;
      difficulty?: string;
      /** 奖惩骰级数，正为奖励、负为惩罚 */
      bonus?: number;
    }
  | {
      kind: 'contest';
      actor: string;
      attrName: string;
      opponent: string;
      opponentAttr: string;
      difficulty?: string;
      bonus?: number;
    }
  | { kind: 'invalid'; raw: string; reason: string };

/** 「无」「必成」「必败」这类整词命令 */
const LITERALS: Record<string, DiceCommand> = {
  无: { kind: 'none' },
  '-': { kind: 'none' },
  '—': { kind: 'none' },
  必成: { kind: 'auto', outcome: 'success' },
  必败: { kind: 'auto', outcome: 'failure' },
};

/** 难度档的中文名 → 预设里的 id。三族的档位名不同，因此按族查。 */
function resolveDifficulty(family: RuleFamily, label: string): string | undefined {
  const p = getCheckPreset(family);
  const hit = p.difficulties.find(
    (d) => d.name['zh-CN'] === label || d.name['en-US'].toLowerCase() === label.toLowerCase() || d.id === label,
  );
  return hit?.id;
}

/** `奖励1` / `惩罚2` / `+1` / `-2` → 数值。认不出返回 undefined。 */
function parseBonus(text: string): number | undefined {
  const t = text.trim();
  let m = /^(奖励|奖)\s*(\d*)$/.exec(t);
  if (m) return Number.parseInt(m[2] || '1', 10);
  m = /^(惩罚|罚)\s*(\d*)$/.exec(t);
  if (m) return -Number.parseInt(m[2] || '1', 10);
  m = /^([+-])\s*(\d+)$/.exec(t);
  if (m) return m[1] === '-' ? -Number(m[2]) : Number(m[2]);
  return undefined;
}

/**
 * 摘出 `键=值` 形式的可选参数，并返回剩余部分。
 *
 * AI 写出的参数顺序不定，因此先把它们全摘掉再解析位置参数 ——
 * 按位置硬解会在参数换序时全盘失配。
 */
function extractParams(text: string): { rest: string; params: Record<string, string> } {
  const params: Record<string, string> = {};
  const rest = text.replace(/([A-Za-z一-龥]+)\s*[=＝]\s*([^\s]+)/g, (_, k: string, v: string) => {
    params[k.trim()] = v.trim();
    return ' ';
  });
  return { rest: rest.replace(/\s+/g, ' ').trim(), params };
}

function applyOptions(
  family: RuleFamily,
  params: Record<string, string>,
): { difficulty?: string; bonus?: number } {
  const out: { difficulty?: string; bonus?: number } = {};
  const diff = params['难度'] ?? params['difficulty'];
  if (diff) out.difficulty = resolveDifficulty(family, diff);
  const bonus = params['奖惩'] ?? params['bonus'];
  if (bonus) out.bonus = parseBonus(bonus);
  return out;
}

/** 去掉 AI 常写的尖括号包裹：`<角色A>` → `角色A` */
function unwrap(token: string): string {
  return token.replace(/^[<《【]+/, '').replace(/[>》】]+$/, '').trim();
}

export function parseCommand(raw: string, family: RuleFamily): DiceCommand {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'none' };

  const literal = LITERALS[text];
  if (literal) return literal;

  const { rest, params } = extractParams(text);
  const opts = applyOptions(family, params);
  const tokens = rest.split(/\s+/).filter(Boolean);
  const head = tokens[0];

  if (head === '对抗') {
    // 对抗 <发起者> <属性> vs <对手> <属性>
    const vs = tokens.findIndex((t, i) => i > 0 && /^(vs|VS|对)$/.test(t));
    if (vs < 3 || tokens.length < vs + 3) {
      return { kind: 'invalid', raw: text, reason: 'contestShape' };
    }
    return {
      kind: 'contest',
      actor: unwrap(tokens[1]),
      attrName: unwrap(tokens.slice(2, vs).join(' ')),
      opponent: unwrap(tokens[vs + 1]),
      opponentAttr: unwrap(tokens.slice(vs + 2).join(' ')),
      ...opts,
    };
  }

  if (head === '检定') {
    // 检定 <角色> <属性>。属性名可能含空格，因此取剩余全部
    if (tokens.length < 3) return { kind: 'invalid', raw: text, reason: 'checkShape' };
    return {
      kind: 'check',
      actor: unwrap(tokens[1]),
      attrName: unwrap(tokens.slice(2).join(' ')),
      ...opts,
    };
  }

  return { kind: 'invalid', raw: text, reason: 'unknownVerb' };
}

/**
 * 奖惩骰改写骰式。
 *
 * 百分骰族用额外的十位骰（`b1` 取较优、`p1` 取较劣），另两族用优势/劣势
 * （`2d20kh1` / `2d20kl1`）。骰池族不支持，返回原式。
 */
export function applyBonusDice(dice: string, family: RuleFamily, bonus?: number): string {
  if (!bonus) return dice;
  const n = Math.min(3, Math.abs(bonus));

  if (family === 'brp') {
    // 本项目的骰式求值器不实现 b/p 后缀，改用等价的多骰取舍：
    // 奖励骰即多掷一个十位骰取较小者，故用 kl；惩罚取较大者，用 kh
    return bonus > 0 ? `${n + 1}d100kl1` : `${n + 1}d100kh1`;
  }
  if (family === 'd20') {
    return bonus > 0 ? `${n + 1}d20kh1` : `${n + 1}d20kl1`;
  }
  return dice;
}
