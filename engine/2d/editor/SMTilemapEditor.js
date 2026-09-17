
/* SMTilemapEditor.js
 * SimpleMDEngine 2D Tilemap Editor
 * Version 1.0.0
 *
 * Works with window.smTilemapSystem / window.SMTilemapSystem.
 * Creates a self-contained editor overlay:
 * - tileset preview + tile selection
 * - paint / erase / fill tools
 * - layer management
 * - map size + tile size
 * - grid preview
 * - apply / cancel
 *
 * The editor intentionally resolves tileset images through SMTilemapSystem
 * and never replaces Sprite Sheet Editor state.
 */
(function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const SYSTEM = () => root.smTilemapSystem || root.SMTilemapSystem?.instance || null;

  class SMTilemapEditor {
    constructor() {
      this.version = VERSION;
      this.tilemap = null;
      this.mapCanvas = null;
      this.tilesetCanvas = null;
      this.mapCtx = null;
      this.tilesetCtx = null;
      this.selectedTile = 0;
      this.tool = 'paint';
      this.showGrid = true;
      this._sourceSnapshot = null;
      this._dragging = false;
      this._boundPointerMove = e => this._onMapPointer(e);
      this._boundPointerUp = () => { this._dragging = false; };
    }

    open(tilemapOrOptions) {
      const system = SYSTEM();
      if (!system) throw new Error('SMTilemapSystem is not loaded.');

      const tilemap = tilemapOrOptions?.map ||
        tilemapOrOptions?.tilemap ||
        tilemapOrOptions;

      if (!tilemap || !tilemap.layers) {
        throw new Error('SMTilemapEditor.open() needs a tilemap.');
      }

      this.tilemap = tilemap;
      this._sourceSnapshot = system.serialize(tilemap);
      this.selectedTile = 0;
      this.tool = 'paint';
      this._dragging = false;

      this._buildUI();
      this._refresh();
      return this;
    }

    close() {
      this._removeUI();
      this.tilemap = null;
      this._sourceSnapshot = null;
      this._dragging = false;
    }

    cancel() {
      const system = SYSTEM();
      if (system && this._sourceSnapshot && this.tilemap) {
        const restored = system.deserialize(this._sourceSnapshot);
        Object.assign(this.tilemap, restored);
        this.tilemap.layers = restored.layers;
        this.tilemap.activeLayer = restored.activeLayer;
      }
      this.close();
    }

    apply() {
      this._syncMapToSystem();
      this.close();
      root.dispatchEvent(new CustomEvent('sm:tilemap-applied', {
        detail: { tilemap: this.tilemap }
      }));
    }

    _buildUI() {
      this._removeUI();

      const style = document.createElement('style');
      style.id = 'sm-tilemap-editor-style';
      style.textContent = `
        #sm-tilemap-editor {
          position:fixed; inset:0; z-index:2147483000;
          display:flex; flex-direction:column;
          background:#17191d; color:#e9edf2;
          font:13px Arial,sans-serif;
        }
        #sm-tilemap-editor .sm-tm-top {
          height:52px; flex:0 0 52px; display:flex; align-items:center;
          gap:8px; padding:0 12px; background:#22262c;
          border-bottom:1px solid #3a4048;
        }
        #sm-tilemap-editor .sm-tm-title {
          font-weight:700; font-size:15px; margin-right:10px;
        }
        #sm-tilemap-editor button, #sm-tilemap-editor input, #sm-tilemap-editor select {
          box-sizing:border-box; border:1px solid #444b55;
          background:#292e35; color:#edf1f5; border-radius:4px;
          height:30px;
        }
        #sm-tilemap-editor button { padding:0 10px; cursor:pointer; }
        #sm-tilemap-editor button:hover { background:#343b44; }
        #sm-tilemap-editor button.sm-active { background:#46515d; border-color:#72808f; }
        #sm-tilemap-editor .sm-spacer { flex:1; }
        #sm-tilemap-editor .sm-tm-body {
          min-height:0; flex:1; display:grid;
          grid-template-columns:270px minmax(0,1fr) 240px;
        }
        #sm-tilemap-editor .sm-panel {
          min-width:0; overflow:auto; padding:10px;
          background:#20242a; border-right:1px solid #373d45;
        }
        #sm-tilemap-editor .sm-right { border-right:0; border-left:1px solid #373d45; }
        #sm-tilemap-editor h4 {
          margin:4px 0 8px; font-size:12px; text-transform:uppercase;
          letter-spacing:.08em; color:#aeb7c2;
        }
        #sm-tilemap-editor .sm-section {
          padding:8px 0 12px; border-bottom:1px solid #353b43;
          margin-bottom:10px;
        }
        #sm-tilemap-editor .sm-row { display:flex; gap:6px; align-items:center; margin:6px 0; }
        #sm-tilemap-editor label { color:#b9c1ca; }
        #sm-tilemap-editor input[type=number] { width:72px; padding:0 6px; }
        #sm-tilemap-editor input[type=text] { width:100%; padding:0 7px; }
        #sm-tilemap-editor .sm-map-wrap {
          min-width:0; min-height:0; overflow:auto; position:relative;
          display:flex; align-items:flex-start; justify-content:flex-start;
          padding:24px; background:#111317;
        }
        #sm-tilemap-editor #sm-tm-map {
          image-rendering:pixelated; cursor:crosshair;
          background:
            linear-gradient(45deg,#181b20 25%,transparent 25%) 0 0/16px 16px,
            linear-gradient(-45deg,#181b20 25%,transparent 25%) 0 0/16px 16px,
            linear-gradient(45deg,transparent 75%,#181b20 75%) 0 0/16px 16px,
            linear-gradient(-45deg,transparent 75%,#181b20 75%) 0 0/16px 16px,
            #14171b;
        }
        #sm-tilemap-editor .sm-tile-preview {
          width:100%; max-height:220px; overflow:auto;
          border:1px solid #3c434c; background:#111317;
        }
        #sm-tilemap-editor #sm-tm-tileset {
          display:block; image-rendering:pixelated; cursor:pointer;
        }
        #sm-tilemap-editor .sm-layer {
          display:flex; gap:5px; align-items:center; margin:5px 0;
          padding:5px; border:1px solid transparent; border-radius:4px;
        }
        #sm-tilemap-editor .sm-layer.sm-selected {
          border-color:#5f6d7b; background:#2a3037;
        }
        #sm-tilemap-editor .sm-layer-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #sm-tilemap-editor .sm-small { font-size:11px; color:#929ba6; }
        #sm-tilemap-editor .sm-status {
          height:25px; flex:0 0 25px; padding:0 10px;
          display:flex; align-items:center; background:#20242a;
          border-top:1px solid #373d45; color:#9fa8b3;
        }
      `;

      const rootEl = document.createElement('div');
      rootEl.id = 'sm-tilemap-editor';
      rootEl.innerHTML = `
        <div class="sm-tm-top">
          <div class="sm-tm-title">Tilemap Editor</div>
          <button data-tool="paint">Paint</button>
          <button data-tool="erase">Erase</button>
          <button data-tool="fill">Fill</button>
          <button id="sm-tm-grid">Grid</button>
          <div class="sm-spacer"></div>
          <button id="sm-tm-cancel">Cancel</button>
          <button id="sm-tm-apply">Apply</button>
        </div>
        <div class="sm-tm-body">
          <aside class="sm-panel">
            <div class="sm-section">
              <h4>Map</h4>
              <div class="sm-row"><label>Width</label><input id="sm-tm-width" type="number" min="1" max="4096"></div>
              <div class="sm-row"><label>Height</label><input id="sm-tm-height" type="number" min="1" max="4096"></div>
              <div class="sm-row"><label>Tile W</label><input id="sm-tm-tw" type="number" min="1" max="2048"></div>
              <div class="sm-row"><label>Tile H</label><input id="sm-tm-th" type="number" min="1" max="2048"></div>
              <button id="sm-tm-resize">Resize Map</button>
            </div>
            <div class="sm-section">
              <h4>Tileset</h4>
              <div class="sm-small" id="sm-tm-tileset-info">Loading...</div>
              <div class="sm-tile-preview"><canvas id="sm-tm-tileset"></canvas></div>
              <div class="sm-small" id="sm-tm-tile-info">Tile: 0</div>
            </div>
          </aside>
          <main class="sm-map-wrap">
            <canvas id="sm-tm-map"></canvas>
          </main>
          <aside class="sm-panel sm-right">
            <div class="sm-section">
              <h4>Layers</h4>
              <div id="sm-tm-layers"></div>
              <div class="sm-row">
                <button id="sm-tm-add-layer">+ Layer</button>
                <button id="sm-tm-remove-layer">− Layer</button>
              </div>
            </div>
            <div class="sm-section">
              <h4>Active Layer</h4>
              <div class="sm-small" id="sm-tm-active-info"></div>
              <div class="sm-row">
                <label>Opacity</label>
                <input id="sm-tm-opacity" type="number" min="0" max="1" step="0.05">
              </div>
            </div>
          </aside>
        </div>
        <div class="sm-status" id="sm-tm-status">Ready</div>
      `;

      document.head.appendChild(style);
      document.body.appendChild(rootEl);

      this.rootEl = rootEl;
      this.mapCanvas = rootEl.querySelector('#sm-tm-map');
      this.tilesetCanvas = rootEl.querySelector('#sm-tm-tileset');
      this.mapCtx = this.mapCanvas.getContext('2d');
      this.tilesetCtx = this.tilesetCanvas.getContext('2d');

      rootEl.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.tool = btn.dataset.tool;
          rootEl.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('sm-active', b === btn));
          this._setStatus(`Tool: ${this.tool}`);
        });
      });
      rootEl.querySelector('[data-tool="paint"]').classList.add('sm-active');

      rootEl.querySelector('#sm-tm-grid').addEventListener('click', () => {
        this.showGrid = !this.showGrid;
        this._refreshMap();
      });
      rootEl.querySelector('#sm-tm-cancel').addEventListener('click', () => this.cancel());
      rootEl.querySelector('#sm-tm-apply').addEventListener('click', () => this.apply());
      rootEl.querySelector('#sm-tm-resize').addEventListener('click', () => this._resize());
      rootEl.querySelector('#sm-tm-add-layer').addEventListener('click', () => {
        const system = SYSTEM();
        system.addLayer(this.tilemap, `Layer ${this.tilemap.layers.length + 1}`);
        this._refresh();
      });
      rootEl.querySelector('#sm-tm-remove-layer').addEventListener('click', () => {
        const system = SYSTEM();
        if (this.tilemap.layers.length <= 1) return this._setStatus('At least one layer is required.');
        system.removeLayer(this.tilemap, this.tilemap.activeLayer);
        this._refresh();
      });
      rootEl.querySelector('#sm-tm-opacity').addEventListener('input', e => {
        const layer = this._activeLayer();
        if (layer) layer.opacity = Math.max(0, Math.min(1, Number(e.target.value)));
        this._refreshMap();
      });

      this.tilesetCanvas.addEventListener('pointerdown', e => this._selectTilesetTile(e));
      this.mapCanvas.addEventListener('pointerdown', e => {
        this._dragging = true;
        this._onMapPointer(e);
        this.mapCanvas.setPointerCapture?.(e.pointerId);
      });
      this.mapCanvas.addEventListener('pointermove', this._boundPointerMove);
      window.addEventListener('pointerup', this._boundPointerUp);
    }

    _removeUI() {
      window.removeEventListener('pointerup', this._boundPointerUp);
      this.rootEl?.remove();
      document.getElementById('sm-tilemap-editor-style')?.remove();
      this.rootEl = null;
    }

    _activeLayer() {
      return this.tilemap?.layers?.[this.tilemap.activeLayer ?? 0] || null;
    }

    async _refresh() {
      this._refreshFields();
      this._refreshLayers();
      await this._refreshTileset();
      this._refreshMap();
    }

    _refreshFields() {
      if (!this.rootEl || !this.tilemap) return;
      this.rootEl.querySelector('#sm-tm-width').value = this.tilemap.width;
      this.rootEl.querySelector('#sm-tm-height').value = this.tilemap.height;
      this.rootEl.querySelector('#sm-tm-tw').value = this.tilemap.tileWidth;
      this.rootEl.querySelector('#sm-tm-th').value = this.tilemap.tileHeight;
      const layer = this._activeLayer();
      this.rootEl.querySelector('#sm-tm-opacity').value = layer ? (layer.opacity ?? 1) : 1;
      this.rootEl.querySelector('#sm-tm-active-info').textContent = layer ? layer.name : 'None';
    }

    _refreshLayers() {
      const box = this.rootEl?.querySelector('#sm-tm-layers');
      if (!box) return;
      box.innerHTML = '';
      this.tilemap.layers.forEach((layer, i) => {
        const row = document.createElement('div');
        row.className = 'sm-layer' + (i === this.tilemap.activeLayer ? ' sm-selected' : '');
        row.innerHTML = `
          <button title="Visibility">${layer.visible === false ? '○' : '●'}</button>
          <div class="sm-layer-name">${this._escape(layer.name || `Layer ${i + 1}`)}</div>
          <button title="Select">Edit</button>
        `;
        row.children[0].addEventListener('click', () => {
          layer.visible = layer.visible === false;
          this._refresh();
        });
        row.children[2].addEventListener('click', () => {
          this.tilemap.activeLayer = i;
          this._refresh();
        });
        box.appendChild(row);
      });
    }

    async _refreshTileset() {
      const system = SYSTEM();
      const image = await system.getTilesetImage?.(this.tilemap);
      if (!image) {
        this.rootEl.querySelector('#sm-tm-tileset-info').textContent = 'Tileset image unavailable';
        return;
      }

      const tw = this.tilemap.tileWidth;
      const th = this.tilemap.tileHeight;
      const cols = Math.max(1, Math.floor(image.naturalWidth / tw));
      const rows = Math.max(1, Math.floor(image.naturalHeight / th));

      this.tilemap.tilesetColumns = cols;
      this.tilemap.tilesetRows = rows;

      const maxW = 240;
      const scale = Math.min(1, maxW / image.naturalWidth);
      this.tilesetCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      this.tilesetCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      this.tilesetCanvas.style.width = this.tilesetCanvas.width + 'px';
      this.tilesetCanvas.style.height = this.tilesetCanvas.height + 'px';

      this.tilesetCtx.clearRect(0, 0, this.tilesetCanvas.width, this.tilesetCanvas.height);
      this.tilesetCtx.imageSmoothingEnabled = false;
      this.tilesetCtx.drawImage(image, 0, 0, this.tilesetCanvas.width, this.tilesetCanvas.height);

      this.tilesetCtx.strokeStyle = '#ffffff';
      this.tilesetCtx.lineWidth = 1;
      for (let x = 0; x <= cols; x++) {
        const px = x * tw * scale + .5;
        this.tilesetCtx.beginPath(); this.tilesetCtx.moveTo(px, 0); this.tilesetCtx.lineTo(px, this.tilesetCanvas.height); this.tilesetCtx.stroke();
      }
      for (let y = 0; y <= rows; y++) {
        const py = y * th * scale + .5;
        this.tilesetCtx.beginPath(); this.tilesetCtx.moveTo(0, py); this.tilesetCtx.lineTo(this.tilesetCanvas.width, py); this.tilesetCtx.stroke();
      }

      const tx = this.selectedTile % cols;
      const ty = Math.floor(this.selectedTile / cols);
      this.tilesetCtx.strokeStyle = '#00ffff';
      this.tilesetCtx.lineWidth = 2;
      this.tilesetCtx.strokeRect(tx * tw * scale + 1, ty * th * scale + 1, tw * scale - 2, th * scale - 2);

      this.rootEl.querySelector('#sm-tm-tileset-info').textContent =
        `${image.naturalWidth}×${image.naturalHeight} · ${cols}×${rows} tiles`;
      this.rootEl.querySelector('#sm-tm-tile-info').textContent =
        `Tile: ${this.selectedTile} · Col ${tx} · Row ${ty}`;
    }

    _refreshMap() {
      if (!this.mapCanvas || !this.tilemap) return;
      const scale = Math.max(1, Math.min(3, 420 / Math.max(this.tilemap.width, this.tilemap.height)));
      this._mapScale = scale;

      this.mapCanvas.width = Math.max(1, Math.round(this.tilemap.width * this.tilemap.tileWidth * scale));
      this.mapCanvas.height = Math.max(1, Math.round(this.tilemap.height * this.tilemap.tileHeight * scale));
      this.mapCanvas.style.width = this.mapCanvas.width + 'px';
      this.mapCanvas.style.height = this.mapCanvas.height + 'px';

      const ctx = this.mapCtx;
      ctx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);
      ctx.imageSmoothingEnabled = false;

      const system = SYSTEM();
      const image = system.getTilesetImage?.(this.tilemap);

      const drawLayer = layer => {
        if (!layer || layer.visible === false) return;
        ctx.globalAlpha = layer.opacity ?? 1;
        for (let y = 0; y < this.tilemap.height; y++) {
          for (let x = 0; x < this.tilemap.width; x++) {
            const id = system.getTile(this.tilemap, x, y, layer.index ?? this.tilemap.layers.indexOf(layer));
            if (id < 0 || !image) continue;
            const cols = Math.max(1, Math.floor(image.naturalWidth / this.tilemap.tileWidth));
            const sx = (id % cols) * this.tilemap.tileWidth;
            const sy = Math.floor(id / cols) * this.tilemap.tileHeight;
            ctx.drawImage(
              image, sx, sy, this.tilemap.tileWidth, this.tilemap.tileHeight,
              x * this.tilemap.tileWidth * scale,
              y * this.tilemap.tileHeight * scale,
              this.tilemap.tileWidth * scale,
              this.tilemap.tileHeight * scale
            );
          }
        }
      };

      this.tilemap.layers.forEach(drawLayer);
      ctx.globalAlpha = 1;

      if (this.showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,.18)';
        ctx.lineWidth = 1;
        const cw = this.tilemap.tileWidth * scale;
        const ch = this.tilemap.tileHeight * scale;
        for (let x = 0; x <= this.tilemap.width; x++) {
          const px = Math.round(x * cw) + .5;
          ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this.mapCanvas.height); ctx.stroke();
        }
        for (let y = 0; y <= this.tilemap.height; y++) {
          const py = Math.round(y * ch) + .5;
          ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.mapCanvas.width, py); ctx.stroke();
        }
      }
    }

    _selectTilesetTile(e) {
      const system = SYSTEM();
      const image = system?.getTilesetImage?.(this.tilemap);
      if (!image) return;
      const rect = this.tilesetCanvas.getBoundingClientRect();
      const scale = this.tilesetCanvas.width / image.naturalWidth;
      const x = Math.floor((e.clientX - rect.left) / scale / this.tilemap.tileWidth);
      const y = Math.floor((e.clientY - rect.top) / scale / this.tilemap.tileHeight);
      const cols = Math.max(1, Math.floor(image.naturalWidth / this.tilemap.tileWidth));
      this.selectedTile = y * cols + x;
      this._refreshTileset();
      this._setStatus(`Selected tile ${this.selectedTile}`);
    }

    _onMapPointer(e) {
      if (!this._dragging || !this.tilemap) return;
      const rect = this.mapCanvas.getBoundingClientRect();
      const scale = this._mapScale || 1;
      const x = Math.floor((e.clientX - rect.left) / (this.tilemap.tileWidth * scale));
      const y = Math.floor((e.clientY - rect.top) / (this.tilemap.tileHeight * scale));
      if (x < 0 || y < 0 || x >= this.tilemap.width || y >= this.tilemap.height) return;

      const system = SYSTEM();
      const layerIndex = this.tilemap.activeLayer ?? 0;
      const layer = this._activeLayer();
      if (layer?.locked) return;

      if (this.tool === 'paint') system.setTile(this.tilemap, x, y, this.selectedTile, layerIndex);
      else if (this.tool === 'erase') system.setTile(this.tilemap, x, y, -1, layerIndex);
      else if (this.tool === 'fill') {
        system.fill(this.tilemap, this.selectedTile, layerIndex);
        this._dragging = false;
      }

      this._refreshMap();
      this._setStatus(`${this.tool} · cell ${x}, ${y} · tile ${this.selectedTile}`);
    }

    _resize() {
      const w = Number(this.rootEl.querySelector('#sm-tm-width').value);
      const h = Number(this.rootEl.querySelector('#sm-tm-height').value);
      const system = SYSTEM();
      system.resize(this.tilemap, w, h);
      this._refresh();
      this._setStatus(`Map resized to ${w}×${h}`);
    }

    _syncMapToSystem() {
      const system = SYSTEM();
      system.render?.(this.tilemap);
    }

    _setStatus(text) {
      const el = this.rootEl?.querySelector('#sm-tm-status');
      if (el) el.textContent = text;
    }

    _escape(value) {
      return String(value).replace(/[&<>"']/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
      }[c]));
    }
  }

  root.SMTilemapEditor = SMTilemapEditor;

  if (!root.smTilemapEditor || root.smTilemapEditor.version !== VERSION) {
    root.smTilemapEditor = new SMTilemapEditor();
  }

  root.openTilemapEditor = function (tilemap) {
    return root.smTilemapEditor.open(tilemap);
  };

  root.addEventListener('sm:open-tilemap-editor', e => {
    const map = e.detail?.tilemap || e.detail;
    if (map) root.openTilemapEditor(map);
  });

})(window);