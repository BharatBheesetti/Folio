/**
 * Generate Gumroad marketing images for Folio.
 * Usage: npx electron scripts/create-hero-gumroad.js
 *
 * Produces:
 *   screenshots/gumroad-cover.png   (1280x720 cover)
 *   screenshots/gumroad-thumb.png   (600x600 thumbnail)
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'screenshots');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function capture(win, name, width, height) {
  win.setSize(width, height);
  await sleep(300);
  const image = await win.capturePage();
  const filePath = path.join(OUT, name);
  fs.writeFileSync(filePath, image.toPNG());
  console.log(`  saved ${filePath}`);
}

function toDataURI(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}
const lightScreenshot = toDataURI(path.join(OUT, 'light.png'));
const darkScreenshot = toDataURI(path.join(OUT, 'dark.png'));
const codeScreenshot = toDataURI(path.join(OUT, 'code.png'));
const iconPath = toDataURI(path.join(__dirname, '..', 'build', 'icon.png'));

const coverHTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px; height: 720px;
    background: linear-gradient(135deg, #1C1917 0%, #292524 40%, #44403C 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .left {
    flex: 0 0 420px;
    padding: 0 50px 0 60px;
    color: white;
    z-index: 2;
  }
  .icon { width: 56px; height: 56px; margin-bottom: 18px; border-radius: 12px; }
  h1 {
    font-size: 52px; font-weight: 700;
    letter-spacing: -1.5px;
    margin-bottom: 12px;
    background: linear-gradient(135deg, #F59E0B, #FBBF24);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .tagline {
    font-size: 18px; color: #A8A29E;
    line-height: 1.5; margin-bottom: 24px;
  }
  .features {
    display: flex; flex-wrap: wrap; gap: 8px;
  }
  .tag {
    padding: 5px 12px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    color: #D6D3D1;
    font-size: 12px;
    white-space: nowrap;
  }
  .right {
    flex: 1;
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mockup {
    position: absolute;
    border-radius: 10px;
    box-shadow: 0 25px 80px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.3);
    overflow: hidden;
  }
  .mockup img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .m1 {
    width: 580px; height: 380px;
    top: 80px; right: -30px;
    z-index: 2;
  }
  .m2 {
    width: 440px; height: 290px;
    top: 280px; right: 120px;
    z-index: 3;
    border: 2px solid rgba(245,158,11,0.3);
  }
  .glow {
    position: absolute;
    width: 300px; height: 300px;
    background: radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%);
    top: 150px; right: 200px;
    z-index: 1;
  }
</style>
</head>
<body>
  <div class="left">
    <img class="icon" src="${iconPath}" />
    <h1>Folio</h1>
    <p class="tagline">The desktop reader for<br>AI-generated markdown.</p>
    <div class="features">
      <span class="tag">AI file badges</span>
      <span class="tag">Cross-file search</span>
      <span class="tag">Directory watcher</span>
      <span class="tag">Dark mode</span>
      <span class="tag">Tabs</span>
      <span class="tag">npx CLI</span>
    </div>
  </div>
  <div class="right">
    <div class="glow"></div>
    <div class="mockup m1"><img src="${lightScreenshot}" /></div>
    <div class="mockup m2"><img src="${codeScreenshot}" /></div>
  </div>
</body>
</html>`;

const thumbHTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 600px; height: 600px;
    background: linear-gradient(145deg, #1C1917 0%, #292524 50%, #44403C 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .icon { width: 72px; height: 72px; margin-bottom: 16px; border-radius: 14px; }
  h1 {
    font-size: 48px; font-weight: 700;
    letter-spacing: -1px;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #F59E0B, #FBBF24);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .tagline { font-size: 16px; color: #A8A29E; margin-bottom: 30px; }
  .mockup {
    width: 460px; height: 300px;
    border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    overflow: hidden;
  }
  .mockup img {
    display: block; width: 100%; height: 100%;
    object-fit: cover; object-position: top;
  }
</style>
</head>
<body>
  <img class="icon" src="${iconPath}" />
  <h1>Folio</h1>
  <p class="tagline">AI coding output reader</p>
  <div class="mockup"><img src="${lightScreenshot}" /></div>
</body>
</html>`;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const win = new BrowserWindow({
    width: 1280, height: 720,
    show: true,
    webPreferences: { offscreen: false },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders } });
  });

  // --- Cover (1280x720) ---
  console.log('Creating cover image...');
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(coverHTML));
  await sleep(1500);
  await capture(win, 'gumroad-cover.png', 1280, 720);

  // --- Thumbnail (600x600) ---
  console.log('Creating thumbnail...');
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(thumbHTML));
  await sleep(1500);
  await capture(win, 'gumroad-thumb.png', 600, 600);

  console.log('Done!');
  app.quit();
});
