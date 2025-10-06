// --- START OF FILE smengine-primitives.js (FULL CONTENT) ---

// Assuming global variables like THREE, scene, controls, raycaster, mouse,
// objectSpawnOffset, spawnSpacing, activeObject, isModelingMode, etc., are defined elsewhere.
// Also assuming helper maps (edgeFaceMap, vertexEdgeMap, etc.) and helper groups (vertexHelpers, etc.) are available.


// Enhanced placeAndOffset function with improved error handling and scaling
function placeAndOffset(object, customScale = 1.0) {
    // Check for external globals that manage placement layout
    if (typeof objectSpawnOffset === 'undefined' || typeof spawnSpacing === 'undefined') {
        // Fallback positioning
        object.position.copy(new THREE.Vector3(0, 0, 0));
        object.position.y = 0.5;
        return;
    }

    // Apply custom scaling
    if (customScale !== 1.0) {
        object.scale.setScalar(customScale);
    }

    object.position.copy(objectSpawnOffset);

    // Compute bounding box with better handling for different object types
    let bbox = new THREE.Box3().setFromObject(object);

    // Handle BufferGeometry objects (ensure bbox calculation is done after scaling)
    if (bbox.isEmpty() && object.geometry && object.geometry.isBufferGeometry) {
        bbox.setFromObject(object); 
    }

    // Adjust Y position based on object's size to sit on the ground
    if (!bbox.isEmpty()) {
        const size = bbox.getSize(new THREE.Vector3());
        // Use the bottom of the bounding box to ensure it sits exactly on Y=0
        object.position.y += Math.max(-bbox.min.y, size.y / 2); 
    } else {
        object.position.y += 0.5;
    }

    // Update the offset for the next object with better spacing calculation
    const objectWidth = bbox.isEmpty() ? 2.0 : bbox.getSize(new THREE.Vector3()).x;
    objectSpawnOffset.x += Math.max(spawnSpacing, objectWidth + 1.0);
}

// Enhanced Materials with better PBR properties
const Materials = {
    metal: new THREE.MeshStandardMaterial({ 
        color: 0xC0C0C0, 
        metalness: 0.95, 
        roughness: 0.05, 
        envMapIntensity: 1.5 
    }),
    plastic: new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        metalness: 0.0, 
        roughness: 0.3, 
        clearcoat: 0.8, 
        clearcoatRoughness: 0.05 
    }),
    glass: new THREE.MeshPhysicalMaterial({ 
        color: 0xFFFFFF, 
        transmission: 0.95, 
        roughness: 0.05, 
        ior: 1.52, 
        thickness: 0.8, 
        envMapIntensity: 2.5, 
        transparent: true,
        opacity: 0.9
    }),
    rubber: new THREE.MeshStandardMaterial({ 
        color: 0x333333, 
        metalness: 0.0, 
        roughness: 0.9, 
        // bumpScale: 0.1 
    }),
    ceramic: new THREE.MeshStandardMaterial({
        color: 0xF5F5F5,
        metalness: 0.0,
        roughness: 0.1,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1
    }),
    wood: new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        metalness: 0.0,
        roughness: 0.8
    })
};

// --- ENHANCED PRIMITIVE OBJECTS ---
function addCube() {
    const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2); 
    const material = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFFFFF, 
        roughness: 0.1, 
        metalness: 0.3, 
        clearcoat: 0.8,
        clearcoatRoughness: 0.05
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.position.set(0, 0, 0);
    placeAndOffset(cube, 1.0);
    addObjectToScene(cube, 'Enhanced Cube'); 
}

function addSphere() {
    const geometry = new THREE.SphereGeometry(0.8, 64, 64);
    const material = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFFFFF, 
        metalness: 0.1, 
        roughness: 0.05, 
        clearcoat: 1.0, 
        clearcoatRoughness: 0.02,
        envMapIntensity: 1.2
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.position.set(0, 0, 0);
    placeAndOffset(sphere, 1.0);
    addObjectToScene(sphere, 'Enhanced Sphere');
}

function addSculptingSphere() {
    const geometry = new THREE.SphereGeometry(1.0, 64, 64);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        wireframe: false,
        roughness: 0.7,
        metalness: 0.1
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.position.set(0, 0, 0);
    placeAndOffset(sphere, 1.0);
    addObjectToScene(sphere, 'Sculpting Sphere');
}

function addPlane() {
    const geometry = new THREE.PlaneGeometry(8, 8, 32, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.1
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    plane.receiveShadow = true;
    addObjectToScene(plane, 'Ground Plane');
}

function addCylinder() {
    const geometry = new THREE.CylinderGeometry(0.6, 0.6, 1.8, 64);
    const material = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFFFFF, 
        metalness: 0.8, 
        roughness: 0.15,
        clearcoat: 0.3
    });
    const cylinder = new THREE.Mesh(geometry, material);
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    cylinder.position.set(0, 0, 0);
    placeAndOffset(cylinder, 1.0);
    addObjectToScene(cylinder, 'Enhanced Cylinder');
}

function addPyramid() {
    const geometry = new THREE.ConeGeometry(1.0, 2.2, 4);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        flatShading: true, 
        metalness: 0.2, 
        roughness: 0.6
    });
    const pyramid = new THREE.Mesh(geometry, material);
    pyramid.castShadow = true;
    pyramid.receiveShadow = true;
    pyramid.position.set(0, 0, 0);
    placeAndOffset(pyramid, 1.0);
    pyramid.rotation.y = Math.PI / 4;
    addObjectToScene(pyramid, 'Enhanced Pyramid');
}

function addRectangularPrism() {
    const geometry = new THREE.BoxGeometry(1.0, 2.2, 1.6);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        side: THREE.DoubleSide,
        roughness: 0.4,
        metalness: 0.3
    });
    const rectangularPrism = new THREE.Mesh(geometry, material);
    rectangularPrism.castShadow = true;
    rectangularPrism.receiveShadow = true;
    rectangularPrism.position.set(0, 0, 0);
    placeAndOffset(rectangularPrism, 1.0);
    addObjectToScene(rectangularPrism, 'Rectangular Prism');
}

function addTorus() {
    const geometry = new THREE.TorusGeometry(0.7, 0.3, 32, 100);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.4
    });
    const torus = new THREE.Mesh(geometry, material);
    torus.castShadow = true;
    torus.receiveShadow = true;
    torus.position.set(0, 0, 0);
    placeAndOffset(torus, 1.0);
    addObjectToScene(torus, 'Enhanced Torus');
}

function addCone() {
    const geometry = new THREE.ConeGeometry(0.7, 1.8, 64);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        side: THREE.DoubleSide,
        roughness: 0.2,
        metalness: 0.5
    });
    const cone = new THREE.Mesh(geometry, material);
    cone.castShadow = true;
    cone.receiveShadow = true;
    cone.position.set(0, 0, 0);
    placeAndOffset(cone, 1.0);
    addObjectToScene(cone, 'Enhanced Cone');
}

function addRoundedBox() {
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5, 8, 8, 8);
    const material = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFFFFF, 
        metalness: 0.1, 
        roughness: 0.1, 
        clearcoat: 0.8, 
        clearcoatRoughness: 0.05
    });
    const box = new THREE.Mesh(geometry, material);
    box.castShadow = true;
    box.receiveShadow = true;
    box.position.set(0, 0, 0);
    placeAndOffset(box, 1.0);
    addObjectToScene(box, 'Rounded Box');
}

function addIcosahedron() {
    const geometry = new THREE.IcosahedronGeometry(0.9, 1);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.2,
        flatShading: false
    });
    const ico = new THREE.Mesh(geometry, material);
    ico.castShadow = true;
    ico.receiveShadow = true;
    ico.position.set(0, 0, 0);
    placeAndOffset(ico, 1.0);
    addObjectToScene(ico, 'Enhanced Icosahedron');
}

function addTorusKnot() {
    const geometry = new THREE.TorusKnotGeometry(0.8, 0.3, 128, 32, 2, 3);
    const material = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFFFFF, 
        metalness: 0.3, 
        roughness: 0.2, 
        clearcoat: 0.5,
        envMapIntensity: 1.2
    });
    const knot = new THREE.Mesh(geometry, material);
    knot.castShadow = true;
    knot.receiveShadow = true;
    knot.position.set(0, 0, 0);
    placeAndOffset(knot, 1.0);
    addObjectToScene(knot, 'Enhanced Torus Knot');
}

// --- ENHANCED METABALLS (FIXED to use MarchingCubes correctly) ---
function addMetaBall() {
    if (typeof THREE.MarchingCubes === 'undefined') {
        console.warn("MarchingCubes library required for MetaBalls. Ensure script is loaded.");
        return;
    }
    
    const material = new THREE.MeshPhongMaterial({ 
        color: 0xFFFFFF,
        shininess: 100,
        specular: 0x111111
    });

    const effect = new THREE.MarchingCubes(48, material, true, true);
    effect.isMarchingCubes = true; // <--- important

    // initial fill
    effect.reset();
    effect.addBall(0.5, 0.5, 0.5, 0.6);
    effect.update();

    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, 'Enhanced MetaBall');
}


function addMetaCapsule() {
    if (typeof THREE.MarchingCubes === 'undefined') return;
    
    const material = new THREE.MeshPhongMaterial({ 
        color: 0xFFFFFF,
        shininess: 80
    });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    
    effect.addBall(0.35, 0.5, 0.5, 0.45);
    effect.addBall(0.65, 0.5, 0.5, 0.45);
    effect.position.set(0, 0, 0);
    effect.scale.set(1.2, 1.2, 1.2); 
    effect.update();
    
    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, 'Enhanced MetaCapsule');
}

function addMetaPlane() {
    if (typeof THREE.MarchingCubes === 'undefined') return;
    
    const material = new THREE.MeshPhongMaterial({ 
        color: 0xFFFFFF,
        shininess: 60
    });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    
    for (let i = 0; i < 8; i++) {
        effect.addBall(i / 8, 0.5, 0.5, 0.25);
    }
    effect.position.set(0, 0, 0);
    effect.scale.set(1.2, 1.2, 1.2); 
    effect.update();
    
    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, 'Enhanced MetaPlane');
}

function addMetaEllipsoid() {
    if (typeof THREE.MarchingCubes === 'undefined') return;

    const material = new THREE.MeshPhongMaterial({ 
        color: 0xFFFFFF,
        shininess: 90
    });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    
    effect.addBall(0.5, 0.5, 0.5, 0.8); 
    
    effect.position.set(0, 0, 0);
    effect.scale.set(1.2, 0.8, 1.2); 
    effect.update();
    
    placeAndOffset(effect, 1.0); 
    addObjectToScene(effect, 'Enhanced MetaEllipsoid');
}

function addMetaCube() {
    if (typeof THREE.MarchingCubes === 'undefined') return;

    const material = new THREE.MeshPhongMaterial({ 
        color: 0xFFFFFF,
        shininess: 70
    });
    const effect = new THREE.MarchingCubes(48, material, true, true);
    
    effect.addBall(0.5, 0.5, 0.5, 0.6);
    effect.addBall(0.25, 0.25, 0.25, 0.35);
    effect.addBall(0.75, 0.75, 0.75, 0.35);
    effect.addBall(0.25, 0.75, 0.25, 0.25);
    effect.addBall(0.75, 0.25, 0.75, 0.25);
    effect.position.set(0, 0, 0);
    effect.scale.set(1.2, 1.2, 1.2); 
    effect.update();
    
    placeAndOffset(effect, 1.0);
    addObjectToScene(effect, 'Enhanced MetaCube');
}

// --- ENHANCED SURFACES ---

function addNurbsSurface() {
    if (typeof THREE.NURBSSurface === 'undefined' || typeof THREE.ParametricGeometry === 'undefined') {
         console.warn("NURBS/Parametric libraries required.");
         return;
    }
    const nurbsSurface = new THREE.NURBSSurface(
        3, 3,
        [0, 0, 0, 1, 1, 1],
        [0, 0, 0, 1, 1, 1],
        [
            [new THREE.Vector4(-2, -2, 0, 1), new THREE.Vector4(-2, 2, 1, 1)],
            [new THREE.Vector4(2, -2, 1, 1), new THREE.Vector4(2, 2, 0, 1)]
        ]
    );

    const geometry = new THREE.ParametricGeometry((u, v, target) => {
        const pt = nurbsSurface.getPoint(u, v);
        target.set(pt.x, pt.y, pt.z);
    }, 32, 32);
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFFFFF, 
        side: THREE.DoubleSide,
        roughness: 0.2,
        metalness: 0.1,
        clearcoat: 0.6
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(0, 0, 0);
    placeAndOffset(mesh, 0.8);
    addObjectToScene(mesh, 'Enhanced NURBS Surface');
}

function addPlaneSurface() {
    const geometry = new THREE.PlaneGeometry(4, 4, 20, 20);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        side: THREE.DoubleSide,
        roughness: 0.6,
        metalness: 0.1,
        wireframe: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 4;
    mesh.rotation.z = Math.PI / 6;
    mesh.position.set(0, 0, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    placeAndOffset(mesh, 1.0);
    addObjectToScene(mesh, 'Enhanced Plane Surface');
}

function addSphereSurface() {
    const geometry = new THREE.SphereGeometry(1.5, 64, 64);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        wireframe: false,
        roughness: 0.3,
        metalness: 0.2
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.position.set(0, 0, 0);
    placeAndOffset(sphere, 1.0);
    addObjectToScene(sphere, 'Enhanced Sphere Surface');
}

function addTorusSurface() {
    const geometry = new THREE.TorusGeometry(1.5, 0.5, 32, 100);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF,
        roughness: 0.2,
        metalness: 0.4
    });
    const torus = new THREE.Mesh(geometry, material);
    torus.castShadow = true;
    torus.receiveShadow = true;
    torus.position.set(0, 0, 0);
    placeAndOffset(torus, 1.0);
    addObjectToScene(torus, 'Enhanced Torus Surface');
}

// --- ENHANCED CURVES ---

function addBezierCurve() {
    const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(-2.5, 0, 0),
        new THREE.Vector3(-1.5, 3, 0),
        new THREE.Vector3(1.5, -3, 0),
        new THREE.Vector3(2.5, 0, 0)
    );

    const points = curve.getPoints(100);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeBoundingBox();
    
    const material = new THREE.LineBasicMaterial({ 
        color: 0xFFFFFF,
        linewidth: 3
    });
    const curveObject = new THREE.Line(geometry, material);
    curveObject.position.set(0, 0, 0);
    placeAndOffset(curveObject, 1.0);
    addObjectToScene(curveObject, 'Enhanced Bezier Curve');
}

function addNurbsCurve() {
    if (typeof THREE.NURBSCurve === 'undefined') return;
    const nurbsControlPoints = [
        new THREE.Vector4(-3, -1.5, 0, 1),
        new THREE.Vector4(-1, 3, 0, 1),
        new THREE.Vector4(1, -3, 0, 1),
        new THREE.Vector4(3, 1.5, 0, 1)
    ];
    const nurbsKnots = [0, 0, 0, 1, 2, 2, 2];
    const nurbsDegree = 2;

    const nurbsCurve = new THREE.NURBSCurve(nurbsDegree, nurbsKnots, nurbsControlPoints);

    const points = nurbsCurve.getPoints(150);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeBoundingBox();
    
    const material = new THREE.LineBasicMaterial({ 
        color: 0xFFFFFF,
        linewidth: 3
    });
    const curveObject = new THREE.Line(geometry, material);
    curveObject.position.set(0, 0, 0);
    placeAndOffset(curveObject, 1.0);
    addObjectToScene(curveObject, 'Enhanced NURBS Curve');
}

function addCircleCurve() {
    const curve = new THREE.EllipseCurve(0, 0, 2.5, 2.5, 0, 2 * Math.PI, false, 0);
    const points = curve.getPoints(128).map(p => new THREE.Vector3(p.x, p.y, 0));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeBoundingBox();
    
    const material = new THREE.LineBasicMaterial({ 
        color: 0xFFFFFF,
        linewidth: 4
    });
    const circle = new THREE.LineLoop(geometry, material);
    circle.position.set(0, 0, 0);
    placeAndOffset(circle, 1.0);
    addObjectToScene(circle, 'Enhanced Circle Curve');
}

function addPathCurve() {
    const curvePath = new THREE.CurvePath();
    curvePath.add(new THREE.LineCurve3(new THREE.Vector3(-3, 0, 0), new THREE.Vector3(0, 3, 0)));
    curvePath.add(new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 3, 0),
        new THREE.Vector3(3, 5, 0),
        new THREE.Vector3(5, 0, 0)
    ));
    curvePath.add(new THREE.LineCurve3(new THREE.Vector3(5, 0, 0), new THREE.Vector3(2, -2, 0)));

    const points = curvePath.getPoints(200);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeBoundingBox();
    
    const material = new THREE.LineBasicMaterial({ 
        color: 0xFFFFFF,
        linewidth: 3
    });
    const path = new THREE.Line(geometry, material);
    path.position.set(0, 0, 0);
    placeAndOffset(path, 1.0);
    addObjectToScene(path, 'Enhanced Path Curve');
}

// --- ADDITIONAL ENHANCED OBJECTS ---

function addDodecahedron() {
    const geometry = new THREE.DodecahedronGeometry(0.9, 0);
    const material = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.4,
        metalness: 0.3,
        flatShading: false
    });
    const dodecahedron = new THREE.Mesh(geometry, material);
    dodecahedron.castShadow = true;
    dodecahedron.receiveShadow = true;
    dodecahedron.position.set(0, 0, 0);
    placeAndOffset(dodecahedron, 1.0);
    addObjectToScene(dodecahedron, 'Dodecahedron');
}

function addOctahedron() {
    const geometry = new THREE.OctahedronGeometry(1.0, 0);
    const material = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.3,
        metalness: 0.4,
        flatShading: true
    });
    const octahedron = new THREE.Mesh(geometry, material);
    octahedron.castShadow = true;
    octahedron.receiveShadow = true;
    octahedron.position.set(0, 0, 0);
    placeAndOffset(octahedron, 1.0);
    addObjectToScene(octahedron, 'Octahedron');
}

function addTetrahedron() {
    const geometry = new THREE.TetrahedronGeometry(1.1, 0);
    const material = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.2,
        metalness: 0.6,
        flatShading: true
    });
    const tetrahedron = new THREE.Mesh(geometry, material);
    tetrahedron.castShadow = true;
    tetrahedron.receiveShadow = true;
    tetrahedron.position.set(0, 0, 0);
    placeAndOffset(tetrahedron, 1.0);
    addObjectToScene(tetrahedron, 'Tetrahedron');
}

// --- END OF FILE smengine-primitives.js ---

function addDodecahedron() {
    const geometry = new THREE.DodecahedronGeometry(0.9, 0);
    const material = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.4,
        metalness: 0.3,
        flatShading: false
    });
    const dodecahedron = new THREE.Mesh(geometry, material);
    dodecahedron.castShadow = true;
    dodecahedron.receiveShadow = true;
    dodecahedron.position.set(0, 0, 0);
    placeAndOffset(dodecahedron, 1.0);
    addObjectToScene(dodecahedron, 'Dodecahedron');
}

function addOctahedron() {
    const geometry = new THREE.OctahedronGeometry(1.0, 0);
    const material = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.3,
        metalness: 0.4,
        flatShading: true
    });
    const octahedron = new THREE.Mesh(geometry, material);
    octahedron.castShadow = true;
    octahedron.receiveShadow = true;
    octahedron.position.set(0, 0, 0);
    placeAndOffset(octahedron, 1.0);
    addObjectToScene(octahedron, 'Octahedron');
}

function addTetrahedron() {
    const geometry = new THREE.TetrahedronGeometry(1.1, 0);
    const material = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.2,
        metalness: 0.6,
        flatShading: true
    });
    const tetrahedron = new THREE.Mesh(geometry, material);
    tetrahedron.castShadow = true;
    tetrahedron.receiveShadow = true;
    tetrahedron.position.set(0, 0, 0);
    placeAndOffset(tetrahedron, 1.0);
    addObjectToScene(tetrahedron, 'Tetrahedron');
}


// Global scene variable assumed
// Example: let scene = new THREE.Scene();
/*function placeAndOffset(object) {
    if (typeof objectSpawnOffset === 'undefined' || typeof spawnSpacing === 'undefined') {
        console.warn("objectSpawnOffset or spawnSpacing not defined. Cannot apply auto-placement.");
        return;
    }

    // Set the object's position to the current offset
    object.position.copy(objectSpawnOffset);

    // Adjust Y position based on object's size to sit on the ground
    const box = new THREE.Box3().setFromObject(object);
    // Ensure bounding box is computed, especially for BufferGeometry-based objects (like curves)
    if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        object.position.y += size.y / 2; // Use += to allow initial Y set in individual functions
    } else {
        // Fallback for objects that might not have easily computed bounds (e.g., MarchingCubes before update, or thin lines)
        object.position.y += 0.5; // Default small offset if bounds are empty
    }

    // Update the offset for the next object
    objectSpawnOffset.x += spawnSpacing;
}

// Your provided Materials
const Materials = {
    metal: new THREE.MeshStandardMaterial({
        color: 0xBBBBBB,
        metalness: 0.9,
        roughness: 0.1,
        envMapIntensity: 1.2
    }),
    plastic: new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        metalness: 0.0,
        roughness: 0.4,
        clearcoat: 0.5,
        clearcoatRoughness: 0.1
    }),
    glass: new THREE.MeshPhysicalMaterial({
        color: 0xFFFFFF,
        transmission: 0.9,
        roughness: 0.1,
        ior: 1.5,
        thickness: 0.5,
        envMapIntensity: 2.0,
        transparent: true
    }),
    rubber: new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.0,
        roughness: 0.8,
        bumpScale: 0.05
    })
};

// --- Redeveloped Object Creation Functions ---

function addCube() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, // Pure white
        roughness: 0.8, // Slight roughness (Unreal style)
        metalness: 0.2, // Reflective
        clearcoatRoughness: 0.1,
    });

    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.position.set(0, 0, 0); // Initial position before offset
    placeAndOffset(cube);
    addObjectToScene(cube, 'Cube');
    // meshes.push(cube); // If `meshes` is separate from `objects` and specifically for visual meshes
}

function addSphere() {
    const geometry = new THREE.SphereGeometry(0.8, 64, 64);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xE67E22, // Reddish orange
        metalness: 0.1,
        roughness: 0.1,
        clearcoat: 1.0, // Very shiny like a billiard ball
        clearcoatRoughness: 0.05,
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.position.set(0, 0, 0); // Initial position before offset
    placeAndOffset(sphere);
    addObjectToScene(sphere, 'Sphere');
}

// Adding addSculptingSphere as it was in your objectCreationMap but not defined
function addSculptingSphere() {
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, wireframe: false });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.position.set(0, 0, 0);
    placeAndOffset(sphere);
    addObjectToScene(sphere, 'Sculpting Sphere');
}

function addPlane() {
    const geometry = new THREE.PlaneGeometry(10, 10);
    const material = new THREE.MeshStandardMaterial({ color: 0xBFD4D9, side: THREE.DoubleSide }); // Light blue-green
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2; // Orient horizontally
    plane.position.y = 0; // Explicitly place at ground level
    // placeAndOffset is generally not used for a large ground plane,
    // as it should stay at (0,0,0) or a fixed base.
    // If you intend for it to be offset, call placeAndOffset here.
    addObjectToScene(plane, 'Plane');
}

function addCylinder() {
    const geometry = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 64);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x3498DB, // Sky blue
        metalness: 0.8, // Very metallic
        roughness: 0.2,
    });
    const cylinder = new THREE.Mesh(geometry, material);
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    cylinder.position.set(0, 0, 0); // Initial position before offset
    placeAndOffset(cylinder);
    addObjectToScene(cylinder, 'Cylinder');
}

function addPyramid() {
    const geometry = new THREE.ConeGeometry(1, 2, 4); // radius, height, 4 segments
    const material = new THREE.MeshStandardMaterial({
        color: 0x27ae60, // Green
        flatShading: true, // Low-poly look
        metalness: 0.1,
        roughness: 0.8,
    });
    const pyramid = new THREE.Mesh(geometry, material);
    pyramid.castShadow = true;
    pyramid.receiveShadow = true;
    pyramid.position.set(0, 0, 0); // Initial position before offset
    placeAndOffset(pyramid);
    pyramid.rotation.y = Math.PI / 4; // Rotate for a better default view
    addObjectToScene(pyramid, 'Pyramid');
}

function addRectangularPrism() {
    const geometry = new THREE.BoxGeometry(1, 2, 3);
    const material = new THREE.MeshStandardMaterial({ color: 0x9B59B6, side: THREE.DoubleSide }); // Purple
    const rectangularPrism = new THREE.Mesh(geometry, material);
    rectangularPrism.castShadow = true;
    rectangularPrism.receiveShadow = true;
    rectangularPrism.position.set(0, 0, 0); // Initial position before offset
    placeAndOffset(rectangularPrism);
    addObjectToScene(rectangularPrism, 'Rectangular Prism');
    // meshes.push(rectangularPrism); // If `meshes` is separate
}

function addTorus() {
    const geometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100); // radius, tube, radial segments, tubular segments
    const material = new THREE.MeshStandardMaterial({ color: 0x8E44AD, side: THREE.DoubleSide });
    const torus = new THREE.Mesh(geometry, material);
    torus.castShadow = true;
    torus.receiveShadow = true;
    torus.position.set(0, 0, 0); // Initial position before offset
    placeAndOffset(torus);
    addObjectToScene(torus, 'Torus');
    // meshes.push(torus); // If `meshes` is separate
}

function addCone() {
    const geometry = new THREE.ConeGeometry(0.5, 1.5, 32); // radius, height, radial segments
    const material = new THREE.MeshStandardMaterial({ color: 0xE67E22, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(geometry, material);
    cone.castShadow = true;
    cone.receiveShadow = true;
    cone.position.set(0, 0, 0); // Initial position before offset
    placeAndOffset(cone);
    addObjectToScene(cone, 'Cone');
    // meshes.push(cone); // If `meshes` is separate
}

function addRoundedBox() {
    // Requires THREE.RoundedBoxGeometry from examples/jsm/geometries/RoundedBoxGeometry.js
    const geometry = new THREE.RoundedBoxGeometry(1.5, 1.5, 1.5, 6, 0.2); // width, height, depth, segments, radius
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xf1c40f, // Yellow
        metalness: 0.1,
        roughness: 0.2,
        clearcoat: 0.5,
        clearcoatRoughness: 0.1,
    });
    const box = new THREE.Mesh(geometry, material);
    box.castShadow = true;
    box.receiveShadow = true;
    box.position.set(0, 0, 0);
    placeAndOffset(box);
    addObjectToScene(box, 'RoundedBox');
}

function addIcosahedron() {
    const geometry = new THREE.IcosahedronGeometry(0.75, 0); // radius, detail
    const material = new THREE.MeshStandardMaterial({ color: 0x1ABC9C, side: THREE.DoubleSide });
    const ico = new THREE.Mesh(geometry, material);
    ico.castShadow = true;
    ico.receiveShadow = true;
    ico.position.set(0, 0, 0); // Initial position before offset
    placeAndOffset(ico);
    addObjectToScene(ico, 'Icosahedron');
    // meshes.push(ico); // If `meshes` is separate
}

function addTorusKnot() {
    const geometry = new THREE.TorusKnotGeometry(0.7, 0.25, 128, 16);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x9B59B6, // Purple
        metalness: 0.2,
        roughness: 0.25,
        clearcoat: 0.3
    });
    const knot = new THREE.Mesh(geometry, material);
    knot.castShadow = true;
    knot.receiveShadow = true;
    knot.position.set(0, 0, 0);
    placeAndOffset(knot);
    addObjectToScene(knot, 'TorusKnot');
}


// MarchingCubes needs to be imported: import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
// To make MarchingCubes visible and interactive, you MUST call `effect.update()` in your main animation loop.
// For selection, its internal mesh is generally what the raycaster hits.
// For `placeAndOffset`, MarchingCubes is an Object3D, but its internal geometry changes.
// The `box.getSize` might return 0 if `effect.update()` hasn't been called.
// It's often better to manually set their Y position or call update before placeAndOffset.

function addMetaBall() {
  const effect = new THREE.MarchingCubes(32, new THREE.MeshPhongMaterial({ color: 0x00ffcc }), true, true);
  effect.addBall(0.5, 0.5, 0.5, 0.5);
  // Initial position. You might want to update() it once here for placeAndOffset to get bounds.
  effect.position.set(0, 0, 0);
  // Call update once to generate initial geometry for placeAndOffset
  effect.update();
  placeAndOffset(effect);
  addObjectToScene(effect, 'MetaBall');
  // IMPORTANT: You need to call `effect.update()` in your main animation loop for dynamic metaballs!
  // Example: renderLoopFunctions.push(() => effect.update());
}

function addMetaCapsule() {
  const effect = new THREE.MarchingCubes(32, new THREE.MeshPhongMaterial({ color: 0xff0066 }), true, true);
  effect.addBall(0.4, 0.5, 0.5, 0.4);
  effect.addBall(0.6, 0.5, 0.5, 0.4);
  effect.position.set(0, 0, 0);
  effect.update(); // Call update once for placeAndOffset bounds
  placeAndOffset(effect);
  addObjectToScene(effect, 'MetaCapsule');
}

function addMetaEllipsoid() {
  const effect = new THREE.MarchingCubes(32, new THREE.MeshPhongMaterial({ color: 0xcc00ff }), true, true);
  effect.addBall(0.5, 0.5, 0.5, 0.7, 0.3, 0.5); // (x,y,z,strength, subtract, cutoff)
  effect.position.set(0, 0, 0);
  effect.update(); // Call update once for placeAndOffset bounds
  placeAndOffset(effect);
  addObjectToScene(effect, 'MetaEllipsoid');
}

function addMetaCube() {
  const effect = new THREE.MarchingCubes(32, new THREE.MeshPhongMaterial({ color: 0xffcc00 }), true, true);
  effect.addBall(0.5, 0.5, 0.5, 0.5);
  effect.addBall(0.2, 0.2, 0.2, 0.3);
  effect.addBall(0.8, 0.8, 0.8, 0.3);
  effect.position.set(0, 0, 0);
  effect.update(); // Call update once for placeAndOffset bounds
  placeAndOffset(effect);
  addObjectToScene(effect, 'MetaCube');
}

// `addMetaPlane` was renamed to `addMetaBlob` in previous response as it's not a plane,
// but keeping the user's original name here since it's in their code (even if not map).
// If it's intended to be in the map, add it.
function addMetaPlane() {
    const effect = new THREE.MarchingCubes(32, new THREE.MeshPhongMaterial({ color: 0x66ccff }), true, true);
    for (let i = 0; i < 6; i++) {
      effect.addBall(i / 6, 0.5, 0.5, 0.2);
    }
    effect.position.set(0, 0, 0);
    effect.update(); // Call update once for placeAndOffset bounds
    placeAndOffset(effect);
    addObjectToScene(effect, 'MetaPlane');
}


// Requires NURBSSurface and ParametricGeometry from examples/jsm
function addNurbsSurface() {
  const nurbsSurface = new THREE.NURBSSurface(
    3, 3, // degree1, degree2
    [0, 0, 0, 1, 1, 1], // knots1
    [0, 0, 0, 1, 1, 1], // knots2
    [
      [new THREE.Vector4(-1.5, -1.5, 0, 1), new THREE.Vector4(-1.5, 1.5, 0, 1)],
      [new THREE.Vector4(1.5, -1.5, 0, 1), new THREE.Vector4(1.5, 1.5, 0, 1)]
    ]
  );

  const geometry = new THREE.ParametricGeometry((u, v, target) => {
    const pt = nurbsSurface.getPoint(u, v);
    target.set(pt.x, pt.y, pt.z);
  }, 20, 20);

  const material = new THREE.MeshPhongMaterial({ color: 0x3399ff, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  geometry.computeBoundingBox(); // Ensure bounds are computed for placeAndOffset
  placeAndOffset(mesh);
  addObjectToScene(mesh, 'NURBSSurface');
}

function addPlaneSurface() {
  const geometry = new THREE.PlaneGeometry(5, 5, 10, 10);
  const material = new THREE.MeshStandardMaterial({ color: 0x00ccff, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0; // Explicitly set Y
  // placeAndOffset is generally not used for a ground plane.
  addObjectToScene(mesh, 'PlaneSurface');
}

function addSphereSurface() {
  const geometry = new THREE.SphereGeometry(2, 32, 32);
  const material = new THREE.MeshStandardMaterial({ color: 0xff3333, wireframe: false });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(0, 0, 0);
  placeAndOffset(sphere);
  addObjectToScene(sphere, 'SphereSurface');
}

function addTorusSurface() {
  const geometry = new THREE.TorusGeometry(2, 0.6, 32, 64);
  const material = new THREE.MeshStandardMaterial({ color: 0x33ff66 });
  const torus = new THREE.Mesh(geometry, material);
  torus.position.set(0, 0, 0);
  placeAndOffset(torus);
  addObjectToScene(torus, 'TorusSurface');
}


// Requires NURBSCurve from examples/jsm
// Curves are THREE.Line objects. For selection, raycasting needs to be precise.
// `geometry.computeBoundingBox()` is called to help `placeAndOffset`.
// Raycaster intersection for lines: For better pick accuracy, you might
// consider adding a thin invisible mesh along the curve or implementing
// a custom intersection test if the default raycaster proves unreliable for lines.
// However, `raycaster.intersectObjects` *should* work with `THREE.Line` objects.

function addBezierCurve() {
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(-2, 0, 0),
    new THREE.Vector3(-1, 2, 0),
    new THREE.Vector3(1, -2, 0),
    new THREE.Vector3(2, 0, 0)
  );

  const points = curve.getPoints(50);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeBoundingBox(); // Important for placeAndOffset to work correctly
  const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
  const curveObject = new THREE.Line(geometry, material);
  curveObject.position.set(0, 0, 0);
  placeAndOffset(curveObject); // Applies offset based on computed bounding box
  addObjectToScene(curveObject, 'BezierCurve');
}

function addNurbsCurve() {
  const nurbsControlPoints = [
    new THREE.Vector4(-2, -1, 0, 1),
    new THREE.Vector4(-1, 2, 0, 1),
    new THREE.Vector4(1, -2, 0, 1),
    new THREE.Vector4(2, 1, 0, 1)
  ];
  const nurbsKnots = [0, 0, 0, 1, 2, 2, 2];
  const nurbsDegree = 2;

  const nurbsCurve = new THREE.NURBSCurve(nurbsDegree, nurbsKnots, nurbsControlPoints);

  const points = nurbsCurve.getPoints(100);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeBoundingBox(); // Important for placeAndOffset
  const material = new THREE.LineBasicMaterial({ color: 0x0000ff });
  const curveObject = new THREE.Line(geometry, material);
  curveObject.position.set(0, 0, 0);
  placeAndOffset(curveObject);
  addObjectToScene(curveObject, 'NURBSCurve');
}

function addCircleCurve() {
  const curve = new THREE.EllipseCurve(0, 0, 2, 2, 0, 2 * Math.PI, false, 0);
  const points = curve.getPoints(64).map(p => new THREE.Vector3(p.x, p.y, 0));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeBoundingBox(); // Important for placeAndOffset
  const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
  const circle = new THREE.LineLoop(geometry, material);
  circle.position.set(0, 0, 0);
  placeAndOffset(circle);
  addObjectToScene(circle, 'CircleCurve');
}

function addPathCurve() {
  const curvePath = new THREE.CurvePath();
  curvePath.add(new THREE.LineCurve3(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(0, 2, 0)));
  curvePath.add(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 2, 0),
    new THREE.Vector3(2, 4, 0),
    new THREE.Vector3(4, 0, 0)
  ));

  const points = curvePath.getPoints(100);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeBoundingBox(); // Important for placeAndOffset
  const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
  const path = new THREE.Line(geometry, material);
  path.position.set(0, 0, 0);
  placeAndOffset(path);
  addObjectToScene(path, 'PathCurve');
}
*/
