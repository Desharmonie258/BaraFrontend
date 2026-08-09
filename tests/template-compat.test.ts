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
import { detectMapColumns, layoutMap } from '../src/BaraFrontend/domain/map-layout';
import {
  matchSheets, CHARACTERS, PROTAGONIST, SUGGESTIONS, ITEMS, EQUIPMENT, RESOURCES,
  type SheetLike,
} from '../src/BaraFrontend/domain/sheet-binding';

const ROOT = resolve(__dirname, '../..');
const EXTERNAL_DIR = resolve(ROOT, '需兼容适配');
/**
 * 自家模板两代都要测：1.1 是当前模板，1.0 代表用户手上还没重导的旧结构 ——
 * 兼容层的价值全在后者，删掉它就等于不再验证旧模板还能不能读。
 */
const OWN = '数据库模板-BaraFrontend-1.1-Gigantea.json';
const OWN_PREV = '数据库模板-BaraFrontend-1.0-RosaCaninae.json';

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
  resolve(ROOT, OWN_PREV),
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
          const caps = {
            hasDate: s.headers.some((c) => c.includes('日期')),
            hasCoords: detectMapColumns(s.headers) !== null,
          };
          const views = availableViews(s.name, caps);
          expect(views.length, `${s.name} 无可用视图`).toBeGreaterThan(0);
          for (const remembered of ['card', 'list', 'calendar', 'map'] as const) {
            expect(views).toContain(resolveView(s.name, caps, remembered));
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
  const own = fixture('数据库模板-BaraFrontend-1.1');
  it.skipIf(!own)('自家模板：各项能力齐备，主角已并入角色表', () => {
    const f = own!;
    expect(names(CHARACTERS, f)).toEqual(['角色表']);
    // 1.1 合并后没有独立主角表了 —— 主角是角色表里的一行
    expect(names(PROTAGONIST, f)).toEqual([]);
    expect(names(SUGGESTIONS, f)).toEqual(['检定建议表']);
    expect(names(ITEMS, f)).toEqual(['物品表']);
    expect(names(EQUIPMENT, f)).toEqual(['装备表']);
    // 十份模板里只有自家的有资源表
    expect(names(RESOURCES, f)).toEqual(['角色资源表']);
  });

  it.skipIf(!own)('自家模板 1.1：角色表带齐恋爱三列与永固值', () => {
    const f = own!;
    const ch = [...f.snap.values()].find((s) => s.name === '角色表')!;
    for (const col of ['好感度', '关系阶段', '角色定位', '当前衣着/装扮', '固有性特征']) {
      expect(ch.headers, `角色表缺列 ${col}`).toContain(col);
    }
    // 「永固」必须进 CHECK 约束，否则前端渲染不出这个选项、玩家也钉不住角色
    expect(ch.enums['角色定位']).toContain('永固');
    expect(ch.enums['关系阶段']).toEqual([
      '陌生', '相识', '熟识', '暧昧', '恋人', '伴侣', '破裂',
    ]);
  });

  /**
   * 1.1 的地图改造。断言写死表名与列名，因为这三样必须同时成立才画得出图：
   * 表名（决定地图是否为默认视图）、坐标两列（决定地图视图是否开放）、
   * 以及 ascii 简图列确实删掉了（残留会白占上下文 token）。
   */
  it.skipIf(!own)('自家模板 1.1：两张地图表都有坐标列，地图为默认视图', () => {
    const f = own!;
    for (const name of ['世界地图点', '本地地图表']) {
      const s = [...f.snap.values()].find((x) => x.name === name);
      expect(s, `${name} 不存在`).toBeTruthy();
      expect(s!.headers, `${name} 缺坐标列`).toContain('X坐标');
      expect(s!.headers, `${name} 缺坐标列`).toContain('Y坐标');
      expect(availableViews(name, { hasDate: false, hasCoords: true })[0]).toBe('map');
    }
    const wm = [...f.snap.values()].find((x) => x.name === '世界地图点')!;
    expect(wm.headers).not.toContain('字符简图');
    expect(wm.headers).toContain('接壤关系');
  });

  /**
   * 端到端：模板表头 → 列探测 → 排版。
   *
   * 单测里的表头是手抄的常量，会与模板漂移；这条用**模板文件里的真实表头**
   * 跑一遍完整链路。将来谁把「接壤关系」改成别的名字，探测会静默返回
   * adjacency: undefined、边全部消失，而只有这条断言看得见。
   */
  it.skipIf(!own)('自家模板 1.1：真实表头能驱动排版并画出正确方位', () => {
    const f = own!;
    const wm = [...f.snap.values()].find((x) => x.name === '世界地图点')!;
    const cols = detectMapColumns(wm.headers);
    expect(cols, '世界地图点的列探测失败').toBeTruthy();
    expect(cols!.adjacency, '接壤关系列没认出来，边会全部消失').toBe('接壤关系');

    // 按模板的真实列名构造数据：御苑在广场以北
    const rows: Record<string, string>[] = [
      { [cols!.name]: '广场', [cols!.x]: '0.50', [cols!.y]: '0.30', [cols!.adjacency!]: '御苑:北邻,街道相连' },
      { [cols!.name]: '御苑', [cols!.x]: '0.50', [cols!.y]: '0.70' },
    ];
    const layout = layoutMap(
      rows.map((r, i) => ({
        rowIndex: i + 1,
        name: r[cols!.name],
        x: Number(r[cols!.x]),
        y: Number(r[cols!.y]),
        adjacency: r[cols!.adjacency!],
      })),
      { width: 600, height: 400 },
    );

    expect(layout.points).toHaveLength(2);
    expect(layout.edges, '接壤关系没有变成边').toHaveLength(1);
    expect(layout.edges[0].style).toBe('solid');
    const y = (n: string) => layout.points.find((p) => p.name === n)!.py;
    expect(y('御苑'), '御苑应画在广场上方').toBeLessThan(y('广场'));
  });

  const ownPrev = fixture('数据库模板-BaraFrontend-1.0');
  it.skipIf(!ownPrev)('自家模板 1.0：旧的分表结构仍要认得出', () => {
    const f = ownPrev!;
    // 用户手上没重导的旧模板、以及所有外部模板，都还是主角与角色分两张表
    expect(names(PROTAGONIST, f)).toEqual(['主角信息']);
    expect(names(CHARACTERS, f)).toEqual(['追踪角色表']);
    // 主角表绝不能被指纹认成角色表 —— 否则主角在「重要角色」里重复出现
    expect(names(CHARACTERS, f)).not.toContain('主角信息');
  });

  it.skipIf(!ownPrev)('自家模板 1.0：没有坐标列，地图视图不开放而非空白', () => {
    const f = ownPrev!;
    const wm = [...f.snap.values()].find((x) => x.name === '世界地图点')!;
    expect(wm.headers).toContain('字符简图');
    expect(wm.headers).not.toContain('X坐标');
    // 旧模板落到卡片视图 —— 这是兼容层要保证的事
    expect(availableViews('世界地图点', { hasDate: false, hasCoords: false })[0]).toBe('card');
    expect(resolveView('世界地图点', { hasDate: false, hasCoords: false }, 'map')).toBe('card');
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
