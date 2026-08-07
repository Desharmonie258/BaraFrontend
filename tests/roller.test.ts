import { describe, it, expect } from 'vitest';
import { evalFormula, rollAttribute } from '../src/BaraFrontend/domain/dice/roller';

/** 固定随机源：依次返回给定值，用尽后循环 */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** rnd() 落在 [0,1)，rollOne = floor(rnd*sides)+1；要掷出 n 面骰的 v 点则 rnd = (v-1)/sides */
const face = (v: number, sides: number) => (v - 1) / sides;

describe('骰式求值', () => {
  it('XdY 求和', () => {
    const r = evalFormula('3d6', {}, seq(face(4, 6), face(5, 6), face(6, 6)));
    expect(r.terms[0].rolls).toEqual([4, 5, 6]);
    expect(r.total).toBe(15);
  });

  it('省略数量时默认 1 颗', () => {
    expect(evalFormula('d20', {}, seq(face(13, 20))).total).toBe(13);
  });

  it('算术在骰子之后求值', () => {
    // 3d6=9，再 ×5
    const r = evalFormula('3d6*5', {}, seq(face(3, 6), face(3, 6), face(3, 6)));
    expect(r.total).toBe(45);
  });

  it('加法项与骰子项混合', () => {
    expect(evalFormula('10+5d20', {}, seq(face(4, 20))).total).toBe(10 + 4 * 5);
  });

  it('dl1 舍弃最低一颗 —— DnD 属性生成的做法', () => {
    const r = evalFormula('4d6dl1', {}, seq(face(2, 6), face(5, 6), face(6, 6), face(4, 6)));
    expect(r.terms[0].rolls).toEqual([2, 5, 6, 4]);
    expect(r.terms[0].kept).toEqual([4, 5, 6]);
    expect(r.total).toBe(15);
  });

  it('kh2 保留最高两颗 —— d20 优势', () => {
    const r = evalFormula('3d20kh2', {}, seq(face(5, 20), face(18, 20), face(11, 20)));
    expect(r.terms[0].kept).toEqual([11, 18]);
    expect(r.total).toBe(29);
  });

  it('可引用其他属性 —— 派生属性不需要额外机制', () => {
    expect(evalFormula('敏捷/2', { 敏捷: 64 }).total).toBe(32);
  });

  it('长名先代入，避免被短名截断', () => {
    expect(evalFormula('敏捷+敏', { 敏: 1, 敏捷: 10 }).total).toBe(11);
  });

  it('括号与一元负号', () => {
    expect(evalFormula('(2+3)*-2').total).toBe(-10);
  });

  it('除零返回 0 而非 Infinity —— Infinity 会污染后续全部计算', () => {
    expect(evalFormula('10/0').total).toBe(0);
  });

  it('非法字符不抛出，降级为 0 并留下痕迹', () => {
    const r = evalFormula('3d6; alert(1)');
    expect(r.total).toBe(0);
  });

  it('空公式返回 0', () => {
    expect(evalFormula('').total).toBe(0);
  });

  it('骰子数量有上限，防止 1000d1000 卡死页面', () => {
    const r = evalFormula('9999d6', {}, () => 0);
    expect(r.terms[0].rolls.length).toBe(100);
  });

  it('expanded 保留代入后的算式，便于展示推导', () => {
    const r = evalFormula('3d6*5', {}, seq(face(3, 6)));
    expect(r.expanded).toBe('9*5');
  });
});

describe('属性生成', () => {
  it('取整并夹到区间内', () => {
    // 3d6*5 最高 90，区间上限 50 时应被夹住
    expect(rollAttribute('3d6*5', [5, 50], {}, () => 0.99)).toBe(50);
    expect(rollAttribute('3d6*5', [40, 95], {}, () => 0)).toBe(40);
  });

  it('结果恒为整数', () => {
    const v = rollAttribute('1d5/2', [0, 100], {}, seq(face(3, 5)));
    expect(Number.isInteger(v)).toBe(true);
  });
});
