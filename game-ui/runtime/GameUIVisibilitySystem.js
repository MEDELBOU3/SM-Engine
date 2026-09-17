/**
 * GAME-UI/runtime/GameUIVisibilitySystem.js
 * ------------------------------------------------------------
 * Central visibility/state controller for runtime UI.
 *
 * Supports:
 * - show / hide widgets
 * - groups/layers
 * - temporary HUD suppression
 * - modal screens
 */
(function () {
    'use strict';

    class GameUIVisibilitySystem {
        constructor(options = {}) {
            this.document = options.document || null;

            this.groups = new Map();
            this.hiddenBySystem = new Set();
            this.modalStack = [];

            this.enabled = options.enabled ?? true;
        }

        setDocument(document) {
            this.document = document || null;
            this.groups.clear();
            this.hiddenBySystem.clear();
            this.modalStack.length = 0;

            return this;
        }

        registerGroup(name, widgetIds = []) {
            if (!name) return this;

            this.groups.set(
                String(name),
                new Set(widgetIds)
            );

            return this;
        }

        addToGroup(name, widgetOrId) {
            if (!name) return false;

            const id =
                typeof widgetOrId === 'string'
                    ? widgetOrId
                    : widgetOrId?.id;

            if (!id) return false;

            if (!this.groups.has(name)) {
                this.groups.set(name, new Set());
            }

            this.groups.get(name).add(id);

            return true;
        }

        removeFromGroup(name, widgetOrId) {
            const id =
                typeof widgetOrId === 'string'
                    ? widgetOrId
                    : widgetOrId?.id;

            if (!id) return false;

            return this.groups.get(name)?.delete(id) || false;
        }

        show(widgetOrId) {
            const widget = this._resolveWidget(widgetOrId);
            if (!widget) return false;

            widget.visible = true;
            widget.setVisible?.(true);

            this.hiddenBySystem.delete(widget.id);

            return true;
        }

        hide(widgetOrId, options = {}) {
            const widget = this._resolveWidget(widgetOrId);
            if (!widget) return false;

            widget.visible = false;
            widget.setVisible?.(false);

            if (options.system === true) {
                this.hiddenBySystem.add(widget.id);
            }

            return true;
        }

        toggle(widgetOrId) {
            const widget = this._resolveWidget(widgetOrId);
            if (!widget) return false;

            return widget.visible === false
                ? this.show(widget)
                : this.hide(widget);
        }

        showGroup(name) {
            const group = this.groups.get(name);
            if (!group) return 0;

            let changed = 0;

            for (const id of group) {
                if (this.show(id)) changed++;
            }

            return changed;
        }

        hideGroup(name, options = {}) {
            const group = this.groups.get(name);
            if (!group) return 0;

            let changed = 0;

            for (const id of group) {
                if (this.hide(id, options)) changed++;
            }

            return changed;
        }

        setGroupVisible(name, visible) {
            return visible
                ? this.showGroup(name)
                : this.hideGroup(name);
        }

        pushModal(widgetOrId, options = {}) {
            const widget = this._resolveWidget(widgetOrId);
            if (!widget) return false;

            if (!this.modalStack.includes(widget.id)) {
                this.modalStack.push(widget.id);
            }

            this.show(widget);

            if (options.hideGroups) {
                for (const groupName of options.hideGroups) {
                    this.hideGroup(groupName, {
                        system: true
                    });
                }
            }

            return true;
        }

        popModal() {
            const id = this.modalStack.pop();
            if (!id) return null;

            const widget = this._resolveWidget(id);

            if (widget) {
                this.hide(widget);
            }

            return widget;
        }

        getActiveModal() {
            const id =
                this.modalStack[this.modalStack.length - 1];

            return id
                ? this._resolveWidget(id)
                : null;
        }

        restoreSystemHidden() {
            const ids = [...this.hiddenBySystem];

            for (const id of ids) {
                this.show(id);
            }

            this.hiddenBySystem.clear();

            return ids.length;
        }

        hideAll() {
            if (!this.document) return 0;

            let count = 0;

            this.document.traverse?.((widget) => {
                if (widget.visible !== false) {
                    this.hide(widget);
                    count++;
                }
            });

            return count;
        }

        showAll() {
            if (!this.document) return 0;

            let count = 0;

            this.document.traverse?.((widget) => {
                if (widget.visible === false) {
                    this.show(widget);
                    count++;
                }
            });

            return count;
        }

        _resolveWidget(widgetOrId) {
            if (!widgetOrId) return null;

            if (typeof widgetOrId === 'string') {
                return this.document?.getWidget?.(widgetOrId) || null;
            }

            return widgetOrId;
        }
    }

    window.GameUIVisibilitySystem =
        GameUIVisibilitySystem;

    if (!window.gameUIVisibilitySystem) {
        window.gameUIVisibilitySystem =
            new GameUIVisibilitySystem();
    }
})();