// Constants
const LOOK_AT_MODES = {
    PATH: "path",
    ORIGIN: "origin",
};

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

// DOM Elements
const addPointBtn = document.getElementById('addPointBtn');
const startCameraBtn = document.getElementById('startCameraBtn');
const toggleLookAtBtn = document.getElementById('toggleLookAtBtn');
const startRecordingBtn = document.getElementById('startRecordingBtn');
const stopRecordingBtn = document.getElementById('stopRecordingBtn');
const recordingStatus = document.getElementById('recordingStatus') || document.createElement('div');
const recordingTimer = document.getElementById('recordingTimer') || document.createElement('div');

// Event Listeners
addPointBtn.addEventListener('click', addPointsCam);
startCameraBtn.addEventListener('click', startCamera);
toggleLookAtBtn.addEventListener('click', toggleLookAtMode);
startRecordingBtn.addEventListener('click', startRecording);
stopRecordingBtn.addEventListener('click', stopRecording);

// Initialize camera menu
document.getElementById('cameraTools').addEventListener('click', function() {
    document.getElementById('cameraMenu').classList.toggle('active');
});

// Functions
function addPointsCam() {
    const x = (Math.random() - 0.5) * 10;
    const y = Math.random() * 5;
    const z = (Math.random() - 0.5) * 10;
    pointsCam.push(new THREE.Vector3(x, y, z));
    drawPath();
}

function drawPath() {
    // Remove existing line if there is one
    if (line) scene.remove(line);

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
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(point);
        sphere.name = `PathPoint_${index}`;
        scene.add(sphere);
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

    try {
        mediaRecorder.stop();
        recording = false;
        clearInterval(recordingTimerInterval);

        if (recordingStatus) {
            recordingStatus.textContent = "Recording: Stopped";
        }

        console.log("Recording stopped");
    } catch (error) {
        console.error("Error stopping recording:", error);
        alert("Error stopping recording: " + error.message);
    }
}

function saveVideo() {
    if (recordedChunks.length === 0) {
        console.warn("No recorded data available");
        return;
    }

    try {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'camera-path-video.webm';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            recordedChunks = [];
        }, 100);
    } catch (error) {
        console.error("Error saving video:", error);
        alert("Error saving video: " + error.message);
    }
}

function updateRecordingTimer() {
    if (!recordingTimer) return;
    
    const elapsedTime = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
    const seconds = (elapsedTime % 60).toString().padStart(2, '0');
    recordingTimer.textContent = `${minutes}:${seconds}`;
}

// Add this to initialize the UI properly
function initUI() {
    // Create status elements if they don't exist
    if (!document.getElementById('recordingStatus')) {
        const statusElement = document.createElement('div');
        statusElement.id = 'recordingStatus';
        statusElement.textContent = 'Recording: Inactive';
        statusElement.style.position = 'absolute';
        statusElement.style.bottom = '40px';
        statusElement.style.right = '10px';
        statusElement.style.padding = '5px';
        statusElement.style.background = 'rgba(0,0,0,0.5)';
        statusElement.style.color = 'white';
        document.body.appendChild(statusElement);
    }
    
    if (!document.getElementById('recordingTimer')) {
        const timerElement = document.createElement('div');
        timerElement.id = 'recordingTimer';
        timerElement.textContent = '00:00';
        timerElement.style.position = 'absolute';
        timerElement.style.bottom = '10px';
        timerElement.style.right = '10px';
        timerElement.style.padding = '5px';
        timerElement.style.background = 'rgba(0,0,0,0.5)';
        timerElement.style.color = 'white';
        document.body.appendChild(timerElement);
    }
}

// Call the initialization function when the script loads
initUI();

function renderScene() {
    if (recording && activeCamera) {
        renderer.render(scene, activeCamera); // Force rendering from the added camera
    } else {
        renderer.render(scene, defaultCamera); // Use default camera when not recording
    }

    requestAnimationFrame(renderScene);
}

// Start the custom render loop
renderScene();
