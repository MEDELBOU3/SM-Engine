/**
 * game-ui/editor/GameUIToolbar.js
 * Native authoring toolbar. Save/Build are owned here, not injected by observers.
 */
(function () {
    'use strict';

    class GameUIToolbar {
        constructor(options = {}) {
            this.container = options.container || null;
            this.editorManager = options.editorManager || null;
            this.widgetLibrary = options.widgetLibrary || window.uiWidgetLibrary || null;
            this.root = null;
        }

        init(container = this.container) {
            if (container) this.container = container;
            if (!this.container) throw new Error('GameUIToolbar.init(): container is required.');
            if (!this.root) {
                this.root = document.createElement('div');
                this.root.className = 'game-ui-toolbar';
                this.container.appendChild(this.root);
            }
            this.render();
            return this;
        }

        render() {
            if (!this.root) return this;
            this.root.replaceChildren();

            const button = (label, action, title = label, className = '') => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.title = title;
                if (className) b.className = className;
                b.addEventListener('click', action);
                this.root.appendChild(b);
                return b;
            };
            const sep = () => {
                const s = document.createElement('span');
                s.className = 'game-ui-toolbar-separator';
                this.root.appendChild(s);
            };
            const spacer = () => {
                const s = document.createElement('span');
                s.className = 'game-ui-toolbar-spacer';
                this.root.appendChild(s);
            };

            button('+ Panel', () => this.editorManager?.createWidget?.('panel'));
            button('+ Text', () => this.editorManager?.createWidget?.('text'));
            button('+ Image', () => this.editorManager?.createWidget?.('image'));
            button('+ Button', () => this.editorManager?.createWidget?.('button'));
            button('+ Progress', () => this.editorManager?.createWidget?.('progressBar'));

            sep();
            button('−', () => this.editorManager?.canvasEditor?.zoomOut?.(), 'Zoom Out');
            button('Fit', () => this.editorManager?.canvasEditor?.fitToView?.(), 'Fit Canvas');
            button('+', () => this.editorManager?.canvasEditor?.zoomIn?.(), 'Zoom In');
            button('Grid', () => {
                const c = this.editorManager?.canvasEditor;
                if (c) c.setGridVisible(!c.showGrid);
            }, 'Toggle Grid');
            button('Snap', () => {
                const c = this.editorManager?.canvasEditor;
                if (c) c.setSnapEnabled(!c.snapEnabled);
            }, 'Toggle Snap');

            spacer();

            button('Duplicate', () => this.editorManager?.duplicateSelection?.());
            button('Delete', () => this.editorManager?.deleteSelection?.());

            sep();

            const preview = button(
                this.editorManager?.previewActive ? 'Stop UI' : 'Play UI',
                () => this.editorManager?.preview?.(),
                'Preview Game UI',
                this.editorManager?.previewActive ? 'active' : ''
            );
            preview.dataset.role = 'preview';

            button('New', () => {
                if (confirm('Create a new Game UI document?')) {
                    window.GameUIMode?.resetDocument?.();
                }
            }, 'New Game UI');

            button('Open', () => this._openDocument(), 'Open .gameui.json');

            button('Save UI', () => {
                const doc = window.gameUIManager?.activeDocument;
                if (!doc) return;
                window.GameUIMode?.save?.();
                window.gameUIBuildPipeline?.saveEditorDocument?.(doc);
            }, 'Save editable Game UI source');

            button('Build UI', () => {
                const doc = window.gameUIManager?.activeDocument;
                if (!doc) return;
                window.GameUIMode?.save?.();
                window.gameUIBuildPipeline?.build?.(doc, {
                    target: 'game',
                    pretty: true,
                    stripMetadata: true,
                    download: true
                });
            }, 'Compile runtime UI asset');

            button('Exit', () => window.closeGameUIMode?.(), 'Exit Game UI Mode');
            return this;
        }

        _openDocument() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.gameui.json,.json,application/json';
            input.style.display = 'none';
            input.addEventListener('change', async () => {
                const file = input.files?.[0];
                input.remove();
                if (!file) return;
                try {
                    const doc = await window.gameUISerializer.readFile(file, {
                        widgetLibrary: window.uiWidgetLibrary
                    });
                    window.gameUIManager?.registerDocument?.(doc);
                    window.gameUIManager?.setActiveDocument?.(doc);
                    if (window.GameUIMode) window.GameUIMode.document = doc;
                    this.editorManager?.setDocument?.(doc);
                    window.GameUIMode?.save?.();
                    requestAnimationFrame(() => this.editorManager?.canvasEditor?.fitToView?.());
                } catch (error) {
                    console.error('[Game UI] Open failed:', error);
                }
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        }

        destroy() {
            this.root?.remove();
            this.root = null;
        }
    }

    window.GameUIToolbar = GameUIToolbar;
})();