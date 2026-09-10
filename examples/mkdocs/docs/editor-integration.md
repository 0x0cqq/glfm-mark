# 实际接入示例

本页说明宿主如何注入渲染、上传、保存和文档基准 URL。示例**不包含真实令牌或项目凭据**。

## 宿主需要提供的内容

| 服务 | 用途 | 是否必需 |
|---|---|---|
| `renderMarkdown` | 调用 GitLab Markdown API 渲染 GLFM | 必需 |
| `uploadFile` | 上传附件并返回插入用的 Markdown | 可选 |
| `saveMarkdown` | 保存当前 Markdown | 可选 |

`DocumentContext` 中的 `linkBaseUrl` 与 `assetBaseUrl` 必须是绝对目录 URL，
由宿主根据仓库文件或 Wiki 页面位置提供；组件不会猜测当前 GitLab 路由。

## 接入代码

```js
import {
  mountGlfmEditor,
  createGitLabMarkdownService,
} from './assets/standalone.js';

const markdown = createGitLabMarkdownService({
  baseUrl: 'https://gitlab.example.com',
  project: 'group/project',
  // 凭据由宿主管理，不写入构建产物、配置、日志或本地存储。
  getHeaders: async () => ({ Authorization: `Bearer ${await getSessionToken()}` }),
});

const editor = mountGlfmEditor(document.getElementById('glfm-editor'), {
  markdown: initialMarkdown,
  context: {
    documentId: 'wiki-page-1',
    linkBaseUrl: 'https://gitlab.example.com/group/project/-/wikis/',
    assetBaseUrl: 'https://gitlab.example.com/group/project/-/wikis/uploads/',
  },
  services: {
    renderMarkdown: markdown.renderMarkdown,
    // 上传：返回 GitLab Wiki 附件接口的 link.markdown
    async uploadFile({ file, signal }) {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(
        'https://gitlab.example.com/api/v4/projects/group%2Fproject/wikis/attachments',
        { method: 'POST', body, signal, headers: await getAuthHeaders() },
      );
      const payload = await response.json();
      return { markdown: payload.link.markdown };
    },
    // 保存：宿主自行决定提交目标
    async saveMarkdown({ markdown: snapshot, signal }) {
      await fetch('/api/wiki-page-1', {
        method: 'PUT',
        body: JSON.stringify({ content: snapshot }),
        signal,
      });
    },
  },
  onError(error) {
    console.error(`[${error.operation}] ${error.message}`);
  },
});

// 页面离开时销毁，释放监听器与未完成请求。
window.addEventListener('beforeunload', () => editor.destroy());
```

## 即时导航

Material 的 `document$` 会在即时导航后重新渲染页面。每次导航后检查新容器并挂载，
同一容器只会存在一个实例：

```js
import { mountAllGlfmEditors, unmountGlfmEditor } from './assets/standalone.js';

document$.subscribe(() => {
  mountAllGlfmEditors('#glfm-editor', (element) => ({
    markdown: element.dataset.markdown ?? '',
    context: { /* ... */ },
    services: { renderMarkdown },
  }));
});
```

组件内部用 `WeakMap` 记录已挂载的容器：同一容器重复挂载会先销毁旧实例。
