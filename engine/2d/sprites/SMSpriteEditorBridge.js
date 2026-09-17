// ============================================================================
// 2D-editor/core/SMSpriteEditorBridge.js
// SM Engine - Automatic Inspector & Topbar Bridge for Sprite Sheet Studio
// ============================================================================
(function (root) {
    'use strict';

    // Helper: Safely load and open Sprite Sheet Editor
    async function openEditorSafely(imageSource = null, name = 'spritesheet') {
        // 1. Ensure script is loaded
        if (typeof root.openSpriteSheetEditor !== 'function' && !root.SMSpriteSheetEditor) {
            console.log('[SpriteBridge] Loading SMSpriteSheetEditor.js...');
            await new Promise((resolve, reject) => {
                const existing = document.querySelector('script[src*="SMSpriteSheetEditor.js"]');
                if (existing) {
                    existing.addEventListener('load', resolve, { once: true });
                    existing.addEventListener('error', reject, { once: true });
                    setTimeout(resolve, 500);
                    return;
                }
                const script = document.createElement('script');
                script.id = 'sm-sprite-sheet-editor-script';
                // Keep this path aligned with SMEngineScriptLoader.  The
                // production editor lives here; the old 2D-editor/core path
                // does not exist in this build and produced an empty studio.
                script.src = 'engine/2d/sprites/SMSpriteSheetEditor.js';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Could not load SMSpriteSheetEditor.js'));
                document.head.appendChild(script);
            }).catch(err => {
                console.error('[SpriteBridge] Script load error:', err);
            });
        }

        // 2. Open via Global Function or Instance
        if (typeof root.openSpriteSheetEditor === 'function') {
            root.openSpriteSheetEditor(imageSource, name);
            return;
        }

        if (root.smSpriteSheetEditor?.open) {
            root.smSpriteSheetEditor.open(imageSource, name);
            return;
        }

        if (root.SMSpriteSheetEditor) {
            root.smSpriteSheetEditor = root.smSpriteSheetEditor || new root.SMSpriteSheetEditor();
            root.smSpriteSheetEditor.open(imageSource, name);
        }
    }

    // Helper: Extract actual Image from any selected 3D/2D Object
    function getSelectedImageSource(obj = window.selectedObject) {
        if (!obj) return null;

        // Direct sprite asset / userData
        if (obj.userData?.spriteSheetImage) return obj.userData.spriteSheetImage;
        if (obj.userData?.spriteSheetUrl) return obj.userData.spriteSheetUrl;

        // Material map extraction (supports Single & Multi-materials)
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (!mat || !mat.map) return null;

        // Three.js Texture data (r130 - r160+ compatibility)
        const texture = mat.map;
        const img = texture.image || texture.source?.data || null;

        if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || img instanceof ImageBitmap) {
            return img;
        }

        if (typeof img === 'string') return img;
        if (texture.name && texture.name.startsWith('blob:')) return texture.name;

        return null;
    }

    // 1. Inject "EDIT SPRITE SHEET" Button inside Details / Inspector
    function updateInspectorSpriteButton() {
        const obj = window.selectedObject || window.currentSelectedObject;
        const inspectorMain = document.getElementById('inspector-main-content') || document.querySelector('.ue5-details-scroll-content');
        let btn = document.getElementById('sm-open-sprite-editor-btn');

        const imgSrc = getSelectedImageSource(obj);

        if (!obj || !imgSrc) {
            if (btn) btn.style.display = 'none';
            return;
        }

        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'sm-open-sprite-editor-btn';
            btn.className = 'btn-add-component';
            btn.type = 'button';
            btn.style.cssText = `
                width: 100%;
                height: 28px;
                margin-top: 8px;
                background: #0284c7;
                border: 1px solid #38bdf8;
                color: #ffffff;
                font-weight: 700;
                font-size: 11px;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            `;
            btn.innerHTML = '<i class="fas fa-scissors"></i> <span>EDIT SPRITE SHEET / SLICES</span>';

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const source = getSelectedImageSource(window.selectedObject);
                openEditorSafely(source, window.selectedObject?.name || 'spritesheet');
            };

            const matCard = document.getElementById('materialContainer');
            if (matCard) {
                const body = matCard.querySelector('.inspector-card-body') || matCard;
                body.appendChild(btn);
            } else if (inspectorMain) {
                inspectorMain.prepend(btn);
            }
        } else {
            btn.style.display = 'flex';
        }
    }

    // 2. Listen to ALL Selection & Inspector Events
    [
        'objectSelected',
        'selectionChanged',
        'sm:selection-changed',
        'sm:selected-object-changed',
        'sm:scene-inspector-refreshed'
    ].forEach((evt) => {
        window.addEventListener(evt, () => {
            setTimeout(updateInspectorSpriteButton, 50);
        });
    });

    // Hook into updateInspector if present
    if (typeof window.updateInspector === 'function') {
        const origUpdate = window.updateInspector;
        window.updateInspector = function (...args) {
            const res = origUpdate.apply(this, args);
            setTimeout(updateInspectorSpriteButton, 50);
            return res;
        };
    }

    // 3. Intentionally no topbar click delegation here.
    // "2D Animation" switches to the drawing workspace; it is not a command
    // to edit the selected texture.  Sprite Sheet Studio is opened only from
    // the inspector's explicit button or the Assets Panel context-menu action.

    // Export helpers
    root.openSpriteEditorSafely = openEditorSafely;
    root.getSelectedImageSource = getSelectedImageSource;

    console.log('✅ [SMSpriteEditorBridge] Active and hooked to Inspector & Topbar.');

})(window);
