(function () {
    'use strict';
    const H = window.SMHistory = window.SMHistory || {};

    function initSMHistoryEngine() {
        if (window.historyManager instanceof H.HistoryManager) {
            return window.historyManager;
        }

        const scene = window.scene || null;
        const transformControls = window.transformControls || null;
        const controls = window.controls || null;

        const manager = new H.HistoryManager(scene, transformControls, controls);
        window.historyManager = manager;
        return manager;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSMHistoryEngine);
    } else {
        initSMHistoryEngine();
    }

    H.init = initSMHistoryEngine;
})();