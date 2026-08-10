<script setup lang="ts">
/**
 * 物资清单（1.11）—— 物品或装备的一组行，可改可增可删。
 *
 * 1.1 这里只有一个计数。计数看得出「有没有」，看不出「有什么」，
 * 也没法改。
 *
 * ## 一行默认只显示名称与前两个字段
 *
 * 物品表有 6 列、装备表有 6 列，全摊开会让 20 件物品占满整屏，
 * 而仪表盘是「当前局面」的概览。展开才看全部，与角色卡「点开看详情」
 * 同一套节奏。
 *
 * ## 删除要确认
 *
 * 删行不可撤销，且没有回收站 —— AI 不会把删掉的东西写回来。
 * 用二次确认而不是「撤销」提示：撤销要留一份删掉的数据，
 * 而那份数据一旦与库不同步，恢复出来的就是错的。
 */
import { computed, ref, watch } from 'vue';
import { NButton, NIcon, NInput, NEmpty, NPopconfirm } from 'naive-ui';
import { ICONS } from '../icons';
import { t } from '../../i18n';
import type { Lang } from '../../stores/ui-store';
import type { SupplyList } from '../../data/repositories/supply-repo';
import EditableValue from './EditableValue.vue';

const props = defineProps<{
  list: SupplyList;
  lang: Lang;
  /** 写入通道可用时才给编辑与增删入口 */
  editable?: boolean;
  /** 正在写入的字段标识 */
  pending?: string | null;
  /** 空列表时的说明文案 */
  emptyText: string;
}>();

const emit = defineEmits<{
  setCell: [rowIndex: number, column: string, value: string];
  add: [name: string];
  remove: [rowIndex: number, name: string];
}>();

/** 展开的行。行号可能因为删行而错位，换表时一律收起 */
const expanded = ref<Set<number>>(new Set());
watch(() => props.list.sheetName, () => expanded.value = new Set());
watch(() => props.list.rows.length, () => expanded.value = new Set());

function toggle(rowIndex: number): void {
  const next = new Set(expanded.value);
  if (next.has(rowIndex)) next.delete(rowIndex);
  else next.add(rowIndex);
  expanded.value = next;
}

/** 收起时显示的字段：前两个有值的列。全空就只显示名字 */
function brief(row: SupplyList['rows'][number]): string[] {
  return props.list.columns
    .filter((c) => row.cells[c]?.trim())
    .slice(0, 2)
    .map((c) => row.cells[c]);
}

function fieldKey(rowIndex: number, column: string): string {
  return `${props.list.sheetName}#${rowIndex}#${column}`;
}

const adding = ref(false);
const draft = ref('');

function submitAdd(): void {
  const name = draft.value.trim();
  if (!name) return;
  emit('add', name);
  draft.value = '';
  adding.value = false;
}

const addPending = computed(() => props.pending === `${props.list.sheetName}#add`);
</script>

<template>
  <div class="bara-sup">
    <ul v-if="list.rows.length" class="bara-sup__list">
      <li v-for="row in list.rows" :key="row.rowIndex" class="bara-sup__row">
        <div class="bara-sup__head">
          <button
            type="button"
            class="bara-sup__toggle"
            :aria-expanded="expanded.has(row.rowIndex)"
            @click="toggle(row.rowIndex)"
          >
            <NIcon
              :component="expanded.has(row.rowIndex) ? ICONS.expand : ICONS.collapse"
              class="bara-sup__chev"
            />
            <span class="bara-sup__name">{{ row.name || '—' }}</span>
          </button>

          <span class="bara-sup__brief">{{ brief(row).join('　') }}</span>

          <!-- 删除只在展开后出现：收起态是浏览，不该有不可撤销的按钮 -->
          <NPopconfirm
            v-if="editable && expanded.has(row.rowIndex)"
            @positive-click="emit('remove', row.rowIndex, row.name)"
          >
            <template #trigger>
              <NButton size="tiny" quaternary :title="t('supply.remove', lang)">
                <template #icon><NIcon :component="ICONS.fail" /></template>
              </NButton>
            </template>
            {{ t('supply.removeConfirm', lang, { name: row.name || '—' }) }}
          </NPopconfirm>
        </div>

        <dl v-if="expanded.has(row.rowIndex)" class="bara-sup__fields">
          <template v-for="c in list.columns" :key="c">
            <dt class="bara-sup__key">{{ c }}</dt>
            <dd class="bara-sup__val">
              <EditableValue
                :value="row.cells[c] ?? ''"
                :disabled="!editable"
                :pending="pending === fieldKey(row.rowIndex, c)"
                :multiline="c.includes('描述') || c.includes('备注')"
                @submit="(v) => emit('setCell', row.rowIndex, c, v)"
              />
            </dd>
          </template>
        </dl>
      </li>
    </ul>

    <NEmpty v-else size="small" :description="emptyText" />

    <div v-if="editable" class="bara-sup__add">
      <template v-if="adding">
        <NInput
          v-model:value="draft"
          size="tiny"
          :placeholder="t('supply.namePlaceholder', lang)"
          :disabled="addPending"
          @keyup.enter="submitAdd"
          @keyup.esc="adding = false"
        />
        <NButton size="tiny" type="primary" :loading="addPending" @click="submitAdd">
          {{ t('supply.confirmAdd', lang) }}
        </NButton>
        <NButton size="tiny" quaternary @click="adding = false">
          {{ t('settings.cancel', lang) }}
        </NButton>
      </template>
      <NButton v-else size="tiny" quaternary @click="adding = true">
        {{ t('supply.add', lang) }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.bara-sup__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-1);
}

.bara-sup__row {
  padding: var(--bara-space-1) 0;
  border-bottom: var(--bara-border-width) solid var(--bara-color-border-subtle, transparent);
}
.bara-sup__row:last-child {
  border-bottom: 0;
}

.bara-sup__head {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
  min-width: 0;
}

.bara-sup__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--bara-space-1);
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bara-sup__toggle:focus-visible {
  outline: 2px solid var(--bara-color-primary);
  outline-offset: 2px;
}
.bara-sup__chev {
  flex: none;
  color: var(--bara-color-text-muted);
}
.bara-sup__name {
  min-width: 0;
  color: var(--bara-color-text);
  overflow-wrap: anywhere;
}

/* 摘要靠右、可被压缩：名字比它重要，空间不够时先让摘要截断 */
.bara-sup__brief {
  flex: 0 1 auto;
  min-width: 0;
  color: var(--bara-color-text-subtle);
  font-size: var(--bara-font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bara-sup__fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--bara-space-1) var(--bara-space-3);
  margin: var(--bara-space-1) 0 var(--bara-space-2) var(--bara-space-5);
  font-size: var(--bara-font-size-xs);
}
.bara-sup__key {
  color: var(--bara-color-text-muted);
  white-space: nowrap;
}
.bara-sup__val {
  margin: 0;
  min-width: 0;
  color: var(--bara-color-text);
  overflow-wrap: anywhere;
}

.bara-sup__add {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
  margin-top: var(--bara-space-2);
}
</style>
