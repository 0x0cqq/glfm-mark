import { defineConfig, devices } from '@playwright/test';

/**
 * 视觉与端到端测试配置。
 *
 * 演示页与 MkDocs 参考站点都需要预先启动：
 * - `npm run dev`（演示页，默认 5173）
 * - MkDocs 站点（`examples/mkdocs/site`，默认 8020）
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
    {
      name: 'desktop-dark',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
    },
    {
      name: 'mobile-light',
      use: { ...devices['Pixel 7'] },
    },
  ],
  timeout: 60_000,
});
