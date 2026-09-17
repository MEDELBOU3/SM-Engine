/**
 * SMCityGenerator.js
 * Advanced Procedural City Generation Engine for SM Engine.
 * Features Balanced UE5 Studio-Matte Prototype Grid Materials (No Glare / No Blowout).
 */
(() => {
    // =========================================================================
    // UNREAL ENGINE 5 DEV GRID TEXTURE GENERATOR
    // =========================================================================

    const textureCache = new Map();

    /**
     * Generates a calibrated UE5 prototype grid with balanced contrast.
     */
    function createUE5GridTexture(baseColor, lineColor, subLineColor, showAccents = true) {
        const key = `${baseColor}_${lineColor}_${subLineColor}_${showAccents}`;
        if (textureCache.has(key)) return textureCache.get(key);

        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        // 1. Base Fill (Mid-tone Matte)
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // 2. 10x10 Subgrid Lines (Subtle & Clean)
        ctx.strokeStyle = subLineColor;
        ctx.lineWidth = 1.0;
        const step = size / 10;
        ctx.beginPath();
        for (let i = 1; i < 10; i++) {
            ctx.moveTo(i * step, 0);
            ctx.lineTo(i * step, size);
            ctx.moveTo(0, i * step);
            ctx.lineTo(size, i * step);
        }
        ctx.stroke();

        // 3. Primary 1x1 Meter Outer Border
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3.0;
        ctx.strokeRect(0, 0, size, size);

        // 4. UE5 Center Crosshair & Corner Marks
        if (showAccents) {
            ctx.fillStyle = lineColor;
            const c = size / 2;
            const crossSize = 8;
            ctx.fillRect(c - crossSize, c - 1, crossSize * 2, 2);
            ctx.fillRect(c - 1, c - crossSize, 2, crossSize * 2);

            const bSize = 14;
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 2.0;

            // Top-Left
            ctx.beginPath();
            ctx.moveTo(4, 4 + bSize); ctx.lineTo(4, 4); ctx.lineTo(4 + bSize, 4);
            // Top-Right
            ctx.moveTo(size - 4 - bSize, 4); ctx.lineTo(size - 4, 4); ctx.lineTo(size - 4, 4 + bSize);
            // Bottom-Left
            ctx.moveTo(4, size - 4 - bSize); ctx.lineTo(4, size - 4); ctx.lineTo(4 + bSize, size - 4);
            // Bottom-Right
            ctx.moveTo(size - 4 - bSize, size - 4); ctx.lineTo(size - 4, size - 4); ctx.lineTo(size - 4, size - 4 - bSize);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        if (typeof THREE.SRGBColorSpace !== "undefined") {
            texture.colorSpace = THREE.SRGBColorSpace;
        } else if (typeof THREE.sRGBEncoding !== "undefined") {
            texture.encoding = THREE.sRGBEncoding;
        }

        textureCache.set(key, texture);
        return texture;
    }

    // =========================================================================
    // CALIBRATED UE5 PALETTE (MATTE MID-TONES — BALANCED LIGHT RESPONSE)
    // =========================================================================

    const CITY_PALETTE = {
        // Deep Road Grid
        asphalt: {
            base: "#1c1f24", line: "#353b45", sub: "#242930",
            roughness: 0.9, metalness: 0.0
        },
        roadMarking: {
            base: "#b8860b", line: "#d4a017", sub: "#9c7207",
            roughness: 0.8, metalness: 0.0, accents: false
        },
        crosswalk: {
            base: "#7f8c8d", line: "#bdc3c7", sub: "#6c7778",
            roughness: 0.85, metalness: 0.0, accents: false
        },
        // Mid-tone Sidewalk Grid
        sidewalk: {
            base: "#383e47", line: "#545d6b", sub: "#2f343c",
            roughness: 0.88, metalness: 0.0
        },
        curb: {
            base: "#282c33", line: "#424954", sub: "#21252b",
            roughness: 0.9, metalness: 0.0
        },
        // Muted UE5 Cyan/Teal Prototype Grid
        glassCommercial: {
            base: "#1a3a52", line: "#2d5f85", sub: "#152f42",
            roughness: 0.65, metalness: 0.05
        },
        // Standard UE5 Neutral Greybox (Default Wall/Floor)
        concreteLight: {
            base: "#4a515c", line: "#727c8d", sub: "#3f454f",
            roughness: 0.85, metalness: 0.0
        },
        // Slate Accent Grid
        concreteDark: {
            base: "#2b3038", line: "#474f5c", sub: "#24282f",
            roughness: 0.88, metalness: 0.0
        },
        // Authentic UE5 Orange Dev Blockout (No neon blow-out)
        brickResidential: {
            base: "#8c3b1d", line: "#bd5730", sub: "#753016",
            roughness: 0.85, metalness: 0.0
        },
        // Industrial Dark Slate
        metalIndustrial: {
            base: "#373e47", line: "#596473", sub: "#2e343b",
            roughness: 0.75, metalness: 0.1
        },
        // Matte Park Green
        grassPark: {
            base: "#1e472a", line: "#316e43", sub: "#183821",
            roughness: 0.92, metalness: 0.0
        },
        foliage: {
            base: "#153d21", line: "#246135", sub: "#0f2c18",
            roughness: 0.9, metalness: 0.0
        },
        wood: {
            base: "#4e3319", line: "#7a522a", sub: "#3d2813",
            roughness: 0.85, metalness: 0.0
        },
        metalDark: {
            base: "#20242b", line: "#3b424d", sub: "#181b20",
            roughness: 0.65, metalness: 0.1
        },
        hazardLight: {
            base: "#a8281a", line: "#d63826", sub: "#8a2014",
            roughness: 0.4, metalness: 0.0
        }
    };

    const materialsCache = new Map();

    function getMat(key) {
        if (materialsCache.has(key)) return materialsCache.get(key);

        if (typeof window !== "undefined" && typeof window.createObstacleMaterial === "function" && key === "blockout") {
            return window.createObstacleMaterial("structure");
        }

        const conf = CITY_PALETTE[key] || CITY_PALETTE.concreteLight;
        const gridTexture = createUE5GridTexture(
            conf.base,
            conf.line,
            conf.sub,
            conf.accents !== undefined ? conf.accents : true
        );

        const mat = new THREE.MeshStandardMaterial({
            map: gridTexture,
            roughness: conf.roughness,
            metalness: conf.metalness,
            side: THREE.DoubleSide
        });

        materialsCache.set(key, mat);
        return mat;
    }

    function createMesh(geometry, matKey) {
        const mesh = new THREE.Mesh(geometry, getMat(matKey));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const geometryType = String(geometry?.type || '');
        mesh.userData = {
            selectable: true,
            isCityObject: true,
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            physicsShape: /BoxGeometry/i.test(geometryType)
                ? 'box'
                : (/CylinderGeometry/i.test(geometryType) ? 'cylinder' : 'trimesh'),
            horizontalBlocking: true,
            noTraversal: true,
            friction: 0.84,
            restitution: 0.015
        };
        return mesh;
    }

    // =========================================================================
    // PRIMITIVE UTILITIES WITH WORLD-SCALE UV PROJECTION (2M TILES)
    // =========================================================================

    function createWorldGridBoxGeometry(w, h, d, unitSize = 2.0) {
        const geom = new THREE.BoxGeometry(w, h, d);
        const uvAttr = geom.attributes.uv;

        const faceScales = [
            [d / unitSize, h / unitSize],
            [d / unitSize, h / unitSize],
            [w / unitSize, d / unitSize],
            [w / unitSize, d / unitSize],
            [w / unitSize, h / unitSize],
            [w / unitSize, h / unitSize]
        ];

        for (let f = 0; f < 6; f++) {
            for (let v = 0; v < 4; v++) {
                const idx = f * 4 + v;
                uvAttr.setXY(
                    idx,
                    uvAttr.getX(idx) * faceScales[f][0],
                    uvAttr.getY(idx) * faceScales[f][1]
                );
            }
        }
        uvAttr.needsUpdate = true;
        return geom;
    }

    function box(w, h, d, x = 0, y = h / 2, z = 0, matKey = "concreteLight") {
        const mesh = createMesh(createWorldGridBoxGeometry(w, h, d, 2.0), matKey);
        mesh.position.set(x, y, z);
        return mesh;
    }

    function cylinder(rTop, rBot, h, segs, x = 0, y = h / 2, z = 0, matKey = "metalDark") {
        const mesh = createMesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), matKey);
        mesh.position.set(x, y, z);
        return mesh;
    }

    function createRNG(seed = 12345) {
        let s = seed;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    // =========================================================================
    // STREET FURNITURE & PROPS GENERATORS
    // =========================================================================

    function buildStreetLight() {
        const group = new THREE.Group();
        group.name = "StreetLight";
        group.add(cylinder(0.08, 0.12, 4.5, 12, 0, 2.25, 0, "metalDark"));
        const arm = box(1.2, 0.08, 0.08, 0.5, 4.4, 0, "metalDark");
        group.add(arm);
        const fixture = box(0.4, 0.1, 0.2, 1.0, 4.3, 0, "concreteLight");
        group.add(fixture);
        return group;
    }

    function buildTree() {
        const group = new THREE.Group();
        group.name = "CityTree";
        group.add(cylinder(0.15, 0.25, 2.0, 8, 0, 1.0, 0, "wood"));
        group.add(cylinder(0.0, 1.2, 2.2, 8, 0, 2.5, 0, "grassPark"));
        group.add(cylinder(0.0, 0.9, 1.8, 8, 0, 3.4, 0, "grassPark"));
        return group;
    }

    function buildTrafficLight() {
        const group = new THREE.Group();
        group.name = "TrafficLight";
        group.add(cylinder(0.1, 0.14, 5.0, 12, 0, 2.5, 0, "metalDark"));
        group.add(box(3.5, 0.1, 0.1, 1.5, 4.8, 0, "metalDark"));
        
        const boxHousing = box(0.3, 0.9, 0.3, 2.8, 4.6, 0, "concreteDark");
        boxHousing.add(box(0.12, 0.2, 0.05, 0, 0.25, 0.16, "hazardLight"));
        boxHousing.add(box(0.12, 0.2, 0.05, 0, 0, 0.16, "roadMarking"));
        boxHousing.add(box(0.12, 0.2, 0.05, 0, -0.25, 0.16, "grassPark"));
        group.add(boxHousing);
        return group;
    }

    function buildBench() {
        const group = new THREE.Group();
        group.add(box(1.5, 0.08, 0.4, 0, 0.45, 0, "wood"));
        group.add(box(1.5, 0.4, 0.06, 0, 0.7, -0.18, "wood"));
        group.add(box(0.08, 0.45, 0.4, -0.6, 0.225, 0, "metalDark"));
        group.add(box(0.08, 0.45, 0.4, 0.6, 0.225, 0, "metalDark"));
        return group;
    }

    // =========================================================================
    // PROCEDURAL BUILDING ARCHITECTURE ENGINE
    // =========================================================================

    function buildCommercialSkyscraper(w, d, h, rng) {
        const group = new THREE.Group();
        group.name = "Skyscraper_Commercial";

        const lobbyH = 4.5;
        group.add(box(w, lobbyH, d, 0, lobbyH / 2, 0, "glassCommercial"));
        group.add(box(w + 0.4, 0.4, d + 0.4, 0, lobbyH, 0, "concreteDark"));
        group.add(box(w * 0.5, 0.15, 2.0, 0, 3.2, d / 2 + 0.8, "metalDark"));

        let currentY = lobbyH;
        let currentW = w * 0.92;
        let currentD = d * 0.92;
        const tiers = 3 + Math.floor(rng() * 3);
        const tierH = (h - lobbyH - 6) / tiers;

        for (let t = 0; t < tiers; t++) {
            const tierMesh = box(currentW, tierH, currentD, 0, currentY + tierH / 2, 0, "glassCommercial");
            
            const mullions = 4;
            for (let m = 0; m <= mullions; m++) {
                const mx = -currentW / 2 + (currentW / mullions) * m;
                tierMesh.add(box(0.15, tierH, 0.1, mx, 0, currentD / 2 + 0.05, "metalDark"));
                tierMesh.add(box(0.15, tierH, 0.1, mx, 0, -currentD / 2 - 0.05, "metalDark"));
            }

            group.add(tierMesh);
            group.add(box(currentW + 0.3, 0.3, currentD + 0.3, 0, currentY + tierH, 0, "concreteDark"));

            currentY += tierH;
            currentW *= 0.85;
            currentD *= 0.85;
        }

        const roofY = currentY;
        group.add(box(currentW * 0.7, 3.0, currentD * 0.7, 0, roofY + 1.5, 0, "concreteDark"));
        group.add(cylinder(0.8, 0.8, 1.2, 12, -currentW * 0.2, roofY + 0.6, 0, "metalIndustrial"));
        group.add(cylinder(0.8, 0.8, 1.2, 12, currentW * 0.2, roofY + 0.6, 0, "metalIndustrial"));
        
        const spireH = 6.0 + rng() * 6.0;
        group.add(cylinder(0.05, 0.2, spireH, 8, 0, roofY + 3.0 + spireH / 2, 0, "metalDark"));
        group.add(box(0.3, 0.3, 0.3, 0, roofY + 3.0 + spireH, 0, "hazardLight"));

        return group;
    }

    function buildResidentialApartment(w, d, h, rng) {
        const group = new THREE.Group();
        group.name = "Building_Residential";

        const stories = Math.floor(h / 3.0);
        const storyH = h / stories;
        const mainMat = rng() > 0.5 ? "brickResidential" : "concreteLight";
        group.add(box(w, h, d, 0, h / 2, 0, mainMat));

        const cols = Math.floor(w / 2.5);
        for (let s = 1; s < stories; s++) {
            const sy = s * storyH;
            for (let c = 0; c < cols; c++) {
                const cx = -w / 2 + (w / (cols + 1)) * (c + 1);
                
                group.add(box(1.2, 1.4, 0.1, cx, sy + 0.2, d / 2 + 0.05, "glassCommercial"));
                
                if (s % 2 === 0) {
                    group.add(box(1.6, 0.1, 0.8, cx, sy - 0.5, d / 2 + 0.4, "concreteDark"));
                    group.add(box(1.6, 0.8, 0.05, cx, sy - 0.1, d / 2 + 0.78, "metalDark"));
                }

                group.add(box(1.2, 1.4, 0.1, cx, sy + 0.2, -d / 2 - 0.05, "glassCommercial"));
            }
        }

        group.add(box(w + 0.2, 0.6, 0.2, 0, h + 0.3, d / 2, "concreteDark"));
        group.add(box(w + 0.2, 0.6, 0.2, 0, h + 0.3, -d / 2, "concreteDark"));
        group.add(box(0.2, 0.6, d + 0.2, -w / 2, h + 0.3, 0, "concreteDark"));
        group.add(box(0.2, 0.6, d + 0.2, w / 2, h + 0.3, 0, "concreteDark"));

        const tankGroup = new THREE.Group();
        tankGroup.position.set(-w * 0.25, h, -d * 0.25);
        tankGroup.add(box(0.2, 1.5, 0.2, -0.6, 0.75, -0.6, "metalDark"));
        tankGroup.add(box(0.2, 1.5, 0.2, 0.6, 0.75, -0.6, "metalDark"));
        tankGroup.add(box(0.2, 1.5, 0.2, -0.6, 0.75, 0.6, "metalDark"));
        tankGroup.add(box(0.2, 1.5, 0.2, 0.6, 0.75, 0.6, "metalDark"));
        tankGroup.add(cylinder(1.0, 1.0, 2.0, 12, 0, 2.5, 0, "wood"));
        tankGroup.add(cylinder(0.0, 1.2, 0.8, 12, 0, 3.9, 0, "wood"));
        group.add(tankGroup);

        return group;
    }

    function buildIndustrialWarehouse(w, d, h, rng) {
        const group = new THREE.Group();
        group.name = "Building_Industrial";

        group.add(box(w, h, d, 0, h / 2, 0, "metalIndustrial"));

        const dockDoors = 2;
        for (let i = 0; i < dockDoors; i++) {
            const dx = -w / 4 + (w / 2) * i;
            group.add(box(2.2, 3.0, 0.1, dx, 1.5, d / 2 + 0.05, "concreteDark"));
            group.add(box(2.6, 0.4, 1.2, dx, 0.2, d / 2 + 0.6, "concreteLight"));
        }

        const silos = 2;
        for (let i = 0; i < silos; i++) {
            const sx = w / 2 + 1.2;
            const sz = -d / 4 + (d / 2) * i;
            group.add(cylinder(1.2, 1.2, h * 1.2, 16, sx, (h * 1.2) / 2, sz, "concreteLight"));
            group.add(cylinder(0.0, 1.25, 0.6, 16, sx, h * 1.2 + 0.3, sz, "metalDark"));
        }

        return group;
    }

    function buildParkBlock(w, d, rng) {
        const group = new THREE.Group();
        group.name = "City_Park";

        group.add(box(w, 0.15, d, 0, 0.075, 0, "grassPark"));
        group.add(box(w, 0.16, 2.5, 0, 0.08, 0, "concreteLight"));
        group.add(box(2.5, 0.16, d, 0, 0.08, 0, "concreteLight"));

        group.add(cylinder(2.5, 3.0, 0.6, 16, 0, 0.4, 0, "concreteDark"));
        group.add(cylinder(0.2, 0.5, 3.0, 12, 0, 2.0, 0, "metalDark"));

        const treePositions = [
            [-w * 0.3, -d * 0.3], [w * 0.3, -d * 0.3],
            [-w * 0.3, d * 0.3],  [w * 0.3, d * 0.3]
        ];

        treePositions.forEach(([tx, tz]) => {
            const tree = buildTree();
            tree.position.set(tx, 0.15, tz);
            group.add(tree);
        });

        const bench1 = buildBench();
        bench1.position.set(0, 0.15, 2.0);
        group.add(bench1);

        const bench2 = buildBench();
        bench2.position.set(0, 0.15, -2.0);
        bench2.rotation.y = Math.PI;
        group.add(bench2);

        return group;
    }

    // =========================================================================
    // ROAD NETWORK & DISTRICT GENERATOR
    // =========================================================================

    function buildRoadSegment(length, width, axis = "z") {
        const group = new THREE.Group();
        const rw = axis === "z" ? width : length;
        const rd = axis === "z" ? length : width;
        group.add(box(rw, 0.1, rd, 0, 0.05, 0, "asphalt"));

        const dashCount = Math.floor(length / 3.0);
        for (let i = 0; i < dashCount; i++) {
            const pos = -length / 2 + (length / dashCount) * i + 0.75;
            const lx = axis === "z" ? 0 : pos;
            const lz = axis === "z" ? pos : 0;
            const lw = axis === "z" ? 0.15 : 1.2;
            const ld = axis === "z" ? 1.2 : 0.15;
            group.add(box(lw, 0.12, ld, lx, 0.06, lz, "roadMarking"));
        }
        return group;
    }

    function buildIntersection(size) {
        const group = new THREE.Group();
        group.add(box(size, 0.1, size, 0, 0.05, 0, "asphalt"));

        const stripeW = 0.4;
        const stripeL = size * 0.7;
        const stripes = 5;

        for (let i = 0; i < stripes; i++) {
            const offset = -stripeL / 2 + (stripeL / stripes) * i + 0.2;
            group.add(box(stripeW, 0.12, 1.8, offset, 0.06, size / 2 - 1.2, "crosswalk"));
            group.add(box(stripeW, 0.12, 1.8, offset, 0.06, -size / 2 + 1.2, "crosswalk"));
            group.add(box(1.8, 0.12, stripeW, size / 2 - 1.2, 0.06, offset, "crosswalk"));
            group.add(box(1.8, 0.12, stripeW, -size / 2 + 1.2, 0.06, offset, "crosswalk"));
        }

        const lightOffsets = [
            [-size / 2 + 0.8, -size / 2 + 0.8, 0],
            [size / 2 - 0.8, size / 2 - 0.8, Math.PI],
            [-size / 2 + 0.8, size / 2 - 0.8, -Math.PI / 2],
            [size / 2 - 0.8, -size / 2 + 0.8, Math.PI / 2]
        ];

        lightOffsets.forEach(([lx, lz, rot]) => {
            const tl = buildTrafficLight();
            tl.position.set(lx, 0.1, lz);
            tl.rotation.y = rot;
            group.add(tl);
        });

        return group;
    }

    function buildSidewalkBlock(blockW, blockD, sidewalkW) {
        const group = new THREE.Group();
        const swMesh = box(blockW, 0.25, blockD, 0, 0.125, 0, "sidewalk");
        group.add(swMesh);

        const curbThick = 0.15;
        group.add(box(blockW + curbThick, 0.28, curbThick, 0, 0.14, blockD / 2 + curbThick / 2, "curb"));
        group.add(box(blockW + curbThick, 0.28, curbThick, 0, 0.14, -blockD / 2 - curbThick / 2, "curb"));
        group.add(box(curbThick, 0.28, blockD + curbThick, blockW / 2 + curbThick / 2, 0.14, 0, "curb"));
        group.add(box(curbThick, 0.28, blockD + curbThick, -blockW / 2 - curbThick / 2, 0.14, 0, "curb"));

        return group;
    }

    // =========================================================================
    // MASTER CITY BUILDER & PUBLIC API
    // =========================================================================

    function generateCity(config = {}) {
        const options = {
            gridX: config.gridX || 4,
            gridZ: config.gridZ || 4,
            blockSize: config.blockSize || 36,
            roadWidth: config.roadWidth || 10,
            sidewalkWidth: config.sidewalkWidth || 2.5,
            seed: config.seed || 999,
            includeProps: config.includeProps !== undefined ? config.includeProps : true
        };

        const rng = createRNG(options.seed);
        const cityRoot = new THREE.Group();
        cityRoot.name = "SM_Procedural_City";
        cityRoot.userData = {
            isCityRoot: true,
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            recommendedCollider: 'compound',
            noTraversal: true
        };

        const step = options.blockSize + options.roadWidth;
        const totalW = options.gridX * step;
        const totalD = options.gridZ * step;

        const startX = -totalW / 2 + step / 2;
        const startZ = -totalD / 2 + step / 2;

        console.log(`[SMCityGenerator] Generating ${options.gridX}x${options.gridZ} Calibrated UE5 City Grid...`);

        // 1. Build Roads & Intersections Grid
        for (let gx = 0; gx <= options.gridX; gx++) {
            for (let gz = 0; gz <= options.gridZ; gz++) {
                const rx = startX - options.blockSize / 2 - options.roadWidth / 2 + gx * step;
                const rz = startZ - options.blockSize / 2 - options.roadWidth / 2 + gz * step;

                const intersection = buildIntersection(options.roadWidth);
                intersection.position.set(rx, 0, rz);
                cityRoot.add(intersection);

                if (gx < options.gridX) {
                    const roadH = buildRoadSegment(options.blockSize, options.roadWidth, "x");
                    roadH.position.set(rx + step / 2, 0, rz);
                    cityRoot.add(roadH);
                }

                if (gz < options.gridZ) {
                    const roadV = buildRoadSegment(options.blockSize, options.roadWidth, "z");
                    roadV.position.set(rx, 0, rz + step / 2);
                    cityRoot.add(roadV);
                }
            }
        }

        // 2. Build Blocks & Assign District Types
        for (let bx = 0; bx < options.gridX; bx++) {
            for (let bz = 0; bz < options.gridZ; bz++) {
                const blockX = startX + bx * step;
                const blockZ = startZ + bz * step;

                const distFromCenter = Math.sqrt(
                    Math.pow((bx - options.gridX / 2 + 0.5), 2) + 
                    Math.pow((bz - options.gridZ / 2 + 0.5), 2)
                );

                let districtType = "commercial";
                if (distFromCenter < 1.2) {
                    districtType = rng() > 0.25 ? "commercial" : "park";
                } else if (distFromCenter < 2.2) {
                    districtType = "residential";
                } else {
                    districtType = rng() > 0.4 ? "industrial" : "residential";
                }

                const blockGroup = new THREE.Group();
                blockGroup.name = `Block_${bx}_${bz}_${districtType}`;
                blockGroup.position.set(blockX, 0, blockZ);

                const sidewalk = buildSidewalkBlock(options.blockSize, options.blockSize, options.sidewalkWidth);
                blockGroup.add(sidewalk);

                if (options.includeProps && districtType !== "park") {
                    const slOffset = options.blockSize / 2 - 0.8;
                    const slPositions = [
                        [-slOffset, slOffset, 0],
                        [slOffset, slOffset, Math.PI],
                        [-slOffset, -slOffset, 0],
                        [slOffset, -slOffset, Math.PI]
                    ];
                    slPositions.forEach(([sx, sz, srot]) => {
                        const light = buildStreetLight();
                        light.position.set(sx, 0.25, sz);
                        light.rotation.y = srot;
                        blockGroup.add(light);
                    });
                }

                const innerW = options.blockSize - options.sidewalkWidth * 2;
                const innerD = options.blockSize - options.sidewalkWidth * 2;

                if (districtType === "park") {
                    const park = buildParkBlock(innerW, innerD, rng);
                    park.position.y = 0.25;
                    blockGroup.add(park);
                } else if (districtType === "commercial") {
                    const h = 28 + rng() * 32;
                    const bldg = buildCommercialSkyscraper(innerW * 0.85, innerD * 0.85, h, rng);
                    bldg.position.y = 0.25;
                    blockGroup.add(bldg);
                } else if (districtType === "residential") {
                    const b1W = innerW * 0.45;
                    const h1 = 12 + rng() * 14;
                    const bldg1 = buildResidentialApartment(b1W, innerD * 0.85, h1, rng);
                    bldg1.position.set(-innerW * 0.24, 0.25, 0);
                    blockGroup.add(bldg1);

                    const h2 = 12 + rng() * 14;
                    const bldg2 = buildResidentialApartment(b1W, innerD * 0.85, h2, rng);
                    bldg2.position.set(innerW * 0.24, 0.25, 0);
                    blockGroup.add(bldg2);
                } else if (districtType === "industrial") {
                    const h = 8 + rng() * 6;
                    const warehouse = buildIndustrialWarehouse(innerW * 0.8, innerD * 0.8, h, rng);
                    warehouse.position.y = 0.25;
                    blockGroup.add(warehouse);
                }

                cityRoot.add(blockGroup);
            }
        }

        window.SMPlayerCollisionRegistry?.registerObject?.(cityRoot, {
            collisionLayer: 'world-static',
            bodyType: 'static',
            traversalType: false
        });
        console.log(`%c[SMCityGenerator]%c Calibrated City generated successfully!`, "color: #00c6ff; font-weight: bold;", "color: #fff;");
        return cityRoot;
    }

    // Export to Window global
    window.SMCityGenerator = {
        version: "1.3.0",
        generate: generateCity,
        buildBuilding: {
            commercial: buildCommercialSkyscraper,
            residential: buildResidentialApartment,
            industrial: buildIndustrialWarehouse,
            park: buildParkBlock
        },
        buildProps: {
            streetLight: buildStreetLight,
            trafficLight: buildTrafficLight,
            tree: buildTree,
            bench: buildBench
        }
    };

    let assetsPanelRegistrationAttempts = 0;
    const MAX_ASSETS_PANEL_REGISTRATION_ATTEMPTS = 80;

    const refreshAssetsPanelCityLibrary = (options = {}) => {
        const panel =
            (typeof AssetsPanel !== "undefined" ? AssetsPanel : null) ||
            window.AssetsPanel ||
            null;

        if (!panel || !panel.dom || !panel.dom.grid) {
            if (options.retry !== false && assetsPanelRegistrationAttempts < MAX_ASSETS_PANEL_REGISTRATION_ATTEMPTS) {
                assetsPanelRegistrationAttempts += 1;
                setTimeout(() => refreshAssetsPanelCityLibrary(options), 250);
            }
            return false;
        }

        try {
            assetsPanelRegistrationAttempts = 0;

            if (typeof panel.registerCityLibrary === "function") {
                panel.registerCityLibrary({
                    reveal: options.reveal === true,
                    render: true
                });
            } else {
                panel._ensureBuiltins?.();
                panel.render?.();
            }

            console.log(
                "[SMCityGenerator] Procedural City assets registered in AssetsPanel."
            );
            return true;
        } catch (error) {
            console.error(
                "[SMCityGenerator] Failed to register city assets in AssetsPanel:",
                error
            );
            return false;
        }
    };

    window.SMCityGenerator.registerAssets = (options = {}) =>
        refreshAssetsPanelCityLibrary({ ...options, retry: options.retry !== false });

    window.addEventListener("sm-assets-panel-ready", () => {
        refreshAssetsPanelCityLibrary({ retry: false });
    });

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(() => refreshAssetsPanelCityLibrary({ retry: true }), 0),
            { once: true }
        );
    } else {
        setTimeout(() => refreshAssetsPanelCityLibrary({ retry: true }), 0);
    }
})();
