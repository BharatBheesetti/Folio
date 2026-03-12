const { test, expect } = require('@playwright/test');
const { launchApp, FIXTURES } = require('./helpers');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_PROJECT = path.join(FIXTURES, 'test-project');

// Create a fresh temp folder with markdown files for watcher tests
function createWatcherFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-watcher-'));
  // Create some initial markdown files
  fs.writeFileSync(path.join(tmpDir, 'file1.md'), '# File One\nContent one');
  fs.writeFileSync(path.join(tmpDir, 'file2.md'), '# File Two\nContent two');
  // Create a subfolder with a file
  const subDir = path.join(tmpDir, 'subfolder');
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, 'nested.md'), '# Nested\nNested content');
  return tmpDir;
}

function cleanupFixture(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

// Helper: launch app with --folder pointing to a temp dir
async function launchWithFolder(tmpDir) {
  return launchApp(['--folder', tmpDir]);
}

// Helper: wait for sidebar to show folder tree with specific file
async function waitForTreeFile(page, filename, timeout = 10000) {
  await expect(page.locator(`#file-tree .tree-name`, { hasText: filename })).toBeVisible({ timeout });
}

// Helper: wait for a file to disappear from the sidebar tree
async function waitForTreeFileGone(page, filename, timeout = 10000) {
  await expect(page.locator(`#file-tree .tree-name`, { hasText: filename })).toBeHidden({ timeout });
}

// Helper: count tree items (files only, not folders)
async function getFileCount(page) {
  return page.locator('#file-tree .tree-item[data-path]').count();
}

// -------------------------------------------------------
// TEST 1: New file appears in sidebar
// -------------------------------------------------------
test.describe('Watcher: new file appears', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('adding a .md file updates sidebar', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    // Wait for sidebar to load with initial files
    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');
    await waitForTreeFile(page, 'file2.md');

    const initialCount = await getFileCount(page);
    expect(initialCount).toBeGreaterThanOrEqual(2);

    // Add a new file to the watched directory
    fs.writeFileSync(path.join(tmpDir, 'new-file.md'), '# New File\nHello');

    // Wait for the sidebar to refresh and show the new file
    await waitForTreeFile(page, 'new-file.md');
    const updatedCount = await getFileCount(page);
    expect(updatedCount).toBe(initialCount + 1);
  });
});

// -------------------------------------------------------
// TEST 2: File deleted removes from sidebar
// -------------------------------------------------------
test.describe('Watcher: file deleted', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('removing a .md file updates sidebar', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');
    await waitForTreeFile(page, 'file2.md');

    const initialCount = await getFileCount(page);

    // Delete a file
    fs.unlinkSync(path.join(tmpDir, 'file2.md'));

    // Wait for the sidebar to refresh and remove the file
    await waitForTreeFileGone(page, 'file2.md');
    const updatedCount = await getFileCount(page);
    expect(updatedCount).toBe(initialCount - 1);
  });
});

// -------------------------------------------------------
// TEST 3: File renamed shows new name
// -------------------------------------------------------
test.describe('Watcher: file renamed', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('renaming a .md file updates sidebar', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');

    // Rename file
    fs.renameSync(path.join(tmpDir, 'file1.md'), path.join(tmpDir, 'renamed.md'));

    // Old name gone, new name appears
    await waitForTreeFileGone(page, 'file1.md');
    await waitForTreeFile(page, 'renamed.md');
  });
});

// -------------------------------------------------------
// TEST 4: Debounce — rapid changes produce single refresh
// -------------------------------------------------------
test.describe('Watcher: debounce', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('rapid successive changes result in correct final state', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');

    const initialCount = await getFileCount(page);

    // Rapid-fire: create 5 files in quick succession
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(tmpDir, `rapid-${i}.md`), `# Rapid ${i}`);
    }

    // Wait a bit for debounce to settle, then verify all 5 appear
    await waitForTreeFile(page, 'rapid-4.md', 15000);
    const finalCount = await getFileCount(page);
    expect(finalCount).toBe(initialCount + 5);
  });
});

// -------------------------------------------------------
// TEST 5: Expanded state preserved across refresh
// -------------------------------------------------------
test.describe('Watcher: expanded state preserved', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('expanded folder stays expanded after watcher refresh', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');

    // The subfolder should be visible as a folder toggle
    const folderToggle = page.locator('#file-tree .tree-folder-toggle').first();
    await expect(folderToggle).toBeVisible();

    // Expand the subfolder by clicking the folder item
    const folderItem = page.locator('#file-tree .tree-item[data-folder-path]').first();
    await folderItem.click();
    await expect(folderToggle).toHaveClass(/open/);

    // Verify nested file is visible
    await waitForTreeFile(page, 'nested.md');

    // Trigger a watcher refresh by adding a new file
    fs.writeFileSync(path.join(tmpDir, 'trigger.md'), '# Trigger');
    await waitForTreeFile(page, 'trigger.md');

    // Verify the subfolder is STILL expanded
    const toggleAfter = page.locator('#file-tree .tree-folder-toggle').first();
    await expect(toggleAfter).toHaveClass(/open/);
    // And nested file is still visible
    await waitForTreeFile(page, 'nested.md');
  });
});

// -------------------------------------------------------
// TEST 6: Nested file change
// -------------------------------------------------------
test.describe('Watcher: nested file change', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('adding file in subfolder updates sidebar, parent stays expanded', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });

    // Expand the subfolder
    const folderItem = page.locator('#file-tree .tree-item[data-folder-path]').first();
    await folderItem.click();
    const folderToggle = page.locator('#file-tree .tree-folder-toggle').first();
    await expect(folderToggle).toHaveClass(/open/);
    await waitForTreeFile(page, 'nested.md');

    // Add a new file inside the subfolder
    const subDir = path.join(tmpDir, 'subfolder');
    fs.writeFileSync(path.join(subDir, 'new-nested.md'), '# New Nested');

    // Wait for sidebar to show the new nested file
    await waitForTreeFile(page, 'new-nested.md');

    // Parent folder should still be expanded
    const toggleAfter = page.locator('#file-tree .tree-folder-toggle').first();
    await expect(toggleAfter).toHaveClass(/open/);
  });
});

// -------------------------------------------------------
// TEST 7: Watcher cleanup on folder change
// -------------------------------------------------------
test.describe('Watcher: cleanup on folder change', () => {
  let app, page, tmpDir1, tmpDir2;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir1) cleanupFixture(tmpDir1);
    if (tmpDir2) cleanupFixture(tmpDir2);
  });

  test('opening a new folder via IPC stops old watcher', async () => {
    tmpDir1 = createWatcherFixture();
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-watcher2-'));
    fs.writeFileSync(path.join(tmpDir2, 'other.md'), '# Other');

    ({ app, page } = await launchWithFolder(tmpDir1));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');

    // Switch to second folder via IPC (simulating folder open)
    await page.evaluate((folder) => {
      window.api.unwatchFolder('');
      window.api.watchFolder(folder);
    }, tmpDir2);

    // Use the electron evaluate to send the open-folder event
    const electronApp = app;
    await electronApp.evaluate(async ({ BrowserWindow }, folder) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.send('open-folder', folder);
    }, tmpDir2);

    // Wait for new folder to load
    await waitForTreeFile(page, 'other.md');

    // Now add a file to the OLD folder — it should NOT appear in sidebar
    fs.writeFileSync(path.join(tmpDir1, 'ghost.md'), '# Ghost');

    // Wait a moment for any potential watcher events
    await page.waitForTimeout(1000);

    // Verify ghost.md is NOT in the sidebar (old watcher should be stopped)
    const ghostItems = await page.locator('#file-tree .tree-name', { hasText: 'ghost.md' }).count();
    expect(ghostItems).toBe(0);

    // Verify other.md is still there
    await waitForTreeFile(page, 'other.md');
  });
});

// -------------------------------------------------------
// TEST 8: Non-markdown files ignored in tree (tree only shows .md)
// -------------------------------------------------------
test.describe('Watcher: non-markdown files', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('adding a .txt file does not add it to the sidebar tree', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');

    const initialCount = await getFileCount(page);

    // Add a non-markdown file — should trigger watcher but tree should filter it out
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'This is a text file');

    // Also add a .md file to confirm watcher is working
    fs.writeFileSync(path.join(tmpDir, 'confirm.md'), '# Confirm');

    // Wait for the md file to appear
    await waitForTreeFile(page, 'confirm.md');

    // The .txt file should not appear in the tree
    const txtItems = await page.locator('#file-tree .tree-name', { hasText: 'readme.txt' }).count();
    expect(txtItems).toBe(0);

    // Count should only increase by 1 (the .md file)
    const updatedCount = await getFileCount(page);
    expect(updatedCount).toBe(initialCount + 1);
  });
});

// -------------------------------------------------------
// TEST 9: Directory created with .md file
// -------------------------------------------------------
test.describe('Watcher: directory created', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('creating new subfolder with .md file appears in sidebar', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');

    // Count initial folder items (folders with toggle)
    const initialFolderCount = await page.locator('#file-tree .tree-folder-toggle').count();

    // Create a new subdirectory with a markdown file
    const newSubDir = path.join(tmpDir, 'new-folder');
    fs.mkdirSync(newSubDir);
    fs.writeFileSync(path.join(newSubDir, 'inside.md'), '# Inside');

    // Wait for the new folder to appear in the tree
    await expect(page.locator('#file-tree .tree-name', { hasText: 'new-folder' })).toBeVisible({ timeout: 10000 });

    // Verify the folder count increased
    const updatedFolderCount = await page.locator('#file-tree .tree-folder-toggle').count();
    expect(updatedFolderCount).toBe(initialFolderCount + 1);
  });
});

// -------------------------------------------------------
// TEST 10: Rapid file operations — create + delete
// -------------------------------------------------------
test.describe('Watcher: rapid create + delete', () => {
  let app, page, tmpDir;

  test.afterEach(async () => {
    if (app) { await app.close(); app = null; }
    if (tmpDir) cleanupFixture(tmpDir);
  });

  test('create then delete rapidly results in correct final state', async () => {
    tmpDir = createWatcherFixture();
    ({ app, page } = await launchWithFolder(tmpDir));

    await expect(page.locator('#sidebar')).toHaveClass(/visible/, { timeout: 5000 });
    await waitForTreeFile(page, 'file1.md');

    const initialCount = await getFileCount(page);

    // Create a file then immediately delete it
    const ephemeralPath = path.join(tmpDir, 'ephemeral.md');
    fs.writeFileSync(ephemeralPath, '# Ephemeral');
    fs.unlinkSync(ephemeralPath);

    // Also create a file that stays
    fs.writeFileSync(path.join(tmpDir, 'stays.md'), '# Stays');

    // Wait for the stable file to appear
    await waitForTreeFile(page, 'stays.md');

    // The ephemeral file should NOT be in the sidebar
    const ephemeralItems = await page.locator('#file-tree .tree-name', { hasText: 'ephemeral.md' }).count();
    expect(ephemeralItems).toBe(0);

    // Final count should be initialCount + 1 (only 'stays.md')
    const finalCount = await getFileCount(page);
    expect(finalCount).toBe(initialCount + 1);
  });
});
