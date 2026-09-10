/**
 * MkDocs 参考页的 KaTeX 初始化。
 *
 * 使用与编辑器相同的 KaTeX 版本离线渲染，保证视觉对比条件一致。
 */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof renderMathInElement !== 'function') return;

  renderMathInElement(document.body, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
      { left: '\\[', right: '\\]', display: true },
    ],
    throwOnError: false,
    trust: false,
  });
});
