/**
 * SM Engine — Legacy 2D Brush Button compatibility shim
 * ------------------------------------------------------
 * Button ownership moved to Anime2DWorkspace.js. This class remains so older
 * code that calls window.brushPanelHandlers.* does not break, but it no longer
 * binds a second set of DOM listeners.
 */
(function () {
    'use strict';

    class BrushPanelButtonHandlers {
        constructor() {
            this.storyboardPanelVisible = false;

            window.addEventListener('sm:2d-workspace-cleaned', () => {
                this.storyboardPanelVisible = false;
            });
        }

        get workspace() {
            return window.anime2DWorkspace || null;
        }

        get manager() {
            return window.animation2DManager || window.animation2DManagerAdvanced || null;
        }

        setupButtonHandlers() {
            // Intentionally empty. Anime2DWorkspace uses delegated events so controls
            // can be moved/rebuilt without losing handlers.
            return true;
        }

        setupStoryboardToggle() {
            return true;
        }

        toggleStoryboard() {
            const active = !!this.manager?.isActive ||
                document.body.classList.contains('animation-2d-mode-active');

            if (!active) {
                this.storyboardPanelVisible = false;
                document.getElementById('storyboard-header')?.style.setProperty('display', 'none');
                document.getElementById('storyboard-panel')?.style.setProperty('display', 'none');
                return;
            }

            if (this.workspace) {
                this.workspace.openStoryboard?.();
                return;
            }

            const storyboardHeader = document.getElementById('storyboard-header');
            const storyboardPanel = document.getElementById('storyboard-panel');
            if (!storyboardPanel) return;

            this.storyboardPanelVisible = !this.storyboardPanelVisible;
            if (storyboardHeader) storyboardHeader.style.display = this.storyboardPanelVisible ? 'flex' : 'none';
            storyboardPanel.style.display = this.storyboardPanelVisible ? 'flex' : 'none';

            if (this.storyboardPanelVisible && !window.storyboard2DManager && window.Storyboard2DManager) {
                window.storyboard2DManager = new window.Storyboard2DManager('#storyboard-panel');
            }
        }

        handleUndo() {
            this.workspace?.runAction?.('undo') || this.manager?.undo?.();
        }

        handleRedo() {
            this.workspace?.runAction?.('redo') || this.manager?.redo?.();
        }

        handleRefresh() {
            this.manager?.render?.();
        }

        handlePanelToggle() {
            // The old bottom mega-panel no longer exists. Open Tool properties instead.
            this.workspace?.setRightTab?.('tool');
        }

        handleFitToFrame() {
            if (this.workspace) this.workspace.fitCanvasToView?.();
            else this.manager?.render?.();
        }

        handleImportImage() {
            if (this.workspace) {
                document.getElementById('brush-ref-image-input')?.click();
                return;
            }
            this._fallbackImagePicker();
        }

        handleImportVideo() {
            if (this.workspace) {
                this.workspace.importReferenceVideo?.();
                return;
            }
        }

        handleClearReferences() {
            if (this.workspace) {
                this.workspace.clearReferences?.();
                return;
            }
            const manager = this.manager;
            if (!manager) return;
            manager.referenceObjects = [];
            manager.referenceImage = null;
            manager.selectedRefId = null;
            manager.render?.();
        }

        handleShadowToggle() {
            const manager = this.manager;
            if (!manager) return;
            manager.shadowsEnabled = !manager.shadowsEnabled;
            manager.render?.();
        }

        handleExportDrawing() {
            if (this.workspace) {
                this.workspace.exportCurrentFrame?.();
                return;
            }
            const manager = this.manager;
            if (!manager?.canvas) return;
            const link = document.createElement('a');
            link.href = manager.canvas.toDataURL('image/png');
            link.download = `drawing_${Date.now()}.png`;
            link.click();
        }

        handleSettings() {
            this.workspace?.openSettings?.();
        }

        _fallbackImagePicker() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = () => {
                const file = input.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const manager = this.manager;
                        if (!manager) return;
                        manager.referenceObjects = Array.isArray(manager.referenceObjects) ? manager.referenceObjects : [];
                        manager.referenceObjects.push({
                            id: `ref_${Date.now()}`,
                            type: 'image',
                            content: img,
                            x: 0,
                            y: 0,
                            w: img.width,
                            h: img.height,
                            opacity: .5,
                            enabled: true
                        });
                        manager.render?.();
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            };
            input.click();
        }
    }

    window.BrushPanelButtonHandlers = BrushPanelButtonHandlers;
    window.brushPanelHandlers = window.brushPanelHandlers || new BrushPanelButtonHandlers();
})();