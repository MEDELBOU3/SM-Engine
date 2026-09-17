/**
 * GAME-UI/core/GameUIManager.js
 * ------------------------------------------------------------
 * Central coordinator for Game UI documents.
 *
 * Responsibilities:
 * - Create/open/close UI documents
 * - Manage active document
 * - Create/delete/move widgets
 * - Bridge editor and runtime systems
 * - Dispatch high-level Game UI events
 */
(function () {
    'use strict';

    function createId(prefix = 'game-ui') {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}-${crypto.randomUUID()}`;
        }
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    class GameUIManager {
        constructor(options = {}) {
            this.documents = new Map();
            this.activeDocument = null;

            this.editor = options.editor || null;
            this.runtime = options.runtime || null;
            this.widgetLibrary = options.widgetLibrary || null;
            this.serializer = options.serializer || null;

            this.playMode = false;
            this.initialized = false;

            this._listeners = new Map();
        }

        init(options = {}) {
            if (this.initialized) return this;

            this.editor = options.editor || this.editor || window.gameUIEditorManager || null;
            this.runtime = options.runtime || this.runtime || window.gameUIRuntime || null;
            this.widgetLibrary = options.widgetLibrary || this.widgetLibrary || window.uiWidgetLibrary || null;
            this.serializer = options.serializer || this.serializer || window.gameUISerializer || null;

            this.initialized = true;
            this.emit('initialized', { manager: this });

            return this;
        }

        createDocument(options = {}) {
            if (typeof window.GameUIDocument !== 'function') {
                throw new Error('GameUIManager: GameUIDocument.js must be loaded before creating documents.');
            }

            const document = new window.GameUIDocument({
                id: options.id || createId('ui-document'),
                name: options.name || 'Untitled Game UI',
                version: options.version || 1,
                metadata: options.metadata,
                canvas: options.canvas,
                settings: options.settings,
                rootWidgets: options.rootWidgets
            });

            this.registerDocument(document);

            if (options.makeActive !== false) {
                this.setActiveDocument(document);
            }

            this.emit('document-created', { document });
            return document;
        }

        registerDocument(document) {
            if (!document || !document.id) {
                throw new TypeError('GameUIManager.registerDocument(document): invalid document.');
            }

            this.documents.set(document.id, document);
            this.emit('document-registered', { document });

            return document;
        }

        unregisterDocument(documentOrId) {
            const document = this.resolveDocument(documentOrId);
            if (!document) return null;

            if (this.activeDocument === document) {
                this.setActiveDocument(null);
            }

            this.documents.delete(document.id);
            this.emit('document-unregistered', { document });

            return document;
        }

        closeDocument(documentOrId, options = {}) {
            const document = this.resolveDocument(documentOrId);
            if (!document) return false;

            if (this.playMode && this.activeDocument === document) {
                this.exitPlayMode();
            }

            if (options.unregister !== false) {
                this.unregisterDocument(document);
            } else if (this.activeDocument === document) {
                this.setActiveDocument(null);
            }

            this.emit('document-closed', { document });
            return true;
        }

        setActiveDocument(documentOrId) {
            const previous = this.activeDocument;
            const next = documentOrId == null
                ? null
                : this.resolveDocument(documentOrId);

            if (documentOrId != null && !next) {
                throw new Error('GameUIManager.setActiveDocument(): document was not found.');
            }

            if (previous === next) return next;

            this.activeDocument = next;

            if (this.editor?.setDocument) {
                this.editor.setDocument(next);
            }

            if (this.runtime?.setDocument && this.playMode) {
                this.runtime.setDocument(next);
            }

            this.emit('active-document-changed', {
                previousDocument: previous,
                document: next
            });

            return next;
        }

        getActiveDocument() {
            return this.activeDocument;
        }

        getDocument(id) {
            return this.documents.get(id) || null;
        }

        getDocuments() {
            return [...this.documents.values()];
        }

        resolveDocument(documentOrId) {
            if (!documentOrId) return null;

            if (typeof documentOrId === 'string') {
                return this.documents.get(documentOrId) || null;
            }

            if (documentOrId.id && this.documents.has(documentOrId.id)) {
                return this.documents.get(documentOrId.id);
            }

            return documentOrId;
        }

        createWidget(type, options = {}, parentId = null, document = this.activeDocument) {
            if (!document) {
                throw new Error('GameUIManager.createWidget(): no active Game UI document.');
            }

            const widget = this._createWidgetInstance(type, options);
            document.addWidget(widget, parentId);

            this.emit('widget-created', {
                document,
                widget,
                parentId
            });

            this._notifyEditorDocumentChanged(document, 'widget-created', widget);

            return widget;
        }

        duplicateWidget(widgetOrId, options = {}, document = this.activeDocument) {
            if (!document) return null;

            const source = typeof widgetOrId === 'string'
                ? document.getWidget(widgetOrId)
                : widgetOrId;

            if (!source) return null;

            const serialized = typeof source.serialize === 'function'
                ? source.serialize()
                : this._cloneWidgetData(source);

            this._regenerateWidgetIds(serialized);

            const parent = document.getParent(source);
            const clone = this._hydrateWidgetTree(serialized);

            if (Number.isFinite(options.offsetX)) clone.x = (clone.x || 0) + options.offsetX;
            else if (Number.isFinite(clone.x)) clone.x += 20;

            if (Number.isFinite(options.offsetY)) clone.y = (clone.y || 0) + options.offsetY;
            else if (Number.isFinite(clone.y)) clone.y += 20;

            if (options.name) {
                clone.name = options.name;
            } else if (clone.name) {
                clone.name = `${clone.name} Copy`;
            }

            document.addWidget(clone, parent?.id || null);

            this.emit('widget-duplicated', {
                document,
                source,
                widget: clone
            });

            this._notifyEditorDocumentChanged(document, 'widget-duplicated', clone);

            return clone;
        }

        deleteWidget(widgetOrId, document = this.activeDocument) {
            if (!document) return null;

            const removed = document.removeWidget(widgetOrId);
            if (!removed) return null;

            if (this.editor?.selectionManager?.isSelected?.(removed.id)) {
                this.editor.selectionManager.deselect?.(removed.id);
            }

            this.emit('widget-deleted', {
                document,
                widget: removed
            });

            this._notifyEditorDocumentChanged(document, 'widget-deleted', removed);

            return removed;
        }

        moveWidget(widgetOrId, newParentId = null, index = null, document = this.activeDocument) {
            if (!document) return false;

            const widget = typeof widgetOrId === 'string'
                ? document.getWidget(widgetOrId)
                : widgetOrId;

            if (!widget) return false;

            const moved = document.moveWidget(widget, newParentId, index);
            if (!moved) return false;

            this.emit('widget-moved', {
                document,
                widget,
                parentId: newParentId,
                index
            });

            this._notifyEditorDocumentChanged(document, 'widget-moved', widget);

            return true;
        }

        updateWidget(widgetOrId, patch = {}, document = this.activeDocument) {
            if (!document || !patch || typeof patch !== 'object') return null;

            const widget = typeof widgetOrId === 'string'
                ? document.getWidget(widgetOrId)
                : widgetOrId;

            if (!widget) return null;

            const blockedKeys = new Set(['id', 'parent', 'parentId', 'children']);

            for (const [key, value] of Object.entries(patch)) {
                if (blockedKeys.has(key)) continue;
                widget[key] = value;
            }

            document.touch();

            this.emit('widget-updated', {
                document,
                widget,
                patch
            });

            this._notifyEditorDocumentChanged(document, 'widget-updated', widget);

            return widget;
        }

        findWidget(id, document = this.activeDocument) {
            return document?.getWidget?.(id) || null;
        }

        enterPlayMode(options = {}) {
            if (this.playMode) return true;
            if (!this.activeDocument) return false;

            this.playMode = true;

            if (this.editor?.setInteractive) {
                this.editor.setInteractive(false);
            }

            if (this.runtime) {
                if (this.runtime.setDocument) {
                    this.runtime.setDocument(this.activeDocument);
                }

                if (this.runtime.start) {
                    this.runtime.start(options);
                }
            }

            this.emit('play-mode-entered', {
                document: this.activeDocument,
                options
            });

            return true;
        }

        exitPlayMode() {
            if (!this.playMode) return true;

            if (this.runtime?.stop) {
                this.runtime.stop();
            }

            if (this.editor?.setInteractive) {
                this.editor.setInteractive(true);
            }

            this.playMode = false;

            this.emit('play-mode-exited', {
                document: this.activeDocument
            });

            return true;
        }

        saveActiveDocument(options = {}) {
            if (!this.activeDocument) {
                throw new Error('GameUIManager.saveActiveDocument(): no active document.');
            }

            const serializer = options.serializer || this.serializer || window.gameUISerializer;
            if (!serializer?.serialize) {
                throw new Error('GameUIManager: GameUISerializer is not available.');
            }

            return serializer.serialize(this.activeDocument, options);
        }

        loadDocument(source, options = {}) {
            const serializer = options.serializer || this.serializer || window.gameUISerializer;

            if (!serializer?.deserialize) {
                throw new Error('GameUIManager: GameUISerializer is not available.');
            }

            const document = serializer.deserialize(source, {
                ...options,
                widgetLibrary: options.widgetLibrary || this.widgetLibrary || window.uiWidgetLibrary
            });

            this.registerDocument(document);

            if (options.makeActive !== false) {
                this.setActiveDocument(document);
            }

            this.emit('document-loaded', { document });
            return document;
        }

        newDocument(options = {}) {
            if (this.playMode) this.exitPlayMode();
            return this.createDocument(options);
        }

        on(eventName, callback) {
            if (typeof callback !== 'function') return () => {};

            if (!this._listeners.has(eventName)) {
                this._listeners.set(eventName, new Set());
            }

            this._listeners.get(eventName).add(callback);

            return () => this.off(eventName, callback);
        }

        once(eventName, callback) {
            if (typeof callback !== 'function') return () => {};

            const unsubscribe = this.on(eventName, (payload) => {
                unsubscribe();
                callback(payload);
            });

            return unsubscribe;
        }

        off(eventName, callback) {
            const set = this._listeners.get(eventName);
            if (!set) return false;

            const removed = set.delete(callback);
            if (!set.size) this._listeners.delete(eventName);

            return removed;
        }

        emit(eventName, payload = {}) {
            const eventPayload = {
                type: eventName,
                timestamp: performance?.now?.() ?? Date.now(),
                manager: this,
                ...payload
            };

            const callbacks = this._listeners.get(eventName);
            if (callbacks) {
                for (const callback of [...callbacks]) {
                    try {
                        callback(eventPayload);
                    } catch (error) {
                        console.error(`[GameUIManager] Listener error for "${eventName}"`, error);
                    }
                }
            }

            if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent(`gameui:${eventName}`, {
                    detail: eventPayload
                }));
            }

            return eventPayload;
        }

        _createWidgetInstance(type, options) {
            const library = this.widgetLibrary || window.uiWidgetLibrary;

            if (library?.create) {
                const widget = library.create(type, options);
                if (widget) return widget;
            }

            if (typeof window.UIWidget === 'function') {
                return new window.UIWidget({
                    type,
                    ...options
                });
            }

            return {
                id: createId('widget'),
                type,
                name: options.name || type || 'Widget',
                x: options.x ?? 0,
                y: options.y ?? 0,
                width: options.width ?? 100,
                height: options.height ?? 40,
                visible: options.visible ?? true,
                enabled: options.enabled ?? true,
                opacity: options.opacity ?? 1,
                children: [],
                style: options.style || {},
                bindings: options.bindings || {},
                events: options.events || {},
                ...options
            };
        }

        _hydrateWidgetTree(data) {
            const widget = this._createWidgetInstance(data.type || 'widget', data);

            const children = Array.isArray(data.children) ? data.children : [];
            widget.children = [];

            for (const childData of children) {
                const child = this._hydrateWidgetTree(childData);
                child.parent = widget;
                child.parentId = widget.id;
                widget.children.push(child);
            }

            return widget;
        }

        _cloneWidgetData(widget) {
            const clone = {};

            for (const [key, value] of Object.entries(widget || {})) {
                if (key === 'parent' || typeof value === 'function') continue;

                if (key === 'children') {
                    clone.children = Array.isArray(value)
                        ? value.map((child) => this._cloneWidgetData(child))
                        : [];
                    continue;
                }

                try {
                    clone[key] = typeof structuredClone === 'function'
                        ? structuredClone(value)
                        : JSON.parse(JSON.stringify(value));
                } catch (_) {
                    clone[key] = value;
                }
            }

            clone.children ||= [];
            return clone;
        }

        _regenerateWidgetIds(data) {
            if (!data || typeof data !== 'object') return;

            data.id = createId('widget');
            data.parent = null;
            data.parentId = null;

            if (Array.isArray(data.children)) {
                for (const child of data.children) {
                    this._regenerateWidgetIds(child);
                }
            }
        }

        _notifyEditorDocumentChanged(document, reason, widget) {
            if (this.editor?.refresh) {
                this.editor.refresh({
                    document,
                    reason,
                    widget
                });
            } else if (this.editor?.render) {
                this.editor.render();
            }
        }
    }

    window.GameUIManager = GameUIManager;

    if (!window.gameUIManager) {
        window.gameUIManager = new GameUIManager();
    }
})();