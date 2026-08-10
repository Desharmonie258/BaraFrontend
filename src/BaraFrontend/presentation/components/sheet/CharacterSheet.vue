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
 *
 * ## 手改（1.11）
 *
 * 抽屉里能改的是**仪表盘上没有入口的那些**：特有属性与资源。
 * 基础属性两边都能改 —— 抽屉里格子更大，一次要调好几项时比在卡片上顺手。
 *
 * 写入在这里执行而不是抛给页面：模态盖住了页面的回执条，
 * 失败提示落在下面等于没提示。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { NModal, NCard, NTabs, NTabPane, NButton, NIcon, NAlert } from 'naive-ui';
import type { CharacterVM } from '../../../data/repositories/character-repo';
import { readResources, type ResourceVM } from '../../../data/repositories/sheet-repo';
import { canEdit, writeCell, type EditOutcome } from '../../../data/repositories/cell-editor';
import {
  setAttribute, setResource, attributeRange, type ResourceField,
} from '../../../data/repositories/character-editor';
import { isGenerating, onGenerationChange, watchGeneration } from '../../../data/generation-watch';
import type { AttributeKind } from '../../../domain/attribute-presets';
import type { Lang } from '../../../stores/ui-store';
import type { RuleFamily } from '../../../domain/rule-systems';
import { t } from '../../../i18n';
import { ICONS } from '../../icons';
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
  /** 手改成功。页面据此重读，否则关掉抽屉后仪表盘还是旧值。 */
  changed: [];
  rollAttribute: [
    character: CharacterVM,
    name: string,
    value: number,
    modifier: number | null,
  ];
}>();

const tab = ref<string>('summary');

/**
 * 资源。写入后要重读，因此不能是纯 computed —— 快照是值拷贝，
 * 不重读界面仍是旧值。`version` 一推进就重算。
 */
const version = ref(0);
const resources = computed<ResourceVM[]>(() => {
  void version.value;
  return props.character ? readResources(props.character) : [];
});

function onRoll(name: string, value: number, modifier: number | null): void {
  if (props.character) emit('rollAttribute', props.character, name, value, modifier);
}

/* ── 手改 ─────────────────────────────────────────────── */

const editing = ref(false);
const writable = ref(false);
const generating = ref(false);
const pending = ref<string | null>(null);
const notice = ref<{ tone: 'success' | 'danger'; text: string } | null>(null);

/** 编辑入口开不开：写入通道在，且 AI 没在生成 */
const canEditNow = computed(() => writable.value && !generating.value);

/** 两档属性的区间不同：d20 族特有属性记的是加值（-5..25），别拿基础属性的夹 */
const ranges = computed(() => ({
  base: attributeRange(props.family, 'base'),
  special: attributeRange(props.family, 'special'),
}));

/*
 * 每次打开重新探测并回到只读态。
 *
 * 存储模式可以在运行中被切走；而编辑态残留到下次打开，
 * 会让人一开卡就对着一屏输入框，还以为自己上次没关。
 */
watch(
  () => props.show,
  (open) => {
    if (!open) {
      editing.value = false;
      notice.value = null;
      return;
    }
    watchGeneration();
    writable.value = canEdit();
    generating.value = isGenerating();
    version.value += 1;
  },
);

/* 换人也退出编辑态 —— 模态复用同一个实例，不退就把编辑态带到了别人卡上 */
watch(() => props.character?.rowIndex, () => { editing.value = false; });
/* 不能改了就收起，否则留着一屏改不动的输入框 */
watch(canEditNow, (v) => { if (!v) editing.value = false; });

const stopWatchGeneration = onGenerationChange((v) => {
  generating.value = v;
  // 生成结束意味着 AI 刚写完表，这时重读才看得到新数据
  if (!v) version.value += 1;
});
onBeforeUnmount(stopWatchGeneration);

/**
 * 跑一次手改。与仪表盘同一套：串行、写完重读、成功不打扰。
 *
 * 回执显示在模态内 —— 页面的回执条被模态盖住，落在下面等于没有。
 */
async function runEdit(key: string, action: () => Promise<EditOutcome>): Promise<void> {
  if (pending.value) return;
  pending.value = key;
  notice.value = null;
  try {
    const result = await action();
    if (result.ok) {
      version.value += 1;
      emit('changed');
      if (result.baselineStale) {
        notice.value = { tone: 'danger', text: t('card.editBaselineStale', props.lang) };
      }
    } else {
      notice.value = { tone: 'danger', text: result.message || t('card.editFailed', props.lang) };
    }
  } finally {
    pending.value = null;
  }
}

function onEditAttribute(kind: AttributeKind, name: string, value: number): void {
  const c = props.character;
  if (!c) return;
  void runEdit(`${kind}:${name}`, () => setAttribute(c, kind, name, value, props.family));
}

function onEditResource(resource: ResourceVM, field: ResourceField, value: number): void {
  void runEdit(`res:${resource.id}:${field}`, () => setResource(resource, field, value));
}

/**
 * 分区里的普通格子（技能 / 特性 / 状态 / 库存…）。
 *
 * 这些分区一行就是一行，不像属性那样挤在打包串里，所以直接走 `writeCell`。
 * 表名由分区带上来 —— 一页上挂着两个分区时，光有行号分不出该写哪张表。
 */
function onSectionCell(
  sheetName: string,
  rowIndex: number,
  column: string,
  value: string,
): void {
  if (!sheetName) return;
  // 标识与 SectionList 的 fieldKey 同构，否则 pending 对不上号
  void runEdit(`${sheetName}#${rowIndex}#${column}`, () =>
    writeCell({ sheetName, rowIndex, column }, value),
  );
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
        <span class="bara-sheet__acts">
          <!-- 写入通道不可用、或 AI 正在生成时整个不出现 -->
          <NButton
            v-if="canEditNow"
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
          <NButton size="small" quaternary @click="emit('update:show', false)">
            {{ t('sheet.close', lang) }}
          </NButton>
        </span>
      </template>

      <!-- 回执在模态内：页面那条被模态盖住，落在下面等于没有 -->
      <NAlert
        v-if="notice"
        type="error"
        closable
        class="bara-sheet__alert"
        @close="notice = null"
      >
        {{ notice.text }}
      </NAlert>

      <NTabs v-model:value="tab" type="segment" size="small" animated>
        <NTabPane name="summary" :tab="t('sheet.tab.summary', lang)">
          <div class="bara-sheet__body">
            <SheetSummary
              :character="character"
              :resources="resources"
              :lang="lang"
              :family="family"
              :editing="editing"
              :ranges="ranges"
              :pending="pending"
              :refresh-key="version"
              @roll-attribute="onRoll"
              @edit-attribute="onEditAttribute"
              @edit-resource="onEditResource"
              @set-cell="onSectionCell"
            />
          </div>
        </NTabPane>
        <NTabPane name="inventory" :tab="t('sheet.tab.inventory', lang)">
          <div class="bara-sheet__body">
            <SheetInventory
              :character="character"
              :lang="lang"
              :editing="editing"
              :pending="pending"
              :refresh-key="version"
              @set-cell="onSectionCell"
            />
          </div>
        </NTabPane>
        <NTabPane name="feature" :tab="t('sheet.tab.feature', lang)">
          <div class="bara-sheet__body">
            <SheetFeature
              :character="character"
              :lang="lang"
              :editing="editing"
              :pending="pending"
              :refresh-key="version"
              @set-cell="onSectionCell"
            />
          </div>
        </NTabPane>
        <NTabPane name="bio" :tab="t('sheet.tab.bio', lang)">
          <div class="bara-sheet__body">
            <SheetBio
              :character="character"
              :lang="lang"
              :editing="editing"
              :pending="pending"
              :refresh-key="version"
              @set-cell="onSectionCell"
            />
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

.bara-sheet__acts {
  display: inline-flex;
  align-items: center;
  gap: var(--bara-space-1);
}
.bara-sheet__alert { margin-bottom: var(--bara-space-3); }
</style>
