/**
 * 玩家角色名的解析。
 *
 * 数据库插件注入提示词时会自己展开 `{{user}}`（见 shujuku 的
 * host-state-gateway：`SillyTavern_API_ACU.name1 → '用户'`），所以模板里
 * 写 `{{user}}` 是可行的。但展开并非在所有路径上都发生 —— 检定建议表的
 * 展示文本就会带着字面量存进库里，前端直接渲染就是裸的 `{{user}}`。
 *
 * 因此这里做的是**渲染期兜底**：库里存什么不动，只在显示时替换。
 * 这与骰子系统 `replaceUserPlaceholders`「仅用于显示」的定位一致。
 *
 * 取名走三级回退（对齐骰子系统 `getDisplayPlayerName`）：
 *   1. persona 名 —— 玩家在酒馆里设定的身份，最准
 *   2. 主角信息表的姓名列 —— persona 未设置时的次选
 *   3. '主角' —— 兜底，至少不显示占位符
 */
import { findRuntimeFunction, runtimeWindows } from './tavern-runtime';
import { findSheetByName, cell } from './snapshot-repo';

/**
 * 会被当作「未解析的玩家占位符」的写法。
 *
 * 涵盖大小写与空格变体：模板作者手写时 `{{ User }}`、`{{USER}}` 都出现过，
 * 只匹配精确的 `{{user}}` 会漏掉。`<user>` 是酒馆的另一种宏写法。
 */
const PLACEHOLDER_SOURCE = '\\{\\{\\s*user\\s*\\}\\}|<\\s*user\\s*>|\\{\\{\\s*用户\\s*\\}\\}';
const PLACEHOLDER_EXACT = new RegExp(`^(${PLACEHOLDER_SOURCE})$`, 'i');

/** 判断一个值是否只是没展开的占位符 */
export function isUserPlaceholder(value: unknown): boolean {
  return PLACEHOLDER_EXACT.test(String(value ?? '').trim());
}

function clean(v: unknown): string {
  const s = String(v ?? '').trim();
  // persona 名本身也可能被设成占位符，那样等于没取到
  return s && !isUserPlaceholder(s) ? s : '';
}

/**
 * 取 persona 名称。四条路依次尝试 —— 单一入口在某些酒馆版本、
 * 某些加载方式下会取不到，而取不到的表现就是界面上一个裸占位符。
 *
 * 1. 助手封装 `getCurrentPersonaName()`
 * 2. `SillyTavern.getContext().name1`
 * 3. 全局变量 `name1`
 * 4. 从 DOM 读 persona 输入框（骰子系统的最后一招）
 */
export function getPersonaName(): string | null {
  try {
    const fn = findRuntimeFunction<() => string | null>('getCurrentPersonaName');
    const viaHelper = fn ? clean(fn()) : '';
    if (viaHelper) return viaHelper;
  } catch (e) {
    console.warn('[蔷薇前端] getCurrentPersonaName 调用失败', e);
  }

  for (const w of runtimeWindows()) {
    try {
      const ctx = (w as any)?.SillyTavern?.getContext?.();
      const viaCtx = clean(ctx?.name1);
      if (viaCtx) return viaCtx;

      const viaGlobal = clean((w as any)?.name1);
      if (viaGlobal) return viaGlobal;
    } catch {
      /* 跨域或接口缺失，继续下一个窗口 */
    }
  }

  for (const w of runtimeWindows()) {
    try {
      const el = w.document?.querySelector<HTMLInputElement>(
        '#persona_name_input, #user_avatar_block .avatar-name',
      );
      const viaDom = clean(el?.value ?? el?.textContent);
      if (viaDom) return viaDom;
    } catch {
      /* 同上 */
    }
  }

  return null;
}

/**
 * 从主角信息表读姓名。persona 未设置时的次选来源。
 *
 * 读快照而非经 character-repo —— 那边要 import 本模块，绕过去避免循环依赖。
 */
export function getPlayerNameFromTable(): string | null {
  try {
    const sheet = findSheetByName(['主角信息']);
    if (!sheet?.rows.length) return null;
    return clean(cell(sheet, sheet.rows[0], '姓名')) || null;
  } catch {
    return null;
  }
}

/** 用于显示的玩家名。三级回退，恒有值。 */
export function getDisplayPlayerName(fallback = '主角'): string {
  return getPersonaName() ?? getPlayerNameFromTable() ?? fallback;
}

/**
 * 把可能是占位符的名字解析成真名。
 *
 * 只在**确实是占位符或为空**时才替换 —— 表里已写了真名的行不动它，
 * 否则换一次 persona 就会让历史数据显示成另一个人。
 */
export function resolveUserName(raw: unknown, fallback = '主角'): string {
  const text = String(raw ?? '').trim();
  if (text && !isUserPlaceholder(text)) return text;
  return getDisplayPlayerName(fallback);
}

/**
 * 把一段文本里内嵌的占位符替换成真名。
 *
 * 用于展示文本、人际关系一类**句子中间**出现占位符的列 ——
 * 这些列不是纯名字，不能整体替换。
 *
 * 与 resolveUserName 不同，这里即使取不到 persona 也要替换成兜底文案：
 * 界面上显示「主角 检查行装」远好过显示「{{user}} 检查行装」。
 */
export function replaceUserPlaceholders(text: unknown): string {
  const s = String(text ?? '');
  if (!s) return s;
  const name = getDisplayPlayerName();
  return s.replace(new RegExp(PLACEHOLDER_SOURCE, 'gi'), name);
}
