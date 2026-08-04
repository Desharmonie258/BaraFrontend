import { describe, it, expect } from 'vitest';
import {
  parse, serialize, clamp, get, applyDeltas, sqlEscape,
  RANGE_BASE, RANGE_SPECIAL,
} from '../src/BaraFrontend/domain/attribute-codec';

describe('parse', () => {
  it('解析标准格式', () => {
    expect(parse('力量:19; 敏捷:64; 体质:50')).toEqual([
      { name: '力量', value: 19 },
      { name: '敏捷', value: 64 },
      { name: '体质', value: 50 },
    ]);
  });

  it('容错：无空格、多空格、末尾分号', () => {
    const a = parse('力量:19;敏捷:64');
    const b = parse('力量 : 19 ;   敏捷 : 64 ;');
    expect(a).toEqual(b);
  });

  it('空串与 null 返回空数组', () => {
    expect(parse('')).toEqual([]);
    expect(parse(null)).toEqual([]);
    expect(parse(undefined)).toEqual([]);
  });

  it('非法数值保留原文而非丢弃', () => {
    const r = parse('力量:很强; 敏捷:64');
    expect(r[0]).toEqual({ name: '力量', value: null, raw: '很强' });
    expect(r[1].value).toBe(64);
  });

  it('缺冒号的残片保留原文', () => {
    const r = parse('力量; 敏捷:64');
    expect(r[0]).toEqual({ name: '力量', value: null, raw: '力量' });
  });

  it('重复键：保持首次位置，取最后的值', () => {
    const r = parse('力量:10; 敏捷:64; 力量:20');
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ name: '力量', value: 20 });
    expect(r[1].name).toBe('敏捷');
  });

  it('负数与小数可解析', () => {
    expect(get(parse('修正:-5'), '修正')).toBe(-5);
    expect(get(parse('系数:1.5'), '系数')).toBe(1.5);
  });
});

describe('往返', () => {
  const cases = [
    '',
    '力量:19',
    '力量:19; 敏捷:64; 体质:50',
    '力量:很强; 敏捷:64',
  ];
  it.each(cases)('parse→serialize→parse 稳定: %s', (input) => {
    const once = parse(input);
    const twice = parse(serialize(once));
    expect(twice).toEqual(once);
  });

  it('序列化保持原有顺序', () => {
    const s = serialize(parse('体质:50; 力量:19; 敏捷:64'));
    expect(s).toBe('体质:50; 力量:19; 敏捷:64');
  });
});

describe('clamp', () => {
  it('基础属性范围 [5,95]', () => {
    expect(clamp(1, RANGE_BASE)).toBe(5);
    expect(clamp(200, RANGE_BASE)).toBe(95);
    expect(clamp(50, RANGE_BASE)).toBe(50);
  });
  it('特有属性范围 [0,100]', () => {
    expect(clamp(-10, RANGE_SPECIAL)).toBe(0);
    expect(clamp(150, RANGE_SPECIAL)).toBe(100);
  });
  it('取整', () => {
    expect(clamp(50.6, RANGE_BASE)).toBe(51);
  });
});

describe('applyDeltas', () => {
  const base = parse('力量:19; 敏捷:64');

  it('增量修改', () => {
    const r = applyDeltas(base, [{ name: '力量', delta: 1 }], RANGE_BASE);
    expect(get(r, '力量')).toBe(20);
    expect(get(r, '敏捷')).toBe(64);
  });

  it('多处变更一次合并 —— 不互相覆盖', () => {
    const r = applyDeltas(
      base,
      [{ name: '力量', delta: 5 }, { name: '敏捷', delta: -4 }],
      RANGE_BASE,
    );
    expect(get(r, '力量')).toBe(24);
    expect(get(r, '敏捷')).toBe(60);
  });

  it('钳制生效', () => {
    const r = applyDeltas(base, [{ name: '力量', delta: 1000 }], RANGE_BASE);
    expect(get(r, '力量')).toBe(95);
  });

  it('不修改入参', () => {
    const snapshot = JSON.stringify(base);
    applyDeltas(base, [{ name: '力量', delta: 9 }], RANGE_BASE);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('属性不存在时：set 新建，纯 delta 忽略', () => {
    const a = applyDeltas(base, [{ name: '意志', delta: 5 }], RANGE_BASE);
    expect(get(a, '意志')).toBeUndefined();
    const b = applyDeltas(base, [{ name: '意志', set: 40 }], RANGE_BASE);
    expect(get(b, '意志')).toBe(40);
  });

  it('无法解析的项不参与运算', () => {
    const broken = parse('力量:很强');
    const r = applyDeltas(broken, [{ name: '力量', delta: 1 }], RANGE_BASE);
    expect(r[0]).toEqual({ name: '力量', value: null, raw: '很强' });
  });
});

describe('sqlEscape', () => {
  it('单引号加倍', () => {
    expect(sqlEscape("O'Brien")).toBe("O''Brien");
  });
  it('无引号时原样返回', () => {
    expect(sqlEscape('艾莉丝')).toBe('艾莉丝');
  });
});
