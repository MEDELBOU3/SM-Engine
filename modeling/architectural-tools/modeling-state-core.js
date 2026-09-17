// Auto-restored core modeling state/runtime after accidental file truncation.
// This file intentionally provides the shared globals and dispatchers used by
// modeling-operations.js, architectural-tools.js, and modeling-advanced-tools.js.

var activeArchTool = null;
var architecturalElements = Array.isArray(window.architecturalElements)
    ? window.architecturalElements
    : [];
var selectedArchElements = Array.isArray(window.selectedArchElements)
    ? window.selectedArchElements
    : [];

var isLoopCutMode = typeof window.isLoopCutMode === "boolean" ? window.isLoopCutMode : false;
var loopCutState = window.loopCutState || null;
var loopCutPreviewLine = window.loopCutPreviewLine || null;
var LOOP_CUT_PREVIEW_COLOR = window.LOOP_CUT_PREVIEW_COLOR || 0x00ffff;
var loopCutSlideData = window.loopCutSlideData || { startX: 0, slideFactor: 0.5 };

var isViewBoxSelectionMode = typeof window.isViewBoxSelectionMode === "boolean"
    ? window.isViewBoxSelectionMode
    : false;

window.activeArchTool = activeArchTool;
window.architecturalElements = architecturalElements;
window.selectedArchElements = selectedArchElements;
window.isLoopCutMode = isLoopCutMode;
window.loopCutState = loopCutState;
window.loopCutPreviewLine = loopCutPreviewLine;
window.LOOP_CUT_PREVIEW_COLOR = LOOP_CUT_PREVIEW_COLOR;
window.loopCutSlideData = loopCutSlideData;
window.isViewBoxSelectionMode = isViewBoxSelectionMode;

function getActiveCameraForModelingRaycast() {
    if (typeof window.getActiveCameraForRaycast === "function") {
        const cam = window.getActiveCameraForRaycast();
        if (cam) return cam;
    }
    if (typeof camera !== "undefined" && camera) return camera;
    return null;
}

function syncCoreGlobals() {
    window.activeArchTool = activeArchTool;
    window.architecturalElements = architecturalElements;
    window.selectedArchElements = selectedArchElements;
    window.isLoopCutMode = isLoopCutMode;
    window.loopCutState = loopCutState;
    window.loopCutPreviewLine = loopCutPreviewLine;
    window.isViewBoxSelectionMode = isViewBoxSelectionMode;
}

function updateModelingRayFromEvent(event) {
    if (!renderer || !renderer.domElement || !raycaster || !mouse) return;
    if (typeof updateMouseNDC === "function") {
        updateMouseNDC(event);
    } else {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    const activeCam = getActiveCameraForModelingRaycast();
    if (activeCam) {
        raycaster.setFromCamera(mouse, activeCam);
    }
}

function toggleModelingMode(forceMode) {
    const nextMode = typeof forceMode === "boolean" ? forceMode : !window.isModelingMode;

    window.isModelingMode = !!nextMode;

    const toggleBtn = document.getElementById("toggle-modeling");
    if (toggleBtn) {
        toggleBtn.classList.toggle("active-tool", !!window.isModelingMode);
    }

    if (window.isModelingMode) {
        // ✓ DISABLE all global selection systems - ONLY modeling selection works
        if (typeof UnifiedModelingSystem !== "undefined" && UnifiedModelingSystem && 
            typeof UnifiedModelingSystem.disableGlobalSelectionSystems === "function") {
            UnifiedModelingSystem.disableGlobalSelectionSystems();
        }

        if (!activeObject && selectedObject && selectedObject.isMesh) {
            activeObject = selectedObject;
        }
        if (!activeObject && selectedObject && selectedObject.getObjectByProperty) {
            const childMesh = selectedObject.getObjectByProperty("isMesh", true);
            if (childMesh) activeObject = childMesh;
        }

        if (typeof UnifiedModelingSystem !== "undefined" && UnifiedModelingSystem) {
            if (activeObject && typeof UnifiedModelingSystem.rebuildAllHelpers === "function") {
                UnifiedModelingSystem.rebuildAllHelpers();
            } else if (typeof UnifiedModelingSystem.clearAllHelpers === "function") {
                UnifiedModelingSystem.clearAllHelpers();
            }
        }

        if (typeof updateModelingUI === "function") updateModelingUI();
        if (typeof updateTransformControlsForActiveView === "function") {
            updateTransformControlsForActiveView();
        }
        if (typeof transformControls !== "undefined" && transformControls) {
            transformControls.detach();
        }
        return true;
    }

    // ✓ RE-ENABLE global selection systems - exit modeling mode
    if (typeof UnifiedModelingSystem !== "undefined" && UnifiedModelingSystem && 
        typeof UnifiedModelingSystem.enableGlobalSelectionSystems === "function") {
        UnifiedModelingSystem.enableGlobalSelectionSystems();
    }

    isViewBoxSelectionMode = false;
    if (typeof cancelLoopCut === "function") cancelLoopCut();
    if (typeof deactivateCurrentArchTool === "function") deactivateCurrentArchTool();
    if (typeof finishSplineDrawing === "function") finishSplineDrawing();

    if (typeof clearSelection === "function") clearSelection();

    if (typeof UnifiedModelingSystem !== "undefined" && UnifiedModelingSystem) {
        if (typeof UnifiedModelingSystem.clearSelection === "function") {
            UnifiedModelingSystem.clearSelection();
        }
        if (typeof UnifiedModelingSystem.clearAllHelpers === "function") {
            UnifiedModelingSystem.clearAllHelpers();
        }
    }

    if (typeof transformControls !== "undefined" && transformControls) {
        transformControls.detach();
    }

    if (typeof updateModelingUI === "function") updateModelingUI();
    syncCoreGlobals();
    return false;
}

function deactivateCurrentArchTool() {
    const previous = activeArchTool;
    activeArchTool = null;

    switch (previous) {
        case "wall":
            if (typeof cleanupWallTool === "function") cleanupWallTool();
            break;
        case "rect-extrude":
            if (typeof cleanupRectExTool === "function") cleanupRectExTool();
            break;
        case "column":
            if (typeof cleanupColumnTool === "function") cleanupColumnTool();
            break;
        case "railing":
            if (typeof cleanupRailingTool === "function") cleanupRailingTool();
            break;
        case "door":
        case "window":
            if (typeof cleanupPlacementTool === "function") cleanupPlacementTool();
            break;
        case "measure":
            if (typeof cleanupMeasureTool === "function") cleanupMeasureTool();
            break;
        case "stairs":
            if (typeof cleanupStairsTool === "function") cleanupStairsTool();
            break;
        case "roof":
            if (typeof cleanupRoofTool === "function") cleanupRoofTool();
            break;
        case "room":
            if (typeof cleanupRoomTool === "function") cleanupRoomTool();
            break;
        case "curved-wall":
            if (typeof cleanupCurvedWallTool === "function") cleanupCurvedWallTool();
            break;
        case "terrain":
            if (typeof cleanupTerrainTool === "function") cleanupTerrainTool();
            break;
        case "spin":
            if (typeof cleanupSpinTool === "function") cleanupSpinTool();
            break;
        case "boolean-subtract":
            if (typeof cleanupBooleanSubtractTool === "function") cleanupBooleanSubtractTool();
            break;
        default:
            break;
    }

    document.querySelectorAll(".arch-tool, .modeling-tool, .poly-tool").forEach((btn) => {
        btn.classList.remove("active-tool");
    });

    syncCoreGlobals();
}

function toggleArchTool(toolName) {
    if (!window.isModelingMode) return;

    if (activeArchTool === toolName) {
        deactivateCurrentArchTool();
        return;
    }

    deactivateCurrentArchTool();
    activeArchTool = toolName;

    switch (toolName) {
        case "wall":
            if (typeof initWallTool === "function") initWallTool();
            break;
        case "rect-extrude":
            if (typeof initRectExTool === "function") initRectExTool();
            break;
        case "column":
            if (typeof initColumnTool === "function") initColumnTool();
            break;
        case "railing":
            if (typeof initRailingTool === "function") initRailingTool();
            break;
        case "door":
        case "window":
            if (typeof initPlacementTool === "function") initPlacementTool(toolName);
            break;
        case "measure":
            if (typeof initMeasureTool === "function") initMeasureTool();
            break;
        case "stairs":
            if (typeof initStairsTool === "function") initStairsTool();
            break;
        case "roof":
            if (typeof initRoofTool === "function") initRoofTool();
            break;
        case "room":
            if (typeof initRoomTool === "function") initRoomTool();
            break;
        case "curved-wall":
            if (typeof initCurvedWallTool === "function") initCurvedWallTool();
            break;
        case "terrain":
            if (typeof initTerrainTool === "function") initTerrainTool();
            break;
        case "spin":
            if (typeof initSpinTool === "function") initSpinTool();
            break;
        case "boolean-subtract":
            if (typeof initBooleanSubtractTool === "function") initBooleanSubtractTool();
            break;
        default:
            break;
    }

    const activeBtn = document.getElementById(`tool-${toolName}`);
    if (activeBtn) activeBtn.classList.add("active-tool");

    syncCoreGlobals();
}

function handleCanvasMouseMove(event) {
    if (!window.isModelingMode) return;
    updateModelingRayFromEvent(event);

    if (isLoopCutMode && typeof handleLoopCutPreviewInternal === "function") {
        handleLoopCutPreviewInternal(event);
        return;
    }

    if (window.polyPenToolActive && typeof handlePolyPenMouseMove === "function") {
        handlePolyPenMouseMove(event);
        return;
    }

    if (activeArchTool === "wall" && typeof handleWallPreview === "function") {
        handleWallPreview(event);
    } else if (activeArchTool === "rect-extrude" && typeof handleRectExPreview === "function") {
        handleRectExPreview(event);
    } else if (activeArchTool === "column" && typeof handleColumnPreview === "function") {
        handleColumnPreview(event);
    } else if (activeArchTool === "railing" && typeof handleRailingPreview === "function") {
        handleRailingPreview(event);
    } else if ((activeArchTool === "door" || activeArchTool === "window") && typeof handlePlaceObjectPreview === "function") {
        handlePlaceObjectPreview(event);
    } else if (activeArchTool === "measure" && typeof handleMeasurePreview === "function") {
        handleMeasurePreview(event);
    } else if (activeArchTool === "stairs" && typeof handleStairsMouseMove === "function") {
        handleStairsMouseMove(event);
    } else if (activeArchTool === "roof" && typeof handleRoofPreview === "function") {
        handleRoofPreview(event);
    } else if (activeArchTool === "room" && typeof handleRoomPreview === "function") {
        handleRoomPreview(event);
    } else if (activeArchTool === "curved-wall" && typeof handleCurvedWallPreview === "function") {
        handleCurvedWallPreview(event);
    } else if (activeArchTool === "terrain" && typeof handleTerrainPreview === "function") {
        handleTerrainPreview(event);
    }
}

function handleCanvasClick(event) {
    if (!window.isModelingMode) return;
    updateModelingRayFromEvent(event);

    if (isViewBoxSelectionMode) {
        performViewBoxSelection();
        return;
    }

    if (isLoopCutMode && typeof handleLoopCutConfirmInternal === "function") {
        handleLoopCutConfirmInternal(event);
        return;
    }

    if (window.polyPenToolActive && typeof handlePolyPenClick === "function") {
        handlePolyPenClick(event);
        return;
    }

    if (activeArchTool === "wall" && typeof handleWallCreationPoint === "function") {
        handleWallCreationPoint(event);
    } else if (activeArchTool === "rect-extrude" && typeof handleRectExClick === "function") {
        handleRectExClick(event);
    } else if (activeArchTool === "column" && typeof handleColumnClick === "function") {
        handleColumnClick(event);
    } else if (activeArchTool === "railing" && typeof handleRailingClick === "function") {
        handleRailingClick(event);
    } else if ((activeArchTool === "door" || activeArchTool === "window") && typeof handlePlaceObjectConfirm === "function") {
        handlePlaceObjectConfirm(event);
    } else if (activeArchTool === "measure" && typeof handleMeasurePoint === "function") {
        handleMeasurePoint(event);
    } else if (activeArchTool === "stairs" && typeof handleStairPlacement === "function") {
        handleStairPlacement(event);
    } else if (activeArchTool === "roof" && typeof handleRoofClick === "function") {
        handleRoofClick(event);
    } else if (activeArchTool === "room" && typeof handleRoomClick === "function") {
        handleRoomClick(event);
    } else if (activeArchTool === "curved-wall" && typeof handleCurvedWallClick === "function") {
        handleCurvedWallClick(event);
    } else if (activeArchTool === "terrain" && typeof handleTerrainClick === "function") {
        handleTerrainClick(event);
    } else if (typeof onModelingClick === "function") {
        onModelingClick(event);
    }
}

function onModelingClick(event) {
    if (!window.isModelingMode || !activeObject) return false;
    updateModelingRayFromEvent(event);

    if (typeof UnifiedModelingSystem !== "undefined" && UnifiedModelingSystem) {
        if (typeof UnifiedModelingSystem.onCanvasClick === "function") {
            UnifiedModelingSystem.onCanvasClick(event);
            return true;
        }
    }
    return false;
}

function handleCanvasRightClick(event) {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (!window.isModelingMode) return false;

    if (isLoopCutMode && typeof cancelLoopCut === "function") {
        cancelLoopCut();
        return false;
    }

    if (window.polyPenToolActive && typeof cleanupPolyPenTool === "function") {
        cleanupPolyPenTool();
        return false;
    }

    if (typeof finishSplineDrawing === "function" && typeof splineCreationMode !== "undefined" && splineCreationMode) {
        finishSplineDrawing();
        return false;
    }

    if (activeArchTool) {
        deactivateCurrentArchTool();
        return false;
    }

    if (typeof switchToPerspectiveFromOrtho === "function") {
        switchToPerspectiveFromOrtho();
    }

    return false;
}

function registerArchitecturalElement(element, type) {
    if (!element) return;
    element.userData = element.userData || {};
    element.userData.archType = type || element.userData.archType || "generic";
    if (!architecturalElements.includes(element)) {
        architecturalElements.push(element);
    }
    syncCoreGlobals();
}

function deselectAllArchElements() {
    selectedArchElements.forEach((obj) => {
        if (!obj) return;
        if (typeof clearSelectionHighlight === "function") {
            clearSelectionHighlight(obj);
        }
    });
    selectedArchElements.length = 0;
    syncCoreGlobals();
}

function selectAllArchElementsByType(type) {
    deselectAllArchElements();

    const wantedType = (type || "all").toLowerCase();
    architecturalElements.forEach((obj) => {
        if (!obj) return;
        const objType = (obj.userData?.archType || "").toLowerCase();
        const match = wantedType === "all" || objType === wantedType;
        if (!match) return;
        selectedArchElements.push(obj);
        if (typeof applySelectionHighlight === "function") {
            applySelectionHighlight(obj);
        }
    });

    syncCoreGlobals();
}

function deleteSelectedArchElements() {
    if (!selectedArchElements.length) return;

    const toDelete = selectedArchElements.slice();
    deselectAllArchElements();

    toDelete.forEach((obj) => {
        if (!obj) return;
        if (obj.parent) obj.parent.remove(obj);
        const idx = architecturalElements.indexOf(obj);
        if (idx !== -1) architecturalElements.splice(idx, 1);
    });

    syncCoreGlobals();
}

function toggleViewBoxSelection() {
    isViewBoxSelectionMode = !isViewBoxSelectionMode;
    const btn = document.getElementById("toggle-viewbox-selection");
    if (btn) btn.classList.toggle("active-tool", isViewBoxSelectionMode);
    syncCoreGlobals();
}

function performViewBoxSelection() {
    if (!window.isModelingMode || !activeObject || typeof THREE === "undefined") return;

    if (typeof UnifiedModelingSystem !== "undefined" && UnifiedModelingSystem) {
        if (typeof UnifiedModelingSystem.rebuildAllHelpers === "function") {
            UnifiedModelingSystem.rebuildAllHelpers();
        }
    }
}

window.toggleModelingMode = toggleModelingMode;
window.toggleArchTool = toggleArchTool;
window.deactivateCurrentArchTool = deactivateCurrentArchTool;
window.handleCanvasClick = handleCanvasClick;
window.handleCanvasMouseMove = handleCanvasMouseMove;
window.handleCanvasRightClick = handleCanvasRightClick;
window.onModelingClick = onModelingClick;
window.registerArchitecturalElement = registerArchitecturalElement;
window.deselectAllArchElements = deselectAllArchElements;
window.selectAllArchElementsByType = selectAllArchElementsByType;
window.deleteSelectedArchElements = deleteSelectedArchElements;
window.toggleViewBoxSelection = toggleViewBoxSelection;
window.performViewBoxSelection = performViewBoxSelection;

syncCoreGlobals();
