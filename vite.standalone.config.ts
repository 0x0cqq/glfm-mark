import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * 静态挂载入口构建配置：内联 Vue，产物可直接在浏览器中通过相对路径加载。
 */
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
    lib: {
      entry: r('src/standalone.ts'),
      formats: ['es'],
      fileName: () => 'standalone.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? info.name ?? '';
          if (name.endsWith('.css')) return 'standalone.css';
          if (/\.(woff2?|ttf|eot)$/.test(name)) return 'fonts/[name][extname]';
          return 'assets/[name][extname]';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
