/**
 * 交互规则预设的存放（1.11）。
 *
 * 与仪表盘预设同一套路（酒馆全局变量、解析后再启用），但**兜底行为相反**：
 *
 * - 仪表盘预设没有就是没有，识别层照常用内置绑定
 * - 交互规则没有自定义时**回落到内置默认规则**，交互总览开箱即用
 *
 * 差别的来由：仪表盘预设补的是「认不出的表」，多数人用不上；
 * 交互规则是这个页面的全部内容，没有规则页面就是空的。
 */
import {
  parseActionPreset, BUILTIN_ACTIONS, type ActionPreset,
} from '../domain/interaction-rules';
import { findRuntimeFunction } from './tavern-runtime';

const VAR_KEY = 'bara_action_preset';

/** 用户自定义的那一份。null 表示用内置默认。 */
let custom: ActionPreset | null = null;

function readVar(): unknown {
  const get = findRuntimeFunction<(opts?: unknown) => Record<string, unknown>>('getVariables');
  try {
    return get?.({ type: 'global' })?.[VAR_KEY];
  } catch (e) {
    console.warn('[蔷薇前端] 读取交互规则失败', e);
    return undefined;
  }
}

function writeVar(value: unknown): boolean {
  const replace = findRuntimeFunction<(updater: unknown, opts?: unknown) => unknown>(
    'replaceVariables',
  );
  if (!replace) return false;
  try {
    replace(
      (vars: Record<string, unknown>) => {
        if (value === undefined) delete vars[VAR_KEY];
        else vars[VAR_KEY] = value;
        return vars;
      },
      { type: 'global' },
    );
    return true;
  } catch (e) {
    console.warn('[蔷薇前端] 写入交互规则失败', e);
    return false;
  }
}

/** 当前生效的规则。没有自定义时返回内置默认，**不会是 null**。 */
export function activeActions(): ActionPreset {
  return custom ?? BUILTIN_ACTIONS;
}

/** 用的是不是用户自己的那一份。界面据此显示「内置」还是预设名。 */
export function isCustomActive(): boolean {
  return custom !== null;
}

/**
 * 从存储恢复。启动时调一次。
 *
 * 存下来的内容再解析一遍而不是直接信任：可能是上个版本写的，也可能被手工
 * 改坏。解析失败就退回内置默认 —— 一份坏规则不该让整个页面空掉。
 */
export function loadActionPreset(): ActionPreset {
  const raw = readVar();
  custom = raw ? parseActionPreset(raw).preset : null;
  return activeActions();
}

/** 导入并启用。返回解析中发现的问题，一条都不吞。 */
export function importActionPreset(input: unknown): { ok: boolean; problems: string[] } {
  const { preset, problems } = parseActionPreset(input);
  if (!preset) return { ok: false, problems };

  custom = preset;
  const saved = writeVar({ name: preset.name, description: preset.description, rules: preset.rules });
  return {
    ok: true,
    problems: saved
      ? problems
      : [...problems, '规则已生效，但没能存进酒馆变量，下次启动需重新导入'],
  };
}

/** 恢复内置默认。 */
export function clearActionPreset(): boolean {
  custom = null;
  return writeVar(undefined);
}
