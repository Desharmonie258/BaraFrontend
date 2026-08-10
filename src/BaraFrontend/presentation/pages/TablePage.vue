<script setup lang="ts">
/**
 * 表格视图（§8.9d）—— 每张表一个目的地，共用同一组件。
 *
 * 卡片模式为默认：本项目的表普遍偏宽（重要角色心理 44 列、生理 27 列），
 * 网格模式在窄屏必然横向溢出。卡片把横向的列压成纵向字段列表。
 *
 * 模式选择按表记忆 —— 不同表适合的模式不同，全局设置一刀切不合适。
 *
 * ## 手改分两档（1.11）
 *
 * - **平时**：只有 `domain/enum-policy` 放行的枚举列可点（默认仅 NPC 表的
 *   归档状态）。这是 1.1 起的行为，不该因为多了编辑功能就变样。
 * - **编辑模式**：整张表每一格都能改，还能加行删行。
 *
 * 分两档而不是一律放开，是因为绝大多数时候用户在**看**表。满屏输入框会把
 * 浏览变成填表单，也让人分不清哪些值是 AI 写的、哪些是自己改的。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  NRadioGroup, NRadioButton, NInput, NAlert, NEmpty, NSkeleton, NButton, NIcon, NPopconfirm,
} from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { canRead } from '../../data/db-gateway';
import { readAll, readPage, type TableRow } from '../../data/repositories/table-repo';
import { canEdit, writeCell, addRow, removeRow } from '../../data/repositories/cell-editor';
import { watchGeneration, isGenerating, onGenerationChange } from '../../data/generation-watch';
import { ICONS } from '../icons';
import { getSheet } from '../../data/snapshot-repo';
import { replaceUserPlaceholders } from '../../data/persona';
import { t } from '../../i18n';
import { isEnumEditable } from '../../domain/enum-policy';
import { checkSheet, isRenderable } from '../../domain/sheet-health';
import { availableViews, resolveView, type ViewMode } from '../../domain/table-view-policy';
import {
  detectMapColumns, detectHierarchy, resolveLanding, type MapLevel,
} from '../../domain/map-layout';
import { currentRegions } from '../../data/repositories/global-repo';
import { actionsForSheet, type ActionItem } from '../../domain/interaction-rules';
import { activeActions } from '../../data/action-preset-store';
import { runAction, previewAction } from '../../data/repositories/interaction-runner';
import RowCard from '../components/RowCard.vue';
import RowTable from '../components/RowTable.vue';
import RowCalendar from '../components/RowCalendar.vue';
import RowMap from '../components/RowMap.vue';

const props = defineProps<{ sheetKey: string }>();

const ui = useUiStore();
const schema = useSchemaStore();

const rows = ref<TableRow[]>([]);
/**
 * 地图视图专用的整表行。
 *
 * 地图不能吃分页与关键字过滤后的行，那会同时砍掉两样东西：
 *
 * - **下层的点** —— 概览行按 row_id 排在前面、详细地点不断追加在后面，
 *   一旦总行数超过一页，下钻到详细地点就是一张空图
 * - **边** —— `collectEdges` 要求一条边两端都在点集里（否则会画出悬空线），
 *   对端只要落在页外，整条接壤关系就消失
 *
 * 两者都不是「少看几行」，而是功能看起来坏了，所以地图单独整表读。
 * 只有确实是地图表才读，别的表不必多拷一份全量数据。
 */
const mapRows = ref<TableRow[]>([]);
const total = ref(0);
const loading = ref(false);
const notReady = ref(false);
const keyword = ref('');

/* ── 手改（1.11）─────────────────────────────────────────── */

const writable = ref(false);
/** AI 正在生成 —— 这一轮的表格更新会盖掉手改，编辑入口先收起来 */
const generating = ref(false);
/** 编辑模式。**按表记忆没有意义** —— 它是一次操作的状态，不是偏好 */
const editMode = ref(false);

/** 编辑入口开不开：写入通道在，且 AI 没在生成 */
const canEditNow = computed(() => writable.value && !generating.value);

/* 不能改了就退出编辑态，否则留着一屏改不动的输入框 */
watch(canEditNow, (v) => { if (!v) editMode.value = false; });
/* 换表时也退出：上一张表的编辑态跟到新表上是纯粹的意外 */
watch(() => props.sheetKey, () => { editMode.value = false; });

let stopWatchGeneration: (() => void) | null = null;
onMounted(() => {
  watchGeneration();
  generating.value = isGenerating();
  stopWatchGeneration = onGenerationChange((v) => {
    generating.value = v;
    // 生成结束意味着 AI 刚写完表，这时重读才看得到新数据
    if (!v) load();
  });
});
onBeforeUnmount(() => stopWatchGeneration?.());

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

/**
 * 地图的落地层级 —— 打开时停在玩家脚下那一层，而不是世界层。
 *
 * 依赖 mapRows：层级里一个点都没有时要逐级往上降（见 resolveLanding），
 * 而那要拿真实数据判断。无层级列的表（本地地图表）不需要落地层级。
 */
const mapLanding = computed<MapLevel | undefined>(() => {
  const headers = sheet.value?.headers ?? [];
  const hierarchy = detectHierarchy(headers);
  if (!hierarchy || mapRows.value.length === 0) return undefined;
  return resolveLanding(mapRows.value, hierarchy, currentRegions());
});

/**
 * 这张表可执行的交互动作（1.11）。
 *
 * 按表名匹配一次，整表共用 —— 每行再算一遍是把同一件事做 50 遍。
 * 附表（角色资源表这类）与没有规则命中的表返回空数组，按钮整列不出现。
 */
const rowActions = computed<ActionItem[]>(() =>
  actionsForSheet(activeActions(), sheet.value?.name ?? ''),
);

/** 执行一个动作。与交互总览走同一条链路（data/interaction-runner）。 */
async function onAct(action: ActionItem, name: string): Promise<void> {
  if (!name) return;
  notice.value = null;
  const result = await runAction(action, name, ui.suggestAutoSend);

  if (!result.ok) {
    notice.value = {
      tone: 'danger',
      text: t(result.reason === 'no_composer' ? 'suggest.noComposer' : 'suggest.failed', ui.lang),
    };
    return;
  }
  notice.value = {
    tone: 'success',
    text:
      result.mode === 'sent'
        ? t('suggest.sent', ui.lang, { text: result.text })
        : t('suggest.filled', ui.lang),
  };
}

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

/* 地图画的是整表，计数就得跟着报整表 —— 报「1-50」会让人以为图上少了东西 */
const rangeText = computed(() => {
  const n = viewMode.value === 'map' ? mapRows.value.length : visibleRows.value.length;
  return n === 0 ? '0-0' : `1-${n}`;
});

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
    mapRows.value = [];
    return;
  }
  notReady.value = false;
  loading.value = true;
  try {
    const page = readPage(props.sheetKey, ui.pageSize, 0);
    rows.value = page?.rows ?? [];
    total.value = page?.total ?? 0;
    mapRows.value = mapColumns.value ? (readAll(props.sheetKey)?.rows ?? []) : [];
    writable.value = canEdit();
  } finally {
    loading.value = false;
  }
}

watch(() => props.sheetKey, load, { immediate: true });
watch(() => ui.pageSize, load);
// 表数据被外部改动（AI 填表等）后同步刷新
watch(() => schema.sheets, load);

/** 字段标识。同名列会出现在多行里，只用列名做 pending 会让整列一起转圈 */
function fieldKey(rowIndex: number, label: string): string {
  return `${rowIndex}#${label}`;
}

/**
 * 跑一次写入。
 *
 * 写入后必须重新读取 —— 快照是值拷贝，不重载界面仍显示旧值，
 * 而「界面显示已改、库里其实没改」是最难察觉的一类错：它不报错。
 *
 * 串行：`pending` 占位期间不接第二次请求。
 */
async function runWrite(
  key: string,
  action: () => Promise<{ ok: true; baselineStale: boolean } | { ok: false; message: string }>,
  successText?: string,
): Promise<void> {
  if (pending.value) return;
  pending.value = key;
  notice.value = null;
  try {
    const result = await action();
    if (result.ok) {
      schema.reload();
      load();
      notice.value = result.baselineStale
        ? { tone: 'danger', text: t('card.editBaselineStale', ui.lang) }
        : successText
          ? { tone: 'success', text: successText }
          : null;
    } else {
      notice.value = { tone: 'danger', text: result.message };
    }
  } finally {
    pending.value = null;
  }
}

/**
 * 改一个格子。
 *
 * 平时只放行 `enum-policy` 认可的枚举列（1.1 起的行为）；编辑模式下整张表
 * 都能改。两档都在这里把关 —— 界面不该发出越权的请求，但写入不可撤销，
 * 不能只靠界面拦。
 */
function onSetCell(rowIndex: number, label: string, value: string): void {
  const s = getSheet(props.sheetKey);
  if (!s) return;
  if (!editMode.value && !isEnumEditable(s.name, label, ui.qaSmoke)) return;
  if (editMode.value && !canEditNow.value) return;

  void runWrite(
    fieldKey(rowIndex, label),
    () => writeCell({ sheetName: s.name, rowIndex, column: label }, value),
    t('table.saved', ui.lang, { label, value }),
  );
}

/**
 * 表尾追加一行。**全空行** —— 各表的必填列千差万别，在这里猜要填什么
 * 只会猜错；加完就地改比先弹一个不知道该填什么的表单顺手。
 */
function onAddRow(): void {
  const s = getSheet(props.sheetKey);
  if (!s || !canEditNow.value) return;
  void runWrite('add', () => addRow(s.name, {}), t('table.rowAdded', ui.lang));
}

/** 删一行。不可撤销，界面上已经过二次确认。 */
function onRemoveRow(rowIndex: number): void {
  const s = getSheet(props.sheetKey);
  if (!s || !canEditNow.value) return;
  void runWrite(
    fieldKey(rowIndex, 'remove'),
    () => removeRow(s.name, rowIndex),
    t('table.rowRemoved', ui.lang),
  );
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
        <!--
          编辑开关。写入通道不可用、或 AI 正在生成时整个不出现 ——
          给一个点了没用的按钮比没有按钮更糟。
          地图与日历视图下也不出现：那两种视图画的是聚合结果，不是行。
        -->
        <NButton
          v-if="canEditNow && (viewMode === 'card' || viewMode === 'list')"
          size="small"
          :type="editMode ? 'primary' : 'default'"
          :quaternary="!editMode"
          :title="t(editMode ? 'table.editDone' : 'table.edit', ui.lang)"
          :aria-pressed="editMode"
          @click="editMode = !editMode"
        >
          <template #icon>
            <NIcon :component="editMode ? ICONS.ok : ICONS.edit" />
          </template>
        </NButton>

        <NButton
          v-if="editMode"
          size="small"
          :loading="pending === 'add'"
          @click="onAddRow"
        >
          {{ t('table.addRow', ui.lang) }}
        </NButton>

        <!-- 地图视图不吃关键字（过滤会砍掉边的对端），就别摆一个不生效的搜索框 -->
        <NInput
          v-if="viewMode !== 'map'"
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
          :edit-mode="editMode"
          :actions="rowActions"
          :action-preview="previewAction"
          :lang="ui.lang"
          @set-cell="onSetCell"
          @remove="onRemoveRow"
          @act="onAct"
        />
      </div>

      <RowCalendar
        v-else-if="viewMode === 'calendar'"
        :rows="visibleRows"
        :columns="sheet?.headers ?? []"
        :date-column="dateColumn"
        :lang="ui.lang"
      />

      <!-- 地图走整表：分页会砍掉下层的点与边的对端，见 mapRows 的说明 -->
      <RowMap
        v-else-if="viewMode === 'map' && mapColumns"
        :rows="mapRows"
        :columns="sheet?.headers ?? []"
        :name-column="mapColumns.name"
        :x-column="mapColumns.x"
        :y-column="mapColumns.y"
        :adjacency-column="mapColumns.adjacency"
        :initial-level="mapLanding"
        :lang="ui.lang"
      />

      <RowTable
        v-else
        :rows="visibleRows"
        :columns="sheet?.headers ?? []"
        :edit-mode="editMode"
        :enums="enums"
        :pending="pending"
        :actions="rowActions"
        :action-preview="previewAction"
        :lang="ui.lang"
        @set-cell="onSetCell"
        @remove="onRemoveRow"
        @act="onAct"
      />
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
