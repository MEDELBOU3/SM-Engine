(function () {
    'use strict';
    class BuildProgressPanel {
        constructor() {
            this.root = null;
            this.bar = null;
            this.label = null;
            this.percent = null;
            this.status = null;
            this.progress = 0;
            this.stage = 'idle';
            this._unbind = [];
        }
        mount(container) {
            if (!container) throw new Error('BuildProgressPanel.mount(container) requires a container.');
            this.root = document.createElement('section');
            this.root.className = 'sm-build-progress-panel';
            this.root.innerHTML = '<div class="sm-build-progress-meta"><span class="sm-build-progress-label">Idle</span><span class="sm-build-progress-percent">0%</span></div><div class="sm-build-progress-track"><div class="sm-build-progress-bar"></div></div><div class="sm-build-progress-status">Ready</div>';
            container.appendChild(this.root);
            this.bar = this.root.querySelector('.sm-build-progress-bar');
            this.label = this.root.querySelector('.sm-build-progress-label');
            this.percent = this.root.querySelector('.sm-build-progress-percent');
            this.status = this.root.querySelector('.sm-build-progress-status');
            this.set(0, 'idle', 'Ready');
            return this.root;
        }
        bind(buildManager = window.SMBuildManager, gameExporter = window.SMGameExporter) {
            this.unbind();
            if (buildManager?.on) {
                this._unbind.push(buildManager.on('build-started', () => this.set(1, 'build', 'Preparing build…')));
                this._unbind.push(buildManager.on('progress', payload => this.set(payload.progress, payload.stage, this._stageLabel(payload.stage))));
                this._unbind.push(buildManager.on('build-completed', () => this.set(100, 'complete', 'Build completed.')));
                this._unbind.push(buildManager.on('build-failed', payload => this.set(this.progress, 'error', payload.error?.message || 'Build failed.')));
            }
            if (gameExporter?.on) {
                this._unbind.push(gameExporter.on('progress', payload => this.set(payload.progress, payload.stage, this._stageLabel(payload.stage, payload.target))));
                this._unbind.push(gameExporter.on('completed', payload => this.set(100, 'complete', `${String(payload.target || 'Game').toUpperCase()} export completed.`)));
                this._unbind.push(gameExporter.on('error', payload => this.set(this.progress, 'error', payload.error?.message || 'Export failed.')));
            }
            return this;
        }
        unbind() {
            for (const off of this._unbind) try { off?.(); } catch { }
            this._unbind.length = 0;
        }
        set(progress, stage = 'working', status = null) {
            this.progress = Math.max(0, Math.min(100, Number(progress) || 0));
            this.stage = String(stage || 'working');
            if (this.bar) this.bar.style.width = `${this.progress}%`;
            if (this.label) this.label.textContent = this._stageLabel(this.stage);
            if (this.percent) this.percent.textContent = `${Math.round(this.progress)}%`;
            if (this.status) this.status.textContent = status || this._stageLabel(this.stage);
            if (this.root) this.root.dataset.stage = this.stage;
            return this.progress;
        }
        _stageLabel(stage, target = null) {
            const map = { idle: 'Idle', prepare: 'Preparing', scan: 'Scanning Dependencies', validate: 'Validating', cook: 'Cooking Assets', serialize: 'Serializing Content', manifest: 'Generating Manifest', package: 'Packaging', build: 'Building', export: `Exporting${target ? ` ${String(target).toUpperCase()}` : ''}`, finalize: 'Finalizing', complete: 'Complete', error: 'Error', cancelled: 'Cancelled' };
            return map[String(stage)] || String(stage || 'Working');
        }
        debug() {
            const state = { progress: this.progress, stage: this.stage, mounted: !!this.root };
            console.log('[BuildProgressPanel]', state);
            return state;
        }
    }
    window.BuildProgressPanel = BuildProgressPanel;
    window.BuildProgressPanelClass = BuildProgressPanel;
})();