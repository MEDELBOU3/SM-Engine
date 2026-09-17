// AssetsPanelScriptsBuiltins.js
// Script assets, built-in libraries, scenes, dependency graph, asset type resolver
// Extracted from AssetsPanel_FULL_9483_PBR_FIXED without rewriting method bodies.
(function(global){
"use strict";
const AssetsPanel=global.AssetsPanel;
if(!AssetsPanel){
throw new Error("[SMAssetsPanelScriptsBuiltinsMixin] AssetsPanelCore must load first.");
}
class SMAssetsPanelScriptsBuiltinsMixin {
    static addScriptAsset(name, code, folderId = null) {
        // Code assets can contain JS/HTML/CSS/JSON tabs. Preserve a supported
        // extension; JavaScript remains the default for extension-less names.
        const finalName = /\.(js|html|css|json)$/i.test(name) ? name : name + ".js";
        folderId = folderId || this.ensureScriptsFolder();

        // Check for duplicates
        let uniqueName = finalName;
        let counter = 1;
        const baseName = finalName.replace(/\.(js|html|css|json)$/i, "");
        while (
            this.assets.some(
                (a) =>
                    !a.isBuiltIn &&
                    a.name === uniqueName &&
                    (a.folderId || null) === (folderId || null),
            )
        ) {
            const extension = (finalName.match(/\.[^.]+$/) || [".js"])[0];
            uniqueName = `${baseName} (${counter++})${extension}`;
        }

        if (uniqueName !== finalName) {
            console.warn(
                `AssetsPanel: Asset name conflict for '${finalName}'. Renamed to '${uniqueName}'.`,
            );
        }

        const id = `script_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const asset = {
            id,
            name: uniqueName,
            type: "code",
            data: code,
            thumbnail: this._svgIcon("code"), // Use a specific icon for code
            isFavorite: false,
            isBuiltIn: false,
            folderId,
            tags: ["script", "code"], // Auto-tagging
            history: [], // NEW: Initialize history
            references: [], // NEW: Initialize references
        };

        this.assets.push(asset);
        this._commitAssetVersion(asset.id, "Initial Script Import"); // NEW: Commit initial version
        this._saveToStorage();
        if (typeof this.onAssetAdded === "function") this.onAssetAdded(asset);
        this.render(); // Re-render to show new asset
        this._buildTagCloud(); // NEW: Rebuild tag cloud
        return asset;
    }

    /**
     * Updates an existing script asset in the Assets Panel.
     * @param {string} id - The ID of the asset to update.
     * @param {string} newName - The new name of the script file.
     * @param {string} newCode - The new source code of the script.
     * @returns {boolean} True if update was successful, false otherwise.
     */
    static updateScriptAsset(id, newName, newCode) {
        const asset = this._findById(id);
        if (!asset || asset.type !== "code") {
            console.error(
                `AssetsPanel: Cannot update asset with ID ${id}, it's not a code asset or doesn't exist.`,
            );
            return false;
        }

        // Preserve the editor tab extension; default to JavaScript.
        const finalNewName = /\.(js|html|css|json)$/i.test(newName) ? newName : newName + ".js";

        // Check if newName conflicts with other assets in the same folder, excluding itself
        const conflicts = this.assets.some(
            (a) =>
                a.id !== id &&
                !a.isBuiltIn &&
                a.name === finalNewName &&
                (a.folderId || null) === (asset.folderId || null),
        );
        if (conflicts) {
            alert(
                `An asset named '${finalNewName}' already exists in this folder. Please choose a different name.`,
            );
            return false; // Indicate failure
        }

        asset.name = finalNewName;
        asset.data = newCode;
        this._commitAssetVersion(asset.id, "Script content/name updated"); // NEW: Commit new version
        this._saveToStorage();
        if (typeof this.onAssetUpdate === "function")
            this.onAssetUpdate(asset.id, asset);
        this.render(); // Re-render to update asset name in grid if changed
        return true;
    }

    // ==================================================================
    // ===                UPGRADED ASSET LIBRARIES                      ===
    // ==================================================================
    static _getGameObstacleAssets() {
        const library = window.SMGameObstacleLibrary;
        if (!library || !Array.isArray(library.assets)) return [];

        return library.assets.map((definition) => ({
            id: definition.id,
            name: definition.name,
            type: "obstacle",
            folderId: "sme_game_obstacles",
            isBuiltIn: true,
            thumbnail: this._svgIcon("primitive"),
            tags: definition.tags || ["gameplay", "obstacle"],
            factory: () => library.create(definition.id)
        }));
    }


    static _registerCityAssets() {
        const gameplayId = "sme_gameplay";
        const citiesId = "sme_procedural_cities";

        // Always repair/create Gameplay folder.
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

        const gameplayFolder = this.folders[gameplayId];
        gameplayFolder.isBuiltIn = true;
        gameplayFolder.isProjectAssetFolder = true;

        if (!Array.isArray(gameplayFolder.children)) {
            gameplayFolder.children = [];
        }

        // Always repair/create Procedural Cities child folder.
        if (!this.folders[citiesId]) {
            this.folders[citiesId] = {
                id: citiesId,
                name: "Procedural Cities",
                parentId: gameplayId,
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }

        const citiesFolder = this.folders[citiesId];
        citiesFolder.name = "Procedural Cities";
        citiesFolder.parentId = gameplayId;
        citiesFolder.isBuiltIn = true;
        citiesFolder.isProjectAssetFolder = true;

        if (!Array.isArray(citiesFolder.children)) {
            citiesFolder.children = [];
        }

        if (!gameplayFolder.children.includes(citiesId)) {
            gameplayFolder.children.push(citiesId);
        }

        const cityFactory = (config) => () => {
            if (
                !window.SMCityGenerator ||
                typeof window.SMCityGenerator.generate !== "function"
            ) {
                console.error(
                    "AssetsPanel: SMCityGenerator.js is not loaded. " +
                    "Load it before using Procedural City assets."
                );
                return null;
            }

            return window.SMCityGenerator.generate(config);
        };

        // IMPORTANT: RETURN the assets. _ensureBuiltins() owns insertion.
        const cityPresets = [
            {
                id: "sme_city_downtown_4x4",
                name: "Downtown City Grid (4x4)",
                type: "city",
                folderId: citiesId,
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                tags: ["city", "procedural", "downtown", "commercial"],
                factory: cityFactory({
                    gridX: 4,
                    gridZ: 4,
                    seed: 101,
                    includeProps: true
                })
            },
            {
                id: "sme_city_suburbs_3x3",
                name: "Residential Suburb (3x3)",
                type: "city",
                folderId: citiesId,
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                tags: ["city", "procedural", "residential", "suburb"],
                factory: cityFactory({
                    gridX: 3,
                    gridZ: 3,
                    seed: 202,
                    includeProps: true
                })
            },
            {
                id: "sme_city_industrial_3x3",
                name: "Industrial District (3x3)",
                type: "city",
                folderId: citiesId,
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                tags: ["city", "procedural", "industrial", "warehouse"],
                factory: cityFactory({
                    gridX: 3,
                    gridZ: 3,
                    seed: 303,
                    includeProps: true
                })
            }
        ];
        cityPresets.forEach((preset) => {
            const existing = this.assets.find(a => a.id === preset.id);

            if (!existing) {
                this.assets.push({
                    ...preset,
                    history: [],
                    references: []
                });
            } else {
                Object.assign(existing, preset);
            }
        });

        return cityPresets;
    }

    /**
     * Public, idempotent registration entry point used by SMCityGenerator.
     * It can safely run before or after the generator script is loaded because
     * preset factories resolve window.SMCityGenerator only when instantiated.
     */
    static registerCityLibrary(options = {}) {
        const reveal = options.reveal === true;
        const shouldRender = options.render !== false;
        const presets = this._registerCityAssets() || [];

        this.expandedSections.add("project");
        this.expandedFolders.add("sme_gameplay");
        localStorage.setItem(
            "assetsPanel_expandedFolders",
            JSON.stringify(Array.from(this.expandedFolders))
        );

        if (reveal) {
            this.currentCategory = "project";
            this.currentFilter = "all";
            this.openFolderId = "sme_procedural_cities";

            document
                .querySelectorAll(".filter-btn.active")
                .forEach((button) => button.classList.remove("active"));
            document
                .querySelector('.filter-btn[data-type="all"], .filter-btn[onclick*="all"]')
                ?.classList.add("active");
        }

        this._syncRuntimeAssetRegistry();

        if (shouldRender && this.dom?.grid) {
            this.render();
            this._buildTagCloud();
        }

        if (typeof this.onAssetsChanged === "function") {
            this.onAssetsChanged(this.assets, this.folders);
        }

        return presets;
    }


    static _getPrimitiveAssets() {
        const defaultMaterial = () =>
            new THREE.MeshStandardMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide,
            });
        return [
            {
                id: "prim_cube",
                name: "Cube",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), defaultMaterial()),
                tags: ["primitive", "basic"],
            },
            {
                id: "prim_sphere",
                name: "Sphere",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(
                        new THREE.SphereGeometry(0.5, 32, 16),
                        defaultMaterial(),
                    ),
                tags: ["primitive", "basic"],
            },
            {
                id: "prim_plane",
                name: "Plane",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(new THREE.PlaneGeometry(1, 1), defaultMaterial()),
                tags: ["primitive", "basic"],
            },
            {
                id: "prim_cylinder",
                name: "Cylinder",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(
                        new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
                        defaultMaterial(),
                    ),
                tags: ["primitive", "basic"],
            },
            {
                id: "prim_wall",
                name: "Wall",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(
                        new THREE.BoxGeometry(4, 2.5, 0.15),
                        defaultMaterial(),
                    ),
                tags: ["primitive", "architecture"],
            },
            {
                id: "prim_stair",
                name: "Stairs",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () => {
                    const steps = 10;
                    const stepWidth = 1.2,
                        stepHeight = 0.2,
                        stepDepth = 0.3;
                    const group = new THREE.Group();
                    for (let i = 0; i < steps; i++) {
                        const geom = new THREE.BoxGeometry(
                            stepWidth,
                            stepHeight,
                            stepDepth,
                        );
                        const mesh = new THREE.Mesh(geom, defaultMaterial());
                        mesh.position.set(
                            0,
                            stepHeight / 2 + i * stepHeight,
                            i * stepDepth,
                        );
                        group.add(mesh);
                    }
                    const boundingBox = new THREE.Box3().setFromObject(group);
                    const center = boundingBox.getCenter(new THREE.Vector3());
                    group.position.sub(center);
                    return group;
                },
                tags: ["primitive", "architecture"],
            },
            {
                id: "prim_arch",
                name: "Arch",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () => {
                    const shape = new THREE.Shape();
                    shape.moveTo(-1, 0);
                    shape.lineTo(-1, 1.5);
                    shape.absarc(0, 1.5, 1, Math.PI, 0, true);
                    shape.lineTo(1, 0);
                    shape.lineTo(-1, 0);
                    const extrudeSettings = { depth: 0.2, bevelEnabled: false };
                    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                    geometry.center();
                    return new THREE.Mesh(geometry, defaultMaterial());
                },
                tags: ["primitive", "architecture"],
            },
            {
                id: "prim_column",
                name: "Column",
                type: "primitive",
                isBuiltIn: true,
                thumbnail: this._svgIcon("primitive"),
                factory: () =>
                    new THREE.Mesh(
                        new THREE.CylinderGeometry(0.2, 0.2, 3, 20),
                        defaultMaterial(),
                    ),
                tags: ["primitive", "architecture"],
            },
        ];
    }

    static _getBuiltinModels() {
        return [
            {
                id: "model_tree",
                name: "Tree for Games",
                type: "model",
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                data: "assets/models/tree_for_games.glb",
                tags: ["nature", "tree", "game-ready"],
                references: [],
                history: []
            },
            {
                id: "catfish_mech_low-poly_animated",
                name: "catfish_mech_low-poly_animated",
                type: "model",
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                data: "assets/models/catfish_mech_low-poly_animated.glb",
                folderId: "sme_models",
                tags: ["cyberpunk", "mechanical", "arachnid", "spider"],
                references: [],
                history: []
            },
            {
                id: "robot_unity_test",
                name: "robot_unity_test",
                type: "model",
                isBuiltIn: true,
                thumbnail: this._svgIcon("model"),
                data: "assets/models/robot_unity_test.glb",
                folderId: "sme_models",
                tags: ["cyberpunk", "mechanical", "robot", "unity", "war"],
                references: [],
                history: []
            },

        ];
    }

    static _getLightAssets() {
        return [
            {
                id: "light_point",
                name: "Point Light",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.PointLight(0xffffff, 50, 10);
                    light.castShadow = true;
                    return light;
                },
                tags: ["light", "point"],
            },
            {
                id: "light_sun",
                name: "Sun Light",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.DirectionalLight(0xfff5e1, 8);
                    light.castShadow = true;
                    light.shadow.mapSize.width = 2048;
                    light.shadow.mapSize.height = 2048;
                    light.shadow.camera.near = 0.5;
                    light.shadow.camera.far = 50;
                    light.shadow.bias = -0.0001;
                    return light;
                },
                tags: ["light", "sun", "directional"],
            },
            {
                id: "light_spot",
                name: "Spotlight",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.SpotLight(
                        0xffffff,
                        200,
                        20,
                        Math.PI / 6,
                        0.2,
                        1.5,
                    );
                    light.castShadow = true;
                    return light;
                },
                tags: ["light", "spot"],
            },
            {
                id: "light_rect",
                name: "Rect Area Light",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.RectAreaLight(0x87ceeb, 10, 2, 3);
                    return light;
                },
                tags: ["light", "area"],
            },
            {
                id: "light_hemi",
                name: "Hemisphere Sky",
                type: "light",
                isBuiltIn: true,
                thumbnail: this._svgIcon("light"),
                factory: () => {
                    const light = new THREE.HemisphereLight(0x87ceeb, 0x404040, 2);
                    return light;
                },
                tags: ["light", "environment"],
            },
        ];
    }

    /**
     * Saves the current 3D viewport scene as a .scene File inside AssetsPanel.
     * @param {string} sceneName - Name of the level file (e.g., "Level_01.scene")
     */
    static saveCurrentSceneAsset(sceneName = "NewLevel.scene") {
        if (!this.scene) {
            console.error("AssetsPanel: No active scene found to save.");
            return null;
        }

        // 1. Filter out editor helpers (Grid, Lights, Transform Controls, Cameras)
        const exportableObjects = this.scene.children.filter(child =>
            child.userData?.selectable && !child.userData?.isSystemObject
        );

        // 2. Serialize objects into JSON
        const sceneData = exportableObjects.map(obj => obj.toJSON());

        const id = `scene_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const finalName = sceneName.endsWith(".scene") ? sceneName : sceneName + ".scene";

        // 3. Create Scene File Asset
        const asset = {
            id,
            name: finalName,
            type: "scene",
            data: JSON.stringify(sceneData),
            thumbnail: this._svgIcon("scene"),
            isFavorite: false,
            isBuiltIn: false,
            folderId: this.openFolderId,
            tags: ["scene", "level"],
            history: [],
            references: []
        };

        this.assets.push(asset);
        this._saveToStorage();
        this.render();
        console.log(`AssetsPanel: Saved scene asset "${finalName}".`);
        return asset;
    }

    /**
     * Clears the active viewport and loads a .scene asset file.
     */
    static loadSceneAsset(assetId) {
        const asset = this._findById(assetId);
        if (!asset || asset.type !== "scene") return;

        if (!confirm(`Open scene "${asset.name}"? Unsaved viewport objects will be cleared.`)) return;

        // Clear existing user objects from the main scene
        if (this.scene) {
            const toRemove = this.scene.children.filter(c => c.userData?.selectable && !c.userData?.isSystemObject);
            toRemove.forEach(c => this.scene.remove(c));
        }

        // Load scene objects
        this._addToScene(assetId);
        console.log(`AssetsPanel: Loaded scene file "${asset.name}".`);
    }

    /**
     * Opens the Reference Viewer (Dependency Graph) inside the main assets grid area.
     * @param {string|null} centerAssetId - Optional ID of the asset to focus on.
     */
    static showDependencyGraph(centerAssetId = null) {
        const grid = document.getElementById('assetsGrid');
        const graphContainer = document.getElementById('referenceViewerContainer');
        const canvasContainer = document.getElementById('dependencyGraphCanvas');

        if (!grid || !graphContainer || !canvasContainer) {
            console.error("Reference Viewer DOM elements missing.");
            return;
        }

        // 1. Switch Views
        grid.style.display = 'none';
        graphContainer.style.display = 'flex';

        // 2. Clean up old network
        if (window.currentGraphNetwork) {
            window.currentGraphNetwork.destroy();
            window.currentGraphNetwork = null;
        }

        // 3. Prepare Data (Nodes & Edges)
        // Ensure vis.js is loaded
        if (typeof vis === 'undefined') {
            canvasContainer.innerHTML = '<div style="padding:20px; color:red;">Vis.js library not loaded. Cannot display graph.</div>';
            return;
        }

        const nodes = new vis.DataSet();
        const edges = new vis.DataSet();
        const allAssets = this.assets.filter(a => !a.isBuiltIn);

        allAssets.forEach(asset => {
            // ... (Your existing color/shape logic here) ...
            let color = '#555555';
            let shape = 'dot';

            // Simplified color mapping for brevity (keep your full switch logic)
            if (asset.type === 'material') { color = '#00cc66'; shape = 'box'; }
            else if (asset.type === 'texture') { color = '#ff9933'; shape = 'square'; }
            else if (asset.type === 'model') { color = '#cc33ff'; shape = 'triangle'; }

            nodes.add({
                id: asset.id,
                label: asset.name.length > 15 ? asset.name.slice(0, 12) + '...' : asset.name,
                title: `${asset.name}\nType: ${asset.type}`,
                color: { background: color, border: '#888' },
                shape: shape,
                font: { color: '#eee', size: 12, face: 'Segoe UI' },
                shadow: true
            });
        });

        // Add Edges
        allAssets.forEach(asset => {
            if (asset.references && asset.references.length > 0) {
                asset.references.forEach(refId => {
                    if (nodes.get(refId)) {
                        edges.add({
                            from: asset.id,
                            to: refId,
                            arrows: 'to',
                            color: { color: '#666', highlight: '#00aaff' },
                            width: 1,
                            smooth: { type: 'cubicBezier' }
                        });
                    }
                });
            }
        });

        // 4. Network Config (Unreal Style - Left to Right flow)
        const options = {
            height: '100%',
            width: '100%',
            autoResize: true,
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'LR', // Left to Right like UE Reference Viewer
                    sortMethod: 'directed',
                    levelSeparation: 200,
                    nodeSpacing: 100
                }
            },
            physics: false, // Hierarchical doesn't need physics usually
            interaction: {
                hover: true,
                navigationButtons: true,
                zoomView: true,
                dragView: true
            }
        };

        // 5. Initialize Network
        window.currentGraphNetwork = new vis.Network(canvasContainer, { nodes, edges }, options);

        // 6. Focus on specific asset if requested
        if (centerAssetId && nodes.get(centerAssetId)) {
            window.currentGraphNetwork.selectNodes([centerAssetId]);
            window.currentGraphNetwork.focus(centerAssetId, {
                scale: 1.0,
                animation: true
            });
        }
    }

    /**
     * Closes the Reference Viewer and shows the asset grid again.
     */
    static closeDependencyGraph() {
        const grid = document.getElementById('assetsGrid');
        const graphContainer = document.getElementById('referenceViewerContainer');

        if (grid && graphContainer) {
            graphContainer.style.display = 'none';

            // FIX: Remove inline display style so CSS classes (.list-view or default) take over
            grid.style.display = '';
        }

        if (window.currentGraphNetwork) {
            window.currentGraphNetwork.destroy();
            window.currentGraphNetwork = null;
        }
    }

    static _ensureBuiltins() {
        // 1. Clear previous built-ins to re-add correctly
        this.assets = this.assets.filter((a) => !a.isBuiltIn);

        // 2. Folder Setup
        const rootId = "sme_models";
        const natureId = "sme_nature";
        const archId = "sme_architecture";
        const gameplayId = "sme_gameplay";
        const obstaclesId = "sme_game_obstacles";

        // Ensure Root Folder exists
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
        // Migrate/repair folders saved by older AssetManager schemas. Missing
        // children arrays used to abort this method before city registration.
        this.folders[rootId].name = "SM-Engine-models";
        this.folders[rootId].parentId = null;
        this.folders[rootId].isBuiltIn = true;
        this.folders[rootId].isProjectAssetFolder = true;
        if (!Array.isArray(this.folders[rootId].children)) {
            this.folders[rootId].children = [];
        }

        // Ensure Subfolder "Nature" exists inside Root
        if (!this.folders[natureId]) {
            this.folders[natureId] = {
                id: natureId,
                name: "Nature Assets",
                parentId: rootId, // Linked to parent
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }
        this.folders[natureId].parentId = rootId;
        if (!Array.isArray(this.folders[natureId].children)) this.folders[natureId].children = [];
        if (!this.folders[rootId].children.includes(natureId)) this.folders[rootId].children.push(natureId);

        // Ensure Subfolder "Architecture" exists inside Root
        if (!this.folders[archId]) {
            this.folders[archId] = {
                id: archId,
                name: "Architecture",
                parentId: rootId, // Linked to parent
                children: [],
                isBuiltIn: true,
                isProjectAssetFolder: true
            };
        }
        this.folders[archId].parentId = rootId;
        if (!Array.isArray(this.folders[archId].children)) this.folders[archId].children = [];
        if (!this.folders[rootId].children.includes(archId)) this.folders[rootId].children.push(archId);

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
        this.folders[gameplayId].name = "Gameplay";
        this.folders[gameplayId].parentId = null;
        this.folders[gameplayId].isBuiltIn = true;
        this.folders[gameplayId].isProjectAssetFolder = true;
        if (!Array.isArray(this.folders[gameplayId].children)) {
            this.folders[gameplayId].children = [];
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
        this.folders[obstaclesId].parentId = gameplayId;
        if (!Array.isArray(this.folders[obstaclesId].children)) {
            this.folders[obstaclesId].children = [];
        }
        if (!this.folders[gameplayId].children.includes(obstaclesId)) {
            this.folders[gameplayId].children.push(obstaclesId);
        }

        // 3. Add Built-in Assets (Prims, Lights, Models, and Game Obstacles)
        const builtinPrims = this._getPrimitiveAssets();
        const builtinLights = this._getLightAssets();
        const builtinModels = this._getBuiltinModels();
        const builtinGameObstacles = this._getGameObstacleAssets();
        const builtinCityAssets = this._registerCityAssets() || [];

        for (const b of [
            ...builtinPrims,
            ...builtinLights,
            ...builtinModels,
            ...builtinGameObstacles,
            ...builtinCityAssets
        ]) {
            const existing = this.assets.find((a) => a.id === b.id);
            if (!existing) {
                this.assets.unshift({ ...b, history: [], references: [] });
            } else {
                if (b.folderId) existing.folderId = b.folderId;
                if (b.data) existing.data = b.data;
                existing.isBuiltIn = true;
            }
        }

        // 4. NEW: GENERATE SCREENSHOTS (Thumbnails)
        this.assets.forEach(asset => {
            // Only target models that have a file path and no real screenshot yet
            if (asset.type === 'model' && asset.data && asset.isBuiltIn) {
                if (!asset.thumbnail || !asset.thumbnail.startsWith('data:image')) {

                    // Call the helper function (make sure this function is defined in your script)
                    _generatePathThumbnail(asset.data).then(dataURL => {
                        asset.thumbnail = dataURL;

                        // If the assets panel is currently open, refresh the UI
                        const panel = document.getElementById('assetsPanel');
                        if (panel && panel.classList.contains('visible')) {
                            this.render();
                        }
                    }).catch(err => {
                        console.warn(`[ThumbGen] Failed for ${asset.name}:`, err);
                    });
                }
            }
        });

        this._ensureProjectManifestAssets();
        this._syncRuntimeAssetRegistry();
    }

    static _ensureProjectManifestAssets() {
        const manifest = typeof window !== "undefined" ? window.SMProjectAssetManifest : null;
        if (!manifest) return;

        const folderIdMap = new Map();

        const manifestFolders = Array.isArray(manifest.folders) ? manifest.folders : [];
        manifestFolders.forEach((folder) => {
            if (!folder?.id || !folder?.name) return;

            const resolvedParentId = folder.parentId
                ? (folderIdMap.get(folder.parentId) || folder.parentId)
                : null;

            const matchingFolder =
                this.folders[folder.id] ||
                Object.values(this.folders).find(
                    (entry) =>
                        entry.name === folder.name &&
                        (entry.parentId || null) === (resolvedParentId || null),
                );

            const resolvedId = matchingFolder?.id || folder.id;
            folderIdMap.set(folder.id, resolvedId);

            const existing = this.folders[resolvedId] || {};
            this.folders[resolvedId] = {
                ...existing,
                id: resolvedId,
                name: folder.name,
                parentId: resolvedParentId,
                children: Array.isArray(folder.children) ? [...folder.children] : [],
                isBuiltIn: true,
                isProjectAssetFolder: true,
            };
        });

        manifestFolders.forEach((folder) => {
            const resolvedId = folderIdMap.get(folder.id) || folder.id;
            const resolvedParentId = folder.parentId
                ? (folderIdMap.get(folder.parentId) || folder.parentId)
                : null;

            if (this.folders[resolvedId]) {
                this.folders[resolvedId].parentId = resolvedParentId;
            }

            if (!resolvedParentId || !this.folders[resolvedParentId]) return;
            const parent = this.folders[resolvedParentId];
            if (!Array.isArray(parent.children)) parent.children = [];
            if (!parent.children.includes(resolvedId)) parent.children.push(resolvedId);
        });

        const manifestAssets = Array.isArray(manifest.assets) ? [...manifest.assets] : [];
        if (Array.isArray(manifest.groups)) {
            manifest.groups.forEach((group) => {
                const basePath = String(group.basePath || "").replace(/\\/g, "/").replace(/\/+$/, "");
                const folderId = group.folderId
                    ? (folderIdMap.get(group.folderId) || group.folderId)
                    : null;
                const type = group.type || "texture";
                const tags = Array.isArray(group.tags) ? [...group.tags] : [];
                const files = Array.isArray(group.files) ? group.files : [];
                const idPrefix = group.idPrefix || "project_asset";

                files.forEach((fileName) => {
                    if (this._isHiddenProjectEntryName(fileName)) return;
                    const source = `${basePath}/${fileName}`;
                    manifestAssets.push({
                        id: `${idPrefix}_${this._slugifyAssetName(fileName)}`,
                        name: fileName,
                        type,
                        folderId,
                        data: source,
                        thumbnail: this._isSceneMediaAssetType(type) && type !== "video" ? source : null,
                        tags,
                    });
                });
            });
        }

        manifestAssets.forEach((asset) => {
            if (!asset?.id || !asset?.name || !asset?.type) return;
            if (this._isHiddenProjectEntryName(asset.name)) return;

            const normalizedData = asset.data || asset.url || null;
            const resolvedFolderId = asset.folderId
                ? (folderIdMap.get(asset.folderId) || asset.folderId)
                : null;

            const normalized = {
                id: asset.id,
                name: asset.name,
                type: asset.type,
                data: normalizedData ? this._normalizeAssetSource(normalizedData) : null,
                thumbnail: asset.thumbnail
                    ? this._normalizeAssetSource(asset.thumbnail)
                    : (this._isSceneMediaAssetType(asset.type) && asset.type !== "video" && normalizedData ? this._normalizeAssetSource(normalizedData) : null),
                isFavorite: false,
                isBuiltIn: true,
                isProjectAsset: true,
                folderId: resolvedFolderId,
                tags: Array.isArray(asset.tags) ? [...asset.tags] : [],
                history: [],
                references: [],
            };

            const existingIndex = this.assets.findIndex((entry) => entry.id === normalized.id);
            if (existingIndex >= 0) {
                this.assets[existingIndex] = {
                    ...this.assets[existingIndex],
                    ...normalized,
                };
            } else {
                this.assets.push(normalized);
            }
        });
    }

    static _slugifyAssetName(value = "") {
        return String(value || "")
            .toLowerCase()
            .replace(/\.[^.]+$/, "")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    // MODIFIED: Added 'prefab' type
    static _getAssetType = (filename) => {
        const ext = filename.split(".").pop().toLowerCase();
        if (["glb", "gltf", "fbx", "obj"].includes(ext)) return "model";
        if (["png", "jpg", "jpeg", "webp", "bmp", "gif", "avif", "tif", "tiff"].includes(ext)) return "texture";
        if (["svg", "ico"].includes(ext)) return "icon";
        if (["mp4", "webm", "mov", "m4v", "ogv", "avi"].includes(ext)) return "video";
        if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return "audio";
        if (["hdr", "exr"].includes(ext)) return "hdri";
        // Blender/Godot/USD companion files are kept in the asset library as
        // non-renderable package members. They can be inspected and repacked,
        // but are never sent to a texture loader as if they were HDR pixels.
        if (["blend", "tres", "usd", "usda", "usdc"].includes(ext)) return "hdri-companion";
        if (["json"].includes(ext)) return "material"; // Custom JSON format for PBR materials
        if (["js"].includes(ext)) return "code";
        if (["prefab"].includes(ext)) return "prefab"; // NEW: Prefab type
        if (["scene", "sme"].includes(ext)) return "scene";
        return null;
    };
    // END OF CLASS
}
for(const key of Reflect.ownKeys(SMAssetsPanelScriptsBuiltinsMixin)){
if(key==="length"||key==="name"||key==="prototype")continue;
const descriptor=Object.getOwnPropertyDescriptor(SMAssetsPanelScriptsBuiltinsMixin,key);
if(!descriptor)continue;
Object.defineProperty(AssetsPanel,key,descriptor);
}
global.__SMAssetsPanelLoadedModules=global.__SMAssetsPanelLoadedModules||[];
global.__SMAssetsPanelLoadedModules.push("AssetsPanelScriptsBuiltins");
})(window);
