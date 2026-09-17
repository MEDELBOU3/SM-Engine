/**
 * GAME-UI/core/GameUISerializer.js
 * ------------------------------------------------------------
 * Serialization/deserialization layer for Game UI documents.
 *
 * Supported input:
 * - GameUIDocument instance
 * - Plain object
 * - JSON string
 *
 * Output format:
 * {
 *   format: "SM-GAME-UI",
 *   version: 1,
 *   ...
 * }
 */
(function () {
    'use strict';

    const FORMAT = 'SM-GAME-UI';
    const CURRENT_VERSION = 1;

    function createId(prefix = 'game-ui') {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}-${crypto.randomUUID()}`;
        }
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function deepClone(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;

        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(value);
            } catch (_) {}
        }

        return JSON.parse(JSON.stringify(value));
    }

    class GameUISerializer {
        constructor(options = {}) {
            this.format = options.format || FORMAT;
            this.version = Number(options.version) || CURRENT_VERSION;
            this.pretty = options.pretty ?? true;
            this.migrations = new Map();
        }

        serialize(document, options = {}) {
            if (!document) {
                throw new TypeError('GameUISerializer.serialize(document): document is required.');
            }

            const raw = typeof document.toJSON === 'function'
                ? document.toJSON()
                : deepClone(document);

            const data = this.sanitize({
                ...raw,
                format: this.format,
                version: Number(raw.version) || this.version
            });

            if (options.asObject) {
                return data;
            }

            const pretty = options.pretty ?? this.pretty;
            return JSON.stringify(data, null, pretty ? 2 : 0);
        }

        deserialize(source, options = {}) {
            const raw = this.parse(source);
            const migrated = this.migrate(raw);
            const normalized = this.normalize(migrated);

            const document = this._createDocument(normalized);

            const widgetLibrary = options.widgetLibrary || window.uiWidgetLibrary || null;

            document.clear({ silent: true });

            for (const widgetData of normalized.rootWidgets) {
                const widget = this._hydrateWidget(widgetData, widgetLibrary);
                document.addWidget(widget, null, { silent: true });
            }

            document.rebuildIndex();
            document.metadata.updatedAt = normalized.metadata?.updatedAt || new Date().toISOString();

            return document;
        }

        parse(source) {
            let data = source;

            if (typeof source === 'string') {
                try {
                    data = JSON.parse(source);
                } catch (error) {
                    throw new Error(`GameUISerializer: invalid JSON. ${error.message}`);
                }
            }

            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new TypeError('GameUISerializer: source must be a Game UI object or JSON string.');
            }

            return deepClone(data);
        }

        normalize(data) {
            const normalized = {
                format: data.format || this.format,
                version: Number(data.version) || 1,
                id: data.id || createId('ui-document'),
                name: data.name || 'Untitled Game UI',
                metadata: {
                    createdAt: data.metadata?.createdAt || new Date().toISOString(),
                    updatedAt: data.metadata?.updatedAt || new Date().toISOString(),
                    author: data.metadata?.author || '',
                    description: data.metadata?.description || '',
                    ...(data.metadata || {})
                },
                canvas: {
                    width: 1920,
                    height: 1080,
                    referenceWidth: 1920,
                    referenceHeight: 1080,
                    scaleMode: 'scale-with-screen',
                    matchMode: 'match-width-or-height',
                    match: 0.5,
                    pixelPerfect: false,
                    safeArea: true,
                    backgroundColor: 'transparent',
                    ...(data.canvas || {})
                },
                settings: {
                    visible: true,
                    enabled: true,
                    renderOrder: 0,
                    inputMode: 'game-and-ui',
                    ...(data.settings || {})
                },
                rootWidgets: Array.isArray(data.rootWidgets)
                    ? data.rootWidgets
                    : Array.isArray(data.widgets)
                        ? data.widgets
                        : []
            };

            normalized.rootWidgets = normalized.rootWidgets.map((widget) =>
                this._normalizeWidget(widget)
            );

            return normalized;
        }

        sanitize(value, seen = new WeakSet()) {
            if (value === null) return null;

            const type = typeof value;

            if (
                type === 'string' ||
                type === 'number' ||
                type === 'boolean'
            ) {
                return Number.isFinite(value) || type !== 'number' ? value : null;
            }

            if (
                type === 'undefined' ||
                type === 'function' ||
                type === 'symbol'
            ) {
                return undefined;
            }

            if (Array.isArray(value)) {
                return value
                    .map((entry) => this.sanitize(entry, seen))
                    .filter((entry) => entry !== undefined);
            }

            if (type === 'object') {
                if (seen.has(value)) return undefined;
                seen.add(value);

                if (
                    value instanceof HTMLElement ||
                    value instanceof Node ||
                    value instanceof EventTarget
                ) {
                    seen.delete(value);
                    return undefined;
                }

                if (value instanceof Date) {
                    seen.delete(value);
                    return value.toISOString();
                }

                if (value instanceof Map) {
                    const object = {};
                    for (const [key, entry] of value.entries()) {
                        const sanitized = this.sanitize(entry, seen);
                        if (sanitized !== undefined) {
                            object[String(key)] = sanitized;
                        }
                    }
                    seen.delete(value);
                    return object;
                }

                if (value instanceof Set) {
                    const array = [...value]
                        .map((entry) => this.sanitize(entry, seen))
                        .filter((entry) => entry !== undefined);
                    seen.delete(value);
                    return array;
                }

                const object = {};

                for (const [key, entry] of Object.entries(value)) {
                    if (
                        key === 'parent' ||
                        key === '_element' ||
                        key === 'element' ||
                        key === 'domElement' ||
                        key === '_widgetMap'
                    ) {
                        continue;
                    }

                    const sanitized = this.sanitize(entry, seen);
                    if (sanitized !== undefined) {
                        object[key] = sanitized;
                    }
                }

                seen.delete(value);
                return object;
            }

            return undefined;
        }

        validate(source) {
            const errors = [];
            let data;

            try {
                data = this.parse(source);
            } catch (error) {
                return {
                    valid: false,
                    errors: [error.message]
                };
            }

            if (data.format && data.format !== this.format) {
                errors.push(`Unsupported format "${data.format}". Expected "${this.format}".`);
            }

            if (!Number.isFinite(Number(data.version))) {
                errors.push('Missing or invalid document version.');
            }

            const roots = data.rootWidgets ?? data.widgets;
            if (roots !== undefined && !Array.isArray(roots)) {
                errors.push('rootWidgets must be an array.');
            }

            const ids = new Set();

            const validateWidget = (widget, path) => {
                if (!widget || typeof widget !== 'object') {
                    errors.push(`${path} is not a valid widget object.`);
                    return;
                }

                if (widget.id) {
                    if (ids.has(widget.id)) {
                        errors.push(`Duplicate widget id "${widget.id}".`);
                    }
                    ids.add(widget.id);
                }

                if (!widget.type) {
                    errors.push(`${path} is missing widget.type.`);
                }

                if (widget.children !== undefined && !Array.isArray(widget.children)) {
                    errors.push(`${path}.children must be an array.`);
                    return;
                }

                for (let i = 0; i < (widget.children?.length || 0); i++) {
                    validateWidget(widget.children[i], `${path}.children[${i}]`);
                }
            };

            const rootWidgets = Array.isArray(roots) ? roots : [];
            for (let i = 0; i < rootWidgets.length; i++) {
                validateWidget(rootWidgets[i], `rootWidgets[${i}]`);
            }

            return {
                valid: errors.length === 0,
                errors
            };
        }

        registerMigration(fromVersion, migrationFn) {
            if (!Number.isInteger(fromVersion) || fromVersion < 1) {
                throw new TypeError('GameUISerializer.registerMigration(): fromVersion must be a positive integer.');
            }

            if (typeof migrationFn !== 'function') {
                throw new TypeError('GameUISerializer.registerMigration(): migrationFn must be a function.');
            }

            this.migrations.set(fromVersion, migrationFn);
            return this;
        }

        migrate(source) {
            let data = this.parse(source);
            let version = Number(data.version) || 1;

            if (version > this.version) {
                console.warn(
                    `[GameUISerializer] Document version ${version} is newer than supported version ${this.version}.`
                );
                return data;
            }

            while (version < this.version) {
                const migration = this.migrations.get(version);

                if (!migration) {
                    console.warn(
                        `[GameUISerializer] No migration registered from version ${version} to ${version + 1}.`
                    );
                    break;
                }

                data = migration(deepClone(data)) || data;
                version += 1;
                data.version = version;
            }

            return data;
        }

        download(document, filename = null, options = {}) {
            const json = this.serialize(document, options);
            const safeName = (filename || document.name || 'game-ui')
                .replace(/[\\/:*?"<>|]+/g, '-')
                .trim();

            const blob = new Blob([json], {
                type: 'application/json;charset=utf-8'
            });

            const url = URL.createObjectURL(blob);
            const anchor = document?.ownerDocument?.createElement?.('a') || window.document.createElement('a');

            anchor.href = url;
            anchor.download = safeName.endsWith('.gameui.json')
                ? safeName
                : `${safeName}.gameui.json`;

            window.document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            setTimeout(() => URL.revokeObjectURL(url), 0);

            return true;
        }

        async readFile(file, options = {}) {
            if (!(file instanceof File)) {
                throw new TypeError('GameUISerializer.readFile(file): file must be a File.');
            }

            const text = await file.text();

            if (options.asObject) {
                return this.parse(text);
            }

            return this.deserialize(text, options);
        }

        _createDocument(data) {
            if (typeof window.GameUIDocument !== 'function') {
                throw new Error('GameUISerializer: GameUIDocument.js must be loaded before deserializing.');
            }

            return new window.GameUIDocument({
                id: data.id,
                name: data.name,
                version: data.version,
                metadata: data.metadata,
                canvas: data.canvas,
                settings: data.settings,
                rootWidgets: []
            });
        }

        _hydrateWidget(data, widgetLibrary) {
            let widget = null;

            if (widgetLibrary?.create) {
                try {
                    widget = widgetLibrary.create(data.type || 'widget', data);
                } catch (error) {
                    console.warn(
                        `[GameUISerializer] Failed to create "${data.type}" through UIWidgetLibrary.`,
                        error
                    );
                }
            }

            if (!widget && typeof window.UIWidget === 'function') {
                widget = new window.UIWidget(data);
            }

            if (!widget) {
                widget = {
                    ...deepClone(data),
                    children: []
                };
            }

            const preservedChildren = Array.isArray(data.children) ? data.children : [];
            widget.children = [];

            for (const childData of preservedChildren) {
                const child = this._hydrateWidget(childData, widgetLibrary);
                child.parent = widget;
                child.parentId = widget.id;
                widget.children.push(child);
            }

            return widget;
        }

        _normalizeWidget(widget = {}) {
            const normalized = {
                ...widget,
                id: widget.id || createId('widget'),
                type: widget.type || 'widget',
                name: widget.name || widget.type || 'Widget',
                x: Number.isFinite(Number(widget.x)) ? Number(widget.x) : 0,
                y: Number.isFinite(Number(widget.y)) ? Number(widget.y) : 0,
                width: Number.isFinite(Number(widget.width)) ? Number(widget.width) : 100,
                height: Number.isFinite(Number(widget.height)) ? Number(widget.height) : 40,
                rotation: Number.isFinite(Number(widget.rotation)) ? Number(widget.rotation) : 0,
                visible: widget.visible ?? true,
                enabled: widget.enabled ?? true,
                opacity: Number.isFinite(Number(widget.opacity)) ? Number(widget.opacity) : 1,
                style: widget.style && typeof widget.style === 'object' ? widget.style : {},
                bindings: widget.bindings && typeof widget.bindings === 'object' ? widget.bindings : {},
                events: widget.events && typeof widget.events === 'object' ? widget.events : {},
                children: Array.isArray(widget.children)
                    ? widget.children.map((child) => this._normalizeWidget(child))
                    : []
            };

            delete normalized.parent;
            normalized.parentId = widget.parentId || null;

            return normalized;
        }
    }

    window.GameUISerializer = GameUISerializer;

    if (!window.gameUISerializer) {
        window.gameUISerializer = new GameUISerializer();
    }
})();