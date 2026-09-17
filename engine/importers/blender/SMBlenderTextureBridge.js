// engine/importers/blender/SMBlenderTextureBridge.js
// SM Engine — extracts embedded THREE.Texture objects from Blender->GLB imports
// and registers them as normal AssetsPanel texture assets.
(function (global) {
    'use strict';

    if (global.smBlenderTextureBridge) return;

    const SLOT_INFO = Object.freeze({
        map: { label: 'BaseColor', color: true },
        normalMap: { label: 'Normal', color: false },
        roughnessMap: { label: 'Roughness', color: false },
        metalnessMap: { label: 'Metalness', color: false },
        aoMap: { label: 'AO', color: false },
        emissiveMap: { label: 'Emissive', color: true },
        alphaMap: { label: 'Opacity', color: false },
        displacementMap: { label: 'Height', color: false },
        bumpMap: { label: 'Bump', color: false },
        lightMap: { label: 'Lightmap', color: false },
        clearcoatMap: { label: 'Clearcoat', color: false },
        clearcoatRoughnessMap: { label: 'ClearcoatRoughness', color: false },
        clearcoatNormalMap: { label: 'ClearcoatNormal', color: false },
        transmissionMap: { label: 'Transmission', color: false },
        thicknessMap: { label: 'Thickness', color: false },
        specularIntensityMap: { label: 'Specular', color: false },
        specularColorMap: { label: 'SpecularColor', color: true }
    });

    const SLOT_TO_SEMANTIC = Object.freeze({
        map: 'baseColor',
        normalMap: 'normal',
        roughnessMap: 'roughness',
        metalnessMap: 'metallic',
        aoMap: 'occlusion',
        emissiveMap: 'emissive',
        alphaMap: 'alpha',
        displacementMap: 'height',
        bumpMap: 'bump',
        clearcoatMap: 'clearcoat',
        clearcoatRoughnessMap: 'clearcoatRoughness',
        clearcoatNormalMap: 'clearcoatNormal',
        transmissionMap: 'transmission',
        thicknessMap: 'thickness',
        specularIntensityMap: 'specular',
        specularColorMap: 'specularColor'
    });

    function safeName(value, fallback = 'Texture') {
        const cleaned = String(value || fallback)
            .replace(/\.[a-z0-9]{1,6}$/i, '')
            .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned || fallback;
    }

    function extensionForMime(type) {
        const mime = String(type || '').toLowerCase();
        if (mime.includes('jpeg')) return '.jpg';
        if (mime.includes('webp')) return '.webp';
        if (mime.includes('bmp')) return '.bmp';
        if (mime.includes('gif')) return '.gif';
        return '.png';
    }

    function makeFile(blob, name) {
        const fileName = String(name || 'Texture.png');
        if (typeof File === 'function') {
            return new File([blob], fileName, {
                type: blob.type || 'image/png',
                lastModified: Date.now()
            });
        }
        const out = new Blob([blob], { type: blob.type || 'image/png' });
        Object.defineProperty(out, 'name', { configurable: true, value: fileName });
        Object.defineProperty(out, 'lastModified', { configurable: true, value: Date.now() });
        return out;
    }

    function dimensionsOf(image) {
        return {
            width: Number(image?.naturalWidth || image?.videoWidth || image?.width || 0),
            height: Number(image?.naturalHeight || image?.videoHeight || image?.height || 0)
        };
    }

    async function canvasToBlob(canvas) {
        if (!canvas) return null;
        if (typeof canvas.convertToBlob === 'function') {
            try {
                return await canvas.convertToBlob({ type: 'image/png' });
            } catch (_) {}
        }
        if (typeof canvas.toBlob === 'function') {
            return await new Promise(resolve => {
                try {
                    canvas.toBlob(resolve, 'image/png', 1);
                } catch (_) {
                    resolve(null);
                }
            });
        }
        if (typeof canvas.toDataURL === 'function') {
            try {
                const dataURL = canvas.toDataURL('image/png');
                return await (await fetch(dataURL)).blob();
            } catch (_) {}
        }
        return null;
    }

    function drawImageToCanvas(image, width, height) {
        if (!global.document?.createElement || !width || !height) return null;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) return null;
        try {
            ctx.drawImage(image, 0, 0, width, height);
            return canvas;
        } catch (_) {
            return null;
        }
    }

    function dataTextureCanvas(image) {
        const width = Number(image?.width || 0);
        const height = Number(image?.height || 0);
        const source = image?.data;
        if (!width || !height || !source || !global.document?.createElement) return null;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const count = width * height * 4;
        const rgba = new Uint8ClampedArray(count);

        if (source.length >= count) {
            for (let i = 0; i < count; i++) {
                const value = Number(source[i]);
                rgba[i] = Number.isFinite(value)
                    ? (value <= 1 && source instanceof Float32Array ? Math.round(value * 255) : Math.max(0, Math.min(255, Math.round(value))))
                    : 0;
            }
        } else if (source.length >= width * height * 3) {
            for (let p = 0, s = 0; p < count; p += 4, s += 3) {
                rgba[p] = source[s] ?? 0;
                rgba[p + 1] = source[s + 1] ?? 0;
                rgba[p + 2] = source[s + 2] ?? 0;
                rgba[p + 3] = 255;
            }
        } else {
            return null;
        }

        try {
            ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
            return canvas;
        } catch (_) {
            return null;
        }
    }

    class SMBlenderTextureBridge {
        constructor() {
            this.lastResult = null;
        }

        collect(root) {
            const byUUID = new Map();
            if (!root?.traverse) return byUUID;

            root.traverse(object => {
                if (!object?.isMesh) return;
                const materials = Array.isArray(object.material)
                    ? object.material
                    : [object.material];

                for (const material of materials) {
                    if (!material) continue;
                    for (const [slot, info] of Object.entries(SLOT_INFO)) {
                        const texture = material[slot];
                        if (!texture?.isTexture) continue;
                        const key = texture.uuid || `${material.uuid}:${slot}`;
                        let record = byUUID.get(key);
                        if (!record) {
                            record = {
                                key,
                                texture,
                                slots: new Set(),
                                materials: new Set(),
                                preferredLabel: info.label,
                                color: info.color
                            };
                            byUUID.set(key, record);
                        }
                        record.slots.add(slot);
                        record.materials.add(material.name || material.uuid || 'Material');
                        if (info.color) record.color = true;
                    }
                }
            });

            return byUUID;
        }

        _metadataForRecord(record, metadata) {
            const materialRecords = Array.isArray(metadata?.materials)
                ? metadata.materials
                : [];
            const materialNames = record?.materials || new Set();
            const semantics = new Set(
                [...(record?.slots || [])]
                    .map(slot => SLOT_TO_SEMANTIC[slot])
                    .filter(Boolean)
            );

            for (const material of materialRecords) {
                if (materialNames.size && !materialNames.has(material?.name)) continue;
                const textures = Array.isArray(material?.textures) ? material.textures : [];
                const match = textures.find(texture =>
                    semantics.has(texture?.semantic) ||
                    texture?.image?.name === record?.texture?.name ||
                    texture?.label === record?.texture?.name
                );
                if (match) return match;
            }
            return null;
        }

        configureRuntimeTexture(texture, record = null, options = {}) {
            if (!texture?.isTexture) return false;
            const isColor = record?.color === true;
            const three = global.THREE || {};

            if ('colorSpace' in texture) {
                if (isColor && three.SRGBColorSpace) texture.colorSpace = three.SRGBColorSpace;
                else if (!isColor && three.NoColorSpace !== undefined) texture.colorSpace = three.NoColorSpace;
            } else if ('encoding' in texture && isColor && three.sRGBEncoding) {
                texture.encoding = three.sRGBEncoding;
            }

            // GLB texture coordinates use glTF's UV convention. Re-flipping here
            // creates the common Blender texture-upside-down regression.
            if (options.gltf !== false) texture.flipY = false;

            const renderer = options.renderer || global.renderer || null;
            const maxAnisotropy = Number(renderer?.capabilities?.getMaxAnisotropy?.()) || 1;
            texture.anisotropy = Math.min(
                maxAnisotropy,
                Math.max(
                    Number(texture.anisotropy) || 1,
                    Number(options.maxAnisotropy) || 8
                )
            );
            texture.userData ||= {};
            texture.userData.smBlender ||= {};
            Object.assign(texture.userData.smBlender, {
                imported: true,
                slots: [...(record?.slots || [])],
                materialNames: [...(record?.materials || [])],
                colorTexture: isColor,
                metadata: options.metadataRecord || null
            });
            texture.needsUpdate = true;
            return true;
        }

        prepareRuntime(root, options = {}) {
            const records = this.collect(root);
            let configured = 0;
            for (const record of records.values()) {
                const metadataRecord = this._metadataForRecord(record, options.metadata);
                if (this.configureRuntimeTexture(record.texture, record, {
                    ...options,
                    metadataRecord
                })) configured++;
            }
            const result = { total: records.size, configured, records };
            root.userData ||= {};
            root.userData.smBlenderTextures = {
                total: result.total,
                configured: result.configured
            };
            return result;
        }

        async _blobFromTexture(texture) {
            const image = texture?.image || texture?.source?.data || null;
            if (!image) return null;

            if (typeof Blob !== 'undefined' && image instanceof Blob) {
                return image;
            }

            const src = typeof image?.src === 'string' ? image.src : '';
            if (src && /^(data:|blob:|file:|https?:)/i.test(src)) {
                try {
                    const response = await fetch(src, { cache: 'no-store' });
                    if (response.ok) return await response.blob();
                } catch (_) {}
            }

            const { width, height } = dimensionsOf(image);
            if (width && height) {
                const canvas = drawImageToCanvas(image, width, height);
                const blob = await canvasToBlob(canvas);
                if (blob) return blob;
            }

            const dataCanvas = dataTextureCanvas(image);
            return await canvasToBlob(dataCanvas);
        }

        _nameForRecord(record, index) {
            const textureName = safeName(record.texture?.name || '', '');
            if (textureName && !/^texture(_|\s|$)/i.test(textureName)) {
                return textureName;
            }
            const materialName = safeName([...record.materials][0] || 'Material');
            return `${materialName}_${record.preferredLabel || `Texture_${index + 1}`}`;
        }

        async _addTextureAsset(panel, file, folderId) {
            const before = new Set((panel.assets || []).map(asset => asset.id));
            const direct = await panel._addAssetFromFile(file, folderId);
            if (direct) return direct;
            return (panel.assets || []).find(asset => !before.has(asset.id)) || null;
        }

        async extract(root, options = {}) {
            const panel = options.panel || global.AssetsPanel || null;
            if (!panel?._addAssetFromFile) {
                throw new Error('SMBlenderTextureBridge: AssetsPanel._addAssetFromFile() is unavailable.');
            }

            const folderId = options.folderId ?? null;
            const records = this.collect(root);
            const byUUID = new Map();
            const assets = [];
            const failed = [];

            let index = 0;
            for (const record of records.values()) {
                const baseName = this._nameForRecord(record, index++);
                try {
                    const metadataRecord = this._metadataForRecord(record, options.metadata);
                    this.configureRuntimeTexture(record.texture, record, {
                        renderer: options.renderer,
                        metadataRecord
                    });
                    const blob = await this._blobFromTexture(record.texture);
                    if (!blob) {
                        failed.push({
                            textureUUID: record.texture?.uuid || null,
                            name: baseName,
                            reason: 'Texture image could not be converted to a Blob.'
                        });
                        continue;
                    }

                    const fileName = `${safeName(baseName)}${extensionForMime(blob.type)}`;
                    const file = makeFile(blob, fileName);
                    const asset = await this._addTextureAsset(panel, file, folderId);
                    if (!asset) {
                        failed.push({
                            textureUUID: record.texture?.uuid || null,
                            name: baseName,
                            reason: 'AssetsPanel did not return/create a texture asset.'
                        });
                        continue;
                    }

                    asset.sourceType = 'blender-texture-extract';
                    asset.sourceFormat = 'blend-embedded-texture';
                    asset.blenderTextureUUID = record.texture?.uuid || null;
                    asset.blenderTextureName = record.texture?.name || null;
                    asset.blenderTextureSlots = [...record.slots];
                    asset.blenderMaterialNames = [...record.materials];
                    asset.blenderColorTexture = record.color === true;
                    asset.blenderSourcePath = options.sourcePath || null;
                    asset.blenderTextureMetadata = metadataRecord;
                    asset.textureSettings = {
                        colorSpace: record.texture?.colorSpace || null,
                        flipY: record.texture?.flipY === true,
                        wrapS: record.texture?.wrapS ?? null,
                        wrapT: record.texture?.wrapT ?? null,
                        repeat: record.texture?.repeat
                            ? [record.texture.repeat.x, record.texture.repeat.y]
                            : [1, 1],
                        offset: record.texture?.offset
                            ? [record.texture.offset.x, record.texture.offset.y]
                            : [0, 0],
                        rotation: Number(record.texture?.rotation) || 0,
                        dimensions: dimensionsOf(record.texture?.image || record.texture?.source?.data)
                    };
                    asset.tags = [...new Set([
                        ...(asset.tags || []),
                        'blender',
                        'texture',
                        'embedded'
                    ])];

                    record.texture.userData ||= {};
                    record.texture.userData.smAssetId = asset.id;
                    record.texture.userData.smBlenderExtracted = true;

                    const entry = {
                        texture: record.texture,
                        asset,
                        assetId: asset.id,
                        slots: [...record.slots],
                        materialNames: [...record.materials],
                        color: record.color === true
                    };
                    byUUID.set(record.key, entry);
                    if (record.texture?.uuid) byUUID.set(record.texture.uuid, entry);
                    assets.push(asset);
                } catch (error) {
                    failed.push({
                        textureUUID: record.texture?.uuid || null,
                        name: baseName,
                        reason: error?.message || String(error)
                    });
                    console.warn('[SMBlenderTextureBridge] Texture extraction failed:', baseName, error);
                }
            }

            panel._saveToStorage?.();
            panel.render?.();
            panel._buildTagCloud?.();

            const result = {
                total: records.size,
                extracted: assets.length,
                failed,
                assets,
                byUUID
            };
            this.lastResult = result;

            global.dispatchEvent?.(new CustomEvent('sm:blender-textures-extracted', {
                detail: {
                    total: result.total,
                    extracted: result.extracted,
                    failed: result.failed,
                    assets: result.assets
                }
            }));

            return result;
        }
    }

    global.SMBlenderTextureBridge = SMBlenderTextureBridge;
    global.smBlenderTextureBridge = new SMBlenderTextureBridge();
    console.log('[SMBlenderTextureBridge] Ready.');
})(window);
