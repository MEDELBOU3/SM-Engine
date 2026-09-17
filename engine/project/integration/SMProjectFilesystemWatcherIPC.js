// engine/project/integration/SMProjectFilesystemWatcherIPC.js
// Electron MAIN-process external-change watcher for Launcher-linked projects.
//
// Responsibilities:
// - Watch the physical Windows project folder.
// - Read physical files through a narrow IPC API.
// - Never expose Node.js fs/path directly to the renderer.
// - Constrain every path to the selected project root.
//
// This file is MAIN-PROCESS ONLY.
// Do NOT add it to SMEngineScriptLoader app:[].

'use strict';

const fs = require('fs');
const path = require('path');


class SMProjectFilesystemWatcherIPC {
    static watchers = new Map();

    static normalizeRelativePath(value) {
        const raw =
            String(value || '')
                .replace(/\\/g, '/')
                .trim();

        if (!raw) {
            throw new Error(
                '[SMProjectFilesystemWatcherIPC] Relative path is required.'
            );
        }

        if (
            raw.startsWith('/') ||
            /^[A-Za-z]:\//.test(raw)
        ) {
            throw new Error(
                '[SMProjectFilesystemWatcherIPC] Absolute relative paths are not allowed.'
            );
        }

        const parts =
            raw
                .split('/')
                .filter(Boolean);

        if (
            parts.some(
                part =>
                    part === '.' ||
                    part === '..'
            )
        ) {
            throw new Error(
                '[SMProjectFilesystemWatcherIPC] Path traversal is not allowed.'
            );
        }

        return parts.join('/');
    }


    static ensureProjectRoot(rootPath) {
        const root =
            path.resolve(
                String(rootPath || '')
            );

        if (
            !fs.existsSync(root) ||
            !fs.statSync(root).isDirectory()
        ) {
            throw new Error(
                `[SMProjectFilesystemWatcherIPC] Invalid project root: ${root}`
            );
        }

        const manifestPath =
            path.join(
                root,
                'project.smproject'
            );

        if (!fs.existsSync(manifestPath)) {
            throw new Error(
                `[SMProjectFilesystemWatcherIPC] project.smproject was not found in: ${root}`
            );
        }

        return root;
    }


    static resolveInsideRoot(
        rootPath,
        relativePath
    ) {
        const root =
            this.ensureProjectRoot(
                rootPath
            );

        const relative =
            this.normalizeRelativePath(
                relativePath
            );

        const target =
            path.resolve(
                root,
                relative
            );

        const rootWithSep =
            root.endsWith(path.sep)
                ? root
                : root + path.sep;

        if (
            target !== root &&
            !target.startsWith(
                rootWithSep
            )
        ) {
            throw new Error(
                '[SMProjectFilesystemWatcherIPC] Resolved path escaped project root.'
            );
        }

        return {
            root,
            relative,
            target
        };
    }


    static isIgnored(relativePath) {
        const value =
            String(relativePath || '')
                .replace(/\\/g, '/')
                .replace(/^\/+/, '');

        if (!value) {
            return true;
        }

        return (
            value === '.smengine' ||
            value.startsWith('Saved/Logs/') ||
            value.startsWith('Saved/Autosaves/') ||
            value.startsWith('Intermediate/') ||
            value.includes('/node_modules/') ||
            value.startsWith('node_modules/')
        );
    }


    static isTextPath(relativePath) {
        const extension =
            path.extname(
                String(relativePath || '')
            )
                .toLowerCase();

        return new Set([
            '.json',
            '.smscene',
            '.smproject',
            '.txt',
            '.md',
            '.js',
            '.mjs',
            '.cjs',
            '.ts',
            '.tsx',
            '.jsx',
            '.html',
            '.htm',
            '.css',
            '.scss',
            '.xml',
            '.yml',
            '.yaml',
            '.ini',
            '.cfg',
            '.conf',
            '.csv',
            '.obj',
            '.mtl',
            '.glsl',
            '.vert',
            '.frag',
            '.wgsl'
        ]).has(extension);
    }


    static makeWatcherKey(
        webContentsId,
        rootPath
    ) {
        return (
            String(webContentsId) +
            '::' +
            path.resolve(
                String(rootPath || '')
            ).toLowerCase()
        );
    }


    static stopWatcherByKey(key) {
        const record =
            this.watchers.get(key);

        if (!record) {
            return false;
        }

        try {
            record.watcher?.close?.();
        }
        catch (_) {
            // Ignore close race.
        }

        if (record.timerMap) {
            for (
                const timer
                of record.timerMap.values()
            ) {
                clearTimeout(timer);
            }

            record.timerMap.clear();
        }

        this.watchers.delete(key);

        return true;
    }


    static stopWatch(
        event,
        {
            rootPath
        } = {}
    ) {
        const key =
            this.makeWatcherKey(
                event.sender.id,
                rootPath
            );

        return {
            stopped:
                this.stopWatcherByKey(
                    key
                )
        };
    }


    static startWatch(
        event,
        {
            rootPath
        } = {}
    ) {
        const root =
            this.ensureProjectRoot(
                rootPath
            );

        const key =
            this.makeWatcherKey(
                event.sender.id,
                root
            );

        this.stopWatcherByKey(
            key
        );

        const timerMap =
            new Map();


        const watcher =
            fs.watch(
                root,
                {
                    recursive: true
                },
                (
                    eventType,
                    filename
                ) => {
                    if (!filename) {
                        return;
                    }

                    let relative;

                    try {
                        relative =
                            this.normalizeRelativePath(
                                filename.toString()
                            );
                    }
                    catch {
                        return;
                    }

                    if (
                        this.isIgnored(
                            relative
                        )
                    ) {
                        return;
                    }

                    /*
                     * fs.watch can emit several notifications for one physical
                     * write. Debounce by relative path before notifying renderer.
                     */
                    const previous =
                        timerMap.get(
                            relative
                        );

                    if (previous) {
                        clearTimeout(
                            previous
                        );
                    }

                    const timer =
                        setTimeout(
                            () => {
                                timerMap.delete(
                                    relative
                                );

                                if (
                                    event.sender
                                        .isDestroyed()
                                ) {
                                    this.stopWatcherByKey(
                                        key
                                    );
                                    return;
                                }

                                let exists =
                                    false;

                                let isDirectory =
                                    false;

                                let size =
                                    0;

                                let modifiedAt =
                                    null;

                                try {
                                    const resolved =
                                        this.resolveInsideRoot(
                                            root,
                                            relative
                                        );

                                    if (
                                        fs.existsSync(
                                            resolved.target
                                        )
                                    ) {
                                        const stat =
                                            fs.statSync(
                                                resolved.target
                                            );

                                        exists =
                                            true;

                                        isDirectory =
                                            stat.isDirectory();

                                        size =
                                            stat.size;

                                        modifiedAt =
                                            stat.mtime
                                                .toISOString();
                                    }
                                }
                                catch (_) {
                                    // Treat as unavailable/deleted.
                                }

                                event.sender.send(
                                    'sm-project-fs:external-change',
                                    {
                                        rootPath:
                                            root,

                                        relativePath:
                                            relative,

                                        eventType,

                                        exists,

                                        isDirectory,

                                        size,

                                        modifiedAt
                                    }
                                );
                            },
                            180
                        );

                    timerMap.set(
                        relative,
                        timer
                    );
                }
            );


        watcher.on(
            'error',
            (error) => {
                if (
                    !event.sender
                        .isDestroyed()
                ) {
                    event.sender.send(
                        'sm-project-fs:watch-error',
                        {
                            rootPath:
                                root,

                            error:
                                error?.message ||
                                String(error)
                        }
                    );
                }
            }
        );


        this.watchers.set(
            key,
            {
                root,
                watcher,
                timerMap,
                webContentsId:
                    event.sender.id
            }
        );


        event.sender.once(
            'destroyed',
            () => {
                this.stopWatcherByKey(
                    key
                );
            }
        );


        return {
            watching: true,
            rootPath: root
        };
    }


    static stat({
        rootPath,
        relativePath
    } = {}) {
        const {
            relative,
            target
        } =
            this.resolveInsideRoot(
                rootPath,
                relativePath
            );

        if (
            !fs.existsSync(
                target
            )
        ) {
            return {
                exists: false,
                relativePath: relative
            };
        }

        const stat =
            fs.statSync(
                target
            );

        return {
            exists: true,
            relativePath: relative,
            isDirectory:
                stat.isDirectory(),
            isFile:
                stat.isFile(),
            size:
                stat.size,
            modifiedAt:
                stat.mtime
                    .toISOString()
        };
    }


    static readFile({
        rootPath,
        relativePath
    } = {}) {
        const {
            relative,
            target
        } =
            this.resolveInsideRoot(
                rootPath,
                relativePath
            );

        if (
            !fs.existsSync(
                target
            )
        ) {
            return {
                exists: false,
                relativePath: relative
            };
        }

        const stat =
            fs.statSync(
                target
            );

        if (stat.isDirectory()) {
            return {
                exists: true,
                isDirectory: true,
                relativePath: relative
            };
        }

        if (
            this.isTextPath(
                relative
            )
        ) {
            return {
                exists: true,
                isDirectory: false,
                kind: 'text',
                relativePath: relative,
                content:
                    fs.readFileSync(
                        target,
                        'utf8'
                    ),
                size:
                    stat.size,
                modifiedAt:
                    stat.mtime
                        .toISOString()
            };
        }

        const buffer =
            fs.readFileSync(
                target
            );

        return {
            exists: true,
            isDirectory: false,
            kind: 'binary',
            relativePath: relative,

            /*
             * Uint8Array is structured-clone friendly through Electron IPC.
             */
            bytes:
                Uint8Array.from(
                    buffer
                ),

            size:
                buffer.length,

            modifiedAt:
                stat.mtime
                    .toISOString()
        };
    }


    static register(ipcMain) {
        if (
            !ipcMain ||
            typeof ipcMain.handle !==
                'function'
        ) {
            throw new Error(
                '[SMProjectFilesystemWatcherIPC] ipcMain is required.'
            );
        }

        ipcMain.handle(
            'sm-project-fs-watch:start',
            async (
                event,
                payload
            ) =>
                this.startWatch(
                    event,
                    payload
                )
        );

        ipcMain.handle(
            'sm-project-fs-watch:stop',
            async (
                event,
                payload
            ) =>
                this.stopWatch(
                    event,
                    payload
                )
        );

        ipcMain.handle(
            'sm-project-fs-watch:stat',
            async (
                _event,
                payload
            ) =>
                this.stat(
                    payload
                )
        );

        ipcMain.handle(
            'sm-project-fs-watch:read-file',
            async (
                _event,
                payload
            ) =>
                this.readFile(
                    payload
                )
        );
    }
}


module.exports = {
    SMProjectFilesystemWatcherIPC
};