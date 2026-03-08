const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mdx'];

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

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
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
      show: false,
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

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' file: data:; connect-src 'none'; frame-src 'none';"] } });
    });

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
      mainWindow.setTitleBarOverlay({
        color: isDark ? '#141210' : '#EEEBE6',
        symbolColor: isDark ? '#A8A29E' : '#78716C',
      });
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
