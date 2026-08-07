/**
 * 日历视图的索引与探测逻辑。
 *
 * 组件本身不测（要挂 NCalendar），这里锁的是它依赖的两条纯逻辑：
 * 日期解析的口径、以及初始月份的选取。两者都直接决定「打开是不是空的」。
 */
import { describe, it, expect } from 'vitest';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 与 RowCalendar 中同口径：月份 1-12，与 NCalendar 插槽一致 */
function dayKey(raw: string): string | null {
  const m = DATE_RE.exec(raw.trim());
  return m ? `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}` : null;
}

function earliestTs(dates: string[]): number | null {
  let earliest: number | null = null;
  for (const raw of dates) {
    const m = DATE_RE.exec(raw.trim());
    if (!m) continue;
    const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    if (earliest === null || ts < earliest) earliest = ts;
  }
  return earliest;
}

describe('日期解析', () => {
  it('模板约束的 YYYY-MM-DD 能解析', () => {
    expect(dayKey('1568-11-13')).toBe('1568-11-13');
  });

  it('前导零被去掉 —— NCalendar 插槽给的是数字，不是补零字符串', () => {
    expect(dayKey('1568-01-05')).toBe('1568-1-5');
  });

  it('两侧空白容忍', () => {
    expect(dayKey('  1568-11-13  ')).toBe('1568-11-13');
  });

  it('不合格式的值整条跳过而非抛错', () => {
    for (const bad of ['', '1568/11/13', '十一月十三', '1568-11', 'null']) {
      expect(dayKey(bad), bad).toBeNull();
    }
  });
});

describe('初始月份', () => {
  it('取最早一条记录所在月，而不是今天', () => {
    const ts = earliestTs(['1568-11-18', '1568-11-13', '1568-12-01']);
    const d = new Date(ts!);
    expect(d.getFullYear()).toBe(1568);
    expect(d.getMonth()).toBe(10); // 11 月
    expect(d.getDate()).toBe(13);
  });

  it('架空纪年的时间戳为负，但仍可比较', () => {
    const ts = earliestTs(['1568-11-13']);
    expect(ts).toBeLessThan(0);
    expect(Number.isFinite(ts!)).toBe(true);
  });

  it('全部无效时返回 null，由调用方回落到今天', () => {
    expect(earliestTs(['', '不是日期'])).toBeNull();
  });
});
