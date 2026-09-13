/**
 * GLFM 编辑器组件：编辑、源码、预览三种模式共用同一份 Markdown。
 *
 * 对外数据始终是 Markdown 字符串；ProseMirror 文档只是内部编辑状态。
 */
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, type Editor } from '@tiptap/vue-3';
import { GlfmEditorCore } from '../core/editor';
import { editorExtensions } from '../core/extensions';
import type {
  DocumentContext,
  EditorError,
  EditorMode,
  EditorTheme,
  EditorServices,
  EditorState,
  GlfmEditorHandle,
} from '../core/types';
import type { AlertType } from '../glfm/constants';
import GlfmToolbar from './GlfmToolbar.vue';
import GlfmPreview from './GlfmPreview.vue';
import SourceEditor from './SourceEditor.vue';
import LinkDialog from './LinkDialog.vue';
import SelectionToolbar from './SelectionToolbar.vue';
import EditorGutter from './EditorGutter.vue';
import ShortcutHelp from './ShortcutHelp.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    context: DocumentContext;
    services?: EditorServices;
    readonly?: boolean;
    initialMode?: EditorMode;
    theme?: EditorTheme;
  }>(),
  { readonly: false as boolean, initialMode: 'wysiwyg' as EditorMode, theme: 'material' as EditorTheme },
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
const outlineOpen = ref(false);
const focusMode = ref(false);
const shortcutsOpen = ref(false);
const selectionToolbar = ref<InstanceType<typeof SelectionToolbar> | null>(null);
const editorFocused = ref(false);
const characters = ref(0);
const selectedCharacters = ref(0);
const outline = ref<{ pos: number; level: number; text: string }[]>([]);
const activeHeading = ref(-1);
const errorMessage = ref('');
const blockStyle = ref('paragraph');
const linkDialog = ref<{ open: boolean; kind: 'link' | 'image' }>({ open: false, kind: 'link' });
const linkValues = ref({ href: '', title: '', alt: '' });

/** 当前是否处于输入法组合状态。 */
const composing = ref(false);
let pendingModel: string | undefined;
let pendingDocument = false;

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
      onError: (error) => { errorMessage.value = error.message; emit('error', error); },
    },
  });

  core.value = instance;
  editor.value = instance.editor;
  instance.editor.on('transaction', updateBlockStyle);
  instance.editor.on('selectionUpdate', updateBlockStyle);
  instance.editor.on('focus', () => { editorFocused.value = true; });
  instance.editor.on('blur', () => { editorFocused.value = false; });

  try {
    await instance.load(props.modelValue);
    if (core.value !== instance) return;
    sourceText.value = instance.getSourceMarkdown();
    editorKey.value += 1;
  } catch { /* 核心已报告错误，保留宿主传入的内容。 */ }
});

/** 更新工具栏中的块样式。 */
function updateBlockStyle() {
  const instance = editor.value;
  if (!instance) return;
  const { doc, selection } = instance.state;
  characters.value = [...doc.textContent].length;
  selectedCharacters.value = [...doc.textBetween(selection.from, selection.to)].length;
  const headings: typeof outline.value = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') headings.push({ pos, level: node.attrs.level, text: node.textContent || '无标题' });
  });
  outline.value = headings;
  activeHeading.value = headings.reduce((active, heading, index) => heading.pos <= selection.from ? index : active, -1);
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

/** 宿主替换内容后同步源码输入；错误已由核心统一报告。 */
async function syncHostDocument(value: string, force = false) {
  const instance = core.value;
  if (!instance) return;
  try {
    if (force) await instance.load(value);
    else await instance.syncModelValue(value);
    if (core.value === instance) sourceText.value = instance.getSourceMarkdown();
  } catch { /* 保留当前输入和核心报告的错误。 */ }
}
/** 输入法期间延后宿主替换，组合结束后应用最新值。 */
watch(() => props.modelValue, (value) => {
  if (composing.value) pendingModel = value;
  else void syncHostDocument(value);
});
/** 文档标识变化使用新基线，组合期间也遵守延后原则。 */
watch(() => props.context.documentId, () => {
  if (composing.value) pendingDocument = true;
  else void syncHostDocument(props.modelValue, true);
});

watch(
  () => props.readonly,
  (value) => core.value?.setReadonly(value),
);

/** 切换模式。 */
async function setMode(mode: EditorMode): Promise<boolean> {
  if (!core.value) return false;
  const ok = await core.value.setMode(mode);
  if (ok && core.value) sourceText.value = core.value.getSourceMarkdown();
  return ok;
}

/** 源码模式文本变化。 */
function handleSourceInput(value: string) {
  sourceText.value = value;
  core.value?.setSourceMarkdown(value);
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

/** 执行表格操作。 */
function handleTableAction(action: string) {
  run((instance) => {
    const chain = instance.chain().focus();
    switch (action) {
      case 'add-row-before':
        chain.addRowBefore().run();
        return;
      case 'add-row-after':
        chain.addRowAfter().run();
        return;
      case 'delete-row':
        chain.deleteRow().run();
        return;
      case 'add-column-before':
        chain.addColumnBefore().run();
        return;
      case 'add-column-after':
        chain.addColumnAfter().run();
        return;
      case 'delete-column':
        chain.deleteColumn().run();
        return;
      case 'delete-table':
        chain.deleteTable().run();
        return;
      case 'align-left':
      case 'align-center':
      case 'align-right': {
        const align = action.replace('align-', '');
        // 对齐作用于当前单元格所在列的首行，保持整列一致。
        chain.setCellAttribute('align', align).run();
        syncColumnAlignment(instance, align);
        return;
      }
      default:
        return;
    }
  });
}

/**
 * 同步同列表头的对齐属性。
 *
 * GLFM 管道表格的对齐写在分隔行，导入时由表头单元格承载，因此设置对齐后
 * 需要把同列的表头单元格一并更新。
 */
function syncColumnAlignment(instance: Editor, align: string) {
  const { state, view } = instance;
  const { $from } = state.selection;

  let tableDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'table') {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth < 0) return;

  const table = $from.node(tableDepth);
  const tableStart = $from.start(tableDepth) - 1;

  // 计算当前列号。
  let columnIndex = 0;
  for (let depth = $from.depth; depth > tableDepth; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'tableRow') {
      const index = $from.index(depth - 1);
      columnIndex = Math.min(index, node.childCount - 1);
      break;
    }
  }

  const firstRow = table.child(0);
  if (firstRow.childCount <= columnIndex) return;

  let headerPos = tableStart + 1;
  for (let i = 0; i < columnIndex; i += 1) headerPos += firstRow.child(i).nodeSize;

  const header = firstRow.child(columnIndex);
  if (header.attrs.align === align) return;

  const tr = state.tr.setNodeMarkup(headerPos, undefined, { ...header.attrs, align });
  view.dispatch(tr);
}

/** 插入提示块。 */
function insertAlert(type: AlertType) {
  run((instance) => instance.chain().focus().insertAlert(type).run());
}

/** 切换当前提示块类型。 */
function changeAlertType(type: AlertType) {
  run((instance) => instance.chain().focus().setAlertType(type).run());
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
      else if (instance.state.selection.empty && !instance.isActive('link')) {
        instance.chain().focus().insertContent({ type: 'text', text: value.href, marks: [{ type: 'link', attrs: { href: value.href, title: value.title || null } }] }).run();
      } else
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

/** 通过大纲定位标题，保留编辑历史。 */
function navigateHeading(pos: number) {
  editor.value?.chain().focus().setTextSelection(pos + 1).scrollIntoView().run();
}
/** 关闭链接编辑后恢复正文焦点。 */
function closeLink() { linkDialog.value.open = false; editor.value?.commands.focus(); }
/** 输入法完成后发出最新文本。 */
function finishComposition() {
  composing.value = false;
  if (pendingModel !== undefined || pendingDocument) {
    const value = pendingModel ?? props.modelValue;
    const force = pendingDocument;
    pendingModel = undefined; pendingDocument = false;
    void syncHostDocument(value, force);
  } else if (core.value) emit('update:modelValue', core.value.getMarkdown());
}
/** 浏览器尚未派发 selectionchange 时，格式命令也使用用户刚点击的文本位置。 */
function syncKeyboardSelection(event: KeyboardEvent) {
  const instance = editor.value;
  if (!instance || !(instance.state.selection instanceof TextSelection) || !instance.view.dom.contains(event.target as Node)) return;
  const selection = window.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !instance.view.dom.contains(selection.anchorNode) || !instance.view.dom.contains(selection.focusNode)) return;
  const anchor = instance.view.posAtDOM(selection.anchorNode, selection.anchorOffset);
  const head = instance.view.posAtDOM(selection.focusNode, selection.focusOffset);
  const next = TextSelection.between(instance.state.doc.resolve(anchor), instance.state.doc.resolve(head));
  if (!next.eq(instance.state.selection)) instance.view.dispatch(instance.state.tr.setSelection(next));
}
/** 补充界面快捷键；其余格式组合使用 Tiptap 自带键盘映射。 */
function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || composing.value || event.target instanceof HTMLInputElement) return;
  if (event.altKey && event.key === 'F10' && showEditor.value) {
    event.preventDefault();
    if (selectedCharacters.value) selectionToolbar.value?.focus();
    else (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('[role="toolbar"] button:not(:disabled)')?.focus();
    return;
  }
  if (!(event.ctrlKey || event.metaKey)) return;
  syncKeyboardSelection(event);
  const key = event.key.toLowerCase();
  if (key === 's' && !event.shiftKey && core.value?.canSave && !props.readonly) { event.preventDefault(); void save(); }
  if (key === 'f' && event.shiftKey) { event.preventDefault(); focusMode.value = !focusMode.value; }
  if (!showEditor.value || props.readonly || event.target instanceof HTMLTextAreaElement) return;
  if (key === 'k' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); editLink(); }
  if (key === 'm' && event.shiftKey) { event.preventDefault(); editor.value?.chain().focus().unsetAllMarks().run(); }
  if (key === '0' && event.altKey) { event.preventDefault(); editor.value?.chain().focus().setParagraph().run(); }
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
    :class="{ 'glfm-editor--readonly': readonly, 'glfm-editor--focus': focusMode }"
    data-testid="glfm-editor"
    :data-theme="theme"
    @compositionstart="composing = true"
    @compositionend="finishComposition"
    @keydown.capture="handleKeydown"
  >
    <GlfmToolbar
      :editor="editor"
      :mode="state.mode"
      :readonly="readonly"
      :can-save="Boolean(services?.saveMarkdown)"
      :can-upload="Boolean(services?.uploadFile)"
      :saving="state.saving"
      :uploading="state.uploading"
      :block-style="blockStyle"
      :outline="outlineOpen"
      :focus-mode="focusMode"
      @toggle-outline="outlineOpen = !outlineOpen"
      @toggle-focus="focusMode = !focusMode"
      @shortcuts="shortcutsOpen = true"
      @set-mode="setMode"
      @save="save"
      @upload="upload"
      @insert-table="insertTable"
      @table-action="handleTableAction"
      @insert-alert="insertAlert"
      @change-alert-type="changeAlertType"
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

    <p v-if="errorMessage" class="glfm-editor__preview-error" role="alert">{{ errorMessage }} <button type="button" class="glfm-editor__button" @click="errorMessage = ''">关闭</button></p>
    <div class="glfm-editor__workspace">
      <nav v-if="outlineOpen && showEditor" class="glfm-editor__outline" aria-label="文档大纲">
        <p>文档大纲 <span>{{ outline.length }}</span></p>
        <button v-for="(heading, index) in outline" :key="heading.pos" type="button" :style="{ paddingLeft: `${12 + (heading.level - 1) * 12}px` }" :class="{ 'is-active': index === activeHeading }" @click="navigateHeading(heading.pos)"><small>H{{ heading.level }}</small>{{ heading.text }}</button>
        <span v-if="!outline.length" class="glfm-editor__muted">添加标题后在这里导航。</span>
      </nav>
      <div class="glfm-editor__document">
    <div v-show="showEditor" class="glfm-editor__content" data-testid="editor-content">
      <EditorGutter v-if="core && editorKey" :core="core" :focused="editorFocused" />
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
      :theme="theme"
    />

      </div>
    </div>
    <footer class="glfm-editor__footer">
      <span class="glfm-editor__save-state" :class="{ 'is-dirty': state.dirty }">{{ state.dirty ? '未保存的修改' : '内容未修改' }}</span>
      <span v-if="selectedCharacters && showEditor">已选 {{ selectedCharacters }} 字符</span>
      <span>{{ showSource ? [...sourceText].length : characters }} 字符</span>
      <span>GLFM</span>
    </footer>
    <SelectionToolbar v-if="editor" ref="selectionToolbar" :editor="editor" :enabled="showEditor && !readonly && !linkDialog.open && !shortcutsOpen" @link="editLink" />
    <ShortcutHelp :open="shortcutsOpen" @close="shortcutsOpen = false" />
    <LinkDialog
      :open="linkDialog.open"
      :kind="linkDialog.kind"
      :href="linkValues.href"
      :title="linkValues.title"
      :alt="linkValues.alt"
      @submit="applyLink"
      @remove="removeLink"
      @close="closeLink"
    />
  </div>
</template>
