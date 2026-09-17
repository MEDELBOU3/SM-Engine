(function () {
    'use strict';
    class BuildPanel {
        constructor(options = {}) {
            this.options = { width: 980, height: 650, ...options };
            this.root = null;
            this.window = null;
            this.settingsPanel = null;
            this.outputPanel = null;
            this.progressPanel = null;
            this.visible = false;
            this.busy = false;
            this._drag = null;
            this._injectStyles();
        }
        open() {
            if (!this.root) this._create();
            this.root.style.display = 'block';
            this.visible = true;
            this.settingsPanel.refresh();
            this.outputPanel.log('info', 'Build workspace ready.');
            this._focus();
            return this;
        }
        close() {
            if (this.root) this.root.style.display = 'none';
            this.visible = false;
            return true;
        }
        toggle() {
            return this.visible ? this.close() : this.open();
        }
        async validate() {
            if (this.busy) return null;
            this.settingsPanel.commit();
            this.outputPanel.log('info', 'Validating project…');
            try {
                const result = await window.SMBuildManager.validate();
                if (result.errors.length) for (const error of result.errors) this.outputPanel.log('error', error.message || error);
                if (result.warnings.length) for (const warning of result.warnings) this.outputPanel.log('warn', warning.message || warning);
                if (result.ok) this.outputPanel.log('success', `Validation passed with ${result.warnings.length} warning(s).`);
                return result;
            } catch (error) {
                this.outputPanel.log('error', error.message || String(error));
                throw error;
            }
        }
        async build() {
            return await this._run('build', async () => {
                this.settingsPanel.commit();
                this.outputPanel.log('info', 'Starting content build…');
                const result = await window.SMBuildManager.build({ allowValidationErrors: false, failFast: true });
                this.outputPanel.log('success', `Build ${result.buildId} completed.`);
                return result;
            });
        }
        async exportWeb() {
            return await this._run('web', async () => {
                this.settingsPanel.commit();
                window.SMBuildManager.updateConfig({ target: 'web' });
                this.outputPanel.log('info', 'Starting Web export…');
                const result = await window.SMGameExporter.exportWeb({ allowValidationErrors: false });
                this.outputPanel.log('success', `Web package ready: ${result.package?.name || 'package'}`);
                return result;
            });
        }
        async exportElectron() {
            return await this._run('electron', async () => {
                this.settingsPanel.commit();
                window.SMBuildManager.updateConfig({ target: 'electron' });
                this.outputPanel.log('info', 'Generating Electron project…');
                const result = await window.SMGameExporter.exportElectron({ allowValidationErrors: false });
                this.outputPanel.log('success', `Electron project ready: ${result.package?.name || 'package'}`);
                return result;
            });
        }
        async download() {
            try {
                if (window.SMGameExporter?.lastExport) return await window.SMGameExporter.download();
                if (window.SMBuildManager?.getLastBuild?.()) return await window.SMBuildManager.downloadLastBuild();
                this.outputPanel.log('warn', 'Nothing has been built or exported yet.');
                return null;
            } catch (error) {
                this.outputPanel.log('error', error.message || String(error));
                throw error;
            }
        }
        cancel() {
            window.SMGameExporter?.cancel?.('build-panel-cancel');
            window.SMBuildManager?.cancel?.('build-panel-cancel');
            this.outputPanel.log('warn', 'Build/export cancellation requested.');
        }
        _create() {
            this.root = document.createElement('div');
            this.root.id = 'sm-build-panel-root';
            this.root.className = 'sm-build-panel-overlay';
            this.root.innerHTML = '<div class="sm-build-window" role="dialog" aria-modal="false" aria-label="Build Project"><header class="sm-build-titlebar"><div class="sm-build-title"><strong>Build Project</strong><span>Build, cook and export standalone game packages</span></div><div class="sm-build-window-actions"><button type="button" data-action="close" title="Close">×</button></div></header><div class="sm-build-toolbar"><button type="button" data-action="validate">Validate</button><button type="button" data-action="build">Build</button><button type="button" data-action="web" class="is-primary">Export Web</button><button type="button" data-action="electron">Export Electron</button><span class="sm-build-toolbar-spacer"></span><button type="button" data-action="download">Download Last</button><button type="button" data-action="cancel">Cancel</button></div><main class="sm-build-main"><div class="sm-build-settings-host"></div><div class="sm-build-output-host"></div></main><footer class="sm-build-progress-host"></footer></div>';
            document.body.appendChild(this.root);
            this.window = this.root.querySelector('.sm-build-window');
            this.settingsPanel = new window.BuildSettingsPanel({ manager: window.SMBuildManager });
            this.outputPanel = new window.BuildOutputPanel();
            this.progressPanel = new window.BuildProgressPanel();
            this.settingsPanel.mount(this.root.querySelector('.sm-build-settings-host'));
            this.outputPanel.mount(this.root.querySelector('.sm-build-output-host'));
            this.progressPanel.mount(this.root.querySelector('.sm-build-progress-host'));
            this.outputPanel.bind(window.SMBuildManager, window.SMGameExporter);
            this.progressPanel.bind(window.SMBuildManager, window.SMGameExporter);
            this.root.addEventListener('mousedown', () => this._focus());
            this.root.addEventListener('click', event => this._handleAction(event));
            this._installDrag();
            return this.root;
        }
        _handleAction(event) {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            if (action === 'close') this.close();
            else if (action === 'validate') this.validate();
            else if (action === 'build') this.build();
            else if (action === 'web') this.exportWeb();
            else if (action === 'electron') this.exportElectron();
            else if (action === 'download') this.download();
            else if (action === 'cancel') this.cancel();
        }
        async _run(kind, operation) {
            if (this.busy) {
                this.outputPanel.log('warn', 'Another build/export operation is already running.');
                return null;
            }
            this.busy = true;
            this._setButtonsDisabled(true);
            try { return await operation(); }
            catch (error) {
                this.outputPanel.log('error', `${kind} failed: ${error?.message || error}`);
                return null;
            } finally {
                this.busy = false;
                this._setButtonsDisabled(false);
            }
        }
        _setButtonsDisabled(disabled) {
            for (const button of this.root?.querySelectorAll('.sm-build-toolbar button') || []) {
                if (button.dataset.action === 'cancel' || button.dataset.action === 'close') continue;
                button.disabled = Boolean(disabled);
            }
        }
        _focus() {
            if (!this.root) return;
            BuildPanel._z = (BuildPanel._z || 3000) + 1;
            this.root.style.zIndex = String(BuildPanel._z);
        }
        _installDrag() {
            const bar = this.root.querySelector('.sm-build-titlebar');
            bar.addEventListener('pointerdown', event => {
                if (event.target.closest('button')) return;
                const rect = this.window.getBoundingClientRect();
                this._drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
                this.window.style.transform = 'none';
                this.window.style.left = `${rect.left}px`;
                this.window.style.top = `${rect.top}px`;
                bar.setPointerCapture?.(event.pointerId);
            });
            bar.addEventListener('pointermove', event => {
                if (!this._drag) return;
                const left = Math.max(0, Math.min(window.innerWidth - 180, this._drag.left + event.clientX - this._drag.x));
                const top = Math.max(0, Math.min(window.innerHeight - 40, this._drag.top + event.clientY - this._drag.y));
                this.window.style.left = `${left}px`;
                this.window.style.top = `${top}px`;
            });
            const end = () => { this._drag = null; };
            bar.addEventListener('pointerup', end);
            bar.addEventListener('pointercancel', end);
        }
        _injectStyles() {
            if (document.getElementById('sm-build-panel-styles')) return;
            const style = document.createElement('style');
            style.id = 'sm-build-panel-styles';
            style.textContent = `:root{--sm-build-bg:var(--panel-bg,#333);--sm-build-surface:var(--secondary-dark,#3c3c3c);--sm-build-soft:#414141;--sm-build-deep:#292929;--sm-build-border:rgba(255,255,255,.09);--sm-build-text:var(--text-primary,#fff);--sm-build-muted:var(--text-secondary,#b0b0b0);--sm-build-accent:#d48b43}.sm-build-panel-overlay{position:fixed;inset:0;z-index:3000;display:none;pointer-events:none}.sm-build-window{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(980px,calc(100vw - 48px));height:min(650px,calc(100vh - 48px));display:grid;grid-template-rows:48px 40px minmax(0,1fr) 66px;background:var(--sm-build-bg);color:var(--sm-build-text);box-shadow:0 18px 60px rgba(0,0,0,.42);border:1px solid var(--sm-build-border);pointer-events:auto;resize:both;overflow:hidden;min-width:720px;min-height:480px}.sm-build-titlebar{display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 15px;background:var(--sm-build-surface);border-bottom:1px solid var(--sm-build-border);user-select:none;cursor:move}.sm-build-title{display:flex;align-items:baseline;gap:10px;min-width:0}.sm-build-title strong{font:600 13px/1.2 Inter,Segoe UI,sans-serif}.sm-build-title span{font:400 11px/1.2 Inter,Segoe UI,sans-serif;color:var(--sm-build-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-build-window button,.sm-build-window input,.sm-build-window select{font:12px Inter,Segoe UI,sans-serif}.sm-build-window button{border:0;border-radius:0;background:#474747;color:#eee;min-height:26px;padding:0 10px;cursor:pointer}.sm-build-window button:hover{background:#535353}.sm-build-window button:disabled{opacity:.45;cursor:default}.sm-build-window button.is-primary{background:#68513b;color:#fff}.sm-build-window button.is-primary:hover{background:#775b40}.sm-build-window-actions button{width:28px;padding:0;font-size:18px;background:transparent}.sm-build-toolbar{display:flex;align-items:center;gap:6px;padding:6px 9px;background:#363636;border-bottom:1px solid var(--sm-build-border)}.sm-build-toolbar-spacer{flex:1}.sm-build-main{display:grid;grid-template-columns:minmax(300px,36%) minmax(0,1fr);min-height:0}.sm-build-settings-host{min-width:0;overflow:auto;background:#343434;border-right:1px solid var(--sm-build-border)}.sm-build-output-host{min-width:0;overflow:hidden;background:#2f2f2f}.sm-build-section-header{height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;background:#3b3b3b;border-bottom:1px solid var(--sm-build-border);font:600 11px Inter,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.04em;color:#d7d7d7}.sm-build-inline-actions{display:flex;gap:4px}.sm-build-inline-actions button{min-height:22px;padding:0 7px;font-size:10px}.sm-build-settings-body{padding:11px}.sm-build-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.sm-build-field{display:flex;flex-direction:column;gap:5px}.sm-build-field-wide{grid-column:1/-1}.sm-build-field>span{font-size:11px;color:var(--sm-build-muted)}.sm-build-field input,.sm-build-field select{height:28px;border:1px solid var(--sm-build-border);border-radius:0;background:#292929;color:#eee;padding:0 8px;outline:0}.sm-build-field input:focus,.sm-build-field select:focus{border-color:rgba(212,139,67,.65)}.sm-build-settings-group{margin-top:14px;padding-top:10px;border-top:1px solid var(--sm-build-border)}.sm-build-settings-title{margin-bottom:8px;font-size:11px;font-weight:600;color:#ddd;text-transform:uppercase;letter-spacing:.04em}.sm-build-check{display:flex;align-items:center;gap:8px;min-height:26px;font-size:11px;color:#d2d2d2}.sm-build-check input{accent-color:var(--sm-build-accent)}.sm-build-output-panel{display:grid;grid-template-rows:34px minmax(0,1fr);height:100%}.sm-build-output-list{overflow:auto;padding:5px 0;font:11px/1.5 Consolas,Monaco,monospace}.sm-build-log-row{display:grid;grid-template-columns:72px 58px minmax(0,1fr);gap:5px;padding:3px 9px;color:#c9c9c9}.sm-build-log-row:hover{background:rgba(255,255,255,.025)}.sm-build-log-time{color:#777}.sm-build-log-level{color:#999}.sm-build-log-row.is-error .sm-build-log-level,.sm-build-log-row.is-error .sm-build-log-message{color:#e38c8c}.sm-build-log-row.is-warn .sm-build-log-level{color:#d9ad65}.sm-build-log-row.is-success .sm-build-log-level{color:#8fbe8f}.sm-build-progress-host{background:#323232;border-top:1px solid var(--sm-build-border)}.sm-build-progress-panel{height:100%;display:grid;grid-template-rows:22px 4px 20px;align-content:center;padding:7px 12px;box-sizing:border-box}.sm-build-progress-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#d2d2d2}.sm-build-progress-track{height:4px;background:#252525;overflow:hidden}.sm-build-progress-bar{height:100%;width:0;background:var(--sm-build-accent);transition:width .12s linear}.sm-build-progress-status{padding-top:4px;font-size:10px;color:#929292;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:760px){.sm-build-window{min-width:0;width:calc(100vw - 16px);height:calc(100vh - 16px)}.sm-build-main{grid-template-columns:1fr}.sm-build-output-host{display:none}.sm-build-title span{display:none}}`;
            document.head.appendChild(style);
        }
        debug() {
            const state = { visible: this.visible, busy: this.busy, mounted: !!this.root, settings: this.settingsPanel?.debug?.(), progress: this.progressPanel?.debug?.() };
            console.log('[BuildPanel]', state);
            return state;
        }
    }
    const panel = new BuildPanel();
    window.BuildPanelClass = BuildPanel;
    window.BuildPanel = panel;
    window.smBuildPanel = panel;
    window.openBuildPanel = () => panel.open();
    window.closeBuildPanel = () => panel.close();
    window.toggleBuildPanel = () => panel.toggle();
})();