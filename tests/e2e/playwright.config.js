// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:   './tests/e2e',
  timeout:   30_000,
  expect:    { timeout: 5_000 },
  fullyParallel: false,   // testes de concorrência precisam de controle sequencial
  retries:   0,
  workers:   1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/reports', open: 'never' }],
  ],

  use: {
    baseURL:          process.env.APP_URL ?? 'http://localhost:5173',
    trace:            'on-first-retry',
    screenshot:       'only-on-failure',
    video:            'retain-on-failure',
    navigationTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
  ],

  // Inicia o dev server antes dos testes, se APP_URL não estiver definida
  webServer: process.env.APP_URL ? undefined : {
    command:  'npm run dev',
    url:      'http://localhost:5173',
    timeout:  30_000,
    reuseExistingServer: true,
  },
});
