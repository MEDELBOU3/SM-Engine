(function () {
    'use strict';
    class SMGameExporter {
        constructor(options = {}) {
            this.pipeline = options.pipeline || new window.SMExportPipeline({ buildManager: options.buildManager || window.SMBuildManager });
            this.lastExport = null;
            this.history = [];
            this.maxHistory = Math.max(1, Number(options.maxHistory || 10));
            this.listeners = new Map();
            this._wire();
        }
        registerTarget(target) {
            return this.pipeline.registerTarget(target);
        }
        getTarget(id) {
            return this.pipeline.getTarget(id);
        }
        listTargets() {
            return this.pipeline.listTargets();
        }
        on(event, handler) {
            if (typeof handler !== 'function') throw new TypeError('SMGameExporter.on(event, handler) expects a function.');
            const key = String(event);
            if (!this.listeners.has(key)) this.listeners.set(key, new Set());
            this.listeners.get(key).add(handler);
            return () => this.listeners.get(key)?.delete(handler);
        }
        async export(target = 'web', options = {}) {
            const result = await this.pipeline.export(target, options);
            this.lastExport = result;
            this.history.unshift({ target: result.target, buildId: result.buildResult?.buildId || null, createdAt: Date.now(), filename: result.package?.name || null, size: result.package?.size || 0, warnings: result.warnings?.length || 0 });
            if (this.history.length > this.maxHistory) this.history.length = this.maxHistory;
            this._emit('completed', result);
            return result;
        }
        async exportWeb(options = {}) {
            return await this.export('web', options);
        }
        async exportElectron(options = {}) {
            return await this.export('electron', options);
        }
        cancel(reason = 'user-cancelled') {
            return this.pipeline.cancel(reason);
        }
        async download(result = this.lastExport, filename = null) {
            if (!result) throw new Error('No exported game package is available.');
            let blob = result.package?.blob || null;
            const name = filename || result.package?.name || `SM-Game-${result.target}.zip`;
            if (!blob && result.bundle && window.JSZip) blob = await result.bundle.toZip();
            if (!blob) throw new Error('Export result does not contain a downloadable ZIP blob.');
            if (window.saveAs) {
                window.saveAs(blob, name);
                return { name, blob };
            }
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = name;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return { name, blob };
        }
        getHistory() {
            return this.history.map(item => ({ ...item }));
        }
        _wire() {
            for (const event of ['progress', 'cancel', 'complete', 'error']) this.pipeline.on(event, payload => this._emit(event, payload));
        }
        _emit(event, payload) {
            for (const handler of this.listeners.get(String(event)) || []) {
                try { handler(payload); } catch (error) { console.error(`[SMGameExporter] Listener "${event}" failed.`, error); }
            }
            window.dispatchEvent(new CustomEvent(`sm:game-exporter-${event}`, { detail: payload }));
        }
        debug() {
            const state = { lastExport: this.lastExport?.target || null, history: this.history.length, targets: this.listTargets().map(target => target.id), pipeline: this.pipeline.debug() };
            console.log('[SMGameExporter]', state);
            return state;
        }
    }
    const exporter = new SMGameExporter();
    window.SMGameExporterClass = SMGameExporter;
    window.SMGameExporter = exporter;
    window.smGameExporter = exporter;
})();