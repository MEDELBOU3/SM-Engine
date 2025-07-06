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


// Keyframe management
/*
function addObjectToTimeline(object) {
    if (!object.uuid || keyframes.has(object.uuid)) return;

    const objectKeyframes = {};

    if (object.animations && object.animations.length > 0) {
        object.animations.forEach((clip) => {
            clip.tracks.forEach((track) => {
                const times = track.times; // in seconds
                const values = track.values;

                times.forEach((time, index) => {
                    const frame = Math.round(time * fps);
                    let keyframeData = objectKeyframes[frame] || { time };

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

        keyframes.set(object.uuid, objectKeyframes);
        updateLayersUI();
        updateKeyframesUI();
    }
}

//2
function addObjectToTimeline(object) {
    // This check is important!
    if (!object.uuid || keyframes.has(object.uuid)) return;

    // Another important check.
    if (!object.animations || object.animations.length === 0) {
        return;
    }

    const objectKeyframes = {};

    object.animations.forEach((clip) => {
        clip.tracks.forEach((track) => {
            // .name is like "mixamorigHips.position" or "RootNode.quaternion"
            if (!track.name.includes('.position') && !track.name.includes('.quaternion') && !track.name.includes('.scale')) {
                return; // We only care about transform tracks for now
            }
            
            const times = track.times; // Array of times in seconds
            const values = track.values; // Flat array of values (x,y,z, x,y,z, ...)

            times.forEach((time, index) => {
                const frame = Math.round(time * fps);
                
                // Use the time as the key to avoid rounding conflicts, then store frame number
                // Let's stick to your original frame-based key, it's simpler.
                let keyframeData = objectKeyframes[frame] || { time: time }; // IMPORTANT: Store the precise time

                if (track.name.includes('.position')) {
                    // This assumes the track is for the root object. For skeletal animation, this is more complex.
                    // For now, we apply the root motion to the main object.
                    keyframeData.position = new THREE.Vector3().fromArray(values, index * 3);
                } else if (track.name.includes('.quaternion')) {
                    keyframeData.rotation = new THREE.Quaternion().fromArray(values, index * 4);
                } else if (track.name.includes('.scale')) {
                    keyframeData.scale = new THREE.Vector3().fromArray(values, index * 3);
                }
                
                // Ensure all transform properties are present, using the object's current state as a default
                if (!keyframeData.position) keyframeData.position = object.position.clone();
                if (!keyframeData.rotation) keyframeData.rotation = object.quaternion.clone();
                if (!keyframeData.scale) keyframeData.scale = object.scale.clone();

                objectKeyframes[frame] = keyframeData;
            });
        });
    });

    // Only add if we actually extracted some keyframes
    if (Object.keys(objectKeyframes).length > 0) {
        keyframes.set(object.uuid, objectKeyframes);
        console.log(`Populated timeline for ${object.name} with ${Object.keys(objectKeyframes).length} keyframes.`);
        updateLayersUI();
        updateKeyframesUI(); // This will now draw the keyframes on the timeline!
    }
}*/

/**
 * A robust function to extract animation data and populate the timeline UI.
 * It resamples the animation to create complete, synchronized keyframes,
 * preventing objects from disappearing or jumping during playback.
 * 
 * @param {THREE.Object3D} object The animated object, which must have an `animations` array.
 */
function addObjectToTimeline(object) {
    if (!object.uuid || !object.animations || object.animations.length === 0) {
        return; // Can't process if there's no animation data.
    }
    
    // Prevent re-processing an object that already has a full set of keyframes.
    if (keyframes.has(object.uuid) && Object.keys(keyframes.get(object.uuid)).length > 1) {
       console.log(`Timeline for '${object.name}' already populated.`);
       return;
    }

    const objectKeyframes = {};
    const allTimes = new Set(); // Use a Set to automatically handle unique timestamps.
    const animationData = {
        position: null,
        quaternion: null,
        scale: null
    };

    // --- Pass 1: Extract all raw track data and unique times ---
    object.animations.forEach(clip => {
        clip.tracks.forEach(track => {
            // Store the raw track data
            if (track.name.includes('.position')) {
                animationData.position = track;
            } else if (track.name.includes('.quaternion')) {
                animationData.quaternion = track;
            } else if (track.name.includes('.scale')) {
                animationData.scale = track;
            }

            // Add all timestamps from this track to our Set
            for (const time of track.times) {
                allTimes.add(time);
            }
        });
    });

    // --- Pass 2: Resample and create complete keyframes ---
    // Create a sorted array of unique timestamps
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
    
    // Helper objects for interpolation
    const tempPos = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();

    // For each unique timestamp, build a complete keyframe
    sortedTimes.forEach(time => {
        const frame = Math.round(time * fps);

        // Get the interpolated value for EACH property at the current time
        const position = getValueAtTime(time, animationData.position, object.position, tempPos);
        const rotation = getValueAtTime(time, animationData.quaternion, object.quaternion, tempQuat);
        const scale = getValueAtTime(time, animationData.scale, object.scale, tempScale);

        // Store the complete, synchronized keyframe
        objectKeyframes[frame] = {
            time: time,
            position: position.clone(),
            rotation: rotation.clone(),
            scale: scale.clone()
        };
    });

    if (Object.keys(objectKeyframes).length > 0) {
        keyframes.set(object.uuid, objectKeyframes);
        console.log(`Correctly resampled and populated timeline for '${object.name}' with ${Object.keys(objectKeyframes).length} keyframes.`);
        updateLayersUI();
        updateKeyframesUI(); // This will now draw the correct, complete keyframes.
    }
}
/*
// 3 This function should be in your global scope
function addObjectToTimeline(object) {
    if (!object.uuid || !object.animations || object.animations.length === 0) {
        return; // Nothing to do
    }
    
    // Avoid re-adding
    if (keyframes.has(object.uuid) && Object.keys(keyframes.get(object.uuid)).length > 1) {
       return;
    }

    const objectKeyframes = {};

    object.animations.forEach((clip) => {
        clip.tracks.forEach((track) => {
            // We only care about transform tracks for the root object for now
            if (!track.name.includes('.position') && !track.name.includes('.quaternion') && !track.name.includes('.scale')) {
                return;
            }

            const times = track.times;
            const values = track.values;

            times.forEach((time, index) => {
                const frame = Math.round(time * fps);
                
                // Get existing keyframe for this frame or create a new one
                let keyframeData = objectKeyframes[frame] || {
                    time: time,
                    position: object.position.clone(), // Default to object's initial position
                    rotation: object.quaternion.clone(), // Default to object's initial rotation
                    scale: object.scale.clone()       // Default to object's initial scale
                };

                // Overwrite with data from the track
                if (track.name.includes('.position')) {
                    keyframeData.position.fromArray(values, index * 3);
                } else if (track.name.includes('.quaternion')) {
                    keyframeData.rotation.fromArray(values, index * 4);
                } else if (track.name.includes('.scale')) {
                    keyframeData.scale.fromArray(values, index * 3);
                }

                objectKeyframes[frame] = keyframeData;
            });
        });
    });

    if (Object.keys(objectKeyframes).length > 0) {
        keyframes.set(object.uuid, objectKeyframes);
        console.log(`Populated timeline for '${object.name}' with ${Object.keys(objectKeyframes).length} keyframes.`);
        updateLayersUI();
        updateKeyframesUI(); // This will now correctly draw all the keyframes
    }
}
*/

/**
 * Helper function to get the interpolated value from a track at a specific time.
 * @param {number} time The time to evaluate.
 * @param {THREE.KeyframeTrack} track The animation track (can be null).
 * @param {THREE.Vector3 | THREE.Quaternion} defaultValue The default value if the track is missing.
 * @param {THREE.Vector3 | THREE.Quaternion} outValue The object to store the result in, to avoid creating new objects in a loop.
 * @returns The interpolated value.
 */
function getValueAtTime(time, track, defaultValue, outValue) {
    // If there's no track for this property, return the object's default value
    if (!track) {
        return outValue.copy(defaultValue);
    }

    const times = track.times;
    const values = track.values;
    const T = THREE.InterpolateLinear; // Use Three.js's built-in interpolation logic

    // Time is before the first keyframe
    if (time < times[0]) {
        return outValue.fromArray(values, 0);
    }
    
    // Time is after the last keyframe
    if (time >= times[times.length - 1]) {
        return outValue.fromArray(values, (times.length - 1) * outValue.toArray().length);
    }

    // Find the segment where the time falls
    for (let i = 0; i < times.length - 1; i++) {
        if (time >= times[i] && time < times[i + 1]) {
            const t = (time - times[i]) / (times[i + 1] - times[i]); // The "alpha" or percentage
            
            const v0 = new outValue.constructor().fromArray(values, i * outValue.toArray().length);
            const v1 = new outValue.constructor().fromArray(values, (i + 1) * outValue.toArray().length);

            // Use the correct interpolation method based on the object type
            if (outValue.isQuaternion) {
                return THREE.Quaternion.slerp(v0, v1, outValue, t);
            } else {
                return outValue.copy(v0).lerp(v1, t);
            }
        }
    }
    
    // Should not be reached, but as a fallback, return the last value
    return outValue.fromArray(values, (times.length - 1) * outValue.toArray().length);
}

/*
function setupModelInScene(object, name) {
    object.name = name;

    // Apply standard properties to all meshes in the model
    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Optional: Ensure materials are double-sided if needed
            if (child.material) {
                child.material.side = THREE.DoubleSide;
            }
        }
    });

    // --- ANIMATION HANDLING ---
    // Check if the loaded object has animation clips embedded
    if (object.animations && object.animations.length > 0) {
        console.log(`Found ${object.animations.length} animation clip(s) in '${name}'.`);
        
        // 1. Setup the AnimationMixer for playback in the 3D view
        object.userData.mixer = new THREE.AnimationMixer(object);
        object.animations.forEach(clip => {
            // By default, play the animation. You can add UI controls to manage this later.
            object.userData.mixer.clipAction(clip).play();
        });

        // 2. Automatically adjust the main timeline's duration to fit the new animation
        autoSetTimelineDurationFromAnimations(object);
        
        // Note: addObjectToTimeline will be called automatically by our scene.add override.
        // The important part is that `object.animations` is ready before we add it to the scene.

    } else {
        console.log(`No animations found in '${name}'. It will be treated as a static object.`);
        // If it's a static object, we will add a single keyframe at time 0
        // so it appears in the timeline for manual animation. This happens below.
    }

    // --- SCENE & UI INTEGRATION ---
    
    // Add the object to the scene. This will trigger your `scene.add` override,
    // which correctly calls `addObjectToTimeline`.
    scene.add(object);
    
    // Set as the currently selected object
    selectedObject = object; 

    // Attach the transform controls to the new object
    if (transformControls) {
        transformControls.attach(object);
    }
    
    // If the object had no animations, `addObjectToTimeline` would do nothing.
    // In that case, we add a single keyframe manually so it appears in the layer list.
    if (!object.animations || object.animations.length === 0) {
        addKeyframe(); // Adds a keyframe at the current time for the selectedObject
    }

    // Update other UI elements as needed
    if (typeof updateHierarchy === 'function') updateHierarchy();
    updateLayersUI(); // Refresh the layer list
    
    console.log(`Model '${name}' (UUID: ${object.uuid}) has been successfully set up in the scene.`);
}*/

/**
 * The SINGLE function responsible for adding an object to the main scene,
 * setting up its animation, and populating the timeline correctly.
 * @param {THREE.Object3D} object The object returned from AssetPanel.loadModel
 * @param {string} name The name of the object.
 */
function setupModelInScene(object, name) {
    object.name = name;
    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Add to the main scene
    scene.add(object);
    selectedObject = object;
    if (transformControls) {
        transformControls.attach(object);
    }
    
    // Create skeleton helpers in the main scene if needed
    object.traverse((child) => {
        if (child.isSkinnedMesh) {
            const skeletonHelper = new THREE.SkeletonHelper(child);
            skeletonHelper.userData.ignoreInTimeline = true;
            scene.add(skeletonHelper);
        }
    });

    // --- The Correct EITHER/OR Logic ---
    if (object.animations && object.animations.length > 0) {
        // This is an ANIMATED model
        console.log(`Setting up ANIMATED model '${name}' in the main scene.`);
        object.userData.mixer = new THREE.AnimationMixer(object);
        object.animations.forEach(clip => object.userData.mixer.clipAction(clip).play());
        autoSetTimelineDurationFromAnimations(object);
        addObjectToTimeline(object); // Use your robust resampling function
    } else {
        // This is a STATIC model
        console.log(`Setting up STATIC model '${name}' in the main scene.`);
        addKeyframe(); // Add a single keyframe so it appears on the timeline
    }

    // Update UI
    updateLayersUI();
    if (typeof updateHierarchy === 'function') updateHierarchy();

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

/*function updateKeyframesUI() {
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
}*/

function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    keyframesContainer.innerHTML = '';
    
    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;

        const objectName = object.name || `Object ${uuid.slice(0, 8)}`;

        const track = document.createElement('div');
        track.className = 'timeline-track-row';
        track.dataset.uuid = uuid;

        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframe = document.createElement('div');
            keyframe.className = 'keyframe';
            keyframe.dataset.frame = frame;

            keyframe.style.left = `${(data.time / timelineDuration) * 100}%`;

            // ✅ ADD TOOLTIP TITLE
            keyframe.title = `Keyframe for: ${objectName}\nFrame: ${frame}`;

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
    scene.add(object); // Add model to scene
    selectedObject = object;

    // Automatically attach transform controls
    if (transformControls) {
        transformControls.attach(object);
    }

    // If the object has animation clips (from FBX or GLTF), store them in userData
    if (animations && animations.length > 0) {
        object.animations = animations;
        object.userData.mixer = new THREE.AnimationMixer(object);

        // Play the first clip by default (optional)
        object.userData.mixer.clipAction(animations[0]).play();
    }

    // Generate keyframes from the animation (if any) and add to timeline
    processModel(object, file.name, object.animations || []);
    autoSetTimelineDurationFromAnimations(object);
    addObjectToTimeline(object); // ✅ Add this!

     
    // Add an initial keyframe at time 0 to ensure it shows in the timeline
    addKeyframe();

    console.log(`Model ${name} added with UUID: ${object.uuid}`);
}

/*
function processModel(object, name, animations) {
    object.name = name;
    scene.add(object); // This triggers addObjectToTimeline due to override
    selectedObject = object; // Set as selected for keyframe addition
    addKeyframe(); // Add an initial keyframe at time 0
    console.log(`Model ${name} added with UUID: ${object.uuid}`);
}*/


/*function autoSetTimelineDurationFromAnimations(object) {
    if (object.animations && object.animations.length > 0) {
        let maxTime = 0;
        object.animations.forEach(clip => {
            if (clip.duration > maxTime) maxTime = clip.duration;
        });
        timelineDuration = Math.max(timelineDuration, maxTime); // Update global timeline
    }
}*/

function autoSetTimelineDurationFromAnimations(object) {
    if (!object.animations || object.animations.length === 0) return;

    let maxTime = 0;
    object.animations.forEach(clip => {
        clip.tracks.forEach(track => {
            const lastTime = track.times[track.times.length - 1];
            if (lastTime > maxTime) maxTime = lastTime;
        });
    });

    if (maxTime > timelineDuration) {
        timelineDuration = Math.ceil(maxTime);
        updateTimelineScale(); // your function to scale timeline UI
        updatePlayhead();      // move playhead accordingly
    }
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
/*function updateSceneFromTimeline() {
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
}*/

function updateSceneFromTimeline() {
    const currentFrame = Math.round(currentTime * fps);

    scene.traverse((object) => {
        if (!object.isObject3D || !object.uuid) return;

        // ✅ Skip path-animated objects
        if (pathAnimator.animatingObjects.has(object)) return;

        const objectKeyframes = keyframes.get(object.uuid);
        if (!objectKeyframes || Object.keys(objectKeyframes).length === 0) return;

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


/*function applyKeyframe(object, keyframe) {
    object.position.copy(keyframe.position);
    object.rotation.copy(keyframe.rotation);
    object.scale.copy(keyframe.scale);
}*/
function applyKeyframe(object, keyframe) {
    object.position.copy(keyframe.position);
    // ❌ WRONG: object.rotation.copy(keyframe.rotation);
    // ✅ CORRECT: Use the object's quaternion property.
    object.quaternion.copy(keyframe.rotation);
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

