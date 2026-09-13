/** 通过 ProseMirror 装饰标记当前块，避免直接修改编辑 DOM 干扰选区。 */
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const FocusDecoration = Extension.create({
  name: 'focusDecoration',
  /** 选区变化只重算装饰，不产生文档事务。 */
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        /** 标记包含选区起点的顶层块。 */
        decorations(state) {
          const decorations: Decoration[] = [];
          state.doc.forEach((node, pos) => {
            if (state.selection.from >= pos && state.selection.from < pos + node.nodeSize) {
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-current-block': '' }));
            }
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })];
  },
});
