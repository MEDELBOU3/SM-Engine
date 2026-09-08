// src/services/UpdateService.js
// SM Engine Launcher - Engine Download, Extraction and GitHub Releases Integration

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { EventEmitter } = require('events');

class UpdateService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.app = options.app || null;
        this.settingsManager = options.settingsManager || null;
        this.githubRepo = options.githubRepo || 'MEDELBOU3/SM-Engine';
        this.activeDownloads = new Map();
        this.cachedReleases = null;
        this.lastFetchTime = 0;
    }

    selectEngineAsset(assets = []) {
        return assets.find(asset => /\.zip$/i.test(asset.name))
            || assets.find(asset => /portable/i.test(asset.name) && /\.exe$/i.test(asset.name))
            || assets.find(asset => /\.exe$/i.test(asset.name) && !/setup|installer/i.test(asset.name))
            || null;
    }

    getEnginesDirectory() {
        const customPath = this.settingsManager?.get('enginesStoragePath');
        if (customPath && fs.existsSync(customPath)) {
            return path.resolve(customPath);
        }

        const appData = this.app
            ? this.app.getPath('userData')
            : path.join(process.env.APPDATA || process.env.HOME || '.', 'sm-engine-launcher');

        const enginesDir = path.join(appData, 'engines');
        if (!fs.existsSync(enginesDir)) {
            fs.mkdirSync(enginesDir, { recursive: true });
        }
        return enginesDir;
    }

    getTempDirectory() {
        const appData = this.app
            ? this.app.getPath('temp')
            : path.join(process.env.TEMP || process.env.TMP || '.', 'sm-launcher-temp');

        const tempDir = path.join(appData, 'sm-downloads');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        return tempDir;
    }

    /**
     * Fetch available releases from GitHub API
     */
    async fetchReleases(force = false) {
        const now = Date.now();
        if (!force && this.cachedReleases && (now - this.lastFetchTime < 60000)) {
            return this.cachedReleases;
        }

        const url = `https://api.github.com/repos/${this.githubRepo}/releases`;
        const headers = {
            'User-Agent': 'SM-Engine-Launcher/1.0.0',
            'Accept': 'application/vnd.github.v3+json'
        };

        try {
            const data = await this._httpGetJson(url, headers);
            if (Array.isArray(data) && data.length > 0) {
                this.cachedReleases = data.map(rel => ({
                    id: String(rel.id),
                    tag: rel.tag_name || rel.name,
                    version: (rel.tag_name || rel.name || '1.0.0').replace(/^v/, ''),
                    name: rel.name || rel.tag_name,
                    body: rel.body || '',
                    publishedAt: rel.published_at,
                    prerelease: rel.prerelease || false,
                    htmlUrl: rel.html_url,
                    assets: (rel.assets || []).map(asset => ({
                        id: asset.id,
                        name: asset.name,
                        size: asset.size,
                        downloadUrl: asset.browser_download_url,
                        contentType: asset.content_type
                    })),
                    engineAsset: this.selectEngineAsset(rel.assets || [])
                }));
                this.lastFetchTime = now;
                return this.cachedReleases;
            }
        } catch (err) {
            console.warn('[UpdateService] Failed to fetch releases from GitHub:', err.message);
        }

        // Fallback default release definition
        if (!this.cachedReleases) {
            this.cachedReleases = [
                {
                    id: 'default-1.0.1',
                    tag: 'v1.0.1',
                    version: '1.0.1',
                    name: 'SM Engine 1.0.1',
                    body: 'Official release of SM Engine featuring 3D modeling, physics simulation, real-time node editor, and desktop acceleration.',
                    publishedAt: new Date().toISOString(),
                    prerelease: false,
                    htmlUrl: `https://github.com/${this.githubRepo}/releases`,
                    assets: [
                        {
                            name: 'SM-Engine-Setup-1.0.1.exe',
                            size: 145000000,
                            downloadUrl: `https://github.com/${this.githubRepo}/releases/download/v1.0.1/SM-Engine-Setup-1.0.1.exe`
                        },
                        {
                            name: 'SM-Engine-1.0.1-win-x64.zip',
                            size: 140000000,
                            downloadUrl: `https://github.com/${this.githubRepo}/releases/download/v1.0.1/SM-Engine-1.0.1-win-x64.zip`
                        }
                    ]
                }
            ];
        }

        return this.cachedReleases;
    }

    /**
     * Download and install an engine version
     */
    async installVersion(version, downloadUrl, onProgress = null) {
        if (this.activeDownloads.has(version)) {
            throw new Error(`Download for SM Engine v${version} is already in progress.`);
        }

        const tempDir = this.getTempDirectory();
        const enginesDir = this.getEnginesDirectory();
        const targetDir = path.join(enginesDir, `v${version}`);
        const archiveExt = downloadUrl && downloadUrl.endsWith('.exe') ? '.exe' : '.zip';
        const tempFile = path.join(tempDir, `sm-engine-${version}${archiveExt}`);

        const abortController = new AbortController();
        this.activeDownloads.set(version, { abortController, progress: 0, status: 'downloading' });

        try {
            // Step 1: Download
            await this._downloadFile(downloadUrl, tempFile, abortController.signal, (info) => {
                this.activeDownloads.set(version, {
                    abortController,
                    progress: info.percentage,
                    speed: info.speedFormatted,
                    transferred: info.transferredFormatted,
                    total: info.totalFormatted,
                    status: 'downloading'
                });

                if (onProgress) onProgress(info);
                this.emit('progress', { version, ...info });
            });

            // Step 2: Extract or place executable
            this.activeDownloads.set(version, { abortController, progress: 99, status: 'extracting' });
            if (onProgress) {
                onProgress({ version, percentage: 99, status: 'extracting', text: 'Installing engine files...' });
            }

            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            if (archiveExt === '.zip') {
                await this._extractZip(tempFile, targetDir);
            } else {
                const destExe = path.join(targetDir, 'SM Engine.exe');
                fs.copyFileSync(tempFile, destExe);
            }

            // Cleanup temp file
            try {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            } catch (e) {}

            this.activeDownloads.delete(version);
            this.emit('installed', { version, path: targetDir });

            return {
                success: true,
                version,
                path: targetDir,
                installedAt: new Date().toISOString()
            };
        } catch (err) {
            this.activeDownloads.delete(version);
            try {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            } catch (e) {}
            throw err;
        }
    }

    /**
     * Cancel an ongoing download
     */
    cancelDownload(version) {
        const item = this.activeDownloads.get(version);
        if (item && item.abortController) {
            item.abortController.abort();
            this.activeDownloads.delete(version);
            this.emit('cancelled', { version });
            return true;
        }
        return false;
    }

    /**
     * Uninstall an installed engine version
     */
    async uninstallVersion(version) {
        const enginesDir = this.getEnginesDirectory();
        const targetDir = path.join(enginesDir, `v${version}`);

        if (!fs.existsSync(targetDir)) {
            return false;
        }

        await this._removeDirectoryRecursive(targetDir);
        this.emit('uninstalled', { version });
        return true;
    }

    /* -------------------------------------------------------------
       Internal Helpers
       ------------------------------------------------------------- */

    _httpGetJson(url, headers = {}) {
        return new Promise((resolve, reject) => {
            const req = https.get(url, { headers }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return this._httpGetJson(res.headers.location, headers).then(resolve).catch(reject);
                }

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`HTTP error ${res.statusCode}: ${res.statusMessage}`));
                }

                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON response: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(15000, () => {
                req.destroy();
                reject(new Error('HTTP request timed out'));
            });
        });
    }

    _downloadFile(url, destPath, signal, onProgress) {
        return new Promise((resolve, reject) => {
            if (!url) {
                return reject(new Error('Invalid download URL provided'));
            }

            const file = fs.createWriteStream(destPath);
            let downloadedBytes = 0;
            let totalBytes = 0;
            let startTime = Date.now();
            let lastUpdate = 0;

            const handleResponse = (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return https.get(res.headers.location, handleResponse).on('error', reject);
                }

                if (res.statusCode !== 200) {
                    file.close();
                    return reject(new Error(`Download failed with status ${res.statusCode}`));
                }

                totalBytes = parseInt(res.headers['content-length'] || '0', 10);

                res.on('data', (chunk) => {
                    if (signal?.aborted) {
                        res.destroy();
                        file.close();
                        return reject(new Error('Download cancelled by user'));
                    }

                    downloadedBytes += chunk.length;
                    const now = Date.now();

                    if (now - lastUpdate > 200 || downloadedBytes === totalBytes) {
                        lastUpdate = now;
                        const elapsedSec = (now - startTime) / 1000 || 0.001;
                        const speedBytes = downloadedBytes / elapsedSec;
                        const percentage = totalBytes > 0
                            ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
                            : 0;

                        if (onProgress) {
                            onProgress({
                                downloadedBytes,
                                totalBytes,
                                percentage,
                                speedFormatted: this._formatBytes(speedBytes) + '/s',
                                transferredFormatted: this._formatBytes(downloadedBytes),
                                totalFormatted: this._formatBytes(totalBytes),
                                status: 'downloading'
                            });
                        }
                    }
                });

                res.pipe(file);

                file.on('finish', () => {
                    file.close(() => resolve(destPath));
                });

                file.on('error', (err) => {
                    file.close();
                    reject(err);
                });
            };

            const client = url.startsWith('https') ? https : http;
            const req = client.get(url, { headers: { 'User-Agent': 'SM-Engine-Launcher/1.0.0' } }, handleResponse);

            req.on('error', (err) => {
                file.close();
                reject(err);
            });

            if (signal) {
                signal.addEventListener('abort', () => {
                    req.destroy();
                    file.close();
                    reject(new Error('Download cancelled'));
                });
            }
        });
    }

    _extractZip(zipPath, targetDir) {
        return new Promise((resolve, reject) => {
            if (process.platform === 'win32') {
                const script = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${targetDir}" -Force`;
                exec(`powershell -NoProfile -NonInteractive -Command "${script}"`, (error, stdout, stderr) => {
                    if (error) {
                        exec(`tar -xf "${zipPath}" -C "${targetDir}"`, (tarErr) => {
                            if (tarErr) return reject(new Error(`Failed to extract engine package: ${error.message}`));
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                });
            } else {
                exec(`unzip -o "${zipPath}" -d "${targetDir}"`, (error) => {
                    if (error) return reject(error);
                    resolve();
                });
            }
        });
    }

    _removeDirectoryRecursive(dirPath) {
        return new Promise((resolve, reject) => {
            fs.rm(dirPath, { recursive: true, force: true }, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    _formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

module.exports = { UpdateService };