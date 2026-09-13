/**
 * 局部导出：按当前顶层节点顺序决定复用原文还是重新序列化。
 *
 * 规则（设计文档 §4.5）：
 * 1. 整份语义文档恢复到基线时，直接返回完整原文。
 * 2. 节点具有基线 ID 且语义与初始节点一致时，使用 `raw`。
 * 3. 源码保留节点被修改时，输出其当前源码文本。
 * 4. 其他新增或修改节点使用 GLFM serializer。
 * 5. 被删除节点不输出。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { GlfmSerializer } from '../glfm/serialize';
import { DEFAULT_BLOCK_SEPARATOR } from '../glfm/constants';
import { semanticSnapshot } from './semantic';
import { getSourceId } from './source-id';
import type { SourceBaseline } from './types';

/** 单个顶层块的导出结果。 */
interface RenderedBlock {
  text: string;
  /** 是否复用了原始字符串。 */
  reused: boolean;
  /** 对应基线块的下标，未命中时为 -1。 */
  baselineIndex: number;
}

/** 序列化单个顶层节点。 */
function serializeBlock(serializer: GlfmSerializer, node: ProseMirrorNode): string {
  return serializer.serialize(node);
}

/**
 * 导出当前文档为 Markdown。
 *
 * `baseline` 为空时全部重新序列化，用于尚未导入的文档。
 */
export function exportMarkdown(
  doc: ProseMirrorNode,
  baseline: SourceBaseline | null,
  serializer: GlfmSerializer,
  blockStarts?: number[],
): string {
  if (blockStarts) blockStarts.length = 0;
  const nodes: ProseMirrorNode[] = [];
  doc.forEach((node) => nodes.push(node));

  // 空文档返回空字符串；撤销回原始的纯空白文档时返回基线原文。
  if (nodes.length === 0) {
    if (baseline && baseline.blocks.length === 0) return baseline.markdown;
    return '';
  }

  const baselineIndex = new Map<string, number>();
  baseline?.blocks.forEach((block, index) => {
    baselineIndex.set(block.id, index);
  });

  const rendered: RenderedBlock[] = nodes.map((node) => {
    const id = getSourceId(node);
    const index = id ? (baselineIndex.get(id) ?? -1) : -1;
    const block = index >= 0 ? baseline?.blocks[index] : undefined;

    if (block && semanticSnapshot(node) === block.initialSemantic) {
      return { text: block.raw, reused: true, baselineIndex: index };
    }

    return {
      text: serializeBlock(serializer, node),
      reused: false,
      baselineIndex: index,
    };
  });

  // 整份文档与基线完全一致时直接返回原文。
  if (baseline && isUnchanged(rendered, baseline)) {
    blockStarts?.push(...baseline.blocks.map((block) => block.from));
    return baseline.markdown;
  }

  // 基线原本没有源码块（纯空白文档），当前内容也全为空时返回基线原文。
  if (
    baseline &&
    baseline.blocks.length === 0 &&
    rendered.every((block) => block.text.trim() === '')
  ) {
    blockStarts?.push(0);
    return baseline.markdown;
  }

  const parts: string[] = [];
  let previous: RenderedBlock | null = null;
  let previousNodeIndex = -1;
  let offset = rendered[0]?.reused && rendered[0].baselineIndex === 0 ? (baseline?.gaps[0]?.length ?? 0) : 0;

  rendered.forEach((block, nodeIndex) => {
    if (previous) {
      const separator = separatorFor(previous, block, baseline, previousNodeIndex, nodeIndex);
      parts.push(separator);
      offset += separator.length;
    }
    blockStarts?.push(offset);
    parts.push(block.text);
    offset += block.text.length;
    previous = block;
    previousNodeIndex = nodeIndex;
  });

  let result = parts.join('');

  // 首尾空白只在对应边界块未被修改时复用。
  if (baseline) {
    result = applyEdgeWhitespace(result, rendered, baseline);
  }

  return result;
}

/** 判断所有块是否都复用了原文且顺序未变。 */
function isUnchanged(rendered: RenderedBlock[], baseline: SourceBaseline): boolean {
  if (rendered.length !== baseline.blocks.length) return false;
  return rendered.every(
    (block, index) => block.reused && block.baselineIndex === index,
  );
}

/**
 * 计算两个相邻块之间的间隔。
 *
 * 原来相邻且均未修改时复用原间隔；否则使用两个默认换行。
 */
function separatorFor(
  left: RenderedBlock,
  right: RenderedBlock,
  baseline: SourceBaseline | null,
  leftNodeIndex: number,
  rightNodeIndex: number,
): string {
  if (!baseline) return DEFAULT_BLOCK_SEPARATOR;

  const leftIndex = left.baselineIndex;
  const rightIndex = right.baselineIndex;

  const originallyAdjacent =
    leftIndex >= 0 && rightIndex === leftIndex + 1 && rightNodeIndex === leftNodeIndex + 1;

  if (left.reused && right.reused && originallyAdjacent) {
    return baseline.gaps[leftIndex + 1] ?? DEFAULT_BLOCK_SEPARATOR;
  }

  return DEFAULT_BLOCK_SEPARATOR;
}

/**
 * 复用原文首尾空白。
 *
 * 只有当原始首块 / 尾块仍位于文档边界且未被修改时才保留，避免把旧空白
 * 错误地贴在新建内容上。
 */
function applyEdgeWhitespace(
  result: string,
  rendered: RenderedBlock[],
  baseline: SourceBaseline,
): string {
  const first = rendered[0];
  const last = rendered[rendered.length - 1];
  const firstBlock = baseline.blocks[0];
  const lastBlock = baseline.blocks[baseline.blocks.length - 1];

  let leading = '';
  let trailing = '';

  if (first?.reused && first.baselineIndex === 0 && firstBlock) {
    leading = baseline.gaps[0] ?? '';
  }
  if (
    last?.reused &&
    last.baselineIndex === baseline.blocks.length - 1 &&
    lastBlock
  ) {
    trailing = baseline.gaps[baseline.blocks.length] ?? '';
  }

  return `${leading}${result}${trailing}`;
}
