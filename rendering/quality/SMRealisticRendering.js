(function (global) {
    'use strict';

    const QUALITY = Object.freeze({
        low: Object.freeze({ anisotropy: 2, shadowMapSize: 512 }),
        medium: Object.freeze({ anisotropy: 4, shadowMapSize: 1024 }),
        high: Object.freeze({ anisotropy: 8, shadowMapSize: 2048 }),
        ultra: Object.freeze({ anisotropy: 16, shadowMapSize: 4096 })
    });

    class SMRealisticRendering {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;
            this.quality = options.quality || 'high';
            this.initialized = false;
            this.stats = {
                meshes: 0,
                materials: 0,
                textures: 0,
                uv2Generated: 0
            };
            this._boundRefresh = () => this.scheduleScenePreparation();
            this._refreshTimer = null;
            this._events = [
                'sm:scene-loaded',
                'sm:object-added',
                'sm:asset-loaded',
                'sm:project-opened',
                'sm:hdri-environment-changed'
            ];
        }

        initialize() {
            if (this.initialized) return this;
            if (!this.renderer || !this.scene) {
                throw new Error('[SMRealisticRendering] renderer and scene are required.');
            }

            this.configureRenderer();
            this.applyQuality(this.quality, { prepareScene: false });
            this.prepareScene();
            this._events.forEach(event => global.addEventListener?.(event, this._boundRefresh));
            this.initialized = true;

            global.dispatchEvent?.(new CustomEvent('sm:realistic-rendering-ready', {
                detail: { quality: this.quality }
            }));

            return this;
        }

        configureRenderer() {
            const renderer = this.renderer;

            if (global.THREE?.ColorManagement) {
                global.THREE.ColorManagement.enabled = true;
            }

            if ('physicallyCorrectLights' in renderer) {
                renderer.physicallyCorrectLights = true;
            }
            if ('useLegacyLights' in renderer) {
                renderer.useLegacyLights = false;
            }

            if ('outputColorSpace' in renderer && THREE.SRGBColorSpace !== undefined) {
                renderer.outputColorSpace = THREE.SRGBColorSpace;
            } else if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) {
                renderer.outputEncoding = THREE.sRGBEncoding;
            }

            if (THREE.ACESFilmicToneMapping !== undefined) {
                renderer.toneMapping = THREE.ACESFilmicToneMapping;
            }
            if (!Number.isFinite(renderer.toneMappingExposure) || renderer.toneMappingExposure <= 0) {
                renderer.toneMappingExposure = 1;
            }

            renderer.sortObjects = true;
            renderer.autoClear = true;

            if (renderer.shadowMap) {
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.autoUpdate = true;
                if (THREE.PCFSoftShadowMap !== undefined) {
                    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                }
                renderer.shadowMap.needsUpdate = true;
            }

            return this;
        }

        applyQuality(name, options = {}) {
            const settings = QUALITY[name] || QUALITY.high;
            this.quality = QUALITY[name] ? name : 'high';

            const maximum = this.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
            const anisotropy = Math.max(1, Math.min(settings.anisotropy, maximum));

            if (global.smMaterialSystem?.defaults) {
                global.smMaterialSystem.defaults.anisotropy = anisotropy;
            }

            global.smPostProcessStack?.setQualityPreset?.(this.quality);

            if (options.prepareScene !== false) {
                this.prepareScene();
            }

            return this;
        }

        _isRenderableMesh(object) {
            if (!object?.isMesh || !object.material) return false;
            const data = object.userData || {};
            return !(
                object.isHelper ||
                data.isSystemObject ||
                data.isEditorHelper ||
                data.isTransformControlsChild ||
                data.isHitProxy ||
                data.excludeFromRealisticRendering
            );
        }

        _prepareGeometry(mesh, materials) {
            const geometry = mesh.geometry;
            if (!geometry?.attributes) return;

            if (!geometry.boundingSphere && geometry.attributes.position) {
                geometry.computeBoundingSphere?.();
            }

            const requiresUV2 = materials.some(material => material?.aoMap || material?.lightMap);
            if (
                requiresUV2 &&
                !geometry.attributes.uv2 &&
                geometry.attributes.uv?.clone
            ) {
                geometry.setAttribute('uv2', geometry.attributes.uv.clone());
                this.stats.uv2Generated++;
            }
        }

        prepareMesh(mesh) {
            if (!this._isRenderableMesh(mesh)) return false;

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const opaqueCaster = materials.some(material => (
                material &&
                material.visible !== false &&
                (!material.transparent || (material.alphaTest || 0) > 0)
            ));

            if (mesh.userData?.castShadow === undefined) {
                mesh.castShadow = opaqueCaster;
            }
            if (mesh.userData?.receiveShadow === undefined) {
                mesh.receiveShadow = true;
            }

            this._prepareGeometry(mesh, materials);

            materials.forEach(material => {
                if (!material) return;
                global.smMaterialSystem?.normalizeMaterial?.(material);
                this.stats.materials++;
            });

            this.stats.meshes++;
            return true;
        }

        prepareScene(scene = this.scene) {
            if (!scene?.traverse) return { ...this.stats };

            this.stats = {
                meshes: 0,
                materials: 0,
                textures: 0,
                uv2Generated: 0
            };

            scene.traverse(object => this.prepareMesh(object));
            this.stats.textures = global.smMaterialSystem?.textures?.cache?.size || 0;

            this.renderer?.shadowMap && (this.renderer.shadowMap.needsUpdate = true);
            return { ...this.stats };
        }

        scheduleScenePreparation() {
            if (this._refreshTimer !== null) return;

            const run = () => {
                this._refreshTimer = null;
                this.prepareScene();
            };

            if (typeof global.requestIdleCallback === 'function') {
                this._refreshTimer = global.requestIdleCallback(run, { timeout: 500 });
            } else {
                this._refreshTimer = global.setTimeout(run, 32);
            }
        }

        diagnostics() {
            const report = {
                initialized: this.initialized,
                quality: this.quality,
                colorManagement: global.THREE?.ColorManagement?.enabled !== false,
                physicallyCorrectLights: this.renderer?.physicallyCorrectLights,
                toneMapping: this.renderer?.toneMapping,
                exposure: this.renderer?.toneMappingExposure,
                shadows: this.renderer?.shadowMap?.enabled,
                stats: { ...this.stats }
            };
            console.log('[SMRealisticRendering][Diagnostics]', report);
            return report;
        }

        dispose() {
            this._events.forEach(event => global.removeEventListener?.(event, this._boundRefresh));
            if (this._refreshTimer !== null) {
                global.cancelIdleCallback?.(this._refreshTimer);
                global.clearTimeout?.(this._refreshTimer);
            }
            this._refreshTimer = null;
            this.initialized = false;
        }
    }

    function initSMRealisticRendering(options = {}) {
        if (global.smRealisticRendering instanceof SMRealisticRendering) {
            return global.smRealisticRendering;
        }

        global.smRealisticRendering = new SMRealisticRendering({
            renderer: options.renderer || global.renderer,
            scene: options.scene || global.scene,
            quality: options.quality || 'high'
        });

        return global.smRealisticRendering.initialize();
    }

    global.SMRealisticRenderingQuality = QUALITY;
    global.SMRealisticRendering = SMRealisticRendering;
    global.initSMRealisticRendering = initSMRealisticRendering;
    global.SMRenderingQuality = {
        setPreset(name) {
            if (global.smGraphicsQuality?.applyPreset) {
                return global.smGraphicsQuality.applyPreset(name, {
                    keepResolution: true
                });
            }
            return global.smRealisticRendering?.applyQuality?.(name) || false;
        },
        prepareScene() {
            return global.smRealisticRendering?.prepareScene?.() || null;
        },
        diagnostics() {
            return {
                realistic: global.smRealisticRendering?.diagnostics?.() || null,
                postProcess: global.smPostProcessStack?.diagnostics?.() || null,
                renderer: global.smRenderer?.diagnostics?.() || null
            };
        }
    };
})(window);
