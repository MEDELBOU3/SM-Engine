(function () {
    'use strict';

    /**
     * Lightweight splash renderer shared by every water body. It uses a fixed
     * particle pool and procedural soft points, so rocks can disturb a river
     * without creating temporary meshes or loading sprite textures.
     */
    class SMWaterInteractionFX {
        constructor(
            scene,
            {
                maxParticles = 360,
                color = '#d8f8ff'
            } = {}
        ) {
            if (!scene) {
                throw new Error(
                    'SMWaterInteractionFX requires a THREE.Scene'
                );
            }

            this.scene = scene;
            this.maxParticles = Math.max(
                32,
                Math.floor(maxParticles)
            );
            this.cursor = 0;

            this.positions = new Float32Array(
                this.maxParticles * 3
            );
            this.sizes = new Float32Array(
                this.maxParticles
            );
            this.alphas = new Float32Array(
                this.maxParticles
            );
            this.state = Array.from(
                { length: this.maxParticles },
                () => ({
                    alive: false,
                    life: 0,
                    maxLife: 1,
                    surfaceY: 0,
                    vx: 0,
                    vy: 0,
                    vz: 0,
                    size: 1,
                    mode: 'splash',
                    surfaceLock: false
                })
            );

            const geometry =
                new THREE.BufferGeometry();

            geometry.setAttribute(
                'position',
                new THREE.BufferAttribute(
                    this.positions,
                    3
                )
            );
            geometry.setAttribute(
                'aSize',
                new THREE.BufferAttribute(
                    this.sizes,
                    1
                )
            );
            geometry.setAttribute(
                'aAlpha',
                new THREE.BufferAttribute(
                    this.alphas,
                    1
                )
            );

            const material =
                new THREE.ShaderMaterial({
                    name: 'SMWaterSplashParticles',
                    transparent: true,
                    depthWrite: false,
                    depthTest: true,
                    blending: THREE.NormalBlending,
                    uniforms: {
                        uColor: {
                            value: new THREE.Color(color)
                        }
                    },
                    vertexShader: `
attribute float aSize;
attribute float aAlpha;

varying float vAlpha;

void main() {
    vAlpha = aAlpha;

    vec4 mvPosition =
        modelViewMatrix *
        vec4(position, 1.0);

    gl_PointSize =
        clamp(
            aSize *
            (76.0 / max(-mvPosition.z, 0.25)),
            1.0,
            64.0
        );

    gl_Position =
        projectionMatrix *
        mvPosition;
}
`,
                    fragmentShader: `
uniform vec3 uColor;

varying float vAlpha;

void main() {
    vec2 uv =
        gl_PointCoord * 2.0 - 1.0;

    float r2 =
        dot(uv, uv);

    if (r2 > 1.0) {
        discard;
    }

    float soft =
        pow(
            1.0 - r2,
            1.35
        );

    gl_FragColor =
        vec4(
            uColor,
            soft * vAlpha
        );
}
`
                });

            this.points =
                new THREE.Points(
                    geometry,
                    material
                );

            this.points.name =
                'SMWaterInteractionFX';
            this.points.frustumCulled = false;
            this.points.renderOrder = 62;
            this.points.userData.isWater = true;
            this.points.userData.isWaterFX = true;
            this.points.userData.isSystemObject = true;

            this.scene.add(this.points);
        }

        emitSplash(
            position,
            {
                strength = 0.25,
                radius = 0.8,
                flowDirection = null,
                surfaceY = null
            } = {}
        ) {
            if (!position) {
                return 0;
            }

            const power =
                THREE.MathUtils.clamp(
                    Number(strength) || 0,
                    0.04,
                    1
                );
            const spread =
                THREE.MathUtils.clamp(
                    Number(radius) || 0.8,
                    0.12,
                    8
                );
            const count =
                Math.round(
                    THREE.MathUtils.lerp(
                        4,
                        26,
                        power
                    )
                );

            const flowX =
                Number(flowDirection?.x) ||
                0;
            const flowZ =
                Number(
                    flowDirection?.z ??
                    flowDirection?.y
                ) ||
                0;
            const flowLength =
                Math.hypot(
                    flowX,
                    flowZ
                ) ||
                1;
            const nx =
                flowX / flowLength;
            const nz =
                flowZ / flowLength;
            const y =
                Number.isFinite(surfaceY)
                    ? surfaceY
                    : Number(position.y) ||
                    0;

            for (
                let i = 0;
                i < count;
                i++
            ) {
                const index =
                    this.cursor;

                this.cursor =
                    (
                        this.cursor + 1
                    ) %
                    this.maxParticles;

                const particle =
                    this.state[index];
                const angle =
                    Math.random() *
                    Math.PI * 2;
                const scatter =
                    Math.sqrt(
                        Math.random()
                    ) *
                    spread;
                const outwardX =
                    Math.cos(angle);
                const outwardZ =
                    Math.sin(angle);
                const life =
                    THREE.MathUtils.lerp(
                        0.34,
                        0.95,
                        Math.random()
                    ) *
                    THREE.MathUtils.lerp(
                        0.82,
                        1.35,
                        power
                    );
                const velocity =
                    THREE.MathUtils.lerp(
                        0.9,
                        4.7,
                        power
                    );
                const offset =
                    index * 3;

                this.positions[offset] =
                    Number(position.x) +
                    outwardX *
                    scatter;
                this.positions[offset + 1] =
                    y +
                    0.035 +
                    Math.random() * 0.08;
                this.positions[offset + 2] =
                    Number(position.z) +
                    outwardZ *
                    scatter;

                particle.alive = true;
                particle.mode = 'splash';
                particle.surfaceLock = false;
                particle.life = life;
                particle.maxLife = life;
                particle.surfaceY = y;
                particle.vx =
                    outwardX *
                    velocity *
                    (0.35 + Math.random() * 0.65) +
                    nx *
                    velocity *
                    0.18;
                particle.vy =
                    velocity *
                    (0.36 + Math.random() * 0.74);
                particle.vz =
                    outwardZ *
                    velocity *
                    (0.35 + Math.random() * 0.65) +
                    nz *
                    velocity *
                    0.18;
                particle.size =
                    THREE.MathUtils.lerp(
                        4.0,
                        14.0,
                        power
                    ) *
                    THREE.MathUtils.lerp(
                        0.72,
                        1.22,
                        Math.random()
                    );

                this.sizes[index] =
                    particle.size;
                this.alphas[index] =
                    0.82;
            }

            this._markAttributesDirty();

            return count;
        }


        emitFoamFlecks(
            position,
            {
                strength = 0.35,
                radius = 0.18,
                flowDirection = null,
                surfaceY = null,
                life = 1.8
            } = {}
        ) {
            if (!position) return 0;

            const power =
                THREE.MathUtils.clamp(
                    Number(strength) || 0.35,
                    0.05,
                    1
                );
            const spread =
                THREE.MathUtils.clamp(
                    Number(radius) || 0.18,
                    0.05,
                    1.5
                );
            const count =
                Math.max(
                    1,
                    Math.round(
                        THREE.MathUtils.lerp(
                            1,
                            5,
                            power
                        )
                    )
                );

            const flowX = Number(flowDirection?.x) || 0;
            const flowZ = Number(flowDirection?.z ?? flowDirection?.y) || 0;
            const flowLength = Math.hypot(flowX, flowZ) || 1;
            const nx = flowX / flowLength;
            const nz = flowZ / flowLength;
            const y = Number.isFinite(surfaceY)
                ? surfaceY
                : Number(position.y) || 0;

            for (let i = 0; i < count; i++) {
                const index = this.cursor;
                this.cursor = (this.cursor + 1) % this.maxParticles;

                const particle = this.state[index];
                const angle = Math.random() * Math.PI * 2;
                const scatter = Math.sqrt(Math.random()) * spread;
                const offset = index * 3;
                const maxLife =
                    Math.max(
                        0.35,
                        Number(life) || 1.8
                    ) *
                    THREE.MathUtils.lerp(
                        0.72,
                        1.28,
                        Math.random()
                    );

                this.positions[offset] =
                    Number(position.x) +
                    Math.cos(angle) * scatter;
                this.positions[offset + 1] =
                    y + 0.018 + Math.random() * 0.018;
                this.positions[offset + 2] =
                    Number(position.z) +
                    Math.sin(angle) * scatter;

                particle.alive = true;
                particle.mode = 'foam';
                particle.surfaceLock = true;
                particle.life = maxLife;
                particle.maxLife = maxLife;
                particle.surfaceY = y;
                particle.vx =
                    nx *
                    THREE.MathUtils.lerp(0.18, 0.72, power) +
                    Math.cos(angle) * 0.025;
                particle.vy = 0;
                particle.vz =
                    nz *
                    THREE.MathUtils.lerp(0.18, 0.72, power) +
                    Math.sin(angle) * 0.025;
                particle.size =
                    THREE.MathUtils.lerp(
                        2.2,
                        6.4,
                        power
                    ) *
                    THREE.MathUtils.lerp(
                        0.72,
                        1.20,
                        Math.random()
                    );

                this.sizes[index] = particle.size;
                this.alphas[index] =
                    THREE.MathUtils.lerp(
                        0.34,
                        0.68,
                        power
                    );
            }

            this._markAttributesDirty();
            return count;
        }

        update(delta = 0) {
            const dt =
                THREE.MathUtils.clamp(
                    Number(delta) || 0,
                    0,
                    0.05
                );

            if (dt <= 0) {
                return;
            }

            let changed = false;

            for (
                let i = 0;
                i < this.maxParticles;
                i++
            ) {
                const particle =
                    this.state[i];

                if (!particle.alive) {
                    continue;
                }

                particle.life -= dt;

                const offset =
                    i * 3;

                if (
                    particle.life <= 0
                ) {
                    particle.alive = false;
                    this.alphas[i] = 0;
                    this.sizes[i] = 0;
                    changed = true;
                    continue;
                }

                const life01 =
                    THREE.MathUtils.clamp(
                        particle.life /
                        particle.maxLife,
                        0,
                        1
                    );

                if (particle.mode === 'foam') {
                    const drag =
                        Math.max(
                            0,
                            1.0 -
                            dt * 0.38
                        );

                    particle.vx *= drag;
                    particle.vz *= drag;

                    this.positions[offset] +=
                        particle.vx *
                        dt;
                    this.positions[offset + 1] =
                        particle.surfaceY +
                        0.018 +
                        Math.sin(
                            (particle.maxLife - particle.life) *
                            3.2 +
                            i
                        ) *
                        0.006;
                    this.positions[offset + 2] +=
                        particle.vz *
                        dt;

                    const fadeIn =
                        THREE.MathUtils.clamp(
                            (1.0 - life01) * 5.0,
                            0,
                            1
                        );
                    const fadeOut =
                        THREE.MathUtils.clamp(
                            life01 * 2.4,
                            0,
                            1
                        );

                    this.alphas[i] =
                        fadeIn *
                        fadeOut *
                        0.58;
                    this.sizes[i] =
                        particle.size *
                        (
                            0.72 +
                            (1.0 - life01) *
                            0.34
                        );
                    changed = true;
                    continue;
                }

                particle.vy -=
                    7.4 *
                    dt;

                const drag =
                    Math.max(
                        0,
                        1.0 -
                        dt * 1.65
                    );

                particle.vx *= drag;
                particle.vz *= drag;

                this.positions[offset] +=
                    particle.vx *
                    dt;
                this.positions[offset + 1] +=
                    particle.vy *
                    dt;
                this.positions[offset + 2] +=
                    particle.vz *
                    dt;

                if (
                    this.positions[offset + 1] <=
                    particle.surfaceY &&
                    particle.vy < 0
                ) {
                    particle.alive = false;
                    this.alphas[i] = 0;
                    this.sizes[i] = 0;
                    changed = true;
                    continue;
                }

                this.alphas[i] =
                    life01 *
                    life01 *
                    0.86;
                this.sizes[i] =
                    particle.size *
                    (
                        0.55 +
                        (1.0 - life01) *
                        0.85
                    );
                changed = true;
            }

            if (changed) {
                this._markAttributesDirty();
            }
        }

        _markAttributesDirty() {
            const attributes =
                this.points?.geometry
                    ?.attributes;

            if (!attributes) {
                return;
            }

            attributes.position.needsUpdate = true;
            attributes.aSize.needsUpdate = true;
            attributes.aAlpha.needsUpdate = true;
        }

        dispose() {
            this.scene?.remove?.(
                this.points
            );
            this.points?.geometry?.dispose?.();
            this.points?.material?.dispose?.();
            this.points = null;
            this.state.length = 0;
        }
    }

    window.SMWaterInteractionFX =
        SMWaterInteractionFX;
})();
