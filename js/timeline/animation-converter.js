/**
 * @file js/timeline/animation-converter.js
 * Extractor for GLTF / FBX / OBJ Models.
 * Maps GLTF/FBX tracks to Object3D nodes and registers keyframes for the Timeline UI.
 */

function extractAnimationsToTimeline(model, animations) {
    if (!model || !animations || animations.length === 0) {
        console.warn('[AnimConverter] No animations found in model:', model?.name);
        return;
    }

    if (!window.keyframes) window.keyframes = new Map();
    if (!window.boneKeyframes) window.boneKeyframes = new Map();
    const fps = Number(window.fps || 30);

    console.log(`[AnimConverter] Extracting ${animations.length} clip(s) for '${model.name || 'Model'}'`);

    // Ensure the root model is registered in the keyframe map
    if (!window.keyframes.has(model.uuid)) {
        window.keyframes.set(model.uuid, {});
    }

    model.userData.animatedChildUuids = model.userData.animatedChildUuids || new Set();

    let maxClipDuration = 0;

    animations.forEach((clip) => {
        maxClipDuration = Math.max(maxClipDuration, clip.duration || 0);

        const tracksByTargetName = new Map();

        clip.tracks.forEach((track) => {
            const lastDotIndex = track.name.lastIndexOf('.');
            if (lastDotIndex === -1) return;

            let targetPath = track.name.substring(0, lastDotIndex);
            const property = track.name.substring(lastDotIndex + 1);

            // Strip path slashes if track name contains node hierarchy
            if (targetPath.includes('/')) {
                const parts = targetPath.split('/');
                targetPath = parts[parts.length - 1];
            }

            if (!tracksByTargetName.has(targetPath)) {
                tracksByTargetName.set(targetPath, {
                    position: null,
                    quaternion: null,
                    scale: null
                });
            }

            tracksByTargetName.get(targetPath)[property] = track;
        });

        // Resolve target objects in scene graph
        tracksByTargetName.forEach((tracks, targetName) => {
            let targetObject = null;

            if (model.name === targetName) {
                targetObject = model;
            } else {
                targetObject = model.getObjectByName(targetName);
            }

            if (!targetObject) {
                model.traverse((child) => {
                    if (!targetObject && child.name && child.name.toLowerCase() === targetName.toLowerCase()) {
                        targetObject = child;
                    }
                });
            }

            if (!targetObject) {
                console.warn(`[AnimConverter] Could not resolve node target '${targetName}' on model '${model.name}'`);
                return;
            }

            const uuid = targetObject.uuid;

            // Link parent and child in userData
            model.userData.animatedChildUuids.add(uuid);
            targetObject.userData.rootModelUuid = model.uuid;

            const timeSet = new Set();
            if (tracks.position) tracks.position.times.forEach(t => timeSet.add(t));
            if (tracks.quaternion) tracks.quaternion.times.forEach(t => timeSet.add(t));
            if (tracks.scale) tracks.scale.times.forEach(t => timeSet.add(t));

            const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);

            if (!window.keyframes.has(uuid)) {
                window.keyframes.set(uuid, {});
            }
            const keyframeMap = window.keyframes.get(uuid);

            sortedTimes.forEach((time) => {
                const frame = Math.round(time * fps);

                const pos = getTrackValueAtTime(tracks.position, time, targetObject.position);
                const rot = getTrackValueAtTime(tracks.quaternion, time, targetObject.quaternion);
                const scl = getTrackValueAtTime(tracks.scale, time, targetObject.scale);

                const euler = new THREE.Euler().setFromQuaternion(rot, 'XYZ');

                keyframeMap[frame] = {
                    time: time,
                    position: pos.clone(),
                    rotation: rot.clone(),
                    rotationEuler: { x: euler.x, y: euler.y, z: euler.z },
                    scale: scl.clone(),
                    interpolation: 'linear',
                    source: 'imported'
                };
            });
        });
    });

    if (maxClipDuration > 0) {
        window.timelineDuration = Math.max(maxClipDuration, window.timelineDuration || 10);
        if (typeof window.setTimelineDuration === 'function') {
            window.setTimelineDuration(window.timelineDuration);
        }
    }

    if (window.TimelineBinaryEvaluator) {
        window.TimelineBinaryEvaluator.invalidateCache();
    }

    // Auto-expand this model in the timeline so all bone tracks are visible immediately
    // (mirrors Blender/UE5 behavior where imported animations are shown expanded)
    if (window.SMTimeline?._expandedRoots) {
        window.SMTimeline._expandedRoots.add(model.uuid);
    }

    // Refresh timeline UI
    setTimeout(() => {
        if (typeof window.updateLayersUI   === 'function') window.updateLayersUI();
        if (typeof window.updateKeyframesUI === 'function') window.updateKeyframesUI();
    }, 50);

    console.log(`[AnimConverter] Extracted keyframes for ${model.userData.animatedChildUuids.size} animated node(s)`);
}

function getTrackValueAtTime(track, time, defaultValue) {
    if (!track || !track.times || track.times.length === 0) {
        return defaultValue.clone ? defaultValue.clone() : defaultValue;
    }

    const times = track.times;
    const values = track.values;
    const stride = track.getValueSize();

    let i = 0;
    while (i < times.length && times[i] < time) {
        i++;
    }

    if (i === 0) {
        return extractVectorOrQuaternion(values, 0, stride, defaultValue);
    }
    if (i >= times.length) {
        return extractVectorOrQuaternion(values, times.length - 1, stride, defaultValue);
    }

    const t0 = times[i - 1];
    const t1 = times[i];
    const alpha = (time - t0) / Math.max(0.0001, t1 - t0);

    const v0 = extractVectorOrQuaternion(values, i - 1, stride, defaultValue);
    const v1 = extractVectorOrQuaternion(values, i, stride, defaultValue);

    if (defaultValue.isVector3) {
        return new THREE.Vector3().lerpVectors(v0, v1, alpha);
    } else if (defaultValue.isQuaternion) {
        return new THREE.Quaternion().slerpQuaternions(v0, v1, alpha);
    }

    return v0;
}

function extractVectorOrQuaternion(values, index, stride, defaultValue) {
    const offset = index * stride;

    if (defaultValue.isVector3) {
        return new THREE.Vector3(values[offset], values[offset + 1], values[offset + 2]);
    } else if (defaultValue.isQuaternion) {
        return new THREE.Quaternion(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
    }

    return defaultValue;
}