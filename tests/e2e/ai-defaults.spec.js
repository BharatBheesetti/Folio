const { test, expect } = require('@playwright/test');
const { launchApp, FIXTURES } = require('./helpers');
const path = require('path');
const fs = require('fs');
const os = require('os');

const AI_PROJECT = path.join(FIXTURES, 'ai-project');

// Launch app with --folder pointing to a directory
async function launchWithFolder(folderPath) {
  return launchApp(['--folder', folderPath]);
}

// Wait for sidebar file tree to contain a specific filename
async function waitForTreeFile(page, filename, timeout = 10000) {
  await expect(page.locator('#file-tree .tree-name', { hasText: filename })).toBeVisible({ timeout });
}

// Create a temp directory with specific files for isolated tests
function createTempFixture(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-ai-'));
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

// -------------------------------------------------------
// TEST 1: CLAUDE.md gets AI badge
// -------------------------------------------------------
test.describe('AI badge: CLAUDE.md', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('CLAUDE.md shows AI badge in sidebar', async () => {
    tmpDir = createTempFixture({ 'CLAUDE.md': '# CLAUDE\nConfig', 'readme.md': '# Readme' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'CLAUDE.md');

    // Find the tree item for CLAUDE.md and check for badge
    const claudeItem = page.locator('#file-tree .tree-item', { has: page.locator('.tree-name', { hasText: 'CLAUDE.md' }) });
    const badge = claudeItem.locator('.ai-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('AI');
  });
});

// -------------------------------------------------------
// TEST 2: .cursorrules gets AI badge
// -------------------------------------------------------
test.describe('AI badge: .cursorrules', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('.cursorrules shows AI badge in sidebar', async () => {
    tmpDir = createTempFixture({ '.cursorrules': 'rules here', 'notes.md': '# Notes' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, '.cursorrules');

    const cursorItem = page.locator('#file-tree .tree-item', { has: page.locator('.tree-name', { hasText: '.cursorrules' }) });
    const badge = cursorItem.locator('.ai-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('AI');
  });
});

// -------------------------------------------------------
// TEST 3: AI files sort to top
// -------------------------------------------------------
test.describe('AI sort priority', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('CLAUDE.md appears before alphabetically-earlier files', async () => {
    tmpDir = createTempFixture({ 'aaa.md': '# AAA', 'CLAUDE.md': '# Claude', 'zzz.md': '# ZZZ' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'CLAUDE.md');

    // Get all file names in order
    const names = await page.locator('#file-tree .tree-item[data-path] .tree-name').allTextContents();
    const claudeIdx = names.indexOf('CLAUDE.md');
    const aaaIdx = names.indexOf('aaa.md');
    const zzzIdx = names.indexOf('zzz.md');

    expect(claudeIdx).toBeLessThan(aaaIdx);
    expect(claudeIdx).toBeLessThan(zzzIdx);
  });
});

// -------------------------------------------------------
// TEST 4: Multiple AI files all badged
// -------------------------------------------------------
test.describe('AI badge: multiple AI files', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('CLAUDE.md and .cursorrules both get badges', async () => {
    tmpDir = createTempFixture({ 'CLAUDE.md': '# Claude', '.cursorrules': 'rules', 'notes.md': '# Notes' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'CLAUDE.md');
    await waitForTreeFile(page, '.cursorrules');

    const badges = page.locator('#file-tree .ai-badge');
    await expect(badges).toHaveCount(2);
  });
});

// -------------------------------------------------------
// TEST 5: No AI files -- no badges
// -------------------------------------------------------
test.describe('AI badge: no AI files present', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('folder with only regular .md files shows no badges', async () => {
    tmpDir = createTempFixture({ 'readme.md': '# Readme', 'notes.md': '# Notes' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'readme.md');
    await waitForTreeFile(page, 'notes.md');

    const badges = page.locator('#file-tree .ai-badge');
    await expect(badges).toHaveCount(0);
  });
});

// -------------------------------------------------------
// TEST 6: Badge visible in dark theme
// -------------------------------------------------------
test.describe('AI badge: dark theme', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('badge stays visible after switching to dark mode', async () => {
    tmpDir = createTempFixture({ 'CLAUDE.md': '# Claude', 'readme.md': '# Readme' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'CLAUDE.md');

    // Switch to dark mode
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Badge still visible
    const badge = page.locator('#file-tree .ai-badge').first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('AI');
  });
});

// -------------------------------------------------------
// TEST 7: Badge visible in light theme
// -------------------------------------------------------
test.describe('AI badge: light theme', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('badge visible in default light theme', async () => {
    tmpDir = createTempFixture({ 'CLAUDE.md': '# Claude', 'readme.md': '# Readme' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'CLAUDE.md');

    const badge = page.locator('#file-tree .ai-badge').first();
    await expect(badge).toBeVisible();
  });
});

// -------------------------------------------------------
// TEST 8: Nested AI file detected (copilot-instructions.md)
// -------------------------------------------------------
test.describe('AI badge: nested copilot-instructions.md', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('.github/copilot-instructions.md gets AI badge', async () => {
    tmpDir = createTempFixture({
      '.github/copilot-instructions.md': '# Copilot Instructions',
      'readme.md': '# Readme',
    });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    // .github folder auto-expands (dot-prefixed folders auto-expand)
    await waitForTreeFile(page, 'copilot-instructions.md');

    const copilotItem = page.locator('#file-tree .tree-item', { has: page.locator('.tree-name', { hasText: 'copilot-instructions.md' }) });
    const badge = copilotItem.locator('.ai-badge');
    await expect(badge).toBeVisible();
  });
});

// -------------------------------------------------------
// TEST 9: Sort priority only within same directory
// -------------------------------------------------------
test.describe('AI sort: scoped to directory level', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('AI file in subfolder does not sort to root level', async () => {
    tmpDir = createTempFixture({
      'aaa.md': '# AAA',
      'sub/CLAUDE.md': '# Claude in sub',
      'sub/zzz.md': '# ZZZ',
    });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'aaa.md');

    // Get all top-level items: direct children of #file-tree that are file items (not folder containers)
    // Files at root are direct .tree-item[data-path] children of #file-tree
    const allRootFileNames = await page.evaluate(() => {
      const tree = document.getElementById('file-tree');
      const names = [];
      for (const child of tree.children) {
        // Direct file items (not folder containers which have .tree-item + .tree-children)
        if (child.classList.contains('tree-item') && child.dataset.path) {
          names.push(child.querySelector('.tree-name').textContent);
        }
      }
      return names;
    });

    // aaa.md should be the only root-level file
    expect(allRootFileNames).toEqual(['aaa.md']);

    // Expand the subfolder and verify CLAUDE.md sorts before zzz.md within it
    const folderItem = page.locator('#file-tree .tree-item[data-folder-path]').first();
    await folderItem.click();
    await waitForTreeFile(page, 'CLAUDE.md');

    // Inside the subfolder, CLAUDE.md (AI) should be before zzz.md
    const subNames = await page.evaluate(() => {
      const children = document.querySelector('#file-tree .tree-children.open');
      if (!children) return [];
      return Array.from(children.querySelectorAll('.tree-item[data-path] .tree-name'))
        .map(el => el.textContent);
    });
    expect(subNames.indexOf('CLAUDE.md')).toBeLessThan(subNames.indexOf('zzz.md'));
  });
});

// -------------------------------------------------------
// TEST 10: AI badge has correct CSS class
// -------------------------------------------------------
test.describe('AI badge: CSS class', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('badge element uses .ai-badge class', async () => {
    tmpDir = createTempFixture({ 'CLAUDE.md': '# Claude', 'readme.md': '# Readme' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'CLAUDE.md');

    // Verify badge has the correct class
    const badge = page.locator('#file-tree .ai-badge');
    await expect(badge).toHaveCount(1);
    // Verify it's a span with class ai-badge
    const tagName = await badge.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('span');
  });
});

// -------------------------------------------------------
// TEST 11: Non-markdown AI files detected and shown
// -------------------------------------------------------
test.describe('AI badge: non-markdown AI file', () => {
  let app, page, tmpDir;
  test.afterEach(async () => { if (app) { await app.close(); app = null; } if (tmpDir) cleanupFixture(tmpDir); });

  test('.cursorrules (no .md extension) appears in tree with badge', async () => {
    tmpDir = createTempFixture({ '.cursorrules': 'Some rules', 'readme.md': '# Readme' });
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    // .cursorrules should appear even though it's not a .md file
    await waitForTreeFile(page, '.cursorrules');

    // And it should have a badge
    const item = page.locator('#file-tree .tree-item', { has: page.locator('.tree-name', { hasText: '.cursorrules' }) });
    await expect(item.locator('.ai-badge')).toBeVisible();
  });
});
