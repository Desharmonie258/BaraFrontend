/**
 * 十二套内置主题 × 深浅两版 = 二十四个变体（开发文档 §8.7b）
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
    // 高饱和是设计目标，不追求对比度舒适 —— 但仍须保证主题切换入口
    // 在该主题下可见可点，否则用户切进来就出不去了。
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
  {
    id: 'caramellatte',
    name: { 'zh-CN': '焦糖拿铁', 'en-US': 'Caramel Latte' },
    nativeMode: 'light',
    light: {
      // 奶油底 + 焦糖褐。暖而不艳，长时间阅读不累眼。
      palette: {
        bg: '#f8efe2', surface: '#fffaf3', elevated: '#ffffff',
        ink: '#2a1c10', inkMuted: '#7a6350', line: '#e0cdb4',
        primary: '#b5651d', accent: '#8a4b2a',
        success: '#5b7f43', warning: '#c98a1e', danger: '#b03a2e', info: '#4a6f8a',
      },
      style: {
        radius: roundRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(80,55,30,0.10)',
          md: '0 4px 10px rgba(80,55,30,0.13)',
          lg: '0 10px 28px rgba(80,55,30,0.16)',
          glow: noGlow,
        },
      },
    },
    dark: {
      // 深烘焙底。焦糖色须提亮，否则在暗底上会糊成一团分不出层次的棕。
      palette: {
        bg: '#171009', surface: '#221810', elevated: '#2f2116',
        ink: '#f2e5d5', inkMuted: '#b09a83', line: '#3d2c1d',
        primary: '#d99551', accent: '#e8b87f',
        success: '#7fa15f', warning: '#e0a63c', danger: '#cf5f4f', info: '#6f97b5',
      },
      style: {
        radius: roundRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.55)',
          md: '0 4px 12px rgba(0,0,0,0.6)',
          lg: '0 10px 30px rgba(0,0,0,0.65)',
          glow: noGlow,
        },
      },
    },
  },
  {
    id: 'forest',
    name: { 'zh-CN': '林地', 'en-US': 'Forest' },
    nativeMode: 'dark',
    dark: {
      // 近黑的墨绿底 + 高饱和林绿。原生形态。
      palette: {
        bg: '#0f1411', surface: '#161d18', elevated: '#1f2922',
        ink: '#e3ede5', inkMuted: '#8fa396', line: '#2a3830',
        primary: '#1eb854', accent: '#1db8ab',
        success: '#3fcf6b', warning: '#d2a53c', danger: '#c25248', info: '#4f96c4',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.55)',
          md: '0 4px 12px rgba(0,0,0,0.6)',
          lg: '0 10px 30px rgba(0,0,0,0.65)',
          glow: noGlow,
        },
      },
    },
    light: {
      // 浅版：苔白底，绿色压暗提饱和 —— 亮林绿在白底上几乎读不出来。
      palette: {
        bg: '#f0f5f1', surface: '#fbfdfb', elevated: '#ffffff',
        ink: '#12211a', inkMuted: '#5a6f61', line: '#cbdcd1',
        primary: '#177f3c', accent: '#127f76',
        success: '#2e8b4f', warning: '#a8791f', danger: '#a63f36', info: '#376f94',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(20,50,35,0.09)',
          md: '0 4px 10px rgba(20,50,35,0.12)',
          lg: '0 10px 28px rgba(20,50,35,0.15)',
          glow: noGlow,
        },
      },
    },
  },
  {
    id: 'synthwave',
    name: { 'zh-CN': '合成波', 'en-US': 'Synthwave' },
    nativeMode: 'dark',
    dark: {
      // 靛紫夜空 + 霓虹粉青。原生形态，辉光是这套配色的组成部分。
      palette: {
        bg: '#1a103d', surface: '#241553', elevated: '#2f1c68',
        ink: '#f5e9ff', inkMuted: '#a794cf', line: '#3d2782',
        primary: '#e779c1', accent: '#58c7f3',
        success: '#3ddc97', warning: '#f3cc30', danger: '#ff5c72', info: '#8b7cf6',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 0 4px rgba(231,121,193,0.35)',
          md: '0 0 14px rgba(231,121,193,0.4)',
          lg: '0 0 30px rgba(88,199,243,0.45)',
          glow: '0 0 18px rgba(231,121,193,0.7)',
        },
      },
    },
    light: {
      // 浅版：淡紫底。霓虹色必须压暗，否则白底上等于没有字；
      // 辉光同时收弱 —— 亮底上的辉光只会让文字发糊。
      palette: {
        bg: '#f4f0fb', surface: '#fcfaff', elevated: '#ffffff',
        ink: '#1f1140', inkMuted: '#6b5b93', line: '#ddd2f0',
        primary: '#b03a8c', accent: '#1b7fa8',
        success: '#1f8f63', warning: '#a8811a', danger: '#c0384c', info: '#5a4bc4',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(45,25,90,0.10)',
          md: '0 4px 12px rgba(45,25,90,0.14)',
          lg: '0 10px 30px rgba(45,25,90,0.18)',
          glow: '0 0 12px rgba(176,58,140,0.35)',
        },
      },
    },
  },
  {
    id: 'autumn',
    name: { 'zh-CN': '深秋', 'en-US': 'Autumn' },
    nativeMode: 'light',
    light: {
      // 中性灰底 + 酒红。原生形态，色调克制偏正式。
      palette: {
        bg: '#f1f0ee', surface: '#fbfaf9', elevated: '#ffffff',
        ink: '#1f1a18', inkMuted: '#6d635d', line: '#d8d3cd',
        primary: '#8c0327', accent: '#d59b6a',
        success: '#4f7a45', warning: '#b8791d', danger: '#c0392b', info: '#4a6b8a',
      },
      style: {
        radius: softRadius, fontFamily: SERIF, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(40,30,25,0.09)',
          md: '0 4px 10px rgba(40,30,25,0.12)',
          lg: '0 10px 28px rgba(40,30,25,0.15)',
          glow: noGlow,
        },
      },
    },
    dark: {
      // 深棕灰底。酒红提亮成砖红 —— 暗底上的深红等同于黑。
      palette: {
        bg: '#14100f', surface: '#1e1917', elevated: '#2a2320',
        ink: '#ece5e0', inkMuted: '#a2948c', line: '#382f2b',
        primary: '#d1495b', accent: '#e0a878',
        success: '#6f9e5a', warning: '#d9a441', danger: '#d4574a', info: '#6d90b0',
      },
      style: {
        radius: softRadius, fontFamily: SERIF, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.55)',
          md: '0 4px 12px rgba(0,0,0,0.6)',
          lg: '0 10px 30px rgba(0,0,0,0.65)',
          glow: noGlow,
        },
      },
    },
  },
  {
    id: 'sorbet',
    name: { 'zh-CN': '雪葩', 'en-US': 'Sorbet' },
    nativeMode: 'light',
    light: {
      // 珊瑚 → 蜜桃 → 嫩绿 → 薄荷的粉彩渐层。原生形态。
      // 参考图里四色明度都很高，直接拿来当正文色会读不出来，
      // 因此正文另取深栗色，粉彩色只用在主色与强调上。
      palette: {
        bg: '#fff5f2', surface: '#fffaf8', elevated: '#ffffff',
        ink: '#3a2a2e', inkMuted: '#8a6b6f', line: '#f6dcd4',
        primary: '#d94f6e', accent: '#2f9b76',
        success: '#3f8f63', warning: '#c2872c', danger: '#c33b52', info: '#4f7fa5',
      },
      style: {
        radius: roundRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(140,80,80,0.10)',
          md: '0 4px 10px rgba(140,80,80,0.13)',
          lg: '0 10px 28px rgba(140,80,80,0.16)',
          glow: noGlow,
        },
      },
    },
    dark: {
      // 深版：暗栗底。此时粉彩色反过来成了最亮的一层，可以直接上原色。
      palette: {
        bg: '#221a1d', surface: '#2e2427', elevated: '#3a2e31',
        ink: '#ffeae5', inkMuted: '#c2a29d', line: '#453538',
        primary: '#ff9999', accent: '#a8e6c8',
        success: '#7fce9f', warning: '#e6c07a', danger: '#f07a8c', info: '#8fb8d8',
      },
      style: {
        radius: roundRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.5)',
          md: '0 4px 12px rgba(0,0,0,0.55)',
          lg: '0 10px 30px rgba(0,0,0,0.6)',
          glow: noGlow,
        },
      },
    },
  },
  {
    id: 'moorland',
    name: { 'zh-CN': '荒原', 'en-US': 'Moorland' },
    nativeMode: 'dark',
    dark: {
      // 暗海军蓝 + 石板灰蓝 + 鼠尾草绿 + 米色。原生形态，色调沉静。
      // 正文用米色而非纯白：纯白在这种偏蓝的底上会显得发冷、割裂。
      palette: {
        bg: '#232936', surface: '#2e3444', elevated: '#3a4354',
        ink: '#fff8dc', inkMuted: '#a3ac9d', line: '#435768',
        primary: '#a3b285', accent: '#7fa8c9',
        success: '#8fbf7a', warning: '#d9bb6a', danger: '#c9707a', info: '#6f9ec4',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.5)',
          md: '0 4px 12px rgba(0,0,0,0.55)',
          lg: '0 10px 30px rgba(0,0,0,0.6)',
          glow: noGlow,
        },
      },
    },
    light: {
      // 浅版：米色升为底，海军蓝降为强调。鼠尾草绿须压暗，
      // 原色 #a3b285 在米底上对比度不足 2，等于没有字。
      palette: {
        bg: '#f4f2e6', surface: '#fbfaf3', elevated: '#ffffff',
        ink: '#232936', inkMuted: '#5f6b5c', line: '#dbd7c3',
        primary: '#5a7a3f', accent: '#3d5a75',
        success: '#4a7d3c', warning: '#9d7a1c', danger: '#a8434e', info: '#3f6389',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(35,41,54,0.09)',
          md: '0 4px 10px rgba(35,41,54,0.12)',
          lg: '0 10px 28px rgba(35,41,54,0.15)',
          glow: noGlow,
        },
      },
    },
  },
  {
    id: 'nord',
    name: { 'zh-CN': '诺德', 'en-US': 'Nord' },
    nativeMode: 'dark',
    dark: {
      // Nord 的 Polar Night 作底、Snow Storm 作字、Frost 作主色、Aurora 作语义色。
      // 这是该配色本身的分工，照搬即可。
      palette: {
        bg: '#2e3440', surface: '#3b4252', elevated: '#434c5e',
        ink: '#eceff4', inkMuted: '#aab3c2', line: '#4c566a',
        primary: '#88c0d0', accent: '#81a1c1',
        success: '#a3be8c', warning: '#ebcb8b', danger: '#bf616a', info: '#5e81ac',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.45)',
          md: '0 4px 12px rgba(0,0,0,0.5)',
          lg: '0 10px 30px rgba(0,0,0,0.55)',
          glow: noGlow,
        },
      },
    },
    light: {
      // 浅版：Snow Storm 翻上来作底，Frost 与 Aurora 一并压暗 ——
      // 这两组本来就是为暗底调的，直接用在白底上全部糊掉。
      palette: {
        bg: '#eceff4', surface: '#f7f9fc', elevated: '#ffffff',
        ink: '#2e3440', inkMuted: '#5b6779', line: '#d8dee9',
        primary: '#3f7f96', accent: '#4c6f96',
        success: '#5f7d4a', warning: '#9a7420', danger: '#a2454e', info: '#3d5f85',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(46,52,64,0.09)',
          md: '0 4px 10px rgba(46,52,64,0.12)',
          lg: '0 10px 28px rgba(46,52,64,0.15)',
          glow: noGlow,
        },
      },
    },
  },
  {
    id: 'lemonade',
    name: { 'zh-CN': '柠檬汽水', 'en-US': 'Lemonade' },
    nativeMode: 'light',
    light: {
      // 淡柠底 + 草绿。原生形态。
      // 强调色取橄榄而非参考图里的亮黄 —— 亮黄在淡黄底上对比度不到 1.5。
      palette: {
        bg: '#f8fbe8', surface: '#fdfef5', elevated: '#ffffff',
        ink: '#26300d', inkMuted: '#63713c', line: '#dfe8bd',
        primary: '#4a8c03', accent: '#7d6d05',
        success: '#3f8f2e', warning: '#9d7818', danger: '#a8382c', info: '#42688a',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 2px rgba(60,75,20,0.09)',
          md: '0 4px 10px rgba(60,75,20,0.12)',
          lg: '0 10px 28px rgba(60,75,20,0.15)',
          glow: noGlow,
        },
      },
    },
    dark: {
      // 深版：橄榄暗底。这时亮黄终于用得上，直接作强调色。
      palette: {
        bg: '#14180a', surface: '#1e2410', elevated: '#2a3118',
        ink: '#eef5da', inkMuted: '#a5b382', line: '#333d1c',
        primary: '#8fcf3a', accent: '#e9e92e',
        success: '#7cc44f', warning: '#d9bb3c', danger: '#d4574a', info: '#6d9ab8',
      },
      style: {
        radius: softRadius, fontFamily: SANS, fontFamilyMono: MONO,
        shadow: {
          sm: '0 1px 3px rgba(0,0,0,0.5)',
          md: '0 4px 12px rgba(0,0,0,0.55)',
          lg: '0 10px 30px rgba(0,0,0,0.6)',
          glow: noGlow,
        },
      },
    },
  },
];

export const DEFAULT_THEME: ThemePreset['id'] = 'luxury';

export function getTheme(id: string): ThemePreset {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
