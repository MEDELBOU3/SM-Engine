/**
 * GAME-UI/animation/UITransitionLibrary.js
 * ------------------------------------------------------------
 * Reusable animation presets for menus, HUDs and widgets.
 */
(function () {
    'use strict';

    class UITransitionLibrary {
        constructor(options = {}) {
            this.animationSystem =
                options.animationSystem ||
                window.uiAnimationSystem ||
                null;

            this.presets = new Map();

            this.registerBuiltIns();
        }

        register(name, factory) {
            if (!name || typeof factory !== 'function') {
                throw new TypeError('UITransitionLibrary.register(name, factory): invalid arguments.');
            }

            this.presets.set(String(name), factory);
            return this;
        }

        unregister(name) {
            return this.presets.delete(String(name));
        }

        has(name) {
            return this.presets.has(String(name));
        }

        create(name, widget, options = {}) {
            const factory = this.presets.get(String(name));

            if (!factory) {
                console.warn(`[UITransitionLibrary] Unknown transition "${name}".`);
                return null;
            }

            return factory(widget, options);
        }

        play(name, widget, options = {}) {
            const definition = this.create(name, widget, options);

            if (!definition) return null;

            const system =
                options.animationSystem ||
                this.animationSystem ||
                window.uiAnimationSystem;

            if (!system) {
                console.warn('[UITransitionLibrary] UIAnimationSystem is unavailable.');
                return null;
            }

            return system.play(definition, {
                widget,
                ...options
            });
        }

        registerBuiltIns() {
            this.register('fade-in', (widget, options = {}) => ({
                name: 'fade-in',
                duration: Number(options.duration ?? 0.25),
                tracks: [
                    {
                        property: 'opacity',
                        easing: options.easing || 'easeOutQuad',
                        keyframes: [
                            { time: 0, value: Number(options.from ?? 0) },
                            { time: Number(options.duration ?? 0.25), value: Number(options.to ?? 1) }
                        ]
                    }
                ]
            }));

            this.register('fade-out', (widget, options = {}) => ({
                name: 'fade-out',
                duration: Number(options.duration ?? 0.2),
                tracks: [
                    {
                        property: 'opacity',
                        easing: options.easing || 'easeInQuad',
                        keyframes: [
                            { time: 0, value: Number(options.from ?? widget?.opacity ?? 1) },
                            { time: Number(options.duration ?? 0.2), value: Number(options.to ?? 0) }
                        ]
                    }
                ]
            }));

            this.register('scale-in', (widget, options = {}) => {
                const duration = Number(options.duration ?? 0.28);

                return {
                    name: 'scale-in',
                    duration,
                    tracks: [
                        {
                            property: 'scaleX',
                            easing: options.easing || 'easeOutBack',
                            keyframes: [
                                { time: 0, value: Number(options.from ?? 0.85) },
                                { time: duration, value: Number(options.to ?? 1) }
                            ]
                        },
                        {
                            property: 'scaleY',
                            easing: options.easing || 'easeOutBack',
                            keyframes: [
                                { time: 0, value: Number(options.from ?? 0.85) },
                                { time: duration, value: Number(options.to ?? 1) }
                            ]
                        },
                        {
                            property: 'opacity',
                            easing: 'easeOutQuad',
                            keyframes: [
                                { time: 0, value: 0 },
                                { time: duration * 0.7, value: 1 }
                            ]
                        }
                    ]
                };
            });

            this.register('scale-out', (widget, options = {}) => {
                const duration = Number(options.duration ?? 0.2);

                return {
                    name: 'scale-out',
                    duration,
                    tracks: [
                        {
                            property: 'scaleX',
                            easing: 'easeInQuad',
                            keyframes: [
                                { time: 0, value: Number(widget?.scaleX ?? 1) },
                                { time: duration, value: Number(options.to ?? 0.85) }
                            ]
                        },
                        {
                            property: 'scaleY',
                            easing: 'easeInQuad',
                            keyframes: [
                                { time: 0, value: Number(widget?.scaleY ?? 1) },
                                { time: duration, value: Number(options.to ?? 0.85) }
                            ]
                        },
                        {
                            property: 'opacity',
                            easing: 'easeInQuad',
                            keyframes: [
                                { time: 0, value: Number(widget?.opacity ?? 1) },
                                { time: duration, value: 0 }
                            ]
                        }
                    ]
                };
            });

            this.register('slide-in-left', (widget, options = {}) => {
                const duration = Number(options.duration ?? 0.32);
                const targetX = Number(options.toX ?? widget?.x ?? 0);
                const offset = Number(options.offset ?? 80);

                return {
                    name: 'slide-in-left',
                    duration,
                    tracks: [
                        {
                            property: 'x',
                            easing: options.easing || 'easeOutCubic',
                            keyframes: [
                                { time: 0, value: targetX - offset },
                                { time: duration, value: targetX }
                            ]
                        },
                        {
                            property: 'opacity',
                            keyframes: [
                                { time: 0, value: 0 },
                                { time: duration * 0.75, value: 1 }
                            ]
                        }
                    ]
                };
            });

            this.register('slide-in-right', (widget, options = {}) => {
                const duration = Number(options.duration ?? 0.32);
                const targetX = Number(options.toX ?? widget?.x ?? 0);
                const offset = Number(options.offset ?? 80);

                return {
                    name: 'slide-in-right',
                    duration,
                    tracks: [
                        {
                            property: 'x',
                            easing: options.easing || 'easeOutCubic',
                            keyframes: [
                                { time: 0, value: targetX + offset },
                                { time: duration, value: targetX }
                            ]
                        },
                        {
                            property: 'opacity',
                            keyframes: [
                                { time: 0, value: 0 },
                                { time: duration * 0.75, value: 1 }
                            ]
                        }
                    ]
                };
            });

            this.register('slide-in-top', (widget, options = {}) => {
                const duration = Number(options.duration ?? 0.32);
                const targetY = Number(options.toY ?? widget?.y ?? 0);
                const offset = Number(options.offset ?? 60);

                return {
                    name: 'slide-in-top',
                    duration,
                    tracks: [
                        {
                            property: 'y',
                            easing: options.easing || 'easeOutCubic',
                            keyframes: [
                                { time: 0, value: targetY - offset },
                                { time: duration, value: targetY }
                            ]
                        },
                        {
                            property: 'opacity',
                            keyframes: [
                                { time: 0, value: 0 },
                                { time: duration * 0.75, value: 1 }
                            ]
                        }
                    ]
                };
            });

            this.register('slide-in-bottom', (widget, options = {}) => {
                const duration = Number(options.duration ?? 0.32);
                const targetY = Number(options.toY ?? widget?.y ?? 0);
                const offset = Number(options.offset ?? 60);

                return {
                    name: 'slide-in-bottom',
                    duration,
                    tracks: [
                        {
                            property: 'y',
                            easing: options.easing || 'easeOutCubic',
                            keyframes: [
                                { time: 0, value: targetY + offset },
                                { time: duration, value: targetY }
                            ]
                        },
                        {
                            property: 'opacity',
                            keyframes: [
                                { time: 0, value: 0 },
                                { time: duration * 0.75, value: 1 }
                            ]
                        }
                    ]
                };
            });

            this.register('pulse', (widget, options = {}) => {
                const duration = Number(options.duration ?? 0.65);
                const amount = Number(options.amount ?? 0.08);

                return {
                    name: 'pulse',
                    duration,
                    loop: options.loop ?? false,
                    tracks: [
                        {
                            property: 'scaleX',
                            keyframes: [
                                { time: 0, value: 1 },
                                { time: duration * 0.5, value: 1 + amount, easing: 'easeOutQuad' },
                                { time: duration, value: 1, easing: 'easeInQuad' }
                            ]
                        },
                        {
                            property: 'scaleY',
                            keyframes: [
                                { time: 0, value: 1 },
                                { time: duration * 0.5, value: 1 + amount, easing: 'easeOutQuad' },
                                { time: duration, value: 1, easing: 'easeInQuad' }
                            ]
                        }
                    ]
                };
            });

            this.register('damage-flash', (widget, options = {}) => {
                const duration = Number(options.duration ?? 0.35);

                return {
                    name: 'damage-flash',
                    duration,
                    tracks: [
                        {
                            property: 'opacity',
                            keyframes: [
                                { time: 0, value: Number(options.from ?? 0.2) },
                                { time: duration * 0.25, value: 1 },
                                { time: duration, value: Number(options.to ?? 0) }
                            ]
                        }
                    ]
                };
            });

            return this;
        }

        getNames() {
            return [...this.presets.keys()];
        }
    }

    window.UITransitionLibrary = UITransitionLibrary;

    if (!window.uiTransitionLibrary) {
        window.uiTransitionLibrary = new UITransitionLibrary();
    }
})();