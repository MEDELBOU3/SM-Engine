/**
 * GAME-UI/prefabs/UIPrefabInstance.js
 * ------------------------------------------------------------
 * Lightweight metadata wrapper for prefab instances.
 *
 * This does not replace widgets.
 * It tracks which prefab an instantiated widget tree came from.
 */
(function () {
    'use strict';

    function createId(prefix = 'prefab-instance') {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}-${crypto.randomUUID()}`;
        }

        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    class UIPrefabInstance {
        constructor(options = {}) {
            this.id =
                options.id ||
                createId();

            this.prefabName =
                options.prefabName ||
                '';

            this.rootWidgetId =
                options.rootWidgetId ||
                null;

            this.overrides =
                options.overrides &&
                typeof options.overrides === 'object'
                    ? { ...options.overrides }
                    : {};

            this.createdAt =
                options.createdAt ||
                new Date().toISOString();
        }

        setOverride(path, value) {
            if (!path) return this;

            this.overrides[path] = value;
            return this;
        }

        removeOverride(path) {
            delete this.overrides[path];
            return this;
        }

        clearOverrides() {
            this.overrides = {};
            return this;
        }

        serialize() {
            return {
                id: this.id,
                prefabName: this.prefabName,
                rootWidgetId: this.rootWidgetId,
                overrides: { ...this.overrides },
                createdAt: this.createdAt
            };
        }
    }

    window.UIPrefabInstance =
        UIPrefabInstance;
})();