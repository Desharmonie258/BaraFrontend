<script setup lang="ts">
/**
 * 总览页 —— 属性、资源、技能。
 *
 * 属性做成可点的格子而非纯列表（参考截图里的 STR/INT/WIS 卡片）：
 * 点击即发起该属性的检定，这是对局中最高频的动作。
 */
import { computed } from 'vue';
import { NGrid, NGi, NProgress, NEmpty, NDivider, NTag, NButton } from 'naive-ui';
import type { RuleFamily } from '../../../domain/rule-systems';
import {
  attributeModifier,
  formatModifier,
  checkBonus,
  getAttributePreset,
} from '../../../domain/attribute-presets';
import type { CharacterVM } from '../../../data/repositories/character-repo';
import type { ResourceVM } from '../../../data/repositories/sheet-repo';
import { readCharacterSection } from '../../../data/repositories/sheet-repo';
import type { Lang } from '../../../stores/ui-store';
import { t } from '../../../i18n';
import SectionList from './SectionList.vue';

const props = defineProps<{
  character: CharacterVM;
  resources: ResourceVM[];
  lang: Lang;
  /** 当前规则族，决定是否展示调整值 */
  family: RuleFamily;
}>();

/**
 * 检定时把调整值一并上抛 —— 检定模块不该再自己算一遍，
 * 算两遍就有算不一致的机会。
 */
const emit = defineEmits<{
  rollAttribute: [name: string, value: number, modifier: number | null];
}>();

/** 基础属性的调整值。非 d20 族返回 null。 */
function modOf(value: number): number | null {
  return attributeModifier(props.family, value, 'base');
}

/**
 * 特有属性的显示值。
 *
 * 记加值的族（d20）直接把值当加值显示成 `+5`，**不再推算调整值** ——
 * 那个值本身就是加值，再推一次就成了双重计算。
 */
const specialIsBonus = computed(() => getAttributePreset(props.family).specialKind === 'bonus');
function specialText(value: number): string {
  return specialIsBonus.value ? formatModifier(value) : String(value);
}

const skills = computed(() => readCharacterSection('skills', props.character));
/** header 已展示置顶资源，此处列其余的，避免同一条重复两遍 */
const rest = computed(() => props.resources.filter((r) => !r.pinned));
</script>

<template>
  <div class="bara-sum">
    <!-- 属性 -->
    <section>
      <h3 class="bara-sum__h">{{ t('sheet.attrs.base', lang) }}</h3>
      <NGrid v-if="character.baseAttrs.length" :cols="'2 500:3 760:4'" :x-gap="8" :y-gap="8">
        <NGi v-for="a in character.baseAttrs" :key="a.name">
          <NButton
            class="bara-attr"
            quaternary
            :title="t('card.rollHint', lang, { attr: a.name })"
            @click="emit('rollAttribute', a.name, a.value, modOf(a.value))"
          >
            <span class="bara-attr__name">{{ a.name }}</span>
            <span class="bara-attr__row">
              <span class="bara-attr__value">{{ a.value }}</span>
              <NTag v-if="modOf(a.value) !== null" size="tiny" :bordered="false">
                {{ formatModifier(modOf(a.value)!) }}
              </NTag>
            </span>
          </NButton>
        </NGi>
      </NGrid>
      <NEmpty v-else size="small" />
    </section>

    <template v-if="character.specialAttrs.length">
      <NDivider class="bara-sum__rule" />
      <section>
        <h3 class="bara-sum__h">{{ t('sheet.attrs.special', lang) }}</h3>
        <NGrid :cols="'2 500:3 760:4'" :x-gap="8" :y-gap="8">
          <NGi v-for="a in character.specialAttrs" :key="a.name">
            <NButton
              class="bara-attr bara-attr--special"
              quaternary
              :title="t('card.rollHint', lang, { attr: a.name })"
              @click="emit('rollAttribute', a.name, a.value, checkBonus(family, a.value, 'special'))"
            >
              <span class="bara-attr__name">{{ a.name }}</span>
              <span class="bara-attr__row">
                <span class="bara-attr__value">{{ specialText(a.value) }}</span>
                <!-- 关联的基础属性，来自打包串第三段 -->
                <NTag v-if="a.key" size="tiny" :bordered="false">{{ a.key }}</NTag>
              </span>
            </NButton>
          </NGi>
        </NGrid>
      </section>
    </template>

    <!-- 资源 -->
    <template v-if="rest.length">
      <NDivider class="bara-sum__rule" />
      <section>
        <h3 class="bara-sum__h">{{ t('sheet.section.resources', lang) }}</h3>
        <div class="bara-sum__res">
          <div v-for="r in rest" :key="r.name" class="bara-res">
            <div class="bara-res__top">
              <span class="bara-res__name">{{ r.name }}</span>
              <NTag v-if="r.refresh" size="tiny" :bordered="false">{{ r.refresh }}</NTag>
              <span class="bara-res__num">
                {{ r.current ?? '—' }}<template v-if="r.max !== null"> / {{ r.max }}</template>
              </span>
            </div>
            <NProgress
              v-if="r.percent !== null"
              type="line"
              :percentage="r.percent"
              :show-indicator="false"
              :height="6"
              :border-radius="3"
            />
          </div>
        </div>
      </section>
    </template>

    <!-- 技能 -->
    <NDivider class="bara-sum__rule" />
    <section>
      <h3 class="bara-sum__h">{{ t('sheet.section.skills', lang) }}</h3>
      <SectionList
        :section="skills"
        group-by="类型"
        :tag-columns="['熟练度', '关联属性', '品质']"
        :body-columns="['备注']"
        :empty-text="t('sheet.empty.skills', lang)"
      />
    </section>
  </div>
</template>

<style scoped>
.bara-sum { display: flex; flex-direction: column; }
.bara-sum__rule { margin: var(--bara-space-5) 0 var(--bara-space-3); }
.bara-sum__h {
  margin: 0 0 var(--bara-space-3);
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text-muted);
}

/*
 * 属性格是纵向排布的方块，而 NButton 定高、内容横向居中。
 * 这两项它不提供开关，只能放开高度并改内容容器的排布。
 */
.bara-attr {
  width: 100%;
  height: auto;
  padding: var(--bara-space-2);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-surface);
}
.bara-attr :deep(.n-button__content) {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.bara-attr:hover { border-color: var(--bara-color-primary); }
.bara-attr--special { background: var(--bara-color-accent-soft); }

.bara-attr__name {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
  text-align: center;
  word-break: break-word;
}
/* 值与调整值同排：调整值是值的注解，不该另起一行 */
.bara-attr__row {
  display: flex;
  align-items: baseline;
  gap: var(--bara-space-1);
}
.bara-attr__value {
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-lg);
  color: var(--bara-color-text);
}

.bara-sum__res { display: flex; flex-direction: column; gap: var(--bara-space-3); }
.bara-res { display: flex; flex-direction: column; gap: 2px; }
.bara-res__top {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
}
.bara-res__name {
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text);
  min-width: 0;
  word-break: break-word;
}
.bara-res__num {
  margin-left: auto;
  flex: none;
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text-muted);
}
</style>
