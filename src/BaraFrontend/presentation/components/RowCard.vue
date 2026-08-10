<script setup lang="ts">
/**
 * 行卡片 —— 一行数据渲染为一张卡，卡内按「字段名 + 值」罗列。
 *
 * 这是宽表在窄屏下的主力形态：44 列的表用网格必然横向溢出，
 * 卡片把横向的列压成纵向字段列表（§8.9d）。
 *
 * 骨架用 NThing：标题 / 附加信息 / 描述 / 正文四段是它内建的分区，
 * 正好对应卡片的「名称 / 行号 / 可编辑枚举 / 其余字段」。
 * 字段区用 NRow + NCol 的 24 栅格，短字段占半行、长文本占整行。
 *
 * 渲染规则：
 * - **一律换行，不截断**。完整显示内容优先于版面整齐 ——
 *   表格数据是用户的存档，看不全等于没有。
 * - 空值字段整条跳过。宽表里大量列为空是常态，逐条显示「暂无」
 *   会把卡片撑成一屏噪声。
 * - 枚举列分两种渲染：可编辑的列成一排可点选项；只读的只显示当前值。
 *   哪些可编辑由 domain/enum-policy 决定（默认仅 NPC 表的归档状态）。
 *
 * ## 编辑模式（1.11）
 *
 * 开着时整张卡每一格都能改，空值字段也不再跳过 —— 值为空时正是最需要
 * 填它的时候，隐藏起来反而没法操作。枚举列此时放开全部选项，
 * 不再受 enum-policy 限制：用户已经明确表示「我要改这张表」。
 */
import { computed } from 'vue';
import { NCard, NThing, NRow, NCol, NButton, NSpace, NTag, NDivider, NIcon, NPopconfirm } from 'naive-ui';
import { ICONS } from '../icons';
import { t } from '../../i18n';
import type { Lang } from '../../stores/ui-store';
import EditableValue from './EditableValue.vue';
import type { ActionItem } from '../../domain/interaction-rules';
import type { TableRow } from '../../data/repositories/table-repo';

const props = defineProps<{
  row: TableRow;
  columns: string[];
  index: number;
  /** 枚举列的候选值：列展示名 → 可选值 */
  enums?: Record<string, string[]>;
  /** 其中允许编辑的列展示名。未列出的只读展示当前值。 */
  editableEnums?: string[];
  /** 正在写入的字段标识（`行号#列名`），写入期间禁用该字段避免重复提交 */
  pending?: string | null;
  /** 编辑模式：整张卡可改，且不再跳过空值字段 */
  editMode?: boolean;
  /**
   * 这一行可执行的交互动作（1.11）。
   *
   * 由上层按表名匹配交互规则算出，整张表共用一组 —— 因此**不在这里
   * 按行再算一遍**，那会把同一件事做 50 遍。
   */
  actions?: ActionItem[];
  /** 每个动作最终会发出去的那句话，用作按钮 tooltip。键是动作 label。 */
  actionPreview?: (action: ActionItem, name: string) => string;
  lang?: Lang;
}>();

const emit = defineEmits<{
  /** 请求把某列改为某值。实际写入由上层执行。 */
  setCell: [rowIndex: number, label: string, value: string];
  /** 请求删掉这一行。不可撤销，组件内已做二次确认。 */
  remove: [rowIndex: number];
  /** 请求执行一个交互动作。发送由上层负责。 */
  act: [action: ActionItem, name: string];
}>();

/** 与上层的 fieldKey 同构，否则 pending 对不上号 */
function fieldKey(label: string): string {
  return `${props.row.rowIndex}#${label}`;
}
function isPending(label: string): boolean {
  return props.pending === fieldKey(label);
}

/** 超过此长度独占整行。半行放不下的文本换行后会比邻列高出许多，反而更乱。 */
const LONG_TEXT_THRESHOLD = 24;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

/** 除 row_id 外的列。row_id 是内部主键，对阅读没有价值。 */
const dataCols = computed(() => props.columns.filter((c) => c !== 'row_id'));

/** 标题取第一列 —— 通常是姓名 / 名称 / 日期（§8.9d） */
const title = computed(() => {
  const v = dataCols.value.length ? props.row.cells[dataCols.value[0]] : '';
  return isEmpty(v) ? '—' : String(v);
});

/**
 * 枚举字段。可编辑的**不因空值被跳过** —— 值为空时正是最需要设置它的
 * 时候，隐藏起来反而没法操作。只读的按普通字段的规矩跳过空值。
 */
const enumFields = computed(() => {
  const editable = new Set(props.editableEnums ?? []);
  return dataCols.value
    .filter((label) => (props.enums?.[label]?.length ?? 0) > 0)
    .map((label) => ({
      label,
      value: String(props.row.cells[label] ?? ''),
      options: props.enums![label],
      // 编辑模式下放开全部枚举列：用户已经明确表示「我要改这张表」
      editable: props.editMode || editable.has(label),
    }))
    .filter((f) => f.editable || f.value !== '');
});

/**
 * 普通字段。
 *
 * 编辑模式下**空值字段也要显示** —— 值为空时正是最需要填它的时候，
 * 按只读态的规矩跳过，用户就没有任何入口把它填上。
 * 首列作了标题，编辑模式下也要能改，所以此时不再 slice 掉它。
 */
const fields = computed(() => {
  const enumLabels = new Set(enumFields.value.map((f) => f.label));
  return dataCols.value
    .slice(props.editMode ? 0 : 1)
    .filter((label) => !enumLabels.has(label))
    .map((label) => ({ label, value: props.row.cells[label] }))
    .filter((f) => props.editMode || !isEmpty(f.value))
    .map((f) => ({
      label: f.label,
      text: String(f.value ?? ''),
      // NCol 的 span 是字面量联合类型，写成 number 会被推宽而失配
      span: (String(f.value ?? '').length > LONG_TEXT_THRESHOLD ? 24 : 12) as 24 | 12,
    }));
});
</script>

<template>
  <NCard size="small" class="bara-row-card">
    <NThing>
      <template #header>
        <span class="bara-row-card__title">{{ title }}</span>
      </template>
      <template #header-extra>
        <span class="bara-row-card__extra">
          <NTag size="small" :bordered="false">#{{ index }}</NTag>
          <!-- 删行只在编辑模式出现：浏览态不该摆一个不可撤销的按钮 -->
          <NPopconfirm v-if="editMode" @positive-click="emit('remove', row.rowIndex)">
            <template #trigger>
              <NButton
                size="tiny"
                quaternary
                :loading="isPending('remove')"
                :title="t('table.removeRow', lang ?? 'zh-CN')"
              >
                <template #icon><NIcon :component="ICONS.fail" /></template>
              </NButton>
            </template>
            {{ t('table.removeRowConfirm', lang ?? 'zh-CN', { title }) }}
          </NPopconfirm>
        </span>
      </template>

      <!-- 枚举区作为描述段：它是这张卡上唯一可操作的部分，应排在正文之前 -->
      <template v-if="enumFields.length" #description>
        <div class="bara-enums">
          <div v-for="e in enumFields" :key="e.label" class="bara-enum">
            <span class="bara-enum__label">{{ e.label }}</span>
            <!--
              当前值用 primary 实心、其余用次级描边，靠填充差异区分而非仅靠颜色。
              当前值同时禁用 —— 重复写入同一个值没有意义。
            -->
            <NSpace v-if="e.editable" :size="6" :wrap="true">
              <NButton
                v-for="opt in e.options"
                :key="opt"
                size="tiny"
                :type="opt === e.value ? 'primary' : 'default'"
                :secondary="opt !== e.value"
                :disabled="isPending(e.label) || opt === e.value"
                @click="emit('setCell', row.rowIndex, e.label, opt)"
              >
                {{ opt }}
              </NButton>
            </NSpace>
            <!-- 只读枚举做成静态标签，避免让人以为点了没反应 -->
            <span v-else class="bara-enum__value">{{ e.value }}</span>
          </div>
        </div>
        <NDivider v-if="fields.length" class="bara-row-card__sep" />
      </template>

      <NRow v-if="fields.length" :gutter="[12, 12]">
        <NCol v-for="f in fields" :key="f.label" :span="f.span">
          <div class="bara-field">
            <span class="bara-field__label">{{ f.label }}</span>
            <!--
              长文本用多行输入框：一行的框里改一段 200 字的环境描述，
              看不见自己在改什么。
            -->
            <EditableValue
              v-if="editMode"
              class="bara-field__value"
              :value="f.text"
              :multiline="f.span === 24"
              :pending="isPending(f.label)"
              @submit="(v) => emit('setCell', row.rowIndex, f.label, v)"
            />
            <span v-else class="bara-field__value">{{ f.text }}</span>
          </div>
        </NCol>
      </NRow>

      <!--
        交互动作（1.11）。放在正文之后 —— 它是「读完这一行之后想做什么」，
        排在字段之前会让人先看到按钮再看到内容。

        编辑模式下不显示：那时用户在改数据，不是在做动作，
        而两种意图混在同一张卡上容易误点。
      -->
      <template v-if="!editMode && actions?.length" #action>
        <div class="bara-row-card__acts">
          <NButton
            v-for="a in actions"
            :key="a.label"
            size="tiny"
            secondary
            :title="actionPreview?.(a, title) ?? a.label"
            @click="emit('act', a, title)"
          >
            {{ a.label }}
          </NButton>
        </div>
      </template>
    </NThing>
  </NCard>
</template>

<style scoped>
.bara-row-card { overflow: hidden; }
.bara-row-card__title {
  /* 标题也换行：角色名可能很长，截断后两个角色会看起来同名 */
  word-break: break-word;
}
.bara-row-card__sep { margin: var(--bara-space-3) 0 0; }
.bara-row-card__extra {
  display: inline-flex;
  align-items: center;
  gap: var(--bara-space-1);
}

/* 动作按钮换行排：一张卡可能有三四个动作，窄卡片下放不下一行 */
.bara-row-card__acts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-1);
}

.bara-enums {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-2);
}
.bara-enum { display: flex; flex-direction: column; gap: var(--bara-space-1); }
.bara-enum__label {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
}
.bara-enum__value {
  color: var(--bara-color-text);
  font-size: var(--bara-font-size-sm);
  word-break: break-word;
}

.bara-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bara-field__label {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
}
/*
 * 完整显示优先于版面整齐：不设 max-height、不用 ellipsis。
 * pre-wrap 保留 AI 写入的换行，break-word 处理无空格的长串。
 */
.bara-field__value {
  color: var(--bara-color-text);
  font-size: var(--bara-font-size-sm);
  line-height: var(--bara-line-height-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
  min-width: 0;
}
</style>
