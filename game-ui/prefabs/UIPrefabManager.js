/**
 * GAME-UI/prefabs/UIPrefabManager.js
 * ------------------------------------------------------------
 * Creates, stores and instantiates reusable Game UI prefabs.
 */
(function () {
    'use strict';

    function clonePlain(value) {
        if (value == null || typeof value !== 'object') return value;

        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(value);
            } catch (_) {}
        }

        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return value;
        }
    }

    function createId(prefix = 'ui-prefab') {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}-${crypto.randomUUID()}`;
        }

        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    class UIPrefabManager {
        constructor(options = {}) {
            this.widgetLibrary =
                options.widgetLibrary ||
                window.uiWidgetLibrary ||
                null;

            this.prefabs = new Map();
        }

        register(name, prefabDefinition) {
            if (!name || !prefabDefinition) {
                throw new TypeError('UIPrefabManager.register(name, prefabDefinition): invalid arguments.');
            }

            const definition = this._normalizePrefab(
                String(name),
                prefabDefinition
            );

            this.prefabs.set(
                definition.name,
                definition
            );

            return definition;
        }

        unregister(name) {
            return this.prefabs.delete(String(name));
        }

        has(name) {
            return this.prefabs.has(String(name));
        }

        get(name) {
            const prefab = this.prefabs.get(String(name));
            return prefab ? clonePlain(prefab) : null;
        }

        getNames() {
            return [...this.prefabs.keys()];
        }

        createFromWidget(name, widget, metadata = {}) {
            if (!widget) {
                throw new TypeError('UIPrefabManager.createFromWidget(name, widget): widget is required.');
            }

            const serialized =
                typeof widget.serialize === 'function'
                    ? widget.serialize()
                    : clonePlain(widget);

            const prefab = {
                id: createId('ui-prefab'),
                name: String(name || widget.name || 'Prefab'),
                version: 1,
                category: metadata.category || 'Custom',
                description: metadata.description || '',
                tags: Array.isArray(metadata.tags)
                    ? [...metadata.tags]
                    : [],
                root: serialized
            };

            this.prefabs.set(
                prefab.name,
                prefab
            );

            return clonePlain(prefab);
        }

        instantiate(name, options = {}) {
            const prefab = this.prefabs.get(String(name));

            if (!prefab) {
                console.warn(`[UIPrefabManager] Prefab "${name}" was not found.`);
                return null;
            }

            const data = clonePlain(prefab.root);

            this._regenerateIds(data);

            this._applyOverrides(
                data,
                options.overrides || {}
            );

            if (options.name) {
                data.name = options.name;
            }

            if (Number.isFinite(options.x)) {
                data.x = options.x;
            }

            if (Number.isFinite(options.y)) {
                data.y = options.y;
            }

            const rootWidget =
                this._hydrateWidgetTree(data);

            if (options.document) {
                options.document.addWidget?.(
                    rootWidget,
                    options.parentId || null
                );
            }

            return rootWidget;
        }

        instantiateIntoDocument(name, document, options = {}) {
            if (!document) {
                throw new TypeError('UIPrefabManager.instantiateIntoDocument(): document is required.');
            }

            return this.instantiate(name, {
                ...options,
                document
            });
        }

        serializePrefab(name, pretty = true) {
            const prefab = this.prefabs.get(String(name));

            if (!prefab) return null;

            return JSON.stringify(
                prefab,
                null,
                pretty ? 2 : 0
            );
        }

        importPrefab(source) {
            let data = source;

            if (typeof source === 'string') {
                try {
                    data = JSON.parse(source);
                } catch (error) {
                    throw new Error(
                        `UIPrefabManager.importPrefab(): invalid JSON. ${error.message}`
                    );
                }
            }

            if (!data || typeof data !== 'object') {
                throw new TypeError('UIPrefabManager.importPrefab(): invalid prefab.');
            }

            if (!data.name || !data.root) {
                throw new Error('UIPrefabManager.importPrefab(): prefab requires name and root.');
            }

            return this.register(
                data.name,
                data
            );
        }

        exportAll(pretty = true) {
            const payload = {
                format: 'SM-GAME-UI-PREFABS',
                version: 1,
                prefabs: [...this.prefabs.values()]
                    .map(prefab => clonePlain(prefab))
            };

            return JSON.stringify(
                payload,
                null,
                pretty ? 2 : 0
            );
        }

        importAll(source) {
            let data = source;

            if (typeof source === 'string') {
                data = JSON.parse(source);
            }

            const prefabs =
                Array.isArray(data)
                    ? data
                    : data?.prefabs;

            if (!Array.isArray(prefabs)) {
                throw new Error('UIPrefabManager.importAll(): prefabs array is missing.');
            }

            const imported = [];

            for (const prefab of prefabs) {
                if (!prefab?.name || !prefab?.root) continue;

                imported.push(
                    this.register(
                        prefab.name,
                        prefab
                    )
                );
            }

            return imported;
        }

        _hydrateWidgetTree(data) {
            const library =
                this.widgetLibrary ||
                window.uiWidgetLibrary;

            let widget = null;

            if (library?.create) {
                try {
                    widget = library.create(
                        data.type || 'widget',
                        data
                    );
                } catch (error) {
                    console.warn(
                        `[UIPrefabManager] Failed to create widget "${data.type}" through library.`,
                        error
                    );
                }
            }

            if (!widget && typeof window.UIWidget === 'function') {
                widget = new window.UIWidget(data);
            }

            if (!widget) {
                widget = {
                    ...clonePlain(data),
                    children: []
                };
            }

            const children =
                Array.isArray(data.children)
                    ? data.children
                    : [];

            widget.children = [];

            for (const childData of children) {
                const child =
                    this._hydrateWidgetTree(childData);

                child.parent = widget;
                child.parentId = widget.id;

                widget.children.push(child);
            }

            return widget;
        }

        _applyOverrides(root, overrides) {
            if (!root || !overrides) return;

            if (overrides.root) {
                Object.assign(
                    root,
                    clonePlain(overrides.root)
                );
            }

            const byName =
                overrides.byName || {};

            const byType =
                overrides.byType || {};

            const visit = widget => {
                if (!widget) return;

                if (
                    widget.name &&
                    byName[widget.name]
                ) {
                    Object.assign(
                        widget,
                        clonePlain(byName[widget.name])
                    );
                }

                if (
                    widget.type &&
                    byType[widget.type]
                ) {
                    Object.assign(
                        widget,
                        clonePlain(byType[widget.type])
                    );
                }

                for (const child of widget.children || []) {
                    visit(child);
                }
            };

            visit(root);
        }

        _regenerateIds(widget) {
            if (!widget || typeof widget !== 'object') return;

            widget.id = createId('widget');
            widget.parent = null;
            widget.parentId = null;

            for (const child of widget.children || []) {
                this._regenerateIds(child);
            }
        }

        _normalizePrefab(name, definition) {
            const root =
                definition.root ||
                definition.widget ||
                definition;

            return {
                id:
                    definition.id ||
                    createId('ui-prefab'),

                name,

                version:
                    Number(definition.version) || 1,

                category:
                    definition.category ||
                    'Custom',

                description:
                    definition.description ||
                    '',

                tags:
                    Array.isArray(definition.tags)
                        ? [...definition.tags]
                        : [],

                root:
                    clonePlain(root)
            };
        }
    }

    window.UIPrefabManager =
        UIPrefabManager;

    if (!window.uiPrefabManager) {
        window.uiPrefabManager =
            new UIPrefabManager();
    }
})();