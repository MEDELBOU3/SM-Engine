/* SMTilemap2DToolbar.js
 * SimpleMDEngine - visible Tilemap controls for GAME DEV / 2D
 * Version 1.0.0
 *
 * Adds a real "Tilemap" button to the existing 2D Game toolbar.
 * It does not replace SMWorkspaceManager.
 *
 * Workflow:
 *   GAME 2D -> Tilemap -> choose image tileset -> Create Tilemap
 *   The created Tilemap is inserted into the active scene and painted
 *   directly in the 2D GAME DEV viewport.
 *   The legacy fullscreen SMTilemapEditor is intentionally NOT opened.
 */
(function (root) {
    'use strict';

    const VERSION = '1.1.0';
    const BUTTON_ID = 'sm-2d-btn-tilemap';

    function getSystem() {
        return root.smTilemapSystem || root.SMTilemapSystem || null;
    }

    function getAssetsPanel() {
        return root.AssetsPanel || root.assetsPanel || root.smAssetsPanel || null;
    }

    function isImageAsset(asset) {
        if (!asset) return false;
        const type = String(asset.type || asset.kind || asset.category || '').toLowerCase();
        const mime = String(asset.mimeType || asset.mime || asset.contentType || '').toLowerCase();
        const name = String(asset.name || asset.fileName || asset.filename || '').toLowerCase();

        return mime.startsWith('image/') ||
            type.includes('image') ||
            type.includes('texture') ||
            type.includes('sprite') ||
            /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(name);
    }

    function getImageAssets() {
        const ap = getAssetsPanel();
        const arrays = [
            ap?.assets,
            ap?.assetList,
            ap?.items
        ];

        const all = [];
        for (const list of arrays) {
            if (Array.isArray(list)) all.push(...list);
        }

        const seen = new Set();
        return all.filter(asset => {
            const id = String(asset?.id ?? asset?.assetId ?? '');
            if (!id || seen.has(id) || !isImageAsset(asset)) return false;
            seen.add(id);
            return true;
        });
    }

    function toast(message) {
        if (typeof root.showToast === 'function') {
            try { root.showToast(message); return; } catch (_) {}
        }
        console.info('[Tilemap]', message);
    }

    function installButton() {
        if (!document.body) return false;

        const toolbar =
            document.getElementById('sm-2d-game-toolbar') ||
            document.querySelector('.sm-2d-header-toolbar');

        if (!toolbar) return false;
        if (document.getElementById(BUTTON_ID)) return true;

        const button = document.createElement('button');
        button.type = 'button';
        button.id = BUTTON_ID;
        button.className = 'sm-2d-btn';
        button.title = 'Create and edit a 2D Tilemap';
        button.innerHTML = '<i class="fas fa-table-cells-large"></i> Tilemap';

        const platform = toolbar.querySelector('#sm-2d-btn-add-platform');
        const separator = platform?.nextElementSibling;

        if (platform) {
            platform.insertAdjacentElement('afterend', button);
        } else if (separator) {
            toolbar.insertBefore(button, separator);
        } else {
            toolbar.appendChild(button);
        }

        button.addEventListener('click', openTilesetChooser);

        return true;
    }

    function removeChooser() {
        document.getElementById('sm-tilemap-asset-chooser')?.remove();
    }

    function openTilesetChooser() {
        if (!getSystem()) {
            toast('SMTilemapSystem is not loaded.');
            return;
        }

        const assets = getImageAssets();

        if (!assets.length) {
            toast('No image tileset found in AssetsPanel.');
            return;
        }

        removeChooser();

        const overlay = document.createElement('div');
        overlay.id = 'sm-tilemap-asset-chooser';
        overlay.innerHTML = `
            <div class="sm-tm-ac-dialog">
                <div class="sm-tm-ac-head">
                    <strong>Create Tilemap</strong>
                    <button type="button" data-close>×</button>
                </div>
                <div class="sm-tm-ac-sub">Choose an image from AssetsPanel as the tileset.</div>
                <div class="sm-tm-ac-list"></div>
            </div>
        `;

        const style = document.createElement('style');
        style.id = 'sm-tilemap-asset-chooser-style';
        style.textContent = `
            #sm-tilemap-asset-chooser {
                position:fixed; inset:0; z-index:2147482900;
                display:flex; align-items:center; justify-content:center;
                background:rgba(0,0,0,.55);
                font-family:Arial,sans-serif;
            }
            .sm-tm-ac-dialog {
                width:430px; max-height:70vh; overflow:hidden;
                background:#20242a; color:#e9edf2;
                border:1px solid #454d57; border-radius:8px;
                box-shadow:0 20px 60px rgba(0,0,0,.5);
            }
            .sm-tm-ac-head {
                height:46px; display:flex; align-items:center;
                padding:0 12px; border-bottom:1px solid #383f48;
            }
            .sm-tm-ac-head strong { flex:1; }
            .sm-tm-ac-head button {
                border:0; background:transparent; color:#cbd5e1;
                font-size:24px; cursor:pointer;
            }
            .sm-tm-ac-sub {
                padding:10px 12px; color:#9ca6b2; font-size:12px;
            }
            .sm-tm-ac-list {
                max-height:calc(70vh - 90px); overflow:auto; padding:8px;
            }
            .sm-tm-ac-item {
                width:100%; display:flex; align-items:center; gap:10px;
                padding:8px; margin:3px 0; box-sizing:border-box;
                border:1px solid transparent; border-radius:5px;
                background:#292e35; color:#e9edf2; cursor:pointer;
                text-align:left;
            }
            .sm-tm-ac-item:hover {
                background:#343b44; border-color:#596573;
            }
            .sm-tm-ac-thumb {
                width:42px; height:42px; object-fit:contain;
                background:#15181c; border:1px solid #414852;
            }
            .sm-tm-ac-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .sm-tm-ac-type { font-size:10px; color:#8994a1; }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);

        const list = overlay.querySelector('.sm-tm-ac-list');

        assets.forEach(asset => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'sm-tm-ac-item';

            const thumb = document.createElement('img');
            thumb.className = 'sm-tm-ac-thumb';
            thumb.alt = '';
            const thumbSrc = asset.thumbnail || asset.preview || asset.data || asset.sourceURL || asset.sourceUrl || asset.url || asset.src;
            if (thumbSrc) thumb.src = thumbSrc;

            const text = document.createElement('div');
            text.className = 'sm-tm-ac-name';
            text.textContent = asset.name || asset.fileName || 'Image';

            const type = document.createElement('div');
            type.className = 'sm-tm-ac-type';
            type.textContent = String(asset.type || 'IMAGE').toUpperCase();

            item.append(thumb, text, type);
            item.addEventListener('click', () => createTilemap(asset));

            list.appendChild(item);
        });

        overlay.querySelector('[data-close]').addEventListener('click', removeChooser);
        overlay.addEventListener('pointerdown', e => {
            if (e.target === overlay) removeChooser();
        });
    }

    async function createTilemap(asset) {
        const sm = getSystem();
        if (!sm || !asset) return;

        try {
            removeChooser();

            const viewport =
                document.querySelector('#renderer-container') ||
                document.querySelector('.sm-viewport-panel.active') ||
                document.body;

            const rect = viewport.getBoundingClientRect?.();
            const ppu = Number(root.sm2DViewportPixelsPerUnit) || 16;

            const options = {
                scene: root.scene,
                name: `${asset.name || 'Tileset'} Tilemap`,
                x: 0,
                y: 0,
                z: 0,
                layer2D: root.sm2DActiveLayer || 'midground',
                width: 128,
                height: 128,
                tileWidth: 16,
                tileHeight: 16,
                pixelsPerUnit: ppu
            };

            if (rect) {
                options.x = 0;
                options.y = 0;
            }

            let object;

            if (typeof sm.addAssetTo2DGame === 'function') {
                object = await sm.addAssetTo2DGame(asset, options);
            } else if (typeof root.addAssetTo2DGameAsTilemap === 'function') {
                object = await root.addAssetTo2DGameAsTilemap(asset, options);
            } else {
                throw new Error('Tilemap asset creation API is unavailable.');
            }

            root.selectedObject = object;
            root.selectedGameObject = object;

            try { root.transformControls?.attach?.(object); } catch (_) {}
            try { root.updateHierarchy?.(); } catch (_) {}
            try { root.updateInspector?.(); } catch (_) {}

            root.dispatchEvent(new CustomEvent('sm:tilemap-created', {
                detail: { object, asset }
            }));

            // Direct viewport painting: never open the legacy fullscreen editor.
            try {
                root.SMTilemapPaint2D?.refresh?.(true);
                root.SMTilemapPaint2D?.setBrushEnabled?.(true);
            } catch (paintError) {
                console.warn('[Tilemap Toolbar] Paint bridge refresh failed:', paintError);
            }

            toast(`Tilemap created: ${asset.name || 'Tileset'}`);
            return object;
        } catch (error) {
            console.error('[Tilemap Toolbar] Creation failed:', error);
            toast('Tilemap creation failed: ' + (error?.message || error));
            return null;
        }
    }

    function install() {
        if (installButton()) return;

        const observer = new MutationObserver(() => {
            if (installButton()) observer.disconnect();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        setTimeout(() => observer.disconnect(), 30000);
    }

    root.SMTilemap2DToolbar = {
        version: VERSION,
        install,
        openTilesetChooser,
        createTilemap
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }

    root.addEventListener('sm:2d-workspace-ready', install);
    root.addEventListener('sm:workspace-mode-changed', install);
    root.dispatchEvent(new CustomEvent('sm:tilemap-toolbar-ready', {
        detail: { version: VERSION }
    }));

})(window);
