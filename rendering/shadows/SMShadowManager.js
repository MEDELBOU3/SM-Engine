(function (global) {
    'use strict';

    class SMShadowManager {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;

            this.directionalShadows = new Map();

            this.atlas = new global.SMShadowAtlas(
                options.atlas || {}
            );

            this.contactShadows = new global.SMContactShadows({
                scene: this.scene,
                ...(options.contactShadows || {})
            });

            this.quality = options.quality || 'high';
            this.enabled = true;
            this.initialized = false;
        }

        initialize() {
            if (this.initialized) return this;

            if (this.renderer?.shadowMap) {
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.autoUpdate = true;

                if (THREE.PCFSoftShadowMap !== undefined) {
                    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                }
            }

            this.prepareMeshes();
            this.scanLights();

            this.initialized = true;

            return this;
        }

        prepareMeshes() {
            this.scene?.traverse?.(object => {
                if (!object?.isMesh) return;

                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];

                const canCast = materials.some(material =>
                    material &&
                    (
                        !material.transparent ||
                        (material.alphaTest || 0) > 0
                    )
                );

                if (object.userData.castShadow === undefined) {
                    object.castShadow = canCast;
                }

                if (object.userData.receiveShadow === undefined) {
                    object.receiveShadow = true;
                }
            });
        }

        scanLights() {
            this.directionalShadows.clear();

            this.scene?.traverse?.(object => {
                if (!object?.isDirectionalLight) return;

                this.directionalShadows.set(
                    object.uuid,
                    new global.SMDirectionalShadow(object)
                );
            });

            return this.directionalShadows.size;
        }

        applyQuality(preset) {
            this.quality = preset;

            const mapSize = {
                low: 512,
                medium: 1024,
                high: 2048,
                ultra: 4096
            }[preset] || 2048;

            for (const shadow of this.directionalShadows.values()) {
                shadow.settings.mapSize = mapSize;
                shadow.configure();
            }

            if (this.renderer?.shadowMap) {
                this.renderer.shadowMap.enabled = preset !== 'low';

                if (
                    preset === 'medium' &&
                    THREE.PCFShadowMap !== undefined
                ) {
                    this.renderer.shadowMap.type = THREE.PCFShadowMap;
                } else if (
                    preset !== 'low' &&
                    THREE.PCFSoftShadowMap !== undefined
                ) {
                    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                }
            }

            this.contactShadows.setVisible(
                preset === 'high' || preset === 'ultra'
            );

            return this;
        }

        update(camera) {
            if (!this.enabled) return;

            for (const shadow of this.directionalShadows.values()) {
                shadow.configure(camera);
            }
        }

        diagnostics() {
            const report = {
                initialized: this.initialized,
                enabled: this.enabled,
                quality: this.quality,
                directionalShadowLights: this.directionalShadows.size,
                contactReceiver: !!this.contactShadows.mesh
            };

            console.log('[SMShadowManager][Diagnostics]', report);
            return report;
        }

        dispose() {
            this.directionalShadows.clear();
            this.contactShadows.dispose();
            this.initialized = false;
        }
    }

    function initSMShadowManager(options = {}) {
        if (global.smShadowManager instanceof SMShadowManager) {
            return global.smShadowManager;
        }

        global.smShadowManager = new SMShadowManager({
            renderer: options.renderer || global.renderer,
            scene: options.scene || global.scene,
            quality: options.quality,
            atlas: options.atlas,
            contactShadows: options.contactShadows
        });

        return global.smShadowManager.initialize();
    }

    global.SMShadowManager = SMShadowManager;
    global.initSMShadowManager = initSMShadowManager;
})(window);
