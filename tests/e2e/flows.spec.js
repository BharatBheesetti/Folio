const { test, expect } = require('@playwright/test');
const { launchApp, FIXTURES } = require('./helpers');
const path = require('path');

const SAMPLE_MD = path.join(FIXTURES, 'sample.md');
const TEST_PROJECT = path.join(FIXTURES, 'test-project');

// Helper: wait for content to load (use CSS display check — aria-hidden interferes with toBeVisible)
async function waitForContent(page) {
  await expect(page.locator('#content')).toHaveCSS('display', 'block', { timeout: 10000 });
}

// ─────────────────────────────────────────────────────────
// FLOW 1: Reader customization — forward then backwards
// ─────────────────────────────────────────────────────────
test.describe('Flow 1: Reader customization (forward + backward)', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('open file, dark mode, zoom, outline, search — then undo each', async () => {
    ({ app, page } = await launchApp([SAMPLE_MD]));
    await waitForContent(page);

    // Forward: dark mode
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Forward: zoom in twice
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');

    // Forward: open outline
    await page.locator('#outline-btn').click();
    await expect(page.locator('#outline-panel')).toHaveClass(/visible/);

    // Forward: open search and type query
    await page.keyboard.press('Control+f');
    await expect(page.locator('#search-bar')).toHaveClass(/visible/);
    await page.locator('#search-input').fill('Folio');

    // Backward: close search
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-bar')).not.toHaveClass(/visible/);

    // Backward: close outline
    await page.locator('#outline-btn').click();
    await expect(page.locator('#outline-panel')).not.toHaveClass(/visible/);

    // Backward: reset zoom
    await page.keyboard.press('Control+0');

    // Backward: switch back to light mode
    await page.locator('#theme-btn').click();
    const themeAttr = await page.locator('html').getAttribute('data-theme');
    expect(themeAttr === null || themeAttr === '').toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────
// FLOW 2: Sidebar navigation — forward then backwards
// ─────────────────────────────────────────────────────────
test.describe('Flow 2: Sidebar navigation (forward + backward)', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('open sidebar, toggle theme, toggle outline — then undo each', async () => {
    ({ app, page } = await launchApp([SAMPLE_MD]));
    await waitForContent(page);

    // Forward: open sidebar
    await page.keyboard.press('Control+b');
    await expect(page.locator('#sidebar')).toHaveClass(/visible/);

    // Forward: dark mode while sidebar open
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Forward: open outline while sidebar still open
    await page.locator('#outline-btn').click();
    await expect(page.locator('#outline-panel')).toHaveClass(/visible/);

    // Backward: close outline
    await page.locator('#outline-btn').click();
    await expect(page.locator('#outline-panel')).not.toHaveClass(/visible/);

    // Backward: light mode
    await page.locator('#theme-btn').click();
    const themeAttr = await page.locator('html').getAttribute('data-theme');
    expect(themeAttr === null || themeAttr === '').toBeTruthy();

    // Backward: close sidebar
    await page.keyboard.press('Control+b');
    await expect(page.locator('#sidebar')).not.toHaveClass(/visible/);
  });
});

// ─────────────────────────────────────────────────────────
// FLOW 3: Search with match navigation
// ─────────────────────────────────────────────────────────
test.describe('Flow 3: Search with match navigation', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('open search, type query, navigate matches, close', async () => {
    ({ app, page } = await launchApp([SAMPLE_MD]));
    await waitForContent(page);

    // Open search
    await page.keyboard.press('Control+f');
    await expect(page.locator('#search-bar')).toHaveClass(/visible/);

    // Type search term
    await page.locator('#search-input').fill('markdown');

    // Wait for search results to appear
    await expect(page.locator('#search-count')).not.toHaveText('', { timeout: 5000 });

    // Navigate next (Enter)
    await page.locator('#search-input').press('Enter');

    // Navigate next again
    await page.locator('#search-input').press('Enter');

    // Backward: navigate prev (Shift+Enter)
    await page.locator('#search-input').press('Shift+Enter');

    // Backward: navigate prev again
    await page.locator('#search-input').press('Shift+Enter');

    // Close search
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-bar')).not.toHaveClass(/visible/);
  });
});

// ─────────────────────────────────────────────────────────
// FLOW 4: Tab close and reopen
// ─────────────────────────────────────────────────────────
test.describe('Flow 4: Tab close and reopen', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('close tab with Ctrl+W, reopen with Ctrl+Shift+T', async () => {
    ({ app, page } = await launchApp([SAMPLE_MD]));
    await waitForContent(page);

    // Verify tab exists with file name
    await expect(page.locator('.tab.active .tab-name')).toHaveText('sample.md');

    // Close tab
    await page.keyboard.press('Control+w');
    // After closing last content tab, welcome should show
    await expect(page.locator('#welcome')).toBeVisible({ timeout: 5000 });

    // Reopen closed tab
    await page.keyboard.press('Control+Shift+t');
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('sample.md');
  });
});

// ─────────────────────────────────────────────────────────
// FLOW 6: Full kitchen sink — all features forward + backward
// ─────────────────────────────────────────────────────────
test.describe('Flow 6: Full kitchen sink', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('stack every feature, then undo in reverse', async () => {
    ({ app, page } = await launchApp([SAMPLE_MD]));
    await waitForContent(page);

    // Forward: open sidebar
    await page.keyboard.press('Control+b');
    await expect(page.locator('#sidebar')).toHaveClass(/visible/);

    // Forward: dark mode
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Forward: zoom in twice
    await page.keyboard.press('Control+=');
    await page.keyboard.press('Control+=');

    // Forward: open outline
    await page.locator('#outline-btn').click();
    await expect(page.locator('#outline-panel')).toHaveClass(/visible/);

    // Forward: open search and type
    await page.keyboard.press('Control+f');
    await expect(page.locator('#search-bar')).toHaveClass(/visible/);
    await page.locator('#search-input').fill('code');

    // Backward: close search
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-bar')).not.toHaveClass(/visible/);

    // Backward: close outline
    await page.locator('#outline-btn').click();
    await expect(page.locator('#outline-panel')).not.toHaveClass(/visible/);

    // Backward: reset zoom
    await page.keyboard.press('Control+0');

    // Backward: light mode
    await page.locator('#theme-btn').click();
    const themeAttr = await page.locator('html').getAttribute('data-theme');
    expect(themeAttr === null || themeAttr === '').toBeTruthy();

    // Backward: close sidebar
    await page.keyboard.press('Control+b');
    await expect(page.locator('#sidebar')).not.toHaveClass(/visible/);
  });
});

// ─────────────────────────────────────────────────────────
// FLOW 7: Dotfile project file
// ─────────────────────────────────────────────────────────
test.describe('Flow 7: Dotfile project file', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('open dotfile plan, toggle dark, close tab, reopen, restore light', async () => {
    const planFile = path.join(TEST_PROJECT, '.claude', 'plans', 'auth-plan.md');
    ({ app, page } = await launchApp([planFile]));
    await waitForContent(page);

    // Verify the file rendered
    await expect(page.locator('.tab.active .tab-name')).toHaveText('auth-plan.md');

    // Dark mode
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Close tab
    await page.keyboard.press('Control+w');
    await expect(page.locator('#welcome')).toBeVisible({ timeout: 5000 });

    // Reopen
    await page.keyboard.press('Control+Shift+t');
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('auth-plan.md');

    // Back to light
    await page.locator('#theme-btn').click();
    const themeAttr = await page.locator('html').getAttribute('data-theme');
    expect(themeAttr === null || themeAttr === '').toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────
// FLOW 8: Zoom cycle
// ─────────────────────────────────────────────────────────
test.describe('Flow 8: Zoom in/out cycle', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('zoom in 3 times, zoom out 3 times, reset', async () => {
    ({ app, page } = await launchApp([SAMPLE_MD]));
    await waitForContent(page);

    // Status bar must be visible for zoom buttons
    await expect(page.locator('#zoom-level')).toHaveText('100%');

    // Zoom in 3x using buttons (keyboard shortcuts go to Electron's native zoom)
    await page.locator('#zoom-in').click();
    await expect(page.locator('#zoom-level')).toHaveText('110%');

    await page.locator('#zoom-in').click();
    await expect(page.locator('#zoom-level')).toHaveText('120%');

    await page.locator('#zoom-in').click();
    await expect(page.locator('#zoom-level')).toHaveText('130%');

    // Backward: zoom out 3x
    await page.locator('#zoom-out').click();
    await expect(page.locator('#zoom-level')).toHaveText('120%');

    await page.locator('#zoom-out').click();
    await expect(page.locator('#zoom-level')).toHaveText('110%');

    await page.locator('#zoom-out').click();
    await expect(page.locator('#zoom-level')).toHaveText('100%');
  });
});
