(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class KeyboardShortcuts {
        constructor(historyManager) {
            this.historyManager = historyManager;
            this.boundHandler = this.onKeyDown.bind(this);
            this.bind();
        }

        bind() {
            window.addEventListener('keydown', this.boundHandler);
        }

        unbind() {
            window.removeEventListener('keydown', this.boundHandler);
        }

        onKeyDown(e) {
            const target = e.target;
            const tag = target && target.tagName ? target.tagName.toLowerCase() : '';

            // Ignore when typing in inputs, textareas, CodeMirror, or Monaco editors
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable || target?.closest('.CodeMirror') || target?.closest('.monaco-editor')) {
                return;
            }

            const isCtrlOrMeta = e.ctrlKey || e.metaKey;
            if (!isCtrlOrMeta) return;

            const key = e.key.toLowerCase();

            if (key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.historyManager?.redo();
                } else {
                    this.historyManager?.undo();
                }
            } else if (key === 'y') {
                e.preventDefault();
                this.historyManager?.redo();
            }
        }
    }

    H.KeyboardShortcuts = KeyboardShortcuts;
})();