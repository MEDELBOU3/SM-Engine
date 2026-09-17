// sculpting/terrain-sculpting/TerrainSculptingSystem.js
// Main entry point. Load this file LAST.

(() => {
    const NS = window.TerrainSculpting;

    if (
        !NS?.preview ||
        !NS?.interaction ||
        !NS?.generator ||
        !NS?.ui
    ) {
        throw new Error(
            'Terrain sculpting dependencies are missing. Check script load order.'
        );
    }

    function initTerrainSculptingSystem(
        scene,
        camera,
        renderer,
        historyHandler
    ) {
        // Terrain can be opened without the mesh-sculpt workspace. Warm the
        // shared C++/WASM module here as well so native heightfield brushes do
        // not depend on another workspace having initialized first.
        const wasmInit = window.SculptWASM?.init?.();
        wasmInit?.catch?.((error) => {
            console.warn(
                '[TerrainSculptingSystem] Native terrain backend unavailable; JS fallback active.',
                error?.message || error
            );
        });

        NS.setContext(
            scene,
            camera,
            renderer,
            historyHandler
        );

        console.log(
            '🎨 Initializing Terrain Sculpting System...'
        );

        NS.surfaceQuery?.init?.();
        NS.playerPlay?.init?.();

        NS.preview.createBrushPreview();
        NS.preview.createOrUpdate3DBrushPreview();

        NS.interaction.initializeTerrainSculptingEventListeners();

        NS.ui.setupUIEventListeners();
        NS.ui.setupTerrainControls();
        NS.ui.setupBrushControls();
        NS.ui.bindToolButtons();
        NS.ui.setupPlayerTestControls?.();

        NS.generator.bindCreateTerrainButton();

        console.log(
            '✅ Terrain Sculpting System ready.'
        );

        return NS;
    }

    function refreshTerrainSculptingUI() {
        NS.ui.updateTerrainInspectorUI();
        NS.ui.setupTerrainControls();
        NS.ui.setupBrushControls();
        NS.ui.bindToolButtons();
        NS.ui.setupPlayerTestControls?.();
        NS.generator.bindCreateTerrainButton();
    }

    NS.init = initTerrainSculptingSystem;
    NS.refreshUI = refreshTerrainSculptingUI;

    window.initTerrainSculptingSystem =
        initTerrainSculptingSystem;

    window.refreshTerrainSculptingUI =
        refreshTerrainSculptingUI;

    // IMPORTANT:
    // The old terrain file exported window.initSculptingSystem, but that name
    // conflicts with your normal mesh/character sculpting system.
    // Use initTerrainSculptingSystem(...) for terrain from now on.

    // Bind the create-terrain button even if terrain sculpting is initialized later.
    const bindWhenReady = () => {
        NS.surfaceQuery?.init?.();
        NS.playerPlay?.init?.();
        NS.generator.bindCreateTerrainButton();
        NS.ui.setupUIEventListeners();
        NS.ui.setupPlayerTestControls?.();
    };

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            bindWhenReady,
            { once: true }
        );
    } else {
        bindWhenReady();
    }
})();
