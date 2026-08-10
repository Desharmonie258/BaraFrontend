<script setup lang="ts">
/**
 * 就地编辑的值 —— 平时是一段文字，点一下变成输入框。
 *
 * ## 为什么不是常驻输入框
 *
 * 仪表盘是看板，绝大多数时候用户在看而不是在改。满屏输入框会让人以为
 * 这是一张表单，也会把「AI 填的」与「我填的」在观感上混成一谈。
 * 所以默认是文字，编辑是一个要主动进入的状态。
 *
 * ## 回滚靠受控，不靠记录旧值
 *
 * 草稿是组件内部的，`value` 由上层持有。提交后上层写库、重新读取、
 * 传入新的 `value`；写失败则 `value` 不变，退出编辑态时草稿被丢弃 ——
 * 界面自然回到原值。不需要在别处记一份「旧值」再手动还原：
 * 那份记录一旦与真实数据不同步，回滚就会把错的值写回去。
 *
 * ## 提交时机
 *
 * 回车与失焦都提交，Esc 取消。失焦提交是必须的 —— 点完输入框直接去点
 * 别处是最常见的操作，此时丢掉刚输入的内容会让人以为程序坏了。
 * 值没变则不提交，避免每次进出编辑态都打一次库。
 */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { NInput, NInputNumber, NSpin } from 'naive-ui';

const props = defineProps<{
  /** 当前值。提交后由上层刷新传入，组件不自行改它。 */
  value: string;
  /** number 用数字输入框并做范围钳制，text 用文本框 */
  kind?: 'text' | 'number';
  /** 数值范围，仅 kind='number' 有意义 */
  min?: number;
  max?: number;
  /** 不可编辑时退化为纯文本，不给任何交互暗示 */
  disabled?: boolean;
  /** 写入中。禁用输入并显示指示，避免重复提交 */
  pending?: boolean;
  /** 长文本用多行输入框 */
  multiline?: boolean;
  /** 值为空时的占位文字，避免出现一块点不着的空白 */
  placeholder?: string;
}>();

const emit = defineEmits<{ submit: [value: string] }>();

const editing = ref(false);
const draft = ref('');
const input = useTemplateRef<{ focus: () => void }>('input');

const isNumber = computed(() => props.kind === 'number');

/** 数字输入框要 number|null，空值给 null 而不是 0 —— 0 是一个真实的值 */
const numberDraft = computed({
  get: () => {
    const n = Number(draft.value);
    return draft.value.trim() !== '' && Number.isFinite(n) ? n : null;
  },
  set: (v: number | null) => {
    draft.value = v === null ? '' : String(v);
  },
});

async function begin(): Promise<void> {
  if (props.disabled || props.pending) return;
  draft.value = props.value;
  editing.value = true;
  await nextTick();
  input.value?.focus();
}

function cancel(): void {
  editing.value = false;
  draft.value = '';
}

function commit(): void {
  if (!editing.value) return;
  const next = draft.value.trim();
  editing.value = false;
  // 没改就不写。每次进出编辑态都打一次库既慢又会在审核里留噪声
  if (next !== props.value.trim()) emit('submit', next);
  draft.value = '';
}

/*
 * 外部值在编辑期间变了（AI 刚写完这张表）—— 放弃草稿。
 * 继续用旧草稿提交等于拿一份已经过时的数据覆盖 AI 的新值。
 */
watch(
  () => props.value,
  () => {
    if (editing.value) cancel();
  },
);
</script>

<template>
  <span class="bara-edit">
    <template v-if="editing">
      <NInputNumber
        v-if="isNumber"
        ref="input"
        v-model:value="numberDraft"
        size="tiny"
        :min="min"
        :max="max"
        :show-button="false"
        class="bara-edit__input bara-edit__input--num"
        @keyup.enter="commit"
        @keyup.esc="cancel"
        @blur="commit"
      />
      <NInput
        v-else
        ref="input"
        v-model:value="draft"
        size="tiny"
        :type="multiline ? 'textarea' : 'text'"
        :autosize="multiline ? { minRows: 2, maxRows: 6 } : undefined"
        class="bara-edit__input"
        @keyup.enter="multiline ? undefined : commit()"
        @keyup.esc="cancel"
        @blur="commit"
      />
    </template>

    <!--
      不可编辑时渲染 span 而不是禁用的按钮：禁用按钮仍然是个按钮，
      会让人以为「现在不能点」而不是「这里本来就不能改」。
    -->
    <span v-else-if="disabled" class="bara-edit__text">
      {{ value || placeholder || '—' }}
    </span>

    <button
      v-else
      type="button"
      class="bara-edit__text bara-edit__text--editable"
      :disabled="pending"
      @click="begin"
    >
      {{ value || placeholder || '—' }}
      <NSpin v-if="pending" :size="10" class="bara-edit__spin" />
    </button>
  </span>
</template>

<style scoped>
.bara-edit {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.bara-edit__text {
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
  /* 值本身可能很长，允许换行而不是撑破容器 */
  overflow-wrap: anywhere;
}

/*
 * 可编辑的提示用一条虚下划线，而不是边框或按钮样式：
 * 仪表盘上这类值很多，每个都套一个框会把看板变成表单。
 */
.bara-edit__text--editable {
  cursor: text;
  border-bottom: 1px dashed var(--bara-color-border);
}
.bara-edit__text--editable:hover:not(:disabled) {
  border-bottom-color: var(--bara-color-primary);
}
.bara-edit__text--editable:focus-visible {
  outline: 2px solid var(--bara-color-primary);
  outline-offset: 2px;
}
.bara-edit__text--editable:disabled {
  cursor: progress;
}

.bara-edit__spin {
  margin-left: var(--bara-space-1);
}

.bara-edit__input {
  min-width: 6rem;
}
.bara-edit__input--num {
  width: 5.5rem;
}
</style>
