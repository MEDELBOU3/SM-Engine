(function (global) {
    'use strict';

    class SMEnvironmentRenderer {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;

            this.sky = new global.SMSkyRenderer({
                scene: this.scene,
                ...(options.sky || {})
            });

            this.fog = new global.SMFogRenderer(
                this.scene
            );

            this.hdri = new global.SMHDRIManager({
                renderer: this.renderer,
                scene: this.scene
            });

            this.reflectionProbes = new Set();

            this.mode = 'scene';
            this.initialized = false;
        }

        initialize() {
            if (this.initialized) return this;

            this.hdri.initialize();
            this.initialized = true;

            return this;
        }

        setMode(mode) {
            this.mode = mode;

            if (mode === 'sky') {
                this.sky.setVisible(true);
            } else if (mode === 'hdri') {
                this.sky.setVisible(false);
            } else if (mode === 'scene') {
                this.sky.setVisible(false);
            }

            return this;
        }

        async loadHDRI(url, options = {}) {
            this.initialize();
            const result = await this.hdri.load(
                url,
                options
            );

            if (result) {
                this.setMode('hdri');
            }

            return result;
        }

        enableProceduralSky(options = {}) {
            this.sky.applySettings(options);
            this.sky.setVisible(true);
            this.setMode('sky');

            return this.sky;
        }

        setFog(options = {}) {
            if (options.enabled === false) {
                this.fog.disable();
                return null;
            }

            if (options.type === 'exp2') {
                return this.fog.setExp2(options);
            }

            return this.fog.setLinear(options);
        }

        createReflectionProbe(options = {}) {
            const probe = new global.SMReflectionProbe({
                renderer: this.renderer,
                scene: this.scene,
                ...options
            });

            probe.initialize();
            this.reflectionProbes.add(probe);

            return probe;
        }

        updateReflectionProbes() {
            for (const probe of this.reflectionProbes) {
                probe.update();
            }
        }

        diagnostics() {
            const report = {
                initialized: this.initialized,
                mode: this.mode,
                proceduralSky: !!this.sky.sky,
                hdri: !!this.hdri.current,
                environment: !!this.scene?.environment,
                background: !!this.scene?.background,
                fog: this.scene?.fog?.type || null,
                reflectionProbes: this.reflectionProbes.size
            };

            console.log(
                '[SMEnvironmentRenderer][Diagnostics]',
                report
            );

            return report;
        }

        dispose() {
            this.sky.dispose();
            this.hdri.dispose();

            for (const probe of this.reflectionProbes) {
                probe.dispose();
            }

            this.reflectionProbes.clear();
            this.initialized = false;
        }
    }

    function initSMEnvironmentRenderer(options = {}) {
        if (
            global.smEnvironmentRenderer instanceof
            SMEnvironmentRenderer
        ) {
            return global.smEnvironmentRenderer;
        }

        global.smEnvironmentRenderer =
            new SMEnvironmentRenderer({
                renderer:
                    options.renderer ||
                    global.renderer,

                scene:
                    options.scene ||
                    global.scene,

                sky:
                    options.sky
            });

        return global.smEnvironmentRenderer.initialize();
    }

    global.SMEnvironmentRenderer =
        SMEnvironmentRenderer;

    global.initSMEnvironmentRenderer =
        initSMEnvironmentRenderer;
})(window);
