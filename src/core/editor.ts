/**
 * GLFM 编辑器核心：持有 Tiptap 编辑器、文档控制器与模式状态。
 *
 * 对外只暴露 Markdown 字符串；ProseMirror 文档是内部编辑状态。
 * Vue 组件与静态挂载入口共用这一层，避免两套状态逻辑。
 */
import { Editor } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { glfmExtensions } from '../glfm/schema';
import { createGlfmSerializer, type GlfmSerializer } from '../glfm/serialize';
import { DocumentController } from '../source/document-controller';
import type {
  DocumentContext,
  EditorError,
  EditorMode,
  EditorServices,
  EditorState,
} from './types';

/** 编辑器扩展提供者，默认使用带节点视图的浏览器端扩展。 */
export type ExtensionsFactory = () => ReturnType<typeof glfmExtensions>;

/** 编辑器回调。 */
export interface EditorCallbacks {
  /** 文档内容变化。 */
  onUpdate(markdown: string): void;
  /** 状态变化。 */
  onStateChange(state: EditorState): void;
  /** 错误。 */
  onError(error: EditorError): void;
}

/** 创建编辑器的选项。 */
export interface EditorOptions {
  markdown: string;
  context: DocumentContext;
  services: EditorServices;
  readonly?: boolean;
  initialMode?: EditorMode;
  callbacks: EditorCallbacks;
  /** 挂载元素；省略时创建无 DOM 的编辑器，供测试使用。 */
  element?: HTMLElement | null;
  /** 扩展工厂，默认使用带节点视图的浏览器端扩展。 */
  extensions?: ExtensionsFactory;
}

/**
 * GLFM 编辑器核心。
 *
 * 负责导入基线、模式切换、导出与状态通知，不负责界面渲染。
 */
export class GlfmEditorCore {
  readonly schema: Schema;
  readonly serializer: GlfmSerializer;
  readonly controller: DocumentController;
  readonly editor: Editor;

  private state: EditorState;
  private savedMarkdown: string;
  /** 最近一次向宿主发出的 Markdown，用于识别父组件回声。 */
  private lastEmitted = '';
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private previewSeq = 0;
  private previewAbort: AbortController | null = null;
  private destroyed = false;

  constructor(private readonly options: EditorOptions) {
    const extensions = (options.extensions ?? glfmExtensions)();
    this.schema = getSchema(extensions);
    this.serializer = createGlfmSerializer();
    this.controller = new DocumentController(this.schema, this.serializer);
    this.savedMarkdown = options.markdown;
    this.state = {
      mode: options.initialMode ?? 'wysiwyg',
      dirty: false,
      importing: true,
      saving: false,
      uploading: 0,
    };

    this.editor = new Editor({
      element: options.element ?? undefined,
      editable: !options.readonly,
      extensions,
      content: '',
      onUpdate: () => this.handleUpdate(),
    });
  }

  /** 当前状态快照。 */
  getState(): EditorState {
    return { ...this.state };
  }

  /** 当前模式。 */
  get mode(): EditorMode {
    return this.state.mode;
  }

  /** 是否因缺少可靠源码位置而降级。 */
  get isDegraded(): boolean {
    return this.controller.isDegraded;
  }

  /** 载入文档并建立基线。 */
  async load(markdown: string): Promise<void> {
    this.setState({ importing: true });

    try {
      const result = await this.controller.load(markdown, (value, signal) =>
        this.options.services.renderMarkdown({
          markdown: value,
          context: this.options.context,
          signal,
        }),
      );

      this.lastEmitted = markdown;
      this.savedMarkdown = markdown;

      this.editor.commands.setContent(result.doc.toJSON(), { emitUpdate: false });
      this.setState({ dirty: false, importing: false });
    } catch (error) {
      if (isAbortError(error)) return;

      this.setState({ importing: false });
      this.options.callbacks.onError({
        operation: 'import',
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
      throw error;
    }
  }

  /** 返回当前最新 Markdown，包含尚未发出的输入法内容。 */
  getMarkdown(): string {
    if (this.state.mode === 'source') return this.sourceMarkdown ?? this.currentMarkdown();
    return this.currentMarkdown();
  }

  /** 源码模式下的临时文本。 */
  private sourceMarkdown: string | null = null;

  /** 当前富文本文档导出的 Markdown。 */
  private currentMarkdown(): string {
    if (!this.editor || this.destroyed) return this.lastEmitted;
    return this.controller.export(this.editor.state.doc);
  }

  /** 处理编辑器内容变化。 */
  private handleUpdate(): void {
    if (this.state.mode !== 'wysiwyg') return;
    const markdown = this.currentMarkdown();
    this.emit(markdown);
  }

  /** 向宿主发出内容更新。 */
  private emit(markdown: string): void {
    this.lastEmitted = markdown;
    this.setState({ dirty: markdown !== this.savedMarkdown });
    this.options.callbacks.onUpdate(markdown);
  }

  /**
   * 接收父组件传入的 `modelValue`。
   *
   * 与当前值相同视为回声，不重新导入；不同则视为载入新文档。
   */
  async syncModelValue(markdown: string): Promise<void> {
    if (markdown === this.lastEmitted) return;
    await this.load(markdown);
  }

  /** 切换模式。 */
  async setMode(mode: EditorMode): Promise<boolean> {
    if (mode === this.state.mode) return true;

    if (this.state.mode === 'wysiwyg' && mode !== 'wysiwyg') {
      this.sourceMarkdown = this.currentMarkdown();
      this.setState({ mode });
      return true;
    }

    if (mode === 'wysiwyg' && this.state.mode === 'source') {
      const source = this.sourceMarkdown ?? '';
      const current = this.currentMarkdown();

      if (source === current) {
        // 源码没有变化：直接恢复原文档、选区和撤销历史。
        this.sourceMarkdown = null;
        this.setState({ mode });
        return true;
      }

      // 源码发生变化：重新导入并建立新基线。
      this.setState({ importing: true });
      try {
        await this.load(source);
        this.sourceMarkdown = null;
        this.setState({ mode });
        return true;
      } catch {
        // 重新导入失败：停留在源码模式，保留全部输入。
        this.setState({ importing: false });
        return false;
      }
    }

    this.setState({ mode });
    return true;
  }

  /** 更新源码模式的临时文本。 */
  setSourceMarkdown(markdown: string): void {
    this.sourceMarkdown = markdown;
    if (this.state.mode === 'source') {
      this.emit(markdown);
    }
  }

  /** 当前源码模式的文本。 */
  getSourceMarkdown(): string {
    return this.sourceMarkdown ?? this.currentMarkdown();
  }

  /** 标记已保存内容，更新 dirty 状态。 */
  markSaved(markdown: string): void {
    this.savedMarkdown = markdown;
    this.setState({ dirty: this.getMarkdown() !== markdown });
  }

  /**
   * 保存当前内容。
   *
   * 以发起请求时的快照为准；保存期间允许继续编辑，成功后仍保持正确的 dirty 状态。
   */
  async save(): Promise<boolean> {
    const saveMarkdown = this.options.services.saveMarkdown;
    if (!saveMarkdown || this.state.saving) return false;

    const snapshot = this.getMarkdown();
    this.setState({ saving: true });
    const controller = new AbortController();

    try {
      await saveMarkdown({
        markdown: snapshot,
        context: this.options.context,
        signal: controller.signal,
      });

      this.setState({ saving: false });
      this.markSaved(snapshot);
      return true;
    } catch (error) {
      this.setState({ saving: false });
      this.options.callbacks.onError({
        operation: 'save',
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
      return false;
    }
  }

  /** 是否可用保存功能。 */
  get canSave(): boolean {
    return Boolean(this.options.services.saveMarkdown);
  }

  /** 是否可用上传功能。 */
  get canUpload(): boolean {
    return Boolean(this.options.services.uploadFile);
  }

  /**
   * 上传文件并把返回的 Markdown 插入到当前位置。
   *
   * 无法结构化解析时插入源码保留块，不丢弃结果。
   */
  async uploadFile(file: File): Promise<boolean> {
    const upload = this.options.services.uploadFile;
    if (!upload) return false;

    this.setState({ uploading: this.state.uploading + 1 });
    const controller = new AbortController();
    const position = this.editor.state.selection.from;

    try {
      const { markdown } = await upload({
        file,
        context: this.options.context,
        signal: controller.signal,
      });

      // 原插入位置已被删除或文档已切换时，不重新插入附件。
      if (this.destroyed || position > this.editor.state.doc.content.size) {
        this.setState({ uploading: this.state.uploading - 1 });
        return false;
      }

      const parsed = this.parseUploadedMarkdown(markdown);
      this.editor.chain().insertContentAt(position, parsed).focus().run();
      this.setState({ uploading: this.state.uploading - 1 });
      return true;
    } catch (error) {
      this.setState({ uploading: this.state.uploading - 1 });
      this.options.callbacks.onError({
        operation: 'upload',
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
      return false;
    }
  }

  /**
   * 解析上传返回的 Markdown。
   *
   * 只识别图片语法；其他内容作为源码保留块插入，避免丢失结果。
   */
  private parseUploadedMarkdown(markdown: string): Record<string, unknown> {
    const imageMatch = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(markdown.trim());
    if (imageMatch) {
      return {
        type: 'image',
        attrs: { src: imageMatch[2], alt: imageMatch[1], title: imageMatch[3] ?? null },
      };
    }

    return {
      type: 'sourceBlock',
      attrs: { reason: 'unrendered' },
      content: markdown ? [{ type: 'text', text: markdown }] : [],
    };
  }

  /** 更新只读状态。 */
  setReadonly(readonly: boolean): void {
    this.editor.setEditable(!readonly);
  }

  /** 聚焦编辑区。 */
  focus(): void {
    this.editor.commands.focus();
  }

  /** 请求预览 HTML。 */
  async requestPreview(): Promise<string | null> {
    this.previewSeq += 1;
    const seq = this.previewSeq;
    this.previewAbort?.abort();
    this.previewAbort = new AbortController();

    try {
      const { html } = await this.options.services.renderMarkdown({
        markdown: this.getMarkdown(),
        context: this.options.context,
        signal: this.previewAbort.signal,
      });

      if (seq !== this.previewSeq) return null;
      return html;
    } catch (error) {
      if (isAbortError(error)) return null;
      this.options.callbacks.onError({
        operation: 'preview',
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
      return null;
    }
  }

  /** 预览模式下延迟刷新。 */
  schedulePreview(callback: (html: string | null) => void, delay = 350): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      void this.requestPreview().then(callback);
    }, delay);
  }

  /** 取消预览计时与请求。 */
  cancelPreview(): void {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    this.previewAbort?.abort();
    this.previewAbort = null;
    this.previewSeq += 1;
  }

  /** 更新状态并通知回调。 */
  private setState(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    this.options.callbacks.onStateChange({ ...this.state });
  }

  /** 释放编辑器与未完成的请求。 */
  destroy(): void {
    this.destroyed = true;
    this.cancelPreview();
    this.controller.cancel();
    this.editor.destroy();
  }
}

/** 判断错误是否为取消。 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** 判断文档是否为空（用于外部工具）。 */
export function isEmptyDoc(doc: ProseMirrorNode): boolean {
  return doc.childCount === 0;
}
