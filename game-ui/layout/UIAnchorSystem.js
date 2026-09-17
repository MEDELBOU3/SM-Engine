/**
 * GAME-UI/layout/UIAnchorSystem.js
 * ------------------------------------------------------------
 * Anchor resolver inspired by Unity RectTransform / UMG anchors.
 *
 * Widget anchor:
 * {
 *   minX: 0..1,
 *   minY: 0..1,
 *   maxX: 0..1,
 *   maxY: 0..1
 * }
 *
 * When min == max, widget keeps fixed size.
 * When min != max, widget stretches between anchors.
 */
(function () {
    'use strict';

    class UIAnchorSystem {
        constructor() {
            this.presets = {
                'top-left':        { minX: 0,   minY: 0,   maxX: 0,   maxY: 0 },
                'top-center':      { minX: 0.5, minY: 0,   maxX: 0.5, maxY: 0 },
                'top-right':       { minX: 1,   minY: 0,   maxX: 1,   maxY: 0 },
                'middle-left':     { minX: 0,   minY: 0.5, maxX: 0,   maxY: 0.5 },
                'center':          { minX: 0.5, minY: 0.5, maxX: 0.5, maxY: 0.5 },
                'middle-right':    { minX: 1,   minY: 0.5, maxX: 1,   maxY: 0.5 },
                'bottom-left':     { minX: 0,   minY: 1,   maxX: 0,   maxY: 1 },
                'bottom-center':   { minX: 0.5, minY: 1,   maxX: 0.5, maxY: 1 },
                'bottom-right':    { minX: 1,   minY: 1,   maxX: 1,   maxY: 1 },
                'stretch-top':     { minX: 0,   minY: 0,   maxX: 1,   maxY: 0 },
                'stretch-middle':  { minX: 0,   minY: 0.5, maxX: 1,   maxY: 0.5 },
                'stretch-bottom':  { minX: 0,   minY: 1,   maxX: 1,   maxY: 1 },
                'stretch-left':    { minX: 0,   minY: 0,   maxX: 0,   maxY: 1 },
                'stretch-center':  { minX: 0.5, minY: 0,   maxX: 0.5, maxY: 1 },
                'stretch-right':   { minX: 1,   minY: 0,   maxX: 1,   maxY: 1 },
                'stretch-all':     { minX: 0,   minY: 0,   maxX: 1,   maxY: 1 }
            };
        }

        setPreset(widget, presetName, preservePosition = true) {
            if (!widget) return false;

            const preset = this.presets[presetName];
            if (!preset) return false;

            const oldAnchor = { ...(widget.anchor || {}) };

            widget.anchor = { ...preset };

            if (!preservePosition) {
                widget.x = 0;
                widget.y = 0;
            } else {
                widget._previousAnchor = oldAnchor;
            }

            widget.markDirty?.();
            return true;
        }

        resolve(widget, parentRect, scale = { uniform: 1 }) {
            const anchor = this.normalizeAnchor(widget.anchor);
            const pivot = this.normalizePivot(widget.pivot);
            const margin = this.normalizeMargin(widget.margin);

            const s = Number(scale.uniform ?? 1);

            const anchorLeft = parentRect.x + parentRect.width * anchor.minX;
            const anchorTop = parentRect.y + parentRect.height * anchor.minY;
            const anchorRight = parentRect.x + parentRect.width * anchor.maxX;
            const anchorBottom = parentRect.y + parentRect.height * anchor.maxY;

            const stretchedX = Math.abs(anchor.maxX - anchor.minX) > 0.000001;
            const stretchedY = Math.abs(anchor.maxY - anchor.minY) > 0.000001;

            let width;
            let height;
            let x;
            let y;

            if (stretchedX) {
                width = (anchorRight - anchorLeft) + Number(widget.width ?? 0) * s;
                width -= (margin.left + margin.right) * s;

                x = anchorLeft + Number(widget.x ?? 0) * s + margin.left * s;
            } else {
                width = Number(widget.width ?? 100) * s;

                const centerX = anchorLeft + Number(widget.x ?? 0) * s;
                x = centerX - width * pivot.x;
            }

            if (stretchedY) {
                height = (anchorBottom - anchorTop) + Number(widget.height ?? 0) * s;
                height -= (margin.top + margin.bottom) * s;

                y = anchorTop + Number(widget.y ?? 0) * s + margin.top * s;
            } else {
                height = Number(widget.height ?? 40) * s;

                const centerY = anchorTop + Number(widget.y ?? 0) * s;
                y = centerY - height * pivot.y;
            }

            return {
                x,
                y,
                width: Math.max(0, width),
                height: Math.max(0, height),
                stretchedX,
                stretchedY
            };
        }

        normalizeAnchor(anchor = {}) {
            const minX = this._clamp(Number(anchor.minX ?? 0), 0, 1);
            const minY = this._clamp(Number(anchor.minY ?? 0), 0, 1);
            const maxX = this._clamp(Number(anchor.maxX ?? minX), 0, 1);
            const maxY = this._clamp(Number(anchor.maxY ?? minY), 0, 1);

            return {
                minX: Math.min(minX, maxX),
                minY: Math.min(minY, maxY),
                maxX: Math.max(minX, maxX),
                maxY: Math.max(minY, maxY)
            };
        }

        normalizePivot(pivot = {}) {
            return {
                x: this._clamp(Number(pivot.x ?? 0.5), 0, 1),
                y: this._clamp(Number(pivot.y ?? 0.5), 0, 1)
            };
        }

        normalizeMargin(margin = {}) {
            return {
                left: Number(margin.left ?? 0),
                top: Number(margin.top ?? 0),
                right: Number(margin.right ?? 0),
                bottom: Number(margin.bottom ?? 0)
            };
        }

        getPreset(name) {
            const preset = this.presets[name];
            return preset ? { ...preset } : null;
        }

        getPresetNames() {
            return Object.keys(this.presets);
        }

        _clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }
    }

    window.UIAnchorSystem = UIAnchorSystem;

    if (!window.uiAnchorSystem) {
        window.uiAnchorSystem = new UIAnchorSystem();
    }
})();