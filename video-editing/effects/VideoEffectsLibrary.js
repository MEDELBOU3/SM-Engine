/**
 * VideoEffectsLibrary.js
 * SM Engine Video Editing — professional effect definitions.
 *
 * The library is UI/data only. Effects declare how they can be rendered:
 * - css-filter: works now through CanvasRenderingContext2D.filter
 * - gpu: stored and editable now; intended for the later GPU effects evaluator
 */
(function (global) {
    'use strict';

    const P = (label, min, max, step, def, unit = '', type = 'number', extra = {}) => ({
        label, min, max, step, def, unit, type, ...extra
    });

    class VideoEffectsLibrary {
        constructor() {
            this.effects = new Map();
            this._registerBuiltins();
        }

        register(definition) {
            if (!definition?.id || !definition?.name) return false;
            this.effects.set(definition.id, definition);
            return true;
        }

        get(id) {
            return this.effects.get(id) || null;
        }

        list(category = null) {
            const items = [...this.effects.values()];
            return category && category !== 'All'
                ? items.filter(item => item.category === category)
                : items;
        }

        categories() {
            return [
                'All',
                ...new Set(
                    this.list().map(
                        item => item.category
                    )
                )
            ];
        }

        createInstance(id) {
            const def = this.get(id);
            if (!def) return null;

            const params = {};
            Object.entries(def.params || {}).forEach(([key, desc]) => {
                params[key] = desc.def;
            });

            return {
                uid: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                id: def.id,
                name: def.name,
                enabled: true,
                solo: false,
                mix: 1,
                params,
                masks: [],
                createdAt: new Date().toISOString()
            };
        }

        buildCssFilter(effect) {
            const def = this.get(effect?.id);
            if (!def || def.renderer !== 'css-filter' || effect.enabled === false) {
                return null;
            }

            if (typeof def.cssFilter !== 'function') {
                return null;
            }

            return def.cssFilter(
                effect.params || {},
                effect
            );
        }

        icon(name) {
            const icons = {
                effects: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
                blur: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity=".65"/><circle cx="12" cy="12" r="10" opacity=".3"/></svg>',
                sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
                contrast: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z"/></svg>',
                saturation: '<svg viewBox="0 0 24 24"><path d="M12 3c4 5 7 8 7 12a7 7 0 0 1-14 0c0-4 3-7 7-12z"/><path d="M8 15c1 2 3 3 5 3"/></svg>',
                hue: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v4M20 12h-4M12 20v-4M4 12h4"/></svg>',
                mono: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/><path d="M12 4v16"/></svg>',
                invert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16"/></svg>',
                opacity: '<svg viewBox="0 0 24 24"><path d="M12 3c4 5 7 8 7 12a7 7 0 1 1-14 0c0-4 3-7 7-12z"/></svg>',
                glow: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/></svg>',
                shadow: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="10" height="10"/><path d="M9 9h10v10H9z"/></svg>',
                vignette: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14"/><ellipse cx="12" cy="12" rx="6" ry="4"/></svg>',
                sharpen: '<svg viewBox="0 0 24 24"><path d="M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/></svg>',
                grain: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="18" cy="8" r="1"/><circle cx="8" cy="13" r="1"/><circle cx="15" cy="14" r="1"/><circle cx="5" cy="18" r="1"/><circle cx="19" cy="18" r="1"/></svg>',
                chroma: '<svg viewBox="0 0 24 24"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
                lens: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M4 12h16"/></svg>',
                transform: '<svg viewBox="0 0 24 24"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/><path d="M8 12h8M12 8v8"/></svg>',
                key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><path d="M12 12h8M17 12v3M20 12v2"/></svg>'
            };
            return icons[name] || icons.effects;
        }

        _registerBuiltins() {
            this.register({
                id: 'gaussian-blur', name: 'Gaussian Blur', category: 'Blur & Sharpen', icon: 'blur', renderer: 'css-filter',
                description: 'Soft optical-style blur.',
                params: { amount: P('Blur', 0, 50, .1, 0, 'px') },
                cssFilter: (p, fx) => { const m = Math.max(0, Math.min(1, Number(fx?.mix ?? 1))), v = Number(p.amount || 0) * m; return v > 0 ? `blur(${v}px)` : null }
            });

            this.register({
                id: 'brightness', name: 'Brightness', category: 'Color Correction', icon: 'sun', renderer: 'css-filter',
                params: { amount: P('Brightness', 0, 300, 1, 100, '%') },
                cssFilter: (p, fx) => { const m = Math.max(0, Math.min(1, Number(fx?.mix ?? 1))), v = 100 + (Number(p.amount ?? 100) - 100) * m; return `brightness(${v / 100})` }
            });

            this.register({
                id: 'contrast', name: 'Contrast', category: 'Color Correction', icon: 'contrast', renderer: 'css-filter',
                params: { amount: P('Contrast', 0, 300, 1, 100, '%') },
                cssFilter: (p, fx) => { const m = Math.max(0, Math.min(1, Number(fx?.mix ?? 1))), v = 100 + (Number(p.amount ?? 100) - 100) * m; return `contrast(${v / 100})` }
            });

            this.register({
                id: 'saturation', name: 'Saturation', category: 'Color Correction', icon: 'saturation', renderer: 'css-filter',
                params: { amount: P('Saturation', 0, 300, 1, 100, '%') },
                cssFilter: (p, fx) => { const m = Math.max(0, Math.min(1, Number(fx?.mix ?? 1))), v = 100 + (Number(p.amount ?? 100) - 100) * m; return `saturate(${v / 100})` }
            });

            this.register({
                id: 'hue', name: 'Hue Rotate', category: 'Color Correction', icon: 'hue', renderer: 'css-filter',
                params: { amount: P('Hue', -180, 180, 1, 0, '°') },
                cssFilter: (p, fx) => { const m = Math.max(0, Math.min(1, Number(fx?.mix ?? 1))), v = Number(p.amount || 0) * m; return v !== 0 ? `hue-rotate(${v}deg)` : null }
            });

            this.register({
                id: 'grayscale', name: 'Black & White', category: 'Stylize', icon: 'mono', renderer: 'css-filter',
                params: { amount: P('Amount', 0, 100, 1, 100, '%') },
                cssFilter: (p, fx) => `grayscale(${Number(p.amount ?? 100) / 100 * Math.max(0, Math.min(1, Number(fx?.mix ?? 1)))})`
            });

            this.register({
                id: 'sepia', name: 'Sepia', category: 'Stylize', icon: 'sun', renderer: 'css-filter',
                params: { amount: P('Amount', 0, 100, 1, 100, '%') },
                cssFilter: (p, fx) => `sepia(${Number(p.amount ?? 100) / 100 * Math.max(0, Math.min(1, Number(fx?.mix ?? 1)))})`
            });

            this.register({
                id: 'invert', name: 'Invert', category: 'Stylize', icon: 'invert', renderer: 'css-filter',
                params: { amount: P('Amount', 0, 100, 1, 100, '%') },
                cssFilter: (p, fx) => `invert(${Number(p.amount ?? 100) / 100 * Math.max(0, Math.min(1, Number(fx?.mix ?? 1)))})`
            });

            this.register({
                id: 'opacity-fx', name: 'Effect Opacity', category: 'Utility', icon: 'opacity', renderer: 'css-filter',
                params: { amount: P('Opacity', 0, 100, 1, 100, '%') },
                cssFilter: (p, fx) => { const m = Math.max(0, Math.min(1, Number(fx?.mix ?? 1))), v = 100 + (Number(p.amount ?? 100) - 100) * m; return `opacity(${v / 100})` }
            });

            this.register({
                id: 'drop-shadow', name: 'Drop Shadow', category: 'Light & Shadow', icon: 'shadow', renderer: 'css-filter',
                params: {
                    x: P('Offset X', -100, 100, 1, 8, 'px'),
                    y: P('Offset Y', -100, 100, 1, 8, 'px'),
                    blur: P('Blur', 0, 80, 1, 14, 'px'),
                    alpha: P('Opacity', 0, 100, 1, 55, '%')
                },
                cssFilter: (p, fx) => { const m = Math.max(0, Math.min(1, Number(fx?.mix ?? 1))); return `drop-shadow(${Number(p.x || 0) * m}px ${Number(p.y || 0) * m}px ${Number(p.blur || 0) * m}px rgba(0,0,0,${Number(p.alpha ?? 55) / 100 * m}))` }
            });

            this.register({
                id: 'soft-glow', name: 'Soft Glow', category: 'Light & Shadow', icon: 'glow', renderer: 'css-filter',
                params: {
                    radius: P('Radius', 0, 50, 1, 12, 'px'),
                    strength: P('Strength', 0, 100, 1, 55, '%')
                },
                cssFilter: (p, fx) => {
                    const m = Math.max(0, Math.min(1, Number(fx?.mix ?? 1))), r = Number(p.radius || 0) * m, a = Number(p.strength ?? 55) / 100 * m;
                    return r > 0 ? `drop-shadow(0 0 ${r}px rgba(255,255,255,${a}))` : null;
                }
            });

            [
                ['sharpen', 'Sharpen', 'Blur & Sharpen', 'sharpen'],
                ['vignette', 'Vignette', 'Stylize', 'vignette'],
                ['film-grain', 'Film Grain', 'Stylize', 'grain'],
                ['chromatic-aberration', 'Chromatic Aberration', 'Distort', 'chroma'],
                ['lens-distortion', 'Lens Distortion', 'Distort', 'lens'],
                ['transform-fx', 'Transform', 'Transform', 'transform'],
                ['chroma-key', 'Chroma Key', 'Keying', 'key']
            ].forEach(([id, name, category, icon]) => {
                const params =
                    id === 'sharpen' ? { amount: P('Amount', 0, 3, .01, .5, '') } :
                        id === 'vignette' ? { amount: P('Amount', 0, 1, .01, .35, ''), softness: P('Softness', 0, 1, .01, .5, '') } :
                            id === 'film-grain' ? { amount: P('Amount', 0, 1, .01, .2, ''), size: P('Size', .2, 4, .1, 1, '') } :
                                id === 'chromatic-aberration' ? { amount: P('Amount', 0, 30, .1, 2, 'px') } :
                                    id === 'lens-distortion' ? { amount: P('Distortion', -1, 1, .01, 0, '') } :
                                        id === 'transform-fx' ? { scale: P('Scale', 0, 4, .01, 1, ''), rotation: P('Rotation', -180, 180, .1, 0, '°') } :
                                            { threshold: P('Tolerance', 0, 1, .01, .2, ''), softness: P('Softness', 0, 1, .01, .1, '') };

                this.register({
                    id, name, category, icon, renderer: 'gpu',
                    description: 'Stored and editable now; rendered by the upcoming GPU effects evaluator.',
                    params
                });
            });
        }
    }

    global.VideoEffectsLibrary = VideoEffectsLibrary;
    global.videoEffectsLibrary = global.videoEffectsLibrary || new VideoEffectsLibrary();

})(window);