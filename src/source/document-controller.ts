/**
 * 文档控制器：负责源码基线、导入与导出。
 *
 * 关键约束（设计文档 §4.5、§6）：
 * - `getMarkdown()`、保存、预览、主题切换都不能重建源码基线。
 * - 只有外部载入新文档，或修改源码后成功重新进入富文本模式，才建立新基线。
 * - 旧导入结果不能覆盖新文档。
 */
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import type { GlfmSerializer } from '../glfm/serialize';
import { importMarkdown } from './import';
import { exportMarkdown } from './export';
import type { ImportResult, SourceBaseline } from './types';

/** 文档控制器：持有基线并以递增请求序号防止旧响应覆盖新文档。 */
export class DocumentController {
  private baseline: SourceBaseline | null = null;
  private requestSeq = 0;
  private controller: AbortController | null = null;

  constructor(
    private readonly schema: Schema,
    private readonly serializer: GlfmSerializer,
  ) {}

  /** 当前基线；尚未导入时为 null。 */
  get currentBaseline(): SourceBaseline | null {
    return this.baseline;
  }

  /** 导入失败或降级时记录的状态说明。 */
  private degraded = false;

  /** 当前文档是否因缺少可靠源码位置而降级。 */
  get isDegraded(): boolean {
    return this.degraded;
  }

  /**
   * 载入 Markdown。
   *
   * 每次调用都会取消上一次未完成的导入；旧响应不会覆盖新文档。
   */
  async load(
    markdown: string,
    renderMarkdown: (markdown: string, signal: AbortSignal) => Promise<{ html: string }>,
  ): Promise<ImportResult> {
    this.requestSeq += 1;
    const seq = this.requestSeq;
    this.controller?.abort();
    this.controller = new AbortController();
    const signal = this.controller.signal;

    const result = await importMarkdown(markdown, this.schema, (value) =>
      renderMarkdown(value, signal),
    );

    if (seq !== this.requestSeq) {
      throw new DOMException('导入已被更新的请求取代', 'AbortError');
    }

    this.baseline = result.baseline;
    this.degraded = result.degraded;
    return result;
  }

  /** 以当前文档和基线导出 Markdown。 */
  export(doc: ProseMirrorNode): string {
    return exportMarkdown(doc, this.baseline, this.serializer);
  }

  /**
   * 源码模式重新导入成功后建立新基线。
   *
   * 失败时不修改现有基线，调用方需停留在源码模式。
   */
  async reloadFromSource(
    markdown: string,
    renderMarkdown: (markdown: string, signal: AbortSignal) => Promise<{ html: string }>,
  ): Promise<ImportResult> {
    return this.load(markdown, renderMarkdown);
  }

  /** 取消进行中的导入。 */
  cancel(): void {
    this.requestSeq += 1;
    this.controller?.abort();
    this.controller = null;
  }

  /** 清空基线，用于切换文档。 */
  reset(): void {
    this.cancel();
    this.baseline = null;
    this.degraded = false;
  }
}
