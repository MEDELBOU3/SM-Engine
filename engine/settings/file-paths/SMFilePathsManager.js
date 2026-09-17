// ============================================================================
// engine/settings/file-paths/SMFilePathsManager.js
//
// SM Engine — File Paths Manager
//
// Browser-first path configuration for the SM Engine project system.
// Supports virtual project paths today, with an optional Chromium
// File System Access directory handle for native-folder workflows.
//
// This module owns path semantics, resolving, validation and native-folder
// access. It does NOT render Settings UI.
// ============================================================================

(function () {
    'use strict';

    const PATH_DEFINITIONS = Object.freeze([
        // PROJECT
        {
            key: 'projectRoot',
            settingId: 'setting-filepaths-project-root',
            label: 'Project Root',
            group: 'project',
            default: '/',
            variable: 'PROJECT',
            root: true
        },
        {
            key: 'assets',
            settingId: 'setting-filepaths-assets',
            label: 'Assets',
            group: 'project',
            default: '${PROJECT}/Assets',
            variable: 'ASSETS'
        },
        {
            key: 'maps',
            settingId: 'setting-filepaths-maps',
            label: 'Maps',
            group: 'project',
            default: '${PROJECT}/Maps',
            variable: 'MAPS'
        },
        {
            key: 'scripts',
            settingId: 'setting-filepaths-scripts',
            label: 'Scripts',
            group: 'project',
            default: '${PROJECT}/Scripts',
            variable: 'SCRIPTS'
        },
        {
            key: 'config',
            settingId: 'setting-filepaths-config',
            label: 'Config',
            group: 'project',
            default: '${PROJECT}/Config',
            variable: 'CONFIG'
        },

        // CONTENT
        {
            key: 'models',
            settingId: 'setting-filepaths-models',
            label: 'Models',
            group: 'content',
            default: '${ASSETS}/Models',
            variable: 'MODELS'
        },
        {
            key: 'textures',
            settingId: 'setting-filepaths-textures',
            label: 'Textures',
            group: 'content',
            default: '${ASSETS}/Textures',
            variable: 'TEXTURES'
        },
        {
            key: 'materials',
            settingId: 'setting-filepaths-materials',
            label: 'Materials',
            group: 'content',
            default: '${ASSETS}/Materials',
            variable: 'MATERIALS'
        },
        {
            key: 'audio',
            settingId: 'setting-filepaths-audio',
            label: 'Audio',
            group: 'content',
            default: '${ASSETS}/Audio',
            variable: 'AUDIO'
        },
        {
            key: 'animations',
            settingId: 'setting-filepaths-animations',
            label: 'Animations',
            group: 'content',
            default: '${ASSETS}/Animations',
            variable: 'ANIMATIONS'
        },
        {
            key: 'ui',
            settingId: 'setting-filepaths-ui',
            label: 'UI',
            group: 'content',
            default: '${ASSETS}/UI',
            variable: 'UI'
        },

        // CACHE / AUTOSAVE
        {
            key: 'cache',
            settingId: 'setting-filepaths-cache',
            label: 'Cache',
            group: 'cache',
            default: '${PROJECT}/.cache',
            variable: 'CACHE'
        },
        {
            key: 'derived',
            settingId: 'setting-filepaths-derived',
            label: 'Derived Data',
            group: 'cache',
            default: '${PROJECT}/.derived',
            variable: 'DERIVED'
        },
        {
            key: 'temp',
            settingId: 'setting-filepaths-temp',
            label: 'Temporary Files',
            group: 'cache',
            default: '${PROJECT}/.temp',
            variable: 'TEMP'
        },
        {
            key: 'autosave',
            settingId: 'setting-filepaths-autosave',
            label: 'Autosaves',
            group: 'cache',
            default: '${PROJECT}/.autosave',
            variable: 'AUTOSAVE'
        },

        // BUILD
        {
            key: 'build',
            settingId: 'setting-filepaths-build',
            label: 'Build Output',
            group: 'output',
            default: '${PROJECT}/Build',
            variable: 'BUILD'
        },
        {
            key: 'exports',
            settingId: 'setting-filepaths-exports',
            label: 'Exports',
            group: 'output',
            default: '${PROJECT}/Exports',
            variable: 'EXPORTS'
        },
        {
            key: 'screenshots',
            settingId: 'setting-filepaths-screenshots',
            label: 'Screenshots',
            group: 'output',
            default: '${PROJECT}/Screenshots',
            variable: 'SCREENSHOTS'
        },
        {
            key: 'recordings',
            settingId: 'setting-filepaths-recordings',
            label: 'Recordings',
            group: 'output',
            default: '${PROJECT}/Recordings',
            variable: 'RECORDINGS'
        },

        // EXTENSIONS
        {
            key: 'customAddons',
            settingId: 'setting-filepaths-custom-addons',
            label: 'Custom Add-ons',
            group: 'extensions',
            default: '${PROJECT}/Addons',
            variable: 'ADDONS'
        },
        {
            key: 'templates',
            settingId: 'setting-filepaths-templates',
            label: 'Templates',
            group: 'extensions',
            default: '${PROJECT}/Templates',
            variable: 'TEMPLATES'
        }
    ]);

    const OPTION_DEFINITIONS = Object.freeze([
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
    ]);

    const PATH_BY_KEY = new Map(
        PATH_DEFINITIONS.map(def => [def.key, def])
    );

    const PATH_BY_SETTING = new Map(
        PATH_DEFINITIONS.map(def => [def.settingId, def])
    );

    const TOKEN_TO_KEY = new Map(
        PATH_DEFINITIONS
            .filter(def => def.variable)
            .map(def => [def.variable, def.key])
    );

    class SMFilePathsManager {
        constructor() {
            this.paths = Object.create(null);
            this.options = Object.create(null);

            this.nativeRootHandle = null;
            this.nativeRootPermission = 'unknown';

            this.storageAdapter = null;

            this._dbPromise = null;
            this._initialized = false;

            for (const def of PATH_DEFINITIONS) {
                this.paths[def.key] = def.default;
            }

            for (const def of OPTION_DEFINITIONS) {
                this.options[def.key] = def.default;
            }
        }

        // --------------------------------------------------------------------
        // Metadata
        // --------------------------------------------------------------------

        get definitions() {
            return PATH_DEFINITIONS.slice();
        }

        get optionDefinitions() {
            return OPTION_DEFINITIONS.slice();
        }

        get supportsNativeDirectoryPicker() {
            return typeof window.showDirectoryPicker === 'function';
        }

        // --------------------------------------------------------------------
        // Lifecycle
        // --------------------------------------------------------------------

        async init() {
            if (this._initialized) {
                return this;
            }

            this._initialized = true;

            await this.restoreNativeRootHandle();

            window.dispatchEvent(
                new CustomEvent('sm:file-paths-ready', {
                    detail: {
                        manager: this
                    }
                })
            );

            return this;
        }

        // --------------------------------------------------------------------
        // State
        // --------------------------------------------------------------------

        setPath(key, value, options = {}) {
            const def = PATH_BY_KEY.get(key);

            if (!def) {
                throw new Error(
                    `Unknown SM file path key: ${key}`
                );
            }

            const normalizedInput = this.normalizeInput(
                value,
                def.root
            );

            this.paths[key] = normalizedInput;

            if (options.emit !== false) {
                this._emitChange(
                    key,
                    normalizedInput
                );
            }

            return normalizedInput;
        }

        setBySettingId(settingId, value, options = {}) {
            const pathDef =
                PATH_BY_SETTING.get(settingId);

            if (pathDef) {
                return this.setPath(
                    pathDef.key,
                    value,
                    options
                );
            }

            const optionDef =
                OPTION_DEFINITIONS.find(
                    def =>
                        def.settingId ===
                        settingId
                );

            if (optionDef) {
                return this.setOption(
                    optionDef.key,
                    value,
                    options
                );
            }

            return undefined;
        }

        setOption(key, value, options = {}) {
            const def =
                OPTION_DEFINITIONS.find(
                    item => item.key === key
                );

            if (!def) {
                throw new Error(
                    `Unknown SM file-path option: ${key}`
                );
            }

            const finalValue =
                def.type === 'boolean'
                    ? Boolean(value)
                    : value;

            this.options[key] =
                finalValue;

            if (options.emit !== false) {
                this._emitChange(
                    key,
                    finalValue,
                    'option'
                );
            }

            return finalValue;
        }

        getPath(key, options = {}) {
            const value =
                this.paths[key];

            if (value === undefined) {
                return undefined;
            }

            return options.resolved
                ? this.resolve(key)
                : value;
        }

        getAll(options = {}) {
            const out = {};

            for (const def of PATH_DEFINITIONS) {
                out[def.key] =
                    options.resolved
                        ? this.resolve(def.key)
                        : this.paths[def.key];
            }

            return out;
        }

        getOptions() {
            return {
                ...this.options
            };
        }

        // --------------------------------------------------------------------
        // Resolve / normalize
        // --------------------------------------------------------------------

        normalizeInput(value, isRoot = false) {
            let text =
                String(
                    value ?? ''
                ).trim();

            if (!text) {
                return isRoot
                    ? '/'
                    : '';
            }

            text = text.replace(
                /\\/g,
                '/'
            );

            // Keep a Windows drive prefix valid while collapsing duplicate /.
            const driveMatch =
                text.match(
                    /^([A-Za-z]:)(\/.*)?$/
                );

            if (driveMatch) {
                const drive =
                    driveMatch[1];

                let rest =
                    driveMatch[2] ||
                    '/';

                rest =
                    rest.replace(
                        /\/{2,}/g,
                        '/'
                    );

                if (
                    rest.length > 1 &&
                    rest.endsWith('/')
                ) {
                    rest =
                        rest.slice(
                            0,
                            -1
                        );
                }

                return drive + rest;
            }

            text =
                text.replace(
                    /\/{2,}/g,
                    '/'
                );

            if (
                text.length > 1 &&
                text.endsWith('/')
            ) {
                text =
                    text.slice(
                        0,
                        -1
                    );
            }

            return text;
        }

        resolve(keyOrPath) {
            const initial =
                PATH_BY_KEY.has(
                    keyOrPath
                )
                    ? this.paths[
                        keyOrPath
                    ]
                    : String(
                        keyOrPath ?? ''
                    );

            const visiting =
                new Set();

            const resolveText =
                text => {
                    let output =
                        String(
                            text ?? ''
                        );

                    let safety = 0;

                    while (
                        /\$\{[A-Z0-9_-]+\}/.test(
                            output
                        ) &&
                        safety < 32
                    ) {
                        safety += 1;

                        output =
                            output.replace(
                                /\$\{([A-Z0-9_-]+)\}/g,
                                (
                                    full,
                                    token
                                ) => {
                                    const targetKey =
                                        TOKEN_TO_KEY.get(
                                            token
                                        );

                                    if (!targetKey) {
                                        return full;
                                    }

                                    if (
                                        visiting.has(
                                            targetKey
                                        )
                                    ) {
                                        throw new Error(
                                            `Circular file-path variable: ${token}`
                                        );
                                    }

                                    visiting.add(
                                        targetKey
                                    );

                                    const replacement =
                                        resolveText(
                                            this.paths[
                                                targetKey
                                            ]
                                        );

                                    visiting.delete(
                                        targetKey
                                    );

                                    return replacement;
                                }
                            );
                    }

                    return this.normalizeInput(
                        output,
                        false
                    );
                };

            if (
                PATH_BY_KEY.has(
                    keyOrPath
                )
            ) {
                visiting.add(
                    keyOrPath
                );
            }

            const resolved =
                resolveText(
                    initial
                );

            return resolved;
        }

        toProjectRelative(path) {
            const resolved =
                this.resolve(path);

            const projectRoot =
                this.resolve(
                    'projectRoot'
                );

            if (
                !resolved ||
                !projectRoot
            ) {
                return resolved;
            }

            const normalizeForCompare =
                text =>
                    this.normalizeInput(
                        text
                    ).toLowerCase();

            const rootCompare =
                normalizeForCompare(
                    projectRoot
                );

            const pathCompare =
                normalizeForCompare(
                    resolved
                );

            if (
                pathCompare ===
                rootCompare
            ) {
                return '.';
            }

            const rootPrefix =
                rootCompare === '/'
                    ? '/'
                    : rootCompare + '/';

            if (
                !pathCompare.startsWith(
                    rootPrefix
                )
            ) {
                return resolved;
            }

            const length =
                projectRoot === '/'
                    ? 1
                    : projectRoot.length + 1;

            return resolved.slice(
                length
            );
        }

        // --------------------------------------------------------------------
        // Validation
        // --------------------------------------------------------------------

        validatePath(key) {
            const def =
                PATH_BY_KEY.get(key);

            if (!def) {
                return {
                    key,
                    valid: false,
                    status: 'error',
                    message: 'Unknown path key.'
                };
            }

            const raw =
                String(
                    this.paths[key] ??
                    ''
                );

            if (!raw.trim()) {
                return {
                    key,
                    label: def.label,
                    valid: false,
                    status: 'error',
                    raw,
                    resolved: '',
                    message: 'Path is empty.'
                };
            }

            if (
                /^(https?|ftp|data|blob):/i.test(
                    raw
                )
            ) {
                return {
                    key,
                    label: def.label,
                    valid: false,
                    status: 'error',
                    raw,
                    resolved: raw,
                    message: 'Remote URLs are not valid project paths.'
                };
            }

            let resolved = '';

            try {
                resolved =
                    this.resolve(
                        key
                    );
            } catch (error) {
                return {
                    key,
                    label: def.label,
                    valid: false,
                    status: 'error',
                    raw,
                    resolved: '',
                    message:
                        error?.message ||
                        'Path resolution failed.'
                };
            }

            const unresolved =
                resolved.match(
                    /\$\{[^}]+\}/g
                );

            if (unresolved) {
                return {
                    key,
                    label: def.label,
                    valid: false,
                    status: 'error',
                    raw,
                    resolved,
                    message:
                        `Unknown variable ${unresolved[0]}.`
                };
            }

            if (
                /[\0<>:"|?*]/.test(
                    resolved.replace(
                        /^[A-Za-z]:/,
                        ''
                    )
                )
            ) {
                return {
                    key,
                    label: def.label,
                    valid: false,
                    status: 'error',
                    raw,
                    resolved,
                    message: 'Path contains invalid filesystem characters.'
                };
            }

            if (
                this.storageAdapter
                    ?.validatePath
            ) {
                try {
                    const external =
                        this.storageAdapter
                            .validatePath(
                                resolved,
                                {
                                    key,
                                    definition:
                                        def
                                }
                            );

                    if (
                        external &&
                        typeof external ===
                            'object'
                    ) {
                        return {
                            key,
                            label: def.label,
                            raw,
                            resolved,
                            valid:
                                external.valid !==
                                false,
                            status:
                                external.status ||
                                (
                                    external.valid ===
                                        false
                                        ? 'error'
                                        : 'ok'
                                ),
                            message:
                                external.message ||
                                'Valid.'
                        };
                    }
                } catch (error) {
                    return {
                        key,
                        label: def.label,
                        raw,
                        resolved,
                        valid: false,
                        status: 'error',
                        message:
                            error?.message ||
                            'Storage adapter validation failed.'
                    };
                }
            }

            return {
                key,
                label: def.label,
                raw,
                resolved,
                valid: true,
                status: 'ok',
                message:
                    this.nativeRootHandle
                        ? 'Valid configuration. Native root is connected.'
                        : 'Valid virtual project path.'
            };
        }

        validateAll() {
            const paths =
                PATH_DEFINITIONS.map(
                    def =>
                        this.validatePath(
                            def.key
                        )
                );

            const byResolved =
                new Map();

            for (const result of paths) {
                if (!result.valid) {
                    continue;
                }

                const normalized =
                    String(
                        result.resolved
                    ).toLowerCase();

                const list =
                    byResolved.get(
                        normalized
                    ) ||
                    [];

                list.push(
                    result
                );

                byResolved.set(
                    normalized,
                    list
                );
            }

            for (
                const duplicates of
                byResolved.values()
            ) {
                if (
                    duplicates.length <=
                    1
                ) {
                    continue;
                }

                for (
                    const item of
                    duplicates
                ) {
                    item.status =
                        'warning';

                    item.message =
                        `Shared with ${duplicates.length - 1} other configured path(s).`;
                }
            }

            const errors =
                paths.filter(
                    item =>
                        item.status ===
                        'error'
                );

            const warnings =
                paths.filter(
                    item =>
                        item.status ===
                        'warning'
                );

            const report = {
                valid:
                    errors.length ===
                    0,

                errors:
                    errors.length,

                warnings:
                    warnings.length,

                paths,

                native:
                    this.getNativeRootStatus(),

                timestamp:
                    Date.now()
            };

            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-validation',
                    {
                        detail: {
                            report
                        }
                    }
                )
            );

            return report;
        }

        // --------------------------------------------------------------------
        // Defaults / settings integration
        // --------------------------------------------------------------------

        restoreDefaults() {
            const engine =
                window.EngineSettings;

            for (const def of PATH_DEFINITIONS) {
                if (
                    typeof engine?.set ===
                    'function'
                ) {
                    engine.set(
                        def.settingId,
                        def.default
                    );
                } else {
                    this.setPath(
                        def.key,
                        def.default
                    );
                }
            }

            for (const def of OPTION_DEFINITIONS) {
                if (
                    typeof engine?.set ===
                    'function'
                ) {
                    engine.set(
                        def.settingId,
                        def.default
                    );
                } else {
                    this.setOption(
                        def.key,
                        def.default
                    );
                }
            }

            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-defaults-restored'
                )
            );
        }

        applyCurrentSettings() {
            const engine =
                window.EngineSettings;

            if (!engine) {
                return false;
            }

            for (const def of PATH_DEFINITIONS) {
                const value =
                    engine.get?.(
                        def.settingId
                    );

                if (
                    value !== undefined
                ) {
                    this.setPath(
                        def.key,
                        value,
                        {
                            emit: false
                        }
                    );
                }
            }

            for (
                const def of
                OPTION_DEFINITIONS
            ) {
                const value =
                    engine.get?.(
                        def.settingId
                    );

                if (
                    value !== undefined
                ) {
                    this.setOption(
                        def.key,
                        value,
                        {
                            emit: false
                        }
                    );
                }
            }

            this._emitSnapshot();

            return true;
        }

        // --------------------------------------------------------------------
        // Adapter for virtual project storage
        // --------------------------------------------------------------------

        registerStorageAdapter(adapter) {
            if (
                !adapter ||
                typeof adapter !==
                    'object'
            ) {
                throw new TypeError(
                    'SMFilePathsManager.registerStorageAdapter(adapter) expects an object.'
                );
            }

            this.storageAdapter =
                adapter;

            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-storage-adapter',
                    {
                        detail: {
                            adapter
                        }
                    }
                )
            );

            return adapter;
        }

        async ensureConfiguredDirectories() {
            const report =
                this.validateAll();

            if (!report.valid) {
                throw new Error(
                    'Fix invalid File Paths before creating directories.'
                );
            }

            const results = [];

            if (
                this.storageAdapter
                    ?.ensureDirectory
            ) {
                for (
                    const def of
                    PATH_DEFINITIONS
                ) {
                    if (def.root) {
                        continue;
                    }

                    const resolved =
                        this.resolve(
                            def.key
                        );

                    const result =
                        await this.storageAdapter
                            .ensureDirectory(
                                resolved,
                                {
                                    key:
                                        def.key,
                                    definition:
                                        def
                                }
                            );

                    results.push({
                        key:
                            def.key,
                        mode:
                            'adapter',
                        result
                    });
                }

                this._emitDirectoriesEnsured(
                    results
                );

                return results;
            }

            if (
                this.nativeRootHandle
            ) {
                const permission =
                    await this.requestNativeRootPermission(
                        'readwrite'
                    );

                if (
                    permission !==
                    'granted'
                ) {
                    throw new Error(
                        'Native project folder does not have write permission.'
                    );
                }

                for (
                    const def of
                    PATH_DEFINITIONS
                ) {
                    if (def.root) {
                        continue;
                    }

                    const relative =
                        this.toProjectRelative(
                            this.resolve(
                                def.key
                            )
                        );

                    if (
                        !relative ||
                        relative === '.' ||
                        relative.startsWith(
                            '..'
                        ) ||
                        /^[A-Za-z]:/.test(
                            relative
                        ) ||
                        relative.startsWith(
                            '/'
                        )
                    ) {
                        results.push({
                            key:
                                def.key,
                            mode:
                                'native',
                            skipped:
                                true,
                            reason:
                                'Outside native project root.'
                        });

                        continue;
                    }

                    let handle =
                        this.nativeRootHandle;

                    const segments =
                        relative
                            .split('/')
                            .filter(
                                Boolean
                            );

                    for (
                        const segment of
                        segments
                    ) {
                        handle =
                            await handle
                                .getDirectoryHandle(
                                    segment,
                                    {
                                        create:
                                            true
                                    }
                                );
                    }

                    results.push({
                        key:
                            def.key,
                        mode:
                            'native',
                        created:
                            true
                    });
                }

                this._emitDirectoriesEnsured(
                    results
                );

                return results;
            }

            const detail = {
                resolvedPaths:
                    this.getAll({
                        resolved:
                            true
                    }),

                results: []
            };

            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-create-missing-requested',
                    {
                        detail
                    }
                )
            );

            return [];
        }

        // --------------------------------------------------------------------
        // Native directory handle (Chromium File System Access API)
        // --------------------------------------------------------------------

        async connectNativeProjectRoot() {
            if (
                !this
                    .supportsNativeDirectoryPicker
            ) {
                throw new Error(
                    'This browser does not support the File System Access directory picker.'
                );
            }

            const handle =
                await window.showDirectoryPicker({
                    id:
                        'sm-engine-project-root',

                    mode:
                        'readwrite',

                    startIn:
                        'documents'
                });

            this.nativeRootHandle =
                handle;

            this.nativeRootPermission =
                await this.requestNativeRootPermission(
                    'readwrite'
                );

            await this._saveNativeHandle(
                handle
            );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-native-root-changed',
                    {
                        detail:
                            this.getNativeRootStatus()
                    }
                )
            );

            return handle;
        }

        async disconnectNativeProjectRoot() {
            this.nativeRootHandle =
                null;

            this.nativeRootPermission =
                'unknown';

            await this._saveNativeHandle(
                null
            );

            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-native-root-changed',
                    {
                        detail:
                            this.getNativeRootStatus()
                    }
                )
            );
        }

        async requestNativeRootPermission(
            mode = 'readwrite'
        ) {
            const handle =
                this.nativeRootHandle;

            if (!handle) {
                this.nativeRootPermission =
                    'unknown';

                return 'unknown';
            }

            const descriptor = {
                mode
            };

            let permission =
                await handle
                    .queryPermission?.(
                        descriptor
                    );

            if (
                permission !==
                    'granted'
            ) {
                permission =
                    await handle
                        .requestPermission?.(
                            descriptor
                        );
            }

            this.nativeRootPermission =
                permission ||
                'unknown';

            return this
                .nativeRootPermission;
        }

        getNativeRootStatus() {
            return {
                supported:
                    this
                        .supportsNativeDirectoryPicker,

                connected:
                    !!this
                        .nativeRootHandle,

                name:
                    this.nativeRootHandle
                        ?.name ||
                    '',

                permission:
                    this.nativeRootPermission
            };
        }

        async restoreNativeRootHandle() {
            try {
                const db =
                    await this._openDB();

                const handle =
                    await new Promise(
                        (
                            resolve,
                            reject
                        ) => {
                            const tx =
                                db.transaction(
                                    'handles',
                                    'readonly'
                                );

                            const store =
                                tx.objectStore(
                                    'handles'
                                );

                            const req =
                                store.get(
                                    'project-root'
                                );

                            req.onsuccess =
                                () =>
                                    resolve(
                                        req.result
                                            ?.handle ||
                                        null
                                    );

                            req.onerror =
                                () =>
                                    reject(
                                        req.error
                                    );
                        }
                    );

                if (handle) {
                    this.nativeRootHandle =
                        handle;

                    this.nativeRootPermission =
                        await handle
                            .queryPermission?.({
                                mode:
                                    'readwrite'
                            }) ||
                        'unknown';
                }

                return handle;
            } catch (error) {
                console.warn(
                    '[SMFilePathsManager] Could not restore native directory handle:',
                    error
                );

                return null;
            }
        }

        async _saveNativeHandle(handle) {
            const db =
                await this._openDB();

            return new Promise(
                (
                    resolve,
                    reject
                ) => {
                    const tx =
                        db.transaction(
                            'handles',
                            'readwrite'
                        );

                    const store =
                        tx.objectStore(
                            'handles'
                        );

                    const request =
                        handle
                            ? store.put(
                                {
                                    id:
                                        'project-root',

                                    handle
                                }
                            )
                            : store.delete(
                                'project-root'
                            );

                    request.onsuccess =
                        () =>
                            resolve(
                                true
                            );

                    request.onerror =
                        () =>
                            reject(
                                request.error
                            );
                }
            );
        }

        _openDB() {
            if (
                this._dbPromise
            ) {
                return this
                    ._dbPromise;
            }

            this._dbPromise =
                new Promise(
                    (
                        resolve,
                        reject
                    ) => {
                        const request =
                            indexedDB.open(
                                'sm-file-paths-v1',
                                1
                            );

                        request.onupgradeneeded =
                            () => {
                                const db =
                                    request.result;

                                if (
                                    !db
                                        .objectStoreNames
                                        .contains(
                                            'handles'
                                        )
                                ) {
                                    db.createObjectStore(
                                        'handles',
                                        {
                                            keyPath:
                                                'id'
                                        }
                                    );
                                }
                            };

                        request.onsuccess =
                            () =>
                                resolve(
                                    request.result
                                );

                        request.onerror =
                            () =>
                                reject(
                                    request.error
                                );
                    }
                );

            return this
                ._dbPromise;
        }

        // --------------------------------------------------------------------
        // Logging / events
        // --------------------------------------------------------------------

        log(message, level = 'info', extra = null) {
            const args = [
                message
            ];

            if (
                extra !== null &&
                extra !== undefined
            ) {
                args.push(
                    extra
                );
            }

            if (
                window.SMConsolePanel
                    ?.push
            ) {
                window.SMConsolePanel.push(
                    level,
                    args,
                    {
                        source:
                            'FilePaths'
                    }
                );

                return;
            }

            const fn =
                level === 'error'
                    ? console.error
                    : level === 'warn'
                        ? console.warn
                        : console.info;

            fn.apply(
                console,
                args
            );
        }

        debug() {
            const rows = [];

            for (const def of PATH_DEFINITIONS) {
                rows.push({
                    Key:
                        def.key,
                    Raw:
                        this.paths[
                            def.key
                        ],
                    Resolved:
                        (() => {
                            try {
                                return this.resolve(
                                    def.key
                                );
                            } catch (error) {
                                return `ERROR: ${error.message}`;
                            }
                        })()
                });
            }

            console.table(
                rows
            );

            console.log(
                '[SMFilePathsManager] Native:',
                this.getNativeRootStatus()
            );
        }

        _emitChange(
            key,
            value,
            kind = 'path'
        ) {
            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-changed',
                    {
                        detail: {
                            key,
                            value,
                            kind,

                            resolved:
                                kind ===
                                    'path'
                                    ? (() => {
                                        try {
                                            return this.resolve(
                                                key
                                            );
                                        } catch {
                                            return '';
                                        }
                                    })()
                                    : undefined
                        }
                    }
                )
            );
        }

        _emitSnapshot() {
            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-synchronized',
                    {
                        detail: {
                            paths:
                                this.getAll(),

                            resolved:
                                this.getAll({
                                    resolved:
                                        true
                                }),

                            options:
                                this.getOptions()
                        }
                    }
                )
            );
        }

        _emitDirectoriesEnsured(results) {
            window.dispatchEvent(
                new CustomEvent(
                    'sm:file-paths-directories-ensured',
                    {
                        detail: {
                            results
                        }
                    }
                )
            );
        }
    }

    const manager =
        new SMFilePathsManager();

    window.SMFilePathsManager =
        manager;

    window.smFilePathsManager =
        manager;

    window.SMFilePathsManagerClass =
        SMFilePathsManager;

    manager.init();
})();