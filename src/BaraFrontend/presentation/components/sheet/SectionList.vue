<script setup lang="ts">
/**
 * 分区列表 —— 把一个 Section 渲染成分组卡片。
 *
 * 库存、特性、状态这些表结构相似：一行一个条目，首列是名称，
 * 其余列是属性。因此共用一个渲染件，靠 `groupBy` 指定按哪列分组
 * （类型 / 类别 / 状态类型），不必为每张表各写一个组件。
 *
 * 截图里的库存都是「按类别分组 + 组内表格」的形态，这里沿用：
 * 一屏几十件物品平铺时找不到东西。
 */
import { computed } from 'vue';
import { NThing, NTag, NSpace, NEmpty, NDivider } from 'naive-ui';
import type { Section } from '../../../data/repositories/sheet-repo';
import EditableValue from '../EditableValue.vue';

const props = withDefaults(
  defineProps<{
    section: Section | null;
    /** 按此列分组。列不存在时不分组。 */
    groupBy?: string;
    /** 作为条目名的列。缺省取第一列。 */
    titleColumn?: string;
    /** 作为标签行展示的短字段（等级、消耗、冷却这类） */
    tagColumns?: string[];
    /** 作为正文展示的长字段 */
    bodyColumns?: string[];
    emptyText?: string;
    /**
     * 编辑态（1.11）。开着时每个字段变输入框，且**空值字段也显示** ——
     * 值为空时正是最需要填它的时候，按只读态的规矩滤掉就没有入口了。
     */
    editing?: boolean;
    /** 正在写入的字段标识（`行号#列名`） */
    pending?: string | null;
  }>(),
  {
    tagColumns: () => [],
    bodyColumns: () => [],
    // 以下三项「无值」即是有意义的状态（不分组 / 取第一列 / 用内置占位文案），
    // 显式写出 undefined 以满足 vue/require-default-prop。
    groupBy: undefined,
    titleColumn: undefined,
    emptyText: undefined,
    editing: false,
    pending: null,
  },
);

const emit = defineEmits<{
  /**
   * 请求把某行某列改成某值。写库由上层执行。
   *
   * 带上表名是因为中间层（库存页、特性页）同时挂着两个分区，
   * 光有行号分不出该写哪张表 —— 而两张表的行号会重合。
   */
  setCell: [sheetName: string, rowIndex: number, column: string, value: string];
}>();

/** 这个分区所属的表。section 为空时不会渲染出可点的东西，返回空串即可。 */
const sheetName = computed(() => props.section?.sheetName ?? '');

/**
 * 写入中标识。**必须带表名** —— 一页上挂着两个分区时行号会重合
 * （装备表第 1 行与物品表第 1 行），只用行号会让两处同时转圈。
 */
function fieldKey(rowIndex: number, column: string): string {
  return `${sheetName.value}#${rowIndex}#${column}`;
}

const titleCol = computed(
  () => props.titleColumn ?? props.section?.columns[0] ?? '',
);

/**
 * 未被标题、标签、正文占用的列，作为补充字段列出。
 *
 * 分组列只在**只读态**排除（它已经作为分组标题显示过一遍）。
 * 编辑态要留着 —— 「把这个技能从主动改成被动」正是要改分组列，
 * 排掉它就没有入口了。
 */
const restCols = computed(() => {
  const used = new Set([titleCol.value, ...props.tagColumns, ...props.bodyColumns]);
  if (!props.editing && props.groupBy) used.add(props.groupBy);
  return (props.section?.columns ?? []).filter((c) => !used.has(c));
});

interface Entry {
  key: number;
  title: string;
  tags: Array<{ label: string; text: string }>;
  body: Array<{ label: string; text: string }>;
  rest: Array<{ label: string; text: string }>;
}

/**
 * 取一组列的值。
 *
 * 只读态跳过空值（宽表里大量列为空是常态，逐条显示「暂无」会成一屏噪声）；
 * 编辑态**全部保留** —— 空字段正是最需要填的那些。
 */
function pick(cells: Record<string, string>, cols: readonly string[], keepEmpty = false) {
  return cols
    .filter((c) => keepEmpty || String(cells[c] ?? '').trim())
    .map((c) => ({ label: c, text: String(cells[c] ?? '').trim() }));
}

const groups = computed(() => {
  const s = props.section;
  if (!s) return [];

  const canGroup = !!props.groupBy && s.columns.includes(props.groupBy);
  const map = new Map<string, Entry[]>();

  for (const row of s.rows) {
    const key = canGroup ? String(row.cells[props.groupBy!] ?? '').trim() || '—' : '';
    const entry: Entry = {
      key: row.rowIndex,
      title: String(row.cells[titleCol.value] ?? '').trim() || '—',
      tags: pick(row.cells, props.tagColumns, props.editing),
      body: pick(row.cells, props.bodyColumns, props.editing),
      rest: pick(row.cells, restCols.value, props.editing),
    };
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  return [...map.entries()].map(([label, entries]) => ({ label, entries }));
});
</script>

<template>
  <NEmpty v-if="!section || !section.rows.length" size="small" :description="emptyText" />

  <div v-else class="bara-sec">
    <section v-for="(g, gi) in groups" :key="g.label" class="bara-sec__group">
      <template v-if="g.label">
        <NDivider v-if="gi > 0" class="bara-sec__rule" />
        <div class="bara-sec__group-head">
          <span class="bara-sec__group-name">{{ g.label }}</span>
          <NTag size="tiny" :bordered="false">{{ g.entries.length }}</NTag>
        </div>
      </template>

      <div class="bara-sec__entries">
        <NThing v-for="e in g.entries" :key="e.key" class="bara-sec__entry">
          <template #header>
            <!-- 名称也能改：条目改了名，别的地方的引用得跟着，这是常见的收尾动作 -->
            <EditableValue
              v-if="editing"
              class="bara-sec__title"
              :value="e.title === '—' ? '' : e.title"
              :pending="pending === fieldKey(e.key, titleCol)"
              @submit="(v) => emit('setCell', sheetName, e.key, titleCol, v)"
            />
            <span v-else class="bara-sec__title">{{ e.title }}</span>
          </template>

          <!--
            短字段作标签行：等级、消耗、冷却这类扫一眼就够，不必占正文。
            编辑态下标签排不进输入框，改到下面的字段区统一处理。
          -->
          <template v-if="!editing && e.tags.length" #header-extra>
            <NSpace :size="4" :wrap="true">
              <NTag v-for="tg in e.tags" :key="tg.label" size="tiny" :bordered="false">
                {{ tg.label }} {{ tg.text }}
              </NTag>
            </NSpace>
          </template>

          <template v-if="editing">
            <dl class="bara-sec__rest">
              <div v-for="f in [...e.tags, ...e.body, ...e.rest]" :key="f.label" class="bara-sec__field">
                <dt>{{ f.label }}</dt>
                <dd>
                  <!-- 正文列多半是长文本，给多行框：一行的框里改不动一段描述 -->
                  <EditableValue
                    :value="f.text"
                    :multiline="bodyColumns.includes(f.label)"
                    :pending="pending === fieldKey(e.key, f.label)"
                    @submit="(v) => emit('setCell', sheetName, e.key, f.label, v)"
                  />
                </dd>
              </div>
            </dl>
          </template>

          <template v-else>
            <p v-for="b in e.body" :key="b.label" class="bara-sec__body">{{ b.text }}</p>

            <dl v-if="e.rest.length" class="bara-sec__rest">
              <div v-for="r in e.rest" :key="r.label" class="bara-sec__field">
                <dt>{{ r.label }}</dt>
                <dd>{{ r.text }}</dd>
              </div>
            </dl>
          </template>
        </NThing>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bara-sec { display: flex; flex-direction: column; }
.bara-sec__group { display: flex; flex-direction: column; gap: var(--bara-space-2); }
.bara-sec__rule { margin: var(--bara-space-4) 0 var(--bara-space-2); }

.bara-sec__group-head {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
}
.bara-sec__group-name {
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text-muted);
}

.bara-sec__entries {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-3);
}
.bara-sec__entry {
  padding: var(--bara-space-3);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-surface);
}
.bara-sec__title {
  font-weight: var(--bara-font-weight-medium);
  word-break: break-word;
}

/* 完整显示优先：正文与字段一律换行，不截断 */
.bara-sec__body {
  margin: 0 0 var(--bara-space-2);
  font-size: var(--bara-font-size-sm);
  line-height: var(--bara-line-height-relaxed);
  color: var(--bara-color-text);
  white-space: pre-wrap;
  word-break: break-word;
}
.bara-sec__body:last-child { margin-bottom: 0; }

.bara-sec__rest {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--bara-space-2) var(--bara-space-4);
}
.bara-sec__field { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.bara-sec__field dt {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
}
.bara-sec__field dd {
  margin: 0;
  font-size: var(--bara-font-size-sm);
  color: var(--bara-color-text);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
