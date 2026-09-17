// engine/importers/blender/BlenderMetadataBridge.js
// SM Engine — Blender metadata normalization and Three.js attachment.
(function () {
    'use strict';

    function getNode() {
        const req =
            (typeof window !== 'undefined' && typeof window.require === 'function')
                ? window.require
                : (typeof require === 'function' ? require : null);

        if (!req) return null;

        try {
            return {
                fs: req('fs')
            };
        } catch (_) {
            return null;
        }
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function asObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : {};
    }

    function normalizeTextureRecord(texture) {
        const record = asObject(texture);
        const image = asObject(record.image);
        const transform = asObject(record.transform);

        return {
            name: String(record.name || image.name || ''),
            label: String(record.label || image.name || record.name || ''),
            semantic: String(record.semantic || 'unmapped'),
            socket: record.socket || null,
            colorTexture: record.colorTexture === true,
            image: {
                name: String(image.name || ''),
                source: image.source || 'FILE',
                filepath: image.filepath || null,
                relativePath: image.relativePath || null,
                absolutePath: image.absolutePath || null,
                packed: image.packed === true,
                mimeType: image.mimeType || null,
                width: Number(image.width) || 0,
                height: Number(image.height) || 0,
                colorspace: image.colorspace || null,
                alphaMode: image.alphaMode || null,
                channels: Number(image.channels) || 0,
                fileFormat: image.fileFormat || null
            },
            transform: {
                extension: transform.extension || 'REPEAT',
                interpolation: transform.interpolation || 'Linear',
                projection: transform.projection || 'FLAT',
                uvMap: transform.uvMap || null,
                offset: asArray(transform.offset).slice(0, 2),
                scale: asArray(transform.scale).slice(0, 2),
                rotation: Number(transform.rotation) || 0
            },
            customProperties: asObject(record.customProperties)
        };
    }

    function normalizeMaterialRecord(material) {
        const record = asObject(material);
        return {
            name: String(record.name || ''),
            useNodes: record.useNodes !== false,
            blendMethod: String(record.blendMethod || 'OPAQUE').toUpperCase(),
            doubleSided: record.doubleSided !== false,
            alphaThreshold: Number.isFinite(Number(record.alphaThreshold))
                ? Number(record.alphaThreshold)
                : 0.5,
            diffuseColor: asArray(record.diffuseColor).slice(0, 4),
            pbr: asObject(record.pbr),
            textures: asArray(record.textures).map(normalizeTextureRecord),
            customProperties: asObject(record.customProperties),
            nodeSummary: asArray(record.nodeSummary)
                .map(node => ({
                    name: String(node?.name || ''),
                    label: String(node?.label || ''),
                    type: String(node?.type || '')
                }))
        };
    }

    class BlenderMetadataBridge {
        constructor() {
            this.node = getNode();
        }

        read(metadataPath) {
            if (!metadataPath || !this.node) return null;

            try {
                const raw =
                    this.node.fs.readFileSync(
                        metadataPath,
                        'utf8'
                    );

                return JSON.parse(raw);
            } catch (error) {
                console.warn(
                    '[BlenderMetadataBridge] Could not read metadata:',
                    error
                );
                return null;
            }
        }

        normalize(metadata) {
            if (!metadata || typeof metadata !== 'object') {
                return null;
            }

            const objects =
                asArray(metadata.objects)
                    .map(object => ({
                        name: object.name || '',
                        type: object.type || 'EMPTY',
                        parent: object.parent || null,
                        collections: asArray(object.collections),
                        materials: asArray(object.materials),
                        modifiers: asArray(object.modifiers),
                        customProperties:
                            object.customProperties || {},
                        transform:
                            object.transform || {},
                        mesh:
                            object.mesh || null,
                        armature:
                            object.armature || null,
                        animation:
                            object.animation || null,
                        camera:
                            object.camera || null,
                        light:
                            object.light || null
                    }));

            const materials =
                asArray(metadata.materials)
                    .map(normalizeMaterialRecord);

            return {
                format:
                    metadata.format ||
                    'SM_BLENDER_IMPORT_METADATA',
                version:
                    Number(metadata.version) || 1,
                blenderVersion:
                    metadata.blenderVersion || null,
                source:
                    metadata.source || null,
                scene:
                    asObject(metadata.scene),
                collections:
                    asArray(metadata.collections),
                materials,
                images:
                    asArray(metadata.images)
                        .map(image => normalizeTextureRecord({ image }).image),
                uiPanels:
                    asArray(metadata.uiPanels),
                actions:
                    asArray(metadata.actions),
                objects,
                exportedAt:
                    metadata.exportedAt || null
            };
        }

        summarize(metadata) {
            const normalized =
                this.normalize(metadata);

            if (!normalized) {
                return {
                    objects: 0,
                    meshes: 0,
                    armatures: 0,
                    animations: 0,
                    cameras: 0,
                    lights: 0,
                    materials: 0,
                    textures: 0,
                    images: 0,
                    uiPanels: 0
                };
            }

            const countType =
                type =>
                    normalized.objects.filter(
                        object => object.type === type
                    ).length;

            return {
                objects:
                    normalized.objects.length,
                meshes:
                    countType('MESH'),
                armatures:
                    countType('ARMATURE'),
                cameras:
                    countType('CAMERA'),
                lights:
                    countType('LIGHT'),
                animations:
                    normalized.actions.length,
                materials:
                    normalized.materials.length,
                textures:
                    normalized.materials.reduce(
                        (total, material) => total + material.textures.length,
                        0
                    ),
                images:
                    normalized.images.length,
                uiPanels:
                    normalized.uiPanels.length
            };
        }

        _indexObject3D(root) {
            const map = new Map();

            root?.traverse?.(object => {
                if (!object?.name) return;

                if (!map.has(object.name)) {
                    map.set(
                        object.name,
                        []
                    );
                }

                map.get(object.name)
                    .push(object);
            });

            return map;
        }

        applyToObject3D(root, metadata) {
            const normalized =
                this.normalize(metadata);

            if (!root || !normalized) {
                return false;
            }

            root.userData =
                root.userData || {};

            root.userData.smImport = {
                ...(root.userData.smImport || {}),
                sourceType: 'blend',
                blenderVersion:
                    normalized.blenderVersion,
                source:
                    normalized.source,
                format:
                    normalized.format,
                version:
                    normalized.version,
                summary:
                    this.summarize(normalized)
            };

            root.userData.smBlenderUIPanels =
                normalized.uiPanels;

            const index =
                this._indexObject3D(root);

            for (const record of normalized.objects) {
                const matches =
                    index.get(record.name) ||
                    [];

                for (const object of matches) {
                    object.userData =
                        object.userData || {};

                    object.userData.smBlender = {
                        type:
                            record.type,
                        parent:
                            record.parent,
                        collections:
                            record.collections,
                        modifiers:
                            record.modifiers,
                        customProperties:
                            record.customProperties,
                        sourceMaterials:
                            record.materials,
                        mesh:
                            record.mesh,
                        armature:
                            record.armature,
                        animation:
                            record.animation,
                        camera:
                            record.camera,
                        light:
                            record.light
                    };
                }
            }

            const materialsByName = new Map(
                normalized.materials
                    .filter(record => record.name)
                    .map(record => [record.name, record])
            );

            root.traverse?.(object => {
                if (!object?.isMesh) return;
                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];

                for (const material of materials) {
                    if (!material) continue;
                    const record = materialsByName.get(material.name);
                    if (!record) continue;
                    material.userData ||= {};
                    material.userData.smBlender = record;
                    material.userData.smBlenderImported = true;
                }
            });

            return true;
        }
    }

    window.BlenderMetadataBridge =
        BlenderMetadataBridge;

    window.smBlenderMetadataBridge =
        window.smBlenderMetadataBridge ||
        new BlenderMetadataBridge();
})();
