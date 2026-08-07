import { describe, it, expect } from 'vitest';
import { THEMES, DEFAULT_THEME, getTheme } from '../src/BaraFrontend/presentation/theme/presets';
import { toCssVars, deriveSemantic } from '../src/BaraFrontend/presentation/theme/tokens';

const MODES = ['light', 'dark'] as const;

/** 相对亮度（WCAG 2.x 定义） */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4]
    .map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PALETTE_KEYS = [
  'bg', 'surface', 'elevated', 'ink', 'inkMuted', 'line',
  'primary', 'accent', 'success', 'warning', 'danger', 'info',
] as const;

describe('主题预设', () => {
  it('id 唯一', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每套主题都有深浅两版', () => {
    for (const t of THEMES) {
      expect(t.light, `${t.id} 缺少浅色`).toBeTruthy();
      expect(t.dark, `${t.id} 缺少深色`).toBeTruthy();
    }
  });

  it('原生模式必须是两版之一', () => {
    for (const t of THEMES) {
      expect(MODES, t.id).toContain(t.nativeMode);
    }
  });

  it('双语名都不为空', () => {
    for (const t of THEMES) {
      expect(t.name['zh-CN'], t.id).toBeTruthy();
      expect(t.name['en-US'], t.id).toBeTruthy();
    }
  });

  it('调色板键齐全且都是合法 hex', () => {
    for (const t of THEMES) {
      for (const mode of MODES) {
        for (const k of PALETTE_KEYS) {
          const v = (t[mode].palette as Record<string, string>)[k];
          expect(v, `${t.id}.${mode}.${k}`).toMatch(/^#[0-9a-fA-F]{3,8}$/);
        }
      }
    }
  });

  it('圆角、字族、阴影四档齐全', () => {
    for (const t of THEMES) {
      for (const mode of MODES) {
        const s = t[mode].style;
        expect(s.fontFamily, `${t.id}.${mode}`).toBeTruthy();
        expect(s.fontFamilyMono, `${t.id}.${mode}`).toBeTruthy();
        for (const k of ['sm', 'md', 'lg', 'glow'] as const) {
          expect(s.shadow[k], `${t.id}.${mode}.shadow.${k}`).toBeTruthy();
        }
        for (const k of ['none', 'sm', 'md', 'lg', 'full'] as const) {
          expect(s.radius[k], `${t.id}.${mode}.radius.${k}`).toBeDefined();
        }
      }
    }
  });

  /*
   * 对比度是硬门槛，**所有主题一视同仁** —— 赛博主题原先挂着彩蛋豁免，
   * 撤掉后实测正文对比度 14.7 / 16.2，本就不需要豁免：它的「刺眼」来自
   * 强调色的色相搭配，不来自正文可读性。
   */
  it('正文对比度满足 WCAG AA（≥ 4.5）', () => {
    for (const t of THEMES) {
      for (const mode of MODES) {
        const p = t[mode].palette;
        expect(contrast(p.ink, p.bg), `${t.id}.${mode} 正文对比度不足`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('次要文字对比度满足大字号门槛（≥ 3）', () => {
    for (const t of THEMES) {
      for (const mode of MODES) {
        const p = t[mode].palette;
        expect(
          contrast(p.inkMuted, p.surface),
          `${t.id}.${mode} 次要文字对比度不足`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('primary 与 accent 必须可区分 —— 坞徽章靠这两色分层', () => {
    for (const t of THEMES) {
      for (const mode of MODES) {
        const p = t[mode].palette;
        expect(p.primary.toLowerCase(), `${t.id}.${mode}`).not.toBe(p.accent.toLowerCase());
      }
    }
  });

  it('深浅两版不是同一份色值 —— 反转不等于换算', () => {
    for (const t of THEMES) {
      expect(t.light.palette.bg, t.id).not.toBe(t.dark.palette.bg);
    }
  });

  it('默认主题在清单内', () => {
    expect(THEMES.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });

  it('未知 id 回落到默认主题而非抛错', () => {
    expect(getTheme('不存在' as never).id).toBe(DEFAULT_THEME);
  });

  it('每个变体都能生成完整的 CSS 变量表', () => {
    for (const t of THEMES) {
      for (const mode of MODES) {
        const vars = toCssVars(deriveSemantic(t[mode].palette, mode), t[mode].style);
        expect(vars['--bara-color-bg'], `${t.id}.${mode}`).toBeTruthy();
        expect(vars['--bara-color-accent'], `${t.id}.${mode}`).toBeTruthy();
        expect(vars['--bara-color-accent-soft'], `${t.id}.${mode}`).toBeTruthy();
      }
    }
  });
});
