/**
 * GAME-UI/layout/UILayoutEngine.js
 * ------------------------------------------------------------
 * Central responsive layout engine for Game UI.
 *
 * Responsibilities:
 * - Reference-resolution scaling
 * - Canvas viewport fitting
 * - Per-widget layout calculation
 * - Anchor integration
 * - Constraint integration
 * - Safe-area integration
 */
(function () {
    'use strict';

    class UILayoutEngine {
        constructor(options = {}) {
            this.referenceWidth = Number(options.referenceWidth ?? 1920);
            this.referenceHeight = Number(options.referenceHeight ?? 1080);

            this.scaleMode = options.scaleMode || 'scale-with-screen';
            this.matchMode = options.matchMode || 'match-width-or-height';
            this.match = this._clamp(Number(options.match ?? 0.5), 0, 1);

            this.pixelPerfect = options.pixelPerfect ?? false;

            // When enabled by PIE, the runtime UI coordinate system is exactly
            // the current Game Viewport. No reference-resolution scaling is used.
            this.runtimeViewportExact = false;

            this.anchorSystem = options.anchorSystem || window.uiAnchorSystem || null;
            this.constraintSystem = options.constraintSystem || window.uiConstraintSystem || null;
            this.safeAreaSystem = options.safeAreaSystem || window.uiSafeAreaSystem || null;

            this.lastViewport = {
                width: this.referenceWidth,
                height: this.referenceHeight
            };

            this.lastScale = {
                x: 1,
                y: 1,
                uniform: 1
            };
        }

        configureFromDocument(document) {
            const canvas = document?.canvas || {};

            this.referenceWidth = Number(canvas.referenceWidth ?? canvas.width ?? this.referenceWidth);
            this.referenceHeight = Number(canvas.referenceHeight ?? canvas.height ?? this.referenceHeight);

            this.scaleMode = canvas.scaleMode || this.scaleMode;
            this.matchMode = canvas.matchMode || this.matchMode;
            this.match = this._clamp(Number(canvas.match ?? this.match), 0, 1);
            this.pixelPerfect = canvas.pixelPerfect ?? this.pixelPerfect;

            return this;
        }

        calculateScale(viewportWidth, viewportHeight) {
            const vw = Math.max(1, Number(viewportWidth) || 1);
            const vh = Math.max(1, Number(viewportHeight) || 1);

            const rw = Math.max(1, this.referenceWidth);
            const rh = Math.max(1, this.referenceHeight);

            const scaleX = vw / rw;
            const scaleY = vh / rh;

            let uniform = 1;

            switch (this.scaleMode) {
                case 'constant-pixel-size':
                    uniform = 1;
                    break;

                case 'constant-physical-size':
                    uniform = Math.min(scaleX, scaleY);
                    break;

                case 'scale-with-screen':
                default:
                    if (this.matchMode === 'expand') {
                        uniform = Math.min(scaleX, scaleY);
                    } else if (this.matchMode === 'shrink') {
                        uniform = Math.max(scaleX, scaleY);
                    } else {
                        const logWidth = Math.log2(scaleX);
                        const logHeight = Math.log2(scaleY);
                        uniform = Math.pow(2, this._lerp(logWidth, logHeight, this.match));
                    }
                    break;
            }

            if (this.pixelPerfect) {
                uniform = Math.max(1, Math.round(uniform));
            }

            this.lastViewport.width = vw;
            this.lastViewport.height = vh;

            this.lastScale = {
                x: scaleX,
                y: scaleY,
                uniform
            };

            return { ...this.lastScale };
        }

        setRuntimeViewportExact(enabled = true) {
            this.runtimeViewportExact = Boolean(enabled);
            return this;
        }

        layoutDocument(document, viewportWidth, viewportHeight, options = {}) {
            if (!document) return null;

            this.configureFromDocument(document);

            let scale = this.calculateScale(viewportWidth, viewportHeight);
            if (this.runtimeViewportExact) {
                scale = { x: 1, y: 1, uniform: 1 };
                this.lastScale = { ...scale };
            }

            const viewport = {
                x: 0,
                y: 0,
                width: Math.max(1, Number(viewportWidth) || 1),
                height: Math.max(1, Number(viewportHeight) || 1)
            };

            const safeArea = this.safeAreaSystem?.getSafeArea
                ? this.safeAreaSystem.getSafeArea(viewport, options.safeAreaInsets)
                : viewport;

            const rootRect = document.canvas?.safeArea === false ? viewport : safeArea;

            for (const widget of document.rootWidgets || []) {
                this.layoutWidget(widget, rootRect, scale, {
                    ...options,
                    document
                });
            }

            return {
                viewport,
                safeArea,
                scale,
                referenceWidth: this.referenceWidth,
                referenceHeight: this.referenceHeight
            };
        }

        layoutWidget(widget, parentRect, scale, context = {}) {
            if (!widget || !parentRect) return null;

            const anchorSystem = context.anchorSystem || this.anchorSystem || window.uiAnchorSystem;
            const constraintSystem = context.constraintSystem || this.constraintSystem || window.uiConstraintSystem;

            let rect;

            if (anchorSystem?.resolve) {
                rect = anchorSystem.resolve(widget, parentRect, scale);
            } else {
                rect = this._resolveFallback(widget, parentRect, scale);
            }

            if (constraintSystem?.apply) {
                rect = constraintSystem.apply(widget, rect, parentRect);
            }

            rect = this._normalizeRect(rect);

            widget._layoutRect = rect;
            widget._layoutScale = scale.uniform;

            this.applyLayoutToElement(widget, rect, parentRect);

            const childParentRect = {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
            };

            for (const child of widget.children || []) {
                this.layoutWidget(child, childParentRect, scale, context);
            }

            return rect;
        }

        applyLayoutToElement(widget, rect, parentRect = null) {
            const element = widget?._element;
            if (!element || !rect) return;

            // _layoutRect stays in absolute viewport space for navigation/focus,
            // while nested DOM children must be positioned relative to their parent.
            const nested = Boolean(widget.parent || widget.parentId);
            const x = nested && parentRect ? rect.x - parentRect.x : rect.x;
            const y = nested && parentRect ? rect.y - parentRect.y : rect.y;

            element.style.left = `${this._px(x)}px`;
            element.style.top = `${this._px(y)}px`;
            element.style.width = `${this._px(rect.width)}px`;
            element.style.height = `${this._px(rect.height)}px`;

            const rotation = Number(widget.rotation ?? 0);
            const scaleX = Number(widget.scaleX ?? 1);
            const scaleY = Number(widget.scaleY ?? 1);

            element.style.transform = `rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`;
        }

        screenToReference(x, y) {
            const scale = Math.max(0.000001, this.lastScale.uniform);

            return {
                x: Number(x) / scale,
                y: Number(y) / scale
            };
        }

        referenceToScreen(x, y) {
            const scale = this.lastScale.uniform;

            return {
                x: Number(x) * scale,
                y: Number(y) * scale
            };
        }

        sizeToReference(width, height) {
            const scale = Math.max(0.000001, this.lastScale.uniform);

            return {
                width: Number(width) / scale,
                height: Number(height) / scale
            };
        }

        sizeToScreen(width, height) {
            const scale = this.lastScale.uniform;

            return {
                width: Number(width) * scale,
                height: Number(height) * scale
            };
        }

        _resolveFallback(widget, parentRect, scale) {
            const s = scale.uniform;

            return {
                x: parentRect.x + Number(widget.x ?? 0) * s,
                y: parentRect.y + Number(widget.y ?? 0) * s,
                width: Number(widget.width ?? 100) * s,
                height: Number(widget.height ?? 40) * s
            };
        }

        _normalizeRect(rect = {}) {
            return {
                x: Number(rect.x) || 0,
                y: Number(rect.y) || 0,
                width: Math.max(0, Number(rect.width) || 0),
                height: Math.max(0, Number(rect.height) || 0)
            };
        }

        _px(value) {
            return this.pixelPerfect ? Math.round(value) : value;
        }

        _clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        _lerp(a, b, t) {
            return a + (b - a) * t;
        }
    }

    window.UILayoutEngine = UILayoutEngine;

    if (!window.uiLayoutEngine) {
        window.uiLayoutEngine = new UILayoutEngine();
    }
})();