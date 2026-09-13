/**
 * HTML 净化：本地生成的 HTML、粘贴 HTML 与动态 SVG 都经过适合其内容类型的净化。
 *
 * 规则（设计文档 §7）：
 * - 移除脚本、事件属性、iframe、表单和内联样式。
 * - 导入阶段只保留需要的 `data-sourcepos`、canonical source 和 GLFM 语义属性。
 * - 阻止 `javascript:`、`vbscript:`、HTML data URL 等可执行地址。
 * - 用户源码中的危险 HTML 保留为文本，不执行。
 */
import DOMPurify from 'dompurify';

/** 导入阶段需要保留的属性。 */
const ALLOWED_ATTRS = [
  'class',
  'id',
  'href',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'colspan',
  'rowspan',
  'align',
  'start',
  'type',
  'checked',
  'disabled',
  'open',
  'controls',
  'preload',
  'dir',
  'lang',
  // GitLab 语义属性
  'data-sourcepos',
  'data-glfm-source-block',
  'data-details-content',
  'data-delimiter',
  'data-info',
  'data-multiline',
  'data-canonical-src',
  'data-canonical-lang',
  'data-math-style',
  'data-diagram',
  'data-diagram-src',
  'data-inapplicable',
  'data-reference-type',
  'data-original',
  'data-name',
  'data-unicode-version',
  'data-gollum',
];

/** 导入阶段允许的标签。 */
const ALLOWED_TAGS = [
  'a', 'abbr', 'audio', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div', 'dl',
  'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'kbd', 'li', 'ol',
  'p', 'pre', 's', 'samp', 'section', 'span', 'strong', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'video', 'gl-emoji', 'comment',
];

/** 允许的地址协议。 */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel|ftp|smb|irc):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/** 净化 GLFM HTML，保留导入所需语义。 */
export function sanitizeGitLabHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP,
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    KEEP_CONTENT: true,
  });
}

/** 净化粘贴的 HTML：只保留已支持的内容，其余退回文本。 */
export function sanitizePastedHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP,
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'object', 'embed'],
    KEEP_CONTENT: true,
  });
}

/** 净化动态生成的 SVG，供 Mermaid 展示使用。 */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}

/** 判断地址是否可用于展示，阻止可执行协议。 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(?:javascript|vbscript|data):/i.test(trimmed)) {
    return /^data:image\//i.test(trimmed);
  }
  return true;
}
