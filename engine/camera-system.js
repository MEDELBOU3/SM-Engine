// ============================================================
// engine/camera-system.js — SM Camera System PRO v2
//
// Professional editor camera architecture for SM Engine.
// Backwards compatible globals:
//   window.camera
//   window.orthographicCamera
//   window.controls
//   window.CameraSystem
//
// Main upgrades:
// - stable perspective <-> orthographic switching
// - exact axis views
// - view-preserving frame/focus
// - cancelable smooth flights
// - editor camera <-> scene camera piloting
// - additive camera shake that does not corrupt OrbitControls
// - persistent state hooks
// - zoom/dolly helpers
// - navigation profiles
// - clean events for viewport/UI integration
// ============================================================

(function () {
  "use strict";

  const EPS = 1e-6;

  const DEFAULTS = Object.freeze({
    fov: 50,
    near: 0.05,
    far: 5000,

    orthoFrustumSize: 20,

    initialPosition: [-10, 9, -6],
    initialTarget: [0, 0, 0],

    minDistance: 0.2,
    maxDistance: 5000,

    dampingFactor: 0.12,
    rotateSpeed: 0.55,
    panSpeed: 0.72,
    zoomSpeed: 0.85,

    framePadding: 1.35,
    minFrameDistance: 0.5,

    flightDuration: 0.65,

    persistEditorView: true,
    persistKey: "sm_editor_camera_state_v2",
  });

  const NAVIGATION_PROFILES = Object.freeze({
    default: {
      enableDamping: true,
      dampingFactor: 0.12,
      rotateSpeed: 0.55,
      panSpeed: 0.72,
      zoomSpeed: 0.85,
      screenSpacePanning: true,
    },

    modeling: {
      enableDamping: true,
      dampingFactor: 0.1,
      rotateSpeed: 0.48,
      panSpeed: 0.82,
      zoomSpeed: 0.92,
      screenSpacePanning: true,
    },

    cinematic: {
      enableDamping: true,
      dampingFactor: 0.16,
      rotateSpeed: 0.32,
      panSpeed: 0.42,
      zoomSpeed: 0.58,
      screenSpacePanning: true,
    },

    fast: {
      enableDamping: true,
      dampingFactor: 0.08,
      rotateSpeed: 0.82,
      panSpeed: 1.05,
      zoomSpeed: 1.18,
      screenSpacePanning: true,
    },
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function vectorFrom(value, fallback = [0, 0, 0]) {
    if (value?.isVector3) {
      return value.clone();
    }

    if (Array.isArray(value)) {
      return new THREE.Vector3(
        Number(value[0]) || 0,
        Number(value[1]) || 0,
        Number(value[2]) || 0,
      );
    }

    return new THREE.Vector3(...fallback);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  class CameraSystem {
    constructor(scene, rendererContainer, opts = {}) {
      this.scene = scene;
      this.container = rendererContainer;

      this.options = {
        ...DEFAULTS,
        ...opts,
      };

      this.fov = this.options.fov;
      this.near = this.options.near;
      this.far = this.options.far;
      this.orthoFrustumSize = this.options.orthoFrustumSize;

      this.camera = null;
      this.orthographicCamera = null;

      this.controls = null;
      this.renderer = null;

      this.currentViewMode = "perspective";

      // Exact Blender-style axis view state.
      this.currentAxisView = null;
      this.axisViewLocked = false;

      this.editorPerspectiveCamera = null;
      this.editorOrthographicCamera = null;

      this.pilotedCamera = null;
      this._prePilotState = null;

      this._flight = null;
      this._shake = null;

      this._inputLockCount = 0;
      this._controlsWereEnabled = true;

      this._lastStableCameraPosition = new THREE.Vector3();

      this._lastStableTarget = new THREE.Vector3();

      this._shakeOffset = new THREE.Vector3();

      this._bookmarks = new Map();

      this._lastPerspectiveState = null;
      this._lastOrthographicState = null;

      this._navigationProfile = "default";

      this._persistTimer = 0;
      this._disposed = false;

      this._tmp = {
        box: new THREE.Box3(),
        size: new THREE.Vector3(),
        center: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        right: new THREE.Vector3(),
        up: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
      };
    }

    // ------------------------------------------------------------
    // Core getters
    // ------------------------------------------------------------

    _aspect() {
      const w = this.container?.clientWidth || window.innerWidth || 1;

      const h = this.container?.clientHeight || window.innerHeight || 1;

      return w / Math.max(h, 1);
    }

    get activeCamera() {
      if (this.pilotedCamera) {
        return this.pilotedCamera;
      }

      return this.currentViewMode === "orthographic"
        ? this.orthographicCamera
        : this.camera;
    }

    get isPiloting() {
      return !!this.pilotedCamera;
    }

    get navigationProfile() {
      return this._navigationProfile;
    }

    // ------------------------------------------------------------
    // Creation
    // ------------------------------------------------------------

    createPerspectiveCamera() {
      const camera = new THREE.PerspectiveCamera(
        this.fov,
        this._aspect(),
        this.near,
        this.far,
      );

      camera.name = "Editor Perspective Camera";

      camera.position.fromArray(this.options.initialPosition);

      camera.lookAt(vectorFrom(this.options.initialTarget));

      camera.layers.enable(0);

      camera.userData = {
        ...(camera.userData || {}),
        isEditorCamera: true,
        isSystemObject: true,
        ignoreInHierarchy: true,
        selectable: false,
      };

      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      this.camera = camera;
      this.editorPerspectiveCamera = camera;

      // Keep a permanent reference to the editor perspective camera.
      window.perspectiveCamera = camera;
      window.editorPerspectiveCamera = camera;

      // At boot Perspective is the active render camera.
      window.camera = camera;
      window.activeCamera = camera;

      return camera;
    }

    createOrthographicCamera() {
      const aspect = this._aspect();

      const s = this.orthoFrustumSize;

      const cam = new THREE.OrthographicCamera(
        (s * aspect) / -2,
        (s * aspect) / 2,
        s / 2,
        s / -2,
        0.01,
        this.far,
      );

      cam.name = "Editor Orthographic Camera";

      cam.position.set(0, 50, 0);

      cam.up.set(0, 0, -1);

      cam.lookAt(0, 0, 0);

      cam.userData = {
        ...(cam.userData || {}),
        isEditorCamera: true,
        isSystemObject: true,
        ignoreInHierarchy: true,
        selectable: false,
      };

      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      if (!cam.parent && this.scene) {
        this.scene.add(cam);
      }

      this.orthographicCamera = cam;
      this.editorOrthographicCamera = cam;

      window.orthographicCamera = cam;
      window.editorOrthographicCamera = cam;

      return cam;
    }

    setupOrbitControls(renderer) {
      this.renderer = renderer;

      if (this.controls) {
        try {
          this.controls.dispose();
        } catch (_) {}

        this.controls = null;
      }

      const controls = new THREE.OrbitControls(
        this.camera,
        renderer.domElement,
      );

      controls.minDistance = this.options.minDistance;

      controls.maxDistance = this.options.maxDistance;

      controls.maxPolarAngle = Math.PI;

      controls.minPolarAngle = 0;

      controls.enableDamping = true;

      controls.dampingFactor = this.options.dampingFactor;

      controls.rotateSpeed = this.options.rotateSpeed;

      controls.panSpeed = this.options.panSpeed;

      controls.zoomSpeed = this.options.zoomSpeed;

      controls.screenSpacePanning = true;

      controls.target.fromArray(this.options.initialTarget);

      controls.enabled = true;

      controls.addEventListener("start", () => {
        this.stopFlight();
      });

      controls.addEventListener("change", () => {
        this._rememberStableView();
        this._schedulePersist();

        window.dispatchEvent(
          new CustomEvent("sm:camera-changed", {
            detail: {
              camera: this.activeCamera,
              mode: this.currentViewMode,
              target: controls.target.clone(),
              source: "controls",
            },
          }),
        );
      });

      this.controls = controls;

      window.controls = controls;

      this.setNavigationProfile("default");

      return controls;
    }

    initAll(renderer) {
      this.createPerspectiveCamera();
      this.createOrthographicCamera();
      this.setupOrbitControls(renderer);

      this._restorePersistedView();

      this._rememberStableView();

      window.dispatchEvent(
        new CustomEvent("sm:camera-system-ready", {
          detail: {
            system: this,
            camera: this.camera,
            orthographicCamera: this.orthographicCamera,
            controls: this.controls,
          },
        }),
      );

      return {
        camera: this.camera,
        orthographicCamera: this.orthographicCamera,
        controls: this.controls,
      };
    }

    // ------------------------------------------------------------
    // Navigation profile
    // ------------------------------------------------------------

    setNavigationProfile(name = "default") {
      const profile = NAVIGATION_PROFILES[name] || NAVIGATION_PROFILES.default;

      this._navigationProfile = NAVIGATION_PROFILES[name] ? name : "default";

      if (!this.controls) {
        return profile;
      }

      Object.entries(profile).forEach(([key, value]) => {
        if (key in this.controls) {
          this.controls[key] = value;
        }
      });

      window.dispatchEvent(
        new CustomEvent("sm:camera-navigation-profile", {
          detail: {
            name: this._navigationProfile,
            profile,
          },
        }),
      );

      return profile;
    }

    // ------------------------------------------------------------
    // Input locking
    // ------------------------------------------------------------

    lockInput() {
      this._inputLockCount += 1;

      if (this._inputLockCount === 1 && this.controls) {
        this._controlsWereEnabled = this.controls.enabled;

        this.controls.enabled = false;
      }

      return this._inputLockCount;
    }

    unlockInput() {
      this._inputLockCount = Math.max(0, this._inputLockCount - 1);

      if (this._inputLockCount === 0 && this.controls) {
        this.controls.enabled = this._controlsWereEnabled;
      }

      return this._inputLockCount;
    }

    // ------------------------------------------------------------
    // View state
    // ------------------------------------------------------------

    captureViewState() {
      const cam = this.activeCamera;

      return {
        mode: this.currentViewMode,

        piloting: !!this.pilotedCamera,

        position: cam.position.toArray(),

        quaternion: cam.quaternion.toArray(),

        target: this.controls?.target?.toArray?.() || [0, 0, 0],

        fov: cam.isPerspectiveCamera ? cam.fov : null,

        zoom: cam.zoom ?? 1,
      };
    }

    applyViewState(state, { updateControls = true, emit = true } = {}) {
      if (!state) {
        return false;
      }

      if (
        !this.pilotedCamera &&
        state.mode &&
        state.mode !== this.currentViewMode
      ) {
        if (state.mode === "orthographic") {
          this.switchToOrthographic({
            preserveView: false,
            emit: false,
          });
        } else {
          this.switchToPerspective({
            preserveView: false,
            emit: false,
          });
        }
      }

      const cam = this.activeCamera;

      if (Array.isArray(state.position)) {
        cam.position.fromArray(state.position);
      }

      if (Array.isArray(state.quaternion)) {
        cam.quaternion.fromArray(state.quaternion);
      }

      if (cam.isPerspectiveCamera && Number.isFinite(state.fov)) {
        cam.fov = state.fov;
      }

      if (Number.isFinite(state.zoom)) {
        cam.zoom = state.zoom;
      }

      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      if (updateControls && this.controls) {
        if (Array.isArray(state.target)) {
          this.controls.target.fromArray(state.target);
        }

        this.controls.object = cam;

        this.controls.update();
      }

      this._rememberStableView();

      if (emit) {
        this._emitViewChanged("state");
      }

      return true;
    }

    _rememberStableView() {
      const cam = this.activeCamera;

      if (!cam) return;

      this._lastStableCameraPosition.copy(cam.position);

      if (this.controls?.target) {
        this._lastStableTarget.copy(this.controls.target);
      }
    }

    _syncActiveCameraGlobals(camera = this.activeCamera) {
      if (!camera) {
        return null;
      }

      /*
       * CRITICAL COMPATIBILITY:
       * A lot of the current SM Engine render/editor code still reads
       * window.camera directly. Therefore window.camera MUST always be
       * the camera that OrbitControls + viewport are currently using.
       *
       * Permanent references remain available as:
       * window.perspectiveCamera
       * window.orthographicCamera
       */
      window.camera = camera;
      window.activeCamera = camera;
      window.currentCamera = camera;

      return camera;
    }

    lockAxisView(axis) {
      const key = String(axis || "").toLowerCase();

      this.currentAxisView = key;
      this.axisViewLocked = true;

      /*
       * Blender-like behaviour:
       * exact axis view remains fixed while pan + zoom still work.
       * Rotation is disabled until the view is unlocked.
       */
      if (this.controls) {
        this.controls.enableRotate = false;
      }

      window.currentCameraAxis = key;
      window.cameraAxisLocked = true;

      window.dispatchEvent(
        new CustomEvent("sm:camera-axis-lock-changed", {
          detail: {
            locked: true,
            axis: key,
            camera: this.activeCamera,
          },
        }),
      );

      return key;
    }

    unlockAxisView({ switchToPerspective = false, preserveView = true } = {}) {
      const previousAxis = this.currentAxisView;

      this.currentAxisView = null;
      this.axisViewLocked = false;

      if (this.controls) {
        this.controls.enableRotate = true;
      }

      window.currentCameraAxis = null;
      window.cameraAxisLocked = false;

      if (switchToPerspective && this.currentViewMode === "orthographic") {
        this.switchToPerspective({
          preserveView,
          emit: true,
          fromAxisUnlock: true,
        });
      } else {
        this._syncActiveCameraGlobals();
      }

      if (this.controls) {
        this.controls.object = this.activeCamera;
        this.controls.enabled = this._inputLockCount === 0;
        this.controls.enableRotate = true;
        this.controls.update();
      }

      window.updateViewportGridForAxis?.("perspective");

      window.dispatchEvent(
        new CustomEvent("sm:camera-axis-lock-changed", {
          detail: {
            locked: false,
            axis: previousAxis,
            camera: this.activeCamera,
          },
        }),
      );

      return true;
    }

    // ------------------------------------------------------------
    // Perspective / orthographic
    // ------------------------------------------------------------

    switchToPerspective(options = {}) {
      if (this.pilotedCamera) {
        this.releasePilotedCamera();
      }

      if (this.currentViewMode === "perspective") {
        this.currentAxisView = null;
        this.axisViewLocked = false;

        if (this.controls) {
          this.controls.object = this.camera;
          this.controls.enableRotate = true;
        }

        this._syncActiveCameraGlobals(this.camera);

        if (!options.fromAxisView) {
          window.updateViewportGridForAxis?.("perspective");
        }

        return this.camera;
      }

      const emit = options.emit !== false;

      const target = this.controls?.target?.clone?.() || new THREE.Vector3();

      const ortho = this.orthographicCamera;

      const perspective = this.camera;

      this._lastOrthographicState = this.captureViewState();

      if (options.preserveView !== false && ortho && perspective) {
        const direction = ortho.position.clone().sub(target);

        if (direction.lengthSq() < EPS) {
          direction.set(1, 1, 1);
        }

        direction.normalize();

        const visibleHeight =
          Math.abs(ortho.top - ortho.bottom) /
          Math.max(ortho.zoom || 1, 0.0001);

        const fovRadians = THREE.MathUtils.degToRad(
          clamp(perspective.fov || this.fov, 1, 179),
        );

        const distance = Math.max(
          this.options.minFrameDistance,
          visibleHeight / (2 * Math.tan(fovRadians / 2)),
        );

        perspective.position.copy(target).addScaledVector(direction, distance);

        perspective.up.copy(ortho.up);

        perspective.lookAt(target);

        perspective.updateProjectionMatrix();

        perspective.updateMatrixWorld(true);
      } else if (this._lastPerspectiveState) {
        this.applyViewState(this._lastPerspectiveState, {
          emit: false,
        });
      }

      this.currentViewMode = "perspective";

      window.currentViewMode = "perspective";

      if (!options.fromAxisView) {
        this.currentAxisView = null;
        this.axisViewLocked = false;
      }

      this._syncActiveCameraGlobals(perspective);

      if (this.controls) {
        this.controls.object = perspective;

        this.controls.target.copy(target);

        this.controls.enabled = this._inputLockCount === 0;

        if (!options.fromAxisView) {
          this.controls.enableRotate = true;
        }

        this.controls.update();
      }

      this._rememberStableView();

      if (!options.fromAxisView) {
        window.updateViewportGridForAxis?.("perspective");
      }

      if (emit) {
        this._emitViewChanged("perspective");
      }

      this._notifyTransformControls();

      return perspective;
    }

    switchToOrthographic(options = {}) {
      if (this.pilotedCamera) {
        this.releasePilotedCamera();
      }

      if (this.currentViewMode === "orthographic") {
        if (this.controls) {
          this.controls.object = this.orthographicCamera;
        }

        this._syncActiveCameraGlobals(this.orthographicCamera);

        return this.orthographicCamera;
      }

      const emit = options.emit !== false;

      const target = this.controls?.target?.clone?.() || new THREE.Vector3();

      const perspective = this.camera;

      const ortho = this.orthographicCamera;

      this._lastPerspectiveState = this.captureViewState();

      if (options.preserveView !== false && perspective && ortho) {
        const distance = Math.max(0.5, perspective.position.distanceTo(target));

        const fovRadians = THREE.MathUtils.degToRad(
          clamp(perspective.fov || this.fov, 1, 179),
        );

        const visibleHeight = Math.max(
          0.001,
          2 * distance * Math.tan(fovRadians / 2),
        );

        const frustumHeight =
          Math.abs(ortho.top - ortho.bottom) || this.orthoFrustumSize;

        ortho.zoom = clamp(frustumHeight / visibleHeight, 0.01, 10000);

        ortho.position.copy(perspective.position);

        ortho.quaternion.copy(perspective.quaternion);

        ortho.up.copy(perspective.up);

        ortho.updateProjectionMatrix();
        ortho.updateMatrixWorld(true);
      }

      this.currentViewMode = "orthographic";

      window.currentViewMode = "orthographic";

      this._syncActiveCameraGlobals(ortho);

      if (this.controls) {
        this.controls.object = ortho;

        this.controls.target.copy(target);

        this.controls.enabled = this._inputLockCount === 0;

        this.controls.update();
      }

      this._rememberStableView();

      if (emit) {
        this._emitViewChanged("orthographic");
      }

      this._notifyTransformControls();

      return ortho;
    }

    toggleProjection() {
      if (this.axisViewLocked) {
        this.currentAxisView = null;
        this.axisViewLocked = false;

        if (this.controls) {
          this.controls.enableRotate = true;
        }

        window.currentCameraAxis = null;
        window.cameraAxisLocked = false;

        window.updateViewportGridForAxis?.("perspective");
      }

      return this.currentViewMode === "orthographic"
        ? this.switchToPerspective({
            preserveView: true,
          })
        : this.switchToOrthographic({
            preserveView: true,
          });
    }

    // ------------------------------------------------------------
    // Axis views
    // ------------------------------------------------------------

    setAxisView(
      axis,
      {
        orthographic = true,
        distance = null,
        target = null,
        animate = false,
        duration = 0.35,
      } = {},
    ) {
      if (this.pilotedCamera) {
        this.releasePilotedCamera();
      }

      const key = String(axis || "").toLowerCase();

      const directions = {
        x: new THREE.Vector3(1, 0, 0),
        "-x": new THREE.Vector3(-1, 0, 0),

        y: new THREE.Vector3(0, 1, 0),
        "-y": new THREE.Vector3(0, -1, 0),

        z: new THREE.Vector3(0, 0, 1),
        "-z": new THREE.Vector3(0, 0, -1),
      };

      const direction = directions[key];

      if (!direction) {
        console.warn(`CameraSystem: unknown axis view "${axis}"`);

        return false;
      }

      const focus = target
        ? vectorFrom(target)
        : this.controls?.target?.clone?.() || new THREE.Vector3();

      const currentDistance =
        this.activeCamera?.position?.distanceTo?.(focus) || 15;

      const viewDistance = Math.max(1, Number(distance) || currentDistance);

      if (orthographic) {
        this.switchToOrthographic({
          preserveView: true,
          fromAxisView: true,
        });
      } else {
        this.switchToPerspective({
          preserveView: true,
          fromAxisView: true,
        });
      }

      // The actual viewport renderer must now use this same camera.
      this._syncActiveCameraGlobals(this.activeCamera);

      const cam = this.activeCamera;

      let up = new THREE.Vector3(0, 1, 0);

      if (key === "y") {
        up.set(0, 0, -1);
      } else if (key === "-y") {
        up.set(0, 0, 1);
      }

      const destination = focus
        .clone()
        .addScaledVector(direction, viewDistance);

      if (animate) {
        this.flyTo(destination, focus, duration, () => {
          cam.up.copy(up);
          cam.lookAt(focus);
          cam.updateMatrixWorld(true);
        });
      } else {
        cam.position.copy(destination);

        cam.up.copy(up);

        cam.lookAt(focus);

        cam.updateMatrixWorld(true);

        if (this.controls) {
          this.controls.target.copy(focus);

          this.controls.update();
        }
      }

      /*
       * Reassert an exact axis orientation AFTER OrbitControls.update().
       * This prevents tiny quaternion drift and gives the same crisp
       * X/Y/Z view behaviour as Blender.
       */
      cam.position.copy(destination);

      cam.up.copy(up);
      cam.lookAt(focus);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      if (this.controls) {
        this.controls.object = cam;
        this.controls.target.copy(focus);
        this.controls.update();
      }

      this._syncActiveCameraGlobals(cam);

      this.lockAxisView(key);

      // Keep every editor grid on the plane perpendicular to the selected
      // view axis, no matter whether the view came from the gizmo, numpad,
      // workspace bridge or another editor tool.
      window.updateViewportGridForAxis?.(key);

      this._notifyTransformControls();

      this._emitViewChanged(`axis:${key}`);

      window.dispatchEvent(
        new CustomEvent("sm:camera-axis-view", {
          detail: {
            axis: key,
            orthographic,
            camera: cam,
            target: focus,
          },
        }),
      );

      return true;
    }

    // ------------------------------------------------------------
    // Resize
    // ------------------------------------------------------------

    onResize() {
      const aspect = this._aspect();

      if (this.camera) {
        this.camera.aspect = aspect;

        this.camera.updateProjectionMatrix();
      }

      if (this.orthographicCamera) {
        const s = this.orthoFrustumSize;

        this.orthographicCamera.left = (s * aspect) / -2;

        this.orthographicCamera.right = (s * aspect) / 2;

        this.orthographicCamera.top = s / 2;

        this.orthographicCamera.bottom = s / -2;

        this.orthographicCamera.updateProjectionMatrix();
      }

      if (this.pilotedCamera?.isPerspectiveCamera) {
        this.pilotedCamera.aspect = aspect;

        this.pilotedCamera.updateProjectionMatrix();
      }
    }

    // ------------------------------------------------------------
    // Frame / focus
    // ------------------------------------------------------------

    frameObject(object, opts = {}) {
      if (!object) {
        return false;
      }

      const padding = Number(opts.padding ?? this.options.framePadding);

      const box = this._tmp.box;

      box.setFromObject(object, true);

      if (box.isEmpty()) {
        return false;
      }

      const size = this._tmp.size;

      const center = this._tmp.center;

      box.getSize(size);
      box.getCenter(center);

      return this.frameBox(box, {
        ...opts,
        padding,
        center,
      });
    }

    frameObjects(objects, opts = {}) {
      const list = Array.from(objects || []).filter(Boolean);

      if (!list.length) {
        return false;
      }

      const box = new THREE.Box3().makeEmpty();

      list.forEach((object) => {
        const childBox = new THREE.Box3().setFromObject(object, true);

        if (!childBox.isEmpty()) {
          box.union(childBox);
        }
      });

      if (box.isEmpty()) {
        return false;
      }

      return this.frameBox(box, opts);
    }

    frameSelection(opts = {}) {
      const selection = [];

      if (window.selectedObject) {
        selection.push(window.selectedObject);
      }

      if (Array.isArray(window.selectedObjects)) {
        window.selectedObjects.forEach((object) => {
          if (object && !selection.includes(object)) {
            selection.push(object);
          }
        });
      }

      if (!selection.length) {
        return false;
      }

      return this.frameObjects(selection, opts);
    }

    frameBox(box, opts = {}) {
      if (!box || box.isEmpty()) {
        return false;
      }

      const padding = Number(opts.padding ?? this.options.framePadding);

      const size = new THREE.Vector3();

      const center = opts.center?.isVector3
        ? opts.center.clone()
        : new THREE.Vector3();

      box.getSize(size);

      if (!opts.center) {
        box.getCenter(center);
      }

      const cam = this.activeCamera;

      const target = this.controls?.target?.clone?.() || center.clone();

      let viewDirection = cam.position.clone().sub(target);

      if (viewDirection.lengthSq() < EPS) {
        cam.getWorldDirection(viewDirection);

        viewDirection.multiplyScalar(-1);
      }

      viewDirection.normalize();

      if (cam.isPerspectiveCamera) {
        const vfov = THREE.MathUtils.degToRad(clamp(cam.fov, 1, 179));

        const aspect = Math.max(cam.aspect || this._aspect(), 0.001);

        const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);

        const halfHeight = size.y * 0.5;

        const horizontalSize = Math.max(size.x, size.z) * 0.5;

        const distanceV = halfHeight / Math.max(Math.tan(vfov / 2), 0.001);

        const distanceH = horizontalSize / Math.max(Math.tan(hfov / 2), 0.001);

        const distance = Math.max(
          this.options.minFrameDistance,
          Math.max(distanceV, distanceH) * padding,
        );

        const position = center
          .clone()
          .addScaledVector(viewDirection, distance);

        if (opts.animate === true) {
          this.flyTo(position, center, Number(opts.duration ?? 0.45));
        } else {
          cam.position.copy(position);

          cam.lookAt(center);

          if (this.controls) {
            this.controls.target.copy(center);

            this.controls.update();
          }
        }
      } else {
        const width = Math.max(size.x, size.z, 0.001) * padding;

        const height = Math.max(size.y, size.z, 0.001) * padding;

        const visibleHeight = Math.max(
          height,
          width / Math.max(this._aspect(), 0.001),
        );

        const frustumHeight =
          Math.abs(cam.top - cam.bottom) || this.orthoFrustumSize;

        cam.zoom = clamp(frustumHeight / visibleHeight, 0.01, 10000);

        const distance = Math.max(cam.position.distanceTo(target), 10);

        cam.position.copy(center).addScaledVector(viewDirection, distance);

        cam.lookAt(center);

        cam.updateProjectionMatrix();

        if (this.controls) {
          this.controls.target.copy(center);

          this.controls.update();
        }
      }

      this._rememberStableView();
      this._schedulePersist();

      window.dispatchEvent(
        new CustomEvent("sm:camera-framed", {
          detail: {
            center,
            size,
            camera: cam,
          },
        }),
      );

      return true;
    }

    setOrbitPivot(point, { preserveCamera = true } = {}) {
      if (!this.controls) {
        return false;
      }

      const pivot = vectorFrom(point);

      if (preserveCamera) {
        this.controls.target.copy(pivot);

        this.controls.update();
      } else {
        const cam = this.activeCamera;

        const offset = cam.position.clone().sub(this.controls.target);

        this.controls.target.copy(pivot);

        cam.position.copy(pivot).add(offset);

        this.controls.update();
      }

      return true;
    }

    // ------------------------------------------------------------
    // Smooth flight
    // ------------------------------------------------------------

    flyTo(
      position,
      target,
      duration = this.options.flightDuration,
      onComplete = null,
      options = {},
    ) {
      const cam = this.activeCamera;

      if (!cam) {
        return false;
      }

      this.stopFlight();

      const toPos = vectorFrom(position);

      const toTarget = vectorFrom(target);

      this._flight = {
        fromPos: cam.position.clone(),

        toPos,

        fromTarget: this.controls?.target?.clone?.() || new THREE.Vector3(),

        toTarget,

        fromQuat: cam.quaternion.clone(),

        elapsed: 0,

        duration: Math.max(0.001, Number(duration) || 0.001),

        easing:
          typeof options.easing === "function"
            ? options.easing
            : easeInOutCubic,

        onComplete,
      };

      window.dispatchEvent(
        new CustomEvent("sm:camera-flight-start", {
          detail: {
            position: toPos.clone(),
            target: toTarget.clone(),
            duration: this._flight.duration,
          },
        }),
      );

      return true;
    }

    stopFlight() {
      if (!this._flight) {
        return false;
      }

      this._flight = null;

      window.dispatchEvent(new CustomEvent("sm:camera-flight-cancelled"));

      return true;
    }

    // ------------------------------------------------------------
    // Piloting scene cameras
    // ------------------------------------------------------------

    pilotCamera(camera, { preserveEditorView = true } = {}) {
      if (!camera || !camera.isCamera) {
        return false;
      }

      if (camera === this.pilotedCamera) {
        return true;
      }

      if (this.pilotedCamera) {
        this.releasePilotedCamera();
      }

      if (preserveEditorView) {
        this._prePilotState = this.captureViewState();
      }

      this.pilotedCamera = camera;

      // Renderer compatibility: piloted camera becomes active global.
      this._syncActiveCameraGlobals(camera);

      camera.userData ||= {};

      camera.userData.isPilotedCamera = true;

      if (this.controls) {
        this.controls.object = camera;

        const direction = new THREE.Vector3();

        camera.getWorldDirection(direction);

        const target = camera.position.clone().addScaledVector(direction, 5);

        this.controls.target.copy(target);

        this.controls.enabled = this._inputLockCount === 0;

        this.controls.update();
      }

      window._isInsideCamera = true;

      window._viewedCamera = camera;

      window.dispatchEvent(
        new CustomEvent("sm:camera-pilot-start", {
          detail: {
            camera,
          },
        }),
      );

      return true;
    }

    releasePilotedCamera({ restoreEditorView = true } = {}) {
      if (!this.pilotedCamera) {
        return false;
      }

      const previous = this.pilotedCamera;

      if (previous.userData) {
        delete previous.userData.isPilotedCamera;
      }

      this.pilotedCamera = null;

      this._syncActiveCameraGlobals(
        this.currentViewMode === "orthographic"
          ? this.orthographicCamera
          : this.camera,
      );

      window._isInsideCamera = false;

      window._viewedCamera = null;

      if (restoreEditorView && this._prePilotState) {
        this.applyViewState(this._prePilotState, {
          emit: false,
        });
      } else if (this.controls) {
        this.controls.object =
          this.currentViewMode === "orthographic"
            ? this.orthographicCamera
            : this.camera;

        this.controls.update();
      }

      this._prePilotState = null;

      this._emitViewChanged("pilot-release");

      window.dispatchEvent(
        new CustomEvent("sm:camera-pilot-end", {
          detail: {
            camera: previous,
          },
        }),
      );

      return true;
    }

    // ------------------------------------------------------------
    // Bookmarks
    // ------------------------------------------------------------

    saveBookmark(name) {
      if (!name) {
        return false;
      }

      const state = this.captureViewState();

      this._bookmarks.set(String(name), state);

      window.smCameraBookmarkStore?.save?.(String(name), state);

      return true;
    }

    recallBookmark(name, { animate = true, duration = 0.55 } = {}) {
      const key = String(name);

      let state = this._bookmarks.get(key);

      if (!state) {
        state = window.smCameraBookmarkStore?.get?.(key) || null;

        if (state) {
          this._bookmarks.set(key, state);
        }
      }

      if (!state) {
        console.warn(`CameraSystem: no bookmark named "${name}"`);

        return false;
      }

      if (state.mode && state.mode !== this.currentViewMode) {
        state.mode === "orthographic"
          ? this.switchToOrthographic({
              preserveView: false,
            })
          : this.switchToPerspective({
              preserveView: false,
            });
      }

      const target = vectorFrom(state.target);

      const position = vectorFrom(state.position);

      if (animate) {
        this.flyTo(position, target, duration, () => {
          const cam = this.activeCamera;

          if (cam.isPerspectiveCamera && Number.isFinite(state.fov)) {
            cam.fov = state.fov;
          }

          if (Number.isFinite(state.zoom)) {
            cam.zoom = state.zoom;
          }

          cam.updateProjectionMatrix();
        });
      } else {
        this.applyViewState(state);
      }

      return true;
    }

    listBookmarks() {
      const keys = new Set(this._bookmarks.keys());

      window.smCameraBookmarkStore?.list?.()?.forEach?.((key) => keys.add(key));

      return Array.from(keys);
    }

    deleteBookmark(name) {
      this._bookmarks.delete(String(name));

      window.smCameraBookmarkStore?.remove?.(String(name));
    }

    // ------------------------------------------------------------
    // FOV / zoom / dolly
    // ------------------------------------------------------------

    setFov(fov) {
      if (!this.camera) {
        return false;
      }

      this.camera.fov = clamp(Number(fov) || 50, 1, 179);

      this.camera.updateProjectionMatrix();

      this._schedulePersist();

      return this.camera.fov;
    }

    dolly(delta) {
      if (!this.controls) {
        return false;
      }

      const cam = this.activeCamera;

      const target = this.controls.target;

      const direction = target.clone().sub(cam.position);

      const distance = direction.length();

      if (distance < EPS) {
        return false;
      }

      direction.normalize();

      const nextDistance = clamp(
        distance - Number(delta || 0),
        this.options.minDistance,
        this.options.maxDistance,
      );

      cam.position.copy(target).addScaledVector(direction, -nextDistance);

      this.controls.update();

      return true;
    }

    dollyToPoint(point, amount) {
      const cam = this.activeCamera;

      const focus = vectorFrom(point);

      const factor = clamp(Number(amount) || 0, -0.95, 0.95);

      cam.position.lerp(focus, factor);

      if (this.controls) {
        this.controls.target.lerp(focus, Math.abs(factor) * 0.45);

        this.controls.update();
      }

      return true;
    }

    // ------------------------------------------------------------
    // Camera shake
    // ------------------------------------------------------------

    shake(intensity = 0.22, duration = 0.35, options = {}) {
      const cam = this.activeCamera;

      if (!cam) {
        return false;
      }

      this._shake = {
        intensity: Math.max(0, Number(intensity) || 0),

        duration: Math.max(0.01, Number(duration) || 0.35),

        elapsed: 0,

        frequency: Math.max(1, Number(options.frequency) || 22),

        rotational: Math.max(0, Number(options.rotational) || 0.0025),

        phase: Math.random() * Math.PI * 2,
      };

      return true;
    }

    stopShake() {
      this._removeShakeOffset();
      this._shake = null;
    }

    _removeShakeOffset() {
      if (this._shakeOffset.lengthSq() > EPS && this.activeCamera) {
        this.activeCamera.position.sub(this._shakeOffset);

        this._shakeOffset.set(0, 0, 0);
      }
    }

    _applyShake(delta) {
      const shake = this._shake;

      const cam = this.activeCamera;

      if (!shake || !cam) {
        return;
      }

      this._removeShakeOffset();

      shake.elapsed += delta;

      const t = clamp(shake.elapsed / shake.duration, 0, 1);

      if (t >= 1) {
        this._shake = null;

        return;
      }

      const falloff = Math.pow(1 - t, 1.8);

      const time = shake.elapsed * shake.frequency * Math.PI * 2 + shake.phase;

      const amplitude = shake.intensity * falloff;

      this._shakeOffset.set(
        Math.sin(time) * amplitude * 0.55,

        Math.sin(time * 1.37 + 1.2) * amplitude * 0.42,

        Math.sin(time * 0.73 + 2.4) * amplitude * 0.36,
      );

      cam.position.add(this._shakeOffset);

      cam.updateMatrixWorld(true);
    }

    // ------------------------------------------------------------
    // Persistence
    // ------------------------------------------------------------

    _schedulePersist() {
      if (this.options.persistEditorView === false) {
        return;
      }

      clearTimeout(this._persistTimer);

      this._persistTimer = setTimeout(() => this._persistView(), 160);
    }

    _persistView() {
      if (this.options.persistEditorView === false || this.pilotedCamera) {
        return;
      }

      try {
        localStorage.setItem(
          this.options.persistKey,
          JSON.stringify(this.captureViewState()),
        );
      } catch (_) {}
    }

    _restorePersistedView() {
      if (this.options.persistEditorView === false) {
        return false;
      }

      try {
        const raw = localStorage.getItem(this.options.persistKey);

        if (!raw) {
          return false;
        }

        const state = JSON.parse(raw);

        return this.applyViewState(state, {
          emit: false,
        });
      } catch (_) {
        return false;
      }
    }

    // ------------------------------------------------------------
    // Update
    // ------------------------------------------------------------

    update(delta) {
      const dt = Math.min(0.05, Math.max(0, Number(delta) || 0));

      if (this._flight) {
        const flight = this._flight;

        flight.elapsed += dt;

        const t = clamp(flight.elapsed / flight.duration, 0, 1);

        const eased = flight.easing(t);

        const cam = this.activeCamera;

        cam.position.lerpVectors(flight.fromPos, flight.toPos, eased);

        if (this.controls) {
          this.controls.target.lerpVectors(
            flight.fromTarget,
            flight.toTarget,
            eased,
          );

          this.controls.update();
        } else {
          cam.lookAt(flight.toTarget);
        }

        if (t >= 1) {
          const cb = flight.onComplete;

          this._flight = null;

          this._rememberStableView();
          this._schedulePersist();

          window.dispatchEvent(new CustomEvent("sm:camera-flight-end"));

          if (cb) {
            try {
              cb();
            } catch (error) {
              console.warn("[CameraSystem] flyTo callback failed:", error);
            }
          }
        }
      }

      this._applyShake(dt);
    }

    // ------------------------------------------------------------
    // Compatibility + utilities
    // ------------------------------------------------------------

    _notifyTransformControls() {
      try {
        if (typeof window.updateTransformControlsForActiveView === "function") {
          window.updateTransformControlsForActiveView();
        } else if (typeof updateTransformControlsForActiveView === "function") {
          updateTransformControlsForActiveView();
        }
      } catch (_) {}
    }

    _emitViewChanged(source) {
      window.dispatchEvent(
        new CustomEvent("sm:camera-view-changed", {
          detail: {
            mode: this.currentViewMode,
            camera: this.activeCamera,
            source,
            piloting: !!this.pilotedCamera,
          },
        }),
      );
    }

    debug() {
      const cam = this.activeCamera;

      console.table({
        Mode: this.currentViewMode,

        Piloting: this.pilotedCamera?.name || false,

        Profile: this._navigationProfile,

        "Axis View": this.currentAxisView || false,

        "Axis Locked": this.axisViewLocked,

        "Global camera active": window.camera === this.activeCamera,

        Position: cam?.position
          ?.toArray?.()
          ?.map((v) => Number(v.toFixed(2)))
          ?.join(", "),

        Target: this.controls?.target
          ?.toArray?.()
          ?.map((v) => Number(v.toFixed(2)))
          ?.join(", "),

        FOV: cam?.isPerspectiveCamera ? cam.fov : "ORTHO",

        Zoom: cam?.zoom,

        Flight: !!this._flight,

        Shake: !!this._shake,
      });
    }

    dispose() {
      this._disposed = true;

      clearTimeout(this._persistTimer);

      this.stopFlight();
      this.stopShake();

      try {
        this.controls?.dispose?.();
      } catch (_) {}

      if (this.orthographicCamera?.parent) {
        this.orthographicCamera.parent.remove(this.orthographicCamera);
      }

      this.controls = null;
    }
  }

  window.CameraSystem = CameraSystem;

  window.SMCameraNavigationProfiles = NAVIGATION_PROFILES;
})();
