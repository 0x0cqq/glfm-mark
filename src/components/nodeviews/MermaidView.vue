/**
 * Mermaid 节点视图：展示图表，通过弹窗编辑源码。
 *
 * 渲染结果不进入文档内容；主题切换时重绘。
 */
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { detectTheme, renderMermaid } from '../../material/mermaid';

const props = defineProps(nodeViewProps);

const svg = ref<string | null>(null);
const error = ref<string | null>(null);
const editing = ref(false);
const draft = ref('');

/** 图表源码。 */
function source(): string {
  return props.node.textContent ?? '';
}

/** 渲染图表。 */
async function render() {
  const result = await renderMermaid(source(), detectTheme());
  svg.value = result.svg;
  error.value = result.error;
}

/** 观察宿主主题变化。 */
let observer: MutationObserver | null = null;

onMounted(() => {
  void render();

  const root = document.documentElement;
  observer = new MutationObserver(() => void render());
  observer.observe(root, { attributes: true, attributeFilter: ['data-md-color-scheme'] });
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

watch(() => props.node.textContent, render);

/** 打开编辑弹窗。 */
function startEdit() {
  draft.value = source();
  editing.value = true;
}

/** 提交修改。 */
function commit() {
  const { state, view } = props.editor;
  const pos = props.getPos();
  if (typeof pos !== 'number') return;

  const from = pos + 1;
  const to = pos + props.node.nodeSize - 1;
  view.dispatch(state.tr.replaceWith(from, to, draft.value ? state.schema.text(draft.value) : []));
  editing.value = false;
}

/** 取消修改。 */
function cancel() {
  editing.value = false;
}
</script>

<template>
  <NodeViewWrapper class="glfm-editor__mermaid-node" data-testid="mermaid-node">
    <div class="glfm-editor__mermaid-header">
      <span class="glfm-editor__mermaid-badge">Mermaid</span>
      <button
        type="button"
        class="glfm-editor__mermaid-edit"
        data-testid="mermaid-edit"
        @click="startEdit"
      >
        编辑源码
      </button>
    </div>

    <div v-if="svg" class="glfm-editor__mermaid" v-html="svg" />
    <pre v-else class="glfm-editor__mermaid-fallback" data-testid="mermaid-fallback"><code>{{ source() }}</code></pre>
    <p v-if="error" class="glfm-editor__mermaid-error" data-testid="mermaid-error">{{ error }}</p>

    <div v-if="editing" class="glfm-editor__dialog" data-testid="mermaid-dialog">
      <label class="glfm-editor__dialog-label">Mermaid 源码</label>
      <textarea v-model="draft" class="glfm-editor__dialog-input" rows="8" spellcheck="false" />
      <div class="glfm-editor__dialog-actions">
        <button type="button" class="glfm-editor__button-primary" @click="commit">应用</button>
        <button type="button" class="glfm-editor__button" @click="cancel">取消</button>
      </div>
    </div>
  </NodeViewWrapper>
</template>
