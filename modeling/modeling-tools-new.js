/**
 * MODELING ENGINE - BRIDGE TO UNIFIED SYSTEM
 * 
 * This file serves as a compatibility layer between nanite-ex.js and the new
 * UnifiedModelingSystem. All methods delegate to UnifiedModelingSystem.
 * 
 * DO NOT add new logic here - use UnifiedModelingSystem instead.
 */

const ModelingEngine = {
    // ====================================================================
    // PUBLIC API - Wrappers for nanite-ex.js compatibility
    // ====================================================================

    /**
     * Handle canvas click for selection
     * Called from nanite-ex.js: onModelingClick()
     */
    onCanvasClick: function(event) {
        if (!UnifiedModelingSystem) {
            console.warn("⚠ UnifiedModelingSystem not loaded yet");
            return;
        }
        return UnifiedModelingSystem.onCanvasClick(event);
    },

    /**
     * Handle mouse hover for visual feedback
     * Called from nanite-ex.js: processModelingMouseMove()
     */
    onHover: function() {
        if (!UnifiedModelingSystem) return;

        // Check if mouse is over any helper
        const intersection = UnifiedModelingSystem.raycastHelpers();
        
        if (intersection) {
            const selectionData = UnifiedModelingSystem.extractSelectionData(intersection);
            if (selectionData) {
                UnifiedModelingSystem.updateSelectionVisuals(selectionData, false, true);
            }
        }
    },

    /**
     * Clear all selections
     * Called from various places
     */
    clearSelection: function() {
        if (!UnifiedModelingSystem) return;
        return UnifiedModelingSystem.clearSelection();
    },

    /**
     * Sync gizmo to selection
     * Called after selection changes
     */
    syncGizmo: function() {
        if (!UnifiedModelingSystem) return;
        return UnifiedModelingSystem.syncTransformPivot();
    },

    /**
     * Rebuild helpers for current selection mode
     * Called when entering modeling mode or changing mode
     */
    rebuildHelpers: function() {
        if (!UnifiedModelingSystem) return;
        return UnifiedModelingSystem.rebuildAllHelpers();
    },

    /**
     * Clear all helpers from scene
     */
    clearHelpers: function() {
        if (!UnifiedModelingSystem) return;
        return UnifiedModelingSystem.clearAllHelpers();
    },

    /**
     * Legacy initialization - no longer needed but kept for compatibility
     */
    init: function() {
        console.log("✓ ModelingEngine bridge initialized (delegating to UnifiedModelingSystem)");
    }
};

// Ensure UnifiedModelingSystem initializes before we try to use it
if (typeof UnifiedModelingSystem !== 'undefined') {
    console.log("✓ ModelingEngine bridge loaded (delegating to UnifiedModelingSystem)");
} else {
    console.warn("⚠ UnifiedModelingSystem not found - ensure unified-modeling-system.js loads first");
}