// SM ENGINE RENDER MIGRATION — FIXED
// No secondary continuous renderer loop. Main animate-loop owns frames.
// rendering/render.js
let shouldRenderContinuously = false;
let cleanRenderMode = false;
let cleanRenderState = null;

/*
 * rendering/render.js is now a render-command utility.
 * It must never own a second continuous requestAnimationFrame render loop.
 * The main engine animate loop owns continuous rendering.
 */
function getRenderUtilityCamera() {
    return (
        window.SMViewportSystem?.getActivePanel?.()?.camera ||
        window._viewedCamera ||
        window.camera ||
        camera ||
        null
    );
}

function requestSMRenderFrame(options = {}) {
    const activeCamera =
        options.camera ||
        getRenderUtilityCamera();

    if (!activeCamera) {
        return false;
    }

    if (window.smRenderer?.renderFrame) {
        return window.smRenderer.renderFrame({
            camera: activeCamera,
            delta: options.delta ?? 0,
            time: options.time ?? performance.now() * 0.001,
            renderMode:
                options.renderMode ||
                (
                    window.SMViewportShading?.getMode?.() === 'rendered'
                        ? 'rendered'
                        : 'editor'
                )
        });
    }

    /*
     * Migration fallback: keep the editor usable if SMRenderer has not
     * initialized yet.
     */
    if (window.smRender?.render) {
        return window.smRender.render(
            activeCamera,
            options.delta ?? 0
        );
    }

    renderer.render(
        scene,
        activeCamera
    );

    return true;
}

function rendering() {
    const delta =
        typeof clock?.getDelta === 'function'
            ? clock.getDelta()
            : 0;

    if (mixer) mixer.update(delta);
    if (controls) controls.update();

    /*
     * Single requested frame only.
     * NO requestAnimationFrame here.
     */
    requestSMRenderFrame({
        delta
    });
}
function collectHelperVisibility() {
    const state = new Map();
    scene.traverse((obj) => {
        const helper =
            obj.isHelper ||
            obj.name?.includes("Helper") ||
            obj.name?.includes("Grid") ||
            obj.name === "axesHelper" ||
            obj.userData?.isDebug;
        if (helper) state.set(obj, obj.visible);
    });
    return state;
}
function hideAllHelpers() {
    scene.traverse((obj) => {
        const helper =
            obj.isHelper ||
            obj.name?.includes("Helper") ||
            obj.name?.includes("Grid") ||
            obj.name === "axesHelper" ||
            obj.userData?.isDebug;
        if (helper) obj.visible = false;
    });
}
function restoreHelpers(visibilityState = null) {
    if (visibilityState instanceof Map) {
        for (const [obj, visible] of visibilityState) {
            if (obj) obj.visible = visible;
        }
        return;
    }
    window.workspaceManager?._syncWorkspaceObjectVisibility?.(
        window.workspaceManager?.currentMode,
        scene
    );
}
function startCleanRender() {
    if (cleanRenderMode) return;
    cleanRenderMode = true;
    cleanRenderState = {
        shadowEnabled: renderer.shadowMap?.enabled,
        shadowType: renderer.shadowMap?.type,
        toneMapping: renderer.toneMapping,
        toneMappingExposure: renderer.toneMappingExposure,
        pixelRatio: renderer.getPixelRatio?.() || 1,
        outputColorSpace: renderer.outputColorSpace,
        outputEncoding: renderer.outputEncoding,
        controlsEnabled: controls?.enabled,
        transformVisible: transformControls?.visible,
        transformEnabled: transformControls?.enabled,
        fog: scene.fog,
        helpers: collectHelperVisibility()
    };
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ("outputEncoding" in renderer && THREE.sRGBEncoding !== undefined) {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(window.devicePixelRatio);
    if (controls) controls.enabled = false;
    if (transformControls) {
        transformControls.detach();
        transformControls.visible = false;
        transformControls.enabled = false;
    }
    scene.fog = null;
    hideAllHelpers();
    rendering();
    console.log("✅ Clean Render Mode activated");
}
function stopCleanRender() {
    if (!cleanRenderMode) return;
    cleanRenderMode = false;
    const state = cleanRenderState;
    cleanRenderState = null;
    if (state) {
        renderer.shadowMap.enabled = state.shadowEnabled;
        renderer.shadowMap.type = state.shadowType;
        renderer.toneMapping = state.toneMapping;
        renderer.toneMappingExposure = state.toneMappingExposure;
        renderer.setPixelRatio(state.pixelRatio);
        if ("outputColorSpace" in renderer && state.outputColorSpace !== undefined) {
            renderer.outputColorSpace = state.outputColorSpace;
        }
        if ("outputEncoding" in renderer && state.outputEncoding !== undefined) {
            renderer.outputEncoding = state.outputEncoding;
        }
        if (controls) controls.enabled = state.controlsEnabled;
        if (transformControls) {
            transformControls.visible = state.transformVisible;
            transformControls.enabled = state.transformEnabled;
        }
        scene.fog = state.fog;
        restoreHelpers(state.helpers);
    }
    window.SMViewportShading?.preview?.();
    window.workspaceManager?._syncWorkspaceObjectVisibility?.(
        window.workspaceManager?.currentMode,
        scene
    );
    rendering();
    console.log("🔄 Editor Mode restored");
}
function exportRenderImage(highRes = false) {
    const oldPixelRatio = renderer.getPixelRatio();
    if (highRes) {
        renderer.setPixelRatio(window.devicePixelRatio * 2);
        requestSMRenderFrame({ camera: getRenderUtilityCamera(), renderMode: 'rendered' });
    }
    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = highRes ? 'rendered_scene_HD.png' : 'rendered_scene.png';
    a.click();
    if (highRes) renderer.setPixelRatio(oldPixelRatio);
}
function toggleWireframe() {
    const shading = window.SMViewportShading;
    if (shading?.setMode) {
        shading.setMode(shading.getMode?.() === 'wireframe' ? 'solid' : 'wireframe');
        return;
    }
    scene.traverse((obj) => {
        if (!obj.material) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((mat) => {
            mat.wireframe = !mat.wireframe;
            mat.needsUpdate = true;
        });
    });
    requestSMRenderFrame({ camera: getRenderUtilityCamera() });
}
function renderTurntable(frames = 36) {
    const step = (Math.PI * 2) / frames;
    let frame = 0;
    function rotateAndRender() {
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
        camera.lookAt(scene.position);
        requestSMRenderFrame({ camera: getRenderUtilityCamera(), renderMode: 'rendered' });
        const dataURL = renderer.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = `frame_${String(frame).padStart(3, '0')}.png`;
        a.click();
        frame++;
        if (frame < frames) requestAnimationFrame(rotateAndRender);
    }
    rotateAndRender();
}
const renderingBTN = document.getElementById("renderingBTN");
const renderingMenu = document.getElementById("renderingMenu");
renderingBTN?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!renderingMenu) return;
    renderingMenu.style.display = renderingMenu.style.display === "block" ? "none" : "block";
});
document.addEventListener("click", (event) => {
    if (!renderingBTN || !renderingMenu) return;
    if (!renderingBTN.contains(event.target) && !renderingMenu.contains(event.target)) {
        renderingMenu.style.display = "none";
    }
});
document.getElementById('startStopRender')?.addEventListener('click', () => {
    shouldRenderContinuously = !shouldRenderContinuously;

    /*
     * Compatibility control only.
     * Continuous rendering belongs to engine/animate-loop.js.
     * Here we only toggle the legacy Rendered/post-process state
     * and request one immediate refresh.
     */
    if (window.smRender) {
        window.smRender.active = shouldRenderContinuously;
    }

    console.log(
        shouldRenderContinuously
            ? "🟢 Rendered preview enabled through the main engine loop."
            : "🔴 Rendered preview disabled; main engine loop remains active."
    );

    rendering();
});
document.getElementById('toggleCleanRender')?.addEventListener('click', () => {
    if (!cleanRenderMode) startCleanRender();
    else stopCleanRender();
});
document.getElementById('exportImage')?.addEventListener('click', () => exportRenderImage(false));
document.getElementById('exportImageHD')?.addEventListener('click', () => exportRenderImage(true));
document.getElementById('toggleWireframe')?.addEventListener('click', toggleWireframe);
document.getElementById('turntableRender')?.addEventListener('click', () => renderTurntable(36));