/**
 * 物资清单的读与行级操作。
 *
 * 行级操作比改格子难在**行号会动**：删掉一行，它后面每一行的行号都往前挪。
 * 审核基线不跟着挪的话，diff 会把后面所有行报成「改了」——
 * 一次删除变成满屏假变更。这里主要锁这件事。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { invalidate } from '../src/BaraFrontend/data/snapshot-repo';
import {
  readSupplies, addSupply, removeSupply, setSupplyCell,
} from '../src/BaraFrontend/data/repositories/supply-repo';
import { captureBaseline, loadBaseline } from '../src/BaraFrontend/data/repositories/review-repo';

(globalThis as any).window = globalThis;

const ITEM_HEAD = ['row_id', '物品名称', '持有人', '类型', '数量', '品质', '描述'];

let data: Record<string, any>;
let chatVars: Record<string, unknown>;

function serve(rows: string[][] = [['1', '绳索', '御苑', '工具', '1', '普通', '']]) {
  data = {
    sheet_inventory: {
      name: '物品表',
      sourceData: { ddl: '' },
      content: [ITEM_HEAD, ...rows],
    },
  };
  (globalThis as any).AutoCardUpdaterAPI = {
    getCurrentData: () => data,
    updateCell: (table: string, row: number, col: string, value: string) => {
      const sheet = Object.values(data).find((s: any) => s.name === table) as any;
      const at = sheet.content[0].indexOf(col);
      if (at < 0) return false;
      sheet.content[row][at] = value;
      return true;
    },
    insertRow: (table: string, values: Record<string, string>) => {
      const sheet = Object.values(data).find((s: any) => s.name === table) as any;
      sheet.content.push(sheet.content[0].map((h: string) => values[h] ?? ''));
      return sheet.content.length - 1;
    },
    deleteRow: (table: string, row: number) => {
      const sheet = Object.values(data).find((s: any) => s.name === table) as any;
      if (row <= 0 || row >= sheet.content.length) return false;
      sheet.content.splice(row, 1);
      return true;
    },
  };
  invalidate();
}

beforeEach(() => {
  chatVars = {};
  delete (globalThis as any).AutoCardUpdaterAPI;
  invalidate();

  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  (globalThis as any).getVariables = () => clone(chatVars);
  (globalThis as any).replaceVariables = (fn: (v: Record<string, unknown>) => unknown) => {
    chatVars = clone(fn(clone(chatVars))) as Record<string, unknown>;
  };
  (globalThis as any).getChatId = () => 'chat-1';
  serve();
});

describe('读取', () => {
  it('名称列取第一个非 row_id 列，其余列按表头顺序展开', () => {
    const list = readSupplies('items');
    expect(list.available).toBe(true);
    expect(list.nameColumn).toBe('物品名称');
    expect(list.columns).toEqual(['持有人', '类型', '数量', '品质', '描述']);
    expect(list.rows[0]).toMatchObject({ rowIndex: 1, name: '绳索' });
    expect(list.rows[0].cells['持有人']).toBe('御苑');
  });

  it('表不存在时整块不可用，而不是给一个空列表', () => {
    delete data.sheet_inventory;
    invalidate();
    expect(readSupplies('items')).toMatchObject({ available: false, rows: [] });
  });

  it('空值列也保留 —— 编辑时要能给它填上', () => {
    const list = readSupplies('items');
    expect(list.rows[0].cells).toHaveProperty('描述', '');
  });
});

describe('加行', () => {
  it('只要一个名字，其余列留空', async () => {
    const r = await addSupply(readSupplies('items'), '火把');
    expect(r.ok).toBe(true);
    expect(data.sheet_inventory.content[2]).toEqual(['', '火把', '', '', '', '', '']);
  });

  it('名字为空时不写 —— 落库后会变成一条点不着的空白行', async () => {
    const r = await addSupply(readSupplies('items'), '   ');
    expect(r.ok).toBe(false);
    expect(data.sheet_inventory.content).toHaveLength(2);
  });

  it('新增的行同步进基线，不会被报成 AI 新增的', async () => {
    captureBaseline();
    await addSupply(readSupplies('items'), '火把');
    const baseline = loadBaseline();
    expect(baseline?.data.sheet_inventory.content).toHaveLength(3);
    expect(baseline?.data.sheet_inventory.content[2][1]).toBe('火把');
  });
});

describe('删行', () => {
  beforeEach(() => {
    serve([
      ['1', '绳索', '御苑', '工具', '1', '普通', ''],
      ['2', '火把', '御苑', '工具', '3', '普通', ''],
      ['3', '干粮', '御苑', '消耗品', '5', '普通', ''],
    ]);
  });

  it('删掉指定行，后面的行跟着前移', async () => {
    await removeSupply(readSupplies('items'), 2);
    const names = readSupplies('items').rows.map((r) => r.name);
    expect(names).toEqual(['绳索', '干粮']);
  });

  it('基线跟着删 —— 不删的话后面每一行都会被报成改了', async () => {
    captureBaseline();
    await removeSupply(readSupplies('items'), 2);

    const baseline = loadBaseline();
    const rows = baseline?.data.sheet_inventory.content ?? [];
    // 表头 + 两行
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe('绳索');
    expect(rows[2][1]).toBe('干粮');
  });

  it('拒绝删表头', async () => {
    const r = await removeSupply(readSupplies('items'), 0);
    expect(r.ok).toBe(false);
    expect(data.sheet_inventory.content).toHaveLength(4);
  });
});

describe('改字段', () => {
  it('写到正确的行列并同步基线', async () => {
    captureBaseline();
    await setSupplyCell(readSupplies('items'), 1, '数量', '4');

    expect(readSupplies('items').rows[0].cells['数量']).toBe('4');
    expect(loadBaseline()?.data.sheet_inventory.content[1][4]).toBe('4');
  });
});
