/**
 * 表清单与列元信息。
 *
 * 数据源是**只读快照**（snapshot-repo）—— 它同时提供表名、表头与全部
 * 数据行，因此行数徽标直接取 `rows.length`，不需要额外的聚合查询。
 *
 * 早期版本从模板 DDL 解析列名、再用一条 UNION ALL 查行数，那是建立在
 * 「必须走 SQL」的错误前提上的，已废弃。
 */
import { reactive, ref } from 'vue';
import { getSnapshot, invalidate } from '../data/snapshot-repo';
import { canRead } from '../data/db-gateway';

export interface SheetSchema {
  key: string;
  name: string;
  /** 物理表名，仅用于展示与排错 */
  table: string;
  /** 列展示名，即快照的 content[0] */
  headers: string[];
  rowCount: number;
}

function create() {
  const sheets = ref<SheetSchema[]>([]);
  const loaded = ref(false);
  const available = ref(false);

  /** 从快照重建表清单。表格更新后调用。 */
  function reload(): void {
    available.value = canRead();
    if (!available.value) {
      sheets.value = [];
      loaded.value = true;
      return;
    }
    invalidate();
    sheets.value = [...getSnapshot().values()].map((s) => ({
      key: s.key,
      name: s.name,
      table: s.table,
      headers: s.headers,
      rowCount: s.rows.length,
    }));
    loaded.value = true;
  }

  function get(key: string): SheetSchema | undefined {
    return sheets.value.find((s) => s.key === key);
  }

  return reactive({ sheets, loaded, available, reload, get });
}

export type SchemaStore = ReturnType<typeof create>;

let instance: SchemaStore | null = null;

export function useSchemaStore(): SchemaStore {
  if (!instance) instance = create();
  return instance;
}

/** 仅供测试与卸载使用 */
export function __resetSchemaStore(): void {
  instance = null;
}
