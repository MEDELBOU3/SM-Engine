// Constants
const LOOK_AT_MODES = {
    PATH: "path",
    ORIGIN: "origin",
};

let plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Not used in current snippet, but kept
let intersectPoint = new THREE.Vector3(); // Not used in current snippet, but kept

// State
let pointsCam = [];
let curve, line;
let cameraFollowIndex = 0;
let lookAtTarget = LOOK_AT_MODES.PATH;
let recording = false;
let mediaRecorder, recordedChunks = [];
let recordingStartTime = 0;
let recordingTimerInterval;
let cameraOnPath = null;
let editModeEnabled = false;
let selectedPoint = null; // Index of the selected point in pointsCam
let pointMarkers = []; // Array to hold the THREE.Mesh objects representing points


// DOM Elements
const addPointBtn = document.getElementById('addPointBtn');
const startCameraBtn = document.getElementById('startCameraBtn');
const toggleLookAtBtn = document.getElementById('toggleLookAtBtn');
const toggleEditBtn = document.getElementById('toggleEditBtn');
const startRecordingBtn = document.getElementById('startRecordingBtn');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');

// Recording status elements (using the icon approach)
const recordingStatusSpan = document.getElementById('recordingStatus'); // The <span> holding icons
const recordStoppedIcon = document.getElementById('record-stopped-icon'); // SVG for stopped
const recordActiveIcon = document.getElementById('record-active-icon'); // SVG for active
const recordingTimer = document.getElementById('recordingTimer') || document.createElement('div'); // Fallback

// Event Listeners
if (addPointBtn) addPointBtn.addEventListener('click', addPointsCam);
if (startCameraBtn) startCameraBtn.addEventListener('click', startCameraAnimation); // Renamed for clarity
if (toggleLookAtBtn) toggleLookAtBtn.addEventListener('click', toggleLookAtMode);
if (toggleEditBtn) toggleEditBtn.addEventListener('click', toggleEditMode);
if (startRecordingBtn) startRecordingBtn.addEventListener('click', startRecording);
if (stopRecordingBtn) stopRecordingBtn.addEventListener('click', stopRecording);

// Initialize camera menu
const cameraToolsToggle = document.getElementById('cameraTools');
if (cameraToolsToggle) {
    cameraToolsToggle.addEventListener('click', function() {
        const cameraMenu = document.getElementById('cameraMenu');
        if (cameraMenu) cameraMenu.classList.toggle('active');
    });
}

// Initialize Transform Controls
function initTransformControlsPath() {
    // Ensure scene, camera, renderer are available
    if (typeof scene === 'undefined' || typeof camera === 'undefined' || typeof renderer === 'undefined') {
        console.error("Scene, camera, or renderer is not defined. Cannot initialize TransformControls.");
        return;
    }

    if (!transformControls) {
        transformControls = new THREE.TransformControls(camera, renderer.domElement);
        transformControls.addEventListener('change', render); // Re-render on transform change

        /*transformControls.addEventListener('dragging-changed', function(event) {
            // Disable orbit controls while transforming
            if (typeof controls !== 'undefined' && controls.enabled !== undefined) {
                controls.enabled = !event.value;
            }
        });*/

        transformControls.addEventListener('dragging-changed', function(event) {
            if (controls && typeof controls.enabled !== 'undefined') { // 'controls' is OrbitControls
               controls.enabled = !event.value;
            }
        });

        transformControls.addEventListener('objectChange', function () {
            if (selectedPoint !== null && transformControls.object) {
                pointsCam[selectedPoint].copy(transformControls.object.position);

                // Instead of full redraw, just update the line geometry
                if (curve && line) {
                    const updatedPoints = curve.getPoints(Math.max(50, pointsCam.length * 10));
                    line.geometry.setFromPoints(updatedPoints);
                }
            }
        });


        /*transformControls.addEventListener('objectChange', function() {
            // This event fires when the object attached to transformControls is changed.
            if (selectedPoint !== null && transformControls.object && pointsCam[selectedPoint]) {
                pointsCam[selectedPoint].copy(transformControls.object.position);
                drawPath(); // Redraw the path with the updated point
            }
        });*/
        scene.add(transformControls);
    }

   
}

// Mouse event listeners for point selection (attach to renderer's DOM element)
if (renderer && renderer.domElement) {
    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);
    renderer.domElement.addEventListener('pointermove', onPointerMove, false);
} else {
    console.warn("Renderer or renderer.domElement not found. Path point selection will not work.");
}


// Functions
function addPointsCam() {
    const x = (Math.random() - 0.5) * 10;
    const y = Math.random() * 2 + 1; // Ensure points are slightly above ground for better visibility
    const z = (Math.random() - 0.5) * 10;
    pointsCam.push(new THREE.Vector3(x, y, z));
    drawPath();
    if (editModeEnabled && pointsCam.length === 1) { // Auto-select first point
        selectedPoint = 0;
        if (pointMarkers[0]) transformControls.attach(pointMarkers[0]);
    }
}

function drawPath() {
    if (typeof scene === 'undefined') return;

    // Remove existing line
    if (line) {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
        line = null;
    }

    // Remove previous point markers
    pointMarkers.forEach(marker => {
        scene.remove(marker);
        marker.geometry.dispose();
        marker.material.dispose();
    });
    pointMarkers = [];

    if (pointsCam.length < 1) { // Allow drawing a single point
        if (transformControls) transformControls.detach();
        selectedPoint = null;
        return;
    }
    
    // Add spheres at each control point
    pointsCam.forEach((point, index) => {
        const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16); // Slightly larger, more segments
        const color = (selectedPoint === index && editModeEnabled) ? 0x00ff00 : 0xffff00; // Green if selected, yellow otherwise
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(point);
        sphere.name = `PathPointMarker_${index}`; // Unique name for debugging
        sphere.userData = { type: 'pathPointMarker', index: index }; // Store index
        scene.add(sphere);
        pointMarkers.push(sphere);
    });


    if (pointsCam.length < 2) { // Need at least 2 points for a curve
        
        if (selectedPoint !== null && pointMarkers[selectedPoint]) {
            // If only one point exists and it's selected, keep transformControls attached
            if (transformControls && transformControls.object !== pointMarkers[selectedPoint]) {
                 transformControls.attach(pointMarkers[selectedPoint]);
            }
        }
        else if (transformControls) {
            transformControls.detach();
        }
        return;
    }


    // Create a smooth curve through all points
    curve = new THREE.CatmullRomCurve3(pointsCam);
    curve.curveType = 'catmullrom'; // or 'centripetal' or 'chordal'
    curve.tension = 0.5; // Adjust tension for smoothness

    // Create visible line for the path
    const pathPoints = curve.getPoints(Math.max(50, pointsCam.length * 10)); // More points for smoother curve
    const geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 }); // Red, slightly thicker
    line = new THREE.Line(geometry, material);
    scene.add(line);
}

function getActiveAddedCamera() {
    if (typeof scene === 'undefined') return null;
    let userCameras = [];
    scene.traverse(function(object) {
        // Check if it's a camera, not the main rendering camera, and not a helper
        if (object.isCamera && object !== camera && !object.isCameraHelper) {
            userCameras.push(object);
        }
    });

    if (userCameras.length > 0) {
        // console.log("Found user camera(s):", userCameras.map(c => c.name || "Unnamed"));
        return userCameras[0]; // Use the first one found
    }
    
    // Fallback for older way if 'objects' array exists (less reliable)
    if (typeof objects !== 'undefined' && Array.isArray(objects)) {
        for (let i = objects.length - 1; i >= 0; i--) {
            if (objects[i] && objects[i].type === 'camera' && objects[i].object && objects[i].object.isCamera && objects[i].object !== camera) {
                console.log("Using camera from 'objects' array:", objects[i].object.name || "Unnamed Camera");
                return objects[i].object;
            }
        }
    }
    return null;
}

function startCameraAnimation() { // Renamed from startCamera
    if (pointsCam.length < 2) {
        alert("Add at least 2 points to create a path!");
        return;
    }
    if (!curve) {
        alert("Path not drawn yet. Please ensure points are added.");
        return;
    }

    cameraOnPath = getActiveAddedCamera();
    if (!cameraOnPath) {
        alert("No added user camera found to animate! Please add a camera to the scene first.");
        return;
    }

    cameraFollowIndex = 0;
    moveCameraShooting();
}

function moveCameraShooting() {
    if (!cameraOnPath || !curve || cameraFollowIndex > 1) {
        if (cameraFollowIndex > 1) console.log("Camera path completed");
        return;
    }

    const progress = cameraFollowIndex;
    const newPos = curve.getPointAt(progress);

    cameraOnPath.position.copy(newPos);

    if (lookAtTarget === LOOK_AT_MODES.PATH) {
        const lookAtProgress = Math.min(progress + 0.001, 1); // Look slightly ahead
        const nextPos = curve.getPointAt(lookAtProgress);
        if (!newPos.equals(nextPos)) { // Avoid looking at self if at the end
             cameraOnPath.lookAt(nextPos);
        }
    } else {
        cameraOnPath.lookAt(0, 0, 0); // Look at origin
    }

    // Update camera helper if it exists
    if (cameraOnPath.helper && cameraOnPath.helper.update) {
        cameraOnPath.helper.update();
    }

    cameraFollowIndex += 0.005; // Adjust speed as needed

    if (cameraFollowIndex <= 1) {
        requestAnimationFrame(moveCameraShooting);
    } else {
        console.log("Camera path completed");
        if (recording) { // If recording, ensure it stops smoothly after path finishes
            // Optional: Add a small delay before stopping recording to capture the last frame
            // setTimeout(stopRecording, 100);
        }
    }
}

function toggleLookAtMode() {
    lookAtTarget = lookAtTarget === LOOK_AT_MODES.PATH ? LOOK_AT_MODES.ORIGIN : LOOK_AT_MODES.PATH;
    alert(`Camera will now look at: ${lookAtTarget === LOOK_AT_MODES.PATH ? "Path Direction" : "Scene Origin (0,0,0)"}`);
}

function toggleEditMode() {
    editModeEnabled = !editModeEnabled;
    initTransformControlsPath(); // Ensure controls are ready

    if (editModeEnabled) {
        if (toggleEditBtn) toggleEditBtn.textContent = "Finish Editing Path"; // Clearer text
        if (renderer && renderer.domElement) renderer.domElement.style.cursor = "default"; // Default for general, pointer for points
        // If points exist, select the last one or first one
        if (pointsCam.length > 0) {
            selectedPoint = selectedPoint !== null ? selectedPoint : 0; // Keep current or select first
             if (pointMarkers[selectedPoint]) {
                transformControls.attach(pointMarkers[selectedPoint]);
            }
        }
        alert("Path edit mode enabled. Click on yellow spheres to select and move them.");
    } else {
        if (toggleEditBtn) toggleEditBtn.textContent = "Edit Camera Path";
        if (transformControls) transformControls.detach();
        if (renderer && renderer.domElement) renderer.domElement.style.cursor = "default";
        selectedPoint = null; // Deselect
        alert("Path edit mode disabled.");
    }
    drawPath(); // Redraw to update point colors and show/hide transform gizmo
}

function onPointerDown(event) {
    if (!editModeEnabled || !transformControls || !renderer || !camera) return;

    // Calculate mouse position in normalized device coordinates (-1 to +1) for raycasting
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera); // Use the main scene camera for picking

    const intersects = raycaster.intersectObjects(pointMarkers, false); // Intersect only visible point markers

    if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        if (intersectedObject.userData && intersectedObject.userData.type === 'pathPointMarker') {
            selectedPoint = intersectedObject.userData.index;
            transformControls.attach(intersectedObject); // Attach to the visual marker
            console.log("Selected point marker:", selectedPoint, intersectedObject.name);
        }
    } else {
        // If clicking on empty space and not on the gizmo itself
        if (!transformControls.dragging) {
            selectedPoint = null;
            transformControls.detach();
        }
    }
    drawPath(); // Redraw to update selection color
    render(); // Ensure gizmo updates immediately
}

function onPointerMove(event) {
    if (!editModeEnabled || !renderer || !camera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(pointMarkers, false);

    if (intersects.length > 0) {
        renderer.domElement.style.cursor = "pointer"; // Pointer when over a draggable point
    } else if (!transformControls || !transformControls.dragging) { // Check if not dragging gizmo
         // Check if hovering over the transform controls gizmo parts
        if (transformControls && transformControls.object) {
            const gizmoIntersects = raycaster.intersectObjects(transformControls.children, true);
            if (gizmoIntersects.length > 0) {
                renderer.domElement.style.cursor = 'move'; // Or specific axis cursors if you want to get fancy
            } else {
                 renderer.domElement.style.cursor = "default";
            }
        } else {
            renderer.domElement.style.cursor = "default";
        }
    }
}


// --- Recording Functions with Icon Updates ---
function updateRecordingVisuals(isRecordingActive) {
    if (recordStoppedIcon && recordActiveIcon && recordingStatusSpan) {
        if (isRecordingActive) {
            recordStoppedIcon.style.display = 'none';
            recordActiveIcon.style.display = 'inline-block';
            recordingStatusSpan.title = "Recording Active";
        } else {
            recordStoppedIcon.style.display = 'inline-block';
            recordActiveIcon.style.display = 'none';
            recordingStatusSpan.title = "Recording Stopped";
        }
    } else {
        // Fallback to text if icons are not found
        if (recordingStatus) { // The original text-based element
            recordingStatus.textContent = isRecordingActive ? "Recording: Active" : "Recording: Stopped";
        }
    }
}


function startRecording() {
    if (!renderer || !renderer.domElement || !renderer.domElement.captureStream) {
        alert("Recording not supported in this browser (requires captureStream API)!");
        return;
    }
    if (recording) {
        alert("Recording is already in progress!");
        return;
    }

    cameraOnPath = getActiveAddedCamera();
    if (!cameraOnPath) {
        alert("No added user camera found to record from! Please add a camera to the scene first.");
        return;
    }
    if (pointsCam.length < 2 || !curve) {
        alert("Please define a camera path with at least two points before recording.");
        return;
    }

    // Set the active camera for recording - IMPORTANT for renderer.captureStream
    // This assumes your main 'camera' var is the one used by 'renderer.render'
    // To record from cameraOnPath, you might need to temporarily switch the main camera
    // OR, if your setup allows, ensure cameraOnPath is what's being rendered.
    // For simplicity, let's assume you want to record what cameraOnPath sees.
    // One way: const oldCamera = camera; activeCamera = cameraOnPath; // then switch back in stopRecording
    // However, captureStream usually captures the canvas, so what's rendered to canvas is captured.
    // So, ensure cameraOnPath is providing the view to the main renderer if you want its perspective.
    // The moveCameraShooting function already moves cameraOnPath.
    // Your `renderer.render(scene, camera)` call in `render()` uses the global `camera`.
    // If you want to record `cameraOnPath`'s view, you need to render with it during recording.
    // This is a bit complex with current structure. Simplest: User ensures `camera` IS `cameraOnPath` for recording.
    // Or, animate the main `camera` along the path if that's simpler.
    // For now, I'll assume `moveCameraShooting` correctly positions `cameraOnPath` and it's the intended view.

    try {
        recordedChunks = [];
        // Prefer vp9 for quality if available, fallback to vp8 or system default
        const options = { mimeType: 'video/webm; codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm; codecs=vp8';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm'; // Default
            }
        }
        
        const stream = renderer.domElement.captureStream(30); // 30 FPS
        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = saveVideo;
        mediaRecorder.onerror = (e) => {
            console.error("MediaRecorder error:", e);
            alert("Recording error: " + e.error.name);
            stopRecording(); // Clean up
        };

        mediaRecorder.start();
        recording = true;
        recordingStartTime = Date.now();
        updateRecordingTimer(); // Initial display
        recordingTimerInterval = setInterval(updateRecordingTimer, 1000);
        
        updateRecordingVisuals(true);

        // Start camera movement for the recording
        cameraFollowIndex = 0;
        moveCameraShooting();

        console.log("Recording started with camera: " + (cameraOnPath.name || "Unnamed Camera") + " using " + options.mimeType);
        if(startRecordingBtn) startRecordingBtn.disabled = true;
        if(stopRecordingBtn) stopRecordingBtn.disabled = false;
        if(addPointBtn) addPointBtn.disabled = true;
        if(toggleEditBtn) toggleEditBtn.disabled = true;


    } catch (error) {
        console.error("Error starting recording:", error);
        alert("Error starting recording: " + error.message);
        recording = false; // Reset state
        updateRecordingVisuals(false);
        if(startRecordingBtn) startRecordingBtn.disabled = false;
        if(stopRecordingBtn) stopRecordingBtn.disabled = true;
        if(addPointBtn) addPointBtn.disabled = false;
        if(toggleEditBtn) toggleEditBtn.disabled = false;

    }
}

function stopRecording() {
    if (!recording || !mediaRecorder) {
        // alert("No recording in progress!"); // Can be noisy if called programmatically
        return;
    }

    if (mediaRecorder.state === "recording") {
        mediaRecorder.stop(); // This will trigger ondataavailable and then onstop (saveVideo)
    }
    
    recording = false;
    clearInterval(recordingTimerInterval);
    updateRecordingVisuals(false);
    if(recordingTimer) recordingTimer.textContent = "00:00"; // Reset timer display

    console.log("Recording stopped. Processing video...");
    if(startRecordingBtn) startRecordingBtn.disabled = false;
    if(stopRecordingBtn) stopRecordingBtn.disabled = true;
    if(addPointBtn) addPointBtn.disabled = false;
    if(toggleEditBtn) toggleEditBtn.disabled = false;


    // If you switched main camera for recording, switch it back here
    if (activeCamera !== camera && oldCamera) { activeCamera = oldCamera; }
}

function updateRecordingTimer() {
    if (!recording) return;
    const elapsedTime = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
    const seconds = (elapsedTime % 60).toString().padStart(2, '0');
    if (recordingTimer) recordingTimer.textContent = `${minutes}:${seconds}`;
}

function saveVideo() {
    if (recordedChunks.length === 0) {
        console.warn("No data recorded.");
        alert("No video data was recorded. Recording might have failed silently or was too short.");
        return;
    }
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `camera-path-video-${new Date().toISOString().slice(0,16).replace('T','-').replace(':','-')}.webm`;
    document.body.appendChild(a);
    a.click();
    console.log("Video saving initiated.");
    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        recordedChunks = []; // Clear for next recording
    }, 100);
}

// Your main render loop should call this
function render() {
    // Ensure renderer and scene/camera are defined
    if (typeof renderer !== 'undefined' && typeof scene !== 'undefined' && typeof camera !== 'undefined') {
        renderer.render(scene, camera);
    }
}

// Window resize handler
function onWindowResize() {
    if (typeof camera !== 'undefined' && typeof renderer !== 'undefined') {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        render(); // Re-render on resize
    }
}
window.addEventListener('resize', onWindowResize, false);

// Initial draw if points already exist (e.g. loaded from save)
drawPath(); // Call if you might have pointsCam pre-populated

// Example: Ensure required THREE objects are available globally or passed in
// This is a placeholder. You should have these defined in your main script.
/*
if (typeof THREE === 'undefined') {
    console.error("THREE.js is not loaded!");
} else {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
     camera.position.z = 5;
}*/

console.log("Camera path script initialized. Ensure scene, camera, and renderer are set globally.");


/*
// Constants
const LOOK_AT_MODES = {
    PATH: "path",
    ORIGIN: "origin",
};

let plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let intersectPoint = new THREE.Vector3();

// State
let pointsCam = [];
let curve, line;
let cameraFollowIndex = 0;
let lookAtTarget = LOOK_AT_MODES.PATH;
let recording = false;
let mediaRecorder, recordedChunks = [];
let recordingStartTime = 0;
let recordingTimerInterval;
let cameraOnPath = null;
let editModeEnabled = false;
let selectedPoint = null;
let pointMarkers = [];


// DOM Elements
const addPointBtn = document.getElementById('addPointBtn');
const startCameraBtn = document.getElementById('startCameraBtn');
const toggleLookAtBtn = document.getElementById('toggleLookAtBtn');
const toggleEditBtn = document.getElementById('toggleEditBtn');
const startRecordingBtn = document.getElementById('startRecordingBtn');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const recordingStatus = document.getElementById('recordingStatus') || document.createElement('div');
const recordingTimer = document.getElementById('recordingTimer') || document.createElement('div');

// Event Listeners
addPointBtn.addEventListener('click', addPointsCam);
startCameraBtn.addEventListener('click', startCamera);
toggleLookAtBtn.addEventListener('click', toggleLookAtMode);
toggleEditBtn.addEventListener('click', toggleEditMode);
startRecordingBtn.addEventListener('click', startRecording);
stopRecordingBtn.addEventListener('click', stopRecording);

// Initialize camera menu
document.getElementById('cameraTools').addEventListener('click', function() {
    document.getElementById('cameraMenu').classList.toggle('active');
});

// Initialize Transform Controls
function initTransformControls() {
    if (!transformControls) {
        transformControls = new THREE.TransformControls(camera, renderer.domElement);
        transformControls.addEventListener('change', render);
        
        // Important: prevent orbit controls from moving while using transform controls
        transformControls.addEventListener('dragging-changed', function(event) {
            if (typeof controls !== 'undefined' && controls.enabled !== undefined) {
                controls.enabled = !event.value;
            }
        });
        
        transformControls.addEventListener('objectChange', function() {
            if (selectedPoint !== null && transformControls.object) {
                // Update the point in our array with the new position
                pointsCam[selectedPoint].copy(transformControls.object.position);
                // Redraw the path with updated points
                drawPath();
            }
        });
        
        scene.add(transformControls);
    }
}

// Mouse event listeners for point selection
renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);

// Functions
function addPointsCam() {
    const x = (Math.random() - 0.5) * 10;
    const y = Math.random() * 5;
    const z = (Math.random() - 0.5) * 10;
    pointsCam.push(new THREE.Vector3(x, y, z));
    drawPath();
}

function drawPath() {
    // Remove existing line and point markers
    if (line) scene.remove(line);
    
    // Remove previous point markers
    pointMarkers.forEach(marker => {
        scene.remove(marker);
    });
    pointMarkers = [];

    if (pointsCam.length < 2) return;

    // Create a smooth curve through all points
    curve = new THREE.CatmullRomCurve3(pointsCam);
    
    // Create visible line for the path
    const points = curve.getPoints(100);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    line = new THREE.Line(geometry, material);
    scene.add(line);
    
    // Add spheres at each control point for better visibility
    pointsCam.forEach((point, index) => {
        const sphereGeometry = new THREE.SphereGeometry(0.1);
        // Use different color for selected point
        const color = (selectedPoint === index && editModeEnabled) ? 0x00ff00 : 0xffff00;
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: color });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(point);
        sphere.name = `PathPoint_${index}`;
        sphere.userData = { type: 'pathPoint', index: index };
        scene.add(sphere);
        pointMarkers.push(sphere);
    });
}

function getActiveAddedCamera() {
    // Enhanced camera detection
    
    // First try to find any camera in the scene directly
    // This is more reliable than depending on the objects array
    let cameras = [];
    scene.traverse(function(object) {
        if (object.isCamera && object !== camera) {  // Exclude the main scene camera
            cameras.push(object);
            console.log("Found camera: ", object.name || "unnamed camera");
        }
    });
    
    if (cameras.length > 0) {
        console.log("Using camera: ", cameras[0].name || "unnamed camera");
        return cameras[0];
    }
    
    // If that fails, check if the activeCamera is not the main camera
    if (activeCamera && activeCamera !== camera) {
        console.log("Using active camera: ", activeCamera.name || "unnamed active camera");
        return activeCamera;
    }
    
    // As a last resort, try to find it in the objects array
    if (typeof objects !== 'undefined' && Array.isArray(objects)) {
        for (let i = objects.length - 1; i >= 0; i--) {
            if (objects[i].type === 'camera' && objects[i].object && objects[i].object !== camera) {
                console.log("Using camera from objects: ", objects[i].object.name || "unnamed camera");
                return objects[i].object;
            }
        }
    }
    
    console.log("No added camera found");
    alert("Please add a camera using the 'Add Camera' button first!");
    return null;
}

function startCamera() {
    if (pointsCam.length < 2) {
        alert("Add at least 2 points to create a path!");
        return;
    }

    cameraOnPath = getActiveAddedCamera(); // Get the user-added camera
    if (!cameraOnPath) {
        alert("No added camera found!");
        return;
    }

    cameraFollowIndex = 0;
    moveCameraShooting();
}

function moveCameraShooting() {
    if (!cameraOnPath || cameraFollowIndex > 1) return;

    const progress = cameraFollowIndex;
    const newPos = curve.getPointAt(progress);

    // Move the added camera
    cameraOnPath.position.copy(newPos);

    // Adjust the camera's look-at target
    if (lookAtTarget === LOOK_AT_MODES.PATH) {
        const nextPos = curve.getPointAt(Math.min(progress + 0.01, 1));
        cameraOnPath.lookAt(nextPos);
    } else {
        cameraOnPath.lookAt(0, 0, 0);
    }

    // Update camera helper if present
    if (cameraOnPath.helper) {
        cameraOnPath.helper.update();
    }

    cameraFollowIndex += 0.005;

    if (cameraFollowIndex <= 1) {
        requestAnimationFrame(moveCameraShooting);
    } else {
        console.log("Camera path completed");
    }
}

function toggleLookAtMode() {
    lookAtTarget = lookAtTarget === LOOK_AT_MODES.PATH ? LOOK_AT_MODES.ORIGIN : LOOK_AT_MODES.PATH;
    alert(`Camera now looks at: ${lookAtTarget === LOOK_AT_MODES.PATH ? "path direction" : "origin (0,0,0)"}`);
}

function toggleEditMode() {
    editModeEnabled = !editModeEnabled;
    
    // Initialize transform controls if needed
    if (editModeEnabled) {
        initTransformControls();
        toggleEditBtn.textContent = "Disable Edit";
        renderer.domElement.style.cursor = "pointer";
    } else {
        if (transformControls) {
            transformControls.detach();
        }
        toggleEditBtn.textContent = "Enable Edit";
        renderer.domElement.style.cursor = "default";
        selectedPoint = null;
    }
    
    // Redraw path to update point colors
    drawPath();
}

function onPointerDown(event) {
    if (!editModeEnabled) return;
    
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the raycaster
    raycaster.setFromCamera(mouse, camera);
    
    // Check for intersections with path points
    const intersects = raycaster.intersectObjects(pointMarkers);
    
    if (intersects.length > 0) {
        const object = intersects[0].object;
        if (object.userData && object.userData.type === 'pathPoint') {
            selectedPoint = object.userData.index;
            transformControls.attach(object);
            drawPath(); // Redraw to highlight selected point
        }
    } else {
        // If clicking on empty space, deselect
        selectedPoint = null;
        transformControls.detach();
        drawPath();
    }
}

function onPointerMove(event) {
    if (!editModeEnabled) return;
    
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the raycaster
    raycaster.setFromCamera(mouse, camera);
    
    // Check for intersections with path points
    const intersects = raycaster.intersectObjects(pointMarkers);
    
    // Change cursor based on whether we're hovering over a point
    if (intersects.length > 0) {
        renderer.domElement.style.cursor = "pointer";
    } else {
        renderer.domElement.style.cursor = editModeEnabled ? "default" : "auto";
    }
}

function startRecording() {
    if (!renderer || !renderer.domElement || !renderer.domElement.captureStream) {
        alert("Recording not supported in this browser!");
        return;
    }

    if (recording) {
        alert("Recording is already in progress!");
        return;
    }

    cameraOnPath = getActiveAddedCamera();
    if (!cameraOnPath) {
        alert("No added camera found!");
        return;
    }

    // Set the active camera for recording
    activeCamera = cameraOnPath; // Switch rendering to the added camera

    // Start recording
    try {
        recordedChunks = [];
        const stream = renderer.domElement.captureStream(30);
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };
        mediaRecorder.onstop = saveVideo;

        mediaRecorder.start();
        recording = true;
        recordingStartTime = Date.now();
        recordingTimerInterval = setInterval(updateRecordingTimer, 1000);

        if (recordingStatus) {
            recordingStatus.textContent = "Recording: Active";
        }

        // Start camera movement
        cameraFollowIndex = 0;
        moveCameraShooting();

        console.log("Recording started with camera: " + (cameraOnPath.name || "Unnamed Camera"));
    } catch (error) {
        console.error("Error starting recording:", error);
        alert("Error starting recording: " + error.message);
    }
}

function stopRecording() {
    if (!recording) {
        alert("No recording in progress!");
        return;
    }

    mediaRecorder.stop();
    recording = false;
    clearInterval(recordingTimerInterval);

    if (recordingStatus) {
        recordingStatus.textContent = "Recording: Stopped";
    }

    console.log("Recording stopped");
}

function updateRecordingTimer() {
    if (!recording) return;
    
    const elapsedTime = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
    const seconds = (elapsedTime % 60).toString().padStart(2, '0');
    
    if (recordingTimer) {
        recordingTimer.textContent = `${minutes}:${seconds}`;
    }
}

function saveVideo() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'camera-path-video.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}



function render() {
    renderer.render(scene, camera);
}

// Add this to your window resize handler if you have one
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize, false);
*/
