/**
 * 开发演示页：离线运行编辑器，渲染服务由夹具提供。
 *
 * 该页面用于人工检查与 Playwright 视觉验证，不进入发布产物。
 */
import { createApp, h, ref } from 'vue';
import GlfmEditor from '../src/components/GlfmEditor.vue';
import '../src/styles/style.css';
import { createFixtureRenderer } from '../tests/fixtures/renderer';
import { demoMarkdown } from './demo-markdown';

const renderer = createFixtureRenderer();

const markdown = ref(demoMarkdown);
const mode = ref<'wysiwyg' | 'source' | 'preview'>('wysiwyg');

const context = {
  documentId: 'demo',
  linkBaseUrl: 'https://example.com/docs/',
  assetBaseUrl: 'https://example.com/docs/assets/',
};

const services = {
  renderMarkdown: async ({ markdown: value }: { markdown: string }) => renderer.render(value),
};

const app = createApp({
  render() {
    return h(GlfmEditor, {
      modelValue: markdown.value,
      context,
      services,
      initialMode: mode.value,
      'onUpdate:modelValue': (value: string) => {
        markdown.value = value;
      },
      onStateChange: (state: { mode: typeof mode.value }) => {
        mode.value = state.mode;
      },
    });
  },
});

app.mount('#app');

// 暴露给 Playwright，便于在测试中读写内容。
(window as unknown as Record<string, unknown>).__glfmDemo = {
  getMarkdown: () => markdown.value,
  setMarkdown: (value: string) => {
    markdown.value = value;
  },
};
