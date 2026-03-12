const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mdx'];

// AI config files that should appear in the sidebar tree regardless of extension
const AI_CONFIG_FILES = new Set([
  'CLAUDE.md', '.cursorrules', '.clinerules', '.windsurfrules', 'AGENTS.md',
  'copilot-instructions.md',
]);

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
let folderToOpen = null;
const fileWatchers = new Map(); // path -> { watcher }

// Check command line for .md file and --folder arg
const initialArgv = process.argv.slice(app.isPackaged ? 1 : 2);

// Parse --folder arg from CLI
function findFolderArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--folder' || argv[i] === '-f') && i + 1 < argv.length) {
      const resolved = path.resolve(argv[i + 1]);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
    }
  }
  return null;
}

// Filter out --folder and its value from argv before passing to existing arg parsing
function filterFolderArg(argv) {
  const filtered = [];
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--folder' || argv[i] === '-f') && i + 1 < argv.length) {
      i++; // skip the folder path too
    } else {
      filtered.push(argv[i]);
    }
  }
  return filtered;
}

folderToOpen = findFolderArg(initialArgv);
const filteredArgv = filterFolderArg(initialArgv);
fileToOpen = findMarkdownArg(filteredArgv);
let startupArgError = !fileToOpen ? diagnoseArgError(filteredArgv) : null;

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
      if (folderToOpen) {
        mainWindow.webContents.send('open-folder', folderToOpen);
      }
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
      if (typeof unwatchFolder === 'function') unwatchFolder();
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
      const baseName = path.basename(filePath);
      if (!SUPPORTED_EXTENSIONS.includes(ext) && !AI_CONFIG_FILES.has(baseName)) return { error: 'File type not supported' };
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
      } else if (entry.isFile() && (isMarkdownFile(entry.name) || AI_CONFIG_FILES.has(entry.name))) {
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

  // --- Directory Watcher ---
  let folderWatcher = null;
  let watchedFolder = null;
  let folderDebounce = null;

  function watchFolder(folderPath) {
    // Stop any existing folder watcher
    unwatchFolder();
    watchedFolder = folderPath;
    try {
      folderWatcher = fs.watch(folderPath, { recursive: true, persistent: false }, (eventType, filename) => {
        // Debounce rapid changes (300ms)
        if (folderDebounce) clearTimeout(folderDebounce);
        folderDebounce = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed() && watchedFolder === folderPath) {
            mainWindow.webContents.send('folder-changed', folderPath);
          }
        }, 300);
      });
      folderWatcher.on('error', () => {
        // Watcher error (e.g. directory deleted) — clean up silently
        unwatchFolder();
      });
    } catch (e) {
      // Folder watching unavailable — not critical
      folderWatcher = null;
      watchedFolder = null;
    }
  }

  function unwatchFolder() {
    if (folderDebounce) { clearTimeout(folderDebounce); folderDebounce = null; }
    if (folderWatcher) { try { folderWatcher.close(); } catch (e) { /* ignore */ } folderWatcher = null; }
    watchedFolder = null;
  }

  ipcMain.on('watch-folder', (event, folderPath) => {
    watchFolder(folderPath);
  });

  ipcMain.on('unwatch-folder', (event, folderPath) => {
    unwatchFolder();
  });

  // --- Cross-file search ---

  function collectMarkdownFiles(dirPath, depth = 0) {
    if (depth > 10) return [];
    const IGNORED = new Set(['node_modules', '.git', '.obsidian', '__pycache__', '.venv', 'venv', '.env', 'dist', 'build']);
    let entries;
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return []; }
    const results = [];
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMarkdownFiles(fullPath, depth + 1));
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  ipcMain.handle('search-in-folder', async (event, folderPath, query) => {
    if (!folderPath || !query || typeof query !== 'string') return [];
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lowerQuery = trimmed.toLowerCase();
    const files = collectMarkdownFiles(folderPath);
    const results = [];
    for (const filePath of files) {
      let content;
      try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }
      const lines = content.split('\n');
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          matches.push({ line: i + 1, text: lines[i].substring(0, 200) });
        }
      }
      if (matches.length > 0) {
        results.push({ file: filePath, name: path.basename(filePath), matches });
      }
    }
    return results;
  });
}
