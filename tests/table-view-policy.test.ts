import { describe, it, expect } from 'vitest';
import {
  isCalendarOnly,
  isMapFirst,
  availableViews,
  resolveView,
  type ViewCapabilities,
} from '../src/BaraFrontend/domain/table-view-policy';

/** 列探测结果的简写，默认什么都没探到 */
const caps = (o: Partial<ViewCapabilities> = {}): ViewCapabilities => ({
  hasDate: false,
  hasCoords: false,
  ...o,
});

describe('表格视图策略', () => {
  describe('日历专属表', () => {
    it('小日历表、小日记表只开放日历', () => {
      expect(availableViews('小日历表', caps({ hasDate: true }))).toEqual(['calendar']);
      expect(availableViews('小日记表', caps({ hasDate: true }))).toEqual(['calendar']);
    });

    it('模板改过表名时靠候选名兜底', () => {
      expect(isCalendarOnly('日历表')).toBe(true);
      expect(isCalendarOnly('日记表')).toBe(true);
    });

    it('没探测到日期列时不能只给日历 —— 那会渲染出空视图', () => {
      expect(availableViews('小日历表', caps())).toEqual(['card', 'list']);
    });
  });

  describe('普通表', () => {
    it('无日期列时只有卡片与列表', () => {
      expect(availableViews('技能表', caps())).toEqual(['card', 'list']);
    });

    it('有日期列时三种都给 —— 日历只是多一种读法，不排斥其他', () => {
      expect(availableViews('纪要表', caps({ hasDate: true }))).toEqual([
        'card',
        'list',
        'calendar',
      ]);
    });

    it('名字里带「日历」但不在清单内的表不受影响', () => {
      expect(isCalendarOnly('日历元素表')).toBe(false);
    });
  });

  describe('地图视图', () => {
    it('探到坐标列才开放地图', () => {
      expect(availableViews('世界地图点', caps({ hasCoords: true }))).toContain('map');
      // 外部模板的地图表没有坐标列 —— 不能给一个点开是空白的切换
      expect(availableViews('世界地图点', caps())).not.toContain('map');
    });

    it('地图表把地图排在首位，但其他视图仍然保留', () => {
      const views = availableViews('世界地图点', caps({ hasCoords: true }));
      expect(views[0]).toBe('map');
      // 描述、探索状态、交互选项在图上放不下，卡片视图必须还在
      expect(views).toContain('card');
      expect(views).toContain('list');
    });

    it('本地地图表沿用旧名「地图元素表」也认', () => {
      expect(isMapFirst('地图元素表')).toBe(true);
      expect(isMapFirst('本地地图表')).toBe(true);
      expect(isMapFirst('技能表')).toBe(false);
    });

    it('非地图表有坐标列时也能用地图，但不抢默认', () => {
      const views = availableViews('技能表', caps({ hasCoords: true }));
      expect(views[0]).toBe('card');
      expect(views).toContain('map');
    });

    it('坐标与日期同时存在时两种视图并存', () => {
      const views = availableViews('纪要表', caps({ hasDate: true, hasCoords: true }));
      expect(views).toEqual(['card', 'list', 'calendar', 'map']);
    });
  });

  describe('记忆模式的收敛', () => {
    it('可用时沿用记忆的模式', () => {
      expect(resolveView('技能表', caps(), 'list')).toBe('list');
    });

    it('记忆的模式已不可用时落到第一个可用项', () => {
      // 换模板后表没有日期列了，存档里却记着 calendar
      expect(resolveView('技能表', caps(), 'calendar')).toBe('card');
    });

    it('日历专属表即使记着卡片也强制回日历', () => {
      expect(resolveView('小日记表', caps({ hasDate: true }), 'card')).toBe('calendar');
    });

    it('外部模板的地图表记着 map 时退回卡片，不是空白地图', () => {
      expect(resolveView('世界地图点', caps(), 'map')).toBe('card');
    });

    it('自家模板的地图表无记忆时默认落到地图', () => {
      expect(resolveView('世界地图点', caps({ hasCoords: true }), 'card')).toBe('card');
      // 首位即默认：记忆里存着一个不可用值时才体现
      expect(resolveView('世界地图点', caps({ hasCoords: true }), 'calendar')).toBe('map');
    });
  });
});
