<script setup lang="ts">
/**
 * 交互总览（1.11）—— 移植自骰子系统的同名面板。
 *
 * 把全部表的每一行摊成一个能点的对象：点开看它能做什么，点动作就把
 * 「<user>与御苑交谈。」这样一句话发出去。回答的是「我现在能做什么」，
 * 而不是「表里有什么」—— 后者表格坞已经在做了。
 *
 * ## 展开而不是弹出菜单
 *
 * 骰子系统用的是浮层菜单。这里改成就地展开，与物资清单同一套节奏：
 * 浮层要 teleport 到宿主 body，而本插件的 CSS 变量挂在根容器上
 * （绝不写 :root，§8.7），teleport 出去会丢掉全部配色。
 *
 * ## 一次只展开一个
 *
 * 同时展开多个会把「我在看哪个对象」这件事弄丢，而这个页面的对象常常
 * 上百个。点另一个即切换，再点自己即收起。
 *
 * ## 发送与填入沿用检定建议的开关
 *
 * 用户对「点一下是直接发还是先填进输入框」的偏好不会因为换个面板而改变，
 * 所以复用 `ui.suggestAutoSend`，不另设一个。
 */
import { computed, ref, watch } from 'vue';
import { NInput, NButton, NEmpty, NAlert, NIcon, NSkeleton } from 'naive-ui';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { t } from '../../i18n';
import { ICONS, SECTION_ICONS } from '../icons';
import { readInteractions, type InteractionObject } from '../../data/repositories/interaction-repo';
import { activeActions } from '../../data/action-preset-store';
import { renderTemplate, type ActionItem } from '../../domain/interaction-rules';
import { runAction } from '../../data/repositories/interaction-runner';
import { canSend } from '../../data/chat-sender';

const ui = useUiStore();
const schema = useSchemaStore();

const keyword = ref('');
/** 展开中的对象 id。一次只展开一个。 */
const openId = ref<string | null>(null);
const sendable = ref(canSend());
/** 发送结果。发送是外发动作，必须给出明确回执。 */
const notice = ref<{ tone: 'success' | 'danger'; text: string } | null>(null);

/**
 * 对象清单。依赖 schema.sheets 重算 —— AI 填完表后新出现的角色
 * 必须立刻能点，否则这个面板永远停在开局那一屏。
 */
const sections = computed(() => {
  void schema.sheets;
  return readInteractions(activeActions());
});

/**
 * 关键词筛选。**对象名、表名、动作名都参与匹配** ——
 * 「我想找能『前往』的地方」与「我想找御苑」是同样常见的两种找法。
 */
const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return sections.value;
  return sections.value
    .map((s) => ({
      ...s,
      objects: s.objects.filter(
        (o) =>
          o.name.toLowerCase().includes(kw) ||
          o.sheetName.toLowerCase().includes(kw) ||
          o.detail.toLowerCase().includes(kw) ||
          o.actions.some((a) => a.label.toLowerCase().includes(kw)),
      ),
    }))
    .filter((s) => s.objects.length > 0);
});

const total = computed(() =>
  filtered.value.reduce((n, s) => n + s.objects.length, 0),
);

/* 筛选一变，展开的那个多半已经不在结果里了，收起来免得留一块孤立的展开区 */
watch(keyword, () => { openId.value = null; });

function toggle(id: string): void {
  openId.value = openId.value === id ? null : id;
}

/** 首字圆标 —— 与角色卡同一套替代方案，没有头像时用名字第一个字 */
function initial(name: string): string {
  return name.slice(0, 1) || '?';
}

/** 执行一个动作。渲染与发送在 data 层，这里只管回执与收起。 */
async function run(object: InteractionObject, action: ActionItem): Promise<void> {
  notice.value = null;
  const result = await runAction(action, object.name, ui.suggestAutoSend);

  if (!result.ok) {
    notice.value = {
      tone: 'danger',
      text: t(result.reason === 'no_composer' ? 'suggest.noComposer' : 'suggest.failed', ui.lang),
    };
    return;
  }

  notice.value =
    result.mode === 'sent'
      ? { tone: 'success', text: t('suggest.sent', ui.lang, { text: result.text }) }
      : { tone: 'success', text: t('suggest.filled', ui.lang) };
  // 发完收起：这一轮的动作已经做完，展开着只会让人误点第二次
  if (result.mode === 'sent') openId.value = null;
}
</script>

<template>
  <div class="bara-int">
    <div class="bara-int__bar">
      <span class="bara-int__count">{{ t('interactions.count', ui.lang, { n: String(total) }) }}</span>
      <div class="bara-int__ctrls">
        <!-- 开着时用实心主色，关着时用弱化态，靠填充差异区分而非仅靠图标 -->
        <NButton
          size="small"
          :type="ui.suggestAutoSend ? 'primary' : 'default'"
          :quaternary="!ui.suggestAutoSend"
          :disabled="!sendable"
          :title="t('suggest.autoSend', ui.lang)"
          @click="ui.setSuggestAutoSend(!ui.suggestAutoSend)"
        >
          <template #icon>
            <NIcon :component="ui.suggestAutoSend ? ICONS.send : ICONS.edit" />
          </template>
        </NButton>
        <NInput
          v-model:value="keyword"
          type="text"
          size="small"
          clearable
          :placeholder="t('interactions.search', ui.lang)"
          class="bara-int__search"
        />
      </div>
    </div>

    <NAlert
      v-if="notice"
      :type="notice.tone === 'danger' ? 'error' : 'success'"
      closable
      class="bara-int__alert"
      @close="notice = null"
    >
      {{ notice.text }}
    </NAlert>

    <div v-if="!schema.loaded" class="bara-int__skeleton">
      <NSkeleton v-for="i in 3" :key="i" text :repeat="2" />
    </div>

    <!--
      空态分两种，措辞必须不同：搜不到是「换个词」，一个都没有是
      「这份模板里没有能交互的表」——后者用户改关键词也没用。
    -->
    <NEmpty
      v-else-if="total === 0"
      size="small"
      :description="keyword.trim()
        ? t('interactions.noMatch', ui.lang)
        : t('interactions.empty', ui.lang)"
    />

    <section v-for="s in filtered" v-else :key="s.kind" class="bara-int__section">
      <h4 class="bara-int__title">
        <NIcon :component="SECTION_ICONS[s.kind]" class="bara-int__title-icon" />
        {{ t(`interactions.section.${s.kind}`, ui.lang) }}
        <span class="bara-int__title-count">({{ s.objects.length }})</span>
      </h4>

      <div class="bara-int__grid">
        <div v-for="o in s.objects" :key="o.id" class="bara-int__cell">
          <button
            type="button"
            class="bara-int__chip"
            :class="{ 'is-open': openId === o.id }"
            :aria-expanded="openId === o.id"
            :title="o.detail ? `${o.name}　${o.detail}` : o.name"
            @click="toggle(o.id)"
          >
            <span class="bara-int__avatar">{{ initial(o.name) }}</span>
            <span class="bara-int__name">{{ o.name }}</span>
          </button>

          <!--
            动作区就地展开。名字与表名一并显示 —— 两张表可能有同名对象，
            光看名字选不出该点哪个。
          -->
          <div v-if="openId === o.id" class="bara-int__actions">
            <div class="bara-int__meta">
              <strong>{{ o.name }}</strong>
              <span class="bara-int__from">{{ o.sheetName }}</span>
              <span v-if="o.detail" class="bara-int__detail">{{ o.detail }}</span>
            </div>
            <div class="bara-int__buttons">
              <NButton
                v-for="a in o.actions"
                :key="a.label"
                size="tiny"
                secondary
                :title="renderTemplate(a.template, o.name)"
                @click="run(o, a)"
              >
                {{ a.label }}
              </NButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bara-int__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-2);
  margin-bottom: var(--bara-space-3);
  flex-wrap: wrap;
}
.bara-int__count {
  color: var(--bara-color-text-muted);
  font-size: var(--bara-font-size-xs);
}
.bara-int__ctrls {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
}
.bara-int__search { width: 12rem; }

.bara-int__alert { margin-bottom: var(--bara-space-3); }
.bara-int__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-3);
}

.bara-int__section { margin-bottom: var(--bara-space-4); }
.bara-int__title {
  display: flex;
  align-items: center;
  gap: var(--bara-space-1);
  margin: 0 0 var(--bara-space-2);
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text);
}
.bara-int__title-icon { color: var(--bara-color-text-muted); }
.bara-int__title-count {
  color: var(--bara-color-text-subtle);
  font-weight: normal;
}

/*
 * 贴紧排列的胶囊格。用 flex-wrap 而非等宽网格：对象名长短差得远
 * （「剑」与「橡木镇中央广场」），等宽会让短名一片留白。
 */
.bara-int__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-1);
}
/* 展开的那一格独占整行，动作按钮才排得开 */
.bara-int__cell:has(.bara-int__actions) {
  flex: 1 0 100%;
}

.bara-int__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bara-space-1);
  max-width: 100%;
  padding: var(--bara-space-1) var(--bara-space-2);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-full);
  background: var(--bara-color-surface-sunken);
  color: var(--bara-color-text);
  font: inherit;
  font-size: var(--bara-font-size-xs);
  cursor: pointer;
  transition:
    border-color var(--bara-duration-fast) var(--bara-easing),
    background var(--bara-duration-fast) var(--bara-easing);
}
.bara-int__chip:hover {
  border-color: var(--bara-color-primary);
  background: var(--bara-color-hover);
}
.bara-int__chip.is-open {
  border-color: var(--bara-color-primary);
  background: var(--bara-color-primary-soft);
}
.bara-int__chip:focus-visible {
  outline: 2px solid var(--bara-color-primary);
  outline-offset: 2px;
}

.bara-int__avatar {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--bara-radius-full);
  background: var(--bara-color-primary-soft);
  color: var(--bara-color-primary);
  font-weight: var(--bara-font-weight-bold);
}
.bara-int__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bara-int__actions {
  margin-top: var(--bara-space-2);
  padding: var(--bara-space-2);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-bg);
}
.bara-int__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--bara-space-2);
  margin-bottom: var(--bara-space-2);
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}
.bara-int__meta strong {
  color: var(--bara-color-text);
  font-size: var(--bara-font-size-sm);
}
.bara-int__from { color: var(--bara-color-text-muted); }
.bara-int__detail { overflow-wrap: anywhere; }

.bara-int__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-1);
}
</style>
