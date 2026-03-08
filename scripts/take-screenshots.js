/**
 * Automated screenshot capture for Folio README.
 * Usage: npx electron scripts/take-screenshots.js
 *
 * Produces:
 *   screenshots/light.png
 *   screenshots/dark.png
 *   screenshots/outline.png
 *   screenshots/code.png
 */

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SAMPLE = path.join(__dirname, 'sample.md');
const OUT = path.join(__dirname, '..', 'screenshots');
const WIDTH = 1200;
const HEIGHT = 800;

// Reuse the main process markdown pipeline
const sanitizeHtml = require('sanitize-html');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return code;
    }
  })
);
marked.use({ gfm: true, breaks: false });

// Register the same IPC handlers the renderer expects
ipcMain.handle('read-and-render', async (event, filePath) => {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const dir = path.dirname(filePath);
  const name = path.basename(filePath);
  let html = marked.parse(content);
  html = sanitizeHtml(html, {
    allowedTags: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','blockquote','pre','code','em','strong','del','a','img','table','thead','tbody','tr','th','td','details','summary','mark','sup','input','span','div'],
    allowedAttributes: {
      '*': ['class','id'], a: ['href','title'], img: ['src','alt','title'],
      input: ['type','checked','disabled'], ol: ['start'],
      td: ['colspan','rowspan'], th: ['colspan','rowspan'], details: ['open'],
    },
    allowedSchemes: ['http','https','file','data'],
  });
  html = html.replace(
    /(<img\s+[^>]*src=")(?!https?:\/\/|data:|file:\/\/)([^"]+)(")/gi,
    (match, pre, src, post) => {
      const absPath = path.resolve(dir, src);
      if (!absPath.startsWith(dir)) return match;
      return `${pre}file:///${absPath.replace(/\\/g, '/')}${post}`;
    }
  );
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.ceil(wordCount / 225);
  return { html, name, path: filePath, wordCount, readingTime };
});

ipcMain.handle('open-file-dialog', async () => null);
ipcMain.handle('export-pdf', async () => null);
ipcMain.on('set-titlebar-theme', () => {});
ipcMain.on('open-external', () => {});
ipcMain.on('unwatch-file', () => {});
ipcMain.on('find-in-page', () => {});
ipcMain.on('stop-find', () => {});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function capture(win, name) {
  const image = await win.capturePage();
  const filePath = path.join(OUT, name);
  fs.writeFileSync(filePath, image.toPNG());
  console.log(`  saved ${filePath}`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: true,
    backgroundColor: '#FAF8F5',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Disable CSP for the screenshot session (we're local only)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders } });
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));

  await new Promise(resolve => win.webContents.once('did-finish-load', resolve));

  // Clear any stale theme from previous sessions, force light start
  await win.webContents.executeJavaScript(`
    localStorage.removeItem('folio-theme');
    localStorage.removeItem('folio-session');
    document.documentElement.setAttribute('data-theme', '');
  `);
  await sleep(800); // let fonts load

  // Open sample file
  win.webContents.send('open-file', SAMPLE);
  await sleep(2000); // generous wait for render + fade-in

  // Force content visible (in case fade-in didn't complete)
  await win.webContents.executeJavaScript(`
    const c = document.getElementById('content');
    c.style.opacity = '1';
    c.classList.remove('fade-in');
  `);
  await sleep(300);

  // --- 1. Light mode ---
  console.log('Capturing light mode...');
  await win.webContents.executeJavaScript(`
    document.documentElement.setAttribute('data-theme', '');
    window.scrollTo(0, 0);
  `);
  await sleep(500);
  await capture(win, 'light.png');

  // --- 2. Dark mode ---
  console.log('Capturing dark mode...');
  await win.webContents.executeJavaScript(`
    document.documentElement.setAttribute('data-theme', 'dark');
  `);
  await sleep(500);
  await capture(win, 'dark.png');

  // --- 3. Outline panel (dark mode) ---
  console.log('Capturing outline panel...');
  await win.webContents.executeJavaScript(`
    document.getElementById('outline-panel').classList.add('visible');
  `);
  await sleep(500);
  await capture(win, 'outline.png');
  await win.webContents.executeJavaScript(`
    document.getElementById('outline-panel').classList.remove('visible');
  `);
  await sleep(300);

  // --- 4. Code highlighting (light mode, scrolled to code) ---
  console.log('Capturing code highlighting...');
  await win.webContents.executeJavaScript(`
    document.documentElement.setAttribute('data-theme', '');
    const firstPre = document.querySelector('#content pre');
    if (firstPre) firstPre.scrollIntoView({ block: 'center' });
  `);
  await sleep(500);
  await capture(win, 'code.png');

  // --- 5. Hero (light mode, top of doc — referenced by README) ---
  console.log('Capturing hero...');
  await win.webContents.executeJavaScript(`window.scrollTo(0, 0)`);
  await sleep(400);
  await capture(win, 'hero.png');

  console.log('Done! All screenshots saved to screenshots/');
  app.quit();
});
