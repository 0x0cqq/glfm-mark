/**
 * 预览组件：只展示预览，接受 Markdown、context 和 render 服务。
 *
 * 预览只用于展示，不回写 Markdown，也不反向替换当前编辑文档。
 */
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { DocumentContext, EditorServices } from '../core/types';
import { renderPreviewHtml } from '../material/preview';

const props = withDefaults(
  defineProps<{
    markdown: string;
    context: DocumentContext;
    services: EditorServices;
    /** 输入变化后的刷新延迟，单位毫秒。 */
    delay?: number;
  }>(),
  { delay: 350 },
);

const container = ref<HTMLElement | null>(null);
const error = ref<string | null>(null);
const stale = ref(false);

let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
let abort: AbortController | null = null;

/** 刷新预览。 */
async function refresh(): Promise<void> {
  seq += 1;
  const current = seq;
  abort?.abort();
  abort = new AbortController();

  try {
    const { html } = await props.services.renderMarkdown({
      markdown: props.markdown,
      context: props.context,
      signal: abort.signal,
    });

    if (current !== seq) return;

    const rendered = await renderPreviewHtml(html, props.context);
    if (current !== seq) return;

    if (container.value) {
      container.value.replaceChildren(...rendered.childNodes);
    }
    error.value = null;
    stale.value = false;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return;
    if (current !== seq) return;

    // 失败时保留上一份成功预览，并标注其已过期。
    error.value = cause instanceof Error ? cause.message : String(cause);
    stale.value = Boolean(container.value?.childNodes.length);
  }
}

/** 延迟刷新。 */
function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void refresh(), props.delay);
}

watch(() => props.markdown, schedule, { immediate: true });
watch(() => props.context.documentId, schedule);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  abort?.abort();
});

defineExpose({ refresh });
</script>

<template>
  <div class="glfm-editor__preview-host">
    <p v-if="error" class="glfm-editor__preview-error" data-testid="preview-error">
      预览失败：{{ error }}
      <span v-if="stale">（下方内容已过期）</span>
      <button type="button" class="glfm-editor__button" data-testid="preview-retry" @click="refresh">
        重试
      </button>
    </p>
    <div ref="container" class="md-typeset glfm-editor__preview" data-testid="preview-content" />
  </div>
</template>
