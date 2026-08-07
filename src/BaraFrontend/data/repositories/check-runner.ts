/**
 * 检定建议的执行 —— 把「骰子命令」列的 DSL 跑成一次真实检定。
 *
 * 这一层负责把领域层要的东西凑齐：命令里只有角色名与属性名，
 * 属性值要现去主角信息表 / 追踪角色表里查。
 *
 * 输出的是**展示文本 + 元叙事**两段：展示文本是玩家的行动描述，
 * 元叙事是给 AI 看的判定结果，两者一起发才构成一个完整回合。
 */
import { readProtagonist, readTrackedCharacters, type CharacterVM } from './character-repo';
import { parseCommand, applyBonusDice, type DiceCommand } from '../../domain/dice/command';
import { performCheck, type CheckResult } from '../../domain/dice/resolve';
import { getCheckPreset } from '../../domain/dice/check-presets';
import { checkBonus } from '../../domain/attribute-presets';
import { getPersonaName } from '../persona';
import type { RuleFamily } from '../../domain/rule-systems';
import type { Lang } from '../../stores/ui-store';

/** 按名字找角色。主角可能被写成 persona 名、姓名或「主角」。 */
export function findCharacter(name: string): CharacterVM | null {
  const target = String(name ?? '').trim();
  if (!target) return null;

  const protagonist = readProtagonist();
  if (protagonist) {
    const aliases = [
      protagonist.name,
      getPersonaName() ?? '',
      '主角',
      ...protagonist.aliases.split(/[,，、;；]/),
    ]
      .map((s) => s.trim())
      .filter(Boolean);
    if (aliases.some((a) => a === target)) return protagonist;
  }

  for (const c of readTrackedCharacters()) {
    if (c.name === target) return c;
    if (c.aliases.split(/[,，、;；]/).some((a) => a.trim() === target)) return c;
  }
  return protagonist && target === protagonist.name ? protagonist : null;
}

export interface AttrHit {
  value: number;
  /** base=基础属性、special=特有属性。决定加值怎么算。 */
  kind: 'base' | 'special';
}

/** 在角色身上找属性。基础与特有都找，先基础后特有。 */
export function findAttribute(c: CharacterVM, name: string): AttrHit | null {
  const target = String(name ?? '').trim();
  for (const a of c.baseAttrs) {
    if (a.name === target && a.value !== null) return { value: a.value, kind: 'base' };
  }
  for (const a of c.specialAttrs) {
    if (a.name === target && a.value !== null) return { value: a.value, kind: 'special' };
  }
  return null;
}

export type RunOutcome =
  | { status: 'ok'; result: CheckResult; text: string }
  /** 命令是「无」，不需要掷骰 */
  | { status: 'skip' }
  /** 命令是「必成」「必败」，直接给结论不掷骰 */
  | { status: 'auto'; text: string }
  /** 无法执行：命令写坏、找不到角色或属性 */
  | { status: 'error'; reason: string; detail?: string };

/**
 * 执行一条骰子命令。
 *
 * 任何一步失败都返回 `error` 而非抛出 —— 调用方要能降级为
 * 「只发展示文本」，玩家不该因为 AI 写坏了一条命令就卡住。
 */
export function runCommand(
  raw: string,
  family: RuleFamily,
  lang: Lang,
): RunOutcome {
  const cmd: DiceCommand = parseCommand(raw, family);

  if (cmd.kind === 'none') return { status: 'skip' };
  if (cmd.kind === 'invalid') return { status: 'error', reason: cmd.reason, detail: cmd.raw };

  if (cmd.kind === 'auto') {
    const label = cmd.outcome === 'success' ? '必定成功' : '必定失败';
    return {
      status: 'auto',
      text: `<meta:检定结果>\n元叙事：本次行动无需掷骰，判定为【${label}】\n</meta:检定结果>`,
    };
  }

  // 对抗检定尚未实现，明确报出来而不是当成普通检定悄悄降级
  if (cmd.kind === 'contest') {
    return { status: 'error', reason: 'contestUnsupported', detail: raw };
  }

  const actor = findCharacter(cmd.actor);
  if (!actor) return { status: 'error', reason: 'actorNotFound', detail: cmd.actor };

  const attr = findAttribute(actor, cmd.attrName);
  if (!attr) return { status: 'error', reason: 'attrNotFound', detail: cmd.attrName };

  /*
   * 奖惩骰改写的是骰式，而骰式在预设里。这里临时换一份预设传给
   * performCheck —— 不改全局预设，否则一次带奖励骰的检定会污染后续所有检定。
   */
  const preset = getCheckPreset(family);
  const dice = applyBonusDice(preset.dice, family, cmd.bonus);

  const { result, text } = performCheck(
    {
      family,
      actor: actor.name,
      attrName: cmd.attrName,
      attrValue: attr.value,
      modifier: checkBonus(family, attr.value, attr.kind),
      difficulty: cmd.difficulty,
    },
    lang,
    undefined,
    dice === preset.dice ? undefined : dice,
  );

  return { status: 'ok', result, text };
}
