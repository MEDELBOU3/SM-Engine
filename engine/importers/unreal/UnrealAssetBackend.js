/**
 * SM ENGINE — UNREAL ASSET BACKEND
 *
 * Communicates with the local SM.UnrealBridge service over HTTP
 * (or fallback desktop native bridge).
 *
 * Does NOT require Unreal Engine.
 */
(function () {
    'use strict';

    class UnrealAssetBackend {
        constructor(options = {}) {
            this.options = options;
            this.baseUrl = options.baseUrl || 'http://127.0.0.1:8765';
            this.token = options.token || null;
            this.isHealthy = false;
            this.lastHealthCheck = 0;
            this.bridge = options.bridge || window.SMUnrealNativeBridge || null;
        }

        setBridge(bridge) {
            this.bridge = bridge;
            return this;
        }

        async health() {
            try {
                const response = await fetch(`${this.baseUrl}/health`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.ok) {
                        this.isHealthy = true;
                        this.lastHealthCheck = Date.now();
                        if (data.token) {
                            this.token = data.token;
                        }
                        return data;
                    }
                }
            } catch (err) {
                this.isHealthy = false;
            }

            return {
                ok: false,
                status: 'bridge-offline',
                message: 'SM.UnrealBridge service is not responding on ' + this.baseUrl
            };
        }

        async isAvailable() {
            if (this.bridge && (typeof this.bridge.parseAsset === 'function' || typeof this.bridge.importAsset === 'function')) {
                return true;
            }

            if (this.isHealthy && (Date.now() - this.lastHealthCheck < 30000)) {
                return true;
            }

            const h = await this.health();
            return !!(h && h.ok);
        }

        _getFilePath(file) {
            if (!file) return '';
            if (typeof file === 'string') return file;
            if (file.path) return file.path;
            if (window.electronAPI?.getPathForFile) {
                try {
                    const p = window.electronAPI.getPathForFile(file);
                    if (p) return p;
                } catch (_) {}
            }
            return file.name || '';
        }

        async _post(endpoint, payload) {
            if (!this.token) {
                await this.health();
            }

            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            if (this.token) {
                headers['X-Bridge-Token'] = this.token;
                payload.token = this.token;
            }

            try {
                const res = await fetch(`${this.baseUrl}${endpoint}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                return data;
            } catch (error) {
                return {
                    ok: false,
                    status: 'connection-error',
                    message: `Failed to communicate with bridge at ${endpoint}: ${error.message || error}`,
                    diagnostics: [{
                        code: 'BRIDGE_COMMUNICATION_ERROR',
                        title: 'Bridge Connection Error',
                        message: `Could not reach ${this.baseUrl}${endpoint}.`,
                        suggestion: 'Verify SM.UnrealBridge.exe is running.'
                    }]
                };
            }
        }

        async inspect(file, options = {}) {
            if (!file) throw new Error('UnrealAssetBackend.inspect: file is required.');

            if (this.bridge && typeof this.bridge.inspectAsset === 'function') {
                return this.bridge.inspectAsset(file);
            }

            const filePath = this._getFilePath(file);
            const payload = {
                action: 'inspect',
                file: filePath,
                root: options.root || null,
                game: options.game || null,
                options
            };

            const result = await this._post('/inspect', payload);
            return this._normalize(result, file);
        }

        async parse(file, options = {}) {
            if (!file) throw new Error('UnrealAssetBackend.parse: file is required.');

            if (this.bridge && typeof this.bridge.parseAsset === 'function') {
                return this.bridge.parseAsset(file, options);
            }

            const filePath = this._getFilePath(file);
            const payload = {
                action: 'parse',
                file: filePath,
                root: options.root || null,
                game: options.game || null,
                options
            };

            const result = await this._post('/parse', payload);
            return this._normalize(result, file);
        }

        async import(file, options = {}) {
            if (!file) throw new Error('UnrealAssetBackend.import: file is required.');

            if (this.bridge && typeof this.bridge.importAsset === 'function') {
                return this.bridge.importAsset(file, options);
            }

            const filePath = this._getFilePath(file);
            const payload = {
                action: 'import',
                file: filePath,
                root: options.root || null,
                game: options.game || null,
                assetType: options.assetType || 'auto',
                options
            };

            const result = await this._post('/import', payload);
            return this._normalize(result, file);
        }

        async dependencies(file, options = {}) {
            if (!file) throw new Error('UnrealAssetBackend.dependencies: file is required.');

            const filePath = this._getFilePath(file);
            const payload = {
                action: 'dependencies',
                file: filePath,
                root: options.root || null,
                game: options.game || null,
                options
            };

            const result = await this._post('/dependencies', payload);
            return this._normalize(result, file);
        }

        async downloadGlb(glbPath) {
            if (!glbPath) throw new Error('UnrealAssetBackend.downloadGlb: glbPath is required.');

            const url = `${this.baseUrl}/download?file=${encodeURIComponent(glbPath)}`;
            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) {
                throw new Error(`Failed to download GLB binary from ${url} (status ${res.status}).`);
            }

            return await res.arrayBuffer();
        }

        _normalize(result, file) {
            if (!result) {
                return {
                    ok: false,
                    status: 'empty-response',
                    message: 'Bridge returned an empty response.',
                    sourceFile: file?.name || ''
                };
            }

            return {
                ...result,
                ok: result.ok !== false,
                sourceFile: file?.name || '',
                metadata: {
                    ...(result.metadata || {}),
                    sourceEngine: 'Unreal Engine',
                    smBackend: 'CUE4Parse'
                }
            };
        }
    }

    window.SMUnrealAssetBackend = window.SMUnrealAssetBackend || new UnrealAssetBackend();
    window.UnrealAssetBackend = UnrealAssetBackend;
})();