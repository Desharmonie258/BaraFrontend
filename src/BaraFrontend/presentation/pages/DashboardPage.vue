<script setup lang="ts">
/**
 * 仪表盘（§8.9b）—— 默认目的地，与每张表平级。
 *
 * 空面板显示占位文案而非整块隐藏：面板消失会让布局在数据增减时跳动。
 * 这与人物小传内「空值列整条隐藏」的处理相反 —— 那里是阅读性长文，
 * 这里是固定看板，两种场景诉求不同。
 *
 * 默认只显示在场角色：仪表盘服务于「当前局面」，20 个跟踪角色会把它
 * 撑得很长。需要看全部时切换即可。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { canRead } from '../../data/db-gateway';
import {
  readProtagonist, readTrackedCharacters, readSupplyCounts, readCapabilities,
  type CharacterVM, type SupplyCounts, type CharacterCapabilities,
} from '../../data/repositories/character-repo';
import { t } from '../../i18n';
import {
  NRadioGroup, NRadioButton, NCard, NAlert, NEmpty, NButton, NStatistic, NSkeleton, NIcon,
} from 'naive-ui';
import { ICONS } from '../icons';
import CharacterCard from '../components/CharacterCard.vue';
import SuggestionBar from '../components/SuggestionBar.vue';
import CharacterSheet from '../components/sheet/CharacterSheet.vue';
import CheckDialog from '../components/check/CheckDialog.vue';
import type { CheckRequest } from '../../domain/dice/resolve';
import { runCommand } from '../../data/repositories/check-runner';
import { readSuggestions, type SuggestionVM } from '../../data/repositories/suggestion-repo';
import { sendChatText, fillComposer, canSend } from '../../data/chat-sender';
import { canEdit, type EditOutcome } from '../../data/repositories/cell-editor';
import {
  setAttribute, setLocation, setPresence, attributeRange,
} from '../../data/repositories/character-editor';
import type { AttributeKind } from '../../domain/attribute-presets';
import { readGlobalState, setGlobalField, type GlobalState } from '../../data/repositories/global-repo';
import {
  readSupplies, setSupplyCell, addSupply, removeSupply,
  type SupplyKind, type SupplyList,
} from '../../data/repositories/supply-repo';
import EditableValue from '../components/EditableValue.vue';
import SupplyPanel from '../components/SupplyPanel.vue';
import { watchGeneration, isGenerating, onGenerationChange } from '../../data/generation-watch';
import { readRelations, type RelationData } from '../../data/repositories/relation-repo';
import RelationGraph from '../components/RelationGraph.vue';

const ui = useUiStore();
const schema = useSchemaStore();

const protagonist = ref<CharacterVM | null>(null);
const tracked = ref<CharacterVM[]>([]);
const supplies = ref<SupplyCounts>({ items: 0, equipment: 0 });
const notReady = ref(false);

/**
 * 各面板依赖的表在当前模板里存不存在。
 *
 * 顶部注释说「空面板显示占位而非整块隐藏，否则布局会随数据增减跳动」——
 * 那条针对的是**表里没数据**。表**根本不存在**是另一回事：它在这份模板下
 * 恒定为假，不会跳动，而一块永远不会有内容的面板留在那里只是空壳。
 * 用别的数据库模板的用户看到的正是这个（如小剧场3.3 没有任何角色表）。
 */
const caps = ref<CharacterCapabilities>({
  protagonist: true, characters: true, supplies: true,
});

const suggestions = ref<SuggestionVM[]>([]);
const sendable = ref(true);

/*
 * 手改（1.11）。
 *
 * `editable` 每次 load 重新探测：存储模式可以在运行中被切走，
 * 挂载时探一次然后一直信它，会让入口停在一个已经不成立的状态上。
 */
const writable = ref(false);
/** AI 正在生成 —— 这一轮的表格更新会盖掉手改，编辑入口先收起来 */
const generating = ref(false);

/**
 * 编辑入口开不开。
 *
 * 两个条件缺一不可：写入通道在，且 AI 没在生成。生成期间改的值几乎必然
 * 被这一轮的表格更新覆盖 —— 改了、看着变了、下一秒变回去，
 * 比不让改更让人困惑。
 */
const editable = computed(() => writable.value && !generating.value);
/** 正在写入的字段标识。一次只放行一个，避免同一格连点两次打两次库。 */
const editPending = ref<string | null>(null);
/** 手改的回执。成功不打扰，失败与「基线没跟上」才出声。 */
const editNotice = ref<{ tone: 'success' | 'danger'; text: string } | null>(null);

/** 当前规则族下的属性区间，传给卡片做输入钳制 */
const attrRange = computed(() => attributeRange(ui.ruleSystem, 'base'));

/** 全局状态（当前时间与地点）。表不在时 available=false，面板整块不渲染。 */
const globalState = ref<GlobalState>({ available: false, sheetName: '', entries: [] });

function onEditGlobal(column: string, value: string): void {
  void runEdit(`global#${column}`, () => setGlobalField(column, value));
}

/** 人物关系。表认不出时 available=false，面板整块不渲染。 */
const relations = ref<RelationData>({ available: false, relations: [] });

/* 物资清单。1.1 只有计数，1.11 摊成可改可增删的列表。 */
const items = ref<SupplyList>(readSupplies('items'));
const equipment = ref<SupplyList>(readSupplies('equipment'));
const supplyLists = computed<Array<{ kind: SupplyKind; label: string; list: SupplyList; empty: string }>>(
  () => [
    {
      kind: 'items', list: items.value,
      label: t('dashboard.items', ui.lang), empty: t('dashboard.empty.items', ui.lang),
    },
    {
      kind: 'equipment', list: equipment.value,
      label: t('dashboard.equipment', ui.lang), empty: t('dashboard.empty.equipment', ui.lang),
    },
  ].filter((g) => g.list.available),
);

function listOf(kind: SupplyKind): SupplyList {
  return kind === 'items' ? items.value : equipment.value;
}

function onSupplyCell(kind: SupplyKind, rowIndex: number, column: string, value: string): void {
  const list = listOf(kind);
  void runEdit(`${list.sheetName}#${rowIndex}#${column}`, () =>
    setSupplyCell(list, rowIndex, column, value),
  );
}

function onSupplyAdd(kind: SupplyKind, name: string): void {
  const list = listOf(kind);
  void runEdit(`${list.sheetName}#add`, () => addSupply(list, name));
}

function onSupplyRemove(kind: SupplyKind, rowIndex: number): void {
  const list = listOf(kind);
  void runEdit(`${list.sheetName}#${rowIndex}#remove`, () => removeSupply(list, rowIndex));
}
/** 发送结果提示。发送是外发动作，必须给出明确回执。 */
const sendNotice = ref<{ tone: 'success' | 'danger'; text: string } | null>(null);

const scope = ref<'present' | 'all'>('present');
const scopeOptions = computed(() => [
  { label: t('dashboard.showPresent', ui.lang), value: 'present' },
  { label: t('dashboard.showAll', ui.lang), value: 'all' },
]);

/** 在场优先、姓名次之。顺序必须稳定 —— 每轮重排会让人找不到上次点的卡。 */
const visibleChars = computed(() => {
  const list = scope.value === 'present' ? tracked.value.filter((c) => c.present) : tracked.value;
  return [...list].sort((a, b) => {
    if (a.present !== b.present) return a.present ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
});

const presentCount = computed(() => tracked.value.filter((c) => c.present).length);

/**
 * 面板全不适用。加载中不算 —— 那时 caps 还没读出来，会误判成整页无内容。
 *
 * 全局面板也要算进来：只有它可用时说「整页没内容」会与它自己的存在打架。
 */
const noPanels = computed(
  () =>
    schema.loaded &&
    !caps.value.protagonist &&
    !caps.value.characters &&
    !caps.value.supplies &&
    !globalState.value.available &&
    !relations.value.available,
);

function load(): void {
  if (!canRead()) {
    notReady.value = true;
    protagonist.value = null;
    tracked.value = [];
    globalState.value = { available: false, sheetName: '', entries: [] };
    return;
  }
  notReady.value = false;
  caps.value = readCapabilities();
  protagonist.value = readProtagonist();
  tracked.value = readTrackedCharacters();
  supplies.value = readSupplyCounts();
  suggestions.value = readSuggestions();
  sendable.value = canSend();
  writable.value = canEdit();
  globalState.value = readGlobalState();
  items.value = readSupplies('items');
  equipment.value = readSupplies('equipment');
  relations.value = readRelations();
}

/**
 * 跑一次手改。
 *
 * 三件事在这里统一做，卡片只管发意图：
 *
 * - **串行**：`editPending` 占位期间不接第二次请求。同一格连点两次会
 *   让后一次基于前一次尚未落库的旧值算，属性打包串尤其危险
 * - **重读**：写成功后必须 `load()`。快照是值拷贝，不重读界面仍是旧值，
 *   而「界面显示已改、库里其实没改」与其反面一样让人无从判断
 * - **回执**：成功不弹提示（改完就看见了），失败与基线没跟上才出声
 */
async function runEdit(key: string, action: () => Promise<EditOutcome>): Promise<void> {
  if (editPending.value) return;
  editPending.value = key;
  editNotice.value = null;
  try {
    const result = await action();
    if (result.ok) {
      load();
      if (result.baselineStale) {
        editNotice.value = { tone: 'danger', text: t('card.editBaselineStale', ui.lang) };
      }
    } else {
      editNotice.value = {
        tone: 'danger',
        text: result.message || t('card.editFailed', ui.lang),
      };
    }
  } finally {
    editPending.value = null;
  }
}

/** 字段标识要与 CharacterCard 的 fieldKey 同构，否则 pending 对不上号 */
function fieldKey(c: CharacterVM, field: string): string {
  return `${c.sheetName}#${c.rowIndex}#${field}`;
}

/*
 * 生成状态的订阅。订阅一次、活到组件销毁 ——
 * 轮询探测「有没有在生成」是白付电，而这个状态一天变不了几次。
 */
let stopWatchGeneration: (() => void) | null = null;
onMounted(() => {
  watchGeneration();
  generating.value = isGenerating();
  stopWatchGeneration = onGenerationChange((v) => {
    generating.value = v;
    // 生成结束意味着 AI 刚写完表，这时重读才看得到新数据
    if (!v) load();
  });
});
onBeforeUnmount(() => stopWatchGeneration?.());

function onEditAttribute(c: CharacterVM, kind: AttributeKind, attr: string, value: number): void {
  void runEdit(fieldKey(c, `${kind}:${attr}`), () =>
    setAttribute(c, kind, attr, value, ui.ruleSystem),
  );
}

function onEditLocation(c: CharacterVM, value: string): void {
  void runEdit(fieldKey(c, 'location'), () => setLocation(c, value));
}

function onEditPresence(c: CharacterVM, present: boolean): void {
  void runEdit(fieldKey(c, 'presence'), () => setPresence(c, present));
}

/**
 * 发送一条建议。发送成功后不主动刷新 —— AI 回复会触发表格更新回调，
 * 那时整块自然重载；这里抢先刷新只会读到还没变的旧数据。
 */
/**
 * 把一条建议组装成要发出去的完整文本。
 *
 * 有骰子命令就当场掷，结果作为元叙事附在展示文本之后 ——
 * 两段一起发才构成一个完整回合：玩家做了什么、判定结果如何。
 *
 * 命令跑不通时**降级为只发展示文本**，并把原因提示出来。AI 写坏一条
 * 命令是常态，不该让整条建议点不动。
 */
function composeSuggestion(s: SuggestionVM): { text: string; warn: string | null } {
  if (!s.diceCommand) return { text: s.displayText, warn: null };

  const out = runCommand(s.diceCommand, ui.ruleSystem, ui.lang);
  switch (out.status) {
    case 'ok':
    case 'auto':
      return { text: `${s.displayText}
${out.text}`, warn: null };
    case 'skip':
      return { text: s.displayText, warn: null };
    default:
      return {
        text: s.displayText,
        warn: t(`check.err.${out.reason}`, ui.lang, { detail: out.detail ?? '' }),
      };
  }
}

async function onPickSuggestion(s: SuggestionVM): Promise<void> {
  sendNotice.value = null;
  const { text, warn } = composeSuggestion(s);
  const mode = await sendChatText(text);

  if (!mode) {
    sendNotice.value = { tone: 'danger', text: t('suggest.failed', ui.lang) };
    return;
  }
  sendNotice.value = warn
    ? { tone: 'danger', text: warn }
    : { tone: 'success', text: t('suggest.sent', ui.lang, { text: s.displayText }) };
}

function onFillSuggestion(s: SuggestionVM): void {
  // 填入输入框同样要带上判定结果，否则「先看看再发」看到的是残缺内容
  const { text, warn } = composeSuggestion(s);
  if (!fillComposer(text)) {
    sendNotice.value = { tone: 'danger', text: t('suggest.noComposer', ui.lang) };
    return;
  }
  sendNotice.value = warn
    ? { tone: 'danger', text: warn }
    : { tone: 'success', text: t('suggest.filled', ui.lang) };
}

watch(() => schema.sheets, load, { immediate: true });

/** 打开中的角色卡。null 表示未打开。 */
const sheetTarget = ref<CharacterVM | null>(null);
const sheetOpen = ref(false);

function onOpenSheet(c: CharacterVM): void {
  sheetTarget.value = c;
  sheetOpen.value = true;
}
/**
 * 属性检定入口。调整值由属性网格算好后一并传来，
 * 检定模块不该再自己算一遍 —— 算两遍就有算不一致的机会。
 */
const checkTarget = ref<Omit<CheckRequest, 'difficulty' | 'dc'> | null>(null);
const checkOpen = ref(false);

function onRoll(c: CharacterVM, attr: string, value: number, modifier?: number | null): void {
  checkTarget.value = {
    family: ui.ruleSystem,
    actor: c.name,
    attrName: attr,
    attrValue: value,
    modifier: modifier ?? null,
  };
  checkOpen.value = true;
}
</script>

<template>
  <div>
    <NAlert v-if="notReady" type="warning" class="bara-dash__alert">
      {{ t('error.dbNotReady', ui.lang) }}
    </NAlert>

    <!--
      手改的回执。成功不出声 —— 值当场就变了，再弹一条只是噪声；
      失败与「基线没跟上」必须说，那两种情况用户光看界面判断不出来。
    -->
    <NAlert
      v-if="editNotice"
      type="error"
      closable
      class="bara-dash__alert"
      @close="editNotice = null"
    >
      {{ editNotice.text }}
    </NAlert>

    <!--
      入口无声消失会让人以为功能坏了。只在「本来能改、此刻不能」时说，
      只读模式下不说 —— 那种情况下从来就没有过编辑入口。
    -->
    <NAlert v-if="writable && generating" type="info" class="bara-dash__alert">
      {{ t('dashboard.editLocked', ui.lang) }}
    </NAlert>

    <NCard
      v-if="suggestions.length"
      :title="t('suggest.title', ui.lang)"
      size="small"
      class="bara-dash__suggest"
    >
      <template #header-extra>
        <!-- 开着时用实心主色，关着时用弱化态，靠填充差异区分而非仅靠图标 -->
        <NButton
          size="small"
          :type="ui.suggestAutoSend ? 'primary' : 'default'"
          :quaternary="!ui.suggestAutoSend"
          :title="t('suggest.autoSend', ui.lang)"
          @click="ui.setSuggestAutoSend(!ui.suggestAutoSend)"
        >
          <template #icon>
            <NIcon :component="ui.suggestAutoSend ? ICONS.send : ICONS.edit" />
          </template>
        </NButton>
      </template>

      <NAlert
        v-if="sendNotice"
        :type="sendNotice.tone === 'danger' ? 'error' : 'success'"
        class="bara-dash__alert"
      >
        {{ sendNotice.text }}
      </NAlert>

      <SuggestionBar
        :suggestions="suggestions"
        :lang="ui.lang"
        :auto-send="ui.suggestAutoSend"
        :sendable="sendable"
        @pick="onPickSuggestion"
        @fill="onFillSuggestion"
      />
    </NCard>

    <CheckDialog v-model:show="checkOpen" :request="checkTarget" :lang="ui.lang" />

    <CharacterSheet
      v-model:show="sheetOpen"
      :character="sheetTarget"
      :lang="ui.lang"
      :family="ui.ruleSystem"
      @roll-attribute="(c, a, v, m) => onRoll(c, a, v, m)"
      @changed="load()"
    />

    <!--
      三个面板全不适用：说明原因并指路，绝不留空白页。
      小剧场3.3 这类模板（社交媒体模拟，无任何角色表）走的就是这条。
    -->
    <NEmpty v-if="noPanels" size="small" :description="t('dashboard.unsupported', ui.lang)">
      <template #extra>
        <span class="bara-dash__hint">{{ t('dashboard.unsupported.hint', ui.lang) }}</span>
      </template>
    </NEmpty>

    <div v-else class="bara-dash">
      <!--
        全局面板放在最前：它是「当前局面」的顶层信息，角色都在这个时空里。
        表不在时整块不渲染 —— 恒定为假的面板留在那里只是空壳（与 caps 同理）。
      -->
      <NCard
        v-if="globalState.available"
        :title="t('dashboard.global', ui.lang)"
        size="small"
      >
        <dl class="bara-dash__global">
          <template v-for="e in globalState.entries" :key="e.column">
            <dt class="bara-dash__global-key">{{ e.column }}</dt>
            <dd class="bara-dash__global-val">
              <EditableValue
                :value="e.value"
                :disabled="!editable"
                :pending="editPending === `global#${e.column}`"
                @submit="(v) => onEditGlobal(e.column, v)"
              />
            </dd>
          </template>
        </dl>
      </NCard>

      <NCard
        v-if="!schema.loaded || caps.protagonist"
        :title="t('dashboard.protagonist', ui.lang)"
        size="small"
      >
        <NSkeleton v-if="!schema.loaded" text :repeat="3" />
        <CharacterCard
          v-else-if="protagonist"
          :character="protagonist"
          :lang="ui.lang"
          :family="ui.ruleSystem"
          :editable="editable"
          :range="attrRange"
          :pending="editPending"
          @open-sheet="onOpenSheet"
          @roll-attribute="onRoll"
          @edit-attribute="onEditAttribute"
          @edit-location="onEditLocation"
          @edit-presence="onEditPresence"
        />
        <NEmpty v-else size="small" />
      </NCard>

      <NCard v-if="!schema.loaded || caps.characters" size="small">
        <!-- NCard 的 title 只收字符串，标题带计数时改用 header 插槽 -->
        <template #header>
          <span class="bara-dash__title">{{ t('dashboard.importantChars', ui.lang) }}</span>
          <span class="bara-dash__count">
            ({{ scope === 'present' ? presentCount : tracked.length }})
          </span>
        </template>
        <template #header-extra>
          <NRadioGroup v-model:value="scope" size="small">
            <NRadioButton v-for="o in scopeOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </NRadioButton>
          </NRadioGroup>
        </template>

        <NSkeleton v-if="!schema.loaded" text :repeat="4" />
        <div v-else-if="visibleChars.length" class="bara-dash__chars">
          <CharacterCard
            v-for="c in visibleChars"
            :key="c.rowIndex"
            :character="c"
            :lang="ui.lang"
            :family="ui.ruleSystem"
            :editable="editable"
            :range="attrRange"
            :pending="editPending"
            @open-sheet="onOpenSheet"
            @roll-attribute="onRoll"
            @edit-attribute="onEditAttribute"
            @edit-location="onEditLocation"
            @edit-presence="onEditPresence"
          />
        </div>
        <NEmpty v-else size="small" :description="t('dashboard.empty.chars', ui.lang)" />
      </NCard>

      <!-- 关系图。认不出关系表就整块不渲染，不留一个永远空的画布 -->
      <NCard
        v-if="relations.available"
        :title="t('sheet.section.relations', ui.lang)"
        size="small"
      >
        <RelationGraph :relations="relations.relations" :lang="ui.lang" />
      </NCard>

      <NCard
        v-if="!schema.loaded || caps.supplies"
        :title="t('dashboard.supplies', ui.lang)"
        size="small"
      >
        <!--
          认得出表就摊成清单，认不出仍退回计数 ——
          别家模板的物品表结构未必读得动，那时计数至少还是真的。
        -->
        <div v-if="supplyLists.length" class="bara-dash__supply-groups">
          <section v-for="g in supplyLists" :key="g.kind">
            <h4 class="bara-dash__supply-title">
              {{ g.label }}
              <span class="bara-dash__count">({{ g.list.rows.length }})</span>
            </h4>
            <SupplyPanel
              :list="g.list"
              :lang="ui.lang"
              :editable="editable"
              :pending="editPending"
              :empty-text="g.empty"
              @set-cell="(r, c, v) => onSupplyCell(g.kind, r, c, v)"
              @add="(name) => onSupplyAdd(g.kind, name)"
              @remove="(r) => onSupplyRemove(g.kind, r)"
            />
          </section>
        </div>
        <div v-else class="bara-dash__supplies">
          <NStatistic :label="t('dashboard.items', ui.lang)" :value="supplies.items" />
          <NStatistic :label="t('dashboard.equipment', ui.lang)" :value="supplies.equipment" />
        </div>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.bara-dash__alert { margin-bottom: var(--bara-space-4); }

/*
 * 全局面板用定义列表：字段名与值成对，语义正好是 dl/dt/dd。
 * 两列网格而非 flex 换行 —— 值的长短差得远（「橡木镇」与一句时间描述），
 * flex 下键会跟着值的宽度跳。
 */
.bara-dash__global {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--bara-space-1) var(--bara-space-3);
  margin: 0;
  font-size: var(--bara-font-size-sm);
}
.bara-dash__global-key {
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xs);
  white-space: nowrap;
}
.bara-dash__global-val {
  margin: 0;
  min-width: 0;
  color: var(--bara-color-text);
  overflow-wrap: anywhere;
}

.bara-dash__supply-groups {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-4);
}
.bara-dash__supply-title {
  margin: 0 0 var(--bara-space-1);
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text);
}
.bara-dash__title { font-weight: var(--bara-font-weight-medium); }
.bara-dash__count {
  margin-left: var(--bara-space-2);
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
}
.bara-dash__suggest { margin-bottom: var(--bara-space-4); }
.bara-dash__hint {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}

/*
 * 面板栅格：**按内容需要的最小宽度分列**，不按视口断点。
 *
 * 原先是 `1fr 1.4fr 0.8fr` 三列固定比例 + `min-width: 760px` 断点，
 * 两处都不对：
 *
 * - 固定比例让角色那列恒定只占 25%，角色卡在里面被挤成竖排 ——
 *   名字断成两行、身份一字一行、属性格糊成一团
 * - 断点按的是**视口**宽度，而面板的实际宽度取决于聊天区。
 *   宽屏窄聊天区下，媒体查询认为「宽敞」，面板其实只有几百像素
 *
 * `auto-fit` + `minmax` 两个问题一起解决：列宽由内容的最低可读宽度决定，
 * 放不下就自动少一列，与视口无关。
 */
.bara-dash {
  display: grid;
  /*
   * `min(19rem, 100%)` 不能省：容器比 19rem 还窄时，
   * 裸的 minmax 下限不会收缩，列宽仍是 19rem —— 页面横向溢出，
   * 而这是 §8.12 明令禁止的（body 永远不横向滚动）。
   */
  grid-template-columns: repeat(auto-fit, minmax(min(19rem, 100%), 1fr));
  gap: var(--bara-space-4);
  align-items: start;
}

/* 角色卡的最低可读宽度比面板小一档：属性网格三列，每列约 5rem */
.bara-dash__chars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
  gap: var(--bara-space-3);
}

/* 物资两个统计在窄列里也要能换行，不然会顶破容器 */
.bara-dash__supplies {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-5);
}
</style>
