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
const fs = require('fs');

let win = null;

// All writable data (reports, logs, progress, the saved REI login) goes to a
// per-user, always-writable folder — NEVER next to the install, which may be
// read-only (e.g. C:\Program Files). Config/selectors are still read from the
// app folder. This is set up before the server or worker start.
function setupDataDir() {
  const dataDir = app.getPath('userData'); // %APPDATA%\Pipeline Status Cleanup
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) { /* ignore */ }
  process.env.PIPELINE_DATA_DIR = dataDir;
  process.env.PIPELINE_APP_DIR = __dirname;
  try { process.chdir(dataDir); } catch (e) { /* ignore */ }
  return dataDir;
}

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
    setupDataDir();
    const { startServer, port } = require('./serve.js');
    startServer((p) => createWindow(p || port));
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(port); });
  });

  app.on('window-all-closed', () => app.quit());
}
