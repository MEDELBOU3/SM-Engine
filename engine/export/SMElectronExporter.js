(function () {
    'use strict';
    class SMElectronExporter extends window.SMExportTarget {
        constructor(options = {}) {
            super({ id: 'electron', name: 'Electron', description: 'Desktop Electron project export.', extension: '.zip', capabilities: { standalone: true, zip: true, offline: false, desktop: true }, ...options });
            this.webExporter = options.webExporter || new window.SMWebExporter();
        }
        async export(buildResult, options = {}) {
            const validation = await this.validate(buildResult, { ...options, allowTargetMismatch: true });
            if (!validation.ok) throw new Error(`Electron export validation failed: ${validation.errors.join(' ')}`);
            const web = await this.webExporter.export(buildResult, { ...options, zip: false, filename: null, allowTargetMismatch: true });
            const bundle = new window.SMAssetBundle({ name: buildResult.config?.name || 'SMGame-Electron' });
            for (const file of web.bundle.list()) bundle.add(`game/${file.path}`, file.data, { type: file.type, mimeType: file.mimeType, source: file.source, hash: file.hash, metadata: file.metadata });
            bundle.addText('main.js', this._mainJS(buildResult, options), { type: 'electron-main', mimeType: 'text/javascript' });
            bundle.addText('preload.js', this._preloadJS(), { type: 'electron-preload', mimeType: 'text/javascript' });
            bundle.addJSON('package.json', this._packageJSON(buildResult, options), { pretty: true });
            bundle.addText('README.txt', this._readme(buildResult, web.warnings), { type: 'text' });
            const packageResult = await this._package(bundle, buildResult, options);
            const result = { ok: true, target: 'electron', bundle, package: packageResult, buildResult, web, warnings: [...validation.warnings, ...web.warnings], validation };
            window.dispatchEvent(new CustomEvent('sm:export-electron-complete', { detail: result }));
            return result;
        }
        _packageJSON(buildResult, options = {}) {
            const config = buildResult.config;
            const safeName = String(config?.name || 'sm-game').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'sm-game';
            return { name: safeName, productName: String(config?.name || 'SM Game'), version: String(config?.version || '1.0.0'), private: true, main: 'main.js', scripts: { start: 'electron .', dist: 'electron-builder' }, devDependencies: { electron: String(options.electronVersion || '^33.4.11'), 'electron-builder': String(options.electronBuilderVersion || '^25.1.8') }, build: { appId: String(options.appId || `com.smengine.${safeName.replace(/[^a-z0-9]+/g, '') || 'game'}`), productName: String(config?.name || 'SM Game'), files: ['main.js', 'preload.js', 'game/**/*'], directories: { output: 'release' }, win: { target: ['nsis', 'portable'] }, mac: { target: ['dmg'] }, linux: { target: ['AppImage', 'deb'] } } };
        }
        _mainJS(buildResult, options = {}) {
            const width = Math.max(320, Number(buildResult.config?.resolution?.width || 1280));
            const height = Math.max(240, Number(buildResult.config?.resolution?.height || 720));
            const fullscreen = buildResult.config?.fullscreen === true;
            const devTools = buildResult.config?.development === true || options.devTools === true;
            return `'use strict';
const {app,BrowserWindow}=require('electron');
const path=require('path');
let mainWindow=null;
function createWindow(){
    mainWindow=new BrowserWindow({
        width:${width},
        height:${height},
        fullscreen:${fullscreen},
        show:false,
        backgroundColor:'#111111',
        autoHideMenuBar:true,
        webPreferences:{
            preload:path.join(__dirname,'preload.js'),
            contextIsolation:true,
            nodeIntegration:false,
            sandbox:true
        }
    });
    mainWindow.once('ready-to-show',()=>mainWindow.show());
    mainWindow.loadFile(path.join(__dirname,'game','index.html'));
    ${devTools ? "mainWindow.webContents.openDevTools({mode:'detach'});" : ''}
    mainWindow.on('closed',()=>{mainWindow=null;});
}
app.whenReady().then(()=>{
    createWindow();
    app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});`;
        }
        _preloadJS() {
            return `'use strict';
const {contextBridge}=require('electron');
contextBridge.exposeInMainWorld('SMDesktop',{
    platform:process.platform,
    versions:{
        chrome:process.versions.chrome,
        electron:process.versions.electron
    }
});`;
        }
        async _package(bundle, buildResult, options = {}) {
            if (options.zip === false || !window.JSZip) return { type: 'virtual', bundle, files: bundle.list(), name: this.getDefaultFilename(buildResult).replace(/\.zip$/, '') };
            const blob = await bundle.toZip({ compression: 'DEFLATE', level: 6 });
            return { type: 'zip', blob, name: options.filename || this.getDefaultFilename(buildResult), size: blob.size };
        }
        _readme(buildResult, warnings = []) {
            return `${buildResult.config?.name || 'SM Game'} — Electron Project
Generated by SM Engine.
This browser build generates an Electron PROJECT, not a compiled .exe directly.
To create desktop installers on a development machine:
1. Install Node.js.
2. Open this exported folder in a terminal.
3. Run: npm install
4. Test: npm start
5. Package: npm run dist
The generated Electron shell keeps nodeIntegration disabled and contextIsolation enabled.
Warnings: ${warnings.length}
${warnings.map(item => '- ' + item).join('\n')}`;
        }
    }
    window.SMElectronExporter = SMElectronExporter;
    window.SMElectronExporterClass = SMElectronExporter;
})();