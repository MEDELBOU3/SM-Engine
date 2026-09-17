(function () {
    'use strict';

    let attachedSettings = null;
    let attachedManager = null;

    function attach() {
        const settings = window.EngineSettings;
        const manager = window.SMPluginManager;
        if (!settings || !manager) return false;
        if (settings === attachedSettings && manager === attachedManager) return true;
        attachedSettings = settings;
        attachedManager = manager;
        settings.plugins = manager;
        settings.listPlugins = () => manager.list();
        settings.getPlugin = (id) => manager.describe(id);
        settings.enablePlugin = (id, options) => manager.enable(id, options);
        settings.disablePlugin = (id, options) => manager.disable(id, options);
        settings.restartPlugin = (id) => manager.restart(id);
        settings.isPluginEnabled = (id) => manager.isEnabled(id);
        settings.getPluginStatus = (id) => manager.getStatus(id);
        settings.runPluginCommand = (pluginId, commandId, ...args) => manager.runCommand(pluginId, commandId, ...args);
        settings.getPluginSetting = (pluginId, key, fallback) => manager.getSetting(pluginId, key, fallback);
        settings.setPluginSetting = (pluginId, key, value) => manager.setSetting(pluginId, key, value);
        settings.getPluginSettings = (pluginId) => manager.getSettings(pluginId);
        settings.getPluginPolicy = () => ({ ...manager.policy });
        settings.setPluginPolicy = (key, value) => manager.setPolicy(key, value);
        settings.loadPluginCatalog = (url) => window.SMPluginLoader.loadCatalog(url);
        settings.openPlugins = () => window.openPluginsPanel?.();
        settings.debugPlugins = () => manager.debug();
        window.dispatchEvent(new CustomEvent('sm:plugin-engine-bridge-ready', { detail: { settings, manager } }));
        return true;
    }

    if (!attach()) {
        window.addEventListener('sm:plugin-manager-ready', attach);
        window.addEventListener('sm:plugins-ready', attach);
        window.setTimeout(attach, 0);
    }

    window.SMPluginEngineBridge = {
        attach,
        isAttached: () => attachedSettings === window.EngineSettings && attachedManager === window.SMPluginManager
    };
})();
