/**
 * 条件表达式求值 —— 判定分级用的 `$roll <= $attr / 2` 这类式子。
 *
 * 与 roller 的算术求值分开：那边只算数，这边还要比较与逻辑运算，
 * 且返回布尔语义。共用一个解析器会让两边的错误处理互相牵制。
 *
 * **不使用 eval / Function**。条件来自可编辑的规则预设，走 eval 等于
 * 把任意代码执行权交给预设文件。这里是手写的分词器 + 递归下降解析器，
 * 变量代入后还有字符白名单兜底。
 *
 * 优先级（低到高）：`||` < `&&` < 比较 < 加减 < 乘除 < 一元 < 括号
 */

export type ExprContext = Record<string, number>;

/** 变量代入后允许出现的字符。代入若漏掉某个变量，这里会拦下来。 */
const SAFE_CHARS = /^[0-9+\-*/()><=!&|. ]*$/;

type Token =
  | { t: 'num'; v: number }
  | { t: 'op'; v: string };

const OPS3 = [] as const;
const OPS2 = ['>=', '<=', '==', '!=', '&&', '||'] as const;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number.parseFloat(src.slice(i, j));
      if (!Number.isFinite(n)) throw new Error(`无法解析的数字: ${src.slice(i, j)}`);
      out.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if ((OPS2 as readonly string[]).includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/()><!'.includes(c)) {
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
  const peek = () => tokens[pos];
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
      const v = or();
      if (!eat(')')) throw new Error('括号不匹配');
      return v;
    }
    if (eat('-')) return -primary();
    if (eat('+')) return primary();
    if (eat('!')) return primary() === 0 ? 1 : 0;

    const tk = peek();
    if (tk?.t !== 'num') throw new Error('缺少操作数');
    pos++;
    return tk.v;
  }

  function mul(): number {
    let v = primary();
    for (;;) {
      if (eat('*')) v *= primary();
      else if (eat('/')) {
        const d = primary();
        // 除零取 0：判定里出现 Infinity 会让后续比较全部失真
        v = d === 0 ? 0 : v / d;
      } else return v;
    }
  }

  function add(): number {
    let v = mul();
    for (;;) {
      if (eat('+')) v += mul();
      else if (eat('-')) v -= mul();
      else return v;
    }
  }

  function cmp(): number {
    let v = add();
    for (;;) {
      if (eat('>=')) v = v >= add() ? 1 : 0;
      else if (eat('<=')) v = v <= add() ? 1 : 0;
      else if (eat('==')) v = v === add() ? 1 : 0;
      else if (eat('!=')) v = v !== add() ? 1 : 0;
      else if (eat('>')) v = v > add() ? 1 : 0;
      else if (eat('<')) v = v < add() ? 1 : 0;
      else return v;
    }
  }

  function and(): number {
    let v = cmp();
    while (eat('&&')) {
      const r = cmp();
      v = v !== 0 && r !== 0 ? 1 : 0;
    }
    return v;
  }

  function or(): number {
    let v = and();
    while (eat('||')) {
      const r = and();
      v = v !== 0 || r !== 0 ? 1 : 0;
    }
    return v;
  }

  const result = or();
  if (pos !== tokens.length) throw new Error('表达式尾部有多余内容');
  return result;
}

/** 变量代入。按名字长度降序，避免 `$roll` 被 `$ro` 之类的短名截断。 */
export function substitute(expr: string, ctx: ExprContext): string {
  let out = String(expr ?? '');
  for (const name of Object.keys(ctx).sort((a, b) => b.length - a.length)) {
    const v = ctx[name];
    // 负数加括号，否则 `$attr - -3` 会变成 `5 - -3` 之外的歧义形态
    const text = v < 0 ? `(${v})` : String(v);
    out = out.split(name).join(text);
  }
  return out;
}

export interface EvalResult {
  ok: boolean;
  value: number;
  error?: string;
}

/** 求值为数。失败时 ok=false，调用方决定当作不成立还是报错。 */
export function evaluate(expr: string, ctx: ExprContext = {}): EvalResult {
  const raw = String(expr ?? '').trim();
  if (!raw) return { ok: true, value: 0 };

  const sub = substitute(raw, ctx);
  if (!SAFE_CHARS.test(sub)) {
    // 多半是有变量没代入。报出来，不要静默当成 false ——
    // 判定悄悄走错分支比直接报错更难查。
    return { ok: false, value: 0, error: `含未代入的变量或非法字符: ${sub}` };
  }

  try {
    return { ok: true, value: parse(tokenize(sub)) };
  } catch (e) {
    return { ok: false, value: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 求值为真假。求值失败一律视为不成立。 */
export function isTruthy(expr: string, ctx: ExprContext = {}): boolean {
  const r = evaluate(expr, ctx);
  return r.ok && r.value !== 0;
}
