import { describe, it, expect } from 'vitest';
import {
  quote, literal, assertIdent, buildSelect, buildUpdate, batch,
} from '../src/BaraFrontend/data/sql-builder';

describe('quote / literal', () => {
  it('单引号加倍', () => {
    expect(quote("O'Brien")).toBe("'O''Brien'");
  });
  it('注入尝试被转义为字面量', () => {
    expect(quote("'; DROP TABLE x; --")).toBe("'''; DROP TABLE x; --'");
  });
  it('literal 处理各类型', () => {
    expect(literal(null)).toBe('NULL');
    expect(literal(undefined)).toBe('NULL');
    expect(literal(42)).toBe('42');
    expect(literal(NaN)).toBe('NULL');
    expect(literal(true)).toBe('1');
    expect(literal('x')).toBe("'x'");
  });
});

describe('assertIdent —— 拒绝而非转义', () => {
  it('合法标识符通过', () => {
    expect(assertIdent('item_name')).toBe('item_name');
    expect(assertIdent('_x1')).toBe('_x1');
  });
  it.each([
    'item name', 'item-name', '1abc', 'a;b', 'a)b', '', '姓名', 'DROP TABLE',
  ])('拒绝非法标识符: %s', (bad) => {
    expect(() => assertIdent(bad)).toThrow();
  });
});

describe('buildSelect', () => {
  it('基本查询', () => {
    expect(buildSelect({ table: 'skills', columns: ['row_id', 'holder'] }))
      .toBe('SELECT row_id, holder FROM skills');
  });
  it('无列时用 *', () => {
    expect(buildSelect({ table: 'skills' })).toBe('SELECT * FROM skills');
  });
  it('limit / offset 取整且非负', () => {
    const sql = buildSelect({ table: 't', limit: 10.9, offset: -5 });
    expect(sql).toContain('LIMIT 10');
    expect(sql).toContain('OFFSET 0');
  });
  it('排序方向走白名单，不拼接外部字符串', () => {
    const sql = buildSelect({
      table: 't',
      orderBy: { column: 'row_id', dir: 'DESC; DROP TABLE t' as any },
    });
    expect(sql).toContain('ORDER BY row_id ASC');
    expect(sql).not.toContain('DROP');
  });
  it('非法表名抛错', () => {
    expect(() => buildSelect({ table: 'a; DROP TABLE b' })).toThrow();
  });
});

describe('buildUpdate —— 必须带键，防止全表更新', () => {
  it('正常更新', () => {
    expect(buildUpdate('skills', { proficiency: 55 }, { row_id: 3 }))
      .toBe('UPDATE skills SET proficiency = 55 WHERE row_id = 3;');
  });

  it('无键列时抛错', () => {
    expect(() => buildUpdate('skills', { proficiency: 1 }, {})).toThrow(/键列/);
  });

  it('无更新列时抛错', () => {
    expect(() => buildUpdate('skills', {}, { row_id: 1 })).toThrow();
  });

  it('复合键全部进入 WHERE —— 避免误改其他角色的同名条目', () => {
    const sql = buildUpdate(
      'inventory',
      { quantity: 2 },
      { holder: '艾莉丝', item_name: '铁剑' },
    );
    expect(sql).toContain("holder = '艾莉丝'");
    expect(sql).toContain("item_name = '铁剑'");
    expect(sql).toContain(' AND ');
  });

  it('值中的引号被转义', () => {
    const sql = buildUpdate('t', { note_text: "it's" }, { row_id: 1 });
    expect(sql).toContain("note_text = 'it''s'");
  });
});

describe('batch', () => {
  it('拼接并过滤空语句', () => {
    expect(batch(['A;', '', 'B;'])).toBe('A;\nB;');
  });
});
