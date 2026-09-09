/**
 * 源码保留层对外类型。
 *
 * 这里只描述“用于判断是否可以被复用”的最小语义信息，不包含网络解析结果、
 * 主题、展开状态或编辑控件状态。
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** 顶层源码块在原文中的位置与初始语义。 */
export interface SourceBlock {
  /** 会话内递增编号，不使用内容哈希。 */
  id: string;
  /** 原始 JavaScript 字符串的 UTF-16 起始下标（含）。 */
  from: number;
  /** 原始 JavaScript 字符串的 UTF-16 结束下标（不含）。 */
  to: number;
  /** 原始字符串，不含已单独归入相邻间隔的行末换行。 */
  raw: string;
  /** 用于比较的语义快照。 */
  initialSemantic: string;
}

/** 导入后建立的固定基线。 */
export interface SourceBaseline {
  markdown: string;
  blocks: SourceBlock[];
  /** 块与块之间的全部剩余内容，按顺序保存。 */
  gaps: string[];
  /** 默认换行符，由原文中占多数的 LF 或 CRLF 决定。 */
  defaultEol: '\n' | '\r\n';
}

/** 导入结果。 */
export interface ImportResult {
  doc: ProseMirrorNode;
  baseline: SourceBaseline;
  /** 无法获得可靠源码位置时置为 true，此时整篇作为源码块载入。 */
  degraded: boolean;
}
