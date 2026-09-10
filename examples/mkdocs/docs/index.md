# glfm-mark 示例站点

本目录同时提供三类内容：

- **Material 参考页**：用 MkDocs Material 原生语法渲染与编辑器演示文档等价的内容，
  用于视觉对比。
- **编辑器离线示例**：在站点中挂载编辑器，渲染服务由预生成 fixture 提供。
- **实际接入示例**：说明宿主如何注入 render、upload、save 与文档基准 URL。

## 构建与预览

在仓库根目录执行：

```bash
# 1. 生成离线示例 fixture
npm run fixtures

# 2. 构建发布产物（含独立的 KaTeX 样式与字体）
npm run build

# 3. 把产物复制到示例站点
mkdir -p examples/mkdocs/docs/glfm-mark
cp -r dist/standalone.js dist/standalone.css dist/katex.css dist/assets dist/fonts \
  examples/mkdocs/docs/glfm-mark/

# 4. 参考页也需要 KaTeX 样式与字体
mkdir -p examples/mkdocs/docs/assets/vendor/katex
cp -r node_modules/katex/dist/katex.min.js node_modules/katex/dist/auto-render.min.js \
  node_modules/katex/dist/katex.min.css node_modules/katex/dist/fonts \
  examples/mkdocs/docs/assets/vendor/katex/

# 5. 构建并启动 MkDocs
.venv/Scripts/python -m mkdocs build --config-file examples/mkdocs/mkdocs.yml
.venv/Scripts/python -m mkdocs serve --config-file examples/mkdocs/mkdocs.yml
```

站点默认地址为 <http://127.0.0.1:8000/>。

第 3、4 步的产物不入库（见 `.gitignore`），需要首次构建时手动执行一次。

## 说明

MkDocs 构建流程保持原状：本示例不修改 Python 扩展或构建语法，也不让站点自动
获得全部 GLFM 能力。编辑器只负责在页面中提供编辑与预览。

发布包不内联 KaTeX 样式与字体，宿主页面需要引入 `katex.css`，字体随站点一起
部署，不依赖 CDN。
