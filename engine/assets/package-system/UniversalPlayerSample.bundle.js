(function(window, document, THREE, SMAssetPackages, SMAssetPackageLoader){
"use strict";

window.engineFrameCallbacks = Array.isArray(window.engineFrameCallbacks)
    ? window.engineFrameCallbacks
    : [];

/* ===== SMGameplaySampleCourse.js ===== */

/**
 * SMGameplaySampleCourse.js
 *
 * Authored Obstacle Course & Environment for SM Engine.
 * Improved version:
 *  - Cleaner UE5-like gameplay sample floor grid
 *  - Reduced moire / over-dense floor patterning
 *  - Bigger and cleaner center logo in the spawn arena
 *  - Softer, more neutral blockout materials
 */
class SMGameplaySampleCourse {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'SMGameplaySampleEnvironment';
        this.root.userData = {
            isSystemObject: true,
            isGameplaySample: true,
            workspaceOnly: 'GAMEPLAY_SAMPLE',
            ignoreInTimeline: true,
            ignoreInHierarchy: true
        };

        this.obstaclesGroup = new THREE.Group();
        this.obstaclesGroup.name = 'SMGameplaySampleObstacles';
        this.obstaclesGroup.userData = {
            isSystemObject: true,
            isGameplaySample: true,
            workspaceOnly: 'GAMEPLAY_SAMPLE',
            ignoreInTimeline: true,
            ignoreInHierarchy: true
        };

        this.floor = null;
        this.collidableMeshes = [];
        this.traversalMeshes = [];
        this._materials = new Map();
        this._textures = [];
        this._built = false;

        this.floorSize = 1000;
        // Bigger tile size = less repetition on a huge plane.
        this.gridWorldSize = 20;
    }

    _tagObject(object, extra = {}) {
        if (!object) return object;
        object.userData = {
            ...(object.userData || {}),
            isSystemObject: true,
            isGameplaySample: true,
            workspaceOnly: 'GAMEPLAY_SAMPLE',
            ignoreInTimeline: true,
            ignoreInHierarchy: true,
            ...extra
        };
        return object;
    }

    _getMaxAnisotropy() {
        return Math.min(
            window.renderer?.capabilities?.getMaxAnisotropy?.() || 8,
            16
        );
    }

    _registerTexture(texture, name = '') {
        if (!texture) return texture;
        if (name) texture.name = name;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = this._getMaxAnisotropy();
        texture.needsUpdate = true;
        this._textures.push(texture);
        return texture;
    }

    // =========================================================================
    // 1. CLEANER UE5-LIKE GAMEPLAY SAMPLE FLOOR GRID TEXTURE
    // =========================================================================

    createUE5FloorGridTexture() {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { alpha: false });

        // Neutral UE-style floor gray
        ctx.fillStyle = '#3f4043';
        ctx.fillRect(0, 0, size, size);

        const gradient = ctx.createLinearGradient(0, 0, size, size);
        gradient.addColorStop(0, 'rgba(255,255,255,0.015)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.035)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const divisions = 20;
        const step = size / divisions;

        // Fine 1m grid
        ctx.strokeStyle = 'rgba(255,255,255,0.045)';
        ctx.lineWidth = 1.0;
        for (let i = 1; i < divisions; i++) {
            if (i % 5 === 0) continue;
            const p = Math.round(i * step) + 0.5;
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, size);
            ctx.moveTo(0, p);
            ctx.lineTo(size, p);
            ctx.stroke();
        }

        // 5m grid
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1.6;
        for (let i = 5; i < divisions; i += 5) {
            if (i % 10 === 0) continue;
            const p = Math.round(i * step) + 0.5;
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, size);
            ctx.moveTo(0, p);
            ctx.lineTo(size, p);
            ctx.stroke();
        }

        // 10m major grid
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 2.1;
        for (let i = 10; i < divisions; i += 10) {
            const p = Math.round(i * step) + 0.5;
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, size);
            ctx.moveTo(0, p);
            ctx.lineTo(size, p);
            ctx.stroke();
        }

        // Outer border
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 2.0;
        ctx.strokeRect(1, 1, size - 2, size - 2);

        // Helper: draw plus marker
        const drawPlus = (cx, cy, radius, color, lineWidth) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(Math.max(0, cx - radius), cy);
            ctx.lineTo(Math.min(size, cx + radius), cy);
            ctx.moveTo(cx, Math.max(0, cy - radius));
            ctx.lineTo(cx, Math.min(size, cy + radius));
            ctx.stroke();
        };

        // ------------------------------------------------------------------
        // Small + markers on every 5m node
        // ------------------------------------------------------------------
        for (let gy = 0; gy <= divisions; gy += 5) {
            for (let gx = 0; gx <= divisions; gx += 5) {
                // Skip 10m nodes here because they will get bigger markers below
                if (gx % 10 === 0 && gy % 10 === 0) continue;

                const cx = Math.round(gx * step);
                const cy = Math.round(gy * step);

                drawPlus(
                    cx,
                    cy,
                    8,
                    'rgba(255,255,255,0.18)',
                    1.4
                );
            }
        }

        // ------------------------------------------------------------------
        // Bigger + markers on every 10m node
        // ------------------------------------------------------------------
        for (let gy = 0; gy <= divisions; gy += 10) {
            for (let gx = 0; gx <= divisions; gx += 10) {
                const cx = Math.round(gx * step);
                const cy = Math.round(gy * step);

                drawPlus(
                    cx,
                    cy,
                    15,
                    'rgba(255,255,255,0.26)',
                    2.0
                );
            }
        }

        // Optional: make the exact center slightly stronger
        const center = Math.round(size * 0.5);
        drawPlus(
            center,
            center,
            22,
            'rgba(255,255,255,0.34)',
            2.6
        );

        return this._registerTexture(
            new THREE.CanvasTexture(canvas),
            'UE5_GameAnimation_FloorTexture'
        );
    }

    createPrototypeGridTexture(type = 'orange') {
        const size = 512;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d', {
            alpha: false
        });

        const isOrange = type === 'orange';

        // =========================================================
        // BASE COLOR
        // =========================================================

        const baseColor = isOrange
            ? '#a85a36'
            : '#535860';

        ctx.fillStyle = baseColor;
        ctx.fillRect(
            0,
            0,
            size,
            size
        );

        // Very subtle UE-style surface gradient
        const gradient =
            ctx.createLinearGradient(
                0,
                0,
                0,
                size
            );

        gradient.addColorStop(
            0,
            'rgba(255,255,255,0.035)'
        );

        gradient.addColorStop(
            0.5,
            'rgba(255,255,255,0.0)'
        );

        gradient.addColorStop(
            1,
            'rgba(0,0,0,0.055)'
        );

        ctx.fillStyle = gradient;

        ctx.fillRect(
            0,
            0,
            size,
            size
        );

        // =========================================================
        // GRID
        // =========================================================

        // 10 divisions = 1m style panel grid
        const divisions = 10;
        const step = size / divisions;

        // -----------------------------------------
        // Fine grid
        // -----------------------------------------

        ctx.strokeStyle = isOrange
            ? 'rgba(255, 255, 254, 0.07)'
            : 'rgba(255,255,255,0.065)';

        ctx.lineWidth = 1.0;

        for (
            let i = 1;
            i < divisions;
            i++
        ) {
            if (i % 5 === 0) continue;

            const p =
                Math.round(i * step) + 0.5;

            ctx.beginPath();

            ctx.moveTo(p, 0);
            ctx.lineTo(p, size);

            ctx.moveTo(0, p);
            ctx.lineTo(size, p);

            ctx.stroke();
        }

        // -----------------------------------------
        // Middle 5-unit lines
        // -----------------------------------------

        ctx.strokeStyle = isOrange
            ? 'rgba(255, 255, 255, 0.22)'
            : 'rgba(255, 255, 255, 0.24)';

        ctx.lineWidth = 1.8;

        const middle =
            Math.round(size * 0.5) + 0.5;

        ctx.beginPath();

        ctx.moveTo(
            middle,
            0
        );

        ctx.lineTo(
            middle,
            size
        );

        ctx.moveTo(
            0,
            middle
        );

        ctx.lineTo(
            size,
            middle
        );

        ctx.stroke();

        // =========================================================
        // PANEL BORDER
        // =========================================================

        ctx.strokeStyle = isOrange
            ? 'rgba(253, 253, 253, 0.36)'
            : 'rgba(18,21,27,0.38)';

        ctx.lineWidth = 3;

        ctx.strokeRect(
            1.5,
            1.5,
            size - 3,
            size - 3
        );

        // =========================================================
        // PLUS MARKERS
        // =========================================================

        const drawPlus = (
            cx,
            cy,
            radius,
            color,
            lineWidth
        ) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;

            ctx.beginPath();

            ctx.moveTo(
                Math.max(
                    0,
                    cx - radius
                ),
                cy
            );

            ctx.lineTo(
                Math.min(
                    size,
                    cx + radius
                ),
                cy
            );

            ctx.moveTo(
                cx,
                Math.max(
                    0,
                    cy - radius
                )
            );

            ctx.lineTo(
                cx,
                Math.min(
                    size,
                    cy + radius
                )
            );

            ctx.stroke();
        };

        // -----------------------------------------
        // Small + markers on intersections
        // -----------------------------------------

        for (
            let gy = 0;
            gy <= divisions;
            gy += 5
        ) {
            for (
                let gx = 0;
                gx <= divisions;
                gx += 5
            ) {
                const cx =
                    Math.round(
                        gx * step
                    );

                const cy =
                    Math.round(
                        gy * step
                    );

                drawPlus(
                    cx,
                    cy,
                    11,

                    isOrange
                        ? 'rgba(255,224,205,0.24)'
                        : 'rgba(255,255,255,0.20)',

                    2
                );
            }
        }

        // -----------------------------------------
        // Strong center +
        // -----------------------------------------

        drawPlus(
            size * 0.5,
            size * 0.5,
            20,

            isOrange
                ? 'rgba(255, 255, 255, 0.4)'
                : 'rgba(255,255,255,0.32)',

            3.5
        );

        // =========================================================
        // SUBTLE CENTER DOT
        // =========================================================

        ctx.fillStyle = isOrange
            ? 'rgba(255,238,225,0.42)'
            : 'rgba(255,255,255,0.36)';

        ctx.beginPath();

        ctx.arc(
            size * 0.5,
            size * 0.5,
            3,
            0,
            Math.PI * 2
        );

        ctx.fill();

        // =========================================================
        // TEXTURE
        // =========================================================

        const texture =
            new THREE.CanvasTexture(
                canvas
            );

        texture.name = isOrange
            ? 'UE5_Prototype_OrangeGrid'
            : 'UE5_Prototype_GrayGrid';

        texture.wrapS =
            THREE.RepeatWrapping;

        texture.wrapT =
            THREE.RepeatWrapping;

        texture.colorSpace =
            THREE.SRGBColorSpace;

        texture.minFilter =
            THREE.LinearMipmapLinearFilter;

        texture.magFilter =
            THREE.LinearFilter;

        texture.generateMipmaps =
            true;

        texture.anisotropy =
            Math.min(
                window.renderer
                    ?.capabilities
                    ?.getMaxAnisotropy?.() ||
                8,

                16
            );

        texture.needsUpdate = true;

        this._textures.push(
            texture
        );

        return texture;
    }

    // =========================================================================
    // 2. MATTE PBR MATERIALS
    // =========================================================================

    _createSurfaceMaterial(type = 'gray') {
        const key = `surface_${type}`;
        if (this._materials.has(key)) return this._materials.get(key);

        const palette = {
            gray: { color: '#a9b0b8', roughness: 0.93, env: 0.03 },
            grayDark: { color: '#6e757f', roughness: 0.95, env: 0.02 },
            orange: { color: '#b7bcc4', roughness: 0.93, env: 0.03 }, // ولات gray
            benchWood: { color: '#7f8791', roughness: 0.90, env: 0.03 },
            benchMetal: { color: '#3b424b', roughness: 0.86, env: 0.02 }
        }[type] || { color: '#a9b0b8', roughness: 0.93, env: 0.03 };

        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(palette.color),
            roughness: palette.roughness,
            metalness: 0.0,
            side: THREE.DoubleSide,
            shadowSide: THREE.FrontSide,
            envMapIntensity: palette.env,
            dithering: true
        });

        this._materials.set(key, material);
        return material;
    }

    _createGridMaterial(type = 'orange') {
        const key = `grid_${type}`;
        if (this._materials.has(key)) return this._materials.get(key);

        const map = this.createPrototypeGridTexture(type);

        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#d7dbe0'),
            map,
            roughness: 0.94,
            metalness: 0.0,
            side: THREE.DoubleSide,
            shadowSide: THREE.FrontSide,
            envMapIntensity: 0.02,
            dithering: true
        });

        this._materials.set(key, material);
        return material;
    }

    _boxGeometry(width, height, depth, unit = 1) {
        const geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
        const uv = geometry.attributes.uv;
        const faceScales = [
            [depth / unit, height / unit],
            [depth / unit, height / unit],
            [width / unit, depth / unit],
            [width / unit, depth / unit],
            [width / unit, height / unit],
            [width / unit, height / unit]
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
    }

    _inferTraversalType(name, height, depth) {
        const key = String(name || '').toLowerCase();
        // Steps and landing platforms are normal walkable geometry. Everything
        // else in character scale is classified at runtime from its world-space
        // top height (vault / climb / wall climb).
        if (/step|floor|landing|support|jumpplatform|ramp/.test(key)) return null;
        if (height < 0.32 || height > 3.2 || depth > 7.5) return null;
        return 'AUTO';
    }

    _makeBox({
        name = 'SMGameplayBox',
        type = 'orange',
        size = [1, 1, 1],
        position = [0, 0, 0],
        rotation = [0, 0, 0],
        grid = true,
        collidable = true,
        traversalType = null,
        traversalLandingOffset = 0.55
    } = {}) {
        const [width, height, depth] = size;
        const geometry = this._boxGeometry(width, height, depth, 1);
        const material = grid
            ? this._createGridMaterial(type === 'gray' ? 'gray' : 'orange')
            : this._createSurfaceMaterial(type);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(...position);
        mesh.rotation.set(...rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const resolvedTraversalType =
            traversalType || this._inferTraversalType(name, height, depth);

        this._tagObject(mesh, {
            static: true,
            physicsShape: 'box',
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            horizontalBlocking: true,
            physicsSize: [width, height, depth],
            friction: 0.80,
            restitution: 0.025,
            traversalType: resolvedTraversalType || null,
            traversalLandingOffset: Number(traversalLandingOffset) || 0.55,
            noTraversal: !resolvedTraversalType
        });

        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
        mesh.updateMatrixWorld(true);
        mesh.userData.collider = new THREE.Box3().setFromObject(mesh);

        this.obstaclesGroup.add(mesh);
        if (collidable) this.collidableMeshes.push(mesh);
        if (resolvedTraversalType) this.traversalMeshes.push(mesh);
        window.SMPlayerCollisionRegistry?.registerObject?.(mesh, {
            collisionLayer: 'world-static',
            bodyType: 'static',
            physicsShape: 'box',
            traversalType: resolvedTraversalType || false
        });
        return mesh;
    }

    // =========================================================================
    // 3. PARK BENCH BUILDER
    // =========================================================================

    _buildParkBench(position = [0, 0, 0], rotationY = 0) {
        const group = new THREE.Group();
        group.name = 'SMGameplayParkBench';
        group.position.set(...position);
        group.rotation.y = rotationY;

        const slatMat = this._createSurfaceMaterial('benchWood');
        const metalMat = this._createSurfaceMaterial('benchMetal');

        const benchWidth = 2.4;
        const seatHeight = 0.50;
        const seatDepth = 0.45;

        for (let i = 0; i < 3; i++) {
            const slat = new THREE.Mesh(new THREE.BoxGeometry(benchWidth, 0.04, 0.12), slatMat);
            slat.position.set(0, seatHeight, -seatDepth * 0.3 + i * 0.14);
            slat.castShadow = true;
            slat.receiveShadow = true;
            group.add(slat);
        }

        for (let i = 0; i < 2; i++) {
            const backSlat = new THREE.Mesh(new THREE.BoxGeometry(benchWidth, 0.12, 0.04), slatMat);
            backSlat.position.set(0, seatHeight + 0.25 + i * 0.16, -seatDepth * 0.5 - 0.02);
            backSlat.castShadow = true;
            backSlat.receiveShadow = true;
            group.add(backSlat);
        }

        [-benchWidth * 0.42, benchWidth * 0.42].forEach(lx => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, seatHeight, seatDepth * 1.1), metalMat);
            leg.position.set(lx, seatHeight * 0.5, 0);
            leg.castShadow = true;
            leg.receiveShadow = true;
            group.add(leg);

            const backPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.50, 0.08), metalMat);
            backPost.position.set(lx, seatHeight + 0.25, -seatDepth * 0.5 - 0.02);
            backPost.castShadow = true;
            backPost.receiveShadow = true;
            group.add(backPost);
        });

        this._tagObject(group, {
            static: true,
            physicsShape: 'box',
            physicsSize: [benchWidth, 0.9, 0.6],
            friction: 0.8,
            restitution: 0.02,

            // Universal Player Sample contextual interaction metadata.
            interactionType: 'seat',
            interactionAnimationSet: 'UAL1',
            seatAnchorName: 'SMSeatAnchor',
            exitAnchorName: 'SMSeatExitAnchor',
            seatFacingOffset: Math.PI
        });

        // Root anchors used by Sitting_Enter / Sitting_Idle_Loop / Sitting_Exit.
        const seatAnchor = new THREE.Object3D();
        seatAnchor.name = 'SMSeatAnchor';
        seatAnchor.position.set(0, 0, 0.06);
        group.add(seatAnchor);

        const exitAnchor = new THREE.Object3D();
        exitAnchor.name = 'SMSeatExitAnchor';
        exitAnchor.position.set(0, 0, 0.95);
        group.add(exitAnchor);

        // Invisible collision proxy so the sample player cannot simply walk
        // through the bench while still allowing the visible slats to stay cheap.
        const collider = new THREE.Mesh(
            new THREE.BoxGeometry(benchWidth, 0.9, 0.62),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        collider.name = 'SMGameplayParkBenchCollider';
        collider.position.set(0, 0.45, 0);
        this._tagObject(collider, {
            static: true,
            physicsShape: 'box',
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            horizontalBlocking: true,
            physicsSize: [benchWidth, 0.9, 0.62],
            noTraversal: true,
            interactionType: 'seat'
        });
        group.add(collider);
        this.collidableMeshes.push(collider);
        window.SMPlayerCollisionRegistry?.registerObject?.(collider, {
            collisionLayer: 'world-static',
            bodyType: 'static',
            physicsShape: 'box',
            traversalType: false
        });

        group.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        this.obstaclesGroup.add(group);
        return group;
    }

    // =========================================================================
    // 4. CENTER ARENA WITH BIGGER USER LOGO
    // =========================================================================

    _createGameAnimationSampleDecal(radius = 14) {
        const group = new THREE.Group();
        group.name = 'SMGameplaySpawnArena';

        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 2048;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const center = canvas.width * 0.5;

        // Outer ring.
        ctx.strokeStyle = 'rgba(222, 228, 236, 0.42)';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(center, center, 740, 0, Math.PI * 2);
        ctx.stroke();

        // Inner ring.
        ctx.strokeStyle = 'rgba(222, 228, 236, 0.22)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(center, center, 560, 0, Math.PI * 2);
        ctx.stroke();

        // Soft center backing disk for logo readability.
        const bgGrad = ctx.createRadialGradient(center, center, 60, center, center, 410);
        bgGrad.addColorStop(0, 'rgba(255,255,255,0.095)');
        bgGrad.addColorStop(0.55, 'rgba(255,255,255,0.045)');
        bgGrad.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = bgGrad;
        ctx.beginPath();
        ctx.arc(center, center - 20, 410, 0, Math.PI * 2);
        ctx.fill();

        // Crosshair lines.
        ctx.strokeStyle = 'rgba(222, 228, 236, 0.18)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(center - 710, center); ctx.lineTo(center + 710, center);
        ctx.moveTo(center, center - 710); ctx.lineTo(center, center + 710);
        ctx.stroke();

        const userLogoSvg = `<svg width="512" height="512" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="logoMainFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#2c3e50" />
                <stop offset="100%" stop-color="#1c2833" />
            </linearGradient>
            <linearGradient id="logoOuterStroke" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#4e5b6b" />
                <stop offset="100%" stop-color="#7e8c9d" />
            </linearGradient>
            <linearGradient id="logoInnerHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#66b3ff" />
                <stop offset="100%" stop-color="#89cff0" />
            </linearGradient>
          </defs>
          <filter id="logoDropShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="3" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.25" />
          </filter>
          <g filter="url(#logoDropShadow)">
            <path fill="url(#logoMainFill)" stroke="url(#logoOuterStroke)" stroke-width="6" stroke-linejoin="round" d="M30 170 L30 45 L60 30 L100 30 L130 30 L170 30 L170 155 L155 170 L100 170 L85 155 L85 100 L115 85 L115 45 L100 30 M85 100 L115 85" />
            <path fill="none" stroke="url(#logoInnerHighlight)" stroke-width="4" stroke-linejoin="round" opacity="0.85" d="M36 164 L36 48 L63 36 L100 36 L126 36 L164 36 L164 152 L152 164 L100 164 L91 152 L91 103 L112 91 L112 48" />
          </g>
        </svg>`;

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        this._textures.push(texture);

        const svgBlob = new Blob([userLogoSvg], { type: 'image/svg+xml;charset=utf-8' });
        const URLObj = window.URL || window.webkitURL || window;
        const blobURL = URLObj.createObjectURL(svgBlob);
        const logoImg = new Image();

        logoImg.onload = () => {
            // Bigger, cleaner logo.
            const logoSize = 820;
            ctx.drawImage(logoImg, center - logoSize * 0.5, center - logoSize * 0.60, logoSize, logoSize);

            ctx.fillStyle = 'rgba(222, 228, 236, 0.60)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.font = '900 96px "Arial Black", Impact, sans-serif';
            ctx.fillText('GAME ANIMATION', center, center + 570);

            ctx.font = '900 146px "Arial Black", Impact, sans-serif';
            ctx.fillText('SAMPLE', center, center + 710);

            texture.needsUpdate = true;
            URLObj.revokeObjectURL(blobURL);
        };
        logoImg.src = blobURL;

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const decalMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2, radius * 2),
            material
        );
        decalMesh.rotation.x = -Math.PI / 2;
        decalMesh.position.y = 0.025;
        this._tagObject(decalMesh, {
            isGameplayDecoration: true,
            noCastShadow: true,
            noReceiveShadow: true
        });

        group.add(decalMesh);

        const benchRadius = radius * 0.72;
        const benchAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
        benchAngles.forEach(angle => {
            const bx = Math.sin(angle) * benchRadius;
            const bz = Math.cos(angle) * benchRadius;
            this._buildParkBench([bx, 0, bz], angle + Math.PI);
        });

        this.root.add(group);
        return group;
    }

    _createTextPlane(text, {
        width = 10,
        height = 2.5,
        color = '#ffffff',
        fontSize = 76,
        background = null
    } = {}) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.font = `800 ${fontSize}px Segoe UI, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.5);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        this._textures.push(texture);

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
        this._tagObject(mesh, {
            isGameplayDecoration: true,
            noCastShadow: true,
            noReceiveShadow: true
        });
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return mesh;
    }

    _createWorldLabel(text, position, width = 3.2, height = 1) {
        const label = this._createTextPlane(text, {
            width,
            height,
            color: '#ffffff',
            fontSize: 78
        });
        label.position.set(...position);
        this.root.add(label);
        return label;
    }

    _createCurvedRamp({
        name = 'SMGameplayCurvedRamp',
        width = 7,
        length = 18,
        height = 7,
        thickness = 0.55,
        position = [20, 0.05, -2]
    } = {}) {
        const segments = 36;
        const vertices = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const z = -length * 0.5 + t * length;
            const eased = t * t;
            const y = height * eased;
            const slope = (2 * height * t) / length;
            const normal = new THREE.Vector2(-slope, 1).normalize();
            const bottomY = y - thickness * normal.y;
            const bottomZ = z - thickness * normal.x;

            vertices.push(
                -width * 0.5, y, z,
                width * 0.5, y, z,
                -width * 0.5, bottomY, bottomZ,
                width * 0.5, bottomY, bottomZ
            );
            uvs.push(0, t * 4, 1, t * 4, 0, t * 4, 1, t * 4);
        }

        for (let i = 0; i < segments; i++) {
            const a = i * 4;
            const b = (i + 1) * 4;
            indices.push(a, b, b + 1, a, b + 1, a + 1);
            indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
            indices.push(a, a + 2, b + 2, a, b + 2, b);
            indices.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
        }

        const first = 0;
        const last = segments * 4;
        indices.push(first, first + 1, first + 3, first, first + 3, first + 2);
        indices.push(last, last + 2, last + 3, last, last + 3, last + 1);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const material = this._createGridMaterial('gray');
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(...position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this._tagObject(mesh, {
            static: true,
            physicsShape: 'trimesh',
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            collisionSurface: true,
            horizontalBlocking: false,
            noTraversal: true,
            friction: 0.84,
            restitution: 0.015
        });

        this.obstaclesGroup.add(mesh);
        this.collidableMeshes.push(mesh);
        window.SMPlayerCollisionRegistry?.registerObject?.(mesh, {
            collisionLayer: 'world-static',
            bodyType: 'static',
            physicsShape: 'trimesh',
            horizontalBlocking: false,
            traversalType: false
        });
        return mesh;
    }

    _buildMotionMatchingLane() {
        // A clean test lane dedicated to the supplied parkour clips.  Thin
        // obstacles make the detector predictable and keep the code-driven root
        // traversal from having to cross the very deep showcase blocks.
        this._makeBox({
            name: 'SMMotionVaultBarrier',
            type: 'orange',
            size: [4.2, 0.90, 0.45],
            position: [-12, 0.45, 32],
            traversalType: 'VAULT',
            traversalLandingOffset: 0.70
        });

        this._makeBox({
            name: 'SMMotionClimbObstacle',
            type: 'gray',
            size: [4.2, 1.65, 0.55],
            position: [0, 0.825, 32],
            traversalType: 'CLIMB',
            traversalLandingOffset: 0.50
        });

        this._makeBox({
            name: 'SMMotionHighWall',
            type: 'orange',
            size: [4.2, 2.55, 0.65],
            position: [12, 1.275, 32],
            traversalType: 'CLIMB_WALL',
            traversalLandingOffset: 0.45
        });

        this._createWorldLabel('VAULT', [-12, 1.40, 31.70], 3.2, 0.8);
        this._createWorldLabel('CLIMB', [0, 2.15, 31.70], 3.2, 0.8);
        this._createWorldLabel('WALL CLIMB', [12, 3.05, 31.62], 4.2, 0.8);
    }

    _buildObstacleCourse() {
        const hurdleData = [
            { name: 'SMHeightBlock_025', size: [7, 0.5, 3], position: [-27, 0.25, -12], label: '0.5 M' },
            { name: 'SMHeightBlock_100', size: [7, 1, 3], position: [-19, 0.5, -12], label: '1 M' },
            { name: 'SMHeightBlock_150', size: [7, 1.5, 3], position: [-11, 0.75, -12], label: '1.5 M' },
            { name: 'SMHeightBlock_250', size: [7, 2.5, 3], position: [-3, 1.25, -12], label: '2.5 M' }
        ];

        hurdleData.forEach(item => {
            this._makeBox({
                name: item.name,
                type: 'orange',
                size: item.size,
                position: item.position
            });
            this._createWorldLabel(
                item.label,
                [
                    item.position[0],
                    item.position[1] + item.size[1] * 0.2,
                    item.position[2] + item.size[2] * 0.51
                ],
                3.4,
                1.05
            );
        });

        this._makeBox({ name: 'SMVaultLow', type: 'orange', size: [5, 1, 5], position: [-24, 0.5, 14] });
        this._makeBox({ name: 'SMVaultMedium', type: 'orange', size: [5, 2, 5], position: [-17, 1, 14] });
        this._makeBox({ name: 'SMVaultHigh', type: 'orange', size: [5, 3.2, 5], position: [-10, 1.6, 14] });

        this._makeBox({ name: 'SMBalanceBeam', type: 'orange', size: [14, 0.8, 1.2], position: [-3, 3, -24] });
        this._makeBox({ name: 'SMBalanceSupportLeft', type: 'gray', size: [1.2, 6, 1.2], position: [-9, 3, -24], grid: false });
        this._makeBox({ name: 'SMBalanceSupportRight', type: 'gray', size: [1.2, 6, 1.2], position: [3, 3, -24], grid: false });

        this._makeBox({ name: 'SMJumpPlatform01', type: 'orange', size: [5, 0.8, 5], position: [8, 3.4, -18] });
        this._makeBox({ name: 'SMJumpPlatform02', type: 'orange', size: [5, 0.8, 5], position: [15, 5, -18] });
        this._makeBox({ name: 'SMJumpPlatform03', type: 'orange', size: [5, 0.8, 5], position: [22, 6.6, -18] });

        this._createCurvedRamp({
            name: 'SMGameplayCurvedRamp',
            width: 7,
            length: 19,
            height: 8,
            position: [24, 0.05, 0]
        });

        this._makeBox({ name: 'SMRampLanding', type: 'gray', size: [8, 1, 8], position: [24, 8.5, 12] });
        this._makeBox({ name: 'SMStep01', type: 'gray', size: [4, 0.6, 4], position: [37, 0.3, 15] });
        this._makeBox({ name: 'SMStep02', type: 'gray', size: [4, 1.2, 4], position: [41.5, 0.6, 15] });
        this._makeBox({ name: 'SMStep03', type: 'gray', size: [4, 1.8, 4], position: [46, 0.9, 15] });

        this._makeBox({ name: 'SMFarWall01', type: 'orange', size: [14, 4, 2], position: [35, 2, -28] });
        this._makeBox({ name: 'SMFarWall02', type: 'orange', size: [2, 7, 10], position: [42, 3.5, -23] });
        this._makeBox({ name: 'SMFarPlatform', type: 'gray', size: [14, 1, 9], position: [32, 3.5, -22] });
    }

    prepareShadowCasters() {
        if (!this.root) return;

        this.root.traverse(object => {
            if (!object?.isMesh) return;

            const name = String(object.name || '');
            const parentName = String(object.parent?.name || '');
            const material = Array.isArray(object.material) ? object.material[0] : object.material;

            const isDecoration =
                object.userData?.isGameplayDecoration === true ||
                object.userData?.noCastShadow === true ||
                material?.isMeshBasicMaterial === true ||
                /Label|Decal|SpawnArena|SpawnMark|Text|Helper|Gizmo/i.test(name) ||
                /Helper|Gizmo/i.test(parentName);

            if (object === this.floor) {
                object.castShadow = false;
                object.receiveShadow = true;
                object.userData.noCastShadow = true;
                object.userData.forceReceiveShadow = true;
                return;
            }

            if (isDecoration) {
                object.castShadow = false;
                object.receiveShadow = false;
                return;
            }

            object.castShadow = true;
            object.receiveShadow = true;
        });
    }

    build() {
        if (this._built) return this.getWorld();
        if (!this.scene) {
            console.warn('[Gameplay Sample] Scene is not available.');
            return null;
        }
        this._built = true;

        const floorTexture = this.createUE5FloorGridTexture();
        floorTexture.repeat.set(
            this.floorSize / this.gridWorldSize,
            this.floorSize / this.gridWorldSize
        );

        const floorMaterial = new THREE.MeshStandardMaterial({
            name: 'SMGameplaySampleFloorMaterial',
            color: new THREE.Color('#c5cbd2'),
            map: floorTexture,
            roughness: 0.97,
            metalness: 0.0,
            side: THREE.FrontSide,
            shadowSide: THREE.FrontSide,
            envMapIntensity: 0.01,
            dithering: true
        });

        this.floor = new THREE.Mesh(
            new THREE.PlaneGeometry(this.floorSize, this.floorSize, 1, 1),
            floorMaterial
        );
        this.floor.name = 'SMGameplaySampleFloor';
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.y = 0;
        this.floor.castShadow = false;
        this.floor.receiveShadow = true;
        this.floor.frustumCulled = false;

        this._tagObject(this.floor, {
            static: true,
            physicsShape: 'trimesh',
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            collisionSurface: true,
            horizontalBlocking: false,
            noTraversal: true,
            friction: 0.88,
            restitution: 0.015,
            noCastShadow: true,
            forceReceiveShadow: true
        });

        this.root.add(this.floor);
        this.root.add(this.obstaclesGroup);
        this.collidableMeshes.push(this.floor);
        window.SMPlayerCollisionRegistry?.registerObject?.(this.floor, {
            collisionLayer: 'world-static',
            bodyType: 'static',
            physicsShape: 'trimesh',
            horizontalBlocking: false,
            traversalType: false
        });

        this._createGameAnimationSampleDecal(14);
        this._buildObstacleCourse();
        this._buildMotionMatchingLane();
        this.prepareShadowCasters();

        this.root.visible = false;
        this.floor.frustumCulled = false;

        this.scene.add(this.root);
        return this.getWorld();
    }

    setVisible(visible) {
        const state = !!visible;
        this.root.visible = state;
        this.root.traverse(child => {
            child.visible = state;
        });
    }

    getWorld() {
        return {
            root: this.root,
            ground: this.floor,
            floor: this.floor,
            obstaclesGroup: this.obstaclesGroup,
            collidableMeshes: this.collidableMeshes,
            traversalMeshes: this.traversalMeshes
        };
    }

    dispose() {
        const geometries = new Set();
        const materials = new Set();

        window.SMPlayerCollisionRegistry?.unregisterObject?.(this.root);

        this.root.traverse(object => {
            if (object.geometry) geometries.add(object.geometry);
            if (Array.isArray(object.material)) {
                object.material.forEach(material => {
                    if (material) materials.add(material);
                });
            } else if (object.material) {
                materials.add(object.material);
            }
        });

        geometries.forEach(geometry => geometry?.dispose?.());
        materials.forEach(material => material?.dispose?.());

        this._textures.forEach(texture => texture?.dispose?.());
        this._textures.length = 0;
        this._materials.clear();

        this.root.parent?.remove(this.root);
        this.obstaclesGroup.clear?.();
        this.root.clear?.();

        this.collidableMeshes.length = 0;
        this.traversalMeshes.length = 0;
        this.floor = null;
        this._built = false;
    }
}
window.SMGameplaySampleCourse = SMGameplaySampleCourse;


/* ===== SMGameplaySampleEnvironment.js ===== */

/**
 * SMGameplaySampleEnvironment.js
 *
 * Unified Gameplay Sample environment controller for SM Engine.
 * Fixed: Shadow Acne / Moiré wave artifacts eliminated while keeping interior visibility.
 */
class SMGameplaySampleEnvironment {
    constructor(scene, renderer, camera = null) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera || window.camera || null;

        this.course = new SMGameplaySampleCourse(scene);
        this.world = null;

        this.active = false;
        this._initialized = false;
        this._disposed = false;
        this._physicsRegistered = new Set();

        this.CONFIG = {
            // -----------------------------------------------------------------
            // HARMONIC UE5 GAMEPLAY-SAMPLE PALETTE
            // -----------------------------------------------------------------
            // The course floor texture base is #3f4043 and its material tint is
            // #c5cbd2. Their perceived base sits around a dark neutral slate.
            // Fog + horizon are intentionally only one value-family above it so
            // the floor disappears naturally into the atmosphere at distance.
            floorBaseColor: '#3f4043',
            floorMaterialTint: '#c5cbd2',
            floorVisualColor: '#313337',
            lowerSkyColor: '#42454b',
            horizonFogColor: '#4a4d54',
            sceneBackgroundColor: '#4a4d54',
            topSkyColor: '#626873',

            // Exponential distance fog. Strong enough to read at gameplay scale
            // without turning nearby obstacles into a white/blue wash.
            fogDensity: 0.0105,

            // Global Directional Sun - warm-neutral against the cool slate world.
            sunColor: 0xfff4df,
            sunIntensity: 2.15,
            sunElevation: 38,
            sunAzimuth: 215,
            sunDistance: 130,

            // Calibrated Shadow Rig
            shadowMapSize: 4096,
            shadowFrustum: 30,
            shadowNear: 0.5,
            shadowFar: 280,
            shadowBias: -0.00005,
            shadowNormalBias: 0.0015,
            shadowFocusHeight: 1.0,
            texelSnapping: true,

            // Neutral indirect fill. Keep these restrained so the dark floor
            // remains dark instead of being lifted toward white.
            skyLightTopColor: 0x858b96,
            skyLightGroundColor: 0x2f3135,
            skyLightIntensity: 0.20,
            ambientColor: 0x747981,
            ambientIntensity: 0.055,

            // Renderer Exposure
            exposure: 0.90,

            // Interior visibility
            interiorDoubleSided: true,
            interiorCameraNear: 0.02
        };

        this.backgroundColor = new THREE.Color(this.CONFIG.sceneBackgroundColor);
        this.fogColor = new THREE.Color(this.CONFIG.horizonFogColor);

        this.lights = new THREE.Group();
        this.lights.name = 'SMGameplaySampleLights';
        this._tagObject(this.lights);

        this.sun = null;
        this.sunTarget = null;
        this.skyLight = null;
        this.ambientLight = null;
        this.skyDome = null;

        this.sunDirection = new THREE.Vector3();
        this.shadowFocus = new THREE.Vector3();
        this._lastShadowFocus = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
        this._scratchDirection = new THREE.Vector3();

        this._savedState = null;
        this._hiddenObjectStates = new Map();
        this._foreignLightStates = new Map();
        this._previousSkySystemVisible = null;

        this._frameCallback = null;
        this._frameRegistryType = null;

        this._interiorFixedMaterials = new WeakSet();
        this._interiorRefreshAccumulator = 0;
    }

    _tagObject(object, extra = {}) {
        if (!object) return object;
        object.userData = {
            ...(object.userData || {}),
            isSystemObject: true,
            isGameplaySample: true,
            workspaceOnly: 'GAMEPLAY_SAMPLE',
            ignoreInTimeline: true,
            ignoreInHierarchy: true,
            ...extra
        };
        return object;
    }

    init() {
        if (this._initialized) return this.world;
        if (!this.scene || !this.renderer) {
            console.warn('[Gameplay Sample] Scene or renderer is missing.');
            return null;
        }

        this._initialized = true;

        this.world = this.course.build();
        this._synchronizeCoursePalette();
        this._updateSunDirection();
        this._buildLights();
        this._createSkyDome();

        if (!this.lights.parent) {
            this.scene.add(this.lights);
        }

        this._prepareShadowCasters();
        this.refreshInteriorVisibility();
        this._updateShadowFocus(true);

        this.course.setVisible(false);
        this.lights.visible = false;
        if (this.skyDome) this.skyDome.visible = false;

        this._installFrameUpdate();

        console.log(
            '%c🎮 SMGameplaySampleEnvironment — Smooth Shadows & Interior Safe Ready',
            'color:#b9a7ff;font-weight:bold'
        );

        return this.world;
    }

    _synchronizeCoursePalette() {
        const floor = this.world?.floor;
        if (!floor?.material) return;

        const materials = Array.isArray(floor.material)
            ? floor.material
            : [floor.material];

        // Keep the authored floor itself untouched. We only use its palette as
        // the atmosphere reference, so floor / fog / sky remain one visual family.
        materials.forEach(material => {
            if (!material) return;
            material.fog = true;
            material.needsUpdate = true;
        });

        // Expose the palette for debugging/tuning from the console.
        floor.userData = {
            ...(floor.userData || {}),
            gameplayAtmospherePalette: {
                floorBase: this.CONFIG.floorBaseColor,
                floorVisual: this.CONFIG.floorVisualColor,
                fog: this.CONFIG.horizonFogColor,
                horizon: this.CONFIG.horizonFogColor,
                skyTop: this.CONFIG.topSkyColor
            }
        };
    }

    _updateSunDirection() {
        const elevation = THREE.MathUtils.degToRad(this.CONFIG.sunElevation);
        const azimuth = THREE.MathUtils.degToRad(this.CONFIG.sunAzimuth);
        const horizontal = Math.cos(elevation);

        this.sunDirection.set(
            Math.sin(azimuth) * horizontal,
            Math.sin(elevation),
            Math.cos(azimuth) * horizontal
        ).normalize();

        return this.sunDirection;
    }

    _resolveShadowMapSize() {
        const requested = Math.max(1024, Number(this.CONFIG.shadowMapSize) || 4096);
        const maxTextureSize =
            this.renderer?.capabilities?.maxTextureSize ||
            this.renderer?.capabilities?.getMaxAnisotropy?.() * 1024 ||
            4096;

        return Math.min(requested, maxTextureSize, 4096);
    }

    _configureSunShadow() {
        if (!this.sun) return;

        const shadow = this.sun.shadow;
        const mapSize = this._resolveShadowMapSize();
        const frustum = Math.max(8, Number(this.CONFIG.shadowFrustum) || 30);

        if (
            shadow.map &&
            (shadow.map.width !== mapSize || shadow.map.height !== mapSize)
        ) {
            shadow.map.dispose?.();
            shadow.map = null;
        }
        shadow.mapSize.set(mapSize, mapSize);
        shadow.camera.left = -frustum;
        shadow.camera.right = frustum;
        shadow.camera.top = frustum;
        shadow.camera.bottom = -frustum;
        shadow.camera.near = Math.max(0.01, this.CONFIG.shadowNear || 0.5);
        shadow.camera.far = Math.max(
            shadow.camera.near + 10,
            this.CONFIG.shadowFar || 280
        );
        shadow.camera.updateProjectionMatrix();

        shadow.bias = this.CONFIG.shadowBias;
        shadow.normalBias = this.CONFIG.shadowNormalBias;
        shadow.radius = 1.0;
        shadow.autoUpdate = true;
        shadow.needsUpdate = true;

        if (this.renderer?.shadowMap) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.shadowMap.autoUpdate = true;
            this.renderer.shadowMap.needsUpdate = true;
        }
    }

    _buildLights() {
        if (this.sun) return;

        this._updateSunDirection();

        const target = new THREE.Object3D();
        target.name = 'SMGameplaySampleSunTarget';
        target.position.set(0, this.CONFIG.shadowFocusHeight, 0);
        sun.target = target;

        this._tagObject(sun, {
            isGlobalGameplaySampleSun: true,
            shadowRequested: true,
            forceShadow: true,
            allowShadowBudgetDisable: false,
            minShadowMapSize: 2048,
            shadowPriority: 100
        });
        this._tagObject(target, { isGlobalGameplaySampleSunTarget: true });

        this.lights.add(target);
        this.lights.add(sun);

        this.sun = sun;
        this.sunTarget = target;
        this._configureSunShadow();
        this._updateShadowFocus(true);

        const skyLight = new THREE.HemisphereLight(
            this.CONFIG.skyLightTopColor,
            this.CONFIG.skyLightGroundColor,
            this.CONFIG.skyLightIntensity
        );
        skyLight.name = 'SMGameplaySampleSkyLight';
        skyLight.position.set(0, 50, 0);
        skyLight.castShadow = false;
        this._tagObject(skyLight);
        this.lights.add(skyLight);
        this.skyLight = skyLight;

        const ambient = new THREE.AmbientLight(
            this.CONFIG.ambientColor,
            this.CONFIG.ambientIntensity
        );
        ambient.name = 'SMGameplaySampleAmbient';
        ambient.castShadow = false;
        this._tagObject(ambient);
        this.lights.add(ambient);
        this.ambientLight = ambient;
    }

    _createSkyDome() {
        if (this.skyDome) return this.skyDome;

        this._updateSunDirection();

        // Large camera-centred dome. It never receives scene fog; instead its
        // horizon colour is exactly the same colour as the fog itself.
        const geometry = new THREE.SphereGeometry(1200, 48, 32);
        const material = new THREE.ShaderMaterial({
            name: 'SMGameplaySampleSkyMaterial',
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false,
            uniforms: {
                topColor: { value: new THREE.Color(this.CONFIG.topSkyColor) },
                horizonColor: { value: new THREE.Color(this.CONFIG.horizonFogColor) },
                lowerColor: { value: new THREE.Color(this.CONFIG.lowerSkyColor) },
                sunDirection: { value: this.sunDirection.clone() },
                sunColor: { value: new THREE.Color(this.CONFIG.sunColor) }
            },
            vertexShader: `
                varying vec3 vSkyDirection;

                void main() {
                    vSkyDirection = normalize(position);
                    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    gl_Position = pos.xyww;
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                uniform vec3 lowerColor;
                uniform vec3 sunDirection;
                uniform vec3 sunColor;

                varying vec3 vSkyDirection;

                void main() {
                    vec3 dir = normalize(vSkyDirection);
                    float y = dir.y;

                    // IMPORTANT: at y == 0 (the actual horizon) the colour is
                    // horizonColor, not a 50/50 sky mix. This is what makes the
                    // fogged floor and the sky meet without a visible colour seam.
                    float upperBlend = smoothstep(-0.025, 0.72, y);
                    vec3 finalColor = mix(horizonColor, topColor, upperBlend);

                    // Very subtle lower-hemisphere darkening. It stays close to
                    // the floor family and prevents a bright ring under the horizon.
                    float lowerBlend = 1.0 - smoothstep(-0.48, -0.02, y);
                    finalColor = mix(finalColor, lowerColor, lowerBlend * 0.72);

                    // Reinforce a broad neutral horizon band for atmospheric unity.
                    float horizonBand = 1.0 - smoothstep(0.015, 0.17, abs(y));
                    finalColor = mix(finalColor, horizonColor, horizonBand * 0.70);

                    // Restrained sun scattering: readable, but it must not bleach
                    // the slate palette around the horizon.
                    float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
                    float haze = pow(sunDot, 18.0) * 0.055;
                    float glow = pow(sunDot, 64.0) * 0.10;
                    float disk = smoothstep(0.99962, 0.99988, sunDot);

                    finalColor += sunColor * haze;
                    finalColor += sunColor * glow;
                    finalColor += sunColor * disk * 0.62;

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `
        });

        this.skyDome = new THREE.Mesh(geometry, material);
        this.skyDome.name = 'SMGameplaySampleSkyDome';
        this.skyDome.frustumCulled = false;
        this.skyDome.renderOrder = -1000;
        this.skyDome.castShadow = false;
        this.skyDome.receiveShadow = false;
        this._tagObject(this.skyDome, {
            isGameplaySampleSky: true,
            noCastShadow: true,
            noReceiveShadow: true
        });

        this.scene.add(this.skyDome);
        return this.skyDome;
    }

    _captureExternalState() {
        if (this._savedState || !this.renderer || !this.scene) return;

        const clearColor = new THREE.Color();
        this.renderer.getClearColor?.(clearColor);

        this._savedState = {
            sceneBackground: this.scene.background,
            sceneFog: this.scene.fog,
            clearColor,
            clearAlpha: this.renderer.getClearAlpha?.() ?? 1,
            toneMapping: this.renderer.toneMapping,
            toneMappingExposure: this.renderer.toneMappingExposure,
            outputColorSpace: this.renderer.outputColorSpace,
            shadowEnabled: this.renderer.shadowMap?.enabled,
            shadowType: this.renderer.shadowMap?.type,
            shadowAutoUpdate: this.renderer.shadowMap?.autoUpdate
        };

        const sky = window.skyLightingSystem;
        this._previousSkySystemVisible = !!(
            sky?.sunLight?.visible ||
            sky?.skyMesh?.visible ||
            sky?.sky?.visible
        );
    }

    _restoreExternalState() {
        if (!this._savedState) return;

        const state = this._savedState;
        this.scene.background = state.sceneBackground;
        this.scene.fog = state.sceneFog;

        if (this.renderer) {
            this.renderer.setClearColor(state.clearColor, state.clearAlpha);
            this.renderer.toneMapping = state.toneMapping;
            this.renderer.toneMappingExposure = state.toneMappingExposure;
            if ('outputColorSpace' in this.renderer) {
                this.renderer.outputColorSpace = state.outputColorSpace;
            }
            if (this.renderer.shadowMap) {
                this.renderer.shadowMap.enabled = state.shadowEnabled;
                this.renderer.shadowMap.type = state.shadowType;
                this.renderer.shadowMap.autoUpdate = state.shadowAutoUpdate;
                this.renderer.shadowMap.needsUpdate = true;
            }
        }

        this._savedState = null;
    }

    _applyUE5Background() {
        if (!this.scene) return;

        const backgroundColor = new THREE.Color(this.CONFIG.sceneBackgroundColor);
        const fogColor = new THREE.Color(this.CONFIG.horizonFogColor);

        // Background is only a fallback behind the custom sky dome. It uses the
        // same family as the fog so there is never a bright clear-colour flash.
        this.scene.background = backgroundColor;
        this._ensureFog(true);

        if (this.world?.root) {
            this.world.root.traverse(child => {
                if (!child?.isMesh || !child.material) return;
                const mats = Array.isArray(child.material)
                    ? child.material
                    : [child.material];
                mats.forEach(material => {
                    if (!material) return;
                    material.fog = true;
                    material.needsUpdate = true;
                });
            });
        }

        // Keep the sky uniforms synchronized with the exact fog palette.
        const uniforms = this.skyDome?.material?.uniforms;
        uniforms?.topColor?.value?.set?.(this.CONFIG.topSkyColor);
        uniforms?.horizonColor?.value?.copy?.(fogColor);
        uniforms?.lowerColor?.value?.set?.(this.CONFIG.lowerSkyColor);

        if (this.renderer) {
            if ('outputColorSpace' in this.renderer) {
                this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            }
            this.renderer.setClearColor(backgroundColor, 1);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.shadowMap.autoUpdate = true;
            this.renderer.shadowMap.needsUpdate = true;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = this.CONFIG.exposure;
        }
    }

    _ensureFog(force = false) {
        if (!this.scene) return;

        this.fogColor.set(this.CONFIG.horizonFogColor);
        const density = THREE.MathUtils.clamp(
            Number(this.CONFIG.fogDensity) || 0.0105,
            0.0001,
            0.08
        );

        // FogExp2 is intentionally used here: it gives a smooth, continuous
        // distance fade instead of the obvious near/far wall of linear fog.
        if (force || !this.scene.fog?.isFogExp2) {
            this.scene.fog = new THREE.FogExp2(this.fogColor.clone(), density);
        } else {
            this.scene.fog.color.copy(this.fogColor);
            this.scene.fog.density = density;
        }

        // Make sure already-compiled standard materials actually include USE_FOG.
        this.scene.traverse(object => {
            if (!object?.isMesh || !object.material || object === this.skyDome) return;
            const mats = Array.isArray(object.material) ? object.material : [object.material];
            mats.forEach(material => {
                if (!material || material.isShaderMaterial) return;
                material.fog = true;
                material.needsUpdate = true;
            });
        });
    }

    setFogDensity(density) {
        this.CONFIG.fogDensity = THREE.MathUtils.clamp(Number(density) || 0.0105, 0.0001, 0.08);
        this._ensureFog(true);
    }

    _rememberObjectVisibility(object) {
        if (!object || this._hiddenObjectStates.has(object)) return;
        this._hiddenObjectStates.set(object, object.visible);
    }

    _hideAllSkyObjects() {
        const sky = window.skyLightingSystem;
        if (sky) {
            try { sky.setVisible?.(false); } catch (e) { }
        }

        if (!this.scene) return;

        this.scene.traverse(object => {
            if (!object || object === this.skyDome) return;

            const name = String(object.name || '');
            const isSky =
                name.startsWith('Sky') ||
                object === window.sky ||
                object.userData?.keepForSky === true;

            if (!isSky) return;

            this._rememberObjectVisibility(object);
            object.visible = false;
        });
    }

    _hideLegacyGameEnvironment() {
        if (!this.scene) return;

        const legacyNames = [
            'UnrealEngineFloor',
            'ObstaclesGroup',
            'DistanceMarkers',
            'MotionMatchingSampleCourse'
        ];

        legacyNames.forEach(name => {
            const object = this.scene.getObjectByName(name);
            if (!object) return;

            object.traverse?.(child => {
                this._rememberObjectVisibility(child);
                child.visible = false;
            });

            this._rememberObjectVisibility(object);
            object.visible = false;
        });
    }

    _muteForeignLights() {
        if (!this.scene) return;

        this.scene.traverse(light => {
            if (!light?.isLight || light.userData?.isGameplaySample === true) return;

            const name = String(light.name || '');
            const isDirectional = light.isDirectionalLight === true;
            const isEngineGlobalFill =
                light.isHemisphereLight ||
                light.isAmbientLight ||
                /Sun|Hemi|Ambient|SkyLight|FillLight|Workspace/i.test(name) ||
                light.userData?.keepForSky === true ||
                light.userData?.ws_gameLight === true ||
                light.userData?.ws_terrainLight === true;

            if (!isDirectional && !isEngineGlobalFill) return;

            if (!this._foreignLightStates.has(light)) {
                this._foreignLightStates.set(light, {
                    visible: light.visible,
                    castShadow: light.castShadow,
                    intensity: light.intensity
                });
            }

            light.visible = false;
            light.castShadow = false;
        });
    }

    _restoreForeignLights() {
        this._foreignLightStates.forEach((state, light) => {
            if (!light) return;
            light.visible = state.visible;
            light.castShadow = state.castShadow;
            if (Number.isFinite(state.intensity)) light.intensity = state.intensity;
        });
        this._foreignLightStates.clear();

        if (this.renderer?.shadowMap) {
            this.renderer.shadowMap.needsUpdate = true;
        }
    }

    _restoreHiddenObjects() {
        this._hiddenObjectStates.forEach((visible, object) => {
            if (object) object.visible = visible;
        });
        this._hiddenObjectStates.clear();

        if (window.skyLightingSystem && this._previousSkySystemVisible != null) {
            try {
                window.skyLightingSystem.setVisible?.(this._previousSkySystemVisible);
            } catch (e) { }
        }
        this._previousSkySystemVisible = null;
    }

    _isPlayerOrCharacterObject(object) {
        if (!object) return false;

        if (
            object.userData?.isPlayer === true ||
            object.userData?.isPlayerRoot === true ||
            object.userData?.isPlayerVisual === true ||
            object.userData?.workspaceOnly === 'PLAYER'
        ) {
            return true;
        }

        let parent = object.parent;
        while (parent) {
            if (
                parent.userData?.isPlayer === true ||
                parent.userData?.isPlayerRoot === true ||
                parent.userData?.isPlayerVisual === true ||
                parent.userData?.workspaceOnly === 'PLAYER'
            ) {
                return true;
            }
            parent = parent.parent;
        }

        return false;
    }

    _isArchitecturalMesh(object) {
        if (!object?.isMesh) return false;
        if (object === this.skyDome) return false;
        if (this._isPlayerOrCharacterObject(object)) return false;
        if (this._isHelperMesh(object)) return false;

        const userData = object.userData || {};
        const name = String(object.name || '').toLowerCase();
        const parentName = String(object.parent?.name || '').toLowerCase();

        if (
            userData.isBuilding === true ||
            userData.isBuildingPart === true ||
            userData.isArchitecture === true ||
            userData.isArchitectural === true ||
            userData.isCityObject === true ||
            userData.isCityRoot === true ||
            userData.isProceduralCity === true ||
            userData.interiorVisible === true ||
            userData.doubleSided === true
        ) {
            return true;
        }

        return /wall|building|house|room|roof|ceiling|door|window|warehouse|tower|corridor|hall|interior|exterior|architecture|city|apartment|garage|shop|office|facade|pillar|column/.test(name) ||
               /building|house|room|warehouse|tower|architecture|city|interior/.test(parentName);
    }

    _makeMaterialInteriorSafe(material) {
        if (!material || this._interiorFixedMaterials.has(material)) return;

        if (material === this.skyDome?.material || material.isShaderMaterial) return;

        // Visual rendering: render both sides so rooms/interiors are visible
        material.side = THREE.DoubleSide;

        // FIX FOR SHADOW WAVES:
        // Force shadow map depth rendering to FrontSide only.
        // This stops self-shadowing interference (Z-Fighting) that causes wave ripples!
        material.shadowSide = THREE.FrontSide;

        material.needsUpdate = true;
        this._interiorFixedMaterials.add(material);
    }

    refreshInteriorVisibility(root = this.scene) {
        if (!this.CONFIG.interiorDoubleSided || !root?.traverse) return 0;

        let fixedMeshes = 0;

        root.traverse(object => {
            if (!this._isArchitecturalMesh(object)) return;

            const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];

            materials.forEach(material => {
                if (!material) return;
                this._makeMaterialInteriorSafe(material);
            });

            fixedMeshes++;
        });

        return fixedMeshes;
    }

    _configureCamera() {
        const camera = this.camera || window.camera;
        if (!camera?.isPerspectiveCamera) return;

        camera.near = Math.max(0.01, Number(this.CONFIG.interiorCameraNear) || 0.02);
        camera.far = 2000;
        camera.fov = 48;
        camera.position.set(0, 1.6, 4.8);
        camera.lookAt(0, 0.9, 0);
        camera.updateProjectionMatrix();
    }

    _configureControls() {
        const controls = window.orbitControls || window.controls;
        if (!controls) return;

        controls.enableRotate = true;
        controls.enableZoom = true;
        controls.enablePan = true;
        controls.minDistance = 1.0;
        controls.maxDistance = 25.0;
        controls.target.set(0, 0.9, 0);
        controls.maxPolarAngle = Math.PI * 0.495;
        controls.update?.();
    }

    _getPlayerObject() {
        const candidates = [
            window.player?.model,
            window.player?.object,
            window.player,
            window.playerSystem?.player?.model,
            window.playerSystem?.player?.object,
            window.playerSystem?.model,
            window.playerModel,
            this.scene?.getObjectByName?.('Player')
        ];

        return candidates.find(object => object?.isObject3D) || null;
    }

    _isHelperMesh(object) {
        if (!object) return true;
        const name = String(object.name || '');
        const parentName = String(object.parent?.name || '');

        return (
            object.userData?.isGameplayDecoration === true ||
            object.userData?.noCastShadow === true ||
            /Helper|Gizmo|TransformControls|picker|axis|gridhelper/i.test(name) ||
            /Helper|Gizmo|TransformControls/i.test(parentName)
        );
    }

    _prepareShadowCasters() {
        this.course.prepareShadowCasters?.();

        const player = this._getPlayerObject();
        player?.traverse?.(object => {
            if (!object?.isMesh) return;

            if (this._isHelperMesh(object)) {
                object.castShadow = false;
                return;
            }

            object.castShadow = true;
            object.receiveShadow = true;

            if (object.isSkinnedMesh) {
                object.frustumCulled = false;
            }
        });

        if (this.world?.floor) {
            this.world.floor.castShadow = false;
            this.world.floor.receiveShadow = true;
        }
    }

    _getShadowFocus() {
        const player = this._getPlayerObject();
        if (player) {
            player.getWorldPosition(this.shadowFocus);
            this.shadowFocus.y += this.CONFIG.shadowFocusHeight;
            return this.shadowFocus;
        }

        const controls = window.orbitControls || window.controls;
        if (controls?.target?.isVector3) {
            this.shadowFocus.copy(controls.target);
            this.shadowFocus.y = Math.max(
                this.CONFIG.shadowFocusHeight,
                this.shadowFocus.y
            );
            return this.shadowFocus;
        }

        const camera = this.camera || window.camera;
        if (camera) {
            camera.getWorldDirection(this._scratchDirection);
            this.shadowFocus
                .copy(camera.position)
                .addScaledVector(this._scratchDirection, 6);
            this.shadowFocus.y = this.CONFIG.shadowFocusHeight;
            return this.shadowFocus;
        }

        return this.shadowFocus.set(0, this.CONFIG.shadowFocusHeight, 0);
    }

    _updateShadowFocus(force = false) {
        if (!this.sun || !this.sunTarget) return;

        const focus = this._getShadowFocus();
        const frustumWidth = this.CONFIG.shadowFrustum * 2;
        const mapSize = this._resolveShadowMapSize();
        const texelSize = frustumWidth / Math.max(1, mapSize);

        if (this.CONFIG.texelSnapping && texelSize > 0) {
            focus.x = Math.round(focus.x / texelSize) * texelSize;
            focus.z = Math.round(focus.z / texelSize) * texelSize;
        }

        if (
            !force &&
            this._lastShadowFocus.distanceToSquared(focus) < texelSize * texelSize * 0.04
        ) {
            return;
        }

        this._lastShadowFocus.copy(focus);
        this.sunTarget.position.copy(focus);
        this.sun.position
            .copy(focus)
            .addScaledVector(this.sunDirection, this.CONFIG.sunDistance);

        this.sunTarget.updateMatrixWorld(true);
        this.sun.updateMatrixWorld(true);
        this.sun.shadow.needsUpdate = true;
    }

    _syncSkyToSunAndCamera() {
        if (!this.skyDome) return;

        const camera = this.camera || window.camera;
        if (camera) this.skyDome.position.copy(camera.position);

        const uniforms = this.skyDome.material?.uniforms;
        if (uniforms?.sunDirection) {
            uniforms.sunDirection.value.copy(this.sunDirection);
        }
        if (uniforms?.sunColor) {
            uniforms.sunColor.value.set(this.CONFIG.sunColor);
        }
        if (uniforms?.topColor) {
            uniforms.topColor.value.set(this.CONFIG.topSkyColor);
        }
        if (uniforms?.horizonColor) {
            uniforms.horizonColor.value.set(this.CONFIG.horizonFogColor);
        }
        if (uniforms?.lowerColor) {
            uniforms.lowerColor.value.set(this.CONFIG.lowerSkyColor);
        }
    }

    setAtmospherePalette({ floor, fog, horizon, skyTop, skyLower, background } = {}) {
        if (floor) this.CONFIG.floorVisualColor = floor;
        if (fog) this.CONFIG.horizonFogColor = fog;
        if (horizon) this.CONFIG.horizonFogColor = horizon;
        if (skyTop) this.CONFIG.topSkyColor = skyTop;
        if (skyLower) this.CONFIG.lowerSkyColor = skyLower;
        if (background) this.CONFIG.sceneBackgroundColor = background;
        else if (fog || horizon) this.CONFIG.sceneBackgroundColor = this.CONFIG.horizonFogColor;

        this.backgroundColor.set(this.CONFIG.sceneBackgroundColor);
        this.fogColor.set(this.CONFIG.horizonFogColor);
        this._applyUE5Background();
        this._syncSkyToSunAndCamera();

        return {
            floor: this.CONFIG.floorVisualColor,
            fog: this.CONFIG.horizonFogColor,
            background: this.CONFIG.sceneBackgroundColor,
            skyTop: this.CONFIG.topSkyColor,
            skyLower: this.CONFIG.lowerSkyColor,
            density: this.CONFIG.fogDensity
        };
    }

    refreshShadows() {
        if (!this.sun) return false;
        this.sun.castShadow = true;
        this._configureSunShadow();
        this._prepareShadowCasters();
        this._updateShadowFocus(true);
        return true;
    }

    setSunAngles(elevationDeg = this.CONFIG.sunElevation, azimuthDeg = this.CONFIG.sunAzimuth) {
        this.CONFIG.sunElevation = Number(elevationDeg) || 0;
        this.CONFIG.sunAzimuth = Number(azimuthDeg) || 0;
        this._updateSunDirection();
        this._syncSkyToSunAndCamera();
        this._updateShadowFocus(true);
        return this.sunDirection.clone();
    }

    getSunDirection() {
        return this.sunDirection.clone();
    }

    _installFrameUpdate() {
        if (this._frameCallback) return true;

        const callback = () => this.update();
        const registry = window.engineFrameCallbacks;

        if (registry?.add && typeof registry.add === 'function') {
            registry.add(callback);
            this._frameCallback = callback;
            this._frameRegistryType = 'set';
            return true;
        }

        if (Array.isArray(registry)) {
            if (!registry.includes(callback)) registry.push(callback);
            this._frameCallback = callback;
            this._frameRegistryType = 'array';
            return true;
        }

        return false;
    }

    _removeFrameUpdate() {
        if (!this._frameCallback) return;

        const registry = window.engineFrameCallbacks;
        if (this._frameRegistryType === 'set') {
            registry?.delete?.(this._frameCallback);
        } else if (this._frameRegistryType === 'array' && Array.isArray(registry)) {
            const index = registry.indexOf(this._frameCallback);
            if (index >= 0) registry.splice(index, 1);
        }

        this._frameCallback = null;
        this._frameRegistryType = null;
    }

    activate() {
        this.init();
        if (!this.world) return null;

        this.active = true;
        this._captureExternalState();
        this._installFrameUpdate();

        this._hideLegacyGameEnvironment();
        this._hideAllSkyObjects();
        this._muteForeignLights();

        this._applyUE5Background();
        this._configureCamera();
        this._configureControls();

        this.course.setVisible(true);
        this.lights.visible = true;
        this.lights.traverse(child => { child.visible = true; });
        if (this.skyDome) this.skyDome.visible = true;

        this._prepareShadowCasters();
        this.refreshInteriorVisibility();
        this._configureSunShadow();
        this._updateShadowFocus(true);
        this._syncSkyToSunAndCamera();

        this.registerPhysics(window.physicsSystem);

        window.gameplaySampleWorld = this.world;
        window.ground = this.world.ground;
        window.obstaclesGroup = this.world.obstaclesGroup;
        window.collidableMeshes = this.world.collidableMeshes;
        window.traversalMeshes = this.world.traversalMeshes || [];

        // Motion Matching / traversal can consume the same authored world
        // without changing the atmosphere, fog, lighting, or course palette.
        window.dispatchEvent?.(new CustomEvent('sm-gameplay-sample-world-ready', {
            detail: { world: this.world }
        }));

        return this.world;
    }

    update(delta = 0) {
        if (!this.active) return;

        this._interiorRefreshAccumulator += Number(delta) || 0;
        if (this._interiorRefreshAccumulator >= 1.0) {
            this._interiorRefreshAccumulator = 0;
            this.refreshInteriorVisibility();
        }

        const camera = this.camera || window.camera;

        if (this.skyDome && camera) {
            this.skyDome.position.copy(camera.position);
            this.skyDome.quaternion.identity();
            this.skyDome.updateMatrixWorld(true);
        }

        this._updateShadowFocus?.();

        const uniforms = this.skyDome?.material?.uniforms;
        if (uniforms?.sunDirection) {
            uniforms.sunDirection.value.copy(this.sunDirection);
        }
    }

    deactivate() {
        if (!this._initialized) return;

        this.active = false;
        this.course.setVisible(false);
        this.lights.visible = false;
        if (this.skyDome) this.skyDome.visible = false;

        this.disablePhysics(window.physicsSystem);
        this._restoreForeignLights();
        this._restoreHiddenObjects();
        this._restoreExternalState();
    }

    registerPhysics(physicsSystem) {
        if (!physicsSystem || !this.world) return false;

        for (const mesh of this.world.collidableMeshes || []) {
            if (!mesh?.isMesh || this._physicsRegistered.has(mesh.uuid)) continue;

            mesh.updateMatrixWorld(true);
            const options = {
                mass: 0,
                shapeType: mesh.userData?.physicsShape || 'box',
                friction: mesh.userData?.friction ?? 0.8,
                restitution: mesh.userData?.restitution ?? 0.02
            };

            try {
                physicsSystem.addBody(mesh, options);
                this._physicsRegistered.add(mesh.uuid);
            } catch (error) {
                console.warn('[Gameplay Sample] Physics body registration failed:', mesh.name, error);
            }
        }

        physicsSystem.toggleSimulation?.(true);
        return true;
    }

    disablePhysics(physicsSystem) {
        if (!physicsSystem || !this.world) return;

        for (const mesh of this.world.collidableMeshes || []) {
            if (!mesh?.isMesh || !this._physicsRegistered.has(mesh.uuid)) continue;
            try { physicsSystem.removeBody?.(mesh); } catch (e) { }
            this._physicsRegistered.delete(mesh.uuid);
        }
    }

    getWorld() {
        this.init();
        return this.world;
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        this.deactivate();
        this._removeFrameUpdate();

        this.course.dispose();

        if (this.skyDome) {
            this.skyDome.parent?.remove(this.skyDome);
            this.skyDome.geometry?.dispose?.();
            this.skyDome.material?.dispose?.();
            this.skyDome = null;
        }

        if (this.sun?.shadow?.map) {
            this.sun.shadow.map.dispose?.();
            this.sun.shadow.map = null;
        }

        this.lights.parent?.remove(this.lights);
        this.lights.clear?.();

        this.sun = null;
        this.sunTarget = null;
        this.skyLight = null;
        this.ambientLight = null;
        this.world = null;
    }
}

// Global Exports
window.SMGameplaySampleEnvironment = SMGameplaySampleEnvironment;

window.createSMGameplaySampleEnvironment = function (
    scene = window.scene,
    renderer = window.renderer,
    camera = window.camera
) {
    if (!scene || !renderer || typeof THREE === 'undefined') {
        console.warn('[Gameplay Sample] Scene or renderer is missing.');
        return null;
    }

    if (window.gameplaySampleEnvironment) {
        return window.gameplaySampleEnvironment;
    }

    window.gameplaySampleEnvironment = new SMGameplaySampleEnvironment(
        scene,
        renderer,
        camera
    );

    window.gameplaySampleEnvironment.init();

    window.updateGameplaySampleEnvironment = function (delta = 0) {
        window.gameplaySampleEnvironment?.update?.(delta);
    };

    window.refreshGameplaySampleInteriors = function () {
        return window.gameplaySampleEnvironment?.refreshInteriorVisibility?.() || 0;
    };

    window.setGameplaySampleAtmosphere = function (options = {}) {
        return window.gameplaySampleEnvironment?.setAtmospherePalette?.(options) || null;
    };

    return window.gameplaySampleEnvironment;
};

/* ===== SMGameplaySampleSwimmingZone.js ===== */

/**
 * SMGameplaySampleSwimmingZone.js
 *
 * Raised pool / swimming test zone for the Universal Player Sample.
 * Uses only THREE primitives so the mode has no external environment-asset dependency.
 */
class SMGameplaySampleSwimmingZone {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = {
            center: new THREE.Vector3(31, 0, 29),
            width: 18,
            length: 12,
            rimHeight: 0.55,
            waterY: 0.36,
            swimRootY: 0.16,
            ...options
        };

        this.root = new THREE.Group();
        this.root.name = 'SMGameplaySampleSwimmingZone';
        this.root.userData = {
            isSystemObject: true,
            isGameplaySample: true,
            workspaceOnly: 'GAMEPLAY_SAMPLE',
            ignoreInTimeline: true,
            ignoreInHierarchy: true,
            isSwimZone: true
        };

        this.collidableMeshes = [];
        this.waterMesh = null;
        this.volume = null;
        this._built = false;
        this._textures = [];
        this._materials = [];
    }

    _tag(object, extra = {}) {
        object.userData = {
            ...(object.userData || {}),
            isSystemObject: true,
            isGameplaySample: true,
            workspaceOnly: 'GAMEPLAY_SAMPLE',
            ignoreInTimeline: true,
            ignoreInHierarchy: true,
            ...extra
        };
        return object;
    }

    _makeLabel(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(19, 29, 39, 0.80)';
        ctx.fillRect(40, 42, 944, 170);
        ctx.strokeStyle = 'rgba(79, 208, 255, 0.75)';
        ctx.lineWidth = 5;
        ctx.strokeRect(40, 42, 944, 170);
        ctx.fillStyle = '#dff7ff';
        ctx.font = '900 86px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 512, 128);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        this._textures.push(texture);

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this._materials.push(material);

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.45), material);
        this._tag(mesh, {
            isGameplayDecoration: true,
            noCastShadow: true,
            noReceiveShadow: true
        });
        return mesh;
    }

    _makeWall(name, size, position, material) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(size.x, size.y, size.z),
            material
        );
        mesh.name = name;
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this._tag(mesh, {
            static: true,
            physicsShape: 'box',
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            horizontalBlocking: true,
            physicsSize: [size.x, size.y, size.z],
            noTraversal: true,
            friction: 0.78,
            restitution: 0.02
        });
        mesh.geometry.computeBoundingBox();
        mesh.updateMatrixWorld(true);
        mesh.userData.collider = new THREE.Box3().setFromObject(mesh);
        this.root.add(mesh);
        this.collidableMeshes.push(mesh);
        window.SMPlayerCollisionRegistry?.registerObject?.(mesh, {
            collisionLayer: 'world-static',
            bodyType: 'static',
            physicsShape: 'box',
            traversalType: false
        });
        return mesh;
    }

    build() {
        if (this._built) return this.getZone();
        this._built = true;

        const { center, width, length, rimHeight, waterY } = this.options;

        const deckMaterial = new THREE.MeshStandardMaterial({
            color: 0x8c939c,
            roughness: 0.92,
            metalness: 0.0
        });
        const edgeMaterial = new THREE.MeshStandardMaterial({
            color: 0x4f5660,
            roughness: 0.9,
            metalness: 0.0
        });
        const basinMaterial = new THREE.MeshStandardMaterial({
            color: 0x233642,
            roughness: 0.7,
            metalness: 0.0
        });
        const waterMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x2a91b8,
            roughness: 0.18,
            metalness: 0.0,
            transparent: true,
            opacity: 0.72,
            transmission: 0.10,
            thickness: 0.7,
            clearcoat: 0.55,
            clearcoatRoughness: 0.22,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this._materials.push(deckMaterial, edgeMaterial, basinMaterial, waterMaterial);

        const cx = center.x;
        const cz = center.z;
        const rim = 0.65;

        // Raised basin floor. Main sample floor remains intact under it.
        const basin = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.14, length),
            basinMaterial
        );
        basin.name = 'SMSwimPoolBasin';
        basin.position.set(cx, 0.07, cz);
        basin.receiveShadow = true;
        this._tag(basin, {
            static: true,
            physicsShape: 'box',
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            horizontalBlocking: false,
            noTraversal: true
        });
        this.root.add(basin);

        // Four pool rims. One small opening is left on the near edge so the
        // sample character can enter the water without needing a climb system.
        const sideThickness = 0.5;
        this._makeWall(
            'SMSwimPoolWallLeft',
            new THREE.Vector3(sideThickness, rimHeight, length + rim * 2),
            new THREE.Vector3(cx - width * 0.5 - rim * 0.5, rimHeight * 0.5, cz),
            edgeMaterial
        );
        this._makeWall(
            'SMSwimPoolWallRight',
            new THREE.Vector3(sideThickness, rimHeight, length + rim * 2),
            new THREE.Vector3(cx + width * 0.5 + rim * 0.5, rimHeight * 0.5, cz),
            edgeMaterial
        );
        this._makeWall(
            'SMSwimPoolWallFar',
            new THREE.Vector3(width + rim * 2, rimHeight, sideThickness),
            new THREE.Vector3(cx, rimHeight * 0.5, cz - length * 0.5 - rim * 0.5),
            edgeMaterial
        );

        // Near wall split into two pieces, forming a 3.4m entry opening.
        const opening = 3.4;
        const segmentWidth = (width - opening) * 0.5;
        this._makeWall(
            'SMSwimPoolWallNearLeft',
            new THREE.Vector3(segmentWidth, rimHeight, sideThickness),
            new THREE.Vector3(
                cx - opening * 0.5 - segmentWidth * 0.5,
                rimHeight * 0.5,
                cz + length * 0.5 + rim * 0.5
            ),
            edgeMaterial
        );
        this._makeWall(
            'SMSwimPoolWallNearRight',
            new THREE.Vector3(segmentWidth, rimHeight, sideThickness),
            new THREE.Vector3(
                cx + opening * 0.5 + segmentWidth * 0.5,
                rimHeight * 0.5,
                cz + length * 0.5 + rim * 0.5
            ),
            edgeMaterial
        );

        // Entry ramp bridging world floor to water surface.
        const ramp = new THREE.Mesh(
            new THREE.BoxGeometry(opening, 0.12, 3.2),
            deckMaterial
        );
        ramp.name = 'SMSwimPoolEntryRamp';
        ramp.position.set(cx, 0.14, cz + length * 0.5 + 1.55);
        ramp.rotation.x = THREE.MathUtils.degToRad(-4.5);
        ramp.castShadow = true;
        ramp.receiveShadow = true;
        this._tag(ramp, {
            static: true,
            physicsShape: 'box',
            collisionEnabled: true,
            collisionLayer: 'world-static',
            bodyType: 'static',
            horizontalBlocking: false,
            noTraversal: true
        });
        this.root.add(ramp);
        this.collidableMeshes.push(ramp);

        // Water surface.
        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(width - 0.65, length - 0.65, 1, 1),
            waterMaterial
        );
        water.name = 'SMGameplaySampleWater';
        water.rotation.x = -Math.PI / 2;
        water.position.set(cx, waterY, cz);
        water.renderOrder = 2;
        water.receiveShadow = false;
        this._tag(water, {
            isWater: true,
            isWaterSurface: true,
            isSwimZone: true,
            collisionEnabled: false,
            noTraversal: true
        });
        this.root.add(water);
        this.waterMesh = water;

        // Decorative lane lines / shallow steps.
        for (const offset of [-5.5, -1.8, 1.8, 5.5]) {
            const line = new THREE.Mesh(
                new THREE.BoxGeometry(0.045, 0.02, length - 1.0),
                new THREE.MeshBasicMaterial({ color: 0x7ddbf6 })
            );
            line.position.set(cx + offset, waterY + 0.012, cz);
            line.material.transparent = true;
            line.material.opacity = 0.45;
            line.material.depthWrite = false;
            this._materials.push(line.material);
            this._tag(line, { isGameplayDecoration: true, noCastShadow: true });
            this.root.add(line);
        }

        // Label facing the spawn area.
        const label = this._makeLabel('SWIM ZONE');
        label.position.set(cx, 2.0, cz + length * 0.5 + 0.85);
        label.rotation.y = Math.PI;
        this.root.add(label);

        // Ladder-like visual on far side.
        const railMat = new THREE.MeshStandardMaterial({
            color: 0xd8a943,
            roughness: 0.45,
            metalness: 0.55
        });
        this._materials.push(railMat);
        for (const lx of [-0.5, 0.5]) {
            const rail = new THREE.Mesh(
                new THREE.CylinderGeometry(0.045, 0.045, 1.45, 12),
                railMat
            );
            rail.position.set(cx + lx, 0.75, cz - length * 0.5 + 0.35);
            rail.castShadow = true;
            this.root.add(rail);
        }

        this.volume = new THREE.Box3(
            new THREE.Vector3(cx - width * 0.5 + 0.35, -0.5, cz - length * 0.5 + 0.35),
            new THREE.Vector3(cx + width * 0.5 - 0.35, 2.2, cz + length * 0.5 - 0.35)
        );

        this.root.userData.waterVolume = this.volume.clone();
        this.root.userData.waterY = waterY;
        this.root.userData.swimRootY = this.options.swimRootY;

        this.root.visible = false;
        this.scene?.add?.(this.root);

        return this.getZone();
    }

    registerToWorld(world) {
        if (!world) return false;
        if (!Array.isArray(world.collidableMeshes)) world.collidableMeshes = [];

        for (const mesh of this.collidableMeshes) {
            if (!world.collidableMeshes.includes(mesh)) {
                world.collidableMeshes.push(mesh);
            }
        }

        world.swimmingZone = this;
        world.waterVolume = this.volume;
        world.waterMesh = this.waterMesh;
        return true;
    }

    containsPoint(point) {
        if (!this.volume || !point) return false;
        return (
            point.x >= this.volume.min.x && point.x <= this.volume.max.x &&
            point.z >= this.volume.min.z && point.z <= this.volume.max.z
        );
    }

    getSwimRootY() {
        return this.options.swimRootY;
    }

    getWaterY() {
        return this.options.waterY;
    }

    setVisible(visible) {
        this.root.visible = !!visible;
    }

    getZone() {
        return {
            root: this.root,
            waterMesh: this.waterMesh,
            volume: this.volume,
            collidableMeshes: this.collidableMeshes,
            waterY: this.options.waterY,
            swimRootY: this.options.swimRootY
        };
    }

    dispose() {
        const geometries = new Set();
        this.root.traverse(object => {
            if (object.geometry) geometries.add(object.geometry);
        });
        geometries.forEach(g => g?.dispose?.());
        this._materials.forEach(m => m?.dispose?.());
        this._textures.forEach(t => t?.dispose?.());
        this.root.parent?.remove(this.root);
        this.root.clear?.();
        this.collidableMeshes.length = 0;
        this.waterMesh = null;
        this.volume = null;
        this._built = false;
    }
}

window.SMGameplaySampleSwimmingZone = SMGameplaySampleSwimmingZone;


/* ===== SMUniversalPlayerCharacter.js V2 ===== */

/**
 * SMUniversalPlayerCharacter.js
 *
 * Self-contained Universal Animation Library player runtime for the
 * Universal Player Sample mode.
 */
class SMUniversalPlayerCharacter {
    constructor(scene, camera, world, swimmingZone, config = {}) {
        this.scene = scene;
        this.camera = camera || window.camera || null;
        this.world = world || null;
        this.swimmingZone = swimmingZone || null;
        this.config = {
            targetHeight: 1.80,
            spawn: [0, 0, 5],
            visualForwardOffset: Math.PI,
            walkSpeed: 1.8,
            runSpeed: 4.2,
            sprintSpeed: 6.5,
            crouchSpeed: 1.15,
            swimSpeed: 2.4,
            turnSharpness: 14,

            trajectoryHorizon: 1.10,
            trajectorySamples: 28,
            trajectoryTurnRateDeg: 235,
            accelerationSharpness: 9.5,
            decelerationSharpness: 13.0,

            gravity: -13.0,
            jumpVelocity: 5.1,
            crossfade: 0.16,
            autoRollMaxHeight: 0.80,
            autoRollDistance: 1.05,
            ...config
        };

        this.model = null;
        this.mixer = null;
        this.actions = new Map();
        this.clips = new Map();
        this.currentAction = null;
        this.currentClipName = '';

        this.active = false;
        this.loaded = false;
        this.keys = new Set();
        this.edge = {
            roll: false,
            jump: false,
            interact: false,
            crouch: false
        };

        this.state = 'loading';
        this.speed = 0;
        this.verticalVelocity = 0;
        this.groundY = 0;
        this.crouched = false;
        this.swimming = false;
        this.seated = false;
        this.busy = null;
        this.busyTime = 0;
        this.rollData = null;
        this.seatData = null;
        this.jumpPhase = 'grounded';

        this._raycaster = new THREE.Raycaster();
        this._box = new THREE.Box3();
        this._size = new THREE.Vector3();
        this._moveDir = new THREE.Vector3();
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._previousPlayerModel = null;

        // True only when this character itself replaced window.playerModel.
        this._ownsGlobalPlayerModel = false;

        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onKeyUp = this._handleKeyUp.bind(this);

        // Independent mode owns these gameplay inputs while active.
        this._controlledKeys = new Set([
            'KeyW', 'KeyA', 'KeyS', 'KeyD',
            'ShiftLeft', 'ShiftRight',
            'AltLeft', 'AltRight',
            'ControlLeft', 'ControlRight',
            'Space', 'KeyC', 'KeyE'
        ]);

        // V2.5 — package input gate injects keys here.
        this.externalInputGate = false;

        this._trajectoryLine = null;
        this._trajectoryGeometry = null;
        this._trajectoryMaterial = null;

        this._steeringDirection =
            new THREE.Vector3(0, 0, -1);

        this._currentMoveSpeed = 0;
    }

    async init(animationConfig = {}) {
        if (this.loaded) return this.model;
        const candidates = Array.isArray(animationConfig.candidates)
            ? animationConfig.candidates
            : [];

        if (!candidates.length) {
            throw new Error('[Universal Player] No UAL1_Standard.glb candidate paths configured.');
        }

        const Loader = window.GLTFLoader || THREE.GLTFLoader || window.THREE?.GLTFLoader;
        if (!Loader) {
            throw new Error('[Universal Player] GLTFLoader is not available globally.');
        }

        const loader = new Loader();
        let gltf = null;
        let loadedURL = null;
        let lastError = null;

        for (const url of candidates) {
            try {
                gltf = typeof loader.loadAsync === 'function'
                    ? await loader.loadAsync(url)
                    : await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
                loadedURL = url;
                break;
            } catch (error) {
                lastError = error;
            }
        }

        if (!gltf) {
            throw new Error(
                `[Universal Player] Could not load UAL1_Standard.glb from configured paths. ${lastError?.message || ''}`
            );
        }

        this.model = gltf.scene;
        this.model.name = 'SMUniversalPlayerCharacter';
        this.model.userData = {
            ...(this.model.userData || {}),
            isSystemObject: true,
            isGameplaySample: true,
            isPlayer: true,
            isPlayerRoot: true,
            workspaceOnly: 'GAMEPLAY_SAMPLE',
            sourceAnimationLibrary: 'Universal Animation Library 1',
            sourceURL: loadedURL
        };

        this._normalizeHeight(this.model, this.config.targetHeight);
        this.model.position.set(...this.config.spawn);
        this.groundY = this.model.position.y;

        this.model.traverse(object => {
            if (!object.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
            if (object.isSkinnedMesh) object.frustumCulled = false;
        });

        this.scene.add(this.model);
        this.model.visible = false;

        this._createTrajectoryDebug();

        this.mixer = new THREE.AnimationMixer(this.model);
        for (const clip of gltf.animations || []) {
            this.clips.set(clip.name, clip);
        }

        this.loaded = true;
        this.state = 'idle';
        this._play('Idle_Loop', { immediate: true });

        console.log('[Universal Player] UAL character ready:', {
            url: loadedURL,
            clips: [...this.clips.keys()]
        });

        return this.model;
    }

    _normalizeHeight(root, targetHeight) {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        if (!Number.isFinite(size.y) || size.y < 0.001) return;

        root.scale.multiplyScalar(targetHeight / size.y);
        root.updateMatrixWorld(true);
        const placed = new THREE.Box3().setFromObject(root);
        root.position.y -= placed.min.y;
        root.updateMatrixWorld(true);
    }

    setExternalInputGate(enabled) {
        this.externalInputGate =
            !!enabled;

        if (this.externalInputGate) {
            window.removeEventListener(
                'keydown',
                this._onKeyDown,
                true
            );

            window.removeEventListener(
                'keyup',
                this._onKeyUp,
                true
            );
        }

        this.clearInputKeys();
    }

    setInputKey(code, down, repeat = false) {
        if (!this._controlledKeys.has(code)) {
            return;
        }

        if (down) {
            this.keys.add(code);

            if (!repeat) {
                if (
                    code === 'ControlLeft' ||
                    code === 'ControlRight'
                ) {
                    this.edge.roll = true;
                }

                if (code === 'Space') {
                    this.edge.jump = true;
                }

                if (code === 'KeyE') {
                    this.edge.interact = true;
                }

                if (code === 'KeyC') {
                    this.edge.crouch = true;
                }
            }
        } else {
            this.keys.delete(code);
        }
    }

    clearInputKeys() {
        this.keys.clear();

        for (const key of Object.keys(this.edge)) {
            this.edge[key] = false;
        }
    }

    activate() {
        if (!this.loaded || this.active) return;
        this.active = true;
        this.model.visible = true;
        this.model.position.set(...this.config.spawn);
        this.groundY = this.model.position.y;
        this.verticalVelocity = 0;
        this.busy = null;
        this.seated = false;
        this.swimming = false;
        this.crouched = false;
        this._previousPlayerModel =
            window.playerModel ||
            null;

        /**
         * V2.8 CRITICAL FIX
         * -----------------
         * When the package uses its own input gate, NEVER replace
         * window.playerModel. The SM Engine default controller may be
         * watching that global and would otherwise start controlling the
         * Universal model at the same time as this package.
         */
        this._ownsGlobalPlayerModel =
            !this.externalInputGate;

        if (
            this._ownsGlobalPlayerModel
        ) {
            window.playerModel =
                this.model;
        }

        window.universalPlayer =
            this;

        if (!this.externalInputGate) {
            window.addEventListener(
                'keydown',
                this._onKeyDown,
                true
            );

            window.addEventListener(
                'keyup',
                this._onKeyUp,
                true
            );
        }

        this._setTrajectoryVisible(true);
        this._play('Idle_Loop', { immediate: true });
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.keys.clear();
        window.removeEventListener('keydown', this._onKeyDown, true);
        window.removeEventListener('keyup', this._onKeyUp, true);
        if (this.model) this.model.visible = false;

        this._setTrajectoryVisible(false);
        this.clearInputKeys();

        if (
            this._ownsGlobalPlayerModel &&
            window.playerModel ===
                this.model
        ) {
            window.playerModel =
                this._previousPlayerModel;
        }

        this._ownsGlobalPlayerModel =
            false;

        if (
            window.universalPlayer ===
            this
        ) {
            window.universalPlayer =
                null;
        }
    }

    _handleKeyDown(event) {
        const tag = event.target?.tagName?.toLowerCase?.() || '';

        if (
            tag === 'input' ||
            tag === 'textarea' ||
            tag === 'select' ||
            event.target?.isContentEditable
        ) {
            return;
        }

        if (!this._controlledKeys.has(event.code)) {
            return;
        }

        // Stop old/foreign gameplay controllers from receiving this key.
        event.stopImmediatePropagation();
        event.preventDefault();

        this.keys.add(event.code);

        if (event.repeat) return;

        if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
            this.edge.roll = true;
        }

        if (event.code === 'Space') {
            this.edge.jump = true;
        }

        if (event.code === 'KeyE') {
            this.edge.interact = true;
        }

        if (event.code === 'KeyC') {
            this.edge.crouch = true;
        }
    }

    _handleKeyUp(event) {
        if (!this._controlledKeys.has(event.code)) {
            return;
        }

        event.stopImmediatePropagation();
        event.preventDefault();

        this.keys.delete(event.code);
    }

    _consume(name) {
        const value = !!this.edge[name];
        this.edge[name] = false;
        return value;
    }

    _play(name, options = {}) {
        const clip = this.clips.get(name);
        if (!clip || !this.mixer) return null;

        // Do not restart looping locomotion clips every frame.
        if (!options.force && this.currentClipName === name && this.currentAction) {
            return { action: this.currentAction, clip };
        }

        let action = this.actions.get(name);
        if (!action) {
            action = this.mixer.clipAction(clip);
            this.actions.set(name, action);
        }

        action.enabled = true;
        action.clampWhenFinished = !!options.clampWhenFinished;
        action.setEffectiveTimeScale(options.timeScale || 1);
        action.setEffectiveWeight(1);
        action.setLoop(options.loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, options.loopOnce ? 1 : Infinity);
        action.reset().play();

        if (this.currentAction && this.currentAction !== action) {
            const fade = options.immediate ? 0 : (options.fade ?? this.config.crossfade);
            if (fade > 0) this.currentAction.crossFadeTo(action, fade, true);
            else this.currentAction.stop();
        }

        this.currentAction = action;
        this.currentClipName = name;
        return { action, clip };
    }

    _clipDuration(name, fallback = 0.7) {
        return THREE.MathUtils.clamp(this.clips.get(name)?.duration || fallback, 0.15, 2.5);
    }

    _getMovementInput() {
        const x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
        const z = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
        const moving = x !== 0 || z !== 0;

        this._moveDir.set(0, 0, 0);
        if (!moving) return { moving: false, direction: this._moveDir, x, z };

        if (this.camera) {
            this.camera.getWorldDirection(this._forward);
            this._forward.y = 0;
            if (this._forward.lengthSq() < 0.001) this._forward.set(0, 0, -1);
            this._forward.normalize();
            this._right.crossVectors(this._forward, THREE.Object3D.DEFAULT_UP).normalize();
            this._moveDir.addScaledVector(this._forward, z);
            this._moveDir.addScaledVector(this._right, x);
        } else {
            this._moveDir.set(x, 0, -z);
        }

        if (this._moveDir.lengthSq() > 0.001) this._moveDir.normalize();
        return { moving: true, direction: this._moveDir, x, z };
    }

    _createTrajectoryDebug() {
        if (this._trajectoryLine) {
            return;
        }

        this._trajectoryGeometry =
            new THREE.BufferGeometry();

        this._trajectoryMaterial =
            new THREE.LineBasicMaterial({
                color: 0x54d7ff,
                transparent: true,
                opacity: 0.86,
                depthTest: true
            });

        this._trajectoryLine =
            new THREE.Line(
                this._trajectoryGeometry,
                this._trajectoryMaterial
            );

        this._trajectoryLine.name =
            'SMUniversalPlayer_CurvedTrajectory';

        this._trajectoryLine.visible = false;
        this._trajectoryLine.frustumCulled = false;

        this.scene.add(
            this._trajectoryLine
        );
    }

    _setTrajectoryVisible(visible) {
        if (this._trajectoryLine) {
            this._trajectoryLine.visible =
                !!visible;
        }
    }

    _logicalYawFromDirection(direction) {
        return Math.atan2(
            direction.x,
            -direction.z
        );
    }

    _directionFromLogicalYaw(
        yaw,
        target = new THREE.Vector3()
    ) {
        return target.set(
            Math.sin(yaw),
            0,
            -Math.cos(yaw)
        );
    }

    _angleDelta(target, current) {
        return Math.atan2(
            Math.sin(target - current),
            Math.cos(target - current)
        );
    }

    _updateCurvedTrajectory(
        movement,
        speed
    ) {
        if (
            !this.model ||
            !this._trajectoryGeometry
        ) {
            return;
        }

        const start =
            this.model.position.clone();

        start.y += 0.035;

        const currentYaw =
            this.getLogicalYaw();

        const targetYaw =
            movement?.moving
                ? this._logicalYawFromDirection(
                    movement.direction
                )
                : currentYaw;

        const yawDiff =
            this._angleDelta(
                targetYaw,
                currentYaw
            );

        const horizon =
            Math.max(
                0.35,
                this.config.trajectoryHorizon
            );

        const travel =
            Math.max(
                0.85,
                Math.max(
                    speed,
                    this.config.walkSpeed
                ) * horizon
            );

        const controls = [
            start.clone()
        ];

        let cursor =
            start.clone();

        const segments = 7;

        for (
            let i = 1;
            i <= segments;
            i++
        ) {
            const t =
                i / segments;

            const smooth =
                t * t * (3 - 2 * t);

            const yaw =
                currentYaw +
                yawDiff * smooth;

            const direction =
                this._directionFromLogicalYaw(
                    yaw
                );

            cursor =
                cursor.clone()
                    .addScaledVector(
                        direction,
                        travel / segments
                    );

            controls.push(
                cursor
            );
        }

        const curve =
            new THREE.CatmullRomCurve3(
                controls,
                false,
                'centripetal',
                0.5
            );

        const samples =
            curve.getPoints(
                Math.max(
                    12,
                    this.config.trajectorySamples | 0
                )
            );

        this._trajectoryGeometry
            .setFromPoints(samples);

        this._trajectoryGeometry
            .computeBoundingSphere?.();
    }

    _applyCurvedFacing(
        desiredDirection,
        delta
    ) {
        if (
            !desiredDirection ||
            desiredDirection.lengthSq() < 0.0001 ||
            !this.model
        ) {
            return this._steeringDirection;
        }

        const currentYaw =
            this.getLogicalYaw();

        const targetYaw =
            this._logicalYawFromDirection(
                desiredDirection
            );

        const deltaYaw =
            this._angleDelta(
                targetYaw,
                currentYaw
            );

        const maxTurn =
            THREE.MathUtils.degToRad(
                this.config.trajectoryTurnRateDeg
            ) *
            Math.max(delta, 0);

        const nextYaw =
            currentYaw +
            THREE.MathUtils.clamp(
                deltaYaw,
                -maxTurn,
                maxTurn
            );

        this.model.rotation.y =
            this.config.visualForwardOffset -
            nextYaw;

        this._directionFromLogicalYaw(
            nextYaw,
            this._steeringDirection
        );

        this._steeringDirection.normalize();

        return this._steeringDirection;
    }

    _faceDirection(direction, delta) {
        if (!direction || direction.lengthSq() < 0.001 || !this.model) return;
        const logicalYaw = Math.atan2(direction.x, -direction.z);
        const targetYaw = this.config.visualForwardOffset - logicalYaw;
        const current = this.model.rotation.y;
        const diff = Math.atan2(Math.sin(targetYaw - current), Math.cos(targetYaw - current));
        const alpha = 1 - Math.exp(-this.config.turnSharpness * Math.max(delta, 0));
        this.model.rotation.y = current + diff * alpha;
    }

    getLogicalYaw() {
        if (!this.model) return 0;

        const yaw =
            this.config.visualForwardOffset -
            this.model.rotation.y;

        return Math.atan2(
            Math.sin(yaw),
            Math.cos(yaw)
        );
    }

    getForwardDirection(
        target = new THREE.Vector3()
    ) {
        const yaw =
            this.getLogicalYaw();

        target.set(
            Math.sin(yaw),
            0,
            -Math.cos(yaw)
        );

        if (
            target.lengthSq() <
            0.0001
        ) {
            target.set(
                0,
                0,
                -1
            );
        }

        return target.normalize();
    }

    _nearestBench(maxDistance = 1.6) {
        if (!this.world?.root || !this.model) return null;
        let best = null;
        let bestDistance = maxDistance;
        const playerPos = this.model.position;

        this.world.root.traverse(object => {
            if (object.name !== 'SMGameplayParkBench' && object.userData?.interactionType !== 'seat') return;
            const pos = new THREE.Vector3();
            object.getWorldPosition(pos);
            const distance = pos.distanceTo(playerPos);
            if (distance < bestDistance) {
                best = object;
                bestDistance = distance;
            }
        });
        return best;
    }

    _beginSit(bench) {
        if (!bench || !this.clips.has('Sitting_Enter')) return false;
        const anchor = bench.getObjectByName('SMSeatAnchor');
        const target = anchor
            ? anchor.getWorldPosition(new THREE.Vector3())
            : bench.localToWorld(new THREE.Vector3(0, 0, 0.06));

        const yaw = bench.rotation.y + (bench.userData?.seatFacingOffset ?? Math.PI);
        this.busy = 'sit-enter';
        this.busyTime = 0;
        this.seatData = {
            bench,
            start: this.model.position.clone(),
            target,
            startYaw: this.model.rotation.y,
            targetYaw: yaw,
            duration: this._clipDuration('Sitting_Enter', 0.75)
        };
        this._play('Sitting_Enter', { loopOnce: true, clampWhenFinished: true });
        return true;
    }

    _beginStand() {
        if (!this.seatData) return false;
        const bench = this.seatData.bench;
        const exitAnchor = bench?.getObjectByName('SMSeatExitAnchor');
        const target = exitAnchor
            ? exitAnchor.getWorldPosition(new THREE.Vector3())
            : bench.localToWorld(new THREE.Vector3(0, 0, 0.95));

        this.busy = 'sit-exit';
        this.busyTime = 0;
        this.seatData.exitStart = this.model.position.clone();
        this.seatData.exitTarget = target;
        this.seatData.exitDuration = this._clipDuration('Sitting_Exit', 0.65);
        this._play('Sitting_Exit', { loopOnce: true, clampWhenFinished: true });
        return true;
    }

    _updateSeat(delta) {
        if (!this.busy?.startsWith('sit') && !this.seated) return false;

        if (this.busy === 'sit-enter') {
            this.busyTime += delta;
            const d = this.seatData.duration;
            const t = THREE.MathUtils.clamp(this.busyTime / d, 0, 1);
            const s = t * t * (3 - 2 * t);
            this.model.position.lerpVectors(this.seatData.start, this.seatData.target, s);
            const diff = Math.atan2(
                Math.sin(this.seatData.targetYaw - this.seatData.startYaw),
                Math.cos(this.seatData.targetYaw - this.seatData.startYaw)
            );
            this.model.rotation.y = this.seatData.startYaw + diff * s;
            this.state = 'sitting-enter';

            if (t >= 1) {
                this.busy = null;
                this.seated = true;
                this.state = 'seated';
                this._play('Sitting_Idle_Loop');
            }
            return true;
        }

        if (this.busy === 'sit-exit') {
            this.busyTime += delta;
            const d = this.seatData.exitDuration;
            const t = THREE.MathUtils.clamp(this.busyTime / d, 0, 1);
            const s = t * t * (3 - 2 * t);
            this.model.position.lerpVectors(this.seatData.exitStart, this.seatData.exitTarget, s);
            this.state = 'sitting-exit';
            if (t >= 1) {
                this.busy = null;
                this.seated = false;
                this.seatData = null;
                this.groundY = this.model.position.y;
                this.state = 'idle';
                this._play('Idle_Loop');
            }
            return true;
        }

        if (this.seated) {
            this.state = 'seated';
            if (this._consume('interact') || this._consume('jump')) this._beginStand();
            return true;
        }

        return false;
    }

    _detectLowObstacle(direction) {
        if (!this.world?.traversalMeshes?.length || !direction || direction.lengthSq() < 0.001) return null;
        const origin = this.model.position.clone();
        origin.y += 0.35;
        this._raycaster.set(origin, direction.clone().normalize());
        this._raycaster.far = this.config.autoRollDistance;
        const hits = this._raycaster.intersectObjects(this.world.traversalMeshes, false);
        if (!hits.length) return null;

        const hit = hits[0];
        const object = hit.object;
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > this.config.autoRollMaxHeight) return null;
        return { object, hit, box, size };
    }

    _beginRoll(direction, obstacle = null) {
        if (!this.clips.has('Roll')) return false;
        const dir = direction?.clone?.() || new THREE.Vector3(0, 0, -1);
        dir.y = 0;
        if (dir.lengthSq() < 0.001) {
            const yaw = this.config.visualForwardOffset - this.model.rotation.y;
            dir.set(Math.sin(yaw), 0, -Math.cos(yaw));
        }
        dir.normalize();

        const duration = this._clipDuration('Roll', 0.75);
        const start = this.model.position.clone();
        let distance = 1.55;
        let arc = 0.12;
        if (obstacle) {
            const depth = Math.abs(dir.x) * obstacle.size.x + Math.abs(dir.z) * obstacle.size.z;
            distance = Math.max(1.55, obstacle.hit.distance + depth + 0.72);
            arc = THREE.MathUtils.clamp(0.10 + obstacle.size.y * 0.16, 0.12, 0.24);
        }

        this.busy = 'roll';
        this.busyTime = 0;
        this.rollData = {
            start,
            end: start.clone().addScaledVector(dir, distance),
            duration,
            groundY: this.groundY,
            arc
        };
        this._faceDirection(dir, 1);
        this._play('Roll', { loopOnce: true, clampWhenFinished: true, fade: 0.08 });
        return true;
    }

    _updateRoll(delta) {
        if (this.busy !== 'roll') return false;
        this.busyTime += delta;
        const r = this.rollData;
        const t = THREE.MathUtils.clamp(this.busyTime / r.duration, 0, 1);
        const s = t * t * t * (t * (t * 6 - 15) + 10);
        this.model.position.lerpVectors(r.start, r.end, s);
        this.model.position.y = r.groundY + Math.sin(Math.PI * t) * r.arc;
        this.state = 'roll';
        this.speed = r.end.distanceTo(r.start) / r.duration;

        if (t >= 1) {
            this.model.position.copy(r.end);
            this.model.position.y = r.groundY;
            this.busy = null;
            this.rollData = null;
            this.state = 'idle';
            this._play('Idle_Loop', { fade: 0.08 });
        }
        return true;
    }

    _beginJump() {
        if (this.jumpPhase !== 'grounded' || this.swimming || this.seated || this.busy) return false;
        this.jumpPhase = 'start';
        this.verticalVelocity = this.config.jumpVelocity;
        this.busyTime = 0;
        this._play('Jump_Start', { loopOnce: true, clampWhenFinished: true, fade: 0.08 });
        return true;
    }

    _updateJump(delta, movement) {
        if (this.jumpPhase === 'grounded') return false;
        this.busyTime += delta;
        this.verticalVelocity += this.config.gravity * delta;
        this.model.position.y += this.verticalVelocity * delta;
        this.state = 'jump';

        if (this.jumpPhase === 'start' && this.busyTime > Math.min(this._clipDuration('Jump_Start', 0.2), 0.3)) {
            this.jumpPhase = 'loop';
            this.busyTime = 0;
            this._play('Jump_Loop', { fade: 0.05 });
        }

        if (movement?.moving) {
            const horizontal = movement.direction.clone().multiplyScalar(this.config.runSpeed * 0.55 * delta);
            this.model.position.add(horizontal);
            this._faceDirection(movement.direction, delta);
        }

        if (this.verticalVelocity <= 0 && this.model.position.y <= this.groundY) {
            this.model.position.y = this.groundY;
            this.verticalVelocity = 0;
            this.jumpPhase = 'land';
            this.busyTime = 0;
            this._play('Jump_Land', { loopOnce: true, clampWhenFinished: true, fade: 0.05 });
        }

        if (this.jumpPhase === 'land' && this.busyTime > Math.min(this._clipDuration('Jump_Land', 0.25), 0.45)) {
            this.jumpPhase = 'grounded';
            this.busyTime = 0;
            this.state = 'idle';
            this._play('Idle_Loop', { fade: 0.08 });
        }
        return true;
    }

    _updateSwimming(delta, movement) {
        const inside = this.swimmingZone?.containsPoint?.(this.model.position) === true;
        if (!inside && !this.swimming) return false;

        if (inside && !this.swimming) {
            this.swimming = true;
            this.verticalVelocity = 0;
            this.jumpPhase = 'grounded';
            this.busy = null;
        }

        if (this.swimming) {
            if (!inside) {
                this.swimming = false;
                this.model.position.y = this.groundY;
                this._play('Idle_Loop');
                return false;
            }

            this.model.position.y = this.swimmingZone.getSwimRootY?.() ?? 0.16;
            this.state = movement.moving ? 'swim-forward' : 'swim-idle';
            this.speed = movement.moving ? this.config.swimSpeed : 0;
            this._play(movement.moving ? 'Swim_Fwd_Loop' : 'Swim_Idle_Loop');

            if (movement.moving) {
                const displacement = movement.direction.clone().multiplyScalar(this.config.swimSpeed * delta);
                this.model.position.add(displacement);
                this._faceDirection(movement.direction, delta);
                return displacement;
            }
            return new THREE.Vector3();
        }
        return false;
    }

    _updateGroundLocomotion(delta, movement) {
        if (this._consume('crouch')) {
            this.crouched = !this.crouched;
        }

        const walkModifier =
            this.keys.has('AltLeft') ||
            this.keys.has('AltRight');

        const sprint =
            this.keys.has('ShiftLeft') ||
            this.keys.has('ShiftRight');

        let targetSpeed = 0;
        let clip =
            this.crouched
                ? 'Crouch_Idle_Loop'
                : 'Idle_Loop';

        let state =
            this.crouched
                ? 'crouch-idle'
                : 'idle';

        if (movement.moving) {
            if (this.crouched) {
                targetSpeed =
                    this.config.crouchSpeed;

                clip = 'Crouch_Fwd_Loop';
                state = 'crouch';
            } else if (sprint) {
                targetSpeed =
                    this.config.sprintSpeed;

                clip = 'Sprint_Loop';
                state = 'sprint';
            } else if (walkModifier) {
                targetSpeed =
                    this.config.walkSpeed;

                clip = 'Walk_Loop';
                state = 'walk';
            } else {
                targetSpeed =
                    this.config.runSpeed;

                clip = 'Jog_Fwd_Loop';
                state = 'run';
            }
        }

        const speedSharpness =
            targetSpeed >
            this._currentMoveSpeed
                ? this.config.accelerationSharpness
                : this.config.decelerationSharpness;

        const speedAlpha =
            1 -
            Math.exp(
                -speedSharpness *
                Math.max(delta, 0)
            );

        this._currentMoveSpeed =
            THREE.MathUtils.lerp(
                this._currentMoveSpeed,
                targetSpeed,
                speedAlpha
            );

        if (
            !movement.moving &&
            this._currentMoveSpeed < 0.035
        ) {
            this._currentMoveSpeed = 0;
        }

        this.state = state;
        this.speed =
            this._currentMoveSpeed;

        this._play(clip);

        this._updateCurvedTrajectory(
            movement,
            Math.max(
                targetSpeed,
                this._currentMoveSpeed
            )
        );

        if (
            !movement.moving ||
            this._currentMoveSpeed <= 0
        ) {
            return new THREE.Vector3();
        }

        const steering =
            this._applyCurvedFacing(
                movement.direction,
                delta
            );

        const displacement =
            steering.clone()
                .multiplyScalar(
                    this._currentMoveSpeed *
                    delta
                );

        this.model.position.add(
            displacement
        );

        return displacement;
    }

    update(delta) {
        if (!this.active || !this.loaded || !this.model) return null;
        const dt = Math.min(Math.max(Number(delta) || 0, 0), 0.05);
        this.mixer?.update?.(dt);

        const movement = this._getMovementInput();

        if (this._updateSeat(dt)) return this._snapshot(new THREE.Vector3());
        if (this._updateRoll(dt)) return this._snapshot(new THREE.Vector3());

        if (this._consume('interact')) {
            const bench = this._nearestBench();
            if (bench && this._beginSit(bench)) return this._snapshot(new THREE.Vector3());
        }

        if (this._consume('roll')) {
            this._beginRoll(movement.direction);
            return this._snapshot(new THREE.Vector3());
        }

        if (this._consume('jump')) this._beginJump();
        if (this._updateJump(dt, movement)) return this._snapshot(new THREE.Vector3());

        const swimDisplacement = this._updateSwimming(dt, movement);
        if (swimDisplacement !== false) return this._snapshot(swimDisplacement || new THREE.Vector3());

        // Contextual auto-roll for <= 0.80m traversal objects.
        if (movement.moving && !this.crouched) {
            const obstacle = this._detectLowObstacle(movement.direction);
            if (obstacle && this._beginRoll(movement.direction, obstacle)) {
                return this._snapshot(new THREE.Vector3());
            }
        }

        const displacement = this._updateGroundLocomotion(dt, movement);
        return this._snapshot(displacement);
    }

    _snapshot(displacement) {
        return {
            state: this.state,
            speed: this.speed,
            crouched: this.crouched,
            swimming: this.swimming,
            seated: this.seated,
            jumpPhase: this.jumpPhase,
            clip: this.currentClipName,
            displacement: displacement?.clone?.() || new THREE.Vector3(),
            position: this.model?.position?.clone?.() || new THREE.Vector3()
        };
    }

    getContextHint() {
        if (this.seated) return 'E / Space · Stand';
        if (this.swimming) return 'Swimming Zone';
        const bench = this._nearestBench(1.8);
        if (bench) return 'E · Sit';
        return '';
    }

    dispose() {
        this.deactivate();
        this.mixer?.stopAllAction?.();
        if (this.model) {
            this.model.parent?.remove(this.model);
            const geometries = new Set();
            const materials = new Set();
            this.model.traverse(object => {
                if (object.geometry) geometries.add(object.geometry);
                const mats = Array.isArray(object.material) ? object.material : [object.material];
                mats.forEach(material => material && materials.add(material));
            });
            geometries.forEach(g => g?.dispose?.());
            materials.forEach(m => m?.dispose?.());
        }
        this._trajectoryLine
            ?.parent
            ?.remove?.(
                this._trajectoryLine
            );

        this._trajectoryGeometry
            ?.dispose?.();

        this._trajectoryMaterial
            ?.dispose?.();

        this._trajectoryLine = null;
        this._trajectoryGeometry = null;
        this._trajectoryMaterial = null;

        this.actions.clear();
        this.clips.clear();
        this.model = null;
        this.mixer = null;
        this.loaded = false;
    }
}

window.SMUniversalPlayerCharacter = SMUniversalPlayerCharacter;


/* ===== SMUniversalPlayerHUD.js V2 ===== */

/**
 * SMUniversalPlayerHUD.js
 * Viewport-local sample HUD.
 *
 * IMPORTANT:
 * This HUD is mounted inside renderer.domElement.parentElement.
 * It never uses document.body + position:fixed, so it cannot cover
 * SM Engine menus, timeline, hierarchy, inspector, etc.
 */
class SMUniversalPlayerHUD {
    constructor(renderer = null) {
        this.renderer = renderer || window.renderer || null;
        this.root = null;
        this.stateEl = null;
        this.contextEl = null;
        this.visible = false;

        this.host = null;
        this._hostOriginalPosition = null;

        this._create();
    }

    _resolveHost() {
        const canvas =
            this.renderer?.domElement ||
            window.renderer?.domElement ||
            null;

        if (canvas?.parentElement) {
            return canvas.parentElement;
        }

        return (
            document.querySelector('#editor-scene') ||
            document.querySelector('#viewport') ||
            document.querySelector('.viewport-container') ||
            document.querySelector('.editor-viewport') ||
            document.body
        );
    }

    _create() {
        document.getElementById('smUniversalPlayerHUD')?.remove?.();
        document.getElementById('smUniversalPlayerHUDStyle')?.remove?.();

        this.host = this._resolveHost();

        if (!this.host) {
            console.warn('[Universal Player HUD] Could not resolve viewport host.');
            return;
        }

        if (this.host !== document.body) {
            const computed =
                window.getComputedStyle?.(this.host);

            if (!computed || computed.position === 'static') {
                this._hostOriginalPosition =
                    this.host.style.position || '';

                this.host.style.position =
                    'relative';
            }
        }

        const style =
            document.createElement('style');

        style.id =
            'smUniversalPlayerHUDStyle';

        style.textContent = `
            #smUniversalPlayerHUD {
                position: absolute;
                inset: 0;
                z-index: 80;
                overflow: hidden;
                pointer-events: none;
                box-sizing: border-box;
                font-family: Inter, Segoe UI, Arial, sans-serif;
                color: #eaf5fb;
            }

            #smUniversalPlayerHUD,
            #smUniversalPlayerHUD * {
                box-sizing: border-box;
            }

            #smUniversalPlayerHUD .sm-ups-panel {
                position: absolute;
                border: 1px solid rgba(125,211,252,.20);
                background: rgba(9,14,20,.76);
                box-shadow: 0 12px 34px rgba(0,0,0,.22);
                backdrop-filter: blur(8px);
            }

            #smUniversalPlayerHUD .sm-ups-title {
                font-size: 10px;
                font-weight: 800;
                letter-spacing: .07em;
                color: #dff7ff;
            }

            #smUniversalPlayerHUD .sm-ups-sub {
                margin-top: 3px;
                font-size: 7px;
                color: #79d8ff;
            }

            #smUniversalPlayerHUD .sm-ups-controls {
                right: 10px;
                top: 10px;
                width: min(195px, calc(100% - 20px));
                padding: 10px;
            }

            #smUniversalPlayerHUD .sm-ups-controls dl {
                display: grid;
                grid-template-columns: 50px 1fr;
                gap: 4px 8px;
                margin: 8px 0 0;
                font-size: 7px;
            }

            #smUniversalPlayerHUD .sm-ups-controls dt {
                color: #fff;
                font-weight: 750;
            }

            #smUniversalPlayerHUD .sm-ups-controls dd {
                margin: 0;
                color: #aeb8c4;
            }

            #smUniversalPlayerHUD .sm-ups-state {
                left: 10px;
                bottom: 10px;
                width: min(220px, calc(100% - 20px));
                padding: 10px;
            }

            #smUniversalPlayerHUD .sm-ups-state pre {
                margin: 8px 0 0;
                font: 7px/1.5 Consolas, monospace;
                color: #a8efc0;
                white-space: pre-wrap;
            }

            #smUniversalPlayerHUD .sm-ups-context {
                left: 50%;
                bottom: 18px;
                transform: translateX(-50%);
                min-width: 160px;
                max-width: calc(100% - 28px);
                padding: 8px 12px;
                text-align: center;
                font-size: 8px;
                font-weight: 750;
                color: #eaffff;
                opacity: 0;
                transition: opacity .12s ease;
            }

            #smUniversalPlayerHUD .sm-ups-badge {
                left: 50%;
                top: 10px;
                transform: translateX(-50%);
                padding: 7px 11px;
                font-size: 8px;
                font-weight: 800;
                letter-spacing: .07em;
                color: #dff8ff;
                white-space: nowrap;
            }
        `;

        document.head.appendChild(style);

        const root =
            document.createElement('div');

        root.id =
            'smUniversalPlayerHUD';

        root.style.display =
            'none';

        root.innerHTML = `
            <div class="sm-ups-panel sm-ups-badge">
                UNIVERSAL PLAYER SAMPLE
            </div>

            <section class="sm-ups-panel sm-ups-controls">
                <div class="sm-ups-title">CONTROLS</div>
                <div class="sm-ups-sub">Independent Gameplay Mode</div>

                <dl>
                    <dt>WASD</dt><dd>Move / Run</dd>
                    <dt>Alt</dt><dd>Walk</dd>
                    <dt>Shift</dt><dd>Sprint</dd>
                    <dt>Space</dt><dd>Jump</dd>
                    <dt>C</dt><dd>Crouch</dd>
                    <dt>Ctrl</dt><dd>Roll</dd>
                    <dt>E</dt><dd>Context / Sit</dd>
                </dl>
            </section>

            <section class="sm-ups-panel sm-ups-state">
                <div class="sm-ups-title">PLAYER STATE</div>
                <pre data-state>Mode: waiting</pre>
            </section>

            <div
                class="sm-ups-panel sm-ups-context"
                data-context
            ></div>
        `;

        this.host.appendChild(root);

        this.root =
            root;

        this.stateEl =
            root.querySelector(
                '[data-state]'
            );

        this.contextEl =
            root.querySelector(
                '[data-context]'
            );
    }

    show() {
        this.visible = true;

        if (this.root) {
            this.root.style.display =
                'block';
        }
    }

    hide() {
        this.visible = false;

        if (this.root) {
            this.root.style.display =
                'none';
        }
    }

    update(snapshot, contextHint = '') {
        if (!this.visible || !snapshot) {
            return;
        }

        if (this.stateEl) {
            this.stateEl.textContent = [
                `Mode:      ${snapshot.state || 'idle'}`,
                `Clip:      ${snapshot.clip || '-'}`,
                `Speed:     ${(snapshot.speed || 0).toFixed(2)} m/s`,
                `Crouched:  ${snapshot.crouched ? 'Yes' : 'No'}`,
                `Swimming:  ${snapshot.swimming ? 'Yes' : 'No'}`,
                `Seated:    ${snapshot.seated ? 'Yes' : 'No'}`,
                `Jump:      ${snapshot.jumpPhase || 'grounded'}`
            ].join('\n');
        }

        if (this.contextEl) {
            this.contextEl.textContent =
                contextHint || '';

            this.contextEl.style.opacity =
                contextHint
                    ? '1'
                    : '0';
        }
    }

    dispose() {
        this.hide();

        this.root?.remove?.();

        document
            .getElementById(
                'smUniversalPlayerHUDStyle'
            )
            ?.remove?.();

        if (
            this.host &&
            this._hostOriginalPosition !==
                null
        ) {
            this.host.style.position =
                this._hostOriginalPosition;
        }

        this.root = null;
        this.stateEl = null;
        this.contextEl = null;
        this.host = null;
    }
}

window.SMUniversalPlayerHUD = SMUniversalPlayerHUD;


/* ===== Drive Package Runtime V2 — Fully Independent Mode ===== */
class SMUniversalPlayerDriveRuntime {
    constructor(context) {
        this.context = context;
        this.manifest = context.manifest || {};

        this.scene =
            context.scene ||
            window.scene ||
            null;

        this.renderer =
            context.renderer ||
            window.renderer ||
            null;

        this.camera =
            context.camera ||
            window.camera ||
            null;

        this.environment = null;
        this.swimmingZone = null;
        this.character = null;
        this.hud = null;

        this.loaded = false;
        this.active = false;

        this._frameCallback = null;
        this._frameRegistryType = null;

        this._hiddenSceneObjects =
            new Map();

        /**
         * V2.4 PLAYER MODE SELECTOR
         *
         * null        -> package loaded, user has not chosen yet
         * "engine"    -> use existing SM Engine player/controller
         * "universal" -> use package UAL player/controller
         */
        this.playerMode = null;

        this._playerModeOverlay = null;
        this._playerModeResolver = null;

        /**
         * Universal Player is loaded lazily.
         * Engine Player mode therefore does NOT download/create/update
         * the UAL character at all.
         */
        this._universalPlayerReady = false;

        this._disabledPlayerSystems = [];

        this._playerControlBar = null;

        this._inputGateActive = false;
        this._inputGateDown = new Set();

        /**
         * V2.6 — UNIVERSAL SHIFT LOCK
         *
         * WASD never drives Universal Player unless this lock is ON.
         * Toggle from:
         * - viewport SHIFT LOCK button
         * - keyboard CapsLock key
         */
        this._universalShiftLock =
            false;

        this._inputGateKeys =
            new Set([
                'KeyW',
                'KeyA',
                'KeyS',
                'KeyD',
                'ShiftLeft',
                'ShiftRight',
                'AltLeft',
                'AltRight',
                'ControlLeft',
                'ControlRight',
                'Space',
                'KeyC',
                'KeyE',
                'CapsLock'
            ]);

        this._onInputGateKeyDown =
            event =>
                this._handleInputGateKey(
                    event,
                    true
                );

        this._onInputGateKeyUp =
            event =>
                this._handleInputGateKey(
                    event,
                    false
                );

        this._defaultPlayerRoot = null;
        this._defaultPlayerVisibility = null;

        this._rendererOriginalRender = null;

        this._cameraState = null;
        this._controlsState = null;

        this._cameraTarget =
            new THREE.Vector3();

        this._cameraDesired =
            new THREE.Vector3();

        this._cameraForward =
            new THREE.Vector3();

        this._cameraRay =
            new THREE.Raycaster();

        this._cameraRayDirection =
            new THREE.Vector3();

        this._cameraSafePosition =
            new THREE.Vector3();

        this.cameraDistance = 4.8;
        this.cameraHeight = 1.55;
        this.cameraTargetHeight = 1.15;
        this.cameraSharpness = 12.0;

        /**
         * V2.2 AUTHORITATIVE GAMEPLAY CAMERA
         * ----------------------------------
         * The editor is allowed to keep its own camera internally.
         * This sample owns a separate PerspectiveCamera and renders the
         * final viewport with it after the editor frame.
         */
        this.gameplayCamera = null;
        this._gameplayRenderRAF = 0;
        this._playerWorldPosition = new THREE.Vector3();
        this._cameraBack = new THREE.Vector3();
        this._cameraLookTarget = new THREE.Vector3();

        // Third-person camera safety.
        this.cameraCollisionPadding = 0.28;
        this.cameraMinDistance = 1.15;
        this.cameraNear = 0.08;
    }

    async load() {
        if (this.loaded) {
            return this;
        }

        if (
            !this.scene ||
            !this.renderer ||
            !this.camera
        ) {
            throw new Error(
                '[Universal Player Sample] Scene, renderer or camera is unavailable.'
            );
        }

        /**
         * Build only the sample world here.
         *
         * Do NOT load UAL1_Standard.glb yet.
         * If the user chooses Engine Player, Universal Player costs
         * essentially nothing.
         */
        this.environment =
            new SMGameplaySampleEnvironment(
                this.scene,
                this.renderer,
                this.camera
            );

        this.environment.init();

        const swimConfig =
            this.manifest.config
                ?.environment
                ?.swimmingZone ||
            {};

        const normalizedSwimConfig = {
            ...swimConfig,

            center:
                Array.isArray(
                    swimConfig.center
                )
                    ? new THREE.Vector3(
                        ...swimConfig.center
                    )
                    : swimConfig.center
        };

        this.swimmingZone =
            new SMGameplaySampleSwimmingZone(
                this.scene,
                normalizedSwimConfig
            );

        this.swimmingZone.build();

        this.swimmingZone.registerToWorld(
            this.environment.getWorld()
        );

        this.loaded = true;

        return this;
    }

    async activate() {
        await this.load();

        if (this.active) {
            return this.getWorld();
        }

        this.active = true;

        this.environment.activate();

        this.swimmingZone.setVisible(
            true
        );

        this.environment.registerPhysics(
            window.physicsSystem
        );

        // Start with the normal SM Engine player.
        await this._activateEnginePlayerMode();

        // Persistent live switch inside the viewport.
        this._createPlayerControlBar();

        window.activeGameplaySample =
            this;

        window.SMActiveGameplayMode =
            'UNIVERSAL_PLAYER_SAMPLE';

        window.SMIndependentGameplayMode =
            this;

        return this.getWorld();
    }

    deactivate() {
        if (!this.loaded || !this.active) {
            return;
        }

        this.active = false;

        this._destroyPlayerModeSelector();
        this._destroyPlayerControlBar();

        this._setInputGate(false);

        this._removeFrameUpdate();
        this._stopAuthoritativeGameplayRender();
        this._restoreRendererCameraOverride();

        this.character?.deactivate?.();
        this.hud?.hide?.();

        this._restoreDefaultPlayerSystems();
        this._restoreExternalCharacters();
        this._restoreCameraAndControls();

        this.swimmingZone?.setVisible?.(
            false
        );

        this.environment?.deactivate?.();

        this.playerMode =
            null;

        if (
            window.activeGameplaySample ===
            this
        ) {
            window.activeGameplaySample =
                null;
        }

        if (
            window.SMIndependentGameplayMode ===
            this
        ) {
            window.SMIndependentGameplayMode =
                null;
        }

        if (
            window.SMActiveGameplayMode ===
            'UNIVERSAL_PLAYER_SAMPLE'
        ) {
            window.SMActiveGameplayMode =
                null;
        }

        window.dispatchEvent?.(
            new CustomEvent(
                'sm-independent-gameplay-mode-exit',
                {
                    detail: {
                        id:
                            this.manifest.id
                    }
                }
            )
        );
    }

    update(delta = 0) {
        if (
            !this.active ||
            this.playerMode !==
                'universal'
        ) {
            return;
        }

        const dt =
            Math.min(
                Math.max(
                    Number(delta) || 0,
                    0
                ),
                0.05
            );

        const snapshot =
            this.character
                ?.update?.(dt);

        this._updateThirdPersonCamera(
            dt
        );

        this.hud?.update?.(
            snapshot,
            this.character
                ?.getContextHint?.() ||
                ''
        );

        this._updateControlDebug(
            snapshot
        );
    }

    async _ensureUniversalPlayerReady() {
        if (
            this._universalPlayerReady &&
            this.character
        ) {
            return this.character;
        }

        const dependency =
            this.context.resolveAssetByName(
                [
                    'Content/Animations/UAL1_Standard.glb',
                    'UAL1_Standard.glb',
                    'UAL1 Standard.glb'
                ],
                {
                    packageFirst: true,
                    global: true
                }
            );

        if (!dependency) {
            throw new Error(
                '[Universal Player Sample] UAL1_Standard.glb is missing.'
            );
        }

        const animationURL =
            this.context.getAssetURL(
                dependency
            );

        if (!animationURL) {
            throw new Error(
                '[Universal Player Sample] UAL1_Standard.glb has no readable URL.'
            );
        }

        this._createGameplayCamera();

        const playerConfig = {
            ...(this.manifest.config
                ?.player || {}),

            spawn:
                this.manifest.config
                    ?.spawn ||
                [0, 0, 5]
        };

        this.character =
            new SMUniversalPlayerCharacter(
                this.scene,

                // Movement input and trajectory are relative to the
                // actual gameplay camera, not the editor camera.
                this.gameplayCamera ||
                this.camera,

                this.environment.getWorld(),
                this.swimmingZone,
                playerConfig
            );

        await this.character.init({
            candidates: [
                animationURL
            ]
        });

        this.hud =
            new SMUniversalPlayerHUD(
                this.renderer
            );

        this._universalPlayerReady =
            true;

        return this.character;
    }

    async _activateEnginePlayerMode() {
        this._releaseAllUniversalInputs();

        this.playerMode = 'engine';

        this._setUniversalShiftLock(
            false
        );

        this._setInputGate(false);

        this._removeFrameUpdate();
        this._stopAuthoritativeGameplayRender();
        this._restoreRendererCameraOverride();

        this.character?.deactivate?.();

        if (this.character?.model) {
            this.character.model.visible =
                false;
        }

        this.hud?.hide?.();

        this._restoreDefaultPlayerVisibility();
        this._restoreCameraAndControls();

        this._refreshPlayerControlBar();

        console.log(
            '[Universal Player Sample] WASD → ENGINE PLAYER'
        );
    }

    async _activateUniversalPlayerMode() {
        if (
            this.playerMode === 'universal' &&
            this.character?.active
        ) {
            return;
        }

        await this._ensureUniversalPlayerReady();

        this.playerMode = 'universal';

        this._captureCameraAndControls();

        this._rememberAndHideDefaultPlayer();
        this._disableEditorControls();

        this.character.setExternalInputGate(
            true
        );

        this.character.activate();
        this.character.model.visible =
            true;

        this._setInputGate(
            true
        );

        /**
         * Universal Player is active, but movement remains locked until
         * the user explicitly enables SHIFT LOCK.
         */
        this._setUniversalShiftLock(
            false
        );

        this._snapThirdPersonCamera();

        this.hud?.show?.();

        /**
         * Use the engine's single guarded frame loop. A private RAF can stop
         * after one frame error and freeze movement plus animation.
         */
        this._installFrameUpdate();

        // One render pass only: swap camera at renderer.render().
        this._installRendererCameraOverride();

        this._refreshPlayerControlBar();

        console.log(
            '[Universal Player Sample] WASD → UNIVERSAL PLAYER'
        );
    }

    _handleInputGateKey(
        event,
        down
    ) {
        if (
            !this._inputGateActive ||
            this.playerMode !==
                'universal' ||
            !this.character
        ) {
            return;
        }

        const tag =
            event.target
                ?.tagName
                ?.toLowerCase?.() ||
            '';

        if (
            tag === 'input' ||
            tag === 'textarea' ||
            tag === 'select' ||
            event.target
                ?.isContentEditable
        ) {
            return;
        }

        if (
            event.code ===
                'CapsLock'
        ) {
            event.preventDefault();
            event.stopImmediatePropagation();

            if (
                down &&
                !event.repeat
            ) {
                this._setUniversalShiftLock(
                    !this._universalShiftLock
                );
            }

            return;
        }

        if (
            !this._inputGateKeys.has(
                event.code
            )
        ) {
            return;
        }

        /**
         * CRITICAL:
         * While Universal mode is selected, these keys must NEVER leak to
         * the default SM Engine player — even if Shift Lock is OFF.
         */
        event.preventDefault();
        event.stopImmediatePropagation();

        if (
            !this._universalShiftLock
        ) {
            this.character.setInputKey(
                event.code,
                false
            );

            this._inputGateDown.delete(
                event.code
            );

            return;
        }

        this._setUniversalDirectionalKey(
            event.code,
            down,
            event.repeat
        );
    }

    _setUniversalDirectionalKey(
        code,
        down,
        repeat = false
    ) {
        if (
            !this.character ||
            this.playerMode !==
                'universal' ||
            !this._universalShiftLock
        ) {
            return;
        }

        if (down) {
            this._inputGateDown.add(
                code
            );
        } else {
            this._inputGateDown.delete(
                code
            );
        }

        this.character.setInputKey(
            code,
            down,
            repeat
        );
    }

    _releaseAllUniversalInputs() {
        const codes = [
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'ShiftLeft',
            'ShiftRight',
            'AltLeft',
            'AltRight',
            'ControlLeft',
            'ControlRight',
            'Space',
            'KeyC',
            'KeyE'
        ];

        for (
            const code of
            codes
        ) {
            this.character
                ?.setInputKey?.(
                    code,
                    false,
                    false
                );
        }

        this._inputGateDown.clear();

        this.character
            ?.clearInputKeys?.();
    }

    _setUniversalShiftLock(
        enabled
    ) {
        const next =
            !!enabled;

        this._universalShiftLock =
            next &&
            this.playerMode ===
                'universal' &&
            this._inputGateActive;

        const lockEnabled =
            this._universalShiftLock;

        /**
         * Never keep stale movement keys when switching ownership.
         */
        this._releaseAllUniversalInputs();

        /**
         * Curved trajectory is a Universal Shift-Lock debug/prediction
         * visualization. Show it only while Universal controls are armed.
         */
        this.character
            ?._setTrajectoryVisible?.(
                lockEnabled
            );

        this._refreshPlayerControlBar();

        console.log(
            `[Universal Player Sample] SHIFT LOCK ${lockEnabled ? 'ON' : 'OFF'}`
        );
    }

    _setInputGate(enabled) {
        const next = !!enabled;

        if (
            next ===
            this._inputGateActive
        ) {
            return;
        }

        this._inputGateActive = next;

        if (next) {
            window.addEventListener(
                'keydown',
                this._onInputGateKeyDown,
                true
            );

            window.addEventListener(
                'keyup',
                this._onInputGateKeyUp,
                true
            );
        } else {
            this._universalShiftLock =
                false;

            window.removeEventListener(
                'keydown',
                this._onInputGateKeyDown,
                true
            );

            window.removeEventListener(
                'keyup',
                this._onInputGateKeyUp,
                true
            );

            this._inputGateDown.clear();

            this.character
                ?.clearInputKeys?.();
        }
    }

    _findDefaultPlayerRoot() {
        const candidates = [
            window.playerModel,
            window.player?.model,
            window.player?.object,

            window.playerSystem
                ?.player
                ?.model,

            window.playerSystem
                ?.player
                ?.object,

            window.playerSystem
                ?.model,

            window.characterController
                ?.model,

            window.thirdPersonController
                ?.model
        ].filter(
            object =>
                object?.isObject3D &&
                object !== this.character?.model
        );

        if (candidates.length) {
            let root = candidates[0];

            while (
                root.parent &&
                root.parent !== this.scene
            ) {
                root = root.parent;
            }

            return root;
        }

        for (
            const root of
            this.scene?.children ||
            []
        ) {
            if (this._isOurObject(root)) {
                continue;
            }

            let playerTagged = false;

            root.traverse?.(
                object => {
                    if (
                        object.userData?.isPlayer === true ||
                        object.userData?.isPlayerRoot === true
                    ) {
                        playerTagged = true;
                    }
                }
            );

            if (playerTagged) {
                return root;
            }
        }

        return null;
    }

    _rememberAndHideDefaultPlayer() {
        if (!this._defaultPlayerRoot) {
            this._defaultPlayerRoot =
                this._findDefaultPlayerRoot();
        }

        if (!this._defaultPlayerRoot) {
            return;
        }

        if (
            this._defaultPlayerVisibility ===
            null
        ) {
            this._defaultPlayerVisibility =
                this._defaultPlayerRoot.visible;
        }

        this._defaultPlayerRoot.visible = false;
    }

    _restoreDefaultPlayerVisibility() {
        if (
            this._defaultPlayerRoot &&
            this._defaultPlayerVisibility !== null
        ) {
            this._defaultPlayerRoot.visible =
                this._defaultPlayerVisibility;
        }

        this._defaultPlayerVisibility = null;
    }

    _installRendererCameraOverride() {
        if (
            !this.renderer ||
            !this.gameplayCamera ||
            this._rendererOriginalRender
        ) {
            return;
        }

        const renderer = this.renderer;
        const original = renderer.render;
        const runtime = this;

        this._rendererOriginalRender =
            original;

        renderer.render =
            function (
                scene,
                camera
            ) {
                const selectedCamera =
                    (
                        runtime.active &&
                        runtime.playerMode === 'universal' &&
                        scene === runtime.scene &&
                        runtime.gameplayCamera
                    )
                        ? runtime.gameplayCamera
                        : camera;

                return original.call(
                    renderer,
                    scene,
                    selectedCamera
                );
            };
    }

    _restoreRendererCameraOverride() {
        if (
            !this.renderer ||
            !this._rendererOriginalRender
        ) {
            return;
        }

        this.renderer.render =
            this._rendererOriginalRender;

        this._rendererOriginalRender =
            null;
    }

    _createPlayerControlBar() {
        this._destroyPlayerControlBar();

        const host =
            this.renderer
                ?.domElement
                ?.parentElement;

        if (!host) {
            return;
        }

        if (
            getComputedStyle(host).position ===
            'static'
        ) {
            host.style.position = 'relative';
        }

        const bar =
            document.createElement('div');

        bar.id = 'smPlayerControlBar';

        bar.style.cssText = `
            position:absolute;
            left:50%;
            top:10px;
            transform:translateX(-50%);
            z-index:420;
            display:flex;
            align-items:center;
            gap:3px;
            padding:3px;
            border:1px solid rgba(255,255,255,.10);
            background:rgba(13,17,23,.94);
            pointer-events:auto;
            font-family:Inter,Segoe UI,Arial,sans-serif;
        `;

        bar.innerHTML = `
            <button
                type="button"
                data-player="engine"
                style="
                    height:29px;
                    padding:0 11px;
                    border:0;
                    background:transparent;
                    color:#8f9aa7;
                    font-size:8px;
                    font-weight:800;
                    cursor:pointer;
                "
            >
                ENGINE PLAYER
            </button>

            <button
                type="button"
                data-player="universal"
                style="
                    height:29px;
                    padding:0 11px;
                    border:0;
                    background:transparent;
                    color:#8f9aa7;
                    font-size:8px;
                    font-weight:800;
                    cursor:pointer;
                "
            >
                UNIVERSAL PLAYER
            </button>

            <button
                type="button"
                data-shift-lock
                title="Toggle Universal controls. Keyboard shortcut: Caps Lock"
                style="
                    height:29px;
                    padding:0 11px;
                    border:1px solid rgba(255,255,255,.08);
                    background:#11161d;
                    color:#737f8c;
                    font-size:8px;
                    font-weight:800;
                    cursor:pointer;
                "
            >
                SHIFT LOCK: OFF
            </button>

            <span
                data-state
                style="
                    margin-left:5px;
                    padding:0 7px;
                    color:#65717f;
                    font-size:7px;
                    white-space:nowrap;
                "
            >
                WASD → ENGINE
            </span>

            <span
                data-control-debug
                style="
                    padding:0 7px;
                    color:#697583;
                    font-size:7px;
                    white-space:nowrap;
                "
            >
                Universal idle
            </span>

            <div
                data-universal-pad
                style="
                    display:grid;
                    grid-template-columns:repeat(3,25px);
                    grid-template-rows:repeat(2,25px);
                    gap:2px;
                    margin-left:4px;
                "
                title="Hold these buttons to test Universal movement directly"
            >
                <span></span>

                <button
                    type="button"
                    data-universal-key="KeyW"
                    style="
                        border:1px solid rgba(255,255,255,.10);
                        background:#111820;
                        color:#9ca8b5;
                        font-size:9px;
                        font-weight:800;
                        cursor:pointer;
                        user-select:none;
                        touch-action:none;
                    "
                >W</button>

                <span></span>

                <button
                    type="button"
                    data-universal-key="KeyA"
                    style="
                        border:1px solid rgba(255,255,255,.10);
                        background:#111820;
                        color:#9ca8b5;
                        font-size:9px;
                        font-weight:800;
                        cursor:pointer;
                        user-select:none;
                        touch-action:none;
                    "
                >A</button>

                <button
                    type="button"
                    data-universal-key="KeyS"
                    style="
                        border:1px solid rgba(255,255,255,.10);
                        background:#111820;
                        color:#9ca8b5;
                        font-size:9px;
                        font-weight:800;
                        cursor:pointer;
                        user-select:none;
                        touch-action:none;
                    "
                >S</button>

                <button
                    type="button"
                    data-universal-key="KeyD"
                    style="
                        border:1px solid rgba(255,255,255,.10);
                        background:#111820;
                        color:#9ca8b5;
                        font-size:9px;
                        font-weight:800;
                        cursor:pointer;
                        user-select:none;
                        touch-action:none;
                    "
                >D</button>
            </div>
        `;

        host.appendChild(bar);

        this._playerControlBar = bar;

        bar
            .querySelector(
                '[data-player="engine"]'
            )
            .addEventListener(
                'click',
                () =>
                    this._activateEnginePlayerMode()
            );

        bar
            .querySelector(
                '[data-player="universal"]'
            )
            .addEventListener(
                'click',
                async () => {
                    const button =
                        bar.querySelector(
                            '[data-player="universal"]'
                        );

                    button.disabled = true;

                    try {
                        await this
                            ._activateUniversalPlayerMode();
                    } catch (error) {
                        console.error(
                            '[Universal Player Sample]',
                            error
                        );

                        alert(
                            `Universal Player failed:\\n${error.message}`
                        );

                        await this
                            ._activateEnginePlayerMode();
                    } finally {
                        button.disabled = false;
                    }
                }
            );

        const shiftLockButton =
            bar.querySelector(
                '[data-shift-lock]'
            );

        shiftLockButton
            ?.addEventListener(
                'click',
                async () => {
                    /**
                     * If user clicks SHIFT LOCK while still in Engine mode,
                     * activate Universal Player first, then arm controls.
                     */
                    if (
                        this.playerMode !==
                        'universal'
                    ) {
                        try {
                            await this
                                ._activateUniversalPlayerMode();
                        } catch (error) {
                            console.error(
                                '[Universal Player Sample]',
                                error
                            );

                            return;
                        }
                    }

                    this._setUniversalShiftLock(
                        !this._universalShiftLock
                    );
                }
            );

        const universalPadButtons =
            bar.querySelectorAll(
                '[data-universal-key]'
            );

        universalPadButtons.forEach(
            button => {
                const code =
                    button.dataset
                        .universalKey;

                const press =
                    event => {
                        event.preventDefault();
                        event.stopPropagation();

                        if (
                            this.playerMode !==
                            'universal'
                        ) {
                            return;
                        }

                        if (
                            !this._universalShiftLock
                        ) {
                            this._setUniversalShiftLock(
                                true
                            );
                        }

                        this._setUniversalDirectionalKey(
                            code,
                            true,
                            false
                        );

                        button.style.background =
                            'rgba(84,215,255,.22)';

                        button.style.color =
                            '#aeeaff';

                        try {
                            button.setPointerCapture?.(
                                event.pointerId
                            );
                        } catch (_) {}
                    };

                const release =
                    event => {
                        event.preventDefault();
                        event.stopPropagation();

                        this._setUniversalDirectionalKey(
                            code,
                            false,
                            false
                        );

                        button.style.background =
                            '#111820';

                        button.style.color =
                            '#9ca8b5';
                    };

                button.addEventListener(
                    'pointerdown',
                    press
                );

                button.addEventListener(
                    'pointerup',
                    release
                );

                button.addEventListener(
                    'pointercancel',
                    release
                );

                button.addEventListener(
                    'lostpointercapture',
                    release
                );
            }
        );

        this._refreshPlayerControlBar();
    }

    _refreshPlayerControlBar() {
        const bar =
            this._playerControlBar;

        if (!bar) {
            return;
        }

        const engine =
            bar.querySelector(
                '[data-player="engine"]'
            );

        const universal =
            bar.querySelector(
                '[data-player="universal"]'
            );

        const state =
            bar.querySelector(
                '[data-state]'
            );

        const shiftLock =
            bar.querySelector(
                '[data-shift-lock]'
            );

        const useUniversal =
            this.playerMode ===
                'universal';

        const lockOn =
            useUniversal &&
            this._universalShiftLock;

        bar
            .querySelectorAll(
                '[data-universal-key]'
            )
            .forEach(
                button => {
                    button.disabled =
                        !useUniversal;

                    button.style.opacity =
                        useUniversal
                            ? '1'
                            : '.38';
                }
            );

        engine.style.background =
            useUniversal
                ? 'transparent'
                : 'rgba(110,226,157,.13)';

        engine.style.color =
            useUniversal
                ? '#7f8995'
                : '#9df0b8';

        universal.style.background =
            useUniversal
                ? 'rgba(92,197,255,.15)'
                : 'transparent';

        universal.style.color =
            useUniversal
                ? '#8ddcff'
                : '#7f8995';

        if (shiftLock) {
            shiftLock.textContent =
                lockOn
                    ? 'SHIFT LOCK: ON'
                    : 'SHIFT LOCK: OFF';

            shiftLock.style.background =
                lockOn
                    ? 'rgba(255,188,74,.17)'
                    : '#11161d';

            shiftLock.style.borderColor =
                lockOn
                    ? 'rgba(255,188,74,.42)'
                    : 'rgba(255,255,255,.08)';

            shiftLock.style.color =
                lockOn
                    ? '#ffd17b'
                    : '#737f8c';
        }

        state.textContent =
            !useUniversal
                ? 'WASD → ENGINE'
                : lockOn
                    ? 'WASD → UNIVERSAL'
                    : 'CAPS LOCK / SHIFT LOCK REQUIRED';

        state.style.color =
            !useUniversal
                ? '#78dca0'
                : lockOn
                    ? '#79d8ff'
                    : '#d6a95e';
    }

    _destroyPlayerControlBar() {
        this._setUniversalShiftLock(
            false
        );

        this._playerControlBar
            ?.remove?.();

        this._playerControlBar =
            null;
    }

    _getDefaultPlayerSystems() {
        return [
            window.playerController,
            window.characterController,
            window.thirdPersonController,

            window.player
                ?.controller,

            window.playerSystem
                ?.controller,

            window.playerSystem
                ?.playerController,

            window.gamePlayerController
        ].filter(
            Boolean
        );
    }

    _disableDefaultPlayerSystems() {
        this._disabledPlayerSystems =
            [];

        const systems =
            [
                ...new Set(
                    this._getDefaultPlayerSystems()
                )
            ];

        const flags = [
            'enabled',
            'inputEnabled',
            'controlsEnabled',
            'movementEnabled',
            'isEnabled'
        ];

        for (
            const system of
            systems
        ) {
            const record = {
                system,
                values: {}
            };

            for (
                const flag of
                flags
            ) {
                if (
                    typeof system[flag] ===
                    'boolean'
                ) {
                    record.values[flag] =
                        system[flag];

                    system[flag] =
                        false;
                }
            }

            /**
             * Some controllers expose an explicit input toggle.
             */
            if (
                typeof system.setInputEnabled ===
                'function'
            ) {
                try {
                    system.setInputEnabled(
                        false
                    );

                    record.usedSetInputEnabled =
                        true;
                } catch (_) {}
            }

            this._disabledPlayerSystems.push(
                record
            );
        }

        console.log(
            '[Universal Player Sample] Default player systems suspended:',
            systems.length
        );
    }

    _restoreDefaultPlayerSystems() {
        for (
            const record of
            this._disabledPlayerSystems
        ) {
            if (!record?.system) {
                continue;
            }

            for (
                const [
                    key,
                    value
                ] of
                Object.entries(
                    record.values ||
                    {}
                )
            ) {
                record.system[key] =
                    value;
            }

            if (
                record.usedSetInputEnabled &&
                typeof record.system
                    .setInputEnabled ===
                    'function'
            ) {
                try {
                    record.system
                        .setInputEnabled(
                            true
                        );
                } catch (_) {}
            }
        }

        this._disabledPlayerSystems =
            [];
    }

    _showPlayerModeSelector() {
        this._destroyPlayerModeSelector(
            false
        );

        return new Promise(
            resolve => {
                this._playerModeResolver =
                    resolve;

                const canvas =
                    this.renderer
                        ?.domElement;

                const host =
                    canvas
                        ?.parentElement ||
                    document.body;

                if (
                    host !==
                    document.body
                ) {
                    const style =
                        getComputedStyle(
                            host
                        );

                    if (
                        style.position ===
                        'static'
                    ) {
                        host.style.position =
                            'relative';
                    }
                }

                const overlay =
                    document.createElement(
                        'div'
                    );

                overlay.id =
                    'smUniversalPlayerModeSelector';

                overlay.style.cssText = `
                    position:absolute;
                    inset:0;
                    z-index:500;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    padding:24px;
                    background:rgba(5,8,12,.58);
                    backdrop-filter:blur(7px);
                    pointer-events:auto;
                    font-family:Inter,Segoe UI,Arial,sans-serif;
                `;

                overlay.innerHTML = `
                    <section
                        style="
                            width:min(680px,calc(100% - 24px));
                            padding:20px;
                            border:1px solid rgba(255,255,255,.12);
                            background:rgba(14,18,24,.98);
                            color:#edf4fb;
                            box-shadow:0 24px 70px rgba(0,0,0,.38);
                        "
                    >
                        <div
                            style="
                                font-size:15px;
                                font-weight:800;
                            "
                        >
                            Choose Player Mode
                        </div>

                        <div
                            style="
                                margin-top:5px;
                                color:#7e8997;
                                font-size:9px;
                            "
                        >
                            Universal Player Sample
                        </div>

                        <div
                            style="
                                display:grid;
                                grid-template-columns:repeat(2,minmax(0,1fr));
                                gap:12px;
                                margin-top:17px;
                            "
                        >
                            <button
                                type="button"
                                data-sm-player-mode="engine"
                                style="
                                    min-height:168px;
                                    padding:17px;
                                    border:1px solid rgba(255,255,255,.10);
                                    background:#12171e;
                                    color:#eef4fa;
                                    text-align:left;
                                    cursor:pointer;
                                "
                            >
                                <span
                                    style="
                                        display:block;
                                        font-size:13px;
                                        font-weight:800;
                                    "
                                >
                                    Engine Player
                                </span>

                                <span
                                    style="
                                        display:block;
                                        margin-top:9px;
                                        color:#9ba6b3;
                                        font-size:9px;
                                        line-height:1.6;
                                    "
                                >
                                    Play the sample with your current
                                    SM Engine player. Existing WASD,
                                    physics, camera and controller stay active.
                                </span>

                                <span
                                    style="
                                        display:block;
                                        margin-top:16px;
                                        color:#73dda0;
                                        font-size:8px;
                                        font-weight:800;
                                    "
                                >
                                    LIGHTWEIGHT · DEFAULT
                                </span>
                            </button>

                            <button
                                type="button"
                                data-sm-player-mode="universal"
                                style="
                                    min-height:168px;
                                    padding:17px;
                                    border:1px solid rgba(94,190,255,.32);
                                    background:#101a23;
                                    color:#eef8ff;
                                    text-align:left;
                                    cursor:pointer;
                                "
                            >
                                <span
                                    style="
                                        display:block;
                                        font-size:13px;
                                        font-weight:800;
                                    "
                                >
                                    Universal Player
                                </span>

                                <span
                                    style="
                                        display:block;
                                        margin-top:9px;
                                        color:#9eacb9;
                                        font-size:9px;
                                        line-height:1.6;
                                    "
                                >
                                    Temporarily pause the default player
                                    and use the Universal Animation Library
                                    character with its own WASD and animations.
                                </span>

                                <span
                                    style="
                                        display:block;
                                        margin-top:16px;
                                        color:#68d4ff;
                                        font-size:8px;
                                        font-weight:800;
                                    "
                                >
                                    UAL · ANIMATION MODE
                                </span>
                            </button>
                        </div>

                        <div
                            style="
                                margin-top:12px;
                                color:#626d7a;
                                font-size:8px;
                            "
                        >
                            The choice is temporary and is reset when this
                            gameplay package is unloaded.
                        </div>
                    </section>
                `;

                host.appendChild(
                    overlay
                );

                this._playerModeOverlay =
                    overlay;

                overlay
                    .querySelectorAll(
                        '[data-sm-player-mode]'
                    )
                    .forEach(
                        button => {
                            button.addEventListener(
                                'click',
                                () => {
                                    const mode =
                                        button.dataset
                                            .smPlayerMode ===
                                        'universal'
                                            ? 'universal'
                                            : 'engine';

                                    const resolver =
                                        this._playerModeResolver;

                                    this._playerModeResolver =
                                        null;

                                    this._destroyPlayerModeSelector(
                                        false
                                    );

                                    resolver?.(
                                        mode
                                    );
                                },
                                {
                                    once: true
                                }
                            );
                        }
                    );
            }
        );
    }

    _destroyPlayerModeSelector(
        resolveEngineFallback =
            true
    ) {
        this._playerModeOverlay
            ?.remove?.();

        this._playerModeOverlay =
            null;

        if (
            resolveEngineFallback &&
            this._playerModeResolver
        ) {
            const resolve =
                this._playerModeResolver;

            this._playerModeResolver =
                null;

            resolve(
                'engine'
            );
        }
    }

    _isOurObject(object) {
        if (!object) return false;

        if (
            object ===
            this.character?.model
        ) {
            return true;
        }

        if (
            object.userData
                ?.isGameplaySample ===
            true
        ) {
            return true;
        }

        const name =
            String(
                object.name || ''
            );

        return (
            name.startsWith(
                'SMGameplaySample'
            ) ||
            name.startsWith(
                'SMUniversalPlayer'
            ) ||
            name.startsWith(
                'SMGameplaySwimming'
            )
        );
    }

    _hideExternalCharacters() {
        if (!this.scene) return;

        this._hiddenSceneObjects.clear();

        const rootsToHide =
            new Set();

        /**
         * Strong isolation rule:
         * in this sample mode every external SkinnedMesh character
         * and every external SkeletonHelper is hidden.
         *
         * This is why the user sees exactly ONE player.
         */
        for (
            const root of
            this.scene.children
        ) {
            if (
                this._isOurObject(root)
            ) {
                continue;
            }

            let hasExternalCharacter =
                false;

            root.traverse?.(
                object => {
                    if (
                        this._isOurObject(
                            object
                        )
                    ) {
                        return;
                    }

                    if (
                        object.isSkinnedMesh ||
                        object.isSkeletonHelper ||
                        object.type ===
                            'SkeletonHelper' ||
                        object.userData
                            ?.isPlayer ===
                            true ||
                        object.userData
                            ?.isPlayerRoot ===
                            true
                    ) {
                        hasExternalCharacter =
                            true;
                    }
                }
            );

            if (
                hasExternalCharacter
            ) {
                rootsToHide.add(
                    root
                );
            }
        }

        // Known engine player references, even when not top-level.
        const known = [
            window.player?.model,
            window.player?.object,
            window.player,
            window.playerSystem?.player?.model,
            window.playerSystem?.player?.object,
            window.playerSystem?.model,
            window.playerModel,
            window.characterController?.model,
            window.thirdPersonController?.model
        ].filter(
            object =>
                object?.isObject3D &&
                !this._isOurObject(object)
        );

        for (
            const object of known
        ) {
            let root =
                object;

            while (
                root.parent &&
                root.parent !==
                    this.scene
            ) {
                root =
                    root.parent;
            }

            rootsToHide.add(
                root
            );
        }

        for (
            const root of
            rootsToHide
        ) {
            if (!root) continue;

            this._hiddenSceneObjects.set(
                root,
                root.visible
            );

            root.visible =
                false;
        }

        console.log(
            '[Universal Player Sample V2] Hidden external character roots:',
            rootsToHide.size
        );
    }

    _restoreExternalCharacters() {
        this._hiddenSceneObjects.forEach(
            (visible, object) => {
                if (object) {
                    object.visible =
                        visible;
                }
            }
        );

        this._hiddenSceneObjects.clear();
    }

    _captureCameraAndControls() {
        const camera =
            this.camera;

        if (
            camera &&
            !this._cameraState
        ) {
            this._cameraState = {
                position:
                    camera.position.clone(),

                quaternion:
                    camera.quaternion.clone(),

                fov:
                    camera.fov,

                near:
                    camera.near,

                far:
                    camera.far
            };
        }

        const controls =
            window.orbitControls ||
            window.controls ||
            null;

        if (
            controls &&
            !this._controlsState
        ) {
            this._controlsState = {
                object:
                    controls,

                enabled:
                    controls.enabled,

                enableRotate:
                    controls.enableRotate,

                enableZoom:
                    controls.enableZoom,

                enablePan:
                    controls.enablePan,

                target:
                    controls.target
                        ?.clone?.() ||
                    null
            };
        }
    }

    _disableEditorControls() {
        const controls =
            this._controlsState
                ?.object ||
            window.orbitControls ||
            window.controls ||
            null;

        if (!controls) return;

        // Camera belongs to sample mode while active.
        if (
            'enabled' in
            controls
        ) {
            controls.enabled =
                false;
        }

        if (
            'enableRotate' in
            controls
        ) {
            controls.enableRotate =
                false;
        }

        if (
            'enableZoom' in
            controls
        ) {
            controls.enableZoom =
                false;
        }

        if (
            'enablePan' in
            controls
        ) {
            controls.enablePan =
                false;
        }
    }

    _restoreCameraAndControls() {
        const camera =
            this.camera;

        if (
            camera &&
            this._cameraState
        ) {
            camera.position.copy(
                this._cameraState
                    .position
            );

            camera.quaternion.copy(
                this._cameraState
                    .quaternion
            );

            if (
                camera.isPerspectiveCamera
            ) {
                camera.fov =
                    this._cameraState.fov;

                camera.near =
                    this._cameraState.near;

                camera.far =
                    this._cameraState.far;

                camera.updateProjectionMatrix?.();
            }
        }

        const state =
            this._controlsState;

        if (
            state?.object
        ) {
            if (
                'enabled' in
                state.object
            ) {
                state.object.enabled =
                    state.enabled;
            }

            if (
                'enableRotate' in
                state.object
            ) {
                state.object.enableRotate =
                    state.enableRotate;
            }

            if (
                'enableZoom' in
                state.object
            ) {
                state.object.enableZoom =
                    state.enableZoom;
            }

            if (
                'enablePan' in
                state.object
            ) {
                state.object.enablePan =
                    state.enablePan;
            }

            if (
                state.target &&
                state.object.target
            ) {
                state.object.target.copy(
                    state.target
                );
            }

            state.object.update?.();
        }

        this._cameraState =
            null;

        this._controlsState =
            null;
    }

    _createGameplayCamera() {
        if (this.gameplayCamera) {
            return this.gameplayCamera;
        }

        const sourceCamera =
            this.camera;

        const canvas =
            this.renderer?.domElement;

        const width =
            Math.max(
                1,
                canvas?.clientWidth ||
                canvas?.width ||
                1280
            );

        const height =
            Math.max(
                1,
                canvas?.clientHeight ||
                canvas?.height ||
                720
            );

        this.gameplayCamera =
            new THREE.PerspectiveCamera(
                sourceCamera?.isPerspectiveCamera
                    ? sourceCamera.fov
                    : 50,

                width / height,

                0.08,

                sourceCamera?.far ||
                5000
            );

        this.gameplayCamera.name =
            'SM_UniversalPlayer_GameplayCamera';

        this.gameplayCamera.up.set(
            0,
            1,
            0
        );

        window.SMGameplayCamera =
            this.gameplayCamera;

        return this.gameplayCamera;
    }

    _resizeGameplayCamera() {
        if (
            !this.gameplayCamera ||
            !this.renderer
        ) {
            return;
        }

        const canvas =
            this.renderer.domElement;

        const width =
            Math.max(
                1,
                canvas.clientWidth ||
                canvas.width ||
                1
            );

        const height =
            Math.max(
                1,
                canvas.clientHeight ||
                canvas.height ||
                1
            );

        const aspect =
            width / height;

        if (
            Math.abs(
                this.gameplayCamera.aspect -
                aspect
            ) >
            0.0001
        ) {
            this.gameplayCamera.aspect =
                aspect;

            this.gameplayCamera
                .updateProjectionMatrix();
        }
    }

    _getPlayerWorldPosition(
        target =
            this._playerWorldPosition
    ) {
        const player =
            this.character?.model;

        if (!player) {
            return target.set(
                0,
                0,
                0
            );
        }

        player.updateMatrixWorld?.(
            true
        );

        player.getWorldPosition(
            target
        );

        return target;
    }

    _getLogicalPlayerYaw() {
        const yaw =
            this.character
                ?.getLogicalYaw?.();

        if (
            Number.isFinite(
                yaw
            )
        ) {
            return yaw;
        }

        return 0;
    }

    /**
     * Stable world-space back direction.
     *
     * Logical forward:
     *   x = sin(yaw)
     *   z = -cos(yaw)
     *
     * Camera back is the opposite direction.
     */
    _getGameplayCameraBack() {
        const yaw =
            this._getLogicalPlayerYaw();

        return this._cameraBack
            .set(
                -Math.sin(yaw),
                0,
                Math.cos(yaw)
            )
            .normalize();
    }

    _getPlayerForward() {
        /**
         * Never infer gameplay forward from the imported GLB root quaternion.
         *
         * UAL has its own authored visual-forward offset. The character
         * controller already knows the correct logical heading, so camera
         * follow must use the same heading.
         */
        if (
            this.character
                ?.getForwardDirection
        ) {
            return this.character
                .getForwardDirection(
                    this._cameraForward
                );
        }

        return this._cameraForward
            .set(
                0,
                0,
                -1
            );
    }

    _getCameraCollisionMeshes() {
        const world =
            this.environment
                ?.getWorld?.();

        if (!world) {
            return [];
        }

        const ground =
            world.ground ||
            world.floor ||
            null;

        return (
            world.collidableMeshes ||
            []
        ).filter(
            object =>
                object?.isObject3D &&
                object.visible !== false &&
                object !== ground &&
                object.userData
                    ?.cameraIgnore !==
                    true
        );
    }

    _resolveSafeCameraPosition(
        target,
        desired
    ) {
        this._cameraSafePosition
            .copy(
                desired
            );

        this._cameraRayDirection
            .subVectors(
                desired,
                target
            );

        const desiredDistance =
            this._cameraRayDirection
                .length();

        if (
            desiredDistance <
            0.001
        ) {
            return this._cameraSafePosition;
        }

        this._cameraRayDirection
            .divideScalar(
                desiredDistance
            );

        const meshes =
            this._getCameraCollisionMeshes();

        if (
            meshes.length
        ) {
            this._cameraRay.set(
                target,
                this._cameraRayDirection
            );

            this._cameraRay.near =
                this.cameraNear;

            this._cameraRay.far =
                desiredDistance;

            const hits =
                this._cameraRay
                    .intersectObjects(
                        meshes,
                        true
                    );

            const hit =
                hits.find(
                    item =>
                        item.distance >
                        this.cameraNear
                );

            if (hit) {
                const safeDistance =
                    THREE.MathUtils.clamp(
                        hit.distance -
                        this.cameraCollisionPadding,
                        this.cameraMinDistance,
                        desiredDistance
                    );

                this._cameraSafePosition
                    .copy(
                        target
                    )
                    .addScaledVector(
                        this._cameraRayDirection,
                        safeDistance
                    );
            }
        }

        /**
         * Final safety floor:
         * never let the camera drop beneath the player's lower torso.
         */
        const playerY =
            this._getPlayerWorldPosition(
                this._playerWorldPosition
            ).y;

        this._cameraSafePosition.y =
            Math.max(
                this._cameraSafePosition.y,
                playerY + 0.82
            );

        return this._cameraSafePosition;
    }

    _snapThirdPersonCamera() {
        const player =
            this.character?.model;

        const camera =
            this.gameplayCamera;

        if (
            !player ||
            !camera
        ) {
            return;
        }

        const playerPosition =
            this._getPlayerWorldPosition();

        this._cameraLookTarget
            .copy(
                playerPosition
            );

        this._cameraLookTarget.y +=
            this.cameraTargetHeight;

        const back =
            this._getGameplayCameraBack();

        this._cameraDesired
            .copy(
                this._cameraLookTarget
            )
            .addScaledVector(
                back,
                this.cameraDistance
            );

        this._cameraDesired.y +=
            this.cameraHeight;

        const safePosition =
            this._resolveSafeCameraPosition(
                this._cameraLookTarget,
                this._cameraDesired
            );

        camera.position.copy(
            safePosition
        );

        camera.lookAt(
            this._cameraLookTarget
        );

        camera.updateMatrixWorld(
            true
        );
    }

    _updateThirdPersonCamera(delta) {
        const player =
            this.character?.model;

        const camera =
            this.gameplayCamera;

        if (
            !player ||
            !camera
        ) {
            return;
        }

        this._resizeGameplayCamera();

        const playerPosition =
            this._getPlayerWorldPosition();

        this._cameraLookTarget
            .copy(
                playerPosition
            );

        this._cameraLookTarget.y +=
            this.cameraTargetHeight;

        const back =
            this._getGameplayCameraBack();

        this._cameraDesired
            .copy(
                this._cameraLookTarget
            )
            .addScaledVector(
                back,
                this.cameraDistance
            );

        this._cameraDesired.y +=
            this.cameraHeight;

        const safePosition =
            this._resolveSafeCameraPosition(
                this._cameraLookTarget,
                this._cameraDesired
            );

        const alpha =
            1 -
            Math.exp(
                -this.cameraSharpness *
                Math.max(
                    delta,
                    0
                )
            );

        /**
         * Teleport out immediately if camera is obviously invalid.
         * Otherwise use smooth follow.
         */
        const tooFar =
            camera.position.distanceTo(
                this._cameraLookTarget
            ) >
            30;

        const belowPlayer =
            camera.position.y <
            playerPosition.y +
            0.45;

        if (
            tooFar ||
            belowPlayer ||
            !Number.isFinite(
                camera.position.x
            )
        ) {
            camera.position.copy(
                safePosition
            );
        } else {
            camera.position.lerp(
                safePosition,
                alpha
            );
        }

        camera.lookAt(
            this._cameraLookTarget
        );

        camera.updateMatrixWorld(
            true
        );
    }

    _updateControlDebug(
        snapshot
    ) {
        const bar =
            this._playerControlBar;

        if (!bar) {
            return;
        }

        const debug =
            bar.querySelector(
                '[data-control-debug]'
            );

        if (!debug) {
            return;
        }

        if (
            this.playerMode !==
            'universal'
        ) {
            debug.textContent =
                'Universal idle';

            return;
        }

        const activeKeys =
            [
                'KeyW',
                'KeyA',
                'KeyS',
                'KeyD'
            ]
                .filter(
                    code =>
                        this._inputGateDown
                            .has(
                                code
                            )
                )
                .map(
                    code =>
                        code.replace(
                            'Key',
                            ''
                        )
                );

        const keyText =
            activeKeys.length
                ? activeKeys.join(
                    '+'
                )
                : '—';

        const speed =
            Number(
                snapshot?.speed ||
                0
            );

        debug.textContent =
            this._universalShiftLock
                ? `LOCK ON · ${keyText} · ${speed.toFixed(1)} m/s`
                : 'LOCK OFF';
    }

    _installFrameUpdate() {
        if (this._frameCallback) {
            return;
        }

        const callback =
            (delta = 0) =>
                this.update(
                    delta
                );

        const registry =
            window.engineFrameCallbacks;

        if (
            registry?.add &&
            typeof registry.add ===
                'function'
        ) {
            registry.add(
                callback
            );

            this._frameCallback =
                callback;

            this._frameRegistryType =
                'set';

            return;
        }

        if (
            Array.isArray(
                registry
            )
        ) {
            registry.push(
                callback
            );

            this._frameCallback =
                callback;

            this._frameRegistryType =
                'array';

            return;
        }

        let last =
            performance.now();

        const fallback =
            now => {
                if (
                    this._frameCallback !==
                    fallback
                ) {
                    return;
                }

                const dt =
                    Math.min(
                        (now - last) /
                            1000,
                        0.05
                    );

                last =
                    now;

                this.update(
                    dt
                );

                requestAnimationFrame(
                    fallback
                );
            };

        this._frameCallback =
            fallback;

        this._frameRegistryType =
            'raf';

        requestAnimationFrame(
            fallback
        );
    }

    _removeFrameUpdate() {
        if (!this._frameCallback) {
            return;
        }

        const registry =
            window.engineFrameCallbacks;

        if (
            this._frameRegistryType ===
            'set'
        ) {
            registry?.delete?.(
                this._frameCallback
            );
        } else if (
            this._frameRegistryType ===
                'array' &&
            Array.isArray(
                registry
            )
        ) {
            const index =
                registry.indexOf(
                    this._frameCallback
                );

            if (
                index >=
                0
            ) {
                registry.splice(
                    index,
                    1
                );
            }
        }

        this._frameCallback =
            null;

        this._frameRegistryType =
            null;
    }

    _startAuthoritativeGameplayRender() {
        // V2.5 — disabled intentionally.
        // Camera substitution avoids a second scene render.
    }

    _stopAuthoritativeGameplayRender() {
        if (this._gameplayRenderRAF) {
            cancelAnimationFrame(
                this._gameplayRenderRAF
            );

            this._gameplayRenderRAF = 0;
        }

        if (
            window.SMGameplayCamera ===
            this.gameplayCamera
        ) {
            window.SMGameplayCamera = null;
        }
    }

    getWorld() {
        const world =
            this.environment
                ?.getWorld?.() ||
            null;

        if (!world) {
            return null;
        }

        world.swimmingZone =
            this.swimmingZone;

        world.player =
            this.playerMode ===
                'universal'
                ? (
                    this.character
                        ?.model ||
                    null
                )
                : (
                    window.playerModel ||
                    window.player
                        ?.model ||
                    window.player
                        ?.object ||
                    null
                );

        world.sample =
            this;

        return world;
    }

    dispose() {
        this._destroyPlayerModeSelector();
        this._destroyPlayerControlBar();

        this._setInputGate(false);
        this._restoreRendererCameraOverride();

        this.deactivate();

        this.hud?.dispose?.();
        this.character?.dispose?.();
        this.swimmingZone?.dispose?.();
        this.environment?.dispose?.();

        this.hud = null;
        this.character = null;
        this.swimmingZone = null;
        this.environment = null;

        this.gameplayCamera = null;

        this.loaded = false;
    }
}

let __runtime = null;

SMAssetPackages.registerPackage(
    'com.smengine.samples.universal-player',
    {
        async activate(context) {
            if (__runtime) {
                __runtime.dispose();
            }

            __runtime =
                new SMUniversalPlayerDriveRuntime(
                    context
                );

            await __runtime.load();

            return await __runtime.activate();
        },

        async deactivate() {
            __runtime?.deactivate?.();
        },

        async dispose() {
            __runtime?.dispose?.();
            __runtime = null;
        },

        getRuntime() {
            return __runtime;
        }
    }
);

})(window, document, THREE, SMAssetPackages, SMAssetPackageLoader);
