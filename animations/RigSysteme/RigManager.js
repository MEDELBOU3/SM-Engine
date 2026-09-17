/**
 * RigManager.js — Professional Edition v3
 * UE5 + Blender inspired Control Rig System for SM Engine
 *
 * New in v3:
 *  • Pose Library  (savePose / applyPose / deletePose)
 *  • FK/IK blend slider per chain
 *  • Custom control shapes  (circle · square · diamond · arrow · cross)
 *  • Bone Layers  (32 named layers, per-layer visibility)
 *  • Add-Bone mode  (click in viewport to parent a new bone)
 *  • Constraint visualisation  (stretch lines for Copy/LookAt constraints)
 *  • Mirror selection  (select symmetrical bones across X)
 *  • In-place bone rename
 *  • Fixed: setDisplayMode() cleared map before iterating
 *  • Fixed: update() skips bones without relationship entries
 */
class RigManager {
    constructor(scene, camera, renderer, transformControls) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.transformControls = transformControls;

        /* ── Core maps ─────────────────────────────────────────── */
        this.boneVisuals       = new Map();   // bone → { body, outline, joint, label }
        this.controls          = [];           // all interactive meshes for raycasting
        this.skeletonHelpers   = new Map();    // object.uuid → SkeletonHelper
        this.boneRelationships = new Map();    // bone → { parent, children, isLeaf, depth }
        this.boneGroups        = new Map();    // groupName → bone[]
        this.boneProperties    = new Map();    // bone → props object
        this.controlRigProfiles= new Map();    // object.uuid → profile
        // Rigs authored inside SM Engine can drive any Object3D, including
        // cars and hard-surface props that arrived with no skeleton at all.
        // The map keeps the generated root outside the driven object's tree,
        // preventing transform-parent cycles while preserving normal imports.
        this.generatedRigRoots = new Map();    // owner uuid → generated root bone
        this.parentBindings    = new Map();    // driven object uuid → binding metadata
        this.lastSelectedRigPart = null;
        // Human hand drivers. Each side owns a visible Fist_CTRL plus the
        // rest pose of its detected finger chains.
        this.handRigs = new Map();             // owner uuid → { left?, right? }

        /* ── Pose Library ────────────────────────────────────── */
        this.poseLibrary       = new Map();    // poseName → Map<bone.uuid, {pos,quat,scale}>
        this.restPose          = new Map();    // bone.uuid → {pos,quat,scale}  (auto-captured)

        /* ── FK / IK blend ───────────────────────────────────── */
        this.ikBlend           = new Map();    // chainId → 0..1  (0 = full FK, 1 = full IK)

        /* ── Bone Layers ─────────────────────────────────────── */
        this.boneLayers        = Array.from({ length: 32 }, (_, i) => ({
            name:    i === 0 ? 'Default' : `Layer ${i + 1}`,
            visible: true,
            color:   null
        }));
        this.boneLayerAssign   = new Map();    // bone → layerIndex (0-based)

        /* ── Constraint system ───────────────────────────────── */
        this.constraints       = new Map();    // bone → constraint[]
        this.constraintLines   = [];           // THREE.Line helpers rendered each frame

        /* ── Production animation bridge ────────────────────── */
        // Pose samples are intentionally independent from the timeline UI so
        // an animator can use the same rig in the game, film and content modes.
        this.poseRecordings    = new Map();    // owner uuid → [{ time, bones: Map }]
        this.runtimeProfiles   = new Map();    // owner uuid → game/film-ready description
        this.animationMixers   = new Map();    // owner uuid → THREE.AnimationMixer
        this.animationActions  = new Map();    // owner uuid → Map<clip uuid, action>
        this._lastUpdateTime   = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

        /* ── Selection & interaction ─────────────────────────── */
        this.selectedBone  = null;
        this.selectedBones = new Set();
        this.hoveredBone   = null;
        this.isAddingBone  = false;
        this._addBoneParent= null;
        this.selectionMode = 'single';         // 'single' | 'multi' | 'chain'

        /* ── Display settings ────────────────────────────────── */
        this.displayMode = 'octahedral';       // 'octahedral' | 'stick' | 'envelope' | 'bbone' | 'custom'
        this.xrayMode    = true;
        this.showNames   = false;
        this.showAxes    = false;
        this.boneSize    = 1.0;
        this.editMode    = 'pose';             // 'pose' | 'edit' | 'object'

        /* ── Raycasting ──────────────────────────────────────── */
        this.raycaster = new THREE.Raycaster();
        this.mouse     = new THREE.Vector2();

        /* ── Theme (UE5-inspired) ────────────────────────────── */
        this.theme = {
            bone:            0x4a4a5a,
            boneActive:      0x3a80e8,
            boneSelected:    0xf0a832,
            boneHover:       0x72c3ff,
            outline:         0x111111,
            outlineSelected: 0xff9900,
            joint:           0xe8e8e8,
            jointSelected:   0xffd060,
            left:            0x3875bf,
            right:           0xbf3838,
            ik:              0xaa55dd,
            ikTarget:        0xdd55aa,
            constraint:      0x55ddaa,
            control:         0x44ccff,
            rootControl:     0xffcc44,
            deform:          0x5a5a6a,
            nonDeform:       0x333340,
            addMode:         0x00ff88
        };

        /* ── Geometry cache ──────────────────────────────────── */
        this.geometries = {
            octahedral: this._makeOctahedral(),
            stick:      this._makeStick(),
            envelope:   this._makeEnvelope(),
            bbone:      this._makeBBone()
        };

        /* ── Control shapes (Blender-style custom shapes) ─────── */
        this.controlShapes = {
            circle:  this._makeCircleShape(),
            square:  this._makeSquareShape(),
            diamond: this._makeDiamondShape(),
            arrow:   this._makeArrowShape(),
            cross:   this._makeCrossShape()
        };

        this._initListeners();
        this._initKeyboardShortcuts();
    }

    /* ═══════════════════════════════════════════════════════════
       GEOMETRY FACTORIES
    ═══════════════════════════════════════════════════════════ */

    _makeOctahedral() {
        const geo = new THREE.BufferGeometry();
        const w = 0.1;
        const verts = new Float32Array([
            0, 0, 0,   w,0.1,0,   0,0.1,w,  -w,0.1,0,  0,0.1,-w,  0,1,0
        ]);
        geo.setIndex([0,1,2, 0,2,3, 0,3,4, 0,4,1, 5,2,1, 5,3,2, 5,4,3, 5,1,4]);
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geo.computeVertexNormals();
        return geo;
    }

    _makeStick() {
        const geo = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
        geo.translate(0, 0.5, 0);
        return geo;
    }

    _makeEnvelope() {
        const geo = new THREE.CylinderGeometry(0.08, 0.12, 1, 12);
        geo.translate(0, 0.5, 0);
        return geo;
    }

    _makeBBone() {
        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0,0,0), new THREE.Vector3(0,0.33,0),
            new THREE.Vector3(0,0.66,0), new THREE.Vector3(0,1,0)
        ]);
        return new THREE.TubeGeometry(curve, 12, 0.06, 8, false);
    }

    /* ── Custom control shapes ─────────────────────────────── */

    _makeCircleShape() {
        const pts = [];
        const N = 32;
        for (let i = 0; i <= N; i++) {
            const a = (i / N) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5));
        }
        return new THREE.BufferGeometry().setFromPoints(pts);
    }

    _makeSquareShape() {
        const h = 0.5;
        const pts = [
            new THREE.Vector3(-h,0,-h), new THREE.Vector3( h,0,-h),
            new THREE.Vector3( h,0, h), new THREE.Vector3(-h,0, h),
            new THREE.Vector3(-h,0,-h)
        ];
        return new THREE.BufferGeometry().setFromPoints(pts);
    }

    _makeDiamondShape() {
        const pts = [
            new THREE.Vector3(0,0,-0.5), new THREE.Vector3(0.5,0,0),
            new THREE.Vector3(0,0,0.5), new THREE.Vector3(-0.5,0,0),
            new THREE.Vector3(0,0,-0.5)
        ];
        return new THREE.BufferGeometry().setFromPoints(pts);
    }

    _makeArrowShape() {
        const pts = [
            new THREE.Vector3(0,0,-0.5), new THREE.Vector3(0,0,0.5),
            new THREE.Vector3(0,0,0.5), new THREE.Vector3(0.2,0,0.2),
            new THREE.Vector3(0,0,0.5), new THREE.Vector3(-0.2,0,0.2)
        ];
        return new THREE.BufferGeometry().setFromPoints(pts);
    }

    _makeCrossShape() {
        const pts = [
            new THREE.Vector3(-0.5,0,0), new THREE.Vector3(0.5,0,0),
            new THREE.Vector3(0,0,-0.5), new THREE.Vector3(0,0,0.5)
        ];
        return new THREE.BufferGeometry().setFromPoints(pts);
    }

    /* ═══════════════════════════════════════════════════════════
       LISTENERS
    ═══════════════════════════════════════════════════════════ */

    _initListeners() {
        const canvas = this.renderer.domElement;

        window.addEventListener('objectSelected', (e) => {
            this.syncSelectionFromScene(e.detail?.object || null);
        });

        canvas.addEventListener('pointermove', (e) => {
            if (this.transformControls?.dragging) return;
            this._updateMouse(e);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObjects(this.controls, true);
            const newHover = hits.length > 0 ? this.findBoneFromMesh(hits[0].object) : null;
            if (newHover !== this.hoveredBone) this.updateHoverState(newHover);
        });

        canvas.addEventListener('pointerdown', (e) => {
            if (e.target !== canvas) return;
            this._updateMouse(e);

            /* ── Add-Bone mode click ── */
            if (this.isAddingBone) {
                this._placeNewBoneAtMouse(e);
                return;
            }

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hits = this.raycaster.intersectObjects(this.controls, true);
            if (hits.length > 0) {
                const bone = this.findBoneFromMesh(hits[0].object);
                if (bone) {
                    if (e.shiftKey)              this.toggleBoneSelection(bone);
                    else if (e.ctrlKey||e.metaKey) this.selectBoneChain(bone);
                    else                          this.requestBoneSelection(bone);
                }
            } else {
                if (!this.transformControls?.dragging) this.clearActiveBoneSelection();
            }
        });

        this.transformControls?.addEventListener?.('objectChange', () => {
            const control = this.transformControls.object;
            const driver = control?.userData?.handRigDriver;
            if (!driver) return;
            const owner = this.scene.getObjectByProperty('uuid', driver.ownerUuid);
            if (!owner) return;
            // Rotating the curve controller around local Z drives a natural
            // open-to-fist range. The panel slider uses the same driver.
            const fist = THREE.MathUtils.clamp(
                Math.abs(control.rotation.z) / (Math.PI * 0.55),
                0,
                1
            );
            this.setHandPose(owner, driver.side, { fist, source: 'controller' });
        });
    }

    _updateMouse(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x =  ((e.clientX - rect.left) / rect.width ) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top ) / rect.height) * 2 + 1;
    }

    _initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
            switch (e.key.toLowerCase()) {
                case 'a':
                    if (e.ctrlKey||e.metaKey) { e.preventDefault(); this.selectAllBones(); }
                    else this.deselectAll();
                    break;
                case 'x':
                    if (e.altKey)  { e.preventDefault(); this.toggleXRay(); }
                    break;
                case 'h':
                    if (!e.ctrlKey) { e.preventDefault(); this.hideSelected(); }
                    break;
                case 'l': e.preventDefault(); this.selectLinked();   break;
                case 'i':
                    if (e.ctrlKey||e.metaKey) { e.preventDefault(); this.invertSelection(); }
                    break;
                case 'f2':
                    e.preventDefault();
                    if (this.selectedBone) {
                        const name = prompt('Rename bone:', this.selectedBone.name);
                        if (name) this.renameBone(this.selectedBone, name);
                    }
                    break;
                case 'm':
                    if (!e.ctrlKey) { e.preventDefault(); this.mirrorSelection(); }
                    break;
                case 'escape':
                    if (this.isAddingBone) this.endAddingMode();
                    break;
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════
       ADD-BONE MODE  (UE5-style click-to-add)
    ═══════════════════════════════════════════════════════════ */

    startAddingMode(parentBone = null) {
        if (this.editMode !== 'edit') this.setEditMode('edit');
        this.isAddingBone   = true;
        this._addBoneParent = parentBone || this.selectedBone || null;
        this.renderer.domElement.style.cursor = 'crosshair';
        window.dispatchEvent(new CustomEvent('rigAddBoneMode', { detail: { active: true } }));
        console.log('Rig: Add-Bone mode active. Click viewport to place. ESC to cancel.');
    }

    endAddingMode() {
        this.isAddingBone   = false;
        this._addBoneParent = null;
        this.renderer.domElement.style.cursor = '';
        window.dispatchEvent(new CustomEvent('rigAddBoneMode', { detail: { active: false } }));
    }

    _placeNewBoneAtMouse(e) {
        this._updateMouse(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        /* Try to hit existing geometry; fall back to a plane at y=0 */
        const allMeshes = [];
        this.scene.traverse(o => { if (o.isMesh && !o.userData.isSystemObject) allMeshes.push(o); });
        const hits = this.raycaster.intersectObjects(allMeshes, true);

        let worldPos;
        if (hits.length > 0) {
            worldPos = hits[0].point.clone();
        } else {
            const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
            worldPos = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(plane, worldPos);
        }

        const bone = new THREE.Bone();
        bone.name  = `Bone_${Date.now().toString(36)}`;

        const parent = this._addBoneParent;
        if (parent && parent.isBone) {
            parent.add(bone);
            // Preserve the click's world-space position even for a rotated or
            // scaled parent bone (the former subtraction-only approach broke
            // chains as soon as a character had any parent rotation).
            bone.position.copy(parent.worldToLocal(worldPos.clone()));
        } else {
            /* Attach to scene root as a free bone */
            this.scene.add(bone);
            bone.position.copy(worldPos);
        }

        bone.updateMatrixWorld(true);
        this.analyzeBoneProperties(bone);
        this.createBoneVisuals(bone);
        bone.userData.hasVisual = true;

        /* Build minimal relationship entry */
        this.boneRelationships.set(bone, {
            parent:   parent?.isBone ? parent : null,
            children: [],
            isLeaf:   true,
            depth:    this.calculateBoneDepth(bone)
        });

        /* Update parent's child list */
        if (parent?.isBone) {
            const rel = this.boneRelationships.get(parent);
            if (rel) rel.children.push(bone);
        }

        this.boneLayerAssign.set(bone, 0);
        this.requestBoneSelection(bone);
        this.endAddingMode();

        // Rebuild the owner profile so the new bone is immediately listed in
        // the hierarchy, controller grid and animation baking data.
        const owner = this.getRigOwnerForBone(bone);
        if (owner) this.setupRigForObject(owner);

        window.dispatchEvent(new CustomEvent('rigBoneAdded', { detail: { bone } }));
        return bone;
    }

    /* ═══════════════════════════════════════════════════════════
       GENERIC OBJECT RIGGING

       Imported characters already have bones.  For vehicles, props and
       machines we create an authored armature root, parent the selected
       object to it while preserving its world transform, then let artists
       build normal Bone → Child Bone chains from the same Add Bone tool.
    ═══════════════════════════════════════════════════════════ */

    createRigForObject(object) {
        if (!object?.isObject3D || object.isBone) return null;

        const existing = this.getBonesForObject(object);
        if (existing.length) return this.setupRigForObject(object);

        object.updateMatrixWorld?.(true);
        const parent = object.parent || this.scene;
        if (!parent) return null;

        const bounds = new THREE.Box3().setFromObject(object);
        const size = bounds.isEmpty()
            ? new THREE.Vector3(1, 1, 1)
            : bounds.getSize(new THREE.Vector3());
        const controlSize = Math.max(0.45, size.length() * 0.18);

        const root = new THREE.Bone();
        root.name = `${object.name || 'Object'}_Root_CTRL`;
        root.userData.rigGenerated = true;
        root.userData.rigOwnerUuid = object.uuid;
        root.userData.rigControlSize = controlSize;
        root.userData.isRigController = true;

        // Put the armature root alongside the object first, then attach the
        // object. Object3D.attach keeps its world pose unchanged, exactly like
        // Blender's Keep Transform parent operation.
        parent.add(root);
        root.position.copy(object.position);
        root.quaternion.copy(object.quaternion);
        root.scale.set(1, 1, 1);
        root.updateMatrixWorld(true);
        root.attach(object);
        root.updateMatrixWorld(true);

        this.generatedRigRoots.set(object.uuid, root);
        this.parentBindings.set(object.uuid, {
            ownerUuid: object.uuid,
            boneUuid: root.uuid,
            originalParentUuid: parent.uuid || null,
            generatedRoot: true
        });
        object.userData.rigParent = {
            boneUuid: root.uuid,
            ownerUuid: object.uuid,
            generatedRoot: true
        };

        this.analyzeBoneProperties(root);
        this.createBoneVisuals(root);
        root.userData.hasVisual = true;
        this.boneRelationships.set(root, {
            parent: null,
            children: [],
            isLeaf: true,
            depth: 0
        });
        this.boneLayerAssign.set(root, 0);
        this.restPose.set(root.uuid, {
            pos: root.position.clone(),
            quat: root.quaternion.clone(),
            scale: root.scale.clone()
        });

        const profile = this.buildControlRigProfile(object, [root]);
        object.userData.hasRig = true;
        this.showRigForObject(object);
        this.requestBoneSelection(root);
        window.dispatchEvent(new CustomEvent('rigProfileReady', {
            detail: { object, profile, generated: true }
        }));
        window.dispatchEvent(new CustomEvent('rigObjectCreated', {
            detail: { object, root }
        }));
        return profile;
    }

    parentObjectToBone(object = this.lastSelectedRigPart, bone = this.selectedBone) {
        if (!object?.isObject3D || !bone?.isBone || object === bone) return false;
        if (object.userData?.isSystemObject || object.userData?.targetBone) return false;

        // Parenting an ancestor below one of its descendants creates a scene
        // graph cycle. This check keeps generic rigs safe for both car parts
        // and nested character props.
        let createsCycle = false;
        object.traverse?.(node => {
            if (node === bone) createsCycle = true;
        });
        if (createsCycle) return false;

        const originalParent = object.parent;
        bone.attach(object); // preserve world transform
        const owner = this.getRigOwnerForBone(bone);
        const binding = {
            ownerUuid: owner?.uuid || null,
            boneUuid: bone.uuid,
            originalParentUuid: originalParent?.uuid || null,
            generatedRoot: false
        };
        this.parentBindings.set(object.uuid, binding);
        object.userData.rigParent = binding;
        window.dispatchEvent(new CustomEvent('rigObjectParented', {
            detail: { object, bone, owner }
        }));
        return true;
    }

    unparentObjectFromBone(object = this.lastSelectedRigPart) {
        if (!object?.isObject3D || !object.userData?.rigParent) return false;
        const binding = object.userData.rigParent;
        const originalParent = binding.originalParentUuid
            ? this.scene.getObjectByProperty('uuid', binding.originalParentUuid)
            : this.scene;
        if (!originalParent?.attach) return false;
        originalParent.attach(object); // Keep Transform while clearing bind.
        this.parentBindings.delete(object.uuid);
        delete object.userData.rigParent;
        window.dispatchEvent(new CustomEvent('rigObjectUnparented', {
            detail: { object }
        }));
        return true;
    }

    /* ═══════════════════════════════════════════════════════════
       HAND CONTROL RIG

       Auto-detects standard Mixamo/GLTF/Blender finger naming and creates a
       visible Fist_CTRL for each hand. The driver stores rest rotations and
       applies proportional local curls across every finger chain.
    ═══════════════════════════════════════════════════════════ */

    _handSideFromName(name = '') {
        const value = String(name).toLowerCase();
        if (/(left|_l\b|\.l\b|l[_-](hand|thumb|index|middle|ring|pinky|little))/.test(value)) return 'left';
        if (/(right|_r\b|\.r\b|r[_-](hand|thumb|index|middle|ring|pinky|little))/.test(value)) return 'right';
        return null;
    }

    _fingerNameFromBone(bone) {
        const name = String(bone?.name || '').toLowerCase();
        if (/thumb/.test(name)) return 'thumb';
        if (/index/.test(name)) return 'index';
        if (/middle/.test(name)) return 'middle';
        if (/ring/.test(name)) return 'ring';
        if (/(pinky|little)/.test(name)) return 'pinky';
        return null;
    }

    _findHandBone(bones, side) {
        return bones.find(bone => {
            const name = String(bone.name || '').toLowerCase();
            return this._handSideFromName(name) === side && /(hand|wrist)/.test(name);
        }) || null;
    }

    createHandRig(owner, sides = ['left', 'right']) {
        owner = this.getRigOwnerFromObject(owner || window.selectedObject);
        if (!owner) return null;
        this.setupRigForObject(owner);
        const bones = this.getBonesForObject(owner);
        if (!bones.length) return null;

        const rig = this.handRigs.get(owner.uuid) || {};
        const requestedSides = Array.isArray(sides) ? sides : [sides];
        let created = 0;

        requestedSides.forEach(side => {
            if (!['left', 'right'].includes(side) || rig[side]) return;
            const handBone = this._findHandBone(bones, side);
            const fingerChains = {};

            bones.forEach(bone => {
                if (this._handSideFromName(bone.name) !== side) return;
                const finger = this._fingerNameFromBone(bone);
                if (!finger) return;
                (fingerChains[finger] ||= []).push(bone);
            });
            Object.values(fingerChains).forEach(chain => {
                chain.sort((a, b) => this.calculateBoneDepth(a) - this.calculateBoneDepth(b));
            });
            if (!handBone || !Object.keys(fingerChains).length) return;

            const controller = new THREE.Bone();
            controller.name = `Hand_${side === 'left' ? 'L' : 'R'}_Fist_CTRL`;
            controller.userData.isRigController = true;
            controller.userData.rigControlSize = 0.32;
            controller.userData.handRigDriver = { ownerUuid: owner.uuid, side };
            controller.position.set(0, 0, 0);
            handBone.add(controller);
            controller.updateMatrixWorld(true);
            this.analyzeBoneProperties(controller);
            this.createBoneVisuals(controller);
            controller.userData.hasVisual = true;
            this.boneRelationships.set(controller, {
                parent: handBone,
                children: [],
                isLeaf: true,
                depth: this.calculateBoneDepth(controller)
            });
            const handRelationship = this.boneRelationships.get(handBone);
            if (handRelationship && !handRelationship.children.includes(controller)) {
                handRelationship.children.push(controller);
            }
            this.boneLayerAssign.set(controller, 0);

            const rest = new Map();
            Object.values(fingerChains).flat().forEach(bone => {
                rest.set(bone.uuid, bone.quaternion.clone());
            });
            rig[side] = {
                side,
                handBone,
                controller,
                fingerChains,
                rest,
                fist: 0,
                curlAxis: 'x'
            };
            created += 1;
        });

        if (!created && !Object.keys(rig).length) return null;
        this.handRigs.set(owner.uuid, rig);
        this.setupRigForObject(owner);
        window.dispatchEvent(new CustomEvent('rigHandControlsReady', {
            detail: { owner, rig, created }
        }));
        return rig;
    }

    getHandRig(owner) {
        const resolved = this.getRigOwnerFromObject(owner);
        return resolved ? (this.handRigs.get(resolved.uuid) || null) : null;
    }

    setHandCurlAxis(owner, side, axis = 'x') {
        const hand = this.getHandRig(owner)?.[side];
        if (!hand || !['x', 'y', 'z'].includes(axis)) return false;
        hand.curlAxis = axis;
        this.setHandPose(owner, side, { fist: hand.fist });
        return true;
    }

    setHandPose(owner, side, options = {}) {
        const hand = this.getHandRig(owner)?.[side];
        if (!hand) return false;
        const fist = THREE.MathUtils.clamp(Number(options.fist ?? hand.fist) || 0, 0, 1);
        const axis = new THREE.Vector3(
            hand.curlAxis === 'x' ? 1 : 0,
            hand.curlAxis === 'y' ? 1 : 0,
            hand.curlAxis === 'z' ? 1 : 0
        );
        const perFinger = options.fingers || {};

        Object.entries(hand.fingerChains).forEach(([finger, chain]) => {
            const fingerCurl = THREE.MathUtils.clamp(
                Number(perFinger[finger] ?? fist) || 0,
                0,
                1
            );
            chain.forEach((bone, index) => {
                const rest = hand.rest.get(bone.uuid);
                if (!rest) return;
                const baseDegrees = finger === 'thumb'
                    ? [38, 62, 48][Math.min(index, 2)]
                    : [48, 76, 62, 42][Math.min(index, 3)];
                // Bend directions differ between left/right mirrored hands.
                const sign = hand.side === 'left' ? -1 : 1;
                const curl = new THREE.Quaternion().setFromAxisAngle(
                    axis,
                    THREE.MathUtils.degToRad(baseDegrees * fingerCurl * sign)
                );
                bone.quaternion.copy(rest).multiply(curl);
                bone.updateMatrixWorld?.(true);
            });
        });

        hand.fist = fist;
        if (options.source !== 'controller' && hand.controller) {
            hand.controller.rotation.z = fist * Math.PI * 0.55;
        }
        window.dispatchEvent(new CustomEvent('rigHandPoseChanged', {
            detail: { owner: this.getRigOwnerFromObject(owner), side, fist }
        }));
        return true;
    }

    /* ═══════════════════════════════════════════════════════════
       RIG SETUP
    ═══════════════════════════════════════════════════════════ */

    setupRigForObject(object) {
        if (!object) return;
        object.updateMatrixWorld(true);

        const bones = this.getBonesForObject(object);
        if (!bones.length) return this.createRigForObject(object);
        bones.forEach(n => {
            this.analyzeBoneProperties(n);
            if (!n.userData.hasVisual) {
                this.createBoneVisuals(n);
                n.userData.hasVisual = true;
            }
            if (!this.boneLayerAssign.has(n)) this.boneLayerAssign.set(n, 0);
        });

        bones.forEach(bone => {
            const children = bone.children.filter(c => c.isBone);
            this.boneRelationships.set(bone, {
                parent:   bone.parent?.isBone ? bone.parent : null,
                children,
                isLeaf:   children.length === 0,
                depth:    this.calculateBoneDepth(bone)
            });
        });

        /* Capture rest pose */
        bones.forEach(bone => {
            this.restPose.set(bone.uuid, {
                pos:   bone.position.clone(),
                quat:  bone.quaternion.clone(),
                scale: bone.scale.clone()
            });
        });

        if (bones.length > 0 && !this.skeletonHelpers.has(object.uuid)) {
            const helperRoot = this.generatedRigRoots.get(object.uuid) || object;
            const helper = new THREE.SkeletonHelper(helperRoot);
            helper.material.linewidth = 2;
            helper.material.depthTest  = !this.xrayMode;
            helper.material.opacity    = 0.35;
            helper.material.transparent = true;
            helper.material.color.set(0x668899);
            helper.renderOrder = 998;
            this.scene.add(helper);
            this.skeletonHelpers.set(object.uuid, helper);
        }

        this.detectBoneGroups(bones);
        const profile = this.buildControlRigProfile(object, bones);
        object.userData.hasRig = true;
        this.showRigForObject(object);

        window.dispatchEvent(new CustomEvent('rigProfileReady', {
            detail: { object, profile }
        }));

        console.log(`[RigManager] ${bones.length} bones, ${this.boneGroups.size} groups — rig ready.`);
        return profile;
    }

    /* ═══════════════════════════════════════════════════════════
       POSE LIBRARY
    ═══════════════════════════════════════════════════════════ */

    /**
     * Capture the current pose for all bones (or a subset) into the library.
     * @param {string} poseName
     * @param {THREE.Bone[]} [bones]  defaults to all bones with visuals
     */
    savePose(poseName, bones) {
        const targets = bones || Array.from(this.boneVisuals.keys());
        const poseData = new Map();
        targets.forEach(bone => {
            poseData.set(bone.uuid, {
                pos:   bone.position.clone(),
                quat:  bone.quaternion.clone(),
                scale: bone.scale.clone()
            });
        });
        this.poseLibrary.set(poseName, poseData);
        window.dispatchEvent(new CustomEvent('rigPoseSaved', { detail: { poseName } }));
        return poseName;
    }

    /**
     * Apply a saved pose.
     * @param {string} poseName
     * @param {number} [blend=1]  0..1 blend factor
     * @param {THREE.Bone[]} [bones]
     */
    applyPose(poseName, blend = 1, bones) {
        const poseData = this.poseLibrary.get(poseName);
        if (!poseData) return false;

        const targets = bones || Array.from(this.boneVisuals.keys());
        targets.forEach(bone => {
            const saved = poseData.get(bone.uuid);
            if (!saved) return;
            bone.position.lerp(saved.pos, blend);
            bone.quaternion.slerp(saved.quat, blend);
            bone.scale.lerp(saved.scale, blend);
        });

        window.dispatchEvent(new CustomEvent('rigPoseApplied', { detail: { poseName, blend } }));
        return true;
    }

    /** Reset all bones to rest pose. */
    applyRestPose(blend = 1) {
        this.boneVisuals.forEach((_, bone) => {
            const rest = this.restPose.get(bone.uuid);
            if (!rest) return;
            bone.position.lerp(rest.pos, blend);
            bone.quaternion.slerp(rest.quat, blend);
            bone.scale.lerp(rest.scale, blend);
        });
    }

    deletePose(poseName) {
        this.poseLibrary.delete(poseName);
        window.dispatchEvent(new CustomEvent('rigPoseDeleted', { detail: { poseName } }));
    }

    getPoseNames() { return Array.from(this.poseLibrary.keys()); }

    /* ═══════════════════════════════════════════════════════════
       RECORDING, CLIPS & RUNTIME HANDOFF
       The same authored pose keys are baked into standard THREE.AnimationClip
       tracks. That keeps the result usable by the in-editor cinematic mixer
       and by the game's player/state-machine systems.
    ═══════════════════════════════════════════════════════════ */

    getAnimationRoot(owner) {
        if (!owner) return null;
        // Imported GLTF/FBX characters commonly keep the SkinnedMesh and the
        // armature as siblings below one character root.  Mixing from that
        // root lets PropertyBinding find every bone reliably.
        return owner;
    }

    getRigOwnerFromObject(object) {
        if (!object) return null;
        if (object.isBone) return this.getRigOwnerForBone(object);
        if (this.getRigProfile(object)) return object;
        let cursor = object;
        while (cursor) {
            if (this.getRigProfile(cursor)) return cursor;
            cursor = cursor.parent;
        }
        return object;
    }

    recordPoseKey(owner, time = null) {
        owner = this.getRigOwnerFromObject(owner || this.selectedBone || window.selectedObject);
        if (!owner) return null;
        const bones = this.getBonesForObject(owner);
        if (!bones.length) return null;
        const keyTime = Number.isFinite(time) ? Math.max(0, time) : Math.max(0, Number(window.currentTime) || 0);
        const sample = { time: keyTime, bones: new Map() };
        bones.forEach((bone) => {
            sample.bones.set(bone.uuid, {
                name: bone.name,
                position: bone.position.toArray(),
                quaternion: bone.quaternion.toArray(),
                scale: bone.scale.toArray(),
            });
        });
        const samples = this.poseRecordings.get(owner.uuid) || [];
        const existing = samples.findIndex((item) => Math.abs(item.time - keyTime) < 1e-5);
        if (existing >= 0) samples[existing] = sample;
        else samples.push(sample);
        samples.sort((a, b) => a.time - b.time);
        this.poseRecordings.set(owner.uuid, samples);
        window.dispatchEvent(new CustomEvent('rigPoseKeyRecorded', {
            detail: { owner, time: keyTime, keyCount: samples.length }
        }));
        return sample;
    }

    getPoseRecording(owner) {
        const resolved = this.getRigOwnerFromObject(owner);
        return resolved ? (this.poseRecordings.get(resolved.uuid) || []) : [];
    }

    bakePoseRecording(owner, clipName = 'Rig_Animation') {
        owner = this.getRigOwnerFromObject(owner || this.selectedBone || window.selectedObject);
        if (!owner) return null;
        const samples = [...this.getPoseRecording(owner)];
        if (!samples.length) return null;
        // A single pose is still a valid hold clip and useful for cinematics.
        if (samples.length === 1) {
            const hold = { time: samples[0].time + (1 / 30), bones: new Map(samples[0].bones) };
            samples.push(hold);
        }

        const bones = this.getBonesForObject(owner);
        const startTime = samples[0].time;
        const tracks = [];
        bones.forEach((bone) => {
            const times = [];
            const positions = [];
            const rotations = [];
            const scales = [];
            samples.forEach((sample) => {
                const transform = sample.bones.get(bone.uuid);
                if (!transform) return;
                times.push(sample.time - startTime);
                positions.push(...transform.position);
                rotations.push(...transform.quaternion);
                scales.push(...transform.scale);
            });
            if (times.length < 2) return;
            const trackPath = bone.name;
            tracks.push(new THREE.VectorKeyframeTrack(`${trackPath}.position`, times, positions));
            tracks.push(new THREE.QuaternionKeyframeTrack(`${trackPath}.quaternion`, times, rotations));
            tracks.push(new THREE.VectorKeyframeTrack(`${trackPath}.scale`, times, scales));
        });
        if (!tracks.length) return null;

        const duration = Math.max(1 / 30, samples[samples.length - 1].time - startTime);
        const clip = new THREE.AnimationClip(String(clipName || 'Rig_Animation').trim() || 'Rig_Animation', duration, tracks);
        const root = this.getAnimationRoot(owner);
        root.animations = Array.isArray(root.animations) ? root.animations : [];
        root.animations = root.animations.filter((item) => item.name !== clip.name);
        root.animations.push(clip);
        owner.userData = owner.userData || {};
        owner.userData.animations = root.animations;
        owner.userData.rigLastClip = clip.name;
        this.createRuntimeProfile(owner);
        window.dispatchEvent(new CustomEvent('rigClipBaked', { detail: { owner, root, clip, samples: samples.length } }));
        return clip;
    }

    playRigClip(owner, clipOrName, options = {}) {
        owner = this.getRigOwnerFromObject(owner);
        const root = this.getAnimationRoot(owner);
        if (!root) return null;
        const clips = root.animations || owner?.userData?.animations || [];
        const clip = typeof clipOrName === 'string' ? clips.find((item) => item.name === clipOrName) : clipOrName;
        if (!clip) return null;
        let mixer = this.animationMixers.get(owner.uuid);
        if (!mixer) {
            mixer = new THREE.AnimationMixer(root);
            this.animationMixers.set(owner.uuid, mixer);
            this.animationActions.set(owner.uuid, new Map());
        }
        const actions = this.animationActions.get(owner.uuid);
        actions.forEach((action) => action.stop());
        const action = mixer.clipAction(clip);
        action.reset();
        action.setLoop(options.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = options.loop === false;
        action.setEffectiveWeight(Number.isFinite(options.weight) ? options.weight : 1);
        action.fadeIn(Math.max(0, Number(options.fadeIn) || 0));
        action.play();
        actions.set(clip.uuid, action);
        window.dispatchEvent(new CustomEvent('rigClipPlayed', { detail: { owner, clip, action } }));
        return action;
    }

    stopRigClips(owner, fadeOut = 0) {
        owner = this.getRigOwnerFromObject(owner);
        const actions = owner ? this.animationActions.get(owner.uuid) : null;
        actions?.forEach((action) => {
            if (fadeOut > 0) action.fadeOut(fadeOut);
            else action.stop();
        });
    }

    createRuntimeProfile(owner) {
        owner = this.getRigOwnerFromObject(owner || this.selectedBone || window.selectedObject);
        if (!owner) return null;
        const root = this.getAnimationRoot(owner);
        const bones = this.getBonesForObject(owner);
        if (!bones.length) return null;
        const profile = {
            version: 1,
            ownerUuid: owner.uuid,
            ownerName: owner.name || 'Rig',
            animationRootUuid: root?.uuid || owner.uuid,
            skeleton: bones.map((bone) => ({
                uuid: bone.uuid,
                name: bone.name,
                parent: bone.parent?.isBone ? bone.parent.name : null,
                role: this.classifyRigRole(bone),
                chain: this.classifyRigChain(bone),
            })),
            clips: (root?.animations || owner.userData?.animations || []).map((clip) => ({
                name: clip.name,
                duration: clip.duration,
                tracks: clip.tracks.length,
            })),
            updatedAt: Date.now(),
        };
        this.runtimeProfiles.set(owner.uuid, profile);
        owner.userData = owner.userData || {};
        owner.userData.rigRuntimeProfile = profile;
        owner.userData.gameplayReady = true;
        window.dispatchEvent(new CustomEvent('sm:rig-runtime-ready', { detail: { owner, profile } }));
        return profile;
    }

    /* ═══════════════════════════════════════════════════════════
       FK / IK BLEND
    ═══════════════════════════════════════════════════════════ */

    /**
     * Set FK/IK blend for a named chain.
     * 0 = pure FK, 1 = pure IK  (IK bone takes over when blend = 1)
     * @param {string} chainId
     * @param {number} blend  0..1
     */
    setIKBlend(chainId, blend) {
        this.ikBlend.set(chainId, Math.max(0, Math.min(1, blend)));
        window.dispatchEvent(new CustomEvent('rigIKBlendChanged', { detail: { chainId, blend } }));
    }

    getIKBlend(chainId) { return this.ikBlend.get(chainId) ?? 0; }

    /* ═══════════════════════════════════════════════════════════
       CONSTRAINTS
    ═══════════════════════════════════════════════════════════ */

    /**
     * Add a constraint to a bone.
     * type: 'copy_rotation' | 'copy_location' | 'look_at' | 'limit_rotation' | 'ik'
     */
    addConstraint(bone, type, options = {}) {
        if (!bone?.isBone) return null;
        if (!this.constraints.has(bone)) this.constraints.set(bone, []);
        const target = options.target?.isBone ? options.target : null;
        const constraint = {
            type,
            enabled: true,
            influence: 1,
            target,
            targetUuid: target?.uuid || options.targetUuid || null,
            chainLength: Math.max(1, Math.round(Number(options.chainLength) || 2)),
            iterations: Math.max(1, Math.round(Number(options.iterations) || 12)),
            ...options,
        };
        this.constraints.get(bone).push(constraint);
        window.dispatchEvent(new CustomEvent('rigConstraintAdded', { detail: { bone, constraint } }));
        return constraint;
    }

    removeConstraint(bone, index) {
        const list = this.constraints.get(bone);
        if (list) list.splice(index, 1);
    }

    getConstraints(bone) { return this.constraints.get(bone) || []; }

    setEditMode(mode = 'pose') {
        const next = ['object', 'pose', 'edit'].includes(mode) ? mode : 'pose';
        this.editMode = next;
        if (next === 'object') this.endAddingMode();
        window.dispatchEvent(new CustomEvent('rigModeApplied', { detail: { mode: next } }));
        return next;
    }

    _resolveConstraintTarget(bone, constraint) {
        if (constraint?.target?.isObject3D) return constraint.target;
        const owner = this.getRigOwnerForBone(bone);
        return constraint?.targetUuid && owner?.getObjectByProperty
            ? owner.getObjectByProperty('uuid', constraint.targetUuid)
            : null;
    }

    _setBoneWorldQuaternion(bone, worldQuaternion, influence = 1) {
        const parentQuaternion = new THREE.Quaternion();
        if (bone.parent) bone.parent.getWorldQuaternion(parentQuaternion);
        const localQuaternion = parentQuaternion.invert().multiply(worldQuaternion);
        bone.quaternion.slerp(localQuaternion, THREE.MathUtils.clamp(influence, 0, 1));
    }

    _setBoneWorldPosition(bone, worldPosition, influence = 1) {
        const localPosition = worldPosition.clone();
        if (bone.parent) bone.parent.worldToLocal(localPosition);
        bone.position.lerp(localPosition, THREE.MathUtils.clamp(influence, 0, 1));
    }

    _applyCopyTransforms(bone, target, constraint) {
        if (!target) return;
        const influence = THREE.MathUtils.clamp(Number(constraint.influence) || 0, 0, 1);
        if (constraint.type === 'copy_location' || constraint.type === 'copy_transforms') {
            const position = target.getWorldPosition(new THREE.Vector3());
            this._setBoneWorldPosition(bone, position, influence);
        }
        if (constraint.type === 'copy_rotation' || constraint.type === 'copy_transforms') {
            const quaternion = target.getWorldQuaternion(new THREE.Quaternion());
            this._setBoneWorldQuaternion(bone, quaternion, influence);
        }
    }

    _applyLookAtConstraint(bone, target, constraint) {
        if (!target) return;
        const origin = bone.getWorldPosition(new THREE.Vector3());
        const destination = target.getWorldPosition(new THREE.Vector3());
        const direction = destination.sub(origin);
        if (direction.lengthSq() < 1e-8) return;
        const worldQuaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), direction.normalize()
        );
        this._setBoneWorldQuaternion(bone, worldQuaternion, Number(constraint.influence) || 0);
    }

    _applyLimitConstraint(bone, constraint) {
        const influence = THREE.MathUtils.clamp(Number(constraint.influence) || 0, 0, 1);
        const minimum = constraint.min || constraint.minimum || {};
        const maximum = constraint.max || constraint.maximum || {};
        if (constraint.type === 'limit_location') {
            ['x', 'y', 'z'].forEach((axis) => {
                const low = Number.isFinite(minimum[axis]) ? minimum[axis] : -Infinity;
                const high = Number.isFinite(maximum[axis]) ? maximum[axis] : Infinity;
                const clamped = THREE.MathUtils.clamp(bone.position[axis], low, high);
                bone.position[axis] += (clamped - bone.position[axis]) * influence;
            });
            return;
        }
        const rotation = bone.rotation;
        ['x', 'y', 'z'].forEach((axis) => {
            const low = Number.isFinite(minimum[axis]) ? THREE.MathUtils.degToRad(minimum[axis]) : -Infinity;
            const high = Number.isFinite(maximum[axis]) ? THREE.MathUtils.degToRad(maximum[axis]) : Infinity;
            const clamped = THREE.MathUtils.clamp(rotation[axis], low, high);
            rotation[axis] += (clamped - rotation[axis]) * influence;
        });
    }

    _applyIKConstraint(endBone, target, constraint) {
        if (!target) return;
        const chain = [];
        let cursor = endBone;
        const chainLength = Math.max(1, Number(constraint.chainLength) || 2);
        while (cursor?.isBone && chain.length < chainLength) {
            chain.push(cursor);
            cursor = cursor.parent;
        }
        if (chain.length < 2) return;
        const targetPosition = target.getWorldPosition(new THREE.Vector3());
        const iterations = Math.max(1, Math.min(32, Number(constraint.iterations) || 12));
        const influence = THREE.MathUtils.clamp(Number(constraint.influence) || 0, 0, 1);
        for (let pass = 0; pass < iterations; pass += 1) {
            for (let index = 1; index < chain.length; index += 1) {
                const joint = chain[index];
                const jointPosition = joint.getWorldPosition(new THREE.Vector3());
                const endPosition = endBone.getWorldPosition(new THREE.Vector3());
                const toEnd = endPosition.sub(jointPosition);
                const toTarget = targetPosition.clone().sub(jointPosition);
                if (toEnd.lengthSq() < 1e-8 || toTarget.lengthSq() < 1e-8) continue;
                const delta = new THREE.Quaternion().setFromUnitVectors(toEnd.normalize(), toTarget.normalize());
                const worldRotation = joint.getWorldQuaternion(new THREE.Quaternion());
                worldRotation.premultiply(delta);
                this._setBoneWorldQuaternion(joint, worldRotation, influence);
                joint.updateMatrixWorld(true);
            }
            if (endBone.getWorldPosition(new THREE.Vector3()).distanceTo(targetPosition) < 0.002) break;
        }
    }

    evaluateConstraints() {
        if (this.editMode === 'edit') return;
        this.constraints.forEach((constraints, bone) => {
            constraints.forEach((constraint) => {
                if (!constraint?.enabled) return;
                const target = this._resolveConstraintTarget(bone, constraint);
                if (['copy_location', 'copy_rotation', 'copy_transforms'].includes(constraint.type)) {
                    this._applyCopyTransforms(bone, target, constraint);
                } else if (constraint.type === 'look_at') {
                    this._applyLookAtConstraint(bone, target, constraint);
                } else if (constraint.type === 'ik') {
                    this._applyIKConstraint(bone, target, constraint);
                } else if (constraint.type === 'limit_rotation' || constraint.type === 'limit_location') {
                    this._applyLimitConstraint(bone, constraint);
                }
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════
       BONE LAYERS
    ═══════════════════════════════════════════════════════════ */

    setBoneLayer(bone, layerIndex) {
        this.boneLayerAssign.set(bone, layerIndex);
        const layer = this.boneLayers[layerIndex];
        if (layer && !layer.visible) {
            const visual = this.boneVisuals.get(bone);
            if (visual) { visual.body.visible = false; visual.joint.visible = false; }
        }
    }

    setLayerVisible(layerIndex, visible) {
        if (!this.boneLayers[layerIndex]) return;
        this.boneLayers[layerIndex].visible = visible;
        this.boneVisuals.forEach((visual, bone) => {
            if ((this.boneLayerAssign.get(bone) ?? 0) === layerIndex) {
                visual.body.visible  = visible;
                visual.joint.visible = visible;
            }
        });
    }

    setLayerName(layerIndex, name) {
        if (this.boneLayers[layerIndex]) this.boneLayers[layerIndex].name = name;
    }

    getLayerInfo() { return this.boneLayers.map((l, i) => ({ ...l, index: i })); }

    /* ═══════════════════════════════════════════════════════════
       BONE RENAME
    ═══════════════════════════════════════════════════════════ */

    renameBone(bone, newName) {
        if (!bone?.isBone) return;
        const old = bone.name;
        bone.name = newName;
        this.analyzeBoneProperties(bone);  // re-classify
        const visual = this.boneVisuals.get(bone);
        if (visual && this.showNames && visual.label) {
            bone.remove(visual.label);
            const newLabel = this.createBoneLabel(newName);
            visual.joint.add(newLabel);
            visual.label = newLabel;
        }
        window.dispatchEvent(new CustomEvent('rigBoneRenamed', { detail: { bone, old, newName } }));
    }

    /* ═══════════════════════════════════════════════════════════
       MIRROR SELECTION
    ═══════════════════════════════════════════════════════════ */

    mirrorSelection() {
        const newSel = new Set(this.selectedBones);
        const allBones = Array.from(this.boneVisuals.keys());

        this.selectedBones.forEach(bone => {
            const name = bone.name;
            let mirror = null;

            /* Try common naming conventions: .L/.R  _L/_R  Left/Right */
            if      (/\.L$/i.test(name)) mirror = allBones.find(b => b.name === name.replace(/\.L$/i, '.R'));
            else if (/\.R$/i.test(name)) mirror = allBones.find(b => b.name === name.replace(/\.R$/i, '.L'));
            else if (/_L$/i .test(name)) mirror = allBones.find(b => b.name === name.replace(/_L$/i, '_R'));
            else if (/_R$/i .test(name)) mirror = allBones.find(b => b.name === name.replace(/_R$/i, '_L'));
            else if (/left/i .test(name)) mirror = allBones.find(b => b.name.toLowerCase() === name.toLowerCase().replace('left','right'));
            else if (/right/i.test(name)) mirror = allBones.find(b => b.name.toLowerCase() === name.toLowerCase().replace('right','left'));

            if (mirror) newSel.add(mirror);
        });

        newSel.forEach(bone => {
            if (!this.selectedBones.has(bone)) {
                this.requestBoneSelection(bone, { additive: true });
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════
       BONE ANALYSIS
    ═══════════════════════════════════════════════════════════ */

    analyzeBoneProperties(bone) {
        const n = bone.name.toLowerCase();
        this.boneProperties.set(bone, {
            deform:     !n.includes('ik') && !n.includes('ctrl'),
            isIK:       n.includes('ik') || bone.userData?.isRigIK === true,
            isControl:  /ctrl|control|pole|target|global|master/.test(n) || bone.userData?.isRigController === true,
            isIKTarget: /ik.*target|target.*ik/.test(n),
            isPole:     n.includes('pole'),
            hasConstraint: this.constraints.has(bone),
            symmetry:   n.includes('left') ? 'left' : n.includes('right') ? 'right' : 'center'
        });
    }

    calculateBoneDepth(bone) {
        let d = 0, c = bone;
        while (c.parent?.isBone) { d++; c = c.parent; }
        return d;
    }

    detectBoneGroups(bones) {
        this.boneGroups.clear();
        const patterns = {
            spine:  /spine|back|torso/i,
            arm:    /arm|shoulder|clavicle|hand/i,
            leg:    /leg|foot|hip|thigh/i,
            head:   /head|neck|skull|jaw/i,
            finger: /finger|thumb/i,
            ik:     /ik|pole|target/i
        };
        bones.forEach(bone => {
            for (const [g, pat] of Object.entries(patterns)) {
                if (pat.test(bone.name)) {
                    if (!this.boneGroups.has(g)) this.boneGroups.set(g, []);
                    this.boneGroups.get(g).push(bone);
                }
            }
        });
    }

    classifyRigRole(bone) {
        const n = bone.name.toLowerCase();
        if (/global|master|root/.test(n))           return 'root';
        if (/ctrl|control/.test(n))                 return 'control';
        if (/ik.*target|target.*ik/.test(n))         return 'ik-target';
        if (/ik/.test(n))                            return 'ik';
        if (/pole/.test(n))                          return 'pole';
        if (/hand|foot/.test(n))                     return 'limb-end';
        if (/finger|thumb/.test(n))                  return 'finger';
        if (/spine|back|torso/.test(n))              return 'spine';
        if (/head|neck/.test(n))                     return 'head';
        if (/arm|shoulder|clavicle/.test(n))         return 'arm';
        if (/leg|thigh|calf|hip/.test(n))            return 'leg';
        return 'deform';
    }

    classifyRigChain(bone) {
        const n = bone.name.toLowerCase();
        if (/spine|back|torso/.test(n))                              return 'spine';
        if (/head|neck|jaw|eye/.test(n))                             return 'head';
        if (/(left|_l|\.l)/.test(n) && /arm|shoulder|hand/.test(n)) return 'leftArm';
        if (/(right|_r|\.r)/.test(n) && /arm|shoulder|hand/.test(n))return 'rightArm';
        if (/(left|_l|\.l)/.test(n) && /leg|thigh|foot/.test(n))    return 'leftLeg';
        if (/(right|_r|\.r)/.test(n) && /leg|thigh|foot/.test(n))   return 'rightLeg';
        if (/finger|thumb/.test(n))                                  return 'fingers';
        return 'misc';
    }

    buildControlRigProfile(object, bones) {
        const controls = bones.map(bone => {
            const props   = this.boneProperties.get(bone)   || {};
            const rel     = this.boneRelationships.get(bone) || {};
            const role    = this.classifyRigRole(bone);
            const chain   = this.classifyRigChain(bone);
            const layer   = this.boneLayerAssign.get(bone) ?? 0;

            return {
                name:       bone.name,
                uuid:       bone.uuid,
                parentUuid: rel.parent?.uuid || null,
                childUuids: (rel.children || []).filter(c => c.isBone).map(c => c.uuid),
                depth:      rel.depth ?? 0,
                role, chain, layer,
                symmetry:         props.symmetry || 'center',
                isIK:             !!props.isIK,
                isIKTarget:       !!props.isIKTarget,
                isPole:           !!props.isPole,
                isAuthoredControl:!!props.isControl,
                isControl:        !!props.isControl || ['control','root','ik','ik-target','pole'].includes(role),
                deform:           props.deform !== false,
                constraintCount:  (this.constraints.get(bone) || []).length
            };
        });

        const chains = {};
        controls.forEach(c => { (chains[c.chain] = chains[c.chain] || []).push(c); });

        const profile = {
            objectUuid:   object.uuid,
            objectName:   object.name || 'Rig',
            generatedAt:  Date.now(),
            controls, chains,
            rootControls:          controls.filter(c => c.role === 'root'),
            ikControls:            controls.filter(c => c.role === 'ik'),
            authoredControllerCount: controls.filter(c => c.isAuthoredControl).length,
            controllerCount:       controls.filter(c => c.isControl).length,
            deformCount:           controls.filter(c => c.deform).length,
            totalBones:            controls.length
        };

        this.controlRigProfiles.set(object.uuid, profile);
        object.userData.controlRigProfile = profile;
        return profile;
    }

    /* ═══════════════════════════════════════════════════════════
       VISUAL CREATION
    ═══════════════════════════════════════════════════════════ */

    createBoneVisuals(bone) {
        const props = this.boneProperties.get(bone) || {};
        const role  = this.classifyRigRole(bone);

        /* Choose geometry */
        let geo;
        // Authored control bones always use curve-style controls, even when
        // deform bones are displayed as octahedrons. This makes new vehicle
        // and prop rigs immediately readable in the 3D Rig View.
        if (this.displayMode === 'custom' || props.isControl) {
            const shape = props.isControl ? 'circle' :
                          props.isIK      ? 'diamond' :
                          props.isPole    ? 'cross'   : null;
            if (shape) {
                /* Line-based custom shape */
                const lineMat = new THREE.LineBasicMaterial({
                    color: this._boneBaseColor(bone, props, role),
                    depthTest: !this.xrayMode,
                    transparent: true, opacity: 0.9
                });
                const lineObj = new THREE.LineLoop(this.controlShapes[shape].clone(), lineMat);
                lineObj.renderOrder = 999;
                lineObj.userData.targetBone = bone;

                const joint = this._makeJoint(props, role);
                joint.userData.targetBone = bone;
                const controlScale = Number(bone.userData?.rigControlSize) || 0.6;
                lineObj.scale.setScalar(controlScale);
                if (bone.userData?.rigGenerated) {
                    joint.add(new THREE.AxesHelper(Math.max(0.18, controlScale * 0.55)));
                }
                bone.add(lineObj); bone.add(joint);

                this.boneVisuals.set(bone, {
                    body: lineObj,
                    outline: lineObj,
                    joint,
                    originalColor: lineMat.color.getHex(),
                    label: null,
                    isCustomControl: true,
                    controlScale
                });
                this.controls.push(lineObj, joint);
                return;
            }
        }

        geo = (this.geometries[this.displayMode] || this.geometries.octahedral).clone();

        const color = this._boneBaseColor(bone, props, role);

        const bodyMat = new THREE.MeshLambertMaterial({
            color, transparent: true,
            opacity:    this.xrayMode ? 0.35 : 0.25,
            depthTest:  !this.xrayMode,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const body = new THREE.Mesh(geo, bodyMat);
        body.renderOrder = 999;
        body.userData.targetBone = bone;

        /* Outline */
        const edgeGeo  = new THREE.EdgesGeometry(geo);
        const outline  = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
            color: this.theme.outline, depthTest: !this.xrayMode,
            transparent: true, opacity: 0.85, linewidth: 2
        }));
        body.add(outline);

        /* Joint sphere */
        const joint = this._makeJoint(props, role);
        joint.userData.targetBone = bone;

        /* Optional label */
        let label = null;
        if (this.showNames) {
            label = this.createBoneLabel(bone.name);
            joint.add(label);
        }

        /* Optional axes */
        if (this.showAxes) joint.add(new THREE.AxesHelper(0.1));

        bone.add(body); bone.add(joint);

        this.boneVisuals.set(bone, { body, outline, joint, originalColor: color, label });
        this.controls.push(body, joint);
    }

    _makeJoint(props, role) {
        const size = this.displayMode === 'stick' ? 0.04 : 0.09;
        const color = (role === 'root')       ? this.theme.rootControl :
                      (role === 'ik-target')  ? this.theme.ikTarget    :
                      (props?.isIK)           ? this.theme.ik          : this.theme.joint;
        const mat = new THREE.MeshBasicMaterial({
            color, depthTest: !this.xrayMode,
            transparent: true, opacity: 0.9
        });
        const joint = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 12), mat);
        joint.renderOrder = 1000;
        joint.userData.targetBone = null; // set per-bone after creation
        return joint;
    }

    _boneBaseColor(bone, props, role) {
        const n = bone.name.toLowerCase();
        if (role === 'root')      return this.theme.rootControl;
        if (props.isControl)      return this.theme.control;
        if (props.isIKTarget)     return this.theme.ikTarget;
        if (props.isIK)           return this.theme.ik;
        if (props.isPole)         return this.theme.ik;
        if (n.includes('left'))   return this.theme.left;
        if (n.includes('right'))  return this.theme.right;
        if (props.deform === false) return this.theme.nonDeform;
        return this.theme.bone;
    }

    createBoneLabel(text) {
        const cvs = document.createElement('canvas');
        cvs.width = 256; cvs.height = 48;
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, 256, 48);
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.fillStyle = '#ffffc0';
        ctx.textAlign = 'center';
        ctx.fillText(text, 128, 32);
        const tex = new THREE.CanvasTexture(cvs);
        const sp  = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
        sp.scale.set(0.32, 0.06, 1);
        sp.position.set(0, 0.12, 0);
        return sp;
    }

    /* ═══════════════════════════════════════════════════════════
       COLOR & SELECTION VISUALS
    ═══════════════════════════════════════════════════════════ */

    applyBoneColor(bone, visual, isSelected, isHovered) {
        const props = this.boneProperties.get(bone) || {};
        const role  = this.classifyRigRole(bone);
        let color;
        if (isSelected)       color = this.theme.boneSelected;
        else if (isHovered)   color = this.theme.boneHover;
        else                  color = this._boneBaseColor(bone, props, role);
        visual.body.material.color.set(color);
        visual.originalColor = color;
    }

    updateHoverState(newHover) {
        if (this.hoveredBone && !this.selectedBones.has(this.hoveredBone)) {
            const v = this.boneVisuals.get(this.hoveredBone);
            if (v) this.applyBoneColor(this.hoveredBone, v, false, false);
        }
        this.hoveredBone = newHover;
        if (this.hoveredBone && !this.selectedBones.has(this.hoveredBone)) {
            const v = this.boneVisuals.get(this.hoveredBone);
            if (v) { v.body.material.color.set(this.theme.boneHover); v.body.material.opacity = 0.75; }
        }
    }

    updateSelectionVisuals() {
        this.boneVisuals.forEach((visual, bone) => {
            const isSel = this.selectedBones.has(bone);
            if (isSel) {
                visual.body.material.color.set(
                    bone === this.selectedBone ? this.theme.boneSelected : this.theme.boneActive
                );
                visual.body.material.opacity = 0.95;
                if (visual.outline?.material) visual.outline.material.color.set(this.theme.outlineSelected);
            } else {
                this.applyBoneColor(bone, visual, false, bone === this.hoveredBone);
                visual.body.material.opacity = this.xrayMode ? 0.55 : 0.8;
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════
       SELECTION HELPERS
    ═══════════════════════════════════════════════════════════ */

    findBoneFromMesh(mesh) {
        let t = mesh;
        while (t && !t.userData.targetBone) t = t.parent;
        return t?.userData.targetBone || null;
    }

    clearBoneSelectionState(dispatch = false, owner = null) {
        this.selectedBones.clear();
        this.selectedBone = null;
        this.boneVisuals.forEach((visual, bone) => {
            this.applyBoneColor(bone, visual, false, bone === this.hoveredBone);
            visual.body.material.opacity = this.xrayMode ? 0.55 : 0.8;
            if (visual.joint?.material) visual.joint.material.color.set(this.theme.joint);
            if (visual.outline?.material) visual.outline.material.color.set(this.theme.outline);
        });
        if (dispatch) {
            window.dispatchEvent(new CustomEvent('rigSelectionChanged', {
                detail: { bone: null, owner: owner || null, rigProfile: this.getRigProfile(owner) }
            }));
        }
    }

    syncSelectionFromScene(activeObject = null) {
        if (
            activeObject?.isObject3D &&
            !activeObject.isBone &&
            !activeObject.userData?.isSystemObject &&
            !activeObject.userData?.targetBone
        ) {
            this.lastSelectedRigPart = activeObject;
        }
        const sceneBones  = this.getSceneSelectedBones();
        const primaryBone = activeObject?.isBone && this.boneVisuals.has(activeObject)
            ? activeObject : (sceneBones[sceneBones.length - 1] || null);
        const owner = primaryBone
            ? this.getRigOwnerForBone(primaryBone)
            : (activeObject && this.getRigProfile(activeObject) ? activeObject : null);

        this.clearBoneSelectionState(false, owner);
        sceneBones.forEach(b => this.selectedBones.add(b));
        this.selectedBone = primaryBone;
        this.updateSelectionVisuals();
        if (this.selectedBone && this.transformControls?.attach) {
            this.transformControls.attach(this.selectedBone);
        }
        if (this.selectedBone) this.focusSelectionInTimeline();

        window.dispatchEvent(new CustomEvent('rigSelectionChanged', {
            detail: { bone: this.selectedBone, owner: owner || null, rigProfile: this.getRigProfile(owner) }
        }));
    }

    requestBoneSelection(bone, options = {}) {
        if (!bone?.isBone) return null;
        const { additive = false, toggleIfSelected = false } = options;
        if (additive && typeof window.addToSelection === 'function')
            return window.addToSelection(bone, toggleIfSelected, { source: 'rig' });
        if (typeof window.selectObject === 'function')
            return window.selectObject(bone, { source: 'rig' });
        return null;
    }

    requestBoneChainSelection(bone) {
        if (!bone?.isBone) return [];
        const chain = [];
        let cur = bone;
        while (cur?.isBone) { if (!chain.includes(cur)) chain.push(cur); cur = cur.parent; }
        this.traverseBoneChildren(bone, chain);
        if (typeof window.selectObject === 'function') {
            window.selectObject(bone, { source: 'rig' });
            if (typeof window.addToSelection === 'function')
                chain.slice(1).forEach(b => window.addToSelection(b, false, { source: 'rig' }));
        }
        return chain;
    }

    clearActiveBoneSelection() {
        const active = window.selectedObject?.isBone ? window.selectedObject : this.selectedBone;
        if (active?.isBone) {
            const owner = this.getRigOwnerForBone(active);
            if (owner && typeof window.selectObject === 'function') {
                window.selectObject(owner, { source: 'rig' });
                return owner;
            }
        }
        this.clearBoneSelectionState(true, null);
        if (typeof window.clearSelection === 'function') return window.clearSelection();
        return null;
    }

    toggleBoneSelection(bone) {
        return this.requestBoneSelection(bone, { additive: true, toggleIfSelected: true });
    }

    selectBoneChain(bone)   { return this.requestBoneChainSelection(bone); }
    traverseBoneChildren(bone, col) {
        bone.children.forEach(c => {
            if (c.isBone && !col.includes(c)) { col.push(c); this.traverseBoneChildren(c, col); }
        });
    }

    selectAllBones() {
        const bones = Array.from(this.boneVisuals.keys());
        if (!bones.length) return;
        if (typeof window.selectObject === 'function') {
            window.selectObject(bones[0], { source: 'rig' });
            if (typeof window.addToSelection === 'function')
                bones.slice(1).forEach(b => window.addToSelection(b, false, { source: 'rig' }));
        }
    }

    selectLinked()    { if (this.selectedBone) this.selectBoneChain(this.selectedBone); }
    deselectAll()     { return this.clearActiveBoneSelection(); }

    invertSelection() {
        const cur = new Set(this.getSceneSelectedBones());
        const next = Array.from(this.boneVisuals.keys()).filter(b => !cur.has(b));
        if (!next.length) { this.clearActiveBoneSelection(); return; }
        if (typeof window.selectObject === 'function') {
            window.selectObject(next[0], { source: 'rig' });
            if (typeof window.addToSelection === 'function')
                next.slice(1).forEach(b => window.addToSelection(b, false, { source: 'rig' }));
        }
    }

    /* ═══════════════════════════════════════════════════════════
       VISIBILITY & X-RAY
    ═══════════════════════════════════════════════════════════ */

    toggleXRay() {
        this.xrayMode = !this.xrayMode;
        this.boneVisuals.forEach(v => {
            v.body.material.depthTest  = !this.xrayMode;
            v.body.material.depthWrite = !this.xrayMode;
            v.body.material.opacity    = this.xrayMode ? 0.55 : 0.8;
            if (v.joint?.material)   v.joint.material.depthTest   = !this.xrayMode;
            if (v.outline?.material) v.outline.material.depthTest = !this.xrayMode;
        });
        this.skeletonHelpers.forEach(h => { h.material.depthTest = !this.xrayMode; });
    }

    hideSelected() {
        this.selectedBones.forEach(bone => {
            const v = this.boneVisuals.get(bone);
            if (v) { v.body.visible = false; v.joint.visible = false; }
        });
    }

    showAllBones() {
        this.boneVisuals.forEach(v => { v.body.visible = true; v.joint.visible = true; });
    }

    setRigVisibility(object, visible) {
        this.getBonesForObject(object).forEach(bone => {
            const v = this.boneVisuals.get(bone);
            if (v) { v.body.visible = visible; v.joint.visible = visible; }
        });
        const h = object?.uuid ? this.skeletonHelpers.get(object.uuid) : null;
        if (h) h.visible = visible;
    }

    showRigForObject(o) { this.setRigVisibility(o, true); }
    hideRigForObject(o) { this.setRigVisibility(o, false); }

    /* ═══════════════════════════════════════════════════════════
       DISPLAY MODE  (bug-fix: collect bones BEFORE clearing)
    ═══════════════════════════════════════════════════════════ */

    setDisplayMode(mode) {
        if (!this.geometries[mode] && mode !== 'custom') return;
        this.displayMode = mode;

        const bones          = Array.from(this.boneVisuals.keys());   // ← collect first
        const selectedBackup = new Set(this.selectedBones);

        bones.forEach(bone => {
            const v = this.boneVisuals.get(bone);
            if (!v) return;
            bone.remove(v.body);
            bone.remove(v.joint);
            v.body.geometry?.dispose();
            v.body.material?.dispose();
            v.outline.geometry?.dispose?.();
            v.outline.material?.dispose?.();
            v.joint.geometry?.dispose();
            v.joint.material?.dispose();
        });

        this.boneVisuals.clear();
        this.controls = [];

        bones.forEach(bone => this.createBoneVisuals(bone));

        this.selectedBones = selectedBackup;
        this.selectedBone  = selectedBackup.values().next().value || null;
        this.updateSelectionVisuals();
    }

    setBoneSize(size) {
        this.boneSize = Math.max(0.1, size);
    }

    /* ═══════════════════════════════════════════════════════════
       HELPERS (scene utilities)
    ═══════════════════════════════════════════════════════════ */

    getRigProfile(objectOrUuid) {
        const id = typeof objectOrUuid === 'string' ? objectOrUuid : objectOrUuid?.uuid;
        return id ? this.controlRigProfiles.get(id) || null : null;
    }

    getRigOwnerForBone(bone) {
        if (!bone?.isBone) return null;
        let generatedRoot = bone;
        while (generatedRoot?.parent?.isBone) generatedRoot = generatedRoot.parent;
        const generatedOwnerUuid = generatedRoot?.userData?.rigOwnerUuid;
        if (generatedOwnerUuid) {
            const generatedOwner = this.scene.getObjectByProperty('uuid', generatedOwnerUuid);
            if (generatedOwner) return generatedOwner;
        }
        const skinnedOwner = typeof findSkinnedMeshOwner === 'function' ? findSkinnedMeshOwner(bone) : null;
        if (skinnedOwner) return skinnedOwner;
        let cursor = bone;
        let rootBone = bone;
        while (cursor?.parent) {
            if (!cursor.parent.isBone) return cursor.parent;
            rootBone = cursor.parent;
            cursor = cursor.parent;
        }
        return rootBone.parent || rootBone;
    }

    getSceneSelectedBones() {
        const order = Array.isArray(window.selectedObjects) ? window.selectedObjects : [];
        const result = [];
        order.forEach(o => {
            if (o?.isBone && this.boneVisuals.has(o) && !result.includes(o)) result.push(o);
        });
        if (window.selectedObject?.isBone && this.boneVisuals.has(window.selectedObject)
            && !result.includes(window.selectedObject)) result.push(window.selectedObject);
        return result;
    }

    getBonesForObject(object) {
        const bones = [];
        const addBone = bone => {
            if (bone?.isBone && !bones.includes(bone)) bones.push(bone);
        };
        object?.traverse?.(node => addBone(node));
        object?.skeleton?.bones?.forEach(addBone);

        const generatedRoot = object?.uuid
            ? this.generatedRigRoots.get(object.uuid)
            : null;
        generatedRoot?.traverse?.(node => addBone(node));

        // Generic rig owners are normally children of the generated root.
        // Discover that root even after a project restore that repopulated the
        // userData marker before the in-memory map.
        let ancestor = object?.parent || null;
        while (ancestor) {
            if (ancestor.isBone && ancestor.userData?.rigOwnerUuid === object?.uuid) {
                ancestor.traverse?.(node => addBone(node));
                break;
            }
            ancestor = ancestor.parent;
        }
        return bones;
    }

    selectRigControl(objectUuid, controlUuid) {
        const owner = this.scene.getObjectByProperty('uuid', objectUuid);
        if (!owner) return null;
        const bone = owner.getObjectByProperty('uuid', controlUuid);
        if (bone?.isBone) { this.requestBoneSelection(bone); this.focusSelectionInTimeline(); return bone; }
        return null;
    }

    focusSelectionInTimeline() {
        if (typeof updateLayersUI   === 'function') updateLayersUI();
        if (typeof updateKeyframesUI=== 'function') updateKeyframesUI();
        if (typeof renderGraph      === 'function' && window.isGraphView) renderGraph();
    }

    scanSceneForRigs() {
        let found = 0;
        this.scene.traverse(o => {
            if (!o?.isObject3D) return;
            if (this.getBonesForObject(o).length > 0) { this.setupRigForObject(o); found++; }
        });
        return found;
    }

    removeRigForObject(object) {
        this.getBonesForObject(object).forEach(bone => {
            const v = this.boneVisuals.get(bone);
            if (!v) return;
            bone.remove(v.body); bone.remove(v.joint);
            v.body.geometry?.dispose();   v.body.material?.dispose();
            v.outline.geometry?.dispose?.(); v.outline.material?.dispose?.();
            v.joint.geometry?.dispose();  v.joint.material?.dispose();
            this.boneVisuals.delete(bone);
            this.boneRelationships.delete(bone);
            this.boneProperties.delete(bone);
            bone.userData.hasVisual = false;
        });
        if (object?.uuid) {
            const h = this.skeletonHelpers.get(object.uuid);
            if (h) { this.scene.remove(h); h.dispose?.(); this.skeletonHelpers.delete(object.uuid); }
            this.controlRigProfiles.delete(object.uuid);
            this.poseRecordings.delete(object.uuid);
            this.runtimeProfiles.delete(object.uuid);
            this.animationMixers.get(object.uuid)?.stopAllAction?.();
            this.animationMixers.delete(object.uuid);
            this.animationActions.delete(object.uuid);
            delete object.userData.controlRigProfile;
        }
        this.controls = this.controls.filter(m => m?.userData?.targetBone && this.boneVisuals.has(m.userData.targetBone));
    }

    /* ═══════════════════════════════════════════════════════════
       UPDATE LOOP
    ═══════════════════════════════════════════════════════════ */

    update(deltaSeconds = null) {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        const delta = Number.isFinite(deltaSeconds)
            ? Math.max(0, Math.min(0.25, deltaSeconds))
            : Math.max(0, Math.min(0.25, now - this._lastUpdateTime));
        this._lastUpdateTime = now;

        /* Baked animation clips drive bones first; constraints then provide
           the Control Rig / gameplay override pass. */
        this.animationMixers.forEach((mixer) => mixer.update(delta));
        this.evaluateConstraints();

        /* Skeleton helpers */
        this.skeletonHelpers.forEach((helper, uuid) => {
            const owner = this.scene.getObjectByProperty('uuid', uuid);
            if (owner) {
                if (typeof helper?.update === 'function') helper.update();
                else if (typeof helper?.updateMatrixWorld === 'function') helper.updateMatrixWorld(true);
            }
            else { this.scene.remove(helper); helper.dispose?.(); this.skeletonHelpers.delete(uuid); }
        });

        /* Bone visuals */
        this.boneVisuals.forEach((visual, bone) => {
            const rel = this.boneRelationships.get(bone);
            if (!rel) return;

            /* Layer visibility */
            const layer = this.boneLayers[this.boneLayerAssign.get(bone) ?? 0];
            if (layer && !layer.visible) {
                visual.body.visible = visual.joint.visible = false;
                return;
            }

            if (visual.isCustomControl) {
                const size = visual.controlScale || 0.6;
                visual.body.scale.setScalar(size);
                visual.joint.scale.setScalar(Math.max(0.14, size * 0.18));
                return;
            }

            const targetChild = rel.children.find(c => c.isBone);
            if (targetChild) {
                const localPos = targetChild.position;
                const dist     = localPos.length();
                if (dist > 0.001) {
                    visual.body.quaternion.setFromUnitVectors(
                        new THREE.Vector3(0,1,0),
                        localPos.clone().normalize()
                    );
                    const length = dist;
                    const width  = Math.min(0.08 * dist, 0.12) * (this.boneSize || 1);
                    visual.body.scale.set(width, length, width);
                    const jointSize = Math.max(0.01, Math.min(0.03, dist * 0.1));
                    visual.joint.scale.setScalar(jointSize);
                }
            } else {
                const ls = 0.04 * (this.boneSize || 1);
                visual.body.scale.set(ls, ls * 2, ls);
                visual.joint.scale.setScalar(ls * 0.5);
            }
        });

        /* Constraint lines */
        this._updateConstraintLines();

        /* Add-bone highlight */
        if (this.isAddingBone && this._addBoneParent) {
            const v = this.boneVisuals.get(this._addBoneParent);
            if (v) v.body.material.color.set(this.theme.addMode);
        }
    }

    _updateConstraintLines() {
        /* Remove old lines */
        this.constraintLines.forEach(l => this.scene.remove(l));
        this.constraintLines = [];

        this.constraints.forEach((list, bone) => {
            list.forEach(c => {
                if (!c.enabled || !c.target?.isBone) return;
                const from = new THREE.Vector3(), to = new THREE.Vector3();
                bone.getWorldPosition(from);
                c.target.getWorldPosition(to);
                const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
                const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
                    color: c.type === 'ik' ? this.theme.ik : this.theme.constraint,
                    depthTest: false, transparent: true, opacity: 0.5, linewidth: 1
                }));
                line.renderOrder = 997;
                this.scene.add(line);
                this.constraintLines.push(line);
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════
       DISPOSE
    ═══════════════════════════════════════════════════════════ */

    dispose() {
        this.boneVisuals.forEach(v => {
            v.body.geometry?.dispose();  v.body.material?.dispose();
            v.outline.geometry?.dispose?.(); v.outline.material?.dispose?.();
            v.joint.geometry?.dispose(); v.joint.material?.dispose();
        });
        this.skeletonHelpers.forEach(h => { this.scene.remove(h); h.dispose?.(); });
        Object.values(this.geometries).forEach(g => g.dispose());
        Object.values(this.controlShapes).forEach(g => g.dispose());
        this.constraintLines.forEach(l => this.scene.remove(l));
        this.animationMixers.forEach((mixer) => mixer.stopAllAction?.());
        this.animationMixers.clear();
        this.animationActions.clear();
        this.poseRecordings.clear();
        this.runtimeProfiles.clear();
    }
}
