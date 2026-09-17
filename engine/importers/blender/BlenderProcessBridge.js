// engine/importers/blender/BlenderProcessBridge.js
// SM Engine — Blender headless process bridge.
// Secure Electron IPC first; direct Node child_process only as legacy fallback.
(function () {
    'use strict';


    function getNode() {
        const req =
            (
                typeof window !==
                    'undefined' &&
                typeof window.require ===
                    'function'
            )
                ? window.require
                : (
                    typeof require ===
                        'function'
                        ? require
                        : null
                );

        if (!req) {
            return null;
        }

        try {
            return {
                fs:
                    req('fs'),
                path:
                    req('path'),
                childProcess:
                    req('child_process')
            };
        } catch (_) {
            return null;
        }
    }


    function normalizeBytes(
        value
    ) {
        if (!value) {
            return null;
        }

        if (
            value instanceof
                Uint8Array
        ) {
            return value;
        }

        if (
            value instanceof
                ArrayBuffer
        ) {
            return new Uint8Array(
                value
            );
        }

        if (
            ArrayBuffer.isView(
                value
            )
        ) {
            return new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            );
        }

        /*
         * Electron structured clone may occasionally surface a plain object
         * depending on the runtime/version. Accept array-like byte payloads.
         */
        if (
            Array.isArray(
                value
            )
        ) {
            return new Uint8Array(
                value
            );
        }

        return null;
    }


    class BlenderProcessBridge {

        constructor() {
            this.node =
                getNode();

            this.activeProcess =
                null;

            this.lastRun =
                null;

            this.ipcActive =
                false;
        }


        get bridge() {
            return (
                window.electronAPI
                    ?.blender ||
                null
            );
        }


        isAvailable() {
            return !!(
                typeof this.bridge?.convert ===
                    'function' ||
                this.node
            );
        }


        _emit(
            name,
            detail = {}
        ) {
            try {
                window.dispatchEvent(
                    new CustomEvent(
                        name,
                        {
                            detail
                        }
                    )
                );
            } catch (_) {}
        }


        async cancel() {
            if (
                this.ipcActive &&
                typeof this.bridge?.cancel ===
                    'function'
            ) {
                try {
                    const result =
                        await this.bridge.cancel();

                    this.ipcActive =
                        false;

                    this._emit(
                        'sm:blender-import-cancelled'
                    );

                    return !!(
                        result?.cancelled
                    );
                } catch (_) {
                    return false;
                }
            }

            const child =
                this.activeProcess;

            if (!child) {
                return false;
            }

            try {
                child.kill();
            } catch (_) {}

            this.activeProcess =
                null;

            this._emit(
                'sm:blender-import-cancelled'
            );

            return true;
        }


        async _runIPC(
            options
        ) {
            const bridge =
                this.bridge;

            if (
                typeof bridge?.convert !==
                    'function'
            ) {
                throw new Error(
                    'Secure Blender Electron IPC bridge is unavailable.'
                );
            }

            let removeLogListener =
                null;

            if (
                typeof bridge.onLog ===
                    'function'
            ) {
                removeLogListener =
                    bridge.onLog(
                        detail => {
                            options.onLog?.(
                                detail
                            );

                            this._emit(
                                'sm:blender-import-process-log',
                                detail
                            );
                        }
                    );
            }

            const startedAt =
                performance.now();

            this.ipcActive =
                true;

            this._emit(
                'sm:blender-import-process-start',
                {
                    blenderPath:
                        options.blenderPath ||
                        null,
                    sourcePath:
                        options.sourcePath,
                    outputDir:
                        null,
                    metadataPath:
                        null,
                    transport:
                        'electron-ipc'
                }
            );

            try {
                const result =
                    await bridge.convert({
                        blenderPath:
                            options.blenderPath ||
                            null,
                        preferredPath:
                            window.smBlenderDetector
                                ?.preferredPath ||
                            null,
                        sourcePath:
                            options.sourcePath,
                        applyModifiers:
                            options.applyModifiers !==
                            false,
                        exportAnimations:
                            options.exportAnimations !==
                            false,
                        exportCameras:
                            options.exportCameras !==
                            false,
                        exportLights:
                            options.exportLights !==
                            false,
                        returnBytes:
                            options.returnBytes ===
                            true,
                        maxInlineBytes:
                            Number(
                                options.maxInlineBytes
                            ) ||
                            32 *
                                1024 *
                                1024
                    });

                const normalized = {
                    ...result,
                    glbBytes:
                        normalizeBytes(
                            result?.glbBytes
                        ),
                    outputGlb:
                        result?.outputGlb ||
                        result?.runtimePath ||
                        null,
                    runtimePath:
                        result?.runtimePath ||
                        result?.outputGlb ||
                        null,
                    glbSize:
                        Number(
                            result?.glbSize
                        ) ||
                        0,
                    storageMode:
                        result?.storageMode ||
                        (
                            result?.glbBytes
                                ? 'ipc-inline'
                                : 'filesystem'
                        ),
                    durationMs:
                        result?.durationMs ??
                        (
                            performance.now() -
                            startedAt
                        )
                };

                /*
                 * Path-only conversion is a valid success. Large GLBs must not
                 * be forced through IPC just to satisfy the renderer.
                 */
                if (
                    !normalized?.ok ||
                    (
                        !normalized.glbBytes &&
                        !normalized.outputGlb
                    )
                ) {
                    const error =
                        new Error(
                            'Blender IPC conversion returned neither GLB bytes nor a runtime GLB path.'
                        );

                    error.result =
                        normalized;

                    throw error;
                }

                this.lastRun =
                    normalized;

                this._emit(
                    'sm:blender-import-process-complete',
                    normalized
                );

                return normalized;
            } catch (error) {
                const detail =
                    error?.result ||
                    {
                        ok: false,
                        sourcePath:
                            options.sourcePath,
                        reason:
                            error?.message ||
                            String(error)
                    };

                this._emit(
                    'sm:blender-import-process-error',
                    detail
                );

                throw error;
            } finally {
                this.ipcActive =
                    false;

                try {
                    removeLogListener?.();
                } catch (_) {}
            }
        }


        _runDirect({
            blenderPath,
            sourcePath,
            outputDir,
            exportScriptPath,
            exportFileName = 'scene.glb',
            metadataFileName = 'metadata.json',
            applyModifiers = true,
            exportAnimations = true,
            exportCameras = true,
            exportLights = true,
            returnBytes = false,
            maxInlineBytes =
                32 * 1024 * 1024,
            onLog = null
        } = {}) {
            if (!this.node) {
                return Promise.reject(
                    new Error(
                        'Direct Blender process access is unavailable.'
                    )
                );
            }

            if (!blenderPath) {
                return Promise.reject(
                    new Error(
                        'Missing Blender executable path.'
                    )
                );
            }

            if (!sourcePath) {
                return Promise.reject(
                    new Error(
                        'Missing .blend source path.'
                    )
                );
            }

            if (!exportScriptPath) {
                return Promise.reject(
                    new Error(
                        'Missing export_sm.py path.'
                    )
                );
            }

            if (
                !this.node.fs.existsSync(
                    sourcePath
                )
            ) {
                return Promise.reject(
                    new Error(
                        `Blend file not found: ${sourcePath}`
                    )
                );
            }

            if (
                !this.node.fs.existsSync(
                    exportScriptPath
                )
            ) {
                return Promise.reject(
                    new Error(
                        `Exporter script not found: ${exportScriptPath}`
                    )
                );
            }

            this.node.fs.mkdirSync(
                outputDir,
                {
                    recursive:
                        true
                }
            );

            const outputGlb =
                this.node.path.join(
                    outputDir,
                    exportFileName
                );

            const metadataPath =
                this.node.path.join(
                    outputDir,
                    metadataFileName
                );

            const args = [
                '--background',
                '--disable-autoexec',
                sourcePath,
                '--python',
                exportScriptPath,
                '--',
                '--output',
                outputGlb,
                '--metadata',
                metadataPath,
                '--apply-modifiers',
                applyModifiers
                    ? '1'
                    : '0',
                '--animations',
                exportAnimations
                    ? '1'
                    : '0',
                '--cameras',
                exportCameras
                    ? '1'
                    : '0',
                '--lights',
                exportLights
                    ? '1'
                    : '0'
            ];

            const startedAt =
                performance.now();

            this._emit(
                'sm:blender-import-process-start',
                {
                    blenderPath,
                    sourcePath,
                    outputGlb,
                    metadataPath,
                    transport:
                        'direct-node'
                }
            );

            return new Promise(
                (resolve, reject) => {
                    let child =
                        null;

                    try {
                        child =
                            this.node.childProcess.spawn(
                                blenderPath,
                                args,
                                {
                                    windowsHide:
                                        true,
                                    shell:
                                        false,
                                    stdio: [
                                        'ignore',
                                        'pipe',
                                        'pipe'
                                    ]
                                }
                            );
                    } catch (error) {
                        reject(
                            error
                        );

                        return;
                    }

                    this.activeProcess =
                        child;

                    let stdout =
                        '';

                    let stderr =
                        '';

                    const handleLog =
                        (
                            stream,
                            chunk
                        ) => {
                            const text =
                                String(chunk);

                            if (
                                stream ===
                                'stdout'
                            ) {
                                stdout +=
                                    text;
                            } else {
                                stderr +=
                                    text;
                            }

                            onLog?.({
                                stream,
                                text
                            });

                            this._emit(
                                'sm:blender-import-process-log',
                                {
                                    stream,
                                    text
                                }
                            );
                        };

                    child.stdout?.on(
                        'data',
                        chunk =>
                            handleLog(
                                'stdout',
                                chunk
                            )
                    );

                    child.stderr?.on(
                        'data',
                        chunk =>
                            handleLog(
                                'stderr',
                                chunk
                            )
                    );

                    child.once(
                        'error',
                        error => {
                            this.activeProcess =
                                null;

                            reject(
                                error
                            );
                        }
                    );

                    child.once(
                        'close',
                        code => {
                            this.activeProcess =
                                null;

                            const ok =
                                code === 0 &&
                                this.node.fs.existsSync(
                                    outputGlb
                                );

                            let metadata =
                                null;

                            if (
                                this.node.fs.existsSync(
                                    metadataPath
                                )
                            ) {
                                try {
                                    metadata =
                                        JSON.parse(
                                            this.node.fs.readFileSync(
                                                metadataPath,
                                                'utf8'
                                            )
                                        );
                                } catch (_) {}
                            }

                            let glbSize =
                                0;

                            try {
                                glbSize =
                                    Number(
                                        this.node.fs.statSync(
                                            outputGlb
                                        ).size
                                    ) ||
                                    0;
                            } catch (_) {}

                            const inlineLimit =
                                Number.isFinite(
                                    Number(
                                        maxInlineBytes
                                    )
                                ) &&
                                Number(
                                    maxInlineBytes
                                ) >
                                    0
                                    ? Number(
                                        maxInlineBytes
                                    )
                                    : 32 *
                                        1024 *
                                        1024;

                            const shouldReadBytes =
                                ok &&
                                returnBytes ===
                                    true &&
                                glbSize > 0 &&
                                glbSize <=
                                    inlineLimit;

                            const glbBytes =
                                shouldReadBytes
                                    ? new Uint8Array(
                                        this.node.fs.readFileSync(
                                            outputGlb
                                        )
                                    )
                                    : null;

                            const result = {
                                ok,
                                exitCode:
                                    code,
                                sourcePath,
                                outputDir,
                                outputGlb,
                                runtimePath:
                                    outputGlb,
                                metadataPath,
                                metadata,
                                glbBytes,
                                glbSize,
                                storageMode:
                                    glbBytes
                                        ? 'direct-inline'
                                        : 'filesystem',
                                bytesOmitted:
                                    !glbBytes,
                                stdout,
                                stderr,
                                durationMs:
                                    performance.now() -
                                    startedAt
                            };

                            this.lastRun =
                                result;

                            if (!result.ok) {
                                const error =
                                    new Error(
                                        `Blender export failed with exit code ${code}.`
                                    );

                                error.result =
                                    result;

                                this._emit(
                                    'sm:blender-import-process-error',
                                    result
                                );

                                reject(
                                    error
                                );

                                return;
                            }

                            this._emit(
                                'sm:blender-import-process-complete',
                                result
                            );

                            resolve(
                                result
                            );
                        }
                    );
                }
            );
        }


        runConversion(
            options = {}
        ) {
            /*
             * Secure bridge wins whenever it is available.
             */
            if (
                typeof this.bridge?.convert ===
                    'function'
            ) {
                return this._runIPC(
                    options
                );
            }

            return this._runDirect(
                options
            );
        }
    }


    window.BlenderProcessBridge =
        BlenderProcessBridge;

    window.smBlenderProcessBridge =
        window.smBlenderProcessBridge ||
        new BlenderProcessBridge();
})();
