// ============================================================================
// MATERIAL NODE EDITOR  v4.1 PROFESSIONAL — RGB/PBR SHADER FIX
// fixes RGB/Value PBR links, stage-safe GLSL, gray adaptive grid, minimap, studio preview
// ============================================================================

class MaterialNodeEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = null;
        this.ctx = null;

        this.nodes = [];
        this.connections = [];
        this.groups = [];
        this.nodeIdCounter = 0;
        this.groupIdCounter = 0;

        this.panX = 0;
        this.panY = 0;
        this.zoom = 1.0;

        // Professional graph viewport settings
        this.gridSize = 40;
        this.showGrid = true;
        this.snapToGrid = false;
        this.gridSubdivisions = 5;
        this.minZoom = 0.15;
        this.maxZoom = 3.5;
        this.previewShape = 'sphere';
        this.previewAutoRotate = true;
        this.showMinimap = true;

        this.draggedNode = null;
        this.activeLink = null;
        this.isPanning = false;
        this.lastMouse = { x: 0, y: 0 };
        this.selectedNode = null;
        this.selectedNodes = [];
        this.selectedGroup = null;
        this.hoveredSocket = null;
        this.selectionRect = null;
        this.isSelecting = false;
        this.draggedGroup = null;
        this.activeInlineControl = null;
        this.contextMenuTarget = null;
        this.isResizingPanel = false;

        this.lastAppliedMaterial = null;
        this.autoCompile = true;
        this.compileDebounceTimer = null;

        if (!window.animatedMaterials) window.animatedMaterials = [];
        if (window.engineFrameCallbacks && !window.__matEditorAnimHook) {
            window.__matEditorAnimHook = () => window.materialNodeEditor?.updateAnimatedUniforms?.();
            window.engineFrameCallbacks.push(window.__matEditorAnimHook);
        }

        // Material Editor logging is routed to the SM Global Console.
        // No local Material Editor debug panel/log buffer is kept.
        this.debugMode = true;
        this.consoleSource = 'MaterialEditor';

        // ── Type compatibility map ───────────────────────────────────────────────────────
        // Each key = input socket type; value = accepted output socket types
        this.socketTypeMap = {
            // color inputs accept color, vec3, AND float (float → grayscale, like Blender)
            'color':   ['color', 'vector3', 'vec3', 'float'],
            // float inputs accept float or color (luminance)
            'float':   ['float', 'color', 'vector3', 'vec3'],
            'vector2': ['vector2', 'vec2'],
            'vec2':    ['vector2', 'vec2'],
            'vector3': ['vector3', 'vec3', 'color', 'float'],
            'vec3':    ['vector3', 'vec3', 'color', 'float'],
            'texture': ['texture', 'color', 'vector3'],
        };

        this.spacePressed = false;
        this.contextMenuEl = null;
        this.previewRenderer = null;
        this.previewScene = null;
        this.previewCamera = null;
        this.previewMesh = null;
        this.previewOrbit = 0;
        this.panelWidths = { library: 270, properties: 320 };
        this._statusCache = '';

        // ── Per-node texture cache (uniform name → THREE.Texture) ───────────
        this._texCache = {};

        this.nodeSchemas = this._buildSchemas();
        this.init();
    }

    // =========================================================================
    // SCHEMA DEFINITIONS
    // =========================================================================
    _buildSchemas() {
        const s = {};

        // ── OUTPUT ────────────────────────────────────────────────────────────
        s['PBR_Surface'] = {
            displayName: 'Principled BSDF', category: 'Surface', color: '#27ae60',
            inputs: [
                { name: 'BaseColor', type: 'color', default: '#ffffff', group: 'Base' },
                { name: 'Metallic', type: 'float', default: 0, min: 0, max: 1, step: 0.01, group: 'Base' },
                { name: 'Roughness', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01, group: 'Base' },
                { name: 'Opacity', type: 'float', default: 1, min: 0, max: 1, step: 0.01, group: 'Base' },
                { name: 'Emission', type: 'color', default: '#000000', group: 'Emission' },
                { name: 'EmissionStrength', type: 'float', default: 0, min: 0, max: 10, step: 0.1, group: 'Emission' },
                { name: 'Transmission', type: 'float', default: 0, min: 0, max: 1, step: 0.01, group: 'Transmission' },
                { name: 'IOR', type: 'float', default: 1.5, min: 1, max: 2.5, step: 0.01, group: 'Transmission' },
                { name: 'Clearcoat', type: 'float', default: 0, min: 0, max: 1, step: 0.01, group: 'Clearcoat' },
                { name: 'ClearcoatRoughness', type: 'float', default: 0, min: 0, max: 1, step: 0.01, group: 'Clearcoat' },
                { name: 'Sheen', type: 'float', default: 0, min: 0, max: 1, step: 0.01, group: 'Sheen' },
                { name: 'SheenColor', type: 'color', default: '#ffffff', group: 'Sheen' },
                { name: 'Normal', type: 'vector3', default: null, group: 'Geometry' },
                { name: 'Displacement', type: 'vector3', default: null, group: 'Geometry' },
            ],
            outputs: [{ name: 'BSDF', type: 'color', index: 0 }],
            compile: (inputs) => {
                const finite = (value, fallback) => {
                    const number = Number(value);
                    return Number.isFinite(number) ? number : fallback;
                };
                const clamp01 = (value, fallback) =>
                    Math.max(0, Math.min(1, finite(value, fallback)));

                const opacity = clamp01(inputs.Opacity, 1);
                const transmission = clamp01(inputs.Transmission, 0);

                return {
                    type: 'MeshPhysicalMaterial',
                    props: {
                        color: (() => {
                            const bc = inputs.BaseColor;
                            if (typeof bc === 'number') {
                                return new THREE.Color(bc, bc, bc);
                            }
                            if (bc instanceof THREE.Color) return bc.clone();
                            try { return new THREE.Color(bc ?? '#ffffff'); }
                            catch (_) { return new THREE.Color('#ffffff'); }
                        })(),
                        metalness: clamp01(inputs.Metallic, 0),
                        roughness: clamp01(inputs.Roughness, 0.5),
                        opacity,
                        transparent: opacity < 0.999 || transmission > 0.0001,
                        emissive: (() => {
                            try { return new THREE.Color(inputs.Emission ?? '#000000'); }
                            catch (_) { return new THREE.Color('#000000'); }
                        })(),
                        emissiveIntensity: Math.max(0, finite(inputs.EmissionStrength, 0)),
                        transmission,
                        ior: Math.max(1, finite(inputs.IOR, 1.5)),
                        clearcoat: clamp01(inputs.Clearcoat, 0),
                        clearcoatRoughness: clamp01(inputs.ClearcoatRoughness, 0),
                        sheen: clamp01(inputs.Sheen, 0),
                        sheenColor: (() => {
                            try { return new THREE.Color(inputs.SheenColor ?? '#ffffff'); }
                            catch (_) { return new THREE.Color('#ffffff'); }
                        })(),
                    }
                };
            }
        };

        s['Material_Output'] = {
            displayName: 'Material Output', category: 'Surface', color: '#6c2d38',
            inputs: [
                { name: 'Surface', type: 'color', default: null, group: 'Output' },
                { name: 'Volume', type: 'color', default: null, group: 'Output' },
                { name: 'Displacement', type: 'vector3', default: null, group: 'Output' },
                { name: 'Thickness', type: 'float', default: 0, min: 0, max: 10, step: 0.01, group: 'Output' },
            ],
            outputs: [],
            isOutput: true
        };

        // ── COLOR ─────────────────────────────────────────────────────────────
        s['RGB_Color'] = {
            displayName: 'RGB Color', category: 'Color', color: '#2980b9',
            inputs: [], outputs: [{ name: 'RGB', type: 'color', index: 0 }],
            defaultValue: '#ffffff', widget: 'color',
            compile: (inputs, n) => n.value || '#ffffff',
            glsl: true
        };

        s['ColorRamp'] = {
            displayName: 'Color Ramp', category: 'Color', color: '#2980b9',
            inputs: [{ name: 'Fac', type: 'float', default: 0, min: 0, max: 1, step: 0.01 }],
            outputs: [{ name: 'Color', type: 'color', index: 0 }, { name: 'Alpha', type: 'float', index: 1 }],
            defaultValue: ['#000000', '#ffffff'], widget: 'color_ramp',
            glsl: true
        };

        // ── VALUE / FLOAT ─────────────────────────────────────────────────────
        s['Float_Val'] = {
            displayName: 'Value', category: 'Value', color: '#e74c3c',
            inputs: [], outputs: [{ name: 'Value', type: 'float', index: 0 }],
            defaultValue: 0.5, widget: 'slider', min: 0, max: 1, step: 0.01,
            compile: (inputs, n) => Math.max(0, Math.min(1, parseFloat(n.value ?? 0.5))),
            glsl: true
        };

        s['Invert'] = {
            displayName: 'Invert', category: 'Value', color: '#34495e',
            inputs: [{ name: 'Value', type: 'float', default: 0.5, min: 0, max: 1 }],
            outputs: [{ name: 'Inverted', type: 'float', index: 0 }],
            compile: (inputs) => 1 - (inputs.Value || 0.5),
            glsl: true
        };

        s['Remap'] = {
            displayName: 'Remap', category: 'Value', color: '#34495e',
            inputs: [
                { name: 'Value', type: 'float', default: 0.5 },
                { name: 'OldMin', type: 'float', default: 0 },
                { name: 'OldMax', type: 'float', default: 1 },
                { name: 'NewMin', type: 'float', default: 0 },
                { name: 'NewMax', type: 'float', default: 1 }
            ],
            outputs: [{ name: 'Result', type: 'float', index: 0 }],
            glsl: true
        };

        s['Clamp'] = {
            displayName: 'Clamp', category: 'Value', color: '#e74c3c',
            inputs: [
                { name: 'Value', type: 'float', default: 0.5 },
                { name: 'Min', type: 'float', default: 0 },
                { name: 'Max', type: 'float', default: 1 }
            ],
            outputs: [{ name: 'Result', type: 'float', index: 0 }],
            glsl: true
        };

        // ── MATH ──────────────────────────────────────────────────────────────
        s['Math_Add'] = { displayName: 'Add', category: 'Math', color: '#f39c12', inputs: [{ name: 'A', type: 'float', default: 0 }, { name: 'B', type: 'float', default: 0 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Subtract'] = { displayName: 'Subtract', category: 'Math', color: '#f39c12', inputs: [{ name: 'A', type: 'float', default: 0 }, { name: 'B', type: 'float', default: 0 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Multiply'] = { displayName: 'Multiply', category: 'Math', color: '#f39c12', inputs: [{ name: 'A', type: 'float', default: 1 }, { name: 'B', type: 'float', default: 1 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Divide'] = { displayName: 'Divide', category: 'Math', color: '#f39c12', inputs: [{ name: 'A', type: 'float', default: 1 }, { name: 'B', type: 'float', default: 1 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Power'] = { displayName: 'Power', category: 'Math', color: '#2980b9', inputs: [{ name: 'Base', type: 'float', default: 0.5 }, { name: 'Exp', type: 'float', default: 2 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Sin'] = { displayName: 'Sine', category: 'Math', color: '#2980b9', inputs: [{ name: 'Value', type: 'float', default: 0 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Cos'] = { displayName: 'Cosine', category: 'Math', color: '#2980b9', inputs: [{ name: 'Value', type: 'float', default: 0 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Abs'] = { displayName: 'Absolute', category: 'Math', color: '#2980b9', inputs: [{ name: 'Value', type: 'float', default: 0 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Sqrt'] = { displayName: 'Sqrt', category: 'Math', color: '#2980b9', inputs: [{ name: 'Value', type: 'float', default: 0.5 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Floor'] = { displayName: 'Floor', category: 'Math', color: '#2980b9', inputs: [{ name: 'Value', type: 'float', default: 0 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };
        s['Math_Fract'] = { displayName: 'Fraction', category: 'Math', color: '#2980b9', inputs: [{ name: 'Value', type: 'float', default: 0 }], outputs: [{ name: 'Result', type: 'float', index: 0 }], glsl: true };

        s['Mix'] = {
            displayName: 'Mix (Lerp)', category: 'Math', color: '#34495e',
            inputs: [
                { name: 'A', type: 'vector3', default: '#000000' },
                { name: 'B', type: 'vector3', default: '#ffffff' },
                { name: 'Alpha', type: 'float', default: 0.5, min: 0, max: 1 }
            ],
            outputs: [{ name: 'Result', type: 'vector3', index: 0 }],
            glsl: true
        };

        s['MixFloat'] = {
            displayName: 'Mix Float', category: 'Math', color: '#34495e',
            inputs: [
                { name: 'A', type: 'float', default: 0 },
                { name: 'B', type: 'float', default: 1 },
                { name: 'Alpha', type: 'float', default: 0.5, min: 0, max: 1 }
            ],
            outputs: [{ name: 'Result', type: 'float', index: 0 }],
            glsl: true
        };

        // ── UV / INPUT ────────────────────────────────────────────────────────
        s['UV_Map'] = {
            displayName: 'UV Map', category: 'Input', color: '#f39c12',
            inputs: [], outputs: [{ name: 'UV', type: 'vector2', index: 0 }], glsl: true
        };

        s['Time_Input'] = {
            displayName: 'Time', category: 'Input', color: '#e74c3c',
            inputs: [{ name: 'Speed', type: 'float', default: 1.0 }],
            outputs: [{ name: 'Time', type: 'float', index: 0 }], glsl: true
        };

        s['Panner'] = {
            displayName: 'Panner', category: 'Texture', color: '#8e44ad',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Time', type: 'float', default: 0 },
                { name: 'SpeedX', type: 'float', default: 0.1 },
                { name: 'SpeedY', type: 'float', default: 0.0 }
            ],
            outputs: [{ name: 'UV', type: 'vector2', index: 0 }], glsl: true
        };

        s['TilingAndOffset'] = {
            displayName: 'Tiling & Offset', category: 'Texture', color: '#e67e22',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'TileX', type: 'float', default: 1, min: 0.1, max: 20 },
                { name: 'TileY', type: 'float', default: 1, min: 0.1, max: 20 },
                { name: 'OffsetX', type: 'float', default: 0, min: -5, max: 5 },
                { name: 'OffsetY', type: 'float', default: 0, min: -5, max: 5 }
            ],
            outputs: [{ name: 'UV', type: 'vector2', index: 0 }], glsl: true
        };

        s['RotateUV'] = {
            displayName: 'Rotate UV', category: 'Texture', color: '#2ecc71',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Angle', type: 'float', default: 0, min: -180, max: 180 }
            ],
            outputs: [{ name: 'UV', type: 'vector2', index: 0 }], glsl: true
        };

        s['Vector2_Dir'] = {
            displayName: 'Direction Vector', category: 'Input', color: '#c0392b',
            inputs: [
                { name: 'X', type: 'float', default: 1.0, min: -1, max: 1, step: 0.01 },
                { name: 'Y', type: 'float', default: 0.0, min: -1, max: 1, step: 0.01 }
            ],
            outputs: [{ name: 'Vector', type: 'vector2', index: 0 }], glsl: true
        };

        // ── TEXTURE MAPS ──────────────────────────────────────────────────────
        const texCats = [
            ['Texture_Albedo', 'Albedo / Diffuse', '#e67e22', 'color', 'srgb'],
            ['Texture_Normal', 'Normal Map', '#3498db', 'vector3', 'linear'],
            ['Texture_Roughness', 'Roughness Map', '#95a5a6', 'float', 'linear'],
            ['Texture_Metalness', 'Metalness Map', '#7f8c8d', 'float', 'linear'],
            ['Texture_AO', 'Ambient Occlusion', '#34495e', 'float', 'linear'],
            ['Texture_Displacement', 'Displacement / Height', '#16a085', 'float', 'linear'],
            ['Texture_Emissive', 'Emissive Map', '#f39c12', 'color', 'srgb'],
            ['Texture_Alpha', 'Alpha / Opacity', '#9b59b6', 'float', 'linear'],
        ];
        texCats.forEach(([id, name, color, outType, enc]) => {
            s[id] = {
                displayName: name, category: 'Texture', color,
                inputs: [
                    { name: 'UV', type: 'vector2', default: null },
                    { name: 'Intensity', type: 'float', default: 1, min: 0, max: 2, step: 0.01 }
                ],
                outputs: [{ name: outType === 'float' ? 'Value' : 'Color', type: outType, index: 0 }],
                defaultValue: null, widget: 'texture_upload',
                _encoding: enc,
                glsl: true
            };
        });

        // ── NOISE / PROCEDURAL ────────────────────────────────────────────────
        s['Noise_Value'] = {
            displayName: 'Value Noise', category: 'Procedural', color: '#16a085',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Scale', type: 'float', default: 5, min: 0.1, max: 50 },
                { name: 'Detail', type: 'float', default: 3, min: 1, max: 8 },
                { name: 'Rough', type: 'float', default: 0.5, min: 0, max: 1 }
            ],
            outputs: [{ name: 'Value', type: 'float', index: 0 }],
            glsl: true
        };

        s['Noise_Voronoi'] = {
            displayName: 'Voronoi', category: 'Procedural', color: '#8e44ad',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Scale', type: 'float', default: 5, min: 1, max: 30 },
                { name: 'Randomness', type: 'float', default: 1, min: 0, max: 1 }
            ],
            outputs: [
                { name: 'Distance', type: 'float', index: 0 },
                { name: 'Color', type: 'vector3', index: 1 }
            ],
            glsl: true
        };

        s['Noise_Musgrave'] = {
            displayName: 'Musgrave (fBm)', category: 'Procedural', color: '#16a085',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Scale', type: 'float', default: 3, min: 0.1, max: 20 },
                { name: 'Octaves', type: 'float', default: 5, min: 1, max: 8 },
                { name: 'Lacun', type: 'float', default: 2, min: 1, max: 4 },
                { name: 'Gain', type: 'float', default: 0.5, min: 0, max: 1 }
            ],
            outputs: [{ name: 'Value', type: 'float', index: 0 }],
            glsl: true
        };

        s['Proc_Brick'] = {
            displayName: 'Brick Pattern', category: 'Patterns', color: '#c0392b',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'BrickWidth', type: 'float', default: 0.4, min: 0.05, max: 1 },
                { name: 'BrickHeight', type: 'float', default: 0.2, min: 0.05, max: 1 },
                { name: 'Mortar', type: 'float', default: 0.02, min: 0, max: 0.15 },
                { name: 'BrickColor', type: 'color', default: '#8b4513' },
                { name: 'MortarColor', type: 'color', default: '#cccccc' },
                { name: 'Variation', type: 'float', default: 0.15, min: 0, max: 0.5 }
            ],
            outputs: [
                { name: 'Color', type: 'color', index: 0 },
                { name: 'Factor', type: 'float', index: 1 }
            ],
            glsl: true
        };

        s['Proc_Wood'] = {
            displayName: 'Wood Grain', category: 'Patterns', color: '#795548',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Scale', type: 'float', default: 8, min: 1, max: 50 },
                { name: 'Rings', type: 'float', default: 6, min: 1, max: 30 },
                { name: 'Warp', type: 'float', default: 0.4, min: 0, max: 2 },
                { name: 'ColorA', type: 'color', default: '#5c3317' },
                { name: 'ColorB', type: 'color', default: '#c68642' }
            ],
            outputs: [{ name: 'Color', type: 'color', index: 0 }, { name: 'Factor', type: 'float', index: 1 }],
            glsl: true
        };

        s['Proc_Marble'] = {
            displayName: 'Marble', category: 'Patterns', color: '#bdc3c7',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Scale', type: 'float', default: 4, min: 1, max: 20 },
                { name: 'Turbulence', type: 'float', default: 2, min: 0, max: 5 },
                { name: 'ColorA', type: 'color', default: '#ffffff' },
                { name: 'ColorB', type: 'color', default: '#222222' }
            ],
            outputs: [{ name: 'Color', type: 'color', index: 0 }, { name: 'Factor', type: 'float', index: 1 }],
            glsl: true
        };

        s['Proc_Checker'] = {
            displayName: 'Checker', category: 'Patterns', color: '#2c3e50',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Scale', type: 'float', default: 4, min: 1, max: 30 },
                { name: 'ColorA', type: 'color', default: '#000000' },
                { name: 'ColorB', type: 'color', default: '#ffffff' }
            ],
            outputs: [{ name: 'Color', type: 'color', index: 0 }, { name: 'Factor', type: 'float', index: 1 }],
            glsl: true
        };

        s['Proc_Gradient'] = {
            displayName: 'Gradient', category: 'Patterns', color: '#2980b9',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Type', type: 'float', default: 0, min: 0, max: 3, step: 1 }, // 0=linear 1=radial 2=angle 3=diagonal
                { name: 'ColorA', type: 'color', default: '#000000' },
                { name: 'ColorB', type: 'color', default: '#ffffff' }
            ],
            outputs: [{ name: 'Color', type: 'color', index: 0 }, { name: 'Factor', type: 'float', index: 1 }],
            glsl: true
        };

        s['Proc_Waves'] = {
            displayName: 'Wave Texture', category: 'Patterns', color: '#3498db',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Scale', type: 'float', default: 5, min: 1, max: 50 },
                { name: 'Distortion', type: 'float', default: 0, min: 0, max: 5 },
                { name: 'Detail', type: 'float', default: 2, min: 0, max: 8 },
                { name: 'ColorA', type: 'color', default: '#000000' },
                { name: 'ColorB', type: 'color', default: '#ffffff' }
            ],
            outputs: [{ name: 'Color', type: 'color', index: 0 }, { name: 'Factor', type: 'float', index: 1 }],
            glsl: true
        };

        s['Proc_Hexagon'] = {
            displayName: 'Hexagon Grid', category: 'Patterns', color: '#e67e22',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Scale', type: 'float', default: 6, min: 1, max: 30 },
                { name: 'Border', type: 'float', default: 0.04, min: 0, max: 0.2 },
                { name: 'ColorA', type: 'color', default: '#333333' },
                { name: 'ColorB', type: 'color', default: '#ffffff' }
            ],
            outputs: [{ name: 'Color', type: 'color', index: 0 }, { name: 'Factor', type: 'float', index: 1 }],
            glsl: true
        };

        // ── FLUID / WATER ─────────────────────────────────────────────────────
        s['Water_Waves'] = {
            displayName: 'Gerstner Waves', category: 'Fluid', color: '#00bcd4',
            inputs: [
                { name: 'Direction', type: 'vector2', default: [1, 0] },
                { name: 'Steepness', type: 'float', default: 0.3, min: 0, max: 1, step: 0.01 },
                { name: 'Wavelength', type: 'float', default: 10, min: 1, max: 100 },
                { name: 'Amplitude', type: 'float', default: 0.15, min: 0, max: 2, step: 0.01 },
                { name: 'Speed', type: 'float', default: 1.0 }
            ],
            outputs: [
                { name: 'Displacement', type: 'vector3', index: 0 },
                { name: 'Normal', type: 'vector3', index: 1 }
            ],
            glsl: true, vertexOnly: true
        };

        s['Water_Normal_Mixer'] = {
            displayName: 'Water Ripples', category: 'Fluid', color: '#00bcd4',
            inputs: [
                { name: 'UV', type: 'vector2', default: null },
                { name: 'Speed', type: 'float', default: 0.05, min: 0, max: 1 },
                { name: 'Scale', type: 'float', default: 4, min: 1, max: 20 }
            ],
            outputs: [{ name: 'Normal', type: 'vector3', index: 0 }],
            widget: 'texture_upload', _encoding: 'linear',
            glsl: true
        };

        s['Fresnel'] = {
            displayName: 'Fresnel', category: 'Utility', color: '#16a085',
            inputs: [{ name: 'IOR', type: 'float', default: 1.5, min: 0.5, max: 5, step: 0.1 }],
            outputs: [{ name: 'Fresnel', type: 'float', index: 0 }],
            glsl: true
        };

        s['ColorAdjust'] = {
            displayName: 'Color Adjust', category: 'Color', color: '#e67e22',
            inputs: [
                { name: 'Color', type: 'color', default: '#ffffff' },
                { name: 'Hue', type: 'float', default: 0, min: -1, max: 1, step: 0.01 },
                { name: 'Saturation', type: 'float', default: 1, min: 0, max: 2, step: 0.01 },
                { name: 'Value', type: 'float', default: 1, min: 0, max: 2, step: 0.01 },
                { name: 'Contrast', type: 'float', default: 1, min: 0, max: 3, step: 0.01 }
            ],
            outputs: [{ name: 'Color', type: 'color', index: 0 }],
            glsl: true
        };

        return s;
    }

    // =========================================================================
    // GLSL LIBRARY  (injected once into both vertex and fragment shaders)
    // =========================================================================
    _glslLib() {
        return /* glsl */`
// ─── Noise Utilities ──────────────────────────────────────────────────────────
float _hash1(float n){ return fract(sin(n) * 43758.5453); }
float _hash1v(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2  _hash2(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)))) * 43758.5453); }

float valueNoise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(_hash1v(i),          _hash1v(i+vec2(1,0)), u.x),
               mix(_hash1v(i+vec2(0,1)),_hash1v(i+vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p, int octaves, float lac, float gain){
    float v=0.0, a=0.5, f=1.0;
    for(int i=0;i<16;i++){
        if(i>=octaves) break;
        v+=a*valueNoise(p*f); f*=lac; a*=gain;
    } return v;
}

// Voronoi
vec2 voronoi(vec2 p, float rnd){
    vec2 ip=floor(p), fp=fract(p);
    float minDist=8.0; vec2 cell=vec2(0);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec2 n=vec2(float(x),float(y));
        vec2 diff=n+_hash2(ip+n)*rnd-fp;
        float d=dot(diff,diff);
        if(d<minDist){ minDist=d; cell=ip+n; }
    } return vec2(sqrt(minDist), _hash1v(cell));
}

// Musgrave (multi-fractal)
float musgrave(vec2 p, int oct, float lac, float gain){
    return fbm(p, oct, lac, gain);
}

// ─── Colour Utilities ─────────────────────────────────────────────────────────
vec3 rgb2hsv(vec3 c){
    vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
    vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
    vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
    float d=q.x-min(q.w,q.y); float e=1e-10;
    return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);
}
vec3 hsv2rgb(vec3 c){
    vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);
    vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);
    return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
}
vec3 adjustHSVC(vec3 col, float h, float s, float v, float contrast){
    vec3 hsv=rgb2hsv(col); hsv.x=fract(hsv.x+h); hsv.y=clamp(hsv.y*s,0.0,1.0); hsv.z=clamp(hsv.z*v,0.0,1.0);
    vec3 out0=hsv2rgb(hsv);
    return clamp(mix(vec3(0.5),(out0-0.5)*contrast+0.5,1.0),0.0,1.0);
}

// ─── UV Utilities ─────────────────────────────────────────────────────────────
vec2 rotateUV2(vec2 uv, float angleDeg){
    float r=radians(angleDeg);
    float c2=cos(r),s2=sin(r);
    vec2 o=uv-0.5;
    return vec2(o.x*c2-o.y*s2,o.x*s2+o.y*c2)+0.5;
}

// ─── Patterns ────────────────────────────────────────────────────────────────
// Brick
float brickFactor(vec2 uv, float bw, float bh, float mortar){
    float offset=step(1.0,mod(floor(uv.y/bh),2.0))*bw*0.5;
    vec2 bu=vec2(uv.x+offset,uv.y)/vec2(bw,bh);
    vec2 bf=fract(bu);
    float m=max(step(bf.x,mortar/bw)+step(1.0-mortar/bw,bf.x),
                step(bf.y,mortar/bh)+step(1.0-mortar/bh,bf.y));
    return clamp(m,0.0,1.0);
}
vec3 brickPattern(vec2 uv, float bw, float bh, float mortar, vec3 brickCol, vec3 mortarCol, float variation){
    float offset=step(1.0,mod(floor(uv.y/bh),2.0))*bw*0.5;
    vec2 bu=vec2(uv.x+offset,uv.y)/vec2(bw,bh);
    vec2 cell=floor(bu);
    float vr=_hash1v(cell)*variation;
    float f=brickFactor(uv,bw,bh,mortar);
    return mix(brickCol*(1.0-vr), mortarCol, f);
}

// Wood Grain
float woodFactor(vec2 uv, float scale, float rings, float warp){
    vec2 p=uv*scale;
    float n=fbm(p*0.5,4,2.0,0.5)*warp;
    float dist=length(p+vec2(n*0.6,n*0.3));
    return fract(dist*rings);
}
vec3 woodPattern(vec2 uv, float scale, float rings, float warp, vec3 ca, vec3 cb){
    float f=smoothstep(0.3,0.7,woodFactor(uv,scale,rings,warp));
    return mix(ca,cb,f);
}

// Marble
float marbleFactor(vec2 uv, float scale, float turb){
    vec2 p=uv*scale;
    float n=fbm(p*turb,6,2.0,0.5);
    return clamp(pow(abs(sin((p.x+p.y+n)*3.14159)),0.5),0.0,1.0);
}
vec3 marblePattern(vec2 uv, float scale, float turb, vec3 ca, vec3 cb){
    return mix(ca,cb,marbleFactor(uv,scale,turb));
}

// Checker
float checkerFactor(vec2 uv, float scale){
    vec2 s=floor(uv*scale);
    return mod(s.x+s.y,2.0);
}

// Gradient (type: 0=linear 1=radial 2=angle 3=diagonal)
float gradientFactor(vec2 uv, float type){
    int t=int(type);
    if(t==1) return clamp(length(uv-0.5)*2.0,0.0,1.0);
    if(t==2) return atan(uv.y-0.5,uv.x-0.5)/(2.0*3.14159)+0.5;
    if(t==3) return clamp((uv.x+uv.y)*0.5,0.0,1.0);
    return clamp(uv.x,0.0,1.0); // linear default
}

// Wave Texture
float waveFactor(vec2 uv, float scale, float distortion, float detail){
    float distort=fbm(uv*scale*0.5,int(detail),2.0,0.5)*distortion;
    return clamp(sin((uv.x*scale+distort)*6.28318)*0.5+0.5,0.0,1.0);
}

// Hexagon Grid
float hexFactor(vec2 uv, float scale, float border){
    vec2 p=uv*scale;
    vec2 a=mod(p,vec2(1.0,1.732));
    vec2 b=mod(p+vec2(0.5,0.866),vec2(1.0,1.732));
    vec2 ac=min(a,vec2(1.0,1.732)-a);
    vec2 bc=min(b,vec2(1.0,1.732)-b);
    float da=min(ac.x,ac.y);
    float db=min(bc.x,bc.y);
    return clamp(1.0-smoothstep(border-0.01,border,max(da,db)),0.0,1.0);
}

// ─── Water / Fluid ────────────────────────────────────────────────────────────
vec3 gerstnerWave(vec3 pos, float steepness, float wavelength, vec2 dir, float speed, float time, inout vec3 tangent, inout vec3 binormal){
    float k=6.28318/max(wavelength,0.001);
    float c=sqrt(9.81/k);
    vec2  d=normalize(dir);
    float f=k*(dot(d,pos.xz)-c*speed*time);
    float a=clamp(steepness,0.0,0.9)/k;
    tangent +=vec3(-d.x*d.x*steepness*sin(f), d.x*steepness*cos(f),-d.x*d.y*steepness*sin(f));
    binormal+=vec3(-d.x*d.y*steepness*sin(f), d.y*steepness*cos(f),-d.y*d.y*steepness*sin(f));
    return vec3(d.x*(a*cos(f)), a*sin(f), d.y*(a*cos(f)));
}

vec3 dualPannerNormal(sampler2D map, vec2 uv, float time, float speed, float scale){
    vec2 uv1=uv*scale+vec2(time*speed, time*speed*0.7);
    vec2 uv2=uv*scale*0.8+vec2(-time*speed*0.6, time*speed*0.4)+vec2(0.33);
    vec3 n1=texture2D(map,uv1).rgb*2.0-1.0;
    vec3 n2=texture2D(map,uv2).rgb*2.0-1.0;
    return normalize(n1+n2);
}

// Fresnel approximation (Schlick)
float fresnelSchlick(float ior){
    float f0=(1.0-ior)/(1.0+ior); f0*=f0;
    return f0+(1.0-f0)*pow(1.0-max(dot(normalize(vViewPosition),normalize(vNormal)),0.0),5.0);
}
        `;
    }

    // =========================================================================
    // GLSL CODE GENERATORS  (per node type)
    // Returns { code:string, vertCode?:string, uniforms?:object }
    // inputs is an object mapping input-name → glsl-expression-string
    // =========================================================================
    _generators() {
        const G = {};
        const nid = (n) => n.id.replace(/[^a-zA-Z0-9]/g, '_');

        G['UV_Map'] = (n, inp) => ({ code: `vec2 ${nid(n)}_0 = vUv;` });
        G['Time_Input'] = (n, inp) => ({ code: `float ${nid(n)}_0 = uGlobalTime * ${inp.Speed};` });
        G['Float_Val'] = (n, inp) => ({ code: `float ${nid(n)}_0 = ${parseFloat(n.value ?? 0.5).toFixed(4)};` });
        G['RGB_Color'] = (n, inp) => {
            const c = new THREE.Color(n.value || '#ffffff');
            return { code: `vec3 ${nid(n)}_0 = vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)});` };
        };
        G['Invert'] = (n, inp) => ({ code: `float ${nid(n)}_0 = 1.0 - ${inp.Value};` });
        G['Remap'] = (n, inp) => ({ code: `float ${nid(n)}_0 = ${inp.NewMin}+(${inp.Value}-${inp.OldMin})/(max(${inp.OldMax}-${inp.OldMin},0.0001))*(${inp.NewMax}-${inp.NewMin});` });
        G['Clamp'] = (n, inp) => ({ code: `float ${nid(n)}_0 = clamp(${inp.Value},${inp.Min},${inp.Max});` });
        G['Math_Add'] = (n, inp) => ({ code: `float ${nid(n)}_0 = ${inp.A}+${inp.B};` });
        G['Math_Subtract'] = (n, inp) => ({ code: `float ${nid(n)}_0 = ${inp.A}-${inp.B};` });
        G['Math_Multiply'] = (n, inp) => ({ code: `float ${nid(n)}_0 = ${inp.A}*${inp.B};` });
        G['Math_Divide'] = (n, inp) => ({ code: `float ${nid(n)}_0 = ${inp.B}==0.0?0.0:${inp.A}/${inp.B};` });
        G['Math_Power'] = (n, inp) => ({ code: `float ${nid(n)}_0 = pow(max(${inp.Base},0.0),${inp.Exp});` });
        G['Math_Sin'] = (n, inp) => ({ code: `float ${nid(n)}_0 = sin(${inp.Value});` });
        G['Math_Cos'] = (n, inp) => ({ code: `float ${nid(n)}_0 = cos(${inp.Value});` });
        G['Math_Abs'] = (n, inp) => ({ code: `float ${nid(n)}_0 = abs(${inp.Value});` });
        G['Math_Sqrt'] = (n, inp) => ({ code: `float ${nid(n)}_0 = sqrt(max(${inp.Value},0.0));` });
        G['Math_Floor'] = (n, inp) => ({ code: `float ${nid(n)}_0 = floor(${inp.Value});` });
        G['Math_Fract'] = (n, inp) => ({ code: `float ${nid(n)}_0 = fract(${inp.Value});` });

        G['Mix'] = (n, inp) => ({ code: `vec3 ${nid(n)}_0 = mix(vec3(${inp.A}),vec3(${inp.B}),clamp(${inp.Alpha},0.0,1.0));` });
        G['MixFloat'] = (n, inp) => ({ code: `float ${nid(n)}_0 = mix(${inp.A},${inp.B},clamp(${inp.Alpha},0.0,1.0));` });

        G['Vector2_Dir'] = (n, inp) => ({ code: `vec2 ${nid(n)}_0 = normalize(vec2(${inp.X},${inp.Y}));` });

        G['Panner'] = (n, inp) => ({
            code: `vec2 ${nid(n)}_0 = ${inp.UV} + vec2(${inp.SpeedX},${inp.SpeedY})*${inp.Time};`
        });

        G['TilingAndOffset'] = (n, inp) => ({
            code: `vec2 ${nid(n)}_0 = ${inp.UV}*vec2(${inp.TileX},${inp.TileY})+vec2(${inp.OffsetX},${inp.OffsetY});`
        });

        G['RotateUV'] = (n, inp) => ({
            code: `vec2 ${nid(n)}_0 = rotateUV2(${inp.UV}, ${inp.Angle});`
        });

        G['Fresnel'] = (n, inp) => ({
            code: `float ${nid(n)}_0 = fresnelSchlick(${inp.IOR});`
        });

        G['ColorAdjust'] = (n, inp) => ({
            code: `vec3 ${nid(n)}_0 = adjustHSVC(${inp.Color},${inp.Hue},${inp.Saturation},${inp.Value},${inp.Contrast});`
        });

        G['ColorRamp'] = (n, inp) => {
            const stops = (n.value && Array.isArray(n.value)) ? n.value : ['#000000', '#ffffff'];
            const colors = stops.map(h => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; });
            const count = colors.length;
            let code = `vec3 ${nid(n)}_0;\n{float _f=clamp(${inp.Fac},0.0,1.0);\n`;
            if (count === 1) { code += `${nid(n)}_0=${colors[0]};`; }
            else if (count === 2) { code += `${nid(n)}_0=mix(${colors[0]},${colors[1]},_f);`; }
            else {
                const seg = 1.0 / (count - 1);
                for (let i = 0; i < count - 1; i++) {
                    const lo = (i * seg).toFixed(4), hi = ((i + 1) * seg).toFixed(4);
                    const cond = i === 0 ? `_f<=${hi}` : `_f<=${hi}`;
                    if (i === 0) code += `if(_f<=${hi}){${nid(n)}_0=mix(${colors[i]},${colors[i + 1]},(_f-${lo})/${seg.toFixed(4)});}`;
                    else code += `else if(_f<=${hi}){${nid(n)}_0=mix(${colors[i]},${colors[i + 1]},(_f-${lo})/${seg.toFixed(4)});}`;
                }
                code += `else{${nid(n)}_0=${colors[count - 1]};}`;
            }
            code += `}\nfloat ${nid(n)}_1=luminance(${nid(n)}_0);`;
            return { code };
        };

        // ── Noise ─────────────────────────────────────────────────────────────
        G['Noise_Value'] = (n, inp) => ({
            code: `float ${nid(n)}_0 = fbm(${inp.UV}*${inp.Scale}, int(clamp(${inp.Detail},1.0,8.0)), 2.0, ${inp.Rough});`
        });

        G['Noise_Voronoi'] = (n, inp) => ({
            code: `vec2 ${nid(n)}_vor = voronoi(${inp.UV}*${inp.Scale},${inp.Randomness});\n` +
                `float ${nid(n)}_0 = ${nid(n)}_vor.x;\n` +
                `vec3 ${nid(n)}_1 = vec3(${nid(n)}_vor.y);`
        });

        G['Noise_Musgrave'] = (n, inp) => ({
            code: `float ${nid(n)}_0 = musgrave(${inp.UV}*${inp.Scale}, int(clamp(${inp.Octaves},1.0,8.0)), ${inp.Lacun}, ${inp.Gain});`
        });

        // ── Patterns ──────────────────────────────────────────────────────────
        G['Proc_Brick'] = (n, inp) => ({
            code: `float ${nid(n)}_1 = brickFactor(${inp.UV},${inp.BrickWidth},${inp.BrickHeight},${inp.Mortar});\n` +
                `vec3 ${nid(n)}_0 = brickPattern(${inp.UV},${inp.BrickWidth},${inp.BrickHeight},${inp.Mortar},${inp.BrickColor},${inp.MortarColor},${inp.Variation});`
        });

        G['Proc_Wood'] = (n, inp) => ({
            code: `float ${nid(n)}_1 = woodFactor(${inp.UV},${inp.Scale},${inp.Rings},${inp.Warp});\n` +
                `vec3 ${nid(n)}_0 = woodPattern(${inp.UV},${inp.Scale},${inp.Rings},${inp.Warp},${inp.ColorA},${inp.ColorB});`
        });

        G['Proc_Marble'] = (n, inp) => ({
            code: `float ${nid(n)}_1 = marbleFactor(${inp.UV},${inp.Scale},${inp.Turbulence});\n` +
                `vec3 ${nid(n)}_0 = marblePattern(${inp.UV},${inp.Scale},${inp.Turbulence},${inp.ColorA},${inp.ColorB});`
        });

        G['Proc_Checker'] = (n, inp) => ({
            code: `float ${nid(n)}_1 = checkerFactor(${inp.UV},${inp.Scale});\n` +
                `vec3 ${nid(n)}_0 = mix(${inp.ColorA},${inp.ColorB},${nid(n)}_1);`
        });

        G['Proc_Gradient'] = (n, inp) => ({
            code: `float ${nid(n)}_1 = gradientFactor(${inp.UV},${inp.Type});\n` +
                `vec3 ${nid(n)}_0 = mix(${inp.ColorA},${inp.ColorB},${nid(n)}_1);`
        });

        G['Proc_Waves'] = (n, inp) => ({
            code: `float ${nid(n)}_1 = waveFactor(${inp.UV},${inp.Scale},${inp.Distortion},${inp.Detail});\n` +
                `vec3 ${nid(n)}_0 = mix(${inp.ColorA},${inp.ColorB},${nid(n)}_1);`
        });

        G['Proc_Hexagon'] = (n, inp) => ({
            code: `float ${nid(n)}_1 = hexFactor(${inp.UV},${inp.Scale},${inp.Border});\n` +
                `vec3 ${nid(n)}_0 = mix(${inp.ColorA},${inp.ColorB},${nid(n)}_1);`
        });

        // ── Texture Maps ──────────────────────────────────────────────────────
        const texIds = ['Texture_Albedo', 'Texture_Normal', 'Texture_Roughness', 'Texture_Metalness',
            'Texture_AO', 'Texture_Displacement', 'Texture_Emissive', 'Texture_Alpha'];

        texIds.forEach(id => {
            G[id] = (n, inp, uniforms) => {
                const uname = `uTex_${nid(n)}`;
                const tex = n.texture || null;
                uniforms[uname] = { value: tex || new THREE.Texture() };

                const schema = this.nodeSchemas[id];
                const outType = schema.outputs[0].type;
                const isFloat = outType === 'float';
                const isNormal = id === 'Texture_Normal';

                // Header: declare the uniform
                const decl = `uniform sampler2D ${uname};`;

                let code;
                if (isFloat) {
                    code = `float ${nid(n)}_0 = texture2D(${uname},${inp.UV}).r * ${inp.Intensity};`;
                } else if (isNormal) {
                    code = `vec3 ${nid(n)}_0 = normalize(texture2D(${uname},${inp.UV}).rgb*2.0-1.0);`;
                } else {
                    code = `vec3 ${nid(n)}_0 = texture2D(${uname},${inp.UV}).rgb * ${inp.Intensity};`;
                }

                return { decl, code };
            };
        });

        // ── Fluid ─────────────────────────────────────────────────────────────
        G['Water_Waves'] = (n, inp) => ({
            // Vertex-only: both vert and frag code needed
            vertCode:
                `vec3 ${nid(n)}_tan=vec3(1,0,0); vec3 ${nid(n)}_bin=vec3(0,0,1);\n` +
                `vec3 ${nid(n)}_0 = gerstnerWave(position,${inp.Steepness},${inp.Wavelength},\n` +
                `    ${inp.Direction},${inp.Amplitude},${inp.Speed},uGlobalTime,${nid(n)}_tan,${nid(n)}_bin);\n` +
                `vec3 ${nid(n)}_1 = normalize(cross(${nid(n)}_bin,${nid(n)}_tan));`,
            code: `vec3 ${nid(n)}_0=vec3(0.0); vec3 ${nid(n)}_1=vec3(0,1,0);` // stub in frag
        });

        G['Water_Normal_Mixer'] = (n, inp, uniforms) => {
            const uname = `uWaterTex_${nid(n)}`;
            uniforms[uname] = { value: n.texture || new THREE.Texture() };
            const decl = `uniform sampler2D ${uname};`;
            const code = `vec3 ${nid(n)}_0 = dualPannerNormal(${uname},${inp.UV},uGlobalTime,${inp.Speed},${inp.Scale});`;
            return { decl, code };
        };

        return G;
    }

    // =========================================================================
    // COMPILE INPUTS FOR GLSL  — returns { inputName: 'glsl_expr' }
    // =========================================================================
    _compileInputsGLSL(node, generators) {
        const inputs = {};
        const nid = (n) => n.id.replace(/[^a-zA-Z0-9]/g, '_');

        node.inputs.forEach((input, i) => {
            const conn = this.connections.find(c => c.toId === node.id && c.toSocket === i);
            if (conn) {
                const src = this.nodes.find(n => n.id === conn.fromId);
                if (src) {
                    // Output socket index tells us the variable suffix (_0, _1, …)
                    inputs[input.name] = `${nid(src)}_${conn.fromSocket}`;
                    return;
                }
            }

            // No connection — use node override or schema default
            const raw = node[input.name] !== undefined ? node[input.name] : input.default;

            if (input.type === 'color') {
                const c = new THREE.Color(raw || '#ffffff');
                inputs[input.name] = `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;
            } else if (input.type === 'vector2' || input.type === 'vec2') {
                if (Array.isArray(raw)) {
                    inputs[input.name] = `vec2(${(+raw[0]).toFixed(4)},${(+raw[1]).toFixed(4)})`;
                } else if (raw && typeof raw === 'object') {
                    inputs[input.name] = `vec2(${(+raw.x).toFixed(4)},${(+raw.y).toFixed(4)})`;
                } else {
                    // Unconnected UV defaults to vUv
                    inputs[input.name] = (input.name === 'UV') ? 'vUv' : 'vec2(0.0)';
                }
            } else if (input.type === 'vector3' || input.type === 'vec3') {
                if (raw === null || raw === undefined) {
                    inputs[input.name] = 'vec3(0.0,0.0,0.0)';
                } else if (Array.isArray(raw)) {
                    inputs[input.name] = `vec3(${raw.map(v => (+v).toFixed(4)).join(',')})`;
                } else {
                    const c = new THREE.Color(raw);
                    inputs[input.name] = `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;
                }
            } else {
                // float / number
                const v = typeof raw === 'number' ? raw : parseFloat(raw) || 0;
                inputs[input.name] = v.toFixed(4);
            }
        });

        return inputs;
    }

    // =========================================================================
    // TOPOLOGICAL SORT
    // =========================================================================
    _topoSort(rootNode) {
        const order = [];
        const visited = new Set();
        const traverse = (node) => {
            if (visited.has(node.id)) return;
            visited.add(node.id);
            node.inputs.forEach((inp, i) => {
                const conn = this.connections.find(c => c.toId === node.id && c.toSocket === i);
                if (conn) {
                    const src = this.nodes.find(n => n.id === conn.fromId);
                    if (src) traverse(src);
                }
            });
            order.push(node);
        };
        traverse(rootNode);
        return order;
    }

    // =========================================================================
    // INJECT SHADER LOGIC  (main entry point for GLSL compilation)
    // =========================================================================
    injectShaderLogic(material, outputNode, surfaceNode) {
        const generators = this._generators();
        const nodeOrder = this._topoSort(outputNode);
        const nid = (n) => n.id.replace(/[^a-zA-Z0-9]/g, '_');

        const sharedUniforms = {};
        const declLines = [];
        const fragLines = [];
        const vertLines = [];
        const vertexGeneratedVars = new Set();

        nodeOrder.forEach(node => {
            if (!generators[node.type]) return;

            const inputs = this._compileInputsGLSL(node, generators);
            const result = generators[node.type](node, inputs, sharedUniforms);
            if (!result) return;

            if (result.decl) declLines.push(result.decl);

            if (result.code) {
                fragLines.push(`// ${node.schema.displayName}\n${result.code}`);
            }

            if (result.vertCode) {
                vertLines.push(`// ${node.schema.displayName} (vertex)\n${result.vertCode}`);
                (node.outputs || []).forEach((_, outputIndex) => {
                    vertexGeneratedVars.add(`${nid(node)}_${outputIndex}`);
                });
            }
        });

        const getInputConnection = (node, inputName) => {
            if (!node) return null;
            const inputIndex = node.inputs.findIndex(i => i.name === inputName);
            if (inputIndex < 0) return null;
            return this.connections.find(c => c.toId === node.id && c.toSocket === inputIndex) || null;
        };

        const getInputVar = (node, inputName, fallback = null) => {
            const connection = getInputConnection(node, inputName);
            if (!connection) return fallback;
            const source = this.nodes.find(n => n.id === connection.fromId);
            if (!source) return fallback;
            return `${nid(source)}_${connection.fromSocket}`;
        };

        const getInputSourceType = (node, inputName) => {
            const connection = getInputConnection(node, inputName);
            if (!connection) return null;
            const source = this.nodes.find(n => n.id === connection.fromId);
            return source?.outputs?.[connection.fromSocket]?.type || null;
        };

        const baseColorVar = getInputVar(surfaceNode, 'BaseColor', null);
        const roughnessVar = getInputVar(surfaceNode, 'Roughness', null);
        const metalnessVar = getInputVar(surfaceNode, 'Metallic', null);
        const emissionVar = getInputVar(surfaceNode, 'Emission', null);
        const normalVar = getInputVar(surfaceNode, 'Normal', null);

        const outputDisplacement = getInputVar(outputNode, 'Displacement', null);
        const surfaceDisplacement = getInputVar(surfaceNode, 'Displacement', null);
        const displacementVar = outputDisplacement || surfaceDisplacement;

        const graphKey = JSON.stringify({
            nodes: nodeOrder.map(n => ({
                id: n.id,
                type: n.type,
                value: n.value,
                overrides: (n.inputs || []).map(input => n[input.name] ?? null)
            })),
            links: this.connections
                .filter(c => nodeOrder.some(n => n.id === c.fromId || n.id === c.toId))
                .map(c => [c.fromId, c.fromSocket, c.toId, c.toSocket])
        });

        material.userData = material.userData || {};
        material.userData.smMaterialNodeEditorOwned = true;
        material.userData.smNodeGraphShaderKey = graphKey;
        material.customProgramCacheKey = () => `SMMaterialGraph:${graphKey}`;

        material.onBeforeCompile = (shader) => {
            shader.uniforms.uGlobalTime = { value: 0 };
            Object.assign(shader.uniforms, sharedUniforms);

            if (!window.animatedMaterials) window.animatedMaterials = [];
            if (!window.animatedMaterials.includes(shader.uniforms)) {
                window.animatedMaterials.push(shader.uniforms);
            }

            // FRAGMENT SHADER
            let fragBody = fragLines.join('\n').replace(/\bvUv\b/g, 'vMatUV');

            const fragDeclarations = [
                'varying vec2 vMatUV;',
                'uniform float uGlobalTime;',
                ...declLines
            ].join('\n');

            const fragMainToken = 'void main() {';
            if (!shader.fragmentShader.includes(fragMainToken)) {
                throw new Error('Material Graph: fragment shader main() was not found.');
            }

            // Insert after Three.js declarations, immediately before main().
            // This is important because _glslLib() contains helpers that reference
            // Three.js varyings such as vViewPosition and vNormal.
            shader.fragmentShader = shader.fragmentShader.replace(
                fragMainToken,
                `${fragDeclarations}\n${this._glslLib()}\n${fragMainToken}\n${fragBody}`
            );

            if (baseColorVar) {
                const baseType = getInputSourceType(surfaceNode, 'BaseColor') || 'color';
                const expr = baseType === 'float'
                    ? `vec3(${baseColorVar})`
                    : `${baseColorVar}`;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <color_fragment>',
                    `#include <color_fragment>\ndiffuseColor.rgb = clamp(vec3(${expr}), 0.0, 1.0);`
                );
            }

            if (roughnessVar) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <roughnessmap_fragment>',
                    `#include <roughnessmap_fragment>\nroughnessFactor = clamp(float(${roughnessVar}), 0.0, 1.0);`
                );
            }

            if (metalnessVar) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <metalnessmap_fragment>',
                    `#include <metalnessmap_fragment>\nmetalnessFactor = clamp(float(${metalnessVar}), 0.0, 1.0);`
                );
            }

            if (emissionVar) {
                const emissionType = getInputSourceType(surfaceNode, 'Emission') || 'color';
                const expr = emissionType === 'float'
                    ? `vec3(${emissionVar})`
                    : `${emissionVar}`;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <emissivemap_fragment>',
                    `#include <emissivemap_fragment>\ntotalEmissiveRadiance = vec3(${expr});`
                );
            }

            if (normalVar) {
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <normal_fragment_maps>',
                    `#include <normal_fragment_maps>
                     vec3 _smInjectedNormal = normalize(vec3(${normalVar}));
                     #ifdef TANGENTSPACE_NORMALMAP
                        normal = normalize(tbn * _smInjectedNormal);
                     #else
                        normal = normalize(normalMatrix * _smInjectedNormal);
                     #endif`
                );
            }

            // VERTEX SHADER
            const vertexLib = `
vec3 smGerstnerWave(
    vec3 pos,
    float steepness,
    float wavelength,
    vec2 dir,
    float speed,
    float time,
    inout vec3 tangent,
    inout vec3 binormal
){
    float k = 6.28318 / max(wavelength, 0.001);
    float c = sqrt(9.81 / k);
    vec2 d = normalize(dir);
    float f = k * (dot(d, pos.xz) - c * speed * time);
    float a = clamp(steepness, 0.0, 0.9) / k;
    tangent += vec3(
        -d.x*d.x*steepness*sin(f),
         d.x*steepness*cos(f),
        -d.x*d.y*steepness*sin(f)
    );
    binormal += vec3(
        -d.x*d.y*steepness*sin(f),
         d.y*steepness*cos(f),
        -d.y*d.y*steepness*sin(f)
    );
    return vec3(d.x*(a*cos(f)), a*sin(f), d.y*(a*cos(f)));
}
`;

            let vertBody = vertLines.join('\n')
                .replace(/\bgerstnerWave\s*\(/g, 'smGerstnerWave(')
                .replace(/\bvUv\b/g, 'vMatUV');

            let displacementLine = '';
            if (displacementVar) {
                if (vertexGeneratedVars.has(displacementVar)) {
                    displacementLine = `transformed += vec3(${displacementVar});`;
                } else {
                    console.warn(
                        '[MaterialNodeEditor] Displacement source is not vertex-safe and was ignored:',
                        displacementVar
                    );
                }
            }

            const vertMainToken = 'void main() {';
            if (!shader.vertexShader.includes(vertMainToken)) {
                throw new Error('Material Graph: vertex shader main() was not found.');
            }

            shader.vertexShader = shader.vertexShader.replace(
                vertMainToken,
                `varying vec2 vMatUV;
                 uniform float uGlobalTime;
                 ${vertLines.length ? vertexLib : ''}
                 ${vertMainToken}
                 vMatUV = uv;`
            );

            if (vertBody || displacementLine) {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                     ${vertBody}
                     ${displacementLine}`
                );
            }

            material.userData.smLastCompiledShader = shader;
        };

        material.needsUpdate = true;
    }

    // =========================================================================
    // CHECK IF GRAPH NEEDS GLSL
    // =========================================================================
    _needsGLSL(rootNode) {
        const order = this._topoSort(rootNode);

        // Static nodes with a CPU compile() implementation do not need a
        // custom onBeforeCompile shader. This directly keeps RGB Color ->
        // Principled BaseColor on the stable MeshPhysicalMaterial path.
        return order.some(node =>
            node.schema?.glsl === true &&
            !['PBR_Surface', 'Material_Output'].includes(node.type) &&
            typeof node.schema?.compile !== 'function'
        );
    }

    // =========================================================================
    // COMPILE INPUTS (CPU / static path)
    // =========================================================================
    _compileInputsCPU(node) {
        const inputs = {};
        node.inputs.forEach((inp, i) => {
            const conn = this.connections.find(c => c.toId === node.id && c.toSocket === i);
            if (conn) {
                const src = this.nodes.find(n => n.id === conn.fromId);
                if (src && src.schema.compile) {
                    inputs[inp.name] = src.schema.compile(this._compileInputsCPU(src), src);
                } else {
                    inputs[inp.name] = src?.value ?? inp.default ?? null;
                }
            } else {
                inputs[inp.name] = node[inp.name] !== undefined ? node[inp.name] : (inp.default ?? null);
            }
        });
        return inputs;
    }

    // =========================================================================
    // COMPILE & APPLY
    // =========================================================================
    _assignCompiledMaterial(object, material) {
        if (!object?.isMesh || !material) return false;

        const previous = object.material;
        object.material = material;
        object.material.needsUpdate = true;

        const disposeOne = (mat) => {
            if (!mat || mat === material) return;
            if (mat.userData?.smMaterialNodeEditorOwned === true) {
                try { mat.dispose?.(); } catch (_) {}
            }
        };

        if (Array.isArray(previous)) previous.forEach(disposeOne);
        else disposeOne(previous);

        return true;
    }

    compileAndApply() {
        if (!window.selectedObject?.isMesh) {
            this.log('No mesh selected', 'error');
            this.showNotification('⚠️ Select a Mesh first!', 'warning');
            return false;
        }
        try {
            const outputNode = this.nodes.find(n => n.type === 'Material_Output' || n.isOutput);
            if (!outputNode) {
                const legacySurface = this.nodes.find(n => n.type === 'PBR_Surface');
                if (!legacySurface) {
                    this.log('No material output node', 'error');
                    this.showNotification('Material Output node is missing.', 'error');
                    return false;
                }
                const material = this._createMaterial(legacySurface.schema.compile(this._compileInputsCPU(legacySurface)));
                if (this._needsGLSL(legacySurface)) this.injectShaderLogic(material, legacySurface, legacySurface);
                this._assignCompiledMaterial(window.selectedObject, material);
                this.lastAppliedMaterial = material;
                this.updatePreviewObject();
                this.showNotification('Legacy surface graph applied.', 'warning');
                return true;
            }

            const surfaceInputIndex = outputNode.inputs.findIndex(inp => inp.name === 'Surface');
            const surfaceConnection = this.connections.find(c => c.toId === outputNode.id && c.toSocket === surfaceInputIndex);
            const surfaceNode = surfaceConnection
                ? this.nodes.find(n => n.id === surfaceConnection.fromId)
                : this.nodes.find(n => n.type === 'PBR_Surface');

            if (!surfaceNode?.schema?.compile) {
                this.log('No Principled BSDF connected to output', 'error');
                this.showNotification('Connect a Principled BSDF to Material Output.Surface.', 'warning');
                return false;
            }

            this.log('Compiling...', 'info');

            const cpuInputs = this._compileInputsCPU(surfaceNode);
            const matConfig = surfaceNode.schema.compile(cpuInputs);
            const material = this._createMaterial(matConfig);

            if (this._needsGLSL(outputNode)) {
                this.log('GLSL path active', 'info');
                this.injectShaderLogic(material, outputNode, surfaceNode);
            }

            this._assignCompiledMaterial(window.selectedObject, material);
            this.lastAppliedMaterial = material;
            this.updatePreviewObject();

            this.log(`Material applied to "${window.selectedObject.name}"`, 'success');
            this.showNotification('✨ Material Applied!', 'success');
            return true;
        } catch (err) {
            this.log(`Compile error: ${err.message}`, 'error');
            console.error(err);
            this.showNotification(`❌ ${err.message}`, 'error');
            return false;
        }
    }

    _createMaterial(config) {
        if (config.type === 'MeshPhysicalMaterial') {
            const p = config.props;
            const c01 = (v, d = 0) => { const n = +v; return isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
            const num = (v, d = 0) => { const n = +v; return isFinite(n) ? n : d; };
            const material = new THREE.MeshPhysicalMaterial({
                color: p.color || new THREE.Color('#ffffff'),
                metalness: c01(p.metalness, 0),
                roughness: c01(p.roughness, 0.5),
                transparent: !!p.transparent,
                opacity: c01(p.opacity, 1),
                emissive: p.emissive || new THREE.Color('#000000'),
                emissiveIntensity: num(p.emissiveIntensity, 0),
                transmission: c01(p.transmission, 0),
                ior: num(p.ior, 1.5),
                clearcoat: c01(p.clearcoat, 0),
                clearcoatRoughness: c01(p.clearcoatRoughness, 0),
                sheen: c01(p.sheen, 0),
                sheenColor: p.sheenColor || new THREE.Color('#ffffff'),
                normalMap: p.normalMap || null,
                side: THREE.DoubleSide,
            });

            material.userData = material.userData || {};
            material.userData.smMaterialNodeEditorOwned = true;
            return material;
        }

        const fallback = new THREE.MeshPhysicalMaterial({ color: 0xaaaaaa });
        fallback.userData.smMaterialNodeEditorOwned = true;
        return fallback;
    }

    scheduleCompile() {
        if (!this.autoCompile) return;
        clearTimeout(this.compileDebounceTimer);
        this.compileDebounceTimer = setTimeout(() => this.compileAndApply(), 350);
    }

    // =========================================================================
    // ANIMATED UNIFORMS
    // =========================================================================
    updateAnimatedUniforms() {
        const time = typeof window.currentTime === 'number'
            ? window.currentTime
            : performance.now() / 1000;
        (window.animatedMaterials || []).forEach(u => {
            if (u.uGlobalTime) u.uGlobalTime.value = time;
        });
    }

    // =========================================================================
    // GLOBAL CONSOLE
    // =========================================================================
    log(message, type = 'info', extra = null) {
        if (!this.debugMode) return null;

        const text = String(message ?? '');

        const LEVEL_MAP = {
            info: 'info',
            success: 'info',
            warning: 'warn',
            warn: 'warn',
            error: 'error',
            connection: 'debug',
            debug: 'debug'
        };

        const LABEL_MAP = {
            info: 'Info',
            success: 'Success',
            warning: 'Warning',
            warn: 'Warning',
            error: 'Error',
            connection: 'Connection',
            debug: 'Debug'
        };

        const level =
            LEVEL_MAP[type] ||
            'info';

        const label =
            LABEL_MAP[type] ||
            'Info';

        const args = [
            `[Material:${label}] ${text}`
        ];

        if (
            extra !== null &&
            extra !== undefined
        ) {
            args.push(extra);
        }

        /*
         * The Global Console is the ONLY Material Editor log UI.
         *
         * Direct push avoids duplicate capture by console.log wrappers.
         */
        if (
            window.SMConsolePanel &&
            typeof window.SMConsolePanel.push === 'function'
        ) {
            return window.SMConsolePanel.push(
                level,
                args,
                {
                    source:
                        this.consoleSource ||
                        'MaterialEditor',
                    subsystem:
                        'material-editor',
                    materialType:
                        type
                }
            );
        }

        /*
         * Early boot fallback.
         */
        if (level === 'error') {
            console.error(
                `[Material:${label}]`,
                text,
                extra ?? ''
            );
        } else if (level === 'warn') {
            console.warn(
                `[Material:${label}]`,
                text,
                extra ?? ''
            );
        } else if (level === 'debug') {
            console.debug(
                `[Material:${label}]`,
                text,
                extra ?? ''
            );
        } else {
            console.info(
                `[Material:${label}]`,
                text,
                extra ?? ''
            );
        }

        return null;
    }

    /*
     * Clear only Material Editor entries from the Global Console.
     */
    clearDebugLogs() {
        const source =
            this.consoleSource ||
            'MaterialEditor';

        if (
            window.SMConsolePanel &&
            typeof window.SMConsolePanel.clearSource === 'function'
        ) {
            return window.SMConsolePanel.clearSource(
                source
            );
        }

        return 0;
    }

    /*
     * Compatibility no-op.
     * Material Editor no longer renders any private debug DOM.
     */
    updateDebugPanel() {
        return false;
    }

    /*
     * Enables/disables Material Editor log emission only.
     */
    toggleDebug(enabled) {
        const wasEnabled =
            this.debugMode;

        this.debugMode =
            !!enabled;

        if (
            this.debugMode &&
            !wasEnabled
        ) {
            this.log(
                'Material Editor logging enabled.',
                'info'
            );
        }

        return this.debugMode;
    }

    /*
     * Legacy Material Editor Debug button now opens Global Console only.
     */
    toggleDebugPanel() {
        const globalConsole =
            window.SMConsolePanel;

        if (!globalConsole) {
            console.warn(
                '[MaterialEditor] SM Global Console is not available.'
            );

            return false;
        }

        if (
            window.TimelinePanel &&
            typeof window.TimelinePanel.openConsole === 'function'
        ) {
            window.TimelinePanel.openConsole();

            return true;
        }

        globalConsole.show?.();

        return true;
    }

    openGlobalConsole() {
        if (
            window.TimelinePanel &&
            typeof window.TimelinePanel.openConsole === 'function'
        ) {
            return window.TimelinePanel.openConsole();
        }

        return window.SMConsolePanel
            ?.show?.() ||
            false;
    }

    // =========================================================================
    // VALIDATION
    // =========================================================================
    validateConnection(fromNode, fromSocket, toNode, toSocket) {
        const errors = [];
        if (!fromNode || !toNode) { errors.push('Missing node'); return { valid: false, errors }; }
        if (fromSocket < 0 || fromSocket >= fromNode.outputs.length) errors.push('Invalid output socket');
        if (toSocket < 0 || toSocket >= toNode.inputs.length) errors.push('Invalid input socket');
        const outType = fromNode.outputs[fromSocket]?.type || 'unknown';
        const inType = toNode.inputs[toSocket]?.type || 'unknown';
        const compat = this.socketTypeMap[inType] || [inType];
        if (!compat.includes(outType)) errors.push(`Type mismatch: ${outType} → ${inType} (expected ${compat.join('/')})`);
        if (this._wouldCycle(fromNode.id, toNode.id)) errors.push('Would create a cycle!');
        return { valid: errors.length === 0, errors };
    }

    _wouldCycle(fromId, toId) {
        const stack = [toId]; const visited = new Set();
        while (stack.length) {
            const id = stack.pop();
            if (visited.has(id)) continue;
            visited.add(id);
            if (id === fromId) return true;
            this.connections.filter(c => c.fromId === id).forEach(c => stack.push(c.toId));
        }
        return false;
    }

    // =========================================================================
    // SPAWN NODE
    // =========================================================================
    spawnNode(type, color = null, x = 80, y = 80) {
        const schema = this.nodeSchemas[type];
        if (!schema) { this.log(`Unknown type: ${type}`, 'error'); return null; }
        const node = {
            id: `node_${this.nodeIdCounter++}`, type, schema,
            color: color || schema.color,
            x, y, w: type === 'Material_Output' ? 150 : (type === 'PBR_Surface' ? 210 : 170), h: 40,
            inputs: schema.inputs || [],
            outputs: schema.outputs || [],
            value: schema.defaultValue !== undefined ? schema.defaultValue : null,
            isOutput: !!schema.isOutput,
            expanded: true,
            groupStates: {},
            selected: false
        };
        (schema.inputs || []).forEach(inp => {
            if (inp.group && node.groupStates[inp.group] === undefined)
                node.groupStates[inp.group] = true;
        });
        this._updateNodeHeight(node);
        this.nodes.push(node);
        this.log(`Spawned: ${schema.displayName}`, 'success');
        return node;
    }

    _updateNodeHeight(node) {
        if (!node.expanded) { node.h = 28; return; }
        let h = 36;
        const seenGroups = new Set();
        node.inputs.forEach(inp => {
            if (inp.group) {
                if (!seenGroups.has(inp.group)) { seenGroups.add(inp.group); h += 22; }
                if (node.groupStates[inp.group]) h += 22;
            } else { h += 22; }
        });
        node.h = Math.max(h + 8, 36 + node.outputs.length * 22, 50);
    }

    getSocketPosition(node, type, index) {
        if (type === 'output') return { x: node.x + node.w, y: node.y + 30 + index * 22 };
        if (!node.expanded) return null;
        let py = node.y + 36;
        const seen = new Set();
        for (let i = 0; i < node.inputs.length; i++) {
            const inp = node.inputs[i];
            if (inp.group) {
                if (!seen.has(inp.group)) { seen.add(inp.group); py += 22; }
                if (node.groupStates[inp.group]) {
                    if (i === index) return { x: node.x, y: py };
                    py += 22;
                } else if (i === index) return null;
            } else {
                if (i === index) return { x: node.x, y: py };
                py += 22;
            }
        }
        return null;
    }

    // =========================================================================
    // CONNECTION
    // =========================================================================
    createConnection(fromId, fromSocket, toId, toSocket) {
        const fromNode = this.nodes.find(n => n.id === fromId);
        const toNode = this.nodes.find(n => n.id === toId);
        const result = this.validateConnection(fromNode, fromSocket, toNode, toSocket);
        if (!result.valid) {
            result.errors.forEach(e => this.log(e, 'error'));
            this.showNotification('❌ ' + result.errors[0], 'error');
            return false;
        }
        this.connections = this.connections.filter(c => !(c.toId === toId && c.toSocket === toSocket));
        this.connections.push({ fromId, fromSocket, toId, toSocket });
        this.log(`${fromNode.schema.displayName} → ${toNode.schema.displayName}`, 'connection');
        this.scheduleCompile();
        return true;
    }

    deleteNode(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
        this.connections = this.connections.filter(c => c.fromId !== nodeId && c.toId !== nodeId);
        this.groups.forEach(group => {
            group.nodeIds = (group.nodeIds || []).filter(id => id !== nodeId);
        });
        this.groups = this.groups.filter(group => (group.nodeIds || []).length > 0);
        this.selectedNodes = this.selectedNodes.filter(n => n.id !== nodeId);
        if (this.selectedGroup && !(this.selectedGroup.nodeIds || []).length) this.selectedGroup = null;
        if (this.selectedNode?.id === nodeId) { this.selectedNode = null; this.updatePropertiesPanel(); }
        this.log(`Deleted: ${node.schema.displayName}`, 'warning');
        this.scheduleCompile();
    }

    duplicateNode(nodeId) {
        const src = this.nodes.find(n => n.id === nodeId);
        if (!src) return;
        const clone = this.spawnNode(src.type, src.color, src.x + 30, src.y + 30);
        if (!clone) return;
        clone.value = Array.isArray(src.value) ? [...src.value] : src.value;
        clone.expanded = src.expanded;
        clone.groupStates = { ...src.groupStates };
        if (src.texture) { clone.texture = src.texture; clone.textureData = src.textureData; }
        this._updateNodeHeight(clone);
        this.setSelectedNodes([clone]);
        this.scheduleCompile();
    }

    setSelectedNodes(nodes) {
        this.selectedNodes = nodes ? [...new Set(nodes)] : [];
        this.selectedNode = this.selectedNodes.length === 1 ? this.selectedNodes[0] : null;
        this.selectedGroup = null;
        this.updatePropertiesPanel();
    }

    toggleNodeSelection(node) {
        if (!node) return;
        if (this.selectedNodes.includes(node)) this.selectedNodes = this.selectedNodes.filter(n => n !== node);
        else this.selectedNodes.push(node);
        this.selectedNode = this.selectedNodes.length === 1 ? this.selectedNodes[0] : null;
        this.selectedGroup = null;
        this.updatePropertiesPanel();
    }

    // =========================================================================
    // INIT & UI
    // =========================================================================
    init() {
        this._injectProfessionalStyles();
        this.setupUI();
        this.canvas = document.getElementById('mat-graph-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvasEvents();
        this.startRenderLoop();
        this.resize();
        this.setupPanelResizers();
        this.setupPreviewViewport();
        this.log('Material Node Editor v3 initialized', 'success');

        // Default graph
        const previousAutoCompile = this.autoCompile;
        this.autoCompile = false;
        const surface = this.spawnNode('PBR_Surface', null, 420, 140);
        const output = this.spawnNode('Material_Output', null, 720, 180);
        this.spawnNode('RGB_Color', null, 120, 70);
        this.spawnNode('Float_Val', null, 120, 180);
        this.spawnNode('Float_Val', null, 120, 260);
        if (surface && output) this.createConnection(surface.id, 0, output.id, 0);
        this.autoCompile = previousAutoCompile;
    }

    _injectProfessionalStyles() {
        if (document.getElementById('sm-material-editor-professional-styles')) return;

        const style = document.createElement('style');
        style.id = 'sm-material-editor-professional-styles';
        style.textContent = `
            .node-mat-editor-container {
                --mat-bg: #2d2d2d;
                --mat-bg-deep: #252525;
                --mat-panel: #303030;
                --mat-panel-soft: #353535;
                --mat-header: #343434;
                --mat-border: #454545;
                --mat-border-soft: #3a3a3a;
                --mat-text: #e5e5e5;
                --mat-text-secondary: #a9a9a9;
                --mat-text-dim: #737373;
                --mat-hover: #3b3b3b;
                --mat-active: #484848;
                --mat-accent: #6d91c9;
                --mat-accent-soft: rgba(109,145,201,.18);
                --mat-warning: #d6a65d;
                --mat-danger: #c96b6b;
                width: 100%;
                height: 100%;
                min-height: 0;
                display: flex;
                flex-direction: column;
                background: var(--mat-bg);
                color: var(--mat-text);
                font-family: Inter, "Segoe UI", Arial, sans-serif;
                overflow: hidden;
            }

            .node-mat-editor-container * { box-sizing: border-box; }

            .material-node-dock-layout {
                flex: 1 1 0;
                min-height: 0;
                width: 100%;
                display: flex;
                overflow: hidden;
                background: var(--mat-bg);
                border-top: 1px solid #1f1f1f;
                border-bottom: 1px solid #1f1f1f;
            }

            .node-library-sidebar,
            .properties-sidebar {
                flex: 0 0 auto;
                min-width: 190px;
                background: var(--mat-panel);
                display: flex;
                flex-direction: column;
                min-height: 0;
                overflow: hidden;
            }

            .node-library-sidebar {
                border-right: 1px solid #202020;
            }

            .properties-sidebar {
                border-left: 1px solid #202020;
            }

            .sidebar-header {
                height: 32px;
                min-height: 32px;
                display: flex;
                align-items: center;
                padding: 0 10px;
                color: #d9d9d9;
                background: var(--mat-header);
                border-bottom: 1px solid #242424;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .08em;
                user-select: none;
            }

            .mat-section-header {
                min-height: 28px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 9px;
                background: #333;
                border-top: 1px solid #404040;
                border-bottom: 1px solid #252525;
                color: #bdbdbd;
                font-size: 9px;
                font-weight: 700;
                letter-spacing: .08em;
                text-transform: uppercase;
            }

            .search-box {
                padding: 8px;
                background: #2f2f2f;
                border-bottom: 1px solid #252525;
            }

            .search-input {
                width: 100%;
                height: 27px;
                padding: 0 9px;
                border: 1px solid #4a4a4a;
                outline: none;
                background: #272727;
                color: #ddd;
                font-size: 11px;
            }

            .search-input:focus {
                border-color: #6d7f98;
                box-shadow: 0 0 0 1px rgba(109,127,152,.22);
            }

            .node-categories {
                flex: 1 1 0;
                min-height: 0;
                overflow: auto;
                padding: 3px 0 8px;
            }

            .node-categories details {
                border-bottom: 1px solid rgba(0,0,0,.16);
            }

            .node-categories summary {
                background: #303030 !important;
                color: #999 !important;
                transition: background .12s ease, color .12s ease;
            }

            .node-categories summary:hover {
                background: #383838 !important;
                color: #d0d0d0 !important;
            }

            .node-item {
                min-height: 27px;
                transition: background .1s ease, color .1s ease;
            }

            .node-item:hover {
                background: #3a3a3a !important;
                color: #fff !important;
            }

            .sidebar-footer {
                padding: 8px;
                border-top: 1px solid #242424;
                background: #2c2c2c;
            }

            .max-btn,
            .toolbar-btn,
            .mat-tool-select {
                height: 25px;
                border: 0;
                background: #3a3a3a;
                color: #cfcfcf;
                font-size: 10px;
                line-height: 25px;
                padding: 0 8px;
                cursor: pointer;
                outline: none;
            }

            .max-btn:hover,
            .toolbar-btn:hover,
            .mat-tool-select:hover {
                background: #454545;
                color: #fff;
            }

            .toolbar-btn.active {
                background: #505050;
                color: #fff;
                box-shadow: inset 0 -2px 0 #7b8795;
            }

            .toolbar-btn.primary,
            .max-btn.primary {
                background: #4a5868;
                color: #fff;
            }

            .toolbar-btn.primary:hover,
            .max-btn.primary:hover {
                background: #58697b;
            }

            .full-width { width: 100%; }

            .panel-resizer.vertical {
                width: 4px;
                min-width: 4px;
                cursor: ew-resize;
                background: #232323;
                border-left: 1px solid #383838;
                border-right: 1px solid #181818;
            }

            .panel-resizer.vertical:hover {
                background: #4c4c4c;
            }

            .canvas-workspace {
                position: relative;
                flex: 1 1 0;
                min-width: 0;
                min-height: 0;
                overflow: hidden;
                background: #303030;
            }

            #mat-graph-canvas {
                position: absolute;
                left: 0;
                right: 0;
                top: 32px;
                bottom: 22px;
                display: block;
                width: 100%;
                height: calc(100% - 54px);
                background: #303030;
                outline: none;
            }

            .editor-toolbar-node {
                position: absolute;
                z-index: 20;
                left: 0;
                right: 0;
                top: 0;
                height: 32px;
                min-height: 32px;
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                align-items: center;
                gap: 8px;
                padding: 0 7px;
                background: #343434;
                border-bottom: 1px solid #202020;
                box-shadow: 0 1px 0 rgba(255,255,255,.025);
                user-select: none;
            }

            .toolbar-left,
            .toolbar-center,
            .toolbar-right {
                display: flex;
                align-items: center;
                gap: 3px;
                min-width: 0;
            }

            .toolbar-center { justify-content: center; }
            .toolbar-right { justify-content: flex-end; }

            .mat-toolbar-divider {
                width: 1px;
                height: 18px;
                background: #202020;
                margin: 0 3px;
            }

            .zoom-indicator,
            .object-indicator,
            .mat-status-text {
                font-size: 10px;
                color: #999;
                white-space: nowrap;
            }

            .zoom-indicator {
                min-width: 42px;
                text-align: center;
                font-variant-numeric: tabular-nums;
            }

            .toolbar-hint {
                color: #686868 !important;
            }

            .mat-toggle {
                height: 25px;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 0 7px;
                color: #aaa;
                background: #333;
                font-size: 10px;
                cursor: pointer;
                user-select: none;
            }

            .mat-toggle:hover { background: #3d3d3d; color: #ddd; }
            .mat-toggle input { margin: 0; accent-color: #7b8795; }

            .mat-graph-statusbar {
                position: absolute;
                z-index: 18;
                left: 0;
                right: 0;
                bottom: 0;
                height: 22px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 8px;
                background: #303030;
                border-top: 1px solid #222;
                color: #777;
                font-size: 9px;
                user-select: none;
            }

            .mat-status-cluster {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
            }

            #mat-minimap {
                position: absolute;
                z-index: 15;
                right: 10px;
                bottom: 32px;
                width: 172px;
                height: 108px;
                background: rgba(40,40,40,.94);
                border: 1px solid #4a4a4a;
                box-shadow: 0 5px 16px rgba(0,0,0,.28);
                pointer-events: none;
            }

            .mat-preview-header {
                height: 27px;
                min-height: 27px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 7px;
                background: #333;
                border-bottom: 1px solid #242424;
                color: #aaa;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: .06em;
            }

            .mat-preview-controls {
                display: flex;
                align-items: center;
                gap: 3px;
            }

            .mat-preview-controls select,
            .mat-preview-controls button {
                height: 21px;
                border: 0;
                background: #404040;
                color: #bbb;
                font-size: 9px;
                padding: 0 6px;
                outline: none;
                cursor: pointer;
            }

            #mat-preview-viewport {
                position: relative;
                width: 100%;
                height: 190px;
                background: #353535 !important;
                border-bottom: 1px solid #242424;
                overflow: hidden;
            }

            #mat-preview-viewport canvas {
                width: 100% !important;
                height: 100% !important;
                display: block;
            }

            .properties-panel {
                flex: 1 1 0;
                min-height: 0;
                overflow: auto;
                background: #303030;
            }

            .scrollbar-custom {
                scrollbar-width: thin;
                scrollbar-color: #575757 #2b2b2b;
            }

            .scrollbar-custom::-webkit-scrollbar { width: 8px; height: 8px; }
            .scrollbar-custom::-webkit-scrollbar-track { background: #2b2b2b; }
            .scrollbar-custom::-webkit-scrollbar-thumb { background: #555; border: 2px solid #2b2b2b; }
            .scrollbar-custom::-webkit-scrollbar-thumb:hover { background: #666; }

            .mat-context-menu {
                background: #303030 !important;
                border-color: #505050 !important;
                border-radius: 0 !important;
                box-shadow: 0 8px 24px rgba(0,0,0,.38) !important;
            }

            .canvas-workspace.grab-mode #mat-graph-canvas { cursor: grab; }
            .canvas-workspace.panning #mat-graph-canvas { cursor: grabbing; }
        `;
        document.head.appendChild(style);
    }

    setupUI() {
        this.container.classList.add('node-mat-editor-container');
        this.container.innerHTML = `
        <div id="material-node-panel" class="editor-container-nodes material-node-dock-layout">
            <div class="node-library-sidebar" style="width:${this.panelWidths.library}px">
                <div class="sidebar-header">NODE LIBRARY</div>
                <div class="search-box">
                    <input type="text" id="node-search" placeholder="Search nodes…" class="search-input" autocomplete="off">
                </div>
                <div class="node-categories scrollbar-custom" id="node-library-list">
                    ${this._buildLibraryHTML()}
                </div>
                <div class="sidebar-footer">
                    <button class="max-btn primary full-width" onclick="materialNodeEditor.compileAndApply()">Apply Material</button>
                </div>
            </div>

            <div class="panel-resizer vertical" data-resize="library"></div>

            <div class="canvas-workspace">
                <div class="editor-toolbar-node">
                    <div class="toolbar-left">
                        <button class="toolbar-btn" title="Frame all nodes (Home)" onclick="materialNodeEditor.fitToView()">Frame All</button>
                        <button class="toolbar-btn" title="Center view at 100%" onclick="materialNodeEditor.resetView()">Reset View</button>
                        <div class="mat-toolbar-divider"></div>
                        <button class="toolbar-btn" title="Group selected nodes (Ctrl+G)" onclick="materialNodeEditor.createGroupFromSelection()">Group</button>
                        <button class="toolbar-btn" title="Delete all graph nodes except output" onclick="materialNodeEditor.clearGraph()">Clear</button>
                        <div class="mat-toolbar-divider"></div>
                        <label class="mat-toggle" title="Show or hide the graph grid">
                            <input id="mat-grid-toggle" type="checkbox" ${this.showGrid ? 'checked' : ''}
                                onchange="materialNodeEditor.setGridVisible(this.checked)"> Grid
                        </label>
                        <label class="mat-toggle" title="Snap moved nodes to the graph grid">
                            <input id="mat-snap-toggle" type="checkbox" ${this.snapToGrid ? 'checked' : ''}
                                onchange="materialNodeEditor.setSnapToGrid(this.checked)"> Snap
                        </label>
                    </div>

                    <div class="toolbar-center">
                        <button class="toolbar-btn" title="Zoom out" onclick="materialNodeEditor.zoomBy(0.9)">−</button>
                        <span id="zoom-val" class="zoom-indicator">100%</span>
                        <button class="toolbar-btn" title="Zoom in" onclick="materialNodeEditor.zoomBy(1.1)">+</button>
                        <span class="toolbar-hint">Space + Drag: Pan · Wheel: Zoom · RMB: Add/Search</span>
                    </div>

                    <div class="toolbar-right">
                        <label class="mat-toggle" title="Compile graph changes automatically">
                            <input type="checkbox" ${this.autoCompile ? 'checked' : ''}
                                onchange="materialNodeEditor.autoCompile=this.checked"> Auto Compile
                        </label>
                        <button class="toolbar-btn primary" onclick="materialNodeEditor.compileAndApply()">Apply</button>
                        <button class="toolbar-btn" onclick="materialNodeEditor.saveToAssets()">Save Asset</button>
                        <span id="selected-obj" class="object-indicator">No Object</span>
                    </div>
                </div>

                <canvas id="mat-graph-canvas" tabindex="0"></canvas>
                <canvas id="mat-minimap" width="344" height="216"></canvas>

                <div class="mat-graph-statusbar">
                    <div class="mat-status-cluster">
                        <span id="mat-status-graph">0 Nodes · 0 Links</span>
                        <span id="mat-status-selection">Nothing Selected</span>
                    </div>
                    <div class="mat-status-cluster">
                        <span id="mat-status-grid">Grid 40 · Snap Off</span>
                        <span id="mat-status-compile">Auto Compile</span>
                    </div>
                </div>
            </div>

            <div class="panel-resizer vertical" data-resize="properties"></div>

            <div class="properties-sidebar" style="width:${this.panelWidths.properties}px">
                <div class="sidebar-header">MATERIAL DETAILS</div>
                <div class="mat-preview-header">
                    <span>Preview</span>
                    <div class="mat-preview-controls">
                        <select id="mat-preview-shape" onchange="materialNodeEditor.setPreviewShape(this.value)">
                            <option value="sphere" selected>Sphere</option>
                            <option value="cube">Cube</option>
                            <option value="plane">Plane</option>
                            <option value="cylinder">Cylinder</option>
                        </select>
                        <button id="mat-preview-rotate-btn" class="active"
                            onclick="materialNodeEditor.setPreviewAutoRotate(!materialNodeEditor.previewAutoRotate)"
                            title="Toggle preview rotation">Rotate</button>
                    </div>
                </div>
                <div id="mat-preview-viewport"></div>
                <div class="mat-section-header">
                    <span>Node Properties</span>
                    <span id="mat-property-node-type"></span>
                </div>
                <div class="properties-panel scrollbar-custom" id="properties-panel">
                    <div class="placeholder" style="color:#686868;padding:16px;font-size:11px;">Select a node to edit its properties.</div>
                </div>
            </div>
        </div>

        <div id="mat-context-menu" class="mat-context-menu"
            style="display:none;position:fixed;z-index:9999;min-width:190px;"></div>

        <input id="mat-inline-color-picker" type="color"
            style="position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;">`;

        this.contextMenuEl = document.getElementById('mat-context-menu');

        const searchBox = document.getElementById('node-search');
        if (searchBox) {
            searchBox.addEventListener('input', e => {
                const q = e.target.value.toLowerCase();
                document.querySelectorAll('.node-item').forEach(btn => {
                    btn.style.display = btn.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
                });
                document.querySelectorAll('.node-categories details').forEach(d => {
                    const any = [...d.querySelectorAll('.node-item')].some(b => b.style.display !== 'none');
                    d.style.display = any ? '' : 'none';
                });
            });
        }
        this.updateEditorStatus();

        const colorPicker = document.getElementById('mat-inline-color-picker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                const target = this.activeInlineControl;
                if (!target || target.kind !== 'color') return;
                const node = this.nodes.find(n => n.id === target.nodeId);
                if (!node) return;
                node[target.inputName] = e.target.value;
                this.scheduleCompile();
                if (this.selectedNode?.id === node.id) this.updatePropertiesPanel();
            });
            colorPicker.addEventListener('change', () => {
                if (this.activeInlineControl?.kind === 'color') this.activeInlineControl = null;
            });
        }
    }

    setGridVisible(enabled) {
        this.showGrid = !!enabled;
        const input = document.getElementById('mat-grid-toggle');
        if (input) input.checked = this.showGrid;
        this.updateEditorStatus();
    }

    setSnapToGrid(enabled) {
        this.snapToGrid = !!enabled;
        const input = document.getElementById('mat-snap-toggle');
        if (input) input.checked = this.snapToGrid;
        this.updateEditorStatus();
    }

    setPreviewShape(shape = 'sphere') {
        this.previewShape = ['sphere', 'cube', 'plane', 'cylinder'].includes(shape) ? shape : 'sphere';
        const select = document.getElementById('mat-preview-shape');
        if (select && select.value !== this.previewShape) select.value = this.previewShape;
        this.updatePreviewObject();
    }

    setPreviewAutoRotate(enabled) {
        this.previewAutoRotate = !!enabled;
        const btn = document.getElementById('mat-preview-rotate-btn');
        if (btn) btn.classList.toggle('active', this.previewAutoRotate);
    }

    zoomBy(factor = 1) {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const cx = rect.width * 0.5;
        const cy = rect.height * 0.5;
        const worldX = (cx - this.panX) / this.zoom;
        const worldY = (cy - this.panY) / this.zoom;
        const next = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
        this.zoom = next;
        this.panX = cx - worldX * next;
        this.panY = cy - worldY * next;
        const label = document.getElementById('zoom-val');
        if (label) label.textContent = Math.round(this.zoom * 100) + '%';
        this.updateEditorStatus();
    }

    resetView() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        const label = document.getElementById('zoom-val');
        if (label) label.textContent = '100%';
        this.updateEditorStatus();
    }

    _snapNodesToGrid(nodes = []) {
        if (!this.snapToGrid) return;
        const step = Math.max(5, this.gridSize * 0.5);
        nodes.forEach(node => {
            node.x = Math.round(node.x / step) * step;
            node.y = Math.round(node.y / step) * step;
        });
    }

    updateEditorStatus() {
        const graphEl = document.getElementById('mat-status-graph');
        const selectionEl = document.getElementById('mat-status-selection');
        const gridEl = document.getElementById('mat-status-grid');
        const compileEl = document.getElementById('mat-status-compile');
        const propType = document.getElementById('mat-property-node-type');

        if (graphEl) {
            graphEl.textContent = `${this.nodes.length} Node${this.nodes.length === 1 ? '' : 's'} · ${this.connections.length} Link${this.connections.length === 1 ? '' : 's'}`;
        }

        if (selectionEl) {
            if (this.selectedGroup && !this.selectedNodes.length) {
                selectionEl.textContent = `Group: ${this.selectedGroup.title || this.selectedGroup.id}`;
            } else if (this.selectedNodes.length === 1) {
                selectionEl.textContent = this.selectedNodes[0].schema?.displayName || this.selectedNodes[0].type;
            } else if (this.selectedNodes.length > 1) {
                selectionEl.textContent = `${this.selectedNodes.length} Nodes Selected`;
            } else {
                selectionEl.textContent = 'Nothing Selected';
            }
        }

        if (gridEl) {
            gridEl.textContent = `Grid ${this.gridSize} · Snap ${this.snapToGrid ? 'On' : 'Off'}`;
        }

        if (compileEl) {
            compileEl.textContent = this.autoCompile ? 'Auto Compile' : 'Manual Compile';
        }

        if (propType) {
            propType.textContent = this.selectedNode?.schema?.category || '';
        }
    }

    drawMinimap() {
        const mini = document.getElementById('mat-minimap');
        if (!mini) return;
        mini.style.display = this.showMinimap ? 'block' : 'none';
        if (!this.showMinimap) return;

        const ctx = mini.getContext('2d');
        if (!ctx) return;

        const width = mini.width;
        const height = mini.height;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#2f2f2f';
        ctx.fillRect(0, 0, width, height);

        if (!this.nodes.length) {
            ctx.strokeStyle = '#505050';
            ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.w);
            maxY = Math.max(maxY, n.y + n.h);
        });

        const pad = 18;
        const graphW = Math.max(1, maxX - minX);
        const graphH = Math.max(1, maxY - minY);
        const scale = Math.min((width - pad * 2) / graphW, (height - pad * 2) / graphH);

        const tx = pad - minX * scale + Math.max(0, (width - pad * 2 - graphW * scale) * 0.5);
        const ty = pad - minY * scale + Math.max(0, (height - pad * 2 - graphH * scale) * 0.5);

        this.connections.forEach(c => {
            const a = this.nodes.find(n => n.id === c.fromId);
            const b = this.nodes.find(n => n.id === c.toId);
            if (!a || !b) return;
            const x1 = tx + (a.x + a.w) * scale;
            const y1 = ty + (a.y + 20) * scale;
            const x2 = tx + b.x * scale;
            const y2 = ty + (b.y + 20) * scale;
            ctx.strokeStyle = '#5c5c5c';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });

        this.nodes.forEach(n => {
            const selected = this.selectedNodes.includes(n) || this.selectedNode?.id === n.id;
            ctx.fillStyle = selected ? '#8a8a8a' : '#5c5c5c';
            ctx.fillRect(
                tx + n.x * scale,
                ty + n.y * scale,
                Math.max(2, n.w * scale),
                Math.max(2, n.h * scale)
            );
        });

        // Current viewport rectangle.
        const viewLeft = -this.panX / this.zoom;
        const viewTop = -this.panY / this.zoom;
        const viewW = (this.canvas?.clientWidth || 1) / this.zoom;
        const viewH = (this.canvas?.clientHeight || 1) / this.zoom;

        ctx.strokeStyle = '#b5b5b5';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            tx + viewLeft * scale,
            ty + viewTop * scale,
            Math.max(2, viewW * scale),
            Math.max(2, viewH * scale)
        );

        ctx.strokeStyle = '#505050';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    }

    _buildLibraryHTML() {
        const categories = {};
        Object.entries(this.nodeSchemas).forEach(([id, schema]) => {
            const cat = schema.category || 'Misc';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push({ id, schema });
        });

        const catIcons = {
            Surface: '🟢', Color: '🔵', Value: '🔴', Math: '🟡', Input: '🔶',
            Texture: '🟣', Procedural: '🟠', Patterns: '🟤', Fluid: '🔵',
            Utility: '⚪', Misc: '⚪'
        };

        return Object.entries(categories).map(([cat, nodes]) => `
            <details open>
                <summary style="font-size:10px;color:#888;padding:6px 8px;cursor:pointer;user-select:none;letter-spacing:0.08em;">
                    ${catIcons[cat] || '⚪'} ${cat.toUpperCase()}
                </summary>
                ${nodes.map(({ id, schema }) => `
                    <button class="node-item" onclick="materialNodeEditor.spawnNodeAtCenter('${id}')"
                        style="display:flex;align-items:center;gap:6px;width:100%;padding:5px 12px;background:none;border:none;color:#bbb;cursor:pointer;font-size:11px;text-align:left;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${schema.color};flex-shrink:0;"></span>
                        ${schema.displayName}
                    </button>
                `).join('')}
            </details>
        `).join('');
    }

    spawnNodeAtCenter(type) {
        const cx = (this.canvas.width / 2 - this.panX) / this.zoom;
        const cy = (this.canvas.height / 2 - this.panY) / this.zoom;
        const node = this.spawnNode(type, null, cx + (Math.random() * 40 - 20), cy + (Math.random() * 40 - 20));
        if (node) this.setSelectedNodes([node]);
    }

    setupPanelResizers() {
        const layout = this.container.querySelector('.material-node-dock-layout');
        if (!layout) return;
        const libSide = layout.querySelector('.node-library-sidebar');
        const propSide = layout.querySelector('.properties-sidebar');

        layout.querySelectorAll('.panel-resizer.vertical').forEach(r => {
            r.addEventListener('mousedown', e => {
                e.preventDefault();
                this.isResizingPanel = r.dataset.resize;
                document.body.style.cursor = 'ew-resize';
            });
        });
        window.addEventListener('mousemove', e => {
            if (!this.isResizingPanel) return;
            const bounds = layout.getBoundingClientRect();
            if (this.isResizingPanel === 'library') {
                const w = Math.max(200, Math.min(400, e.clientX - bounds.left));
                this.panelWidths.library = w;
                if (libSide) libSide.style.width = `${w}px`;
            }
            if (this.isResizingPanel === 'properties') {
                const w = Math.max(220, Math.min(400, bounds.right - e.clientX));
                this.panelWidths.properties = w;
                if (propSide) propSide.style.width = `${w}px`;
            }
            this.resize();
        });
        window.addEventListener('mouseup', () => {
            if (!this.isResizingPanel) return;
            this.isResizingPanel = false;
            document.body.style.cursor = '';
        });
    }

    setupPreviewViewport() {
        const holder = document.getElementById('mat-preview-viewport');
        if (!holder || typeof THREE === 'undefined') return;
        this.previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.previewRenderer.setClearColor(0x353535, 1);
        try { this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace; }
        catch (_) { try { this.previewRenderer.outputEncoding = THREE.sRGBEncoding; } catch (_) { } }
        this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        holder.innerHTML = ''; holder.appendChild(this.previewRenderer.domElement);

        this.previewScene = new THREE.Scene();
        this.previewScene.background = new THREE.Color(0x353535);
        this.previewCamera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 100);
        this.previewCamera.position.set(2, 1.2, 2.4);

        const key = new THREE.DirectionalLight(0xffffff, 2.0);
        key.position.set(4, 6, 5);

        const rim = new THREE.DirectionalLight(0xc9d0da, 0.75);
        rim.position.set(-4, 3, -3);

        const hemi = new THREE.HemisphereLight(0xe7e7e7, 0x303030, 0.8);
        const amb = new THREE.AmbientLight(0xffffff, 0.10);

        const previewFloor = new THREE.Mesh(
            new THREE.CircleGeometry(2.4, 64),
            new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 1, metalness: 0 })
        );
        previewFloor.name = 'MaterialPreviewFloor';
        previewFloor.rotation.x = -Math.PI / 2;
        previewFloor.position.y = -0.92;
        previewFloor.receiveShadow = true;

        this.previewRenderer.shadowMap.enabled = true;
        this.previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        key.castShadow = true;

        this.previewScene.add(key, rim, hemi, amb, previewFloor);

        this.updatePreviewObject();
        this.resizePreviewViewport();

        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => this.resizePreviewViewport()).observe(holder);
        }

        const animate = () => {
            if (!this.previewRenderer) return;
            requestAnimationFrame(animate);
            if (this.previewMesh && this.previewAutoRotate) this.previewMesh.rotation.y += 0.006;
            this.previewRenderer.render(this.previewScene, this.previewCamera);
        };
        animate();
    }

    resizePreviewViewport() {
        const holder = document.getElementById('mat-preview-viewport');
        if (!holder || !this.previewRenderer || !this.previewCamera) return;
        const w = holder.clientWidth || 240;
        const h = holder.clientHeight || 180;
        this.previewRenderer.setSize(w, h, false);
        this.previewCamera.aspect = w / h;
        this.previewCamera.updateProjectionMatrix();
    }

    updatePreviewObject() {
        if (!this.previewScene) return;

        if (this.previewMesh) {
            this.previewScene.remove(this.previewMesh);
            this.previewMesh.geometry?.dispose?.();
            this.previewMesh.material?.dispose?.();
            this.previewMesh = null;
        }

        const sourceMaterial =
            this.lastAppliedMaterial ||
            (window.selectedObject?.isMesh ? window.selectedObject.material : null);

        const sourceMat =
            sourceMaterial?.clone?.() ||
            new THREE.MeshPhysicalMaterial({
                color: 0xaab0b7,
                roughness: 0.42,
                metalness: 0.05,
                clearcoat: 0.05
            });

        if (sourceMaterial?.onBeforeCompile) {
            sourceMat.onBeforeCompile = sourceMaterial.onBeforeCompile;
            if (sourceMaterial.customProgramCacheKey) {
                sourceMat.customProgramCacheKey = sourceMaterial.customProgramCacheKey.bind(sourceMaterial);
            }
            sourceMat.needsUpdate = true;
        }

        let geometry;
        switch (this.previewShape) {
            case 'cube':
                geometry = new THREE.BoxGeometry(1.35, 1.35, 1.35, 4, 4, 4);
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(1.75, 1.75, 32, 32);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.68, 0.68, 1.45, 64, 16);
                break;
            case 'sphere':
            default:
                geometry = new THREE.SphereGeometry(0.78, 64, 48);
                break;
        }

        const mesh = new THREE.Mesh(geometry, sourceMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (this.previewShape === 'plane') {
            mesh.rotation.x = -0.12;
            mesh.position.y = 0.05;
        }

        this.previewMesh = mesh;
        this.previewScene.add(mesh);

        const sz = 2.0;
        this.previewCamera.position.set(sz * 1.15, sz * 0.72, sz * 1.35);
        this.previewCamera.lookAt(0, -0.05, 0);

        const select = document.getElementById('mat-preview-shape');
        if (select) select.value = this.previewShape;
        this.setPreviewAutoRotate(this.previewAutoRotate);
    }

    // =========================================================================
    // PROPERTIES PANEL
    // =========================================================================
    updatePropertiesPanel() {
        const panel = document.getElementById('properties-panel');
        if (!panel) return;

        if (this.selectedGroup && !this.selectedNode) {
            panel.innerHTML = `
                <div style="padding:12px;border-bottom:1px solid #131313;">
                    <div style="font-weight:700;color:#c9a25c;font-size:12px;">Comment Group</div>
                    <div style="font-size:9px;color:#555;margin-top:2px;">${this.selectedGroup.id}</div>
                </div>
                <div style="padding:12px;">
                    <div style="margin-bottom:10px;">
                        <label style="display:block;font-size:10px;color:#777;margin-bottom:4px;">Title</label>
                        <input type="text" value="${this.selectedGroup.title || ''}"
                            onchange="materialNodeEditor.selectedGroup.title=this.value"
                            style="width:100%;background:#101010;border:1px solid #282828;color:#ddd;padding:7px 8px;font-size:11px;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:10px;">
                        <label style="display:block;font-size:10px;color:#777;margin-bottom:4px;">Frame Color</label>
                        <input type="color" value="${this.groupColorToHex(this.selectedGroup.stroke || '#8a6736')}"
                            onchange="materialNodeEditor.updateGroupColor(this.value)"
                            style="width:100%;height:28px;background:#101010;border:1px solid #282828;padding:2px;box-sizing:border-box;">
                    </div>
                    <button onclick="materialNodeEditor.groups = materialNodeEditor.groups.filter(g => g.id !== '${this.selectedGroup.id}'); materialNodeEditor.selectedGroup = null; materialNodeEditor.updatePropertiesPanel();"
                        style="width:100%;padding:8px;background:#241111;color:#d98d7d;border:1px solid #3a1f1f;cursor:pointer;font-size:11px;">
                        Delete Group
                    </button>
                </div>`;
            return;
        }

        if (!this.selectedNode) {
            if (this.selectedNodes.length > 1) {
                panel.innerHTML = `<div style="padding:12px;font-size:11px;color:#888;">${this.selectedNodes.length} nodes selected<br><br>
                    <button onclick="materialNodeEditor.createGroupFromSelection()" style="width:100%;padding:6px;background:#1a2a3a;color:#7ac;border:1px solid #2a4a6a;cursor:pointer;border-radius:3px;font-size:11px;">Create Group</button></div>`;
            } else {
                panel.innerHTML = `<div style="color:#444;padding:16px;font-size:11px;">Select a node to edit</div>`;
            }
            return;
        }

        const node = this.selectedNode;
        const schema = node.schema;
        let html = `
            <div style="padding:10px 12px;border-bottom:1px solid #111;">
                <div style="font-weight:bold;color:${node.color};font-size:12px;">${schema.displayName}</div>
                <div style="font-size:9px;color:#444;margin-top:2px;">${node.id}</div>
            </div>
            <div style="padding:10px 12px;">`;

        // Group inputs by group name
        const grouped = new Map();
        (node.inputs || []).forEach(inp => {
            const g = inp.group || '—';
            if (!grouped.has(g)) grouped.set(g, []);
            grouped.get(g).push(inp);
        });

        grouped.forEach((inputs, groupName) => {
            html += `<details open style="margin-bottom:6px;"><summary style="font-size:10px;color:#666;cursor:pointer;padding:4px 0;letter-spacing:0.06em;">${groupName.toUpperCase()}</summary>`;
            inputs.forEach(inp => {
                const val = node[inp.name] !== undefined ? node[inp.name] : (inp.default ?? 0);
                const isConnected = this.connections.some(c => c.toId === node.id && c.toSocket === node.inputs.indexOf(inp));

                if (isConnected) {
                    html += `<div style="padding:4px 0;display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:#555;flex:1;">${inp.name}</span><span style="font-size:9px;color:#2ecc71;">● linked</span></div>`;
                } else if (inp.type === 'float') {
                    const v = typeof val === 'number' ? val : parseFloat(val) || 0;
                    html += `<div style="padding:3px 0;"><label style="font-size:10px;color:#777;display:block;margin-bottom:2px;">${inp.name}</label>
                        <div style="display:flex;gap:4px;align-items:center;">
                            <input type="range" min="${inp.min ?? 0}" max="${inp.max ?? 1}" step="${inp.step ?? 0.01}" value="${v}"
                                oninput="materialNodeEditor._setPropFloat('${node.id}','${inp.name}',this.value);this.nextElementSibling.value=parseFloat(this.value).toFixed(3);"
                                style="flex:1;accent-color:${node.color};">
                            <input type="number" min="${inp.min ?? 0}" max="${inp.max ?? 1}" step="${inp.step ?? 0.01}" value="${v.toFixed(3)}"
                                onchange="materialNodeEditor._setPropFloat('${node.id}','${inp.name}',this.value);"
                                style="width:52px;background:#111;border:1px solid #333;color:#ccc;font-size:10px;padding:2px 4px;border-radius:2px;">
                        </div></div>`;
                } else if (inp.type === 'color') {
                    const cv = typeof val === 'string' && val.startsWith('#') ? val : (inp.default || '#ffffff');
                    html += `<div style="padding:3px 0;display:flex;align-items:center;gap:8px;">
                        <label style="font-size:10px;color:#777;flex:1;">${inp.name}</label>
                        <input type="color" value="${cv}" onchange="materialNodeEditor._setPropVal('${node.id}','${inp.name}',this.value)"
                            style="width:36px;height:24px;border:none;background:none;cursor:pointer;padding:0;"></div>`;
                } else if (inp.type === 'vector2' || inp.type === 'vec2') {
                    const arr = Array.isArray(val) ? val : [0, 0];
                    html += `<div style="padding:3px 0;"><label style="font-size:10px;color:#777;display:block;margin-bottom:2px;">${inp.name}</label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                            <input type="number" step="0.01" value="${(+arr[0]).toFixed(3)}"
                                onchange="materialNodeEditor._setVec2('${node.id}','${inp.name}',0,this.value)"
                                style="background:#111;border:1px solid #333;color:#ccc;font-size:10px;padding:2px 4px;border-radius:2px;">
                            <input type="number" step="0.01" value="${(+arr[1]).toFixed(3)}"
                                onchange="materialNodeEditor._setVec2('${node.id}','${inp.name}',1,this.value)"
                                style="background:#111;border:1px solid #333;color:#ccc;font-size:10px;padding:2px 4px;border-radius:2px;">
                        </div></div>`;
                }
            });
            html += `</details>`;
        });

        // Widgets
        if (schema.widget === 'color') {
            html += `<div style="padding:4px 0;"><label style="font-size:10px;color:#777;">Color</label><br>
                <input type="color" value="${node.value || '#ffffff'}" onchange="materialNodeEditor._setNodeVal('${node.id}',this.value)"
                    style="width:100%;height:32px;border:none;background:none;cursor:pointer;padding:0;margin-top:4px;"></div>`;
        }
        if (schema.widget === 'slider') {
            html += `<div style="padding:4px 0;"><label style="font-size:10px;color:#777;">Value: ${parseFloat(node.value ?? 0.5).toFixed(3)}</label>
                <input type="range" min="${schema.min ?? 0}" max="${schema.max ?? 1}" step="${schema.step ?? 0.01}"
                    value="${node.value ?? 0.5}" oninput="materialNodeEditor._setNodeVal('${node.id}',this.value);this.previousElementSibling.textContent='Value: '+parseFloat(this.value).toFixed(3);"
                    style="width:100%;accent-color:${node.color};margin-top:4px;"></div>`;
        }
        if (schema.widget === 'texture_upload' || node.schema.widget === 'texture_upload') {
            html += this._textureWidgetHTML(node);
        }

        html += `
            <div style="margin-top:14px;padding-top:10px;border-top:1px solid #111;display:flex;gap:6px;flex-wrap:wrap;">
                <button onclick="materialNodeEditor.duplicateNode('${node.id}')"
                    style="flex:1;padding:6px;background:#162030;color:#6af;border:1px solid #1a3a5a;cursor:pointer;border-radius:3px;font-size:10px;">Duplicate</button>
                <button onclick="materialNodeEditor.deleteNode('${node.id}')"
                    style="flex:1;padding:6px;background:#200f0f;color:#f66;border:1px solid #4a1a1a;cursor:pointer;border-radius:3px;font-size:10px;">Delete</button>
            </div>
        </div>`;

        panel.innerHTML = html;

        // Attach file inputs after render
        setTimeout(() => {
            const fileInput = panel.querySelector(`.tex-file-input[data-node="${node.id}"]`);
            if (fileInput) {
                fileInput.addEventListener('change', e => this._handleTextureUpload(e, node.id));
            }
        }, 50);
    }

    _textureWidgetHTML(node) {
        const thumb = node.textureData
            ? `<img src="${node.textureData}" style="width:100%;height:120px;object-fit:cover;border-radius:3px;">`
            : `<div style="width:100%;height:80px;background:#111;border:2px dashed #333;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#444;font-size:11px;">Drop / Upload</div>`;
        return `
            <div style="padding:4px 0;">
                <label style="font-size:10px;color:#777;">Texture</label>
                <div style="margin-top:4px;">${thumb}</div>
                <input type="file" accept="image/*" class="tex-file-input" data-node="${node.id}"
                    style="width:100%;margin-top:6px;background:#111;border:1px solid #333;color:#aaa;font-size:10px;padding:3px;border-radius:3px;cursor:pointer;">
                <input type="text" placeholder="Paste URL…" value="${node.textureUrl || ''}"
                    onchange="materialNodeEditor._loadTextureFromURL('${node.id}',this.value)"
                    style="width:100%;margin-top:4px;background:#111;border:1px solid #333;color:#aaa;font-size:10px;padding:3px 6px;border-radius:3px;box-sizing:border-box;">
            </div>`;
    }

    _handleTextureUpload(e, nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        const file = e.target.files?.[0];
        if (!node || !file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            node.textureData = ev.target.result;
            const loader = new THREE.TextureLoader();
            loader.load(ev.target.result, tex => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                node.texture = tex;
                this.log(`Texture loaded: ${file.name}`, 'success');
                this.scheduleCompile();
                this.updatePropertiesPanel();
            });
        };
        reader.readAsDataURL(file);
    }

    _loadTextureFromURL(nodeId, url) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node || !url) return;
        node.textureUrl = url;
        const loader = new THREE.TextureLoader();
        loader.load(url, tex => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            node.texture = tex;
            node.textureData = url;
            this.log('Texture loaded from URL', 'success');
            this.scheduleCompile();
            this.updatePropertiesPanel();
        }, undefined, () => this.log('Failed to load URL', 'error'));
    }

    _setPropFloat(nodeId, name, val) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) { node[name] = parseFloat(val) || 0; this.scheduleCompile(); }
    }
    _setPropVal(nodeId, name, val) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) { node[name] = val; this.scheduleCompile(); }
    }
    _setNodeVal(nodeId, val) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) { node.value = isNaN(val) ? val : parseFloat(val); this.scheduleCompile(); this.updatePropertiesPanel(); }
    }
    _setVec2(nodeId, name, axis, val) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;
        let vec = Array.isArray(node[name]) ? [...node[name]] : [0, 0];
        vec[axis] = parseFloat(val) || 0;
        node[name] = vec;
        this.scheduleCompile();
    }

    groupColorToHex(value) {
        if (!value) return '#8a6736';
        if (value.startsWith('#')) return value;
        const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!match) return '#8a6736';
        return '#' + match.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('');
    }

    hexToRgba(hex, alpha = 0.16) {
        const normalized = (hex || '#8a6736').replace('#', '');
        const full = normalized.length === 3 ? normalized.split('').map(ch => ch + ch).join('') : normalized;
        const int = parseInt(full, 16);
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    updateGroupColor(hex) {
        if (!this.selectedGroup) return;
        this.selectedGroup.stroke = hex;
        this.selectedGroup.color = this.hexToRgba(hex, 0.16);
    }

    _getInlineControlRects(node, inp, py) {
        const right = node.x + node.w - 10;
        if (inp.type === 'float') {
            return {
                kind: 'float',
                trackX: node.x + 96,
                trackY: py - 7,
                trackW: Math.max(52, node.w - 118),
                trackH: 12,
                valueW: 46
            };
        }
        if (inp.type === 'color') {
            return {
                kind: 'color',
                chipX: right - 64,
                chipY: py - 8,
                chipW: 54,
                chipH: 14
            };
        }
        if (inp.type === 'vector2' || inp.type === 'vec2') {
            return {
                kind: 'vec2',
                xBox: { x: right - 70, y: py - 8, w: 28, h: 14, axis: 0 },
                yBox: { x: right - 38, y: py - 8, w: 28, h: 14, axis: 1 }
            };
        }
        return null;
    }

    _getInputControlAt(node, mx, my) {
        if (!node?.expanded) return null;
        let py = node.y + 36;
        const seen = new Set();
        for (let i = 0; i < node.inputs.length; i++) {
            const inp = node.inputs[i];
            if (inp.group) {
                if (!seen.has(inp.group)) {
                    seen.add(inp.group);
                    py += 22;
                }
                if (!node.groupStates[inp.group]) continue;
            }

            const isConnected = this.connections.some(c => c.toId === node.id && c.toSocket === i);
            if (!isConnected) {
                const rects = this._getInlineControlRects(node, inp, py);
                if (rects?.kind === 'float') {
                    if (mx >= rects.trackX && mx <= rects.trackX + rects.trackW && my >= rects.trackY && my <= rects.trackY + rects.trackH) {
                        return { kind: 'float', nodeId: node.id, inputName: inp.name, inputIndex: i, min: inp.min ?? 0, max: inp.max ?? 1, step: inp.step ?? 0.01, rects };
                    }
                }
                if (rects?.kind === 'color') {
                    if (mx >= rects.chipX && mx <= rects.chipX + rects.chipW && my >= rects.chipY && my <= rects.chipY + rects.chipH) {
                        return { kind: 'color', nodeId: node.id, inputName: inp.name, inputIndex: i, rects };
                    }
                }
                if (rects?.kind === 'vec2') {
                    for (const box of [rects.xBox, rects.yBox]) {
                        if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
                            return { kind: 'vec2', nodeId: node.id, inputName: inp.name, inputIndex: i, axis: box.axis, rects };
                        }
                    }
                }
            }
            py += 22;
        }
        return null;
    }

    _beginInlineControl(control, clientX, clientY) {
        const node = this.nodes.find(n => n.id === control.nodeId);
        if (!node) return false;
        this.setSelectedNodes([node]);
        if (control.kind === 'color') {
            this.activeInlineControl = control;
            const picker = document.getElementById('mat-inline-color-picker');
            if (picker) {
                picker.value = node[control.inputName] || '#ffffff';
                picker.click();
            }
            return true;
        }

        const currentValue = node[control.inputName] !== undefined ? node[control.inputName] : node.inputs[control.inputIndex]?.default;
        this.activeInlineControl = {
            ...control,
            startClientX: clientX,
            startClientY: clientY,
            startValue: Array.isArray(currentValue) ? [...currentValue] : (+currentValue || 0)
        };
        this._updateInlineControl(clientX, clientY);
        return true;
    }

    _updateInlineControl(clientX, clientY) {
        if (!this.activeInlineControl || this.activeInlineControl.kind === 'color') return;
        const node = this.nodes.find(n => n.id === this.activeInlineControl.nodeId);
        if (!node) return;

        if (this.activeInlineControl.kind === 'float') {
            const rect = this.canvas.getBoundingClientRect();
            const worldX = (clientX - rect.left - this.panX) / this.zoom;
            const local = Math.max(0, Math.min(this.activeInlineControl.rects.trackW, worldX - this.activeInlineControl.rects.trackX));
            const ratio = local / Math.max(this.activeInlineControl.rects.trackW, 1);
            let next = this.activeInlineControl.min + ratio * (this.activeInlineControl.max - this.activeInlineControl.min);
            const step = this.activeInlineControl.step || 0.01;
            next = Math.round(next / step) * step;
            node[this.activeInlineControl.inputName] = Math.max(this.activeInlineControl.min, Math.min(this.activeInlineControl.max, next));
        }

        if (this.activeInlineControl.kind === 'vec2') {
            const delta = (clientX - this.activeInlineControl.startClientX) * 0.01;
            const vec = Array.isArray(node[this.activeInlineControl.inputName])
                ? [...node[this.activeInlineControl.inputName]]
                : [0, 0];
            vec[this.activeInlineControl.axis] = +((this.activeInlineControl.startValue[this.activeInlineControl.axis] || 0) + delta).toFixed(3);
            node[this.activeInlineControl.inputName] = vec;
        }

        this.scheduleCompile();
        if (this.selectedNode?.id === node.id) this.updatePropertiesPanel();
    }

    getGroupAtPosition(x, y) {
        return [...this.groups].reverse().find(group =>
            x >= group.x && x <= group.x + group.w &&
            y >= group.y && y <= group.y + Math.min(group.h, 28)
        ) || null;
    }

    focusSelection() {
        const items = this.selectedNodes.length ? this.selectedNodes : (this.selectedGroup ? [this.selectedGroup] : []);
        if (!items.length) return;
        if (this.selectedGroup && !this.selectedNodes.length) {
            const g = this.selectedGroup;
            this.panX = this.canvas.width * 0.5 - (g.x + g.w * 0.5) * this.zoom;
            this.panY = this.canvas.height * 0.5 - (g.y + g.h * 0.5) * this.zoom;
            return;
        }
        const minX = Math.min(...this.selectedNodes.map(n => n.x));
        const minY = Math.min(...this.selectedNodes.map(n => n.y));
        const maxX = Math.max(...this.selectedNodes.map(n => n.x + n.w));
        const maxY = Math.max(...this.selectedNodes.map(n => n.y + n.h));
        this.panX = this.canvas.width * 0.5 - (minX + maxX) * 0.5 * this.zoom;
        this.panY = this.canvas.height * 0.5 - (minY + maxY) * 0.5 * this.zoom;
    }

    getCompatibleNodeTypes(outputType) {
        const results = [];
        Object.entries(this.nodeSchemas).forEach(([type, schema]) => {
            if (!schema.inputs?.length || type === 'Material_Output') return;
            const compatibleIndex = schema.inputs.findIndex((input) => {
                const compatible = this.socketTypeMap[input.type] || [input.type];
                return compatible.includes(outputType);
            });
            if (compatibleIndex >= 0) {
                results.push({ type, label: schema.displayName || type, inputIndex: compatibleIndex });
            }
        });
        return results.sort((a, b) => a.label.localeCompare(b.label));
    }

    showLinkSearchMenu(clientX, clientY, worldPos) {
        if (!this.contextMenuEl || !this.activeLink) return;
        const fromNode = this.activeLink.fromNode;
        const outputType = fromNode?.outputs?.[this.activeLink.fromSocket]?.type || 'float';
        const candidates = this.getCompatibleNodeTypes(outputType);

        this.contextMenuEl.innerHTML = `
            <div style="padding:6px 10px;font-size:9px;color:#797979;letter-spacing:0.12em;border-bottom:1px solid #262626;">CREATE & CONNECT</div>
            <div style="padding:8px;">
                <input id="mat-link-search-input" class="mat-link-search-input" placeholder="Search node..."
                    style="width:100%;background:#141414;border:1px solid #303030;color:#ddd;padding:6px 8px;font-size:11px;box-sizing:border-box;">
                <div id="mat-link-search-results" style="margin-top:6px;max-height:240px;overflow:auto;"></div>
            </div>
        `;
        this.contextMenuEl.style.display = 'block';
        this.contextMenuEl.style.left = `${clientX}px`;
        this.contextMenuEl.style.top = `${clientY}px`;
        this.contextMenuEl.style.minWidth = '220px';

        const input = this.contextMenuEl.querySelector('#mat-link-search-input');
        const results = this.contextMenuEl.querySelector('#mat-link-search-results');
        const renderResults = (filter = '') => {
            const list = candidates.filter(item => item.label.toLowerCase().includes(filter.toLowerCase())).slice(0, 24);
            results.innerHTML = list.map(item => `
                <button data-type="${item.type}" data-input="${item.inputIndex}"
                    style="display:flex;align-items:center;gap:6px;width:100%;padding:7px 8px;background:none;border:none;color:#bbb;cursor:pointer;font-size:11px;text-align:left;">
                    <span style="width:7px;height:7px;border-radius:50%;background:${this.nodeSchemas[item.type]?.color || '#777'};flex-shrink:0;"></span>
                    ${item.label}
                </button>
            `).join('');
            results.querySelectorAll('button').forEach(btn => {
                btn.onclick = () => {
                    const nodeType = btn.dataset.type;
                    const inputIndex = parseInt(btn.dataset.input, 10);
                    const newNode = this.spawnNode(nodeType, null, worldPos.x + 24, worldPos.y + 20);
                    if (newNode) {
                        this.createConnection(this.activeLink.fromNode.id, this.activeLink.fromSocket, newNode.id, inputIndex);
                        this.setSelectedNodes([newNode]);
                    }
                    this.draggedNode = null;
                    this.activeLink = null;
                    this.hideContextMenu();
                };
            });
        };

        renderResults('');
        if (input) {
            input.focus();
            input.addEventListener('input', (e) => renderResults(e.target.value));
        }
    }

    // =========================================================================
    // CANVAS EVENTS
    // =========================================================================
    setupCanvasEvents() {
        const workspace = document.querySelector('.canvas-workspace');

        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();

            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const worldX = (mx - this.panX) / this.zoom;
            const worldY = (my - this.panY) / this.zoom;

            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const nextZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));

            this.zoom = nextZoom;
            this.panX = mx - worldX * nextZoom;
            this.panY = my - worldY * nextZoom;

            const label = document.getElementById('zoom-val');
            if (label) label.textContent = Math.round(this.zoom * 100) + '%';
            this.updateEditorStatus();
        }, { passive: false });

        window.addEventListener('keydown', e => {
            if (e.code === 'Space' && !e.repeat) { e.preventDefault(); this.spacePressed = true; workspace?.classList.add('grab-mode'); }
            if ((e.key === 'Delete' || e.key === 'Backspace') && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
                if (this.selectedNodes.length) {
                    [...this.selectedNodes].forEach(n => this.deleteNode(n.id));
                    this.setSelectedNodes([]);
                } else if (this.selectedGroup) {
                    this.groups = this.groups.filter(g => g.id !== this.selectedGroup.id);
                    this.selectedGroup = null;
                    this.updatePropertiesPanel();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                if (this.selectedNode) this.duplicateNode(this.selectedNode.id);
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
                e.preventDefault();
                this.createGroupFromSelection();
            }
            if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
                if (e.key === 'Home' || e.key.toLowerCase() === 'f') {
                    e.preventDefault();
                    this.fitToView();
                    const label = document.getElementById('zoom-val');
                    if (label) label.textContent = Math.round(this.zoom * 100) + '%';
                }
                if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
                    this.setGridVisible(!this.showGrid);
                }
            }
        });
        window.addEventListener('keyup', e => {
            if (e.code === 'Space') { this.spacePressed = false; workspace?.classList.remove('grab-mode'); }
        });

        this.canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
            const m = this.getTransformedMouse(e);
            if (this.activeLink) {
                this.showLinkSearchMenu(e.clientX, e.clientY, m);
                return;
            }
            this.showContextMenu(e.clientX, e.clientY, m);
        });

        document.addEventListener('click', e => {
            if (!this.contextMenuEl?.contains(e.target)) this.hideContextMenu();
        });

        this.canvas.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            this.hideContextMenu();
            const m = this.getTransformedMouse(e);
            this.lastMouse = { x: e.clientX, y: e.clientY };

            if (this.spacePressed) { this.isPanning = true; workspace?.classList.add('panning'); return; }

            let hit = false;

            const hitGroup = this.getGroupAtPosition(m.x, m.y);
            if (hitGroup) {
                this.draggedGroup = hitGroup;
                this.selectedGroup = hitGroup;
                this.selectedNodes = this.nodes.filter(node => (hitGroup.nodeIds || []).includes(node.id));
                this.selectedNode = this.selectedNodes.length === 1 ? this.selectedNodes[0] : null;
                this.updatePropertiesPanel();
                return;
            }

            // Check sockets
            for (const node of [...this.nodes].reverse()) {
                const inlineControl = this._getInputControlAt(node, m.x, m.y);
                if (inlineControl) {
                    hit = this._beginInlineControl(inlineControl, e.clientX, e.clientY);
                    if (hit) break;
                }

                if (m.x > node.x + node.w - 22 && m.x < node.x + node.w - 4 && m.y > node.y + 4 && m.y < node.y + 20) {
                    node.expanded = !node.expanded;
                    this._updateNodeHeight(node);
                    hit = true;
                    break;
                }

                if (node.expanded) {
                    let py = node.y + 36;
                    const seenGroups = new Set();
                    for (const input of node.inputs) {
                        if (input.group && !seenGroups.has(input.group)) {
                            seenGroups.add(input.group);
                            const groupY = py - 18;
                            if (m.x > node.x && m.x < node.x + node.w && m.y > groupY && m.y < groupY + 18) {
                                node.groupStates[input.group] = !node.groupStates[input.group];
                                this._updateNodeHeight(node);
                                hit = true;
                                break;
                            }
                            py += 22;
                        }
                        if (input.group) {
                            if (node.groupStates[input.group]) py += 22;
                        } else {
                            py += 22;
                        }
                    }
                    if (hit) break;
                }

                node.outputs.forEach((out, i) => {
                    const p = this.getSocketPosition(node, 'output', i);
                    if (p && this.dist(m.x, m.y, p.x, p.y) < 12) {
                        this.activeLink = { fromNode: node, fromSocket: i, currentX: m.x, currentY: m.y };
                        hit = true;
                    }
                });
                if (hit) break;

                if (node.expanded) {
                    node.inputs.forEach((inp, i) => {
                        const p = this.getSocketPosition(node, 'input', i);
                        if (p && this.dist(m.x, m.y, p.x, p.y) < 12) {
                            const existing = this.connections.find(c => c.toId === node.id && c.toSocket === i);
                            if (existing) {
                                const src = this.nodes.find(n => n.id === existing.fromId);
                                this.activeLink = { fromNode: src, fromSocket: existing.fromSocket, currentX: m.x, currentY: m.y };
                                this.connections = this.connections.filter(c => c !== existing);
                                hit = true;
                            }
                        }
                    });
                }
                if (hit) break;
            }

            if (!hit) {
                this.draggedNode = [...this.nodes].reverse().find(n =>
                    m.x > n.x && m.x < n.x + n.w && m.y > n.y && m.y < n.y + n.h
                );
                if (this.draggedNode) {
                    if (e.ctrlKey || e.metaKey) this.toggleNodeSelection(this.draggedNode);
                    else if (!this.selectedNodes.includes(this.draggedNode)) this.setSelectedNodes([this.draggedNode]);
                    this.nodes.splice(this.nodes.indexOf(this.draggedNode), 1);
                    this.nodes.push(this.draggedNode);
                } else {
                    this.isSelecting = true;
                    this.selectionRect = { x: m.x, y: m.y, w: 0, h: 0 };
                    this.setSelectedNodes([]);
                }
            }
        });

        window.addEventListener('mousemove', e => {
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            if (this.isPanning) { this.panX += dx; this.panY += dy; }
            else if (this.activeInlineControl && this.activeInlineControl.kind !== 'color') {
                this._updateInlineControl(e.clientX, e.clientY);
            }
            else if (this.draggedGroup) {
                this.draggedGroup.x += dx / this.zoom;
                this.draggedGroup.y += dy / this.zoom;
                this.nodes.filter(node => (this.draggedGroup.nodeIds || []).includes(node.id)).forEach(node => {
                    node.x += dx / this.zoom;
                    node.y += dy / this.zoom;
                });
            }
            else if (this.draggedNode) {
                const active = this.selectedNodes.includes(this.draggedNode) ? this.selectedNodes : [this.draggedNode];
                active.forEach(n => { n.x += dx / this.zoom; n.y += dy / this.zoom; });
            } else if (this.activeLink) {
                const m = this.getTransformedMouse(e);
                this.activeLink.currentX = m.x; this.activeLink.currentY = m.y;
            } else if (this.isSelecting && this.selectionRect) {
                const m = this.getTransformedMouse(e);
                this.selectionRect.w = m.x - this.selectionRect.x;
                this.selectionRect.h = m.y - this.selectionRect.y;
            }
            this.lastMouse = { x: e.clientX, y: e.clientY };

            // Socket hover
            if (!this.activeLink && !this.draggedNode && !this.isPanning) {
                const m = this.getTransformedMouse(e);
                this.hoveredSocket = null;
                for (const node of this.nodes) {
                    node.inputs.forEach((inp, i) => {
                        const p = this.getSocketPosition(node, 'input', i);
                        if (p && this.dist(m.x, m.y, p.x, p.y) < 12) this.hoveredSocket = { nodeId: node.id, socketIndex: i, type: 'input' };
                    });
                    node.outputs.forEach((out, i) => {
                        const p = this.getSocketPosition(node, 'output', i);
                        if (p && this.dist(m.x, m.y, p.x, p.y) < 12) this.hoveredSocket = { nodeId: node.id, socketIndex: i, type: 'output' };
                    });
                }
            }
        });

        window.addEventListener('mouseup', e => {
            if (this.activeLink) {
                const m = this.getTransformedMouse(e);
                let target = null;
                for (const node of this.nodes) {
                    node.inputs.forEach((inp, i) => {
                        const p = this.getSocketPosition(node, 'input', i);
                        if (p && this.dist(m.x, m.y, p.x, p.y) < 16) target = { node, socket: i };
                    });
                }
                if (target) {
                    this.createConnection(this.activeLink.fromNode.id, this.activeLink.fromSocket, target.node.id, target.socket);
                }
            }
            if (this.isSelecting && this.selectionRect) {
                const r = this.selectionRect;
                const minX = Math.min(r.x, r.x + r.w), maxX = Math.max(r.x, r.x + r.w);
                const minY = Math.min(r.y, r.y + r.h), maxY = Math.max(r.y, r.y + r.h);
                this.setSelectedNodes(this.nodes.filter(n =>
                    n.x < maxX && n.x + n.w > minX && n.y < maxY && n.y + n.h > minY
                ));
            }

            if (this.snapToGrid && this.draggedNode) {
                const active = this.selectedNodes.includes(this.draggedNode)
                    ? this.selectedNodes
                    : [this.draggedNode];
                this._snapNodesToGrid(active);
            }

            this.draggedNode = null; this.draggedGroup = null; this.isPanning = false;
            if (this.activeInlineControl?.kind !== 'color') this.activeInlineControl = null;
            this.activeLink = null; this.hoveredSocket = null;
            this.isSelecting = false; this.selectionRect = null;
            workspace?.classList.remove('panning');
            if (this.spacePressed) workspace?.classList.add('grab-mode');
        });
    }

    // =========================================================================
    // CONTEXT MENU
    // =========================================================================
    showContextMenu(clientX, clientY, worldPos) {
        if (!this.contextMenuEl) return;
        const targetNode = [...this.nodes].reverse().find(n =>
            worldPos.x > n.x && worldPos.x < n.x + n.w && worldPos.y > n.y && worldPos.y < n.y + n.h
        );
        const targetGroup = this.getGroupAtPosition(worldPos.x, worldPos.y);

        const quickSpawn = [
            ['RGB_Color', 'Color'], ['Float_Val', 'Value'], ['Mix', 'Mix'],
            ['UV_Map', 'UV Map'], ['Panner', 'Panner'], ['Time_Input', 'Time'],
            ['Proc_Wood', 'Wood'], ['Proc_Marble', 'Marble'], ['Proc_Brick', 'Brick'],
            ['Water_Waves', 'Gerstner Waves'], ['Noise_Value', 'Value Noise'],
        ];

        let html = `<style>.mat-ctx-btn{display:block;width:100%;padding:7px 14px;background:none;border:none;color:#bbb;cursor:pointer;font-size:11px;text-align:left;}.mat-ctx-btn:hover{background:#252525;color:#fff;}.mat-ctx-sep{height:1px;background:#252525;margin:3px 0;}.mat-ctx-cat{padding:5px 14px;font-size:9px;color:#555;letter-spacing:0.1em;}</style>`;

        if (targetNode) {
            html += `<button class="mat-ctx-btn" data-action="dup">Duplicate</button>`;
            html += `<button class="mat-ctx-btn" data-action="del" style="color:#f66;">Delete Node</button>`;
            html += `<div class="mat-ctx-sep"></div>`;
        }
        if (targetGroup) {
            html += `<button class="mat-ctx-btn" data-action="del-group" style="color:#f0b36d;">Delete Group</button>`;
            html += `<div class="mat-ctx-sep"></div>`;
        }
        if (this.selectedNodes.length > 0) {
            html += `<button class="mat-ctx-btn" data-action="group">Create Group</button>`;
            html += `<button class="mat-ctx-btn" data-action="focus">Focus Selection</button>`;
            html += `<div class="mat-ctx-sep"></div>`;
        }
        html += `<div class="mat-ctx-cat">CREATE NODE</div>`;
        quickSpawn.forEach(([type, label]) => {
            html += `<button class="mat-ctx-btn" data-spawn="${type}">${label}</button>`;
        });

        this.contextMenuEl.innerHTML = html;
        this.contextMenuEl.style.display = 'block';
        this.contextMenuEl.style.left = `${clientX}px`;
        this.contextMenuEl.style.top = `${clientY}px`;
        this.contextMenuEl.style.minWidth = '164px';

        this.contextMenuEl.querySelectorAll('[data-action]').forEach(btn => {
            btn.onclick = () => {
                if (btn.dataset.action === 'dup' && targetNode) this.duplicateNode(targetNode.id);
                if (btn.dataset.action === 'del' && targetNode) this.deleteNode(targetNode.id);
                if (btn.dataset.action === 'del-group' && targetGroup) {
                    this.groups = this.groups.filter(g => g.id !== targetGroup.id);
                    if (this.selectedGroup?.id === targetGroup.id) this.selectedGroup = null;
                    this.updatePropertiesPanel();
                }
                if (btn.dataset.action === 'group') this.createGroupFromSelection();
                if (btn.dataset.action === 'focus') this.focusSelection();
                this.hideContextMenu();
            };
        });
        this.contextMenuEl.querySelectorAll('[data-spawn]').forEach(btn => {
            btn.onclick = () => {
                const node = this.spawnNode(btn.dataset.spawn, null, worldPos.x, worldPos.y);
                if (node) this.setSelectedNodes([node]);
                this.hideContextMenu();
            };
        });
    }

    hideContextMenu() {
        if (this.contextMenuEl) { this.contextMenuEl.style.display = 'none'; this.contextMenuEl.innerHTML = ''; }
    }

    createGroupFromSelection() {
        const nodes = this.selectedNodes.length ? this.selectedNodes : (this.selectedNode ? [this.selectedNode] : []);
        if (!nodes.length) { this.showNotification('Select nodes first', 'warning'); return; }
        const pad = 30;
        const minX = Math.min(...nodes.map(n => n.x)) - pad;
        const minY = Math.min(...nodes.map(n => n.y)) - 46;
        const maxX = Math.max(...nodes.map(n => n.x + n.w)) + pad;
        const maxY = Math.max(...nodes.map(n => n.y + n.h)) + pad;
        this.groups.push({
            id: `g_${this.groupIdCounter++}`,
            title: `Comment ${this.groupIdCounter}`,
            color: 'rgba(90,70,36,0.18)',
            stroke: 'rgba(176,138,78,0.48)',
            x: minX, y: minY, w: maxX - minX, h: maxY - minY,
            nodeIds: nodes.map(n => n.id)
        });
        this.selectedGroup = this.groups[this.groups.length - 1];
        this.updatePropertiesPanel();
        this.log('Group created', 'success');
    }

    // =========================================================================
    // FIT & CLEAR
    // =========================================================================
    fitToView() {
        if (!this.nodes.length) return;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        this.nodes.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.h); });
        const pad = 60, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
        const viewW = this.canvas.clientWidth || 900;
        const viewH = this.canvas.clientHeight || 600;
        this.zoom = Math.max(this.minZoom, Math.min(viewW / w, viewH / h, 1.5));
        this.panX = (viewW - w * this.zoom) / 2 + pad * this.zoom - minX * this.zoom;
        this.panY = (viewH - h * this.zoom) / 2 + pad * this.zoom - minY * this.zoom;
        const label = document.getElementById('zoom-val');
        if (label) label.textContent = Math.round(this.zoom * 100) + '%';
        this.updateEditorStatus();
    }

    clearGraph() {
        if (!confirm('Clear all nodes? This cannot be undone.')) return;
        this.nodes = this.nodes.filter(n => n.type === 'Material_Output');
        this.connections = [];
        this.groups = [];
        this.setSelectedNodes([]);
        const hasOutput = this.nodes.find(n => n.type === 'Material_Output');
        if (!hasOutput) this.spawnNode('Material_Output', null, 720, 180);
        this.log('Graph cleared', 'warning');
    }

    // =========================================================================
    // RENDER LOOP
    // =========================================================================
    startRenderLoop() {
        const render = () => { this.draw(); requestAnimationFrame(render); };
        render();
    }

    draw() {
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = this.canvas.clientWidth || this.canvas.width / dpr;
        const cssHeight = this.canvas.clientHeight || this.canvas.height / dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssWidth, cssHeight);
        ctx.fillStyle = '#303030';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        ctx.save();
        ctx.translate(this.panX, this.panY);
        ctx.scale(this.zoom, this.zoom);

        if (this.showGrid) this.drawGrid();

        // Groups
        this.groups.forEach(g => this.renderGroup(g));

        // Selection rect
        if (this.selectionRect) {
            const { x, y, w, h } = this.selectionRect;
            ctx.fillStyle = 'rgba(255,140,0,0.08)';
            ctx.strokeStyle = 'rgba(255,140,0,0.7)';
            ctx.lineWidth = 1 / this.zoom;
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }

        // Connections
        this.connections.forEach(c => {
            const fn = this.nodes.find(n => n.id === c.fromId);
            const tn = this.nodes.find(n => n.id === c.toId);
            if (!fn || !tn) return;
            const p1 = this.getSocketPosition(fn, 'output', c.fromSocket) || { x: fn.x + fn.w, y: fn.y + 20 };
            const p2 = this.getSocketPosition(tn, 'input', c.toSocket) || { x: tn.x, y: tn.y + 20 };
            this.drawNoodle(p1.x, p1.y, p2.x, p2.y, false, fn.outputs[c.fromSocket]?.type);
        });

        // Active link
        if (this.activeLink) {
            const p = this.getSocketPosition(this.activeLink.fromNode, 'output', this.activeLink.fromSocket);
            const sx = p ? p.x : this.activeLink.fromNode.x + this.activeLink.fromNode.w;
            const sy = p ? p.y : this.activeLink.fromNode.y + 20;
            this.drawNoodle(sx, sy, this.activeLink.currentX, this.activeLink.currentY, true, null);
        }

        // Nodes
        this.nodes.forEach(node => this.renderNode(node));
        ctx.restore();

        this.drawMinimap();
        this.updateEditorStatus();

        const so = document.getElementById('selected-obj');
        if (so) {
            so.textContent = window.selectedObject
                ? `● ${window.selectedObject.name || 'Object'}`
                : 'No Object';
        }
    }

    renderGroup(group) {
        const ctx = this.ctx;
        const sel = this.selectedGroup?.id === group.id;
        ctx.fillStyle = group.color;
        ctx.strokeStyle = sel ? '#d3ab62' : group.stroke;
        ctx.lineWidth = (sel ? 1.5 : 1) / this.zoom;
        this._roundRect(group.x, group.y, group.w, group.h, 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(48,48,48,0.96)';
        ctx.fillRect(group.x + 3, group.y + 3, Math.min(group.w - 6, 142), 20);
        ctx.fillStyle = '#d0d0d0'; ctx.font = `bold ${10 / this.zoom > 11 ? 11 : 10}px Inter,sans-serif`;
        ctx.fillText(group.title, group.x + 10, group.y + 16);
    }

    // Socket color by type
    _socketColor(type) {
        const map = { color: '#f1c40f', vector3: '#6dd6ff', vec3: '#6dd6ff', float: '#a0c4e8', vector2: '#a8e6cf', vec2: '#a8e6cf', texture: '#e8a0c0' };
        return map[type] || '#aaa';
    }

    renderNode(node) {
        const ctx = this.ctx;
        const isSel = this.selectedNodes.includes(node) || this.selectedNode?.id === node.id;
        const isOut = node.isOutput;
        const headerColor = isOut ? '#5b2630' : (node.type === 'PBR_Surface' ? '#356e39' : node.color);

        // Shadow for selected
        if (isSel) { ctx.shadowColor = 'rgba(180,190,205,0.24)'; ctx.shadowBlur = 12 / this.zoom; }

        // Body
        ctx.fillStyle = '#2b2b2b';
        ctx.strokeStyle = isOut ? '#88515c' : (isSel ? '#aab2bd' : '#171717');
        ctx.lineWidth = (isSel || isOut ? 1.5 : 0.8) / this.zoom;
        this._roundRect(node.x, node.y, node.w, node.h, 5);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

        // Header
        ctx.fillStyle = headerColor;
        this._roundRect(node.x, node.y, node.w, 23, { tl: 5, tr: 5, bl: 0, br: 0 });
        ctx.fill();

        // Title
        ctx.fillStyle = '#f1f1f1'; ctx.font = `bold 10px Inter,sans-serif`;
        ctx.textAlign = 'left';
        const title = node.schema.displayName;
        ctx.fillText(title.length > 20 ? title.slice(0, 19) + '…' : title, node.x + 7, node.y + 15);

        // Expand toggle
        ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = `9px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(node.expanded ? '▾' : '▸', node.x + node.w - 5, node.y + 15);
        ctx.textAlign = 'left';

        if (!node.expanded) {
            // Outputs still shown on right
            node.outputs.forEach((out, i) => {
                const y = node.y + 14 + i * 12;
                ctx.fillStyle = this._socketColor(out.type);
                ctx.beginPath(); ctx.arc(node.x + node.w, y, 4, 0, Math.PI * 2); ctx.fill();
            });
            return;
        }

        // Inputs
        let py = node.y + 36;
        const seen = new Set();
        node.inputs.forEach((inp, i) => {
            if (inp.group) {
                if (!seen.has(inp.group)) {
                    seen.add(inp.group);
                    ctx.fillStyle = '#252525';
                    ctx.fillRect(node.x, py - 18, node.w, 18);
                    ctx.fillStyle = '#7e7e7e'; ctx.font = `8px Inter,sans-serif`;
                    ctx.fillText((node.groupStates[inp.group] ? '▾ ' : '▸ ') + inp.group.toUpperCase(), node.x + 6, py - 5);
                    py += 22;
                }
                if (!node.groupStates[inp.group]) return;
            }

            const isHov = this.hoveredSocket?.nodeId === node.id && this.hoveredSocket?.socketIndex === i && this.hoveredSocket?.type === 'input';
            const isConn = this.connections.some(c => c.toId === node.id && c.toSocket === i);
            const scol = this._socketColor(inp.type);

            ctx.fillStyle = isHov ? '#fff' : scol;
            ctx.strokeStyle = isConn ? scol : 'transparent';
            ctx.lineWidth = 1.5 / this.zoom;
            ctx.beginPath();
            if (inp.type === 'float') {
                ctx.moveTo(node.x, py - 4); ctx.lineTo(node.x + 5, py); ctx.lineTo(node.x, py + 4); ctx.lineTo(node.x - 5, py);
                ctx.closePath(); ctx.fill(); if (isConn) ctx.stroke();
            } else {
                ctx.arc(node.x, py, isConn ? 5 : 4, 0, Math.PI * 2); ctx.fill(); if (isConn) ctx.stroke();
            }

            ctx.fillStyle = isConn ? '#d8d8d8' : '#9a9a9a'; ctx.font = `10px Inter,sans-serif`;
            ctx.fillText(inp.name, node.x + 10, py + 4);
            if (!isConn && inp.type === 'float') {
                const currentValue = node[inp.name] !== undefined ? node[inp.name] : (inp.default ?? 0);
                const min = inp.min ?? 0;
                const max = inp.max ?? 1;
                const normalized = Math.max(0, Math.min(1, ((+currentValue || 0) - min) / Math.max(max - min, 0.0001)));
                const rects = this._getInlineControlRects(node, inp, py);
                const trackX = rects.trackX;
                const trackW = rects.trackW;
                ctx.fillStyle = '#3b3b3b';
                ctx.fillRect(trackX, py - 7, trackW, 12);
                ctx.fillStyle = '#69798b';
                ctx.fillRect(trackX, py - 7, trackW * normalized, 12);
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.lineWidth = 1 / this.zoom;
                ctx.strokeRect(trackX, py - 7, trackW, 12);
                ctx.fillStyle = '#e2e2e2';
                ctx.font = `9px Inter,sans-serif`;
                ctx.textAlign = 'right';
                ctx.fillText((+currentValue || 0).toFixed(3), node.x + node.w - 12, py + 3);
                ctx.textAlign = 'left';
            }
            if (!isConn && inp.type === 'color') {
                const rects = this._getInlineControlRects(node, inp, py);
                const color = node[inp.name] || inp.default || '#ffffff';
                ctx.fillStyle = '#3b3b3b';
                ctx.fillRect(rects.chipX, rects.chipY, rects.chipW, rects.chipH);
                ctx.fillStyle = color;
                ctx.fillRect(rects.chipX + 1, rects.chipY + 1, 20, rects.chipH - 2);
                ctx.fillStyle = '#dadada';
                ctx.font = `8px Inter,sans-serif`;
                ctx.textAlign = 'left';
                ctx.fillText(color.replace('#', '').toUpperCase(), rects.chipX + 24, py + 3);
            }
            if (!isConn && (inp.type === 'vector2' || inp.type === 'vec2')) {
                const rects = this._getInlineControlRects(node, inp, py);
                const vec = Array.isArray(node[inp.name]) ? node[inp.name] : (Array.isArray(inp.default) ? inp.default : [0, 0]);
                [rects.xBox, rects.yBox].forEach((box, idx) => {
                    ctx.fillStyle = '#3b3b3b';
                    ctx.fillRect(box.x, box.y, box.w, box.h);
                    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                    ctx.lineWidth = 1 / this.zoom;
                    ctx.strokeRect(box.x, box.y, box.w, box.h);
                    ctx.fillStyle = idx === 0 ? '#7fb7ff' : '#8ed6b3';
                    ctx.font = `8px Inter,sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText((+vec[idx] || 0).toFixed(2), box.x + box.w * 0.5, py + 3);
                });
                ctx.textAlign = 'left';
            }
            py += 22;
        });

        // Outputs
        node.outputs.forEach((out, i) => {
            const oy = node.y + 30 + i * 22;
            const isHov = this.hoveredSocket?.nodeId === node.id && this.hoveredSocket?.socketIndex === i && this.hoveredSocket?.type === 'output';
            const isConn = this.connections.some(c => c.fromId === node.id && c.fromSocket === i);
            const scol = this._socketColor(out.type);

            ctx.fillStyle = isHov ? '#fff' : scol;
            ctx.beginPath(); ctx.arc(node.x + node.w, oy, isConn ? 5 : 4, 0, Math.PI * 2); ctx.fill();
            if (isConn) { ctx.strokeStyle = scol; ctx.lineWidth = 1.5 / this.zoom; ctx.stroke(); }

            ctx.fillStyle = '#888'; ctx.font = `10px Inter,sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(out.name, node.x + node.w - 10, oy + 4);
            ctx.textAlign = 'left';
        });
    }

    drawNoodle(x1, y1, x2, y2, active, type) {
        const ctx = this.ctx;
        const typeColors = {
            color: '#d9ba4e',
            float: '#86a6bd',
            vector3: '#6eb2c9',
            vec3: '#6eb2c9',
            vector2: '#7fb8a2',
            vec2: '#7fb8a2',
            texture: '#b989a4'
        };

        const col = active ? '#f1f1f1' : (typeColors[type] || '#9a9a9a');
        const dx = Math.abs(x2 - x1);
        const tangent = Math.max(42, Math.min(180, dx * 0.5));
        const cp1 = x1 + tangent;
        const cp2 = x2 - tangent;

        // Dark under-stroke makes links readable on every node/grid color.
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cp1, y1, cp2, y2, x2, y2);
        ctx.strokeStyle = 'rgba(12,12,12,0.72)';
        ctx.lineWidth = (active ? 4.5 : 3.8) / this.zoom;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cp1, y1, cp2, y2, x2, y2);
        ctx.strokeStyle = col;
        ctx.lineWidth = (active ? 2.4 : 1.65) / this.zoom;
        ctx.globalAlpha = active ? 1 : 0.86;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    drawGrid() {
        const ctx = this.ctx;

        // Neutral gray Blender/UE-style graph grid.
        // It adapts to zoom, so the canvas never becomes visually noisy.
        const base = Math.max(10, this.gridSize);
        let step = base;

        const screenStep = step * this.zoom;
        if (screenStep < 12) step *= 4;
        else if (screenStep < 22) step *= 2;

        const major = step * this.gridSubdivisions;

        const cssW = this.canvas.clientWidth || 1;
        const cssH = this.canvas.clientHeight || 1;

        const left = -this.panX / this.zoom;
        const top = -this.panY / this.zoom;
        const right = left + cssW / this.zoom;
        const bottom = top + cssH / this.zoom;

        const startX = Math.floor(left / step) * step;
        const startY = Math.floor(top / step) * step;

        // Minor lines
        ctx.lineWidth = 1 / this.zoom;
        ctx.strokeStyle = '#363636';
        ctx.beginPath();

        for (let x = startX; x <= right + step; x += step) {
            const isMajor = Math.round(x / step) % this.gridSubdivisions === 0;
            if (isMajor) continue;
            const px = Math.round(x * this.zoom) / this.zoom;
            ctx.moveTo(px, top);
            ctx.lineTo(px, bottom);
        }

        for (let y = startY; y <= bottom + step; y += step) {
            const isMajor = Math.round(y / step) % this.gridSubdivisions === 0;
            if (isMajor) continue;
            const py = Math.round(y * this.zoom) / this.zoom;
            ctx.moveTo(left, py);
            ctx.lineTo(right, py);
        }

        ctx.stroke();

        // Major lines
        const majorStartX = Math.floor(left / major) * major;
        const majorStartY = Math.floor(top / major) * major;

        ctx.strokeStyle = '#414141';
        ctx.lineWidth = 1 / this.zoom;
        ctx.beginPath();

        for (let x = majorStartX; x <= right + major; x += major) {
            const px = Math.round(x * this.zoom) / this.zoom;
            ctx.moveTo(px, top);
            ctx.lineTo(px, bottom);
        }

        for (let y = majorStartY; y <= bottom + major; y += major) {
            const py = Math.round(y * this.zoom) / this.zoom;
            ctx.moveTo(left, py);
            ctx.lineTo(right, py);
        }

        ctx.stroke();

        // Soft major intersections. Still gray — no colored grid dots.
        if (this.zoom >= 0.45) {
            ctx.fillStyle = '#4a4a4a';
            const radius = Math.max(0.55, 0.8 / this.zoom);

            for (let x = majorStartX; x <= right + major; x += major) {
                for (let y = majorStartY; y <= bottom + major; y += major) {
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================
    getTransformedMouse(e) {
        const r = this.canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left - this.panX) / this.zoom, y: (e.clientY - r.top - this.panY) / this.zoom };
    }
    dist(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2); }
    _roundRect(x, y, w, h, r) {
        if (typeof r === 'number') r = { tl: r, tr: r, bl: r, br: r };
        this.ctx.beginPath();
        this.ctx.moveTo(x + r.tl, y);
        this.ctx.lineTo(x + w - r.tr, y); this.ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
        this.ctx.lineTo(x + w, y + h - r.br); this.ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
        this.ctx.lineTo(x + r.bl, y + h); this.ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
        this.ctx.lineTo(x, y + r.tl); this.ctx.quadraticCurveTo(x, y, x + r.tl, y);
        this.ctx.closePath();
    }
    resize() {
        if (!this.canvas || !this.canvas.parentElement) return;

        const workspace = this.canvas.parentElement;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const width = Math.max(1, Math.floor(this.canvas.clientWidth || workspace.clientWidth));
        const height = Math.max(
            1,
            Math.floor(this.canvas.clientHeight || Math.max(1, workspace.clientHeight - 54))
        );

        const targetW = Math.floor(width * dpr);
        const targetH = Math.floor(height * dpr);

        if (this.canvas.width !== targetW) this.canvas.width = targetW;
        if (this.canvas.height !== targetH) this.canvas.height = targetH;

        if (this.ctx) {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        this.resizePreviewViewport?.();
        this.updateEditorStatus?.();
    }
    showNotification(msg, type = 'success') {
        const colors = { success: '#1a4a2a', error: '#4a1a1a', warning: '#4a3a0a' };
        const borders = { success: '#27ae60', error: '#e74c3c', warning: '#f39c12' };
        const div = document.createElement('div');
        div.style.cssText = `position:fixed;top:20px;right:20px;background:${colors[type] || colors.success};border:1px solid ${borders[type] || borders.success};color:#ddd;padding:10px 16px;border-radius:3px;z-index:99999;font-family:monospace;font-size:11px;box-shadow:0 4px 12px #000;`;
        div.textContent = msg;
        document.body.appendChild(div);
        setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.3s'; setTimeout(() => div.remove(), 300); }, 2800);
    }

    // =========================================================================
    // SAVE / SERIALIZE
    // =========================================================================
    serialize() {
        return {
            nodes: this.nodes.map(n => ({
                id: n.id, type: n.type, x: n.x, y: n.y, value: n.value, groupStates: n.groupStates,
                overrides: n.inputs.reduce((a, i) => { if (n[i.name] !== undefined) a[i.name] = n[i.name]; return a; }, {})
            })),
            connections: this.connections,
            groups: this.groups,
            pan: { x: this.panX, y: this.panY }, zoom: this.zoom
        };
    }

    _serializeMaterialDefinition(material) {
        if (!material) return null;
        return {
            type: material.type || 'MeshPhysicalMaterial',
            color: material.color?.getHex?.() ?? 0xffffff,
            roughness: material.roughness ?? 0.5,
            metalness: material.metalness ?? 0,
            opacity: material.opacity ?? 1,
            transparent: !!material.transparent,
            emissive: material.emissive?.getHex?.() ?? 0x000000,
            emissiveIntensity: material.emissiveIntensity ?? 0,
            transmission: material.transmission ?? 0,
            ior: material.ior ?? 1.5,
            clearcoat: material.clearcoat ?? 0,
            clearcoatRoughness: material.clearcoatRoughness ?? 0,
            sheen: material.sheen ?? 0,
            sheenColor: material.sheenColor?.getHex?.() ?? 0xffffff,
            side: material.side ?? THREE.DoubleSide
        };
    }

    saveToAssets() {
        if (typeof AssetsPanel === 'undefined') {
            this.showNotification('AssetsPanel not found', 'error');
            return;
        }

        if (!this.lastAppliedMaterial && window.selectedObject?.isMesh) {
            this.compileAndApply();
        }

        const suggested = `${window.selectedObject?.name || 'Material'} Material`;
        const name = window.prompt('Material name:', suggested);
        if (!name) {
            this.showNotification('Save cancelled', 'warning');
            return;
        }

        const payload = {
            ...(this._serializeMaterialDefinition(this.lastAppliedMaterial || window.selectedObject?.material) || { type: 'MeshPhysicalMaterial' }),
            graph: this.serialize()
        };
        const data = JSON.stringify(payload, null, 2);
        const folderId = typeof AssetsPanel.openFolderId !== 'undefined' ? AssetsPanel.openFolderId : null;
        const saved = typeof AssetsPanel.addMaterialAsset === 'function'
            ? AssetsPanel.addMaterialAsset(name, data, folderId)
            : AssetsPanel.addAsset?.({ type: 'material', name, data, folderId });

        if (saved) {
            this.showNotification(`Saved "${name}"`, 'success');
            AssetsPanel.render?.();
        } else {
            this.showNotification('Save failed', 'error');
        }
    }
}

// ============================================================================
// AUTO INITIALIZE
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('material-graph-wrapper')) {
        window.materialNodeEditor = new MaterialNodeEditor('material-graph-wrapper');
    }
});
window.addEventListener('resize', () => window.materialNodeEditor?.resize());
window.addMatNode = (type) => {
    if (!window.materialNodeEditor) return;
    const n = window.materialNodeEditor.spawnNodeAtCenter(type);
    if (n) window.materialNodeEditor.setSelectedNodes([n]);
};
window.applyNodeMaterial = () => window.materialNodeEditor?.compileAndApply();
if (typeof module !== 'undefined' && module.exports) module.exports = { MaterialNodeEditor };