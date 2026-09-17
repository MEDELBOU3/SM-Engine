(function (global) {
    'use strict';

    class SMLightingManager {
        constructor(options = {}) {
            this.scene = options.scene || global.scene || null;
            this.renderer = options.renderer || global.renderer || null;

            this.lights = new Map();
            this.controllers = new Map();

            this.culling = new global.SMLightCulling(
                options.culling || {}
            );

            this.enabled = true;
            this.initialized = false;
        }

        initialize() {
            if (this.initialized) return this;

            const nativeInit = global.SculptWASM?.init?.();
            nativeInit?.catch?.(() => {});
            this.scanScene();
            this.initialized = true;

            return this;
        }

        scanScene() {
            this.lights.clear();
            this.controllers.clear();

            this.scene?.traverse?.(object => {
                if (!object?.isLight) return;

                this.lights.set(object.uuid, object);

                if (object.isDirectionalLight) {
                    this.controllers.set(
                        object.uuid,
                        new global.SMDirectionalLighting(object, {
                            scene: this.scene
                        })
                    );
                } else if (object.isPointLight) {
                    this.controllers.set(
                        object.uuid,
                        new global.SMPointLighting(object)
                    );
                } else if (object.isSpotLight) {
                    this.controllers.set(
                        object.uuid,
                        new global.SMSpotLighting(object, {
                            scene: this.scene
                        })
                    );
                }
            });

            return this.lights.size;
        }

        register(light) {
            if (!light?.isLight) return null;

            this.lights.set(light.uuid, light);

            if (light.isDirectionalLight) {
                this.controllers.set(
                    light.uuid,
                    new global.SMDirectionalLighting(light, {
                        scene: this.scene
                    })
                );
            } else if (light.isPointLight) {
                this.controllers.set(light.uuid, new global.SMPointLighting(light));
            } else if (light.isSpotLight) {
                this.controllers.set(
                    light.uuid,
                    new global.SMSpotLighting(light, {
                        scene: this.scene
                    })
                );
            }

            return light;
        }

        unregister(lightOrUuid) {
            const uuid =
                typeof lightOrUuid === 'string'
                    ? lightOrUuid
                    : lightOrUuid?.uuid;

            if (!uuid) return false;

            this.controllers.delete(uuid);
            return this.lights.delete(uuid);
        }

        getController(lightOrUuid) {
            const uuid =
                typeof lightOrUuid === 'string'
                    ? lightOrUuid
                    : lightOrUuid?.uuid;

            return this.controllers.get(uuid) || null;
        }

        update(camera) {
            if (!this.enabled || !camera) return;

            this.culling.update(this.scene, camera);
        }

        diagnostics() {
            const counts = {
                directional: 0,
                point: 0,
                spot: 0,
                hemisphere: 0,
                ambient: 0,
                other: 0
            };

            for (const light of this.lights.values()) {
                if (light.isDirectionalLight) counts.directional++;
                else if (light.isPointLight) counts.point++;
                else if (light.isSpotLight) counts.spot++;
                else if (light.isHemisphereLight) counts.hemisphere++;
                else if (light.isAmbientLight) counts.ambient++;
                else counts.other++;
            }

            const report = {
                initialized: this.initialized,
                enabled: this.enabled,
                total: this.lights.size,
                counts
            };

            console.log('[SMLightingManager][Diagnostics]', report);
            return report;
        }

        dispose() {
            this.culling.restore(this.scene);
            this.lights.clear();
            this.controllers.clear();
            this.initialized = false;
        }
    }

    function initSMLightingManager(options = {}) {
        if (global.smLightingManager instanceof SMLightingManager) {
            return global.smLightingManager;
        }

        global.smLightingManager = new SMLightingManager({
            scene: options.scene || global.scene,
            renderer: options.renderer || global.renderer,
            culling: options.culling
        });

        return global.smLightingManager.initialize();
    }

    global.SMLightingManager = SMLightingManager;
    global.initSMLightingManager = initSMLightingManager;
})(window);
