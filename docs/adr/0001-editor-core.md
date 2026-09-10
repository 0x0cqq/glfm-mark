# 0001. 采用 Vue 3 + Tiptap 3 作为编辑内核

- 状态：accepted
- 日期：2026-09-09
- 关联：`docs/architecture.md`、`src/core/editor.ts`

## 背景

需要一个可在现有 GitLab Pages / MkDocs 静态站点中部署的 Markdown 编辑器，要求
编辑体验接近所见即所得，同时保证业务数据模型是 Markdown 字符串。

GitLab 自带的 Content Editor 使用 Vue 2 + Tiptap 2，不能直接作为 Vue 3 组件复制，
但其 GLFM 语义与 Markdown 转换规则可直接复用。

## 决策

使用 Vue 3 + Tiptap 3（ProseMirror）作为编辑内核，定向移植 GitLab Content Editor
的 GLFM 语义、HTML 解析规则与 Markdown 序列化逻辑。

移植来源固定为 GitLab 仓库提交
`03487409d7cdbf472341472b0083743132e9abe0` 的
`app/assets/javascripts/content_editor`，只引用开源前端编辑器相关代码，
保留对应 MIT 许可证，记录来源文件与本项目的修改说明。

## 理由与取舍

考虑过的其他选择：

- 直接复制 GitLab Content Editor：其组件层绑定 Vue 2、GitLab UI 与服务容器，
  无法在目标站点使用。
- 自研富文本编辑器：需要重新实现选区、撤销、输入法与协作基础，成本远高于收益。
- 纯源码编辑器（textarea + 预览）：无法提供结构化编辑，不满足需求。

Tiptap 3 提供 Vue 3 支持、按扩展组合 schema 的能力以及 ProseMirror 的成熟事务模型。
代价是需要自己维护源码保留层与 Material 展示层，且 Tiptap 与 ProseMirror 的类型
必须保持同版本。

## 后果与验证

- 扩展逐个注册，不使用 StarterKit，避免默认链接、列表、历史与 GLFM 扩展重复。
- ProseMirror 相关类型统一从 `@tiptap/pm` 引入。
- 包内不残留 `~/` 别名、GitLab UI、Vue 2 或 GitLab 应用级状态依赖。
- 验证：`tests/serialize.spec.ts` 覆盖 GLFM 输出契约；演示页在浏览器中完成
  导入、编辑、撤销、导出的实际验证。
