/**
 * 代码块节点视图：Material 风格容器、语言标签与复制按钮。
 *
 * 编辑区内直接显示可编辑的代码文本，避免高亮层与编辑内容重叠；
 * 高亮只在预览中应用，不会进入 Markdown。
 */
<script setup lang="ts">
import { computed, ref } from 'vue';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';

const props = defineProps(nodeViewProps);

const language = computed(() => (props.node.attrs.language as string) ?? '');
const editingLanguage = ref(false);
const draft = ref('');

/** 打开语言编辑。 */
function startEdit() {
  draft.value = language.value;
  editingLanguage.value = true;
}

/** 提交语言修改。 */
function commit() {
  const { state, view } = props.editor;
  const pos = props.getPos();
  if (typeof pos !== 'number') return;

  const value = draft.value.trim();
  view.dispatch(
    state.tr.setNodeMarkup(pos, undefined, { ...props.node.attrs, language: value || null }),
  );
  editingLanguage.value = false;
}

/** 复制代码内容。 */
async function copy() {
  await navigator.clipboard?.writeText(props.node.textContent ?? '');
}
</script>

<template>
  <NodeViewWrapper class="glfm-editor__code-block" data-testid="code-block">
    <div class="glfm-editor__code-header" contenteditable="false">
      <button
        type="button"
        class="glfm-editor__code-language"
        data-testid="code-language"
        @click="startEdit"
      >
        {{ language || 'text' }}
      </button>
      <button type="button" class="glfm-editor__code-copy" data-testid="code-copy" @click="copy">
        复制
      </button>
    </div>

    <input
      v-if="editingLanguage"
      v-model="draft"
      class="glfm-editor__code-language-input"
      data-testid="code-language-input"
      placeholder="语言标识，例如 js"
      @keydown.enter.prevent="commit"
      @keydown.esc="editingLanguage = false"
      @blur="commit"
    />

    <NodeViewContent class="glfm-editor__code-source" as="pre" />
  </NodeViewWrapper>
</template>
