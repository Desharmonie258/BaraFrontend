import { describe, it, expect } from 'vitest';
import { evaluate, isTruthy, substitute } from '../src/BaraFrontend/domain/dice/expr';
import { runCheck, resolveOutcome, renderTemplate } from '../src/BaraFrontend/domain/dice/resolve';
import { getCheckPreset, type Outcome } from '../src/BaraFrontend/domain/dice/check-presets';

/** 让 dN 掷出指定点数：rollOne = floor(rnd*sides)+1 */
const face = (v: number, sides: number) => () => (v - 1) / sides;
const d100 = (v: number) => face(v, 100);
const d20 = (v: number) => face(v, 20);

/** 依次给出 d10 的点数序列 */
function d10seq(...faces: number[]) {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 10;
}

describe('条件表达式', () => {
  it('比较与逻辑', () => {
    expect(isTruthy('$a <= $b', { $a: 3, $b: 5 })).toBe(true);
    expect(isTruthy('$a > 1 && $a < 3', { $a: 2 })).toBe(true);
    expect(isTruthy('$a == 1 || $a == 2', { $a: 2 })).toBe(true);
    expect(isTruthy('$a != 1', { $a: 1 })).toBe(false);
  });

  it('优先级：先算术后比较，&& 紧于 ||', () => {
    expect(evaluate('1 + 2 * 3 >= 7').value).toBe(1);
    // 若 && 与 || 同级，下面两式会误判
    expect(isTruthy('0 && 0 || 1')).toBe(true);
    expect(isTruthy('1 || 0 && 0')).toBe(true);
  });

  it('负数代入加括号，避免与减号粘连出歧义', () => {
    expect(substitute('$a - $b', { $a: 5, $b: -3 })).toBe('5 - (-3)');
    expect(evaluate('$a - $b', { $a: 5, $b: -3 }).value).toBe(8);
  });

  it('长名先代入，短名不截断长名', () => {
    expect(evaluate('$attrRaw - $attr', { $attr: 10, $attrRaw: 50 }).value).toBe(40);
  });

  it('未代入的变量报错，不静默当成不成立', () => {
    const r = evaluate('$unknown > 1', {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain('未代入');
  });

  it('注入尝试被字符白名单拦下', () => {
    expect(evaluate('1; alert(1)').ok).toBe(false);
    expect(evaluate('constructor').ok).toBe(false);
  });

  it('除零取 0 而非 Infinity', () => {
    expect(evaluate('10 / 0').value).toBe(0);
  });
});

describe('判定选取', () => {
  const outcomes: Outcome[] = [
    { id: 'c', name: { 'zh-CN': '大成功', 'en-US': 'C' }, condition: '$roll == 1', priority: 1, tone: 'critSuccess' },
    { id: 's', name: { 'zh-CN': '成功', 'en-US': 'S' }, condition: '$roll <= 50', priority: 30, tone: 'success' },
    { id: 'f', name: { 'zh-CN': '失败', 'en-US': 'F' }, condition: '', priority: 90, tone: 'failure' },
  ];

  it('按 priority 升序，第一个成立的胜出', () => {
    // roll=1 同时满足大成功与成功，应取优先级更小的大成功
    expect(resolveOutcome(outcomes, { $roll: 1 }).id).toBe('c');
    expect(resolveOutcome(outcomes, { $roll: 30 }).id).toBe('s');
  });

  it('数组顺序不影响结果 —— 顺序由 priority 决定，不是书写次序', () => {
    const shuffled = [outcomes[2], outcomes[1], outcomes[0]];
    expect(resolveOutcome(shuffled, { $roll: 1 }).id).toBe('c');
  });

  it('全不成立时落到兜底档，不抛错', () => {
    expect(resolveOutcome(outcomes, { $roll: 80 }).id).toBe('f');
  });
});

describe('BRP：d100 不大于目标值', () => {
  const req = { family: 'brp' as const, actor: '甲', attrName: '敏捷', attrValue: 60 };

  it('分级：大成功 / 极难 / 困难 / 成功 / 失败', () => {
    expect(runCheck(req, d100(1)).outcome.id).toBe('crit');
    expect(runCheck(req, d100(12)).outcome.id).toBe('extreme'); // ≤ 60/5
    expect(runCheck(req, d100(30)).outcome.id).toBe('hard'); // ≤ 60/2
    expect(runCheck(req, d100(55)).outcome.id).toBe('success');
    expect(runCheck(req, d100(80)).outcome.id).toBe('failure');
  });

  it('大失败线按原始属性值判，不随难度档变', () => {
    const weak = { ...req, attrValue: 40 };
    expect(runCheck(weak, d100(96)).outcome.id).toBe('fumble');
    // 目标值 ≥50 时只有 100 才是大失败
    expect(runCheck(req, d100(96)).outcome.id).toBe('failure');
    expect(runCheck(req, d100(100)).outcome.id).toBe('fumble');

    // 困难档把目标值缩到 30，但大失败仍按原始的 60 判 —— 96 不算大失败
    const hard = runCheck({ ...req, difficulty: 'hard' }, d100(96));
    expect(hard.target).toBe(30);
    expect(hard.outcome.id).toBe('failure');
  });

  it('难度缩放目标值：困难 ½、极难 ⅕，向下取整', () => {
    expect(runCheck({ ...req, attrValue: 55, difficulty: 'hard' }, d100(99)).target).toBe(27);
    expect(runCheck({ ...req, difficulty: 'extreme' }, d100(99)).target).toBe(12);
  });
});

describe('d20：掷骰加调整值对难度值', () => {
  const req = { family: 'd20' as const, actor: '乙', attrName: '力量', attrValue: 16, modifier: 3 };

  it('自然 20 / 1 不看调整值', () => {
    expect(runCheck(req, d20(20)).outcome.id).toBe('crit');
    expect(runCheck(req, d20(1)).outcome.id).toBe('fumble');
  });

  it('总计达到难度值即成功', () => {
    // 默认 DC 15：12+3=15 成功，11+3=14 险些
    expect(runCheck(req, d20(12)).outcome.id).toBe('success');
    expect(runCheck(req, d20(11)).outcome.id).toBe('near');
    expect(runCheck(req, d20(5)).outcome.id).toBe('failure');
  });

  it('难度档调整难度值', () => {
    expect(runCheck({ ...req, difficulty: 'hard' }, d20(12)).context.$dc).toBe(20);
    expect(runCheck({ ...req, difficulty: 'easy' }, d20(12)).context.$dc).toBe(10);
  });

  it('调整值缺省为 0', () => {
    const r = runCheck({ ...req, modifier: null }, d20(15));
    expect(r.context.$mod).toBe(0);
    expect(r.context.$total).toBe(15);
  });
});

describe('d10：骰池数成功', () => {
  const req = { family: 'd10' as const, actor: '丙', attrName: '体质', attrValue: 4 };

  it('掷属性值颗骰子，8 以上记成功', () => {
    const r = runCheck(req, d10seq(9, 8, 5, 2));
    expect(r.context.$pool).toBe(4);
    expect(r.roll).toBe(2);
    expect(r.outcome.id).toBe('success');
  });

  it('零成功且掷出 1 才是大失败；单纯零成功只是失败', () => {
    expect(runCheck(req, d10seq(1, 2, 3, 4)).outcome.id).toBe('fumble');
    expect(runCheck(req, d10seq(2, 3, 4, 5)).outcome.id).toBe('failure');
  });

  it('难度档提高所需成功数', () => {
    const r = runCheck({ ...req, difficulty: 'hard' }, d10seq(9, 8, 5, 2));
    expect(r.context.$dc).toBe(3);
    expect(r.outcome.id).toBe('partial'); // 有成功但不够
  });

  it('难度不改变骰子数 —— 缩放是判定阶段的事', () => {
    const r = runCheck({ ...req, difficulty: 'extreme' }, d10seq(9, 9, 9, 9));
    expect(r.context.$pool).toBe(4);
  });
});

describe('元叙事文本', () => {
  it('包裹在 meta 标签内，占位符全部替换', () => {
    const r = runCheck({ family: 'brp', actor: '笹兵卫', attrName: '敏捷', attrValue: 60 }, d100(30));
    const text = renderTemplate(r, 'zh-CN');

    expect(text.startsWith('<meta:检定结果>')).toBe(true);
    expect(text.trim().endsWith('</meta:检定结果>')).toBe(true);
    expect(text).toContain('笹兵卫');
    expect(text).toContain('困难成功');
    // 没有残留占位符
    expect(text).not.toMatch(/\$[a-zA-Z]/);
  });

  it('骰池族报出骰子数与成功数', () => {
    const r = runCheck({ family: 'd10', actor: '丙', attrName: '体质', attrValue: 4 }, d10seq(9, 8, 5, 2));
    expect(renderTemplate(r, 'zh-CN')).toContain('掷 4 颗 d10 得 2 个成功');
  });

  it('d20 的调整值带符号', () => {
    const r = runCheck(
      { family: 'd20', actor: 'A', attrName: '力量', attrValue: 6, modifier: -2 },
      d20(10),
    );
    expect(renderTemplate(r, 'zh-CN')).toContain('调整值 -2');
  });

  it('英文界面下判定名与难度名走英文', () => {
    const r = runCheck({ family: 'brp', actor: 'A', attrName: 'DEX', attrValue: 60 }, d100(30));
    expect(renderTemplate(r, 'en-US')).toContain('Hard Success');
  });
});

describe('预设完整性', () => {
  const families = ['brp', 'd20', 'd10'] as const;

  it('三族都有兜底档 —— 任何结果都能落到一个判定上', () => {
    for (const f of families) {
      expect(getCheckPreset(f).outcomes.some((o) => !o.condition.trim()), f).toBe(true);
    }
  });

  it('判定 id 在各族内部唯一', () => {
    for (const f of families) {
      const ids = getCheckPreset(f).outcomes.map((o) => o.id);
      expect(new Set(ids).size, f).toBe(ids.length);
    }
  });

  it('模板都产出 meta 标签 —— 元叙事靠它被识别', () => {
    for (const f of families) {
      expect(getCheckPreset(f).template, f).toContain('<meta:检定结果>');
    }
  });

  it('难度档不混用两种口径 —— 倍率与增量只能取其一', () => {
    for (const f of families) {
      for (const d of getCheckPreset(f).difficulties) {
        const both = d.targetMultiplier !== undefined && d.dcDelta !== undefined;
        expect(both, `${f}.${d.id}`).toBe(false);
      }
    }
  });
});

describe('默认难度档', () => {
  it('显式指定，不随 difficulties 的排列顺序变', () => {
    // d20 把「简单」排在最前，但默认应是普通（DC 15 而非 10）
    const r = runCheck(
      { family: 'd20', actor: 'A', attrName: '力量', attrValue: 16, modifier: 3 },
      d20(11),
    );
    expect(r.context.$dc).toBe(15);
    expect(r.outcome.id).toBe('near');
  });

  it('三族的默认档都在各自的档位表里', () => {
    for (const f of ['brp', 'd20', 'd10'] as const) {
      const p = getCheckPreset(f);
      expect(p.difficulties.some((d) => d.id === p.defaultDifficulty), f).toBe(true);
    }
  });

  it('无效的难度 id 落到默认档而非第一档', () => {
    const r = runCheck(
      { family: 'd20', actor: 'A', attrName: '力量', attrValue: 16, difficulty: '不存在' },
      d20(11),
    );
    expect(r.context.$dc).toBe(15);
  });
});
