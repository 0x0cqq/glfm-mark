/**
 * 视觉对比测试：把 MkDocs Material 参考页与编辑器并排截图。
 *
 * 使用同一字体、宽度、亮暗主题与固定视口，截图保存到
 * `tests/visual/__screenshots__/` 供人工检查。
 *
 * 运行前需要：
 * - 演示页 `npm run dev`（默认 5173）
 * - MkDocs 站点静态服务（`examples/mkdocs/site`，默认 8020）
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DEMO_URL = process.env.GLFM_DEMO_URL ?? 'http://localhost:5173/';
const SITE_URL = process.env.GLFM_SITE_URL ?? 'http://127.0.0.1:8020';
const MATERIAL_URL = `${SITE_URL}/material-reference/`;
const OFFLINE_URL = `${SITE_URL}/editor-offline/`;
const OUTPUT_DIR = resolve(process.cwd(), 'tests/visual/__screenshots__');

mkdirSync(OUTPUT_DIR, { recursive: true });

/** 禁用动画，保证截图稳定。 */
const DISABLE_ANIMATIONS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

/** 打开 Material 参考页并设置主题。 */
async function openReference(page: Page, scheme: 'default' | 'slate'): Promise<void> {
  await page.goto(MATERIAL_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.md-typeset');
  await page.addStyleTag({ content: DISABLE_ANIMATIONS });
  await page.evaluate((value) => {
    document.body.setAttribute('data-md-color-scheme', value);
    document.documentElement.setAttribute('data-md-color-scheme', value);
  }, scheme);
}

/** 打开 MkDocs 中的编辑器离线示例并设置主题。 */
async function openOfflineEditor(page: Page, scheme: 'default' | 'slate'): Promise<void> {
  await page.goto(OFFLINE_URL, { waitUntil: 'domcontentloaded' });
  // 容器挂载前高度为 0，因此等“已挂载”而不是“可见”，再等编辑器内容就绪。
  await page.waitForSelector('[data-testid="glfm-editor"]', {
    state: 'attached',
    timeout: 60_000,
  });
  await page.addStyleTag({ content: DISABLE_ANIMATIONS });
  await page.evaluate((value) => {
    document.body.setAttribute('data-md-color-scheme', value);
    document.documentElement.setAttribute('data-md-color-scheme', value);
  }, scheme);
  await page.waitForSelector('[data-testid="editor-content"] .ProseMirror');
}

test.describe('Material 视觉对比', () => {
  test('亮色主题下编辑器与 Material 参考页结构一致', async ({ page }) => {
    await openReference(page, 'default');
    const reference = page.locator('.md-typeset');
    await expect(reference.locator('.admonition.note')).toHaveCount(1);
    await expect(reference.locator('.admonition.warning')).toHaveCount(1);
    await expect(reference.locator('details')).toHaveCount(1);
    // KaTeX 由页面脚本异步渲染，放宽等待时间。
    await expect(reference.locator('.katex').first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'material-reference-light.png'),
      fullPage: true,
    });

    await openOfflineEditor(page, 'default');
    const editor = page.locator('[data-testid="glfm-editor"]');
    await editor.scrollIntoViewIfNeeded();
    // 编辑器与参考页使用相同的语义结构。
    await expect(editor.locator('.markdown-alert-note')).toHaveCount(1);
    await expect(editor.locator('.markdown-alert-warning')).toHaveCount(1);
    await expect(editor.locator('table')).toHaveCount(1);
    // 行内公式与块级公式都由 KaTeX 渲染（按需加载，放宽等待时间）。
    await expect(editor.locator('.katex').first()).toBeVisible({ timeout: 15_000 });
    await expect(editor.locator('.ProseMirror details')).toHaveCount(1);
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'editor-light.png'),
      fullPage: true,
    });
  });

  test('暗色主题下两者都跟随 slate 配色', async ({ page }) => {
    await openReference(page, 'slate');
    await expect(page.locator('body')).toHaveAttribute('data-md-color-scheme', 'slate');
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'material-reference-dark.png'),
      fullPage: true,
    });

    await openOfflineEditor(page, 'slate');
    const editor = page.locator('[data-testid="glfm-editor"]');
    await editor.scrollIntoViewIfNeeded();

    // 编辑器继承宿主主题变量。
    const background = await editor.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--md-default-bg-color').trim(),
    );
    expect(background).not.toBe('');
    expect(background).not.toBe('#ffffff');
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'editor-dark.png'),
      fullPage: true,
    });
  });

  test('窄屏下编辑器与参考页都不溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await openReference(page, 'default');
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'material-reference-mobile.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);

    await openOfflineEditor(page, 'default');
    const editor = page.locator('[data-testid="glfm-editor"]');
    await editor.scrollIntoViewIfNeeded();

    // 只有表格、长代码与公式容器按需横向滚动。
    const overflowing = await editor.evaluate((element) => {
      // 只允许表格、长代码与公式容器按需横向滚动。
      const allowed = [
        'table',
        '.glfm-editor__math',
        '.glfm-editor__math-node',
        '.glfm-editor__code-block',
        'pre',
      ];
      return [...element.querySelectorAll('*')]
        .filter(
          (node) =>
            // 1px 视觉隐藏元素（如任务列表的无障碍标签）不参与布局检查。
            node.clientWidth > 1 &&
            node.scrollWidth > node.clientWidth + 1 &&
            !allowed.some((selector) => node.matches(selector) || node.closest(selector)),
        )
        .map((node) => (node as HTMLElement).className || node.tagName)
        .slice(0, 5);
    });
    expect(overflowing).toEqual([]);
    // Material 原生表格本身是滚动容器，必须局限于编辑器内。
    await expect(editor.locator('.ProseMirror table')).toHaveCSS('overflow-x', 'auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'editor-mobile.png'),
      fullPage: true,
    });
  });

  test('独立演示页在亮色与暗色下都能渲染预览', async ({ page }) => {
    await page.goto(DEMO_URL);
    await page.addStyleTag({ content: DISABLE_ANIMATIONS });
    await page.getByTestId('toolbar-mode-preview').click();
    await expect(page.getByTestId('preview-content').locator('.admonition.note')).toHaveCount(1);
    await expect(page.getByTestId('preview-content').locator('.katex').first()).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'editor-preview-light.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: '暗色' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-md-color-scheme', 'slate');
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'editor-preview-dark.png'),
      fullPage: true,
    });
  });
});
