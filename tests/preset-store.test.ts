/**
 * 预设的启用与兜底识别。
 *
 * 最要紧的一条：**内置绑定认得出的表，预设不许插手**。内置那三通道
 * 经过十份真实模板的回归测试（见 tests/template-compat.test.ts），
 * 用户手填的关键词盖过它等于把验证过的规则换成猜的。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { invalidate, resolveSheets, setPresetFallback } from '../src/BaraFrontend/data/snapshot-repo';
import { CHARACTERS, ITEMS } from '../src/BaraFrontend/domain/sheet-binding';
import { importPreset, clearPreset, loadPreset, activePreset } from '../src/BaraFrontend/data/preset-store';

(globalThis as any).window = globalThis;

let globalVars: Record<string, unknown>;

function serve(sheets: Record<string, { name: string; content: string[][] }>) {
  const raw: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(sheets)) {
    raw[key] = { name: s.name, sourceData: { ddl: '' }, content: s.content };
  }
  (globalThis as any).AutoCardUpdaterAPI = { getCurrentData: () => raw };
  invalidate();
}

beforeEach(() => {
  globalVars = {};
  delete (globalThis as any).AutoCardUpdaterAPI;
  invalidate();
  setPresetFallback(null);

  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  (globalThis as any).getVariables = () => clone(globalVars);
  (globalThis as any).replaceVariables = (fn: (v: Record<string, unknown>) => unknown) => {
    globalVars = clone(fn(clone(globalVars))) as Record<string, unknown>;
  };
});

describe('兜底识别', () => {
  it('内置认不出的表，预设能补上', () => {
    // 「登场人物一览」既不在 key 候选里，名字也不在候选里
    serve({
      sheet_x: { name: '登场人物一览', content: [['row_id', '姓名', '基础属性'], ['1', '御苑', '']] },
    });
    expect(resolveSheets(CHARACTERS)).toEqual([]);

    importPreset({ modules: { npc: { tableKeywords: ['登场人物'] } } });
    expect(resolveSheets(CHARACTERS).map((r) => r.sheet.name)).toEqual(['登场人物一览']);
  });

  it('预设补出来的表标为「推测」—— 认错时那行标注是唯一的线索', () => {
    serve({ sheet_x: { name: '登场人物一览', content: [['row_id', '姓名']] } });
    importPreset({ modules: { npc: { tableKeywords: ['登场人物'] } } });
    expect(resolveSheets(CHARACTERS)[0].via).toBe('fingerprint');
  });

  it('内置认得出时预设不插手', () => {
    serve({
      sheet_characters: { name: '角色表', content: [['row_id', '姓名']] },
      sheet_x: { name: '登场人物一览', content: [['row_id', '姓名']] },
    });
    importPreset({ modules: { npc: { tableKeywords: ['登场人物'] } } });

    const names = resolveSheets(CHARACTERS).map((r) => r.sheet.name);
    expect(names).toEqual(['角色表']);
  });

  it('骰子系统的 player 与 npc 两个模块都认 —— 本前端把主角并进了角色表', () => {
    serve({ sheet_x: { name: '出场角色', content: [['row_id', '姓名']] } });
    importPreset({ modules: { player: { tableKeywords: ['出场角色'] } } });
    expect(resolveSheets(CHARACTERS).map((r) => r.sheet.name)).toEqual(['出场角色']);
  });

  it('模块与规格对不上时不乱认', () => {
    serve({ sheet_x: { name: '随身携带', content: [['row_id', '名称']] } });
    importPreset({ modules: { bag: { tableKeywords: ['随身携带'] } } });

    expect(resolveSheets(ITEMS).map((r) => r.sheet.name)).toEqual(['随身携带']);
    // bag 的关键词不该让角色表也认出来
    expect(resolveSheets(CHARACTERS)).toEqual([]);
  });

  it('停用后回到内置行为', () => {
    serve({ sheet_x: { name: '登场人物一览', content: [['row_id', '姓名']] } });
    importPreset({ modules: { npc: { tableKeywords: ['登场人物'] } } });
    expect(resolveSheets(CHARACTERS)).toHaveLength(1);

    clearPreset();
    expect(resolveSheets(CHARACTERS)).toEqual([]);
    expect(activePreset()).toBeNull();
  });
});

describe('存取', () => {
  it('导入后能从存储恢复', () => {
    importPreset({ name: '我的预设', modules: { npc: { tableKeywords: ['登场人物'] } } });
    expect(loadPreset()?.name).toBe('我的预设');
  });

  it('存储里是坏数据时当作没有，而不是让识别整个失效', () => {
    globalVars['bara_dashboard_preset'] = { modules: 'not an object' };
    expect(loadPreset()).toBeNull();

    serve({ sheet_characters: { name: '角色表', content: [['row_id', '姓名']] } });
    expect(resolveSheets(CHARACTERS)).toHaveLength(1);
  });

  it('解析失败时如实返回问题，不静默吞掉', () => {
    const r = importPreset({ modules: {} });
    expect(r.ok).toBe(false);
    expect(r.problems.length).toBeGreaterThan(0);
  });
});
