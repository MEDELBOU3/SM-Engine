// ============================================================================
// character-tools.js  —  SM Engine (WASM Edition)
// ============================================================================
// Architecture:
//   ▸ All UI, event listeners, brush selection, cursor, history — UNCHANGED
//   ▸ Every heavy vertex loop now checks window.SculptWASM.isReady()
//       → if true  : uploads JS hitResults[] to WASM → C++ kernel runs → 
//                    dirty range synced back → partial GPU upload
//       → if false : the original JS code runs (bit-for-bit identical)
//   ▸ Zero API-breaking changes — index.html calls initSculptingSystem()
//     exactly as before.
// ============================================================================

let sculptingSystem = null;

/* ── Init (called from index.html) ──────────────────────────────────────── */
async function initSculptingSystem(scene, camera, renderer, historyManager) {
    console.log("🎨 Initialising Sculpting System (WASM Edition)…");

    /* Try to warm up WASM — non-blocking, zero disruption on failure */
    if (window.SculptWASM) {
        try {
            const ok = await SculptWASM.init();
            console.log(ok ? "⚡ WASM sculpt engine active" : "🟡 JS fallback active");
        } catch (e) {
            console.warn("⚠️ SculptWASM init error:", e.message);
        }
    }

    sculptingSystem = new AdvancedSculptingSystem(scene, camera, renderer);

    if (historyManager) {
        sculptingSystem.setHistoryManager(historyManager);
        console.log("🔗 History Manager linked");
    } else {
        console.warn("⚠️ No History Manager passed to Sculpting System");
    }

    setupSculptingToggle();
    setupSculptingUIListeners();

    console.log("✅ Sculpting System ready");
    return sculptingSystem;
}

// ============================================================================
// UI & EVENT LISTENERS  (100% unchanged from original)
// ============================================================================

function setupSculptingToggle() {
    const toggleBtn = document.getElementById('sculpting-toolbar-btn');
    const panel     = document.getElementById('sculpting-panel');
    const closeBtn  = document.getElementById('sculpting-close-btn');
    if (!toggleBtn || !panel) return;
    toggleBtn.addEventListener('click', () => {
        const isHidden = !panel.classList.contains('active-mode');
        panel.classList.toggle('active-mode', isHidden);
        panel.style.display = '';
        toggleBtn.classList.toggle('active', isHidden);
    });
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.classList.remove('active-mode');
            panel.style.display = '';
            toggleBtn.classList.remove('active');
        });
    }
}

function setupSculptingUIListeners() {
    if (!sculptingSystem) return;

    /* Activation */
    const activateBtn   = document.getElementById('activate-sculpting-btn');
    const deactivateBtn = document.getElementById('deactivate-sculpting-btn');
    if (activateBtn) {
        activateBtn.addEventListener('click', () => {
            const selectedObject = window.selectedObject || null;
            if (!selectedObject || !selectedObject.isMesh) {
                alert('Please select a mesh from the hierarchy first'); return;
            }
            if (sculptingSystem.activateSculpting(selectedObject)) {
                activateBtn.style.display = 'none';
                if (deactivateBtn) deactivateBtn.style.display = 'block';
                updateSculptingStatus();
            }
        });
    }
    if (deactivateBtn) {
        deactivateBtn.addEventListener('click', () => {
            sculptingSystem.deactivateSculpting();
            deactivateBtn.style.display = 'none';
            if (activateBtn) activateBtn.style.display = 'block';
            updateSculptingStatus();
        });
    }

    /* Brush mode */
    const brushButtons = document.querySelectorAll('.brush-btn');
    brushButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.brush;
            sculptingSystem.setBrushMode(mode);
            brushButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateSculptingStatus();
        });
    });

    /* Sliders */
    const linkSlider = (id, setter) => {
        const slider  = document.getElementById(id);
        const input   = document.getElementById(id.replace('slider', 'input'));
        const display = document.getElementById(id.replace('slider', 'value'));
        if (!slider) return;
        const update = (val) => {
            const num = parseFloat(val);
            slider.value = num;
            if (input)   input.value         = num;
            if (display) display.textContent = num.toFixed(2);
            setter(num);
        };
        slider.addEventListener('input',  e => update(e.target.value));
        if (input) input.addEventListener('input', e => update(e.target.value));
    };
    linkSlider('brush-size-slider',     v => sculptingSystem.setBrushSize(v));
    linkSlider('brush-strength-slider', v => sculptingSystem.setBrushStrength(v));
    linkSlider('brush-falloff-slider',  v => sculptingSystem.setBrushFalloff(v));

    /* Toggles */
    const subToggle = document.getElementById('subsurface-toggle');
    if (subToggle) subToggle.addEventListener('change', e => {
        sculptingSystem.useSubsurfaceDeformation = e.target.checked;
    });

    const symToggle = document.getElementById('symmetry-toggle');
    if (symToggle) {
        symToggle.checked = sculptingSystem.symmetryEnabled;
        symToggle.addEventListener('change', e => {
            console.log("🔄 Symmetry Toggled:", e.target.checked);
            sculptingSystem.setSymmetry(e.target.checked);
        });
    }

    const symPlaneToggle = document.getElementById('show-symmetry-plane-toggle');
    if (symPlaneToggle) {
        symPlaneToggle.addEventListener('change', e => {
            if (sculptingSystem.symmetryEnabled && e.target.checked)
                sculptingSystem.toggleSymmetryPlane(true);
            else
                sculptingSystem.toggleSymmetryPlane(false);
        });
        if (sculptingSystem.symmetryEnabled && symPlaneToggle.checked)
            sculptingSystem.toggleSymmetryPlane(true);
    }

    const axisButtons = document.querySelectorAll('.axis-btn');
    axisButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            axisButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sculptingSystem.setSymmetryAxis(btn.dataset.axis);
            const pt = document.getElementById('show-symmetry-plane-toggle');
            if (sculptingSystem.symmetryEnabled && pt && pt.checked)
                sculptingSystem.toggleSymmetryPlane(true);
        });
    });

    const wireframeToggle = document.getElementById('wireframe-toggle');
    if (wireframeToggle) {
        wireframeToggle.addEventListener('change', e => {
            if (sculptingSystem.currentMesh)
                sculptingSystem.currentMesh.material.wireframe = e.target.checked;
        });
    }

    /* Undo / Reset */
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (window.historyManager) window.historyManager.undo();
            else console.warn("No History Manager found");
            updateSculptingStatus();
        });
    }
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset geometry? This cannot be undone via history.')) {
                sculptingSystem.hardReset();
                updateSculptingStatus();
            }
        });
    }

    /* Global tools */
    const smoothBtn = document.getElementById('global-smooth-btn');
    if (smoothBtn) smoothBtn.addEventListener('click', () => {
        if (!sculptingSystem.isActive) return alert("Activate sculpting first!");
        sculptingSystem.applyGlobalSmooth(3, 0.6);
    });

    const hardnessBtn = document.getElementById('hardness-contrast-btn');
    if (hardnessBtn) hardnessBtn.addEventListener('click', () => {
        if (!sculptingSystem.isActive) return alert("Activate sculpting first!");
        sculptingSystem.applyHardnessContrast();
    });

    const angleBtn = document.getElementById('angle-preserve-btn');
    if (angleBtn) angleBtn.addEventListener('click', () => {
        if (!sculptingSystem.isActive) return alert("Activate sculpting first!");
        sculptingSystem.applyAnglePreservingSmooth(2, 0.5);
    });

    const dirSmoothBtn = document.getElementById('directional-smooth-btn');
    if (dirSmoothBtn) dirSmoothBtn.addEventListener('click', () => {
        sculptingSystem.setBrushMode('directional-smooth');
        const d = document.getElementById('sculpting-brush-display');
        if (d) d.textContent = "DIR. SMOOTH";
        document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
    });

    /* Masking */
    const extractBtn  = document.getElementById('extract-btn');
    const clearMaskBtn = document.getElementById('clear-mask-btn');
    if (extractBtn)   extractBtn.addEventListener('click',   () => sculptingSystem.extractMaskedGeometry(0.02));
    if (clearMaskBtn) clearMaskBtn.addEventListener('click', () => sculptingSystem.clearMask());

    setInterval(updateSculptingStatus, 200);
}

function updateSculptingStatus() {
    if (!sculptingSystem) return;
    const status = sculptingSystem.getStatus();
    const el = id => document.getElementById(id);
    if (el('sculpting-mode-display'))  el('sculpting-mode-display').textContent  = status.isActive ? 'Active' : 'Inactive';
    if (el('sculpting-mesh-display'))  el('sculpting-mesh-display').textContent  = status.meshName;
    if (el('sculpting-brush-display')) el('sculpting-brush-display').textContent = status.brushMode.toUpperCase();
    if (el('history-steps'))           el('history-steps').textContent           = `${status.historyStep} / ${status.historyMax}`;
    /* Optional WASM status indicator (add <span id="wasm-status"> to your panel) */
    if (el('wasm-status')) el('wasm-status').textContent = window.SculptWASM?.isReady() ? '⚡ WASM' : '🟡 JS';
}

// ============================================================================
// GEOMETRY PREPARATION HELPER  (unchanged)
// ============================================================================
function prepareGeometryForSculpting(geometry) {
    const geo = geometry.clone();
    if (THREE.BufferGeometryUtils && THREE.BufferGeometryUtils.mergeVertices) {
        geo.deleteAttribute('normal');
        if (geo.attributes.uv) geo.deleteAttribute('uv');
        return THREE.BufferGeometryUtils.mergeVertices(geo, 1e-4);
    }
    geo.computeVertexNormals();
    return geo;
}

// ============================================================================
// THE ENGINE: ADVANCED SCULPTING CLASS  (WASM-accelerated)
// ============================================================================

class AdvancedSculptingSystem {
    constructor(scene, camera, renderer) {
        this.scene    = scene;
        this.camera   = camera;
        this.renderer = renderer;

        this.isActive    = false;
        this.currentMesh = null;

        this.brushMode     = 'clay';
        this.brushSize     = 0.5;
        this.brushStrength = 0.5;
        this.brushFalloff  = 0.5;

        this.symmetryEnabled = false;
        this.symmetryAxis    = 'x';
        this.isInverted      = false;

        this.raycaster     = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 0.05;
        this.mouse         = new THREE.Vector2();
        this.isDragging    = false;
        this.lastHitPoint  = null;
        this.strokeTracker = { lastPoint: null, direction: new THREE.Vector3() };

        this.hiddenObjects       = [];
        this.originalBackground  = null;
        this.symmetryPlaneHelper = null;
        this.symPlaneMesh        = null;

        this.minRange = Infinity;
        this.maxRange = -Infinity;

        this.spatialIndex = null;
        this.cellSize     = 0.5;

        this.positions         = null;
        this.normals           = null;
        this.maskData          = null;
        this.adjacency         = null;
        this.originalPositions = null;

        this.historyManager     = null;
        this.tempStartPositions = null;
        this.tempToolStart      = null;

        this.init();
    }

    init() {
        this.createBrushPreview();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }

    setHistoryManager(manager) {
        this.historyManager = manager;
        console.log("Sculpting System: History Manager set to", this.historyManager);
    }

    // ── Brush cursor  (unchanged) ─────────────────────────────────────────

    createBrushPreview() {
        this.brushCursor = new THREE.Group();
        this.brushCursor.renderOrder = 999;

        const ringGeo = new THREE.BufferGeometry().setFromPoints(
            new THREE.EllipseCurve(0,0,1,1,0,2*Math.PI,false,0)
                .getPoints(64).map(p => new THREE.Vector3(p.x, p.y, 0))
        );

        this.cursorOuter  = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: 0xff4400, opacity: 0.8, transparent: true, depthTest: false }));
        this.cursorInner  = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: 0xffaa00, opacity: 0.5, transparent: true, depthTest: false }));
        const crossGeo    = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.1,0,0), new THREE.Vector3(0.1,0,0),
            new THREE.Vector3(0,-0.1,0), new THREE.Vector3(0,0.1,0)
        ]);
        this.cursorCenter = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.9, transparent: true, depthTest: false }));
        this.brushCursor.add(this.cursorOuter, this.cursorInner, this.cursorCenter);
        this.brushCursor.visible = false;

        /* Symmetry cursor */
        this.symmetryCursor   = new THREE.Group();
        this.symmetryCursor.renderOrder = 999;
        this.symCursorOuter   = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: 0x0088ff, opacity: 0.6, transparent: true, depthTest: false }));
        this.symCursorInner   = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: 0x00aaff, opacity: 0.4, transparent: true, depthTest: false }));
        this.symCursorCenter  = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.7, transparent: true, depthTest: false }));
        this.symmetryCursor.add(this.symCursorOuter, this.symCursorInner, this.symCursorCenter);
        this.symmetryCursor.visible = false;

        this.scene.add(this.brushCursor);
        this.scene.add(this.symmetryCursor);
        console.log("✅ Brush cursors created (main & symmetry)");
    }

    updateCursorVisuals(point, normal) {
        this.brushCursor.visible = true;
        this.brushCursor.position.copy(point);
        this.brushCursor.lookAt(point.clone().add(normal));
        this.cursorOuter.scale.setScalar(this.brushSize);
        const innerScale = this.brushSize * (1 - this.brushFalloff * 0.8);
        this.cursorInner.scale.setScalar(innerScale);
        const color = this.isInverted ? 0x0088ff : 0xff3300;
        this.cursorOuter.material.color.setHex(color);
        this.cursorInner.material.color.setHex(color);
        this.cursorCenter.material.color.setHex(color);
    }

    // ── Mesh activation ───────────────────────────────────────────────────

    activateSculpting(mesh) {
        if (!mesh || !mesh.isMesh) return false;
        this.currentMesh = mesh;

        if (!mesh.userData.lowResGeometry)
            mesh.userData.lowResGeometry = mesh.geometry;

        mesh.geometry = this.generateHighResGeometry(mesh);
        mesh.geometry = prepareGeometryForSculpting(mesh.geometry);

        const count = mesh.geometry.attributes.position.count;
        this.maskData = new Float32Array(count).fill(0);

        if (!mesh.geometry.attributes.color)
            mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

        this.positions         = mesh.geometry.attributes.position.array;
        this.normals           = mesh.geometry.attributes.normal.array;
        this.originalPositions = new Float32Array(this.positions);

        this.computeAdjacency();
        this.buildSpatialIndex();

        /* ── WASM activation ── */
        if (window.SculptWASM?.isReady()) {
            SculptWASM.setMesh(mesh, this.maskData, this.adjacency);
        }

        this.isActive = true;
        this.toggleIsolation(true);
        return true;
    }

    generateHighResGeometry(mesh) {
        const type = mesh.userData.primitiveType;
        const p    = mesh.userData.params;
        if (!type || !p) {
            console.warn("⚠️ No primitive data. Sculpting on original resolution.");
            return mesh.geometry.clone();
        }
        console.log(`🚀 Upgrading ${type} to High-Resolution…`);
        switch (type) {
            case 'cube':        return new THREE.BoxGeometry(p.width, p.height, p.depth, 64, 64, 64);
            case 'sphere':      return new THREE.SphereGeometry(p.radius, 128, 128);
            case 'cylinder':    return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 128, 64);
            case 'plane':       return new THREE.PlaneGeometry(p.width, p.height, 128, 128);
            case 'cone':        return new THREE.ConeGeometry(p.radius, p.height, 128, 64);
            case 'torus':       return new THREE.TorusGeometry(p.radius, p.tube, 64, 128);
            case 'icosahedron': return new THREE.IcosahedronGeometry(p.radius, 5);
            case 'dodecahedron':return new THREE.DodecahedronGeometry(p.radius, 5);
            case 'octahedron':  return new THREE.OctahedronGeometry(p.radius, 5);
            case 'tetrahedron': return new THREE.TetrahedronGeometry(p.radius, 5);
            case 'torusKnot':   return new THREE.TorusKnotGeometry(p.radius, p.tube, 256, 64, p.p, p.q);
            default:
                console.warn(`Type ${type} not recognised. Cloning original.`);
                return mesh.geometry.clone();
        }
    }

    deactivateSculpting() {
        if (!this.currentMesh) return;
        if (this.currentMesh.userData.originalMaterial) {
            this.currentMesh.material = this.currentMesh.userData.originalMaterial;
            this.currentMesh.userData.originalMaterial = null;
        }
        this.toggleIsolation(false);
        this.isActive    = false;
        this.currentMesh = null;
    }

    // ── Isolation (unchanged) ─────────────────────────────────────────────

    toggleIsolation(enable) {
        if (enable) {
            console.log("🔒 Entering Isolation Mode");
            this.originalBackground = this.scene.background;
            this.scene.background   = new THREE.Color(0x2c2c2c);
            this.hiddenObjects      = [];
            this.scene.traverse(obj => {
                if (obj.isLight || obj.isCamera || obj === this.scene) return;
                if (obj === this.brushCursor || obj === this.cursorOuter ||
                    obj === this.cursorInner  || obj === this.cursorCenter) return;
                if (obj === this.symmetryCursor) return;
                if (obj === this.currentMesh) return;
                if (obj.getObjectById && obj.getObjectById(this.currentMesh.id)) return;
                if (obj.parent === this.currentMesh) return;
                if (obj.visible) {
                    this.hiddenObjects.push({ object: obj, originalState: true });
                    obj.visible = false;
                }
            });
        } else {
            console.log("🔓 Exiting Isolation Mode");
            this.scene.background = this.originalBackground;
            this.hiddenObjects.forEach(e => { if (e.object) e.object.visible = e.originalState; });
            this.hiddenObjects = [];
        }
    }

    // ── Adjacency ─────────────────────────────────────────────────────────

    computeAdjacency() {
        const geometry = this.currentMesh.geometry;
        if (!geometry.index) return;
        const index = geometry.index.array;
        const vertexCount = geometry.attributes.position.count;
        this.adjacency = new Array(vertexCount).fill(0).map(() => []);
        for (let i = 0; i < index.length; i += 3) {
            const a=index[i], b=index[i+1], c=index[i+2];
            this.adjacency[a].push(b, c);
            this.adjacency[b].push(a, c);
            this.adjacency[c].push(a, b);
        }
        for (let i = 0; i < vertexCount; i++)
            this.adjacency[i] = [...new Set(this.adjacency[i])];
    }

    // ── Spatial index (native BVH with JS grid fallback) ──────────────────

    buildSpatialIndex() {
        if (!this.currentMesh) return;
        this.currentMesh.geometry.computeBoundingBox();
        const s = new THREE.Vector3();
        this.currentMesh.geometry.boundingBox.getSize(s);
        this.cellSize    = Math.max(s.x, s.y, s.z) / 40;
        this.spatialIndex = new Map();
        const pos = this.positions;
        for (let i = 0; i < pos.length / 3; i++) {
            const key = this.getHashKey(pos[i*3], pos[i*3+1], pos[i*3+2]);
            if (!this.spatialIndex.has(key)) this.spatialIndex.set(key, []);
            this.spatialIndex.get(key).push(i);
        }
    }

    getHashKey(x, y, z) {
        return `${Math.floor(x/this.cellSize)},${Math.floor(y/this.cellSize)},${Math.floor(z/this.cellSize)}`;
    }

    getVerticesInRadius(point, radius) {
        const lp = this.currentMesh.worldToLocal(point.clone());
        const nativeHits = window.SculptWASM?.queryRadius?.(lp, radius);
        if (nativeHits) return nativeHits;

        const affected = [];
        const rSq      = radius * radius;
        const cellRad  = Math.ceil(radius / this.cellSize);
        const cx = Math.floor(lp.x / this.cellSize);
        const cy = Math.floor(lp.y / this.cellSize);
        const cz = Math.floor(lp.z / this.cellSize);
        for (let x = cx-cellRad; x <= cx+cellRad; x++) {
            for (let y = cy-cellRad; y <= cy+cellRad; y++) {
                for (let z = cz-cellRad; z <= cz+cellRad; z++) {
                    const cells = this.spatialIndex.get(`${x},${y},${z}`);
                    if (!cells) continue;
                    for (let i of cells) {
                        const px=this.positions[i*3],py=this.positions[i*3+1],pz=this.positions[i*3+2];
                        const dSq=(px-lp.x)**2+(py-lp.y)**2+(pz-lp.z)**2;
                        if (dSq < rSq) affected.push({ index: i, dist: Math.sqrt(dSq) });
                    }
                }
            }
        }
        return affected;
    }

    getFalloff(dist, radius) {
        if (dist >= radius) return 0;
        let t = 1 - dist / radius;
        return t * t * (3 - 2 * t);
    }

    updateGeometry() {
        if (this.minRange === Infinity || !this.currentMesh) return;
        const attr = this.currentMesh.geometry.attributes.position;
        attr.updateRange.offset = this.minRange;
        attr.updateRange.count  = this.maxRange - this.minRange;
        attr.needsUpdate = true;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SCULPT DISPATCH
    // ══════════════════════════════════════════════════════════════════════

    sculpt(hitPoint, normal) {
        /* Track stroke direction */
        if (this.lastHitPoint) {
            this.strokeTracker.direction.subVectors(hitPoint, this.lastHitPoint).normalize();
        }
        this.strokeTracker.lastPoint = hitPoint.clone();

        /* Mask brush is JS-only (touches color buffer, not positions) */
        if (this.brushMode === 'mask') {
            this.applyMask(hitPoint, 0.5);
            return;
        }

        /* Common transforms needed by every path */
        const localPoint  = this.currentMesh.worldToLocal(hitPoint.clone());
        const matInv      = this.currentMesh.matrixWorld.clone().invert();
        const localNormal = normal.clone().transformDirection(matInv).normalize();

        /* JS spatial query (shared by both WASM and fallback paths) */
        const verts = this.getVerticesInRadius(hitPoint, this.brushSize);

        /* Route */
        switch (this.brushMode) {
            case 'layer':             this._applyLayer(verts, localNormal); break;
            case 'draw':              this._applyDraw(verts); break;
            case 'topology':          this._applyTopology(verts, localNormal); break;
            case 'surface-offset':    this._applySurfaceOffset(verts); break;
            case 'directional-smooth':this._applyDirectionalSmooth(verts); break;
            default:                  this._applyStandardSculpt(verts, localPoint, localNormal); break;
        }
    }

    /* ── helpers: compute localNormal & localPoint outside each method ─── */
    _localNormal(normal) {
        return normal.clone()
            .transformDirection(this.currentMesh.matrixWorld.clone().invert())
            .normalize();
    }
    _localPoint(worldPt) {
        return this.currentMesh.worldToLocal(worldPt.clone());
    }

    // ── Standard sculpt (clay / inflate / flatten / smooth / pinch / crease)

    _applyStandardSculpt(verts, localPoint, localNormal) {
        if (verts.length === 0) return;

        /* Try WASM first */
        const W = window.SculptWASM;
        if (W?.isReady()) {
            const r=this.brushSize, s=this.brushStrength, h=this.brushFalloff, inv=this.isInverted;
            switch (this.brushMode) {
                case 'clay':    W.clay   (verts, localNormal, r,s,h,inv); return;
                case 'inflate': W.inflate(verts, r,s,h,inv);              return;
                case 'flatten': W.flatten(verts, r,s,h);                  return;
                case 'smooth':  W.smooth (verts, r,s,h);                  return;
                case 'pinch':   W.pinch  (verts, localPoint, r,s,h,inv); return;
                case 'crease':  W.crease (verts, localNormal, r,s,h,inv); return;
            }
        }

        /* JS fallback — original code, bit-for-bit */
        this.minRange = Infinity; this.maxRange = -Infinity;
        const dir     = this.isInverted ? -1 : 1;
        const baseStr = this.brushStrength * 0.08 * dir;
        let avgPos = new THREE.Vector3(), avgNormal = new THREE.Vector3();

        if (['smooth','flatten'].includes(this.brushMode)) {
            let count = 0;
            verts.forEach(v => {
                const i=v.index*3;
                avgPos.add({ x:this.positions[i], y:this.positions[i+1], z:this.positions[i+2] });
                avgNormal.add({ x:this.normals[i], y:this.normals[i+1], z:this.normals[i+2] });
                count++;
            });
            avgPos.divideScalar(count); avgNormal.normalize();
        }

        for (let v of verts) {
            const i = v.index * 3;
            const maskFactor = 1.0 - (this.maskData ? this.maskData[v.index] : 0);
            if (maskFactor <= 0.01) continue;
            let factor = this.getFalloff(v.dist, this.brushSize) * maskFactor;
            if (this.brushFalloff > 0.5) factor = Math.pow(factor, 1 + this.brushFalloff);
            if (factor <= 0.001) continue;

            const cp = new THREE.Vector3(this.positions[i],this.positions[i+1],this.positions[i+2]);
            const vn = new THREE.Vector3(this.normals[i],this.normals[i+1],this.normals[i+2]);
            let offset = new THREE.Vector3();

            switch (this.brushMode) {
                case 'clay':
                    offset.copy(localNormal).multiplyScalar(factor * baseStr); break;
                case 'inflate':
                    offset.copy(vn).multiplyScalar(factor * baseStr); break;
                case 'flatten': {
                    const planeDist = avgNormal.dot(cp.clone().sub(avgPos));
                    offset.copy(avgNormal).multiplyScalar(-planeDist * factor * this.brushStrength * 0.2);
                    break;
                }
                case 'smooth':
                    offset.subVectors(avgPos, cp).multiplyScalar(factor * this.brushStrength * 0.5); break;
                case 'pinch': {
                    const toCenter = localPoint.clone().sub(cp);
                    offset.copy(toCenter).multiplyScalar(factor * baseStr * 3.0);
                    break;
                }
                case 'crease': {
                    const cFactor = Math.pow(factor, 2);
                    offset.copy(localNormal).multiplyScalar(cFactor * baseStr * 0.8);
                    break;
                }
            }
            this.positions[i]  +=offset.x; this.positions[i+1]+=offset.y; this.positions[i+2]+=offset.z;
            this.minRange = Math.min(this.minRange, i);
            this.maxRange = Math.max(this.maxRange, i+3);
        }
        this.updateGeometry();
    }

    // ── Layer ─────────────────────────────────────────────────────────────

    _applyLayer(verts, localNormal) {
        if (verts.length === 0) return;
        if (window.SculptWASM?.isReady()) {
            SculptWASM.layer(verts, localNormal, this.brushSize, this.brushStrength, this.isInverted);
            return;
        }
        this.minRange=Infinity; this.maxRange=-Infinity;
        const dir  = this.isInverted ? -1 : 1;
        const layH = this.brushStrength * 0.05 * dir;
        for (let v of verts) {
            const i=v.index*3;
            const mf = 1.0 - (this.maskData ? this.maskData[v.index] : 0);
            if (mf<=0.01) continue;
            let factor = this.getFalloff(v.dist, this.brushSize) * mf;
            factor = factor > 0.4 ? 1.0 : factor * 2.0;
            if (factor<=0.001) continue;
            const offset = localNormal.clone().multiplyScalar(factor * layH * 0.2);
            this.positions[i]+=offset.x; this.positions[i+1]+=offset.y; this.positions[i+2]+=offset.z;
            this.minRange=Math.min(this.minRange,i); this.maxRange=Math.max(this.maxRange,i+3);
        }
        this.updateGeometry();
    }

    // ── Draw ──────────────────────────────────────────────────────────────

    _applyDraw(verts) {
        if (verts.length === 0) return;
        if (window.SculptWASM?.isReady()) {
            SculptWASM.draw(verts, this.brushSize, this.brushStrength, this.isInverted);
            return;
        }
        this.minRange=Infinity; this.maxRange=-Infinity;
        const dir = this.isInverted ? -1 : 1;
        const str = this.brushStrength * 0.08 * dir;
        for (let v of verts) {
            const i=v.index*3;
            const mf = 1.0 - (this.maskData ? this.maskData[v.index] : 0);
            if (mf<=0.01) continue;
            let factor = Math.pow(this.getFalloff(v.dist,this.brushSize),3) * mf;
            if (factor<=0.001) continue;
            const n=new THREE.Vector3(this.normals[i],this.normals[i+1],this.normals[i+2]);
            const offset=n.multiplyScalar(factor*str);
            this.positions[i]+=offset.x; this.positions[i+1]+=offset.y; this.positions[i+2]+=offset.z;
            this.minRange=Math.min(this.minRange,i); this.maxRange=Math.max(this.maxRange,i+3);
        }
        this.updateGeometry();
    }

    // ── Topology ──────────────────────────────────────────────────────────

    _applyTopology(verts, localNormal) {
        if (!this.adjacency || verts.length === 0) return;
        if (window.SculptWASM?.isReady()) {
            SculptWASM.topology(verts, localNormal, this.brushSize, this.brushStrength, this.isInverted);
            return;
        }
        this.minRange=Infinity; this.maxRange=-Infinity;
        const str = this.brushStrength * 0.05 * (this.isInverted ? -1 : 1);
        for (let v of verts) {
            const i=v.index*3;
            const factor = this.getFalloff(v.dist, this.brushSize);
            const neighbors = this.adjacency[v.index];
            if (neighbors) {
                for (let ni of neighbors) {
                    const idx=ni*3;
                    const offset=localNormal.clone().multiplyScalar(factor*str*0.5);
                    this.positions[idx]+=offset.x; this.positions[idx+1]+=offset.y; this.positions[idx+2]+=offset.z;
                }
            }
            const offset=localNormal.clone().multiplyScalar(factor*str);
            this.positions[i]+=offset.x; this.positions[i+1]+=offset.y; this.positions[i+2]+=offset.z;
            this.minRange=Math.min(this.minRange,i); this.maxRange=Math.max(this.maxRange,i+3);
        }
        this.updateGeometry();
    }

    // ── Surface Offset ────────────────────────────────────────────────────

    _applySurfaceOffset(verts) {
        if (verts.length === 0) return;
        if (window.SculptWASM?.isReady()) {
            SculptWASM.surfaceOffset(verts, this.brushSize, this.brushStrength, this.isInverted);
            return;
        }
        this.minRange=Infinity; this.maxRange=-Infinity;
        const dir = this.isInverted ? -1 : 1;
        const str = this.brushStrength * 0.1 * dir;
        for (let v of verts) {
            const i=v.index*3;
            const factor = this.getFalloff(v.dist, this.brushSize);
            const n = new THREE.Vector3(this.normals[i],this.normals[i+1],this.normals[i+2]);
            this.positions[i]  +=n.x*factor*str;
            this.positions[i+1]+=n.y*factor*str;
            this.positions[i+2]+=n.z*factor*str;
            this.minRange=Math.min(this.minRange,i); this.maxRange=Math.max(this.maxRange,i+3);
        }
        this.updateGeometry();
    }

    // ── Directional Smooth ────────────────────────────────────────────────

    _applyDirectionalSmooth(verts) {
        if (verts.length === 0) return;
        if (window.SculptWASM?.isReady()) {
            SculptWASM.directionalSmooth(verts, this.strokeTracker.direction, this.brushSize, this.brushStrength);
            return;
        }
        this.minRange=Infinity; this.maxRange=-Infinity;
        let avgPos=new THREE.Vector3(); let count=0;
        verts.forEach(v=>{
            const i=v.index*3;
            avgPos.x+=this.positions[i];avgPos.y+=this.positions[i+1];avgPos.z+=this.positions[i+2]; count++;
        });
        avgPos.divideScalar(count);
        for (let v of verts) {
            const i=v.index*3;
            const factor=this.getFalloff(v.dist,this.brushSize);
            const curr=new THREE.Vector3(this.positions[i],this.positions[i+1],this.positions[i+2]);
            const diff=avgPos.clone().sub(curr);
            if (this.strokeTracker.direction.lengthSq()>0) {
                diff.sub(diff.clone().projectOnVector(this.strokeTracker.direction));
            }
            this.positions[i]  +=diff.x*factor*0.1;
            this.positions[i+1]+=diff.y*factor*0.1;
            this.positions[i+2]+=diff.z*factor*0.1;
            this.minRange=Math.min(this.minRange,i); this.maxRange=Math.max(this.maxRange,i+3);
        }
        this.updateGeometry();
    }

    // ── Grab ──────────────────────────────────────────────────────────────

    applyGrab(hitPoint, delta) {
        const verts = this.getVerticesInRadius(hitPoint, this.brushSize);
        this.minRange=Infinity; this.maxRange=-Infinity;
        const localDelta = delta.clone().applyQuaternion(this.currentMesh.quaternion.clone().invert());

        if (window.SculptWASM?.isReady()) {
            SculptWASM.grab(verts, localDelta, this.brushSize, this.brushStrength);
            return;
        }
        for (let v of verts) {
            const factor=this.getFalloff(v.dist,this.brushSize);
            const i=v.index*3;
            const gs=factor*this.brushStrength;
            this.positions[i]  +=localDelta.x*gs;
            this.positions[i+1]+=localDelta.y*gs;
            this.positions[i+2]+=localDelta.z*gs;
            this.minRange=Math.min(this.minRange,i); this.maxRange=Math.max(this.maxRange,i+3);
        }
        this.updateGeometry();
    }

    // ══════════════════════════════════════════════════════════════════════
    // GLOBAL OPERATIONS  (called from button clicks, not from sculpt())
    // ══════════════════════════════════════════════════════════════════════

    applyGlobalSmooth(iterations=3, intensity=0.5) {
        if (!this.currentMesh || !this.adjacency) return;
        const startPositions = new Float32Array(this.positions);

        if (window.SculptWASM?.isReady()) {
            SculptWASM.syncPositions();   // ensure WASM has latest (e.g. after undo)
            SculptWASM.globalSmooth(iterations, intensity);
        } else {
            this._jsGlobalSmooth(iterations, intensity);
        }

        this.currentMesh.geometry.attributes.position.needsUpdate = true;
        this.currentMesh.geometry.computeVertexNormals();
        if (window.SculptWASM?.isReady()) SculptWASM.syncNormals();
        this.buildSpatialIndex();
        if (window.SculptWASM?.isReady()) SculptWASM.rebuildBVH();

        if (this.historyManager) {
            this.historyManager.addStep({
                type:'sculpt', name:'Global Polish',
                objectUuid: this.currentMesh.uuid,
                before: startPositions,
                after: new Float32Array(this.positions)
            });
        }
    }

    _jsGlobalSmooth(iterations, intensity) {
        const positions = this.currentMesh.geometry.attributes.position.array;
        const count     = positions.length / 3;
        let src = positions.slice(), tgt = new Float32Array(src);
        for (let k=0;k<iterations;k++){
            for (let i=0;i<count;i++){
                const neighbors=this.adjacency[i];
                if (!neighbors?.length) continue;
                let ax=0,ay=0,az=0;
                for (let n of neighbors){ ax+=src[n*3];ay+=src[n*3+1];az+=src[n*3+2]; }
                ax/=neighbors.length;ay/=neighbors.length;az/=neighbors.length;
                tgt[i*3]  =src[i*3]  +(ax-src[i*3]  )*intensity;
                tgt[i*3+1]=src[i*3+1]+(ay-src[i*3+1])*intensity;
                tgt[i*3+2]=src[i*3+2]+(az-src[i*3+2])*intensity;
            }
            src.set(tgt);
        }
        positions.set(tgt);
    }

    applyHardnessContrast() {
        if (!this.currentMesh || !this.adjacency) return;
        this.tempToolStart = new Float32Array(this.positions);

        if (window.SculptWASM?.isReady()) {
            SculptWASM.syncPositions();
            SculptWASM.hardnessContrast(0.5);
        } else {
            const positions=this.positions, count=positions.length/3, contrast=0.5;
            let temp=new Float32Array(positions);
            for (let i=0;i<count;i++){
                const nbrs=this.adjacency[i]; if(!nbrs?.length) continue;
                let avg={x:0,y:0,z:0};
                for (let n of nbrs){avg.x+=temp[n*3];avg.y+=temp[n*3+1];avg.z+=temp[n*3+2];}
                avg.x/=nbrs.length;avg.y/=nbrs.length;avg.z/=nbrs.length;
                const cx=temp[i*3],cy=temp[i*3+1],cz=temp[i*3+2];
                positions[i*3]  =cx+(cx-avg.x)*contrast;
                positions[i*3+1]=cy+(cy-avg.y)*contrast;
                positions[i*3+2]=cz+(cz-avg.z)*contrast;
            }
        }
        this.finishToolOperation('Hardness Contrast');
    }

    applyAnglePreservingSmooth(iterations=1, intensity=0.5) {
        if (!this.currentMesh || !this.adjacency) return;
        this.tempToolStart = new Float32Array(this.positions);

        if (window.SculptWASM?.isReady()) {
            SculptWASM.syncPositions();
            SculptWASM.anglePreservingSmooth(iterations, intensity, 0.7);
        } else {
            const positions=this.positions, normals=this.normals;
            const count=positions.length/3;
            let temp=new Float32Array(positions);
            for (let i=0;i<count;i++){
                const nbrs=this.adjacency[i]; if(!nbrs) continue;
                const myN=new THREE.Vector3(normals[i*3],normals[i*3+1],normals[i*3+2]);
                let avg={x:0,y:0,z:0},wt=0;
                for (let n of nbrs){
                    const nN=new THREE.Vector3(normals[n*3],normals[n*3+1],normals[n*3+2]);
                    if(myN.dot(nN)>0.7){avg.x+=temp[n*3];avg.y+=temp[n*3+1];avg.z+=temp[n*3+2];wt++;}
                }
                if(wt>0){
                    avg.x/=wt;avg.y/=wt;avg.z/=wt;
                    positions[i*3]  +=(avg.x-positions[i*3]  )*intensity;
                    positions[i*3+1]+=(avg.y-positions[i*3+1])*intensity;
                    positions[i*3+2]+=(avg.z-positions[i*3+2])*intensity;
                }
            }
        }
        this.finishToolOperation('Angle Smooth');
    }

    finishToolOperation(actionName='Tool Operation') {
        this.currentMesh.geometry.attributes.position.needsUpdate = true;
        this.currentMesh.geometry.computeVertexNormals();
        if (window.SculptWASM?.isReady()) SculptWASM.syncNormals();
        this.buildSpatialIndex();
        if (window.SculptWASM?.isReady()) SculptWASM.rebuildBVH();
        if (this.historyManager && this.tempToolStart) {
            this.historyManager.addStep({
                type:'sculpt', name:actionName,
                objectUuid: this.currentMesh.uuid,
                before: this.tempToolStart,
                after: new Float32Array(this.positions)
            });
            this.tempToolStart = null;
        }
    }

    // ── Masking (JS-only: touches color buffer) ───────────────────────────

    applyMask(hitPoint, intensity) {
        const verts  = this.getVerticesInRadius(hitPoint, this.brushSize);
        if (verts.length === 0) return;
        const colors = this.currentMesh.geometry.attributes.color.array;
        const isErasing = this.keys && this.keys.shift;
        for (let v of verts) {
            const i=v.index, factor=this.getFalloff(v.dist, this.brushSize);
            this.maskData[i] = isErasing
                ? Math.max(0, this.maskData[i]-factor*intensity)
                : Math.min(1, this.maskData[i]+factor*intensity);
            const val = 1.0 - this.maskData[i]*0.8;
            colors[i*3]=colors[i*3+1]=colors[i*3+2]=val;
        }
        this.currentMesh.geometry.attributes.color.needsUpdate = true;
        /* Keep WASM mask in sync */
        if (window.SculptWASM?.isReady()) SculptWASM.syncMask(this.maskData);
    }

    clearMask() {
        if (!this.maskData) return;
        this.maskData.fill(0);
        const colors=this.currentMesh.geometry.attributes.color.array;
        for (let i=0;i<colors.length;i++) colors[i]=1.0;
        this.currentMesh.geometry.attributes.color.needsUpdate=true;
        if (window.SculptWASM?.isReady()) SculptWASM.syncMask(this.maskData);
    }

    extractMaskedGeometry(thickness=0.05) {
        if (!this.currentMesh || !this.maskData) return;
        console.log("🛡️ Extracting Armor…");
        const oldPos=this.currentMesh.geometry.attributes.position.array;
        const index =this.currentMesh.geometry.index.array;
        let extractedVertices=[];
        for (let i=0;i<index.length;i+=3){
            const a=index[i],b=index[i+1],c=index[i+2];
            if((this.maskData[a]+this.maskData[b]+this.maskData[c])/3>0.1){
                extractedVertices.push(
                    oldPos[a*3],oldPos[a*3+1],oldPos[a*3+2],
                    oldPos[b*3],oldPos[b*3+1],oldPos[b*3+2],
                    oldPos[c*3],oldPos[c*3+1],oldPos[c*3+2]
                );
            }
        }
        if (extractedVertices.length===0){ alert("No masked area to extract! Paint a mask first."); return; }

        let newGeo=new THREE.BufferGeometry();
        newGeo.setAttribute('position', new THREE.Float32BufferAttribute(extractedVertices,3));
        if (THREE.BufferGeometryUtils?.mergeVertices)
            newGeo=THREE.BufferGeometryUtils.mergeVertices(newGeo, 1e-4);
        newGeo.computeVertexNormals();

        /* Build adjacency for the extracted mesh */
        const adjLocal = this._buildStandaloneAdj(newGeo);

        /* WASM-accelerated smooth on extracted geo */
        if (window.SculptWASM?.isReady()) {
            SculptWASM.smoothStandalone(newGeo, adjLocal, 5, 0.5);
        } else {
            this.smoothGeometry(newGeo, 5);
        }

        /* Apply thickness */
        const pos=newGeo.attributes.position, norm=newGeo.attributes.normal;
        for (let i=0;i<pos.count;i++){
            pos.setXYZ(i, pos.getX(i)+norm.getX(i)*thickness,
                          pos.getY(i)+norm.getY(i)*thickness,
                          pos.getZ(i)+norm.getZ(i)*thickness);
        }
        pos.needsUpdate=true;
        newGeo.computeVertexNormals();
        newGeo.computeBoundingBox();

        const newMat=new THREE.MeshStandardMaterial({ color:0x555555, metalness:0.6, roughness:0.3, side:THREE.DoubleSide });
        const extractedMesh=new THREE.Mesh(newGeo, newMat);
        extractedMesh.position.copy(this.currentMesh.position);
        extractedMesh.rotation.copy(this.currentMesh.rotation);
        extractedMesh.scale.copy(this.currentMesh.scale);
        this.scene.add(extractedMesh);
        console.log("✅ Armor extracted!");
        return extractedMesh;
    }

    /* Build adjacency for any arbitrary geometry (used by extractMaskedGeometry) */
    _buildStandaloneAdj(geo) {
        if (!geo.index) return [];
        const index=geo.index.array, N=geo.attributes.position.count;
        const adj=new Array(N).fill(0).map(()=>[]);
        for (let i=0;i<index.length;i+=3){
            const a=index[i],b=index[i+1],c=index[i+2];
            adj[a].push(b,c);adj[b].push(a,c);adj[c].push(a,b);
        }
        for (let i=0;i<N;i++) adj[i]=[...new Set(adj[i])];
        return adj;
    }

    /* JS-only geometry smooth (fallback for extractMaskedGeometry) */
    smoothGeometry(geometry, iterations) {
        if (!geometry.index) return;
        const adj=this._buildStandaloneAdj(geometry);
        const pos=geometry.attributes.position.array;
        const N=pos.length/3;
        let src=pos.slice(),tgt=new Float32Array(src);
        for (let k=0;k<iterations;k++){
            for (let i=0;i<N;i++){
                const n=adj[i]; if(!n.length) continue;
                let ax=0,ay=0,az=0;
                for (let nb of n){ax+=src[nb*3];ay+=src[nb*3+1];az+=src[nb*3+2];}
                tgt[i*3]  =src[i*3]  +((ax/n.length)-src[i*3]  )*0.5;
                tgt[i*3+1]=src[i*3+1]+((ay/n.length)-src[i*3+1])*0.5;
                tgt[i*3+2]=src[i*3+2]+((az/n.length)-src[i*3+2])*0.5;
            }
            src.set(tgt);
        }
        pos.set(tgt);
        geometry.attributes.position.needsUpdate=true;
    }

    // ── Hard reset ────────────────────────────────────────────────────────

    hardReset() {
        if (!this.currentMesh || !this.originalPositions) return;
        const stateBeforeReset = new Float32Array(this.positions);
        this.positions.set(this.originalPositions);
        this.currentMesh.geometry.attributes.position.needsUpdate=true;
        this.currentMesh.geometry.computeVertexNormals();
        this.currentMesh.geometry.computeBoundingBox();
        this.buildSpatialIndex();
        if (window.SculptWASM?.isReady()) {
            SculptWASM.syncPositions();
            SculptWASM.syncNormals();
            SculptWASM.rebuildBVH();
        }
        if (this.historyManager) {
            this.historyManager.addStep({
                type:'sculpt', name:'Hard Reset',
                objectUuid: this.currentMesh.uuid,
                before: stateBeforeReset,
                after: new Float32Array(this.originalPositions)
            });
        }
        console.log("🔄 Mesh reset to base sculpt state.");
    }

    // ── Symmetry ──────────────────────────────────────────────────────────

    createSymmetryPlane() {
        if (this.symPlaneMesh) this.scene.remove(this.symPlaneMesh);
        const planeMat=new THREE.MeshBasicMaterial({color:0x00aaff,transparent:true,opacity:0.15,side:THREE.DoubleSide,depthWrite:false});
        this.symPlaneMesh=new THREE.Mesh(new THREE.PlaneGeometry(20,20),planeMat);
        if (this.symmetryAxis==='x') this.symPlaneMesh.rotation.y=Math.PI/2;
        if (this.symmetryAxis==='z') this.symPlaneMesh.rotation.x=Math.PI/2;
        if (this.currentMesh) this.symPlaneMesh.position.copy(this.currentMesh.position);
        this.scene.add(this.symPlaneMesh);
    }

    toggleSymmetryPlane(show) {
        if (show) this.createSymmetryPlaneHelper();
        else if (this.symmetryPlaneHelper) { this.scene.remove(this.symmetryPlaneHelper); this.symmetryPlaneHelper=null; }
    }

    createSymmetryPlaneHelper() {
        if (!this.currentMesh) return;
        if (this.symmetryPlaneHelper) this.scene.remove(this.symmetryPlaneHelper);
        const bbox=new THREE.Box3().setFromObject(this.currentMesh);
        const size=new THREE.Vector3(); bbox.getSize(size);
        const center=new THREE.Vector3(); bbox.getCenter(center);
        const m=1.1;
        let w,h;
        if (this.symmetryAxis==='x'){w=size.z*m;h=size.y*m;}
        else if(this.symmetryAxis==='y'){w=size.x*m;h=size.z*m;}
        else{w=size.x*m;h=size.y*m;}
        this.symmetryPlaneHelper=new THREE.Mesh(
            new THREE.PlaneGeometry(w,h),
            new THREE.MeshBasicMaterial({color:0x00aaff,transparent:true,opacity:0.15,side:THREE.DoubleSide,depthWrite:false})
        );
        this.symmetryPlaneHelper.position.copy(center);
        if(this.symmetryAxis==='x') this.symmetryPlaneHelper.rotation.y=Math.PI/2;
        else if(this.symmetryAxis==='z') this.symmetryPlaneHelper.rotation.x=Math.PI/2;
        this.scene.add(this.symmetryPlaneHelper);
    }

    getSymmetryPoint(pt) {
        const bbox=new THREE.Box3().setFromObject(this.currentMesh);
        const center=new THREE.Vector3(); bbox.getCenter(center);
        const sym=pt.clone();
        if(this.symmetryAxis==='x') sym.x=center.x-(pt.x-center.x);
        if(this.symmetryAxis==='y') sym.y=center.y-(pt.y-center.y);
        if(this.symmetryAxis==='z') sym.z=center.z-(pt.z-center.z);
        return sym;
    }

    getSymmetryNormal(normal) {
        const s=normal.clone();
        if(this.symmetryAxis==='x') s.x*=-1;
        if(this.symmetryAxis==='y') s.y*=-1;
        if(this.symmetryAxis==='z') s.z*=-1;
        return s.normalize();
    }

    // ── Event listeners (unchanged) ───────────────────────────────────────

    setupEventListeners() {
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mouseup',   this.onMouseUp.bind(this));
        document.addEventListener('wheel', e => {
            if (this.isActive && e.shiftKey)
                this.setBrushSize(this.brushSize + (e.deltaY > 0 ? -0.1 : 0.1));
        });
    }

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', e => { if (!this.isActive) return; if (e.key==='Control') this.isInverted=true; });
        window.addEventListener('keyup',   e => { if (e.key==='Control') this.isInverted=false; });
    }

    onMouseDown(e) {
        if (!this.isActive || e.button!==0) return;
        this.isDragging=true;
        if (this.currentMesh?.geometry)
            this.tempStartPositions=new Float32Array(this.currentMesh.geometry.attributes.position.array);
    }

    onMouseUp(e) {
        if (this.isDragging && this.currentMesh) {
            this.currentMesh.geometry.computeVertexNormals();
            this.currentMesh.geometry.computeBoundingBox();
            if (this.brushMode==='grab') {
                this.buildSpatialIndex();
                if (window.SculptWASM?.isReady()) SculptWASM.rebuildBVH();
            }
            if (window.SculptWASM?.isReady()) SculptWASM.syncNormals();

            if (this.historyManager && this.tempStartPositions) {
                const endPositions=new Float32Array(this.currentMesh.geometry.attributes.position.array);
                this.historyManager.addStep({
                    type:'sculpt',
                    name:`Sculpt: ${this.brushMode}`,
                    objectUuid:this.currentMesh.uuid,
                    before:this.tempStartPositions,
                    after:endPositions
                });
            }
        }
        this.isDragging=false;
        this.lastHitPoint=null;
        this.tempStartPositions=null;
    }

    onMouseMove(e) {
        if (!this.isActive) return;
        const canvas=this.renderer.domElement;
        const rect=canvas.getBoundingClientRect();
        this.mouse.x= ((e.clientX-rect.left)/rect.width)*2-1;
        this.mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects=this.raycaster.intersectObject(this.currentMesh);

        if (intersects.length>0) {
            const hit=intersects[0];
            const pt=hit.point;
            const norm=hit.face.normal;

            this.updateCursorVisuals(pt, norm);

            if (this.symmetryEnabled && this.symmetryCursor) {
                const symPt=this.getSymmetryPoint(pt);
                const symNorm=this.getSymmetryNormal(norm);
                this.symmetryCursor.visible=true;
                this.symmetryCursor.position.copy(symPt);
                this.symmetryCursor.lookAt(symPt.clone().add(symNorm));
                this.symCursorOuter.scale.setScalar(this.brushSize);
                this.symCursorInner.scale.setScalar(this.brushSize*(1-this.brushFalloff*0.8));
                this.symCursorOuter.material.color.setHex(0x0088ff);
                this.symCursorInner.material.color.setHex(0x0088ff);
            } else if (this.symmetryCursor) {
                this.symmetryCursor.visible=false;
            }

            if (this.isDragging) {
                const isContinuous=this.brushMode!=='grab';
                if (isContinuous && this.lastHitPoint) {
                    const dist=pt.distanceTo(this.lastHitPoint);
                    const stepSize=this.brushSize*0.2;
                    if (dist>stepSize) {
                        const steps=Math.floor(dist/stepSize);
                        for (let i=1;i<=steps;i++) {
                            const t=i/steps;
                            const lerpPt=new THREE.Vector3().lerpVectors(this.lastHitPoint,pt,t);
                            this.sculpt(lerpPt, norm);
                            if (this.symmetryEnabled) {
                                this.sculpt(this.getSymmetryPoint(lerpPt), this.getSymmetryNormal(norm));
                            }
                        }
                    } else {
                        this.sculpt(pt, norm);
                        if (this.symmetryEnabled)
                            this.sculpt(this.getSymmetryPoint(pt), this.getSymmetryNormal(norm));
                    }
                } else {
                    if (this.brushMode==='grab' && this.lastHitPoint) {
                        const delta=pt.clone().sub(this.lastHitPoint);
                        this.applyGrab(this.lastHitPoint, delta);
                        if (this.symmetryEnabled) {
                            const symStart=this.getSymmetryPoint(this.lastHitPoint);
                            const symDelta=delta.clone();
                            if(this.symmetryAxis==='x') symDelta.x*=-1;
                            if(this.symmetryAxis==='y') symDelta.y*=-1;
                            if(this.symmetryAxis==='z') symDelta.z*=-1;
                            this.applyGrab(symStart, symDelta);
                        }
                    } else if (this.brushMode!=='grab') {
                        this.sculpt(pt, norm);
                        if (this.symmetryEnabled)
                            this.sculpt(this.getSymmetryPoint(pt), this.getSymmetryNormal(norm));
                    }
                }
                this.lastHitPoint=pt.clone();
            } else {
                this.lastHitPoint=pt.clone();
            }
        } else {
            this.brushCursor.visible=false;
            if (this.symmetryCursor) this.symmetryCursor.visible=false;
            this.lastHitPoint=null;
        }
    }

    // ── Setters ───────────────────────────────────────────────────────────

    setBrushMode(m)     { this.brushMode=m; }
    setBrushSize(s)     { this.brushSize=Math.max(0.05, parseFloat(s)); }
    setBrushStrength(s) { this.brushStrength=parseFloat(s); }
    setBrushFalloff(s)  { this.brushFalloff=parseFloat(s); }

    setSymmetry(isEnabled) {
        this.symmetryEnabled=isEnabled;
        if (this.symmetryCursor) this.symmetryCursor.visible=isEnabled;
        const pt=document.getElementById('show-symmetry-plane-toggle');
        if (pt?.checked && isEnabled) this.toggleSymmetryPlane(true);
        else this.toggleSymmetryPlane(false);
        console.log(`System Symmetry: ${this.symmetryEnabled}`);
        setTimeout(()=>this.debugSymmetryCursors(),100);
    }

    setSymmetryAxis(a) {
        this.symmetryAxis=a;
        if (this.symmetryEnabled && this.symmetryPlaneHelper) this.createSymmetryPlaneHelper();
    }

    getStatus() {
        return {
            isActive    : this.isActive,
            meshName    : this.currentMesh ? this.currentMesh.name : 'None',
            brushMode   : (this.isInverted ? '(-) ' : '(+) ') + this.brushMode.toUpperCase(),
            historyStep : 0,
            historyMax  : 0,
        };
    }

    debugSymmetryCursors() {
        console.log("=== SYMMETRY CURSOR DEBUG ===");
        console.log("Main cursor exists:", !!this.brushCursor, "visible:", this.brushCursor?.visible);
        console.log("Sym  cursor exists:", !!this.symmetryCursor, "visible:", this.symmetryCursor?.visible);
    }
}

if (typeof module !== 'undefined' && module.exports)
    module.exports = { AdvancedSculptingSystem };
