/**
 * @vitest-environment jsdom
 *
 * 属性量纲同步。重点锁「不该动的地方不动」—— 写模板是本项目风险
 * 最高的操作，多改一个字都可能让整套表结构要重导。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  replaceTag,
  buildRuleBlock,
  rollExamples,
  previewSync,
  applySync,
} from '../src/BaraFrontend/data/repositories/attribute-sync';
import {
  getAttributePreset,
  buildScale,
  unionRange,
  attributeModifier,
  formatModifier,
  checkBonus,
} from '../src/BaraFrontend/domain/attribute-presets';

function tpl(note: string) {
  return {
    sheet_a: { name: '主角信息', sourceData: { note } },
    sheet_b: { name: '物品表', sourceData: { note: '与属性无关的说明' } },
  };
}

let imported: unknown = null;
function mockApi(template: unknown, ok = true) {
  imported = null;
  (window as any).AutoCardUpdaterAPI = {
    getTableTemplate: () => template,
    importTemplateFromData: (data: unknown) => {
      imported = data;
      return Promise.resolve({ success: ok, message: ok ? 'ok' : 'boom' });
    },
  };
}

beforeEach(() => {
  delete (window as any).AutoCardUpdaterAPI;
  imported = null;
});

describe('标签替换', () => {
  it('只换标签内内容，标签外原样保留', () => {
    const note = '前置说明\n<属性规则>\n旧内容\n</属性规则>\n后置说明';
    const out = replaceTag(note, '属性规则', '新内容');
    expect(out).toContain('前置说明');
    expect(out).toContain('后置说明');
    expect(out).toContain('新内容');
    expect(out).not.toContain('旧内容');
  });

  it('没有标签时不改动 —— 不往陌生的 note 里塞东西', () => {
    const note = '一段没有标签的说明';
    expect(replaceTag(note, '属性规则', '新内容')).toBe(note);
  });
});

describe('规则块生成', () => {
  it('三族的量纲各不相同', () => {
    const brp = buildRuleBlock('brp');
    const d20 = buildRuleBlock('d20');
    const d10 = buildRuleBlock('d10');
    expect(brp).toContain('[5,95]');
    expect(d20).toContain('[3,20]');
    expect(d10).toContain('[1,5]');
  });

  it('示例是当场掷的，不是写死的常量', () => {
    // 连掷多次，至少出现两种不同结果
    const seen = new Set(Array.from({ length: 20 }, () => buildRuleBlock('brp')));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('示例值落在声明的区间内 —— 否则 AI 会照着越界的样例写', () => {
    const preset = getAttributePreset('d20');
    const [lo, hi] = unionRange(preset.base);
    for (let i = 0; i < 50; i++) {
      for (const pair of rollExamples(preset).base) {
        expect(pair.value).toBeGreaterThanOrEqual(lo);
        expect(pair.value).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('关联基础属性必须是六个基础属性之一，并写进示例的第三段', () => {
    for (const f of ['brp', 'd20'] as const) {
      const preset = getAttributePreset(f);
      const baseNames = new Set(preset.base.map((b) => b.name));
      for (const spec of preset.special) {
        expect(spec.key, `${f}.${spec.name} 缺少关联属性`).toBeTruthy();
        expect(baseNames.has(spec.key!), `${f}.${spec.name} 的关联属性不在基础属性里`).toBe(true);
      }
      expect(buildRuleBlock(f)).toMatch(/:-?\d+:(力量|敏捷|体质|智力|感知|魅力)/);
    }
  });

  it('骰池族不挂靠基础属性，示例不写第三段', () => {
    const preset = getAttributePreset('d10');
    expect(preset.special.every((s) => !s.key)).toBe(true);
    expect(rollExamples(preset).special.every((p) => !p.key)).toBe(true);
  });

  it('三族的示例技能各不相同 —— 量纲与专精规则都不一样，不能共用', () => {
    const names = (f: 'brp' | 'd20' | 'd10') =>
      getAttributePreset(f).special.map((s) => s.name).join('|');
    expect(names('brp')).not.toBe(names('d20'));
    expect(names('d10')).not.toBe(names('d20'));
  });

  it('专精语义写进规则块 —— 三族的括号含义不同', () => {
    expect(buildRuleBlock('d20')).toContain('每个专精是一条独立技能');
    expect(buildRuleBlock('d10')).toContain('专精并不会拆成独立技能');
  });

  it('六个基础属性名三族共用 —— 换族不该让已有存档失配', () => {
    const names = (f: 'brp' | 'd20' | 'd10') =>
      getAttributePreset(f).base.map((s) => s.name);
    expect(names('d20')).toEqual(names('brp'));
    expect(names('d10')).toEqual(names('brp'));
  });
});

/** 解析标尺：`3-4:x` 与单值档 `3:x` 两种形态 */
function parseScale(scale: string): Array<[number, number]> {
  return scale.split(' | ').map((seg) => {
    const m = /^(\d+)(?:-(\d+))?:/.exec(seg)!;
    return [Number(m[1]), Number(m[2] ?? m[1])] as [number, number];
  });
}

describe('属性标尺', () => {
  it('单值档写成 `3:普通`，不写成 `3-3:普通`', () => {
    expect(buildScale([1, 5], ['无能', '生疏', '普通', '熟练', '精通'])).toBe(
      '1:无能 | 2:生疏 | 3:普通 | 4:熟练 | 5:精通',
    );
  });

  it('分档连续覆盖整个区间，不留空隙也不重叠', () => {
    const bounds = parseScale(buildScale([5, 95], ['a', 'b', 'c', 'd', 'e', 'f']));
    expect(bounds[0][0]).toBe(5);
    expect(bounds[bounds.length - 1][1]).toBe(95);
    for (let i = 1; i < bounds.length; i++) {
      expect(bounds[i][0]).toBe(bounds[i - 1][1] + 1);
    }
  });
});

describe('预览', () => {
  it('列出将被改写的表，不含无关表', () => {
    mockApi(tpl('<属性规则>\n旧\n</属性规则>'));
    const p = previewSync('brp');
    expect(p.sheets).toEqual(['主角信息']);
    expect(p.blocker).toBeNull();
  });

  it('读不到模板时给出明确阻断原因', () => {
    mockApi(null);
    expect(previewSync('brp').blocker).toBe('noTemplate');
  });

  it('模板里没有带标签的表时阻断', () => {
    mockApi({ sheet_b: { name: '物品表', sourceData: { note: '无标签' } } });
    expect(previewSync('brp').blocker).toBe('noTaggedSheet');
  });

  it('预览不写入任何东西', async () => {
    mockApi(tpl('<属性规则>\n旧\n</属性规则>'));
    previewSync('brp');
    expect(imported).toBeNull();
  });
});

describe('执行', () => {
  it('写入指定的 block，与预览看到的一致', async () => {
    mockApi(tpl('<属性规则>\n旧\n</属性规则>'));
    const p = previewSync('brp');
    const res = await applySync('brp', p.block);

    expect(res.success).toBe(true);
    expect(res.changed).toBe(1);
    const note = (imported as any).sheet_a.sourceData.note;
    expect(note).toContain(p.block);
  });

  it('无关表的 note 不被触碰', async () => {
    mockApi(tpl('<属性规则>\n旧\n</属性规则>'));
    await applySync('brp');
    expect((imported as any).sheet_b.sourceData.note).toBe('与属性无关的说明');
  });

  it('没有实际改动时不发起写入 —— 无谓的写同样有失败风险', async () => {
    const block = buildRuleBlock('brp');
    mockApi(tpl(`<属性规则>\n${block}\n</属性规则>`));
    const res = await applySync('brp', block);
    expect(res.message).toBe('noChange');
    expect(imported).toBeNull();
  });

  it('写入范围限定为当前聊天', async () => {
    mockApi(tpl('<属性规则>\n旧\n</属性规则>'));
    const spy = vi.spyOn((window as any).AutoCardUpdaterAPI, 'importTemplateFromData');
    await applySync('brp');
    expect(spy.mock.calls[0][1]).toMatchObject({ scope: 'chat' });
  });

  it('宿主返回失败时如实上报，不吞成成功', async () => {
    mockApi(tpl('<属性规则>\n旧\n</属性规则>'), false);
    const res = await applySync('brp');
    expect(res.success).toBe(false);
    expect(res.message).toBe('boom');
  });

  it('读不到模板时不抛错', async () => {
    mockApi(null);
    expect((await applySync('brp')).success).toBe(false);
  });
});

describe('d20 调整值', () => {
  it('按 floor((值-10)/2) 推算，与常见例子一致', () => {
    const cases: Array<[number, number]> = [
      [10, 0], [24, 7], [6, -2], [3, -4], [11, 0], [12, 1], [20, 5], [30, 10],
    ];
    for (const [v, expected] of cases) {
      expect(attributeModifier('d20', v), `值 ${v}`).toBe(expected);
    }
  });

  it('其余两族没有调整值概念，返回 null', () => {
    expect(attributeModifier('brp', 62)).toBeNull();
    expect(attributeModifier('d10', 4)).toBeNull();
  });

  it('非数值返回 null 而非 NaN —— NaN 会渲染成「+NaN」', () => {
    expect(attributeModifier('d20', Number.NaN)).toBeNull();
  });

  it('零与负数都带符号，+0 不写成 0', () => {
    expect(formatModifier(0)).toBe('+0');
    expect(formatModifier(7)).toBe('+7');
    expect(formatModifier(-2)).toBe('-2');
  });

  it('d20 的特有属性记加值，因此区间允许负数', () => {
    const [lo] = unionRange(getAttributePreset('d20').special);
    expect(lo).toBeLessThan(0);
  });

  it('特有属性不推调整值 —— 值本身就是加值，再推一次是双重计算', () => {
    expect(attributeModifier('d20', 25, 'special')).toBeNull();
    expect(attributeModifier('d20', 25, 'base')).toBe(7);
  });

  it('检定加值：基础属性走推算，特有属性直接用值', () => {
    expect(checkBonus('d20', 16, 'base')).toBe(3);
    expect(checkBonus('d20', 6, 'special')).toBe(6);
    // 记绝对值的族里，特有属性不额外提供加值
    expect(checkBonus('brp', 55, 'special')).toBe(0);
    expect(checkBonus('d10', 4, 'special')).toBe(0);
  });
});
