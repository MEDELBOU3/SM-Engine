/**
 * SM ENGINE — UNREAL ASSET MATERIAL BRIDGE
 *
 * Unreal normalized materials
 * -> SM Engine Material System
 */
(function () {
    'use strict';

    class UnrealAssetMaterialBridge {

        constructor(options = {}) {

            this.materialSystem =
                options.materialSystem ||
                window.SM_MaterialSystem ||
                window.MaterialSystem ||
                window.smMaterialSystem ||
                null;
        }

        setMaterialSystem(system) {
            this.materialSystem =
                system;

            return this;
        }

        async apply(
            asset,
            options = {}
        ) {
            if (!asset) {
                return asset;
            }

            const materials =
                Array.isArray(asset.materials)
                    ? asset.materials
                    : [];

            const converted = [];

            for (
                const definition
                of materials
            ) {
                const material =
                    await this.applyMaterial(
                        definition,
                        options
                    );

                if (material) {
                    converted.push(
                        material
                    );
                }
            }

            if (converted.length) {
                asset.smMaterials =
                    converted;
            }

            return asset;
        }

        async applyMaterial(
            definition,
            options = {}
        ) {
            if (!definition) {
                return null;
            }

            const normalized =
                this.normalizeMaterial(
                    definition
                );

            const system =
                this.materialSystem;

            if (!system) {
                return normalized;
            }

            /*
             * SM MaterialSystem compatibility.
             */
            if (
                typeof system.createMaterial ===
                'function'
            ) {
                return await system.createMaterial(
                    normalized
                );
            }

            if (
                typeof system.createThreeMaterial ===
                'function'
            ) {
                return await system.createThreeMaterial(
                    normalized
                );
            }

            if (
                options.object &&
                typeof system.applyToObject ===
                'function'
            ) {
                await system.applyToObject(
                    options.object,
                    normalized
                );

                return normalized;
            }

            return this.createThreeMaterial(normalized) || normalized;
        }

        createThreeMaterial(normalized) {
            if (typeof THREE === 'undefined') return null;

            try {
                const matParams = {
                    color: new THREE.Color(normalized.baseColor || '#ffffff'),
                    roughness: Number(normalized.roughness ?? 0.5),
                    metalness: Number(normalized.metalness ?? 0.0),
                    emissive: new THREE.Color(normalized.emissive || '#000000'),
                    transparent: (normalized.opacity ?? 1.0) < 1.0 || normalized.blendMode === 'Translucent',
                    opacity: Number(normalized.opacity ?? 1.0),
                    side: normalized.twoSided ? THREE.DoubleSide : THREE.FrontSide
                };

                const material = new THREE.MeshStandardMaterial(matParams);

                if (normalized.textures) {
                    const loader = new THREE.TextureLoader();
                    if (normalized.textures.baseColor) {
                        material.map = loader.load(normalized.textures.baseColor);
                    }
                    if (normalized.textures.normal) {
                        material.normalMap = loader.load(normalized.textures.normal);
                    }
                    if (normalized.textures.roughness) {
                        material.roughnessMap = loader.load(normalized.textures.roughness);
                    }
                    if (normalized.textures.metalness) {
                        material.metalnessMap = loader.load(normalized.textures.metalness);
                    }
                    if (normalized.textures.emissive) {
                        material.emissiveMap = loader.load(normalized.textures.emissive);
                    }
                    if (normalized.textures.ao) {
                        material.aoMap = loader.load(normalized.textures.ao);
                    }
                }

                return material;
            } catch (err) {
                console.warn('[SM Unreal Material Bridge] Failed to create Three.js material:', err);
                return null;
            }
        }

        normalizeMaterial(material) {

            const parameters =
                material.parameters || {};

            const textures =
                material.textures || {};

            return {
                ...material,

                name:
                    material.name ||
                    'UnrealMaterial',

                baseColor:
                    material.baseColor ||
                    material.baseColorHex ||
                    material.color ||
                    parameters.BaseColor ||
                    parameters.baseColor ||
                    '#ffffff',

                roughness:
                    material.roughness ??
                    parameters.Roughness ??
                    parameters.roughness ??
                    0.5,

                metalness:
                    material.metalness ??
                    material.metallic ??
                    parameters.Metallic ??
                    parameters.metallic ??
                    0,

                emissive:
                    material.emissive ||
                    parameters.EmissiveColor ||
                    parameters.emissive ||
                    '#000000',

                opacity:
                    material.opacity ??
                    parameters.Opacity ??
                    1,

                textures: {
                    baseColor:
                        textures.baseColor ||
                        textures.albedo ||
                        textures.diffuse ||
                        null,

                    normal:
                        textures.normal ||
                        null,

                    roughness:
                        textures.roughness ||
                        null,

                    metalness:
                        textures.metalness ||
                        textures.metallic ||
                        null,

                    ao:
                        textures.ao ||
                        textures.occlusion ||
                        null,

                    emissive:
                        textures.emissive ||
                        null
                },

                metadata: {
                    ...(material.metadata || {}),

                    sourceEngine:
                        'Unreal Engine'
                },

                userData: {
                    ...(material.userData || {}),

                    smSourceEngine:
                        'Unreal Engine',

                    smUnrealMaterial:
                        true
                }
            };
        }
    }

    window.SMUnrealAssetMaterialBridge =
        UnrealAssetMaterialBridge;

})();