// engine/importers/blender/SMBlenderMaterialBridge.js
// SM Engine — converts THREE materials from Blender->GLB into native AssetsPanel
// material assets linked to extracted texture assets.
(function (global) {
    'use strict';

    if (global.smBlenderMaterialBridge) return;

    const TEXTURE_SLOTS = Object.freeze([
        ['map', 'map'],
        ['normalMap', 'normalMap'],
        ['roughnessMap', 'roughnessMap'],
        ['metalnessMap', 'metalnessMap'],
        ['aoMap', 'aoMap'],
        ['emissiveMap', 'emissiveMap'],
        ['alphaMap', 'opacityMap'],
        ['displacementMap', 'displacementMap'],
        ['bumpMap', 'bumpMap'],
        ['lightMap', 'lightMap'],
        ['clearcoatMap', 'clearcoatMap'],
        ['clearcoatRoughnessMap', 'clearcoatRoughnessMap'],
        ['clearcoatNormalMap', 'clearcoatNormalMap'],
        ['transmissionMap', 'transmissionMap'],
        ['thicknessMap', 'thicknessMap'],
        ['specularIntensityMap', 'specularIntensityMap'],
        ['specularColorMap', 'specularColorMap']
    ]);

    function safeName(value, fallback = 'Material') {
        const cleaned = String(value || fallback)
            .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned || fallback;
    }

    function sourceBaseName(value) {
        return safeName(
            String(value || 'BlenderAsset')
                .replace(/\\/g, '/')
                .split('/')
                .pop()
                .replace(/\.blend$/i, ''),
            'BlenderAsset'
        );
    }

    function colorHex(color, fallback = '#ffffff') {
        try {
            return color?.isColor ? `#${color.getHexString()}` : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function numberOr(value, fallback) {
        return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    function colorHexFromArray(value, fallback) {
        if (!Array.isArray(value) || value.length < 3) return fallback;
        const channel = index => Math.max(0, Math.min(255, Math.round(numberOr(value[index], 0) * 255)));
        return `#${[channel(0), channel(1), channel(2)]
            .map(item => item.toString(16).padStart(2, '0'))
            .join('')}`;
    }

    function ensureFolder(panel, name, parentId) {
        const normalizedParent = parentId ?? null;
        const existing = Object.values(panel.folders || {}).find(folder =>
            folder &&
            folder.name === name &&
            (folder.parentId || null) === normalizedParent
        );
        if (existing) return existing.id;

        if (typeof panel.createFolder === 'function') {
            return panel.createFolder(name, normalizedParent);
        }
        return normalizedParent;
    }

    function ensureOutputFolders(panel, sourceName, parentFolderId) {
        const baseName = sourceBaseName(sourceName);
        let rootFolderId = parentFolderId ?? null;
        const parentFolder = rootFolderId ? panel.folders?.[rootFolderId] : null;

        if (!parentFolder || String(parentFolder.name || '').toLowerCase() !== baseName.toLowerCase()) {
            rootFolderId = ensureFolder(panel, baseName, rootFolderId);
        }

        const texturesFolderId = ensureFolder(panel, 'Textures', rootFolderId);
        const materialsFolderId = ensureFolder(panel, 'Materials', rootFolderId);

        return { baseName, rootFolderId, texturesFolderId, materialsFolderId };
    }

    class SMBlenderMaterialBridge {
        constructor() {
            this.lastResult = null;
        }

        collect(root) {
            const materials = new Map();
            const meshBindings = [];
            if (!root?.traverse) return { materials, meshBindings };

            root.traverse(mesh => {
                if (!mesh?.isMesh) return;
                const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                const binding = [];
                list.forEach((material, index) => {
                    if (!material) return;
                    const key = material.uuid || `${mesh.uuid}:${index}`;
                    if (!materials.has(key)) materials.set(key, material);
                    binding[index] = key;
                });
                if (binding.length) meshBindings.push({ mesh, binding });
            });

            return { materials, meshBindings };
        }

        metadataForMaterial(material, metadata) {
            if (!material || !Array.isArray(metadata?.materials)) return null;
            return metadata.materials.find(record => record?.name === material.name) || null;
        }

        prepareRuntime(root, options = {}) {
            if (!root?.traverse) return { meshes: 0, materials: 0, textures: null };
            const touchedMaterials = new Set();
            let meshes = 0;

            root.traverse(mesh => {
                if (!mesh?.isMesh) return;
                meshes++;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const material of materials) {
                    if (!material) continue;
                    const metadataRecord = this.metadataForMaterial(material, options.metadata);
                    material.userData ||= {};
                    material.userData.smBlenderImported = true;
                    if (metadataRecord) material.userData.smBlender = metadataRecord;

                    if (metadataRecord?.doubleSided && global.THREE?.DoubleSide !== undefined) {
                        material.side = global.THREE.DoubleSide;
                    }
                    const blendMethod = String(metadataRecord?.blendMethod || '').toUpperCase();
                    if (blendMethod === 'BLEND' || blendMethod === 'HASHED' || blendMethod === 'DITHERED') {
                        material.transparent = true;
                    } else if (blendMethod === 'CLIP') {
                        material.alphaTest = numberOr(metadataRecord?.alphaThreshold, 0.5);
                    }
                    material.needsUpdate = true;
                    touchedMaterials.add(material);
                }

                // Older Three.js revisions consume aoMap from uv2. glTF commonly
                // supplies only one UV set, so aliasing it prevents black AO.
                if (
                    materials.some(material => material?.aoMap) &&
                    mesh.geometry?.attributes?.uv &&
                    !mesh.geometry.attributes.uv2
                ) {
                    mesh.geometry.setAttribute?.('uv2', mesh.geometry.attributes.uv);
                }
            });

            const textureBridge = options.textureBridge || global.smBlenderTextureBridge || null;
            const textures = textureBridge?.prepareRuntime?.(root, options) || null;
            root.userData ||= {};
            root.userData.smBlenderMaterials = {
                meshes,
                materials: touchedMaterials.size,
                textures: textures?.configured || 0
            };
            return { meshes, materials: touchedMaterials.size, textures };
        }

        _textureAssetId(texture, textureResult) {
            if (!texture?.isTexture) return null;
            return (
                textureResult?.byUUID?.get(texture.uuid)?.assetId ||
                texture.userData?.smAssetId ||
                null
            );
        }

        definitionFromThree(material, textureResult, options = {}) {
            const metadataRecord = options.metadataRecord || null;
            const pbr = metadataRecord?.pbr || {};
            const definition = {
                version: 4,
                type: material?.isMeshPhysicalMaterial
                    ? 'MeshPhysicalMaterial'
                    : 'MeshStandardMaterial',
                displayName: safeName(material?.name || 'Blender Material'),
                provider: 'Blender',
                color: colorHex(material?.color, colorHexFromArray(pbr.baseColor, '#ffffff')),
                roughness: numberOr(material?.roughness, numberOr(pbr.roughness, 1)),
                metalness: numberOr(material?.metalness, numberOr(pbr.metallic, 0)),
                emissive: colorHex(material?.emissive, colorHexFromArray(pbr.emissive, '#000000')),
                emissiveIntensity: numberOr(material?.emissiveIntensity, numberOr(pbr.emissiveStrength, 1)),
                opacity: numberOr(material?.opacity, numberOr(pbr.alpha, 1)),
                transparent: material?.transparent === true,
                alphaTest: numberOr(material?.alphaTest, metadataRecord?.blendMethod === 'CLIP' ? numberOr(metadataRecord.alphaThreshold, 0.5) : 0),
                envMapIntensity: numberOr(material?.envMapIntensity, 1),
                normalStrength: numberOr(
                    Math.abs(material?.normalScale?.x),
                    numberOr(pbr.normalStrength, 1)
                ),
                normalConvention: Number(material?.normalScale?.y) < 0 ? 'dx' : 'gl',
                aoMapIntensity: numberOr(material?.aoMapIntensity, 1),
                displacementScale: numberOr(material?.displacementScale, 1),
                displacementBias: numberOr(material?.displacementBias, 0),
                side: material?.side,
                doubleSided: material?.side === global.THREE?.DoubleSide,
                depthWrite: material?.depthWrite !== false,
                blendMethod: metadataRecord?.blendMethod || (material?.transparent ? 'BLEND' : 'OPAQUE'),
                blenderMetadata: metadataRecord,
                sourcePackage: {
                    provider: 'Blender',
                    sourceName: options.sourceName || null,
                    sourcePath: options.sourcePath || null,
                    sourceMaterialName: material?.name || null,
                    extractedAt: Date.now()
                }
            };

            if (material?.isMeshPhysicalMaterial) {
                Object.assign(definition, {
                    clearcoat: numberOr(material.clearcoat, numberOr(pbr.clearcoat, 0)),
                    clearcoatRoughness: numberOr(material.clearcoatRoughness, numberOr(pbr.clearcoatRoughness, 0)),
                    transmission: numberOr(material.transmission, numberOr(pbr.transmission, 0)),
                    thickness: numberOr(material.thickness, numberOr(pbr.thickness, 0)),
                    ior: numberOr(material.ior, numberOr(pbr.ior, 1.5)),
                    reflectivity: numberOr(material.reflectivity, 0.5),
                    specularIntensity: numberOr(material.specularIntensity, 1),
                    specularColor: colorHex(material.specularColor, '#ffffff'),
                    sheen: numberOr(material.sheen, numberOr(pbr.sheen, 0)),
                    sheenRoughness: numberOr(material.sheenRoughness, 1),
                    sheenColor: colorHex(material.sheenColor, '#000000'),
                    anisotropy: numberOr(material.anisotropy, numberOr(pbr.anisotropy, 0)),
                    iridescence: numberOr(material.iridescence, 0),
                    iridescenceIOR: numberOr(material.iridescenceIOR, 1.3),
                    attenuationDistance: Number.isFinite(Number(material.attenuationDistance))
                        ? Number(material.attenuationDistance)
                        : null,
                    attenuationColor: colorHex(material.attenuationColor, '#ffffff'),
                    dispersion: numberOr(material.dispersion, 0)
                });
            }

            for (const [threeSlot, definitionSlot] of TEXTURE_SLOTS) {
                const assetId = this._textureAssetId(material?.[threeSlot], textureResult);
                if (assetId) {
                    definition[definitionSlot] = assetId;
                    definition.textureBindings ||= {};
                    const texture = material[threeSlot];
                    definition.textureBindings[definitionSlot] = {
                        assetId,
                        channel: Number(texture?.channel) || 0,
                        colorSpace: texture?.colorSpace || null,
                        flipY: texture?.flipY === true,
                        repeat: texture?.repeat ? [texture.repeat.x, texture.repeat.y] : [1, 1],
                        offset: texture?.offset ? [texture.offset.x, texture.offset.y] : [0, 0],
                        rotation: numberOr(texture?.rotation, 0)
                    };
                }
            }

            const primaryTexture = material?.map || material?.normalMap || material?.roughnessMap || null;
            if (primaryTexture?.repeat) {
                definition.uvTransform = {
                    repeat: [numberOr(primaryTexture.repeat.x, 1), numberOr(primaryTexture.repeat.y, 1)],
                    offset: [numberOr(primaryTexture.offset?.x, 0), numberOr(primaryTexture.offset?.y, 0)],
                    rotation: numberOr(primaryTexture.rotation, 0),
                    center: [numberOr(primaryTexture.center?.x, 0), numberOr(primaryTexture.center?.y, 0)]
                };
                if (Math.abs(definition.uvTransform.repeat[0] - definition.uvTransform.repeat[1]) < 1e-6) {
                    definition.tiling = definition.uvTransform.repeat[0];
                }
            }

            return definition;
        }

        _createMaterialAsset(panel, name, definition, folderId) {
            const json = JSON.stringify(definition, null, 2);
            if (typeof panel.addMaterialAsset === 'function') {
                return panel.addMaterialAsset(`${safeName(name)}.material.json`, json, folderId);
            }
            return null;
        }

        _annotateMaterialAsset(asset, material, definition, options) {
            if (!asset) return;
            asset.sourceType = 'blender-material-extract';
            asset.sourceFormat = 'blend-material';
            asset.blenderMaterialName = material?.name || null;
            asset.blenderMaterialUUID = material?.uuid || null;
            asset.blenderSourcePath = options.sourcePath || null;
            asset.definition = definition;
            asset.data = JSON.stringify(definition, null, 2);
            asset.references = [...new Set([
                ...(asset.references || []),
                ...TEXTURE_SLOTS
                    .map(([, slot]) => definition[slot])
                    .filter(Boolean)
            ])];
            asset.tags = [...new Set([
                ...(asset.tags || []),
                'blender',
                'material',
                'pbr',
                'paint-ready'
            ])];
        }

        _bindMeshes(meshBindings, materialAssetIds) {
            for (const { mesh, binding } of meshBindings) {
                const ids = binding.map(key => materialAssetIds.get(key) || null);
                mesh.userData ||= {};
                mesh.userData.smMaterialAssetIds = ids;
                if (ids.length === 1) mesh.userData.smMaterialAssetId = ids[0];

                const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                list.forEach((material, index) => {
                    if (!material) return;
                    const id = ids[index] || null;
                    material.userData ||= {};
                    if (id) material.userData.smMaterialAssetId = id;
                    material.userData.smBlenderImported = true;
                });
            }
        }

        async extractAndRegister(root, options = {}) {
            const panel = options.panel || global.AssetsPanel || null;
            if (!panel) throw new Error('SMBlenderMaterialBridge: AssetsPanel is unavailable.');

            const sourceName = options.sourceName || root?.name || 'BlenderAsset';
            const folders = options.folders || ensureOutputFolders(
                panel,
                sourceName,
                options.parentFolderId ?? null
            );

            const textureBridge = options.textureBridge || global.smBlenderTextureBridge || null;
            const textureResult = textureBridge?.extract
                ? await textureBridge.extract(root, {
                    panel,
                    folderId: folders.texturesFolderId,
                    sourceName,
                    sourcePath: options.sourcePath || null,
                    metadata: options.metadata || null,
                    renderer: options.renderer || global.renderer || null
                })
                : { total: 0, extracted: 0, failed: [], assets: [], byUUID: new Map() };

            const { materials, meshBindings } = this.collect(root);
            const materialAssets = [];
            const materialAssetIds = new Map();
            const failed = [];

            let unnamed = 0;
            for (const [key, material] of materials) {
                try {
                    const name = safeName(material?.name || `Material_${++unnamed}`);
                    const metadataRecord = this.metadataForMaterial(material, options.metadata);
                    const definition = this.definitionFromThree(material, textureResult, {
                        sourceName,
                        sourcePath: options.sourcePath || null,
                        metadataRecord
                    });
                    const asset = this._createMaterialAsset(
                        panel,
                        name,
                        definition,
                        folders.materialsFolderId
                    );
                    if (!asset) {
                        failed.push({ name, reason: 'AssetsPanel.addMaterialAsset() is unavailable or failed.' });
                        continue;
                    }
                    this._annotateMaterialAsset(asset, material, definition, options);
                    materialAssetIds.set(key, asset.id);
                    if (material?.uuid) materialAssetIds.set(material.uuid, asset.id);
                    materialAssets.push(asset);
                } catch (error) {
                    failed.push({
                        name: material?.name || 'Material',
                        reason: error?.message || String(error)
                    });
                    console.warn('[SMBlenderMaterialBridge] Material extraction failed:', material?.name, error);
                }
            }

            this._bindMeshes(meshBindings, materialAssetIds);

            global.SMMaterialLibrary?.syncAssetsPanel?.();
            global.SMEditorMaterialSystem?.invalidate?.();
            panel._saveToStorage?.();
            panel.render?.();
            panel._buildTagCloud?.();

            const result = {
                folders,
                textures: textureResult,
                materialCount: materials.size,
                extractedMaterials: materialAssets.length,
                failedMaterials: failed,
                materialAssets,
                materialAssetIds
            };
            this.lastResult = result;

            global.dispatchEvent?.(new CustomEvent('sm:blender-materials-extracted', {
                detail: {
                    sourceName,
                    folders,
                    textures: {
                        total: textureResult.total,
                        extracted: textureResult.extracted,
                        failed: textureResult.failed
                    },
                    materials: {
                        total: materials.size,
                        extracted: materialAssets.length,
                        failed
                    },
                    materialAssets
                }
            }));

            return result;
        }
    }

    global.SMBlenderMaterialBridge = SMBlenderMaterialBridge;
    global.smBlenderMaterialBridge = new SMBlenderMaterialBridge();
    console.log('[SMBlenderMaterialBridge] Ready.');
})(window);
