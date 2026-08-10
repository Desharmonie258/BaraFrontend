/**
 * @vitest-environment jsdom
 *
 * 角色卡的聚合逻辑。重点锁两件事：关联列的差异（持有人 / 记录者 /
 * 主角外对象）是否都能正确认人，以及主角在「性爱生涯实录」上的
 * 不对称规则 —— 这两处最容易在模板改动后悄悄失效。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { invalidate } from '../src/BaraFrontend/data/snapshot-repo';
import {
  readCharacterSection,
  readBio,
  readResources,
} from '../src/BaraFrontend/data/repositories/sheet-repo';
import type { CharacterVM } from '../src/BaraFrontend/data/repositories/character-repo';

function char(over: Partial<CharacterVM> = {}): CharacterVM {
  return {
    rowIndex: 1,
    sheetName: '追踪角色表',
    name: '笹兵卫',
    aliases: '多默, 猪刈猛胤',
    identity: '',
    location: '',
    present: true,
    trackStatus: '',
    baseAttrs: [],
    specialAttrs: [],
    isProtagonist: false,
    ...over,
  };
}

function mock(sheets: Record<string, { name: string; content: string[][] }>) {
  const raw: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(sheets)) {
    raw[key] = { name: s.name, sourceData: { ddl: '' }, content: s.content };
  }
  (window as any).AutoCardUpdaterAPI = { getCurrentData: () => raw };
  invalidate();
}

beforeEach(() => {
  delete (window as any).AutoCardUpdaterAPI;
  invalidate();
});

describe('按持有人关联', () => {
  it('取出属于该角色的行，并剔除匹配列与 row_id', () => {
    mock({
      sheet_skills: {
        name: '技能表',
        content: [
          ['row_id', '技能名称', '持有人', '熟练度'],
          ['1', '刀术', '笹兵卫', '75'],
          ['2', '骑术', '别人', '40'],
        ],
      },
    });
    const s = readCharacterSection('skills', char())!;
    expect(s.rows).toHaveLength(1);
    expect(s.columns).toEqual(['技能名称', '熟练度']);
    expect(s.rows[0].cells['技能名称']).toBe('刀术');
  });

  it('别称也算本人 —— AI 在不同表里可能用不同称呼', () => {
    mock({
      sheet_inventory: {
        name: '物品表',
        content: [
          ['row_id', '物品名称', '持有人', '数量'],
          ['1', '灵石', '多默', '3'],
        ],
      },
    });
    expect(readCharacterSection('items', char())!.rows).toHaveLength(1);
  });

  it('表不存在时返回 null 而非抛错', () => {
    mock({});
    expect(readCharacterSection('skills', char())).toBeNull();
  });
});

describe('非「持有人」列的关联', () => {
  it('大事记靠记录者', () => {
    mock({
      sheet_c: {
        name: '追踪大事记',
        content: [
          ['row_id', '记录者', '记录内容', '发生时间'],
          ['1', '笹兵卫', '入祠堂', '1568-11-15'],
          ['2', '祖父', '授甲', '1568-11-15'],
        ],
      },
    });
    const s = readCharacterSection('chronicle', char())!;
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].cells['记录内容']).toBe('入祠堂');
  });

  it('亲密经历靠主角外对象', () => {
    mock({
      sheet_i: {
        name: '性爱生涯实录',
        content: [
          ['row_id', '开始时间', '主角外对象', '体位/玩法简述'],
          ['1', '1568-11-15', '笹兵卫', 'A'],
          ['2', '1568-11-16', '他人', 'B'],
        ],
      },
    });
    expect(readCharacterSection('intimacy', char())!.rows).toHaveLength(1);
  });

  it('主角拥有亲密经历整表 —— 每一行都隐含主角参与', () => {
    mock({
      sheet_i: {
        name: '性爱生涯实录',
        content: [
          ['row_id', '开始时间', '主角外对象', '体位/玩法简述'],
          ['1', '1568-11-15', '笹兵卫', 'A'],
          ['2', '1568-11-16', '他人', 'B'],
        ],
      },
    });
    const s = readCharacterSection('intimacy', char({ name: '主角', isProtagonist: true }))!;
    expect(s.rows).toHaveLength(2);
  });

  it('主角在大事记上没有这种特权 —— 那张表的记录者是明确的', () => {
    mock({
      sheet_c: {
        name: '追踪大事记',
        content: [
          ['row_id', '记录者', '记录内容'],
          ['1', '笹兵卫', 'A'],
        ],
      },
    });
    expect(readCharacterSection('chronicle', char({ name: '主角', isProtagonist: true }))).toBeNull();
  });

  it('关系表两列任一命中即算', () => {
    mock({
      sheet_r: {
        name: '关系表',
        content: [
          ['row_id', '角色A', '角色B', '关系描述'],
          ['1', '笹兵卫', '祖父', '祖孙'],
          ['2', '甲', '笹兵卫', '同门'],
          ['3', '甲', '乙', '无关'],
        ],
      },
    });
    expect(readCharacterSection('relations', char())!.rows).toHaveLength(2);
  });
});

describe('传记合并', () => {
  it('生理与心理合并成连续分区，空值列整条隐藏', () => {
    mock({
      sheet_p: {
        name: '重要角色生理',
        content: [
          ['row_id', '姓名', '相貌', '常用发型', '体毛'],
          ['1', '笹兵卫', '阔面', '黑发', ''],
        ],
      },
      sheet_m: {
        name: '重要角色心理',
        content: [
          ['row_id', '姓名', '性格主色调', '近期情绪状态'],
          ['1', '笹兵卫', '刚直', '焦躁'],
        ],
      },
    });
    const bio = readBio(char());
    const ids = bio.map((g) => g.id);

    // 近期变化必须排在最前
    expect(ids[0]).toBe('recent');
    // 空的「体毛」不出现
    const appearance = bio.find((g) => g.id === 'appearance')!;
    expect(appearance.fields.map((f) => f.label)).toEqual(['相貌', '常用发型']);
    // 全空的分区不出现
    expect(ids).not.toContain('preference');
  });

  it('近期变化标记为随剧情变动，成人向分区标记为成人向', () => {
    mock({
      sheet_m: {
        name: '重要角色心理',
        content: [
          ['row_id', '姓名', '近期情绪状态', '性经验'],
          ['1', '笹兵卫', '焦躁', '少'],
        ],
      },
    });
    const bio = readBio(char());
    expect(bio.find((g) => g.id === 'recent')!.volatile).toBe(true);
    expect(bio.find((g) => g.id === 'preference')!.adult).toBe(true);
  });
});

describe('资源', () => {
  it('解析当前值/上限并算出百分比', () => {
    mock({
      sheet_res: {
        name: '角色资源表',
        content: [
          ['row_id', '持有人', '资源ID', '显示名', '当前值', '上限', '恢复策略', '置顶'],
          ['1', '笹兵卫', 'hp', '生命', '12', '20', '长休', '是'],
        ],
      },
    });
    const [r] = readResources(char());
    expect(r).toMatchObject({ name: '生命', current: 12, max: 20, pinned: true });
    expect(r.percent).toBe(60);
  });

  it('上限缺失时百分比为 null，界面据此不画进度条', () => {
    mock({
      sheet_res: {
        name: '角色资源表',
        content: [
          ['row_id', '持有人', '显示名', '当前值', '上限'],
          ['1', '笹兵卫', '气', '3', ''],
        ],
      },
    });
    expect(readResources(char())[0].percent).toBeNull();
  });
});

/**
 * 传记的写回定位与空字段（1.11）。
 *
 * 传记把生理与心理**两张表**合并成一份连续内容，读的时候不必区分，
 * 写的时候必须区分 —— 每个字段得知道自己来自哪张表的哪一行。
 */
describe('传记的编辑支持', () => {
  function mockBio() {
    mock({
      sheet_physiology: {
        name: '重要角色生理',
        content: [
          ['row_id', '姓名', '相貌', '常用发型', '体毛'],
          ['1', '御苑', '清瘦', '', ''],
        ],
      },
      sheet_psychology: {
        name: '重要角色心理',
        content: [
          ['row_id', '姓名', '性格主色调', '近期情绪状态'],
          ['1', '御苑', '沉静', '焦躁'],
        ],
      },
    });
  }

  it('每个字段带着自己那张表与行号', () => {
    mockBio();
    const groups = readBio(char({ name: '御苑' }));
    const all = groups.flatMap((g) => g.fields);

    const 相貌 = all.find((f) => f.label === '相貌')!;
    expect(相貌.sheetName).toBe('重要角色生理');
    expect(相貌.rowIndex).toBe(1);

    const 主色调 = all.find((f) => f.label === '性格主色调')!;
    expect(主色调.sheetName).toBe('重要角色心理');
  });

  it('默认跳过空字段 —— 一屏「暂无」会让页面显得残缺', () => {
    mockBio();
    const labels = readBio(char({ name: '御苑' })).flatMap((g) => g.fields.map((f) => f.label));
    expect(labels).toContain('相貌');
    expect(labels).not.toContain('常用发型');
  });

  it('includeEmpty 把空字段也带出来，且定位仍然正确 —— 编辑态要填它们', () => {
    mockBio();
    const all = readBio(char({ name: '御苑' }), true).flatMap((g) => g.fields);
    const 发型 = all.find((f) => f.label === '常用发型');
    expect(发型).toBeDefined();
    expect(发型!.text).toBe('');
    // 空字段也得知道往哪张表写，否则编辑态下点了没反应
    expect(发型!.sheetName).toBe('重要角色生理');
    expect(发型!.rowIndex).toBe(1);
  });

  it('两表都有同名列时，有值的那份胜出', () => {
    mock({
      sheet_physiology: {
        name: '重要角色生理',
        content: [['row_id', '姓名', '相貌'], ['1', '御苑', '清瘦']],
      },
      sheet_psychology: {
        name: '重要角色心理',
        content: [['row_id', '姓名', '相貌'], ['1', '御苑', '']],
      },
    });
    const 相貌 = readBio(char({ name: '御苑' }), true)
      .flatMap((g) => g.fields)
      .find((f) => f.label === '相貌')!;
    expect(相貌.text).toBe('清瘦');
    expect(相貌.sheetName).toBe('重要角色生理');
  });
});
