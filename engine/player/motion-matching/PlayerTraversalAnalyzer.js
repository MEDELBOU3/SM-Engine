/**
 * Converts raw obstacle measurements into a safe traversal plan.
 * Detection and classification deliberately stay separate so animations never
 * decide whether geometry is traversable.
 */
class SMPlayerTraversalAnalyzer {
    constructor({ physics = null, config = window.SMPlayerConfig } = {}) {
        this.physics = physics;
        this.config = config || {};
    }

    _normalizeType(type) {
        const key = String(type || '').toUpperCase();
        if (key === 'MANTLE') return 'CLIMB';
        if (key === 'WALL_CLIMB') return 'CLIMB_WALL';
        return key;
    }

    _classify(measurement) {
        const explicit = this._normalizeType(measurement.explicitType);
        if (explicit && explicit !== 'AUTO') return explicit;

        const name = String(measurement.obstacleName || '').toLowerCase();
        if (/vault|barrier|hurdle/.test(name)) return 'VAULT';
        if (/climbwall|highwall|farwall/.test(name)) return 'CLIMB_WALL';
        if (/climb|mantle/.test(name)) return 'CLIMB';
        if (/jumpplatform|gap/.test(name)) return 'BIG_JUMP';

        const height = Number(measurement.topHeight || 0);
        const depth = Number(measurement.depth || 0);
        const stepHeight = Number(this.config.maxStepHeight ?? 0.45);
        const vaultMaxHeight = Number(this.config.vaultMaxHeight ?? 1.15);
        const vaultMaxDepth = Number(this.config.vaultMaxDepth ?? 1.45);
        const climbMaxHeight = Number(this.config.climbMaxHeight ?? 2.05);
        const wallMaxHeight = Number(this.config.wallClimbMaxHeight ?? 3.15);

        if (height <= stepHeight) return 'STEP';
        if (height <= vaultMaxHeight && depth <= vaultMaxDepth) return 'VAULT';
        if (height <= climbMaxHeight) return 'CLIMB';
        if (height <= wallMaxHeight) return 'CLIMB_WALL';
        return null;
    }

    _ignoreObjects(measurement) {
        const ignored = new Set(measurement.obstacleParts || []);
        if (measurement.obstacle) ignored.add(measurement.obstacle);
        if (measurement.hitObject) ignored.add(measurement.hitObject);
        return Array.from(ignored);
    }

    _groundLanding(candidate, fallbackY) {
        if (!this.physics) {
            candidate.y = fallbackY;
            return candidate;
        }
        const hit = this.physics.probeGround(candidate, Math.max(candidate.y, fallbackY) + 0.65, 2.6);
        candidate.y = hit
            ? hit.point.y + this.physics.groundOffset
            : fallbackY;
        return candidate;
    }

    _findSafeLanding(measurement, type, ignored) {
        const start = measurement.start.clone();
        const forward = measurement.forward.clone().setY(0).normalize();
        const right = measurement.right.clone().setY(0).normalize();
        const radius = Number(measurement.playerRadius || this.physics?.radius || 0.34);
        const hitDistance = Math.max(0.08, Number(measurement.distance || 0));
        const depth = Math.max(0.18, Number(measurement.depth || 0.18));
        const landingOffset = Math.max(
            0.18,
            Number(measurement.obstacle?.userData?.traversalLandingOffset ?? this.config.traversalLandingOffset ?? 0.55)
        );

        if (type === 'CLIMB' || type === 'CLIMB_WALL') {
            const ontoDistance = hitDistance + Math.min(
                Math.max(radius + 0.16, depth * 0.22 + radius),
                Math.max(radius + 0.18, depth - radius * 0.55)
            );
            const end = start.clone().addScaledVector(forward, ontoDistance);
            end.y = measurement.collider.max.y + Number(this.physics?.groundOffset ?? this.config.groundOffset ?? 0.025);
            if (!this.physics || this.physics.validateTraversalLanding(end, { ignoreObjects: ignored })) return end;
            return null;
        }

        const baseDistance = hitDistance + depth + radius + landingOffset;
        const forwardOffsets = [0, radius * 0.65, radius * 1.35];
        const sideOffsets = [0, radius * 1.15, -radius * 1.15];
        for (const extra of forwardOffsets) {
            for (const side of sideOffsets) {
                const candidate = start.clone()
                    .addScaledVector(forward, baseDistance + extra)
                    .addScaledVector(right, side);
                this._groundLanding(candidate, start.y);
                if (!this.physics || this.physics.validateTraversalLanding(candidate, { ignoreObjects: ignored })) {
                    return candidate;
                }
            }
        }
        return null;
    }

    analyze(measurement) {
        if (!measurement?.collider || !measurement?.start || !measurement?.forward) return null;
        const type = this._classify(measurement);
        if (!type || type === 'STEP') return null;

        const ignored = this._ignoreObjects(measurement);
        const end = this._findSafeLanding(measurement, type, ignored);
        if (!end) return null;

        const topPoint = measurement.topPoint.clone();
        const frontPoint = measurement.frontPoint.clone();
        const forward = measurement.forward.clone().setY(0).normalize();
        const clearance = Math.max(0.12, Number(this.config.traversalClearance ?? 0.22));
        const apex = start => {
            const point = start.clone().lerp(end, 0.5);
            point.y = Math.max(
                measurement.collider.max.y + clearance,
                start.y + Number(this.config.jumpArcHeight ?? 1.0)
            );
            return point;
        };

        return {
            type,
            obstacle: measurement.obstacle,
            hitObject: measurement.hitObject,
            ignoreObjects: ignored,
            collider: measurement.collider.clone(),
            topHeight: measurement.topHeight,
            depth: measurement.depth,
            width: measurement.width,
            approachSpeed: measurement.approachSpeed,
            start: measurement.start.clone(),
            end,
            forward,
            anchors: {
                approach: measurement.start.clone(),
                contact: frontPoint,
                top: topPoint,
                apex: apex(measurement.start),
                landing: end.clone()
            }
        };
    }
}

window.SMPlayerTraversalAnalyzer = SMPlayerTraversalAnalyzer;
