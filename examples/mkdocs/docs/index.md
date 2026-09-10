# glfm-mark 示例站点

本目录同时提供三类内容：

- **Material 参考页**：用 MkDocs Material 原生语法渲染与编辑器演示文档等价的内容，
  用于视觉对比。
- **编辑器离线示例**：在站点中挂载编辑器，渲染服务由预生成 fixture 提供。
- **实际接入示例**：说明宿主如何注入 render、upload、save 与文档基准 URL。

## 构建与预览

```bash
# 1. 生成离线示例 fixture 与构建产物（在仓库根目录执行）
npm run fixtures
npm run build

# 2. 把构建产物复制到示例站点
cp dist/standalone.js dist/standalone.css examples/mkdocs/docs/assets/

# 3. 构建并启动 MkDocs
.venv/Scripts/python -m mkdocs build --config-file examples/mkdocs/mkdocs.yml
.venv/Scripts/python -m mkdocs serve --config-file examples/mkdocs/mkdocs.yml
```

站点默认地址为 <http://127.0.0.1:8000/>。

## 说明

MkDocs 构建流程保持原状：本示例不修改 Python 扩展或构建语法，也不让站点自动
获得全部 GLFM 能力。编辑器只负责在页面中提供编辑与预览。
