const { app, BrowserWindow, shell, Menu, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Serve the app from a fixed private origin so the on-device database stays in one place.
protocol.registerSchemesAsPrivileged([{ scheme: 'budgetbook', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();

let win;
function create() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 560, title: 'Budget Book', backgroundColor: '#f5f4f2',
    icon: path.join(__dirname, 'web', 'icons', 'icon-512.png'), autoHideMenuBar: true,
    webPreferences: { plugins: true, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, 'web', 'icons', 'icon-512.png') } };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('budgetbook://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadURL('budgetbook://app/index.html');
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  const root = path.join(__dirname, 'web');
  protocol.handle('budgetbook', req => {
    let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/' || !p) p = '/index.html';
    const f = path.normalize(path.join(root, p)); if (!f.startsWith(root)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(f).toString());
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
  ]));
  create();
});
app.on('window-all-closed', () => app.quit());
