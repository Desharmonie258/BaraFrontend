/**
 * 交互规则的解析、分区与动作匹配。
 *
 * 最要紧的一条：**与骰子系统的预设互通**。格式相同是这套东西存在的
 * 全部意义 —— 从骰子系统导过来的规则必须原样能用，包括它的蛇形键名。
 */
import { describe, it, expect } from 'vitest';
import {
  parseActionPreset, serializeActionPreset, actionsForSheet, sectionOf,
  renderTemplate, BUILTIN_ACTIONS, ACTION_PRESET_FORMAT,
} from '../src/BaraFrontend/domain/interaction-rules';

describe('分区归属', () => {
  it('按表名关键词归入分区', () => {
    expect(sectionOf('角色表')).toBe('character');
    expect(sectionOf('世界地图点')).toBe('map');
    expect(sectionOf('物品表')).toBe('item');
    expect(sectionOf('装备表')).toBe('equipment');
    expect(sectionOf('备忘录表')).toBe('task');
    expect(sectionOf('技能表')).toBe('skill');
    expect(sectionOf('势力表')).toBe('faction');
  });

  it('认不出的表落到通用，而不是被丢掉 —— 它仍可能有动作', () => {
    expect(sectionOf('黄毛表')).toBe('generic');
    expect(sectionOf('')).toBe('generic');
  });

  it('命中多条时取 SECTIONS 里靠前的那条', () => {
    // 「角色装备表」同时像角色和装备，角色在前
    expect(sectionOf('角色装备表')).toBe('character');
  });
});

describe('动作匹配', () => {
  it('内置规则认得出常见表', () => {
    const actions = actionsForSheet(BUILTIN_ACTIONS, '角色表');
    expect(actions.map((a) => a.label)).toContain('交谈');
  });

  it('多条规则命中时全部合并 —— 只取第一条会让用户少掉一半动作', () => {
    // 「恋爱对象表」同时命中「角色/女主/恋爱对象」那条；构造一个双命中的表名
    const preset = {
      name: 'x', description: '',
      rules: [
        { tableKeywords: ['角色'], actions: [{ label: '交谈', template: 'a' }] },
        { tableKeywords: ['装备'], actions: [{ label: '装备', template: 'b' }] },
      ],
    };
    const actions = actionsForSheet(preset, '角色装备表');
    expect(actions.map((a) => a.label)).toEqual(['交谈', '装备']);
  });

  it('同名动作按先出现的胜，不重复', () => {
    const preset = {
      name: 'x', description: '',
      rules: [
        { tableKeywords: ['角色'], actions: [{ label: '使用', template: '先' }] },
        { tableKeywords: ['表'], actions: [{ label: '使用', template: '后' }] },
      ],
    };
    const actions = actionsForSheet(preset, '角色表');
    expect(actions).toHaveLength(1);
    expect(actions[0].template).toBe('先');
  });

  it('没有规则命中时返回空 —— 上层据此整张表跳过', () => {
    expect(actionsForSheet(BUILTIN_ACTIONS, '性爱生涯实录')).toEqual([]);
  });
});

describe('模板渲染', () => {
  it('替换全部 {Name}', () => {
    expect(renderTemplate('<user>与{Name}交谈，然后离开{Name}。', '御苑')).toBe(
      '<user>与御苑交谈，然后离开御苑。',
    );
  });

  it('不动 <user> —— 那要读 persona，是 data 层的事', () => {
    expect(renderTemplate('<user>前往{Name}。', '橡木镇')).toBe('<user>前往橡木镇。');
  });
});

describe('解析', () => {
  it('骰子系统的蛇形键名照样能用 —— 格式互通是这套东西存在的意义', () => {
    const { preset, problems } = parseActionPreset({
      format: ACTION_PRESET_FORMAT,
      name: '我的规则',
      rules: [
        { table_keywords: ['地点'], actions: [{ label: '前往', template: '<user>前往{Name}。' }] },
      ],
    });
    expect(problems).toEqual([]);
    expect(preset?.rules[0].tableKeywords).toEqual(['地点']);
  });

  it('驼峰键名也认', () => {
    const { preset } = parseActionPreset({
      rules: [{ tableKeywords: ['地点'], actions: [{ label: '前往', template: 'x' }] }],
    });
    expect(preset?.rules[0].tableKeywords).toEqual(['地点']);
  });

  it('format 不对只警告，不拒绝', () => {
    const { preset, problems } = parseActionPreset({
      format: 'other',
      rules: [{ table_keywords: ['x'], actions: [{ label: 'a', template: 'b' }] }],
    });
    expect(preset).not.toBeNull();
    expect(problems.join()).toContain('other');
  });

  it('缺 label 或 template 的动作被跳过，并说清是第几条规则', () => {
    const { preset, problems } = parseActionPreset({
      rules: [
        {
          table_keywords: ['地点'],
          actions: [{ label: '前往' }, { label: '探索', template: 'x' }],
        },
      ],
    });
    expect(preset?.rules[0].actions).toHaveLength(1);
    expect(problems.join()).toContain('第 1 条');
  });

  it('一条规则的动作全废时整条跳过', () => {
    const { preset, problems } = parseActionPreset({
      rules: [
        { table_keywords: ['地点'], actions: [] },
        { table_keywords: ['人物'], actions: [{ label: 'a', template: 'b' }] },
      ],
    });
    expect(preset?.rules).toHaveLength(1);
    expect(problems.join()).toContain('第 1 条');
  });

  it('结构不成形时返回 null 并说明原因', () => {
    expect(parseActionPreset(null).preset).toBeNull();
    expect(parseActionPreset({}).problems.join()).toContain('rules');
    expect(parseActionPreset({ rules: [] }).problems.join()).toContain('没有任何可用的规则');
  });
});

describe('序列化', () => {
  it('往返后内容不变，且用蛇形键与骰子系统互导', () => {
    const text = serializeActionPreset(BUILTIN_ACTIONS);
    const raw = JSON.parse(text);
    expect(raw.format).toBe(ACTION_PRESET_FORMAT);
    expect(raw.rules[0]).toHaveProperty('table_keywords');
    expect(parseActionPreset(raw).preset).toEqual(BUILTIN_ACTIONS);
  });
});
