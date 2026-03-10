/**
 * Folio User Flow Tests
 *
 * Tests actual multi-step user journeys, walking forward through
 * a sequence of actions, then backwards undoing each step.
 *
 * Run: DISPLAY=:99 node tests/screenshot-tests.js
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const SAMPLE_MD = path.join(FIXTURES_DIR, 'sample.md');
const TEST_PROJECT = path.join(FIXTURES_DIR, 'test-project');
const ELECTRON = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
const MAIN_JS = path.join(__dirname, '..', 'main.js');

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let electronProc = null;
let passed = 0;
let failed = 0;
const results = [];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function screenshot(name) {
  const filepath = path.join(SCREENSHOT_DIR, name);
  try {
    execSync(`import -window root ${filepath}`, { timeout: 5000 });
    console.log(`    📸 ${name}`);
    return true;
  } catch (e) {
    console.log(`    ⚠️  Screenshot failed: ${name}`);
    return false;
  }
}

function xdotool(cmd) {
  try {
    return execSync(`xdotool ${cmd}`, { timeout: 5000, encoding: 'utf-8' }).trim();
  } catch (e) {
    return null;
  }
}

function sendKey(key) {
  xdotool(`key ${key}`);
}

function type(text) {
  xdotool(`type --delay 50 "${text}"`);
}

let winX = 0, winY = 0, winW = 900, winH = 720;

function click(x, y) {
  const sx = winX + x;
  const sy = winY + y;
  xdotool(`mousemove ${sx} ${sy} click 1`);
}

// Button positions in tab bar (window-relative, 48px tab bar height)
// Right-to-left: settings(744,24), theme(708,24), outline(676,24), +(644,24), sidebar(612,24)
const BTN = {
  theme:    { x: 708, y: 24 },
  outline:  { x: 676, y: 24 },
  settings: { x: 744, y: 24 },
  sidebar:  { x: 612, y: 24 },
  newTab:   { x: 644, y: 24 },
};

async function launchApp(args = []) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, FOLIO_TEST: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' };
    electronProc = spawn(ELECTRON, [MAIN_JS, '--no-sandbox', ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    electronProc.on('error', reject);

    let attempts = 0;
    const check = setInterval(() => {
      attempts++;
      const wid = xdotool('search --name "Folio" 2>/dev/null');
      if (wid) {
        clearInterval(check);
        const firstWid = wid.split('\n')[0];
        xdotool(`windowactivate ${firstWid}`);
        const geo = xdotool(`getwindowgeometry ${firstWid}`);
        if (geo) {
          const posMatch = geo.match(/Position:\s+(\d+),(\d+)/);
          const sizeMatch = geo.match(/Geometry:\s+(\d+)x(\d+)/);
          if (posMatch) { winX = parseInt(posMatch[1]); winY = parseInt(posMatch[2]); }
          if (sizeMatch) { winW = parseInt(sizeMatch[1]); winH = parseInt(sizeMatch[2]); }
          console.log(`    Window: ${winW}x${winH} at (${winX},${winY})`);
        }
        resolve(firstWid);
      } else if (attempts > 30) {
        clearInterval(check);
        reject(new Error('Window did not appear in 15s'));
      }
    }, 500);
  });
}

function killApp() {
  if (electronProc) {
    electronProc.kill('SIGTERM');
    electronProc = null;
  }
  try { execSync('pkill -f "electron.*main.js" 2>/dev/null'); } catch {}
}

async function test(name, fn) {
  process.stdout.write(`\n▶ ${name}\n`);
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ PASS`);
  } catch (e) {
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    console.log(`  ❌ FAIL: ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function step(label) {
  console.log(`    → ${label}`);
}

// ============================================================
// USER FLOW TESTS
// ============================================================

async function runTests() {
  console.log('═══════════════════════════════════════════');
  console.log(' Folio User Flow Tests');
  console.log('═══════════════════════════════════════════');

  // ─────────────────────────────────────────────────────────
  // FLOW 1: Reader customization — forward then backwards
  //   open file → dark mode → zoom in → open outline → open search
  //   → close search → close outline → zoom reset → light mode
  // ─────────────────────────────────────────────────────────
  await test('Flow 1: Reader customization (forward + backward)', async () => {
    // Kill any stale processes from prior runs
    killApp();
    await sleep(1000);
    const wid = await launchApp([SAMPLE_MD]);
    await sleep(2500);
    assert(wid, 'Window should exist');

    // -- Forward --
    step('1. File opened in light mode');
    screenshot('flow1-01-file-opened-light.png');

    step('2. Switch to dark mode');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(600);
    screenshot('flow1-02-dark-mode.png');

    step('3. Zoom in twice');
    sendKey('ctrl+plus');
    await sleep(300);
    sendKey('ctrl+plus');
    await sleep(300);
    screenshot('flow1-03-zoomed-in-dark.png');

    step('4. Open outline panel');
    click(BTN.outline.x, BTN.outline.y);
    await sleep(500);
    screenshot('flow1-04-outline-open-zoomed-dark.png');

    step('5. Open search, type query');
    sendKey('ctrl+f');
    await sleep(400);
    type('Folio');
    await sleep(500);
    screenshot('flow1-05-search-active-outline-zoomed-dark.png');

    // -- Backward --
    step('6. Close search (backwards step 1)');
    sendKey('Escape');
    await sleep(400);
    screenshot('flow1-06-search-closed.png');

    step('7. Close outline (backwards step 2)');
    click(BTN.outline.x, BTN.outline.y);
    await sleep(400);
    screenshot('flow1-07-outline-closed.png');

    step('8. Reset zoom (backwards step 3)');
    sendKey('ctrl+0');
    await sleep(400);
    screenshot('flow1-08-zoom-reset.png');

    step('9. Switch back to light mode (backwards step 4)');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(500);
    screenshot('flow1-09-back-to-light.png');
  });

  // ─────────────────────────────────────────────────────────
  // FLOW 2: Sidebar + file browsing — forward then backwards
  //   open file → open sidebar → (see empty state) → close sidebar
  //   → reopen sidebar → close sidebar
  // ─────────────────────────────────────────────────────────
  await test('Flow 2: Sidebar navigation (forward + backward)', async () => {
    // App still running from Flow 1

    step('1. Starting state: file open, no sidebar');
    screenshot('flow2-01-start.png');

    step('2. Open sidebar with Ctrl+B');
    sendKey('ctrl+b');
    await sleep(500);
    screenshot('flow2-02-sidebar-open.png');

    step('3. Toggle dark mode while sidebar is open');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(500);
    screenshot('flow2-03-sidebar-dark.png');

    step('4. Open outline while sidebar is still open');
    click(BTN.outline.x, BTN.outline.y);
    await sleep(500);
    screenshot('flow2-04-sidebar-outline-dark.png');

    // -- Backward --
    step('5. Close outline (backwards step 1)');
    click(BTN.outline.x, BTN.outline.y);
    await sleep(400);
    screenshot('flow2-05-outline-closed.png');

    step('6. Switch back to light mode (backwards step 2)');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(500);
    screenshot('flow2-06-sidebar-light.png');

    step('7. Close sidebar (backwards step 3)');
    sendKey('ctrl+b');
    await sleep(400);
    screenshot('flow2-07-sidebar-closed.png');
  });

  // ─────────────────────────────────────────────────────────
  // FLOW 3: Search with navigation — forward then backwards
  //   open search → type query → next match → next match → prev match → clear → close
  // ─────────────────────────────────────────────────────────
  await test('Flow 3: Search with match navigation (forward + backward)', async () => {
    step('1. Open search');
    sendKey('ctrl+f');
    await sleep(400);
    screenshot('flow3-01-search-bar-open.png');

    step('2. Type search term');
    type('markdown');
    await sleep(600);
    screenshot('flow3-02-search-typed.png');

    step('3. Navigate to next match (Enter)');
    sendKey('Return');
    await sleep(400);
    screenshot('flow3-03-next-match.png');

    step('4. Navigate to next match again');
    sendKey('Return');
    await sleep(400);
    screenshot('flow3-04-next-match-2.png');

    // -- Backward --
    step('5. Navigate backwards (Shift+Enter)');
    sendKey('shift+Return');
    await sleep(400);
    screenshot('flow3-05-prev-match.png');

    step('6. Navigate backwards again');
    sendKey('shift+Return');
    await sleep(400);
    screenshot('flow3-06-prev-match-2.png');

    step('7. Close search');
    sendKey('Escape');
    await sleep(400);
    screenshot('flow3-07-search-closed.png');
  });

  // ─────────────────────────────────────────────────────────
  // FLOW 4: Multi-tab + close/reopen — forward then backwards
  //   We need to restart to test multi-tab with a different file
  //   open file1 → Ctrl+W close it → Ctrl+Shift+T reopen
  // ─────────────────────────────────────────────────────────
  await test('Flow 4: Tab close and reopen (forward + backward)', async () => {
    step('1. File already open in tab');
    screenshot('flow4-01-file-in-tab.png');

    step('2. Close tab with Ctrl+W');
    sendKey('ctrl+w');
    await sleep(500);
    screenshot('flow4-02-tab-closed-welcome.png');

    step('3. Reopen closed tab with Ctrl+Shift+T');
    sendKey('ctrl+shift+t');
    await sleep(800);
    screenshot('flow4-03-tab-reopened.png');
  });

  // ─────────────────────────────────────────────────────────
  // FLOW 5: Settings modal interaction — forward then backwards
  //   open settings → interact → close → verify app returns to normal
  // ─────────────────────────────────────────────────────────
  await test('Flow 5: Settings modal (forward + backward)', async () => {
    step('1. Starting state');
    screenshot('flow5-01-start.png');

    step('2. Open settings modal');
    click(BTN.settings.x, BTN.settings.y);
    await sleep(500);
    screenshot('flow5-02-settings-open.png');

    step('3. Switch to dark mode while settings open');
    // Settings is a modal overlay — click theme button is behind it
    // Close settings first, toggle, reopen to test layering
    sendKey('Escape');
    await sleep(300);
    click(BTN.theme.x, BTN.theme.y);
    await sleep(400);
    screenshot('flow5-03-dark-mode.png');

    step('4. Reopen settings in dark mode');
    click(BTN.settings.x, BTN.settings.y);
    await sleep(500);
    screenshot('flow5-04-settings-dark.png');

    // -- Backward --
    step('5. Close settings (backwards step 1)');
    sendKey('Escape');
    await sleep(400);
    screenshot('flow5-05-settings-closed-dark.png');

    step('6. Switch back to light mode (backwards step 2)');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(500);
    screenshot('flow5-06-back-to-light.png');
  });

  // ─────────────────────────────────────────────────────────
  // FLOW 6: Full kitchen sink — forward through everything, then backwards
  //   open file → sidebar → dark mode → zoom in → outline → search → settings
  //   → close settings → close search → close outline → reset zoom → light mode → close sidebar
  // ─────────────────────────────────────────────────────────
  await test('Flow 6: Full kitchen sink (all features forward + backward)', async () => {
    killApp();
    await sleep(1000);
    const wid = await launchApp([SAMPLE_MD]);
    await sleep(2500);
    assert(wid, 'Window should exist');

    // -- Forward: stack every feature --
    step('1. File opened');
    screenshot('flow6-01-file-opened.png');

    step('2. Open sidebar');
    sendKey('ctrl+b');
    await sleep(500);
    screenshot('flow6-02-sidebar.png');

    step('3. Dark mode');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(500);
    screenshot('flow6-03-dark.png');

    step('4. Zoom in');
    sendKey('ctrl+plus');
    await sleep(300);
    sendKey('ctrl+plus');
    await sleep(300);
    screenshot('flow6-04-zoomed.png');

    step('5. Open outline');
    click(BTN.outline.x, BTN.outline.y);
    await sleep(500);
    screenshot('flow6-05-outline.png');

    step('6. Open search');
    sendKey('ctrl+f');
    await sleep(400);
    type('code');
    await sleep(500);
    screenshot('flow6-06-search.png');

    step('7. Peak state — everything open');
    screenshot('flow6-07-peak-everything-open.png');

    // -- Backward: undo every feature in reverse order --
    step('8. Close search (backward 1)');
    sendKey('Escape');
    await sleep(400);
    screenshot('flow6-08-no-search.png');

    step('9. Close outline (backward 2)');
    click(BTN.outline.x, BTN.outline.y);
    await sleep(400);
    screenshot('flow6-09-no-outline.png');

    step('10. Reset zoom (backward 3)');
    sendKey('ctrl+0');
    await sleep(400);
    screenshot('flow6-10-zoom-reset.png');

    step('11. Light mode (backward 4)');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(500);
    screenshot('flow6-11-light.png');

    step('12. Close sidebar (backward 5)');
    sendKey('ctrl+b');
    await sleep(400);
    screenshot('flow6-12-clean-state.png');

    step('13. Verify back to original state');
    screenshot('flow6-13-final-matches-start.png');
  });

  // ─────────────────────────────────────────────────────────
  // FLOW 7: Dotfile project navigation
  //   Launch with dotfile plan → verify renders → close tab → reopen
  // ─────────────────────────────────────────────────────────
  await test('Flow 7: Dotfile project file (open + close + reopen)', async () => {
    killApp();
    await sleep(1000);
    const planFile = path.join(TEST_PROJECT, '.claude', 'plans', 'auth-plan.md');
    const wid = await launchApp([planFile]);
    await sleep(2500);
    assert(wid, 'Window should exist');

    step('1. Dotfile plan opened');
    screenshot('flow7-01-dotfile-opened.png');

    step('2. Switch to dark mode');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(500);
    screenshot('flow7-02-dotfile-dark.png');

    step('3. Close tab');
    sendKey('ctrl+w');
    await sleep(500);
    screenshot('flow7-03-tab-closed.png');

    // -- Backward --
    step('4. Reopen closed tab');
    sendKey('ctrl+shift+t');
    await sleep(800);
    screenshot('flow7-04-tab-reopened.png');

    step('5. Back to light mode');
    click(BTN.theme.x, BTN.theme.y);
    await sleep(500);
    screenshot('flow7-05-back-light.png');
  });

  // ─────────────────────────────────────────────────────────
  // FLOW 8: Zoom cycle — zoom in multiple levels, then zoom out step-by-step
  // ─────────────────────────────────────────────────────────
  await test('Flow 8: Zoom in/out cycle (forward + backward)', async () => {
    step('1. Default zoom');
    sendKey('ctrl+0');
    await sleep(300);
    screenshot('flow8-01-default-zoom.png');

    step('2. Zoom in 1x');
    sendKey('ctrl+plus');
    await sleep(300);
    screenshot('flow8-02-zoom-110.png');

    step('3. Zoom in 2x');
    sendKey('ctrl+plus');
    await sleep(300);
    screenshot('flow8-03-zoom-120.png');

    step('4. Zoom in 3x');
    sendKey('ctrl+plus');
    await sleep(300);
    screenshot('flow8-04-zoom-130.png');

    // -- Backward --
    step('5. Zoom out 1x (backward)');
    sendKey('ctrl+minus');
    await sleep(300);
    screenshot('flow8-05-zoom-120-back.png');

    step('6. Zoom out 2x (backward)');
    sendKey('ctrl+minus');
    await sleep(300);
    screenshot('flow8-06-zoom-110-back.png');

    step('7. Zoom out 3x (backward)');
    sendKey('ctrl+minus');
    await sleep(300);
    screenshot('flow8-07-zoom-100-back.png');

    step('8. Reset to default');
    sendKey('ctrl+0');
    await sleep(300);
    screenshot('flow8-08-zoom-reset.png');
  });

  // ============================================================
  // CLEANUP & RESULTS
  // ============================================================
  killApp();

  console.log('\n═══════════════════════════════════════════');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
  }

  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
  const screenshots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'));
  console.log(`Total screenshots: ${screenshots.length}`);
  screenshots.forEach(s => console.log(`  📸 ${s}`));

  process.exit(failed > 0 ? 1 : 0);
}

// Handle cleanup on exit
process.on('SIGINT', () => { killApp(); process.exit(1); });
process.on('SIGTERM', () => { killApp(); process.exit(1); });
process.on('uncaughtException', (e) => { console.error('Uncaught:', e); killApp(); process.exit(1); });

runTests();
