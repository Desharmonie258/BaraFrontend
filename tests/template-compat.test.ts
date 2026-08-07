/**
 * 跨模板兼容的回归测试。
 *
 * 分两层，缺一不可：
 *
 * 1. **通用断言**扫描全部模板 —— 任意模板都要能把表读出来、渲染出内容。
 * 2. **具名断言**锁死关键模板的识别结果 —— 防的是「看起来正常的错误数据」。
 *    指纹曾把主角信息表误认成角色表（十份里七份中招，主角会在「重要角色」
 *    列表里重复出现），单元测试完全看不出来，是横向跑真实模板才发现的。
 *
 * 夹具在模块加载时一次读完：把 readFileSync 放进用例会让磁盘抖动计入
 * 用例耗时，偶尔顶穿默认的 5s 超时 —— 失败的是 IO，不是被测逻辑。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSnapshot } from '../src/BaraFrontend/data/snapshot-repo';
import { checkSheet } from '../src/BaraFrontend/domain/sheet-health';
import { availableViews, resolveView } from '../src/BaraFrontend/domain/table-view-policy';
import {
  matchSheets, CHARACTERS, PROTAGONIST, SUGGESTIONS, ITEMS, EQUIPMENT, RESOURCES,
  type SheetLike,
} from '../src/BaraFrontend/domain/sheet-binding';

const ROOT = resolve(__dirname, '../..');
const EXTERNAL_DIR = resolve(ROOT, '需兼容适配');
const OWN = '数据库模板-BaraFrontend-1.0-RosaCaninae.json';

/** 模板文件之外，目录里还混着酒馆助手脚本（type:script，3MB 打包 JS） */
function isTemplate(raw: unknown): raw is Record<string, any> {
  return (
    !!raw && typeof raw === 'object' &&
    Object.keys(raw as object).some((k) => k.startsWith('sheet_'))
  );
}

/** 模板文件只有表头，注入数据行才能验证行映射与渲染 */
function withRows(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith('sheet_') || !Array.isArray(v?.content)) {
      out[k] = v;
      continue;
    }
    const hdr: string[] = v.content[0] ?? [];
    const mk = (n: number) => hdr.map((h, i) => (i === 0 ? String(n) : `${h}-值${n}`));
    out[k] = { ...v, content: [hdr, mk(1), mk(2)] };
  }
  return out;
}

interface Fixture {
  file: string;
  sheets: SheetLike[];
  snap: ReturnType<typeof buildSnapshot>;
}

function load(path: string): Fixture | null {
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (!isTemplate(raw)) return null;
  const snap = buildSnapshot(withRows(raw));
  return {
    file: path.split(/[\\/]/).pop()!,
    snap,
    sheets: [...snap.values()].map((s) => ({ key: s.key, name: s.name, headers: s.headers })),
  };
}

const FIXTURES: Fixture[] = [
  ...(existsSync(EXTERNAL_DIR)
    ? readdirSync(EXTERNAL_DIR).filter((f) => f.endsWith('.json')).map((f) => resolve(EXTERNAL_DIR, f))
    : []),
  resolve(ROOT, '瑟瑟灵感数据库模板V3.6.json'),
  resolve(ROOT, 'SQL_v4.3.json'),
  resolve(ROOT, '数据库模板-super自定义7.12总版-caikis.json'),
  resolve(ROOT, OWN),
].flatMap((p) => {
  const f = load(p);
  return f ? [f] : [];
});

/** 按文件名前缀取夹具，找不到返回 null（模板是外部资产，可能被增删） */
function fixture(prefix: string): Fixture | null {
  return FIXTURES.find((f) => f.file.startsWith(prefix)) ?? null;
}

function names(spec: Parameters<typeof matchSheets>[0], f: Fixture): string[] {
  return matchSheets(spec, f.sheets).map((m) => m.name);
}

describe('跨模板兼容 · 通用', () => {
  it('至少加载到若干份模板 —— 夹具目录空了要立刻发现', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(5);
  });

  for (const f of FIXTURES) {
    describe(f.file, () => {
      it('每张表都能解析出表头与数据行', () => {
        const bad = [...f.snap.values()]
          .filter((s) => s.headers.length === 0 || s.rows.length !== 2)
          .map((s) => s.name);
        expect(bad, `解析异常: ${bad.join('、')}`).toEqual([]);
      });

      it('每张表都能渲染出内容，不出现空卡片', () => {
        // 复现 RowCard 的字段计算：首列作标题，其余非空字段构成卡片正文
        const empty = [...f.snap.values()]
          .filter((s) => {
            const cols = s.headers.filter((h) => h !== 'row_id');
            const cells = Object.fromEntries(s.headers.map((h, i) => [h, s.rows[0][i] ?? '']));
            return cols.slice(1).filter((c) => String(cells[c] ?? '').trim()).length === 0;
          })
          .map((s) => s.name);
        expect(empty, `会渲染成空卡片: ${empty.join('、')}`).toEqual([]);
      });

      it('结构判定为可渲染', () => {
        const broken = [...f.snap.values()]
          .filter((s) => checkSheet(s.headers).kind === 'no_headers' || checkSheet(s.headers).kind === 'only_row_id')
          .map((s) => s.name);
        expect(broken).toEqual([]);
      });

      it('视图策略稳定，记忆值总能收敛到可用视图', () => {
        for (const s of f.snap.values()) {
          const hasDate = s.headers.some((c) => c.includes('日期'));
          const views = availableViews(s.name, hasDate);
          expect(views.length, `${s.name} 无可用视图`).toBeGreaterThan(0);
          for (const remembered of ['card', 'list', 'calendar'] as const) {
            expect(views).toContain(resolveView(s.name, hasDate, remembered));
          }
        }
      });

      it('主角表绝不被当成角色表 —— 否则主角会在「重要角色」里重复出现', () => {
        const prot = names(PROTAGONIST, f);
        const chars = names(CHARACTERS, f);
        for (const p of prot) expect(chars, `${p} 同时被认作角色表`).not.toContain(p);
      });
    });
  }
});

/**
 * 关键模板的识别结果快照。这些断言故意写死表名 ——
 * 一旦识别规则改动导致命中变化，必须是有意为之，不能悄悄发生。
 */
describe('跨模板兼容 · 具名', () => {
  const own = fixture('数据库模板-BaraFrontend');
  it.skipIf(!own)('自家模板：六项能力齐备', () => {
    const f = own!;
    expect(names(CHARACTERS, f)).toEqual(['追踪角色表']);
    expect(names(PROTAGONIST, f)).toEqual(['主角信息']);
    expect(names(SUGGESTIONS, f)).toEqual(['检定建议表']);
    expect(names(ITEMS, f)).toEqual(['物品表']);
    expect(names(EQUIPMENT, f)).toEqual(['装备表']);
    // 十份模板里只有自家的有资源表
    expect(names(RESOURCES, f)).toEqual(['角色资源表']);
  });

  const yo = fixture('YO-骰子');
  it.skipIf(!yo)('YO：恋爱对象表与重要角色表都要认，且不含主角信息表', () => {
    const f = yo!;
    expect(names(CHARACTERS, f)).toEqual(['恋爱对象表', '重要角色表']);
    expect(names(PROTAGONIST, f)).toEqual(['主角信息表']);
    expect(names(RESOURCES, f)).toEqual([]);
  });

  const theater = fixture('小剧场');
  it.skipIf(!theater)('小剧场：社交媒体模拟，无任何角色能力', () => {
    const f = theater!;
    expect(names(CHARACTERS, f)).toEqual([]);
    expect(names(PROTAGONIST, f)).toEqual([]);
    expect(names(ITEMS, f)).toEqual([]);
    expect(names(EQUIPMENT, f)).toEqual([]);
    // 三项全空 → 仪表盘显示「此模板无角色相关表」而非空白页
  });

  const ntrs = fixture('NTRS');
  it.skipIf(!ntrs)('NTRS：key 全被重制，靠展示名救回', () => {
    const f = ntrs!;
    // 重要角色表的 key 是 sheet_NcBlYRH5，key 通道对它完全无效
    expect(matchSheets(CHARACTERS, f.sheets).map((m) => m.via)).toEqual(['name']);
    expect(names(ITEMS, f)).toEqual(['背包物品表']);
  });

  const autumn = fixture('秋枫暮霞');
  it.skipIf(!autumn)('秋枫暮霞：自定义物品表名靠展示名命中', () => {
    expect(names(ITEMS, autumn!)).toEqual(['重要物品表']);
  });
});
