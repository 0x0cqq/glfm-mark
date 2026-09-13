# 0007. 浏览器本地 GLFM 解析与渲染

- 状态：accepted
- 日期：2026-09-14
- 关联：替代 [ADR 0003](0003-import-via-host-html.md)；[当前架构](../architecture.md)、[能力边界](../compatibility.md)

## 背景

用户要求彻底移除 GitLab API 依赖，使静态页面能解析、编辑和预览任意新文档。
此前宿主渲染接口与固定 HTML fixture 无法满足该要求。现有源码保留层已经支持
带 UTF-8 源码位置的 HTML，可继续用于本地 token 区间。

## 决策

使用 markdown-it 解析 CommonMark/GFM，TypeScript 实现 GLFM 专用规则。
生产、演示与测试共用 `src/glfm/render.ts`；导入、源码重解析与预览全部使用该入口。
解析器按 token 行区间生成 `data-sourcepos`，沿用净化、区间映射、块身份和唯一序列化器。
原始 HTML 输出转义源码卡片，支持的 details 结构单独解析。未知内容继续保留源码。

移除 GitLab API 适配器及公共 `RenderRequest` / `services.renderMarkdown`。
`services` 仅含可选的上传、保存能力；组件和 standalone 可省略整个属性。
GitLab 引用显示原始表达式，不请求项目数据。数学、Mermaid、代码高亮和 Emoji 均在本地展示。

## 理由与取舍

复用已有 markdown-it 依赖和源码保留层，避免重新实现 CommonMark 或建立第二套导出逻辑。
markdown-it 与新增的 markdown-it-emoji 均为 MIT、支持浏览器构建，Emoji 使用静态字典，
没有外部字体或图片服务。未知语法采用显式源码展示，具体支持范围维护在能力文档。
不追求 GitLab 项目元数据、权限和 HTML 输出完全一致。

规则参考 [GLFM 文档](https://docs.gitlab.com/user/markdown/) 和
[markdown-it 规则说明](https://github.com/markdown-it/markdown-it/blob/master/docs/examples/renderer_rules.md)，
本次解析器为项目实现，未复制 GitLab 服务端代码。

## 后果与验证

静态部署只需要 JS、CSS 和配套资源，源码切换及预览不再依赖网络服务。
`tests/local-render.spec.ts` 验证实际结构、局部编辑后的格式与嵌套、未知源码、中文及无网络模式切换。
源码保真、组件、安全测试改为使用生产解析器；故障测试在解析边界显式注入异常。
宿主上传、保存接口的真实集成仍由接入方验证。
