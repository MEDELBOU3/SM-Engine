/**
 * VideoTransitionsLibrary.js
 * SM Engine Video Editing — professional transition definitions.
 *
 * Transition modes:
 * - live-opacity: previews immediately with the existing compositor opacity bridge.
 * - compositor: metadata/evaluator ready for the advanced compositor pass.
 */
(function (global) {
    'use strict';

    const N = (label, min, max, step, def, unit = '') => ({
        label, type: 'number', min, max, step, def, unit
    });

    const B = (label, def = false) => ({
        label, type: 'boolean', def
    });

    const S = (label, def, options) => ({
        label, type: 'select', def, options
    });

    const C = (label, def = '#000000') => ({
        label, type: 'color', def
    });

    class VideoTransitionsLibrary {
        constructor() {
            this.definitions = new Map();
            this._registerBuiltins();
        }

        register(definition) {
            if (!definition?.id || !definition?.name) return false;
            this.definitions.set(definition.id, definition);
            return true;
        }

        get(id) {
            return this.definitions.get(id) || null;
        }

        list(category = null) {
            const items = [...this.definitions.values()];
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

        createInstance(id, options = {}) {
            const def = this.get(id);
            if (!def) return null;

            const params = {};

            Object.entries(def.params || {}).forEach(([key, desc]) => {
                params[key] =
                    options.params?.[key] ??
                    desc.def;
            });

            return {
                uid:
                    options.uid ||
                    `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

                pairId:
                    options.pairId ||
                    null,

                id: def.id,
                name: def.name,

                edge:
                    options.edge ||
                    'in',

                duration:
                    Math.max(
                        .03,
                        Number(
                            options.duration ??
                            def.defaultDuration ??
                            .5
                        )
                    ),

                alignment:
                    options.alignment ||
                    'center',

                easing:
                    options.easing ||
                    'ease-in-out',

                reverse:
                    !!options.reverse,

                enabled:
                    options.enabled !== false,

                params,

                createdAt:
                    new Date().toISOString()
            };
        }

        icon(name) {
            const icons = {
                transitions: '<svg viewBox="0 0 24 24"><path d="M4 7h7l4 5-4 5H4"/><path d="M20 7h-4l-4 5 4 5h4"/></svg>',
                dissolve: '<svg viewBox="0 0 24 24"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
                black: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
                white: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></svg>',
                color: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M5 16l5-5 3 3 3-3 3 3"/></svg>',
                wipe: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 5v14M12 5v14M16 5v14"/></svg>',
                slide: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="11" height="12"/><path d="M12 12h9M18 9l3 3-3 3"/></svg>',
                push: '<svg viewBox="0 0 24 24"><path d="M3 6h8v12H3zM13 6h8v12h-8z"/><path d="M8 12h8M13 9l3 3-3 3"/></svg>',
                zoom: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14"/><path d="M9 9h6v6H9z"/></svg>',
                blur: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity=".65"/><circle cx="12" cy="12" r="10" opacity=".3"/></svg>',
                luma: '<svg viewBox="0 0 24 24"><path d="M4 18V6h16v12z"/><path d="M4 18L20 6"/></svg>',
                film: '<svg viewBox="0 0 24 24"><path d="M5 3h14v18H5zM5 7h14M5 17h14"/><path d="M8 3v4M12 3v4M16 3v4M8 17v4M12 17v4M16 17v4"/></svg>',
                glitch: '<svg viewBox="0 0 24 24"><path d="M4 6h10v4h6M4 12h5v6h11M14 10v5M9 12V8"/></svg>'
            };

            return icons[name] || icons.transitions;
        }

        _registerBuiltins() {
            this.register({
                id: 'cross-dissolve',
                name: 'Cross Dissolve',
                category: 'Dissolve',
                icon: 'dissolve',
                renderer: 'live-opacity',
                defaultDuration: .5,
                description: 'Classic A/B opacity dissolve.',
                params: {
                    mix: N('Mix', 0, 1, .01, 1, '')
                }
            });

            this.register({
                id: 'fade-black',
                name: 'Fade Through Black',
                category: 'Dissolve',
                icon: 'black',
                renderer: 'live-opacity',
                defaultDuration: .5,
                description: 'Fade outgoing image to black, then reveal incoming.',
                params: {
                    midpoint: N('Midpoint', .1, .9, .01, .5, '')
                }
            });

            this.register({
                id: 'fade-white',
                name: 'Fade Through White',
                category: 'Dissolve',
                icon: 'white',
                renderer: 'live-opacity',
                defaultDuration: .5,
                params: {
                    midpoint: N('Midpoint', .1, .9, .01, .5, '')
                }
            });

            this.register({
                id: 'dip-color',
                name: 'Dip to Color',
                category: 'Dissolve',
                icon: 'color',
                renderer: 'live-opacity',
                defaultDuration: .6,
                params: {
                    color: C('Color', '#000000'),
                    midpoint: N('Midpoint', .1, .9, .01, .5, '')
                }
            });

            this.register({
                id: 'wipe',
                name: 'Linear Wipe',
                category: 'Wipe',
                icon: 'wipe',
                renderer: 'compositor',
                defaultDuration: .5,
                params: {
                    direction: S('Direction', 'left', ['left', 'right', 'up', 'down']),
                    softness: N('Softness', 0, 1, .01, .05, ''),
                    angle: N('Angle', -180, 180, .1, 0, '°')
                }
            });

            this.register({
                id: 'slide',
                name: 'Slide',
                category: 'Movement',
                icon: 'slide',
                renderer: 'compositor',
                defaultDuration: .5,
                params: {
                    direction: S('Direction', 'left', ['left', 'right', 'up', 'down']),
                    overshoot: N('Overshoot', 0, .35, .01, 0, '')
                }
            });

            this.register({
                id: 'push',
                name: 'Push',
                category: 'Movement',
                icon: 'push',
                renderer: 'compositor',
                defaultDuration: .5,
                params: {
                    direction: S('Direction', 'left', ['left', 'right', 'up', 'down']),
                    gap: N('Gap', 0, .2, .01, 0, '')
                }
            });

            this.register({
                id: 'zoom',
                name: 'Zoom',
                category: 'Movement',
                icon: 'zoom',
                renderer: 'compositor',
                defaultDuration: .45,
                params: {
                    startScale: N('Start Scale', .1, 3, .01, .7, ''),
                    endScale: N('End Scale', .1, 3, .01, 1, ''),
                    blur: N('Motion Blur', 0, 20, .1, 3, 'px')
                }
            });

            this.register({
                id: 'blur-dissolve',
                name: 'Blur Dissolve',
                category: 'Dissolve',
                icon: 'blur',
                renderer: 'compositor',
                defaultDuration: .55,
                params: {
                    blur: N('Blur', 0, 40, .1, 14, 'px'),
                    mix: N('Mix', 0, 1, .01, 1, '')
                }
            });

            this.register({
                id: 'luma-fade',
                name: 'Luma Fade',
                category: 'Wipe',
                icon: 'luma',
                renderer: 'compositor',
                defaultDuration: .65,
                params: {
                    threshold: N('Threshold', 0, 1, .01, .5, ''),
                    softness: N('Softness', 0, 1, .01, .12, ''),
                    invert: B('Invert', false)
                }
            });

            this.register({
                id: 'film-burn',
                name: 'Film Burn',
                category: 'Stylize',
                icon: 'film',
                renderer: 'compositor',
                defaultDuration: .6,
                params: {
                    intensity: N('Intensity', 0, 2, .01, 1, ''),
                    color: C('Burn Color', '#ff7a22'),
                    bloom: N('Bloom', 0, 2, .01, .7, '')
                }
            });

            this.register({
                id: 'digital-glitch',
                name: 'Digital Glitch',
                category: 'Stylize',
                icon: 'glitch',
                renderer: 'compositor',
                defaultDuration: .35,
                params: {
                    strength: N('Strength', 0, 1, .01, .45, ''),
                    blocks: N('Blocks', 1, 40, 1, 12, ''),
                    chroma: N('RGB Split', 0, 30, .1, 6, 'px')
                }
            });
        }
    }

    global.VideoTransitionsLibrary = VideoTransitionsLibrary;
    global.videoTransitionsLibrary =
        global.videoTransitionsLibrary ||
        new VideoTransitionsLibrary();

})(window);