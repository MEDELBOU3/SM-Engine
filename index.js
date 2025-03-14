
    document.addEventListener("DOMContentLoaded", function () {
        const previewContainer = document.getElementById("cameraPreview");
        const expandButton = document.getElementById("expandPreview");
        const minimizeButton = document.getElementById("minimizePreview");
        
        let isDragging = false;
        let offsetX, offsetY;
    
        // Ensure we only create one renderer
        const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        previewRenderer.setSize(previewContainer.clientWidth, previewContainer.clientHeight);
        previewRenderer.setPixelRatio(window.devicePixelRatio);
        previewContainer.appendChild(previewRenderer.domElement);
    
        function updatePreviewSize() {
            const rect = previewContainer.getBoundingClientRect();
            previewRenderer.setSize(rect.width, rect.height);
            if (activeCamera) {
                activeCamera.aspect = rect.width / rect.height;
                activeCamera.updateProjectionMatrix();
            }
        }
    
        // Toggle Expand Mode
        expandButton.addEventListener("click", () => {
            previewContainer.classList.toggle("expanded");
            if (previewContainer.classList.contains("expanded")) {
                previewContainer.style.width = "100%";
                previewContainer.style.height = "100%";
            } else {
                previewContainer.style.width = "23%";
                previewContainer.style.height = "25%";
            }
            updatePreviewSize();
        });
    
        // Toggle Minimize Mode
        minimizeButton.addEventListener("click", () => {
            previewContainer.classList.toggle("minimized");
            if (previewContainer.classList.contains("minimized")) {
                previewContainer.style.width = "50px";
                previewContainer.style.height = "50px";
            } else {
                previewContainer.style.width = "23%";
                previewContainer.style.height = "25%";
            }
        });
    
        // Dragging Functionality
        previewContainer.addEventListener("mousedown", (e) => {
            isDragging = true;
            offsetX = e.clientX - previewContainer.offsetLeft;
            offsetY = e.clientY - previewContainer.offsetTop;
            previewContainer.style.cursor = "grabbing";
        });
    
        document.addEventListener("mousemove", (e) => {
            if (isDragging) {
                let newX = e.clientX - offsetX;
                let newY = e.clientY - offsetY;
    
                // Prevent dragging outside the viewport
                const maxX = window.innerWidth - previewContainer.offsetWidth;
                const maxY = window.innerHeight - previewContainer.offsetHeight;
                previewContainer.style.left = Math.max(0, Math.min(newX, maxX)) + "px";
                previewContainer.style.top = Math.max(0, Math.min(newY, maxY)) + "px";
            }
        });
    
        document.addEventListener("mouseup", () => {
            isDragging = false;
            previewContainer.style.cursor = "grab";
        });
    
        // Resize observer for dynamic adjustments
        new ResizeObserver(updatePreviewSize).observe(previewContainer);
    });
    

    const ACTION_TYPES = {
        // Object actions
        ADD: 'add',
        REMOVE: 'remove',
        CHANGE: 'change',
        SELECT: 'select',
        DESELECT: 'deselect',
        MOVE: 'move',
        ROTATE: 'rotate',
        SCALE: 'scale',
        COLOR: 'color',
        MATERIAL: 'material',
        TEXTURE: 'texture',
        GEOMETRY: 'geometry',
        VISIBILITY: 'visibility',
        OPACITY: 'opacity',
        SHADOW: 'shadow',
        RECEIVE_SHADOW: 'receiveShadow',
        CAST_SHADOW: 'castShadow',
    
        // Light-specific actions
        LIGHT_COLOR: 'lightColor',
        LIGHT_INTENSITY: 'lightIntensity',
        LIGHT_DISTANCE: 'lightDistance',
        LIGHT_ANGLE: 'lightAngle',
        LIGHT_PENUMBRA: 'lightPenumbra',
        LIGHT_DECAY: 'lightDecay',
        LIGHT_TARGET: 'lightTarget',
        LIGHT_SHADOW: 'lightShadow',
        LIGHT_SHADOW_BIAS: 'lightShadowBias',
        LIGHT_SHADOW_RADIUS: 'lightShadowRadius',
        LIGHT_SHADOW_MAP_SIZE: 'lightShadowMapSize',
        LIGHT_SHADOW_CAMERA: 'lightShadowCamera',
        LIGHT_SHADOW_CAMERA_NEAR: 'lightShadowCameraNear',
        LIGHT_SHADOW_CAMERA_FAR: 'lightShadowCameraFar',
        LIGHT_SHADOW_CAMERA_LEFT: 'lightShadowCameraLeft',
        LIGHT_SHADOW_CAMERA_RIGHT: 'lightShadowCameraRight',
        LIGHT_SHADOW_CAMERA_TOP: 'lightShadowCameraTop',
        LIGHT_SHADOW_CAMERA_BOTTOM: 'lightShadowCameraBottom',
        LIGHT_SHADOW_CAMERA_FOV: 'lightShadowCameraFov',
        LIGHT_SHADOW_CAMERA_ZOOM: 'lightShadowCameraZoom',
        LIGHT_SHADOW_CAMERA_FOCUS: 'lightShadowCameraFocus',
        LIGHT_SHADOW_CAMERA_FILM_GAUGE: 'lightShadowCameraFilmGauge',
        LIGHT_SHADOW_CAMERA_FILM_OFFSET: 'lightShadowCameraFilmOffset',
        LIGHT_SHADOW_CAMERA_VIEW: 'lightShadowCameraView',
        LIGHT_SHADOW_CAMERA_PROJECTION: 'lightShadowCameraProjection',
        LIGHT_SHADOW_CAMERA_CUSTOM_NEAR: 'lightShadowCameraCustomNear',
        LIGHT_SHADOW_CAMERA_CUSTOM_FAR: 'lightShadowCameraCustomFar',
        LIGHT_SHADOW_CAMERA_CUSTOM_LEFT: 'lightShadowCameraCustomLeft',
        LIGHT_SHADOW_CAMERA_CUSTOM_RIGHT: 'lightShadowCameraCustomRight',
        LIGHT_SHADOW_CAMERA_CUSTOM_TOP: 'lightShadowCameraCustomTop',
        LIGHT_SHADOW_CAMERA_CUSTOM_BOTTOM: 'lightShadowCameraCustomBottom',
        LIGHT_SHADOW_CAMERA_CUSTOM_FOV: 'lightShadowCameraCustomFov',
        LIGHT_SHADOW_CAMERA_CUSTOM_ZOOM: 'lightShadowCameraCustomZoom',
        LIGHT_SHADOW_CAMERA_CUSTOM_FOCUS: 'lightShadowCameraCustomFocus',
        LIGHT_SHADOW_CAMERA_CUSTOM_FILM_GAUGE: 'lightShadowCameraCustomFilmGauge',
        LIGHT_SHADOW_CAMERA_CUSTOM_FILM_OFFSET: 'lightShadowCameraCustomFilmOffset',
        LIGHT_SHADOW_CAMERA_CUSTOM_VIEW: 'lightShadowCameraCustomView',
        LIGHT_SHADOW_CAMERA_CUSTOM_PROJECTION: 'lightShadowCameraCustomProjection',
    };
    
    // Apply a history action (e.g., add or remove an object from the scene)
    function applyHistoryAction(action) {
        if (action.type === ACTION_TYPES.ADD) {
            scene.add(action.object);
        } else if (action.type === ACTION_TYPES.REMOVE) {
            scene.remove(action.object);
        }
    
        updateHistoryPanel();
    }
    
    // Add an action to the history stack
    function addHistoryAction(action) {
        // Remove all future actions
        history.splice(currentHistoryIndex + 1);
    
        // Add new action
        history.push(action);
        currentHistoryIndex = history.length - 1;
    
        updateHistoryPanel();
    }
    
    // Generic handler for all object changes
    function handleObjectChange(type, object) {
        // Validate the action type
        if (!Object.values(ACTION_TYPES).includes(type)) {
            console.warn(`Invalid action type: ${type}`);
            return;
        }
    
        addHistoryAction({
            type: type,
            object: object
        });
    }
    
    // Specific event handlers using the generic handler
    function onObjectAdded(object) {
        handleObjectChange(ACTION_TYPES.ADD, object);
    }
    
    function onObjectRemoved(object) {
        handleObjectChange(ACTION_TYPES.REMOVE, object);
    }
    
    function onObjectChanged(object) {
        handleObjectChange(ACTION_TYPES.CHANGE, object);
    }
    
    function onObjectSelected(object) {
        handleObjectChange(ACTION_TYPES.SELECT, object);
    }
    
    function onObjectDeselected(object) {
        handleObjectChange(ACTION_TYPES.DESELECT, object);
    }
    
    function onObjectMoved(object) {
        handleObjectChange(ACTION_TYPES.MOVE, object);
    }
    
    function onObjectRotated(object) {
        handleObjectChange(ACTION_TYPES.ROTATE, object);
    }
    
    function onObjectScaled(object) {
        handleObjectChange(ACTION_TYPES.SCALE, object);
    }
    
    function onObjectColorChanged(object) {
        handleObjectChange(ACTION_TYPES.COLOR, object);
    }
    
    function onObjectMaterialChanged(object) {
        handleObjectChange(ACTION_TYPES.MATERIAL, object);
    }
    
    function onObjectTextureChanged(object) {
        handleObjectChange(ACTION_TYPES.TEXTURE, object);
    }
    
    function onObjectGeometryChanged(object) {
        handleObjectChange(ACTION_TYPES.GEOMETRY, object);
    }
    
    function onObjectVisibilityChanged(object) {
        handleObjectChange(ACTION_TYPES.VISIBILITY, object);
    }
    
    function onObjectOpacityChanged(object) {
        handleObjectChange(ACTION_TYPES.OPACITY, object);
    }
    
    function onObjectShadowChanged(object) {
        handleObjectChange(ACTION_TYPES.SHADOW, object);
    }
    
    function onObjectReceiveShadowChanged(object) {
        handleObjectChange(ACTION_TYPES.RECEIVE_SHADOW, object);
    }
    
    function onObjectCastShadowChanged(object) {
        handleObjectChange(ACTION_TYPES.CAST_SHADOW, object);
    }
    
    function onObjectLightColorChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_COLOR, object);
    }
    
    function onObjectLightIntensityChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_INTENSITY, object);
    }
    
    function onObjectLightDistanceChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_DISTANCE, object);
    }
    
    function onObjectLightAngleChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_ANGLE, object);
    }
    
    function onObjectLightPenumbraChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_PENUMBRA, object);
    }
    
    function onObjectLightDecayChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_DECAY, object);
    }
    
    function onObjectLightTargetChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_TARGET, object);
    }
    
    function onObjectLightShadowChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW, object);
    }
    
    function onObjectLightShadowBiasChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_BIAS, object);
    }
    
    function onObjectLightShadowRadiusChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_RADIUS, object);
    }
    
    function onObjectLightShadowMapSizeChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_MAP_SIZE, object);
    }
    
    function onObjectLightShadowCameraChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA, object);
    }
    
    function onObjectLightShadowCameraNearChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_NEAR, object);
    }
    
    function onObjectLightShadowCameraFarChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_FAR, object);
    }
    
    function onObjectLightShadowCameraLeftChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_LEFT, object);
    }
    
    function onObjectLightShadowCameraRightChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_RIGHT, object);
    }
    
    function onObjectLightShadowCameraTopChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_TOP, object);
    }
    
    function onObjectLightShadowCameraBottomChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_BOTTOM, object);
    }
    
    function onObjectLightShadowCameraFovChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_FOV, object);
    }
    
    function onObjectLightShadowCameraZoomChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_ZOOM, object);
    }
    
    function onObjectLightShadowCameraFocusChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_FOCUS, object);
    }
    
    function onObjectLightShadowCameraFilmGaugeChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_FILM_GAUGE, object);
    }
    
    function onObjectLightShadowCameraFilmOffsetChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_FILM_OFFSET, object);
    }
    
    function onObjectLightShadowCameraViewChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_VIEW, object);
    }
    
    function onObjectLightShadowCameraProjectionChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_PROJECTION, object);
    }
    
    function onObjectLightShadowCameraCustomNearChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_NEAR, object);
    }
    
    function onObjectLightShadowCameraCustomFarChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_FAR, object);
    }
    
    function onObjectLightShadowCameraCustomLeftChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_LEFT, object);
    }
    
    function onObjectLightShadowCameraCustomRightChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_RIGHT, object);
    }
    
    function onObjectLightShadowCameraCustomTopChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_TOP, object);
    }
    
    function onObjectLightShadowCameraCustomBottomChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_BOTTOM, object);
    }
    
    function onObjectLightShadowCameraCustomFovChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_FOV, object);
    }
    
    function onObjectLightShadowCameraCustomZoomChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_ZOOM, object);
    }
    
    function onObjectLightShadowCameraCustomFocusChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_FOCUS, object);
    }
    
    function onObjectLightShadowCameraCustomFilmGaugeChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_FILM_GAUGE, object);
    }
    
    function onObjectLightShadowCameraCustomFilmOffsetChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_FILM_OFFSET, object);
    }
    
    function onObjectLightShadowCameraCustomViewChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_VIEW, object);
    }
    
    function onObjectLightShadowCameraCustomProjectionChanged(object) {
        handleObjectChange(ACTION_TYPES.LIGHT_SHADOW_CAMERA_CUSTOM_PROJECTION, object);
    }
    
   
