/**
 * GAME-UI/binding/UIBindingContext.js
 * ------------------------------------------------------------
 * Convenience context used to expose runtime systems to Game UI.
 *
 * Example:
 * window.uiBindingContext
 *   .set('player', player)
 *   .set('weapon', weaponSystem)
 *   .set('game', gameManager);
 */
(function () {
    'use strict';

    class UIBindingContext {
        constructor(options = {}) {
            this.values = new Map();
            this.dataBindingSystem =
                options.dataBindingSystem ||
                window.uiDataBindingSystem ||
                null;

            this.eventBindingSystem =
                options.eventBindingSystem ||
                window.uiEventBindingSystem ||
                null;
        }

        set(name, value) {
            if (!name) return this;

            this.values.set(String(name), value);

            this.dataBindingSystem?.registerSource?.(
                String(name),
                value
            );

            this.eventBindingSystem?.registerTarget?.(
                String(name),
                value
            );

            return this;
        }

        setProvider(name, provider) {
            if (!name || typeof provider !== 'function') {
                return this;
            }

            this.values.set(String(name), provider);

            this.dataBindingSystem?.registerSource?.(
                String(name),
                provider
            );

            this.eventBindingSystem?.registerTargetProvider?.(
                String(name),
                provider
            );

            return this;
        }

        get(name) {
            const value = this.values.get(String(name));

            if (typeof value === 'function') {
                try {
                    return value();
                } catch (_) {
                    return null;
                }
            }

            return value ?? null;
        }

        has(name) {
            return this.values.has(String(name));
        }

        remove(name) {
            const key = String(name);

            this.values.delete(key);
            this.dataBindingSystem?.unregisterSource?.(key);
            this.eventBindingSystem?.unregisterTarget?.(key);

            return this;
        }

        clear() {
            for (const name of this.values.keys()) {
                this.dataBindingSystem?.unregisterSource?.(name);
                this.eventBindingSystem?.unregisterTarget?.(name);
            }

            this.values.clear();

            return this;
        }

        sync() {
            for (const [name, value] of this.values.entries()) {
                if (typeof value === 'function') {
                    this.dataBindingSystem?.registerSource?.(
                        name,
                        value
                    );

                    this.eventBindingSystem?.registerTargetProvider?.(
                        name,
                        value
                    );
                } else {
                    this.dataBindingSystem?.registerSource?.(
                        name,
                        value
                    );

                    this.eventBindingSystem?.registerTarget?.(
                        name,
                        value
                    );
                }
            }

            return this;
        }
    }

    window.UIBindingContext = UIBindingContext;

    if (!window.uiBindingContext) {
        window.uiBindingContext = new UIBindingContext();
    }
})();