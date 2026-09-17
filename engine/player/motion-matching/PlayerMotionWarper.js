/**
 * Collision-aware root motion warping.  The animation provides the pose while
 * this class maps the character root to measured obstacle anchors.
 */
class SMPlayerMotionWarper {
    constructor({ physics = null, config = window.SMPlayerConfig } = {}) {
        this.physics = physics;
        this.config = config || {};
        this._desired = new THREE.Vector3();
        this._contact = new THREE.Vector3();
        this._top = new THREE.Vector3();
    }

    begin(plan, selection, duration) {
        const radius = Number(this.physics?.radius ?? this.config.traversalPlayerRadius ?? 0.34);
        this._contact.copy(plan.anchors?.contact || plan.start)
            .addScaledVector(plan.forward, -radius * 0.78);
        this._contact.y = plan.start.y;
        this._top.copy(plan.anchors?.top || plan.end)
            .addScaledVector(plan.forward, Math.min(radius + 0.12, Math.max(0.18, Number(plan.depth || 0.5) * 0.22)));
        this._top.y = plan.end.y;

        return {
            ...plan,
            clip: selection.clip,
            playRate: selection.playRate,
            blendIn: selection.blendIn,
            blendOut: selection.blendOut,
            duration: Math.max(0.1, duration),
            elapsed: 0,
            lastSafe: plan.start.clone(),
            blockedFrames: 0,
            contactRoot: this._contact.clone(),
            topRoot: this._top.clone()
        };
    }

    _smooth(t) {
        const x = THREE.MathUtils.clamp(t, 0, 1);
        return x * x * (3 - 2 * x);
    }

    _sample(runtime, t, out) {
        const smooth = this._smooth(t);
        if (runtime.type === 'CLIMB' || runtime.type === 'CLIMB_WALL') {
            if (smooth < 0.34) {
                out.lerpVectors(runtime.start, runtime.contactRoot, this._smooth(smooth / 0.34));
            } else if (smooth < 0.76) {
                out.lerpVectors(runtime.contactRoot, runtime.topRoot, this._smooth((smooth - 0.34) / 0.42));
            } else {
                out.lerpVectors(runtime.topRoot, runtime.end, this._smooth((smooth - 0.76) / 0.24));
            }
            return out;
        }

        out.lerpVectors(runtime.start, runtime.end, smooth);
        const baseMidY = THREE.MathUtils.lerp(runtime.start.y, runtime.end.y, 0.5);
        const desiredApexY = Math.max(
            Number(runtime.anchors?.apex?.y || 0),
            Number(runtime.collider?.max?.y || 0) + Number(this.config.traversalClearance ?? 0.22)
        );
        const configuredArc = runtime.type === 'BIG_JUMP'
            ? Number(this.config.bigJumpArcHeight ?? 1.55)
            : Number(this.config.jumpArcHeight ?? 1.0);
        const arc = Math.max(configuredArc, desiredApexY - baseMidY);
        out.y += Math.sin(Math.PI * t) * arc;
        return out;
    }

    update(runtime, delta, root) {
        runtime.elapsed += Math.max(0, Number(delta) || 0);
        const progress = THREE.MathUtils.clamp(runtime.elapsed / runtime.duration, 0, 1);
        this._sample(runtime, progress, this._desired);

        const constrained = this.physics?.constrainTraversalMovement
            ? this.physics.constrainTraversalMovement(root.position, this._desired, {
                ignoreObjects: runtime.ignoreObjects
            })
            : { position: this._desired, blocked: false, hitObject: null };

        if (constrained.blocked) runtime.blockedFrames += 1;
        else runtime.blockedFrames = 0;

        root.position.copy(constrained.position);
        root.updateMatrixWorld(true);
        if (!constrained.blocked) runtime.lastSafe.copy(root.position);

        return {
            progress,
            finished: progress >= 1,
            aborted: runtime.blockedFrames >= 3,
            hitObject: constrained.hitObject
        };
    }

    validateFinish(runtime) {
        if (!this.physics?.validateTraversalLanding) return true;
        return this.physics.validateTraversalLanding(runtime.end, {
            ignoreObjects: runtime.ignoreObjects
        });
    }
}

window.SMPlayerMotionWarper = SMPlayerMotionWarper;
