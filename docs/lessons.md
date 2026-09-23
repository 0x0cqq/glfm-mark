# 已验证经验

本文件记录已经验证、仍然适用于当前实现的经验。每条包含场景、原因、做法、
边界、防复发措施与依据。历史方案由 Git 与 `docs/adr/` 保存。

## sourcepos 的列号是 UTF-8 字节列

- 场景：把 GitLab HTML 的 `data-sourcepos` 转换为原始字符串偏移。
- 原因：GitLab 的列号按 UTF-8 字节计算（`Noël` 的结束列是 5 而不是 4）。
  直接把列号用作 JavaScript 字符串下标，遇到中文、emoji 或组合字符就会错位。
- 做法：按行建立索引后逐字符累计 UTF-8 长度定位字符。起始列必须落在字符的
  起始字节上，落在中间时判定为无效；结束列按闭区间取其所在字符的末尾；
  行尾 CR 不计入列号。
- 边界：适用于 GitLab `data-sourcepos`。其他来源的列号语义需要单独确认。
- 防复发：`tests/sourcepos.spec.ts` 覆盖中文、emoji、制表符、CRLF 与越界列。
- 依据：GitLab 测试固定值 `'<p data-sourcepos="1:1-1:5" dir="auto">Noël</p>'`；
  本仓库对应测试用例。

## 导入时块之间的非空白区间必须成为源码块

- 场景：GLFM 文档中存在 GitLab 不渲染为元素的内容（front matter、链接引用定义、
  HTML 注释、MkDocs 专属标记）。
- 原因：这些内容不在任何 `data-sourcepos` 区间内。若只把它们当作“间隔”字符串
  保存，编辑器文档里就没有对应节点，用户无法编辑，导出时的邻接规则也会失效。
- 做法：处理两个已识别块之间的区间时，先判断是否为纯空白；纯空白累计到间隔，
  含有实际内容时创建一个源码保留块，并使用统一的 `flushGap` 保证
  `gaps.length === blocks.length + 1` 的排列关系。
- 边界：适用于所有顶层区间分类；嵌套结构不属于保留单位。
- 防复发：`tests/source-preservation.spec.ts` 的“块之间的非空白区间成为源码保留块”
  用例；`src/source/import.ts` 的基线拼接自校验。
- 依据：修复前该场景会因拼接校验失败导致整篇降级。

## 间隔与块必须保持严格交错

- 场景：在间隔处理中创建源码保留块。
- 原因：先写间隔再写块会破坏 `gaps[i]` 对应 `blocks[i]` 之前文本的约定，
  拼接结果与原文不一致，触发整篇降级。
- 做法：用一个待定间隔缓冲；遇到新块时先 `flushGap()` 再追加块，最后再
  `flushGap()` 收尾。
- 边界：与上一条同时适用；任何新增的区间分类都必须走同一路径。
- 防复发：`assemble()` 自校验会在渲染结果与输入不一致时降级；测试覆盖
  重复段落、重复表格与源码块混合的场景。

## Vue 节点视图必须使用 @tiptap/vue-3 的 EditorContent

- 场景：为代码块、公式、Mermaid、折叠块和源码保留块提供 Vue 节点视图。
- 原因：`VueNodeViewRenderer` 依赖 `editor.contentComponent`，该属性由
  `<EditorContent>` 组件在挂载时写入。使用核心 `Editor` 直接设置 `element`
  时 `contentComponent` 为空，节点视图函数返回空对象，界面回落到 `renderHTML`。
- 做法：组件中使用 `@tiptap/vue-3` 的 `EditorContent` 渲染编辑区，编辑器实例
  不传入 `element`（未挂载时 Tiptap 会自行创建容器）；需要重建视图时改变
  `:key`。
- 边界：仅适用于 Vue 集成；无 DOM 的测试环境不需要节点视图。
- 防复发：`tests/editor-component.spec.ts` 与演示页在浏览器中的实际验证。
- 依据：`@tiptap/vue-3` 的 `EditorContent` 实现中
  `editor.contentComponent = instance.ctx._`。

## 通用解析规则会抢走专用节点的 HTML

- 场景：提示块标题 `p.markdown-alert-title`、行内公式 `code[data-math-style]`、
  公式与 Mermaid 的 `<pre>`、任务列表的 `li.task-list-item`。
- 原因：ProseMirror 的 DOMParser 按优先级顺序匹配解析规则，同级时按注册顺序。
  通用段落规则会先匹配 `p`，把提示块标题解析成普通段落，导致提示块结构不完整。
- 做法：给专用规则显式设置更高的 `priority`（当前使用 60–70），并在
  `getAttrs` 返回 `false` 表示“不是本节点”。
- 边界：新增与现有标签重叠的节点时必须检查优先级。
- 防复发：`tests/editor-component.spec.ts` 覆盖提示块、任务列表与公式的实际渲染。

## 不要向展示 DOM 写入编辑器专用属性

- 场景：Tiptap 的表格默认启用列宽拖拽，会渲染 `<table style="width: 0px">` 与
  包装 `<div class="tableWrapper">`。
- 原因：这些属性服务于编辑器交互。在 Material 宿主中 `width: 0px` 会让表格
  塌陷；同时它们也不属于源码数据。
- 做法：表格扩展关闭 `resizable` 与 `renderWrapper`，移除节点视图，并在
  `renderHTML` 中过滤内部属性；节点视图同样不把 `sourceId`、`type`、
  `multiline` 等内部属性写入 DOM（通过 `rendered: false` 或不透传）。
- 边界：适用于所有节点视图与 `renderHTML`；仅影响编辑器 DOM，不影响导出。
- 防复发：视觉测试在 Material 站点中检查表格宽度；`semanticSnapshot` 的
  属性白名单保证内部属性不参与导出比较。

## 本地渲染要验证编辑后的语义

- 场景：从 Markdown 导入任务列表、提示块、折叠块和数学。
- 原因：把容器替换成 textContent 会丢失行内格式和嵌套结构；原样导出复用基线，发现不了这种损失。
- 做法：在 token 层转换结构，测试中执行真实编辑，再导出并重解析；任务项启用嵌套内容。
- 边界：适用于生产本地解析器，未知内容继续按块保留源码。
- 防复发：`tests/local-render.spec.ts` 与 `tests/source-preservation.spec.ts` 共用生产解析入口。
- 依据：嵌套任务列表测试复现整块降级；启用 nested 后正常导入，格式与子列表保留。

## 局部编辑需保留原有块间隔

- 场景：编辑以 CRLF 保存的 MkDocs 文档中的单个段落。
- 原因：仅在相邻两块都未修改时复用间隔，会把被编辑块两侧的 CRLF 改成 LF，
  还可能丢失文档末尾换行。
- 做法：原本相邻的块复用原间隔；原始边界块仍在边界时保留首尾空白。
  新增或重排块使用文档默认换行。
- 边界：修改块内部的格式仍由对应序列化规则决定。
- 防复发：`tests/source-preservation.spec.ts` 覆盖 CRLF 段落修改与插入。
- 依据：`learn-notes` 案例的 201 篇原样往返、154 篇段落局部修改均匹配预期。

## MkDocs 容器需保留宿主语义

- 场景：MkDocs 文档使用 `!!!`、`???` 提示和 `===` 标签页，正文依赖四空格缩进。
- 原因：通用 Markdown 解析器把容器标记及正文当作普通段落，富文本编辑可能破坏
  宿主方言的容器结构。
- 做法：在 token 阶段识别完整容器。`!!!` 导入为可编辑提示块，导出时恢复类型、
  可选标题、修饰词和正文缩进；`???` 与 `===` 使用源码卡片。
- 边界：未结构化支持的宿主容器继续用源码卡片；GLFM 提示块保持自身方言。
- 防复发：`tests/local-render.spec.ts` 覆盖结构化提示块、源码卡片和相邻段落。
- 依据：`learn-notes` 的 `theorem`、`note` 提示块曾显示为源码卡片；修复后
  全站 201 篇原样往返且没有整篇降级。

## 编辑区的资源地址需按源码目录解析

- 场景：MkDocs 默认目录 URL 将 `sorting.md` 输出为 `sorting/`，而图片仍在
  `sorting.assets/` 目录。
- 原因：富文本 DOM 直接使用 Markdown 的相对图片地址时，浏览器以页面 URL 为基准，
  会请求 `sorting/sorting.assets/` 并得到 404。
- 做法：富文本节点在渲染时使用宿主提供的 `assetBaseUrl`；源码属性和导出保持原地址。
- 边界：宿主需根据源码路径提供正确的资源目录 URL，不能简单使用当前页面目录。
- 防复发：`tests/editor-component.spec.ts` 检查展示地址和导出地址；案例站点的浏览器
  检查验证图片成功加载。
- 依据：`learn-notes` 的 `sorting.md` 在修复前请求 404，修复后亮色、暗色及窄屏下
  图片正常加载且局部编辑的 Markdown 与预期一致。

## 编辑现有图片应更新原节点

- 场景：修改已有图片的替代文本、地址或标题。
- 原因：使用插入命令替换图片会丢失原节点的尺寸和引用式链接属性。
- 做法：记录选中图片的位置并更新其属性；地址变化时清除旧展示地址。
- 边界：新图片仍使用插入命令；未修改块沿用源码保留层的原文。
- 防复发：`tests/editor-component.spec.ts` 覆盖图片尺寸及相邻 CRLF 保留。
- 依据：`sorting.md` 的浏览器检查中，双击图片编辑后只有目标图片所在行变化。

## 库模式构建会把 CSS 引用的字体内联为 base64

- 场景：在库入口的 `style.css` 里 `@import` KaTeX 样式，产物需要随站点部署。
- 原因：Vite 的库模式构建把 CSS 中 `url()` 引用的字体内联为 data URI；
  `build.assetsInlineLimit: 0` 对库模式不生效。KaTeX 的 1.03 MB 字体因此变成
  约 1.37 MB base64，使 `standalone.css` 达 1.47 MB。
- 影响：不只是体积问题。1.4 MB 的 CSS 在窄屏与移动端仿真下解码缓慢，视觉测试
  等待编辑器挂载 30 秒超时；报错表现为“元素不可见”，与真实原因相距很远。
- 做法：发布包不再内联 KaTeX 样式，改为输出 `dist/katex.css` 与 `dist/fonts/`
  （`tools/copy-assets.mjs`），由宿主页面 `<link>` 引入；字体随站点部署，不依赖 CDN。
  CSS 降到 12.7 KB，同一套视觉测试从 1.8 分钟降到约 20 秒。
- 边界：新增任何在 CSS 中引用字体的依赖都适用；纯 CSS（无字体文件）不受影响。
- 防复发：`npm run build` 固定执行资源复制；`examples/mkdocs/docs/index.md` 写明
  引入步骤；视觉测试对挂载使用 `state: 'attached'`，避免把加载慢误判成不可见。

## 编辑区域的 DOM 应由 Vue 与 ProseMirror 管理

- 场景：给当前块添加强调样式，或宿主运行全页 KaTeX auto-render。
- 原因：直接更改 ProseMirror 块的 class 会触发 DOM 监听并干扰选区；KaTeX auto-render 合并相邻文本节点时会删除 Vue 列表的空文本锚点，导致生产包首次更新行号失败。
- 做法：当前块使用 Decoration，行号在正文 DOM 外渲染；宿主 auto-render 的 ignoredClasses 排除编辑器与预览组件。
- 边界：适用于会改写编辑器或 Vue 管理区域的 DOM 增强脚本。
- 防复发：`tests/visual/writing-experience.spec.ts` 验证点击与格式化；`tests/visual/theme-alignment.spec.ts` 在实际宿主中验证初次挂载行号。
- 依据：浏览器中分别复现选区跳到旧位置、KaTeX 删除空文本节点后 insertBefore 报错；使用装饰并排除宿主扫描后相应用例通过。
