/**
 * 源码保留往返测试（阶段一验收）。
 *
 * 覆盖：未编辑原样导出、局部编辑不影响其他块、重复内容不串用、
 * 中文 / emoji / 制表符 / CRLF、缺失 sourcepos 降级、首尾空白。
 */
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { createEnv, load, roundTrip } from './fixtures/env';

describe('未编辑文档', () => {
  it('单段落原样导出', async () => {
    const env = createEnv();
    expect(await roundTrip(env, 'Hello world.\n')).toBe('Hello world.\n');
  });

  it('多块文档原样导出', async () => {
    const markdown = [
      '# 标题',
      '',
      '第一段。',
      '',
      '- 项目一',
      '- 项目二',
      '',
      '> 引用内容',
      '',
      '```js',
      'const a = 1;',
      '```',
      '',
    ].join('\n');

    const env = createEnv();
    expect(await roundTrip(env, markdown)).toBe(markdown);
  });

  it('表格原样导出', async () => {
    const markdown = [
      '| 列一 | 列二 |',
      '| --- | --- |',
      '| a | b |',
      '',
    ].join('\n');

    const env = createEnv();
    expect(await roundTrip(env, markdown)).toBe(markdown);
  });

  it('空文档导出为空字符串', async () => {
    const env = createEnv();
    expect(await roundTrip(env, '')).toBe('');
  });

  it('只有空白的内容原样导出', async () => {
    const env = createEnv();
    expect(await roundTrip(env, '\n\n')).toBe('\n\n');
  });

  it('首尾空白原样保留', async () => {
    const markdown = '\n\n内容\n\n';
    const env = createEnv();
    expect(await roundTrip(env, markdown)).toBe(markdown);
  });

  it('中文、emoji 与制表符原样导出', async () => {
    const markdown = [
      '# 中文标题 😀',
      '',
      '段落包含 emoji 😀 与制表符\t制表符后文字。',
      '',
      '\t缩进内容',
      '',
    ].join('\n');

    const env = createEnv();
    expect(await roundTrip(env, markdown)).toBe(markdown);
  });

  it('CRLF 换行原样导出', async () => {
    const markdown = '# 标题\r\n\r\n第一段。\r\n\r\n第二段。\r\n';
    const env = createEnv();
    expect(await roundTrip(env, markdown)).toBe(markdown);
  });

  it('混合换行原样导出', async () => {
    const markdown = '# 标题\r\n\n第一段。\r\n第二段。\n';
    const env = createEnv();
    expect(await roundTrip(env, markdown)).toBe(markdown);
  });

  it('BOM 原样保留', async () => {
    const markdown = '\uFEFF# 标题\n';
    const env = createEnv();
    expect(await roundTrip(env, markdown)).toBe(markdown);
  });
});

describe('局部编辑', () => {
  /** 把文档顶层节点收集为数组。 */
  function topLevel(doc: import('@tiptap/pm/model').Node): import('@tiptap/pm/model').Node[] {
    const nodes: import('@tiptap/pm/model').Node[] = [];
    doc.forEach((node) => nodes.push(node));
    return nodes;
  }

  it('修改一个段落只重写该段落', async () => {
    const markdown = ['第一段。', '', '第二段。', '', '第三段。', ''].join('\n');

    const env = createEnv();
    const result = await load(env, markdown);
    const nodes = topLevel(result.doc);

    const newFirst = env.schema.nodes.paragraph.create(
      nodes[0].attrs,
      env.schema.text('新的第一段。'),
    );
    const newDoc = env.schema.topNodeType.create(null, [newFirst, ...nodes.slice(1)]);

    expect(env.controller.export(newDoc)).toBe(
      ['新的第一段。', '', '第二段。', '', '第三段。', ''].join('\n'),
    );
  });

  it('修改 CRLF 文档的段落时保留原有间隔和末尾换行', async () => {
    const markdown = '# 标题\r\n\r\n第一段。\r\n\r\n第二段。\r\n';
    const env = createEnv();
    const result = await load(env, markdown);
    const nodes = topLevel(result.doc);
    const changed = env.schema.nodes.paragraph.create(nodes[1].attrs, env.schema.text('修改后。'));
    const newDoc = env.schema.topNodeType.create(null, [nodes[0], changed, nodes[2]]);

    expect(env.controller.export(newDoc)).toBe('# 标题\r\n\r\n修改后。\r\n\r\n第二段。\r\n');

    const changedLast = env.schema.nodes.paragraph.create(nodes[2].attrs, env.schema.text('末段修改。'));
    const lastDoc = env.schema.topNodeType.create(null, [nodes[0], nodes[1], changedLast]);
    expect(env.controller.export(lastDoc)).toBe('# 标题\r\n\r\n第一段。\r\n\r\n末段修改。\r\n');
  });

  it('在 CRLF 文档中新增块时使用文档的换行格式', async () => {
    const env = createEnv();
    const result = await load(env, '# 标题\r\n\r\n原段落。\r\n');
    const nodes = topLevel(result.doc);
    const added = env.schema.nodes.paragraph.create(null, env.schema.text('新增段落。'));
    const newDoc = env.schema.topNodeType.create(null, [nodes[0], added, nodes[1]]);

    expect(env.controller.export(newDoc)).toBe('# 标题\r\n\r\n新增段落。\r\n\r\n原段落。\r\n');
  });

  it('修改中间段落，前后块保持原文', async () => {
    const markdown = [
      '```js',
      'const a = 1;',
      '```',
      '',
      '中间段落。',
      '',
      '| 列 |',
      '| --- |',
      '| 值 |',
      '',
    ].join('\n');

    const env = createEnv();
    const result = await load(env, markdown);
    const nodes = topLevel(result.doc);

    const newParagraph = env.schema.nodes.paragraph.create(
      nodes[1].attrs,
      env.schema.text('改过的中间段落。'),
    );
    const newDoc = env.schema.topNodeType.create(null, [nodes[0], newParagraph, nodes[2]]);

    const exported = env.controller.export(newDoc);
    expect(exported).toContain('```js\nconst a = 1;\n```');
    expect(exported).toContain('改过的中间段落。');
    expect(exported).toContain('| 列 |');
  });

  it('重复段落不串用源码', async () => {
    const markdown = ['重复内容。', '', '重复内容。', '', '重复内容。', ''].join('\n');

    const env = createEnv();
    const result = await load(env, markdown);
    const nodes = topLevel(result.doc);
    expect(nodes).toHaveLength(3);

    const newMiddle = env.schema.nodes.paragraph.create(
      nodes[1].attrs,
      env.schema.text('改过的内容。'),
    );
    const newDoc = env.schema.topNodeType.create(null, [nodes[0], newMiddle, nodes[2]]);

    expect(env.controller.export(newDoc)).toBe(
      ['重复内容。', '', '改过的内容。', '', '重复内容。', ''].join('\n'),
    );
  });

  it('重复表格不串用源码', async () => {
    const table = ['| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n');
    const markdown = `${table}\n\n${table}\n`;

    const env = createEnv();
    const result = await load(env, markdown);
    const nodes = topLevel(result.doc);
    expect(nodes).toHaveLength(2);

    // 修改第二个表格的最后一个单元格。
    const second = nodes[1];
    const rows = topLevel(second);
    const dataRow = rows[1];
    const cells = topLevel(dataRow);
    const newCell = env.schema.nodes.tableCell.create(cells[1].attrs, env.schema.text('9'));
    const newRow = dataRow.type.create(dataRow.attrs, [cells[0], newCell]);
    const newTable = second.type.create(second.attrs, [rows[0], newRow]);
    const newDoc = env.schema.topNodeType.create(null, [nodes[0], newTable]);

    const exported = env.controller.export(newDoc);
    const parts = exported.split('\n\n');
    expect(parts[0]).toBe(table);
    expect(parts[1]).toContain('9');
  });

  it('删除块后不输出该块', async () => {
    const markdown = ['第一段。', '', '第二段。', '', '第三段。', ''].join('\n');
    const env = createEnv();
    const result = await load(env, markdown);
    const nodes = topLevel(result.doc);

    const newDoc = env.schema.topNodeType.create(null, [nodes[0], nodes[2]]);
    expect(env.controller.export(newDoc)).toBe(['第一段。', '', '第三段。', ''].join('\n'));
  });
});

describe('降级与容错', () => {
  it('缺少 sourcepos 时整篇作为源码块载入且不丢内容', async () => {
    const env = createEnv();
    const markdown = '一段没有 sourcepos 的内容。\n';
    const result = await env.controller.load(markdown, async () => ({ html: '<p>无位置</p>' }));

    expect(result.degraded).toBe(true);
    expect(result.doc.childCount).toBe(1);
    expect(result.doc.child(0).type.name).toBe('sourceBlock');
    expect(env.controller.export(result.doc)).toBe(markdown);
  });

  it('sourcepos 越界时降级但不丢内容', async () => {
    const env = createEnv();
    const markdown = '短内容\n';
    const result = await env.controller.load(markdown, async () => ({
      html: '<p data-sourcepos="99:1-99:9">短内容</p>',
    }));

    expect(result.degraded).toBe(true);
    expect(env.controller.export(result.doc)).toBe(markdown);
  });

  it('渲染服务失败时抛出错误，不产生基线', async () => {
    const env = createEnv();
    await expect(
      env.controller.load('内容', async () => {
        throw new Error('网络错误');
      }),
    ).rejects.toThrow('网络错误');
    expect(env.controller.currentBaseline).toBeNull();
  });

  it('未识别的 HTML 保留为源码块', async () => {
    const env = createEnv();
    const markdown = '<div class="unknown">未知内容</div>\n';
    const result = await env.controller.load(markdown, async () => ({
      html: '<div data-sourcepos="1:1-1:33" class="unknown">未知内容</div>',
    }));

    expect(env.controller.export(result.doc)).toBe(markdown);
  });

  it('块之间的非空白区间成为源码保留块且顺序正确', async () => {
    const env = createEnv();
    // 引用式链接定义不会被渲染成块，位于两个段落之间。
    const markdown = [
      '第一段。',
      '',
      '[ref]: https://example.com',
      '',
      '第二段。',
      '',
    ].join('\n');

    const result = await env.controller.load(markdown, async () => ({
      // 中文每字 3 字节，sourcepos 列号按字节计算。
      html: [
        '<p data-sourcepos="1:1-1:12">第一段。</p>',
        '<p data-sourcepos="5:1-5:12">第二段。</p>',
      ].join('\n'),
    }));

    expect(result.degraded).toBe(false);
    expect(result.doc.childCount).toBe(3);
    expect(result.doc.child(1).type.name).toBe('sourceBlock');
    // 源码块保留包含周边空白的原始区间，导出时原样复用。
    expect(result.doc.child(1).textContent).toContain('[ref]: https://example.com');
    expect(env.controller.export(result.doc)).toBe(markdown);
  });
});

describe('块身份', () => {
  it('修改后重新导出仍复用其他块原文', async () => {
    const markdown = ['块一。', '', '块二。', '', '块三。', ''].join('\n');
    const env = createEnv();
    const result = await load(env, markdown);

    const ids: (string | null)[] = [];
    result.doc.forEach((node) => ids.push(node.attrs.sourceId));
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });

  it('TextSelection 相关状态不影响导出', async () => {
    const markdown = ['段落一。', '', '段落二。', ''].join('\n');
    const env = createEnv();
    const result = await load(env, markdown);

    const editorState = EditorState.create({
      doc: result.doc,
      selection: TextSelection.create(result.doc, 2),
    });

    expect(env.controller.export(editorState.doc)).toBe(markdown);
  });
});
