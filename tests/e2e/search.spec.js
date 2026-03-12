const { test, expect } = require('@playwright/test');
const { launchApp, FIXTURES } = require('./helpers');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SAMPLE_MD = path.join(FIXTURES, 'sample.md');
const TEST_PROJECT = path.join(FIXTURES, 'test-project');

// Create a temp folder with known markdown content for cross-file search tests
function createSearchFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-search-'));
  fs.writeFileSync(path.join(tmpDir, 'alpha.md'), '# Alpha Document\n\nThis file contains unique-alpha-marker text.\nIt also has shared-marker content.\nLine five of alpha.');
  fs.writeFileSync(path.join(tmpDir, 'beta.md'), '# Beta Document\n\nThis file contains unique-beta-marker text.\nIt also has shared-marker content.\nAnother shared-marker line here.');
  fs.writeFileSync(path.join(tmpDir, 'gamma.md'), '# Gamma Document\n\nNo matching keywords here.\nJust some regular text.');
  const subDir = path.join(tmpDir, 'nested');
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, 'deep.md'), '# Deep File\n\nThis deep file has shared-marker too.\nAnd unique-deep-marker for testing.');
  return tmpDir;
}

function cleanupFixture(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Helper: launch app with --folder
async function launchWithFolder(tmpDir) {
  return launchApp(['--folder', tmpDir]);
}

// -------------------------------------------------------
// TEST 1: Ctrl+Shift+F opens cross-file search panel
// -------------------------------------------------------
test.describe('Cross-file search: open panel', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('Ctrl+Shift+F opens search panel with input focused', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    // Press Ctrl+Shift+F
    await page.keyboard.press('Control+Shift+f');

    // Panel should be visible
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);

    // Input should be focused
    const focused = await page.evaluate(() => document.activeElement.id);
    expect(focused).toBe('cfs-input');
  });
});

// -------------------------------------------------------
// TEST 2: Escape closes cross-file search panel
// -------------------------------------------------------
test.describe('Cross-file search: close panel', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('Escape closes the search panel', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    // Open panel
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);

    // Press Escape while input is focused
    await page.locator('#cfs-input').press('Escape');
    await expect(page.locator('#cross-file-search')).not.toHaveClass(/visible/);
  });
});

// -------------------------------------------------------
// TEST 3: Search finds matches across files
// -------------------------------------------------------
test.describe('Cross-file search: finds matches', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('typing query shows results grouped by file', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    await page.keyboard.press('Control+Shift+f');
    await page.locator('#cfs-input').fill('shared-marker');

    // Wait for results to appear
    await expect(page.locator('.cfs-file-group').first()).toBeVisible({ timeout: 5000 });

    // Should have multiple file groups (alpha, beta, and deep have shared-marker)
    const groupCount = await page.locator('.cfs-file-group').count();
    expect(groupCount).toBeGreaterThanOrEqual(2);
  });
});

// -------------------------------------------------------
// TEST 4: Click result opens file
// -------------------------------------------------------
test.describe('Cross-file search: click opens file', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('clicking a search result opens that file in a tab', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    await page.keyboard.press('Control+Shift+f');
    await page.locator('#cfs-input').fill('unique-alpha-marker');

    // Wait for results
    await expect(page.locator('.cfs-match').first()).toBeVisible({ timeout: 5000 });

    // Click the first match
    await page.locator('.cfs-match').first().click();

    // File should open in a tab
    await expect(page.locator('#content')).toHaveCSS('display', 'block', { timeout: 10000 });
    await expect(page.locator('.tab.active .tab-name')).toHaveText('alpha.md');
  });
});

// -------------------------------------------------------
// TEST 5: No results message
// -------------------------------------------------------
test.describe('Cross-file search: no results', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('searching for nonexistent text shows no results message', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    await page.keyboard.press('Control+Shift+f');
    await page.locator('#cfs-input').fill('zzz-nonexistent-text-zzz');

    // Wait for search to complete
    await expect(page.locator('#cfs-status')).toHaveText('No results', { timeout: 5000 });

    // Should show "No matches found" message
    await expect(page.locator('.cfs-empty')).toHaveText('No matches found');
  });
});

// -------------------------------------------------------
// TEST 6: Empty query shows no results
// -------------------------------------------------------
test.describe('Cross-file search: empty query', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('empty input shows no results', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    await page.keyboard.press('Control+Shift+f');

    // Input is empty — status and results should be empty
    const statusText = await page.locator('#cfs-status').textContent();
    expect(statusText).toBe('');

    const resultsCount = await page.locator('.cfs-file-group').count();
    expect(resultsCount).toBe(0);
  });
});

// -------------------------------------------------------
// TEST 7: Search updates on typing (debounced)
// -------------------------------------------------------
test.describe('Cross-file search: updates on typing', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('results update as query changes', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    await page.keyboard.press('Control+Shift+f');

    // Type first query
    await page.locator('#cfs-input').fill('unique-alpha-marker');
    await expect(page.locator('.cfs-file-group').first()).toBeVisible({ timeout: 5000 });
    const firstCount = await page.locator('.cfs-file-group').count();
    expect(firstCount).toBe(1); // Only alpha.md has unique-alpha-marker

    // Change query to find more results
    await page.locator('#cfs-input').fill('shared-marker');
    await expect(page.locator('#cfs-status')).not.toHaveText('No results', { timeout: 5000 });
    // Wait for multiple groups
    await page.waitForTimeout(500); // allow debounce to settle
    const secondCount = await page.locator('.cfs-file-group').count();
    expect(secondCount).toBeGreaterThan(firstCount);
  });
});

// -------------------------------------------------------
// TEST 8: Results grouped by file
// -------------------------------------------------------
test.describe('Cross-file search: grouped by file', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('results for same file are grouped under a file header', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    await page.keyboard.press('Control+Shift+f');
    // beta.md has "shared-marker" twice — should show as one group with 2 matches
    await page.locator('#cfs-input').fill('shared-marker');
    await expect(page.locator('.cfs-file-group').first()).toBeVisible({ timeout: 5000 });

    // Find the beta.md file header
    const betaHeader = page.locator('.cfs-file-header', { hasText: 'beta.md' });
    await expect(betaHeader).toBeVisible({ timeout: 5000 });

    // beta.md should have a match count of 2
    const matchCount = await betaHeader.locator('.cfs-match-count').textContent();
    expect(parseInt(matchCount)).toBe(2);
  });
});

// -------------------------------------------------------
// TEST 9: Match preview shows context with highlight
// -------------------------------------------------------
test.describe('Cross-file search: match preview', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('each result shows matching line with query highlighted', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    await page.keyboard.press('Control+Shift+f');
    await page.locator('#cfs-input').fill('unique-alpha-marker');
    await expect(page.locator('.cfs-match').first()).toBeVisible({ timeout: 5000 });

    // The match should contain a highlighted span
    const highlightEl = page.locator('.cfs-match .cfs-highlight').first();
    await expect(highlightEl).toBeVisible();
    const highlightText = await highlightEl.textContent();
    expect(highlightText.toLowerCase()).toContain('unique-alpha-marker');

    // The match should also show a line number
    const lineNum = page.locator('.cfs-match .cfs-line-num').first();
    await expect(lineNum).toBeVisible();
    const lineText = await lineNum.textContent();
    expect(parseInt(lineText)).toBeGreaterThan(0);
  });
});

// -------------------------------------------------------
// TEST 10: Ctrl+Shift+F when no folder open
// -------------------------------------------------------
test.describe('Cross-file search: no folder open', () => {
  let app, page;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
  });

  test('shows message when no folder is open', async () => {
    ({ app, page } = await launchApp());
    await expect(page.locator('#welcome')).toBeVisible();

    // Open cross-file search with no folder
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);

    // Should show "open folder first" message
    await expect(page.locator('.cfs-empty')).toHaveText('Open a folder first to search across files');
  });
});

// -------------------------------------------------------
// TEST 11: Ctrl+Shift+F doesn't conflict with Ctrl+F
// -------------------------------------------------------
test.describe('Cross-file search: no conflict with Ctrl+F', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('Ctrl+F and Ctrl+Shift+F work independently', async () => {
    tmpDir = createSearchFixture();
    const alphaFile = path.join(tmpDir, 'alpha.md');
    ({ app, page } = await launchApp([alphaFile, '--folder', tmpDir]));
    await expect(page.locator('#content')).toHaveCSS('display', 'block', { timeout: 10000 });

    // Open in-file search with Ctrl+F
    await page.keyboard.press('Control+f');
    await expect(page.locator('#search-bar')).toHaveClass(/visible/);
    // Cross-file search should NOT be open
    await expect(page.locator('#cross-file-search')).not.toHaveClass(/visible/);

    // Close in-file search
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-bar')).not.toHaveClass(/visible/);

    // Open cross-file search with Ctrl+Shift+F
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);
    // In-file search should NOT be open
    await expect(page.locator('#search-bar')).not.toHaveClass(/visible/);
  });
});

// -------------------------------------------------------
// TEST 12: Close panel clears results
// -------------------------------------------------------
test.describe('Cross-file search: close clears results', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('closing and reopening panel clears previous results', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    // Open and search
    await page.keyboard.press('Control+Shift+f');
    await page.locator('#cfs-input').fill('shared-marker');
    await expect(page.locator('.cfs-file-group').first()).toBeVisible({ timeout: 5000 });

    // Close panel
    await page.locator('#cfs-input').press('Escape');
    await expect(page.locator('#cross-file-search')).not.toHaveClass(/visible/);

    // Reopen — should be clean
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);

    // Input should be empty
    const inputValue = await page.locator('#cfs-input').inputValue();
    expect(inputValue).toBe('');

    // No results should be shown
    const groupCount = await page.locator('.cfs-file-group').count();
    expect(groupCount).toBe(0);
  });
});

// -------------------------------------------------------
// TEST 13: Result count displayed
// -------------------------------------------------------
test.describe('Cross-file search: result count', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('shows total number of matches found', async () => {
    tmpDir = createSearchFixture();
    ({ app, page } = await launchWithFolder(tmpDir));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    await page.keyboard.press('Control+Shift+f');
    await page.locator('#cfs-input').fill('shared-marker');

    // Wait for status to update with match count
    await expect(page.locator('#cfs-status')).toContainText('match', { timeout: 5000 });

    // Status should contain a number and "match" (e.g., "4 matches in 3 files")
    const statusText = await page.locator('#cfs-status').textContent();
    expect(statusText).toMatch(/\d+ match/);
    expect(statusText).toMatch(/\d+ file/);
  });
});
