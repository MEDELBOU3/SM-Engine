/**
 * js/scripting/editor-mode-rescue.js
 * SM Engine — Scripting Workspace V2 / Phase 1
 *
 * Canonical owner of:
 * - openCodeEditor()
 * - closeCodeEditor()
 * - SMCodeWorkspace
 *
 * Rules:
 * - #renderer-container NEVER moves.
 * - #editor-scene is positioned by CSS while scripting mode is active.
 * - Monaco/CodeMirror layout refresh is dispatched through one throttled path.
 * - Workspace sizes are persisted.
 * - Other workspace modes close scripting through delegated events.
 */
(function () {
    'use strict';

    const BODY_CLASS = 'scripting-workspace-active';
    const STORAGE_KEY = 'sm_scripting_workspace_v2';

    const state = {
        initialized: false,
        active: false,
        layoutFrame: 0,
        viewportObserver: null,
        panelObserver: null,
        outlinerHome: null,
        outlinerNext: null,
        consoleHome: null,
        consoleNext: null,
        listeners: [],
        resizeSession: null,
        savedLayout: {
            previewWidth: 430,
            consoleHeight: 220
        }
    };

    function on(target, type, handler, options) {
        if (!target?.addEventListener) return;
        target.addEventListener(type, handler, options);
        state.listeners.push(() => target.removeEventListener(type, handler, options));
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function loadLayout() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            if (Number.isFinite(Number(parsed.previewWidth))) {
                state.savedLayout.previewWidth = Number(parsed.previewWidth);
            }
            if (Number.isFinite(Number(parsed.consoleHeight))) {
                state.savedLayout.consoleHeight = Number(parsed.consoleHeight);
            }
        } catch (_) {}
        applyStoredLayout();
    }

    function saveLayout() {
        const style = getComputedStyle(document.body);
        const previewWidth = parseFloat(style.getPropertyValue('--scripting-preview-width')) ||
            state.savedLayout.previewWidth;
        const consoleHeight = parseFloat(style.getPropertyValue('--scripting-console-h')) ||
            state.savedLayout.consoleHeight;

        state.savedLayout.previewWidth = previewWidth;
        state.savedLayout.consoleHeight = consoleHeight;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                previewWidth,
                consoleHeight
            }));
        } catch (_) {}
    }

    function applyStoredLayout() {
        document.body.style.setProperty(
            '--scripting-preview-width',
            `${Math.round(state.savedLayout.previewWidth)}px`
        );
        document.body.style.setProperty(
            '--scripting-console-h',
            `${Math.round(state.savedLayout.consoleHeight)}px`
        );
    }

    function refreshEditors() {
        try { window.smMonacoEditor?.layout?.(); } catch (_) {}

        const allEditors =
            (typeof window.editors !== 'undefined' && window.editors) ||
            (typeof editors !== 'undefined' ? editors : null);

        if (allEditors && typeof allEditors === 'object') {
            Object.values(allEditors).forEach(editor => {
                try { editor?.refresh?.(); } catch (_) {}
            });
        }
    }

    function syncScriptingViewport() {
        if (!state.active || !document.body.classList.contains(BODY_CLASS)) return;

        const sceneHost = document.getElementById('editor-scene');
        const renderer = window.renderer;
        const camera =
            window.cameraSystem?.camera ||
            window.camera ||
            null;

        if (!sceneHost || !renderer) return;

        const rect = sceneHost.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        if (width < 2 || height < 2) return;

        try {
            renderer.setSize?.(width, height, false);
            renderer.setViewport?.(0, 0, width, height);
            renderer.setScissorTest?.(false);
            window.composer?.setSize?.(width, height);
            window.SMEngineRenderer?.resize?.(width, height);
        } catch (error) {
            console.warn('[ScriptingWorkspace] Renderer resize warning:', error);
        }

        if (camera) {
            if (camera.isPerspectiveCamera) {
                camera.aspect = width / Math.max(1, height);
            } else if (camera.isOrthographicCamera) {
                // Do not overwrite user zoom/frustum; only refresh projection.
            }
            camera.clearViewOffset?.();
            camera.updateProjectionMatrix?.();
        }

        const controls =
            window.cameraSystem?.controls ||
            window.controls ||
            window.orbitControls ||
            null;
        controls?.update?.();
    }

    function dispatchLayout(source = 'scripting-workspace') {
        if (state.layoutFrame) return;

        state.layoutFrame = requestAnimationFrame(() => {
            state.layoutFrame = 0;
            syncScriptingViewport();
            refreshEditors();

            window.dispatchEvent(new CustomEvent('sm:layout-resized', {
                detail: { source }
            }));
        });
    }

    window.refreshCodeEditorLayout = refreshEditors;

    function focusOnObject(targetObject = null) {
        const object =
            targetObject ||
            window.selectedObject ||
            window.selectionManager?.activeObject ||
            window.transformControls?.object ||
            null;

        const camera =
            window.cameraSystem?.camera ||
            window.camera ||
            null;

        const controls =
            window.cameraSystem?.controls ||
            window.controls ||
            window.orbitControls ||
            null;

        if (!camera || typeof THREE === 'undefined') return false;

        const box = object ? new THREE.Box3().setFromObject(object) : null;
        const target = new THREE.Vector3();

        if (box && !box.isEmpty()) {
            box.getCenter(target);
        } else if (object?.getWorldPosition) {
            object.getWorldPosition(target);
        } else if (object?.position) {
            target.copy(object.position);
        }

        if (controls?.target) {
            controls.target.copy(target);
            controls.update?.();
        } else {
            camera.lookAt?.(target);
        }

        return true;
    }

    window.focusOnObject = focusOnObject;

    function rememberOutliner(node) {
        if (!node || state.outlinerHome) return;
        state.outlinerHome = node.parentNode;
        state.outlinerNext = node.nextSibling;
    }

    function restoreOutliner() {
        const node = document.getElementById('hierarchy-list-content');
        const home = state.outlinerHome;
        const next = state.outlinerNext;

        if (node && home) {
            home.insertBefore(
                node,
                next && next.parentNode === home ? next : null
            );
        }

        state.outlinerHome = null;
        state.outlinerNext = null;
        document.getElementById('scripting-outliner-wrapper')?.remove();
        window.hierarchyManager?.renderAll?.();
    }

    function dockOutliner() {
        const list = document.getElementById('hierarchy-list-content');
        const inspectorMain = document.getElementById('inspector-main-content');
        const transformContainer = document.getElementById('transformContainer');

        if (!list || !inspectorMain) return false;

        rememberOutliner(list);

        let wrapper = document.getElementById('scripting-outliner-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('section');
            wrapper.id = 'scripting-outliner-wrapper';
            wrapper.className = 'property-group scripting-outliner-wrapper';
            wrapper.innerHTML = `
                <div class="scripting-outliner-title">
                    <span>Outliner</span>
                    <span class="scripting-outliner-context">Scene</span>
                </div>
            `;
        }

        wrapper.appendChild(list);

        if (
            transformContainer &&
            transformContainer.parentNode === inspectorMain
        ) {
            inspectorMain.insertBefore(wrapper, transformContainer);
        } else if (wrapper.parentNode !== inspectorMain) {
            inspectorMain.prepend(wrapper);
        }

        window.hierarchyManager?.renderAll?.();
        return true;
    }

    function dockConsole() {
        const slot = document.getElementById('scripting-console-slot');
        const consolePanel =
            document.querySelector('#code-editor-panel .vs-bottom-panel') ||
            document.querySelector('.vs-bottom-panel');

        if (!slot || !consolePanel) return false;
        if (consolePanel.parentNode === slot) return true;

        if (!state.consoleHome) {
            state.consoleHome = consolePanel.parentNode;
            state.consoleNext = consolePanel.nextSibling;
        }

        slot.appendChild(consolePanel);
        return true;
    }

    function restoreConsole() {
        const consolePanel =
            document.querySelector('#scripting-console-slot .vs-bottom-panel') ||
            document.querySelector('.vs-bottom-panel');

        if (!consolePanel || !state.consoleHome) {
            state.consoleHome = null;
            state.consoleNext = null;
            return;
        }

        state.consoleHome.insertBefore(
            consolePanel,
            state.consoleNext && state.consoleNext.parentNode === state.consoleHome
                ? state.consoleNext
                : null
        );

        state.consoleHome = null;
        state.consoleNext = null;
    }

    function closeCompetingModes() {
        try { window.GameUIMode?.exit?.({ log: false }); } catch (_) {}
        try { window.videoEditingManager?.exit?.(); } catch (_) {}

        try {
            if (window.animation2DManager?.isActive) {
                window.animation2DManager.exitMode?.();
            }
        } catch (_) {}

        try {
            if (window.isModelingMode && typeof window.exitModelingMode === 'function') {
                window.exitModelingMode();
            }
        } catch (_) {}
    }

    function setVisible(visible = null) {
        const panel = document.getElementById('code-editor-panel');
        if (!panel) {
            console.warn('[ScriptingWorkspace] #code-editor-panel not found.');
            return false;
        }

        const shouldShow =
            visible == null
                ? !state.active
                : Boolean(visible);

        if (shouldShow === state.active) {
            if (shouldShow) dispatchLayout('scripting-refresh');
            return state.active;
        }

        if (shouldShow) {
            closeCompetingModes();
            state.active = true;
            document.body.classList.add(BODY_CLASS);
            panel.classList.add('open');
            panel.style.display = 'flex';

            applyStoredLayout();
            dockConsole();
            dockOutliner();

            const button = document.getElementById('open-editor-btn');
            button?.classList.add('active');
            button?.setAttribute('aria-pressed', 'true');

            window.initializeMonacoEditorWhenPossible?.();
            window.ScriptingSessionManager?.restore?.();

            requestAnimationFrame(() => {
                dispatchLayout('scripting-open');
                requestAnimationFrame(() => dispatchLayout('scripting-open-stable'));
            });

            window.dispatchEvent(new CustomEvent('sm:scripting-mode-changed', {
                detail: { active: true }
            }));
        } else {
            saveLayout();

            state.active = false;
            restoreConsole();
            restoreOutliner();

            document.body.classList.remove(BODY_CLASS);
            panel.classList.remove('open');
            panel.style.display = 'none';

            const button = document.getElementById('open-editor-btn');
            button?.classList.remove('active');
            button?.setAttribute('aria-pressed', 'false');

            requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent('sm:layout-resized', {
                    detail: { source: 'scripting-close' }
                }));
            });

            window.dispatchEvent(new CustomEvent('sm:scripting-mode-changed', {
                detail: { active: false }
            }));
        }

        return state.active;
    }

    function beginColumnResize(event) {
        if (!state.active) return;
        const panel = document.getElementById('code-editor-panel');
        if (!panel) return;

        event.preventDefault();
        document.body.classList.add('scripting-column-resizing');

        const pointerId = event.pointerId;
        event.currentTarget?.setPointerCapture?.(pointerId);

        state.resizeSession = { type: 'column', pointerId };

        const move = moveEvent => {
            if (state.resizeSession?.type !== 'column') return;
            const rect = panel.getBoundingClientRect();

            const min = 280;
            const max = Math.max(min, rect.width * 0.62);
            const width = clamp(moveEvent.clientX - rect.left, min, max);

            document.body.style.setProperty(
                '--scripting-preview-width',
                `${Math.round(width)}px`
            );

            dispatchLayout('scripting-column-resize');
        };

        const end = () => {
            state.resizeSession = null;
            document.body.classList.remove('scripting-column-resizing');
            window.removeEventListener('pointermove', move);
            saveLayout();
            dispatchLayout('scripting-column-resize-end');
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end, { once: true });
        window.addEventListener('pointercancel', end, { once: true });
    }

    function beginConsoleResize(event) {
        if (!state.active) return;

        const panel = document.getElementById('code-editor-panel');
        const dock = panel?.querySelector('.scripting-left-dock');
        if (!dock) return;

        event.preventDefault();
        event.stopPropagation();
        document.body.classList.add('scripting-console-resizing');

        state.resizeSession = { type: 'console', pointerId: event.pointerId };

        const move = moveEvent => {
            if (state.resizeSession?.type !== 'console') return;

            const rect = dock.getBoundingClientRect();
            const min = 110;
            const max = Math.max(min, rect.height * 0.68);
            const height = clamp(rect.bottom - moveEvent.clientY, min, max);

            document.body.style.setProperty(
                '--scripting-console-h',
                `${Math.round(height)}px`
            );

            dispatchLayout('scripting-console-resize');
        };

        const end = () => {
            state.resizeSession = null;
            document.body.classList.remove('scripting-console-resizing');
            window.removeEventListener('pointermove', move);
            saveLayout();
            dispatchLayout('scripting-console-resize-end');
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end, { once: true });
        window.addEventListener('pointercancel', end, { once: true });
    }

    function bindViewportSelection() {
        const container = document.getElementById('renderer-container');
        if (!container || container.dataset.smScriptingSelectionV2 === '1') return;

        container.dataset.smScriptingSelectionV2 = '1';

        let down = null;

        on(container, 'pointerdown', event => {
            if (!state.active || event.button !== 0) return;
            down = { x: event.clientX, y: event.clientY };
        });

        on(container, 'pointerup', event => {
            if (!state.active || event.button !== 0 || !down) return;

            const moved = Math.hypot(
                event.clientX - down.x,
                event.clientY - down.y
            );
            down = null;

            if (moved > 6) return;
            if (window.transformControls?.dragging || window.transformControlsActive) return;

            const viewport = document.getElementById('editor-scene');
            const rect = viewport?.getBoundingClientRect?.();
            if (!rect || rect.width < 2 || rect.height < 2) return;

            const camera =
                window.cameraSystem?.camera ||
                window.camera ||
                null;
            const scene = window.scene;

            if (!camera || !scene || typeof THREE === 'undefined') return;

            const mouse = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );

            const raycaster = window.raycaster || new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);

            const hits = raycaster.intersectObjects(scene.children, true);
            let selected = null;

            for (const hit of hits) {
                const candidate = hit.object;
                if (!candidate?.visible) continue;

                if (typeof window.resolveSelectionTarget === 'function') {
                    selected = window.resolveSelectionTarget(candidate, {
                        source: 'scripting-viewport'
                    });
                    if (selected) break;
                    continue;
                }

                if (candidate.userData?.isSystemObject) continue;

                let target = candidate;
                while (
                    target?.parent &&
                    target.parent !== scene &&
                    !target.userData?.selectable
                ) {
                    target = target.parent;
                }
                selected = target || candidate;
                break;
            }

            if (typeof window.selectObject === 'function') {
                window.selectObject(selected);
            } else {
                window.selectedObject = selected;
                if (selected) window.transformControls?.attach?.(selected);
                else window.transformControls?.detach?.();
            }

            // Canonical selection notification for Inspector/Transform.
            window.dispatchEvent(new CustomEvent('sm:object-selected', {
                detail: {
                    object: selected || null,
                    selectedObject: selected || null,
                    source: 'scripting-viewport'
                }
            }));

            window.hierarchyManager?.renderAll?.();
            window.updateInspector?.();
            window.InspectorPanel?._refreshTransformFromSelection?.(selected || null);
        });
    }

    function bindResizeObservers() {
        if (typeof ResizeObserver === 'undefined') return;

        if (!state.viewportObserver) {
            const viewport = document.getElementById('editor-scene');
            if (viewport) {
                state.viewportObserver = new ResizeObserver(() => {
                    if (state.active) dispatchLayout('scripting-viewport-observer');
                });
                state.viewportObserver.observe(viewport);
            }
        }

        if (!state.panelObserver) {
            const panel = document.getElementById('code-editor-panel');
            if (panel) {
                state.panelObserver = new ResizeObserver(() => {
                    if (state.active) dispatchLayout('scripting-panel-observer');
                });
                state.panelObserver.observe(panel);
            }
        }
    }

    function bindUI() {
        const openButton = document.getElementById('open-editor-btn');
        if (openButton && openButton.dataset.smScriptingV2 !== '1') {
            openButton.dataset.smScriptingV2 = '1';
            openButton.onclick = null;

            on(openButton, 'click', event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                setVisible(true);
            }, true);
        }

        document.querySelectorAll('#close-editor, #close-editor-top, .close-scripting-btn').forEach(closeButton => {
            if (closeButton && closeButton.dataset.smScriptingV2 !== '1') {
                closeButton.dataset.smScriptingV2 = '1';
                closeButton.onclick = null;

                on(closeButton, 'click', event => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    setVisible(false);
                }, true);
            }
        });

        const columnHandle = document.getElementById('scripting-column-resizer');
        if (columnHandle && columnHandle.dataset.smScriptingV2 !== '1') {
            columnHandle.dataset.smScriptingV2 = '1';
            on(columnHandle, 'pointerdown', beginColumnResize);
        }

        const consoleHandle =
            document.querySelector('#code-editor-panel .resize-handle-console-code');
        if (consoleHandle && consoleHandle.dataset.smScriptingV2 !== '1') {
            consoleHandle.dataset.smScriptingV2 = '1';
            on(consoleHandle, 'pointerdown', beginConsoleResize, true);
        }

        const frameButton = document.getElementById('scripting-frame-selected');
        if (frameButton && frameButton.dataset.smScriptingV2 !== '1') {
            frameButton.dataset.smScriptingV2 = '1';
            on(frameButton, 'click', () => focusOnObject());
        }

        // Delegated workspace close: also covers buttons created after boot.
        if (document.documentElement.dataset.smScriptingWorkspaceDelegate !== '1') {
            document.documentElement.dataset.smScriptingWorkspaceDelegate = '1';

            on(document, 'click', event => {
                if (!state.active) return;

                const target = event.target.closest?.('.workspace-tab, .ws-mode-card');
                if (!target) return;
                if (target.id === 'open-editor-btn') return;

                setVisible(false);
            }, true);
        }

        // Let Monaco / CodeMirror process the key first. This document-level
        // fallback is deliberately on the bubble phase: a capture handler
        // blocks Delete and Backspace before the editor receives them.
        if (document.documentElement.dataset.smScriptingKeyboardShield !== '1') {
            document.documentElement.dataset.smScriptingKeyboardShield = '1';

            on(document, 'keydown', event => {
                const active = document.activeElement;
                const inside =
                    active?.closest?.('#code-editor-panel') ||
                    event.target?.closest?.('#code-editor-panel') ||
                    active?.closest?.('.monaco-editor') ||
                    active?.closest?.('.CodeMirror');

                if (inside) {
                    event.stopPropagation();
                }
            });
        }
    }

    function init() {
        if (state.initialized) return api;

        loadLayout();
        bindUI();
        bindViewportSelection();
        bindResizeObservers();

        on(window, 'resize', () => {
            if (state.active) dispatchLayout('window-resize');
        });

        on(window, 'sm:sync-layout', () => {
            if (state.active) dispatchLayout('sm-sync-layout');
        });

        state.active = document.body.classList.contains(BODY_CLASS);
        state.initialized = true;

        if (state.active) {
            requestAnimationFrame(() => setVisible(true));
        }

        return api;
    }

    function destroy() {
        saveLayout();

        state.listeners.splice(0).forEach(dispose => {
            try { dispose(); } catch (_) {}
        });

        state.viewportObserver?.disconnect?.();
        state.panelObserver?.disconnect?.();
        state.viewportObserver = null;
        state.panelObserver = null;

        if (state.layoutFrame) cancelAnimationFrame(state.layoutFrame);
        state.layoutFrame = 0;

        state.initialized = false;
    }

    const api = {
        init,
        destroy,
        setVisible,
        open: () => setVisible(true),
        close: () => setVisible(false),
        toggle: () => setVisible(!state.active),
        refresh: () => dispatchLayout('api-refresh'),
        syncViewport: syncScriptingViewport,
        saveLayout,
        restoreLayout: loadLayout,
        focusOnObject,
        get active() { return state.active; },
        get state() { return state; }
    };

    window.SMCodeWorkspace = api;
    window.openCodeEditor = api.open;
    window.closeCodeEditor = api.close;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
