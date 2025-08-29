/**
 * @file timeline.js
 * Manages the animation timeline, keyframe manipulation, UI interactions,
 * and the integration of 3D models into the animation system.
 */

// Hoisted for selectKeyframe function
let selectedKeyframe = null;

// --- INITIALIZATION ---

/**
 * Initializes the timeline component by setting up the scale and updating the UI.
 */
function initializeTimeline() {
    initializeTimelineScale(); // Assuming this function exists elsewhere
    updateLayersUI();
}

/**
 * Attaches all necessary event listeners for the timeline UI and functionality.
 */
function setupTimelineEventListeners() {
    // Playback and action buttons
    document.getElementById('play').addEventListener('click', playAnimation);
    document.getElementById('pause').addEventListener('click', pauseAnimation);
    document.getElementById('stop').addEventListener('click', stopAnimation);
    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    document.getElementById('add-keyframe').addEventListener('click', addKeyframe);
    document.getElementById('delete-keyframe').addEventListener('click', deleteKeyframe);

    // Timeline drag and scrub logic
    const timeline = document.querySelector('.timeline-track');
    const playhead = document.getElementById('playhead');
    const timelineContent = document.getElementById('timeline-content');
    let isDragging = false;
    let dragStart = 0;
    let isDraggingPlayhead = false;

    playhead.addEventListener('mousedown', (e) => {
        isDragging = true;
        isDraggingPlayhead = true;
        e.stopPropagation(); // Prevent timeline panning when grabbing the playhead
    });

    timeline.addEventListener('mousedown', (e) => {
        // Only pan the timeline if clicking on the track background, not a keyframe or the playhead
        if (e.target === timeline || e.target === timelineContent) {
            isDragging = true;
            isDraggingPlayhead = false;
            dragStart = e.clientX - timelineOffset; // Assuming timelineOffset is a global
            timeline.style.cursor = 'grabbing';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const rect = timeline.getBoundingClientRect();

        if (isDraggingPlayhead) {
            // Scrubbing the playhead
            const position = (e.clientX - rect.left) / rect.width;
            currentTime = Math.max(0, Math.min(timelineDuration, position * timelineDuration));
            updatePlayhead();
            updateSceneFromTimeline();
        } else {
            // Panning the timeline content
            timelineOffset = e.clientX - dragStart;
            timelineContent.style.transform = `translateX(${timelineOffset}px) scaleX(${zoomLevel})`; // Assuming zoomLevel is global
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            isDraggingPlayhead = false;
            timeline.style.cursor = 'grab';
        }
    });

    // Keyframe selection and creation via timeline click
    timelineContent.addEventListener('click', (e) => {
        if (e.target.classList.contains('keyframe')) {
            selectKeyframe(e.target);
            e.stopPropagation(); // Stop the event from bubbling to the timeline content
        } else if (selectedObject) {
            // If an object is selected, clicking on an empty part of its track adds a keyframe.
            const rect = timelineContent.getBoundingClientRect();
            const totalWidth = timelineContent.scrollWidth;
            const clickX = e.clientX - rect.left + timelineContent.scrollLeft;
            const timeRatio = clickX / totalWidth;

            currentTime = timeRatio * timelineDuration;

            addKeyframe(); // Add a new keyframe at that precise time
            updatePlayhead(); // Move the UI to show the new time
            updateSceneFromTimeline(); // Update the object's position in the scene
        }
    });
}


// --- SCENE & MODEL INTEGRATION ---

/**
 * The definitive function for adding a model to the scene, setting up its
 * animation mixer, and populating the timeline. Handles both static and animated models.
 * @param {THREE.Object3D} object The 3D object loaded from a file.
 * @param {string} name The desired name for the object.
 */
function setupModelInScene(object, name) {
    if (!object) {
        console.error("setupModelInScene was called with an invalid object.");
        return;
    }

    object.name = name || 'Untitled Model';
    console.log(`Setting up model '${object.name}' in the main scene.`);

    // 1. Apply standard properties (e.g., shadows) to all meshes
    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // 2. Add the object to the main scene
    scene.add(object);

    // 3. Set it as the currently selected object
    selectedObject = object;

    // 4. Attach transform controls for direct manipulation
    if (typeof transformControls !== 'undefined') {
        transformControls.attach(object);
    }

    // 5. Handle timeline setup based on whether the model is animated or static
    if (object.animations && object.animations.length > 0) {
        // ANIMATED MODEL
        console.log(`Found ${object.animations.length} animations for '${object.name}'. Setting up mixer and timeline.`);
        object.userData.mixer = new THREE.AnimationMixer(object);
        object.animations.forEach(clip => {
            object.userData.mixer.clipAction(clip).play();
        });

        autoSetTimelineDurationFromAnimations(object);
        addObjectToTimeline(object); // Use the robust resampling function
    } else {
        // STATIC MODEL
        console.log(`'${object.name}' is a static model. Adding initial keyframe.`);
        addKeyframe(); // Add a single keyframe so it appears on the timeline for manual animation
    }

    // 6. Update all relevant UI panels
    updateLayersUI();
    if (typeof updateHierarchy === 'function') {
        updateHierarchy();
    }
}


// --- TIMELINE DATA & KEYFRAME MANAGEMENT ---

/**
 * Resamples an object's animation clips to create a unified set of complete keyframes.
 * This prevents issues where separate position/rotation/scale tracks cause jittering.
 * @param {THREE.Object3D} object The animated object, which must have an `animations` array.
 */
function addObjectToTimeline(object) {
    if (!object.uuid || !object.animations || object.animations.length === 0) return;
    // Avoid re-processing if keyframes already exist
    if (keyframes.has(object.uuid) && Object.keys(keyframes.get(object.uuid)).length > 1) return;

    console.log(`Resampling animations for '${object.name}' to create timeline keyframes...`);

    const objectKeyframes = {};
    const allTimes = new Set();
    const animationData = { position: null, quaternion: null, scale: null };

    // Pass 1: Gather all unique timestamps and references to the main transform tracks.
    object.animations.forEach(clip => {
        clip.tracks.forEach(track => {
            if (track.name.includes('.position')) animationData.position = track;
            else if (track.name.includes('.quaternion')) animationData.quaternion = track;
            else if (track.name.includes('.scale')) animationData.scale = track;
            else return; // Skip other tracks (e.g., individual bones) for now

            for (const time of track.times) {
                allTimes.add(time);
            }
        });
    });

    if (allTimes.size === 0) {
        console.warn(`No valid position, rotation, or scale tracks found for ${object.name}.`);
        return;
    }

    // Pass 2: Create a complete, interpolated keyframe at each unique timestamp.
    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
    const tempPos = new THREE.Vector3(),
        tempQuat = new THREE.Quaternion(),
        tempScale = new THREE.Vector3();

    sortedTimes.forEach(time => {
        const frame = Math.round(time * fps);
        objectKeyframes[frame] = {
            time: time,
            position: getValueAtTime(time, animationData.position, object.position, tempPos).clone(),
            rotation: getValueAtTime(time, animationData.quaternion, object.quaternion, tempQuat).clone(),
            scale: getValueAtTime(time, animationData.scale, object.scale, tempScale).clone()
        };
    });

    if (Object.keys(objectKeyframes).length > 0) {
        keyframes.set(object.uuid, objectKeyframes);
        console.log(`✅ Timeline populated for '${object.name}' with ${Object.keys(objectKeyframes).length} complete keyframes.`);
    }
}

/**
 * Adds a new keyframe for the currently selected object at the current time.
 */
function addKeyframe() {
    if (!selectedObject) {
        console.warn('Cannot add keyframe: No object selected.');
        return;
    }

    const frame = Math.round(currentTime * fps);
    const objectKeyframes = keyframes.get(selectedObject.uuid) || {};

    objectKeyframes[frame] = {
        time: currentTime, // Store precise time for accuracy
        position: selectedObject.position.clone(),
        rotation: selectedObject.quaternion.clone(), // Always use quaternions for rotation data
        scale: selectedObject.scale.clone()
    };

    keyframes.set(selectedObject.uuid, objectKeyframes);
    updateKeyframesUI();
    updateLayersUI(); // Ensure the object appears in layers if it's the first keyframe
}

/**
 * Deletes the currently selected keyframe from the timeline.
 */
function deleteKeyframe() {
    if (!selectedObject || !selectedKeyframe) {
        console.warn('Cannot delete keyframe: No object or keyframe selected.');
        return;
    }

    const frame = parseInt(selectedKeyframe.dataset.frame, 10);
    const objectKeyframes = keyframes.get(selectedObject.uuid);

    if (objectKeyframes && objectKeyframes[frame]) {
        delete objectKeyframes[frame];
        selectedKeyframe.remove();
        selectedKeyframe = null;

        // If no keyframes are left, remove the object from the timeline data
        if (Object.keys(objectKeyframes).length === 0) {
            keyframes.delete(selectedObject.uuid);
            updateLayersUI(); // Remove from layers list
        }

        updateKeyframesUI(); // Redraw UI
    }
}

/**
 * Visually marks a keyframe element as selected.
 * @param {HTMLElement} keyframeElement The keyframe div to select.
 */
function selectKeyframe(keyframeElement) {
    if (selectedKeyframe) {
        selectedKeyframe.classList.remove('selected');
    }
    selectedKeyframe = keyframeElement;
    selectedKeyframe.classList.add('selected');
}


// --- ANIMATION & SCENE UPDATING ---

/**
 * Updates the positions of all animated objects in the scene based on the current time.
 */
function updateSceneFromTimeline() {
    const currentFrame = Math.round(currentTime * fps);

    scene.traverse((object) => {
        if (!object.isObject3D || !object.uuid) return;
        if (pathAnimator && pathAnimator.animatingObjects.has(object)) return; // Skip objects controlled by other systems

        const objectKeyframes = keyframes.get(object.uuid);
        if (!objectKeyframes || Object.keys(objectKeyframes).length === 0) {
            return;
        }

        const frames = Object.keys(objectKeyframes).map(Number).sort((a, b) => a - b);
        if (frames.length === 0) return;

        // Determine state based on playhead position relative to keyframes
        if (currentFrame <= frames[0]) {
            applyKeyframe(object, objectKeyframes[frames[0]]);
        } else if (currentFrame >= frames[frames.length - 1]) {
            applyKeyframe(object, objectKeyframes[frames[frames.length - 1]]);
        } else {
            const prevFrame = frames.findLast(f => f <= currentFrame);
            const nextFrame = frames.find(f => f > currentFrame);

            if (prevFrame !== undefined && nextFrame !== undefined) {
                 if (prevFrame === nextFrame) {
                    applyKeyframe(object, objectKeyframes[prevFrame]);
                 } else {
                    const t = (currentFrame - prevFrame) / (nextFrame - prevFrame);
                    interpolateKeyframe(object, objectKeyframes[prevFrame], objectKeyframes[nextFrame], t);
                 }
            }
        }
    });
}

/**
 * Directly applies the transform properties from a keyframe to a scene object.
 * @param {THREE.Object3D} object The object to modify.
 * @param {object} keyframe The keyframe data object.
 */
function applyKeyframe(object, keyframe) {
    if (!object || !keyframe) return;
    object.position.copy(keyframe.position);
    object.quaternion.copy(keyframe.rotation);
    object.scale.copy(keyframe.scale);
}

/**
 * Interpolates an object's transform between two keyframes.
 * @param {THREE.Object3D} object The object to modify.
 * @param {object} start The starting keyframe data.
 * @param {object} end The ending keyframe data.
 * @param {number} t The interpolation factor (0 to 1).
 */
function interpolateKeyframe(object, start, end, t) {
    object.position.lerpVectors(start.position, end.position, t);
    object.quaternion.slerpQuaternions(start.rotation, end.rotation, t);
    object.scale.lerpVectors(start.scale, end.scale, t);
}


// --- UI UPDATE FUNCTIONS ---

/**
 * Rebuilds the layers panel based on objects that have keyframes.
 */
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
            if (typeof transformControls !== 'undefined') {
                transformControls.attach(object);
            }
            updateLayersUI(); // Re-render to show new selection
        });

        layersList.appendChild(layer);
    });
}

/**
 * Rebuilds the keyframe track display for all animated objects.
 */
function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    // A more efficient way would be to update existing rows, but this is simpler.
    keyframesContainer.innerHTML = '';

    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;

        const trackRow = document.createElement('div');
        trackRow.className = 'timeline-track-row';
        trackRow.dataset.uuid = uuid;

        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframeEl = document.createElement('div');
            keyframeEl.className = 'keyframe';
            keyframeEl.dataset.frame = frame;
            keyframeEl.style.left = `${(data.time / timelineDuration) * 100}%`;
            keyframeEl.title = `Keyframe for: ${object.name}\nFrame: ${frame} (Time: ${data.time.toFixed(2)}s)`;

            if (selectedKeyframe && selectedKeyframe.dataset.frame === frame) {
                keyframeEl.classList.add('selected');
            }

            trackRow.appendChild(keyframeEl);
        });

        keyframesContainer.appendChild(trackRow);
    });
}


// --- HELPERS & UTILITIES ---

/**
 * Automatically expands the main timeline's duration to accommodate an object's animations.
 * @param {THREE.Object3D} object The object containing animation clips.
 */
function autoSetTimelineDurationFromAnimations(object) {
    if (object.animations && object.animations.length > 0) {
        let maxDuration = 0;
        object.animations.forEach(clip => {
            if (clip.duration > maxDuration) maxDuration = clip.duration;
        });
        // Only expand the timeline, don't shrink it
        if (maxDuration > timelineDuration) {
            timelineDuration = maxDuration;
            initializeTimelineScale(); // Redraw scale with new duration
        }
    }
}

/**
 * Helper to get an interpolated value from a KeyframeTrack at a specific time.
 * This is crucial for the `addObjectToTimeline` resampling process.
 * @param {number} time The time at which to sample the value.
 * @param {THREE.KeyframeTrack} track The animation track.
 * @param {THREE.Vector3|THREE.Quaternion} defaultValue The default value if track is null.
 * @param {THREE.Vector3|THREE.Quaternion} outValue An object to store the result in.
 * @returns {THREE.Vector3|THREE.Quaternion} The resulting interpolated value.
 */
function getValueAtTime(time, track, defaultValue, outValue) {
    if (!track) return outValue.copy(defaultValue);

    const times = track.times;
    const values = track.values;
    const valueSize = track.getValueSize();

    // Before first keyframe
    if (time < times[0]) {
        return outValue.fromArray(values, 0);
    }
    // After last keyframe
    if (time >= times[times.length - 1]) {
        return outValue.fromArray(values, (times.length - 1) * valueSize);
    }
    // Between keyframes
    for (let i = 0; i < times.length - 1; i++) {
        if (time >= times[i] && time < times[i + 1]) {
            const t = (time - times[i]) / (times[i + 1] - times[i]);
            const v0 = new outValue.constructor().fromArray(values, i * valueSize);
            const v1 = new outValue.constructor().fromArray(values, (i + 1) * valueSize);

            if (outValue.isQuaternion) {
                return THREE.Quaternion.slerp(v0, v1, outValue, t);
            }
            return outValue.copy(v0).lerp(v1, t);
        }
    }
    return outValue.copy(defaultValue); // Fallback, should not be reached
}

/**
 * Manages the 'active' state for a group of toggle buttons.
 */
function activatePanelButtonTool() {
    const buttons = document.querySelectorAll('.panel-button-tool');

    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Deactivate all other buttons in the group
            buttons.forEach(btn => {
                if (btn !== this) {
                    btn.classList.remove('active');
                    updateButtonState(btn);
                }
            });

            // Toggle the clicked button
            this.classList.toggle('active');
            updateButtonState(this);

            // Optional: Trigger a related function
            const action = this.dataset.action || this.id;
            if (action && typeof window[action] === 'function') {
                window[action]();
            }
        });
    });
}

/**
 * Helper to update ARIA attributes and tooltips for a button's state.
 * @param {HTMLElement} button The button to update.
 */
function updateButtonState(button) {
    const isActive = button.classList.contains('active');
    const baseTitle = button.title.split(' (')[0]; // Get original title
    button.setAttribute('aria-pressed', isActive);
    button.title = `${baseTitle} (${isActive ? 'Active' : 'Inactive'})`;
}
