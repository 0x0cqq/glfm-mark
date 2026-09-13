/**
 * 准备 MkDocs 示例站点所需的资源。
 *
 * 1. 把库构建产物复制到示例站点。
 * 2. 复制与编辑器同版本的 KaTeX 资源，供参考页离线渲染。
 *
 * 运行：`npm run examples:prepare`（需先执行 `npm run build`）
 */
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { demoMarkdown } from '../demo/demo-markdown.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/** 确保目录存在。 */
function ensure(path: string): void {
  mkdirSync(path, { recursive: true });
}

/** 复制文件并报告缺失。 */
function copy(from: string, to: string): void {
  if (!existsSync(from)) {
    throw new Error(`缺少构建产物：${from}，请先执行 npm run build。`);
  }
  ensure(dirname(to));
  copyFileSync(from, to);
}

/** 主流程。 */
function main(): void {
  const docs = resolve(root, 'examples/mkdocs/docs');
  const target = resolve(docs, 'glfm-mark');
  ensure(resolve(docs, 'assets'));
  writeFileSync(resolve(docs, 'assets/demo-markdown.js'), `export const demoMarkdown = ${JSON.stringify(demoMarkdown)};\n`);

  copy(resolve(root, 'dist/standalone.js'), resolve(target, 'standalone.js'));
  copy(resolve(root, 'dist/standalone.css'), resolve(target, 'standalone.css'));
  copy(resolve(root, 'dist/katex.css'), resolve(target, 'katex.css'));
  cpSync(resolve(root, 'dist/fonts'), resolve(target, 'fonts'), { recursive: true });
  cpSync(resolve(root, 'dist/assets'), resolve(target, 'assets'), { recursive: true });

  const katex = resolve(docs, 'assets/vendor/katex');
  copy(resolve(root, 'node_modules/katex/dist/katex.min.css'), resolve(katex, 'katex.min.css'));
  copy(resolve(root, 'node_modules/katex/dist/katex.min.js'), resolve(katex, 'katex.min.js'));
  copy(
    resolve(root, 'node_modules/katex/dist/contrib/auto-render.min.js'),
    resolve(katex, 'auto-render.min.js'),
  );
  cpSync(resolve(root, 'node_modules/katex/dist/fonts'), resolve(katex, 'fonts'), {
    recursive: true,
  });

  process.stdout.write('示例站点资源已就绪。\n');
}

main();
