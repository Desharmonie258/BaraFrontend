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
import { describeSheets } from './data/snapshot-repo';
import { PLUGIN_VERSION } from './domain/plugin-license';
import { waitForDatabase } from './data/db-ready';
import { loadPreset, activePreset } from './data/preset-store';
import { loadActionPreset, isCustomActive } from './data/action-preset-store';
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
let cancelWait: (() => void) | null = null;

/** 从只读快照重建表清单。表格更新后也走这里。 */
function reloadTables(): void {
  const schema = useSchemaStore();
  schema.reload();
  console.info(`${TAG} 表清单已刷新，表数量: ${schema.sheets.length}`);
}

/**
 * 订阅表格更新。数据库插件未挂载时返回 false，由等待循环稍后重试。
 *
 * `onTableUpdate` 在插件缺席时返回一个空的取消函数（见 db-gateway），
 * 因此**必须先确认插件在场**，否则会静默订阅到一个永不触发的回调。
 *
 * 只订阅一次：轮询期间反复退订重订会在两次操作之间留下空窗，
 * 恰好落在窗口里的通知就丢了。
 */
function attachTableWatch(): boolean {
  if (disposeTableWatch) return true;
  if (!isDbPresent()) return false;
  disposeTableWatch = onTableUpdate(() => {
    reloadTables();
    // 表格更新往往伴随新楼层，顺带校正挂载点
    reattach();
  });
  return true;
}

/** 启动等待循环。逻辑在 data/db-ready，这里只接线。 */
function startWaiting(): void {
  stopWaiting();
  cancelWait = waitForDatabase({
    attach: attachTableWatch,
    // 静默重读：探测期每轮都打日志会淹没控制台，成败各记一次即可
    reload: () => useSchemaStore().reload(),
    count: () => useSchemaStore().sheets.length,
    onReady: (attempt, count) =>
      console.info(`${TAG} 数据库已就绪，表数量: ${count}（第 ${attempt} 次探测）`),
    onTimeout: () =>
      console.warn(
        `${TAG} 等待数据库超时，表清单仍为空。` +
          `若数据库本体稍后才加载完，可在控制台执行 BaraFrontend.refresh() 手动刷新。`,
      ),
  });
}

function stopWaiting(): void {
  cancelWait?.();
  cancelWait = null;
}

/**
 * 自检。**表结构摘要是重点** —— 「换了别的数据库模板后表格显示不出来」
 * 这类报告，需要的信息就是「有哪些表、每张表的列叫什么」，
 * 光看截图要反复推断多轮才能定位。
 */
function diagnose(): Record<string, unknown> {
  const w = (window.top ?? window) as any;
  const sheets = describeSheets();
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
    version: PLUGIN_VERSION,
    // 认不出表的报告里，「装没装预设」是必须先排除的一项
    dashboardPreset: activePreset()?.name ?? null,
    actionPreset: isCustomActive() ? 'custom' : 'builtin',
    // 结构异常的表单列一份：正常时是空数组，一眼就知道有没有问题
    unhealthy: sheets.filter((s) => s.health !== 'ok').map((s) => `${s.name}:${s.health}`),
    tables: sheets,
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

  /*
   * 仪表盘预设要在读表之前挂上，否则首次 resolveSheets 走的是没有兜底的
   * 那条路，识别结果会比预设生效后少一批表，界面先闪一次「认不出」。
   */
  loadPreset();
  // 交互规则没有自定义时回落到内置默认，所以这里不必判断成败
  loadActionPreset();

  mountApp(App);

  try {
    ((window.top ?? window) as any).BaraFrontend = buildApi();
  } catch {
    (window as any).BaraFrontend = buildApi();
  }

  if (isDbPresent() && !canRead()) {
    console.warn(`${TAG} 数据库插件未暴露只读快照接口，无法读取表格`);
  }

  console.info(`${TAG} 已加载`, diagnose());

  // 数据库可能尚未启动完毕，读取交给等待循环，不在此处一次性完成
  startWaiting();
}

$(() => {
  errorCatched(init)();
});

$(window).on('pagehide', () => {
  // 先停轮询：否则已卸载的实例还会继续探测并写 store
  stopWaiting();
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
