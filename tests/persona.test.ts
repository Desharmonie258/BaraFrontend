/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isUserPlaceholder,
  getPersonaName,
  getDisplayPlayerName,
  resolveUserName,
  replaceUserPlaceholders,
} from '../src/BaraFrontend/data/persona';
import { invalidate } from '../src/BaraFrontend/data/snapshot-repo';

function clearAll(): void {
  for (const k of ['getCurrentPersonaName', 'TavernHelper', 'SillyTavern', 'name1',
                   'AutoCardUpdaterAPI']) {
    delete (window as any)[k];
  }
  document.body.innerHTML = '';
  invalidate();
}

function mockProtagonistSheet(name: string): void {
  (window as any).AutoCardUpdaterAPI = {
    getCurrentData: () => ({
      sheet_first: {
        name: '主角信息',
        sourceData: { ddl: '' },
        content: [['row_id', '姓名'], ['1', name]],
      },
    }),
  };
  invalidate();
}

beforeEach(clearAll);

describe('占位符识别', () => {
  it('认得大小写与空格变体', () => {
    for (const v of ['{{user}}', '{{User}}', '{{ USER }}', '<user>', '< User >', '{{用户}}']) {
      expect(isUserPlaceholder(v), v).toBe(true);
    }
  });

  it('真名不会被误判', () => {
    for (const v of ['武田信介', 'user', '{{char}}', '']) {
      expect(isUserPlaceholder(v), v).toBe(false);
    }
  });
});

describe('persona 名的多级回退', () => {
  it('优先用助手的 getCurrentPersonaName', () => {
    (window as any).getCurrentPersonaName = () => '武田信介';
    (window as any).name1 = '不该用这个';
    expect(getPersonaName()).toBe('武田信介');
  });

  it('助手接口缺失时回退到 SillyTavern 上下文的 name1', () => {
    (window as any).SillyTavern = { getContext: () => ({ name1: '上下文名' }) };
    expect(getPersonaName()).toBe('上下文名');
  });

  it('再回退到全局 name1', () => {
    (window as any).name1 = '全局名';
    expect(getPersonaName()).toBe('全局名');
  });

  it('最后从 DOM 的 persona 输入框读', () => {
    const input = document.createElement('input');
    input.id = 'persona_name_input';
    input.value = 'DOM 名';
    document.body.appendChild(input);
    expect(getPersonaName()).toBe('DOM 名');
  });

  it('接口抛错时不冒泡，继续走后续回退', () => {
    (window as any).getCurrentPersonaName = () => {
      throw new Error('boom');
    };
    (window as any).name1 = '兜底名';
    expect(getPersonaName()).toBe('兜底名');
  });

  it('persona 名本身是占位符时视为没取到', () => {
    (window as any).getCurrentPersonaName = () => '{{user}}';
    expect(getPersonaName()).toBeNull();
  });

  it('全部缺失返回 null', () => {
    expect(getPersonaName()).toBeNull();
  });
});

describe('显示名的三级回退', () => {
  it('persona 优先于主角信息表', () => {
    (window as any).getCurrentPersonaName = () => 'Persona 名';
    mockProtagonistSheet('表里的名');
    expect(getDisplayPlayerName()).toBe('Persona 名');
  });

  it('没有 persona 时用主角信息表的姓名', () => {
    mockProtagonistSheet('武田信介');
    expect(getDisplayPlayerName()).toBe('武田信介');
  });

  it('表里也是占位符时落到兜底文案', () => {
    mockProtagonistSheet('{{user}}');
    expect(getDisplayPlayerName()).toBe('主角');
  });

  it('什么都没有时恒有值，不返回空', () => {
    expect(getDisplayPlayerName()).toBe('主角');
  });
});

describe('替换策略', () => {
  it('句中占位符逐个替换 —— 展示文本不是纯名字', () => {
    (window as any).getCurrentPersonaName = () => '武田信介';
    expect(replaceUserPlaceholders('{{user}} 检查行装，确认护甲刀斧状态')).toBe(
      '武田信介 检查行装，确认护甲刀斧状态',
    );
  });

  it('一句里多个占位符全部替换', () => {
    (window as any).getCurrentPersonaName = () => '甲';
    expect(replaceUserPlaceholders('{{user}} 与 <user> 交谈')).toBe('甲 与 甲 交谈');
  });

  it('取不到 persona 也要替换成兜底 —— 显示裸占位符最糟', () => {
    expect(replaceUserPlaceholders('{{user}} 检查行装')).toBe('主角 检查行装');
  });

  it('没有占位符的文本原样返回', () => {
    (window as any).getCurrentPersonaName = () => '甲';
    const s = '艾莉丝 向祖父辞行';
    expect(replaceUserPlaceholders(s)).toBe(s);
  });

  it('已写真名的字段不被改写 —— 换 persona 不该改动历史数据', () => {
    (window as any).getCurrentPersonaName = () => '新名';
    expect(resolveUserName('旧名')).toBe('旧名');
  });

  it('字段为占位符或空时才解析', () => {
    (window as any).getCurrentPersonaName = () => '新名';
    expect(resolveUserName('{{user}}')).toBe('新名');
    expect(resolveUserName('')).toBe('新名');
  });
});
