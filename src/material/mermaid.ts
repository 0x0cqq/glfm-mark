/**
 * Mermaid 图表展示：按需加载 Mermaid，逐节点渲染。
 *
 * 规则（设计文档 §5）：
 * - `securityLevel: 'strict'`，禁用自动扫描页面。
 * - 渲染结果经过净化后插入节点内部，不进入 Markdown。
 * - 跟随亮暗主题重绘。
 */
import { sanitizeSvg } from './sanitize';

/** Mermaid 实例缓存。 */
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let currentTheme: 'default' | 'dark' | null = null;

/** 按需加载并初始化 Mermaid。 */
async function loadMermaid(theme: 'default' | 'dark') {
  const module = await (mermaidPromise ??= import('mermaid').then((m) => m.default));
  if (currentTheme !== theme) {
    module.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      fontFamily: 'inherit',
    });
    currentTheme = theme;
  }
  return module;
}

/** 渲染结果。 */
export interface MermaidRenderResult {
  svg: string | null;
  error: string | null;
}

/** 生成唯一渲染标识。 */
let renderSeq = 0;

/**
 * 渲染单个 Mermaid 图表。
 *
 * 失败时返回错误信息，不抛出异常，调用方保留原源码展示。
 */
export async function renderMermaid(
  source: string,
  theme: 'default' | 'dark' = 'default',
): Promise<MermaidRenderResult> {
  try {
    const mermaid = await loadMermaid(theme);
    renderSeq += 1;
    const { svg } = await mermaid.render(`glfm-editor-mermaid-${renderSeq}`, source);
    return { svg: sanitizeSvg(svg), error: null };
  } catch (error) {
    return { svg: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 检测当前主题，供重绘使用。 */
export function detectTheme(root: ParentNode = document): 'default' | 'dark' {
  const scheme = root.querySelector('[data-md-color-scheme]')?.getAttribute('data-md-color-scheme');
  if (scheme === 'slate') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
  }
  return 'default';
}
