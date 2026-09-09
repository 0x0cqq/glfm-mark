/**
 * 块身份插件：在顶层块上维护非展示属性 `sourceId`。
 *
 * 规则来自设计文档 §4.4。实现方式为“事务后扫描 + 去重”：
 * - 已存在且未被前面块占用的 ID 直接保留，因此普通修改、撤销和拖动都能保持身份。
 * - 拆分块时两半会带同一个 ID，后一半被判为重复而获得新 ID。
 * - 合并块时结果沿用最左侧块的属性，因此继承最左侧 ID。
 * - 粘贴内容在 `transformPasted` 阶段清除来源 ID，随后由扫描分配新 ID。
 * - 删除块后不保留占位。
 *
 * 修正事务由 `appendTransaction` 产生，与触发它的编辑处于同一次历史记录。
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export const SOURCE_ID_ATTR = 'sourceId';

export const sourceIdPluginKey = new PluginKey('glfmSourceId');

/** 需要承载块身份的块级节点类型。 */
export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'mathBlock',
  'mermaidBlock',
  'horizontalRule',
  'table',
  'alert',
  'details',
  'sourceBlock',
  'htmlComment',
  'tableOfContents',
];

/** 会话内递增的块 ID 分配器。 */
let counter = 0;

/** 生成会话内唯一、递增的块 ID。 */
export function nextSourceId(): string {
  counter += 1;
  return `b${counter}`;
}

/** 重置计数器，仅用于测试隔离。 */
export function resetSourceIdCounter(): void {
  counter = 0;
}

/** 读取顶层节点的身份 ID。 */
export function getSourceId(node: ProseMirrorNode): string | null {
  const value = node.attrs[SOURCE_ID_ATTR];
  return typeof value === 'string' && value ? value : null;
}

/** 递归清除片段中的来源身份，用于粘贴。 */
function stripSourceId(node: ProseMirrorNode): ProseMirrorNode {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => {
    children.push(stripSourceId(child));
  });

  const attrs = { ...node.attrs };
  delete attrs[SOURCE_ID_ATTR];

  return node.type.create(attrs, children, node.marks);
}

/** 清除粘贴内容中的来源身份。 */
export function stripPastedSlice(slice: Slice): Slice {
  const fragment = slice.content;
  const nodes: ProseMirrorNode[] = [];
  for (let i = 0; i < fragment.childCount; i += 1) {
    nodes.push(stripSourceId(fragment.child(i)));
  }
  return Slice.maxOpen(Fragment.fromArray(nodes));
}

/**
 * 计算顶层块应有的身份 ID。
 *
 * 返回 `null` 表示当前文档的身份已经正确，无需修正。
 */
function computeDesiredIds(doc: ProseMirrorNode): Map<number, string> | null {
  const desired = new Map<number, string>();
  const seen = new Set<string>();
  let changed = false;

  doc.forEach((node, offset) => {
    const existing = getSourceId(node);
    if (existing && !seen.has(existing)) {
      seen.add(existing);
      desired.set(offset, existing);
      return;
    }

    const assigned = nextSourceId();
    seen.add(assigned);
    desired.set(offset, assigned);
    changed = true;
  });

  return changed ? desired : null;
}

/** 块身份扩展。 */
export const SourceIdExtension = Extension.create({
  name: 'glfmSourceId',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          [SOURCE_ID_ATTR]: {
            default: null,
            rendered: false,
            keepOnSplit: true,
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: sourceIdPluginKey,
        props: {
          transformPasted: (slice) => stripPastedSlice(slice),
        },
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const desired = computeDesiredIds(newState.doc);
          if (!desired) return null;

          const tr = newState.tr;
          for (const [offset, id] of desired) {
            const node = tr.doc.nodeAt(offset);
            if (node && node.attrs[SOURCE_ID_ATTR] !== id) {
              tr.setNodeMarkup(offset, undefined, { ...node.attrs, [SOURCE_ID_ATTR]: id });
            }
          }

          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
