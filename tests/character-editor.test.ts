/**
 * 角色字段的手改。重点全在**属性打包串**上 —— 一行角色的全部属性挤在
 * 同一个格子里，改一项等于重写整串，写错的代价是把别的属性一起抹掉。
 *
 * 另外锁住全局状态面板的读写：那张表只有一行，认列要认得出各家模板的叫法。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { invalidate } from '../src/BaraFrontend/data/snapshot-repo';
import {
  setAttribute, setLocation, setPresence, setResource, attributeRange,
} from '../src/BaraFrontend/data/repositories/character-editor';
import { readGlobalState, setGlobalField } from '../src/BaraFrontend/data/repositories/global-repo';
import type { CharacterVM } from '../src/BaraFrontend/data/repositories/character-repo';

(globalThis as any).window = globalThis;

const CHAR_HEAD = [
  'row_id', '姓名', '别称', '身份', '基础属性', '特有属性',
  '所在地点', '在场状态', '跟踪状态', '角色定位',
];
const GLOBAL_HEAD = ['row_id', '当前详细地点', '当前次要地区', '当前主要地区', '当前时间'];

let writes: Array<[string, number, string, string]> = [];
let data: Record<string, any>;

function serve() {
  data = {
    sheet_characters: {
      name: '角色表',
      sourceData: { ddl: '' },
      content: [
        CHAR_HEAD,
        ['1', '御苑', '', '学生', '力量:19; 敏捷:64; 体质:50', '野猪狩猎:7:敏捷', '橡木镇', '在场', '', ''],
      ],
    },
    sheet_global: {
      name: '全局数据表',
      sourceData: { ddl: '' },
      content: [GLOBAL_HEAD, ['1', '橡木镇广场', '橡木镇', '青木省', '第三日 黄昏']],
    },
  };
  (globalThis as any).AutoCardUpdaterAPI = {
    getCurrentData: () => data,
    updateCell: (table: string, row: number, col: string, value: string) => {
      writes.push([table, row, col, value]);
      const sheet = Object.values(data).find((s: any) => s.name === table) as any;
      const at = sheet.content[0].indexOf(col);
      if (at < 0) return false;
      sheet.content[row][at] = value;
      return true;
    },
    insertRow: () => 1,
    deleteRow: () => true,
  };
  invalidate();
}

/** 界面上那份角色。刻意带一份**过期**的属性，用来验证写回不吃它 */
function vm(overrides: Partial<CharacterVM> = {}): CharacterVM {
  return {
    rowIndex: 1,
    sheetName: '角色表',
    name: '御苑',
    aliases: '',
    identity: '学生',
    location: '橡木镇',
    present: true,
    trackStatus: '',
    baseAttrs: [],
    specialAttrs: [],
    isProtagonist: false,
    ...overrides,
  } as CharacterVM;
}

beforeEach(() => {
  writes = [];
  delete (globalThis as any).AutoCardUpdaterAPI;
  invalidate();
  (globalThis as any).getVariables = () => ({});
  (globalThis as any).replaceVariables = () => {};
  (globalThis as any).getChatId = () => 'chat-1';
  serve();
});

describe('改属性', () => {
  it('只改目标那一项，其余属性原样保留', async () => {
    const r = await setAttribute(vm(), 'base', '敏捷', 70, 'brp');
    expect(r.ok).toBe(true);
    expect(writes[0][3]).toBe('力量:19; 敏捷:70; 体质:50');
  });

  it('顺序不变 —— 顺序一动 AI 每轮都会误判为有改动', async () => {
    await setAttribute(vm(), 'base', '力量', 20, 'brp');
    expect(writes[0][3]).toBe('力量:20; 敏捷:64; 体质:50');
  });

  it('特有属性的关联属性（第三段）不能被抹掉', async () => {
    await setAttribute(vm(), 'special', '野猪狩猎', 12, 'brp');
    expect(writes[0][3]).toBe('野猪狩猎:12:敏捷');
  });

  it('从最新快照重读，不吃界面上那份过期数据', async () => {
    // AI 在用户点开界面之后改了体质
    data.sheet_characters.content[1][4] = '力量:19; 敏捷:64; 体质:80';
    invalidate();

    // 界面上那份仍是旧值
    const stale = vm({
      baseAttrs: [{ name: '体质', value: 50 }] as any,
    });
    await setAttribute(stale, 'base', '敏捷', 70, 'brp');

    // AI 写的体质 80 必须还在
    expect(writes[0][3]).toBe('力量:19; 敏捷:70; 体质:80');
  });

  it('超出规则族区间的值被钳制', async () => {
    const range = attributeRange('brp', 'base');
    await setAttribute(vm(), 'base', '力量', range.max + 50, 'brp');
    expect(writes[0][3]).toContain(`力量:${range.max}`);
  });

  it('行已经不在表里时不写，并说明要刷新', async () => {
    const r = await setAttribute(vm({ rowIndex: 99 }), 'base', '力量', 20, 'brp');
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.message).toContain('刷新');
    expect(writes).toEqual([]);
  });
});

describe('改地点与在场', () => {
  it('地点是自由文本，原样写入', async () => {
    await setLocation(vm(), '新宿车站');
    expect(writes[0]).toEqual(['角色表', 1, '所在地点', '新宿车站']);
  });

  it('在场状态写的是模板的枚举字面量', async () => {
    await setPresence(vm(), false);
    expect(writes[0]).toEqual(['角色表', 1, '在场状态', '离场']);
  });

  it('主角恒为在场，改它直接拒绝而不是写一个读不回来的值', async () => {
    const r = await setPresence(vm({ isProtagonist: true }), false);
    expect(r.ok).toBe(false);
    expect(writes).toEqual([]);
  });
});

describe('全局状态', () => {
  it('读出这张表唯一一行的时间与地点', () => {
    const state = readGlobalState();
    expect(state.available).toBe(true);
    const byColumn = Object.fromEntries(state.entries.map((e) => [e.column, e.value]));
    expect(byColumn['当前时间']).toBe('第三日 黄昏');
    expect(byColumn['当前详细地点']).toBe('橡木镇广场');
  });

  it('模板没有这张表时整块不可用，而不是给一排空字段', () => {
    delete data.sheet_global;
    invalidate();
    expect(readGlobalState()).toMatchObject({ available: false, entries: [] });
  });

  it('表在但没有数据行时也算不可用 —— 没有「当前」可言', () => {
    data.sheet_global.content = [GLOBAL_HEAD];
    invalidate();
    expect(readGlobalState().available).toBe(false);
  });

  it('写回第一行', async () => {
    await setGlobalField('当前时间', '第四日 清晨');
    expect(writes[0]).toEqual(['全局数据表', 1, '当前时间', '第四日 清晨']);
  });
});

/**
 * 资源的手改（1.11）—— 角色卡抽屉里的入口。
 *
 * 资源与属性不同：它一行一条，不挤在打包串里，所以就是普通的改格子。
 * 要锁的是**定位**（写到正确的表与行）与**不越权校验**。
 */
describe('改资源', () => {
  const resource = { sheetName: '角色资源表', rowIndex: 2 };

  beforeEach(() => {
    data.sheet_resources = {
      name: '角色资源表',
      sourceData: { ddl: '' },
      content: [
        ['row_id', '持有人', '资源ID', '显示名', '当前值', '上限'],
        ['1', '御苑', 'hp', '生命', '30', '50'],
        ['2', '御苑', 'stamina', '耐力', '80', '100'],
      ],
    };
    invalidate();
  });

  it('当前值写到正确的行列', async () => {
    await setResource(resource, 'current', 45);
    expect(writes[0]).toEqual(['角色资源表', 2, '当前值', '45']);
  });

  it('上限单独改', async () => {
    await setResource(resource, 'max', 120);
    expect(writes[0]).toEqual(['角色资源表', 2, '上限', '120']);
  });

  it('当前值超过上限**不拦** —— 临时护盾、过量治疗都是合法状态', async () => {
    const r = await setResource(resource, 'current', 999);
    expect(r.ok).toBe(true);
    expect(writes[0][3]).toBe('999');
  });

  it('负值也放行 —— 有些规则用负数表示透支', async () => {
    const r = await setResource(resource, 'current', -5);
    expect(r.ok).toBe(true);
  });
});
