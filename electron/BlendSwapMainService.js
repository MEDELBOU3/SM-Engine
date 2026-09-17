// SM Engine Launcher — BlendSwap backend
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');

const API_BASE = 'https://blendswap.com/api/v1';
let runtimeApiKey = '';

function loadEnvFile(rootDir) {
    const envPath = path.join(rootDir, '.env');
    if (!fs.existsSync(envPath)) return;

    const text = fs.readFileSync(envPath, 'utf8');

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;

        const eq = line.indexOf('=');
        if (eq <= 0) continue;

        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

function getApiKey() {
    return String(
        runtimeApiKey ||
        process.env.BLENDSWAP_API_KEY ||
        process.env.BLENDSWAP_KEY ||
        ''
    ).trim();
}

async function ensureDir(dir) {
    await fsp.mkdir(dir, { recursive: true });
    return dir;
}

async function readJson(file, fallback) {
    try {
        return JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

async function writeJson(file, value) {
    await ensureDir(path.dirname(file));
    await fsp.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

function slugify(value) {
    return String(value || 'asset')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'asset';
}

function findDownloadUrl(value, depth = 0) {
    if (!value || depth > 6) return null;

    if (typeof value === 'string') {
        return /^https?:\/\//i.test(value) ? value : null;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findDownloadUrl(item, depth + 1);
            if (found) return found;
        }
        return null;
    }

    if (typeof value !== 'object') return null;

    const keys = [
        'download_url',
        'downloadUrl',
        'signed_url',
        'signedUrl',
        'temporary_url',
        'temporaryUrl'
    ];

    for (const key of keys) {
        if (typeof value[key] === 'string' && /^https?:\/\//i.test(value[key])) {
            return value[key];
        }
    }

    for (const key of ['data', 'download', 'file', 'files', 'downloads']) {
        if (!(key in value)) continue;
        const found = findDownloadUrl(value[key], depth + 1);
        if (found) return found;
    }

    return null;
}

async function requestJson(url, options = {}) {
    const apiKey = getApiKey();

    if (!apiKey) {
        throw new Error('BLENDSWAP_API_KEY is missing in launcher .env');
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(options.headers || {})
        }
    });

    const text = await response.text();
    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch (_) {
        data = { raw: text };
    }

    if (!response.ok) {
        const error = new Error(
            data?.message ||
            data?.error ||
            `BlendSwap request failed (${response.status})`
        );
        error.status = response.status;
        error.retryAfter = response.headers.get('retry-after') || null;
        throw error;
    }

    return data;
}

async function searchAssets(payload = {}) {
    const url = new URL(`${API_BASE}/assets`);

    if (payload.q) url.searchParams.set('q', String(payload.q));
    if (payload.license) url.searchParams.set('license', String(payload.license));
    if (payload.format) url.searchParams.set('format', String(payload.format));
    url.searchParams.set('page', String(Math.max(1, Number(payload.page) || 1)));

    return requestJson(url.toString());
}

function parseDownloadFilename(response, fallbackName) {
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename\*?=(?:UTF-8''|\")?([^\";]+)/i.exec(disposition);

    if (match?.[1]) {
        try {
            return decodeURIComponent(match[1].trim()).replace(/[<>:\"/\\|?*\x00-\x1F]/g, '_');
        } catch (_) {}
    }

    try {
        const fromUrl = decodeURIComponent(
            path.basename(new URL(response.url).pathname)
        );

        if (fromUrl) {
            return fromUrl.replace(/[<>:\"/\\|?*\x00-\x1F]/g, '_');
        }
    } catch (_) {}

    return fallbackName;
}

async function downloadToFile(
    url,
    destinationDirectory,
    fallbackName,
    onProgress,
    signal = null
) {
    const response = await fetch(url, {
        redirect: 'follow',
        signal: signal || undefined
    });

    if (!response.ok || !response.body) {
        throw new Error(`BlendSwap download failed (${response.status})`);
    }

    const filename = parseDownloadFilename(response, fallbackName);
    const outputPath = path.join(destinationDirectory, filename);

    await ensureDir(destinationDirectory);

    const total = Number(response.headers.get('content-length') || 0);
    let transferred = 0;

    const source = Readable.fromWeb(response.body);

    source.on('data', chunk => {
        transferred += chunk.length;
        onProgress?.({
            transferred,
            total,
            percentage: total > 0
                ? Math.round((transferred / total) * 100)
                : null
        });
    });

    try {
        const destination = fs.createWriteStream(outputPath);
        if (signal) await pipeline(source, destination, { signal });
        else await pipeline(source, destination);
        return outputPath;
    } catch (error) {
        await fsp.rm(outputPath, { force: true }).catch(() => {});
        throw error;
    }
}

function runProcess(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe']
        });

        let stderr = '';

        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });

        child.once('error', reject);

        child.once('close', code => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(
                new Error(
                    stderr.trim() ||
                    `Process exited with code ${code}`
                )
            );
        });
    });
}

async function extractZip(zipPath, destination) {
    await ensureDir(destination);

    if (process.platform === 'win32') {
        const command = [
            'Expand-Archive',
            '-LiteralPath',
            `'${String(zipPath).replace(/'/g, "''")}'`,
            '-DestinationPath',
            `'${String(destination).replace(/'/g, "''")}'`,
            '-Force'
        ].join(' ');

        await runProcess(
            'powershell.exe',
            [
                '-NoLogo',
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                command
            ]
        );

        return;
    }

    await runProcess('unzip', ['-o', zipPath, '-d', destination]);
}

async function findBlendFiles(root) {
    const files = [];
    const queue = [root];

    while (queue.length) {
        const dir = queue.shift();
        const entries = await fsp.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const target = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                queue.push(target);
            } else if (
                entry.isFile() &&
                path.extname(entry.name).toLowerCase() === '.blend'
            ) {
                files.push(target);
            }
        }
    }

    return files;
}

async function chooseLargestFile(files) {
    let best = null;

    for (const file of files) {
        const stats = await fsp.stat(file);

        if (!best || stats.size > best.size) {
            best = {
                path: file,
                size: stats.size
            };
        }
    }

    return best?.path || null;
}

function createBlendSwapMainService({
    app,
    ipcMain,
    projectManager,
    getWindow,
    rootDir
}) {
    loadEnvFile(rootDir || process.cwd());

    const libraryRoot = path.join(
        app.getPath('userData'),
        'asset-library',
        'blendswap'
    );

    const indexPath = path.join(libraryRoot, 'index.json');

    async function readIndex() {
        const index = await readJson(indexPath, { version: 1, assets: [] });
        if (!Array.isArray(index.assets)) index.assets = [];
        return index;
    }

    async function saveIndex(index) {
        await writeJson(indexPath, index);
    }

    function sendProgress(detail) {
        const win = getWindow?.();
        if (win && !win.isDestroyed()) {
            win.webContents.send('library:downloadProgress', detail);
        }
    }

    async function addToLibrary(asset = {}) {
        const assetId = Number(asset.id);
        if (!assetId) throw new Error('Invalid BlendSwap asset id');

        const index = await readIndex();
        const existing = index.assets.find(x => Number(x.assetId) === assetId);

        if (existing && existing.installed && fs.existsSync(existing.libraryDirectory)) {
            return existing;
        }

        const downloadInfo = await requestJson(
            `${API_BASE}/downloads`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asset_id: assetId })
            }
        );

        const downloadUrl = findDownloadUrl(downloadInfo);
        if (!downloadUrl) {
            throw new Error('No usable download URL returned by BlendSwap');
        }

        const folderName = `${assetId}_${slugify(asset.title)}`;
        const assetDir = path.join(libraryRoot, folderName);
        const sourceDir = path.join(assetDir, 'source');

        await ensureDir(sourceDir);

        const preferredFile =
            asset.files?.find?.(f => f?.format === 'blender') ||
            asset.files?.[0] ||
            null;

        const fallbackName = preferredFile?.filename || `${folderName}.blend`;

        sendProgress({
            assetId,
            title: asset.title,
            phase: 'downloading',
            percentage: 0
        });

        const downloadedPath = await downloadToFile(
            downloadUrl,
            sourceDir,
            fallbackName,
            progress => {
                sendProgress({
                    assetId,
                    title: asset.title,
                    phase: 'downloading',
                    ...progress
                });
            }
        );

        let primaryBlendPath = null;

        if (path.extname(downloadedPath).toLowerCase() === '.zip') {
            const extractedDir = path.join(sourceDir, 'extracted');

            sendProgress({
                assetId,
                title: asset.title,
                phase: 'extracting',
                percentage: null
            });

            await extractZip(downloadedPath, extractedDir);

            primaryBlendPath = await chooseLargestFile(
                await findBlendFiles(extractedDir)
            );
        } else if (
            path.extname(downloadedPath).toLowerCase() === '.blend'
        ) {
            primaryBlendPath = downloadedPath;
        }

        const record = {
            id: `blendswap:${assetId}`,
            provider: 'blendswap',
            assetId,
            title: asset.title || `BlendSwap ${assetId}`,
            description: asset.description || '',
            sourceUrl: asset.url || '',
            category: asset.category || null,
            author: asset.author || null,
            license: asset.license || null,
            licenseSource: asset.license_source || null,
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            sizeBytes: Number(asset.size_bytes || 0),
            blenderVersions: Array.isArray(asset.blender_versions)
                ? asset.blender_versions
                : [],
            sourceFiles: Array.isArray(asset.files) ? asset.files : [],
            libraryDirectory: assetDir,
            sourcePath: primaryBlendPath || downloadedPath,
            downloadedPath,
            primaryBlendPath,
            installed: true,
            installedAt: new Date().toISOString()
        };

        await writeJson(path.join(assetDir, 'asset.json'), record);

        index.assets = index.assets.filter(x => Number(x.assetId) !== assetId);
        index.assets.push(record);
        await saveIndex(index);

        sendProgress({
            assetId,
            title: record.title,
            phase: 'done',
            percentage: 100
        });

        return record;
    }

    async function addToProject({ assetId, projectId } = {}) {
        const project = projectManager
            ?.list?.()
            ?.find(item => item.id === projectId);

        if (!project) throw new Error('Project not found');

        const index = await readIndex();
        const record = index.assets.find(x => Number(x.assetId) === Number(assetId));

        if (!record) throw new Error('Asset is not in SM Library');

        const targetDir = path.join(
            project.path,
            'Assets',
            'Marketplace',
            'BlendSwap',
            `${record.assetId}_${slugify(record.title)}`
        );

        await fsp.rm(targetDir, { recursive: true, force: true });
        await ensureDir(targetDir);

        const sourceDir = path.join(record.libraryDirectory, 'source');
        await fsp.cp(sourceDir, path.join(targetDir, 'Source'), {
            recursive: true,
            force: true
        });

        await writeJson(
            path.join(targetDir, 'asset.json'),
            {
                ...record,
                projectId: project.id,
                projectPath: project.path,
                projectAssetDirectory: targetDir,
                addedToProjectAt: new Date().toISOString()
            }
        );

        return {
            ok: true,
            project,
            targetDirectory: targetDir
        };
    }

    async function register() {
        await ensureDir(libraryRoot);

        for (const channel of [
            'marketplace:blendswap:search',
            'library:list',
            'library:add',
            'library:addToProject'
        ]) {
            try { ipcMain.removeHandler(channel); } catch (_) {}
        }

        ipcMain.handle('marketplace:blendswap:search', async (_event, payload = {}) => {
            try {
                const data = await searchAssets(payload);
                return { ok: true, ...data };
            } catch (error) {
                return {
                    ok: false,
                    error: error?.message || String(error),
                    data: [],
                    pagination: null
                };
            }
        });

        ipcMain.handle('library:list', async () => {
            const index = await readIndex();
            return { ok: true, assets: index.assets };
        });

        ipcMain.handle('library:add', async (_event, asset) => {
            try {
                return { ok: true, asset: await addToLibrary(asset) };
            } catch (error) {
                return { ok: false, error: error?.message || String(error) };
            }
        });

        ipcMain.handle('library:addToProject', async (_event, payload = {}) => {
            try {
                return await addToProject(payload);
            } catch (error) {
                return { ok: false, error: error?.message || String(error) };
            }
        });
    }

    return {
        register,
        getApiKeyStatus: () => ({ configured: !!getApiKey() }),
        getLibraryRoot: () => libraryRoot
    };
}

/*
 * SM Engine registration surface.
 *
 * The file originally exposed only the Launcher-oriented factory above. The
 * editor preload uses a separate, deliberately narrow `sm-blendswap:*` API.
 * Keep both contracts available and share the audited download helpers.
 */
function registerBlendSwapIPC(options = {}) {
    const electron = options.electron || (() => {
        try { return require('electron'); } catch (_) { return {}; }
    })();
    const electronApp = options.app || electron.app;
    const mainIPC = options.ipcMain || electron.ipcMain;
    const safeStorage = options.safeStorage || electron.safeStorage || null;

    if (!electronApp || !mainIPC?.handle) {
        throw new Error('BlendSwap IPC requires Electron app and ipcMain.');
    }

    const rootDir = options.rootDir || path.resolve(__dirname, '..');
    loadEnvFile(rootDir);

    const libraryRoot = path.join(
        electronApp.getPath('userData'),
        'asset-library',
        'blendswap'
    );
    const settingsPath = path.join(libraryRoot, 'settings.json');
    const activeDownloads = new Map();
    let keySource = getApiKey() ? 'environment' : 'none';

    const ready = (async () => {
        await ensureDir(libraryRoot);
        const settings = await readJson(settingsPath, null);
        if (!settings?.encryptedKey) return true;
        if (!safeStorage?.isEncryptionAvailable?.()) return true;

        try {
            runtimeApiKey = safeStorage.decryptString(
                Buffer.from(settings.encryptedKey, 'base64')
            ).trim();
            if (runtimeApiKey) keySource = 'secure-storage';
        } catch (error) {
            console.warn('[BlendSwap] Stored API key could not be decrypted:', error?.message || error);
        }
        return true;
    })().catch(error => {
        console.warn('[BlendSwap] Initialization warning:', error?.message || error);
        return false;
    });

    function status() {
        const configured = !!getApiKey();
        return {
            configured,
            source: configured ? keySource : 'none',
            persistent: keySource === 'secure-storage'
        };
    }

    async function saveKey(key) {
        runtimeApiKey = String(key || '').trim();
        if (!runtimeApiKey) throw new Error('BlendSwap API key cannot be empty.');
        keySource = 'session';

        if (safeStorage?.isEncryptionAvailable?.()) {
            const encryptedKey = safeStorage
                .encryptString(runtimeApiKey)
                .toString('base64');
            await writeJson(settingsPath, {
                version: 1,
                encryptedKey,
                updatedAt: new Date().toISOString()
            });
            keySource = 'secure-storage';
        }
        return status();
    }

    async function clearKey() {
        runtimeApiKey = '';
        await fsp.rm(settingsPath, { force: true }).catch(() => {});
        keySource = (
            process.env.BLENDSWAP_API_KEY ||
            process.env.BLENDSWAP_KEY
        ) ? 'environment' : 'none';
        return status();
    }

    function senderIsAlive(sender) {
        return !!sender && !(typeof sender.isDestroyed === 'function' && sender.isDestroyed());
    }

    function sendProgress(event, detail) {
        if (!senderIsAlive(event?.sender)) return;
        event.sender.send('sm-blendswap:download-progress', detail);
    }

    async function search(payload = {}) {
        const result = await searchAssets(payload);
        const data = Array.isArray(result?.data)
            ? result.data
            : Array.isArray(result?.assets)
                ? result.assets
                : Array.isArray(result)
                    ? result
                    : [];
        return {
            ok: true,
            data,
            pagination: result?.pagination || result?.meta || null,
            rateLimit: result?.rate_limit || result?.rateLimit || null
        };
    }

    async function download(event, payload = {}) {
        const assetId = Number(payload.assetId || payload.id);
        if (!assetId) throw new Error('A valid BlendSwap asset id is required.');
        if (activeDownloads.has(assetId)) {
            throw new Error('This BlendSwap asset is already downloading.');
        }

        const controller = new AbortController();
        activeDownloads.set(assetId, controller);

        const title = String(payload.title || `BlendSwap ${assetId}`);
        const assetDirectory = path.join(
            libraryRoot,
            `${assetId}_${slugify(title)}`
        );
        const sourceDirectory = path.join(assetDirectory, 'source');

        try {
            await ensureDir(sourceDirectory);
            sendProgress(event, {
                assetId,
                title,
                phase: 'authorizing',
                percentage: 0
            });

            const downloadInfo = await requestJson(
                `${API_BASE}/downloads`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ asset_id: assetId }),
                    signal: controller.signal
                }
            );
            const downloadUrl = findDownloadUrl(downloadInfo);
            if (!downloadUrl) throw new Error('No usable download URL returned by BlendSwap.');

            sendProgress(event, {
                assetId,
                title,
                phase: 'downloading',
                percentage: 0
            });

            const fallbackName = path.basename(
                String(payload.filename || `${assetId}_${slugify(title)}.blend`)
            ).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
            const downloadedPath = await downloadToFile(
                downloadUrl,
                sourceDirectory,
                fallbackName,
                progress => sendProgress(event, {
                    assetId,
                    title,
                    phase: 'downloading',
                    ...progress
                }),
                controller.signal
            );

            let blendPath = null;
            const extension = path.extname(downloadedPath).toLowerCase();
            if (extension === '.blend') {
                blendPath = downloadedPath;
            } else if (extension === '.zip') {
                const extractedDirectory = path.join(sourceDirectory, 'extracted');
                sendProgress(event, {
                    assetId,
                    title,
                    phase: 'extracting',
                    percentage: null
                });
                await extractZip(downloadedPath, extractedDirectory);
                blendPath = await chooseLargestFile(
                    await findBlendFiles(extractedDirectory)
                );
            }

            if (!blendPath) {
                throw new Error('The downloaded BlendSwap package contains no .blend file.');
            }

            const stats = await fsp.stat(downloadedPath);
            const record = {
                version: 1,
                provider: 'blendswap',
                assetId,
                title,
                assetUrl: payload.assetUrl || null,
                author: payload.author || null,
                authorUrl: payload.authorUrl || null,
                license: payload.license || null,
                licenseSource: payload.licenseSource || null,
                libraryDirectory: assetDirectory,
                downloadedPath,
                blendPath,
                sizeBytes: stats.size,
                downloadedAt: new Date().toISOString()
            };
            await writeJson(path.join(assetDirectory, 'asset.json'), record);

            sendProgress(event, {
                assetId,
                title,
                phase: 'done',
                transferred: stats.size,
                total: stats.size,
                percentage: 100
            });
            return { ok: true, ...record };
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted) {
                return { ok: false, cancelled: true, error: 'Download cancelled.' };
            }
            throw error;
        } finally {
            activeDownloads.delete(assetId);
        }
    }

    const channels = [
        'sm-blendswap:key-status',
        'sm-blendswap:key-set',
        'sm-blendswap:key-clear',
        'sm-blendswap:search',
        'sm-blendswap:download',
        'sm-blendswap:cancel-download'
    ];
    for (const channel of channels) {
        try { mainIPC.removeHandler?.(channel); } catch (_) {}
    }

    mainIPC.handle('sm-blendswap:key-status', async () => {
        await ready;
        return status();
    });
    mainIPC.handle('sm-blendswap:key-set', async (_event, payload = {}) => {
        await ready;
        try { return { ok: true, ...(await saveKey(payload.key)) }; }
        catch (error) { return { ok: false, error: error?.message || String(error) }; }
    });
    mainIPC.handle('sm-blendswap:key-clear', async () => {
        await ready;
        return { ok: true, ...(await clearKey()) };
    });
    mainIPC.handle('sm-blendswap:search', async (_event, payload = {}) => {
        await ready;
        try { return await search(payload); }
        catch (error) {
            return {
                ok: false,
                error: error?.message || String(error),
                status: error?.status || null,
                retryAfter: error?.retryAfter || null,
                data: []
            };
        }
    });
    mainIPC.handle('sm-blendswap:download', async (event, payload = {}) => {
        await ready;
        try { return await download(event, payload); }
        catch (error) {
            return { ok: false, error: error?.message || String(error) };
        }
    });
    mainIPC.handle('sm-blendswap:cancel-download', async (_event, payload = {}) => {
        const assetId = Number(payload.assetId || payload.id);
        const controller = activeDownloads.get(assetId);
        if (controller) controller.abort();
        return { ok: true, cancelled: !!controller, assetId: assetId || null };
    });

    console.info('[SM Engine] BlendSwap IPC registered.');
    return {
        ready,
        channels: [...channels],
        status,
        cancel(assetId) {
            const controller = activeDownloads.get(Number(assetId));
            if (!controller) return false;
            controller.abort();
            return true;
        }
    };
}

module.exports = {
    createBlendSwapMainService,
    registerBlendSwapIPC
};
