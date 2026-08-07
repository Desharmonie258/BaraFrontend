import { describe, it, expect } from 'vitest';
import { isEnumEditable, hasEditableEnums } from '../src/BaraFrontend/domain/enum-policy';

describe('枚举可编辑策略', () => {
  describe('默认挡位', () => {
    it('放行 NPC 表的归档状态 —— 这是玩家的决定，晋升流程的触发点', () => {
      expect(isEnumEditable('NPC表', '归档状态', 'default')).toBe(true);
    });

    it('不放行同表的其他枚举列', () => {
      expect(isEnumEditable('NPC表', '性别', 'default')).toBe(false);
      expect(isEnumEditable('NPC表', '在场状态', 'default')).toBe(false);
    });

    it('不放行其他表 —— 天气、状态等是 AI 依剧情写的', () => {
      expect(isEnumEditable('小事历表', '天气', 'default')).toBe(false);
      expect(isEnumEditable('小事历表', '状态', 'default')).toBe(false);
      expect(isEnumEditable('追踪角色表', '角色定位', 'default')).toBe(false);
      expect(isEnumEditable('检定建议表', '建议类型', 'default')).toBe(false);
    });

    it('同名列在别的表里也不放行 —— 规则按表+列成对匹配', () => {
      expect(isEnumEditable('追踪角色表', '归档状态', 'default')).toBe(false);
    });

    it('模板改过表名时靠候选名兜底', () => {
      expect(isEnumEditable('NPC 表', '归档状态', 'default')).toBe(true);
      expect(isEnumEditable('普通角色表', '归档状态', 'default')).toBe(true);
    });
  });

  describe('调试挡位', () => {
    it('放开全部枚举列', () => {
      expect(isEnumEditable('小事历表', '天气', 'debug')).toBe(true);
      expect(isEnumEditable('任意表', '任意列', 'debug')).toBe(true);
    });
  });

  describe('整表判定', () => {
    it('默认挡位下只有 NPC 表有可编辑枚举', () => {
      expect(hasEditableEnums('NPC表', 'default')).toBe(true);
      expect(hasEditableEnums('小事历表', 'default')).toBe(false);
    });

    it('调试挡位下所有表都有', () => {
      expect(hasEditableEnums('小事历表', 'debug')).toBe(true);
    });
  });
});
