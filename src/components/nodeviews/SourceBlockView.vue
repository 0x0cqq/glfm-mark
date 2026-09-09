/**
 * 源码保留块的节点视图：显示源码卡片，允许直接修改原文。
 *
 * 修改后的文本进入节点内容，导出时原样输出。
 */
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';

const props = defineProps(nodeViewProps);

const editing = ref(false);
const draft = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);

/** 当前源码文本。 */
const source = computed(() => props.node.textContent);

/** 降级原因对应的提示文案。 */
const hint = computed(() => {
  const reason = props.node.attrs.reason as string;
  if (reason === 'no-sourcepos') return '当前渲染结果缺少可靠源码位置，已按原文载入。';
  if (reason === 'unrendered') return '该区间未被渲染为可识别结构，保留原文。';
  return '未识别内容，保留原文。';
});

/** 进入编辑状态。 */
async function startEdit() {
  draft.value = source.value;
  editing.value = true;
  await nextTick();
  textarea.value?.focus();
}

/** 提交修改。 */
function commit() {
  if (!editing.value) return;
  editing.value = false;

  const { state, view } = props.editor;
  const pos = props.getPos();
  if (typeof pos !== 'number') return;

  const from = pos + 1;
  const to = pos + props.node.nodeSize - 1;
  const tr = state.tr.replaceWith(from, to, draft.value ? state.schema.text(draft.value) : []);
  view.dispatch(tr);
}

/** 取消修改。 */
function cancel() {
  editing.value = false;
}

/** 文本框内的 Tab 插入两个空格。 */
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    event.preventDefault();
    const target = event.target as HTMLTextAreaElement;
    const { selectionStart, selectionEnd, value } = target;
    draft.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
    void nextTick(() => {
      target.selectionStart = target.selectionEnd = selectionStart + 2;
    });
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    commit();
  }
}

watch(source, (value) => {
  if (!editing.value) draft.value = value;
});
</script>

<template>
  <NodeViewWrapper class="glfm-editor__source-block" data-testid="source-block">
    <div class="glfm-editor__source-header">
      <span class="glfm-editor__source-badge">源码</span>
      <span class="glfm-editor__source-hint">{{ hint }}</span>
      <button
        v-if="!editing"
        type="button"
        class="glfm-editor__source-edit"
        data-testid="source-block-edit"
        @click="startEdit"
      >
        编辑源码
      </button>
      <template v-else>
        <button
          type="button"
          class="glfm-editor__source-save"
          data-testid="source-block-save"
          @click="commit"
        >
          应用
        </button>
        <button type="button" class="glfm-editor__source-cancel" @click="cancel">取消</button>
      </template>
    </div>
    <pre v-if="!editing" class="glfm-editor__source-preview"><code>{{ source }}</code></pre>
    <textarea
      v-else
      ref="textarea"
      v-model="draft"
      class="glfm-editor__source-input"
      data-testid="source-block-input"
      spellcheck="false"
      @keydown="handleKeydown"
      @blur="commit"
    />
  </NodeViewWrapper>
</template>
