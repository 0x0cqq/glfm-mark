<script setup lang="ts">
import EditorDialog from './EditorDialog.vue';
defineProps<{ open: boolean }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const shortcuts = [
  ['粗体 / 斜体', 'B / I'], ['删除线', 'Shift S'], ['行内代码', 'E'],
  ['链接', 'K'], ['清除行内格式', 'Shift M'], ['正文 / 标题 1–6', 'Alt 0–6'],
  ['有序 / 无序 / 任务列表', 'Shift 7 / 8 / 9'], ['引用', 'Shift B'],
  ['撤销 / 重做', 'Z / Shift Z'], ['保存（需宿主接口）', 'S'], ['专注模式', 'Shift F'],
];
</script>
<template>
  <EditorDialog :open="open" label="键盘快捷键" @close="emit('close')">
    <div class="glfm-editor__dialog-heading"><h2>键盘快捷键</h2><button type="button" class="glfm-editor__button" aria-label="关闭快捷键" @click="emit('close')">×</button></div>
    <p class="glfm-editor__muted">Windows / Linux 使用 Ctrl，macOS 使用 ⌘。格式快捷键作用于编辑模式。</p>
    <dl class="glfm-editor__shortcuts"><template v-for="[label, key] in shortcuts" :key="label"><dt>{{ label }}</dt><dd><kbd>Ctrl / ⌘ {{ key }}</kbd></dd></template><dt>列表缩进 / 取消缩进</dt><dd><kbd>Tab / Shift Tab</kbd></dd><dt>硬换行</dt><dd><kbd>Shift Enter</kbd></dd><dt>聚焦格式工具栏</dt><dd><kbd>Alt F10</kbd></dd></dl>
  </EditorDialog>
</template>
