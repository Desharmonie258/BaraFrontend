<script setup lang="ts">
/**
 * 变量面板 —— 查看角色卡的变量框架数据（MVU / ERA / LWB）。
 *
 * 移植自骰子系统的 MvuModule 面板。**只读**：变量是角色卡作者的领域，
 * 插件擅自改写会破坏卡自身的逻辑，而那种破坏很难被归因到插件头上。
 *
 * 与表格数据的关系：两者是并行的两套存储，插件的表格在数据库插件里，
 * 变量在角色卡里。这个面板不做同步，只是让人不必离开界面就能对照。
 */
import { computed, ref, watch } from 'vue';
import { NButton, NTag, NAlert, NEmpty, NTree, NInput } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { t } from '../../i18n';
import { readVariables, toTree, type VarNode } from '../../data/variable-gateway';

const ui = useUiStore();
const data = ref(readVariables());
const keyword = ref('');

function reload(): void {
  data.value = readVariables();
}

/** 框架名不翻译：它们是产品名 */
const framework = computed(() => data.value.framework);

const tree = computed(() => toTree(data.value.stat));

/** NTree 要求每个节点有唯一 key，路径正好胜任 */
interface TreeOption {
  key: string;
  label: string;
  children?: TreeOption[];
}

function toOptions(nodes: VarNode[]): TreeOption[] {
  return nodes.map((n) => ({
    key: n.path,
    // 叶子节点把值并进标签：单独一列会让深层嵌套的值挤到屏外
    label: n.value === null ? n.key : `${n.key}: ${n.value}`,
    children: n.children.length ? toOptions(n.children) : undefined,
  }));
}

/** 关键字过滤：路径或值命中即保留，并保留其祖先链 */
function filterOptions(nodes: TreeOption[], kw: string): TreeOption[] {
  if (!kw) return nodes;
  const out: TreeOption[] = [];
  for (const n of nodes) {
    const kids = n.children ? filterOptions(n.children, kw) : [];
    if (n.label.toLowerCase().includes(kw) || kids.length) {
      out.push({ ...n, children: kids.length ? kids : undefined });
    }
  }
  return out;
}

const options = computed(() =>
  filterOptions(toOptions(tree.value), keyword.value.trim().toLowerCase()),
);

/** 过滤时自动展开命中的分支，否则要逐层点开才看得到结果 */
const expanded = ref<string[]>([]);
watch(keyword, (kw) => {
  if (!kw.trim()) {
    expanded.value = [];
    return;
  }
  const acc: string[] = [];
  const walk = (ns: TreeOption[]) => {
    for (const n of ns) {
      if (n.children) {
        acc.push(n.key);
        walk(n.children);
      }
    }
  };
  walk(options.value);
  expanded.value = acc;
});
</script>

<template>
  <div class="bara-var">
    <div class="bara-var__bar">
      <span class="bara-var__meta">
        <NTag size="small" :bordered="false" :type="framework === 'none' ? 'default' : 'success'">
          {{ framework === 'none' ? t('vars.none', ui.lang) : framework.toUpperCase() }}
        </NTag>
      </span>
      <NButton size="small" @click="reload()">{{ t('vars.refresh', ui.lang) }}</NButton>
    </div>

    <NAlert
      v-if="framework === 'none'"
      type="info"
      :bordered="false"
      class="bara-var__notice"
    >
      {{ t('vars.noFramework', ui.lang) }}
    </NAlert>

    <!-- ERA 的数据要走它自己的异步接口，这里读不到，如实说明而不是显示空树 -->
    <NAlert
      v-else-if="framework === 'era' && !data.stat"
      type="warning"
      :bordered="false"
      class="bara-var__notice"
    >
      {{ t('vars.eraUnavailable', ui.lang) }}
    </NAlert>

    <template v-else>
      <NInput
        v-model:value="keyword"
        type="text"
        clearable
        size="small"
        :placeholder="t('vars.search', ui.lang)"
      />
      <NEmpty v-if="!options.length" size="small" :description="t('vars.empty', ui.lang)" />
      <NTree
        v-else
        v-model:expanded-keys="expanded"
        :data="options"
        block-line
        :selectable="false"
        class="bara-var__tree"
      />
    </template>
  </div>
</template>

<style scoped>
.bara-var { display: flex; flex-direction: column; gap: var(--bara-space-3); }
.bara-var__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-3);
}
.bara-var__meta { display: flex; align-items: center; gap: var(--bara-space-2); }
.bara-var__notice { margin: 0; }

/* 变量值可能很长，允许换行而不是横向撑破 */
.bara-var__tree :deep(.n-tree-node-content__text) {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
