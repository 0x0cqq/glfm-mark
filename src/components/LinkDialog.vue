/**
 * 链接与图片编辑弹窗。
 */
<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  kind: 'link' | 'image';
  href: string;
  title: string;
  alt: string;
}>();

const emit = defineEmits<{
  (event: 'submit', value: { href: string; title: string; alt: string }): void;
  (event: 'remove'): void;
  (event: 'close'): void;
}>();

const href = ref('');
const title = ref('');
const alt = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    href.value = props.href;
    title.value = props.title;
    alt.value = props.alt;
  },
  { immediate: true },
);

/** 提交。 */
function submit() {
  emit('submit', { href: href.value.trim(), title: title.value.trim(), alt: alt.value.trim() });
}
</script>

<template>
  <div v-if="open" class="glfm-editor__dialog glfm-editor__dialog--modal" data-testid="link-dialog">
    <div class="glfm-editor__dialog-panel">
      <p class="glfm-editor__dialog-title">
        {{ kind === 'link' ? '编辑链接' : '插入图片或附件' }}
      </p>

      <label class="glfm-editor__dialog-label" for="glfm-dialog-href">
        {{ kind === 'link' ? '地址' : '图片地址' }}
      </label>
      <input id="glfm-dialog-href" v-model="href" class="glfm-editor__dialog-input" data-testid="link-dialog-href" />

      <template v-if="kind === 'image'">
        <label class="glfm-editor__dialog-label" for="glfm-dialog-alt">替代文本</label>
        <input id="glfm-dialog-alt" v-model="alt" class="glfm-editor__dialog-input" data-testid="link-dialog-alt" />
      </template>

      <label class="glfm-editor__dialog-label" for="glfm-dialog-title">标题（可选）</label>
      <input id="glfm-dialog-title" v-model="title" class="glfm-editor__dialog-input" data-testid="link-dialog-title" />

      <div class="glfm-editor__dialog-actions">
        <button type="button" class="glfm-editor__button-primary" data-testid="link-dialog-submit" @click="submit">
          应用
        </button>
        <button type="button" class="glfm-editor__button" data-testid="link-dialog-remove" @click="emit('remove')">
          移除
        </button>
        <button type="button" class="glfm-editor__button" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>
