(function (global) {
    'use strict';

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const DEFAULTS = Object.freeze({
        enabled: true,
        autoExposure: true,
        manualExposure: 1,
        compensation: 0,
        minExposure: 0.32,
        maxExposure: 3.2,
        middleGray: 0.2,
        speedDarkToLight: 3.5,
        speedLightToDark: 1.15,
        meteringInterval: 0.1,
        centerWeight: 0.78,
        aces: true,
        localExposure: 0.1,
        debug: false
    });

    class SMExposureSystem {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;
            this.settings = { ...DEFAULTS, ...options };
            this.analyzer = new global.SMLuminanceAnalyzer(this.renderer, {
                interval: this.settings.meteringInterval,
                centerWeight: this.settings.centerWeight
            });
            this.eye = new global.SMEyeAdaptation({
                initialExposure: this.renderer?.toneMappingExposure || 1,
                speedDarkToLight: this.settings.speedDarkToLight,
                speedLightToDark: this.settings.speedLightToDark
            });
            this.volumes = new global.SMExposureVolumeManager();
            this.targetExposure = this.eye.current;
            this.activeSettings = { ...this.settings };
            this.activeVolumes = [];
            this.activeCamera = null;
            this.initialized = false;
            this.stats = { frames: 0, lastUpdateMs: 0 };
        }

        initialize() {
            if (!this.renderer) throw new Error('[SMExposure] renderer is required.');
            /* Warm the optional native meter without delaying first paint. */
            const nativeInit = global.SculptWASM?.init?.();
            nativeInit?.catch?.(() => {});
            if (this.settings.aces && THREE.ACESFilmicToneMapping !== undefined) {
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            }
            this.eye.reset(clamp(
                this.renderer.toneMappingExposure || 1,
                this.settings.minExposure,
                this.settings.maxExposure
            ));
            this.initialized = true;
            return this;
        }

        setSettings(values = {}, persist = false) {
            Object.assign(this.settings, values);
            if (this.settings.minExposure > this.settings.maxExposure) {
                const min = this.settings.maxExposure;
                this.settings.maxExposure = this.settings.minExposure;
                this.settings.minExposure = min;
            }
            this.analyzer.setOptions({
                interval: this.settings.meteringInterval,
                centerWeight: this.settings.centerWeight
            });
            if (persist) {
                try { localStorage.setItem('sm_exposure_settings', JSON.stringify(this.settings)); } catch { }
            }
            return this;
        }

        loadSettings() {
            try {
                const saved = JSON.parse(localStorage.getItem('sm_exposure_settings') || 'null');
                if (saved) this.setSettings(saved, false);
            } catch { }
            return this;
        }

        _calculateTarget(luminance, settings) {
            if (!settings.autoExposure) {
                return clamp(settings.manualExposure, settings.minExposure, settings.maxExposure);
            }
            const sceneLum = clamp(Number(luminance) || settings.middleGray, 0.0001, 16);
            const compensatedKey = settings.middleGray * Math.pow(2, settings.compensation || 0);
            return clamp(compensatedKey / sceneLum, settings.minExposure, settings.maxExposure);
        }

        update(delta, camera) {
            if (!this.initialized) this.initialize();
            const started = performance.now();
            this.activeCamera = camera || this.activeCamera || global.camera;
            this.analyzer.tick(delta);
            const resolved = this.volumes.resolve(this.activeCamera, this.settings);
            this.activeSettings = resolved.settings;
            this.activeVolumes = resolved.activeVolumes;

            if (!this.activeSettings.enabled) return this.eye.current;
            this.targetExposure = this._calculateTarget(
                this.analyzer.last.luminance,
                this.activeSettings
            );
            const exposure = this.eye.update(delta, this.targetExposure, this.activeSettings);
            if (this.activeSettings.aces && THREE.ACESFilmicToneMapping !== undefined) {
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            }
            this.renderer.toneMappingExposure = exposure;
            this.stats.frames++;
            this.stats.lastUpdateMs = performance.now() - started;
            return exposure;
        }

        capture(scene, camera) {
            if (!this.activeSettings.enabled || !this.activeSettings.autoExposure) return this.analyzer.last;
            return this.analyzer.capture(scene || this.scene || global.scene, camera || this.activeCamera);
        }

        addVolume(options) { return this.volumes.add(options); }
        removeVolume(volumeOrId) { return this.volumes.remove(volumeOrId); }

        diagnostics(log = true) {
            const report = {
                initialized: this.initialized,
                enabled: !!this.activeSettings.enabled,
                autoExposure: !!this.activeSettings.autoExposure,
                aces: this.renderer?.toneMapping === THREE.ACESFilmicToneMapping,
                currentExposure: this.eye.current,
                targetExposure: this.targetExposure,
                luminance: { ...this.analyzer.last },
                settings: { ...this.activeSettings },
                activeVolumes: [...this.activeVolumes],
                meter: { ...this.analyzer.stats },
                stats: { ...this.stats }
            };
            if (log) console.table({
                luminance: report.luminance.luminance,
                center: report.luminance.centerLuminance,
                currentExposure: report.currentExposure,
                targetExposure: report.targetExposure,
                meterMs: report.meter.lastCaptureMs,
                captures: report.meter.captures
            });
            return report;
        }

        dispose() {
            this.analyzer.dispose();
            this.initialized = false;
        }
    }

    function initSMExposureSystem(options = {}) {
        if (global.smExposureSystem instanceof SMExposureSystem) return global.smExposureSystem;
        global.smExposureSystem = new SMExposureSystem({
            renderer: options.renderer || global.renderer,
            scene: options.scene || global.scene,
            ...options
        });
        global.smExposureSystem.loadSettings().initialize();
        return global.smExposureSystem;
    }

    global.SMExposureSystem = SMExposureSystem;
    global.initSMExposureSystem = initSMExposureSystem;
    global.smExposureDiagnostics = () => global.smExposureSystem?.diagnostics(true) || null;
    global.smExposureAddVolume = options => global.smExposureSystem?.addVolume(options) || null;
    global.smExposureRemoveVolume = volumeOrId => global.smExposureSystem?.removeVolume(volumeOrId) || false;
    global.smExposureDebug = (enabled = true) => {
        global.initSMRenderDebugger?.({
            renderer: global.renderer,
            scene: global.scene,
            smRenderer: global.smRenderer
        })?.setEnabled?.(!!enabled);
        global.smExposureSystem?.setSettings?.({ debug: !!enabled }, false);
        return !!enabled;
    };
})(window);
