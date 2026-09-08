// src/managers/EngineVersionManager.js
// SM Engine Launcher - Engine Version Management

'use strict';

const fs = require('fs');
const path = require('path');

class EngineVersionManager {
    constructor(options = {}) {
        this.app = options.app || null;
        this.settingsManager = options.settingsManager || null;
        this.updateService = options.updateService || null;
        this.engineLauncher = options.engineLauncher || null;

        this.customEngines = []; // User-added local paths
    }

    /**
     * List all known engine versions (installed + remote releases)
     */
    async listAllVersions() {
        const installed = await this.listInstalledVersions();
        let releases = [];

        if (this.updateService) {
            try {
                releases = await this.updateService.fetchReleases();
            } catch (err) {
                console.warn('[EngineVersionManager] Could not fetch remote releases:', err.message);
            }
        }

        const map = new Map();

        // 1. Add installed versions
        for (const inst of installed) {
            map.set(inst.version, {
                ...inst,
                isInstalled: true,
                status: 'Installed'
            });
        }

        // 2. Add remote releases (or merge if not yet installed)
        for (const rel of releases) {
            const v = rel.version;
            const engineAsset = rel.engineAsset || rel.assets?.[0];
            if (map.has(v)) {
                const existing = map.get(v);
                existing.releaseNotes = rel.body;
                existing.htmlUrl = rel.htmlUrl;
                existing.publishedAt = rel.publishedAt;
                existing.downloadUrl = engineAsset?.downloadUrl;
            } else {
                map.set(v, {
                    id: `remote-${v}`,
                    version: v,
                    name: rel.name || `SM Engine ${v}`,
                    channel: rel.prerelease ? 'Preview' : 'Release',
                    path: null,
                    current: false,
                    isInstalled: false,
                    status: 'Available',
                    releaseNotes: rel.body,
                    htmlUrl: rel.htmlUrl,
                    publishedAt: rel.publishedAt,
                    downloadUrl: engineAsset?.downloadUrl,
                    assetSize: engineAsset?.size
                });
            }
        }

        // Check active downloads from updateService
        if (this.updateService) {
            for (const [v, info] of this.updateService.activeDownloads.entries()) {
                if (map.has(v)) {
                    const item = map.get(v);
                    item.status = 'Downloading';
                    item.downloadProgress = info.progress;
                    item.downloadSpeed = info.speed;
                    item.downloadTransferred = info.transferred;
                    item.downloadTotal = info.total;
                }
            }
        }

        const list = Array.from(map.values());

        // Ensure at least one current engine is set
        const currentPath = this.settingsManager?.get('enginePath');
        let hasCurrent = false;
        for (const eng of list) {
            if (eng.path && path.resolve(eng.path) === path.resolve(currentPath || '')) {
                eng.current = true;
                hasCurrent = true;
            }
        }

        if (!hasCurrent && list.length > 0) {
            const firstInstalled = list.find(e => e.isInstalled);
            if (firstInstalled) firstInstalled.current = true;
        }

        return list;
    }

    /**
     * Scan filesystem for installed SM Engine copies
     */
    async listInstalledVersions() {
        const engines = [];
        const detectedPaths = new Set();

        // 1. Configured engine path from settings
        const configuredPath = this.settingsManager?.get('enginePath');
        if (configuredPath && fs.existsSync(configuredPath)) {
            const resolved = path.resolve(configuredPath);
            detectedPaths.add(resolved);
            engines.push(this._inspectEngineDirectory(resolved, true));
        }

        // 2. Optional local development path for contributors.
        const devPath = process.env.SM_ENGINE_DEV_PATH;
        if (devPath && fs.existsSync(devPath)) {
            const resolved = path.resolve(devPath);
            if (!detectedPaths.has(resolved)) {
                detectedPaths.add(resolved);
                engines.push(this._inspectEngineDirectory(resolved, false, 'Development'));
            }
        }

        // 3. Engines stored in launcher directory (AppData/engines/vX.Y.Z)
        if (this.updateService) {
            const enginesDir = this.updateService.getEnginesDirectory();
            if (fs.existsSync(enginesDir)) {
                try {
                    const entries = fs.readdirSync(enginesDir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            const fullPath = path.join(enginesDir, entry.name);
                            const resolved = path.resolve(fullPath);
                            if (!detectedPaths.has(resolved)) {
                                detectedPaths.add(resolved);
                                const versionGuess = entry.name.replace(/^v/, '');
                                engines.push(this._inspectEngineDirectory(resolved, false, 'Release', versionGuess));
                            }
                        }
                    }
                } catch (err) {
                    console.warn('[EngineVersionManager] Error scanning engines dir:', err.message);
                }
            }
        }

        return engines.filter(Boolean);
    }

    /**
     * Inspect a directory to extract SM Engine metadata
     */
    _inspectEngineDirectory(dirPath, isCurrent = false, channel = 'Release', fallbackVersion = '1.0.1') {
        let version = fallbackVersion;
        let name = 'SM Engine';

        try {
            const pkgPath = path.join(dirPath, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                version = pkg.version || version;
                name = pkg.productName || pkg.name || name;
            }
        } catch {}

        return {
            id: `engine-${version}-${Buffer.from(dirPath).toString('hex').slice(0, 8)}`,
            version,
            name: `${name} ${version}`,
            channel,
            path: dirPath,
            current: isCurrent,
            isInstalled: true,
            status: 'Installed'
        };
    }

    /**
     * Set active engine version
     */
    async setActiveVersion(targetPath) {
        if (!targetPath || !fs.existsSync(targetPath)) {
            throw new Error(`Engine path does not exist: ${targetPath}`);
        }
        if (this.settingsManager) {
            this.settingsManager.set('enginePath', targetPath);
        }
        return true;
    }
}

module.exports = { EngineVersionManager };