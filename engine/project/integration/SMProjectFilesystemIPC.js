// engine/project/integration/SMProjectFilesystemIPC.js
// Electron MAIN-process filesystem bridge for Launcher-linked projects.
//
// Security goals:
// - Renderer never receives fs/path directly.
// - Every write is constrained to the project root.
// - ".." traversal and absolute relative paths are rejected.
// - project.smproject is protected from blind overwrite by virtual storage.

'use strict';

const fs = require('fs');
const path = require('path');


class SMProjectFilesystemIPC {
    static normalizeRelativePath(value) {
        const raw =
            String(value || '')
                .replace(/\\/g, '/')
                .trim();

        if (!raw) {
            throw new Error(
                '[SMProjectFilesystemIPC] Relative path is required.'
            );
        }

        if (
            raw.startsWith('/') ||
            /^[A-Za-z]:\//.test(raw)
        ) {
            throw new Error(
                '[SMProjectFilesystemIPC] Absolute paths are not allowed.'
            );
        }

        const parts =
            raw
                .split('/')
                .filter(Boolean);

        if (
            parts.some(
                part =>
                    part === '..' ||
                    part === '.'
            )
        ) {
            throw new Error(
                '[SMProjectFilesystemIPC] Path traversal is not allowed.'
            );
        }

        return parts.join('/');
    }


    static resolveInsideRoot(
        rootPath,
        relativePath
    ) {
        const root =
            path.resolve(
                String(rootPath || '')
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
                '[SMProjectFilesystemIPC] Resolved path escaped project root.'
            );
        }

        return {
            root,
            relative,
            target
        };
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
                `[SMProjectFilesystemIPC] Invalid project root: ${root}`
            );
        }

        const manifest =
            path.join(
                root,
                'project.smproject'
            );

        if (!fs.existsSync(manifest)) {
            throw new Error(
                `[SMProjectFilesystemIPC] project.smproject not found in: ${root}`
            );
        }

        return root;
    }


    static writeText({
        rootPath,
        relativePath,
        content = ''
    } = {}) {
        const {
            target,
            relative
        } =
            this.resolveInsideRoot(
                this.ensureProjectRoot(
                    rootPath
                ),
                relativePath
            );

        if (
            relative.toLowerCase() ===
            'project.smproject'
        ) {
            throw new Error(
                '[SMProjectFilesystemIPC] Direct project.smproject overwrite is blocked.'
            );
        }

        fs.mkdirSync(
            path.dirname(target),
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            target,
            String(
                content ?? ''
            ),
            'utf8'
        );

        return {
            ok: true,
            relativePath: relative,
            path: target,
            bytes:
                Buffer.byteLength(
                    String(
                        content ?? ''
                    ),
                    'utf8'
                )
        };
    }


    static writeBinary({
        rootPath,
        relativePath,
        bytes
    } = {}) {
        const {
            target,
            relative
        } =
            this.resolveInsideRoot(
                this.ensureProjectRoot(
                    rootPath
                ),
                relativePath
            );

        if (
            relative.toLowerCase() ===
            'project.smproject'
        ) {
            throw new Error(
                '[SMProjectFilesystemIPC] Direct project.smproject overwrite is blocked.'
            );
        }

        let buffer;

        if (
            Buffer.isBuffer(bytes)
        ) {
            buffer = bytes;
        }
        else if (
            bytes instanceof
            ArrayBuffer
        ) {
            buffer =
                Buffer.from(bytes);
        }
        else if (
            ArrayBuffer.isView(bytes)
        ) {
            buffer =
                Buffer.from(
                    bytes.buffer,
                    bytes.byteOffset,
                    bytes.byteLength
                );
        }
        else if (
            Array.isArray(bytes)
        ) {
            buffer =
                Buffer.from(bytes);
        }
        else {
            throw new Error(
                '[SMProjectFilesystemIPC] Unsupported binary payload.'
            );
        }

        fs.mkdirSync(
            path.dirname(target),
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            target,
            buffer
        );

        return {
            ok: true,
            relativePath: relative,
            path: target,
            bytes:
                buffer.length
        };
    }


    static ensureDirectory({
        rootPath,
        relativePath
    } = {}) {
        const {
            target,
            relative
        } =
            this.resolveInsideRoot(
                this.ensureProjectRoot(
                    rootPath
                ),
                relativePath
            );

        fs.mkdirSync(
            target,
            {
                recursive: true
            }
        );

        return {
            ok: true,
            relativePath: relative,
            path: target
        };
    }


    static mergeManifest({
        rootPath,
        patch = {}
    } = {}) {
        const root =
            this.ensureProjectRoot(
                rootPath
            );

        const manifestPath =
            path.join(
                root,
                'project.smproject'
            );

        let current = {};

        try {
            current =
                JSON.parse(
                    fs.readFileSync(
                        manifestPath,
                        'utf8'
                    )
                );
        }
        catch (error) {
            throw new Error(
                `[SMProjectFilesystemIPC] Could not read project.smproject: ${error.message}`
            );
        }

        const next = {
            ...current,
            ...patch,

            metadata: {
                ...(current.metadata || {}),
                ...(patch.metadata || {})
            }
        };

        fs.writeFileSync(
            manifestPath,
            JSON.stringify(
                next,
                null,
                2
            ),
            'utf8'
        );

        return {
            ok: true,
            manifest: next,
            path: manifestPath
        };
    }


    static register(ipcMain) {
        if (
            !ipcMain ||
            typeof ipcMain.handle !==
                'function'
        ) {
            throw new Error(
                '[SMProjectFilesystemIPC] ipcMain is required.'
            );
        }

        ipcMain.handle(
            'sm-project-fs:write-text',
            async (
                _event,
                payload
            ) =>
                this.writeText(
                    payload
                )
        );

        ipcMain.handle(
            'sm-project-fs:write-binary',
            async (
                _event,
                payload
            ) =>
                this.writeBinary(
                    payload
                )
        );

        ipcMain.handle(
            'sm-project-fs:ensure-directory',
            async (
                _event,
                payload
            ) =>
                this.ensureDirectory(
                    payload
                )
        );

        ipcMain.handle(
            'sm-project-fs:merge-manifest',
            async (
                _event,
                payload
            ) =>
                this.mergeManifest(
                    payload
                )
        );
    }
}


module.exports = {
    SMProjectFilesystemIPC
};