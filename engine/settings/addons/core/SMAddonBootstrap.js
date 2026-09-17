(function () {
    'use strict';
    let started = false;
    const boot = () => { if (started) return; const m = window.SMAddonManager; if (!m || !window.SMAddonRegistry) return; if (!window.initCompleted || !window.renderer) { setTimeout(boot, 200); return; } started = true; m.init(); window.SMAddonSettingsUI?.mountWhenReady?.(); window.dispatchEvent(new CustomEvent('sm:addons-ready', { detail: { manager: m, registry: window.SMAddonRegistry } })); console.info(`[SMAddons] Ready with ${m.list().length} registered add-on(s).`); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();