/**
 * SM Engine — Professional Editor Mode Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspired by Unreal Engine 5 & Unity editor workflows.
 * Provides distinct editor modes with mode-specific toolbars, viewport
 * configurations, gizmos, and panel visibility.
 *
 * Modes:
 *   MODE_GAME       – Full 3D game development (UE5 Game Viewport)
 *   MODE_CINEMATIC  – Cinematic camera & filming (UE5 Cinematic Viewport)
 *   MODE_TERRAIN    – Terrain sculpting & landscape (UE5 Landscape Mode)
 *   MODE_MODELING   – 3D modeling & mesh editing (UE5 Modeling Mode)
 *   MODE_ANIMATION  – Animation & rigging (UE5 Animation Mode)
 *   MODE_2D         – 2D game development (Unity 2D)
 *   MODE_2_5D       – 2.5D isometric / platformer
 * ─────────────────────────────────────────────────────────────────────────────
 */

class GameModeManager {
    constructor() {
        this.currentMode = null;
        this.previousMode = null;
        this.modeChangeCallbacks = [];
        this._viewportOverlays = {};
        this._modePanels = {};
        this._modeToolbars = {};

        // ── Editor Mode Definitions ──────────────────────────────────────
        this.modes = {

            /* ──────────────── GAME MODE (3D Game Dev) ──────────────── */
            MODE_GAME: {
                id: 'MODE_GAME',
                name: 'Game',
                fullName: 'Game Development',
                icon: 'fa-gamepad',
                tag: 'GAME',
                tagColor: '#10b981',
                shortcut: 'F1',
                description: 'Full 3D game development viewport',
                viewport: {
                    cameraMode: 'perspective',
                    cameraPosition: { x: 8, y: 12, z: 16 },
                    cameraLookAt: { x: 0, y: 0, z: 0 },
                    fov: 75,
                    near: 0.1,
                    far: 10000,
                    gridVisible: true,
                    gridSize: 1000,
                    gridDivisions: 100,
                    showAxes: true,
                    showStats: true,
                    backgroundColor: '#1a1a2e',
                },
                rendering: {
                    shadows: true,
                    shadowMapSize: 2048,
                    antiAliasing: true,
                    postProcessing: true,
                    bloom: false,
                    toneMapping: 'ACESFilmic',
                    exposure: 1.0,
                    ambientOcclusion: true,
                    reflections: true,
                },
                lighting: {
                    preset: 'game',
                    ambientIntensity: 0.3,
                    directionalIntensity: 1.2,
                    skyLight: true,
                    hdri: true,
                },
                physics: {
                    engine: 'rapier',
                    gravity: { x: 0, y: -9.81, z: 0 },
                    debugDraw: false,
                    simulation: true,
                },
                panels: {
                    showHierarchy: true,
                    showInspector: true,
                    showAssets: true,
                    showToolbar: true,
                    showTimeline: false,
                    showModelingTools: false,
                    showTerrainTools: false,
                    showAnimationTools: false,
                    showCinematicTools: false,
                },
                gizmo: {
                    transform: 'translate',
                    space: 'world',
                    snapEnabled: false,
                    snapSize: 0.25,
                },
                cursor: 'default',
            },

            /* ──────────────── CINEMATIC MODE (Filming) ─────────────── */
            MODE_CINEMATIC: {
                id: 'MODE_CINEMATIC',
                name: 'Cinematic',
                fullName: 'Cinematic / Filming',
                icon: 'fa-video',
                tag: 'CINE',
                tagColor: '#ef4444',
                shortcut: 'F2',
                description: 'Cinematic camera control & filmmaking',
                viewport: {
                    cameraMode: 'perspective',
                    cameraPosition: { x: 0, y: 2, z: 5 },
                    cameraLookAt: { x: 0, y: 1, z: 0 },
                    fov: 50,
                    near: 0.01,
                    far: 50000,
                    gridVisible: false,
                    gridSize: 100,
                    gridDivisions: 20,
                    showAxes: false,
                    showStats: false,
                    backgroundColor: '#0a0a0a',
                    aspectRatio: '16:9',
                    safeFrames: true,
                    letterbox: true,
                },
                rendering: {
                    shadows: true,
                    shadowMapSize: 4096,
                    antiAliasing: true,
                    postProcessing: true,
                    bloom: true,
                    toneMapping: 'ACESFilmic',
                    exposure: 0.8,
                    ambientOcclusion: true,
                    reflections: true,
                    motionBlur: true,
                    depthOfField: true,
                    filmGrain: 0.05,
                },
                lighting: {
                    preset: 'cinematic',
                    ambientIntensity: 0.2,
                    directionalIntensity: 1.5,
                    skyLight: true,
                    hdri: true,
                },
                physics: {
                    engine: 'rapier',
                    gravity: { x: 0, y: -9.81, z: 0 },
                    debugDraw: false,
                    simulation: false,
                },
                panels: {
                    showHierarchy: true,
                    showInspector: true,
                    showAssets: true,
                    showToolbar: true,
                    showTimeline: true,
                    showModelingTools: false,
                    showTerrainTools: false,
                    showAnimationTools: false,
                    showCinematicTools: true,
                },
                gizmo: {
                    transform: 'translate',
                    space: 'world',
                    snapEnabled: false,
                    snapSize: 0.1,
                },
                cursor: 'crosshair',
                cinematic: {
                    cameraRails: true,
                    autoFocus: true,
                    aperture: 2.8,
                    shutterSpeed: 1/50,
                    iso: 100,
                    focalLength: 35,
                },
            },

            /* ──────────────── TERRAIN MODE (Sculpting) ─────────────── */
            MODE_TERRAIN: {
                id: 'MODE_TERRAIN',
                name: 'Terrain',
                fullName: 'Terrain & Landscape',
                icon: 'fa-mountain',
                tag: 'TERR',
                tagColor: '#8b5cf6',
                shortcut: 'F3',
                description: 'Terrain sculpting & landscape editing',
                viewport: {
                    cameraMode: 'perspective',
                    cameraPosition: { x: 20, y: 30, z: 20 },
                    cameraLookAt: { x: 0, y: 0, z: 0 },
                    fov: 60,
                    near: 0.1,
                    far: 50000,
                    gridVisible: true,
                    gridSize: 5000,
                    gridDivisions: 200,
                    showAxes: true,
                    showStats: false,
                    backgroundColor: '#1a1a2e',
                    topDownView: false,
                },
                rendering: {
                    shadows: true,
                    shadowMapSize: 4096,
                    antiAliasing: true,
                    postProcessing: false,
                    bloom: false,
                    toneMapping: 'ACESFilmic',
                    exposure: 1.0,
                    ambientOcclusion: false,
                    reflections: false,
                    wireframeOverlay: false,
                },
                lighting: {
                    preset: 'outdoor',
                    ambientIntensity: 0.4,
                    directionalIntensity: 1.5,
                    skyLight: true,
                    hdri: true,
                },
                physics: {
                    engine: 'rapier',
                    gravity: { x: 0, y: -9.81, z: 0 },
                    debugDraw: false,
                    simulation: false,
                },
                panels: {
                    showHierarchy: true,
                    showInspector: true,
                    showAssets: true,
                    showToolbar: true,
                    showTimeline: false,
                    showModelingTools: false,
                    showTerrainTools: true,
                    showAnimationTools: false,
                    showCinematicTools: false,
                },
                gizmo: {
                    transform: 'translate',
                    space: 'local',
                    snapEnabled: true,
                    snapSize: 1.0,
                },
                cursor: 'pointer',
                terrain: {
                    brushSize: 10,
                    brushStrength: 0.5,
                    brushFalloff: 0.3,
                    sculptMode: 'raise',
                    autoGenerate: false,
                    materialLayer: 0,
                },
            },

            /* ──────────────── MODELING MODE (3D Modeling) ──────────── */
            MODE_MODELING: {
                id: 'MODE_MODELING',
                name: 'Modeling',
                fullName: '3D Modeling',
                icon: 'fa-cube',
                tag: 'MODL',
                tagColor: '#f59e0b',
                shortcut: 'F4',
                description: 'Advanced 3D modeling & mesh editing',
                viewport: {
                    cameraMode: 'perspective',
                    cameraPosition: { x: 5, y: 5, z: 5 },
                    cameraLookAt: { x: 0, y: 0, z: 0 },
                    fov: 45,
                    near: 0.01,
                    far: 10000,
                    gridVisible: true,
                    gridSize: 100,
                    gridDivisions: 50,
                    showAxes: true,
                    showStats: false,
                    backgroundColor: '#1e1e1e',
                    wireframeOverlay: false,
                    xrayMode: false,
                },
                rendering: {
                    shadows: true,
                    shadowMapSize: 1024,
                    antiAliasing: true,
                    postProcessing: false,
                    bloom: false,
                    toneMapping: 'Neutral',
                    exposure: 1.0,
                    ambientOcclusion: false,
                    reflections: false,
                    matCap: true,
                },
                lighting: {
                    preset: 'studio',
                    ambientIntensity: 0.5,
                    directionalIntensity: 1.0,
                    skyLight: false,
                    hdri: false,
                    studioLights: true,
                },
                physics: {
                    engine: 'rapier',
                    gravity: { x: 0, y: -9.81, z: 0 },
                    debugDraw: false,
                    simulation: false,
                },
                panels: {
                    showHierarchy: true,
                    showInspector: true,
                    showAssets: true,
                    showToolbar: true,
                    showTimeline: false,
                    showModelingTools: true,
                    showTerrainTools: false,
                    showAnimationTools: false,
                    showCinematicTools: false,
                },
                gizmo: {
                    transform: 'translate',
                    space: 'local',
                    snapEnabled: true,
                    snapSize: 0.1,
                    showTransformGizmo: true,
                },
                cursor: 'default',
                modeling: {
                    selectionMode: 'object',
                    symmetryAxis: null,
                    useSoftSelection: false,
                    showNormals: false,
                    showWireframe: false,
                },
            },

            /* ──────────────── ANIMATION MODE ────────────────────────── */
            MODE_ANIMATION: {
                id: 'MODE_ANIMATION',
                name: 'Animation',
                fullName: 'Animation & Rigging',
                icon: 'fa-running',
                tag: 'ANIM',
                tagColor: '#3b82f6',
                shortcut: 'F5',
                description: 'Character animation, rigging & timeline',
                viewport: {
                    cameraMode: 'perspective',
                    cameraPosition: { x: 3, y: 3, z: 5 },
                    cameraLookAt: { x: 0, y: 1, z: 0 },
                    fov: 50,
                    near: 0.01,
                    far: 1000,
                    gridVisible: true,
                    gridSize: 50,
                    gridDivisions: 25,
                    showAxes: true,
                    showStats: false,
                    backgroundColor: '#1a1a2e',
                },
                rendering: {
                    shadows: true,
                    shadowMapSize: 1024,
                    antiAliasing: true,
                    postProcessing: false,
                    bloom: false,
                    toneMapping: 'Neutral',
                    exposure: 1.0,
                    ambientOcclusion: false,
                    reflections: false,
                },
                lighting: {
                    preset: 'studio',
                    ambientIntensity: 0.5,
                    directionalIntensity: 1.0,
                    skyLight: false,
                    hdri: false,
                    studioLights: true,
                },
                physics: {
                    engine: 'rapier',
                    gravity: { x: 0, y: -9.81, z: 0 },
                    debugDraw: false,
                    simulation: false,
                },
                panels: {
                    showHierarchy: true,
                    showInspector: true,
                    showAssets: true,
                    showToolbar: true,
                    showTimeline: true,
                    showModelingTools: false,
                    showTerrainTools: false,
                    showAnimationTools: true,
                    showCinematicTools: false,
                },
                gizmo: {
                    transform: 'translate',
                    space: 'local',
                    snapEnabled: false,
                    snapSize: 0.05,
                },
                cursor: 'default',
                animation: {
                    autoPlay: false,
                    loop: true,
                    showBones: true,
                    showRig: true,
                    ghosting: false,
                    ghostFrames: 5,
                },
            },

            /* ──────────────── 2D MODE ───────────────────────────────── */
            MODE_2D: {
                id: 'MODE_2D',
                name: '2D Game',
                fullName: '2D Game Development',
                icon: 'fa-image',
                tag: '2D',
                tagColor: '#ec4899',
                shortcut: 'F6',
                description: 'Top-down or side-scrolling 2D games',
                viewport: {
                    cameraMode: 'orthographic',
                    cameraPosition: { x: 0, y: 30, z: 0 },
                    cameraLookAt: { x: 0, y: 0, z: 0 },
                    fov: 75,
                    near: 0.1,
                    far: 1000,
                    orthographicScale: 25,
                    gridVisible: true,
                    gridSize: 1000,
                    gridDivisions: 100,
                    showAxes: true,
                    showStats: false,
                    backgroundColor: '#1c1c1c',
                },
                rendering: {
                    shadows: false,
                    shadowMapSize: 512,
                    antiAliasing: true,
                    postProcessing: false,
                    bloom: false,
                    toneMapping: 'Neutral',
                    exposure: 1.0,
                    ambientOcclusion: false,
                    reflections: false,
                },
                lighting: {
                    preset: 'simple',
                    ambientIntensity: 0.8,
                    directionalIntensity: 0.5,
                    skyLight: false,
                    hdri: false,
                },
                physics: {
                    engine: 'arcade',
                    gravity: { x: 0, y: -9.81, z: 0 },
                    debugDraw: false,
                    simulation: true,
                },
                panels: {
                    showHierarchy: true,
                    showInspector: true,
                    showAssets: true,
                    showToolbar: true,
                    showTimeline: false,
                    showModelingTools: false,
                    showTerrainTools: false,
                    showAnimationTools: false,
                    showCinematicTools: false,
                },
                gizmo: {
                    transform: 'translate',
                    space: 'world',
                    snapEnabled: true,
                    snapSize: 0.5,
                },
                cursor: 'default',
            },

            /* ──────────────── 2.5D MODE ─────────────────────────────── */
            MODE_2_5D: {
                id: 'MODE_2_5D',
                name: '2.5D Game',
                fullName: '2.5D Isometric / Platformer',
                icon: 'fa-cubes',
                tag: '2.5D',
                tagColor: '#f59e0b',
                shortcut: 'F7',
                description: 'Isometric or pseudo-3D games',
                viewport: {
                    cameraMode: 'perspective',
                    cameraPosition: { x: 0, y: 5, z: 18 },
                    cameraLookAt: { x: 0, y: 2, z: 0 },
                    fov: 60,
                    near: 0.1,
                    far: 1000,
                    orthographicScale: 20,
                    gridVisible: true,
                    gridSize: 1000,
                    gridDivisions: 100,
                    showAxes: true,
                    showStats: false,
                    backgroundColor: '#1a1a2e',
                },
                rendering: {
                    shadows: true,
                    shadowMapSize: 1024,
                    antiAliasing: true,
                    postProcessing: false,
                    bloom: false,
                    toneMapping: 'Neutral',
                    exposure: 1.0,
                    ambientOcclusion: false,
                    reflections: false,
                },
                lighting: {
                    preset: 'moderate',
                    ambientIntensity: 0.5,
                    directionalIntensity: 1.0,
                    skyLight: true,
                    hdri: false,
                },
                physics: {
                    engine: 'rapier',
                    gravity: { x: 0, y: -9.81, z: 0 },
                    debugDraw: false,
                    simulation: true,
                },
                panels: {
                    showHierarchy: true,
                    showInspector: true,
                    showAssets: true,
                    showToolbar: true,
                    showTimeline: false,
                    showModelingTools: false,
                    showTerrainTools: false,
                    showAnimationTools: false,
                    showCinematicTools: false,
                },
                gizmo: {
                    transform: 'translate',
                    space: 'world',
                    snapEnabled: true,
                    snapSize: 0.25,
                },
                cursor: 'default',
            },
        };

        this._initUI();
        this._bindKeyboardShortcuts();
    }

    // ═══════════════════════════════════════════════════════════════════
    //  UI INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════

    _initUI() {
        if (!document.body) {
            setTimeout(() => this._initUI(), 100);
            return;
        }

        this._createModeSelectorModal();
        this._createModeIndicator();
        this._createModeToolbar();
        this._injectStyles();
    }

    /**
     * Create the mode selector modal (UE5-style mode picker)
     */
    _createModeSelectorModal() {
        this.modeModal = document.createElement('div');
        this.modeModal.id = 'sm-mode-modal';
        this.modeModal.className = 'sm-mode-modal';

        const modes = Object.values(this.modes);
        const cardsHtml = modes.map(m => `
            <div class="sm-mode-card" data-mode="${m.id}">
                <div class="sm-card-accent" style="background:${m.tagColor}"></div>
                <div class="sm-card-icon" style="color:${m.tagColor}">
                    <i class="fas ${m.icon}"></i>
                </div>
                <div class="sm-card-body">
                    <div class="sm-card-header">
                        <h3>${m.fullName}</h3>
                        <span class="sm-card-shortcut">${m.shortcut}</span>
                    </div>
                    <p>${m.description}</p>
                    <div class="sm-card-tags">
                        <span class="sm-card-tag" style="background:${m.tagColor}22;color:${m.tagColor};border-color:${m.tagColor}44">
                            ${m.tag}
                        </span>
                        <span class="sm-card-tag">${m.viewport.cameraMode}</span>
                    </div>
                </div>
                <div class="sm-card-select">
                    <span>Select</span>
                    <i class="fas fa-arrow-right"></i>
                </div>
            </div>
        `).join('');

        this.modeModal.innerHTML = `
            <div class="sm-mode-window">
                <div class="sm-mode-header">
                    <div class="sm-mode-title">
                        <i class="fas fa-compass"></i>
                        <span>Editor Mode Selector</span>
                    </div>
                    <button class="sm-mode-close" id="sm-mode-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="sm-mode-search">
                    <i class="fas fa-search"></i>
                    <input type="text" id="sm-mode-search-input" placeholder="Search modes..." autofocus>
                </div>
                <div class="sm-mode-grid" id="sm-mode-grid">
                    ${cardsHtml}
                </div>
                <div class="sm-mode-footer">
                    <span>Press shortcut key to switch instantly</span>
                    <button class="sm-mode-btn sm-mode-btn-cancel" id="sm-mode-cancel">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modeModal);
        this._bindModalEvents();
    }

    /**
     * Create the mode indicator in the main toolbar
     */
    _createModeIndicator() {
        this.modeBtn = document.createElement('button');
        this.modeBtn.id = 'sm-mode-indicator';
        this.modeBtn.className = 'sm-mode-indicator';
        this.modeBtn.innerHTML = `
            <i class="fas fa-gamepad"></i>
            <span class="sm-mode-label">Game</span>
            <span class="sm-mode-dot"></span>
            <i class="fas fa-chevron-down sm-mode-arrow"></i>
        `;
        this.modeBtn.title = 'Switch Editor Mode (F1-F7)';
        this.modeBtn.addEventListener('click', () => this.toggleModal());

        // Insert into toolbar
        const insertTarget = () => {
            const toolbar = document.getElementById('toolBar') || document.querySelector('.blender-top-bar');
            if (toolbar) {
                // Insert at the beginning of the toolbar
                const firstChild = toolbar.firstChild;
                if (firstChild && firstChild.id !== 'sm-mode-indicator') {
                    toolbar.insertBefore(this.modeBtn, firstChild);
                } else if (!firstChild) {
                    toolbar.appendChild(this.modeBtn);
                }
                return true;
            }
            return false;
        };

        if (!insertTarget()) {
            // Retry until toolbar exists
            const interval = setInterval(() => {
                if (insertTarget()) clearInterval(interval);
            }, 200);
        }
    }

    /**
     * Create the mode-specific toolbar that changes per mode
     */
    _createModeToolbar() {
        this.modeToolbar = document.createElement('div');
        this.modeToolbar.id = 'sm-mode-toolbar';
        this.modeToolbar.className = 'sm-mode-toolbar';
        this.modeToolbar.style.display = 'none';

        const subToolbar = document.getElementById('subToolBar');
        if (subToolbar) {
            subToolbar.parentNode.insertBefore(this.modeToolbar, subToolbar.nextSibling);
        } else {
            document.body.appendChild(this.modeToolbar);
        }
    }

    /**
     * Inject all mode-related styles
     */
    _injectStyles() {
        const styleId = 'sm-mode-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
/* ═══════════════════════════════════════════════════════════════════
   SM ENGINE — EDITOR MODE STYLES
   ═══════════════════════════════════════════════════════════════════ */

/* ── Mode Selector Modal ─────────────────────────────────────────── */
.sm-mode-modal {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: smFadeIn 0.2s ease;
}

.sm-mode-modal.active {
    display: flex;
}

@keyframes smFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes smSlideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.sm-mode-window {
    background: #141416;
    border: 1px solid #2a2a30;
    border-radius: 16px;
    width: min(960px, 94vw);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 40px 120px rgba(0, 0, 0, 0.9);
    animation: smSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.sm-mode-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
}

.sm-mode-title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 17px;
    font-weight: 600;
    color: #eee;
    letter-spacing: 0.2px;
}

.sm-mode-title i {
    color: #10b981;
    font-size: 18px;
}

.sm-mode-close {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    font-size: 16px;
    padding: 8px;
    border-radius: 6px;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
}

.sm-mode-close:hover {
    background: #2a2a2a;
    color: #fff;
}

/* ── Search ──────────────────────────────────────────────────────── */
.sm-mode-search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    border-bottom: 1px solid #1a1a1a;
    background: #111;
    flex-shrink: 0;
}

.sm-mode-search i {
    color: #555;
    font-size: 14px;
}

.sm-mode-search input {
    flex: 1;
    background: transparent;
    border: none;
    color: #ccc;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    padding: 4px 0;
}

.sm-mode-search input::placeholder {
    color: #444;
}

/* ── Mode Grid ───────────────────────────────────────────────────── */
.sm-mode-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    padding: 20px 24px;
    overflow-y: auto;
    flex: 1;
}

/* ── Mode Card ───────────────────────────────────────────────────── */
.sm-mode-card {
    background: #1a1a1e;
    border: 1px solid #28282e;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    user-select: none;
}

.sm-mode-card:hover {
    transform: translateY(-4px);
    border-color: #3a3a44;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    background: #1e1e24;
}

.sm-mode-card:active {
    transform: translateY(-1px);
}

.sm-card-accent {
    height: 3px;
    width: 100%;
    flex-shrink: 0;
}

.sm-card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    padding: 16px 0 8px;
}

.sm-card-body {
    padding: 0 16px 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.sm-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
}

.sm-card-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #eee;
    letter-spacing: -0.1px;
}

.sm-card-shortcut {
    font-size: 10px;
    color: #555;
    background: #222;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    letter-spacing: 0.5px;
    border: 1px solid #2a2a2a;
}

.sm-card-body p {
    margin: 4px 0 8px;
    font-size: 11px;
    color: #777;
    line-height: 1.4;
    flex: 1;
}

.sm-card-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}

.sm-card-tag {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 4px;
    background: #222;
    color: #888;
    border: 1px solid #2a2a2a;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 500;
}

.sm-card-select {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    margin: 0 16px 14px;
    background: #222;
    border: 1px solid #2e2e34;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    color: #666;
    transition: all 0.2s;
    letter-spacing: 0.3px;
    text-transform: uppercase;
}

.sm-mode-card:hover .sm-card-select {
    background: #2a2a30;
    color: #aaa;
    border-color: #3a3a44;
}

.sm-card-select i {
    font-size: 10px;
    transition: transform 0.2s;
}

.sm-mode-card:hover .sm-card-select i {
    transform: translateX(3px);
}

/* ── Footer ──────────────────────────────────────────────────────── */
.sm-mode-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    border-top: 1px solid #1a1a1a;
    flex-shrink: 0;
    background: #111;
}

.sm-mode-footer span {
    font-size: 11px;
    color: #555;
}

.sm-mode-btn {
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid #333;
    transition: all 0.15s;
    font-family: inherit;
}

.sm-mode-btn-cancel {
    background: #222;
    color: #888;
}

.sm-mode-btn-cancel:hover {
    background: #2a2a2a;
    color: #ccc;
    border-color: #444;
}

/* ── Mode Indicator (Toolbar Button) ─────────────────────────────── */
.sm-mode-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #1a1a20, #22222a);
    border: 1px solid #2e2e36;
    color: #ccc;
    padding: 6px 14px 6px 12px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 8px;
    height: 32px;
    transition: all 0.2s;
    white-space: nowrap;
    font-family: inherit;
    position: relative;
    margin: 4px;
}

.sm-mode-indicator:hover {
    background: linear-gradient(135deg, #22222a, #2a2a32);
    border-color: #3a3a44;
    color: #fff;
}

.sm-mode-indicator i:first-child {
    font-size: 13px;
    color: #10b981;
}

.sm-mode-label {
    font-weight: 600;
    letter-spacing: 0.2px;
}

.sm-mode-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    transition: background 0.3s;
}

.sm-mode-arrow {
    font-size: 9px;
    color: #555;
    margin-left: 2px;
}

/* ── Mode-specific dot colors ────────────────────────────────────── */
.sm-mode-indicator.mode-game .sm-mode-dot { background: #10b981; }
.sm-mode-indicator.mode-game i:first-child { color: #10b981; }

.sm-mode-indicator.mode-cinematic .sm-mode-dot { background: #ef4444; }
.sm-mode-indicator.mode-cinematic i:first-child { color: #ef4444; }

.sm-mode-indicator.mode-terrain .sm-mode-dot { background: #8b5cf6; }
.sm-mode-indicator.mode-terrain i:first-child { color: #8b5cf6; }

.sm-mode-indicator.mode-modeling .sm-mode-dot { background: #f59e0b; }
.sm-mode-indicator.mode-modeling i:first-child { color: #f59e0b; }

.sm-mode-indicator.mode-animation .sm-mode-dot { background: #3b82f6; }
.sm-mode-indicator.mode-animation i:first-child { color: #3b82f6; }

.sm-mode-indicator.mode-2d .sm-mode-dot { background: #ec4899; }
.sm-mode-indicator.mode-2d i:first-child { color: #ec4899; }

.sm-mode-indicator.mode-25d .sm-mode-dot { background: #f59e0b; }
.sm-mode-indicator.mode-25d i:first-child { color: #f59e0b; }

/* ── Mode Toolbar (context-sensitive) ────────────────────────────── */
.sm-mode-toolbar {
    display: none;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: #18181a;
    border-bottom: 1px solid #222;
    overflow-x: auto;
    min-height: 36px;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

.sm-mode-toolbar.visible {
    display: flex;
}

.sm-mode-toolbar .sm-tool-group {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    border-right: 1px solid #2a2a2a;
}

.sm-mode-toolbar .sm-tool-group:last-child {
    border-right: none;
}

.sm-mode-toolbar .sm-tool-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    color: #888;
    padding: 5px 10px;
    font-size: 11px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
    white-space: nowrap;
    font-family: inherit;
}

.sm-mode-toolbar .sm-tool-btn:hover {
    background: #2a2a2a;
    color: #ccc;
}

.sm-mode-toolbar .sm-tool-btn.active {
    background: #2a2a32;
    color: #fff;
}

.sm-mode-toolbar .sm-tool-btn i {
    font-size: 12px;
}

.sm-mode-toolbar .sm-tool-label {
    font-size: 10px;
    color: #555;
    padding: 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
}

/* ── Viewport Overlay Badge ──────────────────────────────────────── */
.sm-viewport-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 10px;
    color: #aaa;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    pointer-events: none;
    user-select: none;
}

.sm-viewport-badge i {
    font-size: 11px;
}

.sm-viewport-badge .sm-badge-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
}

/* ── Toast Notification ──────────────────────────────────────────── */
.sm-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 100001;
    background: #1a1a1e;
    border: 1px solid #2a2a30;
    color: #d4d4d4;
    padding: 12px 18px;
    border-radius: 10px;
    font-size: 12px;
    opacity: 0;
    transform: translateY(12px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}

.sm-toast.show {
    opacity: 1;
    transform: translateY(0);
}

.sm-toast i {
    font-size: 14px;
}

/* ── Cinematic Safe Frames ───────────────────────────────────────── */
.sm-safe-frames {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 50;
}

.sm-safe-frames .sm-safe-inner {
    position: absolute;
    inset: 5%;
    border: 1px solid rgba(255, 255, 255, 0.12);
}

.sm-safe-frames .sm-safe-action {
    position: absolute;
    inset: 10%;
    border: 1px solid rgba(255, 255, 255, 0.06);
}

.sm-safe-frames .sm-safe-center {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 2px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    transform: translate(-50%, -50%);
}

/* ── Terrain Brush Cursor ────────────────────────────────────────── */
.sm-terrain-cursor {
    position: absolute;
    pointer-events: none;
    z-index: 60;
    border: 2px solid rgba(139, 92, 246, 0.6);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    display: none;
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.2);
}

/* ── Responsive ──────────────────────────────────────────────────── */
@media (max-width: 768px) {
    .sm-mode-grid {
        grid-template-columns: 1fr;
        padding: 12px;
    }
    .sm-mode-window {
        width: 98vw;
        max-height: 95vh;
    }
    .sm-mode-indicator .sm-mode-label {
        display: none;
    }
}
        `;

        document.head.appendChild(style);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  EVENT BINDING
    // ═══════════════════════════════════════════════════════════════════

    _bindModalEvents() {
        const modal = this.modeModal;

        // Card selection
        modal.addEventListener('click', e => {
            const card = e.target.closest('.sm-mode-card');
            if (card) {
                const mode = card.dataset.mode;
                this.setMode(mode);
                this.closeModal();
                return;
            }

            // Close button
            if (e.target.closest('#sm-mode-close') || e.target.closest('#sm-mode-cancel')) {
                this.closeModal();
                return;
            }

            // Overlay click
            if (e.target === modal) {
                this.closeModal();
            }
        });

        // Search filtering
        const searchInput = modal.querySelector('#sm-mode-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', e => {
                const query = e.target.value.toLowerCase().trim();
                const cards = modal.querySelectorAll('.sm-mode-card');
                cards.forEach(card => {
                    const text = card.textContent.toLowerCase();
                    card.style.display = text.includes(query) ? '' : 'none';
                });
            });

            // Keyboard navigation in search
            searchInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const visible = modal.querySelector('.sm-mode-card[style*="display: none"]') === null
                        ? modal.querySelector('.sm-mode-card')
                        : modal.querySelector('.sm-mode-card:not([style*="display: none"])');
                    if (visible) {
                        this.setMode(visible.dataset.mode);
                        this.closeModal();
                    }
                }
                if (e.key === 'Escape') {
                    this.closeModal();
                }
            });
        }
    }

    _bindKeyboardShortcuts() {
        document.addEventListener('keydown', e => {
            // Don't intercept if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

            switch (e.key) {
                case 'F1': e.preventDefault(); this.setMode('MODE_GAME'); break;
                case 'F2': e.preventDefault(); this.setMode('MODE_CINEMATIC'); break;
                case 'F3': e.preventDefault(); this.setMode('MODE_TERRAIN'); break;
                case 'F4': e.preventDefault(); this.setMode('MODE_MODELING'); break;
                case 'F5': e.preventDefault(); this.setMode('MODE_ANIMATION'); break;
                case 'F6': e.preventDefault(); this.setMode('MODE_2D'); break;
                case 'F7': e.preventDefault(); this.setMode('MODE_2_5D'); break;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    //  MODE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Set the active editor mode
     */
    setMode(modeKey) {
        if (!this.modes[modeKey]) {
            console.warn(`[GameModeManager] Unknown mode: ${modeKey}`);
            return;
        }

        if (this.currentMode === modeKey) return;

        this.previousMode = this.currentMode;
        this.currentMode = modeKey;
        localStorage.setItem('sm_editor_mode', modeKey);

        const mode = this.modes[modeKey];

        // Apply all mode settings
        this._applyViewportSettings(mode);
        this._applyRenderingSettings(mode);
        this._applyLightingSettings(mode);
        this._applyPhysicsSettings(mode);
        this._applyPanelVisibility(mode);
        this._applyGizmoSettings(mode);
        this._updateModeToolbar(mode);
        this._updateViewportOverlay(mode);
        this._updateModeIndicator(modeKey);

        // Route to the workspace manager so UE5 environment (floor, obstacles),
        // gameplay-sample environment and player visibility always follow the
        // mode the user actually selected — even when switched via F-keys or
        // the GameModeManager toolbar.
        try {
            const wsMapping = {
                MODE_GAME: 'GAME_DEV',
                MODE_CINEMATIC: 'FILM',
                MODE_TERRAIN: 'TERRAIN',
                MODE_MODELING: 'FILM',
                MODE_ANIMATION: 'FILM',
                MODE_2D: 'GAME_DEV',
                MODE_2_5D: 'GAME_DEV'
            };
            const wsMode = wsMapping[modeKey];
            if (wsMode && window.workspaceManager && typeof window.workspaceManager.setMode === 'function') {
                if (modeKey === 'MODE_2D' || modeKey === 'MODE_2_5D') {
                    window.workspaceManager.setGameMode?.(
                        modeKey === 'MODE_2D' ? '2D' : '2.5D',
                        { applyViewport: false, showToast: false }
                    );
                }
                window.workspaceManager.setMode(wsMode);
            }
        } catch (err) {
            console.warn('[GameModeManager] Workspace routing error:', err);
        }

        // Fire callbacks
        this.modeChangeCallbacks.forEach(cb => {
            try { cb(modeKey, mode, this.previousMode); } catch (err) {
                console.warn('[GameModeManager] Callback error:', err);
            }
        });

        // Dispatch event
        window.dispatchEvent(new CustomEvent('editorModeChanged', {
            detail: { mode: modeKey, previousMode: this.previousMode, config: mode }
        }));

        this._showToast(`Switched to <strong>${mode.fullName}</strong>`, mode.tagColor);
        console.log(`[GameModeManager] ✓ Mode: ${modeKey} (${mode.fullName})`);
    }

    /**
     * Get current mode key
     */
    getCurrentMode() {
        return this.currentMode;
    }

    /**
     * Get current mode configuration
     */
    getCurrentModeConfig() {
        return this.modes[this.currentMode] || null;
    }

    /**
     * Get a specific mode's configuration
     */
    getModeConfig(modeKey) {
        return this.modes[modeKey] || null;
    }

    /**
     * Check if a specific mode is active
     */
    isMode(modeKey) {
        return this.currentMode === modeKey;
    }

    /**
     * Register a callback for mode changes
     */
    onModeChange(callback) {
        if (typeof callback === 'function') {
            this.modeChangeCallbacks.push(callback);
        }
    }

    /**
     * Remove a mode change callback
     */
    offModeChange(callback) {
        this.modeChangeCallbacks = this.modeChangeCallbacks.filter(cb => cb !== callback);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  MODAL CONTROL
    // ═══════════════════════════════════════════════════════════════════

    openModal() {
        this.modeModal.classList.add('active');
        const input = this.modeModal.querySelector('#sm-mode-search-input');
        if (input) setTimeout(() => input.focus(), 100);
    }

    closeModal() {
        this.modeModal.classList.remove('active');
    }

    toggleModal() {
        if (this.modeModal.classList.contains('active')) {
            this.closeModal();
        } else {
            this.openModal();
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  SETTINGS APPLICATION
    // ═══════════════════════════════════════════════════════════════════

    _applyViewportSettings(mode) {
        const vp = mode.viewport;
        const camera = window.camera;
        const scene = window.scene;
        const renderer = window.renderer;

        if (!camera || !scene) {
            setTimeout(() => this._applyViewportSettings(mode), 300);
            return;
        }

        // Camera mode
        if (vp.cameraMode === 'orthographic') {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const scale = vp.orthographicScale || 25;

            const orthoCam = new THREE.OrthographicCamera(
                -w / h * scale, w / h * scale,
                scale, -scale,
                vp.near || 0.1, vp.far || 1000
            );
            orthoCam.position.set(vp.cameraPosition.x, vp.cameraPosition.y, vp.cameraPosition.z);
            orthoCam.lookAt(vp.cameraLookAt.x, vp.cameraLookAt.y, vp.cameraLookAt.z);
            window.camera = orthoCam;
        } else {
            camera.fov = vp.fov;
            camera.near = vp.near || 0.1;
            camera.far = vp.far || 10000;
            camera.position.set(vp.cameraPosition.x, vp.cameraPosition.y, vp.cameraPosition.z);
            camera.lookAt(vp.cameraLookAt.x, vp.cameraLookAt.y, vp.cameraLookAt.z);
            camera.updateProjectionMatrix();
        }

        // Grid
        const grid = scene.getObjectByName('advancedGrid') || scene.getObjectByName('grid');
        if (grid) {
            grid.visible = vp.gridVisible;
        }

        // Background
        if (vp.backgroundColor) {
            scene.background = new THREE.Color(vp.backgroundColor);
        }

        // Update renderer
        if (renderer) {
            renderer.setClearColor(new THREE.Color(vp.backgroundColor || '#1a1a2e'));
        }

        // Dispatch viewport change
        window.dispatchEvent(new CustomEvent('viewportSettingsChanged', { detail: vp }));
    }

    _applyRenderingSettings(mode) {
        const rs = mode.rendering;
        const renderer = window.renderer;

        if (!renderer) return;

        // Shadows
        if (renderer.shadowMap) {
            renderer.shadowMap.enabled = rs.shadows;
            if (rs.shadowMapSize) {
                renderer.shadowMap.mapSize.width = rs.shadowMapSize;
                renderer.shadowMap.mapSize.height = rs.shadowMapSize;
            }
        }

        // Tone mapping
        if (renderer.toneMapping !== undefined) {
            const toneMapMap = {
                'ACESFilmic': THREE.ACESFilmicToneMapping,
                'Neutral': THREE.NeutralToneMapping,
                'Reinhard': THREE.ReinhardToneMapping,
                'Linear': THREE.LinearToneMapping,
            };
            renderer.toneMapping = toneMapMap[rs.toneMapping] || THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = rs.exposure || 1.0;
        }

        // Anti-aliasing
        if (renderer.capabilities && renderer.capabilities.isWebGL2) {
            // MSAA can be set if renderer supports it
        }

        window.dispatchEvent(new CustomEvent('renderingSettingsChanged', { detail: rs }));
    }

    _applyLightingSettings(mode) {
        const ls = mode.lighting;
        const scene = window.scene;

        if (!scene) return;

        // Dispatch for external lighting systems to handle
        window.dispatchEvent(new CustomEvent('lightingSettingsChanged', {
            detail: { preset: ls.preset, config: ls }
        }));

        // Toggle scene lights based on preset
        scene.traverse(obj => {
            if (!obj.isLight) return;
            const name = (obj.name || '').toLowerCase();

            if (ls.preset === 'simple') {
                // Only ambient for 2D
                obj.visible = name.includes('ambient');
            } else if (ls.preset === 'studio') {
                // Studio lighting for modeling/animation
                obj.visible = name.includes('ambient') || name.includes('directional') || name.includes('studio');
            } else if (ls.preset === 'outdoor') {
                // Outdoor for terrain
                obj.visible = name.includes('ambient') || name.includes('sun') || name.includes('directional');
            } else {
                // Game/cinematic - all lights
                obj.visible = true;
            }
        });
    }

    _applyPhysicsSettings(mode) {
        const ps = mode.physics;

        if (typeof window.updatePhysicsMode === 'function') {
            window.updatePhysicsMode(ps.engine, ps.gravity);
        }

        window.dispatchEvent(new CustomEvent('physicsSettingsChanged', { detail: ps }));
    }

    _applyPanelVisibility(mode) {
        const panels = mode.panels;

        const panelMap = {
            showHierarchy: 'hierarchy-panel',
            showInspector: 'inspector-panel',
            showAssets: 'assetsPanel',
            showTimeline: 'timeline-panel',
            showModelingTools: 'modelingTools',
            showTerrainTools: 'terrainTools',
            showAnimationTools: 'animationTools',
            showCinematicTools: 'cinematicTools',
        };

        Object.entries(panelMap).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (!el) return;
            const shouldShow = panels[key];
            if (shouldShow === undefined) return;

            if (shouldShow) {
                el.classList.remove('mode-hidden');
                el.style.display = '';
            } else {
                el.classList.add('mode-hidden');
                el.style.display = 'none';
            }
        });

        // Always show toolbar
        const toolbar = document.getElementById('toolBar');
        if (toolbar) toolbar.style.display = '';
    }

    _applyGizmoSettings(mode) {
        const gs = mode.gizmo;

        window.dispatchEvent(new CustomEvent('gizmoSettingsChanged', {
            detail: {
                transform: gs.transform,
                space: gs.space,
                snapEnabled: gs.snapEnabled,
                snapSize: gs.snapSize,
            }
        }));

        // Update transform controls if available
        if (window.transformControls) {
            const modeMap = {
                'translate': 'translate',
                'rotate': 'rotate',
                'scale': 'scale',
            };
            if (modeMap[gs.transform]) {
                window.transformControls.setMode(modeMap[gs.transform]);
            }
            if (window.transformControls.setSpace) {
                window.transformControls.setSpace(gs.space);
            }
            if (window.transformControls.setTranslationSnap) {
                window.transformControls.setTranslationSnap(gs.snapEnabled ? gs.snapSize : null);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  UI UPDATES
    // ═══════════════════════════════════════════════════════════════════

    _updateModeIndicator(modeKey) {
        const mode = this.modes[modeKey];
        const modeClass = modeKey.replace('MODE_', 'mode-').toLowerCase();

        this.modeBtn.className = `sm-mode-indicator ${modeClass}`;
        this.modeBtn.innerHTML = `
            <i class="fas ${mode.icon}"></i>
            <span class="sm-mode-label">${mode.name}</span>
            <span class="sm-mode-dot"></span>
            <i class="fas fa-chevron-down sm-mode-arrow"></i>
        `;
        this.modeBtn.title = `${mode.fullName} — ${mode.shortcut}`;
    }

    _updateModeToolbar(mode) {
        const toolbar = this.modeToolbar;
        if (!toolbar) return;

        // Build mode-specific toolbar content
        let html = '';

        switch (mode.id) {
            case 'MODE_GAME':
                html = `
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Play</span>
                        <button class="sm-tool-btn" onclick="window.togglePlayMode()" title="Play in Editor (F8)">
                            <i class="fas fa-play"></i> Play
                        </button>
                        <button class="sm-tool-btn" title="Simulate">
                            <i class="fas fa-sync-alt"></i> Simulate
                        </button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">View</span>
                        <button class="sm-tool-btn active" title="Perspective"><i class="fas fa-cube"></i> 3D</button>
                        <button class="sm-tool-btn" title="Top"><i class="fas fa-arrow-down"></i> Top</button>
                        <button class="sm-tool-btn" title="Front"><i class="fas fa-arrow-right"></i> Front</button>
                        <button class="sm-tool-btn" title="Side"><i class="fas fa-arrow-left"></i> Side</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Stats</span>
                        <button class="sm-tool-btn" onclick="window.toggleStats()"><i class="fas fa-chart-bar"></i> FPS</button>
                    </div>
                `;
                break;

            case 'MODE_CINEMATIC':
                html = `
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Camera</span>
                        <button class="sm-tool-btn active" title="Free Camera"><i class="fas fa-video"></i> Free</button>
                        <button class="sm-tool-btn" title="Rail Camera"><i class="fas fa-train"></i> Rail</button>
                        <button class="sm-tool-btn" title="Orbit Camera"><i class="fas fa-globe"></i> Orbit</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Take</span>
                        <button class="sm-tool-btn" title="Record"><i class="fas fa-circle" style="color:#ef4444"></i> Record</button>
                        <button class="sm-tool-btn" title="Add Keyframe"><i class="fas fa-key"></i> Key</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Render</span>
                        <button class="sm-tool-btn" title="Render Preview"><i class="fas fa-eye"></i> Preview</button>
                        <button class="sm-tool-btn" title="Export Sequence"><i class="fas fa-file-export"></i> Export</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Aperture</span>
                        <button class="sm-tool-btn">f/2.8</button>
                        <button class="sm-tool-btn">f/5.6</button>
                        <button class="sm-tool-btn">f/11</button>
                    </div>
                `;
                break;

            case 'MODE_TERRAIN':
                html = `
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Sculpt</span>
                        <button class="sm-tool-btn active" title="Raise/Lower"><i class="fas fa-arrow-up"></i> Raise</button>
                        <button class="sm-tool-btn" title="Smooth"><i class="fas fa-water"></i> Smooth</button>
                        <button class="sm-tool-btn" title="Flatten"><i class="fas fa-align-center"></i> Flatten</button>
                        <button class="sm-tool-btn" title="Erode"><i class="fas fa-tint"></i> Erode</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Brush</span>
                        <button class="sm-tool-btn" title="Brush Size"><i class="fas fa-circle"></i> Size</button>
                        <button class="sm-tool-btn" title="Brush Strength"><i class="fas fa-tachometer-alt"></i> Strength</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Paint</span>
                        <button class="sm-tool-btn" title="Paint Layer"><i class="fas fa-paint-bucket"></i> Layer</button>
                        <button class="sm-tool-btn" title="Sample Height"><i class="fas fa-eyedropper"></i> Sample</button>
                    </div>
                    <div class="sm-tool-group">
                        <button class="sm-tool-btn" title="Generate Terrain"><i class="fas fa-magic"></i> Generate</button>
                        <button class="sm-tool-btn" title="Import Heightmap"><i class="fas fa-file-import"></i> Import</button>
                    </div>
                `;
                break;

            case 'MODE_MODELING':
                html = `
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Transform</span>
                        <button class="sm-tool-btn active" title="Translate (W)"><i class="fas fa-arrows-alt"></i></button>
                        <button class="sm-tool-btn" title="Rotate (E)"><i class="fas fa-redo-alt"></i></button>
                        <button class="sm-tool-btn" title="Scale (R)"><i class="fas fa-expand-arrows-alt"></i></button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Snap</span>
                        <button class="sm-tool-btn" onclick="window.toggleSnap()"><i class="fas fa-magnet"></i> Snap</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Mesh</span>
                        <button class="sm-tool-btn" title="Extrude"><i class="fas fa-cube"></i> Extrude</button>
                        <button class="sm-tool-btn" title="Bevel"><i class="fas fa-border-all"></i> Bevel</button>
                        <button class="sm-tool-btn" title="Loop Cut"><i class="fas fa-cut"></i> Loop Cut</button>
                        <button class="sm-tool-btn" title="Merge"><i class="fas fa-compress-arrows-alt"></i> Merge</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Select</span>
                        <button class="sm-tool-btn active" title="Object Mode"><i class="fas fa-cube"></i> Object</button>
                        <button class="sm-tool-btn" title="Vertex Select"><i class="fas fa-vector-square"></i> Vertex</button>
                        <button class="sm-tool-btn" title="Edge Select"><i class="fas fa-minus"></i> Edge</button>
                        <button class="sm-tool-btn" title="Face Select"><i class="fas fa-square"></i> Face</button>
                    </div>
                `;
                break;

            case 'MODE_ANIMATION':
                html = `
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Playback</span>
                        <button class="sm-tool-btn" title="Go to Start"><i class="fas fa-fast-backward"></i></button>
                        <button class="sm-tool-btn" title="Play/Pause"><i class="fas fa-play"></i></button>
                        <button class="sm-tool-btn" title="Go to End"><i class="fas fa-fast-forward"></i></button>
                        <button class="sm-tool-btn" title="Loop"><i class="fas fa-sync-alt active"></i></button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Key</span>
                        <button class="sm-tool-btn" title="Add Keyframe"><i class="fas fa-key"></i> Key</button>
                        <button class="sm-tool-btn" title="Auto Key"><i class="fas fa-record-vinyl" style="color:#ef4444"></i> Auto</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Rig</span>
                        <button class="sm-tool-btn active" title="Show Rig"><i class="fas fa-skeleton"></i> Rig</button>
                        <button class="sm-tool-btn" title="Show Bones"><i class="fas fa-bone"></i> Bones</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Ghost</span>
                        <button class="sm-tool-btn" title="Toggle Ghosting"><i class="fas fa-ghost"></i> Ghost</button>
                    </div>
                `;
                break;

            case 'MODE_2D':
                html = `
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">View</span>
                        <button class="sm-tool-btn active"><i class="fas fa-th-large"></i> Grid</button>
                        <button class="sm-tool-btn"><i class="fas fa-arrows-alt"></i> Pan</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Snap</span>
                        <button class="sm-tool-btn active"><i class="fas fa-magnet"></i> Grid Snap</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Sprite</span>
                        <button class="sm-tool-btn"><i class="fas fa-image"></i> Import</button>
                        <button class="sm-tool-btn"><i class="fas fa-layer-group"></i> Order</button>
                    </div>
                `;
                break;

            case 'MODE_2_5D':
                html = `
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">View</span>
                        <button class="sm-tool-btn active"><i class="fas fa-cube"></i> Isometric</button>
                        <button class="sm-tool-btn"><i class="fas fa-arrows-alt"></i> Free</button>
                    </div>
                    <div class="sm-tool-group">
                        <span class="sm-tool-label">Snap</span>
                        <button class="sm-tool-btn active"><i class="fas fa-magnet"></i> Snap</button>
                    </div>
                `;
                break;
        }

        toolbar.innerHTML = html;
        toolbar.classList.add('visible');
    }

    _updateViewportOverlay(mode) {
        // Remove existing overlay
        const existing = document.querySelector('.sm-viewport-badge');
        if (existing) existing.remove();

        // Remove safe frames
        const safeFrames = document.querySelector('.sm-safe-frames');
        if (safeFrames) safeFrames.remove();

        // Remove terrain cursor
        const terrainCursor = document.querySelector('.sm-terrain-cursor');
        if (terrainCursor) terrainCursor.remove();

        // Create viewport badge
        const container = document.getElementById('renderer-container') || document.querySelector('.renderer-container');
        if (!container) return;

        const badge = document.createElement('div');
        badge.className = 'sm-viewport-badge';
        badge.innerHTML = `
            <span class="sm-badge-dot" style="background:${mode.tagColor}"></span>
            <i class="fas ${mode.icon}" style="color:${mode.tagColor}"></i>
            <span>${mode.fullName}</span>
            <span style="color:#555;font-size:9px;margin-left:4px">${mode.shortcut}</span>
        `;
        container.appendChild(badge);

        // Safe frames for cinematic mode
        if (mode.id === 'MODE_CINEMATIC' && mode.viewport.safeFrames) {
            const frames = document.createElement('div');
            frames.className = 'sm-safe-frames';
            frames.innerHTML = `
                <div class="sm-safe-inner"></div>
                <div class="sm-safe-action"></div>
                <div class="sm-safe-center"></div>
            `;
            container.appendChild(frames);
        }

        // Terrain brush cursor
        if (mode.id === 'MODE_TERRAIN') {
            const cursor = document.createElement('div');
            cursor.className = 'sm-terrain-cursor';
            cursor.id = 'sm-terrain-cursor';
            cursor.style.width = '40px';
            cursor.style.height = '40px';
            container.appendChild(cursor);

            container.addEventListener('mousemove', e => {
                cursor.style.display = 'block';
                cursor.style.left = e.clientX + 'px';
                cursor.style.top = e.clientY + 'px';
            });
            container.addEventListener('mouseleave', () => {
                cursor.style.display = 'none';
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TOAST NOTIFICATION
    // ═══════════════════════════════════════════════════════════════════

    _showToast(message, color = '#10b981') {
        let toast = document.getElementById('sm-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'sm-toast';
            toast.className = 'sm-toast';
            document.body.appendChild(toast);
        }

        toast.innerHTML = `<i class="fas fa-check-circle" style="color:${color}"></i> ${message}`;
        toast.classList.add('show');

        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  AUTO-INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

function initGameModeManager() {
    if (window.gameModeManager) return;

    window.gameModeManager = new GameModeManager();

    // Restore saved mode
    const saved = localStorage.getItem('sm_editor_mode');
    if (saved && window.gameModeManager.modes[saved]) {
        window.gameModeManager.setMode(saved);
    } else {
        // Default to Game mode
        window.gameModeManager.setMode('MODE_GAME');
    }

    console.log('[SM Engine] GameModeManager initialized with professional editor modes');
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGameModeManager);
} else {
    initGameModeManager();
}