/**
 * GAME-UI/core/GameUIDocument.js
 * ------------------------------------------------------------
 * Runtime/editor data model for a single Game UI document.
 * Stores canvas settings, widget hierarchy, metadata and lookup.
 *
 * This class deliberately does NOT render anything.
 * Rendering belongs to GameUICanvasEditor / GameUIRuntime.
 */
(function () {
    'use strict';

    const DEFAULT_CANVAS = Object.freeze({
        width: 1920,
        height: 1080,
        referenceWidth: 1920,
        referenceHeight: 1080,
        scaleMode: 'scale-with-screen',
        matchMode: 'match-width-or-height',
        match: 0.5,
        pixelPerfect: false,
        safeArea: true,
        backgroundColor: 'transparent'
    });

    function createId(prefix = 'game-ui') {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}-${crypto.randomUUID()}`;
        }
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function clonePlain(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;
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

    function normalizeWidgetId(widget) {
        if (!widget || typeof widget !== 'object') return null;
        if (!widget.id) widget.id = createId('widget');
        return widget.id;
    }

    class GameUIDocument {
        constructor(options = {}) {
            this.id = options.id || createId('ui-document');
            this.name = options.name || 'Untitled Game UI';
            this.version = Number(options.version) || 1;

            this.metadata = {
                createdAt: options.metadata?.createdAt || new Date().toISOString(),
                updatedAt: options.metadata?.updatedAt || new Date().toISOString(),
                author: options.metadata?.author || '',
                description: options.metadata?.description || '',
                ...(clonePlain(options.metadata) || {})
            };

            this.canvas = {
                ...DEFAULT_CANVAS,
                ...(clonePlain(options.canvas) || {})
            };

            this.settings = {
                visible: options.settings?.visible ?? true,
                enabled: options.settings?.enabled ?? true,
                renderOrder: Number(options.settings?.renderOrder) || 0,
                inputMode: options.settings?.inputMode || 'game-and-ui',
                ...(clonePlain(options.settings) || {})
            };

            this.rootWidgets = [];
            this._widgetMap = new Map();

            if (Array.isArray(options.rootWidgets)) {
                for (const widget of options.rootWidgets) {
                    this.addWidget(widget, null, { silent: true });
                }
            }
        }

        get widgetCount() {
            return this._widgetMap.size;
        }

        touch() {
            this.metadata.updatedAt = new Date().toISOString();
            return this;
        }

        setName(name) {
            const next = String(name ?? '').trim();
            if (next) this.name = next;
            this.touch();
            return this;
        }

        setCanvasSettings(patch = {}) {
            if (!patch || typeof patch !== 'object') return this;
            Object.assign(this.canvas, clonePlain(patch));
            this.touch();
            return this;
        }

        setSettings(patch = {}) {
            if (!patch || typeof patch !== 'object') return this;
            Object.assign(this.settings, clonePlain(patch));
            this.touch();
            return this;
        }

        addWidget(widget, parentId = null, options = {}) {
            if (!widget || typeof widget !== 'object') {
                throw new TypeError('GameUIDocument.addWidget(widget): widget must be an object.');
            }

            const widgetId = normalizeWidgetId(widget);

            if (this._widgetMap.has(widgetId)) {
                if (options.allowExisting) return widget;
                throw new Error(`GameUIDocument: widget id "${widgetId}" already exists.`);
            }

            const parent = parentId ? this.getWidget(parentId) : null;
            if (parentId && !parent) {
                throw new Error(`GameUIDocument: parent widget "${parentId}" was not found.`);
            }

            this._detachExternalParent(widget);

            if (parent) {
                if (!Array.isArray(parent.children)) parent.children = [];
                parent.children.push(widget);
                widget.parent = parent;
                widget.parentId = parent.id;
            } else {
                this.rootWidgets.push(widget);
                widget.parent = null;
                widget.parentId = null;
            }

            this._registerWidgetTree(widget);

            if (!options.silent) this.touch();
            return widget;
        }

        removeWidget(widgetOrId, options = {}) {
            const widget = typeof widgetOrId === 'string'
                ? this.getWidget(widgetOrId)
                : widgetOrId;

            if (!widget || !widget.id || !this._widgetMap.has(widget.id)) {
                return null;
            }

            const preserveChildren = Boolean(options.preserveChildren);
            const parent = widget.parent || (widget.parentId ? this.getWidget(widget.parentId) : null);

            if (parent && Array.isArray(parent.children)) {
                const index = parent.children.indexOf(widget);
                if (index !== -1) parent.children.splice(index, 1);
            } else {
                const rootIndex = this.rootWidgets.indexOf(widget);
                if (rootIndex !== -1) this.rootWidgets.splice(rootIndex, 1);
            }

            if (preserveChildren && Array.isArray(widget.children) && widget.children.length) {
                const children = [...widget.children];
                widget.children.length = 0;

                for (const child of children) {
                    child.parent = null;
                    child.parentId = null;

                    if (parent) {
                        if (!Array.isArray(parent.children)) parent.children = [];
                        parent.children.push(child);
                        child.parent = parent;
                        child.parentId = parent.id;
                    } else {
                        this.rootWidgets.push(child);
                    }
                }

                this._widgetMap.delete(widget.id);
            } else {
                this._unregisterWidgetTree(widget);
            }

            widget.parent = null;
            widget.parentId = null;

            if (!options.silent) this.touch();
            return widget;
        }

        moveWidget(widgetOrId, newParentId = null, index = null) {
            const widget = typeof widgetOrId === 'string'
                ? this.getWidget(widgetOrId)
                : widgetOrId;

            if (!widget || !this._widgetMap.has(widget.id)) return false;

            const newParent = newParentId ? this.getWidget(newParentId) : null;
            if (newParentId && !newParent) return false;
            if (newParent === widget) return false;
            if (newParent && this.isDescendant(widget, newParent)) return false;

            const oldParent = widget.parent || (widget.parentId ? this.getWidget(widget.parentId) : null);
            const oldList = oldParent?.children || this.rootWidgets;
            const oldIndex = oldList.indexOf(widget);
            if (oldIndex !== -1) oldList.splice(oldIndex, 1);

            const newList = newParent ? (newParent.children ||= []) : this.rootWidgets;

            let insertIndex = Number.isInteger(index) ? index : newList.length;
            insertIndex = Math.max(0, Math.min(insertIndex, newList.length));
            newList.splice(insertIndex, 0, widget);

            widget.parent = newParent || null;
            widget.parentId = newParent?.id || null;

            this.touch();
            return true;
        }

        reorderWidget(widgetOrId, newIndex) {
            const widget = typeof widgetOrId === 'string'
                ? this.getWidget(widgetOrId)
                : widgetOrId;

            if (!widget || !this._widgetMap.has(widget.id)) return false;

            const parent = widget.parent || (widget.parentId ? this.getWidget(widget.parentId) : null);
            const list = parent?.children || this.rootWidgets;
            const currentIndex = list.indexOf(widget);

            if (currentIndex === -1) return false;

            const targetIndex = Math.max(0, Math.min(Number(newIndex) || 0, list.length - 1));
            if (targetIndex === currentIndex) return true;

            list.splice(currentIndex, 1);
            list.splice(targetIndex, 0, widget);

            this.touch();
            return true;
        }

        getWidget(id) {
            return this._widgetMap.get(id) || null;
        }

        hasWidget(id) {
            return this._widgetMap.has(id);
        }

        getRootWidgets() {
            return [...this.rootWidgets];
        }

        getChildren(widgetOrId) {
            const widget = typeof widgetOrId === 'string'
                ? this.getWidget(widgetOrId)
                : widgetOrId;

            return Array.isArray(widget?.children) ? [...widget.children] : [];
        }

        getParent(widgetOrId) {
            const widget = typeof widgetOrId === 'string'
                ? this.getWidget(widgetOrId)
                : widgetOrId;

            if (!widget) return null;
            return widget.parent || (widget.parentId ? this.getWidget(widget.parentId) : null);
        }

        isDescendant(parentOrId, possibleChildOrId) {
            const parent = typeof parentOrId === 'string' ? this.getWidget(parentOrId) : parentOrId;
            let current = typeof possibleChildOrId === 'string'
                ? this.getWidget(possibleChildOrId)
                : possibleChildOrId;

            if (!parent || !current) return false;

            while (current) {
                if (current === parent) return true;
                current = current.parent || (current.parentId ? this.getWidget(current.parentId) : null);
            }

            return false;
        }

        findWidgets(predicate) {
            if (typeof predicate !== 'function') return [];
            const result = [];

            this.traverse((widget) => {
                if (predicate(widget)) result.push(widget);
            });

            return result;
        }

        findByName(name) {
            const target = String(name ?? '').toLowerCase();
            if (!target) return [];

            return this.findWidgets((widget) =>
                String(widget.name ?? '').toLowerCase().includes(target)
            );
        }

        findByType(type) {
            return this.findWidgets((widget) => widget.type === type);
        }

        traverse(callback) {
            if (typeof callback !== 'function') return;

            const visit = (widget, depth, parent) => {
                callback(widget, depth, parent);

                const children = Array.isArray(widget.children) ? widget.children : [];
                for (const child of children) {
                    visit(child, depth + 1, widget);
                }
            };

            for (const root of this.rootWidgets) {
                visit(root, 0, null);
            }
        }

        clear(options = {}) {
            for (const widget of this.rootWidgets) {
                this._clearParentReferences(widget);
            }

            this.rootWidgets.length = 0;
            this._widgetMap.clear();

            if (!options.silent) this.touch();
            return this;
        }

        rebuildIndex() {
            this._widgetMap.clear();

            for (const root of this.rootWidgets) {
                root.parent = null;
                root.parentId = null;
                this._registerWidgetTree(root);
            }

            return this;
        }

        toJSON() {
            return {
                format: 'SM-GAME-UI',
                version: this.version,
                id: this.id,
                name: this.name,
                metadata: clonePlain(this.metadata),
                canvas: clonePlain(this.canvas),
                settings: clonePlain(this.settings),
                rootWidgets: this.rootWidgets.map((widget) => {
                    if (typeof widget.serialize === 'function') {
                        return widget.serialize();
                    }
                    return this._serializeWidgetFallback(widget);
                })
            };
        }

        clone(options = {}) {
            const data = this.toJSON();
            data.id = options.preserveId ? data.id : createId('ui-document');
            data.name = options.name || `${this.name} Copy`;
            data.metadata.createdAt = new Date().toISOString();
            data.metadata.updatedAt = data.metadata.createdAt;

            return new GameUIDocument(data);
        }

        _registerWidgetTree(widget) {
            if (!widget || typeof widget !== 'object') return;

            const id = normalizeWidgetId(widget);

            if (this._widgetMap.has(id) && this._widgetMap.get(id) !== widget) {
                widget.id = createId('widget');
            }

            this._widgetMap.set(widget.id, widget);

            if (!Array.isArray(widget.children)) widget.children = [];

            for (const child of widget.children) {
                child.parent = widget;
                child.parentId = widget.id;
                this._registerWidgetTree(child);
            }
        }

        _unregisterWidgetTree(widget) {
            if (!widget || typeof widget !== 'object') return;

            const children = Array.isArray(widget.children) ? [...widget.children] : [];
            for (const child of children) {
                this._unregisterWidgetTree(child);
            }

            this._widgetMap.delete(widget.id);
            widget.parent = null;
            widget.parentId = null;
        }

        _clearParentReferences(widget) {
            if (!widget || typeof widget !== 'object') return;

            widget.parent = null;
            widget.parentId = null;

            if (Array.isArray(widget.children)) {
                for (const child of widget.children) {
                    this._clearParentReferences(child);
                }
            }
        }

        _detachExternalParent(widget) {
            const parent = widget.parent;

            if (parent && Array.isArray(parent.children)) {
                const index = parent.children.indexOf(widget);
                if (index !== -1) parent.children.splice(index, 1);
            }

            widget.parent = null;
            widget.parentId = null;
        }

        _serializeWidgetFallback(widget) {
            const output = {};

            for (const [key, value] of Object.entries(widget || {})) {
                if (key === 'parent') continue;

                if (key === 'children') {
                    output.children = Array.isArray(value)
                        ? value.map((child) => this._serializeWidgetFallback(child))
                        : [];
                    continue;
                }

                if (typeof value === 'function') continue;

                output[key] = clonePlain(value);
            }

            if (!Array.isArray(output.children)) output.children = [];
            return output;
        }

        static fromJSON(data = {}) {
            return new GameUIDocument(data);
        }

        static get DEFAULT_CANVAS() {
            return { ...DEFAULT_CANVAS };
        }
    }

    window.GameUIDocument = GameUIDocument;
})();