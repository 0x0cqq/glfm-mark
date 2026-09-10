/**
 * GLFM 编辑器 schema：逐个注册扩展，不使用 StarterKit，避免与 GLFM 能力重复。
 *
 * 顺序很重要：文档节点在前，标记与内容节点随后，最后是块身份扩展。
 */
import type { Extensions } from '@tiptap/core';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { Link } from '@tiptap/extension-link';
import { Text } from '@tiptap/extension-text';
import {
  GlfmBlockquote,
  GlfmBold,
  GlfmBulletList,
  GlfmCode,
  GlfmCodeBlock,
  GlfmDocument,
  GlfmHardBreak,
  GlfmHeading,
  GlfmHorizontalRule,
  GlfmItalic,
  GlfmListItem,
  GlfmListKeymap,
  GlfmOrderedList,
  GlfmParagraph,
  GlfmStrike,
} from './extensions/basic';
import {
  GlfmAlert,
  GlfmAlertTitle,
  GlfmDetails,
  GlfmDetailsContent,
  GlfmDetailsSummary,
  GlfmTable,
  GlfmTableCell,
  GlfmTableHeader,
  GlfmTableRow,
  GlfmTaskItem,
  GlfmTaskList,
} from './extensions/structure';
import {
  GlfmEmoji,
  GlfmFootnoteReference,
  GlfmHtmlComment,
  GlfmImage,
  GlfmMathBlock,
  GlfmMathInline,
  GlfmMedia,
  GlfmMermaidBlock,
  GlfmReference,
  GlfmSourceBlock,
  GlfmTableOfContents,
} from './extensions/special';
import { SourceIdExtension } from '../source/source-id';

/** 链接：保留原始地址与引用式链接标记。 */
export const GlfmLink = Link.extend({
  inclusive: false,
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute('href'),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
      },
      isReference: { default: false, rendered: false },
      /** GitLab 返回的展示地址，不参与导出。 */
      canonicalSrc: { default: null, rendered: false },
      isGollumLink: { default: false, rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: 'a[href]:not(.gfm)' }];
  },
  renderHTML({ HTMLAttributes }) {
    const { isReference, canonicalSrc, isGollumLink, ...rest } = HTMLAttributes;
    return ['a', { ...rest, rel: 'noopener noreferrer nofollow' }, 0];
  },
});

/** 返回 GLFM 编辑器使用的完整扩展列表。 */
export function glfmExtensions(): Extensions {
  return [
    GlfmDocument,
    Text,
    UndoRedo,
    Dropcursor,
    Gapcursor,
    GlfmParagraph,
    GlfmHeading,
    GlfmBlockquote,
    GlfmBulletList,
    GlfmOrderedList,
    GlfmListItem,
    GlfmListKeymap,
    GlfmTaskList,
    GlfmTaskItem,
    GlfmCodeBlock,
    GlfmHorizontalRule,
    GlfmHardBreak,
    GlfmAlert,
    GlfmAlertTitle,
    GlfmDetails,
    GlfmDetailsSummary,
    GlfmDetailsContent,
    GlfmTable,
    GlfmTableRow,
    GlfmTableHeader,
    GlfmTableCell,
    GlfmBold,
    GlfmItalic,
    GlfmStrike,
    GlfmCode,
    GlfmLink,
    GlfmImage,
    GlfmMedia,
    GlfmMathInline,
    GlfmMathBlock,
    GlfmMermaidBlock,
    GlfmReference,
    GlfmEmoji,
    GlfmFootnoteReference,
    GlfmTableOfContents,
    GlfmHtmlComment,
    GlfmSourceBlock,
    SourceIdExtension,
  ];
}

export {
  GlfmAlert,
  GlfmAlertTitle,
  GlfmBlockquote,
  GlfmBold,
  GlfmBulletList,
  GlfmCode,
  GlfmCodeBlock,
  GlfmDetails,
  GlfmDetailsContent,
  GlfmDetailsSummary,
  GlfmDocument,
  GlfmEmoji,
  GlfmFootnoteReference,
  GlfmHardBreak,
  GlfmHeading,
  GlfmHorizontalRule,
  GlfmHtmlComment,
  GlfmImage,
  GlfmItalic,
  GlfmListItem,
  GlfmMathBlock,
  GlfmMathInline,
  GlfmMedia,
  GlfmMermaidBlock,
  GlfmOrderedList,
  GlfmParagraph,
  GlfmReference,
  GlfmSourceBlock,
  GlfmStrike,
  GlfmTable,
  GlfmTableCell,
  GlfmTableHeader,
  GlfmTableOfContents,
  GlfmTableRow,
  GlfmTaskItem,
  GlfmTaskList,
};
