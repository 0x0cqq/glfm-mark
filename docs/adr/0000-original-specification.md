# 0000. 初始实施规格（历史存档）

- 状态：superseded
- 日期：2026-09-09
- 关联：[本地渲染决策](0007-browser-rendering.md)、[当前架构](../architecture.md)

以下保留初始规格背景；当前行为以架构和能力文档为准。宿主渲染方案由 ADR 0007 替代。

# Vue 3 GLFM 编辑器实施规格：Tiptap 编辑内核、源码保留、Material 展示

## 1. 目标与固定技术路线

实现一个可打包、可复用的 Vue 3 Markdown 编辑器，部署在现有 GitLab Pages / MkDocs 静态站点中。

**唯一采用的路线：Vue 3 + Tiptap 3，定向移植 GitLab Content Editor 的 GLFM 编辑规则与序列化逻辑，自建源码保留层和 MkDocs Material 展示层。**

组件对外的数据始终为 Markdown 字符串；ProseMirror 文档作为组件内部编辑状态。编辑、源码和预览三个模式共用同一份 Markdown，不将 HTML 或编辑器 JSON 暴露为业务数据模型。

首版交付满足以下条件：

- 常用 Markdown 可以直接进行所见即所得编辑。
- GitLab 引用、提示块、数学、Mermaid、媒体等内容具有明确的展示和编辑行为。
- 未编辑文档逐字符原样导出；局部编辑不会重新格式化其他源码块。
- 保存的方言保持 GLFM，Material 适配只影响展示。
- 组件构建产物为静态 JS、CSS、字体等资源。
- GitLab 渲染、文件上传和保存通过宿主接口调用。
- 接入现有 MkDocs 页面，不增加运行时 Python 服务，不改造现有文档构建流程。
- 首版只提供 Vue 组件和原生挂载函数，不实现 React 包、协同编辑或自动保存。

GitLab 当前 Content Editor 使用 Vue 2 和 Tiptap 2，不能直接当作 Vue 3 组件复制。移植时保留其 GLFM 语义与转换规则，重写组件、依赖适配和节点视图。[GitLab 编辑器架构](https://docs.gitlab.com/development/fe_guide/content_editor/)、[Tiptap 3 迁移说明](https://tiptap.dev/docs/guides/upgrade-tiptap-v2)。

### 依赖基线

首次实现使用下列版本，提交锁文件，不在实现过程中顺带升级：

| 用途 | 固定版本 |
|---|---|
| Vue | `3.5.42` |
| 使用到的 `@tiptap/*` 包 | `3.31.3`，全部同版本 |
| `prosemirror-markdown` | `1.13.7` |
| TypeScript | `5.9.3` |
| Vite / Vue 插件 | `8.2.2` / `6.0.8` |
| `vue-tsc` | `3.3.11` |
| DOMPurify | `3.4.15` |
| Mermaid | `11.17.2` |
| KaTeX | `0.18.7` |
| lowlight / highlight.js | `3.3.0` / `11.12.0` |
| Vitest / Playwright | `5.0.0` / `1.63.0` |

使用 Node.js 24 LTS 和随附 npm，依赖安装统一使用 `npm ci`。

GitLab 移植参考固定到提交：

`03487409d7cdbf472341472b0083743132e9abe0`

只引用开源前端编辑器相关代码，记录来源文件、提交和本项目修改说明，保留对应 MIT 许可证。移植完成后，包内不能残留 `~/` 别名、GitLab UI、Vue 2 或 GitLab 应用级状态依赖。

## 2. 包结构、职责与数据流

采用一个仓库、一个发布包，不建立多包工作区。包名固定为 `@glfm-editor/vue`。

内部按职责组织：

| 模块 | 职责 |
|---|---|
| `core` | 编辑器初始化、模式切换、状态、事件 |
| `glfm` | 节点、标记、输入规则、命令、HTML 导入、Markdown 序列化 |
| `source` | 原始源码、区间映射、块身份、局部序列化 |
| `material` | 节点视图、只读展示转换、主题和样式 |
| `components` | 工具栏、源码编辑区、弹窗、错误提示 |
| `adapters` | GitLab Markdown API 适配器 |
| `examples` | Vue 使用示例、MkDocs 静态挂载示例 |
| `tests` | 转换样例、交互、源码保留和视觉测试 |

数据流固定为：

```text
输入 GLFM Markdown
    │
    ├── 保存原始源码和换行信息
    │
    └── 调用宿主 renderMarkdown
             │
             ▼
       净化并解析 GitLab HTML
             │
             ▼
       GLFM 语义节点 + 源码区间
             │
             ▼
        ProseMirror 文档
             │
          用户编辑
             │
             ▼
    未修改块复用原文，修改块序列化
             │
             ▼
       update:modelValue
```

约束如下：

1. 不从 NodeView 的展示 DOM 导出 Markdown。
2. 不把 GitLab HTML 原样放入可编辑区域。
3. 不引入第二套 Markdown 序列化入口，包括 `@tiptap/markdown`。
4. GitLab 返回的展示地址、引用标题等信息不能覆盖源码中的原始写法。
5. 工具栏、复制按钮、节点选中状态和主题状态不能写入文档数据。
6. 每个内容节点必须存在明确的导出规则；不能识别的内容进入源码保留节点。

Tiptap 扩展逐个注册，不使用 StarterKit，避免默认链接、列表、历史等能力与 GLFM 扩展重复。ProseMirror 相关类型统一从 `@tiptap/pm` 引入。

移植时重点参考 GitLab 的 `content_editor` 扩展、HTML 反序列化和 Markdown 序列化实现；不要整体复制其服务容器、应用组件或 Rails 预览调用链。[固定版本源码](https://gitlab.com/gitlab-org/gitlab/-/tree/03487409d7cdbf472341472b0083743132e9abe0/app/assets/javascripts/content_editor)。

## 3. 语法能力与编辑行为

首版将内容分为三种固定交互形式：

- **直接编辑**：在正文中编辑文本和结构。
- **专用编辑**：正文显示结果，通过弹窗或源码面板修改。
- **源码保留**：显示源码卡片，允许修改原文，不进行不可靠的结构转换。

### 功能矩阵

| 内容 | 首版行为 | 导出规则 |
|---|---|---|
| 段落、六级标题 | 直接编辑 | 修改块使用标准 GLFM |
| 粗体、斜体、删除线、行内代码 | 直接编辑 | 使用 GLFM 标记 |
| 普通引用、嵌套引用 | 直接编辑 | 修改后使用 `>` 引用 |
| 无序、有序、任务列表 | 直接编辑、缩进、取消缩进 | 保留有序列表起始序号和任务状态 |
| 分隔线、硬换行 | 直接编辑或插入 | 输出明确的 Markdown 语法 |
| 链接 | 编辑文字、原始地址、标题 | 保留原始相对地址 |
| 图片 | 预览；编辑原始地址、替代文本、标题；支持上传 | 输出 Markdown 图片 |
| 音频、视频、其他附件 | 专用节点，提供播放或文件链接 | 未修改时保留原文；新上传文件使用返回的 Markdown |
| 管道表格 | 编辑单元格、增删行列、设置对齐 | 输出 GLFM 管道表格 |
| GLFM 提示块 | 直接编辑正文，切换类型 | 输出 `> [!TYPE]` |
| `<details>` / `<summary>` | 编辑标题与正文 | 输出对应 HTML 结构 |
| 普通代码块 | 编辑语言和代码 | 输出围栏代码块 |
| 数学公式 | 展示 KaTeX；弹窗编辑公式源码 | 保留原定界方式；新建使用下述默认值 |
| Mermaid | 展示图表；弹窗编辑源码 | 输出 `mermaid` 围栏 |
| GitLab 用户、Issue、MR、提交等引用 | 原子行内节点，编辑引用原文 | 输出原始引用表达式 |
| Emoji 短代码 | 显示 GitLab 返回的 Emoji，保留短代码 | 输出原短代码 |
| 脚注引用及定义 | 引用可以展示；定义通过源码卡片编辑 | 保留原标识和定义原文 |
| 引用式链接及其定义 | 含引用式链接的块保留源码编辑 | 不自动改为行内链接 |
| GLFM 目录标记 | 编辑区显示占位卡片，预览展示服务端结果 | 保留原目录标记 |
| front matter、HTML 注释 | 源码保留卡片 | 原样输出 |
| 任意 HTML、复杂 HTML 表格、未知扩展 | 源码保留卡片 | 原样输出 |
| MkDocs 专属提示、标签页、宏等语法 | 源码保留或普通源码展示 | 不自动转换方言 |
| PlantUML、Kroki 和其他图表围栏 | 代码/源码编辑 | 保留围栏及内容，不自动调用外部图表服务 |

脚注、引用式链接和未知 HTML 在首版不开放结构化富文本修改。这一限制属于明确的产品范围，不交由实现者临时判断或补充另一套解析器。

### 规范化输出

规范化仅作用于用户修改或新建的源码块：

- 标题：ATX 形式，即 `#` 至 `######`。
- 粗体：`**`；斜体：`*`；删除线：`~~`。
- 无序列表：`-`。
- 有序列表：保留起始序号，使用 `.` 分隔符。
- 任务列表：`- [ ]`、`- [x]`。
- 分隔线：`---`。
- 普通硬换行：反斜杠加换行。
- 表格单元格只允许行内内容；单元格换行使用 `<br>`；不提供合并单元格。
- 行内代码与代码围栏采用足够长的反引号，避免与内容冲突。
- 新建块级公式使用 `math` 围栏；新建行内公式使用 GitLab 的美元符号包裹反引号语法。
- GLFM 提示类型固定为 `NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION`。
- 新建折叠块使用 `<details>` 和 `<summary>`，默认关闭。

公式和代码的“原始定界符、信息字符串”属于源码数据。修改内容时，只在原定界符不足以安全包裹新内容时调整其长度。

### 编辑界面

顶部工具栏固定提供：

- 撤销、重做；
- 段落和标题选择；
- 粗体、斜体、删除线、行内代码；
- 链接、图片/附件；
- 无序列表、有序列表、任务列表、引用；
- 表格、提示块、折叠块、代码、公式、Mermaid、分隔线；
- 编辑、源码、预览模式；
- 宿主提供保存接口时显示保存按钮。

首版使用固定工具栏和节点内按钮，不实现浮动气泡菜单、斜杠菜单或复杂拖拽排序。

源码模式使用等宽 `textarea`，支持 Tab 插入两个空格和浏览器原生文本编辑。公式、Mermaid、未知源码块也使用相同的源码输入组件，避免引入另一套代码编辑器依赖。

未知内容始终允许通过源码编辑，不能成为无法修改的只读死角。

## 4. 源码保留算法

这是首版的核心实现，必须先通过独立测试，再接入完整界面。

### 4.1 保留粒度

保留单位为**顶层源码块**：

- 一个段落、标题、表格、列表、引用或折叠块分别构成一个单位。
- 嵌套列表属于其顶层列表。
- 修改一个表格单元格，允许重写整个表格。
- 修改列表中的一项，允许重写整个顶层列表。
- 不承诺修改块内部的逐字符最小差异。
- 其他未修改块必须复用原始字符串。

空行和文件首尾空白单独记录。注释、链接定义等含有实际内容的区间必须成为源码节点，不能当作空白忽略。

### 4.2 初始源码记录

每次成功导入建立一份固定基线：

```ts
interface SourceBlock {
  id: string
  from: number
  to: number
  raw: string
  initialNode: SemanticNode
}

interface SourceBaseline {
  markdown: string
  blocks: SourceBlock[]
  gaps: string[]
  initialDocument: SemanticNode
  defaultEol: '\n' | '\r\n'
}
```

具体要求：

- `from`、`to` 使用原始 JavaScript 字符串的 UTF-16 半开区间。
- `raw` 不包含已单独归入相邻间隔的行末换行。
- `SemanticNode` 仅包含节点类型、正文、标记和影响导出的属性。
- 比较时排除块 ID、网络解析结果、主题、展开状态和编辑控件状态。
- 块 ID 使用会话内递增编号，不生成内容哈希。
- 默认换行使用原文中占多数的 LF 或 CRLF；数量相同或没有换行时使用 LF。
- 原文包含的 BOM、首尾空白、混合换行均原样保留。

### 4.3 源码区间建立

以 GitLab HTML 的 `data-sourcepos` 为主要来源，同时使用上游节点的 canonical source 元数据辅助识别。

实现步骤：

1. 保留原始字符串。
2. 为 GitLab 渲染过程中使用的换行规范化建立到原字符串的偏移映射。
3. 按 UTF-8 字节列解析 `data-sourcepos`，再转换为原文 UTF-16 偏移。
4. 从顶层语义节点或其可靠的外层包装取得区间。
5. 按源码顺序建立互不重叠的块。
6. 将块之间的所有剩余内容分类为空白或源码保留块。
7. 检查块与间隔拼接后必须严格等于输入原文。

不能直接把 GitLab 的列号用于 `substring()`。中文、emoji、CRLF 和制表符必须分别有验证样例。

同一区间对应多个展示包装时，合并为一个语义块。出现无法解释的重叠、无效边界或未识别结构时，将相关完整区间降为源码块。无法获得任何可靠边界时，整个文档作为一个源码块载入，并显示“当前渲染结果缺少可靠源码位置”的状态说明。

不能通过“搜索相同文字”恢复区间，否则重复段落和重复表格会发生错误匹配。

### 4.4 块身份随编辑变化

在顶层节点中保存非展示属性 `sourceId`，通过 ProseMirror 插件维护：

- 普通内容修改保留原 ID。
- 拆分块时，保留原起点的一块继承 ID，其余块获得新 ID。
- 合并块时，结果继承最左侧块的 ID。
- 粘贴内容清除来源 ID，再分配新 ID。
- 删除块后不保留空占位。
- 身份修正作为同一次历史操作的一部分，不能额外占用一次撤销。
- 检测重复 ID 时，通过事务位置映射保留原节点身份，不按文本匹配。

### 4.5 导出

每次导出按当前顶层节点顺序处理：

1. 整份语义文档恢复到基线时，直接返回完整原文。
2. 节点具有基线 ID，且语义与初始节点一致时，使用 `raw`。
3. 源码保留节点被修改时，输出其当前源码文本。
4. 其他新增或修改节点使用 GLFM serializer。
5. 被删除节点不输出。

间隔采用以下固定规则：

- 原来相邻且均未修改的两个块，复用原间隔。
- 任一相邻块被修改、新建或形成新的邻接关系时，使用两个默认换行。
- 规范化块的 serializer 不携带外围空白，由拼接层负责。
- 首尾空白只有对应的原始首块、尾块仍位于边界且未修改时才复用。
- 空文档返回空字符串；撤销恢复原始空白文档时返回基线原文。

`getMarkdown()`、保存、预览、主题切换都不能重建源码基线。只有外部载入新文档，或修改源码后成功重新进入富文本模式，才建立新基线。

不采用参考插件中的内容匹配恢复、整篇 HTML 反转 Markdown 或全局格式化方式。其现有设计允许重排部分未编辑表格，与这里的保留目标不同。[参考插件 Markdown 往返设计](https://github.com/samrocketman/mkdocs-live-wysiwyg-plugin/blob/main/docs/design/ui/DESIGN-markdown-awareness.md)。

## 5. Material 展示与预览

### 固定展示基线

视觉参照固定为：

- MkDocs `1.6.1`；
- MkDocs Material `9.7.7`；
- `pymdown-extensions` `11.0.2`；
- 亮色 `default` 和暗色 `slate`；
- KaTeX、Mermaid、lowlight 使用本方案指定版本。

上述 Python 依赖仅用于开发期生成参考页面，组件运行和 GitLab Pages 部署不依赖 Python 服务。

宿主存在 Material 样式时继承 `.md-typeset` 和 `--md-*` 变量。独立演示页提供局部基础样式。全部编辑控件使用 `glfm-editor__*` 前缀，不覆盖宿主的全局标题、表格或按钮样式。

首版不增加通用主题系统或可插拔的数学、高亮引擎接口。

### 语义到展示的映射

| 语义 | 展示结构 |
|---|---|
| 普通正文 | `.md-typeset` 内的标准语义元素 |
| 提示块 | `.admonition.<type>`、`.admonition-title` |
| 折叠块 | `details`、`summary` |
| 代码 | Material 风格代码容器、语言标签、复制按钮 |
| 表格 | Material 风格表格及横向滚动容器 |
| 数学 | KaTeX 输出，局部溢出滚动 |
| Mermaid | 节点内部 SVG，跟随亮暗主题重绘 |
| GitLab 引用 | 使用 Material 链接颜色，保留引用类别提示 |
| 未知内容 | 源码卡片及明确的编辑入口 |

GLFM 提示块仍保存为：

```markdown
> [!NOTE]
> 提示正文。
```

展示转换为 Material 的 admonition 结构，不写成 `!!! note`。参考插件只用于借鉴这一展示方式，不引入其服务端、WebSocket 或整体编辑脚本。[参考插件提示块实现](https://github.com/samrocketman/mkdocs-live-wysiwyg-plugin/blob/main/mkdocs_live_wysiwyg_plugin/mkdocs-admonition-extension.js)、[Material 提示块文档](https://squidfunk.github.io/mkdocs-material/reference/admonitions/)。

### 特殊节点运行规则

- KaTeX 设置 `trust: false`；渲染失败时显示原公式与错误。
- Mermaid 设置 `securityLevel: 'strict'`，禁用自动扫描页面，逐节点渲染。
- 代码高亮由 lowlight 完成，未知语言按纯文本显示。
- 不承诺 lowlight 与 Pygments 的每个 token 完全相同。
- 折叠块为了编辑临时展开时，不修改其源码中的 `open` 状态。
- 图片的原始路径与展示 URL 分开保存。
- 媒体不自动播放，默认不预加载完整文件。
- Mermaid、数学和高亮结果均不进入 Markdown 或 ProseMirror 内容。

### 预览流程

预览模式读取当前完整 Markdown，调用 `renderMarkdown`，净化返回 HTML，再进行 Material 结构转换和数学、图表处理。

预览处于显示状态时，输入变化延迟 350 毫秒刷新。普通富文本输入不触发整篇远程渲染。

每次预览请求带取消信号和递增请求序号。旧响应不能覆盖新内容。失败时保留上一份成功预览，并清楚标注其已过期，提供重试入口。

预览只用于展示，不回写 Markdown，也不反向替换当前编辑文档。

这份预览的定义是“GLFM 语义的 Material 风格展示”。现有 MkDocs 构建对 GLFM 的支持程度保持原状；本次不修改 Python 扩展或构建语法，使其自动获得全部 GLFM 能力。

## 6. 公共接口与状态行为

### TypeScript 接口

```ts
type EditorMode = 'wysiwyg' | 'source' | 'preview'

interface DocumentContext {
  documentId: string
  linkBaseUrl: string
  assetBaseUrl: string
}

interface RenderRequest {
  markdown: string
  context: DocumentContext
  signal: AbortSignal
}

interface UploadRequest {
  file: File
  context: DocumentContext
  signal: AbortSignal
}

interface UploadResult {
  markdown: string
}

interface SaveRequest {
  markdown: string
  context: DocumentContext
  signal: AbortSignal
}

interface EditorServices {
  renderMarkdown(request: RenderRequest): Promise<{ html: string }>
  uploadFile?(request: UploadRequest): Promise<UploadResult>
  saveMarkdown?(request: SaveRequest): Promise<void>
}

interface EditorError {
  operation: 'import' | 'preview' | 'upload' | 'save'
  message: string
  cause?: unknown
}

interface EditorState {
  mode: EditorMode
  dirty: boolean
  importing: boolean
  saving: boolean
  uploading: number
}
```

`linkBaseUrl` 和 `assetBaseUrl` 必须为绝对目录 URL。由宿主根据仓库文件或 Wiki 页面位置提供，组件不猜测当前 GitLab 路由。

上传结果使用 Markdown 字符串，与 GitLab Wiki 附件接口返回的 `link.markdown` 对接。组件不假定每个上传文件都是图片。[GitLab Wiki 附件接口](https://docs.gitlab.com/api/wikis/#upload-an-attachment-to-the-wiki-repository)。

### Vue API

```vue
<GlfmEditor
  v-model="markdown"
  :context="context"
  :services="services"
  :readonly="false"
  initial-mode="wysiwyg"
  @state-change="onStateChange"
  @error="onError"
  @saved="onSaved"
/>
```

组件属性固定为：

- `modelValue: string`
- `context: DocumentContext`
- `services: EditorServices`
- `readonly?: boolean`，默认 `false`
- `initialMode?: EditorMode`，默认 `wysiwyg`

实例暴露：

```ts
interface GlfmEditorHandle {
  getMarkdown(): string
  focus(): void
  setMode(mode: EditorMode): Promise<boolean>
  markSaved(markdown: string): void
}
```

另导出：

- `GlfmPreview`：仅展示预览，接受 Markdown、context 和 render 服务。
- `mountGlfmEditor(element, options)`：供 MkDocs 普通脚本挂载，返回 `getMarkdown`、`setMarkdown`、`markSaved`、`destroy`。
- `createGitLabMarkdownService(options)`：创建默认渲染适配器。
- 所有公共 TypeScript 类型。
- `style.css`。

### 模型同步

- 每次已提交的文档变更同步计算局部导出结果并触发 `update:modelValue`。
- 缓存未改变块的导出结果，不重复序列化整篇节点树。
- 中文输入法组合期间不重建文档、不调用 `setContent`；组合结束后统一输出事件。
- `getMarkdown()` 始终返回当前最新内容，包括尚未向宿主发出更新的输入法内容。
- 父组件回传与当前值相同的 `modelValue` 视为回声，不重新导入。
- 不同的外部值视为宿主明确要求载入新内容，取消旧导入并建立新文档。
- `documentId` 改变时，清空该文档的历史与解析缓存，重新载入。
- 宿主不能将异步保存回执中的旧 Markdown 重新写入 `v-model`；回执只调用 `markSaved`。

### 模式切换与历史

- 富文本切换到源码：立即导出，保留现有富文本文档。
- 源码没有变化时切回：直接恢复原文档、选区和撤销历史。
- 源码发生变化时切回：调用 render、重新导入；成功后建立新基线和新的富文本历史。
- 重新导入失败：停留在源码模式，保留全部输入，显示错误。
- 预览模式切换不改变编辑历史。
- 不实现跨源码重解析边界的统一撤销历史；源码模式继续使用原生文本撤销。

### 保存和上传

保存按钮只有在提供 `saveMarkdown` 时显示：

1. 点击保存时捕获 Markdown 快照。
2. 保存期间允许继续编辑，禁止重复触发保存。
3. 成功后以该快照更新“已保存内容”。
4. 如果用户在请求期间继续编辑，当前文档仍显示未保存状态。
5. 失败保留内容与状态，显示错误并允许重试。

不实现自动保存。外部自行保存的宿主通过 `markSaved(snapshot)` 更新状态。

上传仅在提供 `uploadFile` 时启用：

- 上传中的占位使用 Decoration，不写入 Markdown。
- 通过事务映射维护插入位置。
- 上传完成后，在原位置作为一次可撤销操作插入返回内容。
- 原插入位置已被删除或文档已切换时，不重新插入附件。
- 无法结构化解析上传 Markdown 时，插入源码保留块，不能丢弃结果。

### 默认 GitLab 适配器

```ts
createGitLabMarkdownService({
  baseUrl: 'https://gitlab.example.com',
  project: 'group/project',
  getHeaders: async () => ({
    Authorization: `Bearer ${sessionToken}`,
  }),
})
```

适配器调用：

```http
POST /api/v4/markdown
Content-Type: application/json

{
  "text": "...",
  "gfm": true,
  "project": "group/project"
}
```

要求：

- `getHeaders` 在请求时执行，凭据由宿主管理。
- 不把凭据写入构建产物、组件配置文件、日志或本地存储。
- 将 HTTP 和网络错误转换为清楚的组件错误。
- 不依赖 GitLab 内部 Wiki 预览端点。
- 公共 Markdown API 未提供完整 Wiki 渲染上下文；文档链接和附件路径使用宿主提供的基准 URL 解析。
- 服务返回的渲染地址只用于展示，导出始终使用原始引用或路径。

GitLab 公共 Markdown API 的正式请求字段就是 `text`、`gfm` 和 `project`；不要自行增加未公开的 Wiki 参数。[Markdown API](https://docs.gitlab.com/api/markdown/)。

## 7. 安全、部署与示例

### HTML 和资源处理

服务端 HTML、粘贴 HTML 和动态 SVG 均经过适合其内容类型的净化流程：

- 移除脚本、事件属性、iframe、表单和内联样式。
- 导入阶段只保留需要的 `data-sourcepos`、canonical source 和 GLFM 语义属性。
- 阻止 `javascript:`、`vbscript:`、HTML data URL 等可执行地址。
- 图片使用 HTTP(S)、相对地址或组件自己创建的临时 blob URL。
- 用户源码中的危险 HTML保留为文本，不执行。
- 不根据 Markdown 中的 URL 自动访问任意图表生成服务。
- 不将原文或令牌发送到 GitLab 适配器之外的遥测服务。

外部粘贴 HTML 只导入已支持的内容，无法识别的部分退回纯文本。粘贴纯文本保持普通文本行为，不自动把整段文本当 Markdown 导入。

### 构建产物

构建两套入口，共用同一份业务实现：

1. `index.js`：ESM 库入口，Vue 作为 peer dependency。
2. `standalone.js`：静态挂载入口，包含 Vue，供 MkDocs 直接使用。

发布包包含声明文件和 `style.css`。Mermaid、KaTeX 和高亮代码按需加载；其 chunk、字体和样式随站点一起部署，不依赖 CDN。

静态入口及资源使用相对路径，必须能部署到 GitLab Pages 的项目子目录。

### MkDocs 接入

示例页面放置明确的编辑器挂载容器，通过站点脚本调用 `mountGlfmEditor`。Markdown 来源与保存目标由宿主页面控制。

生命周期要求：

- 首次进入页面挂载。
- Material instant navigation 后检查新容器并挂载。
- 同一容器只能存在一个实例。
- 离开页面销毁旧实例、监听器、订阅和未完成请求。
- 主题切换只更新展示；不能触发模型更新或源码重新导入。

使用 Material 的 `document$` 对接即时导航，销毁时释放订阅。[Material 自定义 JavaScript](https://squidfunk.github.io/mkdocs-material/customization/#additional-javascript)。

提供两类示例：

- **离线示例**：内置 Markdown 和对应 HTML fixture，允许对已载入富文本文档编辑、撤销和导出。任意新增源码的服务端解析需要连接实际适配器，界面明确显示该限制。
- **实际接入示例**：展示宿主如何注入 render、upload、save 和文档基准 URL，不包含真实令牌或项目凭据。

不把 fixture 适配器描述为完整的本地 GLFM 引擎。

## 8. 实施顺序、测试与交付标准

按照以下顺序实施。每一步完成对应验收后再继续，不先堆满工具栏和所有节点。

### 阶段一：核心转换与源码保留

完成基础文档、段落、标题、列表、表格、代码块、源码块及 GitLab HTML 导入。

必须通过：

- 未编辑导出严格等于输入。
- 修改一个段落后其他源码块保持原样。
- 修改不规则表格后，只规范化该表格。
- 重复段落、重复表格不发生源码串用。
- 中文、emoji、制表符、CRLF、混合换行映射正确。
- 无效或缺失 sourcepos 不丢内容。
- 撤销所有编辑后恢复完整原文。
- 未被 HTML 展示的注释、定义和 front matter 仍完整导出。

### 阶段二：GLFM 交互与 Material 视图

完成提示块、折叠块、数学、Mermaid、引用、媒体，以及完整工具栏。

必须通过：

- 提示块显示为 Material admonition，导出仍为 GLFM。
- 公式、Mermaid 修改后源码正确；渲染错误不删除内容。
- 改变代码语言不会把高亮 span 或复制按钮写进 Markdown。
- GitLab 引用显示信息更新时不触发 dirty。
- 主题切换、折叠块临时展开不触发模型变更。
- 相对图片路径在预览中解析正确，导出地址保持原样。
- 未知 HTML、脚注和引用式链接可以通过源码修改。

### 阶段三：宿主接口与静态集成

完成组件 API、保存上传、源码/预览切换、独立挂载和 MkDocs 示例。

必须通过：

- 父组件 `v-model` 回声不重建编辑器。
- 输入法组合期间光标与正文不被重置。
- 模式切换遵守历史边界。
- 旧请求响应不覆盖新文档。
- 保存期间继续输入，保存成功后仍保留正确 dirty 状态。
- 上传位置被删除后，完成响应不重新插入附件。
- 导航反复进入页面不存在重复实例、监听器或未取消请求。
- 项目子路径部署下 JS、CSS、chunk、字体加载正常。

### 阶段四：视觉、安全和交付检查

视觉测试使用同一字体、宽度、Material CSS 和运行时版本建立参考页，覆盖亮暗主题、桌面和移动窄屏。

检查正文、提示块、表格、折叠块、代码、数学、Mermaid：

- 没有溢出遮挡、工具栏污染或主题颜色错误。
- 只有表格、长代码和公式容器按需横向滚动。
- 节点失焦后接近阅读展示，聚焦后编辑入口清楚。
- 禁用动画后保存 Playwright 截图，人工检查后建立基线；不能自动接受全部截图差异。

安全样例覆盖脚本、事件属性、危险链接、SVG 和 Mermaid 点击指令，确认它们不能执行或进入不受控请求。

自动化测试以行为和源码结果为主，不为每个内部函数单独堆积测试。性能样例使用约 100 KB、500 个顶层块的混合文档，确认输入不触发远程整篇解析，且导出只重新序列化受影响块。

交付内容必须包含：

- 可安装的 Vue 包和静态挂载产物；
- Vue 与 MkDocs 两个接入示例；
- 语法能力表和模式切换说明；
- API、保存上传接入及静态部署说明；
- GitLab 移植来源与许可证说明；
- 转换、交互、源码保留和视觉测试；
- 实际执行的验证结果。

仓库中的函数附简洁中文用途说明，其他注释按需添加。文档只描述最终实现，不残留备选编辑器、废弃转换方案或尚未实现的能力承诺。

**全部离线验收是交付的必要条件。真实 GitLab 集成只在提供实际实例和凭据时执行；未执行时必须在验证记录中明确标注，不能用 fixture 测试替代或声称已经验证。**

上述技术栈、功能边界、默认展示、接口、失败行为和实现顺序均已固定，实现者直接按此规格开发。
