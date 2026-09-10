/**
 * GLFM 编辑器组件：编辑、源码、预览三种模式共用同一份 Markdown。
 *
 * 对外数据始终是 Markdown 字符串；ProseMirror 文档只是内部编辑状态。
 */
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { EditorContent, type Editor } from '@tiptap/vue-3';
import { GlfmEditorCore } from '../core/editor';
import { editorExtensions } from '../core/extensions';
import type {
  DocumentContext,
  EditorError,
  EditorMode,
  EditorServices,
  EditorState,
  GlfmEditorHandle,
} from '../core/types';
import type { AlertType } from '../glfm/constants';
import GlfmToolbar from './GlfmToolbar.vue';
import GlfmPreview from './GlfmPreview.vue';
import SourceEditor from './SourceEditor.vue';
import LinkDialog from './LinkDialog.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    context: DocumentContext;
    services: EditorServices;
    readonly?: boolean;
    initialMode?: EditorMode;
  }>(),
  { readonly: false as boolean, initialMode: 'wysiwyg' as EditorMode },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'state-change', state: EditorState): void;
  (event: 'error', error: EditorError): void;
  (event: 'saved'): void;
}>();

const core = shallowRef<GlfmEditorCore | null>(null);
const editor = shallowRef<Editor | null>(null);
const editorKey = ref(0);
const state = ref<EditorState>({
  mode: props.initialMode,
  dirty: false,
  importing: true,
  saving: false,
  uploading: 0,
});
const sourceText = ref('');
const blockStyle = ref('paragraph');
const linkDialog = ref<{ open: boolean; kind: 'link' | 'image' }>({ open: false, kind: 'link' });
const linkValues = ref({ href: '', title: '', alt: '' });

/** 当前是否处于输入法组合状态。 */
const composing = ref(false);

/** 初始化编辑器。 */
onMounted(async () => {
  const instance = new GlfmEditorCore({
    markdown: props.modelValue,
    context: props.context,
    services: props.services,
    readonly: props.readonly,
    initialMode: props.initialMode,
    element: null,
    extensions: editorExtensions,
    callbacks: {
      onUpdate: (markdown) => {
        if (composing.value) return;
        emit('update:modelValue', markdown);
      },
      onStateChange: (next) => {
        state.value = next;
        emit('state-change', next);
      },
      onError: (error) => emit('error', error),
    },
  });

  core.value = instance;
  editor.value = instance.editor;
  instance.editor.on('transaction', updateBlockStyle);
  instance.editor.on('selectionUpdate', updateBlockStyle);

  await instance.load(props.modelValue);
  sourceText.value = instance.getSourceMarkdown();
  editorKey.value += 1;
});

/** 更新工具栏中的块样式。 */
function updateBlockStyle() {
  const instance = editor.value;
  if (!instance) return;
  for (let level = 1; level <= 6; level += 1) {
    if (instance.isActive('heading', { level })) {
      blockStyle.value = String(level);
      return;
    }
  }
  blockStyle.value = 'paragraph';
}

/** 组件卸载时释放资源。 */
onBeforeUnmount(() => {
  core.value?.destroy();
  core.value = null;
  editor.value = null;
});

/** 处理父组件传入的 modelValue。 */
watch(
  () => props.modelValue,
  (value) => {
    void core.value?.syncModelValue(value);
  },
);

/** documentId 变化时重新载入。 */
watch(
  () => props.context.documentId,
  async () => {
    if (!core.value) return;
    await core.value.load(props.modelValue);
    sourceText.value = core.value.getSourceMarkdown();
  },
);

watch(
  () => props.readonly,
  (value) => core.value?.setReadonly(value),
);

/** 切换模式。 */
async function setMode(mode: EditorMode): Promise<boolean> {
  if (!core.value) return false;
  const ok = await core.value.setMode(mode);
  if (ok) sourceText.value = core.value.getSourceMarkdown();
  return ok;
}

/** 源码模式文本变化。 */
function handleSourceInput(value: string) {
  sourceText.value = value;
  core.value?.setSourceMarkdown(value);
  emit('update:modelValue', value);
}

/** 执行编辑器命令。 */
function run(command: (instance: Editor) => void) {
  const instance = editor.value;
  if (!instance || props.readonly) return;
  command(instance);
}

/** 插入表格。 */
function insertTable() {
  run((instance) =>
    instance.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  );
}

/** 插入提示块。 */
function insertAlert(type: AlertType) {
  run((instance) => instance.chain().focus().insertAlert(type).run());
}

/** 插入折叠块。 */
function insertDetails() {
  run((instance) => instance.chain().focus().insertDetails().run());
}

/** 插入代码块。 */
function insertCode() {
  run((instance) => instance.chain().focus().setCodeBlock().run());
}

/** 插入块级公式。 */
function insertMath() {
  run((instance) =>
    instance
      .chain()
      .focus()
      .insertContent({ type: 'mathBlock', content: [{ type: 'text', text: 'a^2+b^2=c^2' }] })
      .run(),
  );
}

/** 插入 Mermaid 图表。 */
function insertMermaid() {
  run((instance) =>
    instance
      .chain()
      .focus()
      .insertContent({
        type: 'mermaidBlock',
        content: [{ type: 'text', text: 'graph TD\n  A-->B' }],
      })
      .run(),
  );
}

/** 插入分隔线。 */
function insertHorizontalRule() {
  run((instance) => instance.chain().focus().setHorizontalRule().run());
}

/** 打开链接弹窗。 */
function editLink() {
  const instance = editor.value;
  if (!instance) return;

  linkValues.value = {
    href: (instance.getAttributes('link').href as string) ?? '',
    title: (instance.getAttributes('link').title as string) ?? '',
    alt: '',
  };
  linkDialog.value = { open: true, kind: 'link' };
}

/** 打开图片弹窗。 */
function editImage() {
  const instance = editor.value;
  if (!instance) return;

  const attrs = instance.getAttributes('image');
  linkValues.value = {
    href: (attrs.src as string) ?? '',
    title: (attrs.title as string) ?? '',
    alt: (attrs.alt as string) ?? '',
  };
  linkDialog.value = { open: true, kind: 'image' };
}

/** 应用链接或图片。 */
function applyLink(value: { href: string; title: string; alt: string }) {
  const kind = linkDialog.value.kind;
  run((instance) => {
    if (kind === 'link') {
      if (!value.href) instance.chain().focus().unsetLink().run();
      else
        instance
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href: value.href, title: value.title || null })
          .run();
      return;
    }

    instance
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: { src: value.href, alt: value.alt || null, title: value.title || null },
      })
      .run();
  });
  linkDialog.value.open = false;
}

/** 移除链接。 */
function removeLink() {
  run((instance) => instance.chain().focus().unsetLink().run());
  linkDialog.value.open = false;
}

/** 保存。 */
async function save() {
  if (!core.value) return;
  const ok = await core.value.save();
  if (ok) emit('saved');
}

/** 上传文件。 */
async function upload(file: File) {
  await core.value?.uploadFile(file);
}

/** 供父组件调用的实例方法。 */
defineExpose<GlfmEditorHandle>({
  getMarkdown: () => core.value?.getMarkdown() ?? props.modelValue,
  focus: () => core.value?.focus(),
  setMode,
  markSaved: (markdown: string) => core.value?.markSaved(markdown),
});

const showEditor = computed(() => state.value.mode === 'wysiwyg');
const showSource = computed(() => state.value.mode === 'source');
const showPreview = computed(() => state.value.mode === 'preview');
</script>

<template>
  <div
    class="glfm-editor"
    :class="{ 'glfm-editor--readonly': readonly }"
    data-testid="glfm-editor"
    @compositionstart="composing = true"
    @compositionend="composing = false"
  >    <GlfmToolbar
      :editor="editor"
      :mode="state.mode"
      :readonly="readonly"
      :can-save="Boolean(services.saveMarkdown)"
      :can-upload="Boolean(services.uploadFile)"
      :saving="state.saving"
      :uploading="state.uploading"
      :block-style="blockStyle"
      @set-mode="setMode"
      @save="save"
      @upload="upload"
      @insert-table="insertTable"
      @insert-alert="insertAlert"
      @insert-details="insertDetails"
      @insert-code="insertCode"
      @insert-math="insertMath"
      @insert-mermaid="insertMermaid"
      @insert-horizontal-rule="insertHorizontalRule"
      @edit-link="editLink"
      @edit-image="editImage"
    />

    <p v-if="state.importing" class="glfm-editor__status" data-testid="status-importing">
      正在解析文档…
    </p>

    <div v-show="showEditor" class="glfm-editor__content" data-testid="editor-content">
      <!-- `md-typeset` 让编辑区在 Material 宿主中继承阅读排版；无 Material 样式时无影响。 -->
      <EditorContent v-if="editor" :key="editorKey" class="md-typeset glfm-editor__typeset" :editor="editor" />
    </div>

    <SourceEditor
      v-if="showSource"
      :model-value="sourceText"
      :readonly="readonly"
      @update:model-value="handleSourceInput"
    />

    <GlfmPreview
      v-if="showPreview"
      :markdown="core?.getMarkdown() ?? modelValue"
      :context="context"
      :services="services"
    />

    <LinkDialog
      :open="linkDialog.open"
      :kind="linkDialog.kind"
      :href="linkValues.href"
      :title="linkValues.title"
      :alt="linkValues.alt"
      @submit="applyLink"
      @remove="removeLink"
      @close="linkDialog.open = false"
    />
  </div>
</template>
