// ============================================================================
// GAME-UI/runtime/GameUIPIEBridge.js
// Dedicated Game Window bridge for SM Engine Game UI.
//
// Design:
//  - The editor canvas stays in the main document and simulates the exact
//    innerWidth/innerHeight of the live Game Window.
//  - Runtime UI is mounted into #sm-game-hud-mount in the Game Window.
//  - Runtime DOM is adopted into the popup document; popup CSS is copied too.
//  - UI runtime uses the popup's RAF so UI timing follows the game window.
// ============================================================================
(function () {
    'use strict';

    if (window.__smGameUIPIEBridgeLoaded) return;
    window.__smGameUIPIEBridgeLoaded = true;

    const LAYER_ID = 'sm-game-ui-layer';
    const LOG = '[GameUI-PIE]';
    let popupRAF = 0;
    let resizeRAF = 0;
    let popupResizeHandler = null;
    let popupBeforeUnloadHandler = null;

    // Keep the editor DOM independent from the runtime DOM.
    // The same widget can therefore exist in the editor and in the Game Window
    // without losing the editor's element reference when PIE stops.
    let editorElementSnapshot = null;

    function getOrchestrator() {
        return window.PlayOrchestrator ||
            window.gamePlayOrchestrator ||
            window.__smPlayOrchestrator ||
            null;
    }

    function getGameWindow() {
        const orchestrator = getOrchestrator();
        const gameWindow = orchestrator?._gameWindow || window.__smGameWindow || null;
        return gameWindow && !gameWindow.closed ? gameWindow : null;
    }

    function getRuntime() {
        return window.gameUIRuntime ||
            (window.GameUIRuntime && (window.gameUIRuntime = new window.GameUIRuntime()));
    }

    function copyStylesheetsToPopup(gameWindow) {
        if (!gameWindow?.document) return;

        const popupDoc = gameWindow.document;
        const mainLinks = [...document.querySelectorAll('link[rel="stylesheet"]')]
            .map(link => link.href)
            .filter(Boolean);

        const gameUIStyles = [
            'game-ui/editor/game-ui-editor.css',
            'game-ui/runtime/game-ui-runtime.css'
        ];

        const urls = new Set(mainLinks);
        for (const relative of gameUIStyles) {
            try { urls.add(new URL(relative, document.baseURI).href); } catch (_) {}
        }

        for (const href of urls) {
            if (!href) continue;
            const exists = [...popupDoc.querySelectorAll('link[rel="stylesheet"]')]
                .some(link => link.href === href);
            if (exists) continue;

            const link = popupDoc.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            popupDoc.head.appendChild(link);
        }
    }

    function ensurePopupLayer(gameWindow) {
        const popupDoc = gameWindow?.document;
        if (!popupDoc) return null;

        const mount = popupDoc.getElementById('sm-game-hud-mount');
        if (!mount) return null;

        let layer = popupDoc.getElementById(LAYER_ID);
        if (!layer) {
            layer = popupDoc.createElement('div');
            layer.id = LAYER_ID;
            layer.style.cssText = [
                'position:absolute',
                'inset:0',
                'width:100%',
                'height:100%',
                'pointer-events:none',
                'z-index:100',
                'overflow:hidden',
                'display:none',
                'box-sizing:border-box',
                'margin:0',
                'padding:0',
                'contain:layout style',
            ].join(';');
        }

        if (layer.parentElement !== mount) mount.appendChild(layer);
        return layer;
    }

    function getPopupViewport(gameWindow) {
        const surface = gameWindow?.document?.getElementById('sm-game-surface');
        if (!surface) return null;

        const rect = surface.getBoundingClientRect();
        return {
            width: Math.max(1, Math.floor(rect.width || gameWindow.innerWidth || 1)),
            height: Math.max(1, Math.floor(rect.height || gameWindow.innerHeight || 1)),
        };
    }

    function layoutRuntimeToViewport(runtime, width, height) {
        const engine = runtime?.layoutEngine;
        const documentModel = runtime?.document;
        if (!engine || !documentModel) return;

        // Runtime UI uses one coordinate space: the actual Game Viewport.
        // No reference-resolution scaling, no centering, no transform.
        engine.setRuntimeViewportExact?.(true);
        engine.layoutDocument?.(documentModel, width, height);
    }

    function resetRuntimeLayoutMode(runtime) {
        runtime?.layoutEngine?.setRuntimeViewportExact?.(false);
    }

    function notifyEditorViewportSize(size) {
        if (!size) return;
        window.__smGameWindowViewport = { ...size };
        window.dispatchEvent(new CustomEvent('sm:game-window-resized', {
            detail: { ...size, window: getGameWindow() }
        }));
    }

    function syncPopupUI() {
        const gameWindow = getGameWindow();
        if (!gameWindow) return null;

        const layer = ensurePopupLayer(gameWindow);
        const runtime = getRuntime();
        if (!layer || !runtime) return null;

        const size = getPopupViewport(gameWindow);
        if (!size) return null;

        layer.style.width = `${size.width}px`;
        layer.style.height = `${size.height}px`;

        runtime.container = layer;
        runtime.renderer?.setContainer?.(layer);
        runtime.renderer?.resize?.(size.width, size.height);

        // The UI canvas is literally the same size as the Game Viewport.
        // Widgets therefore use direct viewport coordinates (x/y/width/height).
        layoutRuntimeToViewport(runtime, size.width, size.height);

        const root = runtime.renderer?.rootElement;
        if (root) {
            root.style.position = 'absolute';
            root.style.top = '0';
            root.style.left = '0';
            root.style.width = `${size.width}px`;
            root.style.height = `${size.height}px`;
            root.style.transform = 'none';
            root.style.transformOrigin = 'top left';
        }

        notifyEditorViewportSize(size);
        return size;
    }

    function stopPopupLoop() {
        if (!popupRAF) return;
        const gameWindow = getGameWindow();
        try { gameWindow?.cancelAnimationFrame?.(popupRAF); } catch (_) {}
        popupRAF = 0;
    }

    function startPopupLoop(runtime, gameWindow) {
        stopPopupLoop();
        if (!runtime || !gameWindow || gameWindow.closed) return;

        let last = 0;
        const tick = (now) => {
            popupRAF = 0;
            if (!runtime.running || gameWindow.closed) return;

            const current = Number.isFinite(now) ? now : performance.now();
            const delta = last > 0
                ? Math.min(0.05, Math.max(0, (current - last) / 1000))
                : 0;
            last = current;

            try {
                // Game UI data binding / DOM refresh follows the Game Window clock.
                runtime.update(current);

                // If the animation system exposes a frame update, use it here.
                // Do not assume a signature; only call APIs explicitly provided.
                if (typeof runtime.animationSystem?.update === 'function') {
                    runtime.animationSystem.update(delta, current);
                } else if (typeof runtime.animationSystem?.tick === 'function') {
                    runtime.animationSystem.tick(delta, current);
                }
            } catch (error) {
                console.warn(LOG, 'Popup UI frame failed:', error);
            }

            if (runtime.running && !gameWindow.closed) {
                popupRAF = gameWindow.requestAnimationFrame(tick);
            }
        };

        popupRAF = gameWindow.requestAnimationFrame(tick);
    }

    function bindPopupLifecycle(gameWindow) {
        if (!gameWindow) return;

        if (popupResizeHandler) {
            try { gameWindow.removeEventListener('resize', popupResizeHandler); } catch (_) {}
        }
        if (popupBeforeUnloadHandler) {
            try { gameWindow.removeEventListener('beforeunload', popupBeforeUnloadHandler); } catch (_) {}
        }

        popupResizeHandler = () => {
            if (resizeRAF) {
                try { gameWindow.cancelAnimationFrame(resizeRAF); } catch (_) {}
            }
            resizeRAF = gameWindow.requestAnimationFrame(() => {
                resizeRAF = 0;
                if (getGameWindow() !== gameWindow) return;
                const size = syncPopupUI();
                if (size) {
                    window.gameUIEditorManager?.canvasEditor?.syncToGameWindow?.({ fit: true });
                }
            });
        };

        popupBeforeUnloadHandler = () => {
            stopPopupLoop();
            const runtime = getRuntime();
            try { runtime?.stop?.(); } catch (_) {}
            restoreEditorElements(runtime?.document);
            window.__smGameWindowViewport = null;
            window.dispatchEvent(new CustomEvent('sm:game-window-resized', {
                detail: { width: 0, height: 0, closed: true }
            }));
        };

        gameWindow.addEventListener('resize', popupResizeHandler, { passive: true });
        gameWindow.addEventListener('beforeunload', popupBeforeUnloadHandler, { once: true });
    }

    function captureEditorElements(documentModel) {
        if (editorElementSnapshot) return;
        const snapshot = new Map();

        documentModel?.traverse?.((widget) => {
            if (widget?._element) snapshot.set(widget, widget._element);
        });

        editorElementSnapshot = snapshot;
    }

    function restoreEditorElements(documentModel) {
        const snapshot = editorElementSnapshot;
        if (!snapshot) return;

        documentModel?.traverse?.((widget) => {
            const element = snapshot.get(widget);
            if (element) widget._element = element;
        });

        editorElementSnapshot = null;

        // Rebuild authoring DOM so selection/dragging never depends on stale
        // runtime nodes from the popup.
        window.gameUIEditorManager?.canvasEditor?.render?.();
        window.gameUIEditorManager?.canvasEditor?.fitToView?.();
    }

    function showInGameWindow(gameWindow = getGameWindow()) {
        if (!gameWindow || gameWindow.closed) return false;

        const runtime = getRuntime();
        if (!runtime) return false;

        const documentModel =
            window.GameUIMode?.document ||
            window.gameUIManager?.activeDocument ||
            runtime.document ||
            null;

        if (!documentModel) {
            console.warn(LOG, 'No active Game UI document.');
            return false;
        }

        copyStylesheetsToPopup(gameWindow);

        // Snapshot editor-owned elements before runtime mounting replaces the
        // widget's transient DOM reference.
        captureEditorElements(documentModel);

        const layer = ensurePopupLayer(gameWindow);
        if (!layer) {
            console.warn(LOG, 'Game Window HUD mount not found.');
            return false;
        }

        layer.style.display = 'block';
        layer.style.pointerEvents = 'none';

        // A runtime preview in the editor must never keep ownership of the same
        // renderer root while the Game Window is running.
        if (runtime.running && runtime.container !== layer) {
            runtime.stop?.();
        }

        runtime.setDocument?.(documentModel);
        runtime.container = layer;
        runtime.renderer?.setContainer?.(layer);

        const started = runtime.start?.({
            document: documentModel,
            container: layer,
            externalLoop: true,
            autoFocus: false,
        });

        if (!started) {
            console.warn(LOG, 'Game UI runtime failed to start in Game Window.');
            restoreEditorElements(documentModel);
            return false;
        }

        // Ensure the renderer root actually belongs to the popup document.
        runtime.renderer?.setContainer?.(layer);
        syncPopupUI();
        bindPopupLifecycle(gameWindow);
        startPopupLoop(runtime, gameWindow);

        window.__smGameUIInGameWindow = true;
        window.__smGameUIWindow = gameWindow;

        window.gameUIEditorManager?.canvasEditor?.syncToGameWindow?.({ fit: true });
        window.dispatchEvent(new CustomEvent('sm:game-ui-game-window-mounted', {
            detail: { window: gameWindow, document: documentModel }
        }));

        console.log(LOG, '✓ Game UI mounted to dedicated Game Window.');
        return true;
    }

    function showUI() {
        const gameWindow = getGameWindow();
        if (gameWindow) return showInGameWindow(gameWindow);

        // Editor-only preview fallback.
        const runtime = getRuntime();
        const host = document.getElementById('game-ui-preview-host') ||
            document.getElementById('editor-scene');
        if (!runtime || !host) return false;

        const documentModel = window.GameUIMode?.document || window.gameUIManager?.activeDocument;
        if (!documentModel) return false;

        runtime.stop?.();
        runtime.setDocument?.(documentModel);
        runtime.start?.({ document: documentModel, container: host, externalLoop: false, autoFocus: false });
        return true;
    }

    function hideUI() {
        stopPopupLoop();

        const runtime = getRuntime();
        if (runtime?.running) {
            try { runtime.stop(); } catch (error) {
                console.warn(LOG, 'Runtime stop failed:', error);
            }
        }

        const gameWindow = getGameWindow();
        const layer = gameWindow?.document?.getElementById(LAYER_ID);
        if (layer) {
            layer.style.display = 'none';
        }

        restoreEditorElements(runtime?.document);
        resetRuntimeLayoutMode(runtime);

        window.__smGameUIInGameWindow = false;
        window.__smGameUIWindow = null;
    }

    function refreshUI() {
        const gameWindow = getGameWindow();
        if (gameWindow && window.__smGameUIInGameWindow) {
            syncPopupUI();
            return;
        }

        const runtime = getRuntime();
        if (runtime?.running) runtime.refreshLayout?.(true);
    }

    window.addEventListener('sm:pie-start', () => {
        // The orchestrator creates/mounts the Game Window first. A short delay
        // lets #sm-game-hud-mount exist before we mount the UI runtime.
        setTimeout(() => showInGameWindow(), 0);
        setTimeout(() => showInGameWindow(), 100);
    });

    window.addEventListener('sm:pie-stop', hideUI);
    window.addEventListener('sm-game-project-play', () => setTimeout(() => showInGameWindow(), 0));
    window.addEventListener('sm-game-project-stop', hideUI);
    window.addEventListener('sm-game-project-unloaded', hideUI);
    window.addEventListener('sm:game-window-ready', () => setTimeout(() => showInGameWindow(), 0));
    window.addEventListener('sm:game-window-resized', refreshUI);
    window.addEventListener('sm:sync-layout', refreshUI);

    window.SMGameUIPIEBridge = {
        show: showUI,
        showInWindow: showInGameWindow,
        hide: hideUI,
        refresh: refreshUI,
        syncViewport: syncPopupUI,
        getRuntime,
        getGameWindow,
        diagnose() {
            const gameWindow = getGameWindow();
            const runtime = getRuntime();
            const layer = gameWindow?.document?.getElementById(LAYER_ID);
            const rendererRoot = runtime?.renderer?.rootElement;
            console.log('=== GAME UI GAME WINDOW DIAGNOSTIC ===');
            console.log('Game Window:', !!gameWindow, gameWindow?.innerWidth, gameWindow?.innerHeight);
            console.log('UI Layer:', layer, layer?.getBoundingClientRect?.());
            console.log('Layer owner document:', layer?.ownerDocument === gameWindow?.document);
            console.log('Renderer root:', rendererRoot);
            console.log('Renderer root owner document:', rendererRoot?.ownerDocument === gameWindow?.document);
            console.log('Runtime running:', runtime?.running);
            console.log('Runtime container:', runtime?.container?.id);
            console.log('=== END GAME UI DIAGNOSTIC ===');
        }
    };

    console.log(LOG, 'Bridge ready — Game Window UI mode enabled.');
})();
