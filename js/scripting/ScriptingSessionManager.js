/**
 * js/scripting/ScriptingSessionManager.js
 * Persists lightweight authoring UI state without owning editor logic.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'sm_scripting_session_v2';

    class ScriptingSessionManager {
        constructor() {
            this.initialized = false;
            this.state = {
                editorTab: 'js',
                consoleTab: 'output',
                activityView: 'explorer',
                minimap: true,
                wordWrap: 'off'
            };
            this._saveTimer = 0;
        }

        init() {
            if (this.initialized) return this;
            this.load();
            this.bind();
            this.initialized = true;
            return this;
        }

        load() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                this.state = { ...this.state, ...saved };
            } catch (_) {}
            return this.state;
        }

        save() {
            clearTimeout(this._saveTimer);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            } catch (_) {}
            return this;
        }

        scheduleSave() {
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => this.save(), 120);
        }

        bind() {
            document.addEventListener('click', event => {
                const editorTab = event.target.closest?.('.editor-tab[data-tab]');
                if (editorTab) {
                    this.state.editorTab = editorTab.dataset.tab || 'js';
                    this.scheduleSave();
                }

                const consoleTab = event.target.closest?.('.console-tab[data-console]');
                if (consoleTab) {
                    this.state.consoleTab = consoleTab.dataset.console || 'output';
                    this.scheduleSave();
                }

                const activityButton = event.target.closest?.('.activity-btn[data-view]');
                if (activityButton) {
                    this.state.activityView = activityButton.dataset.view || 'explorer';
                    this.scheduleSave();
                }
            }, true);

            window.addEventListener('sm:scripting-mode-changed', event => {
                if (event.detail?.active) this.restore();
                else this.captureMonacoOptions();
            });
        }

        captureMonacoOptions() {
            const editor = window.smMonacoEditor;
            if (!editor) return this;

            try {
                const options = editor.getRawOptions?.() || {};
                this.state.wordWrap = options.wordWrap || this.state.wordWrap;
                this.state.minimap = options.minimap?.enabled ?? this.state.minimap;
            } catch (_) {}

            this.scheduleSave();
            return this;
        }

        restore() {
            const clickMatching = (selector) => {
                const node = document.querySelector(selector);
                if (node && !node.classList.contains('active')) node.click();
            };

            clickMatching(`.editor-tab[data-tab="${CSS.escape(this.state.editorTab || 'js')}"]`);
            clickMatching(`.console-tab[data-console="${CSS.escape(this.state.consoleTab || 'output')}"]`);
            clickMatching(`.activity-btn[data-view="${CSS.escape(this.state.activityView || 'explorer')}"]`);

            const editor = window.smMonacoEditor;
            if (editor?.updateOptions) {
                try {
                    editor.updateOptions({
                        wordWrap: this.state.wordWrap || 'off',
                        minimap: { enabled: this.state.minimap !== false }
                    });
                    editor.layout?.();
                } catch (_) {}
            }

            return this;
        }

        setWordWrap(value) {
            this.state.wordWrap = value === 'on' ? 'on' : 'off';
            window.smMonacoEditor?.updateOptions?.({ wordWrap: this.state.wordWrap });
            this.scheduleSave();
            return this;
        }

        setMinimap(enabled) {
            this.state.minimap = Boolean(enabled);
            window.smMonacoEditor?.updateOptions?.({
                minimap: { enabled: this.state.minimap }
            });
            this.scheduleSave();
            return this;
        }

        reset() {
            localStorage.removeItem(STORAGE_KEY);
            this.state = {
                editorTab: 'js',
                consoleTab: 'output',
                activityView: 'explorer',
                minimap: true,
                wordWrap: 'off'
            };
            return this.restore();
        }
    }

    window.ScriptingSessionManager =
        window.ScriptingSessionManager ||
        new ScriptingSessionManager();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.ScriptingSessionManager.init();
        }, { once: true });
    } else {
        window.ScriptingSessionManager.init();
    }
})();