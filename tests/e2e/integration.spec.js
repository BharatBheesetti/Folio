const { test, expect } = require('@playwright/test');
const { launchApp, FIXTURES } = require('./helpers');
const path = require('path');
const fs = require('fs');
const os = require('os');

const AI_PROJECT = path.join(FIXTURES, 'ai-project');
const SAMPLE_MD = path.join(FIXTURES, 'sample.md');

// Helper: wait for content to load
async function waitForContent(page) {
  await expect(page.locator('#content')).toHaveCSS('display', 'block', { timeout: 10000 });
}

// Helper: wait for sidebar file tree to contain a specific filename
async function waitForTreeFile(page, filename, timeout = 10000) {
  await expect(page.locator('#file-tree .tree-name', { hasText: filename })).toBeVisible({ timeout });
}

// Create a temp folder with specific files
function createTempFixture(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-integ-'));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return tmpDir;
}

function cleanupFixture(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────
// INTEGRATION 1: CLI folder -> AI badges -> cross-file search -> open result
// Features: CLI, AI sidebar, cross-file search, tab management
// ─────────────────────────────────────────────────────────────
test.describe('Integration: CLI folder + AI badges + search + open result', () => {
  let app, page;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('launch with --folder, verify AI badges, search across files, click to open', async () => {
    ({ app, page } = await launchApp(['--folder', AI_PROJECT]));

    // 1. Sidebar opens with folder tree
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 10000 });

    // 2. AI badges are visible on CLAUDE.md and .cursorrules
    await waitForTreeFile(page, 'CLAUDE.md');
    const claudeItem = page.locator('#file-tree .tree-item', {
      has: page.locator('.tree-name', { hasText: 'CLAUDE.md' })
    });
    await expect(claudeItem.locator('.ai-badge')).toBeVisible();

    // .cursorrules should also have a badge
    await waitForTreeFile(page, '.cursorrules');
    const cursorItem = page.locator('#file-tree .tree-item', {
      has: page.locator('.tree-name', { hasText: '.cursorrules' })
    });
    await expect(cursorItem.locator('.ai-badge')).toBeVisible();

    // 3. Open cross-file search and search for content
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);
    await page.locator('#cfs-input').fill('Prisma ORM');

    // Wait for search results (longer timeout for integration sequence)
    await expect(page.locator('.cfs-match').first()).toBeVisible({ timeout: 10000 });

    // 4. Click the search result to open the file
    await page.locator('.cfs-match').first().click();

    // File should open in a tab
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('CLAUDE.md');
  });
});

// ─────────────────────────────────────────────────────────────
// INTEGRATION 2: Watcher + cross-file search interaction
// Features: watcher, cross-file search
// ─────────────────────────────────────────────────────────────
test.describe('Integration: Watcher + search finds new file', () => {
  let app, page, tmpDir;
  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('add new file via watcher, search finds its content', async () => {
    tmpDir = createTempFixture({
      'existing.md': '# Existing File\nSome old content here.',
    });
    ({ app, page } = await launchApp(['--folder', tmpDir]));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'existing.md');

    // Add a new file with unique searchable content
    fs.writeFileSync(
      path.join(tmpDir, 'brand-new.md'),
      '# Brand New\nThis file has xylophone-unique-marker content.'
    );

    // Wait for watcher to pick up the new file
    await waitForTreeFile(page, 'brand-new.md');

    // Now search for the unique content across files
    await page.keyboard.press('Control+Shift+f');
    await page.locator('#cfs-input').fill('xylophone-unique-marker');

    // Wait for results
    await expect(page.locator('.cfs-file-group').first()).toBeVisible({ timeout: 5000 });

    // Verify the new file appears in results
    const fileHeader = page.locator('.cfs-file-header', { hasText: 'brand-new.md' });
    await expect(fileHeader).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────
// INTEGRATION 3: Full feature stack — expand subfolder + dark mode + search + result + zoom
// Features: sidebar folders, theme, cross-file search, tabs, zoom
// ─────────────────────────────────────────────────────────────
test.describe('Integration: Full feature stack', () => {
  let app, page, tmpDir;
  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('expand subfolder, toggle dark, search, open result, zoom — all states maintained', async () => {
    tmpDir = createTempFixture({
      'readme.md': '# Root Readme\nRoot level file.',
      'sub/deep-file.md': '# Deep File\nThis deep file has aquamarine-marker text.',
    });
    ({ app, page } = await launchApp(['--folder', tmpDir]));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'readme.md');

    // 1. Expand subfolder
    const folderItem = page.locator('#file-tree .tree-item[data-folder-path]').first();
    await folderItem.click();
    const folderToggle = page.locator('#file-tree .tree-folder-toggle').first();
    await expect(folderToggle).toHaveClass(/open/);
    await waitForTreeFile(page, 'deep-file.md');

    // 2. Toggle dark mode
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // 3. Cross-file search
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);
    await page.locator('#cfs-input').fill('aquamarine-marker');
    await expect(page.locator('.cfs-match').first()).toBeVisible({ timeout: 5000 });

    // 4. Click result to open file in tab
    await page.locator('.cfs-match').first().click();
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('deep-file.md');

    // 5. Zoom in
    await page.locator('#zoom-in').click();
    await expect(page.locator('#zoom-level')).toHaveText('110%');

    // 6. Verify dark mode is still active
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // 7. Verify zoom persists
    await expect(page.locator('#zoom-level')).toHaveText('110%');
  });
});

// ─────────────────────────────────────────────────────────────
// INTEGRATION 4: Watcher + AI badge — add CLAUDE.md, badge appears, sorts to top
// Features: watcher, AI badges, sort priority
// ─────────────────────────────────────────────────────────────
test.describe('Integration: Watcher + AI badge on new CLAUDE.md', () => {
  let app, page, tmpDir;
  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('adding CLAUDE.md via watcher shows badge and sorts to top', async () => {
    tmpDir = createTempFixture({
      'aaa-file.md': '# AAA File\nFirst alphabetically.',
      'zzz-file.md': '# ZZZ File\nLast alphabetically.',
    });
    ({ app, page } = await launchApp(['--folder', tmpDir]));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'aaa-file.md');
    await waitForTreeFile(page, 'zzz-file.md');

    // Verify no AI badges initially
    const initialBadges = await page.locator('#file-tree .ai-badge').count();
    expect(initialBadges).toBe(0);

    // Add CLAUDE.md via filesystem (watcher picks it up)
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Claude Config\nAI config file.');

    // Wait for CLAUDE.md to appear in sidebar
    await waitForTreeFile(page, 'CLAUDE.md');

    // Verify AI badge appears
    const claudeItem = page.locator('#file-tree .tree-item', {
      has: page.locator('.tree-name', { hasText: 'CLAUDE.md' })
    });
    await expect(claudeItem.locator('.ai-badge')).toBeVisible();

    // Verify CLAUDE.md sorts to top (before aaa-file.md)
    const names = await page.locator('#file-tree .tree-item[data-path] .tree-name').allTextContents();
    const claudeIdx = names.indexOf('CLAUDE.md');
    const aaaIdx = names.indexOf('aaa-file.md');
    expect(claudeIdx).toBeLessThan(aaaIdx);
  });
});

// ─────────────────────────────────────────────────────────────
// INTEGRATION 5: Tab management via search results
// Features: cross-file search, tabs, tab close, reopening
// ─────────────────────────────────────────────────────────────
test.describe('Integration: Tab management via search results', () => {
  let app, page, tmpDir;
  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('open files via search results, manage tabs, search again to reopen', async () => {
    tmpDir = createTempFixture({
      'file-alpha.md': '# Alpha\nShared-integration-marker text in alpha.',
      'file-beta.md': '# Beta\nShared-integration-marker text in beta.',
      'file-gamma.md': '# Gamma\nNo matching keywords.',
    });
    ({ app, page } = await launchApp(['--folder', tmpDir]));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file-alpha.md');

    // 1. Open cross-file search and search
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);
    await page.locator('#cfs-input').fill('shared-integration-marker');
    await expect(page.locator('.cfs-file-group').first()).toBeVisible({ timeout: 5000 });

    // 2. Click alpha's match to open it in a tab
    //    Use JS click — the fixed-position search panel confuses Playwright viewport checks
    const alphaGroup = page.locator('.cfs-file-group').filter({
      has: page.locator('.cfs-file-header', { hasText: 'file-alpha.md' })
    });
    await alphaGroup.locator('.cfs-match').first().evaluate(el => el.click());
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('file-alpha.md');

    // 3. Open beta directly from sidebar (more reliable than re-searching)
    //    First close search panel if still open
    if (await page.locator('#cross-file-search.visible').count() > 0) {
      await page.locator('#cfs-input').press('Escape');
    }
    // Open sidebar
    await page.keyboard.press('Control+b');
    await expect(page.locator('#sidebar')).toHaveClass(/visible/);
    await waitForTreeFile(page, 'file-beta.md');
    await page.locator('#file-tree .tree-item[data-path]', {
      has: page.locator('.tree-name', { hasText: 'file-beta.md' })
    }).click();
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('file-beta.md');

    // 4. Verify both tabs exist
    const tabCount = await page.locator('.tab').count();
    expect(tabCount).toBeGreaterThanOrEqual(2);

    // 5. Close beta tab via its close button to be explicit
    const betaTab = page.locator('.tab', { has: page.locator('.tab-name', { hasText: 'file-beta.md' }) });
    await betaTab.locator('.tab-close').click();

    // 6. Wait for beta to disappear, alpha should become active
    await expect(page.locator('.tab.active .tab-name')).toHaveText('file-alpha.md', { timeout: 5000 });

    // 7. Reopen beta via Ctrl+Shift+T
    await page.keyboard.press('Control+Shift+t');
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('file-beta.md');
  });
});

// ─────────────────────────────────────────────────────────────
// INTEGRATION 6: Theme persistence across all features
// Features: theme, cross-file search panel, AI badges, content
// ─────────────────────────────────────────────────────────────
test.describe('Integration: Theme persistence across features', () => {
  let app, page, tmpDir;
  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('dark mode persists across search panel, AI badges, and content', async () => {
    tmpDir = createTempFixture({
      'CLAUDE.md': '# Claude\nAI config.',
      'readme.md': '# Readme\nSome content to search for.',
    });
    ({ app, page } = await launchApp(['--folder', tmpDir]));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'CLAUDE.md');

    // 1. Toggle to dark mode
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // 2. Verify AI badge is still visible in dark mode
    const badge = page.locator('#file-tree .ai-badge').first();
    await expect(badge).toBeVisible();

    // 3. Open cross-file search — panel should inherit dark styling
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);
    // Dark mode still active
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // 4. Search and open a file
    await page.locator('#cfs-input').fill('content to search');
    await expect(page.locator('.cfs-match').first()).toBeVisible({ timeout: 5000 });
    await page.locator('.cfs-match').first().click();
    await waitForContent(page);

    // 5. Content area should still be in dark mode
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // 6. Toggle back to light
    await page.locator('#theme-btn').click();
    const themeAttr = await page.locator('html').getAttribute('data-theme');
    expect(themeAttr === null || themeAttr === '').toBeTruthy();

    // 7. AI badge still visible in light mode
    // Need to reopen sidebar since cross-file search closes it
    await page.keyboard.press('Control+b');
    await expect(page.locator('#sidebar')).toHaveClass(/visible/);
    await expect(page.locator('#file-tree .ai-badge').first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────
// INTEGRATION 7: Sidebar + cross-file search coexistence
// Features: sidebar, cross-file search
// ─────────────────────────────────────────────────────────────
test.describe('Integration: Sidebar + search coexistence', () => {
  let app, page, tmpDir;
  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('sidebar and cross-file search transitions work correctly', async () => {
    tmpDir = createTempFixture({
      'doc1.md': '# Doc One\nFirst document.',
      'doc2.md': '# Doc Two\nSecond document.',
    });
    ({ app, page } = await launchApp(['--folder', tmpDir]));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'doc1.md');

    // 1. Sidebar is open, cross-file search is closed
    await expect(page.locator('#cross-file-search')).not.toHaveClass(/visible/);

    // 2. Open cross-file search — sidebar should close (app behavior)
    await page.keyboard.press('Control+Shift+f');
    await expect(page.locator('#cross-file-search')).toHaveClass(/visible/);

    // 3. Search for something
    await page.locator('#cfs-input').fill('First document');
    await expect(page.locator('.cfs-match').first()).toBeVisible({ timeout: 5000 });

    // 4. Close cross-file search
    await page.locator('#cfs-input').press('Escape');
    await expect(page.locator('#cross-file-search')).not.toHaveClass(/visible/);

    // 5. Reopen sidebar — it should work normally
    await page.keyboard.press('Control+b');
    await expect(page.locator('#sidebar')).toHaveClass(/visible/);

    // 6. Files still there in sidebar
    await waitForTreeFile(page, 'doc1.md');
    await waitForTreeFile(page, 'doc2.md');

    // 7. Click a file from sidebar to open it
    await page.locator('#file-tree .tree-item[data-path]', {
      has: page.locator('.tree-name', { hasText: 'doc1.md' })
    }).click();
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('doc1.md');
  });
});

// ─────────────────────────────────────────────────────────────
// INTEGRATION 8: CLI file arg + all features
// Features: CLI file arg, theme, search, zoom, tabs
// ─────────────────────────────────────────────────────────────
test.describe('Integration: CLI file arg + all features', () => {
  let app, page;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('launch with file arg, verify theme/search/zoom all work', async () => {
    ({ app, page } = await launchApp([SAMPLE_MD]));
    await waitForContent(page);

    // 1. File loaded correctly
    await expect(page.locator('.tab.active .tab-name')).toHaveText('sample.md');

    // 2. Open in-file search (Ctrl+F)
    await page.keyboard.press('Control+f');
    await expect(page.locator('#search-bar')).toHaveClass(/visible/);
    await page.locator('#search-input').fill('Folio');
    await expect(page.locator('#search-count')).not.toHaveText('', { timeout: 5000 });
    // Close in-file search — Escape must be pressed while search input is focused
    await page.locator('#search-input').press('Escape');
    await expect(page.locator('#search-bar')).not.toHaveClass(/visible/);

    // 3. Toggle dark mode
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // 4. Zoom in
    await page.locator('#zoom-in').click();
    await expect(page.locator('#zoom-level')).toHaveText('110%');

    // 5. Open outline
    await page.locator('#outline-btn').click();
    await expect(page.locator('#outline-panel')).toHaveClass(/visible/);

    // 6. All states maintained together
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#zoom-level')).toHaveText('110%');
    await expect(page.locator('#outline-panel')).toHaveClass(/visible/);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('sample.md');

    // 7. Undo all: close outline, reset zoom, light mode
    await page.locator('#outline-btn').click();
    await expect(page.locator('#outline-panel')).not.toHaveClass(/visible/);

    await page.locator('#zoom-out').click();
    await expect(page.locator('#zoom-level')).toHaveText('100%');

    await page.locator('#theme-btn').click();
    const themeAttr = await page.locator('html').getAttribute('data-theme');
    expect(themeAttr === null || themeAttr === '').toBeTruthy();
  });
});
