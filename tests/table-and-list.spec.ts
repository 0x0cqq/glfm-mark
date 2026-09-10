/**
 * 表格、列表与提示块的编辑命令测试。
 *
 * jsdom 没有真实布局与选区，因此用 ProseMirror 位置直接设置选区，
 * 只验证命令效果与导出结果。
 */
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import GlfmEditor from '../src/components/GlfmEditor.vue';
import type { DocumentContext, EditorServices } from '../src/core/types';
import { createFixtureRenderer } from './fixtures/renderer';
import { resetSourceIdCounter } from '../src/source/source-id';

const renderer = createFixtureRenderer();

const context: DocumentContext = {
  documentId: 'doc',
  linkBaseUrl: 'https://example.com/docs/',
  assetBaseUrl: 'https://example.com/docs/assets/',
};

const services: EditorServices = {
  renderMarkdown: async ({ markdown }) => renderer.render(markdown),
};

/** 挂载编辑器并等待导入完成。 */
async function mountEditor(markdown: string) {
  resetSourceIdCounter();
  const wrapper = mount(GlfmEditor, {
    props: { modelValue: markdown, context, services },
    attachTo: document.body,
  });

  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="status-importing"]').exists()).toBe(false);
  });

  return wrapper;
}

/** 取得编辑器实例。 */
function editorOf(wrapper: ReturnType<typeof mount>): Editor {
  return (wrapper.vm as unknown as { editor: Editor }).editor;
}

/** 取得组件暴露的 Markdown。 */
function markdownOf(wrapper: ReturnType<typeof mount>): string {
  return (wrapper.vm as unknown as { getMarkdown(): string }).getMarkdown();
}

/** 找到第 `index` 个指定类型节点的内容位置，可直接用于设置选区。 */
function findContentPos(editor: Editor, typeName: string, index = 0): number {
  let seen = 0;
  let found = -1;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return found < 0;
    if (seen === index) {
      found = pos + 1;
      return false;
    }
    seen += 1;
    return true;
  });

  if (found < 0) throw new Error(`文档中没有第 ${index} 个 ${typeName}`);
  return found;
}

/** 把光标放到指定位置（不触发 DOM 焦点）。 */
function cursorAt(editor: Editor, pos: number): void {
  editor.commands.setTextSelection(pos);
}

/** 取第一个表格节点。 */
function tableOf(editor: Editor): ProseMirrorNode {
  let table: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node) => {
    if (!table && node.type.name === 'table') table = node;
    return !table;
  });
  if (!table) throw new Error('文档中没有表格');
  return table;
}

describe('表格编辑', () => {
  const markdown = ['| 列一 | 列二 |', '| --- | --- |', '| a | b |', '| c | d |', ''].join('\n');

  it('导入后表格结构与原文一致', async () => {
    const wrapper = await mountEditor(markdown);
    const editor = editorOf(wrapper);

    expect(tableOf(editor).childCount).toBe(3);
    expect(markdownOf(wrapper)).toBe(markdown);
    wrapper.unmount();
  });

  it('在表格中插入与删除行', async () => {
    const wrapper = await mountEditor(markdown);
    const editor = editorOf(wrapper);

    cursorAt(editor, findContentPos(editor, 'tableHeader') + 1);
    await nextTick();
    expect(editor.isActive('table')).toBe(true);

    editor.commands.addRowAfter();
    await nextTick();
    expect(tableOf(editor).childCount).toBe(4);

    editor.commands.deleteRow();
    await nextTick();
    expect(tableOf(editor).childCount).toBe(3);
    wrapper.unmount();
  });

  it('插入与删除列', async () => {
    const wrapper = await mountEditor(markdown);
    const editor = editorOf(wrapper);

    cursorAt(editor, findContentPos(editor, 'tableHeader') + 1);
    await nextTick();

    editor.commands.addColumnAfter();
    await nextTick();
    expect(tableOf(editor).child(0).childCount).toBe(3);

    editor.commands.deleteColumn();
    await nextTick();
    expect(tableOf(editor).child(0).childCount).toBe(2);
    wrapper.unmount();
  });

  it('设置列对齐后导出带对齐标记的分隔行', async () => {
    const wrapper = await mountEditor(markdown);
    const editor = editorOf(wrapper);

    cursorAt(editor, findContentPos(editor, 'tableHeader') + 1);
    await nextTick();

    const toolbar = wrapper.findComponent({ name: 'GlfmToolbar' });
    toolbar.vm.$emit('table-action', 'align-center');
    await nextTick();

    // 列宽 3 时居中标记为 `:-:`。
    expect(markdownOf(wrapper)).toMatch(/\|\s*:-:\s*\|/);
    wrapper.unmount();
  });

  it('删除表格后不再输出表格源码', async () => {
    const wrapper = await mountEditor(markdown);
    const editor = editorOf(wrapper);

    cursorAt(editor, findContentPos(editor, 'tableHeader') + 1);
    const toolbar = wrapper.findComponent({ name: 'GlfmToolbar' });
    toolbar.vm.$emit('table-action', 'delete-table');
    await nextTick();

    expect(markdownOf(wrapper)).not.toContain('| 列一 |');
    wrapper.unmount();
  });
});

describe('列表缩进', () => {
  const markdown = ['- 项目一', '- 项目二', '- 项目三', ''].join('\n');

  it('缩进与取消缩进第二个列表项', async () => {
    const wrapper = await mountEditor(markdown);
    const editor = editorOf(wrapper);

    cursorAt(editor, findContentPos(editor, 'paragraph', 1) + 1);
    await nextTick();

    expect(editor.commands.sinkListItem('listItem')).toBe(true);
    await nextTick();
    expect(markdownOf(wrapper)).toContain('  - 项目二');

    expect(editor.commands.liftListItem('listItem')).toBe(true);
    await nextTick();
    expect(markdownOf(wrapper)).toBe(markdown);
    wrapper.unmount();
  });
});

describe('提示块类型切换', () => {
  it('切换类型并导出大写标记', async () => {
    const markdown = ['> [!NOTE]', '> 正文。', ''].join('\n');
    const wrapper = await mountEditor(markdown);
    const editor = editorOf(wrapper);

    cursorAt(editor, findContentPos(editor, 'paragraph') + 1);
    await nextTick();
    expect(editor.isActive('alert')).toBe(true);
    expect(editor.getAttributes('alert').type).toBe('note');

    const toolbar = wrapper.findComponent({ name: 'GlfmToolbar' });
    toolbar.vm.$emit('change-alert-type', 'warning');
    await nextTick();

    expect(markdownOf(wrapper)).toContain('[!WARNING]');
    wrapper.unmount();
  });

  it('自定义标题在切换类型后保留', async () => {
    const custom = ['> [!WARNING] 数据删除', '> 不可恢复。', ''].join('\n');
    const wrapper = await mountEditor(custom);
    const editor = editorOf(wrapper);

    cursorAt(editor, findContentPos(editor, 'paragraph') + 1);
    const toolbar = wrapper.findComponent({ name: 'GlfmToolbar' });
    toolbar.vm.$emit('change-alert-type', 'caution');
    await nextTick();

    expect(markdownOf(wrapper)).toContain('[!CAUTION] 数据删除');
    wrapper.unmount();
  });
});

describe('模式视图切换', () => {
  it('源码与预览模式互斥显示', async () => {
    const wrapper = await mountEditor('# 标题\n');

    await wrapper.find('[data-testid="toolbar-mode-source"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="source-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor-content"]').isVisible()).toBe(false);

    await wrapper.find('[data-testid="toolbar-mode-preview"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="source-editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="preview-content"]').exists()).toBe(true);

    await wrapper.find('[data-testid="toolbar-mode-wysiwyg"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="editor-content"]').isVisible()).toBe(true);
    wrapper.unmount();
  });
});
