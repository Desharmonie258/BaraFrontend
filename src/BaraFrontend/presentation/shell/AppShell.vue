<script setup lang="ts">
/**
 * 应用外壳 —— 常驻卡片。
 *
 * 结构：
 *   n-card（一直显示，不做整体显隐）
 *   ├─ header：标题 + 主题/语言控件 + 展开收起
 *   ├─ n-collapse：内容区，由当前目的地决定渲染仪表盘还是表格视图
 *   └─ 表格坞：一直显示，点击条目会顺带展开内容区
 *
 * 收起时只剩标题栏与坞，不遮挡聊天；展开时才占用纵向空间。
 * 这样不需要「打开面板」这一步 —— 界面始终在，只是详略不同。
 */
import { computed, watch } from 'vue';
import { NCard, NCollapse, NCollapseItem } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { t } from '../../i18n';
import ShellHeader from './ShellHeader.vue';
import TableDock from './TableDock.vue';
import DashboardPage from '../pages/DashboardPage.vue';
import TablePage from '../pages/TablePage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import ReviewPage from '../pages/ReviewPage.vue';
import VariablesPage from '../pages/VariablesPage.vue';

const ui = useUiStore();
const schema = useSchemaStore();

/** n-collapse 用名称数组表达展开项，这里只有一个 'content' */
const expanded = computed<string[]>({
  get: () => (ui.expanded ? ['content'] : []),
  set: (names) => ui.setExpanded(names.includes('content')),
});

/** 内容区限高，由设置面板调节 */
const contentStyle = computed(() => ({ maxHeight: `${ui.contentHeight}vh` }));

const currentTitle = computed(() => {
  if (ui.destination.kind === 'dashboard') return t('dest.dashboard', ui.lang);
  if (ui.destination.kind === 'settings') return t('settings.title', ui.lang);
  if (ui.destination.kind === 'review') return t('dest.review', ui.lang);
  if (ui.destination.kind === 'variables') return t('dest.variables', ui.lang);
  // 表名取自模板，不翻译：它属于用户的存档数据（§8.7c）
  return schema.get(ui.destination.sheetKey)?.name ?? t('dest.tables', ui.lang);
});

/** 点击坞条目时顺带展开 —— 这是「多个部位可展开」中的一处 */
function onDockNavigate(): void {
  ui.setExpanded(true);
}

// 设置面板同样渲染在内容区里，收起状态下点齿轮必须顺带展开
watch(
  () => ui.destination.kind,
  (kind) => {
    if (kind === 'settings') ui.setExpanded(true);
  },
);
</script>

<template>
  <NCard class="bara-shell" size="small" :bordered="true">
    <template #header>
      <ShellHeader :subtitle="currentTitle" />
    </template>

    <NCollapse v-model:expanded-names="expanded" :accordion="false">
      <NCollapseItem name="content" :title="currentTitle">
        <div class="bara-shell__content" :style="contentStyle">
          <KeepAlive>
            <SettingsPage v-if="ui.destination.kind === 'settings'" />
            <ReviewPage v-else-if="ui.destination.kind === 'review'" />
            <VariablesPage v-else-if="ui.destination.kind === 'variables'" />
            <DashboardPage v-else-if="ui.destination.kind === 'dashboard'" />
            <TablePage
              v-else
              :key="ui.destination.sheetKey"
              :sheet-key="ui.destination.sheetKey"
            />
          </KeepAlive>
        </div>
      </NCollapseItem>
    </NCollapse>

    <template #footer>
      <TableDock @navigate="onDockNavigate" />
    </template>
  </NCard>
</template>

<style scoped>
/*
 * 楼层内寄生：卡片是消息流中的一个块，不是浮层。
 * 因此不设 position / z-index，宽度由 mount.ts 的 fixWidth() 校正。
 */
.bara-shell {
  margin-top: var(--bara-space-4);
  font-family: var(--bara-font-family);
  font-size: var(--bara-font-size-md);
  line-height: var(--bara-line-height-normal);
  color: var(--bara-color-text);
}

/*
 * 内容区限高并自滚动。展开时若不限高，长表格会把后续对话推出很远，
 * 用户要滚很久才能回到输入框。具体高度由设置面板给（内联 style）。
 */
.bara-shell__content {
  overflow: auto;
  padding-top: var(--bara-space-3);
}
</style>
