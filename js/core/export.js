let previewGameRenderer, previewGameCamera, previewScene, previewAnimationFrame;


function showPreview() {
    const container = document.getElementById('preview-container');
    container.style.display = 'block';

    if (!previewGameRenderer) {
        previewGameRenderer = new THREE.WebGLRenderer({ antialias: true });
        previewGameRenderer.setSize(container.clientWidth, container.clientHeight);
        previewGameRenderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(previewGameRenderer.domElement);
    }

    // Set up a dedicated scene for preview
    previewScene = new THREE.Scene();

    // Clone all objects from the main scene
    scene.traverse((object) => {
        let clonedObject;
        if (object.isMesh) {
            clonedObject = object.clone();
            clonedObject.material = object.material.clone(); // Ensure material is cloned
        } else if (object.isLight) {
            clonedObject = object.clone(); // Clone lights too
        } else {
            clonedObject = object.clone();
        }
        //previewScene.add(clonedObject);
    });

    // Ensure proper lighting
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.8)); // Add ambient light

    // Set up the preview camera
    previewGameCamera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    previewGameCamera.position.copy(camera.position);
    previewGameCamera.quaternion.copy(camera.quaternion);
    previewScene.add(previewGameCamera);
   

    /*function renderPreview() {
        previewAnimationFrame = requestAnimationFrame(renderPreview);
        previewGameRenderer.render(previewScene, previewGameCamera);
    }
    renderPreview();*/

   function renderPreview() {
    if (!activeCamera) return;

    
    if (activeCamera instanceof THREE.CubeCamera) {
        // Special handling for cube camera
        const cubeCamera = activeCamera;
        cubeCamera.update(renderer, scene);
        
        // Create temporary scene with cube map
        const tempScene = new THREE.Scene();
        const cubeMaterial = new THREE.MeshBasicMaterial({
            envMap: cubeCamera.renderTarget.texture,
            side: THREE.BackSide
        });
        const cube = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), cubeMaterial);
        tempScene.add(cube);
        
        // Render with preview camera
        previewRenderer.render(tempScene, cubeCamera.userData.previewCamera);
    } else {
        // Regular camera preview
        previewRenderer.render(scene, activeCamera);
    }
    requestAnimationFrame(renderPreview);
}
renderPreview();

}

// Close preview function
function closePreview() {
    const container = document.getElementById('preview-container');
    container.style.display = 'none';

    if (previewAnimationFrame) cancelAnimationFrame(previewAnimationFrame);
    if (previewGameRenderer) previewGameRenderer.dispose();

    previewScene = null;
    previewGameCamera = null;
    previewGameRenderer = null;
}

// Event listeners
document.getElementById('preview-button').addEventListener('click', showPreview);
document.getElementById('close-preview').addEventListener('click', closePreview);


//button to open and close the preview
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('togglePreview');
    const cameraPreview = document.getElementById('cameraPreview');
    const toggleIcon = toggleButton.querySelector('i');

    toggleButton.addEventListener('click', () => {
        // Toggle the hidden class
        cameraPreview.classList.toggle('hidden');

        // Update icon based on visibility
        if (cameraPreview.classList.contains('hidden')) {
            toggleIcon.classList.remove('fa-eye');
            toggleIcon.classList.add('fa-eye-slash');
        } else {
            toggleIcon.classList.remove('fa-eye-slash');
            toggleIcon.classList.add('fa-eye');
        }
    });
});

//##############################
//#######  UI  #################
//##############################
// Add this new function to update UI
function updateToolUIBTN(toolId) {
    document.querySelectorAll('.tool-btn').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(toolId).classList.add('active');
}

document.querySelectorAll('.tool-btn').forEach(button => {
    button.addEventListener('click', () => {
        updateToolUIBTN(button.id);
    });
});

function updateToolUIBTNBr(toolId) {
    document.querySelectorAll('.tool-button').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById(toolId).classList.add('active');
}

document.querySelectorAll('.tool-button').forEach(button => {
    button.addEventListener('click', () => {
        updateToolUIBTNBr(button.id);
    });
});
