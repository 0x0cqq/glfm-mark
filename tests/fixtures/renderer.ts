/**
 * 测试与离线示例使用的渲染服务。
 *
 * 它用 markdown-it 生成近似 GitLab 的 HTML，并按 GitLab 的规则附加
 * `data-sourcepos`（1 起始、UTF-8 字节列、闭区间）。这是夹具，不是完整的
 * 本地 GLFM 引擎；真实使用时由宿主调用 GitLab Markdown API。
 */
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

/** 计算字符串的 UTF-8 字节长度。 */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** GLFM 提示块默认标题。 */
const ALERT_TITLES: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

/**
 * 判断 token 是否会渲染成一个顶层块元素。
 *
 * markdown-it 的 `inline` token 也带 map，但不单独产生元素，必须排除。
 */
function isTopLevelBlockToken(token: Token): boolean {
  if (token.hidden || !token.map) return false;
  if (token.nesting === 1) return true;
  // 自闭合块级 token：围栏代码、缩进代码、分隔线。
  return token.nesting === 0 && ['fence', 'code_block', 'hr'].includes(token.type);
}

/**
 * 为顶层块 token 计算 sourcepos 并写入 token 属性。
 *
 * 通过嵌套深度判断“顶层”：表格内部的 `thead`、`tr` 不参与。
 * 顶层块从第 1 列开始，结束列为该块最后一行的 UTF-8 字节长度。
 */
function applySourcePos(tokens: Token[], lines: string[]): void {
  let depth = 0;

  for (const token of tokens) {
    if (token.nesting === -1) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0 && isTopLevelBlockToken(token)) {
      const [startLine, endLine] = token.map as [number, number];
      if (endLine > startLine) {
        const lastLine = lines[endLine - 1] ?? '';
        token.attrSet('data-sourcepos', `${startLine + 1}:1-${endLine}:${utf8Length(lastLine)}`);
      }
    }

    if (token.nesting === 1) depth += 1;
  }
}

/** 把 `> [!NOTE]` 引用转换为 GitLab 的 admonition 结构。 */
function transformAlerts(html: string): string {
  let result = html;
  let previous: string;

  do {
    previous = result;
    result = result.replace(
      /<blockquote([^>]*)>\s*<p>\[!(note|tip|important|warning|caution)\](?:[ \t]+([^<]*))?<\/p>\s*([\s\S]*?)<\/blockquote>/gi,
      (_match, attrs: string, type: string, title: string | undefined, body: string) => {
        const lower = type.toLowerCase();
        const text = (title ?? '').trim() || ALERT_TITLES[lower];
        const position = /data-sourcepos="([^"]*)"/.exec(attrs)?.[1];
        const posAttr = position ? ` data-sourcepos="${position}"` : '';
        return `<div${posAttr} class="markdown-alert markdown-alert-${lower}"><p class="markdown-alert-title">${text}</p>${body}</div>`;
      },
    );
  } while (result !== previous);

  return result;
}

/** 给任务列表项加上 GitLab 的类名与 checkbox 结构。 */
function transformTaskLists(html: string): string {
  return html
    .replace(
      /<li>\[([ x~])\]\s?([\s\S]*?)<\/li>/g,
      (_match, mark: string, body: string) => {
        const checked = mark === 'x' ? ' checked=""' : '';
        const inapplicable = mark === '~' ? ' data-inapplicable' : '';
        const classes = `task-list-item enabled${mark === '~' ? ' inapplicable' : ''}`;
        return `<li class="${classes}"><input type="checkbox" class="task-list-item-checkbox"${checked}${inapplicable} /> ${body}</li>`;
      },
    )
    .replace(/<ul>(\s*<li class="task-list-item)/g, '<ul class="task-list">$1');
}

/** 给行内公式与块级公式加上 GitLab 的数学标记。 */
function transformMath(html: string): string {
  return html
    .replace(/\$`([^`]+)`\$/g, '<code data-math-style="inline">$1</code>')
    .replace(
      /<pre><code class="language-math">([\s\S]*?)<\/code><\/pre>/g,
      '<pre><code class="language-math" data-math-style="display">$1</code></pre>',
    )
    .replace(
      /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
      '<pre><code class="language-plaintext">$1</code></pre>',
    );
}

/** 创建夹具渲染器。 */
export function createFixtureRenderer(options: { html?: boolean } = {}) {
  const md = new MarkdownIt({ html: options.html ?? true, linkify: false });

  // 启用 GLFM 常见语法：表格、删除线。
  md.enable(['table', 'strikethrough']);

  // 围栏代码块：GitLab 把 sourcepos 放在 `<pre>` 上，markdown-it 默认放在 `<code>` 上。
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    const language = info.split(/\s+/)[0] ?? '';
    const position = token.attrGet('data-sourcepos');
    const posAttr = position ? ` data-sourcepos="${position}"` : '';
    const escapedLanguage = md.utils.escapeHtml(language);
    const langAttr = language
      ? ` class="language-${escapedLanguage}"`
      : ' class="language-plaintext"';
    return `<pre${posAttr}><code${langAttr}>${md.utils.escapeHtml(token.content)}</code></pre>\n`;
  };

  /** 渲染 Markdown 为带 sourcepos 的近似 GitLab HTML。 */
  const render = async (markdown: string): Promise<{ html: string }> => {
    const env: Record<string, unknown> = {};
    const tokens = md.parse(markdown, env);
    const lines = markdown.split('\n');

    applySourcePos(tokens, lines);

    let html = md.renderer.render(tokens, md.options, env);

    html = transformAlerts(html);
    html = transformTaskLists(html);
    html = transformMath(html);

    return { html };
  };

  return { render, md };
}

/** 默认夹具渲染器。 */
export const fixtureRenderer = createFixtureRenderer();
