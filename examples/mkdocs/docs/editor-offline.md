# 编辑器离线示例

本页演示在 MkDocs Material 站点中挂载 `glfm-mark` 编辑器。

导入、编辑、源码重解析、预览全部在浏览器中完成。试着修改文档或粘贴新的 Markdown，
再切换模式。无需 GitLab API 或令牌；文档不会被发送到渲染服务。

## 挂载方式

```html
<div id="glfm-editor"></div>
<link rel="stylesheet" href="../glfm-mark/standalone.css" />
<link rel="stylesheet" href="../glfm-mark/katex.css" />
<script type="module" src="../assets/offline-example.js"></script>
```

公式排版依赖 KaTeX 样式。发布包提供 `katex.css` 与 `fonts/`，由宿主页面引入，
不依赖 CDN。

示例脚本 `assets/offline-example.js` 加载演示 Markdown 后调用 `mountGlfmEditor`，
使用包内本地解析器，并管理 Material 即时导航生命周期。

## 编辑器

下拉选择外观；切换主题时保留当前修改和撤销历史。亮暗配色使用站点右上角的主题按钮。

<label for="glfm-theme">编辑器外观</label>
<select id="glfm-theme" class="glfm-editor__select" aria-label="编辑器外观">
  <option value="material">MkDocs Material</option>
  <option value="modern">Modern 写作</option>
</select>

<div id="glfm-editor"></div>

<p id="glfm-status" class="glfm-example-status"></p>

<link rel="stylesheet" href="../glfm-mark/standalone.css" />
<link rel="stylesheet" href="../glfm-mark/katex.css" />
<script type="module" src="../assets/offline-example.js"></script>
