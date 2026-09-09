/**
 * 工具栏：固定提供撤销、块样式、行内标记、插入与模式切换。
 */
<script setup lang="ts">
import { computed, ref } from 'vue';
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
}>();

const emit = defineEmits<{
  (event: 'set-mode', mode: EditorMode): void;
  (event: 'save'): void;
  (event: 'upload', file: File): void;
  (event: 'insert-table'): void;
  (event: 'insert-alert', type: AlertType): void;
  (event: 'insert-details'): void;
  (event: 'insert-code'): void;
  (event: 'insert-math'): void;
  (event: 'insert-mermaid'): void;
  (event: 'insert-horizontal-rule'): void;
  (event: 'edit-link'): void;
  (event: 'edit-image'): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);

const disabled = computed(() => props.readonly || !props.editor);

/** 执行编辑器命令。 */
function run(command: (editor: Editor) => void) {
  if (!props.editor || props.readonly) return;
  command(props.editor);
}

/** 是否处于某个标记或节点中。 */
function isActive(name: string, attrs?: Record<string, unknown>): boolean {
  return props.editor?.isActive(name, attrs) ?? false;
}

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
</script>

<template>
  <div class="glfm-editor__toolbar" role="toolbar" aria-label="编辑器工具栏">
    <div class="glfm-editor__toolbar-group">
      <button
        type="button"
        class="glfm-editor__button"
        title="撤销"
        data-testid="toolbar-undo"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().undo().run())"
      >
        ↶
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        title="重做"
        data-testid="toolbar-redo"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().redo().run())"
      >
        ↷
      </button>
    </div>

    <div class="glfm-editor__toolbar-group">
      <select
        class="glfm-editor__select"
        data-testid="toolbar-block-style"
        :disabled="disabled"
        :value="blockStyle"
        @change="setBlockStyle"
      >
        <option value="paragraph">正文</option>
        <option v-for="level in 6" :key="level" :value="String(level)">标题 {{ level }}</option>
      </select>
    </div>

    <div class="glfm-editor__toolbar-group">
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('bold') }"
        title="粗体"
        data-testid="toolbar-bold"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().toggleBold().run())"
      >
        B
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('italic') }"
        title="斜体"
        data-testid="toolbar-italic"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().toggleItalic().run())"
      >
        I
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('strike') }"
        title="删除线"
        data-testid="toolbar-strike"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().toggleStrike().run())"
      >
        S
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('code') }"
        title="行内代码"
        data-testid="toolbar-code"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().toggleCode().run())"
      >
        {'<>'}
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('link') }"
        title="链接"
        data-testid="toolbar-link"
        :disabled="disabled"
        @click="emit('edit-link')"
      >
        🔗
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        title="图片 / 附件"
        data-testid="toolbar-image"
        :disabled="disabled"
        @click="emit('edit-image')"
      >
        🖼
      </button>
    </div>

    <div class="glfm-editor__toolbar-group">
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('bulletList') }"
        title="无序列表"
        data-testid="toolbar-bullet-list"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().toggleBulletList().run())"
      >
        •
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('orderedList') }"
        title="有序列表"
        data-testid="toolbar-ordered-list"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().toggleOrderedList().run())"
      >
        1.
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('taskList') }"
        title="任务列表"
        data-testid="toolbar-task-list"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().toggleTaskList().run())"
      >
        ☑
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': isActive('blockquote') }"
        title="引用"
        data-testid="toolbar-blockquote"
        :disabled="disabled"
        @click="run((editor) => editor.chain().focus().toggleBlockquote().run())"
      >
        ❝
      </button>
    </div>

    <div class="glfm-editor__toolbar-group">
      <button
        type="button"
        class="glfm-editor__button"
        title="表格"
        data-testid="toolbar-table"
        :disabled="disabled"
        @click="emit('insert-table')"
      >
        表
      </button>
      <select
        class="glfm-editor__select glfm-editor__select--narrow"
        data-testid="toolbar-alert-type"
        :disabled="disabled"
        :value="alertType"
        @change="alertType = ($event.target as HTMLSelectElement).value as AlertType"
      >
        <option v-for="type in ALERT_TYPES" :key="type" :value="type">
          {{ type.toUpperCase() }}
        </option>
      </select>
      <button
        type="button"
        class="glfm-editor__button"
        title="插入提示块"
        data-testid="toolbar-alert"
        :disabled="disabled"
        @click="emit('insert-alert', alertType)"
      >
        ⓘ
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        title="折叠块"
        data-testid="toolbar-details"
        :disabled="disabled"
        @click="emit('insert-details')"
      >
        ⌄
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        title="代码块"
        data-testid="toolbar-code-block"
        :disabled="disabled"
        @click="emit('insert-code')"
      >
        {'{}'}
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        title="公式"
        data-testid="toolbar-math"
        :disabled="disabled"
        @click="emit('insert-math')"
      >
        ƒ
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        title="Mermaid"
        data-testid="toolbar-mermaid"
        :disabled="disabled"
        @click="emit('insert-mermaid')"
      >
        ◇
      </button>
      <button
        type="button"
        class="glfm-editor__button"
        title="分隔线"
        data-testid="toolbar-hr"
        :disabled="disabled"
        @click="emit('insert-horizontal-rule')"
      >
        ―
      </button>
    </div>

    <div class="glfm-editor__toolbar-group glfm-editor__toolbar-group--end">
      <button
        v-for="item in (['wysiwyg', 'source', 'preview'] as EditorMode[])"
        :key="item"
        type="button"
        class="glfm-editor__button"
        :class="{ 'is-active': mode === item }"
        :data-testid="`toolbar-mode-${item}`"
        :disabled="readonly && item !== 'preview'"
        @click="emit('set-mode', item)"
      >
        {{ item === 'wysiwyg' ? '编辑' : item === 'source' ? '源码' : '预览' }}
      </button>

      <button
        v-if="canUpload"
        type="button"
        class="glfm-editor__button"
        data-testid="toolbar-upload"
        :disabled="disabled || uploading > 0"
        @click="pickFile"
      >
        上传
      </button>
      <input
        ref="fileInput"
        type="file"
        class="glfm-editor__file-input"
        data-testid="toolbar-file-input"
        @change="handleFile"
      />

      <button
        v-if="canSave"
        type="button"
        class="glfm-editor__button-primary"
        data-testid="toolbar-save"
        :disabled="readonly || saving"
        @click="emit('save')"
      >
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </div>
  </div>
</template>
