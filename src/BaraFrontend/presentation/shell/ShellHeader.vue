<script setup lang="ts">
/**
 * 标题栏。
 *
 * 主题、深浅、语言三个控件已迁入设置面板 —— 标题栏在窄屏下只有
 * 一行的宽度，控件越多标题被挤得越短。这里只保留两个入口：
 * 打开设置、展开收起。
 */
import { computed } from 'vue';
import { useUiStore } from '../../stores/ui-store';
import { t } from '../../i18n';
import { NButton, NIcon } from 'naive-ui';
import { ICONS } from '../icons';

defineProps<{ subtitle?: string }>();

const ui = useUiStore();

const inSettings = computed(() => ui.destination.kind === 'settings');
</script>

<template>
  <header class="bara-head">
    <div class="bara-head__left">
      <span class="bara-head__name">{{ t('app.title', ui.lang) }}</span>
      <span class="bara-head__sub">{{ subtitle }}</span>
    </div>

    <!--
      设置入口在任何主题下都必须可见可点 —— cyberpunk 彩蛋主题不保证
      可读性，能进设置改回来是保留的唯一底线（§8.7b）。
    -->
    <div class="bara-head__actions">
      <NButton
        size="small"
        :type="inSettings ? 'primary' : 'default'"
        :quaternary="!inSettings"
        :title="t('settings.title', ui.lang)"
        @click="inSettings ? ui.closeSettings() : ui.openSettings()"
      >
        <template #icon><NIcon :component="ICONS.settings" /></template>
      </NButton>
      <!-- 展开/收起：这是「多个部位可展开」中的一处，另一处在坞上 -->
      <NButton
        size="small"
        quaternary
        :title="t(ui.expanded ? 'shell.collapse' : 'shell.expand', ui.lang)"
        @click="ui.toggleExpanded()"
      >
        <template #icon>
          <NIcon :component="ui.expanded ? ICONS.expand : ICONS.collapse" />
        </template>
      </NButton>
    </div>
  </header>
</template>

<style scoped>
.bara-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-4);
  padding: var(--bara-space-3) var(--bara-space-5);
  flex: none;
  border-bottom: var(--bara-border-width) solid var(--bara-color-divider);
  background: var(--bara-color-surface);
}
.bara-head__left {
  display: flex;
  align-items: baseline;
  gap: var(--bara-space-3);
  min-width: 0;
}
.bara-head__name {
  color: var(--bara-color-accent);
  font-weight: var(--bara-font-weight-bold);
  white-space: nowrap;
}
.bara-head__sub {
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bara-head__actions {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
  flex: none;
}
</style>
