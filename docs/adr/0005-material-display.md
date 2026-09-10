# 0005. 预览按需转换展示，不改变保存方言

- 状态：accepted
- 日期：2026-09-09
- 关联：`src/material/preview.ts`、`examples/mkdocs/docs/material-reference.md`

## 背景

站点保存的是 GLFM（例如 `> [!NOTE]`），而 MkDocs Material 的提示块使用
`!!! note` 语法。展示层需要决定：是改变保存的方言，还是只改变展示结构。

## 决策

保存的方言保持 GLFM，Material 适配只影响展示。

预览流程固定为：调用宿主 `renderMarkdown` → 净化 → **把提示块 DOM 转为
Material admonition 结构** → 解析展示地址 → 代码高亮、KaTeX、Mermaid。

具体约束：

- 提示块保存为 `> [!TYPE]`，展示为 `.admonition.<type>` + `.admonition-title`。
- 展示地址（`data-canonical-src`）、引用标题、KaTeX 输出、Mermaid SVG 与高亮
  span 都不进入 Markdown 或 ProseMirror 内容。
- 预览只用于展示：不回写 Markdown，也不反向替换当前编辑文档。
- 主题切换、折叠块临时展开只影响展示，不触发模型更新。

## 理由与取舍

考虑过的其他选择：

- **改成 Material 方言保存**：会改变 GitLab 端渲染结果，违反“Material 展示不
  改变保存的 GLFM 方言”。
- **引入 Material 的 Python 扩展处理 GLFM**：需要改造现有文档构建流程，超出范围。
- **复用参考插件的服务端或 WebSocket**：引入运行时服务，与静态部署冲突。

代价是本编辑器预览与站点构建对同一份 GLFM 的渲染结果可能不同：MkDocs 构建
对 GLFM 的支持程度保持原状，本方案不修改 Python 扩展或构建语法使其自动获得
全部 GLFM 能力。

## 后果与验证

- 参考页 `examples/mkdocs/docs/material-reference.md` 用 Material 原生语法书写
  等价内容（`!!! note`、`??? note`、`$$…$$`），与编辑器预览做同条件视觉对比。
- `tests/visual/material-comparison.spec.ts` 在亮色、暗色与窄屏三种条件下保存
  截图，并断言两侧的 admonition、表格与 KaTeX 节点都存在。
- `tests/security.spec.ts` 验证预览不发起外部请求、不自动播放媒体、
  数学渲染失败时保留原公式与错误提示。
