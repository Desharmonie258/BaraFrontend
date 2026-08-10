/**
 * 手改单元格。锁三件事：
 *
 * 1. **写入前的把关**：只读运行时、表不存在、改表头 —— 都要在打库之前挡住，
 *    并且给出的话要能照着做。
 * 2. **审核基线跟着走**：手改不该出现在「AI 这轮改了什么」里，
 *    而且同步基线不能顺手把 AI 的未审改动一起吞掉。
 * 3. **没建基线时不算失败**：多数用户从不开审核页，不能给他们报一句莫名其妙的提示。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { invalidate } from '../src/BaraFrontend/data/snapshot-repo';
import { writeCell, canEdit } from '../src/BaraFrontend/data/repositories/cell-editor';
import { loadBaseline, captureBaseline } from '../src/BaraFrontend/data/repositories/review-repo';

(globalThis as any).window = globalThis;

const HEAD = ['row_id', '姓名', '所在地点'];

/** 记录落到 API 上的写入调用，用来断言「确实没打库」 */
let writes: Array<[string, number, string, unknown]> = [];
/** 酒馆 chat 变量的替身 */
let chatVars: Record<string, unknown> = {};

function serve(options: { writable?: boolean; accept?: boolean } = {}) {
  const { writable = true, accept = true } = options;
  const data = {
    sheet_npc: {
      name: 'NPC表',
      sourceData: { ddl: '' },
      content: [HEAD, ['1', '御苑', '橡木镇'], ['2', '新宿', '东京都']],
    },
  };
  const api: Record<string, unknown> = { getCurrentData: () => data };
  if (writable) {
    api.updateCell = (table: string, row: number, col: string, value: unknown) => {
      writes.push([table, row, col, value]);
      if (!accept) return false;
      // 写成功后本体会更新自己的数据，快照重读时应看到新值
      const target = data.sheet_npc.content[row];
      const at = HEAD.indexOf(col);
      if (target && at >= 0) target[at] = String(value);
      return true;
    };
    api.insertRow = () => 1;
    api.deleteRow = () => true;
  }
  (globalThis as any).AutoCardUpdaterAPI = api;
  invalidate();
}

beforeEach(() => {
  writes = [];
  chatVars = {};
  delete (globalThis as any).AutoCardUpdaterAPI;
  invalidate();

  /*
   * 酒馆变量必然经过 JSON 往返，替身也必须 —— 直接存对象引用的话，
   * 基线与当前数据会是同一份，改一个就同时改了另一个，
   * 「基线停在旧状态」这件被测的事根本不成立。
   */
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  (globalThis as any).getVariables = () => clone(chatVars);
  (globalThis as any).replaceVariables = (fn: (v: Record<string, unknown>) => unknown) => {
    chatVars = clone(fn(clone(chatVars)));
  };
  (globalThis as any).getChatId = () => 'chat-1';
});

describe('写入前的把关', () => {
  it('运行时没有写接口时不可编辑，也不打库', async () => {
    serve({ writable: false });
    expect(canEdit()).toBe(false);
    const r = await writeCell({ sheetName: 'NPC表', rowIndex: 1, column: '所在地点' }, '新宿');
    expect(r.ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it('表不存在时说清是模板问题，不打库', async () => {
    serve();
    const r = await writeCell({ sheetName: '不存在的表', rowIndex: 1, column: '姓名' }, 'x');
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.message).toContain('模板');
    expect(writes).toEqual([]);
  });

  it('拒绝改表头 —— 列名是所有识别逻辑的依据', async () => {
    serve();
    const r = await writeCell({ sheetName: 'NPC表', rowIndex: 0, column: '姓名' }, '名字');
    expect(r.ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it('本体拒绝写入时如实返回失败', async () => {
    serve({ accept: false });
    const r = await writeCell({ sheetName: 'NPC表', rowIndex: 1, column: '所在地点' }, '新宿');
    expect(r.ok).toBe(false);
    expect(writes).toHaveLength(1);
  });
});

describe('写入成功', () => {
  it('按表展示名定位并写到正确的行列', async () => {
    serve();
    const r = await writeCell({ sheetName: 'NPC表', rowIndex: 1, column: '所在地点' }, '新宿');
    expect(r).toEqual({ ok: true, baselineStale: false });
    expect(writes).toEqual([['NPC表', 1, '所在地点', '新宿']]);
  });

  it('没有基线时不报「基线跟不上」—— 多数用户从不开审核页', async () => {
    serve();
    const r = await writeCell({ sheetName: 'NPC表', rowIndex: 1, column: '姓名' }, '御苑二世');
    expect(r).toEqual({ ok: true, baselineStale: false });
    expect(loadBaseline()).toBeNull();
  });
});

describe('审核基线', () => {
  it('手改同步进基线，因此不会被报成 AI 的改动', async () => {
    serve();
    captureBaseline();
    await writeCell({ sheetName: 'NPC表', rowIndex: 1, column: '所在地点' }, '新宿');

    const baseline = loadBaseline();
    expect(baseline?.data.sheet_npc.content[1][2]).toBe('新宿');
  });

  it('只补手改的那一格，AI 的未审改动仍留在基线之外', async () => {
    serve();
    captureBaseline();

    // AI 改了另一行（直接改数据源，模拟本体被外部写入）
    const api = (globalThis as any).AutoCardUpdaterAPI;
    const data = api.getCurrentData();
    data.sheet_npc.content[2][2] = '涩谷';
    invalidate();

    await writeCell({ sheetName: 'NPC表', rowIndex: 1, column: '所在地点' }, '新宿');

    const baseline = loadBaseline();
    // 手改的格子跟上了
    expect(baseline?.data.sheet_npc.content[1][2]).toBe('新宿');
    // AI 改的那一格在基线里仍是旧值 —— 审核页还能报出来
    expect(baseline?.data.sheet_npc.content[2][2]).toBe('东京都');
  });

  it('基线里没有这一列时不硬补，但写入本身仍算成功', async () => {
    serve();
    captureBaseline();
    // 基线建立后模板加了一列
    const baseline = chatVars['bara_review_baseline'] as any;
    baseline.data.sheet_npc.content = [['row_id', '姓名'], ['1', '御苑'], ['2', '新宿']];

    const r = await writeCell({ sheetName: 'NPC表', rowIndex: 1, column: '所在地点' }, '新宿');
    expect(r).toEqual({ ok: true, baselineStale: true });
  });
});
