(function () {
    'use strict';
    window.SMHistory = window.SMHistory || {};

    class HistoryEvents {
        static dispatch(eventName, detail = null) {
            window.dispatchEvent(new CustomEvent(eventName, { detail }));
        }

        static notifyStateChange(action, mode = 'execute') {
            this.dispatch('historyChanged', { action, mode });
            this.dispatch('sceneChanged');

            if (typeof window.updateHierarchy === 'function') window.updateHierarchy();
            if (typeof window.updateInspector === 'function') window.updateInspector();
            if (window.renderer && window.scene && window.camera) {
                window.renderer.render(window.scene, window.camera);
            }
        }
    }

    window.SMHistory.HistoryEvents = HistoryEvents;
})();