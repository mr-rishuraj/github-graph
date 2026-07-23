import { test, expect } from '@playwright/test';

// ─── Landing page ─────────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the GitHub Graph title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'GitHub Graph' })).toBeVisible();
  });

  test('shows the URL input', async ({ page }) => {
    await expect(page.getByPlaceholder('https://github.com/owner/repository')).toBeVisible();
  });

  test('Analyze button is disabled with empty input', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Analyze' })).toBeDisabled();
  });

  test('Analyze button enables when valid GitHub URL is entered', async ({ page }) => {
    await page.getByPlaceholder('https://github.com/owner/repository').fill('https://github.com/facebook/react');
    await expect(page.getByRole('button', { name: 'Analyze' })).toBeEnabled();
  });

  test('shows example repos', async ({ page }) => {
    await expect(page.getByText('facebook/react')).toBeVisible();
    await expect(page.getByText('vitejs/vite')).toBeVisible();
  });

  test('clicking an example fills the input', async ({ page }) => {
    await page.getByText('vitejs/vite').click();
    const input = page.getByPlaceholder('https://github.com/owner/repository');
    await expect(input).toHaveValue('https://github.com/vitejs/vite');
  });

  test('shows advanced options toggle', async ({ page }) => {
    await expect(page.getByText('Advanced options')).toBeVisible();
    await page.getByText('Advanced options').click();
    await expect(page.getByText('Max files to analyze')).toBeVisible();
    await expect(page.getByText('Skip test files')).toBeVisible();
  });

  test('shows error for invalid URL', async ({ page }) => {
    const input = page.getByPlaceholder('https://github.com/owner/repository');
    await input.fill('not-a-url');
    // Analyze button should not be enabled for non-github.com URLs
    await expect(page.getByRole('button', { name: 'Analyze' })).toBeDisabled();
  });
});

// ─── Theme toggle ─────────────────────────────────────────────────────────────

test.describe('Theme', () => {
  test('dark mode is default', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    // Default should not have data-theme="light"
    const theme = await html.getAttribute('data-theme');
    expect(theme).not.toBe('light');
  });
});

// ─── Graph canvas (requires running backend — skip in CI without it) ──────────

test.describe('Graph canvas', () => {
  // These tests mock the backend SSE response to avoid real network calls
  test('shows progress view when analysis starts', async ({ page }) => {
    // Intercept the SSE stream
    await page.route('/api/analyze-stream*', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: [
          'data: {"type":"start"}\n\n',
          'data: {"type":"downloading","repo":"test/repo","branch":"main"}\n\n',
        ].join(''),
      });
    });

    await page.goto('/');
    await page.getByPlaceholder('https://github.com/owner/repository').fill('https://github.com/test/repo');
    await page.getByRole('button', { name: 'Analyze' }).click();

    // Should show the progress view
    await expect(page.getByText('test/repo')).toBeVisible({ timeout: 5000 });
  });

  test('shows graph after complete event', async ({ page }) => {
    const mockGraph = {
      nodes: [
        { id: 'n1', path: 'src/App.tsx', label: 'App.tsx', type: 'component', language: 'tsx',
          folder: 'src', lineCount: 50, sizeBytes: 1200, importCount: 2, exportCount: 1,
          isBarrel: false, exports: [], imports: [], jsxComponents: [], summary: 'App component',
          instability: 0.5, afferentCoupling: 0, efferentCoupling: 2, depth: 0 },
      ],
      edges: [],
      meta: {
        repoUrl: 'https://github.com/test/repo', owner: 'test', repo: 'repo', branch: 'main',
        totalFiles: 1, parsedFiles: 1, edgeCount: 0, analysisMs: 100,
        fileTypes: { component: 1 }, languages: { tsx: 1 },
        circularDeps: [], orphanFiles: [], mostImported: [], deadExports: [],
        avgInstability: 0.5, diagnostics: { totalImports: 2, externalImports: 1, resolvedImports: 1, barrelFollowedEdges: 0, parseFailures: 0 },
      },
    };

    await page.route('/api/analyze-stream*', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: `data: ${JSON.stringify({ type: 'complete', graph: mockGraph })}\n\n`,
      });
    });

    await page.goto('/');
    await page.getByPlaceholder('https://github.com/owner/repository').fill('https://github.com/test/repo');
    await page.getByRole('button', { name: 'Analyze' }).click();

    // Should show the graph canvas
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 10000 });
    // Stats panel should show repo name
    await expect(page.getByText('test/repo').first()).toBeVisible();
  });

  test('Back button returns to landing page', async ({ page }) => {
    const mockGraph = {
      nodes: [],
      edges: [],
      meta: {
        repoUrl: 'https://github.com/test/repo', owner: 'test', repo: 'repo', branch: 'main',
        totalFiles: 0, parsedFiles: 0, edgeCount: 0, analysisMs: 50,
        fileTypes: {}, languages: {}, circularDeps: [], orphanFiles: [],
        mostImported: [], deadExports: [], avgInstability: 0,
        diagnostics: { totalImports: 0, externalImports: 0, resolvedImports: 0, barrelFollowedEdges: 0, parseFailures: 0 },
      },
    };

    await page.route('/api/analyze-stream*', async route => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: `data: ${JSON.stringify({ type: 'complete', graph: mockGraph })}\n\n`,
      });
    });

    await page.goto('/');
    await page.getByPlaceholder('https://github.com/owner/repository').fill('https://github.com/test/repo');
    await page.getByRole('button', { name: 'Analyze' }).click();
    await page.locator('.react-flow').waitFor({ timeout: 10000 });

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'GitHub Graph' })).toBeVisible();
  });
});
