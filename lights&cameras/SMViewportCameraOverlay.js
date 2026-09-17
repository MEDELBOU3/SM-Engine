// ============================================================================
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
        updateAspect(cam.aspect || 16/9);
        
        // Listen for window resize to fix borders dynamically
        window._onResizeCamView = () => updateAspect(cam.aspect || 16/9);
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

function _enterCameraView(cam) {
    if (!cam || (!cam.isCamera && !cam.userData?.primaryCamera)) return;
    
    const targetCam = cam.isCamera ? cam : cam.userData.primaryCamera;

    // 1. Backup the Editor Camera so we can return to it
    if (!window._editorCamera) {
        window._editorCamera = window.camera;
    }

    _viewedCamera = targetCam;
    _isInsideCamera = true;

    // 2. Hide the camera's physical body/helpers so we don't block the lens
    window.scene.traverse(obj => {
        if (obj === targetCam || obj.userData?.primaryCamera === targetCam) {
            obj.traverse(child => {
                if (child.name === '__CameraBody__' || child.type.includes('Helper')) {
                    child.userData.smrWasVisible = child.visible;
                    child.visible = false;
                }
            });
        }
    });

    // 3. Swap the renderer to use the scene camera
    window.camera = targetCam;
    if (window.SMEngineRenderer) window.SMEngineRenderer.activeRenderCamera = targetCam;

    // 4. Show Blender UI Overlay
    SMViewportCameraOverlay.show(targetCam);

    // 5. Disable standard OrbitControls, and setup "Pop-Out" listener
    if (window.controls) window.controls.enabled = false;
    
    // Add pop-out triggers (Mousedown to orbit/pan, or wheel to zoom)
    window.renderer.domElement.addEventListener('mousedown', _popOutCameraView);
    window.renderer.domElement.addEventListener('wheel', _popOutCameraView);
    
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
    _isInsideCamera = false;

    // 1. Hide Overlay
    SMViewportCameraOverlay.hide();

    // 2. Remove Pop-Out Listeners
    window.renderer.domElement.removeEventListener('mousedown', _popOutCameraView);
    window.renderer.domElement.removeEventListener('wheel', _popOutCameraView);

    // 3. Restore Editor Camera
    if (window._editorCamera) {
        window.camera = window._editorCamera;
    }

    // 4. Re-enable Orbit Controls
    if (window.controls) {
        window.controls.enabled = true;
    }

    // 5. Un-hide the camera body meshes
    if (_viewedCamera) {
        window.scene.traverse(obj => {
            if (obj === _viewedCamera || obj.userData?.primaryCamera === _viewedCamera) {
                obj.traverse(child => {
                    if (child.userData.smrWasVisible !== undefined) {
                        child.visible = child.userData.smrWasVisible;
                        delete child.userData.smrWasVisible;
                    }
                });
            }
        });
    }

    _viewedCamera = null;
    console.log('[Camera] Exited to Free View');
}

// Make functions globally available for your UI buttons
window._enterCameraView = _enterCameraView;
window._exitCameraView = _exitCameraView;