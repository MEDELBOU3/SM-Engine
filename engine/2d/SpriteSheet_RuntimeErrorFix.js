/**
 * SM Engine — Sprite Sheet / Assets Manager Runtime Compatibility Fix
 *
 * Fixes:
 *   1) "Original image data could not be decoded"
 *   2) "Assets Manager is not loaded yet..."
 *
 * Load this file AFTER THREE.js, AssetsPanel and the Sprite Sheet editor
 * loader. It is safe to load near the end of the application script list.
 */
(function (global) {
    'use strict';

    const state = global.__SMAssetRuntimeCompatibility =
        global.__SMAssetRuntimeCompatibility || {};

    state.ready = false;

    function waitForAssetsManager(timeoutMs = 15000) {
        const started = Date.now();

        return new Promise((resolve, reject) => {
            const check = () => {
                const panel =
                    global.AssetsPanel ||
                    global.assetsPanel ||
                    global.assetsManager ||
                    global.SMAssetsPanel ||
                    null;

                const loaded =
                    !!panel &&
                    (
                        panel.initialized === true ||
                        panel.isLoaded === true ||
                        panel.ready === true ||
                        typeof panel.openSpriteSheetAsset === 'function'
                    );

                if (loaded) {
                    state.ready = true;
                    state.panel = panel;
                    resolve(panel);
                    return;
                }

                if (Date.now() - started >= timeoutMs) {
                    reject(new Error(
                        'Assets Manager is still unavailable after startup wait.'
                    ));
                    return;
                }

                setTimeout(check, 100);
            };

            check();
        });
    }

    async function blobToDataURL(blob) {
        if (!(blob instanceof Blob)) return null;

        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('FileReader failed.'));
            reader.readAsDataURL(blob);
        });
    }

    async function normalizeImageSource(source) {
        if (!source) return null;

        if (source instanceof Blob) {
            return await blobToDataURL(source);
        }

        if (source instanceof ArrayBuffer) {
            const blob = new Blob([source], { type: 'image/png' });
            return await blobToDataURL(blob);
        }

        if (source instanceof Uint8Array) {
            const blob = new Blob([source], { type: 'image/png' });
            return await blobToDataURL(blob);
        }

        if (typeof source === 'string') {
            return source;
        }

        if (source.data instanceof Blob) {
            return await blobToDataURL(source.data);
        }

        if (source.blob instanceof Blob) {
            return await blobToDataURL(source.blob);
        }

        if (typeof source.url === 'string') {
            return source.url;
        }

        return null;
    }

    async function decodeOriginalImage(source) {
        const normalized = await normalizeImageSource(source);
        if (!normalized) {
            throw new Error('No original image source was supplied.');
        }

        const image = new Image();
        image.decoding = 'async';
        image.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(
                new Error('Original image data could not be decoded.')
            );
            image.src = normalized;
        });

        // Preserve the original PNG source. Do not replace it with a thumbnail.
        return {
            source: normalized,
            image
        };
    }

    global.SMAssetRuntimeCompatibility = {
        waitForAssetsManager,
        normalizeImageSource,
        decodeOriginalImage
    };

    // Non-blocking startup readiness check.
    waitForAssetsManager().catch(() => {
        // AssetsPanel may legitimately be loaded later by the app's module loader.
        // The explicit waitForAssetsManager() API will retry when requested.
    });
})(window);
