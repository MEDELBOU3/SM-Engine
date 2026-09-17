// --- START OF FILE smengine-primitives.js ---

// ============================================================================
// 1. UTILITY & HELPER FUNCTIONS
// ============================================================================

/**
 * Prepares geometry for sculpting by:
 * 1. Welding vertices (fixing open edges/tearing)
 * 2. Computing smooth normals
 * 3. Ensuring bounding box data exists
 */
function applyQuadEdgeOverlay(material, options = {}) {

    const edgeColor = options.color ?? new THREE.Color(0x000000);
    const edgeWidth = options.width ?? 0.02;

    material.onBeforeCompile = (shader) => {

        // ensure UV exists
        shader.vertexShader = shader.vertexShader.replace(
            '#include <uv_vertex>',
            `
            #include <uv_vertex>
            vUv = uv;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            float ex = min(vUv.x, 1.0 - vUv.x);
            float ey = min(vUv.y, 1.0 - vUv.y);
            float edge = min(ex, ey);

            if (edge < ${edgeWidth.toFixed(4)}) {
                gl_FragColor.rgb = vec3(
                    ${edgeColor.r.toFixed(3)},
                    ${edgeColor.g.toFixed(3)},
                    ${edgeColor.b.toFixed(3)}
                );
            }

            #include <dithering_fragment>
            `
        );
    };

    material.needsUpdate = true;
}

function prepareGeometryForSculpting(geometry) {
    // 1. Delete original normals (they might be split/sharp, causing seams)
    if (geometry.attributes.normal) {
        geometry.deleteAttribute('normal');
    }

    // 2. Weld vertices (Crucial for Cubes/Prisms/Cylinders to prevent holes)
    let finalGeometry = geometry;

    // Check for BufferGeometryUtils (Standard Three.js utility)
    if (typeof THREE.BufferGeometryUtils !== 'undefined' && THREE.BufferGeometryUtils.mergeVertices) {
        finalGeometry = THREE.BufferGeometryUtils.mergeVertices(geometry);
    } else if (typeof BufferGeometryUtils !== 'undefined' && BufferGeometryUtils.mergeVertices) {
        // Fallback for non-module global
        finalGeometry = BufferGeometryUtils.mergeVertices(geometry);
    } else {
        console.warn("⚠️ BufferGeometryUtils missing. Object edges might tear when sculpting.");
    }

    // 3. Recompute smooth normals for organic look
    finalGeometry.computeVertexNormals();
    finalGeometry.computeBoundingBox();

    return finalGeometry;
}

/**
 * Handles placing the object in the scene with offsets
 * Automatically places objects next to each other and sits them on the ground (Y=0)
 */
function placeAndOffset(object, customScale = 1.0) {
    // Check for external globals that manage placement layout
    if (typeof objectSpawnOffset === "undefined" || typeof spawnSpacing === "undefined") {
        // Fallback positioning if globals don't exist
        object.position.set(0, 0.5, 0);
        return;
    }

    // Apply custom scaling
    if (customScale !== 1.0) {
        object.scale.setScalar(customScale);
    }

    // Apply Position
    object.position.copy(objectSpawnOffset);

    // Compute bounding box with better handling for different object types
    let bbox = new THREE.Box3().setFromObject(object);

    // Handle BufferGeometry objects (ensure bbox calculation is done after scaling)
    if (bbox.isEmpty() && object.geometry) {
        object.geometry.computeBoundingBox();
        if (object.geometry.boundingBox) {
            bbox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
        }
    }

    // Adjust Y position based on object's size to sit on the ground
    if (!bbox.isEmpty()) {
        const size = bbox.getSize(new THREE.Vector3());
        // Use the bottom of the bounding box to ensure it sits exactly on Y=0
        object.position.y += Math.max(0, size.y / 2);
        // Note: For centered geometries, size.y/2 usually works. 
        // If pivot is at bottom, this might need adjustment.
        // A more robust check: object.position.y -= bbox.min.y;
    } else {
        object.position.y += 0.5;
    }

    // Update the offset for the next object
    const objectWidth = bbox.isEmpty() ? 2.0 : bbox.getSize(new THREE.Vector3()).x;
    objectSpawnOffset.x += Math.max(spawnSpacing, objectWidth + 1.0);
}

// ============================================================================
// 2. MATERIALS LIBRARY
// ============================================================================

const Materials = {
    metal: new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        metalness: 0.95,
        roughness: 0.05,
        envMapIntensity: 1.5,
    }),
    plastic: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.3,
        clearcoat: 0.8,
        clearcoatRoughness: 0.05,
    }),
    glass: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 0.95,
        roughness: 0.05,
        ior: 1.52,
        thickness: 0.8,
        envMapIntensity: 2.5,
        transparent: true,
        opacity: 0.9,
    }),
    rubber: new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.0,
        roughness: 0.9,
    }),
    ceramic: new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        metalness: 0.0,
        roughness: 0.1,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
    }),
    wood: new THREE.MeshStandardMaterial({
        color: 0x8b4513,
        metalness: 0.0,
        roughness: 0.8,
    }),
};

// ============================================================================
// 3. ENHANCED PRIMITIVE OBJECTS (SCULPT READY)
// ============================================================================
// =============================================================
// 3. ENHANCED PRIMITIVE OBJECTS (MODELING READY + SCULPT DATA)
// =============================================

function addCube() {
    const params = { width: 1.2, height: 1.2, depth: 1.2, segments: 1 };
    
    // Low resolution for modeling
    const baseGeo = new THREE.BoxGeometry(params.width, params.height, params.depth, 1, 1, 1);
    const geometry = prepareGeometryForSculpting(baseGeo);

    geometry.userData.isQuadBased = true;
    
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xdedede, roughness: 0.35, metalness: 0.1, clearcoat: 0.5
    });

    const cube = new THREE.Mesh(geometry, material);
    
    // تذكر البيانات للتحويل المستقبلي
    cube.userData.primitiveType = 'cube';
    cube.userData.params = params;
    
    cube.castShadow = true;
    cube.receiveShadow = true;

    placeAndOffset(cube, 1.0);
    addObjectToScene(cube, "Cube");
}

function addSphere() {
    const params = { radius: 0.8, widthSeg: 16, heightSeg: 12 };
    
    const geometry = new THREE.SphereGeometry(params.radius, params.widthSeg, params.heightSeg);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.1, roughness: 0.05, clearcoat: 1.0
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    
    sphere.userData.primitiveType = 'sphere';
    sphere.userData.params = params;

    sphere.castShadow = true;
    sphere.receiveShadow = true;
    placeAndOffset(sphere, 1.0);
    addObjectToScene(sphere, "Sphere");
}

function addCylinder() {
    const params = { radiusTop: 0.6, radiusBottom: 0.6, height: 1.8, radialSeg: 12, heightSeg: 1 };
    
    const baseGeo = new THREE.CylinderGeometry(params.radiusTop, params.radiusBottom, params.height, params.radialSeg, params.heightSeg);
    const geometry = prepareGeometryForSculpting(baseGeo);

    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.8, roughness: 0.15
    });

    applyQuadEdgeOverlay(material);

    const cylinder = new THREE.Mesh(geometry, material);
    
    cylinder.userData.primitiveType = 'cylinder';
    cylinder.userData.params = params;

    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    placeAndOffset(cylinder, 1.0);
    addObjectToScene(cylinder, "Cylinder");
}

function addPlane() {
    const params = { width: 8, height: 8, widthSeg: 2, heightSeg: 2 };
    
    const geometry = new THREE.PlaneGeometry(params.width, params.height, params.widthSeg, params.heightSeg);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8
    });

    applyQuadEdgeOverlay(material);

    const plane = new THREE.Mesh(geometry, material);
    
    plane.userData.primitiveType = 'plane';
    plane.userData.params = params;

    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    addObjectToScene(plane, "Plane");
}

function addPyramid() {
    const params = { radius: 1.0, height: 2.2, radialSeg: 4, heightSeg: 1 };
    
    const baseGeo = new THREE.ConeGeometry(params.radius, params.height, params.radialSeg, params.heightSeg);
    const geometry = prepareGeometryForSculpting(baseGeo);

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 0.2, roughness: 0.6
    });

    applyQuadEdgeOverlay(material);

    const pyramid = new THREE.Mesh(geometry, material);
    
    pyramid.userData.primitiveType = 'cone'; // الهرم هو مخروط بـ 4 أوجه
    pyramid.userData.params = params;

    pyramid.castShadow = true;
    pyramid.rotation.y = Math.PI / 4;
    placeAndOffset(pyramid, 1.0);
    addObjectToScene(pyramid, "Pyramid");
}

function addCone() {
    const params = { radius: 0.7, height: 1.8, radialSeg: 16, heightSeg: 1 };
    
    const baseGeo = new THREE.ConeGeometry(params.radius, params.height, params.radialSeg, params.heightSeg);
    const coneGeometry = prepareGeometryForSculpting(baseGeo);

    const coneMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, side: THREE.DoubleSide, roughness: 0.2
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    
    cone.userData.primitiveType = 'cone';
    cone.userData.params = params;

    cone.castShadow = true;
    placeAndOffset(cone, 1.0);
    addObjectToScene(cone, "Cone");
}

function addTorus() {
    const params = { radius: 0.7, tube: 0.3, radialSeg: 12, tubularSeg: 24 };
    
    const geometry = new THREE.TorusGeometry(params.radius, params.tube, params.radialSeg, params.tubularSeg);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.3, metalness: 0.4
    });
    const torus = new THREE.Mesh(geometry, material);
    
    torus.userData.primitiveType = 'torus';
    torus.userData.params = params;

    torus.castShadow = true;
    placeAndOffset(torus, 1.0);
    addObjectToScene(torus, "Torus");
}

function addRectangularPrism() {
    const params = { width: 1.0, height: 2.2, depth: 1.6 };
    const baseGeo = new THREE.BoxGeometry(params.width, params.height, params.depth, 1, 1, 1);
    const geometry = prepareGeometryForSculpting(baseGeo);

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.4, metalness: 0.3
    });
    const prism = new THREE.Mesh(geometry, material);
    
    prism.userData.primitiveType = 'cube';
    prism.userData.params = params;

    prism.castShadow = true;
    placeAndOffset(prism, 1.0);
    applyQuadEdgeOverlay(material);
    addObjectToScene(prism, "Rectangular Prism");
}

// =============================================================
// 4. POLYHEDRONS (LOW-POLY BASE)
// =============================================================

function addIcosahedron() {
    const params = { radius: 0.9, detail: 0 }; // Detail 0 is best for low poly
    const geometry = new THREE.IcosahedronGeometry(params.radius, params.detail);

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.3, metalness: 0.2
    });

    applyQuadEdgeOverlay(material, { width: 0.015 });

    const ico = new THREE.Mesh(geometry, material);
    
    ico.userData.primitiveType = 'icosahedron';
    ico.userData.params = params;

    ico.castShadow = true;
    placeAndOffset(ico, 1.0);
    addObjectToScene(ico, "Icosahedron");
}

function addDodecahedron() {
    const params = { radius: 0.9, detail: 0 };
    const geometry = new THREE.DodecahedronGeometry(params.radius, params.detail);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    
    const dodeca = new THREE.Mesh(geometry, material);
    
    dodeca.userData.primitiveType = 'dodecahedron';
    dodeca.userData.params = params;

    dodeca.castShadow = true;
    placeAndOffset(dodeca, 1.0);
    addObjectToScene(dodeca, "Dodecahedron");
}

function addTorusKnot() {
    const params = { radius: 0.8, tube: 0.3, tubularSeg: 64, radialSeg: 8, p: 2, q: 3 };
    const knotGeometry = new THREE.TorusKnotGeometry(params.radius, params.tube, params.tubularSeg, params.radialSeg, params.p, params.q);
    const knotMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, clearcoat: 0.5 });
    
    const knot = new THREE.Mesh(knotGeometry, knotMaterial);
    
    knot.userData.primitiveType = 'torusKnot';
    knot.userData.params = params;

    knot.castShadow = true;
    placeAndOffset(knot, 1.0);
    addObjectToScene(knot, "Torus Knot");
}
// ============================================================================
// 5. METABALLS (Requires MarchingCubes)
// ============================================================================

function addMetaBall() {
    if (typeof THREE.MarchingCubes === "undefined") {
        console.warn("MarchingCubes library required for MetaBalls.");
        return;
    }
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 100, specular: 0x111111 });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    effect.isMarchingCubes = true;
    effect.reset();
    effect.addBall(0.5, 0.5, 0.5, 0.6);
    effect.update();
    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, "Enhanced MetaBall");
}

function addMetaCapsule() {
    if (typeof THREE.MarchingCubes === "undefined") return;
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    effect.addBall(0.35, 0.5, 0.5, 0.45);
    effect.addBall(0.65, 0.5, 0.5, 0.45);
    effect.scale.set(1.2, 1.2, 1.2);
    effect.update();
    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, "Enhanced MetaCapsule");
}

function addMetaPlane() {
    if (typeof THREE.MarchingCubes === "undefined") return;
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    for (let i = 0; i < 8; i++) effect.addBall(i / 8, 0.5, 0.5, 0.25);
    effect.scale.set(1.2, 1.2, 1.2);
    effect.update();
    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, "Enhanced MetaPlane");
}

function addMetaEllipsoid() {
    if (typeof THREE.MarchingCubes === "undefined") return;
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90 });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    effect.addBall(0.5, 0.5, 0.5, 0.8);
    effect.scale.set(1.2, 0.8, 1.2);
    effect.update();
    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, "Enhanced MetaEllipsoid");
}

function addMetaCube() {
    if (typeof THREE.MarchingCubes === "undefined") return;
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 70 });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    effect.addBall(0.5, 0.5, 0.5, 0.6);
    effect.addBall(0.25, 0.25, 0.25, 0.35);
    effect.addBall(0.75, 0.75, 0.75, 0.35);
    effect.addBall(0.25, 0.75, 0.25, 0.25);
    effect.addBall(0.75, 0.25, 0.75, 0.25);
    effect.scale.set(1.2, 1.2, 1.2);
    effect.update();
    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, "Enhanced MetaCube");
}

// ============================================================================
// 6. CURVES AND SURFACES
// ============================================================================

function addNurbsSurface() {
    if (typeof THREE.NURBSSurface === "undefined" || typeof THREE.ParametricGeometry === "undefined") {
        console.warn("NURBS/Parametric libraries required.");
        return;
    }
    const nurbsSurface = new THREE.NURBSSurface(3, 3, [0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1], [
        [new THREE.Vector4(-2, -2, 0, 1), new THREE.Vector4(-2, 2, 1, 1)],
        [new THREE.Vector4(2, -2, 1, 1), new THREE.Vector4(2, 2, 0, 1)],
    ]);

    const geometry = new THREE.ParametricGeometry((u, v, target) => {
        const pt = nurbsSurface.getPoint(u, v);
        target.set(pt.x, pt.y, pt.z);
    }, 32, 32);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, side: THREE.DoubleSide, roughness: 0.2, metalness: 0.1, clearcoat: 0.6
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    placeAndOffset(mesh, 0.8);
    addObjectToScene(mesh, "Enhanced NURBS Surface");
}

function addPlaneSurface() {
    // 8x8 segments for comfortable modeling
    const planeGeometry = new THREE.PlaneGeometry(4, 4, 8, 8);
    const planeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.1, wireframe: false
    });
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    planeMesh.rotation.x = -Math.PI / 4;
    planeMesh.rotation.z = Math.PI / 6;
    planeMesh.castShadow = true;
    planeMesh.receiveShadow = true;
    placeAndOffset(planeMesh, 1.0);
    addObjectToScene(planeMesh, "Plane Surface");
}

function addSphereSurface() {
    // 32 segments for comfortable modeling
    const sphereGeometry = new THREE.SphereGeometry(1.5, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, wireframe: false, roughness: 0.3, metalness: 0.2
    });
    const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphereMesh.castShadow = true;
    sphereMesh.receiveShadow = true;
    placeAndOffset(sphereMesh, 1.0);
    addObjectToScene(sphereMesh, "Sphere Surface");
}

function addTorusSurface() {
    // 16 tube, 32 radial segments for comfortable modeling
    const torusGeometry = new THREE.TorusGeometry(1.5, 0.5, 16, 32);
    const torusMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.2, metalness: 0.4
    });
    const torusMesh = new THREE.Mesh(torusGeometry, torusMaterial);
    torusMesh.castShadow = true;
    torusMesh.receiveShadow = true;
    placeAndOffset(torusMesh, 1.0);
    addObjectToScene(torusMesh, "Torus Surface");
}

function addBezierCurve() {
    const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(-2.5, 0, 0), new THREE.Vector3(-1.5, 3, 0),
        new THREE.Vector3(1.5, -3, 0), new THREE.Vector3(2.5, 0, 0)
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(100));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
    const curveObject = new THREE.Line(geometry, material);
    placeAndOffset(curveObject, 1.0);
    addObjectToScene(curveObject, "Enhanced Bezier Curve");
}

function addNurbsCurve() {
    if (typeof THREE.NURBSCurve === "undefined") return;
    const nurbsControlPoints = [
        new THREE.Vector4(-3, -1.5, 0, 1), new THREE.Vector4(-1, 3, 0, 1),
        new THREE.Vector4(1, -3, 0, 1), new THREE.Vector4(3, 1.5, 0, 1),
    ];
    const nurbsKnots = [0, 0, 0, 1, 2, 2, 2];
    const nurbsCurve = new THREE.NURBSCurve(2, nurbsKnots, nurbsControlPoints);
    const geometry = new THREE.BufferGeometry().setFromPoints(nurbsCurve.getPoints(150));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
    const curveObject = new THREE.Line(geometry, material);
    placeAndOffset(curveObject, 1.0);
    addObjectToScene(curveObject, "Enhanced NURBS Curve");
}

function addCircleCurve() {
    const curve = new THREE.EllipseCurve(0, 0, 2.5, 2.5, 0, 2 * Math.PI, false, 0);
    const points = curve.getPoints(128).map(p => new THREE.Vector3(p.x, p.y, 0));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 4 });
    const circle = new THREE.LineLoop(geometry, material);
    placeAndOffset(circle, 1.0);
    addObjectToScene(circle, "Enhanced Circle Curve");
}

function addPathCurve() {
    const curvePath = new THREE.CurvePath();
    curvePath.add(new THREE.LineCurve3(new THREE.Vector3(-3, 0, 0), new THREE.Vector3(0, 3, 0)));
    curvePath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 3, 0), new THREE.Vector3(3, 5, 0), new THREE.Vector3(5, 0, 0)));
    curvePath.add(new THREE.LineCurve3(new THREE.Vector3(5, 0, 0), new THREE.Vector3(2, -2, 0)));

    const geometry = new THREE.BufferGeometry().setFromPoints(curvePath.getPoints(200));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
    const path = new THREE.Line(geometry, material);
    placeAndOffset(path, 1.0);
    addObjectToScene(path, "Enhanced Path Curve");
}

function addLight() {
    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(0, 2, 0);
    addObjectToScene(light, 'Light');
}

function addCameraInit() {
    const newCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    newCamera.position.set(0, 0, 5);
    addObjectToScene(newCamera, 'Camera');
}
// --- END OF FILE smengine-primitives.js ---