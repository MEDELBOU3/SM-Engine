// ============================================================================
// 2D-editor/core/SM2DCollisionSystem.js
// SM Engine — Professional 2D Collision, Hitbox & Trigger Physics System
// Real-time AABB, Hitbox/Hurtbox Queries, Spatial Broadphase & Debug Gizmos
// ============================================================================
(function (root) {
    'use strict';

    class SM2DCollisionSystem {
        constructor() {
            this.enabled = true;
            this.debugDraw = false;
            this.debugLines = null;
            this.listeners = {
                collisionEnter: [],
                collisionExit: [],
                triggerEnter: [],
                triggerExit: []
            };
            this._previousPairs = new Set();
            this._currentPairs = new Set();
        }

        /**
         * Computes the world-space bounding boxes for all active hitboxes on a sprite.
         * Falls back to mesh geometry bounds if no explicit hitboxes are defined.
         *
         * @param {THREE.Mesh} mesh
         * @returns {Array<{type: string, id: string, minX: number, maxX: number, minY: number, maxY: number, width: number, height: number, mesh: THREE.Mesh}>}
         */
        getSpriteBounds(mesh) {
            if (!mesh || !mesh.visible) return [];

            const data = mesh.userData || {};
            const scaleX = Math.abs(mesh.scale.x || 1);
            const scaleY = Math.abs(mesh.scale.y || 1);

            // Rotation 2D réelle de l'objet
            const angle = mesh.rotation?.z || 0;

            // ------------------------------------------------------------
            // Get custom hitboxes
            // ------------------------------------------------------------
            let activeHitboxes = [];

            if (Array.isArray(data.hitboxes) && data.hitboxes.length > 0) {
                activeHitboxes = data.hitboxes;
            }
            else if (data.slices && data.sprite2D) {
                const currentFrameIdx = data.sprite2D.frameIndex || 0;
                const activeClipId = data.sprite2D.activeClipId;
                const clips = data.clips || [];

                const clip =
                    clips.find(c => c.id === activeClipId) ||
                    clips[0];

                if (clip && clip.frameSliceIds) {
                    const sliceId =
                        clip.frameSliceIds[
                        currentFrameIdx % clip.frameSliceIds.length
                        ];

                    const slice = data.slices.find(s => s.id === sliceId);

                    if (
                        slice &&
                        Array.isArray(slice.hitboxes) &&
                        slice.hitboxes.length > 0
                    ) {
                        activeHitboxes = slice.hitboxes;
                    }
                }
            }

            // ------------------------------------------------------------
            // Custom hitboxes
            // ------------------------------------------------------------
            if (activeHitboxes.length > 0) {
                const ppu = Math.max(
                    1,
                    Number(data.sprite2D?.pixelsPerUnit) || 100
                );

                return activeHitboxes.map((hb) => {

                    const localX = Number(hb.x || 0) / ppu;
                    const localY = Number(hb.y || 0) / ppu;

                    const localW = Number(hb.w || 16) / ppu;
                    const localH = Number(hb.h || 16) / ppu;

                    const width = localW * scaleX;
                    const height = localH * scaleY;

                    // ----------------------------------------------------
                    // Hitbox center in LOCAL coordinates
                    // ----------------------------------------------------
                    const localCenterX =
                        localX + localW * 0.5;

                    const localCenterY =
                        -(localY + localH * 0.5);

                    // ----------------------------------------------------
                    // Rotate local center around sprite origin
                    // ----------------------------------------------------
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);

                    const rotatedX =
                        localCenterX * cos -
                        localCenterY * sin;

                    const rotatedY =
                        localCenterX * sin +
                        localCenterY * cos;

                    const centerX =
                        mesh.position.x + rotatedX * scaleX;

                    const centerY =
                        mesh.position.y + rotatedY * scaleY;

                    // ----------------------------------------------------
                    // Calculate rotated corners
                    // ----------------------------------------------------
                    const hw = width * 0.5;
                    const hh = height * 0.5;

                    const corners = [
                        { x: -hw, y: -hh },
                        { x: hw, y: -hh },
                        { x: hw, y: hh },
                        { x: -hw, y: hh }
                    ].map(p => ({
                        x: centerX + p.x * cos - p.y * sin,
                        y: centerY + p.x * sin + p.y * cos
                    }));

                    // ----------------------------------------------------
                    // AABB around rotated box
                    // Used for broadphase
                    // ----------------------------------------------------
                    const xs = corners.map(p => p.x);
                    const ys = corners.map(p => p.y);

                    return {
                        id: hb.id || 'hb_default',
                        type: hb.type || 'hitbox',

                        centerX,
                        centerY,

                        width,
                        height,

                        halfWidth: hw,
                        halfHeight: hh,

                        angle,

                        corners,

                        minX: Math.min(...xs),
                        maxX: Math.max(...xs),
                        minY: Math.min(...ys),
                        maxY: Math.max(...ys),

                        mesh
                    };
                });
            }

            // ------------------------------------------------------------
            // Default geometry collider
            // ------------------------------------------------------------
            const geo = mesh.geometry;

            if (!geo) return [];

            if (!geo.boundingBox) {
                geo.computeBoundingBox();
            }

            const bbox = geo.boundingBox;

            const width =
                (bbox.max.x - bbox.min.x) * scaleX;

            const height =
                (bbox.max.y - bbox.min.y) * scaleY;

            const localCenterX =
                (bbox.min.x + bbox.max.x) * 0.5 * scaleX;

            const localCenterY =
                (bbox.min.y + bbox.max.y) * 0.5 * scaleY;

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const centerX =
                mesh.position.x +
                localCenterX * cos -
                localCenterY * sin;

            const centerY =
                mesh.position.y +
                localCenterX * sin +
                localCenterY * cos;

            const hw = width * 0.5;
            const hh = height * 0.5;

            const corners = [
                { x: -hw, y: -hh },
                { x: hw, y: -hh },
                { x: hw, y: hh },
                { x: -hw, y: hh }
            ].map(p => ({
                x: centerX + p.x * cos - p.y * sin,
                y: centerY + p.x * sin + p.y * cos
            }));

            const xs = corners.map(p => p.x);
            const ys = corners.map(p => p.y);

            return [{
                id: 'solid_default',
                type: data.collisionType || 'solid',

                centerX,
                centerY,

                width,
                height,

                halfWidth: hw,
                halfHeight: hh,

                angle,

                corners,

                minX: Math.min(...xs),
                maxX: Math.max(...xs),
                minY: Math.min(...ys),
                maxY: Math.max(...ys),

                mesh
            }];
        }

        /**
         * Test AABB overlap between two boxes
         */
        testAABB(boxA, boxB) {
            // Si aucun angle, AABB classique
            if (
                Math.abs(boxA.angle || 0) < 0.00001 &&
                Math.abs(boxB.angle || 0) < 0.00001
            ) {
                return (
                    boxA.minX < boxB.maxX &&
                    boxA.maxX > boxB.minX &&
                    boxA.minY < boxB.maxY &&
                    boxA.maxY > boxB.minY
                );
            }

            return this._testOBB(boxA, boxB);
        }

        _testOBB(a, b) {

            const axes = [];

            const addAxes = (box) => {
                const angle = box.angle || 0;

                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                // X axis
                axes.push({
                    x: cos,
                    y: sin
                });

                // Y axis
                axes.push({
                    x: -sin,
                    y: cos
                });
            };

            addAxes(a);
            addAxes(b);

            const project = (box, axis) => {

                const cos = Math.cos(box.angle || 0);
                const sin = Math.sin(box.angle || 0);

                const axisX = axis.x;
                const axisY = axis.y;

                const centerProjection =
                    box.centerX * axisX +
                    box.centerY * axisY;

                const radius =
                    Math.abs(
                        box.halfWidth *
                        (cos * axisX + sin * axisY)
                    ) +
                    Math.abs(
                        box.halfHeight *
                        (-sin * axisX + cos * axisY)
                    );

                return {
                    min: centerProjection - radius,
                    max: centerProjection + radius
                };
            };

            for (const axis of axes) {

                const pa = project(a, axis);
                const pb = project(b, axis);

                if (
                    pa.max <= pb.min ||
                    pb.max <= pa.min
                ) {
                    return false;
                }
            }

            return true;
        }

        /**
         * Calculates overlap penetration vector (minimum translation vector to separate boxA from boxB)
         */
        getOverlapVector(boxA, boxB) {
            const overlapX1 = boxA.maxX - boxB.minX;
            const overlapX2 = boxB.maxX - boxA.minX;
            const overlapY1 = boxA.maxY - boxB.minY;
            const overlapY2 = boxB.maxY - boxA.minY;

            const minOverlapX = overlapX1 < overlapX2 ? -overlapX1 : overlapX2;
            const minOverlapY = overlapY1 < overlapY2 ? -overlapY1 : overlapY2;

            if (Math.abs(minOverlapX) < Math.abs(minOverlapY)) {
                return { x: minOverlapX, y: 0 };
            } else {
                return { x: 0, y: minOverlapY };
            }
        }

        /**
         * Check if two sprite meshes collide. Returns collision details or null.
         */
        checkCollision(meshA, meshB) {
            if (!meshA || !meshB || meshA === meshB) return null;

            const boxesA = this.getSpriteBounds(meshA);
            const boxesB = this.getSpriteBounds(meshB);

            for (const bA of boxesA) {
                for (const bB of boxesB) {
                    if (this.testAABB(bA, bB)) {
                        const separation = this.getOverlapVector(bA, bB);
                        return {
                            collided: true,
                            boxA: bA,
                            boxB: bB,
                            separation: separation,
                            isTrigger: bA.type !== 'solid' || bB.type !== 'solid'
                        };
                    }
                }
            }
            return null;
        }

        /**
         * Find all 2D sprites in the given scene that overlap with the target sprite mesh.
         */
        queryOverlaps(targetMesh, scene = root.scene, layerFilter = null) {
            if (!targetMesh || !scene) return [];

            const results = [];
            const targetBoxes = this.getSpriteBounds(targetMesh);
            if (targetBoxes.length === 0) return results;

            scene.traverse((obj) => {
                if (obj === targetMesh || !obj.visible) return;
                if (!obj.userData?.is2DSprite && !obj.userData?.is2DActor && !obj.userData?.is2DCollider) return;

                if (layerFilter && obj.userData?.layer2D !== layerFilter) return;

                const candidateBoxes = this.getSpriteBounds(obj);
                for (const tBox of targetBoxes) {
                    for (const cBox of candidateBoxes) {
                        if (this.testAABB(tBox, cBox)) {
                            results.push({
                                targetBox: tBox,
                                otherBox: cBox,
                                otherMesh: obj,
                                separation: this.getOverlapVector(tBox, cBox)
                            });
                        }
                    }
                }
            });

            return results;
        }

        /**
         * Point vs Sprite test (useful for mouse clicks, picking in 2D)
         */
        pointQuery(worldX, worldY, scene = root.scene) {
            if (!scene) return [];
            const hits = [];

            scene.traverse((obj) => {
                if (!obj.visible || (!obj.userData?.is2DSprite && !obj.userData?.is2DActor)) return;
                const boxes = this.getSpriteBounds(obj);
                for (const b of boxes) {
                    if (worldX >= b.minX && worldX <= b.maxX && worldY >= b.minY && worldY <= b.maxY) {
                        hits.push({ mesh: obj, box: b });
                    }
                }
            });

            return hits;
        }

        /**
         * Raycast in 2D XY plane.
         */
        raycast2D(originX, originY, dirX, dirY, maxDistance = 100, scene = root.scene) {
            if (!scene) return null;
            const mag = Math.hypot(dirX, dirY);
            if (mag === 0) return null;
            const ndx = dirX / mag;
            const ndy = dirY / mag;

            const stepSize = 0.1;
            let currentDist = 0;

            while (currentDist <= maxDistance) {
                const px = originX + ndx * currentDist;
                const py = originY + ndy * currentDist;

                const hits = this.pointQuery(px, py, scene);
                if (hits.length > 0) {
                    return {
                        hit: true,
                        distance: currentDist,
                        point: { x: px, y: py },
                        mesh: hits[0].mesh,
                        box: hits[0].box
                    };
                }
                currentDist += stepSize;
            }

            return null;
        }

        /**
         * Update loop — evaluates collisions across all active 2D actors in the scene.
         * Dispatches events for triggers and hitboxes.
         */
        update(scene = root.scene) {
            if (!this.enabled || !scene) return;

            const actors = [];
            scene.traverse((obj) => {
                if (obj.visible && (obj.userData?.is2DSprite || obj.userData?.is2DActor || obj.userData?.is2DCollider)) {
                    actors.push(obj);
                }
            });

            this._currentPairs.clear();

            for (let i = 0; i < actors.length; i++) {
                for (let j = i + 1; j < actors.length; j++) {
                    const a = actors[i];
                    const b = actors[j];
                    const col = this.checkCollision(a, b);

                    if (col) {
                        const pairKey = `${a.id || a.uuid}_${b.id || b.uuid}`;
                        this._currentPairs.add(pairKey);

                        if (!this._previousPairs.has(pairKey)) {
                            // Collision Enter
                            const evtType = col.isTrigger ? 'triggerEnter' : 'collisionEnter';
                            this._dispatch(evtType, { actorA: a, actorB: b, collision: col });
                        }
                    }
                }
            }

            // Detect exits
            this._previousPairs.forEach((pairKey) => {
                if (!this._currentPairs.has(pairKey)) {
                    this._dispatch('collisionExit', { pairKey });
                    this._dispatch('triggerExit', { pairKey });
                }
            });

            this._previousPairs = new Set(this._currentPairs);

            if (this.debugDraw) {
                this._renderDebugGizmos(actors, scene);
            }
        }

        addEventListener(event, callback) {
            if (this.listeners[event]) this.listeners[event].push(callback);
        }

        removeEventListener(event, callback) {
            if (this.listeners[event]) {
                this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
            }
        }

        _dispatch(event, data) {
            const list = this.listeners[event] || [];
            list.forEach(cb => {
                try { cb(data); } catch (err) { console.error('[SM2DCollisionSystem] Listener error:', err); }
            });
            window.dispatchEvent(new CustomEvent(`sm:2d-${event}`, { detail: data }));
        }

        /**
         * Toggle debug wireframes for 2D colliders
         */
        toggleDebugDraw(scene = root.scene, force = null) {
            this.debugDraw = force !== null ? !!force : !this.debugDraw;
            if (!this.debugDraw && this.debugLines) {
                this.debugLines.removeFromParent?.();
                this.debugLines = null;
            }
            return this.debugDraw;
        }

        _renderDebugGizmos(actors, scene) {
            if (!root.THREE || !scene) return;

            if (this.debugLines) {
                this.debugLines.removeFromParent?.();
                this.debugLines.geometry?.dispose?.();
                this.debugLines.material?.dispose?.();
                this.debugLines = null;
            }

            const positions = [];
            const colors = [];

            actors.forEach(actor => {

                const boxes = this.getSpriteBounds(actor);

                boxes.forEach(b => {

                    const z = (actor.position.z || 0) + 0.05;

                    const r =
                        b.type === 'hitbox'
                            ? 1.0
                            : 0.2;

                    const g =
                        b.type === 'hitbox'
                            ? 0.2
                            : b.type === 'hurtbox'
                                ? 0.9
                                : 0.8;

                    const blue =
                        b.type === 'hitbox'
                            ? 0.2
                            : b.type === 'hurtbox'
                                ? 0.3
                                : 1.0;

                    // ---------------------------------------------
                    // ROTATED COLLIDER
                    // ---------------------------------------------
                    const c = b.corners;

                    if (!c || c.length !== 4) return;

                    const pts = [
                        c[0].x, c[0].y, z,
                        c[1].x, c[1].y, z,

                        c[1].x, c[1].y, z,
                        c[2].x, c[2].y, z,

                        c[2].x, c[2].y, z,
                        c[3].x, c[3].y, z,

                        c[3].x, c[3].y, z,
                        c[0].x, c[0].y, z
                    ];

                    for (let p = 0; p < pts.length; p += 3) {
                        positions.push(
                            pts[p],
                            pts[p + 1],
                            pts[p + 2]
                        );

                        colors.push(r, g, blue);
                    }
                });
            });

            if (positions.length === 0) return;

            const geo = new root.THREE.BufferGeometry();

            geo.setAttribute(
                'position',
                new root.THREE.Float32BufferAttribute(
                    positions,
                    3
                )
            );

            geo.setAttribute(
                'color',
                new root.THREE.Float32BufferAttribute(
                    colors,
                    3
                )
            );

            const mat = new root.THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.85,
                depthTest: false
            });

            this.debugLines =
                new root.THREE.LineSegments(
                    geo,
                    mat
                );

            this.debugLines.name =
                'SM2DCollisionDebugGizmos';

            this.debugLines.renderOrder = 9999;

            scene.add(this.debugLines);
        }
    }

    root.SM2DCollisionSystem = root.SM2DCollisionSystem || new SM2DCollisionSystem();
    console.log('✅ [SM2DCollisionSystem] Professional 2D Collision & Hitbox Engine active.');

})(window);
