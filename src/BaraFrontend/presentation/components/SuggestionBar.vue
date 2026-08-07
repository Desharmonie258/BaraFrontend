<script setup lang="ts">
/**
 * 检定建议条 —— 把建议表的 6 个槽位渲染成可点击发送的按钮。
 *
 * 交互沿用骰子系统的建议按钮：**点击即发送并触发 AI 回复**。
 * 区别在于多提供一个「填入输入框」的旁路 —— 直接发送是不可撤销的
 * 外发动作，误点的代价不小，需要一条先看看再改的路。
 *
 * 分组按类型：主角 / 角色 / 快进。三类的语义完全不同，
 * 混在一排里点错的概率明显更高。
 */
import { computed, ref } from 'vue';
import type { SuggestionVM } from '../../data/repositories/suggestion-repo';
import type { Lang } from '../../stores/ui-store';
import { t } from '../../i18n';
import { NButton, NIcon } from 'naive-ui';
import { ICONS } from '../icons';

const props = defineProps<{
  suggestions: SuggestionVM[];
  lang: Lang;
  /** 点击即发送；关闭时只填入输入框 */
  autoSend: boolean;
  /** 发送通道不可用时禁用全部按钮并给出说明 */
  sendable: boolean;
}>();

const emit = defineEmits<{
  pick: [s: SuggestionVM];
  fill: [s: SuggestionVM];
}>();

/** 正在发送的槽位，期间禁用全部按钮 —— 连点会发出多条消息 */
const busy = ref<number | null>(null);

const GROUPS: Array<{ kind: SuggestionVM['kind']; key: string }> = [
  { kind: '主角', key: 'suggest.group.protagonist' },
  { kind: '角色', key: 'suggest.group.character' },
  { kind: '快进', key: 'suggest.group.skip' },
];

/** 空组不渲染：没有在场重要角色时「角色」组本就应该消失 */
const groups = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    label: t(g.key, props.lang),
    items: props.suggestions.filter((s) => s.kind === g.kind),
  })).filter((g) => g.items.length > 0),
);

/** 悬停提示带上发起者与骰子命令 —— 按钮上只放展示文本，避免过长 */
function hint(s: SuggestionVM): string {
  const parts: string[] = [];
  if (s.actor) parts.push(s.actor);
  if (s.diceCommand) parts.push(s.diceCommand);
  const suffix = parts.length ? `（${parts.join(' · ')}）` : '';
  return t(props.autoSend ? 'suggest.hintSend' : 'suggest.hintFill', props.lang) + suffix;
}

async function onPick(s: SuggestionVM): Promise<void> {
  if (busy.value !== null || !props.sendable) return;
  busy.value = s.slot;
  try {
    emit(props.autoSend ? 'pick' : 'fill', s);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="bara-sug">
    <p v-if="!sendable" class="bara-sug__warn">{{ t('suggest.noComposer', lang) }}</p>

    <div v-for="g in groups" :key="g.kind" class="bara-sug__group">
      <span class="bara-sug__label">{{ g.label }}</span>
      <div class="bara-sug__items">
        <div v-for="s in g.items" :key="s.slot" class="bara-sug__item">
          <!-- 快进类弱化：它是「跳过」而非「行动」，不该和行动项抢注意力 -->
          <NButton
            size="small"
            :quaternary="s.kind === '快进'"
            :disabled="!sendable || busy !== null"
            :title="hint(s)"
            @click="onPick(s)"
          >
            <span v-if="s.actor" class="bara-sug__actor">{{ s.actor }}</span>
            {{ s.displayText }}
          </NButton>
          <!--
            旁路入口：只填入输入框不发送。图标按钮而非文字，
            避免把主操作的视觉重量摊薄。
          -->
          <NButton
            v-if="autoSend"
            size="small"
            quaternary
            :disabled="!sendable || busy !== null"
            :title="t('suggest.fillOnly', lang)"
            @click="emit('fill', s)"
          >
            <template #icon><NIcon :component="ICONS.edit" /></template>
          </NButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bara-sug { display: flex; flex-direction: column; gap: var(--bara-space-3); }

.bara-sug__warn {
  margin: 0;
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
}

.bara-sug__group { display: flex; flex-direction: column; gap: var(--bara-space-2); }
.bara-sug__label {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}

.bara-sug__items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-2);
}
.bara-sug__item { display: inline-flex; align-items: center; gap: 2px; }

/* 发起者作为前缀弱化显示，与建议正文区分 */
.bara-sug__actor {
  margin-right: var(--bara-space-1);
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xs);
}
</style>
