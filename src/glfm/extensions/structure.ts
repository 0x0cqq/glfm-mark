/**
 * GLFM 结构节点：提示块、折叠块、表格、任务列表。
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { ALERT_TYPES, DEFAULT_ALERT_TITLES, type AlertType } from '../constants';

/**
 * 扩展 Tiptap 的命令类型，使自定义命令在 TypeScript 中可用。
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    glfmAlert: {
      /** 插入一个提示块。 */
      insertAlert: (type?: AlertType) => ReturnType;
      /** 修改当前提示块类型。 */
      setAlertType: (type: AlertType) => ReturnType;
    };
    glfmDetails: {
      /** 插入一个折叠块。 */
      insertDetails: () => ReturnType;
    };
  }
}

/** 提示块标题：仅承载用户自定义标题，默认标题不写入文档。 */
export const GlfmAlertTitle = Node.create({
  name: 'alertTitle',
  content: 'text*',
  marks: '',
  defining: true,
  selectable: false,

  parseHTML() {
    // 优先级高于普通段落，避免被通用 `p` 规则抢先匹配。
    return [{ tag: 'p.markdown-alert-title', priority: 70 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, { class: 'markdown-alert-title' }), 0];
  },
});

/**
 * GLFM 提示块：`> [!NOTE]` 结构。
 *
 * `type` 保存提示类型，`title` 保存用户自定义标题。默认标题在导出时根据
 * 类型生成，不写入文档，避免展示信息污染源码。
 */
export const GlfmAlert = Node.create({
  name: 'alert',
  content: 'alertTitle block+',
  group: 'block',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      type: {
        default: 'note' as AlertType,
        parseHTML: (element) => {
          const matched = ALERT_TYPES.find((type) =>
            element.classList.contains(`markdown-alert-${type}`),
          );
          return matched ?? 'note';
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div.markdown-alert' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { type, sourceId, ...rest } = HTMLAttributes;
    void type;
    void sourceId;

    return [
      'div',
      mergeAttributes(rest, {
        class: `markdown-alert markdown-alert-${node.attrs.type ?? 'note'}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertAlert:
        (type: AlertType = 'note') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { type },
            content: [{ type: 'alertTitle' }, { type: 'paragraph' }],
          }),
      setAlertType:
        (type: AlertType) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { type }),
    };
  },
});

/** 折叠块标题：对应 `<summary>`，只承载行内内容。 */
export const GlfmDetailsSummary = Node.create({
  name: 'detailsSummary',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'summary' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes), 0];
  },
});

/** 折叠块正文：对应 `<details>` 内除 `<summary>` 之外的内容。 */
export const GlfmDetailsContent = Node.create({
  name: 'detailsContent',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-details-content]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-details-content': '' }), 0];
  },
});

/**
 * 折叠块：`<details><summary>标题</summary>正文</details>`。
 *
 * `open` 保存源码中的展开状态；编辑时的临时展开不写入文档。
 */
export const GlfmDetails = Node.create({
  name: 'details',
  content: 'detailsSummary detailsContent*',
  group: 'block',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute('open'),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { open, ...rest } = HTMLAttributes;
    return ['details', mergeAttributes(rest, open ? { open: '' } : {}), 0];
  },

  addCommands() {
    return {
      insertDetails:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [
              { type: 'detailsSummary' },
              { type: 'detailsContent', content: [{ type: 'paragraph' }] },
            ],
          }),
    };
  },
});

/**
 * 表格单元格。
 *
 * 内部使用块内容（单个段落），与 prosemirror-tables 的命令模型一致；
 * 导出时只取段落内的行内内容。
 */
export const GlfmTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: { default: null },
    };
  },
});

/** 表头单元格。 */
export const GlfmTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: { default: null },
    };
  },
});

/** 表格行。 */
export const GlfmTableRow = TableRow;

/** 表格：输出干净的 `<table>`，不带编辑器专用的宽度与包装。 */
export const GlfmTable = Table.extend({
  content: 'tableRow+',

  addOptions() {
    return {
      ...this.parent?.(),
      // 不启用列宽拖拽，避免向展示 DOM 写入 `width: 0px` 等编辑器专用样式。
      resizable: false,
      renderWrapper: false,
    } as ReturnType<NonNullable<typeof this.parent>>;
  },

  addAttributes() {
    return {};
  },

  addNodeView() {
    return null;
  },

  renderHTML({ HTMLAttributes }) {
    const { sourceId, ...rest } = HTMLAttributes;
    void sourceId;
    return ['table', mergeAttributes(rest), ['tbody', 0]];
  },
});

/** 任务列表项：保留勾选与不适用状态。 */
export const GlfmTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) => {
          const input = element.querySelector('input[type="checkbox"]');
          if (input instanceof HTMLInputElement) return input.checked;
          const dataChecked = element.getAttribute('data-checked');
          return dataChecked === '' || dataChecked === 'true';
        },
      },
      inapplicable: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element) => {
          const input = element.querySelector('input[type="checkbox"]');
          if (input instanceof HTMLInputElement) return input.hasAttribute('data-inapplicable');
          return element.hasAttribute('data-inapplicable');
        },
      },
    };
  },

  parseHTML() {
    // GitLab 输出 `li.task-list-item`，并在其中放置 checkbox。
    return [{ tag: 'li.task-list-item', priority: 60, getAttrs: (element) =>
      element.parentElement?.matches('ul.task-list, ul.contains-task-list, ol.contains-task-list') ? {} : false }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { checked, inapplicable, sourceId, ...rest } = HTMLAttributes;
    void checked;
    void inapplicable;
    void sourceId;

    const attributes: Record<string, unknown> = {
      ...rest,
      'data-type': this.name,
      class: 'glfm-editor__task-item',
    };

    return [
      'li',
      attributes,
      [
        'label',
        [
          'input',
          {
            type: 'checkbox',
            checked: node.attrs.checked ? 'checked' : null,
            'data-inapplicable': node.attrs.inapplicable ? '' : null,
          },
        ],
        ['span'],
      ],
      ['div', 0],
    ];
  },
});

/** 任务列表：匹配 GitLab 的 `ul.task-list` / `ol.contains-task-list`。 */
export const GlfmTaskList = TaskList.extend({
  parseHTML() {
    return [
      { tag: 'ul.task-list', priority: 60 },
      { tag: 'ul.contains-task-list', priority: 60 },
      { tag: 'ol.contains-task-list', priority: 60 },
    ];
  },
});

export { DEFAULT_ALERT_TITLES };
