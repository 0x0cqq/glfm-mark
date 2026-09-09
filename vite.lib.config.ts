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
    lib: {
      entry: r('src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
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
