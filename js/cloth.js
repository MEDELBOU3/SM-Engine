// Helper class for spatial partitioning
class SpatialHashGrid {
    constructor(cellSize = 2.0) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }

    hashPosition(pos) {
        return `${Math.floor(pos.x/this.cellSize)},${Math.floor(pos.y/this.cellSize)},${Math.floor(pos.z/this.cellSize)}`;
    }

    insertParticle(particle) {
        const hash = this.hashPosition(particle.position);
        if (!this.grid.has(hash)) this.grid.set(hash, new Set());
        this.grid.get(hash).add(particle);
    }

    queryRadius(position, radius) {
        const results = [];
        const cells = Math.ceil(radius / this.cellSize);
        const baseHash = this.hashPosition(position);
        
        // Implementation for radius query
        // ... (detailed spatial query logic)
        return results;
    }

    clear() {
        this.grid.clear();
    }
}

class ClothSystem {
    constructor(physicsManager) {
        this.physicsManager = physicsManager;
        this.clothBodies = new Map();
        this.particleSegments = 30;
        this.clothSize = 10;
        this.particleMass = 0.05;
        this.clothStiffness = 250;
        this.clothDamping = 0.2;
        this.collisionIterations = 3;
        this.selfCollision = true;
        this.spatialHash = new SpatialHashGrid(0.3);
        this.debugMode = false;
        this.constraintLines = new THREE.Group();

        // Advanced parameters
        this.bendingStiffness = 0.5;
        this.compression = 0;
        this.stretchLimit = 1.2;
        this.pressureStiffness = 0.1;
        this.windForce = new THREE.Vector3(0, 0, 2);
        this.windVariation = 0.5;

        // Initialize debug visualization
        scene.add(this.constraintLines);
    }

    createClothForObject(object) {
        if (!object?.geometry) {
            console.error('Invalid object for cloth creation');
            return null;
        }

        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z);

        // Create LOD mesh
        const clothMesh = this.createClothLODs(maxDimension);
        clothMesh.position.copy(object.position);
        clothMesh.position.y += size.y + maxDimension * 0.5;

        // Particle system initialization
        const particles = [];
        const positions = clothMesh.geometry.attributes.position.array;
        
        // Particle creation with enhanced collision
        for (let i = 0; i < positions.length; i += 3) {
            const particle = new CANNON.Body({
                mass: this.particleMass,
                position: new CANNON.Vec3(
                    positions[i] + clothMesh.position.x,
                    positions[i + 1] + clothMesh.position.y,
                    positions[i + 2] + clothMesh.position.z
                ),
                shape: new CANNON.Sphere(0.05),
                material: new CANNON.Material({ friction: 0.3, restitution: 0.1 })
            });
            
            particle.linearDamping = this.clothDamping;
            this.physicsManager.world.addBody(particle);
            particles.push(particle);
        }

        // Advanced constraint system
        const constraints = this.createConstraints(particles, maxDimension);
        this.setupObjectCollisions(object, particles);
        this.setupMaterial(object, clothMesh);

        // Store cloth data
        this.clothBodies.set(object, {
            mesh: clothMesh,
            particles: particles,
            constraints: constraints,
            originalGeometry: clothMesh.geometry.clone(),
            properties: {
                stretchLimit: this.stretchLimit,
                pressureStiffness: this.pressureStiffness
            }
        });

        scene.add(clothMesh);
        return clothMesh;
    }

    createConstraints(particles, maxDimension) {
        const constraints = [];
        const dist = maxDimension * 1.5 / (this.particleSegments - 1);

        // Structural constraints
        for (let i = 0; i < this.particleSegments; i++) {
            for (let j = 0; j < this.particleSegments; j++) {
                const idx = i * this.particleSegments + j;
                
                // Horizontal
                if (j < this.particleSegments - 1) {
                    this.createConstraint(particles[idx], particles[idx + 1], dist);
                }

                // Vertical
                if (i < this.particleSegments - 1) {
                    this.createConstraint(particles[idx], particles[idx + this.particleSegments], dist);
                }

                // Diagonal (shear)
                if (i < this.particleSegments - 1 && j < this.particleSegments - 1) {
                    this.createConstraint(
                        particles[idx],
                        particles[idx + this.particleSegments + 1],
                        dist * Math.sqrt(2)
                    );
                }
            }
        }

        // Bending constraints
        for (let i = 0; i < this.particleSegments - 2; i++) {
            for (let j = 0; j < this.particleSegments - 2; j++) {
                const idx = i * this.particleSegments + j;
                this.createConstraint(
                    particles[idx],
                    particles[idx + 2],
                    dist * 2,
                    this.bendingStiffness
                );
            }
        }

        return constraints;
    }

    createConstraint(bodyA, bodyB, distance, stiffnessMultiplier = 1) {
        const constraint = new CANNON.DistanceConstraint(
            bodyA,
            bodyB,
            distance,
            this.clothStiffness * stiffnessMultiplier
        );
        constraint.collideConnected = true;
        constraint.maxStress = 500; // Breakable constraints
        constraint.onBreak = () => this.handleConstraintBreak(constraint);
        this.physicsManager.world.addConstraint(constraint);
        return constraint;
    }

    handleConstraintBreak(constraint) {
        this.physicsManager.world.removeConstraint(constraint);
        const clothData = Array.from(this.clothBodies.values()).find(data => 
            data.constraints.includes(constraint)
        );
        if (clothData) {
            clothData.constraints = clothData.constraints.filter(c => c !== constraint);
        }
    }

    setupMaterial(object, clothMesh) {
        const textureLoader = new THREE.TextureLoader();
        const clothMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xaaaaaa,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
            metalness: 0.1,
            roughness: 0.8,
            map: textureLoader.load('fabric_diffuse.jpg'),
            normalMap: textureLoader.load('fabric_normal.jpg'),
            displacementMap: textureLoader.load('fabric_displacement.jpg'),
            displacementScale: 0.01,
            onBeforeCompile: (shader) => {
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `vec3 transformed = position + normal * abs(sin(time)) * 0.02;`
                );
            }
        });

        clothMesh.material = clothMaterial;
    }

    updateCloth() {
        this.spatialHash.clear();
        
        this.clothBodies.forEach((clothData, object) => {
            const { mesh, particles, constraints } = clothData;
            const positions = mesh.geometry.attributes.position.array;

            // Update spatial hash
            particles.forEach(particle => this.spatialHash.insertParticle(particle));

            // Wind forces
            particles.forEach(particle => {
                const wind = new CANNON.Vec3(
                    this.windForce.x + (Math.random() - 0.5) * this.windVariation,
                    this.windForce.y + (Math.random() - 0.5) * this.windVariation,
                    this.windForce.z + (Math.random() - 0.5) * this.windVariation
                ).scale(particle.mass);
                particle.applyForce(wind);
            });

            // Collision resolution
            for (let iter = 0; iter < this.collisionIterations; iter++) {
                particles.forEach((particle, i) => {
                    if (this.selfCollision) {
                        const neighbors = this.spatialHash.queryRadius(particle.position, 0.3);
                        neighbors.forEach(other => {
                            if (particle !== other) this.resolveParticleCollision(particle, other);
                        });
                    }

                    // Update mesh vertices
                    positions[i * 3] = particle.position.x - mesh.position.x;
                    positions[i * 3 + 1] = particle.position.y - mesh.position.y;
                    positions[i * 3 + 2] = particle.position.z - mesh.position.z;
                });
            }

            // Geometry updates
            mesh.geometry.attributes.position.needsUpdate = true;
            mesh.geometry.computeVertexNormals();

            // LOD handling
            if (mesh.geometry.attributes.position.count > 500 && 
                camera.position.distanceTo(mesh.position) > 100) {
                this.simplifyGeometry(mesh.geometry);
            }

            // Debug visualization
            if (this.debugMode) this.updateDebugVisualization(clothData);
        });
    }

    resolveParticleCollision(a, b) {
        const delta = new CANNON.Vec3().copy(a.position).vsub(b.position);
        const distance = delta.length();
        if (distance < 0.1) {
            const force = delta.scale(0.5 / distance);
            a.applyForce(force);
            b.applyForce(force.negate());
        }
    }

    createClothLODs(maxDimension) {
        const lod = new THREE.LOD();
        
        const createLODLevel = (segments) => {
            const geometry = new THREE.PlaneGeometry(
                maxDimension * 1.5, 
                maxDimension * 1.5, 
                segments, 
                segments
            );
            return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        };

        lod.addLevel(createLODLevel(30), 50);
        lod.addLevel(createLODLevel(15), 100);
        lod.addLevel(createLODLevel(8), 150);
        
        return lod;
    }

    simplifyGeometry(geometry) {
        const simplified = geometry.clone();
        // Geometry simplification logic
        return simplified;
    }

    updateDebugVisualization(clothData) {
        // Update constraint lines
        this.constraintLines.children.forEach(line => line.visible = false);
        
        clothData.constraints.forEach((constraint, i) => {
            if (!this.constraintLines.children[i]) {
                this.constraintLines.add(this.createConstraintVisualization(constraint));
            }
            const line = this.constraintLines.children[i];
            line.visible = true;
            line.geometry.setFromPoints([
                new THREE.Vector3().copy(constraint.bodyA.position),
                new THREE.Vector3().copy(constraint.bodyB.position)
            ]);
        });
    }

    createConstraintVisualization(constraint) {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        return new THREE.Line(geometry, material);
    }

    toggleDebugMode(enable) {
        this.debugMode = enable;
        this.clothBodies.forEach(clothData => {
            clothData.mesh.visible = !enable;
            clothData.particles.forEach(particle => {
                if (enable && !particle.debugMesh) {
                    particle.debugMesh = this.createDebugSphere();
                    scene.add(particle.debugMesh);
                }
                if (particle.debugMesh) particle.debugMesh.visible = enable;
            });
        });
    }

    createDebugSphere() {
        return new THREE.Mesh(
            new THREE.SphereGeometry(0.1),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
    }

    async precomputeDraping(object, steps = 300) {
        const clothData = this.clothBodies.get(object);
        if (!clothData) return;

        for (let i = 0; i < steps; i++) {
            this.physicsManager.world.step(1/60);
            await new Promise(r => requestAnimationFrame(r));
        }
        this.freezeEdgeParticles(clothData);
    }

    freezeEdgeParticles(clothData) {
        clothData.particles.forEach((particle, i) => {
            if (i % this.particleSegments === 0 || 
                i % this.particleSegments === this.particleSegments - 1) {
                particle.mass = 0;
                particle.updateMassProperties();
            }
        });
    }

    removeClothFromObject(object) {
        const clothData = this.clothBodies.get(object);
        if (!clothData) return;

        // Physics cleanup
        clothData.particles.forEach(particle => {
            this.physicsManager.world.removeBody(particle);
            if (particle.debugMesh) scene.remove(particle.debugMesh);
        });
        clothData.constraints.forEach(constraint => {
            this.physicsManager.world.removeConstraint(constraint);
        });

        // Graphics cleanup
        clothData.mesh.geometry.dispose();
        clothData.mesh.material.dispose();
        scene.remove(clothData.mesh);
        this.clothBodies.delete(object);
    }

    // Enhanced setters with validation
    setClothStiffness(value) {
        if (typeof value !== 'number' || value < 0 || value > 1000) {
            console.error('Invalid stiffness value');
            return;
        }
        this.clothStiffness = value;
        this.clothBodies.forEach(clothData => {
            clothData.constraints.forEach(c => c.stiffness = value);
        });
    }

    setWindForce(x, y, z) {
        this.windForce.set(x, y, z);
    }
}


await clothSystem.precomputeDraping(targetObject);

// Create cloth with pre-draping
const clothObject = clothSystem.createClothForObject(targetObject);


// Enable debug mode
clothSystem.toggleDebugMode(true);

// Add wind
clothSystem.setWindForce(5, 0, 12);

const clothSystem = new ClothSystem(physicsManager);
physicsManager.clothSystem = clothSystem;
           



