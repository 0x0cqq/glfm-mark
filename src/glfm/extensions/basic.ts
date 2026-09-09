/**
 * 基础节点与标记：段落、标题、引用、列表、代码、分隔线、硬换行。
 *
 * 这些扩展只负责 ProseMirror schema 与 HTML 解析规则，Markdown 序列化由
 * `src/glfm/serialize` 单独实现，避免出现第二套序列化入口。
 */
import { Node, mergeAttributes } from '@tiptap/core';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlock from '@tiptap/extension-code-block';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import HardBreak from '@tiptap/extension-hard-break';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Code from '@tiptap/extension-code';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';

/** 段落：保留 `dir` 与 GitLab 的 `data-sourcepos` 供导入阶段读取。 */
export const GlfmParagraph = Paragraph.extend({
  parseHTML() {
    return [{ tag: 'p' }];
  },
});

/** 标题：`level` 直接对应 `#` 数量。 */
export const GlfmHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
    };
  },
});

/** 引用：`multiline` 表示 GLFM 的 `>>>` 多行引用。 */
export const GlfmBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      multiline: {
        default: false,
      },
    };
  },
});

/** 无序列表：保留原始项目符号，未修改时才能原样复用。 */
export const GlfmBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bullet: { default: null },
    };
  },
});

/** 有序列表：保留起始序号与分隔符。 */
export const GlfmOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      delimiter: { default: null },
    };
  },
});

/** 列表项。 */
export const GlfmListItem = ListItem;

/** 代码块：保留语言与附加信息字符串。 */
export const GlfmCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      langParams: { default: null },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const language = (node.attrs.language as string | null) ?? '';
    const attrs: Record<string, string> = {};
    if (language) {
      attrs['data-lang'] = language;
      attrs.class = `language-${language}`;
    }
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-lang': language }),
      ['code', attrs, 0],
    ];
  },
});

/** 分隔线。 */
export const GlfmHorizontalRule = HorizontalRule;

/** 硬换行：GLFM 使用反斜杠加换行导出。 */
export const GlfmHardBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    return {
      'Shift-Enter': () => this.editor.commands.setHardBreak(),
    };
  },
});

/** 粗体：导出为 `**`。 */
export const GlfmBold = Bold;

/** 斜体：导出为 `*`。 */
export const GlfmItalic = Italic;

/** 删除线：导出为 `~~`。 */
export const GlfmStrike = Strike;

/** 行内代码：导出时使用足够长的反引号。 */
export const GlfmCode = Code.extend({
  excludes: undefined,
});

/** 文档根节点。 */
export const GlfmDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'block+',
});
