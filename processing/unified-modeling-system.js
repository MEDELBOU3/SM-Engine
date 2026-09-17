// --- START OF FILE ---

let vertexHelpers = new THREE.Group();
let edgeHelpers = new THREE.Group();
let faceHelpers = new THREE.Group();
let softFaceHelpers = new THREE.Group();
let modelingPreviewHelpers = new THREE.Group();

vertexHelpers.name = "VertexHelpers";
edgeHelpers.name = "EdgeHelpers";
faceHelpers.name = "FaceHelpers";
softFaceHelpers.name = "SoftFaceHelpers";
modelingPreviewHelpers.name = "ModelingPreviewHelpers";

function addModelingHelperGroup(group) {
    if (typeof scene === "undefined" || !scene || scene.children.includes(group)) return;
    scene.add(group);
}

function disposeObject3D(object) {
    if (!object) return;
    if (Array.isArray(object.children) && object.children.length) {
        [...object.children].forEach((child) => {
            object.remove(child);
            disposeObject3D(child);
        });
    }
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
        if (Array.isArray(object.material)) {
            object.material.forEach((material) => material && material.dispose());
        } else {
            object.material.dispose();
        }
    }
}

function clearGroup(group) {
    if (!group) return;
    while (group.children.length) {
        const child = group.children[0];
        group.remove(child);
        disposeObject3D(child);
    }
    group.visible = false;
}

function getIndexedGeometryClone(geometry) {
    let clone = geometry.clone();
    if (!clone.index) {
        clone = clone.toNonIndexed();
        if (THREE.BufferGeometryUtils && typeof THREE.BufferGeometryUtils.mergeVertices === "function") {
            clone = THREE.BufferGeometryUtils.mergeVertices(clone, 1e-5);
        }
    }
    clone.computeVertexNormals();
    return clone;
}

function buildQuadGridTopology(width, depth, widthSegments, depthSegments) {
    const vertices = [];
    const faces = [];

    for (let z = 0; z <= depthSegments; z++) {
        const vz = (z / depthSegments - 0.5) * depth;
        for (let x = 0; x <= widthSegments; x++) {
            const vx = (x / widthSegments - 0.5) * width;
            vertices.push([vx, 0, vz]);
        }
    }

    const row = widthSegments + 1;
    for (let z = 0; z < depthSegments; z++) {
        for (let x = 0; x < widthSegments; x++) {
            const a = z * row + x;
            const b = a + 1;
            const d = a + row;
            const c = d + 1;
            faces.push([a, b, c, d]);
        }
    }

    return { vertices, faces };
}

function buildQuadCylinderTopology(radiusTop, radiusBottom, height, radialSegments, heightSegments) {
    const vertices = [];
    const faces = [];
    const radial = Math.max(3, Math.round(radialSegments || 16));
    const heightSeg = Math.max(1, Math.round(heightSegments || 1));

    for (let y = 0; y <= heightSeg; y++) {
        const v = y / heightSeg;
        const radius = radiusBottom + (radiusTop - radiusBottom) * v;
        const posY = (v - 0.5) * height;
        for (let i = 0; i < radial; i++) {
            const angle = (i / radial) * Math.PI * 2;
            vertices.push([Math.cos(angle) * radius, posY, Math.sin(angle) * radius]);
        }
    }

    for (let y = 0; y < heightSeg; y++) {
        for (let i = 0; i < radial; i++) {
            const next = (i + 1) % radial;
            const rowA = y * radial;
            const rowB = (y + 1) * radial;
            faces.push([rowA + i, rowA + next, rowB + next, rowB + i]);
        }
    }

    const bottomCap = [];
    const topCap = [];
    for (let i = 0; i < radial; i++) {
        bottomCap.push(radial - 1 - i);
        topCap.push((heightSeg * radial) + i);
    }
    faces.push(bottomCap);
    faces.push(topCap);

    return { vertices, faces };
}

function buildQuadUvSphereTopology(radius, widthSegments, heightSegments) {
    const longitudeSegments = Math.max(3, Math.round(widthSegments || 16));
    const latitudeSegments = Math.max(3, Math.round(heightSegments || 12));
    const vertices = [[0, radius, 0]];
    const faces = [];
    const ringCount = latitudeSegments - 1;
    const ringIndex = (ring, segment) => 1 + (ring * longitudeSegments) + (segment % longitudeSegments);

    for (let lat = 1; lat < latitudeSegments; lat++) {
        const phi = (lat / latitudeSegments) * Math.PI;
        const y = Math.cos(phi) * radius;
        const ringRadius = Math.sin(phi) * radius;
        for (let lon = 0; lon < longitudeSegments; lon++) {
            const theta = (lon / longitudeSegments) * Math.PI * 2;
            vertices.push([Math.cos(theta) * ringRadius, y, Math.sin(theta) * ringRadius]);
        }
    }

    const southPoleIndex = vertices.length;
    vertices.push([0, -radius, 0]);

    for (let lon = 0; lon < longitudeSegments; lon++) {
        const next = (lon + 1) % longitudeSegments;
        faces.push([0, ringIndex(0, next), ringIndex(0, lon)]);
    }

    for (let ring = 0; ring < ringCount - 1; ring++) {
        for (let lon = 0; lon < longitudeSegments; lon++) {
            const next = (lon + 1) % longitudeSegments;
            faces.push([
                ringIndex(ring, lon),
                ringIndex(ring, next),
                ringIndex(ring + 1, next),
                ringIndex(ring + 1, lon),
            ]);
        }
    }

    const lastRing = ringCount - 1;
    for (let lon = 0; lon < longitudeSegments; lon++) {
        const next = (lon + 1) % longitudeSegments;
        faces.push([southPoleIndex, ringIndex(lastRing, lon), ringIndex(lastRing, next)]);
    }

    return { vertices, faces };
}

function buildQuadTorusTopology(radius, tube, radialSegments, tubularSegments) {
    const tubeSegments = Math.max(3, Math.round(radialSegments || 12));
    const ringSegments = Math.max(3, Math.round(tubularSegments || 24));
    const vertices = [];
    const faces = [];
    const indexFor = (ring, tubeIndex) => (ring * tubeSegments) + tubeIndex;

    for (let ring = 0; ring < ringSegments; ring++) {
        const u = (ring / ringSegments) * Math.PI * 2;
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);
        for (let tubeIndex = 0; tubeIndex < tubeSegments; tubeIndex++) {
            const v = (tubeIndex / tubeSegments) * Math.PI * 2;
            const ringRadius = radius + (tube * Math.cos(v));
            vertices.push([ringRadius * cosU, ringRadius * sinU, tube * Math.sin(v)]);
        }
    }

    for (let ring = 0; ring < ringSegments; ring++) {
        const nextRing = (ring + 1) % ringSegments;
        for (let tubeIndex = 0; tubeIndex < tubeSegments; tubeIndex++) {
            const nextTube = (tubeIndex + 1) % tubeSegments;
            faces.push([
                indexFor(ring, tubeIndex),
                indexFor(ring, nextTube),
                indexFor(nextRing, nextTube),
                indexFor(nextRing, tubeIndex),
            ]);
        }
    }

    return { vertices, faces };
}

function buildPrimitiveTopologyFallback(mesh) {
    const params = mesh.userData?.params || {};
    const primitiveType = mesh.userData?.primitiveType || "";

    if (primitiveType === "cube") {
        const width = params.width || 1;
        const height = params.height || 1;
        const depth = params.depth || 1;
        const hx = width / 2;
        const hy = height / 2;
        const hz = depth / 2;
        return {
            vertices: [
                [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
                [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
            ],
            faces: [
                [0, 1, 2, 3],
                [1, 5, 6, 2],
                [5, 4, 7, 6],
                [4, 0, 3, 7],
                [3, 2, 6, 7],
                [4, 5, 1, 0],
            ],
        };
    }

    if (primitiveType === "plane") {
        return buildQuadGridTopology(
            params.width || 1,
            params.height || 1,
            Math.max(1, params.widthSeg || 1),
            Math.max(1, params.heightSeg || 1)
        );
    }

    if (primitiveType === "grid") {
        return buildQuadGridTopology(
            params.width || 1,
            params.depth || params.height || 1,
            Math.max(1, params.widthSeg || 1),
            Math.max(1, params.depthSeg || params.heightSeg || 1)
        );
    }

    if (primitiveType === "cylinder") {
        return buildQuadCylinderTopology(
            params.radiusTop || 0.5,
            params.radiusBottom || 0.5,
            params.height || 1,
            params.radialSeg || 16,
            params.heightSeg || 1
        );
    }

    if (primitiveType === "sphere") {
        return buildQuadUvSphereTopology(
            params.radius || 0.5,
            params.widthSeg || 16,
            params.heightSeg || 12
        );
    }

    if (primitiveType === "torus") {
        return buildQuadTorusTopology(
            params.radius || 0.7,
            params.tube || 0.25,
            params.radialSeg || 12,
            params.tubularSeg || 24
        );
    }

    return null;
}

class EditableMeshData {
    constructor() {
        this.vertices = [];
        this.faces = [];
        this.edges = [];
        this.edgeMap = new Map();
        this.vertexFaces = [];
        this.smoothAngle = 45;
        this.selectedVertices = new Set();
        this.selectedEdges = new Set();
        this.selectedFaces = new Set();
    }

    static fromMesh(mesh) {
        const data = new EditableMeshData();
        const topology = mesh.geometry?.userData?.editMeshTopology || buildPrimitiveTopologyFallback(mesh);
        data.smoothAngle = Number(
            topology?.smoothAngle
            ?? mesh.geometry?.userData?.smoothAngle
            ?? mesh.userData?.smoothAngle
            ?? 45
        ) || 45;

        if (topology && Array.isArray(topology.vertices) && Array.isArray(topology.faces)) {
            topology.vertices.forEach((vertex) => {
                data.vertices.push({
                    position: new THREE.Vector3(vertex[0], vertex[1], vertex[2]),
                });
            });

            topology.faces.forEach((face) => {
                data.faces.push({ verts: face.slice() });
            });

            data.rebuildTopology();
            return data;
        }

        const geometry = getIndexedGeometryClone(mesh.geometry);
        const positions = geometry.attributes.position;
        const indices = geometry.index.array;

        for (let i = 0; i < positions.count; i++) {
            data.vertices.push({
                position: new THREE.Vector3().fromBufferAttribute(positions, i),
            });
        }

        for (let i = 0; i < indices.length; i += 3) {
            data.faces.push({
                verts: [indices[i], indices[i + 1], indices[i + 2]],
            });
        }

        geometry.dispose();
        data.rebuildTopology();
        return data;
    }

    rebuildTopology() {
        this.edges = [];
        this.edgeMap = new Map();
        this.vertexFaces = Array.from({ length: this.vertices.length }, () => []);

        this.faces.forEach((face, faceIndex) => {
            const verts = face.verts;
            verts.forEach((vertexIndex) => {
                if (this.vertexFaces[vertexIndex]) {
                    this.vertexFaces[vertexIndex].push(faceIndex);
                }
            });
            for (let i = 0; i < verts.length; i++) {
                const a = verts[i];
                const b = verts[(i + 1) % verts.length];
                const key = a < b ? `${a}_${b}` : `${b}_${a}`;

                let edgeIndex = this.edgeMap.get(key);
                if (edgeIndex === undefined) {
                    edgeIndex = this.edges.length;
                    this.edgeMap.set(key, edgeIndex);
                    this.edges.push({ a: Math.min(a, b), b: Math.max(a, b), faces: [faceIndex] });
                } else {
                    this.edges[edgeIndex].faces.push(faceIndex);
                }
            }
        });

        this.selectedVertices = new Set(
            [...this.selectedVertices].filter((index) => index >= 0 && index < this.vertices.length)
        );
        this.selectedEdges = new Set(
            [...this.selectedEdges].filter((index) => index >= 0 && index < this.edges.length)
        );
        this.selectedFaces = new Set(
            [...this.selectedFaces].filter((index) => index >= 0 && index < this.faces.length)
        );
    }

    computeFaceNormal(faceIndex) {
        const face = this.faces[faceIndex];
        if (!face) return new THREE.Vector3(0, 1, 0);
        const a = this.vertices[face.verts[0]].position;
        const b = this.vertices[face.verts[1]].position;
        const c = this.vertices[face.verts[2]].position;
        return new THREE.Vector3()
            .subVectors(c, b)
            .cross(new THREE.Vector3().subVectors(a, b))
            .normalize();
    }

    computeSmoothedNormal(faceIndex, vertexIndex, faceNormals) {
        const baseNormal = faceNormals[faceIndex] || this.computeFaceNormal(faceIndex);
        const linkedFaces = this.vertexFaces[vertexIndex] || [faceIndex];
        const thresholdRadians = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(this.smoothAngle, 1, 180));
        const thresholdDot = Math.cos(thresholdRadians);
        const normal = new THREE.Vector3();

        linkedFaces.forEach((linkedFaceIndex) => {
            const linkedNormal = faceNormals[linkedFaceIndex] || this.computeFaceNormal(linkedFaceIndex);
            if (linkedNormal.dot(baseNormal) >= thresholdDot) {
                normal.add(linkedNormal);
            }
        });

        if (normal.lengthSq() <= 1e-8) return baseNormal.clone();
        return normal.normalize();
    }

    buildRenderData() {
        const positions = [];
        const normals = [];
        const liveTopologyVertexMap = [];
        const faceNormals = this.faces.map((_, faceIndex) => this.computeFaceNormal(faceIndex));

        this.faces.forEach((face, faceIndex) => {
            if (face.verts.length < 3) return;
            for (let i = 1; i < face.verts.length - 1; i++) {
                const tri = [face.verts[0], face.verts[i], face.verts[i + 1]];
                tri.forEach((vertexIndex) => {
                    const vertex = this.vertices[vertexIndex]?.position;
                    if (!vertex) return;
                    const normal = this.computeSmoothedNormal(faceIndex, vertexIndex, faceNormals);
                    positions.push(vertex.x, vertex.y, vertex.z);
                    normals.push(normal.x, normal.y, normal.z);
                    liveTopologyVertexMap.push(vertexIndex);
                });
            }
        });

        return { positions, normals, liveTopologyVertexMap };
    }

    toBufferGeometry() {
        const { positions, normals, liveTopologyVertexMap } = this.buildRenderData();

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geometry.userData = geometry.userData || {};
        geometry.userData.liveTopologyVertexMap = liveTopologyVertexMap;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    clearSelection() {
        this.selectedVertices.clear();
        this.selectedEdges.clear();
        this.selectedFaces.clear();
    }
}

const UnifiedModelingSystem = {
    initialized: false,
    handlesToolbar: true,
    activeMesh: null,
    editableMesh: null,
    isEditMode: false,
    selectMode: "vertex",
    activeArchitectureTool: null,
    activePolygonTool: null,
    architecturePoints: [],
    // A CAD plan is deliberately kept separate from a one-shot wall command.
    // It lets an architect trace any closed footprint in the 2D plan before
    // committing it as a coordinated 3D wall + slab model.
    architecturePlanDraft: { points: [], closed: false },
    architectureSelection: null,
    architectureMessage: "",
    previewLine: null,
    previewMesh: null,
    previewData: null,
    lastMeasurementText: "",
    subObjectPivot: null,
    _transformControlsBound: false,
    _subObjectDragState: null,
    _subObjectDragDirty: false,
    _polygonDragState: null,
    _keybindingsBound: false,
    _viewportEventTarget: null,
    _viewportEventHandlers: null,
    _lastPointerContext: null,
    settings: {
        vertexScale: 1,
        edgeOpacity: 1.0,
        faceOpacity: 0.25,
        archHeight: 2.8,
        archThickness: 0.2,
        archWidth: 1.2,
        archDepth: 1.2,
        archSegments: 8,
        archAddFloor: true,
        archAddCeiling: false,
        archUnits: "m",
        archStoryHeight: 3.2,
        archCurrentStory: 0,
    },
    currentTransformMode: "translate",

    init() {
        if (this.initialized) {
            this.ensureHelperGroups();
            this.readUiSettings();
            this.bindTransformControls();
            this.bindViewportEvents();
            return;
        }

        this.ensureHelperGroups();
        this.readUiSettings();
        this.bindTransformControls();
        this.bindViewportEvents();
        this.bindKeyShortcuts();
        this.initialized = true;
        window.UnifiedModelingSystem = this;
        window.vertexHelpers = vertexHelpers;
        window.edgeHelpers = edgeHelpers;
        window.faceHelpers = faceHelpers;
    },

    ensureHelperGroups() {
        addModelingHelperGroup(vertexHelpers);
        addModelingHelperGroup(edgeHelpers);
        addModelingHelperGroup(faceHelpers);
        addModelingHelperGroup(softFaceHelpers);
        addModelingHelperGroup(modelingPreviewHelpers);

        // Mark helper groups to be ignored in hierarchy
        vertexHelpers.userData = vertexHelpers.userData || {};
        vertexHelpers.userData.ignoreInHierarchy = true;
        edgeHelpers.userData = edgeHelpers.userData || {};
        edgeHelpers.userData.ignoreInHierarchy = true;
        faceHelpers.userData = faceHelpers.userData || {};
        faceHelpers.userData.ignoreInHierarchy = true;
        softFaceHelpers.userData = softFaceHelpers.userData || {};
        softFaceHelpers.userData.ignoreInHierarchy = true;
        modelingPreviewHelpers.userData = modelingPreviewHelpers.userData || {};
        modelingPreviewHelpers.userData.ignoreInHierarchy = true;
    },

    bindKeyShortcuts() {
        if (this._keybindingsBound) return;
        window.addEventListener("keydown", (event) => {
            if (!this.isEditMode) return;
            const tag = event.target?.tagName?.toLowerCase?.() || "";
            if (tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable) return;

            const key = event.key.toLowerCase();
            if (event.key === "Delete" || event.key === "Backspace" || key === "x") {
                if (this.getSelectionCount() <= 0) return;
                event.preventDefault();
                this.deleteSelection();
            } else if (event.key === "1") {
                event.preventDefault();
                this.setSelectionMode("vertex");
            } else if (event.key === "2") {
                event.preventDefault();
                this.setSelectionMode("edge");
            } else if (event.key === "3") {
                event.preventDefault();
                this.setSelectionMode("face");
            } else if (key === "a" && event.altKey) {
                event.preventDefault();
                this.clearSelection();
            } else if (key === "a") {
                event.preventDefault();
                this.selectAllElements();
            } else if (key === "l") {
                event.preventDefault();
                this.selectLinkedElements();
            } else if (key === "g") {
                event.preventDefault();
                transformControls?.setMode?.("translate");
                this.currentTransformMode = "translate";
            } else if (key === "r" && !event.ctrlKey) {
                event.preventDefault();
                transformControls?.setMode?.("rotate");
                this.currentTransformMode = "rotate";
            } else if (key === "s") {
                event.preventDefault();
                transformControls?.setMode?.("scale");
                this.currentTransformMode = "scale";
            } else if (key === "e" && this.selectMode === "face") {
                event.preventDefault();
                this.extrudeSelection();
            } else if (key === "r" && event.ctrlKey) {
                event.preventDefault();
                this.setPolygonTool("loopcut");
            } else if (key === "b" && event.ctrlKey) {
                event.preventDefault();
                this.setPolygonTool("bevel");
            } else if (key === "b") {
                // 3ds Max: Edit Soft Selection Mode hotkey (plain B)
                event.preventDefault();
                const engine = window.SoftSelectionEngine;
                if (engine) {
                    engine.enabled = !engine.enabled;
                    window.toggleSoftSelection?.(engine.enabled);
                }
            }
            window.ModelingToolkitController?.refreshUI?.();
            window.ModelingPanel?.refresh?.();
        });
        this._keybindingsBound = true;
    },

    bindViewportEvents() {
        const canvas = renderer?.domElement;
        if (!canvas || this._viewportEventTarget === canvas) return;

        if (this._viewportEventTarget && this._viewportEventHandlers) {
            this._viewportEventTarget.removeEventListener("pointerdown", this._viewportEventHandlers.down);
            this._viewportEventTarget.removeEventListener("pointermove", this._viewportEventHandlers.move);
            this._viewportEventTarget.removeEventListener("pointerup", this._viewportEventHandlers.up);
            this._viewportEventTarget.removeEventListener("pointercancel", this._viewportEventHandlers.cancel);
        }

        const handlers = {
            down: (event) => this.handlePointerDown(event),
            move: (event) => this.handlePointerMove(event),
            up: (event) => this.handlePointerUp(event),
            cancel: () => {
                this._polygonDragState = null;
                this._subObjectDragDirty = false;
            },
        };

        canvas.addEventListener("pointerdown", handlers.down);
        canvas.addEventListener("pointermove", handlers.move);
        canvas.addEventListener("pointerup", handlers.up);
        canvas.addEventListener("pointercancel", handlers.cancel);
        this._viewportEventTarget = canvas;
        this._viewportEventHandlers = handlers;
    },

    bindTransformControls() {
        if (this._transformControlsBound || typeof transformControls === "undefined" || !transformControls) return;

        transformControls.addEventListener("mouseDown", () => {
            if (!this.isEditMode || transformControls.object !== this.subObjectPivot) return;
            const localCenter = this.getSubObjectTransformCenter();
            if (!localCenter || !this.activeMesh) return;

            const softEngine = window.SoftSelectionEngine;
            let softWeights = null;
            if (softEngine && softEngine.enabled && this.editableMesh) {
                softWeights = softEngine.beginWeightSession(this.editableMesh);
            }

            this.currentTransformMode = typeof transformControls.getMode === "function"
                ? transformControls.getMode()
                : (this.currentTransformMode || "translate");
            this._subObjectDragDirty = false;
            this._subObjectDragState = {
                startPivotMatrixWorld: this.subObjectPivot.matrixWorld.clone(),
                selectedVertexIndices: [...this.getSelectedVertexIndices()],
                vertexPositions: new Map(),
                dragStartGeometry: this.activeMesh.geometry.clone(),
                softWeights:
                    window.SoftSelectionEngine?.enabled
                        ? window.SoftSelectionEngine
                            .beginWeightSession(this.editableMesh)
                        : null
            };

            const map = this._subObjectDragState.vertexPositions;
            const affected = softWeights
                ? Array.from(softWeights.keys())
                : this._subObjectDragState.selectedVertexIndices;
            affected.forEach((vertexIndex) => {
                const vertex = this.editableMesh?.vertices?.[vertexIndex];
                if (vertex) {
                    map.set(vertexIndex, vertex.position.clone());
                }
            });
        });

        transformControls.addEventListener("objectChange", () => {
            if (!this.isEditMode || transformControls.object !== this.subObjectPivot) return;
            this.applyTransformControlsDelta(false);
        });

        transformControls.addEventListener("mouseUp", () => {
            if (!this._subObjectDragState || transformControls.object !== this.subObjectPivot) return;
            this.applyTransformControlsDelta(true);
            this._subObjectDragState = null;
            this._subObjectDragDirty = false;
            window.SoftSelectionEngine?.endWeightSession?.();
        });

        this._transformControlsBound = true;
    },

    readUiSettings() {
        // Keeps settings logic consistent
        const readNumber = (id, fallback) => {
            const element = document.getElementById(id);
            if (!element) return fallback;
            const value = parseFloat(element.value);
            return Number.isFinite(value) ? value : fallback;
        };

        const readBool = (id, fallback) => {
            const element = document.getElementById(id);
            return element ? !!element.checked : fallback;
        };

        const readAnyNumber = (ids, fallback) => {
            for (const id of ids) {
                const element = document.getElementById(id);
                if (!element) continue;
                const value = parseFloat(element.value);
                if (Number.isFinite(value)) return value;
            }
            return fallback;
        };

        this.settings.vertexScale = readAnyNumber(["vertexSizeSlider"], this.settings.vertexScale);
        // Removed edge opacity settings mapping to keep edges permanently opaque (like Blender)
        this.settings.faceOpacity = readAnyNumber(["faceOpacitySlider"], this.settings.faceOpacity);
        this.settings.archHeight = readAnyNumber(["arch-cad-setting-height"], this.settings.archHeight);
        this.settings.archThickness = readAnyNumber(["arch-cad-setting-thickness"], this.settings.archThickness);
        this.settings.archWidth = readAnyNumber(["arch-cad-setting-width"], this.settings.archWidth);
        this.settings.archDepth = readAnyNumber(["arch-cad-setting-depth"], this.settings.archDepth);
        this.settings.archSegments = Math.max(1, Math.round(readAnyNumber(["arch-cad-setting-segments"], this.settings.archSegments)));
        const floorToggle = document.getElementById("arch-cad-floor-toggle");
        const ceilingToggle = document.getElementById("arch-cad-ceiling-toggle");
        this.settings.archAddFloor = floorToggle ? floorToggle.classList.contains("active") : this.settings.archAddFloor;
        this.settings.archAddCeiling = ceilingToggle ? ceilingToggle.classList.contains("active") : this.settings.archAddCeiling;
        this.settings.archUnits = document.getElementById("arch-cad-unit-select")?.value || this.settings.archUnits;
    },

    getSelectionCount() {
        if (!this.editableMesh) return 0;
        if (this.selectMode === "vertex") return this.editableMesh.selectedVertices.size;
        if (this.selectMode === "edge") return this.editableMesh.selectedEdges.size;
        return this.editableMesh.selectedFaces.size;
    },

    resolveMeshTarget() {
        if (typeof selectedObject !== "undefined" && selectedObject) {
            if (selectedObject.isMesh) return selectedObject;
            if (selectedObject.getObjectByProperty) {
                const childMesh = selectedObject.getObjectByProperty("isMesh", true);
                if (childMesh && childMesh.isMesh) return childMesh;
            }
            if (selectedObject.children && selectedObject.children.length > 0) {
                for (const child of selectedObject.children) {
                    if (child.isMesh && child.geometry) return child;
                    if (child.children && child.children.length > 0) {
                        const found = child.getObjectByProperty("isMesh", true);
                        if (found && found.isMesh) return found;
                    }
                }
            }
        }
        if (typeof activeObject !== "undefined" && activeObject && activeObject.isMesh) return activeObject;
        if (this.activeMesh && this.activeMesh.isMesh) return this.activeMesh;
        return null;
    },

    attachSelectionTarget() {
        const mesh = this.resolveMeshTarget();
        if (!mesh) {
            this.architectureMessage = "No mesh selected in the hierarchy.";
            return false;
        }

        this.setActiveMesh(mesh);
        this.architectureMessage = `Attached ${mesh.name || "mesh"} for editing.`;
        return true;
    },

    setActiveMesh(mesh) {
        if (!mesh || !mesh.isMesh) return false;
        this.activeMesh = mesh;
        if (typeof selectedObject !== "undefined") selectedObject = mesh;
        window.selectedObject = mesh;
        if (typeof activeObject !== "undefined") activeObject = mesh;
        this.editableMesh = EditableMeshData.fromMesh(mesh);
        this.syncLegacySelection();
        this.rebuildAllHelpers();
        return true;
    },

    disableGlobalSelectionSystems() {
        // Disable external tools
        if (typeof window.selectionSystem !== "undefined" && window.selectionSystem) window.selectionSystem._enabled = false;
        if (typeof window.selectionManager !== "undefined" && window.selectionManager) window.selectionManager.enabled = false;
        if (typeof window.selectionEnabled !== "undefined") window.selectionEnabled = false;

        // Force clear external selection passes (like OutlinePass) to drop the yellow overlay
        if (typeof window.clearSelection === "function") window.clearSelection();
        if (typeof window.outlinePass !== "undefined" && window.outlinePass) window.outlinePass.selectedObjects = [];

        // If the engine uses emissive highlighting, nullify it temporarily
        if (this.activeMesh && this.activeMesh.material) {
            const mats = Array.isArray(this.activeMesh.material) ? this.activeMesh.material : [this.activeMesh.material];
            mats.forEach(m => {
                if (m.emissive && m.emissive.getHex() !== 0x000000) {
                    m.userData._prevEmissive = m.emissive.getHex();
                    m.emissive.setHex(0x000000);
                }
            });
        }
    },

    enableGlobalSelectionSystems() {
        if (typeof window.selectionSystem !== "undefined" && window.selectionSystem) window.selectionSystem._enabled = true;
        if (typeof window.selectionManager !== "undefined" && window.selectionManager) window.selectionManager.enabled = true;
        if (typeof window.selectionEnabled !== "undefined") window.selectionEnabled = true;

        // Restore original emissive material values if they were suppressed
        if (this.activeMesh && this.activeMesh.material) {
            const mats = Array.isArray(this.activeMesh.material) ? this.activeMesh.material : [this.activeMesh.material];
            mats.forEach(m => {
                if (m.userData._prevEmissive !== undefined) {
                    m.emissive.setHex(m.userData._prevEmissive);
                    delete m.userData._prevEmissive;
                }
            });
        }
    },

    enterDraftMode() {
        this.init();
        this.isEditMode = true;
        window.isModelingMode = true;
        this.activeMesh = null;
        this.editableMesh = null;
        this.activePolygonTool = null;
        this.architecturePoints = [];
        this.architectureSelection = null;
        this.clearPreview();
        this.setViewportCursor("crosshair");
        if (typeof window.clearHoverObject === "function") window.clearHoverObject();
        this.disableGlobalSelectionSystems();
        if (transformControls) transformControls.detach();
        this.clearAllHelpers();
        this.architectureMessage = "Drafting mode active. Architectural tools can draw directly into the scene.";
        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
        return true;
    },

    enterEditMode() {
        this.init();

        if (!this.attachSelectionTarget()) {
            console.warn("⚠️ Modeling Mode: No valid mesh target found. Select a mesh object first.");
            this.isEditMode = false;
            window.isModelingMode = false;
            if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
            return false;
        }

        this.isEditMode = true;
        window.isModelingMode = true;
        if (typeof window.clearHoverObject === "function") window.clearHoverObject();

        // This clears the yellow highlight!
        this.disableGlobalSelectionSystems();

        if (transformControls) transformControls.detach();
        this.rebuildAllHelpers();

        if (vertexHelpers) vertexHelpers.visible = true;
        if (edgeHelpers) edgeHelpers.visible = true;
        if (faceHelpers) faceHelpers.visible = true;

        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
        return true;
    },

    exitEditMode() {
        this.isEditMode = false;
        window.isModelingMode = false;
        this.activeArchitectureTool = null;
        window.activeArchTool = null;
        this.activePolygonTool = null;
        this.architecturePoints = [];
        this.architectureSelection = null;
        this.architectureMessage = "";
        this.clearPreview();
        this.setViewportCursor("default");
        this.clearSelection();
        this.clearAllHelpers();
        if (typeof window.clearHoverObject === "function") window.clearHoverObject();
        this._subObjectDragState = null;
        this._subObjectDragDirty = false;
        this._polygonDragState = null;
        if (this.subObjectPivot) this.subObjectPivot.visible = false;

        // Re-enable external selection
        this.enableGlobalSelectionSystems();

        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
    },

    toggleEditMode() {
        if (this.isEditMode) {
            this.exitEditMode();
        } else {
            this.enterEditMode();
        }
    },

    setSelectionMode(mode) {
        if (!this.isEditMode) return;
        this.selectMode = mode;
        this.rebuildAllHelpers();
        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
    },

    clearSelection() {
        if (!this.editableMesh) return;
        this.editableMesh.clearSelection();
        this.syncLegacySelection();
        this.rebuildAllHelpers();
        this.updateSubObjectTransformGizmo();
    },

    selectAllElements() {
        if (!this.editableMesh) return;
        const selected = this.selectMode === "vertex"
            ? this.editableMesh.selectedVertices
            : this.selectMode === "edge"
                ? this.editableMesh.selectedEdges
                : this.editableMesh.selectedFaces;
        const total = this.selectMode === "vertex"
            ? this.editableMesh.vertices.length
            : this.selectMode === "edge"
                ? this.editableMesh.edges.length
                : this.editableMesh.faces.length;

        selected.clear();
        for (let index = 0; index < total; index++) selected.add(index);
        this.syncLegacySelection();
        this.rebuildAllHelpers();
        this.updateSubObjectTransformGizmo();
        this.architectureMessage = total + " " + this.selectMode + " elements selected.";
    },

    invertSelection() {
        if (!this.editableMesh) return;
        const selected = this.selectMode === "vertex"
            ? this.editableMesh.selectedVertices
            : this.selectMode === "edge"
                ? this.editableMesh.selectedEdges
                : this.editableMesh.selectedFaces;
        const total = this.selectMode === "vertex"
            ? this.editableMesh.vertices.length
            : this.selectMode === "edge"
                ? this.editableMesh.edges.length
                : this.editableMesh.faces.length;
        const previous = new Set(selected);
        selected.clear();
        for (let index = 0; index < total; index++) {
            if (!previous.has(index)) selected.add(index);
        }
        this.syncLegacySelection();
        this.rebuildAllHelpers();
        this.updateSubObjectTransformGizmo();
        this.architectureMessage = "Selection inverted.";
    },

    selectLinkedElements() {
        if (!this.editableMesh) return;
        const seeds = this.getSelectedVertexIndices();
        if (!seeds.size) {
            this.architectureMessage = "Select an element before selecting linked geometry.";
            return;
        }

        const connected = new Set(seeds);
        const queue = [...seeds];
        const adjacency = new Map();
        this.editableMesh.edges.forEach((edge) => {
            if (!adjacency.has(edge.a)) adjacency.set(edge.a, new Set());
            if (!adjacency.has(edge.b)) adjacency.set(edge.b, new Set());
            adjacency.get(edge.a).add(edge.b);
            adjacency.get(edge.b).add(edge.a);
        });

        while (queue.length) {
            const vertex = queue.shift();
            (adjacency.get(vertex) || []).forEach((neighbor) => {
                if (connected.has(neighbor)) return;
                connected.add(neighbor);
                queue.push(neighbor);
            });
        }

        if (this.selectMode === "vertex") {
            this.editableMesh.selectedVertices = connected;
        } else if (this.selectMode === "edge") {
            this.editableMesh.selectedEdges.clear();
            this.editableMesh.edges.forEach((edge, index) => {
                if (connected.has(edge.a) && connected.has(edge.b)) this.editableMesh.selectedEdges.add(index);
            });
        } else {
            this.editableMesh.selectedFaces.clear();
            this.editableMesh.faces.forEach((face, index) => {
                if (face.verts.every((vertex) => connected.has(vertex))) this.editableMesh.selectedFaces.add(index);
            });
        }

        this.syncLegacySelection();
        this.rebuildAllHelpers();
        this.updateSubObjectTransformGizmo();
        this.architectureMessage = "Linked geometry selected.";
    },

    syncLegacySelection() {
        if (!this.editableMesh) {
            window.selectedElements = [];
            return;
        }

        const payload = [];
        this.editableMesh.selectedVertices.forEach((index) => {
            payload.push({ userData: { type: "vertex", index, vertexIndex: index, indices: [index] } });
        });
        this.editableMesh.selectedEdges.forEach((index) => {
            const edge = this.editableMesh.edges[index];
            payload.push({ userData: { type: "edge", edgeIndex: index, indices: [edge.a, edge.b] } });
        });
        this.editableMesh.selectedFaces.forEach((index) => {
            const face = this.editableMesh.faces[index];
            payload.push({ userData: { type: "face", faceIndex: index, indices: face.verts.slice() } });
        });
        window.selectedElements = payload;
    },

    rebuildAllHelpers() {
        this.ensureHelperGroups();
        this.readUiSettings();
        this.clearAllHelpers();

        if (!this.isEditMode || !this.activeMesh || !this.editableMesh) return;

        // Build all visual layers correctly styled
        if (this.selectMode === "face") {
            this.buildFaceHelpers();
        }
        this.buildEdgeHelpers();
        if (this.selectMode === "vertex") {
            this.buildVertexHelpers();
        }
        this.rebuildSoftSelectionViews();
    },

    // ── Soft Selection viewport layers (heatmap + shaded faces) ──────────────
    rebuildSoftSelectionViews() {
        const engine = window.SoftSelectionEngine;
        if (!engine || !this.isEditMode || !this.editableMesh) return;

        const em = this.editableMesh;
        const weights = engine.enabled ? engine.computeMeshWeights(em) : null;

        // 1. Shaded Face Toggle: tint faces by average weight when enabled.
        clearGroup(softFaceHelpers);
        if (engine.enabled && engine.showShadedFaces && em.faces.length) {
            const positions = [];
            const colors = [];
            const color = new THREE.Color();
            const faceWeights = engine.faceWeights ? engine.faceWeights(em) : null;
            em.faces.forEach((face, fIndex) => {
                if (!face.verts || face.verts.length < 3) return;
                const w = faceWeights ? faceWeights[fIndex] : 0;
                color.copy(engine.getHeatmapColor(w));
                color.multiplyScalar(0.85);
                for (const vi of face.verts) {
                    const pos = this.getVertexWorldPosition(vi);
                    positions.push(pos.x, pos.y, pos.z);
                    colors.push(color.r, color.g, color.b);
                }
            });

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
            const indices = [];
            em.faces.forEach((face, fIndex) => {
                const base = fIndex * (face.verts?.length || 3);
                for (let i = 1; i < (face.verts?.length || 3) - 1; i++) {
                    indices.push(base, base + i, base + i + 1);
                }
            });
            geometry.setIndex(indices);

            const material = new THREE.MeshBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.32,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
            });
            const overlay = new THREE.Mesh(geometry, material);
            overlay.renderOrder = 995;
            overlay.userData = { type: "softShadeFaces", isSoftSelectionView: true };
            softFaceHelpers.add(overlay);
            softFaceHelpers.visible = engine.showShadedFaces;
        }
    },

    showSplineExtrudePreview(object3d) {
        this.clearSplineExtrudePreview();
        if (!object3d) return;
        object3d.userData = object3d.userData || {};
        object3d.userData.splinePreview = true;
        modelingPreviewHelpers.add(object3d);
        modelingPreviewHelpers.visible = true;
    },

    clearSplineExtrudePreview() {
        const removals = modelingPreviewHelpers.children.filter(
            (child) => child.userData && child.userData.splinePreview
        );
        removals.forEach((child) => {
            modelingPreviewHelpers.remove(child);
            disposeObject3D(child);
        });
    },

    clearAllHelpers() {
        clearGroup(vertexHelpers);
        clearGroup(edgeHelpers);
        clearGroup(faceHelpers);
        clearGroup(softFaceHelpers);
        clearGroup(modelingPreviewHelpers);
    },

    clearPreview() {
        clearGroup(modelingPreviewHelpers);
        this.previewLine = null;
        this.previewMesh = null;
        this.previewData = null;
    },

    setViewportCursor(cursor) {
        if (renderer?.domElement) {
            renderer.domElement.style.cursor = cursor || "default";
        }
    },

    getPolygonToolCursor(toolName = this.activePolygonTool) {
        if (["bevel", "inset", "edgeslide", "shrinkfatten", "shear"].includes(toolName)) {
            return this._polygonDragState?.tool === toolName ? "ew-resize" : "grab";
        }
        if (toolName === "loopcut") return "crosshair";
        return toolName ? "crosshair" : "default";
    },

    getVertexWorldPosition(index) {
        return this.editableMesh.vertices[index].position.clone().applyMatrix4(this.activeMesh.matrixWorld);
    },

    getAverageScale() {
        const geometry = this.activeMesh.geometry;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);
        return Math.max(size.length() / 30, 0.04);
    },

    buildVertexHelpers() {
        const baseRadius = this.getAverageScale() * this.settings.vertexScale * 0.3;
        const defaultColor = 0x000000; // Blender Black
        const selectedColor = 0xff8c00; // Blender Orange

        this.editableMesh.vertices.forEach((vertex, index) => {
            const isSelected = this.editableMesh.selectedVertices.has(index);
            const helper = new THREE.Mesh(
                new THREE.SphereGeometry(baseRadius, 8, 8),
                new THREE.MeshBasicMaterial({
                    color: isSelected ? selectedColor : defaultColor,
                    depthTest: true, // Keep inside geometry correctly
                    polygonOffset: true,
                    polygonOffsetFactor: -3, // Prevent z-fighting
                    polygonOffsetUnits: -3
                })
            );
            helper.position.copy(this.getVertexWorldPosition(index));
            helper.renderOrder = 999;
            helper.userData = { type: "vertex", index };
            helper.visible = true;
            vertexHelpers.add(helper);
        });

        vertexHelpers.visible = true;
    },

    buildEdgeHelpers() {
        const defaultColor = 0x000000; // Solid Blender Black
        const selectedColor = 0xff8c00; // Blender Orange
        const hitRadius = Math.max(this.getAverageScale() * 0.2, 0.08);

        this.editableMesh.edges.forEach((edge, index) => {
            const start = this.getVertexWorldPosition(edge.a);
            const end = this.getVertexWorldPosition(edge.b);
            const points = [start, end];
            const helperGroup = new THREE.Group();
            helperGroup.userData = { type: "edge", index };

            const isSelected = this.editableMesh.selectedEdges.has(index);

            // The visual black wireframe edge
            const helperLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({
                    color: isSelected ? selectedColor : defaultColor,
                    transparent: false,
                    opacity: 1.0,
                    depthTest: true, // Crucial: hides edges behind faces
                    polygonOffset: true,
                    polygonOffsetFactor: -1, // Pull forward slightly to avoid z-fighting with faces
                    polygonOffsetUnits: -1
                })
            );
            helperLine.renderOrder = 997;
            helperLine.userData = { type: "edge", index, isVisualEdge: true };

            // Invisible thick cylinder strictly for making mouse clicks easier
            const direction = new THREE.Vector3().subVectors(end, start);
            const length = direction.length();
            if (length > 1e-6) {
                const hitGeometry = new THREE.CylinderGeometry(hitRadius, hitRadius, length, 6, 1, false);
                const hitMaterial = new THREE.MeshBasicMaterial({
                    colorWrite: false, // Totally invisible
                    depthWrite: false,
                    transparent: true,
                    opacity: 0,
                    depthTest: true
                });
                const hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
                hitMesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
                hitMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
                hitMesh.renderOrder = 998;
                hitMesh.userData = { type: "edge", index, isHitProxy: true };
                helperGroup.add(hitMesh);
            }

            helperGroup.add(helperLine);
            edgeHelpers.add(helperGroup);
        });

        edgeHelpers.visible = true;
    },

    buildFaceHelpers() {
        const selectedColor = 0xff8c00; // Blender Orange
        const selectedOpacity = this._subObjectDragState ? 0 : this.settings.faceOpacity;

        this.editableMesh.faces.forEach((face, index) => {
            const points = face.verts.map((vertexIndex) => this.getVertexWorldPosition(vertexIndex));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const faceIndices = [];
            for (let i = 1; i < face.verts.length - 1; i++) {
                faceIndices.push(0, i, i + 1);
            }
            geometry.setIndex(faceIndices);
            geometry.computeVertexNormals();

            const isSelected = this.editableMesh.selectedFaces.has(index);

            const material = new THREE.MeshBasicMaterial({
                color: selectedColor,
                transparent: selectedOpacity > 0,
                opacity: isSelected ? selectedOpacity : 0.0,
                side: THREE.DoubleSide,
                depthTest: true,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2,
            });

            // If it's not selected and we aren't in face mode, don't even let raycaster hit it
            if (!isSelected && this.selectMode !== "face") {
                material.visible = false;
            } else if (!isSelected) {
                // We are in face mode, but it's unselected. Keep invisible to eye, but catch raycast
                material.colorWrite = false;
                material.depthWrite = false;
            } else if (selectedOpacity <= 0) {
                material.colorWrite = false;
                material.depthWrite = false;
            }

            const helper = new THREE.Mesh(geometry, material);
            helper.renderOrder = 996;
            helper.userData = { type: "face", index };
            faceHelpers.add(helper);
        });

        faceHelpers.visible = true;
    },

    getPointerViewportContext(event) {
        const canvas = renderer?.domElement;
        if (!canvas || !event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;

        const canvasRect = canvas.getBoundingClientRect();
        if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;

        let viewportRect = canvasRect;
        let viewportCamera = null;
        let viewportPanel = null;
        const viewportSystem = window.SMViewportSystem;

        // SMViewportSystem renders panels into scissored regions of the same
        // canvas. Ray coordinates must therefore be normalized against the
        // panel below the pointer, not against the complete WebGL canvas.
        if (viewportSystem?.panels?.values) {
            for (const panel of viewportSystem.panels.values()) {
                const panelRect = panel?.dom?.getBoundingClientRect?.();
                if (!panelRect || panelRect.width <= 0 || panelRect.height <= 0) continue;
                if (event.clientX < panelRect.left || event.clientX > panelRect.right ||
                    event.clientY < panelRect.top || event.clientY > panelRect.bottom) continue;
                viewportPanel = panel;
                viewportRect = panelRect;
                viewportCamera = panel.camera || null;
                break;
            }
        }

        // Architecture commands should never project through a Game View.
        if (viewportPanel?.type && viewportPanel.type !== "viewport") return null;

        const left = Math.max(canvasRect.left, viewportRect.left);
        const top = Math.max(canvasRect.top, viewportRect.top);
        const right = Math.min(canvasRect.right, viewportRect.right);
        const bottom = Math.min(canvasRect.bottom, viewportRect.bottom);
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0) return null;
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) return null;

        if (!viewportCamera && typeof window.getActiveCameraForRaycast === "function") {
            try { viewportCamera = window.getActiveCameraForRaycast() || null; } catch (_) { viewportCamera = null; }
        }
        viewportCamera = viewportCamera
            || window.cameraSystem?.activeCamera
            || window.getActiveEditorCamera?.()
            || window.camera
            || camera;
        if (!viewportCamera) return null;

        return {
            camera: viewportCamera,
            panel: viewportPanel,
            rect: { left, top, right, bottom, width, height },
            x: ((event.clientX - left) / width) * 2 - 1,
            y: -((event.clientY - top) / height) * 2 + 1,
        };
    },

    updateRayFromEvent(event) {
        if (!renderer || !raycaster || !mouse) return false;

        const context = this.getPointerViewportContext(event);
        if (!context) return false;
        mouse.set(context.x, context.y);
        context.camera.updateMatrixWorld?.(true);
        raycaster.setFromCamera(mouse, context.camera);
        raycaster.params.Line.threshold = 0.35;
        raycaster.params.Mesh = raycaster.params.Mesh || {};
        this._lastPointerContext = context;
        return true;
    },

    raycastSelectionHelpers(event) {
        if (!this.updateRayFromEvent(event)) return null;

        const group =
            this.selectMode === "vertex" ? vertexHelpers :
                this.selectMode === "edge" ? edgeHelpers :
                    faceHelpers;

        if (!group || !group.children || group.children.length === 0) return null;

        const hits = raycaster.intersectObjects(group.children, true);
        return hits.length ? hits[0] : null;
    },

    togglePickedSelection(pick, additive) {
        if (!this.editableMesh || !pick) return;

        const target = pick.object?.userData?.type ? pick.object : pick.object?.parent;
        if (!target?.userData?.type) return;

        const { type, index } = target.userData;
        const data =
            type === "vertex" ? this.editableMesh.selectedVertices :
                type === "edge" ? this.editableMesh.selectedEdges :
                    this.editableMesh.selectedFaces;

        if (!additive) this.editableMesh.clearSelection();

        if (data.has(index) && additive) {
            data.delete(index);
        } else {
            data.add(index);
        }

        this.syncLegacySelection();
        this.rebuildAllHelpers();
        this.updateSubObjectTransformGizmo();

        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
    },

    updateSubObjectTransformGizmo() {
        if (this.activePolygonTool) {
            if (transformControls) transformControls.detach();
            if (this.subObjectPivot) this.subObjectPivot.visible = false;
            return;
        }

        if (!this.editableMesh || this.getSelectionCount() === 0) {
            if (transformControls) transformControls.detach();
            if (this.subObjectPivot) this.subObjectPivot.visible = false;
            return;
        }

        const center = this.getSubObjectTransformCenter();
        if (!center || !transformControls) return;

        if (!this.subObjectPivot) {
            this.subObjectPivot = new THREE.Object3D();
            this.subObjectPivot.name = "UnifiedModelingPivot";
            this.subObjectPivot.userData = this.subObjectPivot.userData || {};
            this.subObjectPivot.userData.isSystemObject = true;
            this.subObjectPivot.userData.selectable = false;
            this.subObjectPivot.userData.ignoreInHierarchy = true;
            this.subObjectPivot.userData.selectionProxy = this.activeMesh;
            scene.add(this.subObjectPivot);
        }

        this.subObjectPivot.userData.selectionProxy = this.activeMesh;
        const worldCenter = center.clone().applyMatrix4(this.activeMesh.matrixWorld);
        this.subObjectPivot.position.copy(worldCenter);
        this.subObjectPivot.quaternion.copy(this.activeMesh.getWorldQuaternion(new THREE.Quaternion()));
        this.subObjectPivot.scale.set(1, 1, 1);
        this.subObjectPivot.updateMatrixWorld(true);
        this.subObjectPivot.visible = true;

        if (transformControls.object) transformControls.detach();

        const desiredMode = this.currentTransformMode
            || (typeof transformControls.getMode === "function" ? transformControls.getMode() : null)
            || "translate";
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
        transformControls.setSize?.(1.15);
        transformControls.setMode(desiredMode);
        transformControls.attach(this.subObjectPivot);
        transformControls.enabled = true;
        transformControls.visible = true;
        this.currentTransformMode = desiredMode;
    },

    handlePointerDown(event) {
        if (!this.isEditMode) return;
        this.bindTransformControls();

        if (["bevel", "inset", "edgeslide", "shrinkfatten", "shear"].includes(this.activePolygonTool)) {
            const selectionCount = this.selectMode === "face"
                ? (this.editableMesh?.selectedFaces?.size || 0)
                : this.selectMode === "edge"
                    ? (this.editableMesh?.selectedEdges?.size || 0)
                    : (this.editableMesh?.selectedVertices?.size || 0);

            if (!selectionCount) {
                const toolLabel = this.getPolygonToolLabel(this.activePolygonTool);
                this.architectureMessage = this.selectMode === "face"
                    ? `${toolLabel} needs one or more selected faces.`
                    : this.selectMode === "edge"
                        ? `${toolLabel} needs one or more selected edges.`
                        : `${toolLabel} needs one or more selected vertices.`;
                if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
                return;
            }

            if (event?.button !== 0) return;
            this._polygonDragState = {
                tool: this.activePolygonTool,
                startX: event.clientX,
                startY: event.clientY,
                amount: 0.08,
            };
            this.setViewportCursor(this.getPolygonToolCursor(this.activePolygonTool));
            this.updatePolygonToolPreview(event);
        }
    },

    handlePointerMove(event) {
        if (!this.isEditMode) return;
        if (this.activeArchitectureTool) {
            this.updateArchitecturePreview(event);
            return;
        }
        if (this.activePolygonTool) {
            if (["bevel", "inset", "edgeslide", "shrinkfatten", "shear"].includes(this.activePolygonTool)
                && this._polygonDragState?.tool === this.activePolygonTool) {
                const deltaX = event.clientX - this._polygonDragState.startX;
                const amount = this.activePolygonTool === "bevel" || this.activePolygonTool === "inset"
                    ? THREE.MathUtils.clamp(Math.abs(deltaX) / 220, 0.01, 0.45)
                    : THREE.MathUtils.clamp(deltaX / 180, -1.5, 1.5);
                this._polygonDragState.amount = amount;
            }
            this.updatePolygonToolPreview(event);
        }
    },

    handlePointerUp(event) {
        if (!this.isEditMode || event.button !== 0) return;

        const controls = window.transformControls || (typeof transformControls !== "undefined" ? transformControls : null);
        if (controls && (controls.dragging || controls.axis)) return;

        if (this._subObjectDragDirty) {
            this._subObjectDragDirty = false;
            return;
        }

        if (this.activeArchitectureTool) {
            this.handleArchitectureClick(event);
            if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
            return;
        }

        if (this.activePolygonTool) {
            if (["bevel", "inset", "edgeslide", "shrinkfatten", "shear"].includes(this.activePolygonTool)
                && this._polygonDragState?.tool === this.activePolygonTool) {
                this.applyPolygonTool(event);
                this._polygonDragState = null;
                this.setViewportCursor(this.getPolygonToolCursor(this.activePolygonTool));
                if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
                return;
            }
            this.applyPolygonTool(event);
            if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
            return;
        }

        const pick = this.raycastSelectionHelpers(event);
        if (pick) {
            this.togglePickedSelection(pick, event.shiftKey || event.ctrlKey || event.metaKey);
        } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
            this.clearSelection();
            this.updateSubObjectTransformGizmo();
        }
    },

    getGroundIntersection(event, planeElevation = null) {
        if (!this.updateRayFromEvent(event)) return null;
        const elevation = Number.isFinite(planeElevation)
            ? Number(planeElevation)
            : (this.activeArchitectureTool === "terrain" ? 0 : this.getCurrentStoryElevation());
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation);
        const point = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, point) ? point.clone() : null;
    },

    getWallIntersection(event) {
        if (!this.updateRayFromEvent(event)) return null;
        const targets = [];
        (window.architecturalElements || [])
            .filter((object) => object && object.userData && ["wall", "room", "curved-wall"].includes(object.userData.archType))
            .forEach((object) => this.collectWallTargetMeshes(object, targets));
        if (!targets.length) return null;
        const hits = raycaster.intersectObjects(targets, false);
        return hits.length ? hits[0] : null;
    },

    collectWallTargetMeshes(object, bucket = []) {
        if (!object) return bucket;
        if (object.isMesh && (object.userData?.archWallHost || object.userData?.archType === "wall")) {
            bucket.push(object);
        }
        if (Array.isArray(object.children)) {
            object.children.forEach((child) => this.collectWallTargetMeshes(child, bucket));
        }
        return bucket;
    },

    collectArchitecturalMeshes(object, bucket = []) {
        if (!object) return bucket;
        if (object.isMesh) bucket.push(object);
        if (Array.isArray(object.children)) {
            object.children.forEach((child) => this.collectArchitecturalMeshes(child, bucket));
        }
        return bucket;
    },

    getArchitectureIntersection(event) {
        if (!this.updateRayFromEvent(event)) return null;
        const targets = [];
        (window.architecturalElements || []).forEach((object) => this.collectArchitecturalMeshes(object, targets));
        if (!targets.length) return null;
        const hits = raycaster.intersectObjects(targets, false);
        return hits.length ? hits[0] : null;
    },

    resolveArchitectureHost(object) {
        let current = object || null;
        while (current) {
            if (current.userData?.wallData) return current;
            if (current.userData?.archType && current.userData.archType !== "wall") return current;
            current = current.parent || null;
        }
        return null;
    },

    setArchitectureTool(toolName) {
        if (!this.isEditMode && !this.enterDraftMode()) return;
        this.activeArchitectureTool = toolName;
        window.activeArchTool = toolName || null;
        this.activePolygonTool = null;
        this.architecturePoints = [];
        this.architectureSelection = null;
        this.clearPreview();
        this.setViewportCursor(toolName ? "crosshair" : "default");

        const messageMap = {
            wall: "Wall tool: click start point, then click end point.",
            room: "Room tool: click first corner, then click opposite corner.",
            column: "Column tool: click once on the ground to place a column.",
            slab: "Slab tool: click first corner, then click opposite corner.",
            beam: "Beam tool: click start point, then click end point.",
            stairs: "Stairs tool: click start point, then click end point.",
            door: "Door tool: click a wall face to place a door.",
            window: "Window tool: click a wall face to place a window.",
            roof: "Roof tool: click first corner, then click opposite corner.",
            "rect-extrude": "Rect Extrude: click first corner, then click opposite corner.",
            railing: "Railing tool: click start point, then click end point.",
            "curved-wall": "Curved Wall: click start point, then click end point.",
            facade: "Facade tool: click first corner, then click opposite corner.",
            offset: "Offset tool: click a wall, then click to place a parallel wall.",
            "array-linear": "Array tool: click an architectural object, then click to define spacing.",
            table: "Table tool: click once on the ground to place furniture.",
            chair: "Chair tool: click once on the ground to place furniture.",
            measure: "Measure tool: click start point, then click end point.",
            terrain: "Terrain tool: click once to place a terrain plane.",
            "cad-polyline": "CAD Polyline: click each corner. Use Finish plan (or CLOSE) when the footprint is complete.",
        };

        this.architectureMessage = toolName ? (messageMap[toolName] || "Architecture tool active.") : "Architecture tool cancelled.";
        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
    },

    setPolygonTool(toolName) {
        if (!this.isEditMode || !this.activeMesh || !this.editableMesh) {
            this.architectureMessage = "Select a mesh and enter Edit Mode first.";
            if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
            return;
        }

        if (toolName === "loopcut" && this.selectMode !== "edge") {
            this.setSelectionMode("edge");
        } else if ((toolName === "bevel" || toolName === "edgeslide") && this.selectMode === "vertex") {
            this.setSelectionMode("edge");
        } else if (toolName === "inset" && this.selectMode !== "face") {
            this.setSelectionMode("face");
        }

        this.activeArchitectureTool = null;
        window.activeArchTool = null;
        this.activePolygonTool = this.activePolygonTool === toolName ? null : toolName;
        this.clearPreview();
        this.setViewportCursor(this.getPolygonToolCursor(this.activePolygonTool));
        this.updateSubObjectTransformGizmo();

        const messageMap = {
            loopcut: "Loop Cut: hover an edge ring in edge mode, then click to insert the loop.",
            bevel: "Bevel: select one or more edges/faces first, then click in the viewport to apply.",
            inset: "Inset: select one or more faces, then click to create an inset region.",
            knife: "Knife Cut: split the selected faces into editable cut segments.",
            polybuild: "Poly Build: select 3 or 4 vertices, then build a new face.",
            bridge: "Bridge: select compatible open edges or face boundaries, then click to bridge.",
            spin: "Spin: select geometry and use the viewport cursor to define the spin.",
            smooth: "Smooth: relax the selected vertices while preserving the overall shape.",
            edgeslide: "Edge Slide: select edges, then drag horizontally to slide them across adjacent faces.",
            shrinkfatten: "Shrink/Fatten: drag horizontally to move the selection along its normals.",
            shear: "Shear: drag horizontally to shear the current selection.",
            ripregion: "Rip Region: split the selected face region away from neighboring geometry.",
            cutsurface: "Cut Surface: click across the mesh to define a surface cut.",
            edgetoprofile: "Edges To Profile: select edge chains, then click to convert to a profile.",
            shell: "Shell: click to add thickness to the current face selection.",
            boolean: "Boolean: click a target mesh to subtract against the active mesh.",
            polypen: "Poly Pen: click to place and connect new topology points.",
        };

        this.architectureMessage = this.activePolygonTool
            ? (messageMap[this.activePolygonTool] || "Polygon tool active.")
            : "Polygon tool cancelled.";

        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
    },

    getFaceEdgeIndices(face) {
        const result = [];
        if (!face?.verts?.length) return result;
        for (let i = 0; i < face.verts.length; i++) {
            const a = face.verts[i];
            const b = face.verts[(i + 1) % face.verts.length];
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            const edgeIndex = this.editableMesh.edgeMap.get(key);
            result.push(edgeIndex);
        }
        return result;
    },

    getEdgeMidpoint(edgeIndex) {
        const edge = this.editableMesh.edges[edgeIndex];
        if (!edge) return null;
        return this.getVertexWorldPosition(edge.a).add(this.getVertexWorldPosition(edge.b)).multiplyScalar(0.5);
    },

    drawPreviewSegment(start, end, color = 0xffd54a) {
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([start, end]),
            new THREE.LineBasicMaterial({
                color,
                depthTest: false,
                transparent: true,
                opacity: 0.95,
            })
        );
        line.renderOrder = 1200;
        modelingPreviewHelpers.add(line);
        modelingPreviewHelpers.visible = true;
        return line;
    },

    drawPreviewPoint(position, color = 0xfff36b, scale = 0.035) {
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(this.getAverageScale() * scale, 0.02), 12, 12),
            new THREE.MeshBasicMaterial({
                color,
                depthTest: false,
                transparent: true,
                opacity: 0.95,
            })
        );
        marker.position.copy(position);
        marker.renderOrder = 1201;
        modelingPreviewHelpers.add(marker);
        modelingPreviewHelpers.visible = true;
        return marker;
    },

    buildLoopCutOperation(edgeIndex) {
        if (edgeIndex == null || !this.editableMesh?.edges?.[edgeIndex]) return null;

        const visitedEdges = new Set();
        const faceMap = new Map();
        const queue = [edgeIndex];

        while (queue.length) {
            const currentEdgeIndex = queue.shift();
            if (visitedEdges.has(currentEdgeIndex)) continue;
            visitedEdges.add(currentEdgeIndex);

            const currentEdge = this.editableMesh.edges[currentEdgeIndex];
            if (!currentEdge) continue;

            currentEdge.faces.forEach((faceIndex) => {
                const face = this.editableMesh.faces[faceIndex];
                if (!face || face.verts.length !== 4) return;

                const faceEdges = this.getFaceEdgeIndices(face);
                const edgePos = faceEdges.indexOf(currentEdgeIndex);
                if (edgePos < 0) return;

                const oppositeEdgeIndex = faceEdges[(edgePos + 2) % 4];
                const cutEdgeAIndex = faceEdges[(edgePos + 1) % 4];
                const cutEdgeBIndex = faceEdges[(edgePos + 3) % 4];

                faceMap.set(faceIndex, {
                    faceIndex,
                    edgePos,
                    currentEdgeIndex,
                    oppositeEdgeIndex,
                    cutEdgeAIndex,
                    cutEdgeBIndex,
                });

                if (oppositeEdgeIndex != null && !visitedEdges.has(oppositeEdgeIndex)) {
                    queue.push(oppositeEdgeIndex);
                }
            });
        }

        return faceMap.size ? { edgeIndex, faces: [...faceMap.values()] } : null;
    },

    buildLoopCutPreviewFromEdge(edgeIndex) {
        const operation = this.buildLoopCutOperation(edgeIndex);
        if (!operation) return null;

        const ringEdges = new Set();
        operation.faces.forEach((info) => {
            const start = this.getEdgeMidpoint(info.cutEdgeAIndex);
            const end = this.getEdgeMidpoint(info.cutEdgeBIndex);
            if (start && end) {
                this.drawPreviewSegment(start, end, 0xfff200);
                this.drawPreviewPoint(start, 0xfff200, 0.028);
                this.drawPreviewPoint(end, 0xfff200, 0.028);
            }
            if (info.currentEdgeIndex != null) ringEdges.add(info.currentEdgeIndex);
            if (info.oppositeEdgeIndex != null) ringEdges.add(info.oppositeEdgeIndex);
        });

        ringEdges.forEach((edgeIndexInRing) => {
            const edge = this.editableMesh.edges[edgeIndexInRing];
            if (!edge) return;
            const start = this.getVertexWorldPosition(edge.a);
            const end = this.getVertexWorldPosition(edge.b);
            this.drawPreviewSegment(start, end, 0xff9800);
        });

        return operation;
    },

    buildFaceBevelPreview(faceIndex, amount = 0.18) {
        const face = this.editableMesh.faces[faceIndex];
        if (!face || face.verts.length < 3) return null;

        const localPoints = face.verts.map((vertexIndex) => this.editableMesh.vertices[vertexIndex].position.clone());
        const center = localPoints.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / localPoints.length);
        const insetWorldPoints = localPoints.map((point) => point.clone().lerp(center, amount).applyMatrix4(this.activeMesh.matrixWorld));

        for (let i = 0; i < insetWorldPoints.length; i++) {
            const a = insetWorldPoints[i];
            const b = insetWorldPoints[(i + 1) % insetWorldPoints.length];
            this.drawPreviewSegment(a, b);
        }

        return { type: "face-bevel", faceIndex, amount };
    },

    buildFaceBevelPreviewFromSelection(faceIndices, amount = 0.18) {
        const indices = (faceIndices || []).filter((index) => Number.isInteger(index));
        if (!indices.length) return null;

        indices.forEach((faceIndex) => {
            this.buildFaceBevelPreview(faceIndex, amount);
        });

        return { type: "face-bevel-selection", faceIndices: indices.slice(), amount };
    },

    getDirectedQuadFaceForEdge(face, edgeA, edgeB) {
        if (!face || face.verts.length !== 4) return null;
        const sequences = [face.verts.slice(), face.verts.slice().reverse()];
        for (const verts of sequences) {
            for (let i = 0; i < verts.length; i++) {
                if (verts[i] === edgeA && verts[(i + 1) % verts.length] === edgeB) {
                    return {
                        a: verts[i],
                        b: verts[(i + 1) % verts.length],
                        c: verts[(i + 2) % verts.length],
                        d: verts[(i + 3) % verts.length],
                    };
                }
            }
        }
        return null;
    },

    buildEdgeBevelOperation(edgeIndex, amount = 0.18) {
        const edge = this.editableMesh.edges[edgeIndex];
        if (!edge) return null;

        const operation = { edgeIndex, amount, faces: [] };
        edge.faces.forEach((faceIndex) => {
            const face = this.editableMesh.faces[faceIndex];
            const directed = this.getDirectedQuadFaceForEdge(face, edge.a, edge.b);
            if (!directed) return;
            operation.faces.push({ faceIndex, ...directed });
        });

        return operation.faces.length ? operation : null;
    },

    buildEdgeBevelPreview(edgeIndex, amount = 0.18) {
        const operation = this.buildEdgeBevelOperation(edgeIndex, amount);
        if (!operation) return null;

        operation.faces.forEach((info) => {
            const pa = this.editableMesh.vertices[info.a].position.clone();
            const pb = this.editableMesh.vertices[info.b].position.clone();
            const pc = this.editableMesh.vertices[info.c].position.clone();
            const pd = this.editableMesh.vertices[info.d].position.clone();
            const cutA = pa.clone().lerp(pd, amount).applyMatrix4(this.activeMesh.matrixWorld);
            const cutB = pb.clone().lerp(pc, amount).applyMatrix4(this.activeMesh.matrixWorld);
            this.drawPreviewSegment(cutA, cutB);
        });

        return operation;
    },

    buildEdgeBevelPreviewFromSelection(edgeIndices, amount = 0.18) {
        const indices = (edgeIndices || []).filter((index) => Number.isInteger(index));
        if (!indices.length) return null;

        const seen = new Set();
        indices.forEach((edgeIndex) => {
            if (seen.has(edgeIndex)) return;
            seen.add(edgeIndex);
            this.buildEdgeBevelPreview(edgeIndex, amount);
        });

        return { type: "edge-bevel-selection", edgeIndices: [...seen], amount };
    },

    updatePolygonToolPreview(event) {
        this.clearPreview();
        this.previewData = null;

        if (!this.activePolygonTool || !this.editableMesh) return;

        if (this.activePolygonTool === "loopcut") {
            if (this.selectMode !== "edge") {
                this.architectureMessage = "Loop Cut works in edge selection mode.";
                return;
            }
            const hoveredEdge = this.raycastSelectionHelpers(event)?.object?.userData?.index;
            if (hoveredEdge == null) return;
            this.previewData = this.buildLoopCutPreviewFromEdge(hoveredEdge);
            return;
        }

        if (this.activePolygonTool === "bevel") {
            const amount = THREE.MathUtils.clamp(this._polygonDragState?.amount || 0.08, 0.01, 0.45);
            if (this.selectMode === "face") {
                const faceIndices = [...this.editableMesh.selectedFaces];
                if (!faceIndices.length) {
                    this.architectureMessage = "Bevel needs one or more selected faces.";
                    return;
                }
                this.previewData = this.buildFaceBevelPreviewFromSelection(faceIndices, amount);
                this.architectureMessage = `Bevel offset: ${amount.toFixed(3)}. Drag horizontally, then release to confirm.`;
                return;
            }
            if (this.selectMode === "edge") {
                const edgeIndices = [...this.editableMesh.selectedEdges];
                if (!edgeIndices.length) {
                    this.architectureMessage = "Bevel needs one or more selected edges.";
                    return;
                }
                this.previewData = this.buildEdgeBevelPreviewFromSelection(edgeIndices, amount);
                this.architectureMessage = `Bevel offset: ${amount.toFixed(3)}. Drag horizontally, then release to confirm.`;
                return;
            }
            this.architectureMessage = "Bevel works in edge mode or face mode.";
            return;
        }

        if (this.activePolygonTool === "inset") {
            const amount = THREE.MathUtils.clamp(this._polygonDragState?.amount || 0.08, 0.01, 0.45);
            const faceIndices = [...this.editableMesh.selectedFaces];
            if (!faceIndices.length) {
                this.architectureMessage = "Inset needs one or more selected faces.";
                return;
            }
            this.previewData = this.buildFaceBevelPreviewFromSelection(faceIndices, amount);
            this.architectureMessage = `Inset amount: ${amount.toFixed(3)}. Drag horizontally, then release to confirm.`;
            return;
        }

        if (this.activePolygonTool === "edgeslide") {
            const amount = Number(this._polygonDragState?.amount || 0);
            const edgeIndices = [...this.editableMesh.selectedEdges];
            if (!edgeIndices.length) {
                this.architectureMessage = "Edge Slide needs one or more selected edges.";
                return;
            }
            edgeIndices.forEach((edgeIndex) => {
                const edge = this.editableMesh.edges[edgeIndex];
                if (!edge) return;
                const start = this.getVertexWorldPosition(edge.a);
                const end = this.getVertexWorldPosition(edge.b);
                this.drawPreviewSegment(start, end, 0x9eff6b);
            });
            this.architectureMessage = `Edge Slide offset: ${amount.toFixed(2)}. Drag horizontally, then release to confirm.`;
            return;
        }

        if (this.activePolygonTool === "shrinkfatten") {
            const amount = Number(this._polygonDragState?.amount || 0);
            this.architectureMessage = `Shrink/Fatten amount: ${amount.toFixed(2)}. Drag horizontally, then release to confirm.`;
            return;
        }

        if (this.activePolygonTool === "shear") {
            const amount = Number(this._polygonDragState?.amount || 0);
            this.architectureMessage = `Shear amount: ${amount.toFixed(2)}. Drag horizontally, then release to confirm.`;
            return;
        }
    },

    getPolygonToolLabel(toolName = this.activePolygonTool) {
        const labels = {
            loopcut: "Loop Cut",
            bevel: "Bevel",
            inset: "Inset",
            knife: "Knife Cut",
            polybuild: "Poly Build",
            bridge: "Bridge",
            spin: "Spin",
            smooth: "Smooth",
            edgeslide: "Edge Slide",
            shrinkfatten: "Shrink/Fatten",
            shear: "Shear",
            ripregion: "Rip Region",
            cutsurface: "Cut Surface",
            subdivface: "Subdivide Face",
            edgetoprofile: "Edges To Profile",
            shell: "Shell",
            boolean: "Boolean",
            polypen: "Poly Pen",
        };
        return labels[toolName] || "Polygon Tool";
    },

    midpointIndex(midpointCache, a, b) {
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (midpointCache.has(key)) return midpointCache.get(key);
        const position = this.editableMesh.vertices[a].position.clone()
            .add(this.editableMesh.vertices[b].position)
            .multiplyScalar(0.5);
        const index = this.editableMesh.vertices.length;
        this.editableMesh.vertices.push({ position });
        midpointCache.set(key, index);
        return index;
    },

    applyLoopCut(event) {
        const previewOperation = this.previewData && this.previewData.faces ? this.previewData : null;
        const hoveredEdge = this.selectMode === "edge" ? this.raycastSelectionHelpers(event)?.object?.userData?.index : null;
        const operation = previewOperation || this.buildLoopCutOperation(hoveredEdge);
        if (!operation) {
            this.architectureMessage = "Loop Cut needs the mouse over a valid quad edge ring.";
            return false;
        }

        const midpointCache = new Map();
        const nextFaces = [];
        const affectedFaces = new Set(operation.faces.map((info) => info.faceIndex));

        this.editableMesh.faces.forEach((face, faceIndex) => {
            if (!affectedFaces.has(faceIndex)) {
                nextFaces.push({ verts: face.verts.slice() });
            }
        });

        operation.faces.forEach((info) => {
            const face = this.editableMesh.faces[info.faceIndex];
            if (!face || face.verts.length !== 4) return;
            const verts = face.verts;
            const i = info.edgePos;
            const a = verts[i];
            const b = verts[(i + 1) % 4];
            const c = verts[(i + 2) % 4];
            const d = verts[(i + 3) % 4];
            const m1 = this.midpointIndex(midpointCache, b, c);
            const m2 = this.midpointIndex(midpointCache, d, a);
            nextFaces.push({ verts: [a, b, m1, m2] });
            nextFaces.push({ verts: [m2, m1, c, d] });
        });

        this.editableMesh.faces = nextFaces;
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Loop Cut complete.";
        return true;
    },

    createPointOnEdge(pointCache, fromIndex, toIndex, amount) {
        const key = `${fromIndex}_${toIndex}_${amount.toFixed(3)}`;
        if (pointCache.has(key)) return pointCache.get(key);
        const position = this.editableMesh.vertices[fromIndex].position.clone()
            .lerp(this.editableMesh.vertices[toIndex].position, amount);
        const index = this.editableMesh.vertices.length;
        this.editableMesh.vertices.push({ position });
        pointCache.set(key, index);
        return index;
    },

    orientFaceVerts(verts, referenceNormal) {
        if (!Array.isArray(verts) || verts.length < 3 || !referenceNormal) {
            return verts ? verts.slice() : [];
        }

        const a = this.editableMesh.vertices[verts[0]]?.position;
        const b = this.editableMesh.vertices[verts[1]]?.position;
        const c = this.editableMesh.vertices[verts[2]]?.position;
        if (!a || !b || !c) return verts.slice();

        const normal = new THREE.Vector3()
            .subVectors(c, b)
            .cross(new THREE.Vector3().subVectors(a, b))
            .normalize();

        if (normal.dot(referenceNormal) < 0) {
            return verts.slice().reverse();
        }

        return verts.slice();
    },

    replaceVertexWithCutPoints(faceVerts, vertexIndex, beforeMap = new Map(), afterMap = new Map()) {
        const result = [];
        const count = faceVerts.length;
        for (let i = 0; i < count; i++) {
            const current = faceVerts[i];
            if (current !== vertexIndex) {
                result.push(current);
                continue;
            }

            const prev = faceVerts[(i - 1 + count) % count];
            const next = faceVerts[(i + 1) % count];
            const beforeCut = beforeMap.get(prev);
            const afterCut = afterMap.get(next);

            if (beforeCut != null) result.push(beforeCut);
            result.push(current);
            if (afterCut != null) result.push(afterCut);
        }
        return result;
    },

    compactFaceVerts(faceVerts) {
        if (!Array.isArray(faceVerts) || !faceVerts.length) return [];
        const compacted = [];
        faceVerts.forEach((index) => {
            if (compacted[compacted.length - 1] !== index) compacted.push(index);
        });
        if (compacted.length > 1 && compacted[0] === compacted[compacted.length - 1]) {
            compacted.pop();
        }
        return compacted;
    },

    applyFaceBevel(faceIndices, amount = 0.18) {
        const selectedFaces = new Set(faceIndices);
        const nextFaces = [];

        this.editableMesh.faces.forEach((face, faceIndex) => {
            if (!selectedFaces.has(faceIndex)) {
                nextFaces.push({ verts: face.verts.slice() });
                return;
            }

            const points = face.verts.map((vertexIndex) => this.editableMesh.vertices[vertexIndex].position.clone());
            const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
            const insetVerts = face.verts.map((vertexIndex) => {
                const position = this.editableMesh.vertices[vertexIndex].position.clone().lerp(center, amount);
                const index = this.editableMesh.vertices.length;
                this.editableMesh.vertices.push({ position });
                return index;
            });

            nextFaces.push({ verts: insetVerts.slice() });
            for (let i = 0; i < face.verts.length; i++) {
                const a = face.verts[i];
                const b = face.verts[(i + 1) % face.verts.length];
                const ia = insetVerts[i];
                const ib = insetVerts[(i + 1) % insetVerts.length];
                nextFaces.push({ verts: [a, b, ib, ia] });
            }
        });

        this.editableMesh.faces = nextFaces;
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Face bevel complete.";
        return true;
    },

    applyEdgeBevel(edgeIndices, amount = 0.18) {
        const pointCache = new Map();
        const faceReplacement = new Map();
        const centerFaces = [];

        edgeIndices.forEach((edgeIndex) => {
            const operation = this.buildEdgeBevelOperation(edgeIndex, amount);
            if (!operation) return;

            const strips = [];
            operation.faces.forEach((info) => {
                if (faceReplacement.has(info.faceIndex)) return;

                const cutA = this.createPointOnEdge(pointCache, info.a, info.d, amount);
                const cutB = this.createPointOnEdge(pointCache, info.b, info.c, amount);
                const referenceNormal = this.editableMesh.computeFaceNormal(info.faceIndex);
                faceReplacement.set(info.faceIndex, {
                    verts: this.orientFaceVerts([cutA, cutB, info.c, info.d], referenceNormal),
                });
                strips.push({ cutA, cutB, referenceNormal, info });
            });

            if (strips.length === 2) {
                const bevelNormal = strips[0].referenceNormal.clone().add(strips[1].referenceNormal).normalize();
                centerFaces.push({
                    verts: this.orientFaceVerts(
                        [strips[0].cutA, strips[0].cutB, strips[1].cutB, strips[1].cutA],
                        bevelNormal
                    ),
                });

                const edge = this.editableMesh.edges[edgeIndex];
                const endpointConfigs = [
                    {
                        vertex: edge.a,
                        beforeMap: new Map([
                            [strips[0].info.d, strips[0].cutA],
                            [strips[1].info.d, strips[1].cutA],
                        ]),
                        afterMap: new Map([
                            [strips[0].info.d, strips[0].cutA],
                            [strips[1].info.d, strips[1].cutA],
                        ]),
                    },
                    {
                        vertex: edge.b,
                        beforeMap: new Map([
                            [strips[0].info.c, strips[0].cutB],
                            [strips[1].info.c, strips[1].cutB],
                        ]),
                        afterMap: new Map([
                            [strips[0].info.c, strips[0].cutB],
                            [strips[1].info.c, strips[1].cutB],
                        ]),
                    },
                ];

                endpointConfigs.forEach(({ vertex, beforeMap, afterMap }) => {
                    this.editableMesh.faces.forEach((face, faceIndex) => {
                        if (faceReplacement.has(faceIndex)) return;
                        if (!face.verts.includes(vertex)) return;
                        const nextVerts = this.compactFaceVerts(
                            this.replaceVertexWithCutPoints(face.verts, vertex, beforeMap, afterMap)
                        );
                        if (nextVerts.length >= 3) {
                            const referenceNormal = this.editableMesh.computeFaceNormal(faceIndex);
                            faceReplacement.set(faceIndex, {
                                verts: this.orientFaceVerts(nextVerts, referenceNormal),
                            });
                        }
                    });
                });
            } else if (strips.length === 1) {
                const info = operation.faces[0];
                centerFaces.push({
                    verts: this.orientFaceVerts(
                        [info.a, info.b, strips[0].cutB, strips[0].cutA],
                        strips[0].referenceNormal
                    ),
                });
            }
        });

        if (!faceReplacement.size && !centerFaces.length) {
            this.architectureMessage = "Bevel needs an edge or face selection on editable faces.";
            return false;
        }

        const nextFaces = [];
        this.editableMesh.faces.forEach((face, faceIndex) => {
            if (faceReplacement.has(faceIndex)) nextFaces.push(faceReplacement.get(faceIndex));
            else nextFaces.push({ verts: face.verts.slice() });
        });
        centerFaces.forEach((face) => nextFaces.push(face));

        this.editableMesh.faces = nextFaces.filter((face) => Array.isArray(face.verts) && new Set(face.verts).size >= 3);
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Edge bevel complete.";
        return true;
    },

    applyInsetFaces(faceIndices, amount = 0.18, depth = 0) {
        const selectedFaces = new Set(faceIndices);
        const nextFaces = [];
        const depthAmount = depth * this.getAverageScale();

        this.editableMesh.faces.forEach((face, faceIndex) => {
            if (!selectedFaces.has(faceIndex)) {
                nextFaces.push({ verts: face.verts.slice() });
                return;
            }

            const faceNormal = this.editableMesh.computeFaceNormal(faceIndex);
            const points = face.verts.map((vertexIndex) => this.editableMesh.vertices[vertexIndex].position.clone());
            const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
            const insetVerts = face.verts.map((vertexIndex) => {
                const position = this.editableMesh.vertices[vertexIndex].position.clone()
                    .lerp(center, amount)
                    .addScaledVector(faceNormal, depthAmount);
                const index = this.editableMesh.vertices.length;
                this.editableMesh.vertices.push({ position });
                return index;
            });

            nextFaces.push({ verts: this.orientFaceVerts(insetVerts.slice(), faceNormal) });
            for (let i = 0; i < face.verts.length; i++) {
                const a = face.verts[i];
                const b = face.verts[(i + 1) % face.verts.length];
                const ia = insetVerts[i];
                const ib = insetVerts[(i + 1) % insetVerts.length];
                nextFaces.push({ verts: this.orientFaceVerts([a, b, ib, ia], faceNormal) });
            }
        });

        this.editableMesh.faces = nextFaces;
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Inset complete.";
        return true;
    },

    getVertexAverageNormal(vertexIndex) {
        const linkedFaces = this.editableMesh?.vertexFaces?.[vertexIndex] || [];
        if (!linkedFaces.length) return new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3();
        linkedFaces.forEach((faceIndex) => normal.add(this.editableMesh.computeFaceNormal(faceIndex)));
        return normal.lengthSq() > 1e-8 ? normal.normalize() : new THREE.Vector3(0, 1, 0);
    },

    getNeighborVertices(vertexIndex) {
        const neighbors = new Set();
        this.editableMesh?.edges?.forEach((edge) => {
            if (!edge) return;
            if (edge.a === vertexIndex) neighbors.add(edge.b);
            else if (edge.b === vertexIndex) neighbors.add(edge.a);
        });
        return [...neighbors];
    },

    smoothSelection(iterations = 1, strength = 0.5) {
        const selectedIndices = [...this.getSelectedVertexIndices()];
        if (!selectedIndices.length) {
            this.architectureMessage = "Smooth needs a vertex, edge, or face selection.";
            return false;
        }

        const selectedSet = new Set(selectedIndices);
        for (let pass = 0; pass < Math.max(1, iterations); pass++) {
            const nextPositions = new Map();
            selectedIndices.forEach((vertexIndex) => {
                const vertex = this.editableMesh.vertices[vertexIndex];
                const neighborIndices = this.getNeighborVertices(vertexIndex);
                const neighbors = neighborIndices
                    .map((neighborIndex) => this.editableMesh.vertices[neighborIndex]?.position)
                    .filter(Boolean);
                if (!vertex || !neighbors.length) return;
                const average = neighbors.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / neighbors.length);
                const boundaryWeight = neighborIndices.some((neighborIndex) => !selectedSet.has(neighborIndex)) ? 0.5 : 1;
                nextPositions.set(
                    vertexIndex,
                    vertex.position.clone().lerp(average, THREE.MathUtils.clamp(strength * boundaryWeight, 0.05, 0.95))
                );
            });
            nextPositions.forEach((position, vertexIndex) => {
                this.editableMesh.vertices[vertexIndex].position.copy(position);
            });
            this.editableMesh.rebuildTopology();
        }

        this.commitEditableMesh();
        this.architectureMessage = "Smooth complete.";
        return true;
    },

    polyBuildFace() {
        if (this.selectMode !== "vertex") {
            this.architectureMessage = "Poly Build works from vertex selection.";
            return false;
        }
        const selectedVertices = [...this.editableMesh.selectedVertices];
        if (selectedVertices.length < 3 || selectedVertices.length > 4) {
            this.architectureMessage = "Select 3 or 4 vertices to build a face.";
            return false;
        }

        const points = selectedVertices.map((vertexIndex) => this.editableMesh.vertices[vertexIndex].position.clone());
        const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
        const normal = selectedVertices.reduce((sum, vertexIndex) => sum.add(this.getVertexAverageNormal(vertexIndex)), new THREE.Vector3());
        const faceNormal = normal.lengthSq() > 1e-8 ? normal.normalize() : new THREE.Vector3(0, 1, 0);
        const tangent = Math.abs(faceNormal.y) < 0.95
            ? new THREE.Vector3().crossVectors(faceNormal, new THREE.Vector3(0, 1, 0)).normalize()
            : new THREE.Vector3(1, 0, 0);
        const bitangent = new THREE.Vector3().crossVectors(faceNormal, tangent).normalize();
        const ordered = selectedVertices.slice().sort((a, b) => {
            const pa = this.editableMesh.vertices[a].position.clone().sub(center);
            const pb = this.editableMesh.vertices[b].position.clone().sub(center);
            const angleA = Math.atan2(pa.dot(bitangent), pa.dot(tangent));
            const angleB = Math.atan2(pb.dot(bitangent), pb.dot(tangent));
            return angleA - angleB;
        });

        const duplicate = this.editableMesh.faces.some((face) => {
            if (!face || face.verts.length !== ordered.length) return false;
            return ordered.every((vertexIndex) => face.verts.includes(vertexIndex));
        });
        if (duplicate) {
            this.architectureMessage = "A face already exists for the selected vertices.";
            return false;
        }

        this.editableMesh.faces.push({ verts: this.orientFaceVerts(ordered, faceNormal) });
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Poly Build face created.";
        return true;
    },

    applyKnifeCut() {
        const selectedFaces = [...this.editableMesh.selectedFaces];
        if (!selectedFaces.length) {
            this.architectureMessage = "Knife Cut needs one or more selected faces.";
            return false;
        }

        const selectedSet = new Set(selectedFaces);
        const nextFaces = [];
        this.editableMesh.faces.forEach((face, faceIndex) => {
            if (!selectedSet.has(faceIndex)) {
                nextFaces.push({ verts: face.verts.slice() });
                return;
            }

            const center = face.verts.reduce(
                (sum, vertexIndex) => sum.add(this.editableMesh.vertices[vertexIndex].position),
                new THREE.Vector3()
            ).multiplyScalar(1 / face.verts.length);
            const centerIndex = this.editableMesh.vertices.length;
            this.editableMesh.vertices.push({ position: center.clone() });
            const referenceNormal = this.editableMesh.computeFaceNormal(faceIndex);
            for (let i = 0; i < face.verts.length; i++) {
                const a = face.verts[i];
                const b = face.verts[(i + 1) % face.verts.length];
                nextFaces.push({ verts: this.orientFaceVerts([a, b, centerIndex], referenceNormal) });
            }
        });

        this.editableMesh.faces = nextFaces;
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Knife center cut complete.";
        return true;
    },

    applyShrinkFatten(amount = 0) {
        const selectedIndices = [...this.getSelectedVertexIndices()];
        if (!selectedIndices.length) {
            this.architectureMessage = "Shrink/Fatten needs a current selection.";
            return false;
        }
        const distance = amount * this.getAverageScale() * 1.6;
        selectedIndices.forEach((vertexIndex) => {
            const vertex = this.editableMesh.vertices[vertexIndex];
            if (!vertex) return;
            vertex.position.addScaledVector(this.getVertexAverageNormal(vertexIndex), distance);
        });
        this.commitEditableMesh();
        this.architectureMessage = "Shrink/Fatten complete.";
        return true;
    },

    applyShear(amount = 0) {
        const selectedIndices = [...this.getSelectedVertexIndices()];
        if (!selectedIndices.length) {
            this.architectureMessage = "Shear needs a current selection.";
            return false;
        }
        const center = this.getSubObjectTransformCenter() || new THREE.Vector3();
        const factor = amount * 0.6;
        selectedIndices.forEach((vertexIndex) => {
            const vertex = this.editableMesh.vertices[vertexIndex];
            if (!vertex) return;
            const relativeY = vertex.position.y - center.y;
            vertex.position.x += relativeY * factor;
        });
        this.commitEditableMesh();
        this.architectureMessage = "Shear complete.";
        return true;
    },

    applyEdgeSlide(amount = 0) {
        const edgeIndices = [...this.editableMesh.selectedEdges];
        if (!edgeIndices.length) {
            this.architectureMessage = "Edge Slide needs one or more selected edges.";
            return false;
        }
        const moveScale = amount * this.getAverageScale() * 1.25;
        const vertexOffsets = new Map();

        edgeIndices.forEach((edgeIndex) => {
            const edge = this.editableMesh.edges[edgeIndex];
            if (!edge) return;
            const edgeDirection = this.editableMesh.vertices[edge.b].position.clone()
                .sub(this.editableMesh.vertices[edge.a].position)
                .normalize();

            [edge.a, edge.b].forEach((vertexIndex) => {
                const base = this.editableMesh.vertices[vertexIndex]?.position;
                if (!base) return;
                const neighbors = this.getNeighborVertices(vertexIndex).filter((neighborIndex) => neighborIndex !== edge.a && neighborIndex !== edge.b);
                if (!neighbors.length) return;
                const tangent = neighbors.reduce((sum, neighborIndex) => {
                    const neighbor = this.editableMesh.vertices[neighborIndex]?.position;
                    if (!neighbor) return sum;
                    return sum.add(neighbor.clone().sub(base));
                }, new THREE.Vector3());
                tangent.addScaledVector(edgeDirection, -tangent.dot(edgeDirection));
                if (tangent.lengthSq() <= 1e-8) return;
                tangent.normalize().multiplyScalar(moveScale);
                if (!vertexOffsets.has(vertexIndex)) vertexOffsets.set(vertexIndex, new THREE.Vector3());
                vertexOffsets.get(vertexIndex).add(tangent);
            });
        });

        if (!vertexOffsets.size) {
            this.architectureMessage = "Edge Slide needs surrounding topology to slide across.";
            return false;
        }

        vertexOffsets.forEach((offset, vertexIndex) => {
            this.editableMesh.vertices[vertexIndex].position.add(offset);
        });
        this.commitEditableMesh();
        this.architectureMessage = "Edge Slide complete.";
        return true;
    },

    applyRipRegion(amount = 0.35) {
        const selectedFaces = [...this.editableMesh.selectedFaces];
        if (!selectedFaces.length) {
            this.architectureMessage = "Rip Region needs one or more selected faces.";
            return false;
        }

        const selectedSet = new Set(selectedFaces);
        const selectedVertices = new Set();
        const duplicateMap = new Map();
        let averageNormal = new THREE.Vector3();

        selectedFaces.forEach((faceIndex) => {
            const face = this.editableMesh.faces[faceIndex];
            if (!face) return;
            averageNormal.add(this.editableMesh.computeFaceNormal(faceIndex));
            face.verts.forEach((vertexIndex) => selectedVertices.add(vertexIndex));
        });

        averageNormal = averageNormal.lengthSq() > 1e-8 ? averageNormal.normalize() : new THREE.Vector3(0, 1, 0);
        selectedVertices.forEach((vertexIndex) => {
            const source = this.editableMesh.vertices[vertexIndex];
            if (!source) return;
            const nextIndex = this.editableMesh.vertices.length;
            duplicateMap.set(vertexIndex, nextIndex);
            this.editableMesh.vertices.push({
                position: source.position.clone().addScaledVector(averageNormal, amount * this.getAverageScale()),
            });
        });

        const nextFaces = this.editableMesh.faces.map((face, faceIndex) => {
            if (!selectedSet.has(faceIndex)) return { verts: face.verts.slice() };
            return { verts: face.verts.map((vertexIndex) => duplicateMap.get(vertexIndex) ?? vertexIndex) };
        });

        this.editableMesh.faces = nextFaces;
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Rip Region complete.";
        return true;
    },

    applyPolygonTool(event) {
        if (!this.activePolygonTool) return false;

        if (this.activePolygonTool === "loopcut") {
            return this.applyLoopCut(event);
        }

        if (this.activePolygonTool === "bevel") {
            const amount = THREE.MathUtils.clamp(this._polygonDragState?.amount || 0.08, 0.01, 0.45);
            if (this.selectMode === "face") {
                const faceIndices = [...this.editableMesh.selectedFaces];
                if (!faceIndices.length) {
                    this.architectureMessage = "Bevel needs one or more selected faces.";
                    return false;
                }
                return this.applyFaceBevel(faceIndices, amount);
            }

            if (this.selectMode === "edge") {
                const edgeIndices = [...this.editableMesh.selectedEdges];
                if (!edgeIndices.length) {
                    this.architectureMessage = "Bevel needs one or more selected edges.";
                    return false;
                }
                return this.applyEdgeBevel(edgeIndices, amount);
            }

            this.architectureMessage = "Bevel works in edge mode or face mode.";
            return false;
        }

        if (this.activePolygonTool === "inset") {
            const amount = THREE.MathUtils.clamp(this._polygonDragState?.amount || 0.08, 0.01, 0.45);
            const faceIndices = [...this.editableMesh.selectedFaces];
            if (!faceIndices.length) {
                this.architectureMessage = "Inset needs one or more selected faces.";
                return false;
            }
            return this.applyInsetFaces(faceIndices, amount);
        }

        if (this.activePolygonTool === "edgeslide") {
            return this.applyEdgeSlide(Number(this._polygonDragState?.amount || 0));
        }

        if (this.activePolygonTool === "shrinkfatten") {
            return this.applyShrinkFatten(Number(this._polygonDragState?.amount || 0));
        }

        if (this.activePolygonTool === "shear") {
            return this.applyShear(Number(this._polygonDragState?.amount || 0));
        }

        return false;
    },

    snapStepValue(value, step = 0.1) {
        const safeStep = Math.max(0.001, Number(step) || 0.1);
        return window.ArchitectPrecisionBridge?.snapValue?.(Number(value) || 0, safeStep)
            ?? Math.round((Number(value) || 0) / safeStep) * safeStep;
    },

    getCadConstraintContext() {
        return window.ArchitectCadWorkbench?.getConstraintContext?.() || {
            enabled: false,
            snapStep: 0.1,
            angleStep: 15,
            ortho: false,
            polar: false,
            objectSnap: false,
        };
    },

    getCurrentStoryElevation() {
        return Math.max(0, Number(this.settings.archCurrentStory) || 0) * Math.max(0.1, Number(this.settings.archStoryHeight) || 3.2);
    },

    stepStory(delta = 1) {
        const next = Math.max(0, (Number(this.settings.archCurrentStory) || 0) + (Number(delta) || 0));
        this.settings.archCurrentStory = next;
        this.architectureSelection = null;
        this.architecturePoints = [];
        this.clearPreview();
        this.architectureMessage = `Active story changed to L${next + 1} at ${this.getCurrentStoryElevation().toFixed(2)}m.`;
        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
        return next;
    },

    getArchitectureAnchor(object) {
        if (!object) return null;
        if (object.userData?.wallData) return object.getWorldPosition(new THREE.Vector3());
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return object.getWorldPosition(new THREE.Vector3());
        return box.getCenter(new THREE.Vector3());
    },

    getWallWorldEndpoints(wallGroup) {
        const data = wallGroup?.userData?.wallData;
        if (!data) return null;
        return {
            start: wallGroup.localToWorld(new THREE.Vector3(-data.length / 2, 0, 0)),
            end: wallGroup.localToWorld(new THREE.Vector3(data.length / 2, 0, 0)),
        };
    },

    collectArchitecturalSnapCandidates(object, bucket = []) {
        if (!object) return bucket;
        if (object.userData?.wallData) {
            const endpoints = this.getWallWorldEndpoints(object);
            if (endpoints) {
                const mid = endpoints.start.clone().add(endpoints.end).multiplyScalar(0.5);
                bucket.push(endpoints.start, endpoints.end, mid);
            }
            (object.userData.wallData.openings || []).forEach((opening) => {
                bucket.push(object.localToWorld(new THREE.Vector3(opening.center, Math.max(opening.bottom, 0) + (opening.height * 0.5), 0)));
            });
        } else {
            const box = new THREE.Box3().setFromObject(object);
            if (!box.isEmpty()) {
                const center = box.getCenter(new THREE.Vector3());
                bucket.push(center);
                bucket.push(new THREE.Vector3(box.min.x, center.y, box.min.z));
                bucket.push(new THREE.Vector3(box.min.x, center.y, box.max.z));
                bucket.push(new THREE.Vector3(box.max.x, center.y, box.min.z));
                bucket.push(new THREE.Vector3(box.max.x, center.y, box.max.z));
            }
        }
        return bucket;
    },

    applyArchitecturalObjectSnap(point, context) {
        if (!point || !context?.objectSnap) return point;
        const candidates = [];
        (window.architecturalElements || []).forEach((object) => this.collectArchitecturalSnapCandidates(object, candidates));
        if (!candidates.length) return point;

        const threshold = Math.max((Number(context.snapStep) || 0.1) * 2.5, 0.4);
        let best = null;
        let bestDistance = Infinity;
        candidates.forEach((candidate) => {
            const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z);
            if (distance < bestDistance && distance <= threshold) {
                bestDistance = distance;
                best = candidate;
            }
        });

        if (!best) return point;
        point.x = best.x;
        point.z = best.z;
        return point;
    },

    getRectDraftPoint(event) {
        const point = this.getGroundIntersection(event);
        if (!point) return null;
        const context = this.getCadConstraintContext();
        this.applyArchitecturalObjectSnap(point, context);
        point.x = this.snapStepValue(point.x, context.snapStep);
        point.z = this.snapStepValue(point.z, context.snapStep);
        point.y = this.activeArchitectureTool === "terrain" ? 0 : this.getCurrentStoryElevation();
        return point;
    },

    getLinearDraftPoint(event) {
        const point = this.getGroundIntersection(event);
        if (!point) return null;

        const context = this.getCadConstraintContext();
        this.applyArchitecturalObjectSnap(point, context);
        const anchor = this.architecturePoints[0];
        if (!anchor) {
            point.x = this.snapStepValue(point.x, context.snapStep);
            point.z = this.snapStepValue(point.z, context.snapStep);
            point.y = this.activeArchitectureTool === "terrain" ? 0 : this.getCurrentStoryElevation();
            return point;
        }

        let deltaX = point.x - anchor.x;
        let deltaZ = point.z - anchor.z;
        let distance = Math.hypot(deltaX, deltaZ);
        if (distance < 1e-6) return anchor.clone();

        let angle = Math.atan2(deltaZ, deltaX);
        const stepRadians = THREE.MathUtils.degToRad(Math.max(1, Number(context.angleStep) || 15));
        if (context.ortho) angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
        else if (context.polar) angle = Math.round(angle / stepRadians) * stepRadians;

        distance = this.snapStepValue(distance, context.snapStep);
        return new THREE.Vector3(
            this.snapStepValue(anchor.x + Math.cos(angle) * distance, context.snapStep),
            this.activeArchitectureTool === "terrain" ? 0 : this.getCurrentStoryElevation(),
            this.snapStepValue(anchor.z + Math.sin(angle) * distance, context.snapStep)
        );
    },

    getPlanDraftPoint(event) {
        // Begin with the same grid and object snap used by rectangles, then
        // constrain each new segment relative to the last polyline vertex.
        const point = this.getRectDraftPoint(event);
        if (!point) return null;
        const points = this.architecturePlanDraft?.points || [];
        const anchor = points[points.length - 1];
        if (!anchor) return point;

        const context = this.getCadConstraintContext();
        let dx = point.x - anchor.x;
        let dz = point.z - anchor.z;
        let distance = Math.hypot(dx, dz);
        if (distance < 1e-6) return anchor.clone();

        let angle = Math.atan2(dz, dx);
        const angleStep = THREE.MathUtils.degToRad(Math.max(1, Number(context.angleStep) || 15));
        if (context.ortho) angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
        else if (context.polar) angle = Math.round(angle / angleStep) * angleStep;
        distance = this.snapStepValue(distance, context.snapStep);
        return new THREE.Vector3(
            this.snapStepValue(anchor.x + Math.cos(angle) * distance, context.snapStep),
            this.getCurrentStoryElevation(),
            this.snapStepValue(anchor.z + Math.sin(angle) * distance, context.snapStep)
        );
    },

    drawArchitecturePlanDraft(cursorPoint = null) {
        const draft = this.architecturePlanDraft || { points: [], closed: false };
        const points = draft.points || [];
        if (!points.length) return;

        points.forEach((point, index) => {
            this.drawPreviewPoint(point, index === 0 ? 0xffd166 : 0x65d9ff, index === 0 ? 0.055 : 0.04);
            if (index) this.drawPreviewSegment(points[index - 1], point, 0x2ed8ff);
        });
        if (draft.closed && points.length > 2) {
            this.drawPreviewSegment(points[points.length - 1], points[0], 0x7cf29a);
        } else if (cursorPoint && !draft.closed) {
            this.drawPreviewSegment(points[points.length - 1], cursorPoint, 0xffd166);
            this.drawPreviewPoint(cursorPoint, 0xffd166, 0.035);
        }

        const first = points[0];
        const last = points[points.length - 1];
        const dimension = first.distanceTo(last);
        this.drawPreviewLabel(
            `PLAN ${points.length} pts${draft.closed ? " · CLOSED" : " · tracing"} · ${dimension.toFixed(2)}m`,
            last.clone().add(new THREE.Vector3(0, 0.35, 0))
        );
    },

    finishArchitecturePlanDraft() {
        const draft = this.architecturePlanDraft || { points: [], closed: false };
        if ((draft.points || []).length < 3) {
            this.architectureMessage = "Plan needs at least 3 corners before it can be closed.";
            return false;
        }
        draft.closed = true;
        this.architecturePlanDraft = draft;
        this.architectureMessage = `Plan closed with ${draft.points.length} corners. Click Generate 3D to create walls and slab.`;
        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
        return true;
    },

    clearArchitecturePlanDraft() {
        this.architecturePlanDraft = { points: [], closed: false };
        this.architecturePoints = [];
        this.clearPreview();
        this.architectureMessage = "2D plan cleared. Start a new CAD polyline.";
        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
    },

    convertArchitecturePlanTo3D() {
        const draft = this.architecturePlanDraft || { points: [], closed: false };
        const source = (draft.points || []).map((point) => point.clone());
        if (source.length < 3) {
            this.architectureMessage = "Draw at least 3 plan corners before generating 3D.";
            return { created: 0, reason: "too-few-points" };
        }
        if (!draft.closed) this.finishArchitecturePlanDraft();

        const baseY = this.getCurrentStoryElevation();
        const points = source.map((point) => new THREE.Vector3(point.x, baseY, point.z));
        const wallHeight = Math.max(0.1, Number(this.settings.archHeight) || 2.8);
        const thickness = Math.max(0.03, Number(this.settings.archThickness) || 0.2);
        let created = 0;
        const stamp = Date.now();

        for (let index = 0; index < points.length; index += 1) {
            const start = points[index];
            const end = points[(index + 1) % points.length];
            if (start.distanceTo(end) < 0.05) continue;
            const wall = this.createHostedWall(start, end, {
                height: wallHeight,
                thickness,
                baseY,
                story: this.settings.archCurrentStory,
                name: `PlanWall_${stamp}_${index + 1}`,
            });
            if (wall) {
                wall.userData.planGenerated = true;
                this.addArchitectureElement(wall, "wall");
                created += 1;
            }
        }

        if (this.settings.archAddFloor) {
            const shape = new THREE.Shape();
            shape.moveTo(points[0].x, -points[0].z);
            for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index].x, -points[index].z);
            shape.closePath();
            const slabDepth = Math.max(thickness, 0.08);
            const slab = new THREE.Mesh(
                new THREE.ExtrudeGeometry(shape, { depth: slabDepth, bevelEnabled: false }),
                new THREE.MeshStandardMaterial({ color: 0x7f8791, roughness: 0.92 })
            );
            slab.geometry.rotateX(-Math.PI / 2);
            slab.position.y = baseY;
            slab.name = `PlanSlab_${stamp}`;
            slab.userData = {
                ...(slab.userData || {}),
                planGenerated: true,
                story: this.settings.archCurrentStory,
                footprint: points.map((point) => [point.x, point.z]),
            };
            this.addArchitectureElement(slab, "slab");
            created += 1;
        }

        this.architecturePlanDraft = { points: [], closed: false };
        this.architecturePoints = [];
        this.clearPreview();
        this.activeArchitectureTool = null;
        window.activeArchTool = null;
        this.setViewportCursor("default");
        this.architectureMessage = `3D plan generated: ${created} elements (walls${this.settings.archAddFloor ? " + slab" : ""}).`;
        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
        return { created };
    },

    finishArchitectureCommand(message) {
        this.activeArchitectureTool = null;
        window.activeArchTool = null;
        this.architecturePoints = [];
        this.architectureSelection = null;
        this.clearPreview();
        this.setViewportCursor("default");
        this.architectureMessage = message || "Architecture tool finished.";
        if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
    },

    createMeasurementLabel(text) {
        if (typeof document === "undefined") return null;
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 72;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "rgba(10,14,20,0.9)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "rgba(146,185,255,0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        ctx.fillStyle = "#eef5ff";
        ctx.font = "600 28px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.6, 0.45, 1);
        return sprite;
    },

    drawPreviewLabel(text, position) {
        const label = this.createMeasurementLabel(text);
        if (!label || !position) return null;
        label.position.copy(position);
        modelingPreviewHelpers.add(label);
        modelingPreviewHelpers.visible = true;
        return label;
    },

    updateArchitecturePreview(event) {
        this.clearPreview();
        if (!this.activeArchitectureTool) return;
        const tool = this.activeArchitectureTool;
        const linearTools = new Set(["wall", "beam", "stairs", "railing", "curved-wall", "measure"]);
        const rectTools = new Set(["room", "slab", "rect-extrude", "roof", "facade"]);
        const pointTools = new Set(["column", "terrain", "table", "chair"]);

        if (tool === "cad-polyline") {
            this.drawArchitecturePlanDraft(this.getPlanDraftPoint(event));
            return;
        }

        if (tool === "door" || tool === "window") {
            const hit = this.getWallIntersection(event);
            if (!hit) return;
            const host = this.resolveArchitectureHost(hit.object);
            const depth = Math.max(this.settings.archThickness * 0.7, 0.08);
            const height = tool === "door" ? this.settings.archHeight * 0.8 : this.settings.archHeight * 0.45;
            const baseY = host?.userData?.wallData?.baseY ?? this.getCurrentStoryElevation();
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
            this.previewMesh = new THREE.Mesh(
                new THREE.BoxGeometry(this.settings.archWidth, height, depth),
                new THREE.MeshBasicMaterial({ color: tool === "door" ? 0xf39c12 : 0x4db2ff, wireframe: true, transparent: true, opacity: 0.75 })
            );
            this.previewMesh.position.copy(hit.point).addScaledVector(normal.clone().negate(), depth * 0.5);
            this.previewMesh.position.y = tool === "door" ? baseY + (height / 2) : baseY + height + 0.9;
            this.previewMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().negate());
            modelingPreviewHelpers.add(this.previewMesh);
            modelingPreviewHelpers.visible = true;
            return;
        }

        if (tool === "offset" && this.architectureSelection?.host?.userData?.wallData) {
            const point = this.getRectDraftPoint(event);
            const host = this.architectureSelection.host;
            if (!point) return;
            const localPoint = host.worldToLocal(point.clone());
            const offsetDistance = this.snapStepValue(localPoint.z, this.getCadConstraintContext().snapStep);
            const data = host.userData.wallData;
            const previewStart = host.localToWorld(new THREE.Vector3(-data.length * 0.5, 0.02, offsetDistance));
            const previewEnd = host.localToWorld(new THREE.Vector3(data.length * 0.5, 0.02, offsetDistance));
            this.drawPreviewSegment(previewStart, previewEnd, 0xffa94d);
            this.drawPreviewPoint(previewStart, 0xffd166, 0.035);
            this.drawPreviewPoint(previewEnd, 0xffd166, 0.035);
            this.drawPreviewLabel(`OFFSET ${Math.abs(offsetDistance).toFixed(2)}m`, previewStart.clone().add(previewEnd).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0)));
            return;
        }

        if (tool === "array-linear" && this.architectureSelection?.host) {
            const point = this.getRectDraftPoint(event);
            const anchor = this.getArchitectureAnchor(this.architectureSelection.host);
            if (!point || !anchor) return;
            const count = Math.max(2, this.settings.archSegments);
            const delta = point.clone().sub(anchor);
            for (let i = 1; i < count; i++) {
                const previewPoint = anchor.clone().add(delta.clone().multiplyScalar(i));
                this.drawPreviewPoint(previewPoint, 0x8ce99a, 0.03);
            }
            this.drawPreviewSegment(anchor, point, 0x8ce99a);
            this.drawPreviewLabel(`ARRAY x${count}`, anchor.clone().add(point).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0)));
            return;
        }

        if (pointTools.has(tool)) {
            const point = this.getRectDraftPoint(event);
            if (!point) return;
            const pointColor = tool === "terrain" ? 0x7ad66f : (tool === "column" ? 0xffd166 : 0xc6d0e4);
            this.drawPreviewPoint(point, pointColor, 0.05);
            if (tool === "terrain") {
                this.previewMesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(Math.max(this.settings.archWidth * 4, 4), Math.max(this.settings.archDepth * 4, 4)),
                    new THREE.MeshBasicMaterial({ color: 0x7ad66f, wireframe: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
                );
                this.previewMesh.rotation.x = -Math.PI / 2;
                this.previewMesh.position.copy(point);
                modelingPreviewHelpers.add(this.previewMesh);
                modelingPreviewHelpers.visible = true;
            }
            if (tool === "table" || tool === "chair") {
                const footprint = tool === "table"
                    ? `${this.settings.archWidth.toFixed(2)} x ${this.settings.archDepth.toFixed(2)}`
                    : `${this.settings.archWidth.toFixed(2)} seat`;
                this.drawPreviewLabel(`${tool.toUpperCase()} ${footprint}`, point.clone().add(new THREE.Vector3(0, 0.45, 0)));
            }
            return;
        }

        if (linearTools.has(tool)) {
            const point = this.getLinearDraftPoint(event);
            const first = this.architecturePoints[0];
            if (!point || !first) return;
            this.previewLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([first.clone(), point.clone()]),
                new THREE.LineDashedMaterial({ color: tool === "measure" ? 0xfff06a : 0x00d2ff, dashSize: 0.2, gapSize: 0.1, depthTest: false })
            );
            this.previewLine.computeLineDistances();
            modelingPreviewHelpers.add(this.previewLine);
            modelingPreviewHelpers.visible = true;
            this.drawPreviewPoint(first, 0xf4d35e, 0.04);
            this.drawPreviewPoint(point, 0x7bdff2, 0.035);
            const distance = first.distanceTo(point);
            const angle = THREE.MathUtils.radToDeg(Math.atan2(point.z - first.z, point.x - first.x));
            this.drawPreviewLabel(`${distance.toFixed(2)}m / ${angle.toFixed(0)}deg`, first.clone().add(point).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0)));
            return;
        }

        if (rectTools.has(tool)) {
            const point = this.getRectDraftPoint(event);
            const first = this.architecturePoints[0];
            if (!point || !first) return;
            const minX = Math.min(first.x, point.x);
            const maxX = Math.max(first.x, point.x);
            const minZ = Math.min(first.z, point.z);
            const maxZ = Math.max(first.z, point.z);
            const width = Math.max(maxX - minX, 0.01);
            const depth = Math.max(maxZ - minZ, 0.01);
            this.previewMesh = new THREE.Mesh(
                new THREE.BoxGeometry(width, Math.max(this.settings.archHeight, 0.1), depth),
                new THREE.MeshBasicMaterial({ color: tool === "roof" ? 0xf55d5d : (tool === "facade" ? 0x7ad3f7 : 0x00b894), wireframe: true, transparent: true, opacity: 0.5 })
            );
            this.previewMesh.position.set(minX + width / 2, first.y + (Math.max(this.settings.archHeight, 0.1) / 2), minZ + depth / 2);
            modelingPreviewHelpers.add(this.previewMesh);
            modelingPreviewHelpers.visible = true;
            this.drawPreviewPoint(first, 0xf4d35e, 0.04);
            this.drawPreviewPoint(point, 0x7bdff2, 0.035);
            this.drawPreviewLabel(`${width.toFixed(2)}m x ${depth.toFixed(2)}m`, new THREE.Vector3(minX + width / 2, first.y + Math.max(this.settings.archHeight, 0.1) + 0.25, minZ + depth / 2));
        }
    },

    addArchitectureElement(object, type) {
        object.userData = { ...(object.userData || {}), archType: type };
        if (typeof addObjectToScene === "function") {
            addObjectToScene(object, object.name || type);
        } else if (scene) {
            scene.add(object);
        }

        window.architecturalElements = Array.isArray(window.architecturalElements) ? window.architecturalElements : [];
        if (!window.architecturalElements.includes(object)) {
            window.architecturalElements.push(object);
        }
    },

    clearObjectChildren(group) {
        if (!group) return;
        while (group.children.length) {
            const child = group.children[0];
            group.remove(child);
            disposeObject3D(child);
        }
    },

    createWallSegmentMesh(length, height, thickness, material, yCenter, xCenter) {
        if (length <= 0.01 || height <= 0.01 || thickness <= 0.01) return null;
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(length, height, thickness),
            material.clone()
        );
        mesh.position.set(xCenter, yCenter, 0);
        mesh.userData = { ...(mesh.userData || {}), archType: "wall", archWallHost: true };
        return mesh;
    },

    createOpeningFrame(opening, wallThickness) {
        const thickness = Math.max(wallThickness * 0.18, 0.035);
        const depth = Math.max(wallThickness * 0.55, 0.04);
        const material = new THREE.MeshStandardMaterial({
            color: opening.type === "door" ? 0x9a6a45 : 0x87a9d9,
            roughness: opening.type === "door" ? 0.72 : 0.32,
            metalness: opening.type === "door" ? 0.02 : 0.18,
            transparent: opening.type === "window",
            opacity: opening.type === "window" ? 0.78 : 1,
        });
        const group = new THREE.Group();
        const left = new THREE.Mesh(new THREE.BoxGeometry(thickness, opening.height, depth), material.clone());
        const right = new THREE.Mesh(new THREE.BoxGeometry(thickness, opening.height, depth), material.clone());
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(opening.width, thickness, depth), material.clone());
        left.position.set(opening.center - (opening.width * 0.5) + (thickness * 0.5), opening.bottom + (opening.height * 0.5), 0);
        right.position.set(opening.center + (opening.width * 0.5) - (thickness * 0.5), opening.bottom + (opening.height * 0.5), 0);
        lintel.position.set(opening.center, opening.bottom + opening.height - (thickness * 0.5), 0);
        group.add(left, right, lintel);

        if (opening.type === "window") {
            const pane = new THREE.Mesh(
                new THREE.BoxGeometry(Math.max(opening.width - thickness * 1.8, 0.05), Math.max(opening.height - thickness * 1.8, 0.05), Math.max(depth * 0.35, 0.02)),
                new THREE.MeshStandardMaterial({ color: 0x9ed8ff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.15 })
            );
            pane.position.set(opening.center, opening.bottom + (opening.height * 0.5), 0);
            group.add(pane);
        }

        if (opening.type === "door") {
            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(Math.max(opening.width - thickness * 1.5, 0.05), Math.max(opening.height - thickness * 1.2, 0.05), Math.max(depth * 0.28, 0.02)),
                new THREE.MeshStandardMaterial({ color: 0x7d5637, roughness: 0.74 })
            );
            panel.position.set(opening.center, opening.bottom + (opening.height * 0.5), -Math.max(depth * 0.12, 0.01));
            group.add(panel);
        }

        group.userData = { ...(group.userData || {}), archOpening: true, archType: opening.type };
        return group;
    },

    rebuildHostedWall(wallGroup) {
        const data = wallGroup?.userData?.wallData;
        if (!data) return wallGroup;
        this.clearObjectChildren(wallGroup);

        const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xcfc6ba, roughness: 0.85 });
        const openings = [...(data.openings || [])]
            .map((opening) => ({
                ...opening,
                width: THREE.MathUtils.clamp(opening.width, 0.2, Math.max(data.length - 0.1, 0.2)),
                bottom: THREE.MathUtils.clamp(opening.bottom, 0, Math.max(data.height - 0.2, 0)),
                height: THREE.MathUtils.clamp(opening.height, 0.2, Math.max(data.height - opening.bottom, 0.2)),
            }))
            .sort((a, b) => a.center - b.center);

        let cursor = -data.length * 0.5;
        openings.forEach((opening) => {
            const left = THREE.MathUtils.clamp(opening.center - opening.width * 0.5, -data.length * 0.5, data.length * 0.5);
            const right = THREE.MathUtils.clamp(opening.center + opening.width * 0.5, -data.length * 0.5, data.length * 0.5);
            if (left - cursor > 0.01) {
                const segment = this.createWallSegmentMesh(left - cursor, data.height, data.thickness, baseMaterial, data.height * 0.5, cursor + ((left - cursor) * 0.5));
                if (segment) wallGroup.add(segment);
            }
            if (opening.bottom > 0.01) {
                const sill = this.createWallSegmentMesh(right - left, opening.bottom, data.thickness, baseMaterial, opening.bottom * 0.5, (left + right) * 0.5);
                if (sill) wallGroup.add(sill);
            }
            const topBottom = opening.bottom + opening.height;
            if (data.height - topBottom > 0.01) {
                const head = this.createWallSegmentMesh(right - left, data.height - topBottom, data.thickness, baseMaterial, topBottom + ((data.height - topBottom) * 0.5), (left + right) * 0.5);
                if (head) wallGroup.add(head);
            }
            wallGroup.add(this.createOpeningFrame(opening, data.thickness));
            cursor = Math.max(cursor, right);
        });

        if (data.length * 0.5 - cursor > 0.01) {
            const segment = this.createWallSegmentMesh((data.length * 0.5) - cursor, data.height, data.thickness, baseMaterial, data.height * 0.5, cursor + (((data.length * 0.5) - cursor) * 0.5));
            if (segment) wallGroup.add(segment);
        }

        baseMaterial.dispose();
        wallGroup.userData.archType = "wall";
        wallGroup.userData.story = data.story || 0;
        return wallGroup;
    },

    createHostedWall(start, end, options = {}) {
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        if (length < 0.05) return null;
        const height = Math.max(0.2, Number(options.height) || this.settings.archHeight);
        const thickness = Math.max(0.05, Number(options.thickness) || this.settings.archThickness);
        const baseY = Number.isFinite(options.baseY) ? options.baseY : (Number(start.y) || this.getCurrentStoryElevation());
        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const wall = new THREE.Group();
        wall.position.set(midpoint.x, baseY, midpoint.z);
        wall.quaternion.setFromUnitVectors(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(direction.x, 0, direction.z).normalize()
        );
        wall.name = options.name || `Wall_${Date.now()}`;
        wall.userData = {
            ...(wall.userData || {}),
            archType: "wall",
            wallData: {
                length,
                height,
                thickness,
                baseY,
                story: Number.isFinite(options.story) ? options.story : this.settings.archCurrentStory,
                openings: (options.openings || []).map((opening) => ({ ...opening })),
            },
        };
        return this.rebuildHostedWall(wall);
    },

    cloneArchitectureObject(source) {
        if (!source) return null;
        const clone = source.clone(true);
        clone.traverse((node) => {
            if (node.isMesh) {
                if (node.geometry?.clone) node.geometry = node.geometry.clone();
                if (Array.isArray(node.material)) node.material = node.material.map((material) => material?.clone?.() || material);
                else if (node.material?.clone) node.material = node.material.clone();
            }
            if (node.userData?.wallData) {
                node.userData = {
                    ...node.userData,
                    wallData: {
                        ...node.userData.wallData,
                        openings: (node.userData.wallData.openings || []).map((opening) => ({ ...opening })),
                    },
                };
            }
        });
        return clone;
    },

    duplicateArchitectureElement(source, delta) {
        if (!source) return null;
        if (source.userData?.wallData) {
            const endpoints = this.getWallWorldEndpoints(source);
            if (!endpoints) return null;
            const wall = this.createHostedWall(
                endpoints.start.clone().add(delta),
                endpoints.end.clone().add(delta),
                {
                    height: source.userData.wallData.height,
                    thickness: source.userData.wallData.thickness,
                    baseY: source.userData.wallData.baseY + (delta.y || 0),
                    story: source.userData.wallData.story,
                    openings: source.userData.wallData.openings,
                    name: `${source.name || "Wall"}_Copy_${Date.now()}`,
                }
            );
            if (wall) this.addArchitectureElement(wall, "wall");
            return wall;
        }

        const clone = this.cloneArchitectureObject(source);
        if (!clone) return null;
        clone.position.add(delta);
        clone.name = `${source.name || source.userData?.archType || "Architecture"}_Copy_${Date.now()}`;
        this.addArchitectureElement(clone, source.userData?.archType || "architecture");
        return clone;
    },

    createWall(start, end) {
        const wall = this.createHostedWall(start, end);
        if (!wall) return;
        this.addArchitectureElement(wall, "wall");
    },

    createRoom(start, end) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);
        const width = maxX - minX;
        const depth = maxZ - minZ;
        if (width < 0.1 || depth < 0.1) return;

        const room = new THREE.Group();
        room.name = `Room_${Date.now()}`;
        room.userData = { ...(room.userData || {}), archType: "room", story: this.settings.archCurrentStory };
        const baseY = this.getCurrentStoryElevation();

        const corners = [
            new THREE.Vector3(minX, baseY, minZ),
            new THREE.Vector3(maxX, baseY, minZ),
            new THREE.Vector3(maxX, baseY, maxZ),
            new THREE.Vector3(minX, baseY, maxZ),
        ];

        for (let i = 0; i < corners.length; i++) {
            const a = corners[i];
            const b = corners[(i + 1) % corners.length];
            const wall = this.createHostedWall(a, b, {
                height: this.settings.archHeight,
                thickness: this.settings.archThickness,
                baseY,
                story: this.settings.archCurrentStory,
                name: `RoomWall_${Date.now()}_${i + 1}`,
            });
            if (wall) room.add(wall);
        }

        if (this.settings.archAddFloor) {
            const floor = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.05, depth),
                new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.9 })
            );
            floor.position.set(minX + width / 2, baseY + 0.025, minZ + depth / 2);
            room.add(floor);
        }

        if (this.settings.archAddCeiling) {
            const ceiling = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.05, depth),
                new THREE.MeshStandardMaterial({ color: 0xefefef, roughness: 0.9 })
            );
            ceiling.position.set(minX + width / 2, baseY + this.settings.archHeight, minZ + depth / 2);
            room.add(ceiling);
        }

        this.addArchitectureElement(room, "room");
    },

    createColumn(point) {
        const radius = Math.max(this.settings.archWidth * 0.5, 0.05);
        const baseY = this.getCurrentStoryElevation();
        const column = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, this.settings.archHeight, Math.max(6, this.settings.archSegments)),
            new THREE.MeshStandardMaterial({ color: 0xd2d2d2, roughness: 0.7 })
        );
        column.position.set(point.x, baseY + (this.settings.archHeight / 2), point.z);
        column.name = `Column_${Date.now()}`;
        this.addArchitectureElement(column, "column");
    },

    createSlab(start, end) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);
        const width = Math.max(maxX - minX, 0.1);
        const depth = Math.max(maxZ - minZ, 0.1);
        const thickness = Math.max(this.settings.archThickness, 0.08);
        const baseY = this.getCurrentStoryElevation();
        const slab = new THREE.Mesh(
            new THREE.BoxGeometry(width, thickness, depth),
            new THREE.MeshStandardMaterial({ color: 0x7f8791, roughness: 0.92 })
        );
        slab.position.set(minX + width / 2, baseY + (thickness / 2), minZ + depth / 2);
        slab.name = `Slab_${Date.now()}`;
        this.addArchitectureElement(slab, "slab");
    },

    createBeam(start, end) {
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        if (length < 0.05) return;
        const baseY = this.getCurrentStoryElevation();
        const beam = new THREE.Mesh(
            new THREE.BoxGeometry(length, Math.max(this.settings.archThickness, 0.12), Math.max(this.settings.archDepth, 0.2)),
            new THREE.MeshStandardMaterial({ color: 0x9a8f84, roughness: 0.78 })
        );
        const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        beam.position.set(midpoint.x, baseY + Math.max(this.settings.archHeight - (this.settings.archThickness * 0.5), 0.2), midpoint.z);
        beam.quaternion.setFromUnitVectors(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(direction.x, 0, direction.z).normalize()
        );
        beam.name = `Beam_${Date.now()}`;
        this.addArchitectureElement(beam, "beam");
    },

    createFacade(start, end) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);
        const width = Math.max(maxX - minX, 0.4);
        const depth = Math.max(maxZ - minZ, 0.08);
        const height = Math.max(this.settings.archHeight, 1.8);
        const bayCount = Math.max(2, this.settings.archSegments);
        const levelCount = Math.max(2, Math.round(height / 1.2));
        const mullionThickness = Math.max(this.settings.archThickness * 0.35, 0.04);
        const baseY = this.getCurrentStoryElevation();
        const group = new THREE.Group();
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x6f7683, roughness: 0.4, metalness: 0.3 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd5f5, transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.12 });

        for (let i = 0; i <= bayCount; i++) {
            const x = minX + (width * i / bayCount);
            const mullion = new THREE.Mesh(new THREE.BoxGeometry(mullionThickness, height, depth), frameMat.clone());
            mullion.position.set(x, baseY + (height * 0.5), minZ + (depth * 0.5));
            group.add(mullion);
        }

        for (let i = 0; i <= levelCount; i++) {
            const y = baseY + (height * i / levelCount);
            const transom = new THREE.Mesh(new THREE.BoxGeometry(width + mullionThickness, mullionThickness, depth), frameMat.clone());
            transom.position.set(minX + (width * 0.5), y, minZ + (depth * 0.5));
            group.add(transom);
        }

        const panelWidth = Math.max((width / bayCount) - (mullionThickness * 1.35), 0.08);
        const panelHeight = Math.max((height / levelCount) - (mullionThickness * 1.35), 0.08);
        for (let row = 0; row < levelCount; row++) {
            for (let col = 0; col < bayCount; col++) {
                const panel = new THREE.Mesh(
                    new THREE.BoxGeometry(panelWidth, panelHeight, Math.max(depth * 0.3, 0.02)),
                    glassMat.clone()
                );
                panel.position.set(
                    minX + (width * (col + 0.5) / bayCount),
                    baseY + (height * (row + 0.5) / levelCount),
                    minZ + (depth * 0.5)
                );
                group.add(panel);
            }
        }

        group.name = `Facade_${Date.now()}`;
        this.addArchitectureElement(group, "facade");
    },

    createTerrain(point) {
        const terrain = new THREE.Mesh(
            new THREE.PlaneGeometry(
                Math.max(this.settings.archWidth * 4, 4),
                Math.max(this.settings.archDepth * 4, 4),
                Math.max(this.settings.archSegments, 1),
                Math.max(this.settings.archSegments, 1)
            ),
            new THREE.MeshStandardMaterial({ color: 0x567d46, side: THREE.DoubleSide, roughness: 1 })
        );
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.set(point.x, 0, point.z);
        terrain.name = `Terrain_${Date.now()}`;
        this.addArchitectureElement(terrain, "terrain");
    },

    createFurnitureItem(point, type) {
        let item = null;
        if (window.ArchitectureTools?.Furniture) {
            if (type === "table" && typeof window.ArchitectureTools.Furniture.createTable === "function") {
                item = window.ArchitectureTools.Furniture.createTable(this.settings.archWidth, this.settings.archDepth, this.settings.archHeight);
            } else if (type === "chair" && typeof window.ArchitectureTools.Furniture.createChair === "function") {
                item = window.ArchitectureTools.Furniture.createChair(this.settings.archWidth, this.settings.archDepth, this.settings.archHeight);
            }
        }

        if (!item) {
            item = new THREE.Group();
            const material = new THREE.MeshStandardMaterial({ color: type === "table" ? 0x8a6a47 : 0x7c6048, roughness: 0.72 });
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(this.settings.archWidth, Math.max(this.settings.archThickness, 0.05), this.settings.archDepth),
                material
            );
            body.position.y = Math.max(this.settings.archHeight * 0.5, 0.2);
            item.add(body);
        }

        item.position.set(point.x, this.getCurrentStoryElevation(), point.z);
        item.name = `${type}_${Date.now()}`;
        this.addArchitectureElement(item, type);
    },

    createStairs(start, end) {
        const runVector = new THREE.Vector3().subVectors(end, start);
        const runLength = Math.max(runVector.length(), 0.3);
        const direction = runVector.clone().normalize();
        const steps = Math.max(2, this.settings.archSegments);
        const treadDepth = runLength / steps;
        const stepHeight = this.settings.archHeight / steps;

        const group = new THREE.Group();
        group.name = `Stairs_${Date.now()}`;
        const material = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.8 });
        const baseY = this.getCurrentStoryElevation();

        for (let i = 0; i < steps; i++) {
            const step = new THREE.Mesh(
                new THREE.BoxGeometry(this.settings.archWidth, stepHeight, treadDepth),
                material
            );
            const center = start.clone()
                .addScaledVector(direction, treadDepth * (i + 0.5))
                .setY(baseY + (stepHeight * (i + 0.5)));
            step.position.copy(center);
            step.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                new THREE.Vector3(direction.x, 0, direction.z).normalize()
            );
            group.add(step);
        }

        this.addArchitectureElement(group, "stairs");
    },

    createRectExtrude(start, end) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);
        const width = maxX - minX;
        const depth = maxZ - minZ;
        if (width < 0.1 || depth < 0.1) return;
        const baseY = this.getCurrentStoryElevation();
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(width, this.settings.archHeight, depth),
            new THREE.MeshStandardMaterial({ color: 0x9fb4c7, roughness: 0.75, metalness: 0.06 })
        );
        mesh.position.set(minX + width / 2, baseY + (this.settings.archHeight / 2), minZ + depth / 2);
        mesh.name = `RectExtrude_${Date.now()}`;
        this.addArchitectureElement(mesh, "rect-extrude");
    },

    createRoof(start, end) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minZ = Math.min(start.z, end.z);
        const maxZ = Math.max(start.z, end.z);
        const width = Math.max(maxX - minX, 0.1);
        const depth = Math.max(maxZ - minZ, 0.1);
        const alongX = width >= depth;
        const span = alongX ? depth : width;
        const rise = Math.max(this.settings.archHeight, 0.4);
        const pitch = Math.atan2(rise, span * 0.5);
        const group = new THREE.Group();
        const baseY = this.getCurrentStoryElevation();
        const material = new THREE.MeshStandardMaterial({ color: 0xb84c46, roughness: 0.8 });
        const panelGeometry = alongX
            ? new THREE.BoxGeometry(width, 0.08, span * 0.54)
            : new THREE.BoxGeometry(span * 0.54, 0.08, depth);
        const offset = span * 0.26;
        const left = new THREE.Mesh(panelGeometry, material);
        const right = new THREE.Mesh(panelGeometry.clone(), material);
        if (alongX) {
            left.rotation.x = -pitch;
            right.rotation.x = pitch;
            left.position.set((minX + maxX) / 2, baseY + (rise * 0.5), (minZ + maxZ) / 2 - offset);
            right.position.set((minX + maxX) / 2, baseY + (rise * 0.5), (minZ + maxZ) / 2 + offset);
        } else {
            left.rotation.z = pitch;
            right.rotation.z = -pitch;
            left.position.set((minX + maxX) / 2 - offset, baseY + (rise * 0.5), (minZ + maxZ) / 2);
            right.position.set((minX + maxX) / 2 + offset, baseY + (rise * 0.5), (minZ + maxZ) / 2);
        }
        group.add(left, right);
        group.name = `Roof_${Date.now()}`;
        this.addArchitectureElement(group, "roof");
    },

    createRailing(start, end) {
        const delta = new THREE.Vector3().subVectors(end, start);
        const length = delta.length();
        if (length < 0.1) return;
        const dir = delta.clone().normalize();
        const height = Math.max(this.settings.archHeight, 0.8);
        const postCount = Math.max(2, Math.round(length / Math.max(this.settings.archDepth, 0.6)) + 1);
        const group = new THREE.Group();
        const baseY = this.getCurrentStoryElevation();
        const railMat = new THREE.MeshStandardMaterial({ color: 0xc8d0d7, roughness: 0.5, metalness: 0.35 });
        const postMat = new THREE.MeshStandardMaterial({ color: 0x848c98, roughness: 0.55, metalness: 0.3 });
        const thickness = Math.max(this.settings.archThickness, 0.03);
        for (let i = 0; i < postCount; i++) {
            const t = postCount === 1 ? 0 : i / (postCount - 1);
            const pos = start.clone().lerp(end, t);
            const post = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, thickness), postMat);
            post.position.set(pos.x, baseY + (height / 2), pos.z);
            group.add(post);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, thickness), railMat);
        rail.position.set((start.x + end.x) / 2, baseY + height - thickness, (start.z + end.z) / 2);
        rail.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dir.x, 0, dir.z).normalize());
        group.add(rail);
        group.name = `Railing_${Date.now()}`;
        this.addArchitectureElement(group, "railing");
    },

    createCurvedWall(start, end) {
        const span = new THREE.Vector3().subVectors(end, start);
        const length = span.length();
        if (length < 0.1) return;
        const group = new THREE.Group();
        const baseY = this.getCurrentStoryElevation();
        const perp = new THREE.Vector3(-span.z, 0, span.x).normalize().multiplyScalar(this.settings.archDepth * 0.5);
        const control = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5).add(perp);
        const curve = new THREE.QuadraticBezierCurve3(start.clone(), control, end.clone());
        const points = curve.getPoints(Math.max(4, this.settings.archSegments));
        const material = new THREE.MeshStandardMaterial({ color: 0xd6cab9, roughness: 0.84 });
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const segment = new THREE.Vector3().subVectors(b, a);
            const segmentLength = segment.length();
            if (segmentLength < 0.01) continue;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(segmentLength, this.settings.archHeight, this.settings.archThickness), material);
            mesh.position.copy(a.clone().add(b).multiplyScalar(0.5)).setY(baseY + (this.settings.archHeight / 2));
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(segment.x, 0, segment.z).normalize());
            mesh.userData = { ...(mesh.userData || {}), archType: "wall" };
            group.add(mesh);
        }
        group.name = `CurvedWall_${Date.now()}`;
        this.addArchitectureElement(group, "curved-wall");
    },

    createMeasureSegment(start, end) {
        const length = start.distanceTo(end);
        if (length < 0.01) return;
        const text = window.ArchitectPrecisionBridge?.formatDistance?.(length, 2) || `${length.toFixed(2)} m`;
        const group = new THREE.Group();
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]),
            new THREE.LineBasicMaterial({ color: 0xffef67, depthTest: false })
        );
        const label = this.createMeasurementLabel(text);
        if (label) label.position.copy(start.clone().add(end).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.35, 0)));
        group.add(line);
        if (label) group.add(label);
        group.name = `Measure_${Date.now()}`;
        this.lastMeasurementText = text;
        this.addArchitectureElement(group, "measure");
    },

    createOpening(intersection, type) {
        const width = this.settings.archWidth;
        const height = type === "door" ? this.settings.archHeight * 0.8 : this.settings.archHeight * 0.45;
        const depth = Math.max(this.settings.archThickness * 0.7, 0.08);
        const host = this.resolveArchitectureHost(intersection.object);
        if (host?.userData?.wallData) {
            const localPoint = host.worldToLocal(intersection.point.clone());
            const wallData = host.userData.wallData;
            const openingWidth = THREE.MathUtils.clamp(width, 0.2, Math.max(wallData.length - 0.1, 0.2));
            const opening = {
                type,
                center: THREE.MathUtils.clamp(localPoint.x, (-wallData.length * 0.5) + (openingWidth * 0.5), (wallData.length * 0.5) - (openingWidth * 0.5)),
                width: openingWidth,
                bottom: type === "door" ? 0 : Math.max(0.6, Math.min(this.settings.archHeight * 0.35, wallData.height - height - 0.2)),
                height: Math.min(height, wallData.height - 0.1),
            };
            wallData.openings = Array.isArray(wallData.openings) ? wallData.openings : [];
            wallData.openings.push(opening);
            this.rebuildHostedWall(host);
            this.architectureSelection = { host };
            return host;
        }

        const normal = intersection.face.normal.clone().transformDirection(intersection.object.matrixWorld).normalize();
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            new THREE.MeshStandardMaterial({
                color: type === "door" ? 0x805a3b : 0x8bb7ff,
                roughness: 0.7,
            })
        );

        mesh.position.copy(intersection.point);
        mesh.position.addScaledVector(normal.clone().negate(), depth * 0.5);
        mesh.position.y = type === "door"
            ? this.getCurrentStoryElevation() + (height / 2)
            : this.getCurrentStoryElevation() + height + 0.9;
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().negate());
        mesh.name = `${type}_${Date.now()}`;
        this.addArchitectureElement(mesh, type);
        return mesh;
    },

    handleArchitectureClick(event) {
        const tool = this.activeArchitectureTool;
        if (!tool) return;

        if (tool === "cad-polyline") {
            const point = this.getPlanDraftPoint(event);
            if (!point) return;
            const draft = this.architecturePlanDraft || { points: [], closed: false };
            if (draft.closed) {
                this.architectureMessage = "This plan is closed. Generate 3D, clear it, or start a new polyline.";
                return;
            }
            const last = draft.points[draft.points.length - 1];
            if (last && last.distanceTo(point) < 0.01) return;
            draft.points.push(point);
            this.architecturePlanDraft = draft;
            this.architecturePoints = [point.clone()];
            this.architectureMessage = `Plan corner ${draft.points.length} placed. Continue tracing, then click Finish plan.`;
            if (window.ModelingToolkitController) window.ModelingToolkitController.refreshUI();
            return;
        }

        if (tool === "door" || tool === "window") {
            const hit = this.getWallIntersection(event);
            if (hit) {
                this.createOpening(hit, tool);
                this.finishArchitectureCommand(`${tool} created.`);
            } else {
                this.architectureMessage = `Click directly on a wall to place a ${tool}.`;
                return;
            }
            return;
        }

        if (tool === "offset") {
            if (!this.architectureSelection?.host) {
                const hit = this.getWallIntersection(event);
                const host = this.resolveArchitectureHost(hit?.object);
                if (host?.userData?.wallData) {
                    this.architectureSelection = { host };
                    this.architectureMessage = "Offset source wall selected. Click to place the parallel wall.";
                } else {
                    this.architectureMessage = "Select a hosted wall first for offset.";
                }
                return;
            }

            const point = this.getRectDraftPoint(event);
            const host = this.architectureSelection.host;
            if (!point || !host?.userData?.wallData) return;
            const localPoint = host.worldToLocal(point.clone());
            const offsetDistance = this.snapStepValue(localPoint.z, this.getCadConstraintContext().snapStep);
            if (Math.abs(offsetDistance) < 0.05) {
                this.architectureMessage = "Move farther from the source wall to create an offset.";
                return;
            }
            const data = host.userData.wallData;
            const start = host.localToWorld(new THREE.Vector3(-data.length * 0.5, 0, offsetDistance));
            const end = host.localToWorld(new THREE.Vector3(data.length * 0.5, 0, offsetDistance));
            const wall = this.createHostedWall(start, end, {
                height: data.height,
                thickness: data.thickness,
                baseY: data.baseY,
                story: data.story,
            });
            if (wall) this.addArchitectureElement(wall, "wall");
            this.finishArchitectureCommand("Offset wall created.");
            return;
        }

        if (tool === "array-linear") {
            if (!this.architectureSelection?.host) {
                const hit = this.getArchitectureIntersection(event);
                const host = this.resolveArchitectureHost(hit?.object) || hit?.object || null;
                if (host) {
                    this.architectureSelection = { host };
                    this.architectureMessage = "Array source selected. Click to define spacing and direction.";
                } else {
                    this.architectureMessage = "Select an architectural object first for the array.";
                }
                return;
            }

            const point = this.getRectDraftPoint(event);
            const host = this.architectureSelection.host;
            const anchor = this.getArchitectureAnchor(host);
            if (!point || !anchor) return;
            const delta = point.clone().sub(anchor);
            if (delta.length() < 0.05) {
                this.architectureMessage = "Click farther away to define the array spacing.";
                return;
            }
            const count = Math.max(2, this.settings.archSegments);
            let created = 0;
            for (let i = 1; i < count; i++) {
                if (this.duplicateArchitectureElement(host, delta.clone().multiplyScalar(i))) created += 1;
            }
            this.finishArchitectureCommand(`Linear array created with ${created} copies.`);
            return;
        }

        const point = (tool === "room" || tool === "rect-extrude" || tool === "roof" || tool === "slab" || tool === "facade")
            ? this.getRectDraftPoint(event)
            : this.getLinearDraftPoint(event);
        if (!point) return;

        if (tool === "column") {
            this.createColumn(point);
            this.finishArchitectureCommand("Column created.");
            return;
        }

        if (tool === "table" || tool === "chair") {
            this.createFurnitureItem(point, tool);
            this.finishArchitectureCommand(`${tool} created.`);
            return;
        }

        if (tool === "terrain") {
            this.createTerrain(point);
            this.finishArchitectureCommand("Terrain created.");
            return;
        }

        this.architecturePoints.push(point);

        if (tool === "wall" && this.architecturePoints.length === 2) {
            this.createWall(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Wall created.");
            return;
        }

        if (tool === "beam" && this.architecturePoints.length === 2) {
            this.createBeam(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Beam created.");
            return;
        }

        if (tool === "room" && this.architecturePoints.length === 2) {
            this.createRoom(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Room created.");
            return;
        }

        if (tool === "slab" && this.architecturePoints.length === 2) {
            this.createSlab(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Slab created.");
            return;
        }

        if (tool === "stairs" && this.architecturePoints.length === 2) {
            this.createStairs(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Stairs created.");
            return;
        }

        if (tool === "rect-extrude" && this.architecturePoints.length === 2) {
            this.createRectExtrude(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Rectangular extrusion created.");
            return;
        }

        if (tool === "roof" && this.architecturePoints.length === 2) {
            this.createRoof(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Roof created.");
            return;
        }

        if (tool === "facade" && this.architecturePoints.length === 2) {
            this.createFacade(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Facade created.");
            return;
        }

        if (tool === "railing" && this.architecturePoints.length === 2) {
            this.createRailing(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Railing created.");
            return;
        }

        if (tool === "curved-wall" && this.architecturePoints.length === 2) {
            this.createCurvedWall(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand("Curved wall created.");
            return;
        }

        if (tool === "measure" && this.architecturePoints.length === 2) {
            this.createMeasureSegment(this.architecturePoints[0], this.architecturePoints[1]);
            this.finishArchitectureCommand(`Measurement placed: ${this.lastMeasurementText || "distance recorded"}.`);
            return;
        }

        this.architectureMessage = `${tool} anchor set. Click the next point.`;
    },

    commitEditableMesh(recordHistory = true, refreshHelpers = true, historyOptions = null) {
        if (!this.activeMesh || !this.editableMesh) return;

        const oldGeometry = this.activeMesh.geometry;
        const historyGeometry = (recordHistory && historyOptions && historyOptions.historyBeforeGeometry)
            ? historyOptions.historyBeforeGeometry
            : (recordHistory && oldGeometry.clone ? oldGeometry.clone() : null);
        const nextGeometry = this.editableMesh.toBufferGeometry();
        const historyNextGeometry = recordHistory && nextGeometry.clone ? nextGeometry.clone() : null;
        nextGeometry.userData = {
            ...(oldGeometry.userData || {}),
            ...(nextGeometry.userData || {}),
            smoothAngle: this.editableMesh.smoothAngle,
        };
        nextGeometry.userData.editMeshTopology = {
            vertices: this.editableMesh.vertices.map((vertex) => [
                vertex.position.x,
                vertex.position.y,
                vertex.position.z,
            ]),
            faces: this.editableMesh.faces.map((face) => face.verts.slice()),
        };
        this.activeMesh.geometry = nextGeometry;
        oldGeometry.dispose();

        if (window.historyManager && typeof window.historyManager.recordGeometryChange === "function" && historyGeometry && historyNextGeometry) {
            try {
                window.historyManager.recordGeometryChange(
                    this.activeMesh,
                    historyGeometry,
                    historyNextGeometry,
                    this.architectureMessage || "Modeling Edit"
                );
            } catch (error) {
                console.warn("History record skipped for modeling change.", error);
            }
        }

        this.editableMesh.rebuildTopology();
        this.syncLegacySelection();
        if (refreshHelpers) {
            this.rebuildAllHelpers();
            this.updateSubObjectTransformGizmo();
        }
    },

    // Called by HistoryManager after a modeling undo/redo: rebuild the
    // editable-mesh data from the restored live geometry and refresh helpers.
    refreshEditableMeshFromLiveGeometry() {
        if (!this.activeMesh) return;
        this.editableMesh = EditableMeshData.fromMesh(this.activeMesh);
        this.rebuildAllHelpers();
        this.syncLegacySelection();
        this.updateSubObjectTransformGizmo();
    },

    syncEditableMeshToLiveGeometry() {
        if (!this.activeMesh || !this.editableMesh || !this.activeMesh.geometry?.attributes?.position) return;

        const geometry = this.activeMesh.geometry;
        const positions = geometry.attributes.position;
        const normalAttribute = geometry.attributes.normal;
        const topology = geometry.userData?.editMeshTopology;
        const renderData = this.editableMesh.buildRenderData();

        if (topology && Array.isArray(topology.vertices)) {
            for (let i = 0; i < Math.min(topology.vertices.length, this.editableMesh.vertices.length); i++) {
                const vertex = this.editableMesh.vertices[i]?.position;
                if (!vertex) continue;
                topology.vertices[i][0] = vertex.x;
                topology.vertices[i][1] = vertex.y;
                topology.vertices[i][2] = vertex.z;
            }
        }

        if (positions.count === renderData.positions.length / 3) {
            for (let i = 0; i < positions.count; i++) {
                positions.setXYZ(
                    i,
                    renderData.positions[i * 3],
                    renderData.positions[i * 3 + 1],
                    renderData.positions[i * 3 + 2]
                );
            }
        }

        positions.needsUpdate = true;
        if (normalAttribute && normalAttribute.count === renderData.normals.length / 3) {
            for (let i = 0; i < normalAttribute.count; i++) {
                normalAttribute.setXYZ(
                    i,
                    renderData.normals[i * 3],
                    renderData.normals[i * 3 + 1],
                    renderData.normals[i * 3 + 2]
                );
            }
            normalAttribute.needsUpdate = true;
        }
        geometry.userData.liveTopologyVertexMap = renderData.liveTopologyVertexMap;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
    },

    extrudeSelection(distance = null) {
        if (!this.editableMesh || !this.editableMesh.selectedFaces.size) {
            this.architectureMessage = "Select at least one face to extrude.";
            return;
        }

        const selectedFaces = [...this.editableMesh.selectedFaces];
        const selectedFaceSet = new Set(selectedFaces);
        const boundaryMap = new Map();
        const vertexNormals = new Map();

        selectedFaces.forEach((faceIndex) => {
            const face = this.editableMesh.faces[faceIndex];
            const normal = this.editableMesh.computeFaceNormal(faceIndex);
            face.verts.forEach((vertexIndex) => {
                if (!vertexNormals.has(vertexIndex)) vertexNormals.set(vertexIndex, new THREE.Vector3());
                vertexNormals.get(vertexIndex).add(normal);
            });
            for (let i = 0; i < face.verts.length; i++) {
                const a = face.verts[i];
                const b = face.verts[(i + 1) % face.verts.length];
                const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                boundaryMap.set(key, (boundaryMap.get(key) || 0) + 1);
            }
        });

        const duplicateMap = new Map();
        vertexNormals.forEach((normal, vertexIndex) => {
            normal.normalize();
            const requestedDistance = Number(distance);
            const extrudeDistance = Number.isFinite(requestedDistance)
                ? requestedDistance
                : this.getAverageScale() * 2;
            const newVertex = this.editableMesh.vertices[vertexIndex].position.clone().addScaledVector(normal, extrudeDistance);
            duplicateMap.set(vertexIndex, this.editableMesh.vertices.length);
            this.editableMesh.vertices.push({ position: newVertex });
        });

        const nextFaces = [];
        this.editableMesh.faces.forEach((face, index) => {
            if (!selectedFaceSet.has(index)) nextFaces.push({ verts: face.verts.slice() });
        });

        selectedFaces.forEach((faceIndex) => {
            const face = this.editableMesh.faces[faceIndex];
            nextFaces.push({ verts: face.verts.map((vertexIndex) => duplicateMap.get(vertexIndex)) });
        });

        boundaryMap.forEach((count, key) => {
            if (count !== 1) return;
            const [a, b] = key.split("_").map(Number);
            const a2 = duplicateMap.get(a);
            const b2 = duplicateMap.get(b);
            nextFaces.push({ verts: [a, b, b2, a2] });
        });

        this.editableMesh.faces = nextFaces;
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Extrude complete.";
    },

    subdivideSelection() {
        if (!this.editableMesh) return;
        const selectedFaces = this.editableMesh.selectedFaces.size
            ? new Set(this.editableMesh.selectedFaces)
            : new Set(this.editableMesh.faces.map((_, index) => index));

        const midpointCache = new Map();
        const midpointIndex = (a, b) => {
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            if (midpointCache.has(key)) return midpointCache.get(key);
            const position = this.editableMesh.vertices[a].position.clone().add(this.editableMesh.vertices[b].position).multiplyScalar(0.5);
            const index = this.editableMesh.vertices.length;
            this.editableMesh.vertices.push({ position });
            midpointCache.set(key, index);
            return index;
        };

        const nextFaces = [];
        this.editableMesh.faces.forEach((face, faceIndex) => {
            if (!selectedFaces.has(faceIndex)) {
                nextFaces.push({ verts: face.verts.slice() });
                return;
            }

            if (face.verts.length === 4) {
                const [a, b, c, d] = face.verts;
                const ab = midpointIndex(a, b);
                const bc = midpointIndex(b, c);
                const cd = midpointIndex(c, d);
                const da = midpointIndex(d, a);
                const center = this.editableMesh.vertices.length;
                const centerPosition = this.editableMesh.vertices[a].position.clone()
                    .add(this.editableMesh.vertices[b].position)
                    .add(this.editableMesh.vertices[c].position)
                    .add(this.editableMesh.vertices[d].position)
                    .multiplyScalar(0.25);
                this.editableMesh.vertices.push({ position: centerPosition });

                nextFaces.push({ verts: [a, ab, center, da] });
                nextFaces.push({ verts: [ab, b, bc, center] });
                nextFaces.push({ verts: [center, bc, c, cd] });
                nextFaces.push({ verts: [da, center, cd, d] });
                return;
            }

            const [a, b, c] = face.verts;
            const ab = midpointIndex(a, b);
            const bc = midpointIndex(b, c);
            const ca = midpointIndex(c, a);
            nextFaces.push({ verts: [a, ab, ca] });
            nextFaces.push({ verts: [ab, b, bc] });
            nextFaces.push({ verts: [ca, bc, c] });
            nextFaces.push({ verts: [ab, bc, ca] });
        });

        this.editableMesh.faces = nextFaces;
        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Subdivision complete.";
    },

    mergeSelection() {
        if (!this.editableMesh) return;
        const mergeVertices = new Set();

        if (this.selectMode === "vertex") {
            this.editableMesh.selectedVertices.forEach((index) => mergeVertices.add(index));
        } else if (this.selectMode === "edge") {
            this.editableMesh.selectedEdges.forEach((edgeIndex) => {
                const edge = this.editableMesh.edges[edgeIndex];
                if (!edge) return;
                mergeVertices.add(edge.a);
                mergeVertices.add(edge.b);
            });
        } else if (this.selectMode === "face") {
            this.editableMesh.selectedFaces.forEach((faceIndex) => {
                const face = this.editableMesh.faces[faceIndex];
                if (!face) return;
                face.verts.forEach((vertexIndex) => mergeVertices.add(vertexIndex));
            });
        }

        if (mergeVertices.size < 2) {
            this.architectureMessage = "Select at least two connected vertices to merge.";
            return;
        }

        const targetIndices = [...mergeVertices];
        const keeper = targetIndices[0];
        const center = new THREE.Vector3();
        targetIndices.forEach((vertexIndex) => {
            const vertex = this.editableMesh.vertices[vertexIndex];
            if (vertex) center.add(vertex.position);
        });
        center.divideScalar(targetIndices.length);

        const remap = new Map();
        targetIndices.forEach((vertexIndex) => remap.set(vertexIndex, keeper));
        this.editableMesh.vertices[keeper].position.copy(center);

        const nextFaces = [];
        const faceKeys = new Set();
        this.editableMesh.faces.forEach((face) => {
            if (!face || face.verts.length < 3) return;

            const mapped = face.verts.map((vertexIndex) => remap.get(vertexIndex) ?? vertexIndex);
            const collapsed = [];
            mapped.forEach((vertexIndex) => {
                if (!collapsed.length || collapsed[collapsed.length - 1] !== vertexIndex) {
                    collapsed.push(vertexIndex);
                }
            });
            if (collapsed.length > 2 && collapsed[0] === collapsed[collapsed.length - 1]) {
                collapsed.pop();
            }
            if (new Set(collapsed).size < 3) return;

            const faceKey = [...collapsed].sort((a, b) => a - b).join("_");
            if (faceKeys.has(faceKey)) return;
            faceKeys.add(faceKey);
            nextFaces.push({ verts: collapsed });
        });

        const usedVertices = new Set();
        nextFaces.forEach((face) => face.verts.forEach((vertexIndex) => usedVertices.add(vertexIndex)));

        const compactMap = new Map();
        const compactVertices = [];
        this.editableMesh.vertices.forEach((vertex, index) => {
            if (!usedVertices.has(index)) return;
            compactMap.set(index, compactVertices.length);
            compactVertices.push({ position: vertex.position.clone() });
        });

        nextFaces.forEach((face) => {
            face.verts = face.verts.map((vertexIndex) => compactMap.get(vertexIndex));
        });

        this.editableMesh.vertices = compactVertices;
        this.editableMesh.faces = nextFaces;
        this.editableMesh.clearSelection();
        const mergedIndex = compactMap.get(keeper);
        if (mergedIndex !== undefined) {
            this.editableMesh.selectedVertices.add(mergedIndex);
            this.selectMode = "vertex";
        }

        this.commitEditableMesh();
        this.architectureMessage = "Merge complete.";
    },

    deleteSelection() {
        if (!this.editableMesh) return;

        if (this.selectMode === "face" && this.editableMesh.selectedFaces.size) {
            this.editableMesh.faces = this.editableMesh.faces.filter((_, index) => !this.editableMesh.selectedFaces.has(index));
        } else if (this.selectMode === "vertex" && this.editableMesh.selectedVertices.size) {
            const keepVertices = [];
            const remap = new Map();
            this.editableMesh.vertices.forEach((vertex, index) => {
                if (this.editableMesh.selectedVertices.has(index)) return;
                remap.set(index, keepVertices.length);
                keepVertices.push({ position: vertex.position.clone() });
            });
            const nextFaces = [];
            this.editableMesh.faces.forEach((face) => {
                if (face.verts.some((index) => !remap.has(index))) return;
                nextFaces.push({ verts: face.verts.map((index) => remap.get(index)) });
            });
            this.editableMesh.vertices = keepVertices;
            this.editableMesh.faces = nextFaces;
        } else if (this.selectMode === "edge" && this.editableMesh.selectedEdges.size) {
            const blockedEdges = new Set([...this.editableMesh.selectedEdges].map((index) => {
                const edge = this.editableMesh.edges[index];
                return edge.a < edge.b ? `${edge.a}_${edge.b}` : `${edge.b}_${edge.a}`;
            }));
            this.editableMesh.faces = this.editableMesh.faces.filter((face) => {
                for (let i = 0; i < face.verts.length; i++) {
                    const a = face.verts[i];
                    const b = face.verts[(i + 1) % face.verts.length];
                    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                    if (blockedEdges.has(key)) return false;
                }
                return true;
            });
        } else {
            this.architectureMessage = "Nothing selected to delete.";
            return;
        }

        this.editableMesh.clearSelection();
        this.commitEditableMesh();
        this.architectureMessage = "Selection deleted.";
    },

    deleteActiveMesh() {
        if (!this.activeMesh) return;
        const mesh = this.activeMesh;
        if (mesh.parent) mesh.parent.remove(mesh);
        if (window.architecturalElements) {
            window.architecturalElements = window.architecturalElements.filter((item) => item !== mesh);
        }
        this.activeMesh = null;
        this.editableMesh = null;
        if (typeof activeObject !== "undefined") activeObject = null;
        this.exitEditMode();
    },

    getSubObjectTransformCenter() {
        if (!this.editableMesh) return null;

        let centerPos = new THREE.Vector3();
        let count = 0;

        if (this.selectMode === "vertex") {
            this.editableMesh.selectedVertices.forEach(vertexIndex => {
                const vertex = this.editableMesh.vertices[vertexIndex];
                if (vertex) {
                    centerPos.add(vertex.position);
                    count++;
                }
            });
        } else if (this.selectMode === "edge") {
            this.editableMesh.selectedEdges.forEach(edgeIndex => {
                const edge = this.editableMesh.edges[edgeIndex];
                if (edge) {
                    const v1 = this.editableMesh.vertices[edge.a];
                    const v2 = this.editableMesh.vertices[edge.b];
                    if (v1 && v2) {
                        centerPos.add(v1.position);
                        centerPos.add(v2.position);
                        count += 2;
                    }
                }
            });
        } else if (this.selectMode === "face") {
            this.editableMesh.selectedFaces.forEach(faceIndex => {
                const face = this.editableMesh.faces[faceIndex];
                if (face) {
                    face.verts.forEach(vertexIndex => {
                        const vertex = this.editableMesh.vertices[vertexIndex];
                        if (vertex) {
                            centerPos.add(vertex.position);
                            count++;
                        }
                    });
                }
            });
        }

        if (count > 0) {
            centerPos.divideScalar(count);
            return centerPos;
        }
        return null;
    },

    getSelectedVertexIndices() {
        const indices = new Set();
        if (!this.editableMesh) return indices;

        if (this.selectMode === "vertex") {
            this.editableMesh.selectedVertices.forEach((vertexIndex) => indices.add(vertexIndex));
        } else if (this.selectMode === "edge") {
            this.editableMesh.selectedEdges.forEach((edgeIndex) => {
                const edge = this.editableMesh.edges[edgeIndex];
                if (!edge) return;
                indices.add(edge.a);
                indices.add(edge.b);
            });
        } else if (this.selectMode === "face") {
            this.editableMesh.selectedFaces.forEach((faceIndex) => {
                const face = this.editableMesh.faces[faceIndex];
                if (!face) return;
                face.verts.forEach((vertexIndex) => indices.add(vertexIndex));
            });
        }

        return indices;
    },

    applyTransformControlsDelta(finalize = false) {
        if (!this._subObjectDragState || !this.activeMesh || !this.editableMesh || !this.subObjectPivot) return;

        const meshMatrixWorld = this.activeMesh.matrixWorld.clone();
        const meshMatrixWorldInverse = meshMatrixWorld.clone().invert();
        const deltaWorld = this.subObjectPivot.matrixWorld.clone().multiply(
            this._subObjectDragState.startPivotMatrixWorld.clone().invert()
        );

        const softEngine = window.SoftSelectionEngine;
        const useSoft = !!(softEngine && softEngine.enabled && this._subObjectDragState.softWeights);

        const affected = useSoft
            ? Array.from(this._subObjectDragState.softWeights.keys())
            : this._subObjectDragState.selectedVertexIndices;

        affected.forEach((vertexIndex) => {
            const sourceLocal = this._subObjectDragState.vertexPositions.get(vertexIndex);
            const vertex = this.editableMesh.vertices[vertexIndex];
            if (!sourceLocal || !vertex) return;

            const worldPoint = sourceLocal.clone().applyMatrix4(meshMatrixWorld);
            const nextWorldPoint = worldPoint.clone().applyMatrix4(deltaWorld);
            const nextLocalPoint = nextWorldPoint.applyMatrix4(meshMatrixWorldInverse);

            if (useSoft) {
                const w = this._subObjectDragState.softWeights.get(vertexIndex) || 0;
                if (w >= 1) {
                    vertex.position.copy(nextLocalPoint);
                } else if (w > 0) {
                    vertex.position.lerpVectors(sourceLocal, nextLocalPoint, w);
                }
            } else {
                vertex.position.copy(nextLocalPoint);
            }
        });

        this._subObjectDragDirty = true;
        if (finalize) {
            this.commitEditableMesh(true, true, {
                historyBeforeGeometry: this._subObjectDragState?.dragStartGeometry || null
            });
        } else {
            this.syncEditableMeshToLiveGeometry();
        }
    },

    applySubObjectTransform(position, rotation, scale) {
        if (!this.editableMesh || this.getSelectionCount() === 0) return;

        const offset = position.clone().sub(this.getSubObjectTransformCenter() || new THREE.Vector3());

        if (this.selectMode === "vertex") {
            this.editableMesh.selectedVertices.forEach(vertexIndex => {
                const vertex = this.editableMesh.vertices[vertexIndex];
                if (vertex) {
                    vertex.position.add(offset);
                }
            });
        } else if (this.selectMode === "edge") {
            this.editableMesh.selectedEdges.forEach(edgeIndex => {
                const edge = this.editableMesh.edges[edgeIndex];
                if (edge) {
                    const v1 = this.editableMesh.vertices[edge.a];
                    const v2 = this.editableMesh.vertices[edge.b];
                    if (v1) v1.position.add(offset);
                    if (v2) v2.position.add(offset);
                }
            });
        } else if (this.selectMode === "face") {
            this.editableMesh.selectedFaces.forEach(faceIndex => {
                const face = this.editableMesh.faces[faceIndex];
                if (face) {
                    face.verts.forEach(vertexIndex => {
                        const vertex = this.editableMesh.vertices[vertexIndex];
                        if (vertex) {
                            vertex.position.add(offset);
                        }
                    });
                }
            });
        }

        this.commitEditableMesh();
    },
};

window.UnifiedModelingSystem = UnifiedModelingSystem;
window.vertexHelpers = vertexHelpers;
window.edgeHelpers = edgeHelpers;
window.faceHelpers = faceHelpers;

window.handleCanvasClick = function (event) {
    if (window.UnifiedModelingSystem) window.UnifiedModelingSystem.handlePointerUp(event);
};

window.onModelingMouseMove = function (event) {
    if (window.UnifiedModelingSystem) window.UnifiedModelingSystem.handlePointerMove(event);
};

window.onMouseDown = function (event) {
    if (window.UnifiedModelingSystem) window.UnifiedModelingSystem.handlePointerDown(event);
};

window.onMouseUp = function (event) {
    if (window.UnifiedModelingSystem) window.UnifiedModelingSystem.handlePointerUp(event);
};

window.toggleModelingMode = function (forceMode) {
    const system = window.UnifiedModelingSystem;
    if (!system) return false;

    if (typeof forceMode === "boolean") {
        if (forceMode) return system.enterEditMode();
        system.exitEditMode();
        return false;
    }

    system.toggleEditMode();
    return system.isEditMode;
};

window.setSelectionMode = function (mode) {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.setSelectionMode(mode);
    }
};

window.mergeActiveGeometry = function () {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.mergeSelection();
    }
};

window.applySubdivision = function (level) {
    if (!window.UnifiedModelingSystem) return;
    const steps = Math.max(1, parseInt(level, 10) || 1);
    for (let i = 0; i < steps; i++) {
        window.UnifiedModelingSystem.subdivideSelection();
    }
};

window.extrudeSelection = function () {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.extrudeSelection();
    }
};

window.insetSelection = function () {
    if (!window.UnifiedModelingSystem) return;
    window.UnifiedModelingSystem.setPolygonTool("inset");
};

window.smoothSelection = function () {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.smoothSelection();
    }
};

window.knifeSelection = function () {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.applyKnifeCut();
    }
};

window.polyBuildSelection = function () {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.polyBuildFace();
    }
};

window.ripRegion = function () {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.applyRipRegion();
    }
};

window.activatePolygonTool = function (toolName) {
    if (!window.UnifiedModelingSystem) return;
    window.UnifiedModelingSystem.setPolygonTool(toolName);
};

window.deactivateCurrentPolygonTool = function () {
    if (!window.UnifiedModelingSystem) return;
    window.UnifiedModelingSystem.setPolygonTool(null);
};

window.deleteSelectedObject = function () {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.deleteActiveMesh();
    }
};

window.toggleArchTool = function (toolName) {
    if (!window.UnifiedModelingSystem) return;
    const system = window.UnifiedModelingSystem;
    const nextTool = system.activeArchitectureTool === toolName ? null : toolName;
    system.setArchitectureTool(nextTool);
};

window.deactivateCurrentArchTool = function () {
    if (window.UnifiedModelingSystem) {
        window.UnifiedModelingSystem.setArchitectureTool(null);
    }
};

window.updateModelingUI = function () {
    if (window.ModelingToolkitController && typeof window.ModelingToolkitController.refreshUI === "function") {
        window.ModelingToolkitController.refreshUI();
    }
};

// --- END OF FILE ---
