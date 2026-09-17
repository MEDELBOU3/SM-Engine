/**
 * PlayerTraversalDetector.js
 * Detects nearby Gameplay Sample obstacles and converts them into traversal plans.
 */
class SMPlayerTraversalDetector {
    constructor({
        character,
        movement,
        input,
        camera,
        config = window.SMPlayerConfig,
        getWorld = () => window.gameplaySampleWorld || window.gameplaySampleEnvironment?.world || null
    } = {}) {
        this.character = character;
        this.movement = movement;
        this.input = input;
        this.camera = camera;
        this.config = config || {};
        this.getWorld = getWorld;

        this.raycaster = new THREE.Raycaster();
        this.origin = new THREE.Vector3();
        this.direction = new THREE.Vector3(0, 0, -1);
        this.tmp = new THREE.Vector3();
        this.box = new THREE.Box3();
        this.boxSize = new THREE.Vector3();
    }

    _getCollidables() {
        const world = this.getWorld?.();
        const unique = new Map();
        const add = object => {
            if (object?.isMesh) unique.set(object.uuid, object);
        };

        (world?.traversalMeshes || []).forEach(add);
        (window.traversalMeshes || []).forEach(add);
        (window.SMPlayerCollisionRegistry?.getTraversalMeshes?.() || []).forEach(add);

        // Assets dropped from assets/game-obstacles are not members of the
        // authored Gameplay Sample arrays, so collect their AUTO traversal tags
        // directly from the live scene as well.
        this.character?.model?.parent?.traverse?.(object => {
            if (object?.userData?.traversalType && object.userData.noTraversal !== true) add(object);
        });

        return Array.from(unique.values()).filter(object => {
            if (!object?.isMesh || object.visible === false) return false;
            if (object === world?.floor || object === world?.ground) return false;
            if (object.userData?.noTraversal === true) return false;
            if (/floor|ground/i.test(String(object.name || ''))) return false;
            return true;
        });
    }

    _getForward() {
        const moveDir = this.movement?.moveDirection;
        if (moveDir?.isVector3 && moveDir.lengthSq() > 0.01) {
            this.direction.copy(moveDir).setY(0).normalize();
            return this.direction;
        }

        if (this.camera?.getWorldDirection) {
            this.camera.getWorldDirection(this.direction);
            this.direction.y = 0;
            if (this.direction.lengthSq() > 0.001) {
                this.direction.normalize();
                return this.direction;
            }
        }

        const root = this.character?.model;
        if (root?.getWorldDirection) {
            root.getWorldDirection(this.direction);
            this.direction.y = 0;
            if (this.direction.lengthSq() > 0.001) {
                this.direction.normalize();
                return this.direction;
            }
        }

        return this.direction.set(0, 0, -1);
    }

    _classify(object, topHeight) {
        const explicit = String(object.userData?.traversalType || '').toUpperCase();
        if (explicit && explicit !== 'AUTO') return explicit;

        const name = String(object.name || '').toLowerCase();

        if (/vault|barrier|hurdle/.test(name)) return 'VAULT';
        if (/climbwall|highwall|farwall/.test(name)) return 'CLIMB_WALL';
        if (/climb|mantle/.test(name)) return 'CLIMB';
        if (/jumpplatform|gap/.test(name)) return 'BIG_JUMP';

        const vaultMax = Number(this.config.vaultMaxHeight ?? 1.15);
        const climbMax = Number(this.config.climbMaxHeight ?? 2.05);
        const wallMax = Number(this.config.wallClimbMaxHeight ?? 3.15);

        if (topHeight <= vaultMax) return 'VAULT';
        if (topHeight <= climbMax) return 'CLIMB';
        if (topHeight <= wallMax) return 'CLIMB_WALL';
        return null;
    }

    _getClipForType(type) {
        switch (type) {
            case 'VAULT': return 'VAULT';
            case 'CLIMB': return 'CLIMB';
            case 'CLIMB_WALL': return 'CLIMB_UP_WALL';
            case 'BIG_JUMP': return 'BIG_JUMP';
            case 'JUMP': return 'RUNNING_JUMP';
            default: return null;
        }
    }

    _resolveObstacleRoot(object) {
        if (!object) return null;
        const rootId = object.userData?.obstacleRoot;
        const scene = this.character?.model?.parent;
        if (rootId && scene?.getObjectByProperty) {
            const taggedRoot = scene.getObjectByProperty('uuid', rootId);
            if (taggedRoot) return taggedRoot;
        }

        let current = object;
        let obstacleRoot = object;
        while (current && current !== scene) {
            if (current.userData?.isGameObstacle === true) obstacleRoot = current;
            current = current.parent;
        }
        return obstacleRoot;
    }

    _collectObstacleParts(root) {
        const parts = [];
        root?.traverse?.(object => {
            if (object?.isMesh) parts.push(object);
        });
        if (!parts.length && root?.isMesh) parts.push(root);
        return parts;
    }

    detect() {
        const root = this.character?.model;
        if (!root) return null;

        const collidables = this._getCollidables();
        if (!collidables.length) return null;

        const forward = this._getForward().clone();
        const far = Math.max(0.5, Number(this.config.traversalProbeDistance ?? 1.85));
        const playerY = root.position.y;
        const playerRadius = Math.max(0.1, Number(this.config.traversalPlayerRadius ?? 0.34));
        const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
        const rayHeights = [0.25, 0.62, 1.02, 1.45];
        const lateralOffsets = [0, -playerRadius * 0.72, playerRadius * 0.72];
        let bestHit = null;

        for (const lateral of lateralOffsets) {
            for (const height of rayHeights) {
                this.origin.copy(root.position).addScaledVector(right, lateral);
                this.origin.y += height;

                this.raycaster.set(this.origin, forward);
                this.raycaster.near = 0.04;
                this.raycaster.far = far;

                const hits = this.raycaster.intersectObjects(collidables, false);
                for (const hit of hits) {
                    if (!bestHit || hit.distance < bestHit.distance) {
                        bestHit = { ...hit, probeHeight: height, lateralOffset: lateral };
                    }
                }
            }
        }

        if (!bestHit?.object) return null;

        const hitObject = bestHit.object;
        const obstacle = this._resolveObstacleRoot(hitObject) || hitObject;
        obstacle.updateWorldMatrix?.(true, true);
        this.box.setFromObject(obstacle);
        this.box.getSize(this.boxSize);

        const topHeight = this.box.max.y - playerY;
        if (topHeight < 0.12) return null;

        const depth = Math.max(
            0.18,
            Math.abs(forward.x) * this.boxSize.x +
            Math.abs(forward.z) * this.boxSize.z
        );
        const width = Math.max(
            0.18,
            Math.abs(right.x) * this.boxSize.x +
            Math.abs(right.z) * this.boxSize.z
        );
        const explicitType = String(
            hitObject.userData?.traversalType ||
            obstacle.userData?.traversalType ||
            ''
        ).toUpperCase();
        const start = root.position.clone();
        const frontPoint = bestHit.point.clone();
        const topPoint = frontPoint.clone();
        topPoint.y = this.box.max.y;
        const obstacleParts = this._collectObstacleParts(obstacle);

        return {
            obstacle,
            hitObject,
            obstacleParts,
            explicitType,
            obstacleName: String(obstacle.name || hitObject.name || ''),
            point: frontPoint,
            frontPoint,
            topPoint,
            distance: bestHit.distance,
            topHeight,
            depth,
            thickness: depth,
            width,
            collider: this.box.clone(),
            forward,
            right,
            start,
            playerRadius,
            approachSpeed: Math.max(0, Number(this.movement?.state?.speed || this.movement?.velocity?.length?.() || 0)),
            probeHeight: bestHit.probeHeight,
            lateralOffset: bestHit.lateralOffset
        };
    }
}
window.SMPlayerTraversalDetector = SMPlayerTraversalDetector;
