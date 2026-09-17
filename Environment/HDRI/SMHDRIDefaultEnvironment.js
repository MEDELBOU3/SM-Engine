// Environment/HDRI/SMHDRIDefaultEnvironment.js
(function () {
    'use strict';

    class SMHDRIDefaultEnvironment {
        constructor() {
            this.initialized = false;
            this.loading = false;
            this.activeAsset = null;
            this.activeSource = null;
            this._bootTimer = 0;
        }

        get config() {
            return window.SMHDRIEnvironmentConfig || {};
        }

        get sky() {
            return window.skyLightingSystem || null;
        }

        async waitForSystems(
            timeout = 12000
        ) {
            const started =
                performance.now();

            while (
                performance.now() -
                started <
                timeout
            ) {
                if (
                    window.skyLightingSystem &&
                    window.THREE
                ) {
                    return true;
                }

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            80
                        )
                );
            }

            return false;
        }

        getAssets() {
            const assets =
                window.AssetsPanel
                    ?.assets;

            return Array.isArray(
                assets
            )
                ? assets
                : [];
        }

        isHDRIAsset(asset) {
            if (!asset) {
                return false;
            }

            const name =
                String(
                    asset.name ||
                    asset.fileName ||
                    asset.url ||
                    ''
                ).toLowerCase();

            const type =
                String(
                    asset.type ||
                    asset.assetType ||
                    ''
                ).toLowerCase();

            return (
                /\.hdr(?:$|[?#])/i.test(name) ||
                /\.exr(?:$|[?#])/i.test(name) ||
                type.includes('hdri') ||
                type === 'hdr' ||
                type === 'exr' ||
                type.includes(
                    'environment'
                )
            );
        }

        scoreAsset(asset) {
            const cfg =
                this.config;

            const name =
                String(
                    asset?.name ||
                    ''
                ).toLowerCase();

            let score = 0;

            if (
                cfg.defaultAssetId &&
                String(asset?.id) ===
                    String(
                        cfg.defaultAssetId
                    )
            ) {
                score += 10000;
            }

            if (
                asset?.isDefaultHDRI ===
                true
            ) {
                score += 5000;
            }

            if (
                /default|studio|environment|sky|outdoor/i
                    .test(name)
            ) {
                score += 200;
            }

            if (
                /\.hdr$/i.test(name)
            ) {
                score += 40;
            }

            if (
                /\.exr$/i.test(name)
            ) {
                score += 30;
            }

            return score;
        }

        resolveDefaultAsset() {
            const assets =
                this.getAssets()
                    .filter(
                        asset =>
                            this.isHDRIAsset(
                                asset
                            )
                    );

            if (!assets.length) {
                return null;
            }

            assets.sort(
                (a, b) =>
                    this.scoreAsset(b) -
                    this.scoreAsset(a)
            );

            return assets[0] || null;
        }

        async resolveAssetURL(asset) {
            if (!asset) {
                return null;
            }

            const panel =
                window.AssetsPanel;

            if (
                typeof panel
                    ?._getAssetSourceUrl ===
                'function'
            ) {
                try {
                    const result =
                        await Promise.resolve(
                            panel
                                ._getAssetSourceUrl(
                                    asset
                                )
                        );

                    if (result) {
                        return result;
                    }
                } catch (error) {
                    console.warn(
                        '[HDRI Default] AssetsPanel URL resolution failed:',
                        error
                    );
                }
            }

            return (
                asset.url ||
                asset.data ||
                asset.objectURL ||
                asset.src ||
                null
            );
        }

        async activateTexture(
            texture,
            {
                source = null,
                assetId = null,
                fileName = null,
                persist = false
            } = {}
        ) {
            const sky =
                this.sky;

            const cfg =
                this.config;

            if (
                !sky ||
                !texture
            ) {
                return false;
            }

            const applied =
                sky.applyExternalEnvironmentTexture(
                    texture,
                    {
                        intensity:
                            cfg.environmentIntensity ??
                            0.72,

                        asBackground:
                            true,

                        hideProceduralSky:
                            true,

                        skyInfluence:
                            0,

                        sunIntensityScale:
                            cfg.sunIntensityScale ??
                            0.82,

                        source,
                        assetId,
                        fileName,
                        persist
                    }
                );

            if (!applied) {
                return false;
            }

            window.smActiveHDRI = {
                texture,
                source,
                assetId,
                name:
                    fileName ||
                    this.activeAsset?.name ||
                    'Default HDRI',

                intensity:
                    cfg.environmentIntensity ??
                    0.72,

                type:
                    /\.exr$/i.test(
                        String(
                            fileName ||
                            source ||
                            ''
                        )
                    )
                        ? 'exr'
                        : 'hdr'
            };

            window.smHDRIEnvironmentEnabled =
                true;

            window.SMHDRILightingProfile
                ?.installHooks?.();

            window.SMHDRILightingProfile
                ?.apply?.();

            window.SMHDRIHierarchyAdapter
                ?.sync?.();

            return true;
        }

        async activateAsset(
            asset,
            {
                persist = false
            } = {}
        ) {
            const url =
                await this
                    .resolveAssetURL(
                        asset
                    );

            if (!url) {
                return false;
            }

            const sky =
                this.sky;

            const cfg =
                this.config;

            this.activeAsset =
                asset;

            this.activeSource =
                url;

            const loaded =
                await sky.loadEnvironment(
                    url,
                    {
                        intensity:
                            cfg.environmentIntensity ??
                            0.72,

                        asBackground:
                            true,

                        hideProceduralSky:
                            true,

                        skyInfluence:
                            0,

                        sunIntensityScale:
                            cfg.sunIntensityScale ??
                            0.82,

                        assetId:
                            asset.id ||
                            null,

                        fileName:
                            asset.name ||
                            null,

                        persistenceSource:
                            url,

                        sourceKind:
                            'asset',

                        persist
                    }
                );

            if (loaded) {
                window.smActiveHDRI = {
                    texture:
                        sky
                            ._externalEnvTexture,

                    source:
                        url,

                    assetId:
                        asset.id ||
                        null,

                    name:
                        asset.name ||
                        'Default HDRI',

                    intensity:
                        cfg.environmentIntensity ??
                        0.72,

                    type:
                        /\.exr$/i.test(
                            String(
                                asset.name ||
                                ''
                            )
                        )
                            ? 'exr'
                            : 'hdr'
                };

                window.smHDRIEnvironmentEnabled =
                    true;

                window.SMHDRILightingProfile
                    ?.installHooks?.();

                window.SMHDRILightingProfile
                    ?.apply?.();

                window.SMHDRIHierarchyAdapter
                    ?.sync?.();
            }

            return loaded;
        }

        async tryConfiguredURLs() {
            const sky =
                this.sky;

            const cfg =
                this.config;

            const urls =
                Array.isArray(
                    cfg.defaultURLs
                )
                    ? cfg.defaultURLs
                    : [];

            for (
                const url of urls
            ) {
                if (!url) {
                    continue;
                }

                try {
                    const loaded =
                        await sky.loadEnvironment(
                            url,
                            {
                                intensity:
                                    cfg.environmentIntensity ??
                                    0.72,

                                asBackground:
                                    true,

                                hideProceduralSky:
                                    true,

                                skyInfluence:
                                    0,

                                sunIntensityScale:
                                    cfg.sunIntensityScale ??
                                    0.82,

                                persistenceSource:
                                    url,

                                sourceKind:
                                    'url',

                                persist:
                                    false
                            }
                        );

                    if (loaded) {
                        this.activeSource =
                            url;

                        window.smActiveHDRI = {
                            texture:
                                sky
                                    ._externalEnvTexture,

                            source:
                                url,

                            assetId:
                                null,

                            name:
                                String(url)
                                    .split('/')
                                    .pop(),

                            intensity:
                                cfg.environmentIntensity ??
                                0.72,

                            type:
                                /\.exr$/i
                                    .test(url)
                                    ? 'exr'
                                    : 'hdr'
                        };

                        return true;
                    }
                } catch (_) {}
            }

            return false;
        }

        async ensureDefault() {
            if (
                !this.config.enabled ||
                this.loading
            ) {
                return false;
            }

            const ready =
                await this
                    .waitForSystems();

            if (!ready) {
                console.warn(
                    '[HDRI Default] SkyLightingSystem unavailable.'
                );

                return false;
            }

            this.loading = true;

            try {
                const sky =
                    this.sky;

                /*
                 * 1. If something already activated an HDRI, keep it.
                 */
                if (
                    sky._externalEnv &&
                    sky._externalEnvTexture
                ) {
                    window.SMHDRILightingProfile
                        ?.installHooks?.();

                    window.SMHDRILightingProfile
                        ?.apply?.();

                    window.SMHDRIHierarchyAdapter
                        ?.sync?.();

                    return true;
                }

                /*
                 * 2. Prefer last user-selected/persisted HDRI.
                 */
                if (
                    this.config
                        .preferPersistedEnvironment !==
                    false
                ) {
                    try {
                        await sky
                            .restorePersistedEnvironment?.({
                                silent:
                                    true
                            });
                    } catch (_) {}

                    if (
                        sky._externalEnv &&
                        sky._externalEnvTexture
                    ) {
                        window.SMHDRILightingProfile
                            ?.installHooks?.();

                        window.SMHDRILightingProfile
                            ?.apply?.();

                        window.SMHDRIHierarchyAdapter
                            ?.sync?.();

                        return true;
                    }
                }

                /*
                 * 3. Pick the best HDRI already in AssetsPanel.
                 */
                if (
                    this.config
                        .preferAssetsPanelHDRI !==
                    false
                ) {
                    const asset =
                        this
                            .resolveDefaultAsset();

                    if (
                        asset &&
                        await this
                            .activateAsset(
                                asset,
                                {
                                    persist:
                                        false
                                }
                            )
                    ) {
                        console.log(
                            `[HDRI Default] Using AssetsPanel HDRI: ${asset.name}`
                        );

                        return true;
                    }
                }

                /*
                 * 4. Packaged fallback URL.
                 */
                if (
                    await this
                        .tryConfiguredURLs()
                ) {
                    window.SMHDRILightingProfile
                        ?.installHooks?.();

                    window.SMHDRILightingProfile
                        ?.apply?.();

                    window.SMHDRIHierarchyAdapter
                        ?.sync?.();

                    return true;
                }

                /*
                 * No HDRI available. Do not crash the editor.
                 * The old procedural sky remains as fallback only.
                 */
                console.warn(
                    '[HDRI Default] No HDR/EXR environment found. ' +
                    'Import an HDRI into AssetsPanel or place default.hdr under ' +
                    'assets/environment/hdri/.'
                );

                return false;
            } finally {
                this.loading = false;
            }
        }

        async setDefaultAsset(
            assetId
        ) {
            if (assetId) {
                localStorage.setItem(
                    'sm_default_hdri_asset_id',
                    String(
                        assetId
                    )
                );
            } else {
                localStorage.removeItem(
                    'sm_default_hdri_asset_id'
                );
            }

            window.SMHDRIEnvironmentConfig
                .defaultAssetId =
                assetId ||
                null;

            const asset =
                this.getAssets()
                    .find(
                        item =>
                            String(
                                item.id
                            ) ===
                            String(
                                assetId
                            )
                    );

            if (!asset) {
                return false;
            }

            return await this
                .activateAsset(
                    asset,
                    {
                        persist:
                            true
                    }
                );
        }

        async init() {
            if (this.initialized) {
                return this
                    .ensureDefault();
            }

            this.initialized = true;

            [
                'sm:project-loaded',
                'sm:scene-loaded',
                'sm:workspace-changed',
                'sm:workspace-mode-changed',
                'sm-assets-panel-ui-ready',
                'sm:assets-ready'
            ].forEach(
                eventName => {
                    window.addEventListener(
                        eventName,
                        () => {
                            clearTimeout(
                                this._bootTimer
                            );

                            this._bootTimer =
                                setTimeout(
                                    () =>
                                        this
                                            .ensureDefault(),
                                    120
                                );
                        }
                    );
                }
            );

            window.addEventListener(
                'sm:hdri-asset-applied',
                () => {
                    window.SMHDRILightingProfile
                        ?.apply?.();

                    window.SMHDRIHierarchyAdapter
                        ?.sync?.();
                }
            );

            const ok =
                await this
                    .ensureDefault();

            return ok;
        }
    }

    window.SMHDRIDefaultEnvironment =
        window.SMHDRIDefaultEnvironment ||
        new SMHDRIDefaultEnvironment();

    const boot = () => {
        setTimeout(
            () => {
                window.SMHDRIDefaultEnvironment
                    ?.init?.();
            },
            0
        );
    };

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            boot,
            {
                once: true
            }
        );
    } else {
        boot();
    }
})();