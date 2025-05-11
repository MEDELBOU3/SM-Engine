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
        previewScene.add(clonedObject);
    });

    // Ensure proper lighting
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.8)); // Add ambient light

    // Set up the preview camera
    previewGameCamera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    previewGameCamera.position.copy(camera.position);
    previewGameCamera.quaternion.copy(camera.quaternion);
    previewScene.add(previewGameCamera);

    // Render function
    function renderPreview() {
        previewAnimationFrame = requestAnimationFrame(renderPreview);
        previewGameRenderer.render(previewScene, previewGameCamera);
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


