/**
 * GitLab `data-sourcepos` 与原始字符串偏移之间的映射。
 *
 * GitLab 的 sourcepos 形如 `3:1-3:12`，行列均为 1 起始、闭区间，列号是
 * UTF-8 字节列。这里负责把它转换为原始 JavaScript 字符串的 UTF-16 偏移，
 * 同时保留 CRLF、emoji 和制表符的原始写法。
 */

/** 解析后的 sourcepos 行列。 */
export interface SourcePos {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

/** 行索引：记录每一行的起始偏移与内容。 */
export interface LineIndex {
  /** 每一行的起始 UTF-16 偏移，索引 0 对应第 1 行。 */
  starts: number[];
  /** 每一行的内容，不含行尾换行符。 */
  texts: string[];
}

/** 解析 `line:col-line:col` 形式的 sourcepos，格式不合法时返回 null。 */
export function parseSourcePos(value: string | null | undefined): SourcePos | null {
  if (!value) return null;
  const match = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(value.trim());
  if (!match) return null;

  const startLine = Number(match[1]);
  const startCol = Number(match[2]);
  const endLine = Number(match[3]);
  const endCol = Number(match[4]);

  if (![startLine, startCol, endLine, endCol].every((n) => Number.isInteger(n) && n >= 1)) {
    return null;
  }
  if (endLine < startLine || (endLine === startLine && endCol < startCol)) return null;

  return { startLine, startCol, endLine, endCol };
}

/** 建立行索引，行内容保留原始字符但去掉行尾换行符。 */
export function buildLineIndex(markdown: string): LineIndex {
  const starts: number[] = [];
  const texts: string[] = [];
  let cursor = 0;

  for (;;) {
    starts.push(cursor);
    const newline = markdown.indexOf('\n', cursor);
    if (newline === -1) {
      texts.push(markdown.slice(cursor));
      break;
    }

    const raw = markdown.slice(cursor, newline);
    texts.push(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
    cursor = newline + 1;
  }

  return { starts, texts };
}

/** 单个码点的 UTF-8 字节长度。 */
function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** 定位起始于指定 0 起始字节偏移的字符；偏移落在字符中间时返回 null。 */
function charStartingAt(line: string, byteOffset: number): { index: number; length: number } | null {
  if (byteOffset < 0) return null;

  let bytes = 0;
  let index = 0;

  while (index < line.length) {
    const codePoint = line.codePointAt(index) as number;
    const length = codePoint > 0xffff ? 2 : 1;

    if (bytes === byteOffset) return { index, length };
    if (bytes > byteOffset) return null;

    bytes += utf8Length(codePoint);
    index += length;
  }

  return null;
}

/** 定位包含指定 0 起始字节偏移的字符。 */
function charContaining(line: string, byteOffset: number): { index: number; length: number } | null {
  if (byteOffset < 0) return null;

  let bytes = 0;
  let index = 0;

  while (index < line.length) {
    const codePoint = line.codePointAt(index) as number;
    const length = codePoint > 0xffff ? 2 : 1;
    const size = utf8Length(codePoint);

    if (byteOffset < bytes + size) return { index, length };

    bytes += size;
    index += length;
  }

  return null;
}

/** 将 1 起始的 UTF-8 字节列转换为行内 UTF-16 下标，列无效时返回 null。 */
export function byteColumnToIndex(line: string, column: number): number | null {
  const located = charStartingAt(line, column - 1);
  return located ? located.index : null;
}

/**
 * 把 sourcepos 转换为原始字符串的 UTF-16 半开区间 `[from, to)`。
 *
 * 起始列必须落在字符起始字节上；结束列按闭区间处理，取其所在字符的末尾。
 * 行号或字节列越界、起始列指向字符中间时返回 null。
 */
export function sourcePosToRange(
  markdown: string,
  index: LineIndex,
  sourcePos: SourcePos,
): { from: number; to: number } | null {
  const { startLine, startCol, endLine, endCol } = sourcePos;

  if (startLine > index.texts.length || endLine > index.texts.length) return null;

  const startText = index.texts[startLine - 1];
  const endText = index.texts[endLine - 1];
  const startChar = charStartingAt(startText, startCol - 1);
  const endChar = charContaining(endText, endCol - 1);

  if (!startChar || !endChar) return null;

  const from = index.starts[startLine - 1] + startChar.index;
  const to = index.starts[endLine - 1] + endChar.index + endChar.length;

  if (from >= to || to > markdown.length) return null;

  return { from, to };
}
