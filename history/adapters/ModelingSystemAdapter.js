(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    class ModelingSystemAdapter {
        constructor(historyManager) {
            this.historyManager = historyManager;
            this.init();
        }

        init() {
            // Listen for mesh edit events dispatched by UnifiedModelingSystem
            window.addEventListener('modeling:mesh-changed', (event) => {
                if (this.historyManager && this.historyManager.isExecuting) return;

                const detail = event.detail || {};
                const object = detail.object || window.UnifiedModelingSystem?.activeMesh;
                if (!object) return;

                const beforeGeo = detail.beforeGeometry || detail.before;
                const afterGeo = detail.afterGeometry || detail.after || object.geometry;
                const name = detail.name || 'Mesh Edit';

                if (beforeGeo && H.GeometryCommand) {
                    this.historyManager.recordCommand(new H.GeometryCommand(object, beforeGeo, afterGeo, name));
                }
            });

            // Listen for history undos/redos to trigger viewport helper rebuilds
            window.addEventListener('historyChanged', (event) => {
                const action = event.detail?.action;
                if (!action) return;

                if (action.type === 'geometry' || action.type === 'modeling') {
                    this.refreshModelingHelpers(action.object);
                }
            });
        }

        refreshModelingHelpers(object) {
            try {
                const sys = window.UnifiedModelingSystem;
                if (!sys || !sys.isEditMode) return;
                if (object && sys.activeMesh && sys.activeMesh !== object) return;

                if (typeof sys.refreshEditableMeshFromLiveGeometry === 'function') {
                    sys.refreshEditableMeshFromLiveGeometry();
                } else if (typeof sys.rebuildAllHelpers === 'function') {
                    sys.rebuildAllHelpers();
                }
            } catch (e) {
                console.warn('[ModelingSystemAdapter] Failed to refresh modeling helpers:', e);
            }
        }
    }

    H.ModelingSystemAdapter = ModelingSystemAdapter;
})();