<script setup lang="ts">
/**
 * 行表格 —— 传统网格视图，适合宽屏下横向比较多行。
 *
 * 用 NTable 而非自绘：它是「给原生表格标记加样式」的壳，语义结构
 * 仍是 thead/tbody/th/td，不像 NDataTable 那样接管数据与虚拟滚动。
 * 本项目的数据已由快照整理好，不需要再套一层数据层。
 *
 * 宽表在此模式下必然横向溢出，因此**容器自身横向滚动**，
 * 而不是让页面横向滚动（§8.12：页面 body 永远不横向滚动）。
 */
import { NTable } from 'naive-ui';
import type { TableRow } from '../../data/repositories/table-repo';

defineProps<{
  rows: TableRow[];
  columns: string[];
}>();
</script>

<template>
  <div class="bara-row-table">
    <NTable size="small" :bordered="false" :single-line="false" striped>
      <thead>
        <tr>
          <!-- 列名不翻译：它属于用户的模板数据（§8.7c） -->
          <th v-for="c in columns" :key="c">{{ c }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.rowIndex">
          <td v-for="c in columns" :key="c" :title="row.cells[c]">
            {{ row.cells[c] }}
          </td>
        </tr>
      </tbody>
    </NTable>
  </div>
</template>

<style scoped>
.bara-row-table {
  overflow-x: auto;
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
}

/*
 * 换行与表头吸顶是 NTable 不管的部分，需自行补上。
 * 用 :deep 是因为这些元素由插槽内容渲染，scoped 属性到不了 NTable 内部。
 */
.bara-row-table :deep(table) {
  width: max-content;
  min-width: 100%;
}
/*
 * **完整显示优先于版面整齐**：不截断、不省略。
 * 给列一个宽度区间 —— 下限避免窄列被挤成一字一行，
 * 上限避免长文本列独占整个视口把其余列推到屏外。
 */
.bara-row-table :deep(th),
.bara-row-table :deep(td) {
  min-width: 6rem;
  max-width: 24rem;
  white-space: pre-wrap;
  word-break: break-word;
  vertical-align: top;
}
/* 表头吸顶：宽表往下滚时列名必须一直可见，否则读不出哪列是哪列 */
.bara-row-table :deep(th) {
  position: sticky;
  top: 0;
  z-index: 1;
}
</style>
