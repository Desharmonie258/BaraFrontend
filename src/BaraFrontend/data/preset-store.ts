/**
 * 仪表盘预设的存放与启用（1.11）。
 *
 * 存在**酒馆的全局变量**里，不是聊天变量：预设描述的是「这份数据库模板
 * 长什么样」，同一个模板会用在很多聊天上。存进聊天变量的话，每开一个新
 * 聊天都要重新导一次。
 *
 * 启用后通过 `setPresetFallback` 挂进识别层，**只在内置绑定认不出时**
 * 才会被用到（见 snapshot-repo 的说明）。
 */
import {
  parsePreset, matchSheets as matchByPreset, type DashboardPreset, type ModuleName,
} from '../domain/dashboard-preset';
import { setPresetFallback, type SheetSnapshot } from './snapshot-repo';
import { findRuntimeFunction } from './tavern-runtime';

const VAR_KEY = 'bara_dashboard_preset';

/**
 * 识别规格 → 预设模块。
 *
 * 一对多是刻意的：角色表既可能被写成 `player` 也可能被写成 `npc`
 * （骰子系统把主角与 NPC 分成两个模块，本前端 1.1 起并成一张表），
 * 两个模块的关键词都要认，否则从骰子系统导过来的预设有一半点不亮。
 */
const SPEC_TO_MODULES: Record<string, readonly ModuleName[]> = {
  characters: ['npc', 'player'],
  protagonist: ['player'],
  items: ['bag'],
  equipment: ['equip'],
  global: ['global'],
  relations: ['relationshipGraph'],
};

let active: DashboardPreset | null = null;

/** 逐级回退读全局变量。与 review-repo 同策略，不缓存函数引用。 */
function readVar(): unknown {
  const get = findRuntimeFunction<(opts?: unknown) => Record<string, unknown>>('getVariables');
  try {
    return get?.({ type: 'global' })?.[VAR_KEY];
  } catch (e) {
    console.warn('[蔷薇前端] 读取仪表盘预设失败', e);
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
    console.warn('[蔷薇前端] 写入仪表盘预设失败', e);
    return false;
  }
}

/** 当前启用的预设。没有则 null。 */
export function activePreset(): DashboardPreset | null {
  return active;
}

/**
 * 把预设挂进识别层。传 null 表示停用。
 *
 * 挂的是一个闭包而不是预设本身 —— 识别层不该知道预设长什么样，
 * 它只需要「给我一个 spec，还我一组表」。
 */
function install(preset: DashboardPreset | null): void {
  active = preset;
  if (!preset) {
    setPresetFallback(null);
    return;
  }
  setPresetFallback((spec, all) => {
    const moduleNames = SPEC_TO_MODULES[spec.id];
    if (!moduleNames) return [];
    const hit: SheetSnapshot[] = [];
    for (const name of moduleNames) {
      for (const sheet of matchByPreset(all, preset.modules[name])) {
        // 两个模块可能命中同一张表，去重后再返回
        if (!hit.includes(sheet)) hit.push(sheet);
      }
    }
    return hit;
  });
}

/**
 * 从存储里恢复预设并启用。启动时调一次。
 *
 * 存下来的内容再解析一遍而不是直接信任：它可能是上一个版本写的，
 * 也可能被用户手工改过全局变量。解析失败就当没有 —— 一个坏预设
 * 不该让仪表盘整个认不出表。
 */
export function loadPreset(): DashboardPreset | null {
  const raw = readVar();
  if (!raw) {
    install(null);
    return null;
  }
  const { preset } = parsePreset(raw);
  install(preset);
  return preset;
}

/** 导入并启用。返回解析中发现的问题，一条都不吞。 */
export function importPreset(input: unknown): { ok: boolean; problems: string[] } {
  const { preset, problems } = parsePreset(input);
  if (!preset) return { ok: false, problems };

  install(preset);
  const saved = writeVar({
    name: preset.name,
    description: preset.description,
    modules: preset.modules,
  });
  return {
    ok: true,
    // 存不下来仍算导入成功：这次会话能用，只是下次要重导
    problems: saved ? problems : [...problems, '预设已生效，但没能存进酒馆变量，下次启动需重新导入'],
  };
}

/** 停用并清除。 */
export function clearPreset(): boolean {
  install(null);
  return writeVar(undefined);
}
