/**
 * GAME-UI/editor/GameUISelectionManager.js
 * ------------------------------------------------------------
 * Selection state for Game UI editor.
 */
(function () {
    'use strict';

    class GameUISelectionManager {
        constructor(options = {}) {
            this.document = options.document || null;
            this.selectedIds = new Set();
            this.primaryId = null;
            this.enabled = options.enabled ?? true;
            this._listeners = new Map();
        }

        setDocument(document) {
            if (this.document === document) return this;
            this.clear({ silent: true });
            this.document = document || null;
            this.emit('document-changed', { document: this.document });
            return this;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);
            if (!this.enabled) this.clear();
            return this;
        }

        select(widgetOrId, options = {}) {
            if (!this.enabled) return false;

            const widget = this.resolveWidget(widgetOrId);
            if (!widget) return false;

            const additive = options.additive ?? false;
            const toggle = options.toggle ?? false;

            if (!additive && !toggle) {
                this.selectedIds.clear();
            }

            if (toggle && this.selectedIds.has(widget.id)) {
                this.selectedIds.delete(widget.id);

                if (this.primaryId === widget.id) {
                    this.primaryId = [...this.selectedIds].at(-1) || null;
                }
            } else {
                this.selectedIds.add(widget.id);
                this.primaryId = widget.id;
            }

            this.emit('selection-changed', {
                selected: this.getSelectedWidgets(),
                primary: this.getPrimaryWidget(),
                source: options.source || 'api'
            });

            return true;
        }

        selectMany(widgetIds = [], options = {}) {
            if (!this.enabled) return false;

            if (!options.additive) {
                this.selectedIds.clear();
            }

            for (const item of widgetIds) {
                const widget = this.resolveWidget(item);
                if (!widget) continue;

                this.selectedIds.add(widget.id);
                this.primaryId = widget.id;
            }

            this.emit('selection-changed', {
                selected: this.getSelectedWidgets(),
                primary: this.getPrimaryWidget(),
                source: options.source || 'api'
            });

            return true;
        }

        deselect(widgetOrId, options = {}) {
            const widget = this.resolveWidget(widgetOrId);
            const id = typeof widgetOrId === 'string' ? widgetOrId : widget?.id;

            if (!id || !this.selectedIds.has(id)) return false;

            this.selectedIds.delete(id);

            if (this.primaryId === id) {
                this.primaryId = [...this.selectedIds].at(-1) || null;
            }

            if (!options.silent) {
                this.emit('selection-changed', {
                    selected: this.getSelectedWidgets(),
                    primary: this.getPrimaryWidget(),
                    source: options.source || 'api'
                });
            }

            return true;
        }

        clear(options = {}) {
            const hadSelection = this.selectedIds.size > 0;

            this.selectedIds.clear();
            this.primaryId = null;

            if (hadSelection && !options.silent) {
                this.emit('selection-changed', {
                    selected: [],
                    primary: null,
                    source: options.source || 'clear'
                });
            }

            return this;
        }

        isSelected(widgetOrId) {
            const id =
                typeof widgetOrId === 'string'
                    ? widgetOrId
                    : widgetOrId?.id;

            return Boolean(id && this.selectedIds.has(id));
        }

        getSelectedIds() {
            return [...this.selectedIds];
        }

        getSelectedWidgets() {
            if (!this.document) return [];

            return [...this.selectedIds]
                .map(id => this.document.getWidget?.(id))
                .filter(Boolean);
        }

        getPrimaryWidget() {
            if (!this.document || !this.primaryId) return null;
            return this.document.getWidget?.(this.primaryId) || null;
        }

        resolveWidget(widgetOrId) {
            if (!widgetOrId) return null;

            if (typeof widgetOrId === 'string') {
                return this.document?.getWidget?.(widgetOrId) || null;
            }

            return widgetOrId;
        }

        on(eventName, callback) {
            if (typeof callback !== 'function') return () => {};

            if (!this._listeners.has(eventName)) {
                this._listeners.set(eventName, new Set());
            }

            this._listeners.get(eventName).add(callback);

            return () => this.off(eventName, callback);
        }

        off(eventName, callback) {
            const listeners = this._listeners.get(eventName);
            if (!listeners) return false;

            const removed = listeners.delete(callback);
            if (!listeners.size) this._listeners.delete(eventName);

            return removed;
        }

        emit(eventName, payload = {}) {
            const listeners = this._listeners.get(eventName);

            if (listeners) {
                for (const callback of [...listeners]) {
                    try {
                        callback(payload);
                    } catch (error) {
                        console.error(
                            `[GameUISelectionManager] Listener error for "${eventName}".`,
                            error
                        );
                    }
                }
            }

            return payload;
        }
    }

    window.GameUISelectionManager = GameUISelectionManager;

    if (!window.gameUISelectionManager) {
        window.gameUISelectionManager =
            new GameUISelectionManager();
    }
})();