/**
 * 四套内置主题 × 深浅两版 = 八个变体（开发文档 §8.7b）
 *
 * 配色方向参考 daisyUI 的同名主题，色值为本项目自行取定 —— daisyUI 的
 * 配色是为其自身组件体系调的，直接搬到 Naive UI 的变量体系上未必协调。
 *
 * 相反变体不是数值反转：保持的是主题的色相家族与情绪，两版分别调。
 */
import type { ThemePreset, StyleTokens } from './tokens';

const SANS = "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SERIF = "'Noto Serif SC', Georgia, 'Times New Roman', serif";
// 等宽不是可选项：属性值、骰点、资源计数需纵向对齐，
// 比例字体下数字宽度不一会导致视觉抖动。
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

const softRadius: StyleTokens['radius'] =
  { none: '0', sm: '4px', md: '8px', lg: '14px', full: '9999px' };
const sharpRadius: StyleTokens['radius'] =
  { none: '0', sm: '0', md: '2px', lg: '4px', full: '9999px' };
const roundRadius: StyleTokens['radius'] =
  { none: '0', sm: '6px', md: '12px', lg: '20px', full: '9999px' };

const noGlow = 'none';

export const THEMES: ThemePreset[] = [
  {
    id: 'luxury',
    name: { 'zh-CN': '华贵', 'en-US': 'Luxury' },
    nativeMode: 'dark',
    dark: {
      palette: {
        bg: '#0d0c0f', surface: '#17151b', elevated: '#211d28',
        ink: '#ece6dd', inkMuted: '#a09585', line: '#332d3d',
        primary: '#c9a227', accent: '#e0c56a',
        success: '#6f9e5a', warning: '#d9a441', danger: '#b5483f', info: '#5a7fa0',
      },
      style: {
        radius: softRadius, fontFamily: SERIF, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.6)',
          md: '0 4px 12px rgba(0,0,0,0.65)',
          lg: '0 10px 32px rgba(0,0,0,0.7)',
          glow: noGlow,
        },
      },
    },
    light: {
      // 浅版：象牙底，金铜色降明度提饱和，保住「贵重」而非「明亮」
      palette: {
        bg: '#f7f3ea', surface: '#fffdf8', elevated: '#ffffff',
        ink: '#241f18', inkMuted: '#6b6053', line: '#ddd2bd',
        primary: '#9a7b16', accent: '#7a5f10',
        success: '#4f7a3c', warning: '#a8761f', danger: '#963A32', info: '#3f5f7d',
      },
      style: {
        radius: softRadius, fontFamily: SERIF, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(60,45,20,0.10)',
          md: '0 4px 10px rgba(60,45,20,0.13)',
          lg: '0 10px 26px rgba(60,45,20,0.16)',
          glow: noGlow,
        },
      },
    },
  },

  {
    id: 'retro',
    name: { 'zh-CN': '复古', 'en-US': 'Retro' },
    nativeMode: 'light',
    light: {
      palette: {
        bg: '#e8dcc0', surface: '#f3ead6', elevated: '#fbf5e6',
        ink: '#332b23', inkMuted: '#6d6152', line: '#c8b795',
        primary: '#8a5b3f', accent: '#a8763f',
        // 低饱和粉配米黄最容易骗过肉眼，这几个值按 AA 4.5:1 取
        success: '#4d7048', warning: '#98701f', danger: '#9c4b41', info: '#4a6675',
      },
      style: {
        radius: roundRadius, fontFamily: SERIF, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(80,60,35,0.12)',
          md: '0 3px 8px rgba(80,60,35,0.15)',
          lg: '0 8px 20px rgba(80,60,35,0.18)',
          glow: noGlow,
        },
      },
    },
    dark: {
      // 深版：暖褐底而非纯黑 —— 纯黑会让复古感变成现代暗色
      palette: {
        bg: '#2a221a', surface: '#382e24', elevated: '#463a2d',
        ink: '#ece0cb', inkMuted: '#b0a08a', line: '#574838',
        primary: '#d09a72', accent: '#e0b183',
        success: '#87b072', warning: '#d6ab5c', danger: '#cf7d70', info: '#7fa3b8',
      },
      style: {
        radius: roundRadius, fontFamily: SERIF, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.45)',
          md: '0 4px 10px rgba(0,0,0,0.5)',
          lg: '0 9px 24px rgba(0,0,0,0.55)',
          glow: noGlow,
        },
      },
    },
  },

  {
    id: 'halloween',
    name: { 'zh-CN': '万圣', 'en-US': 'Halloween' },
    nativeMode: 'dark',
    dark: {
      palette: {
        bg: '#0a0a0b', surface: '#151317', elevated: '#211d24',
        ink: '#eae6ee', inkMuted: '#98909f', line: '#332d38',
        primary: '#f06a1e', accent: '#8b4fd6',
        success: '#5fbf4a', warning: '#e2a72b', danger: '#d7413a', info: '#4f8fce',
      },
      style: {
        radius: sharpRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.7)',
          md: '0 4px 14px rgba(0,0,0,0.75)',
          lg: '0 12px 34px rgba(0,0,0,0.8)',
          glow: '0 0 14px rgba(240,106,30,0.45)',
        },
      },
    },
    light: {
      // 四套里最难的一版：橙紫必须大幅降明度，否则白底上刺眼且丢掉诡奇感
      palette: {
        bg: '#f4f0ea', surface: '#fbf8f4', elevated: '#ffffff',
        ink: '#23202a', inkMuted: '#655e70', line: '#d6cfc4',
        primary: '#b34a0d', accent: '#5b2f96',
        success: '#3e7a30', warning: '#94701a', danger: '#9c2f29', info: '#2f628f',
      },
      style: {
        radius: sharpRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(35,30,45,0.12)',
          md: '0 4px 10px rgba(35,30,45,0.16)',
          lg: '0 10px 26px rgba(35,30,45,0.2)',
          glow: '0 0 10px rgba(179,74,13,0.25)',
        },
      },
    },
  },

  {
    id: 'cyberpunk',
    name: { 'zh-CN': '赛博', 'en-US': 'Cyberpunk' },
    nativeMode: 'light',
    // 彩蛋主题：刺眼即是设计目标，不受对比度门槛约束。
    // 唯一底线是主题切换入口在该主题下仍须可见可点。
    easterEgg: true,
    light: {
      palette: {
        bg: '#f7f13a', surface: '#fdf85e', elevated: '#fffb8a',
        ink: '#1a1a10', inkMuted: '#4d4a22', line: '#c9c22a',
        primary: '#ff2fb9', accent: '#00e5ff',
        success: '#00b34a', warning: '#ff8a00', danger: '#ff2020', info: '#7a2fff',
      },
      style: {
        radius: sharpRadius, fontFamily: MONO, fontFamilyMono: MONO,
        shadow: {
          sm: '2px 2px 0 rgba(26,26,16,0.9)',
          md: '4px 4px 0 rgba(26,26,16,0.9)',
          lg: '7px 7px 0 rgba(26,26,16,0.9)',
          glow: '0 0 16px rgba(0,229,255,0.75)',
        },
      },
    },
    dark: {
      // 深红底 + 电光青，接近互补的高饱和搭配，边界会有视觉震颤 —— 这正是想要的效果。
      // 若震颤影响到功能性元素（焦点环、输入框边框），给该元素单独加中性描边隔开，
      // 而不是回头改底色。
      palette: {
        bg: '#2b0410', surface: '#3d0817', elevated: '#520d20',
        ink: '#ffe9f4', inkMuted: '#d08aa8', line: '#75142f',
        primary: '#00e5ff', accent: '#ff2fb9',
        success: '#00ff9c', warning: '#ffd400', danger: '#ff3b3b', info: '#9d5cff',
      },
      style: {
        radius: sharpRadius, fontFamily: MONO, fontFamilyMono: MONO,
        shadow: {
          sm: '0 0 4px rgba(0,229,255,0.5)',
          md: '0 0 12px rgba(0,229,255,0.55)',
          lg: '0 0 28px rgba(255,47,185,0.6)',
          glow: '0 0 20px rgba(0,229,255,0.85)',
        },
      },
    },
  },
];

export const DEFAULT_THEME: ThemePreset['id'] = 'luxury';

export function getTheme(id: string): ThemePreset {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
