const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  readAndRender: (filePath) => ipcRenderer.invoke('read-and-render', filePath),
  setTitlebarTheme: (isDark) => ipcRenderer.send('set-titlebar-theme', isDark),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  unwatchFile: (path) => ipcRenderer.send('unwatch-file', path),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_, p) => cb(p)),
  onFileChanged: (cb) => ipcRenderer.on('file-changed', (_, p) => cb(p)),
  exportPDF: () => ipcRenderer.invoke('export-pdf'),
  onFileDeleted: (cb) => ipcRenderer.on('file-deleted', (_, p) => cb(p)),
  findInPage: (text, opts) => ipcRenderer.send('find-in-page', text, opts),
  stopFindInPage: () => ipcRenderer.send('stop-find'),
  onFoundInPage: (cb) => ipcRenderer.on('found-in-page', (_, result) => cb(result)),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  activateLicense: (key) => ipcRenderer.invoke('activate-license', key),
  deactivateLicense: () => ipcRenderer.invoke('deactivate-license'),
});
