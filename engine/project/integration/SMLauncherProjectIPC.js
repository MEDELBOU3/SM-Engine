// engine/project/integration/SMLauncherProjectIPC.js
// Electron MAIN-process helper.
// Reads --sm-project from the Launcher and safely inspects the physical project folder.

'use strict';

const fs = require('fs');
const path = require('path');


class SMLauncherProjectIPC {
    static getProjectArgument(argv = process.argv) {
        const args = Array.isArray(argv)
            ? argv.map(value => String(value))
            : [];

        // --sm-project "C:\Projects\MyGame"
        const index = args.indexOf('--sm-project');

        if (index >= 0 && args[index + 1]) {
            return path.resolve(args[index + 1]);
        }

        // --sm-project=C:\Projects\MyGame
        const inline = args.find(
            value => value.startsWith('--sm-project=')
        );

        if (inline) {
            const value = inline.slice(
                '--sm-project='.length
            );

            if (value) {
                return path.resolve(value);
            }
        }

        return null;
    }


    static inspectProject(projectRoot) {
        const rootPath = path.resolve(
            String(projectRoot || '')
        );

        if (!rootPath) {
            throw new Error(
                '[SMLauncherProjectIPC] Project path is empty.'
            );
        }

        if (!fs.existsSync(rootPath)) {
            throw new Error(
                `[SMLauncherProjectIPC] Project folder does not exist: ${rootPath}`
            );
        }

        const stat = fs.statSync(rootPath);

        if (!stat.isDirectory()) {
            throw new Error(
                `[SMLauncherProjectIPC] Project path is not a directory: ${rootPath}`
            );
        }

        const manifestPath = path.join(
            rootPath,
            'project.smproject'
        );

        if (!fs.existsSync(manifestPath)) {
            throw new Error(
                `[SMLauncherProjectIPC] project.smproject was not found: ${manifestPath}`
            );
        }

        let manifest;

        try {
            manifest = JSON.parse(
                fs.readFileSync(
                    manifestPath,
                    'utf8'
                )
            );
        } catch (error) {
            throw new Error(
                `[SMLauncherProjectIPC] Invalid project.smproject: ${error.message}`
            );
        }

        if (!manifest || typeof manifest !== 'object') {
            throw new Error(
                '[SMLauncherProjectIPC] Project manifest must be an object.'
            );
        }

        const supported =
            manifest.schema === 'smproject' ||
            manifest.format === 'SM_PROJECT';

        if (!supported) {
            throw new Error(
                `[SMLauncherProjectIPC] Unsupported project manifest. schema=${String(
                    manifest.schema || ''
                )}, format=${String(manifest.format || '')}`
            );
        }

        const startupRelative =
            manifest.startupLevel ||
            manifest.startupScene ||
            null;

        const startupPath =
            startupRelative
                ? path.resolve(
                    rootPath,
                    startupRelative
                )
                : null;

        return {
            source: 'sm-engine-launcher',

            rootPath,
            manifestPath,

            manifest,

            projectId:
                manifest.projectId ||
                manifest.id ||
                null,

            name:
                manifest.name ||
                path.basename(rootPath),

            engineVersion:
                manifest.engineVersion ||
                null,

            type:
                manifest.type ||
                null,

            template:
                manifest.template ||
                null,

            startupRelative,
            startupPath,

            startupExists:
                !!startupPath &&
                fs.existsSync(startupPath)
        };
    }


    static resolveStartupProject(argv = process.argv) {
        const projectRoot =
            this.getProjectArgument(argv);

        if (!projectRoot) {
            return {
                requested: false,
                ready: false,
                descriptor: null,
                error: null
            };
        }

        try {
            return {
                requested: true,
                ready: true,
                descriptor:
                    this.inspectProject(projectRoot),
                error: null
            };
        } catch (error) {
            return {
                requested: true,
                ready: false,
                descriptor: null,
                error:
                    error?.message ||
                    String(error)
            };
        }
    }
}


module.exports = {
    SMLauncherProjectIPC
};