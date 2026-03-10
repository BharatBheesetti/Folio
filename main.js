const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mdx'];

// Auto-updater (only in packaged app)
if (app.isPackaged) {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    app.whenReady().then(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    });
  } catch {
    // electron-updater not available in dev
  }
}

function isMarkdownFile(fp) { return SUPPORTED_EXTENSIONS.includes(path.extname(fp).toLowerCase()); }
function findMarkdownArg(argv) {
  for (const arg of argv) {
    if (isMarkdownFile(arg)) {
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved)) return resolved;
    }
  }
  return null;
}

function diagnoseArgError(argv) {
  for (const arg of argv) {
    if (arg.startsWith('-')) continue; // skip flags
    if (!isMarkdownFile(arg)) {
      const ext = path.extname(arg);
      if (ext) return `Unsupported file type "${ext}".\nFolio supports: ${SUPPORTED_EXTENSIONS.join(', ')}`;
    } else if (!fs.existsSync(path.resolve(arg))) {
      return `File not found:\n${path.resolve(arg)}`;
    }
  }
  return null; // no file argument was provided
}

// HTML sanitization
const sanitizeHtml = require('sanitize-html');

// Markdown rendering
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return code;
    }
  })
);

marked.use({ gfm: true, breaks: false });

const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

let mainWindow;
let fileToOpen = null;
const fileWatchers = new Map(); // path -> { watcher }

// Check command line for .md file
const initialArgv = process.argv.slice(app.isPackaged ? 1 : 2);
fileToOpen = findMarkdownArg(initialArgv);
let startupArgError = !fileToOpen ? diagnoseArgError(initialArgv) : null;

// macOS: handle file open events (double-click, Open With, drag to dock icon)
if (isMac) {
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (!isMarkdownFile(filePath)) return;
    if (mainWindow) {
      mainWindow.webContents.send('open-file', filePath);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      // App not ready yet — store for when window is created
      fileToOpen = filePath;
    }
  });
}

// Single instance lock (skip in test mode)
const isTest = process.env.FOLIO_TEST === '1';
const gotLock = isTest ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const secondArgv = argv.slice(app.isPackaged ? 1 : 2);
    const filePath = findMarkdownArg(secondArgv);
    if (filePath) {
      mainWindow?.webContents.send('open-file', filePath);
    } else {
      const errMsg = diagnoseArgError(secondArgv);
      if (errMsg && mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Cannot open file',
          message: 'Cannot open file',
          detail: errMsg,
          buttons: ['OK'],
        });
      }
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function createWindow() {
    const windowOptions = {
      width: 900,
      height: 720,
      minWidth: 480,
      minHeight: 360,
      center: true,
      icon: path.join(__dirname, 'build', 'icon.png'),
      autoHideMenuBar: true,
      backgroundColor: '#FAF8F5',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: process.env.FOLIO_TEST ? true : false,
    };

    if (isMac) {
      windowOptions.titleBarStyle = 'hiddenInset';
      windowOptions.trafficLightPosition = { x: 16, y: 16 };
    } else if (isLinux) {
      // Linux: use default system title bar for best compatibility
    } else {
      // Windows: custom title bar overlay
      windowOptions.titleBarStyle = 'hidden';
      windowOptions.titleBarOverlay = {
        color: '#EEEBE6',
        symbolColor: '#78716C',
        height: 48,
      };
    }

    mainWindow = new BrowserWindow(windowOptions);

    mainWindow.loadFile('index.html');

    // Skip CSP in test mode (Playwright needs to inject scripts)
    if (!isTest) {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' file: data:; connect-src 'none'; frame-src 'none';"] } });
      });
    }

    // Deny all permission requests — Folio needs zero browser permissions
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(false);
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      if (fileToOpen) {
        mainWindow.webContents.send('open-file', fileToOpen);
      } else if (startupArgError) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Cannot open file',
          message: 'Cannot open file',
          detail: startupArgError,
          buttons: ['OK'],
        });
        startupArgError = null;
      }
    });

    mainWindow.webContents.on('found-in-page', (e, result) => {
      mainWindow.webContents.send('found-in-page', result);
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
      for (const { watcher } of fileWatchers.values()) watcher.close();
      fileWatchers.clear();
    });

    mainWindow.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('file://')) e.preventDefault();
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // Minimal menu for keyboard shortcuts (zoom, copy, etc.)
    const menu = Menu.buildFromTemplate([
      {
        label: 'Edit',
        submenu: [
          { role: 'copy' },
          { role: 'selectAll' },
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'resetZoom' },
          { type: 'separator' },
          ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
        ]
      }
    ]);
    Menu.setApplicationMenu(menu);
  }

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());

  // --- License ---

  const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');

  function readLicense() {
    try {
      return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'));
    } catch {
      return null;
    }
  }

  function writeLicense(data) {
    fs.mkdirSync(path.dirname(LICENSE_FILE), { recursive: true });
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
  }

  function getLicenseStatus() {
    const license = readLicense();
    if (license && license.activated) {
      return { status: 'activated', key: license.key };
    }
    // Trial logic
    if (!license) {
      writeLicense({ trialStart: Date.now(), activated: false });
      return { status: 'trial', daysLeft: 14 };
    }
    const elapsed = Date.now() - (license.trialStart || Date.now());
    const daysLeft = Math.max(0, 14 - Math.floor(elapsed / (1000 * 60 * 60 * 24)));
    if (daysLeft <= 0) return { status: 'expired', daysLeft: 0 };
    return { status: 'trial', daysLeft };
  }

  ipcMain.handle('get-license-status', () => getLicenseStatus());

  ipcMain.handle('activate-license', async (event, key) => {
    if (!key || typeof key !== 'string') return { success: false, error: 'Invalid key' };
    const trimmed = key.trim();

    // Try Lemon Squeezy validation
    try {
      const { net } = require('electron');
      const response = await net.fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ license_key: trimmed, instance_name: require('os').hostname() }),
      });
      const data = await response.json();
      if (data.valid || data.license_key?.status === 'active') {
        writeLicense({ activated: true, key: trimmed, activatedAt: Date.now() });
        return { success: true };
      }
      // If API says invalid, still allow offline activation for keys matching a pattern
      if (data.error) return { success: false, error: data.error };
      return { success: false, error: 'Invalid license key' };
    } catch {
      // Offline: accept keys that match a basic format (fallback)
      // In production, you'd use cryptographic offline validation
      if (trimmed.length >= 16) {
        writeLicense({ activated: true, key: trimmed, activatedAt: Date.now(), offline: true });
        return { success: true };
      }
      return { success: false, error: 'Cannot validate license key. Check your internet connection.' };
    }
  });

  ipcMain.handle('deactivate-license', () => {
    const license = readLicense();
    if (license) {
      writeLicense({ trialStart: license.trialStart || Date.now(), activated: false });
    }
    return { success: true };
  });

  // --- IPC Handlers ---

  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: SUPPORTED_EXTENSIONS.map(e => e.slice(1)) },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('read-and-render', async (event, filePath) => {
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) return { error: 'File type not supported' };
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const dir = path.dirname(filePath);
      const name = path.basename(filePath);

      let html = marked.parse(content);

      html = sanitizeHtml(html, {
        allowedTags: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','blockquote','pre','code','em','strong','del','a','img','table','thead','tbody','tr','th','td','details','summary','mark','sup','input','span','div'],
        allowedAttributes: {
          '*': ['class','id'],
          a: ['href','title'],
          img: ['src','alt','title'],
          input: ['type','checked','disabled'],
          ol: ['start'],
          td: ['colspan','rowspan'],
          th: ['colspan','rowspan'],
          details: ['open'],
        },
        allowedSchemes: ['http','https','file','data'],
      });

      // Resolve relative image paths to file:// URLs
      html = html.replace(
        /(<img\s+[^>]*src=")(?!https?:\/\/|data:|file:\/\/)([^"]+)(")/gi,
        (match, pre, src, post) => {
          const absPath = path.resolve(dir, src);
          if (!absPath.startsWith(dir)) return match;
          const safePath = absPath.replace(/\\/g, '/');
          return `${pre}file:///${safePath}${post}`;
        }
      );

      // Watch file for live changes
      watchFile(filePath);

      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const readingTime = Math.ceil(wordCount / 225);
      return { html, name, path: filePath, wordCount, readingTime };
    } catch (err) {
      const msg = err.code === 'ENOENT' ? 'File not found' : err.code === 'EACCES' ? 'Permission denied' : 'Unable to read this file';
      return { error: msg };
    }
  });

  ipcMain.on('set-titlebar-theme', (event, isDark) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.setTitleBarOverlay({
          color: isDark ? '#141210' : '#EEEBE6',
          symbolColor: isDark ? '#A8A29E' : '#78716C',
        });
      } catch (_) {
        // Titlebar overlay not available on Linux
      }
    }
  });

  ipcMain.on('open-external', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });

  ipcMain.on('unwatch-file', (event, filePath) => {
    unwatchFile(filePath);
  });

  ipcMain.handle('export-pdf', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: 'document.pdf'
    });
    if (!result.canceled && result.filePath) {
      const pdfData = await mainWindow.webContents.printToPDF({ printBackground: true });
      fs.writeFileSync(result.filePath, pdfData);
      return result.filePath;
    }
    return null;
  });

  ipcMain.on('find-in-page', (event, text, opts) => {
    if (mainWindow) mainWindow.webContents.findInPage(text, opts || {});
  });
  ipcMain.on('stop-find', () => {
    if (mainWindow) mainWindow.webContents.stopFindInPage('clearSelection');
  });

  // --- Folder/Tree sidebar ---

  ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('scan-folder', async (event, folderPath) => {
    try {
      return scanDirectory(folderPath, folderPath, 0);
    } catch (err) {
      return { error: err.message };
    }
  });

  function scanDirectory(dirPath, rootPath, depth) {
    if (depth > 10) return []; // prevent runaway recursion
    const IGNORED = new Set(['node_modules', '.git', '.obsidian', '__pycache__', '.venv', 'venv', '.env', 'dist', 'build']);
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch { return []; }

    const result = [];
    // Sort: folders first (dot-prefixed first among folders), then files
    const folders = [];
    const files = [];
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      if (entry.isDirectory()) {
        folders.push(entry);
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        files.push(entry);
      }
    }

    // Sort folders: dot-prefixed first, then alpha
    folders.sort((a, b) => {
      const aDot = a.name.startsWith('.');
      const bDot = b.name.startsWith('.');
      if (aDot !== bDot) return aDot ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    files.sort((a, b) => a.name.localeCompare(b.name));

    for (const folder of folders) {
      const fullPath = path.join(dirPath, folder.name);
      const children = scanDirectory(fullPath, rootPath, depth + 1);
      // Only include folders that contain markdown files (directly or nested)
      if (children.length > 0) {
        result.push({ type: 'folder', name: folder.name, path: fullPath, children });
      }
    }
    for (const file of files) {
      result.push({ type: 'file', name: file.name, path: path.join(dirPath, file.name) });
    }
    return result;
  }

  function watchFile(filePath) {
    if (!SUPPORTED_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) return;
    if (fileWatchers.has(filePath)) return; // already watching
    let debounce = null;
    try {
      const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('file-changed', filePath);
            }
          }, 150);
        } else if (eventType === 'rename') {
          if (!fs.existsSync(filePath)) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('file-deleted', filePath);
            }
            unwatchFile(filePath);
          }
        }
      });
      fileWatchers.set(filePath, { watcher });
    } catch (e) {
      // File watching unavailable — not critical
    }
  }

  function unwatchFile(filePath) {
    const entry = fileWatchers.get(filePath);
    if (entry) {
      entry.watcher.close();
      fileWatchers.delete(filePath);
    }
  }
}
