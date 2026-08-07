import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '../src/BaraFrontend/data/snapshot-repo';

/** 从 DDL 解析枚举候选值 —— 晋升等操作的选项来源 */
function enumsOf(ddl: string) {
  const snap = buildSnapshot({
    sheet_t: { name: 'T', sourceData: { ddl }, content: [['row_id']] },
  } as any);
  return snap.get('sheet_t')!.enums;
}

describe('枚举列解析', () => {
  it('提取单列 IN 约束，键为中文展示名', () => {
    const e = enumsOf(
      'CREATE TABLE t (\n' +
        "  archive_status TEXT NOT NULL DEFAULT '普通角色' CHECK(archive_status IN ('普通角色', '待晋升', '退场角色', '删除角色')), -- 归档状态\n" +
        ');',
    );
    expect(e['归档状态']).toEqual(['普通角色', '待晋升', '退场角色', '删除角色']);
  });

  it('多个枚举列各自成条', () => {
    const e = enumsOf(
      'CREATE TABLE t (\n' +
        "  gender TEXT CHECK(gender IN ('男','女','特殊')), -- 性别\n" +
        "  presence_status TEXT CHECK(presence_status IN ('在场','离场')), -- 在场状态\n" +
        ');',
    );
    expect(Object.keys(e).sort()).toEqual(['在场状态', '性别']);
  });

  it('区间约束不是「几选一」，不应被当成枚举', () => {
    const e = enumsOf(
      'CREATE TABLE t (\n' +
        '  proficiency INTEGER CHECK(proficiency BETWEEN 0 AND 100), -- 熟练度\n' +
        '  age INTEGER CHECK(age >= 0), -- 年龄\n' +
        ');',
    );
    expect(e).toEqual({});
  });

  it('长度约束不应被当成枚举', () => {
    const e = enumsOf(
      'CREATE TABLE t (\n  note_text TEXT CHECK(LENGTH(note_text) <= 60), -- 备注\n);',
    );
    expect(e).toEqual({});
  });

  it('CHECK 引用的是别的列时不误取', () => {
    const e = enumsOf(
      'CREATE TABLE t (\n  a TEXT, -- 甲\n  b TEXT CHECK(a IN (\'x\',\'y\')), -- 乙\n);',
    );
    expect(e).toEqual({});
  });

  it('表级约束行不产生枚举', () => {
    const e = enumsOf(
      'CREATE TABLE t (\n' +
        "  suggestion_type TEXT CHECK(suggestion_type IN ('主角','角色','快进')), -- 建议类型\n" +
        '  CHECK(row_id > 3 OR suggestion_type = \'主角\'),\n' +
        '  UNIQUE(holder, name)\n);',
    );
    expect(Object.keys(e)).toEqual(['建议类型']);
  });

  it('值里的转义单引号能正确还原', () => {
    const e = enumsOf("CREATE TABLE t (\n  s TEXT CHECK(s IN ('it''s','b')), -- 标记\n);");
    expect(e['标记']).toEqual(["it's", 'b']);
  });

  it('无注释时以物理列名为键', () => {
    const e = enumsOf("CREATE TABLE t (\n  mode TEXT CHECK(mode IN ('a','b'))\n);");
    expect(e['mode']).toEqual(['a', 'b']);
  });

  it('无 DDL 时返回空对象', () => {
    expect(enumsOf('')).toEqual({});
  });
});
