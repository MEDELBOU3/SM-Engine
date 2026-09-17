// engine/architecture/SMArchitectureBootstrap.js
(function (global) {
    'use strict';

    function initSMArchitecture(options = {}) {
        if (!global.THREE) {
            throw new Error('THREE must be available before SM Architecture.');
        }

        if (!global.SMBuildingGenerator) {
            throw new Error('SMBuildingGenerator is not loaded.');
        }

        if (!global.smBuildingGenerator) {
            global.smBuildingGenerator = new global.SMBuildingGenerator(options);
        }

        global.SMArchitectureAssetsBridge?.install?.();

        const api = {
            version: '1.0.0',
            generator: global.smBuildingGenerator,
            parse: (input, parseOptions) =>
                global.SMBuildingMapParser.parse(input, parseOptions),
            generate: (input, generateOptions) =>
                global.smBuildingGenerator.generate(input, generateOptions),
            addToScene: (input, scene, generateOptions) =>
                global.smBuildingGenerator.addToScene(input, scene, generateOptions),
            validate: (input) => {
                const map = input?.format === 'SM_BUILDING_MAP'
                    ? input
                    : global.SMBuildingMapParser.parse(input);
                return global.SMBuildingSchema.validate(map);
            }
        };

        global.SMArchitecture = api;

        try {
            global.dispatchEvent?.(
                new CustomEvent('sm-architecture-ready', {
                    detail: api
                })
            );
        } catch (_) {}

        console.log('[SM Architecture] v1.0.0 ready.');
        return api;
    }

    global.initSMArchitecture = initSMArchitecture;

    if (document?.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            try { initSMArchitecture(); } catch (error) {
                console.warn('[SM Architecture] Auto-init deferred:', error.message);
            }
        }, { once: true });
    } else {
        try { initSMArchitecture(); } catch (error) {
            console.warn('[SM Architecture] Auto-init deferred:', error.message);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
