<script setup lang="ts">
/**
 * 设置行 —— 左标签、右控件的固定骨架。
 *
 * 抽成组件是为了让每一行的对齐、间距、说明文字位置完全一致：
 * 设置面板条目多，任何一行自己写布局都会在字号变化时错位。
 */
defineProps<{
  label: string;
  /** 补充说明。只在需要解释「为什么会有这个选项」时给。 */
  hint?: string;
}>();
</script>

<template>
  <div class="bara-srow">
    <div class="bara-srow__text">
      <span class="bara-srow__label">{{ label }}</span>
      <span v-if="hint" class="bara-srow__hint">{{ hint }}</span>
    </div>
    <div class="bara-srow__ctrl">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bara-srow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-5);
  padding: var(--bara-space-3) 0;
  min-height: 2.25rem;
}
.bara-srow__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bara-srow__label {
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text);
}
.bara-srow__hint {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
  line-height: var(--bara-line-height-tight);
}
/*
 * 控件靠右但**不拉伸**：单选组按内容宽，下拉与数字框自带定宽。
 * 统一右对齐后，一列控件的右边缘才是齐的。
 */
.bara-srow__ctrl {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bara-space-2);
}

/* 窄屏下控件换行到标签下方，否则长标签会把控件挤没 */
@media (max-width: 520px) {
  .bara-srow { flex-direction: column; align-items: stretch; }
  .bara-srow__ctrl { justify-content: flex-start; }
}
</style>
