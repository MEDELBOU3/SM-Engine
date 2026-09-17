(function () {
    'use strict';
    class SMExportPipeline {
        constructor(options = {}) {
            this.buildManager = options.buildManager || window.SMBuildManager || null;
            this.targets = new Map();
            this.listeners = new Map();
            this.running = false;
            this.cancelled = false;
            this.stage = 'idle';
            this.progress = 0;
            this.currentTarget = null;
            this.currentBuild = null;
            this.lastResult = null;
            this.registerTarget(options.webExporter || new window.SMWebExporter());
            this.registerTarget(options.electronExporter || new window.SMElectronExporter());
        }
        registerTarget(target) {
            if (!(target instanceof window.SMExportTarget)) throw new TypeError('SMExportPipeline.registerTarget() expects SMExportTarget.');
            this.targets.set(target.id, target);
            return target;
        }
        unregisterTarget(id) {
            return this.targets.delete(String(id));
        }
        getTarget(id) {
            return this.targets.get(String(id)) || null;
        }
        listTargets() {
            return Array.from(this.targets.values());
        }
        on(event, handler) {
            if (typeof handler !== 'function') throw new TypeError('SMExportPipeline.on(event, handler) expects a function.');
            const key = String(event);
            if (!this.listeners.has(key)) this.listeners.set(key, new Set());
            this.listeners.get(key).add(handler);
            return () => this.listeners.get(key)?.delete(handler);
        }
        cancel(reason = 'user-cancelled') {
            this.cancelled = true;
            this.buildManager?.cancel?.(reason);
            this._emit('cancel', { reason, stage: this.stage, target: this.currentTarget?.id || null });
            return true;
        }
        async export(targetId = 'web', options = {}) {
            if (this.running) throw new Error('An export is already running.');
            const target = this.getTarget(targetId);
            if (!target) throw new Error(`Unknown export target "${targetId}".`);
            this.running = true;
            this.cancelled = false;
            this.stage = 'prepare';
            this.progress = 0;
            this.currentTarget = target;
            const startedAt = Date.now();
            try {
                this._progress(2, 'prepare');
                this._assertActive();
                let buildResult = options.buildResult || null;
                if (!buildResult) {
                    if (!this.buildManager) throw new Error('SMExportPipeline requires SMBuildManager when buildResult is not supplied.');
                    this.stage = 'build';
                    this._progress(8, 'build');
                    const current = this.buildManager.getConfig?.()?.toJSON?.() || {};
                    const packaging = { ...(current.packaging || {}), zip: false };
                    buildResult = await this.buildManager.build({ ...options.buildOptions, config: { ...(options.buildOptions?.config || {}), target: target.id, packaging }, allowValidationErrors: options.allowValidationErrors === true });
                }
                this.currentBuild = buildResult;
                this._assertActive();
                this.stage = 'export';
                this._progress(65, 'export');
                const result = await target.export(buildResult, options);
                this._assertActive();
                this.stage = 'finalize';
                this._progress(98, 'finalize');
                result.startedAt = startedAt;
                result.finishedAt = Date.now();
                result.durationMs = result.finishedAt - startedAt;
                this.lastResult = result;
                this.stage = 'complete';
                this._progress(100, 'complete');
                this._emit('complete', result);
                return result;
            } catch (error) {
                this._emit('error', { error, stage: this.stage, target: target.id, buildResult: this.currentBuild });
                throw error;
            } finally {
                this.running = false;
                if (this.stage !== 'complete') this.stage = this.cancelled ? 'cancelled' : 'idle';
                this.currentTarget = null;
            }
        }
        async exportWeb(options = {}) {
            return await this.export('web', options);
        }
        async exportElectron(options = {}) {
            return await this.export('electron', options);
        }
        _progress(value, stage = this.stage, detail = null) {
            this.progress = Math.max(0, Math.min(100, Number(value) || 0));
            this._emit('progress', { progress: this.progress, stage, target: this.currentTarget?.id || null, detail });
        }
        _emit(event, payload) {
            for (const handler of this.listeners.get(String(event)) || []) {
                try { handler(payload); } catch (error) { console.error(`[SMExportPipeline] Listener "${event}" failed.`, error); }
            }
            window.dispatchEvent(new CustomEvent(`sm:export-${event}`, { detail: payload }));
        }
        _assertActive() {
            if (this.cancelled) throw new Error('Export cancelled.');
        }
        debug() {
            const state = { running: this.running, cancelled: this.cancelled, stage: this.stage, progress: this.progress, currentTarget: this.currentTarget?.id || null, targets: Array.from(this.targets.keys()), lastResult: this.lastResult?.target || null };
            console.log('[SMExportPipeline]', state);
            return state;
        }
    }
    window.SMExportPipeline = SMExportPipeline;
    window.SMExportPipelineClass = SMExportPipeline;
})();