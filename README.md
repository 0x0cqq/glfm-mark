# glfm-mark

面向 GitLab Pages / MkDocs 静态站点的 GLFM 所见即所得编辑器。

- 对外数据模型始终是 **Markdown 字符串**；
- 编辑内核为 Vue 3 + Tiptap 3（ProseMirror）；
- 定向移植 GitLab Content Editor 的 GLFM 编辑与转换规则；
- 支持编辑、源码、预览三种模式；
- 构建产物为静态 JS、CSS 与按需加载的资源。

## 渲染依赖与离线能力

编辑器通过必需的宿主接口 `services.renderMarkdown({ markdown, context, signal })`
取得 `{ html }`，用于导入文档、修改源码后返回富文本模式，以及刷新预览。
富文本内的普通编辑与 Markdown 导出在浏览器本地完成。

| 实现 | 用途 | 是否调用 GitLab |
|---|---|---|
| `src/adapters/gitlab.ts` | `createGitLabMarkdownService`，请求 `/api/v4/markdown` | 是 |
| `tests/fixtures/renderer.ts` | markdown-it 生成近似 GitLab HTML 并附加源码位置，供测试和 `demo/` 使用 | 否 |
| MkDocs 离线示例 | 按完整 Markdown 查找预生成 HTML fixture | 否，仅支持已收录的文档 |

可以用自定义本地渲染器替换 GitLab API，但它必须提供编辑器识别的 HTML 结构和可靠的
`data-sourcepos`（1 起始、UTF-8 字节列、闭区间）。普通 markdown-it HTML 不能直接满足
完整的导入契约；缺少可靠位置时会降级为源码保留块。测试渲染器没有作为包接口发布，
也没有覆盖完整 GLFM 语义或 GitLab 项目引用解析。

**当前 standalone 内联 Vue，仍需宿主提供渲染服务；尚未提供可直接部署的完整离线 GLFM 引擎。**
MkDocs 的预生成 fixture 可用于演示初始文档的富文本编辑；内容改变后，预览或源码重解析
会因没有对应 fixture 而报错。

[GitLab Markdown API 文档](https://docs.gitlab.com/api/markdown/)要求认证，并未承诺返回
`data-sourcepos`。接入时需要核对目标实例实际输出的 HTML；当前测试只验证 fixture 契约，
尚未完成真实 GitLab 实例验证。详见[架构](docs/architecture.md)与[能力限制](docs/compatibility.md)。

## Vue 项目接入

包名为 `@glfm-mark/vue`，不代表已在 npm 注册或发布。可以从源码构建并安装本地包：

```bash
# 在本仓库执行（Node.js 22.18+ 或 24+）
npm ci
npm run build
npm pack

# 在宿主 Vue 项目执行，替换为生成的 tgz 路径
npm install /path/to/glfm-mark-vue-0.1.0.tgz
```

在你的包仓库已发布该包时，可直接安装：

```bash
npm install @glfm-mark/vue
```

Vue 3.5 以上为 peer dependency，由宿主提供。

### 最小示例

示例中的 `getToken()` 由宿主登录会话提供，需要替换为实际认证逻辑。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { GlfmEditor, createGitLabMarkdownService } from '@glfm-mark/vue';
import '@glfm-mark/vue/style.css';
// 公式排版依赖 KaTeX 样式；字体随站点一起部署，不依赖 CDN。
import '@glfm-mark/vue/katex.css';

const markdown = ref('# 标题\n\n正文。\n');

const context = {
  documentId: 'wiki-page-1',
  linkBaseUrl: 'https://gitlab.example.com/group/project/-/wikis/',
  assetBaseUrl: 'https://gitlab.example.com/group/project/-/wikis/uploads/',
};

const services = {
  renderMarkdown: createGitLabMarkdownService({
    baseUrl: 'https://gitlab.example.com',
    project: 'group/project',
    // 凭据由宿主管理，不写入构建产物、配置、日志或本地存储。
    getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  }).renderMarkdown,
};
</script>

<template>
  <GlfmEditor v-model="markdown" :context="context" :services="services" />
</template>
```

## Standalone 静态部署

适用于普通 HTML、GitLab Pages 和 MkDocs。构建时需要 Node.js；部署后只需提供静态文件
的 HTTP(S) 服务，浏览器直接加载 ES module，无需在服务器运行 Node.js 或 Vue 构建器。
渲染、保存和上传服务由宿主按需接入，静态托管本身不会实现这些接口。

### 1. 构建与复制资源

在仓库根目录运行 `npm ci` 和 `npm run build`。将以下产物一起复制到站点的
`glfm-mark/` 目录，保留相对目录结构；也可直接复制整个 `dist/`：

```text
站点目录/
├── index.html
├── editor.js
└── glfm-mark/
    ├── standalone.js
    ├── standalone.css
    ├── katex.css
    ├── assets/           # 动态加载的 JS 分块，完整复制
    └── fonts/            # KaTeX 字体，完整复制
```

仅复制 `standalone.js` 会缺少它引用的分块。`index.js` 是供构建器使用的 Vue 库入口；
浏览器脚本应从 `./glfm-mark/standalone.js` 导入，包名形式的
`@glfm-mark/vue/standalone` 需要构建器解析。

### 2. 创建页面和初始化脚本

以下例子通过 GitLab 适配器加载初始文档。先把 `editor.js` 中的 GitLab 地址和项目路径
改为实际值，再在页面输入会话令牌。令牌只在当前页面内存中使用；实际应用可改为宿主
登录会话或受认证的服务代理。浏览器直连跨域 GitLab 时，需要目标实例允许相应跨域请求。

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GLFM 编辑器</title>
<link rel="stylesheet" href="./glfm-mark/standalone.css" />
<link rel="stylesheet" href="./glfm-mark/katex.css" />
<form id="connect">
  <label>GitLab 访问令牌 <input id="token" type="password" required /></label>
  <button type="submit">载入编辑器</button>
</form>
<p id="status" role="status"></p>
<div id="editor"></div>
<script type="module" src="./editor.js"></script>
</html>
```

`editor.js`：

```js
import { mountGlfmEditor, createGitLabMarkdownService } from './glfm-mark/standalone.js';

const status = document.getElementById('status');
const form = document.getElementById('connect');
let editor;

/** 用当前输入的令牌建立渲染服务并挂载编辑器。 */
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const tokenInput = document.getElementById('token');
  const token = tokenInput.value;
  tokenInput.value = '';
  const services = createGitLabMarkdownService({
    baseUrl: 'https://gitlab.example.com',
    project: 'group/project',
    getHeaders: () => ({ 'PRIVATE-TOKEN': token }),
  });
  // 相对文档链接与附件均以本页面所在目录解析，可替换为仓库或 Wiki 的目录 URL。
  const directoryUrl = new URL('./', location.href).href;
  editor = mountGlfmEditor(document.getElementById('editor'), {
    markdown: editor?.getMarkdown() ?? '# 标题\n\n正文。\n',
    context: {
      documentId: 'page-1',
      linkBaseUrl: directoryUrl,
      assetBaseUrl: directoryUrl,
    },
    services,
    /** 向页面显示导入、预览等错误。 */
    onError(error) { status.textContent = error.message; },
    /** 内容变化时通知宿主；实际持久化通过 saveMarkdown 接入。 */
    onChange() { status.textContent = '内容已修改，尚未保存。'; },
  });
});

/** 页面离开时释放编辑器。 */
window.addEventListener('pagehide', () => editor?.destroy());
```

加载模块后需要实际调用 `mountGlfmEditor` 才会显示编辑器。这个例子提供编辑和预览；
如需保存按钮，设置 `services.saveMarkdown`，成功时 resolve、失败时抛出错误。
上传按钮对应可选的 `services.uploadFile`。也可用 `editor.getMarkdown()` 读取当前内容。

### 3. 通过 HTTP(S) 访问并发布

本地可在上述站点目录执行 `python -m http.server 8080`，打开
`http://localhost:8080/`（Python 仅用于本地预览）。正式部署把整个站点目录交给已有
GitLab Pages 或其他静态托管流程；不要通过 `file://` 双击打开模块页面。

例如部署到 `https://group.gitlab.io/project/editor/` 时，保持 `editor.js` 与
`glfm-mark/` 相对页面的关系即可。检查浏览器网络面板中的入口、`assets/` 分块、CSS
和字体均成功返回，并检查导入、修改、预览和错误提示。服务端应以 JavaScript MIME 类型
提供 `.js` 文件。普通页面使用组件自带样式，在 MkDocs Material 中进一步继承其主题样式。

### MkDocs 接入与仓库示例

在已有 MkDocs 项目中，把上述 `glfm-mark/` 复制到 `docs/glfm-mark/`，初始化脚本放到
`docs/assets/editor.js`，再配置 `extra_css` 和模块脚本。具体路径、页面容器与
`document$` 即时导航的销毁和挂载代码见[实际接入示例](examples/mkdocs/docs/editor-integration.md)。
继续使用宿主原来的 `mkdocs build` 和 Pages 发布流程，上传构建出的整个站点目录。

要先运行本仓库的**固定文档离线演示**，在仓库根目录执行：

```bash
npm ci
python -m venv .venv
.venv/Scripts/python -m pip install mkdocs==1.6.1 mkdocs-material==9.7.7 pymdown-extensions==11.0.2
npm run examples:build
.venv/Scripts/python -m mkdocs serve --config-file examples/mkdocs/mkdocs.yml
```

打开 `http://127.0.0.1:8000/editor-offline/`；生成的完整站点位于 `examples/mkdocs/site/`。
以上聚合命令使用 Windows 虚拟环境路径。Linux/macOS 请使用 `.venv/bin/python`，并将
`npm run examples:build` 展开为 `npm run fixtures`、`npm run build`、
`npm run examples:prepare` 和 `.venv/bin/python -m mkdocs build --config-file examples/mkdocs/mkdocs.yml`。

## 组件属性与实例方法

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `modelValue` | `string` | — | Markdown，双向绑定 |
| `context` | `DocumentContext` | — | 文档 ID 与绝对目录 URL |
| `services` | `EditorServices` | — | 渲染、上传与保存接口 |
| `readonly` | `boolean` | `false` | 只读 |
| `initialMode` | `EditorMode` | `wysiwyg` | `wysiwyg`、`source` 或 `preview` |

Vue 组件实例方法：`getMarkdown()`、`focus()`、`setMode(mode)`、`markSaved(markdown)`。

事件：`update:modelValue`、`state-change`、`error`、`saved`。

standalone 挂载选项使用 `markdown` 指定初始值，支持 `onChange` 和 `onError` 回调。
返回句柄提供 `getMarkdown()`、`setMarkdown(markdown)`、`setMode(mode)`、
`markSaved(markdown)`、`destroy()`；`setMarkdown` 更新输入值，异步解析错误通过 `onError` 报告。
完整类型见 [`src/core/types.ts`](src/core/types.ts) 和 [`src/standalone.ts`](src/standalone.ts)。

只读预览组件 `GlfmPreview` 使用 `markdown`、`context`、`services` 属性，
可选 `delay` 控制刷新延迟（默认 350 ms），实例提供 `refresh()`。

## 常用命令

```bash
npm ci                # 安装依赖
npm run dev           # 启动演示页
npm run typecheck     # 类型检查
npm test              # 单元、集成、安全与性能测试
npm run build         # 构建库与静态挂载产物
npm run fixtures      # 生成离线示例的 HTML fixture
npm run examples:prepare  # 复制示例站点资源（需先 build，fixture 单独生成）
npm run examples:build    # 生成 fixture、构建库与 MkDocs 站点（需安装 Python 依赖）
npm run test:visual   # 视觉对比测试（需先启动演示页与 MkDocs 站点）
```

视觉测试使用演示页 `http://127.0.0.1:5173/` 和示例站点 `http://127.0.0.1:8020/`。
构建示例站点后，分别在两个终端运行 `npm run dev` 和
`python -m http.server 8020 --directory examples/mkdocs/site`，再执行测试命令。
默认检查桌面亮色；设置环境变量 `GLFM_VISUAL_FULL=1` 可增加桌面暗色和移动端检查。

## 文档

- [当前架构](docs/architecture.md)
- [语法支持与限制](docs/compatibility.md)
- [重要决策（ADR）](docs/adr/)
- [已验证经验](docs/lessons.md)
- [原始设计规格](docs/original-design-doc.md)
- [协作方式与工程约束](AGENTS.md)

## 示例

- `demo/`：开发演示页，覆盖主要 GLFM 语法。
- `examples/mkdocs/`：Material 参考页、编辑器离线示例与实际接入示例。

## 许可证

MIT。移植自 GitLab 的前端编辑器代码来源与版本见
[ADR 0001](docs/adr/0001-editor-core.md)。
