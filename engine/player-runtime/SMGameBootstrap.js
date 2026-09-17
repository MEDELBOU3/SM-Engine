(function () {
    'use strict';
    class SMGameBootstrap {
        constructor(options = {}) {
            this.options = { manifestURL: 'game.manifest.json', container: '#sm-game-root', background: 0x111111, antialias: true, alpha: false, pixelRatio: 'auto', autoStart: true, showLoading: true, ...options };
            this.container = null;
            this.scene = null;
            this.camera = null;
            this.renderer = null;
            this.clock = null;
            this.runtime = null;
            this.running = false;
            this.frame = 0;
            this._raf = 0;
            this._lastTime = 0;
            this._loadingElement = null;
            this._resizeHandler = () => this.resize();
        }
        async boot(options = {}) {
            this.options = { ...this.options, ...options };
            this._ensureDOM();
            this._ensureThreeScene();
            this._setLoading('Loading game…', 0);
            this.runtime = new window.SMStandaloneRuntime({ manifestURL: this.options.manifestURL, baseURL: this.options.baseURL || './', preloadAssets: this.options.preloadAssets === true, assetConcurrency: this.options.assetConcurrency || 4 });
            await this.runtime.initialize({
                onAssetProgress: info => {
                    const ratio = info.total ? info.index / info.total : 0;
                    this._setLoading(`Loading assets ${info.index}/${info.total}`, ratio);
                }
            });
            this._setLoading('Starting runtime…', 0.9);
            await this.runtime.start({ openStartLevel: this.options.openStartLevel !== false });
            this._setLoading('Ready', 1);
            this._hideLoading();
            if (this.options.autoStart !== false) this.startLoop();
            window.SMGameBootstrapInstance = this;
            window.dispatchEvent(new CustomEvent('sm:game-booted', { detail: { bootstrap: this, runtime: this.runtime } }));
            return this;
        }
        startLoop() {
            if (this.running) return true;
            this.running = true;
            this._lastTime = performance.now();
            const frame = time => {
                if (!this.running) return;
                const rawDelta = Math.max(0, (time - this._lastTime) / 1000);
                this._lastTime = time;
                const delta = Math.min(rawDelta, 0.1);
                this.frame += 1;
                try { window.SMRuntime?.update?.(delta, time / 1000); } catch (error) { console.error('[SMGameBootstrap] Runtime update failed.', error); }
                try { this.renderer?.render?.(window.scene || this.scene, window.camera || this.camera); } catch (error) { console.error('[SMGameBootstrap] Render failed.', error); }
                this._raf = requestAnimationFrame(frame);
            };
            this._raf = requestAnimationFrame(frame);
            return true;
        }
        stopLoop() {
            this.running = false;
            if (this._raf) cancelAnimationFrame(this._raf);
            this._raf = 0;
            return true;
        }
        async shutdown(reason = 'shutdown') {
            this.stopLoop();
            await this.runtime?.stop?.(reason);
            window.removeEventListener('resize', this._resizeHandler);
            try { this.renderer?.dispose?.(); } catch { }
            return true;
        }
        resize() {
            if (!this.renderer || !this.camera || !this.container) return false;
            const width = Math.max(1, this.container.clientWidth || window.innerWidth);
            const height = Math.max(1, this.container.clientHeight || window.innerHeight);
            this.renderer.setSize(width, height, false);
            if (this.camera.isPerspectiveCamera) {
                this.camera.aspect = width / height;
                this.camera.updateProjectionMatrix();
            } else if (this.camera.isOrthographicCamera) {
                const aspect = width / height;
                const size = 10;
                this.camera.left = -size * aspect;
                this.camera.right = size * aspect;
                this.camera.top = size;
                this.camera.bottom = -size;
                this.camera.updateProjectionMatrix();
            }
            return true;
        }
        _ensureDOM() {
            let container = null;
            if (typeof this.options.container === 'string') container = document.querySelector(this.options.container);
            else container = this.options.container;
            if (!container) {
                container = document.createElement('div');
                container.id = 'sm-game-root';
                container.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#111;';
                document.body.appendChild(container);
            }
            this.container = container;
            document.documentElement.style.width = '100%';
            document.documentElement.style.height = '100%';
            document.body.style.margin = '0';
            document.body.style.width = '100%';
            document.body.style.height = '100%';
            document.body.style.overflow = 'hidden';
            if (this.options.showLoading) this._createLoading();
            return container;
        }
        _ensureThreeScene() {
            if (!window.THREE) throw new Error('THREE.js must be loaded before SMGameBootstrap.');
            this.scene = window.scene?.isScene ? window.scene : new THREE.Scene();
            if (!window.scene) window.scene = this.scene;
            if (this.scene.background === null || this.scene.background === undefined) this.scene.background = new THREE.Color(this.options.background);
            this.camera = window.camera?.isCamera ? window.camera : new THREE.PerspectiveCamera(60, 1, 0.05, 5000);
            if (!window.camera) {
                this.camera.position.set(0, 2, 5);
                window.camera = this.camera;
            }
            this.renderer = window.renderer?.isWebGLRenderer ? window.renderer : new THREE.WebGLRenderer({ antialias: this.options.antialias !== false, alpha: this.options.alpha === true, powerPreference: 'high-performance' });
            if (!window.renderer) window.renderer = this.renderer;
            const ratio = this.options.pixelRatio === 'auto' ? Math.min(window.devicePixelRatio || 1, 2) : Math.max(0.5, Number(this.options.pixelRatio) || 1);
            this.renderer.setPixelRatio(ratio);
            if (!this.renderer.domElement.parentElement) this.container.appendChild(this.renderer.domElement);
            this.renderer.domElement.style.width = '100%';
            this.renderer.domElement.style.height = '100%';
            this.renderer.domElement.style.display = 'block';
            this.clock = new THREE.Clock();
            window.activeCamera = window.camera;
            window.currentCamera = window.camera;
            window.addEventListener('resize', this._resizeHandler);
            this.resize();
            return { scene: this.scene, camera: this.camera, renderer: this.renderer };
        }
        _createLoading() {
            if (this._loadingElement) return this._loadingElement;
            const root = document.createElement('div');
            root.id = 'sm-game-loading';
            root.style.cssText = 'position:absolute;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:#181818;color:#f2f2f2;font-family:Inter,Segoe UI,Arial,sans-serif;';
            root.innerHTML = '<div style="width:min(420px,72vw)"><div id="sm-game-loading-label" style="font-size:13px;margin-bottom:10px;color:#d8d8d8">Loading…</div><div style="height:3px;background:#303030;overflow:hidden"><div id="sm-game-loading-bar" style="width:0%;height:100%;background:#d48b43;transition:width .15s linear"></div></div></div>';
            this.container.appendChild(root);
            this._loadingElement = root;
            return root;
        }
        _setLoading(label, progress = 0) {
            if (!this._loadingElement) return;
            const text = this._loadingElement.querySelector('#sm-game-loading-label');
            const bar = this._loadingElement.querySelector('#sm-game-loading-bar');
            if (text) text.textContent = String(label || 'Loading…');
            if (bar) bar.style.width = `${Math.max(0, Math.min(1, Number(progress) || 0)) * 100}%`;
        }
        _hideLoading() {
            if (!this._loadingElement) return;
            this._loadingElement.style.opacity = '0';
            this._loadingElement.style.transition = 'opacity .2s ease';
            setTimeout(() => { this._loadingElement?.remove(); this._loadingElement = null; }, 220);
        }
        static async autoStart(options = {}) {
            const bootstrap = new SMGameBootstrap({ ...window.SM_GAME_BOOT_CONFIG, ...options });
            return await bootstrap.boot();
        }
        debug() {
            const state = { running: this.running, frame: this.frame, scene: window.scene?.uuid || null, camera: window.camera?.uuid || null, renderer: !!window.renderer, runtime: this.runtime?.debug?.() };
            console.log('[SMGameBootstrap]', state);
            return state;
        }
    }
    window.SMGameBootstrap = SMGameBootstrap;
    window.SMGameBootstrapClass = SMGameBootstrap;
})();