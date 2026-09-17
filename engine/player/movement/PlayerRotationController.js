class SMPlayerRotationController {
    constructor(character, config = window.SMPlayerConfig) {
        this.character = character;
        this.config = config;
        this.enabled = true;
        this.currentDirection = new THREE.Vector3();
    }
    update(direction, delta) {
        if (!this.enabled) return;
        const root = this.character?.model;
        if (!root) return;
        if (!direction || direction.lengthSq() < 0.0001) return;
        this.currentDirection.copy(direction);
        this.currentDirection.y = 0;
        if (this.currentDirection.lengthSq() < 0.0001) return;
        this.currentDirection.normalize();
        const worldDirectionYaw = Math.atan2(
            this.currentDirection.x,
            this.currentDirection.z
        );
        const visualYawOffset =
            Number(this.config.visualYawOffset) || 0;
        const targetRootYaw =
            worldDirectionYaw -
            visualYawOffset;
        root.rotation.y = SMPlayerUtils.dampAngle(
            root.rotation.y,
            targetRootYaw,
            this.config.rotationSpeed ?? 18,
            delta
        );
    }
    snapToDirection(direction) {
        const root = this.character?.model;
        if (!root) return;
        if (!direction || direction.lengthSq() < 0.0001) return;
        this.currentDirection.copy(direction);
        this.currentDirection.y = 0;
        if (this.currentDirection.lengthSq() < 0.0001) return;
        this.currentDirection.normalize();
        const worldDirectionYaw = Math.atan2(
            this.currentDirection.x,
            this.currentDirection.z
        );
        const visualYawOffset =
            Number(this.config.visualYawOffset) || 0;
        root.rotation.y =
            worldDirectionYaw -
            visualYawOffset;
    }
    setEnabled(enabled) {
        this.enabled = !!enabled;
    }
}
window.SMPlayerRotationController = SMPlayerRotationController;