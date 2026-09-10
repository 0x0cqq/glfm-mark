/**
 * 视觉对比测试：把 MkDocs Material 参考页与编辑器预览并排截图。
 *
 * 使用同一字体、宽度、亮暗主题和固定视口，截图保存到
 * `tests/visual/__screenshots__/` 供人工检查。
 *
 * 运行前需要：
 * - `npm run dev`（演示页，默认 5173）
 * - MkDocs 站点静态服务（`examples/mkdocs/site`，默认 8020）
 */
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DEMO_URL = process.env.GLFM_DEMO_URL ?? 'http://localhost:5173/';
const MATERIAL_URL = process.env.GLFM_MATERIAL_URL ?? 'http://127.0.0.1:8020/material-reference/';
const OUTPUT_DIR = resolve(process.cwd(), 'tests/visual/__screenshots__');

mkdirSync(OUTPUT_DIR, { recursive: true });

/** 关闭动画，保证截图稳定。 */
const DISABLE_ANIMATIONS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

test.describe('Material 视觉对比', () => {
  test('亮色主题下编辑器与 Material 参考页结构一致', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });

    // Material 参考页。
    await page.goto(MATERIAL_URL);
    await page.addStyleTag({ content: DISABLE_ANIMATIONS });
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'material-reference-light.png'),
      fullPage: true,
    });

    const material = page.locator('.md-typeset');
    await expect(material.locator('.admonition.note')).toHaveCount(1);
    await expect(material.locator('.admonition.warning')).toHaveCount(1);
    await expect(material.locator('table')).toHaveCount(2);
    await expect(material.locator('details')).toHaveCount(1);
    await expect(material.locator('.katex').first()).toBeVisible();

    // 编辑器演示页：切到预览模式。
    await page.goto(DEMO_URL);
    await page.addStyleTag({ content: DISABLE_ANIMATIONS });
    await page.getByTestId('toolbar-mode-preview').click();
    await expect(page.getByTestId('preview-content').locator('.admonition.note')).toHaveCount(1);
    await expect(page.getByTestId('preview-content').locator('.admonition.warning')).toHaveCount(1);
    await expect(page.getByTestId('preview-content').locator('.katex').first()).toBeVisible();

    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'editor-preview-light.png'),
      fullPage: true,
    });
  });

  test('暗色主题下两者都跟随 slate 配色', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto(MATERIAL_URL);
    await page.addStyleTag({ content: DISABLE_ANIMATIONS });
    await page.evaluate(() => {
      document.body.setAttribute('data-md-color-scheme', 'slate');
    });
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'material-reference-dark.png'),
      fullPage: true,
    });

    await page.goto(DEMO_URL);
    await page.addStyleTag({ content: DISABLE_ANIMATIONS });
    await page.getByTestId('toolbar-mode-preview').click();
    await expect(page.getByTestId('preview-content')).toBeVisible();
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'editor-preview-dark.png'),
      fullPage: true,
    });
  });

  test('窄屏下编辑器与参考页都不溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const [url, name] of [
      [MATERIAL_URL, 'material-reference-mobile.png'],
      [DEMO_URL, 'editor-preview-mobile.png'],
    ] as const) {
      await page.goto(url);
      await page.addStyleTag({ content: DISABLE_ANIMATIONS });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: resolve(OUTPUT_DIR, name), fullPage: true });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
});
