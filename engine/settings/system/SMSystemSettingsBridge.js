// engine/settings/system/SMSystemSettingsBridge.js
// MUST load after SMSystemSettingsManager.js and BEFORE settings-engine.js.
(function () {
    'use strict';
    const store = window.EngineSettingsStore; if (!store) { console.error('[SMSystemSettingsBridge] EngineSettingsStore missing.'); return; }
    const DEFINITIONS = [
        ['setting-system-runtime-backend', 'string', 'auto', 'runtimeBackend'], ['setting-system-background-workers', 'boolean', true, 'backgroundWorkers'], ['setting-system-worker-count', 'string', 'auto', 'workerCount'], ['setting-system-pause-hidden', 'boolean', true, 'pauseHeavyTasksHidden'], ['setting-system-use-idle-callback', 'boolean', true, 'useIdleCallback'],
        ['setting-system-frame-budget', 'number', 8, 'frameBudgetMs'], ['setting-system-background-budget', 'number', 4, 'backgroundBudgetMs'], ['setting-system-max-tasks-frame', 'number', 12, 'maxTasksPerFrame'], ['setting-system-task-priority', 'string', 'balanced', 'taskPriority'],
        ['setting-system-texture-budget', 'number', 1024, 'textureBudgetMB'], ['setting-system-geometry-budget', 'number', 768, 'geometryBudgetMB'], ['setting-system-cache-budget', 'number', 512, 'cacheBudgetMB'], ['setting-system-auto-resource-cleanup', 'boolean', true, 'autoResourceCleanup'], ['setting-system-resource-timeout', 'number', 120, 'unusedAssetTimeoutSec'], ['setting-system-gpu-dispose-delay', 'number', 3, 'gpuDisposeDelayFrames'],
        ['setting-system-shader-strategy', 'string', 'background', 'shaderStrategy'], ['setting-system-shader-warmup-budget', 'number', 3, 'shaderWarmupBudgetMs'], ['setting-system-precompile-visible', 'boolean', true, 'precompileVisibleMaterials'], ['setting-system-shader-cache', 'boolean', true, 'shaderCache'],
        ['setting-system-cache-policy', 'string', 'balanced', 'cachePolicy'], ['setting-system-clean-stale-cache', 'boolean', true, 'cleanStaleCache'],
        ['setting-system-context-recovery', 'boolean', true, 'contextRecovery'], ['setting-system-crash-snapshot', 'string', '60', 'crashSnapshot'], ['setting-system-recovery-snapshots', 'number', 5, 'recoverySnapshots'], ['setting-system-safe-mode-after-crash', 'boolean', true, 'safeModeAfterCrash'],
        ['setting-system-diagnostics-level', 'string', 'standard', 'diagnosticsLevel'], ['setting-system-diagnostics-sampling', 'number', 1000, 'diagnosticsSamplingMs'], ['setting-system-track-long-tasks', 'boolean', true, 'trackLongTasks'], ['setting-system-track-asset-failures', 'boolean', true, 'trackAssetFailures'], ['setting-system-track-context-loss', 'boolean', true, 'trackContextLoss']
    ].map(([settingId, type, defaultValue, key]) => ({ settingId, type, default: defaultValue, key }));
    const define = (id, type, defaultValue) => { if (typeof store.has === 'function' && store.has(id)) return; store.define(id, { type, group: 'system', default: defaultValue }); };
    for (const def of DEFINITIONS) { define(def.settingId, def.type, def.default); store.registerApplier(def.settingId, value => window.SMSystemSettingsManager?.set?.(def.key, value)); }
    const sync = () => { const manager = window.SMSystemSettingsManager; if (!manager) return false; const values = {}; for (const def of DEFINITIONS) { const value = store.get(def.settingId); if (value !== undefined) values[def.key] = value; } manager.setMany(values, { emit: false }); return true; };
    sync(); window.addEventListener('sm:system-settings-ready', sync); window.addEventListener('sm:engine-settings-restored', sync);
    window.SMSystemSettingsBridge = { definitions: DEFINITIONS, sync, debug() { console.table(DEFINITIONS.map(def => ({ Setting: def.settingId, Value: store.get(def.settingId), RuntimeKey: def.key }))); } }; window.smSystemSettingsBridge = window.SMSystemSettingsBridge;
})();