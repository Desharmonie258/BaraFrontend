<script setup lang="ts">
/**
 * 表格坞（§8.9c）—— 路由，挂在外壳上，不属于任何目的地。
 *
 * 表格清单**必须数据驱动**：运行时枚举模板的 sheet 列表生成。
 * 硬编码表名会在用户增删自定义表、切换模板预设后失配。
 *
 * 两种布局，由玩家切换：
 * - grid：等宽网格。条目多时整齐、扫视成本低（骰子系统的做法）
 * - flow：按内容宽度流式排列。条目少时不浪费横向空间
 */
import { computed } from 'vue';
import { NBadge, NTooltip, NButton } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { t } from '../../i18n';
import { iconForSheet, FUNCTION_ICONS } from './dock-icons';

const ui = useUiStore();
const schema = useSchemaStore();

const isDashboard = computed(() => ui.destination.kind === 'dashboard');
function isActive(key: string): boolean {
  return ui.destination.kind === 'table' && ui.destination.sheetKey === key;
}

const listClass = computed(() =>
  ui.dockLayout === 'grid'
    ? 'grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5'
    : 'flex flex-wrap gap-1.5',
);
</script>

<template>
  <footer class="bara-dock px-3 py-2">
    <div class="flex items-start gap-2">
      <div :class="listClass" class="flex-1 min-w-0">
        <button
          class="bara-dock__item"
          :class="{ 'is-active': isDashboard }"
          @click="ui.goTo({ kind: 'dashboard' })"
        >
          <span v-if="ui.dockIcons" class="bara-dock__icon">{{ FUNCTION_ICONS.dashboard }}</span>
          <span class="bara-dock__label">{{ t('dest.dashboard', ui.lang) }}</span>
        </button>

        <button
          v-for="s in schema.sheets"
          :key="s.key"
          class="bara-dock__item"
          :class="{ 'is-active': isActive(s.key) }"
          @click="ui.goTo({ kind: 'table', sheetKey: s.key })"
        >
          <span v-if="ui.dockIcons" class="bara-dock__icon">{{ iconForSheet(s.name) }}</span>
          <!-- 展示名取模板的 name，不翻译：它属于用户的存档数据（§8.7c） -->
          <span class="bara-dock__label">{{ s.name }}</span>
          <NBadge
            v-if="s.rowCount > 0"
            :value="s.rowCount"
            :max="999"
            class="bara-dock__badge"
          />
        </button>
      </div>

      <!-- 工具区：布局与图标开关 -->
      <div class="flex items-center gap-1 flex-none pt-0.5">
        <NTooltip>
          <template #trigger>
            <NButton size="tiny" quaternary @click="ui.toggleDockLayout()">
              {{ ui.dockLayout === 'grid' ? '▦' : '☰' }}
            </NButton>
          </template>
          {{ t(ui.dockLayout === 'grid' ? 'dock.layout.grid' : 'dock.layout.flow', ui.lang) }}
        </NTooltip>
        <NTooltip>
          <template #trigger>
            <NButton size="tiny" quaternary @click="ui.toggleDockIcons()">
              {{ ui.dockIcons ? '◈' : '◇' }}
            </NButton>
          </template>
          {{ t('dock.toggleIcons', ui.lang) }}
        </NTooltip>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.bara-dock {
  border-top: var(--bara-border-width) solid var(--bara-color-divider);
  background: var(--bara-color-surface);
  /* 条目多时坞可能很高，限高并允许滚动，避免把内容区挤没 */
  max-height: 40dvh;
  overflow-y: auto;
}

.bara-dock__item {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
  padding: var(--bara-space-2) var(--bara-space-3);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-sm);
  background: var(--bara-color-bg);
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-sm);
  line-height: var(--bara-line-height-tight);
  cursor: pointer;
  min-width: 0;
  transition:
    background var(--bara-duration-fast) var(--bara-easing),
    color var(--bara-duration-fast) var(--bara-easing),
    border-color var(--bara-duration-fast) var(--bara-easing);
}
.bara-dock__item:hover {
  background: var(--bara-color-hover);
  color: var(--bara-color-text);
}
.bara-dock__item.is-active {
  background: var(--bara-color-primary-soft);
  border-color: var(--bara-color-primary);
  color: var(--bara-color-primary);
  font-weight: var(--bara-font-weight-medium);
}

.bara-dock__icon {
  flex: none;
  opacity: 0.85;
}
/* 网格模式下必须截断：长表名会撑破等宽格子 */
.bara-dock__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bara-dock__badge {
  flex: none;
  margin-left: auto;
}
</style>
