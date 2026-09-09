/**
 * 代码高亮展示：使用 lowlight / highlight.js。
 *
 * 规则（设计文档 §5）：未知语言按纯文本显示；高亮结果不进入 Markdown。
 */
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

/** 高亮结果。 */
export interface HighlightResult {
  html: string;
  /** 语言是否被识别；未识别时按纯文本展示。 */
  recognized: boolean;
}

/** 转义 HTML 特殊字符。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 高亮代码块内容。
 *
 * 未知语言或高亮失败时返回转义后的纯文本，不抛出异常。
 */
export function highlightCode(code: string, language?: string | null): HighlightResult {
  if (!language) return { html: escapeHtml(code), recognized: false };

  try {
    if (!lowlight.registered(language)) {
      return { html: escapeHtml(code), recognized: false };
    }

    const tree = lowlight.highlight(language, code);
    return { html: toHtml(tree as never), recognized: true };
  } catch {
    return { html: escapeHtml(code), recognized: false };
  }
}

/** 把 hast 节点树转换为 HTML 字符串。 */
function toHtml(node: { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: unknown[] }): string {
  if (node.type === 'text') return escapeHtml(node.value ?? '');

  const children = ((node.children ?? []) as typeof node[]).map(toHtml).join('');
  if (!node.tagName) return children;

  const className = node.properties?.className;
  const classes = Array.isArray(className) ? className.join(' ') : '';
  const classAttr = classes ? ` class="${escapeHtml(classes)}"` : '';

  return `<${node.tagName}${classAttr}>${children}</${node.tagName}>`;
}
