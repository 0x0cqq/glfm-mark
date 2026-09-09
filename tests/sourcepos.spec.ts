/**
 * sourcepos 映射测试：验证 UTF-8 字节列到 UTF-16 偏移的换算。
 */
import { describe, expect, it } from 'vitest';
import {
  buildLineIndex,
  byteColumnToIndex,
  parseSourcePos,
  sourcePosToRange,
} from '../src/source/sourcepos';

describe('parseSourcePos', () => {
  it('解析合法的 sourcepos', () => {
    expect(parseSourcePos('3:1-3:12')).toEqual({
      startLine: 3,
      startCol: 1,
      endLine: 3,
      endCol: 12,
    });
  });

  it('拒绝非法格式', () => {
    expect(parseSourcePos(null)).toBeNull();
    expect(parseSourcePos('')).toBeNull();
    expect(parseSourcePos('1:1')).toBeNull();
    expect(parseSourcePos('a:b-c:d')).toBeNull();
    expect(parseSourcePos('3:5-3:2')).toBeNull();
    expect(parseSourcePos('3:5-2:9')).toBeNull();
  });
});

describe('buildLineIndex', () => {
  it('按 LF 与 CRLF 切分并保留行起始偏移', () => {
    const markdown = '第一行\n第二行\r\n第三行';
    const index = buildLineIndex(markdown);

    expect(index.texts).toEqual(['第一行', '第二行', '第三行']);
    expect(index.starts).toEqual([0, 4, 9]);
  });

  it('保留结尾空行', () => {
    const index = buildLineIndex('a\n');
    expect(index.texts).toEqual(['a', '']);
    expect(index.starts).toEqual([0, 2]);
  });
});

describe('byteColumnToIndex', () => {
  it('把 ASCII 字节列换算为下标', () => {
    expect(byteColumnToIndex('hello', 1)).toBe(0);
    expect(byteColumnToIndex('hello', 5)).toBe(4);
  });

  it('正确处理中文：一个字符占 3 字节', () => {
    const line = '中文abc';
    expect(byteColumnToIndex(line, 1)).toBe(0);
    expect(byteColumnToIndex(line, 4)).toBe(1);
    expect(byteColumnToIndex(line, 7)).toBe(2);
    expect(byteColumnToIndex(line, 8)).toBe(3);
  });

  it('正确处理 emoji：代理对占 4 字节', () => {
    const line = '😀x';
    expect(byteColumnToIndex(line, 1)).toBe(0);
    expect(byteColumnToIndex(line, 5)).toBe(2);
  });

  it('列指向字符中间时返回 null', () => {
    expect(byteColumnToIndex('中文', 2)).toBeNull();
    expect(byteColumnToIndex('😀', 2)).toBeNull();
  });

  it('列越界时返回 null', () => {
    expect(byteColumnToIndex('ab', 3)).toBeNull();
    expect(byteColumnToIndex('ab', 0)).toBeNull();
  });
});

describe('sourcePosToRange', () => {
  it('转换单行区间为半开区间', () => {
    const markdown = 'hello world\n';
    const index = buildLineIndex(markdown);
    expect(sourcePosToRange(markdown, index, parseSourcePos('1:1-1:5')!)).toEqual({
      from: 0,
      to: 5,
    });
  });

  it('转换多行区间', () => {
    const markdown = 'line one\nline two\nline three\n';
    const index = buildLineIndex(markdown);
    // 第 3 行第 5 字节对应字符 'e'，闭区间包含它，因此 to 指向 'e' 之后。
    expect(sourcePosToRange(markdown, index, parseSourcePos('2:1-3:5')!)).toEqual({
      from: 9,
      to: 23,
    });
  });

  it('中文按字节列正确换算', () => {
    const markdown = '中文测试\n';
    const index = buildLineIndex(markdown);
    // “中文” 占 6 字节，第 1 至第 6 字节对应第 1 个字符。
    expect(sourcePosToRange(markdown, index, parseSourcePos('1:1-1:6')!)).toEqual({
      from: 0,
      to: 2,
    });
  });

  it('emoji 按字节列正确换算', () => {
    const markdown = '😀 ok\n';
    const index = buildLineIndex(markdown);
    expect(sourcePosToRange(markdown, index, parseSourcePos('1:1-1:4')!)).toEqual({
      from: 0,
      to: 2,
    });
  });

  it('制表符按 1 字节计算', () => {
    const markdown = '\t- item\n';
    const index = buildLineIndex(markdown);
    expect(sourcePosToRange(markdown, index, parseSourcePos('1:1-1:2')!)).toEqual({
      from: 0,
      to: 2,
    });
  });

  it('CRLF 行不影响偏移', () => {
    const markdown = 'first\r\nsecond\r\n';
    const index = buildLineIndex(markdown);
    expect(sourcePosToRange(markdown, index, parseSourcePos('2:1-2:6')!)).toEqual({
      from: 7,
      to: 13,
    });
  });

  it('行号越界时返回 null', () => {
    const markdown = 'only one line\n';
    const index = buildLineIndex(markdown);
    expect(sourcePosToRange(markdown, index, parseSourcePos('5:1-5:4')!)).toBeNull();
  });

  it('结束位置越界时返回 null', () => {
    const markdown = 'short\n';
    const index = buildLineIndex(markdown);
    expect(sourcePosToRange(markdown, index, parseSourcePos('1:1-1:99')!)).toBeNull();
  });
});
