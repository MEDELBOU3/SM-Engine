/**
 * GAME-UI/animation/UIKeyframeEvaluator.js
 * ------------------------------------------------------------
 * Evaluates keyframe tracks and interpolates values over time.
 *
 * Track example:
 * {
 *   property: 'opacity',
 *   keyframes: [
 *     { time: 0, value: 0, easing: 'easeOutQuad' },
 *     { time: 0.4, value: 1 }
 *   ]
 * }
 */
(function () {
    'use strict';

    class UIKeyframeEvaluator {
        constructor() {
            this.easings = new Map();
            this.registerDefaultEasings();
        }

        registerEasing(name, fn) {
            if (!name || typeof fn !== 'function') {
                throw new TypeError('UIKeyframeEvaluator.registerEasing(name, fn): invalid arguments.');
            }

            this.easings.set(String(name), fn);
            return this;
        }

        unregisterEasing(name) {
            return this.easings.delete(String(name));
        }

        evaluateTrack(track, time) {
            const keyframes = this._normalizeKeyframes(track?.keyframes);

            if (!keyframes.length) return undefined;

            if (time <= keyframes[0].time) {
                return this._cloneValue(keyframes[0].value);
            }

            const last = keyframes[keyframes.length - 1];

            if (time >= last.time) {
                return this._cloneValue(last.value);
            }

            for (let i = 0; i < keyframes.length - 1; i++) {
                const from = keyframes[i];
                const to = keyframes[i + 1];

                if (time < from.time || time > to.time) continue;

                const duration = Math.max(0.000001, to.time - from.time);
                let t = (time - from.time) / duration;

                const easingName = to.easing || from.easing || track?.easing || 'linear';
                const easing = this.easings.get(easingName) || this.easings.get('linear');

                t = Math.max(0, Math.min(1, easing(t)));

                return this.interpolate(
                    from.value,
                    to.value,
                    t,
                    track?.interpolation || 'linear'
                );
            }

            return this._cloneValue(last.value);
        }

        interpolate(from, to, t, mode = 'linear') {
            if (mode === 'step') {
                return t < 1 ? this._cloneValue(from) : this._cloneValue(to);
            }

            if (typeof from === 'number' && typeof to === 'number') {
                return from + (to - from) * t;
            }

            if (Array.isArray(from) && Array.isArray(to)) {
                const length = Math.min(from.length, to.length);

                return Array.from({ length }, (_, index) =>
                    this.interpolate(from[index], to[index], t, mode)
                );
            }

            if (
                from &&
                to &&
                typeof from === 'object' &&
                typeof to === 'object'
            ) {
                const result = {};
                const keys = new Set([
                    ...Object.keys(from),
                    ...Object.keys(to)
                ]);

                for (const key of keys) {
                    const a = from[key];
                    const b = to[key];

                    if (a === undefined) {
                        result[key] = this._cloneValue(b);
                    } else if (b === undefined) {
                        result[key] = this._cloneValue(a);
                    } else {
                        result[key] = this.interpolate(a, b, t, mode);
                    }
                }

                return result;
            }

            if (
                typeof from === 'string' &&
                typeof to === 'string' &&
                this._isColor(from) &&
                this._isColor(to)
            ) {
                return this._interpolateColor(from, to, t);
            }

            return t < 0.5
                ? this._cloneValue(from)
                : this._cloneValue(to);
        }

        getDuration(tracks = []) {
            let duration = 0;

            for (const track of tracks) {
                for (const keyframe of track?.keyframes || []) {
                    duration = Math.max(duration, Number(keyframe.time) || 0);
                }
            }

            return duration;
        }

        registerDefaultEasings() {
            this.registerEasing('linear', t => t);

            this.registerEasing('easeInQuad', t => t * t);
            this.registerEasing('easeOutQuad', t => t * (2 - t));
            this.registerEasing('easeInOutQuad', t =>
                t < 0.5
                    ? 2 * t * t
                    : -1 + (4 - 2 * t) * t
            );

            this.registerEasing('easeInCubic', t => t * t * t);
            this.registerEasing('easeOutCubic', t => 1 - Math.pow(1 - t, 3));
            this.registerEasing('easeInOutCubic', t =>
                t < 0.5
                    ? 4 * t * t * t
                    : 1 - Math.pow(-2 * t + 2, 3) / 2
            );

            this.registerEasing('easeInQuart', t => t * t * t * t);
            this.registerEasing('easeOutQuart', t => 1 - Math.pow(1 - t, 4));

            this.registerEasing('easeInExpo', t =>
                t === 0 ? 0 : Math.pow(2, 10 * t - 10)
            );

            this.registerEasing('easeOutExpo', t =>
                t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
            );

            this.registerEasing('easeOutBack', t => {
                const c1 = 1.70158;
                const c3 = c1 + 1;
                return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
            });

            return this;
        }

        _normalizeKeyframes(keyframes) {
            if (!Array.isArray(keyframes)) return [];

            return [...keyframes]
                .filter(keyframe =>
                    keyframe &&
                    Number.isFinite(Number(keyframe.time))
                )
                .map(keyframe => ({
                    ...keyframe,
                    time: Number(keyframe.time)
                }))
                .sort((a, b) => a.time - b.time);
        }

        _isColor(value) {
            return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
        }

        _interpolateColor(from, to, t) {
            const a = this._hexToRgb(from);
            const b = this._hexToRgb(to);

            if (!a || !b) return t < 0.5 ? from : to;

            const r = Math.round(a.r + (b.r - a.r) * t);
            const g = Math.round(a.g + (b.g - a.g) * t);
            const bl = Math.round(a.b + (b.b - a.b) * t);

            return `#${[r, g, bl]
                .map(value => value.toString(16).padStart(2, '0'))
                .join('')}`;
        }

        _hexToRgb(hex) {
            let value = String(hex).replace('#', '');

            if (value.length === 3) {
                value = value
                    .split('')
                    .map(char => char + char)
                    .join('');
            }

            const number = parseInt(value, 16);

            if (!Number.isFinite(number)) return null;

            return {
                r: (number >> 16) & 255,
                g: (number >> 8) & 255,
                b: number & 255
            };
        }

        _cloneValue(value) {
            if (!value || typeof value !== 'object') return value;

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
    }

    window.UIKeyframeEvaluator = UIKeyframeEvaluator;

    if (!window.uiKeyframeEvaluator) {
        window.uiKeyframeEvaluator = new UIKeyframeEvaluator();
    }
})();