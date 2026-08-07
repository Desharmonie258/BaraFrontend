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
 */
import { computed } from 'vue';
import { NCard, NThing, NRow, NCol, NButton, NSpace, NTag, NDivider } from 'naive-ui';
import type { TableRow } from '../../data/repositories/table-repo';

const props = defineProps<{
  row: TableRow;
  columns: string[];
  index: number;
  /** 枚举列的候选值：列展示名 → 可选值 */
  enums?: Record<string, string[]>;
  /** 其中允许编辑的列展示名。未列出的只读展示当前值。 */
  editableEnums?: string[];
  /** 正在写入的列，写入期间禁用该列的按钮避免重复提交 */
  pending?: string | null;
}>();

const emit = defineEmits<{
  /** 请求把某列改为某值。实际写入由上层执行。 */
  setCell: [rowIndex: number, label: string, value: string];
}>();

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
      editable: editable.has(label),
    }))
    .filter((f) => f.editable || f.value !== '');
});

const fields = computed(() => {
  const enumLabels = new Set(enumFields.value.map((f) => f.label));
  return dataCols.value
    .slice(1) // 首列已作标题
    .filter((label) => !enumLabels.has(label))
    .map((label) => ({ label, value: props.row.cells[label] }))
    .filter((f) => !isEmpty(f.value))
    .map((f) => ({
      label: f.label,
      text: String(f.value),
      // NCol 的 span 是字面量联合类型，写成 number 会被推宽而失配
      span: (String(f.value).length > LONG_TEXT_THRESHOLD ? 24 : 12) as 24 | 12,
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
        <NTag size="small" :bordered="false">#{{ index }}</NTag>
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
                :disabled="pending === e.label || opt === e.value"
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
            <span class="bara-field__value">{{ f.text }}</span>
          </div>
        </NCol>
      </NRow>
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
