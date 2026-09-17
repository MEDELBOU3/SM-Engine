// ============================================================================
// engine/SMViewportCameraOverlay.js
// BLENDER-STYLE CAMERA VIEWPORT OVERLAY & LOGIC
// ============================================================================

const SMViewportCameraOverlay = (() => {
    let _overlay = null;
    let _innerFrame = null;
    let _label = null;

    function _build() {
        if (_overlay) return;

        // The Dark Passepartout (Outer border)
        _overlay = document.createElement('div');
        _overlay.id = 'smr-cam-overlay';
        _overlay.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none; z-index: 800; display: none;
            border: 0px solid rgba(20, 20, 20, 0.95);
            box-sizing: border-box; transition: border-width 0.15s ease-out;
        `;

        // The inner dashed orange frame (Blender style)
        _innerFrame = document.createElement('div');
        _innerFrame.style.cssText = `
            width: 100%; height: 100%;
            border: 1px dashed rgba(245, 166, 35, 0.8);
            box-sizing: border-box; position: relative;
        `;

        _label = document.createElement('div');
        _label.style.cssText = `
            position: absolute; bottom: 5px; left: 5px;
            background: rgba(0,0,0,0.6); color: #f5a623;
            font-family: monospace; font-size: 11px; padding: 3px 6px;
            border-radius: 3px;
        `;

        _innerFrame.appendChild(_label);
        _overlay.appendChild(_innerFrame);

        const vp = document.getElementById('renderer-container') || document.body;
        vp.appendChild(_overlay);
    }

    function updateAspect(cameraAspect) {
        if (!_overlay) return;
        const vp = document.getElementById('renderer-container');
        const w = vp.clientWidth;
        const h = vp.clientHeight;

        // Calculate letterboxing/pillarboxing
        const frameW = Math.min(w, h * cameraAspect);
        const frameH = Math.min(h, w / cameraAspect);

        const tb = Math.max(0, (h - frameH) / 2);
        const lr = Math.max(0, (w - frameW) / 2);

        _overlay.style.borderWidth = `${tb}px ${lr}px`;
    }

    function show(cam) {
        _build();
        _overlay.style.display = 'block';
        _label.textContent = `🎥 ${cam.name || 'Camera'}`;
        updateAspect(cam.aspect || 16 / 9);

        // Listen for window resize to fix borders dynamically
        window._onResizeCamView = () => updateAspect(cam.aspect || 16 / 9);
        window.addEventListener('resize', window._onResizeCamView);
    }

    function hide() {
        if (_overlay) _overlay.style.display = 'none';
        window.removeEventListener('resize', window._onResizeCamView);
    }

    return { show, hide, updateAspect };
})();

// --- CAMERA VIEW LOGIC ---

let _isInsideCamera = false;
let _viewedCamera = null;

function _getTransformControls() {
    return window.transformControls || window.transformControl || window.gizmoManager?.transformControls || null;
}
function _setTransformControlsRenderCamera(cam) {
    const tc = _getTransformControls();
    if (!tc || !cam) return;
    if ('camera' in tc) tc.camera = cam;
    tc.enabled = true;
    tc.visible = true;
    const helper = typeof tc.getHelper === 'function' ? tc.getHelper() : null;
    if (helper) {
        helper.visible = true;
        helper.frustumCulled = false;
    }
}
function _refreshCameraHelpers() {
    if (!window.scene) return;
    window.scene.traverse(obj => {
        if (obj.isCameraHelper || obj.type === 'CameraHelper' || obj.userData?.isCameraHelper) {
            obj.visible = true;
            obj.frustumCulled = false;
            obj.update?.();
        }
    });
}
function _setTargetCameraBodyVisible(targetCam, visible) {
    if (!targetCam || !window.scene) return;
    window.scene.traverse(obj => {
        const belongsToCamera = obj === targetCam || obj.userData?.primaryCamera === targetCam || obj.userData?.cameraOwnerUuid === targetCam.uuid;
        if (!belongsToCamera) return;
        obj.traverse?.(child => {
            if (child.name === '__CameraBody__') {
                if (!visible) {
                    if (child.userData.smrWasVisible === undefined) child.userData.smrWasVisible = child.visible;
                    child.visible = false;
                } else if (child.userData.smrWasVisible !== undefined) {
                    child.visible = child.userData.smrWasVisible;
                    delete child.userData.smrWasVisible;
                }
            }
        });
    });
}
function _setActiveRenderCamera(cam) {
    window._activeRenderCamera = cam || null;
    if (window.SMEngineRenderer) {
        window.SMEngineRenderer.activeRenderCamera = cam || null;
    }
}

function _enterCameraView(cam) {
    if (!cam || (!cam.isCamera && !cam.userData?.primaryCamera)) return;
    const targetCam = cam.isCamera ? cam : cam.userData.primaryCamera;
    if (_isInsideCamera && _viewedCamera === targetCam) return;
    if (_isInsideCamera) {
        _exitCameraView();
    }
    if (!window._editorCamera) {
        window._editorCamera = window.cameraSystem?.camera || window.camera;
    }
    _viewedCamera = targetCam;
    _isInsideCamera = true;
    window._viewedCamera = targetCam;
    window._isInsideCamera = true;
    targetCam.updateMatrixWorld(true);
    targetCam.updateProjectionMatrix?.();
    _setTargetCameraBodyVisible(targetCam, false);
    _refreshCameraHelpers();
    _setActiveRenderCamera(targetCam);
    _setTransformControlsRenderCamera(targetCam);
    SMViewportCameraOverlay.show(targetCam);
    if (window.controls) {
        window.controls.enabled = false;
    }
    window.renderer?.domElement?.addEventListener('mousedown', _popOutCameraView);
    window.renderer?.domElement?.addEventListener('wheel', _popOutCameraView, { passive: true });
    window.dispatchEvent(new CustomEvent('sm:camera-overlay-enter', {
        detail: { camera: targetCam }
    }));
    console.log(`[Camera] Look through: ${targetCam.name}`);
}

function _popOutCameraView(e) {
    // Only pop out on right/middle click drag, or zoom scroll. 
    // Left click (0) might be used to select things, so we allow left clicks.
    if (e.type === 'mousedown' && e.button === 0) return;

    _exitCameraView();

    // To make the transition seamless, teleport the editor camera to exactly 
    // where the scene camera was before we re-enable OrbitControls.
    if (window._editorCamera && _viewedCamera) {
        window._editorCamera.position.copy(_viewedCamera.position);
        window._editorCamera.quaternion.copy(_viewedCamera.quaternion);

        if (window.controls) {
            // Push the orbit target 10 units in front of the camera so rotation works normally
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(_viewedCamera.quaternion);
            window.controls.target.copy(_viewedCamera.position).add(dir.multiplyScalar(10));
            window.controls.update();
        }
    }
}

function _exitCameraView() {
    if (!_isInsideCamera) return;
    const previousCamera = _viewedCamera;
    _isInsideCamera = false;
    window._isInsideCamera = false;
    SMViewportCameraOverlay.hide();
    window.renderer?.domElement?.removeEventListener('mousedown', _popOutCameraView);
    window.renderer?.domElement?.removeEventListener('wheel', _popOutCameraView);
    if (previousCamera) {
        _setTargetCameraBodyVisible(previousCamera, true);
    }
    const editorCam = window._editorCamera || window.cameraSystem?.camera || window.camera;
    _setActiveRenderCamera(null);
    if (editorCam) {
        window.camera = editorCam;
        _setTransformControlsRenderCamera(editorCam);
    }
    _refreshCameraHelpers();
    if (window.controls) {
        if (editorCam && window.controls.object !== editorCam) {
            window.controls.object = editorCam;
        }
        window.controls.enabled = true;
        window.controls.update?.();
    }
    _viewedCamera = null;
    window._viewedCamera = null;
    window.dispatchEvent(new CustomEvent('sm:camera-overlay-exit', {
        detail: { camera: previousCamera }
    }));
    console.log('[Camera] Exited to Free View');
}
// Make functions globally available for your UI buttons
window._enterCameraView = _enterCameraView;
window._exitCameraView = _exitCameraView;
window.getSMActiveRenderCamera = function () {
    if (
        window._gameCameraActive &&
        window._gameRenderCamera
    ) {
        return window._gameRenderCamera;
    }
    if (
        window._isInsideCamera &&
        window._viewedCamera
    ) {
        return window._viewedCamera;
    }
    if (
        window.cameraSystem?.currentViewMode === 'orthographic' &&
        window.orthographicCamera
    ) {
        return window.orthographicCamera;
    }
    return (
        window.cameraSystem?.camera ||
        window.camera
    );
};