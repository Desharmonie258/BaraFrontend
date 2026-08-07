import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

/**
 * 测试配置 —— 与 webpack 构建链并行存在，不影响模板的 pnpm build。
 *
 * domain/ 与 data/ 层是纯函数，node 环境即可。组件层暂无测试。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@util': resolve(__dirname, 'util'),
    },
  },
  test: {
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
