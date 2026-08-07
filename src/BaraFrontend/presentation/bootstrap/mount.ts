/**
 * 挂载 —— 楼层内寄生。
 *
 * 界面不是浮在屏幕上的固定层，而是**挂进最新一条消息楼层内部**，
 * 随对话流滚动。这样它常驻可见却不遮挡任何内容。
 *
 * 三件事必须处理，缺一个界面就会在某个时刻消失：
 *
 * 1. **最新楼层会变**。新消息到达后，"最后一条 .mes" 换成了另一个 DOM
 *    节点，根元素必须迁移过去。
 * 2. **切换聊天时酒馆会重建 #chat**，挂在里面的节点被连带移除。我们持有
 *    根元素的引用，节点本身仍在内存中，重新 appendChild 即可复位 ——
 *    Vue 应用不需要销毁重建，状态得以保留。
 * 3. **宽度会被楼层内边距裁剪**。挂进 .mes_block 后，根元素的可用宽度
 *    小于消息区实际宽度，需要反算负边距抵消，并放开父容器的 overflow。
 *
 * 本文件与 index.ts 是仅有的两处可以使用 jQuery 与宿主 DOM 的地方。
 */
import { createApp, type App as VueApp, type Component } from 'vue';

export const ROOT_ID = 'bara-frontend-root';
export const OVERLAY_ID = 'bara-frontend-overlay';

/** 右侧留白，给滚动条与进度条让位 */
const RIGHT_GAP = 12;

interface MountState {
  app: VueApp | null;
  root: HTMLElement | null;
  /** 弹层容器，挂在宿主 body 下，见 getOverlayRoot() */
  overlay: HTMLElement | null;
  observer: MutationObserver | null;
  disposers: Array<() => void>;
  fullWidth: boolean;
}

const state: MountState = {
  app: null, root: null, overlay: null, observer: null, disposers: [], fullWidth: true,
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

function hostWindow(): Window {
  try {
    if (window.top?.document) return window.top;
  } catch {
    /* 跨域，回退 */
  }
  return window;
}

/**
 * 找当前应挂载的父节点：最新一条消息楼层的内容块。
 *
 * `.mes_block` 是楼层内的正文容器；个别楼层结构不同时回退到 `.mes` 本身，
 * 不因结构差异整个失败。
 */
function findAnchor(doc: Document): HTMLElement | null {
  const chat = doc.getElementById('chat');
  if (!chat) return null;
  const floors = chat.querySelectorAll('.mes');
  if (floors.length === 0) return null;
  const last = floors[floors.length - 1];
  return (last.querySelector('.mes_block') as HTMLElement | null) ?? (last as HTMLElement);
}

/**
 * 宽度修正：让根元素与消息区内容宽度对齐。
 *
 * 不做的话界面会比消息正文窄一截 —— 楼层的内边距会把它挤进去。
 */
function fixWidth(): void {
  const root = state.root;
  if (!root) return;

  if (!state.fullWidth) {
    root.style.width = '';
    root.style.marginLeft = '';
    return;
  }

  const doc = hostDocument();
  const win = hostWindow();
  const chat = doc.getElementById('chat');
  const parent = root.parentElement;
  if (!chat || !parent) return;

  const chatWidth = chat.clientWidth;
  if (chatWidth <= 0) return;

  const cs = win.getComputedStyle(chat);
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const padRight = parseFloat(cs.paddingRight) || 0;
  const contentWidth = chatWidth - padLeft - padRight;
  if (contentWidth <= 0) return;

  // 父容器默认会裁掉超出部分，必须放开
  parent.style.overflow = 'visible';

  const chatRect = chat.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  // 负边距把根元素拉回消息区的左边缘
  root.style.marginLeft = `${chatRect.left + padLeft - parentRect.left}px`;
  root.style.width = `${Math.max(0, contentWidth - RIGHT_GAP)}px`;
}

/**
 * 确保根元素挂在当前最新楼层下。
 *
 * appendChild 是**移动**而非复制 —— Vue 应用不会被销毁，
 * 滚动位置、折叠状态、已加载的数据全部保留。
 */
function ensureAttached(): void {
  const doc = hostDocument();
  const anchor = findAnchor(doc);
  if (!anchor || !state.root) return;
  if (state.root.parentNode !== anchor) {
    anchor.appendChild(state.root);
  }
  fixWidth();
}

/** 简易防抖 —— 楼层增删与表格更新都会打到同一个刷新点上 */
function debounce(fn: () => void, wait: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, wait);
  };
}

const scheduleAttach = debounce(ensureAttached, 200);

/** 监听 #chat：新增楼层时把根元素迁移到新的最后一楼 */
function startObserving(): void {
  const doc = hostDocument();
  const win = hostWindow();
  const chat = doc.getElementById('chat');
  if (!chat) return;

  state.observer?.disconnect();
  const Observer = (win as any).MutationObserver ?? MutationObserver;
  state.observer = new Observer((mutations: MutationRecord[]) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && node.classList?.contains('mes')) {
          scheduleAttach();
          return;
        }
      }
    }
  });
  state.observer.observe(chat, { childList: true, subtree: true });
}

export interface MountHandles {
  app: VueApp;
  root: HTMLElement;
}

/**
 * 挂载。重复调用返回既有实例。
 *
 * 首次挂载时 #chat 可能还没有任何楼层（空聊天），此时根元素先游离，
 * 由观察器在首条消息出现后接管 —— 不轮询、不报错。
 */
export function mountApp(root: Component): MountHandles {
  if (state.app && state.root) {
    return { app: state.app, root: state.root };
  }

  const doc = hostDocument();
  const host = doc.createElement('div');
  host.id = ROOT_ID;
  host.style.boxSizing = 'border-box';

  /*
   * **先登记 root，再 mount。** 顺序反了的话，首次渲染期间 getRoot()
   * 还是 null —— 而弹层组件在树里一开始就存在（只是不显示），
   * 它们此刻求得的 teleport 目标会被永久缓存成 undefined，
   * 于是弹层落进不可见的 iframe，表现为「点了没反应」。
   */
  state.root = host;
  getOverlayRoot();

  const app = createApp(root);
  app.mount(host);

  state.app = app;

  ensureAttached();
  startObserving();
  startStyleRelay();

  // 切换聊天会重建 #chat，把我们的节点一并移除；重新挂回去即可，
  // 不需要销毁 Vue 应用。
  try {
    const dispose = eventOn(tavern_events.CHAT_CHANGED, () => {
      startObserving();
      scheduleAttach();
    });
    state.disposers.push(() => {
      try {
        (dispose as any)?.();
      } catch {
        /* 事件系统已卸载 */
      }
    });
  } catch (e) {
    console.warn('[蔷薇前端] 无法监听聊天切换事件，切换聊天后可能需要刷新', e);
  }

  const win = hostWindow();
  const onResize = debounce(fixWidth, 150);
  win.addEventListener('resize', onResize);
  state.disposers.push(() => win.removeEventListener('resize', onResize));

  return { app, root: host };
}

/**
 * 样式应当注入的节点 —— **宿主文档的 head**，而不是当前文档的。
 *
 * 酒馆助手脚本运行在 `about:srcdoc` 的 iframe 内，但我们的 DOM 挂在
 * 父文档的消息楼层里。运行时注入的样式若落在 iframe 的 head，
 * 与元素不在同一文档，规则完全不生效 —— 表现为组件毫无样式、
 * SVG 图标失去尺寸约束而巨大化。
 */
export function getStyleHost(): HTMLElement | undefined {
  const doc = hostDocument();
  return (doc.head as HTMLElement | null) ?? undefined;
}

/**
 * 插件根容器 —— 界面本体的挂载点，寄生在消息楼层里。
 *
 * **弹层不要用它**，用 getOverlayRoot()：原因见那个函数的说明。
 */
export function getRoot(): HTMLElement {
  // 兜底到宿主 document.body，而不是让调用方拿到 undefined ——
  // undefined 会让 Naive 退回 iframe 的 body，那里是不可见的。
  return state.root ?? hostDocument().body;
}

/**
 * 弹层容器 —— **所有 teleport 类组件的挂载目标**（模态、下拉、气泡）。
 *
 * 为什么不能挂到插件根容器上：根容器寄生在消息楼层里，而酒馆给楼层加了
 * 入场动画。带 `transform` 的祖先会成为 `position: fixed` 的包含块 ——
 * 弹层于是不再相对视口定位，而是被钉在楼层的坐标系里，表现为
 * 「模态框跑到聊天记录最顶端」。`filter`、`perspective`、`will-change`、
 * `contain` 都有同样的效果。
 *
 * 因此弹层必须挂在宿主 `body` 直下，脱离楼层的层叠上下文。
 * 代价是它不在根容器内，继承不到 --bara-* 变量 —— 所以 applyCssVars()
 * 会同时写入这两个容器。
 */
export function getOverlayRoot(): HTMLElement {
  const doc = hostDocument();
  // 每次都确认还在文档里：切换聊天、酒馆重绘都可能把它带走
  if (!state.overlay || !state.overlay.isConnected) {
    const existing = doc.getElementById(OVERLAY_ID);
    const el = existing ?? doc.createElement('div');
    el.id = OVERLAY_ID;
    // 不设任何会创建包含块的属性（transform / filter / contain），
    // 否则就把刚绕开的问题原样搬了过来
    if (!existing) doc.body.appendChild(el);
    state.overlay = el;
  }
  return state.overlay;
}

/** 已转投的样式节点，避免重复复制 */
const relayed = new WeakSet<Element>();

/**
 * 样式中继：把本文档（iframe）head 里的 <style> 复制到宿主文档。
 *
 * Naive UI 可以用 styleMountTarget 直接指向宿主，但 Vue SFC 的
 * `<style scoped>` 由 vue-style-loader 注入，没有同类配置项 ——
 * 只能在运行时转投。
 *
 * 复制而非移动：留在原处不影响任何东西，移动反而可能让注入方
 * 后续的更新（HMR、动态样式）找不到自己的节点。
 */
function relayStyles(): void {
  const host = hostDocument();
  if (host === document) return; // 未在 iframe 中，无需中继

  const hostHead = host.head;
  if (!hostHead) return;

  for (const node of Array.from(document.head.querySelectorAll('style'))) {
    if (relayed.has(node)) continue;
    relayed.add(node);
    const copy = host.createElement('style');
    copy.setAttribute('data-bara-relay', '');
    copy.textContent = node.textContent;
    hostHead.appendChild(copy);
  }
}

/** 监听本文档 head，新样式随时转投 */
function startStyleRelay(): void {
  relayStyles();
  const observer = new MutationObserver(() => relayStyles());
  observer.observe(document.head, { childList: true });
  state.disposers.push(() => observer.disconnect());
}

/** 供外部在数据更新后重新校正位置与宽度 */
export function reattach(): void {
  scheduleAttach();
}

/** 是否让根元素撑满消息区宽度 */
export function setFullWidth(v: boolean): void {
  state.fullWidth = v;
  fixWidth();
}

/** CSS 变量写到根元素，绝不写 :root */
/**
 * 写入 CSS 变量。**两个容器都要写** —— 弹层挂在 body 下，
 * 不在根容器内，继承不到根上的变量。
 */
export function applyCssVars(vars: Record<string, string>): void {
  const targets = [state.root, state.overlay].filter(
    (el): el is HTMLElement => el !== null,
  );
  for (const el of targets) {
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  }
}

export function isMounted(): boolean {
  return state.app !== null;
}

export function unmount(): void {
  state.observer?.disconnect();
  state.observer = null;
  for (const d of state.disposers) d();
  state.disposers = [];
  state.app?.unmount();
  state.root?.remove();
  state.overlay?.remove();
  state.app = null;
  state.root = null;
  state.overlay = null;
}
