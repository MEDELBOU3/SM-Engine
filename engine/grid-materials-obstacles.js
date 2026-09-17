// ============================================================================
// engine/grid-materials-obstacles.js
// SM Engine - UE5 style Game Development graybox environment (Enhanced Textures & Proj Shadows)
// GAME_DEV only: floor + walls + obstacles
// FILM / TERRAIN: environment stays hidden
// ============================================================================
const SM_UE5_ENV_VERSION = 'sm-game-mode-arena-grid-v12';
const SM_UE5_GRID_TILE_WORLD = 10;
const SM_UE5_FLOOR_SIZE = 140;
const SM_UE5_TEXTURE_CACHE = new Map();
const SM_UE5_MATERIAL_CACHE = new Map();

function smGetRenderer() {
    if (typeof window !== 'undefined' && window.renderer) return window.renderer;
    if (typeof renderer !== 'undefined') return renderer;
    return null;
}

function smGetMaxAnisotropy() {
    return smGetRenderer()?.capabilities?.getMaxAnisotropy?.() || 8;
}

function smGetWorkspaceMode() {
    if (typeof window !== 'undefined' && window.workspaceManager?.currentMode) {
        return String(window.workspaceManager.currentMode).toUpperCase();
    }
    try {
        const saved = localStorage.getItem('sm_workspace_mode');
        if (saved) return String(saved).toUpperCase();
    } catch (error) { }
    return null;
}

function smIsGameWorkspace(modeOverride = null) {
    const mode = String(modeOverride || smGetWorkspaceMode() || 'FILM').toUpperCase();
    return mode === 'GAME_DEV';
}

function smSetObjectTreeVisible(object, visible) {
    if (!object) return false;
    const state = !!visible;
    object.visible = state;
    object.traverse?.(child => {
        child.visible = state;
        if (state) delete child._hiddenByTerrainMode;
    });
    return state;
}

function syncGameEnvironmentVisibility(sceneRef = window.scene, modeOverride = null) {
    if (!sceneRef) return false;
    const mode = String(
        modeOverride ||
        window.workspaceManager?.currentMode ||
        localStorage.getItem('sm_workspace_mode') ||
        'FILM'
    ).toUpperCase();
    const visible = mode === 'GAME_DEV';
    const floor =
        window.gameDevGround ||
        sceneRef.getObjectByName('UnrealEngineFloor') ||
        null;
    const obstacles =
        window.gameDevObstaclesGroup ||
        sceneRef.getObjectByName('ObstaclesGroup') ||
        null;
    smSetObjectTreeVisible(floor, visible);
    smSetObjectTreeVisible(obstacles, visible);
    if (visible) {
        window.ground = floor;
        window.obstaclesGroup = obstacles;
        window.collidableMeshes =
            window.gameDevCollidableMeshes ||
            window.collidableMeshes ||
            [];
    } else {
        if (window.ground === floor) window.ground = null;
        if (window.obstaclesGroup === obstacles) window.obstaclesGroup = null;
        if (window.collidableMeshes === window.gameDevCollidableMeshes) {
            window.collidableMeshes = [];
        }
    }
    console.log(`[UE5 Environment] ${mode} -> ${visible ? 'VISIBLE' : 'HIDDEN'}`);
    return visible;
}

function smNormalizeGridStyles(styles = {}) {
    return {
        micro: {
            color: styles.micro?.color || 'rgba(0,0,0,0.06)',
            width: styles.micro?.width ?? 1
        },
        minor: {
            color: styles.minor?.color || 'rgba(0,0,0,0.18)',
            width: styles.minor?.width ?? 1.2
        },
        major: {
            color: styles.major?.color || 'rgba(0,0,0,0.45)',
            width: styles.major?.width ?? 2.2
        },
        super: {
            color: styles.super?.color || 'rgba(0,0,0,0.70)',
            width: styles.super?.width ?? 3.5
        },
        cross: {
            color: styles.cross?.color || 'rgba(255,255,255,0.22)',
            width: styles.cross?.width ?? 1.5
        }
    };
}

/**
 * Enhanced Procedural Grid Texture (UE5 prototype style)
 * Includes subtle bevel edge shade, micro-lines, and crosshairs
 */
function createGridTexture({
    size = 1024,
    bgColor = '#808080',
    gridStyles = {},
    repeatScale = 1,
    subdivisions = 10,
    majorEvery = 5,
    edgeLine = true,
    checkerEnabled = true,
    checkerLight = 'rgba(255,255,255,0.025)',
    checkerDark = 'rgba(0,0,0,0.025)',
    innerBevel = true
} = {}) {
    const styles = smNormalizeGridStyles(gridStyles);

    const cacheKey = JSON.stringify({
        size,
        bgColor,
        styles,
        repeatScale,
        subdivisions,
        majorEvery,
        edgeLine,
        checkerEnabled,
        innerBevel
    });

    if (SM_UE5_TEXTURE_CACHE.has(cacheKey)) {
        return SM_UE5_TEXTURE_CACHE.get(cacheKey);
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d', { alpha: false });

    // 1. Base color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // 2. Add fine surface grain
    const hex = bgColor.replace('#', '');
    const fullHex = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const baseR = parseInt(fullHex.substring(0, 2), 16) || 128;
    const baseG = parseInt(fullHex.substring(2, 4), 16) || 128;
    const baseB = parseInt(fullHex.substring(4, 6), 16) || 128;

    const image = ctx.getImageData(0, 0, size, size);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
        const noise = ((Math.random() * 2 - 1) * 3.5) | 0;
        pixels[i] = Math.max(0, Math.min(255, baseR + noise));
        pixels[i + 1] = Math.max(0, Math.min(255, baseG + noise));
        pixels[i + 2] = Math.max(0, Math.min(255, baseB + noise));
        pixels[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);

    const step = size / subdivisions;

    // 3. Subtle Checker Pattern
    if (checkerEnabled) {
        for (let y = 0; y < subdivisions; y++) {
            for (let x = 0; x < subdivisions; x++) {
                const isEven = ((x + y) % 2) === 0;
                ctx.fillStyle = isEven ? checkerLight : checkerDark;
                ctx.fillRect(
                    Math.round(x * step),
                    Math.round(y * step),
                    Math.ceil(step),
                    Math.ceil(step)
                );
            }
        }
    }

    // 4. Subtle Inner Vignette / Bevel shadow on borders (helps contact shadows visually)
    if (innerBevel) {
        const borderGlow = ctx.createRadialGradient(size / 2, size / 2, size * 0.45, size / 2, size / 2, size * 0.71);
        borderGlow.addColorStop(0, 'rgba(0,0,0,0)');
        borderGlow.addColorStop(1, 'rgba(0,0,0,0.14)');
        ctx.fillStyle = borderGlow;
        ctx.fillRect(0, 0, size, size);
    }

    // 5. Micro 10cm grid lines (very subtle)
    const microStep = step / 5;
    ctx.strokeStyle = styles.micro.color;
    ctx.lineWidth = styles.micro.width;
    for (let i = 1; i < subdivisions * 5; i++) {
        if (i % 5 === 0) continue;
        const p = Math.round(i * microStep) + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, 0); ctx.lineTo(p, size);
        ctx.moveTo(0, p); ctx.lineTo(size, p);
        ctx.stroke();
    }

    // 6. 1m Minor and 5m Major Lines
    for (let i = 1; i < subdivisions; i++) {
        const isMajor = i % majorEvery === 0;
        ctx.strokeStyle = isMajor ? styles.major.color : styles.minor.color;
        ctx.lineWidth = isMajor ? styles.major.width : styles.minor.width;

        const p = Math.round(i * step) + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, 0); ctx.lineTo(p, size);
        ctx.moveTo(0, p); ctx.lineTo(size, p);
        ctx.stroke();
    }

    // 7. Outer super border
    if (edgeLine) {
        ctx.strokeStyle = styles.super.color;
        ctx.lineWidth = styles.super.width;
        ctx.strokeRect(
            styles.super.width * 0.5,
            styles.super.width * 0.5,
            size - styles.super.width,
            size - styles.super.width
        );
    }

    // 8. Crosshairs at intersection
    const center = size * 0.5;
    const crossSize = Math.max(6, size * 0.018);
    ctx.strokeStyle = styles.cross.color;
    ctx.lineWidth = styles.cross.width;

    ctx.beginPath();
    ctx.moveTo(center - crossSize, center);
    ctx.lineTo(center + crossSize, center);
    ctx.moveTo(center, center - crossSize);
    ctx.lineTo(center, center + crossSize);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `SM_UE5_GRID_${bgColor}_${repeatScale}`;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatScale, repeatScale);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(smGetMaxAnisotropy(), 16);
    texture.needsUpdate = true;

    SM_UE5_TEXTURE_CACHE.set(cacheKey, texture);
    return texture;
}

/**
 * Creates a directional bevel normal map with fine surface roughness
 */
function createNormalMap(size = 512, bumpScale = 0.02) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { alpha: false });
    const image = ctx.createImageData(size, size);
    const pixels = image.data;

    const edgeWidth = 10;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;

            // Micro-surface noise
            let nx = 128 + ((Math.random() * 2 - 1) * 3) | 0;
            let ny = 128 + ((Math.random() * 2 - 1) * 3) | 0;
            let nz = 255;

            // Edge bevels for sharp box chamfers
            if (x < edgeWidth) nx = 128 - ((edgeWidth - x) * 6);
            else if (x > size - edgeWidth) nx = 128 + ((x - (size - edgeWidth)) * 6);

            if (y < edgeWidth) ny = 128 + ((edgeWidth - y) * 6);
            else if (y > size - edgeWidth) ny = 128 - ((y - (size - edgeWidth)) * 6);

            pixels[idx] = Math.max(0, Math.min(255, nx));
            pixels[idx + 1] = Math.max(0, Math.min(255, ny));
            pixels[idx + 2] = nz;
            pixels[idx + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(smGetMaxAnisotropy(), 8);
    texture.needsUpdate = true;
    return texture;
}

function createRoughnessMap(size = 256, baseValue = 180, variation = 8) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { alpha: false });
    const image = ctx.createImageData(size, size);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
        const n = (Math.random() * 2 - 1) * variation;
        const val = Math.max(0, Math.min(255, baseValue + n));
        pixels[i] = val;
        pixels[i + 1] = val;
        pixels[i + 2] = val;
        pixels[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

/**
 * Creates a perimeter Ambient Occlusion map for solid edge contact shading
 */
function createAOMap(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const margin = size * 0.08;
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.38, size / 2, size / 2, size * 0.70);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(180,180,180,1)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function getObstaclePalette(type = 'structure') {
    const palettes = {
        floor: {
            bgColor: '#6e7279',
            tint: '#ffffff',
            roughness: 0.82,
            metalness: 0.02,
            envMapIntensity: 0.20,
            normalScale: 0.03,
            gridStyles: {
                minor: { color: 'rgba(20,20,20,0.18)', width: 1.2 },
                major: { color: 'rgba(12,12,12,0.45)', width: 2.2 },
                super: { color: 'rgba(5,5,5,0.65)', width: 3.5 },
                cross: { color: 'rgba(255,255,255,0.18)', width: 1.5 }
            }
        },
        wall: {
            bgColor: '#5b6b80',
            tint: '#ffffff',
            roughness: 0.78,
            metalness: 0.04,
            envMapIntensity: 0.18,
            normalScale: 0.025,
            gridStyles: {
                minor: { color: 'rgba(25,35,50,0.18)', width: 1.2 },
                major: { color: 'rgba(18,25,38,0.35)', width: 2 },
                super: { color: 'rgba(10,15,25,0.55)', width: 3 },
                cross: { color: 'rgba(255,255,255,0.12)', width: 1 }
            }
        },
        structure: {
            bgColor: '#6a6d73',
            tint: '#ffffff',
            roughness: 0.75,
            metalness: 0.04,
            envMapIntensity: 0.22,
            normalScale: 0.03,
            gridStyles: {
                minor: { color: 'rgba(20,20,20,0.16)', width: 1.2 },
                major: { color: 'rgba(10,10,10,0.42)', width: 2.2 },
                super: { color: 'rgba(0,0,0,0.62)', width: 3.2 },
                cross: { color: 'rgba(255,255,255,0.14)', width: 1 }
            }
        },
        blue: {
            bgColor: '#0270b8',
            tint: '#ffffff',
            roughness: 0.48, // Gives crisp glossy reflections and punchy shadows
            metalness: 0.08,
            envMapIntensity: 0.40,
            normalScale: 0.035,
            gridStyles: {
                minor: { color: 'rgba(0,18,40,0.18)', width: 1.2 },
                major: { color: 'rgba(0,12,30,0.38)', width: 2 },
                super: { color: 'rgba(0,8,20,0.55)', width: 3 },
                cross: { color: 'rgba(255,255,255,0.25)', width: 1.2 }
            }
        }
    };

    if (type === 'box' || type === 'platform' || type === 'interactive') return palettes.blue;
    if (type === 'ramp' || type === 'cover' || type === 'block') return palettes.structure;
    return palettes[type] || palettes.structure;
}

function smGetMaterialType(type = 'structure') {
    if (type === 'box' || type === 'platform' || type === 'interactive') return 'blue';
    if (type === 'ramp' || type === 'cover' || type === 'block') return 'structure';
    return type;
}

function createObstacleMaterial(type = 'structure') {
    const materialType = smGetMaterialType(type);
    if (SM_UE5_MATERIAL_CACHE.has(materialType)) {
        return SM_UE5_MATERIAL_CACHE.get(materialType);
    }
    const palette = getObstaclePalette(materialType);
    const gridTexture = createGridTexture({
        size: 1024,
        bgColor: palette.bgColor,
        gridStyles: palette.gridStyles,
        repeatScale: 1,
        subdivisions: 10,
        majorEvery: 5,
        edgeLine: true,
        innerBevel: true
    });

    const normalMap = createNormalMap(512, 0.02);
    const roughnessMap = createRoughnessMap(256, Math.round(palette.roughness * 255), 7);
    const aoMap = createAOMap(256);

    const material = new THREE.MeshStandardMaterial({
        name: `SM_UE5_${materialType.toUpperCase()}_GRID`,
        color: new THREE.Color(palette.tint),
        map: gridTexture,
        normalMap: normalMap,
        normalScale: new THREE.Vector2(palette.normalScale, palette.normalScale),
        roughnessMap: roughnessMap,
        roughness: palette.roughness,
        metalness: palette.metalness,
        aoMap: aoMap,
        aoMapIntensity: 0.85,
        envMapIntensity: palette.envMapIntensity,
        side: THREE.FrontSide
    });

    SM_UE5_MATERIAL_CACHE.set(materialType, material);
    return material;
}

function createUnrealSalmonMaterial(type = 'blue') {
    return createObstacleMaterial(type || 'blue');
}

/**
 * Ensures UV coordinates map to a 2nd channel uv2 so that aoMap renders properly
 */
function createBoxWithCustomUVs(width, height, depth) {
    const geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
    const uv = geometry.attributes.uv;
    const scales = [
        [depth / SM_UE5_GRID_TILE_WORLD, height / SM_UE5_GRID_TILE_WORLD],
        [depth / SM_UE5_GRID_TILE_WORLD, height / SM_UE5_GRID_TILE_WORLD],
        [width / SM_UE5_GRID_TILE_WORLD, depth / SM_UE5_GRID_TILE_WORLD],
        [width / SM_UE5_GRID_TILE_WORLD, depth / SM_UE5_GRID_TILE_WORLD],
        [width / SM_UE5_GRID_TILE_WORLD, height / SM_UE5_GRID_TILE_WORLD],
        [width / SM_UE5_GRID_TILE_WORLD, height / SM_UE5_GRID_TILE_WORLD]
    ];
    for (let face = 0; face < 6; face++) {
        const scaleX = scales[face][0];
        const scaleY = scales[face][1];
        const start = face * 4;
        for (let i = 0; i < 4; i++) {
            const index = start + i;
            uv.setXY(index, uv.getX(index) * scaleX, uv.getY(index) * scaleY);
        }
    }
    uv.needsUpdate = true;
    // Clone UV into uv2 for ambient occlusion maps
    geometry.setAttribute('uv2', geometry.attributes.uv.clone());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function smDisposeEnvironmentObject(object) {
    if (!object) return;
    object.traverse?.(child => {
        child.geometry?.dispose?.();
    });
    object.parent?.remove(object);
}

function createUnrealFloor(sceneRef = window.scene || (typeof scene !== 'undefined' ? scene : null)) {
    if (!sceneRef) {
        console.warn('[UE5 Environment] createUnrealFloor(): scene missing.');
        return null;
    }
    let existing = sceneRef.getObjectByName('UnrealEngineFloor');
    if (existing && existing.userData?.environmentVersion === SM_UE5_ENV_VERSION) {
        existing.userData.isSystemObject = true;
        existing.userData.isEnvironment = true;
        existing.userData.ignoreInTimeline = true;
        existing.userData.workspaceOnly = 'GAME_DEV';
        existing.frustumCulled = false;
        existing.receiveShadow = true;
        smSetObjectTreeVisible(existing, smIsGameWorkspace());
        window.ground = existing;
        return existing;
    }
    if (existing) {
        smDisposeEnvironmentObject(existing);
        existing = null;
    }

    const geometry = new THREE.PlaneGeometry(SM_UE5_FLOOR_SIZE, SM_UE5_FLOOR_SIZE, 1, 1);
    geometry.setAttribute('uv2', geometry.attributes.uv.clone());

    const palette = getObstaclePalette('floor');
    const repeatCount = SM_UE5_FLOOR_SIZE / SM_UE5_GRID_TILE_WORLD;

    const gridTexture = createGridTexture({
        size: 1024,
        bgColor: palette.bgColor,
        gridStyles: palette.gridStyles,
        repeatScale: repeatCount,
        subdivisions: 10,
        majorEvery: 5,
        edgeLine: false,
        checkerEnabled: true,
        innerBevel: false
    });

    const normalMap = createNormalMap(512, 0.015);
    normalMap.repeat.set(repeatCount, repeatCount);

    const roughnessMap = createRoughnessMap(256, 210, 6);
    roughnessMap.repeat.set(repeatCount, repeatCount);

    const material = new THREE.MeshStandardMaterial({
        name: 'SM_UE5_FLOOR_GRID',
        color: 0xffffff,
        map: gridTexture,
        normalMap: normalMap,
        normalScale: new THREE.Vector2(0.02, 0.02),
        roughnessMap: roughnessMap,
        roughness: palette.roughness,
        metalness: palette.metalness,
        envMapIntensity: palette.envMapIntensity,
        side: THREE.FrontSide
    });

    const floor = new THREE.Mesh(geometry, material);
    floor.name = 'UnrealEngineFloor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.20, 0);

    // CRITICAL: Floor receives shadow from all obstacles
    floor.castShadow = false;
    floor.receiveShadow = true;
    floor.frustumCulled = false;

    floor.userData = {
        ...(floor.userData || {}),
        selectable: false,
        isSystemObject: true,
        isEnvironment: true,
        ignoreInHierarchy: true,
        ignoreInTimeline: true,
        noCastShadow: true,
        static: true,
        workspaceOnly: 'GAME_DEV',
        preventMerge: true,
        preventLOD: true,
        preventInstancing: true,
        environmentVersion: SM_UE5_ENV_VERSION,
        physicsShape: 'trimesh',
        friction: 0.85,
        restitution: 0.03
    };

    sceneRef.add(floor);
    smSetObjectTreeVisible(floor, smIsGameWorkspace());
    window.ground = floor;
    return floor;
}

function smCreateObstacle({
    type = 'structure',
    name = 'UE5Obstacle',
    width = 1,
    height = 1,
    depth = 1,
    radius = 1,
    cylinder = false,
    cone = false,
    radialSegments = 32,
    position = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0 },
    castShadow = true,
    receiveShadow = true
} = {}) {
    let geometry;
    if (cone) {
        geometry = new THREE.CylinderGeometry(0, radius, height, radialSegments, 1, false);
    } else if (cylinder) {
        geometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments, 1, false);
    } else {
        geometry = createBoxWithCustomUVs(width, height, depth);
    }

    if (!geometry.attributes.uv2 && geometry.attributes.uv) {
        geometry.setAttribute('uv2', geometry.attributes.uv.clone());
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = createObstacleMaterial(type);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(position.x || 0, position.y || 0, position.z || 0);
    mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);

    // CRITICAL: Obstacles MUST cast and receive shadows onto themselves and others
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;

    mesh.userData = {
        ...(mesh.userData || {}),
        selectable: false,
        isEnvironment: true,
        isSystemObject: true,
        ignoreInHierarchy: true,
        ignoreInTimeline: true,
        isObstacle: true,
        static: true,
        workspaceOnly: 'GAME_DEV',
        preventMerge: true,
        preventLOD: true,
        preventInstancing: true,
        environmentVersion: SM_UE5_ENV_VERSION,
        physicsShape: (cylinder || cone) ? 'cylinder' : 'box',
        friction: type === 'blue' ? 0.62 : 0.80,
        restitution: 0.04
    };
    mesh.updateMatrixWorld(true);
    mesh.userData.collider = new THREE.Box3().setFromObject(mesh);
    return mesh;
}

function smBuildUE5Arena() {
    return [
        // BACK / SIDE ARCHITECTURE
        { type: 'wall', name: 'UE5_BackWall', width: 54, height: 7, depth: 0.7, position: { x: 0, y: 3.5, z: -28 } },
        { type: 'wall', name: 'UE5_LeftRearWall', width: 0.7, height: 6, depth: 28, position: { x: -27, y: 3, z: -14 } },
        { type: 'wall', name: 'UE5_RightRearWall', width: 0.7, height: 6, depth: 28, position: { x: 27, y: 3, z: -14 } },

        // Stepped masses
        { type: 'structure', name: 'UE5_RearLeft_Base', width: 16, height: 3.2, depth: 10, position: { x: -17, y: 1.6, z: -17 } },
        { type: 'structure', name: 'UE5_RearLeft_Upper', width: 10, height: 2.4, depth: 7, position: { x: -19, y: 4.4, z: -18 } },
        { type: 'structure', name: 'UE5_RearRight_Base', width: 13, height: 4.2, depth: 9, position: { x: 17, y: 2.1, z: -18 } },
        { type: 'structure', name: 'UE5_RearRight_Top', width: 8, height: 2.0, depth: 6, position: { x: 18, y: 5.2, z: -18 } },

        // CENTER STAIRS + PLATFORM
        { type: 'structure', name: 'UE5_CenterPlatform', width: 12, height: 1.0, depth: 8, position: { x: 2, y: 0.5, z: -5 } },
        { type: 'structure', name: 'UE5_CenterUpperPlatform', width: 9, height: 1.1, depth: 6, position: { x: 2, y: 3.85, z: -8 } },

        // Steps
        { type: 'structure', name: 'UE5_CenterStep_01', width: 8, height: 0.55, depth: 2.2, position: { x: 2, y: 0.275, z: 1.5 } },
        { type: 'structure', name: 'UE5_CenterStep_02', width: 8, height: 1.10, depth: 2.2, position: { x: 2, y: 0.55, z: -0.3 } },
        { type: 'structure', name: 'UE5_CenterStep_03', width: 8, height: 1.65, depth: 2.2, position: { x: 2, y: 0.825, z: -2.1 } },
        { type: 'structure', name: 'UE5_CenterStep_04', width: 8, height: 2.20, depth: 2.2, position: { x: 2, y: 1.10, z: -3.9 } },
        { type: 'structure', name: 'UE5_CenterStep_05', width: 8, height: 2.75, depth: 2.2, position: { x: 2, y: 1.375, z: -5.7 } },

        // RIGHT RAMP / PLATFORM
        { type: 'structure', name: 'UE5_RightRamp', width: 6, height: 0.65, depth: 11, position: { x: 15, y: 1.25, z: 1.5 }, rotation: { x: 0, y: 0, z: -Math.PI / 14 } },
        { type: 'structure', name: 'UE5_RightRampPlatform', width: 7, height: 0.9, depth: 7, position: { x: 20, y: 2.7, z: 1.5 } },

        // COVER PIECES
        { type: 'structure', name: 'UE5_Cover_Left', width: 7, height: 2.6, depth: 1.0, position: { x: -13, y: 1.3, z: 6 } },
        { type: 'structure', name: 'UE5_Cover_Right', width: 1.0, height: 2.6, depth: 7, position: { x: 12, y: 1.3, z: 11 } },
        { type: 'structure', name: 'UE5_Cover_Front', width: 9, height: 2.0, depth: 1.0, position: { x: 0, y: 1.0, z: 16 } },

        // BLUE GAMEPLAY INTERACTIVES
        { type: 'blue', name: 'UE5_BlueCube_Center', width: 3.8, height: 3.8, depth: 3.8, position: { x: -4.5, y: 1.9, z: 2.5 } },
        { type: 'blue', name: 'UE5_BlueCube_Right', width: 3.2, height: 3.2, depth: 3.2, position: { x: 18.5, y: 1.6, z: 10 } },
        { type: 'blue', name: 'UE5_BlueCube_Rear', width: 2.7, height: 2.7, depth: 2.7, position: { x: 10, y: 1.35, z: -13 } },
        { type: 'blue', name: 'UE5_BlueCube_Left', width: 2.4, height: 2.4, depth: 2.4, position: { x: -19, y: 1.2, z: 10 } },
        { type: 'blue', name: 'UE5_BlueCylinder', radius: 1.8, height: 1.0, cylinder: true, radialSegments: 32, position: { x: -17, y: 0.5, z: -4 } },
        { type: 'blue', name: 'UE5_GameplayCone', radius: 1.15, height: 2.6, cone: true, radialSegments: 32, position: { x: -12, y: 1.3, z: -9 } },

        // BLOCKS
        { type: 'structure', name: 'UE5_Block_Short_A', width: 5, height: 1.4, depth: 4, position: { x: -8, y: 0.7, z: -12 } },
        { type: 'structure', name: 'UE5_Block_Short_B', width: 4, height: 2.1, depth: 4, position: { x: 11, y: 1.05, z: 5 } },
        { type: 'structure', name: 'UE5_Block_Short_C', width: 6, height: 1.7, depth: 3.5, position: { x: -18, y: 0.85, z: 17 } }
    ];
}

/**
 * Ensures all children inherit proper shadow properties and balanced materials
 */
function smApplyUE5BalancedMaterialResponse(root) {
    if (!root?.traverse) return;
    root.traverse((object) => {
        if (!object?.isMesh) return;

        // Force both cast & receive shadows on all obstacle children
        object.castShadow = true;
        object.receiveShadow = true;

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
            if (!material) return;
            if ('metalness' in material) {
                material.metalness = Math.min(0.12, Math.max(0, Number(material.metalness) || 0));
            }
            if ('roughness' in material) {
                // Keep roughness responsive to directional light shadows
                material.roughness = Math.max(0.45, Math.min(0.85, Number(material.roughness) || 0.75));
            }
            if ('envMapIntensity' in material) {
                material.envMapIntensity = Math.min(0.40, Number(material.envMapIntensity) || 0.25);
            }
            material.needsUpdate = true;
        });
    });
}

function smCollectGameEnvironmentMeshes(root) {
    const meshes = [];
    root?.traverse?.(object => {
        if (!object?.isMesh) return;
        if (object.userData?.collidable === false) return;
        if (object.userData?.editorOnly === true) return;
        meshes.push(object);
    });
    return meshes;
}

/**
 * Set up shadows on the main directional light to cover the entire arena
 */
function smSetupArenaLightingAndShadows(sceneRef) {
    if (!sceneRef) return;
    const renderer = smGetRenderer();
    if (renderer) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Clean soft UE5 shadows
    }

    // Look for existing directional lights or tune the primary sun
    let sun = null;
    sceneRef.traverse(child => {
        if (child.isDirectionalLight) {
            sun = child;
        }
    });

    if (!sun) {
        sun = new THREE.DirectionalLight(0xfff8f0, 2.2);
        sun.name = 'UE5_SunLight';
        sun.position.set(45, 65, 35);
        sceneRef.add(sun);
    }

    // Configure the Shadow Camera to encompass the entire arena
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;

    // Expand frustum so shadows are projected on ALL obstacles (even far corners)
    const d = 50;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 180;

    // Normal bias prevents shadow acne on flat box surfaces
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.035;
    sun.shadow.camera.updateProjectionMatrix();

    console.log('[UE5 Environment] Arena Shadow projection system configured.');
}

function setupPhysicsWorld(sceneRef, groundRef) {
    if (!sceneRef) {
        return { collidableMeshes: [], obstaclesGroup: null };
    }

    let existing = sceneRef.getObjectByName('ObstaclesGroup');

    if (existing && existing.userData?.environmentVersion === SM_UE5_ENV_VERSION && existing.children.length > 0) {
        existing.userData.isEnvironment = true;
        existing.userData.ignoreInTimeline = true;
        existing.userData.workspaceOnly = 'GAME_DEV';
        existing.userData.isGameDevelopmentEnvironment = true;
        existing.frustumCulled = false;

        existing.traverse(child => {
            child.userData = child.userData || {};
            child.userData.workspaceOnly = 'GAME_DEV';
            child.userData.isGameDevelopmentEnvironment = true;
            child.userData.excludeFromNanite = true;
            child.userData.excludeFromStaticMerge = true;
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        const collidableMeshes = [groundRef, ...smCollectGameEnvironmentMeshes(existing)].filter(Boolean);
        window.gameDevObstaclesGroup = existing;
        window.gameDevCollidableMeshes = collidableMeshes;
        syncGameEnvironmentVisibility(sceneRef);

        return { collidableMeshes, obstaclesGroup: existing };
    }

    if (existing) {
        smDisposeEnvironmentObject(existing);
    }

    const obstaclesGroup = new THREE.Group();
    obstaclesGroup.name = 'ObstaclesGroup';
    obstaclesGroup.userData = {
        ...(obstaclesGroup.userData || {}),
        selectable: true,
        isEnvironment: true,
        isSystemObject: false,
        ignoreInHierarchy: false,
        ignoreInTimeline: true,
        static: true,
        workspaceOnly: 'GAME_DEV',
        preventMerge: true,
        preventLOD: true,
        preventInstancing: true,
        isGameDevelopmentEnvironment: true,
        excludeFromNanite: true,
        excludeFromStaticMerge: true,
        environmentVersion: SM_UE5_ENV_VERSION
    };

    sceneRef.add(obstaclesGroup);

    let facilityResult = null;
    if (window.SMGameModeEnvironmentSystem?.isReady?.()) {
        facilityResult = window.SMGameModeEnvironmentSystem.buildInto(obstaclesGroup, {
            scene: sceneRef,
            ground: groundRef,
            createObstacle: smCreateObstacle,
            createMaterial: createObstacleMaterial,
            createBoxGeometry: createBoxWithCustomUVs
        });
    }

    if (!facilityResult?.root) {
        const descriptors = smBuildUE5Arena();
        descriptors.forEach(descriptor => {
            obstaclesGroup.add(smCreateObstacle(descriptor));
        });
    }

    // Make sure EVERY piece in the arena casts & receives shadows properly
    obstaclesGroup.traverse(child => {
        child.userData = child.userData || {};
        child.userData.workspaceOnly = 'GAME_DEV';
        child.userData.isGameDevelopmentEnvironment = true;
        child.userData.excludeFromNanite = true;
        child.userData.excludeFromStaticMerge = true;
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    obstaclesGroup.updateMatrixWorld(true);
    const collidableMeshes = [groundRef, ...smCollectGameEnvironmentMeshes(obstaclesGroup)].filter(Boolean);

    window.gameDevObstaclesGroup = obstaclesGroup;
    window.gameDevCollidableMeshes = collidableMeshes;

    syncGameEnvironmentVisibility(sceneRef);
    return { collidableMeshes, obstaclesGroup };
}

function createPhysicsObstacle(size, position, type = 'blue') {
    return smCreateObstacle({
        type,
        name: 'PhysicsObstacle',
        width: size.x,
        height: size.y,
        depth: size.z,
        position: { x: position.x, y: position.y, z: position.z }
    });
}

function registerObstaclesPhysics(obstaclesGroupRef) {
    const physics = window.physicsSystem || (typeof physicsSystem !== 'undefined' ? physicsSystem : null);
    if (!physics || !obstaclesGroupRef) return false;

    obstaclesGroupRef.traverse(obstacle => {
        if (!obstacle?.isMesh || !obstacle.geometry || obstacle.userData?.collidable === false) return;
        obstacle.updateMatrixWorld(true);
        const params = obstacle.geometry.parameters || {};
        const cylinder = obstacle.userData?.physicsShape === 'cylinder' || obstacle.geometry.type?.includes('Cylinder');

        let size;
        if (Array.isArray(obstacle.userData?.physicsSize)) {
            size = obstacle.userData.physicsSize.slice(0, 3);
        } else if (cylinder) {
            const radius = params.radiusTop || params.radiusBottom || 1;
            size = [radius * 2, params.height || 1, radius * 2];
        } else {
            const box = new THREE.Box3().setFromObject(obstacle);
            const boxSize = box.getSize(new THREE.Vector3());
            size = [Math.max(0.01, boxSize.x), Math.max(0.01, boxSize.y), Math.max(0.01, boxSize.z)];
        }

        physics.addBody(obstacle, {
            mass: 0,
            shapeType: cylinder ? 'cylinder' : 'box',
            friction: obstacle.userData?.friction ?? 0.78,
            restitution: obstacle.userData?.restitution ?? 0.03,
            size,
            pos: obstacle.getWorldPosition(new THREE.Vector3()),
            quat: obstacle.getWorldQuaternion(new THREE.Quaternion())
        });
    });

    physics.toggleSimulation?.(true);
    return true;
}

function ensureGameDevelopmentEnvironment(sceneRef = window.scene) {
    if (!sceneRef || typeof THREE === 'undefined') return null;
    const currentMode = String(
        window.workspaceManager?.currentMode ||
        localStorage.getItem('sm_workspace_mode') ||
        'FILM'
    ).toUpperCase();
    const isGameDev = currentMode === 'GAME_DEV';

    // 1. Configure Lights & Shadow Projections
    smSetupArenaLightingAndShadows(sceneRef);

    // 2. Build Floor & Obstacles
    const floor = createUnrealFloor(sceneRef);
    if (!floor) return null;

    const world = setupPhysicsWorld(sceneRef, floor);
    const obstaclesGroup = world?.obstaclesGroup || null;
    const collidableMeshes = world?.collidableMeshes || [];

    floor.userData = floor.userData || {};
    floor.userData.workspaceOnly = 'GAME_DEV';
    floor.userData.isGameDevelopmentEnvironment = true;
    floor.userData.isSystemObject = true;
    floor.userData.excludeFromNanite = true;
    floor.userData.excludeFromStaticMerge = true;
    floor.frustumCulled = false;

    if (obstaclesGroup) {
        obstaclesGroup.userData = obstaclesGroup.userData || {};
        obstaclesGroup.userData.workspaceOnly = 'GAME_DEV';
        obstaclesGroup.userData.isGameDevelopmentEnvironment = true;
        obstaclesGroup.userData.excludeFromNanite = true;
        obstaclesGroup.userData.excludeFromStaticMerge = true;
        obstaclesGroup.frustumCulled = false;
        smApplyUE5BalancedMaterialResponse(obstaclesGroup);
    }

    floor.updateMatrixWorld(true);
    obstaclesGroup?.updateMatrixWorld(true);

    window.gameDevGround = floor;
    window.gameDevObstaclesGroup = obstaclesGroup;
    window.gameDevCollidableMeshes = collidableMeshes;

    window.SMUE5Environment = {
        version: SM_UE5_ENV_VERSION,
        ground: floor,
        floor,
        obstaclesGroup,
        collidableMeshes,
        show() {
            const mode = String(
                window.workspaceManager?.currentMode ||
                localStorage.getItem('sm_workspace_mode') ||
                'FILM'
            ).toUpperCase();
            if (mode !== 'GAME_DEV') {
                smSetObjectTreeVisible(floor, false);
                smSetObjectTreeVisible(obstaclesGroup, false);
                return false;
            }
            smSetObjectTreeVisible(floor, true);
            smSetObjectTreeVisible(obstaclesGroup, true);
            window.ground = floor;
            window.obstaclesGroup = obstaclesGroup;
            smApplyUE5BalancedMaterialResponse(obstaclesGroup);
            window.collidableMeshes = collidableMeshes;
            return true;
        },
        hide() {
            smSetObjectTreeVisible(floor, false);
            smSetObjectTreeVisible(obstaclesGroup, false);
            if (window.ground === floor) window.ground = null;
            if (window.obstaclesGroup === obstaclesGroup) window.obstaclesGroup = null;
            return true;
        },
        syncVisibility(modeOverride = null) {
            return syncGameEnvironmentVisibility(sceneRef, modeOverride);
        },
        rebuild() {
            const oldFloor = sceneRef.getObjectByName('UnrealEngineFloor');
            const oldObstacles = sceneRef.getObjectByName('ObstaclesGroup');
            if (oldFloor) smDisposeEnvironmentObject(oldFloor);
            if (oldObstacles) smDisposeEnvironmentObject(oldObstacles);
            window.gameDevGround = null;
            window.gameDevObstaclesGroup = null;
            window.gameDevCollidableMeshes = [];
            return ensureGameDevelopmentEnvironment(sceneRef);
        }
    };

    syncGameEnvironmentVisibility(sceneRef, currentMode);
    if (isGameDev) {
        window.ground = floor;
        window.obstaclesGroup = obstaclesGroup;
        window.collidableMeshes = collidableMeshes;
    }

    return { ground: floor, floor, obstaclesGroup, collidableMeshes };
}

if (typeof window !== 'undefined') {
    window.createGridTexture = createGridTexture;
    window.getObstaclePalette = getObstaclePalette;
    window.createObstacleMaterial = createObstacleMaterial;
    window.createUnrealSalmonMaterial = createUnrealSalmonMaterial;
    window.createNormalMap = createNormalMap;
    window.createRoughnessMap = createRoughnessMap;
    window.createAOMap = createAOMap;
    window.createUnrealFloor = createUnrealFloor;
    window.createBoxWithCustomUVs = createBoxWithCustomUVs;
    window.createPhysicsObstacle = createPhysicsObstacle;
    window.setupPhysicsWorld = setupPhysicsWorld;
    window.smCollectGameEnvironmentMeshes = smCollectGameEnvironmentMeshes;
    window.registerObstaclesPhysics = registerObstaclesPhysics;
    window.syncGameEnvironmentVisibility = syncGameEnvironmentVisibility;
    window.ensureGameDevelopmentEnvironment = ensureGameDevelopmentEnvironment;
    window.smSetupArenaLightingAndShadows = smSetupArenaLightingAndShadows;
}