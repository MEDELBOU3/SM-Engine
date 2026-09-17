// engine/importers/blender/BlenderDetector.js
// SM Engine — Blender executable discovery and validation.
// Prefers the secure preload/Main-process bridge; direct Node is legacy fallback.
(function () {
    'use strict';

    const STORAGE_KEY =
        'sm_blender_executable';


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
                os:
                    req('os'),
                childProcess:
                    req('child_process')
            };
        } catch (_) {
            return null;
        }
    }


    function unique(
        values
    ) {
        return [
            ...new Set(
                values.filter(
                    Boolean
                )
            )
        ];
    }


    class BlenderDetector {

        constructor() {
            this.node =
                getNode();

            this._cachedResult =
                null;
        }


        get bridge() {
            return (
                window.electronAPI
                    ?.blender ||
                null
            );
        }


        get preferredPath() {
            try {
                return (
                    localStorage.getItem(
                        STORAGE_KEY
                    ) ||
                    null
                );
            } catch (_) {
                return null;
            }
        }


        setPreferredPath(
            executablePath
        ) {
            try {
                if (executablePath) {
                    localStorage.setItem(
                        STORAGE_KEY,
                        executablePath
                    );
                } else {
                    localStorage.removeItem(
                        STORAGE_KEY
                    );
                }
            } catch (_) {}

            this._cachedResult =
                null;

            return (
                executablePath ||
                null
            );
        }


        isNodeAvailable() {
            return !!this.node;
        }


        isAvailable() {
            return !!(
                this.bridge?.detect ||
                this.node
            );
        }


        _windowsCandidates() {
            if (!this.node) {
                return [];
            }

            const env =
                (
                    typeof process !==
                        'undefined' &&
                    process.env
                ) ||
                {};

            const roots =
                unique([
                    env.ProgramFiles,
                    env['ProgramFiles(x86)'],
                    env.LOCALAPPDATA
                ]);

            const out = [
                'blender.exe',
                'blender'
            ];

            for (
                const root
                of roots
            ) {
                const foundation =
                    this.node.path.join(
                        root,
                        'Blender Foundation'
                    );

                try {
                    if (
                        this.node.fs.existsSync(
                            foundation
                        )
                    ) {
                        const names =
                            this.node.fs.readdirSync(
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
                            const name
                            of names
                        ) {
                            out.push(
                                this.node.path.join(
                                    foundation,
                                    name,
                                    'blender.exe'
                                )
                            );
                        }
                    }
                } catch (_) {}
            }

            return out;
        }


        _macCandidates() {
            return [
                '/Applications/Blender.app/Contents/MacOS/Blender',
                '/Applications/Blender 4.app/Contents/MacOS/Blender',
                'blender'
            ];
        }


        _linuxCandidates() {
            return [
                '/usr/bin/blender',
                '/usr/local/bin/blender',
                '/snap/bin/blender',
                '/var/lib/flatpak/exports/bin/org.blender.Blender',
                'blender'
            ];
        }


        getCandidates() {
            const preferred =
                this.preferredPath;

            if (!this.node) {
                return unique([
                    preferred
                ]);
            }

            const platform =
                (
                    typeof process !==
                        'undefined' &&
                    process.platform
                ) ||
                this.node.os.platform();

            let platformCandidates =
                [];

            if (
                platform ===
                'win32'
            ) {
                platformCandidates =
                    this._windowsCandidates();
            }
            else if (
                platform ===
                'darwin'
            ) {
                platformCandidates =
                    this._macCandidates();
            }
            else {
                platformCandidates =
                    this._linuxCandidates();
            }

            return unique([
                preferred,
                ...platformCandidates
            ]);
        }


        _looksLikeBareCommand(
            candidate
        ) {
            return !!candidate &&
                !candidate.includes('/') &&
                !candidate.includes('\\');
        }


        exists(
            candidate
        ) {
            if (
                !candidate ||
                !this.node
            ) {
                return false;
            }

            if (
                this._looksLikeBareCommand(
                    candidate
                )
            ) {
                return true;
            }

            try {
                return this.node.fs.existsSync(
                    candidate
                );
            } catch (_) {
                return false;
            }
        }


        async validatePath(
            candidate,
            {
                timeoutMs = 7000
            } = {}
        ) {
            if (!candidate) {
                return {
                    valid: false,
                    path: null,
                    reason:
                        'Missing Blender executable path.'
                };
            }

            /*
             * Preferred secure Electron path.
             */
            if (
                typeof this.bridge?.validate ===
                    'function'
            ) {
                try {
                    return await this.bridge.validate(
                        candidate
                    );
                } catch (error) {
                    return {
                        valid: false,
                        path:
                            candidate,
                        reason:
                            error?.message ||
                            String(error)
                    };
                }
            }

            /*
             * Legacy fallback for older non-isolated Electron builds.
             */
            if (!this.node) {
                return {
                    valid: false,
                    path:
                        candidate,
                    reason:
                        'Secure Blender IPC bridge is unavailable.'
                };
            }

            if (
                !this.exists(
                    candidate
                )
            ) {
                return {
                    valid: false,
                    path:
                        candidate,
                    reason:
                        'Executable does not exist.'
                };
            }

            return new Promise(
                resolve => {
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

                    let child =
                        null;

                    try {
                        child =
                            this.node.childProcess.spawn(
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

                    let stdout =
                        '';

                    let stderr =
                        '';

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
                                    child.kill();
                                } catch (_) {}

                                finish({
                                    valid: false,
                                    path:
                                        candidate,
                                    reason:
                                        `Validation timed out after ${timeoutMs} ms.`
                                });
                            },
                            timeoutMs
                        );
                }
            );
        }


        async detect({
            force = false
        } = {}) {
            if (
                !force &&
                this._cachedResult?.valid
            ) {
                return this._cachedResult;
            }

            /*
             * Secure preload -> main process detection.
             */
            if (
                typeof this.bridge?.detect ===
                    'function'
            ) {
                try {
                    const result =
                        await this.bridge.detect({
                            preferredPath:
                                this.preferredPath,
                            force
                        });

                    this._cachedResult =
                        result;

                    return result;
                } catch (error) {
                    const result = {
                        valid: false,
                        path: null,
                        reason:
                            error?.message ||
                            String(error)
                    };

                    this._cachedResult =
                        result;

                    return result;
                }
            }

            /*
             * Legacy direct Node fallback.
             */
            if (!this.node) {
                const result = {
                    valid: false,
                    path: null,
                    reason:
                        'Blender import requires the SM Engine desktop build with the Blender preload bridge.'
                };

                this._cachedResult =
                    result;

                return result;
            }

            for (
                const candidate
                of this.getCandidates()
            ) {
                const result =
                    await this.validatePath(
                        candidate
                    );

                if (result.valid) {
                    this._cachedResult =
                        result;

                    return result;
                }
            }

            const result = {
                valid: false,
                path: null,
                reason:
                    'Blender was not found. Install Blender or configure the executable path.'
            };

            this._cachedResult =
                result;

            return result;
        }


        clearCache() {
            this._cachedResult =
                null;
        }
    }


    window.BlenderDetector =
        BlenderDetector;

    window.smBlenderDetector =
        window.smBlenderDetector ||
        new BlenderDetector();
})();