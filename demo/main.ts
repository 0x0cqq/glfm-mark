/**
 * 开发演示页：离线运行编辑器，使用浏览器本地 GLFM 渲染。
 *
 * 该页面用于人工检查与 Playwright 视觉验证，不进入发布产物。
 */
import { createApp, h, ref } from 'vue';
import GlfmEditor from '../src/components/GlfmEditor.vue';
import '../src/styles/style.css';
// 发布包不内联 KaTeX 样式，演示页自行引入以保证公式排版正确。
import 'katex/dist/katex.min.css';
import { demoMarkdown } from './demo-markdown';


const markdown = ref(demoMarkdown);
const mode = ref<'wysiwyg' | 'source' | 'preview'>('wysiwyg');

const context = {
  documentId: 'demo',
  linkBaseUrl: 'https://example.com/docs/',
  assetBaseUrl: 'https://example.com/docs/assets/',
};

const app = createApp({
  render() {
    return h(GlfmEditor, {
      modelValue: markdown.value,
      context,
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
