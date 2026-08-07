/**
 * 表结构健康判定 —— 区分「这张表没有数据」与「这张表我读不懂」。
 *
 * 这两件事对用户是完全不同的信息：前者说「就是空的」，后者说「我没认出来」。
 * 混成同一片空白，用户既不知道发生了什么，也无从自助排查 —— 那正是
 * 「换了别的数据库模板后什么都看不到」这类报告的由来。
 *
 * 判定只看表头，不看数据行：结构问题在表头这一层就已经确定了，
 * 有没有行是另一个维度的事。
 */

/** 数据库本体给每张表的内部主键列，不是用户数据 */
const ROW_ID = 'row_id';

export type SheetIssueKind =
  /** 结构正常 */
  | 'ok'
  /** 表头整个缺失 —— content[0] 不是数组或为空 */
  | 'no_headers'
  /** 只有 row_id，没有任何数据列 */
  | 'only_row_id'
  /**
   * 表头退化成英文 SQL 列名。
   *
   * 数据库插件导出表头时，会把物理列名按 DDL 里的 `-- 中文名` 注释映射成
   * 展示名，映射不到就退回列名本身。某张表若走过 DDL fallback 重建、
   * 注释丢失，导出的就是一排英文 —— 表格还能显示，但所有按中文列名匹配
   * 的功能全线失效。这与「表名对不上」是两条独立的失配通道。
   */
  | 'sql_headers';

export interface SheetHealth {
  kind: SheetIssueKind;
  /** 除 row_id 外的列名，供界面直接展示给用户看 */
  dataColumns: string[];
}

/**
 * 表头是否整列都像 SQL 标识符。
 *
 * 要求**全部**数据列都是 ASCII 标识符才判定 —— 只要有一列是中文，
 * 就说明映射是生效的，个别英文列名只是模板作者本来就那么写的。
 * 宁可漏判也不能误判：误判会让一张正常的表被标上「结构异常」。
 */
function allSqlIdentifiers(columns: string[]): boolean {
  return columns.length > 0 && columns.every((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c));
}

export function checkSheet(headers: readonly string[] | null | undefined): SheetHealth {
  const list = Array.isArray(headers) ? headers.filter((h) => typeof h === 'string') : [];
  if (list.length === 0) return { kind: 'no_headers', dataColumns: [] };

  const dataColumns = list.filter((h) => h !== ROW_ID && h.trim() !== '');
  if (dataColumns.length === 0) return { kind: 'only_row_id', dataColumns: [] };

  if (allSqlIdentifiers(dataColumns)) return { kind: 'sql_headers', dataColumns };

  return { kind: 'ok', dataColumns };
}

/** 结构是否可正常渲染。`sql_headers` 算可渲染 —— 列名难看但内容看得见。 */
export function isRenderable(health: SheetHealth): boolean {
  return health.kind === 'ok' || health.kind === 'sql_headers';
}
