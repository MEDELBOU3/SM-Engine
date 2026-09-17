// electron-main.js
// SM Engine Electron main process
// Includes:
// - GPU backend selection
// - Application icon
// - Native window lifecycle
// - Existing preload IPC APIs
// - Launcher -> Engine project handoff
// - Physical project filesystem synchronization

'use strict';


const {
    app,
    BrowserWindow,
    Menu,
    nativeImage,
    ipcMain,
    dialog,
    net
} = require('electron');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');


// ================================================================
// BLENDSWAP
// ================================================================

const {
    registerBlendSwapIPC
} = require(
    './electron/BlendSwapMainService'
);


const {
    SMLauncherProjectIPC
} = require(
    './engine/project/integration/SMLauncherProjectIPC.js'
);


const {
    SMProjectFilesystemIPC
} = require(
    './engine/project/integration/SMProjectFilesystemIPC.js'
);


const {
    SMProjectFilesystemWatcherIPC
} = require(
    './engine/project/integration/SMProjectFilesystemWatcherIPC.js'
);


/* ================================================================
   APPLICATION CONSTANTS
   ================================================================ */

const APP_ID =
    'com.smengine.app';

const SOFTWARE_GPU_SWITCH =
    'sm-software-gpu';

const HARDWARE_GPU_SWITCH =
    'sm-hardware-gpu';


/* ================================================================
   GPU BACKEND SELECTION
   ================================================================ */

const hardwareGpuRequested =
    process.argv.includes(
        '--' + HARDWARE_GPU_SWITCH
    ) ||
    process.env.SM_ENGINE_HARDWARE_GPU ===
        '1';


const softwareGpuRequested =
    !hardwareGpuRequested &&
    (
        process.argv.includes(
            '--' + SOFTWARE_GPU_SWITCH
        ) ||
        process.env.SM_ENGINE_SOFTWARE_GPU ===
            '1'
    );


if (softwareGpuRequested) {
    app.commandLine.appendSwitch(
        'use-angle',
        'swiftshader'
    );

    app.commandLine.appendSwitch(
        'enable-webgl'
    );
}
else if (
    process.platform ===
    'win32'
) {
    app.commandLine.appendSwitch(
        'use-angle',
        'd3d11'
    );

    app.commandLine.appendSwitch(
        'enable-webgl'
    );

    app.commandLine.appendSwitch(
        'ignore-gpu-blocklist'
    );
}


/* ================================================================
   GPU CRASH RECOVERY
   ================================================================ */

// A broken D3D11 / GPU process leaves the renderer white and can cause the
// whole Electron window to exit. Retry once with the project's existing
// SwiftShader switch instead of silently closing the editor. The switch is
// already honoured above, so the relaunched process cannot loop here.
let gpuRecoveryRequested = false;

app.on(
    'child-process-gone',
    (_event, details) => {
        if (
            details?.type !== 'GPU' ||
            softwareGpuRequested ||
            gpuRecoveryRequested
        ) {
            return;
        }

        gpuRecoveryRequested = true;

        console.error(
            '[SM Engine] GPU process stopped. Relaunching in safe graphics mode.',
            details
        );

        app.relaunch({
            args: [
                ...process.argv.slice(1),
                '--' + SOFTWARE_GPU_SWITCH
            ]
        });

        app.exit(0);
    }
);


/* ================================================================
   LAUNCHER -> ENGINE PROJECT HANDOFF
   ================================================================ */

/*
 * The Launcher starts SM Engine with:
 *
 *   --sm-project "C:\Projects\MyProject"
 *
 * Resolve the startup project only once for this application process.
 */
const launcherStartupProject =
    SMLauncherProjectIPC
        .resolveStartupProject(
            process.argv
        );


/*
 * Renderer-side ProjectBootstrap asks for this descriptor through preload.
 *
 * Keep this handler outside createWindow() so it is registered only once.
 */
ipcMain.handle(
    'sm-project:get-launcher-startup',
    async () => {
        return launcherStartupProject;
    }
);


/* ================================================================
   PROJECT FILESYSTEM SYNCHRONIZATION IPC
   ================================================================ */

/*
 * Provides the secure main-process implementation for:
 *
 *   projectFilesystem.writeText()
 *   projectFilesystem.writeBinary()
 *   projectFilesystem.ensureDirectory()
 *   projectFilesystem.mergeManifest()
 *
 * The implementation validates every path against the physical project root.
 */
SMProjectFilesystemIPC.register(
    ipcMain
);


/*
 * Watches physical Launcher-linked project folders and exposes safe read/stat
 * operations to the renderer-side import coordinator.
 */
SMProjectFilesystemWatcherIPC.register(
    ipcMain
);


/* ================================================================
   BLENDER IMPORT — SECURE MAIN-PROCESS IPC
   ================================================================ */

/*
 * IMPORTANT SECURITY MODEL
 * ------------------------
 * The renderer does NOT receive fs/path/child_process.
 *
 * Renderer:
 *   window.electronAPI.blender.detect()
 *   window.electronAPI.blender.validate(path)
 *   window.electronAPI.blender.convert({ sourcePath, ... })
 *   window.electronAPI.blender.cancel()
 *
 * Main process:
 *   - validates that the executable is really named blender / blender.exe
 *   - validates that the selected source is a real .blend file
 *   - always uses SM Engine's own fixed export_sm.py
 *   - creates the conversion cache directory itself
 *   - starts Blender with shell:false
 *   - returns GLB bytes + parsed metadata to the renderer
 */

const smBlenderActiveProcesses =
    new Map();

let smBlenderDetectedCache =
    null;


function smIsAllowedBlenderExecutable(
    candidate
) {
    if (
        typeof candidate !==
        'string'
    ) {
        return false;
    }

    const trimmed =
        candidate.trim();

    if (!trimmed) {
        return false;
    }

    /*
     * "blender" is allowed so PATH-based installations work.
     * Full paths must still end in blender or blender.exe.
     */
    const base =
        path.basename(
            trimmed
        ).toLowerCase();

    return (
        base === 'blender' ||
        base === 'blender.exe'
    );
}


function smUniquePaths(
    values
) {
    const out =
        [];

    const seen =
        new Set();

    for (const value of values) {
        if (
            typeof value !==
            'string'
        ) {
            continue;
        }

        const trimmed =
            value.trim();

        if (
            !trimmed ||
            seen.has(
                trimmed.toLowerCase()
            )
        ) {
            continue;
        }

        seen.add(
            trimmed.toLowerCase()
        );

        out.push(
            trimmed
        );
    }

    return out;
}


function smGetBlenderCandidates(
    preferredPath = null
) {
    const candidates =
        [];

    if (preferredPath) {
        candidates.push(
            preferredPath
        );
    }

    if (
        process.platform ===
        'win32'
    ) {
        const roots =
            smUniquePaths([
                process.env.ProgramFiles,
                process.env['ProgramFiles(x86)'],
                process.env.LOCALAPPDATA
            ]);

        for (const root of roots) {
            const foundation =
                path.join(
                    root,
                    'Blender Foundation'
                );

            /*
             * Discover installed versions dynamically instead of hard-coding
             * Blender 4.x/5.x folder names.
             */
            try {
                if (
                    fs.existsSync(
                        foundation
                    )
                ) {
                    const directories =
                        fs.readdirSync(
                            foundation,
                            {
                                withFileTypes:
                                    true
                            }
                        )
                            .filter(
                                entry =>
                                    entry.isDirectory()
                            )
                            .map(
                                entry =>
                                    entry.name
                            )
                            .sort()
                            .reverse();

                    for (
                        const directory
                        of directories
                    ) {
                        candidates.push(
                            path.join(
                                foundation,
                                directory,
                                'blender.exe'
                            )
                        );
                    }
                }
            } catch (_) {}

            candidates.push(
                path.join(
                    foundation,
                    'Blender',
                    'blender.exe'
                )
            );
        }

        /*
         * PATH fallback.
         */
        candidates.push(
            'blender.exe',
            'blender'
        );
    }
    else if (
        process.platform ===
        'darwin'
    ) {
        candidates.push(
            '/Applications/Blender.app/Contents/MacOS/Blender',
            '/Applications/Blender 4.app/Contents/MacOS/Blender',
            'blender'
        );
    }
    else {
        candidates.push(
            '/usr/bin/blender',
            '/usr/local/bin/blender',
            '/snap/bin/blender',
            '/var/lib/flatpak/exports/bin/org.blender.Blender',
            'blender'
        );
    }

    return smUniquePaths(
        candidates
    );
}


function smValidateBlenderExecutable(
    candidate,
    {
        timeoutMs = 7000
    } = {}
) {
    return new Promise(
        resolve => {
            if (
                !smIsAllowedBlenderExecutable(
                    candidate
                )
            ) {
                resolve({
                    valid: false,
                    path:
                        candidate ||
                        null,
                    reason:
                        'Only Blender executables are allowed.'
                });

                return;
            }

            /*
             * For full paths, fail early if the file is missing.
             * Bare commands such as "blender" are resolved through PATH by spawn.
             */
            const isBare =
                !candidate.includes('/') &&
                !candidate.includes('\\');

            if (
                !isBare &&
                !fs.existsSync(
                    candidate
                )
            ) {
                resolve({
                    valid: false,
                    path:
                        candidate,
                    reason:
                        'Blender executable does not exist.'
                });

                return;
            }

            let child =
                null;

            let stdout =
                '';

            let stderr =
                '';

            let settled =
                false;

            const finish =
                result => {
                    if (settled) {
                        return;
                    }

                    settled = true;

                    clearTimeout(
                        timer
                    );

                    resolve(
                        result
                    );
                };

            try {
                child =
                    childProcess.spawn(
                        candidate,
                        [
                            '--version'
                        ],
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
                finish({
                    valid: false,
                    path:
                        candidate,
                    reason:
                        error?.message ||
                        String(error)
                });

                return;
            }

            child.stdout?.on(
                'data',
                chunk => {
                    stdout +=
                        String(chunk);
                }
            );

            child.stderr?.on(
                'data',
                chunk => {
                    stderr +=
                        String(chunk);
                }
            );

            child.once(
                'error',
                error => {
                    finish({
                        valid: false,
                        path:
                            candidate,
                        reason:
                            error?.message ||
                            String(error)
                    });
                }
            );

            child.once(
                'close',
                code => {
                    const output =
                        `${stdout}\n${stderr}`
                            .trim();

                    const versionMatch =
                        output.match(
                            /Blender\s+([0-9]+(?:\.[0-9]+){1,2})/i
                        );

                    finish({
                        valid:
                            code === 0 &&
                            /Blender/i.test(
                                output
                            ),
                        path:
                            candidate,
                        version:
                            versionMatch?.[1] ||
                            null,
                        output,
                        exitCode:
                            code
                    });
                }
            );

            const timer =
                setTimeout(
                    () => {
                        try {
                            child?.kill?.();
                        } catch (_) {}

                        finish({
                            valid: false,
                            path:
                                candidate,
                            reason:
                                `Blender validation timed out after ${timeoutMs} ms.`
                        });
                    },
                    timeoutMs
                );
        }
    );
}


async function smDetectBlender({
    preferredPath = null,
    force = false
} = {}) {
    if (
        !force &&
        smBlenderDetectedCache?.valid
    ) {
        /*
         * If renderer changed the preferred path, validate that path instead of
         * blindly returning an older cached install.
         */
        if (
            !preferredPath ||
            preferredPath ===
                smBlenderDetectedCache.path
        ) {
            return smBlenderDetectedCache;
        }
    }

    for (
        const candidate
        of smGetBlenderCandidates(
            preferredPath
        )
    ) {
        const result =
            await smValidateBlenderExecutable(
                candidate
            );

        if (result.valid) {
            smBlenderDetectedCache =
                result;

            return result;
        }
    }

    const result = {
        valid: false,
        path: null,
        version: null,
        reason:
            'Blender was not found. Install Blender or configure the Blender executable path.'
    };

    smBlenderDetectedCache =
        result;

    return result;
}


function smBlenderCacheDirectory(
    sourcePath
) {
    const stat =
        fs.statSync(
            sourcePath
        );

    const signature =
        [
            sourcePath,
            stat.size,
            stat.mtimeMs
        ].join('|');

    const hash =
        crypto
            .createHash(
                'sha1'
            )
            .update(
                signature
            )
            .digest(
                'hex'
            )
            .slice(
                0,
                12
            );

    const sourceDirectory =
        path.dirname(
            sourcePath
        );

    const baseName =
        path.basename(
            sourcePath,
            path.extname(
                sourcePath
            )
        );

    return path.join(
        sourceDirectory,
        '.smcache',
        'blender',
        `${baseName}_${hash}`
    );
}


function smBlenderExporterScriptPath() {
    return path.join(
        __dirname,
        'engine',
        'importers',
        'blender',
        'scripts',
        'export_sm.py'
    );
}


function smCancelBlenderForSender(
    senderId
) {
    const child =
        smBlenderActiveProcesses.get(
            senderId
        );

    if (!child) {
        return false;
    }

    try {
        child.kill();
    } catch (_) {}

    smBlenderActiveProcesses.delete(
        senderId
    );

    return true;
}


ipcMain.handle(
    'sm-blender:detect',
    async (
        _event,
        payload = {}
    ) => {
        return smDetectBlender({
            preferredPath:
                typeof payload.preferredPath ===
                    'string'
                    ? payload.preferredPath
                    : null,
            force:
                payload.force ===
                true
        });
    }
);


ipcMain.handle(
    'sm-blender:validate',
    async (
        _event,
        payload = {}
    ) => {
        return smValidateBlenderExecutable(
            String(
                payload.path ||
                ''
            )
        );
    }
);


ipcMain.handle(
    'sm-blender:cancel',
    async event => {
        return {
            cancelled:
                smCancelBlenderForSender(
                    event.sender.id
                )
        };
    }
);


ipcMain.handle(
    'sm-blender:convert',
    async (
        event,
        payload = {}
    ) => {
        const sourcePath =
            String(
                payload.sourcePath ||
                ''
            );

        if (
            !sourcePath ||
            path.extname(
                sourcePath
            ).toLowerCase() !==
                '.blend'
        ) {
            throw new Error(
                'A valid .blend source path is required.'
            );
        }

        if (
            !fs.existsSync(
                sourcePath
            ) ||
            !fs.statSync(
                sourcePath
            ).isFile()
        ) {
            throw new Error(
                `Blend file does not exist: ${sourcePath}`
            );
        }

        const detected =
            payload.blenderPath
                ? await smValidateBlenderExecutable(
                    String(
                        payload.blenderPath
                    )
                )
                : await smDetectBlender({
                    preferredPath:
                        typeof payload.preferredPath ===
                            'string'
                            ? payload.preferredPath
                            : null
                });

        if (
            !detected?.valid ||
            !detected.path
        ) {
            throw new Error(
                detected?.reason ||
                'Blender executable was not found.'
            );
        }

        const exportScriptPath =
            smBlenderExporterScriptPath();

        if (
            !fs.existsSync(
                exportScriptPath
            )
        ) {
            throw new Error(
                `SM Blender exporter script is missing: ${exportScriptPath}`
            );
        }

        const outputDir =
            smBlenderCacheDirectory(
                sourcePath
            );

        fs.mkdirSync(
            outputDir,
            {
                recursive:
                    true
            }
        );

        const outputGlb =
            path.join(
                outputDir,
                'scene.glb'
            );

        const metadataPath =
            path.join(
                outputDir,
                'metadata.json'
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
            payload.applyModifiers === false
                ? '0'
                : '1',
            '--animations',
            payload.exportAnimations === false
                ? '0'
                : '1',
            '--cameras',
            payload.exportCameras === false
                ? '0'
                : '1',
            '--lights',
            payload.exportLights === false
                ? '0'
                : '1'
        ];

        const senderId =
            event.sender.id;

        /*
         * One Blender conversion at a time per renderer. AssetsPanel's import
         * queue already processes files sequentially.
         */
        smCancelBlenderForSender(
            senderId
        );

        const startedAt =
            Date.now();

        return new Promise(
            (resolve, reject) => {
                let child =
                    null;

                let stdout =
                    '';

                let stderr =
                    '';

                const sendLog =
                    (
                        stream,
                        text
                    ) => {
                        if (
                            event.sender.isDestroyed?.()
                        ) {
                            return;
                        }

                        try {
                            event.sender.send(
                                'sm-blender:log',
                                {
                                    stream,
                                    text:
                                        String(text)
                                }
                            );
                        } catch (_) {}
                    };

                try {
                    child =
                        childProcess.spawn(
                            detected.path,
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

                smBlenderActiveProcesses.set(
                    senderId,
                    child
                );

                child.stdout?.on(
                    'data',
                    chunk => {
                        const text =
                            String(chunk);

                        stdout +=
                            text;

                        sendLog(
                            'stdout',
                            text
                        );
                    }
                );

                child.stderr?.on(
                    'data',
                    chunk => {
                        const text =
                            String(chunk);

                        stderr +=
                            text;

                        sendLog(
                            'stderr',
                            text
                        );
                    }
                );

                child.once(
                    'error',
                    error => {
                        smBlenderActiveProcesses.delete(
                            senderId
                        );

                        reject(
                            error
                        );
                    }
                );

                child.once(
                    'close',
                    code => {
                        smBlenderActiveProcesses.delete(
                            senderId
                        );

                        const ok =
                            code === 0 &&
                            fs.existsSync(
                                outputGlb
                            );

                        if (!ok) {
                            const error =
                                new Error(
                                    `Blender export failed with exit code ${code}.`
                                );

                            error.result = {
                                ok: false,
                                exitCode:
                                    code,
                                sourcePath,
                                outputDir,
                                outputGlb,
                                metadataPath,
                                stdout,
                                stderr,
                                durationMs:
                                    Date.now() -
                                    startedAt
                            };

                            reject(
                                error
                            );

                            return;
                        }

                        let metadata =
                            null;

                        if (
                            fs.existsSync(
                                metadataPath
                            )
                        ) {
                            try {
                                metadata =
                                    JSON.parse(
                                        fs.readFileSync(
                                            metadataPath,
                                            'utf8'
                                        )
                                    );
                            } catch (error) {
                                console.warn(
                                    '[SM Blender IPC] Could not parse metadata:',
                                    error
                                );
                            }
                        }

                        /*
                         * LARGE-FILE POLICY
                         * -----------------
                         * Keep converted GLB on disk by default. Sending a 100MB+
                         * Uint8Array through Electron IPC duplicates the payload
                         * across the main/renderer boundary and can stall the UI.
                         *
                         * The cache lives beside the .blend source:
                         *   <source dir>/.smcache/blender/<asset_hash>/scene.glb
                         * so renderer-side systems can load it on demand by path.
                         */
                        let glbSize =
                            0;

                        try {
                            glbSize =
                                Number(
                                    fs.statSync(
                                        outputGlb
                                    ).size
                                ) ||
                                0;
                        } catch (_) {}

                        const requestedInlineBytes =
                            payload.returnBytes ===
                            true;

                        const configuredInlineLimit =
                            Number(
                                payload.maxInlineBytes
                            );

                        const maxInlineBytes =
                            Number.isFinite(
                                configuredInlineLimit
                            ) &&
                            configuredInlineLimit >
                                0
                                ? configuredInlineLimit
                                : 32 *
                                    1024 *
                                    1024;

                        const mayInline =
                            requestedInlineBytes &&
                            glbSize > 0 &&
                            glbSize <=
                                maxInlineBytes;

                        let glbBytes =
                            null;

                        if (mayInline) {
                            const glbBuffer =
                                fs.readFileSync(
                                    outputGlb
                                );

                            glbBytes =
                                new Uint8Array(
                                    glbBuffer
                                );
                        }

                        resolve({
                            ok: true,
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
                                    ? 'ipc-inline'
                                    : 'filesystem',
                            bytesOmitted:
                                !glbBytes,
                            bytesOmittedReason:
                                !requestedInlineBytes
                                    ? 'disk-backed-request'
                                    : (
                                        glbSize >
                                        maxInlineBytes
                                            ? 'large-file'
                                            : null
                                    ),
                            blender:
                                detected,
                            stdout,
                            stderr,
                            durationMs:
                                Date.now() -
                                startedAt
                        });
                    }
                );
            }
        );
    }
);


/* ================================================================
   EXISTING NATIVE FILE IPC
   ================================================================ */

ipcMain.handle(
    'dialog:selectDirectory',
    async (event) => {
        const owner =
            BrowserWindow.fromWebContents(
                event.sender
            );

        const result =
            await dialog.showOpenDialog(
                owner || undefined,
                {
                    title:
                        'Select Directory',

                    properties: [
                        'openDirectory',
                        'createDirectory'
                    ]
                }
            );

        if (
            result.canceled ||
            !result.filePaths?.length
        ) {
            return null;
        }

        return result.filePaths[0];
    }
);


ipcMain.handle(
    'file:save',
    async (
        event,
        content,
        filename
    ) => {
        const owner =
            BrowserWindow.fromWebContents(
                event.sender
            );

        const safeDefaultName =
            String(
                filename ||
                'untitled.txt'
            );

        const result =
            await dialog.showSaveDialog(
                owner || undefined,
                {
                    title:
                        'Save File',

                    defaultPath:
                        safeDefaultName
                }
            );

        if (
            result.canceled ||
            !result.filePath
        ) {
            return {
                saved: false,
                canceled: true,
                path: null
            };
        }

        fs.writeFileSync(
            result.filePath,
            String(
                content ?? ''
            ),
            'utf8'
        );

        return {
            saved: true,
            canceled: false,
            path:
                result.filePath
        };
    }
);


/* ================================================================
   GEMINI AI — FIXED-ORIGIN NETWORK BRIDGE
   ================================================================ */

ipcMain.handle(
    'sm-ai:gemini-generate',
    async (_event, payload = {}) => {
        const apiKey = String(payload.apiKey || '').trim();
        const model = String(payload.model || '').trim();
        const body = payload.body;

        if (!apiKey || apiKey.length > 512) {
            return { ok: false, status: 400, error: 'A valid Gemini API key is required.' };
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
            return { ok: false, status: 400, error: 'Invalid Gemini model name.' };
        }

        const serialized = JSON.stringify(body || {});
        if (serialized.length > 2_000_000) {
            return { ok: false, status: 413, error: 'Gemini request is too large.' };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
            const response = await net.fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey
                    },
                    body: serialized,
                    signal: controller.signal
                }
            );
            const data = await response.json().catch(() => ({}));
            return {
                ok: response.ok,
                status: response.status,
                data,
                error: response.ok ? null : (data?.error?.message || response.statusText)
            };
        } catch (error) {
            return {
                ok: false,
                status: 0,
                error: error?.name === 'AbortError' ? 'Gemini request timed out.' : (error?.message || String(error))
            };
        } finally {
            clearTimeout(timeout);
        }
    }
);


/* ================================================================
   WINDOW CONTROL IPC
   ================================================================ */

function windowFromEvent(event) {
    return (
        BrowserWindow.fromWebContents(
            event.sender
        ) ||
        null
    );
}


ipcMain.on(
    'window:minimize',
    (event) => {
        windowFromEvent(event)
            ?.minimize();
    }
);


ipcMain.on(
    'window:maximize',
    (event) => {
        const win =
            windowFromEvent(event);

        if (!win) {
            return;
        }

        if (win.isMaximized()) {
            win.unmaximize();
        }
        else {
            win.maximize();
        }
    }
);


ipcMain.on(
    'window:close',
    (event) => {
        windowFromEvent(event)
            ?.close();
    }
);


ipcMain.on(
    'dev:open',
    (event) => {
        windowFromEvent(event)
            ?.webContents
            ?.openDevTools({
                mode: 'detach'
            });
    }
);


/* ================================================================
   APPLICATION ICON
   ================================================================ */

function resolveWindowIcon() {
    const iconFile =
        process.platform ===
        'win32'
            ? 'logo.ico'
            : 'logo.png';


    const iconPath =
        path.join(
            __dirname,
            'assets',
            'icons',
            iconFile
        );


    if (
        !fs.existsSync(
            iconPath
        )
    ) {
        console.error(
            `[SM Engine] Icon file does not exist: ${iconPath}`
        );

        return null;
    }


    const image =
        nativeImage
            .createFromPath(
                iconPath
            );


    if (image.isEmpty()) {
        console.error(
            `[SM Engine] Icon exists but Electron could not decode it: ${iconPath}`
        );

        return null;
    }


    console.log(
        '[SM Engine] Icon loaded:',
        {
            path:
                iconPath,

            size:
                image.getSize()
        }
    );


    return image;
}


/* ================================================================
   MAIN WINDOW
   ================================================================ */

function createWindow() {
    const appIcon =
        resolveWindowIcon();


    const win =
        new BrowserWindow({
            width: 1280,
            height: 800,

            minWidth: 960,
            minHeight: 640,

            title:
                'SM Engine',

            backgroundColor:
                '#1a1a1a',

            show:
                false,

            icon:
                appIcon ||
                undefined,

            webPreferences: {
                nodeIntegration:
                    false,

                contextIsolation:
                    true,

                preload:
                    path.join(
                        __dirname,
                        'preload.js'
                    )
            }
        });


    if (appIcon) {
        win.setIcon(
            appIcon
        );
    }


    win.loadFile(
        'index.html'
    );


    win.once(
        'ready-to-show',
        () => {
            win.show();
        }
    );


    return win;
}


/* ================================================================
   APPLICATION READY
   ================================================================ */

app.whenReady().then(() => {

    /*
     * Stable Windows application identity.
     */
    if (
        process.platform ===
        'win32'
    ) {
        app.setAppUserModelId(
            APP_ID
        );
    }


    console.info(
        `[SM Engine] Graphics backend: ${
            softwareGpuRequested
                ? 'SwiftShader recovery'
                : 'hardware acceleration'
        }`
    );


    /*
     * Launcher handoff diagnostics.
     */
    if (
        launcherStartupProject
            .requested
    ) {
        if (
            launcherStartupProject
                .ready
        ) {
            console.info(
                '[SM Engine] Launcher project requested:',
                launcherStartupProject
                    .descriptor
                    .rootPath
            );
        }
        else {
            console.error(
                '[SM Engine] Launcher project is invalid:',
                launcherStartupProject
                    .error
            );
        }
    }
    else {
        console.info(
            '[SM Engine] Started without Launcher project argument.'
        );
    }

    registerBlendSwapIPC();
    createWindow();

    app.on(
        'activate',
        () => {
            if (
                BrowserWindow
                    .getAllWindows()
                    .length === 0
            ) {
                createWindow();
            }
        }
    );
});


/* ================================================================
   APPLICATION SHUTDOWN
   ================================================================ */

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