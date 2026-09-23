<!-- 顶层块的当前源码起始行与结构标识，不进入 ProseMirror 文档。 -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { GlfmEditorCore } from '../core/editor';
const props = defineProps<{ core: GlfmEditorCore; focused: boolean }>();
const gutter = ref<HTMLElement | null>(null);
const rows = ref<{ pos: number; line: number; kind: string; top: number; left: number; active: boolean }[]>([]);
let frame = 0;
let observer: ResizeObserver | undefined;
let lines: number[] = [];
const labels: Record<string, string> = { paragraph: 'P', bulletList: 'UL', orderedList: 'OL', taskList: '☑', codeBlock: '</>', sourceBlock: 'MD', table: '表', alert: '!', mkdocsAdmonition: '!', details: '⌄', blockquote: '❝', mathBlock: 'ƒ', mermaidBlock: '◇', horizontalRule: '—' };
/** 只在内容变化时重新计算导出行号；选区变化仅更新布局。 */
function changed({ transaction }: { transaction: import('@tiptap/pm/state').Transaction }) {
  if (transaction.docChanged) lines = props.core.getBlockLines();
  schedule();
}
/** 在动画帧读取节点实际高度，以兼容图片、公式和折叠内容。 */
function update() {
  frame = 0;
  const editor = props.core.editor;
  if (editor.isDestroyed || !gutter.value?.parentElement) return;
  const parent = gutter.value.parentElement.getBoundingClientRect();
  const next: typeof rows.value = [];
  editor.state.doc.forEach((node, pos, index) => {
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const active = editor.state.selection.from >= pos && editor.state.selection.from < pos + node.nodeSize;
    // 当前块样式由编辑器装饰维护。
    next.push({ pos, line: lines[index] ?? 1, kind: node.type.name === 'heading' ? `H${node.attrs.level}` : labels[node.type.name] ?? '·', top: dom.getBoundingClientRect().top - parent.top, left: dom.getBoundingClientRect().left - parent.left - 66, active });
  });
  rows.value = next;
}
/** 合并布局更新。 */
function schedule() { if (!frame) frame = requestAnimationFrame(update); }
/** 点击结构标识聚焦对应块。 */
function select(pos: number) { props.core.editor.chain().focus().setTextSelection(pos + 1).run(); }
onMounted(async () => {
  await nextTick();
  if (props.core.editor.isDestroyed) return;
  lines = props.core.getBlockLines();
  props.core.editor.on('transaction', changed);
  if (typeof ResizeObserver !== 'undefined' && gutter.value?.parentElement) {
    observer = new ResizeObserver(schedule);
    observer.observe(gutter.value.parentElement);
  }
  window.addEventListener('resize', schedule);
  schedule();
});
onBeforeUnmount(() => {
  props.core.editor.off('transaction', changed);
  observer?.disconnect(); cancelAnimationFrame(frame);
  window.removeEventListener('resize', schedule);
});
</script>
<template>
  <div ref="gutter" class="glfm-editor__gutter" aria-label="源码起始行与块类型" data-testid="editor-gutter">
    <button v-for="row in rows" :key="row.pos" type="button" tabindex="-1" :style="{ top: `${row.top}px`, left: `${row.left}px` }" :class="{ 'is-active': row.active && focused }" :title="`源码第 ${row.line} 行 · ${row.kind}`" @mousedown.prevent @click="select(row.pos)"><span>{{ row.line }}</span><small>{{ row.kind }}</small></button>
  </div>
</template>
