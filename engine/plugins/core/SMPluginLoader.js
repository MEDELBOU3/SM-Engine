(function () {
    'use strict';

    class SMPluginLoader {
        constructor({ registry = window.SMPluginRegistry } = {}) {
            this.registry = registry;
            this.loadedScripts = new Set();
            this.loadedPackages = new Map();
        }

        resolveUrl(value, baseUrl = window.location.href) {
            return new URL(String(value), baseUrl).href;
        }

        async fetchJson(url) {
            let fetchError = null;
            if (typeof window.fetch === 'function') {
                try {
                    const response = await window.fetch(url, { cache: 'no-store' });
                    if (response.ok) return response.json();
                    fetchError = new Error(`Request failed (${response.status}) for ${url}`);
                } catch (error) {
                    fetchError = error;
                }
            }

            // Electron/file:// deployments can reject fetch() for local JSON.
            // XHR uses the renderer's local-resource policy and keeps packaged
            // built-in manifests usable in those deployments.
            const XHR = window.XMLHttpRequest;
            if (typeof XHR !== 'function') throw fetchError || new Error(`No JSON transport is available for ${url}`);
            return new Promise((resolve, reject) => {
                const request = new XHR();
                request.open('GET', url, true);
                request.onload = () => {
                    const accepted = (request.status >= 200 && request.status < 300) || (request.status === 0 && request.responseText);
                    if (!accepted) {
                        reject(fetchError || new Error(`Request failed (${request.status}) for ${url}`));
                        return;
                    }
                    try { resolve(JSON.parse(request.responseText)); } catch (error) { reject(error); }
                };
                request.onerror = () => reject(fetchError || new Error(`Could not load ${url}`));
                request.send();
            });
        }

        loadScript(url) {
            const absoluteUrl = this.resolveUrl(url);
            if (this.loadedScripts.has(absoluteUrl)) return Promise.resolve(absoluteUrl);
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = absoluteUrl;
                script.async = false;
                script.dataset.smPluginScript = 'true';
                script.onload = () => {
                    this.loadedScripts.add(absoluteUrl);
                    resolve(absoluteUrl);
                };
                script.onerror = () => reject(new Error(`Could not load plugin script ${absoluteUrl}`));
                (document.head || document.body || document.documentElement).appendChild(script);
            });
        }

        _scriptEntries(manifest) {
            const explicit = manifest.scripts || manifest.Scripts || manifest.script || manifest.Script;
            if (Array.isArray(explicit)) return explicit;
            if (explicit) return [explicit];
            return (manifest.modules || manifest.Modules || [])
                .map((module) => module.entry || module.Entry || module.script || module.Script)
                .filter(Boolean);
        }

        async loadPackage(manifestUrl) {
            const absoluteManifestUrl = this.resolveUrl(manifestUrl);
            if (this.loadedPackages.has(absoluteManifestUrl)) return this.loadedPackages.get(absoluteManifestUrl);

            const task = (async () => {
                const rawManifest = await this.fetchJson(absoluteManifestUrl);
                const manifest = this.registry.normalizeManifest({ ...rawManifest, sourceUrl: absoluteManifestUrl });
                if (this.registry.has(manifest.id)) return this.registry.get(manifest.id);

                const scripts = this._scriptEntries(rawManifest);
                if (!scripts.length) throw new Error(`Plugin "${manifest.id}" has no script entry. Add "Scripts" to its manifest.`);
                for (const script of scripts) await this.loadScript(this.resolveUrl(script, absoluteManifestUrl));

                const entry = this.registry.get(manifest.id);
                if (!entry) throw new Error(`Plugin "${manifest.id}" loaded its script but did not call SMPluginRegistry.register(...).`);
                return entry;
            })();

            this.loadedPackages.set(absoluteManifestUrl, task);
            try {
                return await task;
            } catch (error) {
                this.loadedPackages.delete(absoluteManifestUrl);
                throw error;
            }
        }

        async loadCatalog(catalogUrl) {
            const absoluteCatalogUrl = this.resolveUrl(catalogUrl);
            const catalog = await this.fetchJson(absoluteCatalogUrl);
            const sourceEntries = Array.isArray(catalog) ? catalog : catalog.plugins || catalog.Plugins || [];
            if (!Array.isArray(sourceEntries)) throw new Error(`Plugin catalog ${absoluteCatalogUrl} must contain a plugins array.`);
            const results = [];
            for (const sourceEntry of sourceEntries) {
                const path = typeof sourceEntry === 'string'
                    ? sourceEntry
                    : sourceEntry?.manifest || sourceEntry?.Manifest || sourceEntry?.path || sourceEntry?.Path;
                if (!path) continue;
                try {
                    results.push({ ok: true, entry: await this.loadPackage(this.resolveUrl(path, absoluteCatalogUrl)) });
                } catch (error) {
                    console.error('[SMPluginLoader] Package load failed.', error);
                    results.push({ ok: false, path: String(path), error: error?.message || String(error) });
                }
            }
            window.dispatchEvent(new CustomEvent('sm:plugin-catalog-loaded', { detail: { url: absoluteCatalogUrl, results } }));
            return results;
        }
    }

    window.SMPluginLoaderClass = SMPluginLoader;
    window.SMPluginLoader = window.SMPluginLoader || new SMPluginLoader();
    window.smPluginLoader = window.SMPluginLoader;
})();
