import { describe, it, expect } from 'vitest';
import { parseDate, toTs, findStoryToday } from '../src/BaraFrontend/domain/story-date';

const CAL_COLS = ['row_id', '与今天的关系', '日期', '大事件'];
const DIARY_COLS = ['row_id', '日期', '角色', '内容'];

const row = (cells: Record<string, string>) => ({ cells });

describe('日期解析', () => {
  it('解析模板约束的 YYYY-MM-DD', () => {
    expect(parseDate('1568-11-13')).toEqual({ y: 1568, m: 11, d: 13 });
  });

  it('两侧空白容忍，格式不符返回 null', () => {
    expect(parseDate('  1568-01-05  ')).toEqual({ y: 1568, m: 1, d: 5 });
    for (const bad of ['', '1568/11/13', '1568-11', '十一月']) {
      expect(parseDate(bad), bad).toBeNull();
    }
  });

  it('架空纪年的时间戳为负，但可比较', () => {
    const ts = toTs({ y: 1568, m: 11, d: 13 });
    expect(ts).toBeLessThan(0);
    expect(ts).toBeLessThan(toTs({ y: 1568, m: 11, d: 14 }));
  });
});

describe('剧情当前日', () => {
  it('优先取「与今天的关系」为「今天」的那一行', () => {
    const rows = [
      row({ '与今天的关系': '3天前', 日期: '1568-11-13' }),
      row({ '与今天的关系': '今天', 日期: '1568-11-16' }),
      row({ '与今天的关系': '3天后', 日期: '1568-11-19' }),
    ];
    expect(findStoryToday(rows, CAL_COLS, '日期')).toBe(toTs({ y: 1568, m: 11, d: 16 }));
  });

  it('「今天」那行不必排在中间 —— 靠列值认，不靠位置', () => {
    const rows = [
      row({ '与今天的关系': '今天', 日期: '1568-11-16' }),
      row({ '与今天的关系': '明天', 日期: '1568-11-17' }),
    ];
    expect(findStoryToday(rows, CAL_COLS, '日期')).toBe(toTs({ y: 1568, m: 11, d: 16 }));
  });

  it('没有关系列时退到最新一条 —— 小日记表就是这种', () => {
    const rows = [
      row({ 日期: '1568-11-13' }),
      row({ 日期: '1568-11-20' }),
      row({ 日期: '1568-11-16' }),
    ];
    expect(findStoryToday(rows, DIARY_COLS, '日期')).toBe(toTs({ y: 1568, m: 11, d: 20 }));
  });

  it('有关系列但那行日期填坏时，仍退到最新一条', () => {
    const rows = [
      row({ '与今天的关系': '今天', 日期: '坏数据' }),
      row({ '与今天的关系': '昨天', 日期: '1568-11-15' }),
    ];
    expect(findStoryToday(rows, CAL_COLS, '日期')).toBe(toTs({ y: 1568, m: 11, d: 15 }));
  });

  it('全表无有效日期时返回 null —— 界面据此不渲染跳转按钮', () => {
    expect(findStoryToday([row({ 日期: '' })], DIARY_COLS, '日期')).toBeNull();
    expect(findStoryToday([], DIARY_COLS, '日期')).toBeNull();
  });

  it('结果与现实日期无关 —— 这正是不能用内置「今天」的原因', () => {
    const ts = findStoryToday([row({ 日期: '1568-11-16' })], DIARY_COLS, '日期')!;
    expect(new Date(ts).getFullYear()).toBe(1568);
    expect(new Date(ts).getFullYear()).not.toBe(new Date().getFullYear());
  });
});
