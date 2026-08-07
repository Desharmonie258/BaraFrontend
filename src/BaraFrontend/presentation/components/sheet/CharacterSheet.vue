<script setup lang="ts">
/**
 * 完整角色卡 —— 独立模态窗口（文档 §8.3、§8.4「完整卡」密度）。
 *
 * 用模态而非目的地：角色卡是「看一眼就关」的临时窗口，
 * 占掉主视图不合适。
 *
 * **`:to` 必须显式指定**。Naive 的弹层默认 teleport 到 `document.body`，
 * 而脚本里的 `document` 是 iframe 的文档 —— 不指定就会落进不可见的
 * iframe，表现为「点了没反应」。挂到插件根容器上还能继承 --bara-* 变量。
 *
 * 四页结构（总览 / 库存 / 特性 / 传记）与数据来源见 domain/sheet-sections。
 * 头部常驻不随页签滚动：姓名与要害数值翻到哪一页都要可见。
 */
import { computed, ref } from 'vue';
import { NModal, NCard, NTabs, NTabPane, NButton } from 'naive-ui';
import type { CharacterVM } from '../../../data/repositories/character-repo';
import { readResources } from '../../../data/repositories/sheet-repo';
import type { Lang } from '../../../stores/ui-store';
import type { RuleFamily } from '../../../domain/rule-systems';
import { t } from '../../../i18n';
import { getOverlayRoot } from '../../bootstrap/mount';
import SheetHeader from './SheetHeader.vue';
import SheetSummary from './SheetSummary.vue';
import SheetInventory from './SheetInventory.vue';
import SheetFeature from './SheetFeature.vue';
import SheetBio from './SheetBio.vue';

const props = defineProps<{
  show: boolean;
  character: CharacterVM | null;
  lang: Lang;
  /** 当前规则族，向下传给属性网格决定是否展示调整值 */
  family: RuleFamily;
}>();

const emit = defineEmits<{
  'update:show': [v: boolean];
  rollAttribute: [
    character: CharacterVM,
    name: string,
    value: number,
    modifier: number | null,
  ];
}>();

const tab = ref<string>('summary');
const resources = computed(() =>
  props.character ? readResources(props.character) : [],
);

function onRoll(name: string, value: number, modifier: number | null): void {
  if (props.character) emit('rollAttribute', props.character, name, value, modifier);
}
</script>

<template>
  <NModal
    :show="show"
    :to="getOverlayRoot()"
    transform-origin="center"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NCard
      v-if="character"
      class="bara-sheet"
      size="small"
      :bordered="false"
      role="dialog"
      :aria-modal="true"
    >
      <template #header>
        <SheetHeader :character="character" :resources="resources" :lang="lang" />
      </template>
      <template #header-extra>
        <NButton size="small" quaternary @click="emit('update:show', false)">
          {{ t('sheet.close', lang) }}
        </NButton>
      </template>

      <NTabs v-model:value="tab" type="segment" size="small" animated>
        <NTabPane name="summary" :tab="t('sheet.tab.summary', lang)">
          <div class="bara-sheet__body">
            <SheetSummary
              :character="character"
              :resources="resources"
              :lang="lang"
              :family="family"
              @roll-attribute="onRoll"
            />
          </div>
        </NTabPane>
        <NTabPane name="inventory" :tab="t('sheet.tab.inventory', lang)">
          <div class="bara-sheet__body">
            <SheetInventory :character="character" :lang="lang" />
          </div>
        </NTabPane>
        <NTabPane name="feature" :tab="t('sheet.tab.feature', lang)">
          <div class="bara-sheet__body">
            <SheetFeature :character="character" :lang="lang" />
          </div>
        </NTabPane>
        <NTabPane name="bio" :tab="t('sheet.tab.bio', lang)">
          <div class="bara-sheet__body">
            <SheetBio :character="character" :lang="lang" />
          </div>
        </NTabPane>
      </NTabs>
    </NCard>
  </NModal>
</template>

<style scoped>
/*
 * 窗口尺寸随视口走：嵌在聊天里，屏幕宽度差异很大。
 * 上限避免宽屏下一行文字横跨整屏，下限保证窄屏也够放两列。
 */
.bara-sheet {
  width: 90vw;
  max-width: 56rem;
}

/*
 * 只让页内容滚动，头部与页签固定。整窗滚动会让人翻到下面就
 * 忘了在看谁的卡。
 */
.bara-sheet__body {
  max-height: 60vh;
  overflow-y: auto;
  padding-top: var(--bara-space-3);
}
</style>
