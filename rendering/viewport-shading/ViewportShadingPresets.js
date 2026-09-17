/**
 * Viewport shading contracts shared by the editor viewport.
 *
 * These definitions deliberately keep the Blender-style modes distinct:
 * - Solid: neutral clay material and studio lights.
 * - Material Preview: authored materials, texture maps, shadows and HDRI.
 * - Rendered: the authored scene plus the SM post-processing pipeline.
 */
(function registerViewportShadingPresets() {
    'use strict';

    const MODES = Object.freeze({
        WIREFRAME: 'wireframe',
        SOLID: 'solid',
        MATERIAL_PREVIEW: 'lookdev',
        RENDERED: 'rendered'
    });

    const validModes = new Set(Object.values(MODES));

    function getWorkspaceMode() {
        return String(
            window.workspaceManager?.currentMode ||
            window.SMWorkspaceManager?.currentMode ||
            'FILM'
        ).toUpperCase();
    }

    const modelingHelperNames = new Set([
        'VertexHelpers',
        'EdgeHelpers',
        'FaceHelpers',
        'SoftFaceHelpers',
        'ModelingPreviewHelpers',
        'ModelingPivot'
    ]);

    function isEditorObject(object) {
        // Modeling helpers contain invisible mesh hit-proxies (cylinders used
        // for edge picking). Checking only the child itself lets Solid replace
        // the proxy's `colorWrite: false` material and makes it appear as a
        // thick bevel around the model. Treat helper descendants as editor
        // objects too, so every viewport mode keeps the same topology overlay.
        let current = object;
        while (current) {
            const data = current.userData || {};
            if (
                data.isSystemObject ||
                data.isEditorHelper ||
                data.isTransformControlsChild ||
                data.isGuideHandle ||
                data.ignoreInHierarchy ||
                data.isHitProxy ||
                data.isVisualEdge ||
                data.type === 'vertex' ||
                data.type === 'edge' ||
                data.type === 'face' ||
                data.type === 'vertexInstanced' ||
                current.isHelper ||
                current.isLine ||
                current.isPoints ||
                modelingHelperNames.has(current.name)
            ) {
                return true;
            }
            current = current.parent || null;
        }
        return false;
    }

    function getNeutralWorldColor(workspaceMode = getWorkspaceMode()) {
        return workspaceMode === 'FILM' ? 0x252a31 : 0x20242a;
    }

    window.SMViewportShadingPresets = Object.freeze({
        MODES,
        validModes,
        getWorkspaceMode,
        isEditorObject,
        getNeutralWorldColor
    });
})();
