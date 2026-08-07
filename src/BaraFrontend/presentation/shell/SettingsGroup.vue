<script setup lang="ts">
/**
 * 设置分组 —— 可折叠的一节。
 *
 * 沿用骰子系统的做法：分组折叠状态**持久化**，默认只展开「外观」。
 * 五组全展开时面板一屏放不下，每次打开都要重新滚到常改的那一组。
 */
import { NIcon, NButton } from 'naive-ui';
import type { Component } from 'vue';
import { ICONS } from '../icons';

defineProps<{
  title: string;
  icon: Component;
  expanded: boolean;
}>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <section class="bara-sgroup" :class="{ 'is-collapsed': !expanded }">
    <NButton
      class="bara-sgroup__head"
      quaternary
      block
      :aria-expanded="expanded"
      @click="$emit('toggle')"
    >
      <NIcon
        class="bara-sgroup__chevron"
        :component="expanded ? ICONS.expand : ICONS.collapse"
      />
      <NIcon class="bara-sgroup__icon" :component="icon" />
      <span class="bara-sgroup__title">{{ title }}</span>
    </NButton>
    <div v-if="expanded" class="bara-sgroup__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.bara-sgroup {
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-surface);
  overflow: hidden;
}

/*
 * NButton 默认定高、内容居中，而分组标题要满宽、左对齐、自定高度。
 * 这三项 NButton 不提供开关，只能用 :deep 改内容容器。
 */
.bara-sgroup__head {
  height: auto;
  padding: var(--bara-space-3) var(--bara-space-4);
  border-radius: 0;
  background: var(--bara-color-surface-sunken);
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
}
.bara-sgroup__head :deep(.n-button__content) {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--bara-space-2);
}

.bara-sgroup__chevron {
  flex: none;
  color: var(--bara-color-text-muted);
  font-size: 1.1em;
}
.bara-sgroup__icon { flex: none; font-size: 1.15em; }
.bara-sgroup__title { min-width: 0; }

.bara-sgroup__body {
  padding: var(--bara-space-2) var(--bara-space-5) var(--bara-space-4);
  display: flex;
  flex-direction: column;
}
/* 行间分隔线，最后一行不画 */
.bara-sgroup__body > :not(:last-child) {
  border-bottom: var(--bara-border-width) solid var(--bara-color-divider);
}
</style>
