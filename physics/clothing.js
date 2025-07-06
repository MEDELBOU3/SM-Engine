let physicsSimulator;
let physicsUI;

class PhysicsSimulator {
    constructor(scene) {
        this.scene = scene;
        this.physicsWorld = null;
        this.softBodyHelpers = null;
        this.clothBodies = new Map();
        this.rigidBodies = new Map();
        this.isReady = false;
    }

    _initializePhysicsWorld() {
        const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        const broadphase = new Ammo.btDbvtBroadphase();
        const solver = new Ammo.btSequentialImpulseConstraintSolver();
        const softBodySolver = new Ammo.btDefaultSoftBodySolver();

        this.physicsWorld = new Ammo.btSoftRigidDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration, softBodySolver);
        this.physicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));
        this.physicsWorld.getWorldInfo().set_m_gravity(new Ammo.btVector3(0, -9.81, 0));
        this.softBodyHelpers = new Ammo.btSoftBodyHelpers();
        this.isReady = true;
        console.log("✅ Physics world initialized.");
    }

    createCloth(options) {
        if (!this.isReady) return;
        const { width, height, segments, position, mass = 2, pinMode = 'corners' } = options;
        const clothGeo = new THREE.PlaneGeometry(width, height, segments, segments);
        clothGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
        clothGeo.translate(0, 0, 0); // Center the geometry

        const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, wireframe: false });
        const clothMesh = new THREE.Mesh(clothGeo, clothMat);
        clothMesh.name = "PhysicsCloth";
        clothMesh.position.copy(position);
        this.scene.add(clothMesh);

        const softBody = this.softBodyHelpers.CreateFromTriMesh(
            this.physicsWorld.getWorldInfo(),
            clothGeo.attributes.position.array,
            clothGeo.index.array,
            clothGeo.index.array.length / 3,
            true
        );

        const sbConfig = softBody.get_m_cfg();
        sbConfig.set_viterations(15);
        sbConfig.set_piterations(15);
        softBody.setTotalMass(mass, false);
        Ammo.castObject(softBody, Ammo.btCollisionObject).getCollisionShape().setMargin(0.05);

        if (pinMode === 'corners') {
            softBody.setMass(0, 0);
            softBody.setMass(segments, 0);
        } else if (pinMode === 'top-edge') {
            for (let i = 0; i <= segments; i++) { softBody.setMass(i, 0); }
        }

        this.physicsWorld.addSoftBody(softBody, 1, -1);
        clothMesh.userData.physicsBody = softBody;
        this.clothBodies.set(clothMesh.uuid, { mesh: clothMesh, body: softBody });
        return clothMesh;
    }

    addCollider(mesh) {
        if (!this.isReady || this.rigidBodies.has(mesh.uuid) || mesh.userData.physicsBody) return;
        const shape = this._createAmmoShapeFromThree(mesh);
        if (!shape) return;

        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(mesh.position.x, mesh.position.y, mesh.position.z));
        transform.setRotation(new Ammo.btQuaternion(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w));
        
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, shape, new Ammo.btVector3(0, 0, 0));
        const body = new Ammo.btRigidBody(rbInfo);
        
        this.physicsWorld.addRigidBody(body);
        mesh.userData.physicsBody = body;
        this.rigidBodies.set(mesh.uuid, { mesh, body });
    }

    removePhysics(mesh) {
        if (this.clothBodies.has(mesh.uuid)) {
            const clothData = this.clothBodies.get(mesh.uuid);
            this.physicsWorld.removeSoftBody(clothData.body);
            Ammo.destroy(clothData.body);
            this.clothBodies.delete(mesh.uuid);
            if(mesh.parent) mesh.parent.remove(mesh);
            return;
        }
        if (this.rigidBodies.has(mesh.uuid)) {
            const rigidData = this.rigidBodies.get(mesh.uuid);
            this.physicsWorld.removeRigidBody(rigidData.body);
            Ammo.destroy(rigidData.body);
            this.rigidBodies.delete(mesh.uuid);
        }
        delete mesh.userData.physicsBody;
    }

    _createAmmoShapeFromThree(mesh) {
        mesh.geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        mesh.geometry.boundingBox.getSize(size).multiply(mesh.scale);
        
        if (mesh.geometry.type === "SphereGeometry") {
            return new Ammo.btSphereShape(size.x / 2);
        }
        if (mesh.geometry.type === "BoxGeometry" || mesh.geometry.type === "PlaneGeometry") {
            return new Ammo.btBoxShape(new Ammo.btVector3(size.x / 2, Math.max(0.01, size.y / 2), size.z / 2));
        }
        
        console.warn("Using ConvexHullShape as fallback for complex geometry:", mesh.name);
        const hull = new Ammo.btConvexHullShape();
        const vec = new Ammo.btVector3(0,0,0);
        const pos = mesh.geometry.attributes.position;
        for(let i = 0; i < pos.count; i++) {
            vec.setValue(pos.getX(i) * mesh.scale.x, pos.getY(i) * mesh.scale.y, pos.getZ(i) * mesh.scale.z);
            hull.addPoint(vec, true);
        }
        return hull;
    }

    update(delta) {
        if (!this.isReady) return;
        this.physicsWorld.stepSimulation(delta, 10);

        for (const [uuid, clothData] of this.clothBodies) {
            const softBody = clothData.body;
            const clothPositions = clothData.mesh.geometry.attributes.position;
            const nodes = softBody.get_m_nodes();
            for (let i = 0; i < nodes.size(); i++) {
                const node = nodes.at(i);
                const nodePos = node.get_m_x();
                clothPositions.setXYZ(i, nodePos.x(), nodePos.y(), nodePos.z());
            }
            clothPositions.needsUpdate = true;
            clothData.mesh.geometry.computeVertexNormals();
        }
    }
}

// --- RENAMED UI CONTROLLER CLASS ---
class PhysicsUIController {
    constructor(simulator) {
        this.panel = document.getElementById('physics-clothing-panel');
        if (!this.panel) {
            console.error('PhysicsUIController Error: Panel with ID "physics-clothing-panel" not found.');
            return;
        }
        this.simulator = simulator;
        this.selectedObject = null;
        
        // Find UI elements now that they are in the HTML
        this.widthSlider = document.getElementById('cloth-width-slider');
        this.heightSlider = document.getElementById('cloth-height-slider');
        this.segmentsSlider = document.getElementById('cloth-segments-slider');
        this.widthVal = document.getElementById('cloth-width-val');
        this.heightVal = document.getElementById('cloth-height-val');
        this.segmentsVal = document.getElementById('cloth-segments-val');
        this.drapeBtn = document.getElementById('drape-cloth-btn');
        this.colliderBtn = document.getElementById('make-collider-btn');
        this.removeBtn = document.getElementById('remove-physics-btn');
        this.statusText = document.getElementById('physics-status-text');

        this._bindEvents();
        this.disableControls("Loading Physics Engine...");
    }

    _bindEvents() {
        this.widthSlider.oninput = () => this.widthVal.textContent = this.widthSlider.value;
        this.heightSlider.oninput = () => this.heightVal.textContent = this.heightSlider.value;
        this.segmentsSlider.oninput = () => this.segmentsVal.textContent = this.segmentsSlider.value;
        this.drapeBtn.onclick = () => this.handleDrape();
        this.colliderBtn.onclick = () => this.handleMakeCollider();
        this.removeBtn.onclick = () => this.handleRemovePhysics();
    }

    enableControls() {
        if (!this.panel) return;
        this.panel.style.display = 'block';
        this.updateForSelection(null);
    }
    
    disableControls(message) {
        if (this.statusText) this.statusText.textContent = message;
        if (this.drapeBtn) this.drapeBtn.disabled = true;
        if (this.colliderBtn) this.colliderBtn.disabled = true;
        if (this.removeBtn) this.removeBtn.disabled = true;
    }
    
    updateForSelection(selectedObject) {
        this.selectedObject = selectedObject;
        if (!this.simulator.isReady) return;

        if (!selectedObject) {
            this.statusText.textContent = "Select an object to interact";
            this.drapeBtn.disabled = true; this.colliderBtn.disabled = true; this.removeBtn.disabled = true;
        } else {
            this.statusText.textContent = `Selected: ${selectedObject.name}`;
            const hasPhysics = !!selectedObject.userData.physicsBody;
            this.drapeBtn.disabled = false; this.colliderBtn.disabled = hasPhysics; this.removeBtn.disabled = !hasPhysics;
        }
    }
    
    handleDrape() {
        if (!this.selectedObject) { alert("Please select an object first."); return; }
        
        if (!this.simulator.rigidBodies.has(this.selectedObject.uuid)) {
            this.simulator.addCollider(this.selectedObject);
            this.updateForSelection(this.selectedObject);
        }
        
        const box = new THREE.Box3().setFromObject(this.selectedObject);
        const center = new THREE.Vector3(); box.getCenter(center);
        const position = new THREE.Vector3(center.x, box.max.y + 2, center.z);
        
        this.simulator.createCloth({
            width: parseFloat(this.widthSlider.value),
            height: parseFloat(this.heightSlider.value),
            segments: parseInt(this.segmentsSlider.value),
            position
        });
    }

    handleMakeCollider() { if (!this.selectedObject) return; this.simulator.addCollider(this.selectedObject); this.updateForSelection(this.selectedObject); }
    handleRemovePhysics() { if (!this.selectedObject) return; this.simulator.removePhysics(this.selectedObject); this.updateForSelection(this.selectedObject); }
}

// =======================================================================
// PART 3: INTEGRATION INTO YOUR MAIN EDITOR SCRIPT
// =======================================================================

// --- RENAMED MAIN INITIALIZATION FUNCTION ---
function initializePhysicsSystem() {
    if (typeof Ammo === 'function') {
        Ammo().then((AmmoLib) => {
            window.Ammo = AmmoLib;
            physicsSimulator = new PhysicsSimulator(scene);
            physicsSimulator._initializePhysicsWorld();
            
            physicsUI = new PhysicsUIController(physicsSimulator);
            physicsUI.enableControls();

            if (window.transformControls) {
                transformControls.addEventListener('objectChange', () => {
                    if (physicsUI) {
                        physicsUI.updateForSelection(transformControls.object);
                    }
                });
            }
        }).catch(e => console.error("Error loading Ammo.js:", e));
    } else {
        console.warn("Ammo.js not ready, retrying...");
        setTimeout(initializePhysicsSystem, 500);
    }
}