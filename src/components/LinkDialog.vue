/**
 * 链接与图片编辑弹窗。
 */
<script setup lang="ts">
import { ref, useId, watch } from 'vue';
import EditorDialog from './EditorDialog.vue';
import { isSafeUrl } from '../material/sanitize';

const props = defineProps<{
  open: boolean;
  kind: 'link' | 'image';
  href: string;
  title: string;
  alt: string;
  editingImage?: boolean;
}>();

const emit = defineEmits<{
  (event: 'submit', value: { href: string; title: string; alt: string }): void;
  (event: 'remove'): void;
  (event: 'close'): void;
}>();

const id = useId();
const error = ref('');
const href = ref('');
const title = ref('');
const alt = ref('');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    error.value = '';
    href.value = props.href;
    title.value = props.title;
    alt.value = props.alt;
  },
  { immediate: true },
);

/** 提交。 */
function submit() {
  if (props.kind === 'image' && !href.value.trim()) { error.value = '请输入图片地址。'; return; }
  if (href.value.trim() && !isSafeUrl(href.value)) { error.value = '请输入安全的网页或相对地址。'; return; }
  emit('submit', { href: href.value.trim(), title: title.value.trim(), alt: alt.value.trim() });
}
</script>

<template>
  <EditorDialog :open="open" :label="kind === 'link' ? '编辑链接' : editingImage ? '编辑图片' : '插入图片'" @close="emit('close')">
    <form v-if="open" data-testid="link-dialog" @submit.prevent="submit">
      <div class="glfm-editor__dialog-heading"><h2>{{ kind === 'link' ? '编辑链接' : editingImage ? '编辑图片' : '插入图片' }}</h2><button type="button" class="glfm-editor__button" aria-label="关闭对话框" @click="emit('close')">×</button></div>
      <label class="glfm-editor__dialog-label" :for="`${id}-href`">{{ kind === 'link' ? '链接地址' : '图片地址' }}</label>
      <input :id="`${id}-href`" v-model="href" autofocus class="glfm-editor__dialog-input" placeholder="https:// 或相对路径" data-testid="link-dialog-href" />
      <template v-if="kind === 'image'"><label class="glfm-editor__dialog-label" :for="`${id}-alt`">替代文本</label><input :id="`${id}-alt`" v-model="alt" class="glfm-editor__dialog-input" data-testid="link-dialog-alt" /></template>
      <label class="glfm-editor__dialog-label" :for="`${id}-title`">标题（可选）</label>
      <input :id="`${id}-title`" v-model="title" class="glfm-editor__dialog-input" data-testid="link-dialog-title" />
      <p v-if="error" class="glfm-editor__preview-error" role="alert">{{ error }}</p>
      <div class="glfm-editor__dialog-actions">
        <button v-if="(kind === 'link' && props.href) || (kind === 'image' && editingImage)" type="button" class="glfm-editor__button" data-testid="link-dialog-remove" @click="emit('remove')">{{ kind === 'link' ? '移除链接' : '移除图片' }}</button>
        <button type="button" class="glfm-editor__button" @click="emit('close')">取消</button>
        <button type="submit" class="glfm-editor__button-primary" data-testid="link-dialog-submit">应用</button>
      </div>
    </form>
  </EditorDialog>
</template>
