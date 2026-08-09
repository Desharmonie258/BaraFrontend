<script setup lang="ts">
/**
 * 地图视图 —— 把带坐标列的表按方位铺开，接壤的点之间连线。
 *
 * ## 一个组件覆盖四个层级
 *
 * 世界地图点表一张表存三个层级（主要地区 / 次要地区 / 详细地点），
 * 本地地图表存第四层（地点内的元素）。四层的渲染要素完全相同 ——
 * 一组带坐标的点，外加一组可选的边 —— 所以这里只认「点 + 边」，
 * **不认层级**。筛选哪些行属于当前层级是上层的事，组件不查全局数据表。
 *
 * 本地地图表没有接壤关系列，于是它就是「边为空」的特例，不需要另写组件。
 *
 * ## 排版不在这里
 *
 * 坐标由 AI 填，实战里大量落在 DEFAULT 的 0.5,0.5 上，直接按坐标画会
 * 糊成一团。真正的排版（坐标弱吸引 + 方位硬约束 + 碰撞散开）在
 * domain/map-layout 里，是不依赖 DOM 的纯函数，可单测。
 * 这里只负责把算好的坐标画出来。
 *
 * ## 颜色一律走 CSS 变量
 *
 * 九套主题、明暗两态。SVG 的 stroke/fill 直接写 `var(--bara-*)`，
 * 主题切换时浏览器自己重算 —— 这是当初否掉 canvas 方案（chart.js、
 * ECharts 的 canvas renderer）的直接原因：canvas 读不到 CSS 变量，
 * 每次换主题都得 JS 取色再全量重绘。
 */
import { computed, ref, useTemplateRef, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import { NButton, NEmpty, NTooltip } from 'naive-ui';
import type { TableRow } from '../../data/repositories/table-repo';
import type { Lang } from '../../stores/ui-store';
import { t } from '../../i18n';
import {
  detectHierarchy,
  drillInto,
  filterByLevel,
  layoutMap,
  type EdgeStyle,
  type MapLevel,
  type MapPointInput,
} from '../../domain/map-layout';

const props = defineProps<{
  rows: TableRow[];
  /** 表头，用于探测层级列 */
  columns: string[];
  /** 点名列，同层级内唯一 —— 边靠它对应 */
  nameColumn: string;
  xColumn: string;
  yColumn: string;
  /** 接壤关系列。本地地图表没有这一列，此时只画点 */
  adjacencyColumn?: string;
  lang: Lang;
}>();

/**
 * 层级列。世界地图点表有三层，本地地图表没有（返回 null，按单层画）。
 */
const hierarchy = computed(() => detectHierarchy(props.columns));

const level = ref<MapLevel>({ kind: 'world' });

/*
 * 换表时回到最外层。不重置的话，从一张表的「橡木镇」切到另一张表，
 * 会停在一个当前表里根本不存在的层级上，画出一张空图。
 */
watch(
  () => props.columns,
  () => {
    level.value = { kind: 'world' };
  },
);

/** 当前层级的行；无层级列的表就是全部行 */
const levelRows = computed(() =>
  hierarchy.value ? filterByLevel(props.rows, hierarchy.value, level.value) : props.rows,
);

/** 面包屑。世界层只有一节，点其中任一节回到那一层。 */
const crumbs = computed<{ label: string; level: MapLevel }[]>(() => {
  if (!hierarchy.value) return [];
  const out: { label: string; level: MapLevel }[] = [
    { label: t('map.level.world', props.lang), level: { kind: 'world' } },
  ];
  if (level.value.kind !== 'world') {
    out.push({
      label: level.value.major,
      level: { kind: 'major', major: level.value.major },
    });
  }
  if (level.value.kind === 'minor') {
    out.push({ label: level.value.minor, level: { ...level.value } });
  }
  return out;
});

/** 当前层还能不能往下点 —— 详细地点层与无层级的表都不能 */
const canDrill = computed(
  () => hierarchy.value !== null && drillInto(level.value, '') !== null,
);

/** 点进下一层；已是最底层（详细地点）则不动 */
function onDrill(name: string): void {
  if (!hierarchy.value) return;
  const next = drillInto(level.value, name);
  if (next) level.value = next;
}

const box = useTemplateRef<HTMLDivElement>('box');
/*
 * 容器宽度随抽屉/侧栏变化，高度固定（见样式里的说明）。
 * useElementSize 首帧给 0，layoutMap 对 0 尺寸返回空布局，
 * 因此挂载瞬间不会算出一堆 NaN 坐标。
 */
const { width } = useElementSize(box);
const HEIGHT = 360;

/** 坐标解析失败一律落到 0.5（居中），交给力模拟推开，而不是丢掉这个点 */
function toUnit(raw: string | undefined): number {
  const n = Number(String(raw ?? '').trim());
  return Number.isFinite(n) ? n : 0.5;
}

const points = computed<MapPointInput[]>(() =>
  levelRows.value
    .map((row) => ({
      rowIndex: row.rowIndex,
      name: String(row.cells[props.nameColumn] ?? '').trim(),
      x: toUnit(row.cells[props.xColumn]),
      y: toUnit(row.cells[props.yColumn]),
      adjacency: props.adjacencyColumn ? row.cells[props.adjacencyColumn] : undefined,
    }))
    // 无名的点画不出来也点不回原行，直接不画
    .filter((p) => p.name !== ''),
);

const layout = computed(() =>
  layoutMap(points.value, { width: width.value, height: HEIGHT }),
);

/** 行数据按点名索引，供 tooltip 显示坐标之外的信息 */
const rowByName = computed(() => {
  const map = new Map<string, TableRow>();
  for (const row of levelRows.value) {
    const name = String(row.cells[props.nameColumn] ?? '').trim();
    if (name) map.set(name, row);
  }
  return map;
});

/**
 * tooltip 里显示的补充信息。
 *
 * 不写死列名 —— 各模板的地图表列不尽相同，这里取除了名字与坐标之外的
 * 前几列非空值。地图上只放得下名字，其余信息靠悬停补。
 */
const HIDDEN_IN_TIP = computed(
  () => new Set([props.nameColumn, props.xColumn, props.yColumn, 'row_id']),
);

function tipLines(name: string): string[] {
  const row = rowByName.value.get(name);
  if (!row) return [];
  return Object.entries(row.cells)
    .filter(([k, v]) => !HIDDEN_IN_TIP.value.has(k) && String(v ?? '').trim() !== '')
    .slice(0, 4)
    .map(([k, v]) => `${k}：${v}`);
}

/** 线型 → CSS 类。虚线与粗线的具体样式在下方样式块里定义 */
const EDGE_CLASS: Record<EdgeStyle, string> = {
  solid: 'bara-map__edge--solid',
  dashed: 'bara-map__edge--dashed',
  thick: 'bara-map__edge--thick',
};

/** 图例只列出图上实际出现的线型，避免解释用户看不到的东西 */
const usedStyles = computed(() => {
  const set = new Set(layout.value.edges.map((e) => e.style));
  return (['solid', 'dashed', 'thick'] as const).filter((s) => set.has(s));
});
</script>

<template>
  <div ref="box" class="bara-map">
    <!--
      面包屑只在有层级的表上出现。最后一节是当前层级，不可点 ——
      点了没反应的按钮比没有按钮更糟。
    -->
    <nav v-if="crumbs.length > 1" class="bara-map__crumbs" :aria-label="t('map.level.world', lang)">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i > 0" class="bara-map__crumb-sep">/</span>
        <NButton
          v-if="i < crumbs.length - 1"
          text
          size="tiny"
          class="bara-map__crumb"
          @click="level = c.level"
        >
          {{ c.label }}
        </NButton>
        <span v-else class="bara-map__crumb bara-map__crumb--current">{{ c.label }}</span>
      </template>
    </nav>

    <NEmpty
      v-if="layout.points.length === 0"
      size="small"
      :description="t('map.empty', lang)"
    />

    <template v-else>
      <svg
        class="bara-map__svg"
        :viewBox="`0 0 ${width} ${HEIGHT}`"
        :width="width"
        :height="HEIGHT"
        role="img"
      >
        <!-- 边先画，点压在线上面 —— 否则线会横穿标签 -->
        <line
          v-for="e in layout.edges"
          :key="`${e.a}-${e.b}`"
          class="bara-map__edge"
          :class="EDGE_CLASS[e.style]"
          :x1="e.x1"
          :y1="e.y1"
          :x2="e.x2"
          :y2="e.y2"
        />

        <g v-for="p in layout.points" :key="p.rowIndex" class="bara-map__node">
          <circle class="bara-map__dot" :cx="p.px" :cy="p.py" r="6" />
          <!--
            标签画在点下方。dominant-baseline 用 hanging 而不是靠 dy 微调 ——
            字号随主题变，写死偏移量换个主题就贴到点上了。
          -->
          <text
            class="bara-map__label"
            :x="p.px"
            :y="p.py + 10"
            text-anchor="middle"
            dominant-baseline="hanging"
          >
            {{ p.name }}
          </text>
        </g>
      </svg>

      <!--
        悬停信息用 naive-ui 的 tooltip 而不是 SVG 原生 <title> ——
        原生 title 的延迟与样式都不可控，且换行显示不了。
      -->
      <div class="bara-map__hits">
        <NTooltip v-for="p in layout.points" :key="p.rowIndex" trigger="hover">
          <template #trigger>
            <button
              type="button"
              class="bara-map__hit"
              :class="{ 'bara-map__hit--drillable': canDrill }"
              :style="{ left: `${p.px}px`, top: `${p.py}px` }"
              :aria-label="p.name"
              @click="onDrill(p.name)"
            />
          </template>
          <div class="bara-map__tip">
            <strong>{{ p.name }}</strong>
            <span v-for="line in tipLines(p.name)" :key="line">{{ line }}</span>
          </div>
        </NTooltip>
      </div>

      <div v-if="usedStyles.length > 1" class="bara-map__legend">
        <span v-for="s in usedStyles" :key="s" class="bara-map__legend-item">
          <svg class="bara-map__legend-line" viewBox="0 0 24 4" aria-hidden="true">
            <line class="bara-map__edge" :class="EDGE_CLASS[s]" x1="0" y1="2" x2="24" y2="2" />
          </svg>
          {{ t(`map.legend.${s}`, lang) }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bara-map {
  position: relative;
  width: 100%;
}

/*
 * 高度固定而不是按内容撑开：力模拟需要一个确定的画布尺寸才能算坐标，
 * 而「高度由内容决定、内容位置由高度决定」是个循环。
 */
.bara-map__svg {
  display: block;
  width: 100%;
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-fill-soft, transparent);
}

.bara-map__edge {
  stroke: var(--bara-color-border);
  stroke-width: 1.5;
  fill: none;
}
.bara-map__edge--solid {
  stroke: var(--bara-color-primary);
}
/* 水域相隔：虚线，表示不是走得通的路 */
.bara-map__edge--dashed {
  stroke-dasharray: 4 4;
}
/* 地形阻隔：加粗，表示通行成本高 */
.bara-map__edge--thick {
  stroke-width: 3.5;
  opacity: 0.65;
}

.bara-map__dot {
  fill: var(--bara-color-primary);
  stroke: var(--bara-color-bg);
  stroke-width: 2;
}

.bara-map__label {
  fill: var(--bara-color-text);
  font-size: var(--bara-font-size-xs);
  /* 标签可能压到线上，描一层背景色的边把字衬出来 */
  paint-order: stroke;
  stroke: var(--bara-color-bg);
  stroke-width: 3;
  stroke-linejoin: round;
}

/*
 * 命中区叠在 SVG 上。用绝对定位的透明按钮而不是给 <circle> 挂事件：
 * 这样能直接用 naive-ui 的 tooltip，也顺带获得键盘可达性。
 */
.bara-map__hits {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.bara-map__hit {
  position: absolute;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  /* 不能下钻时不给手型指针 —— 别暗示一个不存在的交互 */
  cursor: default;
  pointer-events: auto;
}
.bara-map__hit--drillable {
  cursor: pointer;
}

.bara-map__crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bara-space-1);
  margin-bottom: var(--bara-space-2);
  font-size: var(--bara-font-size-xs);
}
.bara-map__crumb-sep {
  color: var(--bara-color-text-muted);
}
.bara-map__crumb--current {
  color: var(--bara-color-text);
  font-weight: var(--bara-font-weight-medium, 500);
}
.bara-map__hit:focus-visible {
  outline: 2px solid var(--bara-color-primary);
  outline-offset: 2px;
}

.bara-map__tip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 18rem;
}

.bara-map__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-3);
  margin-top: var(--bara-space-2);
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xs);
}
.bara-map__legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--bara-space-1);
}
.bara-map__legend-line {
  width: 24px;
  height: 4px;
}
</style>
