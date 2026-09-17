(function () {
    'use strict';

    const ID_PATTERN = /^[a-z][a-z0-9._-]{2,127}$/i;
    const MODULE_TYPES = new Set(['Runtime', 'Editor', 'Developer', 'Program']);
    const LOADING_PHASES = new Set([
        'EarliestPossible',
        'PostConfigInit',
        'PreDefault',
        'Default',
        'PostDefault',
        'None'
    ]);

    const asArray = (value) => Array.isArray(value) ? value : [];

    class SMPluginRegistry {
        constructor() {
            this._entries = new Map();
        }

        normalizeManifest(source = {}) {
            const id = String(source.id || source.Id || source.Name || '').trim();
            if (!ID_PATTERN.test(id)) {
                throw new Error(`Plugin id "${id}" must be 3-128 characters and use letters, numbers, dots, dashes, or underscores.`);
            }

            const normalizeModule = (module, index) => {
                const name = String(module?.name || module?.Name || `${id}.Module${index + 1}`).trim();
                const type = String(module?.type || module?.Type || 'Runtime');
                const loadingPhase = String(module?.loadingPhase || module?.LoadingPhase || 'Default');
                if (!MODULE_TYPES.has(type)) throw new Error(`Plugin "${id}" has unsupported module type "${type}".`);
                if (!LOADING_PHASES.has(loadingPhase)) throw new Error(`Plugin "${id}" has unsupported loading phase "${loadingPhase}".`);
                return { name, type, loadingPhase };
            };

            const normalizeDependency = (dependency) => {
                const dependencyId = String(
                    typeof dependency === 'string' ? dependency : dependency?.id || dependency?.Name || ''
                ).trim();
                if (!ID_PATTERN.test(dependencyId)) throw new Error(`Plugin "${id}" has an invalid dependency id "${dependencyId}".`);
                return {
                    id: dependencyId,
                    optional: Boolean(typeof dependency === 'object' && (dependency.optional ?? dependency.Optional ?? false))
                };
            };

            const normalizeSetting = (setting) => {
                const settingId = String(setting?.id || setting?.Id || '').trim();
                if (!settingId) return null;
                const type = ['boolean', 'number', 'string', 'select'].includes(setting.type) ? setting.type : 'string';
                return {
                    id: settingId,
                    label: String(setting.label || setting.Label || settingId),
                    description: String(setting.description || setting.Description || ''),
                    type,
                    default: setting.default ?? setting.Default ?? (type === 'boolean' ? false : type === 'number' ? 0 : ''),
                    min: setting.min,
                    max: setting.max,
                    step: setting.step,
                    options: asArray(setting.options).map(String)
                };
            };

            const modules = asArray(source.modules || source.Modules).map(normalizeModule);
            const dependencies = asArray(source.dependencies || source.Plugins).map(normalizeDependency);
            const settings = asArray(source.settings || source.Settings).map(normalizeSetting).filter(Boolean);
            const uniqueDependencies = new Set();
            for (const dependency of dependencies) {
                if (dependency.id === id) throw new Error(`Plugin "${id}" cannot depend on itself.`);
                if (uniqueDependencies.has(dependency.id)) throw new Error(`Plugin "${id}" lists dependency "${dependency.id}" more than once.`);
                uniqueDependencies.add(dependency.id);
            }

            return Object.freeze({
                id,
                name: String(source.name || source.FriendlyName || id),
                version: String(source.version || source.VersionName || '1.0.0'),
                description: String(source.description || source.Description || ''),
                author: String(source.author || source.CreatedBy || 'SM Engine'),
                category: String(source.category || source.Category || 'Other'),
                icon: String(source.icon || 'fa-solid fa-puzzle-piece'),
                enabledByDefault: Boolean(source.enabledByDefault ?? source.EnabledByDefault ?? false),
                builtIn: Boolean(source.builtIn ?? source.Installed ?? false),
                canContainContent: Boolean(source.canContainContent ?? source.CanContainContent ?? false),
                isBetaVersion: Boolean(source.isBetaVersion ?? source.IsBetaVersion ?? false),
                isExperimentalVersion: Boolean(source.isExperimentalVersion ?? source.IsExperimentalVersion ?? false),
                supportedTargetPlatforms: asArray(source.supportedTargetPlatforms || source.SupportedTargetPlatforms).map(String),
                modules: Object.freeze(modules),
                dependencies: Object.freeze(dependencies),
                permissions: Object.freeze(asArray(source.permissions || source.Permissions).map(String)),
                settings: Object.freeze(settings),
                sourceUrl: source.sourceUrl ? String(source.sourceUrl) : null
            });
        }

        register(manifest, factory, options = {}) {
            if (typeof factory !== 'function') throw new TypeError('A plugin factory function is required.');
            const normalized = this.normalizeManifest({ ...manifest, sourceUrl: options.sourceUrl || manifest?.sourceUrl });
            const existing = this._entries.get(normalized.id);
            if (existing && !options.replace) {
                throw new Error(`Plugin "${normalized.id}" is already registered.`);
            }
            const entry = Object.freeze({ manifest: normalized, factory });
            this._entries.set(normalized.id, entry);
            window.dispatchEvent(new CustomEvent(existing ? 'sm:plugin-updated' : 'sm:plugin-registered', {
                detail: { id: normalized.id, manifest: normalized }
            }));
            return entry;
        }

        unregister(id) {
            const key = String(id);
            const removed = this._entries.delete(key);
            if (removed) window.dispatchEvent(new CustomEvent('sm:plugin-unregistered', { detail: { id: key } }));
            return removed;
        }

        get(id) { return this._entries.get(String(id)) || null; }
        has(id) { return this._entries.has(String(id)); }
        list() { return [...this._entries.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)); }
        categories() { return [...new Set(this.list().map((entry) => entry.manifest.category))].sort(); }
    }

    window.SMPluginRegistryClass = SMPluginRegistry;
    window.SMPluginRegistry = window.SMPluginRegistry || new SMPluginRegistry();
})();
