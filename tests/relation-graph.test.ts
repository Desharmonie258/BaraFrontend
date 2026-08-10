/**
 * 人物关系图的排版。
 *
 * 与 map-layout 同样的理由脱离 DOM 单测：排版正确性（点会不会叠在一起、
 * 孤立的几团会不会被斥力弹出画布）才是这个视图的全部价值。
 *
 * 力模拟不引入随机、节点初始位置按圆周均布，所以同样的输入必然得到同样的
 * 布局，可以断言具体坐标关系。
 */
import { describe, it, expect } from 'vitest';
import {
  collectRelations, layoutRelations, type RelationInput,
} from '../src/BaraFrontend/domain/relation-graph';

const BOX = { width: 600, height: 320 };

function rel(a: string, b: string, label = ''): RelationInput {
  return { a, b, label };
}

describe('收集边', () => {
  it('无向去重 —— 写一条与写两条方向相反的得到同一张图', () => {
    const out = collectRelations([rel('御苑', '新宿', '师徒'), rel('新宿', '御苑', '师徒')]);
    expect(out).toHaveLength(1);
  });

  it('重复时保留先出现的描述 —— 否则出图会随行序抖动', () => {
    const out = collectRelations([rel('御苑', '新宿', '师徒'), rel('新宿', '御苑', '宿敌')]);
    expect(out[0].label).toBe('师徒');
  });

  it('自己连自己、有一端为空的都丢掉 —— 那画不出线', () => {
    expect(collectRelations([rel('御苑', '御苑')])).toEqual([]);
    expect(collectRelations([rel('御苑', '  ')])).toEqual([]);
    expect(collectRelations([rel('', '新宿')])).toEqual([]);
  });

  it('两端去空白后再比', () => {
    const out = collectRelations([rel(' 御苑 ', '新宿 ')]);
    expect(out[0]).toMatchObject({ a: '御苑', b: '新宿' });
  });
});

describe('排版', () => {
  it('每个出现过的名字都成为一个点', () => {
    const g = layoutRelations([rel('御苑', '新宿'), rel('新宿', '橡木')], BOX);
    expect(new Set(g.nodes.map((n) => n.name))).toEqual(new Set(['御苑', '新宿', '橡木']));
  });

  it('度数记录连了几条边 —— 枢纽人物要更显眼', () => {
    const g = layoutRelations([rel('御苑', '新宿'), rel('御苑', '橡木')], BOX);
    expect(g.nodes.find((n) => n.name === '御苑')?.degree).toBe(2);
    expect(g.nodes.find((n) => n.name === '新宿')?.degree).toBe(1);
  });

  it('所有点都落在画布内', () => {
    const many = Array.from({ length: 12 }, (_, i) => rel('中心', `角色${i}`));
    const g = layoutRelations(many, BOX);
    for (const n of g.nodes) {
      expect(n.px).toBeGreaterThanOrEqual(0);
      expect(n.px).toBeLessThanOrEqual(BOX.width);
      expect(n.py).toBeGreaterThanOrEqual(0);
      expect(n.py).toBeLessThanOrEqual(BOX.height);
    }
  });

  it('互不相连的几团也不会被斥力推出画布', () => {
    const g = layoutRelations(
      [rel('A', 'B'), rel('C', 'D'), rel('E', 'F')],
      BOX,
    );
    for (const n of g.nodes) {
      expect(Number.isFinite(n.px)).toBe(true);
      expect(n.px).toBeLessThanOrEqual(BOX.width);
    }
  });

  it('点不会叠在一起', () => {
    const g = layoutRelations([rel('御苑', '新宿'), rel('御苑', '橡木')], BOX);
    for (let i = 0; i < g.nodes.length; i++) {
      for (let j = i + 1; j < g.nodes.length; j++) {
        const dx = g.nodes[i].px - g.nodes[j].px;
        const dy = g.nodes[i].py - g.nodes[j].py;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(20);
      }
    }
  });

  it('边的端点与两端的点位一致', () => {
    const g = layoutRelations([rel('御苑', '新宿')], BOX);
    const a = g.nodes.find((n) => n.name === '御苑')!;
    const b = g.nodes.find((n) => n.name === '新宿')!;
    expect(g.edges[0]).toMatchObject({ x1: a.px, y1: a.py, x2: b.px, y2: b.py });
  });

  it('同样的输入得到同样的布局 —— 图不该每次打开都换个样子', () => {
    const input = [rel('御苑', '新宿'), rel('新宿', '橡木')];
    expect(layoutRelations(input, BOX)).toEqual(layoutRelations(input, BOX));
  });

  it('容器尺寸为 0 时返回空图，而不是一堆 NaN 坐标', () => {
    expect(layoutRelations([rel('御苑', '新宿')], { width: 0, height: 0 })).toEqual({
      nodes: [], edges: [],
    });
  });

  it('没有任何关系时返回空图', () => {
    expect(layoutRelations([], BOX)).toEqual({ nodes: [], edges: [] });
  });
});
