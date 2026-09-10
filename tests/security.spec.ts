/**
 * 安全测试：确认危险内容不能执行，也不会进入不受控请求。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  isSafeUrl,
  sanitizeGitLabHtml,
  sanitizePastedHtml,
  sanitizeSvg,
} from '../src/material/sanitize';
import { renderPreviewHtml, resolveAssetUrl, resolveLinkUrl } from '../src/material/preview';
import type { DocumentContext } from '../src/core/types';

const context: DocumentContext = {
  documentId: 'doc',
  linkBaseUrl: 'https://example.com/docs/',
  assetBaseUrl: 'https://example.com/docs/assets/',
};

describe('HTML 净化', () => {
  it('移除脚本标签', () => {
    const result = sanitizeGitLabHtml('<p>安全</p><script>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).toContain('安全');
  });

  it('移除事件属性', () => {
    const result = sanitizeGitLabHtml('<img src="a.png" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('移除 iframe 与表单', () => {
    const result = sanitizeGitLabHtml('<iframe src="https://evil"></iframe><form action="/x"></form>');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<form');
  });

  it('移除内联样式', () => {
    const result = sanitizeGitLabHtml('<p style="color:red">文本</p>');
    expect(result).not.toContain('style=');
  });

  it('阻止 javascript: 协议', () => {
    const result = sanitizeGitLabHtml('<a href="javascript:alert(1)">链接</a>');
    expect(result).not.toContain('javascript:');
  });

  it('阻止 vbscript: 协议', () => {
    const result = sanitizeGitLabHtml('<a href="vbscript:msgbox(1)">链接</a>');
    expect(result).not.toContain('vbscript:');
  });

  it('阻止 HTML data URL', () => {
    const result = sanitizeGitLabHtml('<a href="data:text/html,<script>alert(1)</script>">链接</a>');
    expect(result).not.toContain('data:text/html');
  });

  it('保留 GitLab 语义属性', () => {
    const result = sanitizeGitLabHtml(
      '<p data-sourcepos="1:1-1:4"><code data-math-style="inline">x</code></p>',
    );
    expect(result).toContain('data-sourcepos="1:1-1:4"');
    expect(result).toContain('data-math-style="inline"');
  });

  it('粘贴净化移除危险内容但保留文本', () => {
    const result = sanitizePastedHtml('<b>粗体</b><script>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).toContain('粗体');
  });

  it('SVG 净化移除脚本与外部引用', () => {
    const result = sanitizeSvg('<svg><script>alert(1)</script><circle r="1" /></svg>');
    expect(result).not.toContain('<script');
  });
});

describe('地址校验', () => {
  it('拒绝可执行协议', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
  });

  it('允许 http、https 与相对地址', () => {
    expect(isSafeUrl('https://example.com/a.png')).toBe(true);
    expect(isSafeUrl('http://example.com/a.png')).toBe(true);
    expect(isSafeUrl('img/a.png')).toBe(true);
  });

  it('允许图片 data URL 供上传占位使用', () => {
    expect(isSafeUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });

  it('解析相对资源地址为绝对地址', () => {
    expect(resolveAssetUrl('img/a.png', context)).toBe('https://example.com/docs/assets/img/a.png');
  });

  it('绝对地址保持原样', () => {
    expect(resolveAssetUrl('https://cdn.example.com/a.png', context)).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('锚点链接保持原样', () => {
    expect(resolveLinkUrl('#section', context)).toBe('#section');
  });

  it('解析相对链接地址', () => {
    expect(resolveLinkUrl('page.md', context)).toBe('https://example.com/docs/page.md');
  });
});

describe('预览渲染', () => {
  it('危险 HTML 不会出现在预览 DOM 中', async () => {
    const html = '<p>安全</p><script>window.__xss = true</script>';
    const container = await renderPreviewHtml(html, context);

    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
    expect(container.textContent).toContain('安全');
  });

  it('Mermaid 不自动访问外部图表服务', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const container = await renderPreviewHtml(
      '<pre><code class="language-mermaid">graph TD\nA-->B</code></pre>',
      context,
    );

    // 渲染在本地完成，不应产生任何网络请求。
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector('.glfm-editor__mermaid, [data-mermaid-error]')).not.toBeNull();
    fetchSpy.mockRestore();
  });

  it('提示块转换为 Material admonition', async () => {
    const html =
      '<div class="markdown-alert markdown-alert-warning"><p class="markdown-alert-title">数据删除</p><p>正文</p></div>';
    const container = await renderPreviewHtml(html, context);

    const admonition = container.querySelector('.admonition.warning');
    expect(admonition).not.toBeNull();
    expect(admonition?.querySelector('.admonition-title')?.textContent).toBe('数据删除');
  });

  it('相对图片地址在预览中解析为绝对地址，但源地址不变', async () => {
    const container = await renderPreviewHtml('<p><img src="img/a.png" alt="图"></p>', context);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/docs/assets/img/a.png',
    );
  });

  it('媒体不自动播放', async () => {
    const container = await renderPreviewHtml('<p><video src="v.mp4"></video></p>', context);
    const video = container.querySelector('video');
    expect(video?.hasAttribute('autoplay')).toBe(false);
    expect(video?.getAttribute('preload')).toBe('none');
  });

  it('数学渲染失败时保留原公式与错误提示', async () => {
    const container = await renderPreviewHtml(
      '<p><code data-math-style="inline">\\invalid{</code></p>',
      context,
    );

    const math = container.querySelector('.glfm-editor__math');
    expect(math).not.toBeNull();
    expect(math?.classList.contains('glfm-editor__math--error')).toBe(true);
    expect(math?.textContent).toContain('\\invalid{');
  });
});
