(function (global) {
    'use strict';

    function installLauncher() {
        if (document.getElementById('sm-blendswap-launcher')) {
            return true;
        }

        const hosts = [
            document.querySelector('#assets-panel .panel-header'),
            document.querySelector('#assets-panel .assets-header'),
            document.querySelector('#assetsPanel .panel-header'),
            document.querySelector('[data-panel="assets"] .panel-header'),
            document.querySelector('.assets-panel .panel-header')
        ].filter(Boolean);

        const host = hosts[0];

        if (!host) return false;

        const button = document.createElement('button');

        button.id = 'sm-blendswap-launcher';
        button.type = 'button';
        button.textContent = 'BlendSwap';
        button.title = 'Browse BlendSwap online Blender assets';
        button.className = 'sm-blendswap-launcher';

        button.style.cssText = `
            margin-left:auto;
            min-height:26px;
            padding:0 9px;
            border:1px solid rgba(255,128,52,.18);
            border-radius:7px;
            background:rgba(255,116,35,.07);
            color:#d9a078;
            font:700 10px/1 system-ui,sans-serif;
            cursor:pointer;
        `;

        button.addEventListener(
            'click',
            () => global.openSMBlendSwap?.()
        );

        host.appendChild(button);

        return true;
    }

    function init() {
        if (
            !global.smBlendSwapClient ||
            !global.smBlendSwapAssetImporter
        ) {
            console.warn(
                '[SM BlendSwap] Client/importer not ready.'
            );
            return false;
        }

        if (!global.smBlendSwapClient.isAvailable()) {
            console.warn(
                '[SM BlendSwap] Electron preload bridge unavailable.'
            );
        }

        if (!installLauncher()) {
            let attempts = 0;

            const timer = setInterval(
                () => {
                    attempts++;

                    if (
                        installLauncher() ||
                        attempts >= 12
                    ) {
                        clearInterval(timer);
                    }
                },
                500
            );
        }

        global.SMBlendSwap = {
            version: '1.0.0',
            client: global.smBlendSwapClient,
            importer: global.smBlendSwapAssetImporter,
            open: global.openSMBlendSwap
        };

        console.log('[SM BlendSwap] Integration ready.');

        return true;
    }

    global.initSMBlendSwap = init;

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            init,
            { once: true }
        );
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
