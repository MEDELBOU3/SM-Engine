// Environment/HDRI/SMHDRIEnvironmentConfig.js
(function () {
    'use strict';

    window.SMHDRIEnvironmentConfig = {
        enabled: true,

        // HDRI is now the default visible sky/environment.
        useAsBackground: true,
        hideProceduralSky: true,

        // Prefer a user/imported HDRI over built-in URL fallbacks.
        preferPersistedEnvironment: true,
        preferAssetsPanelHDRI: true,

        // Optional explicit default Asset ID. It can also be set at runtime:
        // SMHDRIDefaultEnvironment.setDefaultAsset('asset-id')
        defaultAssetId:
            localStorage.getItem('sm_default_hdri_asset_id') ||
            null,

        // If no persisted/imported HDRI exists, the system tries these URLs.
        // Put your preferred HDR file at the first path if you want a packaged
        // engine default.
        defaultURLs: [
            'assets/environment/hdri/default.hdr',
            'assets/environment/default.hdr'
        ],

        // Balanced values for the graybox/game-development viewport.
        environmentIntensity: 0.72,
        backgroundIntensity: 1.0,

        // Directional sun is still used for sharp shadows, but its direction
        // and colour are extracted from the HDRI when possible.
        sunIntensityScale: 0.82,

        // Do not tint the procedural sky: it is hidden in HDRI-first mode.
        skyInfluence: 0.0,

        // Renderer / editor exposure.
        exposure: 0.82,
        exposureFloor: 0.66,
        exposureCeiling: 1.0,

        // Extra non-directional fill kept deliberately low because HDRI IBL
        // already supplies broad ambient lighting.
        sunMax: 1.85,
        hemisphereDay: 0.34,
        hemisphereNight: 0.05,
        ambient: 0.045,
        backFill: 0.08,

        // Fog should support the HDRI instead of washing it out.
        fogDensityGameDev: 0.00035,
        fogNear: 900,
        fogFar: 7000,

        // Hierarchy presentation.
        hierarchyRootName: 'Environment',
        hierarchyItemPrefix: 'HDRI Environment'
    };
})();