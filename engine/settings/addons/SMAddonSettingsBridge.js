// ============================================================================
// engine/settings/addons/SMAddonSettingsBridge.js
//
// SM Engine — Add-on Settings Bridge
//
// PURPOSE
// -------
// Registers global Add-on policy preferences inside the existing
// EngineSettingsStore so they participate in:
//
//     EngineSettings.get()
//     EngineSettings.set()
//     EngineSettings.restore()
//     EngineSettings.applyAll()
//     EngineSettings.reset()
//     EngineSettings.onChange()
//
// IMPORTANT LOAD ORDER
// --------------------
// settings-store.js
// Add-ons core (Storage/Registry/Context/Manager)
// SMAddonSettingsBridge.js        <-- THIS FILE
// settings-appliers.js
// settings-engine.js
//
// It MUST load before settings-engine.js because settings-engine.js calls
// restore() immediately and these IDs must already exist in the schema.
// ============================================================================

(function () {
    'use strict';

    const store =
        window.EngineSettingsStore;

    if (!store) {
        console.error(
            '[SMAddonSettingsBridge] EngineSettingsStore missing. ' +
            'Load engine/settings/settings-store.js first.'
        );

        return;
    }

    // ------------------------------------------------------------------------
    // Registration helper
    // ------------------------------------------------------------------------

    const define =
        (
            id,
            type,
            defaultValue
        ) => {
            /*
             * Avoid destructive redefinition if this bridge gets loaded twice.
             * Existing schema/value stays authoritative.
             */
            if (
                typeof store.has ===
                    'function' &&
                store.has(id)
            ) {
                return;
            }

            store.define(
                id,
                {
                    type,
                    group:
                        'addons',

                    default:
                        defaultValue
                }
            );
        };

    // ------------------------------------------------------------------------
    // Global Add-on policy
    // ------------------------------------------------------------------------

    define(
        'setting-addons-master-enabled',
        'boolean',
        true
    );

    define(
        'setting-addons-safe-mode',
        'boolean',
        false
    );

    define(
        'setting-addons-auto-start',
        'boolean',
        true
    );

    define(
        'setting-addons-allow-experimental',
        'boolean',
        false
    );

    define(
        'setting-addons-log-level',
        'string',
        'info'
    );

    // ------------------------------------------------------------------------
    // Policy applier
    // ------------------------------------------------------------------------

    const applyManagerPolicy =
        (
            key,
            transform =
                value => value
        ) =>
            value => {
                const manager =
                    window.SMAddonManager;

                if (
                    !manager ||
                    typeof manager.setPolicy !==
                        'function'
                ) {
                    /*
                     * Safe early-boot behavior:
                     * settings may be applied before the Add-on manager is
                     * fully bootstrapped. The value stays in SettingsStore and
                     * will be synchronized again by syncAllToManager().
                     */
                    return;
                }

                manager.setPolicy(
                    key,
                    transform(
                        value
                    )
                );
            };

    store.registerApplier(
        'setting-addons-master-enabled',
        applyManagerPolicy(
            'masterEnabled',
            value =>
                Boolean(value)
        )
    );

    store.registerApplier(
        'setting-addons-safe-mode',
        applyManagerPolicy(
            'safeMode',
            value =>
                Boolean(value)
        )
    );

    store.registerApplier(
        'setting-addons-auto-start',
        applyManagerPolicy(
            'autoStart',
            value =>
                Boolean(value)
        )
    );

    store.registerApplier(
        'setting-addons-allow-experimental',
        applyManagerPolicy(
            'allowExperimental',
            value =>
                Boolean(value)
        )
    );

    store.registerApplier(
        'setting-addons-log-level',
        applyManagerPolicy(
            'logLevel',
            value => {
                const normalized =
                    String(
                        value ||
                        'info'
                    )
                        .trim()
                        .toLowerCase();

                return [
                    'debug',
                    'info',
                    'warn',
                    'error',
                    'none'
                ].includes(
                    normalized
                )
                    ? normalized
                    : 'info';
            }
        )
    );

    // ------------------------------------------------------------------------
    // Synchronization
    // ------------------------------------------------------------------------

    const syncAllToManager =
        () => {
            const manager =
                window.SMAddonManager;

            if (
                !manager ||
                typeof manager.setPolicy !==
                    'function'
            ) {
                return false;
            }

            manager.setPolicy(
                'masterEnabled',
                Boolean(
                    store.get(
                        'setting-addons-master-enabled'
                    )
                )
            );

            manager.setPolicy(
                'safeMode',
                Boolean(
                    store.get(
                        'setting-addons-safe-mode'
                    )
                )
            );

            manager.setPolicy(
                'autoStart',
                Boolean(
                    store.get(
                        'setting-addons-auto-start'
                    )
                )
            );

            manager.setPolicy(
                'allowExperimental',
                Boolean(
                    store.get(
                        'setting-addons-allow-experimental'
                    )
                )
            );

            const logLevel =
                String(
                    store.get(
                        'setting-addons-log-level'
                    ) ||
                    'info'
                )
                    .trim()
                    .toLowerCase();

            manager.setPolicy(
                'logLevel',
                [
                    'debug',
                    'info',
                    'warn',
                    'error',
                    'none'
                ].includes(
                    logLevel
                )
                    ? logLevel
                    : 'info'
            );

            return true;
        };

    /*
     * Core manager normally already exists because this file loads after
     * SMAddonManager.js. Still listen for the ready event so the bridge stays
     * robust if boot order changes later.
     */
    if (
        !syncAllToManager()
    ) {
        window.addEventListener(
            'sm:addon-manager-ready',
            syncAllToManager
        );
    }

    /*
     * settings-engine.js restores persisted values AFTER this file.
     * When the engine later calls applyAll(), the registered appliers above
     * push the restored values into the manager.
     *
     * Bootstrap also triggers manager readiness, so this extra listener makes
     * sure policy state is correct immediately before/default add-ons start.
     */
    window.addEventListener(
        'sm:addons-ready',
        syncAllToManager
    );

    // ------------------------------------------------------------------------
    // Public bridge/debug facade
    // ------------------------------------------------------------------------

    const bridge = {
        ids: [
            'setting-addons-master-enabled',
            'setting-addons-safe-mode',
            'setting-addons-auto-start',
            'setting-addons-allow-experimental',
            'setting-addons-log-level'
        ],

        sync:
            syncAllToManager,

        getPolicy() {
            return {
                masterEnabled:
                    Boolean(
                        store.get(
                            'setting-addons-master-enabled'
                        )
                    ),

                safeMode:
                    Boolean(
                        store.get(
                            'setting-addons-safe-mode'
                        )
                    ),

                autoStart:
                    Boolean(
                        store.get(
                            'setting-addons-auto-start'
                        )
                    ),

                allowExperimental:
                    Boolean(
                        store.get(
                            'setting-addons-allow-experimental'
                        )
                    ),

                logLevel:
                    String(
                        store.get(
                            'setting-addons-log-level'
                        ) ||
                        'info'
                    )
            };
        },

        debug() {
            console.table(
                this.getPolicy()
            );
        }
    };

    window.SMAddonSettingsBridge =
        bridge;

    window.smAddonSettingsBridge =
        bridge;

    console.info(
        '[SMAddonSettingsBridge] Add-on settings registered.'
    );
})();