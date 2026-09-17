/**
 * modeling-system-init.js
 * ─────────────────────────────────────────────────────────────────
 * Initializes Unified Modeling System and binds UI components 
 * cleanly into the Inspector panel.
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
    "use strict";

    function initModelingSystemUI() {
        console.log("[ModelingSystemInit] Initializing modeling tools binding...");

        // Enforce hiding outer floating `#modelingTools` overlay
        const standaloneOverlays = document.querySelectorAll('body > #modelingTools');
        standaloneOverlays.forEach(overlay => {
            overlay.style.setProperty('display', 'none', 'important');
            overlay.style.setProperty('visibility', 'hidden', 'important');
        });

        // Helper to update status inside Inspector Modeling panel
        window.updateModelingStatus = function (msg) {
            const statusEl = document.getElementById('modeling-status') || document.getElementById('adv-status');
            if (statusEl) {
                statusEl.textContent = msg;
            }
        };

        if (window.AdvancedModelingTools) {
            window.AdvancedModelingTools.init?.();
        }

        console.log("[ModelingSystemInit] Unified Modeling System ready.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initModelingSystemUI, { once: true });
    } else {
        initModelingSystemUI();
    }
})();