/** 从真实 Markdown 导入后修改，验证本地语义与局部保真。 */
import { describe, expect, it, vi } from 'vitest';
import { createEnv, load } from './fixtures/env';
import { EditorState } from '@tiptap/pm/state';
import { renderMarkdown } from '../src/glfm/render';
import { GlfmEditorCore } from '../src/core/editor';

describe('浏览器本地 GLFM', () => {
  it.each([
    ['- [x] **完成**\n  - *嵌套*\n- [ ] 待办', 'taskList', '完成嵌套待办'],
    ['> [!NOTE]\n> **重要**与[链接](./a)\n>\n> 第二段', 'alert', 'Note重要与链接第二段'],
    ['<details>\n<summary>**标题**</summary>\n\n正文 *强调*\n\n</details>', 'details', '标题正文 强调'],
    ['>>>\n**多行**\n\n引用\n>>>', 'blockquote', '多行引用'],
    ['```math\nx^2\n```', 'mathBlock', 'x^2\n'],
    ['$$\nx^2\n$$', 'mathBlock', 'x^2'],
    ['```mermaid\ngraph TD\nA-->B\n```', 'mermaidBlock', 'graph TD\nA-->B\n'],
  ])('%s 可结构化编辑', async (markdown, type, text) => {
    const env = createEnv();
    const result = await load(env, markdown);
    expect(result.degraded).toBe(false);
    expect(result.doc.firstChild?.type.name).toBe(type);
    expect(result.doc.textContent).toBe(text);
    expect(env.controller.export(result.doc)).toBe(markdown);
  });

  it('修改提示正文保留格式、嵌套引用与其他块', async () => {
    const env = createEnv();
    const result = await load(env, '> [!NOTE]\n> **重要**\n>\n> > 引用\n\n保留\t段落\r\n');
    let position = 0;
    result.doc.descendants((node, pos) => { if (node.isText && node.text === '重要') position = pos; });
    const state = EditorState.create({ doc: result.doc });
    const edited = state.apply(state.tr.insertText('更', position));
    const markdown = env.controller.export(edited.doc);
    expect(markdown).toContain('**更重要**');
    expect(markdown).toContain('> > 引用');
    expect(markdown).toContain('保留\t段落\r\n');
    const reloaded = await load(createEnv(), markdown);
    expect(reloaded.doc.textContent).toContain('更重要');
  });

  it('数学、引用、Emoji 和媒体在同段编辑后保留专用语义', async () => {
    const env = createEnv();
    const source = '公式 $x^2$ 与 $`y`$ @alice #12 !34 :smile: ![录音](./a.mp3) ![图](./a.png){width=50%}';
    const result = await load(env, source);
    const types: string[] = [];
    result.doc.descendants((node) => { types.push(node.type.name); });
    for (const type of ['mathInline', 'reference', 'emoji', 'media', 'image']) expect(types).toContain(type);
    const state = EditorState.create({ doc: result.doc });
    const out = env.controller.export(state.apply(state.tr.insertText('新', 1)).doc);
    expect(out).toContain('$x^2$');
    expect(out).toContain('$`y`$');
    expect(out).toContain(':smile:');
    expect(out).toContain('![录音](./a.mp3)');
    expect(out).toContain('width="50%"');
  });

  it('未知 HTML 和隐藏定义是可修改源码，不执行危险标签', async () => {
    const env = createEnv();
    const source = '---\ntitle: 示例\n---\n\n<script>alert(1)</script>\n\n正文 <kbd>X</kbd>\n\n[ref]: ./a\n\n[链接][ref]\n\n# 正常';
    const result = await load(env, source);
    const names: string[] = [];
    result.doc.forEach((node) => names.push(node.type.name));
    expect(names.filter((name) => name === 'sourceBlock').length).toBeGreaterThanOrEqual(4);
    expect(names.at(-1)).toBe('heading');
    expect(env.controller.export(result.doc)).toBe(source);
    expect((await renderMarkdown(source)).html).not.toContain('<script>');
  });

  it('未闭合 details 保留源码，闭合嵌套 details 不吞掉后续段落', async () => {
    const env = createEnv();
    const open = await load(env, '<details>\n<summary>标题</summary>\n正文');
    expect(open.doc.firstChild?.type.name).toBe('sourceBlock');
    const closed = await load(env, '<details>\n<summary>外层</summary>\n<details>\n<summary>内层</summary>\n内容\n</details>\n</details>\n\n结尾');
    expect(closed.doc.firstChild?.type.name).toBe('details');
    expect(closed.doc.lastChild?.textContent).toBe('结尾');
  });

  it('源码经过预览再回编辑仍保留修改和 dirty，全流程不请求网络', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('禁止网络'));
    const core = new GlfmEditorCore({ markdown: '# 初始', context: { documentId: 'local', linkBaseUrl: 'https://example.com/', assetBaseUrl: 'https://example.com/' }, callbacks: { onUpdate() {}, onStateChange() {}, onError() {} } });
    try {
      await core.load('# 初始');
      await core.setMode('source');
      core.setSourceMarkdown('## 中文 😀\n\n新内容');
      await core.setMode('preview');
      expect(await core.requestPreview()).toContain('中文 😀');
      await core.setMode('wysiwyg');
      expect(core.editor.state.doc.firstChild?.attrs.level).toBe(2);
      expect(core.getState().dirty).toBe(true);
      expect(core.getMarkdown()).toContain('新内容');
      expect(fetch).not.toHaveBeenCalled();
    } finally { core.destroy(); fetch.mockRestore(); }
  });
});
