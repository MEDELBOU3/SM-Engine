// --- SCENE & MODEL INTEGRATION (Functions using your globals like `scene`, `transformControls`, etc.) ---
// js/timeline/core/timeline-data.js
/**
 * The definitive function for adding a 3D model to the scene.
 * It sets up the model, its animation mixer (if any), integrates it with the timeline system,
 * and updates relevant UI panels.
 *
 * @param {THREE.Object3D} object The `THREE.Object3D` instance loaded from a file.
 * @param {string} name The desired name for the object in the editor.
 */
function setupModelInScene(object, name) {
    if (!object) {
        console.error("setupModelInScene was called with an invalid object.");
        return;
    }

    object.name = name || 'Untitled Model';
    console.log(`Setting up model '${object.name}' in the main scene.`);

    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    scene.add(object);
    selectedObject = object;

    if (typeof transformControls !== 'undefined') {
        transformControls.attach(object);
    }

    if (object.animations && object.animations.length > 0) {
        console.log(`Found ${object.animations.length} animations for '${object.name}'. Setting up mixer and timeline.`);
        if (!object.userData.mixer) {
            object.userData.mixer = new THREE.AnimationMixer(object);
        }
        configureTimelineMixerActions(object);

        autoSetTimelineDurationFromAnimations(object);
        if (!hasVisibleTimelineTracksForObject(object.uuid)) {
            addObjectToTimeline(object);
        }
    } else {
        console.log(`'${object.name}' is static. It will stay out of the timeline until it actually has keyframes.`);
    }

    updateLayersUI();
    updateKeyframesUI();
    if (typeof updateHierarchy === 'function') {
        updateHierarchy();
    }
}


// Helper function to format seconds into MM:SS:ms string (similar to updateTimeDisplay but can handle specific times)
function formatTimeToMMSSms(seconds) {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    const milliseconds = Math.round((seconds - totalSeconds) * 1000);
    return `${minutes.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
}

// Helper function to parse MM:SS:ms string into seconds
function parseMMSSmsToSeconds(timeString) {
    const parts = timeString.split(':');
    if (parts.length === 3) {
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        const milliseconds = parseInt(parts[2], 10);
        return minutes * 60 + seconds + milliseconds / 1000;
    }
    // Fallback if format is not MM:SS:ms, assume it might be pure seconds
    return parseFloat(timeString) || 0;
}

function addObjectToTimeline(object) {
    if (!object || !object.isObject3D || !object.uuid) {
        console.warn("addObjectToTimeline: Invalid object provided.", object);
        return;
    }

    const hasNativeAnimations = object.animations && object.animations.length > 0;
    object.userData.animationTarget = object.getObjectByName('mixamorigHips') || object;

    if (!hasNativeAnimations) {
        if (hasVisibleTimelineTracksForObject(object.uuid)) {
            updateKeyframesUI();
            updateLayersUI();
        }
        return;
    }

    if (!object.userData.mixer) {
        object.userData.mixer = new THREE.AnimationMixer(object);
    }
    configureTimelineMixerActions(object);

    if (typeof extractAnimationsToTimeline === 'function') {
        extractAnimationsToTimeline(object, object.animations);
    } else {
        console.warn('extractAnimationsToTimeline is unavailable; falling back to legacy sampling.');
    }

    autoSetTimelineDurationFromAnimations(object);
    updateKeyframesUI();
    updateLayersUI();
}

/**
 * Iteratively finds the Bezier parameter 'u' (0-1) corresponding to a target 'time' on a 2D cubic Bezier curve.
 * @param {number} t_normalized_segment Current normalized time within the segment (0-1).
 * @param {number} P0_time Start keyframe absolute time.
 * @param {number} C1_time Control Point 1 absolute time (P0_time + h0_x).
 * @param {number} C2_time Control Point 2 absolute time (P1_time + h1_x).
 * @param {number} P1_time End keyframe absolute time.
 * @returns {number} The Bezier parameter 'u' (0-1).
 */
function findBezierParameterU(t_normalized_segment, P0_time, C1_time, C2_time, P1_time) {
    const targetTime = P0_time + t_normalized_segment * (P1_time - P0_time);
    let u = t_normalized_segment; // Initial guess for u (linear approximation)

    // Perform a few iterations of Newton-Raphson-like refinement
    for (let iter = 0; iter < 5; iter++) {
        const x_at_u = (1 - u) ** 3 * P0_time + 3 * (1 - u) ** 2 * u * C1_time + 3 * (1 - u) * u ** 2 * C2_time + u ** 3 * P1_time;
        const dx_du = -3 * (1 - u) ** 2 * P0_time + 3 * ((1 - u) ** 2 - 2 * (1 - u) * u) * C1_time + 3 * (2 * (1 - u) * u - u ** 2) * C2_time + 3 * u ** 2 * P1_time;

        if (Math.abs(dx_du) < 0.0001) break; // Avoid division by zero for very flat tangents

        u = u - (x_at_u - targetTime) / dx_du;
        u = Math.max(0, Math.min(1, u)); // Clamp u to ensure it stays within valid range
    }
    return u;
}

/**
 * Calculates a point on a 2D cubic Bezier curve (for a single component like position.x).
 * Assumes handle offsets are relative to keyframe time/value.
 * @param {number} t_normalized_segment Current normalized time within the segment (0-1).
 * @param {number} kf0_value Start keyframe component value.
 * @param {number} h0_x Relative X offset of start keyframe's OUT handle.
 * @param {number} h0_y Relative Y offset of start keyframe's OUT handle.
 * @param {number} kf1_value End keyframe component value.
 * @param {number} h1_x Relative X offset of end keyframe's IN handle.
 * @param {number} h1_y Relative Y offset of end keyframe's IN handle.
 * @param {number} kf0_time Start keyframe absolute time.
 * @param {number} kf1_time End keyframe absolute time.
 * @returns {number} Interpolated component value.
 */
function interpolateBezierComponent(t_normalized_segment, kf0_value, h0_x, h0_y, kf1_value, h1_x, h1_y, kf0_time, kf1_time) {
    // Define the 2D control points for the Bezier curve (Time, Value)
    const P0_time = kf0_time;
    const P0_value = kf0_value;

    const C1_time = P0_time + h0_x; // Control Point 1 (OUT handle) time
    const C1_value = P0_value + h0_y; // Control Point 1 (OUT handle) value

    const P1_time = kf1_time;
    const P1_value = kf1_value;

    const C2_time = P1_time + h1_x; // Control Point 2 (IN handle) time
    const C2_value = P1_value + h1_y; // Control Point 2 (IN handle) value

    // Find the Bezier parameter 'u' that corresponds to the current segment time
    const u = findBezierParameterU(t_normalized_segment, P0_time, C1_time, C2_time, P1_time);

    // Calculate the interpolated value (Y component of the Bezier curve) using the found 'u'
    const interpolated_value = (1 - u) ** 3 * P0_value + 3 * (1 - u) ** 2 * u * C1_value + 3 * u ** 2 * (1 - u) * C2_value + u ** 3 * P1_value;

    return interpolated_value;
}


function addKeyframe() {
    if (!selectedObject) {
        console.warn('Cannot add keyframe: No object selected.');
        return;
    }

    const frame = Math.round(currentTime * fps);
    const interpolationType = currentDefaultInterpolationType;

    let target, keyframeMap;
    const isBoneKeyframe = !!selectedBone;

    if (isBoneKeyframe) {
        // --- Keyframing a Bone ---
        target = selectedBone;
        const owner = getTimelineOwnerForBone(selectedBone, selectedObject);
        const ownerUuid = owner.uuid;

        if (!boneKeyframes.has(ownerUuid)) boneKeyframes.set(ownerUuid, new Map());
        const boneMap = boneKeyframes.get(ownerUuid);
        if (!boneMap.has(target.name)) boneMap.set(target.name, {});
        keyframeMap = boneMap.get(target.name);

        console.log(`Adding keyframe for BONE: ${target.name}`);

    } else {
        // --- Keyframing a Root Object ---
        target = selectedObject.userData.animationTarget || selectedObject;
        keyframeMap = keyframes.get(selectedObject.uuid) || {};
        keyframes.set(selectedObject.uuid, keyframeMap); // Ensure map is set if it was new

        console.log(`Adding keyframe for ROOT: ${target.name}`);
    }

    const currentEuler = new THREE.Euler().setFromQuaternion(target.quaternion, 'XYZ');
    const kfData = {
        time: currentTime,
        position: target.position.clone(),
        rotation: target.quaternion.clone(),
        rotationEuler: { x: currentEuler.x, y: currentEuler.y, z: currentEuler.z },
        scale: target.scale.clone(),
        interpolation: interpolationType,
        source: 'manual',
        isImportedTrack: false,
        isBoneKeyframe: isBoneKeyframe,
        boneName: isBoneKeyframe ? target.name : null
    };

    graphChannels.forEach(channel => {
        kfData[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
        kfData[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
        kfData[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
        kfData[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
    });

    keyframeMap[frame] = kfData;

    updateKeyframesUI();
    updateLayersUI();
    if (typeof updateHierarchy === 'function') updateHierarchy();
}



// --- END MODIFIED CODE ---

function deleteKeyframe() {
    if (selectedKeyframes.length === 0) {
        console.warn('Cannot delete keyframe(s): No keyframe(s) selected.');
        return;
    }

    selectedKeyframes.forEach(kfEl => {
        const frame = parseInt(kfEl.dataset.frame, 10);
        const uuid = kfEl.dataset.uuid;
        const boneName = kfEl.dataset.boneName; // Will be undefined for root keyframes

        let keyframeMap;
        if (boneName) {
            keyframeMap = boneKeyframes.get(uuid)?.get(boneName);
        } else {
            keyframeMap = keyframes.get(uuid);
        }

        if (keyframeMap && keyframeMap[frame]) {
            delete keyframeMap[frame];
            if (boneName) {
                const boneMap = boneKeyframes.get(uuid);
                if (boneMap && keyframeMap && Object.keys(keyframeMap).length === 0) {
                    boneMap.delete(boneName);
                    if (boneMap.size === 0) {
                        boneKeyframes.delete(uuid);
                    }
                }
            } else if (Object.keys(keyframeMap).length === 0) {
                keyframes.delete(uuid);
            }
        }
    });

    selectedKeyframes = [];
    selectedKeyframe = null;

    updateKeyframesUI();
    updateLayersUI();
    updateSceneFromTimeline();
    console.log(`Deleted selected keyframe(s).`);
}

function getTimelineKeyframeEntries(keyframeMap) {
    if (!keyframeMap) return [];
    return Object.entries(keyframeMap)
        .map(([frame, kfData]) => ({
            frame: Number(frame),
            time: kfData?.time ?? (Number(frame) / fps),
            kfData
        }))
        .sort((a, b) => a.frame - b.frame);
}

function getChannelValueFromKeyframe(kfData, channelName) {
    if (!kfData) return null;

    const [prop, subProp] = channelName.split('.');
    if (prop === 'rotation') {
        if (kfData.rotationEuler && typeof kfData.rotationEuler[subProp] === 'number') {
            return kfData.rotationEuler[subProp];
        }
        if (kfData.rotation?.isQuaternion) {
            const euler = new THREE.Euler().setFromQuaternion(kfData.rotation, 'XYZ');
            return euler[subProp];
        }
        return null;
    }

    return typeof kfData[prop]?.[subProp] === 'number' ? kfData[prop][subProp] : null;
}

function valuesAreMeaningfullyDifferent(a, b, epsilon = 0.0001) {
    if (a == null || b == null) return false;
    return Math.abs(a - b) > epsilon;
}

function channelHasAnimatedData(keyframeMap, channelName) {
    const entries = getTimelineKeyframeEntries(keyframeMap);
    if (entries.length === 0) return false;

    let previousValue = null;
    let hasValue = false;

    for (const { kfData } of entries) {
        const value = getChannelValueFromKeyframe(kfData, channelName);
        if (value == null) continue;

        if (!hasValue) {
            previousValue = value;
            hasValue = true;
            continue;
        }

        if (valuesAreMeaningfullyDifferent(previousValue, value)) {
            return true;
        }
    }

    return hasValue && entries.length === 1 && !entries[0].kfData?.isImportedTrack;
}

function hasVisibleAnimatedKeyframes(keyframeMap) {
    if (!keyframeMap) return false;
    return graphChannels.some((channel) => channelHasAnimatedData(keyframeMap, channel.name));
}

function getAnimatedBoneNamesForObject(uuid) {
    const boneMap = boneKeyframes.get(uuid);
    if (!boneMap) return [];

    const names = [];
    boneMap.forEach((keyframeMap, boneName) => {
        if (hasVisibleAnimatedKeyframes(keyframeMap)) {
            names.push(boneName);
        }
    });

    return names;
}

function hasVisibleTimelineTracksForObject(uuid) {
    return hasVisibleAnimatedKeyframes(keyframes.get(uuid)) || getAnimatedBoneNamesForObject(uuid).length > 0;
}

function configureTimelineMixerActions(object) {
    if (!object?.userData?.mixer || !object.animations?.length) return;

    let maxDuration = 0;
    object.animations.forEach((clip) => {
        maxDuration = Math.max(maxDuration, clip.duration || 0);
        const action = object.userData.mixer.clipAction(clip);
        action.reset();
        action.enabled = true;
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.paused = false;
        action.play();
    });

    object.userData.timelineAnimationDuration = maxDuration;
}

function ensureTimelineMixerSamplingState(object) {
    if (!object?.userData?.mixer || !object.animations?.length) return null;

    const mixer = object.userData.mixer;
    mixer.timeScale = 1;

    object.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.enabled = true;
        action.paused = false;
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce, 1);
        action.setEffectiveWeight?.(1);
        action.setEffectiveTimeScale?.(1);
        action.play();
    });

    return mixer;
}

function sampleTimelineMixerAtTime(object, time) {
    const mixer = ensureTimelineMixerSamplingState(object);
    if (!mixer) return null;

    mixer.setTime(getClampedTimelineSampleTime(object, time));
    mixer.update(0);
    return mixer;
}

function getTimelineOwnerForBone(bone, fallbackObject = null) {
    let current = bone;
    while (current) {
        if (boneKeyframes.has(current.uuid)) {
            return current;
        }
        current = current.parent;
    }

    return fallbackObject || findSkinnedMeshOwner(bone) || null;
}

function markTimelineKeyframeAsUserEdited(kfData) {
    if (!kfData) return;
    kfData.source = 'manual';
    kfData.isImportedTrack = false;
}

function getRuntimeKeyframeMapForObject(object, keyframeMap) {
    if (!keyframeMap) return null;

    if (!object?.userData?.mixer) {
        return keyframeMap;
    }

    const runtimeEntries = Object.entries(keyframeMap).filter(([, kfData]) => !kfData?.isImportedTrack);
    if (runtimeEntries.length === 0) {
        return null;
    }

    return Object.fromEntries(runtimeEntries);
}

function getTimelineAnimationEndTimeForObject(object) {
    if (!object) return Infinity;

    if (typeof object.userData?.timelineAnimationDuration === 'number' && object.userData.timelineAnimationDuration > 0) {
        return object.userData.timelineAnimationDuration;
    }

    let maxTime = 0;
    const objectKeyframes = keyframes.get(object.uuid);
    if (objectKeyframes) {
        Object.values(objectKeyframes).forEach((kfData) => {
            maxTime = Math.max(maxTime, kfData?.time || 0);
        });
    }

    const boneMap = boneKeyframes.get(object.uuid);
    if (boneMap) {
        boneMap.forEach((keyframeMap) => {
            Object.values(keyframeMap).forEach((kfData) => {
                maxTime = Math.max(maxTime, kfData?.time || 0);
            });
        });
    }

    return maxTime > 0 ? maxTime : Infinity;
}

function getClampedTimelineSampleTime(object, time) {
    const endTime = getTimelineAnimationEndTimeForObject(object);
    return Number.isFinite(endTime) ? Math.min(time, endTime) : time;
}


/**
 * Visually marks a `keyframeElement` as selected.
 * Handles single selection (clearing previous) or multi-selection (with Shift/Ctrl/Cmd).
 * @param {HTMLElement} keyframeElement The keyframe div DOM element to select.
 * @param {MouseEvent} event The mouse event that triggered the selection (to check modifier keys).
 */
function selectKeyframe(keyframeElement, event) {
    const isModifierPressed = event && (event.shiftKey || event.ctrlKey || event.metaKey); // Check for Shift or Ctrl/Cmd

    if (isModifierPressed) {
        // Toggle selection for the clicked keyframe
        if (keyframeElement.classList.contains('selected')) {
            // Deselect: remove 'selected' class and remove from array
            keyframeElement.classList.remove('selected');
            selectedKeyframes = selectedKeyframes.filter(kf => kf !== keyframeElement);
        } else {
            // Select: add 'selected' class and add to array
            keyframeElement.classList.add('selected');
            selectedKeyframes.push(keyframeElement);
        }
        // Update `selectedKeyframe` to be the *last interacted with* keyframe
        selectedKeyframe = keyframeElement;
    } else {
        // Single selection mode: Clear all previous selections first
        if (selectedKeyframe && !selectedKeyframe.isSameNode(keyframeElement)) { // Prevent deselecting itself if clicking again
            selectedKeyframe.classList.remove('selected');
        }
        selectedKeyframes.forEach(kf => {
            if (!kf.isSameNode(keyframeElement)) { // Only deselect if it's not the newly selected one
                kf.classList.remove('selected');
            }
        });
        selectedKeyframes = []; // Clear array for single selection

        // Select the clicked keyframe
        if (!keyframeElement.classList.contains('selected')) { // Only add if not already selected (e.g., clicking on it while single selected)
            keyframeElement.classList.add('selected');
        }
        selectedKeyframes.push(keyframeElement);
        selectedKeyframe = keyframeElement;
    }

    // After selection state changes, it's good to ensure all related UIs are up to date.
    // e.g., if you have a Properties Panel, it would now show data for `selectedKeyframe` (or maybe the first of `selectedKeyframes`)
    // Also ensures `updatePlayhead()` is consistent with the latest single keyframe chosen.
    if (selectedKeyframe) {
        currentTime = parseFloat(selectedKeyframe.dataset.time || (selectedKeyframe.dataset.frame / fps));
        updatePlayhead();
        updateTimeDisplay();
        // Update the global `selectedObject` based on the UUID of the (last) selected keyframe
        // This is important for ensuring the correct object is attached to TransformControls etc.
        const objectUuidOfSelectedKeyframe = selectedKeyframe.dataset.uuid;
        const correspondingObject = scene.getObjectByProperty('uuid', objectUuidOfSelectedKeyframe);
        if (correspondingObject && selectedObject !== correspondingObject) {
            selectedObject = correspondingObject;
            if (typeof transformControls !== 'undefined') {
                transformControls.attach(selectedObject);
            }
            updateLayersUI(); // To highlight the correct object layer
        }
        const selectedBoneName = selectedKeyframe.dataset.boneName;
        selectedBone = selectedBoneName ? correspondingObject?.getObjectByName(selectedBoneName) || null : null;
        if (selectedBoneName) {
            updateLayersUI();
        }
        // --- MODIFIED CODE ---
        // If graph editor is active and a keyframe is selected, try to select that keyframe in the graph
        if (isGraphView && !isDraggingGraph) { // Don't auto-select in graph if already dragging
            const selectedChannelData = getChannelKeyframeData(selectedGraphChannel);
            const graphKfIndex = selectedChannelData.findIndex(k =>
                k.uuid === selectedKeyframe.dataset.uuid && k.frame === parseInt(selectedKeyframe.dataset.frame)
            );
            if (graphKfIndex !== -1) {
                selectedGraphKeyframe = graphKfIndex;
                renderGraph();
            }
        }
        // --- END MODIFIED CODE ---
    }
}


// --- Animation & Scene Updating (Functions using your globals like `scene`, `keyframes`, `pathAnimator`) ---
function updateSceneFromTimeline() {
    if (typeof ensureMaps === 'function') ensureMaps();
    const time = typeof getCurrentTime === 'function' ? getCurrentTime() : (window.currentTime || 0);
    const currentFrame = Math.round(time * (window.fps || 30));
    const activeScene = (typeof scene !== 'undefined' ? scene : window.scene);

    if (!activeScene) return;

    activeScene.traverse((object) => {
        if (!object.isObject3D || !object.uuid) return;

        // 1. Layer 1: Apply native animation mixer base pose
        if (object.userData?.mixer) {
            sampleTimelineMixerAtTime(object, time);
        }

        // 2. Layer 2: Apply custom Skeleton Bone keyframes
        const objBoneKeyframes = window.boneKeyframes?.get(object.uuid);
        if (objBoneKeyframes) {
            objBoneKeyframes.forEach((boneKfMap, boneName) => {
                const bone = object.getObjectByName(boneName);
                if (!bone) return;

                if (window.TimelineBinaryEvaluator) {
                    window.TimelineBinaryEvaluator.evaluateObject(bone, boneKfMap, time);
                } else if (typeof interpolateAndApply === 'function') {
                    interpolateAndApply(bone, boneKfMap, currentFrame);
                }
            });
        }

        // 3. Layer 3: Apply custom Root Object keyframe overrides
        const objectKeyframes = window.keyframes?.get(object.uuid);
        if (objectKeyframes) {
            const animationTarget = object.userData.animationTarget || object;

            if (window.TimelineBinaryEvaluator) {
                window.TimelineBinaryEvaluator.evaluateObject(animationTarget, objectKeyframes, time);
            } else if (typeof interpolateAndApply === 'function') {
                interpolateAndApply(animationTarget, objectKeyframes, currentFrame);
            }
        }
    });
}

/**
 * Helper function to find surrounding keyframes and apply interpolated transform to a target.
 * @param {THREE.Object3D} target - The object or bone to apply the transform to.
 * @param {Object} keyframeMap - The map of keyframes for this target.
 * @param {number} currentFrame - The current frame on the timeline.
 */
function interpolateAndApply(target, keyframeMap, currentFrame) {
    const frames = Object.keys(keyframeMap).map(Number).sort((a, b) => a - b);
    if (frames.length === 0) return;

    let finalKf;
    if (currentFrame <= frames[0]) {
        finalKf = keyframeMap[frames[0]];
        target.position.copy(finalKf.position);
        target.quaternion.copy(finalKf.rotation);
        target.scale.copy(finalKf.scale);
    } else if (currentFrame >= frames[frames.length - 1]) {
        finalKf = keyframeMap[frames[frames.length - 1]];
        target.position.copy(finalKf.position);
        target.quaternion.copy(finalKf.rotation);
        target.scale.copy(finalKf.scale);
    } else {
        const prevFrame = frames.findLast(f => f <= currentFrame);
        const nextFrame = frames.find(f => f > currentFrame);

        if (prevFrame !== undefined && nextFrame !== undefined) {
            if (prevFrame === nextFrame) {
                finalKf = keyframeMap[prevFrame];
                target.position.copy(finalKf.position);
                target.quaternion.copy(finalKf.rotation);
                target.scale.copy(finalKf.scale);
            } else {
                const t = (currentFrame - prevFrame) / (nextFrame - prevFrame);
                // We reuse the master 'interpolateKeyframe' function as it works on generic data
                interpolateKeyframe(target, keyframeMap[prevFrame], keyframeMap[nextFrame], t);
            }
        }
    }
}

function applyKeyframe(object, keyframe) {
    if (!object || !keyframe) return;

    const animationTarget = object.userData.animationTarget;
    if (!animationTarget) {
        console.warn(`applyKeyframe: No animation target found in userData for object ${object.name}. Cannot apply keyframe.`);
        return;
    }

    animationTarget.position.copy(keyframe.position);
    animationTarget.quaternion.copy(keyframe.rotation);
    animationTarget.scale.copy(keyframe.scale);
}


// Re-purpose the original interpolateKeyframe to be a generic helper
function interpolateKeyframe(targetObject, startKfData, endKfData, t) {
    if (!targetObject || !startKfData || !endKfData) return;

    const interpolationType = startKfData.interpolation || currentDefaultInterpolationType;
    const clampedT = Math.max(0, Math.min(1, t));

    // ... [ The full, detailed 'interpolateKeyframe' function you provided, but using `targetObject` instead of `animationTarget` ]
    // (This function is now a generic utility used by `interpolateAndApply`)
    const startAbsTime = startKfData.time;
    const endAbsTime = endKfData.time;
    const getHandle = (kf, channelName, type, coord) => kf[`handle${type}_${channelName}_${coord}`] ?? (type === 'In' ? -DEFAULT_BEZIER_HANDLE_X_OFFSET : DEFAULT_BEZIER_HANDLE_X_OFFSET);
    const getHandleY = (kf, channelName, type) => kf[`handle${type}_${channelName}_y`] ?? DEFAULT_BEZIER_HANDLE_Y_OFFSET;

    switch (interpolationType) {
        case 'constant':
            targetObject.position.copy(startKfData.position);
            targetObject.quaternion.copy(startKfData.rotation);
            targetObject.scale.copy(startKfData.scale);
            break;
        case 'linear':
            targetObject.position.lerpVectors(startKfData.position, endKfData.position, clampedT);
            targetObject.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, clampedT);
            targetObject.scale.lerpVectors(startKfData.scale, endKfData.scale, clampedT);
            break;
        case 'bezier':
        default:
            // --- Position
            const pos_x = interpolateBezierComponent(clampedT, startKfData.position.x, getHandle(startKfData, 'position.x', 'Out', 'x'), getHandleY(startKfData, 'position.x', 'Out'), endKfData.position.x, getHandle(endKfData, 'position.x', 'In', 'x'), getHandleY(endKfData, 'position.x', 'In'), startAbsTime, endAbsTime);
            const pos_y = interpolateBezierComponent(clampedT, startKfData.position.y, getHandle(startKfData, 'position.y', 'Out', 'x'), getHandleY(startKfData, 'position.y', 'Out'), endKfData.position.y, getHandle(endKfData, 'position.y', 'In', 'x'), getHandleY(endKfData, 'position.y', 'In'), startAbsTime, endAbsTime);
            const pos_z = interpolateBezierComponent(clampedT, startKfData.position.z, getHandle(startKfData, 'position.z', 'Out', 'x'), getHandleY(startKfData, 'position.z', 'Out'), endKfData.position.z, getHandle(endKfData, 'position.z', 'In', 'x'), getHandleY(endKfData, 'position.z', 'In'), startAbsTime, endAbsTime);
            targetObject.position.set(pos_x, pos_y, pos_z);

            // --- ðŸ›‘ CRITICAL FIX: Rotation Interpolation (Spherical Slerp) ---
            // A continuous slerp stops backward-flipping issues entirely!
            const easeT = interpolateBezierComponent(clampedT, 0, getHandle(startKfData, 'rotation.x', 'Out', 'x'), 0, 1, getHandle(endKfData, 'rotation.x', 'In', 'x'), 0, startAbsTime, endAbsTime);
            targetObject.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, Math.max(0, Math.min(1, easeT)));

            // --- Scale
            const scale_x = interpolateBezierComponent(clampedT, startKfData.scale.x, getHandle(startKfData, 'scale.x', 'Out', 'x'), getHandleY(startKfData, 'scale.x', 'Out'), endKfData.scale.x, getHandle(endKfData, 'scale.x', 'In', 'x'), getHandleY(endKfData, 'scale.x', 'In'), startAbsTime, endAbsTime);
            const scale_y = interpolateBezierComponent(clampedT, startKfData.scale.y, getHandle(startKfData, 'scale.y', 'Out', 'x'), getHandleY(startKfData, 'scale.y', 'Out'), endKfData.scale.y, getHandle(endKfData, 'scale.y', 'In', 'x'), getHandleY(endKfData, 'scale.y', 'In'), startAbsTime, endAbsTime);
            const scale_z = interpolateBezierComponent(clampedT, startKfData.scale.z, getHandle(startKfData, 'scale.z', 'Out', 'x'), getHandleY(startKfData, 'scale.z', 'Out'), endKfData.scale.z, getHandle(endKfData, 'scale.z', 'In', 'x'), getHandleY(endKfData, 'scale.z', 'In'), startAbsTime, endAbsTime);
            targetObject.scale.set(scale_x, scale_y, scale_z);
            break;
    }
}

