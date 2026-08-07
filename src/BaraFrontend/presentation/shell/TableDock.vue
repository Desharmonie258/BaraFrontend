<script setup lang="ts">
/**
 * 表格坞（§8.9c）—— 路由，挂在外壳上，不属于任何目的地。
 *
 * 表格清单**必须数据驱动**：运行时枚举模板的 sheet 列表生成。
 * 硬编码表名会在用户增删自定义表、切换模板预设后失配。
 *
 * 两种布局，由玩家切换：
 * - grid：等宽网格。条目多时整齐、扫视成本低（骰子系统的做法）
 * - flow：按内容宽度流式排列。条目少时不浪费横向空间
 */
import { computed } from 'vue';
import { NTag, NButton, NSkeleton, NIcon } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { t } from '../../i18n';
import { iconForSheet, FUNCTION_ICONS, ICONS } from '../icons';
import { countChanges } from '../../data/repositories/review-repo';

const ui = useUiStore();
const schema = useSchemaStore();
const emit = defineEmits<{ navigate: [] }>();

const isDashboard = computed(() => ui.destination.kind === 'dashboard');
const isReview = computed(() => ui.destination.kind === 'review');
const isVars = computed(() => ui.destination.kind === 'variables');

/** 变更数随表数据变化重算 —— 角标要能在 AI 填完表后立刻跟上 */
const changeCount = computed(() => {
  void schema.sheets;
  return countChanges();
});
function isActive(key: string): boolean {
  return ui.destination.kind === 'table' && ui.destination.sheetKey === key;
}

/** 隐藏的表不进坞。设置面板可随时恢复，隐藏不等于删除。 */
const visibleSheets = computed(() => schema.sheets.filter((s) => !ui.isSheetHidden(s.key)));

/**
 * 骨架屏只用于**加载未完成**，不用于「确实没有表」。
 *
 * 两者的含义相反：骨架说的是「马上就有」，空态说的是「就是没有」。
 * 拿骨架当空态用，会让一个永远不会有内容的位置一直假装在加载。
 */
const isLoading = computed(() => !schema.loaded);
const isEmpty = computed(() => schema.loaded && visibleSheets.value.length === 0);

const listClass = computed(() =>
  ui.dockLayout === 'grid' ? 'bara-dock__list--grid' : 'bara-dock__list--flow',
);
</script>

<template>
  <footer class="bara-dock">
    <div class="bara-dock__row">
      <div :class="listClass" class="bara-dock__list">
        <NTag
          size="large"
          round
          checkable
          class="bara-dock__item"
          :checked="isDashboard"
          @update:checked="ui.goTo({ kind: 'dashboard' }); emit('navigate')"
        >
          <NIcon v-if="ui.dockIcons" class="bara-dock__icon" :component="FUNCTION_ICONS.dashboard" />
          <span class="bara-dock__label">{{ t('dest.dashboard', ui.lang) }}</span>
        </NTag>

        <NTag
          size="large"
          round
          checkable
          class="bara-dock__item"
          :checked="isReview"
          @update:checked="ui.goTo({ kind: 'review' }); emit('navigate')"
        >
          <NIcon v-if="ui.dockIcons" class="bara-dock__icon" :component="FUNCTION_ICONS.review" />
          <span class="bara-dock__label">{{ t('dest.review', ui.lang) }}</span>
          <span v-if="changeCount > 0" class="bara-dock__badge">
            {{ changeCount > 999 ? '999+' : changeCount }}
          </span>
        </NTag>

        <NTag
          size="large"
          round
          checkable
          class="bara-dock__item"
          :checked="isVars"
          @update:checked="ui.goTo({ kind: 'variables' }); emit('navigate')"
        >
          <NIcon v-if="ui.dockIcons" class="bara-dock__icon" :component="FUNCTION_ICONS.variables" />
          <span class="bara-dock__label">{{ t('dest.variables', ui.lang) }}</span>
        </NTag>

        <!-- 加载中：按坞条目的尺寸占位，避免加载完成时布局跳动 -->
        <template v-if="isLoading">
          <NSkeleton
            v-for="i in 6"
            :key="`sk-${i}`"
            class="bara-dock__skeleton"
            height="1.9rem"
            :sharp="false"
          />
        </template>

        <!-- 加载完了确实没有表：说明原因，不要留一片空白 -->
        <p v-else-if="isEmpty" class="bara-dock__hint">
          {{ t(schema.available ? 'dock.noSheet' : 'error.dbNotReady', ui.lang) }}
        </p>

        <template v-else>
          <NTag
            v-for="s in visibleSheets"
            :key="s.key"
            size="large"
            round
            checkable
            class="bara-dock__item"
            :checked="isActive(s.key)"
            :title="s.name"
            @update:checked="ui.goTo({ kind: 'table', sheetKey: s.key }); emit('navigate')"
          >
            <NIcon v-if="ui.dockIcons" class="bara-dock__icon" :component="iconForSheet(s.name)" />
            <!-- 展示名取模板的 name，不翻译：它属于用户的存档数据（§8.7c） -->
            <span class="bara-dock__label">{{ s.name }}</span>
            <span v-if="s.rowCount > 0" class="bara-dock__badge">
              {{ s.rowCount > 999 ? '999+' : s.rowCount }}
            </span>
          </NTag>
        </template>
      </div>

      <!-- 工具区：布局与图标开关 -->
      <div class="bara-dock__tools">
        <NButton
          size="small"
          quaternary
          :title="t(ui.dockLayout === 'grid' ? 'dock.layout.grid' : 'dock.layout.flow', ui.lang)"
          @click="ui.toggleDockLayout()"
        >
          <template #icon>
            <NIcon :component="ui.dockLayout === 'grid' ? ICONS.layoutGrid : ICONS.layoutFlow" />
          </template>
        </NButton>
        <NButton
          size="small"
          quaternary
          :title="t('dock.toggleIcons', ui.lang)"
          @click="ui.toggleDockIcons()"
        >
          <template #icon>
            <NIcon :component="ui.dockIcons ? ICONS.iconOn : ICONS.iconOff" />
          </template>
        </NButton>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.bara-dock {
  border-top: var(--bara-border-width) solid var(--bara-color-divider);
  background: var(--bara-color-surface);
  /* 条目多时坞可能很高，限高并允许滚动，避免把内容区挤没 */
  max-height: 40dvh;
  overflow-y: auto;
  flex: none;
  padding: var(--bara-space-3) var(--bara-space-4);
}

.bara-dock__row { display: flex; align-items: flex-start; gap: var(--bara-space-3); }
/* 骨架与条目同宽同高，加载完成时不产生布局跳动 */
.bara-dock__skeleton { border-radius: var(--bara-radius-full); }
.bara-dock__hint {
  padding: var(--bara-space-2) 0;
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}
.bara-dock__list { flex: 1 1 auto; min-width: 0; }
/*
 * 格子比按钮形态时更宽：胶囊标签左右各有一段圆角内边距，
 * 沿用 7.5rem 会让「三重要角色生理」这类长表名只剩两三个字。
 */
.bara-dock__list--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: var(--bara-space-2);
}
.bara-dock__list--flow { display: flex; flex-wrap: wrap; gap: var(--bara-space-2); }
.bara-dock__tools {
  display: flex;
  align-items: center;
  gap: var(--bara-space-1);
  flex: none;
}

/*
 * 条目用 n-tag（size=large、round）。选中态走它的 checkable，
 * 配色由 naive-bridge 同步到本项目的令牌，不需要再手写选中样式。
 *
 * 下面的 :deep 只做两件 n-tag 默认不管的事：让标签在网格里撑满格子，
 * 以及让内容区允许收缩，否则长表名不会省略而是把标签顶宽。
 */
/*
 * checkable 标签默认无边框，未选中时只剩一块浅底，在深色主题下几乎
 * 与坞背景融成一片、看不出是可点的独立条目。这里补上描边。
 *
 * 两种状态都给边框（选中态换成主色），否则切换时会有 1px 的尺寸跳动。
 */
.bara-dock__item {
  cursor: pointer;
  max-width: 100%;
  border: var(--bara-border-width) solid var(--bara-color-border);
  transition: border-color var(--bara-duration-fast) var(--bara-easing);
}
.bara-dock__item:hover { border-color: var(--bara-color-border-strong); }
.bara-dock__item.n-tag--checked { border-color: var(--bara-color-primary); }
.bara-dock__list--grid .bara-dock__item { width: 100%; }

.bara-dock__item :deep(.n-tag__content) {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
  min-width: 0;
  width: 100%;
}

/* 图标随字号缩放，与文字基线对齐 */
.bara-dock__icon {
  flex: none;
  opacity: 0.85;
  font-size: 1.15em;
}
/* 网格模式下必须截断：长表名会撑破等宽格子 */
.bara-dock__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/*
 * 计数靠右且不参与压缩：它是扫视时最先要看的量，
 * 被表名挤掉就失去了意义（这正是改造前的问题）。
 */
.bara-dock__badge {
  flex: none;
  margin-left: auto;
  padding: 0 var(--bara-space-2);
  border-radius: var(--bara-radius-full);
  background: var(--bara-color-primary-soft);
  color: var(--bara-color-primary);
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
  line-height: 1.6;
  transition:
    background var(--bara-duration-fast) var(--bara-easing),
    color var(--bara-duration-fast) var(--bara-easing);
}
/*
 * 选中态改用 accent。未选中时标签是中性底，主色徽章足够醒目；
 * 选中后标签本身变成主色系，同色徽章就融进背景看不见了。
 * accent 是调色板里与 primary 相区分的那一支（标题名用的也是它）。
 */
.bara-dock__item.n-tag--checked .bara-dock__badge {
  background: var(--bara-color-accent-soft);
  color: var(--bara-color-accent);
}
</style>
