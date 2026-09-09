/**
 * 数学公式展示：按需加载 KaTeX 并渲染。
 *
 * 规则（设计文档 §5）：KaTeX 设置 `trust: false`；渲染失败时显示原公式与错误。
 */
let katexPromise: Promise<typeof import('katex')> | null = null;

/** 按需加载 KaTeX。 */
async function loadKatex() {
  katexPromise ??= import('katex');
  return katexPromise;
}

/** 渲染结果。 */
export interface MathRenderResult {
  html: string;
  error: string | null;
}

/**
 * 渲染行内公式。
 *
 * 失败时返回原公式文本与错误信息，不抛出异常。
 */
export async function renderInlineMath(source: string): Promise<MathRenderResult> {
  try {
    const katex = await loadKatex();
    const html = katex.default.renderToString(source, {
      displayMode: false,
      throwOnError: true,
      trust: false,
      output: 'html',
    });
    return { html, error: null };
  } catch (error) {
    return { html: escapeHtml(source), error: error instanceof Error ? error.message : String(error) };
  }
}

/** 渲染块级公式。 */
export async function renderBlockMath(source: string): Promise<MathRenderResult> {
  try {
    const katex = await loadKatex();
    const html = katex.default.renderToString(source, {
      displayMode: true,
      throwOnError: true,
      trust: false,
      output: 'html',
    });
    return { html, error: null };
  } catch (error) {
    return { html: escapeHtml(source), error: error instanceof Error ? error.message : String(error) };
  }
}

/** 转义 HTML 特殊字符。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
