/**
 * GAME-UI/layout/UISafeAreaSystem.js
 * ------------------------------------------------------------
 * Handles platform/device safe areas.
 *
 * Supports:
 * - Manual insets
 * - CSS env(safe-area-inset-*)
 * - Runtime overrides
 */
(function () {
    'use strict';

    class UISafeAreaSystem {
        constructor(options = {}) {
            this.enabled = options.enabled ?? true;

            this.insets = {
                left: Number(options.left ?? 0),
                top: Number(options.top ?? 0),
                right: Number(options.right ?? 0),
                bottom: Number(options.bottom ?? 0)
            };

            this.useCSSSafeArea = options.useCSSSafeArea ?? true;
            this._probeElement = null;
        }

        setEnabled(state) {
            this.enabled = Boolean(state);
            return this;
        }

        setInsets(insets = {}) {
            if (Number.isFinite(Number(insets.left))) this.insets.left = Number(insets.left);
            if (Number.isFinite(Number(insets.top))) this.insets.top = Number(insets.top);
            if (Number.isFinite(Number(insets.right))) this.insets.right = Number(insets.right);
            if (Number.isFinite(Number(insets.bottom))) this.insets.bottom = Number(insets.bottom);

            return this;
        }

        getInsets(overrideInsets = null) {
            if (!this.enabled) {
                return { left: 0, top: 0, right: 0, bottom: 0 };
            }

            const cssInsets = this.useCSSSafeArea
                ? this.readCSSSafeArea()
                : { left: 0, top: 0, right: 0, bottom: 0 };

            const result = {
                left: Math.max(this.insets.left, cssInsets.left),
                top: Math.max(this.insets.top, cssInsets.top),
                right: Math.max(this.insets.right, cssInsets.right),
                bottom: Math.max(this.insets.bottom, cssInsets.bottom)
            };

            if (overrideInsets) {
                if (Number.isFinite(Number(overrideInsets.left))) result.left = Number(overrideInsets.left);
                if (Number.isFinite(Number(overrideInsets.top))) result.top = Number(overrideInsets.top);
                if (Number.isFinite(Number(overrideInsets.right))) result.right = Number(overrideInsets.right);
                if (Number.isFinite(Number(overrideInsets.bottom))) result.bottom = Number(overrideInsets.bottom);
            }

            return result;
        }

        getSafeArea(viewport, overrideInsets = null) {
            if (!viewport) {
                return { x: 0, y: 0, width: 0, height: 0 };
            }

            if (!this.enabled) {
                return { ...viewport };
            }

            const insets = this.getInsets(overrideInsets);

            return {
                x: viewport.x + insets.left,
                y: viewport.y + insets.top,
                width: Math.max(0, viewport.width - insets.left - insets.right),
                height: Math.max(0, viewport.height - insets.top - insets.bottom),
                insets
            };
        }

        readCSSSafeArea() {
            if (typeof document === 'undefined' || !document.body) {
                return { left: 0, top: 0, right: 0, bottom: 0 };
            }

            if (!this._probeElement) {
                const element = document.createElement('div');

                element.style.position = 'fixed';
                element.style.left = '-99999px';
                element.style.top = '-99999px';
                element.style.width = '0';
                element.style.height = '0';

                element.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
                element.style.paddingTop = 'env(safe-area-inset-top, 0px)';
                element.style.paddingRight = 'env(safe-area-inset-right, 0px)';
                element.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';

                document.body.appendChild(element);
                this._probeElement = element;
            }

            const style = getComputedStyle(this._probeElement);

            return {
                left: parseFloat(style.paddingLeft) || 0,
                top: parseFloat(style.paddingTop) || 0,
                right: parseFloat(style.paddingRight) || 0,
                bottom: parseFloat(style.paddingBottom) || 0
            };
        }

        destroy() {
            this._probeElement?.remove();
            this._probeElement = null;
        }
    }

    window.UISafeAreaSystem = UISafeAreaSystem;

    if (!window.uiSafeAreaSystem) {
        window.uiSafeAreaSystem = new UISafeAreaSystem();
    }
})();