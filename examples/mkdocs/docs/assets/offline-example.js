/**
 * MkDocs 离线示例脚本：挂载编辑器并接入预生成 fixture。
 *
 * 这是示例代码，演示宿主如何提供 render 服务；真实站点应替换为 GitLab 适配器。
 */
import { mountGlfmEditor } from '../glfm-mark/standalone.js';

/** 初始化离线示例。 */
async function init() {
  const container = document.getElementById('glfm-editor');
  const status = document.getElementById('glfm-status');
  if (!container) return;

  let fixtures = {};
  try {
    const response = await fetch('../assets/fixtures.json');
    fixtures = await response.json();
  } catch {
    if (status) status.textContent = '无法加载 fixture，请先执行 npm run fixtures。';
    return;
  }

  const markdown = Object.keys(fixtures)[0];
  if (!markdown) {
    if (status) status.textContent = 'fixture 为空。';
    return;
  }

  if (status) status.textContent = '离线示例：只渲染内置文档。';

  mountGlfmEditor(container, {
    markdown,
    context: {
      documentId: 'demo',
      linkBaseUrl: location.href,
      assetBaseUrl: location.href,
    },
    services: {
      /** 离线示例只返回预生成的 HTML。 */
      async renderMarkdown({ markdown: value }) {
        const html = fixtures[value];
        if (!html) {
          throw new Error('离线示例只渲染内置文档，请连接 GitLab Markdown 适配器。');
        }
        return { html };
      },
    },
    onError(error) {
      if (status) status.textContent = `[${error.operation}] ${error.message}`;
    },
  });
}

void init();
