// ============================================================================
// Environment/SMAdvancedShaderSky.js
// SM Engine — Physically-Based Atmospheric Raymarched Sky (Production Ready)
// Fixed: GLSL Type Safety, Normalized Scale (No float overflow), Robust Depth
// ============================================================================

(function () {
    'use strict';

    const SkyShader = {
        uniforms: {
            uSunPosition: { value: new THREE.Vector3(0.0, 0.2, 0.95).normalize() },
            uRayleigh: { value: 1.4 },            // Rayleigh blue scattering
            uTurbidity: { value: 1.8 },           // Haze / dust factor
            uMieCoefficient: { value: 0.005 },    // Aerosols density
            uMieDirectionalG: { value: 0.82 },    // Sun glow sharp peak
            uOzone: { value: 1.2 },               // Ozone absorption (gives deep blue zenith & golden sunsets)
            uSunIntensity: { value: 24.0 },       // Solar radiance
            uExposure: { value: 1.0 },            // Tone mapping exposure
            uGroundColor: { value: new THREE.Color(0xc7d1dc) }, // pale blue-gray atmospheric horizon
            uHorizonColor: { value: new THREE.Color(0xdbe2e8) },
            uCloudCoverage: { value: 0.48 },
            uCloudDensity: { value: 0.72 },
            uCloudScale: { value: 2.35 },
            uCloudSpeed: { value: 0.018 },
            uCloudHeight: { value: 0.18 },
            uCloudSoftness: { value: 0.22 },
            uCloudShadowStrength: { value: 0.34 },
            uTime: { value: 0.0 },
            uCanonicalSunDirection: { value: new THREE.Vector3(0.0, 1.0, 0.0) },
            uUseCanonicalSunDirection: { value: 1.0 }
        },

        vertexShader: `
            varying vec3 vRayDir;

            void main() {
                // Direction from center of the sky dome
                vRayDir = position;
                
                // Keep sky locked at maximum depth (never clips or fights scene meshes)
                vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position = p.xyww;
            }
        `,

        fragmentShader: `
            precision highp float;

            uniform vec3 uSunPosition;
            uniform vec3 uCanonicalSunDirection;
            uniform float uUseCanonicalSunDirection;
            uniform float uRayleigh;
            uniform float uTurbidity;
            uniform float uMieCoefficient;
            uniform float uMieDirectionalG;
            uniform float uOzone;
            uniform float uSunIntensity;
            uniform float uExposure;
            uniform vec3 uGroundColor;
            uniform vec3 uHorizonColor;
            uniform float uCloudCoverage;
            uniform float uCloudDensity;
            uniform float uCloudScale;
            uniform float uCloudSpeed;
            uniform float uCloudHeight;
            uniform float uCloudSoftness;
            uniform float uCloudShadowStrength;
            uniform float uTime;

            varying vec3 vRayDir;

            // Normalized Planetary Dimensions (Prevents 32-bit float precision overflow)
            const float R_EARTH = 1.0;
            const float R_ATMOS = 1.025;
            const float H_RAYLEIGH = 0.00125;  // 8km scale height
            const float H_MIE      = 0.00018;  // 1.2km scale height
            const float H_OZONE    = 0.00390;  // 25km peak
            const float W_OZONE    = 0.00235;  // 15km thickness

            // Scattering Coefficients
            const vec3 BETA_RAYLEIGH = vec3(5.802, 13.558, 33.100) * 1.5;
            const vec3 BETA_MIE      = vec3(4.0) * 1.5;
            const vec3 BETA_OZONE    = vec3(0.650, 1.881, 0.085) * 1.8;

            const float PI = 3.141592653589793;

            // Ray - Sphere Boundary intersection
            bool hitAtmosphere(vec3 ro, vec3 rd, float r, out float t0, out float t1) {
                float b = dot(ro, rd);
                float c = dot(ro, ro) - r * r;
                float d = b * b - c;
                if (d < 0.0) return false;
                float s = sqrt(d);
                t0 = -b - s;
                t1 = -b + s;
                return true;
            }

            float phaseRayleigh(float cosTheta) {
                return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
            }

            float phaseMie(float cosTheta, float g) {
                float g2 = g * g;
                float num = (1.0 - g2) * (1.0 + cosTheta * cosTheta);
                float denom = (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
                return (3.0 / (8.0 * PI)) * (num / max(denom, 0.0001));
            }

            void computeDensities(float h, out float dR, out float dM, out float dO) {
                dR = exp(-h / H_RAYLEIGH);
                dM = exp(-h / H_MIE);
                dO = max(0.0, 1.0 - abs(h - H_OZONE) / W_OZONE);
            }

            // Light optical depth towards the sun
            vec3 getSunOpticalDepth(vec3 p, vec3 sunDir, vec3 bR, vec3 bM, vec3 bO) {
                float t0, t1;
                if (!hitAtmosphere(p, sunDir, R_ATMOS, t0, t1) || t1 <= 0.0) {
                    return vec3(1e6);
                }

                float stepSize = t1 / 3.0;
                vec3 accum = vec3(0.0);
                for (int i = 0; i < 3; i++) {
                    vec3 sampleP = p + sunDir * ((float(i) + 0.5) * stepSize);
                    float h = length(sampleP) - R_EARTH;
                    if (h < 0.0) return vec3(1e6); // Earth shadow

                    float dR, dM, dO;
                    computeDensities(h, dR, dM, dO);
                    accum += (bR * dR + bM * dM * 1.1 + bO * dO) * stepSize;
                }
                return accum;
            }

            // Procedural Night Sky Stars
            float getStars(vec3 dir) {
                if (dir.y < 0.02) return 0.0;
                vec3 p = normalize(dir) * 350.0;
                vec3 ip = floor(p);
                vec3 fp = fract(p) - 0.5;

                float n = dot(ip, vec3(127.1, 311.7, 74.7));
                float h = fract(sin(n) * 43758.5453);

                if (h > 0.988) {
                    float dist = length(fp);
                    float twinkle = 0.65 + 0.35 * sin(uTime * 3.5 + h * 60.0);
                    return smoothstep(0.06, 0.005, dist) * twinkle * (h - 0.988) * 80.0 * smoothstep(0.02, 0.25, dir.y);
                }
                return 0.0;
            }


            // -----------------------------------------------------------------
            // Optimized procedural cloud layer
            // Multi-octave value noise gives volumetric-looking structure
            // without a second expensive atmospheric raymarch.
            // -----------------------------------------------------------------
            float hash21(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float noise2D(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);

                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));

                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float cloudFBM(vec2 p) {
                float value = 0.0;
                float amplitude = 0.55;
                mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);

                for (int i = 0; i < 5; i++) {
                    value += noise2D(p) * amplitude;
                    p = rot * p * 2.03 + 13.7;
                    amplitude *= 0.50;
                }
                return value;
            }

            float cloudField(vec3 ray, out float detailNoise) {
                // Project the view ray onto a broad horizontal cloud sheet.
                float safeY = max(ray.y, 0.055);
                vec2 cloudUV = ray.xz / safeY;
                cloudUV *= (0.115 * uCloudScale);

                // Wind is intentionally subtle to avoid "texture sliding".
                vec2 wind = vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.37);
                vec2 p = cloudUV + wind;

                float macro = cloudFBM(p);
                float detail = cloudFBM(p * 2.75 + vec2(7.1, -3.4));
                detailNoise = detail;

                float shape = macro * 0.72 + detail * 0.28;
                float threshold = mix(0.76, 0.34, clamp(uCloudCoverage, 0.0, 1.0));
                float softness = max(0.035, uCloudSoftness);

                return smoothstep(threshold - softness, threshold + softness, shape)
                     * clamp(uCloudDensity, 0.0, 1.5);
            }

            vec3 renderClouds(vec3 ray, vec3 sunDir, vec3 skyColor) {
                // Clouds fade at the horizon and never render below it.
                float altitudeMask = smoothstep(0.015, 0.11 + uCloudHeight * 0.05, ray.y);
                if (altitudeMask <= 0.001) return skyColor;

                float detailNoise = 0.0;
                float cloud = cloudField(ray, detailNoise) * altitudeMask;
                if (cloud <= 0.001) return skyColor;

                // Approximate self-shadow by sampling the density toward the sun.
                vec3 lightRay = normalize(ray + sunDir * 0.025);
                float shadowDetail = 0.0;
                float towardSunDensity = cloudField(lightRay, shadowDetail);
                float selfShadow = 1.0 - towardSunDensity * uCloudShadowStrength;

                float sunFacing = clamp(dot(normalize(ray + vec3(0.0, 0.28, 0.0)), sunDir) * 0.5 + 0.5, 0.0, 1.0);
                float silver = pow(max(dot(ray, sunDir), 0.0), 10.0);

                // Warm near low sun, neutral-white at noon.
                float sunset = 1.0 - smoothstep(0.02, 0.38, sunDir.y);
                vec3 noonCloud = vec3(0.96, 0.975, 1.0);
                vec3 sunsetCloud = vec3(1.0, 0.70, 0.46);
                vec3 litCloud = mix(noonCloud, sunsetCloud, sunset * 0.68);

                vec3 cloudBase = mix(vec3(0.48, 0.54, 0.62), litCloud, 0.48 + 0.42 * sunFacing);
                cloudBase *= mix(0.68, 1.0, selfShadow);
                cloudBase += litCloud * silver * 0.38;

                // Softer, darker cloud bottoms; brighter detailed upper structure.
                cloudBase *= mix(0.82, 1.08, detailNoise);

                float alpha = clamp(cloud * (0.78 + 0.22 * detailNoise), 0.0, 0.94);
                return mix(skyColor, cloudBase, alpha);
            }

            // ACES Filmic Tone Mapping
            vec3 acesToneMapping(vec3 color) {
                const float a = 2.51;
                const float b = 0.03;
                const float c = 2.43;
                const float d = 0.59;
                const float e = 0.14;
                return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
            }

            void main() {
                vec3 ray = normalize(vRayDir);
                vec3 sunDir = normalize(
                    mix(
                        normalize(uSunPosition),
                        normalize(uCanonicalSunDirection),
                        clamp(uUseCanonicalSunDirection, 0.0, 1.0)
                    )
                );
                float cosTheta = dot(ray, sunDir);

                // Viewer slightly above surface
                vec3 eye = vec3(0.0, R_EARTH + 0.0001, 0.0);

                float t0, t1;
                if (!hitAtmosphere(eye, ray, R_ATMOS, t0, t1) || t1 <= 0.0) {
                    gl_FragColor = vec4(uGroundColor, 1.0);
                    return;
                }

                // Ground horizon intersection
                float tg0, tg1;
                bool hitGround = hitAtmosphere(eye, ray, R_EARTH, tg0, tg1) && tg0 > 0.0;
                float marchDist = hitGround ? tg0 : t1;

                vec3 bR = BETA_RAYLEIGH * uRayleigh;
                vec3 bM = BETA_MIE * (uMieCoefficient * 180.0) * uTurbidity;
                vec3 bO = BETA_OZONE * uOzone;

                // Primary Atmospheric Raymarch (6 steps for 60fps high fidelity)
                const int SAMPLES = 6;
                float stepSize = marchDist / float(SAMPLES);
                vec3 sumR = vec3(0.0);
                vec3 sumM = vec3(0.0);
                vec3 viewOpticalDepth = vec3(0.0);

                for (int i = 0; i < SAMPLES; i++) {
                    vec3 p = eye + ray * ((float(i) + 0.5) * stepSize);
                    float h = length(p) - R_EARTH;

                    float dR, dM, dO;
                    computeDensities(h, dR, dM, dO);

                    dR *= stepSize;
                    dM *= stepSize;
                    dO *= stepSize;

                    viewOpticalDepth += bR * dR + bM * dM * 1.1 + bO * dO;

                    vec3 sunOpticalDepth = getSunOpticalDepth(p, sunDir, bR, bM, bO);
                    vec3 transmittance = exp(-(viewOpticalDepth + sunOpticalDepth));

                    sumR += dR * transmittance;
                    sumM += dM * transmittance;
                }

                float pR = phaseRayleigh(cosTheta);
                float pM = phaseMie(cosTheta, uMieDirectionalG);

                vec3 sky = (sumR * bR * pR + sumM * bM * pM) * uSunIntensity;

                // Multi-scattering horizon fill
                sky += sumR * bR * max(0.0, sunDir.y * 0.4 + 0.2) * 0.12 * uSunIntensity;

                // Realistic Sun Disk with Limb Darkening
                if (!hitGround) {
                    float sunAngularSize = 0.0093; // ~0.53 degrees
                    float angle = acos(clamp(cosTheta, -1.0, 1.0));
                    if (angle < sunAngularSize) {
                        float r = angle / sunAngularSize;
                        float limb = 1.0 - 0.65 * (1.0 - sqrt(max(0.0, 1.0 - r * r)));
                        vec3 sunExtinction = exp(-getSunOpticalDepth(eye, sunDir, bR, bM, bO));
                        sky += vec3(1.0, 0.94, 0.85) * sunExtinction * uSunIntensity * 3.5 * limb;
                    }
                }

                // Night Transition & Twinkling Stars
                float night = smoothstep(0.05, -0.18, sunDir.y);
                if (night > 0.0) {
                    float stars = getStars(ray);
                    vec3 nightSky = vec3(0.001, 0.003, 0.008);
                    if (!hitGround) {
                        nightSky += vec3(stars);
                    }
                    sky = mix(sky, nightSky, night);
                }

                // Atmospheric horizon: bright desaturated haze instead of a dark base.
                float horizonBand = 1.0 - smoothstep(0.0, 0.22, abs(ray.y));
                float daylight = smoothstep(-0.12, 0.18, sunDir.y);
                vec3 horizonTint = mix(vec3(0.055, 0.075, 0.115), uHorizonColor, daylight);
                sky = mix(sky, horizonTint, horizonBand * (0.34 + uTurbidity * 0.055));

                // Below-horizon ground blend remains soft and neutral.
                if (hitGround || ray.y < 0.0) {
                    float horizonFog = clamp(-ray.y * 12.0, 0.0, 1.0);
                    sky = mix(sky, uGroundColor, horizonFog);
                }

                // Procedural sun-lit cloud layer. Apply before tone mapping so
                // clouds and atmosphere share the same HDR/ACES response.
                if (!hitGround && ray.y > 0.0) {
                    sky = renderClouds(ray, sunDir, sky);
                }

                // ACES Tone Mapping
                vec3 finalColor = acesToneMapping(max(sky, vec3(0.0)) * uExposure);
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    };

    class SMAdvancedShaderSky {
        constructor() {
            this.mesh = null;
            this.material = null;
            this.enabled = false;
            this._animId = null;
            this._startTime = performance.now();
        }

        init(scene = window.scene) {
            if (!scene) return;
            if (this.mesh) {
                if (this.mesh.parent !== scene) scene.add(this.mesh);
                return;
            }

            // Normal size sphere, rendered at infinite depth via shader
            const geometry = new THREE.SphereGeometry(1000, 32, 20);
            this.material = new THREE.ShaderMaterial({
                name: 'SM_Advanced_Atmosphere_Shader',
                vertexShader: SkyShader.vertexShader,
                fragmentShader: SkyShader.fragmentShader,
                uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
                side: THREE.BackSide,
                depthWrite: false,
                depthTest: false // GUARANTEES SKY NEVER GETS HIDDEN OR CLIPPED
            });

            this.mesh = new THREE.Mesh(geometry, this.material);
            this.mesh.name = 'SM_AdvancedShaderSky';
            this.mesh.frustumCulled = false; // NEVER cull the sky
            this.mesh.renderOrder = -9999;    // ALWAYS render behind all scene objects
            this.mesh.userData = {
                isSystemObject: true,
                isShaderSky: true,
                ignoreInTimeline: true,
                selectable: false
            };

            scene.add(this.mesh);

            // Default to ENABLED if not set
            const savedState = localStorage.getItem('sm_setting_advanced_shader_sky');
            const shouldEnable = savedState !== null ? (savedState === 'true') : true;
            this.setEnabled(shouldEnable);

            console.log('[SM Advanced Sky] Initialized and Active.');
        }

        setEnabled(active) {
            this.enabled = !!active;
            localStorage.setItem('sm_setting_advanced_shader_sky', this.enabled ? 'true' : 'false');

            if (!this.mesh && window.scene) {
                this.init(window.scene);
            }
            if (!this.mesh) return;

            this.mesh.visible = this.enabled;

            const scene = window.scene;
            if (this.enabled) {
                if (scene && scene.background) {
                    this._previousBackground = scene.background;
                    scene.background = null;
                }
                this._startLoop();
            } else {
                if (scene && this._previousBackground) {
                    scene.background = this._previousBackground;
                }
                this._stopLoop();
            }

            window.dispatchEvent(new CustomEvent('sm:shader-sky-toggled', { detail: { enabled: this.enabled } }));
        }

        /**
         * Test time of day: 6.5 (Sunrise), 12.0 (Noon), 18.2 (Golden Sunset), 22.0 (Night)
         */
        setTimeOfDay(hours) {
            if (!this.material?.uniforms?.uSunPosition) return;
            const angle = ((hours - 6.0) / 24.0) * Math.PI * 2;
            const y = Math.sin(angle);
            const x = Math.cos(angle) * 0.85;
            const z = Math.cos(angle) * 0.52;

            const sunVec = new THREE.Vector3(x, y, z).normalize();
            this.material.uniforms.uSunPosition.value.copy(sunVec);

            // Sync with scene sun light
            const sunLight = window.scene?.getObjectByName?.('Sun Light') || 
                             window.scene?.getObjectByName?.('GameSunLight') || 
                             window.scene?.getObjectByName?.('UE5_SunLight');
            if (sunLight) {
                sunLight.position.copy(sunVec.clone().multiplyScalar(60));
                sunLight.updateMatrixWorld(true);
            }
        }

        setClouds(options = {}) {
            const u = this.material?.uniforms;
            if (!u) return;

            const setFloat = (name, value, min, max) => {
                if (value === undefined || !u[name]) return;
                const n = Number(value);
                if (Number.isFinite(n)) u[name].value = THREE.MathUtils.clamp(n, min, max);
            };

            setFloat('uCloudCoverage', options.coverage, 0.0, 1.0);
            setFloat('uCloudDensity', options.density, 0.0, 1.5);
            setFloat('uCloudScale', options.scale, 0.25, 8.0);
            setFloat('uCloudSpeed', options.speed, 0.0, 0.2);
            setFloat('uCloudHeight', options.height, 0.0, 1.0);
            setFloat('uCloudSoftness', options.softness, 0.02, 0.5);
            setFloat('uCloudShadowStrength', options.shadowStrength, 0.0, 0.85);
        }

        setAtmosphere(options = {}) {
            const u = this.material?.uniforms;
            if (!u) return;

            const setFloat = (name, value, min, max) => {
                if (value === undefined || !u[name]) return;
                const n = Number(value);
                if (Number.isFinite(n)) u[name].value = THREE.MathUtils.clamp(n, min, max);
            };

            setFloat('uRayleigh', options.rayleigh, 0.1, 4.0);
            setFloat('uTurbidity', options.turbidity, 0.1, 10.0);
            setFloat('uMieCoefficient', options.mie, 0.0001, 0.03);
            setFloat('uMieDirectionalG', options.mieG, 0.0, 0.98);
            setFloat('uOzone', options.ozone, 0.0, 3.0);
            setFloat('uSunIntensity', options.sunIntensity, 1.0, 60.0);
            setFloat('uExposure', options.exposure, 0.1, 4.0);

            if (options.groundColor !== undefined && u.uGroundColor) {
                u.uGroundColor.value.set(options.groundColor);
            }
            if (options.horizonColor !== undefined && u.uHorizonColor) {
                u.uHorizonColor.value.set(options.horizonColor);
            }
        }

        syncWithCanonicalSun() {
            const u = this.material?.uniforms;
            const controller = window.smSunController;

            if (!u?.uCanonicalSunDirection || !controller) return false;

            const direction = controller.getSunDirection?.(new THREE.Vector3());
            if (!direction) return false;

            u.uCanonicalSunDirection.value.copy(direction).normalize();

            if (u.uUseCanonicalSunDirection) {
                u.uUseCanonicalSunDirection.value = 1.0;
            }

            // Keep the shader's visible sun disk and cloud illumination in sync
            // with the same direction used by the real DirectionalLight.
            if (u.uSunPosition) {
                u.uSunPosition.value.copy(direction).normalize();
            }

            return true;
        }

        update() {
            if (!this.enabled || !this.mesh) return;

            // Follow active camera position
            const camera = window.cameraSystem?.activeCamera || window.camera;
            if (camera) {
                this.mesh.position.copy(camera.position);
            }

            // SMSunController is the single source of truth for sun direction.
            // The DirectionalLight position itself must NOT be normalized because
            // it also contains the controller's target + distance.
            this.syncWithCanonicalSun();

            // Update Time for stars
            if (this.material?.uniforms?.uTime) {
                this.material.uniforms.uTime.value = (performance.now() - this._startTime) * 0.001;
            }

            // Sync renderer exposure
            if (window.renderer && this.material?.uniforms?.uExposure) {
                this.material.uniforms.uExposure.value = window.renderer.toneMappingExposure || 1.0;
            }
        }

        _startLoop() {
            if (this._animId) return;
            const loop = () => {
                this.update();
                this._animId = requestAnimationFrame(loop);
            };
            this._animId = requestAnimationFrame(loop);
        }

        _stopLoop() {
            if (this._animId) {
                cancelAnimationFrame(this._animId);
                this._animId = null;
            }
        }
    }

    window.SMAdvancedShaderSky = new SMAdvancedShaderSky();

    // Auto-init on page load
    const boot = () => {
        if (window.scene) {
            window.SMAdvancedShaderSky.init(window.scene);
        } else {
            setTimeout(boot, 100);
        }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(boot, 200);
    } else {
        window.addEventListener('DOMContentLoaded', boot);
    }
})();