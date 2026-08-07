import { describe, it, expect } from 'vitest';
import {
  RULE_SYSTEMS,
  getRuleSystem,
  isRuleFamily,
  DEFAULT_RULE_SYSTEM,
} from '../src/BaraFrontend/domain/rule-systems';

describe('规则族登记', () => {
  it('三族齐全，id 与开发文档 §5.4 一致', () => {
    expect(RULE_SYSTEMS.map((r) => r.id)).toEqual(['d20', 'brp', 'd10']);
  });

  it('每族都有骰式兜底 —— 标识加载不出来时靠它辨认', () => {
    for (const r of RULE_SYSTEMS) {
      expect(r.dice, r.id).toBeTruthy();
      expect(r.logoAlt, r.id).toBeTruthy();
    }
  });

  it('双语展示名都不为空', () => {
    for (const r of RULE_SYSTEMS) {
      expect(r.name['zh-CN'], r.id).toBeTruthy();
      expect(r.name['en-US'], r.id).toBeTruthy();
    }
  });

  it('带声明的族必须同时给出链接 —— 协议要求可追溯', () => {
    for (const r of RULE_SYSTEMS) {
      if (r.notice) expect(r.noticeUrl, r.id).toBeTruthy();
    }
  });

  it('声明恒为英文 —— 协议只有英文版，译文不再是协议原文', () => {
    for (const r of RULE_SYSTEMS) {
      if (!r.notice) continue;
      expect(r.notice, `${r.id} 的声明混入了非英文字符`).not.toMatch(
        /[一-鿿぀-ヿ]/,
      );
    }
  });

  it('声明是裸字符串而非消息键 —— 消息键会跟着界面语言变', () => {
    for (const r of RULE_SYSTEMS) {
      if (!r.notice) continue;
      // 消息键形如 'settings.xxx'：无空格、全小写点分
      expect(r.notice, r.id).toContain(' ');
    }
  });

  it('三族都带署名声明 —— 三份来源各自都有署名要求', () => {
    for (const r of RULE_SYSTEMS) {
      expect(r.notice, `${r.id} 缺少署名声明`).toBeTruthy();
    }
  });

  it('d20 族携带 SRD 5.2.1 的 CC-BY 署名', () => {
    const d20 = getRuleSystem('d20');
    expect(d20.notice).toContain('SRD 5.2.1');
    expect(d20.notice).toContain('Wizards of the Coast');
    expect(d20.notice).toContain('Creative Commons Attribution 4.0');
  });

  it('brp 族携带 §7 版权声明、§9 范围说明与许可证全文', () => {
    const brp = getRuleSystem('brp');
    // §7 逐字原文的四段
    expect(brp.notice).toContain('This work created using the BRP Open Game License.');
    expect(brp.notice).toContain('BRP Open Game License v 1.0 © copyright 2020 Chaosium Inc.');
    expect(brp.notice).toContain('Basic Roleplaying © copyright 1980–2020 Chaosium Inc.');
    expect(brp.notice).toContain('Used with permission.');
    // §9 必须指明哪些部分是 OGC
    expect(brp.ogcDeclaration).toContain('Open Game Content');
    // §3 要求附上完整副本，外链不算 affix
    expect(brp.licenseText).toContain('BRP Open Game License, Version 1.0');
    expect(brp.licenseText).toContain('17. Governing Law and Venue');
  });

  it('许可证全文内嵌而非外链 —— §3 的 affix 要求副本随作品存在', () => {
    const brp = getRuleSystem('brp');
    // 全文应覆盖 1-17 全部条款
    for (const n of Array.from({ length: 17 }, (_, i) => i + 1)) {
      expect(brp.licenseText, `缺少第 ${n} 条`).toMatch(new RegExp(`\n${n}[.] `));
    }
  });

  it('d10 族携带 Dark Pack 声明', () => {
    const d10 = getRuleSystem('d10');
    expect(d10.notice).toContain('Paradox Interactive');
    expect(d10.noticeUrl).toContain('worldofdarkness.com');
  });

  it('未知 id 回落到默认族而非抛错', () => {
    expect(getRuleSystem('不存在').id).toBe(DEFAULT_RULE_SYSTEM);
    expect(getRuleSystem('').id).toBe(DEFAULT_RULE_SYSTEM);
  });

  it('类型守卫只认三个合法值', () => {
    expect(isRuleFamily('d20')).toBe(true);
    expect(isRuleFamily('brp')).toBe(true);
    expect(isRuleFamily('d10')).toBe(true);
    expect(isRuleFamily('d6')).toBe(false);
    expect(isRuleFamily(undefined)).toBe(false);
  });
});
