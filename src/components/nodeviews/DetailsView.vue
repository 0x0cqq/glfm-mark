<script setup lang="ts">
/**
 * 折叠块节点视图：`<details>` 与 `<summary>` 的结构化编辑。
 *
 * 临时展开状态保存在组件内，不修改源码中的 `open` 属性。
 */
import { computed, ref } from 'vue';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';

const props = defineProps(nodeViewProps);

const expanded = ref(props.node.attrs.open as boolean);

/** 源码中的 open 状态，导出时使用。 */
const openAttr = computed(() => Boolean(props.node.attrs.open));

/** 切换临时展开状态，不写入文档。 */
function toggle() {
  expanded.value = !expanded.value;
}
</script>

<template>
  <NodeViewWrapper class="glfm-editor__details" data-testid="details-node">
    <div class="glfm-editor__details-header" contenteditable="false">
      <button type="button" class="glfm-editor__details-toggle" data-testid="details-toggle" @click="toggle">
        {{ expanded ? '收起' : '展开' }}
      </button>
      <span class="glfm-editor__details-hint">
        源码中为 {{ openAttr ? '展开' : '折叠' }} 状态
      </span>
    </div>
    <details :open="expanded">
      <NodeViewContent class="glfm-editor__details-body" as="div" />
    </details>
  </NodeViewWrapper>
</template>
