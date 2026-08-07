/**
 * @vitest-environment jsdom
 *
 * 设置面板依赖的 store 契约。宿主的 getVariables/replaceVariables 不存在时
 * readSettings 会兜底到默认值，因此本文件不需要桩这些全局函数。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore, __resetUiStore } from '../src/BaraFrontend/stores/ui-store';
import { missingKeys } from '../src/BaraFrontend/i18n';

beforeEach(() => __resetUiStore());

describe('设置项的 store 契约', () => {
  it('数值项越界时夹回边界而非丢弃', () => {
    const ui = useUiStore();
    ui.setFontScale(99);
    expect(ui.fontScale).toBe(1.4);
    ui.setFontScale(0.1);
    expect(ui.fontScale).toBe(0.8);

    ui.setContentHeight(5);
    expect(ui.contentHeight).toBe(30);
    ui.setPageSize(9999);
    expect(ui.pageSize).toBe(200);
  });

  it('非数值输入回落到默认值', () => {
    const ui = useUiStore();
    ui.setFontScale(Number.NaN);
    expect(ui.fontScale).toBe(1);
  });

  it('坞条目隐藏可逆，且不影响其他条目', () => {
    const ui = useUiStore();
    ui.toggleSheetHidden('sheet_a');
    ui.toggleSheetHidden('sheet_b');
    expect(ui.isSheetHidden('sheet_a')).toBe(true);
    expect(ui.isSheetHidden('sheet_c')).toBe(false);

    ui.toggleSheetHidden('sheet_a');
    expect(ui.isSheetHidden('sheet_a')).toBe(false);
    expect(ui.isSheetHidden('sheet_b')).toBe(true);

    ui.showAllSheets();
    expect(ui.hiddenSheets).toEqual([]);
  });

  it('默认只展开外观组 —— 全开会让面板一屏放不下', () => {
    const ui = useUiStore();
    expect(ui.isGroupExpanded('appearance')).toBe(true);
    expect(ui.isGroupExpanded('advanced')).toBe(false);
    ui.toggleGroup('advanced');
    expect(ui.isGroupExpanded('advanced')).toBe(true);
  });

  it('恢复默认保留语言 —— 看不懂界面就找不到改回来的地方', () => {
    const ui = useUiStore();
    ui.setLang('en-US');
    ui.setFontScale(1.4);
    ui.setTheme('halloween');
    ui.toggleSheetHidden('sheet_a');

    ui.resetSettings();

    expect(ui.lang).toBe('en-US');
    expect(ui.fontScale).toBe(1);
    expect(ui.hiddenSheets).toEqual([]);
  });

  it('设置是一个目的地，关闭后回到进来前的位置', () => {
    const ui = useUiStore();
    ui.goTo({ kind: 'table', sheetKey: 'sheet_x' });
    ui.openSettings();
    expect(ui.destination.kind).toBe('settings');

    ui.closeSettings();
    expect(ui.destination).toEqual({ kind: 'table', sheetKey: 'sheet_x' });
  });

  it('在设置页重复点齿轮不会把返回目标设成设置页自己', () => {
    const ui = useUiStore();
    ui.goTo({ kind: 'table', sheetKey: 'sheet_x' });
    ui.openSettings();
    ui.openSettings();
    ui.closeSettings();
    expect(ui.destination).toEqual({ kind: 'table', sheetKey: 'sheet_x' });
  });
});

describe('双语目录', () => {
  it('中英键完全对齐 —— 缺键会在界面上露出原始键名', () => {
    expect(missingKeys()).toEqual({ inZhOnly: [], inEnOnly: [] });
  });
});
