/**
 * jsdom 缺失的浏览器 API 垫片 —— vueuc（Naive UI 的弹层底座）会用到。
 * 本文件对全部测试文件生效，因此需要判断当前是否为 DOM 环境。
 */
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  // jsdom 不实现滚动，虚拟列表会调用它
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = function scrollTo() {} as typeof Element.prototype.scrollTo;
  }
  if (!Element.prototype.scrollBy) {
    Element.prototype.scrollBy = function scrollBy() {} as typeof Element.prototype.scrollBy;
  }
}
