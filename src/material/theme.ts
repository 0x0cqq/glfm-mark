/**
 * Material 展示层：把语义节点渲染为 MkDocs Material 风格的结构。
 *
 * 约定（设计文档 §5）：
 * - 宿主存在 Material 样式时继承 `.md-typeset` 与 `--md-*` 变量。
 * - 全部编辑控件使用 `glfm-editor__*` 前缀，不覆盖宿主全局样式。
 * - 数学、Mermaid、高亮结果都不进入 Markdown 或 ProseMirror 内容。
 */

/** Material 提示块类名映射。 */
export const ALERT_CLASS: Record<string, string> = {
  note: 'note',
  tip: 'tip',
  important: 'important',
  warning: 'warning',
  caution: 'caution',
};

/** 提示块图标，与 Material admonition 的类型图标语义一致。 */
export const ALERT_ICON: Record<string, string> = {
  note: 'note',
  tip: 'lightbulb',
  important: 'flame',
  warning: 'alert',
  caution: 'alert-octagon',
};

/** 提示块标题文本。 */
export const ALERT_LABEL: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

/** 判断是否为 Material 环境。 */
export function hasMaterialTheme(root: ParentNode = document): boolean {
  return Boolean(root.querySelector('.md-typeset'));
}

/**
 * 把 GLFM 提示块的 DOM 结构转换为 Material admonition 结构。
 *
 * 仅用于预览展示；编辑区的提示块由 Vue 节点视图渲染。
 */
export function toMaterialAdmonition(
  doc: Document,
  type: string,
  title: string,
  body: Node,
): HTMLElement {
  const wrapper = doc.createElement('div');
  wrapper.className = `admonition ${ALERT_CLASS[type] ?? 'note'} glfm-editor__admonition`;

  const titleEl = doc.createElement('p');
  titleEl.className = 'admonition-title';
  titleEl.textContent = title;
  wrapper.append(titleEl);

  const content = doc.createElement('div');
  content.className = 'glfm-editor__admonition-body';
  content.append(body);
  wrapper.append(content);

  return wrapper;
}
