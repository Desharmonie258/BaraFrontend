<script setup lang="ts">
/**
 * 行卡片 —— 一行数据渲染为一张卡，卡内按「字段名 + 值」纵向罗列。
 *
 * 这是宽表在窄屏下的主力形态：44 列的表用网格必然横向溢出，
 * 卡片把横向的列压成纵向字段列表（§8.9d）。
 *
 * 渲染规则：
 * - 空值字段**整条跳过**。宽表里大量列为空是常态，逐条显示「暂无」
 *   会把卡片撑成一屏噪声。
 * - 短值行内展示，长文本独占整段。
 */
import { computed } from 'vue';
import type { ColumnMeta } from '../../stores/schema-store';
import type { TableRow } from '../../data/repositories/table-repo';

const props = defineProps<{
  row: TableRow;
  columns: ColumnMeta[];
  index: number;
}>();

const LONG_TEXT_THRESHOLD = 24;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

/** 标题取 row_id 之后的第一列 —— 通常是姓名 / 名称 / 日期（§8.9d） */
const title = computed(() => {
  const titleCol = props.columns.find((c) => c.db !== 'row_id');
  const v = titleCol ? props.row.cells[titleCol.label] : null;
  return isEmpty(v) ? '—' : String(v);
});

const fields = computed(() =>
  props.columns
    .filter((c) => c.db !== 'row_id')
    .slice(1) // 首列已作标题
    .map((c) => ({ label: c.label, value: props.row.cells[c.label] }))
    .filter((f) => !isEmpty(f.value))
    .map((f) => ({
      ...f,
      text: String(f.value),
      long: String(f.value).length > LONG_TEXT_THRESHOLD,
    })),
);
</script>

<template>
  <article class="bara-row-card">
    <header class="bara-row-card__head">
      <span class="bara-row-card__idx">#{{ index }}</span>
      <h3 class="bara-row-card__title">{{ title }}</h3>
    </header>

    <dl class="bara-row-card__body">
      <template v-for="f in fields" :key="f.label">
        <div :class="f.long ? 'bara-field bara-field--block' : 'bara-field'">
          <dt class="bara-field__label">{{ f.label }}</dt>
          <dd class="bara-field__value">{{ f.text }}</dd>
        </div>
      </template>
    </dl>
  </article>
</template>

<style scoped>
.bara-row-card {
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-surface);
  overflow: hidden;
}
.bara-row-card__head {
  display: flex;
  align-items: center;
  gap: var(--bara-space-3);
  padding: var(--bara-space-3) var(--bara-space-4);
  border-bottom: var(--bara-border-width) solid var(--bara-color-divider);
  background: var(--bara-color-surface-sunken);
}
.bara-row-card__idx {
  flex: none;
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}
.bara-row-card__title {
  margin: 0;
  font-size: var(--bara-font-size-md);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bara-row-card__body {
  margin: 0;
  padding: var(--bara-space-3) var(--bara-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-2);
}

.bara-field {
  display: flex;
  align-items: baseline;
  gap: var(--bara-space-3);
  min-width: 0;
}
.bara-field--block { flex-direction: column; gap: var(--bara-space-1); }

.bara-field__label {
  flex: none;
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
}
.bara-field__value {
  margin: 0;
  min-width: 0;
  color: var(--bara-color-text);
  font-size: var(--bara-font-size-sm);
  /* 长文本按段落排版，用较宽的行高（§8.7d 的 relaxed） */
  word-break: break-word;
}
.bara-field--block .bara-field__value {
  line-height: var(--bara-line-height-relaxed);
  white-space: pre-wrap;
}
.bara-field:not(.bara-field--block) .bara-field__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
