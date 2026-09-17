/**
 * js/BuiltinModels.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Patch for AssetsPanel that makes built-in file-path models (like the tree GLB)
 * fully work:
 *   1. Generates real 3D thumbnails from file paths (not just data URLs)
 *   2. Fixes _addToScene to handle file-path assets (not just data URLs)
 *   3. Registers the tree under a dedicated "Nature" category in the sidebar
 *   4. Proper drop-onto-scene with auto-scale, shadow flags, and grounding
 *
 * Load AFTER AssetsPanel.js:
 *   <script src="js/BuiltinModels.js"></script>
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function patchAssetsPanelBuiltins() {
    'use strict';

    /* ── Wait for AssetsPanel to exist ─────────────────────────────────── */
    function whenReady(cb) {
        if (typeof AssetsPanel !== 'undefined' && typeof THREE !== 'undefined') {
            cb();
        } else {
            setTimeout(() => whenReady(cb), 80);
        }
    }

    whenReady(function () {
        function getAssetExt(asset, src = '') {
            const fromName = (asset?.name || '').split('.').pop().toLowerCase();
            if (['glb', 'gltf', 'fbx', 'obj'].includes(fromName)) return fromName;
            const cleanSrc = String(src || '').split('?')[0].split('#')[0];
            const fromSrc = cleanSrc.includes('.') ? cleanSrc.split('.').pop().toLowerCase() : '';
            if (['glb', 'gltf', 'fbx', 'obj'].includes(fromSrc)) return fromSrc;
            return '';
        }

        function resolveLoader(panel, ext) {
            if (ext === 'glb' || ext === 'gltf') {
                return panel?.loaders?.gltf || (THREE.GLTFLoader ? new THREE.GLTFLoader() : null);
            }
            if (ext === 'fbx') {
                return panel?.loaders?.fbx || (THREE.FBXLoader ? new THREE.FBXLoader() : null);
            }
            if (ext === 'obj') {
                return panel?.loaders?.obj || (THREE.OBJLoader ? new THREE.OBJLoader() : null);
            }
            return panel?.loaders?.gltf || (THREE.GLTFLoader ? new THREE.GLTFLoader() : null);
        }

        function inferTargetHeight(asset, size, ext = '') {
            const name = String(asset?.name || '').toLowerCase();
            const tags = (asset?.tags || []).join(' ').toLowerCase();
            const hay = `${name} ${tags}`;
            const rawHeight = Number(size?.y) || 0;

            // Most FBX files are authored in centimeters; normalize to meter-like
            // scene units for better default scaling.
            const normalizedHeight = (ext === 'fbx' && rawHeight > 30) ? (rawHeight / 100) : rawHeight;

            if (hay.includes('city') || hay.includes('town') || hay.includes('village')) return 80;
            if (hay.includes('building') || hay.includes('house') || hay.includes('skyscraper')) return 25;
            if (hay.includes('terrain') || hay.includes('mountain') || hay.includes('landscape')) return 60;
            if (hay.includes('tree') || hay.includes('foliage') || hay.includes('nature')) return 6;
            if (hay.includes('vehicle') || hay.includes('car') || hay.includes('truck') || hay.includes('bus')) return 2.8;
            if (hay.includes('character') || hay.includes('player') || hay.includes('human') || hay.includes('soldier')) return 1.8;

            if (normalizedHeight > 120) return normalizedHeight;
            if (normalizedHeight > 25) return 30;
            if (normalizedHeight > 8) return 12;
            if (normalizedHeight > 3) return 6;
            if (normalizedHeight > 1.2) return 1.8;
            if (normalizedHeight > 0.2) return 1.8;
            return 3.5;
        }

        /* ═══════════════════════════════════════════════════════════════
           1.  DECLARE BUILT-IN MODELS
               Add every file-path model here. `data` is the URL/path;
               thumbnails are generated automatically on first init.
        ═══════════════════════════════════════════════════════════════ */
        // ── Path candidates tried in order until one loads ────────────
        // Covers: dev server at root, subfolder, absolute path, etc.
        const TREE_PATH_CANDIDATES = [
            'assets/models/tree_for_games.glb',
            './assets/models/tree_for_games.glb',
            '../assets/models/tree_for_games.glb',
            '/assets/models/tree_for_games.glb',
            'models/tree_for_games.glb',
            './models/tree_for_games.glb',
        ];

        const BUILTIN_MODELS = [
            {
                id: 'builtin_tree_for_games',
                name: 'Game Tree',
                type: 'model',
                isBuiltIn: true,
                data: null,              // resolved at runtime by _probeTreePath()
                _candidates: TREE_PATH_CANDIDATES,
                thumbnail: null,
                tags: ['nature', 'tree', 'foliage', 'game-ready', 'builtin'],
                folderId: 'sme_nature',
                references: [],
                history: [],
                userData: { category: 'nature' },
            },
            {
                id: 'catfish_mech_low-poly_animated',
                name: 'catfish_mech_low-poly_animated',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/catfish_mech_low-poly_animated.glb',
                    './assets/models/catfish_mech_low-poly_animated.glb',
                    '../assets/models/catfish_mech_low-poly_animated.glb',
                    '/assets/models/catfish_mech_low-poly_animated.glb',
                ],
                thumbnail: null,
                tags: ['cyberpunk', 'mechanical', 'arachnid', 'spider', 'builtin'],
                folderId: 'sme_models',
                references: [],
                history: [],
            },

            {
                id: 'robot_unity_test',
                name: 'robot_unity_test',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/robot_unity_test.glb',
                    './assets/models/robot_unity_test.glb',
                    '../assets/models/robot_unity_test.glb',
                    '/assets/models/robot_unity_test.glb',
                ],
                thumbnail: null,
                tags: ['cyberpunk', 'mechanical', 'robot', 'unity', 'war'],
                folderId: 'sme_models',
                references: [],
                history: [],
            },
            {
                id: 'psx_-_apartment.glb',
                name: 'psx_-_apartment.glb',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/houses&building/psx_-_apartment.glb',
                    './assets/models/houses&building/psx_-_apartment.glb',
                    '../assets/models/houses&building/psx_-_apartment.glb',
                    '/assets/models/houses&building/psx_-_apartment.glb',
                ],
                thumbnail: null,
                tags: ['houses&building', 'apartment', 'psx', 'builtin'],
                folderId: 'sme_architecture',
                references: [],
                history: [],
            },
            {
                id: 'futuristic_cyberpunk_mechanical_arachnid',
                name: 'futuristic_cyberpunk_mechanical_arachnid',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/futuristic_cyberpunk_mechanical_arachnid.glb',
                    './assets/models/futuristic_cyberpunk_mechanical_arachnid.glb',
                    '../assets/models/futuristic_cyberpunk_mechanical_arachnid.glb',
                    '/assets/models/futuristic_cyberpunk_mechanical_arachnid.glb',
                ],
                thumbnail: null,
                tags: ['futuristic', 'cyberpunk', 'mechanical', 'arachnid', 'builtin'],
                folderId: 'sme_models',
                references: [],
                history: [],
            },
            {
                id: 'log_cabin_free_download.glb',
                name: 'log_cabin_free_download.glb',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/houses&building/log_cabin_free_download.glb',
                    './assets/models/houses&building/log_cabin_free_download.glb',
                    '../assets/models/houses&building/log_cabin_free_download.glb',
                    '/assets/models/houses&building/log_cabin_free_download.glb',
                ],
                thumbnail: null,
                tags: ['houses&building', 'log_cabin', 'free_download', 'builtin'],
                folderId: 'sme_architecture',
                references: [],
                history: [],
            },
            {
                id: 'lp_americans_house_mobile.glb',
                name: 'lp_americans_house_mobile.glb',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/houses&building/lp_americans_house_mobile.glb',
                    './assets/models/houses&building/lp_americans_house_mobile.glb',
                    '../assets/models/houses&building/lp_americans_house_mobile.glb',
                    '/assets/models/houses&building/lp_americans_house_mobile.glb',
                ],
                thumbnail: null,
                tags: ['houses&building', 'lp_americans_house_mobile', 'builtin'],
                folderId: 'sme_models',
                references: [],
                history: [],
            },
            {
                id: 'free_rock_assets_pack',
                name: 'free_rock_assets_pack',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/nature/free_rock_assets_pack.glb',
                    './assets/models/nature/free_rock_assets_pack.glb',
                    '../assets/models/nature/free_rock_assets_pack.glb',
                    '/assets/models/nature/free_rock_assets_pack.glb',
                ],
                thumbnail: null,
                tags: ['nature', 'rock', 'free_rock_assets_pack', 'builtin'],
                folderId: 'sme_nature',
                references: [],
                history: [],
            },
            {
                id: 'various_forest_assets_pack',
                name: 'various_forest_assets_pack',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/nature/various_forest_assets_pack.glb',
                    './assets/models/nature/various_forest_assets_pack.glb',
                    '../assets/models/nature/various_forest_assets_pack.glb',
                    '/assets/models/nature/various_forest_assets_pack.glb',
                ],
                thumbnail: null,
                tags: ['nature', 'forest', 'various_forest_assets_pack', 'builtin'],
                folderId: 'sme_nature',
                references: [],
                history: [],
            },


            {
                id: 'plane_water_low.glb',
                name: 'plane_water_low.glb',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/nature/plane_water_low.glb',
                    './assets/models/nature/plane_water_low.glb',
                    '../assets/models/nature/plane_water_low.glb',
                    '/assets/models/nature/plane_water_low.glb',
                ],
                thumbnail: null,
                tags: ['plane_water_low', 'builtin'],
                folderId: 'sme_models',
                references: [],
                history: [],
            },
            {
                id: 'wooden_bridge_pack.glb',
                name: 'wooden_bridge_pack.glb',
                type: 'model',
                isBuiltIn: true,
                data: null,
                _candidates: [
                    'assets/models/nature/wooden_bridge_pack.glb',
                    './assets/models/nature/wooden_bridge_pack.glb',
                    '../assets/models/nature/wooden_bridge_pack.glb',
                    '/assets/models/nature/wooden_bridge_pack.glb',
                ],
                thumbnail: null,
                tags: ['wooden_bridge_pack', 'builtin'],
                folderId: 'sme_architecture',
                references: [],
                history: [],
            }
            //create a new subfolder inside this existed SM-Engine-Models

        ];
        const BUILTIN_MODEL_IDS = new Set(BUILTIN_MODELS.map((model) => model.id));
        let builtinThumbnailQueue = Promise.resolve();
        const builtinThumbnailPending = new Set();

        // ── Try each candidate with a HEAD request; set .data to first success ──
        async function _probeTreePath(asset) {
            if (asset.data) return asset.data;   // already resolved

            for (const candidate of (asset._candidates || [])) {
                try {
                    const res = await fetch(candidate, { method: 'HEAD' });
                    if (res.ok) {
                        asset.data = candidate;
                        console.log(`[BuiltinModels] Tree GLB found at: ${candidate}`);
                        return candidate;
                    }
                } catch { /* network error / CORS – skip */ }
            }

            // Nothing found automatically — offer file picker
            console.warn('[BuiltinModels] Tree GLB not found at any candidate path. Showing file picker.');
            return null;
        }

        /* ═══════════════════════════════════════════════════════════════
           2.  PATCH _getBuiltinModels
               Returns the list above so _ensureBuiltins picks them up.
        ═══════════════════════════════════════════════════════════════ */
        AssetsPanel._getBuiltinModels = function () {
            return BUILTIN_MODELS.map(m => ({ ...m }));
        };

        /* ═══════════════════════════════════════════════════════════════
           3.  PATCH _ensureBuiltins
               After inserting built-ins, generate missing thumbnails for
               file-path models in the background (non-blocking).
        ═══════════════════════════════════════════════════════════════ */
        const _origEnsureBuiltins = AssetsPanel._ensureBuiltins.bind(AssetsPanel);

        AssetsPanel._ensureBuiltins = function () {
            // 1. Clear previous built-ins
            this.assets = this.assets.filter((a) => !a.isBuiltIn);

            // 2. Define IDs
            const rootId = "sme_models";
            const natureId = "sme_nature";
            const archId = "sme_architecture";

            // 3. Create Root Folder: SM-Engine-models
            if (!this.folders[rootId]) {
                this.folders[rootId] = {
                    id: rootId,
                    name: "SM-Engine-models",
                    parentId: null,
                    children: [],
                    isBuiltIn: true,
                    isProjectAssetFolder: true
                };
            }

            // 4. Create Subfolder: Nature (Inside Root)
            if (!this.folders[natureId]) {
                this.folders[natureId] = {
                    id: natureId,
                    name: "Nature Assets",
                    parentId: rootId, // Sets it inside SM-Engine-models
                    children: [],
                    isBuiltIn: true,
                    isProjectAssetFolder: true
                };
                if (!this.folders[rootId].children.includes(natureId)) {
                    this.folders[rootId].children.push(natureId);
                }
            }

            // 5. Create Subfolder: Architecture (Inside Root)
            if (!this.folders[archId]) {
                this.folders[archId] = {
                    id: archId,
                    name: "Architecture",
                    parentId: rootId, // Sets it inside SM-Engine-models
                    children: [],
                    isBuiltIn: true,
                    isProjectAssetFolder: true
                };
                if (!this.folders[rootId].children.includes(archId)) {
                    this.folders[rootId].children.push(archId);
                }
            }

            // Preserve the gameplay obstacle library added by AssetManager.
            const gameplayId = "sme_gameplay";
            const obstaclesId = "sme_game_obstacles";

            if (!this.folders[gameplayId]) {
                this.folders[gameplayId] = {
                    id: gameplayId,
                    name: "Gameplay",
                    parentId: null,
                    children: [],
                    isBuiltIn: true,
                    isProjectAssetFolder: true
                };
            }

            if (!this.folders[obstaclesId]) {
                this.folders[obstaclesId] = {
                    id: obstaclesId,
                    name: "Blockout Obstacles",
                    parentId: gameplayId,
                    children: [],
                    isBuiltIn: true,
                    isProjectAssetFolder: true
                };
            }

            if (!this.folders[gameplayId].children.includes(obstaclesId)) {
                this.folders[gameplayId].children.push(obstaclesId);
            }

            const gameObstacles = typeof this._getGameObstacleAssets === "function"
                ? this._getGameObstacleAssets()
                : [];
            for (const obstacle of gameObstacles) {
                this.assets.unshift({
                    ...obstacle,
                    isBuiltIn: true,
                    history: [],
                    references: []
                });
            }

            // 6. Add the assets from your BUILTIN_MODELS list
            const builtinModels = this._getBuiltinModels();
            for (const b of builtinModels) {
                // Ensure they are marked built-in and unshifted into the registry
                this.assets.unshift({
                    ...b,
                    isBuiltIn: true,
                    history: [],
                    references: []
                });
            }

            // Run standard logic
            if (this._ensureProjectManifestAssets) this._ensureProjectManifestAssets();
        };
        // Mark an asset as unresolved so _addToScene knows to show the picker
        function _markAsUnresolved(asset) {
            asset._unresolved = true;
            asset.thumbnail = _svgUnresolved();
        }

        function _svgUnresolved() {
            // Orange "?" icon thumbnail — signals the user the file isn't found
            return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
                <rect width="80" height="80" fill="#1a1a1a"/>
                <text x="40" y="52" text-anchor="middle" font-size="36" fill="#ff8c00" font-family="sans-serif">?</text>
                <text x="40" y="68" text-anchor="middle" font-size="9" fill="#888" font-family="sans-serif">Locate file</text>
            </svg>`;
        }

        /* ═══════════════════════════════════════════════════════════════
           4.  PATCH _addToScene
               Handles both data-URL assets (imported files) AND
               file-path assets (built-in models like the tree).
        ═══════════════════════════════════════════════════════════════ */
        const _origAddToScene = AssetsPanel._addToScene.bind(AssetsPanel);

        AssetsPanel._addToScene = async function (assetId, event = null) {
            const asset =
                this._findById(assetId) ||
                this._getPrimitiveAssets().find(a => a.id === assetId) ||
                this._getLightAssets().find(a => a.id === assetId) ||
                this._getBuiltinModels().find(a => a.id === assetId) ||
                (this.assets || []).find(a => a.id === assetId);

            if (!asset) {
                console.error(`[BuiltinModels] Asset not found: ${assetId}`);
                return;
            }

            // Non-model types: delegate to original handler
            if (asset.type !== 'model') {
                return _origAddToScene(assetId, event);
            }

            if (typeof window.addObjectToScene !== 'function') {
                console.error('[BuiltinModels] window.addObjectToScene() is not defined.');
                return;
            }

            // ── If path unresolved, try probing again first ──────────────
            if ((asset.isBuiltIn || asset.id === 'builtin_tree_for_games') && (!asset.data || asset._unresolved)) {
                const resolved = await _probeTreePath(asset);
                if (!resolved) {
                    // Still not found — show file picker so user can locate it
                    const picked = await _showFilePicker(asset);
                    if (!picked) return;
                    asset.data = picked;
                    asset._unresolved = false;
                    // Regenerate thumbnail
                    _generatePathThumbnail(picked)
                        .then(url => { asset.thumbnail = url; AssetsPanel.render(); })
                        .catch(() => { });
                }
            }

            const src = asset.data;
            const ext = getAssetExt(asset, src);

            /* ── Detect loader ─────────────────────────────────────── */
            const loader = resolveLoader(this, ext || 'gltf');

            if (!loader) {
                console.error(`[BuiltinModels] No loader available for .${ext}`);
                return;
            }

            /* ── Load ──────────────────────────────────────────────── */
            let loadedContent;
            try {
                loadedContent = await new Promise((resolve, reject) => {
                    loader.load(src, resolve, undefined, reject);
                });
            } catch (err) {
                console.error(`[BuiltinModels] Failed to load "${asset.name}" from "${src}":`, err);
                // Offer the file picker so user can locate the file
                const picked = await _showFilePicker(asset);
                if (!picked) return;
                asset.data = picked;
                asset._unresolved = false;
                // Retry with the picked data URL
                try {
                    loadedContent = await new Promise((resolve, reject) => {
                        loader.load(picked, resolve, undefined, reject);
                    });
                } catch (err2) {
                    console.error('[BuiltinModels] Load failed even after file picker:', err2);
                    return;
                }
            }

            /* ── Unwrap GLTF / FBX result ──────────────────────────── */
            let modelObject = loadedContent?.scene || loadedContent;
            const animations = loadedContent?.animations || modelObject?.animations || [];

            if (!modelObject || !modelObject.isObject3D) {
                console.error('[BuiltinModels] Loaded content is not a valid Object3D:', loadedContent);
                return;
            }

            /* ── A. Shadow flags ────────────────────────────────────── */
            modelObject.traverse(child => {
                if (!child.isMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => { if (m) m.shadowSide = THREE.FrontSide; });
                }
            });

            /* ── B. Auto-scale to reasonable height ─────────────────── */
            const bbox = new THREE.Box3().setFromObject(modelObject);
            const size = new THREE.Vector3();
            bbox.getSize(size);

            // Trees look best at 3–4 m tall in a game scene
            const TARGET_HEIGHT = inferTargetHeight(asset, size, ext);
            if (size.y > 0) {
                const scale = TARGET_HEIGHT / size.y;
                modelObject.scale.multiplyScalar(scale);
            }

            /* ── C. Ground the model (sit on y = 0) ─────────────────── */
            const bbox2 = new THREE.Box3().setFromObject(modelObject);
            modelObject.position.y -= bbox2.min.y;

            /* ── D. Attach animations ───────────────────────────────── */
            if (animations.length > 0) {
                modelObject.animations = animations;

                const mixer = new THREE.AnimationMixer(modelObject);
                modelObject.userData.mixer = mixer;

                const firstClip = animations[0];
                if (firstClip) {
                    const action = mixer.clipAction(firstClip);
                    action.reset();
                    action.setLoop(THREE.LoopRepeat, Infinity);
                    action.play();
                    modelObject.userData.animationClip = firstClip;
                    modelObject.userData.animationAction = action;
                }

                if (typeof extractAnimationsToTimeline === 'function') {
                    extractAnimationsToTimeline(modelObject, animations);
                }
            }

            /* ── E. Add to scene ────────────────────────────────────── */
            const displayName = asset.name || String(asset.data || '').split('/').pop().replace(/\.\w+$/, '');
            modelObject.userData.preserveMaterialAppearance = true;
            modelObject.userData.importedFromAssets = true;
            modelObject.traverse((child) => {
                if (!child || !child.userData) return;
                child.userData.preserveMaterialAppearance = true;
                child.userData.importedFromAssets = true;
            });
            window.addObjectToScene(modelObject, displayName);

            /* ── F. Select the new object ───────────────────────────── */
            window.selectedObject = modelObject;
            window.selectedObjects = [modelObject];
            if (typeof selectObject === 'function') selectObject(modelObject, { source: 'assets' });

            /* ── G. Refresh hierarchy ───────────────────────────────── */
            if (typeof updateHierarchy === 'function') updateHierarchy();
            if (typeof updateHierarchySelection === 'function') updateHierarchySelection();

            console.log(`[BuiltinModels] ✓ Added "${displayName}" to scene`);
        };

        /* ═══════════════════════════════════════════════════════════════
           5.  SIDEBAR CATEGORY — "Nature" section for built-in models
               Adds a "Nature Assets" entry to the sidebar that filters
               the grid to show only nature-tagged models.
        ═══════════════════════════════════════════════════════════════ */
        const _origRenderSidebar = AssetsPanel._renderFolderSidebar.bind(AssetsPanel);

        AssetsPanel._renderFolderSidebar = function () {
            _origRenderSidebar();

            const container = document.querySelector('.assets-categories');
            if (!container) return;

            // Only add once
            if (container.querySelector('[data-cat="nature"]')) return;

            if (!container.querySelector('[data-cat="architecture"]')) {
                const archItem = document.createElement('div');
                archItem.className = `category-item ${this.currentCategory === 'architecture' ? 'active' : ''}`;
                archItem.dataset.cat = 'architecture';
                archItem.innerHTML = `
            <span class="category-icon" style="color:#a5a5a5">
                <svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>
                </svg>
            </span>
            Architecture
        `;
                archItem.onclick = (e) => {
                    e.stopPropagation();
                    this.currentCategory = 'architecture';
                    this.openFolderId = null;
                    document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active'));
                    archItem.classList.add('active');
                    this.render();
                };
                container.appendChild(archItem);
            }
            const natureItem = document.createElement('div');
            natureItem.className = `category-item ${this.currentCategory === 'nature' ? 'active' : ''}`;
            natureItem.dataset.cat = 'nature';
            natureItem.innerHTML = `
                <span class="category-icon" style="color:#5aaa5a">
                    <svg class="svg-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C7.38 17 9.06 13.01 17 11V8zM12 3C9.79 3 8 4.79 8 7c0 2.5 2 5 4 5s4-2.5 4-5c0-2.21-1.79-4-4-4z"/>
                    </svg>
                </span>
                Nature
            `;
            natureItem.onclick = (e) => {
                e.stopPropagation();
                this.currentCategory = 'nature';
                this.openFolderId = null;
                document.querySelectorAll('.category-item.active').forEach(c => c.classList.remove('active'));
                natureItem.classList.add('active');
                this.render();
            };

            // Insert after the built-in Lights row or at end
            const lightsRow = container.querySelector('[data-cat="lights"]');
            if (lightsRow) {
                lightsRow.after(natureItem);
            } else {
                container.appendChild(natureItem);
            }
        };

        /* ── Teach render() about the 'nature' category ─────────────── */
        const _origGetFiltered = AssetsPanel._getFilteredAssets.bind(AssetsPanel);

        AssetsPanel._getFilteredAssets = function () {
            // Nature Filter
            if (this.currentCategory === 'nature') {
                const all = [...this._getBuiltinModels(), ...this.assets];
                return all.filter(a =>
                    a.type === 'model' &&
                    (a.tags || []).some(t => ['nature', 'tree', 'foliage', 'rock', 'plant'].includes(t))
                );
            }

            // Architecture Filter (New)
            if (this.currentCategory === 'architecture') {
                const all = [...this._getBuiltinModels(), ...this.assets];
                return all.filter(a =>
                    a.type === 'model' &&
                    (a.tags || []).some(t => ['architecture', 'building', 'house', 'apartment'].includes(t))
                );
            }

            return _origGetFiltered();
        };

        /* ═══════════════════════════════════════════════════════════════
           6.  RE-RUN _ensureBuiltins so the tree appears immediately
        ═══════════════════════════════════════════════════════════════ */
        try {
            AssetsPanel._ensureBuiltins();
            AssetsPanel.render();
        } catch (e) {
            // Panel not init'd yet — it will call _ensureBuiltins on its own init
        }

        console.log('%c[BuiltinModels] Tree GLB registered in Assets Panel', 'color:#5aaa5a;font-weight:bold');
    });

    /* ═══════════════════════════════════════════════════════════════
       HELPER — file picker dialog
       Shows a styled modal that lets the user locate the GLB file on
       their device. Returns a data-URL string or null if cancelled.
    ═══════════════════════════════════════════════════════════════ */
    function _showFilePicker(asset) {
        return new Promise(resolve => {
            // Remove any old picker
            const old = document.getElementById('bm-file-picker-modal');
            if (old) old.remove();

            const modal = document.createElement('div');
            modal.id = 'bm-file-picker-modal';
            modal.style.cssText = `
                position:fixed;inset:0;z-index:99999;
                background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);
                display:flex;align-items:center;justify-content:center;
                font-family:'Segoe UI',system-ui,sans-serif;
            `;

            modal.innerHTML = `
                <div style="
                    background:#1a1a1a;border:1px solid #3a3a3a;border-radius:10px;
                    padding:28px 32px;max-width:460px;width:90%;
                    box-shadow:0 20px 60px rgba(0,0,0,.8);
                ">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="#ff8c00"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        <span style="font-size:15px;font-weight:600;color:#f0f0f0;">
                            Locate Model File
                        </span>
                    </div>
                    <p style="color:#909090;font-size:12px;margin:0 0 18px;line-height:1.6;">
                        <strong style="color:#ccc;">${asset.name}</strong> could not be found automatically.<br>
                        Please locate <code style="color:#ff8c00;background:#111;padding:1px 5px;border-radius:3px;">${asset.name || ((asset._candidates || ['model.glb'])[0].split('/').pop())}</code>
                        on your device.
                    </p>

                    <label style="
                        display:flex;align-items:center;justify-content:center;gap:8px;
                        background:#0a7aff;border:none;border-radius:5px;
                        color:#fff;font-size:13px;font-weight:500;
                        padding:10px 20px;cursor:pointer;margin-bottom:12px;
                        transition:background 0.15s;
                    " onmouseover="this.style.background='#3a9aff'" onmouseout="this.style.background='#0a7aff'">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>
                        Browse for file…
                        <input type="file" id="bm-file-input" accept=".glb,.gltf,.fbx,.obj"
                               style="display:none">
                    </label>

                    <button id="bm-cancel-btn" style="
                        width:100%;background:transparent;border:1px solid #3a3a3a;
                        color:#888;border-radius:5px;padding:8px;font-size:12px;
                        cursor:pointer;font-family:inherit;
                        transition:all 0.15s;
                    " onmouseover="this.style.borderColor='#555';this.style.color='#ccc'"
                       onmouseout="this.style.borderColor='#3a3a3a';this.style.color='#888'">
                        Cancel
                    </button>
                </div>
            `;

            document.body.appendChild(modal);

            // File chosen
            modal.querySelector('#bm-file-input').onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    modal.remove();
                    // Store resolved data-URL; update thumbnail label
                    asset.thumbnail = null;
                    resolve(ev.target.result);
                };
                reader.readAsDataURL(file);
            };

            // Cancel
            modal.querySelector('#bm-cancel-btn').onclick = () => {
                modal.remove();
                resolve(null);
            };

            // Click outside
            modal.onclick = (e) => {
                if (e.target === modal) { modal.remove(); resolve(null); }
            };
        });
    }

    /**
 * Generates a 2D snapshot of a 3D model using an offscreen renderer.
 */
    async function _generatePathThumbnail(url) {
        return new Promise((resolve, reject) => {
            if (!url || typeof THREE === 'undefined') { reject(new Error('Invalid URL or THREE missing')); return; }

            const ext = url.split('.').pop().toLowerCase();
            let loader;
            if (ext === 'glb' || ext === 'gltf') loader = new THREE.GLTFLoader();
            else if (ext === 'fbx') loader = new THREE.FBXLoader();
            else if (ext === 'obj') loader = new THREE.OBJLoader();
            else { reject(new Error('Unsupported format')); return; }

            loader.load(url, (loaded) => {
                let renderer = null;
                let model = loaded.scene || loaded;
                try {
                    const SIZE = 256;
                    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
                    renderer.setSize(SIZE, SIZE);
                    renderer.setPixelRatio(1);
                    renderer.outputColorSpace = THREE.SRGBColorSpace;

                    const scene = new THREE.Scene();
                    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
                    const sun = new THREE.DirectionalLight(0xffffff, 2);
                    sun.position.set(5, 10, 7);
                    scene.add(sun);

                    const bbox = new THREE.Box3().setFromObject(model);
                    const center = new THREE.Vector3();
                    const size = new THREE.Vector3();
                    bbox.getCenter(center);
                    bbox.getSize(size);

                    model.position.x += (model.position.x - center.x);
                    model.position.y += (model.position.y - center.y);
                    model.position.z += (model.position.z - center.z);
                    scene.add(model);

                    const maxDim = Math.max(size.x, size.y, size.z);
                    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
                    const distance = maxDim / Math.tan(Math.PI * 45 / 360);
                    camera.position.set(distance * 0.9, distance * 0.6, distance * 0.9);
                    camera.lookAt(0, 0, 0);

                    renderer.render(scene, camera);
                    const dataURL = renderer.domElement.toDataURL('image/png');

                    // Cleanup
                    renderer.dispose();
                    resolve(dataURL);
                } catch (err) {
                    if (renderer) renderer.dispose();
                    reject(err);
                }
            }, undefined, reject);
        });
    }
    /* ═══════════════════════════════════════════════════════════════
       HELPER — generate thumbnail from a file-path URL
       Uses an offscreen Three.js renderer so we never need a data URL.
    ═══════════════════════════════════════════════════════════════ */
    function _generatePathThumbnail(url) {
        return new Promise((resolve, reject) => {
            if (!url || typeof THREE === 'undefined') { reject(new Error('no url')); return; }

            const ext = url.split('.').pop().toLowerCase();
            let loader = resolveLoader(AssetsPanel, ext); // Uses your existing loader resolver

            loader.load(url, (loaded) => {
                let renderer = null;
                let model = loaded.scene || loaded;

                const cleanup = () => {
                    try {
                        renderer?.dispose();
                        // Dispose geometries/materials to save memory
                        model.traverse(n => {
                            if (n.geometry) n.geometry.dispose();
                            if (n.material) n.material.dispose();
                        });
                    } catch (e) { }
                };

                try {
                    const SIZE = 256; // Higher resolution for better quality
                    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
                    renderer.setSize(SIZE, SIZE);
                    renderer.setPixelRatio(1);
                    renderer.outputColorSpace = THREE.SRGBColorSpace;

                    const scene = new THREE.Scene();

                    // --- BETTER LIGHTING ---
                    // Hemisphere light provides a "natural" sky/ground feel
                    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
                    const sun = new THREE.DirectionalLight(0xffffff, 2);
                    sun.position.set(5, 10, 7);
                    scene.add(sun);

                    // --- PERFECT FRAMING ---
                    const bbox = new THREE.Box3().setFromObject(model);
                    const center = new THREE.Vector3();
                    const size = new THREE.Vector3();
                    bbox.getCenter(center);
                    bbox.getSize(size);

                    // Center the model
                    model.position.x += (model.position.x - center.x);
                    model.position.y += (model.position.y - center.y);
                    model.position.z += (model.position.z - center.z);
                    scene.add(model);

                    // Position camera at a 45-degree "Portrait" angle
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const fov = 45;
                    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
                    const distance = maxDim / Math.tan(Math.PI * fov / 360);

                    // Zoom out slightly (1.2 multiplier) so it's not touching the edges
                    camera.position.set(distance * 0.8, distance * 0.5, distance * 0.8);
                    camera.lookAt(0, 0, 0);

                    // Render
                    renderer.render(scene, camera);
                    const dataURL = renderer.domElement.toDataURL('image/png');

                    cleanup();
                    resolve(dataURL);
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            });
        });
    }

})();
