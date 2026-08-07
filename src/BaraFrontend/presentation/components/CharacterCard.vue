<script setup lang="ts">
/**
 * 简易角色卡（§8.9b）—— 仪表盘上每个角色一张。
 *
 * 就是 §8.4 的紧凑卡，不新增第四种密度。
 *
 * 属性网格可点击直接发起检定 —— 参考实现里省掉了「打开角色卡 → 找属性
 * → 点击」三步，这是最实际的一处 QoL。
 *
 * 数值一律用等宽字体：属性值在网格里要纵向对齐，比例字体下数字宽度不一
 * 会导致视觉抖动（§8.7d）。
 */
import { computed } from 'vue';
import type { CharacterVM } from '../../data/repositories/character-repo';
import { t } from '../../i18n';
import type { Lang } from '../../stores/ui-store';
import { NButton, NTag } from 'naive-ui';
import type { RuleFamily } from '../../domain/rule-systems';
import {
  attributeModifier,
  formatModifier,
  type AttributeKind,
} from '../../domain/attribute-presets';

const props = withDefaults(
  defineProps<{
    character: CharacterVM;
    lang: Lang;
    /** 当前规则族，决定是否展示调整值 */
    family: RuleFamily;
    /** 属性网格最多显示几项，超出折叠 */
    maxAttrs?: number;
  }>(),
  { maxAttrs: 6 },
);

/**
 * 属性值 → 调整值。
 *
 * 只有**基础属性**会推算：特有属性在 d20 族记的已经是加值本身，
 * 再推一次会得出「加值 25 → 再 +7」的双重计算。
 */
function modOf(value: unknown, kind: AttributeKind): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? attributeModifier(props.family, n, kind) : null;
}

const emit = defineEmits<{
  openSheet: [character: CharacterVM];
  rollAttribute: [character: CharacterVM, attr: string, value: number];
}>();

/** 首字圆标 —— 没有头像时的替代 */
const initial = computed(() => props.character.name.slice(0, 1) || '?');

const shownAttrs = computed(() =>
  props.character.baseAttrs.filter((a) => a.value !== null).slice(0, props.maxAttrs),
);
const hiddenCount = computed(() =>
  Math.max(0, props.character.baseAttrs.filter((a) => a.value !== null).length - props.maxAttrs),
);

/** 特有属性只显示数量，展开看完整角色卡 */
const specialCount = computed(
  () => props.character.specialAttrs.filter((a) => a.value !== null).length,
);
</script>

<template>
  <article class="bara-cc">
    <header class="bara-cc__head">
      <span class="bara-cc__avatar">{{ initial }}</span>

      <div class="bara-cc__id">
        <span class="bara-cc__name">{{ character.name || '—' }}</span>
        <span v-if="character.identity" class="bara-cc__identity">{{ character.identity }}</span>
      </div>

      <span
        v-if="!character.isProtagonist"
        class="bara-cc__presence"
        :class="character.present ? 'is-present' : 'is-absent'"
      >
        {{ t(character.present ? 'presence.在场' : 'presence.离场', lang) }}
      </span>
    </header>

    <!-- 属性可点击掷骰：省去打开角色卡再找属性的三步 -->
    <div v-if="shownAttrs.length" class="bara-cc__attrs">
      <NButton
        v-for="a in shownAttrs"
        :key="a.name"
        class="bara-cc__attr"
        quaternary
        size="small"
        :title="t('card.rollHint', lang, { attr: a.name })"
        @click="emit('rollAttribute', character, a.name, a.value as number)"
      >
        <span class="bara-cc__attr-name">{{ a.name }}</span>
        <span class="bara-cc__attr-value">{{ a.value }}</span>
        <!--
          调整值不存在模板里，按规则族当场算。只有 d20 族有这个概念，
          其余族 modOf 返回 null，标签整体不渲染。
        -->
        <NTag v-if="modOf(a.value, 'base') !== null" size="tiny" :bordered="false">
          {{ formatModifier(modOf(a.value, 'base')!) }}
        </NTag>
      </NButton>
    </div>

    <footer class="bara-cc__foot">
      <span class="bara-cc__meta">
        <template v-if="character.location">{{ character.location }}</template>
        <template v-if="hiddenCount">&#12288;+{{ hiddenCount }}</template>
        <template v-if="specialCount">&#12288;◆{{ specialCount }}</template>
      </span>
      <NButton size="small" @click="emit('openSheet', character)">
        {{ t('dashboard.openSheet', lang) }}
      </NButton>
    </footer>
  </article>
</template>

<style scoped>
.bara-cc {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-3);
  padding: var(--bara-space-3);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-bg);
  min-width: 0;
}

.bara-cc__head {
  display: flex;
  align-items: center;
  gap: var(--bara-space-3);
  min-width: 0;
}
.bara-cc__avatar {
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--bara-radius-full);
  background: var(--bara-color-primary-soft);
  color: var(--bara-color-primary);
  font-weight: var(--bara-font-weight-bold);
  font-size: var(--bara-font-size-sm);
}
.bara-cc__id { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.bara-cc__name {
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text);
  /* 姓名换行而非截断：截断后两个长名的角色会看起来同名 */
  word-break: break-word;
}
.bara-cc__identity {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
  word-break: break-word;
}
.bara-cc__presence {
  flex: none;
  padding: 0 var(--bara-space-2);
  border-radius: var(--bara-radius-full);
  font-size: var(--bara-font-size-xs);
  line-height: 1.6;
}
.bara-cc__presence.is-present {
  background: var(--bara-color-success-soft);
  color: var(--bara-color-present);
}
.bara-cc__presence.is-absent {
  background: var(--bara-color-hover);
  color: var(--bara-color-absent);
}

.bara-cc__attrs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--bara-space-1);
}
/*
 * NButton 定高且内容居中，属性格要满宽、左右分置。这两项它不提供开关，
 * 只能改内容容器。
 */
.bara-cc__attr :deep(.n-button__content) {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bara-space-2);
}
.bara-cc__attr {
  height: auto;
  min-width: 0;
  padding: var(--bara-space-1) var(--bara-space-2);
  border: var(--bara-border-width) solid transparent;
  border-radius: var(--bara-radius-sm);
  background: var(--bara-color-surface-sunken);
  transition:
    border-color var(--bara-duration-fast) var(--bara-easing),
    background var(--bara-duration-fast) var(--bara-easing);
}
.bara-cc__attr:hover {
  border-color: var(--bara-color-dice);
  background: var(--bara-color-hover);
}
.bara-cc__attr-name {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
  min-width: 0;
  word-break: break-word;
}
/* 等宽：属性值需纵向对齐，比例字体下数字宽度不一会抖动 */
.bara-cc__attr-value {
  margin-left: auto;
  flex: none;
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text);
}

.bara-cc__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-2);
  min-width: 0;
}
.bara-cc__meta {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
  min-width: 0;
  word-break: break-word;
}
</style>
