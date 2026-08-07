<script setup lang="ts">
/**
 * 角色卡头部 —— 常驻，不随页签滚动。
 *
 * 布局沿用 tidy5e 的 `CharacterSheetFull`：左侧固定头像位，
 * 右侧弹性区放姓名与要害数值。参考截图里的角色卡也都是这个骨架 ——
 * 姓名和生命值必须始终可见，翻到哪一页都一样。
 *
 * **生命 / 经验目前是预留位**：模板里没有这两个字段，它们若要出现
 * 只能作为「角色资源表」里的资源行。因此这里不硬编码任何资源名，
 * 有置顶资源就渲染资源条，没有就显示占位槽，不假装数据存在。
 */
import { computed } from 'vue';
import { NTag, NProgress, NSpace } from 'naive-ui';
import type { CharacterVM } from '../../../data/repositories/character-repo';
import type { ResourceVM } from '../../../data/repositories/sheet-repo';
import type { Lang } from '../../../stores/ui-store';
import { t } from '../../../i18n';

const props = defineProps<{
  character: CharacterVM;
  resources: ResourceVM[];
  lang: Lang;
}>();

/** 上 header 的资源：置顶优先，至多三条 —— 再多就挤掉姓名 */
const vitals = computed(() => props.resources.filter((r) => r.pinned).slice(0, 3));

/** 头像位暂用姓名首字，模板没有头像字段 */
const initial = computed(() => props.character.name.trim().slice(0, 1) || '?');

const meta = computed(() =>
  [props.character.identity, props.character.location].filter((v) => v && v.trim()),
);
</script>

<template>
  <header class="bara-sh">
    <div class="bara-sh__avatar" :title="character.name">{{ initial }}</div>

    <div class="bara-sh__main">
      <div class="bara-sh__line">
        <h2 class="bara-sh__name">{{ character.name }}</h2>
        <NSpace :size="4" :wrap="true">
          <NTag v-if="character.isProtagonist" size="small" type="primary" :bordered="false">
            {{ t('dashboard.protagonist', lang) }}
          </NTag>
          <NTag
            size="small"
            :type="character.present ? 'success' : 'default'"
            :bordered="false"
          >
            {{ t(character.present ? 'presence.在场' : 'presence.离场', lang) }}
          </NTag>
          <NTag v-if="character.trackStatus" size="small" :bordered="false">
            {{ character.trackStatus }}
          </NTag>
        </NSpace>
      </div>

      <p v-if="character.aliases" class="bara-sh__alias">{{ character.aliases }}</p>
      <p v-if="meta.length" class="bara-sh__meta">{{ meta.join(' · ') }}</p>

      <div class="bara-sh__vitals">
        <div v-for="r in vitals" :key="r.name" class="bara-sh__vital">
          <div class="bara-sh__vital-top">
            <span class="bara-sh__vital-name">{{ r.name }}</span>
            <span class="bara-sh__vital-num">
              {{ r.current ?? '—' }}<template v-if="r.max !== null"> / {{ r.max }}</template>
            </span>
          </div>
          <NProgress
            type="line"
            :percentage="r.percent ?? 0"
            :show-indicator="false"
            :height="6"
            :border-radius="3"
          />
        </div>

        <!--
          预留槽：模板尚无生命 / 经验字段。显式占位而非留白 ——
          留白会让人以为界面坏了，占位能说明「这里将来会有东西」。
        -->
        <p v-if="!vitals.length" class="bara-sh__vital-empty">
          {{ t('sheet.vitals.reserved', lang) }}
        </p>
      </div>
    </div>
  </header>
</template>

<style scoped>
.bara-sh {
  display: flex;
  align-items: flex-start;
  gap: var(--bara-space-4);
  padding-bottom: var(--bara-space-3);
  border-bottom: var(--bara-border-width) solid var(--bara-color-divider);
}

.bara-sh__avatar {
  flex: none;
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-surface-sunken);
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xl);
}

.bara-sh__main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.bara-sh__line {
  display: flex;
  align-items: center;
  gap: var(--bara-space-3);
  flex-wrap: wrap;
}
.bara-sh__name {
  margin: 0;
  font-size: var(--bara-font-size-lg);
  font-weight: var(--bara-font-weight-bold);
  color: var(--bara-color-text);
  word-break: break-word;
}
.bara-sh__alias,
.bara-sh__meta {
  margin: 0;
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
  word-break: break-word;
}

.bara-sh__vitals {
  margin-top: var(--bara-space-2);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--bara-space-2) var(--bara-space-4);
}
.bara-sh__vital { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bara-sh__vital-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bara-space-2);
}
.bara-sh__vital-name {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
  min-width: 0;
  word-break: break-word;
}
/* 等宽：资源值需纵向对齐，比例字体下数字宽度不一会抖动 */
.bara-sh__vital-num {
  flex: none;
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text);
}
.bara-sh__vital-empty {
  margin: 0;
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}
</style>
