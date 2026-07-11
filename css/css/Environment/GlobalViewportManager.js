/**
 * ============================================================================
 * GLOBAL VIEWPORT MANAGER (Shared WebGL Context)
 * Handles smooth transitions, scene swapping, and memory management for multiple
 * node editors using a single, highly-optimized WebGL Renderer.
 * ============================================================================
 */

class GlobalViewportManager {
    constructor() {
        if (GlobalViewportManager.instance) {
            return GlobalViewportManager.instance;
        }
        GlobalViewportManager.instance = this;

        this.states = new Map();
        this.currentStateId = null;
        this.isTransitioning = false;
        this.clock = new THREE.Clock();

        this.initDOM();
        this.initRenderer();
        this.startRenderLoop();

        // Handle window resizing
        window.addEventListener('resize', () => this.resizeCurrentViewport());
        
        console.log("🖥️ Global Viewport Manager Initialized.");
    }

    // ==========================================
    // 1. SETUP CORE SYSTEMS
    // ==========================================
    initDOM() {
        // Create the wrapper that will teleport between editor panels
        this.viewportWrapper = document.createElement('div');
        this.viewportWrapper.id = 'shared-viewport-wrapper';
        this.viewportWrapper.style.cssText = `
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
            background-color: #111;
        `;

        // The actual WebGL Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'shared-viewport-canvas';
        this.canvas.style.cssText = `
            width: 100%;
            height: 100%;
            display: block;
            outline: none;
        `;
        this.viewportWrapper.appendChild(this.canvas);

        // The Fade Overlay (For smooth transitions)
        this.fadeOverlay = document.createElement('div');
        this.fadeOverlay.id = 'shared-viewport-fade';
        this.fadeOverlay.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background-color: #111;
            z-index: 10;
            opacity: 1;
            transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
        `;
        this.viewportWrapper.appendChild(this.fadeOverlay);
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance"
        });
        
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.55;
    }

    // ==========================================
    // 2. STATE REGISTRATION
    // ==========================================
    /**
     * Registers an editor's scene to the manager.
     * @param {string} id - e.g., 'material-preview', 'player-graph'
     * @param {object} config - { scene, camera, controls, onUpdate, targetElementId }
     */
    registerState(id, config) {
        if (!config.scene || !config.camera || !config.targetElementId) {
            console.error(`ViewportManager: Missing required config for state '${id}'`);
            return;
        }

        this.states.set(id, {
            scene: config.scene,
            camera: config.camera,
            controls: config.controls || null,
            onUpdate: config.onUpdate || null,
            onEnter: config.onEnter || null,
            onExit: config.onExit || null,
            targetContainer: document.getElementById(config.targetElementId)
        });

        console.log(`🖥️ Viewport State Registered: ${id}`);
    }

    // ==========================================
    // 3. TRANSITION LOGIC
    // ==========================================
    /**
     * Smoothly transitions the canvas to a new editor.
     * @param {string} nextStateId 
     */
    async transitionTo(nextStateId) {
        if (this.currentStateId === nextStateId || this.isTransitioning) return;
        
        const nextState = this.states.get(nextStateId);
        if (!nextState || !nextState.targetContainer) {
            console.warn(`ViewportManager: State '${nextStateId}' not found or missing container.`);
            return;
        }

        this.isTransitioning = true;

        // 1. FADE OUT
        this.fadeOverlay.style.opacity = '1';
        await this.sleep(300); // Wait for CSS transition

        // 2. CLEANUP OLD STATE
        const prevState = this.states.get(this.currentStateId);
        if (prevState) {
            if (prevState.onExit) prevState.onExit();
            if (prevState.controls) prevState.controls.enabled = false;
        }

        // 3. TELEPORT DOM ELEMENT
        nextState.targetContainer.innerHTML = ''; // Clear container
        nextState.targetContainer.appendChild(this.viewportWrapper);

        // 4. ACTIVATE NEW STATE
        this.currentStateId = nextStateId;
        if (nextState.controls) nextState.controls.enabled = true;
        if (nextState.onEnter) nextState.onEnter();

        // 5. RECALCULATE RESOLUTION
        this.resizeCurrentViewport();

        // 6. FADE IN
        // Small delay ensures the browser has rendered the new layout before fading in
        requestAnimationFrame(() => {
            this.fadeOverlay.style.opacity = '0';
            setTimeout(() => { this.isTransitioning = false; }, 300);
        });
    }

    // ==========================================
    // 4. RENDERING & UPDATES
    // ==========================================
    resizeCurrentViewport() {
        if (!this.currentStateId) return;
        const state = this.states.get(this.currentStateId);
        if (!state || !state.targetContainer) return;

        const rect = state.targetContainer.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        this.renderer.setSize(rect.width, rect.height, false);
        
        if (state.camera.isPerspectiveCamera) {
            state.camera.aspect = rect.width / rect.height;
            state.camera.updateProjectionMatrix();
        }
    }

    startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate);

            // Don't render heavy scenes while the screen is black
            if (this.isTransitioning && this.fadeOverlay.style.opacity === '1') return;

            const state = this.states.get(this.currentStateId);
            if (!state) return;

            const delta = this.clock.getDelta();

            // Run editor-specific logic (e.g., rotating the material sphere)
            if (state.onUpdate) {
                state.onUpdate(delta);
            }

            // Update orbit controls
            if (state.controls && state.controls.update) {
                state.controls.update();
            }

            // Render the active scene
            this.renderer.render(state.scene, state.camera);
        };
        animate();
    }

    // Utility sleep function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Auto-instantiate the Singleton
window.ViewportManager = new GlobalViewportManager();
