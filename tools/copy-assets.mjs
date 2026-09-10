/**
 * 复制第三方静态资源到 `dist/`。
 *
 * 库模式构建会把 CSS 中引用的字体内联为 base64（CSS 会膨胀到 1.4MB），
 * 因此 KaTeX 样式与字体改为独立文件随站点部署，由宿主页面引入，不依赖 CDN。
 */
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const katexDist = resolve(root, 'node_modules/katex/dist');

mkdirSync(resolve(root, 'dist'), { recursive: true });
mkdirSync(resolve(root, 'dist/fonts'), { recursive: true });

copyFileSync(resolve(katexDist, 'katex.min.css'), resolve(root, 'dist/katex.css'));
cpSync(resolve(katexDist, 'fonts'), resolve(root, 'dist/fonts'), { recursive: true });

process.stdout.write('已复制 KaTeX 样式与字体到 dist/\n');
