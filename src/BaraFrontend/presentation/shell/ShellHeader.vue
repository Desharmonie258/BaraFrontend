<script setup lang="ts">
import { computed } from 'vue';
import { NSelect, NButton, NTag } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useTeleportTarget } from '../composables/use-teleport-target';
import { t } from '../../i18n';
import type { ThemeId } from '../theme/tokens';
import type { ModeSetting } from '../../stores/ui-store';

defineProps<{ subtitle?: string }>();
const emit = defineEmits<{ close: [] }>();

const ui = useUiStore();
const to = useTeleportTarget();

const themeOptions = computed(() =>
  ui.themes.map((th) => ({
    label: th.name[ui.lang] + (th.easterEgg ? ` · ${t('settings.easterEgg', ui.lang)}` : ''),
    value: th.id,
  })),
);
const modeOptions = computed<{ label: string; value: ModeSetting }[]>(() => [
  { label: t('settings.mode.auto', ui.lang), value: 'auto' },
  { label: t('settings.mode.light', ui.lang), value: 'light' },
  { label: t('settings.mode.dark', ui.lang), value: 'dark' },
]);
</script>

<template>
  <header class="bara-head flex items-center justify-between gap-3 px-4 py-2">
    <div class="flex items-baseline gap-2 min-w-0">
      <span class="bara-head__name font-bold whitespace-nowrap">
        {{ t('app.title', ui.lang) }}
      </span>
      <span class="bara-head__sub truncate">{{ subtitle }}</span>
    </div>

    <!--
      主题切换入口在任何主题下都必须可见可点 —— 这是 cyberpunk 彩蛋主题
      不保证可读性时保留的唯一底线（§8.7b）。
      弹层必须绑 :to，否则会 teleport 出 Shadow DOM 丢失样式。
    -->
    <div class="flex items-center gap-2 flex-none">
      <NTag v-if="ui.theme.easterEgg" size="small" type="warning" :bordered="false">
        {{ t('settings.easterEgg', ui.lang) }}
      </NTag>
      <NSelect
        :value="ui.themeId"
        :options="themeOptions"
        :to="to"
        size="small"
        class="w-32"
        @update:value="(v: ThemeId) => ui.setTheme(v)"
      />
      <NSelect
        :value="ui.modeSetting"
        :options="modeOptions"
        :to="to"
        size="small"
        class="w-24"
        @update:value="(v: ModeSetting) => ui.setMode(v)"
      />
      <NButton size="small" quaternary @click="ui.toggleLang()">
        {{ ui.lang === 'zh-CN' ? '中' : 'EN' }}
      </NButton>
      <NButton size="small" quaternary @click="emit('close')">✕</NButton>
    </div>
  </header>
</template>

<style scoped>
.bara-head {
  border-bottom: var(--bara-border-width) solid var(--bara-color-divider);
  background: var(--bara-color-surface);
}
.bara-head__name { color: var(--bara-color-accent); }
.bara-head__sub {
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text-muted);
}
</style>
