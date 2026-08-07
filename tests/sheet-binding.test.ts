import { describe, it, expect } from 'vitest';
import {
  matchSheets, hasMatch,
  CHARACTERS, PROTAGONIST, SUGGESTIONS, RESOURCES,
  type SheetLike,
} from '../src/BaraFrontend/domain/sheet-binding';

function s(key: string, name: string, headers: string[] = []): SheetLike {
  return { key, name, headers };
}

const CHAR_COLS = ['row_id', '姓名', '基础属性', '特有属性'];

describe('matchSheets · 三条通道', () => {
  it('key 命中 —— 名字被改过也认得', () => {
    const r = matchSheets(CHARACTERS, [s('sheet_important_npc', '我自己起的名字')]);
    expect(r).toEqual([{ key: 'sheet_important_npc', name: '我自己起的名字', via: 'key' }]);
  });

  it('展示名命中 —— key 被重制过也认得（NTRS 的实际情形）', () => {
    const r = matchSheets(CHARACTERS, [s('sheet_NcBlYRH5', '重要角色表')]);
    expect(r[0].via).toBe('name');
  });

  it('指纹命中 —— key 与名字都对不上时的最后手段', () => {
    const r = matchSheets(CHARACTERS, [s('sheet_xxx', '黄毛表', CHAR_COLS)]);
    expect(r[0].via).toBe('fingerprint');
  });

  it('指纹要求全部列同时存在 —— 宁可判不出也不误判', () => {
    // 只有「姓名」，缺另外两列
    expect(matchSheets(CHARACTERS, [s('sheet_x', '路人表', ['row_id', '姓名'])])).toEqual([]);
  });

  it('三条都不中则不命中', () => {
    expect(matchSheets(CHARACTERS, [s('sheet_memo', '备忘录', ['row_id', '标题'])])).toEqual([]);
  });
});

describe('matchSheets · 多表并存', () => {
  it('恋爱对象表与重要角色表都要命中，且保持传入顺序', () => {
    const r = matchSheets(CHARACTERS, [
      s('sheet_romance_targets', '恋爱对象表'),
      s('sheet_important_non_romance', '重要角色表'),
    ]);
    expect(r.map((m) => m.name)).toEqual(['恋爱对象表', '重要角色表']);
  });

  it('同一张表不会因为同时满足多条通道而重复', () => {
    // key 与 name 都在候选里
    const r = matchSheets(CHARACTERS, [s('sheet_important_npc', '重要角色表', CHAR_COLS)]);
    expect(r).toHaveLength(1);
    // 命中顺序为 key → name → fingerprint，此处应报 key
    expect(r[0].via).toBe('key');
  });
});

describe('主角表不得被当成角色表', () => {
  // 主角表的列结构与角色表几乎一样，指纹必然误命中；
  // 十份真实模板里七份中招过，后果是主角在「重要角色」里重复出现。
  const PROT = s('sheet_protagonist', '主角信息', CHAR_COLS);
  const NPC = s('sheet_important_npc', '重要角色表', CHAR_COLS);

  it('主角表不出现在角色匹配结果里', () => {
    expect(matchSheets(CHARACTERS, [PROT, NPC]).map((m) => m.name)).toEqual(['重要角色表']);
  });

  it('只有主角表时角色判为不可用 —— 不能把主角当成重要角色列出来', () => {
    expect(matchSheets(CHARACTERS, [PROT])).toEqual([]);
  });

  it('排除不影响主角自身的匹配', () => {
    expect(matchSheets(PROTAGONIST, [PROT, NPC]).map((m) => m.name)).toEqual(['主角信息']);
  });

  it('「主角信息表」这种带表字的命名同样被排除', () => {
    const prot2 = s('sheet_xxx', '主角信息表', CHAR_COLS);
    expect(matchSheets(CHARACTERS, [prot2, NPC]).map((m) => m.name)).toEqual(['重要角色表']);
  });
});

describe('PROTAGONIST', () => {
  it('两种命名都认', () => {
    expect(hasMatch(PROTAGONIST, [s('sheet_x', '主角信息')])).toBe(true);
    expect(hasMatch(PROTAGONIST, [s('sheet_x', '主角信息表')])).toBe(true);
  });

  it('刻意没有指纹 —— 主角表下个版本要并入角色表，不在此概念上加固', () => {
    expect(PROTAGONIST.fingerprint).toBeUndefined();
    // 因此一张列结构像主角的表，若 key 与名字都不符，不会被误认
    expect(hasMatch(PROTAGONIST, [s('sheet_x', '某某表', CHAR_COLS)])).toBe(false);
  });
});

describe('SUGGESTIONS', () => {
  it('随机 key 的检定建议表靠名字或指纹命中', () => {
    expect(matchSheets(SUGGESTIONS, [s('sheet_bwxtt33d5', '检定建议表')])[0].via).toBe('key');
    expect(
      matchSheets(SUGGESTIONS, [s('sheet_zzz', '骰子表', ['row_id', '展示文本', '骰子命令'])])[0].via,
    ).toBe('fingerprint');
  });
});

describe('RESOURCES', () => {
  it('九份外部模板都没有资源表 —— 认不出时应判为不可用', () => {
    const external = [
      s('sheet_inventory', '物品表', ['row_id', '物品名称']),
      s('sheet_summary', '纪要表', ['row_id', '概览']),
    ];
    expect(hasMatch(RESOURCES, external)).toBe(false);
  });

  it('自家的角色资源表能命中', () => {
    expect(hasMatch(RESOURCES, [s('sheet_resources', '角色资源表')])).toBe(true);
  });
});
