/**
 * GLFM 专用内容节点：公式、Mermaid、图片与媒体、引用、Emoji、脚注、目录、
 * 源码保留块。
 *
 * 这些节点都保留“原始写法”属性，导出时优先复用原始写法，避免 GitLab
 * 展示信息覆盖源码。
 */
import { Node, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import {
  DEFAULT_BLOCK_MATH_DELIMITER,
  DEFAULT_INLINE_MATH_DELIMITER,
  SOURCE_BLOCK,
} from '../constants';

/**
 * 行内公式：展示 KaTeX，`source` 保存公式原文，`delimiter` 保存原始定界符。
 */
export const GlfmMathInline = Node.create({
  name: 'mathInline',
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (element) => element.textContent ?? '',
      },
      delimiter: {
        default: DEFAULT_INLINE_MATH_DELIMITER,
      },
    };
  },

  parseHTML() {
    // 优先级高于普通 code 标记，避免行内公式被当作代码。
    return [{ tag: 'code[data-math-style="inline"]', priority: 70 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'code',
      mergeAttributes(HTMLAttributes, { 'data-math-style': 'inline' }),
      node.attrs.source,
    ];
  },
});

/**
 * 块级公式：`math` 围栏或 `$$...$$` 结构。
 *
 * `delimiter` 保存原始围栏（含反引号数量），`info` 保存围栏信息字符串。
 */
export const GlfmMathBlock = Node.create({
  name: 'mathBlock',
  content: 'text*',
  marks: '',
  group: 'block',
  defining: true,
  code: true,

  addAttributes() {
    return {
      delimiter: { default: DEFAULT_BLOCK_MATH_DELIMITER },
      info: { default: 'math' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        priority: 70,
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const code = element.querySelector('code');
          const isDisplayMath =
            code?.getAttribute('data-math-style') === 'display' ||
            code?.classList.contains('language-math');
          return isDisplayMath ? {} : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { info, sourceId, ...rest } = HTMLAttributes;
    void info;
    void sourceId;
    return [
      'pre',
      mergeAttributes(rest, { 'data-math-block': '' }),
      ['code', { class: 'language-math' }, 0],
    ];
  },
});

/** Mermaid 图表：`mermaid` 围栏，展示时逐节点渲染 SVG。 */
export const GlfmMermaidBlock = Node.create({
  name: 'mermaidBlock',
  content: 'text*',
  marks: '',
  group: 'block',
  defining: true,
  code: true,

  addAttributes() {
    return {
      info: { default: 'mermaid' },
      delimiter: { default: '```' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        priority: 70,
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const code = element.querySelector('code');
          const isMermaid =
            code?.classList.contains('language-mermaid') ||
            element.getAttribute('data-canonical-lang') === 'mermaid';
          return isMermaid ? {} : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { info, sourceId, ...rest } = HTMLAttributes;
    void info;
    void sourceId;
    return [
      'pre',
      mergeAttributes(rest, { 'data-mermaid-block': '' }),
      ['code', { class: 'language-mermaid' }, 0],
    ];
  },
});

/**
 * 图片：`src` 为源码中的原始地址，`displaySrc` 为展示地址。
 *
 * 两个地址分开保存，导出始终使用 `src`。
 */
export const GlfmImage = Image.extend({
  inline: true,
  group: 'inline',
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute('alt'),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
      },
      width: { default: null },
      height: { default: null },
      isReference: { default: false },
      /** 展示地址，不参与导出。 */
      displaySrc: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      { tag: 'img[src]' },
      {
        tag: 'span.media-container img[src]',
        priority: 60,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { displaySrc, ...rest } = HTMLAttributes;
    return ['img', mergeAttributes(rest, { src: node.attrs.displaySrc ?? node.attrs.src })];
  },
});

/**
 * 音频、视频与其他附件：原子行内节点。
 *
 * 未修改时保留原文，新上传文件使用宿主返回的 Markdown。
 */
export const GlfmMedia = Node.create({
  name: 'media',
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      /** 源码中的原始 Markdown 写法。 */
      source: { default: '' },
      kind: { default: 'file' },
      src: { default: null },
      title: { default: null },
      alt: { default: null },
    };
  },

  parseHTML() {
    return [
      { tag: 'audio[src]' },
      { tag: 'video[src]' },
      { tag: 'audio source[src]' },
      { tag: 'video source[src]' },
      { tag: 'span.media-container audio' },
      { tag: 'span.media-container video' },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = node.attrs.kind;
    if (kind === 'audio') {
      return ['audio', mergeAttributes(HTMLAttributes, { controls: '', preload: 'none' })];
    }
    if (kind === 'video') {
      return ['video', mergeAttributes(HTMLAttributes, { controls: '', preload: 'none' })];
    }
    return ['a', mergeAttributes(HTMLAttributes, { 'data-media-file': '' })];
  },
});

/**
 * GitLab 引用：原子行内节点。
 *
 * `originalText` 保存用户输入的引用原文，导出始终使用它；GitLab 返回的
 * 展示标题只用于展示。
 */
export const GlfmReference = Node.create({
  name: 'reference',
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      originalText: { default: '' },
      referenceType: { default: null },
      href: { default: null, rendered: false },
      text: { default: null, rendered: false },
      className: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'a.gfm:not([data-link="true"])' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { originalText, ...rest } = HTMLAttributes;
    return [
      'a',
      mergeAttributes(rest, {
        class: `glfm-editor__reference gfm${node.attrs.className ? ` ${node.attrs.className}` : ''}`,
        href: node.attrs.href ?? undefined,
      }),
      node.attrs.text || node.attrs.originalText,
    ];
  },
});

/** Emoji 短代码：显示 GitLab 返回的 Emoji，导出保留短代码。 */
export const GlfmEmoji = Node.create({
  name: 'emoji',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: { default: '' },
      moji: { default: null, rendered: false },
      title: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'gl-emoji' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { name, moji, title, ...rest } = HTMLAttributes;
    return [
      'span',
      mergeAttributes(rest, {
        class: 'glfm-editor__emoji',
        'data-name': name,
        title: title ?? `:${name}:`,
      }),
      moji ?? `:${node.attrs.name}:`,
    ];
  },
});

/** 脚注引用：原子行内节点，保留原标识。 */
export const GlfmFootnoteReference = Node.create({
  name: 'footnoteReference',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      label: { default: '' },
      identifier: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'sup.footnote-ref' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { label, ...rest } = HTMLAttributes;
    return [
      'sup',
      mergeAttributes(rest, { class: 'footnote-ref glfm-editor__footnote-ref' }),
      `[^${node.attrs.label}]`,
    ];
  },
});

/** GLFM 目录标记：编辑区显示占位卡片，预览交给服务端结果。 */
export const GlfmTableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      /** 原始标记写法，`[[_TOC_]]` 或 `[TOC]`。 */
      source: { default: '[[_TOC_]]' },
    };
  },

  parseHTML() {
    return [{ tag: 'ul.section-nav' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'glfm-editor__toc-placeholder' }),
      node.attrs.source,
    ];
  },
});

/** HTML 注释：源码保留节点。 */
export const GlfmHtmlComment = Node.create({
  name: 'htmlComment',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      description: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'comment' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'glfm-editor__html-comment' }),
      `<!--${node.attrs.description}-->`,
    ];
  },
});

/**
 * 源码保留块：保存无法结构化编辑的原文。
 *
 * 修改后按当前源码文本导出，不做任何结构转换。
 */
export const GlfmSourceBlock = Node.create({
  name: SOURCE_BLOCK,
  content: 'text*',
  marks: '',
  group: 'block',
  defining: true,
  code: true,
  selectable: true,

  addAttributes() {
    return {
      /** 源码保留原因，用于界面提示，不参与导出。 */
      reason: { default: 'unknown', rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'pre[data-glfm-source-block]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { reason, ...rest } = HTMLAttributes;
    return [
      'pre',
      mergeAttributes(rest, { 'data-glfm-source-block': '', 'data-reason': node.attrs.reason }),
      ['code', {}, 0],
    ];
  },
});

/** 展示用的源码保留节点类型名，供其他模块引用。 */
export { SOURCE_BLOCK };
