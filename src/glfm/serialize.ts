/**
 * GLFM Markdown 序列化：把 ProseMirror 节点树转换为 GLFM 方言的 Markdown。
 *
 * 这是项目中唯一的 Markdown 序列化入口。块级结构由本模块直接拼装，行内内容
 * 交给 `prosemirror-markdown` 的 `MarkdownSerializerState.renderInline`，从而
 * 复用其成熟的标记、转义与空白处理，同时完全控制块之间的空白。
 *
 * 规则参考 GitLab Content Editor（commit 03487409d7cdbf472341472b0083743132e9abe0）
 * `app/assets/javascripts/content_editor/services/serializer/*`，按本项目的节点
 * 命名与源码保留要求重写，不引入上游的应用级依赖。
 */
import { MarkdownSerializer, MarkdownSerializerState } from 'prosemirror-markdown';
import type { Mark as ProseMirrorMark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { DEFAULT_ALERT_TITLES, type AlertType } from './constants';

/** 序列化选项。 */
export interface SerializeOptions {
  /** 换行符，默认 `\n`。 */
  eol?: string;
}

/** 计算足以安全包裹内容的反引号围栏。 */
export function fenceFor(content: string, minimum = 3): string {
  let size = minimum;
  for (const run of content.match(/`+/g) ?? []) {
    if (run.length >= size) size = run.length + 1;
  }
  return '`'.repeat(size);
}

/** 转义链接地址中的括号与引号。 */
export function escapeLink(text: string): string {
  return text.replace(/[()"]/g, '\\$&');
}

/** 把标题文本包装为带引号的 Markdown 标题。 */
export function quoteTitle(title: string): string {
  return `"${title.replace(/"/g, '\\"')}"`;
}

/** 按前缀给多行文本加标记，空行使用单独的前缀。 */
function prefixLines(text: string, prefix: string, blankPrefix: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? blankPrefix : `${prefix}${line}`))
    .join('\n');
}

/** 把续行缩进到与首行内容对齐。 */
function indentContinuation(text: string, indent: string): string {
  const [first, ...rest] = text.split('\n');
  if (rest.length === 0) return first;
  return [first, ...rest.map((line) => (line === '' ? line : `${indent}${line}`))].join('\n');
}

/** 行内代码的定界反引号。 */
function inlineCodeFence(content: string): string {
  let size = 1;
  for (const run of content.match(/`+/g) ?? []) {
    if (run.length >= size) size = run.length + 1;
  }
  return '`'.repeat(size);
}

/** 判断链接是否应输出为 GFM 自动链接。 */
function isAutoLink(mark: ProseMirrorMark, parent: ProseMirrorNode): boolean {
  const href = mark.attrs.href as string | null;
  const title = mark.attrs.title as string | null;
  if (!href || title) return false;
  if (!/^\w+:/.test(href)) return false;
  return parent.textContent === href;
}

/** 行内标记的序列化配置。 */
const markSerializers = {
  bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
  italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  code: {
    open: (state: MarkdownSerializerState, _mark: ProseMirrorMark, parent: ProseMirrorNode) => {
      const fence = inlineCodeFence(parent.textContent);
      const padded = /^`|`$/.test(parent.textContent) ? ' ' : '';
      void state;
      return `${fence}${padded}`;
    },
    close: (state: MarkdownSerializerState, _mark: ProseMirrorMark, parent: ProseMirrorNode) => {
      const fence = inlineCodeFence(parent.textContent);
      const padded = /^`|`$/.test(parent.textContent) ? ' ' : '';
      void state;
      return `${padded}${fence}`;
    },
    mixable: true,
    escape: false,
  },
  link: {
    open: (_state: MarkdownSerializerState, mark: ProseMirrorMark, parent: ProseMirrorNode) => {
      if (!mark.attrs.href || isAutoLink(mark, parent)) return '';
      return '[';
    },
    close: (_state: MarkdownSerializerState, mark: ProseMirrorMark, parent: ProseMirrorNode) => {
      const href = mark.attrs.href as string | null;
      const title = mark.attrs.title as string | null;
      if (!href || isAutoLink(mark, parent)) return '';

      const escaped = escapeLink(href);
      if (mark.attrs.isReference) return `][${escaped}]`;
      return `](${escaped}${title ? ` ${quoteTitle(title)}` : ''})`;
    },
  },
};

/** 行内节点的序列化处理，供 `renderInline` 调用。 */
const inlineNodeSerializers: Record<
  string,
  (state: MarkdownSerializerState, node: ProseMirrorNode) => void
> = {
  text: (state, node) => {
    state.text(node.text ?? '');
  },
  hardBreak: (state) => {
    state.write('\\');
    state.ensureNewLine();
  },
  image: (state, node) => {
    const { src, alt, title, width, height, isReference } = node.attrs as Record<string, string>;
    if (!src) return;

    const escapedSrc = escapeLink(src);
    const source = isReference
      ? `[${escapedSrc}]`
      : `(${escapedSrc}${title ? ` ${quoteTitle(title)}` : ''})`;
    const sizes: string[] = [];
    if (width) sizes.push(`width=${JSON.stringify(width)}`);
    if (height) sizes.push(`height=${JSON.stringify(height)}`);
    const attributes = sizes.length ? `{${sizes.join(' ')}}` : '';

    state.write(`![${(alt ?? '').replace(/[[\]]/g, '\\$&')}]${source}${attributes}`);
  },
  media: (state, node) => {
    const source = node.attrs.source as string;
    if (source) {
      state.write(source);
      return;
    }

    const { src, alt, title } = node.attrs as Record<string, string>;
    if (!src) return;
    state.write(`![${alt ?? ''}](${escapeLink(src)}${title ? ` ${quoteTitle(title)}` : ''})`);
  },
  mathInline: (state, node) => {
    const delimiter = (node.attrs.delimiter as string) || '$`';
    const closer = delimiter === '$`' ? '`$' : delimiter;
    state.write(`${delimiter}${node.attrs.source as string}${closer}`);
  },
  reference: (state, node) => {
    state.write((node.attrs.originalText as string) ?? '');
  },
  emoji: (state, node) => {
    state.write(`:${node.attrs.name}:`);
  },
  footnoteReference: (state, node) => {
    state.write(`[^${node.attrs.label}]`);
  },
};

/** 行内节点与段落序列化配置，供 `serializeInline` 使用。 */
const inlineSerializers: Record<string, unknown> = {
  ...inlineNodeSerializers,
  paragraph: (state: MarkdownSerializerState, node: ProseMirrorNode) => {
    state.renderInline(node);
  },
  heading: (state: MarkdownSerializerState, node: ProseMirrorNode) => {
    state.renderInline(node);
  },
};

/** 行内序列化器：只用公开 API 渲染段落内的行内内容。 */
const inlineSerializer = new MarkdownSerializer(
  inlineSerializers as never,
  markSerializers as never,
  { strict: true, escapeExtraCharacters: /<|>/g },
);

/** 把节点的行内内容序列化为 Markdown 字符串。 */
export function serializeInline(parent: ProseMirrorNode): string {
  const schema = parent.type.schema;
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) throw new Error('schema 缺少 paragraph 节点');

  const wrapper = schema.topNodeType.create(null, paragraph.create(null, parent.content));
  return inlineSerializer.serialize(wrapper);
}

/** 序列化单个顶层块节点。 */
export function serializeBlock(node: ProseMirrorNode, options: SerializeOptions = {}): string {
  return renderBlock(node, options);
}

/** 序列化整份文档。 */
export function serializeDocument(
  doc: ProseMirrorNode,
  options: SerializeOptions = {},
): string {
  const blocks: string[] = [];
  doc.forEach((child) => {
    const rendered = renderBlock(child, options);
    if (rendered !== '') blocks.push(rendered);
  });
  return blocks.join(`${options.eol ?? '\n'}${options.eol ?? '\n'}`);
}

/** 序列化容器内的多个块，使用空行分隔。 */
function renderBlocks(parent: ProseMirrorNode, options: SerializeOptions): string {
  const blocks: string[] = [];
  parent.forEach((child) => {
    const rendered = renderBlock(child, options);
    if (rendered !== '') blocks.push(rendered);
  });
  return blocks.join('\n\n');
}

/** 渲染单个块级节点。 */
function renderBlock(node: ProseMirrorNode, options: SerializeOptions): string {
  const eol = options.eol ?? '\n';

  switch (node.type.name) {
    case 'paragraph':
      return serializeInline(node);

    case 'heading':
      return `${'#'.repeat(node.attrs.level as number)} ${serializeInline(node)}`;

    case 'blockquote': {
      const body = renderBlocks(node, options);
      if (node.attrs.multiline) {
        return `>>>${eol}${body}${eol}>>>`;
      }
      return prefixLines(body, '> ', '>');
    }

    case 'alert':
      return renderAlert(node, options);

    case 'bulletList':
      return renderList(node, options, () => '- ');

    case 'orderedList':
      return renderOrderedList(node, options);

    case 'taskList':
      return renderTaskList(node, options);

    case 'codeBlock':
      return renderFence(node, codeBlockInfo(node), options);

    case 'mathBlock':
      return renderFence(node, (node.attrs.info as string) || 'math', options);

    case 'mermaidBlock':
      return renderFence(node, 'mermaid', options);

    case 'sourceBlock':
      return node.textContent;

    case 'htmlComment':
      return `<!--${node.attrs.description ?? ''}-->`;

    case 'horizontalRule':
      return '---';

    case 'table':
      return renderTable(node, options);

    case 'details':
      return renderDetails(node, options);

    case 'tableOfContents':
      return (node.attrs.source as string) || '[[_TOC_]]';

    case 'listItem':
      return renderBlocks(node, options);

    default:
      // 未知块级节点：输出其文本内容，避免静默丢弃。
      return node.isTextblock ? serializeInline(node) : renderBlocks(node, options);
  }
}

/**
 * 渲染列表项的块内容。
 *
 * 列表项含多个段落时使用空行连接（CommonMark 的松散列表），否则用换行连接，
 * 使嵌套列表紧跟在段落之后。
 */
function renderListItemBlocks(item: ProseMirrorNode, options: SerializeOptions): string {
  const blocks: string[] = [];
  let paragraphCount = 0;

  item.forEach((child) => {
    if (child.type.name === 'paragraph') paragraphCount += 1;
    const rendered = renderBlock(child, options);
    if (rendered !== '') blocks.push(rendered);
  });

  return blocks.join(paragraphCount > 1 ? '\n\n' : '\n');
}

/** 提示块：输出 `> [!TYPE]` 引用结构。 */
function renderAlert(node: ProseMirrorNode, options: SerializeOptions): string {
  const type = (node.attrs.type as AlertType) ?? 'note';
  let marker = `[!${type.toUpperCase()}]`;

  const titleNode = node.childCount > 0 && node.child(0).type.name === 'alertTitle'
    ? node.child(0)
    : null;
  const title = titleNode?.textContent.trim() ?? '';
  if (title && title !== DEFAULT_ALERT_TITLES[type]) {
    marker += ` ${title}`;
  }

  const bodyNodes: ProseMirrorNode[] = [];
  node.forEach((child) => {
    if (child.type.name !== 'alertTitle') bodyNodes.push(child);
  });

  const body = bodyNodes
    .map((child) => renderBlock(child, options))
    .filter((value) => value !== '')
    .join('\n>\n');

  const content = body ? `${marker}\n${body}` : marker;
  return prefixLines(content, '> ', '>');
}

/** 围栏代码块：围栏长度按内容中最长反引号串调整。 */
function renderFence(node: ProseMirrorNode, info: string, options: SerializeOptions): string {
  const eol = options.eol ?? '\n';
  const content = node.textContent;
  const fence = fenceFor(content);
  const body = content.endsWith('\n') ? content.slice(0, -1) : content;
  return `${fence}${info}${eol}${body}${eol}${fence}`;
}

/** 代码块的信息字符串。 */
function codeBlockInfo(node: ProseMirrorNode): string {
  const language = (node.attrs.language as string) ?? '';
  const params = (node.attrs.langParams as string) ?? '';
  return `${language}${params ? `:${params}` : ''}`;
}

/** 无序列表。 */
function renderList(
  node: ProseMirrorNode,
  options: SerializeOptions,
  markerFor: (index: number) => string,
): string {
  const items: string[] = [];
  node.forEach((item, _offset, index) => {
    const marker = markerFor(index);
    const body = renderListItemBlocks(item, options);
    const indented = indentContinuation(body, ' '.repeat(marker.length));
    items.push(`${marker}${indented}`);
  });
  return items.join('\n');
}

/** 有序列表：保留起始序号与分隔符。 */
function renderOrderedList(node: ProseMirrorNode, options: SerializeOptions): string {
  const start = (node.attrs.start as number) ?? 1;
  const delimiter = (node.attrs.delimiter as string) ?? '.';
  const maxWidth = String(start + node.childCount - 1).length;

  return renderList(node, options, (index) => {
    const number = String(start + index);
    return `${' '.repeat(maxWidth - number.length)}${number}${delimiter} `;
  });
}

/** 任务列表：输出勾选状态。 */
function renderTaskList(node: ProseMirrorNode, options: SerializeOptions): string {
  const items: string[] = [];
  node.forEach((item) => {
    const symbol = item.attrs.inapplicable ? '~' : item.attrs.checked ? 'x' : ' ';
    const marker = `- [${symbol}] `;
    const body = renderListItemBlocks(item, options);
    items.push(`${marker}${indentContinuation(body, ' '.repeat(marker.length))}`);
  });
  return items.join('\n');
}

/** 表格：输出 GLFM 管道表格。 */
function renderTable(node: ProseMirrorNode, options: SerializeOptions): string {
  const eol = options.eol ?? '\n';
  const rows: ProseMirrorNode[] = [];
  node.forEach((row) => rows.push(row));
  if (rows.length === 0) return '';

  const rendered: string[][] = [];
  const aligns: (string | null)[] = [];

  rows.forEach((row, rowIndex) => {
    const cells: string[] = [];
    row.forEach((cell, _cellOffset, cellIndex) => {
      if (rowIndex === 0) aligns[cellIndex] = (cell.attrs.align as string | null) ?? null;
      cells.push(serializeInline(cell).replace(/\|/g, '\\|'));
    });
    rendered.push(cells);
  });

  const columnCount = Math.max(...rendered.map((cells) => cells.length));
  const widths = Array.from({ length: columnCount }, (_, column) =>
    Math.max(3, ...rendered.map((cells) => (cells[column] ?? '').length)),
  );

  const formatRow = (cells: string[]) =>
    `| ${Array.from({ length: columnCount }, (_, column) =>
      (cells[column] ?? '').padEnd(widths[column]),
    ).join(' | ')} |`;

  const divider = Array.from({ length: columnCount }, (_, column) => {
    const align = aligns[column];
    const width = widths[column];
    if (align === 'center') return `:${'-'.repeat(Math.max(1, width - 2))}:`;
    if (align === 'right') return `${'-'.repeat(Math.max(1, width - 1))}:`;
    if (align === 'left') return `:${'-'.repeat(Math.max(1, width - 1))}`;
    return '-'.repeat(width);
  });
  const lines = [formatRow(rendered[0]), `| ${divider.join(' | ')} |`];
  for (let i = 1; i < rendered.length; i += 1) {
    lines.push(formatRow(rendered[i]));
  }

  return lines.join(eol);
}

/** 折叠块：输出 `<details>` 与 `<summary>`。 */
function renderDetails(node: ProseMirrorNode, options: SerializeOptions): string {
  const eol = options.eol ?? '\n';
  const parts: string[] = [`<details${node.attrs.open ? ' open' : ''}>`];

  node.forEach((child) => {
    if (child.type.name === 'detailsSummary') {
      parts.push(`<summary>${serializeInline(child)}</summary>`);
    } else if (child.type.name === 'detailsContent') {
      const body = renderBlocks(child, options);
      if (body !== '') parts.push(body);
    }
  });

  parts.push('</details>');
  return parts.join(eol);
}
/** 兼容旧调用：返回带 `serialize` 方法的序列化器。 */
export function createGlfmSerializer() {
  return {
    /** 序列化文档或单个顶层块节点。 */
    serialize(node: ProseMirrorNode, options: SerializeOptions = {}) {
      if (node.type.name === 'doc') return serializeDocument(node, options);
      return serializeBlock(node, options);
    },
    /** 只序列化行内内容。 */
    serializeInline,
  };
}

/** 序列化器类型。 */
export type GlfmSerializer = ReturnType<typeof createGlfmSerializer>;
