<script setup lang="ts">
/**
 * 仪表盘预设的导入导出（1.11）。
 *
 * 放在「模板适配情况」里是刻意的：那一栏回答的正是「为什么我这里
 * 没有资源条」，而预设是这个问题的解法。两者分开摆，用户看完诊断
 * 还得再去别处找工具。
 *
 * ## 用文本框而不是文件选择
 *
 * 预设是几行 JSON，社区里靠聊天窗口传。文件选择在酒馆的 iframe 里
 * 还要处理下载目录与权限，而复制粘贴一步到位。
 *
 * ## 问题一条都不吞
 *
 * 手写 JSON 出错是常态。「导入失败」四个字帮不了用户找出哪一行写坏了，
 * 所以解析中发现的每个问题都列出来 —— 包括导入成功但被跳过的部分。
 */
import { computed, ref } from 'vue';
import { NButton, NInput, NAlert, NTag } from 'naive-ui';
import { t } from '../../i18n';
import type { Lang } from '../../stores/ui-store';
import { activePreset, importPreset, clearPreset } from '../../data/preset-store';
import { serializePreset, USED_MODULES, SAMPLE_PRESET } from '../../domain/dashboard-preset';

const props = defineProps<{ lang: Lang }>();
const emit = defineEmits<{ changed: [] }>();

/** 当前预设。导入/清除后手动推进，避免为一个几乎不变的值挂响应式来源 */
const version = ref(0);
const preset = computed(() => {
  void version.value;
  return activePreset();
});

/** 本前端真正会用到的模块，其余模块保留但标注出来 */
const usedModules = computed(() =>
  Object.keys(preset.value?.modules ?? {}).filter((m) =>
    (USED_MODULES as readonly string[]).includes(m),
  ),
);
const spareModules = computed(() =>
  Object.keys(preset.value?.modules ?? {}).filter(
    (m) => !(USED_MODULES as readonly string[]).includes(m),
  ),
);

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
    // JSON 本身就坏时，把解析器的原话给出来 —— 它会指出第几个字符
    notice.value = {
      tone: 'danger',
      text: `${t('preset.badJson', props.lang)}${e instanceof Error ? `：${e.message}` : ''}`,
    };
    return;
  }

  const result = importPreset(parsed);
  problems.value = result.problems;
  notice.value = result.ok
    ? { tone: 'success', text: t('preset.imported', props.lang) }
    : { tone: 'danger', text: t('preset.importFailed', props.lang) };

  if (result.ok) {
    draft.value = '';
    version.value += 1;
    emit('changed');
  }
}

/** 导出成文本填回输入框：在 iframe 里剪贴板权限时有时无，填回去总能复制走 */
function onExport(): void {
  const current = preset.value;
  if (!current) return;
  draft.value = serializePreset(current);
  notice.value = { tone: 'success', text: t('preset.exported', props.lang) };
}

/**
 * 填入样例。**只填不启用** —— 样例里的关键词是通用叫法，
 * 直接启用多半认不出用户那份模板，还会让人以为预设功能坏了。
 * 先让他改，改完再点导入。
 */
function onSample(): void {
  draft.value = serializePreset(SAMPLE_PRESET);
  problems.value = [];
  notice.value = { tone: 'success', text: t('preset.sampleFilled', props.lang) };
}

function onClear(): void {
  clearPreset();
  version.value += 1;
  problems.value = [];
  notice.value = { tone: 'success', text: t('preset.cleared', props.lang) };
  emit('changed');
}
</script>

<template>
  <div class="bara-preset">
    <p class="bara-preset__hint">{{ t('preset.hint', lang) }}</p>

    <div class="bara-preset__status">
      <template v-if="preset">
        <NTag size="small" type="success" :bordered="false">{{ preset.name }}</NTag>
        <NTag v-for="m in usedModules" :key="m" size="small" :bordered="false">{{ m }}</NTag>
        <!--
          用不上的模块也要显示：预设从骰子系统导过来时会带着它们，
          不说明的话用户会以为导入丢了东西。
        -->
        <NTag
          v-for="m in spareModules"
          :key="m"
          size="small"
          type="warning"
          :bordered="false"
          :title="t('preset.unusedModule', lang)"
        >
          {{ m }}
        </NTag>
      </template>
      <span v-else class="bara-preset__none">{{ t('preset.none', lang) }}</span>
    </div>

    <NAlert
      v-if="notice"
      :type="notice.tone === 'danger' ? 'error' : 'success'"
      closable
      class="bara-preset__alert"
      @close="notice = null"
    >
      {{ notice.text }}
    </NAlert>

    <ul v-if="problems.length" class="bara-preset__problems">
      <li v-for="p in problems" :key="p">{{ p }}</li>
    </ul>

    <NInput
      v-model:value="draft"
      type="textarea"
      size="small"
      :autosize="{ minRows: 3, maxRows: 10 }"
      :placeholder="t('preset.placeholder', lang)"
      class="bara-preset__input"
    />

    <div class="bara-preset__actions">
      <NButton size="small" type="primary" :disabled="!draft.trim()" @click="onImport">
        {{ t('preset.import', lang) }}
      </NButton>
      <NButton size="small" :disabled="!preset" @click="onExport">
        {{ t('preset.export', lang) }}
      </NButton>
      <NButton size="small" quaternary @click="onSample">
        {{ t('preset.sample', lang) }}
      </NButton>
      <NButton size="small" quaternary :disabled="!preset" @click="onClear">
        {{ t('preset.clear', lang) }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.bara-preset {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-2);
}

.bara-preset__hint {
  margin: 0;
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xs);
  line-height: 1.6;
}

.bara-preset__status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-1);
  align-items: center;
}
.bara-preset__none {
  color: var(--bara-color-text-subtle);
  font-size: var(--bara-font-size-xs);
}

.bara-preset__alert { margin: 0; }

.bara-preset__problems {
  margin: 0;
  padding-left: var(--bara-space-4);
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xs);
  line-height: 1.7;
}

/* 等宽：贴进来的是 JSON，比例字体下缩进看不出层级 */
.bara-preset__input :deep(textarea) {
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
}

.bara-preset__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-2);
}
</style>
