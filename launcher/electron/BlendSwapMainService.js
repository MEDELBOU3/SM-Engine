// SM Engine Launcher — BlendSwapMainService.js
// Launcher-specific BlendSwap backend.
// IMPORTANT: this is NOT the SM Engine renderer integration service.

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');

const API_BASE = 'https://blendswap.com/api/v1';


function loadLocalEnv(rootDir) {
    const envPath =
        path.join(
            rootDir,
            '.env'
        );

    if (!fs.existsSync(envPath)) {
        return;
    }

    const text =
        fs.readFileSync(
            envPath,
            'utf8'
        );

    for (
        const rawLine
        of text.split(/\r?\n/)
    ) {
        const line =
            rawLine.trim();

        if (
            !line ||
            line.startsWith('#')
        ) {
            continue;
        }

        const separator =
            line.indexOf('=');

        if (separator <= 0) {
            continue;
        }

        const key =
            line.slice(
                0,
                separator
            ).trim();

        let value =
            line.slice(
                separator + 1
            ).trim();

        if (
            (
                value.startsWith('"') &&
                value.endsWith('"')
            ) ||
            (
                value.startsWith("'") &&
                value.endsWith("'")
            )
        ) {
            value =
                value.slice(
                    1,
                    -1
                );
        }

        if (!process.env[key]) {
            process.env[key] =
                value;
        }
    }
}


function getApiKey() {
    return String(
        process.env
            .BLENDSWAP_API_KEY ||
        process.env
            .BLENDSWAP_KEY ||
        ''
    ).trim();
}


async function ensureDir(
    directory
) {
    await fsp.mkdir(
        directory,
        {
            recursive: true
        }
    );

    return directory;
}


async function readJson(
    filePath,
    fallback
) {
    try {
        const text =
            await fsp.readFile(
                filePath,
                'utf8'
            );

        return JSON.parse(
            text
        );
    } catch (_) {
        return fallback;
    }
}


async function writeJson(
    filePath,
    value
) {
    await ensureDir(
        path.dirname(
            filePath
        )
    );

    await fsp.writeFile(
        filePath,
        JSON.stringify(
            value,
            null,
            2
        ),
        'utf8'
    );
}


function sanitizeName(
    value,
    fallback = 'asset'
) {
    const result =
        String(
            value ||
            fallback
        )
            .replace(
                /[<>:"/\\|?*\x00-\x1F]/g,
                '_'
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim();

    return result || fallback;
}


function slugify(
    value,
    fallback = 'asset'
) {
    const result =
        String(
            value ||
            fallback
        )
            .toLowerCase()
            .normalize('NFKD')
            .replace(
                /[^\w\s-]/g,
                ''
            )
            .replace(
                /[\s_]+/g,
                '-'
            )
            .replace(
                /-+/g,
                '-'
            )
            .replace(
                /^-|-$/g,
                ''
            );

    return result || fallback;
}


function normalizeAsset(
    asset = {}
) {
    return {
        id:
            Number(
                asset.id
            ),

        title:
            String(
                asset.title ||
                `BlendSwap ${asset.id || ''}`
            ),

        description:
            String(
                asset.description ||
                ''
            ),

        url:
            String(
                asset.url ||
                ''
            ),

        assetType:
            asset.asset_type ||
            null,

        category:
            asset.category ||
            null,

        author:
            asset.author ||
            null,

        license:
            asset.license ||
            null,

        licenseSource:
            asset.license_source ||
            asset.license
                ?.license_source ||
            null,

        tags:
            Array.isArray(
                asset.tags
            )
                ? asset.tags
                : [],

        sizeBytes:
            Number(
                asset.size_bytes ||
                0
            ),

        blenderVersions:
            Array.isArray(
                asset.blender_versions
            )
                ? asset.blender_versions
                : [],

        files:
            Array.isArray(
                asset.files
            )
                ? asset.files
                : []
    };
}


async function requestJson(
    endpoint,
    options = {}
) {
    const apiKey =
        getApiKey();

    if (!apiKey) {
        throw new Error(
            'BLENDSWAP_API_KEY is missing. Add it to the launcher .env file and restart the launcher.'
        );
    }

    const response =
        await fetch(
            endpoint,
            {
                ...options,

                headers: {
                    Accept:
                        'application/json',

                    Authorization:
                        `Bearer ${apiKey}`,

                    ...(
                        options.headers ||
                        {}
                    )
                }
            }
        );

    const text =
        await response.text();

    let data = null;

    try {
        data =
            text
                ? JSON.parse(
                    text
                )
                : null;
    } catch (_) {
        data = {
            raw:
                text
        };
    }

    if (!response.ok) {
        throw new Error(
            String(
                data?.message ||
                data?.error ||
                `BlendSwap request failed (${response.status}).`
            )
        );
    }

    return data;
}


async function searchBlendSwap({
    q = '',
    license = 'cc0',
    format = 'blender',
    page = 1
} = {}) {
    const url =
        new URL(
            `${API_BASE}/assets`
        );

    if (q) {
        url.searchParams.set(
            'q',
            String(q)
        );
    }

    if (license) {
        url.searchParams.set(
            'license',
            String(license)
        );
    }

    if (format) {
        url.searchParams.set(
            'format',
            String(format)
        );
    }

    url.searchParams.set(
        'page',
        String(
            Math.max(
                1,
                Number(page) ||
                1
            )
        )
    );

    return requestJson(
        url.toString()
    );
}


function findDownloadUrl(
    value,
    depth = 0
) {
    if (
        !value ||
        depth > 6
    ) {
        return null;
    }

    if (
        typeof value ===
        'string'
    ) {
        return /^https?:\/\//i
            .test(value)
                ? value
                : null;
    }

    if (
        Array.isArray(
            value
        )
    ) {
        for (
            const item
            of value
        ) {
            const found =
                findDownloadUrl(
                    item,
                    depth + 1
                );

            if (found) {
                return found;
            }
        }

        return null;
    }

    if (
        typeof value !==
        'object'
    ) {
        return null;
    }

    const preferredKeys = [
        'download_url',
        'downloadUrl',
        'signed_url',
        'signedUrl',
        'temporary_url',
        'temporaryUrl'
    ];

    for (
        const key
        of preferredKeys
    ) {
        const candidate =
            value[key];

        if (
            typeof candidate ===
                'string' &&
            /^https?:\/\//i
                .test(candidate)
        ) {
            return candidate;
        }
    }

    const nestedKeys = [
        'data',
        'download',
        'file',
        'files',
        'downloads'
    ];

    for (
        const key
        of nestedKeys
    ) {
        if (
            !(
                key in value
            )
        ) {
            continue;
        }

        const found =
            findDownloadUrl(
                value[key],
                depth + 1
            );

        if (found) {
            return found;
        }
    }

    return null;
}


function parseFilename(
    response,
    fallback
) {
    const disposition =
        response.headers
            .get(
                'content-disposition'
            ) ||
        '';

    const match =
        /filename\s*=\s*"?([^";]+)"?/i
            .exec(
                disposition
            );

    if (match?.[1]) {
        return sanitizeName(
            match[1]
        );
    }

    try {
        const fromUrl =
            decodeURIComponent(
                path.basename(
                    new URL(
                        response.url
                    ).pathname
                )
            );

        if (fromUrl) {
            return sanitizeName(
                fromUrl
            );
        }
    } catch (_) {
        // Ignore.
    }

    return sanitizeName(
        fallback ||
        'blendswap-download.bin'
    );
}


async function downloadFile(
    url,
    destinationDirectory,
    fallbackName,
    onProgress
) {
    const headers = {};

    try {
        const hostname =
            new URL(url)
                .hostname
                .toLowerCase();

        if (
            hostname ===
                'blendswap.com' ||
            hostname.endsWith(
                '.blendswap.com'
            )
        ) {
            headers.Authorization =
                `Bearer ${getApiKey()}`;
        }
    } catch (_) {
        // Signed CDN URL: no auth header required.
    }

    const response =
        await fetch(
            url,
            {
                headers,
                redirect:
                    'follow'
            }
        );

    if (!response.ok) {
        throw new Error(
            `Asset download failed (${response.status}).`
        );
    }

    let filename =
        parseFilename(
            response,
            fallbackName
        );

    if (
        !path.extname(
            filename
        )
    ) {
        filename += '.bin';
    }

    await ensureDir(
        destinationDirectory
    );

    const outputPath =
        path.join(
            destinationDirectory,
            filename
        );

    const total =
        Number(
            response.headers
                .get(
                    'content-length'
                ) ||
            0
        );

    let transferred = 0;

    if (!response.body) {
        throw new Error(
            'BlendSwap returned an empty download body.'
        );
    }

    const source =
        Readable.fromWeb(
            response.body
        );

    source.on(
        'data',
        chunk => {
            transferred +=
                chunk.length;

            onProgress?.({
                transferred,
                total,

                percentage:
                    total > 0
                        ? Math.min(
                            100,
                            Math.round(
                                transferred /
                                total *
                                100
                            )
                        )
                        : null
            });
        }
    );

    await pipeline(
        source,
        fs.createWriteStream(
            outputPath
        )
    );

    return outputPath;
}


function runProcess(
    command,
    args
) {
    return new Promise(
        (
            resolve,
            reject
        ) => {
            const child =
                spawn(
                    command,
                    args,
                    {
                        windowsHide:
                            true,

                        stdio: [
                            'ignore',
                            'pipe',
                            'pipe'
                        ]
                    }
                );

            let stderr = '';

            child.stderr.on(
                'data',
                chunk => {
                    stderr +=
                        chunk.toString();
                }
            );

            child.once(
                'error',
                reject
            );

            child.once(
                'close',
                code => {
                    if (
                        code ===
                        0
                    ) {
                        resolve();
                        return;
                    }

                    reject(
                        new Error(
                            stderr.trim() ||
                            `Process exited with code ${code}.`
                        )
                    );
                }
            );
        }
    );
}


async function extractZip(
    zipPath,
    destination
) {
    await ensureDir(
        destination
    );

    if (
        process.platform ===
        'win32'
    ) {
        const command = [
            'Expand-Archive',
            '-LiteralPath',
            `'${String(zipPath)
                .replace(/'/g, "''")}'`,
            '-DestinationPath',
            `'${String(destination)
                .replace(/'/g, "''")}'`,
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

    await runProcess(
        'unzip',
        [
            '-o',
            zipPath,
            '-d',
            destination
        ]
    );
}


async function findBlendFiles(
    rootDirectory
) {
    const result = [];

    if (
        !fs.existsSync(
            rootDirectory
        )
    ) {
        return result;
    }

    const queue = [
        rootDirectory
    ];

    while (
        queue.length
    ) {
        const directory =
            queue.shift();

        const entries =
            await fsp.readdir(
                directory,
                {
                    withFileTypes:
                        true
                }
            );

        for (
            const entry
            of entries
        ) {
            const target =
                path.join(
                    directory,
                    entry.name
                );

            if (
                entry.isDirectory()
            ) {
                queue.push(
                    target
                );

                continue;
            }

            if (
                entry.isFile() &&
                path.extname(
                    entry.name
                ).toLowerCase() ===
                    '.blend'
            ) {
                result.push(
                    target
                );
            }
        }
    }

    return result;
}


async function chooseLargestFile(
    filePaths
) {
    const entries = [];

    for (
        const filePath
        of filePaths
    ) {
        const stats =
            await fsp.stat(
                filePath
            );

        entries.push({
            path:
                filePath,

            size:
                stats.size
        });
    }

    entries.sort(
        (
            a,
            b
        ) =>
            b.size -
            a.size
    );

    return (
        entries[0] ||
        null
    );
}



const previewDataCache =
    new Map();


function decodeHTMLEntities(
    value
) {
    return String(
        value ||
        ''
    )
        .replace(
            /&amp;/g,
            '&'
        )
        .replace(
            /&quot;/g,
            '"'
        )
        .replace(
            /&#039;/g,
            "'"
        )
        .replace(
            /&lt;/g,
            '<'
        )
        .replace(
            /&gt;/g,
            '>'
        );
}


async function fetchImageAsDataURL(
    url,
    referer
) {
    const response =
        await fetch(
            url,
            {
                redirect:
                    'follow',

                headers: {
                    Accept:
                        'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',

                    'User-Agent':
                        'Mozilla/5.0 SM-Engine-Launcher',

                    ...(referer
                        ? {
                            Referer:
                                referer
                        }
                        : {})
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            `Preview request failed (${response.status}).`
        );
    }

    const contentType =
        String(
            response.headers.get(
                'content-type'
            ) ||
            ''
        )
            .split(';')[0]
            .trim()
            .toLowerCase();

    if (
        !contentType.startsWith(
            'image/'
        )
    ) {
        throw new Error(
            `Preview response is not an image (${contentType || 'unknown content type'}).`
        );
    }

    const arrayBuffer =
        await response.arrayBuffer();

    const buffer =
        Buffer.from(
            arrayBuffer
        );

    const maxBytes =
        8 * 1024 * 1024;

    if (
        buffer.length >
        maxBytes
    ) {
        throw new Error(
            'BlendSwap preview image is too large.'
        );
    }

    return `data:${contentType};base64,${buffer.toString('base64')}`;
}


async function fetchPreviewDataURL(
    assetId
) {
    const id =
        Number(
            assetId
        );

    if (
        !Number.isFinite(id) ||
        id <= 0
    ) {
        throw new Error(
            'Invalid BlendSwap asset id.'
        );
    }

    if (
        previewDataCache.has(
            id
        )
    ) {
        return previewDataCache.get(
            id
        );
    }

    const assetPage =
        `https://blendswap.com/blend/${id}`;

    const directPreview =
        `https://blendswap.com/blend_previews/${id}/0/0`;

    let dataURL = null;

    try {
        dataURL =
            await fetchImageAsDataURL(
                directPreview,
                assetPage
            );
    } catch (_) {
        /*
         * Fallback: inspect the public BlendSwap page for og:image / twitter:image.
         * This keeps previews working even if BlendSwap changes the direct preview route.
         */
        const pageResponse =
            await fetch(
                assetPage,
                {
                    redirect:
                        'follow',

                    headers: {
                        Accept:
                            'text/html,application/xhtml+xml',

                        'User-Agent':
                            'Mozilla/5.0 SM-Engine-Launcher'
                    }
                }
            );

        if (!pageResponse.ok) {
            throw new Error(
                `BlendSwap asset page failed (${pageResponse.status}).`
            );
        }

        const html =
            await pageResponse.text();

        const patterns = [
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
            /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i
        ];

        let previewURL =
            null;

        for (
            const pattern
            of patterns
        ) {
            const match =
                pattern.exec(
                    html
                );

            if (
                match?.[1]
            ) {
                previewURL =
                    decodeHTMLEntities(
                        match[1]
                    );

                break;
            }
        }

        if (!previewURL) {
            throw new Error(
                'BlendSwap preview image was not found.'
            );
        }

        previewURL =
            new URL(
                previewURL,
                assetPage
            ).toString();

        dataURL =
            await fetchImageAsDataURL(
                previewURL,
                assetPage
            );
    }

    previewDataCache.set(
        id,
        dataURL
    );

    /*
     * Prevent unbounded memory growth.
     */
    if (
        previewDataCache.size >
        80
    ) {
        const firstKey =
            previewDataCache.keys()
                .next()
                .value;

        previewDataCache.delete(
            firstKey
        );
    }

    return dataURL;
}


function createBlendSwapMarketplaceService({
    app,
    ipcMain,
    projectManager,
    getWindow,
    rootDir
}) {
    if (
        !app ||
        !ipcMain
    ) {
        throw new Error(
            'BlendSwap launcher service requires app and ipcMain.'
        );
    }

    loadLocalEnv(
        rootDir ||
        process.cwd()
    );

    const libraryRoot =
        path.join(
            app.getPath(
                'userData'
            ),
            'asset-library',
            'blendswap'
        );

    const indexPath =
        path.join(
            libraryRoot,
            'index.json'
        );


    async function readIndex() {
        const data =
            await readJson(
                indexPath,
                {
                    version: 1,
                    assets: []
                }
            );

        if (
            !Array.isArray(
                data.assets
            )
        ) {
            data.assets = [];
        }

        return data;
    }


    async function saveIndex(
        data
    ) {
        await writeJson(
            indexPath,
            data
        );
    }


    function sendProgress(
        detail
    ) {
        const window =
            typeof getWindow ===
            'function'
                ? getWindow()
                : null;

        if (
            window &&
            !window.isDestroyed()
        ) {
            window.webContents
                .send(
                    'library:downloadProgress',
                    detail
                );
        }
    }


    async function addToLibrary(
        assetInput
    ) {
        const asset =
            normalizeAsset(
                assetInput
            );

        if (
            !Number.isFinite(
                asset.id
            ) ||
            asset.id <= 0
        ) {
            throw new Error(
                'Invalid BlendSwap asset id.'
            );
        }

        const index =
            await readIndex();

        const existing =
            index.assets.find(
                item =>
                    Number(
                        item.assetId
                    ) ===
                    asset.id
            );

        if (
            existing?.installed &&
            existing.libraryDirectory &&
            fs.existsSync(
                existing.libraryDirectory
            )
        ) {
            return existing;
        }

        const downloadResponse =
            await requestJson(
                `${API_BASE}/downloads`,
                {
                    method:
                        'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify({
                            asset_id:
                                asset.id
                        })
                }
            );

        const downloadUrl =
            findDownloadUrl(
                downloadResponse
            );

        if (!downloadUrl) {
            throw new Error(
                'BlendSwap download response did not contain a download URL.'
            );
        }

        const folderName =
            `${asset.id}_${slugify(
                asset.title
            )}`;

        const assetDirectory =
            path.join(
                libraryRoot,
                folderName
            );

        const downloadsDirectory =
            path.join(
                assetDirectory,
                'downloads'
            );

        const sourceDirectory =
            path.join(
                assetDirectory,
                'source'
            );

        await ensureDir(
            downloadsDirectory
        );

        await ensureDir(
            sourceDirectory
        );

        const preferredFile =
            asset.files.find(
                file =>
                    file?.format ===
                    'blender'
            ) ||
            asset.files[0] ||
            null;

        sendProgress({
            assetId:
                asset.id,

            title:
                asset.title,

            phase:
                'downloading',

            percentage:
                0
        });

        const downloadedPath =
            await downloadFile(
                downloadUrl,
                downloadsDirectory,
                preferredFile
                    ?.filename ||
                    `${folderName}.blend`,

                progress => {
                    sendProgress({
                        assetId:
                            asset.id,

                        title:
                            asset.title,

                        phase:
                            'downloading',

                        ...progress
                    });
                }
            );

        let primaryBlendPath =
            null;

        const extension =
            path.extname(
                downloadedPath
            ).toLowerCase();

        if (
            extension ===
            '.zip'
        ) {
            sendProgress({
                assetId:
                    asset.id,

                title:
                    asset.title,

                phase:
                    'extracting',

                percentage:
                    null
            });

            await extractZip(
                downloadedPath,
                sourceDirectory
            );

            const blendFiles =
                await findBlendFiles(
                    sourceDirectory
                );

            const largest =
                await chooseLargestFile(
                    blendFiles
                );

            primaryBlendPath =
                largest?.path ||
                null;
        } else {
            const target =
                path.join(
                    sourceDirectory,
                    path.basename(
                        downloadedPath
                    )
                );

            await fsp.copyFile(
                downloadedPath,
                target
            );

            if (
                path.extname(
                    target
                ).toLowerCase() ===
                '.blend'
            ) {
                primaryBlendPath =
                    target;
            }
        }

        if (!primaryBlendPath) {
            const blendFiles =
                await findBlendFiles(
                    sourceDirectory
                );

            const largest =
                await chooseLargestFile(
                    blendFiles
                );

            primaryBlendPath =
                largest?.path ||
                null;
        }

        const record = {
            id:
                `blendswap:${asset.id}`,

            provider:
                'blendswap',

            assetId:
                asset.id,

            title:
                asset.title,

            description:
                asset.description,

            sourceUrl:
                asset.url,

            category:
                asset.category,

            author:
                asset.author,

            license:
                asset.license,

            licenseSource:
                asset.licenseSource,

            tags:
                asset.tags,

            sizeBytes:
                asset.sizeBytes,

            blenderVersions:
                asset.blenderVersions,

            sourceFiles:
                asset.files,

            libraryDirectory:
                assetDirectory,

            downloadedPath,

            primaryBlendPath,

            installed:
                true,

            installedAt:
                new Date()
                    .toISOString()
        };

        await writeJson(
            path.join(
                assetDirectory,
                'asset.json'
            ),
            record
        );

        index.assets =
            index.assets.filter(
                item =>
                    Number(
                        item.assetId
                    ) !==
                    asset.id
            );

        index.assets.push(
            record
        );

        await saveIndex(
            index
        );

        sendProgress({
            assetId:
                asset.id,

            title:
                asset.title,

            phase:
                'done',

            percentage:
                100
        });

        return record;
    }


    async function removeFromLibrary(
        assetId
    ) {
        const id =
            Number(
                assetId
            );

        const index =
            await readIndex();

        const record =
            index.assets.find(
                item =>
                    Number(
                        item.assetId
                    ) ===
                    id
            );

        if (!record) {
            return false;
        }

        if (
            record.libraryDirectory &&
            fs.existsSync(
                record.libraryDirectory
            )
        ) {
            await fsp.rm(
                record.libraryDirectory,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            );
        }

        index.assets =
            index.assets.filter(
                item =>
                    Number(
                        item.assetId
                    ) !==
                    id
            );

        await saveIndex(
            index
        );

        return true;
    }


    async function addLibraryAssetToProject({
        assetId,
        projectId
    } = {}) {
        if (!projectManager) {
            throw new Error(
                'ProjectManager is unavailable.'
            );
        }

        const project =
            projectManager
                .list()
                .find(
                    item =>
                        item.id ===
                        projectId
                );

        if (!project) {
            throw new Error(
                'Project not found.'
            );
        }

        const index =
            await readIndex();

        const record =
            index.assets.find(
                item =>
                    Number(
                        item.assetId
                    ) ===
                    Number(
                        assetId
                    )
            );

        if (!record) {
            throw new Error(
                'Asset is not installed in the SM Library.'
            );
        }

        const targetDirectory =
            path.join(
                project.path,
                'Assets',
                'Marketplace',
                'BlendSwap',
                `${record.assetId}_${slugify(
                    record.title
                )}`
            );

        const targetSource =
            path.join(
                targetDirectory,
                'Source'
            );

        await fsp.rm(
            targetDirectory,
            {
                recursive:
                    true,

                force:
                    true
            }
        );

        await ensureDir(
            targetSource
        );

        const sourceDirectory =
            path.join(
                record.libraryDirectory,
                'source'
            );

        if (
            fs.existsSync(
                sourceDirectory
            )
        ) {
            await fsp.cp(
                sourceDirectory,
                targetSource,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            );
        }

        const projectRecord = {
            ...record,

            projectId:
                project.id,

            projectPath:
                project.path,

            projectAssetDirectory:
                targetDirectory,

            addedToProjectAt:
                new Date()
                    .toISOString()
        };

        await writeJson(
            path.join(
                targetDirectory,
                'asset.json'
            ),
            projectRecord
        );

        return {
            ok:
                true,

            project,

            asset:
                projectRecord,

            targetDirectory
        };
    }


    async function register() {
        await ensureDir(
            libraryRoot
        );

        const removeHandler =
            channel => {
                try {
                    ipcMain.removeHandler(
                        channel
                    );
                } catch (_) {
                    // Ignore.
                }
            };

        [
            'marketplace:blendswap:search',
            'marketplace:blendswap:preview',
            'library:list',
            'library:add',
            'library:remove',
            'library:addToProject'
        ].forEach(
            removeHandler
        );

        ipcMain.handle(
            'marketplace:blendswap:search',
            async (
                _event,
                payload = {}
            ) => {
                try {
                    const data =
                        await searchBlendSwap(
                            payload
                        );

                    return {
                        ok:
                            true,

                        ...data
                    };
                } catch (error) {
                    return {
                        ok:
                            false,

                        error:
                            error?.message ||
                            String(error),

                        data:
                            [],

                        pagination:
                            null
                    };
                }
            }
        );

        ipcMain.handle(
            'marketplace:blendswap:preview',
            async (
                _event,
                assetId
            ) => {
                try {
                    return {
                        ok:
                            true,

                        dataURL:
                            await fetchPreviewDataURL(
                                assetId
                            )
                    };
                } catch (error) {
                    return {
                        ok:
                            false,

                        dataURL:
                            null,

                        error:
                            error?.message ||
                            String(error)
                    };
                }
            }
        );


        ipcMain.handle(
            'library:list',
            async () => {
                const index =
                    await readIndex();

                return {
                    ok:
                        true,

                    assets:
                        index.assets
                };
            }
        );

        ipcMain.handle(
            'library:add',
            async (
                _event,
                asset
            ) => {
                try {
                    return {
                        ok:
                            true,

                        asset:
                            await addToLibrary(
                                asset
                            )
                    };
                } catch (error) {
                    return {
                        ok:
                            false,

                        error:
                            error?.message ||
                            String(error)
                    };
                }
            }
        );

        ipcMain.handle(
            'library:remove',
            async (
                _event,
                assetId
            ) => {
                try {
                    return {
                        ok:
                            await removeFromLibrary(
                                assetId
                            )
                    };
                } catch (error) {
                    return {
                        ok:
                            false,

                        error:
                            error?.message ||
                            String(error)
                    };
                }
            }
        );

        ipcMain.handle(
            'library:addToProject',
            async (
                _event,
                payload = {}
            ) => {
                try {
                    return await addLibraryAssetToProject(
                        payload
                    );
                } catch (error) {
                    return {
                        ok:
                            false,

                        error:
                            error?.message ||
                            String(error)
                    };
                }
            }
        );
    }


    return {
        register,
        searchBlendSwap,
        addToLibrary,
        removeFromLibrary,
        addLibraryAssetToProject,

        getLibraryRoot:
            () =>
                libraryRoot,

        getApiKeyStatus:
            () => ({
                configured:
                    !!getApiKey()
            })
    };
}


module.exports = {
    createBlendSwapMarketplaceService
};
