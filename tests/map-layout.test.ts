import { describe, it, expect } from 'vitest';
import {
  parseAdjacency,
  collectEdges,
  detectMapColumns,
  detectHierarchy,
  drillInto,
  resolveLanding,
  filterByLevel,
  layoutMap,
  type MapPointInput,
} from '../src/BaraFrontend/domain/map-layout';

/** 1.1 模板的两张地图表表头，与模板文件保持一致 */
const WORLD_MAP_HEADERS = [
  'row_id', '详细地点', '次要地区', '主要地区', '地点类型',
  '环境描述', '探索状态', '接壤关系', 'X坐标', 'Y坐标',
];
const LOCAL_MAP_HEADERS = [
  'row_id', '元素名称', '元素类型', '所在地点', '元素描述',
  '状态', '交互选项', 'X坐标', 'Y坐标',
];

const BOX = { width: 600, height: 400 };

/** 取点，找不到就让断言炸掉而不是静默 undefined */
function at(layout: ReturnType<typeof layoutMap>, name: string) {
  const p = layout.points.find((q) => q.name === name);
  if (!p) throw new Error(`布局里没有 ${name}`);
  return p;
}

describe('列探测', () => {
  it('认出世界地图点的四列', () => {
    expect(detectMapColumns(WORLD_MAP_HEADERS)).toEqual({
      name: '详细地点',
      x: 'X坐标',
      y: 'Y坐标',
      adjacency: '接壤关系',
    });
  });

  it('本地地图表没有接壤关系列 —— 只画点，不是错误', () => {
    const cols = detectMapColumns(LOCAL_MAP_HEADERS);
    expect(cols).toMatchObject({ name: '元素名称', x: 'X坐标', y: 'Y坐标' });
    expect(cols?.adjacency).toBeUndefined();
  });

  it('坐标两列缺一即返回 null —— 只有 X 画不出东西', () => {
    expect(detectMapColumns(['row_id', '详细地点', 'X坐标'])).toBeNull();
    expect(detectMapColumns(['row_id', '详细地点', 'Y坐标'])).toBeNull();
    // 1.0 旧模板：有接壤关系但没坐标，地图视图不该开放
    expect(detectMapColumns(['row_id', '详细地点', '接壤关系', '字符简图'])).toBeNull();
  });

  it('列名带前后缀时靠包含匹配兜底', () => {
    const cols = detectMapColumns(['row_id', '地点', 'X坐标(0-1)', 'Y坐标(0-1)']);
    expect(cols).toMatchObject({ x: 'X坐标(0-1)', y: 'Y坐标(0-1)' });
  });
});

describe('层级下钻', () => {
  const cols = detectHierarchy(WORLD_MAP_HEADERS)!;
  /** 按模板 note 的三种行填写规则造数据 */
  const rows = [
    // 主要地区概览：三列同名
    { cells: { 详细地点: '青木省', 次要地区: '青木省', 主要地区: '青木省', 地点类型: '概览' } },
    { cells: { 详细地点: '东京都', 次要地区: '东京都', 主要地区: '东京都', 地点类型: '概览' } },
    // 次要地区概览：主要地区填所属
    { cells: { 详细地点: '橡木镇', 次要地区: '橡木镇', 主要地区: '青木省', 地点类型: '概览' } },
    { cells: { 详细地点: '新宿区', 次要地区: '新宿区', 主要地区: '东京都', 地点类型: '概览' } },
    // 详细地点：类型为具体值
    { cells: { 详细地点: '野猪旅馆', 次要地区: '橡木镇', 主要地区: '青木省', 地点类型: '商业' } },
    { cells: { 详细地点: '橡木镇广场', 次要地区: '橡木镇', 主要地区: '青木省', 地点类型: '特殊' } },
    { cells: { 详细地点: '新宿车站', 次要地区: '新宿区', 主要地区: '东京都', 地点类型: '交通' } },
  ];
  const names = (level: Parameters<typeof filterByLevel>[2]) =>
    filterByLevel(rows, cols, level).map((r) => r.cells['详细地点']);

  it('探测层级列；本地地图表没有这几列', () => {
    expect(cols).toEqual({
      name: '详细地点',
      major: '主要地区',
      minor: '次要地区',
      type: '地点类型',
    });
    // 「元素类型」不能被错认成「地点类型」
    expect(detectHierarchy(LOCAL_MAP_HEADERS)).toBeNull();
  });

  it('世界层只画主要地区', () => {
    expect(names({ kind: 'world' })).toEqual(['青木省', '东京都']);
  });

  it('主要地区层只画其下的次要地区，且不含自己', () => {
    expect(names({ kind: 'major', major: '青木省' })).toEqual(['橡木镇']);
    expect(names({ kind: 'major', major: '东京都' })).toEqual(['新宿区']);
  });

  it('次要地区层只画其下的详细地点', () => {
    expect(names({ kind: 'minor', major: '青木省', minor: '橡木镇' })).toEqual([
      '野猪旅馆',
      '橡木镇广场',
    ]);
  });

  it('三层互不串味 —— 混画等于把三套坐标系叠在一起', () => {
    const all = [
      ...names({ kind: 'world' }),
      ...names({ kind: 'major', major: '青木省' }),
      ...names({ kind: 'minor', major: '青木省', minor: '橡木镇' }),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('逐层下钻，到详细地点为止', () => {
    const l1 = drillInto({ kind: 'world' }, '青木省');
    expect(l1).toEqual({ kind: 'major', major: '青木省' });
    const l2 = drillInto(l1!, '橡木镇');
    expect(l2).toEqual({ kind: 'minor', major: '青木省', minor: '橡木镇' });
    expect(drillInto(l2!, '野猪旅馆')).toBeNull();
  });

  it('空的地区名不会被当成主要地区概览', () => {
    const bad = [{ cells: { 详细地点: '', 次要地区: '', 主要地区: '', 地点类型: '概览' } }];
    expect(filterByLevel(bad, cols, { kind: 'world' })).toEqual([]);
  });
});

describe('接壤关系解析', () => {
  it('解析模板里的三种实际写法', () => {
    // 只有连接方式
    expect(parseAdjacency('西大陆:隔海相望')).toEqual([
      { target: '西大陆', dir: null, style: 'dashed', label: '隔海相望' },
    ]);
    // 方位 + 连接方式
    expect(parseAdjacency('北境:北邻,山脉阻隔')).toEqual([
      { target: '北境', dir: '北', style: 'thick', label: '北邻，山脉阻隔' },
    ]);
    // 只有方位
    expect(parseAdjacency('御苑:北邻')).toEqual([
      { target: '御苑', dir: '北', style: 'solid', label: '北邻' },
    ]);
  });

  it('分号分隔多条', () => {
    const out = parseAdjacency('御苑:北邻; 橡木镇广场:东南邻,街道相连');
    expect(out.map((e) => [e.target, e.dir])).toEqual([
      ['御苑', '北'],
      ['橡木镇广场', '东南'],
    ]);
  });

  it('双字方位优先于单字 —— 「东南邻」不能被当成「东」', () => {
    expect(parseAdjacency('A:东南邻')[0].dir).toBe('东南');
    expect(parseAdjacency('A:西北邻')[0].dir).toBe('西北');
  });

  it('方位字只在冒号后认：目标名含方位字不影响判定', () => {
    // 「西大陆」的「西」不是方位声明，这条关系没有方位
    expect(parseAdjacency('西大陆:隔海相望')[0].dir).toBeNull();
    // 「隔海相望」含「望」但无方位字，同样不算方位
    expect(parseAdjacency('东海岸:隔海相望')[0].dir).toBeNull();
  });

  it('缺冒号、空段、全角标点都能容忍', () => {
    expect(parseAdjacency('御苑')).toEqual([
      { target: '御苑', dir: null, style: 'solid', label: '' },
    ]);
    expect(parseAdjacency('；； A:北邻 ；')).toHaveLength(1);
    expect(parseAdjacency('Ａ：北邻，山脉阻隔')[0]).toMatchObject({
      dir: '北',
      style: 'thick',
    });
    expect(parseAdjacency(undefined)).toEqual([]);
    expect(parseAdjacency('')).toEqual([]);
  });

  it('线型：山脉压过河道，都没有则实线', () => {
    expect(parseAdjacency('A:山脉阻隔')[0].style).toBe('thick');
    expect(parseAdjacency('A:河道相邻')[0].style).toBe('dashed');
    expect(parseAdjacency('A:街道相连')[0].style).toBe('solid');
    // 两类同时出现时取更重的那个，避免「粗虚线」这种没定义的组合
    expect(parseAdjacency('A:河道相邻,山脉阻隔')[0].style).toBe('thick');
  });
});

describe('边的收集', () => {
  const pts = (adj: Record<string, string>): MapPointInput[] =>
    Object.entries(adj).map(([name, adjacency], i) => ({
      rowIndex: i + 1,
      name,
      adjacency,
    }));

  it('只保留两端都在当前点集里的边', () => {
    const edges = collectEdges(pts({ 御苑: '橡木镇广场:东南邻; 未录入地点:北邻', 橡木镇广场: '' }));
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ a: '御苑', b: '橡木镇广场' });
  });

  it('无向去重：两侧都填只画一条', () => {
    const edges = collectEdges(pts({ 御苑: '广场:南邻', 广场: '御苑:北邻' }));
    expect(edges).toHaveLength(1);
  });

  it('单侧填写即可成边 —— 漏填反向关系不致命', () => {
    // 模板要求双向同步，但这是高频漏填点，所以渲染不能依赖它
    expect(collectEdges(pts({ 御苑: '广场:南邻', 广场: '' }))).toHaveLength(1);
  });

  it('矛盾的双向方位以先出现的为准，不随行序抖动', () => {
    // 两边都说对方在自己北边，只能有一个成立
    const edges = collectEdges(pts({ 御苑: '广场:北邻', 广场: '御苑:北邻' }));
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ a: '御苑', dir: '北' });
  });

  it('忽略自指', () => {
    expect(collectEdges(pts({ 御苑: '御苑:北邻' }))).toHaveLength(0);
  });
});

describe('排版', () => {
  it('坐标填得准就照着摆：y=1 在上、y=0 在下', () => {
    const layout = layoutMap(
      [
        { rowIndex: 1, name: '北村', x: 0.5, y: 0.9 },
        { rowIndex: 2, name: '南村', x: 0.5, y: 0.1 },
      ],
      BOX,
    );
    // 数据 y 越大越北，SVG y 越小越靠上
    expect(at(layout, '北村').py).toBeLessThan(at(layout, '南村').py);
  });

  it('东西方位同理', () => {
    const layout = layoutMap(
      [
        { rowIndex: 1, name: '西镇', x: 0.1, y: 0.5 },
        { rowIndex: 2, name: '东镇', x: 0.9, y: 0.5 },
      ],
      BOX,
    );
    expect(at(layout, '西镇').px).toBeLessThan(at(layout, '东镇').px);
  });

  it('点始终落在 padding 之内', () => {
    const layout = layoutMap(
      [
        { rowIndex: 1, name: 'A', x: 0, y: 0 },
        { rowIndex: 2, name: 'B', x: 1, y: 1 },
        // 越界值应被夹住而不是画到画布外
        { rowIndex: 3, name: 'C', x: -5, y: 9 },
      ],
      { ...BOX, padding: 20 },
    );
    for (const p of layout.points) {
      expect(p.px).toBeGreaterThanOrEqual(20);
      expect(p.px).toBeLessThanOrEqual(BOX.width - 20);
      expect(p.py).toBeGreaterThanOrEqual(20);
      expect(p.py).toBeLessThanOrEqual(BOX.height - 20);
    }
  });

  it('全表坐标都挤在默认 0.5 时仍能铺开 —— 这是实战最常见的退化情形', () => {
    const points: MapPointInput[] = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({
      rowIndex: i + 1,
      name,
      x: 0.5,
      y: 0.5,
    }));
    const layout = layoutMap(points, BOX);
    // 任意两点间距都应超过一个可见阈值，而不是叠成一坨
    for (let i = 0; i < layout.points.length; i++) {
      for (let j = i + 1; j < layout.points.length; j++) {
        const a = layout.points[i];
        const b = layout.points[j];
        const d = Math.hypot(a.px - b.px, a.py - b.py);
        expect(d, `${a.name}-${b.name}`).toBeGreaterThan(20);
      }
    }
  });

  it('坐标与方位矛盾时以方位为准', () => {
    // 坐标说「御苑在南」，接壤关系说「御苑在广场北边」—— 方位应当赢
    const layout = layoutMap(
      [
        { rowIndex: 1, name: '广场', x: 0.5, y: 0.8, adjacency: '御苑:北邻' },
        { rowIndex: 2, name: '御苑', x: 0.5, y: 0.2 },
      ],
      BOX,
    );
    expect(at(layout, '御苑').py).toBeLessThan(at(layout, '广场').py);
  });

  it('链式方位约束：A 北于 B 北于 C 北于 D，四点自北向南排开', () => {
    // 最容易顶出画布的形状 —— 每一跳都要求最小间隔，累积起来接近画布高度。
    // 坐标全给默认值，逼着排版只能靠方位。
    const layout = layoutMap(
      [
        { rowIndex: 1, name: 'B', x: 0.5, y: 0.5, adjacency: 'A:北邻' },
        { rowIndex: 2, name: 'C', x: 0.5, y: 0.5, adjacency: 'B:北邻' },
        { rowIndex: 3, name: 'D', x: 0.5, y: 0.5, adjacency: 'C:北邻' },
        { rowIndex: 4, name: 'A', x: 0.5, y: 0.5 },
      ],
      BOX,
    );
    const ys = ['A', 'B', 'C', 'D'].map((n) => at(layout, n).py);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i], `第 ${i} 跳`).toBeGreaterThan(ys[i - 1]);
    }
  });

  it('边的端点与点位一致', () => {
    const layout = layoutMap(
      [
        { rowIndex: 1, name: '御苑', x: 0.3, y: 0.7, adjacency: '广场:南邻,街道相连' },
        { rowIndex: 2, name: '广场', x: 0.6, y: 0.3 },
      ],
      BOX,
    );
    expect(layout.edges).toHaveLength(1);
    const e = layout.edges[0];
    expect([e.x1, e.y1]).toEqual([at(layout, '御苑').px, at(layout, '御苑').py]);
    expect([e.x2, e.y2]).toEqual([at(layout, '广场').px, at(layout, '广场').py]);
    expect(e.style).toBe('solid');
  });

  it('相同输入得到相同布局 —— 力模拟不引入随机', () => {
    const points: MapPointInput[] = [
      { rowIndex: 1, name: 'A', x: 0.5, y: 0.5, adjacency: 'B:北邻' },
      { rowIndex: 2, name: 'B', x: 0.5, y: 0.5, adjacency: 'C:东接' },
      { rowIndex: 3, name: 'C', x: 0.5, y: 0.5 },
    ];
    expect(layoutMap(points, BOX)).toEqual(layoutMap(points, BOX));
  });

  it('容器尺寸为 0 时返回空布局而不是一堆 NaN', () => {
    const points: MapPointInput[] = [{ rowIndex: 1, name: 'A', x: 0.5, y: 0.5 }];
    expect(layoutMap(points, { width: 0, height: 0 })).toEqual({ points: [], edges: [] });
    expect(layoutMap([], BOX)).toEqual({ points: [], edges: [] });
  });

  it('缺坐标列时落到居中，不产生 NaN', () => {
    const layout = layoutMap([{ rowIndex: 1, name: 'A' }], BOX);
    expect(Number.isFinite(layout.points[0].px)).toBe(true);
    expect(Number.isFinite(layout.points[0].py)).toBe(true);
  });
});

/**
 * 落地层级（1.11）—— 打开地图停在玩家脚下那一层。
 *
 * 关键是**降级**：想去的那一层可能一个点都没有（剧情刚到新地区、
 * AI 还没录入详细地点），落到空图比落在世界层更让人以为地图坏了。
 */
describe('落地层级', () => {
  /** 两个主要地区：青木省有完整三层，东京都只到次要地区 */
  const rows = [
    { cells: { 详细地点: '青木省', 次要地区: '青木省', 主要地区: '青木省', 地点类型: '概览' } },
    { cells: { 详细地点: '东京都', 次要地区: '东京都', 主要地区: '东京都', 地点类型: '概览' } },
    { cells: { 详细地点: '橡木镇', 次要地区: '橡木镇', 主要地区: '青木省', 地点类型: '概览' } },
    { cells: { 详细地点: '新宿区', 次要地区: '新宿区', 主要地区: '东京都', 地点类型: '概览' } },
    { cells: { 详细地点: '野猪旅馆', 次要地区: '橡木镇', 主要地区: '青木省', 地点类型: '商业' } },
    { cells: { 详细地点: '橡木镇广场', 次要地区: '橡木镇', 主要地区: '青木省', 地点类型: '特殊' } },
  ];

  const cols = {
    name: '详细地点',
    major: '主要地区',
    minor: '次要地区',
    type: '地点类型',
  };

  it('脚下那一层有点，就落在详细地点层', () => {
    expect(resolveLanding(rows, cols, { major: '青木省', minor: '橡木镇' })).toEqual({
      kind: 'minor', major: '青木省', minor: '橡木镇',
    });
  });

  it('详细地点层空了就降到次要地区层', () => {
    // 「新宿区」下有详细地点，「东京都」里造一个没有详细地点的次要地区
    expect(resolveLanding(rows, cols, { major: '东京都', minor: '尚未录入的区' })).toEqual({
      kind: 'major', major: '东京都',
    });
  });

  it('两层都空就回世界层，而不是落在一张空图上', () => {
    expect(resolveLanding(rows, cols, { major: '无此省', minor: '无此镇' })).toEqual({
      kind: 'world',
    });
  });

  it('取不到当前地区（别的模板没有全局数据表）时回世界层', () => {
    expect(resolveLanding(rows, cols, {})).toEqual({ kind: 'world' });
    expect(resolveLanding(rows, cols, { minor: '橡木镇' })).toEqual({ kind: 'world' });
  });

  it('地区名两端的空白不影响匹配 —— AI 写的值常带空格', () => {
    expect(resolveLanding(rows, cols, { major: ' 青木省 ', minor: ' 橡木镇 ' })).toEqual({
      kind: 'minor', major: '青木省', minor: '橡木镇',
    });
  });
});
