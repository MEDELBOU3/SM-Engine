/*
 * SM Engine FX - FXUtils
 * Shared helpers for the FX runtime.
 */
(function (global) {
    'use strict';

    const FXUtils = {
        clamp(value, min, max) {
            value = Number(value);
            if (!Number.isFinite(value)) value = min;
            return Math.max(min, Math.min(max, value));
        },

        lerp(a, b, t) {
            return a + (b - a) * t;
        },

        randomRange(min, max) {
            return min + Math.random() * (max - min);
        },

        randomSigned() {
            return Math.random() * 2 - 1;
        },

        randomInCircle(radius, out) {
            out = out || new THREE.Vector2();
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * radius;
            out.set(Math.cos(a) * r, Math.sin(a) * r);
            return out;
        },

        randomInBox(size, out) {
            out = out || new THREE.Vector3();
            out.set(
                (Math.random() - 0.5) * size.x,
                (Math.random() - 0.5) * size.y,
                (Math.random() - 0.5) * size.z
            );
            return out;
        },

        safeDispose(object) {
            if (!object) return;

            if (object.geometry?.dispose) object.geometry.dispose();

            const materials = Array.isArray(object.material)
                ? object.material
                : object.material ? [object.material] : [];

            for (const material of materials) {
                if (!material) continue;

                for (const key of Object.keys(material)) {
                    const value = material[key];
                    if (value && value.isTexture && value.dispose) value.dispose();
                }

                material.dispose?.();
            }
        },

        removeAndDispose(object, parent) {
            if (!object) return;
            (parent || object.parent)?.remove?.(object);
            this.safeDispose(object);
        },

        resolveScene(explicitScene) {
            return explicitScene ||
                global.scene ||
                global.editor?.scene ||
                null;
        },

        resolveCamera(explicitCamera) {
            return explicitCamera ||
                global.SMViewportSystem?.getActivePanel?.()?.camera ||
                global.camera ||
                global.editor?.camera ||
                null;
        },

        resolveRenderer(explicitRenderer) {
            return explicitRenderer ||
                global.renderer ||
                global.editor?.renderer ||
                null;
        },

        color(value, fallback = 0xffffff) {
            try {
                return new THREE.Color(value ?? fallback);
            } catch (_) {
                return new THREE.Color(fallback);
            }
        },

        assertThree() {
            if (!global.THREE) {
                throw new Error('[SMFX] THREE is required before loading the FX system.');
            }
        },

        nowSeconds() {
            return performance.now() * 0.001;
        }
    };

    global.SMFXUtils = FXUtils;
})(window);
