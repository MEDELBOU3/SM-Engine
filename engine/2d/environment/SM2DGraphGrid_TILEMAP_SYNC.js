/*
 * SM2DGraphGrid_TILEMAP_SYNC.js
 * Keeps the existing 2D Graph Grid perfectly aligned with Tilemap cells.
 * Version 1.0.0
 */
(function (root) {
  'use strict';

  const VERSION = '1.0.0';

  function rebuild(grid, step) {
    if (!grid || !root.THREE) return;
    step = Math.max(0.0001, Number(step) || 1);

    const extent = Math.max(10, Number(grid.userData?.gridConfig?.extent) || 100);
    const majorStep = Math.max(step, step * 5);
    const minor = grid.getObjectByName('2DGrid_Minor');
    const major = grid.getObjectByName('2DGrid_Major');

    function updateLine(line, lineStep, isMajor) {
      if (!line) return;
      const pts = [];
      const count = Math.ceil(extent / lineStep);
      for (let i = -count; i <= count; i++) {
        const v = i * lineStep;
        if (Math.abs(v) > extent + 1e-6) continue;
        pts.push(
          new root.THREE.Vector3(v, -extent, 0),
          new root.THREE.Vector3(v, extent, 0),
          new root.THREE.Vector3(-extent, v, 0),
          new root.THREE.Vector3(extent, v, 0)
        );
      }
      line.geometry?.dispose?.();
      line.geometry = new root.THREE.BufferGeometry().setFromPoints(pts);
      line.frustumCulled = false;
      line.renderOrder = isMajor ? 901 : 900;
    }

    updateLine(minor, step, false);
    updateLine(major, majorStep, true);

    grid.userData.gridConfig = {
      ...(grid.userData.gridConfig || {}),
      minorStep: step,
      majorStep
    };
    grid.userData.tilemapCellSize = step;
    grid.userData.tilemapGridSynchronized = true;
    grid.updateMatrixWorld?.(true);
  }

  function sync(tm) {
    const grid = root.scene?.getObjectByName?.('gameModeGrid2D') || root.gameModeGrid2D;
    if (!grid || !tm) return;
    const ppu = Number(tm.pixelsPerUnit) || 32;
    const sx = (Number(tm.tileWidth) || 32) / ppu;
    const sy = (Number(tm.tileHeight) || 32) / ppu;
    // The tilemap uses square-cell drawing. If a rectangular tile is used,
    // choose X as the primary grid spacing and expose both values globally.
    root.sm2DGridCellSizeX = sx;
    root.sm2DGridCellSizeY = sy;
    rebuild(grid, sx);
  }

  root.SM2DGraphGridTilemapSync = { version: VERSION, sync, rebuild };
  root.addEventListener('sm:tilemap-grid-sync', e => sync(e.detail?.tilemap));
  root.addEventListener('sm:2d-workspace-ready', () => {
    const tm = root.smTilemapSystem?.get?.() || root.SMTilemapSystem?.get?.();
    if (tm) sync(tm);
  });

  console.log('[SM2DGraphGrid_TILEMAP_SYNC] loaded.');
})(window);
