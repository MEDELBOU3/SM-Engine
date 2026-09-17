// ============================================================================
// engine/game-play/GameViewWindowManager.js
// Opens a standalone Game View window and MOVES #renderer-container into it.
// ============================================================================
(function () {
'use strict';

const SESSION_KEY = 'sm_game_view_session';
const HEARTBEAT_TIMEOUT = 8000;
const LOG = '[GameViewWindow]';

class GameViewWindowManager {
    constructor() {
        this.windowRef = null;
        this.sessionId = null;
        this.channel = null;
        this.heartbeatTimer = 0;
        this.lastChildHeartbeat = 0;
        this.originalContainerParent = null;
        this.originalContainerNextSibling = null;
        this.originalContainerStyles = '';
        this.containerElement = null;
        this.isActive = false;
        this._popupBlocked = false;
    }

    // ========================================================================
    // 1. Open popup window
    // ========================================================================
    open() {
        if (this.isActive) {
            this.windowRef?.focus?.();
            return true;
        }

        this.sessionId = 'gv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        sessionStorage.setItem(SESSION_KEY, this.sessionId);

        const base = location.href.split('?')[0].split('#')[0];
        const dir = base.substring(0, base.lastIndexOf('/'));
        const url = `${dir}/game-view-window.html?session=${encodeURIComponent(this.sessionId)}`;

        const screenW = window.screen.availWidth || window.innerWidth;
        const screenH = window.screen.availHeight || window.innerHeight;
        const targetW = Math.floor(screenW * 0.92);
        const targetH = Math.floor(screenH * 0.92);
        const left = Math.floor((screenW - targetW) / 2);
        const top = Math.floor((screenH - targetH) / 2);

        const features = [
            'popup=yes',
            `width=${targetW}`,
            `height=${targetH}`,
            `left=${left}`,
            `top=${top}`,
            'menubar=no',
            'toolbar=no',
            'location=no',
            'status=no',
            'resizable=yes',
            'scrollbars=no',
        ].join(',');

        const popup = window.open(url, `smGameView_${this.sessionId}`, features);

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            this._notifyPopupBlocked();
            return false;
        }

        this.windowRef = popup;
        this.isActive = true;
        this.lastChildHeartbeat = Date.now();

        this._initChannel();
        window.addEventListener('message', this._onChildMessage.bind(this));
        this.heartbeatTimer = setInterval(() => this._heartbeatCheck(), 1000);
        window.addEventListener('beforeunload', this._onUnload.bind(this));

        console.log(LOG, 'Popup opened:', this.sessionId);
        return true;
    }

    _initChannel() {
        try {
            this.channel = new BroadcastChannel(`sm-game-view-${this.sessionId}`);
            this.channel.onmessage = (e) => this._handleChildMessage(e.data);
        } catch (e) {
            this.channel = null;
        }
    }

    // ========================================================================
    // 2. Child communication
    // ========================================================================
    _onChildMessage(event) {
        const data = event.data;
        if (!data || data.from !== 'game-view') return;
        this._handleChildMessage(data);
    }

    _handleChildMessage(data) {
        switch (data.type) {
            case 'child-ready':
                this.lastChildHeartbeat = Date.now();
                this._moveRendererContainer();
                break;

            case 'game-view-heartbeat':
                this.lastChildHeartbeat = Date.now();
                break;

            case 'game-view-resized':
                this._handleChildResize(data);
                break;

            case 'pause-clicked':
                this._dispatch('pause');
                break;

            case 'resume-clicked':
                this._dispatch('resume');
                break;

            case 'step-clicked':
                this._dispatch('step');
                break;

            case 'stop-clicked':
                this._dispatch('stop');
                break;

            case 'game-view-closing':
                this._restoreRendererContainer();
                this.isActive = false;
                break;
        }
    }

    _sendToChild(payload) {
        if (!this.windowRef || this.windowRef.closed) return;
        try {
            if (this.channel) {
                this.channel.postMessage({ ...payload, from: 'editor' });
            }
        } catch (e) {}
        try {
            this.windowRef.postMessage({ ...payload, from: 'editor' }, '*');
        } catch (e) {}
    }

    // ========================================================================
    // 3. MOVE #renderer-container into the popup (the simple way)
    // ========================================================================
    _moveRendererContainer() {
        const childDoc = this.windowRef?.document;
        if (!childDoc) {
            console.warn(LOG, 'No child document');
            return;
        }

        const container = document.getElementById('renderer-container');
        if (!container) {
            console.warn(LOG, '#renderer-container not found');
            this._sendToChild({ type: 'scene-ready', error: 'no-container' });
            return;
        }

        // Save original position for restore
        this.containerElement = container;
        this.originalContainerParent = container.parentElement;
        this.originalContainerNextSibling = container.nextSibling;
        this.originalContainerStyles = container.getAttribute('style') || '';

        // Get the child's canvas host
        const childHost = childDoc.getElementById('game-canvas-host');
        if (!childHost) {
            console.warn(LOG, 'Child host not found, retrying...');
            setTimeout(() => this._moveRendererContainer(), 150);
            return;
        }

        // Wait until the child host is properly sized
        const hostRect = childHost.getBoundingClientRect();
        if (hostRect.width < 10 || hostRect.height < 10) {
            console.warn(LOG, 'Child host too small, retrying...');
            setTimeout(() => this._moveRendererContainer(), 150);
            return;
        }

        try {
            // ADOPT the container into the child document
            const adoptedContainer = childDoc.adoptNode(container);

            // Reset styles so the CSS in the child window takes over
            adoptedContainer.removeAttribute('style');
            adoptedContainer.style.position = 'absolute';
            adoptedContainer.style.top = '0';
            adoptedContainer.style.left = '0';
            adoptedContainer.style.width = '100%';
            adoptedContainer.style.height = '100%';
            adoptedContainer.style.margin = '0';
            adoptedContainer.style.padding = '0';
            adoptedContainer.style.zIndex = '1';
            adoptedContainer.style.pointerEvents = 'auto';
            adoptedContainer.style.overflow = 'hidden';
            adoptedContainer.style.display = 'block';

            // Append into the child's host
            childHost.innerHTML = '';
            childHost.appendChild(adoptedContainer);

            // Force a resize of the renderer to match the new viewport
            const renderer = window.renderer || window.SMEngineRenderer?.renderer;
            if (renderer) {
                const dpr = Math.min(this.windowRef.devicePixelRatio || 1, 2);
                const w = Math.floor(hostRect.width);
                const h = Math.floor(hostRect.height);

                if (typeof renderer.setPixelRatio === 'function') {
                    renderer.setPixelRatio(dpr);
                }
                if (typeof renderer.setSize === 'function') {
                    renderer.setSize(w, h, false);
                }

                // Update camera aspect
                const camera = window._gameRenderCamera || window.gameCamera || window.camera;
                if (camera?.isPerspectiveCamera) {
                    camera.aspect = w / Math.max(1, h);
                    camera.updateProjectionMatrix?.();
                }

                // Resize the canvas buffer
                const canvas = renderer.domElement;
                if (canvas) {
                    canvas.width = Math.floor(w * dpr);
                    canvas.height = Math.floor(h * dpr);
                    canvas.style.width = w + 'px';
                    canvas.style.height = h + 'px';
                }
            }

            // Notify child
            this._sendToChild({
                type: 'scene-ready',
                canvasMounted: true,
                width: Math.floor(hostRect.width),
                height: Math.floor(hostRect.height),
            });

            // Also move the Game UI layer if present
            this._moveGameUILayer(childDoc);

            console.log(LOG, '✓ #renderer-container moved to popup');
        } catch (error) {
            console.error(LOG, 'Failed to move container:', error);
        }
    }

    _moveGameUILayer(childDoc) {
        const uiLayer = document.getElementById('sm-game-ui-layer');
        if (!uiLayer) return;

        const childRendererContainer = childDoc.getElementById('renderer-container');
        if (!childRendererContainer) return;

        try {
            const adoptedUI = childDoc.adoptNode(uiLayer);
            adoptedUI.removeAttribute('style');
            adoptedUI.style.position = 'absolute';
            adoptedUI.style.top = '0';
            adoptedUI.style.left = '0';
            adoptedUI.style.width = '100%';
            adoptedUI.style.height = '100%';
            adoptedUI.style.pointerEvents = 'none';
            adoptedUI.style.zIndex = '100';
            adoptedUI.style.overflow = 'hidden';

            childRendererContainer.appendChild(adoptedUI);

            // Show the UI now
            adoptedUI.style.display = 'block';
            adoptedUI.style.pointerEvents = 'auto';

            console.log(LOG, '✓ Game UI layer moved');
        } catch (e) {
            console.warn(LOG, 'UI move failed:', e);
        }
    }

    // ========================================================================
    // 4. Restore #renderer-container back to the editor
    // ========================================================================
    _restoreRendererContainer() {
        const container = this.containerElement;
        if (!container) return;

        try {
            // Move back
            const adopted = document.adoptNode(container);

            // Restore original styles
            if (this.originalContainerStyles) {
                adopted.setAttribute('style', this.originalContainerStyles);
            } else {
                adopted.removeAttribute('style');
            }

            // Insert back into original parent
            if (this.originalContainerParent) {
                if (this.originalContainerNextSibling &&
                    this.originalContainerNextSibling.parentElement === this.originalContainerParent) {
                    this.originalContainerParent.insertBefore(adopted, this.originalContainerNextSibling);
                } else {
                    this.originalContainerParent.appendChild(adopted);
                }
            }

            // Force resize back to editor viewport
            const renderer = window.renderer || window.SMEngineRenderer?.renderer;
            if (renderer && this.originalContainerParent) {
                const rect = this.originalContainerParent.getBoundingClientRect();
                const w = Math.max(1, Math.floor(rect.width));
                const h = Math.max(1, Math.floor(rect.height));
                const dpr = Math.min(window.devicePixelRatio || 1, 2);

                if (typeof renderer.setPixelRatio === 'function') {
                    renderer.setPixelRatio(dpr);
                }
                if (typeof renderer.setSize === 'function') {
                    renderer.setSize(w, h, false);
                }

                const camera = window.camera;
                if (camera?.isPerspectiveCamera) {
                    camera.aspect = w / Math.max(1, h);
                    camera.updateProjectionMatrix?.();
                }

                const canvas = renderer.domElement;
                if (canvas) {
                    canvas.width = Math.floor(w * dpr);
                    canvas.height = Math.floor(h * dpr);
                    canvas.style.width = w + 'px';
                    canvas.style.height = h + 'px';
                }
            }

            // Also move back the UI layer
            this._restoreGameUILayer();

            console.log(LOG, '✓ #renderer-container restored');
        } catch (error) {
            console.error(LOG, 'Restore failed:', error);
        }

        // Reset state
        this.containerElement = null;
        this.originalContainerParent = null;
        this.originalContainerNextSibling = null;
        this.originalContainerStyles = '';
    }

    _restoreGameUILayer() {
        const layer = document.getElementById('sm-game-ui-layer');
        if (!layer) return;

        // Find the editor's scene container
        const editorScene = document.getElementById('editor-scene');
        if (!editorScene) return;

        try {
            const adopted = document.adoptNode(layer);
            adopted.removeAttribute('style');
            adopted.style.display = 'none';
            adopted.style.pointerEvents = 'none';
            editorScene.appendChild(adopted);
        } catch (e) {}
    }

    // ========================================================================
    // 5. Resize handling
    // ========================================================================
    _handleChildResize(data) {
        const renderer = window.renderer || window.SMEngineRenderer?.renderer;
        if (!renderer) return;

        const { width, height, dpr } = data;
        const w = Math.max(1, Math.floor(width));
        const h = Math.max(1, Math.floor(height));
        const ratio = dpr || 1;

        try {
            if (typeof renderer.setPixelRatio === 'function') {
                renderer.setPixelRatio(ratio);
            }
            if (typeof renderer.setSize === 'function') {
                renderer.setSize(w, h, false);
            }

            const camera = window._gameRenderCamera || window.gameCamera || window.camera;
            if (camera?.isPerspectiveCamera) {
                camera.aspect = w / h;
                camera.updateProjectionMatrix?.();
            }

            const canvas = renderer.domElement;
            if (canvas) {
                canvas.width = Math.floor(w * ratio);
                canvas.height = Math.floor(h * ratio);
                canvas.style.width = w + 'px';
                canvas.style.height = h + 'px';
            }
        } catch (e) {}
    }

    // ========================================================================
    // 6. Orchestrator dispatch
    // ========================================================================
    _dispatch(action) {
        const orch = window.gamePlayOrchestrator || window.PlayOrchestrator;
        if (!orch) return;

        try {
            if (action === 'pause' && orch.mode === 'play') orch.pauseSimulation?.();
            else if (action === 'resume' && orch.mode === 'pause') orch.resumeSimulation?.();
            else if (action === 'step' && orch.mode === 'pause') orch.stepFrame?.();
            else if (action === 'stop') {
                this.close();
                orch.stopPlayMode?.();
            }
        } catch (e) {}
    }

    // ========================================================================
    // 7. Lifecycle
    // ========================================================================
    _heartbeatCheck() {
        if (!this.windowRef || this.windowRef.closed) {
            console.log(LOG, 'Child closed by user');
            this._restoreRendererContainer();
            this.cleanup();
            return;
        }

        if (Date.now() - this.lastChildHeartbeat > HEARTBEAT_TIMEOUT) {
            console.warn(LOG, 'Child unresponsive — closing');
            this.close();
        }
    }

    _onUnload() {
        if (this.windowRef && !this.windowRef.closed) {
            this.windowRef.close();
        }
    }

    close() {
        if (this.windowRef && !this.windowRef.closed) {
            this.windowRef.close();
        }
        this._restoreRendererContainer();
        this.cleanup();
    }

    cleanup() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = 0;
        }
        try { this.channel?.close?.(); } catch (e) {}
        this.channel = null;
        this.windowRef = null;
        this.isActive = false;
        this.sessionId = null;
    }

    _notifyPopupBlocked() {
        if (this._popupBlocked) return;
        this._popupBlocked = true;
        window.dispatchEvent(new CustomEvent('sm:game-view-popup-blocked'));
        if (typeof window.showToast === 'function') {
            window.showToast('Allow popups for Game View', 'warning');
        }
    }
}

// Export
window.GameViewWindowManager = GameViewWindowManager;
window.gameViewWindowManager = new GameViewWindowManager();

// Auto-open on Play, close on Stop
window.addEventListener('sm:pie-start', () => {
    setTimeout(() => window.gameViewWindowManager.open(), 150);
});
window.addEventListener('sm:pie-stop', () => {
    window.gameViewWindowManager.close();
});

console.log(LOG, 'Manager ready');
})();