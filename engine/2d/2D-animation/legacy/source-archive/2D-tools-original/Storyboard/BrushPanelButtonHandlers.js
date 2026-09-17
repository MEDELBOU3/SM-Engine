/**
 * BrushPanelButtonHandlers.js
 * Manages all brush panel button actions including storyboard toggle
 * 
 * This script ensures all buttons in the brush-shelf-actions div work properly
 */

class BrushPanelButtonHandlers {
    constructor() {
        this.storyboardPanelVisible = false;
        this.initializeHandlers();
    }

    initializeHandlers() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupButtonHandlers());
        } else {
            this.setupButtonHandlers();
        }
    }

    setupButtonHandlers() {
        // Storyboard Toggle Button
        this.setupStoryboardToggle();

        // Undo Button
        const undoBtn = document.getElementById('brush-2d-undo-btn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.handleUndo());
        }

        // Redo Button
        const redoBtn = document.getElementById('brush-2d-redo-btn');
        if (redoBtn) {
            redoBtn.addEventListener('click', () => this.handleRedo());
        }

        // Refresh Button
        const refreshBtn = document.getElementById('brush-2d-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.handleRefresh());
        }

        // Toggle Panel Button
        const toggleBtn = document.getElementById('brush-panel-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.handlePanelToggle());
        }

        // Fit to Frame Button
        const fitBtn = document.getElementById('brush-toggle-fit-btn');
        if (fitBtn) {
            fitBtn.addEventListener('click', () => this.handleFitToFrame());
        }

        // Import Image Button
        const importImgBtn = document.getElementById('brush-import-image-btn');
        if (importImgBtn) {
            importImgBtn.addEventListener('click', () => this.handleImportImage());
        }

        // Import Video Button
        const importVidBtn = document.getElementById('brush-import-video-btn');
        if (importVidBtn) {
            importVidBtn.addEventListener('click', () => this.handleImportVideo());
        }

        // Clear References Button
        const clearRefBtn = document.getElementById('brush-clear-image-btn');
        if (clearRefBtn) {
            clearRefBtn.addEventListener('click', () => this.handleClearReferences());
        }

        // Shadow Toggle Button
        const shadowBtn = document.getElementById('brush-2d-shadow-btn');
        if (shadowBtn) {
            shadowBtn.addEventListener('click', () => this.handleShadowToggle());
        }

        // Export Drawing Button
        const exportBtn = document.getElementById('brush-2d-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.handleExportDrawing());
        }

        // Settings Button
        const settingsBtn = document.getElementById('brush-2d-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.handleSettings());
        }
    }

    /* ═══════════════════════════════════════════════════════
       STORYBOARD BUTTON HANDLER
    ═══════════════════════════════════════════════════════ */

    setupStoryboardToggle() {
        const storyboardBtn = document.getElementById('brush-2d-storyboard-btn');
        if (storyboardBtn) {
            storyboardBtn.addEventListener('click', () => this.toggleStoryboard());
        }
    }

    toggleStoryboard() {
        const storyboardHeader = document.getElementById('storyboard-header');
        const storyboardPanel = document.getElementById('storyboard-panel');
        const storyboardBtn = document.getElementById('brush-2d-storyboard-btn');

        if (!storyboardHeader || !storyboardPanel) {
            console.warn('Storyboard panel elements not found in DOM');
            return;
        }

        if (this.storyboardPanelVisible) {
            // Hide storyboard
            storyboardHeader.style.display = 'none';
            storyboardPanel.style.display = 'none';
            this.storyboardPanelVisible = false;
            if (storyboardBtn) storyboardBtn.classList.remove('active');
        } else {
            // Show storyboard
            storyboardHeader.style.display = 'flex';
            storyboardPanel.style.display = 'flex';
            this.storyboardPanelVisible = true;
            if (storyboardBtn) storyboardBtn.classList.add('active');

            // Initialize storyboard manager if not already done
            if (!window.storyboard2DManager) {
                window.storyboard2DManager = new Storyboard2DManager('#storyboard-panel');
            }
        }
    }

    /* ═══════════════════════════════════════════════════════
       BRUSH PANEL BUTTON HANDLERS
    ═══════════════════════════════════════════════════════ */

    handleUndo() {
        const animation2D = window.animation2DManager;
        if (animation2D && animation2D.undo) {
            animation2D.undo();
            console.log('✓ Undo executed');
        } else {
            console.warn('Undo not available');
        }
    }

    handleRedo() {
        const animation2D = window.animation2DManager;
        if (animation2D && animation2D.redo) {
            animation2D.redo();
            console.log('✓ Redo executed');
        } else {
            console.warn('Redo not available');
        }
    }

    handleRefresh() {
        const animation2D = window.animation2DManager;
        if (animation2D && animation2D.render) {
            animation2D.render();
            console.log('✓ Canvas refreshed');
        } else {
            console.warn('Refresh not available');
        }
    }

    handlePanelToggle() {
        const brushPanel = document.getElementById('timeline-2d-brush-panel');
        const brushStrip = document.getElementById('brush-shelf-strip');
        const brushStatus = document.getElementById('brush-active-info');
        const brushContent = document.querySelector('.brush-panel-content');
        const toggleBtn = document.getElementById('brush-panel-toggle-btn');
        const toggleIcon = toggleBtn?.querySelector('i');

        if (brushPanel) {
            // Toggle the collapsed state
            brushPanel.classList.toggle('collapsed');

            // Toggle content sections visibility (header always stays visible)
            if (brushStrip) brushStrip.style.display = brushPanel.classList.contains('collapsed') ? 'none' : 'flex';
            if (brushStatus) brushStatus.style.display = brushPanel.classList.contains('collapsed') ? 'none' : 'block';
            if (brushContent) brushContent.style.display = brushPanel.classList.contains('collapsed') ? 'none' : 'flex';

            // Update toggle button icon
            if (toggleIcon) {
                toggleIcon.className = brushPanel.classList.contains('collapsed')
                    ? 'fas fa-caret-down'
                    : 'fas fa-caret-up';
            }

            console.log('✓ Panel toggled:', brushPanel.classList.contains('collapsed') ? 'collapsed (header only)' : 'expanded');
        }
    }

    handleFitToFrame() {
        const animation2D = window.animation2DManager;
        if (animation2D) {
            // Fit canvas to viewport
            if (animation2D.canvas) {
                animation2D.canvas.width = animation2D.container.clientWidth;
                animation2D.canvas.height = animation2D.container.clientHeight;
                animation2D.render();
                console.log('✓ Canvas fitted to frame');
            }
        }
    }

    handleImportImage() {
        const input = document.createElement('input');

        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = (e) => {
            const file = e.target.files?.[0];

            if (!file) return;

            const animation2D = window.animation2DManager;

            if (!animation2D) {
                console.warn('[2D] Animation2DManager not found');
                return;
            }

            if (typeof animation2D.loadReferenceImage === 'function') {
                animation2D.loadReferenceImage(file);
                console.log('[2D] Reference image loaded:', file.name);
                return;
            }

            // fallback
            const reader = new FileReader();

            reader.onload = (event) => {
                const img = new Image();

                img.onload = () => {
                    animation2D.referenceImage = img;
                    animation2D.referenceImageOpacity = 0.5;
                    animation2D.referenceFitMode = 'fit';

                    animation2D.render?.();

                    console.log('[2D] Reference image ready:', {
                        width: img.width,
                        height: img.height
                    });
                };

                img.onerror = () => {
                    console.error('[2D] Failed loading reference image');
                };

                img.src = event.target.result;
            };

            reader.readAsDataURL(file);
        };

        input.click();
    }

    handleImportVideo() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.src = url;
                video.onloadedmetadata = () => {
                    const animation2D = window.animation2DManager;
                    if (animation2D) {
                        animation2D.referenceObjects.push({
                            id: 'ref_' + Date.now(),
                            type: 'video',
                            content: video,
                            x: 0,
                            y: 0,
                            w: video.videoWidth,
                            h: video.videoHeight,
                            opacity: 0.5,
                            enabled: true
                        });
                        video.play();
                        animation2D.render();
                        console.log('✓ Video imported as reference');
                    }
                };
            }
        };
        input.click();
    }

    handleClearReferences() {
        const animation2D = window.animation2DManager;

        if (!animation2D) return;

        animation2D.referenceImage = null;

        animation2D.render?.();

        console.log('[2D] Reference image cleared');
    }

    handleShadowToggle() {
        const animation2D = window.animation2DManager;
        if (animation2D) {
            animation2D.shadowsEnabled = !animation2D.shadowsEnabled;
            animation2D.render();
            console.log('✓ Shadows toggled:', animation2D.shadowsEnabled);
        }
    }

    handleExportDrawing() {
        const animation2D = window.animation2DManager;
        if (animation2D && animation2D.canvas) {
            const link = document.createElement('a');
            link.href = animation2D.canvas.toDataURL('image/png');
            link.download = `drawing_${Date.now()}.png`;
            link.click();
            console.log('✓ Drawing exported');
        }
    }

    handleSettings() {
        console.log('⚙️ Settings panel would open here');
        alert('Settings panel - customize your brush and drawing preferences');
    }
}

// Auto-initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.brushPanelHandlers = new BrushPanelButtonHandlers();
    });
} else {
    window.brushPanelHandlers = new BrushPanelButtonHandlers();
}
