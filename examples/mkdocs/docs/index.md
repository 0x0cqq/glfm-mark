# glfm-mark 示例站点

本目录同时提供三类内容：

- **Material 参考页**：用 MkDocs Material 原生语法渲染与编辑器演示文档等价的内容，
  用于视觉对比。
- **编辑器离线示例**：在站点中挂载编辑器，使用浏览器 TypeScript 本地渲染任意文档。
- **实际接入示例**：说明宿主如何注入 upload、save 与文档基准 URL。

## 构建与预览

在仓库根目录执行：

```bash
# 首次安装 Node 依赖；Python 虚拟环境安装见仓库 README
npm ci

# 1. 构建发布产物（含独立的 KaTeX 样式与字体）
npm run build

# 2. 复制编辑器与参考页所需的 JS、CSS 和字体
npm run examples:prepare

# 3. 构建并启动 MkDocs（Windows；Linux/macOS 使用 .venv/bin/python）
.venv/Scripts/python -m mkdocs build --config-file examples/mkdocs/mkdocs.yml
.venv/Scripts/python -m mkdocs serve --config-file examples/mkdocs/mkdocs.yml
```

站点默认地址为 <http://127.0.0.1:8000/>。

生成的资源不入库（见 `.gitignore`），更新构建产物后需重新执行 `npm run examples:prepare`。
Windows 环境可用 `npm run examples:build` 一次完成上述生成、复制和站点构建。

## 说明

MkDocs 构建流程保持原状：本示例不修改 Python 扩展或构建语法，也不让站点自动
获得全部 GLFM 能力。编辑器只负责在页面中提供编辑与预览。

发布包不内联 KaTeX 样式与字体，宿主页面需要引入 `katex.css`，字体随站点一起
部署，不依赖 CDN。
