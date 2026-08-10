/**
 * 兼容指南与代码的一致性。
 *
 * `doc/数据库模板兼容指南.md` 告诉模板作者「叫这个名字就能被认出来」。
 * 那份清单一旦与代码漂移，作者会照着文档改完模板，然后发现没有用 ——
 * 而这类错不会报任何异常，只表现为「某块功能没出现」。
 *
 * 所以：**识别相关的每一个名字、每一条指纹、每一个关键词，都必须在
 * 文档里出现。** 加一个新候选名却忘了写进文档，这里会失败。
 *
 * 反向不查（文档里多写几个同义词无害），只查代码里有的文档必须有。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHARACTERS, PROTAGONIST, SUGGESTIONS, ITEMS, EQUIPMENT, RESOURCES, GLOBAL, RELATIONS,
  type SheetSpec,
} from '../src/BaraFrontend/domain/sheet-binding';
import { SECTIONS, BIO_GROUPS } from '../src/BaraFrontend/domain/sheet-sections';
import { DEFAULT_RESOURCES } from '../src/BaraFrontend/domain/resources';
import {
  SECTIONS as INTERACTION_SECTIONS, isAttachmentSheet, ACTION_PRESET_FORMAT,
} from '../src/BaraFrontend/domain/interaction-rules';
import { PRESET_FORMAT } from '../src/BaraFrontend/domain/dashboard-preset';

const DOC = resolve(__dirname, '../doc/数据库模板兼容指南.md');
const text = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '';

/** 文档里提到了这个词吗 */
function mentions(needle: string): boolean {
  return text.includes(needle);
}

it('兼容指南存在', () => {
  expect(text.length).toBeGreaterThan(0);
});

describe('表名候选与指纹', () => {
  const specs: Array<[string, SheetSpec]> = [
    ['角色表', CHARACTERS],
    ['主角表', PROTAGONIST],
    ['检定建议表', SUGGESTIONS],
    ['物品表', ITEMS],
    ['装备表', EQUIPMENT],
    ['角色资源表', RESOURCES],
    ['全局数据表', GLOBAL],
    ['关系表', RELATIONS],
  ];

  it.each(specs)('%s 的每个展示名候选都写进了文档', (_label, spec) => {
    for (const name of spec.names) {
      expect(mentions(name), name).toBe(true);
    }
  });

  it.each(specs)('%s 的每一条指纹列都写进了文档', (_label, spec) => {
    for (const col of spec.fingerprint ?? []) {
      expect(mentions(col), col).toBe(true);
    }
  });
});

describe('角色卡分区', () => {
  it('每个分区的表名与关联列都写进了文档', () => {
    for (const s of SECTIONS) {
      for (const name of s.sheets) expect(mentions(name), name).toBe(true);
      for (const col of s.ownerColumns) expect(mentions(col), col).toBe(true);
    }
  });

  it('人物小传的每一个列名都写进了文档 —— 不在清单里的列不会显示', () => {
    for (const g of BIO_GROUPS) {
      for (const col of g.columns) expect(mentions(col), `${g.id}/${col}`).toBe(true);
    }
  });

  it('四条默认资源的 ID 与显示名都写进了文档', () => {
    for (const r of DEFAULT_RESOURCES) {
      expect(mentions(r.id), r.id).toBe(true);
      expect(mentions(r.displayName), r.displayName).toBe(true);
    }
  });
});

describe('交互总览', () => {
  it('每个分区的每个关键词都写进了文档', () => {
    for (const s of INTERACTION_SECTIONS) {
      for (const k of s.keywords) expect(mentions(k), `${s.kind}/${k}`).toBe(true);
    }
  });

  /*
   * 附表关键词没有导出（它只是 isAttachmentSheet 的内部实现），
   * 因此反过来测：文档里列出的每个词，都得真的被判为附表。
   * 文档少写一个词不会被抓到，但写错一个会 —— 而写错的危害更大：
   * 作者会照着改表名，然后发现没有用。
   */
  it('文档里列出的附表关键词确实生效', () => {
    const listed = ['资源', '属性', '生理', '心理', '临场', '记忆', '关系',
      '日记', '日志', '记录', '实录', '大事记', '纪要', '小传'];
    for (const k of listed) {
      expect(mentions(k), `文档未列出 ${k}`).toBe(true);
      expect(isAttachmentSheet(`测试${k}表`), k).toBe(true);
    }
  });
});

describe('预设格式', () => {
  it('两种预设的 format 字符串都写进了文档', () => {
    expect(mentions(PRESET_FORMAT)).toBe(true);
    expect(mentions(ACTION_PRESET_FORMAT)).toBe(true);
  });
});
