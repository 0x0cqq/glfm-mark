/**
 * GLFM 序列化测试：验证修改 / 新建块输出的规范化 Markdown。
 *
 * 这些用例针对 serializer 的输出契约，而不是内部实现细节。
 */
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { glfmExtensions } from '../src/glfm/schema';
import { createGlfmSerializer } from '../src/glfm/serialize';

const schema = getSchema(glfmExtensions());
const serializer = createGlfmSerializer();

/** 序列化单个顶层节点。 */
function serialize(node: ProseMirrorNode): string {
  return serializer.serialize(node);
}

/** 构造文本节点。 */
const text = (value: string, marks?: Parameters<typeof schema.text>[1]) => schema.text(value, marks);

describe('基础块', () => {
  it('段落', () => {
    const node = schema.nodes.paragraph.create(null, text('Hello world.'));
    expect(serialize(node)).toBe('Hello world.');
  });

  it('一到六级标题', () => {
    for (let level = 1; level <= 6; level += 1) {
      const node = schema.nodes.heading.create({ level }, text('标题'));
      expect(serialize(node)).toBe(`${'#'.repeat(level)} 标题`);
    }
  });

  it('普通引用', () => {
    const node = schema.nodes.blockquote.create(
      null,
      schema.nodes.paragraph.create(null, text('引用内容')),
    );
    expect(serialize(node)).toBe('> 引用内容');
  });

  it('多行引用使用 >>> 围栏', () => {
    const node = schema.nodes.blockquote.create(
      { multiline: true },
      schema.nodes.paragraph.create(null, text('多行引用')),
    );
    expect(serialize(node)).toBe('>>>\n多行引用\n>>>');
  });

  it('分隔线', () => {
    expect(serialize(schema.nodes.horizontalRule.create())).toBe('---');
  });

  it('围栏代码块保留语言', () => {
    const node = schema.nodes.codeBlock.create({ language: 'js' }, text('const a = 1;'));
    expect(serialize(node)).toBe('```js\nconst a = 1;\n```');
  });

  it('代码块内容含反引号时加长围栏', () => {
    const node = schema.nodes.codeBlock.create(
      { language: 'markdown' },
      text('```\ncode\n```'),
    );
    expect(serialize(node)).toBe('````markdown\n```\ncode\n```\n````');
  });

  it('代码块保留语言参数', () => {
    const node = schema.nodes.codeBlock.create(
      { language: 'json', langParams: 'table' },
      text('{}'),
    );
    expect(serialize(node)).toBe('```json:table\n{}\n```');
  });

  it('硬换行输出反斜杠', () => {
    const node = schema.nodes.paragraph.create(null, [
      text('第一行'),
      schema.nodes.hardBreak.create(),
      text('第二行'),
    ]);
    expect(serialize(node)).toBe('第一行\\\n第二行');
  });
});

describe('列表', () => {
  it('无序列表使用 -', () => {
    const node = schema.nodes.bulletList.create(null, [
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, text('一'))),
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, text('二'))),
    ]);
    expect(serialize(node)).toBe('- 一\n- 二');
  });

  it('有序列表保留起始序号', () => {
    const node = schema.nodes.orderedList.create({ start: 3 }, [
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, text('三'))),
      schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, text('四'))),
    ]);
    expect(serialize(node)).toBe('3. 三\n4. 四');
  });

  it('嵌套列表缩进', () => {
    const node = schema.nodes.bulletList.create(null, [
      schema.nodes.listItem.create(null, [
        schema.nodes.paragraph.create(null, text('外层')),
        schema.nodes.bulletList.create(null, [
          schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, text('内层'))),
        ]),
      ]),
    ]);
    expect(serialize(node)).toBe('- 外层\n  - 内层');
  });

  it('任务列表输出勾选状态', () => {
    const node = schema.nodes.taskList.create(null, [
      schema.nodes.taskItem.create({ checked: true }, schema.nodes.paragraph.create(null, text('已完成'))),
      schema.nodes.taskItem.create({ checked: false }, schema.nodes.paragraph.create(null, text('未完成'))),
      schema.nodes.taskItem.create({ inapplicable: true }, schema.nodes.paragraph.create(null, text('不适用'))),
    ]);
    expect(serialize(node)).toBe('- [x] 已完成\n- [ ] 未完成\n- [~] 不适用');
  });
});

describe('表格', () => {
  it('输出管道表格并保留对齐', () => {
    const cell = (value: string, align: string | null) =>
      schema.nodes.tableHeader.create({ align }, text(value));
    const body = (value: string, align: string | null) =>
      schema.nodes.tableCell.create({ align }, text(value));

    const node = schema.nodes.table.create(null, [
      schema.nodes.tableRow.create(null, [
        cell('左', 'left'),
        cell('中', 'center'),
        cell('右', 'right'),
      ]),
      schema.nodes.tableRow.create(null, [
        body('a', null),
        body('b', null),
        body('c', null),
      ]),
    ]);

    const result = serialize(node);
    const lines = result.split('\n');
    expect(lines[0]).toMatch(/^\| 左\s+\| 中\s+\| 右\s+\|$/);
    expect(lines[1]).toMatch(/^\| :-+ \| :-+: \| -+: \|$/);
    expect(lines[2]).toMatch(/^\| a\s+\| b\s+\| c\s+\|$/);
  });

  it('单元格中的管道符被转义', () => {
    const node = schema.nodes.table.create(null, [
      schema.nodes.tableRow.create(null, [
        schema.nodes.tableHeader.create({ align: null }, text('列')),
      ]),
      schema.nodes.tableRow.create(null, [
        schema.nodes.tableCell.create({ align: null }, text('a | b')),
      ]),
    ]);
    expect(serialize(node)).toContain('a \\| b');
  });
});

describe('行内标记', () => {
  it('粗体使用 **', () => {
    const node = schema.nodes.paragraph.create(null, text('加粗', [schema.marks.bold.create()]));
    expect(serialize(node)).toBe('**加粗**');
  });

  it('斜体使用 *', () => {
    const node = schema.nodes.paragraph.create(null, text('斜体', [schema.marks.italic.create()]));
    expect(serialize(node)).toBe('*斜体*');
  });

  it('删除线使用 ~~', () => {
    const node = schema.nodes.paragraph.create(null, text('删除', [schema.marks.strike.create()]));
    expect(serialize(node)).toBe('~~删除~~');
  });

  it('行内代码使用反引号', () => {
    const node = schema.nodes.paragraph.create(null, text('code', [schema.marks.code.create()]));
    expect(serialize(node)).toBe('`code`');
  });

  it('行内代码内容含反引号时加长围栏', () => {
    const node = schema.nodes.paragraph.create(null, text('a`b', [schema.marks.code.create()]));
    expect(serialize(node)).toBe('``a`b``');
  });

  it('链接输出地址与标题', () => {
    const node = schema.nodes.paragraph.create(
      null,
      text('链接', [schema.marks.link.create({ href: 'https://example.com', title: '标题' })]),
    );
    expect(serialize(node)).toBe('[链接](https://example.com "标题")');
  });

  it('相对地址保持原样', () => {
    const node = schema.nodes.paragraph.create(
      null,
      text('相对', [schema.marks.link.create({ href: '../page.md' })]),
    );
    expect(serialize(node)).toBe('[相对](../page.md)');
  });

  it('自动链接不重复包裹', () => {
    const node = schema.nodes.paragraph.create(
      null,
      text('https://example.com', [schema.marks.link.create({ href: 'https://example.com' })]),
    );
    expect(serialize(node)).toBe('https://example.com');
  });
});

describe('GLFM 专用节点', () => {
  it('提示块输出 [!NOTE]', () => {
    const node = schema.nodes.alert.create({ type: 'note' }, [
      schema.nodes.alertTitle.create(null),
      schema.nodes.paragraph.create(null, text('提示正文。')),
    ]);
    expect(serialize(node)).toBe('> [!NOTE]\n> 提示正文。');
  });

  it('提示块保留自定义标题', () => {
    const node = schema.nodes.alert.create({ type: 'warning' }, [
      schema.nodes.alertTitle.create(null, text('数据删除')),
      schema.nodes.paragraph.create(null, text('不可恢复。')),
    ]);
    expect(serialize(node)).toBe('> [!WARNING] 数据删除\n> 不可恢复。');
  });

  it('五种提示类型都使用大写', () => {
    for (const type of ['note', 'tip', 'important', 'warning', 'caution'] as const) {
      const node = schema.nodes.alert.create({ type }, [
        schema.nodes.alertTitle.create(null),
        schema.nodes.paragraph.create(null, text('正文')),
      ]);
      expect(serialize(node)).toContain(`[!${type.toUpperCase()}]`);
    }
  });

  it('折叠块输出 details 与 summary', () => {
    const node = schema.nodes.details.create({ open: false }, [
      schema.nodes.detailsSummary.create(null, text('点击展开')),
      schema.nodes.detailsContent.create(null, schema.nodes.paragraph.create(null, text('隐藏内容'))),
    ]);
    expect(serialize(node)).toBe(
      '<details>\n<summary>点击展开</summary>\n隐藏内容\n</details>',
    );
  });

  it('行内公式保留美元反引号定界', () => {
    const node = schema.nodes.paragraph.create(null, [
      schema.nodes.mathInline.create({ source: 'a^2+b^2=c^2', delimiter: '$`' }),
    ]);
    expect(serialize(node)).toBe('$`a^2+b^2=c^2`$');
  });

  it('块级公式输出 math 围栏', () => {
    const node = schema.nodes.mathBlock.create({ info: 'math' }, text('a^2+b^2=c^2'));
    expect(serialize(node)).toBe('```math\na^2+b^2=c^2\n```');
  });

  it('Mermaid 输出 mermaid 围栏', () => {
    const node = schema.nodes.mermaidBlock.create({ info: 'mermaid' }, text('graph TD\nA-->B'));
    expect(serialize(node)).toBe('```mermaid\ngraph TD\nA-->B\n```');
  });

  it('图片保留原始地址', () => {
    const node = schema.nodes.paragraph.create(null, [
      schema.nodes.image.create({ src: 'img/logo.png', alt: '标志', title: '标题' }),
    ]);
    expect(serialize(node)).toBe('![标志](img/logo.png "标题")');
  });

  it('图片保留尺寸属性', () => {
    const node = schema.nodes.paragraph.create(null, [
      schema.nodes.image.create({ src: 'img/logo.png', alt: '标志', width: '100' }),
    ]);
    expect(serialize(node)).toBe('![标志](img/logo.png){width="100"}');
  });

  it('媒体优先复用原始写法', () => {
    const node = schema.nodes.paragraph.create(null, [
      schema.nodes.media.create({ source: '![音频](audio.mp3)', kind: 'audio' }),
    ]);
    expect(serialize(node)).toBe('![音频](audio.mp3)');
  });

  it('GitLab 引用输出原文', () => {
    const node = schema.nodes.paragraph.create(null, [
      schema.nodes.reference.create({ originalText: '#123', referenceType: 'issue', text: '标题' }),
    ]);
    expect(serialize(node)).toBe('#123');
  });

  it('Emoji 输出短代码', () => {
    const node = schema.nodes.paragraph.create(null, [schema.nodes.emoji.create({ name: 'smile' })]);
    expect(serialize(node)).toBe(':smile:');
  });

  it('脚注引用保留标识', () => {
    const node = schema.nodes.paragraph.create(null, [
      schema.nodes.footnoteReference.create({ label: '1' }),
    ]);
    expect(serialize(node)).toBe('[^1]');
  });

  it('目录标记保留原文', () => {
    expect(serialize(schema.nodes.tableOfContents.create({ source: '[[_TOC_]]' }))).toBe('[[_TOC_]]');
    expect(serialize(schema.nodes.tableOfContents.create({ source: '[TOC]' }))).toBe('[TOC]');
  });

  it('HTML 注释原样输出', () => {
    expect(serialize(schema.nodes.htmlComment.create({ description: ' 注释 ' }))).toBe('<!-- 注释 -->');
  });

  it('源码保留块原样输出', () => {
    const raw = '<!-- front matter -->';
    const node = schema.nodes.sourceBlock.create({ reason: 'unknown' }, text(raw));
    expect(serialize(node)).toBe(raw);
  });
});

describe('转义', () => {
  it('尖括号被转义，避免被当作 HTML', () => {
    const node = schema.nodes.paragraph.create(null, text('a < b > c'));
    expect(serialize(node)).toBe('a \\< b \\> c');
  });

  it('行首井号被转义', () => {
    const node = schema.nodes.paragraph.create(null, text('# 不是标题'));
    expect(serialize(node)).toBe('\\# 不是标题');
  });

  it('星号被转义', () => {
    const node = schema.nodes.paragraph.create(null, text('*不是斜体*'));
    expect(serialize(node)).toBe('\\*不是斜体\\*');
  });
});
