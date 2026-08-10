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
 *
 * ## 编辑模式（1.11）
 *
 * 开着时每个格子都能就地改，并多出一列删行按钮。枚举列在这里**不做成
 * 一排选项** —— 网格里一格塞五个按钮会把列宽撑爆；用普通输入框，
 * 值写错了由数据库的 CHECK 约束挡下来，失败提示会说明原因。
 */
import { NTable, NButton, NIcon, NPopconfirm } from 'naive-ui';
import { ICONS } from '../icons';
import { t } from '../../i18n';
import type { Lang } from '../../stores/ui-store';
import EditableValue from './EditableValue.vue';
import type { ActionItem } from '../../domain/interaction-rules';
import type { TableRow } from '../../data/repositories/table-repo';

const props = defineProps<{
  rows: TableRow[];
  columns: string[];
  /** 编辑模式：每格可改，并多出删行列 */
  editMode?: boolean;
  /** 枚举列的候选值，仅用于给输入框提示合法取值 */
  enums?: Record<string, string[]>;
  /** 正在写入的字段标识（`行号#列名`） */
  pending?: string | null;
  /** 这一张表可执行的交互动作（1.11），整表共用一组 */
  actions?: ActionItem[];
  /** 动作最终会发出去的那句话，用作按钮 tooltip */
  actionPreview?: (action: ActionItem, name: string) => string;
  lang?: Lang;
}>();

const emit = defineEmits<{
  setCell: [rowIndex: number, label: string, value: string];
  remove: [rowIndex: number];
  act: [action: ActionItem, name: string];
}>();

/** 这一行的名字 —— 首列（除 row_id 外）。动作模板里的 `{Name}` 用它。 */
function nameOf(row: TableRow): string {
  const first = props.columns.find((c) => c !== 'row_id');
  return first ? String(row.cells[first] ?? '').trim() : '';
}

function fieldKey(rowIndex: number, label: string): string {
  return `${rowIndex}#${label}`;
}

/** 枚举列的合法取值，作为输入框的悬停提示 —— 免得改完才被 CHECK 挡下来 */
function hintOf(column: string): string | undefined {
  const options = props.enums?.[column];
  return options?.length ? options.join(' / ') : undefined;
}
</script>

<template>
  <div class="bara-row-table">
    <NTable size="small" :bordered="false" :single-line="false" striped>
      <thead>
        <tr>
          <!-- 列名不翻译：它属于用户的模板数据（§8.7c） -->
          <th v-for="c in columns" :key="c">{{ c }}</th>
          <th v-if="!editMode && actions?.length" class="bara-row-table__ops"></th>
          <th v-if="editMode" class="bara-row-table__ops"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.rowIndex">
          <td v-for="c in columns" :key="c" :title="hintOf(c) ?? row.cells[c]">
            <EditableValue
              v-if="editMode"
              :value="row.cells[c] ?? ''"
              :pending="pending === fieldKey(row.rowIndex, c)"
              @submit="(v) => emit('setCell', row.rowIndex, c, v)"
            />
            <template v-else>{{ row.cells[c] }}</template>
          </td>

          <!--
            动作列。编辑模式下不出现 —— 那时用户在改数据不是在做动作，
            两种意图混在同一行里容易误点。
          -->
          <td v-if="!editMode && actions?.length" class="bara-row-table__ops">
            <div class="bara-row-table__acts">
              <NButton
                v-for="a in actions"
                :key="a.label"
                size="tiny"
                secondary
                :disabled="!nameOf(row)"
                :title="actionPreview?.(a, nameOf(row)) ?? a.label"
                @click="emit('act', a, nameOf(row))"
              >
                {{ a.label }}
              </NButton>
            </div>
          </td>

          <td v-if="editMode" class="bara-row-table__ops">
            <NPopconfirm @positive-click="emit('remove', row.rowIndex)">
              <template #trigger>
                <NButton
                  size="tiny"
                  quaternary
                  :loading="pending === fieldKey(row.rowIndex, 'remove')"
                  :title="t('table.removeRow', lang ?? 'zh-CN')"
                >
                  <template #icon><NIcon :component="ICONS.fail" /></template>
                </NButton>
              </template>
              {{ t('table.removeRowConfirm', lang ?? 'zh-CN', { title: row.cells[columns[1]] || `#${row.rowIndex}` }) }}
            </NPopconfirm>
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

/* 动作按钮不换行：网格里每行一排按钮，换行会让行高参差不齐 */
.bara-row-table__acts {
  display: flex;
  gap: var(--bara-space-1);
  white-space: nowrap;
}

/* 操作列不参与等宽：它只有一个图标按钮，占 6rem 是浪费 */
.bara-row-table :deep(.bara-row-table__ops) {
  min-width: 0;
  width: 1%;
  white-space: nowrap;
}
</style>
