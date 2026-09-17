class SMPlayerState {
    constructor() {
        this.current = 'IDLE';
        this.previous = 'IDLE';
        this.grounded = true;
        this.speed = 0;
        this.forwardAmount = 0;
        this.rightAmount = 0;
        this.velocity = new THREE.Vector3();
        this.moveDirection = new THREE.Vector3();
        this.firing = false;
        this.enabled = false;

        // Motion Matching / traversal state.
        this.motionMatch = null;
        this.traversal = false;
        this.traversalType = null;
        this.traversalProgress = 0;
        this.traversalObstacle = null;
        this.traversalAnchors = null;
        this.airborne = false;
    }

    setState(next) {
        if (!next || next === this.current) return false;
        this.previous = this.current;
        this.current = next;
        return true;
    }

    setTraversal(type = null, obstacle = null) {
        this.traversal = !!type;
        this.traversalType = type || null;
        this.traversalObstacle = obstacle || null;
        this.traversalProgress = 0;
        this.traversalAnchors = null;
    }

    clearTraversal() {
        this.traversal = false;
        this.traversalType = null;
        this.traversalProgress = 0;
        this.traversalObstacle = null;
        this.traversalAnchors = null;
    }

    reset() {
        this.current = 'IDLE';
        this.previous = 'IDLE';
        this.grounded = true;
        this.speed = 0;
        this.forwardAmount = 0;
        this.rightAmount = 0;
        this.velocity.set(0, 0, 0);
        this.moveDirection.set(0, 0, 0);
        this.firing = false;
        this.motionMatch = null;
        this.airborne = false;
        this.clearTraversal();
    }
}
window.SMPlayerState = SMPlayerState;
