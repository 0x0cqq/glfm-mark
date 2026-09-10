/**
 * 生成离线示例使用的 HTML fixture。
 *
 * 输出 `examples/mkdocs/docs/assets/fixtures.json`，把内置 Markdown 映射到
 * 预生成的 GitLab 风格 HTML。离线示例只渲染这些固定文档；任意新增源码需要
 * 连接真实适配器，界面会明确提示。
 *
 * 运行：`npm run fixtures`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../examples/mkdocs/docs/assets/fixtures.json');

/** 建立浏览器环境，供夹具渲染器使用。 */
function setupDom(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = dom.window;
  globals.document = dom.window.document;
  globals.Element = dom.window.Element;
  globals.HTMLElement = dom.window.HTMLElement;
  globals.HTMLInputElement = dom.window.HTMLInputElement;
  globals.Node = dom.window.Node;
  globals.DOMParser = dom.window.DOMParser;
}

/** 生成 fixture 并写入磁盘。 */
async function main(): Promise<void> {
  setupDom();

  const { createFixtureRenderer } = await import('../tests/fixtures/renderer.ts');
  const { demoMarkdown } = await import('../demo/demo-markdown.ts');

  const renderer = createFixtureRenderer();
  const fixtures: Record<string, string> = {};

  for (const [key, markdown] of Object.entries({ demo: demoMarkdown })) {
    const { html } = await renderer.render(markdown);
    fixtures[markdown] = html;
    process.stdout.write(`已生成 fixture：${key}（${markdown.length} 字符）\n`);
  }

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(fixtures, null, 2)}\n`, 'utf8');
  process.stdout.write(`写入 ${output}\n`);
}

await main();
