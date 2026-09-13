/**
 * 工具栏：固定提供撤销、块样式、行内标记、插入与模式切换。
 */
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import EditorIcon from './EditorIcon.vue';
import type { Editor } from '@tiptap/core';
import type { EditorMode } from '../core/types';
import { ALERT_TYPES, type AlertType } from '../glfm/constants';

const props = defineProps<{
  editor: Editor | null;
  mode: EditorMode;
  readonly: boolean;
  canSave: boolean;
  canUpload: boolean;
  saving: boolean;
  uploading: number;
  /** 当前块样式，用于下拉框显示。 */
  blockStyle: string;
  outline: boolean;
  focusMode: boolean;
}>();

const emit = defineEmits<{
  (event: 'toggle-outline'): void;
  (event: 'toggle-focus'): void;
  (event: 'shortcuts'): void;
  (event: 'set-mode', mode: EditorMode): void;
  (event: 'save'): void;
  (event: 'upload', file: File): void;
  (event: 'insert-table'): void;
  (event: 'table-action', action: TableAction): void;
  (event: 'insert-alert', type: AlertType): void;
  (event: 'change-alert-type', type: AlertType): void;
  (event: 'insert-details'): void;
  (event: 'insert-code'): void;
  (event: 'insert-math'): void;
  (event: 'insert-mermaid'): void;
  (event: 'insert-horizontal-rule'): void;
  (event: 'edit-link'): void;
  (event: 'edit-image'): void;
}>();

/** 表格操作。 */
export type TableAction =
  | 'add-row-before'
  | 'add-row-after'
  | 'delete-row'
  | 'add-column-before'
  | 'add-column-after'
  | 'delete-column'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'delete-table';

/** 表格操作按钮定义。 */
const TABLE_ACTIONS: { action: TableAction; label: string; title: string }[] = [
  { action: 'add-row-after', label: '行+', title: '在下方插入行' },
  { action: 'delete-row', label: '行−', title: '删除当前行' },
  { action: 'add-column-after', label: '列+', title: '在右侧插入列' },
  { action: 'delete-column', label: '列−', title: '删除当前列' },
  { action: 'align-left', label: '左', title: '左对齐本列' },
  { action: 'align-center', label: '中', title: '居中对齐本列' },
  { action: 'align-right', label: '右', title: '右对齐本列' },
  { action: 'delete-table', label: '删表', title: '删除整个表格' },
];

const fileInput = ref<HTMLInputElement | null>(null);

const disabled = computed(() => props.readonly || !props.editor || props.mode !== 'wysiwyg');

/** 光标是否位于表格中。 */
const inTable = computed(() => props.editor?.isActive('table') ?? false);

/** 执行编辑器命令。 */
function run(command: (editor: Editor) => void) {
  if (!props.editor || props.readonly) return;
  command(props.editor);
}

/** 是否处于某个标记或节点中。 */
function isActive(name: string, attrs?: Record<string, unknown>): boolean {
  return props.editor?.isActive(name, attrs) ?? false;
}

/** 当前是否为提示块。 */
const inAlert = computed(() => props.editor?.isActive('alert') ?? false);

/** 切换块样式。 */
function setBlockStyle(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  run((editor) => {
    if (value === 'paragraph') editor.chain().focus().setParagraph().run();
    else editor.chain().focus().setHeading({ level: Number(value) as 1 }).run();
  });
}

/** 触发文件选择。 */
function pickFile() {
  fileInput.value?.click();
}

/** 处理文件选择结果。 */
function handleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit('upload', file);
  input.value = '';
}

const alertType = ref<AlertType>('note');

/** 选择提示类型：光标在提示块内时切换类型，否则用于插入。 */
function selectAlertType(event: Event) {
  const value = (event.target as HTMLSelectElement).value as AlertType;
  alertType.value = value;
  if (inAlert.value) emit('change-alert-type', value);
}
const menu = ref<HTMLDetailsElement | null>(null);
/** 点击菜单外部或执行命令后收起插入菜单。 */
function closeMenu(event?: Event) {
  if (!event || !menu.value?.contains(event.target as Node)) menu.value?.removeAttribute('open');
}
/** Escape 关闭插入菜单并返回编辑区。 */
function menuKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { closeMenu(); props.editor?.commands.focus(); }
}
onMounted(() => document.addEventListener('pointerdown', closeMenu));
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeMenu));
</script>

<template>
  <div class="glfm-editor__chrome">
    <div class="glfm-editor__titlebar">
      <div class="glfm-editor__title-actions">
        <button type="button" class="glfm-editor__button" aria-label="文档大纲" title="文档大纲" :aria-pressed="outline" @click="emit('toggle-outline')"><EditorIcon name="outline" /></button>
        <span class="glfm-editor__document-label">文稿<span>Markdown</span></span>
      </div>
      <div class="glfm-editor__modes" role="group" aria-label="文档模式">
        <button v-for="item in (['wysiwyg', 'source', 'preview'] as EditorMode[])" :key="item" type="button" :class="{ 'is-active': mode === item }" :aria-pressed="mode === item" :data-testid="`toolbar-mode-${item}`" @click="emit('set-mode', item)">{{ item === 'wysiwyg' ? '编辑' : item === 'source' ? '源码' : '预览' }}</button>
      </div>
      <div class="glfm-editor__title-actions">
        <button type="button" class="glfm-editor__button" aria-label="专注模式" title="专注模式 · Ctrl/⌘ Shift F" :aria-pressed="focusMode" :class="{ 'is-active': focusMode }" @click="emit('toggle-focus')"><EditorIcon name="focus" /></button>
        <button type="button" class="glfm-editor__button" aria-label="快捷键" title="快捷键" @click="emit('shortcuts')"><EditorIcon name="keyboard" /></button>
        <button v-if="canSave" type="button" class="glfm-editor__button-primary" data-testid="toolbar-save" :disabled="readonly || saving" @click="emit('save')">{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </div>
    <div v-show="mode === 'wysiwyg'" class="glfm-editor__toolbar" role="toolbar" aria-label="编辑器工具栏">
      <div class="glfm-editor__toolbar-group">
        <button type="button" class="glfm-editor__button" aria-label="撤销" title="撤销 · Ctrl/⌘ Z" data-testid="toolbar-undo" :disabled="disabled || !editor?.can().undo()" @mousedown.prevent @click="run((e) => e.chain().focus().undo().run())"><EditorIcon name="undo" /></button>
        <button type="button" class="glfm-editor__button" aria-label="重做" title="重做 · Ctrl/⌘ Shift Z" data-testid="toolbar-redo" :disabled="disabled || !editor?.can().redo()" @mousedown.prevent @click="run((e) => e.chain().focus().redo().run())"><EditorIcon name="redo" /></button>
      </div>
      <div class="glfm-editor__toolbar-group">
        <select class="glfm-editor__select" aria-label="块样式" data-testid="toolbar-block-style" :disabled="disabled" :value="blockStyle" @change="setBlockStyle"><option value="paragraph">正文</option><option v-for="level in 6" :key="level" :value="String(level)">标题 {{ level }}</option></select>
      </div>
      <div class="glfm-editor__toolbar-group">
        <button v-for="mark in [{ name: 'bold', label: '粗体', key: 'B' }, { name: 'italic', label: '斜体', key: 'I' }, { name: 'strike', label: '删除线', key: 'Shift S' }, { name: 'code', label: '行内代码', key: 'E' }]" :key="mark.name" type="button" class="glfm-editor__button" :class="{ 'is-active': isActive(mark.name) }" :aria-label="mark.label" :aria-pressed="isActive(mark.name)" :title="`${mark.label} · Ctrl/⌘ ${mark.key}`" :data-testid="`toolbar-${mark.name}`" :disabled="disabled" @mousedown.prevent @click="run((e) => e.chain().focus().toggleMark(mark.name).run())"><EditorIcon :name="mark.name" /></button>
        <button type="button" class="glfm-editor__button" aria-label="链接" title="链接 · Ctrl/⌘ K" data-testid="toolbar-link" :disabled="disabled" @mousedown.prevent @click="emit('edit-link')"><EditorIcon name="link" /></button>
      </div>
      <div class="glfm-editor__toolbar-group">
        <button type="button" class="glfm-editor__button" aria-label="无序列表" title="无序列表 · Ctrl/⌘ Shift 8" data-testid="toolbar-bullet-list" :aria-pressed="isActive('bulletList')" :class="{ 'is-active': isActive('bulletList') }" :disabled="disabled" @mousedown.prevent @click="run((e) => e.chain().focus().toggleBulletList().run())"><EditorIcon name="bullet" /></button>
        <button type="button" class="glfm-editor__button" aria-label="有序列表" title="有序列表 · Ctrl/⌘ Shift 7" data-testid="toolbar-ordered-list" :aria-pressed="isActive('orderedList')" :class="{ 'is-active': isActive('orderedList') }" :disabled="disabled" @mousedown.prevent @click="run((e) => e.chain().focus().toggleOrderedList().run())"><EditorIcon name="ordered" /></button>
        <button type="button" class="glfm-editor__button" aria-label="任务列表" title="任务列表 · Ctrl/⌘ Shift 9" data-testid="toolbar-task-list" :aria-pressed="isActive('taskList')" :class="{ 'is-active': isActive('taskList') }" :disabled="disabled" @mousedown.prevent @click="run((e) => e.chain().focus().toggleTaskList().run())"><EditorIcon name="task" /></button>
        <button type="button" class="glfm-editor__button" aria-label="引用" title="引用 · Ctrl/⌘ Shift B" data-testid="toolbar-blockquote" :aria-pressed="isActive('blockquote')" :class="{ 'is-active': isActive('blockquote') }" :disabled="disabled" @mousedown.prevent @click="run((e) => e.chain().focus().toggleBlockquote().run())"><EditorIcon name="quote" /></button>
      </div>
      <details ref="menu" class="glfm-editor__insert-menu" @keydown="menuKey">
        <summary class="glfm-editor__button" aria-label="插入内容"><EditorIcon name="plus" />插入<EditorIcon name="chevron" /></summary>
        <div class="glfm-editor__menu-panel" @click="closeMenu()">
          <button type="button" data-testid="toolbar-table" :disabled="disabled" @mousedown.prevent @click="emit('insert-table')">表格<span>3 × 3</span></button>
          <button type="button" data-testid="toolbar-image" :disabled="disabled" @mousedown.prevent @click="emit('edit-image')">图片<span>地址与替代文本</span></button>
          <button type="button" data-testid="toolbar-code-block" :disabled="disabled" @mousedown.prevent @click="emit('insert-code')">代码块<span>代码与语言</span></button>
          <button type="button" data-testid="toolbar-math" :disabled="disabled" @mousedown.prevent @click="emit('insert-math')">数学公式<span>LaTeX</span></button>
          <button type="button" data-testid="toolbar-mermaid" :disabled="disabled" @mousedown.prevent @click="emit('insert-mermaid')">流程图<span>Mermaid</span></button>
          <button type="button" data-testid="toolbar-details" :disabled="disabled" @mousedown.prevent @click="emit('insert-details')">折叠内容<span>Details</span></button>
          <button type="button" data-testid="toolbar-hr" :disabled="disabled" @mousedown.prevent @click="emit('insert-horizontal-rule')">分隔线<span>—</span></button>
          <div class="glfm-editor__menu-label">提示块</div>
          <button v-for="type in ALERT_TYPES" :key="type" type="button" :data-testid="type === 'note' ? 'toolbar-alert' : `insert-alert-${type}`" :disabled="disabled" @mousedown.prevent @click="emit('insert-alert', type)">{{ type.toUpperCase() }}</button>
          <button v-if="canUpload" type="button" data-testid="toolbar-upload" :disabled="disabled || uploading > 0" @click="pickFile">上传附件</button>
        </div>
      </details>
      <input ref="fileInput" type="file" class="glfm-editor__file-input" data-testid="toolbar-file-input" @change="handleFile" />
      <select v-if="inAlert" class="glfm-editor__select" aria-label="提示块类型" data-testid="toolbar-alert-type" :value="editor?.getAttributes('alert').type ?? alertType" :disabled="disabled" @change="selectAlertType"><option v-for="type in ALERT_TYPES" :key="type" :value="type">{{ type.toUpperCase() }}</option></select>
    </div>
    <div v-if="inTable && mode === 'wysiwyg'" class="glfm-editor__table-actions" role="toolbar" aria-label="表格操作" data-testid="toolbar-table-actions"><span>表格</span><button v-for="item in TABLE_ACTIONS" :key="item.action" type="button" class="glfm-editor__button" :title="item.title" :aria-label="item.title" :data-testid="`table-action-${item.action}`" :disabled="disabled" @mousedown.prevent @click="emit('table-action', item.action)">{{ item.label }}</button></div>
  </div>
</template>
