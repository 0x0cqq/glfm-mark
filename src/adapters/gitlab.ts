/**
 * 默认 GitLab Markdown 适配器：调用公共 `/api/v4/markdown` 接口渲染 GLFM。
 *
 * 约束（设计文档 §6）：
 * - `getHeaders` 在请求时执行，凭据由宿主管理，不写入构建产物或日志。
 * - 只使用公开字段 `text`、`gfm`、`project`。
 * - HTTP 与网络错误转换为清晰的组件错误。
 * - 返回的展示地址只用于展示，导出始终使用原始引用或路径。
 */
import type { EditorServices, RenderRequest } from '../core/types';

/** 创建适配器的选项。 */
export interface GitLabMarkdownServiceOptions {
  /** GitLab 实例地址，例如 `https://gitlab.example.com`。 */
  baseUrl: string;
  /** 项目路径，例如 `group/project`；Wiki 与个人片段可省略。 */
  project?: string;
  /** 请求头提供者，在每次请求时执行。 */
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  /** 自定义 fetch 实现，便于测试。 */
  fetch?: typeof fetch;
}

/** 适配器返回的服务。 */
export interface GitLabMarkdownService extends EditorServices {
  /** 渲染 Markdown 为 GitLab HTML。 */
  renderMarkdown(request: RenderRequest): Promise<{ html: string }>;
}

/** 移除末尾斜杠，避免拼接出双斜杠。 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * 创建默认的 GitLab Markdown 渲染服务。
 *
 * 只实现 `renderMarkdown`；上传与保存由宿主按需提供。
 */
export function createGitLabMarkdownService(
  options: GitLabMarkdownServiceOptions,
): GitLabMarkdownService {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const request = options.fetch ?? globalThis.fetch;

  return {
    async renderMarkdown({ markdown, signal }: RenderRequest): Promise<{ html: string }> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.getHeaders ? await options.getHeaders() : {}),
      };

      const body: Record<string, unknown> = { text: markdown, gfm: true };
      if (options.project) body.project = options.project;

      let response: Response;
      try {
        response = await request(`${baseUrl}/api/v4/markdown`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
        throw new Error(`无法连接 GitLab Markdown 服务：${baseUrl}`, { cause });
      }

      if (!response.ok) {
        throw new Error(
          `GitLab Markdown 服务返回 ${response.status} ${response.statusText}`.trim(),
        );
      }

      const payload = (await response.json()) as { html?: unknown };
      if (typeof payload.html !== 'string') {
        throw new Error('GitLab Markdown 服务返回的响应缺少 html 字段');
      }

      return { html: payload.html };
    },
  };
}
