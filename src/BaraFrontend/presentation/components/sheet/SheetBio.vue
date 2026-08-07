<script setup lang="ts">
/**
 * 传记页 —— 生理、心理、大事记、亲密经历、关系。
 *
 * 生理与心理两表在此**合并为连续的阅读内容**，不做表格罗列，
 * 也不显示两表的分界（文档 §8.3b）。
 *
 * 三条来自文档的硬性要求：
 * - 「近期变化」置顶并有视觉区分 —— 它是唯一随剧情变动的部分，
 *   与静态设定混排会让人看不出哪些是「当下」、哪些是「设定」。
 * - 分区内空值列整条隐藏，不显示「暂无」—— 阅读性内容里一屏
 *   「暂无」会显得残缺，实际只是该角色尚未展开到那个细节。
 * - 成人向分区默认折叠并记忆状态。
 */
import { computed, ref, watch } from 'vue';
import { NCollapse, NCollapseItem, NTag, NDivider, NEmpty } from 'naive-ui';
import type { CharacterVM } from '../../../data/repositories/character-repo';
import { readBio, readCharacterSection } from '../../../data/repositories/sheet-repo';
import type { Lang } from '../../../stores/ui-store';
import { t } from '../../../i18n';
import SectionList from './SectionList.vue';

const props = defineProps<{ character: CharacterVM; lang: Lang }>();

const groups = computed(() => readBio(props.character));
const chronicle = computed(() => readCharacterSection('chronicle', props.character));
const intimacy = computed(() => readCharacterSection('intimacy', props.character));
const relations = computed(() => readCharacterSection('relations', props.character));

/**
 * 展开的分区。非成人向默认展开，成人向默认收起 ——
 * 并非每次查看角色都需要展开那些内容。
 */
const expanded = ref<string[]>([]);
watch(
  groups,
  (gs) => {
    expanded.value = gs.filter((g) => !g.adult).map((g) => g.id);
  },
  { immediate: true },
);

const hasAny = computed(
  () =>
    groups.value.length > 0 ||
    !!chronicle.value ||
    !!intimacy.value ||
    !!relations.value,
);
</script>

<template>
  <div class="bara-bio">
    <NEmpty v-if="!hasAny" size="small" :description="t('sheet.empty.bio', lang)" />

    <template v-else>
      <NCollapse v-model:expanded-names="expanded" :accordion="false">
        <NCollapseItem
          v-for="g in groups"
          :key="g.id"
          :name="g.id"
          class="bara-bio__group"
          :class="{ 'is-volatile': g.volatile }"
        >
          <template #header>
            <span class="bara-bio__group-name">{{ t(`sheet.bio.${g.id}`, lang) }}</span>
          </template>
          <template #header-extra>
            <!-- 近期变化用 warning 标注：它是会过期的信息，不该被当成设定 -->
            <NTag v-if="g.volatile" size="tiny" type="warning" :bordered="false">
              {{ t('sheet.bio.volatile', lang) }}
            </NTag>
            <NTag v-else-if="g.adult" size="tiny" :bordered="false">
              {{ t('sheet.bio.adult', lang) }}
            </NTag>
          </template>

          <dl class="bara-bio__fields">
            <div v-for="f in g.fields" :key="f.label" class="bara-bio__field">
              <dt>{{ f.label }}</dt>
              <dd>{{ f.text }}</dd>
            </div>
          </dl>
        </NCollapseItem>
      </NCollapse>

      <template v-if="relations">
        <NDivider class="bara-bio__rule" />
        <section>
          <h3 class="bara-bio__h">{{ t('sheet.section.relations', lang) }}</h3>
          <SectionList :section="relations" :body-columns="['关系描述']" />
        </section>
      </template>

      <template v-if="chronicle">
        <NDivider class="bara-bio__rule" />
        <section>
          <h3 class="bara-bio__h">{{ t('sheet.section.chronicle', lang) }}</h3>
          <SectionList
            :section="chronicle"
            title-column="记录内容"
            :tag-columns="['发生时间', '与今天的关系', '核心记忆']"
          />
        </section>
      </template>

      <template v-if="intimacy">
        <NDivider class="bara-bio__rule" />
        <section>
          <h3 class="bara-bio__h">{{ t('sheet.section.intimacy', lang) }}</h3>
          <SectionList
            :section="intimacy"
            title-column="体位/玩法简述"
            :tag-columns="['开始时间', '结束时间', '发生地点', '射精次数', '状态']"
          />
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.bara-bio { display: flex; flex-direction: column; }

/* 近期变化用左侧色条标出，与其余静态分区区分 */
.bara-bio__group.is-volatile {
  border-left: var(--bara-border-width-strong) solid var(--bara-color-warning);
  padding-left: var(--bara-space-3);
}
.bara-bio__group-name {
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
}

.bara-bio__fields {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-3);
}
.bara-bio__field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bara-bio__field dt {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
}
/* 阅读性长文：relaxed 行高，完整换行不截断 */
.bara-bio__field dd {
  margin: 0;
  font-size: var(--bara-font-size-sm);
  line-height: var(--bara-line-height-relaxed);
  color: var(--bara-color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.bara-bio__rule { margin: var(--bara-space-5) 0 var(--bara-space-3); }
.bara-bio__h {
  margin: 0 0 var(--bara-space-3);
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text-muted);
}
</style>
