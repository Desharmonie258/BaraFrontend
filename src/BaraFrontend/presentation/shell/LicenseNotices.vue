<script setup lang="ts">
/**
 * 许可与版权声明 —— 设置面板「关于」栏目里的法务区。
 *
 * 三族的声明**始终全部展示**，不只展示当前选中的那一族：插件分发的是
 * 一份包含三族实现的产物，许可义务不随运行时选择而消失。
 *
 * 位置分工（各协议要求的对象不同）：
 * - **标识**留在规则选择器 —— BRP OGL §15 要求「prominently display…
 *   on the title page or its equivalent」，那里才是它该显眼的地方。
 * - **许可证全文与版权声明**放这里 —— §3 要求「in all appropriate
 *   locations」，「关于」是软件放法务文本的惯例位置。
 *
 * 全部内容恒为英文、不参与 i18n、不可关闭。lang/translate 属性挡住
 * 浏览器自动翻译 —— 译文不再是协议要求的原文。
 */
import { ref } from 'vue';
import { RULE_SYSTEMS } from '../../domain/rule-systems';
import {
  PLUGIN_VERSION,
  PLUGIN_NOTICE,
  AFPL_TEXT,
  CREDITS,
} from '../../domain/plugin-license';
import type { Lang } from '../../stores/ui-store';
import { t } from '../../i18n';
import { NButton } from 'naive-ui';

defineProps<{ lang: Lang }>();

/** 展开了全文的条目。默认收起 —— 全文很长，会把设置面板淹没。 */
const openLicenses = ref<Set<string>>(new Set());
function toggle(id: string): void {
  const next = new Set(openLicenses.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openLicenses.value = next;
}
</script>

<template>
  <div class="bara-lic">
    <!--
      本插件自身的授权。AFPL 第 2(c)(iii) 节要求交互式程序在「About box」
      一类的位置展示版权与无担保声明，因此这一段固定展示、不折叠。
    -->
    <section class="bara-lic__item">
      <h4 class="bara-lic__name">{{ PLUGIN_VERSION }}</h4>
      <p class="bara-lic__notice" lang="en" translate="no">{{ PLUGIN_NOTICE }}</p>
      <div class="bara-lic__actions">
        <NButton size="tiny" quaternary @click="toggle('__afpl__')">
          {{ t(openLicenses.has('__afpl__') ? 'about.license.hide' : 'about.license.show', lang) }}
        </NButton>
      </div>
      <pre v-if="openLicenses.has('__afpl__')" class="bara-lic__full" lang="en" translate="no">{{ AFPL_TEXT }}</pre>
    </section>

    <!-- 致谢：写清楚借鉴了什么，而不只是列个名字 -->
    <section v-for="c in CREDITS" :key="c.name" class="bara-lic__item">
      <h4 class="bara-lic__name">{{ t('about.credit', lang, { name: c.name, author: c.author }) }}</h4>
      <!-- 许可证名恒为原文，不翻译：它是法律文本的标识 -->
      <p v-if="c.license" class="bara-lic__notice" lang="en" translate="no">{{ c.license }}</p>
      <p class="bara-lic__ogc">{{ c.what }}</p>
      <div class="bara-lic__actions">
        <a
          v-for="l in c.links"
          :key="l.url"
          class="bara-lic__link"
          :href="l.url"
          target="_blank"
          rel="noopener noreferrer"
        >{{ l.label }}</a>
      </div>
    </section>

    <p class="bara-lic__intro">{{ t('about.licenses.intro', lang) }}</p>

    <section v-for="r in RULE_SYSTEMS" :key="r.id" class="bara-lic__item">
      <h4 class="bara-lic__name">{{ r.name['en-US'] }}</h4>

      <p v-if="r.notice" class="bara-lic__notice" lang="en" translate="no">{{ r.notice }}</p>

      <!-- §9：必须指明哪些部分是 Open Game Content -->
      <p v-if="r.ogcDeclaration" class="bara-lic__ogc" lang="en" translate="no">
        {{ r.ogcDeclaration }}
      </p>

      <div class="bara-lic__actions">
        <a
          v-if="r.noticeUrl"
          class="bara-lic__link"
          :href="r.noticeUrl"
          target="_blank"
          rel="noopener noreferrer"
          translate="no"
        >{{ r.noticeUrl }}</a>

        <!--
          全文按需展开，但**必须随产物分发**：BRP OGL §3 的 affix
          指的是副本随作品存在，外链会失效，不构成 affix。
          因此全文是内嵌字符串，折叠只是显示层面的事。
        -->
        <NButton v-if="r.licenseText" size="tiny" quaternary @click="toggle(r.id)">
          {{ t(openLicenses.has(r.id) ? 'about.license.hide' : 'about.license.show', lang) }}
        </NButton>
      </div>

      <pre
        v-if="r.licenseText && openLicenses.has(r.id)"
        class="bara-lic__full"
        lang="en"
        translate="no"
      >{{ r.licenseText }}</pre>
    </section>
  </div>
</template>

<style scoped>
.bara-lic { display: flex; flex-direction: column; gap: var(--bara-space-4); width: 100%; }

.bara-lic__intro {
  margin: 0;
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-text-subtle);
}

.bara-lic__item {
  display: flex;
  flex-direction: column;
  gap: var(--bara-space-2);
  padding-top: var(--bara-space-3);
  border-top: var(--bara-border-width) solid var(--bara-color-divider);
}
.bara-lic__item:first-of-type { border-top: none; padding-top: 0; }

.bara-lic__name {
  margin: 0;
  font-size: var(--bara-font-size-sm);
  font-weight: var(--bara-font-weight-medium);
  color: var(--bara-color-text);
}

/* 声明文字小而不隐藏：协议要求可见，不是要求显眼 */
.bara-lic__notice,
.bara-lic__ogc {
  margin: 0;
  font-size: var(--bara-font-size-xs);
  line-height: var(--bara-line-height-relaxed);
  color: var(--bara-color-text-muted);
  word-break: break-word;
  /* §7 的四段声明用换行分隔，必须保留 */
  white-space: pre-line;
}
.bara-lic__ogc { color: var(--bara-color-text-subtle); }

.bara-lic__actions {
  display: flex;
  align-items: center;
  gap: var(--bara-space-3);
  flex-wrap: wrap;
}
.bara-lic__link {
  font-size: var(--bara-font-size-xs);
  color: var(--bara-color-accent);
  word-break: break-all;
}

/*
 * 全文限高并自滚动。它比整个设置面板还长，不限高会把其他栏目推到看不见。
 */
.bara-lic__full {
  margin: 0;
  max-height: 18rem;
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
</style>
