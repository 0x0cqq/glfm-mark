/**
 * 库入口：导出 Vue 组件、编辑核心、适配器与公共类型；静态挂载函数见 standalone 入口。
 *
 * 对外数据模型始终是 Markdown 字符串。
 */
import './styles/style.css';

export { default as GlfmEditor } from './components/GlfmEditor.vue';
export { default as GlfmPreview } from './components/GlfmPreview.vue';
export { createGitLabMarkdownService } from './adapters/gitlab';
export type { GitLabMarkdownService, GitLabMarkdownServiceOptions } from './adapters/gitlab';
export { GlfmEditorCore } from './core/editor';
export type { EditorOptions, EditorCallbacks, ExtensionsFactory } from './core/editor';
export { editorExtensions } from './core/extensions';
export { glfmExtensions } from './glfm/schema';
export { createGlfmSerializer, serializeBlock, serializeDocument, serializeInline } from './glfm/serialize';
export { importMarkdown, assembleBaseline } from './source/import';
export { exportMarkdown } from './source/export';
export { DocumentController } from './source/document-controller';
export { semanticSnapshot } from './source/semantic';
export { parseSourcePos, sourcePosToRange, buildLineIndex } from './source/sourcepos';
export { renderPreviewHtml, resolveAssetUrl, resolveLinkUrl } from './material/preview';
export { sanitizeGitLabHtml, sanitizeSvg, isSafeUrl } from './material/sanitize';
export { renderInlineMath, renderBlockMath } from './material/math';
export { renderMermaid, detectTheme } from './material/mermaid';
export { highlightCode } from './material/highlight';
export { ALERT_TYPES, DEFAULT_ALERT_TITLES } from './glfm/constants';
export type { AlertType } from './glfm/constants';

export type {
  DocumentContext,
  EditorError,
  EditorMode,
  EditorServices,
  EditorState,
  GlfmEditorHandle,
  MountedGlfmEditor,
  RenderRequest,
  SaveRequest,
  UploadRequest,
  UploadResult,
} from './core/types';

export type { SourceBaseline, SourceBlock, ImportResult } from './source/types';
