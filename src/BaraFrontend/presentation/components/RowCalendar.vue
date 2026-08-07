<script setup lang="ts">
/**
 * 日历视图 —— 把带日期列的表按月铺开。
 *
 * 只对**确实有日期列**的表开放（小日历表、小日记表）。给技能表挂一个
 * 日历切换是没有意义的，因此可用性由上层按列判断，不在这里兜底。
 *
 * ## 「今天」指的是剧情里的今天
 *
 * 日期是架空纪年（如 1568-11-13），与现实日期差着几百年。NCalendar
 * 内置的「今天」按钮跳到的是**现实世界的今天**，在这里点一下就跳进一个
 * 永远空白的月份 —— 因此把它隐藏，换成自己的一组导航。
 *
 * 剧情当前日的取法，按可靠性从高到低：
 *   1. 表里 `与今天的关系` 为「今天」的那一行（小日历表有这一列）
 *   2. 最新的一条记录（小日记表没有关系列，只能这样推）
 *   3. 最早的一条（前两者都取不到时，至少落在有内容的月份）
 *
 * NCalendar 的月份是内部状态，没有受控入口，因此靠 `:key` 重挂来跳转。
 */
import { computed, ref, watch } from 'vue';
import { NCalendar, NButton, NButtonGroup, NIcon } from 'naive-ui';
import type { TableRow } from '../../data/repositories/table-repo';
import type { Lang } from '../../stores/ui-store';
import { t } from '../../i18n';
import { ICONS } from '../icons';
import { parseDate, findStoryToday } from '../../domain/story-date';

const props = defineProps<{
  rows: TableRow[];
  columns: string[];
  /** 日期列的展示名，由上层探测后传入 */
  dateColumn: string;
  lang: Lang;
}>();

/**
 * 摘要列的优先级。日历格子放不下整行，只显示一列。
 * 找不到时退到日期列之后的第一个非空列 —— 总比显示空格子好。
 */
const SUMMARY_HINTS = ['大事件', '事件', '内容', '摘要', '标题'];

const summaryColumn = computed(() => {
  const hit = SUMMARY_HINTS.find((h) => props.columns.includes(h));
  if (hit) return hit;
  const rest = props.columns.filter((c) => c !== 'row_id' && c !== props.dateColumn);
  return rest[0] ?? '';
});

interface DayEntry {
  rowIndex: number;
  summary: string;
}

/** 按 `年-月-日` 建索引。月份用 1-12，与 NCalendar 插槽给的口径一致。 */
const byDay = computed(() => {
  const map = new Map<string, DayEntry[]>();
  for (const row of props.rows) {
    const p = parseDate(row.cells[props.dateColumn]);
    if (!p) continue;
    const key = `${p.y}-${p.m}-${p.d}`;
    const entry = {
      rowIndex: row.rowIndex,
      summary: String(row.cells[summaryColumn.value] ?? '').trim(),
    };
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  return map;
});

function entriesOf(year: number, month: number, date: number): DayEntry[] {
  return byDay.value.get(`${year}-${month}-${date}`) ?? [];
}

/**
 * 剧情当前日的时间戳。
 *
 * 架空纪年的时间戳是负数，JS 的 Date 支持这个范围，NCalendar 的月历
 * 计算也不受影响。全表无有效日期时返回 null，此时不渲染跳转按钮 ——
 * 一个点了没反应的按钮比没有按钮更糟。
 */
const storyToday = computed<number | null>(() =>
  findStoryToday(props.rows, props.columns, props.dateColumn),
);

/**
 * 当前显示的月份。NCalendar 的月份是内部状态、没有受控 prop，
 * 因此把它当作 `:key` 用：值一变就重挂一个新实例，落在新的月份上。
 */
const monthTs = ref<number>(storyToday.value ?? Date.now());
watch(storyToday, (ts) => {
  if (ts !== null) monthTs.value = ts;
});

function shiftMonth(delta: number): void {
  const d = new Date(monthTs.value);
  monthTs.value = new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
}

function backToToday(): void {
  if (storyToday.value !== null) monthTs.value = storyToday.value;
}

/** 标题按剧情纪年直接拼，不走 toLocaleString —— 那会按公历习惯改写年份 */
const monthLabel = computed(() => {
  const d = new Date(monthTs.value);
  return `${d.getFullYear()} / ${String(d.getMonth() + 1).padStart(2, '0')}`;
});

const selected = ref<number | null>(null);
</script>

<template>
  <div class="bara-cal">
    <NCalendar
      :key="monthTs"
      v-model:value="selected"
      :default-value="monthTs"
      class="bara-cal__grid"
    >
      <!--
        头部：内置的「今天」跳现实日期，已用 CSS 隐藏整组内置导航，
        这里用标题插槽把自己的一组放回同一行。
      -->
      <template #header>
        <div class="bara-cal__head">
          <span class="bara-cal__month">{{ monthLabel }}</span>
          <NButtonGroup size="small">
            <NButton :title="t('calendar.prev', lang)" @click="shiftMonth(-1)">
              <template #icon><NIcon :component="ICONS.collapse" /></template>
            </NButton>
            <NButton v-if="storyToday !== null" @click="backToToday()">
              {{ t('calendar.storyToday', lang) }}
            </NButton>
            <NButton :title="t('calendar.next', lang)" @click="shiftMonth(1)">
              <template #icon><NIcon :component="ICONS.expand" /></template>
            </NButton>
          </NButtonGroup>
        </div>
      </template>

      <template #default="{ year, month, date }">
        <ul class="bara-cal__list">
          <li
            v-for="e in entriesOf(year, month, date)"
            :key="e.rowIndex"
            class="bara-cal__entry"
            :title="e.summary"
          >
            {{ e.summary || '—' }}
          </li>
        </ul>
      </template>
    </NCalendar>
  </div>
</template>

<style scoped>
.bara-cal { width: 100%; }
/*
 * 给日历一个下限高度。格子太矮时条目会被裁掉，而条目正是这个视图
 * 唯一的信息来源 —— 宁可让容器滚动，也不裁内容。
 */
.bara-cal__grid { min-height: 26rem; }

/*
 * 隐藏内置导航（‹ 今天 ›）。它的「今天」跳的是现实日期，
 * 在架空纪年里点一下就落进一个永远空白的月份。
 */
.bara-cal__grid :deep(.n-calendar-header__extra) { display: none; }
/* 标题插槽要占满整行，自己的导航才能靠右 */
.bara-cal__grid :deep(.n-calendar-header__title) { flex: 1 1 auto; }

.bara-cal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-3);
  width: 100%;
}
.bara-cal__month { font-family: var(--bara-font-family-mono); }

.bara-cal__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* 完整显示优先：格子里也换行，长条目把当日格子撑高即可 */
.bara-cal__entry {
  padding: 1px var(--bara-space-1);
  border-radius: var(--bara-radius-sm);
  background: var(--bara-color-primary-soft);
  color: var(--bara-color-primary);
  font-size: var(--bara-font-size-xs);
  line-height: var(--bara-line-height-tight);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
