(function (global) {
    'use strict';

    const COLOR_TEXTURES = [
        'map',
        'emissiveMap',
        'sheenColorMap',
        'specularColorMap'
    ];

    const DATA_TEXTURES = [
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'alphaMap',
        'bumpMap',
        'displacementMap',
        'lightMap',
        'clearcoatMap',
        'clearcoatRoughnessMap',
        'clearcoatNormalMap',
        'transmissionMap',
        'thicknessMap',
        'iridescenceMap',
        'iridescenceThicknessMap'
    ];

    class SMMaterialSystem {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;
            this.registry = new global.SMMaterialRegistry();
            this.textures = new global.SMTextureManager(this.renderer);
            this.compiler = new global.SMMaterialCompiler(this.renderer);
            this.initialized = false;
            this.defaults = {
                roughness: 0.55,
                metalness: 0,
                envMapIntensity: 1,
                anisotropy: this.textures.defaultAnisotropy
            };
        }

        initialize() {
            if (this.initialized) return this;
            if (this.scene) this.registerScene(this.scene);
            this.initialized = true;
            return this;
        }

        registerScene(scene = this.scene) {
            this.scene = scene || this.scene;
            this.scene?.traverse?.(object => {
                if (object?.isMesh) this.registerMesh(object);
            });
            return this.registry.materials.size;
        }

        registerMesh(mesh) {
            if (!mesh?.isMesh) return mesh;
            this.registry.registerMesh(mesh);
            this.normalizeMesh(mesh);
            return mesh;
        }

        _setTextureColorSpace(texture, colorTexture) {
            if (!texture) return false;
            let changed = false;

            const targetColorSpace = colorTexture
                ? THREE.SRGBColorSpace
                : THREE.NoColorSpace;

            if ('colorSpace' in texture && targetColorSpace !== undefined) {
                if (texture.colorSpace !== targetColorSpace) {
                    texture.colorSpace = targetColorSpace;
                    changed = true;
                }
            } else if ('encoding' in texture) {
                const targetEncoding = colorTexture
                    ? THREE.sRGBEncoding
                    : THREE.LinearEncoding;
                if (
                    targetEncoding !== undefined &&
                    texture.encoding !== targetEncoding
                ) {
                    texture.encoding = targetEncoding;
                    changed = true;
                }
            }

            const maximum = this.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
            const anisotropy = Math.max(1, Math.min(this.defaults.anisotropy, maximum));
            if ((texture.anisotropy || 1) < anisotropy) {
                texture.anisotropy = anisotropy;
                changed = true;
            }

            if (changed) texture.needsUpdate = true;
            return changed;
        }

        normalizeMesh(mesh) {
            if (!mesh?.isMesh || !mesh.material) return mesh;

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(material => this.normalizeMaterial(material));

            const needsSecondaryUV = materials.some(material => material?.aoMap || material?.lightMap);
            const geometry = mesh.geometry;
            if (
                needsSecondaryUV &&
                geometry?.attributes?.uv &&
                !geometry.attributes.uv2 &&
                geometry.attributes.uv.clone
            ) {
                geometry.setAttribute('uv2', geometry.attributes.uv.clone());
            }

            if (mesh.userData?.receiveShadow === undefined) {
                mesh.receiveShadow = true;
            }

            const opaque = materials.some(material => (
                material && (!material.transparent || (material.alphaTest || 0) > 0)
            ));
            if (mesh.userData?.castShadow === undefined) {
                mesh.castShadow = opaque;
            }

            return mesh;
        }

        normalizeMaterial(material) {
            if (!material) return material;

            let changed = false;
            COLOR_TEXTURES.forEach(key => {
                changed = this._setTextureColorSpace(material[key], true) || changed;
            });
            DATA_TEXTURES.forEach(key => {
                changed = this._setTextureColorSpace(material[key], false) || changed;
            });

            if ('roughness' in material && Number.isFinite(material.roughness)) {
                const roughness = Math.max(0.02, Math.min(1, material.roughness));
                if (roughness !== material.roughness) {
                    material.roughness = roughness;
                    changed = true;
                }
            }
            if ('metalness' in material && Number.isFinite(material.metalness)) {
                const metalness = Math.max(0, Math.min(1, material.metalness));
                if (metalness !== material.metalness) {
                    material.metalness = metalness;
                    changed = true;
                }
            }
            if ('envMapIntensity' in material && !Number.isFinite(material.envMapIntensity)) {
                material.envMapIntensity = this.defaults.envMapIntensity;
                changed = true;
            }
            if ('dithering' in material && material.dithering !== true) {
                material.dithering = true;
                changed = true;
            }
            if (
                'alphaToCoverage' in material &&
                material.alphaTest > 0 &&
                material.alphaToCoverage !== true
            ) {
                material.alphaToCoverage = true;
                changed = true;
            }

            if (changed) material.needsUpdate = true;
            this.registry.register(material);
            return material;
        }

        createPBR(options = {}) {
            const material = global.SMPBRMaterial.create({
                roughness: this.defaults.roughness,
                metalness: this.defaults.metalness,
                envMapIntensity: this.defaults.envMapIntensity,
                ...options
            });
            this.normalizeMaterial(material);
            return material;
        }

        warmup(camera = global.camera) {
            return this.compiler.compileSceneAsync(this.scene, camera);
        }

        diagnostics() {
            const report = {
                initialized: this.initialized,
                registry: this.registry.diagnostics(),
                cachedTextures: this.textures.cache.size,
                lastCompileMs: this.compiler.lastCompileMs,
                defaults: { ...this.defaults }
            };
            console.log('[SMMaterialSystem][Diagnostics]', report);
            return report;
        }

        dispose() {
            this.registry.clear();
            this.textures.dispose();
            this.initialized = false;
        }
    }

    function initSMMaterialSystem(options = {}) {
        if (global.smMaterialSystem instanceof SMMaterialSystem) {
            return global.smMaterialSystem;
        }

        global.smMaterialSystem = new SMMaterialSystem({
            renderer: options.renderer || global.renderer,
            scene: options.scene || global.scene
        });
        return global.smMaterialSystem.initialize();
    }

    global.SMMaterialSystem = SMMaterialSystem;
    global.initSMMaterialSystem = initSMMaterialSystem;
})(window);
