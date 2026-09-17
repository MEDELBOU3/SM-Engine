/* AssetsPanel_TilemapIntegration.js
 * SimpleMDEngine - AssetsPanel ↔ 2D Tilemap bridge
 * Version 1.0.0
 *
 * Loads after SMTilemapSystem.js.
 * Adds non-destructive tilemap actions to asset elements that represent
 * imported images. It does not replace existing AssetsPanel handlers.
 */
(function (root) {
  'use strict';

  const VERSION = '1.0.0';

  function system() {
    return root.smTilemapSystem || root.SMTilemapSystem?.instance || null;
  }

  function getAssetId(el) {
    if (!el) return '';
    return el.dataset?.smAssetId ||
           el.dataset?.assetId ||
           el.getAttribute('data-sm-asset-id') ||
           el.getAttribute('data-asset-id') ||
           '';
  }

  function isImageAsset(asset) {
    if (!asset) return false;
    const type = String(asset.type || asset.kind || asset.category || '').toLowerCase();
    const mime = String(asset.mimeType || asset.mime || asset.contentType || '').toLowerCase();
    const name = String(asset.name || asset.fileName || asset.filename || '').toLowerCase();

    if (mime.startsWith('image/')) return true;
    if (type.includes('image') || type.includes('texture') || type.includes('sprite')) return true;
    return /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(name);
  }

  function findAsset(id) {
    const ap = root.assetsPanel || root.AssetsPanel || root.smAssetsPanel;
    if (!ap || !id) return null;

    const methods = ['getAssetById', 'findAssetById', 'getAsset'];
    for (const method of methods) {
      try {
        if (typeof ap[method] === 'function') {
          const result = ap[method](id);
          if (result) return result;
        }
      } catch (_) {}
    }

    const arrays = [ap.assets, ap.assetList, ap.items];
    for (const arr of arrays) {
      if (!Array.isArray(arr)) continue;
      const found = arr.find(a => String(a?.id ?? a?.assetId ?? '') === String(id));
      if (found) return found;
    }

    return null;
  }

  function notify(message) {
    if (typeof root.showToast === 'function') {
      try { root.showToast(message); return; } catch (_) {}
    }
    if (root.console) console.info('[Tilemap]', message);
  }

  async function createFromAsset(assetId) {
    const sm = system();
    if (!sm) {
      notify('SMTilemapSystem is not loaded.');
      return null;
    }

    const asset = findAsset(assetId);
    if (!asset) {
      notify('Asset not found: ' + assetId);
      return null;
    }

    if (!isImageAsset(asset)) {
      notify('Tilemaps require an image tileset asset.');
      return null;
    }

    try {
      const map = await sm.createTilemap({
        name: (asset.name || 'Tileset') + ' Tilemap',
        tilesetAssetId: asset.id ?? asset.assetId ?? assetId,
        width: 16,
        height: 12,
        tileWidth: 16,
        tileHeight: 16,
        pixelsPerUnit: 16
      });

      if (typeof root.openTilemapEditor === 'function') {
        root.openTilemapEditor(map);
      } else {
        root.dispatchEvent(new CustomEvent('sm:open-tilemap-editor', {
          detail: { tilemap: map }
        }));
      }

      root.dispatchEvent(new CustomEvent('sm:tilemap-created-from-asset', {
        detail: { tilemap: map, asset }
      }));

      return map;
    } catch (error) {
      console.error('[Tilemap] createFromAsset failed:', error);
      notify('Could not create tilemap: ' + (error?.message || error));
      return null;
    }
  }

  function installContextAction() {
    if (root.__smTilemapAssetActionInstalled) return;
    root.__smTilemapAssetActionInstalled = true;

    root.addEventListener('contextmenu', e => {
      const el = e.target?.closest?.('[data-sm-asset-id],[data-asset-id]');
      if (!el) return;

      const id = getAssetId(el);
      if (!id) return;

      /*
       * Do not preventDefault here.
       * Existing AssetsPanel context menus remain untouched.
       * We only expose the helper globally and through a custom event.
       */
      el.dataset.smTilemapAvailable = 'true';
    }, true);

    /*
     * Existing/third-party context menus can call:
     * window.createTilemapFromAsset(assetId)
     */
  }

  root.SMTilemapAssetsPanelIntegration = {
    version: VERSION,
    getAssetId,
    findAsset,
    createFromAsset
  };

  root.createTilemapFromAsset = createFromAsset;

  installContextAction();

  root.dispatchEvent(new CustomEvent('sm:tilemap-assets-integration-ready', {
    detail: { version: VERSION }
  }));

})(window);
