// preload.js
// SM Engine secure renderer bridge.
//
// The renderer gets narrowly-scoped APIs only.
// Node.js modules such as fs/path/child_process are NOT exposed directly.

'use strict';


const {
    contextBridge,
    ipcRenderer,
    webUtils
} = require('electron');


function getPathForFile(
    file
) {
    try {
        return (
            webUtils
                ?.getPathForFile?.(
                    file
                ) ||
            null
        );
    } catch (_) {
        return null;
    }
}


contextBridge.exposeInMainWorld(
    'electronAPI',
    {

        /* ============================================================
           BASIC INFO
           ============================================================ */

        platform:
            process.platform,


        /*
         * Electron >= 32 replacement for the old File.path renderer API.
         * BlenderImporter uses this to resolve the real selected .blend path.
         */
        getPathForFile,


        /* ============================================================
           LAUNCHER -> ENGINE PROJECT HANDOFF
           ============================================================ */

        getLauncherStartupProject:
            () =>
                ipcRenderer.invoke(
                    'sm-project:get-launcher-startup'
                ),


        /* ============================================================
           PHYSICAL PROJECT FILESYSTEM SYNC
           ============================================================ */

        projectFilesystem: {

            writeText:
                payload =>
                    ipcRenderer.invoke(
                        'sm-project-fs:write-text',
                        payload
                    ),

            writeBinary:
                payload =>
                    ipcRenderer.invoke(
                        'sm-project-fs:write-binary',
                        payload
                    ),

            ensureDirectory:
                payload =>
                    ipcRenderer.invoke(
                        'sm-project-fs:ensure-directory',
                        payload
                    ),

            mergeManifest:
                payload =>
                    ipcRenderer.invoke(
                        'sm-project-fs:merge-manifest',
                        payload
                    )
        },


        /* ============================================================
           PHYSICAL PROJECT EXTERNAL WATCH / IMPORT
           ============================================================ */

        projectFilesystemWatcher: {

            start:
                payload =>
                    ipcRenderer.invoke(
                        'sm-project-fs-watch:start',
                        payload
                    ),

            stop:
                payload =>
                    ipcRenderer.invoke(
                        'sm-project-fs-watch:stop',
                        payload
                    ),

            stat:
                payload =>
                    ipcRenderer.invoke(
                        'sm-project-fs-watch:stat',
                        payload
                    ),

            readFile:
                payload =>
                    ipcRenderer.invoke(
                        'sm-project-fs-watch:read-file',
                        payload
                    ),

            onExternalChange:
                callback => {
                    if (
                        typeof callback !==
                        'function'
                    ) {
                        return () => {};
                    }

                    const handler =
                        (
                            _event,
                            detail
                        ) => {
                            callback(
                                detail
                            );
                        };

                    ipcRenderer.on(
                        'sm-project-fs:external-change',
                        handler
                    );

                    return () => {
                        ipcRenderer.removeListener(
                            'sm-project-fs:external-change',
                            handler
                        );
                    };
                },

            onWatchError:
                callback => {
                    if (
                        typeof callback !==
                        'function'
                    ) {
                        return () => {};
                    }

                    const handler =
                        (
                            _event,
                            detail
                        ) => {
                            callback(
                                detail
                            );
                        };

                    ipcRenderer.on(
                        'sm-project-fs:watch-error',
                        handler
                    );

                    return () => {
                        ipcRenderer.removeListener(
                            'sm-project-fs:watch-error',
                            handler
                        );
                    };
                }
        },


        /* ============================================================
           FILE SYSTEM / NATIVE DIALOGS
           ============================================================ */

        selectDirectory:
            () =>
                ipcRenderer.invoke(
                    'dialog:selectDirectory'
                ),

        saveFile:
            (
                content,
                filename
            ) =>
                ipcRenderer.invoke(
                    'file:save',
                    content,
                    filename
                ),


                blender: {

            detect:
                (
                    payload = {}
                ) =>
                    ipcRenderer.invoke(
                        'sm-blender:detect',
                        payload
                    ),

            validate:
                executablePath =>
                    ipcRenderer.invoke(
                        'sm-blender:validate',
                        {
                            path:
                                executablePath
                        }
                    ),

            convert:
                (
                    payload = {}
                ) =>
                    ipcRenderer.invoke(
                        'sm-blender:convert',
                        payload
                    ),

            cancel:
                () =>
                    ipcRenderer.invoke(
                        'sm-blender:cancel'
                    ),

            onLog:
                callback => {
                    if (
                        typeof callback !==
                        'function'
                    ) {
                        return () => {};
                    }

                    const handler =
                        (
                            _event,
                            detail
                        ) => {
                            callback(
                                detail
                            );
                        };

                    ipcRenderer.on(
                        'sm-blender:log',
                        handler
                    );

                    return () => {
                        ipcRenderer.removeListener(
                            'sm-blender:log',
                            handler
                        );
                    };
                }
        },


        /* ============================================================
           BLENDSWAP — ONLINE BLENDER ASSETS
           ============================================================ */

        blendswap: {

            hasApiKey:
                () =>
                    ipcRenderer.invoke(
                        'sm-blendswap:key-status'
                    ),

            setApiKey:
                key =>
                    ipcRenderer.invoke(
                        'sm-blendswap:key-set',
                        {
                            key
                        }
                    ),

            clearApiKey:
                () =>
                    ipcRenderer.invoke(
                        'sm-blendswap:key-clear'
                    ),

            search:
                payload =>
                    ipcRenderer.invoke(
                        'sm-blendswap:search',
                        payload || {}
                    ),

            download:
                payload =>
                    ipcRenderer.invoke(
                        'sm-blendswap:download',
                        payload || {}
                    ),

            cancelDownload:
                assetId =>
                    ipcRenderer.invoke(
                        'sm-blendswap:cancel-download',
                        {
                            assetId
                        }
                    ),

            onDownloadProgress:
                callback => {

                    if (
                        typeof callback !==
                        'function'
                    ) {
                        return () => {};
                    }

                    const handler =
                        (
                            _event,
                            detail
                        ) => {
                            callback(
                                detail
                            );
                        };

                    ipcRenderer.on(
                        'sm-blendswap:download-progress',
                        handler
                    );

                    return () => {
                        ipcRenderer.removeListener(
                            'sm-blendswap:download-progress',
                            handler
                        );
                    };
                }
        },


        /* ============================================================
           GEMINI AI
           ============================================================ */

        geminiGenerateContent:
            payload =>
                ipcRenderer.invoke(
                    'sm-ai:gemini-generate',
                    payload
                ),


        /* ============================================================
           MENU ACTIONS
           ============================================================ */

        onMenuAction:
            callback => {
                if (
                    typeof callback !==
                    'function'
                ) {
                    return () => {};
                }

                const handler =
                    (
                        _event,
                        action
                    ) => {
                        callback(
                            action
                        );
                    };

                ipcRenderer.on(
                    'menu:action',
                    handler
                );

                return () => {
                    ipcRenderer.removeListener(
                        'menu:action',
                        handler
                    );
                };
            },


        /* ============================================================
           WINDOW CONTROLS
           ============================================================ */

        minimize:
            () =>
                ipcRenderer.send(
                    'window:minimize'
                ),

        maximize:
            () =>
                ipcRenderer.send(
                    'window:maximize'
                ),

        close:
            () =>
                ipcRenderer.send(
                    'window:close'
                ),


        /* ============================================================
           DEVELOPER
           ============================================================ */

        openDevTools:
            () =>
                ipcRenderer.send(
                    'dev:open'
                )
    }
);


/*
 * Optional native water physics bridge.
 * Keep renderer JS fallback when native addon is unavailable.
 */
try {
    require(
        './engine/native/water/NativeWaterPreload.js'
    );
} catch (error) {
    console.warn(
        '[SM Native Water] NativeWaterPreload unavailable — JS/WASM fallback active.',
        error?.message || error
    );
}
