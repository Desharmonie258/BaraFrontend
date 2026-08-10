/**
 * 仪表盘预设的解析与匹配。
 *
 * 两条纪律要锁住：
 *
 * 1. **出错的地方一条都不能吞**。用户手写 JSON 出错时，「导入失败」四个字
 *    帮不了他找出是哪一行写坏了。
 * 2. **用不上的模块照样保留**。丢掉它们，预设在两个前端之间来回导一次
 *    就残缺了。
 */
import { describe, it, expect } from 'vitest';
import {
  parsePreset, serializePreset, matchSheets, matchColumn, PRESET_FORMAT,
} from '../src/BaraFrontend/domain/dashboard-preset';

const SHEETS = [
  { key: 'a', name: '角色表', headers: ['row_id', '姓名', '所在地点', '基础属性'] },
  { key: 'b', name: '恋爱对象表', headers: ['row_id', '姓名', '地点'] },
  { key: 'c', name: '物品表', headers: ['row_id', '物品名称', '持有人'] },
];

describe('解析', () => {
  it('标准预设', () => {
    const { preset, problems } = parsePreset({
      format: PRESET_FORMAT,
      name: '小剧场适配',
      description: '给小剧场3.3 用',
      modules: {
        npc: { tableKeywords: ['角色'], columns: { name: { keywords: ['姓名'] } } },
      },
    });
    expect(problems).toEqual([]);
    expect(preset?.name).toBe('小剧场适配');
    expect(preset?.modules.npc?.tableKeywords).toEqual(['角色']);
    expect(preset?.modules.npc?.columns.name).toEqual(['姓名']);
  });

  it('列关键词也接受直接给数组 —— 手写时最自然的写法', () => {
    const { preset } = parsePreset({
      modules: { npc: { tableKeywords: ['角色'], columns: { name: ['姓名', '名字'] } } },
    });
    expect(preset?.modules.npc?.columns.name).toEqual(['姓名', '名字']);
  });

  it('骰子系统的裸 modules 对象也能导入', () => {
    const { preset, problems } = parsePreset({
      modules: { bag: { tableKeywords: ['物品'] } },
    });
    expect(preset).not.toBeNull();
    expect(problems).toEqual([]);
  });

  it('format 不对只警告，不拒绝', () => {
    const { preset, problems } = parsePreset({
      format: 'something_else',
      modules: { bag: { tableKeywords: ['物品'] } },
    });
    expect(preset).not.toBeNull();
    expect(problems.join()).toContain('something_else');
  });

  it('本前端用不上的模块照样保留 —— 否则来回导一次就残缺了', () => {
    const { preset } = parsePreset({
      modules: {
        quest: { tableKeywords: ['任务'] },
        relationshipGraph: { tableKeywords: ['关系'] },
      },
    });
    expect(Object.keys(preset!.modules).sort()).toEqual(['quest', 'relationshipGraph']);
  });

  it('未知模块名被跳过，并说清是哪一个', () => {
    const { preset, problems } = parsePreset({
      modules: { bag: { tableKeywords: ['物品'] }, 自定义模块: { tableKeywords: ['x'] } },
    });
    expect(preset?.modules).not.toHaveProperty('自定义模块');
    expect(problems.join()).toContain('自定义模块');
  });

  it('空模块被跳过并报出来', () => {
    const { problems } = parsePreset({
      modules: { bag: { tableKeywords: ['物品'] }, npc: { tableKeywords: [] } },
    });
    expect(problems.join()).toContain('npc');
  });

  it('结构不成形时返回 null 并说明原因', () => {
    expect(parsePreset(null).preset).toBeNull();
    expect(parsePreset({}).problems.join()).toContain('modules');
    expect(parsePreset({ modules: {} }).problems.join()).toContain('没有任何可用的模块');
  });
});

describe('序列化', () => {
  it('往返后内容不变，且带 format 包装便于互导', () => {
    const original = parsePreset({
      name: 'x',
      description: 'y',
      modules: { bag: { tableKeywords: ['物品'], columns: { name: ['物品名称'] } } },
    }).preset!;

    const text = serializePreset(original);
    expect(JSON.parse(text).format).toBe(PRESET_FORMAT);
    expect(parsePreset(JSON.parse(text)).preset).toEqual(original);
  });
});

describe('表匹配', () => {
  it('表名包含关键词即命中', () => {
    const hit = matchSheets(SHEETS, { tableKeywords: ['物品'], columns: {} });
    expect(hit.map((s) => s.name)).toEqual(['物品表']);
  });

  it('命中多张时全部返回 —— 只取第一张会让另一张整个消失', () => {
    const hit = matchSheets(SHEETS, { tableKeywords: ['角色', '恋爱对象'], columns: {} });
    expect(hit.map((s) => s.name)).toEqual(['角色表', '恋爱对象表']);
  });

  it('没有关键词时不命中任何表，而不是命中全部', () => {
    expect(matchSheets(SHEETS, { tableKeywords: [], columns: {} })).toEqual([]);
    expect(matchSheets(SHEETS, undefined)).toEqual([]);
  });
});

describe('列匹配', () => {
  const module = { tableKeywords: [], columns: { position: ['地点'], name: ['姓名'] } };

  it('精确匹配优先于包含匹配', () => {
    // 「所在地点」在前，但关键词「地点」有精确同名列时应取后者
    expect(matchColumn(['所在地点', '地点'], module, 'position')).toBe('地点');
  });

  it('没有精确同名时退回包含匹配', () => {
    expect(matchColumn(['所在地点'], module, 'position')).toBe('所在地点');
  });

  it('字段没配关键词时返回 null', () => {
    expect(matchColumn(['姓名'], module, 'attrs')).toBeNull();
  });
});
