# glfm-mark

面向 GitLab Pages / MkDocs 静态站点的 GLFM 所见即所得编辑器。

- 对外数据模型始终是 **Markdown 字符串**；
- 编辑内核为 Vue 3 + Tiptap 3（ProseMirror）；
- 定向移植 GitLab Content Editor 的 GLFM 编辑与转换规则；
- 支持编辑、源码、预览三种模式；
- 构建产物为静态 JS、CSS 与按需加载的资源。

## 安装

```bash
npm install @glfm-mark/vue
```

Vue 3.5 以上为 peer dependency，由宿主提供。

## 最小示例

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { GlfmEditor, createGitLabMarkdownService } from '@glfm-mark/vue';
import '@glfm-mark/vue/style.css';
// 公式排版依赖 KaTeX 样式；字体随站点一起部署，不依赖 CDN。
import '@glfm-mark/vue/katex.css';

const markdown = ref('# 标题\n\n正文。\n');

const context = {
  documentId: 'wiki-page-1',
  linkBaseUrl: 'https://gitlab.example.com/group/project/-/wikis/',
  assetBaseUrl: 'https://gitlab.example.com/group/project/-/wikis/uploads/',
};

const services = {
  renderMarkdown: createGitLabMarkdownService({
    baseUrl: 'https://gitlab.example.com',
    project: 'group/project',
    // 凭据由宿主管理，不写入构建产物、配置、日志或本地存储。
    getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  }).renderMarkdown,
};
</script>

<template>
  <GlfmEditor v-model="markdown" :context="context" :services="services" />
</template>
```

## 静态挂载

供 MkDocs 的普通脚本使用：

```js
import { mountGlfmEditor } from '@glfm-mark/vue/standalone';

const editor = mountGlfmEditor(document.getElementById('editor'), {
  markdown: initialMarkdown,
  context,
  services,
});

// 页面离开时释放实例。
editor.destroy();
```

`standalone.js` 内联 Vue，并可通过相对路径从子目录加载。

静态挂载时通过普通 `<link>` 引入样式：

```html
<link rel="stylesheet" href="./glfm-mark/standalone.css" />
<link rel="stylesheet" href="./glfm-mark/katex.css" />
<script type="module" src="./glfm-mark/standalone.js"></script>
```

## 组件属性与实例方法

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `modelValue` | `string` | — | Markdown，双向绑定 |
| `context` | `DocumentContext` | — | 文档 ID 与绝对目录 URL |
| `services` | `EditorServices` | — | 渲染、上传与保存接口 |
| `readonly` | `boolean` | `false` | 只读 |
| `initialMode` | `EditorMode` | `wysiwyg` | `wysiwyg`、`source` 或 `preview` |

实例方法：`getMarkdown()`、`focus()`、`setMode(mode)`、`markSaved(markdown)`。

事件：`update:modelValue`、`state-change`、`error`、`saved`。

## 常用命令

```bash
npm ci                # 安装依赖
npm run dev           # 启动演示页
npm run typecheck     # 类型检查
npm test              # 单元、集成、安全与性能测试
npm run build         # 构建库与静态挂载产物
npm run fixtures      # 生成离线示例的 HTML fixture
npm run examples:prepare  # 复制示例站点资源
npm run test:visual   # 视觉对比测试（需先启动演示页与 MkDocs 站点）
```

## 文档

- [当前架构](docs/architecture.md)
- [语法支持与限制](docs/compatibility.md)
- [重要决策（ADR）](docs/adr/)
- [已验证经验](docs/lessons.md)
- [原始设计规格](docs/original-design-doc.md)
- [协作方式与工程约束](AGENTS.md)

## 示例

- `demo/`：开发演示页，覆盖主要 GLFM 语法。
- `examples/mkdocs/`：Material 参考页、编辑器离线示例与实际接入示例。

## 许可证

MIT。移植自 GitLab 的前端编辑器代码来源与版本见
[ADR 0001](docs/adr/0001-editor-core.md)。
