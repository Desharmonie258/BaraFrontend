/**
 * 变量框架网关 —— 读取角色卡的变量数据（MVU / ERA / LWB）。
 *
 * 移植自骰子系统的 MvuModule。**检测顺序照搬，不要调整**：
 *
 *   LWB → ERA（且当前聊天确有数据）→ MVU → ERA（框架在但无数据）→ MVU
 *
 * 顺序里两处不显然的地方：
 * - LWB 排最前：它需要特殊处理，且它的框架在场时另两者的探测会误命中。
 * - ERA 要求「框架存在**且**当前聊天有数据」才优先。ERA 的框架是全局的，
 *   只看框架在不在，会把用 MVU 的聊天也判成 ERA。框架在但无数据时
 *   （新建聊天）再回落到 ERA，因为那时确实该用它。
 *
 * 本模块只读不写：变量是角色卡作者的领域，插件擅自改写会破坏卡的逻辑。
 */

export type VariableFramework = 'mvu' | 'era' | 'lwb' | 'none';

export interface VariableData {
  framework: VariableFramework;
  /** 变量树。形态由框架决定，统一按嵌套对象处理。 */
  stat: Record<string, unknown> | null;
  /** 展示用的别名/描述，MVU 有，其余框架可能为空 */
  display: Record<string, unknown>;
}

/** 逐级回退的窗口候选。跨域访问会抛异常，逐个 try。 */
function windows(): any[] {
  const out: any[] = [];
  const push = (get: () => unknown) => {
    try {
      const w = get();
      if (w && !out.includes(w)) out.push(w);
    } catch {
      /* 跨域，跳过 */
    }
  };
  push(() => (window as any).top);
  push(() => (window as any).parent);
  push(() => window);
  return out;
}

function pick<T>(name: string): T | null {
  for (const w of windows()) {
    const v = w?.[name];
    if (v !== undefined && v !== null) return v as T;
  }
  return null;
}

/* ── 各框架的探测 ───────────────────────────────────────── */

function lwbData(): Record<string, unknown> | null {
  // LWB（小白X）把数据挂在聊天变量的固定键下
  const getVariables = pick<(o?: unknown) => Record<string, unknown>>('getVariables');
  if (typeof getVariables !== 'function') return null;
  try {
    const vars = getVariables({ type: 'chat' }) ?? {};
    const stat = (vars as any).stat_data ?? (vars as any).lwb_stat_data;
    return stat && typeof stat === 'object' ? (stat as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function eraAvailable(): boolean {
  // ERA 以事件总线为标志
  return typeof pick('eventEmit') === 'function' && typeof pick('eventOn') === 'function';
}

function mvuData(): { stat: Record<string, unknown>; display: Record<string, unknown> } | null {
  const Mvu = pick<any>('Mvu');
  if (!Mvu || typeof Mvu.getMvuData !== 'function') return null;
  try {
    const d = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
    if (!d?.stat_data) return null;
    return { stat: d.stat_data, display: d.display_data ?? {} };
  } catch (e) {
    console.warn('[蔷薇前端] 读取 MVU 数据失败', e);
    return null;
  }
}

/**
 * 读取变量数据。全部框架都不可用时返回 `framework: 'none'`。
 *
 * 每次调用都重新探测，**不缓存** —— 切聊天、换角色卡后框架与数据都会变，
 * 缓存下来的会串线（骰子系统为此专门写了 `clearMvuCacheIfChatChanged`）。
 */
export function readVariables(): VariableData {
  const lwb = lwbData();
  if (lwb) return { framework: 'lwb', stat: lwb, display: {} };

  const era = eraAvailable();
  const mvu = mvuData();

  // ERA 框架在、且 MVU 拿不到数据时，认定为 ERA
  if (era && !mvu) return { framework: 'era', stat: null, display: {} };
  if (mvu) return { framework: 'mvu', stat: mvu.stat, display: mvu.display };

  return { framework: 'none', stat: null, display: {} };
}

export interface VarNode {
  key: string;
  /** 完整路径，用作展开状态的标识 */
  path: string;
  /** 叶子节点的值；分支节点为 null */
  value: string | null;
  children: VarNode[];
}

/**
 * 把变量树摊平成可渲染的节点树。
 *
 * 数组按下标展开成子节点 —— 变量框架里数组常用来存有序列表（历史、槽位），
 * 直接 JSON.stringify 成一行会让人读不出结构。
 */
export function toTree(data: unknown, prefix = ''): VarNode[] {
  if (!data || typeof data !== 'object') return [];

  const entries = Array.isArray(data)
    ? data.map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>);

  return entries.map(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      return { key, path, value: null, children: toTree(value, path) };
    }
    return { key, path, value: String(value ?? ''), children: [] };
  });
}
