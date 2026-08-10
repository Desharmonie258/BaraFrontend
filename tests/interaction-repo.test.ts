/**
 * 交互总览的对象清单。
 *
 * 两条纪律：
 *
 * 1. **只收有动作的表**。收进来只会得到一屏点不动的圆圈 ——
 *    这个页面回答「我现在能做什么」，不是又一个表清单。
 * 2. **名称列要认得出各家模板的叫法**。名字取错了整个页面就是一排空圈。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { invalidate } from '../src/BaraFrontend/data/snapshot-repo';
import { readInteractions } from '../src/BaraFrontend/data/repositories/interaction-repo';
import { BUILTIN_ACTIONS } from '../src/BaraFrontend/domain/interaction-rules';

(globalThis as any).window = globalThis;

function serve(sheets: Record<string, { name: string; content: string[][] }>) {
  const raw: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(sheets)) {
    raw[key] = { name: s.name, sourceData: { ddl: '' }, content: s.content };
  }
  (globalThis as any).AutoCardUpdaterAPI = { getCurrentData: () => raw };
  invalidate();
}

beforeEach(() => {
  delete (globalThis as any).AutoCardUpdaterAPI;
  invalidate();
});

describe('对象扫描', () => {
  it('每一行变成一个对象，带上该表的动作', () => {
    serve({
      sheet_characters: {
        name: '角色表',
        content: [
          ['row_id', '姓名', '身份'],
          ['1', '御苑', '学生'],
          ['2', '新宿', '店主'],
        ],
      },
    });

    const sections = readInteractions(BUILTIN_ACTIONS);
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe('character');
    expect(sections[0].objects.map((o) => o.name)).toEqual(['御苑', '新宿']);
    expect(sections[0].objects[0].actions.map((a) => a.label)).toContain('交谈');
  });

  it('没有任何动作的表整张跳过 —— 不给一屏点不动的圆圈', () => {
    serve({
      sheet_x: { name: '性爱生涯实录', content: [['row_id', '开始时间'], ['1', '第三日']] },
    });
    expect(readInteractions(BUILTIN_ACTIONS)).toEqual([]);
  });

  it('无名的行不收 —— 点开也不知道是什么', () => {
    serve({
      sheet_characters: {
        name: '角色表',
        content: [['row_id', '姓名'], ['1', '御苑'], ['2', '  ']],
      },
    });
    expect(readInteractions(BUILTIN_ACTIONS)[0].objects).toHaveLength(1);
  });

  it('行号是数据库口径（1 为第一行数据）', () => {
    serve({
      sheet_characters: { name: '角色表', content: [['row_id', '姓名'], ['1', '御苑']] },
    });
    expect(readInteractions(BUILTIN_ACTIONS)[0].objects[0].rowIndex).toBe(1);
  });
});

describe('名称列', () => {
  it('优先按关键词找', () => {
    serve({
      sheet_x: {
        name: '物品表',
        content: [['row_id', '编号', '物品名称'], ['1', 'A-1', '绳索']],
      },
    });
    expect(readInteractions(BUILTIN_ACTIONS)[0].objects[0].name).toBe('绳索');
  });

  it('没有关键词列时退回第一个非 row_id 列', () => {
    serve({
      sheet_x: { name: '世界地图点', content: [['row_id', '详细地点', '类型'], ['1', '橡木镇', '城镇']] },
    });
    expect(readInteractions(BUILTIN_ACTIONS)[0].objects[0].name).toBe('橡木镇');
  });

  it('摘要取名称之外前两个非空列 —— 光有名字认不出是哪一个', () => {
    serve({
      sheet_x: {
        name: '物品表',
        content: [
          ['row_id', '物品名称', '持有人', '类型', '描述'],
          ['1', '绳索', '御苑', '工具', '很长的描述'],
        ],
      },
    });
    expect(readInteractions(BUILTIN_ACTIONS)[0].objects[0].detail).toBe('御苑　工具');
  });
});

/**
 * 实测出来的一类错：一个角色被刷成十几个可交互对象。
 *
 * 三条独立的成因，各修各的，任一条回退都会让它重现。
 */
describe('附表不该造出重复对象', () => {
  it('角色资源表整张跳过 —— 它的每一行是某个角色的一项资源，不是一个角色', () => {
    serve({
      sheet_resources: {
        name: '角色资源表',
        content: [
          ['row_id', '持有人', '资源ID', '显示名', '当前值', '上限'],
          ['1', '李牧', 'stamina', '耐力值', '80', '100'],
          ['2', '李牧', 'mana', '法力值', '30', '50'],
          ['3', '王彪', 'stamina', '耐力值', '90', '100'],
        ],
      },
    });
    expect(readInteractions(BUILTIN_ACTIONS)).toEqual([]);
  });

  it('「持有人」这类外键不能当名称列 —— 它指向别的表里的对象', () => {
    // 表名不含附表关键词，走的是名称列这一道
    serve({
      sheet_x: {
        name: '角色装载表',
        content: [['row_id', '持有人', '槽位'], ['1', '李牧', '主手']],
      },
    });
    expect(readInteractions(BUILTIN_ACTIONS)).toEqual([]);
  });

  it('「重要角色生理」这类附表不归角色分区', () => {
    serve({
      sheet_chars: { name: '角色表', content: [['row_id', '姓名'], ['1', '李牧']] },
      sheet_bio: {
        name: '重要角色生理',
        content: [['row_id', '姓名', '相貌'], ['1', '李牧', '清瘦']],
      },
    });
    const sections = readInteractions(BUILTIN_ACTIONS);
    expect(sections).toHaveLength(1);
    expect(sections[0].objects).toHaveLength(1);
  });

  it('同分区内同名只留一个，动作取并集', () => {
    // 两张都是正经角色表，同一个人出现在两处
    serve({
      sheet_a: { name: '角色表', content: [['row_id', '姓名'], ['1', '李牧']] },
      sheet_b: { name: '恋爱对象表', content: [['row_id', '姓名'], ['1', '李牧']] },
    });
    const objects = readInteractions(BUILTIN_ACTIONS)[0].objects;
    expect(objects).toHaveLength(1);
    expect(objects[0].name).toBe('李牧');
  });

  it('合并不会污染其余对象的动作', () => {
    serve({
      sheet_a: { name: '角色表', content: [['row_id', '姓名'], ['1', '李牧'], ['2', '王彪']] },
      sheet_b: { name: '恋爱对象表', content: [['row_id', '姓名'], ['1', '李牧']] },
    });
    const objects = readInteractions(BUILTIN_ACTIONS)[0].objects;
    const 李牧 = objects.find((o) => o.name === '李牧')!;
    const 王彪 = objects.find((o) => o.name === '王彪')!;
    expect(王彪.actions).toHaveLength(李牧.actions.length);
  });

  it('不同分区的同名对象各自保留 —— 地点与角色可以同名', () => {
    serve({
      sheet_a: { name: '角色表', content: [['row_id', '姓名'], ['1', '青木']] },
      sheet_b: { name: '世界地图点', content: [['row_id', '详细地点'], ['1', '青木']] },
    });
    const sections = readInteractions(BUILTIN_ACTIONS);
    expect(sections.map((s) => s.kind)).toEqual(['character', 'map']);
    expect(sections[0].objects[0].name).toBe('青木');
    expect(sections[1].objects[0].name).toBe('青木');
  });
});

describe('分区', () => {
  it('按 SECTIONS 的顺序输出，角色在最前', () => {
    serve({
      sheet_items: { name: '物品表', content: [['row_id', '物品名称'], ['1', '绳索']] },
      sheet_chars: { name: '角色表', content: [['row_id', '姓名'], ['1', '御苑']] },
      sheet_map: { name: '世界地图点', content: [['row_id', '详细地点'], ['1', '橡木镇']] },
    });
    expect(readInteractions(BUILTIN_ACTIONS).map((s) => s.kind)).toEqual([
      'character', 'map', 'item',
    ]);
  });

  it('空分区不返回 —— 永远没有内容的分组标题只是噪声', () => {
    serve({
      sheet_chars: { name: '角色表', content: [['row_id', '姓名']] },
    });
    expect(readInteractions(BUILTIN_ACTIONS)).toEqual([]);
  });

  it('同分区的多张表合并到一起', () => {
    serve({
      sheet_a: { name: '角色表', content: [['row_id', '姓名'], ['1', '御苑']] },
      sheet_b: { name: '恋爱对象表', content: [['row_id', '姓名'], ['1', '新宿']] },
    });
    const sections = readInteractions(BUILTIN_ACTIONS);
    expect(sections).toHaveLength(1);
    expect(new Set(sections[0].objects.map((o) => o.name))).toEqual(new Set(['御苑', '新宿']));
  });
});
