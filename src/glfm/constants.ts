/**
 * GLFM 常量：提示块类型、默认标题、公式定界符等。
 */

/** GLFM 提示块类型，导出时使用大写形式。 */
export const ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

/** 提示块默认标题，与 GitLab 渲染一致。 */
export const DEFAULT_ALERT_TITLES: Record<AlertType, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

/** 新建行内公式的定界方式：GitLab 的美元符号包裹反引号语法。 */
export const DEFAULT_INLINE_MATH_DELIMITER = '$`';

/** 新建块级公式的定界方式：`math` 围栏。 */
export const DEFAULT_BLOCK_MATH_DELIMITER = '```math';

/** 源码保留节点的类型名。 */
export const SOURCE_BLOCK = 'sourceBlock';

/** 顶层块之间的默认间隔：两个换行。 */
export const DEFAULT_BLOCK_SEPARATOR = '\n\n';
