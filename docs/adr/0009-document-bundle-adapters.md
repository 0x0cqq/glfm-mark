# 0009. Markdown 与待写入资源组成宿主保存包

- 状态：accepted
- 日期：2026-09-24
- 关联：[架构](../architecture.md)、[0001 编辑器内核](0001-editor-core.md)、[0002 源码保留](0002-source-preservation.md)

## 背景

编辑器对外使用 Markdown 字符串。原有 `uploadFile` 先调用宿主上传并插入返回的 Markdown，`saveMarkdown` 后续只保存文本。新图片需要同时保存文件字节和引用它的 Markdown；本地目录写入与将来的 GitHub 提交需要共享同一输入。

## 决策

编辑器的文档模型继续为 Markdown。宿主保存边界使用 `DocumentBundle`：文档路径、Markdown 字符串，以及本次新增资源的仓库相对路径和 `Blob`。已有资源只保留在 Markdown 引用中。`DocumentAdapter` 负责载入与写入，使用不透明的 `revision` 检查并发修改；本地目录和 GitHub 分别实现该接口。

资源路径在插入图片时确定，正文立即使用最终相对路径。临时预览地址只用于界面，不进入 Markdown。保存成功后清除对应的待写入资源；失败时保留文本和文件供重试。

## 理由与取舍

Markdown 保持可直接用于 MkDocs，资源字节不需要嵌入正文。宿主可以先把保存包写到本地目录，之后再由 GitHub 实现按同一数据边界提交。`Blob` 适合浏览器暂存与本地写盘；需要跨刷新保存草稿时，宿主还须持久化这些字节，单独保存 JSON 清单并不完整。

## 后果与验证

存储实现留在编辑器之外。以 `learn-notes` 的 `sorting.md` 为样例，检查 Markdown 与新增图片在隔离本地副本中一并写入、重新载入和预览，验证版本冲突及失败后保留待写入文件。GitHub 实现复用 `DocumentBundle`，另行处理授权、分支与提交。
