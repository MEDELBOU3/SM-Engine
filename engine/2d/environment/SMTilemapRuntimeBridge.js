/* SMTilemapRuntimeBridge.js
 * SimpleMDEngine - Tilemap ↔ 2D Runtime Bridge
 * Version 1.0.0
 *
 * Purpose:
 * - Connect SMTilemapSystem GameObjects to the active 2D scene.
 * - Keep tilemaps selectable/movable through common editor APIs.
 * - Re-render tilemaps after transform/property changes.
 * - Provide safe save/serialize helpers.
 *
 * Load after:
 *   engine/2d/environment/SMTilemapSystem.js
 *   engine/2d/editor/SMTilemapEditor.js
 */
(function (root) {
  'use strict';

  const VERSION = '1.0.0';

  function system() {
    return root.smTilemapSystem || root.SMTilemapSystem?.instance || null;
  }

  function isTilemapObject(obj) {
    return !!(obj?.userData?.is2DTilemap ||
      obj?.userData?.smComponent === 'Tilemap' ||
      obj?.userData?.tilemap);
  }

  function getTilemap(obj) {
    return obj?.userData?.tilemap || obj?.tilemap || null;
  }

  function activeScene() {
    return root.scene2D || root.scene || root.currentScene || null;
  }

  function selectObject(obj) {
    if (!obj) return;

    root.selectedObject = obj;
    root.selectedGameObject = obj;

    try { root.transformControls?.attach?.(obj); } catch (_) {}
    try { root.transformControl?.attach?.(obj); } catch (_) {}

    const hierarchy = root.hierarchyPanel || root.smHierarchyPanel;
    try { hierarchy?.selectObject?.(obj); } catch (_) {}
    try { hierarchy?.setSelected?.(obj); } catch (_) {}

    try {
      root.dispatchEvent(new CustomEvent('sm:object-selected', {
        detail: { object: obj }
      }));
    } catch (_) {}
  }

  function addToScene(obj) {
    const scene = activeScene();
    if (!obj || !scene) return false;

    if (obj.parent !== scene) {
      try { scene.add(obj); } catch (_) { return false; }
    }
    return true;
  }

  function refresh(obj) {
    if (!isTilemapObject(obj)) return false;
    const map = getTilemap(obj);
    const sm = system();
    if (!map || !sm) return false;

    try {
      sm.render(map);
      return true;
    } catch (error) {
      console.error('[Tilemap Runtime] render failed:', error);
      return false;
    }
  }

  function attachTilemap(map, position) {
    const sm = system();
    if (!sm?.createGameObject) {
      throw new Error('SMTilemapSystem.createGameObject() is unavailable.');
    }

    const obj = sm.createGameObject(map);

    if (position) {
      obj.position.x = Number(position.x) || 0;
      obj.position.y = Number(position.y) || 0;
      if (position.z != null) obj.position.z = Number(position.z) || 0;
    }

    addToScene(obj);
    selectObject(obj);
    refresh(obj);

    root.dispatchEvent(new CustomEvent('sm:tilemap-runtime-attached', {
      detail: { tilemap: map, object: obj }
    }));

    return obj;
  }

  function createAndAttach(options) {
    const sm = system();
    if (!sm?.createTilemap) {
      throw new Error('SMTilemapSystem.createTilemap() is unavailable.');
    }

    return Promise.resolve(sm.createTilemap(options)).then(map => {
      const obj = attachTilemap(map, options?.position);
      return { tilemap: map, object: obj };
    });
  }

  function openEditor(obj) {
    const map = getTilemap(obj);
    if (!map) return null;

    if (typeof root.openTilemapEditor === 'function') {
      return root.openTilemapEditor(map);
    }

    root.dispatchEvent(new CustomEvent('sm:open-tilemap-editor', {
      detail: { tilemap: map, object: obj }
    }));

    return map;
  }

  function serialize(obj) {
    const map = getTilemap(obj);
    const sm = system();
    if (!map || !sm?.serialize) return null;
    return sm.serialize(map);
  }

  function installTransformRefresh() {
    if (root.__smTilemapRuntimeBridgeInstalled) return;
    root.__smTilemapRuntimeBridgeInstalled = true;

    /*
     * These events are intentionally generic. Existing editor code may emit
     * any of them when transforms change. We refresh only tilemap objects.
     */
    [
      'sm:transform-changed',
      'sm:object-transform-changed',
      'object-transform-changed'
    ].forEach(eventName => {
      root.addEventListener(eventName, e => {
        const obj = e.detail?.object || e.detail?.selectedObject || root.selectedObject;
        if (isTilemapObject(obj)) refresh(obj);
      });
    });

    root.addEventListener('sm:object-selected', e => {
      const obj = e.detail?.object;
      if (isTilemapObject(obj)) refresh(obj);
    });

    /*
     * Double-clicking a tilemap opens the tilemap editor, while normal
     * selection remains available to the existing editor.
     */
    root.addEventListener('dblclick', e => {
      const obj = e.target?.object3D || e.detail?.object || root.selectedObject;
      if (isTilemapObject(obj)) openEditor(obj);
    }, true);
  }

  root.SMTilemapRuntimeBridge = {
    version: VERSION,
    isTilemapObject,
    getTilemap,
    selectObject,
    addToScene,
    refresh,
    attachTilemap,
    createAndAttach,
    openEditor,
    serialize
  };

  root.attachTilemapTo2DScene = attachTilemap;
  root.createAndAttach2DTilemap = createAndAttach;
  root.open2DTilemapEditor = openEditor;
  root.serialize2DTilemap = serialize;

  installTransformRefresh();

  root.dispatchEvent(new CustomEvent('sm:tilemap-runtime-bridge-ready', {
    detail: { version: VERSION }
  }));

})(window);
