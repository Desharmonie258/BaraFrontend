import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

/**
 * 测试配置 —— 与 webpack 构建链并行存在，不影响模板的 pnpm build。
 *
 * domain/ 层的纯函数在 node 环境跑；只有 Shadow DOM 探测需要 jsdom。
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
    projects: [
      {
        extends: true,
        test: {
          name: 'domain',
          environment: 'node',
          include: ['tests/attribute-codec.test.ts', 'tests/sql-builder.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/shadow-dom-probe.test.ts'],
        },
      },
    ],
  },
});
