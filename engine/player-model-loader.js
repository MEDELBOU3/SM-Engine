// ============================================================
// engine/player-model-loader.js
//
// Everything related to loading/swapping the player character
// model (FBX/GLB), plus the "Player Model" side panel UI.
// Depends on 00-globals.js (scene, camera, player, ground,
// obstaclesGroup, collidableMeshes, tpsCamera, physicsSystem,
// playerGraphEditor, guiContainer) and on window.rigManager /
// window.ual2Engine / window.gpsMiniMap set up elsewhere.
// ============================================================

function groundPlayerModelAt(model, options = {}) {
    if (!model) return;
    const floorY = Number.isFinite(options.floorY) ? options.floorY : (ground?.position?.y ?? 0);
    const targetX = Number.isFinite(options.x) ? options.x : model.position.x;
    const targetZ = Number.isFinite(options.z) ? options.z : model.position.z;
    const targetY = Number.isFinite(options.y) ? options.y : model.position.y;
    const offsetY = Number.isFinite(options.offsetY) ? options.offsetY : 0.01;

    model.position.set(targetX, targetY, targetZ);
    if (model.updateMatrixWorld) model.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(model);
    if (!Number.isFinite(bounds.min.y)) return;

    model.position.y += (floorY - bounds.min.y) + offsetY;
    if (model.updateMatrixWorld) model.updateMatrixWorld(true);
}

const PLAYER_MODEL_LIBRARY = [
    { label: 'T-Pose (FBX)', path: 'assets/models/T-Pose.fbx', scale: 0.01 },
    { label: 'Y_Bot (FBX)', path: 'assets/models/Y_Bot.fbx', scale: 0.01 },
    { label: 'Swat (FBX)', path: 'assets/models/Swat.fbx', scale: 0.01 },
    { label: 'Remy (Monster)', path: 'assets/models/Remy.fbx', scale: 0.01 },
    { label: 'skm_uefn_mannequin (FBX)', path: 'assets/models/skm_uefn_mannequin.fbx', scale: 0.01 },
    { label: 'Female Player', path: 'assets/models/Female-Player.glb', scale: 1 },
    { label: 'Male Player', path: 'assets/models/Male-Player.glb', scale: 1 },
    { label: 'Mutant (fbx)', path: 'assets/models/Mutant.fbx', scale: 0.01 },
    { label: 'Kachujin G Rosales (fbx)', path: 'assets/models/Kachujin_G_Rosales.fbx', scale: 0.01 },
];
window.availablePlayerModels = PLAYER_MODEL_LIBRARY.slice();

function removeExistingPlayerModel() {
    if (!player?.model) return;
    const existingModel = player.model;
    const existingSystemFlag = !!existingModel.userData?.isSystemObject;
    existingModel.userData.isSystemObject = false;
    try {
        removeObjectFromScene(existingModel);
    } catch (error) {
        console.warn('Failed to remove existing player model:', error);
        existingModel.parent?.remove?.(existingModel);
    }
    existingModel.userData.isSystemObject = existingSystemFlag;
    if (typeof updateHierarchy === 'function') updateHierarchy();
}

function prepareLoadedPlayerAsset(loadedAsset, options = {}) {
    const extension = String(options.extension || '').toLowerCase();
    const gltf = extension === 'fbx'
        ? { scene: loadedAsset, animations: loadedAsset.animations || [] }
        : loadedAsset;

    const mainCharacterModel = gltf.scene;
    const modelScale = Number.isFinite(options.scale) ? options.scale : (extension === 'fbx' ? 0.01 : 1);
    mainCharacterModel.userData.isSystemObject = false; // Now it shows in Hierarchy
    mainCharacterModel.userData.ignoreInHierarchy = false;
    mainCharacterModel.scale.set(modelScale, modelScale, modelScale);

    mainCharacterModel.traverse(child => {
        if (child.name && child.name.startsWith('mixamorig')) {
            child.name = child.name.replace(/mixamorig\d+/, 'mixamorig');
        }
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.isPlayer = true;
        }
    });

    (gltf.animations || []).forEach(clip => {
        clip.tracks.forEach(track => {
            if (track.name.startsWith('mixamorig')) {
                track.name = track.name.replace(/mixamorig\d+/, 'mixamorig');
            }
        });
    });

    return { gltf, mainCharacterModel };
}

function ensurePlayerSystemsBound(mainCharacterModel) {
    window.ual2Engine = integrateUAL2(
        player,
        scene,
        {
            hudHostId: 'gui-container',
            debug: true
        }
    ) || window.ual2Engine;

    if (player?.model) {
        if (!tpsCamera) tpsCamera = new ThirdPersonCamera(camera, player.model);
        tpsCamera.target = player.model;
        tpsCamera.currentLookAt.copy(player.model.position);
        tpsCamera.update(0.016);
    }

    const minimapContainer = document.getElementById('minimap-ui');
    if (window.gpsMiniMap) {
        window.gpsMiniMap.player = player;
    } else if (minimapContainer) {
        window.gpsMiniMap = new GPSMiniMap(scene, player, camera, minimapContainer);
        window.gpsMiniMap.addPointOfInterest(new THREE.Vector3(0, 0, 0), 'Spawn', '#00ff00');
        window.gpsMiniMap.addPointOfInterest(new THREE.Vector3(14.65, 3, -12.2), 'Platform A', '#ffff00');
    }

    window.rigManager?.setupRigForObject?.(mainCharacterModel);

    if (!playerGraphEditor) {
        playerGraphEditor = new PlayerGraphEditor(player, 'open-player-graph');
    } else {
        playerGraphEditor.player = player;
    }
    window.playerGraphEditor = playerGraphEditor;
}

function applyLoadedPlayerAsset(loadedAsset, options = {}) {
    const wasActive = !!player?.isActive;
    const previousPosition = player?.model?.position?.clone() || new THREE.Vector3(0, 0, 5);
    const previousQuaternion = player?.model?.quaternion?.clone() || null;

    // If the character is ragdolling, tear the ragdoll down first so the
    // swap does not leave orphaned physics bodies behind.
    window.ragdollSystem?.disableRagdoll?.();

    // 1. Remove visual model AND physics body
    if (player.physicsBody) {
        physicsSystem.removeBody(player.model);
    }
    removeExistingPlayerModel();
    player.prepareForModelSwap?.();

    // 2. Setup visual model
    const { gltf, mainCharacterModel } = prepareLoadedPlayerAsset(loadedAsset, options);
    scene.add(mainCharacterModel);

    // 3. Setup Player System
    player.init(gltf, collidableMeshes, obstaclesGroup, ground);
    if (previousQuaternion) player.model.quaternion.copy(previousQuaternion);
    player.model = mainCharacterModel;

    groundPlayerModelAt(player.model, {
        x: previousPosition.x,
        z: previousPosition.z,
        floorY: ground?.position?.y ?? 0
    });

    // 4. REGISTER PLAYER PHYSICS
    physicsSystem.addBody(player.model, {
        mass: 1, // Dynamic mass
        shapeType: 'capsule', // Capsules are best for characters
        fixedRotation: true,  // Keeps the character from falling over like a pin
        friction: 0.1,
        pos: player.model.position.clone()
    });

    player.fitColliderToModel?.();
    player.updatePlayerBox?.();

    addObjectToScene(player.model, 'Player');
    ensurePlayerSystemsBound(mainCharacterModel);

    if (wasActive) player.activate();
    else player.deactivate();
}

function loadPlayerModelByPath(modelPath) {
    const config = PLAYER_MODEL_LIBRARY.find(item => item.path === modelPath);
    if (!config) {
        console.warn(`Unknown player model path: ${modelPath}`);
        return;
    }

    const extension = config.path.split('.').pop().toLowerCase();
    const encodedPath = encodeURI(config.path);
    const onLoaded = (asset) => applyLoadedPlayerAsset(asset, { ...config, extension });
    const onProgress = (progress) => {
        if (progress.total > 0) {
            const percent = (progress.loaded / progress.total * 100).toFixed(2);
            console.log(`Loading player (${config.label}): ${percent}%`);
        }
    };
    const onError = (error) => console.error(`❌ Error loading player model "${config.path}":`, error);

    if (extension === 'fbx') {
        new THREE.FBXLoader().load(encodedPath, onLoaded, onProgress, onError);
        return;
    }
    if (extension === 'glb' || extension === 'gltf') {
        new THREE.GLTFLoader().load(encodedPath, onLoaded, onProgress, onError);
        return;
    }
    onError(new Error(`Unsupported player model type: ${extension}`));
}

function loadPlayerModelFromFile(file) {
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    const objectUrl = URL.createObjectURL(file);
    const options = {
        label: file.name,
        path: file.name,
        scale: extension === 'fbx' ? 0.01 : 1,
        extension
    };
    const onLoaded = (asset) => {
        applyLoadedPlayerAsset(asset, options);
        URL.revokeObjectURL(objectUrl);
    };
    const onError = (error) => {
        URL.revokeObjectURL(objectUrl);
        console.error(`❌ Error loading player file "${file.name}":`, error);
    };

    if (extension === 'fbx') {
        new THREE.FBXLoader().load(objectUrl, onLoaded, undefined, onError);
        return;
    }
    if (extension === 'glb' || extension === 'gltf') {
        new THREE.GLTFLoader().load(objectUrl, onLoaded, undefined, onError);
        return;
    }
    onError(new Error(`Unsupported player file type: ${extension}`));
}

window.loadPlayerModelByPath = loadPlayerModelByPath;
window.loadPlayerModelFromFile = loadPlayerModelFromFile;

/**
 * Loads the default T-Pose FBX player at startup and wires up the
 * player/UAL2/camera/minimap/rig/graph-editor systems around it.
 * Called once from the orchestrator (index.js) during init().
 */
function loadDefaultPlayerModel() {
    const loader = new THREE.FBXLoader();
    const playerModelPath = 'assets/models/T-Pose.fbx';

    loader.load(
        encodeURI(playerModelPath),

        (fbx) => {
            // Wrap the FBX in a mock GLTF structure so charater-animation.js doesn't break
            const gltf = {
                scene: fbx,
                animations: fbx.animations || []
            };

            fbx.scale.set(0.01, 0.01, 0.01);

            const mainCharacterModel = gltf.scene;
            mainCharacterModel.userData.isSystemObject = true;
            mainCharacterModel.scale.set(0.01, 0.01, 0.01);

            mainCharacterModel.traverse(child => {
                if (child.name && child.name.startsWith('mixamorig')) {
                    child.name = child.name.replace(/mixamorig\d+/, 'mixamorig');
                }
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isPlayer = true;
                }
            });

            if (gltf.animations) {
                gltf.animations.forEach(clip => {
                    clip.tracks.forEach(track => {
                        if (track.name.startsWith('mixamorig')) {
                            track.name = track.name.replace(/mixamorig\d+/, 'mixamorig');
                        }
                    });
                });
            }

            scene.add(mainCharacterModel);

            // PLAYER SYSTEM
            player.init(gltf, collidableMeshes, obstaclesGroup, ground);
            groundPlayerModelAt(player.model, { x: 0, z: 5 });
            player.fitColliderToModel?.();
            player.updatePlayerBox?.();
            player.model = mainCharacterModel;

            addObjectToScene(player.model, 'Player');

            // UAL2 ENGINE INTEGRATION
            window.ual2Engine = integrateUAL2(
                player,
                scene,
                { hudHostId: 'gui-container', debug: true }
            );

            // THIRD PERSON CAMERA
            if (player && player.model) {
                tpsCamera = new ThirdPersonCamera(camera, player.model);
                tpsCamera.update(0.016);
                console.log("🎥 Professional Third-Person Camera initialized");
            }

            // GPS MINIMAP
            const minimapContainer = document.getElementById('minimap-ui');
            window.gpsMiniMap = new GPSMiniMap(scene, player, camera, minimapContainer);
            window.gpsMiniMap.addPointOfInterest(new THREE.Vector3(0, 0, 0), 'Spawn', '#00ff00');
            window.gpsMiniMap.addPointOfInterest(new THREE.Vector3(14.65, 3, -12.2), 'Platform A', '#ffff00');

            // RIG SYSTEM
            window.rigManager.setupRigForObject(mainCharacterModel);

            // PLAYER GRAPH EDITOR
            playerGraphEditor = new PlayerGraphEditor(player, 'open-player-graph');
            window.playerGraphEditor = playerGraphEditor;

            console.log("✅ Enhanced Player Graph Editor initialized with universal object support");
        },

        (progress) => {
            if (progress.total > 0) {
                const percent = (progress.loaded / progress.total * 100).toFixed(2);
                console.log(`Loading: ${percent}%`);
            }
        },

        (error) => {
            console.error('❌ Error loading player model:', error);
        }
    );
}

/**
 * Builds and mounts the "Player Model" selector panel (dropdown +
 * Load Selected / Browse File buttons) inside the given container.
 */
function createPlayerModelPanel(container) {
    const playerModelPanel = document.createElement('div');
    playerModelPanel.id = 'player-model-panel';
    playerModelPanel.style.backgroundColor = '#18191e'; // Deep charcoal gray
    playerModelPanel.style.padding = '10px';
    playerModelPanel.style.margin = '6px 5px';
    playerModelPanel.style.borderRadius = '5px';
    playerModelPanel.style.border = '1px solid #2d2f39'; // Subtle industrial border
    playerModelPanel.style.display = 'flex';
    playerModelPanel.style.flexDirection = 'column';
    playerModelPanel.style.gap = '8px';
    playerModelPanel.style.color = '#d1d5db'; // Clean neutral text
    playerModelPanel.style.fontFamily = "'Segoe UI', 'Inter', system-ui, sans-serif";

    const playerModelLabel = document.createElement('div');
    playerModelLabel.textContent = 'Player Model';
    playerModelLabel.style.fontSize = '10px';
    playerModelLabel.style.fontWeight = '700';
    playerModelLabel.style.textTransform = 'uppercase';
    playerModelLabel.style.letterSpacing = '0.06em';
    playerModelLabel.style.color = '#82899a'; // Muted label color

    const playerModelSelect = document.createElement('select');
    playerModelSelect.id = 'player-model-select';
    playerModelSelect.style.background = '#0e1013'; // Near-black input background
    playerModelSelect.style.color = '#e2e8f0';
    playerModelSelect.style.border = '1px solid #2d2f39';
    playerModelSelect.style.borderRadius = '4px';
    playerModelSelect.style.padding = '6px';
    playerModelSelect.style.fontSize = '12px';
    playerModelSelect.style.outline = 'none';
    playerModelSelect.style.cursor = 'pointer';

    (window.availablePlayerModels || []).forEach(item => {
        const option = document.createElement('option');
        option.value = item.path;
        option.textContent = item.label;
        playerModelSelect.appendChild(option);
    });
    playerModelSelect.value = 'assets/models/T-Pose.fbx';

    const playerModelActions = document.createElement('div');
    playerModelActions.style.display = 'flex';
    playerModelActions.style.gap = '6px';

    const loadPlayerModelButton = document.createElement('button');
    loadPlayerModelButton.textContent = 'Load Selected';
    loadPlayerModelButton.style.flex = '1';
    loadPlayerModelButton.style.background = '#383a42'; // Dark gray interactive button
    loadPlayerModelButton.style.color = '#f1f5f9';
    loadPlayerModelButton.style.border = '1px solid #4a4d56';
    loadPlayerModelButton.style.borderRadius = '4px';
    loadPlayerModelButton.style.padding = '6px 10px';
    loadPlayerModelButton.style.fontSize = '11px';
    loadPlayerModelButton.style.fontWeight = '600';
    loadPlayerModelButton.style.cursor = 'pointer';
    loadPlayerModelButton.style.transition = 'background-color 0.15s, border-color 0.15s';
    
    loadPlayerModelButton.onmouseover = () => {
        loadPlayerModelButton.style.backgroundColor = '#434651';
        loadPlayerModelButton.style.borderColor = '#5c606e';
    };
    loadPlayerModelButton.onmouseout = () => {
        loadPlayerModelButton.style.backgroundColor = '#383a42';
        loadPlayerModelButton.style.borderColor = '#4a4d56';
    };
    
    loadPlayerModelButton.onclick = () => {
        window.loadPlayerModelByPath?.(playerModelSelect.value);
    };

    const browsePlayerModelButton = document.createElement('button');
    browsePlayerModelButton.textContent = 'Browse File';
    browsePlayerModelButton.style.flex = '1';
    browsePlayerModelButton.style.background = '#24262c'; // Darker gray utility button
    browsePlayerModelButton.style.color = '#94a3b8';
    browsePlayerModelButton.style.border = '1px solid #32353f';
    browsePlayerModelButton.style.borderRadius = '4px';
    browsePlayerModelButton.style.padding = '6px 10px';
    browsePlayerModelButton.style.fontSize = '11px';
    browsePlayerModelButton.style.fontWeight = '600';
    browsePlayerModelButton.style.cursor = 'pointer';
    browsePlayerModelButton.style.transition = 'background-color 0.15s, border-color 0.15s, color 0.15s';

    browsePlayerModelButton.onmouseover = () => {
        browsePlayerModelButton.style.backgroundColor = '#2d3039';
        browsePlayerModelButton.style.borderColor = '#414552';
        browsePlayerModelButton.style.color = '#f1f5f9';
    };
    browsePlayerModelButton.onmouseout = () => {
        browsePlayerModelButton.style.backgroundColor = '#24262c';
        browsePlayerModelButton.style.borderColor = '#32353f';
        browsePlayerModelButton.style.color = '#94a3b8';
    };

    const playerModelFileInput = document.createElement('input');
    playerModelFileInput.type = 'file';
    playerModelFileInput.accept = '.fbx,.glb,.gltf';
    playerModelFileInput.style.display = 'none';
    playerModelFileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (file) {
            window.loadPlayerModelFromFile?.(file);
        }
        event.target.value = '';
    });

    browsePlayerModelButton.onclick = () => playerModelFileInput.click();

    const playerModelHint = document.createElement('div');
    playerModelHint.textContent = 'Built-in: T-Pose, Dummy, Male, Female. Or load any FBX/GLB from assets/models.';
    playerModelHint.style.fontSize = '10px';
    playerModelHint.style.color = '#64748b'; // Subdued caption text
    playerModelHint.style.lineHeight = '1.4';

    playerModelActions.appendChild(loadPlayerModelButton);
    playerModelActions.appendChild(browsePlayerModelButton);
    playerModelPanel.appendChild(playerModelLabel);
    playerModelPanel.appendChild(playerModelSelect);
    playerModelPanel.appendChild(playerModelActions);
    playerModelPanel.appendChild(playerModelHint);
    playerModelPanel.appendChild(playerModelFileInput);

    if (container) {
        container.prepend(playerModelPanel);
    } else {
        document.body.appendChild(playerModelPanel);
    }

    return playerModelPanel;
}

// ============================================================
// Set Selected Object As Player
// ============================================================

const PLAYER_FBX_ANIMATIONS = [
    'assets/fbx-player-animation/Walk Forward.fbx',
    'assets/fbx-player-animation/Run Forward Right.fbx',
    'assets/fbx-player-animation/Run Backwards.fbx',
    'assets/fbx-player-animation/Firing Rifle.fbx'
];

function _normalizeAnimationClip(clip) {
    clip.tracks.forEach(track => {
        if (track.name.startsWith('mixamorig')) {
            track.name = track.name.replace(/mixamorig\d+/, 'mixamorig');
        }
    });
}

function _loadPlayerFBXAnimations() {
    try {
        if (!player || !player.mixer) {
            console.warn('Player not ready yet, animations will not load');
            return;
        }
        let loaded = 0;
        PLAYER_FBX_ANIMATIONS.forEach(path => {
            new THREE.FBXLoader().load(
                encodeURI(path),
                (fbx) => {
                    try {
                        if (!fbx.animations || !fbx.animations.length) return;
                        if (!player || !player.mixer) return;
                        fbx.animations.forEach(clip => {
                            _normalizeAnimationClip(clip);
                            if (clip.name) clip.name = clip.name.replace(/\.[^/.]+$/, '');
                        });
                        player._registerAnimationClips(fbx.animations, { source: 'fbx-player-animation' });
                        loaded++;
                        console.log(`Loaded player animation: ${path}`);
                    } catch (e) {
                        console.warn(`Error processing animation ${path}:`, e);
                    }
                },
                undefined,
                (error) => console.warn(`Failed to load animation ${path}:`, error)
            );
        });
    } catch (e) {
        console.warn('Failed to load player animations:', e);
    }
}

window.setSelectedObjectAsPlayer = function(selectedObject) {
    try {
        if (selectedObject && selectedObject.isObject3D) {
            console.log(`Setting selected object "${selectedObject.name || 'unnamed'}" as player`);
            let root = selectedObject;
            while (root.parent && root.parent !== scene && !root.parent.isScene) root = root.parent;

            const savedPos = root.position.clone();
            const wasActive = !!player?.isActive;

            if (player.physicsBody && physicsSystem) physicsSystem.removeBody(player.model);
            removeExistingPlayerModel();
            player.prepareForModelSwap?.();

            root.userData.isSystemObject = false;
            root.userData.ignoreInHierarchy = false;
            root.traverse(child => {
                if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.userData.isPlayer = true; }
            });

            player.init({ scene: root, animations: root.animations || [] }, collidableMeshes, obstaclesGroup, ground);
            player.model = root;
            root.position.copy(savedPos);
            groundPlayerModelAt(player.model, { x: savedPos.x, z: savedPos.z, floorY: ground?.position?.y ?? 0 });
            player.fitColliderToModel?.();
            player.updatePlayerBox?.();

            if (wasActive) player.activate(); else player.deactivate();
            ensurePlayerSystemsBound(root);
            setTimeout(() => _loadPlayerFBXAnimations(), 100);
        } else {
            console.log('Loading default player model with animations');
            new THREE.FBXLoader().load(
                encodeURI('assets/models/player.fbx'),
                (fbx) => {
                    applyLoadedPlayerAsset(fbx, { label: 'Player', path: 'assets/models/player.fbx', scale: 0.01, extension: 'fbx' });
                    setTimeout(() => _loadPlayerFBXAnimations(), 500);
                },
                undefined,
                (error) => console.error('Failed to load player model:', error)
            );
        }
    } catch (e) {
        console.error('setSelectedObjectAsPlayer error:', e);
    }
};