import { describe, it, expect } from 'vitest';
import {
  diffSnapshots,
  identityKeys,
  preferredColumns,
  rowTitle,
  groupByTable,
  type Snapshot,
} from '../src/BaraFrontend/domain/review/diff';

const HEAD = ['row_id', '姓名', '身份', '所在地点'];

function snap(rows: string[][], name = 'NPC表', key = 'sheet_npc'): Snapshot {
  return { [key]: { name, content: [HEAD, ...rows] } };
}

describe('行身份键', () => {
  it('标识列优先于 row_id —— row_id 在 AI 重写整表时最不稳定', () => {
    const cols = preferredColumns(HEAD);
    expect(cols[0]).toBe(1); // 姓名
    expect(cols[cols.length - 1]).toBe(0); // row_id 垫底
  });

  it('同时产出列名键与列号键，改列名或改列序各能兜一次', () => {
    const keys = identityKeys(HEAD, ['1', '笹兵卫', '武士', '寅庵寺']);
    expect(keys).toContain('h:姓名:笹兵卫');
    expect(keys).toContain('c:1:笹兵卫');
  });

  it('全空行不产生整行键 —— 否则两行空行会互相配上', () => {
    expect(identityKeys(HEAD, ['', '', '', ''])).toEqual([]);
  });

  it('行标题取第一个有值的标识列，不取 row_id', () => {
    expect(rowTitle(HEAD, ['7', '笹兵卫', '武士', ''], 0)).toBe('笹兵卫');
    expect(rowTitle(HEAD, ['7', '', '', ''], 3)).toBe('7');
  });
});

describe('比对', () => {
  it('没有基线时不报任何变更', () => {
    expect(diffSnapshots(null, snap([['1', '甲', '', '']]))).toEqual([]);
  });

  it('无改动时为空', () => {
    const s = snap([['1', '甲', '武士', '寅庵寺']]);
    expect(diffSnapshots(s, s)).toEqual([]);
  });

  it('单字段改动报 cell_modified，带新旧值', () => {
    const before = snap([['1', '甲', '武士', '寅庵寺']]);
    const after = snap([['1', '甲', '武士', '御苑']]);
    const [c] = diffSnapshots(before, after);
    expect(c.type).toBe('cell_modified');
    expect(c.title).toBe('甲');
    expect(c.field).toMatchObject({ header: '所在地点', oldValue: '寅庵寺', newValue: '御苑' });
  });

  it('同一行多处改动合并为一条 —— 否则改 10 个字段会刷出 10 条', () => {
    const before = snap([['1', '甲', '武士', '寅庵寺']]);
    const after = snap([['1', '甲', '浪人', '御苑']]);
    const [c] = diffSnapshots(before, after);
    expect(c.type).toBe('row_modified');
    expect(c.fields).toHaveLength(2);
  });

  it('row_id 变化不算改动 —— AI 重排行时它必然变', () => {
    const before = snap([['1', '甲', '武士', '寅庵寺']]);
    const after = snap([['9', '甲', '武士', '寅庵寺']]);
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it('行顺序改变但内容不变时不报改动 —— 这是纯按行号比对最常见的误报', () => {
    const before = snap([
      ['1', '甲', '武士', '寅庵寺'],
      ['2', '乙', '町人', '御苑'],
    ]);
    const after = snap([
      ['1', '乙', '町人', '御苑'],
      ['2', '甲', '武士', '寅庵寺'],
    ]);
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it('中间插入一行只报一条新增，不把后面的行报成改动', () => {
    const before = snap([
      ['1', '甲', '武士', '寅庵寺'],
      ['2', '乙', '町人', '御苑'],
    ]);
    const after = snap([
      ['1', '甲', '武士', '寅庵寺'],
      ['2', '丙', '商人', '市场'],
      ['3', '乙', '町人', '御苑'],
    ]);
    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: 'row_added', title: '丙' });
  });

  it('删行报 row_deleted', () => {
    const before = snap([
      ['1', '甲', '武士', '寅庵寺'],
      ['2', '乙', '町人', '御苑'],
    ]);
    const after = snap([['1', '甲', '武士', '寅庵寺']]);
    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: 'row_deleted', title: '乙' });
  });

  it('同名的两行不会互相顶掉 —— 配过的旧行会被占用', () => {
    const before = snap([
      ['1', '甲', '武士', 'A'],
      ['2', '甲', '町人', 'B'],
    ]);
    const after = snap([
      ['1', '甲', '武士', 'A'],
      ['2', '甲', '町人', 'B'],
    ]);
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it('新增表与删除表', () => {
    const before: Snapshot = { sheet_a: { name: 'A表', content: [['row_id']] } };
    const after: Snapshot = { sheet_b: { name: 'B表', content: [['row_id']] } };
    const types = diffSnapshots(before, after).map((c) => c.type).sort();
    expect(types).toEqual(['table_added', 'table_deleted']);
  });

  it('表结构变化只报一条，不再逐行比 —— 列对不上时逐行比全是噪声', () => {
    const before = snap([['1', '甲', '武士', '寅庵寺']]);
    const after: Snapshot = {
      sheet_npc: {
        name: 'NPC表',
        content: [['row_id', '姓名', '身份'], ['1', '甲', '武士']],
      },
    };
    const changes = diffSnapshots(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('table_structure_changed');
  });

  it('非 sheet_ 前缀的键被忽略 —— 快照里还有 mate 之类的元数据', () => {
    const before = { mate: { type: 'x' } } as unknown as Snapshot;
    const after = { mate: { type: 'y' } } as unknown as Snapshot;
    expect(diffSnapshots(before, after)).toEqual([]);
  });
});

describe('分组', () => {
  it('按表聚合，保持表内顺序', () => {
    const before: Snapshot = {
      sheet_a: { name: 'A表', content: [HEAD, ['1', '甲', '', '']] },
      sheet_b: { name: 'B表', content: [HEAD, ['1', '乙', '', '']] },
    };
    const after: Snapshot = {
      sheet_a: { name: 'A表', content: [HEAD, ['1', '甲', 'x', '']] },
      sheet_b: { name: 'B表', content: [HEAD, ['1', '乙', 'y', '']] },
    };
    const groups = groupByTable(diffSnapshots(before, after));
    expect(groups.map((g) => g.tableName)).toEqual(['A表', 'B表']);
    expect(groups[0].items).toHaveLength(1);
  });
});
