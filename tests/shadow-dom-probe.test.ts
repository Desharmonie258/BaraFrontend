/**
 * Shadow DOM 隔离可行性验证
 *
 * 验证三件事：
 * 1. styleMountTarget 指向 shadow root 时，Naive UI 的样式是否真的落在 shadow 内
 * 2. 宿主 document.head 是否保持干净（不被污染）
 * 3. 弹层类组件（Select/Modal）默认 teleport 到哪里，`to` 能否纠正
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h, ref, type App } from 'vue';
import {
  NConfigProvider, NButton, NSelect, NModal, NCard,
} from 'naive-ui';

let host: HTMLElement;
let shadow: ShadowRoot;
let app: App | null = null;

function headStyleCount(): number {
  return document.head.querySelectorAll('style').length;
}
function shadowStyleCount(): number {
  return shadow.querySelectorAll('style').length;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  shadow = host.attachShadow({ mode: 'open' });
});

afterEach(() => {
  app?.unmount();
  app = null;
});

function mountInShadow(inner: () => any, extraProps: Record<string, unknown> = {}) {
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const Root = defineComponent({
    setup() {
      return () =>
        h(
          NConfigProvider,
          {
            styleMountTarget: shadow as unknown as ParentNode,
            preflightStyleDisabled: true,
            ...extraProps,
          },
          { default: inner },
        );
    },
  });
  app = createApp(Root);
  app.mount(mountPoint);
  return mountPoint;
}

describe('① styleMountTarget → shadow root', () => {
  it('基础组件的样式落在 shadow 内，而非 document.head', () => {
    const headBefore = headStyleCount();
    mountInShadow(() => h(NButton, null, { default: () => 'hi' }));

    expect(shadowStyleCount()).toBeGreaterThan(0);
    expect(headStyleCount()).toBe(headBefore);
  });

  it('不传 styleMountTarget 时样式落在 document.head（对照组）', () => {
    const mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);
    const Root = defineComponent({
      setup: () => () =>
        h(NConfigProvider, { preflightStyleDisabled: true }, {
          default: () => h(NButton, null, { default: () => 'hi' }),
        }),
    });
    app = createApp(Root);
    app.mount(mountPoint);

    expect(headStyleCount()).toBeGreaterThan(0);
  });

  it('preflight 未禁用时会额外注入全局 reset', () => {
    mountInShadow(() => h(NButton, null, { default: () => 'x' }), {
      preflightStyleDisabled: false,
    });
    const ids = [...shadow.querySelectorAll('style')].map((s) => s.getAttribute('cssr-id'));
    expect(ids).toContain('n-global');
  });
});

describe('② 弹层 teleport 目标', () => {
  it('NModal 默认 teleport 到 document.body —— 逃出 shadow 宿主子树', async () => {
    const show = ref(true);
    mountInShadow(() =>
      h(NModal, { show: show.value }, { default: () => h(NCard, null, { default: () => 'modal' }) }),
    );
    await new Promise((r) => setTimeout(r, 0));

    // 判据：内容出现在 body 的直接子节点中，且不在 shadow 宿主元素内部。
    // 这说明弹层脱离了我们的隔离边界，必须显式指定 to。
    const escaped = [...document.body.children].some(
      (el) => el !== host && (el.textContent ?? '').includes('modal'),
    );
    expect(escaped).toBe(true);
  });

  it('指定 to 后 NModal 回到 shadow 内', async () => {
    const holder = document.createElement('div');
    shadow.appendChild(holder);
    const show = ref(true);
    mountInShadow(() =>
      h(NModal, { show: show.value, to: holder }, {
        default: () => h(NCard, null, { default: () => 'modal-scoped' }),
      }),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(holder.textContent).toContain('modal-scoped');
  });

  it('NSelect 的下拉同样支持 to', async () => {
    const holder = document.createElement('div');
    shadow.appendChild(holder);
    mountInShadow(() =>
      h(NSelect, {
        show: true,
        to: holder,
        options: [{ label: 'opt-scoped', value: 'a' }],
      }),
    );
    await new Promise((r) => setTimeout(r, 0));

    // jsdom 无布局，虚拟列表算不出可见项，因此不断言选项文本；
    // 只断言下拉容器本身落在 holder 内 —— 这才是 teleport 目标的验证点。
    expect(holder.children.length).toBeGreaterThan(0);
    expect(holder.querySelector('.n-select-menu, .v-binder-follower-container')).not.toBeNull();
  });
});

describe('③ 宿主样式渗入方向', () => {
  it('shadow 内不受宿主 document.head 中样式影响（结构性验证）', () => {
    const hostStyle = document.createElement('style');
    hostStyle.textContent = 'button { font-size: 99px !important; }';
    document.head.appendChild(hostStyle);

    mountInShadow(() => h(NButton, null, { default: () => 'x' }));
    const btn = shadow.querySelector('button');
    expect(btn).not.toBeNull();
    // jsdom 不做样式层叠计算，此处仅断言宿主样式表未被复制进 shadow
    const shadowStyleText = [...shadow.querySelectorAll('style')]
      .map((s) => s.textContent ?? '')
      .join('');
    expect(shadowStyleText).not.toContain('99px');
  });
});
