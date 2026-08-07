/**
 * @vitest-environment jsdom
 *
 * 本文件需要 DOM：发送链的兜底路径要操作酒馆的输入框与发送按钮，
 * 建议仓储则通过挂在 window 上的插件 API 取快照。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readSuggestions, hasSuggestionSheet } from '../src/BaraFrontend/data/repositories/suggestion-repo';
import { invalidate } from '../src/BaraFrontend/data/snapshot-repo';

const HEADERS = ['row_id', '建议类型', '发起者', '展示文本', '骰子命令'];

function mockSheet(rows: string[][], name = '检定建议表', headers = HEADERS) {
  (window as any).AutoCardUpdaterAPI = {
    getCurrentData: () => ({
      sheet_check_suggestions: { name, content: [headers, ...rows], sourceData: { ddl: '' } },
    }),
  };
  invalidate();
}

beforeEach(() => {
  delete (window as any).AutoCardUpdaterAPI;
  invalidate();
});

describe('检定建议仓储', () => {
  it('读出全部槽位并保留类型与发起者', () => {
    mockSheet([
      ['1', '主角', '', '撬锁进入库房', '1d100 敏捷'],
      ['4', '角色', '艾莉丝', '掩护你', '1d100 感知'],
      ['6', '快进', '', '直接前往下一处', '无'],
    ]);
    const list = readSuggestions();
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ slot: 1, kind: '主角', displayText: '撬锁进入库房' });
    expect(list[1]).toMatchObject({ slot: 4, kind: '角色', actor: '艾莉丝' });
  });

  it("快进类的占位命令 '无' 归一为空，不应被当成真命令发出", () => {
    mockSheet([['6', '快进', '', '推进剧情', '无']]);
    expect(readSuggestions()[0].diceCommand).toBe('');
  });

  it('按槽位排序 —— 顺序携带语义，不依赖数据行的物理顺序', () => {
    mockSheet([
      ['6', '快进', '', 'F', '无'],
      ['2', '主角', '', 'B', '1d100'],
      ['4', '角色', '甲', 'D', '1d100'],
    ]);
    expect(readSuggestions().map((s) => s.slot)).toEqual([2, 4, 6]);
  });

  it('展示文本为空的槽位整条丢弃', () => {
    mockSheet([
      ['1', '主角', '', '有内容', '1d100'],
      ['2', '主角', '', '   ', '1d100'],
      ['3', '主角', '', '', ''],
    ]);
    expect(readSuggestions()).toHaveLength(1);
  });

  it('列改名后靠包含匹配仍能读出', () => {
    mockSheet(
      [['1', '主角', '', '行动一', '1d100']],
      '检定建议表',
      ['row_id', '类型说明', '发起角色', '展示的文本', '骰子命令串'],
    );
    const s = readSuggestions()[0];
    expect(s.kind).toBe('主角');
    expect(s.displayText).toBe('行动一');
  });

  it('表不存在时返回空数组而非抛错 —— 模板可能还没导入', () => {
    expect(readSuggestions()).toEqual([]);
    expect(hasSuggestionSheet()).toBe(false);
  });

  it('row_id 缺失时退化为出现顺序', () => {
    mockSheet([
      ['', '主角', '', 'A', '1d100'],
      ['', '主角', '', 'B', '1d100'],
    ]);
    expect(readSuggestions().map((s) => s.slot)).toEqual([1, 2]);
  });
});
