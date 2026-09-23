/** 浏览器本地 GLFM 解析：从 token 行区间生成带源码位置的安全 HTML。 */
import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';
import imageRule from 'markdown-it/lib/rules_inline/image.mjs';
import { full as emoji } from 'markdown-it-emoji';
import { DEFAULT_ALERT_TITLES } from './constants';

const md = new MarkdownIt({ html: true, linkify: true });
md.use(emoji, { shortcuts: {} });
const escape = md.utils.escapeHtml;

/** 将未知内容作为可编辑源码展示，绝不执行原始 HTML。 */
function sourceHtml(source: string, position = ''): string {
  return `<pre data-glfm-source-block=""${position}><code>${escape(source)}</code></pre>\n`;
}

/** 读取块解析器当前逻辑行（保留容器缩进规则）。 */
function lineAt(state: import('markdown-it/lib/rules_block/state_block.mjs').default, line: number): string {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

/** 注册有明确结束标记的 GLFM 块，未闭合结构保留为源码。 */
md.block.ruler.before('fence', 'glfm_blocks', (state, start, end, silent) => {
  const first = lineAt(state, start);
  const details = /^<details(?:\s+open)?\s*>\s*$/i.test(first);
  const quote = first.trim() === '>>>';
  const math = first.trim() === '$$';
  const front = start === 0 && /^(?:\uFEFF)?---\s*$/.test(first);
  const footnote = /^\[\^[^\]]+\]:/.test(first);
  const toc = /^\[(?:\[_TOC_\]|TOC)\]\s*$/i.test(first);
  if (!details && !quote && !math && !front && !footnote && !toc) return false;
  if (silent) return true;
  let finish = start + 1;
  let closed = footnote || toc;
  if (footnote) {
    while (finish < end && (/^\s/.test(state.src.slice(state.bMarks[finish], state.eMarks[finish])) || !lineAt(state, finish).trim())) finish++;
  } else if (!toc) {
    let depth = 1;
    for (; finish < end; finish++) {
      const line = lineAt(state, finish).trim();
      if (details && /^<details(?:\s+open)?\s*>$/i.test(line)) depth++;
      const closing = details ? (/^<\/details>$/i.test(line) && --depth === 0)
        : line === (quote ? '>>>' : math ? '$$' : '---');
      if (closing) { closed = true; finish++; break; }
    }
  }
  if (front && !closed) return false;
  const token = state.push('glfm_block', '', 0);
  token.block = true;
  token.map = [start, finish];
  token.content = state.getLines(start, finish, state.blkIndent, false).replace(/\n$/, '');
  token.meta = { kind: closed ? details ? 'details' : quote ? 'quote' : math ? 'math' : 'source' : 'source' };
  state.line = finish;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

/** 识别 MkDocs 容器，提示块交给结构化节点，其余容器保留源码。 */
md.block.ruler.before('fence', 'mkdocs_blocks', (state, start, end, silent) => {
  const first = lineAt(state, start);
  const admonition = /^!{3}[ \t]*([\w-]+)(?:[ \t]+(.*))?$/.exec(first);
  const collapsible = /^\?{3}\+?[ \t]*[\w-]+(?:[ \t]+.*)?$/.test(first);
  const tab = /^===[ \t]+(?:"[^"]+"|'[^']+')\s*$/.test(first);
  if (!admonition && !collapsible && !tab) return false;
  if (silent) return true;

  let finish = start + 1;
  while (finish < end) {
    const raw = state.src.slice(state.bMarks[finish], state.eMarks[finish]);
    if (raw.trim() && state.sCount[finish] < state.blkIndent + 4) break;
    finish++;
  }

  const token = state.push('glfm_block', '', 0);
  token.block = true;
  token.map = [start, finish];
  token.content = state.getLines(start, finish, state.blkIndent, false).replace(/\n$/, '');
  token.meta = { kind: admonition ? 'mkdocsAdmonition' : 'source' };
  state.line = finish;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

/** 识别行内数学、脚注及本地引用；反斜杠与代码先由 Markdown 规则处理。 */
md.inline.ruler.before('escape', 'glfm_inline', (state, silent) => {
  const rest = state.src.slice(state.pos, state.posMax);
  const delimiter = rest.startsWith('$`') ? '$`' : '$';
  if (rest.startsWith('$') && !rest.startsWith('$$') && !/\s/.test(rest[delimiter.length] ?? ' ')) {
    const closer = delimiter === '$`' ? '`$' : '$';
    let end = state.src.indexOf(closer, state.pos + delimiter.length);
    while (end > 0 && state.src[end - 1] === '\\') end = state.src.indexOf(closer, end + closer.length);
    if (end > state.pos + delimiter.length && end + closer.length <= state.posMax && !/\s/.test(state.src[end - 1]) && !/\d/.test(state.src[end + closer.length] ?? '') && !state.src.slice(state.pos, end).includes('\n')) {
      if (!silent) {
        const token = state.push('glfm_math', 'code', 0);
        token.content = state.src.slice(state.pos + delimiter.length, end);
        token.markup = delimiter;
      }
      state.pos = end + closer.length;
      return true;
    }
  }
  const footnote = /^\[\^([^\]\n]+)\]/.exec(rest);
  const boundary = state.pos === 0 || /[\s(（]/.test(state.src[state.pos - 1]);
  const inLink = state.tokens.reduce((depth, token) => depth + (token.type === 'link_open' ? 1 : token.type === 'link_close' ? -1 : 0), 0) > 0;
  const reference = boundary && !inLink ? /^(@[\w.-]+(?:\/[\w.-]+)*|#\d+|!\d+|&\d+|%\d+)\b/.exec(rest) : null;
  const matched = footnote ?? reference;
  if (!matched) return false;
  if (!silent) {
    const token = state.push(footnote ? 'glfm_footnote' : 'glfm_reference', '', 0);
    token.content = footnote ? matched[1] : matched[0];
  }
  state.pos += matched[0].length;
  return true;
});

/** 输出数学语义并携带原始定界符。 */
md.renderer.rules.glfm_math = (tokens, index) => `<code data-math-style="inline" data-delimiter="${escape(tokens[index].markup)}">${escape(tokens[index].content)}</code>`;
/** 输出无需请求项目数据的引用标记。 */
md.renderer.rules.glfm_reference = (tokens, index) => `<a class="gfm" data-original="${escape(tokens[index].content)}">${escape(tokens[index].content)}</a>`;
/** 输出脚注原始标识。 */
md.renderer.rules.glfm_footnote = (tokens, index) => `<sup class="footnote-ref"><a id="fnref-${escape(tokens[index].content)}-1">[${escape(tokens[index].content)}]</a></sup>`;
/** Emoji 使用本地 Unicode 字典，源码保留短代码。 */
md.renderer.rules.emoji = (tokens, index) => `<gl-emoji data-name="${escape(tokens[index].markup)}">${escape(tokens[index].content)}</gl-emoji>`;

/** 图片规则保留尺寸属性，并识别 Markdown 媒体链接。 */
md.inline.ruler.at('image', (state, silent) => {
  const start = state.pos;
  if (!imageRule(state, silent)) return false;
  if (silent) return true;
  const token = state.tokens.at(-1)!;
  const sizes = /^\{((?:(?:width|height)=(?:"[\d.%]+"|[\d.%]+)\s*)+)\}/.exec(state.src.slice(state.pos));
  if (sizes) {
    for (const attr of sizes[1].matchAll(/(width|height)="?([\d.%]+)"?/g)) token.attrSet(attr[1], attr[2]);
    state.pos += sizes[0].length;
  }
  const src = token.attrGet('src') ?? '';
  if (/\.(?:mp4|webm|ogv|mp3|wav|ogg|flac)(?:[?#]|$)/i.test(src)) {
    token.type = 'glfm_media';
    token.meta = { source: state.src.slice(start, state.pos) };
  }
  return true;
});
/** 媒体地址由 Markdown 链接规则校验，原始写法单独保存。 */
md.renderer.rules.glfm_media = (tokens, index) => {
  const token = tokens[index];
  const src = token.attrGet('src') ?? '';
  const tag = /\.(?:mp4|webm|ogv)(?:[?#]|$)/i.test(src) ? 'video' : 'audio';
  return `<${tag} controls preload="none" src="${escape(src)}" data-original="${escape(token.meta.source)}" alt="${escape(token.content)}"></${tag}>`;
};

/** 渲染闭合的专用块，正文递归使用同一个解析器。 */
md.renderer.rules.glfm_block = (tokens, index) => {
  const token = tokens[index];
  const position = positionAttr(token);
  const lines = token.content.split('\n');
  const body = lines.slice(1, -1).join('\n');
  switch (token.meta.kind) {
    case 'mkdocsAdmonition': {
      const marker = /^!{3}[ \t]*([\w-]+)(?:[ \t]+(.*))?$/.exec(lines[0]);
      if (!marker) return sourceHtml(token.content, position);
      const type = marker[1];
      const rest = marker[2]?.trim() ?? '';
      const titleMatch = /^(.*?)\s*"([\s\S]*)"$/.exec(rest);
      const modifiers = titleMatch ? titleMatch[1].trim() : rest;
      const title = titleMatch ? titleMatch[2] : type.charAt(0).toUpperCase() + type.slice(1);
      const body = lines.slice(1).map((line) => line.replace(/^(?: {4}|\t)/, '')).join('\n').replace(/\n+$/, '');
      return `<div class="admonition ${escape(type)} ${escape(modifiers)}" data-mkdocs-admonition="" data-mkdocs-type="${escape(type)}" data-mkdocs-modifiers="${escape(modifiers)}" data-mkdocs-title-explicit="${titleMatch ? 'true' : 'false'}"${position}><p class="admonition-title" data-mkdocs-title="">${md.renderInline(title)}</p>${body ? renderHtml(body) : '<p></p>'}</div>\n`;
    }
    case 'quote': return `<blockquote data-multiline="true"${position}>${renderHtml(body)}</blockquote>\n`;
    case 'math': return `<pre data-delimiter="$$"${position}><code data-math-style="display">${escape(body)}</code></pre>\n`;
    case 'details': {
      const summary = /^\s*<summary>([\s\S]*?)<\/summary>\s*/i.exec(body);
      if (!summary || /<\/?\w/.test(summary[1])) return sourceHtml(token.content, position);
      return `<details${/\sopen\b/i.test(lines[0]) ? ' open' : ''}${position}><summary>${md.renderInline(summary[1])}</summary><div data-details-content="">${renderHtml(body.slice(summary[0].length))}</div></details>\n`;
    }
    default: return sourceHtml(token.content, position);
  }
};

/** 源码位置属于 pre，围栏正文只做 HTML 转义。 */
md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0] ?? '';
  return `<pre${positionAttr(token)} data-delimiter="${escape(token.markup)}" data-info="${escape(token.info)}"><code class="language-${escape(language)}"${language === 'math' ? ' data-math-style="display"' : ''}>${escape(token.content)}</code></pre>\n`;
};
/** 任意原始 HTML 块显示为源码。 */
md.renderer.rules.html_block = (tokens, index) => sourceHtml(tokens[index].content.replace(/\n$/, ''), positionAttr(tokens[index]));
/** 表格对齐使用可净化的语义属性，不依赖 style。 */
for (const type of ['th_open', 'td_open']) {
  md.renderer.rules[type] = (tokens, index, options, _env, renderer) => {
    const token = tokens[index];
    const align = /text-align:(left|center|right)/.exec(token.attrGet('style') ?? '');
    if (align) token.attrSet('align', align[1]);
    return renderer.renderToken(tokens, index, options);
  };
}

/** 生成已经由解析器计算的源码位置属性。 */
function positionAttr(token: Token): string {
  const position = token.attrGet('data-sourcepos');
  return position ? ` data-sourcepos="${position}"` : '';
}

/** 转换提示块和任务列表 token，保留原有行内标记与嵌套结构。 */
function transformContainers(tokens: Token[]): void {
  const lists: { token: Token; items: Token[]; tasks: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') lists.push({ token, items: [], tasks: 0 });
    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      const list = lists.pop();
      // 混合列表维持普通列表语义；checkbox 仍保留在对应项目里。
      if (list && list.tasks === list.items.length && list.tasks > 0 && list.token.tag === 'ul') list.token.attrSet('class', 'task-list');
    }
    if (token.type === 'list_item_open') {
      const list = lists.at(-1);
      list?.items.push(token);
      const inline = tokens[i + 2];
      const first = inline?.children?.[0];
      const mark = first?.type === 'text' ? /^\[([ xX~])\]\s+/.exec(first.content) : null;
      if (mark && first && list) {
        list.tasks++;
        token.attrSet('class', 'task-list-item');
        first.content = first.content.slice(mark[0].length);
        const checkbox = new Token('html_inline', '', 0);
        checkbox.content = `<input type="checkbox" disabled${/[xX]/.test(mark[1]) ? ' checked' : ''}${mark[1] === '~' ? ' data-inapplicable=""' : ''}> `;
        checkbox.meta = { generated: true };
        inline.children!.unshift(checkbox);
      }
    }
    if (token.type === 'blockquote_open') {
      const paragraph = tokens[i + 1];
      const inline = tokens[i + 2];
      const match = inline?.type === 'inline' ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+([^\n]*))?(?:\n|$)/i.exec(inline.content) : null;
      if (!match || paragraph.type !== 'paragraph_open') continue;
      const type = match[1].toLowerCase() as keyof typeof DEFAULT_ALERT_TITLES;
      token.tag = 'div';
      token.attrSet('class', `markdown-alert markdown-alert-${type}`);
      let depth = 1;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_open') depth++;
        if (tokens[j].type === 'blockquote_close' && --depth === 0) { tokens[j].tag = 'div'; break; }
      }
      const title = new Token('html_block', '', 0);
      title.type = 'glfm_title';
      title.content = match[2]?.trim() || DEFAULT_ALERT_TITLES[type];
      inline.content = inline.content.slice(match[0].length);
      inline.children = md.parseInline(inline.content, {})[0].children;
      tokens.splice(i + 1, 0, title);
    }
  }
}

/** 提示标题由文本生成。 */
md.renderer.rules.glfm_title = (tokens, index) => `<p class="markdown-alert-title">${escape(tokens[index].content)}</p>`;

/** 将 token 行区间映射到原文；未知行内 HTML 与引用式链接整块保留。 */
function renderHtml(markdown: string): string {
  const env: { references?: Record<string, unknown> } = {};
  const tokens = md.parse(markdown, env);
  const lines = markdown.split('\n').map((line) => line.replace(/\r$/, ''));
  const encoder = new TextEncoder();
  const output: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.map || token.hidden || token.nesting === -1) { output.push(token); continue; }
    let end = i;
    if (token.nesting === 1) {
      let depth = 1;
      while (++end < tokens.length) { depth += tokens[end].nesting; if (!depth) break; }
    }
    const group = tokens.slice(i, end + 1);
    const [start, limit] = token.map;
    let last = limit - 1;
    while (last > start && !lines[last]?.trim()) last--;
    token.attrSet('data-sourcepos', `${start + 1}:1-${last + 1}:${encoder.encode(lines[last] ?? '').length}`);
    const raw = lines.slice(start, last + 1).join('\n');
    const unsupported = group.some((part) => part.children?.some((child) => child.type === 'html_inline' && !/^<br\s*\/?>$/i.test(child.content)))
      || Boolean(env.references && group.some((part) => part.type === 'inline' && /\[[^\]]+\](?!\()/.test(part.content)));
    if (unsupported) {
      token.type = 'glfm_block'; token.tag = ''; token.nesting = 0;
      token.meta = { kind: 'source' }; token.content = raw;
      output.push(token);
    } else output.push(...group);
    i = end;
  }
  transformContainers(output);
  return md.renderer.render(output, md.options, env);
}

/** 本地渲染任意 Markdown；不访问网络，不依赖文档或项目服务。 */
export async function renderMarkdown(markdown: string, signal?: AbortSignal): Promise<{ html: string }> {
  signal?.throwIfAborted();
  const html = renderHtml(markdown);
  signal?.throwIfAborted();
  return { html };
}
