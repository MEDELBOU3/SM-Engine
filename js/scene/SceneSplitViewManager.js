(function () {
    class SceneSplitViewManager {
        constructor() {
            this.editorScene = document.querySelector('.editor-scene');
            this.root = document.getElementById('sceneSplitRoot');
            this.toggleBtn = document.getElementById('sceneSplitToggleBtn');
            this.label = document.getElementById('sceneSplitLabel');
            this.quickButtons = Array.from(document.querySelectorAll('.curved-menu-btn[data-layout]'));
            this.rendererContainer = document.getElementById('renderer-container');
            this.animationCanvas = document.getElementById('animation-2d-canvas');
            this.videoCanvas = document.getElementById('video-editing-canvas');
            this.primaryPane = this.root?.querySelector('.scene-split-pane-primary') || null;
            this.mirrorPanes = this.root ? Array.from(this.root.querySelectorAll('.scene-split-pane-mirror')) : [];
            this.layouts = ['single', 'dual', 'quad'];
            this.layout = 'single';
            this.allowedCount = 1;
            this.activeMode = 'none';
            this.lastDrawTs = 0;
            this.drawInterval = 1000 / 24;
            this.pendingResize = 0;
            this.raf = 0;

            this.divider = document.getElementById('sceneSplitDivider');
            this.isResizing = false;
            this.splitRatio = 0.6; // default

            if (this.root) {
                this.root.classList.add('scene-split-root');
                this.root.style.display = 'none';
                this.root.setAttribute('aria-hidden', 'true');
            }

            this.setupDivider();

            if (!this.editorScene || !this.root || !this.toggleBtn || !this.primaryPane || !this.rendererContainer) {
                return;
            }

            this.toggleBtn.addEventListener('click', () => this.cycleLayout());
            this.quickButtons.forEach((btn) => {
                if (btn === this.toggleBtn) return;
                btn.addEventListener('click', () => {
                    const layout = btn.dataset.layout;
                    if (layout) this.applyLayout(layout);
                });
            });

            this.sceneResizeObserver = new ResizeObserver(() => {
                this.updateSupportState();
                this.refreshPrimaryCanvas();
                this.requestMirrorDraw(true);
            });
            this.sceneResizeObserver.observe(this.editorScene);

            this.bodyClassObserver = new MutationObserver(() => {
                this.updateSupportState();
                this.refreshPrimaryCanvas();
                this.requestMirrorDraw(true);
            });
            this.bodyClassObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

            window.addEventListener('resize', () => {
                this.updateSupportState();
                this.refreshPrimaryCanvas();
                this.requestMirrorDraw(true);
            });

            this.updateSupportState();
            this.startMirrorLoop();
        }

        detectMode() {
            if (document.body.classList.contains('video-editing-mode')) return 'video';
            if (document.body.classList.contains('animation-2d-mode-active')) return 'animation2d';
            return 'none';
        }

        getMaxPaneCount() {
            const width = this.editorScene?.clientWidth || window.innerWidth || 0;
            const height = this.editorScene?.clientHeight || window.innerHeight || 0;
            if (width >= 1650 && height >= 860) return 4;
            if (width >= 1080 && height >= 620) return 2;
            return 1;
        }

        getAllowedLayouts() {
            const maxCount = this.getMaxPaneCount();
            return this.layouts.filter((layout) => this.getLayoutPaneCount(layout) <= maxCount);
        }

        getLayoutPaneCount(layout) {
            if (layout === 'quad') return 4;
            if (layout === 'dual') return 2;
            return 1;
        }

        cycleLayout() {
            if (this.activeMode === 'none') return;

            const allowed = this.getAllowedLayouts();
            const currentIndex = allowed.indexOf(this.layout);
            const nextLayout = allowed[(currentIndex + 1) % allowed.length] || allowed[0] || 'single';
            this.applyLayout(nextLayout);
        }

        updateSupportState() {
            this.activeMode = this.detectMode();
            const allowed = this.getAllowedLayouts();
            const nextAllowedCount = this.getLayoutPaneCount(allowed[allowed.length - 1] || 'single');
            const supportsSplit = this.activeMode !== 'none' && allowed.length > 1;

            this.allowedCount = nextAllowedCount;
            this.editorScene.classList.toggle('scene-split-supported', supportsSplit);
            this.toggleBtn.disabled = !supportsSplit;
            this.quickButtons.forEach((btn) => {
                const targetLayout = btn.dataset.layout || 'single';
                btn.disabled = this.activeMode === 'none' || !allowed.includes(targetLayout);
                btn.classList.toggle('active', this.layout === targetLayout && this.activeMode !== 'none');
            });

            if (this.activeMode === 'none') {
                this.applyLayout('single');
                return;
            }

            if (!allowed.includes(this.layout)) {
                this.applyLayout(allowed[allowed.length - 1] || 'single');
                return;
            }

            this.updateToolbarLabel();
            this.updatePaneVisibility();
        }

        applyLayout(layout) {
            const allowed = this.getAllowedLayouts();
            const safeLayout = this.activeMode === 'none'
                ? 'single'
                : (allowed.includes(layout) ? layout : (allowed[allowed.length - 1] || 'single'));

            this.layout = safeLayout;
            this.root.classList.remove('scene-split-layout-single', 'scene-split-layout-dual', 'scene-split-layout-quad');
            this.root.classList.add(`scene-split-layout-${safeLayout}`);
            const splitVisible = this.activeMode !== 'none' && this.getLayoutPaneCount(safeLayout) > 1;
            this.root.style.display = splitVisible ? 'grid' : 'none';
            this.root.setAttribute('aria-hidden', splitVisible ? 'false' : 'true');

            if (this.layout === 'dual') {
                this.applyResize();
                this.divider.style.display = 'block';
            } else {
                this.divider.style.display = 'none';

                // ✅ RESET GRID (THIS FIXES YOUR BUG)
                this.root.style.gridTemplateColumns = '';
                this.root.style.gridTemplateRows = '';
            }
            this.updateToolbarLabel();
            this.updatePaneVisibility();
            this.refreshPrimaryCanvas();
            this.requestMirrorDraw(true);
        }

        setupDivider() {
            if (!this.divider) return;

            this.divider.addEventListener('mousedown', (e) => {
                this.isResizing = true;
                document.body.style.cursor = 'col-resize';
                e.preventDefault();
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.isResizing) return;

                const rect = this.root.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;

                // clamp between 20% and 80%
                this.splitRatio = Math.min(0.8, Math.max(0.2, offsetX / rect.width));

                this.applyResize();
            });

            window.addEventListener('mouseup', () => {
                this.isResizing = false;
                document.body.style.cursor = 'default';
            });
        }

        applyResize() {
            if (this.layout !== 'dual') return;

            const left = this.splitRatio * 100;
            const right = 100 - left;

            this.root.style.gridTemplateColumns = `${left}% ${right}%`;

            this.updateDividerPosition();
        }

        updateDividerPosition() {
            if (!this.divider) return;

            const rect = this.root.getBoundingClientRect();
            const x = rect.width * this.splitRatio;

            this.divider.style.left = `${x - 3}px`;
        }

        updateToolbarLabel() {
            if (!this.label) return;

            const paneCount = this.getLayoutPaneCount(this.layout);

            const icons = {
                single: `
            <svg width="18" height="18" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"/>
            </svg>
        `,
                split2d: `
            <svg width="18" height="18" viewBox="0 0 24 24">
                <rect x="3" y="3" width="8" height="18" stroke="currentColor" fill="none" stroke-width="2"/>
                <rect x="13" y="3" width="8" height="18" stroke="currentColor" fill="none" stroke-width="2"/>
            </svg>
        `,
                multi: `
            <svg width="18" height="18" viewBox="0 0 24 24">
                <rect x="3" y="3" width="8" height="8" stroke="currentColor" fill="none" stroke-width="2"/>
                <rect x="13" y="3" width="8" height="8" stroke="currentColor" fill="none" stroke-width="2"/>
                <rect x="3" y="13" width="8" height="8" stroke="currentColor" fill="none" stroke-width="2"/>
                <rect x="13" y="13" width="8" height="8" stroke="currentColor" fill="none" stroke-width="2"/>
            </svg>
        `
            };

            if (this.activeMode === 'none') {
                this.label.innerHTML = icons.single;
                return;
            }

            if (this.activeMode === 'animation2d') {
                this.label.innerHTML = icons.split2d;
                return;
            }

            // fallback based on pane count
            this.label.innerHTML = paneCount === 1 ? icons.single : icons.multi;
        }

        updatePaneVisibility() {
            const visibleCount = this.getLayoutPaneCount(this.layout);

            this.mirrorPanes.forEach((pane, index) => {
                const shouldShow = this.activeMode !== 'none' && index < visibleCount - 1;
                pane.hidden = !shouldShow;
                pane.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
            });
        }

        getSourceCanvas() {
            if (this.activeMode === 'video') return this.videoCanvas;
            if (this.activeMode === 'animation2d') return this.animationCanvas;
            return null;
        }

        refreshPrimaryCanvas() {
            cancelAnimationFrame(this.pendingResize);
            this.pendingResize = requestAnimationFrame(() => {
                if (this.activeMode === 'video' && window.videoEditingManager?.resizeCanvas) {
                    window.videoEditingManager.resizeCanvas();
                }
                if (this.activeMode === 'animation2d' && window.animation2DManager?.resize) {
                    window.animation2DManager.resize();
                }
                if (this.activeMode === 'none') {
                    if (typeof window.onWindowResize === 'function') {
                        window.onWindowResize();
                    } else {
                        window.dispatchEvent(new Event('resize'));
                    }
                }
            });
        }

        requestMirrorDraw(force) {
            if (!force && this.getLayoutPaneCount(this.layout) <= 1) return;
            this.lastDrawTs = 0;
        }

        startMirrorLoop() {
            const draw = (ts) => {
                this.raf = requestAnimationFrame(draw);

                const paneCount = this.getLayoutPaneCount(this.layout);
                if (this.activeMode === 'none' || paneCount <= 1) return;
                if (ts - this.lastDrawTs < this.drawInterval) return;

                this.lastDrawTs = ts;
                this.drawMirrors();
            };

            this.raf = requestAnimationFrame(draw);
        }

        drawMirrors() {
            const source = this.getSourceCanvas();
            if (!source || !source.width || !source.height) return;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const imageSmoothing = this.activeMode === 'video';

            this.mirrorPanes.forEach((pane, index) => {
                if (pane.hidden) return;

                const canvas = pane.querySelector('.scene-split-mirror-canvas');
                if (!canvas) return;

                const rect = pane.getBoundingClientRect();
                const width = Math.max(1, Math.floor(rect.width));
                const height = Math.max(1, Math.floor(rect.height));
                const bufferWidth = Math.max(1, Math.floor(width * dpr));
                const bufferHeight = Math.max(1, Math.floor(height * dpr));

                if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
                    canvas.width = bufferWidth;
                    canvas.height = bufferHeight;
                }

                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.imageSmoothingEnabled = imageSmoothing;
                ctx.fillStyle = '#0f1114';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const fit = Math.min(canvas.width / source.width, canvas.height / source.height);
                const drawWidth = Math.max(1, Math.floor(source.width * fit));
                const drawHeight = Math.max(1, Math.floor(source.height * fit));
                const offsetX = Math.floor((canvas.width - drawWidth) * 0.5);
                const offsetY = Math.floor((canvas.height - drawHeight) * 0.5);

                ctx.drawImage(source, 0, 0, source.width, source.height, offsetX, offsetY, drawWidth, drawHeight);

                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.lineWidth = Math.max(1, dpr);
                ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
            });
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        window.sceneSplitViewManager = new SceneSplitViewManager();
    });
})();
