<script setup lang="ts">
/**
 * 设置面板（§8.10）—— 结构继承自骰子系统的设置弹窗。
 *
 * 沿用的部分：五个可折叠分组、分组展开状态持久化（默认只开外观）、
 * 左标签右控件的行骨架、坞条目的显示/隐藏管理（骰子的「导航盘管理」）、
 * 高级组里的诊断与重置。
 *
 * 与骰子系统的区别在形态：它是浮层弹窗，本面板是**与仪表盘平级的目的地**。
 * 原因是浮层需要 teleport 到宿主 body，而本插件的 CSS 变量挂在根容器上
 * （绝不写 :root，§8.7），teleport 出去会丢掉全部配色。
 *
 * 骰子系统里与本项目无关的分组不予继承：字体风格、正文头像渲染、
 * 检定预设（M5 未实现）、图标包、表格正则等。
 */
import { computed, ref } from 'vue';
import {
  NRadioGroup, NRadioButton, NInputNumber, NButton, NTag, NAlert, NIcon,
} from 'naive-ui';
import { GROUP_ICONS, ICONS } from '../icons';
import { useUiStore } from '../../stores/ui-store';
import { useSchemaStore } from '../../stores/schema-store';
import { t } from '../../i18n';
import type { ThemeId } from '../theme/tokens';
import type { ModeSetting, Lang } from '../../stores/ui-store';
import type { QaSmoke } from '../../domain/enum-policy';
import { isDbPresent, canRead, canWrite } from '../../data/db-gateway';
import { canSend } from '../../data/chat-sender';
import type { RuleFamily } from '../../domain/rule-systems';
import { previewSync, applySync, type SyncPreview } from '../../data/repositories/attribute-sync';
import { describeBindings } from '../../data/snapshot-repo';
import {
  CHARACTERS, PROTAGONIST, SUGGESTIONS, ITEMS, EQUIPMENT, RESOURCES, GLOBAL, RELATIONS,
} from '../../domain/sheet-binding';
import SettingsGroup from '../shell/SettingsGroup.vue';
import RuleModePicker from '../shell/RuleModePicker.vue';
import ThemePicker from '../shell/ThemePicker.vue';
import LicenseNotices from '../shell/LicenseNotices.vue';
import SettingsRow from '../shell/SettingsRow.vue';
import PresetSettings from '../components/PresetSettings.vue';
import ActionSettings from '../components/ActionSettings.vue';

const ui = useUiStore();
const schema = useSchemaStore();

/**
 * 模板适配情况。依赖 schema.sheets 重算 —— 换聊天、重新导入模板后
 * 认到的表会变，这里必须跟着变，否则显示的是上一份模板的结论。
 */
const bindings = computed(() => {
  void schema.sheets;
  return describeBindings([
    CHARACTERS, PROTAGONIST, SUGGESTIONS, ITEMS, EQUIPMENT, RESOURCES, GLOBAL, RELATIONS,
  ]);
});

const modeOptions = computed(() => [
  { label: t('settings.mode.auto', ui.lang), value: 'auto' },
  { label: t('settings.mode.light', ui.lang), value: 'light' },
  { label: t('settings.mode.dark', ui.lang), value: 'dark' },
]);
const langOptions = computed(() => [
  { label: '中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]);
const onOff = computed(() => [
  { label: t('settings.on', ui.lang), value: 'on' },
  { label: t('settings.off', ui.lang), value: 'off' },
]);
const dockLayoutOptions = computed(() => [
  { label: t('settings.dock.grid', ui.lang), value: 'grid' },
  { label: t('settings.dock.flow', ui.lang), value: 'flow' },
]);
const qaOptions = computed(() => [
  { label: t('settings.qa.default', ui.lang), value: 'default' },
  { label: t('settings.qa.debug', ui.lang), value: 'debug' },
]);
const sendOptions = computed(() => [
  { label: t('settings.send.auto', ui.lang), value: 'send' },
  { label: t('settings.send.fill', ui.lang), value: 'fill' },
]);

const bool = (v: boolean) => (v ? 'on' : 'off');

/**
 * 数字框的单位显示。NInputNumber 用 format/parse 成对处理单位，
 * 而不是塞 #suffix 插槽 —— 插槽会与内建的 +/- 按钮争位置。
 */
function unit(suffix: string) {
  return {
    format: (v: number | null) => (v == null ? '' : `${v}${suffix}`),
    parse: (s: string) => {
      const n = Number.parseFloat(s.replace(suffix, '').trim());
      return Number.isNaN(n) ? null : n;
    },
  };
}
const pct = unit('%');
const vh = unit('vh');

/** 诊断信息。排障时让用户能一眼看到环境状态，对应骰子系统的 Debug 控制台。 */
const diagnostics = computed(() => [
  { label: t('settings.diag.plugin', ui.lang), ok: isDbPresent() },
  { label: t('settings.diag.read', ui.lang), ok: canRead() },
  { label: t('settings.diag.write', ui.lang), ok: canWrite() },
  { label: t('settings.diag.send', ui.lang), ok: canSend() },
  { label: t('settings.diag.sheets', ui.lang), ok: schema.sheets.length > 0,
    detail: String(schema.sheets.length) },
]);

/** 重置需二次确认 —— 它会抹掉全部偏好，且不可撤销 */
const confirmingReset = ref(false);
function onReset(): void {
  if (!confirmingReset.value) {
    confirmingReset.value = true;
    return;
  }
  ui.resetSettings();
  confirmingReset.value = false;
}

const hiddenCount = computed(() => ui.hiddenSheets.length);

/* ── 属性规则同步 ────────────────────────────────────────── */

/**
 * 写模板是本项目风险最高的操作（写坏了整套表结构都要重导），
 * 因此走「预览 → 确认 → 执行」三步，不随规则族切换自动触发。
 */
const preview = ref<SyncPreview | null>(null);
const syncing = ref(false);
const syncNotice = ref<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);

function onPreview(): void {
  syncNotice.value = null;
  preview.value = previewSync(ui.ruleSystem);
}

async function onApply(): Promise<void> {
  const p = preview.value;
  if (!p || p.blocker || syncing.value) return;
  syncing.value = true;
  try {
    // 传入预览时生成的 block，保证写进去的示例与看到的一致
    const res = await applySync(ui.ruleSystem, p.block);
    syncNotice.value = res.success
      ? { tone: 'success', text: t('settings.sync.done', ui.lang, { n: String(res.changed) }) }
      : { tone: 'error', text: res.message || t('error.unknown', ui.lang) };
    if (res.success) preview.value = null;
  } finally {
    syncing.value = false;
  }
}
</script>

<template>
  <div class="bara-set">
    <div class="bara-set__bar">
      <span class="bara-set__title">{{ t('settings.title', ui.lang) }}</span>
      <NButton size="small" quaternary @click="ui.closeSettings()">
        {{ t('settings.close', ui.lang) }}
      </NButton>
    </div>

    <!-- 外观 -->
    <SettingsGroup
      :title="t('settings.group.appearance', ui.lang)"
      :icon="GROUP_ICONS.appearance"
      :expanded="ui.isGroupExpanded('appearance')"
      @toggle="ui.toggleGroup('appearance')"
    >
      <SettingsRow :label="t('settings.theme', ui.lang)">
        <span class="bara-set__hint">{{ t('settings.theme.hint', ui.lang) }}</span>
      </SettingsRow>
      <ThemePicker
        :model-value="ui.themeId"
        :themes="ui.themes"
        :lang="ui.lang"
        :mode-setting="ui.modeSetting"
        @update:model-value="(v: ThemeId) => ui.setTheme(v)"
      />

      <SettingsRow :label="t('settings.mode', ui.lang)">
        <NRadioGroup
          :value="ui.modeSetting"
          size="small"
          @update:value="(v: string) => ui.setMode(v as ModeSetting)"
        >
          <NRadioButton v-for="o in modeOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
      </SettingsRow>

      <SettingsRow
        :label="t('settings.lang', ui.lang)"
        :hint="t('settings.lang.hint', ui.lang)"
      >
        <NRadioGroup
          :value="ui.lang"
          size="small"
          @update:value="(v: string) => ui.setLang(v as Lang)"
        >
          <NRadioButton v-for="o in langOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
      </SettingsRow>

      <SettingsRow :label="t('settings.fontScale', ui.lang)">
        <NInputNumber
          :value="Math.round(ui.fontScale * 100)"
          :min="80"
          :max="140"
          :step="10"
          :format="pct.format"
          :parse="pct.parse"
          size="small"
          class="bara-set__num"
          @update:value="(v: number | null) => ui.setFontScale((v ?? 100) / 100)"
        />
      </SettingsRow>
    </SettingsGroup>

    <!-- 布局与浏览 -->
    <SettingsGroup
      :title="t('settings.group.layout', ui.lang)"
      :icon="GROUP_ICONS.layout"
      :expanded="ui.isGroupExpanded('layout')"
      @toggle="ui.toggleGroup('layout')"
    >
      <SettingsRow :label="t('settings.dockLayout', ui.lang)">
        <NRadioGroup :value="ui.dockLayout" size="small" @update:value="() => ui.toggleDockLayout()">
          <NRadioButton v-for="o in dockLayoutOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
      </SettingsRow>

      <SettingsRow :label="t('settings.dockIcons', ui.lang)">
        <NRadioGroup :value="bool(ui.dockIcons)" size="small" @update:value="() => ui.toggleDockIcons()">
          <NRadioButton v-for="o in onOff" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
      </SettingsRow>

      <SettingsRow
        :label="t('settings.contentHeight', ui.lang)"
        :hint="t('settings.contentHeight.hint', ui.lang)"
      >
        <NInputNumber
          :value="ui.contentHeight"
          :min="30"
          :max="90"
          :step="10"
          :format="vh.format"
          :parse="vh.parse"
          size="small"
          class="bara-set__num"
          @update:value="(v: number | null) => ui.setContentHeight(v ?? 60)"
        />
      </SettingsRow>

      <SettingsRow :label="t('settings.pageSize', ui.lang)">
        <NInputNumber
          :value="ui.pageSize"
          :min="10"
          :max="200"
          :step="10"
          size="small"
          class="bara-set__num"
          @update:value="(v: number | null) => ui.setPageSize(v ?? 50)"
        />
      </SettingsRow>

      <SettingsRow
        :label="t('settings.fullWidth', ui.lang)"
        :hint="t('settings.fullWidth.hint', ui.lang)"
      >
        <NRadioGroup
          :value="bool(ui.fullWidth)"
          size="small"
          @update:value="(v: string) => ui.setFullWidth(v === 'on')"
        >
          <NRadioButton v-for="o in onOff" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
      </SettingsRow>
    </SettingsGroup>

    <!-- 游戏模式与规则 -->
    <SettingsGroup
      :title="t('settings.group.rules', ui.lang)"
      :icon="GROUP_ICONS.rules"
      :expanded="ui.isGroupExpanded('rules')"
      @toggle="ui.toggleGroup('rules')"
    >
      <SettingsRow
        :label="t('settings.ruleSystem', ui.lang)"
        :hint="t('settings.ruleSystem.hint', ui.lang)"
      >
        <span />
      </SettingsRow>
      <RuleModePicker
        :model-value="ui.ruleSystem"
        :lang="ui.lang"
        @update:model-value="(v: RuleFamily) => { ui.setRuleSystem(v); preview = null; syncNotice = null; }"
      />

      <!--
        换族后旧存档的属性值仍是旧量纲。不做自动换算 —— 直接改数值
        比留着让 AI 自行收敛更容易出错，这里只如实提示。
      -->
      <NAlert type="warning" :bordered="false" class="bara-set__sync-tip">
        {{ t('settings.sync.newChat', ui.lang) }}
      </NAlert>

      <SettingsRow
        :label="t('settings.sync.title', ui.lang)"
        :hint="t('settings.sync.hint', ui.lang)"
      >
        <NButton size="small" :disabled="syncing" @click="onPreview()">
          {{ t('settings.sync.preview', ui.lang) }}
        </NButton>
      </SettingsRow>

      <div v-if="preview" class="bara-set__sync">
        <NAlert v-if="preview.blocker" type="error" :bordered="false">
          {{ t(`settings.sync.${preview.blocker}`, ui.lang) }}
        </NAlert>

        <template v-else>
          <p class="bara-set__hint">
            {{ t('settings.sync.affected', ui.lang, { sheets: preview.sheets.join('、') }) }}
          </p>
          <pre class="bara-set__sync-block">{{ preview.block }}</pre>
          <div class="bara-set__sync-actions">
            <NButton size="small" type="primary" :loading="syncing" @click="onApply()">
              {{ t('settings.sync.apply', ui.lang) }}
            </NButton>
            <NButton size="small" quaternary @click="preview = null">
              {{ t('settings.cancel', ui.lang) }}
            </NButton>
          </div>
        </template>
      </div>

      <NAlert
        v-if="syncNotice"
        :type="syncNotice.tone"
        :bordered="false"
        class="bara-set__sync-tip"
      >
        {{ syncNotice.text }}
      </NAlert>
    </SettingsGroup>

    <!-- 交互 -->
    <SettingsGroup
      :title="t('settings.group.interaction', ui.lang)"
      :icon="GROUP_ICONS.interaction"
      :expanded="ui.isGroupExpanded('interaction')"
      @toggle="ui.toggleGroup('interaction')"
    >
      <SettingsRow
        :label="t('settings.clickSuggestion', ui.lang)"
        :hint="t('settings.clickSuggestion.hint', ui.lang)"
      >
        <NRadioGroup
          :value="ui.suggestAutoSend ? 'send' : 'fill'"
          size="small"
          @update:value="(v: string) => ui.setSuggestAutoSend(v === 'send')"
        >
          <NRadioButton v-for="o in sendOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
      </SettingsRow>

      <!--
        交互规则紧跟着「点一下是发还是填」：两者管的是同一个动作的两端 ——
        点什么（规则）与点了之后怎么走（发送方式）。
      -->
      <SettingsRow :label="t('actions.title', ui.lang)">
        <span />
      </SettingsRow>
      <ActionSettings :lang="ui.lang" @changed="schema.reload()" />

      <SettingsRow
        label="QASmoke"
        :hint="t('settings.qa.hint', ui.lang)"
      >
        <NRadioGroup
          :value="ui.qaSmoke"
          size="small"
          @update:value="(v: string) => ui.setQaSmoke(v as QaSmoke)"
        >
          <NRadioButton v-for="o in qaOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </NRadioButton>
        </NRadioGroup>
      </SettingsRow>
    </SettingsGroup>

    <!-- 表格坞管理（对应骰子系统的「导航盘管理」） -->
    <SettingsGroup
      :title="t('settings.group.dock', ui.lang)"
      :icon="GROUP_ICONS.dock"
      :expanded="ui.isGroupExpanded('dock')"
      @toggle="ui.toggleGroup('dock')"
    >
      <SettingsRow
        :label="t('settings.dockManage', ui.lang)"
        :hint="t('settings.dockManage.hint', ui.lang)"
      >
        <NButton size="small" :disabled="hiddenCount === 0" @click="ui.showAllSheets()">
          {{ t('settings.showAll', ui.lang) }}
        </NButton>
      </SettingsRow>

      <div class="bara-set__sheets">
        <!-- 与坞里的条目同款可勾选标签：管的就是那些东西，长相应当一致 -->
        <NTag
          v-for="s in schema.sheets"
          :key="s.key"
          size="small"
          round
          checkable
          class="bara-set__sheet"
          :class="{ 'is-hidden': ui.isSheetHidden(s.key) }"
          :checked="!ui.isSheetHidden(s.key)"
          :title="t(ui.isSheetHidden(s.key) ? 'settings.sheetShow' : 'settings.sheetHide', ui.lang)"
          @update:checked="ui.toggleSheetHidden(s.key)"
        >
          <!-- 表名取自模板，不翻译：属于用户的存档数据（§8.7c） -->
          {{ s.name }}
        </NTag>
      </div>
    </SettingsGroup>

    <!--
      模板适配情况 —— 回答「为什么我这里没有资源条」。
      认不出的功能会自动隐藏，用户看不到任何痕迹，只能靠这里查明原因。
    -->
    <SettingsGroup
      :title="t('compat.title', ui.lang)"
      :icon="GROUP_ICONS.dock"
      :expanded="ui.isGroupExpanded('compat')"
      @toggle="ui.toggleGroup('compat')"
    >
      <p class="bara-set__compat-hint">{{ t('compat.hint', ui.lang) }}</p>
      <div v-for="b in bindings" :key="b.id" class="bara-set__compat-row">
        <span class="bara-set__compat-cap">{{ t(`compat.cap.${b.id}`, ui.lang) }}</span>
        <span v-if="!b.matched.length" class="bara-set__compat-none">
          {{ t('compat.none', ui.lang) }}
        </span>
        <span v-else class="bara-set__compat-hits">
          <!-- 表名取自模板，不翻译（§8.7c）；命中方式要译 -->
          <NTag
            v-for="m in b.matched"
            :key="m.name"
            size="small"
            :bordered="false"
            :type="m.via === 'fingerprint' ? 'warning' : 'default'"
            :title="t(`compat.via.${m.via}`, ui.lang)"
          >
            {{ m.name }}
            <span class="bara-set__compat-via">{{ t(`compat.via.${m.via}`, ui.lang) }}</span>
          </NTag>
        </span>
      </div>

      <!--
        预设紧跟着诊断：上面刚说「这几项认不出」，解法就在下一行。
        分开摆的话，用户看完诊断还得再去别处找工具。
      -->
      <PresetSettings :lang="ui.lang" @changed="schema.reload()" />
    </SettingsGroup>

    <!-- 关于 -->
    <SettingsGroup
      :title="t('settings.group.about', ui.lang)"
      :icon="GROUP_ICONS.about"
      :expanded="ui.isGroupExpanded('about')"
      @toggle="ui.toggleGroup('about')"
    >
      <SettingsRow :label="t('about.licenses', ui.lang)">
        <span />
      </SettingsRow>
      <LicenseNotices :lang="ui.lang" />
    </SettingsGroup>

    <!-- 高级 -->
    <SettingsGroup
      :title="t('settings.group.advanced', ui.lang)"
      :icon="GROUP_ICONS.advanced"
      :expanded="ui.isGroupExpanded('advanced')"
      @toggle="ui.toggleGroup('advanced')"
    >
      <SettingsRow :label="t('settings.diagnostics', ui.lang)">
        <span />
      </SettingsRow>
      <div class="bara-set__diag">
        <div v-for="d in diagnostics" :key="d.label" class="bara-set__diag-item">
          <NIcon
            class="bara-set__dot"
            :class="d.ok ? 'is-ok' : 'is-bad'"
            :component="d.ok ? ICONS.ok : ICONS.fail"
          />
          <span>{{ d.label }}</span>
          <span v-if="d.detail" class="bara-set__diag-detail">{{ d.detail }}</span>
        </div>
      </div>

      <SettingsRow
        :label="t('settings.reset', ui.lang)"
        :hint="t('settings.reset.hint', ui.lang)"
      >
        <!-- 确认态用 error：这是不可撤销的破坏性操作，不该长得像普通确认 -->
        <NButton
          size="small"
          :type="confirmingReset ? 'error' : 'default'"
          @click="onReset()"
        >
          {{ t(confirmingReset ? 'settings.reset.confirm' : 'settings.reset', ui.lang) }}
        </NButton>
        <NButton v-if="confirmingReset" size="small" quaternary @click="confirmingReset = false">
          {{ t('settings.cancel', ui.lang) }}
        </NButton>
      </SettingsRow>
    </SettingsGroup>
  </div>
</template>

<style scoped>
.bara-set { display: flex; flex-direction: column; gap: var(--bara-space-3); }

.bara-set__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bara-space-4);
}
.bara-set__title {
  font-size: var(--bara-font-size-md);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text);
}

/*
 * 控件统一宽度。设置面板里控件类型混杂（下拉、单选组、数字框），
 * 不定宽会让右侧边缘参差不齐，扫视时找不到对齐基准。
 */
.bara-set__num { width: 10rem; }
.bara-set__hint {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}

.bara-set__sync-tip { margin-top: var(--bara-space-3); }
.bara-set__sync {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-3);
  margin-top: var(--bara-space-3);
}
/* 预览是要逐字核对的内容，等宽 + 限高自滚动 */
.bara-set__sync-block {
  margin: 0;
  max-height: 16rem;
  overflow: auto;
  padding: var(--bara-space-3);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-sm);
  background: var(--bara-color-surface-sunken);
  color: var(--bara-color-text-muted);
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
  line-height: var(--bara-line-height-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
}
.bara-set__sync-actions { display: flex; gap: var(--bara-space-2); }

.bara-set__compat-hint {
  margin: 0 0 var(--bara-space-3);
  padding-top: var(--bara-space-2);
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
  line-height: var(--bara-line-height-relaxed);
}
.bara-set__compat-row {
  display: flex;
  align-items: baseline;
  gap: var(--bara-space-3);
  padding: var(--bara-space-2) 0;
}
.bara-set__compat-cap {
  flex: none;
  min-width: 5rem;
  font-size: var(--bara-font-size-sm);
}
/* 一项能力可能认到多张表（角色表就常有两张），换行排列 */
.bara-set__compat-hits {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-2);
  min-width: 0;
}
.bara-set__compat-none {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}
/* 命中方式压小并弱化：主角是表名，方式是佐证 */
.bara-set__compat-via {
  margin-left: var(--bara-space-2);
  font-size: var(--bara-font-size-xs);
  opacity: 0.75;
}

.bara-set__sheets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bara-space-2);
  padding: var(--bara-space-2) 0;
}
.bara-set__sheet { cursor: pointer; }
/* 隐藏态加删除线：只靠 checkable 的深浅差异在部分主题下辨识度不够 */
.bara-set__sheet.is-hidden { text-decoration: line-through; }

.bara-set__diag {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-1);
  padding-bottom: var(--bara-space-2);
}
.bara-set__diag-item {
  display: flex;
  align-items: center;
  gap: var(--bara-space-2);
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-muted);
}
.bara-set__dot { font-family: var(--bara-font-family-mono); }
.bara-set__dot.is-ok { color: var(--bara-color-success); }
.bara-set__dot.is-bad { color: var(--bara-color-danger); }
.bara-set__diag-detail {
  font-family: var(--bara-font-family-mono);
  color: var(--bara-color-text-subtle);
}
</style>
