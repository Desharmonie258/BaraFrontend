<script setup lang="ts">
/**
 * 应用根组件。
 *
 * 主题走两条并行通路：
 * - Naive UI 组件 → n-config-provider 的 themeOverrides
 * - 自绘元素（资源条、角色卡、表格）→ 注入应用根节点的 CSS 变量
 *
 * CSS 变量绝不写 :root（§8.7）—— 那是酒馆的文档。
 */
import { onMounted, computed, watchEffect } from 'vue';
import { NConfigProvider, darkTheme, zhCN, dateZhCN, enUS, dateEnUS } from 'naive-ui';
import { useUiStore } from '../stores/ui-store';
import { deriveSemantic, toCssVars } from './theme/tokens';
import { toNaiveOverrides } from './theme/naive-bridge';
import { applyCssVars, getStyleHost, setFullWidth, reattach } from './bootstrap/mount';
import AppShell from './shell/AppShell.vue';

const ui = useUiStore();

const colors = computed(() => ({
  ...deriveSemantic(ui.variant.palette, ui.effectiveMode),
  ...(ui.variant.overrides ?? {}),
}));
const naiveTheme = computed(() => (ui.effectiveMode === 'dark' ? darkTheme : null));
const overrides = computed(() => toNaiveOverrides(colors.value, ui.variant.style));
const locale = computed(() => (ui.lang === 'zh-CN' ? zhCN : enUS));

/**
 * Naive UI 的运行时样式必须注入宿主文档的 head。
 * 脚本运行在 iframe 内，默认注入点与元素所在文档不一致，样式不会生效。
 */
const styleTarget = getStyleHost();
const dateLocale = computed(() => (ui.lang === 'zh-CN' ? dateZhCN : dateEnUS));

function syncVars(): void {
  applyCssVars(toCssVars(colors.value, ui.variant.style, ui.fontScale));
}
watchEffect(syncVars);
onMounted(syncVars);

// 宽度校正开关。改动后要重新量一次，否则要等下一条消息才生效。
watchEffect(() => {
  setFullWidth(ui.fullWidth);
  reattach();
});
</script>

<template>
  <!-- 不使用 n-global-style：它会把样式写进宿主 document.body（§8.7b） -->
  <NConfigProvider
    :theme="naiveTheme"
    :theme-overrides="overrides"
    :locale="locale"
    :date-locale="dateLocale"
    :style-mount-target="styleTarget"
    preflight-style-disabled
  >
    <AppShell />
  </NConfigProvider>
</template>

<!--
  宿主样式隔离。**不加 scoped** —— 要选中的是 Naive 在组件内部渲染的
  原生元素，scoped 的属性选择器够不到它们。

  为什么需要这一层：酒馆用 `input[type="text"]`（特指度 0,1,1）这类选择器
  设了全局表单样式，而 Naive 复位内层输入框用的是 `.n-input__input-el`
  （0,1,0）—— 宿主赢，于是原生 input 带着自己的底色和边框显示在
  n-input 的框里，看起来就是「框中框」。

  用 `#bara-frontend-root` 前缀把特指度抬到 (1,1,0) 压过宿主，
  内容则是把 Naive 原本就想要的复位重新声明一遍，不改变它的设计。

  只针对 Naive 的内层元素，不做 `input, button {}` 这种大范围复位 ——
  那样会连 Naive 自己的组件样式一起打掉。
-->
<style>
/*
 * 两个容器都要覆盖：界面本体在 #bara-frontend-root，而模态、下拉这类
 * 弹层 teleport 到 #bara-frontend-overlay（见 mount.ts）。只写前者的话，
 * 弹层里的输入框完全没被保护 —— 那正是「框中框」最容易漏掉的地方。
 */
#bara-frontend-root .n-input .n-input__input-el,
#bara-frontend-root .n-input .n-input__textarea-el,
#bara-frontend-overlay .n-input .n-input__input-el,
#bara-frontend-overlay .n-input .n-input__textarea-el {
  /*
   * 这些声明**全部带 !important**，且这是本项目唯一允许用它的地方。
   *
   * 理由：特指度已经是 (1,2,0)，正常情况下压得过酒馆的
   * `input[type="text"]`（0,1,1）。既然实测仍不生效，只可能是宿主用了
   * !important —— 而 !important 只能用 !important 压。
   *
   * 这些属性的作用是「让内层元素隐形，交给 Naive 的外层画」，本来就该是
   * 终值，不存在被下游合理覆盖的场景，因此加 !important 不会挡住任何人。
   */
  appearance: none !important;
  -webkit-appearance: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  outline: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
  min-height: 0 !important;
  max-height: none !important;
  height: 100% !important;
  width: 100% !important;
  font-family: inherit !important;
  font-size: inherit !important;
  line-height: inherit !important;
  letter-spacing: inherit !important;
  color: inherit !important;
  text-align: inherit !important;
}

/* 数字框的原生步进箭头与 Naive 自己的 +/- 按钮重复，隐藏之 */
#bara-frontend-root .n-input-number .n-input__input-el,
#bara-frontend-overlay .n-input-number .n-input__input-el {
  -moz-appearance: textfield;
}
#bara-frontend-root .n-input-number .n-input__input-el::-webkit-outer-spin-button,
#bara-frontend-root .n-input-number .n-input__input-el::-webkit-inner-spin-button,
#bara-frontend-overlay .n-input-number .n-input__input-el::-webkit-outer-spin-button,
#bara-frontend-overlay .n-input-number .n-input__input-el::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* 同理：宿主的 button 规则会改字族与圆角，Naive 的按钮需保住自己的 */
#bara-frontend-root .n-button,
#bara-frontend-overlay .n-button {
  font-family: inherit;
  text-transform: none;
  letter-spacing: normal;
}
</style>
