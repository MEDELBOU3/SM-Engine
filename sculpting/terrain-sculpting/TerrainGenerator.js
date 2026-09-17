// ============================================================================
// sculpting/terrain-sculpting/TerrainGenerator.js
// SM Engine — Next-Gen Photorealistic Rock, Scree & Soil Landscape System
// Features: Height-Blended PBR Triplanar Shading, Geological Strata, 
// Procedural Cavity AO, Alluvial Erosion & Seamless Central-Difference Normals.
// ============================================================================

(() => {
  const NS = window.TerrainSculpting;

  if (!NS?.TerrainData || !NS?.TerrainComponentManager || !NS?.utils) {
    throw new Error(
      "TerrainData + TerrainComponentManager + TerrainUtils must load before TerrainGenerator.js",
    );
  }

  const { getTerrainNoiseSource } = NS.utils;
  const TERRAIN_LIMIT_GROUP_NAME = "SM_TerrainLimits";

  // ---------------------------------------------------------------------------
  // 1. SM DEFAULT LANDSCAPE RESOLUTION
  // ---------------------------------------------------------------------------
  const DEFAULT_TERRAIN_RESOLUTION = Object.freeze({
    componentsX: 8,
    componentsZ: 8,
    sectionSize: 63,
    sectionsPerComponent: 1,
    quadSize: 1.8,
  });

  // ---------------------------------------------------------------------------
  // 2. CINEMATIC GEOLOGICAL PALETTES
  // ---------------------------------------------------------------------------
  const THEMES = {
    realistic: {
      // Basin & Valley Soil
      soilDark: "#2c221a",      // Wet organic deep soil / humus
      soilMid: "#4d3e31",       // Rich loam / fine natural sand
      soilLight: "#786551",     // Sun-dried topsoil / silt
      soilGravel: "#9e8c76",    // Riverbank fine grit / dust

      // Scree, Talus & Rock Formations
      rockBase: "#141211",      // Deep shadow bedrock / crevices
      rockDark: "#24201d",      // Weathered basalt / slate
      rockMid: "#3d3630",       // Fractured exposed granite
      rockLight: "#695d52",     // Sunlit rock crests
      rockStrata: "#8c7c6c",    // Sedimentary mineral bands / limestone

      roughness: 0.86,
      metalness: 0.02,
    },
    desert: {
      soilDark: "#4a2e18",
      soilMid: "#7a502c",
      soilLight: "#ad7d4f",
      soilGravel: "#cf9f6e",
      rockBase: "#24140d",
      rockDark: "#3d2518",
      rockMid: "#5e3c27",
      rockLight: "#8c5d3d",
      rockStrata: "#b88358",
      roughness: 0.82,
      metalness: 0.02,
    },
    volcanic: {
      soilDark: "#0d0c0b",
      soilMid: "#1a1816",
      soilLight: "#2e2b27",
      soilGravel: "#47433c",
      rockBase: "#050505",
      rockDark: "#100f0e",
      rockMid: "#1e1b19",
      rockLight: "#38332e",
      rockStrata: "#574e46",
      roughness: 0.85,
      metalness: 0.04,
    },
  };

  const _tmpWorld = new THREE.Vector3();
  const _tmpLocal = new THREE.Vector3();
  const _tmpParentLocal = new THREE.Vector3();

  // ---------------------------------------------------------------------------
  // 3. CINEMATIC PBR HEIGHT-BLENDED SHADER
  // ---------------------------------------------------------------------------
  function createRealisticRockSoilMaterial(settings) {
    const theme = THEMES[settings.theme] || THEMES.realistic;

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: theme.roughness,
      metalness: theme.metalness,
      dithering: true,
      flatShading: false,
    });

    material.name = `SM_Terrain_${settings.theme || "realistic"}_PBR`;
    material.userData = material.userData || {};
    material.userData.isTerrainMaterial = true;
    material.userData.isProceduralPBR = true;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uMaxHeight = {
        value: Math.max(1, Number(settings.edgeMountainAmplitude) || 48),
      };
      shader.uniforms.uBasinFloor = { value: 1.5 };

      shader.uniforms.uSoilDark = { value: new THREE.Color(theme.soilDark) };
      shader.uniforms.uSoilMid = { value: new THREE.Color(theme.soilMid) };
      shader.uniforms.uSoilLight = { value: new THREE.Color(theme.soilLight) };
      shader.uniforms.uSoilGravel = { value: new THREE.Color(theme.soilGravel) };

      shader.uniforms.uRockBase = { value: new THREE.Color(theme.rockBase) };
      shader.uniforms.uRockDark = { value: new THREE.Color(theme.rockDark) };
      shader.uniforms.uRockMid = { value: new THREE.Color(theme.rockMid) };
      shader.uniforms.uRockLight = { value: new THREE.Color(theme.rockLight) };
      shader.uniforms.uRockStrata = { value: new THREE.Color(theme.rockStrata) };

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
varying vec3 vSMTerrainWorldPosition;
varying vec3 vSMTerrainWorldNormal;`,
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
vSMTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSMTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>

uniform float uMaxHeight;
uniform float uBasinFloor;

uniform vec3 uSoilDark;
uniform vec3 uSoilMid;
uniform vec3 uSoilLight;
uniform vec3 uSoilGravel;

uniform vec3 uRockBase;
uniform vec3 uRockDark;
uniform vec3 uRockMid;
uniform vec3 uRockLight;
uniform vec3 uRockStrata;

varying vec3 vSMTerrainWorldPosition;
varying vec3 vSMTerrainWorldNormal;

// High-speed 2D/3D procedural noise & fBm
float smHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float smValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(smHash21(i), smHash21(i + vec2(1.0, 0.0)), f.x),
    mix(smHash21(i + vec2(0.0, 1.0)), smHash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float smFBM(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);

  for (int i = 0; i < 5; i++) {
    value += smValueNoise(p) * amplitude;
    p = rot * p * 2.05 + vec2(11.23, 7.89);
    amplitude *= 0.5;
  }
  return value;
}

float smRidged(vec2 p) {
  float n = smFBM(p);
  n = 1.0 - abs(n * 2.0 - 1.0);
  return n * n;
}

vec3 smTriWeights(vec3 n) {
  vec3 w = pow(abs(normalize(n)), vec3(5.0));
  return w / max(w.x + w.y + w.z, 0.0001);
}

float smTriFBM(vec3 p, vec3 n, float scale) {
  vec3 w = smTriWeights(n);
  return
    smFBM(p.zy * scale) * w.x +
    smFBM(p.xz * scale) * w.y +
    smFBM(p.xy * scale) * w.z;
}

float smTriRidged(vec3 p, vec3 n, float scale) {
  vec3 w = smTriWeights(n);
  return
    smRidged(p.zy * scale) * w.x +
    smRidged(p.xz * scale) * w.y +
    smRidged(p.xy * scale) * w.z;
}

// Height-Contrast Blending (UE5 Landscape Style: Prevents muddy transitions)
vec4 smHeightContrastBlend(vec4 weights, vec4 heights, float contrast) {
  vec4 h = heights + weights;
  float maxH = max(max(h.x, h.y), max(h.z, h.w)) - contrast;
  vec4 blended = max(h - vec4(maxH), vec4(0.0));
  return blended / max(dot(blended, vec4(1.0)), 0.0001);
}

// Procedural Cavity / Ambient Occlusion
float smComputeCavity(vec3 p, vec3 n) {
  float micro = smTriFBM(p, n, 0.35);
  float macro = smTriRidged(p, n, 0.08);
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  float crevice = smoothstep(0.40, 0.85, micro * macro * 1.4 + slope * 0.3);
  return mix(0.70, 1.04, crevice);
}

vec4 smRawMaterialWeights(vec3 p, vec3 n) {
  n = normalize(n);
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);

  float macro = smFBM(p.xz * 0.015);
  float breakup = (macro - 0.5) * 0.18;

  // Steep Cliff Face
  float cliff = smoothstep(0.38 + breakup, 0.64 + breakup, slope);

  // Weathered intermediate rock / scree
  float weatheredRock = smoothstep(0.18 + breakup, 0.45 + breakup, slope) * (1.0 - cliff * 0.65);

  float height01 = clamp(p.y / max(uMaxHeight, 1.0), 0.0, 1.0);
  weatheredRock += smoothstep(0.45, 0.90, height01) * smoothstep(0.08, 0.40, slope) * 0.45;
  weatheredRock = clamp(weatheredRock, 0.0, 1.0);

  // Talus / Scree gravel on medium slopes
  float gravelNoise = smTriRidged(p, n, 0.38);
  float gravel = smoothstep(0.55, 0.85, gravelNoise) * smoothstep(0.05, 0.32, slope) * (1.0 - cliff);

  // Basin & lowlands flat soil
  float soil = max(0.0, 1.0 - cliff - weatheredRock - gravel);

  return vec4(soil, gravel, weatheredRock, cliff);
}

vec3 smSoilColor(vec3 p) {
  float macro = smFBM(p.xz * 0.024);
  float medium = smFBM(p.xz * 0.11 + vec2(7.2, -4.8));
  float fine = smFBM(p.xz * 0.55);

  vec3 col = mix(uSoilDark, uSoilMid, smoothstep(0.18, 0.70, macro));
  col = mix(col, uSoilLight, smoothstep(0.55, 0.88, medium) * 0.55);
  col = mix(col, uSoilGravel, smoothstep(0.75, 0.95, fine) * 0.32);
  return col;
}

vec3 smGravelColor(vec3 p, vec3 n) {
  float coarse = smTriFBM(p, n, 0.22);
  float stones = smTriRidged(p + vec3(14.0, 5.0, -18.0), n, 0.75);

  vec3 col = mix(uSoilMid, uSoilGravel, smoothstep(0.25, 0.78, coarse));
  return mix(col, uRockMid, smoothstep(0.65, 0.92, stones) * 0.45);
}

vec3 smRockColor(vec3 p, vec3 n, float cliffWeight) {
  float macro = smTriFBM(p, n, 0.032);
  float fracture = smTriRidged(p + vec3(35.0, -14.0, 19.0), n, 0.18);
  float grain = smTriFBM(p + vec3(-8.0, 24.0, 9.0), n, 0.60);

  // Sedimentary Geological Strata
  float strataWarp = smFBM(p.xz * 0.028) * 4.5;
  float strataWave = sin((p.y + strataWarp) * 0.52) * 0.5 + 0.5;
  float strata = smoothstep(0.70, 0.94, strataWave);

  vec3 col = mix(uRockDark, uRockMid, smoothstep(0.15, 0.70, macro));
  col = mix(col, uRockLight, smoothstep(0.60, 0.94, fracture) * 0.50);
  col = mix(col, uRockStrata, strata * (0.12 + cliffWeight * 0.28));
  col *= mix(0.92, 1.08, grain);

  return col;
}

float smSoilHeight(vec3 p) {
  return smFBM(p.xz * 0.12) * 0.65 + smFBM(p.xz * 0.70 + vec2(13.0, 27.0)) * 0.35;
}

float smRockHeight(vec3 p, vec3 n) {
  return smTriRidged(p, n, 0.24) * 0.72 + smTriFBM(p + vec3(9.0, -8.0, 21.0), n, 0.85) * 0.28;
}

vec3 smPerturbNormal(vec3 surfPos, vec3 surfNormal, float heightValue, float strength) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);

  float dhdx = dFdx(heightValue);
  float dhdy = dFdy(heightValue);

  vec3 r1 = cross(sigmaY, surfNormal);
  vec3 r2 = cross(surfNormal, sigmaX);
  float det = dot(sigmaX, r1);

  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * surfNormal - strength * grad);
}`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>

vec4 smRawW = smRawMaterialWeights(vSMTerrainWorldPosition, vSMTerrainWorldNormal);
vec4 smHeights = vec4(
  smSoilHeight(vSMTerrainWorldPosition),
  smSoilHeight(vSMTerrainWorldPosition + 12.0),
  smRockHeight(vSMTerrainWorldPosition, vSMTerrainWorldNormal) * 0.85,
  smRockHeight(vSMTerrainWorldPosition, vSMTerrainWorldNormal)
);

vec4 smNW = smHeightContrastBlend(smRawW, smHeights, 0.25);
float smRockW = clamp(smNW.z + smNW.w, 0.0, 1.0);

float smHeight = mix(
  smSoilHeight(vSMTerrainWorldPosition),
  smRockHeight(vSMTerrainWorldPosition, vSMTerrainWorldNormal),
  smRockW
);

normal = smPerturbNormal(
  -vViewPosition,
  normal,
  smHeight,
  mix(0.18, 0.58, smRockW)
);`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>

vec4 smRawW_c = smRawMaterialWeights(vSMTerrainWorldPosition, vSMTerrainWorldNormal);
vec4 smHeights_c = vec4(
  smSoilHeight(vSMTerrainWorldPosition),
  smSoilHeight(vSMTerrainWorldPosition + 12.0),
  smRockHeight(vSMTerrainWorldPosition, vSMTerrainWorldNormal) * 0.85,
  smRockHeight(vSMTerrainWorldPosition, vSMTerrainWorldNormal)
);

vec4 smW = smHeightContrastBlend(smRawW_c, smHeights_c, 0.28);

vec3 smSoil = smSoilColor(vSMTerrainWorldPosition);
vec3 smGravel = smGravelColor(vSMTerrainWorldPosition, vSMTerrainWorldNormal);
vec3 smWeatheredRock = smRockColor(vSMTerrainWorldPosition, vSMTerrainWorldNormal, 0.35);
vec3 smCliffRock = smRockColor(vSMTerrainWorldPosition, vSMTerrainWorldNormal, 1.0);

float smHeight01 = clamp(vSMTerrainWorldPosition.y / max(uMaxHeight, 1.0), 0.0, 1.0);
smCliffRock = mix(smCliffRock * 0.88, smCliffRock * 1.10, smHeight01);

vec3 smSurface =
  smSoil * smW.x +
  smGravel * smW.y +
  smWeatheredRock * smW.z +
  smCliffRock * smW.w;

// Apply Cavity & Crevice Ambient Occlusion
float smCavity = smComputeCavity(vSMTerrainWorldPosition, vSMTerrainWorldNormal);
smSurface *= smCavity;

// Basin Floor subtle dampness
float smBasinMask = (1.0 - smoothstep(uBasinFloor, uBasinFloor + 6.0, vSMTerrainWorldPosition.y)) * smW.x;
float smMoisture = smFBM(vSMTerrainWorldPosition.xz * 0.022 + vec2(4.0, 15.0));
smSurface = mix(smSurface, smSurface * mix(0.80, 0.94, smMoisture), smBasinMask * 0.32);

diffuseColor.rgb *= smSurface;`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>

vec4 smRW = smRawMaterialWeights(vSMTerrainWorldPosition, vSMTerrainWorldNormal);
float smRNoise = smFBM(vSMTerrainWorldPosition.xz * 0.22);

float smSoilRough = mix(0.84, 0.95, smRNoise);
float smGravelRough = mix(0.74, 0.90, smRNoise);
float smWeatheredRockRough = mix(0.66, 0.82, smRNoise);
float smCliffRockRough = mix(0.55, 0.74, smRNoise);

roughnessFactor = clamp(
  smSoilRough * smRW.x +
  smGravelRough * smRW.y +
  smWeatheredRockRough * smRW.z +
  smCliffRockRough * smRW.w,
  0.46,
  0.98
);`,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
metalnessFactor = clamp(metalnessFactor, 0.0, 0.05);`,
      );

      material.userData.shader = shader;
    };

    material.customProgramCacheKey = () =>
      `SMTerrainPBR_v5_${settings.theme || "realistic"}`;

    material.needsUpdate = true;
    return material;
  }

  // ---------------------------------------------------------------------------
  // 4. SYMMETRIC CENTRAL-DIFFERENCE NORMALS (ZERO SEAMS)
  // ---------------------------------------------------------------------------
  function computeAnalyticalNormals(landscape) {
    if (!landscape) return;
    const data = landscape.userData?.terrainData;
    if (!data?.heights) return;

    landscape.traverse((child) => {
      if (!child?.isMesh || !child.geometry) return;
      const geom = child.geometry;
      const posAttr = geom.getAttribute("position");
      const normAttr = geom.getAttribute("normal");
      if (!posAttr || !normAttr) return;

      const halfW = data.width * 0.5;
      const halfL = data.length * 0.5;

      for (let i = 0; i < posAttr.count; i++) {
        const lx = posAttr.getX(i);
        const lz = posAttr.getZ(i);

        const gx = ((lx + halfW) / data.width) * (data.resolutionX - 1);
        const gz = ((lz + halfL) / data.length) * (data.resolutionZ - 1);

        const x = Math.max(0, Math.min(data.resolutionX - 1, Math.round(gx)));
        const z = Math.max(0, Math.min(data.resolutionZ - 1, Math.round(gz)));

        const xm1 = Math.max(0, x - 1);
        const xp1 = Math.min(data.resolutionX - 1, x + 1);
        const zm1 = Math.max(0, z - 1);
        const zp1 = Math.min(data.resolutionZ - 1, z + 1);

        const deltaX = Math.max(0.0001, (xp1 - xm1) * data.quadSize);
        const deltaZ = Math.max(0.0001, (zp1 - zm1) * data.quadSize);

        const dhdx = (data.heights[data.index(xp1, z)] - data.heights[data.index(xm1, z)]) / deltaX;
        const dhdz = (data.heights[data.index(x, zp1)] - data.heights[data.index(x, zm1)]) / deltaZ;

        _tmpLocal.set(-dhdx, 1.0, -dhdz).normalize();
        normAttr.setXYZ(i, _tmpLocal.x, _tmpLocal.y, _tmpLocal.z);
      }

      normAttr.needsUpdate = true;
      geom.computeBoundingSphere();
    });
  }

  function enhanceTerrainRenderQuality(landscape) {
    if (!landscape) return;

    landscape.traverse((child) => {
      if (!child?.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        mat.flatShading = false;
        mat.dithering = true;
        mat.needsUpdate = true;
      });
    });

    computeAnalyticalNormals(landscape);
  }

  // ---------------------------------------------------------------------------
  // 5. NOISE & FRACTAL MATH
  // ---------------------------------------------------------------------------
  function terrainHash2D(ix, iz, seed = 1337, salt = 0) {
    let h =
      Math.imul(ix | 0, 374761393) ^
      Math.imul(iz | 0, 668265263) ^
      Math.imul(seed | 0, 1442695041) ^
      Math.imul(salt | 0, 1597334677);

    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function terrainFade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function coherentValueNoise2D(x, z, seed = 1337, salt = 0) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const tx = x - x0;
    const tz = z - z0;

    const sx = terrainFade(tx);
    const sz = terrainFade(tz);

    const n00 = terrainHash2D(x0, z0, seed, salt) * 2 - 1;
    const n10 = terrainHash2D(x1, z0, seed, salt) * 2 - 1;
    const n01 = terrainHash2D(x0, z1, seed, salt) * 2 - 1;
    const n11 = terrainHash2D(x1, z1, seed, salt) * 2 - 1;

    const nx0 = THREE.MathUtils.lerp(n00, n10, sx);
    const nx1 = THREE.MathUtils.lerp(n01, n11, sx);

    return THREE.MathUtils.lerp(nx0, nx1, sz);
  }

  function sampleFractalNoise(noise, x, z, settings, frequencyMultiplier = 1) {
    let total = 0;
    let amplitude = 1;
    let maxAmplitude = 0;
    let frequency = settings.noiseFrequency * frequencyMultiplier;
    const seed = settings.noiseSeed || 1337;
    const octaves = Math.max(1, Math.min(8, Math.floor(settings.noiseOctaves || 5)));
    const persistence = THREE.MathUtils.clamp(Number(settings.noisePersistence ?? 0.48), 0.05, 0.85);

    for (let octave = 0; octave < octaves; octave++) {
      total += coherentValueNoise2D(x * frequency, z * frequency, seed, octave * 97 + 17) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return maxAmplitude > 0 ? total / maxAmplitude : 0;
  }

  function sampleRidgedMultifractal(x, z, frequency, octaves = 5, seed = 1337, salt = 310) {
    let signal = 0;
    let value = 0;
    let weight = 1.0;
    let freq = frequency;
    let amp = 1.0;
    let maxAmp = 0;

    for (let i = 0; i < octaves; i++) {
      signal = coherentValueNoise2D(x * freq, z * freq, seed, salt + i * 23);
      signal = 1.0 - Math.abs(signal);
      signal *= signal;
      signal *= weight;

      weight = THREE.MathUtils.clamp(signal * 2.2, 0.0, 1.0);
      value += signal * amp;
      maxAmp += amp;

      amp *= 0.52;
      freq *= 2.06;
    }
    return value / maxAmp;
  }

  function sampleBillowNoise(x, z, frequency, octaves = 4, seed = 1337, salt = 420) {
    let total = 0;
    let amp = 1;
    let maxAmp = 0;
    let freq = frequency;

    for (let i = 0; i < octaves; i++) {
      let n = Math.abs(coherentValueNoise2D(x * freq, z * freq, seed, salt + i * 19));
      total += (2.0 * n - 1.0) * amp;
      maxAmp += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return (total / maxAmp) * 0.5 + 0.5;
  }

  function sampleFluvialGully(x, z, frequency, seed = 1337) {
    const n1 = coherentValueNoise2D(x * frequency, z * frequency, seed, 512);
    const n2 = coherentValueNoise2D(x * frequency * 2.3 + 80, z * frequency * 2.3 - 80, seed, 513);
    const flow = Math.abs(n1 * 0.65 + n2 * 0.35);
    return Math.pow(1.0 - flow, 4.0);
  }

  function applyRockTerraces(height, stepHeight = 5.8, terraceStrength = 0.22) {
    if (height <= 0.5) return height;
    const phase = (height / stepHeight) * Math.PI * 2;
    const terrace = (Math.sin(phase) - Math.sin(phase * 3) / 9) * (stepHeight * 0.15);
    return height + terrace * terraceStrength;
  }

  function seededNoise2D(noise, x, z, settings, frequencyMultiplier, salt = 0) {
    const seed = settings.noiseSeed || 1337;
    const frequency = settings.noiseFrequency * frequencyMultiplier;
    return coherentValueNoise2D(x * frequency, z * frequency, seed, salt);
  }

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(value) {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  }

  // ---------------------------------------------------------------------------
  // 6. GEOLOGICAL ALLUVIAL EROSION & TALUS FILTERS
  // ---------------------------------------------------------------------------
  function simulateDropletErosion(data, iterations = 32000) {
    if (!data?.heights?.length) return;
    const heights = data.heights;
    const resX = data.resolutionX;
    const resZ = data.resolutionZ;

    const inertia = 0.08;
    const sedimentCapacityFactor = 3.6;
    const minSedimentCapacity = 0.01;
    const erodeSpeed = 0.30;
    const depositSpeed = 0.30;
    const evaporateSpeed = 0.014;
    const gravity = 9.8;
    const maxLifetime = 36;

    for (let iter = 0; iter < iterations; iter++) {
      let x = Math.random() * (resX - 3) + 1;
      let z = Math.random() * (resZ - 3) + 1;
      let dirX = 0, dirZ = 0;
      let speed = 1.0;
      let water = 1.0;
      let sediment = 0.0;

      for (let lifetime = 0; lifetime < maxLifetime; lifetime++) {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        const u = x - ix;
        const v = z - iz;

        const idx00 = data.index(ix, iz);
        const idx10 = data.index(ix + 1, iz);
        const idx01 = data.index(ix, iz + 1);
        const idx11 = data.index(ix + 1, iz + 1);

        const gradX = (heights[idx10] - heights[idx00]) * (1 - v) + (heights[idx11] - heights[idx01]) * v;
        const gradZ = (heights[idx01] - heights[idx00]) * (1 - u) + (heights[idx11] - heights[idx10]) * u;
        const hCurrent = heights[idx00] * (1 - u) * (1 - v) + heights[idx10] * u * (1 - v) + heights[idx01] * (1 - u) * v + heights[idx11] * u * v;

        dirX = dirX * inertia - gradX * (1 - inertia);
        dirZ = dirZ * inertia - gradZ * (1 - inertia);
        const len = Math.hypot(dirX, dirZ);
        if (len === 0) break;
        dirX /= len;
        dirZ /= len;

        const nextX = x + dirX;
        const nextZ = z + dirZ;
        if (nextX < 1 || nextX >= resX - 2 || nextZ < 1 || nextZ >= resZ - 2) break;

        const nix = Math.floor(nextX);
        const niz = Math.floor(nextZ);
        const nu = nextX - nix;
        const nv = nextZ - niz;

        const hNext = heights[data.index(nix, niz)] * (1 - nu) * (1 - nv) +
                      heights[data.index(nix + 1, niz)] * nu * (1 - nv) +
                      heights[data.index(nix, niz + 1)] * (1 - nu) * nv +
                      heights[data.index(nix + 1, niz + 1)] * nu * nv;

        const deltaH = hNext - hCurrent;
        const capacity = Math.max(-deltaH * speed * water * sedimentCapacityFactor, minSedimentCapacity);

        if (sediment > capacity || deltaH > 0) {
          const toDeposit = (deltaH > 0) ? Math.min(deltaH, sediment) : (sediment - capacity) * depositSpeed;
          sediment -= toDeposit;
          heights[idx00] += toDeposit * (1 - u) * (1 - v);
          heights[idx10] += toDeposit * u * (1 - v);
          heights[idx01] += toDeposit * (1 - u) * v;
          heights[idx11] += toDeposit * u * v;
        } else {
          const toErode = Math.min((capacity - sediment) * erodeSpeed, -deltaH);
          sediment += toErode;
          heights[idx00] -= toErode * (1 - u) * (1 - v);
          heights[idx10] -= toErode * u * (1 - v);
          heights[idx01] -= toErode * (1 - u) * v;
          heights[idx11] -= toErode * u * v;
        }

        speed = Math.sqrt(Math.max(0, speed * speed + deltaH * gravity));
        water *= (1 - evaporateSpeed);
        x = nextX;
        z = nextZ;
      }
    }
    data.version++;
  }

  function simulateThermalTalus(data, iterations = 3, talusSlope = 0.88) {
    if (!data?.heights?.length) return;
    const source = data.heights;
    const next = new Float32Array(source.length);
    const maxDelta = data.quadSize * talusSlope;

    const sample = (x, z) => {
      const sx = Math.max(0, Math.min(data.resolutionX - 1, x));
      const sz = Math.max(0, Math.min(data.resolutionZ - 1, z));
      return source[data.index(sx, sz)];
    };

    for (let iter = 0; iter < iterations; iter++) {
      next.set(source);
      for (let gz = 0; gz < data.resolutionZ; gz++) {
        for (let gx = 0; gx < data.resolutionX; gx++) {
          const idx = data.index(gx, gz);
          const current = source[idx];

          let diffSum = 0;
          let count = 0;

          const neighbors = [
            sample(gx - 1, gz),
            sample(gx + 1, gz),
            sample(gx, gz - 1),
            sample(gx, gz + 1),
          ];

          for (let i = 0; i < 4; i++) {
            const diff = current - neighbors[i];
            if (diff > maxDelta) {
              diffSum += (diff - maxDelta);
              count++;
            }
          }

          if (count > 0) {
            next[idx] -= (diffSum / count) * 0.38;
          }
        }
      }
      source.set(next);
    }
  }

  function relaxTerrainSlopes(data, options = {}) {
    if (!data?.heights?.length) return;
    const iterations = Math.max(1, Math.floor(Number(options.iterations) || 4));
    const maxSlope = Math.max(0.25, Number(options.maxSlope) || 1.18);
    const maxDelta = Math.max(0.05, data.quadSize * maxSlope);
    const source = data.heights;
    const next = new Float32Array(source.length);

    const sample = (x, z) => {
      const sx = Math.max(0, Math.min(data.resolutionX - 1, x));
      const sz = Math.max(0, Math.min(data.resolutionZ - 1, z));
      return source[data.index(sx, sz)];
    };

    for (let iteration = 0; iteration < iterations; iteration++) {
      next.set(source);
      for (let gz = 0; gz < data.resolutionZ; gz++) {
        for (let gx = 0; gx < data.resolutionX; gx++) {
          const idx = data.index(gx, gz);
          let h = source[idx];

          const neighbours = [
            sample(gx - 1, gz),
            sample(gx + 1, gz),
            sample(gx, gz - 1),
            sample(gx, gz + 1),
          ];

          let minAllowed = -Infinity;
          let maxAllowed = Infinity;

          for (const neighbour of neighbours) {
            minAllowed = Math.max(minAllowed, neighbour - maxDelta);
            maxAllowed = Math.min(maxAllowed, neighbour + maxDelta);
          }

          h = THREE.MathUtils.clamp(h, minAllowed, maxAllowed);
          next[idx] = h;
        }
      }
      source.set(next);
    }
    data.version++;
  }

  function smoothTerrainHeights(data, settings, options = {}) {
    if (!data?.heights?.length) return;
    const iterations = Math.max(1, Math.floor(Number(options.iterations) || 2));
    const blend = THREE.MathUtils.clamp(Number(options.blend) || 0.40, 0.05, 0.95);
    const halfWidth = Math.max(data.width * 0.5, 0.0001);
    const halfLength = Math.max(data.length * 0.5, 0.0001);
    const preserveFlatRadius = Math.max(0.12, Math.min(0.58, Number(options.preserveFlatRadius ?? Math.min(0.34, settings.flatCenterRatio * 0.70)) || 0.26));
    const source = data.heights;
    const next = new Float32Array(source.length);

    const sample = (x, z) => {
      const sx = Math.max(0, Math.min(data.resolutionX - 1, x));
      const sz = Math.max(0, Math.min(data.resolutionZ - 1, z));
      return source[data.index(sx, sz)];
    };

    for (let iteration = 0; iteration < iterations; iteration++) {
      next.set(source);
      for (let gz = 0; gz < data.resolutionZ; gz++) {
        const nz = data.localZ(gz) / halfLength;
        for (let gx = 0; gx < data.resolutionX; gx++) {
          const nx = data.localX(gx) / halfWidth;
          const distance = Math.hypot(nx * 0.98, nz * 1.02);
          const idx = data.index(gx, gz);
          const current = source[idx];

          const average = (
            sample(gx, gz) * 4 +
            sample(gx - 1, gz) * 2 +
            sample(gx + 1, gz) * 2 +
            sample(gx, gz - 1) * 2 +
            sample(gx, gz + 1) * 2 +
            sample(gx - 1, gz - 1) +
            sample(gx + 1, gz - 1) +
            sample(gx - 1, gz + 1) +
            sample(gx + 1, gz + 1)
          ) / 16;

          let mask = smoothstep(clamp((distance - preserveFlatRadius) / Math.max(0.0001, 1 - preserveFlatRadius)));
          if (distance < preserveFlatRadius * 0.92) {
            mask *= 0.12;
          } else {
            mask = 0.22 + mask * 0.78;
          }

          next[idx] = current + (average - current) * (blend * mask);
        }
      }
      source.set(next);
    }
    data.version++;
  }

  function enforceFlatTerrainCenter(data, settings, options = {}) {
    const halfWidth = Math.max(data.width * 0.5, 0.0001);
    const halfLength = Math.max(data.length * 0.5, 0.0001);
    const hardRadius = THREE.MathUtils.clamp(Number(options.hardRadius ?? Math.max(0.35, settings.flatCenterRatio * 0.85)) || 0.40, 0.25, 0.55);
    const transitionWidth = THREE.MathUtils.clamp(Number(options.transitionWidth ?? 0.18) || 0.18, 0.06, 0.30);
    const transitionEnd = hardRadius + transitionWidth;

    for (let gz = 0; gz < data.resolutionZ; gz++) {
      const nz = data.localZ(gz) / halfLength;
      for (let gx = 0; gx < data.resolutionX; gx++) {
        const nx = data.localX(gx) / halfWidth;
        const distance = Math.hypot(nx * 0.98, nz * 1.02);
        const idx = data.index(gx, gz);

        if (distance <= hardRadius) {
          data.heights[idx] = 0;
          continue;
        }

        if (distance < transitionEnd) {
          const t = smoothstep(clamp((distance - hardRadius) / Math.max(0.0001, transitionWidth)));
          data.heights[idx] *= (t * t);
        }
      }
    }
    data.version++;
  }

  // ---------------------------------------------------------------------------
  // 7. CRATER & ROCKY ALPINE MOUNTAIN SYNTHESIS
  // ---------------------------------------------------------------------------
  function generateEdgeMountainHeight(data, settings) {
    const noise = getTerrainNoiseSource();
    const halfWidth = Math.max(data.width * 0.5, 0.0001);
    const halfLength = Math.max(data.length * 0.5, 0.0001);

    const seed = settings.noiseSeed || 1337;
    const baseAmp = settings.edgeMountainAmplitude || 48;

    const rimRadius = THREE.MathUtils.clamp(settings.flatCenterRatio * 0.95 + 0.12, 0.45, 0.65);
    const basinFloorRadius = THREE.MathUtils.clamp(settings.flatCenterRatio * 0.72, 0.28, 0.42);

    for (let gz = 0; gz < data.resolutionZ; gz++) {
      const z = data.localZ(gz);
      for (let gx = 0; gx < data.resolutionX; gx++) {
        const x = data.localX(gx);
        const idx = data.index(gx, gz);

        // Tectonic Curl Domain Warping
        const warp1X = seededNoise2D(noise, x, z, settings, 0.08, 101) * 32.0;
        const warp1Z = seededNoise2D(noise, x, z, settings, 0.08, 102) * 32.0;
        const warp2X = seededNoise2D(noise, x + warp1X, z + warp1Z, settings, 0.24, 103) * 14.0;
        const warp2Z = seededNoise2D(noise, x + warp1X, z + warp1Z, settings, 0.24, 104) * 14.0;

        const wx = x + warp1X + warp2X;
        const wz = z + warp1Z + warp2Z;
        const dist = Math.hypot((wx / halfWidth) * 0.98, (wz / halfLength) * 1.02);

        // Analytical Crater Rim Profile
        let rimProfile = 0;
        if (dist < rimRadius) {
          const tIn = clamp((dist - basinFloorRadius) / Math.max(0.001, rimRadius - basinFloorRadius));
          rimProfile = Math.pow(smoothstep(tIn), 2.3);
        } else {
          const tOut = clamp((dist - rimRadius) / Math.max(0.001, 1.25 - rimRadius));
          rimProfile = Math.pow(1.0 - smoothstep(tOut), 1.55);
        }

        // Multi-Layer Mountain Synthesis:
        const primaryRidge = sampleRidgedMultifractal(wx, wz, settings.noiseFrequency * 0.70, 5, seed, 301);
        const secondaryRidge = sampleRidgedMultifractal(wx + 420, wz - 310, settings.noiseFrequency * 1.45, 5, seed, 302);
        const mountainCrests = (primaryRidge * 0.68 + secondaryRidge * 0.32);

        const outerMountainMask = smoothstep(clamp((dist - rimRadius * 0.85) / 0.40));
        const outerPeaks = sampleRidgedMultifractal(wx * 0.85 - 500, wz * 0.85 + 500, settings.noiseFrequency * 0.50, 5, seed, 305);
        const mountainShoulders = sampleBillowNoise(wx, wz, settings.noiseFrequency * 0.35, 4, seed, 401);
        const gullyFlow = sampleFluvialGully(wx, wz, settings.noiseFrequency * 2.05, seed);

        const angle = Math.atan2(wz, wx);
        const spurFreq = 6.0;
        const spurMod = Math.pow(Math.cos(angle * spurFreq + seededNoise2D(noise, wx, wz, settings, 0.15, 601) * 3.0) * 0.5 + 0.5, 2.0);

        let h = (rimProfile * 0.70 + mountainCrests * 0.50 * rimProfile + mountainShoulders * 0.25 * rimProfile) * baseAmp;
        h += outerPeaks * (baseAmp * 0.65) * outerMountainMask;
        h += spurMod * (baseAmp * 0.22) * rimProfile;

        if (dist > basinFloorRadius) {
          const erosionIntensity = Math.min(1.0, rimProfile * 1.5 + outerMountainMask * 0.8);
          h -= gullyFlow * (baseAmp * 0.16) * erosionIntensity;
        }

        h = applyRockTerraces(h, 6.2, 0.20);

        const peakCeiling = baseAmp * 1.65;
        h = peakCeiling * Math.tanh(h / Math.max(peakCeiling, 0.001));

        if (dist <= basinFloorRadius) {
          h = 0;
        } else {
          const blendIn = smoothstep(clamp((dist - basinFloorRadius) / 0.14));
          h *= blendIn;
        }

        data.heights[idx] = h;
      }
    }

    // Run Particle Hydraulic & Geological Weathering
    simulateDropletErosion(data, 32000);
    simulateThermalTalus(data, 3, 0.90);
    relaxTerrainSlopes(data, { iterations: 4, maxSlope: 1.20 });
    smoothTerrainHeights(data, settings, { iterations: 3, blend: 0.38, preserveFlatRadius: basinFloorRadius });
    enforceFlatTerrainCenter(data, settings, { hardRadius: basinFloorRadius, transitionWidth: 0.16 });

    data.version++;

    return {
      version: 9,
      profile: "ue5-photoreal-rock-soil-crater-v2",
      flatCenterRatio: settings.flatCenterRatio,
      baseHeight: settings.edgeMountainAmplitude,
    };
  }

  function generateInitialHeight(data, settings) {
    if (settings.initialMode === "edgemountains") {
      return generateEdgeMountainHeight(data, settings);
    }

    if (settings.initialMode !== "noise") {
      data.fill(0);
      return null;
    }

    const noise = getTerrainNoiseSource();
    for (let gz = 0; gz < data.resolutionZ; gz++) {
      for (let gx = 0; gx < data.resolutionX; gx++) {
        const x = data.localX(gx);
        const z = data.localZ(gz);
        const height = sampleFractalNoise(noise, x, z, settings) * settings.noiseAmplitude;
        data.heights[data.index(gx, gz)] = height;
      }
    }
    data.version++;
    return null;
  }

  // ---------------------------------------------------------------------------
  // 8. BIOME & SCATTER QUERY API
  // ---------------------------------------------------------------------------
  function attachTerrainQueryAPI(landscape, data) {
    if (!landscape || !data) return;

    landscape.userData.queryTerrain = function (worldX, worldZ) {
      _tmpWorld.set(worldX, 0, worldZ);
      landscape.worldToLocal(_tmpLocal);

      const halfW = data.width * 0.5;
      const halfL = data.length * 0.5;

      const gx = ((_tmpLocal.x + halfW) / data.width) * (data.resolutionX - 1);
      const gz = ((_tmpLocal.z + halfL) / data.length) * (data.resolutionZ - 1);

      if (gx < 0 || gx >= data.resolutionX - 1 || gz < 0 || gz >= data.resolutionZ - 1) {
        return null;
      }

      const x0 = Math.floor(gx);
      const z0 = Math.floor(gz);
      const u = gx - x0;
      const v = gz - z0;

      const h00 = data.heights[data.index(x0, z0)];
      const h10 = data.heights[data.index(x0 + 1, z0)];
      const h01 = data.heights[data.index(x0, z0 + 1)];
      const h11 = data.heights[data.index(x0 + 1, z0 + 1)];

      const localHeight = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
      const worldHeight = landscape.position.y + localHeight * (landscape.scale?.y || 1);

      const dhdx = (h10 - h00) / Math.max(0.001, data.quadSize);
      const dhdz = (h01 - h00) / Math.max(0.001, data.quadSize);
      _tmpLocal.set(-dhdx, 1.0, -dhdz).normalize();

      const slopeAngleDeg = Math.acos(clamp(_tmpLocal.y)) * (180 / Math.PI);
      const isBasin = localHeight <= 0.15;
      const isCliff = slopeAngleDeg > 32;

      let biome = "soil";
      if (isBasin) biome = "basin_soil";
      else if (isCliff) biome = "rock_cliff";

      return {
        localHeight,
        worldHeight,
        slopeAngleDeg,
        normal: _tmpLocal.clone(),
        biome,
        isBasin,
        canSpawnFoliage: !isCliff && slopeAngleDeg < 22,
        canSpawnRock: isCliff || slopeAngleDeg > 25,
        canSpawnPlayer: isBasin || slopeAngleDeg < 15,
      };
    };
  }

  // ---------------------------------------------------------------------------
  // 9. BOUNDS & COLLISION LIMITS
  // ---------------------------------------------------------------------------
  function getTerrainLocalBounds(landscape = NS.getLandscape?.() || window.terrain) {
    if (!landscape) return null;
    const data = landscape.userData?.terrainData || NS.state?.activeLandscape?.userData?.terrainData || null;
    if (!data) return null;

    const minX = Math.min(data.localX(0), data.localX(data.resolutionX - 1));
    const maxX = Math.max(data.localX(0), data.localX(data.resolutionX - 1));
    const minZ = Math.min(data.localZ(0), data.localZ(data.resolutionZ - 1));
    const maxZ = Math.max(data.localZ(0), data.localZ(data.resolutionZ - 1));

    return {
      minX,
      maxX,
      minZ,
      maxZ,
      width: maxX - minX,
      depth: maxZ - minZ,
      centerX: (minX + maxX) * 0.5,
      centerZ: (minZ + maxZ) * 0.5,
    };
  }

  function getTerrainHeightRange(data) {
    if (!data?.heights?.length) return { minY: -1, maxY: 1 };
    let minHeight = Infinity;
    let maxHeight = -Infinity;

    for (let i = 0; i < data.heights.length; i++) {
      const h = Number(data.heights[i]) || 0;
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
    const scale = Number(data.heightScale) || 1;
    return { minY: minHeight * scale, maxY: maxHeight * scale };
  }

  function disposeTerrainLimits(landscape = NS.getLandscape?.() || window.terrain) {
    if (!landscape) return false;
    const group = landscape.userData?.terrainLimitGroup || landscape.getObjectByName?.(TERRAIN_LIMIT_GROUP_NAME) || null;
    if (!group) return false;

    window.SMPlayerCollisionRegistry?.unregisterObject?.(group);
    group.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat?.dispose?.());
      } else {
        object.material?.dispose?.();
      }
    });

    group.parent?.remove?.(group);
    if (landscape.userData) {
      delete landscape.userData.terrainLimitGroup;
      delete landscape.userData.terrainBoundsLocal;
    }
    window.playerSystem?.playerPhysics?.refreshWorld?.(true);
    return true;
  }

  function createTerrainLimits(landscape = NS.getLandscape?.() || window.terrain, options = {}) {
    if (!landscape) return null;
    const data = landscape.userData?.terrainData || null;
    if (!data) return null;

    disposeTerrainLimits(landscape);
    const bounds = getTerrainLocalBounds(landscape);
    if (!bounds) return null;

    const settings = landscape.userData?.settings || {};
    const thickness = Math.max(0.05, Number(options.thickness ?? settings.terrainLimitThickness ?? Math.max(data.quadSize * 0.75, 0.5)) || 0.5);
    const verticalPadding = Math.max(10, Number(options.verticalPadding ?? settings.terrainLimitVerticalPadding ?? 2048) || 2048);
    const heightRange = getTerrainHeightRange(data);

    const wallBottom = heightRange.minY - verticalPadding;
    const wallTop = heightRange.maxY + verticalPadding;
    const wallHeight = Math.max(20, wallTop - wallBottom);
    const wallCenterY = (wallBottom + wallTop) * 0.5;

    const group = new THREE.Group();
    group.name = TERRAIN_LIMIT_GROUP_NAME;
    group.userData = {
      isTerrain: true,
      isTerrainBoundaryGroup: true,
      workspaceOnly: "TERRAIN",
      isSystemObject: true,
      selectable: false,
      ignoreInHierarchy: true,
      ignoreInTimeline: true,
      collisionEnabled: true,
    };

    const boundaryMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    boundaryMaterial.colorWrite = false;

    const makeWall = (name, sizeX, sizeY, sizeZ, x, y, z) => {
      const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const mesh = new THREE.Mesh(geometry, boundaryMaterial);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.visible = true;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      mesh.userData = {
        isTerrain: true,
        isTerrainBoundary: true,
        workspaceOnly: "TERRAIN",
        isSystemObject: true,
        selectable: false,
        ignoreInHierarchy: true,
        ignoreInTimeline: true,
        ignoreTerrainRaycast: true,
        ignorePlayerGrounding: true,
        collisionEnabled: true,
        collisionLayer: "world-static",
        bodyType: "static",
        physicsShape: "box",
        horizontalBlocking: true,
        traversalType: false,
        noTraversal: true,
      };

      group.add(mesh);
      return mesh;
    };

    const extendedWidth = bounds.width + thickness * 2;
    const extendedDepth = bounds.depth + thickness * 2;

    makeWall("TerrainLimit_North", extendedWidth, wallHeight, thickness, bounds.centerX, wallCenterY, bounds.minZ - thickness * 0.5);
    makeWall("TerrainLimit_South", extendedWidth, wallHeight, thickness, bounds.centerX, wallCenterY, bounds.maxZ + thickness * 0.5);
    makeWall("TerrainLimit_West", thickness, wallHeight, extendedDepth, bounds.minX - thickness * 0.5, wallCenterY, bounds.centerZ);
    makeWall("TerrainLimit_East", thickness, wallHeight, extendedDepth, bounds.maxX + thickness * 0.5, wallCenterY, bounds.centerZ);

    landscape.add(group);
    landscape.userData = landscape.userData || {};
    landscape.userData.terrainLimitGroup = group;
    landscape.userData.terrainBoundsLocal = {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minZ: bounds.minZ,
      maxZ: bounds.maxZ,
    };
    landscape.userData.limitPlayerToTerrain = true;
    landscape.userData.terrainLimitMargin = Math.max(0, Number(options.margin ?? settings.terrainLimitMargin ?? 0.45) || 0);

    window.SMPlayerCollisionRegistry?.registerObject?.(group, {
      collisionEnabled: true,
      collisionLayer: "world-static",
      bodyType: "static",
      physicsShape: "box",
      horizontalBlocking: true,
      traversalType: false,
    });

    window.playerSystem?.playerPhysics?.refreshWorld?.(true);

    window.dispatchEvent(
      new CustomEvent("sm:terrain-limits-created", {
        detail: { terrain: landscape, group, bounds: { ...bounds } },
      }),
    );

    return group;
  }

  function limitTerrain(target, options = {}) {
    const landscape = options.landscape || NS.getLandscape?.() || window.terrain;
    if (!landscape || !target) return { clamped: false, position: null, terrain: landscape || null };

    const bounds = landscape.userData?.terrainBoundsLocal || getTerrainLocalBounds(landscape);
    if (!bounds) return { clamped: false, position: null, terrain: landscape };

    const margin = Math.max(0, Number(options.margin ?? landscape.userData?.terrainLimitMargin ?? 0.45) || 0);
    const minX = bounds.minX + margin;
    const maxX = bounds.maxX - margin;
    const minZ = bounds.minZ + margin;
    const maxZ = bounds.maxZ - margin;

    const isObject3D = !!target?.isObject3D;
    const isVector3 = !!target?.isVector3;
    if (!isObject3D && !isVector3) return { clamped: false, position: null, terrain: landscape };

    if (isObject3D) {
      target.updateWorldMatrix?.(true, false);
      target.getWorldPosition(_tmpWorld);
    } else {
      _tmpWorld.copy(target);
    }

    landscape.updateWorldMatrix?.(true, false);
    _tmpLocal.copy(_tmpWorld);
    landscape.worldToLocal(_tmpLocal);

    const oldX = _tmpLocal.x;
    const oldZ = _tmpLocal.z;

    _tmpLocal.x = THREE.MathUtils.clamp(_tmpLocal.x, Math.min(minX, maxX), Math.max(minX, maxX));
    _tmpLocal.z = THREE.MathUtils.clamp(_tmpLocal.z, Math.min(minZ, maxZ), Math.max(minZ, maxZ));

    const clamped = Math.abs(_tmpLocal.x - oldX) > 1e-7 || Math.abs(_tmpLocal.z - oldZ) > 1e-7;
    landscape.localToWorld(_tmpLocal);

    if (options.mutate !== false && clamped) {
      if (isObject3D) {
        if (target.parent) {
          _tmpParentLocal.copy(_tmpLocal);
          target.parent.worldToLocal(_tmpParentLocal);
          target.position.x = _tmpParentLocal.x;
          target.position.z = _tmpParentLocal.z;
        } else {
          target.position.x = _tmpLocal.x;
          target.position.z = _tmpLocal.z;
        }
        target.updateMatrixWorld?.(true);
      } else {
        target.x = _tmpLocal.x;
        target.z = _tmpLocal.z;
      }
    }

    return {
      clamped,
      position: _tmpLocal.clone(),
      terrain: landscape,
      bounds: { minX, maxX, minZ, maxZ },
    };
  }

  function disposeLandscape(landscape) {
    if (!landscape) return;
    disposeTerrainLimits(landscape);
    landscape.userData?.componentManager?.dispose?.();

    const material = landscape.userData?.sharedMaterial;
    if (material) {
      material.map?.dispose?.();
      material.dispose?.();
    }

    landscape.parent?.remove(landscape);
    if (NS.state.activeLandscape === landscape) NS.state.activeLandscape = null;
    if (window.terrain === landscape) window.terrain = null;
  }

  function normalizeSettings(options = {}) {
    const current = NS.state.creation || {};
    const useHighResolutionDefault = options.isDefault === true;

    const defaultValue = (key, optionValue, currentValue) => {
      if (useHighResolutionDefault) return DEFAULT_TERRAIN_RESOLUTION[key];
      if (optionValue !== undefined && optionValue !== null) return optionValue;
      if (currentValue !== undefined && currentValue !== null) return currentValue;
      return DEFAULT_TERRAIN_RESOLUTION[key];
    };

    const intValue = (value, fallback, min = 1) => {
      const n = Number(value);
      return Math.max(min, Math.floor(Number.isFinite(n) ? n : fallback));
    };

    const numValue = (value, fallback, min = 0.001) => {
      const n = Number(value);
      return Math.max(min, Number.isFinite(n) ? n : fallback);
    };

    const nonNegativeValue = (value, fallback) => {
      const n = Number(value);
      return Math.max(0, Number.isFinite(n) ? n : fallback);
    };

    const requestedMode = String(options.initialMode || current.initialMode || "edgemountains").toLowerCase();

    return {
      sectionSize: intValue(defaultValue("sectionSize", options.sectionSize, current.sectionSize), DEFAULT_TERRAIN_RESOLUTION.sectionSize),
      sectionsPerComponent: (() => {
        const value = Number(defaultValue("sectionsPerComponent", options.sectionsPerComponent, current.sectionsPerComponent));
        return [1, 2].includes(value) ? value : DEFAULT_TERRAIN_RESOLUTION.sectionsPerComponent;
      })(),
      componentsX: intValue(defaultValue("componentsX", options.componentsX, current.componentsX), DEFAULT_TERRAIN_RESOLUTION.componentsX),
      componentsZ: intValue(defaultValue("componentsZ", options.componentsZ, current.componentsZ), DEFAULT_TERRAIN_RESOLUTION.componentsZ),
      quadSize: numValue(defaultValue("quadSize", options.quadSize, current.quadSize), DEFAULT_TERRAIN_RESOLUTION.quadSize),
      heightScale: numValue(options.heightScale, current.heightScale),
      locationX: Number(options.locationX ?? current.locationX) || 0,
      locationY: Number(options.locationY ?? current.locationY) || 0,
      locationZ: Number(options.locationZ ?? current.locationZ) || 0,
      initialMode: requestedMode === "unreal" ? "edgemountains" : requestedMode,
      flatCenterRatio: Math.max(0.1, Math.min(0.85, Number(options.flatCenterRatio ?? current.flatCenterRatio) || 0.45)),
      edgeMountainAmplitude: nonNegativeValue(options.edgeMountainAmplitude, current.edgeMountainAmplitude ?? 48),
      edgeMountainFalloff: numValue(options.edgeMountainFalloff, current.edgeMountainFalloff ?? 2.2, 0.1),
      noiseAmplitude: Number(options.noiseAmplitude ?? current.noiseAmplitude) || 6.5,
      noiseFrequency: numValue(options.noiseFrequency, current.noiseFrequency ?? 0.015, 0.000001),
      noiseOctaves: intValue(options.noiseOctaves, current.noiseOctaves ?? 5),
      noisePersistence: Math.max(0, Math.min(1, Number(options.noisePersistence ?? current.noisePersistence) || 0.5)),
      noiseSeed: Math.floor(Number(options.noiseSeed ?? options.seed ?? current.noiseSeed) || 1337),
      theme: options.theme || current.theme || "realistic",
      limitPlayerToTerrain: options.limitPlayerToTerrain !== undefined ? !!options.limitPlayerToTerrain : current.limitPlayerToTerrain !== false,
      terrainLimitThickness: numValue(options.terrainLimitThickness, current.terrainLimitThickness ?? 1, 0.05),
      terrainLimitVerticalPadding: numValue(options.terrainLimitVerticalPadding, current.terrainLimitVerticalPadding ?? 2048, 10),
      terrainLimitMargin: nonNegativeValue(options.terrainLimitMargin, current.terrainLimitMargin ?? 0.45),
    };
  }

  // ---------------------------------------------------------------------------
  // 10. MAIN LANDSCAPE CREATOR
  // ---------------------------------------------------------------------------
  function createLandscape(options = {}) {
    const scene = NS.getScene();
    if (!scene) {
      console.error("[Landscape] Scene unavailable");
      return null;
    }

    const settings = normalizeSettings(options);
    if (!options.isDefault) {
      Object.assign(NS.state.creation, settings);
    }

    const old = NS.getLandscape?.();
    if (old) disposeLandscape(old);

    const data = new NS.TerrainData(settings);
    const precomputedHeights = options.__smInitialHeights;
    let generationGraph = options.__smGenerationGraph || null;

    if (
      precomputedHeights &&
      typeof precomputedHeights.length === "number" &&
      precomputedHeights.length === data.heights.length
    ) {
      data.heights.set(precomputedHeights);
      data.version++;
    } else {
      generationGraph = generateInitialHeight(data, settings);
    }

    const landscape = new THREE.Group();
    landscape.name = "Terrain_Mesh";
    landscape.position.set(settings.locationX, settings.locationY, settings.locationZ);

    landscape.userData = {
      isTerrain: true,
      workspaceOnly: "TERRAIN",
      isLandscape: true,
      isEnvironment: true,
      selectable: true,
      ignoreInHierarchy: false,
      settings: { ...settings },
      config: data.getInfo(),
      terrainData: data,
      heightData: data.heights,
      limitPlayerToTerrain: settings.limitPlayerToTerrain,
      initialHeightSource: options.__smInitialHeightSource || "main-thread",
      terrainWorkerStats: options.__smWorkerMeta || null,
      generationGraph,
    };

    const material = createRealisticRockSoilMaterial(settings);
    const manager = new NS.TerrainComponentManager({
      terrainData: data,
      landscape,
      material,
    });

    manager.build();
    enhanceTerrainRenderQuality(landscape);

    landscape.userData.componentManager = manager;
    landscape.userData.sharedMaterial = material;

    attachTerrainQueryAPI(landscape, data);

    scene.add(landscape);
    NS.setLandscape(landscape);

    if (settings.limitPlayerToTerrain) {
      createTerrainLimits(landscape, {
        thickness: settings.terrainLimitThickness,
        verticalPadding: settings.terrainLimitVerticalPadding,
        margin: settings.terrainLimitMargin,
      });
    }

    NS.state.mode = NS.MODES.SCULPT;
    NS.interaction?.setActiveTool?.(NS.TOOLS.RAISE_LOWER);
    NS.history?.clear?.();

    window.selectedObject = landscape;
    window.transformControls?.attach?.(landscape);

    try {
      window.hierarchyManager?.renderAll?.();
      window.updateHierarchy?.();
    } catch (_) {}

    const nodeEditor = window.ensureTerrainNodeEditor?.() || window.terrainNodeEditor;
    nodeEditor?.setTarget?.(landscape);

    window.dispatchEvent(
      new CustomEvent("sm:terrain-created", {
        detail: {
          terrain: landscape,
          landscape,
          terrainData: data,
          terrainLimits: landscape.userData.terrainLimitGroup || null,
        },
      }),
    );

    console.log("✅ Ultra Realistic High-Fidelity Terrain Ready", data.getInfo());
    return landscape;
  }

  async function createLandscapeAsync(options = {}) {
    const settings = normalizeSettings(options);
    if (settings.initialMode !== "noise") {
      return createLandscape(options);
    }

    const bridge = window.SMTerrainWorkerBridge || window.smTerrainWorkerBridge || null;
    if (!bridge?.generateHeightmap) {
      return createLandscape(options);
    }

    try {
      const probeData = new NS.TerrainData(settings);
      const started = performance.now();

      const workerResult = await bridge.generateHeightmap({
        width: settings.width,
        length: settings.length,
        resolutionX: probeData.resolutionX,
        resolutionZ: probeData.resolutionZ,
        initialMode: settings.initialMode,
        noiseAmplitude: settings.noiseAmplitude,
        noiseFrequency: settings.noiseFrequency,
        noiseOctaves: settings.noiseOctaves,
        noisePersistence: settings.noisePersistence,
        noiseLacunarity: Number(options.noiseLacunarity ?? 2),
        seed: Number(options.seed ?? options.noiseSeed ?? 1337),
        timeoutMs: options.workerTimeoutMs ?? 30000,
      });

      if (!workerResult?.heights || workerResult.heights.length !== probeData.heights.length) {
        throw new Error("Worker height count mismatch.");
      }

      return createLandscape({
        ...options,
        __smInitialHeights: workerResult.heights,
        __smInitialHeightSource: "worker",
        __smWorkerMeta: {
          workerDurationMs: workerResult.workerDurationMs,
          totalDurationMs: performance.now() - started,
          minHeight: workerResult.minHeight,
          maxHeight: workerResult.maxHeight,
          vertices: workerResult.heights.length,
        },
      });
    } catch (error) {
      return createLandscape(options);
    }
  }

  function createTerrainFromToolbar() {
    window.requestGlobalSculptingWorkspace?.();
    return null;
  }

  function bindCreateTerrainButton() {
    const button = document.getElementById("createTerrain");
    if (!button || button.dataset.landscapeWorkspaceBound === "1") return;
    button.dataset.landscapeWorkspaceBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      window.requestGlobalSculptingWorkspace?.();
    });
  }

  NS.DEFAULT_TERRAIN_RESOLUTION = DEFAULT_TERRAIN_RESOLUTION;
  window.SMDefaultTerrainResolution = DEFAULT_TERRAIN_RESOLUTION;

  NS.generator = {
    DEFAULT_TERRAIN_RESOLUTION,
    createLandscape,
    createLandscapeAsync,
    createTerrain: createLandscape,
    createTerrainAsync: createLandscapeAsync,
    createTerrainFromToolbar,
    bindCreateTerrainButton,
    disposeLandscape,
    normalizeSettings,
    getTerrainLocalBounds,
    createTerrainLimits,
    disposeTerrainLimits,
    limitTerrain,
  };

  window.createLandscape = createLandscape;
  window.createLandscapeAsync = createLandscapeAsync;
  window.createTerrain = createLandscape;
  window.createTerrainAsync = createLandscapeAsync;
  window.createTerrainFromToolbar = createTerrainFromToolbar;
  window.createTerrainLimits = createTerrainLimits;
  window.disposeTerrainLimits = disposeTerrainLimits;
  window.limitTerrain = limitTerrain;
})();