const { _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MAIN_JS = path.join(__dirname, '..', '..', 'main.js');
const FIXTURES = path.join(__dirname, '..', 'fixtures');

async function launchApp(args = []) {
  // Use a fresh user-data-dir per launch so localStorage is always clean
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-test-'));
  const app = await electron.launch({
    args: [MAIN_JS, '--user-data-dir=' + tmpDir, ...args],
    env: { ...process.env, FOLIO_TEST: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

module.exports = { launchApp, FIXTURES, MAIN_JS };
