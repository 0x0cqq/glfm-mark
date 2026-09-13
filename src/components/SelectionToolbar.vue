<!-- 选区工具栏只读取位置，不向文档写入展示状态。 -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import EditorIcon from './EditorIcon.vue';

const props = defineProps<{ editor: Editor; enabled: boolean }>();
const emit = defineEmits<{ (event: 'link'): void }>();
const toolbar = ref<HTMLElement | null>(null);
const visible = ref(false);
const position = ref({ left: '0px', top: '0px' });
const revision = ref(0);
let frame = 0;
let dismissed = '';
const marks = [
  { name: 'bold', label: '粗体', shortcut: 'Ctrl/⌘ B' },
  { name: 'italic', label: '斜体', shortcut: 'Ctrl/⌘ I' },
  { name: 'strike', label: '删除线', shortcut: 'Ctrl/⌘ Shift S' },
  { name: 'code', label: '行内代码', shortcut: 'Ctrl/⌘ E' },
];

/** 在渲染帧内定位工具栏，跨行选区与窄屏都限制在视口内。 */
async function update() {
  frame = 0;
  const editor = props.editor;
  if (editor.isDestroyed) return;
  const selection = editor.state.selection;
  const key = `${selection.from}:${selection.to}`;
  const active = editor.isFocused || toolbar.value?.contains(document.activeElement);
  visible.value = Boolean(props.enabled && editor.isEditable && active && !editor.view.composing && selection instanceof TextSelection && !selection.empty && key !== dismissed && !selection.$from.parent.type.spec.code);
  revision.value++;
  if (!visible.value) return;
  await nextTick();
  if (editor.isDestroyed || !toolbar.value) return;
  const from = editor.view.coordsAtPos(selection.from);
  const to = editor.view.coordsAtPos(selection.to);
  const width = toolbar.value.offsetWidth;
  const height = toolbar.value.offsetHeight;
  const top = Math.min(from.top, to.top);
  const bottom = Math.max(from.bottom, to.bottom);
  if (bottom < 0 || top > window.innerHeight) { visible.value = false; return; }
  position.value = {
    left: `${Math.max(8, Math.min((from.left + to.left) / 2 - width / 2, window.innerWidth - width - 8))}px`,
    top: `${Math.max(8, top > height + 12 ? top - height - 10 : Math.min(bottom + 10, window.innerHeight - height - 8))}px`,
  };
}
/** 合并选区、滚动和文档变化后的布局读取。 */
function schedule() { if (!frame) frame = requestAnimationFrame(() => void update()); }
/** 新选区允许重新显示已关闭的菜单。 */
function selected() { dismissed = ''; schedule(); }
/** 切换格式并保留当前选区。 */
function toggle(name: string) { props.editor.chain().focus().toggleMark(name).run(); }
/** Escape 关闭菜单，左右方向键在按钮之间移动。 */
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation();
    dismissed = `${props.editor.state.selection.from}:${props.editor.state.selection.to}`;
    visible.value = false; props.editor.commands.focus();
  } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const buttons = [...toolbar.value!.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
}
/** 允许 Alt+F10 从正文聚焦选区工具栏。 */
function focus() { toolbar.value?.querySelector<HTMLButtonElement>('button')?.focus(); }
defineExpose({ focus });
watch(() => props.enabled, schedule);
onMounted(() => {
  props.editor.on('selectionUpdate', selected);
  for (const event of ['transaction', 'focus', 'blur'] as const) props.editor.on(event, schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);
  schedule();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  props.editor.off('selectionUpdate', selected);
  for (const event of ['transaction', 'focus', 'blur'] as const) props.editor.off(event, schedule);
  window.removeEventListener('resize', schedule);
  document.removeEventListener('scroll', schedule, true);
});
</script>
<template>
  <div v-show="visible && enabled" ref="toolbar" class="glfm-editor__bubble" :style="position" :data-revision="revision" role="toolbar" aria-label="选区格式" data-testid="selection-toolbar" @mousedown.prevent @keydown="keydown">
    <button v-for="mark in marks" :key="mark.name" type="button" class="glfm-editor__button" :aria-label="mark.label" :aria-pressed="editor.isActive(mark.name)" :class="{ 'is-active': editor.isActive(mark.name) }" :title="`${mark.label} · ${mark.shortcut}`" :data-testid="`selection-${mark.name}`" @click="toggle(mark.name)"><EditorIcon :name="mark.name" /></button>
    <span class="glfm-editor__divider" />
    <button type="button" class="glfm-editor__button" aria-label="编辑链接" title="链接 · Ctrl/⌘ K" @click="emit('link')"><EditorIcon name="link" /></button>
    <button type="button" class="glfm-editor__button" aria-label="清除格式" title="清除格式 · Ctrl/⌘ Shift M" @click="editor.chain().focus().unsetAllMarks().run()"><EditorIcon name="clear" /></button>
  </div>
</template>
