/**
 * 资源的默认集合与展示顺序。
 *
 * 模板要求每个主要角色建档时建齐四条默认资源。它们的**展示顺序固定**：
 * AI 插行的先后不定，若按行号展示，同一个角色在不同存档里资源条的
 * 排列会不一样。生命值永远在最前，这是查看时最先要看的量。
 *
 * 扩展资源（魔法值、气、狂暴次数…）不在此列，按行号排在默认资源之后。
 */

export interface DefaultResource {
  id: string;
  /** 模板里的显示名，用于按名字回配没有填 resource_id 的行 */
  displayName: string;
}

/** 四条默认资源，数组顺序即展示顺序 */
export const DEFAULT_RESOURCES: readonly DefaultResource[] = [
  { id: 'hp', displayName: '生命值' },
  { id: 'stamina', displayName: '耐力值' },
  { id: 'satiety', displayName: '饱腹度' },
  { id: 'libido', displayName: '性欲值' },
];

const ORDER = new Map<string, number>();
DEFAULT_RESOURCES.forEach((r, i) => {
  ORDER.set(r.id, i);
  ORDER.set(r.displayName, i);
});

/**
 * 排序权重。默认资源按固定顺序排在最前，其余保持原有相对顺序。
 *
 * 同时接受资源ID与显示名：模板要求填 ID，但 AI 偶尔只填显示名，
 * 两者都能命中比只认一种更耐用。
 */
export function resourceRank(idOrName: string): number {
  return ORDER.get(idOrName.trim()) ?? Number.MAX_SAFE_INTEGER;
}

/** 是否为默认资源。默认资源即使当前值为 0 也要显示 —— 0 本身是有意义的状态。 */
export function isDefaultResource(idOrName: string): boolean {
  return ORDER.has(idOrName.trim());
}
