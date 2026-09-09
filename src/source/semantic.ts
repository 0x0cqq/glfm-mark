/**
 * 语义快照：把顶层节点转换为可比较的字符串，用于判断块是否被修改。
 *
 * 快照只包含节点类型、正文、标记和影响导出的属性；排除 sourceId、
 * 展示用 URL、解析结果、主题和编辑控件状态。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** 影响导出结果、需要参与比较的节点属性白名单。 */
const NODE_ATTRS: Record<string, string[]> = {
  heading: ['level'],
  codeBlock: ['language', 'langParams'],
  mathBlock: ['delimiter', 'info'],
  mermaidBlock: ['info'],
  sourceBlock: [],
  alert: ['type'],
  details: ['open'],
  detailsSummary: [],
  detailsContent: [],
  orderedList: ['start', 'delimiter'],
  bulletList: ['bullet'],
  taskList: [],
  taskItem: ['checked', 'inapplicable'],
  table: [],
  tableCell: ['align'],
  tableHeader: ['align'],
  image: ['src', 'alt', 'title', 'width', 'height', 'isReference'],
  reference: ['originalText', 'referenceType'],
  emoji: ['name'],
  footnoteReference: ['label'],
  tableOfContents: [],
  horizontalRule: [],
  hardBreak: [],
  blockquote: ['multiline'],
  paragraph: [],
};

/** 影响导出结果、需要参与比较的标记属性白名单。 */
const MARK_ATTRS: Record<string, string[]> = {
  link: ['href', 'title', 'isReference', 'isGollumLink'],
  code: [],
  bold: [],
  italic: [],
  strike: [],
  mathInline: [],
};

/** 按固定顺序输出属性，避免对象键顺序影响比较结果。 */
function stableAttrs(
  attrs: Record<string, unknown>,
  allowed: string[] | undefined,
): string {
  if (!allowed || allowed.length === 0) return '';
  const parts: string[] = [];
  for (const key of allowed) {
    const value = attrs[key];
    if (value === undefined || value === null || value === false || value === '') continue;
    parts.push(`${key}=${JSON.stringify(value)}`);
  }
  return parts.length ? `{${parts.join(',')}}` : '';
}

/** 把单个节点（含标记）序列化为稳定字符串。 */
function snapshotNode(node: ProseMirrorNode): string {
  if (node.isText) {
    const marks = node.marks
      .map((mark) => `${mark.type.name}${stableAttrs(mark.attrs, MARK_ATTRS[mark.type.name])}`)
      .sort()
      .join('+');
    return marks ? `text[${marks}](${JSON.stringify(node.text)})` : `text(${JSON.stringify(node.text)})`;
  }

  const attrs = stableAttrs(node.attrs as Record<string, unknown>, NODE_ATTRS[node.type.name]);
  const children: string[] = [];
  node.forEach((child) => {
    children.push(snapshotNode(child));
  });

  return `${node.type.name}${attrs}(${children.join(',')})`;
}

/** 计算顶层节点的语义快照，用于与导入基线比较。 */
export function semanticSnapshot(node: ProseMirrorNode): string {
  return snapshotNode(node);
}
