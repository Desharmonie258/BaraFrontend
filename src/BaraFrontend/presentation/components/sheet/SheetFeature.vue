<script setup lang="ts">
/**
 * 特性页 —— 能力与状态。
 *
 * 特性按 `类别` 分组（主动 / 被动 / …），状态按 `类型` 分组
 * （增益 / 减益 / 中性）。两者虽然都是「附加在角色身上的东西」，
 * 但一个是长期能力、一个是临时效果，混排会让人分不清哪些会过期。
 */
import { computed } from 'vue';
import { NDivider } from 'naive-ui';
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

const traits = computed(() => {
  void props.refreshKey;
  return readCharacterSection('traits', props.character);
});
const statuses = computed(() => {
  void props.refreshKey;
  return readCharacterSection('statuses', props.character);
});
</script>

<template>
  <div class="bara-feat">
    <section>
      <h3 class="bara-feat__h">{{ t('sheet.section.traits', lang) }}</h3>
      <SectionList
        :section="traits"
        group-by="类别"
        :tag-columns="['等级', '释放方式', '消耗', '冷却', '关联属性']"
        :body-columns="['效果描述']"
        :editing="editing"
        :pending="pending"
        @set-cell="(...a) => emit('setCell', ...a)"
        :empty-text="t('sheet.empty.traits', lang)"
      />
    </section>

    <NDivider class="bara-feat__rule" />

    <section>
      <h3 class="bara-feat__h">{{ t('sheet.section.statuses', lang) }}</h3>
      <SectionList
        :section="statuses"
        group-by="类型"
        :tag-columns="['层数', '持续类型', '剩余', '来源']"
        :body-columns="['效果']"
        :editing="editing"
        :pending="pending"
        @set-cell="(...a) => emit('setCell', ...a)"
        :empty-text="t('sheet.empty.statuses', lang)"
      />
    </section>
  </div>
</template>

<style scoped>
.bara-feat { display: flex; flex-direction: column; }
.bara-feat__rule { margin: var(--bara-space-5) 0 var(--bara-space-3); }
.bara-feat__h {
  margin: 0 0 var(--bara-space-3);
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text-muted);
}
</style>
