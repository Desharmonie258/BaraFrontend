/**
 * 剧情日期 —— 从带日期列的表里推断「剧情里的今天」。
 *
 * 独立成模块是为了可测：日历组件本身要挂 NCalendar 才能跑，而这段
 * 推断逻辑决定了打开日历时落在哪个月，值得单独测透。
 */

/** 模板对日期列有 GLOB 约束，格式恒为 YYYY-MM-DD */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 标记剧情当前日的列与值。小日记表没有这一列，会自动落到后备方案。 */
const TODAY_COLUMN = '与今天的关系';
const TODAY_VALUE = '今天';

export interface DateParts {
  y: number;
  m: number;
  d: number;
}

export function parseDate(raw: unknown): DateParts | null {
  const m = DATE_RE.exec(String(raw ?? '').trim());
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

/** 架空纪年的时间戳为负，JS 的 Date 支持这个范围 */
export function toTs(p: DateParts): number {
  return new Date(p.y, p.m - 1, p.d).getTime();
}

interface RowLike {
  cells: Record<string, string>;
}

/**
 * 推断剧情当前日，按可靠性从高到低：
 *   1. `与今天的关系` 为「今天」的那一行
 *   2. 最新的一条记录
 *   3. 最早的一条
 *
 * 全表无有效日期时返回 null —— 调用方据此不渲染跳转按钮，
 * 一个点了没反应的按钮比没有按钮更糟。
 */
export function findStoryToday(
  rows: readonly RowLike[],
  columns: readonly string[],
  dateColumn: string,
): number | null {
  if (columns.includes(TODAY_COLUMN)) {
    for (const row of rows) {
      if (String(row.cells[TODAY_COLUMN] ?? '').trim() !== TODAY_VALUE) continue;
      const p = parseDate(row.cells[dateColumn]);
      if (p) return toTs(p);
    }
  }

  let latest: number | null = null;
  let earliest: number | null = null;
  for (const row of rows) {
    const p = parseDate(row.cells[dateColumn]);
    if (!p) continue;
    const ts = toTs(p);
    if (latest === null || ts > latest) latest = ts;
    if (earliest === null || ts < earliest) earliest = ts;
  }
  return latest ?? earliest;
}
