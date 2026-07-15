'use strict';

/**
 * Desktop app shell (Electron). Starts the dashboard server in-process and
 * shows it in a native window — no browser tab, no terminal.
 *
 *   npm run app     # launch the app window (dev)
 *   npm run dist    # build a Windows installer (.exe) into dist/
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

// Pin the working directory to the app folder so the dashboard server, the
// spawned worker, reports/progress/logs and the saved REI login all resolve to
// the same (per-user, writable) location whether run from source or installed.
try { process.chdir(__dirname); } catch (e) { /* ignore */ }

let win = null;

function createWindow(port) {
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: 'Pipeline Status Cleanup',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  Menu.setApplicationMenu(null); // clean, app-like (no dev menu bar)
  win.loadURL('http://localhost:' + port);
  win.once('ready-to-show', () => win.show());

  // REI "open" links (target=_blank) should open in the user's real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
}

// Single instance only — double-clicking the icon focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(() => {
    const { startServer, port } = require('./serve.js');
    startServer((p) => createWindow(p || port));
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(port); });
  });

  app.on('window-all-closed', () => app.quit());
}
