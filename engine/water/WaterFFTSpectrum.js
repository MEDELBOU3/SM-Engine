// GPU spectral ocean field for SM Engine.
//
// The old water surface was a handful of analytic Gerstner waves. That is
// useful as a fallback, but it inevitably reads as repeating diagonal bands.
// This module follows the same rendering shape as jbouny's FFT Ocean:
// Phillips/JONSWAP-like h0 spectrum -> time-evolved complex spectrum -> two
// dimensional inverse FFT -> displacement and normal textures.
//
// It deliberately owns only the simulation textures. WaterMaterial remains
// responsible for lighting, refraction, foam and underwater rendering.

(function (global) {
    'use strict';

    const DEFAULT_RESOLUTION = 128;
    const DEFAULT_TILE_SIZE = 192;
    const GRAVITY = 9.81;
    const CAPILLARY_K = 370.0;
    const TAU = Math.PI * 2;

    function finite(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, finite(value, min)));
    }

    function normalizeDirection(value, fallback = { x: 1, y: 0 }) {
        let x = finite(value?.x, fallback.x);
        let y = finite(value?.y, fallback.y);
        const length = Math.hypot(x, y);
        if (length < 1e-7) return { ...fallback };
        return { x: x / length, y: y / length };
    }

    function waterType(options) {
        const type = String(options?.waterType || options?.type || 'ocean').toLowerCase();
        return ['river', 'lake', 'ocean', 'pool'].includes(type) ? type : 'ocean';
    }

    function typeAmplitude(type) {
        if (type === 'pool') return 0.18;
        if (type === 'river') return 0.48;
        if (type === 'lake') return 0.68;
        return 1.0;
    }

    function typeChoppiness(type) {
        if (type === 'pool') return 0.35;
        if (type === 'river') return 0.72;
        if (type === 'lake') return 0.82;
        return 1.0;
    }

    // Deterministic gaussian noise. A stable seed is important: rebuilding a
    // spectrum while the user edits wind should change the field smoothly,
    // not make the entire ocean jump to a new random pattern.
    function random01(seed) {
        const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
        return x - Math.floor(x);
    }

    function gaussianPair(seed) {
        const u1 = Math.max(random01(seed), 1e-6);
        const u2 = random01(seed + 19.19);
        const radius = Math.sqrt(-2 * Math.log(u1));
        const angle = TAU * u2;
        return [radius * Math.cos(angle), radius * Math.sin(angle)];
    }

    function square(value) {
        return value * value;
    }

    function dispersion(k) {
        return Math.sqrt(
            GRAVITY * k * (1 + square(k / CAPILLARY_K))
        );
    }

    function spectralDensity(k, direction, windLength) {
        if (k < 1e-5) return 0;

        const omegaPeak = 0.84;
        const peakK = GRAVITY * square(omegaPeak / windLength);
        const c = dispersion(k) / k;
        const peakC = dispersion(peakK) / Math.max(peakK, 1e-5);
        const longWave = Math.exp(-1.25 * square(peakK / k));
        const gamma = 1.7;
        const sigma = 0.08 * (1 + 4 * Math.pow(omegaPeak, -3));
        const peakShape = Math.exp(
            -square(Math.sqrt(k / Math.max(peakK, 1e-5)) - 1) /
            (2 * square(sigma))
        );
        const peakEnhancement = Math.pow(gamma, peakShape);
        const peakFalloff = Math.exp(
            -omegaPeak / Math.sqrt(10) *
            (Math.sqrt(k / Math.max(peakK, 1e-5)) - 1)
        );
        const alphaPeak = 0.006 * Math.sqrt(omegaPeak);
        const broad = 0.5 * alphaPeak * peakC / Math.max(c, 1e-5) *
            longWave * peakEnhancement * peakFalloff;

        const z0 = Math.max(
            1e-6,
            0.000037 * square(windLength) / GRAVITY *
            Math.pow(windLength / Math.max(peakC, 1e-5), 0.9)
        );
        const frictionVelocity = 0.41 * windLength /
            Math.max(Math.log(10 / z0), 1);
        const alphaCapillary = 0.01 * (
            frictionVelocity < 0.23
                ? 1 + Math.log(Math.max(frictionVelocity / 0.23, 1e-5))
                : 1 + 3 * Math.log(Math.max(frictionVelocity / 0.23, 1e-5))
        );
        const capillaryFalloff = Math.exp(
            -0.25 * square(k / CAPILLARY_K - 1)
        );
        const capillary = 0.5 * alphaCapillary * 0.23 /
            Math.max(c, 1e-5) * capillaryFalloff * longWave;

        const a0 = Math.log(2) / 4;
        const am = 0.13 * frictionVelocity / 0.23;
        const delta = Math.tanh(
            a0 +
            4 * Math.pow(Math.max(c / Math.max(peakC, 1e-5), 0), 2.5) +
            am * Math.pow(Math.max(0.23 / Math.max(c, 1e-5), 0), 2.5)
        );
        const cosPhi = direction.x;
        const directional = Math.max(
            0.05,
            1 + delta * (2 * cosPhi * cosPhi - 1)
        );

        // k^-4 is the useful ocean-scale energy distribution. The final
        // exponential damps frequencies that are too high for a realtime
        // viewport mesh and keeps the capillary layer stable in half-float.
        return Math.max(
            0,
            (1 / TAU) * Math.pow(k, -4) * (broad + capillary) * directional *
            Math.exp(-0.00045 * k * k)
        );
    }

    class SMWaterFFTSpectrum {
        constructor(renderer, options = {}) {
            this.renderer = renderer || null;
            this.resolution = clamp(options.resolution || DEFAULT_RESOLUTION, 32, 256);
            this.resolution = 2 ** Math.round(Math.log2(this.resolution));
            this.tileSize = Math.max(32, finite(options.tileSize, DEFAULT_TILE_SIZE));
            this.enabled = false;
            this.disposed = false;
            this._materials = new Set();
            this._signature = '';
            this._config = null;
            this._lastTime = -Infinity;
            this._init();
        }

        _init() {
            const THREE = global.THREE;
            const renderer = this.renderer;
            if (!THREE || !renderer ||
                !THREE.WebGLRenderTarget ||
                !THREE.ShaderMaterial ||
                typeof renderer.setRenderTarget !== 'function' ||
                typeof renderer.render !== 'function') {
                return;
            }

            try {
                this._quadScene = new THREE.Scene();
                this._quadCamera = new THREE.Camera();
                this._quadGeometry = new THREE.PlaneGeometry(2, 2);
                this._quad = new THREE.Mesh(this._quadGeometry);
                this._quad.frustumCulled = false;
                this._quadScene.add(this._quad);

                const targetOptions = {
                    minFilter: THREE.NearestFilter,
                    magFilter: THREE.NearestFilter,
                    wrapS: THREE.RepeatWrapping,
                    wrapT: THREE.RepeatWrapping,
                    format: THREE.RGBAFormat,
                    type: THREE.HalfFloatType || THREE.FloatType,
                    depthBuffer: false,
                    stencilBuffer: false,
                    generateMipmaps: false
                };

                this._spectrumTarget = new THREE.WebGLRenderTarget(
                    this.resolution,
                    this.resolution,
                    targetOptions
                );
                this._fftA = new THREE.WebGLRenderTarget(
                    this.resolution,
                    this.resolution,
                    targetOptions
                );
                this._fftB = new THREE.WebGLRenderTarget(
                    this.resolution,
                    this.resolution,
                    targetOptions
                );
                this._normalTarget = new THREE.WebGLRenderTarget(
                    this.resolution,
                    this.resolution,
                    targetOptions
                );

                this._spectrumMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        uInitialSpectrum: { value: null },
                        uTime: { value: 0 },
                        uSize: { value: this.tileSize },
                        uResolution: { value: this.resolution },
                        uChoppiness: { value: 1 }
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = position.xy * 0.5 + 0.5;
                            gl_Position = vec4(position.xy, 0.0, 1.0);
                        }
                    `,
                    fragmentShader: `
                        precision highp float;
                        varying vec2 vUv;
                        uniform sampler2D uInitialSpectrum;
                        uniform float uTime;
                        uniform float uSize;
                        uniform float uResolution;
                        uniform float uChoppiness;
                        const float PI = 3.14159265359;
                        const float G = 9.81;
                        const float KM = 370.0;

                        vec2 multiplyComplex(vec2 a, vec2 b) {
                            return vec2(
                                a.x * b.x - a.y * b.y,
                                a.y * b.x + a.x * b.y
                            );
                        }

                        vec2 multiplyByI(vec2 z) {
                            return vec2(-z.y, z.x);
                        }

                        float omega(float k) {
                            return sqrt(G * k * (1.0 + (k / KM) * (k / KM)));
                        }

                        void main() {
                            vec2 coordinates = gl_FragCoord.xy - 0.5;
                            float n = coordinates.x < uResolution * 0.5
                                ? coordinates.x
                                : coordinates.x - uResolution;
                            float m = coordinates.y < uResolution * 0.5
                                ? coordinates.y
                                : coordinates.y - uResolution;
                            vec2 waveVector = 2.0 * PI *
                                vec2(n, m) / uSize;
                            float k = length(waveVector);
                            if (k < 0.00001) {
                                gl_FragColor = vec4(0.0);
                                return;
                            }

                            vec2 h0 = texture2D(uInitialSpectrum, vUv).rg;
                            vec2 mirroredUv = 1.0 - vUv + 1.0 / uResolution;
                            vec2 h0Star = texture2D(uInitialSpectrum, mirroredUv).rg;
                            h0Star.y *= -1.0;
                            vec2 phase = vec2(
                                cos(omega(k) * uTime),
                                sin(omega(k) * uTime)
                            );
                            vec2 h = multiplyComplex(h0, phase) +
                                multiplyComplex(
                                    h0Star,
                                    vec2(phase.x, -phase.y)
                                );
                            vec2 kDirection = waveVector / k;
                            vec2 hX = -multiplyByI(
                                h * kDirection.x
                            ) * uChoppiness;
                            vec2 hZ = -multiplyByI(
                                h * kDirection.y
                            ) * uChoppiness;
                            gl_FragColor = vec4(
                                hX + multiplyByI(h),
                                hZ
                            );
                        }
                    `,
                    depthTest: false,
                    depthWrite: false
                });

                this._fftMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        uInput: { value: null },
                        uTransformSize: { value: this.resolution },
                        uSubtransformSize: { value: 2 },
                        uHorizontal: { value: 1 },
                        uNormalize: { value: 1 }
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = position.xy * 0.5 + 0.5;
                            gl_Position = vec4(position.xy, 0.0, 1.0);
                        }
                    `,
                    fragmentShader: `
                        precision highp float;
                        varying vec2 vUv;
                        uniform sampler2D uInput;
                        uniform float uTransformSize;
                        uniform float uSubtransformSize;
                        uniform float uHorizontal;
                        uniform float uNormalize;
                        const float PI = 3.14159265359;

                        vec2 multiplyComplex(vec2 a, vec2 b) {
                            return vec2(
                                a.x * b.x - a.y * b.y,
                                a.y * b.x + a.x * b.y
                            );
                        }

                        void main() {
                            float index = (uHorizontal > 0.5
                                ? vUv.x
                                : vUv.y) * uTransformSize - 0.5;
                            float halfSub = uSubtransformSize * 0.5;
                            float evenIndex = floor(index / uSubtransformSize) *
                                halfSub + mod(index, halfSub);
                            vec2 evenUv;
                            vec2 oddUv;
                            if (uHorizontal > 0.5) {
                                evenUv = vec2(
                                    (evenIndex + 0.5) / uTransformSize,
                                    vUv.y
                                );
                                oddUv = vec2(
                                    (evenIndex + uTransformSize * 0.5 + 0.5) /
                                        uTransformSize,
                                    vUv.y
                                );
                            } else {
                                evenUv = vec2(
                                    vUv.x,
                                    (evenIndex + 0.5) / uTransformSize
                                );
                                oddUv = vec2(
                                    vUv.x,
                                    (evenIndex + uTransformSize * 0.5 + 0.5) /
                                        uTransformSize
                                );
                            }
                            vec4 even = texture2D(uInput, evenUv);
                            vec4 odd = texture2D(uInput, oddUv);
                            float twiddleArgument = -2.0 * PI *
                                (index / uSubtransformSize);
                            vec2 twiddle = vec2(
                                cos(twiddleArgument),
                                sin(twiddleArgument)
                            );
                            vec2 outputA = even.xy +
                                multiplyComplex(twiddle, odd.xy);
                            vec2 outputB = even.zw +
                                multiplyComplex(twiddle, odd.zw);
                            gl_FragColor = vec4(
                                outputA * uNormalize,
                                outputB * uNormalize
                            );
                        }
                    `,
                    depthTest: false,
                    depthWrite: false
                });

                this._normalMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        uDisplacementMap: { value: null },
                        uResolution: { value: this.resolution },
                        uSize: { value: this.tileSize }
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = position.xy * 0.5 + 0.5;
                            gl_Position = vec4(position.xy, 0.0, 1.0);
                        }
                    `,
                    fragmentShader: `
                        precision highp float;
                        varying vec2 vUv;
                        uniform sampler2D uDisplacementMap;
                        uniform float uResolution;
                        uniform float uSize;

                        vec3 displacement(vec2 uv) {
                            // A broken/quantized float target must not turn
                            // one texel into an infinite normal. The vertex
                            // path has the same guard in WaterMaterial.
                            return clamp(
                                texture2D(uDisplacementMap, uv).rgb,
                                vec3(-4.0),
                                vec3(4.0)
                            );
                        }

                        void main() {
                            float texel = 1.0 / uResolution;
                            float texelSize = uSize / uResolution;
                            vec3 center = displacement(vUv);
                            vec3 right = vec3(texelSize, 0.0, 0.0) +
                                displacement(vUv + vec2(texel, 0.0)) - center;
                            vec3 left = vec3(-texelSize, 0.0, 0.0) +
                                displacement(vUv - vec2(texel, 0.0)) - center;
                            vec3 top = vec3(0.0, 0.0, -texelSize) +
                                displacement(vUv - vec2(0.0, texel)) - center;
                            vec3 bottom = vec3(0.0, 0.0, texelSize) +
                                displacement(vUv + vec2(0.0, texel)) - center;
                            vec3 normalSum =
                                cross(right, top) +
                                cross(top, left) +
                                cross(left, bottom) +
                                cross(bottom, right);
                            float normalLength = length(normalSum);
                            vec3 normal = normalLength > 0.00001
                                ? normalSum / normalLength
                                : vec3(0.0, 1.0, 0.0);
                            gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
                        }
                    `,
                    depthTest: false,
                    depthWrite: false
                });

                this._quad.material = this._spectrumMaterial;
                this.enabled = true;
            } catch (error) {
                this.enabled = false;
                this.dispose();
                console.warn('[SMWaterFFT] GPU spectrum unavailable; procedural fallback active.', error);
            }
        }

        _prepare(options = {}) {
            const type = waterType(options);
            const riverDirection = normalizeDirection(options.flowDirection);
            const windDirection = normalizeDirection(
                type === 'river' ? riverDirection : options.windDirection
            );
            const windSpeed = Math.max(0.2, finite(options.windSpeed, 1));
            const waveLength = Math.max(0.2, finite(options.waveLength, 14));
            const waveScale = Math.max(0.08, finite(options.waveScale, 1));
            const tileSize = clamp(
                waveLength * waveScale * 13.5,
                64,
                type === 'ocean' ? 320 : 220
            );
            const waveHeight = Math.max(0, finite(options.waveHeight, 0.22));
            const targetRms = waveHeight * typeAmplitude(type) * 0.78;
            const choppiness = clamp(
                finite(options.waveChoppiness, finite(options.choppiness, 0.48)) *
                finite(options.waveSteepness, 0.42) *
                typeChoppiness(type) * 2.1,
                0.05,
                2.2
            );

            return {
                type,
                direction: windDirection,
                windLength: clamp(windSpeed * 10, 2.0, 70.0),
                waveLength,
                waveScale,
                tileSize,
                targetRms,
                choppiness,
                waveSpeed: Math.max(0, finite(options.waveSpeed, 1.05)),
                animationSpeed: clamp(finite(options.animationSpeed, 1.25), 0.05, 8),
                signature: [
                    type,
                    this.resolution,
                    tileSize.toFixed(4),
                    waveHeight.toFixed(4),
                    windSpeed.toFixed(4),
                    windDirection.x.toFixed(4),
                    windDirection.y.toFixed(4),
                    choppiness.toFixed(4)
                ].join('|')
            };
        }

        _buildInitialSpectrum(config) {
            const THREE = global.THREE;
            const n = this.resolution;
            const data = new Float32Array(n * n * 4);
            const dk = TAU / config.tileSize;
            let variance = 0;

            for (let y = 0; y < n; y += 1) {
                const m = y < n * 0.5 ? y : y - n;
                for (let x = 0; x < n; x += 1) {
                    const index = (y * n + x) * 4;
                    const kx = dk * (x < n * 0.5 ? x : x - n);
                    const kz = dk * m;
                    const kLength = Math.hypot(kx, kz);
                    if (kLength < 1e-5) continue;

                    const kDirection = { x: kx / kLength, y: kz / kLength };
                    const density = spectralDensity(
                        kLength,
                        {
                            x: kDirection.x * config.direction.x + kDirection.y * config.direction.y,
                            y: 0
                        },
                        config.windLength
                    );
                    const amplitude = Math.sqrt(Math.max(density, 0) * 0.5) * dk;
                    const [gaussianX, gaussianY] = gaussianPair(
                        (x + 1) * 928.371 + (y + 1) * 531.719
                    );
                    data[index] = amplitude * gaussianX;
                    data[index + 1] = amplitude * gaussianY;
                    variance += density * dk * dk;
                }
            }

            const normalization = config.targetRms > 0
                ? clamp(config.targetRms / Math.max(Math.sqrt(variance), 1e-5), 0.02, 8)
                : 0;
            for (let i = 0; i < data.length; i += 4) {
                data[i] *= normalization;
                data[i + 1] *= normalization;
            }

            if (!this._initialSpectrum) {
                this._initialSpectrum = new THREE.DataTexture(
                    data,
                    n,
                    n,
                    THREE.RGBAFormat,
                    THREE.FloatType
                );
                this._initialSpectrum.wrapS = THREE.RepeatWrapping;
                this._initialSpectrum.wrapT = THREE.RepeatWrapping;
                this._initialSpectrum.minFilter = THREE.NearestFilter;
                this._initialSpectrum.magFilter = THREE.NearestFilter;
                this._initialSpectrum.generateMipmaps = false;
            } else {
                this._initialSpectrum.image.data = data;
            }
            this._initialSpectrum.needsUpdate = true;

            this._spectrumMaterial.uniforms.uInitialSpectrum.value = this._initialSpectrum;
            this._spectrumMaterial.uniforms.uSize.value = config.tileSize;
            this._normalMaterial.uniforms.uSize.value = config.tileSize;
            this._config = config;
        }

        _render(target, material) {
            const renderer = this.renderer;
            const previousTarget = renderer.getRenderTarget?.() || null;
            const previousAutoClear = renderer.autoClear;
            const previousViewport = new global.THREE.Vector4();
            renderer.getViewport?.(previousViewport);
            try {
                renderer.autoClear = false;
                renderer.setRenderTarget(target);
                renderer.setViewport?.(0, 0, this.resolution, this.resolution);
                renderer.clear?.(true, true, true);
                this._quad.material = material;
                renderer.render(this._quadScene, this._quadCamera);
            } finally {
                renderer.setRenderTarget(previousTarget);
                if (renderer.setViewport && previousViewport.z && previousViewport.w) {
                    renderer.setViewport(previousViewport);
                }
                renderer.autoClear = previousAutoClear;
            }
        }

        _runFFT() {
            let input = this._spectrumTarget;
            let output = this._fftA;
            const stages = Math.round(Math.log2(this.resolution));
            const uniforms = this._fftMaterial.uniforms;

            uniforms.uTransformSize.value = this.resolution;
            uniforms.uHorizontal.value = 1;
            for (let stage = 0; stage < stages; stage += 1) {
                uniforms.uInput.value = input.texture;
                uniforms.uSubtransformSize.value = 2 ** (stage + 1);
                uniforms.uNormalize.value = 1;
                this._render(output, this._fftMaterial);
                input = output;
                output = output === this._fftA ? this._fftB : this._fftA;
            }

            uniforms.uHorizontal.value = 0;
            for (let stage = 0; stage < stages; stage += 1) {
                uniforms.uInput.value = input.texture;
                uniforms.uSubtransformSize.value = 2 ** (stage + 1);
                uniforms.uNormalize.value = stage === stages - 1
                    ? 1 / (this.resolution * this.resolution)
                    : 1;
                this._render(output, this._fftMaterial);
                input = output;
                output = output === this._fftA ? this._fftB : this._fftA;
            }

            this._displacementTarget = input;
        }

        update(time = 0, options = {}) {
            if (!this.enabled || this.disposed) return false;
            try {
                const config = this._prepare(options);
                if (config.signature !== this._signature) {
                    this._signature = config.signature;
                    this._buildInitialSpectrum(config);
                }

                this._spectrumMaterial.uniforms.uTime.value =
                    finite(time) * config.animationSpeed * config.waveSpeed;
                this._spectrumMaterial.uniforms.uChoppiness.value = config.choppiness;
                this._render(this._spectrumTarget, this._spectrumMaterial);
                this._runFFT();

                this._normalMaterial.uniforms.uDisplacementMap.value =
                    this._displacementTarget.texture;
                this._render(this._normalTarget, this._normalMaterial);
                this._lastTime = time;

                for (const material of this._materials) this.attach(material);
                return true;
            } catch (error) {
                // Some older WebGL1 devices expose the texture constants but
                // reject half-float rendering at draw time. Disable only this
                // optional pass so the material can use its procedural path.
                this.enabled = false;
                for (const material of this._materials) this.attach(material);
                console.warn('[SMWaterFFT] GPU pass failed; procedural fallback active.', error);
                return false;
            }
        }

        attach(material) {
            if (!material?.uniforms) return false;
            const uniforms = material.uniforms;
            const enabled = this.enabled && !!this._displacementTarget && !!this._normalTarget;
            if (uniforms.uFFTEnabled) uniforms.uFFTEnabled.value = enabled ? 1 : 0;
            if (uniforms.uFFTDisplacementMap) {
                uniforms.uFFTDisplacementMap.value = enabled
                    ? this._displacementTarget.texture
                    : null;
            }
            if (uniforms.uFFTNormalMap) {
                uniforms.uFFTNormalMap.value = enabled
                    ? this._normalTarget.texture
                    : null;
            }
            if (uniforms.uFFTSize) {
                uniforms.uFFTSize.value = this._config?.tileSize || this.tileSize;
            }
            if (uniforms.uFFTDisplacementScale) uniforms.uFFTDisplacementScale.value = 1;
            if (uniforms.uFFTHorizontalScale) {
                // Zero lateral FFT vertex motion is the safe production
                // default: it prevents one corrupt float texel from opening
                // a strip in the ocean surface. The normal map still carries
                // the high-frequency directional/choppy cue.
                uniforms.uFFTHorizontalScale.value = 0;
            }
            if (uniforms.uFFTVerticalScale) uniforms.uFFTVerticalScale.value = 0.72;
            // Keep the viewport surface topologically safe. FFT normals still
            // provide the detailed spectral lighting response; analytic
            // Gerstner displacement owns the actual vertices so a bad float
            // texel cannot drop them through the terrain/floor and create
            // checkerboard seams.
            if (uniforms.uFFTVertexEnabled) {
                uniforms.uFFTVertexEnabled.value = 0;
            }
            if (uniforms.uFFTNormalStrength) uniforms.uFFTNormalStrength.value = 1;
            this._materials.add(material);
            material.userData.smFFTSpectrum = this;
            return enabled;
        }

        dispose() {
            if (this.disposed) return;
            this.disposed = true;
            this._materials.clear();
            this._initialSpectrum?.dispose?.();
            this._spectrumTarget?.dispose?.();
            this._fftA?.dispose?.();
            this._fftB?.dispose?.();
            this._normalTarget?.dispose?.();
            this._spectrumMaterial?.dispose?.();
            this._fftMaterial?.dispose?.();
            this._normalMaterial?.dispose?.();
            this._quadGeometry?.dispose?.();
            this._quadScene = null;
            this._quadCamera = null;
            this._quad = null;
            this._initialSpectrum = null;
            this._spectrumTarget = null;
            this._fftA = null;
            this._fftB = null;
            this._normalTarget = null;
            this._displacementTarget = null;
        }
    }

    global.SMWaterFFTSpectrum = SMWaterFFTSpectrum;
})(window);
