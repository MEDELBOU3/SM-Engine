(function () {
    'use strict';

    class SMWaterShorelineSampler {
        constructor(terrainAdapter = null) {
            this.terrainAdapter = terrainAdapter || null;
            this._tmpCurrent = new THREE.Vector3();
        }

        setTerrainAdapter(adapter) {
            this.terrainAdapter = adapter || null;
        }

        _smooth01(t) {
            t = THREE.MathUtils.clamp(Number(t) || 0, 0, 1);
            return t * t * (3 - 2 * t);
        }

        _sampleHeightfieldContext(context, x, z) {
            const root = context?.root;
            const data = context?.data;
            if (
                !root ||
                !data?.heights ||
                !data.resolutionX ||
                !data.resolutionZ ||
                typeof data.index !== 'function' ||
                typeof data.localX !== 'function' ||
                typeof data.localZ !== 'function'
            ) {
                return null;
            }

            root.updateMatrixWorld?.(true);

            const world = new THREE.Vector3(x, 0, z);
            // Y is irrelevant for x/z projection because terrain roots in SM Engine
            // are expected to use standard affine transforms.
            const inverse = new THREE.Matrix4()
                .copy(root.matrixWorld)
                .invert();
            const local = world.clone().applyMatrix4(inverse);

            const rx = data.resolutionX;
            const rz = data.resolutionZ;
            const x0 = data.localX(0);
            const x1 = data.localX(rx - 1);
            const z0 = data.localZ(0);
            const z1 = data.localZ(rz - 1);
            const minX = Math.min(x0, x1);
            const maxX = Math.max(x0, x1);
            const minZ = Math.min(z0, z1);
            const maxZ = Math.max(z0, z1);

            if (
                local.x < minX ||
                local.x > maxX ||
                local.z < minZ ||
                local.z > maxZ
            ) {
                return null;
            }

            const fx =
                (local.x - x0) /
                Math.max(Math.abs(x1 - x0), 1e-6) *
                (rx - 1) *
                Math.sign(x1 - x0 || 1);
            const fz =
                (local.z - z0) /
                Math.max(Math.abs(z1 - z0), 1e-6) *
                (rz - 1) *
                Math.sign(z1 - z0 || 1);

            const gx = THREE.MathUtils.clamp(fx, 0, rx - 1);
            const gz = THREE.MathUtils.clamp(fz, 0, rz - 1);
            const ax = Math.floor(gx);
            const az = Math.floor(gz);
            const bx = Math.min(rx - 1, ax + 1);
            const bz = Math.min(rz - 1, az + 1);
            const tx = gx - ax;
            const tz = gz - az;

            const h00 = Number(data.heights[data.index(ax, az)]) || 0;
            const h10 = Number(data.heights[data.index(bx, az)]) || 0;
            const h01 = Number(data.heights[data.index(ax, bz)]) || 0;
            const h11 = Number(data.heights[data.index(bx, bz)]) || 0;

            const h0 = THREE.MathUtils.lerp(h00, h10, tx);
            const h1 = THREE.MathUtils.lerp(h01, h11, tx);
            const localY =
                THREE.MathUtils.lerp(h0, h1, tz) *
                Math.max(0.0001, Number(data.heightScale) || 1);

            const worldPoint =
                new THREE.Vector3(
                    local.x,
                    localY,
                    local.z
                ).applyMatrix4(root.matrixWorld);

            return worldPoint.y;
        }

        _sampleTerrainY(x, z) {
            const contexts =
                this.terrainAdapter?.terrainContexts ||
                [];

            for (const context of contexts) {
                const y =
                    this._sampleHeightfieldContext(
                        context,
                        x,
                        z
                    );
                if (Number.isFinite(y)) {
                    return y;
                }
            }

            // Legacy/non-heightfield fallback.
            return this.terrainAdapter?.sampleHeightAt?.(x, z) ?? null;
        }

        _sampleSlope(x, z, nx, nz, radius = 0.35) {
            const a = this._sampleTerrainY(x - nx * radius, z - nz * radius);
            const b = this._sampleTerrainY(x + nx * radius, z + nz * radius);
            if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
            return Math.abs(b - a) / Math.max(radius * 2, 1e-4);
        }

        _curvature(curve, t, eps) {
            const ta = Math.max(0, t - eps);
            const tb = Math.min(1, t + eps);
            const a = curve.getTangentAt(ta).setY(0).normalize();
            const b = curve.getTangentAt(tb).setY(0).normalize();
            return THREE.MathUtils.clamp(a.angleTo(b) / 0.55, 0, 1);
        }

        _intensity(body, sample) {
            const config = body.config || {};
            const foamStrength = THREE.MathUtils.clamp(
                Number(config.riverbankFoamIntensity ?? config.foamStrength ?? 0.30),
                0,
                2
            );
            const depthLimit = Math.max(
                0.03,
                Number(config.riverbankFoamDepth ?? config.shoreFoamDepth ?? 0.48)
            );
            const depth01 = Number.isFinite(sample.waterDepth)
                ? 1 - this._smooth01(sample.waterDepth / depthLimit)
                : 0.55;

            const currentReference = Math.max(
                0.25,
                Number(config.currentStrength ?? 1.5)
            );
            const current01 = THREE.MathUtils.clamp(
                sample.currentSpeed / currentReference,
                0,
                1
            );
            const slope01 = THREE.MathUtils.clamp(sample.bankSlope / 1.15, 0, 1);
            const turbulence01 = THREE.MathUtils.clamp(
                sample.curvature * 0.70 + current01 * 0.30,
                0,
                1
            );

            // Contact is always present, but flow/slope/curvature decide how dense it is.
            const physical =
                0.34 +
                depth01 * 0.30 +
                current01 * 0.18 +
                slope01 * 0.10 +
                turbulence01 * 0.18;

            return THREE.MathUtils.clamp(
                foamStrength * physical,
                0,
                1.35
            );
        }

        sampleRiver(body, options = {}) {
            if (!body || body.type !== 'river' || body.points?.length < 2) {
                return { left: [], right: [], length: 0, spacing: 0 };
            }

            const config = body.config || {};
            const curve = new THREE.CatmullRomCurve3(
                body.points,
                false,
                'catmullrom',
                0.35
            );

            const length = Math.max(curve.getLength(), 0.001);
            const width = Math.max(0.25, Number(config.width || 4));
            const halfWidth = width * 0.5;

            const requestedSpacing = Math.max(
                0.12,
                Number(options.spacing ?? config.riverbankFoamSpacing ?? 0.42)
            );
            const maxSamples = Math.max(
                16,
                Math.floor(Number(options.maxSamples ?? config.riverbankFoamMaxSamples ?? 900))
            );
            const count = THREE.MathUtils.clamp(
                Math.ceil(length / requestedSpacing) + 1,
                16,
                maxSamples
            );
            const spacing = length / Math.max(1, count - 1);

            const contactInset = THREE.MathUtils.clamp(
                Number(config.riverbankFoamContactInset ?? 0.06),
                0,
                Math.max(0.02, halfWidth * 0.20)
            );

            const left = [];
            const right = [];
            const eps = Math.min(0.025, Math.max(1 / Math.max(count - 1, 1), 0.0025));

            for (let i = 0; i < count; i++) {
                const t = i / Math.max(1, count - 1);
                const center = curve.getPointAt(t);
                const tangent = curve.getTangentAt(t).setY(0);
                if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
                tangent.normalize();

                if (config.flowReverse) tangent.multiplyScalar(-1);

                const geometricTangent = curve.getTangentAt(t).setY(0);
                if (geometricTangent.lengthSq() < 1e-8) geometricTangent.set(1, 0, 0);
                geometricTangent.normalize();

                const side = new THREE.Vector3(
                    -geometricTangent.z,
                    0,
                    geometricTangent.x
                ).normalize();

                const curvature = this._curvature(curve, t, eps);

                for (const sign of [-1, 1]) {
                    const bank = center
                        .clone()
                        .addScaledVector(side, sign * (halfWidth - contactInset));

                    const inward = side.clone().multiplyScalar(-sign);
                    const surfaceY = Number(body.surfaceYAt?.(bank.x, bank.z, false));
                    bank.y = Number.isFinite(surfaceY) ? surfaceY : center.y;

                    const terrainY = this._sampleTerrainY(bank.x, bank.z);
                    const waterDepth = Number.isFinite(terrainY)
                        ? Math.max(0, bank.y - terrainY)
                        : Math.max(
                            0.01,
                            Number(body.depthAt?.(bank.x, bank.z) ?? config.shoreDepth ?? 0.08)
                        );

                    const bankSlope = this._sampleSlope(
                        bank.x,
                        bank.z,
                        side.x,
                        side.z,
                        Math.max(0.22, Math.min(0.65, width * 0.08))
                    );

                    this._tmpCurrent.set(0, 0, 0);
                    body.currentAt?.(
                        bank.x + inward.x * 0.12,
                        bank.z + inward.z * 0.12,
                        this._tmpCurrent
                    );
                    const currentSpeed = this._tmpCurrent.length();

                    const sample = {
                        t,
                        distance: t * length,
                        position: bank,
                        tangent: tangent.clone(),
                        inward,
                        outward: inward.clone().multiplyScalar(-1),
                        side: sign < 0 ? 'left' : 'right',
                        bankSign: sign,
                        surfaceY: bank.y,
                        terrainY,
                        waterDepth,
                        bankSlope,
                        currentSpeed,
                        curvature,
                        intensity: 0
                    };

                    sample.intensity = this._intensity(body, sample);
                    (sign < 0 ? left : right).push(sample);
                }
            }

            return { left, right, length, spacing };
        }

        sample(body, options = {}) {
            if (body?.type === 'river') {
                return this.sampleRiver(body, options);
            }
            return { left: [], right: [], length: 0, spacing: 0 };
        }
    }

    window.SMWaterShorelineSampler = SMWaterShorelineSampler;
})();