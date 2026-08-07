import { describe, it, expect } from 'vitest';
import { parseCommand, applyBonusDice } from '../src/BaraFrontend/domain/dice/command';

describe('整词命令', () => {
  it('「无」与空串都表示不掷骰', () => {
    expect(parseCommand('无', 'brp').kind).toBe('none');
    expect(parseCommand('', 'brp').kind).toBe('none');
    expect(parseCommand('   ', 'brp').kind).toBe('none');
  });

  it('必成 / 必败', () => {
    expect(parseCommand('必成', 'brp')).toEqual({ kind: 'auto', outcome: 'success' });
    expect(parseCommand('必败', 'brp')).toEqual({ kind: 'auto', outcome: 'failure' });
  });
});

describe('普通检定', () => {
  it('解析角色与属性', () => {
    expect(parseCommand('检定 笹兵卫 敏捷', 'brp')).toMatchObject({
      kind: 'check', actor: '笹兵卫', attrName: '敏捷',
    });
  });

  it('去掉 AI 常写的尖括号', () => {
    expect(parseCommand('检定 <角色A> <敏捷>', 'brp')).toMatchObject({
      actor: '角色A', attrName: '敏捷',
    });
  });

  it('属性名含空格时不被截断', () => {
    expect(parseCommand('检定 甲 语言 弗里吉亚语', 'brp')).toMatchObject({
      attrName: '语言 弗里吉亚语',
    });
  });

  it('难度按族解析成 id', () => {
    expect(parseCommand('检定 甲 敏捷 难度=困难', 'brp')).toMatchObject({ difficulty: 'hard' });
    expect(parseCommand('检定 甲 力量 难度=极难', 'd20')).toMatchObject({ difficulty: 'extreme' });
  });

  it('d20 独有的「简单」档在百分骰族里认不出，留空走默认', () => {
    expect(parseCommand('检定 甲 敏捷 难度=简单', 'd20')).toMatchObject({ difficulty: 'easy' });
    expect(parseCommand('检定 甲 敏捷 难度=简单', 'brp').difficulty).toBeUndefined();
  });

  it('奖惩骰：奖励为正、惩罚为负，省略数字按 1 计', () => {
    expect(parseCommand('检定 甲 敏捷 奖惩=奖励1', 'brp')).toMatchObject({ bonus: 1 });
    expect(parseCommand('检定 甲 敏捷 奖惩=惩罚2', 'brp')).toMatchObject({ bonus: -2 });
    expect(parseCommand('检定 甲 敏捷 奖惩=奖励', 'brp')).toMatchObject({ bonus: 1 });
    expect(parseCommand('检定 甲 敏捷 奖惩=-1', 'brp')).toMatchObject({ bonus: -1 });
  });

  it('参数顺序颠倒仍能解析 —— AI 写的顺序不定', () => {
    const a = parseCommand('检定 甲 敏捷 难度=困难 奖惩=奖励1', 'brp');
    const b = parseCommand('检定 甲 敏捷 奖惩=奖励1 难度=困难', 'brp');
    expect(a).toEqual(b);
  });

  it('参数写在属性名之前也不会被当成属性名的一部分', () => {
    expect(parseCommand('检定 甲 难度=困难 敏捷', 'brp')).toMatchObject({
      attrName: '敏捷', difficulty: 'hard',
    });
  });
});

describe('对抗检定', () => {
  it('解析双方与各自属性', () => {
    expect(parseCommand('对抗 甲 迅捷 vs 乙 强壮', 'brp')).toMatchObject({
      kind: 'contest', actor: '甲', attrName: '迅捷', opponent: '乙', opponentAttr: '强壮',
    });
  });

  it('缺少 vs 或一侧属性时判为格式错误', () => {
    expect(parseCommand('对抗 甲 迅捷 乙 强壮', 'brp')).toMatchObject({ kind: 'invalid' });
    expect(parseCommand('对抗 甲 vs 乙', 'brp')).toMatchObject({ kind: 'invalid' });
  });
});

describe('容错', () => {
  it('无法识别时返回 invalid 并带原文，不抛错', () => {
    const r = parseCommand('掷个骰子看看', 'brp');
    expect(r).toMatchObject({ kind: 'invalid', reason: 'unknownVerb' });
    expect((r as any).raw).toBe('掷个骰子看看');
  });

  it('「检定」后缺参数判为格式错误', () => {
    expect(parseCommand('检定 甲', 'brp')).toMatchObject({ kind: 'invalid', reason: 'checkShape' });
  });
});

describe('奖惩骰改写骰式', () => {
  it('百分骰：奖励取较小、惩罚取较大', () => {
    expect(applyBonusDice('1d100', 'brp', 1)).toBe('2d100kl1');
    expect(applyBonusDice('1d100', 'brp', -1)).toBe('2d100kh1');
    expect(applyBonusDice('1d100', 'brp', 2)).toBe('3d100kl1');
  });

  it('d20：奖励即优势、惩罚即劣势', () => {
    expect(applyBonusDice('1d20', 'd20', 1)).toBe('2d20kh1');
    expect(applyBonusDice('1d20', 'd20', -1)).toBe('2d20kl1');
  });

  it('骰池族不支持奖惩骰，原式返回', () => {
    expect(applyBonusDice('$attrd10>=8', 'd10', 2)).toBe('$attrd10>=8');
  });

  it('没有奖惩时原式返回', () => {
    expect(applyBonusDice('1d100', 'brp')).toBe('1d100');
    expect(applyBonusDice('1d100', 'brp', 0)).toBe('1d100');
  });

  it('级数封顶 3 —— 再多也不会掷出一把骰子', () => {
    expect(applyBonusDice('1d100', 'brp', 99)).toBe('4d100kl1');
  });
});
