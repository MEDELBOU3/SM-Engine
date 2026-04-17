//electron-main.js
const { app, BrowserWindow, Menu, dialog, session, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const offlineManifestPath = path.join(__dirname, 'assets', 'offline-cdn', 'manifest.json');
const desktopEntryFile = 'index.html';

function resolveProjectPath(relativePath = '') {
    const projectRoot = path.resolve(__dirname);
    const requestedPath = path.resolve(projectRoot, String(relativePath || ''));
    if (!requestedPath.startsWith(projectRoot)) {
        throw new Error(`Refusing to read outside project root: ${relativePath}`);
    }
    return requestedPath;
}

function loadOfflineManifest() {
    try {
        if (!fs.existsSync(offlineManifestPath)) return {};
        return JSON.parse(fs.readFileSync(offlineManifestPath, 'utf8'));
    } catch (error) {
        console.warn('Offline asset manifest could not be loaded:', error);
        return {};
    }
}

function registerOfflineAssetRedirects() {
    const manifest = loadOfflineManifest();
    const entries = Object.entries(manifest || {});

    if (entries.length === 0) {
        console.warn('Offline asset manifest is empty; remote CDN assets will not be redirected.');
        return;
    }

    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
        const relativeTarget = manifest[details.url];
        if (!relativeTarget) {
            callback({});
            return;
        }

        const resolvedPath = path.join(__dirname, relativeTarget);
        if (!fs.existsSync(resolvedPath)) {
            console.warn('Offline asset target missing:', details.url, resolvedPath);
            callback({});
            return;
        }

        callback({ path: resolvedPath });
    });
}

app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '3');
app.setName('SM Engine');

ipcMain.handle('project:readTextFile', async (_event, relativePath) => {
    const resolvedPath = resolveProjectPath(relativePath);
    return fs.promises.readFile(resolvedPath, 'utf8');
});

ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || !result.filePaths.length) {
        return null;
    }

    return result.filePaths[0];
});

ipcMain.handle('file:save', async (_event, content, filename = 'sm-engine-export.txt') => {
    const result = await dialog.showSaveDialog({
        defaultPath: filename
    });

    if (result.canceled || !result.filePath) {
        return { canceled: true };
    }

    await fs.promises.writeFile(result.filePath, content, 'utf8');
    return { canceled: false, filePath: result.filePath };
});

function withSenderWindow(event, action) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        action(win);
    }
}

ipcMain.on('window:minimize', (event) => {
    withSenderWindow(event, (win) => win.minimize());
});

ipcMain.on('window:maximize', (event) => {
    withSenderWindow(event, (win) => {
        if (win.isMaximized()) {
            win.unmaximize();
            return;
        }
        win.maximize();
    });
});

ipcMain.on('window:close', (event) => {
    withSenderWindow(event, (win) => win.close());
});

ipcMain.on('dev:open', (event) => {
    withSenderWindow(event, (win) => win.webContents.openDevTools({ mode: 'detach' }));
});

function createWindow() {
    // 1. Determine the correct icon format based on the Operating System
    let iconPath;
    if (process.platform === 'win32') {
        // Windows requires .ico format
        iconPath = path.join(__dirname, 'assets', 'icons', 'app.ico');
    } else {
        // macOS and Linux require .png (or .icns for Mac)
        iconPath = path.join(__dirname, 'assets', 'icons', 'app.png');
    }

    // 2. Create the Browser Window
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1180,
        minHeight: 720,
        title: "SM Engine",
        icon: iconPath, // Apply the dynamically chosen icon
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        backgroundColor: '#1a1a1a'
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) {
            shell.openExternal(url);
            return { action: 'deny' };
        }

        return { action: 'allow' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (/^https?:/i.test(url)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    win.once('ready-to-show', () => {
        win.show();
    });

    win.loadFile(desktopEntryFile);

    // 3. Create a basic top menu
    const template = [
        {
            label: 'File',
            submenu: [
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { role: 'close' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Open DevTools if needed during development
    // win.webContents.openDevTools();
}

app.whenReady().then(() => {
    registerOfflineAssetRedirects();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
