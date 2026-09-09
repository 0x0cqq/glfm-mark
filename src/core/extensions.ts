/**
 * 编辑器扩展：在 GLFM schema 之上挂载 Vue 节点视图。
 *
 * schema（`src/glfm/schema.ts`）保持无 DOM 依赖，供源码保留层与测试使用；
 * 本模块只供浏览器端编辑器使用。
 */
import type { Extensions } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { glfmExtensions } from '../glfm/schema';
import { GlfmCodeBlock } from '../glfm/extensions/basic';
import { GlfmDetails } from '../glfm/extensions/structure';
import { GlfmMathBlock, GlfmMathInline, GlfmMermaidBlock, GlfmSourceBlock } from '../glfm/extensions/special';
import CodeBlockView from '../components/nodeviews/CodeBlockView.vue';
import MathView from '../components/nodeviews/MathView.vue';
import MermaidView from '../components/nodeviews/MermaidView.vue';
import SourceBlockView from '../components/nodeviews/SourceBlockView.vue';
import DetailsView from '../components/nodeviews/DetailsView.vue';

/** 带节点视图的代码块。 */
const CodeBlockWithView = GlfmCodeBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(CodeBlockView);
  },
});

/** 带节点视图的源码保留块。 */
const SourceBlockWithView = GlfmSourceBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(SourceBlockView);
  },
});

/** 带节点视图的公式节点。 */
const MathInlineWithView = GlfmMathInline.extend({
  addNodeView() {
    return VueNodeViewRenderer(MathView);
  },
});

const MathBlockWithView = GlfmMathBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(MathView);
  },
});

/** 带节点视图的 Mermaid 节点。 */
const MermaidWithView = GlfmMermaidBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(MermaidView);
  },
});

/** 带节点视图的折叠块。 */
const DetailsWithView = GlfmDetails.extend({
  addNodeView() {
    return VueNodeViewRenderer(DetailsView);
  },
});

/** 返回带节点视图的编辑器扩展列表。 */
export function editorExtensions(): Extensions {
  const base = glfmExtensions();

  return base.map((extension) => {
    const name = extension.name;
    if (name === GlfmCodeBlock.name) return CodeBlockWithView;
    if (name === GlfmSourceBlock.name) return SourceBlockWithView;
    if (name === GlfmMathInline.name) return MathInlineWithView;
    if (name === GlfmMathBlock.name) return MathBlockWithView;
    if (name === GlfmMermaidBlock.name) return MermaidWithView;
    if (name === GlfmDetails.name) return DetailsWithView;
    return extension;
  });
}
