/** 宿主会话：暂存图片，并把编辑器的通用保存/上传回调接到文档适配器。 */
import type { EditorServices } from '../core/types';
import type { AssetWrite, DocumentAdapter, DocumentBundle } from './types';

/** 首个本地图片写入切片支持的格式。 */
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** 从文档路径生成同目录的图片目录和安全的 Markdown 相对地址。 */
function imagePaths(documentPath: string, file: File): { source: string; path: string; alt: string } {
  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) throw new Error('当前仅支持 PNG、JPEG、GIF、WebP 和 AVIF 图片');
  const segments = documentPath.split('/');
  const name = segments.pop() ?? '';
  if (!name.toLowerCase().endsWith('.md')) throw new Error('文档路径必须指向 Markdown 文件');
  const stem = name.slice(0, -3);
  const alt = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]\r\n]/g, ' ').trim() || '图片';
  const slug = alt.normalize('NFKC').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  const random = globalThis.crypto.getRandomValues(new Uint8Array(8));
  const suffix = [...random].map((part) => part.toString(16).padStart(2, '0')).join('');
  const source = `${stem}.assets/${slug}-${suffix}.${extension}`;
  return { source, path: [...segments, source].join('/'), alt };
}

/** 暂存的图片及其正文地址。 */
interface PendingAsset {
  source: string;
  asset: AssetWrite;
}

/** 将上传暂存和持久化放在编辑器之外，适配器可替换为本地或 GitHub。 */
export class DocumentSession {
  private readonly adapter: DocumentAdapter;
  readonly documentPath: string;
  private revision: string;
  private readonly pending = new Map<string, PendingAsset>();
  private readonly previews = new Map<string, string>();

  readonly services: EditorServices;

  constructor(adapter: DocumentAdapter, documentPath: string, revision: string) {
    this.adapter = adapter;
    this.documentPath = documentPath;
    this.revision = revision;
    this.services = {
      /** 上传操作只暂存图片，返回引用最终仓库路径的 Markdown。 */
      uploadFile: async ({ file, context, signal }) => {
        signal.throwIfAborted();
        if (context.documentId !== this.documentPath) throw new Error('上传目标文档已变化');
        const { source, path, alt } = imagePaths(this.documentPath, file);
        this.pending.set(path, { source, asset: { path, content: file } });
        if (typeof URL.createObjectURL === 'function') {
          this.previews.set(source, URL.createObjectURL(file));
        }
        return { markdown: `![${alt}](${source})` };
      },
      /** 保存时把请求快照与仍被引用的待写入图片交给适配器。 */
      saveMarkdown: async ({ markdown, context, signal }) => {
        if (context.documentId !== this.documentPath) throw new Error('保存目标文档已变化');
        const bundle = this.createBundle(markdown);
        const result = await this.adapter.write({ bundle, expectedRevision: this.revision, signal });
        this.revision = result.revision;
        bundle.assets.forEach((asset) => this.pending.delete(asset.path));
      },
      /** 临时地址只影响展示，不进入 Markdown。 */
      resolveAssetPreview: (source) => this.previews.get(source),
    };
  }

  /** 生成可传给任意文档适配器的保存包。 */
  createBundle(markdown: string): DocumentBundle {
    const assets = [...this.pending.values()]
      .filter(({ source }) => markdown.includes(source))
      .map(({ asset }) => asset);
    return { documentPath: this.documentPath, markdown, assets };
  }

  /** 返回最近一次成功写入的存储版本。 */
  getRevision(): string {
    return this.revision;
  }

  /** 释放临时预览地址和待写入文件。 */
  dispose(): void {
    for (const url of this.previews.values()) URL.revokeObjectURL(url);
    this.previews.clear();
    this.pending.clear();
  }
}
