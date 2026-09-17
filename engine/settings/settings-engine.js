// ============================================================
// engine/settings/settings-engine.js
//
// Boots the settings system and exposes the public facade the
// rest of the app (and the settings panel UI) uses:
//
//     EngineSettings.get(id)
//     EngineSettings.set(id, value)
//     EngineSettings.getAll()
//     EngineSettings.restore()   - load persisted prefs
//     EngineSettings.applyAll()  - push everything into the engine
//     EngineSettings.reset(id)
//     EngineSettings.onChange(cb)
//
// Load order: settings-store.js -> settings-appliers.js ->
// settings-engine.js (this file). Panels only ever talk to
// window.EngineSettings, never to the engine objects directly.
// ============================================================

(function () {
    const store = window.EngineSettingsStore;
    if (!store) {
        console.error('[SettingsEngine] EngineSettingsStore missing - settings-store.js must load first.');
        return;
    }

    // Apply everything as soon as the engine has finished booting.
    const applyWhenReady = () => {
        if (window.initCompleted && window.renderer) {
            store.applyAll();
        } else {
            setTimeout(applyWhenReady, 250);
        }
    };

    const facade = {
        store,

        get: (id) => store.get(id),
        set: (id, value) => store.set(id, value),
        getAll: () => store.getAll(),
        has: (id) => store.has(id),

        restore: (opts) => store.restore(opts),
        applyAll: () => store.applyAll(),
        apply: (id) => store.apply(id),
        reset: (id) => store.reset(id),
        onChange: (cb) => store.onChange(cb)
    };

    window.EngineSettings = facade;
    window.smEngineSettings = facade;

    // Restore persisted prefs at load time (without applying yet -
    // engine objects don't exist at this point). applyAll() happens
    // once init() completes.
    facade.restore();
    applyWhenReady();

    console.log('[SettingsEngine] Settings engine ready.');
})();