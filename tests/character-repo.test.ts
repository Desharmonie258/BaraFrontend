/**
 * 角色读取的跨模板行为。重点锁两件事：
 *
 * 1. **多张角色表并存时要全部读取**。YO、瑟瑟灵感系把角色拆成「恋爱对象表」
 *    与「重要角色表」两张并列的表，只读一张会让另一张的角色整个消失，
 *    且消失的是哪张取决于快照枚举顺序 —— 一种很难察觉的数据缺失。
 * 2. **表不存在与表里没数据要分得开**。前者恒定为假，界面该整块隐藏；
 *    后者是动态的，该显示空态。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { invalidate } from '../src/BaraFrontend/data/snapshot-repo';
import {
  readTrackedCharacters,
  readProtagonist,
  readCapabilities,
} from '../src/BaraFrontend/data/repositories/character-repo';

const HEAD = ['row_id', '姓名', '别称', '身份', '基础属性', '特有属性', '所在地点', '在场状态'];

function row(id: string, name: string): string[] {
  return [id, name, '', '', '', '', '', '在场'];
}

/*
 * 用 node 环境而非 jsdom：这里只需要一个挂 API 的 `window` 全局，
 * 不需要 DOM，省一份环境开销。
 */
(globalThis as any).window = globalThis;

function serve(raw: Record<string, unknown>) {
  (globalThis as any).AutoCardUpdaterAPI = { getCurrentData: () => raw };
  invalidate();
}

function mock(sheets: Record<string, { name: string; content: string[][] }>) {
  const raw: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(sheets)) {
    raw[key] = { name: s.name, sourceData: { ddl: '' }, content: s.content };
  }
  serve(raw);
}

beforeEach(() => {
  delete (globalThis as any).AutoCardUpdaterAPI;
  invalidate();
});

describe('readTrackedCharacters', () => {
  it('并存的两张角色表都要读到', () => {
    mock({
      sheet_romance_targets: { name: '恋爱对象表', content: [HEAD, row('1', '花子')] },
      sheet_important_non_romance: { name: '重要角色表', content: [HEAD, row('1', '太郎')] },
    });
    expect(readTrackedCharacters().map((c) => c.name).sort()).toEqual(['太郎', '花子']);
  });

  it('每个角色带自己所属的表名 —— 写回要靠它定位', () => {
    mock({
      sheet_romance_targets: { name: '恋爱对象表', content: [HEAD, row('1', '花子')] },
      sheet_important_non_romance: { name: '重要角色表', content: [HEAD, row('1', '太郎')] },
    });
    const bySheet = Object.fromEntries(
      readTrackedCharacters().map((c) => [c.name, { sheet: c.sheetName, row: c.rowIndex }]),
    );
    expect(bySheet['花子']).toEqual({ sheet: '恋爱对象表', row: 1 });
    // 行号是表内的，两张表各自从 1 起，不是全局连续编号
    expect(bySheet['太郎']).toEqual({ sheet: '重要角色表', row: 1 });
  });

  it('沿用旧模板的单张「追踪角色表」照常工作', () => {
    mock({ sheet_important_npc: { name: '追踪角色表', content: [HEAD, row('1', '笹兵卫')] } });
    expect(readTrackedCharacters().map((c) => c.name)).toEqual(['笹兵卫']);
  });

  it('没有任何角色表时返回空数组而非抛错', () => {
    mock({ sheet_summary: { name: '纪要表', content: [['row_id', '概览']] } });
    expect(readTrackedCharacters()).toEqual([]);
  });
});

describe('readProtagonist', () => {
  it('「主角信息」与「主角信息表」两种命名都认', () => {
    mock({ sheet_protagonist: { name: '主角信息', content: [HEAD, row('1', '甲')] } });
    expect(readProtagonist()?.name).toBe('甲');

    mock({ sheet_protagonist: { name: '主角信息表', content: [HEAD, row('1', '乙')] } });
    expect(readProtagonist()?.name).toBe('乙');
  });
});

/**
 * 1.1 起主角是角色表里的一行，不再有独立的主角表。
 *
 * 主角没有数据层的显式标记 —— 它就是 persona。这批用例锁的是
 * 「怎么把那一行认出来」以及「认出来之后不能在重要角色里重复出现」。
 */
describe('合并后的主角行', () => {
  /** 带「角色定位」列的表头，对应 1.1 模板 */
  const H = [...HEAD, '角色定位'];
  const r = (id: string, name: string, profile = '跟踪中'): string[] => [
    ...row(id, name),
    profile,
  ];

  beforeEach(() => {
    for (const k of ['getCurrentPersonaName', 'TavernHelper', 'SillyTavern', 'name1']) {
      delete (globalThis as any)[k];
    }
  });

  it('按 persona 名认出主角行', () => {
    (window as any).name1 = '笹兵卫';
    mock({
      sheet_important_npc: {
        name: '角色表',
        content: [H, r('1', '笹兵卫', '永固'), r('2', '艾莉丝')],
      },
    });
    const p = readProtagonist();
    expect(p?.name).toBe('笹兵卫');
    expect(p?.isProtagonist).toBe(true);
  });

  it('主角不在重要角色列表里重复出现', () => {
    (window as any).name1 = '笹兵卫';
    mock({
      sheet_important_npc: {
        name: '角色表',
        content: [H, r('1', '笹兵卫', '永固'), r('2', '艾莉丝')],
      },
    });
    expect(readTrackedCharacters().map((c) => c.name)).toEqual(['艾莉丝']);
  });

  it('主角行不在首行时，行号仍指向它自己 —— 写回要靠这个', () => {
    (window as any).name1 = '笹兵卫';
    mock({
      sheet_important_npc: {
        name: '角色表',
        content: [H, r('1', '艾莉丝'), r('2', '笹兵卫', '永固')],
      },
    });
    expect(readProtagonist()?.rowIndex).toBe(2);
    expect(readTrackedCharacters().map((c) => c.rowIndex)).toEqual([1]);
  });

  it('姓名写成未展开的 {{user}} 时也能认出 —— 模板注入时不展开这个宏', () => {
    (window as any).name1 = '笹兵卫';
    mock({
      sheet_important_npc: {
        name: '角色表',
        content: [H, r('1', '{{user}}', '永固'), r('2', '艾莉丝')],
      },
    });
    expect(readProtagonist()?.name).toBe('笹兵卫');
    expect(readTrackedCharacters().map((c) => c.name)).toEqual(['艾莉丝']);
  });

  it('persona 名对不上时，退到第一个「永固」行', () => {
    (window as any).name1 = '玩家改过的名字';
    mock({
      sheet_important_npc: {
        name: '角色表',
        content: [H, r('1', '艾莉丝'), r('2', '笹兵卫', '永固')],
      },
    });
    expect(readProtagonist()?.name).toBe('笹兵卫');
  });

  it('没有 persona 也没有永固行时返回 null，而不是错认一行', () => {
    mock({
      sheet_important_npc: { name: '角色表', content: [H, r('1', '艾莉丝'), r('2', '太郎')] },
    });
    expect(readProtagonist()).toBeNull();
    // 认不出是**数据**问题：面板位置保留、内部显示空态，布局不随数据跳动
    expect(readCapabilities().protagonist).toBe(true);
    // 认不出主角也不影响其他角色照常显示
    expect(readTrackedCharacters().map((c) => c.name)).toEqual(['艾莉丝', '太郎']);
  });

  it('空姓名行不会被误认成主角', () => {
    // resolveUserName('') 返回兜底文案「主角」，取不到 persona 时两边会撞上
    mock({
      sheet_important_npc: { name: '角色表', content: [H, r('1', ''), r('2', '艾莉丝')] },
    });
    expect(readProtagonist()).toBeNull();
  });

  it('旧结构仍然可读 —— 外部模板不会跟着我们合并', () => {
    (window as any).name1 = '笹兵卫';
    mock({
      sheet_protagonist: { name: '主角信息', content: [HEAD, row('1', '甲')] },
      sheet_important_npc: { name: '追踪角色表', content: [HEAD, row('1', '艾莉丝')] },
    });
    expect(readProtagonist()?.name).toBe('甲');
    expect(readTrackedCharacters().map((c) => c.name)).toEqual(['艾莉丝']);
  });
});

describe('readCapabilities', () => {
  it('表不存在时判为不可用 —— 界面据此整块隐藏', () => {
    mock({ sheet_summary: { name: '纪要表', content: [['row_id', '概览']] } });
    expect(readCapabilities()).toEqual({
      protagonist: false,
      characters: false,
      supplies: false,
    });
  });

  it('表存在但没有数据行仍判为可用 —— 那是空态，不是缺失', () => {
    mock({
      sheet_important_npc: { name: '重要角色表', content: [HEAD] },
      sheet_protagonist: { name: '主角信息', content: [HEAD] },
      sheet_inventory: { name: '物品表', content: [['row_id', '物品名称']] },
    });
    expect(readCapabilities()).toEqual({
      protagonist: true,
      characters: true,
      supplies: true,
    });
  });

  it('物品表与装备表有其一即算物资可用', () => {
    mock({ sheet_equipment: { name: '装备表', content: [['row_id', '装备名称']] } });
    expect(readCapabilities().supplies).toBe(true);
  });
});

/**
 * 真实模板的回归断言 —— 手写夹具证明逻辑对，真实模板证明它对**这些模板**对。
 * 两者都要：手写夹具不会自己变，真实模板会随作者更新而变。
 */
describe('真实模板', () => {
  /*
   * 夹具在模块加载时一次读完，用例内只做纯计算。
   * 把 readFileSync 放进用例会让磁盘抖动直接计入用例耗时，
   * 偶尔顶穿默认的 5s 超时 —— 失败的是 IO，不是被测逻辑。
   */
  const ROOT = resolve(__dirname, '../..');
  const load = (rel: string) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));

  const TEMPLATES = {
    yo: load('需兼容适配/YO-骰子-恋爱特化表v7.3.json'),
    theater: load('需兼容适配/小剧场3.3.json'),
    own: load('数据库模板-BaraFrontend-1.0-RosaCaninae.json'),
    own11: load('数据库模板-BaraFrontend-1.1-Gigantea.json'),
  };

  function loadTemplate(which: keyof typeof TEMPLATES) {
    serve(TEMPLATES[which]);
  }

  it('YO 模板：恋爱对象表与重要角色表都被认作角色表', () => {
    loadTemplate('yo');
    expect(readCapabilities().characters).toBe(true);
  });

  it('小剧场3.3：没有任何角色表，仪表盘应整体隐藏', () => {
    loadTemplate('theater');
    const caps = readCapabilities();
    expect(caps.characters).toBe(false);
    expect(caps.protagonist).toBe(false);
    // 三项全 false → DashboardPage 显示「此模板无角色相关表」而非空白页
    expect(caps.supplies).toBe(false);
  });

  it('自家模板 1.0：三项能力齐备', () => {
    loadTemplate('own');
    expect(readCapabilities()).toEqual({
      protagonist: true,
      characters: true,
      supplies: true,
    });
  });

  it('自家模板 1.1：主角表没了，但主角能力不能跟着消失', () => {
    loadTemplate('own11');
    // 主角并入角色表 —— 有角色表就有承载主角的地方，面板照常出现，
    // 里面显示空态（模板只有表头，主角行要等初始化才生成）
    expect(readCapabilities()).toEqual({
      protagonist: true,
      characters: true,
      supplies: true,
    });
    expect(readProtagonist()).toBeNull();
  });
});
