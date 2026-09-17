(function () {
    'use strict';

    class SMWaterVolumeMaterialFactory {
        static defaults() {
            return {
                waterVolumeColor: '#0b607a',
                waterVolumeDeepColor: '#032f43',
                // Side walls need enough optical density to read as a water
                // column against the carved terrain, while remaining lighter
                // than the actual surface.
                waterVolumeOpacity: 0.12,
                waterVolumeNoiseStrength: 0.08,
                waterVolumeNoiseScale: 0.12,
                waterVolumeVisible: true
            };
        }

        static normalizeOptions(options = {}) {
            return {
                ...this.defaults(),
                ...options
            };
        }

        static create(options = {}) {
            const o = this.normalizeOptions(options);

            const material = new THREE.ShaderMaterial({
                name: 'SMWaterVolumeMaterial',
                transparent: true,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
                blending: THREE.NormalBlending,
                toneMapped: false,
                uniforms: {
                    uTime: {
                        value: 0
                    },
                    uColor: {
                        value: new THREE.Color(
                            o.waterVolumeColor
                        )
                    },
                    uDeepColor: {
                        value: new THREE.Color(
                            o.waterVolumeDeepColor
                        )
                    },
                    uOpacity: {
                        value: Number(
                            o.waterVolumeOpacity
                        )
                    },
                    uNoiseStrength: {
                        value: Number(
                            o.waterVolumeNoiseStrength
                        )
                    },
                    uNoiseScale: {
                        value: Number(
                            o.waterVolumeNoiseScale
                        )
                    }
                },
                vertexShader: `
precision highp float;

attribute float smVolumeDepth01;

uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vVolumeDepth01;

void main() {
    vVolumeDepth01 =
        clamp(
            smVolumeDepth01,
            0.0,
            1.0
        );

    vec4 worldPosition =
        modelMatrix *
        vec4(
            position,
            1.0
        );

    vWorldPosition =
        worldPosition.xyz;

    vWorldNormal =
        normalize(
            mat3(modelMatrix) *
            normal
        );

    gl_Position =
        projectionMatrix *
        viewMatrix *
        worldPosition;
}
`,
                fragmentShader: `
precision highp float;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uDeepColor;
uniform float uOpacity;
uniform float uNoiseStrength;
uniform float uNoiseScale;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vVolumeDepth01;

float smHash(
    vec2 p
) {
    return
        fract(
            sin(
                dot(
                    p,
                    vec2(
                        127.1,
                        311.7
                    )
                )
            ) *
            43758.5453123
        );
}

float smNoise(
    vec2 p
) {
    vec2 i =
        floor(p);

    vec2 f =
        fract(p);

    f =
        f *
        f *
        (
            3.0 -
            2.0 * f
        );

    float a =
        smHash(i);

    float b =
        smHash(
            i +
            vec2(
                1.0,
                0.0
            )
        );

    float c =
        smHash(
            i +
            vec2(
                0.0,
                1.0
            )
        );

    float d =
        smHash(
            i +
            vec2(
                1.0,
                1.0
            )
        );

    return
        mix(
            mix(
                a,
                b,
                f.x
            ),
            mix(
                c,
                d,
                f.x
            ),
            f.y
        );
}

void main() {
    float depth01 =
        clamp(
            vVolumeDepth01,
            0.0,
            1.0
        );

    float noise =
        smNoise(
            vWorldPosition.xz *
            max(
                uNoiseScale,
                0.0001
            ) +
            vec2(
                uTime * 0.025,
                -uTime * 0.018
            )
        );

    vec3 color =
        mix(
            uColor,
            uDeepColor,
            depth01
        );

    color *=
        mix(
            1.0 -
            uNoiseStrength,
            1.0 +
            uNoiseStrength,
            noise
        );

    float edgeAlpha =
        mix(
            0.45,
            1.0,
            depth01
        );

    float alpha =
        clamp(
            uOpacity *
            edgeAlpha,
            0.0,
            0.25
        );

    // Boundary walls are vertical, while the (single) bottom cap is
    // horizontal. Strengthen only the walls so the shoreline has volume
    // instead of looking like a transparent flat strip.
    float wallFactor =
        1.0 -
        smoothstep(
            0.18,
            0.78,
            abs(normalize(vWorldNormal).y)
        );

    alpha =
        max(
            alpha,
            uOpacity *
            mix(0.45, 0.90, wallFactor)
        );

    if (
        alpha <=
        0.0001
    ) {
        discard;
    }

    gl_FragColor =
        vec4(
            color,
            alpha
        );
}
`
            });

            material.userData.smWaterVolumeOptions =
                { ...o };

            material.visible =
                o.waterVolumeVisible !==
                false;

            return material;
        }

        static apply(
            material,
            patch = {}
        ) {
            if (
                !material ||
                !material.uniforms
            ) {
                return;
            }

            const u =
                material.uniforms;

            if (
                patch.waterVolumeColor !==
                undefined
            ) {
                u.uColor
                    ?.value
                    ?.set?.(
                        patch.waterVolumeColor
                    );
            }

            if (
                patch.waterVolumeDeepColor !==
                undefined
            ) {
                u.uDeepColor
                    ?.value
                    ?.set?.(
                        patch.waterVolumeDeepColor
                    );
            }

            if (
                patch.waterVolumeOpacity !==
                undefined
            ) {
                u.uOpacity.value =
                    Number(
                        patch.waterVolumeOpacity
                    );
            }

            if (
                patch.waterVolumeNoiseStrength !==
                undefined
            ) {
                u.uNoiseStrength.value =
                    Number(
                        patch.waterVolumeNoiseStrength
                    );
            }

            if (
                patch.waterVolumeNoiseScale !==
                undefined
            ) {
                u.uNoiseScale.value =
                    Number(
                        patch.waterVolumeNoiseScale
                    );
            }

            if (
                patch.waterVolumeVisible !==
                undefined
            ) {
                material.visible =
                    patch.waterVolumeVisible !==
                    false;
            }

            Object.assign(
                material.userData
                    .smWaterVolumeOptions ||
                (
                    material.userData
                        .smWaterVolumeOptions =
                    {}
                ),
                patch
            );
        }

        static update(
            material,
            time = 0
        ) {
            if (
                material?.uniforms?.uTime
            ) {
                material.uniforms.uTime.value =
                    Number(time) ||
                    0;
            }
        }
    }

    window.SMWaterVolumeMaterialFactory =
        SMWaterVolumeMaterialFactory;
})();
