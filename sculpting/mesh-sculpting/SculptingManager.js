// ============================================================================
// SculptingManager.js  —  SM Engine (WASM Edition)
// ============================================================================
// Drop-in replacement for the original SculptingManager.js.
// Adds:
//   ▸ WASM-aware applyHistoryStep (syncs WASM after undo/redo)
//   ▸ Extended extendSculptMethod that correctly handles all brush modes
//     including the new crease path (was mis-spelled 'applyCreas' in original)
//   ▸ exportSculptedMesh, workflow presets, strength/size/hardness presets
//     — all unchanged from original
//   ▸ Every method that modifies positions now calls SculptWASM.syncPositions()
//     + SculptWASM.syncNormals() + SculptWASM.rebuildBVH() afterward
// ============================================================================

class IntegratedSculptingManager {
    constructor(scene, camera, renderer) {
        this.scene    = scene;
        this.camera   = camera;
        this.renderer = renderer;
        this.sculptingSystem = null;
        this.historyManager  = null;
        this.init();
    }

    init() {
        console.log("🎨 Initialising Integrated Sculpting Manager…");

        /* Step 1 — main sculpting system (defined in character-tools.js) */
        this.sculptingSystem = new AdvancedSculptingSystem(this.scene, this.camera, this.renderer);

        /* Step 2 — history */
        this.setupHistoryManager();

        /* Step 3 — brush routing extension */
        this.extendSculptMethod();

        /* Step 4 — extra UI listeners */
        this.setupUIListeners();

        /* Step 5 — keyboard shortcuts */
        this.setupKeyboardShortcuts();

        console.log("✅ Integrated Sculpting Manager ready!");
    }

    // ── History manager ───────────────────────────────────────────────────

    setupHistoryManager() {
        this.historyManager = {
            steps: [],
            currentStep: -1,

            addStep: (step) => {
                this.historyManager.steps =
                    this.historyManager.steps.slice(0, this.historyManager.currentStep + 1);
                this.historyManager.steps.push(step);
                this.historyManager.currentStep++;
                if (this.historyManager.steps.length > 50) {
                    this.historyManager.steps.shift();
                    this.historyManager.currentStep--;
                }
            },

            undo: () => {
                if (this.historyManager.currentStep > 0) {
                    this.historyManager.currentStep--;
                    const step = this.historyManager.steps[this.historyManager.currentStep];
                    this.applyHistoryStep(step, 'before');
                }
            },

            redo: () => {
                if (this.historyManager.currentStep < this.historyManager.steps.length - 1) {
                    this.historyManager.currentStep++;
                    const step = this.historyManager.steps[this.historyManager.currentStep];
                    this.applyHistoryStep(step, 'after');
                }
            }
        };

        this.sculptingSystem.setHistoryManager(this.historyManager);
    }

    /**
     * Apply a history step.
     * After writing positions back we must keep WASM in sync so the next
     * brush stroke sees the correct vertex data.
     *
     * @param {object} step   — {objectUuid, before, after, type, name}
     * @param {'before'|'after'} which
     */
    applyHistoryStep(step, which = 'after') {
        if (!step) return;
        const obj = this.scene.getObjectByProperty('uuid', step.objectUuid);
        if (!obj?.geometry) return;

        const posArray = obj.geometry.attributes.position.array;
        posArray.set(step[which]);
        obj.geometry.attributes.position.needsUpdate = true;
        obj.geometry.computeVertexNormals();
        obj.geometry.computeBoundingBox();

        /* ── WASM sync after undo/redo ── */
        if (window.SculptWASM?.isReady()) {
            SculptWASM.syncPositions();
            SculptWASM.syncNormals();
            SculptWASM.rebuildBVH();
        }

        /* Keep the JS spatial index fresh too */
        if (this.sculptingSystem.currentMesh === obj) {
            this.sculptingSystem.buildSpatialIndex();
        }
    }

    // ── Sculpt method extension ───────────────────────────────────────────

    /**
     * Extends the sculpt() routing table in AdvancedSculptingSystem with
     * the additional brush modes that SculptingManager is responsible for.
     * 
     * Note: character-tools.js already handles all standard modes in its
     * _applyStandardSculpt(), so here we only add modes that were originally
     * on the prototype (crease, surface-offset, directional-smooth) to make
     * the routing explicit and ensure they pass through the WASM path.
     */
    extendSculptMethod() {
        const sys = this.sculptingSystem;
        const origSculpt = sys.sculpt.bind(sys);

        sys.sculpt = function (hitPoint, normal) {
            /* Update stroke direction tracker */
            if (this.lastHitPoint) {
                this.strokeTracker.direction.subVectors(hitPoint, this.lastHitPoint).normalize();
            }
            this.strokeTracker.lastPoint = hitPoint.clone();

            /* Mask is JS-only */
            if (this.brushMode === 'mask') { this.applyMask(hitPoint, 0.5); return; }

            /* Compute shared transforms once */
            const localPoint  = this.currentMesh.worldToLocal(hitPoint.clone());
            const matInv      = this.currentMesh.matrixWorld.clone().invert();
            const localNormal = normal.clone().transformDirection(matInv).normalize();

            /* JS spatial query — shared by both WASM and JS paths */
            const verts = this.getVerticesInRadius(hitPoint, this.brushSize);

            switch (this.brushMode) {
                /* ── Routed to WASM-aware private methods in character-tools.js ── */
                case 'layer':
                    this._applyLayer(verts, localNormal);
                    break;
                case 'draw':
                    this._applyDraw(verts);
                    break;
                case 'topology':
                    this._applyTopology(verts, localNormal);
                    break;
                case 'surface-offset':
                    this._applySurfaceOffset(verts);
                    break;
                case 'directional-smooth':
                    this._applyDirectionalSmooth(verts);
                    break;

                /* ── Standard brushes (clay/inflate/flatten/smooth/pinch/crease) ── */
                default:
                    this._applyStandardSculpt(verts, localPoint, localNormal);
                    break;
            }
        }.bind(sys);
    }

    // ── Extra UI listeners (unchanged from original) ──────────────────────

    setupUIListeners() {
        const sys = this.sculptingSystem;

        /* Hardness contrast */
        document.getElementById('hardness-contrast-btn')?.addEventListener('click', () => {
            if (!sys.isActive) { alert("Please activate sculpting on a mesh first."); return; }
            sys.applyHardnessContrast();
            console.log("✨ Hardness contrast applied!");
        });

        /* Angle-preserving smooth */
        document.getElementById('angle-preserve-btn')?.addEventListener('click', () => {
            if (!sys.isActive) { alert("Please activate sculpting on a mesh first."); return; }
            sys.applyAnglePreservingSmooth(2, 0.4);
            console.log("✨ Angle-preserving smooth applied!");
        });

        /* Directional smooth mode select */
        document.getElementById('directional-smooth-btn')?.addEventListener('click', () => {
            alert("Switch to Directional Smooth brush and sculpt on the mesh.");
        });

        /* Symmetry plane toggle */
        document.getElementById('show-symmetry-plane-toggle')?.addEventListener('change', e => {
            if (e.target.checked) sys.createSymmetryPlane();
            else if (sys.symmetryPlane) this.scene.remove(sys.symmetryPlane);
        });
    }

    // ── Keyboard shortcuts (unchanged from original) ──────────────────────

    setupKeyboardShortcuts() {
        const sys = this.sculptingSystem;
        window.addEventListener('keydown', e => {
            if (!sys.isActive) return;
            const key = e.key.toLowerCase();
            switch (key) {
                case 'g': sys.setBrushMode('grab');    this.updateBrushDisplay('grab');    e.preventDefault(); break;
                case 's': sys.setBrushMode('smooth');  this.updateBrushDisplay('smooth');  e.preventDefault(); break;
                case 'f': sys.setBrushMode('flatten'); this.updateBrushDisplay('flatten'); e.preventDefault(); break;
                case 'p': sys.setBrushMode('pinch');   this.updateBrushDisplay('pinch');   e.preventDefault(); break;
                case 'c': sys.setBrushMode('crease');  this.updateBrushDisplay('crease');  e.preventDefault(); break;
                case 'd': sys.setBrushMode('draw');    this.updateBrushDisplay('draw');    e.preventDefault(); break;
                case 'l': sys.setBrushMode('layer');   this.updateBrushDisplay('layer');   e.preventDefault(); break;
                case 'i': sys.setBrushMode('inflate'); this.updateBrushDisplay('inflate'); e.preventDefault(); break;
            }
            if ((e.ctrlKey || e.metaKey) && key === 'z') { this.historyManager.undo(); e.preventDefault(); }
            if ((e.ctrlKey || e.metaKey) && key === 'y') { this.historyManager.redo(); e.preventDefault(); }
        });
    }

    updateBrushDisplay(brushName) {
        document.querySelectorAll('.brush-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.brush === brushName);
        });
        const d = document.getElementById('sculpting-brush-display');
        if (d) d.textContent = brushName.toUpperCase();
    }

    // ── Workflow presets (unchanged) ──────────────────────────────────────

    setupFacialSculptingWorkflow(mesh) {
        console.log("🎨 Setting up facial sculpting workflow…");
        this.sculptingSystem.activateSculpting(mesh);
        this.sculptingSystem.setSymmetry(true);
        this.sculptingSystem.setSymmetryAxis('x');
        this.sculptingSystem.setBrushMode('clay');
        this.sculptingSystem.setBrushSize(0.4);
        this.sculptingSystem.setBrushFalloff(0.5);
        console.log("✅ Facial sculpting ready. Use CREASE for features.");
    }

    setupHardSurfaceWorkflow(mesh) {
        console.log("🎨 Setting up hard surface workflow…");
        this.sculptingSystem.activateSculpting(mesh);
        this.sculptingSystem.setSymmetry(false);
        this.sculptingSystem.setBrushMode('layer');
        this.sculptingSystem.setBrushSize(0.6);
        this.sculptingSystem.setBrushFalloff(0.9);
        console.log("✅ Hard surface ready. Use LAYER for details.");
    }

    setupOrganicWorkflow(mesh) {
        console.log("🎨 Setting up organic workflow…");
        this.sculptingSystem.activateSculpting(mesh);
        this.sculptingSystem.setSymmetry(true);
        this.sculptingSystem.setSymmetryAxis('x');
        this.sculptingSystem.setBrushMode('topology');
        this.sculptingSystem.setBrushSize(0.8);
        this.sculptingSystem.setBrushFalloff(0.4);
        console.log("✅ Organic sculpting ready. TOPOLOGY respects edge flow.");
    }

    // ── Strength / size / hardness presets (unchanged) ────────────────────

    setStrengthPreset(preset) {
        const map = { gentle:0.2, normal:0.5, aggressive:1.0, strong:1.5 };
        if (map[preset] !== undefined) this.sculptingSystem.setBrushStrength(map[preset]);
    }

    setSizePreset(preset) {
        const map = { detail:0.2, medium:0.5, large:1.2, 'extra-large':2.5 };
        if (map[preset] !== undefined) this.sculptingSystem.setBrushSize(map[preset]);
    }

    setHardnessPreset(preset) {
        const map = { soft:0.1, medium:0.5, hard:0.8, 'very-hard':0.95 };
        if (map[preset] !== undefined) this.sculptingSystem.setBrushFalloff(map[preset]);
    }

    // ── Export ────────────────────────────────────────────────────────────

    exportSculptedMesh() {
        if (!this.sculptingSystem.currentMesh) {
            alert("No active sculpting session."); return null;
        }
        const mesh  = this.sculptingSystem.currentMesh;
        const clone = mesh.clone();
        if (mesh.userData.originalMaterial)
            clone.material = mesh.userData.originalMaterial.clone();
        return clone;
    }

    // ── Status ────────────────────────────────────────────────────────────

    getStatus() {
        const s = this.sculptingSystem.getStatus();
        return {
            ...s,
            historyLength      : this.historyManager.steps.length,
            currentHistoryStep : this.historyManager.currentStep,
            wasmActive         : window.SculptWASM?.isReady() || false,
        };
    }
}

// ── Example initialisation (matches original SculptingManager.js) ─────────

function initializeSculptingApp(scene, camera, renderer) {
    window.sculptingManager = new IntegratedSculptingManager(scene, camera, renderer);
    window.sculptingSystem  = window.sculptingManager.sculptingSystem;
}

function setupPresetButtons() {
    document.getElementById('preset-gentle')    ?.addEventListener('click', () => window.sculptingManager.setStrengthPreset('gentle'));
    document.getElementById('preset-normal')    ?.addEventListener('click', () => window.sculptingManager.setStrengthPreset('normal'));
    document.getElementById('preset-aggressive')?.addEventListener('click', () => window.sculptingManager.setStrengthPreset('aggressive'));

    document.getElementById('workflow-facial')?.addEventListener('click', () => {
        const m = window.selectedObject;
        if (m?.isMesh) window.sculptingManager.setupFacialSculptingWorkflow(m);
    });
    document.getElementById('workflow-organic')?.addEventListener('click', () => {
        const m = window.selectedObject;
        if (m?.isMesh) window.sculptingManager.setupOrganicWorkflow(m);
    });
    document.getElementById('workflow-hardsurface')?.addEventListener('click', () => {
        const m = window.selectedObject;
        if (m?.isMesh) window.sculptingManager.setupHardSurfaceWorkflow(m);
    });
}

if (typeof module !== 'undefined' && module.exports)
    module.exports = { IntegratedSculptingManager };