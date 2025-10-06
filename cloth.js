
class PhysicsUI {
    constructor(physicsSystem, containerId) {
        this.system = physicsSystem;
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`UI container #${containerId} not found.`);
        this.elements = {};
        // Unique IDs for effects so we can toggle them
        this._windId = null;
        this._buoyancyId = null;
    }

    create() {
    const contentArea = this.container.querySelector('.physics-content');
    if (!contentArea) { 
        console.error("'.physics-content' not found."); 
        return; 
    }
    contentArea.innerHTML = '';

    const build = (parent) => ({ 
        add: (el) => { parent.appendChild(el); return build(parent); } 
    });

    // --- World Controls ---
    build(contentArea)
        .add(this.createToggle('Run Simulation', 'physics-toggle-sim', false, e => this.system.toggleSimulation(e.target.checked)))
        .add(this.createSlider('Gravity Y', 'physics-gravity', { min:-30, max:0, step:0.1, value:0 }, e => this.system.setGravity(e.target.valueAsNumber)))
        .add(this.createElement('div', { className: 'divider' }));
    
    // --- Effects Controls ---
    const fxHeader = this.createElement('h4', { textContent: 'World Effects' });
    fxHeader.style.marginBottom = '10px';
    contentArea.appendChild(fxHeader);
    
    build(contentArea)
        .add(this.createSlider('Explosion Radius', 'physics-explosion-radius', { min:1, max:50, step:1, value:10 }))
        .add(this.createSlider('Explosion Strength', 'physics-explosion-strength', { min:10, max:1000, step:10, value:150 }))
        .add(this.createButton('Explode from Selected', 'physics-explosion-btn', ['fas', 'fa-bomb'], this.onExplodeClick.bind(this)))
        .add(this.createElement('div', { className: 'divider-short' }))
        .add(this.createSlider('Wind X', 'physics-wind-x', { min:-50, max:50, step:1, value:15 }))
        .add(this.createSlider('Wind Y', 'physics-wind-y', { min:-50, max:50, step:1, value:0 }))
        .add(this.createSlider('Wind Z', 'physics-wind-z', { min:-50, max:50, step:1, value:0 }))
        .add(this.createButton('Toggle Wind Field', 'physics-wind-btn', ['fas', 'fa-wind'], this.onWindToggleClick.bind(this)))
        .add(this.createElement('div', { className: 'divider-short' }))
        .add(this.createSlider('Water Level Y', 'physics-buoy-level', { min:-10, max:10, step:0.5, value:-2 }))
        .add(this.createSlider('Buoyancy Density', 'physics-buoy-density', { min:0.1, max:3.0, step:0.1, value:1.2 }))
        .add(this.createSlider('Water Viscosity', 'physics-buoy-viscosity', { min:0, max:10, step:0.1, value:1.0 }))
        .add(this.createButton('Toggle Water Volume', 'physics-buoy-btn', ['fas', 'fa-water'], this.onBuoyancyToggleClick.bind(this)));

    // --- Object Panel ---
    const objectPanel = this.createElement('div', { id: 'physics-object-panel', className: 'object-panel-hidden' });
    this.elements.objectPanel = objectPanel; // ✅ fixed

    build(objectPanel)
        .add(this.createElement('div', { className: 'divider' }))
        .add(this.elements.selectedObjectName = this.createElement('h4', { id: 'physics-selected-name', textContent: 'Select an Object' }));
    
    const addPanel = objectPanel.appendChild(this.createElement('div', { id: 'physics-add-panel' }));
    addPanel.appendChild(this.createButton('Enable Physics & Drop', 'physics-add-btn', ['fas', 'fa-plus-circle'], () => this.system.enablePhysicsForSelection(), ['primary-button']));

    const editPanel = objectPanel.appendChild(this.createElement('div', { id: 'physics-edit-panel' }));
    const onPropChange = () => this.system.updateSelectedObjectProperties();
    
    build(editPanel)
        .add(this.createSelect('Body Type', 'physics-body-type', [{v: 'dynamic', t: 'Dynamic'}, {v: 'static', t: 'Static'}], onPropChange))
        .add(this.createSelect('Shape Type', 'physics-shape-type', [{v: 'box', t: 'Box'}, {v: 'sphere', t: 'Sphere'}, {v: 'cylinder', t: 'Cylinder'}], onPropChange))
        .add(this.createSlider('Mass', 'physics-mass', { min:0.1, max:100, step:0.1, value:1 }, onPropChange))
        .add(this.createSlider('Friction', 'physics-friction', { min:0, max:2, step:0.05, value:0.5 }, onPropChange))
        .add(this.createSlider('Bounciness', 'physics-restitution', { min:0, max:1.2, step:0.05, value:0.2 }, onPropChange))
        .add(this.createElement('div', { className: 'divider-short' }))
        .add(this.createCheckbox('Affected by Gravity', 'physics-flag-gravity', true, onPropChange))
        .add(this.createButton('Remove Physics', 'physics-remove-btn', ['fas', 'fa-trash-alt'], () => this.system.removePhysicsFromSelection(), ['danger-button']));
        
    contentArea.appendChild(objectPanel);
    this.update(null);
}

    
    // --- Event Handlers for Effects ---
    onExplodeClick() {
        const origin = this.system.selectedObject ? this.system.selectedObject.position.clone() : new THREE.Vector3(0, 2, 0);
        const radius = this.getInputValue('physics-explosion-radius');
        const strength = this.getInputValue('physics-explosion-strength');
        this.system.applyExplosion(origin, radius, strength);
    }
    
    onWindToggleClick() {
        const btn = this.elements['physics-wind-btn'];
        if (this._windId) {
            this.system.removeForceField(this._windId);
            this._windId = null;
            btn.classList.remove('active');
            btn.innerHTML = `<i class="fas fa-wind"></i> Toggle Wind Field`;
        } else {
            const id = `wind_field_${Date.now()}`;
            const x = this.getInputValue('physics-wind-x');
            const y = this.getInputValue('physics-wind-y');
            const z = this.getInputValue('physics-wind-z');
            this.system.createForceField(id, (pos, delta) => new THREE.Vector3(x, y, z));
            this._windId = id;
            btn.classList.add('active');
            btn.innerHTML = `<i class="fas fa-wind"></i> Stop Wind`;
        }
    }
    
    onBuoyancyToggleClick() {
        const btn = this.elements['physics-buoy-btn'];
        if (this._buoyancyId) {
            this.system.removeBuoyancyVolume(this._buoyancyId);
            this._buoyancyId = null;
            btn.classList.remove('active');
            btn.innerHTML = `<i class="fas fa-water"></i> Toggle Water Volume`;
        } else {
            const id = `buoyancy_vol_${Date.now()}`;
            const waterLevel = this.getInputValue('physics-buoy-level');
            const density = this.getInputValue('physics-buoy-density');
            const viscosity = this.getInputValue('physics-buoy-viscosity');
            const bounds = {
                min: new THREE.Vector3(-1000, -1000, -1000), // Very large area
                max: new THREE.Vector3(1000, waterLevel, 1000)
            };
            this.system.createBuoyancyVolume(id, bounds, density, viscosity);
            this._buoyancyId = id;
            btn.classList.add('active');
            btn.innerHTML = `<i class="fas fa-water"></i> Remove Water`;
        }
    }

    // --- UI Update & Helpers ---
    update(selectedObject) {
        const objectPanel = this.elements.objectPanel || document.getElementById('physics-object-panel'); 
        if (!objectPanel) return; 
        if (!selectedObject) { 
            objectPanel.classList.add('object-panel-hidden'); 
            return; 
        } 
        objectPanel.classList.remove('object-panel-hidden'); 
        this.elements.selectedObjectName.textContent = selectedObject.name || 'Unnamed Object'; 
        const props = selectedObject.userData.physics; 
        const addPanel = document.getElementById('physics-add-panel'); 
        const editPanel = document.getElementById('physics-edit-panel'); 
        if (props) { 
            addPanel.style.display = 'none'; 
            editPanel.style.display = 'block'; 
            this.setInputValue('physics-body-type', props.mass === 0 ? 'static' : 'dynamic'); 
            this.setInputValue('physics-shape-type', props.shapeType || 'box');
            this.setInputValue('physics-mass', props.mass); 
            this.setInputValue('physics-friction', props.friction); 
            this.setInputValue('physics-restitution', props.restitution); 
            this.setInputValue('physics-flag-gravity', props.flags.enableGravity); 
            this.elements['physics-mass'].disabled = (props.mass === 0); 
        } else { 
            addPanel.style.display = 'block'; 
            editPanel.style.display = 'none'; 
        }
    }
    setSimulationToggle(isRunning) { if(this.elements['physics-toggle-sim']) this.elements['physics-toggle-sim'].checked = isRunning; }
    getInputValue(id) { const el = this.elements[id]; if (!el) return null; if (el.type === 'checkbox') return el.checked; if (el.type === 'range' || el.type === 'number') return el.valueAsNumber; return el.value; }
    setInputValue(id, value) { const element = this.elements[id]; if (!element) return; if (element.type === 'checkbox' || element.type === 'radio') { element.checked = value; } else { element.value = value; } const valueDisplay = this.elements[`${id}-value`]; if (valueDisplay) valueDisplay.textContent = typeof value === 'number' ? value.toFixed(2) : value; }
    createElement(tag, options={}) { const element = document.createElement(tag); for (const [key, value] of Object.entries(options)) { if (key === 'className' && Array.isArray(value)) element.classList.add(...value); else element[key] = value; } return element; }
    createSlider(labelText, id, {min, max, step, value}, onChange) { const group = this.createElement('div', { className: 'control-group' }); group.appendChild(this.createElement('label', { htmlFor: id, textContent: labelText })); const row = group.appendChild(this.createElement('div', { className: 'input-row' })); const slider = row.appendChild(this.createElement('input', { id, type: 'range', min, max, step, value })); const valueSpan = row.appendChild(this.createElement('span', { id: `${id}-value`, textContent: Number(value).toFixed(2) })); slider.addEventListener('input', (e) => { valueSpan.textContent = e.target.valueAsNumber.toFixed(2); if(onChange) onChange(e); }); this.elements[id] = slider; this.elements[`${id}-value`] = valueSpan; return group; }
    createToggle(labelText, id, checked, onChange) { const group = this.createElement('div', { className: 'physics-header' }); group.appendChild(this.createElement('label', { htmlFor: id, textContent: labelText })); const switchLabel = group.appendChild(this.createElement('label', { className: 'switch'})); const input = switchLabel.appendChild(this.createElement('input', { id, type: 'checkbox', checked})); switchLabel.appendChild(this.createElement('span', {className: 'slider'})); input.addEventListener('change', onChange); this.elements[id] = input; return group; }
    createCheckbox(labelText, id, checked, onChange) { const group = this.createElement('div', { className: 'control-group-toggle' }); const label = group.appendChild(this.createElement('label', { className: 'checkbox-label' })); label.appendChild(document.createTextNode(labelText)); const input = label.appendChild(this.createElement('input', {id, type: 'checkbox', checked })); label.appendChild(this.createElement('span', { className: 'checkmark' })); input.addEventListener('change', onChange); this.elements[id] = input; return group; }
    createSelect(labelText, id, options, onChange) { const group = this.createElement('div', { className: 'control-group' }); group.appendChild(this.createElement('label', { htmlFor: id, textContent: labelText })); const select = group.appendChild(this.createElement('select', { id })); options.forEach(opt => select.appendChild(this.createElement('option', { value: opt.v, textContent: opt.t }))); select.addEventListener('change', onChange); this.elements[id] = select; return group; }
    createButton(labelText, id, iconClasses = [], onClick, buttonClasses = []) { const button = this.createElement('button', { id, className: ['wide-button', ...buttonClasses]}); const icon = this.createElement('i', { className: iconClasses }); button.appendChild(icon); button.appendChild(document.createTextNode(` ${labelText}`)); button.addEventListener('click', onClick); this.elements[id] = button; return button; }
}

// js/PhysicsSystem.js - Improved Version with Advanced Effects

class PhysicsSystem {
    constructor(scene) {
        this.scene = scene;
        this.debugMode = false;
        this.ammo = null;
        this.ui = null;
        this.physicsWorld = null;

        // --- State Management ---
        this.isReady = false;
        this.simulationRunning = false;
        this.selectedObject = null;
        this.meshToBodyMap = new Map();
        
        // --- System Components ---
        this.physicsGround = null;
        this.forceFields = new Map();
        this.buoyancyVolumes = new Map();
    }

     setDebugMode(enabled) {
        this.debugMode = enabled;
        // Logic to show/hide physics debug visuals
        console.log("Physics Debug Mode:", enabled);
    }
    static COLLISION_GROUPS = { DEFAULT: 1, GROUND: 2, ALL: -1 };

    async init(uiContainerId) {
        try {
            this.ammo = await Ammo();
            const config = new this.ammo.btDefaultCollisionConfiguration();
            const dispatcher = new this.ammo.btCollisionDispatcher(config);
            const broadphase = new this.ammo.btDbvtBroadphase();
            const solver = new this.ammo.btSequentialImpulseConstraintSolver();
            this.physicsWorld = new this.ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, config);
            this.physicsWorld.setGravity(new this.ammo.btVector3(0, 0, 0));
            
            this.ui = new PhysicsUI(this, uiContainerId);
            this.ui.create();

            this.isReady = true;
            console.log("✅ Advanced Physics Sandbox System Ready.");
        } catch (error) { console.error("❌ Physics System initialization failed:", error); throw error; }
    }

    // --- Interactive Workflow & UI Callbacks ---

    enablePhysicsForSelection() {
        if (!this.selectedObject) { alert("Please select an object first!"); return; }
        this.createPhysicsGroundIfNotExists();
        const defaultProps = {
            mass: 1.0, shapeType: 'box', friction: 0.5, restitution: 0.1,
            collisionGroup: PhysicsSystem.COLLISION_GROUPS.DEFAULT,
            collisionMask: PhysicsSystem.COLLISION_GROUPS.ALL,
            flags: { enableGravity: true }
        };
        this.addBody(this.selectedObject, defaultProps);
        this.setGravity(-9.81);
        this.ui.setInputValue('physics-gravity', -9.81);
        this.toggleSimulation(true);
        this.ui.setSimulationToggle(true);
    }
    
    toggleSimulation(isRunning) { this.simulationRunning = isRunning; }
    setGravity(y) { this.physicsWorld.setGravity(new this.ammo.btVector3(0, y, 0)); }
    setSelectedObject(object) { this.selectedObject = object; this.ui.update(object); }
    removePhysicsFromSelection() { if (this.selectedObject) this.removeBody(this.selectedObject); }
    
    updateSelectedObjectProperties() {
        if (!this.selectedObject || !this.meshToBodyMap.has(this.selectedObject)) return;
        const bodyType = this.ui.getInputValue('physics-body-type');
        const currentProps = this.selectedObject.userData.physics;
        const newProps = {
            mass: bodyType === 'static' ? 0 : this.ui.getInputValue('physics-mass'),
            shapeType: this.ui.getInputValue('physics-shape-type'),
            friction: this.ui.getInputValue('physics-friction'),
            restitution: this.ui.getInputValue('physics-restitution'),
            collisionGroup: currentProps.collisionGroup, collisionMask: currentProps.collisionMask,
            flags: { enableGravity: this.ui.getInputValue('physics-flag-gravity') }
        };
        this.addBody(this.selectedObject, newProps);
    }
    
    // --- Advanced Effects Methods ---

    applyExplosion(origin, radius, strength) {
        if (!this.simulationRunning) this.toggleSimulation(true);
        console.log(`BOOM! Applying explosion at (${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}, ${origin.z.toFixed(1)})`);

        const explosionOrigin = new this.ammo.btVector3(origin.x, origin.y, origin.z);

        for (const [mesh, body] of this.meshToBodyMap.entries()) {
            if (mesh.userData.physics.mass === 0) continue; // Only affect dynamic objects
            
            const bodyPos = body.getWorldTransform().getOrigin();
            const toBody = new this.ammo.btVector3(bodyPos.x() - explosionOrigin.x(), bodyPos.y() - explosionOrigin.y(), bodyPos.z() - explosionOrigin.z());
            
            const distance = toBody.length();
            if (distance > radius || distance === 0) { this.ammo.destroy(toBody); continue; }
            
            // Improved falloff: quadratic for more realistic blast (stronger close, weaker far)
            const falloff = 1 / (distance * distance);
            const impulseMagnitude = strength * falloff;
            
            toBody.normalize();
            toBody.op_mul(impulseMagnitude); // Scales the vector

            body.applyCentralImpulse(toBody);
            this.ammo.destroy(toBody);
        }
        this.ammo.destroy(explosionOrigin);
    }
    
    createForceField(id, fieldFunction) {
        console.log(`Creating force field with ID: ${id}`);
        this.forceFields.set(id, fieldFunction);
        if (!this.simulationRunning) this.toggleSimulation(true);
    }
    removeForceField(id) {
        console.log(`Removing force field with ID: ${id}`);
        this.forceFields.delete(id);
    }
    
    createBuoyancyVolume(id, bounds, density, viscosity) {
        console.log(`Creating buoyancy volume with ID: ${id}`);
        this.buoyancyVolumes.set(id, { bounds, density, viscosity });
        if (!this.simulationRunning) this.toggleSimulation(true);
    }
    removeBuoyancyVolume(id) {
        console.log(`Removing buoyancy volume with ID: ${id}`);
        this.buoyancyVolumes.delete(id);
    }
    
    // --- Main Update Loop ---
    
    update(delta) {
        if (!this.isReady || !this.simulationRunning) return;
        
        // Apply custom forces BEFORE stepping the simulation
        this.applyExtendedEffects(delta);
        
        this.physicsWorld.stepSimulation(delta, 10);
        
        // Sync visual objects AFTER stepping
        for (const [mesh, body] of this.meshToBodyMap.entries()) {
            if (mesh.userData.physics.mass > 0) {
                const motionState = body.getMotionState();
                if (motionState) {
                    const transform = new this.ammo.btTransform();
                    motionState.getWorldTransform(transform);
                    const pos = transform.getOrigin();
                    const quat = transform.getRotation();
                    mesh.position.set(pos.x(), pos.y(), pos.z());
                    mesh.quaternion.set(quat.x(), quat.y(), quat.z(), quat.w());
                }
            }
        }
    }
    
    applyExtendedEffects(delta) {
        if (this.forceFields.size === 0 && this.buoyancyVolumes.size === 0) return;
        
        const tempForce = new this.ammo.btVector3(0,0,0);
        for (const [mesh, body] of this.meshToBodyMap.entries()) {
            if (mesh.userData.physics.mass === 0) continue;
            const bodyPos = body.getWorldTransform().getOrigin();
            
            // Force Fields (e.g., Wind)
            for (const fieldFn of this.forceFields.values()) {
                const force = fieldFn(new THREE.Vector3(bodyPos.x(), bodyPos.y(), bodyPos.z()), delta);
                tempForce.setValue(force.x, force.y, force.z);
                body.applyCentralForce(tempForce);
            }
            
            // Buoyancy
            for (const vol of this.buoyancyVolumes.values()) {
                const props = mesh.userData.physics;
                const posY = bodyPos.y();
                const halfExtentY = props.halfExtentY || 1; // Fallback
                const volume = props.volume || 1; // Fallback
                const bottom = posY - halfExtentY;
                const top = posY + halfExtentY;
                let submergedRatio = 0;
                const waterLevel = vol.bounds.max.y;
                if (waterLevel > bottom) {
                    if (waterLevel < top) {
                        submergedRatio = (waterLevel - bottom) / (top - bottom);
                    } else {
                        submergedRatio = 1;
                    }
                }
                if (submergedRatio > 0) {
                    // Buoyancy force
                    const gravity = this.physicsWorld.getGravity();
                    const displacedVolume = volume * submergedRatio;
                    const buoyancyMagnitude = -gravity.y() * vol.density * displacedVolume; // Upward
                    tempForce.setValue(0, buoyancyMagnitude, 0);
                    body.applyCentralForce(tempForce);

                    // Viscous drag
                    const vel = body.getLinearVelocity();
                    const dragX = -vel.x() * vol.viscosity * submergedRatio;
                    const dragY = -vel.y() * vol.viscosity * submergedRatio;
                    const dragZ = -vel.z() * vol.viscosity * submergedRatio;
                    tempForce.setValue(dragX, dragY, dragZ);
                    body.applyCentralForce(tempForce);
                }
            }
        }
        this.ammo.destroy(tempForce);
    }

    // --- Body & Shape Management ---
    addBody(mesh, props) {
        if (this.meshToBodyMap.has(mesh)) this.removeBody(mesh);
        mesh.userData.physics = props;
        const shape = this.createShape(mesh);
        if (!shape) { console.error("Shape creation failed"); return; }
        
        const transform = new this.ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new this.ammo.btVector3(mesh.position.x, mesh.position.y, mesh.position.z));
        transform.setRotation(new this.ammo.btQuaternion(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w));

        const motionState = new this.ammo.btDefaultMotionState(transform);
        const localInertia = new this.ammo.btVector3(0, 0, 0);
        if (props.mass > 0) shape.calculateLocalInertia(props.mass, localInertia);
        
        const rbInfo = new this.ammo.btRigidBodyConstructionInfo(props.mass, motionState, shape, localInertia);
        const body = new this.ammo.btRigidBody(rbInfo);
        
        body.setFriction(props.friction);
        body.setRestitution(props.restitution);
        if (props.mass > 0) body.setActivationState(4);
        
        // This is important. If object shouldn't be affected by world gravity, we apply that here.
        if (props.flags.enableGravity === false) body.setGravity(new this.ammo.btVector3(0, 0, 0));
        
        this.physicsWorld.addRigidBody(body, props.collisionGroup, props.collisionMask);
        this.meshToBodyMap.set(mesh, body);
        this.ui.update(mesh);
    }
    
    removeBody(mesh) {
        const body = this.meshToBodyMap.get(mesh);
        if (body) { this.physicsWorld.removeRigidBody(body); this.ammo.destroy(body); this.meshToBodyMap.delete(mesh); }
        delete mesh.userData.physics;
        this.ui.update(mesh);
    }

    createPhysicsGroundIfNotExists() {
        if (this.physicsGround) return;
        const groundShape = new this.ammo.btStaticPlaneShape(new this.ammo.btVector3(0, 1, 0), 0);
        const transform = new this.ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new this.ammo.btVector3(0, 0, 0));
        const rbInfo = new this.ammo.btRigidBodyConstructionInfo(0, new this.ammo.btDefaultMotionState(transform), groundShape, new this.ammo.btVector3(0,0,0));
        this.physicsGround = new this.ammo.btRigidBody(rbInfo);
        this.physicsGround.setFriction(0.8);
        this.physicsGround.setRestitution(0.2);
        this.physicsWorld.addRigidBody(this.physicsGround, PhysicsSystem.COLLISION_GROUPS.GROUND, PhysicsSystem.COLLISION_GROUPS.DEFAULT);
    }
    
    createColliderMesh(sourceMesh) {
        const geom = sourceMesh.geometry.clone(); const mesh = new THREE.Mesh(geom);
        sourceMesh.updateWorldMatrix(true, true); mesh.matrix.copy(sourceMesh.matrixWorld);
        mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.geometry.applyMatrix4(mesh.matrix);
        mesh.position.set(0,0,0); mesh.quaternion.set(0,0,0,1); mesh.scale.set(1,1,1);
        mesh.updateMatrix(); return mesh;
    }
    
    createShape(mesh) {
        const props = mesh.userData.physics; if (!props) return null;
        const collider=this.createColliderMesh(mesh);
        let shape, volume, halfExtentY;
        switch(props.shapeType){
            case 'box':
                collider.geometry.computeBoundingBox();
                const size = collider.geometry.boundingBox.getSize(new THREE.Vector3());
                shape = new this.ammo.btBoxShape(new this.ammo.btVector3(size.x/2, size.y/2, size.z/2));
                volume = size.x * size.y * size.z;
                halfExtentY = size.y / 2;
                break;
            case 'sphere':
                collider.geometry.computeBoundingSphere();
                const radius = collider.geometry.boundingSphere.radius;
                shape = new this.ammo.btSphereShape(radius);
                volume = (4/3) * Math.PI * Math.pow(radius, 3);
                halfExtentY = radius;
                break;
            case 'cylinder':
                collider.geometry.computeBoundingBox();
                const cSize = collider.geometry.boundingBox.getSize(new THREE.Vector3());
                const cRadius = Math.max(cSize.x, cSize.z) / 2;
                const cHeight = cSize.y;
                shape = new this.ammo.btCylinderShape(new this.ammo.btVector3(cRadius, cHeight/2, cRadius));
                volume = Math.PI * Math.pow(cRadius, 2) * cHeight;
                halfExtentY = cHeight / 2;
                break;
            default:
                console.error("Unsupported shape type");
                collider.geometry.dispose();
                return null;
        }
        props.volume = volume;
        props.halfExtentY = halfExtentY;
        collider.geometry.dispose(); 
        return shape;
    }
}
