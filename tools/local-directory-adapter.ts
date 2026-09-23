/** 开发与本地验证用目录适配器，不进入浏览器构建。 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { DocumentAdapter, DocumentWriteRequest, LoadedDocument } from '../src/adapters/types.ts';

/** 用文件内容生成本地并发检查标识。 */
function revisionFor(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** 检查目标始终留在指定工作目录中。 */
function assertInside(root: string, target: string): void {
  const path = relative(root, target);
  if (path === '..' || path.startsWith(`..\\`) || path.startsWith('../') || isAbsolute(path)) {
    throw new Error('文件路径超出本地工作目录');
  }
}

/** 验证仓库相对路径，避免跨目录写入及 Windows 特殊路径。 */
function pathSegments(path: string): string[] {
  const segments = path.split('/');
  if (!path || segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\<>:"|?*\x00-\x1F]/.test(segment) || /[. ]$/.test(segment))) {
    throw new Error(`无效的仓库相对路径：${path}`);
  }
  return segments;
}

/** 使用仓库相对路径定位本地文件。 */
function localPath(root: string, path: string): string {
  const target = resolve(root, ...pathSegments(path));
  assertInside(root, target);
  return target;
}

/** 创建目标父目录并检查中途的符号链接。 */
async function ensureParent(root: string, target: string): Promise<void> {
  const parts = relative(root, dirname(target)).split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    await mkdir(current, { recursive: true });
    assertInside(root, await realpath(current));
  }
}

/** 将文档与新增图片写入一个隔离的本地工作目录。 */
export class LocalDirectoryAdapter implements DocumentAdapter {
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  /** 载入 Markdown 并返回文件内容的版本标识。 */
  async load(documentPath: string, signal?: AbortSignal): Promise<LoadedDocument> {
    signal?.throwIfAborted();
    const root = await realpath(this.root);
    const target = localPath(root, documentPath);
    assertInside(root, await realpath(target));
    const content = await readFile(target);
    signal?.throwIfAborted();
    return { markdown: content.toString('utf8'), revision: revisionFor(content) };
  }

  /** 先写新增资源，最后替换 Markdown；冲突和失败保留原文。 */
  async write({ bundle, expectedRevision, signal }: DocumentWriteRequest): Promise<{ revision: string }> {
    signal?.throwIfAborted();
    const root = await realpath(this.root);
    const document = localPath(root, bundle.documentPath);
    assertInside(root, await realpath(document));
    const assets = bundle.assets.map((asset) => ({ target: localPath(root, asset.path), content: asset.content }));
    const targets = new Set([document]);
    for (const asset of assets) {
      if (targets.has(asset.target)) throw new Error('保存包包含重复文件路径');
      targets.add(asset.target);
    }

    const original = await readFile(document);
    if (revisionFor(original) !== expectedRevision) throw new Error('本地文档已变化，请重新载入后保存');

    const created: string[] = [];
    const temporary = `${document}.glfm-${randomUUID()}.tmp`;
    try {
      for (const asset of assets) {
        signal?.throwIfAborted();
        await ensureParent(root, asset.target);
        await writeFile(asset.target, Buffer.from(await asset.content.arrayBuffer()), { flag: 'wx' });
        created.push(asset.target);
      }
      signal?.throwIfAborted();
      await writeFile(temporary, bundle.markdown, { flag: 'wx' });
      if (revisionFor(await readFile(document)) !== expectedRevision) {
        throw new Error('本地文档已变化，请重新载入后保存');
      }
      signal?.throwIfAborted();
      await rename(temporary, document);
      return { revision: revisionFor(Buffer.from(bundle.markdown, 'utf8')) };
    } catch (error) {
      await rm(temporary, { force: true });
      await Promise.all(created.map((target) => rm(target, { force: true })));
      throw error;
    }
  }
}
