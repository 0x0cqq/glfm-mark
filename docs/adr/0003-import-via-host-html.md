# 0003. 导入依赖宿主渲染的 HTML 与 sourcepos

- 状态：accepted
- 日期：2026-09-09
- 关联：`docs/architecture.md`、`src/source/import.ts`、`src/adapters/gitlab.ts`

## 背景

编辑器需要把 GLFM Markdown 转换为内部结构，同时保留源码区间。两条路可选：

1. 自己解析 Markdown，再从中构建内部结构。
2. 调用 GitLab 的 Markdown 服务取得 HTML，从 HTML 反推语义与位置。

GitLab 的渲染结果带有 `data-sourcepos`，直接给出了每个顶层元素在原文中的
行列位置，这是权威的语义来源。自建解析器则要重新实现 GLFM 的提示块、任务列表、
公式、引用、脚注、Emoji 等方言，且无法保证与 GitLab 渲染一致。

## 决策

导入流程固定为：调用宿主 `renderMarkdown` → 净化 HTML → 读取顶层元素的
`data-sourcepos` → 换算为 UTF-16 偏移 → 建立源码块与语义节点。

具体约束：

- `data-sourcepos` 的列号是 **UTF-8 字节列**，必须换算成 UTF-16 偏移后才能用于
  `slice()`；不得直接把字节列用作 JavaScript 字符串下标。
- 不能通过“搜索相同文字”恢复区间。
- 块之间含有实际内容的剩余区间必须成为源码保留块，不能当作空白忽略。
- 出现重叠、无效边界或无法解析的结构时降级为源码块；完全无法获得可靠边界时，
  整篇作为单个源码块载入并显示状态说明。

## 理由与取舍

这条路线把 GLFM 方言的知识留在 GitLab 服务端，前端只负责“读懂 HTML”。

接受的代价：

- 导入需要一次网络请求，因此离线环境必须提供预生成的 HTML fixture。
- 宿主必须实现 `renderMarkdown`；组件无法独立完成导入。
- 渲染结果缺少 sourcepos 时只能整篇降级。

默认适配器调用 GitLab 公共 Markdown API 的正式字段（`text`、`gfm`、`project`），
不依赖内部 Wiki 预览端点，也不自行添加未公开参数。

## 后果与验证

- `tests/sourcepos.spec.ts` 覆盖中文、emoji、制表符、CRLF 与越界列的换算。
- `tests/source-preservation.spec.ts` 覆盖 sourcepos 缺失、越界与未识别 HTML 的
  降级路径，确认降级不丢内容。
- fixture 只验证接口契约，不构成真实 GitLab 集成验证；真实集成需要实例与凭据。
