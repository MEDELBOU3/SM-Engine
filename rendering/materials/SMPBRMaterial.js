(function (global) {
    'use strict';

    const PHYSICAL_KEYS = [
        'clearcoat',
        'clearcoatRoughness',
        'transmission',
        'thickness',
        'ior',
        'sheen',
        'iridescence',
        'specularIntensity',
        'attenuationDistance',
        'dispersion'
    ];

    class SMPBRMaterial {
        static _usesPhysicalFeatures(options) {
            return (
                options.physical === true ||
                PHYSICAL_KEYS.some(key => options[key] !== undefined)
            );
        }

        static create(options = {}) {
            const wantsPhysical = this._usesPhysicalFeatures(options);
            const MaterialClass =
                wantsPhysical && typeof THREE.MeshPhysicalMaterial === 'function'
                    ? THREE.MeshPhysicalMaterial
                    : THREE.MeshStandardMaterial;

            const config = {
                color: options.baseColor ?? options.color ?? 0xffffff,
                roughness: options.roughness ?? 0.55,
                metalness: options.metalness ?? 0,
                map: options.baseColorMap || options.map || null,
                normalMap: options.normalMap || null,
                roughnessMap: options.roughnessMap || null,
                metalnessMap: options.metalnessMap || null,
                aoMap: options.aoMap || null,
                lightMap: options.lightMap || null,
                emissiveMap: options.emissiveMap || null,
                alphaMap: options.alphaMap || null,
                bumpMap: options.bumpMap || null,
                displacementMap: options.displacementMap || null,
                emissive: options.emissive ?? 0x000000,
                emissiveIntensity: options.emissiveIntensity ?? 1,
                transparent: options.transparent === true,
                opacity: options.opacity ?? 1,
                alphaTest: options.alphaTest ?? 0,
                side: options.doubleSided === true
                    ? THREE.DoubleSide
                    : (options.side ?? THREE.FrontSide),
                depthWrite: options.depthWrite !== false,
                depthTest: options.depthTest !== false,
                fog: options.fog !== false,
                toneMapped: options.toneMapped !== false,
                flatShading: options.flatShading === true,
                wireframe: options.wireframe === true
            };

            if (options.normalScale) config.normalScale = options.normalScale;
            if (options.bumpScale !== undefined) config.bumpScale = options.bumpScale;
            if (options.displacementScale !== undefined) config.displacementScale = options.displacementScale;
            if (options.displacementBias !== undefined) config.displacementBias = options.displacementBias;
            if (options.aoMapIntensity !== undefined) config.aoMapIntensity = options.aoMapIntensity;
            if (options.lightMapIntensity !== undefined) config.lightMapIntensity = options.lightMapIntensity;

            if (wantsPhysical) {
                Object.assign(config, {
                    clearcoat: options.clearcoat ?? 0,
                    clearcoatMap: options.clearcoatMap || null,
                    clearcoatRoughness: options.clearcoatRoughness ?? 0,
                    clearcoatRoughnessMap: options.clearcoatRoughnessMap || null,
                    clearcoatNormalMap: options.clearcoatNormalMap || null,
                    transmission: options.transmission ?? 0,
                    transmissionMap: options.transmissionMap || null,
                    thickness: options.thickness ?? 0,
                    thicknessMap: options.thicknessMap || null,
                    ior: options.ior ?? 1.5,
                    attenuationColor: options.attenuationColor ?? 0xffffff,
                    attenuationDistance: options.attenuationDistance ?? Infinity,
                    sheen: options.sheen ?? 0,
                    sheenColor: options.sheenColor ?? 0x000000,
                    sheenRoughness: options.sheenRoughness ?? 1,
                    iridescence: options.iridescence ?? 0,
                    iridescenceIOR: options.iridescenceIOR ?? 1.3,
                    specularIntensity: options.specularIntensity ?? 1
                });

            }

            const material = new MaterialClass(config);

            // Dispersion was added after the Three.js revision currently bundled
            // by SM Engine. Assign it only when the runtime material supports it,
            // otherwise Three.js warns about an unknown constructor property.
            if (
                options.dispersion !== undefined &&
                'dispersion' in material
            ) {
                material.dispersion = options.dispersion;
            }

            if ('envMapIntensity' in material) {
                material.envMapIntensity = options.envMapIntensity ?? 1;
            }
            if ('dithering' in material) {
                material.dithering = options.dithering !== false;
            }
            if ('alphaToCoverage' in material && material.alphaTest > 0) {
                material.alphaToCoverage = options.alphaToCoverage !== false;
            }

            material.name = options.name || (wantsPhysical ? 'SM_PhysicalMaterial' : 'SM_PBRMaterial');
            material.userData = {
                ...(options.userData || {}),
                smMaterialType: wantsPhysical ? 'physical' : 'pbr',
                smManagedMaterial: true
            };
            material.needsUpdate = true;
            return material;
        }

        static fromThreeMaterial(source, options = {}) {
            if (!source) return this.create(options);

            const physical = source.isMeshPhysicalMaterial === true;
            return this.create({
                name: options.name || `${source.name || 'Material'}_SM`,
                physical,
                baseColor: source.color?.clone?.() || 0xffffff,
                roughness: source.roughness ?? 0.55,
                metalness: source.metalness ?? 0,
                baseColorMap: source.map || null,
                normalMap: source.normalMap || null,
                normalScale: source.normalScale?.clone?.() || source.normalScale,
                roughnessMap: source.roughnessMap || null,
                metalnessMap: source.metalnessMap || null,
                aoMap: source.aoMap || null,
                aoMapIntensity: source.aoMapIntensity,
                lightMap: source.lightMap || null,
                lightMapIntensity: source.lightMapIntensity,
                emissive: source.emissive?.clone?.() || 0x000000,
                emissiveMap: source.emissiveMap || null,
                emissiveIntensity: source.emissiveIntensity ?? 1,
                alphaMap: source.alphaMap || null,
                transparent: source.transparent,
                opacity: source.opacity,
                alphaTest: source.alphaTest,
                doubleSided: source.side === THREE.DoubleSide,
                envMapIntensity: source.envMapIntensity ?? 1,
                clearcoat: source.clearcoat,
                clearcoatRoughness: source.clearcoatRoughness,
                transmission: source.transmission,
                thickness: source.thickness,
                ior: source.ior,
                attenuationColor: source.attenuationColor?.clone?.(),
                attenuationDistance: source.attenuationDistance,
                sheen: source.sheen,
                sheenColor: source.sheenColor?.clone?.(),
                sheenRoughness: source.sheenRoughness,
                iridescence: source.iridescence,
                iridescenceIOR: source.iridescenceIOR,
                specularIntensity: source.specularIntensity,
                ...options
            });
        }
    }

    global.SMPBRMaterial = SMPBRMaterial;
})(window);
