/**
 * SQL 构造与转义 —— 纯函数，不接触 window / Vue。
 *
 * 全部写入 SQL 必须经过本模块，不允许在业务代码里拼字符串。
 * 标识符与字面量的处理规则不同，混用会直接产生注入面。
 */

/** 字符串字面量转义：单引号加倍。用于值。 */
export function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 标识符白名单校验：表名 / 列名只允许字母、数字、下划线。
 *
 * 不做转义而是**直接拒绝** —— 我们的标识符全部来自模板 DDL，
 * 是受控集合。出现非法字符说明模板被改坏或存在注入尝试，
 * 此时静默转义反而掩盖问题。
 */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertIdent(name: string, what = '标识符'): string {
  if (!IDENT.test(name)) {
    throw new Error(`非法${what}: ${name}`);
  }
  return name;
}

/** 把任意值转为 SQL 字面量 */
export function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return quote(String(v));
}

export interface SelectOptions {
  table: string;
  columns?: string[];
  where?: string;
  orderBy?: { column: string; dir?: 'ASC' | 'DESC' };
  limit?: number;
  offset?: number;
}

export function buildSelect(o: SelectOptions): string {
  assertIdent(o.table, '表名');
  const cols =
    o.columns && o.columns.length > 0
      ? o.columns.map((c) => assertIdent(c, '列名')).join(', ')
      : '*';

  let sql = `SELECT ${cols} FROM ${o.table}`;
  if (o.where) sql += ` WHERE ${o.where}`;
  if (o.orderBy) {
    assertIdent(o.orderBy.column, '列名');
    // 方向必须白名单，不能拼接外部字符串
    const dir = o.orderBy.dir === 'DESC' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${o.orderBy.column} ${dir}`;
  }
  if (typeof o.limit === 'number') sql += ` LIMIT ${Math.max(0, Math.trunc(o.limit))}`;
  if (typeof o.offset === 'number') sql += ` OFFSET ${Math.max(0, Math.trunc(o.offset))}`;
  return sql;
}

/**
 * 单元格更新。
 *
 * `keyColumns` 是 WHERE 的组成部分 —— 本项目多张表使用复合唯一约束
 * （如 物品表 的 (holder, item_name)），只按名称更新会误改其他角色的
 * 同名条目。因此本函数**要求显式传入全部键列**，不提供单键便捷形式。
 */
export function buildUpdate(
  table: string,
  set: Record<string, unknown>,
  keys: Record<string, unknown>,
): string {
  assertIdent(table, '表名');
  const keyNames = Object.keys(keys);
  if (keyNames.length === 0) {
    throw new Error('buildUpdate: 必须提供至少一个键列，否则会全表更新');
  }
  const assignments = Object.entries(set)
    .map(([c, v]) => `${assertIdent(c, '列名')} = ${literal(v)}`)
    .join(', ');
  if (!assignments) throw new Error('buildUpdate: 没有要更新的列');

  const where = keyNames
    .map((c) => `${assertIdent(c, '列名')} = ${literal(keys[c])}`)
    .join(' AND ');

  return `UPDATE ${table} SET ${assignments} WHERE ${where};`;
}

/** 多条语句合并为一次批量执行 */
export function batch(statements: string[]): string {
  return statements.filter(Boolean).join('\n');
}
