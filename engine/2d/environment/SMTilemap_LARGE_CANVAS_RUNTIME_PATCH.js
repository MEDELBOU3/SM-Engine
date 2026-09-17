/*
 * SMTilemap_LARGE_CANVAS_RUNTIME_PATCH.js
 * Expands newly-created small tilemaps to a large 128x128 editor canvas.
 * Existing painted content is preserved.
 */
(function(root){
  'use strict';
  const TARGET_W = 128, TARGET_H = 128;
  function expand(tm){
    const sm = root.smTilemapSystem || root.SMTilemapSystem;
    if(!sm || !tm || tm.width > 64 || tm.height > 64 || typeof sm.resize !== 'function') return;
    try {
      sm.resize(tm, TARGET_W, TARGET_H);
      root.dispatchEvent(new CustomEvent('sm:tilemap-map-resized',{
        detail:{tilemap:tm,width:TARGET_W,height:TARGET_H,reason:'large-editor-canvas'}
      }));
    } catch(e) {
      console.warn('[SMTilemap] large canvas expansion failed', e);
    }
  }
  root.addEventListener('sm:tilemap-created', e => expand(e.detail?.tilemap));
  root.SMTilemapLargeCanvasPatch = {version:'1.0.0', expand};
})(window);
