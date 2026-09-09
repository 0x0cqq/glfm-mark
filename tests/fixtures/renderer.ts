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
  // 自闭合块级 token：围栏代码、缩进代码、分隔线、HTML 块。
  return token.nesting === 0 && ['fence', 'code_block', 'hr', 'html_block'].includes(token.type);
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
      // 结束行取块内最后一个非空行，避免把尾随空行算入区间。
      let lastLineIndex = endLine - 1;
      while (lastLineIndex > startLine && (lines[lastLineIndex] ?? '').trim() === '') {
        lastLineIndex -= 1;
      }

      const lastLine = lines[lastLineIndex] ?? '';
      if (lastLine.trim() !== '') {
        token.attrSet(
          'data-sourcepos',
          `${startLine + 1}:1-${lastLineIndex + 1}:${utf8Length(lastLine)}`,
        );
      }
    }

    if (token.nesting === 1) depth += 1;
  }
}

/** 把 `> [!NOTE]` 引用转换为 GitLab 的 admonition 结构。 */
function transformAlerts(html: string): string {
  if (typeof document === 'undefined') return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('blockquote').forEach((quote) => {
    const first = quote.firstElementChild;
    if (!first || first.tagName !== 'P') return;

    const match = /^\[!(note|tip|important|warning|caution)\](?:[ \t]+([^\n]*))?\n?([\s\S]*)$/i.exec(
      first.textContent ?? '',
    );
    if (!match) return;

    const [, rawType, rawTitle, rest] = match;
    const type = rawType.toLowerCase();
    const title = (rawTitle ?? '').trim() || ALERT_TITLES[type];

    const alert = document.createElement('div');
    alert.className = `markdown-alert markdown-alert-${type}`;
    const position = quote.getAttribute('data-sourcepos');
    if (position) alert.setAttribute('data-sourcepos', position);

    const titleEl = document.createElement('p');
    titleEl.className = 'markdown-alert-title';
    titleEl.textContent = title;
    alert.append(titleEl);

    // 第一段剩余内容作为提示块正文。
    const bodyText = (rest ?? '').trim();
    if (bodyText) {
      const paragraph = document.createElement('p');
      paragraph.textContent = bodyText;
      alert.append(paragraph);
    }

    // 后续段落直接搬移。
    let sibling = first.nextElementSibling;
    while (sibling) {
      const next = sibling.nextElementSibling;
      alert.append(sibling);
      sibling = next;
    }

    quote.replaceWith(alert);
  });

  return container.innerHTML;
}

/** 给任务列表项加上 GitLab 的类名与 checkbox 结构。 */
function transformTaskLists(html: string): string {
  if (typeof document === 'undefined') return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('li').forEach((item) => {
    const match = /^\[([ x~])\]\s?([\s\S]*)$/.exec(item.textContent ?? '');
    if (!match || item.querySelector('input[type="checkbox"]')) return;

    const [, mark, body] = match;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-list-item-checkbox';
    if (mark === 'x') checkbox.setAttribute('checked', '');
    if (mark === '~') checkbox.setAttribute('data-inapplicable', '');

    item.classList.add('task-list-item', 'enabled');
    if (mark === '~') item.classList.add('inapplicable');
    item.replaceChildren(checkbox, document.createTextNode(` ${body}`));

    const list = item.parentElement;
    if (list?.tagName === 'UL') list.classList.add('task-list');
  });

  return container.innerHTML;
}

/** 给行内公式与块级公式加上 GitLab 的数学标记。 */
function transformMath(html: string, markdown: string): string {
  let result = html;

  // 行内公式 `$`...`$`：markdown-it 会先把它当作行内代码，GitLab 则识别为公式。
  if (/\$`/.test(markdown)) {
    result = result
      .replace(/<code>\$`([^`]+)`\$<\/code>/g, '<code data-math-style="inline">$1</code>')
      .replace(/\$<code>([^<]+)<\/code>\$/g, '<code data-math-style="inline">$1</code>');
  }

  if (typeof document === 'undefined') {
    return result.replace(
      /(<pre[^>]*>\s*<code) class="language-math">/g,
      '$1 class="language-math" data-math-style="display">',
    );
  }

  const container = document.createElement('div');
  container.innerHTML = result;

  container.querySelectorAll('pre > code.language-math').forEach((code) => {
    code.setAttribute('data-math-style', 'display');
  });

  return container.innerHTML;
}

/**
 * 把 `<details>...</details>` 合并为单个 HTML 块。
 *
 * markdown-it 会在空行处结束 HTML 块，而 GitLab 把整个 details 视为一个块。
 */
function mergeDetailsTokens(tokens: Token[], lines: string[]): Token[] {
  const result: Token[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.type === 'html_block' && /^\s*<details/i.test(token.content)) {
      // 找到对应的结束标签所在行。
      let endLine = (token.map?.[1] ?? 0) - 1;
      let j = i;
      while (j < tokens.length) {
        const candidate = tokens[j];
        if (candidate.type === 'html_block' && /<\/details>/i.test(candidate.content)) {
          endLine = candidate.map?.[1] ?? endLine;
          break;
        }
        j += 1;
      }

      const startLine = token.map?.[0] ?? 0;
      const merged = new (token.constructor as new (
        type: string,
        tag: string,
        nesting: number,
      ) => Token)('html_block', '', 0);
      merged.map = [startLine, endLine];
      merged.content = lines.slice(startLine, endLine).join('\n');
      merged.block = true;
      result.push(merged);
      i = j;
      continue;
    }

    result.push(token);
  }

  return result;
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

  // HTML 块：GitLab 会把 sourcepos 加到块首标签上。
  md.renderer.rules.html_block = (tokens, idx) => {
    const token = tokens[idx];
    const position = token.attrGet('data-sourcepos');
    if (!position) return token.content;

    return token.content.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 data-sourcepos="${position}"`);
  };

  /** 渲染 Markdown 为带 sourcepos 的近似 GitLab HTML。 */
  const render = async (markdown: string): Promise<{ html: string }> => {
    const env: Record<string, unknown> = {};
    // sourcepos 的行列基于规范化后的文本，行尾 CR 不计入列号。
    const lines = markdown.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
    const tokens = mergeDetailsTokens(md.parse(markdown, env), lines);

    applySourcePos(tokens, lines);

    let html = md.renderer.render(tokens, md.options, env);

    html = transformAlerts(html);
    html = transformTaskLists(html);
    html = transformMath(html, markdown);

    return { html };
  };

  return { render, md };
}

/** 默认夹具渲染器。 */
export const fixtureRenderer = createFixtureRenderer();
