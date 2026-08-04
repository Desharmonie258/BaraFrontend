<script setup lang="ts">
/**
 * 行表格 —— 传统网格视图，适合宽屏下横向比较多行。
 *
 * 宽表在此模式下必然横向溢出，因此**容器自身横向滚动**，
 * 而不是让页面横向滚动（§8.12：页面 body 永远不横向滚动）。
 */
import type { ColumnMeta } from '../../stores/schema-store';
import type { TableRow } from '../../data/repositories/table-repo';

defineProps<{
  rows: TableRow[];
  columns: ColumnMeta[];
}>();

function display(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}
</script>

<template>
  <div class="bara-row-table">
    <table>
      <thead>
        <tr>
          <!-- 列名不翻译：它属于用户的模板数据（§8.7c） -->
          <th v-for="c in columns" :key="c.db">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="row.rowId ?? i">
          <td v-for="c in columns" :key="c.db" :title="display(row.cells[c.label])">
            {{ display(row.cells[c.label]) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.bara-row-table {
  overflow-x: auto;
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
}
table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  font-size: var(--bara-font-size-sm);
}
th,
td {
  padding: var(--bara-space-2) var(--bara-space-3);
  border-bottom: var(--bara-border-width) solid var(--bara-color-divider);
  text-align: left;
  white-space: nowrap;
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
th {
  position: sticky;
  top: 0;
  background: var(--bara-color-surface-sunken);
  color: var(--bara-color-text-muted);
  font-weight: var(--bara-font-weight-medium);
  white-space: nowrap;
}
tbody tr:hover { background: var(--bara-color-hover); }
tbody tr:last-child td { border-bottom: none; }
td { color: var(--bara-color-text); }
</style>
