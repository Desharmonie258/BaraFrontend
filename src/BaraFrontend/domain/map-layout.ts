/**
 * 地图排版 —— 把「坐标 + 接壤关系」两列算成可直接画的点与线。
 *
 * 独立成纯函数模块的理由与 story-date 相同：组件要挂 SVG 才能跑，
 * 而排版正确性（谁在谁北边、点有没有叠在一起）才是这个视图的全部价值，
 * 值得脱离 DOM 单独测透。
 *
 * ## 为什么坐标是软的、方位是硬的
 *
 * 两列都由 AI 填，但可靠性差着一个数量级：从环境描述推出「御苑在北边」
 * 很容易，为御苑拍一个与全表自洽的 `(0.5, 0.85)` 很难 —— 不同轮次插入的
 * 地点各自拍数，实战里会大量落在 DEFAULT 的 `0.5, 0.5` 上、糊成一团。
 *
 * 所以这里不把坐标当真值，而是当**力模拟的初始位置与弱吸引目标**：
 *
 * - `forceX`/`forceY`  弱吸引到 AI 给的坐标 —— 填得准就照着摆
 * - 方位约束（自定义力）  违反时强力修正 —— 填得不准也不会画错方位
 * - `forceCollide`      把重叠的点推开 —— 全表都是 0.5,0.5 也能铺开
 *
 * 结果是：坐标准则精确还原，坐标烂则退化成「方位正确的示意图」，
 * 而不是退化成一坨重叠的点。
 *
 * ## 为什么一次性跑完而不是逐帧动画
 *
 * 地图是静态的，没人需要看它收敛。`on('tick')` 是 d3 + d3-selection 的
 * 经典写法，在 Vue 里会变成每帧触发响应式更新，白付性能。这里 `stop()`
 * 之后手动 tick 到收敛，一次返回终态坐标。
 *
 * 同时这也让结果**可复现**：所有节点都带初始位置，力模拟不引入随机，
 * 同样的输入必然得到同样的布局，因此可以断言具体坐标关系。
 */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

/** 八向方位。数据空间：y 轴 1 为北，与 SVG 相反。 */
export type Compass = '北' | '南' | '东' | '西' | '东北' | '东南' | '西北' | '西南';

/**
 * 方位词 → 数据空间单位向量。
 *
 * 双字组合排在前面：`includes` 顺序匹配，「东北」必须先于「东」和「北」
 * 命中，否则「东北邻」会被当成「东」。
 */
const COMPASS_VECTORS: readonly (readonly [Compass, readonly [number, number]])[] = [
  ['东北', [1, 1]],
  ['东南', [1, -1]],
  ['西北', [-1, 1]],
  ['西南', [-1, -1]],
  ['北', [0, 1]],
  ['南', [0, -1]],
  ['东', [1, 0]],
  ['西', [-1, 0]],
];

/** 线型。连接方式那部分只影响观感，识别不出就用实线。 */
export type EdgeStyle = 'solid' | 'dashed' | 'thick';

/** 虚线：跨水体，不是走得通的路 */
const DASHED_HINTS = ['河道', '隔海', '海', '水'];
/** 粗线：地形阻隔，通行成本高 */
const THICK_HINTS = ['山脉', '阻隔', '关隘'];

export interface MapPointInput {
  /** 数据库行号，用于点回原行 */
  rowIndex: number;
  /** 点名。同层级内唯一，边靠它对应 */
  name: string;
  /** 0–1 归一化，0 为最西/最南。缺省落到居中 */
  x?: number;
  y?: number;
  /** `接壤关系` 列原文，没有这一列则不传 */
  adjacency?: string;
}

/** 一条已解析的邻接关系 */
export interface AdjacencyEntry {
  /** 接壤对象名 */
  target: string;
  /** a→target 的方位，识别不出为 null */
  dir: Compass | null;
  style: EdgeStyle;
  /** 连接方式原文，供 tooltip 显示 */
  label: string;
}

export interface LaidOutPoint {
  rowIndex: number;
  name: string;
  /** 容器内像素坐标 */
  px: number;
  py: number;
}

export interface LaidOutEdge {
  a: string;
  b: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: EdgeStyle;
  label: string;
}

export interface MapLayout {
  points: LaidOutPoint[];
  edges: LaidOutEdge[];
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** 留给标签的边距，点不会贴边 */
  padding?: number;
  /** 点的碰撞半径。含标签时应给大一些 */
  radius?: number;
}

/** 地图视图需要的列，由表头探测得出 */
export interface MapColumns {
  /** 点名列 */
  name: string;
  x: string;
  y: string;
  /** 接壤关系列。本地地图表没有这一列，此时只画点不画线 */
  adjacency?: string;
}

/**
 * 从表头探测地图视图所需的列。
 *
 * **坐标两列缺一即返回 null** —— 只有 X 没有 Y 画不出任何东西，
 * 此时地图视图不该开放，否则用户点开是一片空白。外部模板的地图表
 * 没有坐标列，正是靠这一条退回卡片视图。
 *
 * 放在 domain 而不是组件里，是因为这个口径有三个使用方：视图策略要用它
 * 判断是否开放地图、组件要用它取列名、跨模板回归测试要用它验证识别 ——
 * 各写一遍必然漂移。
 */
export function detectMapColumns(headers: readonly string[]): MapColumns | null {
  /* 先精确匹配，再退到包含匹配：模板改名后列名可能带前后缀 */
  const find = (exact: string) =>
    headers.find((c) => c === exact) ?? headers.find((c) => c.includes(exact)) ?? '';
  const x = find('X坐标');
  const y = find('Y坐标');
  if (!x || !y) return null;
  return {
    x,
    y,
    /* 地图表第一个非 row_id 列恒为唯一名（详细地点 / 元素名称） */
    name: headers.find((c) => c !== 'row_id') ?? '',
    adjacency: headers.find((c) => c.includes('接壤')) || undefined,
  };
}

/**
 * 层级列。世界地图点表把三个层级（主要地区 / 次要地区 / 详细地点）
 * 存在同一张表里，靠这几列区分。
 */
export interface HierarchyColumns {
  /** 点名列，与 MapColumns.name 同一列 */
  name: string;
  major: string;
  minor: string;
  type: string;
}

/** 地区概览行的 `地点类型` 取值 */
const OVERVIEW = '概览';

/**
 * 探测层级列；没有这几列的表（如本地地图表）返回 null，按单层处理。
 *
 * 不按表名判断而按列判断，与 detectMapColumns 同理 —— 模板改过名字
 * 也还能用。注意 `地点类型` 要精确优先：本地地图表有 `元素类型`，
 * 只用包含匹配会把它错认成层级列。
 */
export function detectHierarchy(headers: readonly string[]): HierarchyColumns | null {
  const exact = (n: string) => headers.find((c) => c === n);
  const major = exact('主要地区');
  const minor = exact('次要地区');
  const type = exact('地点类型');
  if (!major || !minor || !type) return null;
  return {
    name: headers.find((c) => c !== 'row_id') ?? '',
    major,
    minor,
    type,
  };
}

/**
 * 当前看的是哪一层。
 *
 * 一张图只画一层是必须的，不是为了好看：坐标是「在上一级容器内的相对位置」，
 * 三个层级的坐标语义互不相同，混在一张图上等于把三套坐标系叠在一起。
 */
export type MapLevel =
  | { kind: 'world' }
  | { kind: 'major'; major: string }
  | { kind: 'minor'; major: string; minor: string };

/** 行数据的最小形状，避免 domain 依赖 data 层类型 */
interface CellRow {
  cells: Record<string, string>;
}

/**
 * 取出属于当前层级的行。
 *
 * 三种行按模板的填写规则区分（见世界地图点表 note）：
 * - 主要地区概览：类型为「概览」，且次要地区、主要地区两列都填自身名
 * - 次要地区概览：类型为「概览」，主要地区填所属主要地区
 * - 详细地点：类型为具体类型
 */
export function filterByLevel<T extends CellRow>(
  rows: readonly T[],
  cols: HierarchyColumns,
  level: MapLevel,
): T[] {
  const get = (r: T, c: string) => String(r.cells[c] ?? '').trim();
  const isOverview = (r: T) => get(r, cols.type) === OVERVIEW;

  if (level.kind === 'world') {
    // 主要地区概览行：三列同名
    return rows.filter(
      (r) => isOverview(r) && get(r, cols.major) === get(r, cols.name) && get(r, cols.major) !== '',
    );
  }
  if (level.kind === 'major') {
    // 该主要地区下的次要地区概览行（排除主要地区自身那一行）
    return rows.filter(
      (r) =>
        isOverview(r) &&
        get(r, cols.major) === level.major &&
        get(r, cols.name) !== level.major,
    );
  }
  // 该次要地区下的详细地点
  return rows.filter((r) => !isOverview(r) && get(r, cols.minor) === level.minor);
}

/** 从当前层级点进某个点后到达的层级；已是最底层则返回 null */
export function drillInto(level: MapLevel, name: string): MapLevel | null {
  if (level.kind === 'world') return { kind: 'major', major: name };
  if (level.kind === 'major') return { kind: 'minor', major: level.major, minor: name };
  return null;
}

/**
 * 解析 `接壤关系` 列。
 *
 * 格式为 `目标:词,词; 目标:词`，其中「词」可能是方位词（北邻、东南邻）、
 * 连接方式（街道相连、山脉阻隔），也可能两者都有、都没有 ——
 * 模板里的实例包括 `西大陆:隔海相望`、`北境:北邻,山脉阻隔`、`御苑:北邻`。
 * 因此不能按位置取，只能逐词判断类型。
 *
 * 方位字只在冒号后判断：目标名本身可能含方位字（「西大陆」），
 * 若把它算进去会得出错误方位。
 */
export function parseAdjacency(raw: string | undefined): AdjacencyEntry[] {
  if (!raw) return [];
  const out: AdjacencyEntry[] = [];
  for (const chunk of raw.split(/[;；]/)) {
    const s = chunk.trim();
    if (!s) continue;
    const colon = s.search(/[:：]/);
    const target = (colon === -1 ? s : s.slice(0, colon)).trim();
    if (!target) continue;
    const words = colon === -1 ? [] : s.slice(colon + 1).split(/[,，]/).map((w) => w.trim());

    let dir: Compass | null = null;
    const styleWords: string[] = [];
    for (const w of words) {
      if (!w) continue;
      const hit = COMPASS_VECTORS.find(([name]) => w.includes(name));
      // 一条关系只取第一个方位词；其余词一律当连接方式
      if (hit && dir === null) dir = hit[0];
      else styleWords.push(w);
    }
    out.push({
      target,
      dir,
      style: styleOf(styleWords),
      label: words.filter(Boolean).join('，'),
    });
  }
  return out;
}

function styleOf(words: readonly string[]): EdgeStyle {
  const joined = words.join('');
  if (THICK_HINTS.some((h) => joined.includes(h))) return 'thick';
  if (DASHED_HINTS.some((h) => joined.includes(h))) return 'dashed';
  return 'solid';
}

/** 内部用的边，两端已换成节点引用前的名字形式 */
interface RawEdge {
  a: string;
  b: string;
  dir: Compass | null;
  style: EdgeStyle;
  label: string;
}

/**
 * 收集边。
 *
 * **两端都在当前点集里才算** —— 一张图只画一个层级，跨层级或指向尚未
 * 录入地点的关系必须丢掉，否则会画出悬空的线。
 *
 * **无向去重**：模板要求新增行时同步 UPDATE 接壤对象的关系列以体现双向，
 * 但这是个高频漏填点。按无向处理后，只要一侧填了就能画出这条边 ——
 * 漏填不再致命。两侧都填时保留先出现的那条（方位以它为准），
 * 后一条即便方位矛盾也不覆盖，避免出图随行序抖动。
 */
export function collectEdges(points: readonly MapPointInput[]): RawEdge[] {
  const known = new Set(points.map((p) => p.name));
  const seen = new Set<string>();
  const out: RawEdge[] = [];
  for (const p of points) {
    for (const entry of parseAdjacency(p.adjacency)) {
      if (entry.target === p.name || !known.has(entry.target)) continue;
      const key = [p.name, entry.target].sort().join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        a: p.name,
        b: entry.target,
        dir: entry.dir,
        style: entry.style,
        label: entry.label,
      });
    }
  }
  return out;
}

interface SimNode extends SimulationNodeDatum {
  rowIndex: number;
  name: string;
  /** 目标位置（像素），来自 AI 给的坐标 */
  tx: number;
  ty: number;
}

type SimLink = SimulationLinkDatum<SimNode> & { dir: Compass | null };

/** 力参数。集中在此便于调，不散落在构造代码里。 */
const TICKS = 300;
/** 坐标吸引：弱。填得准就照着摆，填不准不至于把方位拽错 */
const POSITION_STRENGTH = 0.25;
/** 方位修正：强。违反方位时要压过坐标吸引 */
const DIRECTION_STRENGTH = 1.2;
/**
 * 方位方向上要求的最小间隔，按碰撞半径的倍数取。
 *
 * 太小则「在北边」看不出来（见 forceDirection 的说明）；太大则链式约束
 * （A 北于 B、B 北于 C……）会把首尾顶出画布，最后被收边界夹回来反而丢方位。
 */
const DIRECTION_MARGIN_RATIO = 1.5;
/** 邻接的点不要被斥力推到天边 */
const LINK_STRENGTH = 0.08;
const CHARGE = -180;
const DEFAULT_PADDING = 28;
const DEFAULT_RADIUS = 34;

/**
 * 方位约束力。
 *
 * 只在方位**不够明确**时施力，满足了就完全不干预 —— 这一步的目的是纠错，
 * 不是把所有点排成正交网格。
 *
 * ## 为什么要求一个最小间隔，而不是「不违反就行」
 *
 * 起初的判据是「期望方向上的投影为负即违反」，推到 `proj = 0` 就撒手。
 * 但那样方位力与坐标吸引（`forceX`/`forceY`）会在 `proj ≈ 0` 处达成平衡：
 * 坐标说御苑在南、方位说御苑在广场北边，最后两点在 y 上只差 21px，
 * 谁在北边根本看不出来 —— 约束名义上满足了，视觉上没兑现。
 *
 * 所以判据是 `proj ≥ margin`：要求分开到肉眼能认的程度，方位力才罢手。
 *
 * 数据空间 y 轴 1 为北，SVG y 轴向下，故 y 分量取反。
 */
function forceDirection(links: readonly SimLink[], strength: number, margin: number) {
  function force(alpha: number): void {
    for (const link of links) {
      if (!link.dir) continue;
      const a = link.source as SimNode;
      const b = link.target as SimNode;
      const vec = COMPASS_VECTORS.find(([name]) => name === link.dir)?.[1];
      if (!vec) continue;
      const wantX = vec[0];
      const wantY = -vec[1];
      const proj = ((b.x ?? 0) - (a.x ?? 0)) * wantX + ((b.y ?? 0) - (a.y ?? 0)) * wantY;
      if (proj >= margin) continue;
      const k = (margin - proj) * strength * alpha;
      b.vx = (b.vx ?? 0) + wantX * k;
      b.vy = (b.vy ?? 0) + wantY * k;
      a.vx = (a.vx ?? 0) - wantX * k;
      a.vy = (a.vy ?? 0) - wantY * k;
    }
  }

  /*
   * d3 会对每个力调用 initialize 注入节点数组，缺了它会抛错。
   * 这里不需要节点数组 —— links 已经持有两端的节点引用。
   */
  force.initialize = (): void => {};
  return force;
}

/**
 * 算出一张图的最终点位与连线。
 *
 * 容器尺寸为 0（组件尚未挂载、或被折叠）时直接返回空布局 ——
 * 此时算出来的坐标全是 NaN，画出来是一片空白加控制台报错。
 */
export function layoutMap(
  points: readonly MapPointInput[],
  options: LayoutOptions,
): MapLayout {
  const padding = options.padding ?? DEFAULT_PADDING;
  const radius = options.radius ?? DEFAULT_RADIUS;
  const innerW = options.width - padding * 2;
  const innerH = options.height - padding * 2;
  if (points.length === 0 || innerW <= 0 || innerH <= 0) {
    return { points: [], edges: [] };
  }

  const nodes: SimNode[] = points.map((p) => {
    const nx = clamp01(p.x ?? 0.5);
    const ny = clamp01(p.y ?? 0.5);
    const tx = padding + nx * innerW;
    // 数据 y=1 为北 → SVG 顶部
    const ty = padding + (1 - ny) * innerH;
    return { rowIndex: p.rowIndex, name: p.name, tx, ty, x: tx, y: ty };
  });
  const byName = new Map(nodes.map((n) => [n.name, n]));

  const rawEdges = collectEdges(points);
  const links: SimLink[] = rawEdges.map((e) => ({
    source: byName.get(e.a) as SimNode,
    target: byName.get(e.b) as SimNode,
    dir: e.dir,
  }));

  const sim: Simulation<SimNode, SimLink> = forceSimulation(nodes)
    .force('x', forceX<SimNode>((d) => d.tx).strength(POSITION_STRENGTH))
    .force('y', forceY<SimNode>((d) => d.ty).strength(POSITION_STRENGTH))
    .force('collide', forceCollide<SimNode>(radius))
    .force('charge', forceManyBody<SimNode>().strength(CHARGE))
    .force(
      'direction',
      forceDirection(links, DIRECTION_STRENGTH, radius * DIRECTION_MARGIN_RATIO),
    )
    .stop();

  /*
   * 无边时不挂 link 力。distance 给到碰撞半径的三倍：默认的 30px 会与
   * collide 直接顶牛（一个拉到 30、一个推到 68），表现为点在原地抖到
   * tick 用完。
   */
  if (links.length > 0) {
    sim.force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.name)
        .distance(radius * 3)
        .strength(LINK_STRENGTH),
    );
  }

  for (let i = 0; i < TICKS; i++) sim.tick();

  /*
   * 收边界放在最后：碰撞与方位都算完了再夹，才不会让夹的结果又被推出去。
   * 代价是紧贴边界处可能残留轻微重叠 —— 比点跑出画布之外可接受得多。
   */
  const lo = padding;
  const hiX = options.width - padding;
  const hiY = options.height - padding;
  for (const n of nodes) {
    n.x = clamp(n.x ?? lo, lo, hiX);
    n.y = clamp(n.y ?? lo, lo, hiY);
  }

  return {
    points: nodes.map((n) => ({
      rowIndex: n.rowIndex,
      name: n.name,
      px: round(n.x ?? 0),
      py: round(n.y ?? 0),
    })),
    edges: rawEdges.map((e) => {
      const a = byName.get(e.a) as SimNode;
      const b = byName.get(e.b) as SimNode;
      return {
        a: e.a,
        b: e.b,
        x1: round(a.x ?? 0),
        y1: round(a.y ?? 0),
        x2: round(b.x ?? 0),
        y2: round(b.y ?? 0),
        style: e.style,
        label: e.label,
      };
    }),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0.5;
}

/** 两位小数足够定位，且让 SVG 属性字符串短一些 */
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
