/**
 * 设计令牌（开发文档 §8.7d）
 *
 * 两层结构：每套主题变体只手写 12 个调色板原始值，
 * 44 个语义颜色由 deriveSemantic() 纯函数推导。
 *
 * 命名铁律：颜色一律**语义命名**，禁止数值命名（gray-500 这类）。
 * 数值命名在深浅两版之间会语义颠倒 —— 浅版的 gray-100 是背景，
 * 深版的 gray-100 却是文字。
 */

export type ThemeId = 'luxury' | 'retro' | 'halloween' | 'cyberpunk';
export type ModeId = 'light' | 'dark';

/** 每套变体手写的 12 个原始值 */
export interface Palette {
  bg: string;
  surface: string;
  elevated: string;
  ink: string;
  inkMuted: string;
  line: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

/** 推导出的语义颜色 */
export interface SemanticColors {
  // 表面 5
  bg: string; surface: string; surfaceRaised: string; surfaceSunken: string; overlay: string;
  // 文字 4
  text: string; textMuted: string; textSubtle: string; textInverse: string;
  // 边界 3
  border: string; borderStrong: string; divider: string;
  // 主色与强调 6
  primary: string; primaryHover: string; primaryActive: string; primarySoft: string;
  accent: string; accentSoft: string;
  // 状态 8
  success: string; successSoft: string; warning: string; warningSoft: string;
  danger: string; dangerSoft: string; info: string; infoSoft: string;
  // 交互 3
  hover: string; selected: string; focusRing: string;
  // 领域专属 15
  resourceFill: string; resourceTrack: string; resourceTier: string;
  buff: string; debuff: string; statusNeutral: string;
  outcomeCritSuccess: string; outcomeSuccess: string; outcomePartial: string;
  outcomeFailure: string; outcomeFumble: string;
  dice: string; present: string; absent: string; locked: string;
}

/** 不随主题变的结构常量（31 个） */
export const CONSTANTS = {
  space: ['0px', '2px', '4px', '8px', '12px', '16px', '24px', '32px', '48px'],
  fontSize: { xs: '11px', sm: '12px', md: '14px', lg: '16px', xl: '20px', '2xl': '24px' },
  fontWeight: { normal: '400', medium: '500', bold: '700' },
  lineHeight: { tight: '1.25', normal: '1.5', relaxed: '1.75' },
  borderWidth: { base: '1px', strong: '2px' },
  duration: { fast: '120ms', normal: '220ms' },
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  // 层级：插件注入的是酒馆页面，硬编码 z-index 会与宿主抢层。
  // 全部弹层必须走这五个值，并与宿主留出协调余量。
  z: { base: 100, dropdown: 200, popup: 300, overlay: 400, toast: 500 },
} as const;

/** 随主题变的风格令牌（8 个） */
export interface StyleTokens {
  radius: { none: string; sm: string; md: string; lg: string; full: string };
  shadow: { sm: string; md: string; lg: string; glow: string };
  fontFamily: string;
  fontFamilyMono: string;
}

export interface ThemeVariant {
  palette: Palette;
  style: StyleTokens;
  /** 逃生口：少数无法由推导规则自然得出的值。超过五六项说明推导规则该调整。 */
  overrides?: Partial<SemanticColors>;
}

export interface ThemePreset {
  id: ThemeId;
  name: { 'zh-CN': string; 'en-US': string };
  /** 原生模式。auto 模式下切到该主题时落在此模式，而非系统偏好。 */
  nativeMode: ModeId;
  /** 彩蛋主题不保证可读性，不作默认，UI 上需标注 */
  easterEgg?: boolean;
  light: ThemeVariant;
  dark: ThemeVariant;
}

/** 在 hex 颜色上叠加透明度，用于生成 soft / hover 一类衍生色 */
function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 朝目标色混合，用于 hover / active 的明暗微调 */
function mix(hex: string, target: string, ratio: number): string {
  const parse = (x: string) => {
    const h = x.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(target);
  const m = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  const hx = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hx(m(r1, r2))}${hx(m(g1, g2))}${hx(m(b1, b2))}`;
}

/**
 * 调色板 → 语义令牌。纯函数，为八套变体各写一份快照测试。
 */
export function deriveSemantic(p: Palette, mode: ModeId): SemanticColors {
  const deeper = mode === 'dark' ? '#000000' : '#ffffff';
  const lighter = mode === 'dark' ? '#ffffff' : '#000000';

  const derived: SemanticColors = {
    bg: p.bg,
    surface: p.surface,
    surfaceRaised: p.elevated,
    surfaceSunken: mix(p.surface, deeper, 0.06),
    overlay: alpha(mode === 'dark' ? '#000000' : '#1a1a1a', 0.55),

    text: p.ink,
    textMuted: p.inkMuted,
    textSubtle: mix(p.inkMuted, p.bg, 0.4),
    textInverse: p.bg,

    border: p.line,
    borderStrong: mix(p.line, lighter, 0.25),
    divider: alpha(p.line, 0.5),

    primary: p.primary,
    primaryHover: mix(p.primary, lighter, 0.15),
    primaryActive: mix(p.primary, deeper, 0.15),
    primarySoft: alpha(p.primary, 0.16),
    accent: p.accent,
    accentSoft: alpha(p.accent, 0.16),

    success: p.success, successSoft: alpha(p.success, 0.16),
    warning: p.warning, warningSoft: alpha(p.warning, 0.16),
    danger: p.danger, dangerSoft: alpha(p.danger, 0.16),
    info: p.info, infoSoft: alpha(p.info, 0.16),

    hover: alpha(p.ink, 0.06),
    selected: alpha(p.primary, 0.12),
    focusRing: alpha(p.primary, 0.45),

    // 领域专属：Naive UI 无对应变量，只走自有 CSS 变量通路
    resourceFill: p.primary,
    resourceTrack: alpha(p.ink, 0.1),
    resourceTier: p.accent,
    buff: p.success,
    debuff: p.danger,
    statusNeutral: p.inkMuted,
    outcomeCritSuccess: p.accent,
    outcomeSuccess: p.success,
    outcomePartial: p.warning,
    outcomeFailure: p.inkMuted,
    outcomeFumble: p.danger,
    dice: p.primary,
    present: p.success,
    absent: mix(p.inkMuted, p.bg, 0.3),
    locked: alpha(p.inkMuted, 0.6),
  };
  return derived;
}

/** 令牌 → CSS 变量声明。注入插件根容器，**绝不注入 :root**。 */
export function toCssVars(c: SemanticColors, s: StyleTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

  for (const [k, v] of Object.entries(c)) vars[`--bara-color-${kebab(k)}`] = v;
  CONSTANTS.space.forEach((v, i) => (vars[`--bara-space-${i}`] = v));
  for (const [k, v] of Object.entries(CONSTANTS.fontSize)) vars[`--bara-font-size-${k}`] = v;
  for (const [k, v] of Object.entries(CONSTANTS.fontWeight)) vars[`--bara-font-weight-${k}`] = v;
  for (const [k, v] of Object.entries(CONSTANTS.lineHeight)) vars[`--bara-line-height-${k}`] = v;
  for (const [k, v] of Object.entries(CONSTANTS.borderWidth)) vars[`--bara-border-width-${k}`] = v;
  for (const [k, v] of Object.entries(CONSTANTS.duration)) vars[`--bara-duration-${k}`] = v;
  vars['--bara-easing'] = CONSTANTS.easing;
  for (const [k, v] of Object.entries(CONSTANTS.z)) vars[`--bara-z-${k}`] = String(v);
  for (const [k, v] of Object.entries(s.radius)) vars[`--bara-radius-${k}`] = v;
  for (const [k, v] of Object.entries(s.shadow)) vars[`--bara-shadow-${k}`] = v;
  vars['--bara-font-family'] = s.fontFamily;
  vars['--bara-font-family-mono'] = s.fontFamilyMono;
  return vars;
}
