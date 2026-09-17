/**
 * SM-Engine App Bootstrap  (FIXED)
 * ------------------------------------------------------------------
 * CHANGES vs original:
 *  - REMOVED window.openCodeEditor / window.closeCodeEditor.
 *    These are now owned EXCLUSIVELY by scripting-workspace.js
 *    (the IIFE with dockWorkspace/undockWorkspace). Having two
 *    definitions meant whichever script loaded last silently won,
 *    and the loser's leftover click bindings caused double-toggling.
 *  - REMOVED the #open-editor-btn / #close-editor click bindings in
 *    DOMContentLoaded below (scripting-workspace.js's own bind()
 *    already wires these buttons — wiring them twice = the button
 *    could open then immediately close on one click).
 * ------------------------------------------------------------------
 */

// --- Global Engine & Panel State ---
window.initStarted = false;
window.initCompleted = false;
window.selectedObject = null;
window.activeObject = null;

// --- Timeline & Animation Globals ---
window.currentTime = Number(window.currentTime || 0);
window.timelineDuration = Number(window.timelineDuration || 30); // Default 30 seconds
window.isPlaying = !!window.isPlaying;
window.isPlaybackActive = !!window.isPlaybackActive;
window.playbackSpeed = Number(window.playbackSpeed || 1);
window.loopEnabled = window.loopEnabled !== false;
window.loopStart = Number(window.loopStart || 0);
window.loopEnd = Number(window.loopEnd || window.timelineDuration * 1000);
window.keyframes = window.keyframes || new Map();
window.boneKeyframes = window.boneKeyframes || new Map();
window.fps = Number(window.fps || 30);

window.toggleAssetsPanelSafe = function toggleAssetsPanelSafe(forceVisible = null) {
    const panel = document.getElementById('assetsPanel');
    if (!panel) {
        console.warn('Assets panel not found.');
        return;
    }
    const shouldShow = forceVisible === null ? !panel.classList.contains('visible') : !!forceVisible;
    panel.classList.toggle('visible', shouldShow);
    panel.style.display = shouldShow ? 'flex' : '';
    if (shouldShow && window.AssetsPanel?.init && !window.AssetsPanel.dom?.panel && window.scene && window.renderer && window.camera) {
        try {
            window.AssetsPanel.init(window.scene, window.renderer, window.camera, window.raycaster);
        } catch (error) {
            console.warn('AssetsPanel init skipped:', error);
        }
    }
    window.dispatchEvent(new Event('resize'));
};

// Prevent global engine shortcuts from stealing Space bar or typing keys inside code editors
document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isEditingCode = active && (
        active.closest('#code-editor-panel') ||
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable ||
        active.closest('.monaco-editor') ||
        active.closest('.CodeMirror')
    );
    if (isEditingCode) {
        e.stopPropagation();
    }
}, true);

function refreshCodeEditorLayout() {
    if (window.smMonacoEditor?.layout) window.smMonacoEditor.layout();
    if (typeof editors !== 'undefined') {
        Object.values(editors).forEach(editor => editor?.refresh?.());
    }
}

function initializeMonacoEditorWhenPossible() {
    const wrapper = document.querySelector('#code-editor-panel .vs-code-wrapper');
    const source = document.getElementById('js-editor');
    if (!wrapper || !source || window.smMonacoEditor) {
        refreshCodeEditorLayout();
        return;
    }

    const createEditor = () => {
        if (!window.monaco?.editor || window.smMonacoEditor) return;
        let host = document.getElementById('monaco-editor-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'monaco-editor-host';
            host.className = 'monaco-editor-host';
            wrapper.prepend(host);
        }
        source.style.display = 'none';
        window.smMonacoEditor = window.monaco.editor.create(host, {
            value: source.value || `// SM Engine Script\n// Access THREE, scene, selectedObject, and EditorAccess here.\n\nclass Script {\n    start() {\n        console.log('Script started');\n    }\n\n    update(delta) {\n        // Called every frame when attached.\n    }\n}\n\nreturn Script;\n`,
            language: 'javascript',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 13,
            fontFamily: 'Cascadia Code, Consolas, monospace',
            tabSize: 4,
            wordWrap: 'off',
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true }
        });
        window.smMonacoEditor.onDidChangeModelContent(() => {
            const value = window.smMonacoEditor.getValue();
            source.value = value;
            const fallback = typeof editors !== 'undefined' ? editors.js : null;
            if (fallback?.getValue?.() !== value) fallback?.setValue?.(value);
        });
        const fallback = typeof editors !== 'undefined' ? editors.js : null;
        if (fallback?.setValue && !fallback.__smMonacoSynced) {
            const setFallbackValue = fallback.setValue.bind(fallback);
            fallback.setValue = (value) => {
                setFallbackValue(value);
                if (window.smMonacoEditor?.getValue() !== value) window.smMonacoEditor?.setValue(value);
            };
            fallback.__smMonacoSynced = true;
        }
        window.smMonacoEditor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => {
            document.getElementById('save-file-btn')?.click();
        });
        window.smMonacoEditor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter, () => {
            const action = ['apply-changes-btn', 'attach-script-btn', 'create-object-btn', 'save-to-current-asset-btn']
                .map(id => document.getElementById(id))
                .find(button => button && button.style.display !== 'none');
            action?.click();
        });
        const lang = document.getElementById('lang-mode');
        if (lang) lang.textContent = 'JavaScript / Monaco';

        // FIX for "can't make space when I write in the code editor":
        // Monaco is an editor widget with its own key handling. If a global
        // document-level keydown listener elsewhere in your app (e.g. a
        // spacebar = play/pause shortcut) is bound WITHOUT checking focus,
        // it will eat the Space key before Monaco's own handler sees it.
        // This stops that class of bug for Monaco specifically:
        host.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
    };

    if (window.monaco?.editor) {
        createEditor();
    } else if (window.require?.config) {
        try {
            window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.49.0/min/vs' } });
            window.require(['vs/editor/editor.main'], createEditor, () => {
                console.warn('[CodeEditor] Monaco failed to load; keeping CodeMirror fallback.');
                if (typeof window.initializeEditors === 'function') {
                    try { window.initializeEditors(); } catch (error) { console.warn('initializeEditors skipped:', error); }
                }
            });
        } catch (error) {
            console.warn('[CodeEditor] Monaco loader unavailable:', error);
        }
    } else if (typeof window.initializeEditors === 'function') {
        try { window.initializeEditors(); } catch (error) { console.warn('initializeEditors skipped:', error); }
    }
}
window.initializeMonacoEditorWhenPossible = initializeMonacoEditorWhenPossible;
window.refreshCodeEditorLayout = refreshCodeEditorLayout;

// NOTE: window.openCodeEditor / window.closeCodeEditor intentionally
// removed from this file. See scripting-workspace.fixed.js — it is the
// single source of truth for opening/closing/docking the panel.

window.ensureAnimation2DManager = function ensureAnimation2DManager() {
    if (!window.animation2DManager) {
        if (typeof Animation2DManagerAdvanced !== 'undefined') {
            window.animation2DManager = new Animation2DManagerAdvanced();
        } else if (typeof Animation2DManager !== 'undefined') {
            window.animation2DManager = new Animation2DManager();
        }
    }
    return window.animation2DManager;
};

window.toggle2D3DUnderlay = function toggle2D3DUnderlay() {
    const mgr = window.ensureAnimation2DManager();
    if (!mgr) return;

    mgr.render3DOverlay = !mgr.render3DOverlay;
    document.body.classList.toggle('animation-2d-3d-underlay', mgr.render3DOverlay && mgr.isActive);

    const cb = document.getElementById('adv-render-3d-toggle');
    if (cb) cb.checked = mgr.render3DOverlay;

    const btn = document.getElementById('tool-3d-underlay');
    if (btn) btn.classList.toggle('active', mgr.render3DOverlay);

    if (mgr.isActive) {
        const sc = window.scene;
        const cam = window.camera;
        const ctl = window.orbitControls || window.controls;

        if (mgr.render3DOverlay) {
            mgr._applyWhiteWorkspaceBackground?.();
            if (cam && mgr.savedViewportState.camPos) {
                cam.position.copy(mgr.savedViewportState.camPos);
                if (mgr.savedViewportState.camRot) cam.rotation.copy(mgr.savedViewportState.camRot);
                if (mgr.savedViewportState.camUp) cam.up.copy(mgr.savedViewportState.camUp);
                cam.fov = mgr.savedViewportState.camFov;
                cam.updateProjectionMatrix?.();
            }
            if (ctl) {
                if (mgr.savedViewportState.controlsTarget) {
                    ctl.target.copy(mgr.savedViewportState.controlsTarget);
                }
                ctl.enableRotate = true;
                ctl.enabled = mgr.cameraLinkTo3D !== false;
                ctl.update?.();
            }
            if (sc) {
                sc.traverse(obj => {
                    if (obj.isGridHelper || (obj.userData && obj.userData.isEditorHelper)) {
                        if (obj._2d_was_visible !== undefined) {
                            obj.visible = obj._2d_was_visible;
                            delete obj._2d_was_visible;
                        } else {
                            obj.visible = true;
                        }
                    }
                });
            }
        } else {
            mgr._applyWhiteWorkspaceBackground?.();
            if (cam) {
                cam.position.set(0, 0, 10);
                cam.rotation.set(0, 0, 0);
                cam.up.set(0, 1, 0);
                cam.fov = 30;
                cam.updateProjectionMatrix?.();
            }
            if (ctl) {
                ctl.enableRotate = false;
                ctl.enabled = true;
                ctl.update?.();
            }
            if (sc) {
                sc.traverse(obj => {
                    if (obj.isGridHelper || (obj.userData && obj.userData.isEditorHelper)) {
                        obj._2d_was_visible = obj.visible;
                        obj.visible = false;
                    }
                });
            }
        }

        mgr.onAdvancedSettingChange?.();
        mgr.render();
    }
};


/* ============================================================================
   2D WORKSPACE LIFECYCLE / MODE ISOLATION
   ----------------------------------------------------------------------------
   One source of truth for tearing down all 2D-only UI. Older 2D scripts used
   inline display styles, so removing only the body class is not enough.
   ============================================================================ */
window.SM2DWorkspaceCleanup = function SM2DWorkspaceCleanup(reason = 'cleanup') {
    document.body.classList.remove(
        'animation-2d-mode-active',
        'animation-2d-3d-underlay',
        'anime2d-production-workspace',
        'animation-2d-compact'
    );

    const hide = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = 'none';
    };

    [
        'animation-2d-toolbar',
        'animation-2d-container',
        'panel-2d-toolbar',
        'panel-2d-right',
        'advanced-2d-inspector',
        'timeline-2d-brush-panel',
        'a2pro-dopesheet',
        'storyboard-header',
        'storyboard-panel',
        'anime-color-studio-header',
        'anime-color-studio-content',
        'anim-2d-controls-group'
    ].forEach(hide);

    document.querySelectorAll('.animation-2d-only').forEach((el) => {
        el.style.display = 'none';
    });

    const topbar = document.getElementById('a2w-topbar');
    if (topbar) {
        topbar.hidden = true;
        topbar.style.display = 'none';
    }

    const shelf = document.getElementById('a2w-brush-shelf');
    if (shelf) {
        shelf.hidden = true;
        shelf.style.display = 'none';
    }

    document.getElementById('toggle-2d-animation-btn')?.classList.remove('active');
    window.TimelinePanel?.setContext?.('default', { silent: true });

    window.dispatchEvent(new CustomEvent('sm:2d-workspace-cleaned', {
        detail: { reason }
    }));
};

window.exit2DAnimationWorkspaceSafe = function exit2DAnimationWorkspaceSafe(reason = 'external-workspace') {
    const mgr = window.animation2DManager;

    try {
        if (mgr?.isActive && typeof mgr.exitMode === 'function') {
            mgr.exitMode();
        } else if (typeof window._apply2DUI === 'function') {
            window._apply2DUI(false);
        }
    } catch (error) {
        console.warn('[SM][2D] exitMode failed; applying hard cleanup.', error);
    }

    window.SM2DWorkspaceCleanup?.(reason);
};

window.bind2DWorkspaceIsolationGuard = function bind2DWorkspaceIsolationGuard() {
    if (document.body.dataset.sm2dWorkspaceIsolationBound === '1') return;
    document.body.dataset.sm2dWorkspaceIsolationBound = '1';

    const normalize = (value) =>
        String(value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

    const workspaceLabels = new Set([
        'film',
        'filming',
        'modeling',
        'sculpting',
        'uv editing',
        '2d animation',
        'rendering',
        'scripting',
        'video editing',
        'assets',
        'inspector',
        'history',
        'stor',
        'live capture',
        'terrain'
    ]);

    const readLabel = (el) => normalize(
        el?.dataset?.workspace ||
        el?.dataset?.workspaceMode ||
        el?.dataset?.editorMode ||
        el?.getAttribute?.('aria-label') ||
        el?.title ||
        el?.textContent
    );

    const isTopWorkspaceControl = (el) => {
        if (!el) return false;

        if (el.matches?.(
            '[data-workspace], [data-workspace-mode], [data-editor-mode], ' +
            '.workspace-tab, .workspace-mode-tab, .top-workspace-tab, [role="tab"]'
        )) {
            return true;
        }

        const rect = el.getBoundingClientRect?.();
        return !!rect && rect.top >= 0 && rect.bottom <= 150;
    };

    document.addEventListener('click', (event) => {
        const is2D = !!window.animation2DManager?.isActive ||
            document.body.classList.contains('animation-2d-mode-active') ||
            !document.getElementById('a2w-topbar')?.hidden ||
            !document.getElementById('a2w-brush-shelf')?.hidden;

        if (!is2D) return;

        const control = event.target.closest?.(
            'button, a, [role="tab"], [data-workspace], [data-workspace-mode], ' +
            '[data-editor-mode], .workspace-tab, .workspace-mode-tab, .top-workspace-tab'
        );
        if (!control || !isTopWorkspaceControl(control)) return;

        const label = readLabel(control);
        if (!workspaceLabels.has(label) || label === '2d animation') return;

        /* Capture phase: teardown 2D first, then let the destination workspace
           continue handling the same click normally. */
        window.exit2DAnimationWorkspaceSafe?.(`workspace-click:${label}`);
    }, true);

    document.addEventListener('change', (event) => {
        const target = event.target;
        if (!target?.matches?.('select')) return;

        const rect = target.getBoundingClientRect?.();
        if (!rect || rect.bottom > 150) return;

        const label = normalize(target.options?.[target.selectedIndex]?.textContent || target.value);
        if (!workspaceLabels.has(label) || label === '2d animation') return;

        if (
            window.animation2DManager?.isActive ||
            document.body.classList.contains('animation-2d-mode-active')
        ) {
            window.exit2DAnimationWorkspaceSafe?.(`workspace-change:${label}`);
        }
    }, true);

    ['sm:workspace-changed', 'sm:workspace-mode-changed', 'sm:editor-mode-changed'].forEach((name) => {
        window.addEventListener(name, (event) => {
            const label = normalize(
                event?.detail?.workspace ||
                event?.detail?.mode ||
                event?.detail?.name ||
                event?.detail?.label
            );
            if (!label || label === '2d animation') return;

            if (
                window.animation2DManager?.isActive ||
                document.body.classList.contains('animation-2d-mode-active')
            ) {
                window.exit2DAnimationWorkspaceSafe?.(`${name}:${label}`);
            }
        });
    });
};


window._apply2DUI = function _apply2DUI(active) {
    active = !!active;

    /* Set the state class first so CSS isolation and component visibility agree
       during the same frame. */
    document.body.classList.toggle('animation-2d-mode-active', active);

    const controls3D = document.getElementById('3D-Controls');
    if (controls3D) controls3D.style.display = active ? 'none' : '';

    const toolbar2d = document.getElementById('animation-2d-toolbar');
    if (toolbar2d) toolbar2d.style.display = active ? 'flex' : 'none';

    const oldToolbar = document.getElementById('panel-2d-toolbar');
    if (oldToolbar) oldToolbar.style.display = 'none';

    /* Phase-1 refactor: the legacy timeline brush mega-panel is retired.
       Never let old manager code re-open it. */
    const timelineBrushPanel = document.getElementById('timeline-2d-brush-panel');
    if (timelineBrushPanel) timelineBrushPanel.style.display = 'none';

    const inspector = document.getElementById('inspector-panel');
    const inspectorMainContent = inspector?.querySelector('.inspector-main-content');
    const transformProps = document.getElementById('transform-properties');
    const panel2dRight = document.getElementById('panel-2d-right');
    const adv2d = document.getElementById('advanced-2d-inspector');

    /* The old Advanced 2D Inspector duplicates Anime2DWorkspace v2.
       Keep it permanently retired. */
    if (adv2d) adv2d.style.display = 'none';

    if (active) {
        if (inspector) {
            inspector.style.display = 'flex';
            inspector.classList.remove('closed');
        }

        const container = inspectorMainContent || inspector;
        if (panel2dRight && container) {
            panel2dRight.classList.remove('inspector-panel');
            panel2dRight.classList.add('property-group', 'towd-inspector-relative');

            if (transformProps && transformProps.parentNode === container) {
                container.insertBefore(panel2dRight, transformProps.nextSibling);
            } else if (!container.contains(panel2dRight)) {
                container.appendChild(panel2dRight);
            }

            panel2dRight.style.display = 'block';
        }
    } else {
        window.SM2DWorkspaceCleanup?.('_apply2DUI(false)');
    }

    const mgr2d = window.animation2DManager;
    const useUnderlay = !!(mgr2d && mgr2d.render3DOverlay);
    const cam = window.camera;
    const controls = window.orbitControls || window.controls;

    if (active && !useUnderlay) {
        if (cam) {
            cam.position.set(0, 0, 10);
            cam.rotation.set(0, 0, 0);
            cam.up.set(0, 1, 0);
            if (cam.isOrthographicCamera) {
                cam.updateProjectionMatrix?.();
            } else {
                cam.fov = 30;
                cam.updateProjectionMatrix?.();
            }
        }

        if (controls) {
            controls.enableRotate = false;
            controls.enableZoom = true;
            controls.enablePan = true;
            controls.target.set(0, 0, 0);
            controls.update?.();
        }

        if (window.scene) {
            window.scene.traverse((obj) => {
                if (obj.isGridHelper || (obj.userData && obj.userData.isEditorHelper)) {
                    if (obj._2d_was_visible === undefined) obj._2d_was_visible = obj.visible;
                    obj.visible = false;
                }
            });
        }
    } else if (!active) {
        if (controls) {
            controls.enableRotate = true;
            controls.update?.();
        }

        if (window.scene) {
            window.scene.traverse((obj) => {
                if (obj.isGridHelper || (obj.userData && obj.userData.isEditorHelper)) {
                    if (obj._2d_was_visible !== undefined) {
                        obj.visible = obj._2d_was_visible;
                        delete obj._2d_was_visible;
                    }
                }
            });
        }
    }
};

window.enter2DAnimationModeSafe = function enter2DAnimationModeSafe() {
    window.ensureAnimation2DManager();
    const mgr = window.animation2DManager;
    if (mgr) {
        if (mgr.isActive) {
            mgr.exitMode();
            window._apply2DUI(false);
        } else {
            mgr.isActive = false;
            mgr.enterMode();
        }
    } else {
        const isActive = document.body.classList.contains('animation-2d-mode-active');
        window._apply2DUI(!isActive);
    }
};

window.toggleModelingPanelSafe = function toggleModelingPanelSafe(forceVisible = null) {
    const panel  = document.getElementById('modelingTools');
    const button = document.getElementById('modelingControls');
    if (!panel) { console.warn('[SM] #modelingTools not found'); return; }

    const inspector = document.getElementById('inspector-panel');
    if (inspector) {
        inspector.classList.remove('closed');
        inspector.style.display = 'flex';
    }

    const isVisible = panel.style.display !== 'none' && panel.style.display !== '';
    const shouldShow = forceVisible === null ? !isVisible : !!forceVisible;

    if (shouldShow) {
        const sculpt = document.getElementById('sculpting-tools');
        if (sculpt) sculpt.style.display = 'none';
        document.getElementById('sculpting-toolbar-btn')?.classList.remove('active');
    }
    panel.style.display = shouldShow ? 'block' : 'none';
    button?.classList.toggle('active', shouldShow);
};

window.toggleSculptingPanelSafe = function toggleSculptingPanelSafe(forceVisible = null) {
    const panel  = document.getElementById('sculpting-tools') || document.getElementById('sculpting-panel');
    const button = document.getElementById('sculpting-toolbar-btn');
    if (!panel) { console.warn('[SM] sculpting panel not found'); return; }

    const isVisible = panel.style.display !== 'none' && panel.style.display !== '';
    const shouldShow = forceVisible === null ? !isVisible : !!forceVisible;

    if (shouldShow) {
        const model = document.getElementById('modelingTools');
        if (model) model.style.display = 'none';
        document.getElementById('modelingControls')?.classList.remove('active');
    }
    panel.style.display = shouldShow ? 'block' : 'none';
    button?.classList.toggle('active', shouldShow);
};

// --- Panel Resizing Logic ---
function initPanelResizers() {
    const root = document.documentElement;

    let isResizingH = false;
    let isResizingI = false;
    let isResizingT = false;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const getHierarchy = () => document.getElementById('hierarchy-panel');
    const getInspector = () => document.getElementById('inspector-panel');
    const getTimeline  = () => document.getElementById('timelineBody') || document.querySelector('.timeline');

    const disableTransitions = () => {
        const h = getHierarchy();
        const i = getInspector();
        const t = getTimeline();
        if (h) h.style.transition = 'none';
        if (i) i.style.transition = 'none';
        if (t) t.style.transition = 'none';
    };

    const restoreTransitions = () => {
        const h = getHierarchy();
        const i = getInspector();
        const t = getTimeline();
        if (h) h.style.transition = '';
        if (i) i.style.transition = '';
        if (t) t.style.transition = '';
    };

    const publishLayout = () => {
        const hierarchy = getHierarchy();
        const inspector = getInspector();
        const timeline  = getTimeline();

        const hierarchyWidth = hierarchy?.classList.contains('closed') ? 0 : Math.round(hierarchy?.getBoundingClientRect?.().width || 0);
        const inspectorWidth = inspector?.classList.contains('closed') ? 0 : Math.round(inspector?.getBoundingClientRect?.().width || 0);
        const timelineHeight = Math.round(timeline?.getBoundingClientRect?.().height || 0);

        if (hierarchyWidth) {
            root.style.setProperty('--hierarchy-live-width', `${hierarchyWidth}px`);
            root.style.setProperty('--hierarchy-width', `${hierarchyWidth}px`);
            root.style.setProperty('--panel-width-default', `${hierarchyWidth}px`);
        }
        if (inspectorWidth) {
            root.style.setProperty('--inspector-live-width', `${inspectorWidth}px`);
            root.style.setProperty('--inspector-width', `${inspectorWidth}px`);
            root.style.setProperty('--inspector-width-default', `${inspectorWidth}px`);
        }
        if (timelineHeight) {
            root.style.setProperty('--timeline-live-height', `${timelineHeight}px`);
            root.style.setProperty('--timeline-height', `${timelineHeight}px`);
        }

        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new CustomEvent('sm:layout-resized', {
            detail: { hierarchyWidth, inspectorWidth, timelineHeight }
        }));
    };

    document.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('#hierarchy-resize-handle, .resize-handle-hierarchy, #inspector-resize-handle, .resize-handle-inspector, .resize-handle-timeline, #timeline-resize-handle');
        if (!handle) return;

        e.preventDefault();
        e.stopPropagation();

        disableTransitions();

        if (handle.matches('#hierarchy-resize-handle, .resize-handle-hierarchy')) {
            isResizingH = true;
            document.body.classList.add('resizing-hierarchy');
            document.body.style.cursor = 'col-resize';
        } else if (handle.matches('#inspector-resize-handle, .resize-handle-inspector')) {
            isResizingI = true;
            document.body.classList.add('resizing-inspector');
            document.body.style.cursor = 'col-resize';
        } else if (handle.matches('.resize-handle-timeline, #timeline-resize-handle')) {
            isResizingT = true;
            document.body.classList.add('resizing-timeline');
            document.body.style.cursor = 'row-resize';
        }
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizingH && !isResizingI && !isResizingT) return;

        const minViewportWidth = 360;
        const maxSideWidth = Math.max(200, Math.floor((window.innerWidth - minViewportWidth) / 2));

        if (isResizingH) {
            const newWidth = clamp(e.clientX, 180, maxSideWidth);
            const hierarchy = getHierarchy();
            if (hierarchy) {
                hierarchy.style.width = `${newWidth}px`;
            }
            root.style.setProperty('--hierarchy-live-width', `${newWidth}px`);
            root.style.setProperty('--hierarchy-width', `${newWidth}px`);
            root.style.setProperty('--panel-width-default', `${newWidth}px`);
        }

        if (isResizingI) {
            const newWidth = clamp(window.innerWidth - e.clientX, 200, maxSideWidth);
            const inspector = getInspector();
            if (inspector) {
                inspector.style.width = `${newWidth}px`;
            }
            root.style.setProperty('--inspector-live-width', `${newWidth}px`);
            root.style.setProperty('--inspector-width', `${newWidth}px`);
            root.style.setProperty('--inspector-width-default', `${newWidth}px`);
        }

        if (isResizingT) {
            const maxTimelineHeight = Math.max(140, Math.floor(window.innerHeight * 0.65));
            const newHeight = clamp(window.innerHeight - e.clientY, 80, maxTimelineHeight);
            const timeline = getTimeline();
            if (timeline) {
                timeline.style.height = `${newHeight}px`;
            }
            root.style.setProperty('--timeline-live-height', `${newHeight}px`);
            root.style.setProperty('--timeline-height', `${newHeight}px`);
        }

        publishLayout();
    });

    document.addEventListener('mouseup', () => {
        if (isResizingH || isResizingI || isResizingT) {
            isResizingH = false;
            isResizingI = false;
            isResizingT = false;
            document.body.classList.remove('resizing-hierarchy', 'resizing-inspector', 'resizing-timeline');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            restoreTransitions();
            publishLayout();
        }
    });

    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
            if (!isResizingH && !isResizingI && !isResizingT) publishLayout();
        });
        const h = getHierarchy();
        const i = getInspector();
        const t = getTimeline();
        [h, i, t].forEach(panel => panel && observer.observe(panel));
    }
    window.addEventListener('sm:sync-layout', publishLayout);
    setTimeout(publishLayout, 100);
}

// --- Dependencies & Safety ---
if (typeof window.WindZone === 'undefined') {
    window.WindZone = class { constructor() { } update() { } };
}

document.addEventListener('DOMContentLoaded', () => {
    initPanelResizers();
    window.bind2DWorkspaceIsolationGuard?.();

    /* Start from a clean non-2D state unless the manager is already truly active. */
    if (!window.animation2DManager?.isActive && !document.body.classList.contains('animation-2d-mode-active')) {
        window.SM2DWorkspaceCleanup?.('bootstrap-initial-state');
    }

    const assetsBtn = document.getElementById('toggle-assets-btn');
    if (assetsBtn) assetsBtn.onclick = null;
    assetsBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.toggleAssetsPanelSafe();
    });
    document.getElementById('modelingControls')?.addEventListener('click', (event) => {
        event.preventDefault();
        window.toggleModelingPanelSafe();
    });
    document.getElementById('sculpting-toolbar-btn')?.addEventListener('click', (event) => {
        event.preventDefault();
        window.toggleSculptingPanelSafe();
    });
    document.body.addEventListener('click', (event) => {
        if (event.target.closest('#expandNodeEditorBtn'))
            window.toggleSculptingPanelSafe(false);
        if (event.target.closest('#expand-modelingTools-system-btn'))
            window.toggleModelingPanelSafe(false);
    }, true);

    // REMOVED: #open-editor-btn / #close-editor wiring.
    // scripting-workspace.fixed.js's bind() owns these buttons now.

    document.getElementById('play')?.addEventListener('click', () => { window.isPlaying = true; });
    document.getElementById('pause')?.addEventListener('click', () => { window.isPlaying = false; });
    document.getElementById('stop')?.addEventListener('click', () => {
        window.isPlaying = false;
        window.currentTime = 0;
        if (typeof window.updatePlayhead === 'function') window.updatePlayhead();
    });

    if (typeof updateKeyframesUI === 'function') updateKeyframesUI();
    if (typeof updateLayersUI === 'function') updateLayersUI();

    // --- ADD ELECTRON MENU ACTION LISTENER HERE ---
    if (window.electronAPI?.onMenuAction) {
        window.electronAPI.onMenuAction((action) => {
            switch (action) {
                case 'save-scene':
                    window.persistenceManager?.autoSave();
                    break;
                case 'open-editor':
                    window.openCodeEditor?.();
                    break;
                case 'toggle-assets':
                    window.toggleAssetsPanelSafe?.();
                    break;
                case 'toggle-modeling':
                    window.toggleModelingPanelSafe?.();
                    break;
                case 'toggle-sculpting':
                    window.toggleSculptingPanelSafe?.();
                    break;
                case 'export-game':
                    window.gameExportSystem?.exportProject?.();
                    break;
                case 'about':
                    alert('SM Engine v1.0.0');
                    break;
            }
        });
    }

    console.log("🚀 SM-Engine: Bootstrap complete. Resizers active.");
});