/**
 * 开发演示页：离线运行编辑器，渲染服务由夹具提供。
 *
 * 该页面用于人工检查与 Playwright 视觉验证，不进入发布产物。
 */
import { createApp, h, ref } from 'vue';
import GlfmEditor from '../src/components/GlfmEditor.vue';
import '../src/styles/style.css';
import { createFixtureRenderer } from '../tests/fixtures/renderer';

const renderer = createFixtureRenderer();

/** 演示文档：覆盖主要 GLFM 语法。 */
const demoMarkdown = `# GLFM 编辑器演示

这是一个段落，包含 **粗体**、*斜体*、~~删除线~~、\`行内代码\` 与 [链接](https://example.com)。

## 列表

- 无序项目一
- 无序项目二
  - 嵌套项目

1. 有序项目一
2. 有序项目二

- [x] 已完成任务
- [ ] 未完成任务
- [~] 不适用任务

## 提示块

> [!NOTE]
> 这是提示正文。

> [!WARNING] 数据删除
> 此操作不可恢复。

## 表格

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| a | b | c |
| 中文 | 😀 | 制表 |

## 代码

\`\`\`js
const a = 1;
console.log(a);
\`\`\`

## 公式

行内公式 \$\\\`a^2+b^2=c^2\\\`\$ 与块级公式：

\`\`\`math
\\int_0^1 x^2 dx
\`\`\`

## 折叠块

<details>
<summary>点击展开</summary>

隐藏的内容。

</details>

## 引用

> 普通引用内容。
`;

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
