// engine/game-mode-environment/GameModeBuildingKit.js
// SM Engine — Professional UE-style blockout material + arena building kit
(function () {
    'use strict';

    const materialCache = new Map();
    const textureCache = new Map();

    // One texture repeat represents 4 world units.
    // The texture contains 4 subdivisions -> one visible cell per world unit.
    const BLOCKOUT_WORLD_TILE = 4;
    const BLOCKOUT_SUBDIVISIONS = 4;

    function C() {
        return window.SMGameModeEnvironmentConfig;
    }

    function getRenderer() {
        return window.renderer || null;
    }

    function getMaxAnisotropy() {
        return Math.min(
            getRenderer()?.capabilities?.getMaxAnisotropy?.() || 8,
            16
        );
    }

    function tag(object, {
        collidable = true,
        category = 'arena',
        zone = 'arena'
    } = {}) {
        if (!object) return object;

        object.userData ||= {};

        Object.assign(object.userData, {
            workspaceOnly: 'GAME_DEV',
            isGameDevelopmentEnvironment: true,
            isGameModeArena: true,

            // Editor/gameplay meaning.
            isObstacle: !!collidable,
            collidable: !!collidable,
            gameplayCategory: category,
            gameModeZone: zone,

            // -----------------------------------------------------
            // PLAYER COLLISION CONTRACT
            // -----------------------------------------------------
            // SMPlayerPhysicsController only considers normal scene
            // meshes when collisionEnabled === true (unless a mesh is
            // explicitly forced through a world/registry list).
            collisionEnabled: !!collidable,
            collisionLayer: collidable ? 'world-static' : 'editor-only',
            bodyType: collidable ? 'static' : 'none',

            // Exact geometry raycasts are used for grounding on top of
            // platforms, steps and the sloped ramp. The broad-phase AABB
            // is still allowed to block horizontal movement.
            horizontalBlocking: !!collidable,

            static: true,
            excludeFromNanite: true,
            excludeFromStaticMerge: true,
            preventMerge: true,
            preventLOD: true,
            preventInstancing: true,
            ignoreInTimeline: true
        });

        return object;
    }

    // ---------------------------------------------------------------------
    // UE-STYLE PROCEDURAL BLOCKOUT TEXTURES
    // ---------------------------------------------------------------------

    function normalizeHexColor(value, fallback = '#808080') {
        if (typeof value === 'number') {
            return `#${new THREE.Color(value).getHexString()}`;
        }

        if (typeof value === 'string') {
            if (value.startsWith('#')) return value;

            try {
                return `#${new THREE.Color(value).getHexString()}`;
            } catch (_) {}
        }

        return fallback;
    }

    function createBlockoutTexture({
        name = 'Blockout',
        background = '#7a828b',
        minorLine = 'rgba(20,24,28,0.22)',
        majorLine = 'rgba(9,12,15,0.42)',
        highlightLine = 'rgba(255,255,255,0.09)',
        size = 512,
        subdivisions = BLOCKOUT_SUBDIVISIONS,
        subtleChecker = true
    } = {}) {
        const key = JSON.stringify({
            name,
            background,
            minorLine,
            majorLine,
            highlightLine,
            size,
            subdivisions,
            subtleChecker
        });

        if (textureCache.has(key)) {
            return textureCache.get(key);
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d', { alpha: false });

        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);

        const step = size / subdivisions;

        // Very subtle checker variation like UE blockout surfaces.
        if (subtleChecker) {
            for (let y = 0; y < subdivisions; y += 1) {
                for (let x = 0; x < subdivisions; x += 1) {
                    if ((x + y) % 2 !== 0) continue;

                    ctx.fillStyle = 'rgba(255,255,255,0.018)';
                    ctx.fillRect(
                        x * step,
                        y * step,
                        step,
                        step
                    );
                }
            }
        }

        // Fine 1-unit grid.
        for (let i = 1; i < subdivisions; i += 1) {
            const p = Math.round(i * step) + 0.5;

            ctx.strokeStyle = minorLine;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, size);
            ctx.moveTo(0, p);
            ctx.lineTo(size, p);
            ctx.stroke();
        }

        // Repeat boundary = stronger 4-unit line.
        ctx.strokeStyle = majorLine;
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, size - 3, size - 3);

        // Small highlight directly inside the major line gives the material
        // the clean modular-panel feel seen in UE blockout maps.
        ctx.strokeStyle = highlightLine;
        ctx.lineWidth = 1;
        ctx.strokeRect(5.5, 5.5, size - 11, size - 11);

        const texture = new THREE.CanvasTexture(canvas);
        texture.name = `SM_UE_Blockout_${name}`;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = getMaxAnisotropy();
        texture.needsUpdate = true;

        textureCache.set(key, texture);
        return texture;
    }

    function createRoughnessTexture(name = 'Rough', value = 238) {
        const key = `roughness:${name}:${value}`;
        if (textureCache.has(key)) return textureCache.get(key);

        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d', { alpha: false });
        const image = ctx.createImageData(size, size);

        for (let i = 0; i < image.data.length; i += 4) {
            const noise = (Math.random() * 8 - 4);
            const v = Math.max(0, Math.min(255, value + noise));
            image.data[i] = v;
            image.data[i + 1] = v;
            image.data[i + 2] = v;
            image.data[i + 3] = 255;
        }

        ctx.putImageData(image, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.name = `SM_UE_Roughness_${name}`;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = getMaxAnisotropy();
        texture.needsUpdate = true;

        textureCache.set(key, texture);
        return texture;
    }

    function getPalette(type = 'structure', face = 'side') {
        const configColors = C()?.colors || {};

        const palettes = {
            wall: {
                side: '#536170',
                top: '#65717d',
                minor: 'rgba(9,14,18,0.28)',
                major: 'rgba(4,7,10,0.50)',
                highlight: 'rgba(255,255,255,0.065)',
                roughness: 0.93,
                env: 0.12
            },

            structure: {
                side: '#737c85',
                top: '#899198',
                minor: 'rgba(15,18,22,0.22)',
                major: 'rgba(8,10,13,0.42)',
                highlight: 'rgba(255,255,255,0.08)',
                roughness: 0.91,
                env: 0.13
            },

            dark: {
                side: '#3f4852',
                top: '#505a64',
                minor: 'rgba(5,8,11,0.28)',
                major: 'rgba(0,0,0,0.50)',
                highlight: 'rgba(255,255,255,0.055)',
                roughness: 0.94,
                env: 0.10
            },

            objective: {
                side: '#8d949b',
                top: '#a7adb3',
                minor: 'rgba(18,20,23,0.18)',
                major: 'rgba(9,11,13,0.34)',
                highlight: 'rgba(255,255,255,0.09)',
                roughness: 0.89,
                env: 0.14
            },

            objectiveTop: {
                side: '#a5abb0',
                top: '#b7bcc1',
                minor: 'rgba(18,20,23,0.16)',
                major: 'rgba(8,10,12,0.30)',
                highlight: 'rgba(255,255,255,0.10)',
                roughness: 0.91,
                env: 0.12
            },

            mark: {
                side: '#3f454c',
                top: '#4e555d',
                minor: 'rgba(0,0,0,0.22)',
                major: 'rgba(0,0,0,0.38)',
                highlight: 'rgba(255,255,255,0.04)',
                roughness: 0.94,
                env: 0.08
            },

            floor: {
                side: '#a4aab0',
                top: '#c7cbcf',
                minor: 'rgba(60,65,70,0.20)',
                major: 'rgba(35,40,45,0.40)',
                highlight: 'rgba(255,255,255,0.10)',
                roughness: 0.96,
                env: 0.08
            }
        };

        const palette = palettes[type] || palettes.structure;

        return {
            ...palette,
            background:
                face === 'top'
                    ? palette.top
                    : palette.side
        };
    }

    function createTexturedMaterial(type = 'structure', face = 'side') {
        const key = `mat:${type}:${face}`;
        if (materialCache.has(key)) return materialCache.get(key);

        const p = getPalette(type, face);

        const map = createBlockoutTexture({
            name: `${type}_${face}`,
            background: p.background,
            minorLine: p.minor,
            majorLine: p.major,
            highlightLine: p.highlight,
            subdivisions: BLOCKOUT_SUBDIVISIONS
        });

        const roughnessMap = createRoughnessTexture(
            `${type}_${face}`,
            Math.round(p.roughness * 255)
        );

        const material = new THREE.MeshStandardMaterial({
            name: `SM_UE_Blockout_${type}_${face}`,
            color: 0xffffff,
            map,
            roughnessMap,
            roughness: p.roughness,
            metalness: 0,
            envMapIntensity: p.env,
            side: THREE.FrontSide
        });

        material.userData ||= {};
        material.userData.isSMBlockoutMaterial = true;
        material.userData.blockoutType = type;
        material.userData.blockoutFace = face;

        materialCache.set(key, material);
        return material;
    }

    // Single material is still needed by cylinders/objective geometry.
    function material(type = 'structure') {
        return createTexturedMaterial(type, 'side');
    }

    // BoxGeometry group/material order:
    // right, left, top, bottom, front, back.
    function boxMaterialSet(type = 'structure') {
        const side = createTexturedMaterial(type, 'side');
        const top = createTexturedMaterial(type, 'top');
        const bottom = createTexturedMaterial(
            type === 'floor' ? 'dark' : type,
            'side'
        );

        return [
            side,
            side,
            top,
            bottom,
            side,
            side
        ];
    }

    // ---------------------------------------------------------------------
    // WORLD-SCALE UVs
    // ---------------------------------------------------------------------

    function createBlockoutBoxGeometry(width, height, depth) {
        const geometry = new THREE.BoxGeometry(
            width,
            height,
            depth,
            1,
            1,
            1
        );

        const uv = geometry.attributes.uv;

        // One texture repeat = 4 world units, texture contains 4 cells.
        // Therefore the visible grid remains ~1 world unit on every object.
        const scales = [
            [depth / BLOCKOUT_WORLD_TILE, height / BLOCKOUT_WORLD_TILE],
            [depth / BLOCKOUT_WORLD_TILE, height / BLOCKOUT_WORLD_TILE],
            [width / BLOCKOUT_WORLD_TILE, depth / BLOCKOUT_WORLD_TILE],
            [width / BLOCKOUT_WORLD_TILE, depth / BLOCKOUT_WORLD_TILE],
            [width / BLOCKOUT_WORLD_TILE, height / BLOCKOUT_WORLD_TILE],
            [width / BLOCKOUT_WORLD_TILE, height / BLOCKOUT_WORLD_TILE]
        ];

        for (let face = 0; face < 6; face += 1) {
            const scaleX = Math.max(0.125, scales[face][0]);
            const scaleY = Math.max(0.125, scales[face][1]);
            const start = face * 4;

            for (let i = 0; i < 4; i += 1) {
                const index = start + i;

                uv.setXY(
                    index,
                    uv.getX(index) * scaleX,
                    uv.getY(index) * scaleY
                );
            }
        }

        uv.needsUpdate = true;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return geometry;
    }

    // ---------------------------------------------------------------------
    // ARENA FLOOR
    // ---------------------------------------------------------------------

    function createArenaGridTexture() {
        const cfg = C();
        const a = cfg.arena;

        const texture = createBlockoutTexture({
            name: 'ArenaFloor',
            background: '#c7cbcf',
            minorLine: 'rgba(66,72,78,0.22)',
            majorLine: 'rgba(35,40,45,0.42)',
            highlightLine: 'rgba(255,255,255,0.10)',
            subdivisions: BLOCKOUT_SUBDIVISIONS,
            subtleChecker: true
        }).clone();

        texture.name = 'SM_UE_ArenaFloorGrid';
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Geometry UVs already carry world-scale repetition.
        // Keep texture repeat at 1 to avoid double-scaling the floor grid.
        texture.repeat.set(1, 1);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = getMaxAnisotropy();
        texture.needsUpdate = true;

        return texture;
    }

    function createArenaFoundation(group) {
        const cfg = C();
        const a = cfg.arena;

        const side = createTexturedMaterial('dark', 'side');

        const top = new THREE.MeshStandardMaterial({
            name: 'SM_UE_ArenaFloor',
            color: 0xffffff,
            map: createArenaGridTexture(),
            roughnessMap: createRoughnessTexture('ArenaFloor', 246),
            roughness: 0.96,
            metalness: 0,
            envMapIntensity: 0.08
        });

        const mesh = new THREE.Mesh(
            createBlockoutBoxGeometry(
                a.width,
                a.floorThickness,
                a.depth
            ),
            [side, side, top, side, side, side]
        );

        mesh.name = 'Arena_Foundation';
        mesh.position.set(
            0,
            -a.floorThickness * 0.5,
            0
        );

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        tag(mesh, {
            collidable: true,
            category: 'arena-floor'
        });

        mesh.userData.physicsShape = 'box';
        mesh.userData.physicsSize = [
            a.width,
            a.floorThickness,
            a.depth
        ];
        mesh.userData.collisionSurface = true;
        mesh.userData.walkableSurface = true;

        group.add(mesh);
        return mesh;
    }

    // ---------------------------------------------------------------------
    // BUILDING PRIMITIVES
    // ---------------------------------------------------------------------

    function addBox(group, {
        name,
        size,
        position,
        rotation = [0, 0, 0],
        type = 'structure',
        collidable = true,
        category = 'obstacle'
    }) {
        const geometry = createBlockoutBoxGeometry(
            size[0],
            size[1],
            size[2]
        );

        const mesh = new THREE.Mesh(
            geometry,
            boxMaterialSet(type)
        );

        mesh.name = name;
        mesh.position.set(...position);
        mesh.rotation.set(...rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        tag(mesh, {
            collidable,
            category
        });

        mesh.userData.physicsShape = 'box';
        mesh.userData.physicsSize = [
            size[0],
            size[1],
            size[2]
        ];
        mesh.userData.walkableSurface = [
            'platform',
            'ramp',
            'stair',
            'cover',
            'objective',
            'arena-floor'
        ].includes(category);

        group.add(mesh);
        return mesh;
    }

    function addWallWithOpening(group, {
        name,
        axis,
        center,
        length,
        openingWidth,
        openingOffset = 0
    }) {
        const cfg = C();
        const h = cfg.arena.wallHeight;
        const t = cfg.arena.wallThickness;

        const leftLength = Math.max(
            0.1,
            (length - openingWidth) * 0.5 + openingOffset
        );

        const rightLength = Math.max(
            0.1,
            (length - openingWidth) * 0.5 - openingOffset
        );

        const horizontal = axis === 'x';

        const leftAlong =
            -length * 0.5 +
            leftLength * 0.5;

        const rightAlong =
            length * 0.5 -
            rightLength * 0.5;

        const pos = along => horizontal
            ? [center[0] + along, h * 0.5, center[2]]
            : [center[0], h * 0.5, center[2] + along];

        const sizeA = horizontal
            ? [leftLength, h, t]
            : [t, h, leftLength];

        const sizeB = horizontal
            ? [rightLength, h, t]
            : [t, h, rightLength];

        addBox(group, {
            name: `${name}_A`,
            type: 'wall',
            size: sizeA,
            position: pos(leftAlong),
            category: 'perimeter-wall'
        });

        addBox(group, {
            name: `${name}_B`,
            type: 'wall',
            size: sizeB,
            position: pos(rightAlong),
            category: 'perimeter-wall'
        });
    }

    function addPerimeterWalls(group) {
        const cfg = C();
        const a = cfg.arena;
        const d = a.doorway;

        addWallWithOpening(group, {
            name: 'Wall_North',
            axis: 'x',
            center: [0, 0, -a.depth * 0.5],
            length: a.width,
            openingWidth: d.north.width,
            openingOffset: d.north.offset
        });

        addWallWithOpening(group, {
            name: 'Wall_South',
            axis: 'x',
            center: [0, 0, a.depth * 0.5],
            length: a.width,
            openingWidth: d.south.width,
            openingOffset: d.south.offset
        });

        addWallWithOpening(group, {
            name: 'Wall_East',
            axis: 'z',
            center: [a.width * 0.5, 0, 0],
            length: a.depth,
            openingWidth: d.east.width,
            openingOffset: d.east.offset
        });

        addWallWithOpening(group, {
            name: 'Wall_West',
            axis: 'z',
            center: [-a.width * 0.5, 0, 0],
            length: a.depth,
            openingWidth: d.west.width,
            openingOffset: d.west.offset
        });
    }

    function addSlopeRamp(group, {
        name,
        start,
        run,
        width,
        rise,
        direction = 'east'
    }) {
        const thickness = 0.42;
        const angle = Math.atan2(rise, run);

        let size;
        let rotation = [0, 0, 0];
        let position;

        if (direction === 'east' || direction === 'west') {
            size = [
                Math.hypot(run, rise),
                thickness,
                width
            ];

            const sign = direction === 'east' ? 1 : -1;
            rotation[2] = sign * angle;

            position = [
                start[0] + sign * run * 0.5,
                rise * 0.5,
                start[1]
            ];
        } else {
            size = [
                width,
                thickness,
                Math.hypot(run, rise)
            ];

            const sign = direction === 'south' ? 1 : -1;
            rotation[0] = -sign * angle;

            position = [
                start[0],
                rise * 0.5,
                start[1] + sign * run * 0.5
            ];
        }

        const mesh = addBox(group, {
            name,
            type: 'structure',
            size,
            position,
            rotation,
            category: 'ramp'
        });

        mesh.userData.physicsSize = size;
        mesh.userData.collisionSurface = true;
        mesh.userData.walkableSurface = true;
        mesh.userData.horizontalBlocking = true;
        return mesh;
    }

    function addStaircase(group, {
        name,
        start,
        steps,
        width,
        stepDepth,
        stepHeight,
        direction = 'north'
    }) {
        const root = new THREE.Group();
        root.name = name;

        tag(root, {
            collidable: false,
            category: 'staircase'
        });

        const vectors = {
            north: [0, -1],
            south: [0, 1],
            east: [1, 0],
            west: [-1, 0]
        };

        const dir = vectors[direction] || vectors.north;

        for (let i = 0; i < steps; i += 1) {
            const h = (i + 1) * stepHeight;

            addBox(root, {
                name: `${name}_Step_${i + 1}`,
                type: 'structure',
                size: [width, h, stepDepth],
                position: [
                    start[0] + dir[0] * stepDepth * i,
                    h * 0.5,
                    start[1] + dir[1] * stepDepth * i
                ],
                rotation: [
                    0,
                    (direction === 'east' || direction === 'west')
                        ? Math.PI * 0.5
                        : 0,
                    0
                ],
                category: 'stair'
            });
        }

        group.add(root);
        return root;
    }

    function addSurfaceLabel(group, {
        name,
        text,
        position,
        size = [5, 1.2],
        rotationY = 0
    }) {
        if (!C().style.showLabels) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 768;
        canvas.height = 160;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '700 56px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C().colors.labelText;
        ctx.fillText(
            text,
            canvas.width * 0.5,
            canvas.height * 0.5
        );

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        const materialLabel = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(size[0], size[1]),
            materialLabel
        );

        mesh.name = name;
        mesh.position.set(...position);
        mesh.rotation.x = -Math.PI * 0.5;
        mesh.rotation.z = rotationY;
        mesh.renderOrder = 5;

        tag(mesh, {
            collidable: false,
            category: 'label'
        });

        mesh.userData.isGameModeLabel = true;
        group.add(mesh);
        return mesh;
    }

    window.SMGameModeBuildingKit = {
        tag,
        material,
        boxMaterialSet,
        createBlockoutTexture,
        createBlockoutBoxGeometry,
        createArenaFoundation,
        addBox,
        addWallWithOpening,
        addPerimeterWalls,
        addSlopeRamp,
        addStaircase,
        addSurfaceLabel
    };
})();