// src/services/EngineLauncherService.js
// SM Engine Launcher
//
// Fixes Windows "spawn EINVAL" when launching the DEVELOPMENT build.
//
// Main change:
//   Do NOT spawn npm.cmd directly with shell:false on Windows.
//   Prefer the real Electron executable installed inside the Engine:
//       <engine>\node_modules\electron\dist\electron.exe
//
// This also avoids inheriting possibly-invalid console handles from a GUI
// Electron Launcher by using stdio:"ignore".

'use strict';

const path = require('path');
const fs = require('fs');

const {
    spawn
} = require('child_process');


class EngineLauncherService {
    constructor(options = {}) {
        this.settingsManager =
            options.settingsManager ||
            null;

        this.process =
            null;

        this.lastLaunch =
            null;
    }


    getEnginePath() {
        const value =
            this.settingsManager
                ?.get('enginePath');

        if (!value) {
            return null;
        }

        return path.resolve(
            String(value)
        );
    }


    resolveDevelopmentElectron(
        enginePath
    ) {
        if (!enginePath) {
            return null;
        }


        const candidates =
            process.platform ===
            'win32'
                ? [
                    path.join(
                        enginePath,
                        'node_modules',
                        'electron',
                        'dist',
                        'electron.exe'
                    )
                ]
                : [
                    path.join(
                        enginePath,
                        'node_modules',
                        'electron',
                        'dist',
                        'electron'
                    )
                ];


        return (
            candidates.find(
                candidate => {
                    try {
                        return (
                            fs.existsSync(
                                candidate
                            ) &&
                            fs.statSync(
                                candidate
                            ).isFile()
                        );
                    } catch {
                        return false;
                    }
                }
            ) ||
            null
        );
    }


    async detectInstallation() {
        const enginePath =
            this.getEnginePath();


        if (!enginePath) {
            return {
                installed: false,
                enginePath: null,
                mode: null,
                executable: null,
                developmentExecutable:
                    null,
                packageJson: null
            };
        }


        const exeCandidates = [
            path.join(
                enginePath,
                'SM Engine.exe'
            ),

            path.join(
                enginePath,
                'dist-win',
                'win-unpacked',
                'SM Engine.exe'
            )
        ];


        const executable =
            exeCandidates.find(
                candidate => {
                    try {
                        return (
                            fs.existsSync(
                                candidate
                            ) &&
                            fs.statSync(
                                candidate
                            ).isFile()
                        );
                    } catch {
                        return false;
                    }
                }
            ) ||
            null;


        const packageJsonPath =
            path.join(
                enginePath,
                'package.json'
            );


        let packageJson =
            null;


        if (
            fs.existsSync(
                packageJsonPath
            )
        ) {
            try {
                packageJson =
                    JSON.parse(
                        fs.readFileSync(
                            packageJsonPath,
                            'utf8'
                        )
                    );
            } catch (error) {
                console.warn(
                    '[SM Launcher] Could not read engine package.json:',
                    error
                );
            }
        }


        const developmentExecutable =
            packageJson
                ? this
                    .resolveDevelopmentElectron(
                        enginePath
                    )
                : null;


        return {
            installed:
                !!executable ||
                !!packageJson,

            enginePath,

            executable,

            developmentExecutable,

            mode:
                executable
                    ? 'packaged'
                    : packageJson
                        ? 'development'
                        : null,

            packageJson:
                packageJson
                    ? {
                        name:
                            packageJson.name ||
                            null,

                        version:
                            packageJson.version ||
                            null,

                        productName:
                            packageJson.build
                                ?.productName ||
                            null,

                        main:
                            packageJson.main ||
                            null,

                        startScript:
                            packageJson.scripts
                                ?.start ||
                            null
                    }
                    : null
        };
    }


    buildEngineArgs(options = {}) {
        const args = [];


        const gpuMode =
            String(
                options.gpuMode ||
                this.settingsManager
                    ?.get('gpuMode') ||
                'automatic'
            )
                .trim()
                .toLowerCase();


        if (
            gpuMode ===
                'hardware' ||
            gpuMode.includes(
                'd3d11'
            )
        ) {
            args.push(
                '--sm-hardware-gpu'
            );
        }


        if (
            gpuMode ===
                'software' ||
            gpuMode.includes(
                'swiftshader'
            )
        ) {
            args.push(
                '--sm-software-gpu'
            );
        }


        if (
            options.safeMode ===
            true
        ) {
            args.push(
                '--sm-safe-mode'
            );
        }


        if (
            options.devTools ===
            true
        ) {
            args.push(
                '--sm-dev-tools'
            );
        }


        if (
            options.projectPath
        ) {
            const projectPath =
                path.resolve(
                    String(
                        options.projectPath
                    )
                );


            args.push(
                '--sm-project',
                projectPath
            );
        }


        return args;
    }


    buildLaunchCommand(
        installation,
        engineArgs
    ) {
        if (
            installation.mode ===
            'packaged'
        ) {
            return {
                command:
                    installation.executable,

                args:
                    engineArgs,

                strategy:
                    'packaged-executable'
            };
        }


        /*
         * DEVELOPMENT MODE
         *
         * On Windows, spawning npm.cmd directly with:
         *
         *     spawn('npm.cmd', args, { shell:false })
         *
         * can fail with:
         *
         *     Error: spawn EINVAL
         *
         * Electron itself is already installed locally because the Engine can
         * run with `npm start`. Launch the actual electron.exe instead.
         */
        if (
            installation
                .developmentExecutable
        ) {
            return {
                command:
                    installation
                        .developmentExecutable,

                /*
                 * Electron CLI:
                 *
                 * electron <app-path> [app args...]
                 *
                 * The Engine receives --sm-project in process.argv.
                 */
                args: [
                    installation
                        .enginePath,

                    ...engineArgs
                ],

                strategy:
                    'local-electron-executable'
            };
        }


        /*
         * Fallback only when node_modules/electron/dist/electron(.exe)
         * is unavailable.
         *
         * On Windows invoke npm.cmd through cmd.exe instead of spawning the
         * .cmd file directly.
         */
        if (
            process.platform ===
            'win32'
        ) {
            const command =
                process.env.ComSpec ||
                process.env.COMSPEC ||
                path.join(
                    process.env.SystemRoot ||
                        'C:\\Windows',
                    'System32',
                    'cmd.exe'
                );


            return {
                command,

                args: [
                    '/d',
                    '/s',
                    '/c',
                    'npm.cmd',
                    'start',
                    '--',
                    ...engineArgs
                ],

                strategy:
                    'cmd-npm-fallback'
            };
        }


        return {
            command:
                'npm',

            args: [
                'start',
                '--',
                ...engineArgs
            ],

            strategy:
                'npm-fallback'
        };
    }


    async launch(options = {}) {
        if (
            this.process &&
            !this.process.killed
        ) {
            return {
                ok: false,

                alreadyRunning:
                    true,

                pid:
                    this.process.pid ||
                    null
            };
        }


        const installation =
            await this
                .detectInstallation();


        if (
            !installation.installed
        ) {
            throw new Error(
                `SM Engine installation not found at: ${installation.enginePath || '(not configured)'}`
            );
        }


        if (
            !installation.enginePath ||
            !fs.existsSync(
                installation.enginePath
            )
        ) {
            throw new Error(
                `SM Engine directory does not exist: ${installation.enginePath || '(missing)'}`
            );
        }


        const engineArgs =
            this.buildEngineArgs(
                options
            );


        const launchCommand =
            this.buildLaunchCommand(
                installation,
                engineArgs
            );


        const command =
            launchCommand.command;

        const args =
            launchCommand.args;

        const cwd =
            installation.enginePath;


        console.info(
            '[SM Launcher] Launching engine:',
            {
                strategy:
                    launchCommand
                        .strategy,

                command,

                args,

                cwd,

                projectPath:
                    options.projectPath ||
                    null
            }
        );


        let child;


        try {
            /*
             * stdio:"ignore" is intentional.
             *
             * A packaged/GUI Electron Launcher may not own valid console
             * handles. Using stdio:"inherit" can itself trigger Windows spawn
             * errors in that situation.
             */
            child =
                spawn(
                    command,
                    args,
                    {
                        cwd,

                        detached:
                            false,

                        stdio:
                            'ignore',

                        windowsHide:
                            false,

                        shell:
                            false
                    }
                );
        } catch (error) {
            console.error(
                '[SM Launcher] spawn() failed synchronously:',
                {
                    error,
                    command,
                    args,
                    cwd,
                    strategy:
                        launchCommand
                            .strategy
                }
            );


            throw new Error(
                `Could not start SM Engine (${error?.code || 'spawn error'}): ${error?.message || String(error)}`
            );
        }


        this.process =
            child;


        this.lastLaunch = {
            timestamp:
                Date.now(),

            command,

            args,

            cwd,

            strategy:
                launchCommand.strategy,

            mode:
                installation.mode,

            projectPath:
                options.projectPath ||
                null,

            pid:
                child.pid ||
                null
        };


        /*
         * Wait until Node confirms that the child process was spawned.
         * This makes project:launch report a real failure instead of returning
         * {ok:true} before the process has actually started.
         */
        await new Promise(
            (
                resolve,
                reject
            ) => {
                let settled =
                    false;


                const finishSuccess =
                    () => {
                        if (settled) {
                            return;
                        }

                        settled =
                            true;

                        resolve();
                    };


                const finishError =
                    error => {
                        if (settled) {
                            return;
                        }

                        settled =
                            true;

                        this.process =
                            null;

                        reject(
                            error
                        );
                    };


                child.once(
                    'spawn',
                    finishSuccess
                );


                child.once(
                    'error',
                    finishError
                );
            }
        ).catch(
            error => {
                console.error(
                    '[SM Launcher] Engine process could not spawn:',
                    error
                );


                throw new Error(
                    `Could not start SM Engine (${error?.code || 'spawn error'}): ${error?.message || String(error)}`
                );
            }
        );


        child.on(
            'error',
            error => {
                console.error(
                    '[SM Launcher] Engine process error:',
                    error
                );

                this.process =
                    null;
            }
        );


        child.once(
            'exit',
            (
                code,
                signal
            ) => {
                console.info(
                    '[SM Launcher] Engine process exited:',
                    {
                        code,
                        signal
                    }
                );

                this.process =
                    null;
            }
        );


        return {
            ok: true,

            pid:
                child.pid ||
                null,

            mode:
                installation.mode,

            strategy:
                launchCommand.strategy,

            enginePath:
                installation.enginePath,

            executable:
                installation.executable ||
                installation
                    .developmentExecutable ||
                null,

            args:
                engineArgs
        };
    }


    stop() {
        if (
            !this.process ||
            this.process.killed
        ) {
            return {
                ok: true,
                running: false
            };
        }


        try {
            this.process.kill();

            this.process =
                null;


            return {
                ok: true,
                running: false
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


    getStatus() {
        return {
            running:
                !!this.process &&
                !this.process.killed,

            pid:
                this.process
                    ?.pid ||
                null,

            lastLaunch:
                this.lastLaunch
        };
    }
}


module.exports = {
    EngineLauncherService
};