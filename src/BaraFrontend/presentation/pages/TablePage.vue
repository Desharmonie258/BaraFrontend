<script setup lang="ts">
/**
 * 表格视图（§8.9d）—— 每张表一个目的地，共用同一组件。
 *
 * 卡片模式为默认：本项目的表普遍偏宽（重要角色心理 44 列、生理 27 列），
 * 网格模式在窄屏必然横向溢出。卡片把横向的列压成纵向字段列表。
 *
 * 模式选择按表记忆 —— 不同表适合的模式不同，全局设置一刀切不合适。
 */
import { computed, ref, watch } from 'vue';
import { NInput, NRadioGroup, NRadioButton, NEmpty, NText, NSpin, NAlert } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { isSqlReady } from '../../data/db-gateway';
import { readPage, type TableRow } from '../../data/repositories/table-repo';
import { t } from '../../i18n';
import RowCard from '../components/RowCard.vue';
import RowTable from '../components/RowTable.vue';

const props = defineProps<{ sheetKey: string }>();

const ui = useUiStore();
const schema = useSchemaStore();

const PAGE_SIZE = 50;
const rows = ref<TableRow[]>([]);
const total = ref(0);
const loading = ref(false);
const notReady = ref(false);
const keyword = ref('');

const sheet = computed(() => schema.get(props.sheetKey));
const viewMode = computed(() => ui.tableViewMode(props.sheetKey));

/** 关键字过滤放前端：跨列模糊匹配用 SQL 写很难看，且单页数据量不大 */
const visibleRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return rows.value;
  return rows.value.filter((r) =>
    Object.values(r.cells).some((v) => String(v ?? '').toLowerCase().includes(kw)),
  );
});

const rangeText = computed(() =>
  visibleRows.value.length === 0 ? '0-0' : `1-${visibleRows.value.length}`,
);

function load(): void {
  const s = sheet.value;
  if (!s) return;
  if (!isSqlReady()) {
    notReady.value = true;
    rows.value = [];
    return;
  }
  notReady.value = false;
  loading.value = true;
  try {
    const page = readPage(s, PAGE_SIZE, 0);
    rows.value = page?.rows ?? [];
    total.value = page?.total ?? 0;
  } finally {
    loading.value = false;
  }
}

watch(() => props.sheetKey, load, { immediate: true });
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
      <NText depth="3">
        {{ t('table.count', ui.lang, { range: rangeText, total }) }}
      </NText>

      <div class="flex items-center gap-2">
        <NRadioGroup
          :value="viewMode"
          size="small"
          @update:value="(v: 'card' | 'list') => ui.setTableViewMode(props.sheetKey, v)"
        >
          <NRadioButton value="card">{{ t('table.view.card', ui.lang) }}</NRadioButton>
          <NRadioButton value="list">{{ t('table.view.list', ui.lang) }}</NRadioButton>
        </NRadioGroup>
        <NInput
          v-model:value="keyword"
          size="small"
          clearable
          :placeholder="t('table.search', ui.lang)"
          class="w-44"
        />
      </div>
    </div>

    <NAlert v-if="notReady" type="warning" :bordered="false" class="mb-3">
      {{ t('error.dbNotReady', ui.lang) }}
    </NAlert>

    <NSpin :show="loading">
      <NEmpty
        v-if="!loading && visibleRows.length === 0"
        size="small"
        :description="sheet?.name ?? '—'"
      />

      <div
        v-else-if="viewMode === 'card'"
        class="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3"
      >
        <RowCard
          v-for="(row, i) in visibleRows"
          :key="row.rowId ?? i"
          :row="row"
          :columns="sheet?.columns ?? []"
          :index="i + 1"
        />
      </div>

      <RowTable v-else :rows="visibleRows" :columns="sheet?.columns ?? []" />
    </NSpin>
  </div>
</template>
