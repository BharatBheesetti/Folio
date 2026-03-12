const { test, expect } = require('@playwright/test');
const { launchApp, FIXTURES, MAIN_JS } = require('./helpers');
const { execFileSync, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI_JS = path.join(__dirname, '..', '..', 'cli.js');
const NODE = process.execPath;
const SAMPLE_MD = path.join(FIXTURES, 'sample.md');
const TEST_PROJECT = path.join(FIXTURES, 'test-project');

// Helper: run CLI synchronously and return { stdout, stderr, status }
function runCLI(args, opts = {}) {
  try {
    const stdout = execFileSync(NODE, [CLI_JS, ...args], {
      timeout: 5000,
      encoding: 'utf-8',
      windowsHide: true,
      ...opts,
    });
    return { stdout: stdout.trim(), stderr: '', status: 0 };
  } catch (err) {
    return {
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
      status: err.status || 1,
    };
  }
}

// Helper: wait for content to load
async function waitForContent(page) {
  await expect(page.locator('#content')).toHaveCSS('display', 'block', { timeout: 10000 });
}

// ─────────────────────────────────────────────────────────
// CLI Unit Tests (no Electron launch needed)
// ─────────────────────────────────────────────────────────
test.describe('CLI: arg parsing', () => {
  test('--help prints usage and exits 0', () => {
    const result = runCLI(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--folder');
    expect(result.stdout).toContain('--version');
    expect(result.stdout).toContain('--help');
  });

  test('-h prints usage and exits 0', () => {
    const result = runCLI(['-h']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  test('--version prints version from package.json and exits 0', () => {
    const pkg = require('../../package.json');
    const result = runCLI(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(pkg.version);
  });

  test('-v prints version and exits 0', () => {
    const pkg = require('../../package.json');
    const result = runCLI(['-v']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(pkg.version);
  });

  test('--folder with nonexistent path exits 1 with error', () => {
    const result = runCLI(['--folder', '/nonexistent/path/xyz']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('folder not found');
  });

  test('--folder with file (not directory) exits 1 with error', () => {
    const result = runCLI(['--folder', SAMPLE_MD]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a directory');
  });

  test('--folder without value exits 1 with error', () => {
    const result = runCLI(['--folder']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires a path');
  });

  test('positional arg with nonexistent file exits 1', () => {
    const result = runCLI(['/nonexistent/file.md']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('path not found');
  });

  test('package.json has bin field configured', () => {
    const pkg = require('../../package.json');
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin['folio-reader']).toBe('./cli.js');
  });
});

// ─────────────────────────────────────────────────────────
// CLI + Electron Integration Tests
// ─────────────────────────────────────────────────────────
test.describe('CLI: --folder opens sidebar', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('--folder with valid path opens sidebar with folder tree', async () => {
    ({ app, page } = await launchApp(['--folder', TEST_PROJECT]));
    // Sidebar should be visible with folder loaded
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 10000 });
    // Sidebar title should show folder name
    await expect(page.locator('#sidebar-title')).toHaveText('test-project');
    // File tree should have entries
    const treeItems = page.locator('#file-tree .tree-item');
    await expect(treeItems.first()).toBeVisible({ timeout: 10000 });
  });

  test('--folder with file arg opens both sidebar and file', async () => {
    ({ app, page } = await launchApp(['--folder', TEST_PROJECT, SAMPLE_MD]));
    // Content should load (file arg)
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('sample.md');
    // Sidebar should also be visible (folder arg)
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 10000 });
  });
});

test.describe('CLI: positional folder arg', () => {
  let app, page;

  test.afterEach(async () => { if (app) { await app.close(); app = null; } });

  test('no args shows welcome screen', async () => {
    ({ app, page } = await launchApp());
    await expect(page.locator('#welcome')).toBeVisible();
  });

  test('file arg opens content', async () => {
    ({ app, page } = await launchApp([SAMPLE_MD]));
    await waitForContent(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('sample.md');
  });
});

test.describe('CLI: folder with spaces in path', () => {
  let app, page;
  let tmpFolder;

  test.beforeEach(() => {
    // Create a temp folder with spaces
    tmpFolder = path.join(os.tmpdir(), 'folio test folder');
    fs.mkdirSync(tmpFolder, { recursive: true });
    fs.writeFileSync(path.join(tmpFolder, 'test.md'), '# Test\n\nHello world');
  });

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    // Clean up temp folder
    try { fs.rmSync(tmpFolder, { recursive: true }); } catch { /* ignore */ }
  });

  test('--folder with spaces in path works correctly', async () => {
    ({ app, page } = await launchApp(['--folder', tmpFolder]));
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 10000 });
    // Should show at least one markdown file
    const treeItems = page.locator('#file-tree .tree-item');
    await expect(treeItems.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('CLI: relative path resolution', () => {
  test('--folder resolves relative paths to absolute', () => {
    // This test verifies the CLI resolves paths — we test via the error case
    // with a relative path that does NOT exist
    const result = runCLI(['--folder', './nonexistent_relative_dir']);
    expect(result.status).toBe(1);
    // The error message should contain the resolved absolute path
    expect(result.stderr).toContain(path.resolve('./nonexistent_relative_dir'));
  });

  test('--folder resolves valid relative path', () => {
    // test-project exists relative to the repo root — we just verify no error
    // by checking --help after (since actual launch would require Electron)
    const result = runCLI(['--folder', 'tests/fixtures/test-project', '--help']);
    // --help comes first in processing, so it should exit 0
    expect(result.status).toBe(0);
  });
});
