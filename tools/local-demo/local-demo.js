/** 浏览器演示宿主：文件选择与传输留在编辑器之外。 */
import { DocumentSession, mountGlfmEditor } from '/dist/standalone.js';

const input = document.getElementById('document-path');
const files = document.getElementById('markdown-files');
const status = document.getElementById('status');
const editor = document.getElementById('editor');
let active = null;
let requestNumber = 0;

/** 在页面中报告当前操作。 */
function report(message, error = false) {
  status.textContent = message;
  if (error) status.dataset.error = '';
  else delete status.dataset.error;
}

/** 将图片字节编码为本地服务请求。 */
async function encodedAsset(asset) {
  const bytes = new Uint8Array(await asset.content.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return { path: asset.path, type: asset.content.type, base64: btoa(binary) };
}

/** 读取接口结果，并把 HTTP 错误交还给编辑器展示。 */
async function result(response) {
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}

/** 本地服务传输层实现文档适配器接口。 */
const adapter = {
  async load(documentPath, signal) {
    return result(await fetch(`/api/document?path=${encodeURIComponent(documentPath)}`, { signal }));
  },
  async write({ bundle, expectedRevision, signal }) {
    const assets = await Promise.all(bundle.assets.map(encodedAsset));
    return result(await fetch('/api/document', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ documentPath: bundle.documentPath, markdown: bundle.markdown, assets, expectedRevision }),
    }));
  },
};

/** 切换文档前处理未保存内容，防止覆盖当前编辑。 */
function mayLeave() {
  return !active || active.handle.getMarkdown() === active.savedMarkdown || confirm('当前文件有未保存修改，确定切换吗？');
}

/** 打开仓库相对路径下的 Markdown，并建立独立的图片暂存会话。 */
async function openDocument(documentPath) {
  const path = documentPath.trim().replaceAll('\\', '/');
  if (!path) return report('请选择 Markdown 文件', true);
  if (!mayLeave()) {
    input.value = active.path;
    return;
  }
  const number = ++requestNumber;
  report(`正在载入 ${path}…`);
  try {
    const loaded = await adapter.load(path);
    if (number !== requestNumber) return;
    active?.handle.destroy();
    active?.session.dispose();

    const session = new DocumentSession(adapter, path, loaded.revision);
    const current = { path, session, handle: null, savedMarkdown: loaded.markdown };
    const saveMarkdown = session.services.saveMarkdown;
    const services = {
      ...session.services,
      async saveMarkdown(request) {
        await saveMarkdown(request);
        if (active === current) {
          current.savedMarkdown = request.markdown;
          report(`已保存到本地工作树：${path}`);
        }
      },
    };
    const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const baseUrl = `${location.origin}/repo/${directory.split('/').map(encodeURIComponent).join('/')}`;
    current.handle = mountGlfmEditor(editor, {
      markdown: loaded.markdown,
      context: { documentId: path, linkBaseUrl: baseUrl, assetBaseUrl: baseUrl },
      services,
      onChange(markdown) { if (active === current) report(markdown === current.savedMarkdown ? `已保存：${path}` : `未保存修改：${path}`); },
      onError(error) { if (active === current) report(`操作失败：${error.message}`, true); },
    });
    active = current;
    input.value = path;
    history.replaceState(null, '', `?path=${encodeURIComponent(path)}`);
    report(`已打开：${path}`);
  } catch (error) {
    if (number === requestNumber) report(`载入失败：${error.message}`, true);
  }
}

document.getElementById('file-picker').addEventListener('submit', (event) => {
  event.preventDefault();
  void openDocument(input.value);
});

window.addEventListener('beforeunload', (event) => {
  if (active && active.handle.getMarkdown() !== active.savedMarkdown) event.preventDefault();
});
window.addEventListener('pagehide', () => { active?.handle.destroy(); active?.session.dispose(); });

try {
  const list = await result(await fetch('/api/files'));
  files.replaceChildren(...list.map((path) => {
    const option = document.createElement('option');
    option.value = path;
    return option;
  }));
  const requested = new URLSearchParams(location.search).get('path');
  if (requested) await openDocument(requested);
  else if (list.length) await openDocument(list[0]);
  else report('仓库中没有 Markdown 文件', true);
} catch (error) {
  report(`读取文件列表失败：${error.message}`, true);
}
