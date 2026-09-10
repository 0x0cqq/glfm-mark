import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * 库入口构建配置：Vue 作为 peer dependency 不打包进产物。
 */
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    cssCodeSplit: false,
    target: 'es2022',
    // 字体独立成文件，随站点一起部署，不依赖 CDN。
    assetsInlineLimit: 0,
    lib: {
      entry: r('src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        // 按需加载的 Mermaid、KaTeX 与高亮代码统一放在 assets 子目录，
        // 保持包根目录整洁。
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? info.name ?? '';
          if (name.endsWith('.css')) return 'style.css';
          if (/\.(woff2?|ttf|eot)$/.test(name)) return 'fonts/[name][extname]';
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
