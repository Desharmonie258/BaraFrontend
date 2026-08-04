/**
 * 弹层容器统一出口。
 *
 * 实测确认：Naive UI 的 Modal / Select / Popover / Dropdown 等默认
 * teleport 到 document.body —— 在 Shadow DOM 方案下这会逃出隔离边界，
 * 弹层将丢失全部样式（因为 Naive UI 的样式挂在 shadow root 内）。
 *
 * 因此**每一个弹层组件都必须绑定 `:to`**。逐处手写必然遗漏，故集中在此。
 *
 * 用法：
 *   const to = useTeleportTarget();
 *   <NSelect :to="to" ... />
 */
import { computed, type ComputedRef } from 'vue';
import { getPopupLayer } from '../bootstrap/shadow-mount';

export function useTeleportTarget(): ComputedRef<HTMLElement | undefined> {
  // 用 computed 而非常量：挂载早于组件 setup 的场景下首次取值可能为 null
  return computed(() => getPopupLayer() ?? undefined);
}
