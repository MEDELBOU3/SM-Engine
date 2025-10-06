// ====================================================================
// --- ADVANCED MODIFIER SYSTEM ---
// ====================================================================

/**
 * Manages all active modifiers in the scene.
 * This object will be updated in the main animate loop.
 */
const modifierManager = {
    // A map to store which objects have which modifiers.
    // Format: Map<objectUuid, Modifier[]>
    registry: new Map(),

    /**
     * Adds a modifier to an object.
     * @param {THREE.Object3D} object - The object to modify.
     * @param {string} type - The type of modifier (e.g., 'shatter').
     * @param {object} params - The initial parameters for the modifier.
     */
    addModifier(object, type, params = {}) {
        if (!this.registry.has(object.uuid)) {
            this.registry.set(object.uuid, []);
        }

        let modifier;
        switch (type) {
            case 'shatter':
                modifier = new ShatterModifier(params);
                break;
            // Future modifiers would be added here (e.g., 'bend', 'twist')
            default:
                console.error(`Unknown modifier type: ${type}`);
                return;
        }

        modifier.initialize(object); // Perform one-time setup
        this.registry.get(object.uuid).push(modifier);
        
        // Update the timeline UI to show the new modifier track
        updateModifierTracksUI();
    },

    /**
     * Main update function, called every frame from the animate() loop.
     * It applies the effects of all registered modifiers based on the timeline's currentTime.
     */
    update(currentTime) {
        this.registry.forEach((modifiers, uuid) => {
            const object = scene.getObjectByProperty('uuid', uuid);
            if (!object) return;

            // Apply each modifier in the stack for the given object
            for (const modifier of modifiers) {
                if (modifier.enabled) {
                    modifier.apply(object, currentTime);
                }
            }
        });
    }
};

/**
 * Base class for all modifiers. (Conceptual)
 */
class BaseModifier {
    constructor(params) {
        this.type = 'base';
        this.enabled = true;
        this.parameters = params;
    }
    initialize(object) { /* Override in child class */ }
    apply(object, currentTime) { /* Override in child class */ }
}


/**
 * The Shatter (Explosion) Modifier Class
 * Breaks an object into pieces and animates them flying outwards.
 */
class ShatterModifier extends BaseModifier {
    constructor(params = {}) {
        super(params);
        this.type = 'shatter';

        // Configurable parameters with defaults
        this.startTime = params.startTime ?? 0;
        this.duration = params.duration ?? 2.0;
        this.explosionForce = params.explosionForce ?? 10.0;
        this.gravity = params.gravity ?? -9.8;

        // Internal state
        this.originalMesh = null;
        this.debrisGroup = null; // A THREE.Group to hold all fractured pieces
        this.debrisData = []; // Stores { mesh, initialVelocity } for each piece
        this.isInitialized = false;
        this.hasExploded = false; // Flag to ensure setup runs only once per playback
    }

    /**
     * One-time setup: This fractures the mesh and prepares the pieces for animation.
     */
    initialize(object) {
        // We can only shatter meshes with geometry
        if (!object.isMesh || !object.geometry) {
            console.error("Shatter modifier can only be applied to a Mesh with geometry.");
            this.enabled = false;
            return;
        }
        this.originalMesh = object;

        // --- Step 1: Fracture the Geometry ---
        // This uses a simple placeholder. For real projects, you'd use a robust
        // Voronoi fracturing library.
        const pieces = this.fractureGeometry(this.originalMesh.geometry);
        if (pieces.length === 0) {
            console.error("Geometry fracturing failed or produced no pieces.");
            this.enabled = false;
            return;
        }
        
        // --- Step 2: Create a Group to hold the debris ---
        this.debrisGroup = new THREE.Group();
        // Match the debris group's transform to the original object
        this.originalMesh.getWorldPosition(this.debrisGroup.position);
        this.originalMesh.getWorldQuaternion(this.debrisGroup.quaternion);
        this.originalMesh.getWorldScale(this.debrisGroup.scale);
        
        // Find the center of the original object to calculate explosion direction
        const centroid = new THREE.Vector3();
        this.originalMesh.geometry.computeBoundingBox();
        this.originalMesh.geometry.boundingBox.getCenter(centroid);

        // --- Step 3: Create Meshes for Each Piece and Calculate Initial Velocity ---
        pieces.forEach(pieceGeo => {
            const pieceMesh = new THREE.Mesh(pieceGeo, this.originalMesh.material);
            this.debrisGroup.add(pieceMesh);

            // Calculate initial velocity: a vector from the object's center to the piece's center
            pieceGeo.computeBoundingBox();
            const pieceCenter = new THREE.Vector3();
            pieceGeo.boundingBox.getCenter(pieceCenter);
            
            const velocity = pieceCenter.clone().sub(centroid).normalize();
            // Add some randomness to the force for a more natural look
            velocity.multiplyScalar(this.explosionForce * (0.8 + Math.random() * 0.4));
            
            this.debrisData.push({ mesh: pieceMesh, velocity: velocity });
        });

        // Add the debris group to the scene, but keep it hidden until the explosion time.
        scene.add(this.debrisGroup);
        this.debrisGroup.visible = false;

        this.isInitialized = true;
        console.log(`Shatter modifier initialized for ${object.name} with ${pieces.length} pieces.`);
    }

    /**
     * This is the core animation logic, called every frame by the modifierManager.
     *
    apply(object, currentTime) {
        if (!this.isInitialized || !this.enabled) return;

        const endTime = this.startTime + this.duration;
        const inRange = currentTime >= this.startTime && currentTime <= endTime;
        
        if (inRange) {
            // This is the active period of the explosion
            if (!this.hasExploded) {
                // First frame of the explosion: hide original, show debris
                this.originalMesh.visible = false;
                this.debrisGroup.visible = true;
                this.hasExploded = true;
            }

            const elapsedTime = currentTime - this.startTime;

            // Update each piece's position using simple physics
            this.debrisData.forEach(item => {
                const { mesh, velocity } = item;
                // Position = (Initial Velocity * time) + (0.5 * gravity * time^2)
                const displacement = velocity.clone().multiplyScalar(elapsedTime);
                const gravityEffect = new THREE.Vector3(0, 0.5 * this.gravity * elapsedTime * elapsedTime, 0);
                
                mesh.position.copy(displacement).add(gravityEffect);
                // Optional: add some rotation
                mesh.rotation.x += velocity.x * 0.01;
                mesh.rotation.y += velocity.y * 0.01;
            });

        } else {
            // If the timeline is before or after the explosion, show the original object.
            // This is crucial for scrubbing the timeline back and forth.
            this.originalMesh.visible = true;
            this.debrisGroup.visible = false;
            if (this.hasExploded) {
                 this.hasExploded = false; // Reset for the next playback
            }
        }
    }*/ 

        /**
 * This is the core animation logic for the Shatter modifier, called every frame.
 * It controls the visibility of the original object vs. the debris, animates
 * the shattered pieces, and triggers external VFX systems like particle explosions.
 * @param {THREE.Object3D} object - The original object this modifier is attached to.
 * @param {number} currentTime - The current time on the main animation timeline.
 */
apply(object, currentTime) {
    // Exit early if the modifier hasn't been properly set up or is disabled.
    if (!this.isInitialized || !this.enabled) {
        return;
    }

    const endTime = this.startTime + this.duration;
    const inRange = currentTime >= this.startTime && currentTime <= endTime;

    if (inRange) {
        // --- This is the ACTIVE phase of the explosion ---

        // Check if this is the very first frame the explosion becomes active.
        if (!this.hasExploded) {
            // 1. Swap visibility: Hide the original object and show the debris.
            this.originalMesh.visible = false;
            if (this.debrisGroup) this.debrisGroup.visible = true;
            this.hasExploded = true; // Set flag to prevent this block from running again until reset.

            // 2. Trigger external VFX: Create the smoke and fire explosion.
            if (window.explosionManager && typeof window.explosionManager.triggerExplosion === 'function') {
                // Get the object's current world position to spawn the explosion correctly.
                const explosionPosition = new THREE.Vector3();
                this.originalMesh.getWorldPosition(explosionPosition);
                
                // Call your global explosion manager.
                window.explosionManager.triggerExplosion(
                    explosionPosition.x,
                    explosionPosition.y,
                    explosionPosition.z
                );
                
                console.log(`Shatter modifier triggered explosion at [${explosionPosition.x.toFixed(2)}, ${explosionPosition.y.toFixed(2)}, ${explosionPosition.z.toFixed(2)}]`);
            }
        }

        // 3. Animate the debris pieces on every frame the explosion is active.
        const elapsedTime = currentTime - this.startTime;

        // Update each piece's position using simple projectile motion physics.
        this.debrisData.forEach(item => {
            const { mesh, velocity } = item;
            
            // Position = (Initial Velocity * time) + (0.5 * gravity * time^2)
            const displacement = velocity.clone().multiplyScalar(elapsedTime);
            const gravityEffect = new THREE.Vector3(0, 0.5 * this.gravity * elapsedTime * elapsedTime, 0);
            
            mesh.position.copy(displacement).add(gravityEffect);
            
            // Optional: Add some continuous rotation to the pieces for more realism.
            mesh.rotation.x += velocity.z * 0.02 * elapsedTime;
            mesh.rotation.y += velocity.x * 0.02 * elapsedTime;
            mesh.rotation.z += velocity.y * 0.02 * elapsedTime;
        });

    } else {
        // --- This is the INACTIVE phase (before or after the explosion) ---
        
        // Ensure the original object is visible and the debris is hidden.
        // This is crucial for allowing the user to scrub the timeline back and forth.
        this.originalMesh.visible = true;
        if (this.debrisGroup) this.debrisGroup.visible = false;
        
        // If the timeline has been scrubbed backwards past the explosion start time,
        // reset the 'hasExploded' flag so it can be triggered again on the next forward playback.
        if (this.hasExploded) {
            this.hasExploded = false;
        }
    }
}

    /**
     * Placeholder for a geometry fracturing function.
     * @param {THREE.BufferGeometry} geometry - The geometry to shatter.
     * @returns {Array<THREE.BufferGeometry>} An array of shattered pieces.
     *
    fractureGeometry(geometry) {
        console.warn("Using placeholder geometry fracturing. For production, use a proper Voronoi or CSG library.");

        if (!geometry.attributes.position) return [];
        
        const pieces = [];
        const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
        const size = new THREE.Vector3();
        box.getSize(size);
        const halfSize = size.clone().multiplyScalar(0.5);

        // This simple example just splits a box into 8 smaller boxes.
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                for (let k = 0; k < 2; k++) {
                    const piece = new THREE.BoxGeometry(halfSize.x, halfSize.y, halfSize.z);
                    piece.translate(
                        (i - 0.5) * halfSize.x,
                        (j - 0.5) * halfSize.y,
                        (k - 0.5) * halfSize.z
                    );
                    pieces.push(piece);
                }
            }
        }
        return pieces;
    }*/ 
   /**
 * Fractures a geometry into realistic, rock-like shards using Voronoi diagrams.
 * This requires the 'three-bvh-csg' library.
 * @param {THREE.BufferGeometry} geometry - The geometry to shatter.
 * @returns {Array<THREE.BufferGeometry>} An array of shattered pieces.
 */
fractureGeometry(geometry) {
    if (typeof threebvhcsg === 'undefined') {
        console.error("The 'three-bvh-csg' library is not loaded. Falling back to simple cube fracturing.");
        // Fallback to the old simple cube fracturing
        const pieces = [];
        const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
        const size = new THREE.Vector3(); box.getSize(size);
        const halfSize = size.clone().multiplyScalar(0.5);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
            const piece = new THREE.BoxGeometry(halfSize.x, halfSize.y, halfSize.z);
            piece.translate((i - 0.5) * halfSize.x, (j - 0.5) * halfSize.y, (k - 0.5) * halfSize.z);
            pieces.push(piece);
        }
        return pieces;
    }

    console.log("Starting advanced Voronoi fracturing...");
    const pieces = [];
    const points = [];
    const boundingBox = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
    
    // --- Step 1: Scatter random points inside the object's bounding box ---
    const pointCount = 50; // More points = more, smaller pieces.
    for (let i = 0; i < pointCount; i++) {
        points.push(
            new THREE.Vector3(
                THREE.MathUtils.randFloat(boundingBox.min.x, boundingBox.max.x),
                THREE.MathUtils.randFloat(boundingBox.min.y, boundingBox.max.y),
                THREE.MathUtils.randFloat(boundingBox.min.z, boundingBox.max.z)
            )
        );
    }

    // --- Step 2: Create Voronoi cells ---
    // The Delaunay triangulation is the mathematical dual of the Voronoi diagram.
    // We can use it to find the planes that define each Voronoi cell.
    const delaunay = Delaunay.from(points.map(p => [p.x, p.y, p.z]));
    const voronoi = delaunay.voronoi([
        boundingBox.min.x, boundingBox.min.y, boundingBox.min.z,
        boundingBox.max.x, boundingBox.max.y, boundingBox.max.z
    ]);

    // --- Step 3: "Cut" the original geometry with each cell ---
    const originalMesh = new THREE.Mesh(geometry); // We need a mesh for the CSG operations
    const brush = new threebvhcsg.Brush(originalMesh.geometry);
    
    for (let i = 0; i < pointCount; i++) {
        try {
            // Get the geometry of a single Voronoi cell (it's a ConvexPolyhedronGeometry)
            const cellPolygon = voronoi.cellPolygon(i);
            if (!cellPolygon) continue;

            const cellPoints = cellPolygon.map(p => new THREE.Vector3(p[0], p[1], p[2]));
            const cellGeometry = new THREE.ConvexGeometry(cellPoints);
            const cellBrush = new threebvhcsg.Brush(cellGeometry);

            // Perform an INTERSECTION operation: the result is the part of the
            // original mesh that is *inside* the current Voronoi cell.
            const resultBrush = threebvhcsg.evaluate(brush, cellBrush, threebvhcsg.INTERSECTION);

            if (resultBrush.geometry.attributes.position.count > 0) {
                pieces.push(resultBrush.geometry);
            }
        } catch(e) {
            // The voronoi calculation can sometimes fail on edge cases. We just skip that piece.
            console.warn("Skipping a problematic Voronoi cell during fracture.", e);
        }
    }
    
    console.log(`Fracturing complete. Generated ${pieces.length} realistic shards.`);
    return pieces;
}
}

