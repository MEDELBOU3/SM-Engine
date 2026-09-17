// ============================================================================
// engine/2d/SM2DEnvironmentSystem.js
// SM Engine - 2D Environment Master Coordinator & Lifecycle Manager
// ============================================================================
(function (root) {
    'use strict';

    class SM2DEnvironmentSystem {
        constructor() {
            this.active = false;
            this.scene = null;
            this.camera = null;
            this.grid = null;
            this.cameraController = null;
            this.parallax = null;

            this._raf = 0;
            this._lastTime = performance.now();
            this._loop = this._loop.bind(this);

            this._bindWorkspaceEvents();
        }

        init(scene = root.scene, camera = root.camera) {
            this.scene = scene || root.scene;
            this.camera = camera || root.camera;

            // Initialize Subsystems
            if (root.SMCamera2D && !this.cameraController) {
                this.cameraController = new root.SMCamera2D(this.camera);
            }
            if (root.SMParallaxBackground && !this.parallax) {
                this.parallax = new root.SMParallaxBackground(this.scene);
            }

            console.log('✅ [SM2DEnvironmentSystem] Initialized.');
            return this;
        }

        _bindWorkspaceEvents() {
            root.addEventListener('sm:workspace-manager-mode-applied', (e) => {
                const mode = String(e.detail?.mode || '').toUpperCase();
                const subMode = String(
                    root.workspaceManager?.currentGameMode ||
                    localStorage.getItem('sm_game_dev_mode') ||
                    '3D'
                ).toUpperCase();

                if (mode === 'GAME_DEV' && subMode === '2D') {
                    this.activate();
                } else if (this.active) {
                    this.deactivate();
                }
            });

            root.addEventListener('sm:pie-start', (e) => {
                const subMode = String(e.detail?.gameMode || root.workspaceManager?.currentGameMode || '3D').toUpperCase();
                if (subMode === '2D' && this.cameraController) {
                    const target = root.playerSystem?.character?.model || root.playerSystem?.model;
                    if (target) {
                        this.cameraController.setTarget(target);
                    }
                }
            });
        }

        activate() {
            if (this.active) return;
            this.active = true;
            this.init();

            console.log('[SM2DEnvironmentSystem] Activating 2D Game Environment...');

            // 1. Build and show 2D Adaptive Grid
            if (root.SM2DGraphGrid && this.scene) {
                this.grid = root.SM2DGraphGrid.create({ extent: 120, minorStep: 1, majorStep: 5 });
                if (this.grid) this.scene.add(this.grid);
            }

            // 2. Set Up Orthographic Camera
            if (this.cameraController) {
                this.cameraController.snapToCenter(0, 2);
            }

            // 3. Start Update Loop
            this._lastTime = performance.now();
            cancelAnimationFrame(this._raf);
            this._raf = requestAnimationFrame(this._loop);

            root.dispatchEvent(new CustomEvent('sm:2d-environment-activated'));
        }

        deactivate() {
            if (!this.active) return;
            this.active = false;
            cancelAnimationFrame(this._raf);
            this._raf = 0;

            console.log('[SM2DEnvironmentSystem] Deactivating 2D Game Environment...');

            // Remove 2D Grid
            if (this.grid) {
                root.SM2DGraphGrid?.dispose?.(this.grid);
                this.grid = null;
            }

            // Hide/Clear Parallax
            if (this.parallax) {
                this.parallax.clear();
            }

            root.dispatchEvent(new CustomEvent('sm:2d-environment-deactivated'));
        }

        _loop(now) {
            if (!this.active) return;

            const delta = Math.min(0.05, Math.max(0.001, (now - this._lastTime) / 1000));
            this._lastTime = now;

            // 1. Update Camera Follow & Clamping
            if (this.cameraController) {
                this.cameraController.update(delta);
            }

            // 2. Update Parallax Scrolling
            if (this.parallax && this.camera) {
                this.parallax.update(this.camera.position.x, this.camera.position.y);
            }

            // 3. Update Adaptive Grid
            if (this.grid && root.SM2DGraphGrid && this.camera) {
                root.SM2DGraphGrid.update(this.grid, this.camera, window.innerWidth, window.innerHeight);
            }

            this._raf = requestAnimationFrame(this._loop);
        }
    }

    root.SM2DEnvironmentSystem = new SM2DEnvironmentSystem();

})(window);