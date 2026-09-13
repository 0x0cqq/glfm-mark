/** 真实浏览器验证选区格式、快捷键、源码行号和本地重解析。 */
import { expect, test, type Page } from '@playwright/test';
const URL = process.env.GLFM_DEMO_URL ?? 'http://127.0.0.1:5173/';

/** 通过公开演示入口加载测试文档，等待结构化编辑就绪。 */
async function openDocument(page: Page, theme: 'material' | 'modern', markdown = '# 标题\n\n选择这段文字\n\n## 二级\n\n结尾\n') {
  await page.goto(URL);
  await page.getByTestId('editor-content').locator('h1').waitFor();
  await expect(page.getByTestId('editor-gutter').locator('button').first()).toBeVisible();
  await page.getByRole('button', { name: theme === 'material' ? 'Material' : 'Modern', exact: true }).click();
  await page.evaluate((value) => (window as unknown as { __glfmDemo: { setMarkdown(markdown: string): void } }).__glfmDemo.setMarkdown(value), markdown);
  await expect(page.getByTestId('editor-content').locator('h1')).toHaveText('标题');
}
/** 模拟键盘选择当前段落一行文字。 */
async function selectParagraph(page: Page) {
  const paragraph = page.getByTestId('editor-content').locator('.ProseMirror > p').first();
  await paragraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await expect(page.getByTestId('selection-toolbar')).toBeVisible();
}
/** 读取对外 Markdown。 */
async function markdown(page: Page) {
  return page.evaluate(() => (window as unknown as { __glfmDemo: { getMarkdown(): string } }).__glfmDemo.getMarkdown());
}

for (const theme of ['material', 'modern'] as const) {
 test.describe(theme, () => {
test('选区菜单格式化并撤销，其他块逐字符保留', async ({ page }) => {
  await openDocument(page, theme);
  await selectParagraph(page);
  await page.getByTestId('selection-bold').click();
  await expect(page.getByTestId('editor-content').locator('strong')).toHaveText('选择这段文字');
  expect(await markdown(page)).toBe('# 标题\n\n**选择这段文字**\n\n## 二级\n\n结尾\n');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('editor-content').locator('strong')).toHaveCount(0);
  expect(await markdown(page)).toBe('# 标题\n\n选择这段文字\n\n## 二级\n\n结尾\n');
});

test('键盘格式、链接弹窗与焦点恢复', async ({ page }) => {
  await openDocument(page, theme);
  await selectParagraph(page);
  await page.keyboard.press('Control+i');
  await expect(page.getByTestId('editor-content').locator('em')).toHaveText('选择这段文字');
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('link-dialog-href')).toBeFocused();
  await page.getByTestId('link-dialog-href').fill('./guide');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('link-dialog')).toHaveCount(0);
  await expect(page.getByTestId('editor-content').locator('a')).toHaveAttribute('href', './guide');
  await page.keyboard.press('Control+Shift+m');
  await expect(page.getByTestId('editor-content').locator('a')).toHaveCount(0);
  await expect(page.getByTestId('editor-content').locator('em')).toHaveCount(0);
});

test('块起始行、标题类型、大纲和专注不使内容变脏', async ({ page }) => {
  await openDocument(page, theme);
  const gutter = page.getByTestId('editor-gutter');
  await expect(gutter.getByTitle('源码第 1 行 · H1')).toBeVisible();
  await expect(gutter.getByTitle('源码第 5 行 · H2')).toBeVisible();
  await page.getByRole('button', { name: '文档大纲', exact: true }).click();
  await page.getByRole('navigation', { name: '文档大纲' }).getByRole('button', { name: /二级/ }).click();
  await expect(gutter.getByTitle('源码第 5 行 · H2')).toHaveClass('is-active');
  await page.getByRole('button', { name: '专注模式', exact: true }).click();
  await expect(page.getByTestId('glfm-editor')).toHaveClass(/glfm-editor--focus/);
  await expect(page.locator('.glfm-editor__save-state')).toHaveText('内容未修改');
  expect(await markdown(page)).toBe('# 标题\n\n选择这段文字\n\n## 二级\n\n结尾\n');
});

test('源码模式有行号，任意新源码在断网后仍可预览和重解析', async ({ page, context }) => {
  await openDocument(page, theme);
  await page.getByTestId('toolbar-mode-source').click();
  await context.setOffline(true);
  await page.getByTestId('source-editor').fill('# 新标题\n\n> [!NOTE]\n> **离线修改**\n\n- [x] 任务');
  await expect(page.locator('.glfm-editor__source-lines span')).toHaveCount(6);
  await page.getByTestId('toolbar-mode-preview').click();
  await expect(page.getByTestId('preview-content').locator('strong')).toHaveText('离线修改');
  await page.getByTestId('toolbar-mode-wysiwyg').click();
  await expect(page.getByTestId('editor-content').locator('h1')).toHaveText('新标题');
  await expect(page.locator('.glfm-editor__save-state')).toHaveText('未保存的修改');
});

test('插入菜单和标题快捷键实际修改文档', async ({ page }) => {
  await openDocument(page, theme);
  await page.getByTestId('editor-content').locator('.ProseMirror > p').first().click();
  await page.keyboard.press('Control+Alt+3');
  await expect(page.getByTestId('editor-content').locator('h3')).toHaveText('选择这段文字');
  await page.getByLabel('插入内容', { exact: true }).click();
  await page.getByTestId('toolbar-table').click();
  await expect(page.getByTestId('editor-content').locator('table')).toHaveCount(1);
  await expect(page.locator('.glfm-editor__insert-menu')).not.toHaveAttribute('open');
});

test('键盘可进入选区工具栏并用 Escape 返回正文', async ({ page }) => {
  await openDocument(page, theme);
  await selectParagraph(page);
  await page.keyboard.press('Alt+F10');
  await expect(page.getByTestId('selection-bold')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('selection-italic')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('selection-toolbar')).toBeHidden();
  await expect(page.locator('.ProseMirror')).toBeFocused();
});

test('切换外观保留修改与撤销历史，图表标签由本地资源渲染', async ({ page }) => {
  await openDocument(page, theme);
  await selectParagraph(page);
  await page.getByTestId('selection-bold').click();
  await page.getByRole('button', { name: theme === 'material' ? 'Modern' : 'Material', exact: true }).click();
  await expect(page.getByTestId('editor-content').locator('strong')).toHaveText('选择这段文字');
  await page.getByTestId('toolbar-undo').click();
  await expect(page.getByTestId('editor-content').locator('strong')).toHaveCount(0);
  await page.getByTestId('toolbar-mode-source').click();
  await page.getByTestId('source-editor').fill('# 图表\n\n```mermaid\ngraph TD\n A[开始]-->B[完成]\n```');
  await page.getByTestId('toolbar-mode-preview').click();
  await expect(page.getByTestId('preview-content').locator('svg')).toBeVisible();
  await expect(page.getByTestId('preview-content').locator('svg')).toContainText('开始');
  await expect(page.getByTestId('preview-content').locator('svg')).toContainText('完成');
});

test('亮暗主题与窄屏的选区菜单保持在视口内', async ({ page }, testInfo) => {
  await openDocument(page, theme);
  await selectParagraph(page);
  const bubble = await page.getByTestId('selection-toolbar').boundingBox();
  expect(bubble!.x).toBeGreaterThanOrEqual(0);
  expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('writing-selected.png'), fullPage: true });
  await page.getByRole('button', { name: '暗色', exact: true }).click();
  await selectParagraph(page);
  await page.screenshot({ path: testInfo.outputPath('writing-dark-selected.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

 });
}
