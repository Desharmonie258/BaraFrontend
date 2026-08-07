import { describe, it, expect } from 'vitest';
import { buildSnapshot, colIndex, cell } from '../src/BaraFrontend/data/snapshot-repo';

/**
 * 只读快照的形态：{ sheet_xxx: { name, content: [[表头], [行...]], sourceData } }
 * content[0] 是表头，其余为数据行。
 */
const RAW = {
  mate: { type: 'chatSheets' },
  sheet_inventory: {
    name: '物品表',
    sourceData: { ddl: 'CREATE TABLE inventory ( -- 物品表\n  row_id INTEGER PRIMARY KEY\n);' },
    content: [
      ['row_id', '物品名称', '持有人', '数量'],
      ['1', '铁剑', '艾莉丝', '1'],
      ['2', '药水', '艾莉丝', '3'],
    ],
  },
  sheet_empty: {
    name: '空表',
    sourceData: { ddl: 'CREATE TABLE empty_t (\n  row_id INTEGER\n);' },
    content: [['row_id', '列一']],
  },
  not_a_sheet: { name: '不该被枚举' },
};

describe('buildSnapshot', () => {
  it('只枚举 sheet_ 前缀的键', () => {
    const snap = buildSnapshot(RAW as any);
    expect([...snap.keys()]).toEqual(['sheet_inventory', 'sheet_empty']);
  });

  it('content[0] 作表头，其余作数据行', () => {
    const s = buildSnapshot(RAW as any).get('sheet_inventory')!;
    expect(s.headers).toEqual(['row_id', '物品名称', '持有人', '数量']);
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0]).toEqual(['1', '铁剑', '艾莉丝', '1']);
  });

  it('只有表头时数据行为空 —— 行数应为 0 而非 1', () => {
    const s = buildSnapshot(RAW as any).get('sheet_empty')!;
    expect(s.headers).toHaveLength(2);
    expect(s.rows).toHaveLength(0);
  });

  it('从 DDL 提取物理表名', () => {
    expect(buildSnapshot(RAW as any).get('sheet_inventory')!.table).toBe('inventory');
  });

  it('单元格一律转为字符串，null/undefined 变空串', () => {
    const raw = {
      sheet_x: {
        name: 'X',
        sourceData: {},
        content: [['a', 'b', 'c'], [1, null, undefined]],
      },
    };
    const s = buildSnapshot(raw as any).get('sheet_x')!;
    expect(s.rows[0]).toEqual(['1', '', '']);
  });

  it('空输入返回空索引', () => {
    expect(buildSnapshot(null).size).toBe(0);
    expect(buildSnapshot({} as any).size).toBe(0);
  });

  it('content 缺失或非数组时不抛错', () => {
    const raw = { sheet_a: { name: 'A' }, sheet_b: { name: 'B', content: 'bad' } };
    const snap = buildSnapshot(raw as any);
    expect(snap.get('sheet_a')!.headers).toEqual([]);
    expect(snap.get('sheet_b')!.rows).toEqual([]);
  });
});

describe('按列名取值', () => {
  const sheet = buildSnapshot(RAW as any).get('sheet_inventory')!;

  it('colIndex 定位列', () => {
    expect(colIndex(sheet, '持有人')).toBe(2);
    expect(colIndex(sheet, '不存在')).toBe(-1);
  });

  it('cell 按列名取值', () => {
    expect(cell(sheet, sheet.rows[0], '物品名称')).toBe('铁剑');
    expect(cell(sheet, sheet.rows[1], '数量')).toBe('3');
  });

  it('列不存在时返回空串而非抛错 —— 模板裁剪过列时仍能读其余部分', () => {
    expect(cell(sheet, sheet.rows[0], '不存在的列')).toBe('');
  });

  it('行比表头短时返回空串', () => {
    expect(cell(sheet, ['1'], '数量')).toBe('');
  });
});
