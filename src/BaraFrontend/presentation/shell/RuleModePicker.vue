<script setup lang="ts">
/**
 * 规则族选择器 —— 三张带标识的卡片。
 *
 * 标识走远程地址，因此每张卡都要能在图片加载不出来时继续可用：
 * 酒馆可能离线、图床可能被墙、CSP 可能拦外链。失败时回落到骰式文本
 * （d20 / d100 / d10），选择功能完全不受影响。
 *
 * 本组件只负责**标识与选择**。各族的出处声明、许可证全文放在设置的
 * 「关于」栏目 —— 协议里管标识的条款（BRP OGL §15「title page or its
 * equivalent」）和管法务文本的条款（§3「all appropriate locations」）
 * 要求的是不同的东西，位置也就不必绑在一起。
 */
import { ref } from 'vue';
import { NButton } from 'naive-ui';
import { RULE_SYSTEMS, type RuleFamily } from '../../domain/rule-systems';
import type { Lang } from '../../stores/ui-store';
import { t } from '../../i18n';

defineProps<{
  modelValue: RuleFamily;
  lang: Lang;
}>();
const emit = defineEmits<{ 'update:modelValue': [v: RuleFamily] }>();

/** 加载失败的标识，失败一次就不再尝试渲染该图 */
const broken = ref<Set<string>>(new Set());
function onImgError(id: string): void {
  broken.value = new Set(broken.value).add(id);
}
</script>

<template>
  <div class="bara-rule">
    <div class="bara-rule__grid">
      <NButton
        v-for="r in RULE_SYSTEMS"
        :key="r.id"
        quaternary
        class="bara-rule__card"
        :class="{ 'is-active': r.id === modelValue }"
        :aria-pressed="r.id === modelValue"
        @click="emit('update:modelValue', r.id)"
      >
        <span class="bara-rule__logo">
          <img
            v-if="!broken.has(r.id)"
            :src="r.logo"
            :alt="r.logoAlt"
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="onImgError(r.id)"
          />
          <!-- 图挂了也要看得出这是哪一族 -->
          <span v-else class="bara-rule__dice-fallback">{{ r.dice }}</span>
        </span>
        <span class="bara-rule__name">{{ r.name[lang] }}</span>
        <span class="bara-rule__dice">{{ r.dice }}</span>
      </NButton>
    </div>

    <!--
      声明正文已移入设置的「关于」栏目：BRP OGL §3 要求许可证出现在
      「all appropriate locations」，软件惯例位置是「关于」；而 §15 管的是
      **标识**，要求它显眼地出现在「title page or its equivalent」——
      也就是上面那三张卡，所以标识留在这里。
    -->
    <p class="bara-rule__pointer">{{ t('settings.ruleSystem.licenses', lang) }}</p>
  </div>
</template>

<style scoped>
.bara-rule { display: flex; flex-direction: column; gap: var(--bara-space-3); width: 100%; }

.bara-rule__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--bara-space-2);
}
/* 窄屏改成纵向：三张卡横排时标识会被压到看不清 */
@media (max-width: 520px) {
  .bara-rule__grid { grid-template-columns: 1fr; }
}

/*
 * 规则卡是纵向排布的大方块（标识 + 名称 + 骰式），而 NButton 定高、
 * 内容横向居中。放开高度并改内容容器的排布。
 */
.bara-rule__card {
  width: 100%;
  height: auto;
  padding: var(--bara-space-3);
  border: var(--bara-border-width) solid var(--bara-color-border);
  border-radius: var(--bara-radius-md);
  background: var(--bara-color-surface);
  transition:
    border-color var(--bara-duration-fast) var(--bara-easing),
    background var(--bara-duration-fast) var(--bara-easing);
}
.bara-rule__card :deep(.n-button__content) {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--bara-space-2);
}
.bara-rule__card:hover { border-color: var(--bara-color-border-strong); }
.bara-rule__card.is-active {
  border-color: var(--bara-color-primary);
  background: var(--bara-color-primary-soft);
}

.bara-rule__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 3rem;
  width: 100%;
}
.bara-rule__logo img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}
.bara-rule__dice-fallback {
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-lg);
  color: var(--bara-color-text-muted);
}

.bara-rule__name {
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  text-align: center;
}
.bara-rule__dice {
  font-family: var(--bara-font-family-mono);
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}

/* 声明文字小而不隐藏：协议要求可见，不是要求显眼 */
.bara-rule__pointer {
  margin: 0;
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}
</style>
