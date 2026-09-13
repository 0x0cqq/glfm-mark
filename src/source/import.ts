/**
 * 把 本地生成的 GLFM HTML 转换为 ProseMirror 文档，并建立源码块区间。
 *
 * 流程（设计文档 §4.3）：
 * 1. 保留原始 Markdown 字符串。
 * 2. 建立行索引，用于把 UTF-8 字节列换算成 UTF-16 偏移。
 * 3. 读取顶层元素的 `data-sourcepos` 得到区间。
 * 4. 按源码顺序建立互不重叠的块。
 * 5. 块之间剩余的空白记入间隔，含有实际内容的剩余区间成为源码保留块。
 * 6. 校验拼接结果必须严格等于输入原文。
 */
import { DOMParser as ProseMirrorDOMParser, type Schema } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { sanitizeGitLabHtml } from '../material/sanitize';
import { renderMarkdown as renderLocalMarkdown } from '../glfm/render';
import { semanticSnapshot } from './semantic';
import { SOURCE_ID_ATTR, nextSourceId } from './source-id';
import { buildLineIndex, parseSourcePos, sourcePosToRange, type LineIndex } from './sourcepos';
import type { ImportResult, SourceBaseline, SourceBlock } from './types';

/** 判断文本是否全部为空白。 */
function isBlank(text: string): boolean {
  return /^[\s\uFEFF]*$/.test(text);
}

/** 计算默认换行符：占多数的 LF 或 CRLF，数量相同或无换行时使用 LF。 */
function detectDefaultEol(markdown: string): '\n' | '\r\n' {
  const crlf = (markdown.match(/\r\n/g) ?? []).length;
  const lf = (markdown.match(/\n/g) ?? []).length - crlf;
  return crlf > lf ? '\r\n' : '\n';
}

/** 顶层块候选：从 HTML 顶层元素收集的源码区间。 */
interface RangeCandidate {
  from: number;
  to: number;
  element: Element;
}

/**
 * 从净化后的 HTML 顶层元素收集 sourcepos 区间。
 *
 * 无法解析或越界的区间被忽略；重叠区间保留最先出现的那个，其余降级。
 */
function collectRanges(root: ParentNode, markdown: string, index: LineIndex): RangeCandidate[] {
  const candidates: RangeCandidate[] = [];

  root.childNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    const sourcePos = parseSourcePos(node.getAttribute('data-sourcepos'));
    if (!sourcePos) return;

    const range = sourcePosToRange(markdown, index, sourcePos);
    if (!range) return;

    candidates.push({ ...range, element: node });
  });

  candidates.sort((a, b) => a.from - b.from);

  const accepted: RangeCandidate[] = [];
  let cursor = -1;
  for (const candidate of candidates) {
    if (candidate.from < cursor) continue;
    accepted.push(candidate);
    cursor = candidate.to;
  }

  return accepted;
}

/** 从 HTML 片段解析出单个顶层块节点。 */
function parseBlock(schema: Schema, html: string): ProseMirrorNode | null {
  if (typeof document === 'undefined') return null;

  const container = document.createElement('div');
  container.innerHTML = html;

  const parser = ProseMirrorDOMParser.fromSchema(schema);
  const doc = parser.parse(container);
  if (doc.childCount !== 1) return null;

  const node = doc.child(0);
  if (!node.isBlock || node.isInline) return null;
  return node;
}

/** 创建带源码身份的节点。 */
function withSourceId(node: ProseMirrorNode, id: string): ProseMirrorNode {
  return node.type.create(
    { ...node.attrs, [SOURCE_ID_ATTR]: id },
    node.content,
    node.marks,
  );
}

/** 创建源码保留节点。 */
function createSourceBlock(
  schema: Schema,
  raw: string,
  id: string,
  reason: string,
): ProseMirrorNode {
  const type = schema.nodes.sourceBlock;
  if (!type) throw new Error('schema 缺少 sourceBlock 节点');
  return type.create({ [SOURCE_ID_ATTR]: id, reason }, raw ? schema.text(raw) : undefined);
}

/** 把整篇文档作为单个源码块载入。 */
function buildDegradedResult(
  markdown: string,
  schema: Schema,
  defaultEol: '\n' | '\r\n',
): ImportResult {
  const id = nextSourceId();
  const node = createSourceBlock(schema, markdown, id, 'no-sourcepos');
  const doc = schema.topNodeType.create(null, node);

  return {
    doc,
    baseline: {
      markdown,
      blocks: [
        { id, from: 0, to: markdown.length, raw: markdown, initialSemantic: semanticSnapshot(node) },
      ],
      gaps: ['', ''],
      defaultEol,
    },
    degraded: true,
  };
}

/** 按“间隔 + 块原文”拼接基线，用于校验区间是否覆盖全文。 */
function assemble(baseline: SourceBaseline): string {
  let result = '';
  for (let i = 0; i < baseline.blocks.length; i += 1) {
    result += baseline.gaps[i] ?? '';
    result += baseline.blocks[i].raw;
  }
  result += baseline.gaps[baseline.blocks.length] ?? '';
  return result;
}

/**
 * 导入 Markdown：调用本地解析器、净化 HTML、解析节点并建立源码基线。
 *
 * 渲染结果缺少可靠 sourcepos 时，整篇作为单个源码块载入，`degraded` 为 true。
 */
export async function importMarkdown(
  markdown: string,
  schema: Schema,
  renderMarkdown: (markdown: string) => Promise<{ html: string }> = renderLocalMarkdown,
): Promise<ImportResult> {
  const defaultEol = detectDefaultEol(markdown);

  // 纯空白文档：建立空基线，不调用渲染服务。
  if (isBlank(markdown)) {
    const doc = schema.topNodeType.createAndFill();
    if (!doc) throw new Error('无法创建空文档');
    return {
      doc,
      baseline: { markdown, blocks: [], gaps: [markdown], defaultEol },
      degraded: false,
    };
  }

  const { html } = await renderMarkdown(markdown);
  const clean = sanitizeGitLabHtml(html);

  const index = buildLineIndex(markdown);
  const container = document.createElement('div');
  container.innerHTML = clean;

  const ranges = collectRanges(container, markdown, index);
  if (ranges.length === 0) {
    return buildDegradedResult(markdown, schema, defaultEol);
  }
  const blocks: SourceBlock[] = [];
  const gaps: string[] = [];
  const nodes: ProseMirrorNode[] = [];
  let cursor = 0;
  /** 下一个块之前的待定间隔文本。 */
  let pendingGap = '';

  /** 把待定间隔写入 gaps。 */
  const flushGap = () => {
    gaps.push(pendingGap);
    pendingGap = '';
  };

  /**
   * 处理两个已识别块之间的剩余区间。
   *
   * 空白累计到间隔；含有实际内容时成为源码保留块，保证内容不丢失。
   */
  const consumeGap = (from: number, to: number) => {
    const raw = markdown.slice(from, to);
    if (isBlank(raw)) {
      pendingGap += raw;
      return;
    }

    flushGap();
    const id = nextSourceId();
    const node = createSourceBlock(schema, raw, id, 'unrendered');
    blocks.push({ id, from, to, raw, initialSemantic: semanticSnapshot(node) });
    nodes.push(node);
  };

  for (const range of ranges) {
    if (range.from < cursor) {
      return buildDegradedResult(markdown, schema, defaultEol);
    }

    consumeGap(cursor, range.from);

    const block = parseBlock(schema, range.element.outerHTML);
    if (!block) {
      return buildDegradedResult(markdown, schema, defaultEol);
    }

    flushGap();

    const raw = markdown.slice(range.from, range.to);
    const id = nextSourceId();
    const identified = withSourceId(block, id);

    blocks.push({
      id,
      from: range.from,
      to: range.to,
      raw,
      initialSemantic: semanticSnapshot(identified),
    });
    nodes.push(identified);
    cursor = range.to;
  }

  consumeGap(cursor, markdown.length);
  flushGap();

  const doc = schema.topNodeType.create(null, nodes);
  const baseline: SourceBaseline = { markdown, blocks, gaps, defaultEol };

  if (assemble(baseline) !== markdown) {
    return buildDegradedResult(markdown, schema, defaultEol);
  }

  return { doc, baseline, degraded: false };
}

/** 供测试与调试使用：按基线拼接原文。 */
export { assemble as assembleBaseline };

/** 判断原文是否只包含空白，用于区分空文档。 */
export { isBlank as isBlankSource };
