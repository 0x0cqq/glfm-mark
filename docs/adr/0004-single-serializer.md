# 0004. 单一 Markdown 序列化入口

- 状态：accepted
- 日期：2026-09-09
- 关联：`src/glfm/serialize.ts`、`docs/compatibility.md`

## 背景

编辑器需要在“修改块重新序列化”时输出 GLFM。可选方案包括使用现成的 Markdown
序列化库、移植 GitLab 的序列化实现，或为每个节点自行拼装字符串。

同时存在一个容易出现的风险：导入路径（HTML → ProseMirror）与序列化路径
（ProseMirror → Markdown）如果各自维护一套约定，规范化和转义会逐渐不一致。

## 决策

只保留**一个** Markdown 序列化入口：`src/glfm/serialize.ts`。

实现方式：

- 块级结构（段落、标题、列表、表格、围栏、提示块、折叠块）直接拼装字符串，
  从而完全控制块之间的空白与块内缩进。
- 行内内容（文本、标记、行内节点）交给 `prosemirror-markdown` 的
  `MarkdownSerializerState.renderInline`，复用其标记排序、转义与空白处理。

不引入 `@tiptap/markdown` 或其他 Markdown 序列化出口。

## 理由与取舍

完全自建行内序列化需要重新实现：

- 标记的嵌套顺序与 `mixable` 规则；
- 强调标记的空白排除（`expelEnclosingWhitespace`）；
- 转义字符集与行首转义；
- 硬换行与自动链接的特殊处理。

这些正是 `prosemirror-markdown` 已经解决且经过验证的部分。另一方面，块级结构
用它的 `closeBlock` / `flushClose` 机制难以精确控制（例如提示块标题与正文之间
不应出现空行），因此改为自行拼装。

接受的代价：

- 行内序列化依赖 `prosemirror-markdown` 的公开 API，需要关注其主版本变化。
- 块级结构需要自己保证容器内的换行与缩进正确。

## 后果与验证

- `tests/serialize.spec.ts` 以行为契约的方式覆盖所有节点与标记的输出，
  包含围栏加长、单元格式管道符转义、自动链接与相对地址保留。
- 新增节点必须同时提供序列化规则；未知块级节点输出其文本内容，不静默丢弃。
