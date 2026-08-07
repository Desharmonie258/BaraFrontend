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
import { computed, ref, watch } from 'vue';
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

/** 面板全不适用。加载中不算 —— 那时 caps 还没读出来，会误判成整页无内容 */
const noPanels = computed(
  () => schema.loaded && !caps.value.protagonist && !caps.value.characters && !caps.value.supplies,
);

function load(): void {
  if (!canRead()) {
    notReady.value = true;
    protagonist.value = null;
    tracked.value = [];
    return;
  }
  notReady.value = false;
  caps.value = readCapabilities();
  protagonist.value = readProtagonist();
  tracked.value = readTrackedCharacters();
  supplies.value = readSupplyCounts();
  suggestions.value = readSuggestions();
  sendable.value = canSend();
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
          @open-sheet="onOpenSheet"
          @roll-attribute="onRoll"
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
            @open-sheet="onOpenSheet"
            @roll-attribute="onRoll"
          />
        </div>
        <NEmpty v-else size="small" :description="t('dashboard.empty.chars', ui.lang)" />
      </NCard>

      <NCard
        v-if="!schema.loaded || caps.supplies"
        :title="t('dashboard.supplies', ui.lang)"
        size="small"
      >
        <div class="bara-dash__supplies">
          <NStatistic :label="t('dashboard.items', ui.lang)" :value="supplies.items" />
          <NStatistic :label="t('dashboard.equipment', ui.lang)" :value="supplies.equipment" />
        </div>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.bara-dash__alert { margin-bottom: var(--bara-space-4); }
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

.bara-dash {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--bara-space-4);
  align-items: start;
}
@media (min-width: 760px) {
  .bara-dash { grid-template-columns: 1fr 1.4fr 0.8fr; }
}

.bara-dash__chars {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--bara-space-3);
}
@media (min-width: 1100px) {
  .bara-dash__chars { grid-template-columns: repeat(2, 1fr); }
}

.bara-dash__supplies { display: flex; gap: var(--bara-space-5); }
</style>
