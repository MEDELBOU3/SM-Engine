// SM Engine Launcher — electron-main.js
// Backend v4: secure shell + projects + engine versions + BlendSwap marketplace/library.

'use strict';

const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    shell
} = require('electron');

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
    EngineLauncherService
} = require('./src/services/EngineLauncherService.js');

const {
    SettingsManager
} = require('./src/managers/SettingsManager.js');

const {
    ProjectManager
} = require('./src/managers/ProjectManager.js');

const {
    ProjectService
} = require('./src/services/ProjectService.js');

const {
    UpdateService
} = require('./src/services/UpdateService.js');

const {
    EngineVersionManager
} = require('./src/managers/EngineVersionManager.js');

const {
    AnalyticsTracker
} = require('./src/analytics/AnalyticsTracker.js');


const {
    createBlendSwapMarketplaceService
} = require(
    './electron/BlendSwapMainService.js'
);


const APP_ID =
    'com.smengine.launcher';

const APP_NAME =
    'SM Engine Launcher';

let mainWindow = null;

let settingsManager = null;
let engineLauncher = null;
let projectManager = null;
let projectService = null;
let updateService = null;
let engineVersionManager = null;
let blendSwapMarketplace = null;
let analyticsTracker = null;
let currentSessionId = null;


/* ================================================================
   PATHS
   ================================================================ */

function resolveLauncherIcon() {
    const file =
        process.platform === 'win32'
            ? 'logo.ico'
            : 'logo.png';

    const iconPath =
        path.join(
            __dirname,
            'assets',
            'icons',
            file
        );

    return fs.existsSync(
        iconPath
    )
        ? iconPath
        : undefined;
}


function getDefaultEnginePath() {
    const developmentPath = process.env.SM_ENGINE_DEV_PATH;

    if (developmentPath && fs.existsSync(developmentPath)) {
        return path.resolve(developmentPath);
    }

    return null;
}


/* ================================================================
   SERVICES
   ================================================================ */

function initializeServices() {
    settingsManager =
        new SettingsManager({
            app,

            defaults: {
                enginePath:
                    getDefaultEnginePath(),

                gpuMode:
                    'automatic',

                openLastProject:
                    true,

                autoUpdates:
                    true,

                devTools:
                    false
            }
        });


    engineLauncher =
        new EngineLauncherService({
            settingsManager
        });


    projectService =
        new ProjectService({
            engineVersion:
                '1.0.1'
        });


    projectManager =
        new ProjectManager({
            app,
            projectService
        });

    updateService =
        new UpdateService({
            app,
            settingsManager,
            githubRepo: 'MEDELBOU3/SM-Engine'
        });

    engineVersionManager =
        new EngineVersionManager({
            app,
            settingsManager,
            updateService,
            engineLauncher
        });

    // Forward download and installation events to renderer window
    updateService.on('progress', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('engine:downloadProgress', data);
        }
    });

    updateService.on('installed', (data) => {
        if (analyticsTracker) {
            analyticsTracker.logEvent({
                type: 'engine_installed',
                label: `Installed SM Engine ${data?.version || 'update'}`,
                engineVersion: data?.version
            });
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('analytics:updated');
            }
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('engine:installed', data);
        }
    });

    // Initialize Analytics Tracker & Telemetry Store
    analyticsTracker = new AnalyticsTracker(app);
    analyticsTracker.seedIfEmpty(projectManager.list());

    blendSwapMarketplace =
        createBlendSwapMarketplaceService({
            app,
            ipcMain,
            projectManager,

            getWindow:
                () => mainWindow,

            rootDir:
                __dirname
        });


    console.info(
        '[SM Launcher] Services initialized.'
    );
}


/* ================================================================
   WINDOW
   ================================================================ */

function createWindow() {
    mainWindow =
        new BrowserWindow({
            width: 1360,
            height: 820,

            minWidth: 620,
            minHeight: 560,

            show: false,

            title:
                APP_NAME,

            backgroundColor:
                '#090d12',

            icon:
                resolveLauncherIcon(),

            webPreferences: {
                preload:
                    path.join(
                        __dirname,
                        'preload.js'
                    ),

                nodeIntegration:
                    false,

                contextIsolation:
                    true,

                sandbox:
                    true
            }
        });


    mainWindow.loadFile(
        path.join(
            __dirname,
            'index.html'
        )
    );


    mainWindow.once(
        'ready-to-show',
        () => {
            mainWindow?.show();
        }
    );


    mainWindow.on(
        'closed',
        () => {
            mainWindow = null;
        }
    );
}


/* ================================================================
   CORE IPC
   ================================================================ */

function registerCoreIPC() {
    ipcMain.handle(
        'launcher:getState',
        async () => ({
            app: {
                name:
                    APP_NAME,

                version:
                    app.getVersion(),

                platform:
                    process.platform,

                arch:
                    process.arch
            },

            settings:
                settingsManager
                    .getAll(),

            engine:
                await engineLauncher
                    .detectInstallation(),

            projects:
                projectManager
                    .list()
        })
    );


    ipcMain.handle(
        'launcher:launchEngine',
        async (
            _event,
            options = {}
        ) => {
            const launchResult = await engineLauncher.launch(options);
            if (launchResult && launchResult.ok && analyticsTracker) {
                const activeVersion = settingsManager?.get('engineVersion') || 'SM Engine 1.0.1';
                currentSessionId = analyticsTracker.startSession({
                    projectName: null,
                    engineVersion: activeVersion,
                    mode: 'engine'
                });

                if (engineLauncher.process) {
                    const sessId = currentSessionId;
                    engineLauncher.process.once('exit', (code, signal) => {
                        const crashed = code !== 0 && code !== null && code !== 130;
                        analyticsTracker.endSession(sessId, { exitCode: code || 0, crashed });
                        currentSessionId = null;
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('analytics:updated');
                        }
                    });
                }

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('analytics:updated');
                }
            }
            return launchResult;
        }
    );


    ipcMain.handle(
        'launcher:stopEngine',
        async () =>
            engineLauncher
                .stop()
    );


    ipcMain.handle(
        'launcher:selectDirectory',
        async (
            _event,
            options = {}
        ) => {
            const result =
                await dialog
                    .showOpenDialog(
                        mainWindow,
                        {
                            title:
                                options.title ||
                                'Select Folder',

                            defaultPath:
                                options.defaultPath ||
                                undefined,

                            properties: [
                                'openDirectory',
                                'createDirectory'
                            ]
                        }
                    );

            return {
                canceled:
                    result.canceled,

                path:
                    result.filePaths[0] ||
                    null
            };
        }
    );


    ipcMain.handle(
        'launcher:getSettings',
        async () =>
            settingsManager
                .getAll()
    );


    ipcMain.handle(
        'launcher:setSetting',
        async (
            _event,
            key,
            value
        ) => {
            settingsManager.set(
                key,
                value
            );

            return {
                ok: true,
                key,
                value
            };
        }
    );


    ipcMain.handle(
        'launcher:getDiagnostics',
        async () => ({
            launcher: {
                version:
                    app.getVersion(),

                electron:
                    process.versions
                        .electron,

                chrome:
                    process.versions
                        .chrome
            },

            system: {
                platform:
                    process.platform,

                arch:
                    process.arch,

                release:
                    os.release(),

                cpu:
                    os.cpus()?.[0]
                        ?.model ||
                    'Unknown',

                cpuCount:
                    os.cpus()?.length ||
                    0,

                totalMemory:
                    os.totalmem(),

                freeMemory:
                    os.freemem()
            },

            engine:
                await engineLauncher
                    .detectInstallation()
        })
    );


    ipcMain.handle(
        'launcher:openPath',
        async (
            _event,
            targetPath
        ) => {
            const error =
                await shell.openPath(
                    String(
                        targetPath ||
                        ''
                    )
                );

            return {
                ok:
                    !error,

                error:
                    error ||
                    null
            };
        }
    );
}


/* ================================================================
   PROJECT IPC
   ================================================================ */

function registerProjectIPC() {
    ipcMain.handle(
        'project:list',
        async () => ({
            ok: true,

            projects:
                projectManager
                    .list()
        })
    );


    ipcMain.handle(
        'project:create',
        async (
            _event,
            options = {}
        ) => {
            try {
                const created =
                    projectService
                        .createProject(
                            options
                        );

                const project =
                    projectManager
                        .add({
                            name:
                                created.name,

                            type:
                                created.type,

                            template:
                                created.template,

                            engineVersion:
                                created.engineVersion,

                            path:
                                created.path,

                            lastOpenedAt:
                                Date.now()
                        });

                if (analyticsTracker) {
                    analyticsTracker.logEvent({
                        type: 'project_created',
                        label: `Created project "${created.name}" (${created.template || 'Default'})`,
                        projectName: created.name,
                        engineVersion: created.engineVersion
                    });
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('analytics:updated');
                    }
                }

                return {
                    ok: true,
                    project
                };
            } catch (error) {
                return {
                    ok: false,

                    error:
                        error?.message ||
                        String(error)
                };
            }
        }
    );


    ipcMain.handle(
        'project:addExisting',
        async () => {
            const result =
                await dialog
                    .showOpenDialog(
                        mainWindow,
                        {
                            title:
                                'Open SM Engine Project',

                            properties: [
                                'openDirectory'
                            ]
                        }
                    );

            if (
                result.canceled ||
                !result.filePaths.length
            ) {
                return {
                    ok: false,
                    canceled: true
                };
            }

            try {
                const inspected =
                    projectService
                        .inspectProject(
                            result.filePaths[0]
                        );

                const project =
                    projectManager
                        .add({
                            name:
                                inspected.name,

                            type:
                                inspected.type,

                            template:
                                inspected.template,

                            engineVersion:
                                inspected.engineVersion,

                            path:
                                inspected.path
                        });

                if (analyticsTracker) {
                    analyticsTracker.logEvent({
                        type: 'project_imported',
                        label: `Imported existing project "${inspected.name}"`,
                        projectName: inspected.name,
                        engineVersion: inspected.engineVersion
                    });
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('analytics:updated');
                    }
                }

                return {
                    ok: true,
                    project
                };
            } catch (error) {
                return {
                    ok: false,

                    error:
                        error?.message ||
                        String(error)
                };
            }
        }
    );


    ipcMain.handle(
        'project:remove',
        async (
            _event,
            projectId
        ) => ({
            ok:
                projectManager
                    .remove(
                        projectId
                    )
        })
    );


    ipcMain.handle(
        'project:launch',
        async (
            _event,
            options = {}
        ) => {
            const project =
                projectManager
                    .list()
                    .find(
                        item =>
                            item.id ===
                            options.projectId
                    );

            if (!project) {
                return {
                    ok: false,
                    error:
                        'Project not found.'
                };
            }

            try {
                const result =
                    await engineLauncher
                        .launch({
                            projectPath:
                                project.path,

                            gpuMode:
                                options.gpuMode,

                            safeMode:
                                options.safeMode ===
                                true
                        });

                projectManager
                    .touch(
                        project.id
                    );

                if (result && result.ok && analyticsTracker) {
                    const sessId = analyticsTracker.startSession({
                        projectName: project.name,
                        engineVersion: project.engineVersion || 'SM Engine 1.0.1',
                        projectPath: project.path,
                        mode: 'project'
                    });

                    if (engineLauncher.process) {
                        engineLauncher.process.once('exit', (code, signal) => {
                            const crashed = code !== 0 && code !== null && code !== 130;
                            analyticsTracker.endSession(sessId, { exitCode: code || 0, crashed });
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('analytics:updated');
                            }
                        });
                    }

                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('analytics:updated');
                    }
                }

                return {
                    ok: true,
                    result
                };
            } catch (error) {
                return {
                    ok: false,

                    error:
                        error?.message ||
                        String(error)
                };
            }
        }
    );
}


/* ================================================================
   ENGINE VERSION & DOWNLOAD IPC
   ================================================================ */

function registerEngineIPC() {
    ipcMain.handle(
        'engine:listVersions',
        async () => {
            try {
                const versions = await engineVersionManager.listAllVersions();
                return { ok: true, versions };
            } catch (err) {
                return { ok: false, error: err.message, versions: [] };
            }
        }
    );

    ipcMain.handle(
        'engine:installVersion',
        async (_event, version, downloadUrl) => {
            try {
                const result = await updateService.installVersion(version, downloadUrl, (progress) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('engine:downloadProgress', { version, ...progress });
                    }
                });
                return { ok: true, result };
            } catch (err) {
                return { ok: false, error: err.message };
            }
        }
    );

    ipcMain.handle(
        'engine:cancelDownload',
        async (_event, version) => {
            const success = updateService.cancelDownload(version);
            return { ok: success };
        }
    );

    ipcMain.handle(
        'engine:uninstallVersion',
        async (_event, version) => {
            try {
                const success = await updateService.uninstallVersion(version);
                return { ok: success };
            } catch (err) {
                return { ok: false, error: err.message };
            }
        }
    );

    ipcMain.handle(
        'engine:setActive',
        async (_event, targetPath) => {
            try {
                await engineVersionManager.setActiveVersion(targetPath);
                return { ok: true };
            } catch (err) {
                return { ok: false, error: err.message };
            }
        }
    );

    ipcMain.handle(
        'engine:addCustom',
        async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Select SM Engine Directory',
                properties: ['openDirectory']
            });

            if (result.canceled || !result.filePaths.length) {
                return { ok: false, canceled: true };
            }

            const targetPath = result.filePaths[0];
            try {
                const inspected = engineVersionManager._inspectEngineDirectory(targetPath, true, 'Custom');
                await engineVersionManager.setActiveVersion(targetPath);
                return { ok: true, engine: inspected };
            } catch (err) {
                return { ok: false, error: err.message };
            }
        }
    );
}


/* ================================================================
   ANALYTICS IPC
   ================================================================ */

function registerAnalyticsIPC() {
    ipcMain.handle(
        'analytics:getSummary',
        async (_event, rangeDays) => {
            if (!analyticsTracker) {
                return { ok: false, error: 'Analytics tracker not initialized' };
            }
            return {
                ok: true,
                summary: analyticsTracker.getSummary(rangeDays)
            };
        }
    );

    ipcMain.handle(
        'analytics:getRaw',
        async () => {
            if (!analyticsTracker) {
                return { ok: false, error: 'Analytics tracker not initialized' };
            }
            return {
                ok: true,
                data: analyticsTracker.getRawData()
            };
        }
    );

    ipcMain.handle(
        'analytics:logEvent',
        async (_event, data = {}) => {
            if (!analyticsTracker) return { ok: false };
            analyticsTracker.logEvent(data);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('analytics:updated');
            }
            return { ok: true };
        }
    );

    ipcMain.handle(
        'analytics:logPerf',
        async (_event, data = {}) => {
            if (!analyticsTracker) return { ok: false };
            analyticsTracker.logPerformance(data);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('analytics:updated');
            }
            return { ok: true };
        }
    );

    ipcMain.handle(
        'analytics:clear',
        async () => {
            if (!analyticsTracker) return { ok: false };
            analyticsTracker.clear();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('analytics:updated');
            }
            return { ok: true };
        }
    );
}


/* ================================================================
   APP
   ================================================================ */

app.whenReady().then(
    async () => {
        if (
            process.platform ===
            'win32'
        ) {
            app.setAppUserModelId(
                APP_ID
            );
        }

        initializeServices();

        registerCoreIPC();
        registerProjectIPC();
        registerEngineIPC();
        registerAnalyticsIPC();

        if (
            !blendSwapMarketplace ||
            typeof blendSwapMarketplace.register !==
                'function'
        ) {
            throw new Error(
                'BlendSwap marketplace service failed to initialize.'
            );
        }

        await blendSwapMarketplace
            .register();

        createWindow();


        app.on(
            'activate',
            () => {
                if (
                    BrowserWindow
                        .getAllWindows()
                        .length ===
                    0
                ) {
                    createWindow();
                }
            }
        );
    }
);


app.on(
    'window-all-closed',
    () => {
        if (
            process.platform !==
            'darwin'
        ) {
            app.quit();
        }
    }
);