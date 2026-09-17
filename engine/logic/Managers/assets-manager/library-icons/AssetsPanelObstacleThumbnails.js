// engine/logic/Managers/assets-manager/AssetsPanelObstacleThumbnails.js
// SM Engine - real 3D thumbnails for Blockout Obstacles.
(function (global) {
    'use strict';

    if (global.SMAssetsPanelObstacleThumbnails?.version) return;

    const CFG = Object.freeze({
        version: 1,
        size: 256,
        quality: 0.88,
        cachePrefix: 'sm:obstacle-thumb:v1:',
        retryMs: 250,
        maxRetries: 240
    });

    const state = {
        cache: new Map(),
        pending: new Set(),
        queue: [],
        draining: false,
        renderer: null,
        refreshTimer: 0,
        retries: 0,
        installed: false
    };

    const panel = () => global.AssetsPanel || null;
    const library = () => global.SMGameObstacleLibrary || null;
    const THREE = () => global.THREE || null;

    function cacheKey(id) {
        return `${CFG.cachePrefix}${library()?.version ?? 0}:${id}`;
    }

    function fallback(name = 'Obstacle') {
        const label = String(name).replace(/[<>&'"]/g, '').slice(0, 20);
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#2a2d33"/><stop offset="1" stop-color="#15171b"/>
</linearGradient>
</defs>
<rect width="256" height="256" rx="18" fill="url(#bg)"/>
<path d="M62 105 128 67l66 38-66 39z" fill="#a4acb7"/>
<path d="M62 105v70l66 38v-69z" fill="#606976"/>
<path d="M194 105v70l-66 38v-69z" fill="#7c8693"/>
<path d="M62 105 128 67l66 38-66 39-66-39zm0 0v70l66 38 66-38v-70m-66 39v69"
fill="none" stroke="#d9dde3" stroke-width="4" stroke-linejoin="round"/>
<rect x="24" y="214" width="208" height="26" rx="7" fill="#0c0e11" opacity=".82"/>
<text x="128" y="232" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif"
font-size="13" font-weight="700" fill="#eef1f4">${label}</text>
</svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    function loadCache(id) {
        const key = String(id);
        if (state.cache.has(key)) return state.cache.get(key);

        try {
            const value = localStorage.getItem(cacheKey(key));
            if (value?.startsWith('data:image/')) {
                state.cache.set(key, value);
                return value;
            }
        } catch (_) {}

        return null;
    }

    function saveCache(id, image) {
        const key = String(id);
        state.cache.set(key, image);
        try {
            localStorage.setItem(cacheKey(key), image);
        } catch (_) {}
    }

    function definitionFor(id) {
        return library()?.assets?.find(
            item => String(item?.id) === String(id)
        ) || null;
    }

    function createObstacle(id) {
        const lib = library();
        const def = definitionFor(id);
        if (!lib || !def) return null;

        if (typeof lib.create === 'function') {
            const object = lib.create(def.id);
            if (object) return object;
        }

        if (typeof def.factory === 'function') return def.factory();
        if (typeof def.create === 'function') return def.create();
        return null;
    }

   
    function destroyRenderer() {
        const renderer = state.renderer;
        if (!renderer) return;

        try {
            const gl = renderer.getContext?.();
            gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
        } catch (_) {}

        try { renderer.dispose?.(); } catch (_) {}
        state.renderer = null;
    }

    function previewMaterial(T, source) {
        let mat;

        try {
            mat = source?.clone?.();
        } catch (_) {}

        if (!mat) {
            mat = new T.MeshStandardMaterial({
                color: source?.color?.clone?.() || 0x77818e,
                roughness: 0.7,
                metalness: 0.02
            });
        }

        for (const key of [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap',
            'aoMap', 'emissiveMap', 'alphaMap'
        ]) {
            const tex = mat[key];
            if (tex && !tex.image && !tex.source?.data) mat[key] = null;
        }

        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
            mat.roughness = Math.max(0.35, Number(mat.roughness ?? 0.7));
            mat.metalness = Math.min(0.2, Number(mat.metalness ?? 0));
        }

        if ('side' in mat && T.DoubleSide !== undefined) mat.side = T.DoubleSide;
        mat.needsUpdate = true;
        return mat;
    }

    function prepareObject(T, object) {
        const materials = [];
        object.traverse?.(node => {
            if (!node?.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;

            if (Array.isArray(node.material)) {
                node.material = node.material.map(m => {
                    const copy = previewMaterial(T, m);
                    materials.push(copy);
                    return copy;
                });
            } else {
                const copy = previewMaterial(T, node.material);
                node.material = copy;
                materials.push(copy);
            }
        });
        return materials;
    }

    function disposeObject(object, materials) {
        const geometries = new Set();

        object?.traverse?.(node => {
            if (node?.geometry) geometries.add(node.geometry);
        });

        for (const geo of geometries) {
            try { geo.dispose?.(); } catch (_) {}
        }

        for (const mat of materials) {
            try { mat.dispose?.(); } catch (_) {}
        }
    }

    async function renderOne(id) {
        const T = THREE();
        const def = definitionFor(id);
        if (!T || !def) throw new Error(`Unknown obstacle: ${id}`);

        const object = createObstacle(id);
        if (!object) throw new Error(`Obstacle factory failed: ${id}`);

        const renderer = ensureRenderer();
        const materials = prepareObject(T, object);

        let ground = null;

        try {
            const scene = new T.Scene();
            const root = new T.Group();
            root.add(object);
            scene.add(root);

            object.updateMatrixWorld?.(true);

            const box = new T.Box3().setFromObject(object);
            if (box.isEmpty()) throw new Error('Obstacle has empty bounds.');

            const size = box.getSize(new T.Vector3());
            const center = box.getCenter(new T.Vector3());
            const sphere = box.getBoundingSphere(new T.Sphere());

            const radius = Math.max(
                sphere.radius || 0,
                Math.max(size.x, size.y, size.z) * 0.5,
                0.25
            );

            root.position.copy(center).multiplyScalar(-1);

            scene.add(new T.HemisphereLight(0xf2f6ff, 0x20242a, 1.7));

            const key = new T.DirectionalLight(0xffffff, 2.5);
            key.position.set(radius * 2.5, radius * 3.3, radius * 2.7);
            key.castShadow = true;
            if (key.shadow?.mapSize) key.shadow.mapSize.set(512, 512);
            scene.add(key);

            const fill = new T.DirectionalLight(0x9fbaff, 0.8);
            fill.position.set(-radius * 2, radius * 1.6, radius * 1.5);
            scene.add(fill);

            if (T.ShadowMaterial && T.PlaneGeometry) {
                ground = new T.Mesh(
                    new T.PlaneGeometry(radius * 7, radius * 7),
                    new T.ShadowMaterial({
                        color: 0x000000,
                        opacity: 0.24,
                        transparent: true
                    })
                );
                ground.rotation.x = -Math.PI / 2;
                ground.position.y = -(size.y * 0.5) - Math.max(0.01, radius * 0.015);
                ground.receiveShadow = true;
                scene.add(ground);
            }

            const camera = new T.PerspectiveCamera(36, 1, 0.01, 10000);
            const fov = T.MathUtils.degToRad(camera.fov * 0.5);
            const distance = (radius / Math.sin(fov)) * 1.12;
            const direction = new T.Vector3(1.28, 0.92, 1.48).normalize();

            camera.position.copy(direction.multiplyScalar(distance));
            camera.near = Math.max(0.01, distance - radius * 2.5);
            camera.far = distance + radius * 4.5;
            camera.lookAt(0, Math.min(radius * 0.1, size.y * 0.035), 0);
            camera.updateProjectionMatrix();

            scene.updateMatrixWorld?.(true);
            renderer.setClearColor(0x000000, 0);
            renderer.clear?.(true, true, true);
            renderer.render(scene, camera);

            let data;
            try {
                data = renderer.domElement.toDataURL('image/webp', CFG.quality);
            } catch (_) {
                data = renderer.domElement.toDataURL('image/png');
            }

            if (!data?.startsWith('data:image/')) {
                throw new Error('Invalid thumbnail image.');
            }

            return data;
        } finally {
            if (ground) {
                try { ground.geometry?.dispose?.(); } catch (_) {}
                try { ground.material?.dispose?.(); } catch (_) {}
            }
            disposeObject(object, materials);
        }
    }

    function refreshPanel() {
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(() => {
            try { panel()?.render?.(); } catch (_) {}
        }, 70);
    }

    async function drain() {
        if (state.draining) return;
        state.draining = true;

        try {
            while (state.queue.length) {
                const id = state.queue.shift();
                const def = definitionFor(id);

                try {
                    const image = await renderOne(id);
                    saveCache(id, image);
                } catch (error) {
                    console.warn(
                        `[SM Obstacle Thumbnails] "${def?.name || id}" failed:`,
                        error
                    );
                    state.cache.set(String(id), fallback(def?.name || id));
                } finally {
                    state.pending.delete(String(id));
                }

                refreshPanel();

                await new Promise(resolve => {
                    if (global.requestAnimationFrame) {
                        global.requestAnimationFrame(() => resolve());
                    } else {
                        setTimeout(resolve, 0);
                    }
                });
            }
        } finally {
            state.draining = false;
            setTimeout(destroyRenderer, 250);
        }
    }

    function queue(id) {
        const key = String(id);
        if (!key || state.pending.has(key) || loadCache(key)) return false;

        state.pending.add(key);
        state.queue.push(key);
        drain();
        return true;
    }

    function decorate(items) {
        if (!Array.isArray(items)) return items;

        for (const asset of items) {
            if (!asset) continue;

            const isObstacle =
                asset.type === 'obstacle' ||
                asset.folderId === 'sme_game_obstacles';

            if (!isObstacle) continue;

            const cached = loadCache(asset.id);

            if (cached) {
                asset.thumbnail = cached;
                asset.thumbnailGenerated = true;
                asset.thumbnailKind = 'obstacle-3d';
            } else {
                asset.thumbnail = fallback(asset.name);
                asset.thumbnailGenerated = false;
                asset.thumbnailKind = 'obstacle-pending';
                queue(asset.id);
            }
        }

        return items;
    }

    function install() {
        state.retries++;

        const P = panel();
        const L = library();

        if (
            P &&
            L &&
            THREE() &&
            typeof P._getGameObstacleAssets === 'function'
        ) {
            if (!P._getGameObstacleAssets.__smObstacleThumbPatched) {
                const original = P._getGameObstacleAssets;

                const wrapped = function (...args) {
                    return decorate(original.apply(this, args));
                };

                Object.defineProperty(
                    wrapped,
                    '__smObstacleThumbPatched',
                    { value: true }
                );

                Object.defineProperty(
                    wrapped,
                    '__smObstacleThumbOriginal',
                    { value: original }
                );

                P._getGameObstacleAssets = wrapped;
            }

            state.installed = true;
            refreshPanel();

            console.log(
                '[SM Obstacle Thumbnails] Installed.'
            );

            return true;
        }

        if (state.retries < CFG.maxRetries) {
            setTimeout(install, CFG.retryMs);
        }

        return false;
    }

    function generateAll({ force = false } = {}) {
        const defs = library()?.assets || [];
        let count = 0;

        for (const def of defs) {
            if (!def?.id) continue;
            const id = String(def.id);

            if (force) {
                state.cache.delete(id);
                state.pending.delete(id);
                try { localStorage.removeItem(cacheKey(id)); } catch (_) {}
            }

            if (queue(id)) count++;
        }

        refreshPanel();
        return count;
    }

    async function regenerate(id) {
        const key = String(id);
        state.cache.delete(key);
        state.pending.delete(key);
        state.queue = state.queue.filter(v => v !== key);
        try { localStorage.removeItem(cacheKey(key)); } catch (_) {}

        const image = await renderOne(key);
        saveCache(key, image);
        refreshPanel();
        setTimeout(destroyRenderer, 250);
        return image;
    }

    function clearCache() {
        state.cache.clear();
        state.pending.clear();
        state.queue.length = 0;

        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(CFG.cachePrefix)) keys.push(key);
            }
            keys.forEach(key => localStorage.removeItem(key));
        } catch (_) {}

        refreshPanel();
    }

    global.SMAssetsPanelObstacleThumbnails = {
        version: CFG.version,
        install,
        applyAll: () => {
            install();
            return generateAll();
        },
        generateAll,
        regenerate,
        clearCache,
        renderOne,
        status: () => ({
            installed: state.installed,
            libraryAssets: library()?.assets?.length || 0,
            cached: state.cache.size,
            pending: state.pending.size,
            queued: state.queue.length,
            draining: state.draining
        })
    };

    install();

    document.addEventListener?.(
        'DOMContentLoaded',
        () => install(),
        { once: true }
    );
})(typeof window !== 'undefined' ? window : globalThis);