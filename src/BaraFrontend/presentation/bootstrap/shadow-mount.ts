/**
 * Shadow DOM 挂载 —— 样式双向隔离的落点。
 *
 * 本文件与 index.ts 是仅有的两处可以使用 jQuery 与宿主 DOM 的地方。
 *
 * 隔离机制（开发文档 §2.3，已实测验证）：
 * - Naive UI 的 CSS-in-JS 通过 n-config-provider 的 styleMountTarget
 *   重定向到 shadow root，不写入宿主 document.head；
 * - Shadow DOM 反向阻断酒馆的全局样式渗入；
 * - 弹层默认 teleport 到 document.body，会逃出边界，因此全部弹层
 *   必须使用 useTeleportTarget() 提供的容器。
 */
import { createApp, type App as VueApp, type Component } from 'vue';
import { createPinia } from 'pinia';

export const HOST_ID = 'bara-frontend-host';
/** shadow 内承载弹层的容器 id —— 与应用根节点同级，避免被应用重渲染波及 */
export const POPUP_LAYER_ID = 'bara-popup-layer';

interface MountState {
  app: VueApp | null;
  host: HTMLElement | null;
  shadow: ShadowRoot | null;
  appRoot: HTMLElement | null;
  popupLayer: HTMLElement | null;
}

const state: MountState = {
  app: null, host: null, shadow: null, appRoot: null, popupLayer: null,
};

/** 取宿主 document —— 脚本运行在酒馆页面上下文，但仍可能被嵌套 */
function hostDocument(): Document {
  try {
    if (window.top?.document) return window.top.document;
  } catch {
    /* 跨域，回退 */
  }
  try {
    if (window.parent?.document) return window.parent.document;
  } catch {
    /* 同上 */
  }
  return document;
}

export interface ShadowHandles {
  app: VueApp;
  shadow: ShadowRoot;
  appRoot: HTMLElement;
  popupLayer: HTMLElement;
}

/**
 * 惰性创建并挂载。重复调用返回既有实例。
 *
 * 实例创建后不销毁 —— 开关只切换 display。销毁重建会丢掉全部滚动位置、
 * 搜索词与视图模式（§8.9 各目的地状态各自保留）。
 */
export function mountShadow(root: Component): ShadowHandles {
  if (state.app && state.shadow && state.appRoot && state.popupLayer) {
    return {
      app: state.app, shadow: state.shadow,
      appRoot: state.appRoot, popupLayer: state.popupLayer,
    };
  }

  const doc = hostDocument();

  const host = doc.createElement('div');
  host.id = HOST_ID;
  // 宿主节点自身不参与酒馆布局；内部弹层走 --bara-z-* 令牌
  host.style.position = 'relative';
  host.style.zIndex = '0';
  doc.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const appRoot = doc.createElement('div');
  appRoot.id = 'bara-app';
  shadow.appendChild(appRoot);

  const popupLayer = doc.createElement('div');
  popupLayer.id = POPUP_LAYER_ID;
  shadow.appendChild(popupLayer);

  const app = createApp(root);
  app.use(createPinia());
  app.mount(appRoot);

  state.app = app;
  state.host = host;
  state.shadow = shadow;
  state.appRoot = appRoot;
  state.popupLayer = popupLayer;

  return { app, shadow, appRoot, popupLayer };
}

/** 把 CSS 变量写到 shadow 内的应用根节点。绝不写 :root。 */
export function applyCssVars(vars: Record<string, string>): void {
  if (!state.appRoot) return;
  for (const [k, v] of Object.entries(vars)) {
    state.appRoot.style.setProperty(k, v);
  }
  // 弹层层在 shadow 内但不在 appRoot 下，需要同一套变量
  if (state.popupLayer) {
    for (const [k, v] of Object.entries(vars)) {
      state.popupLayer.style.setProperty(k, v);
    }
  }
}

export function show(): void {
  if (state.host) state.host.style.display = '';
}
export function hide(): void {
  if (state.host) state.host.style.display = 'none';
}
export function isVisible(): boolean {
  return !!state.host && state.host.style.display !== 'none';
}
export function isMounted(): boolean {
  return state.app !== null;
}
export function getShadow(): ShadowRoot | null {
  return state.shadow;
}
export function getPopupLayer(): HTMLElement | null {
  return state.popupLayer;
}

/** 卸载 —— 仅在脚本卸载（pagehide）时调用 */
export function unmount(): void {
  state.app?.unmount();
  state.host?.remove();
  state.app = null;
  state.host = null;
  state.shadow = null;
  state.appRoot = null;
  state.popupLayer = null;
}
