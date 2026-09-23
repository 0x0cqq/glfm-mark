# glfm-mark

面向 GitLab Pages / MkDocs 静态站点的 GLFM 所见即所得编辑器。

对外数据模型为 **Markdown 字符串**，编辑内核为 Vue 3 + Tiptap 3 / ProseMirror。
导入、源码重解析和预览全部由浏览器 TypeScript 本地完成，无需 GitLab API、令牌或渲染服务。
构建产物为静态 JS、CSS 和配套资源；保存、上传可按需接入宿主。

## 本地渲染与源码保真

- 编辑、源码、预览共用同一份 Markdown。
- 未修改文档逐字符导出，修改一个顶层块只重写该块。
- 支持常用 Markdown、任务列表、表格、GLFM 提示块、折叠块、公式、Mermaid、引用与媒体。
- 未识别内容保留为可修改源码。GitLab 引用显示原始表达式，不查询项目标题或权限。
- 完整支持边界见[语法能力](docs/compatibility.md)，实现选择见[ADR 0007](docs/adr/0007-browser-rendering.md)。

## 写作界面

`theme="material"` 为默认外观，正文严格沿用 MkDocs Material 宿主排版与亮暗配色；
`theme="modern"` 提供更宽松的排版、圆角与写作面板。两套主题共用全部编辑功能。
独立页面的 Material 外观提供基础排版；完整 Material 样式由宿主站点提供。

选中文字即可格式化；左侧显示源码起始行与 H1/H2 等块标识。
顶部提供常用格式与插入菜单，可展开文档大纲或开启专注模式。
右上角键盘按钮列出快捷键，详细交互见[写作说明](docs/compatibility.md#写作交互)。

Vue 组件 `GlfmEditor`、`GlfmPreview` 和静态挂载选项都支持 `theme`。

## Vue 接入

包名 `@glfm-mark/vue` 不代表已在 npm 注册或发布。从源码构建安装：

```bash
# Node.js 22.18+ 或 24+
npm ci
npm run build
npm pack
# 在宿主 Vue 项目中替换为生成的 tgz 路径
npm install /path/to/glfm-mark-vue-0.1.0.tgz
```

Vue 3.5 以上由宿主提供。最小示例：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { GlfmEditor } from '@glfm-mark/vue';
import '@glfm-mark/vue/style.css';
import '@glfm-mark/vue/katex.css';

const markdown = ref('# 标题\n\n正文。\n');
const directory = new URL('./', location.href).href;
const context = {
  documentId: 'page-1',
  linkBaseUrl: directory,
  assetBaseUrl: directory,
};
</script>

<template>
  <GlfmEditor v-model="markdown" :context="context" theme="material" />
</template>
```

## Standalone 静态部署

执行 `npm run build`，复制完整 `dist/` 到站点的 `glfm-mark/` 目录，保留相对结构：

```text
站点目录/
├── index.html
├── editor.js
└── glfm-mark/
    ├── standalone.js
    ├── standalone.css
    ├── katex.css
    ├── assets/
    └── fonts/
```

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GLFM 编辑器</title>
<link rel="stylesheet" href="./glfm-mark/standalone.css" />
<link rel="stylesheet" href="./glfm-mark/katex.css" />
<div id="editor"></div>
<p id="status" role="status"></p>
<script type="module" src="./editor.js"></script>
</html>
```

`editor.js`：

```js
import { mountGlfmEditor } from './glfm-mark/standalone.js';
const directory = new URL('./', location.href).href;
const editor = mountGlfmEditor(document.getElementById('editor'), {
  markdown: '# 标题\n\n正文。\n',
  theme: 'material',
  context: { documentId: 'page-1', linkBaseUrl: directory, assetBaseUrl: directory },
  /** 在页面显示错误。 */
  onError(error) { document.getElementById('status').textContent = error.message; },
});
/** 页面离开时释放编辑器。 */
window.addEventListener('pagehide', () => editor.destroy());
```

通过 HTTP(S) 访问页面，例如本地执行 `python -m http.server 8080`。
运行时只需静态托管；Python 仅用于本地预览。部署到项目子路径时，完整复制 JS 分块、
CSS 与字体。`index.js` 为 Vue 库入口，普通浏览器页面使用 `standalone.js`。

### MkDocs 接入

保留现有 MkDocs 构建流程，把资源复制到 `docs/glfm-mark/`，配置样式及模块脚本。
完整配置、文档载入、可选宿主服务与 `document$` 即时导航生命周期见
[接入示例](examples/mkdocs/docs/editor-integration.md)。

运行本仓库示例：

```bash
npm ci
python -m venv .venv
.venv/Scripts/python -m pip install mkdocs==1.6.1 mkdocs-material==9.7.7 pymdown-extensions==11.0.2
npm run examples:build
.venv/Scripts/python -m mkdocs serve --config-file examples/mkdocs/mkdocs.yml
```

打开 `http://127.0.0.1:8000/editor-offline/`。示例可编辑、预览任意新内容。
Linux/macOS 使用 `.venv/bin/python`，并将 `examples:build` 展开为 `npm run build`、
`npm run examples:prepare` 和对应的 `mkdocs build` 命令。

## 组件与宿主接口

| 属性 | 默认值 | 用途 |
|---|---|---|
| `modelValue` | 必需 | Markdown 双向绑定 |
| `context` | 必需 | 文档 ID、链接与附件的绝对目录 URL |
| `services` | 可省略 | 可选的 `saveMarkdown` 与 `uploadFile` |
| `theme` | `material` | `material` 或 `modern`，切换时保留选区与编辑历史 |
| `readonly` | `false` | 只读 |
| `initialMode` | `wysiwyg` | `wysiwyg`、`source`、`preview` |

`saveMarkdown` 接收请求快照，成功时 resolve、失败时抛出错误。
`uploadFile` 接收文件，返回 `{ markdown }`。未提供对应服务时不显示保存或上传按钮。
`resolveAssetPreview` 可为待写入图片提供临时展示地址，Markdown 中仍保存仓库相对地址。
类型以 [src/core/types.ts](src/core/types.ts) 为准。

需要将 Markdown 与新图片一起写入仓库时，宿主可使用
[DocumentSession](src/adapters/document-session.ts) 暂存图片，将其 `services` 传给编辑器；
会话通过 [DocumentAdapter](src/adapters/types.ts) 写入保存包。
[LocalDirectoryAdapter](tools/local-directory-adapter.ts) 可在 Node 本地工具中写入隔离的仓库副本；
GitHub 提交适配器尚未实现。浏览器页面需要由宿主提供访问本地文件的服务，不能直接引入 Node 适配器。
数据边界见 [ADR 0009](docs/adr/0009-document-bundle-adapters.md)。

### 本地仓库演示

先运行 `npm run build`，再运行：

```bash
npm run demo:local -- D:\projects\glfm-mark-case-local
```

打开 [http://127.0.0.1:8130/](http://127.0.0.1:8130/)，在页面顶部选择或输入该目录内任意现有
Markdown 的仓库相对路径。编辑器可上传图片并保存到本地工作树；保存前图片只在页面会话中暂存。
服务仅监听本机，目录由启动命令指定；请使用隔离的仓库副本。可在命令末尾指定端口。

Vue 实例提供 `getMarkdown()`、`focus()`、`setMode(mode)`、`markSaved(markdown)`；
事件为 `update:modelValue`、`state-change`、`error`、`saved`。

Standalone 使用 `markdown` 初始化，支持 `onChange`、`onError` 回调；句柄提供
`getMarkdown()`、`setMarkdown(markdown)`、`setMode(mode)`、`setTheme(theme)`、`markSaved(markdown)`、`destroy()`。

`GlfmPreview` 接收 `markdown`、`context` 与可选 `theme`、`resolveAssetPreview`，可选 `delay` 默认为 350 ms，提供 `refresh()`。
`renderMarkdown(markdown, signal?)` 可独立生成带源码位置的 HTML；
`renderPreviewHtml(html, context)` 净化并添加 Material、KaTeX、Mermaid 与代码高亮展示。

## 常用命令

```bash
npm run dev              # 本地编辑器演示
npm run typecheck        # 类型检查
npm test                 # 单元、组件、安全与性能测试
npm run build            # 库与 standalone 产物
npm run examples:prepare # 复制产物和演示 Markdown
npm run examples:build   # 构建库和 MkDocs 示例
npm run demo:local -- <仓库副本目录> # 浏览器编辑本地 Markdown
npm run test:visual      # 浏览器交互与 Material 视觉验证
```

视觉测试需先启动 `npm run dev` 与 `python -m http.server 8020 --directory examples/mkdocs/site`。
默认桌面亮色，`GLFM_VISUAL_FULL=1` 增加暗色和移动端。

## 文档与许可

- [当前架构](docs/architecture.md)
- [语法支持与限制](docs/compatibility.md)
- [架构决策](docs/adr/)
- [已验证经验](docs/lessons.md)
- [协作约定](AGENTS.md)

MIT。GitLab 前端规则来源见 [ADR 0001](docs/adr/0001-editor-core.md)。
