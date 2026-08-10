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
 *
 * ## 编辑是一个要主动进入的状态（1.11）
 *
 * 属性格平时点一下是掷骰 —— 那是这张卡最常用的动作，不能被编辑抢走。
 * 所以手改走一个显式开关：开着时属性格变成输入框，关着时一切照旧。
 * 一个格子不能既是骰子又是输入框，用户也需要知道自己此刻在改数据。
 *
 * 组件只发意图，写库由页面执行 —— 与 RowCard 的 `setCell` 同一分工。
 */
import { computed, ref, watch } from 'vue';
import type { CharacterVM } from '../../data/repositories/character-repo';
import { t } from '../../i18n';
import type { Lang } from '../../stores/ui-store';
import { NButton, NTag, NIcon } from 'naive-ui';
import { ICONS } from '../icons';
import type { RuleFamily } from '../../domain/rule-systems';
import {
  attributeModifier,
  formatModifier,
  type AttributeKind,
} from '../../domain/attribute-presets';
import EditableValue from './EditableValue.vue';

const props = withDefaults(
  defineProps<{
    character: CharacterVM;
    lang: Lang;
    /** 当前规则族，决定是否展示调整值 */
    family: RuleFamily;
    /** 属性网格最多显示几项，超出折叠 */
    maxAttrs?: number;
    /** 写入通道可用时才给编辑入口。不可用时连开关都不出现。 */
    editable?: boolean;
    /** 属性值的合法区间，跟随规则族由上层算好传入 */
    range?: { min: number; max: number };
    /** 正在写入的字段标识，写入期间禁用该字段 */
    pending?: string | null;
  }>(),
  { maxAttrs: 6, editable: false },
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
  /** 请求把某个基础属性改成新值。写库由页面执行。 */
  editAttribute: [character: CharacterVM, kind: AttributeKind, attr: string, value: number];
  editLocation: [character: CharacterVM, value: string];
  editPresence: [character: CharacterVM, present: boolean];
}>();

const editing = ref(false);

/*
 * 换人时退出编辑态。卡片在列表里按 key 复用，不退的话「在场角色」筛选
 * 一变，编辑态会留在另一个角色的卡上。
 */
watch(() => props.character.rowIndex, () => { editing.value = false; });
/* 写入通道没了（切到只读模式）也要退出，否则留着一排改不动的输入框 */
watch(() => props.editable, (v) => { if (!v) editing.value = false; });

/** 字段级 pending 标识，与页面传入的 `pending` 比对 */
function fieldKey(field: string): string {
  return `${props.character.sheetName}#${props.character.rowIndex}#${field}`;
}
function isPending(field: string): boolean {
  return props.pending === fieldKey(field);
}

function onAttrSubmit(name: string, raw: string): void {
  const n = Number(raw);
  // 输入不成数就当没改 —— 把 NaN 写进属性串会让这一项变成无法解析的残片
  if (!Number.isFinite(n)) return;
  emit('editAttribute', props.character, 'base', name, n);
}

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

      <!-- 编辑态下在场状态可点切换；主角恒为在场，不给这个入口 -->
      <button
        v-if="!character.isProtagonist && editing"
        type="button"
        class="bara-cc__presence bara-cc__presence--editable"
        :class="character.present ? 'is-present' : 'is-absent'"
        :disabled="isPending('presence')"
        @click="emit('editPresence', character, !character.present)"
      >
        {{ t(character.present ? 'presence.在场' : 'presence.离场', lang) }}
      </button>
      <span
        v-else-if="!character.isProtagonist"
        class="bara-cc__presence"
        :class="character.present ? 'is-present' : 'is-absent'"
      >
        {{ t(character.present ? 'presence.在场' : 'presence.离场', lang) }}
      </span>
    </header>

    <!--
      属性网格两态：平时点一下掷骰，编辑态改成输入框。
      同一个格子不能既是骰子又是输入框 —— 会有人想掷骰却改了数据。
    -->
    <div v-if="shownAttrs.length" class="bara-cc__attrs">
      <template v-if="editing">
        <div v-for="a in shownAttrs" :key="a.name" class="bara-cc__attr bara-cc__attr--edit">
          <span class="bara-cc__attr-name">{{ a.name }}</span>
          <EditableValue
            :value="String(a.value)"
            kind="number"
            :min="range?.min"
            :max="range?.max"
            :pending="isPending(`base:${a.name}`)"
            @submit="(v) => onAttrSubmit(a.name, v)"
          />
        </div>
      </template>

      <template v-else>
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
      </template>
    </div>

    <footer class="bara-cc__foot">
      <span class="bara-cc__meta">
        <EditableValue
          v-if="editing"
          :value="character.location"
          :placeholder="t('card.location', lang)"
          :pending="isPending('location')"
          @submit="(v) => emit('editLocation', character, v)"
        />
        <template v-else-if="character.location">{{ character.location }}</template>
        <template v-if="hiddenCount">&#12288;+{{ hiddenCount }}</template>
        <template v-if="specialCount">&#12288;◆{{ specialCount }}</template>
      </span>

      <span class="bara-cc__actions">
        <!-- 写入通道不可用时连开关都不出现，而不是给一个点了没用的按钮 -->
        <NButton
          v-if="editable"
          size="small"
          :type="editing ? 'primary' : 'default'"
          :quaternary="!editing"
          :title="t(editing ? 'card.editDone' : 'card.edit', lang)"
          :aria-pressed="editing"
          @click="editing = !editing"
        >
          <template #icon>
            <NIcon :component="editing ? ICONS.ok : ICONS.edit" />
          </template>
        </NButton>
        <NButton size="small" @click="emit('openSheet', character)">
          {{ t('dashboard.openSheet', lang) }}
        </NButton>
      </span>
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
/* 编辑态下的在场标签是个按钮：给指针与焦点环，其余外观保持不变 */
.bara-cc__presence--editable {
  border: 0;
  font: inherit;
  cursor: pointer;
}
.bara-cc__presence--editable:disabled {
  cursor: progress;
}
.bara-cc__presence--editable:focus-visible {
  outline: 2px solid var(--bara-color-primary);
  outline-offset: 2px;
}

/*
 * 属性网格按可读宽度分列，不写死三列。
 *
 * 写死 `repeat(3, 1fr)` 时，卡片一窄，每格只剩五六十像素 ——
 * 「敏捷 65」被压成「敏65」，属性名与数值糊在一起。
 * 交给 auto-fit：放不下三列就两列，再窄就一列，每格始终读得出。
 */
.bara-cc__attrs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(5.5rem, 100%), 1fr));
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
/*
 * 编辑态的格子沿用只读态的底与内距，只把按钮换成输入框 ——
 * 两态尺寸一致，切换时网格不跳。
 */
.bara-cc__attr--edit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-2);
  border-color: var(--bara-color-border);
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

/*
 * 底栏允许换行：窄卡片里「所在地点 + 角色卡按钮」放不下时，
 * 让按钮掉到下一行，而不是把地点挤成一字一行。
 */
.bara-cc__foot {
  display: flex;
  flex-wrap: wrap;
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

.bara-cc__actions {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--bara-space-1);
}
</style>
