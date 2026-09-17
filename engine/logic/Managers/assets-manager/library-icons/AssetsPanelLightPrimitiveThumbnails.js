// engine/logic/Managers/assets-manager/AssetsPanelLightPrimitiveThumbnails.js
// SM Engine - professional thumbnails for built-in Primitives + Lights.
//
// Primitives:
//   factory() -> real THREE.Object3D -> offscreen 3D render -> image thumbnail.
//
// Lights:
//   THREE.Light objects have no visible geometry by themselves, so this module
//   generates a dedicated visual thumbnail for each light type instead of
//   rendering an invisible Light object.
//
// Designed for the current AssetsPanel methods:
//   AssetsPanel._getPrimitiveAssets()
//   AssetsPanel._getLightAssets()
//
// No edits to AssetManager.js are required.

(function (global) {
    'use strict';

    if (global.SMAssetsPanelLightPrimitiveThumbnails?.version) return;

    const CFG = Object.freeze({
        version: 1,
        size: 256,
        quality: 0.9,
        cachePrefix: 'sm:asset-thumb:builtins:v1:',
        installRetryMs: 250,
        maxInstallRetries: 240,
        rendererIdleDisposeMs: 350,
        renderRefreshMs: 70
    });

    const state = {
        cache: new Map(),
        pending: new Set(),
        queue: [],
        draining: false,

        renderer: null,
        rendererTimer: 0,
        refreshTimer: 0,

        primitiveOriginal: null,
        lightOriginal: null,

        installedPrimitive: false,
        installedLight: false,
        installRetries: 0
    };

    const getPanel = () => global.AssetsPanel || null;
    const getTHREE = () => global.THREE || null;

    function storageKey(kind, id) {
        return `${CFG.cachePrefix}${kind}:${String(id)}`;
    }

    function readCache(kind, id) {
        const key = `${kind}:${String(id)}`;

        if (state.cache.has(key)) {
            return state.cache.get(key);
        }

        try {
            const value = global.localStorage?.getItem(
                storageKey(kind, id)
            );

            if (
                typeof value === 'string' &&
                value.startsWith('data:image/')
            ) {
                state.cache.set(key, value);
                return value;
            }
        } catch (_) {}

        return null;
    }

    function saveCache(kind, id, value) {
        const key = `${kind}:${String(id)}`;

        state.cache.set(key, value);

        try {
            global.localStorage?.setItem(
                storageKey(kind, id),
                value
            );
        } catch (_) {}
    }

    function escapeText(value) {
        return String(value ?? '')
            .replace(/[<>&'"]/g, '')
            .slice(0, 24);
    }

    function svgDataURL(svg) {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
    }

    function primitiveFallback(name = 'Primitive') {
        const label = escapeText(name);

        return svgDataURL(`
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#292c31"/>
      <stop offset="1" stop-color="#15171a"/>
    </linearGradient>
    <linearGradient id="top" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c8cdd4"/>
      <stop offset="1" stop-color="#8e969f"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="18" fill="url(#bg)"/>
  <path d="M65 105 128 69l63 36-63 37z" fill="url(#top)"/>
  <path d="M65 105v67l63 36v-66z" fill="#737b86"/>
  <path d="M191 105v67l-63 36v-66z" fill="#939ba5"/>
  <path d="M65 105 128 69l63 36-63 37-63-37zm0 0v67l63 36 63-36v-67m-63 37v66"
        fill="none" stroke="#e0e4e8" stroke-width="4" stroke-linejoin="round"/>
  <rect x="22" y="214" width="212" height="27" rx="7" fill="#0d0f12" opacity=".82"/>
  <text x="128" y="233" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif"
        font-size="13" font-weight="700" fill="#f0f2f5">${label}</text>
</svg>`);
    }

    function lightThumbnail(asset) {
        const id = String(asset?.id || '');
        const name = escapeText(asset?.name || 'Light');

        let body = '';

        if (id === 'light_point') {
            body = `
  <defs>
    <radialGradient id="glow">
      <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset=".25" stop-color="#ffe9a8" stop-opacity=".95"/>
      <stop offset=".6" stop-color="#ffc857" stop-opacity=".35"/>
      <stop offset="1" stop-color="#ffc857" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="128" cy="112" r="82" fill="url(#glow)"/>
  <circle cx="128" cy="112" r="23" fill="#fff5ca" stroke="#ffffff" stroke-width="4"/>
  <g stroke="#ffe08a" stroke-width="5" stroke-linecap="round">
    <path d="M128 61v-20"/><path d="M128 183v-20"/>
    <path d="M77 112H57"/><path d="M199 112h-20"/>
    <path d="m91 75-14-14"/><path d="m179 163-14-14"/>
    <path d="m165 75 14-14"/><path d="m77 163 14-14"/>
  </g>`;
        } else if (id === 'light_sun') {
            body = `
  <defs>
    <radialGradient id="sun">
      <stop offset="0" stop-color="#fffbe0"/>
      <stop offset=".5" stop-color="#ffd868"/>
      <stop offset="1" stop-color="#ff9e35"/>
    </radialGradient>
  </defs>
  <circle cx="102" cy="105" r="34" fill="url(#sun)" stroke="#fff3ba" stroke-width="4"/>
  <g stroke="#ffd76b" stroke-width="6" stroke-linecap="round">
    <path d="M102 48V27"/><path d="M102 183v-21"/>
    <path d="M45 105H24"/><path d="M180 105h-21"/>
    <path d="m62 65-15-15"/><path d="m157 160-15-15"/>
    <path d="m142 65 15-15"/>
  </g>
  <g fill="none" stroke="#a8d4ff" stroke-width="5" stroke-linecap="round">
    <path d="M162 93h54"/><path d="M162 116h54"/><path d="M162 139h54"/>
  </g>
  <g fill="#a8d4ff">
    <path d="m216 93-15-9v18z"/><path d="m216 116-15-9v18z"/><path d="m216 139-15-9v18z"/>
  </g>`;
        } else if (id === 'light_spot') {
            body = `
  <defs>
    <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff5c7" stop-opacity=".85"/>
      <stop offset="1" stop-color="#ffcb5c" stop-opacity=".08"/>
    </linearGradient>
  </defs>
  <g transform="translate(0 -2)">
    <path d="M92 63h72l-9 31H101z" fill="#737c89" stroke="#c8ced6" stroke-width="4"/>
    <ellipse cx="128" cy="94" rx="27" ry="10" fill="#fff9dc" stroke="#fff" stroke-width="3"/>
    <path d="M101 96 47 185h162L155 96z" fill="url(#cone)"/>
    <path d="M101 96 47 185M155 96l54 89" stroke="#ffd776" stroke-width="3" opacity=".75"/>
    <ellipse cx="128" cy="185" rx="81" ry="15" fill="#ffc75b" opacity=".15"/>
  </g>`;
        } else if (id === 'light_rect') {
            body = `
  <defs>
    <filter id="blur"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <rect x="58" y="61" width="140" height="91" rx="10" fill="#8cd8ff" opacity=".3" filter="url(#blur)"/>
  <rect x="67" y="69" width="122" height="76" rx="8" fill="#dff6ff" stroke="#93dcff" stroke-width="5"/>
  <rect x="79" y="81" width="98" height="52" rx="4" fill="#ffffff"/>
  <g stroke="#7fcfff" stroke-width="4" opacity=".65">
    <path d="M77 163 54 191"/><path d="M105 163 94 198"/>
    <path d="M151 163 162 198"/><path d="M179 163 202 191"/>
  </g>`;
        } else if (id === 'light_hemi') {
            body = `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#66c7ff"/>
      <stop offset=".65" stop-color="#ccecff"/>
      <stop offset="1" stop-color="#95a47c"/>
    </linearGradient>
  </defs>
  <circle cx="128" cy="119" r="79" fill="url(#sky)" stroke="#b8d8e7" stroke-width="4"/>
  <path d="M49 119h158" stroke="#ffffff" stroke-width="4" opacity=".85"/>
  <path d="M59 120c18 33 44 49 69 49s51-16 69-49" fill="#69705d" opacity=".65"/>
  <path d="M128 72v-27M96 80 78 59M160 80l18-21"
        stroke="#fff6ad" stroke-width="5" stroke-linecap="round"/>`;
        } else {
            body = `
  <circle cx="128" cy="109" r="45" fill="#fff3b0" opacity=".9"/>
  <circle cx="128" cy="109" r="68" fill="none" stroke="#ffe083" stroke-width="5" opacity=".65"/>`;
        }

        return svgDataURL(`
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22262d"/>
      <stop offset="1" stop-color="#111317"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="18" fill="url(#bg)"/>
  ${body}
  <rect x="21" y="214" width="214" height="27" rx="7" fill="#080a0d" opacity=".84"/>
  <text x="128" y="233" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif"
        font-size="13" font-weight="700" fill="#eef2f5">${name}</text>
</svg>`);
    }

    function ensureRenderer() {
    const T =
        typeof getTHREE === 'function'
            ? getTHREE()
            : window.THREE;

    if (!T) {
        throw new Error(
            'THREE.js is not loaded.'
        );
    }

    if (state.renderer) {
        clearTimeout(state.rendererTimer);
        return state.renderer;
    }

    // Reuse global engine renderer if already created.
    if (window.renderer?.isWebGLRenderer) {
        state.renderer = window.renderer;
        return state.renderer;
    }

    const canvas =
        document.createElement('canvas');

    const renderer =
        new T.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });

    renderer.setSize(
        CFG.size,
        CFG.size,
        false
    );

    renderer.setPixelRatio(1);

    renderer.setClearColor(
        0x000000,
        0
    );

    if (
        'outputColorSpace' in renderer &&
        T.SRGBColorSpace
    ) {
        renderer.outputColorSpace =
            T.SRGBColorSpace;
    } else if (
        'outputEncoding' in renderer &&
        T.sRGBEncoding !== undefined
    ) {
        renderer.outputEncoding =
            T.sRGBEncoding;
    }

    renderer.toneMapping =
        T.ACESFilmicToneMapping;

    renderer.toneMappingExposure =
        1.08;

    renderer.shadowMap.enabled = true;

    if (T.PCFSoftShadowMap !== undefined) {
        renderer.shadowMap.type =
            T.PCFSoftShadowMap;
    }

    state.renderer = renderer;

    return renderer;
}

    function disposeRendererSoon() {
        clearTimeout(state.rendererTimer);

        state.rendererTimer = setTimeout(
            () => {
                const renderer = state.renderer;
                if (!renderer) return;

                try {
                    renderer
                        .getContext?.()
                        ?.getExtension?.('WEBGL_lose_context')
                        ?.loseContext?.();
                } catch (_) {}

                try {
                    renderer.dispose?.();
                } catch (_) {}

                state.renderer = null;
            },
            CFG.rendererIdleDisposeMs
        );
    }

    function cloneMaterial(T, source) {
        let material = null;

        try {
            material = source?.clone?.();
        } catch (_) {}

        if (!material) {
            material = new T.MeshStandardMaterial({
                color: 0xb8bec6,
                roughness: 0.62,
                metalness: 0.02
            });
        }

        if (material.color?.setHex) {
            /*
             * Built-in primitive material is white. Slightly darken it so the
             * silhouette is visible against the transparent/dark browser card.
             */
            const c = material.color;
            const max = Math.max(c.r, c.g, c.b);

            if (max > 0.92) {
                c.setHex(0xb7bec8);
            }
        }

        if (
            material.isMeshStandardMaterial ||
            material.isMeshPhysicalMaterial
        ) {
            material.roughness = Math.max(
                0.42,
                Number(material.roughness ?? 0.62)
            );

            material.metalness = Math.min(
                0.12,
                Number(material.metalness ?? 0)
            );
        }

        if (
            'side' in material &&
            T.DoubleSide !== undefined
        ) {
            material.side = T.DoubleSide;
        }

        material.needsUpdate = true;
        return material;
    }

    function preparePrimitive(T, root) {
        const materials = [];

        root.traverse?.(
            node => {
                if (!node?.isMesh) return;

                node.castShadow = true;
                node.receiveShadow = true;

                if (Array.isArray(node.material)) {
                    node.material = node.material.map(
                        source => {
                            const material = cloneMaterial(T, source);
                            materials.push(material);
                            return material;
                        }
                    );
                } else {
                    const material = cloneMaterial(T, node.material);
                    node.material = material;
                    materials.push(material);
                }
            }
        );

        return materials;
    }

    function disposePrimitive(root, materials) {
        const geometries = new Set();

        root?.traverse?.(
            node => {
                if (node?.geometry) {
                    geometries.add(node.geometry);
                }
            }
        );

        for (const geometry of geometries) {
            try {
                geometry.dispose?.();
            } catch (_) {}
        }

        for (const material of materials) {
            try {
                material.dispose?.();
            } catch (_) {}
        }
    }

    async function renderPrimitive(asset) {
        const T = getTHREE();

        if (
            !T ||
            typeof asset?.factory !== 'function'
        ) {
            throw new Error(
                `Primitive "${asset?.name || asset?.id}" has no valid factory.`
            );
        }

        const object = asset.factory();

        if (!object) {
            throw new Error(
                `Primitive factory returned no object for "${asset?.name || asset?.id}".`
            );
        }

        const renderer = ensureRenderer();
        const materials = preparePrimitive(T, object);

        let ground = null;

        try {
            const scene = new T.Scene();
            const root = new T.Group();

            root.add(object);
            scene.add(root);

            object.updateMatrixWorld?.(true);

            const box = new T.Box3().setFromObject(object);

            if (box.isEmpty()) {
                throw new Error('Primitive has empty render bounds.');
            }

            const size = box.getSize(new T.Vector3());
            const center = box.getCenter(new T.Vector3());
            const sphere = box.getBoundingSphere(new T.Sphere());

            const radius = Math.max(
                sphere.radius || 0,
                Math.max(size.x, size.y, size.z) * 0.5,
                0.25
            );

            root.position.copy(center).multiplyScalar(-1);

            scene.add(
                new T.HemisphereLight(
                    0xf6f8ff,
                    0x252b33,
                    1.6
                )
            );

            const key = new T.DirectionalLight(
                0xffffff,
                2.7
            );

            key.position.set(
                radius * 2.3,
                radius * 3.1,
                radius * 2.7
            );

            key.castShadow = true;

            if (key.shadow?.mapSize) {
                key.shadow.mapSize.set(512, 512);
            }

            scene.add(key);

            const rim = new T.DirectionalLight(
                0x91baff,
                0.85
            );

            rim.position.set(
                -radius * 2.1,
                radius * 1.4,
                -radius * 1.3
            );

            scene.add(rim);

            if (
                T.ShadowMaterial &&
                T.PlaneGeometry
            ) {
                ground = new T.Mesh(
                    new T.PlaneGeometry(
                        radius * 7,
                        radius * 7
                    ),
                    new T.ShadowMaterial({
                        color: 0x000000,
                        opacity: 0.22,
                        transparent: true
                    })
                );

                ground.rotation.x = -Math.PI / 2;

                ground.position.y =
                    -(size.y * 0.5) -
                    Math.max(
                        0.01,
                        radius * 0.015
                    );

                ground.receiveShadow = true;
                scene.add(ground);
            }

            const camera = new T.PerspectiveCamera(
                36,
                1,
                0.01,
                10000
            );

            const halfFov = T.MathUtils.degToRad(
                camera.fov * 0.5
            );

            let distance =
                (radius / Math.sin(halfFov)) *
                1.13;

            /*
             * Plane is extremely flat, so use a little more distance and a
             * higher viewing angle to make it recognizable.
             */
            const flatness =
                Math.min(size.x, size.y, size.z) /
                Math.max(size.x, size.y, size.z, 0.0001);

            if (flatness < 0.04) {
                distance *= 1.17;
            }

            const direction = new T.Vector3(
                1.32,
                flatness < 0.04 ? 1.32 : 0.92,
                1.5
            ).normalize();

            camera.position.copy(
                direction.multiplyScalar(distance)
            );

            camera.near = Math.max(
                0.01,
                distance - radius * 2.5
            );

            camera.far =
                distance +
                radius * 5;

            camera.lookAt(
                0,
                0,
                0
            );

            camera.updateProjectionMatrix();

            scene.updateMatrixWorld?.(true);

            renderer.setClearColor(
                0x000000,
                0
            );

            renderer.clear?.(
                true,
                true,
                true
            );

            renderer.render(
                scene,
                camera
            );

            let image = '';

            try {
                image = renderer.domElement.toDataURL(
                    'image/webp',
                    CFG.quality
                );
            } catch (_) {
                image = renderer.domElement.toDataURL(
                    'image/png'
                );
            }

            if (!image?.startsWith('data:image/')) {
                throw new Error(
                    'Primitive thumbnail renderer returned invalid data.'
                );
            }

            return image;
        } finally {
            if (ground) {
                try {
                    ground.geometry?.dispose?.();
                } catch (_) {}

                try {
                    ground.material?.dispose?.();
                } catch (_) {}
            }

            disposePrimitive(
                object,
                materials
            );
        }
    }

    function refreshPanel() {
        clearTimeout(state.refreshTimer);

        state.refreshTimer = setTimeout(
            () => {
                try {
                    getPanel()?.render?.();
                } catch (_) {}
            },
            CFG.renderRefreshMs
        );
    }

    function enqueuePrimitive(asset) {
        const id = String(asset?.id || '');

        if (
            !id ||
            state.pending.has(`primitive:${id}`) ||
            readCache('primitive', id)
        ) {
            return false;
        }

        const pendingKey = `primitive:${id}`;

        state.pending.add(pendingKey);

        state.queue.push({
            kind: 'primitive',
            asset: {
                ...asset
            }
        });

        drainQueue();
        return true;
    }

    async function drainQueue() {
        if (state.draining) return;

        state.draining = true;

        try {
            while (state.queue.length) {
                const job = state.queue.shift();
                const asset = job.asset;
                const pendingKey = `${job.kind}:${asset.id}`;

                try {
                    if (job.kind === 'primitive') {
                        const image = await renderPrimitive(asset);

                        saveCache(
                            'primitive',
                            asset.id,
                            image
                        );
                    }
                } catch (error) {
                    console.warn(
                        `[SM Builtin Thumbnails] Could not render "${asset?.name || asset?.id}":`,
                        error
                    );

                    saveCache(
                        'primitive',
                        asset.id,
                        primitiveFallback(
                            asset?.name ||
                            'Primitive'
                        )
                    );
                } finally {
                    state.pending.delete(pendingKey);
                }

                refreshPanel();

                await new Promise(
                    resolve => {
                        if (global.requestAnimationFrame) {
                            global.requestAnimationFrame(
                                () => resolve()
                            );
                        } else {
                            setTimeout(resolve, 0);
                        }
                    }
                );
            }
        } finally {
            state.draining = false;
            disposeRendererSoon();
        }
    }

    function decoratePrimitives(assets) {
        if (!Array.isArray(assets)) {
            return assets;
        }

        for (const asset of assets) {
            if (asset?.type !== 'primitive') continue;

            const cached = readCache(
                'primitive',
                asset.id
            );

            if (cached) {
                asset.thumbnail = cached;
                asset.thumbnailKind = 'primitive-3d';
                asset.thumbnailGenerated = true;
            } else {
                asset.thumbnail = primitiveFallback(
                    asset.name
                );

                asset.thumbnailKind = 'primitive-pending';
                asset.thumbnailGenerated = false;

                enqueuePrimitive(asset);
            }
        }

        return assets;
    }

    function decorateLights(assets) {
        if (!Array.isArray(assets)) {
            return assets;
        }

        for (const asset of assets) {
            if (asset?.type !== 'light') continue;

            let image = readCache(
                'light',
                asset.id
            );

            if (!image) {
                image = lightThumbnail(asset);

                saveCache(
                    'light',
                    asset.id,
                    image
                );
            }

            asset.thumbnail = image;
            asset.thumbnailKind = 'light-visual';
            asset.thumbnailGenerated = true;
        }

        return assets;
    }

    function patchPrimitiveGetter() {
        const P = getPanel();

        if (
            !P ||
            typeof P._getPrimitiveAssets !==
                'function'
        ) {
            return false;
        }

        if (
            P._getPrimitiveAssets
                .__smBuiltinThumbPatched
        ) {
            state.installedPrimitive = true;
            return true;
        }

        const original =
            P._getPrimitiveAssets;

        const wrapped =
            function (...args) {
                return decoratePrimitives(
                    original.apply(
                        this,
                        args
                    )
                );
            };

        Object.defineProperty(
            wrapped,
            '__smBuiltinThumbPatched',
            {
                value: true
            }
        );

        Object.defineProperty(
            wrapped,
            '__smBuiltinThumbOriginal',
            {
                value: original
            }
        );

        state.primitiveOriginal = original;
        P._getPrimitiveAssets = wrapped;
        state.installedPrimitive = true;

        return true;
    }

    function patchLightGetter() {
        const P = getPanel();

        if (
            !P ||
            typeof P._getLightAssets !==
                'function'
        ) {
            return false;
        }

        if (
            P._getLightAssets
                .__smBuiltinThumbPatched
        ) {
            state.installedLight = true;
            return true;
        }

        const original =
            P._getLightAssets;

        const wrapped =
            function (...args) {
                return decorateLights(
                    original.apply(
                        this,
                        args
                    )
                );
            };

        Object.defineProperty(
            wrapped,
            '__smBuiltinThumbPatched',
            {
                value: true
            }
        );

        Object.defineProperty(
            wrapped,
            '__smBuiltinThumbOriginal',
            {
                value: original
            }
        );

        state.lightOriginal = original;
        P._getLightAssets = wrapped;
        state.installedLight = true;

        return true;
    }

    function install() {
        state.installRetries += 1;

        if (
            !getPanel() ||
            !getTHREE()
        ) {
            if (
                state.installRetries <
                CFG.maxInstallRetries
            ) {
                setTimeout(
                    install,
                    CFG.installRetryMs
                );
            }

            return false;
        }

        const primitive =
            patchPrimitiveGetter();

        const light =
            patchLightGetter();

        if (primitive || light) {
            refreshPanel();

            console.log(
                '[SM Builtin Thumbnails] Primitive/Light thumbnail bridge installed.'
            );
        }

        if (
            (!primitive || !light) &&
            state.installRetries <
                CFG.maxInstallRetries
        ) {
            setTimeout(
                install,
                CFG.installRetryMs
            );
        }

        return primitive && light;
    }

    function generateAllPrimitives({
        force = false
    } = {}) {
        const P = getPanel();

        if (
            !P ||
            typeof P._getPrimitiveAssets !==
                'function'
        ) {
            return 0;
        }

        /*
         * If patched, calling the getter already queues missing thumbnails.
         * For force mode, first clear primitive cache.
         */
        if (force) {
            clearCache({
                primitives: true,
                lights: false,
                refresh: false
            });
        }

        const assets =
            P._getPrimitiveAssets();

        let count = 0;

        for (const asset of assets) {
            if (
                asset?.type === 'primitive' &&
                !readCache(
                    'primitive',
                    asset.id
                )
            ) {
                if (enqueuePrimitive(asset)) {
                    count += 1;
                }
            }
        }

        refreshPanel();

        return count;
    }

    async function regeneratePrimitive(id) {
        const P = getPanel();

        if (
            !P ||
            typeof P._getPrimitiveAssets !==
                'function'
        ) {
            throw new Error(
                'AssetsPanel primitive library is unavailable.'
            );
        }

        const asset =
            P._getPrimitiveAssets().find(
                item =>
                    String(item?.id) ===
                    String(id)
            );

        if (!asset) {
            throw new Error(
                `Primitive not found: ${id}`
            );
        }

        const key =
            `primitive:${String(id)}`;

        state.cache.delete(key);
        state.pending.delete(key);

        try {
            global.localStorage?.removeItem(
                storageKey(
                    'primitive',
                    id
                )
            );
        } catch (_) {}

        const image =
            await renderPrimitive(asset);

        saveCache(
            'primitive',
            id,
            image
        );

        refreshPanel();
        disposeRendererSoon();

        return image;
    }

    function clearCache({
        primitives = true,
        lights = true,
        refresh = true
    } = {}) {
        const prefixes = [];

        if (primitives) {
            prefixes.push(
                `${CFG.cachePrefix}primitive:`
            );
        }

        if (lights) {
            prefixes.push(
                `${CFG.cachePrefix}light:`
            );
        }

        for (const key of [...state.cache.keys()]) {
            if (
                (primitives && key.startsWith('primitive:')) ||
                (lights && key.startsWith('light:'))
            ) {
                state.cache.delete(key);
            }
        }

        try {
            const remove = [];

            for (
                let i = 0;
                i < global.localStorage.length;
                i++
            ) {
                const key =
                    global.localStorage.key(i);

                if (
                    prefixes.some(
                        prefix =>
                            key?.startsWith(prefix)
                    )
                ) {
                    remove.push(key);
                }
            }

            remove.forEach(
                key =>
                    global.localStorage.removeItem(
                        key
                    )
            );
        } catch (_) {}

        if (refresh) {
            refreshPanel();
        }
    }

    global.SMAssetsPanelLightPrimitiveThumbnails = {
        version:
            CFG.version,

        install,

        applyAll() {
            install();

            /*
             * Light thumbnails are synchronous through their getter.
             * Primitive thumbnails generate asynchronously.
             */
            try {
                getPanel()?._getLightAssets?.();
            } catch (_) {}

            return generateAllPrimitives();
        },

        generateAllPrimitives,

        regeneratePrimitive,

        createLightThumbnail:
            lightThumbnail,

        clearCache,

        status() {
            return {
                primitiveInstalled:
                    state.installedPrimitive,
                lightInstalled:
                    state.installedLight,
                cached:
                    state.cache.size,
                pending:
                    state.pending.size,
                queued:
                    state.queue.length,
                draining:
                    state.draining
            };
        }
    };

    install();

    if (
        typeof document !== 'undefined' &&
        document.readyState === 'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            install,
            {
                once: true
            }
        );
    }
})(typeof window !== 'undefined' ? window : globalThis);