(function () {
    'use strict';
    const registry = window.smAIToolRegistry;
    if (!registry) return;
    const terrain = () => window.terrain || window.scene?.getObjectByName?.('Terrain_Mesh') || window.scene?.getObjectByName?.('Terrain');
    const PALETTES = {
        grassland: ['#4a3b2a', '#5f7440', '#80925a', '#88857a'],
        rocky: ['#302e2b', '#55514b', '#77736b', '#aaa69d'],
        desert: ['#765031', '#a87645', '#c59a63', '#dfc58d'],
        snow: ['#48525b', '#747f86', '#bdc5c7', '#f0f2ef'],
        volcanic: ['#161719', '#29292a', '#48433e', '#74685a']
    };
    const toRGB = (hex) => {
        const value = Number.parseInt(String(hex).replace('#', ''), 16);
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    };
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (value) => value * value * (3 - 2 * value);
    const hash = (x, y, seed) => {
        let value = Math.imul(x ^ seed, 374761393) + Math.imul(y ^ (seed * 31), 668265263);
        value = Math.imul(value ^ (value >>> 13), 1274126177);
        return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    };
    const periodicNoise = (u, v, cells, seed) => {
        const px = u * cells;
        const py = v * cells;
        const x0 = Math.floor(px) % cells;
        const y0 = Math.floor(py) % cells;
        const x1 = (x0 + 1) % cells;
        const y1 = (y0 + 1) % cells;
        const tx = smooth(px - Math.floor(px));
        const ty = smooth(py - Math.floor(py));
        const top = mix(hash(x0, y0, seed), hash(x1, y0, seed), tx);
        const bottom = mix(hash(x0, y1, seed), hash(x1, y1, seed), tx);
        return mix(top, bottom, ty);
    };
    const fbm = (u, v, seed) => {
        let value = 0;
        let weight = 0.55;
        let total = 0;
        for (let octave = 0; octave < 5; octave += 1) {
            value += periodicNoise(u, v, 4 * (2 ** octave), seed + octave * 101) * weight;
            total += weight;
            weight *= 0.5;
        }
        return value / total;
    };
    const makeTerrainTexture = ({ preset, resolution, repeat, seed }) => {
        const canvas = document.createElement('canvas');
        canvas.width = resolution;
        canvas.height = resolution;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas texture generation is unavailable.');
        const image = context.createImageData(resolution, resolution);
        const colors = PALETTES[preset].map(toRGB);
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const u = x / resolution;
                const v = y / resolution;
                const broad = fbm(u, v, seed);
                const detail = periodicNoise(u, v, 64, seed + 701) - 0.5;
                const value = THREE.MathUtils.clamp(broad + detail * 0.12, 0, 0.999);
                const scaled = value * (colors.length - 1);
                const index = Math.floor(scaled);
                const blend = smooth(scaled - index);
                const next = Math.min(colors.length - 1, index + 1);
                const offset = (y * resolution + x) * 4;
                image.data[offset] = Math.round(mix(colors[index][0], colors[next][0], blend));
                image.data[offset + 1] = Math.round(mix(colors[index][1], colors[next][1], blend));
                image.data[offset + 2] = Math.round(mix(colors[index][2], colors[next][2], blend));
                image.data[offset + 3] = 255;
            }
        }
        context.putImageData(image, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.name = `AI_Terrain_${preset}`;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat, repeat);
        if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        else if ('encoding' in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
        const maxAnisotropy = window.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
        texture.anisotropy = Math.min(8, maxAnisotropy);
        texture.userData = { generatedBy: 'SMAI', preset, resolution, seed };
        texture.needsUpdate = true;
        return texture;
    };
    const editableTerrainMaterials = (object) => {
        const result = [];
        const seen = new Set();
        object?.traverse?.((child) => {
            if (!child?.isMesh || !child.material) return;
            const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
            childMaterials.forEach((material) => {
                if (material && !seen.has(material)) {
                    seen.add(material);
                    result.push(material);
                }
            });
        });
        if (object?.isMesh && !result.length && object.material) {
            (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => result.push(material));
        }
        return result;
    };

    registry.registerMany([
        {
            name: 'inspect_terrain', label: 'Inspect terrain', permission: 'read', description: 'Inspect the current landscape terrain and its generation metadata.',
            parameters: { type: 'object', properties: {} },
            execute: () => {
                const object = terrain();
                if (!object) return { exists: false };
                return { exists: true, terrain: window.smAIContextBuilder?.describeObject?.(object, true), settings: object.userData?.terrainSettings || object.userData?.generationSettings || null };
            }
        },
        {
            name: 'create_flat_terrain', label: 'Create flat terrain', permission: 'destructive',
            description: 'Generate a new completely flat terrain. This can replace the current terrain and always requires confirmation.',
            parameters: { type: 'object', properties: { componentsX: { type: 'integer' }, componentsZ: { type: 'integer' }, quadSize: { type: 'number' }, name: { type: 'string' } } },
            execute: async ({ componentsX = 4, componentsZ = 4, quadSize = 3.6, name = 'Terrain_Mesh' }) => {
                if (typeof window.createTerrain !== 'function') throw new Error('Terrain generator is not loaded.');
                const result = await Promise.resolve(window.createTerrain({
                    componentsX: THREE.MathUtils.clamp(Number(componentsX) || 4, 1, 16),
                    componentsZ: THREE.MathUtils.clamp(Number(componentsZ) || 4, 1, 16),
                    quadSize: THREE.MathUtils.clamp(Number(quadSize) || 3.6, 0.25, 25),
                    initialMode: 'flat', isDefault: false, flat: true, deformation: false, name
                }));
                const object = result?.isObject3D ? result : terrain();
                if (!object) throw new Error('Terrain generator did not return a terrain.');
                object.name = name;
                window.terrain = object;
                window.selectObject?.(object);
                return { created: window.smAIContextBuilder?.describeObject?.(object, true) };
            }
        },
        {
            name: 'create_terrain_texture', label: 'Create terrain texture', permission: 'mutate',
            description: 'Create and immediately apply a seamless procedural color texture to the current landscape terrain. Use this tool whenever the user asks to make, generate, texture, or improve the terrain surface.',
            parameters: {
                type: 'object',
                properties: {
                    preset: { type: 'string', enum: ['grassland', 'rocky', 'desert', 'snow', 'volcanic'], description: 'Terrain surface style.' },
                    resolution: { type: 'integer', description: 'Texture resolution. Use 256 normally and 512 for higher detail.' },
                    repeat: { type: 'number', description: 'How many times the texture tiles across the terrain.' },
                    seed: { type: 'integer', description: 'Deterministic variation seed.' }
                }
            },
            execute: ({ preset = 'grassland', resolution = 256, repeat = 8, seed = 1337 }) => {
                const object = terrain();
                if (!object) throw new Error('No landscape terrain was found in the scene.');
                const style = PALETTES[preset] ? preset : 'grassland';
                const size = THREE.MathUtils.clamp(Math.round(Number(resolution) || 256), 64, 512);
                const tileRepeat = THREE.MathUtils.clamp(Number(repeat) || 8, 0.25, 64);
                const textureSeed = Math.trunc(Number(seed) || 1337);
                const targetMaterials = editableTerrainMaterials(object);
                if (!targetMaterials.length) throw new Error('The terrain has no editable mesh material.');
                const texture = makeTerrainTexture({ preset: style, resolution: size, repeat: tileRepeat, seed: textureSeed });
                const before = targetMaterials.map((material) => ({
                    map: material.map || null,
                    color: material.color?.clone?.() || null,
                    roughness: material.roughness,
                    metalness: material.metalness
                }));
                const apply = () => targetMaterials.forEach((material) => {
                    material.map = texture;
                    material.color?.set?.(0xffffff);
                    if ('roughness' in material) material.roughness = style === 'snow' ? 0.72 : 0.92;
                    if ('metalness' in material) material.metalness = 0;
                    material.needsUpdate = true;
                });
                const restore = () => targetMaterials.forEach((material, index) => {
                    material.map = before[index].map;
                    if (before[index].color && material.color) material.color.copy(before[index].color);
                    if (before[index].roughness !== undefined) material.roughness = before[index].roughness;
                    if (before[index].metalness !== undefined) material.metalness = before[index].metalness;
                    material.needsUpdate = true;
                });
                apply();
                object.userData.aiTerrainTexture = { preset: style, resolution: size, repeat: tileRepeat, seed: textureSeed };
                window.historyManager?.recordCustomAction?.(`AI Terrain Texture ${style}`, '', restore, apply);
                window.smSceneManager?.notifyEntityChanged?.(object, 'aiTerrainTexture');
                return {
                    terrain: object.name || 'Terrain',
                    texture: texture.name,
                    preset: style,
                    resolution: size,
                    repeat: tileRepeat,
                    materialsUpdated: targetMaterials.length
                };
            }
        }
    ]);
}());
