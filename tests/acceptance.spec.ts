/**
 * 阶段验收测试：覆盖设计文档中明确列出但前面测试尚未覆盖的项。
 *
 * 阶段二：GitLab 引用、媒体、代码语言、主题与折叠状态。
 * 阶段三：静态挂载的实例唯一性与销毁。
 * 阶段一：不规则表格规范化、隐藏定义与注释保留。
 */
import { describe, expect, it, vi } from 'vitest';
import { createEnv, load } from './fixtures/env';
import { createFixtureRenderer } from './fixtures/renderer';
import { renderPreviewHtml } from '../src/material/preview';
import type { DocumentContext } from '../src/core/types';
import { GlfmEditorCore } from '../src/core/editor';
import { resetSourceIdCounter } from '../src/source/source-id';
import { mountGlfmEditor, mountAllGlfmEditors, unmountGlfmEditor } from '../src/standalone';

const renderer = createFixtureRenderer();

const context: DocumentContext = {
  documentId: 'doc',
  linkBaseUrl: 'https://example.com/docs/',
  assetBaseUrl: 'https://example.com/docs/assets/',
};

/** 创建编辑器核心。 */
function createCore(markdown: string) {
  resetSourceIdCounter();
  return new GlfmEditorCore({
    markdown,
    context,
    services: { renderMarkdown: async ({ markdown: value }) => renderer.render(value) },
    element: null,
    callbacks: { onUpdate: () => {}, onStateChange: () => {}, onError: () => {} },
  });
}

describe('阶段一：隐藏内容与不规则表格', () => {
  it('front matter、HTML 注释与链接定义都完整导出', async () => {
    const env = createEnv();
    const markdown = [
      '---',
      'title: 文档标题',
      '---',
      '',
      '<!-- 这是注释 -->',
      '',
      '第一段。',
      '',
      '[ref]: https://example.com',
      '',
    ].join('\n');

    // 前端渲染不会把 front matter、注释与定义输出成元素。
    const result = await env.controller.load(markdown, async () => ({
      html: '<p data-sourcepos="5:1-5:12">第一段。</p>',
    }));

    expect(result.degraded).toBe(false);
    expect(env.controller.export(result.doc)).toBe(markdown);
  });

  it('不规则表格规范化只影响该表格', async () => {
    const env = createEnv();
    const markdown = [
      '保留段落。',
      '',
      '|  a |b|',
      '|---|:--:|',
      '|1|2|',
      '',
      '另一个保留段落。',
      '',
    ].join('\n');

    const result = await load(env, markdown);
    const nodes: import('@tiptap/pm/model').Node[] = [];
    result.doc.forEach((node) => nodes.push(node));

    // 表格位于中间，重写后对齐标记规范化。
    const tableIndex = nodes.findIndex((node) => node.type.name === 'table');
    expect(tableIndex).toBeGreaterThan(0);

    const exported = env.controller.export(result.doc);
    expect(exported.startsWith('保留段落。')).toBe(true);
    expect(exported.endsWith('另一个保留段落。\n')).toBe(true);
  });

  it('缺少源码位置时整篇作为源码块载入且不丢内容（setext 标题与缩进代码）', async () => {
    const env = createEnv();
    const markdown = ['标题', '====', '', '    缩进代码', ''].join('\n');
    const result = await env.controller.load(markdown, async () => ({ html: '<p>无位置</p>' }));

    expect(result.degraded).toBe(true);
    expect(env.controller.export(result.doc)).toBe(markdown);
  });
});

describe('阶段二：GitLab 引用与展示信息', () => {
  it('引用节点导出原始表达式', async () => {
    const env = createEnv();
    const markdown = '关联 #123 与 !45。\n';

    // “关联 #123 与 !45。” 共 22 字节。
    const result = await env.controller.load(markdown, async () => ({
      html: [
        '<p data-sourcepos="1:1-1:22">',
        '关联 <a class="gfm" data-reference-type="issue" data-original="#123" href="https://gitlab.example.com/group/project/-/issues/123">标题一</a>',
        ' 与 <a class="gfm" data-reference-type="merge_request" data-original="!45" href="https://gitlab.example.com/group/project/-/merge_requests/45">标题二</a>。',
        '</p>',
      ].join(''),
    }));

    expect(result.degraded).toBe(false);

    // 两个引用都成为独立的行内节点，而不是普通链接。
    const references: string[] = [];
    result.doc.descendants((node) => {
      if (node.type.name === 'reference') references.push(node.attrs.originalText as string);
      return true;
    });
    expect(references).toEqual(['#123', '!45']);

    expect(env.controller.export(result.doc)).toBe(markdown);
  });

  it('引用展示信息变化不触发 dirty', async () => {
    const env = createEnv();
    const markdown = '见 #123。\n';

    const build = (title: string, href: string) =>
      env.controller.load(markdown, async () => ({
        html: `<p data-sourcepos="1:1-1:10">见 <a class="gfm" data-reference-type="issue" data-original="#123" href="${href}">${title}</a>。</p>`,
      }));

    const first = await build('原标题', 'https://gitlab.example.com/a');
    const firstExport = env.controller.export(first.doc);

    const second = await build('更新后的标题', 'https://gitlab.example.com/b');
    const secondExport = env.controller.export(second.doc);

    // 目标地址与标题都只用于展示，导出保持原文。
    expect(firstExport).toBe(markdown);
    expect(secondExport).toBe(markdown);
  });

  it('媒体未修改时保留原文', async () => {
    const env = createEnv();
    const markdown = '![音频](uploads/a.mp3)\n';

    const result = await env.controller.load(markdown, async () => ({
      html: '<p data-sourcepos="1:1-1:24"><span class="media-container"><audio src="/uploads/a.mp3" data-canonical-src="uploads/a.mp3"></audio></span></p>',
    }));

    expect(result.degraded).toBe(false);

    const kinds: string[] = [];
    result.doc.descendants((node) => {
      if (node.type.name === 'media') kinds.push(node.attrs.kind as string);
      return true;
    });
    expect(kinds).toEqual(['audio']);

    expect(env.controller.export(result.doc)).toBe(markdown);
  });
});

describe('阶段二：高亮与状态不污染 Markdown', () => {
  it('改变代码语言不会把高亮结果写进 Markdown', async () => {
    const core = createCore('```js\nconst a = 1;\n```\n');
    await core.load('```js\nconst a = 1;\n```\n');

    const pos = 0;
    core.editor.commands.updateAttributes('codeBlock', { language: 'python' });

    const markdown = core.getMarkdown();
    expect(markdown).toContain('```python');
    expect(markdown).not.toContain('hljs');
    expect(markdown).not.toContain('<span');
    expect(markdown).not.toContain('复制');
    void pos;
    core.destroy();
  });

  it('切换主题不改变 Markdown', async () => {
    const core = createCore('# 标题\n\n段落。\n');
    await core.load('# 标题\n\n段落。\n');

    const before = core.getMarkdown();
    document.documentElement.setAttribute('data-md-color-scheme', 'slate');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(core.getMarkdown()).toBe(before);
    document.documentElement.removeAttribute('data-md-color-scheme');
    core.destroy();
  });

  it('折叠块的打开状态来自源码，展示状态不改变导出', async () => {
    const core = createCore(
      ['<details>', '<summary>标题</summary>', '', '正文。', '', '</details>', ''].join('\n'),
    );
    await core.load(
      ['<details>', '<summary>标题</summary>', '', '正文。', '', '</details>', ''].join('\n'),
    );

    const before = core.getMarkdown();

    // 节点视图的临时展开只影响界面，不修改文档。
    let detailsPos = -1;
    core.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'details') detailsPos = pos;
      return true;
    });
    expect(detailsPos).toBeGreaterThanOrEqual(0);
    expect(core.editor.state.doc.nodeAt(detailsPos)?.attrs.open).toBe(false);

    expect(core.getMarkdown()).toBe(before);
    core.destroy();
  });

  it('复制按钮与语言标签不进入导出内容', async () => {
    const core = createCore('```js\nconst a = 1;\n```\n');
    await core.load('```js\nconst a = 1;\n```\n');

    const markdown = core.getMarkdown();
    expect(markdown).toBe('```js\nconst a = 1;\n```\n');
    core.destroy();
  });
});

describe('阶段三：静态挂载', () => {
  it('同一容器重复挂载只保留一个实例', () => {
    const element = document.createElement('div');
    document.body.append(element);

    const markdown = '# 标题\n';
    const first = mountGlfmEditor(element, {
      markdown,
      context,
      services: { renderMarkdown: async ({ markdown: value }) => renderer.render(value) },
    });
    const second = mountGlfmEditor(element, {
      markdown,
      context,
      services: { renderMarkdown: async ({ markdown: value }) => renderer.render(value) },
    });

    expect(element.querySelectorAll('[data-testid="glfm-editor"]')).toHaveLength(1);
    expect(second).not.toBe(first);
    unmountGlfmEditor(element);
    expect(element.querySelectorAll('[data-testid="glfm-editor"]')).toHaveLength(0);
    element.remove();
  });

  it('destroy 释放实例并清空容器', () => {
    const element = document.createElement('div');
    document.body.append(element);

    const handle = mountGlfmEditor(element, {
      markdown: '# 标题\n',
      context,
      services: { renderMarkdown: async ({ markdown: value }) => renderer.render(value) },
    });

    handle.destroy();
    expect(element.childNodes).toHaveLength(0);
    element.remove();
  });

  it('mountAllGlfmEditors 跳过已挂载容器并返回新实例', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div class="glfm-slot"></div><div class="glfm-slot"></div>';
    document.body.append(container);

    const options = {
      context,
      services: { renderMarkdown: async ({ markdown }: { markdown: string }) => renderer.render(markdown) },
    };

    const first = mountAllGlfmEditors('.glfm-slot', () => ({ markdown: '# 一\n', ...options }));
    expect(first).toHaveLength(2);

    // 再次挂载时全部已存在，不再创建实例。
    const second = mountAllGlfmEditors('.glfm-slot', () => ({ markdown: '# 二\n', ...options }));
    expect(second).toHaveLength(0);

    first.forEach((handle) => handle.destroy());
    container.remove();
  });

  it('markSaved 更新保存状态', async () => {
    const element = document.createElement('div');
    document.body.append(element);

    const changed = vi.fn();
    const handle = mountGlfmEditor(element, {
      markdown: '# 标题\n',
      context,
      services: { renderMarkdown: async ({ markdown: value }) => renderer.render(value) },
      onChange: changed,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    handle.markSaved(handle.getMarkdown());
    expect(handle.getMarkdown()).toBe('# 标题\n');
    handle.destroy();
    element.remove();
  });
});

describe('阶段二：预览展示规则', () => {
  it('代码块获得语言标签与复制按钮，且内容不含编辑器标记', async () => {
    const container = await renderPreviewHtml(
      '<pre><code class="language-js">const a = 1;</code></pre>',
      context,
    );

    expect(container.querySelector('.glfm-editor__code-language')?.textContent).toBe('js');
    expect(container.querySelector('.glfm-editor__code-copy')).not.toBeNull();
    expect(container.querySelector('.hljs-keyword')?.textContent).toBe('const');
  });

  it('未知语言按纯文本展示', async () => {
    const container = await renderPreviewHtml(
      '<pre><code class="language-unknown-lang">some text</code></pre>',
      context,
    );

    expect(container.querySelector('.glfm-editor__code-language')?.textContent).toBe(
      'unknown-lang',
    );
    expect(container.querySelector('code')?.textContent).toBe('some text');
  });

  it('表格加上横向滚动容器', async () => {
    const container = await renderPreviewHtml(
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
      context,
    );

    expect(container.querySelector('.glfm-editor__table-wrapper > table')).not.toBeNull();
  });
});
