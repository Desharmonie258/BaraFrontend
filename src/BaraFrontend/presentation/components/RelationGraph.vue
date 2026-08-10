<script setup lang="ts">
/**
 * 人物关系图（1.11）—— 谁和谁有关系，一眼看完。
 *
 * 渲染要点与 RowMap 一致，理由也一致：
 * - **SVG 而非 canvas**：颜色走 CSS 变量，换主题时浏览器自己重算。
 *   canvas 读不到 CSS 变量，每次换主题都得 JS 取色再全量重绘。
 * - **排版不在这里**：力模拟在 domain/relation-graph，纯函数可单测。
 * - **命中区用绝对定位的透明按钮**，而不是给 circle 挂事件 ——
 *   这样能直接用 naive-ui 的 tooltip，也顺带获得键盘可达性。
 *
 * 点的大小随关系条数变化：关系多的人是这张图的枢纽，让他显眼是
 * 这张图唯一能表达的层级信息。
 */
import { computed, useTemplateRef } from 'vue';
import { useElementSize } from '@vueuse/core';
import { NEmpty, NTooltip } from 'naive-ui';
import { t } from '../../i18n';
import type { Lang } from '../../stores/ui-store';
import { layoutRelations, type RelationInput } from '../../domain/relation-graph';

const props = defineProps<{
  relations: RelationInput[];
  lang: Lang;
}>();

const box = useTemplateRef<HTMLDivElement>('box');
const { width } = useElementSize(box);
const HEIGHT = 320;

const graph = computed(() =>
  layoutRelations(props.relations, { width: width.value, height: HEIGHT }),
);

/** 点半径。关系越多越大，但要封顶 —— 一个连了 20 条边的点会盖住半张图 */
function radiusOf(degree: number): number {
  return Math.min(11, 5 + degree);
}

/** 某个人的全部关系，tooltip 用 */
function tipLines(name: string): string[] {
  return graph.value.edges
    .filter((e) => e.a === name || e.b === name)
    .map((e) => {
      const other = e.a === name ? e.b : e.a;
      return e.label ? `${other}：${e.label}` : other;
    });
}
</script>

<template>
  <div ref="box" class="bara-rel">
    <NEmpty
      v-if="graph.nodes.length === 0"
      size="small"
      :description="t('relations.empty', lang)"
    />

    <template v-else>
      <svg
        class="bara-rel__svg"
        :viewBox="`0 0 ${width} ${HEIGHT}`"
        :width="width"
        :height="HEIGHT"
        role="img"
      >
        <!-- 边先画，点压在线上面 —— 否则线会横穿标签 -->
        <line
          v-for="e in graph.edges"
          :key="`${e.a}-${e.b}`"
          class="bara-rel__edge"
          :x1="e.x1"
          :y1="e.y1"
          :x2="e.x2"
          :y2="e.y2"
        />

        <g v-for="n in graph.nodes" :key="n.name">
          <circle class="bara-rel__dot" :cx="n.px" :cy="n.py" :r="radiusOf(n.degree)" />
          <text
            class="bara-rel__label"
            :x="n.px"
            :y="n.py + radiusOf(n.degree) + 4"
            text-anchor="middle"
            dominant-baseline="hanging"
          >
            {{ n.name }}
          </text>
        </g>
      </svg>

      <div class="bara-rel__hits">
        <NTooltip v-for="n in graph.nodes" :key="n.name" trigger="hover">
          <template #trigger>
            <button
              type="button"
              class="bara-rel__hit"
              :style="{ left: `${n.px}px`, top: `${n.py}px` }"
              :aria-label="n.name"
            />
          </template>
          <div class="bara-rel__tip">
            <strong>{{ n.name }}</strong>
            <span v-for="line in tipLines(n.name)" :key="line">{{ line }}</span>
          </div>
        </NTooltip>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bara-rel {
  position: relative;
  width: 100%;
}

/*
 * 高度固定而非按内容撑开：力模拟需要一个确定的画布尺寸才能算坐标，
 * 而「高度由内容决定、内容位置由高度决定」是个循环。
 */
.bara-rel__svg {
  display: block;
  width: 100%;
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-fill-soft, transparent);
}

.bara-rel__edge {
  stroke: var(--bara-color-border);
  stroke-width: 1.5;
  fill: none;
}

.bara-rel__dot {
  fill: var(--bara-color-primary);
  stroke: var(--bara-color-bg);
  stroke-width: 2;
}

.bara-rel__label {
  fill: var(--bara-color-text);
  font-size: var(--bara-font-size-xs);
  /* 标签可能压到线上，描一层背景色的边把字衬出来 */
  paint-order: stroke;
  stroke: var(--bara-color-bg);
  stroke-width: 3;
  stroke-linejoin: round;
}

.bara-rel__hits {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.bara-rel__hit {
  position: absolute;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: default;
  pointer-events: auto;
}
.bara-rel__hit:focus-visible {
  outline: 2px solid var(--bara-color-primary);
  outline-offset: 2px;
}

.bara-rel__tip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 18rem;
}
</style>
