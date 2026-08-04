<script setup lang="ts">
/**
 * 应用根组件 —— 单一 n-config-provider，主题与语言的唯一注入点。
 * 不嵌套 provider：嵌套只会让主题来源难以追溯（§8.7b）。
 *
 * 三条隔离约定（§2.3，已实测）：
 * 1. styleMountTarget 指向 shadow root —— Naive UI 的样式不写宿主 head
 * 2. preflight-style-disabled 必须开 —— 否则注入 n-global 全局 reset
 * 3. 绝不使用 n-global-style —— 它会写进宿主 document.body
 */
import { computed, onMounted, watchEffect } from 'vue';
import {
  NConfigProvider, NMessageProvider, NDialogProvider,
  darkTheme, zhCN, dateZhCN, enUS, dateEnUS,
} from 'naive-ui';
import { useUiStore } from '../stores/ui-store';
import { deriveSemantic, toCssVars } from './theme/tokens';
import { toNaiveOverrides } from './theme/naive-bridge';
import { getShadow, applyCssVars } from './bootstrap/shadow-mount';
import AppShell from './shell/AppShell.vue';

const ui = useUiStore();

const colors = computed(() => ({
  ...deriveSemantic(ui.variant.palette, ui.effectiveMode),
  ...(ui.variant.overrides ?? {}),
}));
const naiveTheme = computed(() => (ui.effectiveMode === 'dark' ? darkTheme : null));
const overrides = computed(() => toNaiveOverrides(colors.value, ui.variant.style));
const locale = computed(() => (ui.lang === 'zh-CN' ? zhCN : enUS));
const dateLocale = computed(() => (ui.lang === 'zh-CN' ? dateZhCN : dateEnUS));

// Naive UI 的样式挂载点；自绘元素的 CSS 变量另走 applyCssVars
const styleTarget = computed(() => (getShadow() as unknown as ParentNode) ?? undefined);

// 主题变更后重写自有 CSS 变量。Naive UI 侧由 provider 响应式处理。
watchEffect(() => applyCssVars(toCssVars(colors.value, ui.variant.style)));
onMounted(() => applyCssVars(toCssVars(colors.value, ui.variant.style)));
</script>

<template>
  <NConfigProvider
    :theme="naiveTheme"
    :theme-overrides="overrides"
    :locale="locale"
    :date-locale="dateLocale"
    :style-mount-target="styleTarget"
    preflight-style-disabled
  >
    <NMessageProvider :to="styleTarget">
      <NDialogProvider :to="styleTarget">
        <AppShell />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
