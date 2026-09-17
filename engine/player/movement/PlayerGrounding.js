class SMPlayerGrounding {
    constructor(
        scene,
        character,
        config = window.SMPlayerConfig
    ) {
        this.scene = scene;
        this.character = character;
        this.config = config;

        this.raycaster =
            new THREE.Raycaster();

        this.origin =
            new THREE.Vector3();

        this.direction =
            new THREE.Vector3(
                0,
                -1,
                0
            );

        this.grounded = false;
        this.groundObject = null;
        this.groundNormal =
            new THREE.Vector3(
                0,
                1,
                0
            );
        this.groundY = 0;
    }

    _isValidGroundObject(obj) {
        if (!obj?.isMesh) return false;
        if (obj.visible === false) return false;
        if (obj.userData?.isPlayer) return false;
        if (obj.userData?.isPlayerVisual) return false;

        if (
            obj.userData?.workspaceOnly ===
            'PLAYER'
        ) {
            return false;
        }

        if (
            obj.userData
                ?.ignorePlayerGrounding ===
            true
        ) {
            return false;
        }

        return true;
    }

    _collectGroundCandidates() {
        const candidates = [];

        this.scene.traverse(obj => {
            if (
                this._isValidGroundObject(
                    obj
                )
            ) {
                candidates.push(obj);
            }
        });

        return candidates;
    }

    _probeTerrain(root) {
        const query =
            window.TerrainSculpting
                ?.surfaceQuery ||
            window.TerrainSurfaceQuery;

        if (!query?.hasTerrain?.()) {
            return null;
        }

        const checkHeight =
            this.config
                .groundCheckHeight ??
            0.65;

        const checkDistance =
            this.config
                .groundCheckDistance ??
            0.35;

        return query.getGroundInfo(
            root.position,
            {
                probeUp:
                    checkHeight,
                probeDown:
                    checkHeight +
                    checkDistance,
                minNormalY: -1
            }
        );
    }

    update() {
        const root =
            this.character.model;

        if (!root) {
            this.grounded = false;
            return false;
        }

        const checkHeight =
            this.config
                .groundCheckHeight ??
            0.65;

        const checkDistance =
            this.config
                .groundCheckDistance ??
            0.35;

        const groundOffset =
            this.config
                .groundOffset ??
            0.02;

        const maxStepHeight =
            this.config
                .maxStepHeight ??
            0.45;

        let hit =
            this._probeTerrain(root);

        if (hit) {
            hit = {
                object: hit.object,
                point: hit.point,
                smGroundNormal:
                    hit.normal
            };
        } else {
            this.origin.set(
                root.position.x,
                root.position.y +
                    checkHeight,
                root.position.z
            );

            this.raycaster.set(
                this.origin,
                this.direction
            );

            this.raycaster.near = 0;
            this.raycaster.far =
                checkHeight +
                checkDistance;

            const hits =
                this.raycaster
                    .intersectObjects(
                        this._collectGroundCandidates(),
                        false
                    );

            hit =
                hits[0] || null;
        }

        if (!hit) {
            this.grounded = false;
            this.groundObject = null;
            return false;
        }

        const desiredRootY =
            hit.point.y +
            groundOffset;

        const verticalDifference =
            desiredRootY -
            root.position.y;

        if (
            verticalDifference >
            maxStepHeight
        ) {
            this.grounded = false;
            this.groundObject = null;
            return false;
        }

        this.grounded = true;
        this.groundObject =
            hit.object;

        this.groundY =
            hit.point.y;

        if (hit.smGroundNormal) {
            this.groundNormal.copy(
                hit.smGroundNormal
            );
        } else if (hit.face?.normal) {
            this.groundNormal
                .copy(
                    hit.face.normal
                )
                .transformDirection(
                    hit.object.matrixWorld
                )
                .normalize();
        } else {
            this.groundNormal.set(
                0,
                1,
                0
            );
        }

        if (
            verticalDifference >=
                -checkDistance &&
            verticalDifference <=
                maxStepHeight
        ) {
            root.position.y =
                desiredRootY;
        }

        return true;
    }
}

window.SMPlayerGrounding =
    SMPlayerGrounding;