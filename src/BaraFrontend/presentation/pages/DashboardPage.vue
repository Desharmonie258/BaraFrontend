<script setup lang="ts">
/**
 * 仪表盘 —— 默认目的地，与每张表平级（§8.9b）。
 *
 * 空面板显示占位文案而非整块隐藏：面板消失会让布局在数据增减时跳动。
 * 这与人物小传内「空值列整条隐藏」的处理相反 —— 那里是阅读性长文，
 * 这里是固定看板，两种场景诉求不同。
 */
import { NCard, NEmpty } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { t } from '../../i18n';

const ui = useUiStore();
</script>

<template>
  <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
    <NCard size="small" :title="t('dashboard.protagonist', ui.lang)">
      <NEmpty size="small" description="—" />
    </NCard>

    <NCard size="small" :title="`${t('dashboard.importantChars', ui.lang)} (0)`">
      <NEmpty size="small" :description="t('dashboard.empty.chars', ui.lang)" />
    </NCard>

    <NCard size="small" :title="t('dashboard.supplies', ui.lang)">
      <NEmpty size="small" :description="t('dashboard.empty.items', ui.lang)" />
    </NCard>
  </div>
</template>
