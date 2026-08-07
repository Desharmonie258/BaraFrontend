/**
 * 蔷薇前端 BaraFrontend —— 脚本入口
 *
 * 模板硬约定（AGENTS.md）：
 * - 加载时机用 $(() => {})，**不能用 DOMContentLoaded** —— 产物以单文件
 *   脚本内联执行时该事件不会触发；
 * - 卸载时机用 pagehide，不用 unload；
 * - 禁止在全局作用域直接执行代码。
 *
 * 界面**加载后即常驻**，挂在最新消息楼层内随对话流滚动，不需要按钮
 * 或任何触发条件。详略由内容区的折叠状态决定，该状态持久化在酒馆变量中。
 *
 * 本文件与 presentation/bootstrap/ 是仅有的两处可以使用 jQuery 与
 * 酒馆助手接口的地方，其余层保持环境无关以便测试（§4 分层纪律）。
 */
import App from './presentation/App.vue';
import { mountApp, isMounted, unmount, reattach, ROOT_ID } from './presentation/bootstrap/mount';
import { isDbPresent, canRead, canWrite, onTableUpdate } from './data/db-gateway';
import { useSchemaStore, __resetSchemaStore } from './stores/schema-store';
import { useUiStore, __resetUiStore } from './stores/ui-store';

const TAG = '[蔷薇前端]';

export interface BaraApi {
  /** 展开内容区 */
  expand(): void;
  /** 收起内容区 */
  collapse(): void;
  /** 切换展开状态 */
  toggle(): void;
  /** 重新读取模板与行数 */
  refresh(): void;
  isReady(): boolean;
  /** 自检：返回当前环境的关键依赖状态，排障用 */
  diagnose(): Record<string, unknown>;
}

let disposeTableWatch: (() => void) | null = null;

/** 从只读快照重建表清单。表格更新后也走这里。 */
function reloadTables(): void {
  const schema = useSchemaStore();
  schema.reload();
  console.info(`${TAG} 表清单已刷新，表数量: ${schema.sheets.length}`);
}

function diagnose(): Record<string, unknown> {
  const w = (window.top ?? window) as any;
  return {
    vue: typeof (globalThis as any).Vue !== 'undefined',
    jquery: typeof $ !== 'undefined',
    dbPlugin: !!w.AutoCardUpdaterAPI,
    canRead: canRead(),
    canWrite: canWrite(),
    mounted: isMounted(),
    hostInDom: !!w.document?.getElementById?.(ROOT_ID) || !!document.getElementById(ROOT_ID),
    expanded: useUiStore().expanded,
    sheets: useSchemaStore().sheets.length,
  };
}

function buildApi(): BaraApi {
  const ui = useUiStore();
  return {
    expand: () => ui.setExpanded(true),
    collapse: () => ui.setExpanded(false),
    toggle: () => ui.toggleExpanded(),
    refresh: reloadTables,
    isReady: isDbPresent,
    diagnose,
  };
}

function init(): void {
  // 宿主必须提供全局 Vue（模板 externals 将 'vue' 映射为全局变量）。
  // 缺失时会在挂载处抛出难以理解的错误，这里提前给出明确信息。
  if (typeof (globalThis as any).Vue === 'undefined') {
    console.error(`${TAG} 未找到全局 Vue，脚本无法运行。请确认酒馆助手版本。`);
    return;
  }

  mountApp(App);

  try {
    ((window.top ?? window) as any).BaraFrontend = buildApi();
  } catch {
    (window as any).BaraFrontend = buildApi();
  }

  reloadTables();

  disposeTableWatch?.();
  disposeTableWatch = onTableUpdate(() => {
    reloadTables();
    // 表格更新往往伴随新楼层，顺带校正挂载点
    reattach();
  });

  if (!isDbPresent()) {
    console.warn(`${TAG} 未检测到 SP·数据库插件，表格内容将为空`);
  } else if (!canRead()) {
    console.warn(`${TAG} 数据库插件未暴露只读快照接口，无法读取表格`);
  }

  console.info(`${TAG} 已加载`, diagnose());
}

$(() => {
  errorCatched(init)();
});

$(window).on('pagehide', () => {
  disposeTableWatch?.();
  disposeTableWatch = null;
  if (isMounted()) unmount();
  __resetUiStore();
  __resetSchemaStore();
  try {
    delete ((window.top ?? window) as any).BaraFrontend;
  } catch {
    /* 顶层窗口不可写时忽略 */
  }
  console.info(`${TAG} 已卸载`);
});
