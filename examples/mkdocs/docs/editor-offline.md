# 编辑器离线示例

本页演示在 MkDocs Material 站点中挂载 `glfm-mark` 编辑器。

## 限制说明

离线示例只使用**内置 Markdown 与预生成的 HTML fixture**（`assets/fixtures.json`）。
它允许对已载入的富文本文档进行编辑、撤销和导出，但**任意新增源码的服务端解析
需要连接真实 GitLab 适配器**，页面会明确提示这一限制。

这份 fixture 不是完整的本地 GLFM 引擎，只覆盖演示文档中出现的内容。

## 挂载方式

```html
<div id="glfm-editor"></div>
<link rel="stylesheet" href="../glfm-mark/standalone.css" />
<link rel="stylesheet" href="../glfm-mark/katex.css" />
<script type="module" src="../assets/offline-example.js"></script>
```

公式排版依赖 KaTeX 样式。发布包提供 `katex.css` 与 `fonts/`，由宿主页面引入，
不依赖 CDN。

示例脚本 `assets/offline-example.js` 加载 `assets/fixtures.json`，把内置 Markdown
映射到预生成 HTML，并调用 `mountGlfmEditor`。

## 编辑器

<div id="glfm-editor"></div>

<p id="glfm-status" class="glfm-example-status"></p>

<link rel="stylesheet" href="../glfm-mark/standalone.css" />
<link rel="stylesheet" href="../glfm-mark/katex.css" />
<script type="module" src="../assets/offline-example.js"></script>
