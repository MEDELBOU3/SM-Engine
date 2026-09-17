// ============================================================================
// assets/addObject/scene-objects/light-objects.js
// SM Engine — Optimized Managed Lights + Editor Icons
//
// Replaces heavyweight THREE.*LightHelper objects with:
// - constant-screen light icons
// - tiny LineSegments guides
// - editor-only render layer
//
// REAL light behavior remains separate from editor visualization.
// ============================================================================

(function () {
  "use strict";

  const LIGHT_EDITOR_LAYER = 30;

  const LIGHT_GIZMO_CONFIG = {
    iconScale: 0.052,

    pointRadius: 0.28,
    spotLength: 1.35,
    directionalLength: 1.25,

    hemisphereRadius: 0.34,

    areaPreviewScale: 0.18,

    showCompactGuidesByDefault: true,
  };

  // ------------------------------------------------------------------------
  // EDITOR LAYER
  // ------------------------------------------------------------------------

  function enableEditorLightLayer(camera) {
    if (!camera?.isCamera) return false;

    camera.layers.enable(LIGHT_EDITOR_LAYER);

    return true;
  }

  function disableEditorLightLayer(camera) {
    if (!camera?.isCamera) return false;

    camera.layers.disable(LIGHT_EDITOR_LAYER);

    return true;
  }

  function ensureEditorViewportLightLayer() {
    const camera = window.camera;

    /*
     * Normal editor camera must see light gizmos.
     * Managed scene/cinematic cameras should not.
     */
    if (camera?.isCamera && !camera.userData?.smManagedSceneCamera) {
      enableEditorLightLayer(camera);
    }
  }

  function markEditorHelper(object, extra = {}) {
    if (!object) return object;

    object.userData = object.userData || {};

    Object.assign(object.userData, {
      isSystemObject: true,
      isEditorHelper: true,
      editorOnly: true,

      ignoreInHierarchy: true,
      ignoreInTimeline: true,
      ignoreSelection: true,
      ignoreRaycast: true,

      smLightGizmo: true,

      ...extra,
    });

    object.layers.set(LIGHT_EDITOR_LAYER);

    return object;
  }

  // ------------------------------------------------------------------------
  // ICONS
  // ------------------------------------------------------------------------

  function drawLightIcon(type) {
    const canvas = document.createElement("canvas");

    canvas.width = 128;
    canvas.height = 128;

    const ctx = canvas.getContext("2d");

    if (!ctx) return null;

    ctx.clearRect(0, 0, 128, 128);

    ctx.fillStyle = "rgba(38,38,38,0.84)";

    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();

      ctx.roundRect(17, 17, 94, 94, 14);

      ctx.fill();
    } else {
      ctx.fillRect(17, 17, 94, 94);
    }

    ctx.strokeStyle = "rgba(235,216,150,0.96)";

    ctx.fillStyle = "rgba(235,216,150,0.96)";

    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const drawBulb = () => {
      ctx.beginPath();

      ctx.arc(60, 57, 20, 0, Math.PI * 2);

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(48, 78);

      ctx.lineTo(72, 78);

      ctx.moveTo(51, 88);

      ctx.lineTo(69, 88);

      ctx.stroke();
    };

    const drawRays = () => {
      const rays = [
        [60, 24, 60, 15],
        [60, 99, 60, 108],
        [27, 57, 18, 57],
        [93, 57, 102, 57],
        [36, 33, 29, 26],
        [84, 33, 91, 26],
        [36, 81, 29, 88],
        [84, 81, 91, 88],
      ];

      ctx.lineWidth = 5;

      ctx.beginPath();

      rays.forEach((ray) => {
        ctx.moveTo(ray[0], ray[1]);

        ctx.lineTo(ray[2], ray[3]);
      });

      ctx.stroke();
    };

    if (type === "directional" || type === "sun") {
      ctx.beginPath();

      ctx.arc(51, 51, 18, 0, Math.PI * 2);

      ctx.stroke();

      drawRays();

      ctx.lineWidth = 7;

      ctx.beginPath();

      ctx.moveTo(76, 78);

      ctx.lineTo(98, 100);

      ctx.moveTo(98, 100);

      ctx.lineTo(87, 98);

      ctx.moveTo(98, 100);

      ctx.lineTo(96, 89);

      ctx.stroke();
    } else if (type === "spot") {
      ctx.beginPath();

      ctx.moveTo(36, 43);

      ctx.lineTo(65, 43);

      ctx.lineTo(81, 64);

      ctx.lineTo(65, 85);

      ctx.lineTo(36, 85);

      ctx.closePath();

      ctx.stroke();

      ctx.lineWidth = 5;

      ctx.beginPath();

      ctx.moveTo(83, 53);

      ctx.lineTo(102, 44);

      ctx.moveTo(83, 64);

      ctx.lineTo(105, 64);

      ctx.moveTo(83, 75);

      ctx.lineTo(102, 84);

      ctx.stroke();
    } else if (type === "hemisphere") {
      ctx.beginPath();

      ctx.arc(64, 67, 32, Math.PI, 0);

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(32, 67);

      ctx.lineTo(96, 67);

      ctx.stroke();

      ctx.lineWidth = 5;

      ctx.beginPath();

      ctx.moveTo(64, 32);

      ctx.lineTo(64, 22);

      ctx.moveTo(43, 38);

      ctx.lineTo(36, 30);

      ctx.moveTo(85, 38);

      ctx.lineTo(92, 30);

      ctx.stroke();
    } else if (type === "area") {
      ctx.strokeRect(33, 37, 58, 45);

      ctx.lineWidth = 5;

      ctx.beginPath();

      ctx.moveTo(41, 91);

      ctx.lineTo(41, 101);

      ctx.moveTo(62, 91);

      ctx.lineTo(62, 101);

      ctx.moveTo(83, 91);

      ctx.lineTo(83, 101);

      ctx.stroke();
    } else {
      drawBulb();
      drawRays();
    }

    const texture = new THREE.CanvasTexture(canvas);

    if ("colorSpace" in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    texture.needsUpdate = true;

    return texture;
  }

  function createLightIcon(type) {
    const material = new THREE.SpriteMaterial({
      map: drawLightIcon(type),

      transparent: true,
      opacity: 0.96,

      depthTest: false,
      depthWrite: false,

      sizeAttenuation: false,
    });

    const icon = new THREE.Sprite(material);

    icon.name = `LightEditorIcon_${type}`;

    markEditorHelper(icon, {
      smLightIcon: true,
      lightIconType: type,
    });

    icon.scale.set(
      LIGHT_GIZMO_CONFIG.iconScale,
      LIGHT_GIZMO_CONFIG.iconScale,
      1,
    );

    icon.position.y = 0.18;

    icon.renderOrder = 10010;

    return icon;
  }

  // ------------------------------------------------------------------------
  // COMPACT LINE GIZMOS
  // ------------------------------------------------------------------------

  function makeLineSegments(points, { color = 0xd9c886, opacity = 0.68 } = {}) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,

      depthTest: false,
      depthWrite: false,
    });

    const lines = new THREE.LineSegments(geometry, material);

    markEditorHelper(lines, {
      smLightCompactGuide: true,
    });

    lines.renderOrder = 10000;

    return lines;
  }

  function createCirclePoints(radius, segments = 20, axis = "xy") {
    const points = [];

    for (let index = 0; index < segments; index += 1) {
      const a = (index / segments) * Math.PI * 2;

      const b = ((index + 1) / segments) * Math.PI * 2;

      const make = (angle) => {
        const c = Math.cos(angle) * radius;

        const s = Math.sin(angle) * radius;

        if (axis === "xz") {
          return new THREE.Vector3(c, 0, s);
        }

        if (axis === "yz") {
          return new THREE.Vector3(0, c, s);
        }

        return new THREE.Vector3(c, s, 0);
      };

      points.push(make(a), make(b));
    }

    return points;
  }

  function createPointGuide() {
    const r = LIGHT_GIZMO_CONFIG.pointRadius;

    const points = [
      ...createCirclePoints(r, 16, "xy"),

      ...createCirclePoints(r, 16, "xz"),

      ...createCirclePoints(r, 16, "yz"),
    ];

    return makeLineSegments(points, {
      opacity: 0.48,
    });
  }

  function createDirectionalGuide() {
    const length = LIGHT_GIZMO_CONFIG.directionalLength;

    const endZ = -length;

    const points = [
      new THREE.Vector3(0, 0, 0),

      new THREE.Vector3(0, 0, endZ),

      new THREE.Vector3(0, 0, endZ),

      new THREE.Vector3(-0.13, 0.1, endZ + 0.2),

      new THREE.Vector3(0, 0, endZ),

      new THREE.Vector3(0.13, 0.1, endZ + 0.2),

      new THREE.Vector3(0, 0, endZ),

      new THREE.Vector3(0, -0.13, endZ + 0.2),
    ];

    return makeLineSegments(points, {
      opacity: 0.68,
    });
  }

  function createSpotGuide(light) {
    const length = Math.min(
      LIGHT_GIZMO_CONFIG.spotLength,

      Math.max(0.5, Number(light.distance) || 1.35),
    );

    const angle = Math.min(
      Math.PI / 2.2,

      Math.max(0.04, Number(light.angle) || Math.PI / 6),
    );

    const radius = Math.min(0.82, Math.tan(angle) * length);

    const z = -length;

    const ring = [];

    const segments = 18;

    for (let index = 0; index < segments; index += 1) {
      const a = (index / segments) * Math.PI * 2;

      const b = ((index + 1) / segments) * Math.PI * 2;

      ring.push(
        new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, z),

        new THREE.Vector3(Math.cos(b) * radius, Math.sin(b) * radius, z),
      );
    }

    const corners = [
      new THREE.Vector3(radius, 0, z),

      new THREE.Vector3(-radius, 0, z),

      new THREE.Vector3(0, radius, z),

      new THREE.Vector3(0, -radius, z),
    ];

    const points = [...ring];

    corners.forEach((corner) => {
      points.push(new THREE.Vector3(), corner);
    });

    return makeLineSegments(points, {
      opacity: 0.6,
    });
  }

  function createHemisphereGuide() {
    const r = LIGHT_GIZMO_CONFIG.hemisphereRadius;

    const points = [];

    const segments = 18;

    for (let index = 0; index < segments; index += 1) {
      const a = (index / segments) * Math.PI;

      const b = ((index + 1) / segments) * Math.PI;

      points.push(
        new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0),

        new THREE.Vector3(Math.cos(b) * r, Math.sin(b) * r, 0),
      );
    }

    points.push(
      new THREE.Vector3(-r, 0, 0),

      new THREE.Vector3(r, 0, 0),
    );

    return makeLineSegments(points, {
      opacity: 0.48,
    });
  }

  function createAreaGuide(light) {
    const scale = LIGHT_GIZMO_CONFIG.areaPreviewScale;

    const halfWidth = Math.max(0.16, Number(light.width) * scale * 0.5);

    const halfHeight = Math.max(0.16, Number(light.height) * scale * 0.5);

    const z = 0;

    const a = new THREE.Vector3(-halfWidth, halfHeight, z);

    const b = new THREE.Vector3(halfWidth, halfHeight, z);

    const c = new THREE.Vector3(halfWidth, -halfHeight, z);

    const d = new THREE.Vector3(-halfWidth, -halfHeight, z);

    const points = [
      a,
      b,

      b,
      c,

      c,
      d,

      d,
      a,

      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -0.46),

      new THREE.Vector3(0, 0, -0.46),

      new THREE.Vector3(-0.08, 0.06, -0.32),

      new THREE.Vector3(0, 0, -0.46),

      new THREE.Vector3(0.08, 0.06, -0.32),
    ];

    return makeLineSegments(points, {
      opacity: 0.62,
    });
  }

  function getLightVisualType(light, preferred = null) {
    if (preferred) {
      return preferred;
    }

    if (light.isPointLight) {
      return "point";
    }

    if (light.isSpotLight) {
      return "spot";
    }

    if (light.isHemisphereLight) {
      return "hemisphere";
    }

    if (light.isRectAreaLight) {
      return "area";
    }

    if (light.isDirectionalLight) {
      return "directional";
    }

    return "point";
  }

  function createCompactGuide(light, type) {
    if (type === "spot") {
      return createSpotGuide(light);
    }

    if (type === "directional" || type === "sun") {
      return createDirectionalGuide();
    }

    if (type === "hemisphere") {
      return createHemisphereGuide();
    }

    if (type === "area") {
      return createAreaGuide(light);
    }

    return createPointGuide();
  }

  function disposeObject3DResources(object) {
    if (!object) return;

    object.traverse?.((child) => {
      child.geometry?.dispose?.();

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => {
          material.map?.dispose?.();

          material.dispose?.();
        });
      } else {
        child.material?.map?.dispose?.();

        child.material?.dispose?.();
      }
    });

    object.parent?.remove(object);
  }

  function createManagedLightGizmo(light, type) {
    if (!light?.isLight) {
      return null;
    }

    const old = light.userData?.helper;

    if (old) {
      disposeObject3DResources(old);
    }

    const visualType = getLightVisualType(light, type);

    const group = new THREE.Group();

    group.name = `Helper_${light.name}`;

    markEditorHelper(group, {
      lightUuid: light.uuid,

      lightVisualType: visualType,
    });

    const icon = createLightIcon(visualType);

    const guide = createCompactGuide(light, visualType);

    guide.visible = LIGHT_GIZMO_CONFIG.showCompactGuidesByDefault;

    group.add(guide, icon);

    light.add(group);

    light.userData = light.userData || {};

    light.userData.helper = group;

    light.userData.lightEditorIcon = icon;

    light.userData.lightCompactGuide = guide;

    light.userData.lightGizmoType = visualType;

    return group;
  }

  function rebuildManagedLightGizmo(light) {
    if (!light?.isLight) {
      return false;
    }

    const oldGuide = light.userData?.lightCompactGuide;

    const helper = light.userData?.helper;

    if (!helper) {
      createManagedLightGizmo(light, light.userData?.lightGizmoType);

      return true;
    }

    const type = light.userData?.lightGizmoType || getLightVisualType(light);

    const wasVisible = oldGuide ? oldGuide.visible : true;

    if (oldGuide) {
      disposeObject3DResources(oldGuide);
    }

    const next = createCompactGuide(light, type);

    next.visible = wasVisible;

    helper.add(next);

    light.userData.lightCompactGuide = next;

    return true;
  }

  // ------------------------------------------------------------------------
  // SHADOWS
  // ------------------------------------------------------------------------

  function ensureRendererShadows() {
    const renderer = window.renderer;

    if (!renderer?.shadowMap) {
      return;
    }

    renderer.shadowMap.enabled = true;

    /*
     * PCFShadowMap is cheaper than forcing soft/high-cost helpers here.
     * PerformanceManager can still override global policy.
     */
    renderer.shadowMap.type = THREE.PCFShadowMap;

    renderer.shadowMap.autoUpdate = true;

    renderer.shadowMap.needsUpdate = true;
  }

  function ensureSceneShadowFlags() {
    const scene = window.scene;

    if (!scene?.traverse) {
      return;
    }

    scene.traverse((object) => {
      if (!object?.isMesh) {
        return;
      }

      const data = object.userData || {};

      const name = String(object.name || "");

      const excluded =
        data.excludeFromShadows === true ||
        data.disableAutoShadows === true ||
        data.isTransformControlsChild === true ||
        data.isEditorHelper === true ||
        data.editorOnly === true ||
        data.isGuideHandle === true ||
        data.isMediaPlane === true ||
        data.isSkyLightingObject === true ||
        /TransformControls|Gizmo|Helper|Picker|Axis|Grid|DistanceMarkers|NaniteDebug/i.test(
          name,
        );

      if (excluded) {
        return;
      }

      if (data.noCastShadow !== true) {
        object.castShadow = true;
      }

      if (data.noReceiveShadow !== true) {
        object.receiveShadow = true;
      }
    });
  }

  function configureShadow(light) {
    if (!light?.isLight) {
      return light;
    }

    light.userData = light.userData || {};

    light.userData.type = "Light";

    light.userData.isUserAuthoredLight = true;

    if (
      light.isHemisphereLight ||
      light.isAmbientLight ||
      light.isRectAreaLight
    ) {
      light.castShadow = false;

      light.userData.shadowRequested = false;

      light.userData.supportsShadows = false;

      return light;
    }

    light.castShadow = true;

    light.userData.shadowRequested = true;

    light.userData.supportsShadows = true;

    light.userData.allowShadowBudgetDisable = true;

    if (light.isDirectionalLight) {
      light.userData.allowSecondaryGlobalSun = true;
    }

    if (!light.shadow) {
      return light;
    }

    /*
     * More sensible editor defaults:
     * point/spot = 512
     * directional = 1024
     *
     * Inspector/performance manager may promote quality when needed.
     */
    if (light.isPointLight) {
      light.shadow.mapSize.set(512, 512);

      light.shadow.camera.near = 0.1;

      light.shadow.camera.far = Math.min(
        150,
        Math.max(10, Number(light.distance) || 100),
      );

      light.shadow.bias = -0.0005;

      light.shadow.normalBias = 0.02;

      light.shadow.radius = 1;

      light.userData.shadowPriority = 2;
    } else if (light.isSpotLight) {
      light.shadow.mapSize.set(512, 512);

      light.shadow.camera.near = 0.1;

      light.shadow.camera.far = Math.min(
        180,
        Math.max(10, Number(light.distance) || 100),
      );

      light.shadow.bias = -0.0003;

      light.shadow.normalBias = 0.018;

      light.shadow.radius = 1;

      light.userData.shadowPriority = 3;
    } else if (light.isDirectionalLight) {
      light.shadow.mapSize.set(1024, 1024);

      light.shadow.camera.near = 0.1;

      light.shadow.camera.far = 300;

      const size = 35;

      light.shadow.camera.left = -size;

      light.shadow.camera.right = size;

      light.shadow.camera.top = size;

      light.shadow.camera.bottom = -size;

      light.shadow.bias = -0.0002;

      light.shadow.normalBias = 0.015;

      light.shadow.radius = 1;

      light.userData.shadowPriority = 4;

      light.shadow.camera.updateProjectionMatrix?.();
    }

    light.shadow.autoUpdate = true;

    light.shadow.needsUpdate = true;

    return light;
  }

  function registerWithShadowBudget(light) {
    const manager = window.performanceManager?.shadows;

    if (!manager?.registerLight || !light?.shadow) {
      return;
    }

    manager.registerLight(light, {
      priority: light.userData?.shadowPriority ?? 1,

      allowBudgetDisable: light.userData?.allowShadowBudgetDisable !== false,
    });

    manager.setLightShadowEnabled?.(
      light,
      light.userData?.shadowRequested === true,
    );
  }

  // ------------------------------------------------------------------------
  // FINALIZATION
  // ------------------------------------------------------------------------

  function prepareLocalTarget(light) {
    if (!light?.target || !(light.isSpotLight || light.isDirectionalLight)) {
      return;
    }

    if (light.target.parent !== light) {
      light.add(light.target);
    }

    light.target.position.set(0, 0, -1);

    light.target.userData = light.target.userData || {};

    Object.assign(light.target.userData, {
      isSystemObject: true,
      editorOnly: true,
      ignoreInHierarchy: true,
      ignoreInTimeline: true,
      ignoreSelection: true,
      ignoreRaycast: true,
    });
  }

  function finalizeLight(light, label, visualType = null) {
    configureShadow(light);

    ensureRendererShadows();

    prepareLocalTarget(light);

    ensureEditorViewportLightLayer();

    /*
     * IMPORTANT:
     * add ONLY the real light to scene/hierarchy.
     * Gizmo is a lightweight child of the light.
     */
    if (typeof placeAndOffset === "function") {
      placeAndOffset(light);
    }

    if (typeof addObjectToScene === "function") {
      addObjectToScene(light, label);
    } else {
      window.scene?.add?.(light);
    }

    createManagedLightGizmo(light, visualType);

    ensureSceneShadowFlags();

    registerWithShadowBudget(light);

    if (window.renderer?.shadowMap) {
      window.renderer.shadowMap.needsUpdate = true;
    }

    if (light.shadow) {
      light.shadow.needsUpdate = true;
    }

    return light;
  }

  // ------------------------------------------------------------------------
  // LIGHT CREATORS
  // ------------------------------------------------------------------------

  window.createManagedPointLight = function () {
    const light = new THREE.PointLight(0xffffff, 1, 100, 2);

    light.position.set(0, 3, 0);

    light.name = "Point Light_" + light.id;

    return finalizeLight(light, "Point Light", "point");
  };

  window.createManagedSunLight = function () {
    /*
     * GLOBAL SUN MUST HAVE ONE OWNER.
     *
     * Never create another Sun if the engine Sun Rig already exists.
     */
    const existing =
      window.smSunController?.light ||
      window.smHDRSkySystem?.sunLight ||
      window.skyLightingSystem?.sunLight ||
      window.scene?.getObjectByName?.("Sun Light") ||
      window.scene?.getObjectByName?.("GameSunLight") ||
      null;

    if (existing?.isDirectionalLight) {
      console.warn("[LightObjects] Existing global Sun reused.");

      return existing;
    }

    /*
     * Only create a Sun when no global Sun exists.
     */
    const light = new THREE.DirectionalLight(0xfffaed, 2);

    light.name = "UserSunLight";

    light.castShadow = true;

    light.userData = {
      ...(light.userData || {}),
      isUserLight: true,
      allowSecondaryGlobalSun: true,
      smCreatedByLightTool: true,
    };

    return light;
  };

  window.createManagedSpotLight = function () {
    const light = new THREE.SpotLight(0xffffff, 5, 50, Math.PI / 6, 0.35, 2);

    light.position.set(0, 5, 0);

    light.name = "Spot Light_" + light.id;

    return finalizeLight(light, "Spot Light", "spot");
  };

  window.createManagedDirectionalLight = function () {
    const light = new THREE.DirectionalLight(0xffffff, 1);

    light.position.set(5, 5, 5);

    light.name = "Directional Light_" + light.id;

    return finalizeLight(light, "Directional Light", "directional");
  };

  window.createManagedHemisphereLight = function () {
    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);

    light.position.set(0, 10, 0);

    light.name = "Hemisphere Light_" + light.id;

    return finalizeLight(light, "Hemisphere Light", "hemisphere");
  };

  window.createManagedAreaLight = function () {
    const light = new THREE.RectAreaLight(0xffffff, 2, 4, 4);

    light.position.set(0, 3, 0);

    light.rotation.x = -Math.PI / 2;

    light.name = "Area Light_" + light.id;

    light.castShadow = false;

    light.userData = light.userData || {};

    light.userData.supportsShadows = false;

    light.userData.shadowRequested = false;

    return finalizeLight(light, "Area Light", "area");
  };

  // ------------------------------------------------------------------------
  // INSPECTOR / EXTERNAL API
  // ------------------------------------------------------------------------

  window.setManagedLightGuideVisible = function (light, visible) {
    if (!light?.isLight) {
      return false;
    }

    const guide = light.userData?.lightCompactGuide;

    if (!guide) {
      return false;
    }

    guide.visible = !!visible;

    return true;
  };

  window.setManagedLightIconVisible = function (light, visible) {
    if (!light?.isLight) {
      return false;
    }

    const icon = light.userData?.lightEditorIcon;

    if (!icon) {
      return false;
    }

    icon.visible = !!visible;

    return true;
  };

  window.refreshManagedLightGizmo = function (light) {
    return rebuildManagedLightGizmo(light);
  };

  window.disposeManagedLightGizmo = function (light) {
    if (!light?.isLight) {
      return false;
    }

    const helper = light.userData?.helper;

    if (helper) {
      disposeObject3DResources(helper);
    }

    if (light.userData) {
      delete light.userData.helper;
      delete light.userData.lightEditorIcon;
      delete light.userData.lightCompactGuide;
      delete light.userData.lightGizmoType;
    }

    return true;
  };

  window.setManagedLightSelected = function (light, selected = true) {
    if (!light?.isLight) {
      return false;
    }

    const guide = light.userData?.lightCompactGuide;

    if (guide?.material?.color) {
      guide.material.color.setHex(selected ? 0xffa52b : 0xd9c886);

      guide.material.opacity = selected ? 0.92 : 0.62;
    }

    const icon = light.userData?.lightEditorIcon;

    if (icon?.material) {
      icon.material.opacity = selected ? 1 : 0.96;
    }

    return true;
  };

  window.setManagedLightShadowEnabled = function (light, enabled) {
    if (!light?.isLight) {
      return false;
    }

    const supportsShadows =
      light.isPointLight || light.isSpotLight || light.isDirectionalLight;

    if (!supportsShadows || !light.shadow) {
      light.castShadow = false;

      light.userData = light.userData || {};

      light.userData.shadowRequested = false;

      return false;
    }

    const state = !!enabled;

    light.userData = light.userData || {};

    light.userData.shadowRequested = state;

    light.castShadow = state;

    window.performanceManager?.shadows?.setLightShadowEnabled?.(light, state);

    light.shadow.needsUpdate = true;

    if (window.renderer?.shadowMap) {
      window.renderer.shadowMap.enabled = true;

      window.renderer.shadowMap.needsUpdate = true;
    }

    return true;
  };

  // ------------------------------------------------------------------------
  // SELECTION EMPHASIS
  // ------------------------------------------------------------------------

  let lastSelectedLight = null;

  function syncSelectedLight(object) {
    if (lastSelectedLight && lastSelectedLight !== object) {
      window.setManagedLightSelected(lastSelectedLight, false);
    }

    if (object?.isLight) {
      window.setManagedLightSelected(object, true);

      lastSelectedLight = object;
    } else {
      lastSelectedLight = null;
    }
  }

  [
    "selectionChanged",
    "objectSelected",
    "sm:selection-changed",
    "sm:object-selected",
  ].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      const object =
        event.detail?.object ||
        event.detail?.activeObject ||
        event.detail?.selectedObject ||
        event.detail?.selected ||
        null;

      syncSelectedLight(object);
    });
  });

  // ------------------------------------------------------------------------
  // ACTIVE / CINEMATIC CAMERAS SHOULD NOT SEE EDITOR GIZMOS
  // ------------------------------------------------------------------------

  function protectActiveSceneCamera() {
    const active = window._viewedCamera;

    if (active?.isCamera) {
      disableEditorLightLayer(active);
    }

    ensureEditorViewportLightLayer();
  }

  [
    "sm:camera-changed",
    "sm:editor-camera-changed",
    "cameraChanged",
    "viewportCameraChanged",
  ].forEach((eventName) => {
    window.addEventListener(eventName, protectActiveSceneCamera);
  });

  ensureEditorViewportLightLayer();

  // ------------------------------------------------------------------------
  // PUBLIC NAMESPACE
  // ------------------------------------------------------------------------

  window.SMManagedLightGizmos = {
    layer: LIGHT_EDITOR_LAYER,

    config: LIGHT_GIZMO_CONFIG,

    create: createManagedLightGizmo,

    refresh: rebuildManagedLightGizmo,

    setGuideVisible: window.setManagedLightGuideVisible,

    setIconVisible: window.setManagedLightIconVisible,

    setSelected: window.setManagedLightSelected,

    dispose: window.disposeManagedLightGizmo,

    enableEditorLayer: enableEditorLightLayer,

    disableEditorLayer: disableEditorLightLayer,

    ensureEditorViewportLayer: ensureEditorViewportLightLayer,
  };
})();
