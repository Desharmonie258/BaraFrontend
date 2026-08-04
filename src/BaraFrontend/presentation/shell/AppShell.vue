<script setup lang="ts">
/**
 * 应用外壳：头部 + 内容区 + 表格坞（§8.9）
 *
 * 层级要点：表格坞挂在外壳上，与内容区同级 —— 它不是仪表盘的一部分。
 * 全部目的地平级互换，不做模态叠加。
 */
import { computed } from 'vue';
import { useUiStore } from '../../stores/ui-store';
import { t } from '../../i18n';
import ShellHeader from './ShellHeader.vue';
import TableDock from './TableDock.vue';
import DashboardPage from '../pages/DashboardPage.vue';
import TablePage from '../pages/TablePage.vue';

const ui = useUiStore();

const subtitle = computed(() =>
  ui.destination.kind === 'dashboard' ? t('dashboard.subtitle', ui.lang) : '',
);
</script>

<template>
  <div class="bara-shell flex flex-col overflow-hidden">
    <ShellHeader :subtitle="subtitle" />

    <!-- 目的地平级互换；各自状态由 KeepAlive 保留 -->
    <div class="bara-shell__content flex-1 overflow-auto">
      <KeepAlive>
        <DashboardPage v-if="ui.destination.kind === 'dashboard'" />
        <TablePage
          v-else
          :key="ui.destination.sheetKey"
          :sheet-key="ui.destination.sheetKey"
        />
      </KeepAlive>
    </div>

    <TableDock />
  </div>
</template>

<style scoped>
.bara-shell {
  font-family: var(--bara-font-family);
  font-size: var(--bara-font-size-md);
  line-height: var(--bara-line-height-normal);
  color: var(--bara-color-text);
  background: var(--bara-color-bg);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-lg);
  box-shadow: var(--bara-shadow-lg);
  max-height: 80dvh;
}
.bara-shell__content {
  padding: var(--bara-space-5);
  min-height: 280px;
}
</style>
