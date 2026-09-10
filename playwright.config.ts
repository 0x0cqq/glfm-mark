import { defineConfig, devices } from '@playwright/test';

/** 完整矩阵（亮色 + 暗色 + 窄屏）需要显式开启。 */
const fullMatrix = process.env.GLFM_VISUAL_FULL === '1';

/**
 * 视觉与端到端测试配置。
 *
 * 演示页与 MkDocs 参考站点都需要预先启动：
 * - `npm run dev`（演示页，默认 5173）
 * - MkDocs 站点（`examples/mkdocs/site`，默认 8020）
 *
 * 每次用例都要重新加载 Material 主题与字体，单个 project 约 1.5–2 分钟。
 * 因此默认只跑桌面亮色；提交前完整矩阵用 `GLFM_VISUAL_FULL=1` 开启。
 */
export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
    },
    ...(fullMatrix
      ? [
          {
            name: 'desktop-dark',
            use: {
              ...devices['Desktop Chrome'],
              viewport: { width: 1280, height: 900 },
              colorScheme: 'dark' as const,
            },
          },
          {
            name: 'mobile-light',
            use: { ...devices['Pixel 7'] },
          },
        ]
      : []),
  ],
  timeout: 60_000,
});
