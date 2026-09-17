// ============================================================================
// engine/settings/file-paths/SMFilePathsSettingsBridge.js
//
// Registers File Paths inside EngineSettingsStore BEFORE settings-engine.js
// restores persisted values.
// ============================================================================

(function () {
    'use strict';

    const store =
        window.EngineSettingsStore;

    const manager =
        window.SMFilePathsManager;

    if (!store) {
        console.error(
            '[SMFilePathsSettingsBridge] EngineSettingsStore missing.'
        );

        return;
    }

    const pathDefinitions =
        manager?.definitions ||
        [
            ['projectRoot', 'setting-filepaths-project-root', '/'],
            ['assets', 'setting-filepaths-assets', '${PROJECT}/Assets'],
            ['maps', 'setting-filepaths-maps', '${PROJECT}/Maps'],
            ['scripts', 'setting-filepaths-scripts', '${PROJECT}/Scripts'],
            ['config', 'setting-filepaths-config', '${PROJECT}/Config'],
            ['models', 'setting-filepaths-models', '${ASSETS}/Models'],
            ['textures', 'setting-filepaths-textures', '${ASSETS}/Textures'],
            ['materials', 'setting-filepaths-materials', '${ASSETS}/Materials'],
            ['audio', 'setting-filepaths-audio', '${ASSETS}/Audio'],
            ['animations', 'setting-filepaths-animations', '${ASSETS}/Animations'],
            ['ui', 'setting-filepaths-ui', '${ASSETS}/UI'],
            ['cache', 'setting-filepaths-cache', '${PROJECT}/.cache'],
            ['derived', 'setting-filepaths-derived', '${PROJECT}/.derived'],
            ['temp', 'setting-filepaths-temp', '${PROJECT}/.temp'],
            ['autosave', 'setting-filepaths-autosave', '${PROJECT}/.autosave'],
            ['build', 'setting-filepaths-build', '${PROJECT}/Build'],
            ['exports', 'setting-filepaths-exports', '${PROJECT}/Exports'],
            ['screenshots', 'setting-filepaths-screenshots', '${PROJECT}/Screenshots'],
            ['recordings', 'setting-filepaths-recordings', '${PROJECT}/Recordings'],
            ['customAddons', 'setting-filepaths-custom-addons', '${PROJECT}/Addons'],
            ['templates', 'setting-filepaths-templates', '${PROJECT}/Templates']
        ].map(
            ([key, settingId, defaultValue]) => ({
                key,
                settingId,
                default: defaultValue
            })
        );

    const optionDefinitions =
        manager?.optionDefinitions ||
        [
            {
                key: 'useRelativePaths',
                settingId: 'setting-filepaths-use-relative',
                type: 'boolean',
                default: true
            },
            {
                key: 'createMissingFolders',
                settingId: 'setting-filepaths-create-missing',
                type: 'boolean',
                default: true
            },
            {
                key: 'cacheInsideProject',
                settingId: 'setting-filepaths-cache-inside-project',
                type: 'boolean',
                default: true
            },
            {
                key: 'cleanTempOnExit',
                settingId: 'setting-filepaths-clean-temp-on-exit',
                type: 'boolean',
                default: false
            }
        ];

    const define =
        (
            id,
            type,
            defaultValue
        ) => {
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
                        'file-paths',
                    default:
                        defaultValue
                }
            );
        };

    for (
        const def of
        pathDefinitions
    ) {
        define(
            def.settingId,
            'string',
            def.default
        );

        store.registerApplier(
            def.settingId,
            value => {
                window.SMFilePathsManager
                    ?.setPath?.(
                        def.key,
                        value
                    );
            }
        );
    }

    for (
        const def of
        optionDefinitions
    ) {
        define(
            def.settingId,
            def.type,
            def.default
        );

        store.registerApplier(
            def.settingId,
            value => {
                window.SMFilePathsManager
                    ?.setOption?.(
                        def.key,
                        value
                    );
            }
        );
    }

    const sync =
        () => {
            const currentManager =
                window.SMFilePathsManager;

            if (!currentManager) {
                return false;
            }

            for (
                const def of
                pathDefinitions
            ) {
                const value =
                    store.get(
                        def.settingId
                    );

                if (
                    value !== undefined
                ) {
                    currentManager
                        .setPath(
                            def.key,
                            value,
                            {
                                emit:
                                    false
                            }
                        );
                }
            }

            for (
                const def of
                optionDefinitions
            ) {
                const value =
                    store.get(
                        def.settingId
                    );

                if (
                    value !== undefined
                ) {
                    currentManager
                        .setOption(
                            def.key,
                            value,
                            {
                                emit:
                                    false
                            }
                        );
                }
            }

            return true;
        };

    sync();

    window.addEventListener(
        'sm:file-paths-ready',
        sync
    );

    window.addEventListener(
        'sm:engine-settings-restored',
        sync
    );

    window.SMFilePathsSettingsBridge = {
        pathDefinitions,
        optionDefinitions,
        sync,

        debug() {
            console.table(
                pathDefinitions.map(
                    def => ({
                        Setting:
                            def.settingId,
                        Value:
                            store.get(
                                def.settingId
                            ),
                        Default:
                            def.default
                    })
                )
            );
        }
    };

    window.smFilePathsSettingsBridge =
        window.SMFilePathsSettingsBridge;
})();