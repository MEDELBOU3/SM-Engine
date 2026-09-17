// ============================================================================
// engine/settings/file-paths/SMFilePathsSettingsUI.js
//
// Dynamic File Paths page for panels/settingsPanel.js.
// Replaces the existing placeholder inside:
//     [data-settings-page="file-paths"]
//
// Does not require rewriting SettingsPanel.
// ============================================================================

(function () {
    'use strict';

    const GROUPS = [
        {
            id: 'project',
            title: 'Project',
            icon: 'fa-solid fa-diagram-project',
            description: 'Core virtual directories used by the project.'
        },
        {
            id: 'content',
            title: 'Content',
            icon: 'fa-solid fa-cubes',
            description: 'Resource-specific folders below the Assets directory.'
        },
        {
            id: 'cache',
            title: 'Cache & Autosave',
            icon: 'fa-solid fa-database',
            description: 'Generated, temporary and recovery data.'
        },
        {
            id: 'output',
            title: 'Build & Export',
            icon: 'fa-solid fa-box-open',
            description: 'Build products, exports, screenshots and recordings.'
        },
        {
            id: 'extensions',
            title: 'Add-ons & Tools',
            icon: 'fa-solid fa-puzzle-piece',
            description: 'Project-level custom extensions and templates.'
        }
    ];

    class SMFilePathsSettingsUI {
        constructor() {
            this.page = null;
            this.root = null;
            this._observer = null;
            this._eventsBound = false;
            this._globalBound = false;
            this._settingsUnsubscribe = null;
            this._renderRAF = 0;
            this.lastValidation = null;
            this.busy = false;
        }

        get manager() {
            return window.SMFilePathsManager || null;
        }

        get engine() {
            return window.EngineSettings || null;
        }

        mountWhenReady() {
            if (this.mount()) {
                return true;
            }

            if (this._observer) {
                return false;
            }

            this._observer =
                new MutationObserver(
                    () => {
                        if (this.mount()) {
                            this._observer?.disconnect();
                            this._observer = null;
                        }
                    }
                );

            this._observer.observe(
                document.documentElement,
                {
                    childList: true,
                    subtree: true
                }
            );

            return false;
        }

        mount() {
            const page =
                document.querySelector(
                    '[data-settings-page="file-paths"]'
                );

            if (!page) {
                return false;
            }

            this.page = page;

            page.querySelector(
                '.settings-placeholder'
            )?.remove();

            let root =
                page.querySelector(
                    '#sm-file-paths-settings-root'
                );

            if (!root) {
                root =
                    document.createElement(
                        'div'
                    );

                root.id =
                    'sm-file-paths-settings-root';

                page.appendChild(
                    root
                );
            }

            this.root = root;

            this._injectStyles();
            this._bindUI();
            this._bindGlobal();

            this.render();

            return true;
        }

        scheduleRender() {
            if (this._renderRAF) {
                return;
            }

            this._renderRAF =
                requestAnimationFrame(
                    () => {
                        this._renderRAF = 0;
                        this.render();
                    }
                );
        }

        render() {
            if (!this.root) {
                return;
            }

            const manager =
                this.manager;

            const engine =
                this.engine;

            if (
                !manager ||
                !engine
            ) {
                this.root.innerHTML = `
                    <div class="sm-fp-empty">
                        File Paths runtime is waiting for EngineSettings.
                    </div>
                `;

                return;
            }

            const native =
                manager.getNativeRootStatus();

            const definitions =
                manager.definitions;

            this.root.innerHTML = `
                <div class="sm-fp-header">
                    <div class="sm-fp-heading">
                        <i class="fa-solid fa-folder-tree"></i>
                        <div>
                            <strong>File Paths</strong>
                            <span>
                                Project and resource path configuration
                            </span>
                        </div>
                    </div>

                    <div class="sm-fp-header-actions">
                        ${
                            native.supported
                                ? `
                                    <button
                                        type="button"
                                        class="sm-fp-btn"
                                        data-fp-action="${native.connected ? 'disconnect-native' : 'connect-native'}"
                                        ${this.busy ? 'disabled' : ''}
                                    >
                                        <i class="fa-solid ${native.connected ? 'fa-link-slash' : 'fa-folder-open'}"></i>
                                        ${native.connected ? 'Disconnect Folder' : 'Connect Folder'}
                                    </button>
                                `
                                : ''
                        }

                        <button
                            type="button"
                            class="sm-fp-btn"
                            data-fp-action="validate"
                            ${this.busy ? 'disabled' : ''}
                        >
                            <i class="fa-solid fa-circle-check"></i>
                            Validate
                        </button>

                        <button
                            type="button"
                            class="sm-fp-btn"
                            data-fp-action="ensure"
                            ${this.busy ? 'disabled' : ''}
                        >
                            <i class="fa-solid fa-folder-plus"></i>
                            Create Missing
                        </button>

                        <button
                            type="button"
                            class="sm-fp-btn"
                            data-fp-action="defaults"
                            ${this.busy ? 'disabled' : ''}
                        >
                            <i class="fa-solid fa-arrow-rotate-left"></i>
                            Defaults
                        </button>
                    </div>
                </div>

                <div class="sm-fp-modebar">
                    <div class="sm-fp-native-status ${native.connected ? 'connected' : ''}">
                        <i class="fa-solid ${native.connected ? 'fa-link' : 'fa-globe'}"></i>
                        <span>
                            ${
                                native.connected
                                    ? `Native root: <strong>${this._escape(native.name || 'Connected')}</strong>`
                                    : 'Virtual project paths'
                            }
                        </span>
                        ${
                            native.connected
                                ? `<small>${this._escape(native.permission)}</small>`
                                : `<small>${native.supported ? 'Browser folder access available' : 'Browser virtual storage mode'}</small>`
                        }
                    </div>

                    <div class="sm-fp-vars">
                        <span>Variables:</span>
                        <code>\${PROJECT}</code>
                        <code>\${ASSETS}</code>
                        <code>\${CACHE}</code>
                        <code>\${BUILD}</code>
                    </div>
                </div>

                <div class="sm-fp-options">
                    ${this._renderOption(
                        'setting-filepaths-use-relative',
                        'Use relative project paths',
                        'Prefer project variables instead of hard-coded machine paths.'
                    )}

                    ${this._renderOption(
                        'setting-filepaths-create-missing',
                        'Create missing folders automatically',
                        'Allow the project/native storage adapter to create configured directories.'
                    )}

                    ${this._renderOption(
                        'setting-filepaths-cache-inside-project',
                        'Keep cache inside project',
                        'Keep generated cache and derived data portable with the project.'
                    )}

                    ${this._renderOption(
                        'setting-filepaths-clean-temp-on-exit',
                        'Clean temporary files on exit',
                        'Request cleanup of the configured temporary directory when the engine closes.'
                    )}
                </div>

                <div class="sm-fp-groups">
                    ${GROUPS.map(
                        group =>
                            this._renderGroup(
                                group,
                                definitions.filter(
                                    def =>
                                        def.group === group.id
                                )
                            )
                    ).join('')}
                </div>

                ${this._renderValidation()}
            `;
        }

        _renderGroup(group, definitions) {
            return `
                <section class="sm-fp-group">
                    <div class="sm-fp-group-head">
                        <i class="${group.icon}"></i>
                        <div>
                            <strong>${this._escape(group.title)}</strong>
                            <span>${this._escape(group.description)}</span>
                        </div>
                    </div>

                    <div class="sm-fp-rows">
                        ${definitions.map(
                            def =>
                                this._renderPathRow(
                                    def
                                )
                        ).join('')}
                    </div>
                </section>
            `;
        }

        _renderPathRow(def) {
            const value =
                this.engine.get(
                    def.settingId
                ) ??
                def.default;

            let resolved = '';

            try {
                resolved =
                    this.manager.resolve(
                        def.key
                    );
            } catch {
                resolved = 'Resolution error';
            }

            const validation =
                this.lastValidation
                    ?.paths
                    ?.find(
                        item =>
                            item.key === def.key
                    );

            return `
                <div
                    class="sm-fp-row ${validation ? `state-${validation.status}` : ''}"
                    data-fp-key="${this._escape(def.key)}"
                >
                    <div class="sm-fp-label">
                        <strong>${this._escape(def.label)}</strong>
                        ${
                            def.variable
                                ? `<code>\${${this._escape(def.variable)}}</code>`
                                : ''
                        }
                    </div>

                    <div class="sm-fp-field">
                        <input
                            id="${this._escape(def.settingId)}"
                            type="text"
                            spellcheck="false"
                            autocomplete="off"
                            value="${this._escape(value)}"
                            data-fp-setting="${this._escape(def.settingId)}"
                        >

                        <button
                            type="button"
                            class="sm-fp-icon-btn"
                            data-fp-copy="${this._escape(def.key)}"
                            title="Copy resolved path"
                        >
                            <i class="fa-regular fa-copy"></i>
                        </button>

                        <button
                            type="button"
                            class="sm-fp-icon-btn"
                            data-fp-reset="${this._escape(def.settingId)}"
                            title="Restore this path"
                        >
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                    </div>

                    <div class="sm-fp-resolved">
                        <i class="fa-solid ${
                            validation?.status === 'error'
                                ? 'fa-circle-xmark'
                                : validation?.status === 'warning'
                                    ? 'fa-triangle-exclamation'
                                    : validation
                                        ? 'fa-circle-check'
                                        : 'fa-arrow-turn-down'
                        }"></i>

                        <span title="${this._escape(validation?.message || resolved)}">
                            ${this._escape(validation?.message || resolved)}
                        </span>
                    </div>
                </div>
            `;
        }

        _renderOption(
            settingId,
            label,
            description
        ) {
            const checked =
                Boolean(
                    this.engine.get(
                        settingId
                    )
                );

            return `
                <label class="sm-fp-option">
                    <span>
                        <strong>${this._escape(label)}</strong>
                        <small>${this._escape(description)}</small>
                    </span>

                    <input
                        type="checkbox"
                        data-fp-setting="${this._escape(settingId)}"
                        ${checked ? 'checked' : ''}
                    >
                </label>
            `;
        }

        _renderValidation() {
            const report =
                this.lastValidation;

            if (!report) {
                return `
                    <div class="sm-fp-validation idle">
                        <i class="fa-solid fa-circle-info"></i>
                        <span>
                            Validate Paths checks variables, syntax and configured storage integration.
                        </span>
                    </div>
                `;
            }

            const state =
                !report.valid
                    ? 'error'
                    : report.warnings
                        ? 'warning'
                        : 'ok';

            return `
                <div class="sm-fp-validation ${state}">
                    <i class="fa-solid ${
                        state === 'error'
                            ? 'fa-circle-xmark'
                            : state === 'warning'
                                ? 'fa-triangle-exclamation'
                                : 'fa-circle-check'
                    }"></i>

                    <span>
                        ${
                            report.valid
                                ? `Validation complete — ${report.warnings} warning(s).`
                                : `Validation found ${report.errors} error(s) and ${report.warnings} warning(s).`
                        }
                    </span>

                    <small>
                        ${report.paths.length} configured paths
                    </small>
                </div>
            `;
        }

        _bindUI() {
            if (
                this._eventsBound ||
                !this.root
            ) {
                return;
            }

            this._eventsBound = true;

            this.root.addEventListener(
                'change',
                event => {
                    const control =
                        event.target.closest(
                            '[data-fp-setting]'
                        );

                    if (!control) {
                        return;
                    }

                    const id =
                        control.dataset
                            .fpSetting;

                    const value =
                        control.type ===
                            'checkbox'
                            ? control.checked
                            : control.value;

                    this.engine?.set?.(
                        id,
                        value
                    );

                    this.lastValidation =
                        null;

                    this.scheduleRender();
                }
            );

            this.root.addEventListener(
                'keydown',
                event => {
                    const input =
                        event.target.closest(
                            'input[type="text"][data-fp-setting]'
                        );

                    if (
                        input &&
                        event.key ===
                            'Enter'
                    ) {
                        input.blur();
                    }
                }
            );

            this.root.addEventListener(
                'click',
                async event => {
                    const action =
                        event.target
                            .closest(
                                '[data-fp-action]'
                            )
                            ?.dataset
                            ?.fpAction;

                    if (action) {
                        await this._runAction(
                            action
                        );

                        return;
                    }

                    const copyKey =
                        event.target
                            .closest(
                                '[data-fp-copy]'
                            )
                            ?.dataset
                            ?.fpCopy;

                    if (copyKey) {
                        await this._copyResolved(
                            copyKey
                        );

                        return;
                    }

                    const resetId =
                        event.target
                            .closest(
                                '[data-fp-reset]'
                            )
                            ?.dataset
                            ?.fpReset;

                    if (resetId) {
                        const def =
                            this.manager
                                ?.definitions
                                ?.find(
                                    item =>
                                        item.settingId ===
                                        resetId
                                );

                        if (def) {
                            this.engine?.set?.(
                                def.settingId,
                                def.default
                            );

                            this.lastValidation =
                                null;

                            this.scheduleRender();
                        }
                    }
                }
            );
        }

        _bindGlobal() {
            if (this._globalBound) {
                return;
            }

            this._globalBound = true;

            [
                'sm:file-paths-changed',
                'sm:file-paths-synchronized',
                'sm:file-paths-native-root-changed',
                'sm:file-paths-defaults-restored',
                'sm:file-paths-directories-ensured'
            ].forEach(
                name => {
                    window.addEventListener(
                        name,
                        () =>
                            this.scheduleRender()
                    );
                }
            );

            if (
                typeof this.engine
                    ?.onChange ===
                    'function'
            ) {
                this._settingsUnsubscribe =
                    this.engine.onChange(
                        id => {
                            if (
                                String(id)
                                    .startsWith(
                                        'setting-filepaths-'
                                    )
                            ) {
                                this.lastValidation =
                                    null;

                                this.scheduleRender();
                            }
                        }
                    );
            }
        }

        async _runAction(action) {
            if (
                this.busy ||
                !this.manager
            ) {
                return;
            }

            this.busy = true;
            this.scheduleRender();

            try {
                if (
                    action ===
                    'validate'
                ) {
                    this.lastValidation =
                        this.manager
                            .validateAll();

                    this.manager.log(
                        `File Paths validation: ${this.lastValidation.errors} error(s), ${this.lastValidation.warnings} warning(s).`,
                        this.lastValidation.valid
                            ? 'info'
                            : 'warn',
                        this.lastValidation
                    );
                }

                if (
                    action ===
                    'defaults'
                ) {
                    this.manager
                        .restoreDefaults();

                    this.lastValidation =
                        null;

                    this.manager.log(
                        'File Paths defaults restored.',
                        'info'
                    );
                }

                if (
                    action ===
                    'connect-native'
                ) {
                    await this.manager
                        .connectNativeProjectRoot();

                    this.manager.log(
                        `Native project folder connected: ${this.manager.nativeRootHandle?.name || 'folder'}.`,
                        'info'
                    );
                }

                if (
                    action ===
                    'disconnect-native'
                ) {
                    await this.manager
                        .disconnectNativeProjectRoot();

                    this.manager.log(
                        'Native project folder disconnected.',
                        'info'
                    );
                }

                if (
                    action ===
                    'ensure'
                ) {
                    const results =
                        await this.manager
                            .ensureConfiguredDirectories();

                    this.manager.log(
                        results.length
                            ? `Directory preparation complete: ${results.length} path(s) processed.`
                            : 'Create-missing request dispatched to the project storage layer.',
                        'info',
                        results
                    );
                }
            } catch (error) {
                if (
                    error?.name ===
                    'AbortError'
                ) {
                    return;
                }

                this.manager.log(
                    error?.message ||
                    `File Paths action "${action}" failed.`,
                    'error',
                    error
                );

                console.error(
                    '[SMFilePathsSettingsUI]',
                    error
                );
            } finally {
                this.busy = false;
                this.scheduleRender();
            }
        }

        async _copyResolved(key) {
            let text = '';

            try {
                text =
                    this.manager.resolve(
                        key
                    );
            } catch {
                return;
            }

            try {
                await navigator.clipboard
                    .writeText(
                        text
                    );

                this.manager.log(
                    `Copied path: ${text}`,
                    'debug'
                );
            } catch {
                const area =
                    document.createElement(
                        'textarea'
                    );

                area.value =
                    text;

                area.style.position =
                    'fixed';

                area.style.opacity =
                    '0';

                document.body
                    .appendChild(
                        area
                    );

                area.select();

                document.execCommand?.(
                    'copy'
                );

                area.remove();
            }
        }

        _escape(value) {
            return String(
                value ?? ''
            ).replace(
                /[&<>"']/g,
                char => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;'
                }[char])
            );
        }

        _injectStyles() {
            if (
                document.getElementById(
                    'sm-file-paths-settings-styles'
                )
            ) {
                return;
            }

            const style =
                document.createElement(
                    'style'
                );

            style.id =
                'sm-file-paths-settings-styles';

            style.textContent = `
                #sm-file-paths-settings-root {
                    min-height: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    color: var(--settings-text, #e4e4e4);
                }

                .settings-section[data-settings-page="file-paths"].active {
                    padding: 10px 11px 14px;
                }

                .sm-fp-header {
                    min-height: 46px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 7px 10px;
                    background: #2d2d2d;
                    border-bottom: 1px solid var(--settings-border, rgba(255,255,255,.065));
                }

                .sm-fp-heading {
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    gap: 9px;
                }

                .sm-fp-heading > i {
                    color: var(--settings-accent, #c77b36);
                    font-size: 12px;
                }

                .sm-fp-heading > div {
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .sm-fp-heading strong {
                    color: #dfdfdf;
                    font-size: 11px;
                    font-weight: 600;
                }

                .sm-fp-heading span {
                    color: #777;
                    font-size: 8px;
                }

                .sm-fp-header-actions {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 3px;
                }

                .sm-fp-btn,
                .sm-fp-icon-btn {
                    border: 0;
                    border-radius: 0;
                    background: transparent;
                    color: #969696;
                    font-family: inherit;
                    cursor: pointer;
                }

                .sm-fp-btn {
                    height: 25px;
                    padding: 0 8px;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 8px;
                }

                .sm-fp-btn:hover:not(:disabled),
                .sm-fp-icon-btn:hover:not(:disabled) {
                    background: rgba(255,255,255,.045);
                    color: #eee;
                }

                .sm-fp-btn:disabled,
                .sm-fp-icon-btn:disabled {
                    opacity: .42;
                    cursor: default;
                }

                .sm-fp-modebar {
                    min-height: 34px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 5px 9px;
                    background: #313131;
                    border: 1px solid var(--settings-border, rgba(255,255,255,.065));
                }

                .sm-fp-native-status {
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #929292;
                    font-size: 8px;
                }

                .sm-fp-native-status.connected > i {
                    color: #8fb49a;
                }

                .sm-fp-native-status strong {
                    color: #c8c8c8;
                    font-weight: 500;
                }

                .sm-fp-native-status small {
                    color: #666;
                    text-transform: uppercase;
                    font: 7px "Cascadia Mono", Consolas, monospace;
                }

                .sm-fp-vars {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 4px;
                    color: #686868;
                    font-size: 7px;
                }

                .sm-fp-vars code,
                .sm-fp-label code {
                    padding: 2px 4px;
                    color: #9a8b7d;
                    background: #292929;
                    font: 7px "Cascadia Mono", Consolas, monospace;
                }

                .sm-fp-options {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(220px, 1fr));
                    background: #313131;
                    border: 1px solid var(--settings-border, rgba(255,255,255,.065));
                }

                .sm-fp-option {
                    min-height: 42px;
                    padding: 5px 10px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                .sm-fp-option:hover {
                    background: rgba(255,255,255,.02);
                }

                .sm-fp-option > span {
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .sm-fp-option strong {
                    color: #bbb;
                    font-size: 9px;
                    font-weight: 500;
                }

                .sm-fp-option small {
                    color: #686868;
                    font-size: 7px;
                    line-height: 1.35;
                }

                .sm-fp-option input {
                    width: 13px;
                    height: 13px;
                    accent-color: var(--settings-accent, #c77b36);
                }

                .sm-fp-groups {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .sm-fp-group {
                    background: #313131;
                    border-top: 1px solid var(--settings-border, rgba(255,255,255,.065));
                    border-bottom: 1px solid rgba(0,0,0,.22);
                }

                .sm-fp-group-head {
                    min-height: 34px;
                    padding: 5px 10px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: #333;
                }

                .sm-fp-group-head > i {
                    width: 14px;
                    color: #858585;
                    text-align: center;
                    font-size: 9px;
                }

                .sm-fp-group-head > div {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                }

                .sm-fp-group-head strong {
                    color: #ccc;
                    font-size: 9px;
                    font-weight: 600;
                }

                .sm-fp-group-head span {
                    color: #676767;
                    font-size: 7px;
                }

                .sm-fp-rows {
                    padding: 4px 10px 7px;
                }

                .sm-fp-row {
                    min-height: 43px;
                    display: grid;
                    grid-template-columns: minmax(120px, 170px) minmax(240px, 1fr);
                    grid-template-rows: auto auto;
                    align-items: center;
                    column-gap: 12px;
                    padding: 3px 0;
                }

                .sm-fp-row + .sm-fp-row {
                    border-top: 1px solid rgba(255,255,255,.025);
                }

                .sm-fp-label {
                    grid-row: 1 / span 2;
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 5px;
                    text-align: right;
                }

                .sm-fp-label strong {
                    color: #b8b8b8;
                    font-size: 9px;
                    font-weight: 500;
                }

                .sm-fp-field {
                    min-width: 0;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 25px 25px;
                    gap: 2px;
                }

                .sm-fp-field input {
                    min-width: 0;
                    height: 25px;
                    box-sizing: border-box;
                    padding: 0 8px;
                    color: #d2d2d2;
                    background: #272727;
                    border: 1px solid var(--settings-border-strong, rgba(255,255,255,.105));
                    border-radius: 2px;
                    outline: none;
                    font: 9px "Cascadia Mono", Consolas, monospace;
                }

                .sm-fp-field input:hover {
                    background: #303030;
                }

                .sm-fp-field input:focus {
                    background: #343434;
                    border-color: rgba(199,123,54,.62);
                }

                .sm-fp-icon-btn {
                    width: 25px;
                    height: 25px;
                    display: grid;
                    place-items: center;
                    font-size: 8px;
                    background: #303030;
                }

                .sm-fp-resolved {
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding-top: 3px;
                    color: #676767;
                    font: 7px "Cascadia Mono", Consolas, monospace;
                }

                .sm-fp-resolved i {
                    flex: 0 0 auto;
                    color: #676767;
                    font-size: 7px;
                }

                .sm-fp-resolved span {
                    min-width: 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .sm-fp-row.state-ok .sm-fp-resolved i {
                    color: #789784;
                }

                .sm-fp-row.state-warning .sm-fp-resolved i {
                    color: #b28d62;
                }

                .sm-fp-row.state-error .sm-fp-resolved i {
                    color: #b86f69;
                }

                .sm-fp-row.state-error .sm-fp-field input {
                    border-color: rgba(184,111,105,.55);
                }

                .sm-fp-validation {
                    min-height: 33px;
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    padding: 5px 9px;
                    color: #858585;
                    background: #2d2d2d;
                    border: 1px solid var(--settings-border, rgba(255,255,255,.065));
                    font-size: 8px;
                }

                .sm-fp-validation small {
                    margin-left: auto;
                    color: #626262;
                    font: 7px "Cascadia Mono", Consolas, monospace;
                }

                .sm-fp-validation.ok > i {
                    color: #789784;
                }

                .sm-fp-validation.warning > i {
                    color: #b28d62;
                }

                .sm-fp-validation.error > i {
                    color: #b86f69;
                }

                .sm-fp-empty {
                    min-height: 180px;
                    display: grid;
                    place-items: center;
                    color: #777;
                    font-size: 9px;
                }

                @media (max-width: 900px) {
                    .sm-fp-header,
                    .sm-fp-modebar {
                        align-items: flex-start;
                        flex-direction: column;
                    }

                    .sm-fp-options {
                        grid-template-columns: 1fr;
                    }

                    .sm-fp-row {
                        grid-template-columns: 1fr;
                        grid-template-rows: auto auto auto;
                        gap: 4px;
                        padding: 7px 0;
                    }

                    .sm-fp-label {
                        grid-row: auto;
                        justify-content: flex-start;
                        text-align: left;
                    }
                }
            `;

            document.head.appendChild(
                style
            );
        }

        debug() {
            console.table({
                Mounted:
                    !!this.root
                        ?.isConnected,
                Busy:
                    this.busy,
                Validated:
                    !!this
                        .lastValidation,
                Native:
                    this.manager
                        ?.getNativeRootStatus()
                        ?.connected ||
                    false
            });
        }
    }

    const ui =
        new SMFilePathsSettingsUI();

    window.SMFilePathsSettingsUI =
        ui;

    window.smFilePathsSettingsUI =
        ui;

    ui.mountWhenReady();
})();