/**
 * 骰式求值 —— `3d6*5`、`4d6dl1`、`10+5d20`、`敏捷/2` 这类表达式。
 *
 * 能力范围对齐骰子系统的 `rollDiceExpression`（保留/舍弃、成功计数），
 * 但这里只做**属性生成与检定所需**的部分，不实现重掷与爆炸 ——
 * 那两项目前三族预设都用不到，写了也无从验证。
 *
 * 求值分两步：先把骰子项替换成掷出的数，再算剩下的算术。
 * 算术部分是手写的递归下降解析器，**不使用 eval**：公式来自用户可编辑的
 * 预设，走 eval 等于把任意代码执行权交出去。
 */

export interface DiceTerm {
  /** 原始写法，如 `4d6dl1` */
  source: string;
  /** 每颗骰子的点数，含被舍弃的 */
  rolls: number[];
  /** 实际计入的点数 */
  kept: number[];
  /**
   * 成功计数。仅当骰式带成功线（如 `5d10>=8`）时有值。
   * 有值时 `total` 即为成功数，而非点数之和 —— 骰池族的「结果」就是成功数。
   */
  successes?: number;
  /** 自然 1 的个数。骰池族的大失败判定要用。 */
  ones: number;
  total: number;
}

export interface RollDetail {
  formula: string;
  /** 代入骰子结果后的算术表达式，用于展示推导过程 */
  expanded: string;
  terms: DiceTerm[];
  total: number;
  /** 全部骰子里自然 1 的个数 */
  ones: number;
}

/** 可注入以获得确定性结果，测试用 */
export type RandomFn = () => number;

const defaultRandom: RandomFn = Math.random;

function rollOne(sides: number, rnd: RandomFn): number {
  return Math.floor(rnd() * sides) + 1;
}

/**
 * 单个骰子项：`XdY` 后可跟 `kh<n>`/`kl<n>`/`dh<n>`/`dl<n>`。
 *
 * - `kh2` 保留最高 2 颗（D20 优势）
 * - `dl1` 舍弃最低 1 颗（DnD 属性生成 `4d6dl1`）
 */
const TERM_RE = /(\d*)d(\d+)((?:kh|kl|dh|dl)\d+)?((?:>=|<=|>|<|==|!=)\d+)?/gi;

/** 成功线比较。`5d10>=8` 里的 `>=8` 部分。 */
function countSuccesses(dice: number[], spec: string): number {
  const m = /^(>=|<=|==|!=|>|<)(\d+)$/.exec(spec);
  if (!m) return 0;
  const [, op, nStr] = m;
  const n = Number.parseInt(nStr, 10);
  const test = (v: number): boolean => {
    switch (op) {
      case '>=': return v >= n;
      case '<=': return v <= n;
      case '==': return v === n;
      case '!=': return v !== n;
      case '>': return v > n;
      default: return v < n;
    }
  };
  return dice.filter(test).length;
}

function rollTerm(
  count: number,
  sides: number,
  mod: string | undefined,
  success: string | undefined,
  rnd: RandomFn,
): DiceTerm {
  const rolls = Array.from({ length: count }, () => rollOne(sides, rnd));
  let kept = [...rolls];

  if (mod) {
    const m = /^(kh|kl|dh|dl)(\d+)$/i.exec(mod);
    if (m) {
      const op = m[1].toLowerCase();
      const n = Math.max(0, Math.min(count, Number.parseInt(m[2], 10)));
      const asc = [...rolls].sort((a, b) => a - b);
      if (op === 'kh') kept = asc.slice(count - n);
      else if (op === 'kl') kept = asc.slice(0, n);
      else if (op === 'dh') kept = asc.slice(0, count - n);
      else kept = asc.slice(n); // dl
    }
  }

  const ones = kept.filter((v) => v === 1).length;
  const successes = success ? countSuccesses(kept, success) : undefined;

  return {
    source: `${count}d${sides}${mod ?? ''}${success ?? ''}`,
    rolls,
    kept,
    successes,
    ones,
    // 带成功线时「结果」是成功数，不是点数和
    total: successes ?? kept.reduce((a, b) => a + b, 0),
  };
}

/* ── 算术求值：分词 + 递归下降 ────────────────────────────── */

type Token = { t: 'num'; v: number } | { t: 'op'; v: string };

function tokenize(expr: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const n = Number.parseFloat(expr.slice(i, j));
      if (!Number.isFinite(n)) throw new Error(`无法解析的数字: ${expr.slice(i, j)}`);
      out.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    if ('+-*/()'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`非法字符: ${c}`);
  }
  return out;
}

function parse(tokens: Token[]): number {
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const eat = (v: string): boolean => {
    const tk = peek();
    if (tk?.t === 'op' && tk.v === v) {
      pos++;
      return true;
    }
    return false;
  };

  function primary(): number {
    if (eat('(')) {
      const v = expression();
      if (!eat(')')) throw new Error('括号不匹配');
      return v;
    }
    // 一元正负
    if (eat('-')) return -primary();
    if (eat('+')) return primary();

    const tk = peek();
    if (tk?.t !== 'num') throw new Error('缺少操作数');
    pos++;
    return tk.v;
  }

  function term(): number {
    let v = primary();
    for (;;) {
      if (eat('*')) v *= primary();
      else if (eat('/')) {
        const d = primary();
        // 除零返回 0 而非 Infinity：属性值里出现 Infinity 会污染后续所有计算
        v = d === 0 ? 0 : v / d;
      } else return v;
    }
  }

  function expression(): number {
    let v = term();
    for (;;) {
      if (eat('+')) v += term();
      else if (eat('-')) v -= term();
      else return v;
    }
  }

  const result = expression();
  if (pos !== tokens.length) throw new Error('表达式尾部有多余内容');
  return result;
}

/**
 * 求值一条骰式。
 *
 * @param formula  如 `3d6*5`、`4d6dl1`、`敏捷/2`
 * @param context  可引用的已知量（其他属性值）
 * @param rnd      随机源，测试时可注入
 */
export function evalFormula(
  formula: string,
  context: Record<string, number> = {},
  rnd: RandomFn = defaultRandom,
): RollDetail {
  const raw = String(formula ?? '').trim();
  if (!raw) return { formula: raw, expanded: '', terms: [], total: 0, ones: 0 };

  // 1. 变量代入。按名字长度降序，避免「敏捷」先被「敏」之类的短名截断
  let work = raw;
  for (const name of Object.keys(context).sort((a, b) => b.length - a.length)) {
    work = work.split(name).join(String(context[name]));
  }

  // 2. 骰子项 → 数值
  const terms: DiceTerm[] = [];
  const expanded = work.replace(
    TERM_RE,
    (src, cnt: string, sides: string, mod?: string, success?: string) => {
      const count = cnt ? Number.parseInt(cnt, 10) : 1;
      const s = Number.parseInt(sides, 10);
      if (!Number.isFinite(count) || !Number.isFinite(s) || count <= 0 || s <= 0) return '0';
      // 上限防呆：公式来自用户预设，1000d1000 会卡死页面
      const term = rollTerm(Math.min(count, 100), s, mod, success, rnd);
      terms.push({ ...term, source: src });
      return String(term.total);
    },
  );

  // 3. 算术
  let total: number;
  try {
    total = parse(tokenize(expanded));
  } catch (e) {
    console.warn('[蔷薇前端] 骰式求值失败:', raw, e);
    total = 0;
  }

  return {
    formula: raw,
    expanded,
    terms,
    total,
    ones: terms.reduce((a, t) => a + t.ones, 0),
  };
}

/** 求值并取整、夹到区间内。属性值一律为整数。 */
export function rollAttribute(
  formula: string,
  range: readonly [number, number],
  context: Record<string, number> = {},
  rnd: RandomFn = defaultRandom,
): number {
  const { total } = evalFormula(formula, context, rnd);
  const [lo, hi] = range;
  return Math.max(lo, Math.min(hi, Math.round(total)));
}
