# 实际接入示例

本页说明在已有 MkDocs Material 站点中部署 standalone。解析与预览在浏览器内完成，
无需认证或渲染服务；保存、上传和文档载入按宿主需要接入。

## 文件与配置

执行 `npm run build`，将 `dist/standalone.js`、`dist/standalone.css`、`dist/katex.css`
和完整的 `dist/assets/`、`dist/fonts/` 复制到 MkDocs 的 `docs/glfm-mark/`。
将下面的初始化脚本保存为 `docs/assets/editor.js`，宿主服务保存为
`docs/assets/host-services.js`。

在现有 `mkdocs.yml` 中合并以下配置，保留原有项：

```yaml
extra_css:
  - glfm-mark/standalone.css
  - glfm-mark/katex.css
extra_javascript:
  - path: assets/editor.js
    type: module
```

在需要编辑器的 Markdown 页面中添加：

```html
<div id="glfm-editor" data-document-id="wiki-page-1"></div>
<p id="glfm-status" role="status"></p>
```

MkDocs 会根据页面层级生成资源 URL。脚本中的模块导入相对脚本文件解析，因此从
`assets/editor.js` 引用库的路径为 `../glfm-mark/standalone.js`。
运行宿主原有的 `mkdocs build`，将整个输出目录按原有 Pages 流程发布，保留资源目录。

## 宿主服务

`host-services.js` 是需要自行实现的宿主模块，导出 `loadDocument(documentId)` 和
`services`。`loadDocument` 返回 `{ markdown, context }`；`context` 的 `documentId`
标识当前文档，`linkBaseUrl` 与 `assetBaseUrl` 是绝对目录 URL，由宿主根据仓库文件或
Wiki 页面位置提供。

对于默认目录 URL 的 MkDocs 页面，例如页面 `/cs/algorithms/sorting/` 对应源码
`docs/cs/algorithms/sorting.md`，同目录附件的 `assetBaseUrl` 应指向
`/cs/algorithms/` 的绝对 URL。编辑区和预览据此显示图片与媒体，保存时仍使用源码中的
相对地址。

| 服务 | 用途 | 是否必需 |
|---|---|---|
| `uploadFile({ file, context, signal })` | 上传附件，返回 `{ markdown }` 供插入 | 可选 |
| `saveMarkdown({ markdown, context, signal })` | 保存请求发起时的 Markdown 快照，成功时 resolve | 可选 |
| `resolveAssetPreview(source)` | 待写入图片的临时展示地址；源码继续使用相对地址 | 可选 |

上传与保存实现应传递 `signal`，检查 HTTP 状态和返回字段，失败时抛出错误。组件据此
保留当前内容并显示失败；`fetch` 收到 HTTP 4xx/5xx 本身不会抛出异常。
静态页面托管不会自动获得文档读取、上传或保存 API。

需要把 Markdown 与新图片一起提交时，宿主可使用 `DocumentSession` 生成
`DocumentBundle` 并交给存储适配器。Node 本地验证可用 `LocalDirectoryAdapter` 写入
隔离的仓库副本；浏览器需要宿主 API 连接本地文件系统。接口见项目
[`src/adapters/types.ts`](../../../src/adapters/types.ts) 和
[`docs/architecture.md`](../../../docs/architecture.md)。

## 初始化与即时导航

`docs/assets/editor.js`：

```js
import { mountGlfmEditor } from '../glfm-mark/standalone.js';
import { loadDocument, services } from './host-services.js';

let editor;
let container;
let navigation = 0;

/** 切换页面时释放旧实例，并只在当前容器中载入文档。 */
async function init() {
  const next = document.getElementById('glfm-editor');
  if (next && next === container) return;
  const current = ++navigation;
  editor?.destroy();
  editor = undefined;
  container = next;
  if (!next) return;
  const status = document.getElementById('glfm-status');

  try {
    const { markdown, context } = await loadDocument(next.dataset.documentId);
    if (current !== navigation || !next.isConnected) return;
    editor = mountGlfmEditor(next, {
      markdown,
      context,
      services,
      /** 在宿主页面报告导入、预览、上传和保存错误。 */
      onError(error) { if (status) status.textContent = error.message; },
    });
  } catch (error) {
    if (current !== navigation) return;
    container = undefined;
    if (status) status.textContent = `文档载入失败：${error.message}`;
  }
}

// Material 的 document$ 在初次加载和即时导航后通知；普通页面直接初始化。
const subscription = typeof document$ !== 'undefined'
  ? document$.subscribe(() => void init())
  : undefined;
if (!subscription) void init();

/** 页面卸载时取消订阅，废弃未完成的读取并销毁编辑器。 */
window.addEventListener('pagehide', () => {
  navigation += 1;
  subscription?.unsubscribe();
  editor?.destroy();
});
```

导航可能移除旧容器，宿主需主动销毁其句柄以释放资源。`mountGlfmEditor` 在同一容器重复
调用会替换旧实例；`mountAllGlfmEditors` 会跳过已经挂载的容器，两者都不会自动跟踪页面导航。
离开页面前是否保存未提交内容，由宿主的导航与保存流程决定。

## 主题与页面增强脚本

挂载选项 `theme: 'material'` 为默认值，正文沿用本站 Material CSS；
挂载后通过 `editor.setTheme(theme)` 切换外观，保留当前内容与撤销历史。
选择 `theme: 'modern'` 可使用另一套写作外观。行号、选区格式框、大纲与快捷键两者共用。

公式与图表由编辑器管理。宿主的全页 KaTeX auto-render 应配置：

```js
ignoredClasses: ['glfm-editor', 'glfm-editor__preview-host']
```

其他会改写正文 DOM 的增强脚本也应跳过这些容器，保持 Vue 与 ProseMirror 对编辑区域的管理。
