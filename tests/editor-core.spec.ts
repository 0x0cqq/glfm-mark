/**
 * 编辑器核心行为测试：模式切换、历史边界、旧请求、上传位置删除。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlfmEditorCore } from '../src/core/editor';
import type { DocumentContext, EditorServices } from '../src/core/types';
import * as localRenderer from '../src/glfm/render';
const realRender = localRenderer.renderMarkdown;
afterEach(() => vi.restoreAllMocks());
import { resetSourceIdCounter } from '../src/source/source-id';



const context: DocumentContext = {
  documentId: 'doc-1',
  linkBaseUrl: 'https://example.com/docs/',
  assetBaseUrl: 'https://example.com/docs/assets/',
};

/** 创建核心实例。 */
function createCore(services: Partial<EditorServices> = {}, markdown = '# 标题\n') {
  resetSourceIdCounter();
  const core = new GlfmEditorCore({
    markdown,
    context,
    services: {
      ...services,
    },
    element: null,
    callbacks: { onUpdate: () => {}, onStateChange: () => {}, onError: () => {} },
  });
  return core;
}

describe('模式切换', () => {
  it('块起始行与当前导出源码一致，重复内容与 CRLF 不串用', async () => {
    const core = createCore();
    await core.load('\r\n# 标题\r\n\r\n重复\r\n\r\n重复\r\n');
    expect(core.getBlockLines()).toEqual([2, 4, 6]);
    core.editor.chain().setTextSelection(2).splitBlock().run();
    const lines = core.getMarkdown().split('\n');
    const blockLines = core.getBlockLines();
    expect(blockLines.length).toBe(core.editor.state.doc.childCount);
    expect(lines[blockLines.at(-1)! - 1]).toBe('重复\r');
    core.destroy();
  });
  it('切到源码模式立即导出当前内容', async () => {
    const core = createCore();
    await core.load('# 标题\n');
    await core.setMode('source');
    expect(core.getSourceMarkdown()).toBe('# 标题\n');
    core.destroy();
  });

  it('源码未变化时切回富文本保留文档与历史', async () => {
    const core = createCore();
    await core.load('# 标题\n');
    await core.setMode('source');
    await core.setMode('wysiwyg');
    expect(core.editor.state.doc.childCount).toBe(1);
    expect(core.getMarkdown()).toBe('# 标题\n');
    core.destroy();
  });

  it('源码变化时切回富文本重建基线与历史', async () => {
    const core = createCore();
    await core.load('# 标题\n');
    await core.setMode('source');
    core.setSourceMarkdown('## 新标题\n');
    const ok = await core.setMode('wysiwyg');

    expect(ok).toBe(true);
    expect(core.editor.state.doc.child(0).type.name).toBe('heading');
    expect(core.editor.state.doc.child(0).attrs.level).toBe(2);
    expect(core.getMarkdown()).toBe('## 新标题\n');
    core.destroy();
  });

  it('重新导入失败时停留在源码模式并保留输入', async () => {
    let calls = 0;
    const core = createCore();
    vi.spyOn(localRenderer, 'renderMarkdown').mockImplementation(async (markdown) => {
        calls += 1;
        if (calls > 1) throw new Error('渲染失败');
        return realRender(markdown);
    });

    await core.load('# 标题\n');
    await core.setMode('source');
    core.setSourceMarkdown('# 新内容\n');

    const ok = await core.setMode('wysiwyg');
    expect(ok).toBe(false);
    expect(core.mode).toBe('source');
    expect(core.getSourceMarkdown()).toBe('# 新内容\n');
    core.destroy();
  });

  it('预览模式切换不改变编辑历史', async () => {
    const core = createCore();
    await core.load('# 标题\n');
    const before = core.editor.state.doc;

    await core.setMode('preview');
    await core.setMode('wysiwyg');

    expect(core.editor.state.doc.eq(before)).toBe(true);
    core.destroy();
  });
});

describe('请求与生命周期', () => {
  it('旧请求响应不覆盖新文档', async () => {
    /** 每次渲染挂起，等待测试显式放行。 */
    const pending: { markdown: string; resolve: () => void; aborted: boolean }[] = [];
    const core = createCore();
    vi.spyOn(localRenderer, 'renderMarkdown').mockImplementation((markdown, signal) =>
        new Promise((resolve, reject) => {
          const entry = {
            markdown,
            aborted: false,
            resolve: () => {
              void realRender(markdown).then(resolve);
            },
          };
          pending.push(entry);

          signal?.addEventListener('abort', () => {
            entry.aborted = true;
            reject(new DOMException('已取消', 'AbortError'));
          });
        }),
    );

    const first = core.load('# 第一份\n');
    const second = core.load('# 第二份\n');

    // 第二次载入会取消第一次请求；取消不向调用方抛出错误。
    expect(pending).toHaveLength(2);
    expect(pending[0].aborted).toBe(true);

    pending[1].resolve();
    await second;
    await first;

    // 迟到的第一份响应不能覆盖第二份文档。
    expect(core.getMarkdown()).toBe('# 第二份\n');
    core.destroy();
  });

  it('documentId 变化时调用方负责重新载入', async () => {
    const core = createCore();
    await core.load('# 标题\n');
    expect(core.getMarkdown()).toBe('# 标题\n');
    core.destroy();
  });

  it('销毁后释放编辑器', async () => {
    const core = createCore();
    await core.load('# 标题\n');
    core.destroy();
    expect(core.editor.isDestroyed).toBe(true);
  });

  it('预览请求失败时返回 null 且不抛出', async () => {
    const core = createCore();
    vi.spyOn(localRenderer, 'renderMarkdown').mockRejectedValue(new Error('解析失败'));

    const result = await core.requestPreview();
    expect(result).toBeNull();
    core.destroy();
  });
});

describe('保存与上传', () => {
  it('保存使用发起时的快照', async () => {
    const saveMarkdown = vi.fn().mockResolvedValue(undefined);
    const core = createCore({ saveMarkdown });
    await core.load('# 标题\n');

    await core.save();
    expect(saveMarkdown).toHaveBeenCalledTimes(1);
    expect(saveMarkdown.mock.calls[0][0].markdown).toBe('# 标题\n');
    core.destroy();
  });

  it('保存中禁止重复触发', async () => {
    let release: (() => void) | undefined;
    const saveMarkdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const core = createCore({ saveMarkdown });
    await core.load('# 标题\n');

    const first = core.save();
    const second = await core.save();
    expect(second).toBe(false);
    expect(saveMarkdown).toHaveBeenCalledTimes(1);

    release?.();
    await first;
    core.destroy();
  });

  it('保存失败保留内容并暴露错误', async () => {
    const onError = vi.fn();
    resetSourceIdCounter();
    const core = new GlfmEditorCore({
      markdown: '# 标题\n',
      context,
      services: {
        saveMarkdown: async () => {
          throw new Error('保存失败');
        },
      },
      element: null,
      callbacks: { onUpdate: () => {}, onStateChange: () => {}, onError },
    });

    await core.load('# 标题\n');
    const ok = await core.save();

    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'save', message: '保存失败' }),
    );
    expect(core.getMarkdown()).toBe('# 标题\n');
    core.destroy();
  });

  it('未提供保存接口时 canSave 为 false', () => {
    const core = createCore();
    expect(core.canSave).toBe(false);
    core.destroy();
  });

  it('上传返回图片 Markdown 时插入图片节点', async () => {
    const core = createCore({
      uploadFile: async () => ({ markdown: '![图](uploads/a.png)' }),
    });
    await core.load('# 标题\n');

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const ok = await core.uploadFile(file);

    expect(ok).toBe(true);
    expect(core.getMarkdown()).toContain('![图](uploads/a.png)');
    core.destroy();
  });

  it('销毁时取消进行中的保存与上传请求', async () => {
    const signals: AbortSignal[] = [];
    const waiting = ({ signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('已取消', 'AbortError')), { once: true });
      });
    };
    const core = createCore({
      saveMarkdown: waiting,
      uploadFile: waiting,
    });
    await core.load('# 标题\n');
    const saving = core.save();
    const uploading = core.uploadFile(new File(['x'], 'new.png', { type: 'image/png' }));
    core.destroy();

    expect(await saving).toBe(false);
    expect(await uploading).toBe(false);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('在文末原有图片之后上传时，新图片单独成段', async () => {
    const core = createCore({ uploadFile: async () => ({ markdown: '![新图](uploads/new.png)' }) });
    await core.load('![](uploads/old.png)');
    core.editor.commands.focus('end');

    expect(await core.uploadFile(new File(['x'], 'new.png', { type: 'image/png' }))).toBe(true);
    expect(core.getMarkdown()).toBe('![](uploads/old.png)\n\n![新图](uploads/new.png)');
    core.destroy();
  });

  it('上传返回无法解析的 Markdown 时插入源码保留块', async () => {
    const core = createCore({
      uploadFile: async () => ({ markdown: '::: unknown block :::' }),
    });
    await core.load('# 标题\n');

    const file = new File(['x'], 'a.bin', { type: 'application/octet-stream' });
    await core.uploadFile(file);

    expect(core.getMarkdown()).toContain('::: unknown block :::');
    core.destroy();
  });

  it('上传位置被删除后不重新插入附件', async () => {
    let release: (() => void) | undefined;
    const core = createCore({
      uploadFile: () =>
        new Promise((resolve) => {
          release = () => resolve({ markdown: '![图](uploads/a.png)' });
        }),
    });
    await core.load('# 标题\n');

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const upload = core.uploadFile(file);

    // 上传期间清空文档。
    core.editor.commands.clearContent();
    release?.();
    await upload;

    expect(core.getMarkdown()).not.toContain('uploads/a.png');
    core.destroy();
  });
});
