// Character Sculpting Constants and State
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
let physicsEnabled = false;
let physicsAnimationId = null;
let hairBrushActive = false;
let maxHairStrandsPerOperation = 10; // Limit strands added per brush stroke

const hairBrushSettings = {
    numSegments: 5,
    segmentLength: 0.05,
    stiffness: 0.8,
    gravity: 0.5, // Reduced from 0.9
    windStrength: 0.3, // Reduced from 0.6
    turbulence: 0.1, // Reduced from 0.2
    springStiffness: 0.8,
    damping: 0.4, // Increased from 0.3
    airResistance: 0.05, // Increased from 0.02
    thickness: 0.004, // Reduced from 0.005
    density: 50, // Reduced from 100
    maxStrands: 1000, // Reduced from 5000
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



// Optimized hair strand class
class HairStrand {
    constructor(rootPosition, normal) {
        this.segments = [];
        this.initialDirection = normal.clone();
        this.springConstant = hairBrushSettings.stiffness;
        this.damping = hairBrushSettings.damping;
        this.airResistance = hairBrushSettings.airResistance;
        this.rootPosition = rootPosition.clone();
        this.normal = normal.clone();
        this.needsUpdate = true;
        this.lastUpdateTime = 0;
        
        this.initializeSegments();
    }
    
    initializeSegments() {
        let currentPos = this.rootPosition.clone();
        
        for (let i = 0; i < hairBrushSettings.numSegments; i++) {
            const t = i / hairBrushSettings.numSegments;
            
            // Create natural curved shape with controlled randomness
            const wave = Math.sin(i * hairBrushSettings.wave * Math.PI) * hairBrushSettings.curl;
            const spiral = new THREE.Vector3(
                Math.cos(t * 2 * Math.PI * hairBrushSettings.curl),
                Math.sin(t * 2 * Math.PI * hairBrushSettings.curl),
                0
            ).multiplyScalar(hairBrushSettings.curl * 0.1);

            const offset = new THREE.Vector3(
                Math.sin(i + wave) * hairBrushSettings.randomness,
                Math.cos(i + wave) * hairBrushSettings.randomness,
                Math.sin((i + wave) * 0.5) * hairBrushSettings.randomness
            ).add(spiral);

            // Add more frizz toward the tips
            const frizzScale = Math.pow(t, 0.5);
            const frizz = new THREE.Vector3(
                (Math.random() - 0.5) * hairBrushSettings.frizz * frizzScale,
                (Math.random() - 0.5) * hairBrushSettings.frizz * frizzScale,
                (Math.random() - 0.5) * hairBrushSettings.frizz * frizzScale
            );

            this.segments.push({
                position: currentPos.clone(),
                prevPosition: currentPos.clone(),
                velocity: new THREE.Vector3(),
                force: new THREE.Vector3(),
                mass: 1 - (t * 0.5), // Tips are lighter
                locked: i === 0, // Root is locked
                normal: this.normal.clone()
            });

            // Calculate next segment position
            const direction = this.normal.clone()
                .add(offset)
                .add(frizz)
                .normalize()
                .multiplyScalar(hairBrushSettings.segmentLength * (1 - t * 0.2));

            currentPos.add(direction);
        }
    }

    update(deltaTime) {
        if (!physicsEnabled) return false;
        
        const now = performance.now();
        if (now - this.lastUpdateTime < 16) return false;
        this.lastUpdateTime = now;
        
        const gravity = new THREE.Vector3(0, -hairBrushSettings.gravity * 9.81, 0);
        const windTime = Date.now() * 0.0005;
        const wind = new THREE.Vector3(
            Math.sin(windTime) * hairBrushSettings.windStrength,
            0,
            Math.cos(windTime * 1.3) * hairBrushSettings.windStrength
        );
        
        let hasChanged = false;
        
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            if (segment.locked) continue;
            
            segment.force.set(0, 0, 0);
            
            const massFactor = 1 - (i / this.segments.length) * 0.7;
            segment.force.add(gravity.clone().multiplyScalar(segment.mass * massFactor));
            
            const windFactor = 1 - (i / this.segments.length) * 0.5;
            segment.force.add(wind.clone().multiplyScalar(windFactor * hairBrushSettings.airResistance));
            
            const targetPos = this.segments[i - 1].position.clone()
                .add(this.initialDirection.clone()
                    .multiplyScalar(hairBrushSettings.segmentLength)
                    .applyAxisAngle(new THREE.Vector3(0, 0, 1), hairBrushSettings.curl * Math.PI * i / this.segments.length));
            const springForce = targetPos.sub(segment.position).multiplyScalar(hairBrushSettings.stiffness);
            segment.force.add(springForce);
            
            if (Math.random() > 0.8) {
                const frizzForce = new THREE.Vector3(
                    (Math.random() - 0.5) * hairBrushSettings.frizz,
                    (Math.random() - 0.5) * hairBrushSettings.frizz,
                    (Math.random() - 0.5) * hairBrushSettings.frizz
                ).multiplyScalar(1 - i / this.segments.length);
                segment.force.add(frizzForce);
            }

            const distToRoot = segment.position.distanceTo(this.rootPosition);
            if (distToRoot < 1.02 && i === 1) {
                segment.position.copy(this.rootPosition.clone().add(this.initialDirection.clone().multiplyScalar(0.02)));
                segment.velocity.set(0, 0, 0);
            } else if (distToRoot < 1.02) {
                const normal = segment.position.clone().normalize();
                segment.position.copy(normal.multiplyScalar(1.02));
                segment.velocity.projectOnPlane(normal).multiplyScalar(0.5);
                hasChanged = true;
            }

            const acceleration = segment.force.clone().divideScalar(segment.mass);
            segment.velocity.add(acceleration.multiplyScalar(deltaTime));
            segment.velocity.multiplyScalar(1 - this.damping);
            
            const oldPos = segment.position.clone();
            segment.position.add(segment.velocity.clone().multiplyScalar(deltaTime));
            
            if (oldPos.distanceToSquared(segment.position) > 0.00001) {
                hasChanged = true;
            }
        }
        
        if (hasChanged) {
            this.applyConstraints();
        }
        
        return hasChanged;
    }


    applyConstraints() {
        // Maintain segment lengths
        for (let i = 0; i < this.segments.length - 1; i++) {
            const segA = this.segments[i];
            const segB = this.segments[i + 1];
            
            const diff = segB.position.clone().sub(segA.position);
            const currentLength = diff.length();
            
            if (Math.abs(currentLength - hairBrushSettings.segmentLength) < 0.001) {
                continue; // Skip if length is already correct (optimization)
            }
            
            const correction = diff.normalize().multiplyScalar(
                hairBrushSettings.segmentLength - currentLength
            ).multiplyScalar(this.springConstant);

            // Apply correction based on locked state
            if (!segA.locked) segA.position.sub(correction.clone().multiplyScalar(0.5));
            if (!segB.locked) segB.position.add(correction.clone().multiplyScalar(0.5));
        }
        
        // Optional: Add shape memory - try to maintain original angles
        this.applyShapeMemory();
    }
    
    applyShapeMemory() {
        // Simple version: pull segments toward initial direction
        const memoryStrength = 0.03; // Subtle effect
        
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            if (segment.locked) continue;
            
            // Calculate ideal position based on root and initial direction
            const t = i / hairBrushSettings.numSegments;
            const idealOffset = this.initialDirection.clone()
                .multiplyScalar(hairBrushSettings.segmentLength * i);
            const idealPos = this.rootPosition.clone().add(idealOffset);
            
            // Pull slightly toward ideal position (stronger at root, weaker at tip)
            const pullStrength = memoryStrength * (1 - t * 0.8);
            segment.position.lerp(idealPos, pullStrength);
        }
    }

    getMatrix() {
        const points = this.segments.map(seg => seg.position);
        const curve = new THREE.CatmullRomCurve3(points);
        const matrix = new THREE.Matrix4().setPosition(this.rootPosition);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            this.normal
        );
        matrix.makeRotationFromQuaternion(quaternion);
        return { matrix, curve, points };
    }
}

// Hair mesh management
let hairInstanceMesh = null;
let mergedHairGeometry = null;
let hairMesh = null;

// Create hair mesh using instancing (more efficient)
function createInstancedHairMesh() {
    if (hairInstanceMesh) {
        hairInstanceMesh.geometry.dispose();
        hairInstanceMesh.material.dispose();
        sculptingSphere.remove(hairInstanceMesh);
        hairInstanceMesh = null;
    }
    
    const strandCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, hairBrushSettings.segmentLength * hairBrushSettings.numSegments * 0.25, 0),
        new THREE.Vector3(0, hairBrushSettings.segmentLength * hairBrushSettings.numSegments * 0.5, 0),
        new THREE.Vector3(0, hairBrushSettings.segmentLength * hairBrushSettings.numSegments * 0.75, 0),
        new THREE.Vector3(0, hairBrushSettings.segmentLength * hairBrushSettings.numSegments, 0)
    ]);
    
    const strandGeometry = new THREE.TubeGeometry(
        strandCurve,
        hairBrushSettings.numSegments,
        hairBrushSettings.thickness * (0.8 + Math.random() * hairBrushSettings.clumpSize * 0.1),
        8, // More radial segments for detail
        false
    );

    const material = new THREE.MeshPhysicalMaterial({
        color: hairBrushSettings.hairColor,
        roughness: 0.3,
        metalness: 0.2,
        clearcoat: 0.4,
        clearcoatRoughness: 0.25,
        sheen: 1.0,
        sheenRoughness: 0.3,
        sheenColor: hairBrushSettings.specularColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95
    });

    hairInstanceMesh = new THREE.InstancedMesh(strandGeometry, material, hairBrushSettings.maxStrands);
    hairInstanceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hairInstanceMesh.castShadow = true;
    hairInstanceMesh.receiveShadow = false;
    hairInstanceMesh.frustumCulled = false;

    const dummyMatrix = new THREE.Matrix4();
    for (let i = 0; i < hairBrushSettings.maxStrands; i++) {
        hairInstanceMesh.setMatrixAt(i, dummyMatrix);
    }
    
    hairInstanceMesh.instanceMatrix.needsUpdate = true;
    if (sculptingSphere) sculptingSphere.add(hairInstanceMesh);
    console.log("Instanced hair mesh created with capacity:", hairBrushSettings.maxStrands);
    return hairInstanceMesh;
}

// Alternative: Create merged hair geometry (better for fewer strands)
function createMergedHairGeometry() {
    console.log("Creating merged hair geometry...");
    
    // Clean up previous mesh
    if (hairMesh) {
        hairMesh.geometry.dispose();
        hairMesh.material.dispose();
        sculptingSphere.remove(hairMesh);
        hairMesh = null;
    }
    
    // Create material with hair appearance
    const material = new THREE.MeshPhysicalMaterial({
        color: hairBrushSettings.hairColor,
        roughness: 0.3,
        metalness: 0.2,
        clearcoat: 0.4,
        clearcoatRoughness: 0.25,
        sheen: 1.0,
        sheenRoughness: 0.3,
        sheenColor: hairBrushSettings.specularColor,
        side: THREE.DoubleSide
    });
    
    // Initialize empty geometry
    mergedHairGeometry = new THREE.BufferGeometry();
    hairMesh = new THREE.Mesh(mergedHairGeometry, material);
    hairMesh.castShadow = true;
    hairMesh.receiveShadow = false;
    sculptingSphere.add(hairMesh);
    
    return hairMesh;
}

// Efficiently update hair visualization
function updateHairMesh() {
    const now = performance.now();
    
    // Throttle updates for performance
    if (now - hairBrushSettings.lastUpdateTime < hairBrushSettings.updateInterval && 
        !hairBrushActive) {
        return;
    }
    
    hairBrushSettings.lastUpdateTime = now;
    
    if (hairBrushSettings.useInstancing) {
        updateInstancedHair();
    } else {
        updateMergedHair();
    }
}

// Update instanced hair representation
function updateInstancedHair() {
    if (!hairInstanceMesh) {
        console.warn("hairInstanceMesh is not initialized!");
        return;
    }

    const strands = hairBrushSettings.hairStrands;
    const strandCount = Math.min(strands.length, hairBrushSettings.maxStrands);
    
    // Process in batches
    const batchStart = Math.floor(Date.now() / 100) % Math.max(1, Math.floor(strandCount / hairBrushSettings.batchSize)) * hairBrushSettings.batchSize;
    const batchEnd = Math.min(batchStart + hairBrushSettings.batchSize, strandCount);
    
    // Only update a subset of strands per frame
    for (let i = batchStart; i < batchEnd; i++) {
        if (i < strandCount) {
            const strand = strands[i];
            const { matrix } = strand.getMatrix();
            hairInstanceMesh.setMatrixAt(i, matrix);
        }
    }
    
    hairInstanceMesh.instanceMatrix.needsUpdate = true;
}

// Update merged geometry hair representation
function updateMergedHair() {
    if (!hairMesh || !mergedHairGeometry) {
        console.warn("hairMesh or mergedHairGeometry not initialized!");
        return;
    }
    
    // Only rebuild complete geometry occasionally
    const now = Date.now();
    if (now - hairBrushSettings.lastRebuild < 500 && !hairBrushActive) {
        return;
    }
    hairBrushSettings.lastRebuild = now;
    
    const strands = hairBrushSettings.hairStrands;
    const strandCount = Math.min(strands.length, hairBrushSettings.maxStrands);
    
    // For small strand counts, using merged geometry can be faster
    const geometries = [];
    for (let i = 0; i < strandCount; i++) {
        const strand = strands[i];
        const { points } = strand.getMatrix();
        
        // Create curve from points
        const curve = new THREE.CatmullRomCurve3(points);
        
        // Create tube geometry
        const tubeGeometry = new THREE.TubeGeometry(
            curve,
            hairBrushSettings.numSegments,
            hairBrushSettings.thickness * (0.8 + Math.random() * 0.4), // Slight variation
            4,
            false
        );
        
        geometries.push(tubeGeometry);
    }
    
    // Merge all geometries
    mergedHairGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
    hairMesh.geometry = mergedHairGeometry;
}

// Apply hair brush with efficient strand creation
function applyHairBrush(event, vertices, position, normal) {
    if (!hairBrushActive || event.buttons !== 1 || !position || !normal || !sculptingEnabled) return;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    ), camera);
    
    const intersects = raycaster.intersectObject(sculptingSphere);
    if (intersects.length > 0 && sculptingSphere) {
        const intersect = intersects[0];
        const hitPosition = intersect.point.clone();
        const hitNormal = intersect.face.normal.clone().normalize();

        const brushRadius = characterBrushSize * 0.5; // Scale for visibility
        const density = hairBrushSettings.density / 100;
        const area = Math.PI * brushRadius * brushRadius;
        const strandsToAdd = Math.min(
            Math.floor(area * density),
            maxHairStrandsPerOperation,
            hairBrushSettings.maxStrands - hairBrushSettings.hairStrands.length
        );

        let strandsAdded = 0;
        for (let i = 0; i < strandsToAdd; i++) {
            const theta = Math.random() * 2 * Math.PI;
            const r = brushRadius * Math.sqrt(Math.random());
            
            const tangent = new THREE.Vector3(1, 0, 0).cross(hitNormal).normalize();
            if (tangent.lengthSq() < 0.01) tangent.set(0, 0, 1).cross(hitNormal).normalize();
            const bitangent = new THREE.Vector3().crossVectors(hitNormal, tangent).normalize();
            
            const offsetPosition = hitPosition.clone().add(
                tangent.clone().multiplyScalar(Math.cos(theta) * r)
            ).add(
                bitangent.clone().multiplyScalar(Math.sin(theta) * r)
            );
            
            const normalVariation = new THREE.Vector3(
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1
            );
            const strandNormal = hitNormal.clone().add(normalVariation).normalize();
            
            const strand = new HairStrand(offsetPosition, strandNormal);
            strand.initialDirection.copy(hitNormal);
            
            if (!hairBrushSettings.hairStrands.some(s => s.rootPosition.distanceTo(offsetPosition) < 0.01)) {
                hairBrushSettings.hairStrands.push(strand);
                strandsAdded++;
            }
        }

        if (!hairInstanceMesh) {
            createInstancedHairMesh();
        }
        if (!sculptingSphere.children.includes(hairInstanceMesh)) {
            sculptingSphere.add(hairInstanceMesh);
        }
        updateHairMesh(); // Force update
        console.log(`Added ${strandsAdded} strands at ${hitPosition.x}, ${hitPosition.y}, ${hitPosition.z}, Total strands: ${hairBrushSettings.hairStrands.length}`);

        // Update UI stats
        document.getElementById('strandCount').textContent = hairBrushSettings.hairStrands.length;
    }

    setTimeout(() => {
        hairBrushActive = false;
    }, 100);
}

// Efficiently update hair physics with animation frame management
function updateHairPhysics(deltaTime = 1/60) {
    if (!physicsEnabled) {
        if (physicsAnimationId) {
            cancelAnimationFrame(physicsAnimationId);
            physicsAnimationId = null;
        }
        return;
    }
    
    const batchSize = hairBrushSettings.batchSize;
    const startIndex = Math.floor(Date.now() / 32) % Math.max(1, Math.ceil(hairBrushSettings.hairStrands.length / batchSize)) * batchSize;
    const endIndex = Math.min(startIndex + batchSize, hairBrushSettings.hairStrands.length);
    
    let needsUpdate = false;
    
    for (let i = startIndex; i < endIndex; i++) {
        if (i < hairBrushSettings.hairStrands.length) {
            const changed = hairBrushSettings.hairStrands[i].update(deltaTime);
            needsUpdate = needsUpdate || changed;
        }
    }
    
    if (needsUpdate || hairBrushActive) {
        updateHairMesh();
    }
    
    physicsAnimationId = requestAnimationFrame(() => updateHairPhysics(deltaTime));
}

// Add initial gravity setting if not present in hairBrushSettings
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
}



// Character modeling variables
let selectedCharacterTool = null;
let isCharacterSculpting = false;
let characterBrushSize = 0.2;
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
    const geometry = new THREE.SphereGeometry(1, 256, 256);
    const material = new THREE.MeshStandardMaterial({
        color: 0xF5DEB3,
        roughness: 0.6,
        metalness: 0.05,
        flatShading: false,
        emissive: 0x331A00,
        emissiveIntensity: 0.02,
        transmission: 0.1,
        thickness: 0.5,
        envMapIntensity: 0.5
    });

    sculptingSphere = new THREE.Mesh(geometry, material);
    sculptingSphere.name = 'SculptingSphere';
    sculptingSphere.castShadow = true;
    sculptingSphere.receiveShadow = true;
    sculptingSphere.userData.isSculptable = true;

    scene.add(sculptingSphere); // Ensure added to scene
    createCharacterBrushPreview();
    setupCharacterSculptingEvents();
    addObjectToScene(sculptingSphere, 'Sculpting_Sphere');

    if (hairBrushSettings.useInstancing) {
        createInstancedHairMesh();
    } else {
        createMergedHairGeometry();
    }

    setupLighting();
    return sculptingSphere;
}

// Create brush preview for better user feedback
function createCharacterBrushPreview() {
    if (window.characterBrushPreview) {
        scene.remove(window.characterBrushPreview);
    }

    // Create brush preview group
    const brushPreview = new THREE.Group();
    
    // Inner sphere for brush center
    const innerSphereGeometry = new THREE.SphereGeometry(characterBrushSize * 0.25, 16, 16);
    const innerSphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x00FFFF,
        transparent: true,
        opacity: 0.5,
        depthTest: false
    });
    const innerSphere = new THREE.Mesh(innerSphereGeometry, innerSphereMaterial);

    // Falloff ring to show brush falloff area
    const falloffRingGeometry = new THREE.RingGeometry(
        characterBrushSize * 0.5, 
        characterBrushSize * 0.7, 
        32
    );
    const falloffRingMaterial = new THREE.MeshBasicMaterial({
        color: 0x00FF00,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const falloffRing = new THREE.Mesh(falloffRingGeometry, falloffRingMaterial);

    // Main ring for brush boundary
    const mainRingGeometry = new THREE.RingGeometry(
        characterBrushSize * 0.7, 
        characterBrushSize * 1, 
        32
    );
    const mainRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xFF4500,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthTest: false
    });
    const mainRing = new THREE.Mesh(mainRingGeometry, mainRingMaterial);

    // Animated glow ring for better visibility
    const glowRingGeometry = new THREE.RingGeometry(
        characterBrushSize * 0.9, 
        characterBrushSize * 1.3, 
        32
    );
    const glowRingMaterial = new THREE.ShaderMaterial({
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
                float glow = 0.5 + 0.5 * sin(time + vUv.x * 3.1416);
                gl_FragColor = vec4(color * glow, 0.4);
            }
        `,
        transparent: true,
        depthTest: false
    });
    const glowRing = new THREE.Mesh(glowRingGeometry, glowRingMaterial);

    // Add all elements to the brush preview
    brushPreview.add(innerSphere);
    brushPreview.add(falloffRing);
    brushPreview.add(mainRing);
    brushPreview.add(glowRing);
    brushPreview.visible = false;

    // Store reference to brush preview
    window.characterBrushPreview = brushPreview;
    scene.add(brushPreview);

    // Start animation for glow effect
    animateBrushGlow(glowRingMaterial);
}

// Animate brush glow for better visibility
function animateBrushGlow(material) {
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
}

// Update brush preview position and visibility
function updateCharacterBrushPreview(event) {
    if (!sculptingSphere || !window.characterBrushPreview) return;

    // Get mouse position in normalized device coordinates
    /*const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );*/

    const mouse = getMouseNormalized(event, renderer.domElement);

    // Cast ray from camera through mouse position
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(sculptingSphere);

    if (intersects.length > 0) {
        // Position brush preview at intersection point
        const intersect = intersects[0];
        const point = intersect.point;
        const normal = intersect.face.normal;

           // Orient brush preview to follow surface normal
           window.characterBrushPreview.position.copy(point);
        
        // Create orientation matrix based on surface normal
        const orientMatrix = new THREE.Matrix4();
        const lookAt = new THREE.Vector3().addVectors(point, normal);
        orientMatrix.lookAt(point, lookAt, new THREE.Vector3(0, 1, 0));
        
        // Apply orientation to brush preview
        window.characterBrushPreview.quaternion.setFromRotationMatrix(orientMatrix);
        
        // Scale brush preview based on distance to camera for consistent visual size
        const distanceToCamera = camera.position.distanceTo(point);
        const scaleFactor = distanceToCamera * 0.05;
        window.characterBrushPreview.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Make brush preview visible when over sculpting surface
        window.characterBrushPreview.visible = true;
        
        // Store intersection data for potential sculpting operations
        window.lastIntersect = {
            point: point.clone(),
            normal: normal.clone(),
            face: intersect.face,
            object: intersect.object
        };
    } else {
        // Hide brush preview when not over sculpting surface
        window.characterBrushPreview.visible = false;
        window.lastIntersect = null;
    }
}

let sculptingEnabled = true;

// Setup sculpting event listeners
function setupCharacterSculptingEvents() {
    const canvas = renderer.domElement;
    
    // Existing tool selection code
    document.querySelectorAll('.panel-button-tool').forEach(button => {
        button.addEventListener('click', () => {
            selectedCharacterTool = button.id;
            updateToolUI();
            if (selectedCharacterTool === CHARACTER_TOOLS.HAIR_BRUSH) {
                hairBrushActive = true;
            }
        });
    });

    // Mouse events
    canvas.addEventListener('mousedown', onCharacterSculptStart);
    canvas.addEventListener('mousemove', onCharacterSculptMove);
    canvas.addEventListener('mouseup', onCharacterSculptEnd);
    
    // Physics toggle
    document.getElementById('togglePhysics').addEventListener('click', () => {
        physicsEnabled = !physicsEnabled;
        if (physicsEnabled) {
            updateHairPhysics();
        }
        updateToolUI();
    });


    document.getElementById('sculptingToggle').addEventListener('change', (e) => {
        sculptingEnabled = e.target.checked;
    });

    // Existing brush controls
    document.getElementById('brushSizeSc').addEventListener('input', (e) => {
        characterBrushSize = parseFloat(e.target.value);
        document.getElementById('brushSizeValue').textContent = e.target.value;
        updateBrushPreviewSize();
    });

    document.getElementById('brushStrength').addEventListener('input', (e) => {
        characterBrushStrength = parseFloat(e.target.value);
        document.getElementById('brushStrengthValue').textContent = e.target.value;
    });

    document.getElementById('brushFalloff').addEventListener('input', (e) => {
        characterBrushFalloff = parseFloat(e.target.value);
        document.getElementById('brushFalloffValue').textContent = e.target.value;
    });

    setupHairControls();
}

function updateBrushPreviewSize() {
    if (window.characterBrushPreview) {
        const innerSphere = window.characterBrushPreview.children[0];
        const falloffRing = window.characterBrushPreview.children[1];
        const mainRing = window.characterBrushPreview.children[2];
        const glowRing = window.characterBrushPreview.children[3];

        innerSphere.geometry = new THREE.SphereGeometry(characterBrushSize * 0.25, 16, 16);
        falloffRing.geometry = new THREE.RingGeometry(characterBrushSize * 0.5, characterBrushSize * 0.7, 32);
        mainRing.geometry = new THREE.RingGeometry(characterBrushSize * 0.7, characterBrushSize * 1, 32);
        glowRing.geometry = new THREE.RingGeometry(characterBrushSize * 0.9, characterBrushSize * 1.3, 32);
    }
}

// Update UI based on selected tool
function updateToolUI() {
    document.querySelectorAll('.panel-button').forEach(button => {
        button.classList.toggle('active', button.id === selectedCharacterTool);
    });
    document.getElementById('togglePhysics').textContent = 
        physicsEnabled ? 'Disable Physics' : 'Enable Physics';
}

// Setup hair control listeners
function setupHairControls() {
    const controls = [
        'guideHairDensity', 'hairSegments', 'hairLength', 'hairDensity',
        'hairCurl', 'hairStiffness', 'hairWave', 'hairFrizz', 
        'hairClumpSize', 'hairNoise', 'hairColor', 'hairSpecular'
    ];

    controls.forEach(controlId => {
        const element = document.getElementById(controlId);
        element.addEventListener('input', (e) => {
            updateHairSettings(controlId, e.target.value);
            if (controlId.includes('hairColor') || controlId.includes('hairSpecular')) {
                updateHairMaterial();
            }
        });
    });

    document.getElementById('simulationQuality').addEventListener('change', (e) => {
        updateSimulationQuality(e.target.value);
    });
}

// Update hair settings based on UI input
function updateHairSettings(controlId, value) {
    switch(controlId) {
        case 'guideHairDensity': hairBrushSettings.density = parseFloat(value) * 100; break; // Scale to match density
        case 'hairSegments': 
            hairBrushSettings.numSegments = parseInt(value);
            hairBrushSettings.hairStrands.forEach(strand => strand.initializeSegments());
            break;
        case 'hairLength': 
            hairBrushSettings.segmentLength = parseFloat(value);
            hairBrushSettings.hairStrands.forEach(strand => strand.initializeSegments());
            break;
        case 'hairDensity': hairBrushSettings.density = parseInt(value) * 10; break; // Scale density
        case 'hairCurl': hairBrushSettings.curl = parseFloat(value); break;
        case 'hairStiffness': hairBrushSettings.stiffness = parseFloat(value); break;
        case 'hairWave': hairBrushSettings.wave = parseFloat(value); break;
        case 'hairFrizz': hairBrushSettings.frizz = parseFloat(value); break;
        case 'hairClumpSize': hairBrushSettings.clumpSize = parseInt(value); break;
        case 'hairNoise': hairBrushSettings.randomness = parseFloat(value); break;
        case 'hairColor': hairBrushSettings.hairColor = parseInt(value.replace('#', '0x')); break;
        case 'hairSpecular': hairBrushSettings.specularColor = parseInt(value.replace('#', '0x')); break;
    }
    updateHairMaterial();
    updateHairMesh();
    updateHairStrands();
}

function updateHairMaterial() {
    if (hairInstanceMesh) {
        hairInstanceMesh.material.color.setHex(hairBrushSettings.hairColor);
        hairInstanceMesh.material.sheenColor.setHex(hairBrushSettings.specularColor);
    }
    if (hairMesh) {
        hairMesh.material.color.setHex(hairBrushSettings.hairColor);
        hairMesh.material.sheenColor.setHex(hairBrushSettings.specularColor);
    }
}


function updateHairStrands() {
    hairBrushSettings.hairStrands.forEach(strand => {
        strand.initializeSegments(); // Reapply settings to existing strands
    });
    updateHairMesh();
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
    if (!selectedCharacterTool || !sculptingSphere) return;
    
    isCharacterSculpting = true;
    saveUndoState();
    
    const vertices = sculptingSphere.geometry.attributes.position.array;
    const position = getMousePosition(event);
    const normal = getMouseNormal(event);
    
    applySculptingTool(event, vertices, position, normal);
}

function onCharacterSculptMove(event) {
    updateCharacterBrushPreview(event);
    
    if (!isCharacterSculpting || !selectedCharacterTool) return;
    
    const vertices = sculptingSphere.geometry.attributes.position.array;
    const position = getMousePosition(event);
    const normal = getMouseNormal(event);
    
    applySculptingTool(event, vertices, position, normal);
    prevMouseEvent = event; // Always update prevMouseEvent during sculpting
}

function onCharacterSculptEnd(event) {
    isCharacterSculpting = false;
    if (selectedCharacterTool === CHARACTER_TOOLS.HAIR_BRUSH) {
        hairBrushActive = false;
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
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

    switch(selectedCharacterTool) {
        case CHARACTER_TOOLS.FACE_SHAPE:
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
            snakeHookVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.HAIR_BRUSH:
            applyHairBrush(event, vertices, position, normal);
            break;
    }
}

// Core sculpting functions
function sculptVertices(vertices, position, normal) {
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
}

function pinchVertices(vertices, position) {
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
}

function inflateVertices(vertices, position) {
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
}

function creaseVertices(vertices, position) {
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
}

let prevMouseEvent = null;

function snakeHookVertices(vertices, position) {
    if (!prevMouseEvent) return; // Skip if no previous position

    const mousePos = getMouseCoords(event);
    const prevMousePos = getMouseCoords(prevMouseEvent);
    const movement = new THREE.Vector2().subVectors(mousePos, prevMousePos);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mousePos, camera);
    const intersects = raycaster.intersectObject(sculptingSphere);
    if (!intersects.length) return;

    const newPosition = intersects[0].point;

    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);
        
        if (distance < characterBrushSize) {
            const falloff = 1 - (distance / characterBrushSize);
            const direction = newPosition.clone().sub(position).normalize();
            const displacement = direction.multiplyScalar(characterBrushStrength * falloff * movement.length() * 5);
            
            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals(); // Update normals
    prevMouseEvent = event; // Update previous event
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