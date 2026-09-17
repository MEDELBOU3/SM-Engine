(function () {
    'use strict';

    class SMPluginContext {
        constructor(manager, manifest) {
            this.manager = manager;
            this.manifest = manifest;
            this.id = manifest.id;
            this._cleanups = [];
            this._disposed = false;
        }

        get scene() { return window.scene || null; }
        get renderer() { return window.renderer || null; }
        get camera() { return window.cameraSystem?.activeCamera || window.camera || null; }
        get controls() { return window.controls || null; }
        get runtime() { return window.SMRuntimeManager || null; }
        get settings() { return window.EngineSettings || null; }

        log(message, level = 'info', extra = null) {
            const label = `[Plugin:${this.manifest.name}] ${String(message ?? '')}`;
            const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info;
            if (window.SMConsolePanel?.push) {
                window.SMConsolePanel.push(level, extra === null ? [label] : [label, extra], {
                    source: `Plugin:${this.manifest.name}`,
                    pluginId: this.id
                });
            } else if (extra === null || extra === undefined) {
                fn(label);
            } else {
                fn(label, extra);
            }
        }

        cleanup(disposer) {
            if (typeof disposer === 'function') this._cleanups.push(disposer);
            return disposer;
        }

        on(target, eventName, handler, options) {
            if (!target?.addEventListener || typeof handler !== 'function') return null;
            target.addEventListener(eventName, handler, options);
            return this.cleanup(() => target.removeEventListener(eventName, handler, options));
        }

        onWindow(eventName, handler, options) { return this.on(window, eventName, handler, options); }

        onRuntime(eventName, handler, options) {
            const off = window.SMRuntimeEventBus?.on?.(eventName, handler, options);
            return typeof off === 'function' ? this.cleanup(off) : null;
        }

        emit(eventName, detail = {}) {
            window.dispatchEvent(new CustomEvent(String(eventName), {
                detail: { pluginId: this.id, ...detail }
            }));
        }

        frame(handler) {
            if (typeof handler !== 'function') return null;
            window.engineFrameCallbacks = Array.isArray(window.engineFrameCallbacks) ? window.engineFrameCallbacks : [];
            window.engineFrameCallbacks.push(handler);
            return this.cleanup(() => {
                const index = window.engineFrameCallbacks?.indexOf(handler) ?? -1;
                if (index >= 0) window.engineFrameCallbacks.splice(index, 1);
            });
        }

        interval(handler, milliseconds) {
            const handle = window.setInterval(handler, Math.max(16, Number(milliseconds) || 1000));
            return this.cleanup(() => window.clearInterval(handle));
        }

        timeout(handler, milliseconds) {
            const handle = window.setTimeout(handler, Math.max(0, Number(milliseconds) || 0));
            return this.cleanup(() => window.clearTimeout(handle));
        }

        getSetting(key, fallback = null) { return this.manager.getSetting(this.id, key, fallback); }
        setSetting(key, value) { return this.manager.setSetting(this.id, key, value); }

        provide(name, value) {
            const remove = this.manager.provideService(this.id, name, value);
            return this.cleanup(remove);
        }

        getService(name, fallback = null) { return this.manager.getService(name, fallback); }

        registerCommand(command, handler) {
            const remove = this.manager.registerCommand(this.id, command, handler);
            return this.cleanup(remove);
        }

        registerPanel(panel) {
            const remove = this.manager.registerPanel(this.id, panel);
            return this.cleanup(remove);
        }

        dispose() {
            if (this._disposed) return;
            this._disposed = true;
            for (let index = this._cleanups.length - 1; index >= 0; index -= 1) {
                try { this._cleanups[index](); } catch (error) { console.warn(`[SMPluginContext:${this.id}] cleanup failed.`, error); }
            }
            this._cleanups = [];
        }
    }

    window.SMPluginContext = SMPluginContext;
})();
