// SM Engine Launcher — preload.js
// Backend v4: launcher + projects + engine download & versions + BlendSwap marketplace/library.

'use strict';

const {
    contextBridge,
    ipcRenderer
} = require('electron');


contextBridge.exposeInMainWorld(
    'launcherAPI',
    {
        getState: () =>
            ipcRenderer.invoke(
                'launcher:getState'
            ),

        launchEngine: options =>
            ipcRenderer.invoke(
                'launcher:launchEngine',
                options
            ),

        stopEngine: () =>
            ipcRenderer.invoke(
                'launcher:stopEngine'
            ),

        selectDirectory: options =>
            ipcRenderer.invoke(
                'launcher:selectDirectory',
                options
            ),

        getSettings: () =>
            ipcRenderer.invoke(
                'launcher:getSettings'
            ),

        setSetting: (
            key,
            value
        ) =>
            ipcRenderer.invoke(
                'launcher:setSetting',
                key,
                value
            ),

        getDiagnostics: () =>
            ipcRenderer.invoke(
                'launcher:getDiagnostics'
            ),

        openPath: targetPath =>
            ipcRenderer.invoke(
                'launcher:openPath',
                targetPath
            ),


        /* ============================================================
           ENGINE VERSIONS & DOWNLOADS
           ============================================================ */

        listEngineVersions: () =>
            ipcRenderer.invoke(
                'engine:listVersions'
            ),

        installEngineVersion: (
            version,
            downloadUrl
        ) =>
            ipcRenderer.invoke(
                'engine:installVersion',
                version,
                downloadUrl
            ),

        cancelEngineDownload: version =>
            ipcRenderer.invoke(
                'engine:cancelDownload',
                version
            ),

        uninstallEngineVersion: version =>
            ipcRenderer.invoke(
                'engine:uninstallVersion',
                version
            ),

        setActiveEngine: targetPath =>
            ipcRenderer.invoke(
                'engine:setActive',
                targetPath
            ),

        addCustomEngine: () =>
            ipcRenderer.invoke(
                'engine:addCustom'
            ),

        onDownloadProgress: callback => {
            if (
                typeof callback !==
                'function'
            ) {
                return () => {};
            }

            const listener =
                (
                    _event,
                    data
                ) => {
                    callback(
                        data
                    );
                };

            ipcRenderer.on(
                'engine:downloadProgress',
                listener
            );

            return () =>
                ipcRenderer.removeListener(
                    'engine:downloadProgress',
                    listener
                );
        },

        onEngineInstalled: callback => {
            if (
                typeof callback !==
                'function'
            ) {
                return () => {};
            }

            const listener =
                (
                    _event,
                    data
                ) => {
                    callback(
                        data
                    );
                };

            ipcRenderer.on(
                'engine:installed',
                listener
            );

            return () =>
                ipcRenderer.removeListener(
                    'engine:installed',
                    listener
                );
        },


        /* ============================================================
           PROJECTS
           ============================================================ */

        listProjects: () =>
            ipcRenderer.invoke(
                'project:list'
            ),

        createProject: options =>
            ipcRenderer.invoke(
                'project:create',
                options
            ),

        addExistingProject: () =>
            ipcRenderer.invoke(
                'project:addExisting'
            ),

        removeProject: projectId =>
            ipcRenderer.invoke(
                'project:remove',
                projectId
            ),

        launchProject: options =>
            ipcRenderer.invoke(
                'project:launch',
                options
            ),


        /* ============================================================
           BLENDSWAP MARKETPLACE
           ============================================================ */

        searchBlendSwap: payload =>
            ipcRenderer.invoke(
                'marketplace:blendswap:search',
                payload || {}
            ),


        getBlendSwapPreview: assetId =>
            ipcRenderer.invoke(
                'marketplace:blendswap:preview',
                assetId
            ),


        /* ============================================================
           GLOBAL SM ASSET LIBRARY
           ============================================================ */

        listAssetLibrary: () =>
            ipcRenderer.invoke(
                'library:list'
            ),

        addAssetToLibrary: asset =>
            ipcRenderer.invoke(
                'library:add',
                asset
            ),

        removeAssetFromLibrary: assetId =>
            ipcRenderer.invoke(
                'library:remove',
                assetId
            ),

        addLibraryAssetToProject: payload =>
            ipcRenderer.invoke(
                'library:addToProject',
                payload || {}
            ),

        onLibraryDownloadProgress: callback => {
            if (
                typeof callback !==
                'function'
            ) {
                return () => {};
            }

            const listener =
                (
                    _event,
                    detail
                ) => {
                    callback(
                        detail
                    );
                };

            ipcRenderer.on(
                'library:downloadProgress',
                listener
            );

            return () =>
                ipcRenderer.removeListener(
                    'library:downloadProgress',
                    listener
                );
        },


        /* ============================================================
           ANALYTICS & TELEMETRY
           ============================================================ */

        getAnalyticsSummary: (rangeDays) =>
            ipcRenderer.invoke(
                'analytics:getSummary',
                rangeDays || 30
            ),

        getAnalyticsRaw: () =>
            ipcRenderer.invoke(
                'analytics:getRaw'
            ),

        logAnalyticsEvent: (data) =>
            ipcRenderer.invoke(
                'analytics:logEvent',
                data || {}
            ),

        logAnalyticsPerf: (data) =>
            ipcRenderer.invoke(
                'analytics:logPerf',
                data || {}
            ),

        clearAnalytics: () =>
            ipcRenderer.invoke(
                'analytics:clear'
            ),

        onAnalyticsUpdated: (callback) => {
            if (typeof callback !== 'function') {
                return () => {};
            }

            const listener = (_event, payload) => {
                callback(payload);
            };

            ipcRenderer.on('analytics:updated', listener);

            return () =>
                ipcRenderer.removeListener('analytics:updated', listener);
        }
    }
);
