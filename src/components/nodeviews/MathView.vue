/**
 * 数学公式节点视图：展示 KaTeX，通过弹窗编辑公式源码。
 *
 * 展示结果不进入文档内容；渲染失败时显示原公式与错误。
 */
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { renderBlockMath, renderInlineMath } from '../../material/math';

const props = defineProps(nodeViewProps);

const html = ref('');
const error = ref<string | null>(null);
const editing = ref(false);
const draft = ref('');

/** 公式源码。 */
const source = computed(() => props.node.attrs.source ?? props.node.textContent ?? '');

/** 是否行内公式。 */
const inline = computed(() => props.node.type.name === 'mathInline');

/** 渲染公式。 */
async function render() {
  const result = inline.value
    ? await renderInlineMath(source.value)
    : await renderBlockMath(props.node.textContent ?? '');
  html.value = result.html;
  error.value = result.error;
}

watch(source, render, { immediate: true });
watch(() => props.node.textContent, render);

/** 打开编辑弹窗。 */
function startEdit() {
  draft.value = inline.value ? source.value : (props.node.textContent ?? '');
  editing.value = true;
}

/** 提交修改。 */
function commit() {
  const { state, view } = props.editor;
  const pos = props.getPos();
  if (typeof pos !== 'number') return;

  if (inline.value) {
    view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...props.node.attrs, source: draft.value }));
  } else {
    const from = pos + 1;
    const to = pos + props.node.nodeSize - 1;
    view.dispatch(state.tr.replaceWith(from, to, draft.value ? state.schema.text(draft.value) : []));
  }

  editing.value = false;
}

/** 取消修改。 */
function cancel() {
  editing.value = false;
}
</script>

<template>
  <NodeViewWrapper
    :class="['glfm-editor__math-node', inline ? 'glfm-editor__math-node--inline' : 'glfm-editor__math-node--block']"
    :as="inline ? 'span' : 'div'"
  >
    <span
      class="glfm-editor__math-content"
      :class="{ 'glfm-editor__math--error': error }"
      :title="error ?? undefined"
      data-testid="math-render"
      @dblclick="startEdit"
    >
      <span v-html="html" />
    </span>
    <button
      type="button"
      class="glfm-editor__math-edit"
      data-testid="math-edit"
      aria-label="编辑公式"
      @click="startEdit"
    >
      ƒ
    </button>

    <div v-if="editing" class="glfm-editor__dialog" data-testid="math-dialog">
      <label class="glfm-editor__dialog-label">公式源码（LaTeX）</label>
      <textarea v-model="draft" class="glfm-editor__dialog-input" rows="4" spellcheck="false" />
      <div class="glfm-editor__dialog-actions">
        <button type="button" class="glfm-editor__button-primary" @click="commit">应用</button>
        <button type="button" class="glfm-editor__button" @click="cancel">取消</button>
      </div>
    </div>
  </NodeViewWrapper>
</template>
