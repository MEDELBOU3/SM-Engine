// ============================================================================
// engine/settings/addons/SMAddonEngineBridge.js
//
// SM Engine — EngineSettings <-> Add-on Manager Bridge
//
// PURPOSE
// -------
// Extends the existing public EngineSettings facade with Add-on APIs:
//
//     EngineSettings.addons
//     EngineSettings.listAddons()
//     EngineSettings.getAddon(id)
//     EngineSettings.enableAddon(id)
//     EngineSettings.disableAddon(id)
//     EngineSettings.restartAddon(id)
//     EngineSettings.isAddonEnabled(id)
//     EngineSettings.getAddonStatus(id)
//     EngineSettings.runAddonCommand(id, commandId)
//     EngineSettings.getAddonPreference(id, key, fallback)
//     EngineSettings.setAddonPreference(id, key, value)
//     EngineSettings.getAddonPreferences(id)
//     EngineSettings.enableDefaultAddons()
//     EngineSettings.disableAllAddons()
//
// IMPORTANT LOAD ORDER
// --------------------
// settings-engine.js
// SMAddonEngineBridge.js          <-- THIS FILE
// builtins/*.js
// SMAddonSettingsUI.js
// SMAddonBootstrap.js
// ============================================================================

(function () {
  "use strict";

  let attachedSettings = null;

  let attachedManager = null;

  const attach = () => {
    const settings = window.EngineSettings;

    const manager = window.SMAddonManager;

    if (!settings || !manager) {
      return false;
    }

    /*
     * Avoid unnecessary work when already attached to the same
     * facade/manager instances.
     */
    if (attachedSettings === settings && attachedManager === manager) {
      return true;
    }

    attachedSettings = settings;

    attachedManager = manager;

    // ----------------------------------------------------------------
    // Direct manager access
    // ----------------------------------------------------------------

    settings.addons = manager;

    // ----------------------------------------------------------------
    // Query
    // ----------------------------------------------------------------

    settings.listAddons = () => manager.list?.() || [];

    settings.getAddon = (id) => manager.describe?.(id) || null;

    settings.isAddonEnabled = (id) => Boolean(manager.isEnabled?.(id));

    settings.getAddonStatus = (id) =>
      manager.getStatus?.(id) || {
        state: "unknown",

        error: null,
      };

    // ----------------------------------------------------------------
    // Lifecycle
    // ----------------------------------------------------------------

    settings.enableAddon = (id, options) => manager.enable?.(id, options);

    settings.disableAddon = (id, options) => manager.disable?.(id, options);

    settings.restartAddon = (id) => manager.restart?.(id);

    settings.enableDefaultAddons = () => manager.enableDefaults?.();

    settings.enableConfiguredAddons = () => manager.enableConfigured?.();

    settings.disableAllAddons = (options) => manager.disableAll?.(options);

    // ----------------------------------------------------------------
    // Commands
    // ----------------------------------------------------------------

    settings.runAddonCommand = (id, commandId) =>
      manager.runCommand?.(id, commandId);

    // ----------------------------------------------------------------
    // Preferences
    // ----------------------------------------------------------------

    settings.getAddonPreference = (id, key, fallback = null) =>
      manager.getPreference?.(id, key, fallback);

    settings.getAddonPreferences = (id) => manager.getPreferences?.(id) || {};

    settings.setAddonPreference = (id, key, value) =>
      manager.setPreference?.(id, key, value);

    // ----------------------------------------------------------------
    // Policy
    // ----------------------------------------------------------------

    settings.getAddonPolicy = () => ({
      ...manager.policy,
    });

    settings.setAddonPolicy = (key, value) => {
      /*
       * Prefer routing known global policy values through
       * EngineSettings.set() so persistence + UI notification
       * remain centralized.
       */
      const map = {
        masterEnabled: "setting-addons-master-enabled",

        safeMode: "setting-addons-safe-mode",

        autoStart: "setting-addons-auto-start",

        allowExperimental: "setting-addons-allow-experimental",

        logLevel: "setting-addons-log-level",
      };

      const settingId = map[key];

      if (settingId && typeof settings.set === "function") {
        return settings.set(settingId, value);
      }

      return manager.setPolicy?.(key, value);
    };

    // ----------------------------------------------------------------
    // Debug
    // ----------------------------------------------------------------

    settings.debugAddons = () => manager.debug?.();

    window.dispatchEvent(
      new CustomEvent("sm:addon-engine-bridge-ready", {
        detail: {
          settings,
          manager,
        },
      }),
    );

    console.info("[SMAddonEngineBridge] EngineSettings Add-on API attached.");

    return true;
  };

  // ------------------------------------------------------------------------
  // Initial attach
  // ------------------------------------------------------------------------

  if (!attach()) {
    /*
     * settings-engine.js and core manager are classic scripts, but this
     * listener/retry layer keeps the bridge robust during future refactors.
     */
    window.addEventListener("sm:addon-manager-ready", attach);

    window.addEventListener("sm:addons-ready", attach);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach, {
        once: true,
      });
    }

    setTimeout(attach, 0);
  }

  // ------------------------------------------------------------------------
  // Public bridge helper
  // ------------------------------------------------------------------------

  window.SMAddonEngineBridge = {
    attach,

    isAttached() {
      return (
        attachedSettings === window.EngineSettings &&
        attachedManager === window.SMAddonManager
      );
    },

    debug() {
      console.table({
        Attached: this.isAttached(),

        EngineSettings: !!window.EngineSettings,

        AddonManager: !!window.SMAddonManager,

        Registered: window.SMAddonRegistry?.list?.()?.length || 0,

        Running: window.SMAddonManager?.instances?.size || 0,
      });
    },
  };

  window.smAddonEngineBridge = window.SMAddonEngineBridge;
})();
