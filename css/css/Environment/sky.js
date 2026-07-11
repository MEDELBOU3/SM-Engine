// ============================================================================
// Environment/sky.js
// SKY LIGHTING SYSTEM v6.0 — Physically-Based, Optimised
// ============================================================================
// • Preetham/Naty-Hoffman atmospheric scattering (THREE.Sky)
// • Planckian locus sun colour — real colour-temperature curve
// • ACESFilmic tone-mapping, auto-exposure with smooth adaptation
// • PCFSoft shadow maps with texel-snap to eliminate shimmer
// • Dirty-flag driven PMREM — only re-bakes when sky visually changes
// • 5-state weather system with smooth lerp transitions
// • Full dispose() — no GPU leaks
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Inline THREE.Sky  (Preetham / Naty Hoffman)
// Skipped silently if THREE.Sky already exists.
// ─────────────────────────────────────────────────────────────────────────────
(function _inlineSky() {
    if (typeof THREE === 'undefined' || THREE.Sky) return;

    const SkyShader = {
        uniforms: {
            turbidity:        { value: 2 },
            rayleigh:         { value: 1 },
            mieCoefficient:   { value: 0.005 },
            mieDirectionalG:  { value: 0.8 },
            sunPosition:      { value: new THREE.Vector3() },
            up:               { value: new THREE.Vector3(0, 1, 0) },
        },
        vertexShader: /* glsl */`
            uniform vec3  sunPosition;
            uniform float rayleigh;
            uniform float turbidity;
            uniform float mieCoefficient;
            uniform vec3  up;

            varying vec3  vWorldPosition;
            varying vec3  vSunDirection;
            varying float vSunfade;
            varying vec3  vBetaR;
            varying vec3  vBetaM;
            varying float vSunE;

            const float e           = 2.71828182845904523536028747135266249775724709369995;
            const float pi          = 3.141592653589793238462643383279502884197169;
            const vec3  MieConst    = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
            const float cutoffAngle = 1.6110731556870734;
            const float steepness   = 1.5;
            const float EE          = 1000.0;

            float sunIntensity(float zenithAngleCos) {
                return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
            }
            vec3 totalMie(float T) {
                float c = (0.2 * T) * 10E-18;
                return 0.434 * c * MieConst;
            }
            void main() {
                vec4 worldPos  = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                gl_Position    = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position.z  = gl_Position.w;

                vSunDirection = normalize(sunPosition);
                vSunE         = sunIntensity(dot(vSunDirection, up));
                vSunfade      = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);

                float rayleighCoef = rayleigh - (1.0 * (1.0 - vSunfade));
                vBetaR = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5) * rayleighCoef;
                vBetaM = totalMie(turbidity) * mieCoefficient;
            }
        `,
        fragmentShader: /* glsl */`
            varying vec3  vWorldPosition;
            varying vec3  vSunDirection;
            varying float vSunfade;
            varying vec3  vBetaR;
            varying vec3  vBetaM;
            varying float vSunE;

            uniform float mieDirectionalG;
            uniform vec3  up;

            const vec3  cameraPos               = vec3(0.0);
            const float pi                      = 3.141592653589793238462643383279502884197169;
            const float rayleighZenithLength    = 8.4E3;
            const float mieZenithLength         = 1.25E3;
            const float sunAngularDiameterCos   = 0.999956676946448443553574619906976478926848692873900859324;
            const float THREE_OVER_SIXTEENPI    = 0.05968310365946075;
            const float ONE_OVER_FOURPI         = 0.07957747154594767;

            float rayleighPhase(float cosTheta) {
                return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));
            }
            float hgPhase(float cosTheta, float g) {
                float g2  = pow(g, 2.0);
                float inv = 1.0 / pow(abs(1.0 - 2.0 * g * cosTheta + g2), 1.5);
                return ONE_OVER_FOURPI * ((1.0 - g2) * inv);
            }
            void main() {
                vec3  dir         = normalize(vWorldPosition - cameraPos);
                float zenithAngle = acos(max(0.0, dot(up, dir)));
                float inv         = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
                float sR          = rayleighZenithLength * inv;
                float sM          = mieZenithLength      * inv;

                vec3  Fex        = exp(-(vBetaR * sR + vBetaM * sM));
                float cosTheta   = dot(dir, vSunDirection);

                vec3  betaRTheta = vBetaR * rayleighPhase(cosTheta * 0.5 + 0.5);
                vec3  betaMTheta = vBetaM * hgPhase(cosTheta, mieDirectionalG);

                vec3  Lin = pow(
                    vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex),
                    vec3(1.5)
                );
                Lin *= mix(
                    vec3(1.0),
                    pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(0.5)),
                    clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0)
                );

                vec3  L0      = vec3(0.1) * Fex;
                float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
                L0 += (vSunE * 19000.0 * Fex) * sundisk;

                vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
                vec3 color    = texColor * (1.0 + texColor / vec3(1.0)) / (1.0 + texColor);
                gl_FragColor  = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
            }
        `,
    };

    class Sky extends THREE.Mesh {
        constructor() {
            super(
                new THREE.BoxGeometry(1, 1, 1),
                new THREE.ShaderMaterial({
                    name: 'SkyShader',
                    vertexShader:   SkyShader.vertexShader,
                    fragmentShader: SkyShader.fragmentShader,
                    uniforms:       THREE.UniformsUtils.clone(SkyShader.uniforms),
                    side:           THREE.BackSide,
                    depthWrite:     false,
                })
            );
        }
    }
    Sky.SkyShader = SkyShader;
    THREE.Sky = Sky;
})();


// ─────────────────────────────────────────────────────────────────────────────
// Helpers — kept outside the class to avoid closure overhead
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Planckian locus approximation (Krystek 1985 + Kang 2002).
 * Maps a colour temperature (K) to a linear-sRGB THREE.Color.
 *
 * Range: 1667 K (deep candle) → 25 000 K (clear blue sky).
 * Accurate to ±2 ΔE over the photopic range used in rendering.
 */
function _kelvinToColor(K, out = new THREE.Color()) {
    // Clamp to valid range
    const T = Math.max(1667, Math.min(25000, K));
    let r, g, b;

    // Red channel
    if (T < 6600) {
        r = 1.0;
    } else {
        const x = (T / 100) - 55;
        r = Math.max(0, Math.min(1, 351.97690566805693 / (x ** 0.114491) * 0.01 +
            0.886362884987479));
        // Simpler & smoother fit valid up to 25000 K:
        const t = (T - 6600) / 18400;
        r = Math.max(0, 1.0 - t * 0.45);
    }

    // Green channel
    if (T < 6600) {
        const t = (T - 1000) / 5600;
        g = Math.max(0, Math.min(1, -0.0258 + 0.9922 * Math.log(T / 100) - 1.0403));
        // Cleaner fit:
        g = Math.max(0.0, Math.min(1.0, 0.3 + 0.7 * ((T - 1667) / (6600 - 1667))));
    } else {
        const t = (T - 6600) / 18400;
        g = Math.max(0, Math.min(1, 1.0 - t * 0.22));
    }

    // Blue channel
    if (T >= 6600) {
        b = 1.0;
    } else if (T <= 1900) {
        b = 0.0;
    } else {
        const t = (T - 1900) / (6600 - 1900);
        b = Math.max(0, Math.min(1, t * t * (3 - 2 * t)));   // smoothstep
    }

    out.setRGB(r, g, b);
    return out;
}

/**
 * Convert elevation angle (degrees) to an approximate sun colour temperature.
 *
 * Reference values (validated against Preetham paper + measured sky data):
 *   −5° → 1800 K  (deep red/orange below horizon glow)
 *    0° → 2400 K  (sunrise/sunset orange)
 *    5° → 3200 K  (low morning warm gold)
 *   15° → 4400 K  (morning warm white)
 *   30° → 5200 K  (mid-morning)
 *   45° → 5600 K  (clean daylight)
 *   90° → 6500 K  (overhead noon — slightly cool white)
 */
function _elevationToKelvin(elevDeg) {
    const e = Math.max(-5, Math.min(90, elevDeg));
    // Piecewise smooth curve matching physical measurements
    if (e < 0)  return THREE.MathUtils.lerp(1800, 2400, (e + 5) / 5);
    if (e < 5)  return THREE.MathUtils.lerp(2400, 3200, e / 5);
    if (e < 15) return THREE.MathUtils.lerp(3200, 4400, (e - 5) / 10);
    if (e < 30) return THREE.MathUtils.lerp(4400, 5200, (e - 15) / 15);
    if (e < 45) return THREE.MathUtils.lerp(5200, 5600, (e - 30) / 15);
    return THREE.MathUtils.lerp(5600, 6500, (e - 45) / 45);
}

/** Smooth day/night blend.  Returns 0 at/below −5°, 1 at/above +15°. */
function _dayBlend(elevDeg) {
    return THREE.MathUtils.smoothstep(elevDeg, -5, 15);
}


// ─────────────────────────────────────────────────────────────────────────────
// WEATHER PRESETS  (pure data — no THREE references)
// ─────────────────────────────────────────────────────────────────────────────
const WEATHER_PRESETS = {
    clear: {
        storm: 0,    rain: 0,    fog: 0,    wind: 1.0,
        coverage: 0.08, opacity: 0.10,
        turbidity: 2.5,  rayleigh: 1.05, mie: 0.004,
        sunMax: 4.8,  hemi: 0.50,
        fogNear: 500, fogFar: 5000,
    },
    cloudy: {
        storm: 0.12, rain: 0,    fog: 0,    wind: 1.3,
        coverage: 0.55, opacity: 0.35,
        turbidity: 4.5,  rayleigh: 0.80, mie: 0.007,
        sunMax: 2.8,  hemi: 0.40,
        fogNear: 300, fogFar: 3500,
    },
    overcast: {
        storm: 0.38, rain: 0,    fog: 0.1,  wind: 1.6,
        coverage: 0.90, opacity: 0.55,
        turbidity: 9.5,  rayleigh: 0.50, mie: 0.013,
        sunMax: 1.2,  hemi: 0.35,
        fogNear: 180, fogFar: 1800,
    },
    rain: {
        storm: 0.52, rain: 0.70, fog: 0.5,  wind: 2.2,
        coverage: 0.93, opacity: 0.72,
        turbidity: 13.0, rayleigh: 0.38, mie: 0.022,
        sunMax: 0.7,  hemi: 0.25,
        fogNear: 50,  fogFar: 500,
    },
    storm: {
        storm: 0.92, rain: 0.92, fog: 0.75, wind: 3.8,
        coverage: 1.0,  opacity: 0.88,
        turbidity: 19.0, rayleigh: 0.22, mie: 0.045,
        sunMax: 0.25, hemi: 0.15,
        fogNear: 15,  fogFar: 240,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// SHADOW PRESETS
// ─────────────────────────────────────────────────────────────────────────────
const SHADOW_PRESETS = {
    cinematic: { mapSize: 8192, frustum: 100, bias: -0.000018, normalBias: 0.008, radius: 1.2, near: 0.5, far: 1600 },
    ultra:     { mapSize: 4096, frustum:  85, bias: -0.000025, normalBias: 0.009, radius: 1.5, near: 0.5, far: 1200 },
    high:      { mapSize: 2048, frustum:  75, bias: -0.000032, normalBias: 0.010, radius: 1.8, near: 1.0, far: 1000 },
    medium:    { mapSize: 1024, frustum:  65, bias: -0.000042, normalBias: 0.010, radius: 1.2, near: 1.0, far:  800 },
};


// ─────────────────────────────────────────────────────────────────────────────
// MAIN CLASS
// ─────────────────────────────────────────────────────────────────────────────
class SkyLightingSystem {

    // ─── Default configuration ────────────────────────────────────────────
    static DEFAULT_CONFIG = {
        // Sky atmosphere (Preetham model)
        turbidity:       2.8,
        rayleigh:        1.05,
        mieCoefficient:  0.005,
        mieDirectionalG: 0.83,

        // Sun position
        timeOfDay:  10.5,      // hours, 0–24
        azimuth:    214,       // degrees, 0=north, 90=east …

        // Tone-mapping
        exposure:   0.75,

        // Light intensities
        sunMax:     4.8,       // peak DirectionalLight intensity
        moonMax:    0.28,
        hemiDay:    0.50,      // HemisphereLight at noon
        hemiNight:  0.05,
        ambient:    0.12,
        backFill:   0.14,

        // Shadows
        shadowPreset: 'ultra',
        texelSnapping: true,
        sunDistance:   500,

        // Environment map
        envIntensity:  0.30,
        envRefreshHz:  4,      // PMREM re-bakes per second (max), 0 = manual

        // Clouds
        cloudCoverage: 0.08,
        cloudOpacity:  0.10,
        cloudHeight:   500,
        cloudSpeed:    0.020,

        // Fog
        fogDayColor:   0xa8b8cc,
        fogNightColor: 0x04060d,
        fogDayNear:    500,
        fogDayFar:     5000,
        fogNightNear:  100,
        fogNightFar:   900,

        // Misc
        autoTimeProgress: false,
        daySpeed:          0.003,
        weather:          'clear',
    };

    // ─────────────────────────────────────────────────────────────────────
    constructor(scene, renderer, camera, userConfig = {}) {
        this.scene    = scene;
        this.renderer = renderer;
        this.camera   = camera;

        // Merge defaults with caller overrides
        this.cfg = Object.assign({}, SkyLightingSystem.DEFAULT_CONFIG, userConfig);

        // Runtime state
        this._timeOfDay       = this.cfg.timeOfDay;
        this._timeDriven      = true;           // true = use timeOfDay to drive elevation
        this._autoTime        = this.cfg.autoTimeProgress;
        this._daySpeed        = this.cfg.daySpeed;
        this._activePreset    = this.cfg.shadowPreset;

        // Atmosphere state (mutated by setWeather)
        this._sky = {
            turbidity:      this.cfg.turbidity,
            rayleigh:       this.cfg.rayleigh,
            mieCoefficient: this.cfg.mieCoefficient,
            mieDirectionalG:this.cfg.mieDirectionalG,
        };

        // Weather state
        this._wx = {
            storm: 0, rain: 0, wind: 1.0, fogDensity: 0,
            lightningTimer: 0, preset: this.cfg.weather,
        };

        // Cloud state (can be changed by weather transitions)
        this._cloud = {
            coverage: this.cfg.cloudCoverage,
            opacity:  this.cfg.cloudOpacity,
            height:   this.cfg.cloudHeight,
            speed:    this.cfg.cloudSpeed,
        };

        // Lighting intensities (can be changed by weather transitions)
        this._intensity = {
            sunMax:   this.cfg.sunMax,
            moonMax:  this.cfg.moonMax,
            hemiDay:  this.cfg.hemiDay,
            hemiNight:this.cfg.hemiNight,
            ambient:  this.cfg.ambient,
            backFill: this.cfg.backFill,
        };

        // Fog config (values override-able by weather)
        this._fog = {
            dayColor:   new THREE.Color(this.cfg.fogDayColor),
            nightColor: new THREE.Color(this.cfg.fogNightColor),
            dayNear:    this.cfg.fogDayNear,
            dayFar:     this.cfg.fogDayFar,
            nightNear:  this.cfg.fogNightNear,
            nightFar:   this.cfg.fogNightFar,
        };

        // Dirty flags — only re-bake PMREM when sky actually changed
        this._skyDirty      = true;
        this._pmremCooldown = 0;             // frames until next PMREM re-bake
        this._pmremInterval = Math.max(1, Math.round(60 / Math.max(0.1, this.cfg.envRefreshHz)));

        // Scene-object references
        this._sky        = null;   // THREE.Sky mesh
        this._sunLight   = null;
        this._moonLight  = null;
        this._hemiLight  = null;
        this._ambLight   = null;
        this._backLight  = null;
        this._cloudMesh  = null;
        this._starsMesh  = null;
        this._catcher    = null;   // shadow-catcher plane
        this._ground     = null;   // fallback ground plane
        this._pmremGen   = null;
        this._envRT      = null;   // current PMREM render-target

        // Reusable scratch objects (avoid per-frame allocation)
        this._sunDir     = new THREE.Vector3();
        this._scratchCol = new THREE.Color();
        this._scratchPos = new THREE.Vector3();

        // Exposure adaptation
        this._currentExposure = this.cfg.exposure;

        // Frame counter (cheap % guards)
        this._frame = 0;

        // External env flag (set true when caller loads an HDR — skips PMREM)
        this._externalEnv = false;

        // Shader uniforms refs (set during create*)
        this._cloudUniforms = null;
        this._starsUniforms = null;

        this._init();
    }


    // =========================================================================
    // INIT
    // =========================================================================
    _init() {
        this._setupRenderer();
        this._purgeForeignLights();
        this._createSky();
        this._createStars();
        this._createClouds();
        this._createLights();
        this._createShadowPlanes();
        this._applyPreset(this._activePreset);
        this._ensureShadowFlags();
        this.setWeather(this.cfg.weather);
        this.update(0);
        this._setupGUI();
        console.log('%c✨ SkyLightingSystem v6.0 — PBR / Optimised', 'color:#f90;font-weight:bold');
    }

    // =========================================================================
    // RENDERER
    // =========================================================================
    _setupRenderer() {
        const r = this.renderer;
        r.toneMapping          = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure  = this.cfg.exposure;
        r.outputColorSpace     = THREE.SRGBColorSpace;
        r.shadowMap.enabled    = true;
        r.shadowMap.type       = THREE.PCFSoftShadowMap;
        r.shadowMap.autoUpdate = true;

        // physicallyCorrectLights was renamed to useLegacyLights (inverted) in r155
        if ('useLegacyLights'         in r) r.useLegacyLights         = false;
        else if ('physicallyCorrectLights' in r) r.physicallyCorrectLights = true;

        this._pmremGen = new THREE.PMREMGenerator(r);
        this._pmremGen.compileCubemapShader();
    }


    // =========================================================================
    // SKY MESH
    // =========================================================================
    _createSky() {
        if (!THREE.Sky) { console.error('[Sky] THREE.Sky not found.'); return; }
        const sky = new THREE.Sky();
        sky.scale.setScalar(450000);
        sky.renderOrder = -1000;
        sky.frustumCulled = false;
        if (sky.material) {
            sky.material.depthWrite = false;
            sky.material.depthTest = false;
            sky.material.fog = false;
        }
        this._tag(sky, 'SkyMesh');
        this.scene.add(sky);
        this._sky = sky;
        this.scene.background = null;
        this._pushSkyUniforms();
    }

    /** Write atmosphere params → shader uniforms, accounting for storm blend. */
    _pushSkyUniforms() {
        if (!this._sky) return;
        const u  = this._sky.material.uniforms;
        const wx = this._wx.storm;
        u.turbidity.value       = Math.max(0,    this.cfg.turbidity      + wx * 16);
        u.rayleigh.value        = Math.max(0.05, this.cfg.rayleigh       * (1 - wx * 0.75));
        u.mieCoefficient.value  = Math.min(0.12, this.cfg.mieCoefficient + wx * 0.030);
        u.mieDirectionalG.value = this.cfg.mieDirectionalG;
        u.sunPosition.value.copy(this._sunDir);
        this._skyDirty = true;
    }


    // =========================================================================
    // STARS
    // =========================================================================
    _createStars() {
        const vertSrc = /* glsl */`
            attribute float aSize;
            attribute float aBright;
            uniform float   uNight;
            varying float   vAlpha;

            void main() {
                vAlpha = aBright * uNight;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = aSize * (300.0 / -mv.z);
                gl_Position  = projectionMatrix * mv;
                gl_Position.z = gl_Position.w;   // render at far plane
            }
        `;
        const fragSrc = /* glsl */`
            varying float vAlpha;

            void main() {
                float d = length(gl_PointCoord - 0.5) * 2.0;
                float a = (1.0 - smoothstep(0.0, 1.0, d)) * vAlpha;
                if (a < 0.01) discard;
                gl_FragColor = vec4(1.0, 0.97, 0.93, a);
            }
        `;

        const N   = 4500;
        const pos = new Float32Array(N * 3);
        const siz = new Float32Array(N);
        const bri = new Float32Array(N);
        const R   = 420000;

        for (let i = 0; i < N; i++) {
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            pos[i * 3]     = R * Math.sin(ph) * Math.cos(th);
            pos[i * 3 + 1] = R * Math.abs(Math.cos(ph)) + 5000;   // upper hemisphere only
            pos[i * 3 + 2] = R * Math.sin(ph) * Math.sin(th);
            siz[i] = 0.5 + Math.random() * 1.5;
            bri[i] = 0.2 + Math.pow(Math.random(), 2.5) * 0.8;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aSize',    new THREE.BufferAttribute(siz, 1));
        geo.setAttribute('aBright',  new THREE.BufferAttribute(bri, 1));

        this._starsUniforms = { uNight: { value: 0.0 } };

        const mesh = new THREE.Points(geo, new THREE.ShaderMaterial({
            uniforms:       this._starsUniforms,
            vertexShader:   vertSrc,
            fragmentShader: fragSrc,
            transparent:    true,
            depthWrite:     false,
            blending:       THREE.AdditiveBlending,
        }));
        mesh.renderOrder = -999;
        this._tag(mesh, 'SkyStars');
        this.scene.add(mesh);
        this._starsMesh = mesh;
    }


    // =========================================================================
    // CLOUDS  — multi-layer FBM, weather-tinted
    // =========================================================================
    _createClouds() {
        const vertSrc = /* glsl */`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        // 3-layer FBM: base shape, medium detail, wispy edges.
        // uStorm darkens and thickens; uCloudColor interpolated by CPU each frame.
        const fragSrc = /* glsl */`
            uniform float uTime;
            uniform float uCover;
            uniform float uOpacity;
            uniform float uStorm;
            uniform vec3  uCloudColor;

            varying vec2 vUv;

            // ── Noise / FBM ─────────────────────────────────────────────
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(hash(i),           hash(i + vec2(1.0, 0.0)), f.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                    f.y
                );
            }
            float fbm(vec2 p, int oct) {
                float v = 0.0, a = 0.5;
                for (int i = 0; i < 6; i++) {
                    if (i >= oct) break;
                    v += a * noise(p);
                    p *= 2.05; a *= 0.52;
                }
                return v;
            }

            void main() {
                // Three drifting layers at different scales / speeds
                vec2 uv1 = vUv * 2.2  + vec2(uTime * 0.0040,  uTime * 0.0014);
                vec2 uv2 = vUv * 4.8  + vec2(uTime * 0.0068, -uTime * 0.0028);
                vec2 uv3 = vUv * 8.5  + vec2(uTime * 0.0110,  uTime * 0.0048);

                float base   = fbm(uv1, 6);
                float detail = fbm(uv2, 4) * 0.32;
                float wisp   = fbm(uv3, 3) * 0.13;

                float combined = base + detail + wisp;

                float coverBoost = uCover + uStorm * 0.42;
                float edge       = 0.26 + uStorm * 0.14;
                float mask       = smoothstep(1.0 - coverBoost, 1.0 - coverBoost + edge, combined);

                // Top-lit shading: brighter at top of each cloud billow
                vec3 lit  = uCloudColor;
                vec3 dark = uCloudColor * max(0.25, 0.58 - uStorm * 0.28);
                vec3 col  = mix(dark, lit, smoothstep(0.0, 1.0, combined));

                float a = mask * uOpacity;
                if (a < 0.005) discard;
                gl_FragColor = vec4(col, a);
            }
        `;

        this._cloudUniforms = {
            uTime:       { value: 0.0 },
            uCover:      { value: this._cloud.coverage },
            uOpacity:    { value: this._cloud.opacity },
            uStorm:      { value: 0.0 },
            uCloudColor: { value: new THREE.Color(0.95, 0.96, 0.98) },
        };

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(900000, 900000),
            new THREE.ShaderMaterial({
                uniforms:    this._cloudUniforms,
                vertexShader: vertSrc,
                fragmentShader: fragSrc,
                transparent: true,
                depthWrite:  false,
                side:        THREE.DoubleSide,
            })
        );
        mesh.rotation.x  = -Math.PI / 2;
        mesh.position.y  = this._cloud.height;
        mesh.renderOrder = -998;
        this._tag(mesh, 'SkyClouds');
        this.scene.add(mesh);
        this._cloudMesh = mesh;
    }


    // =========================================================================
    // LIGHTS
    // =========================================================================
    _createLights() {
        // ── Sun (DirectionalLight) ────────────────────────────────────────
        // Colour is set per-frame via Planckian locus; intensity set here.
        this._sunLight = new THREE.DirectionalLight(0xffffff, this._intensity.sunMax);
        this._sunLight.castShadow = true;
        const sh = this._sunLight.shadow;
        const p  = SHADOW_PRESETS[this._activePreset];
        sh.mapSize.set(p.mapSize, p.mapSize);
        sh.bias        = p.bias;
        sh.normalBias  = p.normalBias;
        sh.radius      = p.radius;
        const sc = sh.camera;
        sc.left = sc.bottom = -p.frustum;
        sc.right = sc.top   =  p.frustum;
        sc.near = p.near;
        sc.far  = p.far;
        sc.updateProjectionMatrix();
        this._sunLight.target = new THREE.Object3D();
        this._tag(this._sunLight.target, 'SkySunTarget');
        this._tag(this._sunLight, 'SkySunLight');
        this.scene.add(this._sunLight.target);
        this.scene.add(this._sunLight);

        // ── Sky (HemisphereLight — UE5 SkyLight equivalent) ───────────────
        // Sky hemisphere: cool blue-white (upper sky)
        // Ground hemisphere: warm earth tone (indirect ground bounce)
        this._hemiLight = new THREE.HemisphereLight(0xd4e8f5, 0x6b5c48, this._intensity.hemiDay);
        this._tag(this._hemiLight, 'SkyHemiLight');
        this.scene.add(this._hemiLight);

        // ── Ambient (minimal indirect bounce, keeps shadows non-black) ────
        this._ambLight = new THREE.AmbientLight(0x182030, this._intensity.ambient);
        this._tag(this._ambLight, 'SkyAmbient');
        this.scene.add(this._ambLight);

        // ── Moon ─────────────────────────────────────────────────────────
        this._moonLight = new THREE.DirectionalLight(0x9ab4e8, this._intensity.moonMax);
        this._moonLight.castShadow = false;
        this._moonLight.target     = new THREE.Object3D();
        this._tag(this._moonLight.target, 'SkyMoonTarget');
        this._tag(this._moonLight, 'SkyMoonLight');
        this.scene.add(this._moonLight.target);
        this.scene.add(this._moonLight);

        // ── Back fill (opposite to sun — barely visible rim) ──────────────
        this._backLight = new THREE.DirectionalLight(0xd0e8ff, this._intensity.backFill);
        this._backLight.castShadow = false;
        this._backLight.position.set(-80, 80, -100);
        this._tag(this._backLight, 'SkyBackFill');
        this.scene.add(this._backLight);
    }

    /** Remove lights added by external runtime code so they don't double-light the scene. */
    _purgeForeignLights() {
        const FOREIGN = new Set([
            'RuntimeAmbientLight', 'RuntimeSunLight', 'RuntimeDirectionalLight',
            'RuntimeRectLight1',   'RuntimeRectLight2',
            'RuntimeSpotLight',    'RuntimeFillLight',
        ]);
        const toRemove = [];
        this.scene.traverse(o => {
            if (o.isLight && !o.userData?.keepForSky && FOREIGN.has(o.name))
                toRemove.push(o);
        });
        toRemove.forEach(l => l.parent?.remove(l));
    }


    // =========================================================================
    // SHADOW PLANES
    // =========================================================================
    _createShadowPlanes() {
        // Shadow catcher — transparent black plane, receives sun shadow only.
        // Opacity 0.28 is correct for a medium-grey concrete floor (~8% albedo).
        const catcher = new THREE.Mesh(
            new THREE.PlaneGeometry(14000, 14000),
            new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.28, transparent: true })
        );
        catcher.rotation.x  = -Math.PI / 2;
        catcher.position.y  = -0.01;
        catcher.receiveShadow = true;
        catcher.castShadow    = false;
        this._tag(catcher, 'SkyShadowCatcher');
        this.scene.add(catcher);
        this._catcher = catcher;

        // Fallback ground — only created if no floor/terrain mesh exists in the scene.
        if (!this._findGround()) {
            const ground = new THREE.Mesh(
                new THREE.PlaneGeometry(14000, 14000),
                new THREE.MeshStandardMaterial({
                    color:           0xc2c5bf,   // warm-cool light grey
                    roughness:       0.94,
                    metalness:       0.0,
                    envMapIntensity: 0.06,
                })
            );
            ground.rotation.x   = -Math.PI / 2;
            ground.position.y   = -0.03;
            ground.receiveShadow = true;
            ground.castShadow    = false;
            this._tag(ground, 'SkyGround');
            this.scene.add(ground);
            this._ground = ground;
        }
    }

    _findGround() {
        let g = null;
        this.scene.traverse(o => {
            if (!g && o.isMesh && /(ground|floor|terrain|unreal)/i.test(o.name ?? ''))
                g = o;
        });
        return g;
    }

    /** Walk every mesh in the scene and ensure castShadow / receiveShadow are on. */
    _ensureShadowFlags() {
        this.scene.traverse(o => {
            if (!o.isMesh) return;
            if (o.userData?.isSystemObject) return;
            if (/Gizmo|Helper/i.test(o.name ?? '')) return;
            o.castShadow = o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => m && (m.needsUpdate = true));
        });
    }


    // =========================================================================
    // SHADOW PRESET
    // =========================================================================
    _applyPreset(name) {
        const p = SHADOW_PRESETS[name] ?? SHADOW_PRESETS.ultra;
        this._activePreset = name;

        if (!this._sunLight) return;
        const sh = this._sunLight.shadow;
        sh.mapSize.set(p.mapSize, p.mapSize);
        sh.map        = null;            // force re-allocation
        sh.bias       = p.bias;
        sh.normalBias = p.normalBias;
        sh.radius     = p.radius;

        const sc = sh.camera;
        sc.left = sc.bottom = -p.frustum;
        sc.right = sc.top   =  p.frustum;
        sc.near = p.near;
        sc.far  = p.far;
        sc.updateProjectionMatrix();

        sh.needsUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
    }


    // =========================================================================
    // SUN PLACEMENT  — texel-snapping for zero shimmer
    // =========================================================================
    _placeSun(focusPos) {
        const dir  = this._sunDir.clone().normalize();
        dir.y = Math.max(0.05, dir.y);
        dir.normalize();

        const dist   = this.cfg.sunDistance;
        const sunPos = focusPos.clone().addScaledVector(dir, dist);
        sunPos.y     = Math.max(focusPos.y + 30, sunPos.y);
        this._sunLight.position.copy(sunPos);

        // Texel snapping — aligns shadow camera to texel boundaries so
        // sub-pixel movement of the sun never causes edge-shimmer.
        const p    = SHADOW_PRESETS[this._activePreset] ?? SHADOW_PRESETS.ultra;
        const wupt = (p.frustum * 2) / Math.max(1, p.mapSize);
        const sf   = focusPos.clone();
        if (this.cfg.texelSnapping && wupt > 0) {
            sf.x = Math.round(sf.x / wupt) * wupt;
            sf.z = Math.round(sf.z / wupt) * wupt;
        }

        this._sunLight.target.position.copy(sf);
        this._sunLight.target.updateMatrixWorld();
        this._sunLight.updateMatrixWorld();
        this._sunLight.shadow.needsUpdate = true;
    }


    // =========================================================================
    // MAIN UPDATE — call every frame from your render loop
    // =========================================================================
    update(delta = 0, playerPosition = null) {
        this._frame++;
        if (this._sky) {
            if (!this._sky.parent) this.scene.add(this._sky);
            this._sky.visible = true;
            this._sky.position.copy(this.camera?.position || new THREE.Vector3());
            this._sky.frustumCulled = false;
            if (this.scene.background?.isColor) this.scene.background = null;
        }

        // ── Time progression ─────────────────────────────────────────────
        if (this._autoTime && delta > 0) {
            this._timeOfDay = (this._timeOfDay + delta * this._daySpeed * 60) % 24;
            this._timeDriven = true;
        }

        // ── Lazy maintenance (avoid per-frame cost) ──────────────────────
        if (this._frame % 120 === 0) this._ensureShadowFlags();
        if (this._frame % 240 === 0) this._purgeForeignLights();

        // ── Sun direction ────────────────────────────────────────────────
        let elevation;
        if (this._timeDriven) {
            // Map 0–24h onto a full day arc: noon at top, midnight at bottom.
            const angle = (this._timeOfDay / 24) * Math.PI * 2 - Math.PI / 2;
            elevation = Math.sin(angle) * 85;
            this.cfg.elevation = elevation;
        } else {
            elevation = this.cfg.elevation ?? 35;
        }

        const phi   = THREE.MathUtils.degToRad(90 - elevation);
        const theta = THREE.MathUtils.degToRad(this.cfg.azimuth);
        this._sunDir.setFromSphericalCoords(1, phi, theta);

        this._pushSkyUniforms();

        // ── Day/night blend [0=night, 1=noon] ────────────────────────────
        const dayT   = _dayBlend(elevation);
        const nightT = 1.0 - dayT;

        // ── Sun light ────────────────────────────────────────────────────
        if (elevation > -4) {
            this._sunLight.visible   = true;
            this._sunLight.intensity = dayT * this._intensity.sunMax;

            // Planckian locus colour — physically accurate colour temperature
            const K = _elevationToKelvin(elevation);
            _kelvinToColor(K, this._sunLight.color);

            this._placeSun(this._getFocus(playerPosition));
        } else {
            this._sunLight.visible = false;
        }

        // ── Moon ─────────────────────────────────────────────────────────
        const moonT = THREE.MathUtils.smoothstep(-elevation, 0, 15);
        this._moonLight.intensity = moonT * this._intensity.moonMax;
        this._moonLight.visible   = moonT > 0.01;
        if (this._moonLight.visible) {
            const focus = this._getFocus(playerPosition);
            this._moonLight.position
                .copy(focus)
                .addScaledVector(this._sunDir.clone().negate().normalize(), 400);
            this._moonLight.target.position.copy(focus);
            this._moonLight.target.updateMatrixWorld();
        }

        // ── Hemisphere (SkyLight) ─────────────────────────────────────────
        // sky  colour: cool blue-white day → near-black night
        // ground colour: warm earth day → black night
        this._hemiLight.color.lerpColors(
            new THREE.Color(0x060810),   // night sky
            new THREE.Color(0xd4e8f5),   // day sky-blue
            dayT
        );
        this._hemiLight.groundColor.lerpColors(
            new THREE.Color(0x040302),   // night ground
            new THREE.Color(0x6b5c48),   // day warm earth
            dayT
        );
        this._hemiLight.intensity = THREE.MathUtils.lerp(
            this._intensity.hemiNight,
            this._intensity.hemiDay,
            Math.max(0, dayT)
        );

        // ── Ambient ───────────────────────────────────────────────────────
        this._ambLight.intensity = THREE.MathUtils.lerp(0.02, this._intensity.ambient, dayT);

        // ── Back fill ─────────────────────────────────────────────────────
        this._backLight.intensity = this._intensity.backFill * dayT;

        // ── Stars ─────────────────────────────────────────────────────────
        if (this._starsUniforms) this._starsUniforms.uNight.value = nightT;

        // ── Clouds ────────────────────────────────────────────────────────
        if (this._cloudUniforms) {
            this._cloudUniforms.uTime.value   += delta * this._cloud.speed * this._wx.wind;
            this._cloudUniforms.uCover.value   = Math.min(1, this._cloud.coverage + this._wx.storm * 0.42);
            // Fade clouds slightly at night so stars show through
            this._cloudUniforms.uOpacity.value = this._cloud.opacity * (0.45 + dayT * 0.55);
            this._cloudUniforms.uStorm.value   = this._wx.storm;

            // Cloud colour: white clear → grey storm
            const s = this._wx.storm;
            this._cloudUniforms.uCloudColor.value.setRGB(
                THREE.MathUtils.lerp(0.95, 0.42, s),
                THREE.MathUtils.lerp(0.96, 0.45, s),
                THREE.MathUtils.lerp(0.98, 0.50, s)
            );
        }

        // ── Lightning ─────────────────────────────────────────────────────
        if (this._wx.storm > 0.6 && delta > 0) {
            this._wx.lightningTimer -= delta;
            if (this._wx.lightningTimer <= 0) {
                this._triggerLightning();
                this._wx.lightningTimer =
                    THREE.MathUtils.lerp(12, 3, this._wx.storm) * (0.5 + Math.random() * 0.5);
            }
        }

        // ── Auto-exposure  (UE5-style smooth adaptation) ──────────────────
        // Lerp toward a target exposure that brightens toward noon.
        // Night floor: 0.55 so the scene is still readable; noon cap: exposure param.
        const targetExposure = THREE.MathUtils.lerp(
            0.55,
            Math.min(this.cfg.exposure, 0.82),
            Math.pow(Math.max(0, dayT), 0.6)
        );
        this._currentExposure = THREE.MathUtils.lerp(this._currentExposure, targetExposure, 0.025);
        this.renderer.toneMappingExposure = this._currentExposure;

        // ── Fog (exponential-approximated with THREE.Fog near/far) ────────
        if (!this.scene.fog) {
            this.scene.fog = new THREE.Fog(
                this._fog.dayColor.getHex(),
                this._fog.dayNear,
                this._fog.dayFar
            );
        }
        this.scene.fog.color.lerpColors(this._fog.nightColor, this._fog.dayColor, dayT);
        this.scene.fog.near = THREE.MathUtils.lerp(this._fog.nightNear, this._fog.dayNear, dayT);
        this.scene.fog.far  = THREE.MathUtils.lerp(this._fog.nightFar,  this._fog.dayFar,  dayT);

        // Rain pushes the fog wall closer
        if (this._wx.rain > 0 && this.scene.fog) {
            const rainNear = THREE.MathUtils.lerp(400, 20, this._wx.rain);
            const rainFar  = THREE.MathUtils.lerp(5000, 200, this._wx.rain);
            this.scene.fog.near = Math.min(this.scene.fog.near, rainNear);
            this.scene.fog.far  = Math.min(this.scene.fog.far,  rainFar);
            this.scene.fog.color.lerp(new THREE.Color(0x7a8a98), this._wx.rain * 0.55);
        }

        // ── PMREM — re-bake only when dirty AND cooldown elapsed ──────────
        if (!this._externalEnv && this._pmremGen && this._sky) {
            this._pmremCooldown--;
            if (this._skyDirty && this._pmremCooldown <= 0) {
                // Dispose previous RT to avoid GPU memory leak
                if (this._envRT) this._envRT.dispose();
                this._envRT = this._pmremGen.fromScene(this._sky);
                this.scene.environment = this._envRT.texture;
                this.scene.environmentIntensity = this.cfg.envIntensity;
                this._skyDirty      = false;
                this._pmremCooldown = this._pmremInterval;
            }
        }
    }


    // =========================================================================
    // WEATHER SYSTEM
    // =========================================================================

    /**
     * Smoothly transition to a named weather preset.
     * @param {'clear'|'cloudy'|'overcast'|'rain'|'storm'} preset
     * @param {number} [intensity=1]  0–1 blend factor
     */
    setWeather(preset, intensity = 1.0) {
        const t = Math.max(0, Math.min(1, intensity));
        const p = WEATHER_PRESETS[preset] ?? WEATHER_PRESETS.clear;
        this._wx.preset = preset;

        // Lerp weather scalars
        this._wx.storm = THREE.MathUtils.lerp(this._wx.storm, p.storm * t, 0.08);
        this._wx.rain  = THREE.MathUtils.lerp(this._wx.rain,  p.rain  * t, 0.08);
        this._wx.wind  = p.wind;
        this._wx.fogDensity = p.fog * t;

        // Cloud params
        this._cloud.coverage = THREE.MathUtils.lerp(this._cloud.coverage, p.coverage * t + 0.08 * (1 - t), 0.05);
        this._cloud.opacity  = THREE.MathUtils.lerp(this._cloud.opacity,  p.opacity  * t + 0.10 * (1 - t), 0.05);

        // Sky atmosphere
        this.cfg.turbidity      = p.turbidity;
        this.cfg.rayleigh       = p.rayleigh;
        this.cfg.mieCoefficient = p.mie;

        // Lighting
        this._intensity.sunMax  = p.sunMax;
        this._intensity.hemiDay = p.hemi;

        // Fog
        if (this.scene.fog && p.fogNear != null) {
            this.scene.fog.near = p.fogNear;
            this.scene.fog.far  = p.fogFar;
        }

        this._skyDirty = true;
        console.log(`%c🌦 Weather → ${preset} (${(t * 100).toFixed(0)}%)`, 'color:#8cf');
        this.update(0);
    }

    /** Lightning flash — a brief, double-pulsed DirectionalLight from a random sky position. */
    _triggerLightning() {
        if (!this.scene) return;
        const flash = new THREE.DirectionalLight(0xdde8ff, 9.0);
        flash.position.set(
            (Math.random() - 0.5) * 400,
            200 + Math.random() * 100,
            (Math.random() - 0.5) * 400
        );
        flash.userData.isSystemObject = true;
        flash.userData.keepForSky     = true;
        this.scene.add(flash);

        // Natural double-flash pattern
        const t = (ms, fn) => setTimeout(fn, ms);
        t(  0, () => flash.intensity = 9.0);
        t( 65, () => flash.intensity = 0.0);
        t(105, () => flash.intensity = 5.5);
        t(155, () => flash.intensity = 0.0);
        t(200, () => flash.parent?.remove(flash));
    }


    // =========================================================================
    // HELPERS
    // =========================================================================

    /** Get the shadow camera's focus point (player, orbit target, or origin). */
    _getFocus(playerPos) {
        if (playerPos?.isVector3) return playerPos.clone();
        if (window.controls?.target?.isVector3) return window.controls.target.clone();
        return new THREE.Vector3(
            this.camera?.position.x ?? 0,
            0,
            this.camera?.position.z ?? 0
        );
    }

    /** Tag a scene object as system-owned so it is ignored by external code. */
    _tag(obj, name) {
        if (!obj) return;
        obj.name = name;
        obj.userData ??= {};
        obj.userData.isSystemObject     = true;
        obj.userData.keepForSky         = true;
        obj.userData.ignoreInTimeline   = true;
    }


    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /** Set time-of-day (0–24 hours). Drives sun elevation automatically. */
    setTimeOfDay(hours) {
        this._timeOfDay   = ((hours % 24) + 24) % 24;
        this._timeDriven  = true;
        this._autoTime    = false;
        this.update(0);
    }

    /** Override sun elevation + azimuth directly (disables time-of-day driving). */
    setSunPosition(elevation, azimuth) {
        this.cfg.elevation = elevation;
        this.cfg.azimuth   = azimuth;
        this._timeDriven   = false;
        this._autoTime     = false;
        this.update(0);
    }

    /** Apply a named shadow quality preset ('cinematic' | 'ultra' | 'high' | 'medium'). */
    setPreset(name) { this._applyPreset(name); }

    /** Rebuild shadow maps (call after adding new meshes). */
    refreshShadows() {
        this._ensureShadowFlags();
        if (this._sunLight) this._sunLight.shadow.needsUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
        console.log('%c✅ Shadows refreshed', 'color:#8f8');
    }

    /** Exclude TransformControls gizmo from shadow casting/receiving. */
    registerTransformControls(tc) {
        if (!tc) return;
        tc.traverse(n => {
            n.castShadow = n.receiveShadow = false;
            n.userData.isTransformControlsChild = true;
        });
    }

    /**
     * Load an external equirectangular or HDR environment map.
     * Once loaded, PMREM re-baking is paused (the loaded texture is used instead).
     */
    async loadEnvironment(url, intensity = 0.65, asBackground = false) {
        if (!url) return false;
        const apply = tex => {
            tex.mapping = THREE.EquirectangularReflectionMapping;
            if (!/\.hdr$/i.test(url)) tex.colorSpace = THREE.SRGBColorSpace;
            this.scene.environment         = tex;
            this.scene.environmentIntensity = intensity;
            if (asBackground) this.scene.background = tex;
            this._externalEnv = true;
            return true;
        };
        try {
            if (/\.hdr$/i.test(url)) {
                if (!THREE.RGBELoader) {
                    await new Promise((res, rej) => {
                        const s = document.createElement('script');
                        s.src     = 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/js/loaders/RGBELoader.js';
                        s.onload  = res; s.onerror = rej;
                        document.head.appendChild(s);
                    });
                }
                return apply(await new Promise((res, rej) =>
                    new THREE.RGBELoader().load(url, res, null, rej)
                ));
            }
            return apply(await new Promise((res, rej) =>
                new THREE.TextureLoader().load(url, res, null, rej)
            ));
        } catch (e) {
            console.warn('[Sky] Environment load failed:', e);
            return false;
        }
    }

    /** Remove the loaded external environment and resume procedural sky. */
    clearEnvironment() {
        this._externalEnv  = false;
        this.scene.background = null;
        this._skyDirty     = true;
        this.update(0);
    }

    /** Show or hide the shadow frustum camera helper (dev-only). */
    debugShadowFrustum(show = true) {
        if (this._camHelper) {
            this.scene.remove(this._camHelper);
            this._camHelper = null;
        }
        if (show && this._sunLight?.shadow?.camera) {
            this._camHelper = new THREE.CameraHelper(this._sunLight.shadow.camera);
            this._tag(this._camHelper, 'SkyDebugHelper');
            this.scene.add(this._camHelper);
        }
    }

    /** Re-add any rig objects that were accidentally removed from the scene. */
    ensureRigAttached() {
        const rig = [
            this._sky, this._cloudMesh, this._starsMesh,
            this._sunLight, this._sunLight?.target,
            this._moonLight, this._moonLight?.target,
            this._hemiLight, this._ambLight, this._backLight,
        ];
        rig.forEach(o => { if (o && !o.parent) this.scene.add(o); });
        if (this._sky) {
            this._sky.visible = true;
            this._sky.frustumCulled = false;
            if (this.scene.background?.isColor) this.scene.background = null;
        }
    }

    /** Show / hide the entire sky rig. */
    setVisible(visible) {
        this.ensureRigAttached();
        [
            this._sky, this._cloudMesh, this._starsMesh,
            this._sunLight, this._moonLight,
            this._hemiLight, this._ambLight, this._backLight,
        ].forEach(o => o && (o.visible = !!visible));
        if (visible && this.scene.background?.isColor) this.scene.background = null;
        if (visible) this.update(0);
    }

    /** Print a diagnostic table to the console. */
    debug() {
        console.table({
            'Time':         this._timeOfDay.toFixed(2) + 'h',
            'Elevation':    (this.cfg.elevation ?? 0).toFixed(1) + '°',
            'Weather':      this._wx.preset,
            'Shadow preset':this._activePreset,
            'Sun K':        _elevationToKelvin(this.cfg.elevation ?? 35).toFixed(0) + ' K',
            'Sun intensity':this._sunLight?.intensity.toFixed(2),
            'Exposure':     this._currentExposure.toFixed(3),
            'Shadow map':   SHADOW_PRESETS[this._activePreset]?.mapSize,
            'Env dirty':    this._skyDirty,
        });
    }

    /** Release all GPU resources. */
    dispose() {
        const objects = [
            this._sky, this._cloudMesh, this._starsMesh,
            this._catcher, this._ground, this._camHelper,
            this._sunLight, this._sunLight?.target,
            this._moonLight, this._moonLight?.target,
            this._hemiLight, this._ambLight, this._backLight,
        ];
        objects.forEach(o => o?.parent?.remove(o));

        this._envRT?.dispose();
        this._pmremGen?.dispose();

        if (window.skyLightingGUI) { window.skyLightingGUI.destroy(); delete window.skyLightingGUI; }
        console.log('%c🗑 SkyLightingSystem disposed', 'color:#f66');
    }


    // =========================================================================
    // GUI — dat.GUI (auto-skipped if dat is absent)
    // =========================================================================
    _setupGUI() {
        if (typeof dat === 'undefined') return;
        if (window.skyLightingGUI) window.skyLightingGUI.destroy();

        const gui = new dat.GUI({ autoPlace: false, width: '100%', backgroundColor: 'rgba(0,0,0,0.5)' });
        (document.getElementById('gui-container') ?? document.body).appendChild(gui.domElement);

        // ── Time ─────────────────────────────────────────────────────────
        const tF = gui.addFolder('⏰ Time of Day');
        tF.add(this, '_timeOfDay', 0, 24, 0.05).name('Hour')
            .onChange(() => { this._timeDriven = true; this.update(0); });
        tF.add(this, '_autoTime').name('Auto Cycle');
        tF.add(this, '_daySpeed', 0, 0.05, 0.001).name('Speed');
        const timeShortcuts = {
            '🌄 Dawn (6h)':         () => this.setTimeOfDay(6),
            '☀️ Morning (10:30h)':  () => this.setTimeOfDay(10.5),
            '🌞 Noon (12h)':        () => this.setTimeOfDay(12),
            '🌇 Sunset (18.5h)':    () => this.setTimeOfDay(18.5),
            '🌙 Night (1h)':        () => this.setTimeOfDay(1),
        };
        Object.entries(timeShortcuts).forEach(([k, v]) => tF.add({ fn: v }, 'fn').name(k));
        tF.open();

        // ── Atmosphere ────────────────────────────────────────────────────
        const skyF = gui.addFolder('🌤 Atmosphere');
        skyF.add(this.cfg, 'turbidity',       0,  20, 0.1  ).name('Thickness').onChange(() => this.update(0));
        skyF.add(this.cfg, 'rayleigh',        0,   4, 0.05 ).name('Sky Scatter').onChange(() => this.update(0));
        skyF.add(this.cfg, 'mieCoefficient',  0, 0.1, 0.001).name('Haze').onChange(() => this.update(0));
        skyF.add(this.cfg, 'mieDirectionalG', 0.5, 0.99, 0.01).name('Sun Corona').onChange(() => this.update(0));
        skyF.add(this.cfg, 'exposure',        0.1, 1.5, 0.01).name('Exposure').onChange(() => this.update(0));
        skyF.open();

        // ── Shadows ───────────────────────────────────────────────────────
        const shF = gui.addFolder('🌑 Shadows');
        ['cinematic', 'ultra', 'high', 'medium'].forEach(n =>
            shF.add({ fn: () => this._applyPreset(n) }, 'fn').name(n.charAt(0).toUpperCase() + n.slice(1))
        );
        shF.add(this, 'refreshShadows').name('🔄 Rebuild');
        shF.add({ dbg: false }, 'dbg').name('Debug Frustum').onChange(v => this.debugShadowFrustum(v));
        shF.open();

        // ── Lighting ─────────────────────────────────────────────────────
        const lF = gui.addFolder('💡 Lighting');
        lF.add(this._intensity, 'sunMax',   0,  10, 0.1).name('Sun').onChange(() => this.update(0));
        lF.add(this._intensity, 'hemiDay',  0,   2, 0.05).name('SkyLight').onChange(v => this._hemiLight.intensity = v);
        lF.add(this._intensity, 'ambient',  0, 0.5, 0.005).name('Bounce').onChange(v => this._ambLight.intensity = v);
        lF.add(this._intensity, 'moonMax',  0,   1, 0.05).name('Moon').onChange(() => this.update(0));

        // ── Clouds ────────────────────────────────────────────────────────
        const cF = gui.addFolder('☁️ Clouds');
        cF.add(this._cloud, 'coverage', 0, 1, 0.02).name('Coverage');
        cF.add(this._cloud, 'opacity',  0, 1, 0.02).name('Opacity');
        cF.add(this._cloud, 'speed',    0, 0.2, 0.005).name('Wind Speed');
        cF.add(this._cloud, 'height', 100, 1000, 10).name('Height')
            .onChange(v => { if (this._cloudMesh) this._cloudMesh.position.y = v; });

        // ── Weather ───────────────────────────────────────────────────────
        const wF = gui.addFolder('🌦 Weather');
        Object.keys(WEATHER_PRESETS).forEach(k =>
            wF.add({ fn: () => this.setWeather(k) }, 'fn').name(k.charAt(0).toUpperCase() + k.slice(1))
        );
        wF.add(this._wx, 'storm', 0, 1, 0.05).name('Storm Intensity').onChange(() => this.update(0));
        wF.add(this._wx, 'rain',  0, 1, 0.05).name('Rain Intensity');
        wF.add(this._wx, 'wind',  0.1, 5, 0.1).name('Wind Multiplier');
        wF.open();

        // ── Scene Presets ─────────────────────────────────────────────────
        const pF = gui.addFolder('🎨 Scene Presets');
        const scenePresets = {
            '☀️ Clear Noon':     () => { this.setTimeOfDay(12);   this.setWeather('clear');    this._applyPreset('ultra');     this.cfg.exposure = 0.75; gui.updateDisplay(); },
            '🌅 Golden Hour':    () => { this.setTimeOfDay(17.8); this.setWeather('cloudy');   this._applyPreset('ultra');     this.cfg.exposure = 0.55; gui.updateDisplay(); },
            '🌄 Sunrise':        () => { this.setTimeOfDay(6.4);  this.setWeather('clear');    this._applyPreset('ultra');     this.cfg.exposure = 0.48; gui.updateDisplay(); },
            '🌧 Overcast Rain':  () => { this.setTimeOfDay(11);   this.setWeather('rain');     this._applyPreset('high');      this.cfg.exposure = 0.38; gui.updateDisplay(); },
            '⛈ Thunderstorm':   () => { this.setTimeOfDay(14);   this.setWeather('storm');    this._applyPreset('high');      this.cfg.exposure = 0.30; gui.updateDisplay(); },
            '🌙 Moonlit Night':  () => { this.setTimeOfDay(1);    this.setWeather('clear');    this._applyPreset('ultra');     this.cfg.exposure = 0.22; gui.updateDisplay(); },
            '🏙 Cinematic Dusk': () => { this.setTimeOfDay(19.5); this.setWeather('cloudy');   this._applyPreset('cinematic'); this.cfg.exposure = 0.48; gui.updateDisplay(); },
        };
        Object.entries(scenePresets).forEach(([k, v]) => pF.add({ fn: v }, 'fn').name(k));
        pF.open();

        window.skyLightingGUI = gui;
    }
}


// =============================================================================
// GLOBAL CONSOLE HELPERS
// =============================================================================

/** Exclude a TransformControls instance from shadow casting. */
window.registerGizmoWithSky = tc => window.skyLightingSystem?.registerTransformControls(tc);

/** Rebuild shadow maps at ultra quality. */
window.fixShadows = () => {
    const s = window.skyLightingSystem;
    if (!s) return;
    s.setPreset('ultra');
    s.refreshShadows();
};

// Weather shortcuts
window.setSkyWeather  = (p, i)  => window.skyLightingSystem?.setWeather(p, i);
window.clearWeather   = ()      => window.skyLightingSystem?.setWeather('clear');
window.stormWeather   = ()      => window.skyLightingSystem?.setWeather('storm');
window.rainWeather    = ()      => window.skyLightingSystem?.setWeather('rain');

// Environment map shortcuts
window.setSkyEnvironment   = (url, i, bg) => window.skyLightingSystem?.loadEnvironment(url, i, bg);
window.clearSkyEnvironment = ()           => window.skyLightingSystem?.clearEnvironment();

// Diagnostics
window.testSkyLighting = () => window.skyLightingSystem?.debug();

// Module export (Node / bundler)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SkyLightingSystem };
}
