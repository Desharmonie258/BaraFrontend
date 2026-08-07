import { describe, it, expect } from 'vitest';
import {
  isCalendarOnly,
  availableViews,
  resolveView,
} from '../src/BaraFrontend/domain/table-view-policy';

describe('表格视图策略', () => {
  describe('日历专属表', () => {
    it('小日历表、小日记表只开放日历', () => {
      expect(availableViews('小日历表', true)).toEqual(['calendar']);
      expect(availableViews('小日记表', true)).toEqual(['calendar']);
    });

    it('模板改过表名时靠候选名兜底', () => {
      expect(isCalendarOnly('日历表')).toBe(true);
      expect(isCalendarOnly('日记表')).toBe(true);
    });

    it('没探测到日期列时不能只给日历 —— 那会渲染出空视图', () => {
      expect(availableViews('小日历表', false)).toEqual(['card', 'list']);
    });
  });

  describe('普通表', () => {
    it('无日期列时只有卡片与列表', () => {
      expect(availableViews('技能表', false)).toEqual(['card', 'list']);
    });

    it('有日期列时三种都给 —— 日历只是多一种读法，不排斥其他', () => {
      expect(availableViews('纪要表', true)).toEqual(['card', 'list', 'calendar']);
    });

    it('名字里带「日历」但不在清单内的表不受影响', () => {
      expect(isCalendarOnly('日历元素表')).toBe(false);
    });
  });

  describe('记忆模式的收敛', () => {
    it('可用时沿用记忆的模式', () => {
      expect(resolveView('技能表', false, 'list')).toBe('list');
    });

    it('记忆的模式已不可用时落到第一个可用项', () => {
      // 换模板后表没有日期列了，存档里却记着 calendar
      expect(resolveView('技能表', false, 'calendar')).toBe('card');
    });

    it('日历专属表即使记着卡片也强制回日历', () => {
      expect(resolveView('小日记表', true, 'card')).toBe('calendar');
    });
  });
});
