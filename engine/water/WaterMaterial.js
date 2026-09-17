(function () {
    'use strict';

    const MAX_RIPPLES = 8;
    const MAX_SPECTRUM_WAVES = 6;
    // Kept intentionally small: these are the nearest physical obstacles in
    // a water body, not every mesh in the scene.
    const MAX_FLOW_OBSTACLES = 12;
    const TAU = Math.PI * 2;

    class SMWaterMaterialFactory {
        static defaults() {
            return {
                shallowColor: '#45b9d7',
                deepColor: '#052e4f',
                foamColor: '#eefcff',

                underwaterSurfaceColor: '#68cfe7',
                underwaterSurfaceOpacity: 0.985,
                underwaterScatterStrength: 0.82,
                underwaterDistortionStrength: 0.045,
                underwaterViewDensity: 1.0,
                underwaterMinAlpha: 0.985,

                // Keep the surface readable from both sides. Water still
                // blends at the shoreline, but should not look like a flat
                // transparent decal when the camera is below it.
                opacity: 0.96,

                waveHeight: 0.22,
                waveLength: 9.0,
                waveSpeed: 1.05,
                choppiness: 0.48,
                waveScale: 1.0,
                waveSteepness: 0.42,
                waveChoppiness: 0.48,
                waveSpread: 0.72,
                windSpeed: 1.0,
                windDirection: new THREE.Vector2(1, 0),
                waterType: 'river',

                // Master visual/CPU water clock. Kept explicit so the GPU
                // surface and CPU surfaceYAt() sampling stay synchronized.
                animationSpeed: 1.25,

                microWaveStrength: 0.34,
                microWaveScale: 1.0,
                smallWaveStrength: 0.34,
                normalStrength: 0.28,
                detailDistance: 420.0,
                waterDebugMode: 0,

                flowSpeed: 0.72,
                flowDirection: new THREE.Vector2(1, 0),
                // 1 = water motion follows the river spline; lower values
                // retain more cross-ripples for lakes and rough water.
                flowCoherence: 0.86,
                flowStreakStrength: 0.13,

                foamStrength: 0.30,
                shoreFoamDepth: 0.48,
                crestFoamThreshold: 0.84,

                // 1 when the dedicated geometric riverbank foam system is active.
                // It reduces only the old shader shoreline contribution so foam
                // is not rendered twice; crest/obstacle foam remain intact.
                externalShoreFoam: 0,

                reflectionStrength: 1.0,
                refractionStrength: 0.18,
                fresnelPower: 5.0,

                roughness: 0.095,
                metalness: 0.0,

                volumeDepth: 4.0,
                absorptionStrength: 0.55,

                skyIntensity: 0.90,
                sunIntensity: 1.0,

                sunGlitterStrength: 0.20,
                sunGlitterSharpness: 220.0,

                normalDetailStrength: 0.28,
                foamRoughness: 0.58
            };
        }

        static normalizeOptions(options = {}) {
            const d = this.defaults();
            const o = { ...d, ...options };

            if (options.flowCoherence === undefined) {
                const type =
                    String(
                        o.type ||
                        'river'
                    ).toLowerCase();

                o.flowCoherence =
                    type === 'river'
                        ? 0.86
                        : 0.42;
            }

            const f = options.flowDirection || o.flowDirection || d.flowDirection;

            const wind =
                options.windDirection ||
                options.flowDirection ||
                o.windDirection ||
                d.windDirection;

            o.waterType =
                window.SMWaterWaveSpectrum?.normalizeType?.(
                    options.waterType ||
                    options.type ||
                    o.waterType ||
                    'river'
                ) ||
                String(options.waterType || options.type || o.waterType || 'river').toLowerCase();

            o.windDirection = wind?.isVector2
                ? wind.clone()
                : new THREE.Vector2(
                    Number(wind?.x ?? 1),
                    Number(wind?.y ?? 0)
                );

            if (!Number.isFinite(o.windDirection.x) || !Number.isFinite(o.windDirection.y) || o.windDirection.lengthSq() < 1e-8) {
                o.windDirection.set(1, 0);
            }

            o.windDirection.normalize();
            o.waveScale = Math.max(0.08, Number(o.waveScale) || 1);
            o.waveSteepness = THREE.MathUtils.clamp(
                Number(o.waveSteepness ?? 0.42),
                0,
                1.5
            );
            if (options.waveChoppiness === undefined && options.choppiness !== undefined) {
                o.waveChoppiness = options.choppiness;
            }
            if (options.smallWaveStrength === undefined && options.microWaveStrength !== undefined) {
                o.smallWaveStrength = options.microWaveStrength;
            }
            if (options.normalStrength === undefined && options.normalDetailStrength !== undefined) {
                o.normalStrength = options.normalDetailStrength;
            }

            o.waveChoppiness = THREE.MathUtils.clamp(
                Number(o.waveChoppiness ?? o.choppiness ?? 0.48) || 0.48,
                0,
                1.5
            );
            o.waveSpread = THREE.MathUtils.clamp(
                Number(o.waveSpread ?? 0.72),
                0,
                2
            );
            o.windSpeed = Math.max(0, Number(o.windSpeed ?? 1) || 0);
            o.smallWaveStrength = Math.max(
                0,
                Number(o.smallWaveStrength ?? o.microWaveStrength ?? 0.34)
            );
            o.normalStrength = Math.max(
                0,
                Number(o.normalStrength ?? o.normalDetailStrength ?? 0.28)
            );

            o.flowDirection = f?.isVector2
                ? f.clone()
                : new THREE.Vector2(
                    Number(f?.x ?? 1),
                    Number(f?.y ?? 0)
                );

            if (!Number.isFinite(o.flowDirection.x) || !Number.isFinite(o.flowDirection.y) || o.flowDirection.lengthSq() < 1e-8) {
                o.flowDirection.set(1, 0);
            }

            o.flowDirection.normalize();

            return o;
        }

        static _makeRippleData() {
            return Array.from(
                { length: MAX_RIPPLES },
                () => new THREE.Vector4(
                    999999,
                    999999,
                    -999999,
                    0
                )
            );
        }

        static _makeRippleParams() {
            return Array.from(
                { length: MAX_RIPPLES },
                () => new THREE.Vector4(
                    2.6,
                    11.0,
                    1.4,
                    7.0
                )
            );
        }

        static _makeFlowObstacleData() {
            return Array.from(
                { length: MAX_FLOW_OBSTACLES },
                () => new THREE.Vector4(
                    999999,
                    999999,
                    0,
                    0
                )
            );
        }

        static _resolveSun(state = {}) {
            const fallbackDirection =
                new THREE.Vector3(
                    0.32,
                    0.92,
                    0.22
                ).normalize();

            const fallbackColor =
                new THREE.Color(0xfff1d2);

            let direction = null;
            let color = null;
            let intensity = null;

            const explicitDirection =
                state.sunDirection ||
                state.lightDirection ||
                null;

            if (explicitDirection) {
                if (explicitDirection.isVector3) {
                    direction =
                        explicitDirection.clone();
                } else {
                    direction =
                        new THREE.Vector3(
                            Number(explicitDirection.x ?? 0.32),
                            Number(explicitDirection.y ?? 0.92),
                            Number(explicitDirection.z ?? 0.22)
                        );
                }
            }

            const light =
                state.sunLight ||
                window.skyLightingSystem?.sunLight ||
                window.skyLightingSystem?.directionalLight ||
                window.sunLight ||
                window.directionalLight ||
                null;

            if (!direction && light?.isDirectionalLight) {
                const lightPos =
                    new THREE.Vector3();

                const targetPos =
                    new THREE.Vector3();

                light.getWorldPosition?.(
                    lightPos
                );

                if (light.target?.getWorldPosition) {
                    light.target.getWorldPosition(
                        targetPos
                    );
                }

                direction =
                    lightPos.sub(targetPos);
            }

            if (
                !direction ||
                direction.lengthSq() < 1e-8
            ) {
                direction =
                    fallbackDirection.clone();
            } else {
                direction.normalize();
            }

            if (state.sunColor !== undefined) {
                color =
                    new THREE.Color(
                        state.sunColor
                    );
            } else if (light?.color) {
                color =
                    light.color.clone();
            } else {
                color =
                    fallbackColor.clone();
            }

            if (state.sunIntensity !== undefined) {
                intensity =
                    Number(state.sunIntensity);
            } else if (light?.intensity !== undefined) {
                intensity =
                    Number(light.intensity);
            } else {
                intensity = 1.0;
            }

            return {
                direction,
                color,
                intensity:
                    Math.max(
                        0,
                        Number(intensity) || 0
                    )
            };
        }

        static create(options = {}) {
            const o =
                this.normalizeOptions(
                    options
                );

            const initialSun =
                this._resolveSun();

            const spectrumUniformData =
                window.SMWaterWaveSpectrum?.createUniformData?.(o) ||
                {
                    waveData: Array.from(
                        { length: MAX_SPECTRUM_WAVES },
                        () => new THREE.Vector4(1, 0, 0, 0)
                    ),
                    waveParams: Array.from(
                        { length: MAX_SPECTRUM_WAVES },
                        () => new THREE.Vector4(1, 0, 0, 0)
                    ),
                    waterType: 0
                };

            const uniforms = {
                uTime: {
                    value: 0
                },

                uShallowColor: {
                    value:
                        new THREE.Color(
                            o.shallowColor
                        )
                },

                uDeepColor: {
                    value:
                        new THREE.Color(
                            o.deepColor
                        )
                },

                uFoamColor: {
                    value:
                        new THREE.Color(
                            o.foamColor
                        )
                },

                uUnderwaterSurfaceColor: {
                    value:
                        new THREE.Color(
                            o.underwaterSurfaceColor
                        )
                },

                uUnderwaterSurfaceOpacity: {
                    value:
                        Number(
                            o.underwaterSurfaceOpacity
                        )
                },

                uUnderwaterScatterStrength: {
                    value:
                        Number(
                            o.underwaterScatterStrength
                        )
                },

                uUnderwaterDistortionStrength: {
                    value:
                        Number(
                            o.underwaterDistortionStrength
                        )
                },

                uUnderwaterViewDensity: {
                    value:
                        Number(
                            o.underwaterViewDensity
                        )
                },

                uUnderwaterMinAlpha: {
                    value:
                        Number(
                            o.underwaterMinAlpha
                        )
                },

                uOpacity: {
                    value:
                        Number(
                            o.opacity
                        )
                },

                uWaveHeight: {
                    value:
                        Number(
                            o.waveHeight
                        )
                },

                uWaveLength: {
                    value:
                        Number(
                            o.waveLength
                        )
                },

                uWaveSpeed: {
                    value:
                        Number(
                            o.waveSpeed
                        )
                },

                uChoppiness: {
                    value:
                        Number(
                            o.choppiness
                        )
                },

                uWaterType: {
                    value:
                        spectrumUniformData.waterType ?? 0
                },

                uWaveScale: {
                    value: Number(o.waveScale)
                },

                uWaveSteepness: {
                    value: Number(o.waveSteepness)
                },

                uWaveChoppiness: {
                    value: Number(o.waveChoppiness)
                },

                uWaveSpread: {
                    value: Number(o.waveSpread)
                },

                uWindSpeed: {
                    value: Number(o.windSpeed)
                },

                uWindDirection: {
                    value: o.windDirection.clone()
                },

                uWaveData: {
                    value: spectrumUniformData.waveData
                },

                uWaveParams: {
                    value: spectrumUniformData.waveParams
                },

                uMicroWaveStrength: {
                    value:
                        Number(
                            o.microWaveStrength
                        )
                },

                uMicroWaveScale: {
                    value:
                        Number(
                            o.microWaveScale
                        )
                },

                uSmallWaveStrength: {
                    value:
                        Number(o.smallWaveStrength)
                },

                uNormalStrength: {
                    value:
                        Number(o.normalStrength)
                },

                uDetailDistance: {
                    value:
                        Math.max(20, Number(o.detailDistance) || 420)
                },

                uDebugMode: {
                    value:
                        Number(o.waterDebugMode) || 0
                },

                // GPU Tessendorf-style field. The procedural spectrum above
                // remains the safe fallback for unsupported renderers.
                uFFTEnabled: {
                    value: 0
                },

                uFFTDisplacementMap: {
                    value: null
                },

                uFFTNormalMap: {
                    value: null
                },

                uFFTSize: {
                    value: 192
                },

                uFFTDisplacementScale: {
                    value: 1
                },

                // FFT horizontal displacement is intentionally conservative.
                // A float render target can contain a bad texel on older GPUs;
                // letting that texel move a vertex sideways opens visible gaps
                // in a large ocean mesh. Height and FFT normals still provide
                // the wave shape while the surface remains topologically safe.
                uFFTHorizontalScale: {
                    value: 0
                },

                uFFTVerticalScale: {
                    value: 0.72
                },

                // FFT normals add the high-frequency ocean detail, but FFT
                // vertex motion is opt-in. A malformed/unsupported float
                // texel must never pull a surface below its bed/floor and
                // expose the floor as a regular grid of seams in the viewport.
                uFFTVertexEnabled: {
                    value: 0
                },

                uFFTNormalStrength: {
                    value: 1
                },

                uFlowSpeed: {
                    value:
                        Number(
                            o.flowSpeed
                        )
                },

                uFlowDirection: {
                    value:
                        o.flowDirection.clone()
                },

                uFlowCoherence: {
                    value:
                        Number(
                            o.flowCoherence
                        )
                },

                uFlowStreakStrength: {
                    value:
                        Number(
                            o.flowStreakStrength
                        )
                },

                uFoamStrength: {
                    value:
                        Number(
                            o.foamStrength
                        )
                },

                uShoreFoamDepth: {
                    value:
                        Number(
                            o.shoreFoamDepth
                        )
                },

                uCrestFoamThreshold: {
                    value:
                        Number(
                            o.crestFoamThreshold
                        )
                },

                uExternalShoreFoam: {
                    value:
                        Number(
                            o.externalShoreFoam
                        ) || 0
                },

                uReflectionStrength: {
                    value:
                        Number(
                            o.reflectionStrength
                        )
                },

                uSkyIntensity: {
                    value:
                        Number(
                            o.skyIntensity
                        )
                },

                uRefractionStrength: {
                    value:
                        Number(
                            o.refractionStrength
                        )
                },

                uFresnelPower: {
                    value:
                        Number(
                            o.fresnelPower
                        )
                },

                uAbsorptionStrength: {
                    value:
                        Number(
                            o.absorptionStrength
                        )
                },

                uCameraUnderwater: {
                    value: 0
                },

                uSunDirection: {
                    value:
                        initialSun.direction
                },

                uSunColor: {
                    value:
                        initialSun.color
                },

                uSunRuntimeIntensity: {
                    value:
                        initialSun.intensity
                },

                uSunGlitterStrength: {
                    value:
                        Number(
                            o.sunGlitterStrength
                        )
                },

                uSunGlitterSharpness: {
                    value:
                        Number(
                            o.sunGlitterSharpness
                        )
                },

                uNormalDetailStrength: {
                    value:
                        Number(
                            o.normalDetailStrength
                        )
                },

                uFoamRoughness: {
                    value:
                        Number(
                            o.foamRoughness
                        )
                },

                uRippleData: {
                    value:
                        this._makeRippleData()
                },

                uRippleParams: {
                    value:
                        this._makeRippleParams()
                },

                // xyz/w = world XZ, footprint radius, flow obstruction.
                // WaterSystem only fills these with nearby rocks or moving
                // rigid bodies, so the surface shader stays bounded.
                uFlowObstacleData: {
                    value:
                        this._makeFlowObstacleData()
                }
            };

            const material =
                new THREE.MeshPhysicalMaterial({
                    name:
                        'SMProWaterSurfaceMaterial',

                    color:
                        new THREE.Color(
                            o.shallowColor
                        ),

                    roughness:
                        THREE.MathUtils.clamp(
                            Number(o.roughness),
                            0.025,
                            1
                        ),

                    metalness:
                        THREE.MathUtils.clamp(
                            Number(o.metalness),
                            0,
                            1
                        ),

                    transmission: 0,
                    thickness: 0,
                    ior: 1.333,

                    clearcoat: 0.38,
                    clearcoatRoughness: 0.055,

                    opacity:
                        THREE.MathUtils.clamp(
                            Number(o.opacity),
                            0.05,
                            1
                        ),

                    // The surface shader already resolves depth, reflection,
                    // absorption and foam into its final colour. Keep the
                    // surface in the opaque render queue so a game-dev floor
                    // grid cannot leak through it as bright rectangular seams.
                    // The underwater compositor is responsible for the
                    // translucent volume view below the surface.
                    transparent: false,
                    depthWrite: true,
                    depthTest: true,

                    side:
                        THREE.DoubleSide,

                    fog: true
                });

            material.extensions =
                material.extensions || {};

            material.extensions.derivatives =
                true;

            if (
                'envMapIntensity' in
                material
            ) {
                material.envMapIntensity =
                    Math.max(
                        0,
                        Number(
                            o.reflectionStrength
                        )
                    );
            }

            if (
                'specularIntensity' in
                material
            ) {
                material.specularIntensity =
                    Math.max(
                        0,
                        Number(
                            o.sunIntensity
                        )
                    );
            }

            if (
                'specularColor' in
                material
            ) {
                material.specularColor =
                    new THREE.Color(
                        0xdff7ff
                    );
            }

            material.uniforms =
                uniforms;

            material.userData.smWaterOptions =
                o;

            material.userData.smRippleCursor =
                0;

            material.userData.smUsesPhysicalShader =
                true;

            material.userData.smCameraUnderwater =
                false;

            material.onBeforeCompile =
                shader => {
                    Object.assign(
                        shader.uniforms,
                        uniforms
                    );

                    const vertexDecl = `
attribute float smWaterDepth;
attribute vec2 smWaterFlow;

uniform float uTime;
uniform float uWaveHeight;
uniform float uWaveLength;
uniform float uWaveSpeed;
uniform float uChoppiness;
uniform float uWaterType;
uniform float uWaveScale;
uniform float uWaveSteepness;
uniform float uWaveChoppiness;
uniform float uWaveSpread;
uniform float uWindSpeed;
uniform vec2 uWindDirection;
uniform float uFlowSpeed;
uniform vec2 uFlowDirection;
uniform float uFlowCoherence;

uniform float uFFTEnabled;
uniform sampler2D uFFTDisplacementMap;
uniform float uFFTSize;
  uniform float uFFTDisplacementScale;
  uniform float uFFTHorizontalScale;
  uniform float uFFTVerticalScale;
  uniform float uFFTVertexEnabled;

uniform vec4 uWaveData[${MAX_SPECTRUM_WAVES}];
uniform vec4 uWaveParams[${MAX_SPECTRUM_WAVES}];

uniform vec4 uRippleData[${MAX_RIPPLES}];
uniform vec4 uRippleParams[${MAX_RIPPLES}];
uniform vec4 uFlowObstacleData[${MAX_FLOW_OBSTACLES}];

varying vec3 smWaterWorldPosition;
varying vec2 smWaterWorldXZ;
varying vec2 smWaterBaseWorldXZ;
varying vec2 smWaterFlowV;
varying float smWaterDepthV;
varying float smWaterCrest;
varying float smWaterBaseY;

float smWavePhase(
    vec2 p,
    vec2 dir,
    float wavelength,
    float phase
) {
    float k =
        6.28318530718 /
        max(wavelength, 0.05);

    return
        dot(p, dir) *
        k +
        phase;
}

float smRippleHeight(
    vec2 worldXZ
) {
    float total = 0.0;

    for (
        int i = 0;
        i < ${MAX_RIPPLES};
        i++
    ) {
        vec4 r =
            uRippleData[i];

        vec4 rp =
            uRippleParams[i];

        float age =
            uTime - r.z;

        if (
            age <= 0.0 ||
            r.w <= 0.0001
        ) {
            continue;
        }

        float dist =
            distance(
                worldXZ,
                r.xy
            );

        float radiusMask =
            1.0 -
            smoothstep(
                max(
                    rp.w * 0.55,
                    0.05
                ),
                max(
                    rp.w,
                    0.06
                ),
                dist
            );

        float ring =
            sin(
                (dist -
                age * rp.x) *
                rp.y
            );

        float envelope =
            exp(
                -age * rp.z
            ) *
            radiusMask;

        total +=
            ring *
            envelope *
            r.w;
    }

    return total;
}

float smObstacleWakeHeight(
    vec2 worldXZ,
    vec2 localFlow
) {
    vec2 flow =
        localFlow;

    if (
        length(flow) <
        0.01
    ) {
        flow =
            uFlowDirection;
    }

    flow =
        normalize(
            flow +
            vec2(0.00001)
        );

    vec2 crossFlow =
        vec2(
            -flow.y,
            flow.x
        );

    float total =
        0.0;

    for (
        int i = 0;
        i < ${MAX_FLOW_OBSTACLES};
        i++
    ) {
        vec4 obstacle =
            uFlowObstacleData[i];

        if (
            obstacle.z <= 0.001 ||
            obstacle.w <= 0.001
        ) {
            continue;
        }

        vec2 delta =
            worldXZ -
            obstacle.xy;

        float radius =
            max(
                obstacle.z,
                0.08
            );

        float along =
            dot(
                delta,
                flow
            );

        float across =
            dot(
                delta,
                crossFlow
            );

        // The water piles up just upstream, then spreads into a low V wake
        // downstream. This is a height cue only; foam is added in fragment.
        float bow =
            exp(
                -abs(across) /
                (radius * 0.82)
            ) *
            exp(
                -abs(
                    along + radius * 0.32
                ) /
                (radius * 0.72)
            );

        float downstream =
            max(
                along,
                0.0
            );

        float wakeWidth =
            radius * 0.72 +
            downstream * 0.14;

        float wakeEnvelope =
            smoothstep(
                radius * 0.12,
                radius * 0.62,
                downstream
            ) *
            exp(
                -downstream /
                max(
                    radius * 5.5,
                    0.2
                )
            ) *
            exp(
                -abs(across) /
                max(
                    wakeWidth,
                    0.08
                )
            );

        float wake =
            sin(
                downstream *
                (4.4 / radius) -
                uTime *
                (2.0 + uFlowSpeed * 2.4)
            ) *
            wakeEnvelope;

        total +=
            (
                bow * 0.17 +
                wake * 0.075
            ) *
            obstacle.w;
    }

    return
        total *
        max(
            uWaveHeight,
            0.06
        );
}

void smWaveBasis(
    vec2 localFlow,
    out vec2 d0,
    out vec2 d1,
    out vec2 d2,
    out vec2 d3
) {
    d0 =
        localFlow;

    if (
        length(d0) <
        0.01
    ) {
        d0 =
            uFlowDirection;
    }

    d0 =
        normalize(
            d0 +
            vec2(
                0.00001
            )
        );

    d1 =
        normalize(
            vec2(
                -d0.y,
                d0.x
            )
        );

    d2 =
        normalize(
            d0 * 0.72 +
            d1 * 0.69
        );

    d3 =
        normalize(
            d0 * 0.82 -
            d1 * 0.57
        );
}

float smSurfaceHeight(
    vec2 worldXZ,
    vec2 localFlow
) {
    vec2 d0;
    vec2 d1;
    vec2 d2;
    vec2 d3;

    smWaveBasis(
        localFlow,
        d0,
        d1,
        d2,
        d3
    );

    float wl =
        max(
            uWaveLength,
            0.2
        );

    float t =
        uTime *
        max(
            uWaveSpeed,
            0.0
        );

    float current =
        uTime *
        max(
            uFlowSpeed,
            0.0
        );

    float p0 =
        smWavePhase(
            worldXZ,
            d0,
            wl,
            -t -
            current * 1.70
        );

    float p1 =
        smWavePhase(
            worldXZ,
            d1,
            wl * 0.58,
            t * 1.27
        );

    float p2 =
        smWavePhase(
            worldXZ,
            d2,
            wl * 0.31,
            -t * 1.63 -
            current * 2.40
        );

    float p3 =
        smWavePhase(
            worldXZ,
            d3,
            wl * 0.17,
            t * 2.10 -
            current * 3.00
        );

    float coherence =
        clamp(
            uFlowCoherence,
            0.0,
            1.0
        );

    float h =
        sin(p0) * 0.56 +
        sin(p1) *
        mix(
            0.16,
            0.035,
            coherence
        ) +
        sin(p2) *
        mix(
            0.13,
            0.075,
            coherence
        ) +
        sin(p3) *
        mix(
            0.08,
            0.045,
            coherence
        );

    return
        h *
        uWaveHeight +
        smRippleHeight(
            worldXZ
        ) +
        smObstacleWakeHeight(
            worldXZ,
            localFlow
        );
}

vec2 smHorizontalDisplacement(
    vec2 worldXZ,
    vec2 localFlow
) {
    vec2 d0;
    vec2 d1;
    vec2 d2;
    vec2 d3;

    smWaveBasis(
        localFlow,
        d0,
        d1,
        d2,
        d3
    );

    float wl =
        max(
            uWaveLength,
            0.2
        );

    float t =
        uTime *
        max(
            uWaveSpeed,
            0.0
        );

    float current =
        uTime *
        max(
            uFlowSpeed,
            0.0
        );

    float p0 =
        smWavePhase(
            worldXZ,
            d0,
            wl,
            -t -
            current * 1.70
        );

    float p1 =
        smWavePhase(
            worldXZ,
            d1,
            wl * 0.58,
            t * 1.27
        );

    float p2 =
        smWavePhase(
            worldXZ,
            d2,
            wl * 0.31,
            -t * 1.63 -
            current * 2.40
        );

    float p3 =
        smWavePhase(
            worldXZ,
            d3,
            wl * 0.17,
            t * 2.10 -
            current * 3.00
        );

    float coherence =
        clamp(
            uFlowCoherence,
            0.0,
            1.0
        );

    vec2 displacement =
        d0 * cos(p0) * 0.56 +
        d1 * cos(p1) *
        mix(
            0.14,
            0.025,
            coherence
        ) +
        d2 * cos(p2) *
        mix(
            0.12,
            0.065,
            coherence
        ) +
        d3 * cos(p3) *
        mix(
            0.07,
            0.035,
            coherence
        );

    return
        displacement *
        uWaveHeight *
        clamp(
            uChoppiness,
            0.0,
            1.5
        ) *
        0.16;
}

float smSpectrumBandFactor(int band) {
    if (uWaterType > 2.5) return band <= 0 ? 0.06 : (band == 1 ? 0.22 : 0.58);
    if (uWaterType > 1.5) return band <= 0 ? 1.0 : (band == 1 ? 1.0 : 1.0);
    if (uWaterType > 0.5) return band <= 0 ? 0.24 : (band == 1 ? 0.54 : 0.82);
    return band <= 0 ? 0.16 : (band == 1 ? 0.68 : 1.0);
}

vec2 smSpectrumBaseDirection(vec2 localFlow) {
    vec2 base = uWaterType < 0.5 ? localFlow : uWindDirection;
    if (length(base) < 0.01) base = uFlowDirection;
    return normalize(base + vec2(0.00001));
}

vec3 smGerstnerDisplacement(
    vec2 worldXZ,
    vec2 localFlow,
    out float crestSignal
) {
    vec2 base = smSpectrumBaseDirection(localFlow);
    vec2 side = vec2(-base.y, base.x);
    float riverSpread = uWaterType < 0.5
        ? (0.22 + clamp(uFlowCoherence, 0.0, 1.0) * 0.78)
        : 1.0;
    vec3 displacement = vec3(0.0);
    crestSignal = 0.0;

    for (int i = 0; i < ${MAX_SPECTRUM_WAVES}; i++) {
        vec4 wave = uWaveData[i];
        vec4 params = uWaveParams[i];
        float angle = params.w * uWaveSpread * riverSpread;
        vec2 dir = normalize(base * cos(angle) + side * sin(angle));
        float wavelength = max(0.08, wave.x * uWaveLength * uWaveScale);
        float k = 6.28318530718 / wavelength;
        float band = wave.z;
        float amplitude = uWaveHeight * wave.y * smSpectrumBandFactor(int(band));
        float phase = dot(worldXZ, dir) * k -
            uTime * max(uWaveSpeed, 0.0) * max(uWindSpeed, 0.0) * params.x -
            uTime * max(uFlowSpeed, 0.0) * (uWaterType < 0.5 ? 0.12 : 0.025) * params.x +
            params.z;
        float steepness = clamp(
            params.y * max(uWaveSteepness, 0.0) * max(uWaveChoppiness, 0.0),
            0.0,
            1.5
        );
        float horizontal = amplitude * steepness *
            0.72 / max(k, 0.08);

        displacement.y += amplitude * sin(phase);
        displacement.xz += dir * horizontal * cos(phase);
        crestSignal = max(
            crestSignal,
            (0.5 + 0.5 * sin(phase)) * (0.55 + steepness * 0.45)
        );
    }

    return displacement;
}

vec2 smFFTUV(vec2 worldXZ) {
    return fract(
        worldXZ / max(uFFTSize, 0.1) +
        vec2(0.5)
    );
}

vec3 smFFTDisplacement(
    vec2 worldXZ,
    out float crestSignal
) {
    vec3 displacement = texture2D(
        uFFTDisplacementMap,
        smFFTUV(worldXZ)
    ).xyz * uFFTDisplacementScale;

    // A bad/unsupported float render target must never tear the ocean mesh
    // open. The physical FFT field is normalized to waveHeight, and this
    // guard only catches driver precision outliers before they can move a
    // vertex several grid cells away from its neighbours.
    float maxVertical = clamp(
        uWaveHeight * 2.8 + 0.22,
        0.30,
        2.80
    );
    float maxHorizontal = clamp(
        uWaveHeight * 3.6 + 0.30,
        0.45,
        3.60
    );
    displacement.y = clamp(
        displacement.y,
        -maxVertical,
        maxVertical
    );
    displacement.xz = clamp(
        displacement.xz,
        vec2(-maxHorizontal),
        vec2(maxHorizontal)
    );

    // Keep the FFT field from tearing the viewport mesh. The vertical field
    // remains active for natural crest movement; lateral choppiness is added
    // by the stable procedural fallback and by the FFT normal texture.
    displacement.xz *= clamp(uFFTHorizontalScale, 0.0, 0.12);
    displacement.y *= clamp(uFFTVerticalScale, 0.0, 1.0);

    // The spectral height is the useful foam cue. Keep it soft: foam should
    // still be driven by the real geometric normal in the fragment stage.
    crestSignal = clamp(
        0.5 + displacement.y / max(uWaveHeight * 1.55, 0.08),
        0.0,
        1.0
    );
    return displacement;
}

vec3 smWaterSurfaceDisplacement(
    vec2 worldXZ,
    vec2 localFlow,
    out float crestSignal
) {
    if (uFFTEnabled > 0.5 && uFFTVertexEnabled > 0.5) {
        return smFFTDisplacement(worldXZ, crestSignal);
    }
    return smGerstnerDisplacement(worldXZ, localFlow, crestSignal);
}
`;

                    shader.vertexShader =
                        shader.vertexShader
                            .replace(
                                '#include <common>',
                                `#include <common>\n${vertexDecl}`
                            )
                            .replace(
                                '#include <begin_vertex>',
                                `
#include <begin_vertex>

vec3 smBaseWorld =
    (
        modelMatrix *
        vec4(
            transformed,
            1.0
        )
    ).xyz;

vec2 smLocalFlow =
    smWaterFlow;

if (
    length(smLocalFlow) <
    0.01
) {
    smLocalFlow =
        uFlowDirection;
}

smLocalFlow =
    normalize(
        smLocalFlow +
        vec2(
            0.00001
        )
    );

smWaterFlowV =
    smLocalFlow;

float smSpectrumCrest = 0.0;
vec3 smDisplacement =
    smWaterSurfaceDisplacement(
        smBaseWorld.xz,
        smLocalFlow,
        smSpectrumCrest
    );

float smH = smDisplacement.y;
vec2 smHorizontal = smDisplacement.xz;

transformed.x +=
    smHorizontal.x;

transformed.z +=
    smHorizontal.y;

transformed.y +=
    smH;

vec3 smFinalWorld =
    (
        modelMatrix *
        vec4(
            transformed,
            1.0
        )
    ).xyz;

smWaterWorldPosition =
    smFinalWorld;

smWaterWorldXZ =
    smFinalWorld.xz;

smWaterBaseWorldXZ =
    smBaseWorld.xz;

smWaterDepthV =
    max(
        smWaterDepth,
        0.0
    );

smWaterBaseY =
    smBaseWorld.y;

smWaterCrest = clamp(smSpectrumCrest, 0.0, 1.0);
`
                            );

                    const fragmentDecl = `
uniform float uTime;

uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uFoamColor;

uniform vec3 uUnderwaterSurfaceColor;
uniform float uUnderwaterSurfaceOpacity;
uniform float uUnderwaterScatterStrength;
uniform float uUnderwaterDistortionStrength;
uniform float uUnderwaterViewDensity;
uniform float uUnderwaterMinAlpha;

uniform float uOpacity;

uniform float uWaveHeight;
uniform float uWaveLength;
uniform float uWaveSpeed;
uniform float uChoppiness;
uniform float uWaterType;
uniform float uWaveScale;
uniform float uWaveSteepness;
uniform float uWaveChoppiness;
uniform float uWaveSpread;
uniform float uWindSpeed;
uniform vec2 uWindDirection;

uniform float uFFTEnabled;
uniform sampler2D uFFTNormalMap;
uniform float uFFTSize;
uniform float uFFTNormalStrength;

uniform float uMicroWaveStrength;
uniform float uMicroWaveScale;
uniform float uSmallWaveStrength;
uniform float uNormalStrength;
uniform float uDetailDistance;
uniform float uDebugMode;

uniform float uFlowSpeed;
uniform vec2 uFlowDirection;
uniform float uFlowStreakStrength;

uniform float uFoamStrength;
uniform float uShoreFoamDepth;
uniform float uCrestFoamThreshold;
uniform float uExternalShoreFoam;

uniform float uReflectionStrength;
uniform float uSkyIntensity;
uniform float uRefractionStrength;
uniform float uFresnelPower;
uniform float uAbsorptionStrength;
uniform float uCameraUnderwater;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunRuntimeIntensity;
uniform float uSunGlitterStrength;
uniform float uSunGlitterSharpness;

uniform float uNormalDetailStrength;
uniform float uFoamRoughness;
uniform vec4 uWaveData[${MAX_SPECTRUM_WAVES}];
uniform vec4 uWaveParams[${MAX_SPECTRUM_WAVES}];
uniform vec4 uFlowObstacleData[${MAX_FLOW_OBSTACLES}];

varying vec3 smWaterWorldPosition;
varying vec2 smWaterWorldXZ;
varying vec2 smWaterBaseWorldXZ;
varying vec2 smWaterFlowV;
varying float smWaterDepthV;
varying float smWaterCrest;
varying float smWaterBaseY;

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
    float value = 0.0;
    float amplitude = 0.5;

    mat2 rotation =
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
        value +=
            smNoise(p) *
            amplitude;

        p =
            rotation *
            p *
            2.03 +
            vec2(
                17.1,
                -9.2
            );

        amplitude *=
            0.5;
    }

    return value;
}

vec2 smFlowBasis(
    vec2 flow
) {
    if (uWaterType > 0.5) {
        flow = uWindDirection;
    }

    if (
        length(flow) <
        0.01
    ) {
        flow =
            uFlowDirection;
    }

    return
        normalize(
            flow +
            vec2(
                0.00001
            )
        );
}

float smDetailTypeFactor() {
    if (uWaterType > 2.5) return 0.62;
    if (uWaterType > 1.5) return 1.0;
    if (uWaterType > 0.5) return 0.82;
    return 1.0;
}

float smMicroHeight(
    vec2 p
) {
    vec2 flow =
        smFlowBasis(
            smWaterFlowV
        );

    vec2 crossFlow =
        vec2(
            -flow.y,
            flow.x
        );

    float s =
        max(
            uMicroWaveScale,
            0.05
        );

    vec2 p1 =
        p *
        (0.72 * s) -
        flow *
        uTime *
        (
            0.45 +
            uFlowSpeed * 0.70
        );

    vec2 p2 =
        p *
        (1.55 * s) -
        flow *
        uTime *
        (
            0.78 +
            uFlowSpeed * 0.95
        ) +
        crossFlow *
        uTime *
        0.045;

    vec2 p3 =
        p *
        (3.20 * s) -
        flow *
        uTime *
        (
            1.05 +
            uFlowSpeed * 1.15
        );

    float n1 =
        smFBM(
            p1 *
            0.46
        );

    float n2 =
        smNoise(
            p2 +
            vec2(
                7.3,
                -3.1
            )
        );

    float n3 =
        smNoise(
            p3 +
            vec2(
                -11.4,
                8.9
            )
        );

    mat2 detailRotation =
        mat2(
            0.74,
            -0.67,
            0.67,
            0.74
        );

    float n4 =
        smNoise(
            detailRotation * p * (4.65 * s) +
            vec2(
                uTime * 0.17,
                -uTime * 0.11
            ) +
            vec2(
                23.7,
                -14.2
            )
        );

    float directional =
        sin(
            dot(
                p,
                flow
            ) *
            (2.35 * s) -
            uTime *
            (
                1.25 +
                uFlowSpeed * 1.75
            )
        ) *
        0.5 +
        0.5;

    float raw =
        n1 * 0.32 +
        n2 * 0.24 +
        n3 * 0.18 +
        n4 * 0.16 +
        directional * 0.10;

    float distanceFade = smoothstep(
        max(uDetailDistance * 0.18, 20.0),
        max(uDetailDistance, 40.0),
        distance(cameraPosition, smWaterWorldPosition)
    );
    float detailMix = mix(1.0, 0.52, distanceFade) * smDetailTypeFactor();
    return mix(0.5, raw, clamp(detailMix, 0.0, 1.0));
}

float smFlowStreak(
    vec2 p
) {
    vec2 flow =
        smFlowBasis(
            smWaterFlowV
        );

    vec2 crossFlow =
        vec2(
            -flow.y,
            flow.x
        );

    float along =
        dot(
            p,
            flow
        );

    float across =
        dot(
            p,
            crossFlow
        );

    float travel =
        along * 0.22 -
        uTime *
        (
            0.72 +
            uFlowSpeed * 1.55
        );

    float warp =
        smFBM(
            vec2(
                across * 0.28,
                along * 0.055 -
                uTime * 0.15
            )
        );

    float lines =
        0.5 +
        0.5 *
        sin(
            across * 4.1 +
            warp * 4.4 +
            sin(
                along * 0.10
            ) *
            1.2
        );

    float broken =
        smNoise(
            vec2(
                across * 0.75 +
                13.0,
                travel
            )
        );

    return
        smoothstep(
            0.59,
            0.90,
            lines * 0.45 +
            broken * 0.72
        );
}

float smObstacleFoam(
    vec2 p
) {
    vec2 flow =
        smFlowBasis(
            smWaterFlowV
        );

    vec2 crossFlow =
        vec2(
            -flow.y,
            flow.x
        );

    float total =
        0.0;

    for (
        int i = 0;
        i < ${MAX_FLOW_OBSTACLES};
        i++
    ) {
        vec4 obstacle =
            uFlowObstacleData[i];

        if (
            obstacle.z <= 0.001 ||
            obstacle.w <= 0.001
        ) {
            continue;
        }

        vec2 delta =
            p -
            obstacle.xy;

        float radius =
            max(
                obstacle.z,
                0.08
            );

        float along =
            dot(
                delta,
                flow
            );

        float across =
            abs(
                dot(
                    delta,
                    crossFlow
                )
            );

        float bowFoam =
            exp(
                -across /
                (radius * 0.95)
            ) *
            exp(
                -abs(
                    along + radius * 0.38
                ) /
                (radius * 0.72)
            );

        float downstream =
            max(
                along,
                0.0
            );

        float wakeWidth =
            radius * 0.55 +
            downstream * 0.18;

        float wakeFoam =
            smoothstep(
                radius * 0.12,
                radius * 0.62,
                downstream
            ) *
            exp(
                -downstream /
                max(
                    radius * 5.8,
                    0.2
                )
            ) *
            exp(
                -across /
                max(
                    wakeWidth,
                    0.08
                )
            );

        total =
            max(
                total,
                max(
                    bowFoam,
                    wakeFoam * 0.78
                ) *
                obstacle.w
            );
    }

    return
        clamp(
            total,
            0.0,
            1.0
        );
}

vec3 smSurfaceWorldNormal() {
    vec3 dx =
        dFdx(
            smWaterWorldPosition
        );

    vec3 dy =
        dFdy(
            smWaterWorldPosition
        );

    vec3 n =
        normalize(
            cross(
                dx,
                dy
            )
        );

    if (
        n.y <
        0.0
    ) {
        n =
            -n;
    }

    if (uFFTEnabled > 0.5) {
        vec3 fftNormal = texture2D(
            uFFTNormalMap,
            fract(smWaterBaseWorldXZ / max(uFFTSize, 0.1) + vec2(0.5))
        ).xyz * 2.0 - 1.0;
        if (dot(fftNormal, fftNormal) > 0.01) {
            n = normalize(mix(
                n,
                normalize(fftNormal),
                clamp(uFFTNormalStrength, 0.0, 1.0)
            ));
        }
    }

    float eps =
        0.055;

    float hL =
        smMicroHeight(
            smWaterWorldXZ -
            vec2(
                eps,
                0.0
            )
        );

    float hR =
        smMicroHeight(
            smWaterWorldXZ +
            vec2(
                eps,
                0.0
            )
        );

    float hD =
        smMicroHeight(
            smWaterWorldXZ -
            vec2(
                0.0,
                eps
            )
        );

    float hU =
        smMicroHeight(
            smWaterWorldXZ +
            vec2(
                0.0,
                eps
            )
        );

    vec2 grad =
        vec2(
            hR - hL,
            hU - hD
        ) /
        (2.0 * eps);

    float detailStrength =
        max(
            uSmallWaveStrength,
            0.0
        ) *
        max(
            uNormalStrength,
            0.0
        );

    n =
        normalize(
            n +
            vec3(
                -grad.x,
                0.0,
                -grad.y
            ) *
            detailStrength
        );

    return n;
}

float smFoamMask() {
    float shoreDepth =
        max(
            uShoreFoamDepth,
            0.001
        );

    float shore =
        1.0 -
        smoothstep(
            0.015,
            shoreDepth,
            smWaterDepthV
        );

    float crestThreshold =
        clamp(
            uCrestFoamThreshold,
            0.05,
            0.99
        );

    float crest =
        smoothstep(
            crestThreshold,
            1.0,
            smWaterCrest
        );

    // Foam follows actual geometric steepness as well as height. This keeps
    // it broken and localized on wave-facing crests instead of producing
    // synchronized white latitude bands.
    vec3 foamNormal = smSurfaceWorldNormal();
    float slope = 1.0 - clamp(foamNormal.y, 0.0, 1.0);
    float steepCrest = smoothstep(0.075, 0.28, slope) *
        smoothstep(0.40, 0.78, smWaterCrest);
    float crestTypeFactor =
        uWaterType > 2.5 ? 0.18 :
        (uWaterType > 1.5 ? 1.0 :
        (uWaterType > 0.5 ? 0.42 : 0.78));
    crest = max(crest, steepCrest * crestTypeFactor);

    float fine =
        smFBM(
            smWaterWorldXZ *
            0.62 +
            smWaterFlowV *
            (
                -uTime *
                (0.18 +
                uFlowSpeed * 0.28)
            )
        );

    float lace =
        smNoise(
            smWaterWorldXZ *
            1.55 -
            smWaterFlowV *
            uTime *
            (
                0.30 +
                uFlowSpeed * 0.42
            )
        );

    float breakup =
        smoothstep(
            0.43,
            0.77,
            fine * 0.68 +
            lace * 0.42
        );

    float shoreFoam =
        shore *
        (
            0.42 +
            breakup * 0.78
        );

    // The dedicated riverbank foam system owns the visible contact ribbon.
    // Keep a faint shader base to blend the geometric foam into the water.
    shoreFoam *=
        mix(
            1.0,
            0.22,
            clamp(
                uExternalShoreFoam,
                0.0,
                1.0
            )
        );

    float crestFoam =
        crest *
        (
            0.34 +
            breakup * 0.90
        );

    float obstacleFoam =
        smObstacleFoam(
            smWaterWorldXZ
        );

    return
        clamp(
            (
                shoreFoam * 0.88 +
                crestFoam * 0.72
            ) *
            uFoamStrength +
            obstacleFoam *
            (0.54 +
            uFoamStrength * 0.42),
            0.0,
            1.0
        );
}

float smWaterFresnel(
    vec3 normalW,
    vec3 viewW
) {
    float facing =
        clamp(
            abs(
                dot(
                    normalW,
                    viewW
                )
            ),
            0.0,
            1.0
        );

    float f0 =
        0.02037;

    return
        f0 +
        (
            1.0 -
            f0
        ) *
        pow(
            1.0 -
            facing,
            max(
                uFresnelPower,
                0.75
            )
        );
}

float smSunGlitter(
    vec3 normalW,
    vec3 viewW
) {
    vec3 lightW =
        normalize(
            uSunDirection
        );

    vec3 halfW =
        normalize(
            lightW +
            viewW
        );

    float spec =
        pow(
            max(
                dot(
                    normalW,
                    halfW
                ),
                0.0
            ),
            max(
                uSunGlitterSharpness,
                16.0
            )
        );

    float sparkle =
        smoothstep(
            0.58,
            0.92,
            smMicroHeight(
                smWaterWorldXZ *
                1.8
            )
        );

    return
        spec *
        (
            0.35 +
            sparkle * 0.65
        ) *
        max(
            uSunRuntimeIntensity,
            0.0
        ) *
        max(
            uSunGlitterStrength,
            0.0
        );
}

vec3 smSkyReflection(
    vec3 reflectionW
) {
    // Keep a restrained analytic sky fallback for frames where an HDRI or
    // PMREM is not ready yet. MeshPhysicalMaterial still contributes the real
    // environment reflection when one is available.
    float horizon =
        smoothstep(
            -0.18,
            0.72,
            reflectionW.y
        );

    vec3 horizonColor =
        vec3(
            0.035,
            0.095,
            0.135
        );

    vec3 zenithColor =
        vec3(
            0.28,
            0.54,
            0.70
        );

    vec3 sky =
        mix(
            horizonColor,
            zenithColor,
            horizon
        );

    float sunDisc =
        pow(
            max(
                dot(
                    normalize(reflectionW),
                    normalize(uSunDirection)
                ),
                0.0
            ),
            180.0
        );

    sky +=
        uSunColor *
        sunDisc *
        0.22 *
        max(
            uSunRuntimeIntensity,
            0.0
        );

    return
        sky *
        max(
            uSkyIntensity,
            0.0
        );
}

float smShallowCaustics(
    vec2 p
) {
    vec2 flow =
        smFlowBasis(
            smWaterFlowV
        );

    vec2 crossFlow =
        vec2(
            -flow.y,
            flow.x
        );

    float a =
        sin(
            dot(p, flow) * 1.65 -
            uTime * (0.85 + uFlowSpeed * 1.4)
        );

    float b =
        sin(
            dot(p, crossFlow) * 2.35 +
            uTime * 0.62
        );

    float c =
        sin(
            dot(p, flow + crossFlow) * 3.10 -
            uTime * 1.18
        );

    return
        pow(
            max(
                0.0,
                (a * b * 0.55 + c * 0.45) * 0.5 + 0.5
            ),
            3.0
        );
}
`;

                    shader.fragmentShader =
                        shader.fragmentShader
                            .replace(
                                '#include <common>',
                                `#include <common>\n${fragmentDecl}`
                            )
                            .replace(
                                '#include <normal_fragment_maps>',
                                `
#include <normal_fragment_maps>

vec3 smWorldN =
    smSurfaceWorldNormal();

if (
    !gl_FrontFacing
) {
    smWorldN =
        -smWorldN;
}

normal =
    normalize(
        mat3(viewMatrix) *
        smWorldN
    );
`
                            )
                            .replace(
                                '#include <color_fragment>',
                                `
#include <color_fragment>

vec3 smN =
    smSurfaceWorldNormal();

vec3 smV =
    normalize(
        cameraPosition -
        smWaterWorldPosition
    );

float smFresnel =
    smWaterFresnel(
        smN,
        smV
    );

float smDepthMix =
    1.0 -
    exp(
        -max(
            smWaterDepthV,
            0.0
        ) *
        max(
            uAbsorptionStrength,
            0.001
        ) *
        0.82
    );

smDepthMix =
    clamp(
        smDepthMix,
        0.0,
        1.0
    );

vec3 smWaterColor =
    mix(
        uShallowColor,
        uDeepColor,
        smDepthMix
    );

float smMicro =
    smMicroHeight(
        smWaterWorldXZ
    );

float smStreak =
    smFlowStreak(
        smWaterWorldXZ
    );

smWaterColor *=
    0.965 +
    (
        smMicro -
        0.5
    ) *
    0.085;

smWaterColor +=
    uShallowColor *
    smStreak *
    0.048 *
    clamp(
        uFlowStreakStrength,
        0.0,
        1.0
    );

vec3 smReflectionW =
    reflect(
        -smV,
        smN
    );

vec3 smSky =
    smSkyReflection(
        smReflectionW
    );

float smReflectionMask =
    clamp(
        smFresnel *
        max(
            uReflectionStrength,
            0.0
        ) *
        (
            0.32 +
            smoothstep(
                -0.10,
                0.75,
                smReflectionW.y
            ) *
            0.68
        ),
        0.0,
        0.82
    );

smWaterColor =
    mix(
        smWaterColor,
        smSky,
        smReflectionMask *
        0.42
    );

smWaterColor =
    mix(
        smWaterColor,
        uShallowColor,
        (
            1.0 -
            smDepthMix
        ) *
        clamp(
            uRefractionStrength,
            0.0,
            1.0
        ) *
        0.15
    );

float smFoam =
    smFoamMask();

smFoam =
    clamp(
        smFoam +
        smStreak *
        uFlowStreakStrength *
        0.075 *
        smoothstep(
            0.48,
            1.0,
            smWaterCrest
        ),
        0.0,
        1.0
    );

// Obstacles create a soft, brighter waterline before it resolves into white
// foam. This makes rocks, hulls and walls look seated in the water rather
// than like a separate mesh placed over a flat blue surface.
float smObjectWaterLift =
    smoothstep(
        0.08,
        0.62,
        smFoam
    ) *
    (
        0.10 +
        (1.0 - smDepthMix) *
        0.16
    );

smWaterColor =
    mix(
        smWaterColor,
        min(
            uShallowColor * 1.16,
            vec3(1.0)
        ),
        smObjectWaterLift
    );

vec3 smFinalColor =
    mix(
        smWaterColor,
        uFoamColor,
        smFoam
    );

float smShallowMask =
    1.0 -
    smoothstep(
        0.12,
        1.0,
        smWaterDepthV
    );

float smCaustics =
    smShallowCaustics(
        smWaterWorldXZ *
        0.58
    ) *
    smShallowMask *
    (1.0 - smFoam) *
    0.075;

// Subsurface light should be subtle and mostly confined to shallow water;
// this keeps the effect readable without turning the surface into a glowing
// procedural texture.
smFinalColor +=
    uShallowColor *
    smCaustics;

float smGlitter =
    smSunGlitter(
        smN,
        smV
    );

smFinalColor +=
    uSunColor *
    smGlitter *
    (
        0.35 +
        smFresnel * 0.65
    );

float smIsBelow =
    max(
        uCameraUnderwater,
        step(
            cameraPosition.y,
            smWaterBaseY -
            0.015
        )
    );

if (
    smIsBelow >
    0.5
) {
    float smUnderFresnel =
        pow(
            1.0 -
            clamp(
                abs(
                    dot(
                        smN,
                        smV
                    )
                ),
                0.0,
                1.0
            ),
            1.6
        );

    float smUnderDepth =
        clamp(
            smWaterDepthV *
            0.14,
            0.0,
            1.0
        );

    vec3 smUnderTint =
        mix(
            uUnderwaterSurfaceColor,
            uDeepColor,
            0.24 +
            smUnderDepth * 0.38
        );

    smFinalColor =
        mix(
            smFinalColor,
            smUnderTint,
            0.38 +
            smUnderFresnel * 0.20
        );

    smFinalColor +=
        uUnderwaterSurfaceColor *
        smUnderFresnel *
        0.075 *
        max(
            uUnderwaterScatterStrength,
            0.0
        );

    float smDistort =
        sin(
            smWaterWorldXZ.x *
            0.17 +
            uTime * 1.10
        ) *
        cos(
            smWaterWorldXZ.y *
            0.15 -
            uTime * 0.96
        );

    smFinalColor +=
        vec3(
            smDistort *
            0.006 *
            uUnderwaterDistortionStrength
        );
}

// Optional authoring diagnostics. Mode 0 is the production path; the other
// modes are intentionally cheap visualizations for the WaterPanel/debugger.
if (uDebugMode > 0.5) {
    if (uDebugMode < 1.5) {
        float displacementView = clamp(
            0.5 + (smWaterWorldPosition.y - smWaterBaseY) * 1.8,
            0.0,
            1.0
        );
        smFinalColor = vec3(displacementView, smWaterCrest, 1.0 - displacementView);
    } else if (uDebugMode < 2.5) {
        smFinalColor = smN * 0.5 + 0.5;
    } else if (uDebugMode < 3.5) {
        smFinalColor = vec3(smMicro);
    } else if (uDebugMode < 4.5) {
        smFinalColor = vec3(smFoam, smFoam * 0.72, 0.04);
    } else if (uDebugMode < 5.5) {
        float shoreView = 1.0 - smoothstep(0.0, max(uShoreFoamDepth, 0.001), smWaterDepthV);
        smFinalColor = vec3(shoreView, shoreView * 0.35, 1.0 - shoreView);
    } else if (uDebugMode < 6.5) {
        float depthView = clamp(smWaterDepthV / 12.0, 0.0, 1.0);
        smFinalColor = vec3(depthView, 0.18 + depthView * 0.42, 1.0 - depthView);
    } else {
        smFinalColor = vec3(smReflectionMask, smReflectionMask * 0.75, 1.0 - smReflectionMask);
    }
}

diffuseColor.rgb =
    max(
        smFinalColor,
        vec3(0.0)
    );

float smDepthAlpha =
    1.0 -
    exp(
        -max(
            smWaterDepthV,
            0.0
        ) *
        max(
            uAbsorptionStrength,
            0.001
        ) *
        0.34
    );

float smAlpha =
    mix(
        uOpacity * 0.82,
        uOpacity,
        smDepthAlpha
    );

smAlpha =
    mix(
        smAlpha,
        0.97,
        clamp(
            smFresnel *
            0.62,
            0.0,
            0.72
        )
    );

smAlpha =
    mix(
        smAlpha,
        0.985,
        smFoam
    );

if (
    smIsBelow >
    0.5
) {
                smAlpha =
                    max(
                        smAlpha,
                        clamp(
                max(
                    uUnderwaterMinAlpha,
                            uUnderwaterSurfaceOpacity
                        ),
                        0.35,
                        0.998
                    )
                );
}

diffuseColor.a *=
    clamp(
        smAlpha,
        0.05,
        0.998
    );
`
                            )
                            .replace(
                                '#include <roughnessmap_fragment>',
                                `
#include <roughnessmap_fragment>

float smDynamicFoam =
    smFoamMask();

float smMicroRoughness =
    (
        smMicroHeight(
            smWaterWorldXZ *
            1.35
        ) -
        0.5
    ) *
    0.07;

roughnessFactor =
    clamp(
        roughnessFactor +
        smMicroRoughness,
        0.035,
        0.80
    );

roughnessFactor =
    mix(
        roughnessFactor,
        clamp(
            uFoamRoughness,
            0.25,
            1.0
        ),
        smDynamicFoam
    );
`
                            );

                    material.userData.smCompiledShader =
                        shader;
                };

            material.customProgramCacheKey =
                () =>
                    'sm-pro-water-v16-fft-spectrum';

            return material;
        }

        static update(
            material,
            dt,
            elapsedTime,
            state = {}
        ) {
            if (!material?.uniforms) {
                return;
            }

            const animationSpeed =
                THREE.MathUtils.clamp(
                    Number(
                        material.userData
                            ?.smWaterOptions
                            ?.animationSpeed ??
                        1.25
                    ) || 1.25,
                    0.05,
                    8.0
                );

            material.uniforms.uTime.value =
                (
                    Number(elapsedTime) ||
                    0
                ) *
                animationSpeed;

            if (
                state.cameraUnderwater !==
                undefined
            ) {
                this.setCameraUnderwater(
                    material,
                    state.cameraUnderwater
                );
            }

            const sun =
                this._resolveSun(
                    state
                );

            material.uniforms.uSunDirection.value.copy(
                sun.direction
            );

            material.uniforms.uSunColor.value.copy(
                sun.color
            );

            material.uniforms.uSunRuntimeIntensity.value =
                sun.intensity;
        }

        static setCameraUnderwater(
            material,
            value
        ) {
            if (
                !material?.uniforms
                    ?.uCameraUnderwater
            ) {
                return;
            }

            const underwater =
                !!value;

            material.uniforms
                .uCameraUnderwater
                .value =
                underwater
                    ? 1
                    : 0;

            material.userData.smCameraUnderwater =
                underwater;

            // The surface is opaque-composited in both camera positions. The
            // fullscreen underwater pass handles the optical volume below the
            // waterline; disabling depth writes here would let the GAME_DEV
            // floor grid bleed through the surface in a regular tiled pattern.
            material.depthWrite = true;

            const baseOpacity =
                THREE.MathUtils.clamp(
                    Number(
                        material.userData
                            ?.smWaterOptions
                            ?.opacity ??
                        0.88
                    ),
                    0.05,
                    1.0
                );

            material.opacity =
                baseOpacity;
        }

        static sampleWaveHeight(
            material,
            x,
            z,
            time = 0,
            flowDirection = null
        ) {
            const spectrum = window.SMWaterWaveSpectrum;
            if (spectrum?.height) {
                const options =
                    material?.userData?.smWaterOptions ||
                    this.defaults();
                return spectrum.height(
                    options,
                    x,
                    z,
                    time,
                    flowDirection
                ) + this.sampleRippleHeight(
                    material,
                    x,
                    z,
                    time
                );
            }

            const o =
                material
                    ?.userData
                    ?.smWaterOptions ||
                this.defaults();

            const sourceDir =
                flowDirection ||
                o.flowDirection;

            const dir =
                sourceDir?.isVector2
                    ? sourceDir
                    : new THREE.Vector2(
                        Number(
                            sourceDir?.x ??
                            1
                        ),
                        Number(
                            sourceDir?.y ??
                            0
                        )
                    );

            const d0 =
                dir.clone();

            if (
                d0.lengthSq() <
                1e-8
            ) {
                d0.set(
                    1,
                    0
                );
            }

            d0.normalize();

            const d1 =
                new THREE.Vector2(
                    -d0.y,
                    d0.x
                );

            const d2 =
                d0.clone()
                    .multiplyScalar(
                        0.72
                    )
                    .addScaledVector(
                        d1,
                        0.69
                    )
                    .normalize();

            const d3 =
                d0.clone()
                    .multiplyScalar(
                        0.82
                    )
                    .addScaledVector(
                        d1,
                        -0.57
                    )
                    .normalize();

            const wl =
                Math.max(
                    Number(
                        o.waveLength
                    ) ||
                    9,
                    0.2
                );

            const speed =
                Math.max(
                    Number(
                        o.waveSpeed
                    ) ||
                    0,
                    0
                );

            const animationSpeed =
                THREE.MathUtils.clamp(
                    Number(
                        o.animationSpeed ??
                        1.25
                    ) || 1.25,
                    0.05,
                    8.0
                );

            const animationTime =
                time *
                animationSpeed;

            const t =
                animationTime *
                speed;

            const current =
                animationTime *
                Math.max(
                    Number(
                        o.flowSpeed
                    ) ||
                    0,
                    0
                );

            const sine =
                (
                    d,
                    wavelength,
                    phase,
                    amp
                ) =>
                    Math.sin(
                        (
                            x * d.x +
                            z * d.y
                        ) *
                        (
                            TAU /
                            Math.max(
                                wavelength,
                                0.05
                            )
                        ) +
                        phase
                    ) *
                    amp;

            let h = 0;

            const coherence =
                THREE.MathUtils.clamp(
                    Number(
                        o.flowCoherence
                    ) ||
                    0,
                    0,
                    1
                );

            h +=
                sine(
                    d0,
                    wl,
                    -t -
                    current * 1.70,
                    0.56
                );

            h +=
                sine(
                    d1,
                    wl * 0.58,
                    t * 1.27,
                    THREE.MathUtils.lerp(
                        0.16,
                        0.035,
                        coherence
                    )
                );

            h +=
                sine(
                    d2,
                    wl * 0.31,
                    -t * 1.63 -
                    current * 2.40,
                    THREE.MathUtils.lerp(
                        0.13,
                        0.075,
                        coherence
                    )
                );

            h +=
                sine(
                    d3,
                    wl * 0.17,
                    t * 2.10 -
                    current * 3.00,
                    THREE.MathUtils.lerp(
                        0.08,
                        0.045,
                        coherence
                    )
                );

            return h * (Number(o.waveHeight) || 0);
        }

        static sampleRippleHeight(material, x, z, time = 0) {
            const data = material?.uniforms?.uRippleData?.value;
            const params = material?.uniforms?.uRippleParams?.value;
            if (!Array.isArray(data) || !Array.isArray(params)) return 0;

            const animationSpeed = THREE.MathUtils.clamp(
                Number(material.userData?.smWaterOptions?.animationSpeed ?? 1.25) || 1.25,
                0.05,
                8.0
            );
            const animatedTime = (Number(time) || 0) * animationSpeed;
            let total = 0;

            for (let i = 0; i < Math.min(data.length, MAX_RIPPLES); i += 1) {
                const ripple = data[i];
                const rippleParams = params[i];
                const age = animatedTime - Number(ripple?.z ?? -999999);
                const strength = Number(ripple?.w) || 0;
                if (age <= 0 || strength <= 0) continue;

                const dx = x - Number(ripple?.x ?? 999999);
                const dz = z - Number(ripple?.y ?? 999999);
                const distance = Math.hypot(dx, dz);
                const radius = Math.max(Number(rippleParams?.w) || 7, 0.06);
                const speed = Math.max(Number(rippleParams?.x) || 2.6, 0.01);
                const frequency = Math.max(Number(rippleParams?.y) || 11, 0.01);
                const decay = Math.max(Number(rippleParams?.z) || 1.4, 0.01);
                const radiusMask = 1 - THREE.MathUtils.smoothstep(
                    distance,
                    radius * 0.55,
                    radius
                );
                const ring = Math.sin((distance - age * speed) * frequency);
                total += ring * Math.exp(-age * decay) * radiusMask * strength;
            }

            return total;
        }

        static addRipple(
            material,
            {
                position,
                time = 0,
                strength = 0.14,
                speed = 2.6,
                frequency = 11,
                decay = 1.4,
                radius = 7
            } = {}
        ) {
            if (
                !material
                    ?.uniforms
                    ?.uRippleData ||
                !position
            ) {
                return false;
            }

            const i =
                (
                    material.userData
                        .smRippleCursor ||
                    0
                ) %
                MAX_RIPPLES;

            material.uniforms
                .uRippleData
                .value[i]
                .set(
                    Number(
                        position.x
                    ) ||
                    0,

                    Number(
                        position.z
                    ) ||
                    0,

                    (Number(time) || 0) *
                    THREE.MathUtils.clamp(
                        Number(material.userData?.smWaterOptions?.animationSpeed ?? 1.25) || 1.25,
                        0.05,
                        8.0
                    ) ||
                    0,

                    Math.max(
                        0,
                        Number(
                            strength
                        ) ||
                        0
                    )
                );

            material.uniforms
                .uRippleParams
                .value[i]
                .set(
                    Math.max(
                        0.01,
                        Number(speed) ||
                        2.6
                    ),

                    Math.max(
                        0.01,
                        Number(frequency) ||
                        11
                    ),

                    Math.max(
                        0.01,
                        Number(decay) ||
                        1.4
                    ),

                    Math.max(
                        0.1,
                        Number(radius) ||
                        7
                    )
                );

            material.userData.smRippleCursor =
                (
                    i + 1
                ) %
                MAX_RIPPLES;

            return true;
        }

        static setFlowObstacles(
            material,
            obstacles = []
        ) {
            const data =
                material
                    ?.uniforms
                    ?.uFlowObstacleData
                    ?.value;

            if (!Array.isArray(data)) {
                return false;
            }

            const list =
                Array.isArray(obstacles)
                    ? obstacles
                    : [];

            for (
                let i = 0;
                i < MAX_FLOW_OBSTACLES;
                i++
            ) {
                const target =
                    data[i];

                if (!target) {
                    continue;
                }

                const obstacle =
                    list[i];

                if (!obstacle) {
                    target.set(
                        999999,
                        999999,
                        0,
                        0
                    );

                    continue;
                }

                const x =
                    Number(
                        obstacle.x ??
                        obstacle.position?.x
                    );

                const z =
                    Number(
                        obstacle.z ??
                        obstacle.position?.z
                    );

                const radius =
                    THREE.MathUtils.clamp(
                        Number(
                            obstacle.radius
                        ) ||
                        0,
                        0.08,
                        30
                    );

                const strength =
                    THREE.MathUtils.clamp(
                        Number(
                            obstacle.strength
                        ) ||
                        0,
                        0,
                        1
                    );

                if (
                    !Number.isFinite(x) ||
                    !Number.isFinite(z) ||
                    strength <= 0
                ) {
                    target.set(
                        999999,
                        999999,
                        0,
                        0
                    );

                    continue;
                }

                target.set(
                    x,
                    z,
                    radius,
                    strength
                );
            }

            material.userData.smWaterFlowObstacles =
                list.slice(
                    0,
                    MAX_FLOW_OBSTACLES
                );

            return true;
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

            const set =
                (
                    key,
                    value
                ) => {
                    if (u[key]) {
                        u[key].value =
                            Number(value);
                    }
                };

            const setColor =
                (
                    key,
                    value
                ) => {
                    if (
                        u[key] &&
                        value !==
                        undefined
                    ) {
                        u[key]
                            .value
                            .set(value);
                    }
                };

            if (
                patch.shallowColor !==
                undefined
            ) {
                setColor(
                    'uShallowColor',
                    patch.shallowColor
                );

                material.color?.set?.(
                    patch.shallowColor
                );
            }

            if (
                patch.deepColor !==
                undefined
            ) {
                setColor(
                    'uDeepColor',
                    patch.deepColor
                );
            }

            if (
                patch.foamColor !==
                undefined
            ) {
                setColor(
                    'uFoamColor',
                    patch.foamColor
                );
            }

            if (
                patch.underwaterSurfaceColor !==
                undefined
            ) {
                setColor(
                    'uUnderwaterSurfaceColor',
                    patch.underwaterSurfaceColor
                );
            }

            const numericUniforms = {
                underwaterSurfaceOpacity:
                    'uUnderwaterSurfaceOpacity',

                underwaterScatterStrength:
                    'uUnderwaterScatterStrength',

                underwaterDistortionStrength:
                    'uUnderwaterDistortionStrength',

                underwaterViewDensity:
                    'uUnderwaterViewDensity',

                underwaterMinAlpha:
                    'uUnderwaterMinAlpha',

                opacity:
                    'uOpacity',

                waveHeight:
                    'uWaveHeight',

                waveLength:
                    'uWaveLength',

                waveSpeed:
                    'uWaveSpeed',

                choppiness:
                    'uChoppiness',

                waveScale:
                    'uWaveScale',

                waveSteepness:
                    'uWaveSteepness',

                waveChoppiness:
                    'uWaveChoppiness',

                waveSpread:
                    'uWaveSpread',

                windSpeed:
                    'uWindSpeed',

                microWaveStrength:
                    'uMicroWaveStrength',

                microWaveScale:
                    'uMicroWaveScale',

                smallWaveStrength:
                    'uSmallWaveStrength',

                normalStrength:
                    'uNormalStrength',

                detailDistance:
                    'uDetailDistance',

                waterDebugMode:
                    'uDebugMode',

                flowSpeed:
                    'uFlowSpeed',

                flowCoherence:
                    'uFlowCoherence',

                flowStreakStrength:
                    'uFlowStreakStrength',

                foamStrength:
                    'uFoamStrength',

                shoreFoamDepth:
                    'uShoreFoamDepth',

                crestFoamThreshold:
                    'uCrestFoamThreshold',

                externalShoreFoam:
                    'uExternalShoreFoam',

                reflectionStrength:
                    'uReflectionStrength',

                skyIntensity:
                    'uSkyIntensity',

                refractionStrength:
                    'uRefractionStrength',

                fresnelPower:
                    'uFresnelPower',

                absorptionStrength:
                    'uAbsorptionStrength',

                sunGlitterStrength:
                    'uSunGlitterStrength',

                sunGlitterSharpness:
                    'uSunGlitterSharpness',

                normalDetailStrength:
                    'uNormalDetailStrength',

                foamRoughness:
                    'uFoamRoughness'
            };

            for (
                const [
                    property,
                    uniformName
                ] of Object.entries(
                    numericUniforms
                )
            ) {
                if (
                    patch[property] !==
                    undefined
                ) {
                    set(
                        uniformName,
                        patch[property]
                    );
                }
            }

            // Preserve the legacy editor keys while keeping the new spectrum
            // controls live when an older panel edits choppiness/detail.
            if (patch.choppiness !== undefined && patch.waveChoppiness === undefined) {
                u.uWaveChoppiness.value = THREE.MathUtils.clamp(
                    Number(patch.choppiness) || 0,
                    0,
                    1.5
                );
            }
            if (patch.microWaveStrength !== undefined && patch.smallWaveStrength === undefined) {
                u.uSmallWaveStrength.value = Math.max(
                    0,
                    Number(patch.microWaveStrength) || 0
                );
            }
            if (patch.normalDetailStrength !== undefined && patch.normalStrength === undefined) {
                u.uNormalStrength.value = Math.max(
                    0,
                    Number(patch.normalDetailStrength) || 0
                );
            }

            if (
                patch.flowDirection !==
                undefined &&
                u.uFlowDirection
            ) {
                u.uFlowDirection.value.set(
                    Number(
                        patch
                            .flowDirection
                            .x ??
                        1
                    ),

                    Number(
                        patch
                            .flowDirection
                            .y ??
                        0
                    )
                );

                if (
                    !Number.isFinite(u.uFlowDirection.value.x) ||
                    !Number.isFinite(u.uFlowDirection.value.y) ||
                    u.uFlowDirection.value.lengthSq() <
                    1e-8
                ) {
                    u.uFlowDirection.value
                        .set(
                            1,
                            0
                        );
                }

                u.uFlowDirection.value
                    .normalize();
            }

            if (
                (
                    patch.windDirection !== undefined ||
                    patch.flowDirection !== undefined
                ) &&
                u.uWindDirection
            ) {
                const source =
                    patch.windDirection ||
                    patch.flowDirection;
                u.uWindDirection.value.set(
                    Number(source?.x ?? 1),
                    Number(source?.y ?? 0)
                );
                if (!Number.isFinite(u.uWindDirection.value.x) || !Number.isFinite(u.uWindDirection.value.y) || u.uWindDirection.value.lengthSq() < 1e-8) {
                    u.uWindDirection.value.set(1, 0);
                }
                u.uWindDirection.value.normalize();
            }

            if (
                patch.waterType !== undefined ||
                patch.type !== undefined
            ) {
                u.uWaterType.value =
                    window.SMWaterWaveSpectrum?.typeCode?.(
                        patch.waterType || patch.type
                    ) ??
                    0;
            }

            if (
                patch.opacity !==
                undefined
            ) {
                material.opacity =
                    THREE.MathUtils.clamp(
                        Number(
                            patch.opacity
                        ),
                        0.05,
                        1
                    );
            }

            if (
                patch.reflectionStrength !==
                undefined &&
                'envMapIntensity' in
                material
            ) {
                material.envMapIntensity =
                    Math.max(
                        0,
                        Number(
                            patch
                                .reflectionStrength
                        )
                    );
            }

            if (
                patch.roughness !==
                undefined
            ) {
                material.roughness =
                    THREE.MathUtils.clamp(
                        Number(
                            patch.roughness
                        ),
                        0.025,
                        1
                    );
            }

            if (
                patch.metalness !==
                undefined
            ) {
                material.metalness =
                    THREE.MathUtils.clamp(
                        Number(
                            patch.metalness
                        ),
                        0,
                        1
                    );
            }

            if (
                patch.sunIntensity !==
                undefined &&
                'specularIntensity' in
                material
            ) {
                material.specularIntensity =
                    Math.max(
                        0,
                        Number(
                            patch.sunIntensity
                        )
                    );
            }

            const store =
                material.userData
                    .smWaterOptions ||
                (
                    material.userData
                        .smWaterOptions =
                        {}
                );

            Object.assign(
                store,
                patch
            );

            if (patch.choppiness !== undefined && patch.waveChoppiness === undefined) {
                store.waveChoppiness = THREE.MathUtils.clamp(
                    Number(patch.choppiness) || 0,
                    0,
                    1.5
                );
            }
            if (patch.microWaveStrength !== undefined && patch.smallWaveStrength === undefined) {
                store.smallWaveStrength = Math.max(
                    0,
                    Number(patch.microWaveStrength) || 0
                );
            }
            if (patch.normalDetailStrength !== undefined && patch.normalStrength === undefined) {
                store.normalStrength = Math.max(
                    0,
                    Number(patch.normalDetailStrength) || 0
                );
            }

            if (
                patch.flowDirection !==
                undefined
            ) {
                const v =
                    patch.flowDirection
                        ?.isVector2
                        ? patch
                            .flowDirection
                            .clone()
                        : new THREE.Vector2(
                            Number(
                                patch
                                    .flowDirection
                                    ?.x ??
                                1
                            ),
                            Number(
                                patch
                                    .flowDirection
                                    ?.y ??
                                0
                            )
                        );

                if (
                    v.lengthSq() <
                    1e-8
                ) {
                    v.set(
                        1,
                        0
                    );
                }

                store.flowDirection =
                    v.normalize();
            }

            if (patch.windDirection !== undefined || patch.flowDirection !== undefined) {
                const source = patch.windDirection || patch.flowDirection;
                const v = source?.isVector2
                    ? source.clone()
                    : new THREE.Vector2(
                        Number(source?.x ?? 1),
                        Number(source?.y ?? 0)
                    );
                if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.lengthSq() < 1e-8) v.set(1, 0);
                store.windDirection = v.normalize();
            }

            if (patch.waterType !== undefined || patch.type !== undefined) {
                store.waterType =
                    window.SMWaterWaveSpectrum?.normalizeType?.(
                        patch.waterType || patch.type
                    ) ||
                    String(patch.waterType || patch.type || 'river').toLowerCase();
            }

            // Uniform-only changes do not require recompiling the material.
            // Keep needsUpdate for actual physical-material state changes only.
            if (
                patch.roughness !== undefined ||
                patch.metalness !== undefined
            ) {
                material.needsUpdate =
                    true;
            }
        }
    }

    window.SMWaterMaterialFactory =
        SMWaterMaterialFactory;
})();
