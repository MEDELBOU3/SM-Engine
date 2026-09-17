/**
 * game-ui/editor/GameUIEditorManager.js
 * Stable authoring coordinator with isolated runtime preview.
 * Integrates parallel rendering across canvas, inspector, and hierarchy.
 */
(function () {
    'use strict';

    class GameUIEditorManager {
        constructor(options = {}) {
            this.container = options.container || null;
            this.document = options.document || null;
            this.manager = options.manager || window.gameUIManager || null;
            this.selectionManager = options.selectionManager || window.gameUISelectionManager || null;
            this.widgetLibrary = options.widgetLibrary || window.uiWidgetLibrary || null;

            this.canvasEditor = null;
            this.hierarchyPanel = null;
            this.inspectorPanel = null;
            this.toolbar = null;

            this.root = null;
            this.toolbarHost = null;
            this.hierarchyHost = null;
            this.canvasHost = null;
            this.inspectorHost = null;
            this.previewHost = null;
            this.previewActive = false;
            this.initialized = false;

            this._onLayoutResized = this._onLayoutResized.bind(this);
            this._onRuntimeStopped = this._onRuntimeStopped.bind(this);
        }

        init(container = this.container) {
            if (container) this.container = container;
            if (!this.container) {
                this.container = document.getElementById('game-ui-editor-container');
            }
            if (!this.container) throw new Error('GameUIEditorManager.init(): container is required.');
            if (this.initialized) return this;

            this.manager = this.manager || window.gameUIManager;
            this.selectionManager = this.selectionManager || window.gameUISelectionManager;
            this.widgetLibrary = this.widgetLibrary || window.uiWidgetLibrary;

            this._buildLayout();

            this.selectionManager?.setDocument?.(this.document);

            this.canvasEditor = new window.GameUICanvasEditor({
                container: this.canvasHost,
                document: this.document,
                selectionManager: this.selectionManager
            });
            this.hierarchyPanel = new window.GameUIHierarchyPanel({
                container: this.hierarchyHost,
                document: this.document,
                selectionManager: this.selectionManager,
                manager: this.manager
            });
            this.inspectorPanel = new window.GameUIInspectorPanel({
                container: this.inspectorHost,
                document: this.document,
                selectionManager: this.selectionManager,
                manager: this.manager
            });
            this.toolbar = new window.GameUIToolbar({
                container: this.toolbarHost,
                editorManager: this,
                widgetLibrary: this.widgetLibrary
            });

            this.canvasEditor.init();
            this.hierarchyPanel.init();
            this.inspectorPanel.init();
            this.toolbar.init();

            window.addEventListener('sm:layout-resized', this._onLayoutResized);
            window.addEventListener('gameui:runtime-stopped', this._onRuntimeStopped);

            this.initialized = true;
            requestAnimationFrame(() => this.canvasEditor.fitToView());
            return this;
        }

        setDocument(uiDocument) {
            this.stopPreview();
            this.document = uiDocument || null;
            this.selectionManager?.setDocument?.(this.document);
            this.canvasEditor?.setDocument?.(this.document);
            this.hierarchyPanel?.setDocument?.(this.document);
            this.inspectorPanel?.setDocument?.(this.document);
            this.toolbar?.render?.();
            return this;
        }

        setInteractive(state) {
            this.canvasEditor?.setInteractive?.(state);
            return this;
        }

        createWidget(type, options = {}) {
            if (!this.document) return null;
            const parent = this.selectionManager?.getPrimaryWidget?.();
            const parentId = parent?.type === 'panel' ? parent.id : null;
            const widget = this.manager?.createWidget?.(
                type,
                { x: options.x ?? 100, y: options.y ?? 100, ...options },
                parentId,
                this.document
            );
            if (!widget) return null;
            this.selectionManager?.select?.(widget, { source: 'create-widget' });
            this.refresh();
            return widget;
        }

        deleteSelection() {
            if (!this.document) return 0;
            const selected = this.selectionManager?.getSelectedWidgets?.() || [];
            let count = 0;
            for (const widget of [...selected]) {
                if (this.manager?.deleteWidget?.(widget, this.document)) count++;
            }
            this.selectionManager?.clear?.();
            this.refresh();
            return count;
        }

        duplicateSelection() {
            if (!this.document) return [];
            const selected = this.selectionManager?.getSelectedWidgets?.() || [];
            const created = [];
            for (const widget of selected) {
                const clone = this.manager?.duplicateWidget?.(
                    widget,
                    { offsetX: 20, offsetY: 20 },
                    this.document
                );
                if (clone) created.push(clone);
            }
            if (created.length) {
                this.selectionManager?.clear?.({ silent: true });
                this.selectionManager?.selectMany?.(created, { source: 'duplicate' });
            }
            this.refresh();
            return created;
        }

        preview() {
            return this.previewActive ? this.stopPreview() : this.startPreview();
        }

        startPreview() {
            if (!this.document || this.previewActive) return false;
            const runtime = window.gameUIRuntime;
            if (!runtime || !this.previewHost) return false;

            this.previewHost.style.display = 'block';
            this.previewHost.replaceChildren();
            this.previewActive = true;
            this.setInteractive(false);
            this.root?.classList.add('is-previewing');

            runtime.stop?.();
            runtime.setDocument?.(this.document);

            const context = window.uiBindingContext;
            if (context) {
                if (window.player) context.set?.('player', window.player);
                if (window.weaponSystem) context.set?.('weapon', window.weaponSystem);
                if (window.gameManager) context.set?.('game', window.gameManager);
            }

            const started = runtime.start?.({
                document: this.document,
                container: this.previewHost,
                externalLoop: false,
                autoFocus: true
            });

            if (!started) {
                this.previewActive = false;
                this.previewHost.style.display = 'none';
                this.setInteractive(true);
                this.root?.classList.remove('is-previewing');
                return false;
            }

            this.toolbar?.render?.();
            return true;
        }

        stopPreview() {
            if (!this.previewActive) return false;
            this.previewActive = false;
            window.gameUIRuntime?.stop?.();
            if (this.previewHost) {
                this.previewHost.style.display = 'none';
                this.previewHost.replaceChildren();
            }
            this.root?.classList.remove('is-previewing');
            this.setInteractive(true);
            this.toolbar?.render?.();
            return true;
        }

        refresh() {
            this.canvasEditor?.render?.();
            this.hierarchyPanel?.render?.();
            this.inspectorPanel?.render?.();
            if (window.gameUIRuntime?.running) {
                window.gameUIRuntime.refreshLayout?.(true);
                window.SMGameUIPIEBridge?.refresh?.();
            }
            return this;
        }

        _buildLayout() {
            this.root = document.createElement('div');
            this.root.className = 'game-ui-editor-workspace';

            this.toolbarHost = document.createElement('div');
            this.toolbarHost.className = 'game-ui-editor-toolbar-host';

            const body = document.createElement('div');
            body.className = 'game-ui-editor-body';

            this.hierarchyHost = document.createElement('aside');
            this.hierarchyHost.className = 'game-ui-editor-hierarchy-host';

            this.canvasHost = document.createElement('main');
            this.canvasHost.className = 'game-ui-editor-canvas-host';

            this.previewHost = document.createElement('div');
            this.previewHost.className = 'game-ui-preview-host';
            this.previewHost.style.display = 'none';
            this.canvasHost.appendChild(this.previewHost);

            this.inspectorHost = document.createElement('aside');
            this.inspectorHost.className = 'game-ui-editor-inspector-host';

            body.append(this.hierarchyHost, this.canvasHost, this.inspectorHost);
            this.root.append(this.toolbarHost, body);
            this.container.replaceChildren(this.root);
        }

        _onLayoutResized() {
            if (!this.initialized) return;
            this.canvasEditor?.handleContainerResize?.();
            window.gameUIRuntime?.refreshLayout?.(true);
        }

        _onRuntimeStopped(event) {
            if (!this.previewActive) return;
            if (event?.detail?.runtime !== window.gameUIRuntime) return;
            this.previewActive = false;
            if (this.previewHost) this.previewHost.style.display = 'none';
            this.root?.classList.remove('is-previewing');
            this.setInteractive(true);
            this.toolbar?.render?.();
        }

        destroy() {
            this.stopPreview();
            window.removeEventListener('sm:layout-resized', this._onLayoutResized);
            window.removeEventListener('gameui:runtime-stopped', this._onRuntimeStopped);

            this.canvasEditor?.destroy?.();
            this.hierarchyPanel?.destroy?.();
            this.inspectorPanel?.destroy?.();
            this.toolbar?.destroy?.();
            this.root?.remove();

            this.canvasEditor = null;
            this.hierarchyPanel = null;
            this.inspectorPanel = null;
            this.toolbar = null;
            this.root = null;
            this.previewHost = null;
            this.initialized = false;
        }
    }

    window.GameUIEditorManager = GameUIEditorManager;
    window.gameUIEditorManager = window.gameUIEditorManager || new GameUIEditorManager();
})();