/**
 * game-ui/editor/GameUIMode.js
 * Canonical single-owner Game UI authoring mode.
 * Matches the live Game Window viewport and injects runtime stylesheets.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'sm_game_ui_main_document';
    const BODY_CLASS = 'game-ui-workspace-active';

    const GameUIMode = {
        active: false,
        initialized: false,
        document: null,
        host: null,
        button: null,
        _toolbarObserver: null,
        _resizeObserver: null,
        _layoutRaf: 0,
        _saveTimer: 0,
        _managerUnsubs: [],
        _previousControlsEnabled: null,
        _previousTransformVisible: null,

        init() {
            if (this.initialized) {
                this._ensureButton();
                return this;
            }

            this._ensureStylesheet();
            this._ensureHost();
            this._ensureButton();
            this._watchToolbar();
            this._bindWorkspaceSwitching();
            this._bindResize();
            this._bindAutosave();
            this._patchWorkspaceManagerOnce();

            this.initialized = true;
            return this;
        },

        enter() {
            this.init();
            if (this.active) return true;
            if (!this._validateSystems()) return false;

            // Close other editor sub-modes first
            window.closeCodeEditor?.();
            window.SMCodeWorkspace?.setVisible?.(false);
            try { window.exit2DAnimationMode?.(); } catch (_) {}
            try {
                if (window.animation2DManager?.isActive) window.animation2DManager.exitMode?.();
            } catch (_) {}

            window.gameUIEditorManager?.stopPreview?.();

            this.document = this._ensureDocument();
            if (!this.document) return false;

            window.gameUIManager.init?.({
                editor: window.gameUIEditorManager,
                runtime: window.gameUIRuntime,
                widgetLibrary: window.uiWidgetLibrary,
                serializer: window.gameUISerializer
            });

            window.gameUIEditorManager.setDocument(this.document);
            window.gameUIEditorManager.init(this.host);

            this._captureViewportState();
            this._disableViewportInteraction();

            this.active = true;
            document.body.classList.add(BODY_CLASS);
            this.host.style.display = 'block';
            this.host.setAttribute('aria-hidden', 'false');

            this.button = document.getElementById('game-ui-mode-btn');
            this.button?.classList.add('active');
            this.button?.setAttribute('aria-pressed', 'true');

            this._syncLayout({ fit: true });
            window.gameUIEditorManager?.canvasEditor?.syncToGameWindow?.({ fit: true });

            window.dispatchEvent(new CustomEvent('sm:game-ui-mode-changed', {
                detail: { active: true, document: this.document }
            }));
            return true;
        },

        exit(options = {}) {
            if (!this.active) return true;

            window.gameUIEditorManager?.stopPreview?.();

            // Runtime PIE unmounts its DOM. Rebuild the editor-owned DOM before
            // hiding the workspace so selection/editing never keeps stale nodes.
            window.gameUIEditorManager?.canvasEditor?.render?.();
            window.gameUIEditorManager?.canvasEditor?.fitToView?.();

            this.save();

            this.active = false;
            document.body.classList.remove(BODY_CLASS);

            if (this.host) {
                this.host.style.display = 'none';
                this.host.setAttribute('aria-hidden', 'true');
            }

            this.button = document.getElementById('game-ui-mode-btn');
            this.button?.classList.remove('active');
            this.button?.setAttribute('aria-pressed', 'false');

            this._restoreViewportState();
            this._dispatchLayout();

            window.dispatchEvent(new CustomEvent('sm:game-ui-mode-changed', {
                detail: { active: false, document: this.document }
            }));

            if (options.log !== false) console.log('[Game UI] Authoring mode closed.');
            return true;
        },

        toggle() {
            return this.active ? this.exit() : this.enter();
        },

        save() {
            const doc = this.document || window.gameUIManager?.activeDocument;
            if (!doc || !window.gameUISerializer?.serialize) return false;
            try {
                const json = window.gameUISerializer.serialize(doc, { pretty: false });
                localStorage.setItem(STORAGE_KEY, json);
                return true;
            } catch (error) {
                console.warn('[Game UI] Autosave failed:', error);
                return false;
            }
        },

        scheduleSave() {
            clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => this.save(), 180);
        },

        resetDocument() {
            window.gameUIEditorManager?.stopPreview?.();
            localStorage.removeItem(STORAGE_KEY);

            const old = this.document;
            if (old) window.gameUIManager?.unregisterDocument?.(old);

            // Defaults precisely match 1280x720 Game Window canvas bounds
            this.document = window.gameUIManager.createDocument({
                name: 'Main Game UI',
                makeActive: true,
                canvas: {
                    width: 1280,
                    height: 720,
                    referenceWidth: 1280,
                    referenceHeight: 720,
                    scaleMode: 'scale-with-screen',
                    matchMode: 'match-width-or-height',
                    match: 0.5,
                    pixelPerfect: false,
                    safeArea: true
                }
            });

            window.gameUIEditorManager?.setDocument?.(this.document);
            this.save();
            this._syncLayout({ fit: true });
            return this.document;
        },

        _ensureDocument() {
            if (this.document) {
                window.gameUIManager?.registerDocument?.(this.document);
                window.gameUIManager?.setActiveDocument?.(this.document);
                return this.document;
            }

            if (window.gameUIManager?.activeDocument) {
                this.document = window.gameUIManager.activeDocument;
                return this.document;
            }

            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const doc = window.gameUISerializer.deserialize(saved, {
                        widgetLibrary: window.uiWidgetLibrary
                    });
                    window.gameUIManager.registerDocument(doc);
                    window.gameUIManager.setActiveDocument(doc);
                    this.document = doc;
                    return doc;
                } catch (error) {
                    console.warn('[Game UI] Stored document was invalid; creating a new one.', error);
                    localStorage.removeItem(STORAGE_KEY);
                }
            }

            return this.resetDocument();
        },

        _ensureHost() {
            let host = document.getElementById('game-ui-editor-container');
            if (!host) {
                host = document.createElement('div');
                host.id = 'game-ui-editor-container';
                host.className = 'game-ui-mode-workspace';
                host.setAttribute('aria-hidden', 'true');
                document.body.appendChild(host);
            }
            host.classList.add('game-ui-mode-workspace');
            if (!this.active) host.style.display = 'none';
            this.host = host;
            return host;
        },

        _ensureButton() {
            const toolbar = document.getElementById('toolBar') || document.getElementById('subToolBar');
            if (!toolbar) return null;

            let button = document.getElementById('game-ui-mode-btn');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.id = 'game-ui-mode-btn';
                button.className = 'workspace-tab game-ui-mode-toolbar-btn';
                button.title = 'Game UI Editor';
                button.setAttribute('aria-label', 'Game UI Editor');
                button.setAttribute('aria-pressed', 'false');
                button.innerHTML = '<i class="fas fa-layer-group"></i><span>Game UI</span>';
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggle();
                });
                toolbar.appendChild(button);
            }

            button.classList.toggle('active', this.active);
            button.setAttribute('aria-pressed', this.active ? 'true' : 'false');
            this.button = button;
            return button;
        },

        _watchToolbar() {
            if (this._toolbarObserver || typeof MutationObserver === 'undefined') return;
            const toolbar = document.getElementById('toolBar');
            if (!toolbar) return;
            this._toolbarObserver = new MutationObserver(() => {
                if (!document.getElementById('game-ui-mode-btn')) this._ensureButton();
            });
            this._toolbarObserver.observe(toolbar, { childList: true });
        },

        _bindWorkspaceSwitching() {
            if (document.documentElement.dataset.gameUiWorkspaceBound === 'true') return;
            document.documentElement.dataset.gameUiWorkspaceBound = 'true';

            document.addEventListener('click', event => {
                if (!this.active) return;
                const target = event.target.closest?.('.workspace-tab, .ws-mode-card');
                if (!target || target.id === 'game-ui-mode-btn') return;
                this.exit({ log: false });
            }, true);
        },

        _patchWorkspaceManagerOnce() {
            const patch = () => {
                const manager = window.workspaceManager;
                if (!manager || manager.__gameUIExitHookPatched || typeof manager.setMode !== 'function') return false;
                const original = manager.setMode.bind(manager);
                manager.setMode = (...args) => {
                    if (this.active) this.exit({ log: false });
                    return original(...args);
                };
                manager.__gameUIExitHookPatched = true;
                return true;
            };
            if (!patch()) {
                window.addEventListener('load', patch, { once: true });
                setTimeout(patch, 0);
            }
        },

        _bindResize() {
            if (this._resizeObserver || typeof ResizeObserver === 'undefined') return;
            const host = this._ensureHost();
            this._resizeObserver = new ResizeObserver(() => {
                if (this.active) this._syncLayout();
            });
            this._resizeObserver.observe(host);
            window.addEventListener('resize', () => {
                if (this.active) this._syncLayout();
            });
        },

        _bindAutosave() {
            const manager = window.gameUIManager;
            if (!manager?.on || this._managerUnsubs.length) return;
            [
                'widget-created',
                'widget-deleted',
                'widget-moved',
                'widget-updated',
                'editor-transform-complete',
                'active-document-changed'
            ].forEach(eventName => {
                this._managerUnsubs.push(
                    manager.on(eventName, payload => {
                        if (payload?.document) this.document = payload.document;
                        this.scheduleSave();
                    })
                );
            });
        },

        _captureViewportState() {
            const controls = window.controls || window.orbitControls || window.cameraSystem?.controls || null;
            this._previousControlsEnabled = controls?.enabled ?? null;
            this._previousTransformVisible = window.transformControls?.visible ?? null;
        },

        _disableViewportInteraction() {
            const controls = window.controls || window.orbitControls || window.cameraSystem?.controls || null;
            if (controls) controls.enabled = false;
            if (window.transformControls) window.transformControls.visible = false;
        },

        _restoreViewportState() {
            const controls = window.controls || window.orbitControls || window.cameraSystem?.controls || null;
            if (controls && this._previousControlsEnabled !== null) {
                controls.enabled = this._previousControlsEnabled;
            }
            if (window.transformControls && this._previousTransformVisible !== null) {
                window.transformControls.visible = this._previousTransformVisible;
            }
            this._previousControlsEnabled = null;
            this._previousTransformVisible = null;
        },

        _syncLayout(options = {}) {
            if (!this.active || !this.host) return;
            if (this._layoutRaf) cancelAnimationFrame(this._layoutRaf);
            this._layoutRaf = requestAnimationFrame(() => {
                this._layoutRaf = 0;
                const scene = document.getElementById('editor-scene');
                const top = Math.max(
                    0,
                    Math.round(scene?.getBoundingClientRect?.().top || 0)
                );
                document.documentElement.style.setProperty('--game-ui-workspace-top', `${top}px`);
                window.gameUIEditorManager?.canvasEditor?.syncToGameWindow?.({
                    fit: options.fit === true
                });
                window.gameUIRuntime?.refreshLayout?.(true);
                this._dispatchLayout();
            });
        },

        _dispatchLayout() {
            window.dispatchEvent(new CustomEvent('sm:layout-resized', {
                detail: { source: 'game-ui-workspace' }
            }));
        },

        _ensureStylesheet() {
            const sheets = [
                'game-ui/editor/game-ui-editor.css',
                'game-ui/runtime/game-ui-runtime.css'
            ];

            sheets.forEach(href => {
                const exists = [...document.styleSheets].some(sheet => sheet.href?.includes(href));
                if (!exists) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = href;
                    document.head.appendChild(link);
                }
            });
        },

        _validateSystems() {
            const required = [
                ['GameUIDocument', window.GameUIDocument],
                ['gameUIManager', window.gameUIManager],
                ['gameUISerializer', window.gameUISerializer],
                ['uiWidgetLibrary', window.uiWidgetLibrary],
                ['gameUIEditorManager', window.gameUIEditorManager]
            ];
            const missing = required.filter(([, value]) => !value).map(([name]) => name);
            if (missing.length) {
                console.error('[Game UI] Missing systems:', missing.join(', '));
                return false;
            }
            return true;
        }
    };

    window.GameUIMode = GameUIMode;
    window.openGameUIMode = () => GameUIMode.enter();
    window.closeGameUIMode = () => GameUIMode.exit();
    window.toggleGameUIMode = () => GameUIMode.toggle();

    const boot = () => GameUIMode.init();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();