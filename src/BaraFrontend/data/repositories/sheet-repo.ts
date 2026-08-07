/**
 * 角色卡仓储 —— 把散在十余张表里的行按角色聚合起来。
 *
 * 关联规则全部来自 domain/sheet-sections，本文件只负责执行：
 * 找表、找列、按角色名匹配、整理成 ViewModel。模板改了关联方式时
 * 改那份配置即可，不需要动这里。
 *
 * 读走快照（见 snapshot-repo），不走 SQL。
 */
import { findSheetByName, cell, type SheetSnapshot } from '../snapshot-repo';
import { SECTIONS, BIO_GROUPS, type SectionSpec, type SheetTab } from '../../domain/sheet-sections';
import { resourceRank } from '../../domain/resources';
import type { CharacterVM } from './character-repo';
import { replaceUserPlaceholders } from '../persona';

export interface SectionRow {
  /** 数据库行号：0 为表头，1 为第一行数据 */
  rowIndex: number;
  /** 列展示名 → 值。已剔除 row_id 与用于匹配的列。 */
  cells: Record<string, string>;
}

export interface Section {
  id: string;
  tab: SheetTab;
  /** 表的展示名，取自模板，不翻译 */
  sheetName: string;
  /** 除 row_id 与匹配列之外的列，保持模板顺序 */
  columns: string[];
  rows: SectionRow[];
}

/** 角色的全部称谓：姓名 + 别称拆分。匹配时任一命中即算。 */
function aliasSet(c: CharacterVM): Set<string> {
  const out = new Set<string>();
  const push = (v: string) => {
    const s = v.trim();
    if (s) out.add(s);
  };
  push(c.name);
  // 别称是逗号/顿号分隔的多个称呼
  for (const a of c.aliases.split(/[,，、;；]/)) push(a);
  return out;
}

/**
 * 单元格是否指向该角色。
 *
 * 用「包含」而非全等：`主角外对象` 一格里可能写多个人，
 * `记录者` 也可能写成「笹兵卫（多默）」这类带补充的形式。
 * 代价是短名可能误命中，因此只对长度 ≥2 的称谓做包含匹配。
 */
function matchesOwner(value: string, names: Set<string>): boolean {
  const v = value.trim();
  if (!v) return false;
  for (const n of names) {
    if (v === n) return true;
    if (n.length >= 2 && v.includes(n)) return true;
  }
  return false;
}

/** 找到本表中实际存在的匹配列。返回 null 表示该表没有可用的关联列。 */
function resolveOwnerCols(sheet: SheetSnapshot, spec: SectionSpec): string[] {
  return spec.ownerColumns.filter((c) => sheet.headers.includes(c));
}

function readSection(spec: SectionSpec, character: CharacterVM): Section | null {
  const sheet = findSheetByName(spec.sheets);
  if (!sheet) return null;

  const ownerCols = resolveOwnerCols(sheet, spec);
  const names = aliasSet(character);

  // 主角拥有整表的情形（见 sheet-sections 对 allForProtagonist 的说明）
  const takeAll = spec.allForProtagonist && character.isProtagonist;

  const hidden = new Set<string>(['row_id', ...ownerCols]);
  const columns = sheet.headers.filter((h) => !hidden.has(h));

  const rows: SectionRow[] = [];
  sheet.rows.forEach((raw, i) => {
    const hit =
      takeAll ||
      (ownerCols.length > 0 &&
        ownerCols.some((col) => matchesOwner(cell(sheet, raw, col), names)));
    if (!hit) return;

    /*
     * 角色卡各分区是纯只读展示，因此可以在读取时就把没展开的 `{{user}}`
     * 换成玩家名 —— 与表格视图不同，这里没有写回路径，不存在把真名
     * 固化进库的风险。
     */
    const cells: Record<string, string> = {};
    for (const col of columns) cells[col] = replaceUserPlaceholders(cell(sheet, raw, col));
    rows.push({ rowIndex: i + 1, cells });

    if (spec.single && rows.length >= 1) return;
  });

  return { id: spec.id, tab: spec.tab, sheetName: sheet.name, columns, rows };
}

/** 取某一分区。表不存在或无匹配行时返回 null，由界面决定显示占位还是隐藏。 */
export function readCharacterSection(id: string, character: CharacterVM): Section | null {
  const spec = SECTIONS.find((s) => s.id === id);
  if (!spec) return null;
  const section = readSection(spec, character);
  return section && section.rows.length > 0 ? section : null;
}

/** 取某一页的全部分区，保持配置中的顺序。空分区已剔除。 */
export function readTabSections(tab: SheetTab, character: CharacterVM): Section[] {
  return SECTIONS.filter((s) => s.tab === tab)
    .map((s) => readSection(s, character))
    .filter((s): s is Section => s !== null && s.rows.length > 0);
}

export interface BioGroup {
  id: string;
  volatile: boolean;
  adult: boolean;
  /** 只含非空字段。空值列整条隐藏（§8.3b）—— 一屏「暂无」会让页面显得残缺。 */
  fields: Array<{ label: string; text: string }>;
}

/**
 * 传记页的分组视图：把生理与心理两表合并成连续的阅读内容，
 * 不做表格罗列，也不显示两表的分界（§8.3b）。
 */
export function readBio(character: CharacterVM): BioGroup[] {
  const merged: Record<string, string> = {};
  for (const id of ['physiology', 'psychology']) {
    const s = readCharacterSection(id, character);
    if (!s?.rows.length) continue;
    for (const [k, v] of Object.entries(s.rows[0].cells)) {
      if (String(v ?? '').trim()) merged[k] = String(v).trim();
    }
  }

  return BIO_GROUPS.map((g) => ({
    id: g.id,
    volatile: !!g.volatile,
    adult: !!g.adult,
    fields: g.columns
      .filter((c) => merged[c])
      .map((c) => ({ label: c, text: merged[c] })),
  })).filter((g) => g.fields.length > 0);
}

export interface ResourceVM {
  /** 稳定标识，来自「资源ID」列 */
  id: string;
  name: string;
  current: number | null;
  max: number | null;
  /** 恢复策略，如 长休 / 场景 */
  refresh: string;
  pinned: boolean;
  /** 百分比，上限缺失时为 null */
  percent: number | null;
}

function num(v: string): number | null {
  const n = Number.parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * 资源条。置顶的上 header，其余留在总览页。
 *
 * 模板要求每个主要角色建齐四条默认资源（生命/耐力/饱腹/性欲），
 * 但这里**不假设它们一定存在** —— 旧存档、手改过的模板都可能缺。
 * 界面在没有置顶资源时显示占位槽，而不是渲染出一条假的生命条。
 */
export function readResources(character: CharacterVM): ResourceVM[] {
  const s = readCharacterSection('resources', character);
  if (!s) return [];
  const list = s.rows.map((r) => {
    const current = num(r.cells['当前值']);
    const max = num(r.cells['上限']);
    const id = (r.cells['资源ID'] ?? '').trim();
    return {
      id,
      name: r.cells['显示名'] || id || '—',
      current,
      max,
      refresh: r.cells['恢复策略'] ?? '',
      pinned: /^(是|true|1|yes)$/i.test((r.cells['置顶'] ?? '').trim()),
      percent:
        current !== null && max !== null && max > 0
          ? Math.max(0, Math.min(100, (current / max) * 100))
          : null,
    };
  });

  /*
   * 四条默认资源固定排在最前且顺序固定。AI 插行的先后不定，
   * 按行号展示会让同一个角色在不同存档里资源条的排列不一样。
   * 其余资源保持原有相对顺序（sort 在现代引擎里是稳定的）。
   */
  return list.sort(
    (a, b) => resourceRank(a.id || a.name) - resourceRank(b.id || b.name),
  );
}
