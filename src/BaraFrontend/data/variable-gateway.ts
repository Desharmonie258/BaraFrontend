/**
 * 变量框架网关 —— 读取角色卡的变量数据（MVU / ERA / LWB）。
 *
 * 移植自骰子系统的 MvuModule。**检测顺序照搬，不要调整**：
 *
 *   LWB → ERA（当前聊天确有 ERA 数据）→ MVU → none
 *
 * 全部判据都必须是**当前聊天**的痕迹，不能是「扩展装没装」：
 * - 酒馆助手的 `eventEmit`/`eventOn`、LWB 的 `LWB_Guard` 都是全局的，
 *   装上就一直在，拿它们当判据会把所有没有变量的卡都判成对应框架。
 * - LWB 排最前：它需要特殊处理，且它在场时另两者的探测会误命中。
 *   但必须有 `LWB_*` 标记 —— 光看 `stat_data` 会把 ERA 卡抢过来。
 * - ERA 认 `ERAMetaData` 这个保留键；数据本身在 chat 变量的 `stat_data` 下，
 *   能直接读到就一并返回，读不到再交给页面提示走异步接口。
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

/** 当前聊天的 metadata，取不到时返回空对象 */
function chatMeta(): Record<string, unknown> {
  const meta = pick<any>('SillyTavern')?.chatMetadata;
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
}

/** 当前聊天的 chat 变量（= chatMetadata.variables），取不到时返回空对象 */
function chatVars(): Record<string, unknown> {
  const vars = chatMeta().variables;
  return vars && typeof vars === 'object' ? (vars as Record<string, unknown>) : {};
}

function lwbData(): Record<string, unknown> | null {
  // LWB_Guard 装了就一直在，`stat_data` 又和 ERA 撞键 —— 只有 LWB_* 标记算数
  const marked = [...Object.keys(chatMeta()), ...Object.keys(chatVars())].some(k =>
    /^lwb_/i.test(k),
  );
  if (!marked) return null;

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

/**
 * ERA 在 chat 变量里留 `ERAMetaData` 这个保留键。
 *
 * 不用 `eventEmit`/`eventOn` 判断 —— 那是酒馆助手的全局函数，
 * 一直都在，用它会把所有没变量的卡判成 ERA。
 */
function eraData(): { stat: Record<string, unknown> | null } | null {
  const vars = chatVars();
  if (vars.ERAMetaData === undefined) return null;
  const stat = vars.stat_data;
  return { stat: stat && typeof stat === 'object' ? (stat as Record<string, unknown>) : null };
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

  const era = eraData();
  if (era) return { framework: 'era', stat: era.stat, display: {} };

  const mvu = mvuData();
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
