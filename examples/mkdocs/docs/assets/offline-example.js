/** 本地渲染示例，首次加载与 Material 即时导航共用生命周期。 */
import { mountGlfmEditor } from '../glfm-mark/standalone.js';
import { demoMarkdown } from './demo-markdown.js';
let editor;
let container;
/** 只在页面容器变化时重新挂载。 */
function init() {
  const next = document.getElementById('glfm-editor');
  if (next === container) return;
  editor?.destroy();
  editor = undefined;
  container = next;
  if (!next) return;
  const status = document.getElementById('glfm-status');
  const appearance = document.getElementById('glfm-theme');
  const directory = new URL('./', location.href).href;
  editor = mountGlfmEditor(next, {
    markdown: demoMarkdown,
    theme: appearance?.value ?? 'material',
    context: { documentId: 'demo', linkBaseUrl: directory, assetBaseUrl: directory },
    onError(error) { if (status) status.textContent = error.message; },
  });
  if (appearance) appearance.onchange = () => editor?.setTheme(appearance.value);
}
const subscription = typeof document$ !== 'undefined' ? document$.subscribe(init) : undefined;
if (!subscription) init();
/** 页面退出时释放资源。 */
window.addEventListener('pagehide', () => { subscription?.unsubscribe(); editor?.destroy(); });
