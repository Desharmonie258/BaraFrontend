<script setup lang="ts">
/**
 * 检定弹窗 —— 选难度、掷骰、把元叙事文本交给输入框。
 *
 * 掷骰**不自动发送**。检定结果一旦发出去就进了聊天记录、无法撤回，
 * 而难度是否选对、要不要重掷，只有玩家自己知道。因此这里只负责
 * 掷出结果并填入输入框，发送与否交给玩家。
 *
 * 弹层挂在 getOverlayRoot() —— 楼层带 transform，挂在插件根上会让
 * fixed 定位退化（见 mount.ts 的说明）。
 */
import { computed, ref, watch } from 'vue';
import { NModal, NCard, NButton, NRadioGroup, NRadioButton, NInputNumber, NTag, NAlert } from 'naive-ui';
import { getOverlayRoot } from '../../bootstrap/mount';
import { getCheckPreset, getDifficulty } from '../../../domain/dice/check-presets';
import { performCheck, type CheckRequest, type CheckResult } from '../../../domain/dice/resolve';
import { fillComposer, sendChatText, canSend } from '../../../data/chat-sender';
import type { Lang } from '../../../stores/ui-store';
import { t } from '../../../i18n';

const props = defineProps<{
  show: boolean;
  /** 待检定的目标。null 表示未打开 */
  request: Omit<CheckRequest, 'difficulty' | 'dc'> | null;
  lang: Lang;
}>();

const emit = defineEmits<{ 'update:show': [v: boolean] }>();

const preset = computed(() =>
  props.request ? getCheckPreset(props.request.family) : null,
);

const difficulty = ref('');
const dc = ref<number | null>(null);
const result = ref<CheckResult | null>(null);
const text = ref('');
const notice = ref<string | null>(null);

/** 每次打开都重置 —— 沿用上一次的难度容易在换角色后掷错 */
watch(
  () => [props.show, props.request] as const,
  () => {
    if (!props.show || !preset.value) return;
    difficulty.value = preset.value.defaultDifficulty;
    dc.value = preset.value.defaultDc;
    result.value = null;
    text.value = '';
    notice.value = null;
  },
  { immediate: true },
);

const difficultyOptions = computed(() =>
  (preset.value?.difficulties ?? []).map((d) => ({ label: d.name[props.lang], value: d.id })),
);

/** 百分骰族的难度作用在目标值上，没有独立的难度值可填 */
const showDc = computed(() =>
  preset.value ? getDifficulty(preset.value.family, difficulty.value).dcDelta !== undefined : false,
);

/** 结果着色。判定的定性与具体规则无关，因此可以统一映射。 */
const TONE_COLOR: Record<string, string> = {
  critSuccess: 'var(--bara-color-outcome-crit-success)',
  success: 'var(--bara-color-outcome-success)',
  partial: 'var(--bara-color-outcome-partial)',
  failure: 'var(--bara-color-outcome-failure)',
  fumble: 'var(--bara-color-outcome-fumble)',
};

function roll(): void {
  if (!props.request) return;
  notice.value = null;
  const out = performCheck(
    { ...props.request, difficulty: difficulty.value, dc: dc.value ?? undefined },
    props.lang,
  );
  result.value = out.result;
  text.value = out.text;
}

function onFill(): void {
  if (!text.value) return;
  notice.value = fillComposer(text.value)
    ? t('check.filled', props.lang)
    : t('suggest.noComposer', props.lang);
}

async function onSend(): Promise<void> {
  if (!text.value) return;
  const mode = await sendChatText(text.value);
  notice.value = mode ? t('check.sent', props.lang) : t('suggest.failed', props.lang);
  if (mode) emit('update:show', false);
}
</script>

<template>
  <NModal
    :show="show"
    :to="getOverlayRoot()"
    transform-origin="center"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NCard v-if="request && preset" class="bara-chk" size="small" :bordered="false">
      <template #header>
        <span class="bara-chk__title">
          {{ request.actor }} · {{ request.attrName }}
          <NTag size="small" :bordered="false">{{ request.attrValue }}</NTag>
          <NTag
            v-if="request.modifier !== null && request.modifier !== undefined"
            size="small"
            :bordered="false"
          >
            {{ request.modifier >= 0 ? `+${request.modifier}` : request.modifier }}
          </NTag>
        </span>
      </template>
      <template #header-extra>
        <NButton size="small" quaternary @click="emit('update:show', false)">
          {{ t('sheet.close', lang) }}
        </NButton>
      </template>

      <div class="bara-chk__row">
        <span class="bara-chk__label">{{ t('check.difficulty', lang) }}</span>
        <NRadioGroup v-model:value="difficulty" size="small">
          <NRadioButton v-for="o in difficultyOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
      </div>

      <div v-if="showDc" class="bara-chk__row">
        <span class="bara-chk__label">{{ t('check.dc', lang) }}</span>
        <NInputNumber v-model:value="dc" size="small" class="bara-chk__dc" />
      </div>

      <div class="bara-chk__actions">
        <NButton type="primary" size="small" @click="roll()">
          {{ t(result ? 'check.reroll' : 'check.roll', lang) }}
        </NButton>
      </div>

      <!-- 结果 -->
      <div v-if="result" class="bara-chk__result">
        <div class="bara-chk__outcome" :style="{ color: TONE_COLOR[result.tone] }">
          {{ result.outcome.name[lang] }}
        </div>
        <p class="bara-chk__detail">
          {{ result.formula }} = {{ result.roll }}
          <template v-if="result.dice.length > 1">（{{ result.dice.join(', ') }}）</template>
        </p>
        <!-- 元叙事原文可见：它会原样进聊天记录，玩家有权先看一眼 -->
        <pre class="bara-chk__text">{{ text }}</pre>

        <div class="bara-chk__actions">
          <NButton size="small" @click="onFill()">{{ t('check.fill', lang) }}</NButton>
          <NButton size="small" type="primary" :disabled="!canSend()" @click="onSend()">
            {{ t('check.send', lang) }}
          </NButton>
        </div>
      </div>

      <NAlert v-if="notice" type="info" :bordered="false" class="bara-chk__notice">
        {{ notice }}
      </NAlert>
    </NCard>
  </NModal>
</template>

<style scoped>
.bara-chk { width: 90vw; max-width: 30rem; }
.bara-chk__title {
  display: inline-flex;
  align-items: center;
  gap: var(--bara-space-2);
  flex-wrap: wrap;
  word-break: break-word;
}

.bara-chk__row {
  display: flex;
  align-items: center;
  gap: var(--bara-space-3);
  flex-wrap: wrap;
  margin-bottom: var(--bara-space-3);
}
.bara-chk__label {
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text-muted);
}
.bara-chk__dc { width: 7rem; }

.bara-chk__actions {
  display: flex;
  gap: var(--bara-space-2);
  flex-wrap: wrap;
}

.bara-chk__result {
  margin-top: var(--bara-space-4);
  padding-top: var(--bara-space-3);
  border-top: var(--bara-border-width) solid var(--bara-color-divider);
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-2);
}
.bara-chk__outcome {
  font-size: var(--bara-font-size-xl);
  font-weight: var(--bara-font-weight-bold);
}
.bara-chk__detail {
  margin: 0;
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text-muted);
}
.bara-chk__text {
  margin: 0;
  padding: var(--bara-space-2) var(--bara-space-3);
  border-radius: var(--bara-radius-sm);
  background: var(--bara-color-surface-sunken);
  color: var(--bara-color-text-muted);
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
  line-height: var(--bara-line-height-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
}
.bara-chk__notice { margin-top: var(--bara-space-3); }
</style>
