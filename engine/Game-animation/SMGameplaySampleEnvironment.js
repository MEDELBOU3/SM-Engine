/**
 * SMGameplaySampleEnvironment.js
 *
 * UE5 Game Animation Sample look — CORRECTED.
 *
 * The UE5 look is achieved by RESTRAINT, not by stacking post-FX:
 *   - ONE strong directional sun at low elevation (~30°) → long, readable shadows
 *   - Cool sky / warm-ground hemisphere fill (fills shadows without killing contrast)
 *   - Barely-there ambient (lifts pure blacks by ~5%)
 *   - Matte PBR floor (roughness 0.55, metalness 0.0, envMapIntensity 0.15)
 *   - Very light exponential fog matching the horizon color
 *   - PCFSoft shadows, tight frustum for crisp edges
 *   - ACES Filmic, exposure ~1.0
 *
 * Optional (off by default, opt-in via CONFIG): subtle SSAO only.
 * No bloom. No chromatic aberration. No vignette. No VSM.
 */
class SMGameplaySampleEnvironment {
  constructor(scene, renderer, camera = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera || window.camera || null;

    this.course = new SMGameplaySampleCourse(scene);
    this.world = null;

    this.active = false;
    this._initialized = false;
    this._disposed = false;
    this._physicsRegistered = new Set();

    // -----------------------------------------------------------------
    // CORRECTED CONFIG — matches UE5 Game Animation Sample
    // -----------------------------------------------------------------
    this.CONFIG = {
      // ---- Palette (cool neutral, low saturation) ----
      sceneBackgroundColor: "#8d8f96", // soft overcast gray-blue
      horizonFogColor: "#8d8f96",      // fog EXACTLY matches horizon
      topSkyColor: "#6a6d78",          // slightly darker/cooler above
      lowerSkyColor: "#9a9ba1",        // lighter below horizon (ground haze)
      floorVisualColor: "#3a3d42",
      floorBaseColor: "#2f3237",

      // ---- Fog (light, matches sky) ----
      fogDensity: 0.0038,

      // ---- Sun (LOW elevation is the secret) ----
      sunColor: 0xfff4e0,        // slightly warm (like late afternoon)
      sunIntensity: 3.2,         // strong but not blown out
      sunElevation: 30,          // LOW → long shadows → real depth
      sunAzimuth: 135,           // from front-right (classic key light)
      sunDistance: 80,

      // ---- Shadows: PCFSoft, tight (crisp, no bleed) ----
      shadowMapSize: 2048,
      shadowFrustum: 28,         // TIGHTER = sharper shadows
      shadowNear: 1.0,
      shadowFar: 120,
      shadowBias: -0.00025,
      shadowNormalBias: 0.02,
      shadowRadius: 1.2,         // subtle softness
      shadowFocusHeight: 1.0,
      texelSnapping: true,

      // ---- Hemisphere fill (this is what makes it look "alive") ----
      skyLightTopColor: 0xa8b0c0,     // cool sky
      skyLightGroundColor: 0x554e42,  // warm ground bounce
      skyLightIntensity: 0.65,

      // ---- Ambient: barely there ----
      ambientColor: 0x7a7d85,
      ambientIntensity: 0.08,

      // ---- Exposure: 1.0 = UE5 default ----
      exposure: 1.0,

      // ---- Env map: SUBTLE. This is the #1 thing I got wrong before. ----
      envMapEnabled: true,
      envMapSize: 128,
      envMapIntensityFloor: 0.12,
      envMapIntensityObstacle: 0.18,
      envMapIntensityMetal: 0.45,

      // ---- Post-FX: OFF by default. UE5 look doesn't need them. ----
      ssao: {
        enabled: false, // set true if you really want AO
        kernelRadius: 4,
        minDistance: 0.001,
        maxDistance: 0.06,
      },

      // ---- Interior handling ----
      interiorDoubleSided: true,
      interiorCameraNear: 0.03,

      // ---- Renderer ----
      rendererPhysicalLights: false, // keep simple: non-physical units
    };

    this.backgroundColor = new THREE.Color(this.CONFIG.sceneBackgroundColor);
    this.fogColor = new THREE.Color(this.CONFIG.horizonFogColor);

    this.lights = new THREE.Group();
    this.lights.name = "SMGameplaySampleLights";
    this._tagObject(this.lights);

    this.sun = null;
    this.sunTarget = null;
    this.skyLight = null;
    this.ambientLight = null;
    this.skyDome = null;

    this.sunDirection = new THREE.Vector3();
    this.shadowFocus = new THREE.Vector3();
    this._lastShadowFocus = new THREE.Vector3(
      Number.POSITIVE_INFINITY,
      0,
      0,
    );
    this._scratchDirection = new THREE.Vector3();

    // Env map
    this._envMap = null;
    this._envRT = null;
    this._pmrem = null;

    // Optional SSAO
    this._composer = null;
    this._ssaoPass = null;
    this._outputPass = null;
    this._postProcessingReady = false;

    this._savedState = null;
    this._hiddenObjectStates = new Map();
    this._foreignLightStates = new Map();
    this._previousSkySystemVisible = null;

    this._frameCallback = null;
    this._frameRegistryType = null;

    this._interiorFixedMaterials = new WeakSet();
    this._interiorRefreshAccumulator = 0;

    this._applyRendererConfig();
  }

  // =====================================================================
  // Renderer config — deterministic, correct
  // =====================================================================
  _applyRendererConfig() {
    if (!this.renderer) return;

    // Turn OFF physical lights — we tune intensity by eye, like UE5 artists do
    if ("useLegacyLights" in this.renderer) {
      this.renderer.useLegacyLights = true;
    }

    // ACES Filmic — this is THE tone mapper for UE5 look
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.CONFIG.exposure;

    // Correct output color space
    if ("outputColorSpace" in this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    // PCFSoft — NOT VSM. VSM bleeds and looks wrong at this scale.
    if (this.renderer.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = true;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  _tagObject(object, extra = {}) {
    if (!object) return object;
    object.userData = {
      ...(object.userData || {}),
      isSystemObject: true,
      isGameplaySample: true,
      workspaceOnly: "GAMEPLAY_SAMPLE",
      ignoreInTimeline: true,
      ignoreInHierarchy: true,
      ...extra,
    };
    return object;
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================
  init() {
    if (this._initialized) return this.world;
    if (!this.scene || !this.renderer) {
      console.warn("[Gameplay Sample] Scene or renderer is missing.");
      return null;
    }

    this._initialized = true;

    this.world = this.course.build();
    this._synchronizeCoursePalette();
    this._updateSunDirection();
    this._createSkyDome();
    this._buildLights();

    if (!this.lights.parent) {
      this.scene.add(this.lights);
    }

    // IBL: only if explicitly enabled
    if (this.CONFIG.envMapEnabled) {
      this._buildEnvironmentMap();
    }

    this._prepareShadowCasters();
    this.refreshInteriorVisibility();
    this._updateShadowFocus(true);

    // Optional SSAO (off by default)
    if (this.CONFIG.ssao.enabled) {
      this._initPostProcessing();
    }

    this.course.setVisible(false);
    this.lights.visible = false;
    if (this.skyDome) this.skyDome.visible = false;

    this._installFrameUpdate();

    console.log(
      "%c☀️ SMGameplaySampleEnvironment — UE5 Look (Corrected)",
      "color:#ffd15c;font-weight:bold",
    );

    return this.world;
  }

  _synchronizeCoursePalette() {
    const floor = this.world?.floor;
    if (!floor?.material) return;

    const materials = Array.isArray(floor.material)
      ? floor.material
      : [floor.material];

    materials.forEach((material) => {
      if (!material) return;
      // Sanity clamp: floor must be matte
      material.roughness = Math.max(0.5, material.roughness ?? 0.55);
      material.metalness = Math.min(0.05, material.metalness ?? 0);
      material.envMapIntensity = this.CONFIG.envMapIntensityFloor;
      material.fog = true;
      material.needsUpdate = true;
    });
  }

  _updateSunDirection() {
    const elevation = THREE.MathUtils.degToRad(this.CONFIG.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(this.CONFIG.sunAzimuth);
    const horizontal = Math.cos(elevation);

    this.sunDirection
      .set(
        Math.sin(azimuth) * horizontal,
        Math.sin(elevation),
        Math.cos(azimuth) * horizontal,
      )
      .normalize();

    return this.sunDirection;
  }

  _resolveShadowMapSize() {
    const requested = Math.max(
      1024,
      Number(this.CONFIG.shadowMapSize) || 2048,
    );
    const maxTextureSize =
      this.renderer?.capabilities?.maxTextureSize || 2048;
    return Math.min(requested, maxTextureSize, 2048);
  }

  // =====================================================================
  // Sky dome — CLEAN, no oversaturated sun glow
  // =====================================================================
  _createSkyDome() {
    if (this.skyDome) return this.skyDome;

    this._updateSunDirection();

    const geometry = new THREE.SphereGeometry(1500, 32, 24);
    const material = new THREE.ShaderMaterial({
      name: "SMGameplaySampleSkyMaterial",
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(this.CONFIG.topSkyColor) },
        horizonColor: { value: new THREE.Color(this.CONFIG.horizonFogColor) },
        lowerColor: { value: new THREE.Color(this.CONFIG.lowerSkyColor) },
        sunDirection: { value: this.sunDirection.clone() },
        sunColor: { value: new THREE.Color(this.CONFIG.sunColor) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vSkyDirection;
        void main() {
          vSkyDirection = normalize(position);
          vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = pos.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 lowerColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        varying vec3 vSkyDirection;

        void main() {
          vec3 dir = normalize(vSkyDirection);
          float y = dir.y;

          // Simple 3-stop vertical gradient — clean, no banding
          float upT   = smoothstep(0.0, 0.65, y);        // top blend
          float downT = smoothstep(0.0, -0.35, y);       // lower blend

          vec3 color = mix(horizonColor, topColor, upT);
          color = mix(color, lowerColor, downT);

          // Gentle horizon haze band (soft, no hard line)
          float hazeBand = 1.0 - smoothstep(0.0, 0.22, abs(y));
          color = mix(color, horizonColor, hazeBand * 0.35);

          // Subtle sun glow — VERY restrained. No visible disc.
          float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
          float glow = pow(sunDot, 32.0) * 0.10;
          color += sunColor * glow;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.skyDome = new THREE.Mesh(geometry, material);
    this.skyDome.name = "SMGameplaySampleSkyDome";
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -1000;
    this.skyDome.castShadow = false;
    this.skyDome.receiveShadow = false;
    this._tagObject(this.skyDome, {
      isGameplaySampleSky: true,
      noCastShadow: true,
      noReceiveShadow: true,
    });

    this.scene.add(this.skyDome);
    return this.skyDome;
  }

  // =====================================================================
  // Lights — ONE strong sun, cool/warm hemisphere, tiny ambient
  // =====================================================================
  _buildLights() {
  if (this.sun || !this.scene) return;

  // =====================================================================
  // ALWAYS create our OWN sun — never reuse a foreign light
  // This is the only way to guarantee castShadow stays on.
  // =====================================================================
  const sun = new THREE.DirectionalLight(
    this.CONFIG.sunColor,
    this.CONFIG.sunIntensity,
  );
  sun.name = "SMGameplaySampleSun";
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    this._resolveShadowMapSize(),
    this._resolveShadowMapSize(),
  );

  const sunTarget = new THREE.Object3D();
  sunTarget.name = "SMGameplaySampleSunTarget";
  sun.target = sunTarget;

  this._tagObject(sun, { isGameplaySampleSun: true });
  this.lights.add(sun);
  this.lights.add(sunTarget);

  this.sun = sun;
  this.sunTarget = sunTarget;

  this._configureSunShadow();
  this._updateShadowFocus(true);

  // ---- Hemisphere fill ----
  const skyLight = new THREE.HemisphereLight(
    this.CONFIG.skyLightTopColor,
    this.CONFIG.skyLightGroundColor,
    this.CONFIG.skyLightIntensity,
  );
  skyLight.name = "SMGameplaySampleSkyLight";
  skyLight.position.set(0, 50, 0);
  skyLight.castShadow = false;
  this._tagObject(skyLight, { isGameplaySampleFill: true, noCastShadow: true });
  this.lights.add(skyLight);
  this.skyLight = skyLight;

  // ---- Ambient ----
  const ambient = new THREE.AmbientLight(
    this.CONFIG.ambientColor,
    this.CONFIG.ambientIntensity,
  );
  ambient.name = "SMGameplaySampleAmbient";
  ambient.castShadow = false;
  this._tagObject(ambient, { isGameplaySampleFill: true, noCastShadow: true });
  this.lights.add(ambient);
  this.ambientLight = ambient;
}

  _configureSunShadow() {
    if (!this.sun?.shadow) return;

    const shadow = this.sun.shadow;
    const mapSize = this._resolveShadowMapSize();
    const frustum = Math.max(8, Number(this.CONFIG.shadowFrustum) || 28);

    if (
      shadow.map &&
      (shadow.map.width !== mapSize || shadow.map.height !== mapSize)
    ) {
      shadow.map.dispose?.();
      shadow.map = null;
    }

    shadow.mapSize.set(mapSize, mapSize);
    shadow.camera.left = -frustum;
    shadow.camera.right = frustum;
    shadow.camera.top = frustum;
    shadow.camera.bottom = -frustum;
    shadow.camera.near = Math.max(0.1, this.CONFIG.shadowNear || 1.0);
    shadow.camera.far = Math.max(
      shadow.camera.near + 10,
      this.CONFIG.shadowFar || 120,
    );
    shadow.camera.updateProjectionMatrix();

    shadow.bias = this.CONFIG.shadowBias;
    shadow.normalBias = this.CONFIG.shadowNormalBias;
    shadow.radius = this.CONFIG.shadowRadius;
    shadow.autoUpdate = true;
    shadow.needsUpdate = true;
  }

  // =====================================================================
  // IBL — CORRECTED: bake with tone mapping OFF, apply with SUBTLE intensity
  // =====================================================================
  _buildEnvironmentMap() {
    if (!this.renderer || !this.skyDome) return null;
    if (typeof THREE.PMREMGenerator === "undefined") return null;

    try {
      const size = Math.max(64, Number(this.CONFIG.envMapSize) || 128);

      this._disposeEnvironmentMap();

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const cubeRT = new THREE.WebGLCubeRenderTarget(size, {
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        type: THREE.HalfFloatType,
      });
      const cubeCam = new THREE.CubeCamera(0.1, 3000, cubeRT);
      cubeCam.position.set(0, 1.6, 0);

      // Hide everything except sky
      const hidden = [];
      this.scene.traverse((o) => {
        if (
          o !== this.skyDome &&
          o.visible &&
          (o.isMesh || o.isPoints || o.isLine)
        ) {
          hidden.push(o);
          o.visible = false;
        }
      });

      // IMPORTANT: bake WITHOUT tone mapping so reflections are linear
      const prevToneMapping = this.renderer.toneMapping;
      this.renderer.toneMapping = THREE.NoToneMapping;

      cubeCam.update(this.renderer, this.scene);

      this.renderer.toneMapping = prevToneMapping;
      hidden.forEach((o) => (o.visible = true));

      const envMap = pmrem.fromCubemap(cubeRT.texture).texture;
      envMap.name = "SMGameplaySampleEnvMap";

      this.scene.environment = envMap;
      this._envMap = envMap;
      this._envRT = cubeRT;
      this._pmrem = pmrem;

      this._applyEnvMapIntensity();
      return envMap;
    } catch (e) {
      console.warn("[Gameplay Sample] IBL bake failed:", e);
      return null;
    }
  }

  _applyEnvMapIntensity() {
    if (!this._envMap || !this.world?.root) return;

    const floorMesh = this.world.floor;
    const { envMapIntensityFloor, envMapIntensityObstacle, envMapIntensityMetal } =
      this.CONFIG;

    this.world.root.traverse((obj) => {
      if (!obj?.isMesh || !obj.material) return;

      const mats = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];

      mats.forEach((mat) => {
        if (!mat || mat.isShaderMaterial || mat.isMeshBasicMaterial) return;
        mat.envMap = this._envMap;

        if (obj === floorMesh) {
          mat.envMapIntensity = envMapIntensityFloor;
        } else if (/metal|leg|post/i.test(mat.name || "")) {
          mat.envMapIntensity = envMapIntensityMetal;
        } else {
          mat.envMapIntensity = envMapIntensityObstacle;
        }
        mat.needsUpdate = true;
      });
    });
  }

  _disposeEnvironmentMap() {
    if (this._envRT) {
      this._envRT.dispose?.();
      this._envRT = null;
    }
    if (this._envMap) {
      this._envMap.dispose?.();
      this._envMap = null;
    }
    if (this._pmrem) {
      this._pmrem.dispose?.();
      this._pmrem = null;
    }
    if (this.scene) this.scene.environment = null;
  }

  // =====================================================================
  // Optional SSAO — off by default
  // =====================================================================
  async _initPostProcessing() {
    if (!this.renderer || !this.CONFIG.ssao.enabled) return false;

    const composerCtor = await this._tryImport(
      "three/addons/postprocessing/EffectComposer.js",
      "EffectComposer",
    );
    const renderPassCtor = await this._tryImport(
      "three/addons/postprocessing/RenderPass.js",
      "RenderPass",
    );
    const outputPassCtor = await this._tryImport(
      "three/addons/postprocessing/OutputPass.js",
      "OutputPass",
    );
    const ssaoCtor = await this._tryImport(
      "three/addons/postprocessing/SSAOPass.js",
      "SSAOPass",
    );

    if (!composerCtor || !renderPassCtor || !ssaoCtor) return false;

    const camera = this.camera || window.camera;
    if (!camera) return false;

    const composer = new composerCtor(this.renderer);
    composer.addPass(new renderPassCtor(this.scene, camera));

    const w = this.renderer.domElement?.width || window.innerWidth;
    const h = this.renderer.domElement?.height || window.innerHeight;

    const ssao = new ssaoCtor(this.scene, camera, w, h);
    ssao.kernelRadius = this.CONFIG.ssao.kernelRadius;
    ssao.minDistance = this.CONFIG.ssao.minDistance;
    ssao.maxDistance = this.CONFIG.ssao.maxDistance;
    composer.addPass(ssao);
    this._ssaoPass = ssao;

    if (outputPassCtor) {
      composer.addPass(new outputPassCtor());
      this._outputPass = new outputPassCtor();
    }

    this._composer = composer;
    this._postProcessingReady = true;
    return true;
  }

  async _tryImport(path, name) {
    try {
      const mod = await import(/* @vite-ignore */ path);
      return mod?.[name] || null;
    } catch (e) {
      return window[name] || null;
    }
  }

  _resizePostProcessing() {
    if (!this._composer) return;
    const w = this.renderer?.domElement?.width || window.innerWidth;
    const h = this.renderer?.domElement?.height || window.innerHeight;
    this._composer.setSize(w, h);
    if (this._ssaoPass?.setSize) this._ssaoPass.setSize(w, h);
  }

  _disposePostProcessing() {
    this._composer?.dispose?.();
    this._composer = null;
    this._ssaoPass = null;
    this._outputPass = null;
    this._postProcessingReady = false;
  }

  // =====================================================================
  // State capture / restore
  // =====================================================================
  _captureExternalState() {
    if (this._savedState || !this.renderer || !this.scene) return;

    const clearColor = new THREE.Color();
    this.renderer.getClearColor?.(clearColor);

    this._savedState = {
      sceneBackground: this.scene.background,
      sceneFog: this.scene.fog,
      sceneEnvironment: this.scene.environment,
      clearColor,
      clearAlpha: this.renderer.getClearAlpha?.() ?? 1,
      toneMapping: this.renderer.toneMapping,
      toneMappingExposure: this.renderer.toneMappingExposure,
      outputColorSpace: this.renderer.outputColorSpace,
      useLegacyLights: this.renderer.useLegacyLights,
      shadowEnabled: this.renderer.shadowMap?.enabled,
      shadowType: this.renderer.shadowMap?.type,
      shadowAutoUpdate: this.renderer.shadowMap?.autoUpdate,
    };

    const sky = window.skyLightingSystem;
    this._previousSkySystemVisible = !!(
      sky?.sunLight?.visible ||
      sky?.skyMesh?.visible ||
      sky?.sky?.visible
    );
  }

  _restoreExternalState() {
    if (!this._savedState) return;
    const state = this._savedState;

    this.scene.background = state.sceneBackground;
    this.scene.fog = state.sceneFog;
    this.scene.environment = state.sceneEnvironment;

    if (this.renderer) {
      this.renderer.setClearColor(state.clearColor, state.clearAlpha);
      this.renderer.toneMapping = state.toneMapping;
      this.renderer.toneMappingExposure = state.toneMappingExposure;
      if ("outputColorSpace" in this.renderer) {
        this.renderer.outputColorSpace = state.outputColorSpace;
      }
      if ("useLegacyLights" in this.renderer) {
        this.renderer.useLegacyLights = state.useLegacyLights;
      }
      if (this.renderer.shadowMap) {
        this.renderer.shadowMap.enabled = state.shadowEnabled;
        this.renderer.shadowMap.type = state.shadowType;
        this.renderer.shadowMap.autoUpdate = state.shadowAutoUpdate;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }

    this._savedState = null;
  }

  // =====================================================================
  // Background / fog — fog matches horizon EXACTLY (no mud)
  // =====================================================================
  _applyUE5Background() {
    if (!this.scene) return;

    const backgroundColor = new THREE.Color(this.CONFIG.sceneBackgroundColor);
    const fogColor = new THREE.Color(this.CONFIG.horizonFogColor);

    // Use sky dome, not flat background — but keep a fallback color
    this.scene.background = backgroundColor;
    this._ensureFog(true);

    if (this.world?.root) {
      this.world.root.traverse((child) => {
        if (!child?.isMesh || !child.material) return;
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        mats.forEach((material) => {
          if (!material) return;
          material.fog = true;
          material.needsUpdate = true;
        });
      });
    }

    // Sync sky uniforms
    const uniforms = this.skyDome?.material?.uniforms;
    uniforms?.topColor?.value?.set?.(this.CONFIG.topSkyColor);
    uniforms?.horizonColor?.value?.copy?.(fogColor);
    uniforms?.lowerColor?.value?.set?.(this.CONFIG.lowerSkyColor);
  }

  _ensureFog(force = false) {
    if (!this.scene) return;

    this.fogColor.set(this.CONFIG.horizonFogColor);
    const density = THREE.MathUtils.clamp(
      Number(this.CONFIG.fogDensity) || 0.0038,
      0.0001,
      0.05,
    );

    if (force || !this.scene.fog?.isFogExp2) {
      this.scene.fog = new THREE.FogExp2(this.fogColor.clone(), density);
    } else {
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.density = density;
    }

    // Enable fog on all materials except sky
    this.scene.traverse((object) => {
      if (!object?.isMesh || !object.material || object === this.skyDome)
        return;
      const mats = Array.isArray(object.material)
        ? object.material
        : [object.material];
      mats.forEach((material) => {
        if (!material || material.isShaderMaterial) return;
        material.fog = true;
        material.needsUpdate = true;
      });
    });
  }

  setFogDensity(density) {
    this.CONFIG.fogDensity = THREE.MathUtils.clamp(
      Number(density) || 0.0038,
      0.0001,
      0.05,
    );
    this._ensureFog(true);
  }

  // =====================================================================
  // Hide foreign content
  // =====================================================================
  _rememberObjectVisibility(object) {
    if (!object || this._hiddenObjectStates.has(object)) return;
    this._hiddenObjectStates.set(object, object.visible);
  }

  _hideAllSkyObjects() {
    const sky = window.skyLightingSystem;
    if (sky) {
      try {
        sky.setVisible?.(false);
      } catch (e) {}
    }

    if (!this.scene) return;

    this.scene.traverse((object) => {
      if (!object || object === this.skyDome) return;
      const name = String(object.name || "");
      const isSky =
        name.startsWith("Sky") ||
        object === window.sky ||
        object.userData?.keepForSky === true;
      if (!isSky) return;
      this._rememberObjectVisibility(object);
      object.visible = false;
    });
  }

  _hideLegacyGameEnvironment() {
    if (!this.scene) return;
    const legacyNames = [
      "UnrealEngineFloor",
      "ObstaclesGroup",
      "DistanceMarkers",
      "MotionMatchingSampleCourse",
    ];
    legacyNames.forEach((name) => {
      const object = this.scene.getObjectByName(name);
      if (!object) return;
      object.traverse?.((child) => {
        this._rememberObjectVisibility(child);
        child.visible = false;
      });
      this._rememberObjectVisibility(object);
      object.visible = false;
    });
  }

  _muteForeignLights() {
    if (!this.scene) return;

    this.scene.traverse((light) => {
      if (!light?.isLight || light.userData?.isGameplaySample === true) return;

      const name = String(light.name || "");
      const isDirectional = light.isDirectionalLight === true;
      const isEngineGlobalFill =
        light.isHemisphereLight ||
        light.isAmbientLight ||
        /Sun|Hemi|Ambient|SkyLight|FillLight|Workspace/i.test(name) ||
        light.userData?.keepForSky === true ||
        light.userData?.ws_gameLight === true ||
        light.userData?.ws_terrainLight === true;

      if (!isDirectional && !isEngineGlobalFill) return;

      if (!this._foreignLightStates.has(light)) {
        this._foreignLightStates.set(light, {
          visible: light.visible,
          castShadow: light.castShadow,
          intensity: light.intensity,
        });
      }

      light.visible = false;
      light.castShadow = false;
    });
  }

  _restoreForeignLights() {
    this._foreignLightStates.forEach((state, light) => {
      if (!light) return;
      light.visible = state.visible;
      light.castShadow = state.castShadow;
      if (Number.isFinite(state.intensity)) light.intensity = state.intensity;
    });
    this._foreignLightStates.clear();

    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  _restoreHiddenObjects() {
    this._hiddenObjectStates.forEach((visible, object) => {
      if (object) object.visible = visible;
    });
    this._hiddenObjectStates.clear();

    if (window.skyLightingSystem && this._previousSkySystemVisible != null) {
      try {
        window.skyLightingSystem.setVisible?.(this._previousSkySystemVisible);
      } catch (e) {}
    }
    this._previousSkySystemVisible = null;
  }

  // =====================================================================
  // Interior handling
  // =====================================================================
  _isPlayerOrCharacterObject(object) {
    if (!object) return false;
    const check = (o) =>
      o.userData?.isPlayer === true ||
      o.userData?.isPlayerRoot === true ||
      o.userData?.isPlayerVisual === true ||
      o.userData?.workspaceOnly === "PLAYER";
    if (check(object)) return true;
    let parent = object.parent;
    while (parent) {
      if (check(parent)) return true;
      parent = parent.parent;
    }
    return false;
  }

  _isArchitecturalMesh(object) {
    if (!object?.isMesh) return false;
    if (object === this.skyDome) return false;
    if (this._isPlayerOrCharacterObject(object)) return false;
    if (this._isHelperMesh(object)) return false;

    const userData = object.userData || {};
    const name = String(object.name || "").toLowerCase();
    const parentName = String(object.parent?.name || "").toLowerCase();

    if (
      userData.isBuilding === true ||
      userData.isBuildingPart === true ||
      userData.isArchitecture === true ||
      userData.isArchitectural === true ||
      userData.isCityObject === true ||
      userData.isCityRoot === true ||
      userData.isProceduralCity === true ||
      userData.interiorVisible === true ||
      userData.doubleSided === true
    ) {
      return true;
    }

    return (
      /wall|building|house|room|roof|ceiling|door|window|warehouse|tower|corridor|hall|interior|exterior|architecture|city|apartment|garage|shop|office|facade|pillar|column/.test(
        name,
      ) ||
      /building|house|room|warehouse|tower|architecture|city|interior/.test(
        parentName,
      )
    );
  }

  _makeMaterialInteriorSafe(material) {
    if (!material || this._interiorFixedMaterials.has(material)) return;
    if (material === this.skyDome?.material || material.isShaderMaterial)
      return;
    material.side = THREE.DoubleSide;
    material.shadowSide = THREE.FrontSide;
    material.needsUpdate = true;
    this._interiorFixedMaterials.add(material);
  }

  refreshInteriorVisibility(root = this.scene) {
    if (!this.CONFIG.interiorDoubleSided || !root?.traverse) return 0;
    let fixedMeshes = 0;
    root.traverse((object) => {
      if (!this._isArchitecturalMesh(object)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        this._makeMaterialInteriorSafe(material);
      });
      fixedMeshes++;
    });
    return fixedMeshes;
  }

  // =====================================================================
  // Camera / controls
  // =====================================================================
  _configureCamera() {
    const camera = this.camera || window.camera;
    if (!camera?.isPerspectiveCamera) return;
    camera.near = Math.max(
      0.01,
      Number(this.CONFIG.interiorCameraNear) || 0.03,
    );
    camera.far = 2000;
    camera.updateProjectionMatrix();
  }

  _configureControls() {
    const controls = window.orbitControls || window.controls;
    if (!controls) return;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = 1.0;
    controls.maxDistance = 25.0;
    controls.target.set(0, 0.9, 0);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update?.();
  }

  // =====================================================================
  // Shadows / focus
  // =====================================================================
  _getPlayerObject() {
    const candidates = [
      window.player?.model,
      window.player?.object,
      window.player,
      window.playerSystem?.player?.model,
      window.playerSystem?.player?.object,
      window.playerSystem?.model,
      window.playerModel,
      this.scene?.getObjectByName?.("Player"),
    ];
    return candidates.find((object) => object?.isObject3D) || null;
  }

  _isHelperMesh(object) {
    if (!object) return true;
    const name = String(object.name || "");
    const parentName = String(object.parent?.name || "");
    return (
      object.userData?.isGameplayDecoration === true ||
      object.userData?.noCastShadow === true ||
      /Helper|Gizmo|TransformControls|picker|axis|gridhelper/i.test(name) ||
      /Helper|Gizmo|TransformControls/i.test(parentName)
    );
  }

  _prepareShadowCasters() {
    this.course.prepareShadowCasters?.();

    const player = this._getPlayerObject();
    player?.traverse?.((object) => {
      if (!object?.isMesh) return;
      if (this._isHelperMesh(object)) {
        object.castShadow = false;
        return;
      }
      object.castShadow = true;
      object.receiveShadow = true;
      if (object.isSkinnedMesh) object.frustumCulled = false;
    });

    if (this.world?.floor) {
      this.world.floor.castShadow = false;
      this.world.floor.receiveShadow = true;
    }
  }

  _getShadowFocus() {
    const player = this._getPlayerObject();
    if (player) {
      player.getWorldPosition(this.shadowFocus);
      this.shadowFocus.y += this.CONFIG.shadowFocusHeight;
      return this.shadowFocus;
    }

    const controls = window.orbitControls || window.controls;
    if (controls?.target?.isVector3) {
      this.shadowFocus.copy(controls.target);
      this.shadowFocus.y = Math.max(
        this.CONFIG.shadowFocusHeight,
        this.shadowFocus.y,
      );
      return this.shadowFocus;
    }

    const camera = this.camera || window.camera;
    if (camera) {
      camera.getWorldDirection(this._scratchDirection);
      this.shadowFocus
        .copy(camera.position)
        .addScaledVector(this._scratchDirection, 6);
      this.shadowFocus.y = this.CONFIG.shadowFocusHeight;
      return this.shadowFocus;
    }

    return this.shadowFocus.set(0, this.CONFIG.shadowFocusHeight, 0);
  }

  _updateShadowFocus(force = false) {
    if (!this.sun || !this.sunTarget) return;

    const focus = this._getShadowFocus();
    const frustumWidth = this.CONFIG.shadowFrustum * 2;
    const mapSize = this._resolveShadowMapSize();
    const texelSize = frustumWidth / Math.max(1, mapSize);

    if (this.CONFIG.texelSnapping && texelSize > 0) {
      focus.x = Math.round(focus.x / texelSize) * texelSize;
      focus.z = Math.round(focus.z / texelSize) * texelSize;
    }

    if (
      !force &&
      this._lastShadowFocus.distanceToSquared(focus) <
        texelSize * texelSize * 0.04
    ) {
      return;
    }

    this._lastShadowFocus.copy(focus);
    this.sunTarget.position.copy(focus);
    this.sun.position
      .copy(focus)
      .addScaledVector(this.sunDirection, this.CONFIG.sunDistance);

    this.sunTarget.updateMatrixWorld(true);
    this.sun.updateMatrixWorld(true);
    this.sun.shadow.needsUpdate = true;
  }

  _syncSkyToSunAndCamera() {
    if (!this.skyDome) return;
    const camera = this.camera || window.camera;
    if (camera) this.skyDome.position.copy(camera.position);

    const uniforms = this.skyDome.material?.uniforms;
    if (uniforms?.sunDirection)
      uniforms.sunDirection.value.copy(this.sunDirection);
    if (uniforms?.sunColor)
      uniforms.sunColor.value.set(this.CONFIG.sunColor);
    if (uniforms?.topColor)
      uniforms.topColor.value.set(this.CONFIG.topSkyColor);
    if (uniforms?.horizonColor)
      uniforms.horizonColor.value.set(this.CONFIG.horizonFogColor);
    if (uniforms?.lowerColor)
      uniforms.lowerColor.value.set(this.CONFIG.lowerSkyColor);
  }

  // =====================================================================
  // Public API
  // =====================================================================
  setAtmospherePalette({
    floor,
    fog,
    horizon,
    skyTop,
    skyLower,
    background,
  } = {}) {
    if (floor) this.CONFIG.floorVisualColor = floor;
    if (fog) this.CONFIG.horizonFogColor = fog;
    if (horizon) this.CONFIG.horizonFogColor = horizon;
    if (skyTop) this.CONFIG.topSkyColor = skyTop;
    if (skyLower) this.CONFIG.lowerSkyColor = skyLower;
    if (background) this.CONFIG.sceneBackgroundColor = background;
    else if (fog || horizon)
      this.CONFIG.sceneBackgroundColor = this.CONFIG.horizonFogColor;

    this.backgroundColor.set(this.CONFIG.sceneBackgroundColor);
    this.fogColor.set(this.CONFIG.horizonFogColor);
    this._applyUE5Background();
    this._syncSkyToSunAndCamera();
    if (this.CONFIG.envMapEnabled) this._buildEnvironmentMap();

    return {
      floor: this.CONFIG.floorVisualColor,
      fog: this.CONFIG.horizonFogColor,
      background: this.CONFIG.sceneBackgroundColor,
      skyTop: this.CONFIG.topSkyColor,
      skyLower: this.CONFIG.lowerSkyColor,
      density: this.CONFIG.fogDensity,
    };
  }

  refreshShadows() {
    if (!this.sun) return false;
    this.sun.castShadow = true;
    this._configureSunShadow();
    this._prepareShadowCasters();
    this._updateShadowFocus(true);
    return true;
  }

  setSunAngles(
    elevationDeg = this.CONFIG.sunElevation,
    azimuthDeg = this.CONFIG.sunAzimuth,
  ) {
    this.CONFIG.sunElevation = Number(elevationDeg) || 0;
    this.CONFIG.sunAzimuth = Number(azimuthDeg) || 0;
    this._updateSunDirection();
    this._syncSkyToSunAndCamera();
    this._updateShadowFocus(true);
    if (this.CONFIG.envMapEnabled) this._buildEnvironmentMap();
    return this.sunDirection.clone();
  }

  getSunDirection() {
    return this.sunDirection.clone();
  }

  setExposure(value) {
    this.CONFIG.exposure = Math.max(0.1, Number(value) || 1.0);
    if (this.renderer) {
      this.renderer.toneMappingExposure = this.CONFIG.exposure;
    }
    return this.CONFIG.exposure;
  }

  // =====================================================================
  // Frame loop
  // =====================================================================
  _installFrameUpdate() {
    if (this._frameCallback) return true;

    const callback = () => this.update();
    const registry = window.engineFrameCallbacks;

    if (registry?.add && typeof registry.add === "function") {
      registry.add(callback);
      this._frameCallback = callback;
      this._frameRegistryType = "set";
      return true;
    }

    if (Array.isArray(registry)) {
      if (!registry.includes(callback)) registry.push(callback);
      this._frameCallback = callback;
      this._frameRegistryType = "array";
      return true;
    }

    return false;
  }

  _removeFrameUpdate() {
    if (!this._frameCallback) return;
    const registry = window.engineFrameCallbacks;
    if (this._frameRegistryType === "set") {
      registry?.delete?.(this._frameCallback);
    } else if (this._frameRegistryType === "array" && Array.isArray(registry)) {
      const index = registry.indexOf(this._frameCallback);
      if (index >= 0) registry.splice(index, 1);
    }
    this._frameCallback = null;
    this._frameRegistryType = null;
  }

  activate() {
    this.init();
    if (!this.world) return null;

    this.active = true;
    this._captureExternalState();
    this._installFrameUpdate();

    this._hideLegacyGameEnvironment();
    this._hideAllSkyObjects();
    this._muteForeignLights();

    this._applyUE5Background();
    this._configureCamera();
    this._configureControls();

    this.course.setVisible(true);
    this.lights.visible = true;
    this.lights.traverse((child) => {
      child.visible = true;
    });
    if (this.skyDome) this.skyDome.visible = true;

    this._prepareShadowCasters();
    this.refreshInteriorVisibility();
    this._configureSunShadow();
    this._updateShadowFocus(true);
    this._syncSkyToSunAndCamera();

    if (this.CONFIG.envMapEnabled) this._buildEnvironmentMap();
    if (this._postProcessingReady) this._resizePostProcessing();

    this.registerPhysics(window.physicsSystem);

    window.gameplaySampleWorld = this.world;
    window.ground = this.world.ground;
    window.obstaclesGroup = this.world.obstaclesGroup;
    window.collidableMeshes = this.world.collidableMeshes;
    window.traversalMeshes = this.world.traversalMeshes || [];

    window.dispatchEvent?.(
      new CustomEvent("sm-gameplay-sample-world-ready", {
        detail: { world: this.world },
      }),
    );

    return this.world;
  }

  update(delta = 0) {
    if (!this.active) return;

    this._interiorRefreshAccumulator += Number(delta) || 0;
    if (this._interiorRefreshAccumulator >= 1.0) {
      this._interiorRefreshAccumulator = 0;
      this.refreshInteriorVisibility();
    }

    const camera = this.camera || window.camera;
    if (this.skyDome && camera) {
      this.skyDome.position.copy(camera.position);
      this.skyDome.quaternion.identity();
      this.skyDome.updateMatrixWorld(true);
    }

    this._updateShadowFocus?.();

    const uniforms = this.skyDome?.material?.uniforms;
    if (uniforms?.sunDirection) {
      uniforms.sunDirection.value.copy(this.sunDirection);
    }
  }

  render(renderer, scene, camera) {
    if (this._postProcessingReady && this._composer && this.active) {
      this._composer.render();
      return true;
    }
    return false;
  }

  deactivate() {
    if (!this._initialized) return;
    this.active = false;
    this.course.setVisible(false);
    this.lights.visible = false;
    if (this.skyDome) this.skyDome.visible = false;
    this.disablePhysics(window.physicsSystem);
    this._restoreForeignLights();
    this._restoreHiddenObjects();
    this._restoreExternalState();
  }

  // =====================================================================
  // Physics
  // =====================================================================
  registerPhysics(physicsSystem) {
    if (!physicsSystem || !this.world) return false;

    for (const mesh of this.world.collidableMeshes || []) {
      if (!mesh?.isMesh || this._physicsRegistered.has(mesh.uuid)) continue;

      mesh.updateMatrixWorld(true);
      const options = {
        mass: 0,
        shapeType: mesh.userData?.physicsShape || "box",
        friction: mesh.userData?.friction ?? 0.8,
        restitution: mesh.userData?.restitution ?? 0.02,
      };

      try {
        physicsSystem.addBody(mesh, options);
        this._physicsRegistered.add(mesh.uuid);
      } catch (error) {
        console.warn(
          "[Gameplay Sample] Physics body registration failed:",
          mesh.name,
          error,
        );
      }
    }

    physicsSystem.toggleSimulation?.(true);
    return true;
  }

  disablePhysics(physicsSystem) {
    if (!physicsSystem || !this.world) return;
    for (const mesh of this.world.collidableMeshes || []) {
      if (!mesh?.isMesh || !this._physicsRegistered.has(mesh.uuid)) continue;
      try {
        physicsSystem.removeBody?.(mesh);
      } catch (e) {}
      this._physicsRegistered.delete(mesh.uuid);
    }
  }

  getWorld() {
    this.init();
    return this.world;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.deactivate();
    this._removeFrameUpdate();
    this.course.dispose();
    this._disposePostProcessing();
    this._disposeEnvironmentMap();

    if (this.skyDome) {
      this.skyDome.parent?.remove(this.skyDome);
      this.skyDome.geometry?.dispose?.();
      this.skyDome.material?.dispose?.();
      this.skyDome = null;
    }

    if (this.sun?.shadow?.map) {
      this.sun.shadow.map.dispose?.();
      this.sun.shadow.map = null;
    }

    this.lights.parent?.remove(this.lights);
    this.lights.clear?.();

    this.sun = null;
    this.sunTarget = null;
    this.skyLight = null;
    this.ambientLight = null;
    this.world = null;
  }
}

window.SMGameplaySampleEnvironment = SMGameplaySampleEnvironment;

window.createSMGameplaySampleEnvironment = function (
  scene = window.scene,
  renderer = window.renderer,
  camera = window.camera,
) {
  if (!scene || !renderer || typeof THREE === "undefined") {
    console.warn("[Gameplay Sample] Scene or renderer is missing.");
    return null;
  }

  if (window.gameplaySampleEnvironment) {
    return window.gameplaySampleEnvironment;
  }

  window.gameplaySampleEnvironment = new SMGameplaySampleEnvironment(
    scene,
    renderer,
    camera,
  );

  window.gameplaySampleEnvironment.init();

  window.updateGameplaySampleEnvironment = function (delta = 0) {
    window.gameplaySampleEnvironment?.update?.(delta);
  };

  window.refreshGameplaySampleInteriors = function () {
    return window.gameplaySampleEnvironment?.refreshInteriorVisibility?.() || 0;
  };

  window.setGameplaySampleAtmosphere = function (options = {}) {
    return (
      window.gameplaySampleEnvironment?.setAtmospherePalette?.(options) || null
    );
  };

  window.setGameplaySampleExposure = function (value) {
    return window.gameplaySampleEnvironment?.setExposure?.(value) || null;
  };

  return window.gameplaySampleEnvironment;
};