(function () {
    'use strict';
    class BuildOutputPanel {
        constructor(options = {}) {
            this.maxEntries = Math.max(50, Number(options.maxEntries || 600));
            this.entries = [];
            this.root = null;
            this.list = null;
            this._unbind = [];
            this.autoScroll = true;
        }
        mount(container) {
            if (!container) throw new Error('BuildOutputPanel.mount(container) requires a container.');
            this.root = document.createElement('section');
            this.root.className = 'sm-build-output-panel';
            this.root.innerHTML = '<div class="sm-build-section-header"><span>Build Output</span><div class="sm-build-inline-actions"><button type="button" data-action="copy">Copy</button><button type="button" data-action="clear">Clear</button></div></div><div class="sm-build-output-list" role="log" aria-live="polite"></div>';
            container.appendChild(this.root);
            this.list = this.root.querySelector('.sm-build-output-list');
            this.root.addEventListener('click', event => {
                const action = event.target.closest('[data-action]')?.dataset.action;
                if (action === 'clear') this.clear();
                if (action === 'copy') this.copy();
            });
            this.render();
            return this.root;
        }
        bind(buildManager = window.SMBuildManager, gameExporter = window.SMGameExporter) {
            this.unbind();
            if (buildManager?.on) {
                this._unbind.push(buildManager.on('build-started', payload => this.log('info', `Build started: ${payload.config?.name || 'Game'}`)));
                this._unbind.push(buildManager.on('stage', payload => this.log('info', `Build stage: ${payload.stage}`)));
                this._unbind.push(buildManager.on('build-completed', payload => this.log('success', `Build complete: ${payload.buildId}`)));
                this._unbind.push(buildManager.on('build-failed', payload => this.log('error', payload.error?.message || 'Build failed.')));
            }
            if (gameExporter?.on) {
                this._unbind.push(gameExporter.on('progress', payload => { if (payload.stage === 'export') this.log('info', `Exporting ${payload.target || ''}`.trim()); }));
                this._unbind.push(gameExporter.on('completed', payload => this.log('success', `${String(payload.target || 'game').toUpperCase()} export complete: ${payload.package?.name || ''}`)));
                this._unbind.push(gameExporter.on('error', payload => this.log('error', payload.error?.message || 'Export failed.')));
            }
            return this;
        }
        unbind() {
            for (const off of this._unbind) try { off?.(); } catch { }
            this._unbind.length = 0;
        }
        log(level, message, metadata = {}) {
            const entry = { id: `build-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time: new Date(), level: this._normalizeLevel(level), message: String(message ?? ''), metadata: { ...(metadata || {}) } };
            this.entries.push(entry);
            if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
            this._append(entry);
            return entry;
        }
        clear() {
            this.entries.length = 0;
            if (this.list) this.list.innerHTML = '';
            return true;
        }
        async copy() {
            const text = this.entries.map(entry => `[${entry.time.toLocaleTimeString()}] [${entry.level.toUpperCase()}] ${entry.message}`).join('\n');
            try { await navigator.clipboard.writeText(text); this.log('info', 'Build output copied to clipboard.'); return true; } catch { return false; }
        }
        render() {
            if (!this.list) return;
            this.list.innerHTML = '';
            for (const entry of this.entries) this._append(entry);
        }
        _append(entry) {
            if (!this.list) return;
            const row = document.createElement('div');
            row.className = `sm-build-log-row is-${entry.level}`;
            row.innerHTML = `<span class="sm-build-log-time">${this._escape(entry.time.toLocaleTimeString())}</span><span class="sm-build-log-level">${this._escape(entry.level.toUpperCase())}</span><span class="sm-build-log-message">${this._escape(entry.message)}</span>`;
            this.list.appendChild(row);
            if (this.autoScroll) this.list.scrollTop = this.list.scrollHeight;
        }
        _normalizeLevel(level) {
            const value = String(level || 'info').toLowerCase();
            if (['success', 'error', 'warn', 'warning', 'debug', 'info'].includes(value)) return value === 'warning' ? 'warn' : value;
            return 'info';
        }
        _escape(value) {
            return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        debug() {
            const state = { entries: this.entries.length, maxEntries: this.maxEntries, mounted: !!this.root };
            console.log('[BuildOutputPanel]', state);
            return state;
        }
    }
    window.BuildOutputPanel = BuildOutputPanel;
    window.BuildOutputPanelClass = BuildOutputPanel;
})();