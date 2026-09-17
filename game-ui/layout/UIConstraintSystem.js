/**
 * GAME-UI/layout/UIConstraintSystem.js
 * ------------------------------------------------------------
 * Applies size, aspect-ratio and parent-bound constraints.
 */
(function () {
    'use strict';

    class UIConstraintSystem {
        constructor() {}

        apply(widget, rect, parentRect) {
            if (!widget || !rect) return rect;

            const constraints = widget.constraints || {};

            let result = {
                x: Number(rect.x) || 0,
                y: Number(rect.y) || 0,
                width: Math.max(0, Number(rect.width) || 0),
                height: Math.max(0, Number(rect.height) || 0)
            };

            result = this.applySizeConstraints(result, constraints);
            result = this.applyAspectRatio(result, constraints, widget);
            result = this.applyParentBounds(result, parentRect, constraints);

            return result;
        }

        applySizeConstraints(rect, constraints = {}) {
            const result = { ...rect };

            if (Number.isFinite(Number(constraints.minWidth))) {
                result.width = Math.max(result.width, Number(constraints.minWidth));
            }

            if (Number.isFinite(Number(constraints.maxWidth))) {
                result.width = Math.min(result.width, Number(constraints.maxWidth));
            }

            if (Number.isFinite(Number(constraints.minHeight))) {
                result.height = Math.max(result.height, Number(constraints.minHeight));
            }

            if (Number.isFinite(Number(constraints.maxHeight))) {
                result.height = Math.min(result.height, Number(constraints.maxHeight));
            }

            return result;
        }

        applyAspectRatio(rect, constraints = {}, widget = null) {
            const ratioValue = constraints.aspectRatio ?? widget?.aspectRatio;
            const ratio = Number(ratioValue);

            if (!Number.isFinite(ratio) || ratio <= 0) {
                return rect;
            }

            const mode = constraints.aspectMode || 'width-controls-height';
            const result = { ...rect };

            if (mode === 'height-controls-width') {
                result.width = result.height * ratio;
            } else if (mode === 'fit-inside') {
                const current = result.width / Math.max(0.000001, result.height);

                if (current > ratio) {
                    result.width = result.height * ratio;
                } else {
                    result.height = result.width / ratio;
                }
            } else if (mode === 'envelope') {
                const current = result.width / Math.max(0.000001, result.height);

                if (current < ratio) {
                    result.width = result.height * ratio;
                } else {
                    result.height = result.width / ratio;
                }
            } else {
                result.height = result.width / ratio;
            }

            return result;
        }

        applyParentBounds(rect, parentRect, constraints = {}) {
            if (!constraints.keepInsideParent || !parentRect) {
                return rect;
            }

            const result = { ...rect };

            if (result.width > parentRect.width) {
                result.width = parentRect.width;
            }

            if (result.height > parentRect.height) {
                result.height = parentRect.height;
            }

            const minX = parentRect.x;
            const minY = parentRect.y;
            const maxX = parentRect.x + parentRect.width - result.width;
            const maxY = parentRect.y + parentRect.height - result.height;

            result.x = Math.max(minX, Math.min(maxX, result.x));
            result.y = Math.max(minY, Math.min(maxY, result.y));

            return result;
        }
    }

    window.UIConstraintSystem = UIConstraintSystem;

    if (!window.uiConstraintSystem) {
        window.uiConstraintSystem = new UIConstraintSystem();
    }
})();