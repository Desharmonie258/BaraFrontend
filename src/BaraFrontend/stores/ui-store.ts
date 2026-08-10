/**
 * UI 偏好：主题、深浅模式、语言、当前目的地。
 *
 * 不用 Pinia：模板的 externals 会把 pinia 变成运行时 CDN 导入，而本项目
 * 要产出完全自包含的单文件脚本（无外部导入、无网络依赖）。两个 store
 * 用普通单例 + Vue 响应式即可，引入状态库并不划算。
 *
 * 持久化走**酒馆变量**（模板约定），不用 localStorage —— localStorage
 * 不随酒馆存档迁移，换设备即丢失。
 */
import { computed, reactive, ref, watchEffect } from 'vue';
import { THEMES, DEFAULT_THEME, getTheme } from '../presentation/theme/presets';
import type { QaSmoke } from '../domain/enum-policy';
import { DEFAULT_RULE_SYSTEM, isRuleFamily, type RuleFamily } from '../domain/rule-systems';
import type { ThemeId, ModeId } from '../presentation/theme/tokens';

export type ModeSetting = ModeId | 'auto';
export type Lang = 'zh-CN' | 'en-US';

/** 目的地：仪表盘与每张表平级，不存在从属关系（§8.9） */
export type Destination =
  | { kind: 'dashboard' }
  | { kind: 'table'; sheetKey: string }
  | { kind: 'settings' }
  | { kind: 'review' }
  | { kind: 'variables' }
  /** 交互总览（1.11）：把每张表的每一行摊成一个能点的对象 */
  | { kind: 'interactions' };

export interface UiSettings {
  theme: ThemeId;
  mode: ModeSetting;
  lang: Lang;
  /** 表格视图模式按表记忆：不同表适合的模式不同（§8.9d） */
  tableViewModes: Record<string, 'card' | 'list' | 'calendar'>;
  /** grid = 等宽网格（条目多时整齐）；flow = 流式（条目少时不浪费横向空间） */
  dockLayout: 'grid' | 'flow';
  dockIcons: boolean;
  /** 内容区是否展开。卡片本身一直显示，只有内容区可折叠 */
  expanded: boolean;
  /**
   * 检定建议点击后是否直接发送。关闭时只填入输入框。
   * 默认开启（与骰子系统一致），但保留关闭项 —— 发送是不可撤销的外发动作。
   */
  suggestAutoSend: boolean;

  // ── 以下条目由设置面板管理（§8.10）──
  /** 字号缩放，作用于全部 --bara-font-size-* 令牌 */
  fontScale: number;
  /** 内容区最大高度（vh）。限高避免长表把后续对话推出很远 */
  contentHeight: number;
  /** 表格每页行数 */
  pageSize: number;
  /** 宽度校正：把卡片撑到聊天区满宽。个别主题下会溢出，故可关 */
  fullWidth: boolean;
  /** 坞中隐藏的表 key。骰子系统的「导航盘管理」同款能力 */
  hiddenSheets: string[];
  /** 设置面板中展开的分组 */
  expandedGroups: string[];
  /**
   * QASmoke 挡位。default 只放行 NPC 表的归档状态，
   * debug 放开全部枚举列（见 domain/enum-policy）。
   */
  qaSmoke: QaSmoke;
  /** 当前规则族（§5.4）。决定检定的判定方式与资源类型。 */
  ruleSystem: RuleFamily;
}

/** 数值项的合法区间。越界不报错，夹回边界即可。 */
const RANGES = {
  fontScale: [0.8, 1.4],
  contentHeight: [30, 90],
  pageSize: [10, 200],
} as const;

function clamp(v: unknown, key: keyof typeof RANGES, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const [lo, hi] = RANGES[key];
  return Math.min(hi, Math.max(lo, n));
}

function toStringArray(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback;
}

const THEME_IDS = new Set(THEMES.map((t) => t.id));

function defaults(): UiSettings {
  return {
    theme: DEFAULT_THEME,
    mode: 'auto',
    lang: 'zh-CN',
    tableViewModes: {},
    dockLayout: 'grid',
    dockIcons: true,
    expanded: true,
    suggestAutoSend: true,
    fontScale: 1,
    contentHeight: 60,
    pageSize: 50,
    fullWidth: true,
    hiddenSheets: [],
    // 只默认展开外观组：五组全开会让面板一屏放不下（骰子系统同款默认）
    expandedGroups: ['appearance'],
    qaSmoke: 'default',
    ruleSystem: DEFAULT_RULE_SYSTEM,
  };
}

/** 逐字段校验，任一字段非法只回退该字段，不整体丢弃用户设置 */
function normalize(raw: unknown): UiSettings {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;

  return {
    theme: THEME_IDS.has(r.theme as ThemeId) ? (r.theme as ThemeId) : d.theme,
    mode: (['light', 'dark', 'auto'] as const).includes(r.mode as ModeSetting)
      ? (r.mode as ModeSetting)
      : d.mode,
    lang: (['zh-CN', 'en-US'] as const).includes(r.lang as Lang) ? (r.lang as Lang) : d.lang,
    tableViewModes:
      r.tableViewModes && typeof r.tableViewModes === 'object'
        ? (r.tableViewModes as Record<string, 'card' | 'list' | 'calendar'>)
        : d.tableViewModes,
    dockLayout: r.dockLayout === 'flow' ? 'flow' : 'grid',
    dockIcons: r.dockIcons !== false,
    expanded: r.expanded !== false,
    suggestAutoSend: r.suggestAutoSend !== false,
    fontScale: clamp(r.fontScale, 'fontScale', d.fontScale),
    contentHeight: clamp(r.contentHeight, 'contentHeight', d.contentHeight),
    pageSize: clamp(r.pageSize, 'pageSize', d.pageSize),
    fullWidth: r.fullWidth !== false,
    hiddenSheets: toStringArray(r.hiddenSheets, d.hiddenSheets),
    expandedGroups: toStringArray(r.expandedGroups, d.expandedGroups),
    qaSmoke: r.qaSmoke === 'debug' ? 'debug' : d.qaSmoke,
    ruleSystem: isRuleFamily(r.ruleSystem) ? r.ruleSystem : d.ruleSystem,
  };
}

/** 深拷贝：去掉 Vue 的 proxy 层。structuredClone 是原生 API，不需要 klona。 */
function plain<T>(v: T): T {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v)) as T;
  }
}

function readSettings(): UiSettings {
  try {
    return normalize(getVariables({ type: 'script', script_id: getScriptId() }));
  } catch (e) {
    console.warn('[蔷薇前端] UI 设置读取失败，使用默认值', e);
    return defaults();
  }
}

function create() {
  /**
   * 用 reactive 包裹返回值：它会在属性访问时自动解包 ref，
   * 使调用方写 `ui.lang` 而非 `ui.lang.value`。
   *
   * 这是去掉 Pinia 后必须补上的一环 —— defineStore 原本提供了同样的解包，
   * 缺了它模板里拿到的是 ref 对象本身，渲染出 [object Object]，
   * 而 script 里 `ui.variant.palette` 会是 undefined。
   */
  const settings = ref<UiSettings>(readSettings());
  const destination = ref<Destination>({ kind: 'dashboard' });
  /** 打开设置前所在的目的地，关闭后原路返回 */
  const beforeSettings = ref<Destination>({ kind: 'dashboard' });

  watchEffect(() => {
    try {
      replaceVariables(plain(settings.value), { type: 'script', script_id: getScriptId() });
    } catch (e) {
      console.warn('[蔷薇前端] UI 设置写入失败', e);
    }
  });

  const theme = computed(() => getTheme(settings.value.theme));

  /**
   * auto 模式的落点取该主题的**原生模式**，而非系统偏好。
   * 选了 halloween 却看到浅色版，多半不是用户想要的。
   */
  const effectiveMode = computed<ModeId>(() =>
    settings.value.mode === 'auto' ? theme.value.nativeMode : settings.value.mode,
  );
  const variant = computed(() =>
    effectiveMode.value === 'dark' ? theme.value.dark : theme.value.light,
  );


  return reactive({
    themes: THEMES,
    settings,
    destination,
    theme,
    variant,
    effectiveMode,
    lang: computed(() => settings.value.lang),
    themeId: computed(() => settings.value.theme),
    modeSetting: computed(() => settings.value.mode),
    dockLayout: computed(() => settings.value.dockLayout),
    dockIcons: computed(() => settings.value.dockIcons),
    expanded: computed(() => settings.value.expanded),
    suggestAutoSend: computed(() => settings.value.suggestAutoSend),
    fontScale: computed(() => settings.value.fontScale),
    contentHeight: computed(() => settings.value.contentHeight),
    pageSize: computed(() => settings.value.pageSize),
    fullWidth: computed(() => settings.value.fullWidth),
    hiddenSheets: computed(() => settings.value.hiddenSheets),
    qaSmoke: computed(() => settings.value.qaSmoke),
    ruleSystem: computed(() => settings.value.ruleSystem),

    setTheme: (id: ThemeId) => void (settings.value.theme = id),
    setMode: (m: ModeSetting) => void (settings.value.mode = m),
    setLang: (v: Lang) => void (settings.value.lang = v),
    toggleLang: () =>
      void (settings.value.lang = settings.value.lang === 'zh-CN' ? 'en-US' : 'zh-CN'),
    goTo: (dest: Destination) => void (destination.value = dest),
    tableViewMode: (k: string): 'card' | 'list' | 'calendar' => settings.value.tableViewModes[k] ?? 'card',
    setTableViewMode: (k: string, m: 'card' | 'list' | 'calendar') =>
      void (settings.value.tableViewModes[k] = m),
    toggleDockLayout: () =>
      void (settings.value.dockLayout = settings.value.dockLayout === 'grid' ? 'flow' : 'grid'),
    toggleDockIcons: () => void (settings.value.dockIcons = !settings.value.dockIcons),
    setExpanded: (v: boolean) => void (settings.value.expanded = v),
    toggleExpanded: () => void (settings.value.expanded = !settings.value.expanded),
    setSuggestAutoSend: (v: boolean) => void (settings.value.suggestAutoSend = v),
    setFontScale: (v: number) => void (settings.value.fontScale = clamp(v, 'fontScale', 1)),
    setContentHeight: (v: number) =>
      void (settings.value.contentHeight = clamp(v, 'contentHeight', 60)),
    setPageSize: (v: number) => void (settings.value.pageSize = clamp(v, 'pageSize', 50)),
    setFullWidth: (v: boolean) => void (settings.value.fullWidth = v),
    setQaSmoke: (v: QaSmoke) => void (settings.value.qaSmoke = v),
    setRuleSystem: (v: RuleFamily) => void (settings.value.ruleSystem = v),

    openSettings: () => {
      if (destination.value.kind !== 'settings') beforeSettings.value = destination.value;
      destination.value = { kind: 'settings' };
    },
    /** 关闭后回到进来之前的位置，而不是一律跳回仪表盘 */
    closeSettings: () => void (destination.value = beforeSettings.value),

    isSheetHidden: (k: string): boolean => settings.value.hiddenSheets.includes(k),
    toggleSheetHidden: (k: string) => {
      const list = settings.value.hiddenSheets;
      settings.value.hiddenSheets = list.includes(k)
        ? list.filter((x) => x !== k)
        : [...list, k];
    },
    showAllSheets: () => void (settings.value.hiddenSheets = []),

    isGroupExpanded: (g: string): boolean => settings.value.expandedGroups.includes(g),
    toggleGroup: (g: string) => {
      const list = settings.value.expandedGroups;
      settings.value.expandedGroups = list.includes(g)
        ? list.filter((x) => x !== g)
        : [...list, g];
    },

    /**
     * 恢复默认。**保留语言** —— 看不懂界面就找不到改回来的地方，
     * 这是重置里唯一不该被重置的项。
     */
    resetSettings: () => {
      const lang = settings.value.lang;
      settings.value = { ...defaults(), lang };
    },
  });
}

export type UiStore = ReturnType<typeof create>;

let instance: UiStore | null = null;

export function useUiStore(): UiStore {
  if (!instance) instance = create();
  return instance;
}

/** 仅供测试与卸载使用 */
export function __resetUiStore(): void {
  instance = null;
}
