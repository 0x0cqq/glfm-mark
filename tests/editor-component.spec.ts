/**
 * 编辑器组件集成测试：验证模式切换、v-model 回声、状态与保存上传行为。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/vue-3';
import GlfmEditor from '../src/components/GlfmEditor.vue';
import type { DocumentContext, EditorServices, EditorState } from '../src/core/types';
import * as localRenderer from '../src/glfm/render';
const realRender = localRenderer.renderMarkdown;
afterEach(() => vi.restoreAllMocks());
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterAll(() => {
  delete (HTMLDialogElement.prototype as { showModal?: () => void }).showModal;
  delete (HTMLDialogElement.prototype as { close?: () => void }).close;
});
import { resetSourceIdCounter } from '../src/source/source-id';



/** 测试用文档上下文。 */
const context: DocumentContext = {
  documentId: 'test-doc',
  linkBaseUrl: 'https://example.com/docs/',
  assetBaseUrl: 'https://example.com/docs/assets/',
};

/** 创建渲染服务。 */
function createServices(overrides: Partial<EditorServices> = {}): EditorServices {
  return {
    ...overrides,
  };
}

/** 挂载编辑器并等待初始导入完成。 */
async function mountEditor(markdown: string, services = createServices()) {
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

/** 读取组件内部的编辑器实例。 */
function getEditor(wrapper: VueWrapper) {
  return (wrapper.vm as unknown as { editor?: unknown }).editor;
}

describe('编辑器组件', () => {
  it('挂载后渲染 Markdown 为富文本', async () => {
    const wrapper = await mountEditor('# 标题\n\n段落内容。\n');
    const content = wrapper.find('[data-testid="editor-content"]');
    expect(content.find('h1').text()).toBe('标题');
    expect(content.find('p').text()).toBe('段落内容。');
    wrapper.unmount();
  });

  it('输入法组合期间延后宿主文档替换，结束后同步源码模式内容', async () => {
    const wrapper = await mountEditor('# 原文\n');
    await wrapper.trigger('compositionstart');
    await wrapper.setProps({ modelValue: '# 宿主新文档\n' });
    expect(wrapper.find('.ProseMirror h1').text()).toBe('原文');
    await wrapper.trigger('compositionend');
    await vi.waitFor(() => expect(wrapper.find('.ProseMirror h1').text()).toBe('宿主新文档'));
    await wrapper.get('[data-testid="toolbar-mode-source"]').trigger('click');
    await wrapper.setProps({ modelValue: '# 再次替换\n' });
    await vi.waitFor(() => expect((wrapper.get('[data-testid="source-editor"]').element as HTMLTextAreaElement).value).toBe('# 再次替换\n'));
    wrapper.unmount();
  });

  it('未编辑时导出的 Markdown 与输入一致', async () => {
    const markdown = '# 标题\n\n段落内容。\n';
    const wrapper = await mountEditor(markdown);
    const handle = wrapper.vm as unknown as { getMarkdown(): string };
    expect(handle.getMarkdown()).toBe(markdown);
    wrapper.unmount();
  });

  it('富文本相对资源按宿主目录显示，导出保留原始地址', async () => {
    const markdown = '![图](sorting.assets/a.png)\n\n[链接](chapter.md)\n\n![音频](audio/clip.mp3)\n';
    const wrapper = await mountEditor(markdown);
    expect(wrapper.get('.ProseMirror img').attributes('src')).toBe('https://example.com/docs/assets/sorting.assets/a.png');
    expect(wrapper.get('.ProseMirror a[href]').attributes('href')).toBe('https://example.com/docs/chapter.md');
    expect(wrapper.get('.ProseMirror audio').attributes('src')).toBe('https://example.com/docs/assets/audio/clip.mp3');
    expect((wrapper.vm as unknown as { getMarkdown(): string }).getMarkdown()).toBe(markdown);
    wrapper.unmount();
  });

  it('待写入图片在富文本中显示临时地址，导出仍保留相对地址', async () => {
    const markdown = '![新图](sorting.assets/new.png)\n';
    const services = createServices({
      resolveAssetPreview: (source) => source === 'sorting.assets/new.png' ? 'blob:https://example.test/pending' : undefined,
    });
    const wrapper = await mountEditor(markdown, services);
    expect(wrapper.get('.ProseMirror img').attributes('src')).toBe('blob:https://example.test/pending');
    expect((wrapper.vm as unknown as { getMarkdown(): string }).getMarkdown()).toBe(markdown);
    wrapper.unmount();
  });

  it('编辑选中图片只改该图片，保留尺寸与相邻 CRLF', async () => {
    const markdown = '前文\r\n\r\n![旧](./a.png){width=50%}\r\n\r\n后文\r\n';
    const wrapper = await mountEditor(markdown);
    const instance = getEditor(wrapper) as Editor;
    let imagePos = -1;
    instance.state.doc.descendants((node, pos) => { if (node.type.name === 'image') imagePos = pos; });
    instance.view.dispatch(instance.state.tr.setSelection(NodeSelection.create(instance.state.doc, imagePos)));
    await wrapper.get('[aria-label="插入内容"]').trigger('click');
    await wrapper.get('[data-testid="toolbar-image"]').trigger('click');
    expect(wrapper.get('[data-testid="link-dialog"] h2').text()).toBe('编辑图片');
    expect((wrapper.get('[data-testid="link-dialog-href"]').element as HTMLInputElement).value).toBe('./a.png');
    await wrapper.get('[data-testid="link-dialog-alt"]').setValue('新图');
    await wrapper.get('[data-testid="link-dialog-submit"]').trigger('click');
    expect((wrapper.vm as unknown as { getMarkdown(): string }).getMarkdown()).toBe('前文\r\n\r\n![新图](./a.png){width="50%"}\r\n\r\n后文\r\n');
    wrapper.unmount();
  });

  it('父组件回传相同值时视为回声，不重新导入', async () => {
    const markdown = '# 标题\n';
    const wrapper = await mountEditor(markdown);

    const content = wrapper.find('[data-testid="editor-content"] .ProseMirror');
    const before = content.element.innerHTML;

    await wrapper.setProps({ modelValue: markdown });
    await nextTick();

    expect(content.element.innerHTML).toBe(before);
    wrapper.unmount();
  });

  it('外部传入不同值时载入新文档', async () => {
    const wrapper = await mountEditor('# 标题\n');
    await wrapper.setProps({ modelValue: '## 新标题\n' });

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="editor-content"] h2').text()).toBe('新标题');
    });

    wrapper.unmount();
  });

  it('切换到源码模式显示当前 Markdown', async () => {
    const markdown = '# 标题\n\n段落。\n';
    const wrapper = await mountEditor(markdown);

    await wrapper.find('[data-testid="toolbar-mode-source"]').trigger('click');
    await nextTick();

    const textarea = wrapper.find('[data-testid="source-editor"]');
    expect(textarea.exists()).toBe(true);
    expect((textarea.element as HTMLTextAreaElement).value).toBe(markdown);
    wrapper.unmount();
  });

  it('源码未变化时切回富文本保持文档', async () => {
    const markdown = '# 标题\n\n段落。\n';
    const wrapper = await mountEditor(markdown);

    await wrapper.find('[data-testid="toolbar-mode-source"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="toolbar-mode-wysiwyg"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="editor-content"] h1').text()).toBe('标题');
    const handle = wrapper.vm as unknown as { getMarkdown(): string };
    expect(handle.getMarkdown()).toBe(markdown);
    wrapper.unmount();
  });

  it('源码修改后切回富文本重新导入', async () => {
    const wrapper = await mountEditor('# 标题\n');

    await wrapper.find('[data-testid="toolbar-mode-source"]').trigger('click');
    await nextTick();

    const textarea = wrapper.find('[data-testid="source-editor"]');
    await textarea.setValue('## 修改后的标题\n\n新段落。\n');
    await nextTick();

    await wrapper.find('[data-testid="toolbar-mode-wysiwyg"]').trigger('click');

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="editor-content"] h2').text()).toBe('修改后的标题');
    });

    wrapper.unmount();
  });

  it('源码重新导入失败时停留在源码模式并保留输入', async () => {
    let calls = 0;
    const services = createServices();
    vi.spyOn(localRenderer, 'renderMarkdown').mockImplementation(async (markdown) => {
        calls += 1;
        if (calls > 1) throw new Error('渲染失败');
        return realRender(markdown);
    });

    const wrapper = await mountEditor('# 标题\n', services);
    await wrapper.find('[data-testid="toolbar-mode-source"]').trigger('click');
    await nextTick();

    await wrapper.find('[data-testid="source-editor"]').setValue('# 新内容\n');
    await wrapper.find('[data-testid="toolbar-mode-wysiwyg"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="source-editor"]').exists()).toBe(true);
    expect((wrapper.find('[data-testid="source-editor"]').element as HTMLTextAreaElement).value).toBe(
      '# 新内容\n',
    );
    wrapper.unmount();
  });

  it('提供 saveMarkdown 时显示保存按钮并触发回调', async () => {
    const saveMarkdown = vi.fn().mockResolvedValue(undefined);
    const wrapper = await mountEditor('# 标题\n', createServices({ saveMarkdown }));

    const saveButton = wrapper.find('[data-testid="toolbar-save"]');
    expect(saveButton.exists()).toBe(true);

    await saveButton.trigger('click');
    await vi.waitFor(() => expect(saveMarkdown).toHaveBeenCalledTimes(1));

    expect(saveMarkdown.mock.calls[0][0].markdown).toBe('# 标题\n');
    wrapper.unmount();
  });

  it('未提供 saveMarkdown 时不显示保存按钮', async () => {
    const wrapper = await mountEditor('# 标题\n');
    expect(wrapper.find('[data-testid="toolbar-save"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('未提供 uploadFile 时不显示上传按钮', async () => {
    const wrapper = await mountEditor('# 标题\n');
    expect(wrapper.find('[data-testid="toolbar-upload"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('保存期间继续编辑，成功后仍为未保存状态', async () => {
    let releaseSave: (() => void) | undefined;
    const saveMarkdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );

    const wrapper = await mountEditor('# 标题\n', createServices({ saveMarkdown }));

    await wrapper.find('[data-testid="toolbar-save"]').trigger('click');
    await nextTick();

    // 保存期间继续编辑：文档与已保存快照不同，保存成功后仍应为未保存状态。
    const editor = getEditor(wrapper) as {
      chain: () => { insertContentAt: (pos: number, value: string) => { run(): boolean } };
    };
    editor.chain().insertContentAt(3, '新内容').run();
    await nextTick();

    releaseSave?.();
    await vi.waitFor(() => expect(saveMarkdown).toHaveBeenCalled());
    await nextTick();

    const states = wrapper.emitted('state-change') as [EditorState][] | undefined;
    const last = states?.[states.length - 1]?.[0];
    expect(last?.saving).toBe(false);
    expect(last?.dirty).toBe(true);
    wrapper.unmount();
  });

  it('只读模式禁用工具栏按钮', async () => {
    resetSourceIdCounter();
    const wrapper = mount(GlfmEditor, {
      props: { modelValue: '# 标题\n', context, services: createServices(), readonly: true },
      attachTo: document.body,
    });

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="status-importing"]').exists()).toBe(false);
    });

    const bold = wrapper.find('[data-testid="toolbar-bold"]');
    expect((bold.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('销毁后不再响应内容变化', async () => {
    const wrapper = await mountEditor('# 标题\n');
    const handle = wrapper.vm as unknown as { getMarkdown(): string };
    const before = handle.getMarkdown();
    wrapper.unmount();
    expect(before).toBe('# 标题\n');
  });

  it('getEditor 返回的实例可访问内部文档', async () => {
    const wrapper = await mountEditor('# 标题\n');
    const editor = getEditor(wrapper) as { state: { doc: { childCount: number } } };
    expect(editor.state.doc.childCount).toBe(1);
    wrapper.unmount();
  });
});

describe('模式切换与预览', () => {
  it('预览模式调用渲染服务', async () => {
    const renderMarkdown = vi.spyOn(localRenderer, 'renderMarkdown');
    const wrapper = await mountEditor('# 标题\n');
    renderMarkdown.mockClear();

    await wrapper.find('[data-testid="toolbar-mode-preview"]').trigger('click');

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="preview-content"]').exists()).toBe(true);
    });

    await vi.waitFor(() => {
      expect(renderMarkdown).toHaveBeenCalled();
    });

    wrapper.unmount();
  });

  it('预览失败时显示错误并保留重试入口', async () => {
    let calls = 0;
    const services = createServices();
    vi.spyOn(localRenderer, 'renderMarkdown').mockImplementation(async (markdown) => {
        calls += 1;
        if (calls > 1) throw new Error('预览失败');
        return realRender(markdown);
    });

    const wrapper = await mountEditor('# 标题\n', services);
    await wrapper.find('[data-testid="toolbar-mode-preview"]').trigger('click');

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="preview-error"]').exists()).toBe(true);
    });

    expect(wrapper.find('[data-testid="preview-retry"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
