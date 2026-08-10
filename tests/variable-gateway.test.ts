/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readVariables, toTree } from '../src/BaraFrontend/data/variable-gateway';

function clear(): void {
  for (const k of ['getVariables', 'eventEmit', 'eventOn', 'Mvu', 'SillyTavern']) {
    delete (window as any)[k];
  }
}

/** chatMetadata.variables —— LWB / ERA 的痕迹都留在这里 */
function withChatVars(vars: Record<string, unknown>, metaExtra: Record<string, unknown> = {}) {
  (window as any).SillyTavern = { chatMetadata: { variables: vars, ...metaExtra } };
  (window as any).getVariables = () => vars;
}

function withMvu(stat: Record<string, unknown>) {
  (window as any).Mvu = {
    getMvuData: () => ({ stat_data: stat, display_data: { a: '甲' } }),
  };
}
/** 酒馆助手的事件总线 —— 装了就一直在，不是任何框架的判据 */
function withTavernHelper() {
  (window as any).eventEmit = () => {};
  (window as any).eventOn = () => {};
}
function withEra(stat?: Record<string, unknown>) {
  withTavernHelper();
  withChatVars(stat ? { ERAMetaData: {}, stat_data: stat } : { ERAMetaData: {} });
}
function withLwb(stat: Record<string, unknown>) {
  withChatVars({ LWB_version: 1, stat_data: stat });
}

beforeEach(clear);

describe('框架检测', () => {
  it('都不可用时为 none', () => {
    expect(readVariables().framework).toBe('none');
  });

  it('只有 MVU 时用 MVU', () => {
    withMvu({ hp: 10 });
    const d = readVariables();
    expect(d.framework).toBe('mvu');
    expect(d.stat).toEqual({ hp: 10 });
  });

  it('LWB 优先于其余框架 —— 它在场时另两者的探测会误命中', () => {
    withLwb({ x: 1 });
    withMvu({ hp: 10 });
    withTavernHelper();
    expect(readVariables().framework).toBe('lwb');
  });

  it('ERA 痕迹在但 MVU 也有数据时，仍走 MVU 之前先认 ERA', () => {
    withEra({ hp: 1 });
    withMvu({ hp: 10 });
    expect(readVariables().framework).toBe('era');
  });

  it('chat 变量有 ERAMetaData 才判 ERA，并直接读出 stat_data', () => {
    withEra({ hp: 3 });
    const d = readVariables();
    expect(d.framework).toBe('era');
    expect(d.stat).toEqual({ hp: 3 });
  });

  it('ERA 只有元数据、无 stat_data 时，stat 为空交给页面提示异步接口', () => {
    withEra();
    expect(readVariables().stat).toBeNull();
  });

  it('酒馆助手的 eventEmit/eventOn 不是 ERA 判据 —— 无变量的卡必须是 none', () => {
    withTavernHelper();
    expect(readVariables().framework).toBe('none');
  });

  it('chat 变量只有 stat_data、没有 LWB_* 标记时不判 LWB', () => {
    withChatVars({ stat_data: { x: 1 } });
    expect(readVariables().framework).toBe('none');
  });

  it('MVU 接口抛错时不冒泡，降级为 none', () => {
    (window as any).Mvu = {
      getMvuData: () => {
        throw new Error('boom');
      },
    };
    expect(readVariables().framework).toBe('none');
  });

  it('每次调用重新探测 —— 切聊天后框架会变，缓存会串线', () => {
    withMvu({ hp: 10 });
    expect(readVariables().framework).toBe('mvu');
    clear();
    expect(readVariables().framework).toBe('none');
  });
});

describe('变量树', () => {
  it('嵌套对象展开成子节点', () => {
    const tree = toTree({ 角色: { 生命: 10 } });
    expect(tree[0].key).toBe('角色');
    expect(tree[0].value).toBeNull();
    expect(tree[0].children[0]).toMatchObject({ key: '生命', value: '10', path: '角色.生命' });
  });

  it('数组按下标展开 —— 直接 stringify 成一行会读不出结构', () => {
    const tree = toTree({ 技能: ['刀术', '骑术'] });
    expect(tree[0].children.map((c) => c.key)).toEqual(['0', '1']);
    expect(tree[0].children[0].value).toBe('刀术');
  });

  it('路径逐层拼接，可作展开状态的唯一标识', () => {
    const tree = toTree({ a: { b: { c: 1 } } });
    expect(tree[0].children[0].children[0].path).toBe('a.b.c');
  });

  it('null 与非对象输入返回空数组，不抛错', () => {
    expect(toTree(null)).toEqual([]);
    expect(toTree('文本')).toEqual([]);
    expect(toTree(undefined)).toEqual([]);
  });
});
