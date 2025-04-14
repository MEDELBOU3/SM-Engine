function initializeTimeline() {
    initializeTimelineScale();
    updateLayersUI();
}

// Setup timeline event listeners
function setupTimelineEventListeners() {
    document.getElementById('play').addEventListener('click', playAnimation);
    document.getElementById('pause').addEventListener('click', pauseAnimation);
    document.getElementById('stop').addEventListener('click', stopAnimation);
    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    document.getElementById('add-keyframe').addEventListener('click', addKeyframe);
    document.getElementById('delete-keyframe').addEventListener('click', deleteKeyframe);

    const timeline = document.querySelector('.timeline-track');
    const playhead = document.getElementById('playhead');
    const timelineContent = document.getElementById('timeline-content');

    timeline.addEventListener('mousedown', (e) => {
        if (e.target === timeline || e.target === timelineContent) {
            isDragging = true;
            dragStart = e.clientX - timelineOffset;
            timeline.style.cursor = 'grabbing';
        }
    });

    playhead.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStart = e.clientX;
        e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const rect = timeline.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            if (playhead.contains(e.target)) {
                currentTime = Math.max(0, Math.min(timelineDuration, position * timelineDuration));
                updatePlayhead();
                updateSceneFromTimeline();
            } else {
                timelineOffset = e.clientX - dragStart;
                timelineContent.style.transform = `translateX(${timelineOffset}px) scaleX(${zoomLevel})`;
            }
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        timeline.style.cursor = 'grab';
    });

    timelineContent.addEventListener('click', (e) => {
        if (e.target.classList.contains('keyframe')) {
            selectKeyframe(e.target);
        }
    });

    timelineContent.addEventListener('click', (e) => {
        if (e.target === timelineContent && selectedObject) { // Clicked on timeline, not a keyframe
            const rect = timelineContent.getBoundingClientRect();
            const clickPosition = (e.clientX - rect.left) / rect.width;
            currentTime = clickPosition * timelineDuration; // Set current time based on click
            addKeyframe(); // Add keyframe at this position
            updatePlayhead(); // Update playhead to reflect new time
        }
    });
}

function updateTimeDisplay() {
    const totalSeconds = Math.floor(currentTime);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.round((currentTime - totalSeconds) * 1000);
    document.getElementById('time-display').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
}

// Keyframe management
function addObjectToTimeline(object) {
    if (!object.uuid || keyframes.has(object.uuid)) return;

    const objectKeyframes = {};

    // Check for animations (from FBX or GLTF)
    if (object.animations && object.animations.length > 0) {
        object.animations.forEach((clip) => {
            clip.tracks.forEach((track) => {
                const times = track.times; // Array of times in seconds
                const values = track.values; // Array of values

                times.forEach((time, index) => {
                    const frame = Math.round(time * fps);
                    let keyframeData = objectKeyframes[frame] || {};

                    if (track.name.includes('.position')) {
                        keyframeData.position = new THREE.Vector3().fromArray(values, index * 3);
                    } else if (track.name.includes('.quaternion')) {
                        keyframeData.rotation = new THREE.Quaternion().fromArray(values, index * 4);
                    } else if (track.name.includes('.scale')) {
                        keyframeData.scale = new THREE.Vector3().fromArray(values, index * 3);
                    }

                    objectKeyframes[frame] = keyframeData;
                });
            });
        });
    }

    keyframes.set(object.uuid, objectKeyframes);
    updateLayersUI();
    updateKeyframesUI(); // Reflect in timeline immediately
}



function addKeyframe() {
    if (!selectedObject) {
        console.warn('No object selected');
        return;
    }
    
    const frame = Math.round(currentTime * fps);
    const objectKeyframes = keyframes.get(selectedObject.uuid) || {};
    
    objectKeyframes[frame] = {
        time: currentTime, // Store actual time for precision
        position: selectedObject.position.clone(),
        rotation: new THREE.Quaternion().setFromEuler(selectedObject.rotation), // Use Quaternion for interpolation
        scale: selectedObject.scale.clone()
    };
    
    keyframes.set(selectedObject.uuid, objectKeyframes);
    updateKeyframesUI();
}

function deleteKeyframe() {
    if (!selectedObject || !selectedKeyframe) return;
    
    const frame = parseInt(selectedKeyframe.dataset.frame);
    const objectKeyframes = keyframes.get(selectedObject.uuid);
    
    if (objectKeyframes && objectKeyframes[frame]) {
        delete objectKeyframes[frame];
        updateKeyframesUI();
    }
}

let selectedKeyframe = null;

function selectKeyframe(keyframeElement) {
    if (selectedKeyframe) {
        selectedKeyframe.classList.remove('selected');
    }
    selectedKeyframe = keyframeElement;
    selectedKeyframe.classList.add('selected');
}

function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    keyframesContainer.innerHTML = '';
    
    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;
        
        const track = document.createElement('div');
        track.className = 'timeline-track-row';
        track.dataset.uuid = uuid;
       
        
        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframe = document.createElement('div');
            keyframe.className = 'keyframe';
            keyframe.dataset.frame = frame;
            keyframe.style.left = `${(data.time / timelineDuration) * 100}%`;
            
            keyframe.addEventListener('click', (e) => {
                e.stopPropagation();
                selectKeyframe(keyframe);
                currentTime = data.time; // Jump to keyframe time
                updatePlayhead();
                updateSceneFromTimeline();
            });
            
            track.appendChild(keyframe);
        });
        
        keyframesContainer.appendChild(track);
    });
}




function processModel(object, name, animations) {
    object.name = name;
    scene.add(object); // This triggers addObjectToTimeline due to override
    selectedObject = object; // Set as selected for keyframe addition
    addKeyframe(); // Add an initial keyframe at time 0
    console.log(`Model ${name} added with UUID: ${object.uuid}`);
}

// Layers UI
function updateLayersUI() {
    const layersList = document.getElementById('layers-list');
    layersList.innerHTML = '';
    
    keyframes.forEach((_, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;
        
        const layer = document.createElement('div');
        layer.className = 'layer-item';
        layer.textContent = object.name || `Object ${uuid.slice(0, 8)}`;
        layer.dataset.uuid = uuid;
        
        if (selectedObject && selectedObject.uuid === uuid) {
            layer.classList.add('selected');
        }
        
        layer.addEventListener('click', () => {
            selectedObject = object;
            transformControls.attach(object);
            updateLayersUI();
        });
        
        layersList.appendChild(layer);
    });
}

// Scene update from timeline
function updateSceneFromTimeline() {
    const currentFrame = Math.round(currentTime * fps);
    
    scene.traverse((object) => {
        if (!object.isObject3D || !object.uuid) return;
        
        const objectKeyframes = keyframes.get(object.uuid);
        if (!objectKeyframes || Object.keys(objectKeyframes).length === 0) {
            return; // Skip if no keyframes; preserve current state
        }
        
        const frames = Object.keys(objectKeyframes).map(Number).sort((a, b) => a - b);
        if (frames.length === 0) return;
        
        if (currentFrame <= frames[0]) {
            applyKeyframe(object, objectKeyframes[frames[0]]);
        } else if (currentFrame >= frames[frames.length - 1]) {
            applyKeyframe(object, objectKeyframes[frames[frames.length - 1]]);
        } else {
            const prevFrame = frames.findLast(f => f < currentFrame);
            const nextFrame = frames.find(f => f > currentFrame);
            
            if (prevFrame && nextFrame) {
                const t = (currentFrame - prevFrame) / (nextFrame - prevFrame);
                interpolateKeyframe(object, objectKeyframes[prevFrame], objectKeyframes[nextFrame], t);
            }
        }
    });
}

function applyKeyframe(object, keyframe) {
    object.position.copy(keyframe.position);
    object.rotation.copy(keyframe.rotation);
    object.scale.copy(keyframe.scale);
}

function interpolateKeyframe(object, start, end, t) {
    object.position.lerpVectors(start.position, end.position, t);
    object.quaternion.slerpQuaternions(start.rotation, end.rotation, t); // Slerp for smooth rotation
    object.scale.lerpVectors(start.scale, end.scale, t);
}


// Function to activate any panel-button-tool button
function activatePanelButtonTool() {
    // Select all buttons with the class 'panel-button-tool'
    const buttons = document.querySelectorAll('.panel-button-tool');
    
    // Add click event listener to each button
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove 'active' class from all buttons
            buttons.forEach(btn => btn.classList.remove('active'));
            
            // Add 'active' class to the clicked button
            this.classList.add('active');
            
            // Optional: Trigger a custom action based on button ID or data attribute
            const action = this.dataset.action || this.id;
            if (action && typeof window[action] === 'function') {
                window[action](); // Call the function if it exists
            }
            
            // Update accessibility and tooltip
            updateButtonState(this);
        });
    });
}

// Helper function to update button state
function updateButtonState(button) {
    const isActive = button.classList.contains('active');
    button.setAttribute('aria-pressed', isActive); // Accessibility
    button.title = `${button.title || button.id} (${isActive ? 'Active' : 'Inactive'})`; // Update tooltip
}
