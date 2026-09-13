/**
 * 公共类型：组件对外只暴露 Markdown 字符串与宿主服务接口。
 */

/** 编辑器模式。 */
export type EditorMode = 'wysiwyg' | 'source' | 'preview';

/** 文档上下文，由宿主提供绝对目录 URL。 */
export interface DocumentContext {
  /** 文档标识；改变时清空该文档的历史与解析缓存。 */
  documentId: string;
  /** 文档链接基准地址，必须是绝对目录 URL。 */
  linkBaseUrl: string;
  /** 附件基准地址，必须是绝对目录 URL。 */
  assetBaseUrl: string;
}

/** 上传请求。 */
export interface UploadRequest {
  file: File;
  context: DocumentContext;
  signal: AbortSignal;
}

/** 上传结果，使用 Markdown 字符串。 */
export interface UploadResult {
  markdown: string;
}

/** 保存请求。 */
export interface SaveRequest {
  markdown: string;
  context: DocumentContext;
  signal: AbortSignal;
}

/** 宿主提供的服务。 */
export interface EditorServices {
  /** 上传附件，返回插入用的 Markdown。 */
  uploadFile?(request: UploadRequest): Promise<UploadResult>;
  /** 保存 Markdown。 */
  saveMarkdown?(request: SaveRequest): Promise<void>;
}

/** 组件错误。 */
export interface EditorError {
  operation: 'import' | 'preview' | 'upload' | 'save';
  message: string;
  cause?: unknown;
}

/** 组件状态。 */
export interface EditorState {
  mode: EditorMode;
  dirty: boolean;
  importing: boolean;
  saving: boolean;
  uploading: number;
}

/** 组件实例暴露的方法。 */
export interface GlfmEditorHandle {
  /** 返回当前最新 Markdown，包含尚未向宿主发出的输入法内容。 */
  getMarkdown(): string;
  /** 聚焦编辑区。 */
  focus(): void;
  /** 切换模式；切换失败返回 false。 */
  setMode(mode: EditorMode): Promise<boolean>;
  /** 更新“已保存内容”快照。 */
  markSaved(markdown: string): void;
}

/** 静态挂载入口返回的句柄。 */
export interface MountedGlfmEditor {
  getMarkdown(): string;
  setMarkdown(markdown: string): Promise<void>;
  markSaved(markdown: string): void;
  setMode(mode: EditorMode): Promise<boolean>;
  destroy(): void;
}
