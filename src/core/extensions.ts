/**
 * 编辑器扩展：在 GLFM schema 之上挂载 Vue 节点视图。
 *
 * schema（`src/glfm/schema.ts`）保持无 DOM 依赖，供源码保留层与测试使用；
 * 本模块只供浏览器端编辑器使用。
 */
import { mergeAttributes, type Extensions } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { glfmExtensions, GlfmLink } from '../glfm/schema';
import { GlfmCodeBlock } from '../glfm/extensions/basic';
import { GlfmDetails, GlfmDetailsSummary } from '../glfm/extensions/structure';
import { GlfmImage, GlfmMathBlock, GlfmMathInline, GlfmMedia, GlfmMermaidBlock, GlfmSourceBlock } from '../glfm/extensions/special';
import { resolveAssetUrl, resolveLinkUrl } from '../material/preview';
import type { DocumentContext } from './types';
import CodeBlockView from '../components/nodeviews/CodeBlockView.vue';
import MathView from '../components/nodeviews/MathView.vue';
import MermaidView from '../components/nodeviews/MermaidView.vue';
import SourceBlockView from '../components/nodeviews/SourceBlockView.vue';
import { FocusDecoration } from './focus-decoration';

/** 带节点视图的代码块。 */
const CodeBlockWithView = GlfmCodeBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(CodeBlockView);
  },
});

/** 带节点视图的源码保留块。 */
const SourceBlockWithView = GlfmSourceBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(SourceBlockView);
  },
});

/** 带节点视图的公式节点。 */
const MathInlineWithView = GlfmMathInline.extend({
  addNodeView() {
    return VueNodeViewRenderer(MathView);
  },
});

const MathBlockWithView = GlfmMathBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(MathView);
  },
});

/** 带节点视图的 Mermaid 节点。 */
const MermaidWithView = GlfmMermaidBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(MermaidView);
  },
});

/** 带节点视图的折叠块。 */
const DetailsWithView = GlfmDetails.extend({
  /** 保持 Material 原生 details/summary 结构；临时展开不回写源码。 */
  addNodeView() {
    return () => {
      const dom = document.createElement('details');
      dom.open = true;
      dom.className = 'glfm-editor__details';
      return {
        dom,
        contentDOM: dom,
        /** 原生展开属性只属于展示。 */
        ignoreMutation: (mutation) => mutation.type === 'attributes' && mutation.target === dom && mutation.attributeName === 'open',
      };
    };
  },
});

/** summary 文字可编辑，独立箭头按钮负责临时展开，避免点击文字时隐藏正在编辑的内容。 */
const DetailsSummaryWithView = GlfmDetailsSummary.extend({
  addNodeView() {
    return () => {
      const dom = document.createElement('summary');
      const contentDOM = document.createElement('span');
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.contentEditable = 'false';
      toggle.className = 'glfm-editor__details-disclosure';
      toggle.setAttribute('aria-label', '展开或收起折叠块');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.textContent = '⌄';
      /** 展开状态属于节点视图，不生成 Markdown 事务。 */
      const onClick = (event: MouseEvent) => {
        event.preventDefault(); event.stopPropagation();
        const details = dom.closest('details');
        if (!details) return;
        details.open = !details.open;
        toggle.setAttribute('aria-expanded', String(details.open));
      };
      toggle.addEventListener('click', onClick);
      dom.append(contentDOM, toggle);
      return {
        dom, contentDOM,
        /** 箭头按钮不参与内容解析；正文与选区仍交由 ProseMirror 处理。 */
        ignoreMutation: (mutation) => mutation.type !== 'selection' && toggle.contains(mutation.target),
        /** 卸载时释放按钮监听器。 */
        destroy: () => toggle.removeEventListener('click', onClick),
      };
    };
  },
});

/** 返回带节点视图和宿主展示地址的编辑器扩展列表。 */
export function editorExtensions(
  context: DocumentContext,
  resolveAssetPreview?: (source: string) => string | undefined,
): Extensions {
  const base = glfmExtensions();

  const ImageWithContext = GlfmImage.extend({
    /** 只替换展示地址，节点中的原始地址用于 Markdown 导出。 */
    renderHTML({ node, HTMLAttributes }) {
      const { displaySrc, ...rest } = HTMLAttributes;
      void displaySrc;
      const original = (node.attrs.src ?? '') as string;
      const source = resolveAssetPreview?.(original) ?? node.attrs.displaySrc ?? original;
      return ['img', mergeAttributes(rest, { src: resolveAssetUrl(source ?? '', context) })];
    },
  });

  const MediaWithContext = GlfmMedia.extend({
    /** 音视频和附件沿用图片的资源基准地址。 */
    renderHTML({ node, HTMLAttributes }) {
      const { source, kind, sourceId, ...rest } = HTMLAttributes;
      void source;
      void kind;
      void sourceId;
      const asset = node.attrs.src as string | null;
      const attrs = mergeAttributes(rest, asset ? { src: resolveAssetUrl(asset, context) } : {});
      if (node.attrs.kind === 'audio') return ['audio', mergeAttributes(attrs, { controls: '', preload: 'none' })];
      if (node.attrs.kind === 'video') return ['video', mergeAttributes(attrs, { controls: '', preload: 'none' })];
      return ['a', mergeAttributes(attrs, { 'data-media-file': '' }), node.attrs.alt ?? ''];
    },
  });

  const LinkWithContext = GlfmLink.extend({
    /** 链接展示使用文档基准地址，标记仍保留原始 href。 */
    renderHTML({ HTMLAttributes }) {
      const { isReference, canonicalSrc, isGollumLink, ...rest } = HTMLAttributes;
      void isReference;
      void canonicalSrc;
      void isGollumLink;
      const href = rest.href as string | undefined;
      return ['a', { ...rest, href: resolveLinkUrl(href ?? '', context), rel: 'noopener noreferrer nofollow' }, 0];
    },
  });

  return [FocusDecoration, ...base.map((extension) => {
    const name = extension.name;
    if (name === GlfmCodeBlock.name) return CodeBlockWithView;
    if (name === GlfmSourceBlock.name) return SourceBlockWithView;
    if (name === GlfmMathInline.name) return MathInlineWithView;
    if (name === GlfmMathBlock.name) return MathBlockWithView;
    if (name === GlfmMermaidBlock.name) return MermaidWithView;
    if (name === GlfmImage.name) return ImageWithContext;
    if (name === GlfmMedia.name) return MediaWithContext;
    if (name === GlfmLink.name) return LinkWithContext;
    if (name === GlfmDetailsSummary.name) return DetailsSummaryWithView;
    if (name === GlfmDetails.name) return DetailsWithView;
    return extension;
  })];
}
