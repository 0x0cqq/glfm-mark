/**
 * 预览渲染：把 GitLab 渲染的 HTML 转换为 Material 风格展示。
 *
 * 流程（设计文档 §5）：
 * 1. 净化服务端 HTML。
 * 2. 转换提示块为 Material admonition 结构。
 * 3. 处理数学、Mermaid 与代码高亮。
 * 4. 解析相对地址为绝对展示地址。
 *
 * 预览只用于展示，不回写 Markdown，也不反向替换当前编辑文档。
 */
import type { DocumentContext } from '../core/types';
import { highlightCode } from './highlight';
import { renderBlockMath, renderInlineMath } from './math';
import { renderMermaid } from './mermaid';
import { sanitizeGitLabHtml } from './sanitize';
import { ALERT_LABEL } from './theme';

/** 解析地址为绝对展示地址；失败时保留原值。 */
export function resolveAssetUrl(url: string, context: DocumentContext): string {
  if (!url) return url;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return url;

  try {
    return new URL(url, context.assetBaseUrl).toString();
  } catch {
    return url;
  }
}

/** 解析链接地址为绝对展示地址；锚点与绝对地址保持不变。 */
export function resolveLinkUrl(url: string, context: DocumentContext): string {
  if (!url) return url;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return url;

  try {
    return new URL(url, context.linkBaseUrl).toString();
  } catch {
    return url;
  }
}

/**
 * 把提示块转换为 Material admonition 结构。
 *
 * GLFM 仍保存为 `> [!NOTE]`，这里只改展示。
 */
function convertAlerts(root: ParentNode): void {
  root.querySelectorAll('div.markdown-alert').forEach((alert) => {
    const type =
      [...alert.classList]
        .find((name) => name.startsWith('markdown-alert-'))
        ?.replace('markdown-alert-', '') ?? 'note';

    const titleEl = alert.querySelector('.markdown-alert-title');
    const title = titleEl?.textContent?.trim() || ALERT_LABEL[type] || 'Note';
    titleEl?.remove();

    const admonition = document.createElement('div');
    admonition.className = `admonition ${type} glfm-editor__admonition`;

    const heading = document.createElement('p');
    heading.className = 'admonition-title';
    heading.textContent = title;
    admonition.append(heading);

    const body = document.createElement('div');
    body.className = 'glfm-editor__admonition-body';
    while (alert.firstChild) body.append(alert.firstChild);
    admonition.append(body);

    alert.replaceWith(admonition);
  });
}

/** 解析图片与链接的展示地址。 */
function resolveUrls(root: ParentNode, context: DocumentContext): void {
  root.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    const display = img.getAttribute('data-canonical-src') ?? src;
    img.setAttribute('src', resolveAssetUrl(display, context));
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
  });

  root.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    anchor.setAttribute('href', resolveLinkUrl(href, context));
    anchor.setAttribute('rel', 'noopener noreferrer nofollow');
  });

  root.querySelectorAll('video, audio').forEach((media) => {
    media.setAttribute('preload', 'none');
    media.setAttribute('controls', '');
  });
}

/** 给代码块加上 Material 风格的容器、语言标签与复制按钮。 */
function enhanceCodeBlocks(root: ParentNode): void {
  root.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;

    // 公式与图表已由各自的处理流程替换，这里跳过。
    if (code.hasAttribute('data-math-style') || code.classList.contains('language-math')) return;
    if (code.classList.contains('language-mermaid')) return;

    const language =
      [...code.classList]
        .find((name) => name.startsWith('language-'))
        ?.replace('language-', '') ?? '';

    const result = highlightCode(code.textContent ?? '', language || null);
    code.innerHTML = result.html;

    const wrapper = document.createElement('div');
    wrapper.className = 'glfm-editor__code highlight';

    const label = document.createElement('span');
    label.className = 'glfm-editor__code-language';
    label.textContent = language || 'text';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'glfm-editor__code-copy md-clipboard';
    copy.setAttribute('aria-label', '复制代码');
    copy.textContent = '复制';
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(code.textContent ?? '');
    });

    pre.replaceWith(wrapper);
    wrapper.append(label, copy, pre);
  });
}

/** 渲染数学公式。 */
async function enhanceMath(root: ParentNode): Promise<void> {
  const inlineNodes = [...root.querySelectorAll('code[data-math-style="inline"]')];
  const blockNodes = [...root.querySelectorAll('pre > code[data-math-style="display"]')];

  await Promise.all(
    inlineNodes.map(async (node) => {
      const result = await renderInlineMath(node.textContent ?? '');
      const span = document.createElement('span');
      span.className = 'glfm-editor__math glfm-editor__math--inline';
      span.innerHTML = result.html;
      if (result.error) {
        span.classList.add('glfm-editor__math--error');
        span.title = result.error;
      }
      node.replaceWith(span);
    }),
  );

  await Promise.all(
    blockNodes.map(async (node) => {
      const pre = node.parentElement;
      if (!pre) return;

      const result = await renderBlockMath(node.textContent ?? '');
      const wrapper = document.createElement('div');
      wrapper.className = 'glfm-editor__math glfm-editor__math--block';
      wrapper.innerHTML = result.html;
      if (result.error) {
        wrapper.classList.add('glfm-editor__math--error');
        wrapper.title = result.error;
      }
      pre.replaceWith(wrapper);
    }),
  );
}

/** 渲染 Mermaid 图表。 */
async function enhanceMermaid(root: ParentNode): Promise<void> {
  const nodes = [...root.querySelectorAll('pre > code.language-mermaid')];

  await Promise.all(
    nodes.map(async (node) => {
      const pre = node.parentElement;
      if (!pre) return;

      const result = await renderMermaid(node.textContent ?? '');
      if (!result.svg) {
        pre.setAttribute('data-mermaid-error', result.error ?? '渲染失败');
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'glfm-editor__mermaid';
      wrapper.innerHTML = result.svg;
      pre.replaceWith(wrapper);
    }),
  );
}

/** 给表格加上横向滚动容器。 */
function enhanceTables(root: ParentNode): void {
  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('glfm-editor__table-wrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'glfm-editor__table-wrapper';
    table.replaceWith(wrapper);
    wrapper.append(table);
  });
}

/**
 * 把 GitLab HTML 渲染为 Material 风格的预览 DOM。
 *
 * 返回值是一个独立容器，调用方负责插入页面。
 */
export async function renderPreviewHtml(
  html: string,
  context: DocumentContext,
): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'md-typeset glfm-editor__preview';
  container.innerHTML = sanitizeGitLabHtml(html);

  convertAlerts(container);
  resolveUrls(container, context);
  enhanceTables(container);
  enhanceCodeBlocks(container);
  await enhanceMath(container);
  await enhanceMermaid(container);

  return container;
}
