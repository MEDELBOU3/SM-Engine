(function () {
    'use strict';

    // The compositor keeps only the brightest nearby local sources. This is
    // enough for believable shafts without turning the underwater pass into a
    // costly full scene light loop.
    const MAX_VOLUMETRIC_LIGHTS = 4;

    class SMWaterUnderwaterMaterialFactory {
        static defaults() {
            return {
                underwaterScatteringColor: '#0a708a',
                underwaterDeepColor: '#022735',

                underwaterAbsorptionR: 0.070,
                underwaterAbsorptionG: 0.028,
                underwaterAbsorptionB: 0.012,

                underwaterVolumeDensity: 1.0,
                // Multiplies the optical path through the water.  Keeping it
                // separate from the volume density makes it possible to tune
                // the visual depth without changing the scene fog.
                underwaterOpticalDensity: 1.22,
                underwaterVisibility: 38.0,
                underwaterScatterStrength: 0.95,

                underwaterPostDistortion: 0.00165,

                underwaterCausticsStrength: 0.055,
                underwaterCausticsScale: 0.72,
                underwaterCausticsSpeed: 0.68,

                underwaterSurfaceGlow: 0.085,
                underwaterSunScatterStrength: 0.36,
                underwaterAnisotropy: 0.32,

                // Volumetric shafts are evaluated only while the camera is
                // inside a water volume. Quality controls a fixed 1-4 sample
                // integration in the fullscreen pass.
                underwaterGodRayStrength: 0.82,
                underwaterGodRayQuality: 0.75,
                underwaterGodRayDepthFalloff: 0.18,
                underwaterGodRayNoiseScale: 0.085,
                underwaterGodRayNoiseSpeed: 0.14,
                underwaterLocalLightStrength: 0.90,
                underwaterLocalLightLimit: 4,

                underwaterTurbidity: 0.16,
                underwaterDepthDarkening: 0.22,

                underwaterVignette: 0.045,
                underwaterBrightness: 0.98,
                underwaterContrast: 1.01
            };
        }

        static normalizeOptions(
            options = {}
        ) {
            return {
                ...this.defaults(),
                ...options
            };
        }

        static create(
            options = {}
        ) {
            const o =
                this.normalizeOptions(
                    options
                );

            const material =
                new THREE.ShaderMaterial({
                    name:
                        'SMProUnderwaterVolumeMaterial',

                    depthTest: false,
                    depthWrite: false,
                    transparent: false,
                    toneMapped: false,

                    uniforms: {
                        tSceneColor: {
                            value: null
                        },

                        tSceneDepth: {
                            value: null
                        },

                        uProjectionInverse: {
                            value:
                                new THREE.Matrix4()
                        },

                        uCameraMatrixWorld: {
                            value:
                                new THREE.Matrix4()
                        },

                        uCameraWorldPosition: {
                            value:
                                new THREE.Vector3()
                        },

                        uResolution: {
                            value:
                                new THREE.Vector2(
                                    1,
                                    1
                                )
                        },

                        uTime: {
                            value: 0
                        },

                        uScatteringColor: {
                            value:
                                new THREE.Color(
                                    o.underwaterScatteringColor
                                )
                        },

                        uDeepColor: {
                            value:
                                new THREE.Color(
                                    o.underwaterDeepColor
                                )
                        },

                        uAbsorption: {
                            value:
                                new THREE.Vector3(
                                    Number(
                                        o.underwaterAbsorptionR
                                    ),

                                    Number(
                                        o.underwaterAbsorptionG
                                    ),

                                    Number(
                                        o.underwaterAbsorptionB
                                    )
                                )
                        },

                        uDensity: {
                            value:
                                Number(
                                    o.underwaterVolumeDensity
                                )
                        },

                        uOpticalDensity: {
                            value:
                                Number(
                                    o.underwaterOpticalDensity
                                )
                        },

                        uVisibility: {
                            value:
                                Number(
                                    o.underwaterVisibility
                                )
                        },

                        uScatterStrength: {
                            value:
                                Number(
                                    o.underwaterScatterStrength
                                )
                        },

                        uDistortion: {
                            value:
                                Number(
                                    o.underwaterPostDistortion
                                )
                        },

                        uCausticsStrength: {
                            value:
                                Number(
                                    o.underwaterCausticsStrength
                                )
                        },

                        uCausticsScale: {
                            value:
                                Number(
                                    o.underwaterCausticsScale
                                )
                        },

                        uCausticsSpeed: {
                            value:
                                Number(
                                    o.underwaterCausticsSpeed
                                )
                        },

                        uSurfaceGlow: {
                            value:
                                Number(
                                    o.underwaterSurfaceGlow
                                )
                        },

                        uSunScatterStrength: {
                            value:
                                Number(
                                    o.underwaterSunScatterStrength
                                )
                        },

                        uAnisotropy: {
                            value:
                                Number(
                                    o.underwaterAnisotropy
                                )
                        },

                        uTurbidity: {
                            value:
                                Number(
                                    o.underwaterTurbidity
                                )
                        },

                        uDepthDarkening: {
                            value:
                                Number(
                                    o.underwaterDepthDarkening
                                )
                        },

                        uVignette: {
                            value:
                                Number(
                                    o.underwaterVignette
                                )
                        },

                        uBrightness: {
                            value:
                                Number(
                                    o.underwaterBrightness
                                )
                        },

                        uContrast: {
                            value:
                                Number(
                                    o.underwaterContrast
                                )
                        },

                        uUseLogDepth: {
                            value: 0
                        },

                        uLogDepthBufFC: {
                            value: 1
                        },

                        uCameraDepth: {
                            value: 0
                        },

                        uSurfaceY: {
                            value: 0
                        },

                        uWaterDepth: {
                            value: 4
                        },

                        uSunDirection: {
                            value:
                                new THREE.Vector3(
                                    0.32,
                                    0.92,
                                    0.22
                                ).normalize()
                        },

                        uSunColor: {
                            value:
                                new THREE.Color(
                                    0xffefd2
                                )
                        },

                        uSunIntensity: {
                            value: 1
                        },

                        uGodRayStrength: {
                            value:
                                Number(
                                    o.underwaterGodRayStrength
                                )
                        },

                        uGodRayQuality: {
                            value:
                                Number(
                                    o.underwaterGodRayQuality
                                )
                        },

                        uGodRayDepthFalloff: {
                            value:
                                Number(
                                    o.underwaterGodRayDepthFalloff
                                )
                        },

                        uGodRayNoiseScale: {
                            value:
                                Number(
                                    o.underwaterGodRayNoiseScale
                                )
                        },

                        uGodRayNoiseSpeed: {
                            value:
                                Number(
                                    o.underwaterGodRayNoiseSpeed
                                )
                        },

                        uLocalLightStrength: {
                            value:
                                Number(
                                    o.underwaterLocalLightStrength
                                )
                        },

                        uLocalLightLimit: {
                            value:
                                Number(
                                    o.underwaterLocalLightLimit
                                )
                        },

                        uVolumetricLightCount: {
                            value: 0
                        },

                        uVolumetricLightPositionRange: {
                            value:
                                Array.from(
                                    {
                                        length:
                                            MAX_VOLUMETRIC_LIGHTS
                                    },
                                    () =>
                                        new THREE.Vector4(
                                            0,
                                            -999999,
                                            0,
                                            0
                                        )
                                )
                        },

                        uVolumetricLightDirectionCone: {
                            value:
                                Array.from(
                                    {
                                        length:
                                            MAX_VOLUMETRIC_LIGHTS
                                    },
                                    () =>
                                        new THREE.Vector4(
                                            0,
                                            -1,
                                            0,
                                            -1
                                        )
                                )
                        },

                        uVolumetricLightColorIntensity: {
                            value:
                                Array.from(
                                    {
                                        length:
                                            MAX_VOLUMETRIC_LIGHTS
                                    },
                                    () =>
                                        new THREE.Vector4(
                                            0,
                                            0,
                                            0,
                                            0
                                        )
                                )
                        }
                    },

                    vertexShader: `
varying vec2 vUv;

void main() {
    vUv = uv;

    gl_Position =
        vec4(
            position.xy,
            0.0,
            1.0
        );
}
`,

                    fragmentShader: `
precision highp float;

uniform sampler2D tSceneColor;
uniform sampler2D tSceneDepth;

uniform mat4 uProjectionInverse;
uniform mat4 uCameraMatrixWorld;
uniform vec3 uCameraWorldPosition;

uniform vec2 uResolution;
uniform float uTime;

uniform vec3 uScatteringColor;
uniform vec3 uDeepColor;
uniform vec3 uAbsorption;

uniform float uDensity;
uniform float uOpticalDensity;
uniform float uVisibility;
uniform float uScatterStrength;
uniform float uDistortion;

uniform float uCausticsStrength;
uniform float uCausticsScale;
uniform float uCausticsSpeed;

uniform float uSurfaceGlow;
uniform float uSunScatterStrength;
uniform float uAnisotropy;
uniform float uTurbidity;
uniform float uDepthDarkening;

uniform float uVignette;
uniform float uBrightness;
uniform float uContrast;

uniform float uUseLogDepth;
uniform float uLogDepthBufFC;

uniform float uCameraDepth;
uniform float uSurfaceY;
uniform float uWaterDepth;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;

uniform float uGodRayStrength;
uniform float uGodRayQuality;
uniform float uGodRayDepthFalloff;
uniform float uGodRayNoiseScale;
uniform float uGodRayNoiseSpeed;
uniform float uLocalLightStrength;
uniform float uLocalLightLimit;
uniform int uVolumetricLightCount;
uniform vec4 uVolumetricLightPositionRange[${MAX_VOLUMETRIC_LIGHTS}];
uniform vec4 uVolumetricLightDirectionCone[${MAX_VOLUMETRIC_LIGHTS}];
uniform vec4 uVolumetricLightColorIntensity[${MAX_VOLUMETRIC_LIGHTS}];

varying vec2 vUv;

const float PI =
    3.14159265359;

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

float smFBM(
    vec2 p
) {
    float sum = 0.0;
    float amp = 0.5;

    mat2 rot =
        mat2(
            0.80,
            -0.60,
            0.60,
            0.80
        );

    for (
        int i = 0;
        i < 4;
        i++
    ) {
        sum +=
            smNoise(p) *
            amp;

        p =
            rot *
            p *
            2.05 +
            vec2(
                13.7,
                -8.4
            );

        amp *=
            0.5;
    }

    return sum;
}

vec3 smViewRay(
    vec2 uv
) {
    vec4 clip =
        vec4(
            uv * 2.0 -
            1.0,
            1.0,
            1.0
        );

    vec4 view =
        uProjectionInverse *
        clip;

    vec3 p =
        view.xyz /
        max(
            abs(view.w),
            0.000001
        );

    return
        normalize(p);
}

vec3 smReconstructStandardViewPosition(
    vec2 uv,
    float depth
) {
    vec4 clip =
        vec4(
            uv * 2.0 -
            1.0,

            depth * 2.0 -
            1.0,

            1.0
        );

    vec4 view =
        uProjectionInverse *
        clip;

    return
        view.xyz /
        max(
            abs(view.w),
            0.000001
        );
}

float smLogDepthViewZ(
    float rawDepth
) {
    float fc =
        max(
            uLogDepthBufFC,
            0.000001
        );

    return
        exp2(
            rawDepth *
            2.0 /
            fc
        ) -
        1.0;
}

float smSceneDistance(
    vec2 uv,
    float rawDepth,
    vec3 ray
) {
    float visibility =
        max(
            uVisibility,
            1.0
        );

    if (
        rawDepth >=
        0.999995
    ) {
        return
            visibility *
            2.8;
    }

    if (
        uUseLogDepth >
        0.5
    ) {
        float zDistance =
            smLogDepthViewZ(
                rawDepth
            );

        float rayZ =
            max(
                abs(ray.z),
                0.035
            );

        return
            min(
                zDistance /
                rayZ,
                visibility *
                4.0
            );
    }

    vec3 viewPosition =
        smReconstructStandardViewPosition(
            uv,
            rawDepth
        );

    return
        min(
            length(
                viewPosition
            ),
            visibility *
            4.0
        );
}

// The post pass is only valid while a ray is still inside the water column.
// Surface depth is available from the active water body, so clamp the optical
// path at the surface or bed instead of fogging objects beyond the volume.
// Nearly-horizontal rays fall back to a conservative lateral visibility range.
float smWaterRayLimit(
    vec3 rayWorld
) {
    float cameraDepth =
        clamp(
            uCameraDepth,
            0.0,
            max(
                uWaterDepth,
                0.01
            )
        );

    float verticalRay =
        rayWorld.y;

    if (
        verticalRay >
        0.0005
    ) {
        return
            max(
                cameraDepth /
                verticalRay,
                0.001
            );
    }

    if (
        verticalRay <
        -0.0005
    ) {
        return
            max(
                (
                    max(
                        uWaterDepth -
                        cameraDepth,
                        0.0
                    ) /
                    -verticalRay
                ),
                0.001
            );
    }

    return
        min(
            max(
                uWaterDepth *
                3.0,
                10.0
            ),
            max(
                uVisibility *
                1.5,
                10.0
            )
        );
}

float smHG(
    float cosTheta,
    float g
) {
    g =
        clamp(
            g,
            -0.85,
            0.85
        );

    float g2 =
        g * g;

    float denominator =
        pow(
            max(
                1.0 +
                g2 -
                2.0 *
                g *
                cosTheta,
                0.0001
            ),
            1.5
        );

    return
        (
            1.0 -
            g2
        ) /
        (
            4.0 *
            PI *
            denominator
        );
}

float smCaustics(
    vec2 worldXZ,
    float time
) {
    float scale =
        max(
            uCausticsScale,
            0.01
        );

    vec2 p =
        worldXZ *
        scale;

    float t =
        time *
        max(
            uCausticsSpeed,
            0.0
        );

    float a =
        sin(
            p.x * 1.85 +
            p.y * 1.20 +
            t * 1.15
        );

    float b =
        sin(
            p.x * -1.10 +
            p.y * 2.25 -
            t * 0.87
        );

    float c =
        sin(
            p.x * 2.65 -
            p.y * 0.72 +
            t * 0.58
        );

    float warp =
        smFBM(
            p * 0.18 +
            vec2(
                t * 0.025,
                -t * 0.018
            )
        );

    float pattern =
        (
            a +
            b +
            c
        ) /
        3.0;

    pattern =
        1.0 -
        abs(
            pattern +
            (
                warp -
                0.5
            ) *
            0.55
        );

    return
        smoothstep(
            0.72,
            0.985,
            pattern
        );
}

// A small correlated density field is projected to the surface along the
// incoming light direction. It creates coherent shafts instead of noisy fog
// while remaining affordable for a fullscreen underwater pass.
float smGodRayMediumDensity(
    vec3 samplePosition,
    vec3 toLight
) {
    float lightUp =
        max(
            toLight.y,
            0.075
        );

    float surfaceTravel =
        max(
            (
                uSurfaceY -
                samplePosition.y
            ) /
            lightUp,
            0.0
        );

    vec3 surfaceProjection =
        samplePosition +
        toLight *
        surfaceTravel;

    float scale =
        max(
            uGodRayNoiseScale,
            0.002
        );

    vec2 p =
        surfaceProjection.xz *
        scale;

    float time =
        uTime *
        max(
            uGodRayNoiseSpeed,
            0.0
        );

    float broad =
        smNoise(
            p +
            vec2(
                time * 0.17,
                -time * 0.11
            )
        );

    float breakup =
        smNoise(
            p * 2.17 +
            vec2(
                -time * 0.23,
                time * 0.19
            )
        );

    float depth =
        max(
            uSurfaceY -
            samplePosition.y,
            0.0
        );

    return
        mix(
            0.42,
            1.28,
            broad * 0.58 +
            breakup * 0.42
        ) *
        exp(
            -depth *
            max(
                uGodRayDepthFalloff,
                0.001
            ) *
            0.22
        );
}

vec3 smGodRayScattering(
    vec3 rayWorld,
    float distanceThroughWater,
    float scatterDistance,
    vec3 lightToSun,
    float opticalDensity,
    float turbidity
) {
    float rayStrength =
        max(
            uGodRayStrength,
            0.0
        );

    if (
        rayStrength <=
        0.0001 ||
        distanceThroughWater <=
        0.01
    ) {
        return vec3(0.0);
    }

    float sampleCount =
        clamp(
            1.0 +
            floor(
                clamp(
                    uGodRayQuality,
                    0.0,
                    1.0
                ) *
                3.001
            ),
            1.0,
            4.0
        );

    float jitter =
        smHash(
            gl_FragCoord.xy +
            floor(
                uTime *
                9.0
            )
        ) -
        0.5;

    vec3 directional =
        vec3(0.0);
    vec3 local =
        vec3(0.0);

    for (
        int step = 0;
        step < 4;
        step++
    ) {
        if (
            float(step) >=
            sampleCount
        ) {
            continue;
        }

        float fraction =
            (
                float(step) +
                0.5 +
                jitter * 0.45
            ) /
            sampleCount;

        vec3 samplePosition =
            uCameraWorldPosition +
            rayWorld *
            (
                distanceThroughWater *
                fraction
            );

        float sampleDepth =
            max(
                uSurfaceY -
                samplePosition.y,
                0.0
            );

        float medium =
            smGodRayMediumDensity(
                samplePosition,
                lightToSun
            );

        float sunPath =
            sampleDepth /
            max(
                lightToSun.y,
                0.075
            );

        float sunTransmission =
            exp(
                -sunPath *
                (
                    0.035 +
                    turbidity * 0.025
                ) *
                opticalDensity
            );

        directional +=
            uSunColor *
            max(
                uSunIntensity,
                0.0
            ) *
            max(
                uSunScatterStrength,
                0.0
            ) *
            smHG(
                clamp(
                    dot(
                        rayWorld,
                        lightToSun
                    ),
                    -1.0,
                    1.0
                ),
                uAnisotropy
            ) *
            medium *
            sunTransmission;

        for (
            int i = 0;
            i < ${MAX_VOLUMETRIC_LIGHTS};
            i++
        ) {
            if (
                i >=
                uVolumetricLightCount
            ) {
                continue;
            }

            vec4 positionRange =
                uVolumetricLightPositionRange[i];
            vec4 directionCone =
                uVolumetricLightDirectionCone[i];
            vec4 colorIntensity =
                uVolumetricLightColorIntensity[i];

            float range =
                positionRange.w;

            if (
                range <=
                0.01 ||
                colorIntensity.w <=
                0.0001
            ) {
                continue;
            }

            vec3 toLocalLight =
                positionRange.xyz -
                samplePosition;
            float localDistance =
                length(
                    toLocalLight
                );

            if (
                localDistance >=
                range
            ) {
                continue;
            }

            vec3 localLightDirection =
                toLocalLight /
                max(
                    localDistance,
                    0.0001
                );
            vec3 fromLocalLight =
                -localLightDirection;

            float rangeFade =
                pow(
                    max(
                        1.0 -
                        localDistance /
                        range,
                        0.0
                    ),
                    2.0
                );

            float cone = 1.0;

            if (
                directionCone.w >=
                0.0
            ) {
                cone =
                    smoothstep(
                        directionCone.w,
                        min(
                            directionCone.w +
                            0.10,
                            0.9999
                        ),
                        dot(
                            normalize(
                                directionCone.xyz
                            ),
                            fromLocalLight
                        )
                    );
            }

            float localPath =
                sampleDepth /
                max(
                    localLightDirection.y,
                    0.075
                );

            float localTransmission =
                exp(
                    -localPath *
                    (
                        0.04 +
                        turbidity * 0.03
                    ) *
                    opticalDensity
                );

            local +=
                colorIntensity.rgb *
                colorIntensity.w *
                rangeFade *
                cone *
                smHG(
                    clamp(
                        dot(
                            rayWorld,
                            localLightDirection
                        ),
                        -1.0,
                        1.0
                    ),
                    uAnisotropy *
                    0.74
                ) *
                smGodRayMediumDensity(
                    samplePosition,
                    localLightDirection
                ) *
                localTransmission;
        }
    }

    float integration =
        (
            0.28 +
            scatterDistance *
            0.72
        ) /
        sampleCount;

    return
        (
            directional +
            local *
            max(
                uLocalLightStrength,
                0.0
            )
        ) *
        integration *
        rayStrength;
}

void main() {
    float time =
        uTime;

    float n1 =
        smFBM(
            vUv * 5.8 +
            vec2(
                time * 0.032,
                -time * 0.024
            )
        );

    float n2 =
        smNoise(
            vUv * 13.0 +
            vec2(
                -time * 0.028,
                time * 0.038
            )
        );

    vec2 distortion =
        vec2(
            n1 - 0.5,
            n2 - 0.5
        ) *
        max(
            uDistortion,
            0.0
        );

    vec2 sceneUv =
        clamp(
            vUv +
            distortion,
            vec2(
                0.001
            ),
            vec2(
                0.999
            )
        );

    vec3 sceneColor =
        texture2D(
            tSceneColor,
            sceneUv
        ).rgb;

    float rawDepth =
        texture2D(
            tSceneDepth,
            sceneUv
        ).x;

    vec3 viewRay =
        smViewRay(
            sceneUv
        );

    vec3 rayWorld =
        normalize(
            (
                uCameraMatrixWorld *
                vec4(
                    viewRay,
                    0.0
                )
            ).xyz
        );

    float sceneDistance =
        smSceneDistance(
            sceneUv,
            rawDepth,
            viewRay
        );

    float waterRayLimit =
        smWaterRayLimit(
            rayWorld
        );

    float distanceThroughWater =
        min(
            sceneDistance,
            waterRayLimit
        );

    vec3 viewPosition =
        viewRay *
        distanceThroughWater;

    vec3 worldPosition =
        (
            uCameraMatrixWorld *
            vec4(
                viewPosition,
                1.0
            )
        ).xyz;

    float density =
        max(
            uDensity,
            0.001
        );

    float opticalDensity =
        max(
            uOpticalDensity,
            0.05
        );

    float turbidity =
        clamp(
            uTurbidity,
            0.0,
            2.0
        );

    float visibility =
        max(
            uVisibility,
            1.0
        );

    vec3 extinction =
        max(
            uAbsorption,
            vec3(
                0.0001
            )
        ) *
        (
            1.0 +
            turbidity *
            0.55
        );

    vec3 transmittance =
        exp(
            -extinction *
            distanceThroughWater *
            density *
            opticalDensity
        );

    float scatterDistance =
        1.0 -
        exp(
            -distanceThroughWater /
            max(
                visibility *
                (
                    0.60 -
                    turbidity *
                    0.08
                ),
                0.001
            ) *
            density *
            opticalDensity
        );

    float deepDistance =
        1.0 -
        exp(
            -distanceThroughWater /
            max(
                visibility,
                0.001
            ) *
            density *
            opticalDensity
        );

    float depthBelowSurface =
        max(
            uSurfaceY -
            worldPosition.y,
            0.0
        );

    float normalizedDepth =
        clamp(
            depthBelowSurface /
            max(
                uWaterDepth,
                0.5
            ),
            0.0,
            1.0
        );

    float cameraDepthFactor =
        1.0 -
        exp(
            -max(
                uCameraDepth,
                0.0
            ) *
            opticalDensity *
            0.26
        );

    float pointDepthFactor =
        1.0 -
        exp(
            -depthBelowSurface *
            max(
                uDepthDarkening,
                0.001
            )
        );

    vec3 baseScatter =
        mix(
            uScatteringColor,
            uDeepColor,
            clamp(
                normalizedDepth *
                0.68 +
                pointDepthFactor *
                0.35,
                0.0,
                0.82
            )
        );

    vec3 lightToSun =
        normalize(
            uSunDirection
        );

    float phase =
        smHG(
            clamp(
                dot(
                    rayWorld,
                    lightToSun
                ),
                -1.0,
                1.0
            ),
            uAnisotropy
        );

    float nearSurfaceLight =
        exp(
            -max(
                uCameraDepth,
                0.0
            ) *
            0.12
        );

    float sunScatter =
        phase *
        max(
            uSunIntensity,
            0.0
        ) *
        max(
            uSunScatterStrength,
            0.0
        ) *
        nearSurfaceLight *
        (
            1.0 -
            pointDepthFactor *
            0.55
        );

    vec3 scatteredLight =
        baseScatter *
        scatterDistance *
        clamp(
            uScatterStrength,
            0.0,
            2.5
        );

    scatteredLight +=
        uSunColor *
        sunScatter *
        scatterDistance *
        0.72;

    scatteredLight +=
        smGodRayScattering(
            rayWorld,
            distanceThroughWater,
            scatterDistance,
            lightToSun,
            opticalDensity,
            turbidity
        );

    vec3 waterColor =
        sceneColor *
        transmittance +
        scatteredLight *
        (
            vec3(1.0) -
            transmittance
        );

    float deepMix =
        clamp(
            deepDistance *
            (
                0.34 +
                turbidity *
                0.18
            ) +
                pointDepthFactor *
                0.26 +
                cameraDepthFactor *
                0.22,
            0.0,
            0.88
        );

    waterColor =
        mix(
            waterColor,
            uDeepColor,
            deepMix
        );

    float upperGlow =
        pow(
            clamp(
                vUv.y,
                0.0,
                1.0
            ),
            3.2
        );

    waterColor +=
        uScatteringColor *
        upperGlow *
        max(
            uSurfaceGlow,
            0.0
        ) *
        nearSurfaceLight *
        (
            0.30 +
            0.70 *
            (
                1.0 -
                deepDistance
            )
        );

    if (
        rawDepth <
        0.999995
    ) {
        float caustic =
            smCaustics(
                worldPosition.xz,
                time
            );

        float causticDepthFade =
            exp(
                -depthBelowSurface *
                0.28
            );

        float causticDistanceFade =
            1.0 -
            smoothstep(
                visibility * 0.30,
                visibility * 0.92,
                distanceThroughWater
            );

        float causticSun =
            clamp(
                lightToSun.y *
                0.75 +
                0.25,
                0.0,
                1.0
            );

        waterColor +=
            uSunColor *
            caustic *
            max(
                uCausticsStrength,
                0.0
            ) *
            causticDepthFade *
            causticDistanceFade *
            causticSun;
    }

    float volumeNoise =
        smFBM(
            worldPosition.xz *
            0.018 +
            vec2(
                time * 0.006,
                -time * 0.004
            )
        );

    float volumeVariation =
        mix(
            0.965,
            1.035,
            volumeNoise
        );

    waterColor *=
        volumeVariation;

    waterColor =
        (
            waterColor -
            0.5
        ) *
        max(
            uContrast,
            0.0
        ) +
        0.5;

    waterColor *=
        max(
            uBrightness,
            0.0
        );

    vec2 q =
        vUv *
        2.0 -
        1.0;

    float lens =
        smoothstep(
            1.30,
            0.16,
            dot(
                q,
                q
            )
        );

    waterColor *=
        mix(
            1.0 -
            clamp(
                uVignette,
                0.0,
                0.5
            ),
            1.0,
            lens
        );

    gl_FragColor =
        vec4(
            max(
                waterColor,
                vec3(0.0)
            ),
            1.0
        );
}
`
                });

            material.userData.smUnderwaterOptions =
                { ...o };

            return material;
        }

        static apply(
            material,
            patch = {}
        ) {
            if (!material?.uniforms) {
                return;
            }

            const u =
                material.uniforms;

            const setNumber =
                (
                    name,
                    value
                ) => {
                    if (u[name]) {
                        u[name].value =
                            Number(value);
                    }
                };

            const setColor =
                (
                    name,
                    value
                ) => {
                    if (
                        u[name] &&
                        value !==
                        undefined
                    ) {
                        u[name]
                            .value
                            .set(value);
                    }
                };

            if (
                patch.underwaterScatteringColor !==
                undefined
            ) {
                setColor(
                    'uScatteringColor',
                    patch.underwaterScatteringColor
                );
            }

            if (
                patch.underwaterDeepColor !==
                undefined
            ) {
                setColor(
                    'uDeepColor',
                    patch.underwaterDeepColor
                );
            } else if (
                patch.deepColor !==
                undefined
            ) {
                setColor(
                    'uDeepColor',
                    patch.deepColor
                );
            }

            if (
                patch.underwaterAbsorptionR !== undefined ||
                patch.underwaterAbsorptionG !== undefined ||
                patch.underwaterAbsorptionB !== undefined
            ) {
                const current =
                    u.uAbsorption.value;

                current.set(
                    Number(
                        patch.underwaterAbsorptionR ??
                        current.x
                    ),

                    Number(
                        patch.underwaterAbsorptionG ??
                        current.y
                    ),

                    Number(
                        patch.underwaterAbsorptionB ??
                        current.z
                    )
                );
            }

            const numbers = {
                underwaterVolumeDensity:
                    'uDensity',

                underwaterOpticalDensity:
                    'uOpticalDensity',

                underwaterVisibility:
                    'uVisibility',

                underwaterScatterStrength:
                    'uScatterStrength',

                underwaterPostDistortion:
                    'uDistortion',

                underwaterCausticsStrength:
                    'uCausticsStrength',

                underwaterCausticsScale:
                    'uCausticsScale',

                underwaterCausticsSpeed:
                    'uCausticsSpeed',

                underwaterSurfaceGlow:
                    'uSurfaceGlow',

                underwaterSunScatterStrength:
                    'uSunScatterStrength',

                underwaterAnisotropy:
                    'uAnisotropy',

                underwaterGodRayStrength:
                    'uGodRayStrength',

                underwaterGodRayQuality:
                    'uGodRayQuality',

                underwaterGodRayDepthFalloff:
                    'uGodRayDepthFalloff',

                underwaterGodRayNoiseScale:
                    'uGodRayNoiseScale',

                underwaterGodRayNoiseSpeed:
                    'uGodRayNoiseSpeed',

                underwaterLocalLightStrength:
                    'uLocalLightStrength',

                underwaterLocalLightLimit:
                    'uLocalLightLimit',

                underwaterTurbidity:
                    'uTurbidity',

                underwaterDepthDarkening:
                    'uDepthDarkening',

                underwaterVignette:
                    'uVignette',

                underwaterBrightness:
                    'uBrightness',

                underwaterContrast:
                    'uContrast'
            };

            for (
                const [
                    property,
                    uniformName
                ] of Object.entries(
                    numbers
                )
            ) {
                if (
                    patch[property] !==
                    undefined
                ) {
                    setNumber(
                        uniformName,
                        patch[property]
                    );
                }
            }

            Object.assign(
                material.userData
                    .smUnderwaterOptions ||
                (
                    material.userData
                        .smUnderwaterOptions =
                        {}
                ),
                patch
            );
        }
    }

    window.SMWaterUnderwaterMaterialFactory =
        SMWaterUnderwaterMaterialFactory;
})();
