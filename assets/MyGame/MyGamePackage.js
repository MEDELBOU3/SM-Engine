/**
 * MyGamePackage.js — persistence-safe duplicate-guard build
 * Registers the physical assets/MyGame package in AssetsPanel and builds its
 * startup THREE.Scene with lighter UE5-style Prototype Grid textures across all objects.
 */
(function (root) {
    "use strict";

    const PROJECT_NAME = "MyGame";
    const PROJECT_ID = "smgame_mygame_starter";
    const SCENE_ID = "mygame_main_scene";
    const PATHS = {
        manifest: "assets/MyGame/game.json",
        scene: "assets/MyGame/scenes/main.scene.json",
        input: "assets/MyGame/config/input.json",
        player: "assets/MyGame/config/player.json",
        runtime: "assets/MyGame/scripts/MyGameRuntime.js"
    };

    const FALLBACK_MANIFEST = {
        format: "SM_GAME_PROJECT",
        version: 1,
        structureVersion: 1,
        id: PROJECT_ID,
        name: PROJECT_NAME,
        gameMode: "GAMEPLAY_SAMPLE",
        replaceDefaultWorld: true,
        startupScene: SCENE_ID,
        startupSceneId: SCENE_ID,
        startupSceneName: "Main.smscene",
        startupScenePath: "Maps/Main.smscene",
        player: { type: "SMPlayerSystem", spawnPosition: [0, 0, 22], camera: "SMPlayerCamera" },
        renderer: { exposure: 1.05, shadows: true },
        gameplay: {
            title: "Neon Core Run",
            objective: "Collect every energy core, avoid the sentries, then reach extraction.",
            timeLimit: 90,
            startingHealth: 3
        }
    };

    // Lighter Palette Fallback Scene Definition
    const FALLBACK_SCENE = {
        format: "SM_GAME_BLUEPRINT",
        version: 1,
        name: "Main",
        background: "#1e293b",
        fog: { color: "#334155", near: 40, far: 130 },
        arena: {
            size: 60,
            floorColor: "#3b4759",
            accentColor: "#38bdf8",
            wallColor: "#4f5e75",
            coverColor: "#cf6b34"
        },
        spawn: [0, 0, 22],
        extraction: [0, 0.2, -23],
        collectibles: [
            [-20, 1.4, 17], [18, 1.4, 16], [-17, 1.4, -2],
            [16, 1.4, -4], [-10, 1.4, -18], [11, 1.4, -19]
        ],
        hazards: [[-8, 0.8, 8], [9, 0.8, 5], [-3, 0.8, -8], [6, 0.8, -14]],
        cover: [
            [-16, 1.5, 8, 5, 3, 3], [15, 2, 7, 4, 4, 6],
            [-11, 1, -9, 7, 2, 3], [13, 1.5, -13, 5, 3, 4],
            [0, 2, 0, 4, 4, 4]
        ]
    };

    // =========================================================================
    // PROCEDURAL PROTOTYPE GRID TEXTURE GENERATOR
    // =========================================================================
    const textureCache = new Map();

    function createDevGridTexture({
        baseColor = "#3b4759",
        lineColor = "rgba(255, 255, 255, 0.45)",
        subLineColor = "rgba(255, 255, 255, 0.12)",
        crossColor = "rgba(255, 255, 255, 0.75)",
        divisions = 10,
        showCrosses = true
    } = {}) {
        const key = `${baseColor}_${lineColor}_${subLineColor}_${divisions}_${showCrosses}`;
        if (textureCache.has(key)) return textureCache.get(key);

        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { alpha: false });

        // 1. Base Solid Color
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // 2. 10x10 Subdivisions
        const step = size / divisions;
        ctx.strokeStyle = subLineColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 1; i < divisions; i++) {
            if (i % 5 === 0) continue;
            const p = Math.round(i * step) + 0.5;
            ctx.moveTo(p, 0); ctx.lineTo(p, size);
            ctx.moveTo(0, p); ctx.lineTo(size, p);
        }
        ctx.stroke();

        // 3. Mid 5m / 50% Lines
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.0;
        const midP = Math.round(size * 0.5) + 0.5;
        ctx.beginPath();
        ctx.moveTo(midP, 0); ctx.lineTo(midP, size);
        ctx.moveTo(0, midP); ctx.lineTo(size, midP);
        ctx.stroke();

        // 4. Primary Outer Border
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3.5;
        ctx.strokeRect(1.75, 1.75, size - 3.5, size - 3.5);

        // 5. White Crosshairs (+)
        if (showCrosses) {
            ctx.strokeStyle = crossColor;
            ctx.lineWidth = 3.0;
            const crossRadius = 16;
            const nodes = [
                [size * 0.5, size * 0.5],
                [0, 0], [size, 0], [0, size], [size, size]
            ];
            nodes.forEach(([cx, cy]) => {
                ctx.beginPath();
                ctx.moveTo(Math.max(0, cx - crossRadius), cy);
                ctx.lineTo(Math.min(size, cx + crossRadius), cy);
                ctx.moveTo(cx, Math.max(0, cy - crossRadius));
                ctx.lineTo(cx, Math.min(size, cy + crossRadius));
                ctx.stroke();
            });
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;

        textureCache.set(key, texture);
        return texture;
    }

    const MyGamePackage = {
        installed: false,
        projectFolderId: null,

        async _loadJSON(path, fallback) {
            try {
                const response = await fetch(path, { cache: "no-store" });
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                return await response.json();
            } catch (error) {
                console.warn(`[MyGamePackage] Using embedded fallback for ${path}.`, error);
                return JSON.parse(JSON.stringify(fallback));
            }
        },

        async _loadText(path, fallback = "") {
            try {
                const response = await fetch(path, { cache: "no-store" });
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                return await response.text();
            } catch {
                return fallback;
            }
        },

        _tag(object, extra = {}) {
            object.userData = {
                smGameProjectObject: true,
                smGameProjectId: PROJECT_ID,
                workspaceOnly: "GAMEPLAY_SAMPLE",
                selectable: true,
                ignoreInHierarchy: false,
                ...(object.userData || {}),
                ...extra
            };
            return object;
        },

        // Creates a BoxGeometry with UVs scaled to match world meters (no texture distortion)
        _createGridBoxGeometry(width, height, depth, unit = 1.0) {
            const geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
            const uv = geometry.attributes.uv;
            const faceScales = [
                [depth / unit, height / unit], // +X
                [depth / unit, height / unit], // -X
                [width / unit, depth / unit],  // +Y (Top)
                [width / unit, depth / unit],  // -Y (Bottom)
                [width / unit, height / unit], // +Z
                [width / unit, height / unit]  // -Z
            ];

            for (let face = 0; face < 6; face++) {
                const start = face * 4;
                const scaleU = faceScales[face][0];
                const scaleV = faceScales[face][1];
                for (let i = 0; i < 4; i++) {
                    const index = start + i;
                    uv.setXY(index, uv.getX(index) * scaleU, uv.getY(index) * scaleV);
                }
            }
            uv.needsUpdate = true;
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            return geometry;
        },

        _box(name, size, position, material, userData = {}, unit = 2.0) {
            const geometry = this._createGridBoxGeometry(size[0], size[1], size[2], unit);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = name;
            mesh.position.set(position[0], position[1], position[2]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return this._tag(mesh, userData);
        },

        buildScene(definition = FALLBACK_SCENE) {
            const scene = new THREE.Scene();
            scene.name = "MyGame_Main";

            // 1. Lighter Background & Fog
            const bgHex = definition.background || "#1e293b";
            const fogHex = definition.fog?.color || "#334155";
            scene.background = new THREE.Color(bgHex);
            scene.fog = new THREE.Fog(
                fogHex,
                Number(definition.fog?.near || 40),
                Number(definition.fog?.far || 130)
            );
            scene.userData = {
                smGameProjectScene: true,
                smGameProjectId: PROJECT_ID,
                smSceneBlueprint: definition.name || "Main"
            };

            const world = this._tag(new THREE.Group(), {
                isGameWorldRoot: true,
                isSelectableRoot: true
            });
            world.name = "MyGameWorld";
            scene.add(world);

            const arena = definition.arena || {};
            const arenaSize = Number(arena.size || 60);

            // =================================================================
            // 2. LIGHTER PROTOTYPE GRID MATERIALS
            // =================================================================

            // A. Floor Material (Clean Slate Blue with Cyan/White Accents)
            const floorTexture = createDevGridTexture({
                baseColor: arena.floorColor || "#3b4759",
                lineColor: "rgba(56, 189, 248, 0.40)",
                subLineColor: "rgba(255, 255, 255, 0.08)",
                crossColor: "rgba(56, 189, 248, 0.85)",
                divisions: 10,
                showCrosses: true
            });
            const floorMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: floorTexture,
                roughness: 0.82,
                metalness: 0.0,
                side: THREE.DoubleSide,
                shadowSide: THREE.FrontSide,
                dithering: true
            });

            // B. Boundary Walls Material (Clean Slate Grey)
            const wallTexture = createDevGridTexture({
                baseColor: arena.wallColor || "#4f5e75",
                lineColor: "rgba(255, 255, 255, 0.35)",
                subLineColor: "rgba(255, 255, 255, 0.10)",
                crossColor: "rgba(255, 255, 255, 0.65)",
                divisions: 5,
                showCrosses: false
            });
            const wallMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: wallTexture,
                roughness: 0.80,
                metalness: 0.0,
                side: THREE.DoubleSide,
                shadowSide: THREE.FrontSide,
                dithering: true
            });

            // C. Cover Obstacles Material (Vibrant Prototype Orange)
            const coverTexture = createDevGridTexture({
                baseColor: arena.coverColor || "#cf6b34",
                lineColor: "rgba(80, 25, 10, 0.45)",
                subLineColor: "rgba(255, 255, 255, 0.12)",
                crossColor: "rgba(255, 255, 255, 0.75)",
                divisions: 5,
                showCrosses: true
            });
            const coverMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                map: coverTexture,
                roughness: 0.80,
                metalness: 0.0,
                side: THREE.DoubleSide,
                shadowSide: THREE.FrontSide,
                dithering: true
            });

            const accent = new THREE.Color(arena.accentColor || "#38bdf8");

            // =================================================================
            // 3. BUILD GEOMETRY WITH UNIFORM UV SCALING
            // =================================================================

            const ground = this._box(
                "MyGameGround",
                [arenaSize, 1, arenaSize],
                [0, -0.5, 0],
                floorMaterial,
                { isGameGround: true, collidable: true, receiveShadow: true },
                2.0 // 2m tile size
            );
            world.add(ground);

            const obstacles = this._tag(new THREE.Group(), { isObstacleGroup: true });
            obstacles.name = "MyGameObstacles";
            world.add(obstacles);

            // Boundary Walls
            const half = arenaSize / 2;
            [
                [0, 1.5, -half, arenaSize, 3, 1],
                [0, 1.5, half, arenaSize, 3, 1],
                [-half, 1.5, 0, 1, 3, arenaSize],
                [half, 1.5, 0, 1, 3, arenaSize]
            ].forEach((entry, index) => {
                obstacles.add(this._box(
                    `ArenaWall_${index + 1}`,
                    [entry[3], entry[4], entry[5]],
                    [entry[0], entry[1], entry[2]],
                    wallMaterial,
                    { collidable: true, isArenaBoundary: true },
                    2.0
                ));
            });

            // Cover Blocks
            (definition.cover || []).forEach((entry, index) => {
                obstacles.add(this._box(
                    `Cover_${index + 1}`,
                    [entry[3], entry[4], entry[5]],
                    [entry[0], entry[1], entry[2]],
                    coverMaterial,
                    { collidable: true, isCover: true },
                    2.0
                ));
            });

            // Energy Core Collectibles
            const collectibles = this._tag(new THREE.Group(), { isCollectibleGroup: true });
            collectibles.name = "MyGameCollectibles";
            world.add(collectibles);
            const coreMaterial = new THREE.MeshStandardMaterial({
                color: accent,
                emissive: accent,
                emissiveIntensity: 2.2,
                roughness: 0.25,
                metalness: 0.1
            });
            (definition.collectibles || []).forEach((position, index) => {
                const core = new THREE.Mesh(
                    new THREE.IcosahedronGeometry(0.72, 1),
                    coreMaterial
                );
                core.name = `EnergyCore_${index + 1}`;
                core.position.fromArray(position);
                core.castShadow = true;
                this._tag(core, {
                    gameplayType: "collectible",
                    collectibleIndex: index,
                    baseY: Number(position[1] || 1.4)
                });
                collectibles.add(core);
            });

            // Sentry Hazards
            const hazards = this._tag(new THREE.Group(), { isHazardGroup: true });
            hazards.name = "MyGameHazards";
            world.add(hazards);
            const hazardMaterial = new THREE.MeshStandardMaterial({
                color: 0xf43f5e,
                emissive: 0xbe123c,
                emissiveIntensity: 1.8,
                roughness: 0.35,
                metalness: 0.0
            });
            (definition.hazards || []).forEach((position, index) => {
                const sentry = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.75, 1.1, 1.6, 8),
                    hazardMaterial
                );
                sentry.name = `Sentry_${index + 1}`;
                sentry.position.fromArray(position);
                sentry.castShadow = true;
                this._tag(sentry, {
                    gameplayType: "hazard",
                    hazardIndex: index,
                    baseY: Number(position[1] || 0.8)
                });
                hazards.add(sentry);
            });

            // Extraction Ring
            const extractionPosition = definition.extraction || [0, 0.2, -23];
            const extractionMaterial = new THREE.MeshStandardMaterial({
                color: 0x4ade80,
                emissive: 0x16a34a,
                emissiveIntensity: 1.8,
                roughness: 0.3,
                metalness: 0.0,
                transparent: true,
                opacity: 0.45
            });
            const extraction = new THREE.Mesh(
                new THREE.TorusGeometry(3, 0.22, 12, 64),
                extractionMaterial
            );
            extraction.name = "ExtractionZone";
            extraction.position.fromArray(extractionPosition);
            extraction.rotation.x = Math.PI / 2;
            this._tag(extraction, {
                gameplayType: "extraction",
                locked: true
            });
            world.add(extraction);

            // Player Spawn Decal
            const spawn = this._tag(new THREE.Mesh(
                new THREE.RingGeometry(1.8, 2.15, 48),
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.50,
                    side: THREE.DoubleSide
                })
            ), { gameplayType: "spawn", selectable: false });
            spawn.name = "PlayerSpawn";
            spawn.position.fromArray(definition.spawn || [0, 0.02, 22]);
            spawn.position.y = 0.025;
            spawn.rotation.x = -Math.PI / 2;
            world.add(spawn);

            // =================================================================
            // 4. BALANCED SUN & FILL LIGHTS
            // =================================================================
            const lights = this._tag(new THREE.Group(), { isGameLightRig: true });
            lights.name = "MyGameLights";
            world.add(lights);

            const sun = new THREE.DirectionalLight(0xfffdf7, 2.6);
            sun.name = "MyGameSun";
            sun.position.set(-26, 42, 22);
            sun.castShadow = true;
            sun.shadow.mapSize.set(2048, 2048);
            sun.shadow.camera.left = -45;
            sun.shadow.camera.right = 45;
            sun.shadow.camera.top = 45;
            sun.shadow.camera.bottom = -45;
            sun.shadow.camera.near = 0.5;
            sun.shadow.camera.far = 130;
            sun.shadow.bias = -0.00008;
            sun.shadow.normalBias = 0.025;
            this._tag(sun, { isGameProjectLight: true });

            const target = this._tag(new THREE.Object3D(), { selectable: false });
            target.name = "MyGameSunTarget";
            target.position.set(0, 0, 0);
            sun.target = target;
            lights.add(target, sun);

            const hemi = new THREE.HemisphereLight(0xb4d4ff, 0x334155, 0.65);
            hemi.name = "MyGameSkyLight";
            this._tag(hemi, { isGameProjectLight: true });
            lights.add(hemi);

            const ambient = new THREE.AmbientLight(0xdce7f5, 0.22);
            ambient.name = "MyGameAmbient";
            this._tag(ambient, { isGameProjectLight: true });
            lights.add(ambient);

            world.traverse(object => this._tag(object));
            scene.updateMatrixWorld(true);
            return scene;
        },

        _thumbnail(label, color = "#38bdf8") {
            return `
                <svg viewBox="0 0 128 128" width="100%" height="100%" aria-hidden="true">
                    <defs><linearGradient id="mygame-g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1e293b"/><stop offset="1" stop-color="#334155"/></linearGradient></defs>
                    <rect width="128" height="128" rx="12" fill="url(#mygame-g)"/>
                    <circle cx="64" cy="53" r="25" fill="none" stroke="${color}" stroke-width="6"/>
                    <path d="M53 53l8 8 16-19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                    <text x="64" y="101" text-anchor="middle" fill="#fff" font-family="Arial" font-size="11" font-weight="700">${label}</text>
                </svg>`;
        },

        _upsertAsset(AP, match, values) {
            let asset = AP.assets.find(match);
            if (asset) {
                Object.assign(asset, values);
            } else {
                asset = { history: [], references: [], isFavorite: false, ...values };
                AP.assets.push(asset);
            }
            return asset;
        },

        async register() {
            if (this.installed) return true;
            const AP = root.AssetsPanel || null;
            if (!AP?.dom?.grid || typeof AP.initializeGameProjectStructure !== "function") {
                setTimeout(() => this.register(), 150);
                return false;
            }

            // AssetsPanel restores IndexedDB asynchronously. Never decide that
            // MyGame is missing until the persistent folder tree is hydrated.
            try {
                if (
                    AP.assetStorageReady &&
                    typeof AP.assetStorageReady.then === "function"
                ) {
                    await AP.assetStorageReady;
                } else if (
                    typeof AP._getPersistentAssetStorage === "function"
                ) {
                    await AP._getPersistentAssetStorage();
                }
            } catch (error) {
                console.warn(
                    "[MyGamePackage] Persistent asset storage was not available.",
                    error
                );
            }

            AP.dedupeGameProjects?.({
                preferredName: PROJECT_NAME,
                save: true,
                render: false
            });

            this.installed = true;
            const [manifest, sceneDefinition, inputConfig, playerConfig, runtimeSource] =
                await Promise.all([
                    this._loadJSON(PATHS.manifest, FALLBACK_MANIFEST),
                    this._loadJSON(PATHS.scene, FALLBACK_SCENE),
                    this._loadJSON(PATHS.input, { format: "SM_INPUT_MAP", actions: {} }),
                    this._loadJSON(PATHS.player, { format: "SM_PLAYER_CONFIG", spawnPosition: [0, 0, 22] }),
                    this._loadText(PATHS.runtime, "// MyGame runtime is loaded by index.html")
                ]);

            manifest.format = "SM_GAME_PROJECT";
            manifest.id = manifest.id || PROJECT_ID;
            manifest.name = PROJECT_NAME;
            manifest.gameMode = "GAMEPLAY_SAMPLE";
            manifest.replaceDefaultWorld = true;
            manifest.startupScene = SCENE_ID;
            manifest.startupSceneId = SCENE_ID;
            manifest.startupSceneName = "Main.smscene";
            manifest.startupScenePath = "Maps/Main.smscene";

            let project =
                Object.values(AP.folders || {}).find(folder =>
                    folder?.isGameProject &&
                    folder.projectId === PROJECT_ID
                ) ||
                Object.values(AP.folders || {}).find(folder =>
                    folder?.isGameProject &&
                    String(folder.name || "").trim().toLowerCase() ===
                        PROJECT_NAME.toLowerCase()
                );
            if (!project) {
                const folderId = AP.createFolder(PROJECT_NAME, null);
                project = AP.folders?.[folderId] || null;
            }
            if (!project) {
                this.installed = false;
                console.error("[MyGamePackage] Could not create the MyGame project folder.");
                return false;
            }

            Object.assign(project, {
                isGameProject: true,
                isBundledGameProject: true,
                projectId: manifest.id,
                projectFormat: "SM_GAME_PROJECT",
                projectVersion: manifest.version || 1,
                structureVersion: 1
            });
            this.projectFolderId = project.id;

            // Repair older sessions that already accumulated duplicate MyGame
            // roots. The selected project has the stable bundled projectId now,
            // so the duplicate guard will keep this one.
            const canonicalProject =
                AP.dedupeGameProjects?.({
                    preferredName: PROJECT_NAME,
                    save: false,
                    render: false
                }) || project;

            project = canonicalProject;
            this.projectFolderId = project.id;

            Object.assign(project, {
                isGameProject: true,
                isBundledGameProject: true,
                projectId: manifest.id,
                projectFormat: "SM_GAME_PROJECT",
                projectVersion: manifest.version || 1,
                structureVersion: 1
            });

            AP.initializeGameProjectStructure(project.id);
            const folders = project.gameContentFolders || {};
            const mapsFolderId = folders.Maps;
            const scriptsFolderId = folders.Scripts;
            const configFolderId = folders.Config;

            const manifestAsset = this._upsertAsset(
                AP,
                asset => asset.folderId === project.id && (
                    asset.isGameProjectManifest || asset.name === "game.smproject"
                ),
                {
                    id: project.manifestAssetId || "mygame_manifest_asset",
                    name: "game.smproject",
                    type: "game-project",
                    folderId: project.id,
                    data: JSON.stringify(manifest, null, 2),
                    definition: manifest,
                    thumbnail: this._thumbnail("MY GAME", "#4ade80"),
                    tags: ["game-project", "playable", "bundled", "mygame"],
                    isGameProjectManifest: true,
                    isBundledGameAsset: true,
                    isBuiltIn: false,
                    projectId: manifest.id,
                    sourcePath: PATHS.manifest
                }
            );
            project.manifestAssetId = manifestAsset.id;

            const gameScene = this.buildScene(sceneDefinition);
            const scenePayload = {
                format: "SM_GAME_SCENE",
                version: 1,
                sceneId: SCENE_ID,
                name: "Main",
                projectId: manifest.id,
                sourcePath: PATHS.scene,
                savedAt: new Date().toISOString(),
                gameplay: manifest.gameplay || {},
                scene: gameScene.toJSON()
            };
            const sceneAsset = this._upsertAsset(
                AP,
                asset => asset.projectId === manifest.id && (
                    asset.id === SCENE_ID || asset.name === "Main.smscene"
                ),
                {
                    id: SCENE_ID,
                    sceneId: SCENE_ID,
                    name: "Main.smscene",
                    type: "game-scene",
                    folderId: mapsFolderId,
                    data: JSON.stringify(scenePayload),
                    definition: scenePayload,
                    thumbnail: this._thumbnail("MAIN MAP"),
                    tags: ["game-scene", "startup", "arena", "playable"],
                    isGameScene: true,
                    isStartupScene: true,
                    isBundledGameAsset: true,
                    isBuiltIn: false,
                    projectId: manifest.id,
                    sourcePath: PATHS.scene
                }
            );
            project.startupSceneAssetId = sceneAsset.id;

            [
                ["input.json", "config", inputConfig, PATHS.input],
                ["player.json", "config", playerConfig, PATHS.player]
            ].forEach(([name, type, definition, sourcePath]) => {
                this._upsertAsset(
                    AP,
                    asset => asset.projectId === manifest.id && asset.name === name,
                    {
                        id: `mygame_${name.replace(/\W+/g, "_")}`,
                        name,
                        type,
                        folderId: configFolderId,
                        data: JSON.stringify(definition, null, 2),
                        definition,
                        thumbnail: AP._svgIcon?.("code") || "",
                        tags: ["mygame", "config"],
                        isBundledGameAsset: true,
                        isBuiltIn: false,
                        projectId: manifest.id,
                        sourcePath
                    }
                );
            });

            this._upsertAsset(
                AP,
                asset => asset.projectId === manifest.id && asset.name === "MyGameRuntime.js",
                {
                    id: "mygame_runtime_script",
                    name: "MyGameRuntime.js",
                    type: "code",
                    folderId: scriptsFolderId,
                    data: runtimeSource,
                    thumbnail: AP._svgIcon?.("code") || "",
                    tags: ["mygame", "script", "runtime", "gameplay"],
                    isBundledGameAsset: true,
                    isBuiltIn: false,
                    projectId: manifest.id,
                    sourcePath: PATHS.runtime
                }
            );

            AP.activeGameProjectFolderId = project.id;

            AP.dedupeGameProjects?.({
                preferredName: PROJECT_NAME,
                save: false,
                render: false
            });

            AP.expandedSections?.add?.("project");
            AP.expandedFolders?.add?.(project.id);
            AP.currentCategory = "project";
            AP.currentFilter = "all";
            AP.openFolderId = null;
            AP._saveToStorage?.();
            AP._syncRuntimeAssetRegistry?.();
            AP.render?.();
            AP._buildTagCloud?.();

            root.dispatchEvent(new CustomEvent("sm-bundled-game-ready", {
                detail: { project, manifest, sceneAsset }
            }));
            console.log("[MyGamePackage] MyGame with Light Grid Palette is ready in AssetsPanel.", {
                folder: project.id,
                startupScene: sceneAsset.id
            });
            return true;
        }
    };

    root.MyGamePackage = MyGamePackage;
    root.addEventListener("sm-assets-panel-ready", () => MyGamePackage.register());
    if (document.readyState !== "loading") {
        setTimeout(() => MyGamePackage.register(), 0);
    } else {
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(() => MyGamePackage.register(), 0),
            { once: true }
        );
    }
})(window);