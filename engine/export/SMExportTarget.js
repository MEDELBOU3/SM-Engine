(function () {
    'use strict';
    class SMExportTarget {
        constructor(options = {}) {
            this.id = String(options.id || 'target');
            this.name = String(options.name || this.id);
            this.description = String(options.description || '');
            this.extension = String(options.extension || '.zip');
            this.capabilities = { standalone: true, zip: true, offline: false, ...(options.capabilities || {}) };
            this.metadata = { ...(options.metadata || {}) };
        }
        supports(feature) {
            return Boolean(this.capabilities[String(feature)]);
        }
        async validate(buildResult, options = {}) {
            const errors = [];
            const warnings = [];
            if (!buildResult?.bundle) errors.push('Export requires a completed SM Build result with a bundle.');
            if (!buildResult?.manifest) warnings.push('Build result has no SMBuildManifest instance.');
            if (buildResult?.config?.target && buildResult.config.target !== this.id && options.allowTargetMismatch !== true) warnings.push(`Build target "${buildResult.config.target}" differs from exporter "${this.id}".`);
            return { ok: errors.length === 0, errors, warnings };
        }
        async export() {
            throw new Error(`${this.constructor.name}.export() must be implemented by the target.`);
        }
        getDefaultFilename(buildResult) {
            const config = buildResult?.config;
            const name = String(config?.name || 'SM-Game').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'SM-Game';
            const version = String(config?.version || '1.0.0');
            return `${name}-${version}-${this.id}${this.extension}`;
        }
        debug() {
            const state = { id: this.id, name: this.name, description: this.description, extension: this.extension, capabilities: { ...this.capabilities } };
            console.log('[SMExportTarget]', state);
            return state;
        }
    }
    window.SMExportTarget = SMExportTarget;
    window.SMExportTargetClass = SMExportTarget;
})();