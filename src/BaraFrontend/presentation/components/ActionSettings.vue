<script setup lang="ts">
/**
 * 交互规则的导入导出（1.11）。
 *
 * 与仪表盘预设（`PresetSettings`）同一套形态与理由：文本框而非文件选择、
 * 问题一条都不吞。差别只在**兜底** —— 这里没有自定义时用内置默认规则，
 * 所以「清除」的措辞是「恢复内置默认」而不是「停用」。
 */
import { computed, ref } from 'vue';
import { NButton, NInput, NAlert, NTag } from 'naive-ui';
import { t } from '../../i18n';
import type { Lang } from '../../stores/ui-store';
import {
  activeActions, isCustomActive, importActionPreset, clearActionPreset,
} from '../../data/action-preset-store';
import { serializeActionPreset } from '../../domain/interaction-rules';

const props = defineProps<{ lang: Lang }>();
const emit = defineEmits<{ changed: [] }>();

/** 导入/清除后手动推进，避免为一个几乎不变的值挂响应式来源 */
const version = ref(0);
const preset = computed(() => {
  void version.value;
  return activeActions();
});
const custom = computed(() => {
  void version.value;
  return isCustomActive();
});

const draft = ref('');
const problems = ref<string[]>([]);
const notice = ref<{ tone: 'success' | 'danger'; text: string } | null>(null);

function onImport(): void {
  problems.value = [];
  notice.value = null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(draft.value);
  } catch (e) {
    // JSON 本身就坏时给出解析器原话 —— 它会指出第几个字符
    notice.value = {
      tone: 'danger',
      text: `${t('actions.badJson', props.lang)}${e instanceof Error ? `：${e.message}` : ''}`,
    };
    return;
  }

  const result = importActionPreset(parsed);
  problems.value = result.problems;
  notice.value = result.ok
    ? { tone: 'success', text: t('actions.imported', props.lang) }
    : { tone: 'danger', text: t('actions.importFailed', props.lang) };

  if (result.ok) {
    draft.value = '';
    version.value += 1;
    emit('changed');
  }
}

/** 导出填回输入框：iframe 里剪贴板权限时有时无，填回去总能复制走 */
function onExport(): void {
  draft.value = serializeActionPreset(preset.value);
  notice.value = { tone: 'success', text: t('actions.exported', props.lang) };
}

function onClear(): void {
  clearActionPreset();
  version.value += 1;
  problems.value = [];
  notice.value = { tone: 'success', text: t('actions.cleared', props.lang) };
  emit('changed');
}
</script>

<template>
  <div class="bara-act">
    <p class="bara-act__hint">{{ t('actions.hint', lang) }}</p>

    <div class="bara-act__status">
      <NTag size="small" :type="custom ? 'success' : 'default'" :bordered="false">
        {{ custom ? preset.name : t('actions.builtin', lang) }}
      </NTag>
      <NTag size="small" :bordered="false">
        {{ t('actions.ruleCount', lang, { n: String(preset.rules.length) }) }}
      </NTag>
    </div>

    <NAlert
      v-if="notice"
      :type="notice.tone === 'danger' ? 'error' : 'success'"
      closable
      class="bara-act__alert"
      @close="notice = null"
    >
      {{ notice.text }}
    </NAlert>

    <ul v-if="problems.length" class="bara-act__problems">
      <li v-for="p in problems" :key="p">{{ p }}</li>
    </ul>

    <NInput
      v-model:value="draft"
      type="textarea"
      size="small"
      :autosize="{ minRows: 3, maxRows: 10 }"
      :placeholder="t('actions.placeholder', lang)"
      class="bara-act__input"
    />

    <div class="bara-act__actions">
      <NButton size="small" type="primary" :disabled="!draft.trim()" @click="onImport">
        {{ t('actions.import', lang) }}
      </NButton>
      <NButton size="small" @click="onExport">
        {{ t('actions.export', lang) }}
      </NButton>
      <NButton size="small" quaternary :disabled="!custom" @click="onClear">
        {{ t('actions.clear', lang) }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.bara-act {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-2);
}

.bara-act__hint {
  margin: 0;
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xs);
  line-height: 1.6;
}

.bara-act__status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-1);
  align-items: center;
}

.bara-act__alert { margin: 0; }

.bara-act__problems {
  margin: 0;
  padding-left: var(--bara-space-4);
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xs);
  line-height: 1.7;
}

/* 等宽：贴进来的是 JSON，比例字体下缩进看不出层级 */
.bara-act__input :deep(textarea) {
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
}

.bara-act__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-2);
}
</style>
