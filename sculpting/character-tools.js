// Character Sculpting Constants and State
let needsHairMeshRebuild = false;
function flagHairMeshRebuild() {
    needsHairMeshRebuild = true;
}

const CHARACTER_TOOLS = {
    FACE_SHAPE: 'faceShape',
    NOSE_SCULPT: 'noseSculpt',
    CHEEK_DEFINITION: 'cheekDefinition',
    JAW_SCULPT: 'jawSculpt',
    FOREHEAD_SHAPE: 'foreheadShape',
    CHIN_SCULPT: 'chinSculpt',
    TEMPLE_SCULPT: 'templeSculpt',
    BROW_RIDGE: 'browRidge',
    EYE_SOCKET: 'eyeSocket',
    LIP_SHAPE: 'lipShape',
    SMOOTH: 'smooth',
    PINCH: 'pinch',
    INFLATE: 'inflate',
    CREASE: 'crease',
    SNAKE_HOOK: 'snakeHook',
    HAIR_BRUSH: 'hairBrush'
};

// Hair system state
//let physicsEnabled = false;
let physicsAnimationId = null;
let hairBrushActive = false;
let maxHairStrandsPerOperation = 10; // Limit strands added per brush stroke
let sculptingTarget = null;

const hairBrushSettings = {
    numSegments: 5,
    segmentLength: 0.05,
    stiffness: 0.5,
    gravity: 0.3, // Reduced from 0.9
    windStrength: 0.3, // Reduced from 0.6
    turbulence: 0.1, // Reduced from 0.2
    springStiffness: 0.8,
    damping: 0.7, // Increased from 0.3
    airResistance: 0.1, // Increased from 0.02
    thickness: 0.003, // Reduced from 0.005
    density: 50, // Reduced from 100
    maxStrands: 2000, // Reduced from 5000
    curl: 0.2,
    randomness: 0.1,
    clumpSize: 3,
    frizz: 0.1,
    wave: 0.2,
    hairStrands: [],
    guides: [],
    materialType: 'standard',
    hairColor: 0x3a1a00,
    specularColor: 0x8B4513,
    useInstancing: true, // Option to toggle between instanced and merged geometry
    lastUpdateTime: 0,
    updateInterval: 100, // ms between updates
    batchSize: 50 // Process this many strands per frame
};

let currentStrokeTarget = null;

// Optimized hair strand class
class HairStrand {
    constructor(rootPosition, normal) {
        this.segments = [];
        this.initialDirection = normal.clone(); // Store the initial growth direction
        this.rootPosition = rootPosition.clone();
        this.normal = normal.clone(); // Surface normal at root
        this.needsUpdate = true; // Flag for physics or mesh update
        this.lastPhysicsUpdateTime = 0;

        this.initializeSegments();
    }

    initializeSegments() {
    this.segments = [];
    this.needsUpdate = true; // Flag that this strand needs a mesh update

    let currentPos = this.rootPosition.clone();
    
    // Start with a slightly randomized direction from the surface normal
    const baseDirection = this.initialDirection.clone().add(
        new THREE.Vector3(
            (Math.random() - 0.5) * hairBrushSettings.randomness,
            (Math.random() - 0.5) * hairBrushSettings.randomness,
            (Math.random() - 0.5) * hairBrushSettings.randomness
        )
    ).normalize();

    for (let i = 0; i < hairBrushSettings.numSegments; i++) {
        // The first segment (the root)
        this.segments.push({
            position: currentPos.clone(),
            prevPosition: currentPos.clone(),
            locked: i === 0,
        });

        // Calculate the position for the *next* segment
        if (i < hairBrushSettings.numSegments - 1) {
            const t = i / (hairBrushSettings.numSegments - 1 || 1); // Progress (0 to 1)
            const nextSegmentDirection = baseDirection.clone();

            // Apply gravity influence to the initial shape for a natural "hang"
            nextSegmentDirection.lerp(new THREE.Vector3(0, -1, 0), t * t * 0.3).normalize();
            
            // Add wave/curl procedural noise
            if (hairBrushSettings.wave > 0) {
                 const waveAngle = t * Math.PI * hairBrushSettings.wave * 4;
                 const waveAxis = new THREE.Vector3().crossVectors(nextSegmentDirection, new THREE.Vector3(Math.sin(i), Math.cos(i), 0)).normalize();
                 nextSegmentDirection.applyAxisAngle(waveAxis, waveAngle * 0.1);
            }
            if(hairBrushSettings.curl > 0){
                const curlAngle = t * Math.PI * hairBrushSettings.curl * 6;
                nextSegmentDirection.applyAxisAngle(baseDirection, curlAngle * 0.2);
            }

            // Move to the next segment's position
            currentPos.add(nextSegmentDirection.multiplyScalar(hairBrushSettings.segmentLength));
        }
    }
}

    update(deltaTime) {
        if (!physicsEnabled || hairBrushSettings.numSegments <= 1) {
             this.needsUpdate = false; return false;
        }

        const now = performance.now();
        if (now - this.lastPhysicsUpdateTime < 16 && deltaTime !== 0) return false; // Throttle individual strand physics updates
        this.lastPhysicsUpdateTime = now;

        const gravityForce = new THREE.Vector3(0, -hairBrushSettings.gravity * 0.1, 0); // Scaled gravity

        let hasChanged = false;

        // Verlet Integration
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (seg.locked) {
                seg.position.copy(this.rootPosition); // Ensure root stays put
                continue;
            }

            const tempPos = seg.position.clone();
            let acceleration = gravityForce.clone(); // Start with gravity

            // Air resistance / Damping (simplified)
            const velocity = seg.position.clone().sub(seg.prevPosition);
            acceleration.add(velocity.multiplyScalar(-hairBrushSettings.damping * 5)); // Damping based on velocity

            // Wind (simple global wind)
            if(hairBrushSettings.windStrength > 0){
                const windTime = Date.now() * 0.0001;
                const wind = new THREE.Vector3(
                    Math.sin(windTime + this.rootPosition.x) * hairBrushSettings.windStrength,
                    Math.sin(windTime * 0.7 + this.rootPosition.y) * hairBrushSettings.windStrength * 0.5,
                    Math.cos(windTime * 1.3 + this.rootPosition.z) * hairBrushSettings.windStrength
                );
                acceleration.add(wind);
            }


            seg.position.add(velocity).add(acceleration.multiplyScalar(deltaTime * deltaTime));
            seg.prevPosition.copy(tempPos);

            if (tempPos.distanceToSquared(seg.position) > 0.000001) {
                hasChanged = true;
            }
        }

        // Constraints (multiple passes for stability)
        const iterations = 3; // Constraint relaxation iterations
        for (let iter = 0; iter < iterations; iter++) {
            this.applyConstraints();
        }
        
        // Sphere collision (basic) - push segments out of the sphere
        if (sculptingSphere) {
            for (let i = 1; i < this.segments.length; i++) { // Start from 1, root is fixed
                const seg = this.segments[i];
                // Transform segment position to local space of the sculptingSphere if hair is child of sphere
                const localSegPos = sculptingSphere.worldToLocal(seg.position.clone());
                if (localSegPos.lengthSq() < 1.0) { // Assuming sphere radius is 1
                    localSegPos.setLength(1.01); // Push it slightly outside
                    seg.position.copy(sculptingSphere.localToWorld(localSegPos));
                    // Dampen velocity after collision
                    const prevP = sculptingSphere.worldToLocal(seg.prevPosition.clone());
                    prevP.lerp(localSegPos, 0.5); // Move prevPosition towards new position
                    seg.prevPosition.copy(sculptingSphere.localToWorld(prevP));
                    hasChanged = true;
                }
            }
        }


        if (hasChanged) this.needsUpdate = true;
        return hasChanged;
    }

    applyConstraints() {
        // Keep root segment at rootPosition
        this.segments[0].position.copy(this.rootPosition);

        for (let i = 0; i < this.segments.length - 1; i++) {
            const segA = this.segments[i];
            const segB = this.segments[i + 1];

            const delta = segB.position.clone().sub(segA.position);
            const dist = delta.length();
            const desiredDist = hairBrushSettings.segmentLength;
            
            if (dist === 0) continue; // Avoid division by zero

            const diff = (dist - desiredDist) / dist;
            const correction = delta.multiplyScalar(0.5 * diff * hairBrushSettings.stiffness); // Stiffness factor

            if (!segA.locked) {
                segA.position.add(correction);
            }
            if (!segB.locked) { // segB is never locked if i < length-1
                segB.position.sub(correction);
            }
        }
    }

    // getMatrix is for instancing, points are for merged
    getGeometryData() {
        const points = this.segments.map(seg => seg.position);
        if (points.length < 2) { // CatmullRomCurve3 needs at least 2 points
            // Return a minimal line if not enough points
            points.push(this.rootPosition.clone().add(this.initialDirection.clone().multiplyScalar(0.001)));
        }
        const curve = new THREE.CatmullRomCurve3(points);

        // For instancing (matrix part):
        const matrix = new THREE.Matrix4();
        const position = this.rootPosition;
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.initialDirection.clone().normalize());
        const scale = new THREE.Vector3(1,1,1); // Can scale length here if instance tube is unit length
        matrix.compose(position, quaternion, scale);

        return { matrix, curve, points }; // curve and points for merged, matrix for instanced
    }
}



class HairGuide {
    constructor(controlPoints, scene) {
        // An array of THREE.Vector3 that define the curve
        this.controlPoints = controlPoints;
        this.scene = scene;
        
        // The underlying curve object
        this.curve = new THREE.CatmullRomCurve3(this.controlPoints);

        // --- Visual Representation of the Guide ---
        // A thicker, colored tube to make it easy to see and select.
        const guideGeometry = new THREE.TubeGeometry(this.curve, 32, 0.02, 8, false);
        const guideMaterial = new THREE.MeshBasicMaterial({ color: 0xffa500 }); // Bright orange
        this.mesh = new THREE.Mesh(guideGeometry, guideMaterial);
        this.mesh.userData.isHairGuide = true; // Mark this mesh as a guide
        this.mesh.userData.guide = this;       // Link back to this object
        
        this.scene.add(this.mesh);
        
        // --- Visual Representation of the Control Points (Handles) ---
        this.handles = new THREE.Group();
        this.controlPoints.forEach((point, index) => {
            const handleGeom = new THREE.SphereGeometry(0.03, 16, 8);
            const handleMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Cyan
            const handle = new THREE.Mesh(handleGeom, handleMat);
            handle.position.copy(point);
            handle.userData.isGuideHandle = true; // Mark as a handle
            handle.userData.guide = this;         // Link to the parent guide
            handle.userData.pointIndex = index;   // Store which point this handle controls
            this.handles.add(handle);
        });
        
        this.handles.visible = false; // Handles are only visible when the guide is selected
        this.scene.add(this.handles);
    }
    
    // Call this when a control point has been moved
    update() {
        // Update the handle positions to match the data
        this.controlPoints.forEach((point, index) => {
            this.handles.children[index].position.copy(point);
        });

        // Re-create the curve with the new point positions
        this.curve = new THREE.CatmullRomCurve3(this.controlPoints);
        
        // Update the guide mesh's geometry
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.TubeGeometry(this.curve, 32, 0.02, 8, false);
        
        // IMPORTANT: Flag that the final dense hair mesh needs to be rebuilt
        flagHairMeshRebuild();
    }
    
    // Show or hide the interactive handles
    setSelected(isSelected) {
        this.handles.visible = isSelected;
        // Make selected guide brighter
        this.mesh.material.color.set(isSelected ? 0xffff00 : 0xffa500); // Yellow when selected
    }
    
    // Clean up when deleting a guide
    dispose() {
        this.scene.remove(this.mesh);
        this.scene.remove(this.handles);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.handles.children.forEach(handle => {
            handle.geometry.dispose();
            handle.material.dispose();
        });
    }
}

// Hair mesh management
let hairInstanceMesh = null;
let mergedHairGeometry = null;
let hairMesh = null;


// Create hair mesh using instancing (more efficient)
function createInstancedHairMesh() {
    // ... (keep your existing createInstancedHairMesh, but be aware it won't show physics deformation without custom shaders)
    // For now, this path is less critical to debug.
    console.log("Creating instanced hair mesh (will show static template strands).");
    if (hairInstanceMesh) {
        hairInstanceMesh.geometry.dispose();
        if (hairInstanceMesh.material) hairInstanceMesh.material.dispose();
        if(sculptingSphere && hairInstanceMesh.parent === sculptingSphere) sculptingSphere.remove(hairInstanceMesh);
        hairInstanceMesh = null;
    }

    // A simple line or very thin tube as a template
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, hairBrushSettings.segmentLength * hairBrushSettings.numSegments, 0)];
    const strandCurve = new THREE.CatmullRomCurve3(points);

    const strandGeometry = new THREE.TubeGeometry(
        strandCurve,
        2, // Segments for the template tube
        hairBrushSettings.thickness,
        3, // Radial segments for the template tube
        false
    );

    const material = new THREE.MeshStandardMaterial({ // Use StandardMaterial for lighting
        color: hairBrushSettings.hairColor,
        roughness: 0.8, // Hair is generally not shiny metallic
        metalness: 0.1,
        side: THREE.DoubleSide, // Usually not needed for tubes
    });

    hairInstanceMesh = new THREE.InstancedMesh(strandGeometry, material, hairBrushSettings.maxStrands);
    hairInstanceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Important
    hairInstanceMesh.castShadow = true;
    // hairInstanceMesh.receiveShadow = true; // Can be expensive

    const dummyMatrix = new THREE.Matrix4().scale(new THREE.Vector3(0,0,0)); // Initially invisible
    for (let i = 0; i < hairBrushSettings.maxStrands; i++) {
        hairInstanceMesh.setMatrixAt(i, dummyMatrix);
    }
    hairInstanceMesh.count = 0; // Start with 0 visible instances
    hairInstanceMesh.instanceMatrix.needsUpdate = true;

    if (sculptingSphere) sculptingSphere.add(hairInstanceMesh);
    console.log("Instanced hair mesh created with capacity:", hairBrushSettings.maxStrands);
    return hairInstanceMesh;
}

// Alternative: Create merged hair geometry (better for fewer strands)
function createMergedHairGeometry() {
    console.log("Creating merged hair geometry system...");
    if (hairMesh) {
        if (hairMesh.geometry) hairMesh.geometry.dispose();
        if (hairMesh.material) hairMesh.material.dispose();
        if(sculptingSphere && hairMesh.parent === sculptingSphere) sculptingSphere.remove(hairMesh);
        hairMesh = null;
    }

    const material = new THREE.MeshStandardMaterial({ // Use StandardMaterial
        color: hairBrushSettings.hairColor,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide, // Good for flat ribbons or if tubes are very thin
    });

    const mergedGeometry = new THREE.BufferGeometry(); // Start with empty
    hairMesh = new THREE.Mesh(mergedGeometry, material);
    hairMesh.castShadow = true;
    // hairMesh.receiveShadow = true;

    if (sculptingSphere) sculptingSphere.add(hairMesh);
    console.log("Merged hair mesh system created.");
    return hairMesh;
}

// Efficiently update hair visualization
function updateHairMesh() {
    const now = performance.now();
    // Throttle full mesh rebuild if not actively brushing and physics off
    if (!hairBrushActive && !physicsEnabled && (now - hairBrushSettings.lastRebuildTime < 500)) {
        return;
    }
     hairBrushSettings.lastRebuildTime = now;


    if (hairBrushSettings.useInstancing) {
        if (!hairInstanceMesh) createInstancedHairMesh();
        updateInstancedHair();
    } else {
        if (!hairMesh) createMergedHairGeometry();
        updateMergedHair();
    }
}

function updateInstancedHair() {
    if (!hairInstanceMesh || !hairBrushSettings.hairStrands) return;

    const strands = hairBrushSettings.hairStrands;
    const strandCount = Math.min(strands.length, hairBrushSettings.maxStrands);
    hairInstanceMesh.count = strandCount; // Set how many instances to draw

    const dummyMatrix = new THREE.Matrix4().scale(new THREE.Vector3(0,0,0)); // For unused instances

    for (let i = 0; i < hairBrushSettings.maxStrands; i++) {
        if (i < strandCount) {
            const strand = strands[i];
            if (strand.needsUpdate || hairBrushActive) { // Only update matrix if strand changed
                const { matrix } = strand.getGeometryData();
                hairInstanceMesh.setMatrixAt(i, matrix);
                strand.needsUpdate = false; // Reset flag
            }
        } else {
            // Could set to a dummy matrix to hide unused instances if count isn't perfectly managed
             hairInstanceMesh.setMatrixAt(i, dummyMatrix);
        }
    }
    hairInstanceMesh.instanceMatrix.needsUpdate = true;
}

// Update merged geometry hair representation
/*function updateMergedHair() {
    if (!hairMesh || !hairBrushSettings.hairStrands) {
        console.warn("Merged hair mesh or strands not ready for update.");
        return;
    }

    const strands = hairBrushSettings.hairStrands;
    if (strands.length === 0) {
        if (hairMesh.geometry) hairMesh.geometry.dispose();
        hairMesh.geometry = new THREE.BufferGeometry(); // Assign new empty geometry
        console.log("Cleared merged hair geometry (0 strands).");
        return;
    }
    
    // Check if any strand actually needs a mesh update
    const anyStrandNeedsUpdate = strands.some(s => s.needsUpdate);
    if (!anyStrandNeedsUpdate && !hairBrushActive && !physicsEnabled) return; // Optimization

    console.log(`Updating merged hair with ${strands.length} strands.`);

    const geometries = [];
    for (let i = 0; i < strands.length; i++) {
        const strand = strands[i];
        const { curve } = strand.getGeometryData(); // Using the curve from physics-updated points

        if (curve.points.length >= 2) {
             const tubeThickness = hairBrushSettings.thickness * (0.8 + Math.random() * 0.4); // Add variation
             const tubeSegments = Math.max(2, Math.floor(hairBrushSettings.numSegments / 2)); // Fewer segments for tube geo
             const radialSegments = 3; // Keep low for performance
            const tubeGeometry = new THREE.TubeGeometry(curve, tubeSegments, tubeThickness, radialSegments, false);
            geometries.push(tubeGeometry);
        }
        strand.needsUpdate = false; // Reset flag
    }

    if (geometries.length > 0) {
        const newMergedGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries, false); // Set useGroups to false
        if (newMergedGeometry) {
            if (hairMesh.geometry) hairMesh.geometry.dispose(); // Dispose old
            hairMesh.geometry = newMergedGeometry;
            console.log("Merged hair geometry updated.");
        } else {
            console.warn("Failed to merge hair geometries. Result was null.");
            if (hairMesh.geometry) hairMesh.geometry.dispose();
            hairMesh.geometry = new THREE.BufferGeometry(); // Fallback to empty
        }
    } else if (strands.length > 0) {
        // This case means strands exist but no valid geometries were generated (e.g. all strands had < 2 points)
        console.warn("No valid tube geometries generated for merging, though strands exist.");
        if (hairMesh.geometry) hairMesh.geometry.dispose();
        hairMesh.geometry = new THREE.BufferGeometry();
    }
    // If geometries.length is 0 and strands.length is 0, it's handled by the first check.
}*/

function updateMergedHair() {
    if (!hairMesh) return;

    if (needsHairMeshRebuild) {
        console.log(`Rebuilding hair mesh from ${hairGuides.length} guides.`);
        if (hairMesh.geometry) hairMesh.geometry.dispose();

        if (hairGuides.length === 0) {
            hairMesh.geometry = new THREE.BufferGeometry();
            needsHairMeshRebuild = false;
            return;
        }

        const allChildGeometries = [];
        const childrenPerGuide = 20; // How many visible strands per guide (for clumping)
        
        hairGuides.forEach(guide => {
            for (let i = 0; i < childrenPerGuide; i++) {
                // Get points along the guide curve
                const guidePoints = guide.curve.getPoints(hairBrushSettings.numSegments);
                
                // Add randomness to each point to create a "clump" around the guide
                const childPoints = guidePoints.map((p, index) => {
                    const randomness = (guide.mesh.geometry.parameters.radius || 0.02) * (index / guidePoints.length) * 2.0;
                    return p.clone().add(
                        new THREE.Vector3(
                           (Math.random() - 0.5) * randomness,
                           (Math.random() - 0.5) * randomness,
                           (Math.random() - 0.5) * randomness
                        )
                    );
                });
                
                const childCurve = new THREE.CatmullRomCurve3(childPoints);
                const tubeGeometry = new THREE.TubeGeometry(
                    childCurve,
                    hairBrushSettings.numSegments,
                    hairBrushSettings.thickness,
                    3, // triangle tubes are fast
                    false
                );
                allChildGeometries.push(tubeGeometry);
            }
        });

        if (allChildGeometries.length > 0) {
            hairMesh.geometry = THREE.BufferGeometryUtils.mergeBufferGeometries(allChildGeometries, false);
        } else {
            hairMesh.geometry = new THREE.BufferGeometry();
        }
        
        needsHairMeshRebuild = false;
    }
}


/*function applyHairBrush(event) { // Removed unused vertices, position, normal args for this func
    if (!hairBrushActive || event.buttons !== 1 || !sculptingEnabled) return; // Check sculptingEnabled

    const raycaster = new THREE.Raycaster();
    const mouseNDC = getMouseCoords(event); // Using your existing helper
    raycaster.setFromCamera(mouseNDC, camera);

    const intersects = raycaster.intersectObject(sculptingSphere);
    if (intersects.length > 0 && sculptingSphere) {
        const intersect = intersects[0];
        const hitPosition = intersect.point; // This is in world space
        // Ensure normal is correctly transformed if sphere is rotated/scaled
        const hitNormal = intersect.face.normal.clone().transformDirection(sculptingSphere.matrixWorld).normalize();


        const brushRadiusWorld = characterBrushSize * 0.2; // Adjust brush size for effect
        const densityFactor = hairBrushSettings.density / 50; // Normalize density
        
        // Strands to add based on a simplified "density" within brush area
        // This is a rough approximation.
        const strandsToAttempt = Math.max(1, Math.floor(densityFactor * 5));


        let strandsAddedThisStroke = 0;
        for (let i = 0; i < strandsToAttempt; i++) {
            if (hairBrushSettings.hairStrands.length >= hairBrushSettings.maxStrands) break;
            if (strandsAddedThisStroke >= maxHairStrandsPerOperation) break;

            // Random offset within the brush radius on the surface (approximate)
            const randomAngle = Math.random() * Math.PI * 2;
            const randomRadius = Math.random() * brushRadiusWorld;
            
            // Create a basis for the offset
            let tangent = new THREE.Vector3();
            if (Math.abs(hitNormal.y) < 0.99) { // if normal is not straight up/down
                tangent.crossVectors(hitNormal, new THREE.Vector3(0,1,0)).normalize();
            } else { // if normal is up/down, use X axis
                tangent.crossVectors(hitNormal, new THREE.Vector3(1,0,0)).normalize();
            }
            let bitangent = new THREE.Vector3().crossVectors(hitNormal, tangent).normalize();

            const offset = tangent.multiplyScalar(Math.cos(randomAngle) * randomRadius)
                             .add(bitangent.multiplyScalar(Math.sin(randomAngle) * randomRadius));
            
            const strandRootPos = hitPosition.clone().add(offset);
            
            // Project strandRootPos back onto sphere surface (optional, for accuracy)
            // let dirToCenter = strandRootPos.clone().sub(sculptingSphere.position).normalize();
            // strandRootPos.copy(sculptingSphere.position).add(dirToCenter.multiplyScalar(sphereRadius));

            // Check distance to existing strands to avoid too much overlap
            let tooClose = false;
            for(const existingStrand of hairBrushSettings.hairStrands){
                if(existingStrand.rootPosition.distanceToSquared(strandRootPos) < (0.005 * 0.005)){ // Min dist
                    tooClose = true;
                    break;
                }
            }
            if(tooClose) continue;


            const strand = new HairStrand(strandRootPos, hitNormal.clone()); // Use hitNormal for initial direction
            hairBrushSettings.hairStrands.push(strand);
            strandsAddedThisStroke++;
        }

        if (strandsAddedThisStroke > 0) {
            console.log(`Added ${strandsAddedThisStroke} strands. Total: ${hairBrushSettings.hairStrands.length}`);
            if (!hairBrushSettings.useInstancing) {
                // Instead of calling updateHairMesh(), just set the flag!
                flagHairMeshRebuild();
            } else {
                // Instancing is different, update it directly
                updateInstancedHair(); 
            }
            document.getElementById('strandCount').textContent = hairBrushSettings.hairStrands.length;
        }
    }
}*/

function applyHairBrush(event) {
    if (!hairBrushActive || event.buttons !== 1) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(getMouseCoords(event), camera);
    const intersects = raycaster.intersectObject(sculptingSphere);

    if (intersects.length > 0) {
        const { point, face } = intersects[0];
        const normal = face.normal.clone().transformDirection(sculptingSphere.matrixWorld).normalize();

        // --- Create a new Hair Guide instead of a HairStrand ---
        const numSegments = 5; // A new guide will have 5 control points
        const length = 0.8;    // The initial length of the guide
        const controlPoints = [];

        for (let i = 0; i < numSegments; i++) {
            const pos = point.clone().add(normal.clone().multiplyScalar(length * (i / (numSegments - 1))));
            controlPoints.push(pos);
        }
        
        const newGuide = new HairGuide(controlPoints, scene);
        hairGuides.push(newGuide);

        // Immediately hide the guide mesh if we are not in edit mode
        if (!isEditHairMode) {
            newGuide.mesh.visible = false;
        }

        flagHairMeshRebuild(); // Flag to rebuild the final hair
        
        // Prevent adding hundreds of guides in one stroke
        hairBrushActive = false; 
    }
}

// Efficiently update hair physics with animation frame management
function updateHairPhysics(time) { // time is passed by requestAnimationFrame
    if (!physicsEnabled || !hairBrushSettings.hairStrands || hairBrushSettings.hairStrands.length === 0) {
        if (physicsAnimationId) {
            cancelAnimationFrame(physicsAnimationId);
            physicsAnimationId = null;
        }
        return;
    }

    // Simple fixed delta time for physics stability
    const deltaTime = 1 / 60; // Assume 60 FPS for physics updates
    let strandsUpdated = 0;

    // Update all strands if few, or batch if many
    const processAll = hairBrushSettings.hairStrands.length < hairBrushSettings.batchSize * 2;

    if (processAll) {
        hairBrushSettings.hairStrands.forEach(strand => {
            if (strand.update(deltaTime)) strandsUpdated++;
        });
    } else {
        // Simple rotating batch for updating different strands over time
        const batchOffset = Math.floor((time / 100)) % Math.ceil(hairBrushSettings.hairStrands.length / hairBrushSettings.batchSize);
        const startIndex = batchOffset * hairBrushSettings.batchSize;
        const endIndex = Math.min(startIndex + hairBrushSettings.batchSize, hairBrushSettings.hairStrands.length);

        for (let i = startIndex; i < endIndex; i++) {
            if (hairBrushSettings.hairStrands[i].update(deltaTime)) strandsUpdated++;
        }
    }


    /*if (strandsUpdated > 0 || hairBrushActive) { // Update mesh if physics changed anything or if brushing
        updateHairMesh();
    }*/

    if (strandsUpdated > 0) {
        // Don't call the whole update function, just flag that the geometry
        // based on the physics simulation needs to be recalculated.
        flagHairMeshRebuild();
    }

    physicsAnimationId = requestAnimationFrame(updateHairPhysics);
}


// Add initial gravity setting if not present in hairBrushSettings
/*
if (!hairBrushSettings.gravity) {
    hairBrushSettings.gravity = 0.1; // Adjustable gravity strength
}
if (!hairBrushSettings.damping) {
    hairBrushSettings.damping = 0.1; // Default damping
}
if (!hairBrushSettings.windStrength) {
    hairBrushSettings.windStrength = 0.05; // Default wind strength
}
if (!hairBrushSettings.turbulence) {
    hairBrushSettings.turbulence = 0.02; // Default turbulence
}*/


// Character modeling variables
let selectedCharacterTool = null;
let isCharacterSculpting = false;
//let characterBrushSize = 0.2;
let characterBrushSize = 1.0;
let characterBrushStrength = 0.1;
let characterBrushFalloff = 0.5;
let sculptingSphere = null;
let characterUndoStack = [];
let characterRedoStack = [];

function setupLighting() {
    // Clear existing lights if any (optional, depends on your scene setup)
    scene.children = scene.children.filter(child => !(child instanceof THREE.Light));

    // 1. Ambient Light (soft base illumination)
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // Soft gray light, moderate intensity
    scene.add(ambientLight);

    // 2. Key Light (main directional light)
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(5, 5, 5); // Positioned above and to the front-right
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048; // Higher resolution shadows
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0001; // Reduce shadow acne
    scene.add(keyLight);

    // 3. Fill Light (softer light to reduce shadow harshness)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 3, -5); // Positioned to the front-left
    fillLight.castShadow = false; // No shadows from fill light
    scene.add(fillLight);

    // 4. Rim Light (backlight for edge definition)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, 5, -7); // Positioned behind and above
    rimLight.castShadow = false; // No shadows from rim light
    scene.add(rimLight);

    // Optional: Add a helper to visualize light positions (remove in production)
    // scene.add(new THREE.DirectionalLightHelper(keyLight, 1));
    // scene.add(new THREE.DirectionalLightHelper(fillLight, 1));
    // scene.add(new THREE.DirectionalLightHelper(rimLight, 1));
}

// Add main sculpting sphere
function addSculptingSphere() {
    console.log("Adding sculpting sphere...");
    if (sculptingSphere && sculptingSphere.parent) {
        sculptingSphere.parent.remove(sculptingSphere);
        if(sculptingSphere.geometry) sculptingSphere.geometry.dispose();
        if(sculptingSphere.material) sculptingSphere.material.dispose();
    }

    const geometry = new THREE.SphereGeometry(1, 128, 128); // Reduced segments for performance
    const material = new THREE.MeshStandardMaterial({
        color: 0xB08D57, // A more skin-like base
        roughness: 0.7,
        metalness: 0.0,
        // flatShading: false, // Default
    });

    sculptingSphere = new THREE.Mesh(geometry, material);
    sculptingSphere.name = 'SculptingSphere';
    sculptingSphere.castShadow = true;
    sculptingSphere.receiveShadow = true; // Important for self-shadowing or environment
    sculptingSphere.userData.isSculptable = true;

    scene.add(sculptingSphere);
    console.log("Sculpting sphere added to scene:", sculptingSphere.uuid);

    createCharacterBrushPreview();
    setupCharacterSculptingEvents(); // Ensure this is called after sphere exists
    addObjectToScene(sculptingSphere, 'Sculpting_Sphere'); // Assuming this is part of your larger app context

    // Initialize hair mesh system based on current settings
    if (hairBrushSettings.useInstancing) {
        if (hairInstanceMesh && hairInstanceMesh.parent) hairInstanceMesh.parent.remove(hairInstanceMesh);
        createInstancedHairMesh();
    } else {
        if (hairMesh && hairMesh.parent) hairMesh.parent.remove(hairMesh);
        createMergedHairGeometry();
    }
    setupLighting(); // Call after sphere is added if lights depend on it
    return sculptingSphere;
}

/*
function createCharacterBrushPreview() {
    if (window.characterBrushPreview) {
        scene.remove(window.characterBrushPreview);
    }

    const brushPreview = new THREE.Group();

    const innerSphere = new THREE.Mesh(
        new THREE.SphereGeometry(characterBrushSize * 0.25, 16, 16),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.4,
            depthTest: false
        })
    );

    const falloffRing = new THREE.Mesh(
        new THREE.RingGeometry(characterBrushSize * 0.6, characterBrushSize * 0.8, 48),
        new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthTest: false
        })
    );

    const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(characterBrushSize * 0.8, characterBrushSize * 1, 48),
        new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthTest: false
        })
    );

    // Glow ring shader
    const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(characterBrushSize * 0.95, characterBrushSize * 1.3, 64),
        new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0xffe400) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;
                void main() {
                    float glow = 0.5 + 0.5 * sin(time * 2.0 + vUv.x * 6.2831);
                    gl_FragColor = vec4(color * glow, 0.25);
                }
            `,
            transparent: true,
            depthTest: false
        })
    );

    brushPreview.add(innerSphere, falloffRing, outerRing, glowRing);
    brushPreview.visible = false;
    window.characterBrushPreview = brushPreview;
    scene.add(brushPreview);

    animateBrushGlow(glowRing.material);
}
function createCharacterBrushPreview() {
    if (window.characterBrushPreview) {
        scene.remove(window.characterBrushPreview);
        // You should also properly dispose of old geometry/materials here
    }

    const brushPreview = new THREE.Group();
    brushPreview.name = "CharacterBrushCursor";

    // A simple ring to show the outer edge. Radius 0.5 = Diameter 1.
    const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.48, 0.5, 64),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    brushPreview.add(outerRing);

    // Force the brush to render on top of everything without being affected by depth
    brushPreview.renderOrder = 999;
    outerRing.material.depthTest = false;
    outerRing.material.depthWrite = false;

    brushPreview.visible = false; // Start hidden
    window.characterBrushPreview = brushPreview;
    scene.add(brushPreview);
    console.log("✅ Character Brush Preview Created.");
}*/


// Animate brush glow for better visibility
/*function animateBrushGlow(material) {
    let lastTime = 0;
    
    function animate(time) {
        // Skip animation if not visible
        if (!window.characterBrushPreview || !window.characterBrushPreview.visible) {
            requestAnimationFrame(animate);
            return;
        }
        
        // Update shader time uniform
        material.uniforms.time.value += 0.05;
        requestAnimationFrame(animate);
    }
    
    animate(0);
}*/



/*
function updateCharacterBrushPreview(event) {
    if (!sculptingTarget || !window.characterBrushPreview) return;

    const mouse = getMouseNormalized(event, renderer.domElement);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(sculptingTarget);

    if (intersects.length > 0) {
        const { point, face, object } = intersects[0];
        const normal = face.normal;

        window.characterBrushPreview.position.copy(point);

        const lookAt = new THREE.Vector3().addVectors(point, normal);
        const orientMatrix = new THREE.Matrix4().lookAt(point, lookAt, new THREE.Vector3(0, 1, 0));
        window.characterBrushPreview.quaternion.setFromRotationMatrix(orientMatrix);

        const distance = camera.position.distanceTo(point);
        const scale = distance * 0.05;
        window.characterBrushPreview.scale.set(scale, scale, scale);

        window.characterBrushPreview.visible = true;
        window.lastIntersect = { point, normal, face, object };
    } else {
        window.characterBrushPreview.visible = false;
        window.lastIntersect = null;
    }
}*/

/**
 * Creates the multi-part brush preview.
 *
 * FIX: All geometry is now created with a BASE SIZE of 1. The final size
 * is controlled entirely by scaling the parent group in updateCharacterBrushPreview.
 * This makes the brush resizable and fixes the core issue.
 */
function createCharacterBrushPreview() {
    // Clean up any old brush to prevent memory leaks
    if (window.characterBrushPreview) {
        scene.remove(window.characterBrushPreview);
        window.characterBrushPreview.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                // The 'dispose' method on materials handles textures and shaders.
                child.material.dispose();
            }
        });
    }

    const brushPreview = new THREE.Group();
    brushPreview.name = "CharacterBrushCursor";

    // --- Create all geometry with a BASE DIAMETER of 1 ---
    
    // Inner sphere (Radius 0.125 = Diameter 0.25)
    const innerSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.125, 16, 8), 
        new THREE.MeshBasicMaterial({
            color: 0x00FFFF,
            transparent: true,
            opacity: 0.5,
        })
    );

    // Falloff ring (from radius 0.25 to 0.35)
    const falloffRing = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.35, 32),
        new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
        })
    );

    // Main ring (from radius 0.35 to 0.5)
    const mainRing = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.5, 32),
        new THREE.MeshBasicMaterial({
            color: 0xFF4500,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
        })
    );

    // Animated glow ring (from radius 0.45 to 0.65)
    const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.65, 32),
        new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0xFFD700) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;
                void main() {
                    // A smoother, pulsating glow
                    float radius = distance(vUv, vec2(0.5));
                    float glow = 1.0 - smoothstep(0.4, 0.5, radius);
                    float pulse = 0.7 + 0.3 * sin(time * 4.0 + vUv.x * 20.0);
                    gl_FragColor = vec4(color * glow * pulse, glow * pulse * 0.4);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending, // Use additive blending for a better glow
        })
    );
    
    // --- Visibility and Rendering Fix ---
    // Force the brush to render on top of everything and ignore depth.
    brushPreview.renderOrder = 999;
    brushPreview.add(innerSphere, falloffRing, mainRing, glowRing);
    brushPreview.traverse(child => {
        if (child.isMesh) {
            child.material.depthTest = false;
            child.material.depthWrite = false;
        }
    });

    brushPreview.visible = false;
    window.characterBrushPreview = brushPreview;
    scene.add(brushPreview);

    // Start the animation loop for the new glow material.
    animateBrushGlow(glowRing.material);
    console.log("✅ Improved Character Brush Preview Created.");
}


/**
 * Animates the brush glow shader.
 *
 * IMPROVEMENT: This is now a self-contained loop that doesn't need
 * to be restarted. It simply checks if the material is still valid.
 */
function animateBrushGlow(material) {
    function animate() {
        // Continue the loop as long as the material exists
        if (material) {
             // Only update the shader if the brush is visible, for performance.
            if(window.characterBrushPreview && window.characterBrushPreview.visible) {
                material.uniforms.time.value += 0.02;
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
}


/**
 * Updates the brush's position, orientation, and most importantly, its SCALE.
 *
 * FIX: The scale is now set directly from the global 'characterBrushSize'
 * variable. The camera distance scaling has been removed, as it's typically
 * undesirable for sculpting. We also now correctly calculate the normal in
 * world space to support rotated or scaled models.
 * @param {PointerEvent} event - The 'pointermove' or 'pointerdown' event.
 */
function updateCharacterBrushPreview(event) {
    // Ensure we have a target model and a brush to show.
    // The target is your main head/sphere model.
    const targetModel = sculptingSphere; 
    if (!targetModel || !window.characterBrushPreview) {
        if (window.characterBrushPreview) window.characterBrushPreview.visible = false;
        return;
    }

    // This helper function should get the mouse coordinates in the -1 to +1 range.
    // Make sure you have a `getMouseCoords` function like the one in previous answers.
    const mouse = getMouseCoords(event); 

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(targetModel, false); // false = don't check children

    if (intersects.length > 0) {
        const { point, face, object } = intersects[0];

        // --- FIX: Calculate the normal in WORLD space ---
        // This is crucial for the brush to orient correctly if the model is rotated.
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
        const worldNormal = face.normal.clone().applyMatrix3(normalMatrix).normalize();

        // 1. Position the brush at the exact intersection point.
        window.characterBrushPreview.position.copy(point);

        // 2. Orient the brush to be perpendicular to the surface.
        const lookTarget = new THREE.Vector3().addVectors(point, worldNormal);
        window.characterBrushPreview.lookAt(lookTarget);

        // --- THE MAIN FIX & IMPROVEMENT ---
        // 3. Set the scale directly based on your global `characterBrushSize`.
        // Because the brush geometry was created with a diameter of 1, this works perfectly.
        window.characterBrushPreview.scale.setScalar(characterBrushSize);

        // 4. Make the brush visible.
        window.characterBrushPreview.visible = true;

        // Store the intersection details for the sculpting functions to use.
        window.lastIntersect = { point, normal: worldNormal, face, object };

    } else {
        // If the mouse is not over the target, hide the brush.
        window.characterBrushPreview.visible = false;
        window.lastIntersect = null;
    }
}

function onPointerMoveCH(event) {
    switch (currentEditorMode) {
        case EDITOR_MODE.SCULPT_TERRAIN:
            // If we are in terrain mode, only update the terrain brush.
            // (Assuming your terrain brush update function is named updateBrushCursor)
            if (typeof updateBrushCursor === 'function') {
                updateBrushCursor(event);
            }
            break;
            
        case EDITOR_MODE.SCULPT_CHARACTER:
            // If we are in character mode, only update the character brush.
            if (typeof updateCharacterBrushPreview === 'function') {
                updateCharacterBrushPreview(event);
            }
            break;

        case EDITOR_MODE.IDLE:
        case EDITOR_MODE.TRANSFORM_OBJECT:
        default:
            // In any other mode, make sure all brush previews are hidden.
            if (window.characterBrushPreview) window.characterBrushPreview.visible = false;
            if (window.universalBrushCursor) window.universalBrushCursor.visible = false; // Or whatever your terrain brush is called
            break;
    }

    // --- The logic for applying the sculpt/paint effect while dragging is separate ---
    // This part of your old listener should be moved into a dedicated onCharacterSculptMove function if it isn't already.
    if (isCharacterSculpting && currentEditorMode === EDITOR_MODE.SCULPT_CHARACTER) {
        // Call the function that actually deforms the mesh
        // applySculptingTool(event, ...); 
    }
    // Add similar logic for terrain sculpting...
}



let sculptingEnabled = true;

// Setup sculpting event listeners
function setupCharacterSculptingEvents() {
    const canvas = renderer.domElement;

    document.querySelectorAll('.panel-button-tool').forEach(button => {
        button.addEventListener('click', () => {
            selectedCharacterTool = button.id;
            console.log("Selected tool:", selectedCharacterTool);
            updateToolUI();
            // hairBrushActive is now handled by mousedown/up
        });
    });

    canvas.addEventListener('pointerdown', onCharacterSculptStart); // Use pointer events
    canvas.addEventListener('pointermove', onCharacterSculptMove);
    canvas.addEventListener('pointerup', onCharacterSculptEnd);
    canvas.addEventListener('pointerleave', onCharacterSculptEnd); // End sculpt if mouse leaves canvas

    const sculptingToggleEl = document.getElementById('sculptingToggle');
    if (sculptingToggleEl) {
        sculptingEnabled = sculptingToggleEl.checked; // Set initial state
        sculptingToggleEl.addEventListener('change', (e) => {
            sculptingEnabled = e.target.checked;
            console.log("Sculpting enabled:", sculptingEnabled);
        });
    } else { console.warn("Sculpting toggle not found"); }


    const brushSizeEl = document.getElementById('brushSizeSc');
    if (brushSizeEl) {
        characterBrushSize = parseFloat(brushSizeEl.value); // Set initial
        document.getElementById('brushSizeValue').textContent = characterBrushSize.toFixed(2);
        brushSizeEl.addEventListener('input', (e) => {
            characterBrushSize = parseFloat(e.target.value);
            document.getElementById('brushSizeValue').textContent = characterBrushSize.toFixed(2);
            updateBrushPreviewSize();
        });
    } else { console.warn("Brush Size slider not found"); }

    const brushStrengthEl = document.getElementById('brushStrength');
     if (brushStrengthEl) {
        characterBrushStrength = parseFloat(brushStrengthEl.value); // Set initial
        document.getElementById('brushStrengthValue').textContent = characterBrushStrength.toFixed(2);
        brushStrengthEl.addEventListener('input', (e) => {
            characterBrushStrength = parseFloat(e.target.value);
            document.getElementById('brushStrengthValue').textContent = characterBrushStrength.toFixed(2);
        });
    } else { console.warn("Brush Strength slider not found"); }


    const brushFalloffEl = document.getElementById('brushFalloff');
    if (brushFalloffEl) {
        characterBrushFalloff = parseFloat(brushFalloffEl.value); // Set initial
        document.getElementById('brushFalloffValue').textContent = characterBrushFalloff.toFixed(1);
        brushFalloffEl.addEventListener('input', (e) => {
            characterBrushFalloff = parseFloat(e.target.value);
            document.getElementById('brushFalloffValue').textContent = characterBrushFalloff.toFixed(1);
        });
    } else { console.warn("Brush Falloff slider not found"); }

    // Resolve duplicate physics toggle and setup hair controls
    const physicsToggleBtn = document.getElementById('togglePhysics') || document.getElementById('enablePhysics'); // Get first available
    if (physicsToggleBtn) {
        // Ensure only one listener if IDs were merged or one chosen
        if (!physicsToggleBtn.dataset.listenerAttached) {
             physicsToggleBtn.addEventListener('click', () => {
                physicsEnabled = !physicsEnabled;
                console.log("Physics enabled:", physicsEnabled);
                if (physicsEnabled) {
                    updateHairPhysics(performance.now()); // Start physics loop
                } else if (physicsAnimationId) {
                    cancelAnimationFrame(physicsAnimationId);
                    physicsAnimationId = null;
                }
                updateToolUI(); // Update button text
            });
            physicsToggleBtn.dataset.listenerAttached = 'true';
        }
    } else { console.warn("Physics toggle button not found."); }

    setupHairControls();
}

window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.altKey) {
        characterBrushSize += e.deltaY * -0.001;
        characterBrushSize = Math.max(0.1, Math.min(characterBrushSize, 10));
        updateBrushPreviewSize();
    }
});


function updateBrushPreviewSize() {
    if (!window.characterBrushPreview) return;
    const [inner, falloff, outer, glow] = window.characterBrushPreview.children;

    inner.geometry.dispose();
    inner.geometry = new THREE.SphereGeometry(characterBrushSize * 0.25, 16, 16);

    falloff.geometry.dispose();
    falloff.geometry = new THREE.RingGeometry(characterBrushSize * 0.6, characterBrushSize * 0.8, 48);

    outer.geometry.dispose();
    outer.geometry = new THREE.RingGeometry(characterBrushSize * 0.8, characterBrushSize * 1.0, 48);

    glow.geometry.dispose();
    glow.geometry = new THREE.RingGeometry(characterBrushSize * 0.95, characterBrushSize * 1.3, 64);
}


// Update UI based on selected tool
function updateToolUI() {
    document.querySelectorAll('.panel-button-tool').forEach(button => { // Ensure this selects tool buttons
        button.classList.toggle('active', button.id === selectedCharacterTool);
    });
    const physicsToggleBtn = document.getElementById('togglePhysics') || document.getElementById('enablePhysics');
    if (physicsToggleBtn) {
        physicsToggleBtn.textContent = physicsEnabled ? 'Disable Physics' : 'Enable Physics';
    }
}

// Setup hair control listeners
function setupHairControls() {
    // Define a mapping for UI IDs to hairBrushSettings keys if they differ
    const controlMapping = {
        'guideHairDensity': 'density', // Assuming guideHairDensity maps to overall density for now
        'hairSegments': 'numSegments',
        'hairLength': 'segmentLength',
        'hairDensity': 'density', // Can have two sliders for density, or one. This one might be for # of strands for brush
        'hairCurl': 'curl',
        'hairStiffness': 'stiffness',
        'hairWave': 'wave',
        'hairFrizz': 'frizz',
        'hairClumpSize': 'clumpSize',
        'hairNoise': 'randomness',
        'hairColor': 'hairColor',
        'hairSpecular': 'specularColor'
    };

    Object.keys(controlMapping).forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            // Set initial value display if it's a range slider with a span
            const valueDisplay = element.parentNode.querySelector('.value-display') || (element.type === 'range' ? element.nextElementSibling : null);
            if (element.type === 'range' && valueDisplay && valueDisplay.tagName === 'SPAN') {
                valueDisplay.textContent = element.value;
            }


            element.addEventListener('input', (e) => {
                const settingKey = controlMapping[controlId];
                let value = e.target.value;
                if (element.type === 'range' && valueDisplay && valueDisplay.tagName === 'SPAN') {
                     valueDisplay.textContent = value; // Update span for range sliders
                }
                updateHairSettings(settingKey, value, element.type);
            });
        } else {
            console.warn(`Hair control element with ID '${controlId}' not found.`);
        }
    });

    const simQualityEl = document.getElementById('simulationQuality');
    if (simQualityEl) {
        simQualityEl.addEventListener('change', (e) => {
            updateSimulationQuality(e.target.value);
        });
    }
}


// Update hair settings based on UI input
function updateHairSettings(settingKey, value, elementType) {
    console.log(`Updating hair setting: ${settingKey} = ${value}`);
    let needsReinitialize = false;
    let needsMaterialUpdate = false;

    switch(settingKey) {
        case 'density': // Special handling if 'guideHairDensity' and 'hairDensity' map to same 'density'
                      // Or differentiate their effects. For now, let's assume they both affect density.
            hairBrushSettings.density = parseFloat(value); // UI value might need scaling
            // if controlId was 'guideHairDensity', scale differently for example:
            // hairBrushSettings.density = parseFloat(value) * 200; // example scaling
            break;
        case 'numSegments':
            hairBrushSettings.numSegments = parseInt(value);
            needsReinitialize = true;
            break;
        case 'segmentLength':
            hairBrushSettings.segmentLength = parseFloat(value);
            needsReinitialize = true;
            break;
        case 'curl': hairBrushSettings.curl = parseFloat(value); needsReinitialize = true; break;
        case 'stiffness': hairBrushSettings.stiffness = parseFloat(value); break; // Physics property
        case 'wave': hairBrushSettings.wave = parseFloat(value); needsReinitialize = true; break;
        case 'frizz': hairBrushSettings.frizz = parseFloat(value); needsReinitialize = true; break;
        case 'clumpSize': hairBrushSettings.clumpSize = parseInt(value); needsReinitialize = true; break; // Affects initial generation
        case 'randomness': hairBrushSettings.randomness = parseFloat(value); needsReinitialize = true; break;
        case 'hairColor':
            hairBrushSettings.hairColor = new THREE.Color(value).getHex(); // Use THREE.Color
            needsMaterialUpdate = true;
            break;
        case 'specularColor': // If your material uses specular, update it
            hairBrushSettings.specularColor = new THREE.Color(value).getHex();
            needsMaterialUpdate = true;
            break;
        default:
            if (hairBrushSettings.hasOwnProperty(settingKey)) {
                 if(elementType === 'range' || typeof hairBrushSettings[settingKey] === 'number') {
                    hairBrushSettings[settingKey] = parseFloat(value);
                 } else {
                    hairBrushSettings[settingKey] = value;
                 }
            }
    }

    if (needsReinitialize) {
        updateHairStrands(); // This re-initializes segments for all strands
    }
    if (needsMaterialUpdate) {
        updateHairMaterial();
    }
    // Always update the mesh to reflect potential visual changes from physics or re-initialization
    updateHairMesh();
}


function updateHairMaterial() {
    const targetMesh = hairBrushSettings.useInstancing ? hairInstanceMesh : hairMesh;
    if (targetMesh && targetMesh.material) {
        targetMesh.material.color.setHex(hairBrushSettings.hairColor);
        if (targetMesh.material.sheenColor) { // Check if property exists
             targetMesh.material.sheenColor.setHex(hairBrushSettings.specularColor);
        }
        targetMesh.material.needsUpdate = true;
        console.log("Hair material updated.");
    }
}

function updateHairStrands() {
    console.log("Re-initializing all hair strands based on new settings...");
    hairBrushSettings.hairStrands.forEach(strand => {
        strand.initializeSegments();
    });
    updateHairMesh(); // Update visuals after re-initializing
}




// Update simulation quality settings
function updateSimulationQuality(value) {
    switch(value) {
        case 'low':
            hairBrushSettings.batchSize = 25;
            hairBrushSettings.updateInterval = 200;
            break;
        case 'medium':
            hairBrushSettings.batchSize = 50;
            hairBrushSettings.updateInterval = 100;
            break;
        case 'high':
            hairBrushSettings.batchSize = 100;
            hairBrushSettings.updateInterval = 50;
            break;
    }
}

// Sculpting event handlers
function onCharacterSculptStart(event) {
    if (event.button !== 0) return; // Only main mouse button

    // Check if mouse is over UI panel, if so, don't sculpt.
    // This requires knowing your UI panel's element.
    // const uiPanel = document.getElementById('sculpting-character-tools');
    // if (uiPanel && uiPanel.contains(event.target)) return;


    if (!sculptingSphere || !sculptingEnabled) { // Check global sculpting toggle
         isCharacterSculpting = false; // Ensure it's false
         hairBrushActive = false;      // Ensure this is also false
         return;
    }
    if (!selectedCharacterTool && !hairBrushActive) return;


    isCharacterSculpting = true;
    if (selectedCharacterTool === CHARACTER_TOOLS.HAIR_BRUSH) {
        hairBrushActive = true;
    }
    saveUndoState(); // Save state at the beginning of a stroke

    prevMouseEvent = event; // Initialize for snake hook or other drag tools

    // Perform initial sculpt/hair application on mousedown
    const position = getMousePosition(event); // Helper to get 3D point on sphere
    const normal = getMouseNormal(event);   // Helper to get surface normal

    if(position && normal){
        applySculptingTool(event, sculptingSphere.geometry.attributes.position.array, position, normal);
    }
}


function onCharacterSculptMove(event) {
    updateCharacterBrushPreview(event); // Update brush preview regardless of sculpting state

    if (!isCharacterSculpting || !sculptingEnabled) return; // Check global toggle
    if (!selectedCharacterTool && !hairBrushActive) return;


    const vertices = sculptingSphere.geometry.attributes.position.array;
    const position = getMousePosition(event);
    const normal = getMouseNormal(event);

    if(position && normal){
        applySculptingTool(event, vertices, position, normal);
    }
    // prevMouseEvent is updated by snakeHookVertices itself if it's the active tool
}

function onCharacterSculptEnd(event) {
    if (event.button !== 0 && event.type !== 'pointerleave') return;

    if (isCharacterSculpting) {
        if (sculptingSphere && sculptingSphere.geometry.attributes.position) {
             sculptingSphere.geometry.attributes.position.needsUpdate = true;
             sculptingSphere.geometry.computeVertexNormals(); // Important after deforming
        }
    }
    isCharacterSculpting = false;
    hairBrushActive = false; // Deactivate hair brush on mouse up/leave
    prevMouseEvent = null; // Clear for snake hook
}


// Get mouse position on surface
function getMousePosition(event) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(getMouseCoords(event), camera);
    const intersects = raycaster.intersectObject(sculptingSphere);
    return intersects.length > 0 ? intersects[0].point : null;
}

// Get surface normal at mouse position
function getMouseNormal(event) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(getMouseCoords(event), camera);
    const intersects = raycaster.intersectObject(sculptingSphere);
    return intersects.length > 0 ? intersects[0].face.normal : null;
}

// Convert screen coords to NDC
function getMouseCoords(event) {
    return new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );
}

// Apply selected sculpting tool
function applySculptingTool(event, vertices, position, normal) {
    if (!position || !normal) return;
    if (!sculptingEnabled && selectedCharacterTool !== CHARACTER_TOOLS.HAIR_BRUSH) return; // Stricter check
    if (selectedCharacterTool === CHARACTER_TOOLS.HAIR_BRUSH && !hairBrushActive) return;

    switch(selectedCharacterTool) {
        case CHARACTER_TOOLS.FACE_SHAPE:
            sculptVertices(vertices, position, normal);
            break;
        case CHARACTER_TOOLS.NOSE_SCULPT:
        case CHARACTER_TOOLS.CHEEK_DEFINITION:
        case CHARACTER_TOOLS.JAW_SCULPT:
        case CHARACTER_TOOLS.FOREHEAD_SHAPE:
        case CHARACTER_TOOLS.CHIN_SCULPT:
        case CHARACTER_TOOLS.TEMPLE_SCULPT:
        case CHARACTER_TOOLS.BROW_RIDGE:
        case CHARACTER_TOOLS.EYE_SOCKET:
        case CHARACTER_TOOLS.LIP_SHAPE:
            sculptVertices(vertices, position, normal);
            break;
        case CHARACTER_TOOLS.SMOOTH:
            smoothVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.PINCH:
            pinchVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.INFLATE:
            inflateVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.CREASE:
            creaseVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.SNAKE_HOOK:
            snakeHookVertices(vertices, position, event);
            break;
        case CHARACTER_TOOLS.HAIR_BRUSH:
            applyHairBrush(event);
            break;
        default:
            if (hairBrushActive) { // If no specific tool but hairbrush was active (e.g. just selected)
                applyHairBrush(event);
            }
        
    }
}

// Core sculpting functions
function sculptVertices(vertices, position, normal) {
    if (!sculptingEnabled) return;
    const symmetry = document.getElementById('symmetryToggle').checked;
    const axis = document.getElementById('symmetryAxis').value;
    
    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);
        
        if (distance < characterBrushSize) {
            const falloff = 1 - Math.pow(distance / characterBrushSize, characterBrushFalloff);
            const displacement = normal.clone().multiplyScalar(characterBrushStrength * falloff);
            
            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
            
            if (symmetry) {
                applySymmetry(vertices, i, axis);
            }
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals(); // Update normals for proper lighting
}

function smoothVertices(vertices, position) {
    if (!sculptingEnabled) return;

    const tempVertices = new Float32Array(vertices);
    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        if (vertex.distanceTo(position) < characterBrushSize) {
            let avg = new THREE.Vector3();
            let count = 0;
            
            for (let j = 0; j < vertices.length; j += 3) {
                if (i !== j) {
                    const neighbor = new THREE.Vector3(vertices[j], vertices[j + 1], vertices[j + 2]);
                    if (neighbor.distanceTo(vertex) < characterBrushSize * 0.5) {
                        avg.add(neighbor);
                        count++;
                    }
                }
            }
            
            if (count > 0) {
                avg.divideScalar(count);
                const falloff = 1 - (vertex.distanceTo(position) / characterBrushSize);
                tempVertices[i] = THREE.MathUtils.lerp(vertices[i], avg.x, falloff * 0.5);
                tempVertices[i + 1] = THREE.MathUtils.lerp(vertices[i + 1], avg.y, falloff * 0.5);
                tempVertices[i + 2] = THREE.MathUtils.lerp(vertices[i + 2], avg.z, falloff * 0.5);
            }
        }
    }
    vertices.set(tempVertices);
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

function pinchVertices(vertices, position) {
    if (!sculptingEnabled) return;

    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);
        
        if (distance < characterBrushSize) {
            const falloff = 1 - (distance / characterBrushSize);
            const direction = position.clone().sub(vertex).normalize();
            const displacement = direction.multiplyScalar(characterBrushStrength * falloff * 0.5);
            
            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

function inflateVertices(vertices, position) {
    if (!sculptingEnabled) return;

    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);
        
        if (distance < characterBrushSize) {
            const falloff = 1 - (distance / characterBrushSize);
            const direction = vertex.clone().normalize();
            const displacement = direction.multiplyScalar(characterBrushStrength * falloff);
            
            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

function creaseVertices(vertices, position) {
    if (!sculptingEnabled) return;

    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);
        
        if (distance < characterBrushSize) {
            const falloff = 1 - Math.pow(distance / characterBrushSize, 2);
            const direction = vertex.clone().sub(position).normalize();
            const displacement = direction.multiplyScalar(-characterBrushStrength * falloff);
            
            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

let prevMouseEvent = null;

function snakeHookVertices(vertices, position, currentEvent) {
    if (!sculptingEnabled) return;

    if (!prevMouseEvent) { // First point of the drag for this stroke
        prevMouseEvent = currentEvent;
        return;
    }

    const mousePos = getMouseCoords(currentEvent);
    const prevMousePos = getMouseCoords(prevMouseEvent);
    const movement = new THREE.Vector2().subVectors(mousePos, prevMousePos);

    if (movement.lengthSq() === 0) { // No actual mouse movement
        prevMouseEvent = currentEvent; // Still update prevMouseEvent
        return;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mousePos, camera);
    const intersects = raycaster.intersectObject(sculptingSphere);
    if (!intersects.length) {
        prevMouseEvent = currentEvent;
        return;
    }
    const newTargetPoint = intersects[0].point; // Where the mouse currently is on the sphere

    // We want to displace vertices that were under the brush at 'position' (start of this segment of drag)
    // towards the 'newTargetPoint'
    const dragVector = newTargetPoint.clone().sub(position); // Vector from brush start to current mouse

    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distanceToBrushOrigin = vertex.distanceTo(position); // 'position' is where brush was at start of this delta

        if (distanceToBrushOrigin < characterBrushSize) {
            const falloff = Math.pow(1 - Math.min(distanceToBrushOrigin / characterBrushSize, 1.0), characterBrushFalloff);
            // Displace along the dragVector, scaled by strength and falloff
            // Movement.length() gives an idea of drag speed/distance for this frame
            const displacementAmount = characterBrushStrength * falloff * movement.length() * 20; // Adjust scalar
            const displacement = dragVector.clone().normalize().multiplyScalar(displacementAmount);
            
            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
    prevMouseEvent = currentEvent; // Update for the next move calculation
}

// Symmetry handling
function applySymmetry(vertices, index, axis) {
    const vertex = new THREE.Vector3(vertices[index], vertices[index + 1], vertices[index + 2]);
    const symmetricVertex = vertex.clone();
    
    switch(axis) {
        case 'x': symmetricVertex.x = -symmetricVertex.x; break;
        case 'y': symmetricVertex.y = -symmetricVertex.y; break;
        case 'z': symmetricVertex.z = -symmetricVertex.z; break;
    }
    
    let closestIndex = -1;
    let minDistance = Infinity;
    
    for (let i = 0; i < vertices.length; i += 3) {
        const v = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = v.distanceTo(symmetricVertex);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }
    
    if (closestIndex >= 0) {
        vertices[closestIndex] = symmetricVertex.x;
        vertices[closestIndex + 1] = symmetricVertex.y;
        vertices[closestIndex + 2] = symmetricVertex.z;
    }
}

// Undo/Redo system
function saveUndoState() {
    const vertices = sculptingSphere.geometry.attributes.position.array.slice();
    characterUndoStack.push({
        vertices: vertices,
        hairStrands: hairBrushSettings.hairStrands.map(strand => ({
            rootPosition: strand.rootPosition.clone(),
            normal: strand.normal.clone(),
            segments: strand.segments.map(seg => ({
                position: seg.position.clone(),
                velocity: seg.velocity.clone()
            }))
        }))
    });
    if (characterUndoStack.length > 50) characterUndoStack.shift();
    characterRedoStack = [];
}

function undo() {
    if (characterUndoStack.length === 0) return;
    
    const currentState = {
        vertices: sculptingSphere.geometry.attributes.position.array.slice(),
        hairStrands: hairBrushSettings.hairStrands.map(strand => ({
            rootPosition: strand.rootPosition.clone(),
            normal: strand.normal.clone(),
            segments: strand.segments.map(seg => ({
                position: seg.position.clone(),
                velocity: seg.velocity.clone()
            }))
        }))
    };
    
    characterRedoStack.push(currentState);
    const state = characterUndoStack.pop();
    
    sculptingSphere.geometry.attributes.position.array.set(state.vertices);
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    
    hairBrushSettings.hairStrands = state.hairStrands.map(data => {
        const strand = new HairStrand(data.rootPosition, data.normal);
        strand.segments = data.segments.map(seg => ({
            position: seg.position.clone(),
            velocity: seg.velocity.clone(),
            prevPosition: seg.position.clone(),
            force: new THREE.Vector3(),
            mass: 1,
            locked: false,
            normal: data.normal.clone()
        }));
        return strand;
    });
    updateHairMesh();
}

function redo() {
    if (characterRedoStack.length === 0) return;
    
    const currentState = {
        vertices: sculptingSphere.geometry.attributes.position.array.slice(),
        hairStrands: hairBrushSettings.hairStrands.map(strand => ({
            rootPosition: strand.rootPosition.clone(),
            normal: strand.normal.clone(),
            segments: strand.segments.map(seg => ({
                position: seg.position.clone(),
                velocity: seg.velocity.clone()
            }))
        }))
    };
    
    characterUndoStack.push(currentState);
    const state = characterRedoStack.pop();
    
    sculptingSphere.geometry.attributes.position.array.set(state.vertices);
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    
    hairBrushSettings.hairStrands = state.hairStrands.map(data => {
        const strand = new HairStrand(data.rootPosition, data.normal);
        strand.segments = data.segments.map(seg => ({
            position: seg.position.clone(),
            velocity: seg.velocity.clone(),
            prevPosition: seg.position.clone(),
            force: new THREE.Vector3(),
            mass: 1,
            locked: false,
            normal: data.normal.clone()
        }));
        return strand;
    });
    updateHairMesh();
}



function initRenderer() {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows like Blender
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Better color response
    renderer.toneMappingExposure = 1.0;
}

// Initialize the sculpting system
function initCharacterSculpting() {
    initRenderer(); // Ensure renderer is properly configured
    addSculptingSphere();
    animate();
}

// Start the system
initCharacterSculpting();

// Add keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'z') undo();
    if (event.ctrlKey && event.key === 'y') redo();
});

function toggleEditHairMode() {
    isEditHairMode = !isEditHairMode;
    console.log("Edit Hair Mode:", isEditHairMode);
    
    if (isEditHairMode) {
        // ENTERING Edit Mode
        hairMesh.visible = false; // Hide the dense "child" hair
        hairGuides.forEach(guide => guide.mesh.visible = true); // Show the guides
        // Disable the normal sculpting brush
        if (window.characterBrushPreview) window.characterBrushPreview.visible = false;
        
    } else {
        // EXITING Edit Mode
        hairMesh.visible = true; // Show the final hair
        hairGuides.forEach(guide => {
            guide.mesh.visible = false; // Hide the guides
            guide.setSelected(false); // Deselect all
        });
        if (transformControls.object) {
            transformControls.detach(); // Detach from any selected handle
        }
    }
    
    // You should have a button in your UI to call this function
    const editModeButton = document.getElementById('editHairModeButton');
    if(editModeButton) editModeButton.textContent = isEditHairMode ? 'Exit Edit Mode' : 'Enter Edit Mode';
}

// --- Update your onCharacterSculptStart function for the new mode ---
function onCharacterSculptStart(event) {
    if (event.button !== 0) return;

    if (isEditHairMode) {
        // --- Logic for selecting guides and handles ---
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(getMouseCoords(event), camera);
        
        const handleMeshes = hairGuides.flatMap(g => g.handles.children);
        const intersects = raycaster.intersectObjects(handleMeshes);
        
        if (intersects.length > 0) {
            // User clicked on a handle, attach the transform gizmo to it
            const handle = intersects[0].object;
            const guide = handle.userData.guide;

            if (selectedGuide && selectedGuide !== guide) {
                selectedGuide.setSelected(false); // Deselect old guide
            }
            selectedGuide = guide;
            selectedGuide.setSelected(true); // Select new guide
            
            transformControls.attach(handle);

        } else {
            // User clicked in empty space, deselect everything
            if (selectedGuide) selectedGuide.setSelected(false);
            selectedGuide = null;
            transformControls.detach();
        }

    } else {
        // --- Your existing sculpting/hair adding logic ---
        // (This part remains the same for now, but we'll change what it does)
        if (!sculptingSphere || !sculptingEnabled || !selectedCharacterTool) return;

        isCharacterSculpting = true;
        if (selectedCharacterTool === CHARACTER_TOOLS.HAIR_BRUSH) {
            hairBrushActive = true;
            applyHairBrush(event); // We will now make this add a GUIDE
        }
        // ... rest of your original logic
    }
}