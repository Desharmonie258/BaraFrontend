import { describe, it, expect } from 'vitest';
import { checkSheet, isRenderable } from '../src/BaraFrontend/domain/sheet-health';

describe('checkSheet', () => {
  it('正常中文表头判为 ok，并剔除 row_id', () => {
    const h = checkSheet(['row_id', '姓名', '所在地点']);
    expect(h.kind).toBe('ok');
    expect(h.dataColumns).toEqual(['姓名', '所在地点']);
  });

  it('表头缺失判为 no_headers', () => {
    expect(checkSheet([]).kind).toBe('no_headers');
    expect(checkSheet(null).kind).toBe('no_headers');
    expect(checkSheet(undefined).kind).toBe('no_headers');
  });

  it('只有 row_id 判为 only_row_id —— 这正是渲染成空卡片的成因', () => {
    expect(checkSheet(['row_id']).kind).toBe('only_row_id');
  });

  it('空白列名不算数据列', () => {
    expect(checkSheet(['row_id', '  ', '']).kind).toBe('only_row_id');
  });

  it('整列英文标识符判为 sql_headers', () => {
    const h = checkSheet(['row_id', 'char_name', 'location']);
    expect(h.kind).toBe('sql_headers');
    expect(h.dataColumns).toEqual(['char_name', 'location']);
  });

  it('只要有一列中文就不判 sql_headers —— 宁可漏判不可误判', () => {
    expect(checkSheet(['row_id', 'char_name', '姓名']).kind).toBe('ok');
  });

  it('含空格或标点的列名不是 SQL 标识符', () => {
    expect(checkSheet(['row_id', 'char name']).kind).toBe('ok');
    expect(checkSheet(['row_id', '身高/体重']).kind).toBe('ok');
  });
});

describe('isRenderable', () => {
  it('ok 与 sql_headers 都能渲染 —— 后者只是列名难看', () => {
    expect(isRenderable(checkSheet(['row_id', '姓名']))).toBe(true);
    expect(isRenderable(checkSheet(['row_id', 'name']))).toBe(true);
  });

  it('无表头与只有 row_id 无法渲染出内容', () => {
    expect(isRenderable(checkSheet([]))).toBe(false);
    expect(isRenderable(checkSheet(['row_id']))).toBe(false);
  });
});
