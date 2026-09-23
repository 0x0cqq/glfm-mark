/** 宿主持久化的数据边界；编辑器正文仍使用 Markdown 字符串。 */

/** 本次保存需要新增的文件；路径相对于仓库或本地工作目录。 */
export interface AssetWrite {
  path: string;
  content: Blob;
}

/** 一次保存的完整输入，已有图片只通过 Markdown 中的地址引用。 */
export interface DocumentBundle {
  documentPath: string;
  markdown: string;
  assets: AssetWrite[];
}

/** 从存储端载入的文档及其不透明版本标识。 */
export interface LoadedDocument {
  markdown: string;
  revision: string;
}

/** 写入时使用载入版本检查并发修改。 */
export interface DocumentWriteRequest {
  bundle: DocumentBundle;
  expectedRevision: string;
  signal?: AbortSignal;
}

/** 本地目录与未来 GitHub 宿主实现共用的文档存储接口。 */
export interface DocumentAdapter {
  load(documentPath: string, signal?: AbortSignal): Promise<LoadedDocument>;
  write(request: DocumentWriteRequest): Promise<{ revision: string }>;
}
