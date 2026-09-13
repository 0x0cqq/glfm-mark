<!-- 使用原生 dialog 管理焦点、Escape 和模态键盘导航。 -->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
const props = defineProps<{ open: boolean; label: string }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const dialog = ref<HTMLDialogElement | null>(null);
watch(() => props.open, async (open) => {
  await nextTick();
  if (!dialog.value) return;
  if (open && !dialog.value.open) dialog.value.showModal();
  else if (!open && dialog.value.open) dialog.value.close();
}, { immediate: true });
</script>
<template>
  <dialog ref="dialog" class="glfm-editor__native-dialog" :aria-label="label" @cancel.prevent="emit('close')" @click="($event.target === dialog) && emit('close')">
    <div class="glfm-editor__dialog-panel"><slot /></div>
  </dialog>
</template>
