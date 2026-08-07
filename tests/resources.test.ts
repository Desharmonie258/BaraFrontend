import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RESOURCES,
  resourceRank,
  isDefaultResource,
} from '../src/BaraFrontend/domain/resources';

describe('默认资源', () => {
  it('四条默认资源齐全且顺序固定', () => {
    expect(DEFAULT_RESOURCES.map((r) => r.id)).toEqual([
      'hp', 'stamina', 'satiety', 'libido',
    ]);
    expect(DEFAULT_RESOURCES.map((r) => r.displayName)).toEqual([
      '生命值', '耐力值', '饱腹度', '性欲值',
    ]);
  });

  it('按 ID 与按显示名都能命中 —— AI 偶尔只填其中一个', () => {
    expect(resourceRank('hp')).toBe(0);
    expect(resourceRank('生命值')).toBe(0);
    expect(resourceRank('libido')).toBe(3);
    expect(isDefaultResource('耐力值')).toBe(true);
  });

  it('扩展资源排在默认资源之后', () => {
    for (const id of ['mp', 'qi', 'rage', 'arcana', 'humanity', 'willpower', 'soulfury']) {
      expect(resourceRank(id), id).toBeGreaterThan(resourceRank('libido'));
      expect(isDefaultResource(id), id).toBe(false);
    }
  });

  it('排序后默认资源在前，扩展资源保持原有相对顺序', () => {
    const rows = ['qi', 'libido', 'mp', 'hp', 'stamina'];
    const sorted = [...rows].sort((a, b) => resourceRank(a) - resourceRank(b));
    expect(sorted).toEqual(['hp', 'stamina', 'libido', 'qi', 'mp']);
  });

  it('两侧空白容忍', () => {
    expect(resourceRank('  hp  ')).toBe(0);
  });
});
