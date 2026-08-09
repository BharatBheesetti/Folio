/**
 * Capture polished screenshots for the Folio README.
 *
 * Connects Playwright to Electron via CDP. The app launches with --folder
 * pointing at the ai-project fixture (which has CLAUDE.md, .cursorrules, etc).
 *
 * Usage: node scripts/take-readme-screenshots.js
 */

const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', '.bin', 'electron.cmd');
const MAIN = path.join(ROOT, 'main.js');
const AI_PROJECT = path.join(ROOT, 'tests', 'fixtures', 'ai-project');
const OUT = path.join(ROOT, 'screenshots');
const PORT = 9222;
const WIDTH = 1280;
const HEIGHT = 800;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  // Launch Electron with remote debugging
  console.log('Launching Electron...');
  const electronProc = spawn(ELECTRON, [
    MAIN,
    '--folder', AI_PROJECT,
    '--remote-debugging-port=' + PORT,
    '--no-sandbox',
  ], {
    env: { ...process.env, FOLIO_TEST: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: 'pipe',
    shell: true,
  });

  electronProc.stderr.on('data', d => {
    const s = d.toString();
    if (!s.includes('DevTools') && !s.includes('electron') && !s.includes('cache')) process.stderr.write(s);
  });

  // Wait for app to fully start and load folder
  await sleep(5000);

  // Connect Playwright to Electron via CDP
  console.log('Connecting Playwright via CDP...');
  const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];

  // Set viewport
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await sleep(1000);

  // Open the sidebar (the --folder flag should have loaded the tree)
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('visible')) {
      document.getElementById('sidebar-btn').click();
    }
  });
  await sleep(1000);

  // Check if file tree loaded
  const hasTree = await page.evaluate(() => {
    return document.querySelectorAll('.tree-item').length;
  });
  console.log(`File tree items: ${hasTree}`);

  if (hasTree === 0) {
    // Tree didn't load from --folder flag, try loading it manually via evaluate
    console.log('Tree empty, loading folder manually...');
    const folderPathForJS = AI_PROJECT.replace(/\\/g, '\\\\');
    await page.evaluate(async (fp) => {
      // Trigger folder scan and render
      const tree = await window.api.scanFolder(fp);
      if (!tree.error && tree.length > 0) {
        // Store folder path and trigger tree render
        localStorage.setItem('folio-folder', fp);
        // We need to reload to pick up the folder - but let's try the direct approach
        // Dispatch the open-folder event
      }
    }, AI_PROJECT);

    // Actually, let's just trigger the IPC event from renderer
    await page.evaluate((fp) => {
      // The renderer listens for 'open-folder' IPC, but we can simulate the folder loading
      // by calling the internal functions. Since they're in a closure, we need to use
      // the sidebar "Open Folder" button approach - or just set localStorage and reload
      localStorage.setItem('folio-folder', fp);
    }, AI_PROJECT);

    // Reload to let it pick up the folder from localStorage
    await page.reload();
    await sleep(3000);

    // Re-open sidebar
    await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar.classList.contains('visible')) {
        document.getElementById('sidebar-btn').click();
      }
    });
    await sleep(1500);
  }

  // Now click on README.md to open it
  console.log('Opening README.md...');
  let readmeClicked = false;
  const treeItems = await page.$$('.tree-item');
  for (const item of treeItems) {
    const dataPath = await item.getAttribute('data-path');
    if (dataPath && dataPath.includes('README.md')) {
      await item.click();
      readmeClicked = true;
      break;
    }
  }

  if (!readmeClicked) {
    console.log('Could not find README.md in tree, trying to load via api...');
    // Use the preload api to read and render the file
    const readmePath = path.join(AI_PROJECT, 'README.md');
    await page.evaluate(async (fp) => {
      const result = await window.api.readAndRender(fp);
      if (!result.error) {
        const content = document.getElementById('content');
        const welcome = document.getElementById('welcome');
        content.innerHTML = result.html;
        content.style.display = 'block';
        content.style.opacity = '1';
        welcome.style.display = 'none';
        document.title = result.name + ' — Folio';
      }
    }, readmePath);
  }

  await sleep(2000);

  // Ensure content is visible
  await page.evaluate(() => {
    const c = document.getElementById('content');
    if (c) { c.style.opacity = '1'; c.classList.remove('fade-in'); }
  });
  await sleep(500);

  // Verify content loaded
  const contentVisible = await page.evaluate(() => {
    const c = document.getElementById('content');
    return c && c.style.display !== 'none' && c.innerHTML.length > 100;
  });
  console.log(`Content loaded: ${contentVisible}`);

  // ---- SCREENSHOT 1: hero.png ----
  // Dark theme, sidebar visible with AI badges, README content
  console.log('\n1. Capturing hero.png (dark theme, sidebar, full app)...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    }
    // Ensure sidebar visible
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('visible')) {
      sidebar.classList.add('visible');
      document.body.classList.add('sidebar-open');
    }
    window.scrollTo(0, 0);
    // Also update titlebar colors for dark
    try { window.api.setTitlebarTheme(true); } catch(e) {}
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, 'hero.png'), type: 'png', timeout: 60000 });
  console.log('  saved hero.png');

  // ---- SCREENSHOT 2: sidebar.png ----
  // Cropped sidebar showing AI badges
  console.log('2. Capturing sidebar.png...');
  const sidebarEl = await page.$('#sidebar');
  if (sidebarEl) {
    await sidebarEl.screenshot({ path: path.join(OUT, 'sidebar.png'), type: 'png', timeout: 60000 });
    console.log('  saved sidebar.png');
  }

  // ---- SCREENSHOT 3: search.png ----
  // Cross-file search with grouped results
  console.log('3. Capturing search.png...');
  // Need currentFolder set for search to work
  await page.evaluate((fp) => {
    // Close sidebar, open cross-file search
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('visible')) {
      sidebar.classList.remove('visible');
      document.body.classList.remove('sidebar-open');
    }
    const cfsPanel = document.getElementById('cross-file-search');
    cfsPanel.classList.add('visible');
    document.body.classList.add('cross-search-open');
  }, AI_PROJECT);
  await sleep(500);

  // Type search query and trigger
  await page.fill('#cfs-input', 'TypeScript');
  await page.evaluate(async (fp) => {
    // Manually run the search since currentFolder might not be set
    const results = await window.api.searchInFolder(fp, 'TypeScript');
    const cfsStatus = document.getElementById('cfs-status');
    const cfsResults = document.getElementById('cfs-results');
    let totalMatches = 0;
    results.forEach(r => { totalMatches += r.matches.length; });
    cfsStatus.textContent = totalMatches + ' matches in ' + results.length + ' files';
    cfsResults.innerHTML = '';

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    for (const group of results) {
      const groupEl = document.createElement('div');
      groupEl.className = 'cfs-file-group';
      const header = document.createElement('div');
      header.className = 'cfs-file-header';
      header.innerHTML = '<span>' + escapeHtml(group.name) + '</span><span class="cfs-match-count">' + group.matches.length + '</span>';
      groupEl.appendChild(header);
      for (const match of group.matches) {
        const matchEl = document.createElement('div');
        matchEl.className = 'cfs-match';
        const escaped = escapeHtml(match.text);
        const lower = escaped.toLowerCase();
        const idx = lower.indexOf('typescript');
        let html = escaped;
        if (idx >= 0) {
          html = escaped.substring(0, idx) + '<span class="cfs-highlight">' + escaped.substring(idx, idx + 10) + '</span>' + escaped.substring(idx + 10);
        }
        matchEl.innerHTML = '<span class="cfs-line-num">' + match.line + '</span>' + html;
        groupEl.appendChild(matchEl);
      }
      cfsResults.appendChild(groupEl);
    }
  }, AI_PROJECT);
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'search.png'), type: 'png', timeout: 60000 });
  console.log('  saved search.png');

  // Close search
  await page.evaluate(() => {
    document.getElementById('cross-file-search').classList.remove('visible');
    document.body.classList.remove('cross-search-open');
  });
  await sleep(300);

  // ---- SCREENSHOT 4: dark.png ----
  // Dark mode with code block and syntax highlighting
  console.log('4. Capturing dark.png (code block visible)...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('visible')) {
      sidebar.classList.add('visible');
      document.body.classList.add('sidebar-open');
    }
    const firstPre = document.querySelector('#content pre');
    if (firstPre) firstPre.scrollIntoView({ block: 'center' });
  });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'dark.png'), type: 'png', timeout: 60000 });
  console.log('  saved dark.png');

  // ---- SCREENSHOT 5: light.png ----
  // Light mode, top of document
  console.log('5. Capturing light.png...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', '');
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
    try { window.api.setTitlebarTheme(false); } catch(e) {}
    window.scrollTo(0, 0);
  });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'light.png'), type: 'png', timeout: 60000 });
  console.log('  saved light.png');

  console.log('\nDone! All screenshots saved to screenshots/');
  await browser.close();
  electronProc.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
