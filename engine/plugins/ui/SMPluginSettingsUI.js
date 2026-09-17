(function () {
    'use strict';

    class SMPluginSettingsUI {
        constructor() {
            this.root = null;
            this.search = '';
            this.category = 'all';
            this.expanded = new Set();
            this.busy = new Set();
            this._observer = null;
            this._eventsBound = false;
            this._renderQueued = false;
        }

        get manager() { return window.SMPluginManager || null; }
        get registry() { return window.SMPluginRegistry || null; }

        mountWhenReady() {
            if (this.mount()) return true;
            if (this._observer) return false;
            this._observer = new MutationObserver(() => {
                if (this.mount()) {
                    this._observer.disconnect();
                    this._observer = null;
                }
            });
            this._observer.observe(document.documentElement, { childList: true, subtree: true });
            return false;
        }

        mount() {
            const panel = window.settingsPanel?.panel || document.querySelector('#settings-window');
            const sidebar = panel?.querySelector('.settings-sidebar');
            const main = panel?.querySelector('.settings-main');
            if (!sidebar || !main) return false;

            let button = sidebar.querySelector('[data-settings-section="plugins"]');
            if (!button) {
                button = document.createElement('button');
                button.className = 'settings-nav-btn';
                button.type = 'button';
                button.dataset.settingsSection = 'plugins';
                button.innerHTML = '<i class="fa-solid fa-plug"></i><span>Plugins</span>';
                const addOnsButton = sidebar.querySelector('[data-settings-section="addons"]');
                (addOnsButton?.closest('.settings-sidebar-group') || sidebar).appendChild(button);
                button.addEventListener('click', () => window.settingsPanel?._activateSection?.('plugins'));
            }

            let page = main.querySelector('[data-settings-page="plugins"]');
            if (!page) {
                page = document.createElement('section');
                page.className = 'settings-section';
                page.dataset.settingsPage = 'plugins';
                main.appendChild(page);
            }

            let root = page.querySelector('#sm-plugin-settings-root');
            if (!root) {
                root = document.createElement('div');
                root.id = 'sm-plugin-settings-root';
                root.className = 'sm-plugin-settings-root';
                page.appendChild(root);
            }

            this.root = root;
            this._injectStyles();
            this._bindUi();
            this._bindEvents();
            this.render();
            return true;
        }

        show() {
            window.openSettingsPanel?.();
            let attempts = 0;
            const reveal = () => {
                if (this.mount()) {
                    window.settingsPanel?._activateSection?.('plugins');
                    return;
                }
                if (attempts++ < 60) window.setTimeout(reveal, 16);
            };
            (window.requestAnimationFrame || window.setTimeout)(reveal);
        }

        scheduleRender() {
            if (this._renderQueued) return;
            this._renderQueued = true;
            (window.requestAnimationFrame || window.setTimeout)(() => {
                this._renderQueued = false;
                if (this.root?.isConnected) this.render();
            });
        }

        render() {
            if (!this.root) return;
            const manager = this.manager;
            const registry = this.registry;
            if (!manager || !registry) {
                this.root.innerHTML = '<div class="sm-plugin-empty">Plugin runtime is starting...</div>';
                return;
            }

            const allPlugins = manager.list();
            const query = this.search.trim().toLowerCase();
            const plugins = allPlugins.filter((plugin) => {
                if (this.category !== 'all' && plugin.category !== this.category) return false;
                return !query || [plugin.name, plugin.id, plugin.description, plugin.author, plugin.category, plugin.version]
                    .join(' ').toLowerCase().includes(query);
            });
            const categories = registry.categories();
            const policy = manager.policy;

            this.root.innerHTML = `
                <header class="sm-plugin-header">
                    <div><strong><i class="fa-solid fa-plug"></i> Plugins</strong><span>Manage packaged engine and project extensions.</span></div>
                    <b>${allPlugins.length} discovered</b>
                </header>
                <div class="sm-plugin-policy">
                    ${this._policy('pluginsEnabled', 'Enable Plugins', 'Master runtime switch', policy.pluginsEnabled)}
                    ${this._policy('autoStart', 'Auto Start', 'Start saved and default plugins after boot', policy.autoStart)}
                    ${this._policy('safeMode', 'Safe Mode', 'Allow only built-in plugins', policy.safeMode)}
                    ${this._policy('allowExperimental', 'Experimental', 'Permit experimental plugins', policy.allowExperimental)}
                </div>
                <div class="sm-plugin-toolbar">
                    <label class="sm-plugin-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-plugin-search placeholder="Search plugins..." value="${this._escape(this.search)}"></label>
                    <select data-plugin-category aria-label="Plugin category"><option value="all">All categories</option>${categories.map((item) => `<option value="${this._escape(item)}" ${item === this.category ? 'selected' : ''}>${this._escape(item)}</option>`).join('')}</select>
                    <button type="button" data-plugin-global="defaults">Enable Defaults</button>
                    <button type="button" data-plugin-global="disable-all">Disable All</button>
                    <button type="button" data-plugin-global="refresh" title="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
                </div>
                <div class="sm-plugin-list">${plugins.length ? plugins.map((plugin) => {
                    try { return this._card(plugin); }
                    catch (error) {
                        console.error(`[SMPluginSettingsUI] Could not render ${plugin.id}.`, error);
                        return `<div class="sm-plugin-error">Could not render ${this._escape(plugin.name || plugin.id)}.</div>`;
                    }
                }).join('') : '<div class="sm-plugin-empty">No plugins match this filter.</div>'}</div>
            `;
        }

        _policy(id, label, description, value) {
            return `<label class="sm-plugin-policy-item"><span><b>${label}</b><small>${description}</small></span><input type="checkbox" data-plugin-policy="${id}" ${value ? 'checked' : ''}></label>`;
        }

        _card(plugin) {
            const expanded = this.expanded.has(plugin.id);
            const busy = this.busy.has(plugin.id);
            const status = plugin.status?.state || (plugin.enabled ? 'enabled' : 'disabled');
            const tags = [plugin.builtIn ? 'Built-in' : 'External', plugin.isExperimentalVersion ? 'Experimental' : '', plugin.isBetaVersion ? 'Beta' : ''].filter(Boolean);
            const dependencies = plugin.dependencies?.map((item) => item.id + (item.optional ? ' (optional)' : '')).join(', ') || 'None';
            const commands = this.manager.listCommands().filter((command) => command.pluginId === plugin.id);
            const settingDefinitions = this.registry?.get(plugin.id)?.manifest?.settings || [];
            const settingRows = settingDefinitions.map((setting) => this._setting(plugin, setting)).join('') || '<span class="sm-plugin-muted">No plugin settings.</span>';
            return `
                <article class="sm-plugin-card ${expanded ? 'open' : ''}" data-plugin-id="${this._escape(plugin.id)}">
                    <div class="sm-plugin-card-head">
                        <button type="button" class="sm-plugin-expand" data-plugin-action="expand" title="Details"><i class="fa-solid fa-chevron-${expanded ? 'down' : 'right'}"></i></button>
                        <i class="sm-plugin-icon ${this._escape(plugin.icon || 'fa-solid fa-puzzle-piece')}"></i>
                        <div class="sm-plugin-main"><div class="sm-plugin-name">${this._escape(plugin.name)} ${tags.map((tag) => `<em>${tag}</em>`).join('')}</div><span>${this._escape(plugin.category)} · v${this._escape(plugin.version)} · ${this._escape(plugin.author)}</span></div>
                        <span class="sm-plugin-state ${this._escape(status)}" title="${this._escape(plugin.status?.error || status)}">${busy ? 'working' : this._escape(status)}</span>
                        <label class="sm-plugin-toggle" title="${plugin.enabled ? 'Disable plugin' : 'Enable plugin'}"><input type="checkbox" data-plugin-action="toggle" ${plugin.enabled ? 'checked' : ''} ${busy ? 'disabled' : ''}><span></span></label>
                    </div>
                    <p>${this._escape(plugin.description || 'No description supplied.')}</p>
                    ${plugin.status?.error ? `<div class="sm-plugin-error"><i class="fa-solid fa-triangle-exclamation"></i>${this._escape(plugin.status.error)}</div>` : ''}
                    <div class="sm-plugin-details">
                        <div class="sm-plugin-info"><span><b>Plugin ID</b><code>${this._escape(plugin.id)}</code></span><span><b>Default</b>${plugin.enabledByDefault ? 'Enabled' : 'Disabled'}</span><span><b>Dependencies</b>${this._escape(dependencies)}</span><span><b>Modules</b>${this._escape(plugin.modules?.map((module) => `${module.name} (${module.type})`).join(', ') || 'None')}</span></div>
                        <section><h4>Settings</h4>${settingRows}</section>
                        <section><h4>Commands</h4><div class="sm-plugin-commands">${commands.length ? commands.map((command) => `<button type="button" data-plugin-command="${this._escape(command.id)}" ${plugin.enabled && !busy ? '' : 'disabled'} title="${this._escape(command.description)}">${this._escape(command.label)}</button>`).join('') : '<span class="sm-plugin-muted">Enable the plugin to register its commands.</span>'}</div></section>
                    </div>
                </article>`;
        }

        _setting(plugin, setting) {
            const value = plugin.settings?.[setting.id];
            let input = '';
            if (setting.type === 'boolean') input = `<input type="checkbox" data-plugin-setting="${this._escape(setting.id)}" ${value ? 'checked' : ''}>`;
            else if (setting.type === 'select') input = `<select data-plugin-setting="${this._escape(setting.id)}">${setting.options.map((option) => `<option value="${this._escape(option)}" ${String(option) === String(value) ? 'selected' : ''}>${this._escape(option)}</option>`).join('')}</select>`;
            else input = `<input type="${setting.type === 'number' ? 'number' : 'text'}" data-plugin-setting="${this._escape(setting.id)}" value="${this._escape(value ?? '')}" ${setting.min !== undefined ? `min="${this._escape(setting.min)}"` : ''} ${setting.max !== undefined ? `max="${this._escape(setting.max)}"` : ''} ${setting.step !== undefined ? `step="${this._escape(setting.step)}"` : ''}>`;
            return `<label class="sm-plugin-setting"><span><b>${this._escape(setting.label)}</b>${setting.description ? `<small>${this._escape(setting.description)}</small>` : ''}</span>${input}</label>`;
        }

        _bindUi() {
            if (this._eventsBound || !this.root) return;
            this._eventsBound = true;
            this.root.addEventListener('input', (event) => {
                if (!event.target.matches('[data-plugin-search]')) return;
                this.search = event.target.value;
                this.scheduleRender();
            });
            this.root.addEventListener('change', async (event) => {
                const target = event.target;
                if (target.matches('[data-plugin-category]')) { this.category = target.value; this.render(); return; }
                if (target.dataset.pluginPolicy) { await this.manager.setPolicy(target.dataset.pluginPolicy, target.checked); return; }
                const card = target.closest('[data-plugin-id]');
                if (!card) return;
                const pluginId = card.dataset.pluginId;
                if (target.matches('[data-plugin-action="toggle"]')) { await this._setEnabled(pluginId, target.checked); return; }
                if (target.dataset.pluginSetting) {
                    try { this.manager.setSetting(pluginId, target.dataset.pluginSetting, target.type === 'checkbox' ? target.checked : target.value); }
                    catch (error) { console.error('[SMPluginSettingsUI] Setting update failed.', error); }
                }
            });
            this.root.addEventListener('click', async (event) => {
                const globalAction = event.target.closest('[data-plugin-global]')?.dataset.pluginGlobal;
                if (globalAction) { await this._globalAction(globalAction); return; }
                const card = event.target.closest('[data-plugin-id]');
                if (!card) return;
                const pluginId = card.dataset.pluginId;
                if (event.target.closest('[data-plugin-action="expand"]')) {
                    this.expanded.has(pluginId) ? this.expanded.delete(pluginId) : this.expanded.add(pluginId);
                    this.render();
                    return;
                }
                const command = event.target.closest('[data-plugin-command]')?.dataset.pluginCommand;
                if (command) await this._runCommand(pluginId, command);
            });
        }

        _bindEvents() {
            if (this._pluginEventsBound) return;
            this._pluginEventsBound = true;
            ['sm:plugin-registered', 'sm:plugin-unregistered', 'sm:plugin-updated', 'sm:plugin-status-changed', 'sm:plugin-policy-changed', 'sm:plugin-setting-changed', 'sm:plugin-command-registered', 'sm:plugin-command-unregistered', 'sm:plugins-ready'].forEach((name) => window.addEventListener(name, () => this.scheduleRender()));
        }

        async _setEnabled(id, enabled) {
            if (this.busy.has(id)) return;
            this.busy.add(id); this.render();
            try { enabled ? await this.manager.enable(id) : await this.manager.disable(id); }
            catch (error) { console.error(`[SMPluginSettingsUI] Could not ${enabled ? 'enable' : 'disable'} ${id}.`, error); }
            finally { this.busy.delete(id); this.render(); }
        }

        async _runCommand(pluginId, commandId) {
            if (this.busy.has(pluginId)) return;
            this.busy.add(pluginId); this.render();
            try { await this.manager.runCommand(pluginId, commandId); }
            catch (error) { console.error(`[SMPluginSettingsUI] Command ${pluginId}:${commandId} failed.`, error); }
            finally { this.busy.delete(pluginId); this.render(); }
        }

        async _globalAction(action) {
            if (action === 'defaults') await this.manager.enableDefaults();
            else if (action === 'disable-all') await this.manager.disableAll({ cascade: true });
            this.render();
        }

        _escape(value) {
            return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
        }

        _injectStyles() {
            if (document.getElementById('sm-plugin-settings-style')) return;
            const style = document.createElement('style');
            style.id = 'sm-plugin-settings-style';
            style.textContent = `
                .sm-plugin-settings-root{padding:15px;color:#b8b8b8;font:12px Inter,Arial,sans-serif}.sm-plugin-header,.sm-plugin-card-head,.sm-plugin-toolbar{display:flex;align-items:center}.sm-plugin-header{justify-content:space-between;margin-bottom:14px}.sm-plugin-header strong{display:block;color:#eee;font-size:16px}.sm-plugin-header strong i{color:#42a5f5;margin-right:7px}.sm-plugin-header span{display:block;color:#777;margin-top:3px}.sm-plugin-header>b{font-size:11px;color:#7e9db5;font-weight:500}.sm-plugin-policy{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:10px}.sm-plugin-policy-item,.sm-plugin-setting{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#292929;border:1px solid #383838;padding:8px 10px}.sm-plugin-policy-item b,.sm-plugin-setting b{display:block;color:#ccc;font-size:11px}.sm-plugin-policy-item small,.sm-plugin-setting small{display:block;color:#747474;font-size:10px;margin-top:2px}.sm-plugin-policy input,.sm-plugin-toggle input{accent-color:#2e8fd8}.sm-plugin-toolbar{gap:7px;margin:12px 0}.sm-plugin-toolbar button,.sm-plugin-toolbar select,.sm-plugin-commands button,.sm-plugin-setting input,.sm-plugin-setting select{min-height:28px;background:#323232;border:1px solid #4a4a4a;color:#c9c9c9;padding:0 8px}.sm-plugin-toolbar button,.sm-plugin-commands button{cursor:pointer}.sm-plugin-toolbar button:hover,.sm-plugin-commands button:hover:not(:disabled){background:#3d4d59;color:white}.sm-plugin-search{display:flex;align-items:center;gap:6px;flex:1;min-width:160px;background:#252525;border:1px solid #444;padding:0 8px}.sm-plugin-search i{color:#777}.sm-plugin-search input{width:100%;height:28px;background:transparent;border:0;color:#ddd;outline:0}.sm-plugin-list{display:grid;gap:7px}.sm-plugin-card{background:#252525;border:1px solid #393939}.sm-plugin-card.open{border-color:#4b6678}.sm-plugin-card-head{gap:9px;min-height:48px;padding:7px 9px}.sm-plugin-expand{width:24px;height:26px;background:none;border:0;color:#8b8b8b;cursor:pointer}.sm-plugin-icon{width:20px;text-align:center;color:#57a8e1}.sm-plugin-main{min-width:0;flex:1}.sm-plugin-name{color:#e3e3e3;font-size:13px}.sm-plugin-name em{display:inline-block;margin-left:4px;padding:1px 4px;background:#34414a;color:#a8cce6;font-size:9px;font-style:normal}.sm-plugin-main>span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#777;font-size:10px;margin-top:3px}.sm-plugin-state{font-size:10px;color:#888}.sm-plugin-state.enabled{color:#6dc58a}.sm-plugin-state.error,.sm-plugin-state.blocked{color:#e47878}.sm-plugin-state.starting,.sm-plugin-state.stopping{color:#d7b15c}.sm-plugin-toggle{position:relative;width:32px;height:18px}.sm-plugin-toggle input{opacity:0;width:0;height:0}.sm-plugin-toggle span{position:absolute;inset:0;background:#555;border-radius:9px;cursor:pointer}.sm-plugin-toggle span:after{content:'';position:absolute;width:12px;height:12px;left:3px;top:3px;background:#ddd;border-radius:50%;transition:.15s}.sm-plugin-toggle input:checked+span{background:#287db5}.sm-plugin-toggle input:checked+span:after{transform:translateX(14px);background:#fff}.sm-plugin-card>p{margin:0;padding:0 12px 10px 62px;color:#999;font-size:11px}.sm-plugin-error{margin:0 12px 10px 62px;padding:6px 8px;background:#4a2929;color:#e99b9b;font-size:10px}.sm-plugin-error i{margin-right:5px}.sm-plugin-details{display:none;border-top:1px solid #393939;padding:10px 12px 12px 62px}.sm-plugin-card.open .sm-plugin-details{display:block}.sm-plugin-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-bottom:10px}.sm-plugin-info span{padding:6px;background:#2d2d2d;font-size:10px;overflow-wrap:anywhere}.sm-plugin-info b{display:block;color:#777;font-size:9px;margin-bottom:2px}.sm-plugin-info code{color:#a8cce6}.sm-plugin-details section{margin-top:10px}.sm-plugin-details h4{margin:0 0 5px;color:#aaa;font-size:10px;text-transform:uppercase}.sm-plugin-setting{margin-top:4px;padding:6px 8px}.sm-plugin-setting input[type=text],.sm-plugin-setting input[type=number],.sm-plugin-setting select{max-width:180px}.sm-plugin-commands{display:flex;gap:5px;flex-wrap:wrap}.sm-plugin-commands button:disabled{opacity:.45;cursor:default}.sm-plugin-muted,.sm-plugin-empty{color:#777;font-size:11px}.sm-plugin-empty{min-height:110px;display:flex;align-items:center;justify-content:center;background:#262626;border:1px dashed #434343}@media(max-width:760px){.sm-plugin-policy{grid-template-columns:1fr}.sm-plugin-toolbar{flex-wrap:wrap}.sm-plugin-search{flex-basis:100%}.sm-plugin-details,.sm-plugin-card>p,.sm-plugin-error{padding-left:12px;margin-left:0}.sm-plugin-info{grid-template-columns:1fr}}
            `;
            document.head.appendChild(style);
        }
    }

    const ui = new SMPluginSettingsUI();
    window.SMPluginSettingsUI = ui;
    window.smPluginSettingsUI = ui;
    window.openPluginsPanel = () => ui.show();
    ui.mountWhenReady();
})();
