// SCENARIO 1: Animate a bone in your character
// ---------------------------------------------

class ArmBoneController {
    constructor(object) {
        this.object = object;
        this.waveSpeed = 3.0;
        this.waveAmount = 0.5;
        this.originalRotation = this.object.rotation.clone();
    }

    start() {
        customConsole.log("Waving arm bone: " + this.object.name);
    }

    update(delta, time) {
        // Create waving motion
        this.object.rotation.z = this.originalRotation.z + 
            Math.sin(time * this.waveSpeed) * this.waveAmount;
    }

    onDestroy() {
        this.object.rotation.copy(this.originalRotation);
    }
}
return ArmBoneController;



// SCENARIO 2: Create interactive object
// --------------------------------------

class InteractiveCube {
    constructor(object) {
        this.object = object;
        this.isHovered = false;
        this.originalScale = this.object.scale.clone();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Setup click listener
        window.addEventListener('click', () => this.onClick());
    }

    onClick() {
        const camera = EditorAccess.camera;
        this.raycaster.setFromCamera(this.mouse, camera);
        const intersects = this.raycaster.intersectObject(this.object);
        
        if (intersects.length > 0) {
            customConsole.log("Cube clicked!");
            this.object.material.color.setHex(Math.random() * 0xffffff);
        }
    }

    update(delta, time) {
        // Hover effect
        const scale = this.isHovered ? 1.2 : 1.0;
        this.object.scale.lerp(
            this.originalScale.clone().multiplyScalar(scale), 
            delta * 5
        );
    }

    onDestroy() {
        this.object.scale.copy(this.originalScale);
    }
}
return InteractiveCube;

// SCENARIO 3: Control model animations
// -------------------------------------

class CharacterController {
    constructor(object) {
        this.object = object;
        this.mixer = new THREE.AnimationMixer(this.object);
        
        // Load animations from userData
        this.actions = {};
        if (object.userData.animations) {
            object.userData.animations.forEach(clip => {
                this.actions[clip.name] = this.mixer.clipAction(clip);
            });
        }
    }

    start() {
        // Play idle animation
        if (this.actions['Idle']) {
            this.actions['Idle'].play();
        }
    }

    update(delta, time) {
        this.mixer.update(delta);
        
        // Switch to walk after 3 seconds
        if (time > 3 && time < 3.1 && this.actions['Walk']) {
            this.actions['Idle'].fadeOut(0.5);
            this.actions['Walk'].fadeIn(0.5).play();
        }
    }
}
return CharacterController;


// ============================================================================
// STEP 6: ADVANCED FEATURES
// ============================================================================

// A. Detect object type programmatically
const selectedObj = EditorAccess.getSelectedObject();
if (selectedObj && codeEditorManager) {
    const type = codeEditorManager.detectObjectType(selectedObj);
    console.log('Object type:', type);
    // Returns: 'mesh', 'bone', 'skinnedMesh', 'group', 'light', 'camera', 'object3d'
}

// B. Generate custom template
if (codeEditorManager) {
    const customTemplate = codeEditorManager.getTemplateForType('mesh', 'MyCustomCube');
    console.log(customTemplate);
}

// C. Check if object has script
const obj = EditorAccess.getSelectedObject();
if (obj && obj.userData.scriptSourceCode) {
    console.log('Object has script:', obj.userData.scriptClassName);
} else {
    console.log('No script attached');
}

// ============================================================================
// STEP 7: TROUBLESHOOTING
// ============================================================================

/*
ISSUE: Editor doesn't show template when I select object
SOLUTION: 
1. Make sure object.userData.selectable = true
2. Check if TransformControls is attached to object
3. Call: editorCommands.info() to see object details

ISSUE: Script doesn't run
SOLUTION:
1. Check console for errors
2. Make sure scriptManager.update(delta) is called in animate()
3. Verify object has start() and update() methods

ISSUE: Changes don't apply to bones
SOLUTION:
1. Bones need to update their parent skeleton
2. Make sure you're modifying bone.rotation, not bone.position
3. Use originalRotation to reset properly

ISSUE: Model animations don't play
SOLUTION:
1. Check if model has animations: obj.userData.animations
2. Verify mixer is updating in update() method
3. Use mixer.setTime() for scrubbing

ISSUE: Template is wrong for my object
SOLUTION:
1. Check object type: editorCommands.info()
2. Manually load correct template: editorCommands.template()
3. If object is custom, it will use 'object3d' template
*/
