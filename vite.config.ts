import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * 开发与演示用配置：根目录为 `demo/`，便于直接运行 `npm run dev`。
 */
export default defineConfig({
  root: r('demo'),
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: r('dist-demo'),
    emptyOutDir: true,
  },
});
