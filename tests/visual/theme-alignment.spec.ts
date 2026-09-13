/** 在真正的 MkDocs Material 宿主中比较正文排版，并验证主题与展示状态不写入源码。 */
import { expect, test } from '@playwright/test';

const markdown = '# 标题\n\n段落文字\n\n## 二级\n\n> 引用\n\n- 列表\n\n| 标题 |\n| --- |\n| 值 |\n\n> [!NOTE]\n> 提示正文\n\n<details>\n<summary>展开</summary>\n\n正文\n\n</details>\n';
const reference = '<h1>标题</h1><p>段落文字</p><h2>二级</h2><blockquote><p>引用</p></blockquote><ul><li>列表</li></ul><table><thead><tr><th>标题</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table><div class="admonition note"><p class="admonition-title">Note</p><p>提示正文</p></div><details open><summary>展开</summary><p>正文</p></details>';

for (const scheme of ['default', 'slate']) {
  test(`Material ${scheme} 的编辑与预览沿用宿主排版`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${process.env.GLFM_SITE_URL ?? 'http://127.0.0.1:8020'}/editor-offline/`);
    await expect(page.locator('.ProseMirror h1')).toBeVisible();
    await expect(page.getByTestId('editor-gutter').locator('button').first()).toBeVisible();
    await page.evaluate(({ scheme, reference }) => {
      document.body.dataset.mdColorScheme = scheme;
      const root = document.createElement('div');
      root.id = 'alignment-reference'; root.innerHTML = reference;
      document.querySelector('.md-content__inner')!.append(root);
    }, { scheme, reference });
    await page.getByTestId('toolbar-mode-source').click();
    await page.getByTestId('source-editor').fill(markdown);
    await page.getByTestId('toolbar-mode-wysiwyg').click();
    await expect(page.locator('.ProseMirror h1')).toHaveText('标题');
    for (const mode of ['wysiwyg', 'preview']) {
      if (mode === 'preview') await page.getByTestId('toolbar-mode-preview').click();
      await page.locator('#alignment-reference details').evaluate((node, open) => (node as HTMLDetailsElement).open = open, mode === 'wysiwyg');
      const selector = mode === 'wysiwyg' ? '.ProseMirror' : '.glfm-editor__preview';
      await expect(page.locator(`${selector} .admonition`)).toBeVisible();
      const differences = await page.evaluate((selector) => {
        const properties = ['fontSize', 'fontWeight', 'lineHeight', 'color', 'marginTop', 'marginBottom', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderColor', 'backgroundColor', 'borderRadius'] as const;
        return ['h1', 'h2', 'p', 'blockquote', 'ul', 'table', 'th', 'td', '.admonition', '.admonition-title', 'details', 'summary'].flatMap((tag) => {
          const expected = getComputedStyle(document.querySelector(`#alignment-reference ${tag}`)!);
          const actual = getComputedStyle(document.querySelector(`${selector} ${tag}`)!);
          return properties.filter((key) => expected[key] !== actual[key]).map((key) => `${tag} ${key}: ${actual[key]} / ${expected[key]}`);
        });
      }, selector);
      expect(differences).toEqual([]);
      await page.locator(`${selector} h1`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${mode}-${scheme}.png`) });
    }
    await page.getByTestId('toolbar-mode-wysiwyg').click();
    const details = page.locator('.ProseMirror details');
    await details.getByRole('button', { name: '展开或收起折叠块' }).click();
    await expect(details).not.toHaveAttribute('open');
    await page.getByTestId('toolbar-mode-source').click();
    await expect(page.getByTestId('source-editor')).toHaveValue(markdown);
    expect(errors).toEqual([]);
  });
}

test('静态挂载中切换 Modern 外观保留编辑历史与完整工具', async ({ page }, testInfo) => {
  await page.goto(`${process.env.GLFM_SITE_URL ?? 'http://127.0.0.1:8020'}/editor-offline/`);
  await expect(page.locator('.ProseMirror h1')).toBeVisible();
  await page.getByLabel('编辑器外观').selectOption('modern');
  await expect(page.getByTestId('glfm-editor')).toHaveAttribute('data-theme', 'modern');
  await expect(page.getByLabel('插入内容', { exact: true })).toHaveCSS('display', 'inline-flex');
  await page.locator('.ProseMirror > p').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await expect(page.getByTestId('selection-toolbar')).toBeVisible();
  await page.getByTestId('selection-bold').click();
  await expect(page.locator('.glfm-editor__save-state')).toHaveText('未保存的修改');
  await page.screenshot({ path: testInfo.outputPath('modern-material-host-light.png') });
  await page.evaluate(() => document.body.dataset.mdColorScheme = 'slate');
  await page.screenshot({ path: testInfo.outputPath('modern-material-host-dark.png') });
  await page.getByLabel('编辑器外观').selectOption('material');
  await expect(page.getByTestId('glfm-editor')).toHaveAttribute('data-theme', 'material');
  await page.getByTestId('toolbar-undo').click();
  await expect(page.locator('.glfm-editor__save-state')).toHaveText('内容未修改');
  await expect(page.getByTestId('editor-gutter').locator('button').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
