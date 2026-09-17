// Procedural game-development obstacle & building library for the SM Engine Content Browser.
(() => {
    // Fallback palette if grid-materials-obstacles.js is not loaded
    const FALLBACK_PALETTE = {
        blockout: { color: 0x58506d, roughness: 0.88, metalness: 0.1 },
        gameplay: { color: 0xd47355, roughness: 0.75, metalness: 0.1 },
        accent: { color: 0x2682c9, roughness: 0.68, metalness: 0.2 },
        dark: { color: 0x2a2538, roughness: 0.85, metalness: 0.3 }
    };

    /**
     * Map library styles to grid-materials-obstacles.js material types
     */
    function getGridMaterial(style = "blockout") {
        if (typeof window !== "undefined" && typeof window.createObstacleMaterial === "function") {
            const styleMap = {
                blockout: "structure", // Neutral graybox grid
                gameplay: "orange",    // Interactive / Hurdle orange grid
                accent: "blue",      // Key highlight / UE5 blue grid
                dark: "wall"       // Slate dark wall grid
            };
            const matType = styleMap[style] || "structure";
            return window.createObstacleMaterial(matType);
        }

        // Fallback standard material if grid system is absent
        const values = FALLBACK_PALETTE[style] || FALLBACK_PALETTE.blockout;
        return new THREE.MeshStandardMaterial({
            color: values.color,
            roughness: values.roughness,
            metalness: values.metalness,
            side: THREE.DoubleSide
        });
    }

    function finishMesh(mesh, style = "blockout") {
        if (!mesh.material) mesh.material = getGridMaterial(style);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const geometryType = String(mesh.geometry?.type || '');
        const physicsShape = /BoxGeometry/i.test(geometryType)
            ? 'box'
            : (/CylinderGeometry/i.test(geometryType) ? 'cylinder' : 'trimesh');
        mesh.userData = {
            ...mesh.userData,
            selectable: true,
            isGameObstaclePart: true,
            isSystemObject: false,
            ignoreInHierarchy: false,
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            physicsShape,
            horizontalBlocking: true,
            friction: 0.82,
            restitution: 0.02
        };
        return mesh;
    }

    // =========================================================================
    // PRIMITIVE GENERATORS
    // =========================================================================

    function box(width, height, depth, x = 0, y = height / 2, z = 0, style = "blockout", rx = 0, ry = 0, rz = 0) {
        let geometry;
        if (typeof window !== "undefined" && typeof window.createBoxWithCustomUVs === "function") {
            geometry = window.createBoxWithCustomUVs(width, height, depth);
        } else {
            geometry = new THREE.BoxGeometry(width, height, depth);
        }

        const mesh = finishMesh(new THREE.Mesh(geometry, getGridMaterial(style)), style);
        mesh.position.set(x, y, z);
        if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
        return mesh;
    }

    function cylinder(radius, height, x = 0, y = height / 2, z = 0, style = "blockout", segments = 32, rx = 0, ry = 0, rz = 0) {
        const mesh = finishMesh(
            new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), getGridMaterial(style)),
            style
        );
        mesh.position.set(x, y, z);
        if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
        return mesh;
    }

    function pipeRing(outerRadius, innerRadius, height, x = 0, y = height / 2, z = 0, style = "dark") {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
        shape.holes.push(holePath);

        const extrudeSettings = { depth: height, bevelEnabled: false, curveSegments: 32 };
        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.rotateX(Math.PI / 2);
        geom.center();

        const mesh = finishMesh(new THREE.Mesh(geom, getGridMaterial(style)), style);
        mesh.position.set(x, y, z);
        return mesh;
    }

    function wedge(width, height, depth, style = "gameplay", x = 0, y = 0, z = 0, ry = 0) {
        // 1. رسم بروفايل المثلث القائم (Side Profile f YZ Plane)
        const shape = new THREE.Shape();
        shape.moveTo(depth / 2, 0);          // القاعدة القدامية (الواطية)
        shape.lineTo(-depth / 2, 0);         // القاعدة الخلفية
        shape.lineTo(-depth / 2, height);    // القمة العالية f الظهر
        shape.closePath();                   // خط المائل (الطلعة dyal Ramp)

        // 2. Extrude b-Width (العرض)
        const extrudeSettings = {
            depth: width,
            bevelEnabled: false
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // 3. تدوير الـ Extrusion باش يجي العرض f X-Axis والـ Ramp f Z-Axis
        geometry.rotateY(Math.PI / 2);

        // 4. ضبط المركز f (0,0,0) باش يحسب الـ Height والـ Position صحاح
        geometry.center();

        // 5. إعادة حساب الضوء والـ Normals للوجه الخارجي
        geometry.computeVertexNormals();

        const mesh = finishMesh(new THREE.Mesh(geometry, getGridMaterial(style)), style);

        // Y + height/2 باش تكون القاعدة مسطحة نيشان فوق الأرض (Y=0)
        mesh.position.set(x, y + height / 2, z);
        mesh.rotation.y = ry;

        return mesh;
    }

    // =========================================================================
    // COMPLEX PROCEDURAL COMPONENT HELPERS
    // =========================================================================

    function createRailing(length, height = 1.0, x = 0, y = 0, z = 0, axis = "x", style = "dark") {
        const group = new THREE.Group();
        const thickness = 0.06;
        const topBar = box(axis === "x" ? length : thickness, thickness, axis === "z" ? length : thickness, 0, height, 0, style);
        const midBar = box(axis === "x" ? length : thickness, thickness, axis === "z" ? length : thickness, 0, height * 0.5, 0, style);
        group.add(topBar, midBar);

        const posts = 5;
        const step = length / (posts - 1);
        for (let i = 0; i < posts; i++) {
            const pos = -length / 2 + i * step;
            const px = axis === "x" ? pos : 0;
            const pz = axis === "z" ? pos : 0;
            group.add(box(thickness, height, thickness, px, height / 2, pz, style));
        }
        group.position.set(x, y, z);
        return group;
    }

    function createLadder(height, x = 0, y = 0, z = 0, ry = 0, style = "accent") {
        const group = new THREE.Group();
        const width = 0.6;
        const thickness = 0.05;
        // Rails
        group.add(cylinder(thickness, height, -width / 2, height / 2, 0, style));
        group.add(cylinder(thickness, height, width / 2, height / 2, 0, style));
        // Rungs
        const rungs = Math.floor(height / 0.35);
        for (let i = 1; i <= rungs; i++) {
            const ryPos = i * 0.35;
            if (ryPos < height - 0.1) {
                group.add(box(width, thickness * 1.2, thickness * 1.2, 0, ryPos, 0, "dark"));
            }
        }
        group.position.set(x, y, z);
        group.rotation.y = ry;
        return group;
    }

    function createContainer(width = 2.6, height = 2.6, length = 6.0, x = 0, y = 0, z = 0, ry = 0, style = "gameplay") {
        const group = new THREE.Group();
        // Shell
        group.add(box(width, height, length, 0, height / 2, 0, style));
        // Corner frame pillars
        const hw = width / 2;
        const hl = length / 2;
        group.add(box(0.2, height, 0.2, -hw, height / 2, -hl, "dark"));
        group.add(box(0.2, height, 0.2, hw, height / 2, -hl, "dark"));
        group.add(box(0.2, height, 0.2, -hw, height / 2, hl, "dark"));
        group.add(box(0.2, height, 0.2, hw, height / 2, hl, "dark"));
        // Doors detail trim
        group.add(box(width - 0.2, 0.1, 0.1, 0, height - 0.1, hl + 0.02, "accent"));
        group.add(box(width - 0.2, 0.1, 0.1, 0, 0.1, hl + 0.02, "accent"));

        group.position.set(x, y, z);
        group.rotation.y = ry;
        return group;
    }

    function actor(name, children, metadata = {}) {
        const root = new THREE.Group();
        root.name = name;
        const category = metadata.category || "Blockout";
        const autoTraversal = metadata.traversalType !== undefined
            ? metadata.traversalType
            : (/parkour|cover|wall/i.test(category) || /vault|barrier|hurdle|climb|mantle/i.test(name)
                ? 'AUTO'
                : false);
        root.userData = {
            selectable: true,
            isSelectableRoot: true,
            isGameObstacle: true,
            isSystemObject: false,
            ignoreInHierarchy: false,
            obstacleCategory: category,
            obstacleMotion: metadata.motion || "static",
            recommendedCollider: metadata.collider || "compound",
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: metadata.motion === 'kinematic' ? 'kinematic' : 'static',
            traversalType: autoTraversal || null,
            noTraversal: !autoTraversal
        };
        children.filter(Boolean).forEach((child) => root.add(child));
        root.traverse(part => {
            if (!part?.isMesh) return;
            part.userData = part.userData || {};
            part.userData.collisionEnabled = true;
            part.userData.collisionLayer = 'world-static';
            part.userData.bodyType = root.userData.bodyType;
            part.userData.obstacleRoot = root.uuid;
            part.userData.traversalType = autoTraversal || null;
            part.userData.noTraversal = !autoTraversal;
        });
        window.SMPlayerCollisionRegistry?.registerObject?.(root, {
            collisionLayer: 'world-static',
            bodyType: root.userData.bodyType,
            traversalType: autoTraversal || false
        });
        return root;
    }

    // =========================================================================
    // ADVANCED BUILDERS LIBRARY
    // =========================================================================

    const builders = {
        // --- Classic Blockout Primitives ---
        block() {
            return actor("Block_2m", [box(2, 2, 2, 0, 1, 0, "gameplay")], { category: "Primitives", collider: "box" });
        },
        wall() {
            return actor("Blockout_Wall", [
                box(6, 3.2, 0.4, 0, 1.6, 0, "blockout"),
                box(6.2, 0.3, 0.6, 0, 0.15, 0, "dark"),
                box(6.2, 0.2, 0.5, 0, 3.1, 0, "accent")
            ], { category: "Walls" });
        },
        lowCover() {
            return actor("Low_Cover", [
                box(3.6, 1.05, 0.65, 0, 0.525, 0, "dark"),
                box(3.3, 0.12, 0.76, 0, 1.08, 0, "accent")
            ], { category: "Cover" });
        },
        barrier() {
            return actor("Gameplay_Barrier", [
                box(3.2, 0.72, 0.5, 0, 0.52, 0, "gameplay"),
                box(2.65, 0.38, 0.72, 0, 0.19, 0, "dark")
            ], { category: "Cover" });
        },
        ramp() {
            return actor("Ramp_4m", [wedge(3.2, 2, 5.5, "gameplay")], { category: "Ramps", collider: "mesh" });
        },
        stairs() {
            const steps = [];
            const count = 10;
            for (let i = 0; i < count; i += 1) {
                steps.push(box(3.2, 0.25, 0.5, 0, 0.125 + i * 0.25, -2.25 + i * 0.5, i % 2 ? "blockout" : "dark"));
            }
            steps.push(box(0.2, 2.5, 5, -1.6, 1.25, 0, "accent"));
            steps.push(box(0.2, 2.5, 5, 1.6, 1.25, 0, "accent"));
            return actor("Stairs_10_Step", steps, { category: "Stairs" });
        },
        platform() {
            return actor("Raised_Platform", [
                box(5, 0.45, 5, 0, 2.4, 0, "accent"),
                box(0.45, 2.2, 0.45, -2, 1.1, -2, "dark"),
                box(0.45, 2.2, 0.45, 2, 1.1, -2, "dark"),
                box(0.45, 2.2, 0.45, -2, 1.1, 2, "dark"),
                box(0.45, 2.2, 0.45, 2, 1.1, 2, "dark"),
                createRailing(5, 0.9, 0, 2.625, -2.45, "x", "dark"),
                createRailing(5, 0.9, 0, 2.625, 2.45, "x", "dark")
            ], { category: "Platforms" });
        },
        pillar() {
            return actor("Cylinder_Pillar", [
                cylinder(0.8, 4, 0, 2, 0, "blockout"),
                cylinder(0.95, 0.3, 0, 0.15, 0, "dark"),
                cylinder(0.95, 0.3, 0, 3.85, 0, "dark")
            ], { category: "Architecture", collider: "cylinder" });
        },
        balanceBeam() {
            return actor("Balance_Beam", [
                box(7, 0.2, 0.35, 0, 1.4, 0, "gameplay"),
                box(0.4, 1.3, 0.8, -3, 0.65, 0, "dark"),
                box(0.4, 1.3, 0.8, 3, 0.65, 0, "dark")
            ], { category: "Parkour" });
        },

        // --- Advanced Buildings & Complex Structures ---

        building3Story() {
            const parts = [];
            const w = 10, h = 3.6, d = 10;

            // Ground Floor
            parts.push(box(w, 0.3, d, 0, 0.15, 0, "dark")); // Base slab
            parts.push(box(0.6, h, 0.6, -w / 2 + 0.3, h / 2, -d / 2 + 0.3, "dark")); // Columns
            parts.push(box(0.6, h, 0.6, w / 2 - 0.3, h / 2, -d / 2 + 0.3, "dark"));
            parts.push(box(0.6, h, 0.6, -w / 2 + 0.3, h / 2, d / 2 - 0.3, "dark"));
            parts.push(box(0.6, h, 0.6, w / 2 - 0.3, h / 2, d / 2 - 0.3, "dark"));
            // Walls with door & window gaps
            parts.push(box(3.5, h, 0.3, -2.8, h / 2, -d / 2, "blockout"));
            parts.push(box(3.5, h, 0.3, 2.8, h / 2, -d / 2, "blockout"));
            parts.push(box(w, h, 0.3, 0, h / 2, d / 2, "blockout"));
            parts.push(box(0.3, h, d, -w / 2, h / 2, 0, "blockout"));
            parts.push(box(0.3, h, d, w / 2, h / 2, 0, "blockout"));

            // 1st Floor Slab + Balcony
            const f1Y = h;
            parts.push(box(w + 1.5, 0.4, d + 1.5, 0, f1Y + 0.2, 0.75, "accent"));

            // 2nd Floor Walls
            const f2Y = f1Y + 0.4;
            parts.push(box(w, h, 0.3, 0, f2Y + h / 2, -d / 2, "blockout"));
            parts.push(box(w, h, 0.3, 0, f2Y + h / 2, d / 2, "blockout"));
            parts.push(box(0.3, h, d, -w / 2, f2Y + h / 2, 0, "blockout"));
            parts.push(box(0.3, h, d, w / 2, f2Y + h / 2, 0, "blockout"));

            // Roof Level
            const roofY = f2Y + h;
            parts.push(box(w + 0.6, 0.4, d + 0.6, 0, roofY + 0.2, 0, "dark"));
            // Parapet Walls
            parts.push(box(w + 0.6, 0.8, 0.2, 0, roofY + 0.8, -d / 2 - 0.2, "gameplay"));
            parts.push(box(w + 0.6, 0.8, 0.2, 0, roofY + 0.8, d / 2 + 0.2, "gameplay"));
            parts.push(box(0.2, 0.8, d + 0.6, -w / 2 - 0.2, roofY + 0.8, 0, "gameplay"));
            parts.push(box(0.2, 0.8, d + 0.6, w / 2 + 0.2, roofY + 0.8, 0, "gameplay"));

            // Roof AC Unit
            parts.push(box(2, 1.2, 1.5, -2, roofY + 1.0, -1, "accent"));
            parts.push(cylinder(0.4, 0.2, -2, roofY + 1.7, -1, "dark"));

            // Exterior Access Ladder
            parts.push(createLadder(roofY, w / 2 + 0.2, 0, 0, Math.PI / 2, "accent"));

            return actor("Modular_3Story_Building", parts, { category: "Architecture", collider: "compound" });
        },

        watchtower() {
            const parts = [];
            const h = 8.0;
            // 4 Angled Leg Pillars
            parts.push(cylinder(0.2, h, -2, h / 2, -2, "dark"));
            parts.push(cylinder(0.2, h, 2, h / 2, -2, "dark"));
            parts.push(cylinder(0.2, h, -2, h / 2, 2, "dark"));
            parts.push(cylinder(0.2, h, 2, h / 2, 2, "dark"));

            // Cross Bracing Beams
            for (let b = 2; b < h; b += 2.5) {
                parts.push(box(4.2, 0.12, 0.12, 0, b, -2, "accent"));
                parts.push(box(4.2, 0.12, 0.12, 0, b, 2, "accent"));
                parts.push(box(0.12, 0.12, 4.2, -2, b, 0, "accent"));
                parts.push(box(0.12, 0.12, 4.2, 2, b, 0, "accent"));
            }

            // Top Cabin Platform
            parts.push(box(5, 0.4, 5, 0, h + 0.2, 0, "gameplay"));
            // Enclosed Guard Hut
            parts.push(box(3, 2.4, 3, 0, h + 1.6, 0, "blockout"));
            // Cabin Roof
            parts.push(box(3.8, 0.3, 3.8, 0, h + 2.95, 0, "dark"));
            // Spotlight Mount
            parts.push(cylinder(0.3, 0.8, 0, h + 3.5, 0, "accent"));

            // Perimeter Railings
            parts.push(createRailing(5, 0.9, 0, h + 0.4, -2.4, "x", "dark"));
            parts.push(createRailing(5, 0.9, 0, h + 0.4, 2.4, "x", "dark"));
            parts.push(createRailing(5, 0.9, -2.4, h + 0.4, 0, "z", "dark"));

            // Access Ladder
            parts.push(createLadder(h + 0.4, 2.2, 0, 0, 0, "accent"));

            return actor("Military_Watchtower", parts, { category: "Architecture" });
        },

        containerParkourStack() {
            const parts = [];
            // Base containers
            parts.push(createContainer(2.6, 2.6, 6.0, -2, 0, 0, 0, "gameplay"));
            parts.push(createContainer(2.6, 2.6, 6.0, 2, 0, 0, 0, "blockout"));
            // Stacked crossed container
            parts.push(createContainer(2.6, 2.6, 6.0, 0, 2.6, 0, Math.PI / 2, "accent"));
            // Top High Container
            parts.push(createContainer(2.6, 2.6, 6.0, -1, 5.2, -1, 0.3, "gameplay"));

            // Catwalk Connecting Bridge
            parts.push(box(2.0, 0.15, 4.0, 2.5, 2.65, 2.0, "dark"));
            parts.push(createRailing(4.0, 0.8, 3.4, 2.7, 2.0, "z", "accent"));

            // Parkour Access Ramps
            parts.push(wedge(2.0, 2.6, 4.5, "gameplay", -2, 0, 5.25, Math.PI));

            return actor("Container_Parkour_Complex", parts, { category: "Parkour" });
        },

        bunkerFortress() {
            const parts = [];
            // Slanted reinforced concrete bunker
            parts.push(box(12, 3.5, 8, 0, 1.75, 0, "dark"));
            // Blast door frame entrance
            parts.push(box(3.2, 2.4, 1.0, 0, 1.2, 4.2, "blockout"));
            parts.push(box(2.4, 2.0, 0.2, 0, 1.0, 4.1, "accent")); // Heavy steel door
            // Vision Slits / Sniper Apertures
            parts.push(box(2.0, 0.25, 1.2, -3.8, 2.2, 4.0, "gameplay"));
            parts.push(box(2.0, 0.25, 1.2, 3.8, 2.2, 4.0, "gameplay"));
            // Roof Comm Radar Dish
            parts.push(cylinder(0.15, 2.2, 3.5, 4.6, -2.0, "accent"));
            parts.push(cylinder(1.2, 0.15, 3.5, 5.6, -2.0, "blockout", 16, Math.PI / 4));

            return actor("Concrete_Bunker", parts, { category: "Architecture" });
        },

        industrialBridge() {
            const parts = [];
            const len = 12.0;
            const w = 3.6;

            // Main Deck
            parts.push(box(w, 0.4, len, 0, 3.0, 0, "blockout"));
            // Support Pillars
            parts.push(cylinder(0.6, 3.0, -w / 2 + 0.4, 1.5, -len / 2 + 0.6, "dark"));
            parts.push(cylinder(0.6, 3.0, w / 2 - 0.4, 1.5, -len / 2 + 0.6, "dark"));
            parts.push(cylinder(0.6, 3.0, -w / 2 + 0.4, 1.5, len / 2 - 0.6, "dark"));
            parts.push(cylinder(0.6, 3.0, w / 2 - 0.4, 1.5, len / 2 - 0.6, "dark"));

            // Steel Side Trusses
            parts.push(box(0.15, 1.6, len, -w / 2, 3.8, 0, "accent"));
            parts.push(box(0.15, 1.6, len, w / 2, 3.8, 0, "accent"));

            // Overhead Cross Beams
            for (let z = -len / 2 + 1; z <= len / 2; z += 3.0) {
                parts.push(box(w, 0.2, 0.2, 0, 4.6, z, "dark"));
            }

            return actor("Industrial_Bridge", parts, { category: "Architecture" });
        },

        pipeComplex() {
            const parts = [];
            // Large main pipes
            parts.push(pipeRing(1.0, 0.85, 8.0, 0, 1.0, 0, "dark"));
            parts.push(cylinder(0.85, 8.0, 0, 1.0, 0, "accent", 32, 0, 0, Math.PI / 2));
            // Vertical Junction Valves
            parts.push(pipeRing(0.6, 0.5, 4.0, -2.0, 2.0, 0, "gameplay"));
            parts.push(pipeRing(0.6, 0.5, 4.0, 2.0, 2.0, 0, "gameplay"));
            // Support Frame
            parts.push(box(6.0, 0.2, 1.2, 0, 0.1, 0, "dark"));
            parts.push(box(0.3, 2.5, 0.3, -2.8, 1.25, 0, "dark"));
            parts.push(box(0.3, 2.5, 0.3, 2.8, 1.25, 0, "dark"));

            // Maintenance Catwalk
            parts.push(box(6.0, 0.15, 1.8, 0, 2.2, 1.8, "blockout"));
            parts.push(createRailing(6.0, 0.9, 0, 2.275, 2.65, "x", "accent"));

            return actor("Pipe_Refinery_Hub", parts, { category: "Industrial" });
        },

        rotatingLaserTrap() {
            const parts = [];
            // Central Heavy Turret Base
            parts.push(cylinder(1.5, 0.6, 0, 0.3, 0, "dark"));
            parts.push(cylinder(0.8, 1.8, 0, 1.2, 0, "blockout"));
            parts.push(cylinder(1.0, 0.4, 0, 2.1, 0, "accent"));

            // 4 Hazard Arms
            const armLen = 4.5;
            parts.push(box(armLen * 2, 0.25, 0.25, 0, 1.6, 0, "gameplay"));
            parts.push(box(0.25, 0.25, armLen * 2, 0, 1.6, 0, "gameplay"));

            // Laser Emitters at Tips
            parts.push(cylinder(0.25, 0.6, -armLen, 1.6, 0, "dark"));
            parts.push(cylinder(0.25, 0.6, armLen, 1.6, 0, "dark"));
            parts.push(cylinder(0.25, 0.6, 0, 1.6, -armLen, "dark"));
            parts.push(cylinder(0.25, 0.6, 0, 1.6, armLen, "dark"));

            return actor("Rotating_Laser_Trap", parts, { category: "Traps", motion: "kinematic" });
        },

        scaffoldTower() {
            const parts = [];
            const h = 7.0;
            const size = 3.0;

            // 4 Corner Poles
            parts.push(cylinder(0.08, h, -size / 2, h / 2, -size / 2, "accent"));
            parts.push(cylinder(0.08, h, size / 2, h / 2, -size / 2, "accent"));
            parts.push(cylinder(0.08, h, -size / 2, h / 2, size / 2, "accent"));
            parts.push(cylinder(0.08, h, size / 2, h / 2, size / 2, "accent"));

            // Scaffold Wooden Wooden Decks
            parts.push(box(size + 0.4, 0.12, size + 0.4, 0, 2.3, 0, "gameplay"));
            parts.push(box(size + 0.4, 0.12, size + 0.4, 0, 4.6, 0, "gameplay"));
            parts.push(box(size + 0.4, 0.12, size + 0.4, 0, 6.9, 0, "gameplay"));

            // Cross Bracing
            for (let level = 0; level < 3; level++) {
                const yPos = 1.15 + level * 2.3;
                parts.push(box(size, 0.05, 0.05, 0, yPos, -size / 2, "dark", 0, 0, 0.6));
                parts.push(box(size, 0.05, 0.05, 0, yPos, size / 2, "dark", 0, 0, -0.6));
            }

            // Ladders
            parts.push(createLadder(2.3, size / 2 - 0.2, 0, 0, 0, "dark"));
            parts.push(createLadder(2.3, -size / 2 + 0.2, 2.3, 0, Math.PI, "dark"));

            return actor("Scaffold_Parkour_Tower", parts, { category: "Parkour" });
        },

        helipadBuilding() {
            const parts = [];
            // Lower Command Center
            parts.push(box(12, 4, 12, 0, 2, 0, "blockout"));
            // Doorway
            parts.push(box(2.2, 2.8, 0.4, 0, 1.4, 6.1, "dark"));

            // Octagonal Elevated Helipad Deck
            parts.push(box(14, 0.5, 14, 0, 4.25, 0, "dark"));
            // Helipad 'H' Marking
            parts.push(box(0.6, 0.02, 3.6, -1.2, 4.51, 0, "gameplay"));
            parts.push(box(0.6, 0.02, 3.6, 1.2, 4.51, 0, "gameplay"));
            parts.push(box(3.0, 0.02, 0.6, 0, 4.51, 0, "gameplay"));
            // Yellow Safety Perimeter Line
            parts.push(box(12, 0.02, 0.3, 0, 4.51, -5.8, "gameplay"));
            parts.push(box(12, 0.02, 0.3, 0, 4.51, 5.8, "gameplay"));

            // Perimeter Floodlights
            parts.push(cylinder(0.1, 1.2, -6.2, 5.1, -6.2, "accent"));
            parts.push(cylinder(0.1, 1.2, 6.2, 5.1, -6.2, "accent"));
            parts.push(cylinder(0.1, 1.2, -6.2, 5.1, 6.2, "accent"));
            parts.push(cylinder(0.1, 1.2, 6.2, 5.1, 6.2, "accent"));

            return actor("Helipad_Building", parts, { category: "Architecture" });
        },

        archway() {
            return actor("Archway", [
                box(0.6, 3.4, 0.8, -2, 1.7, 0, "blockout"),
                box(0.6, 3.4, 0.8, 2, 1.7, 0, "blockout"),
                box(4.6, 0.6, 0.8, 0, 3.1, 0, "accent")
            ], { category: "Architecture" });
        },

        tunnelPipe() {
            const pipe = cylinder(1.25, 5, 0, 1.25, 0, "dark", 40);
            pipe.rotation.z = Math.PI / 2;
            return actor("Pipe_Obstacle", [pipe], { category: "Industrial", collider: "cylinder" });
        },

        slalomGate() {
            return actor("Slalom_Gate", [
                cylinder(0.1, 2.6, -1.25, 1.3, 0, "gameplay", 16),
                cylinder(0.1, 2.6, 1.25, 1.3, 0, "gameplay", 16),
                box(2.7, 0.16, 0.16, 0, 2.52, 0, "accent")
            ], { category: "Parkour" });
        },

        movingPlatform() {
            return actor("Moving_Platform", [
                box(3.8, 0.35, 2.2, 0, 0.6, 0, "accent"),
                box(2.8, 0.18, 1.6, 0, 0.86, 0, "gameplay")
            ], { category: "Platforms", motion: "kinematic", collider: "box" });
        },

        lCover() {
            return actor("L_Cover", [
                box(4.2, 2.2, 0.35, 0, 1.1, 0, "blockout"),
                box(0.35, 2.2, 2.8, -1.925, 1.1, 1.225, "blockout")
            ], { category: "Cover" });
        }
    };

    // =========================================================================
    // ASSET DEFINITIONS REGISTRY
    // =========================================================================

    const definitions = [
        // --- Primitives & Cover ---
        ["sme_obstacle_block", "Block 2m", "block", ["blockout", "cube", "jump"]],
        ["sme_obstacle_wall", "Blockout Wall", "wall", ["wall", "cover", "architecture"]],
        ["sme_obstacle_low_cover", "Low Cover", "lowCover", ["cover", "combat", "low"]],
        ["sme_obstacle_barrier", "Gameplay Barrier", "barrier", ["barrier", "vault", "parkour"]],
        ["sme_obstacle_lcover", "L Cover", "lCover", ["cover", "corner", "combat"]],

        // --- Ramps, Stairs & Platforms ---
        ["sme_obstacle_ramp", "Ramp 4m", "ramp", ["ramp", "slope", "parkour"]],
        ["sme_obstacle_stairs", "Stairs 10 Step", "stairs", ["stairs", "steps", "architecture"]],
        ["sme_obstacle_platform", "Raised Platform", "platform", ["platform", "elevated", "jump"]],
        ["sme_obstacle_moving", "Moving Platform", "movingPlatform", ["platform", "kinematic", "moving"]],

        // --- Advanced Buildings & Complex Architectural Assets ---
        ["sme_building_3story", "Modular 3-Story Building", "building3Story", ["building", "architecture", "modular", "house"]],
        ["sme_building_watchtower", "Military Watchtower", "watchtower", ["tower", "military", "outpost", "architecture"]],
        ["sme_building_bunker", "Concrete Bunker", "bunkerFortress", ["bunker", "military", "fortress", "concrete"]],
        ["sme_building_helipad", "Helipad Deck Building", "helipadBuilding", ["helipad", "roof", "building", "airport"]],

        // --- Industrial & Parkour Assets ---
        ["sme_obstacle_containers", "Container Parkour Complex", "containerParkourStack", ["container", "shipping", "stack", "parkour"]],
        ["sme_obstacle_bridge", "Industrial Truss Bridge", "industrialBridge", ["bridge", "truss", "crossing", "architecture"]],
        ["sme_obstacle_pipe_hub", "Pipe Refinery Hub", "pipeComplex", ["pipe", "industrial", "refinery", "catwalk"]],
        ["sme_obstacle_scaffold", "Scaffold Parkour Tower", "scaffoldTower", ["scaffold", "construction", "tower", "climb"]],
        ["sme_obstacle_laser_trap", "Rotating Laser Trap", "rotatingLaserTrap", ["trap", "hazard", "laser", "kinematic"]],

        // --- Pillars, Arches & Pipes ---
        ["sme_obstacle_pillar", "Cylinder Pillar", "pillar", ["pillar", "column", "vertical"]],
        ["sme_obstacle_balance", "Balance Beam", "balanceBeam", ["beam", "balance", "parkour"]],
        ["sme_obstacle_arch", "Archway", "archway", ["arch", "doorway", "architecture"]],
        ["sme_obstacle_pipe", "Pipe Obstacle", "tunnelPipe", ["pipe", "cylinder", "industrial"]],
        ["sme_obstacle_gate", "Slalom Gate", "slalomGate", ["gate", "slalom", "checkpoint"]]
    ].map(([id, name, builder, tags]) => ({
        id,
        name,
        builder,
        tags: ["gameplay", "obstacle", "ue5", "building", ...tags]
    }));

    // =========================================================================
    // GLOBAL LIBRARY EXPORT
    // =========================================================================

    window.SMGameObstacleLibrary = {
        version: 3,
        folderName: "Advanced Obstacles & Buildings",
        assets: definitions,
        create(id) {
            const definition = definitions.find((entry) => entry.id === id);
            const build = definition && builders[definition.builder];
            if (!build) {
                console.warn(`[SMGameObstacleLibrary] Asset ID not found: "${id}"`);
                return null;
            }
            const result = build();
            result.userData.sourceAssetId = id;
            result.userData.assetLibrary = "SMGameObstacleLibrary";
            return result;
        }
    };

    console.log("%c[SM Engine]%c Loaded SMGameObstacleLibrary v3 (19 Advanced Obstacles & Buildings)", "color: #00c6ff; font-weight: bold;", "color: #fff;");
})();
