const { test, expect } = require('@playwright/test');
const { launchApp, FIXTURES } = require('./helpers');
const path = require('path');

// Helper: wait for content (use CSS display — aria-hidden interferes with toBeVisible in Playwright 1.58+)
async function waitForFileContent(page) {
  await expect(page.locator('#content')).toHaveCSS('display', 'block', { timeout: 10000 });
}

test.describe('Smoke tests', () => {
  let app, page;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
  });

  test('welcome screen shows on launch with no args', async () => {
    ({ app, page } = await launchApp());
    const welcome = page.locator('#welcome');
    await expect(welcome).toBeVisible();
    const title = await page.title();
    expect(title).toContain('Folio');
  });

  test('file arg opens content', async () => {
    const sampleMd = path.join(FIXTURES, 'sample.md');
    ({ app, page } = await launchApp([sampleMd]));
    await waitForFileContent(page);
    const welcome = page.locator('#welcome');
    await expect(welcome).toBeHidden();
  });

  test('theme toggle sets and removes data-theme', async () => {
    const sampleMd = path.join(FIXTURES, 'sample.md');
    ({ app, page } = await launchApp([sampleMd]));
    await waitForFileContent(page);

    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator('#theme-btn').click();
    const themeAttr = await page.locator('html').getAttribute('data-theme');
    expect(themeAttr === null || themeAttr === '').toBeTruthy();
  });

  test('sidebar toggle adds and removes visible class', async () => {
    const sampleMd = path.join(FIXTURES, 'sample.md');
    ({ app, page } = await launchApp([sampleMd]));
    await waitForFileContent(page);

    await page.locator('#sidebar-btn').click();
    await expect(page.locator('#sidebar')).toHaveClass(/visible/);

    await page.locator('#sidebar-btn').click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/visible/);
  });

  test('tab lifecycle: open, close, reopen', async () => {
    const sampleMd = path.join(FIXTURES, 'sample.md');
    ({ app, page } = await launchApp([sampleMd]));
    await waitForFileContent(page);

    await expect(page.locator('.tab.active .tab-name')).toHaveText('sample.md');

    await page.keyboard.press('Control+w');
    await expect(page.locator('#welcome')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Control+Shift+t');
    await waitForFileContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('sample.md');
  });
});
