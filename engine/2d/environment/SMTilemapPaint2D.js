/*
 * SMTilemapPaint2D.js
 * SimpleMDEngine - direct 2D Tilemap painting on the GAME DEV viewport.
 * Version 5.0.0
 *
 * Goals:
 * - Mouse position is calculated from the real renderer viewport.
 * - Brush snaps to SMTilemapSystem.worldToCell()/cellToWorld().
 * - Brush can be enabled/disabled.
 * - Brush size can be 1..8 cells (square).
 * - Selected tiles are previewed directly over the grid.
 * - Map width/height can be resized from the panel.
 */
(function (root) {
  'use strict';

  const VERSION = '5.0.0';
  const ID = 'sm-tilemap-paint-ui';
  const BRUSH_ID = 'sm-tilemap-brush-cell';
  const PREVIEW_ID = '__SMTilemapBrushPreview';

  function system() {
    return root.smTilemapSystem || root.SMTilemapSystem || null;
  }

  function getTilemap() {
    const sm = system();
    if (!sm) return null;
    const candidates = [root.selectedObject, root.selectedGameObject, root.activeObject];
    for (const obj of candidates) {
      if (!obj?.userData?.is2DTilemap) continue;
      const tm = sm.get?.(obj.userData.tilemapId) || obj.userData.tilemap || null;
      if (tm) return tm;
    }
    return sm.get?.() || null;
  }

  function canvas() {
    return root.renderer?.domElement || document.querySelector('#renderer-container canvas, canvas');
  }

  function camera() {
    return root.camera2D || root.v2dManager?.camera || root.camera;
  }

  function insideCanvas(e) {
    const c = canvas();
    if (!c) return false;
    const r = c.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  function tileWorldSize(tm) {
    const ppu = Number(tm?.pixelsPerUnit) || 32;
    return {
      x: (Number(tm?.tileWidth) || 32) / ppu,
      y: (Number(tm?.tileHeight) || 32) / ppu
    };
  }

  function syncGridCellSize(tm) {
    if (!tm) return;
    const s = tileWorldSize(tm);
    root.sm2DGridCellSize = Math.min(s.x, s.y);
    root.sm2DGridCellSizeX = s.x;
    root.sm2DGridCellSizeY = s.y;
    root.sm2DGridTilemapId = tm.id;
    root.dispatchEvent(new CustomEvent('sm:tilemap-grid-sync', {
      detail: { tilemap: tm, cellWidth: s.x, cellHeight: s.y }
    }));
  }

  function screenToWorld(e) {
    const c = canvas();
    const cam = camera();
    if (!c || !cam || !root.THREE) return null;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;

    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;

    // Ray/plane intersection is the authoritative mouse -> 2D world mapping.
    // This avoids the old zoom/viewport offset mismatch.
    const T = root.THREE;
    const raycaster = screenToWorld.__raycaster || (screenToWorld.__raycaster = new T.Raycaster());
    const plane = screenToWorld.__plane || (screenToWorld.__plane = new T.Plane(new T.Vector3(0, 0, 1), 0));
    const hit = screenToWorld.__hit || (screenToWorld.__hit = new T.Vector3());
    raycaster.setFromCamera(new T.Vector2(nx, ny), cam);
    if (raycaster.ray.intersectPlane(plane, hit)) return { x: hit.x, y: hit.y };
    return null;
  }

  function projectWorldToScreen(p) {
    const c = canvas();
    const cam = camera();
    if (!c || !cam || !root.THREE || !p) return null;
    const v = p.clone ? p.clone() : new root.THREE.Vector3(p.x, p.y, p.z || 0);
    v.project(cam);
    const r = c.getBoundingClientRect();
    return {
      x: r.left + (v.x + 1) * 0.5 * r.width,
      y: r.top + (1 - v.y) * 0.5 * r.height
    };
  }

  function localCellCorners(tm, x, y) {
    const s = tileWorldSize(tm);
    const x0 = x * s.x - tm.width * s.x / 2;
    const x1 = x0 + s.x;
    const y1 = (tm.height - y) * s.y - tm.height * s.y / 2;
    const y0 = y1 - s.y;
    const T = root.THREE;
    return [
      new T.Vector3(x0, y0, 0),
      new T.Vector3(x1, y0, 0),
      new T.Vector3(x1, y1, 0),
      new T.Vector3(x0, y1, 0)
    ];
  }

  function worldCellCorners(tm, x, y) {
    const pts = localCellCorners(tm, x, y);
    if (tm.object?.localToWorld) pts.forEach(p => tm.object.localToWorld(p));
    return pts;
  }

  function brushSize() {
    // Always a square brush. The value is the side length in grid cells:
    // 1x1 = 1 cell, 2x2 = 4 cells, 4x4 = 16 cells, etc.
    const allowed = [1, 2, 4, 8, 16];
    const n = Math.floor(Number(root.__smTilemapBrushSize) || 1);
    return allowed.reduce((best, v) => Math.abs(v - n) < Math.abs(best - n) ? v : best, 1);
  }

  function brushOrigin(tm, cell) {
    const n = brushSize();
    // Always keep the complete square inside the map. The cursor chooses the
    // nearest valid anchor cell, but the brush itself is NEVER clipped.
    const maxX = Math.max(0, tm.width - n);
    const maxY = Math.max(0, tm.height - n);
    let ox = Math.floor(cell.x - Math.floor(n / 2));
    let oy = Math.floor(cell.y - Math.floor(n / 2));
    ox = Math.max(0, Math.min(maxX, ox));
    oy = Math.max(0, Math.min(maxY, oy));
    return { x: ox, y: oy, size: n };
  }

  function brushCells(tm, cell) {
    const o = brushOrigin(tm, cell);
    const cells = [];
    for (let y = o.y; y < o.y + o.size; y++) {
      for (let x = o.x; x < o.x + o.size; x++) {
        if (x >= 0 && y >= 0 && x < tm.width && y < tm.height) cells.push({ x, y });
      }
    }
    return cells;
  }

  function removeBrush() {
    document.getElementById(BRUSH_ID)?.remove();
    hidePreview();
    root.__smTilemapBrushCell = null;
  }

  function updateBrush(tm, cell) {
    if (!tm || !cell?.inside || !root.__smTilemapBrushEnabled) {
      removeBrush();
      return;
    }

    root.__smTilemapBrushCell = { x: cell.x, y: cell.y, inside: true };
    const cells = brushCells(tm, cell);
    if (!cells.length) { removeBrush(); return; }

    const projected = [];
    for (const c of cells) {
      for (const p of worldCellCorners(tm, c.x, c.y)) {
        const q = projectWorldToScreen(p);
        if (q) projected.push(q);
      }
    }
    if (!projected.length) return;

    let el = document.getElementById(BRUSH_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BRUSH_ID;
      document.body.appendChild(el);
    }

    const xs = projected.map(p => p.x), ys = projected.map(p => p.y);
    const left = Math.min(...xs), top = Math.min(...ys);
    const right = Math.max(...xs), bottom = Math.max(...ys);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${Math.max(1, right - left)}px`;
    el.style.height = `${Math.max(1, bottom - top)}px`;
    el.style.display = 'block';

    updatePreview(tm, cells);
  }

  function ensurePreviewGroup() {
    if (!root.scene || !root.THREE) return null;
    let group = root.__smTilemapBrushPreviewGroup;
    if (group?.parent) return group;
    group = new root.THREE.Group();
    group.name = PREVIEW_ID;
    group.renderOrder = 1100;
    group.frustumCulled = false;
    group.userData = { isSystemObject: true, isEditorHelper: true, tilemapBrushPreview: true };
    root.scene.add(group);
    root.__smTilemapBrushPreviewGroup = group;
    return group;
  }

  function hidePreview() {
    const group = root.__smTilemapBrushPreviewGroup;
    if (group) group.visible = false;
  }

  function clearPreviewChildren(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  }

  function makeTilePreview(tm, x, y) {
    const T = root.THREE;
    const s = tileWorldSize(tm);
    const center = system()?.cellToWorld(tm, x, y);
    if (!center) return null;

    const geo = new T.PlaneGeometry(s.x, s.y);
    const uv = geo.getAttribute('uv');
    const cols = Math.max(1, Number(tm.tilesetColumns) || 1);
    const rows = Math.max(1, Number(tm.tilesetRows) || 1);
    const tile = Math.max(0, Math.floor(Number(root.__smTilemapSelectedTile) || 0));
    const tx = tile % cols;
    const ty = Math.floor(tile / cols);
    const u0 = tx / cols, u1 = (tx + 1) / cols;
    const v0 = 1 - (ty + 1) / rows, v1 = 1 - ty / rows;
    const arr = [u0, v0, u1, v0, u1, v1, u0, v1];
    for (let i = 0; i < 8; i++) uv.array[i] = arr[i];
    uv.needsUpdate = true;

    const mat = new T.MeshBasicMaterial({
      map: tm._texture || null,
      transparent: true,
      opacity: 0.72,
      side: T.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.renderOrder = 1100;
    return mesh;
  }

  function updatePreview(tm, cells) {
    const group = ensurePreviewGroup();
    if (!group) return;
    clearPreviewChildren(group);
    if (!tm._texture || !root.__smTilemapBrushEnabled || !cells.length) {
      group.visible = false;
      return;
    }

    // One image stamp fills the COMPLETE brush square. For NxN brushes the
    // selected tile is treated as the top-left tile of the stamp, so the
    // preview shows the real source image chunk instead of stretching one
    // tile and instead of leaving empty/transparent cells.
    const n = brushSize();
    const origin = brushOrigin(tm, root.__smTilemapBrushCell || cells[0]);
    const s = tileWorldSize(tm);
    const center = system()?.cellToWorld(
      origin.x + (n - 1) / 2,
      origin.y + (n - 1) / 2
    );
    if (!center) { group.visible = false; return; }

    const T = root.THREE;
    const geo = new T.PlaneGeometry(n * s.x, n * s.y);
    const uv = geo.getAttribute('uv');
    const cols = Math.max(1, Number(tm.tilesetColumns) || 1);
    const rows = Math.max(1, Number(tm.tilesetRows) || 1);
    const tile = Math.max(0, Math.floor(Number(root.__smTilemapSelectedTile) || 0));
    const tx = tile % cols;
    const ty = Math.floor(tile / cols);

    // Source image region = NxN tiles beginning at selected tile.
    const u0 = tx / cols;
    const v1 = 1 - ty / rows;
    const u1 = Math.min(1, (tx + n) / cols);
    const v0 = Math.max(0, 1 - (ty + n) / rows);
    const arr = [u0, v0, u1, v0, u1, v1, u0, v1];
    for (let i = 0; i < 8; i++) uv.array[i] = arr[i];
    uv.needsUpdate = true;

    const mat = new T.MeshBasicMaterial({
      map: tm._texture,
      transparent: true,
      opacity: 0.88,
      side: T.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.position.z = 0.11;
    mesh.renderOrder = 1100;
    mesh.userData = {
      tilemapBrushPreview: true,
      brushWidth: n,
      brushHeight: n,
      sourceTile: tile
    };
    group.add(mesh);
    group.visible = true;
    group.renderOrder = 1100;
  }

  function paintAt(e) {
    if (!root.__smTilemapBrushEnabled) return false;
    const tm = getTilemap();
    const sm = system();
    if (!tm || !sm) return false;
    const world = screenToWorld(e);
    if (!world) return false;
    const cell = sm.worldToCell(tm, world.x, world.y);
    if (!cell?.inside) return false;

    updateBrush(tm, cell);
    const tool = root.__smTilemapPaintTool || 'brush';
    const origin = brushOrigin(tm, cell);
    const n = origin.size;
    const baseTile = Number.isFinite(Number(root.__smTilemapSelectedTile))
      ? Math.floor(Number(root.__smTilemapSelectedTile)) : 0;
    const cols = Math.max(1, Number(tm.tilesetColumns) || 1);
    const rows = Math.max(1, Number(tm.tilesetRows) || 1);

    if (tool === 'fill') {
      sm.fill(tm, cell.x, cell.y, baseTile, tm.activeLayerId);
      return true;
    }

    for (let by = 0; by < n; by++) {
      for (let bx = 0; bx < n; bx++) {
        const x = origin.x + bx;
        const y = origin.y + by;
        if (x < 0 || y < 0 || x >= tm.width || y >= tm.height) continue;

        if (tool === 'erase') {
          sm.erase(tm, x, y, 0, tm.activeLayerId);
        } else {
          // Stamp the actual source-image tiles across the whole brush.
          // If the selected source tile is too close to the right/bottom edge
          // of the tileset, fall back to the selected tile for that cell.
          const tx = (baseTile % cols) + bx;
          const ty = Math.floor(baseTile / cols) + by;
          const stampTile = (tx < cols && ty < rows)
            ? ty * cols + tx
            : baseTile;
          sm.setTile(tm, x, y, stampTile, tm.activeLayerId);
        }
      }
    }
    return true;
  }

  function collectTilesetInfo(tm) {
    return {
      cols: Math.max(1, Number(tm?.tilesetColumns) || 1),
      rows: Math.max(1, Number(tm?.tilesetRows) || 1)
    };
  }

  async function loadPalette(tm, palette) {
    const sm = system();
    if (!sm || !tm?.tilesetAssetId || !palette) return;
    try {
      const source = await sm.resolveSource(tm.tilesetAssetId);
      const img = await sm.loadImage(source, `paint:${tm.tilesetAssetId}`);
      const info = collectTilesetInfo(tm);
      const tileW = Number(tm.tileWidth) || 32;
      const tileH = Number(tm.tileHeight) || 32;
      const scale = Math.min(1, 168 / Math.max(img.width, img.height));
      palette.width = Math.max(1, Math.round(img.width * scale));
      palette.height = Math.max(1, Math.round(img.height * scale));
      const ctx = palette.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, palette.width, palette.height);
      ctx.drawImage(img, 0, 0, palette.width, palette.height);
      palette.__tmScale = scale;
      palette.__info = info;
      palette.__tileW = tileW;
      palette.__tileH = tileH;
      palette.title = `${img.width}x${img.height} — ${info.cols}x${info.rows} tiles`;
    } catch (err) {
      console.warn('[SMTilemapPaint2D] Palette load failed:', err);
    }
  }

  function setBrushEnabled(enabled) {
    root.__smTilemapBrushEnabled = !!enabled;
    const btn = document.querySelector(`#${ID} [data-action="toggle-brush"]`);
    if (btn) {
      btn.textContent = root.__smTilemapBrushEnabled ? 'Brush ON' : 'Brush OFF';
      btn.classList.toggle('active', root.__smTilemapBrushEnabled);
    }
    const status = document.querySelector(`#${ID} .sm-tmp-status`);
    if (status) status.textContent = root.__smTilemapBrushEnabled ? 'GRID SNAP' : 'SELECT MODE';
    if (!root.__smTilemapBrushEnabled) removeBrush();
  }

  function applyBrushSize(n) {
    const allowed = [1, 2, 4, 8, 16];
    const wanted = Math.floor(Number(n) || 1);
    root.__smTilemapBrushSize = allowed.reduce((best, v) => Math.abs(v - wanted) < Math.abs(best - wanted) ? v : best, 1);
    const tm = getTilemap();
    if (tm && root.__smTilemapBrushEnabled && root.__smTilemapBrushCell) {
      updateBrush(tm, root.__smTilemapBrushCell);
    }
    const label = document.querySelector(`#${ID} .sm-tmp-brush-size-value`);
    if (label) label.textContent = `${brushSize()}×${brushSize()}`;
  }

  function resizeMap(tm, w, h) {
    const sm = system();
    if (!sm?.resize || !tm) return;
    w = Math.max(1, Math.min(512, Math.floor(Number(w) || tm.width)));
    h = Math.max(1, Math.min(512, Math.floor(Number(h) || tm.height)));
    if (w === tm.width && h === tm.height) return;
    sm.resize(tm, w, h);
    syncGridCellSize(tm);
    root.dispatchEvent(new CustomEvent('sm:tilemap-map-resized', { detail: { tilemap: tm, width: w, height: h } }));
    refresh(false);
  }

  function buildUI(tm) {
    document.getElementById(ID)?.remove();
    document.getElementById('sm-tilemap-paint-style')?.remove();

    const wrap = document.createElement('div');
    wrap.id = ID;
    wrap.innerHTML = `
      <div class="sm-tmp-head"><b>Tilemap Paint</b><span class="sm-tmp-status">GRID SNAP · IMAGE STAMP</span></div>
      <div class="sm-tmp-row"><button data-action="toggle-brush" class="active">Brush ON</button><button data-tool="brush" class="active">Paint</button><button data-tool="erase">Erase</button><button data-tool="fill">Fill</button></div>
      <div class="sm-tmp-section"><label>Brush Size <b class="sm-tmp-brush-size-value">1×1</b></label><select class="sm-tmp-brush-size"><option value="1">1×1 · 1 cell</option><option value="2">2×2 · 4 cells</option><option value="4">4×4 · 16 cells</option><option value="8">8×8 · 64 cells</option><option value="16">16×16 · 256 cells</option></select></div>
      <canvas class="sm-tmp-palette" width="128" height="128"></canvas>
      <div class="sm-tmp-info">Tile 0 · <span class="sm-tmp-size"></span></div>
      <div class="sm-tmp-section sm-tmp-map"><label>Map Size</label><div><input class="sm-tmp-map-w" type="number" min="1" max="512" value="${tm.width}"><span>×</span><input class="sm-tmp-map-h" type="number" min="1" max="512" value="${tm.height}"><button data-action="resize">Apply</button></div></div>
    `;

    const style = document.createElement('style');
    style.id = 'sm-tilemap-paint-style';
    style.textContent = `
      #${ID}{position:fixed;left:12px;top:72px;width:204px;padding:8px;z-index:2147482800;background:rgba(20,24,31,.96);border:1px solid rgba(255,255,255,.14);border-radius:7px;box-shadow:0 12px 30px rgba(0,0,0,.45);font:11px Arial;color:#dbe4ee;user-select:none;}
      #${ID} .sm-tmp-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.sm-tmp-status{font-size:8px;color:#38bdf8;letter-spacing:.08em}
      #${ID} .sm-tmp-row{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:7px}#${ID} button{border:1px solid #3b4653;background:#252d37;color:#cbd5e1;border-radius:4px;padding:4px 6px;cursor:pointer;font-size:10px}#${ID} button:hover,#${ID} button.active{background:#334155;color:#fff;border-color:#64748b}
      #${ID} .sm-tmp-section{margin:6px 0}.sm-tmp-section label{display:flex;justify-content:space-between;color:#94a3b8;margin-bottom:4px}.sm-tmp-brush-size{width:100%;box-sizing:border-box;background:#111820;color:#dbe4ee;border:1px solid #3b4653;border-radius:4px;padding:4px}
      #${ID} .sm-tmp-palette{display:block;width:168px;max-height:120px;object-fit:contain;image-rendering:pixelated;background:#111820;border:1px solid #3b4653;cursor:crosshair}
      #${ID} .sm-tmp-info{margin-top:5px;color:#94a3b8;font-family:monospace}.sm-tmp-map div{display:flex;align-items:center;gap:4px}.sm-tmp-map input{width:48px;background:#111820;color:#dbe4ee;border:1px solid #3b4653;border-radius:3px;padding:3px}.sm-tmp-map button{margin-left:auto}
      #${BRUSH_ID}{position:fixed;z-index:2147482799;pointer-events:none;box-sizing:border-box;border:2px solid #38bdf8;background:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
    `;
    document.head.appendChild(style);
    document.body.appendChild(wrap);

    root.__smTilemapPaintTool = 'brush';
    if (root.__smTilemapBrushEnabled == null) root.__smTilemapBrushEnabled = true;
    if (root.__smTilemapBrushSize == null) root.__smTilemapBrushSize = 1;
    if (root.__smTilemapSelectedTile == null) root.__smTilemapSelectedTile = 0;

    wrap.querySelector('[data-action="toggle-brush"]').addEventListener('click', () => setBrushEnabled(!root.__smTilemapBrushEnabled));
    wrap.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => {
      root.__smTilemapPaintTool = btn.dataset.tool;
      wrap.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
    }));

    const slider = wrap.querySelector('.sm-tmp-brush-size');
    slider.value = String(brushSize());
    slider.addEventListener('change', e => {
      applyBrushSize(e.target.value);
      const current = root.__smTilemapBrushCell;
      if (current && root.__smTilemapBrushEnabled) updateBrush(tm, current);
    });

    const palette = wrap.querySelector('.sm-tmp-palette');
    const info = wrap.querySelector('.sm-tmp-info');
    wrap.querySelector('.sm-tmp-size').textContent = `${tm.tileWidth}×${tm.tileHeight}px = ${tileWorldSize(tm).x.toFixed(3)}×${tileWorldSize(tm).y.toFixed(3)} world`;

    palette.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const rect = palette.getBoundingClientRect();
      const scale = palette.__tmScale || 1;
      const tw = palette.__tileW || tm.tileWidth;
      const th = palette.__tileH || tm.tileHeight;
      const col = Math.floor(((e.clientX - rect.left) / scale) / tw);
      const row = Math.floor(((e.clientY - rect.top) / scale) / th);
      const cols = palette.__info?.cols || 1, rows = palette.__info?.rows || 1;
      const n = brushSize();
      if (col >= 0 && row >= 0 && col < cols && row < rows &&
          col + n <= cols && row + n <= rows) {
        root.__smTilemapSelectedTile = row * cols + col;
        info.textContent = `Stamp ${root.__smTilemapSelectedTile} · ${brushSize()}×${brushSize()} tiles`;
        if (root.__smTilemapBrushCell && root.__smTilemapBrushEnabled) updateBrush(tm, root.__smTilemapBrushCell);
      }
    });

    wrap.querySelector('[data-action="resize"]').addEventListener('click', () => {
      resizeMap(tm, wrap.querySelector('.sm-tmp-map-w').value, wrap.querySelector('.sm-tmp-map-h').value);
    });

    setBrushEnabled(root.__smTilemapBrushEnabled);
    applyBrushSize(root.__smTilemapBrushSize);
    loadPalette(tm, palette);
  }

  function installPointerBridge() {
    if (root.__smTilemapPaintPointerInstalled) return;
    root.__smTilemapPaintPointerInstalled = true;

    document.addEventListener('pointermove', e => {
      const tm = getTilemap();
      if (!tm || !root.__smTilemapBrushEnabled || !insideCanvas(e)) {
        removeBrush();
        return;
      }
      const world = screenToWorld(e);
      if (!world) { removeBrush(); return; }
      const cell = system()?.worldToCell(tm, world.x, world.y);
      updateBrush(tm, cell);
      if (root.__smTilemapPainting) {
        e.preventDefault();
        e.stopPropagation();
        paintAt(e);
      }
    }, true);

    document.addEventListener('pointerdown', e => {
      const tm = getTilemap();
      if (!tm || !root.__smTilemapBrushEnabled || !insideCanvas(e)) return;
      const world = screenToWorld(e);
      const cell = world && system()?.worldToCell(tm, world.x, world.y);
      if (!cell?.inside) return;
      root.__smTilemapPainting = true;
      const c = canvas();
      try { c?.setPointerCapture?.(e.pointerId); } catch (_) {}
      e.preventDefault();
      e.stopPropagation();
      paintAt(e);
    }, true);

    document.addEventListener('pointerup', () => { root.__smTilemapPainting = false; }, true);
    document.addEventListener('pointercancel', () => { root.__smTilemapPainting = false; }, true);
    window.addEventListener('blur', () => { root.__smTilemapPainting = false; });
  }

  function refresh(rebuild = true) {
    const tm = getTilemap();
    if (!tm) {
      document.getElementById(ID)?.remove();
      removeBrush();
      return;
    }
    syncGridCellSize(tm);
    if (rebuild) buildUI(tm);
  }

  root.SMTilemapPaint2D = {
    version: VERSION,
    refresh,
    syncGridCellSize,
    paintAt,
    setBrushEnabled,
    setBrushSize: applyBrushSize
  };

  installPointerBridge();
  root.addEventListener('sm:tilemap-created', () => refresh(true));
  root.addEventListener('sm:tilemap-applied', () => refresh(true));
  root.addEventListener('sm:object-selected', () => refresh(true));
  root.addEventListener('sm:2d-workspace-ready', () => refresh(true));
  root.addEventListener('sm:tilemap-tileset-changed', () => refresh(true));
  root.addEventListener('sm:tilemap-changed', () => {
    const tm = getTilemap();
    if (tm && root.__smTilemapBrushEnabled && root.__smTilemapBrushCell) updateBrush(tm, root.__smTilemapBrushCell);
  });

  if (document.readyState !== 'loading') refresh(true);
  else document.addEventListener('DOMContentLoaded', () => refresh(true), { once: true });

  console.log('[SMTilemapPaint2D] v' + VERSION + ' loaded.');
})(window);
