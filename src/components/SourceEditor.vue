/**
 * 源码模式编辑区：等宽 textarea，Tab 插入两个空格。
 */
<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  readonly: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const scrollTop = ref(0);
const lineCount = computed(() => props.modelValue.split('\n').length);
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
  if (props.readonly || event.isComposing || event.key !== 'Tab') return;
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
  <div class="glfm-editor__source-layout">
    <div class="glfm-editor__source-lines" aria-hidden="true"><div :style="{ transform: `translateY(-${scrollTop}px)` }"><span v-for="line in lineCount" :key="line">{{ line }}</span></div></div>
  <textarea
    ref="textarea"
    class="glfm-editor__source-mode"
    data-testid="source-editor"
    :value="modelValue"
    :readonly="readonly"
    spellcheck="false"
    wrap="off"
    aria-label="Markdown 源码"
    @scroll="scrollTop = ($event.target as HTMLTextAreaElement).scrollTop"
    @input="handleInput"
    @keydown="handleKeydown"
  />
  </div>
</template>
