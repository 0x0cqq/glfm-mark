# glfm-mark 架构

本文件描述当前实现的结构、数据流与模块边界。决策背景见 `docs/adr/`，
语法支持与限制见 `docs/compatibility.md`。

## 定位

`glfm-mark` 是面向 GitLab Pages / MkDocs 静态站点的 GLFM 所见即所得编辑器。
对外数据模型始终是 Markdown 字符串；ProseMirror 文档只是组件内部的编辑状态。

技术路线固定为 Vue 3 + Tiptap 3（ProseMirror），定向移植 GitLab Content Editor
的 GLFM 编辑规则与转换逻辑，自建源码保留层与 MkDocs Material 展示层。

## 目录结构

| 路径 | 职责 |
|---|---|
| `src/core/` | 编辑器核心：Tiptap 实例、状态、模式切换、保存上传、公开类型 |
| `src/glfm/` | GLFM 节点与标记、HTML 解析规则、Markdown 序列化 |
| `src/source/` | 源码保留：sourcepos 映射、基线、块身份、局部导出、语义快照 |
| `src/material/` | Material 展示：HTML 净化、提示块转换、KaTeX、Mermaid、代码高亮 |
| `src/components/` | Vue 界面：工具栏、源码编辑区、预览、弹窗与节点视图 |
| `src/adapters/` | 宿主适配：默认 GitLab Markdown API 服务 |
| `src/standalone.ts` | 静态挂载入口 `mountGlfmEditor` |
| `demo/` | 开发演示页 |
| `examples/mkdocs/` | MkDocs Material 参考页与两类接入示例 |
| `tests/` | 单元、集成、安全、性能与视觉测试 |
| `tools/` | fixture 与示例资源生成脚本 |

## 数据流

```text
输入 GLFM Markdown
    │
    ├── 保存原始源码与换行信息（buildLineIndex / detectDefaultEol）
    │
    └── 调用宿主 renderMarkdown
             │
             ▼
       净化 GitLab HTML（sanitizeGitLabHtml）
             │
             ▼
       读取 data-sourcepos → UTF-8 字节列换算为 UTF-16 偏移
             │
             ▼
       按源码顺序建立互不重叠的源码块 + 语义节点
             │
             ▼
       叠加 sourceId 的 ProseMirror 文档
             │
          用户编辑
             │
             ▼
       未修改块复用原文，修改块用 GLFM serializer 重写
             │
             ▼
       update:modelValue
```

## 模块边界

### 源码保留（`src/source/`）

保留单位是**顶层源码块**：一个段落、标题、表格、列表、引用或折叠块分别构成一个单位。
嵌套列表属于其顶层列表；修改一个单元格允许重写整个表格。

- `sourcepos.ts`：解析 `data-sourcepos`，把 1 起始的 UTF-8 字节列换算为原始
  JavaScript 字符串的 UTF-16 偏移。行尾 CR 不计入列号，起始列必须落在字符起始
  字节上。
- `import.ts`：建立基线。块之间剩余的空白记入间隔；含有实际内容的剩余区间
  （例如 front matter、链接定义、注释）成为源码保留块。最后校验“间隔 + 块原文”
  严格等于输入，否则整篇降级为单个源码块。
- `source-id.ts`：块身份插件。事务后扫描顶层块并为新增或重复的身份分配新 ID；
  粘贴内容在 `transformPasted` 阶段清除来源 ID。
- `semantic.ts`：语义快照。只包含节点类型、正文、标记与影响导出的属性，
  排除块 ID、展示地址、主题和编辑控件状态。
- `export.ts`：局部导出。命中基线且语义未变的块复用 `raw`；间隔只在相邻块
  原本相邻且都未修改时复用，否则使用两个默认换行。

### GLFM（`src/glfm/`）

- `schema.ts`：逐个注册扩展，不使用 StarterKit，避免默认链接、列表、历史等
  能力与 GLFM 扩展重复。
- `extensions/`：节点与标记定义，同时承担 GitLab HTML 的解析规则。
- `serialize.ts`：**唯一的 Markdown 序列化入口**。块级结构直接拼装，行内内容
  交给 `prosemirror-markdown` 的 `renderInline`，从而复用其标记、转义与空白处理，
  同时完全控制块之间的空白。

### Material 展示（`src/material/`）

- `sanitize.ts`：服务端 HTML、粘贴 HTML 与动态 SVG 分别净化。
- `preview.ts`：预览流程。净化 → 提示块转 Material admonition → 解析展示地址 →
  代码高亮、KaTeX、Mermaid。
- `math.ts` / `mermaid.ts` / `highlight.ts`：按需加载，渲染失败时保留原文与错误。

### 编辑核心（`src/core/`）

- `editor.ts`：持有 Tiptap 编辑器、文档控制器与模式状态。对外只暴露 Markdown。
- `extensions.ts`：在 schema 之上挂载 Vue 节点视图；schema 本身保持无 DOM 依赖，
  供源码保留层与测试使用。

## 状态与并发

| 场景 | 处理 |
|---|---|
| 未完成导入 | `DocumentController` 用递增请求序号；旧响应被丢弃 |
| 父组件回传相同值 | 视为回声，不重新导入 |
| 输入法组合 | 组合期间不重建文档，组合结束后统一输出事件 |
| 保存 | 以发起请求时的快照为准；期间继续编辑，成功后仍为未保存状态 |
| 上传 | 占位不写入文档；原位置被删除时不重新插入 |
| 预览 | 350 ms 延迟刷新；带取消信号与请求序号；失败保留上一份并标注过期 |
| 销毁 | 释放编辑器、计时器、请求与订阅 |

## 构建产物

| 产物 | 说明 |
|---|---|
| `dist/index.js` | ESM 库入口，Vue 为 peer dependency |
| `dist/standalone.js` | 静态挂载入口，内联 Vue |
| `dist/style.css` / `dist/standalone.css` | 样式，与对应入口搭配 |
| `dist/katex.css` + `dist/fonts/` | KaTeX 样式与字体，由宿主页面引入 |
| `dist/assets/*` | 按需加载的 Mermaid、KaTeX 与高亮代码块 |
| `dist/*.d.ts` | 类型声明 |

静态资源的引用使用相对路径，可部署到 GitLab Pages 的项目子目录。

公式排版依赖 `dist/katex.css`：库模式构建会把 CSS 中引用的字体内联为 base64，
因此 KaTeX 样式与字体独立发布，由宿主页面通过 `<link rel="stylesheet">` 引入。
原因与影响见 `docs/lessons.md`。

## 相关文档

- 语法支持与限制：`docs/compatibility.md`
- 重要决策：`docs/adr/`
- 已验证经验：`docs/lessons.md`
- 协作方式与工程约束：`AGENTS.md`
