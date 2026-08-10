/**
 * 手改单元格的统一入口。
 *
 * 表格坞与仪表盘都从这里写。两个页面各写一遍写入链路，迟早有一边漏掉
 * 失效、刷新或基线同步中的某一步 —— 而「界面显示已改、库里其实没改」
 * 是最难发现的一类错：它不报错。
 *
 * ## 一次手改要做四件事
 *
 * 1. 按**表展示名**定位快照（仪表盘手里只有展示名，没有 sheetKey）
 * 2. 写库（`table-repo.updateCell` 负责失效快照并刷新）
 * 3. 同步审核基线 —— 见下
 * 4. 把失败翻译成人能照着做的一句话
 *
 * ## 为什么手改要动审核基线
 *
 * 变更审核靠「基线 → 当前」的差异得出「AI 这轮改了什么」。手改会混进
 * 同一份 diff，让审核页把用户自己刚点的编辑报成 AI 的改动。
 *
 * 所以手改后把基线里对应的那一格一并改掉，手改就不进 diff。
 * 用的是 `patchBaselineCell` 而非重拍整库基线 —— 后者会把 AI 尚未审核的
 * 改动一起吞掉。
 *
 * 基线同步失败**不影响写入结果**：数据已经落库了，回一个「写成功但审核
 * 页会多出一条」比回「失败」更接近事实。
 */
import { canWrite, insertRow, refresh } from '../db-gateway';
import { findSheetByName, invalidate } from '../snapshot-repo';
import { deleteRow, updateCell } from './table-repo';
import { loadBaseline, patchBaselineCell, patchBaselineRow } from './review-repo';

/** 一次手改的目标。行号沿用数据库本体口径：0 为表头，1 为第一行数据。 */
export interface EditTarget {
  /** 表的展示名 */
  sheetName: string;
  rowIndex: number;
  /** 列的展示名 */
  column: string;
}

export type EditOutcome =
  | { ok: true; /** 基线没跟上，审核页会多出这一条 */ baselineStale: boolean }
  | { ok: false; message: string };

/** 写入能力在不在。入口要据此隐藏，而不是让人点了再报错。 */
export function canEdit(): boolean {
  return canWrite();
}

/**
 * 失败原因翻译成一句能照着做的话。
 *
 * 原始 message 多半是 SQL 报错或空字符串，直接甩给用户等于没说。
 * 每一条都要落到「用户下一步能做什么」上。
 */
function explain(kind: string, fallback: string): string {
  switch (kind) {
    case 'runtime_not_ready':
      return '数据库还没准备好，等它加载完再试';
    case 'table_missing':
      return '这张表在当前模板里不存在，可能是模板换过了';
    case 'column_unresolved':
      return '这一列在当前模板里找不到，可能是模板换过了';
    case 'readonly_violation':
      return '数据库是只读的，先在数据库设置里切到 SQLite 存储模式';
    case 'alias_conflict':
      return '表名有歧义，模板里有重名的表';
    default:
      return fallback || '写入被拒绝，原因未知';
  }
}

/**
 * 写一个格子。
 *
 * 值一律按字符串写 —— 表格数据在快照里就是字符串，数值列的格式化是
 * 调用方的事，这里不猜。
 */
export async function writeCell(target: EditTarget, value: string): Promise<EditOutcome> {
  if (!canEdit()) {
    return { ok: false, message: explain('readonly_violation', '') };
  }
  const sheet = findSheetByName([target.sheetName]);
  if (!sheet) {
    return { ok: false, message: explain('table_missing', '') };
  }
  if (target.rowIndex <= 0) {
    // 0 是表头。让表头可改会把列名写坏，而列名是所有识别逻辑的依据
    return { ok: false, message: '不能改表头' };
  }

  const result = await updateCell(sheet, target.rowIndex, target.column, value);
  if (!result.ok) {
    return { ok: false, message: explain(result.failure.kind, result.failure.message) };
  }

  const patched = patchBaselineCell(sheet.key, target.rowIndex, target.column, value);
  /*
   * patched=false 有两种情形：没有基线（用户还没开始审核，本就不必同步）
   * 与补不上（基线建立后表结构变了）。前者不算「跟不上」，
   * 否则每个没建基线的用户都会看到一句莫名其妙的提示。
   */
  return { ok: true, baselineStale: !patched && loadBaseline() !== null };
}

/**
 * 表尾追加一行。`values` 的键是列展示名，缺的列写空。
 *
 * 只能追加，不能插到中间 —— 数据库本体的 `insertRow` 就只有追加。
 * 这也省掉了「插入后面每一行的行号都变了」这个麻烦。
 */
export async function addRow(
  sheetName: string,
  values: Record<string, string>,
): Promise<EditOutcome> {
  if (!canEdit()) return { ok: false, message: explain('readonly_violation', '') };

  const sheet = findSheetByName([sheetName]);
  if (!sheet) return { ok: false, message: explain('table_missing', '') };

  const rowIndex = await insertRow(sheet.name, values);
  if (rowIndex < 0) return { ok: false, message: '新增失败，数据库拒绝了这一行' };

  // 写成功后本体的数据变了，快照必须失效，否则界面读回来还是旧的
  invalidate();
  await refresh();

  /*
   * 基线里也补一行，否则审核页会把它报成 AI 新增的。
   * 按表头顺序摊平，缺的列留空 —— 与本体写进去的形态一致。
   */
  const row = sheet.headers.map((h) => values[h] ?? '');
  const patched = patchBaselineRow(sheet.key, rowIndex, row);
  return { ok: true, baselineStale: !patched && loadBaseline() !== null };
}

/**
 * 删掉一行。
 *
 * 不可撤销，调用方必须先向用户确认 —— 这一层不弹确认框（domain/data 层
 * 不该知道有没有用户界面），但它是唯一能删数据的入口，写在这里提醒。
 */
export async function removeRow(sheetName: string, rowIndex: number): Promise<EditOutcome> {
  if (!canEdit()) return { ok: false, message: explain('readonly_violation', '') };

  const sheet = findSheetByName([sheetName]);
  if (!sheet) return { ok: false, message: explain('table_missing', '') };
  if (rowIndex <= 0) return { ok: false, message: '不能删表头' };

  const ok = await deleteRow(sheet, rowIndex);
  if (!ok) return { ok: false, message: '删除失败，数据库拒绝了这次操作' };

  const patched = patchBaselineRow(sheet.key, rowIndex);
  return { ok: true, baselineStale: !patched && loadBaseline() !== null };
}
