const { app, BrowserWindow, protocol, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'localify', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
if (process.env.LOCALIFY_USERDATA) app.setPath('userData', process.env.LOCALIFY_USERDATA);

if (!app.requestSingleInstanceLock()) app.quit();

let win;
let store;
let backend;

function createWindow() {
  const icon = path.join(__dirname, '../../assets/icon.png');
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b0b0c', autoHideMenuBar: true, title: 'Localify',
    icon: fs.existsSync(icon) ? icon : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  store = require('./store').createStore(app.getPath('userData'));
  require('./protocols').register(store);
  backend = require('./ipc').register({ store, getWin: () => win });
  createWindow();
  win.webContents.once('did-finish-load', () => backend.runScan());

  const keys = { MediaPlayPause: 'playpause', MediaNextTrack: 'next', MediaPreviousTrack: 'prev' };
  for (const [accel, name] of Object.entries(keys)) {
    try { globalShortcut.register(accel, () => backend.send('media-key', name)); } catch { /* key unavailable */ }
  }
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (store) store.flush(); });
