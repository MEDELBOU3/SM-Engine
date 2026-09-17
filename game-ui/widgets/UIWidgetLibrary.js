/**
 * GAME-UI/widgets/UIWidgetLibrary.js
 * Widget registry + creation factory.
 */
(function () {
    'use strict';

    class UIWidgetLibrary {
        constructor() {
            this.registry = new Map();
            this.categories = new Map();
            this.initialized = false;
        }

        init() {
            if (this.initialized) return this;

            this.registerBuiltIns();
            this.initialized = true;

            return this;
        }

        register(type, constructor, metadata = {}) {
            if (!type || typeof constructor !== 'function') {
                throw new TypeError('UIWidgetLibrary.register(type, constructor): invalid arguments.');
            }

            const normalizedType = String(type).trim();

            this.registry.set(normalizedType, {
                type: normalizedType,
                constructor,
                metadata: {
                    label: metadata.label || normalizedType,
                    category: metadata.category || 'General',
                    icon: metadata.icon || '',
                    description: metadata.description || '',
                    defaultOptions: metadata.defaultOptions || {}
                }
            });

            const category = metadata.category || 'General';
            if (!this.categories.has(category)) this.categories.set(category, new Set());
            this.categories.get(category).add(normalizedType);

            return this;
        }

        unregister(type) {
            const entry = this.registry.get(type);
            if (!entry) return false;

            this.registry.delete(type);

            const category = entry.metadata.category;
            this.categories.get(category)?.delete(type);

            return true;
        }

        has(type) {
            return this.registry.has(type);
        }

        get(type) {
            return this.registry.get(type) || null;
        }

        create(type, options = {}) {
            const entry = this.registry.get(type);

            if (!entry) {
                if (typeof window.UIWidget === 'function') {
                    console.warn(`[UIWidgetLibrary] Unknown widget type "${type}". Using UIWidget.`);
                    return new window.UIWidget({
                        type,
                        ...options
                    });
                }

                throw new Error(`UIWidgetLibrary: widget type "${type}" is not registered.`);
            }

            const defaults = entry.metadata.defaultOptions || {};

            return new entry.constructor({
                ...defaults,
                ...options,
                type
            });
        }

        getTypes() {
            return [...this.registry.keys()];
        }

        getEntries() {
            return [...this.registry.values()];
        }

        getCategories() {
            const output = {};

            for (const [category, types] of this.categories.entries()) {
                output[category] = [...types];
            }

            return output;
        }

        registerBuiltIns() {
            if (typeof window.UIWidget === 'function') {
                this.register('widget', window.UIWidget, {
                    label: 'Widget',
                    category: 'Base'
                });
            }

            if (typeof window.UIPanel === 'function') {
                this.register('panel', window.UIPanel, {
                    label: 'Panel',
                    category: 'Layout',
                    description: 'Container widget for grouping child widgets.'
                });
            }

            if (typeof window.UIText === 'function') {
                this.register('text', window.UIText, {
                    label: 'Text',
                    category: 'Basic',
                    description: 'Display static or bound text.'
                });
            }

            if (typeof window.UIImage === 'function') {
                this.register('image', window.UIImage, {
                    label: 'Image',
                    category: 'Basic',
                    description: 'Display an image or icon.'
                });
            }

            if (typeof window.UIButton === 'function') {
                this.register('button', window.UIButton, {
                    label: 'Button',
                    category: 'Interactive',
                    description: 'Clickable UI button.'
                });
            }

            if (typeof window.UIProgressBar === 'function') {
                this.register('progressBar', window.UIProgressBar, {
                    label: 'Progress Bar',
                    category: 'HUD',
                    description: 'Health, stamina, mana, XP or generic progress.'
                });
            }

            return this;
        }

        refreshBuiltIns() {
            this.registry.clear();
            this.categories.clear();
            this.registerBuiltIns();
            return this;
        }
    }

    window.UIWidgetLibrary = UIWidgetLibrary;

    if (!window.uiWidgetLibrary) {
        window.uiWidgetLibrary = new UIWidgetLibrary();
    }

    window.uiWidgetLibrary.init();
})();