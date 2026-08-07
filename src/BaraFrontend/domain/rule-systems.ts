/**
 * 规则族（开发文档 §5.4）。
 *
 * 三族的 id 沿用文档既有命名（`d20` / `brp` / `d10`），不另起一套 ——
 * 属性预设的 `ruleFamily` 字段用的就是这三个值，改名会让已有预设失配。
 *
 * ## 关于标识与合规（§1.3）
 *
 * 本文件只登记**标识与展示名**，不含任何出版方的规则数值、专有名词或
 * 表格内容。三族在机制上都是 §5.4.2 的中性参数化实现，具体数值由用户
 * 在预设里自己填。
 *
 * `d10` 族展示 Dark Pack 标识，因此按协议必须**固定展示出处声明**，
 * 不提供关闭开关（文档明确列为硬要求）。声明措辞照抄协议原文，
 * 不自行改写 —— 用词是协议的一部分。
 */

import { BRP_COPYRIGHT_NOTICE, BRP_OGC_DECLARATION, BRP_LICENSE_TEXT } from './brp-license';

export type RuleFamily = 'd20' | 'brp' | 'd10';

export interface RuleSystem {
  id: RuleFamily;
  /** 展示名，双语 */
  name: { 'zh-CN': string; 'en-US': string };
  /** 骰式简写，图标加载失败时作为兜底标识 */
  dice: string;
  /** 标识图。远程地址，加载失败时回落到 dice 文本 */
  logo: string;
  /** 标识的替代文本 */
  logoAlt: string;
  /**
   * 必须随该族展示的出处声明。为 null 表示无此要求。
   *
   * **恒为英文，且不参与 i18n。** Dark Pack 协议只有英文版，声明措辞
   * 是协议的一部分；译成中文就不再是协议要求的原文。因此这里是裸字符串
   * 而非消息键 —— 消息键会让它跟着界面语言变。
   *
   * 有值时**不可由用户关闭**。
   */
  notice: string | null;
  /** 声明中引用的链接 */
  noticeUrl: string | null;
  /**
   * 需要随作品附上的完整许可证全文。为 null 表示无此要求。
   *
   * BRP OGL §3 明确要求 "affix a complete copy of this License" ——
   * 一条简短声明不满足要求，外链也不算 affix。
   */
  licenseText: string | null;
  /** §9 要求的 Open Game Content 范围说明 */
  ogcDeclaration: string | null;
}

export const RULE_SYSTEMS: readonly RuleSystem[] = [
  {
    id: 'd20',
    name: { 'zh-CN': 'SRD 5.2.1', 'en-US': 'SRD 5.2.1' },
    dice: 'd20',
    logo: 'https://files.catbox.moe/3rpmtz.png',
    logoAlt: 'SRD 5.2.1',
    /*
     * SRD 5.2.1 以 CC-BY-4.0 发布，署名是许可条件而非可选礼节。
     * 措辞取自 Wizards 指定的 attribution 文本，逐字照抄。
     */
    notice:
      'This work includes material from the System Reference Document 5.2.1 ' +
      '("SRD 5.2.1") by Wizards of the Coast LLC, available at ' +
      'https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the ' +
      'Creative Commons Attribution 4.0 International License, available at ' +
      'https://creativecommons.org/licenses/by/4.0/legalcode.',
    noticeUrl: 'https://creativecommons.org/licenses/by/4.0/legalcode',
    licenseText: null,
    ogcDeclaration: null,
  },
  {
    id: 'brp',
    name: { 'zh-CN': 'BRP SRD 1.0', 'en-US': 'BRP SRD 1.0' },
    dice: 'd100',
    logo: 'https://files.catbox.moe/bxt4m0.png',
    logoAlt: 'Basic Roleplaying',
    // §7 的法定版权声明，逐字原文。四段合并为一段展示。
    notice: BRP_COPYRIGHT_NOTICE.join('\n'),
    noticeUrl: 'https://brp.chaosium.com/',
    licenseText: BRP_LICENSE_TEXT,
    ogcDeclaration: BRP_OGC_DECLARATION,
  },
  {
    id: 'd10',
    name: { 'zh-CN': '说书人', 'en-US': 'Storyteller' },
    dice: 'd10',
    logo: 'https://images.ctfassets.net/u73tyf0fa8v1/3oBTHBZk9XmfcBlUPylvFh/673e4a6b14566548c03424ddf627b944/darkpack_logo2.png',
    logoAlt: 'Dark Pack',
    // Dark Pack 协议要求的标准措辞。改动前请核对协议页面的当前原文。
    notice:
      'Portions of the materials are the copyrights and trademarks of ' +
      'Paradox Interactive AB, and are used with permission. All rights reserved. ' +
      'For more information please visit worldofdarkness.com.',
    noticeUrl: 'https://www.worldofdarkness.com/dark-pack',
    licenseText: null,
    ogcDeclaration: null,
  },
] as const;

export const DEFAULT_RULE_SYSTEM: RuleFamily = 'brp';

export function getRuleSystem(id: string): RuleSystem {
  return RULE_SYSTEMS.find((r) => r.id === id) ?? RULE_SYSTEMS.find((r) => r.id === DEFAULT_RULE_SYSTEM)!;
}

export function isRuleFamily(v: unknown): v is RuleFamily {
  return RULE_SYSTEMS.some((r) => r.id === v);
}
