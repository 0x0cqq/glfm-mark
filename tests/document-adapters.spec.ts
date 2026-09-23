/** 文档保存包在本地适配器与编辑器宿主会话之间的真实文件验证。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { DocumentSession } from '../src/adapters/document-session';
import { GlfmEditorCore } from '../src/core/editor';
import { LocalDirectoryAdapter } from '../tools/local-directory-adapter';
import { renderPreviewHtml } from '../src/material/preview';

const documentPath = 'docs/cs/algorithms/sorting.md';
const original = '# Sorting\r\n\r\n原有图片 ![](sorting.assets/old.png)\r\n';
let temporary = '';
let root = '';

/** 建立隔离的仓库文件副本。 */
beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'glfm-local-adapter-'));
  root = join(temporary, 'repo');
  await mkdir(join(root, 'docs/cs/algorithms/sorting.assets'), { recursive: true });
  await writeFile(join(root, documentPath), original);
  await writeFile(join(root, 'docs/cs/algorithms/sorting.assets/old.png'), Buffer.from([1, 2, 3]));
});

/** 只清理本测试创建的临时目录。 */
afterEach(async () => {
  const parent = await realpath(tmpdir());
  const target = await realpath(temporary);
  const child = relative(parent, target);
  if (!child || child.startsWith('..') || child.includes(sep)) throw new Error('临时目录超出预期范围');
  await rm(target, { recursive: true });
});

describe('文档保存包与本地适配器', () => {
  it('Markdown 与新增图片一并写入，重新载入保持原始字节', async () => {
    const adapter = new LocalDirectoryAdapter(root);
    const loaded = await adapter.load(documentPath);
    expect(loaded.markdown).toBe(original);
    const image = new Blob([Uint8Array.from([137, 80, 78, 71, 1, 2])], { type: 'image/png' });
    const markdown = `${original}\r\n![新图](sorting.assets/new.png)\r\n`;

    const saved = await adapter.write({
      bundle: {
        documentPath,
        markdown,
        assets: [{ path: 'docs/cs/algorithms/sorting.assets/new.png', content: image }],
      },
      expectedRevision: loaded.revision,
    });

    expect((await adapter.load(documentPath)).markdown).toBe(markdown);
    expect((await readFile(join(root, documentPath))).toString('utf8')).toBe(markdown);
    expect([...await readFile(join(root, 'docs/cs/algorithms/sorting.assets/new.png'))]).toEqual([137, 80, 78, 71, 1, 2]);
    expect(saved.revision).not.toBe(loaded.revision);
  });

  it('文档冲突与图片路径冲突不会覆盖现有文件', async () => {
    const adapter = new LocalDirectoryAdapter(root);
    const loaded = await adapter.load(documentPath);
    const image = new Blob([Uint8Array.from([9, 9])]);
    const bundle = {
      documentPath,
      markdown: '# 改动',
      assets: [{ path: 'docs/cs/algorithms/sorting.assets/old.png', content: image }],
    };

    await expect(adapter.write({ bundle, expectedRevision: loaded.revision })).rejects.toThrow();
    expect((await adapter.load(documentPath)).markdown).toBe(original);
    expect([...await readFile(join(root, 'docs/cs/algorithms/sorting.assets/old.png'))]).toEqual([1, 2, 3]);

    await writeFile(join(root, documentPath), '# 别人的改动');
    await expect(adapter.write({ bundle, expectedRevision: loaded.revision })).rejects.toThrow('已变化');
    expect((await adapter.load(documentPath)).markdown).toBe('# 别人的改动');
  });

  it('编辑器上传只暂存，保存时通过本地适配器落盘', async () => {
    const adapter = new LocalDirectoryAdapter(root);
    const loaded = await adapter.load(documentPath);
    const session = new DocumentSession(adapter, documentPath, loaded.revision);
    const core = new GlfmEditorCore({
      markdown: loaded.markdown,
      context: {
        documentId: documentPath,
        linkBaseUrl: 'https://example.test/cs/algorithms/',
        assetBaseUrl: 'https://example.test/cs/algorithms/',
      },
      services: session.services,
      callbacks: { onUpdate() {}, onStateChange() {}, onError(error) { throw new Error(error.message); } },
    });
    try {
      await core.load(loaded.markdown);
      const file = new File([Uint8Array.from([137, 80, 78, 71, 7])], 'heap.png', { type: 'image/png' });
      expect(await core.uploadFile(file)).toBe(true);
      const draft = session.createBundle(core.getMarkdown());
      expect(draft.assets).toHaveLength(1);
      expect(draft.markdown).toMatch(/!\[heap\]\(sorting\.assets\/heap-[a-f0-9]+\.png\)/);
      expect((await adapter.load(documentPath)).markdown).toBe(original);

      expect(await core.save()).toBe(true);
      const saved = await adapter.load(documentPath);
      expect(saved.markdown).toBe(core.getMarkdown());
      expect(session.createBundle(core.getMarkdown()).assets).toHaveLength(0);
      expect(core.getState().dirty).toBe(false);
      expect([...await readFile(join(root, draft.assets[0].path))]).toEqual([137, 80, 78, 71, 7]);
    } finally {
      core.destroy();
      session.dispose();
    }
  });

  it('待写入图片在编辑与预览中使用临时地址，保存包仍保留相对地址', async () => {
    const adapter = new LocalDirectoryAdapter(root);
    const loaded = await adapter.load(documentPath);
    const session = new DocumentSession(adapter, documentPath, loaded.revision);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://example.test/pending-image');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    try {
      const result = await session.services.uploadFile!({
        file: new File(['image bytes'], '新图.png', { type: 'image/png' }),
        context: { documentId: documentPath, linkBaseUrl: 'https://example.test/docs/', assetBaseUrl: 'https://example.test/docs/' },
        signal: new AbortController().signal,
      });
      const markdown = result.markdown;
      const source = markdown.match(/\]\(([^)]+)\)/)?.[1] ?? '';
      const preview = await renderPreviewHtml(
        `<p><img src="${source}" alt="新图"></p>`,
        { documentId: documentPath, linkBaseUrl: 'https://example.test/docs/', assetBaseUrl: 'https://example.test/docs/' },
        session.services.resolveAssetPreview,
      );
      expect(preview.querySelector('img')?.getAttribute('src')).toBe('blob:https://example.test/pending-image');
      expect(session.createBundle(markdown).markdown).toBe(markdown);
      expect(markdown).not.toContain('blob:');
      expect(createUrl).toHaveBeenCalledOnce();
    } finally {
      session.dispose();
      expect(revokeUrl).toHaveBeenCalledWith('blob:https://example.test/pending-image');
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });

  it('保存遇到外部修改时保留待写入图片供用户重试', async () => {
    const adapter = new LocalDirectoryAdapter(root);
    const loaded = await adapter.load(documentPath);
    const session = new DocumentSession(adapter, documentPath, loaded.revision);
    try {
      const { markdown } = await session.services.uploadFile!({
        file: new File(['pending image'], 'new.png', { type: 'image/png' }),
        context: { documentId: documentPath, linkBaseUrl: 'https://example.test/', assetBaseUrl: 'https://example.test/' },
        signal: new AbortController().signal,
      });
      const bundle = session.createBundle(`${original}\n${markdown}`);
      await writeFile(join(root, documentPath), '# 其他修改');
      await expect(session.services.saveMarkdown!({
        markdown: bundle.markdown,
        context: { documentId: documentPath, linkBaseUrl: 'https://example.test/', assetBaseUrl: 'https://example.test/' },
        signal: new AbortController().signal,
      })).rejects.toThrow('已变化');
      expect(session.createBundle(bundle.markdown).assets).toHaveLength(1);
      expect((await adapter.load(documentPath)).markdown).toBe('# 其他修改');
    } finally {
      session.dispose();
    }
  });
});
