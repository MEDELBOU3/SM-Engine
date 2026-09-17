(function (global) {
    'use strict';

    class BlendSwapClient {
        constructor(options = {}) {
            this.options = {
                defaultLicense: 'cc0',
                defaultFormat: 'blender',
                scenesOnly: true,
                ...options
            };

            this.lastSearch = null;
            this.rateLimit = null;
        }

        get bridge() {
            return global.electronAPI?.blendswap || null;
        }

        isAvailable() {
            return !!(
                this.bridge &&
                typeof this.bridge.search === 'function' &&
                typeof this.bridge.download === 'function'
            );
        }

        async keyStatus() {
            if (typeof this.bridge?.hasApiKey !== 'function') {
                return {
                    configured: false,
                    source: 'unavailable'
                };
            }

            return this.bridge.hasApiKey();
        }

        async setApiKey(key) {
            if (typeof this.bridge?.setApiKey !== 'function') {
                throw new Error('BlendSwap preload bridge is unavailable.');
            }

            return this.bridge.setApiKey(String(key || '').trim());
        }

        async clearApiKey() {
            return this.bridge?.clearApiKey?.();
        }

        normalizeAsset(asset) {
            const files = Array.isArray(asset?.files) ? asset.files : [];
            const blenderFiles = files.filter(
                (file) =>
                    String(file?.format || '').toLowerCase() === 'blender'
            );

            const primary = blenderFiles[0] || files[0] || null;

            return {
                id: Number(asset?.id),
                title: String(asset?.title || 'Untitled BlendSwap Asset'),
                url: asset?.url || null,
                description: String(asset?.description || ''),
                assetType: asset?.asset_type || null,
                assetTypeLabel: asset?.asset_type_label || null,
                category: asset?.category || null,
                tags: Array.isArray(asset?.tags) ? asset.tags : [],
                author: asset?.author || null,
                license: asset?.license || null,
                licenseSource:
                    asset?.license_source ||
                    asset?.license?.license_source ||
                    null,
                counts: asset?.counts || {},
                blenderVersions: Array.isArray(asset?.blender_versions)
                    ? asset.blender_versions
                    : [],
                sizeBytes: Number(
                    asset?.size_bytes ||
                    primary?.size_bytes ||
                    0
                ),
                createdAt: asset?.created_at || null,
                files,
                primaryFile: primary
            };
        }

        async search(query, options = {}) {
            if (!this.isAvailable()) {
                throw new Error('BlendSwap Electron bridge is unavailable.');
            }

            const response = await this.bridge.search({
                q: String(query || '').trim(),
                license:
                    options.license ??
                    this.options.defaultLicense,
                format:
                    options.format ??
                    this.options.defaultFormat,
                page: options.page || 1
            });

            if (!response?.ok) {
                const error = new Error(
                    response?.error ||
                    'BlendSwap search failed.'
                );

                error.status = response?.status || null;
                error.retryAfter = response?.retryAfter || null;
                throw error;
            }

            this.rateLimit = response.rateLimit || null;

            let assets = (response.data || [])
                .map((asset) => this.normalizeAsset(asset));

            const scenesOnly =
                options.scenesOnly ??
                this.options.scenesOnly;

            if (scenesOnly) {
                assets = assets.filter(
                    (asset) =>
                        String(
                            asset.category?.slug || ''
                        ).toLowerCase() === 'scenes'
                );
            }

            this.lastSearch = {
                query,
                assets,
                pagination: response.pagination || null,
                rateLimit: response.rateLimit || null
            };

            return this.lastSearch;
        }

        async download(asset) {
            if (!asset?.id) {
                throw new Error('A BlendSwap asset is required.');
            }

            const primary =
                asset.primaryFile ||
                asset.files?.[0] ||
                null;

            const response = await this.bridge.download({
                assetId: asset.id,
                filename:
                    primary?.filename ||
                    `${asset.title}.blend`,
                title: asset.title,
                assetUrl: asset.url,
                author: asset.author?.username || null,
                authorUrl: asset.author?.url || null,
                license: asset.license?.key || null,
                licenseSource: asset.licenseSource || null
            });

            if (!response?.ok) {
                throw new Error(
                    response?.error ||
                    'BlendSwap download failed.'
                );
            }

            return response;
        }

        onDownloadProgress(callback) {
            return (
                this.bridge?.onDownloadProgress?.(callback) ||
                (() => {})
            );
        }

        cancelDownload(assetId) {
            return this.bridge?.cancelDownload?.(assetId);
        }
    }

    global.SMBlendSwapClient = BlendSwapClient;
    global.smBlendSwapClient =
        global.smBlendSwapClient ||
        new BlendSwapClient();
})(typeof window !== 'undefined' ? window : globalThis);
