/**
 * 源码模式编辑区：等宽 textarea，Tab 插入两个空格。
 */
<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  readonly: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const textarea = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.modelValue,
  (value) => {
    if (textarea.value && textarea.value.value !== value) {
      textarea.value.value = value;
    }
  },
  { immediate: true },
);

/** 处理输入。 */
function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

/** Tab 插入两个空格。 */
function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  event.preventDefault();

  const target = event.target as HTMLTextAreaElement;
  const { selectionStart, selectionEnd, value } = target;
  const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;

  emit('update:modelValue', next);
  requestAnimationFrame(() => {
    target.selectionStart = target.selectionEnd = selectionStart + 2;
  });
}
</script>

<template>
  <textarea
    ref="textarea"
    class="glfm-editor__source-mode"
    data-testid="source-editor"
    :value="modelValue"
    :readonly="readonly"
    spellcheck="false"
    @input="handleInput"
    @keydown="handleKeydown"
  />
</template>
