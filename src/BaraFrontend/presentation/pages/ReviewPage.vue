<script setup lang="ts">
/**
 * 变更审核 —— 列出「上次确认之后」AI 改了什么。
 *
 * 移植自骰子系统的审核面板。核心不是界面而是**基线的语义**：
 * 基线停在上一次确认的状态，只有用户点「确认」才前移。自动跟随当前
 * 数据的话永远比不出东西，这个面板就没有意义了。
 */
import { computed, ref, watch } from 'vue';
import { NCard, NButton, NTag, NAlert, NEmpty, NCollapse, NCollapseItem } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { t } from '../../i18n';
import { readReview, captureBaseline, clearBaseline } from '../../data/repositories/review-repo';
import { groupByTable, type Change, type ChangeType } from '../../domain/review/diff';

const ui = useUiStore();
const schema = useSchemaStore();

const state = ref(readReview());
const notice = ref<{ tone: 'success' | 'warning'; text: string } | null>(null);

function reload(): void {
  state.value = readReview();
}
// 表数据被外部改动（AI 填表等）后重算
watch(() => schema.sheets, reload);

const groups = computed(() => groupByTable(state.value.changes));
/** 默认全部展开：审核的目的就是逐条看，收起来等于多点一次 */
const expanded = ref<string[]>([]);
watch(groups, (g) => (expanded.value = g.map((x) => x.tableName)), { immediate: true });

/** 变更类型的定性配色。与具体表无关，因此可以统一映射。 */
const TONE: Record<ChangeType, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  table_added: 'success',
  row_added: 'success',
  cell_modified: 'info',
  row_modified: 'info',
  row_deleted: 'warning',
  table_deleted: 'error',
  table_structure_changed: 'error',
};

function label(c: Change): string {
  return t(`review.type.${c.type}`, ui.lang);
}

function onConfirm(): void {
  notice.value = captureBaseline()
    ? { tone: 'success', text: t('review.captured', ui.lang) }
    : { tone: 'warning', text: t('error.dbNotReady', ui.lang) };
  reload();
}

function onClear(): void {
  clearBaseline();
  notice.value = null;
  reload();
}

const stamp = computed(() =>
  state.value.at ? new Date(state.value.at).toLocaleString() : '',
);
</script>

<template>
  <div class="bara-rev">
    <div class="bara-rev__bar">
      <span class="bara-rev__count">
        {{ t('review.count', ui.lang, { n: String(state.changes.length) }) }}
        <template v-if="stamp"> · {{ stamp }}</template>
      </span>
      <div class="bara-rev__actions">
        <NButton size="small" type="primary" @click="onConfirm()">
          {{ t(state.hasBaseline ? 'review.confirm' : 'review.capture', ui.lang) }}
        </NButton>
        <NButton v-if="state.hasBaseline" size="small" quaternary @click="onClear()">
          {{ t('review.clear', ui.lang) }}
        </NButton>
      </div>
    </div>

    <NAlert v-if="notice" :type="notice.tone" :bordered="false" class="bara-rev__notice">
      {{ notice.text }}
    </NAlert>

    <!-- 没有基线时说明它是什么，而不是显示一个空列表 -->
    <NAlert v-if="!state.hasBaseline" type="info" :bordered="false" class="bara-rev__notice">
      {{ t('review.noBaseline', ui.lang) }}
    </NAlert>

    <NEmpty
      v-else-if="!state.changes.length"
      size="small"
      :description="t('review.noChange', ui.lang)"
    />

    <NCollapse v-else v-model:expanded-names="expanded" :accordion="false">
      <NCollapseItem v-for="g in groups" :key="g.tableName" :name="g.tableName">
        <template #header>
          <!-- 表名取自模板，不翻译（§8.7c） -->
          <span class="bara-rev__table">{{ g.tableName }}</span>
        </template>
        <template #header-extra>
          <NTag size="tiny" :bordered="false">{{ g.items.length }}</NTag>
        </template>

        <ul class="bara-rev__list">
          <li v-for="(c, i) in g.items" :key="i" class="bara-rev__item">
            <div class="bara-rev__head">
              <NTag size="tiny" :type="TONE[c.type]" :bordered="false">{{ label(c) }}</NTag>
              <span v-if="c.title" class="bara-rev__title">{{ c.title }}</span>
            </div>

            <!-- 单字段改动：新旧并排，一眼看出改了什么 -->
            <div v-if="c.field" class="bara-rev__diff">
              <span class="bara-rev__field">{{ c.field.header }}</span>
              <span class="bara-rev__old">{{ c.field.oldValue || '—' }}</span>
              <span class="bara-rev__arrow">→</span>
              <span class="bara-rev__new">{{ c.field.newValue || '—' }}</span>
            </div>

            <div v-for="f in c.fields ?? []" :key="f.colIndex" class="bara-rev__diff">
              <span class="bara-rev__field">{{ f.header }}</span>
              <span class="bara-rev__old">{{ f.oldValue || '—' }}</span>
              <span class="bara-rev__arrow">→</span>
              <span class="bara-rev__new">{{ f.newValue || '—' }}</span>
            </div>
          </li>
        </ul>
      </NCollapseItem>
    </NCollapse>
  </div>
</template>

<style scoped>
.bara-rev { display: flex; flex-direction: column; gap: var(--bara-space-3); }

.bara-rev__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-4);
  flex-wrap: wrap;
}
.bara-rev__count {
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text-muted);
  font-family: var(--bara-font-family-mono);
}
.bara-rev__actions { display: flex; gap: var(--bara-space-2); }
.bara-rev__notice { margin: 0; }

.bara-rev__table { font-weight: var(--bara-font-weight-medium); }

.bara-rev__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-3);
}
.bara-rev__item {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-1);
}
.bara-rev__head {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
  flex-wrap: wrap;
}
.bara-rev__title {
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text);
  word-break: break-word;
}

/* 完整显示优先：新旧值都换行，不截断 —— 看不全就没法审 */
.bara-rev__diff {
  display: flex;
  align-items: baseline;
  gap: var(--bara-space-2);
  flex-wrap: wrap;
  font-size: var(--bara-font-size-xs);
  padding-left: var(--bara-space-3);
}
.bara-rev__field { color: var(--bara-color-text-muted); flex: none; }
.bara-rev__old {
  color: var(--bara-color-text-subtle);
  text-decoration: line-through;
  word-break: break-word;
}
.bara-rev__arrow { color: var(--bara-color-text-subtle); flex: none; }
.bara-rev__new { color: var(--bara-color-text); word-break: break-word; }
</style>
