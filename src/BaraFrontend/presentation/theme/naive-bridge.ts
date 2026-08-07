/**
 * 令牌 → Naive UI themeOverrides（开发文档 §8.7b）
 *
 * 两条并行通路：
 *   语义令牌 ─┬→ themeOverrides   （Naive UI 组件消费）
 *             └→ 自有 CSS 变量     （自绘元素消费）
 *
 * 领域专属令牌（资源条、检定结果等级、增益减益）在 Naive UI 中没有对应，
 * 只走后一条通路。
 */
import type { GlobalThemeOverrides } from 'naive-ui';
import type { SemanticColors, StyleTokens } from './tokens';
import { CONSTANTS } from './tokens';

export function toNaiveOverrides(c: SemanticColors, s: StyleTokens): GlobalThemeOverrides {
  return {
    common: {
      bodyColor: c.bg,
      cardColor: c.surface,
      modalColor: c.surfaceRaised,
      popoverColor: c.surfaceRaised,
      tableColor: c.surface,
      inputColor: c.surfaceSunken,

      textColorBase: c.text,
      textColor1: c.text,
      textColor2: c.textMuted,
      textColor3: c.textSubtle,
      placeholderColor: c.textSubtle,
      iconColor: c.textMuted,

      borderColor: c.border,
      dividerColor: c.divider,

      primaryColor: c.primary,
      primaryColorHover: c.primaryHover,
      primaryColorPressed: c.primaryActive,
      primaryColorSuppl: c.primaryHover,

      successColor: c.success,
      warningColor: c.warning,
      errorColor: c.danger,
      infoColor: c.info,

      hoverColor: c.hover,

      borderRadius: s.radius.md,
      borderRadiusSmall: s.radius.sm,

      fontFamily: s.fontFamily,
      fontFamilyMono: s.fontFamilyMono,
      fontSizeTiny: CONSTANTS.fontSize.xs,
      fontSizeSmall: CONSTANTS.fontSize.sm,
      fontSizeMedium: CONSTANTS.fontSize.md,
      fontSizeLarge: CONSTANTS.fontSize.lg,
      fontSizeHuge: CONSTANTS.fontSize.xl,

      boxShadow1: s.shadow.sm,
      boxShadow2: s.shadow.md,
      boxShadow3: s.shadow.lg,
    },
    Card: {
      colorModal: c.surface,
      titleFontSizeSmall: CONSTANTS.fontSize.md,
    },
    Collapse: {
      titleTextColor: c.text,
      dividerColor: c.divider,
      itemMargin: '0',
    },
  };
}
