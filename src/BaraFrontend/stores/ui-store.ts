/**
 * UI 偏好：主题、深浅模式、语言、当前目的地。
 *
 * 持久化走**酒馆变量**（模板约定），不用 localStorage —— localStorage
 * 不随酒馆存档迁移，换设备即丢失。
 *
 * 作用域取 `{type: 'script'}`：这些是插件配置，不随聊天变化。
 *
 * 存入前必须 `klona()` 去掉 Vue 的 proxy 层，否则写入的是不可序列化的对象。
 */
import { defineStore } from 'pinia';
import { computed, ref, watchEffect } from 'vue';
import { z } from 'zod';
import { klona } from 'klona';
import { THEMES, DEFAULT_THEME, getTheme } from '../presentation/theme/presets';
import type { ThemeId, ModeId } from '../presentation/theme/tokens';

export type ModeSetting = ModeId | 'auto';
export type Lang = 'zh-CN' | 'en-US';

/** 目的地：仪表盘与每张表平级，不存在从属关系（§8.9） */
export type Destination = { kind: 'dashboard' } | { kind: 'table'; sheetKey: string };

const THEME_IDS = THEMES.map((t) => t.id) as [ThemeId, ...ThemeId[]];

const UiSettings = z
  .object({
    theme: z.enum(THEME_IDS).default(DEFAULT_THEME),
    mode: z.enum(['light', 'dark', 'auto']).default('auto'),
    lang: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
    /** 表格视图模式按表记忆：不同表适合的模式不同（§8.9d） */
    tableViewModes: z.record(z.string(), z.enum(['card', 'list'])).default({}),
    /**
     * 表格坞布局：
     * - grid = 等宽网格，条目多时整齐（骰子系统的做法）
     * - flow = 按内容宽度流式排列，条目少时不浪费横向空间
     */
    dockLayout: z.enum(['grid', 'flow']).default('grid'),
    /** 表格坞是否显示图标 */
    dockIcons: z.boolean().default(true),
  })
  .prefault({});

export type UiSettings = z.infer<typeof UiSettings>;

function readSettings(): UiSettings {
  try {
    const raw = getVariables({ type: 'script', script_id: getScriptId() });
    return UiSettings.parse(raw ?? {});
  } catch (e) {
    console.warn('[蔷薇前端] UI 设置解析失败，回退默认值', e);
    return UiSettings.parse({});
  }
}

export const useUiStore = defineStore('ui', () => {
  const settings = ref<UiSettings>(readSettings());
  const destination = ref<Destination>({ kind: 'dashboard' });

  watchEffect(() => {
    try {
      replaceVariables(klona(settings.value), {
        type: 'script',
        script_id: getScriptId(),
      });
    } catch (e) {
      console.warn('[蔷薇前端] UI 设置写入失败', e);
    }
  });

  const theme = computed(() => getTheme(settings.value.theme));

  /**
   * auto 模式的落点取该主题的**原生模式**，而非系统偏好。
   * 选了 halloween 却看到浅色版，多半不是用户想要的。
   *
   * 酒馆是否暴露可靠的明暗标志尚未验证，因此不读宿主状态。
   */
  const effectiveMode = computed<ModeId>(() =>
    settings.value.mode === 'auto' ? theme.value.nativeMode : settings.value.mode,
  );

  const variant = computed(() =>
    effectiveMode.value === 'dark' ? theme.value.dark : theme.value.light,
  );

  function setTheme(id: ThemeId): void {
    settings.value.theme = id;
  }
  function setMode(m: ModeSetting): void {
    settings.value.mode = m;
  }
  function toggleLang(): void {
    settings.value.lang = settings.value.lang === 'zh-CN' ? 'en-US' : 'zh-CN';
  }
  function goTo(dest: Destination): void {
    destination.value = dest;
  }
  function tableViewMode(sheetKey: string): 'card' | 'list' {
    return settings.value.tableViewModes[sheetKey] ?? 'card';
  }
  function setTableViewMode(sheetKey: string, mode: 'card' | 'list'): void {
    settings.value.tableViewModes[sheetKey] = mode;
  }
  function toggleDockLayout(): void {
    settings.value.dockLayout = settings.value.dockLayout === 'grid' ? 'flow' : 'grid';
  }
  function toggleDockIcons(): void {
    settings.value.dockIcons = !settings.value.dockIcons;
  }

  return {
    themes: THEMES,
    settings,
    theme,
    variant,
    effectiveMode,
    destination,
    lang: computed(() => settings.value.lang),
    themeId: computed(() => settings.value.theme),
    modeSetting: computed(() => settings.value.mode),
    dockLayout: computed(() => settings.value.dockLayout),
    dockIcons: computed(() => settings.value.dockIcons),
    setTheme,
    setMode,
    toggleLang,
    goTo,
    tableViewMode,
    setTableViewMode,
    toggleDockLayout,
    toggleDockIcons,
  };
});
