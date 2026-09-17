class SMPlayerMovementController {
    constructor(
        character,
        input,
        state,
        rotation,
        camera,
        config = window.SMPlayerConfig
    ) {
        this.character = character;
        this.input = input;
        this.state = state;
        this.rotation = rotation;
        this.camera = camera;
        this.config = config;
        this.enabled = false;

        this.velocity = new THREE.Vector3();
        this.desiredVelocity = new THREE.Vector3();
        this.moveDirection = new THREE.Vector3();
        this.targetDirection = new THREE.Vector3();
        this.cameraForward = new THREE.Vector3();
        this.cameraRight = new THREE.Vector3();

        this.stableGroundY = null;
        this.directionSmoothing = 12;

        this.physics = null;
        this._physicsStart = new THREE.Vector3();
        this._physicsDesired = new THREE.Vector3();
    }

    setPhysicsController(physics) {
        this.physics = physics || null;

        if (
            this.physics &&
            this.character?.model
        ) {
            this.stableGroundY =
                this.character.model.position.y;
        }

        return this.physics;
    }

    _physicsActive() {
        return !!(
            this.physics &&
            this.physics.enabled &&
            typeof this.physics.resolveMovement ===
                'function'
        );
    }

    _applyCharacterPhysics(
        delta,
        {
            horizontal = true
        } = {}
    ) {
        const root =
            this.character?.model;

        if (!root || !this._physicsActive()) {
            return null;
        }

        this._physicsStart.copy(
            root.position
        );

        this._physicsDesired.copy(
            root.position
        );

        if (horizontal) {
            this._physicsDesired.x +=
                this.velocity.x * delta;

            this._physicsDesired.z +=
                this.velocity.z * delta;
        }

        const result =
            this.physics.resolveMovement(
                this._physicsStart,
                this._physicsDesired,
                this.velocity,
                delta
            );

        root.position.copy(
            this._physicsDesired
        );

        if (
            Number.isFinite(
                result?.verticalVelocity
            )
        ) {
            this.velocity.y =
                result.verticalVelocity;
        }

        if (this.state) {
            this.state.grounded =
                result?.grounded === true;

            this.state.airborne =
                !this.state.grounded;
        }

        if (result?.grounded) {
            this.stableGroundY =
                root.position.y;
        }

        return result;
    }

    update(delta) {
        if (
            !this.enabled ||
            !this.character.model
        ) {
            return;
        }

        const root =
            this.character.model;

        if (
            !Number.isFinite(
                this.stableGroundY
            )
        ) {
            this.stableGroundY =
                root.position.y;
        }

        const forwardInput =
            this.input.forward;

        const rightInput =
            this.input.right;

        this.state.forwardAmount =
            forwardInput;

        this.state.rightAmount =
            rightInput;

        SMPlayerUtils.getCameraForward(
            this.camera,
            this.cameraForward
        );

        SMPlayerUtils.getCameraRight(
            this.camera,
            this.cameraRight
        );

        this.targetDirection.set(
            0,
            0,
            0
        );

        this.targetDirection.addScaledVector(
            this.cameraForward,
            forwardInput
        );

        this.targetDirection.addScaledVector(
            this.cameraRight,
            rightInput
        );

        if (
            this.targetDirection.lengthSq() >
            1
        ) {
            this.targetDirection.normalize();
        }

        if (
            this.targetDirection.lengthSq() >
            0.0001
        ) {
            const directionAlpha =
                1 -
                Math.exp(
                    -this.directionSmoothing *
                        delta
                );

            if (
                this.moveDirection.lengthSq() <
                0.0001
            ) {
                this.moveDirection.copy(
                    this.targetDirection
                );
            } else {
                this.moveDirection.lerp(
                    this.targetDirection,
                    directionAlpha
                );

                this.moveDirection.y = 0;

                if (
                    this.moveDirection.lengthSq() >
                    0.0001
                ) {
                    this.moveDirection.normalize();
                }
            }
        } else if (
            this.state.speed < 0.05
        ) {
            this.moveDirection.set(
                0,
                0,
                0
            );
        }

        let targetSpeed = 0;

        if (forwardInput < 0) {
            targetSpeed =
                this.config.backwardSpeed ??
                4.2;
        } else if (
            forwardInput > 0 &&
            this.input.sprint
        ) {
            targetSpeed =
                this.config.runSpeed ??
                6.2;
        } else if (
            forwardInput > 0 &&
            rightInput !== 0
        ) {
            targetSpeed =
                this.config
                    .diagonalRunSpeed ??
                5.2;
        } else if (
            forwardInput !== 0 ||
            rightInput !== 0
        ) {
            targetSpeed =
                this.config.walkSpeed ??
                3.2;
        }

        this.desiredVelocity
            .copy(
                this.moveDirection
            )
            .multiplyScalar(
                targetSpeed
            );

        const currentHorizontalSpeed =
            Math.sqrt(
                this.velocity.x *
                    this.velocity.x +
                this.velocity.z *
                    this.velocity.z
            );

        const desiredHorizontalSpeed =
            Math.sqrt(
                this.desiredVelocity.x *
                    this.desiredVelocity.x +
                this.desiredVelocity.z *
                    this.desiredVelocity.z
            );

        const accelerating =
            desiredHorizontalSpeed >
            currentHorizontalSpeed;

        const smoothing =
            accelerating
                ? (
                    this.config
                        .acceleration ??
                    14
                )
                : (
                    this.config
                        .deceleration ??
                    18
                );

        this.velocity.x =
            SMPlayerUtils.damp(
                this.velocity.x,
                this.desiredVelocity.x,
                smoothing,
                delta
            );

        this.velocity.z =
            SMPlayerUtils.damp(
                this.velocity.z,
                this.desiredVelocity.z,
                smoothing,
                delta
            );

        let physicsResult = null;

        if (this._physicsActive()) {
            physicsResult =
                this._applyCharacterPhysics(
                    delta,
                    {
                        horizontal: true
                    }
                );
        } else {
            // Legacy fallback used when PlayerPhysicsController.js is not loaded.
            this.velocity.y = 0;

            root.position.x +=
                this.velocity.x *
                delta;

            root.position.z +=
                this.velocity.z *
                delta;

            root.position.y =
                this.stableGroundY;

            this.state.grounded = true;
            this.state.airborne = false;
        }

        const speed =
            Math.sqrt(
                this.velocity.x *
                    this.velocity.x +
                this.velocity.z *
                    this.velocity.z
            );

        if (speed > 0.05) {
            const actualDirection =
                new THREE.Vector3(
                    this.velocity.x,
                    0,
                    this.velocity.z
                ).normalize();

            this.rotation.update(
                actualDirection,
                delta
            );
        }

        this.state.speed = speed;

        this.state.velocity.copy(
            this.velocity
        );

        this.state.moveDirection.copy(
            this.moveDirection
        );

        return physicsResult;
    }

    // Keeps an idle player attached to a live deforming landscape even while
    // movement input is disabled. This is what makes Raise/Lower work beneath
    // a placed player in Terrain Sculpting Mode.
    updatePassivePhysics(delta) {
        if (
            !this.character?.model ||
            !this._physicsActive()
        ) {
            return null;
        }

        this.velocity.x = 0;
        this.velocity.z = 0;

        const result =
            this._applyCharacterPhysics(
                delta,
                {
                    horizontal: false
                }
            );

        if (this.state) {
            this.state.speed = 0;

            this.state.velocity.copy(
                this.velocity
            );
        }

        return result;
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;

        if (
            this.enabled &&
            this.character?.model
        ) {
            this.stableGroundY =
                this.character.model.position.y;
        }

        if (!this.enabled) {
            this.velocity.set(
                0,
                0,
                0
            );

            this.desiredVelocity.set(
                0,
                0,
                0
            );

            this.moveDirection.set(
                0,
                0,
                0
            );

            this.targetDirection.set(
                0,
                0,
                0
            );
        }
    }

    setGroundHeight(y) {
        if (!Number.isFinite(y)) return;

        this.stableGroundY = y;

        if (
            this.character?.model
        ) {
            this.character.model.position.y =
                y;
        }
    }

    syncGroundHeight() {
        if (!this.character?.model) {
            return;
        }

        this.stableGroundY =
            this.character.model.position.y;
    }
}

window.SMPlayerMovementController =
    SMPlayerMovementController;