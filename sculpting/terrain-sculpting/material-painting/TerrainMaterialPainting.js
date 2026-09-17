// SM Engine - terrain material painting compatibility layer.
//
// TerrainBrushes owns the world-space brush gesture. This module owns the
// terrain-local RGBA weight field and the small shader hook that exposes it to
// materials. The API intentionally stays independent from AssetsPanel so the
// terrain test/runtime can work with procedural materials as well.

(() => {
    'use strict';

    const NS = window.TerrainSculpting;
    const THREE_REF = window.THREE;

    if (!NS || !THREE_REF) {
        throw new Error(
            'TerrainState.js and THREE are required before TerrainMaterialPainting.js.'
        );
    }

    if (NS.materialPainting) return;

    const LAYER_INFO = Object.freeze({
        auto: { index: 0, label: 'Auto' },
        soil: { index: 1, label: 'Soil' },
        rock: { index: 2, label: 'Rock' },
        gravel: { index: 3, label: 'Gravel' }
    });

    const hookedMaterials = new WeakSet();

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value) || 0));
    }

    function getDimensions(terrain) {
        const data = terrain?.userData?.terrainData || {};
        return {
            width: Math.max(0.0001, Number(data.width) || 100),
            length: Math.max(0.0001, Number(data.length) || 100)
        };
    }

    function createTexture(resolution, weights) {
        const bytes = new Uint8Array(weights.length);
        const texture = new THREE_REF.DataTexture(
            bytes,
            resolution,
            resolution,
            THREE_REF.RGBAFormat,
            THREE_REF.UnsignedByteType
        );
        texture.name = 'SM_TerrainMaterialWeights';
        texture.flipY = false;
        texture.wrapS = THREE_REF.ClampToEdgeWrapping;
        texture.wrapT = THREE_REF.ClampToEdgeWrapping;
        texture.minFilter = THREE_REF.LinearFilter;
        texture.magFilter = THREE_REF.LinearFilter;
        texture.generateMipmaps = false;
        if ('colorSpace' in texture && THREE_REF.NoColorSpace !== undefined) {
            texture.colorSpace = THREE_REF.NoColorSpace;
        }
        texture.needsUpdate = true;
        return { texture, bytes };
    }

    function syncTexture(data) {
        for (let i = 0; i < data.weights.length; i++) {
            data.texture.image.data[i] = Math.round(
                clamp(data.weights[i], 0, 1) * 255
            );
        }
        data.texture.needsUpdate = true;
    }

    function materialsFor(terrain) {
        const materials = new Set();

        if (terrain?.userData?.sharedMaterial) {
            const shared = terrain.userData.sharedMaterial;
            (Array.isArray(shared) ? shared : [shared]).forEach(material => {
                if (material) materials.add(material);
            });
        }

        if (terrain?.material) {
            (Array.isArray(terrain.material) ? terrain.material : [terrain.material])
                .forEach(material => {
                    if (material) materials.add(material);
                });
        }

        terrain?.traverse?.(object => {
            if (!object?.isMesh || !object.material) return;
            (Array.isArray(object.material) ? object.material : [object.material])
                .forEach(material => {
                    if (material) materials.add(material);
                });
        });

        return [...materials];
    }

    function installMaterialHook(material, data) {
        if (!material || hookedMaterials.has(material)) return;

        const previous = material.onBeforeCompile;
        material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
            if (typeof previous === 'function') {
                previous.call(this, shader, renderer);
            }

            shader.uniforms ||= {};
            shader.uniforms.uSMPaintWeights = { value: data.texture };

            if (!shader.vertexShader.includes('vSMPaintUV')) {
                shader.vertexShader =
                    'varying vec2 vSMPaintUV;\n' +
                    shader.vertexShader.replace(
                        '#include <uv_vertex>',
                        '#include <uv_vertex>\n vSMPaintUV = uv;'
                    );
            }

            if (!shader.fragmentShader.includes('uSMPaintWeights')) {
                shader.fragmentShader =
                    'uniform sampler2D uSMPaintWeights;\n' +
                    'varying vec2 vSMPaintUV;\n' +
                    shader.fragmentShader;
            }

            if (!shader.fragmentShader.includes('smTerrainPaintWeights')) {
                shader.fragmentShader +=
                    '\nvec4 smAutoWeights = vec4(1.0, 0.0, 0.0, 0.0);\n' +
                    'vec4 smManualWeights = texture2D(uSMPaintWeights, vSMPaintUV);\n' +
                    'vec4 smTerrainPaintWeights = mix(smAutoWeights, smManualWeights, smManualWeights.a);\n';
            }
        };

        material.userData ||= {};
        material.userData.smTerrainPaintShaderInstalled = true;
        material.needsUpdate = true;
        hookedMaterials.add(material);
    }

    function ensureForTerrain(terrain) {
        if (!terrain) return null;

        terrain.userData ||= {};
        let data = terrain.userData.smTerrainMaterialPainting;
        const resolution = Math.max(
            16,
            Math.min(
                2048,
                Math.round(Number(NS.state?.materialPaintResolution) || 512)
            )
        );

        if (!data || data.resolution !== resolution) {
            const weights = new Float32Array(resolution * resolution * 4);
            for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
            const created = createTexture(resolution, weights);
            data = {
                version: 1,
                resolution,
                width: getDimensions(terrain).width,
                length: getDimensions(terrain).length,
                weights,
                texture: created.texture,
                bytes: created.bytes,
                dirtyVersion: 0
            };
            terrain.userData.smTerrainMaterialPainting = data;
        }

        materialsFor(terrain).forEach(material => installMaterialHook(material, data));
        return data;
    }

    function resolveUV(worldPoint, terrain, data) {
        const local = worldPoint?.clone?.() || new THREE_REF.Vector3();
        terrain?.worldToLocal?.(local);
        return {
            u: clamp((local.x + data.width * 0.5) / data.width, 0, 1),
            v: clamp((local.z + data.length * 0.5) / data.length, 0, 1)
        };
    }

    function pixelIndex(data, x, y) {
        return (y * data.resolution + x) * 4;
    }

    function sampleAtWorldPoint(worldPoint, terrain = null) {
        const target = terrain || NS.getLandscape?.() || window.terrain;
        const data = ensureForTerrain(target);
        if (!data) return { auto: 1, soil: 0, rock: 0, gravel: 0 };

        const uv = resolveUV(worldPoint, target, data);
        const x = Math.min(data.resolution - 1, Math.round(uv.u * (data.resolution - 1)));
        const y = Math.min(data.resolution - 1, Math.round(uv.v * (data.resolution - 1)));
        const index = pixelIndex(data, x, y);
        return {
            auto: data.weights[index],
            soil: data.weights[index + 1],
            rock: data.weights[index + 2],
            gravel: data.weights[index + 3]
        };
    }

    function paintAtWorldPoint(worldPoint, options = {}) {
        const terrain = options.terrain || NS.getLandscape?.() || window.terrain;
        const data = ensureForTerrain(terrain);
        if (!data) return false;

        const layerName = String(
            NS.state?.materialPaintLayer || 'soil'
        ).toLowerCase();
        const layer = LAYER_INFO[layerName] || LAYER_INFO.soil;
        const radius = Math.max(0.0001, Number(options.radius) || 1);
        const strength = clamp(options.strength ?? NS.state?.brushStrength ?? 0.25, 0, 1);
        const flow = clamp(NS.state?.materialPaintFlow ?? 1, 0, 1);
        const opacity = clamp(NS.state?.materialPaintOpacity ?? 1, 0, 1);
        const uv = resolveUV(worldPoint, terrain, data);
        const radiusU = radius / data.width;
        const radiusV = radius / data.length;
        const minX = Math.max(0, Math.floor((uv.u - radiusU) * data.resolution));
        const maxX = Math.min(data.resolution - 1, Math.ceil((uv.u + radiusU) * data.resolution));
        const minY = Math.max(0, Math.floor((uv.v - radiusV) * data.resolution));
        const maxY = Math.min(data.resolution - 1, Math.ceil((uv.v + radiusV) * data.resolution));
        const sign = options.erase ? -1 : 1;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const dx = ((x / Math.max(1, data.resolution - 1)) - uv.u) / Math.max(radiusU, 1 / data.resolution);
                const dy = ((y / Math.max(1, data.resolution - 1)) - uv.v) / Math.max(radiusV, 1 / data.resolution);
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > 1) continue;

                const falloff = (1 - distance) * (1 - distance);
                const amount = strength * flow * opacity * falloff;
                const index = pixelIndex(data, x, y);
                const next = clamp(data.weights[index + layer.index] + sign * amount, 0, 1);
                data.weights[index + layer.index] = next;

                let manual = 0;
                for (let channel = 1; channel < 4; channel++) {
                    manual += data.weights[index + channel];
                }
                if (manual > 1) {
                    const scale = 1 / manual;
                    for (let channel = 1; channel < 4; channel++) {
                        data.weights[index + channel] *= scale;
                    }
                    manual = 1;
                }
                data.weights[index] = 1 - manual;
            }
        }

        data.dirtyVersion++;
        syncTexture(data);
        window.dispatchEvent?.(new CustomEvent('sm:terrain-material-painted', {
            detail: { terrain, layer: layerName, erase: !!options.erase, version: data.dirtyVersion }
        }));
        return true;
    }

    NS.materialPainting = Object.freeze({
        LAYER_INFO,
        ensureForTerrain,
        sampleAtWorldPoint,
        paintAtWorldPoint
    });
})();
