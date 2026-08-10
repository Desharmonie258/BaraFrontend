<script setup lang="ts">
/**
 * 库存页 —— 装备与物品。
 *
 * 两块都按 `类型` 分组（参考截图里 Weapons / Equipment / Consumables / Loot
 * 的做法）：几十件东西平铺时根本找不到目标。
 * 顶部给两个计数，先回答「有多少」再看「有什么」。
 */
import { computed } from 'vue';
import { NStatistic, NDivider } from 'naive-ui';
import type { CharacterVM } from '../../../data/repositories/character-repo';
import { readCharacterSection } from '../../../data/repositories/sheet-repo';
import type { Lang } from '../../../stores/ui-store';
import { t } from '../../../i18n';
import SectionList from './SectionList.vue';

const props = defineProps<{
  character: CharacterVM;
  lang: Lang;
  /** 编辑态与写入中标识，原样传给各分区（1.11） */
  editing?: boolean;
  pending?: string | null;
  /**
   * 刷新令牌。手改写入后由抽屉推进 —— 分区数据是 computed 出来的，
   * 不给它一个会变的依赖，写完界面仍是旧值。
   */
  refreshKey?: number;
}>();

/** 分区的改动一路上抛到抽屉执行 —— 中间层不碰数据层 */
const emit = defineEmits<{
  setCell: [sheetName: string, rowIndex: number, column: string, value: string];
}>();

const equipment = computed(() => {
  void props.refreshKey;
  return readCharacterSection('equipment', props.character);
});
const items = computed(() => {
  void props.refreshKey;
  return readCharacterSection('items', props.character);
});
</script>

<template>
  <div class="bara-inv">
    <div class="bara-inv__stats">
      <NStatistic
        :label="t('dashboard.equipment', lang)"
        :value="equipment?.rows.length ?? 0"
      />
      <NStatistic :label="t('dashboard.items', lang)" :value="items?.rows.length ?? 0" />
    </div>

    <NDivider class="bara-inv__rule" />

    <section>
      <h3 class="bara-inv__h">{{ t('dashboard.equipment', lang) }}</h3>
      <SectionList
        :section="equipment"
        group-by="类型"
        :tag-columns="['品质', '状态']"
        :body-columns="['描述']"
        :editing="editing"
        :pending="pending"
        @set-cell="(...a) => emit('setCell', ...a)"
        :empty-text="t('dashboard.empty.equipment', lang)"
      />
    </section>

    <NDivider class="bara-inv__rule" />

    <section>
      <h3 class="bara-inv__h">{{ t('dashboard.items', lang) }}</h3>
      <SectionList
        :section="items"
        group-by="类型"
        :tag-columns="['数量', '品质']"
        :body-columns="['描述']"
        :editing="editing"
        :pending="pending"
        @set-cell="(...a) => emit('setCell', ...a)"
        :empty-text="t('dashboard.empty.items', lang)"
      />
    </section>
  </div>
</template>

<style scoped>
.bara-inv { display: flex; flex-direction: column; }
.bara-inv__stats { display: flex; gap: var(--bara-space-6); }
.bara-inv__rule { margin: var(--bara-space-4) 0 var(--bara-space-3); }
.bara-inv__h {
  margin: 0 0 var(--bara-space-3);
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text-muted);
}
</style>
