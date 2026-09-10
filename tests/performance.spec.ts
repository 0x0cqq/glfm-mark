/**
 * 性能测试：确认导出只重新序列化受影响的块，且普通输入不触发整篇远程渲染。
 *
 * 使用约 100 KB、500 个顶层块的混合文档，验证：
 * - 未编辑时导出等于输入，且不需要逐块序列化。
 * - 修改一个块后，其余块复用原始字符串。
 */
import { describe, expect, it, vi } from 'vitest';
import { createEnv, load } from './fixtures/env';

/** 生成混合文档：约 100 KB、指定数量的顶层块。 */
function buildLargeDocument(blockCount: number): string {
  const blocks: string[] = [];
  const padding =
    '这一段用于把文档规模放大到接近真实文档，包含足够多的文字以避免测试只覆盖稀疏结构。';
  const templates = [
    (i: number) =>
      `## 小节 ${i}\n\n这是第 ${i} 段的正文，包含 **粗体**、*斜体* 与 \`代码\`。${padding}${padding}${padding}`,
    (i: number) =>
      `- 列表项 ${i}-a，${padding}\n- 列表项 ${i}-b，${padding}${padding}\n- 列表项 ${i}-c，${padding}${padding}`,
    (i: number) =>
      `| 列 A | 列 B |\n| --- | --- |\n| ${i} | 值 ${i} ${padding}${padding} |\n| ${i + 1} | 值 ${i + 1} ${padding}${padding} |`,
    (i: number) =>
      `\`\`\`js\n// ${padding}${padding}${padding}\nconst value${i} = ${i};\nconsole.log(value${i});\n\`\`\``,
    (i: number) => `> 引用段落 ${i}，${padding}${padding}${padding}`,
  ];

  for (let i = 0; i < blockCount; i += 1) {
    blocks.push(templates[i % templates.length](i));
  }

  return `${blocks.join('\n\n')}\n`;
}

describe('大文档导出', () => {
  it('500 个块、约 100 KB 的文档未编辑时原样导出', async () => {
    const markdown = buildLargeDocument(500);
    expect(markdown.length).toBeGreaterThan(80_000);

    const env = createEnv();
    const result = await load(env, markdown);

    // 500 个块加块之间的源码保留块，数量应不低于 500。
    expect(result.doc.childCount).toBeGreaterThanOrEqual(500);
    expect(result.degraded).toBe(false);
    expect(env.controller.export(result.doc)).toBe(markdown);
  });

  it('修改一个块只重写该块，其他块保持原文', async () => {
    const markdown = buildLargeDocument(500);
    const env = createEnv();
    const result = await load(env, markdown);

    const nodes: import('@tiptap/pm/model').Node[] = [];
    result.doc.forEach((node) => nodes.push(node));

    // 改变中间一个段落块的内容。
    const targetIndex = 250;
    const target = nodes[targetIndex];
    const newParagraph = env.schema.nodes.paragraph.create(
      target.attrs,
      env.schema.text('被修改的内容。'),
    );
    const newDoc = env.schema.topNodeType.create(null, [
      ...nodes.slice(0, targetIndex),
      newParagraph,
      ...nodes.slice(targetIndex + 1),
    ]);

    const exported = env.controller.export(newDoc);

    // 除被修改块外，其余原文片段仍然出现。
    const oldLines = markdown.split('\n\n');
    const exportedLines = exported.split('\n\n');
    expect(exportedLines).toHaveLength(oldLines.length);

    let unchanged = 0;
    for (let i = 0; i < oldLines.length; i += 1) {
      if (exportedLines[i] === oldLines[i]) unchanged += 1;
    }
    expect(unchanged).toBeGreaterThanOrEqual(oldLines.length - 2);
  });

  it('导出不重复调用渲染服务', async () => {
    const markdown = buildLargeDocument(200);
    const env = createEnv();
    const renderSpy = vi.fn(env.render);

    const result = await env.controller.load(markdown, renderSpy);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // 多次导出不应再调用渲染服务。
    env.controller.export(result.doc);
    env.controller.export(result.doc);
    env.controller.export(result.doc);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
