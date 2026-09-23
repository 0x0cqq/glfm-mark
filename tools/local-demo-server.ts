/** 本地仓库编辑演示服务：仅监听回环地址，把浏览器保存请求交给目录适配器。 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalDirectoryAdapter } from './local-directory-adapter.ts';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[3] ?? 8130);
if (!process.argv[2]) throw new Error('用法：npm run demo:local -- <仓库副本目录> [端口]');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须在 1 至 65535 之间');

const repositoryRoot = await realpath(resolve(process.argv[2]));
const distRoot = await realpath(resolve(here, '../dist'));
const demoRoot = await realpath(resolve(here, 'local-demo'));
const adapter = new LocalDirectoryAdapter(repositoryRoot);
const origin = `http://127.0.0.1:${port}`;
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
};
const allowedRepositoryTypes = new Set(['.md', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
const omittedSuggestions = new Set(['.git', 'node_modules', '.venv', 'dist', 'site']);
const imageExtensions: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/avif': '.avif',
};

/** 确保目录内路径不会跨出已配置的根目录。 */
function within(root: string, path: string): string {
  const target = resolve(root, `.${path}`);
  const part = relative(root, target);
  if (part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) throw new Error('路径超出服务目录');
  return target;
}

/** 返回工作树内的 Markdown 文件列表，跳过 Git 元数据和符号链接。 */
async function markdownFiles(directory = repositoryRoot, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (omittedSuggestions.has(entry.name)) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await markdownFiles(join(directory, entry.name), path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(path);
  }
  return files;
}

/** 读取有上限的 JSON 请求体，并限制为当前本地页面发起。 */
async function requestJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') {
    throw new Error('保存请求来源无效');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 24 * 1024 * 1024) throw new Error('保存请求超过 24 MiB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/** 将接口响应写为 JSON。 */
function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(value));
}

/** 验证保存请求并转换图片字节。 */
function writeRequest(value: unknown): { documentPath: string; markdown: string; expectedRevision: string; assets: { path: string; content: Blob }[] } {
  if (!value || typeof value !== 'object') throw new Error('保存请求无效');
  const body = value as Record<string, unknown>;
  if (typeof body.documentPath !== 'string' || !body.documentPath.toLowerCase().endsWith('.md')
    || typeof body.markdown !== 'string' || typeof body.expectedRevision !== 'string' || !Array.isArray(body.assets)) {
    throw new Error('保存请求缺少文档、版本或资源');
  }
  const assetDirectory = `${body.documentPath.slice(0, -3)}.assets/`;
  const assets = body.assets.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('图片数据无效');
    const asset = value as Record<string, unknown>;
    if (typeof asset.path !== 'string' || typeof asset.type !== 'string' || typeof asset.base64 !== 'string'
      || !asset.path.startsWith(assetDirectory)
      || extname(asset.path).toLowerCase() !== imageExtensions[asset.type]
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.base64)) {
      throw new Error('图片数据无效');
    }
    return { path: asset.path, content: new Blob([Buffer.from(asset.base64, 'base64')], { type: asset.type }) };
  });
  return { documentPath: body.documentPath, markdown: body.markdown, expectedRevision: body.expectedRevision, assets };
}

/** 处理载入、保存与静态资源请求。 */
async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', origin);
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/api/files' && request.method === 'GET') {
    return sendJson(response, 200, (await markdownFiles()).sort());
  }
  if (pathname === '/api/document' && request.method === 'GET') {
    const documentPath = url.searchParams.get('path');
    if (!documentPath?.toLowerCase().endsWith('.md')) throw new Error('请选择仓库内的 Markdown 文件');
    return sendJson(response, 200, await adapter.load(documentPath));
  }
  if (pathname === '/api/document' && request.method === 'POST') {
    const { documentPath, markdown, expectedRevision, assets } = writeRequest(await requestJson(request));
    return sendJson(response, 200, await adapter.write({ bundle: { documentPath, markdown, assets }, expectedRevision }));
  }
  if (request.method !== 'GET') return sendJson(response, 405, { error: '方法不支持' });

  const repositoryFile = pathname.startsWith('/repo/');
  const [root, path] = repositoryFile
    ? [repositoryRoot, pathname.slice('/repo'.length)]
    : pathname.startsWith('/dist/')
      ? [distRoot, pathname.slice('/dist'.length)]
      : [demoRoot, pathname === '/' ? '/index.html' : pathname];
  const target = within(root, path);
  const actual = await realpath(target);
  within(root, `/${relative(root, actual).replaceAll('\\', '/')}`);
  if (!(await stat(actual)).isFile()) throw new Error('资源不是文件');
  if (repositoryFile && (!allowedRepositoryTypes.has(extname(actual).toLowerCase())
    || relative(root, actual).split(sep).some((segment) => segment.startsWith('.')))) {
    throw new Error('资源类型不支持展示');
  }
  const content = await readFile(actual);
  response.writeHead(200, { 'content-type': mime[extname(actual).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(content);
}

/** 在请求边界报告错误，保留文件与编辑器当前内容。 */
createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    const cause = error as NodeJS.ErrnoException;
    if (!response.headersSent) sendJson(response, cause.code === 'ENOENT' ? 404 : 400, { error: cause.message ?? String(error) });
    else response.end();
  });
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`本地 Markdown 演示：${origin}/\n工作目录：${repositoryRoot}\n`);
});
