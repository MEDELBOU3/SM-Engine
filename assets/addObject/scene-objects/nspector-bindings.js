// ============================================================================
// assets/addObject/scene-objects/nspector-bindings.js
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Menu Dispatcher bindings
    const menuBindings = {
        "addPointLightMenu": window.addPointLightMenu,
        "addSunLightMenu": window.addSunLightMenu,
        "addSpotLightMenu": window.addSpotLightMenu,
        "addDirectionalLightMenu": window.addDirectionalLightMenu,
        "addHemisphereLightMenu": window.addHemisphereLightMenu,
        "addAreaLightMenu": window.addAreaLightMenu,
        "addPerspectiveCameraMenu": window.addPerspectiveCameraMenu,
        "addOrthographicCameraMenu": window.addOrthographicCameraMenu,
        "addCubeCameraMenu": window.addCubeCameraMenu,
    };

    Object.entries(menuBindings).forEach(([elementId, handler]) => {
        const button = document.getElementById(elementId);
        if (button && typeof handler === 'function') {
            button.addEventListener('click', handler);
        }
    });

    // Ensure CameraPanel & LightingPanel initialize attached inside InspectorPanel
    if (window.LightingPanel && typeof window.LightingPanel.init === 'function') {
        window.LightingPanel.init();
    }
    if (window.CameraPanel && typeof window.CameraPanel.init === 'function') {
        window.CameraPanel.init();
    }

    // Standard Transform Sync Logic
    const transformInputs = {
        posX: document.getElementById('posX'),
        posY: document.getElementById('posY'),
        posZ: document.getElementById('posZ'),
        rotX: document.getElementById('rotX'),
        rotY: document.getElementById('rotY'),
        rotZ: document.getElementById('rotZ'),
        scaleX: document.getElementById('scaleX'),
        scaleY: document.getElementById('scaleY'),
        scaleZ: document.getElementById('scaleZ')
    };

    function syncTransformInputs(obj) {
        if (!obj || !transformInputs.posX) return;

        transformInputs.posX.value = obj.position.x.toFixed(2);
        transformInputs.posY.value = obj.position.y.toFixed(2);
        transformInputs.posZ.value = obj.position.z.toFixed(2);

        transformInputs.rotX.value = THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(1);
        transformInputs.rotY.value = THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1);
        transformInputs.rotZ.value = THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(1);

        transformInputs.scaleX.value = obj.scale.x.toFixed(2);
        transformInputs.scaleY.value = obj.scale.y.toFixed(2);
        transformInputs.scaleZ.value = obj.scale.z.toFixed(2);
    }

    // Selection Coordinator
    window.handleObjectSelection = function (obj) {
        // View selection is owned by the inspector dock, not by direct style
        // changes to individual panel elements.
        window.PanelDockManager?.closePanel?.('lighting');
        window.PanelDockManager?.closePanel?.('camera');

        if (!obj) return;

        syncTransformInputs(obj);

        if (obj.isLight) {
            if (window.LightingPanel) {
                window.LightingPanel.open(obj);
            }
        } else if (obj.isCamera) {
            if (window.CameraPanel) {
                window.CameraPanel.open(obj);
            }
        }
    };

    // Reactive Selection Hook
    let _currentSelection = window.selectedObject || null;

    Object.defineProperty(window, 'selectedObject', {
        get() {
            return _currentSelection;
        },
        set(val) {
            _currentSelection = val;
            window.handleObjectSelection(val);
        },
        configurable: true,
        enumerable: true
    });

    if (window.transformControls) {
        window.transformControls.addEventListener('change', () => {
            if (window.selectedObject) {
                syncTransformInputs(window.selectedObject);
            }
        });
    }

    if (window.selectedObject) {
        window.handleObjectSelection(window.selectedObject);
    }
});
