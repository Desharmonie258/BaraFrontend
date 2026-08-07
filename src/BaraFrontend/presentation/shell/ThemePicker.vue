<script setup lang="ts">
/**
 * 主题选择器 —— 带色块预览的网格。
 *
 * 十二套主题用下拉已经不好用了：单列滚动看不到全貌，且光看名字
 * 无法预判配色，只能逐个点开试。改成网格后每张卡本身就是一份缩略预览。
 *
 * **每张卡用主题自己的色值内联着色，不走 --bara-* 变量** ——
 * 变量指向的是当前生效的主题，用它渲染会让十二张卡长得一模一样。
 *
 * 预览的是**将要生效的那一版**：跟随模式时取主题的原生深浅，
 * 否则取用户选定的深浅。预览与实际不符比没有预览更糟。
 */
import { computed } from 'vue';
import { NButton } from 'naive-ui';
import type { ThemeId, ThemePreset, ModeId } from '../theme/tokens';
import type { Lang, ModeSetting } from '../../stores/ui-store';

const props = defineProps<{
  modelValue: ThemeId;
  themes: ThemePreset[];
  lang: Lang;
  /** 当前的深浅设置，决定预览哪一版 */
  modeSetting: ModeSetting;
}>();
const emit = defineEmits<{ 'update:modelValue': [v: ThemeId] }>();

function variantOf(t: ThemePreset): ModeId {
  return props.modeSetting === 'auto' ? t.nativeMode : props.modeSetting;
}

/** 四个色块取主色、强调、成功、警告 —— 足以看出色相家族与饱和度 */
const cards = computed(() =>
  props.themes.map((t) => {
    const p = t[variantOf(t)].palette;
    return {
      id: t.id,
      label: t.name[props.lang],
      bg: p.bg,
      ink: p.ink,
      line: p.line,
      swatches: [p.primary, p.accent, p.success, p.warning],
    };
  }),
);
</script>

<template>
  <div class="bara-tp" role="radiogroup">
    <NButton
      v-for="c in cards"
      :key="c.id"
      quaternary
      class="bara-tp__card"
      :class="{ 'is-active': c.id === modelValue }"
      role="radio"
      :aria-checked="c.id === modelValue"
      :title="c.label"
      :style="{ background: c.bg, borderColor: c.id === modelValue ? undefined : c.line }"
      @click="emit('update:modelValue', c.id)"
    >
      <span class="bara-tp__name" :style="{ color: c.ink }">{{ c.label }}</span>
      <span class="bara-tp__swatches">
        <span
          v-for="(s, i) in c.swatches"
          :key="i"
          class="bara-tp__dot"
          :style="{ background: s }"
        />
      </span>
    </NButton>
  </div>
</template>

<style scoped>
.bara-tp {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  gap: var(--bara-space-2);
  width: 100%;
}

/*
 * 主题卡内容左对齐纵向排布，NButton 默认横向居中，需改内容容器。
 * 底色由内联 style 给（每张卡用它自己主题的色值），因此这里不设
 * background —— 设了会盖掉预览色，十二张卡就全长一样了。
 */
.bara-tp__card {
  width: 100%;
  height: auto;
  padding: var(--bara-space-3);
  border: 2px solid transparent;
  border-radius: var(--bara-radius-md);
  overflow: hidden;
  transition: transform var(--bara-duration-fast) var(--bara-easing);
}
.bara-tp__card :deep(.n-button__content) {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--bara-space-2);
}
.bara-tp__card:hover { transform: translateY(-1px); }
/*
 * 选中态用当前主题的主色描边，而非被预览主题的 —— 它表达的是
 * 「你选了这个」，属于界面状态，不属于预览内容。
 */
.bara-tp__card.is-active {
  border-color: var(--bara-color-primary);
  box-shadow: var(--bara-shadow-md);
}

.bara-tp__name {
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  line-height: var(--bara-line-height-tight);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bara-tp__swatches { display: flex; gap: 4px; }
.bara-tp__dot {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: var(--bara-radius-sm);
  /* 浅色块落在浅底上会消失，用半透明黑描边兜住边界 */
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
}
</style>
