(function () {
    'use strict';
    class BuildSettingsPanel {
        constructor(options = {}) {
            this.manager = options.manager || window.SMBuildManager || null;
            this.root = null;
            this.form = null;
            this._changeHandler = event => this._onChange(event);
        }
        mount(container) {
            if (!container) throw new Error('BuildSettingsPanel.mount(container) requires a container.');
            this.root = document.createElement('section');
            this.root.className = 'sm-build-settings-panel';
            this.root.innerHTML = '<div class="sm-build-section-header"><span>Build Settings</span></div><div class="sm-build-settings-body"></div>';
            container.appendChild(this.root);
            this.form = this.root.querySelector('.sm-build-settings-body');
            this.render();
            this.form.addEventListener('change', this._changeHandler);
            this.form.addEventListener('input', event => { if (event.target.matches('input[type="text"],input[type="number"]')) this._debouncedCommit(); });
            return this.root;
        }
        render() {
            if (!this.form) return;
            const config = this.manager?.getConfig?.() || new window.SMBuildConfig();
            const levels = this._levels();
            const levelOptions = ['<option value="">Auto / None</option>', ...levels.map(level => `<option value="${this._escapeAttr(level.id)}"${String(config.startLevel || '') === String(level.id) ? ' selected' : ''}>${this._escape(level.name || level.id)}</option>`)].join('');
            this.form.innerHTML = `<div class="sm-build-settings-grid">
<label class="sm-build-field"><span>Game Name</span><input data-path="name" type="text" value="${this._escapeAttr(config.name)}"></label>
<label class="sm-build-field"><span>Version</span><input data-path="version" type="text" value="${this._escapeAttr(config.version)}"></label>
<label class="sm-build-field"><span>Target</span><select data-path="target"><option value="web"${config.target === 'web' ? ' selected' : ''}>Web</option><option value="electron"${config.target === 'electron' ? ' selected' : ''}>Electron</option></select></label>
<label class="sm-build-field"><span>Start Level</span><select data-path="startLevel">${levelOptions}</select></label>
<label class="sm-build-field"><span>Width</span><input data-path="resolution.width" type="number" min="1" step="1" value="${Number(config.resolution.width) || 1920}"></label>
<label class="sm-build-field"><span>Height</span><input data-path="resolution.height" type="number" min="1" step="1" value="${Number(config.resolution.height) || 1080}"></label>
<label class="sm-build-field sm-build-field-wide"><span>Output</span><input data-path="outputPath" type="text" value="${this._escapeAttr(config.outputPath)}"></label>
</div>
<div class="sm-build-settings-group"><div class="sm-build-settings-title">Runtime</div>
<label class="sm-build-check"><input data-path="fullscreen" type="checkbox"${config.fullscreen ? ' checked' : ''}><span>Fullscreen</span></label>
<label class="sm-build-check"><input data-path="development" type="checkbox"${config.development ? ' checked' : ''}><span>Development Build</span></label>
<label class="sm-build-check"><input data-path="runtime.includeDebug" type="checkbox"${config.runtime.includeDebug ? ' checked' : ''}><span>Include Runtime Debug</span></label>
<label class="sm-build-check"><input data-path="runtime.includeEditor" type="checkbox"${config.runtime.includeEditor ? ' checked' : ''}><span>Include Editor Systems</span></label>
<label class="sm-build-check"><input data-path="runtime.minify" type="checkbox"${config.runtime.minify ? ' checked' : ''}><span>Minify Runtime</span></label></div>
<div class="sm-build-settings-group"><div class="sm-build-settings-title">Assets</div>
<label class="sm-build-check"><input data-path="assets.removeUnused" type="checkbox"${config.assets.removeUnused ? ' checked' : ''}><span>Remove Unused Assets</span></label>
<label class="sm-build-check"><input data-path="assets.compress" type="checkbox"${config.assets.compress ? ' checked' : ''}><span>Compress Package</span></label>
<label class="sm-build-check"><input data-path="assets.useCache" type="checkbox"${config.assets.useCache ? ' checked' : ''}><span>Use Build Cache</span></label>
<label class="sm-build-check"><input data-path="assets.hashNames" type="checkbox"${config.assets.hashNames ? ' checked' : ''}><span>Hash Asset Names</span></label>
<label class="sm-build-check"><input data-path="assets.includeExternal" type="checkbox"${config.assets.includeExternal ? ' checked' : ''}><span>Include External References</span></label></div>
<div class="sm-build-settings-group"><div class="sm-build-settings-title">Package</div>
<label class="sm-build-check"><input data-path="packaging.zip" type="checkbox"${config.packaging.zip ? ' checked' : ''}><span>Create ZIP</span></label>
<label class="sm-build-check"><input data-path="packaging.generateManifest" type="checkbox"${config.packaging.generateManifest ? ' checked' : ''}><span>Generate Game Manifest</span></label>
<label class="sm-build-check"><input data-path="packaging.generateAssetManifest" type="checkbox"${config.packaging.generateAssetManifest ? ' checked' : ''}><span>Generate Asset Manifest</span></label></div>`;
        }
        collect() {
            const base = this.manager?.getConfig?.()?.toJSON?.() || new window.SMBuildConfig().toJSON();
            const result = this._clone(base);
            for (const input of this.form?.querySelectorAll('[data-path]') || []) {
                const path = input.dataset.path;
                let value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
                if (path === 'startLevel' && !value) value = null;
                this._setPath(result, path, value);
            }
            return result;
        }
        commit() {
            if (!this.manager) return null;
            const config = this.collect();
            this.manager.setConfig(config);
            window.dispatchEvent(new CustomEvent('sm:build-settings-changed', { detail: { panel: this, config: this.manager.getConfig() } }));
            return this.manager.getConfig();
        }
        refresh() {
            this.render();
        }
        _onChange() {
            this.commit();
        }
        _debouncedCommit() {
            clearTimeout(this._commitTimer);
            this._commitTimer = setTimeout(() => this.commit(), 180);
        }
        _levels() {
            const registry = window.SMLevelRegistry;
            const values = registry?.list?.() || [];
            return values.map(item => item?.level || item).filter(level => level?.id).sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
        }
        _setPath(target, path, value) {
            const parts = String(path).split('.');
            let current = target;
            for (let i = 0; i < parts.length - 1; i++) {
                const key = parts[i];
                if (!current[key] || typeof current[key] !== 'object') current[key] = {};
                current = current[key];
            }
            current[parts[parts.length - 1]] = value;
        }
        _clone(value) {
            try { return structuredClone(value); } catch { }
            return JSON.parse(JSON.stringify(value));
        }
        _escape(value) {
            return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        _escapeAttr(value) {
            return this._escape(value).replace(/'/g, '&#39;');
        }
        debug() {
            const state = { mounted: !!this.root, config: this.collect() };
            console.log('[BuildSettingsPanel]', state);
            return state;
        }
    }
    window.BuildSettingsPanel = BuildSettingsPanel;
    window.BuildSettingsPanelClass = BuildSettingsPanel;
})();