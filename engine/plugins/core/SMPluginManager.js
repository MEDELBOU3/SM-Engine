(function () {
    'use strict';

    class SMPluginManager {
        constructor({ registry = window.SMPluginRegistry, storage = window.smPluginStorage } = {}) {
            this.registry = registry;
            this.storage = storage;
            this.instances = new Map();
            this.statuses = new Map();
            this.services = new Map();
            this.commands = new Map();
            this.panels = new Map();
            this.initialized = false;
            this.policy = {
                pluginsEnabled: true,
                safeMode: false,
                autoStart: true,
                allowExperimental: false
            };
        }

        _emit(name, detail = {}) {
            window.dispatchEvent(new CustomEvent(name, { detail }));
        }

        _setStatus(id, state, error = null) {
            const status = { state, error: error ? String(error) : null, changedAt: Date.now() };
            this.statuses.set(String(id), status);
            this._emit('sm:plugin-status-changed', { id: String(id), status });
            return status;
        }

        init() {
            if (this.initialized) return this;
            this.initialized = true;
            this._emit('sm:plugin-manager-ready', { manager: this });
            return this;
        }

        async start() {
            this.init();
            if (this.policy.autoStart && this.policy.pluginsEnabled) await this.enableConfigured();
            this._emit('sm:plugins-ready', { manager: this, registry: this.registry });
            return this;
        }

        async setPolicy(key, value) {
            if (!Object.prototype.hasOwnProperty.call(this.policy, key)) return value;
            this.policy[key] = Boolean(value);
            if (key === 'pluginsEnabled' && !this.policy.pluginsEnabled) await this.disableAll({ persist: false, cascade: true });
            if (key === 'safeMode' && this.policy.safeMode) {
                for (const [id, live] of [...this.instances]) {
                    if (!live.manifest.builtIn) await this.disable(id, { persist: false, cascade: true });
                }
            }
            if (key === 'allowExperimental' && !this.policy.allowExperimental) {
                for (const [id, live] of [...this.instances]) {
                    if (live.manifest.isExperimentalVersion) await this.disable(id, { persist: false, cascade: true });
                }
            }
            if (key === 'pluginsEnabled' && this.policy.pluginsEnabled && this.initialized && this.policy.autoStart) {
                await this.enableConfigured();
            }
            this._emit('sm:plugin-policy-changed', { key, value: this.policy[key], policy: { ...this.policy } });
            return this.policy[key];
        }

        _canEnable(manifest) {
            if (!this.policy.pluginsEnabled) return { ok: false, reason: 'Plugins are globally disabled.' };
            if (this.policy.safeMode && !manifest.builtIn) return { ok: false, reason: 'Safe Mode permits only built-in plugins.' };
            if (manifest.isExperimentalVersion && !this.policy.allowExperimental) {
                return { ok: false, reason: 'Experimental plugins are disabled by policy.' };
            }
            return { ok: true };
        }

        _isDesired(manifest) {
            const saved = this.storage?.getPluginState?.(manifest.id)?.enabled;
            return typeof saved === 'boolean' ? saved : manifest.enabledByDefault;
        }

        _dependenciesOf(id, { activeOnly = false } = {}) {
            const dependents = [];
            for (const entry of this.registry?.list?.() || []) {
                if (activeOnly && !this.instances.has(entry.manifest.id)) continue;
                if (entry.manifest.dependencies.some((dependency) => dependency.id === id && !dependency.optional)) {
                    dependents.push(entry.manifest.id);
                }
            }
            return dependents;
        }

        async enable(id, options = {}) {
            const pluginId = String(id);
            const entry = this.registry?.get?.(pluginId);
            if (!entry) throw new Error(`Unknown plugin "${pluginId}".`);
            if (this.instances.has(pluginId)) return this.instances.get(pluginId).instance;

            const chain = options._chain || [];
            if (chain.includes(pluginId)) {
                const cycle = [...chain, pluginId].join(' -> ');
                this._setStatus(pluginId, 'blocked', `Circular dependency: ${cycle}`);
                throw new Error(`Circular plugin dependency: ${cycle}`);
            }

            const gate = this._canEnable(entry.manifest);
            if (!gate.ok) {
                this._setStatus(pluginId, 'blocked', gate.reason);
                return null;
            }

            this._setStatus(pluginId, 'starting');
            const nextChain = [...chain, pluginId];
            let context = null;
            try {
                for (const dependency of entry.manifest.dependencies) {
                    const dependencyEntry = this.registry.get(dependency.id);
                    if (!dependencyEntry) {
                        if (dependency.optional) continue;
                        throw new Error(`Required dependency "${dependency.id}" is not installed.`);
                    }
                    const instance = await this.enable(dependency.id, {
                        persist: false,
                        _chain: nextChain
                    });
                    if (!instance && !this.instances.has(dependency.id) && !dependency.optional) {
                        const reason = this.getStatus(dependency.id).error || 'dependency could not be enabled';
                        throw new Error(`Required dependency "${dependency.id}" failed: ${reason}`);
                    }
                }

                context = new window.SMPluginContext(this, entry.manifest);
                const instance = (await entry.factory(context, entry.manifest)) || {};
                if (typeof instance.onLoad === 'function') await instance.onLoad();
                if (typeof instance.onEnable === 'function') await instance.onEnable();
                this.instances.set(pluginId, { context, instance, manifest: entry.manifest });
                if (options.persist !== false) this.storage?.setEnabled?.(pluginId, true);
                this._setStatus(pluginId, 'enabled');
                this._emit('sm:plugin-enabled', { id: pluginId, manifest: entry.manifest, instance });
                context.log('Enabled.');
                return instance;
            } catch (error) {
                context?.dispose?.();
                this._setStatus(pluginId, 'error', error?.message || error);
                console.error(`[SMPluginManager] Could not enable "${pluginId}".`, error);
                return null;
            }
        }

        async disable(id, options = {}) {
            const pluginId = String(id);
            const live = this.instances.get(pluginId);
            const dependents = this._dependenciesOf(pluginId, { activeOnly: true });
            if (dependents.length && !options.cascade) {
                throw new Error(`Cannot disable "${pluginId}" while required by: ${dependents.join(', ')}.`);
            }
            if (options.cascade) {
                for (const dependentId of dependents) await this.disable(dependentId, { ...options, persist: false, cascade: true });
            }
            if (!live) {
                if (options.persist !== false) this.storage?.setEnabled?.(pluginId, false);
                this._setStatus(pluginId, 'disabled');
                return true;
            }
            this._setStatus(pluginId, 'stopping');
            try {
                if (typeof live.instance?.onDisable === 'function') await live.instance.onDisable();
                if (typeof live.instance?.onUnload === 'function') await live.instance.onUnload();
            } catch (error) {
                console.warn(`[SMPluginManager] Shutdown hook failed for "${pluginId}".`, error);
            } finally {
                live.context.dispose();
                this.instances.delete(pluginId);
            }
            if (options.persist !== false) this.storage?.setEnabled?.(pluginId, false);
            this._setStatus(pluginId, 'disabled');
            this._emit('sm:plugin-disabled', { id: pluginId, manifest: live.manifest });
            return true;
        }

        async restart(id) {
            const pluginId = String(id);
            const shouldEnable = this.instances.has(pluginId);
            await this.disable(pluginId, { persist: false, cascade: false });
            return shouldEnable ? this.enable(pluginId, { persist: false }) : true;
        }

        async enableConfigured() {
            const results = [];
            for (const entry of this.registry?.list?.() || []) {
                if (this._isDesired(entry.manifest)) results.push(await this.enable(entry.manifest.id, { persist: false }));
            }
            return results;
        }

        async enableDefaults() {
            const results = [];
            for (const entry of this.registry?.list?.() || []) {
                if (entry.manifest.enabledByDefault) results.push(await this.enable(entry.manifest.id));
            }
            return results;
        }

        async disableAll(options = {}) {
            for (const id of [...this.instances.keys()]) {
                if (this.instances.has(id)) await this.disable(id, { persist: options.persist !== false, cascade: true });
            }
            return true;
        }

        isEnabled(id) { return this.instances.has(String(id)); }
        getStatus(id) { return this.statuses.get(String(id)) || { state: this.isEnabled(id) ? 'enabled' : 'disabled', error: null, changedAt: null }; }

        getSetting(id, key, fallback = null) {
            const manifest = this.registry?.get?.(id)?.manifest;
            const definition = manifest?.settings?.find((setting) => setting.id === key);
            return this.storage?.getSetting?.(id, key, definition ? definition.default : fallback);
        }

        setSetting(id, key, value) {
            const pluginId = String(id);
            const definition = this.registry?.get?.(pluginId)?.manifest?.settings?.find((setting) => setting.id === key);
            if (!definition) throw new Error(`Plugin "${pluginId}" does not define setting "${key}".`);
            let normalized = value;
            if (definition.type === 'boolean') normalized = value === true || value === 'true' || value === 1 || value === '1';
            if (definition.type === 'number') {
                normalized = Number(value);
                if (!Number.isFinite(normalized)) normalized = Number(definition.default) || 0;
                if (Number.isFinite(Number(definition.min))) normalized = Math.max(Number(definition.min), normalized);
                if (Number.isFinite(Number(definition.max))) normalized = Math.min(Number(definition.max), normalized);
            }
            if (definition.type === 'select') {
                normalized = String(value);
                if (definition.options.length && !definition.options.includes(normalized)) normalized = String(definition.default);
            }
            if (definition.type === 'string') normalized = String(value ?? '');
            this.storage?.setSetting?.(pluginId, key, normalized);
            const live = this.instances.get(pluginId);
            try { live?.instance?.onSettingChanged?.(key, normalized, this.getSettings(pluginId)); } catch (error) { live?.context?.log(`Setting "${key}" could not be applied.`, 'warn', error); }
            this._emit('sm:plugin-setting-changed', { id: pluginId, key, value: normalized });
            return normalized;
        }

        getSettings(id) {
            const settings = {};
            for (const definition of this.registry?.get?.(id)?.manifest?.settings || []) {
                settings[definition.id] = this.getSetting(id, definition.id, definition.default);
            }
            return settings;
        }

        provideService(pluginId, name, value) {
            const key = String(name);
            const current = this.services.get(key);
            if (current && current.pluginId !== pluginId) throw new Error(`Service "${key}" is already provided by "${current.pluginId}".`);
            const record = { pluginId: String(pluginId), value };
            this.services.set(key, record);
            this._emit('sm:plugin-service-registered', { name: key, pluginId: record.pluginId });
            return () => {
                if (this.services.get(key) === record) {
                    this.services.delete(key);
                    this._emit('sm:plugin-service-unregistered', { name: key, pluginId: record.pluginId });
                }
            };
        }

        getService(name, fallback = null) { return this.services.get(String(name))?.value ?? fallback; }

        registerCommand(pluginId, command, handler) {
            const descriptor = typeof command === 'string' ? { id: command, label: command } : command || {};
            const commandId = String(descriptor.id || '').trim();
            if (!commandId || typeof handler !== 'function') throw new Error('A command id and handler are required.');
            const key = `${pluginId}:${commandId}`;
            if (this.commands.has(key)) throw new Error(`Plugin command "${key}" is already registered.`);
            const record = { pluginId: String(pluginId), id: commandId, label: String(descriptor.label || commandId), description: String(descriptor.description || ''), handler };
            this.commands.set(key, record);
            this._emit('sm:plugin-command-registered', { command: { ...record, handler: undefined } });
            return () => {
                if (this.commands.get(key) === record) {
                    this.commands.delete(key);
                    this._emit('sm:plugin-command-unregistered', { pluginId: String(pluginId), id: commandId });
                }
            };
        }

        async runCommand(pluginId, commandId, ...args) {
            const record = this.commands.get(`${pluginId}:${commandId}`);
            if (!record) throw new Error(`Plugin command "${pluginId}:${commandId}" is not registered.`);
            return record.handler(...args);
        }

        registerPanel(pluginId, panel) {
            const descriptor = panel || {};
            const panelId = String(descriptor.id || '').trim();
            if (!panelId) throw new Error('A plugin panel id is required.');
            const key = `${pluginId}:${panelId}`;
            if (this.panels.has(key)) throw new Error(`Plugin panel "${key}" is already registered.`);
            const record = { pluginId: String(pluginId), id: panelId, title: String(descriptor.title || panelId), icon: String(descriptor.icon || 'fa-solid fa-puzzle-piece'), mount: descriptor.mount, unmount: descriptor.unmount };
            this.panels.set(key, record);
            this._emit('sm:plugin-panel-registered', { panel: { ...record, mount: undefined, unmount: undefined } });
            return () => {
                if (this.panels.get(key) === record) {
                    try { record.unmount?.(); } finally {
                        this.panels.delete(key);
                        this._emit('sm:plugin-panel-unregistered', { pluginId: String(pluginId), id: panelId });
                    }
                }
            };
        }

        listCommands() { return [...this.commands.values()].map(({ handler, ...command }) => command); }
        listPanels() { return [...this.panels.values()].map(({ mount, unmount, ...panel }) => panel); }

        describe(id) {
            const entry = this.registry?.get?.(id);
            if (!entry) return null;
            return {
                ...entry.manifest,
                enabled: this.isEnabled(entry.manifest.id),
                desired: this._isDesired(entry.manifest),
                status: this.getStatus(entry.manifest.id),
                settings: this.getSettings(entry.manifest.id)
            };
        }

        list() { return (this.registry?.list?.() || []).map((entry) => this.describe(entry.manifest.id)); }

        debug() {
            const rows = this.list().map((plugin) => ({
                Id: plugin.id,
                Name: plugin.name,
                Version: plugin.version,
                Enabled: plugin.enabled,
                State: plugin.status.state,
                Category: plugin.category
            }));
            console.table(rows);
            return rows;
        }
    }

    window.SMPluginManagerClass = SMPluginManager;
    window.SMPluginManager = window.SMPluginManager || new SMPluginManager();
    window.smPluginManager = window.SMPluginManager;
})();
