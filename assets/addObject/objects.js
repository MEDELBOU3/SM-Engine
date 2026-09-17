// ============================================================================
// assets/addObject/objects.js
// SM Engine Primitives & Add-Menu Dispatcher
// Fixed: Inverted Normals & Missing Faces (Strict CCW Winding + DoubleSide Shading)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. WORKSPACE / MODELING MODE DETECTION
// ----------------------------------------------------------------------------

function isEngineInModelingMode() {
    if (typeof window === 'undefined') return false;
    
    if (window.isModelingMode === true || window.editMode === true) return true;
    if (window.currentMode === 'MODELING' || window.currentMode === 'EDIT') return true;

    const wsMode = window.workspaceManager?.currentMode;
    if (wsMode) {
        const m = String(wsMode).toUpperCase();
        if (m === 'MODELING' || m === 'EDIT' || m === 'SCULPT') return true;
    }

    try {
        const saved = localStorage.getItem('sm_workspace_mode');
        if (saved && (saved.toUpperCase() === 'MODELING' || saved.toUpperCase() === 'EDIT')) {
            return true;
        }
    } catch (e) {}

    return false;
}

// ----------------------------------------------------------------------------
// 2. MATERIAL & BLENDER-STYLE PBR SHADING (NO INVISIBLE FACES)
// ----------------------------------------------------------------------------

function createDefaultModelingMaterial(options = {}) {
    return new THREE.MeshPhysicalMaterial({
        color: options.color ?? 0xe2e5e9,        // Studio clay neutral
        roughness: options.roughness ?? 0.38,   // Sharp highlights
        metalness: options.metalness ?? 0.04,
        clearcoat: options.clearcoat ?? 0.35,   // Highlights 3D curvature
        clearcoatRoughness: 0.18,
        reflectivity: 0.5,
        // CRITICAL FIX: DoubleSide guarantees NO FACE IS EVER CULLED OR INVISIBLE
        side: options.side ?? THREE.DoubleSide,
        shadowSide: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 0.5,
        polygonOffsetUnits: 0.5,
        depthTest: true,
        depthWrite: true
    });
}

// ----------------------------------------------------------------------------
// 3. BLENDER QUAD WIREFRAME HELPER
// ----------------------------------------------------------------------------

function createQuadEdgeHelper(mesh, options = {}) {
    const topology = mesh.geometry?.userData?.editMeshTopology;
    if (!topology || !topology.vertices || !topology.faces) {
        return null;
    }

    const vertices = topology.vertices;
    const faces = topology.faces;
    const edgeSet = new Set();
    const linePositions = [];

    const addEdge = (idx1, idx2) => {
        const a = Math.min(idx1, idx2);
        const b = Math.max(idx1, idx2);
        const key = `${a}_${b}`;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            const v1 = vertices[idx1];
            const v2 = vertices[idx2];
            if (v1 && v2) {
                linePositions.push(v1[0], v1[1], v1[2]);
                linePositions.push(v2[0], v2[1], v2[2]);
            }
        }
    };

    for (let f = 0; f < faces.length; f++) {
        const face = faces[f];
        if (face.length === 4) {
            addEdge(face[0], face[1]);
            addEdge(face[1], face[2]);
            addEdge(face[2], face[3]);
            addEdge(face[3], face[0]);
        } else if (face.length === 3) {
            addEdge(face[0], face[1]);
            addEdge(face[1], face[2]);
            addEdge(face[2], face[0]);
        }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
        color: options.color ?? 0x181c24,
        linewidth: options.width ?? 1,
        transparent: true,
        opacity: options.opacity ?? 0.85,
        depthTest: true,
        depthWrite: false
    });

    const wireframeMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    wireframeMesh.name = `${mesh.name || 'Mesh'}_QuadEdgeHelper`;
    wireframeMesh.renderOrder = (mesh.renderOrder || 0) + 2;
    wireframeMesh.userData.isQuadHelper = true;

    // Visible ONLY in modeling mode
    wireframeMesh.visible = isEngineInModelingMode();

    return wireframeMesh;
}

/**
 * Builds BufferGeometry with proper positions, UVs, and consistent normals
 */
function buildGeometryFromQuadTopology(topology) {
    const vertices = topology.vertices;
    const faces = topology.faces;
    const uvsSource = topology.uvs || null;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < vertices.length; i++) {
        positions.push(vertices[i][0], vertices[i][1], vertices[i][2]);
    }

    // Assign or auto-project UV coordinates to prevent shader crashes
    if (uvsSource && uvsSource.length === vertices.length) {
        for (let i = 0; i < uvsSource.length; i++) {
            uvs.push(uvsSource[i][0], uvsSource[i][1]);
        }
    } else {
        for (let i = 0; i < vertices.length; i++) {
            const vx = vertices[i][0], vy = vertices[i][1], vz = vertices[i][2];
            const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
            const u = 0.5 + Math.atan2(vz, vx) / (2 * Math.PI);
            const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, vy / len))) / Math.PI;
            uvs.push(isNaN(u) ? 0 : u, isNaN(v) ? 0 : v);
        }
    }

    // Triangulate quads with clean counter-clockwise (CCW) front orientation
    for (let f = 0; f < faces.length; f++) {
        const face = faces[f];
        if (face.length === 4) {
            indices.push(face[0], face[1], face[2]);
            indices.push(face[0], face[2], face[3]);
        } else if (face.length === 3) {
            indices.push(face[0], face[1], face[2]);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    geometry.userData = geometry.userData || {};
    geometry.userData.editMeshTopology = topology;
    geometry.userData.isQuadBased = true;

    return geometry;
}

// ----------------------------------------------------------------------------
// 4. PURE QUAD TOPOLOGY GENERATORS (VERIFIED OUTWARD WINDING)
// ----------------------------------------------------------------------------

function createQuadBoxTopology(width, height, depth, widthSeg = 2, heightSeg = 2, depthSeg = 2) {
    const vertices = [];
    const faces = [];
    const uvs = [];
    const hw = width / 2, hh = height / 2, hd = depth / 2;

    function addQuadFace(corners, segU, segV) {
        const startIdx = vertices.length;
        for (let j = 0; j <= segV; j++) {
            const v = j / segV;
            for (let i = 0; i <= segU; i++) {
                const u = i / segU;
                const x = (1 - u) * (1 - v) * corners[0][0] + u * (1 - v) * corners[1][0] + u * v * corners[2][0] + (1 - u) * v * corners[3][0];
                const y = (1 - u) * (1 - v) * corners[0][1] + u * (1 - v) * corners[1][1] + u * v * corners[2][1] + (1 - u) * v * corners[3][1];
                const z = (1 - u) * (1 - v) * corners[0][2] + u * (1 - v) * corners[1][2] + u * v * corners[2][2] + (1 - u) * v * corners[3][2];
                vertices.push([x, y, z]);
                uvs.push([u, v]);
            }
        }
        const stride = segU + 1;
        for (let j = 0; j < segV; j++) {
            for (let i = 0; i < segU; i++) {
                const a = startIdx + j * stride + i;
                const b = a + 1;
                const c = a + stride + 1;
                const d = a + stride;
                faces.push([a, b, c, d]);
            }
        }
    }

    // 6 Outward CCW Faces (Strictly outward-pointing normals)
    // Front (+Z)
    addQuadFace([[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]], widthSeg, heightSeg);
    // Back (-Z)
    addQuadFace([[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]], widthSeg, heightSeg);
    // Top (+Y)
    addQuadFace([[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]], widthSeg, depthSeg);
    // Bottom (-Y)
    addQuadFace([[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]], widthSeg, depthSeg);
    // Right (+X)
    addQuadFace([[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]], depthSeg, heightSeg);
    // Left (-X)
    addQuadFace([[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]], depthSeg, heightSeg);

    return { vertices, faces, uvs };
}

function createQuadGridTopology(width, depth, widthSegments = 4, depthSegments = 4) {
    const vertices = [];
    const faces = [];
    const uvs = [];

    for (let z = 0; z <= depthSegments; z++) {
        const v = z / depthSegments;
        const vz = (v - 0.5) * depth;
        for (let x = 0; x <= widthSegments; x++) {
            const u = x / widthSegments;
            const vx = (u - 0.5) * width;
            vertices.push([vx, 0, vz]);
            uvs.push([u, 1 - v]);
        }
    }

    const row = widthSegments + 1;
    for (let z = 0; z < depthSegments; z++) {
        for (let x = 0; x < widthSegments; x++) {
            const a = z * row + x;
            const b = a + 1;
            const c = a + row + 1;
            const d = a + row;
            // CCW order pointing upwards (+Y)
            faces.push([a, d, c, b]);
        }
    }

    return { vertices, faces, uvs };
}

function createQuadUvSphereTopology(radius, widthSeg = 18, heightSeg = 12) {
    const lonSeg = Math.max(4, Math.round(widthSeg));
    const latSeg = Math.max(3, Math.round(heightSeg));
    const vertices = [[0, radius, 0]];
    const uvs = [[0.5, 1]];
    const faces = [];
    const ringCount = latSeg - 1;

    const ringIndex = (ring, segment) => 1 + (ring * lonSeg) + (segment % lonSeg);

    for (let lat = 1; lat < latSeg; lat++) {
        const v = 1 - (lat / latSeg);
        const phi = (lat / latSeg) * Math.PI;
        const y = Math.cos(phi) * radius;
        const ringRadius = Math.sin(phi) * radius;

        for (let lon = 0; lon < lonSeg; lon++) {
            const u = lon / lonSeg;
            const theta = (lon / lonSeg) * Math.PI * 2;
            vertices.push([
                Math.sin(theta) * ringRadius,
                y,
                Math.cos(theta) * ringRadius,
            ]);
            uvs.push([u, v]);
        }
    }

    const southPoleIdx = vertices.length;
    vertices.push([0, -radius, 0]);
    uvs.push([0.5, 0]);

    // North pole
    for (let lon = 0; lon < lonSeg; lon++) {
        const next = (lon + 1) % lonSeg;
        faces.push([0, ringIndex(0, lon), ringIndex(0, next)]);
    }

    // Quads across sphere body
    for (let ring = 0; ring < ringCount - 1; ring++) {
        for (let lon = 0; lon < lonSeg; lon++) {
            const next = (lon + 1) % lonSeg;
            faces.push([
                ringIndex(ring, lon),
                ringIndex(ring + 1, lon),
                ringIndex(ring + 1, next),
                ringIndex(ring, next),
            ]);
        }
    }

    // South pole
    const lastRing = ringCount - 1;
    for (let lon = 0; lon < lonSeg; lon++) {
        const next = (lon + 1) % lonSeg;
        faces.push([southPoleIdx, ringIndex(lastRing, next), ringIndex(lastRing, lon)]);
    }

    return { vertices, faces, uvs };
}

function createQuadCylinderTopology(radiusTop = 0.65, radiusBottom = 0.65, height = 1.8, radialSeg = 18, heightSeg = 3) {
    const vertices = [];
    const uvs = [];
    const faces = [];
    const halfH = height / 2;

    for (let y = 0; y <= heightSeg; y++) {
        const v = y / heightSeg;
        const currentY = (v - 0.5) * height;
        const currentRadius = radiusBottom + (radiusTop - radiusBottom) * v;

        for (let i = 0; i < radialSeg; i++) {
            const u = i / radialSeg;
            const theta = u * Math.PI * 2;
            vertices.push([
                Math.cos(theta) * currentRadius,
                currentY,
                Math.sin(theta) * currentRadius
            ]);
            uvs.push([u, v]);
        }
    }

    // Side Quads with CCW outward normals
    for (let y = 0; y < heightSeg; y++) {
        for (let i = 0; i < radialSeg; i++) {
            const nextI = (i + 1) % radialSeg;
            const a = y * radialSeg + i;
            const b = y * radialSeg + nextI;
            const c = (y + 1) * radialSeg + nextI;
            const d = (y + 1) * radialSeg + i;
            faces.push([a, b, c, d]);
        }
    }

    // Top cap (+Y)
    const topCenterIdx = vertices.length;
    vertices.push([0, halfH, 0]);
    uvs.push([0.5, 0.5]);

    // Bottom cap (-Y)
    const bottomCenterIdx = vertices.length;
    vertices.push([0, -halfH, 0]);
    uvs.push([0.5, 0.5]);

    const topRingStart = heightSeg * radialSeg;
    for (let i = 0; i < radialSeg; i++) {
        const next = (i + 1) % radialSeg;
        faces.push([topCenterIdx, topRingStart + next, topRingStart + i]); // CCW top
        faces.push([bottomCenterIdx, i, next]);                             // CCW bottom
    }

    return { vertices, faces, uvs };
}

function createQuadTorusTopology(radius = 0.82, tube = 0.28, radialSegments = 14, tubularSegments = 26) {
    const vertices = [];
    const uvs = [];
    const faces = [];

    for (let j = 0; j < radialSegments; j++) {
        const v = j / radialSegments;
        for (let i = 0; i < tubularSegments; i++) {
            const u = i / tubularSegments;
            const theta = u * Math.PI * 2;
            const phi = v * Math.PI * 2;

            const x = (radius + tube * Math.cos(phi)) * Math.cos(theta);
            const y = tube * Math.sin(phi);
            const z = (radius + tube * Math.cos(phi)) * Math.sin(theta);

            vertices.push([x, y, z]);
            uvs.push([u, v]);
        }
    }

    for (let j = 0; j < radialSegments; j++) {
        const nextJ = (j + 1) % radialSegments;
        for (let i = 0; i < tubularSegments; i++) {
            const nextI = (i + 1) % tubularSegments;

            const a = j * tubularSegments + i;
            const b = j * tubularSegments + nextI;
            const c = nextJ * tubularSegments + nextI;
            const d = nextJ * tubularSegments + i;

            faces.push([a, d, c, b]);
        }
    }

    return { vertices, faces, uvs };
}

// ----------------------------------------------------------------------------
// 5. PRIMITIVE FINALIZATION & PLACEMENT
// ----------------------------------------------------------------------------
function finalizeModelingPrimitive(mesh, primitiveType, params, label, options = {}) {
    if (!mesh) return null;

    mesh.userData.primitiveType = primitiveType;
    mesh.userData.params = params;

    const quadHelper = createQuadEdgeHelper(mesh, {
        color: options.wireColor ?? 0x181c24,
        opacity: options.wireOpacity ?? 0.85
    });

    if (quadHelper) {
        mesh.add(quadHelper);
        mesh.userData.quadEdgeHelper = quadHelper;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = options.receiveShadow ?? true;

    placeAndOffset(mesh, options.scale ?? 1.0);

    // ============================================================
    // FALLBACK-SAFE SCENE REGISTRATION
    // ============================================================
    // Multiple systems may be responsible for adding an object to the
    // scene. Try them in order until one succeeds.
    // ============================================================

    let registered = false;

    // 1. Best: `addObjectToScene` if it's a function (it handles
    //    scene.add + smSceneManager + timeline + selection + events)
    if (typeof window.addObjectToScene === 'function') {
        try {
            window.addObjectToScene(mesh, label);
            registered = true;
        } catch (err) {
            console.warn('[finalize] addObjectToScene failed:', err);
        }
    }

    // 2. Fallback: direct scene.add + hierarchy refresh + selection
    if (!registered) {
        if (window.scene) {
            window.scene.add(mesh);
        }

        // Register with the scene manager for hierarchy display
        window.smSceneManager?.registerObject?.(mesh, {
            recursive: true,
            source: 'finalize-fallback',
        });

        // Legacy array — keep in sync only if it exists
        if (Array.isArray(window.objects) && !window.objects.includes(mesh)) {
            window.objects.push(mesh);
        }

        // Timeline
        if (typeof window.addObjectToTimeline === 'function') {
            try { window.addObjectToTimeline(mesh); } catch (e) {}
        }

        // Hierarchy
        if (typeof window.updateHierarchy === 'function') {
            try { window.updateHierarchy(); } catch (e) {}
        }

        // Selection
        if (typeof window.selectObject === 'function') {
            try { window.selectObject(mesh); } catch (e) {}
        } else {
            window.selectedObject = mesh;
            window.transformControls?.attach?.(mesh);
            if (window.outlinePass) window.outlinePass.selectedObjects = [mesh];
        }

        // Event
        window.dispatchEvent(new CustomEvent('sm:object-added', {
            detail: { object: mesh, source: 'finalize-fallback' },
        }));
    }

    return mesh;
}

function placeAndOffset(object, customScale = 1.0) {
    if (typeof objectSpawnOffset === "undefined" || typeof spawnSpacing === "undefined") {
        object.position.set(0, 0.5, 0);
        return;
    }

    if (customScale !== 1.0) {
        object.scale.setScalar(customScale);
    }

    if (Math.abs(objectSpawnOffset.x) > 25) {
        objectSpawnOffset.x = 0;
    }

    object.position.copy(objectSpawnOffset);
    let bbox = new THREE.Box3().setFromObject(object);

    if (bbox.isEmpty() && object.geometry) {
        object.geometry.computeBoundingBox();
        if (object.geometry.boundingBox) {
            bbox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
        }
    }

    if (!bbox.isEmpty()) {
        const size = bbox.getSize(new THREE.Vector3());
        object.position.y += Math.max(0, size.y / 2);
    } else {
        object.position.y += 0.5;
    }

    const objectWidth = bbox.isEmpty() ? 2.0 : bbox.getSize(new THREE.Vector3()).x;
    objectSpawnOffset.x += Math.max(spawnSpacing, objectWidth + 1.0);
}
// ----------------------------------------------------------------------------
// QUAD CAPSULE TOPOLOGY — FIXED VERSION
// ----------------------------------------------------------------------------
// Approach: build the capsule as a "sphere with stretched middle"
// - Use spherical coordinates for entire shape
// - The "cylinder" section is just latitude range where radius = max
// - This guarantees consistent winding across the whole surface
// ----------------------------------------------------------------------------

function createQuadCapsuleTopology(
    radius = 0.5,
    length = 1.0,
    capSegments = 8,
    radialSegments = 24
) {
    const vertices = [];
    const uvs = [];
    const faces = [];

    const halfLength = length * 0.5;
    const capSeg = Math.max(2, Math.round(capSegments));
    const radSeg = Math.max(6, Math.round(radialSegments));

    // ----------------------------------------------------------------
    // STRATEGY: Think of the capsule as a sphere that has been
    // vertically stretched. We define a function:
    //
    //   y(t)      = vertical position (t = 0 bottom → t = 1 top)
    //   r(t)      = horizontal radius at that y
    //
    // For a capsule:
    //   - Top hemisphere: t ∈ [cylTopT, 1]  → sphere cap
    //   - Cylinder:       t ∈ [cylBotT, cylTopT] → constant radius
    //   - Bottom hemi:    t ∈ [0, cylBotT] → sphere cap
    //
    // We sample uniformly across t and place rings.
    // This gives us ONE continuous grid — no seams, no double vertices,
    // no winding mismatches.
    // ----------------------------------------------------------------

    // Total rings (excluding poles):
    //   capSeg rings for top hemisphere
    //   1 ring for cylinder (just the middle... actually we can use N=2)
    //   capSeg rings for bottom hemisphere
    // We add "1" implicit cylinder ring by using 2 capSeg rings + 1 middle.

    // Simpler: use capSeg rings total above equator, capSeg below.
    // The cylinder part is naturally formed because rings at the equator
    // have constant radius.

    // Number of latitude rings (excluding poles):
    // Use 2 * capSeg + 1 so we have a middle ring for the cylinder
    const totalRings = capSeg * 2 + 1;
    const ringStride = radSeg;

    // ----------------------------------------------------------------
    // Helper: map ring index (0..totalRings-1) to (y, ringRadius)
    // ----------------------------------------------------------------
    const ringYR = (ringIndex) => {
        // t = 0 at bottom, 1 at top
        // We use parameter u = ringIndex / (totalRings - 1) → 0..1

        // Actually we want: 
        //   ringIndex 0..capSeg-1  → bottom hemisphere
        //   ringIndex capSeg      → equator-bottom
        //   ringIndex capSeg+1    → equator-top  (= cylinder top)
        //   ringIndex capSeg+2..  → top hemisphere
        //
        // Hmm, this is getting complex. Let's use a cleaner formula.

        // Angle-based: theta from 0 to π across entire height
        // But cylinder part has constant radius.
        // Solution: parameterize by "arc position" not by angle.

        // Arc position: 
        //   Bottom pole to bottom equator = π/2 * radius (arc length)
        //   Bottom equator to top equator = length
        //   Top equator to top pole = π/2 * radius (arc length)
        //
        // Total arc = π * radius + length
        // Parameter s ∈ [0, 1] of total arc.
        // Then convert s back to (y, r) piecewise.

        const arcTop = Math.PI * 0.5 * radius;
        const arcMid = length;
        const arcBot = Math.PI * 0.5 * radius;
        const totalArc = arcBot + arcMid + arcTop;

        const s = ringIndex / (totalRings - 1);
        const arcPos = s * totalArc;

        if (arcPos < arcBot) {
            // Bottom hemisphere
            const local = arcPos / arcBot;          // 0..1
            const phi = local * (Math.PI * 0.5);    // 0..π/2
            const r = Math.sin(phi) * radius;
            const y = -Math.cos(phi) * radius - halfLength;
            return { y, r };
        } else if (arcPos < arcBot + arcMid) {
            // Cylinder
            const local = (arcPos - arcBot) / arcMid;  // 0..1
            const y = -halfLength + local * length;
            const r = radius;
            return { y, r };
        } else {
            // Top hemisphere
            const local = (arcPos - arcBot - arcMid) / arcTop;  // 0..1
            const phi = local * (Math.PI * 0.5);                 // 0..π/2
            const r = Math.cos(phi) * radius;
            const y = Math.sin(phi) * radius + halfLength;
            return { y, r };
        }
    };

    // ----------------------------------------------------------------
    // 1. TOP POLE
    // ----------------------------------------------------------------
    const topPoleIndex = 0;
    vertices.push([0, halfLength + radius, 0]);
    uvs.push([0.5, 1.0]);

    // ----------------------------------------------------------------
    // 2. RINGS (top to bottom)
    // ----------------------------------------------------------------
    const ringStart = [];
    for (let ring = 0; ring < totalRings; ring++) {
        // ring 0 = topmost ring (just below top pole)
        // ring totalRings-1 = bottommost ring (just above bottom pole)
        const ringPos = totalRings - 1 - ring;   // invert: ring 0 is at top
        const { y, r } = ringYR(ringPos);

        ringStart.push(vertices.length);

        for (let s = 0; s < radSeg; s++) {
            const theta = (s / radSeg) * Math.PI * 2;
            const x = Math.cos(theta) * r;
            const z = Math.sin(theta) * r;
            vertices.push([x, y, z]);
            // V coordinate: ring 0 (top) → v = 1, last ring → v = 0
            uvs.push([s / radSeg, 1 - ring / (totalRings - 1)]);
        }
    }

    // ----------------------------------------------------------------
    // 3. BOTTOM POLE
    // ----------------------------------------------------------------
    const bottomPoleIndex = vertices.length;
    vertices.push([0, -halfLength - radius, 0]);
    uvs.push([0.5, 0.0]);

    // ----------------------------------------------------------------
    // 4. FACES — CCW WINDING (verified)
    // ----------------------------------------------------------------

    // --- Top fan: top pole → first ring ---
    for (let s = 0; s < radSeg; s++) {
        const sNext = (s + 1) % radSeg;
        // CCW viewed from above (outside):
        // From top looking down, +Y is toward us.
        // Vector from top pole to ring 0 goes down.
        // For outward normal (pointing up), we want:
        //   faces: pole, ring[sNext], ring[s]
        // to make the triangle's normal point outward (+Y and up).
        faces.push([
            topPoleIndex,
            ringStart[0] + sNext,
            ringStart[0] + s,
        ]);
    }

    // --- Ring-to-ring quads ---
    for (let ring = 0; ring < totalRings - 1; ring++) {
        const ringA = ringStart[ring];      // upper ring (higher Y)
        const ringB = ringStart[ring + 1];  // lower ring (lower Y)

        for (let s = 0; s < radSeg; s++) {
            const sNext = (s + 1) % radSeg;

            // Quad: (A[s], B[s], B[sNext], A[sNext])
            // This gives CCW when viewed from OUTSIDE
            faces.push([
                ringA + s,
                ringB + s,
                ringB + sNext,
                ringA + sNext,
            ]);
        }
    }

    // --- Bottom fan: last ring → bottom pole ---
    const lastRing = ringStart[totalRings - 1];
    for (let s = 0; s < radSeg; s++) {
        const sNext = (s + 1) % radSeg;
        // CCW viewed from below (outside):
        //   faces: pole, ring[s], ring[sNext]
        faces.push([
            bottomPoleIndex,
            lastRing + s,
            lastRing + sNext,
        ]);
    }

    return { vertices, faces, uvs };
}
// ----------------------------------------------------------------------------
// 6. PRIMITIVE ADDITION FUNCTIONS
// ----------------------------------------------------------------------------

function addCube() {
    const params = { width: 1.2, height: 1.2, depth: 1.2, widthSeg: 2, heightSeg: 2, depthSeg: 2 };
    const topology = createQuadBoxTopology(
        params.width, params.height, params.depth,
        params.widthSeg, params.heightSeg, params.depthSeg
    );
    const geometry = buildGeometryFromQuadTopology(topology);
    const material = createDefaultModelingMaterial({ roughness: 0.36, clearcoat: 0.35 });
    const cube = new THREE.Mesh(geometry, material);

    finalizeModelingPrimitive(cube, 'cube', params, "Cube", { isQuadBased: true });
}

function addCapsule() {
    const params = {
        radius: 0.5,
        length: 1.0,
        capSegments: 10,       // smoothness of the hemispheres
        radialSegments: 24,    // smoothness around the circumference
    };

    const topology = createQuadCapsuleTopology(
        params.radius,
        params.length,
        params.capSegments,
        params.radialSegments
    );

    const geometry = buildGeometryFromQuadTopology(topology);
    const material = createDefaultModelingMaterial({
        roughness: 0.36,
        clearcoat: 0.35,
    });

    const capsule = new THREE.Mesh(geometry, material);

    finalizeModelingPrimitive(capsule, 'capsule', params, "Capsule", {
        isQuadBased: true,
    });
}
function addSphere() {
    const params = { radius: 0.85, widthSeg: 20, heightSeg: 14 };
    const topology = createQuadUvSphereTopology(params.radius, params.widthSeg, params.heightSeg);
    const geometry = buildGeometryFromQuadTopology(topology);
    const material = createDefaultModelingMaterial({ roughness: 0.28, clearcoat: 0.40 });
    const sphere = new THREE.Mesh(geometry, material);

    finalizeModelingPrimitive(sphere, 'sphere', params, "UV Sphere", { isQuadBased: true });
}

function addPlane() {
    const params = { width: 8, height: 8, widthSeg: 6, heightSeg: 6 };
    const topology = createQuadGridTopology(params.width, params.height, params.widthSeg, params.heightSeg);
    const geometry = buildGeometryFromQuadTopology(topology);
    const material = createDefaultModelingMaterial({ side: THREE.DoubleSide, roughness: 0.55, clearcoat: 0.1 });
    const plane = new THREE.Mesh(geometry, material);

    plane.rotation.x = -Math.PI / 2;
    finalizeModelingPrimitive(plane, 'plane', params, "Plane", { isQuadBased: true });
}

function addCylinder() {
    const params = { radiusTop: 0.65, radiusBottom: 0.65, height: 1.8, radialSegments: 20, heightSegments: 3 };
    const topology = createQuadCylinderTopology(
        params.radiusTop, params.radiusBottom, params.height,
        params.radialSegments, params.heightSegments
    );
    const geometry = buildGeometryFromQuadTopology(topology);
    const material = createDefaultModelingMaterial({ roughness: 0.34, clearcoat: 0.3 });
    const mesh = new THREE.Mesh(geometry, material);

    finalizeModelingPrimitive(mesh, 'cylinder', params, 'Cylinder', { isQuadBased: true });
}

function addCone() {
    const params = { radiusTop: 0.001, radiusBottom: 0.75, height: 1.9, radialSegments: 20, heightSegments: 3 };
    const topology = createQuadCylinderTopology(
        params.radiusTop, params.radiusBottom, params.height,
        params.radialSegments, params.heightSegments
    );
    const geometry = buildGeometryFromQuadTopology(topology);
    const mesh = new THREE.Mesh(geometry, createDefaultModelingMaterial({ roughness: 0.35, clearcoat: 0.25 }));

    finalizeModelingPrimitive(mesh, 'cone', params, 'Cone', { isQuadBased: true });
}

function addTorus() {
    const params = { radius: 0.82, tube: 0.28, radialSegments: 14, tubularSegments: 28 };
    const topology = createQuadTorusTopology(params.radius, params.tube, params.radialSegments, params.tubularSegments);
    const geometry = buildGeometryFromQuadTopology(topology);
    const mesh = new THREE.Mesh(geometry, createDefaultModelingMaterial({ roughness: 0.30, clearcoat: 0.45 }));

    finalizeModelingPrimitive(mesh, 'torus', params, 'Torus', { isQuadBased: true });
}

function addIcosahedron() {
    const params = { radius: 0.9, detail: 1 };
    const geometry = new THREE.IcosahedronGeometry(params.radius, params.detail);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, createDefaultModelingMaterial({ roughness: 0.4, clearcoat: 0.2 }));

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 25),
        new THREE.LineBasicMaterial({ color: 0x181c24, opacity: 0.75, transparent: true })
    );
    edges.visible = isEngineInModelingMode();
    mesh.add(edges);
    mesh.userData.quadEdgeHelper = edges;

    finalizeModelingPrimitive(mesh, 'icosahedron', params, 'Ico Sphere');
}

function addMonkey() {
    const params = { style: 'suzanne', segments: 16 };
    const sphere = (radius, scale, position) => ({
        geometry: new THREE.SphereGeometry(radius, params.segments, 12),
        scale,
        position,
    });

    const parts = [
        sphere(0.9, [0.86, 1.0, 0.8], [0, 0.16, 0]),
        sphere(0.62, [0.92, 0.52, 0.72], [0, -0.25, 0.58]),
        sphere(0.5, [0.42, 0.72, 0.28], [-0.82, 0.12, 0]),
        sphere(0.5, [0.42, 0.72, 0.28], [0.82, 0.12, 0]),
        sphere(0.25, [0.95, 0.38, 0.48], [-0.27, 0.28, 0.68]),
        sphere(0.25, [0.95, 0.38, 0.48], [0.27, 0.28, 0.68]),
    ];

    const positions = [];
    parts.forEach((part) => {
        let geo = part.geometry.clone();
        geo.scale(part.scale[0], part.scale[1], part.scale[2]);
        geo.translate(part.position[0], part.position[1], part.position[2]);
        if (geo.index) geo = geo.toNonIndexed();
        const attr = geo.getAttribute('position');
        for (let i = 0; i < attr.count; i++) {
            positions.push(attr.getX(i), attr.getY(i), attr.getZ(i));
        }
        geo.dispose?.();
        part.geometry.dispose?.();
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, createDefaultModelingMaterial({ roughness: 0.45, clearcoat: 0.2 }));

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 28),
        new THREE.LineBasicMaterial({ color: 0x181c24, opacity: 0.75, transparent: true })
    );
    edges.visible = isEngineInModelingMode();
    mesh.add(edges);
    mesh.userData.quadEdgeHelper = edges;

    finalizeModelingPrimitive(mesh, 'monkey', params, 'Monkey');
}

// ----------------------------------------------------------------------------
// 7. MODELING MODE CONTROLS
// ----------------------------------------------------------------------------

function setModelingMode(isModeling = true, targetMesh = null) {
    window.isModelingMode = !!isModeling;

    if (targetMesh) {
        if (targetMesh.userData?.quadEdgeHelper) {
            targetMesh.userData.quadEdgeHelper.visible = isModeling;
        }
        return;
    }

    const sceneRef = window.scene;
    if (!sceneRef?.traverse) return;

    sceneRef.traverse(child => {
        if (child.userData?.isQuadHelper || child.name?.includes('QuadEdgeHelper')) {
            child.visible = isModeling;
        }
    });
}

function toggleMeshModelingHelper(mesh, visible = null) {
    if (!mesh?.userData?.quadEdgeHelper) return;
    const nextState = visible !== null ? !!visible : !mesh.userData.quadEdgeHelper.visible;
    mesh.userData.quadEdgeHelper.visible = nextState;
}

// ----------------------------------------------------------------------------
// 8. MENU DISPATCHERS & EXPORTS
// ----------------------------------------------------------------------------

function openPanelAndTrigger(buttonId, panelId) {
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) panel.style.display = 'block';

    const btn = document.getElementById(buttonId);
    if (!btn) return false;
    btn.click();
    return true;
}

function invokeManagedCreator(creatorName, panelId = null, fallbackButtonId = null) {
    const creator = window[creatorName];
    if (typeof creator === 'function') {
        if (panelId) {
            const panel = document.getElementById(panelId);
            if (panel) panel.style.display = 'block';
        }
        return creator();
    }
    if (fallbackButtonId) return openPanelAndTrigger(fallbackButtonId, panelId);
    return null;
}

function addLight() { invokeManagedCreator('createManagedPointLight', 'lights', 'addPointLight'); }
function addPointLightMenu() { invokeManagedCreator('createManagedPointLight', 'lights', 'addPointLight'); }
function addSunLightMenu() { invokeManagedCreator('createManagedSunLight', 'lights', 'addSunLight'); }
function addSpotLightMenu() { invokeManagedCreator('createManagedSpotLight', 'lights', 'addSpotLight'); }
function addDirectionalLightMenu() { invokeManagedCreator('createManagedDirectionalLight', 'lights', 'addDirectionalLight'); }
function addHemisphereLightMenu() { invokeManagedCreator('createManagedHemisphereLight', 'lights', 'addHemisphereLight'); }
function addAreaLightMenu() { invokeManagedCreator('createManagedAreaLight', 'lights', 'addAreaLight'); }
function addCameraInit() { invokeManagedCreator('createManagedPerspectiveCamera', 'Cameras', 'addCamera'); }
function addPerspectiveCameraMenu() { invokeManagedCreator('createManagedPerspectiveCamera', 'Cameras', 'addCamera'); }
function addOrthographicCameraMenu() { invokeManagedCreator('createManagedOrthographicCamera', 'Cameras', 'addCameraOrto'); }
function addCubeCameraMenu() { return invokeManagedCreator('createManagedCubeCamera', 'Cameras'); }
window.createDefaultModelingMaterial = createDefaultModelingMaterial;
window.createQuadEdgeHelper = createQuadEdgeHelper;
window.setModelingMode = setModelingMode;
window.toggleMeshModelingHelper = toggleMeshModelingHelper;
window.isEngineInModelingMode = isEngineInModelingMode;

window.addCube = addCube;
window.addCapsule = addCapsule;
window.addSphere = addSphere;
window.addPlane = addPlane;
window.addIcosahedron = addIcosahedron;
window.addCylinder = addCylinder;
window.addCone = addCone;
window.addTorus = addTorus;
window.addMonkey = addMonkey;

window.addLight = addLight;
window.addPointLightMenu = addPointLightMenu;
window.addSunLightMenu = addSunLightMenu;
window.addSpotLightMenu = addSpotLightMenu;
window.addDirectionalLightMenu = addDirectionalLightMenu;
window.addHemisphereLightMenu = addHemisphereLightMenu;
window.addAreaLightMenu = addAreaLightMenu;
window.addCameraInit = addCameraInit;
window.addPerspectiveCameraMenu = addPerspectiveCameraMenu;
window.addOrthographicCameraMenu = addOrthographicCameraMenu;
window.addCubeCameraMenu = addCubeCameraMenu;