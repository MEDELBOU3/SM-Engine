// sculpting/terrain-sculpting/TerrainBrushPreview.js
// Unified terrain brush preview.
// Compatible with TerrainInteraction.js regardless of script load order.

(() => {
  'use strict';

  const NS = window.TerrainSculpting = window.TerrainSculpting || {};
  const state = NS.state = NS.state || {};
  const THREE = window.THREE;

  if (!THREE) {
    console.error('[TerrainBrushPreview] THREE is not available.');
    return;
  }

  const utils = NS.utils || {};
  const getMouseNormalized = utils.getMouseNormalized || ((event, element) => {
    const rect = element.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
  });

  const markAsNonSelectableBrushHelper =
    utils.markAsNonSelectableBrushHelper ||
    ((object, name = 'TerrainBrushPreview') => {
      if (!object) return object;
      object.name = name;
      object.userData = object.userData || {};
      object.userData.isEditorHelper = true;
      object.userData.isBrushHelper = true;
      object.userData.nonSelectable = true;
      object.userData.ignoreRaycast = true;
      object.traverse?.((child) => {
        child.userData = child.userData || {};
        child.userData.isEditorHelper = true;
        child.userData.isBrushHelper = true;
        child.userData.nonSelectable = true;
        child.userData.ignoreRaycast = true;
      });
      return object;
    });

  const disposeObject3D =
    utils.disposeObject3D ||
    ((object) => {
      object?.traverse?.((child) => {
        child.geometry?.dispose?.();

        const materials = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];

        materials.forEach((material) => {
          if (material?.map) material.map.dispose?.();
          material?.dispose?.();
        });
      });
    });

  const raycaster =
    NS._terrainPreviewRaycaster ||
    (NS._terrainPreviewRaycaster = new THREE.Raycaster());

  const tempNormal = new THREE.Vector3(0, 1, 0);
  const discNormal = new THREE.Vector3(0, 0, 1);

  let lastPoint = null;
  let lastNormal = new THREE.Vector3(0, 1, 0);

  function getLandscape() {
    return (
      NS.getLandscape?.() ||
      NS.landscape ||
      state.landscape ||
      window.terrain ||
      null
    );
  }

  function getRenderer() {
    return NS.getRenderer?.() || window.renderer || null;
  }

  function getCamera() {
    return NS.getCamera?.() || window.camera || null;
  }

  function getScene() {
    return NS.getScene?.() || window.scene || null;
  }

  function canonicalTool(id) {
    const aliases = {
      raiseLower: 'raise',
      raise_lower: 'raise',
      lower: 'raise',
      thermalErosion: 'thermal',
      thermal_erosion: 'thermal',
      PERLIN: 'perlin',
      HYDRAULIC: 'hydraulic',
      materialPaint: 'material',
      material_paint: 'material',
    };

    return aliases[id] || id || 'raise';
  }

  function raycastLandscape(event) {
    const landscape = getLandscape();
    const renderer = getRenderer();
    const camera = getCamera();

    if (!landscape || !renderer?.domElement || !camera || !event) {
      return null;
    }

    const mouse = getMouseNormalized(event, renderer.domElement);
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObject(landscape, true);
    if (!hits.length) return null;

    // Prefer the actual terrain component, but gracefully fall back to the
    // first hit when the generated terrain uses slightly different metadata.
    return (
      hits.find((hit) =>
        hit.object?.userData?.isTerrainComponent ||
        hit.object?.userData?.terrainComponent ||
        hit.object?.userData?.isTerrain ||
        hit.object?.parent?.userData?.isTerrainComponent ||
        hit.object?.parent?.userData?.terrainComponent ||
        hit.object?.parent?.userData?.isTerrain
      ) ||
      hits[0] ||
      null
    );
  }

  function createBrushPreview() {
    const scene = getScene();

    if (!scene) {
      return null;
    }

    if (state.brushPreview) {
      state.brushPreview.parent?.remove(state.brushPreview);
      disposeObject3D(state.brushPreview);
      state.brushPreview = null;
    }

    const group = new THREE.Group();
    group.name = 'TerrainBrushPreview';
    group.visible = false;
    group.renderOrder = 1000000;
    group.frustumCulled = false;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(
        128, 128, 0,
        128, 128, 128,
      );

      gradient.addColorStop(0, 'rgba(0,255,255,.24)');
      gradient.addColorStop(0.55, 'rgba(0,255,255,.08)');
      gradient.addColorStop(1, 'rgba(0,255,255,0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 96),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
    );

    disc.name = 'brushDisc';
    disc.renderOrder = 1000000;
    disc.frustumCulled = false;
    group.add(disc);

    const outer = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 96),
      new THREE.MeshBasicMaterial({
        color: 0x56d9ff,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );

    outer.name = 'outerRing';
    outer.renderOrder = 1000001;
    outer.frustumCulled = false;
    group.add(outer);

    const inner = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 96),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.48,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );

    inner.name = 'innerRing';
    inner.renderOrder = 1000002;
    inner.frustumCulled = false;
    group.add(inner);

    markAsNonSelectableBrushHelper(group, 'TerrainBrushPreview');

    state.brushPreview = group;
    state.brushPreviewMesh = outer;

    scene.add(group);

    updateSize();
    updateAppearance();

    return group;
  }

  function ensure() {
    const scene = getScene();
    if (!scene) return false;

    if (
      !state.brushPreview ||
      state.brushPreview.parent !== scene
    ) {
      return !!createBrushPreview();
    }

    return true;
  }

  function getPaletteColor() {
    const tool = canonicalTool(state.selectedTool);

    const palette = {
      raise: 0x56d9ff,
      smooth: 0x70d6a6,
      flatten: 0xffce70,
      level: 0xffce70,
      terrace: 0xf2a65a,
      pinch: 0xff79c6,
      clay: 0xc98156,
      scrape: 0xff8f70,
      noise: 0xd58dff,
      perlin: 0x9c7cff,
      erosion: 0x5da9ff,
      hydraulic: 0x4dc3ff,
      thermal: 0xff8a60,
      material: 0x55e6a5,
      grab: 0x74d7ff,
      inflate: 0x6ee7b7,
      deflate: 0xff6677,
      crease: 0xe8a4ff,
      fill: 0x83e377,
      relax: 0x8ad5ca,
      ridge: 0xe6c56b,
      valley: 0xff6677,
      cliff: 0xff9f43,
      plateau: 0xf8c471,
      crater: 0xc39bd3,
      canyon: 0xff6b6b,
      dune: 0xf5d76e,
      deposition: 0xa3e635,
      sharpen: 0xf78fb3,
      blur: 0x7ed6df,
    };

    if (
      state.isShiftPressed ||
      tool === 'deflate' ||
      tool === 'valley' ||
      tool === 'canyon'
    ) {
      return 0xff6677;
    }

    return palette[tool] || 0x56d9ff;
  }

  function updateAppearance() {
    const preview = state.brushPreview;
    if (!preview) return;

    const outer = preview.getObjectByName('outerRing');
    const inner = preview.getObjectByName('innerRing');
    const disc = preview.getObjectByName('brushDisc');

    const color = getPaletteColor();

    outer?.material?.color?.setHex(color);
    inner?.material?.color?.setHex(color);

    if (disc?.material) {
      const strength = THREE.MathUtils.clamp(
        Number(state.brushStrength) || 0.5,
        0.01,
        2,
      );

      disc.material.opacity = THREE.MathUtils.clamp(
        0.22 + strength * 0.18,
        0.2,
        0.65,
      );
    }

    if (outer?.material) outer.material.opacity = 0.95;
    if (inner?.material) inner.material.opacity = 0.48;
  }

  function updateSize() {
    const preview = state.brushPreview;
    if (!preview) return;

    const radius = Math.max(
      0.05,
      Number(state.brushSize) || 10,
    );

    // IMPORTANT:
    // Scale the root ONCE. The SculptingPanel must not scale the preview again.
    preview.scale.setScalar(radius);

    const inner = preview.getObjectByName('innerRing');

    if (inner) {
      const falloff = THREE.MathUtils.clamp(
        Number(state.brushFalloff) || 0.5,
        0.01,
        1,
      );

      // Falloff ring stays inside the outer radius.
      inner.scale.setScalar(
        THREE.MathUtils.clamp(1 - falloff * 0.72, 0.08, 0.98),
      );
    }
  }

  function showAt(point, normal = tempNormal) {
    if (!point || !ensure()) return null;

    const preview = state.brushPreview;
    if (!preview) return null;

    lastNormal.copy(normal || tempNormal).normalize();

    preview.position
      .copy(point)
      .addScaledVector(lastNormal, 0.035);

    preview.quaternion.setFromUnitVectors(
      discNormal,
      lastNormal,
    );

    updateSize();
    updateAppearance();

    preview.visible = true;

    lastPoint = point.clone();
    state.lastBrushPreviewPoint = lastPoint.clone();

    return preview;
  }

  function updateBrushPreview(event) {
    const preview = state.brushPreview;

    if (
      state.mode !== (NS.MODES?.SCULPT || 'SCULPT') ||
      !state.isBrushActive ||
      !getLandscape()
    ) {
      hideBrushPreviews();
      return null;
    }

    if (!preview && !ensure()) {
      return null;
    }

    const hit = raycastLandscape(event);

    if (!hit) {
      hideBrushPreviews();
      return null;
    }

    const normal = hit.face?.normal
      ? hit.face.normal
          .clone()
          .transformDirection(hit.object.matrixWorld)
          .normalize()
      : tempNormal.set(0, 1, 0);

    showAt(hit.point, normal);

    return {
      point: hit.point.clone(),
      normal: normal.clone(),
      faceIndex: hit.faceIndex,
      distance: hit.distance,
      object: hit.object,
      component:
        hit.object?.userData?.terrainComponent ||
        hit.object?.parent?.userData?.terrainComponent ||
        null,
    };
  }

  function createOrUpdate3DBrushPreview() {
    ensure();
    updateSize();
    updateAppearance();

    state.brushPreviewMesh =
      state.brushPreview?.getObjectByName('outerRing') ||
      state.brushPreview ||
      null;

    return state.brushPreview;
  }

  function hideBrushPreviews() {
    if (state.brushPreview) {
      state.brushPreview.visible = false;
    }

    lastPoint = null;
    state.lastBrushPreviewPoint = null;
  }

  // Merge instead of replacing NS.preview. This prevents TerrainInteraction
  // and TerrainBrushPreview from deleting each other's API.
  const existing = NS.preview || {};

  NS.preview = Object.assign(existing, {
    __terrainBrushPreviewUnified: true,

    createBrushPreview,
    createOrUpdate3DBrushPreview,
    ensure,

    updateBrushPreview,
    update3DBrushPreviewOnMouseMove: updateBrushPreview,

    showAt,
    hideBrushPreviews,

    updateSize,
    updateAppearance,

    raycastLandscape,

    getLastPoint: () => lastPoint,
  });

  // Keep legacy references synchronized.
  state._terrainPreviewUpdateSize = () => {
    NS.preview?.updateSize?.();
  };

  if (getScene()) {
    ensure();
  }

  console.log('[TerrainBrushPreview] Unified terrain brush preview ready.');
})();
