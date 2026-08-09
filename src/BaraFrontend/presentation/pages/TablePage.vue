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
import { NRadioGroup, NRadioButton, NInput, NAlert, NEmpty, NSkeleton } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { canRead } from '../../data/db-gateway';
import { readPage, updateCell, type TableRow } from '../../data/repositories/table-repo';
import { getSheet } from '../../data/snapshot-repo';
import { replaceUserPlaceholders } from '../../data/persona';
import { t } from '../../i18n';
import { isEnumEditable } from '../../domain/enum-policy';
import { checkSheet, isRenderable } from '../../domain/sheet-health';
import { availableViews, resolveView, type ViewMode } from '../../domain/table-view-policy';
import { detectMapColumns } from '../../domain/map-layout';
import RowCard from '../components/RowCard.vue';
import RowTable from '../components/RowTable.vue';
import RowCalendar from '../components/RowCalendar.vue';
import RowMap from '../components/RowMap.vue';

const props = defineProps<{ sheetKey: string }>();

const ui = useUiStore();
const schema = useSchemaStore();

const rows = ref<TableRow[]>([]);
const total = ref(0);
const loading = ref(false);
const notReady = ref(false);
const keyword = ref('');

const sheet = computed(() => schema.get(props.sheetKey));

/**
 * 骨架屏只用于加载未完成。表已加载但没有数据行是**正常状态**（新开的
 * 存档大多数表都是空的），那种情况显示空态，不能让它一直假装在加载。
 */
const isLoading = computed(() => !schema.loaded);
/** 枚举候选值来自快照解析的 DDL CHECK 约束 */
const enums = computed(() => getSheet(props.sheetKey)?.enums ?? {});

/**
 * 其中哪些允许玩家改，由 QASmoke 挡位决定（见 domain/enum-policy）。
 * 默认挡位下只有 NPC 表的归档状态。
 */
const editableEnums = computed(() => {
  const name = sheet.value?.name ?? '';
  return Object.keys(enums.value).filter((col) => isEnumEditable(name, col, ui.qaSmoke));
});

/** 正在写入的列，用于禁用按钮避免重复提交 */
const pending = ref<string | null>(null);
const notice = ref<{ tone: 'success' | 'danger'; text: string } | null>(null);
/**
 * 日期列探测。日历视图**只对确实有日期列的表开放** ——
 * 给技能表挂一个日历切换毫无意义，还会让人以为功能坏了。
 */
const dateColumn = computed(() => {
  const cols = sheet.value?.headers ?? [];
  return cols.find((c) => c === '日期') ?? cols.find((c) => c.includes('日期')) ?? '';
});

/**
 * 坐标列探测。与日期列同理，只对确实有两列坐标的表开放地图 ——
 * 口径在 domain/map-layout，与视图策略和跨模板回归测试共用一份。
 */
const mapColumns = computed(() => detectMapColumns(sheet.value?.headers ?? []));

const VIEW_LABEL: Record<ViewMode, string> = {
  card: 'table.view.card',
  list: 'table.view.list',
  calendar: 'table.view.calendar',
  map: 'table.view.map',
};

/**
 * 可选视图由表决定：小日历表、小日记表只开放日历，地图表默认落到地图
 * （见 domain/table-view-policy）。只有一种时不渲染切换器 ——
 * 单选项的选择器只是噪声。
 */
const viewCaps = computed(() => ({
  hasDate: !!dateColumn.value,
  hasCoords: mapColumns.value !== null,
}));
const views = computed(() => availableViews(sheet.value?.name ?? '', viewCaps.value));
const viewOptions = computed(() =>
  views.value.map((v) => ({ label: t(VIEW_LABEL[v], ui.lang), value: v })),
);
/** 记忆的模式可能已不在可用范围内（换了模板 / 改了表名），需收敛 */
const viewMode = computed(() =>
  resolveView(sheet.value?.name ?? '', viewCaps.value, ui.tableViewMode(props.sheetKey)),
);

/**
 * 展示用的行 —— 把没展开的 `{{user}}` 换成玩家名。
 *
 * **只在渲染层做，不改仓储读出来的值。** 写回路径（枚举列）用的是
 * 枚举候选值与行号，不经过这里；若在仓储层替换，一次写回就会把玩家的
 * 真名固化进库，而库里本来存的是 `{{user}}`，换个 persona 就错了。
 *
 * 关键字过滤基于替换后的文本：搜「笹兵卫」应该能搜到那些写着 `{{user}}`
 * 的行 —— 玩家看到的是什么就该能搜到什么。
 */
const displayRows = computed(() =>
  rows.value.map((r) => ({
    ...r,
    cells: Object.fromEntries(
      Object.entries(r.cells).map(([k, v]) => [k, replaceUserPlaceholders(v)]),
    ),
  })),
);

/** 关键字过滤放前端：跨列模糊匹配用 SQL 写很难看，且单页数据量不大 */
const visibleRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return displayRows.value;
  return displayRows.value.filter((r) =>
    Object.values(r.cells).some((v) => String(v ?? '').toLowerCase().includes(kw)),
  );
});

const rangeText = computed(() =>
  visibleRows.value.length === 0 ? '0-0' : `1-${visibleRows.value.length}`,
);

/**
 * 结构判定。**只在加载完成后判**：加载中表头本来就还没有，
 * 那时报「读不到表头」是错的。
 */
const health = computed(() => checkSheet(sheet.value?.headers));
/** 结构坏到渲染不出内容 —— 此时必须说明原因，不能留空白或空卡片 */
const isBroken = computed(() => schema.loaded && !isRenderable(health.value));
/** 列名退化成英文：内容仍可看，只作提醒，不挡住表格 */
const isSqlHeaders = computed(() => schema.loaded && health.value.kind === 'sql_headers');

const brokenReason = computed(() => {
  const key =
    health.value.kind === 'no_headers'
      ? 'table.broken.noHeaders'
      : health.value.kind === 'only_row_id'
        ? 'table.broken.onlyRowId'
        : 'table.broken.sqlHeaders';
  return t(key, ui.lang);
});

/** 实际列名要展示出来 —— 这是用户判断「该用哪份模板」的唯一依据 */
const columnsText = computed(() =>
  t('table.broken.columns', ui.lang, { columns: health.value.dataColumns.join('、') || '—' }),
);

function load(): void {
  const s = sheet.value;
  if (!s) return;
  if (!canRead()) {
    notReady.value = true;
    rows.value = [];
    return;
  }
  notReady.value = false;
  loading.value = true;
  try {
    const page = readPage(props.sheetKey, ui.pageSize, 0);
    rows.value = page?.rows ?? [];
    total.value = page?.total ?? 0;
  } finally {
    loading.value = false;
  }
}

watch(() => props.sheetKey, load, { immediate: true });
watch(() => ui.pageSize, load);
// 表数据被外部改动（AI 填表等）后同步刷新
watch(() => schema.sheets, load);

/**
 * 写入枚举列。
 *
 * 写入后必须重新读取 —— 快照是值拷贝，不重载界面仍显示旧值。
 * 失败时给出可见提示而非静默，用户才知道该重试。
 */
async function onSetCell(rowIndex: number, label: string, value: string): Promise<void> {
  const s = getSheet(props.sheetKey);
  if (!s || pending.value) return;
  // 二次把关：界面不该发出这个请求，但写入是不可撤销的，不能只靠界面拦
  if (!isEnumEditable(s.name, label, ui.qaSmoke)) return;

  pending.value = label;
  notice.value = null;
  try {
    const result = await updateCell(s, rowIndex, label, value);
    if (result.ok) {
      notice.value = { tone: 'success', text: t('table.saved', ui.lang, { label, value }) };
      schema.reload();
      load();
    } else {
      notice.value = { tone: 'danger', text: result.failure.message };
    }
  } finally {
    pending.value = null;
  }
}
</script>

<template>
  <div>
    <div class="bara-tbl__bar">
      <span class="bara-tbl__count">
        {{ t('table.count', ui.lang, { range: rangeText, total }) }}
      </span>

      <div class="bara-tbl__ctrls">
        <NRadioGroup
          v-if="views.length > 1"
          :value="viewMode"
          size="small"
          @update:value="(v: string) => ui.setTableViewMode(props.sheetKey, v as ViewMode)"
        >
          <NRadioButton v-for="o in viewOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
        <NInput
          v-model:value="keyword"
          type="text"
          :placeholder="t('table.search', ui.lang)"
          size="small"
          clearable
          class="bara-tbl__search"
        />
      </div>
    </div>

    <NAlert v-if="notReady" type="warning" class="bara-tbl__alert">
      {{ t('error.dbNotReady', ui.lang) }}
    </NAlert>

    <NAlert
      v-if="notice"
      :type="notice.tone === 'danger' ? 'error' : 'success'"
      class="bara-tbl__alert"
    >
      {{ notice.text }}
    </NAlert>

    <!--
      结构失配的提醒。列名退化成英文时表格照常显示，只在上方加一条说明 ——
      内容看得见，挡住反而是帮倒忙。
    -->
    <NAlert
      v-if="isSqlHeaders"
      type="warning"
      :title="t('table.broken.title', ui.lang)"
      class="bara-tbl__alert"
    >
      {{ brokenReason }}
    </NAlert>

    <div>
      <div v-if="isLoading" class="bara-tbl__skeleton">
        <NSkeleton v-for="i in 4" :key="i" text :repeat="3" />
      </div>

      <!--
        结构坏到渲染不出内容：说清楚是什么情况、实际列名是什么。
        改造前这里会渲染出一叠只有内边距和 #1 角标的空卡片 ——
        有高度、无内容、无任何说明，用户完全无从判断发生了什么。
      -->
      <NAlert
        v-else-if="isBroken"
        type="warning"
        :title="t('table.broken.title', ui.lang)"
        class="bara-tbl__alert"
      >
        <p class="bara-tbl__broken-line">{{ brokenReason }}</p>
        <p class="bara-tbl__broken-cols">{{ columnsText }}</p>
      </NAlert>

      <NEmpty
        v-else-if="!loading && visibleRows.length === 0"
        size="small"
        :description="sheet?.name ?? ''"
      />

      <div v-else-if="viewMode === 'card'" class="bara-tbl__cards">
        <RowCard
          v-for="(row, i) in visibleRows"
          :key="row.rowIndex"
          :row="row"
          :columns="sheet?.headers ?? []"
          :index="i + 1"
          :enums="enums"
          :editable-enums="editableEnums"
          :pending="pending"
          @set-cell="onSetCell"
        />
      </div>

      <RowCalendar
        v-else-if="viewMode === 'calendar'"
        :rows="visibleRows"
        :columns="sheet?.headers ?? []"
        :date-column="dateColumn"
        :lang="ui.lang"
      />

      <RowMap
        v-else-if="viewMode === 'map' && mapColumns"
        :rows="visibleRows"
        :columns="sheet?.headers ?? []"
        :name-column="mapColumns.name"
        :x-column="mapColumns.x"
        :y-column="mapColumns.y"
        :adjacency-column="mapColumns.adjacency"
        :lang="ui.lang"
      />

      <RowTable v-else :rows="visibleRows" :columns="sheet?.headers ?? []" />
    </div>
  </div>
</template>

<style scoped>
.bara-tbl__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-4);
  flex-wrap: wrap;
  margin-bottom: var(--bara-space-5);
}
.bara-tbl__ctrls { display: flex; align-items: center; gap: var(--bara-space-3); }
.bara-tbl__count {
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text-muted);
  font-family: var(--bara-font-family-mono);
}
.bara-tbl__alert { margin-bottom: var(--bara-space-4); }
.bara-tbl__broken-line { margin: 0; }
/*
 * 列名用等宽字体并允许换行：它是给人比对的原始数据，
 * 截断了就失去了作用（表可能有二十几列）。
 */
.bara-tbl__broken-cols {
  margin: var(--bara-space-2) 0 0;
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
  word-break: break-word;
}
/* 骨架按卡片视图的密度铺，加载完成时视觉重心不跳 */
.bara-tbl__skeleton {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--bara-space-4);
}
@media (min-width: 900px) { .bara-tbl__skeleton { grid-template-columns: repeat(2, 1fr); } }
.bara-tbl__search { width: 11rem; }
.bara-tbl__cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--bara-space-4);
}
@media (min-width: 900px) { .bara-tbl__cards { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1300px) { .bara-tbl__cards { grid-template-columns: repeat(3, 1fr); } }
</style>
