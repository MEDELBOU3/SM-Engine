class Viewport2DManager {
    constructor(camera, controls, scene) {
        this.camera = camera;
        this.controls = controls;
        this.scene = scene;
        this.is2D = false;
        this.currentSubMode = 'layout'; // 'layout' or 'uv'
        this.stored3D = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    }

    enter2DMode() {
        if (this.is2D) return;
        this.is2D = true;

        // 1. Save Perspective
        this.stored3D.pos.copy(this.camera.position);
        this.stored3D.target.copy(this.controls.target);

        // 2. UI Shift
        SecondarySidebar.open('2d');
        document.body.classList.add('mode-2d-active');

        // 3. Animate to Top View
        const focus = window.selectedObject ? window.selectedObject.position : new THREE.Vector3(0,0,0);
        gsap.to(this.camera.position, {
            x: focus.x, y: focus.y + 25, z: focus.z + 0.01,
            duration: 0.8, ease: "power3.out",
            onUpdate: () => this.camera.lookAt(focus),
            onComplete: () => {
                this.controls.enableRotate = false;
                this.controls.target.copy(focus);
                this.controls.update();
                if(window.uvInspector) window.uvInspector.draw();
            }
        });
    }

    setSubMode(mode) {
        this.currentSubMode = mode;
        document.getElementById('btn-2d-layout').classList.toggle('active', mode === 'layout');
        document.getElementById('btn-2d-uv').classList.toggle('active', mode === 'uv');
        
        const uvSection = document.getElementById('uv-inspector-section');
        uvSection.style.opacity = (mode === 'uv') ? '1' : '0.3';
        uvSection.style.pointerEvents = (mode === 'uv') ? 'auto' : 'none';
        
        if(mode === 'uv' && window.uvInspector) window.uvInspector.draw();
    }

    exit2DMode() {
        this.is2D = false;
        this.controls.enableRotate = true;
        document.body.classList.remove('mode-2d-active');
        SecondarySidebar.close();

        gsap.to(this.camera.position, {
            x: this.stored3D.pos.x, y: this.stored3D.pos.y, z: this.stored3D.pos.z,
            duration: 0.8, ease: "power3.inOut"
        });
        this.controls.target.copy(this.stored3D.target);
    }
}
// Helper for UI buttons
window.enter2DMode = () => v2dManager.enter2DMode();
window.exit2DMode = () => v2dManager.exit2DMode();