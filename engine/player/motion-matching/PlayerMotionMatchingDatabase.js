/**
 * PlayerMotionMatchingDatabase.js
 * Lightweight feature-driven motion matcher for SM Engine.
 * It scores the available animation clips against current movement intent.
 */
class SMPlayerMotionMatchingDatabase {
    constructor(manifest = window.SMPlayerAnimationManifest, config = window.SMPlayerConfig) {
        this.manifest = manifest || {};
        this.config = config || {};
        this.entries = [];
        this._build();
    }

    _build() {
        this.entries.length = 0;

        // IDLE can be created from the embedded character clip by PlayerAnimationLoader.
        this.entries.push({
            key: 'IDLE',
            category: 'locomotion',
            speed: 0,
            forward: 0,
            right: 0,
            sprint: false,
            grounded: true
        });

        for (const [key, definition] of Object.entries(this.manifest)) {
            const motion = definition?.motion || {};
            if (motion.autoMatch === false) continue;
            if (motion.category !== 'locomotion') continue;

            this.entries.push({
                key,
                category: motion.category,
                speed: Number(motion.speed ?? 0),
                forward: Number(motion.forward ?? 0),
                right: Number(motion.right ?? 0),
                sprint: !!motion.sprint,
                grounded: motion.grounded !== false
            });
        }
    }

    _directionScore(entry, query) {
        const ef = Number(entry.forward || 0);
        const er = Number(entry.right || 0);
        const qf = Number(query.forward || 0);
        const qr = Number(query.right || 0);

        const el = Math.hypot(ef, er);
        const ql = Math.hypot(qf, qr);

        if (el < 0.001 && ql < 0.001) return 0;
        if (el < 0.001 || ql < 0.001) return 1;

        const dot = THREE.MathUtils.clamp(
            (ef * qf + er * qr) / (el * ql),
            -1,
            1
        );
        return (1 - dot) * 0.5;
    }


    _trajectoryScore(entry, query) {
        const trajectory = Array.isArray(query.trajectory) ? query.trajectory : [];
        if (!trajectory.length) return 0;

        const ef = Number(entry.forward || 0);
        const er = Number(entry.right || 0);
        const el = Math.hypot(ef, er);
        const nf = el > 0.001 ? ef / el : 0;
        const nr = el > 0.001 ? er / el : 0;
        const entrySpeed = Math.max(0, Number(entry.speed || 0));
        const maxSpeed = Math.max(0.1, Number(this.config.runSpeed || 6.2), entrySpeed);

        let total = 0;
        for (const sample of trajectory) {
            const t = Math.max(0.05, Number(sample.time || 0.2));
            const qf = Number(sample.forward || 0);
            const qr = Number(sample.right || 0);
            const ql = Math.hypot(qf, qr);
            const qnf = ql > 0.001 ? qf / ql : 0;
            const qnr = ql > 0.001 ? qr / ql : 0;
            const qSpeed = Math.max(0, Number(sample.speed || 0));

            const ex = nr * entrySpeed * t;
            const ez = nf * entrySpeed * t;
            const qx = qnr * qSpeed * t;
            const qz = qnf * qSpeed * t;
            total += Math.hypot(ex - qx, ez - qz) / Math.max(0.1, maxSpeed * t);
        }
        return total / trajectory.length;
    }

    score(entry, query, currentKey = null) {
        const maxSpeed = Math.max(
            0.1,
            Number(this.config.runSpeed || 6.2),
            Number(entry.speed || 0),
            Number(query.speed || 0)
        );

        const speedCost = Math.abs(
            Number(entry.speed || 0) - Number(query.speed || 0)
        ) / maxSpeed;

        const directionCost = this._directionScore(entry, query);
        const trajectoryCost = this._trajectoryScore(entry, query);
        const sprintCost = entry.sprint === !!query.sprint ? 0 : 1;
        const groundedCost = entry.grounded === (query.grounded !== false) ? 0 : 1;

        let score =
            speedCost * Number(this.config.motionSpeedWeight ?? 1.0) +
            directionCost * Number(this.config.motionDirectionWeight ?? 1.35) +
            trajectoryCost * Number(this.config.motionTrajectoryWeight ?? 0.70) +
            sprintCost * Number(this.config.motionSprintWeight ?? 0.30) +
            groundedCost * 2.5;

        // Keep the current clip unless another candidate is meaningfully better.
        if (entry.key === currentKey) {
            score -= Number(this.config.motionContinuityBias ?? 0.16);
        }

        // Strong idle preference when the player is almost stopped.
        if (query.speed < 0.12) {
            score += entry.key === 'IDLE' ? -1.5 : 2.0;
        } else if (entry.key === 'IDLE') {
            score += 2.0;
        }

        return score;
    }

    select(query, hasClip, currentKey = null) {
        let best = null;
        const scored = [];

        for (const entry of this.entries) {
            if (typeof hasClip === 'function' && !hasClip(entry.key)) continue;

            const score = this.score(entry, query, currentKey);
            const item = { ...entry, score };
            scored.push(item);

            if (!best || score < best.score) {
                best = item;
            }
        }

        scored.sort((a, b) => a.score - b.score);
        return {
            best,
            candidates: scored.slice(0, 6)
        };
    }
}
window.SMPlayerMotionMatchingDatabase = SMPlayerMotionMatchingDatabase;