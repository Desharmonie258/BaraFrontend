/**
 * 蔷薇前端 BaraFrontend —— 脚本入口
 *
 * 模板硬约定（AGENTS.md）：
 * - 加载时机用 $(() => {})，**不能用 DOMContentLoaded** —— 产物经
 *   $('body').load() 或 import 加载时该事件不会触发；
 * - 卸载时机用 pagehide，不用 unload；
 * - 禁止在全局作用域直接执行代码。
 *
 * 本文件与 presentation/bootstrap/ 是仅有的两处可以使用 jQuery 与
 * 酒馆助手接口的地方，其余层保持环境无关以便测试（§4 分层纪律）。
 */
import App from './presentation/App.vue';
import {
  mountShadow, show, hide, isVisible, isMounted, unmount,
} from './presentation/bootstrap/shadow-mount';
import { isDbPresent, isSqlReady, onTableUpdate } from './data/db-gateway';
import { useSchemaStore } from './stores/schema-store';

const BUTTON_ID = 'bara-frontend-launcher';

export interface BaraApi {
  open(): void;
  close(): void;
  toggle(): void;
  isReady(): boolean;
}

let disposeTableWatch: (() => void) | null = null;

/** 从数据库插件取当前生效的表格模板，用于枚举表格坞条目（不硬编码表名） */
function loadTemplate(): void {
  const schema = useSchemaStore();
  try {
    const api = ((window.top ?? window) as any).AutoCardUpdaterAPI;
    const tpl = api?.getTableTemplate?.();
    schema.setTemplate(tpl ?? null);
  } catch (e) {
    console.warn('[蔷薇前端] 读取表格模板失败', e);
    schema.setTemplate(null);
  }
}

function refreshCounts(): void {
  if (!isSqlReady()) return;
  useSchemaStore().refreshCounts();
}

function buildApi(): BaraApi {
  return {
    open: () => {
      show();
      loadTemplate();
      refreshCounts();
    },
    close: hide,
    toggle: () => (isVisible() ? hide() : (show(), loadTemplate(), refreshCounts())),
    isReady: isDbPresent,
  };
}

function init(): void {
  mountShadow(App);
  hide();

  const api = buildApi();
  // 挂到顶层窗口，供酒馆助手按钮与其他脚本调用
  try {
    ((window.top ?? window) as any).BaraFrontend = api;
  } catch {
    (window as any).BaraFrontend = api;
  }

  loadTemplate();
  refreshCounts();

  disposeTableWatch?.();
  disposeTableWatch = onTableUpdate(() => refreshCounts());

  if (!isDbPresent()) {
    console.warn('[蔷薇前端] 未检测到 SP·数据库插件，功能将不可用');
  }
  console.info('[蔷薇前端] 已加载');
}

$(() => {
  errorCatched(init)();
});

$(window).on('pagehide', () => {
  disposeTableWatch?.();
  disposeTableWatch = null;
  if (isMounted()) unmount();
  $(`#${BUTTON_ID}`).remove();
  console.info('[蔷薇前端] 已卸载');
});
