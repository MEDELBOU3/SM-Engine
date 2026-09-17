// --- ADVANCED TIMELINE STORAGE ---
const animationClips = new Map(); // Map<uuid, Array<ClipObject>>
const eventTracks = new Map();    // Map<uuid, Map<frame, EventObject>>

/* 
  ClipObject Structure: 
  { id, name, startFrame, duration, timeScale, keyframes: {...} }
  
  EventObject Structure:
  { frame, functionName, payload: {} }
*/

/**
 * Groups currently selected keyframes into an NLA Clip
 */
function createClipFromSelection() {
    if (selectedKeyframes.length === 0) return;

    const uuid = selectedObject.uuid;
    const frames = selectedKeyframes.map(kf => parseInt(kf.dataset.frame));
    const minFrame = Math.min(...frames);
    const maxFrame = Math.max(...frames);
    
    const clipKeyframes = {};
    const objKfs = keyframes.get(uuid);

    // Move keyframes from main track to the Clip
    frames.forEach(f => {
        clipKeyframes[f - minFrame] = JSON.parse(JSON.stringify(objKfs[f]));
        delete objKfs[f];
    });

    const newClip = {
        id: 'clip_' + Date.now(),
        name: "New Action",
        startFrame: minFrame,
        duration: maxFrame - minFrame,
        timeScale: 1.0,
        keyframes: clipKeyframes
    };

    if (!animationClips.has(uuid)) animationClips.set(uuid, []);
    animationClips.get(uuid).push(newClip);

    updateKeyframesUI();
    console.log("NLA Clip Created:", newClip.name);
}

/**
 * Render logic for the Track View
 */
function drawClipsForTrack(container, object) {
    const clips = animationClips.get(object.uuid) || [];
    const pixelsPerFrame = (pixelsPerSecond * zoomLevel) / fps;

    clips.forEach(clip => {
        const clipEl = document.createElement('div');
        clipEl.className = 'nla-clip';
        clipEl.style.left = `${clip.startFrame * pixelsPerFrame}px`;
        clipEl.style.width = `${clip.duration * pixelsPerFrame}px`;
        clipEl.innerHTML = `<span class="clip-label">${clip.name}</span>`;
        
        // Add internal keyframe dots (mini preview)
        Object.keys(clip.keyframes).forEach(f => {
            const dot = document.createElement('div');
            dot.className = 'keyframe-mini';
            dot.style.left = `${f * pixelsPerFrame}px`;
            clipEl.appendChild(dot);
        });

        // Make Clip Draggable
        makeElementDraggable(clipEl, (newLeft) => {
            clip.startFrame = Math.round(newLeft / pixelsPerFrame);
            updateSceneFromTimeline();
        });

        container.appendChild(clipEl);
    });
}

/**
 * Adds an event to the selected object's logic track
 */
function addEventToTimeline(functionName, params = {}) {
    if (!selectedObject) return;
    const frame = Math.round(currentTime * fps);
    
    if (!eventTracks.has(selectedObject.uuid)) {
        eventTracks.set(selectedObject.uuid, new Map());
    }
    
    eventTracks.get(selectedObject.uuid).set(frame, {
        name: functionName,
        payload: params
    });
    
    updateKeyframesUI();
}

/**
 * Adds an event to the selected object's logic track
 */
function addEventToTimeline(functionName, params = {}) {
    if (!selectedObject) return;
    const frame = Math.round(currentTime * fps);
    
    if (!eventTracks.has(selectedObject.uuid)) {
        eventTracks.set(selectedObject.uuid, new Map());
    }
    
    eventTracks.get(selectedObject.uuid).set(frame, {
        name: functionName,
        payload: params
    });
    
    updateKeyframesUI();
}

/**
 * The "Trigger" System
 * This runs inside your animate() loop
 */
let lastProcessedFrame = -1;

function checkEventTriggers() {
    if (!isPlaying) return;
    
    const currentFrame = Math.round(currentTime * fps);
    if (currentFrame === lastProcessedFrame) return;

    eventTracks.forEach((track, uuid) => {
        if (track.has(currentFrame)) {
            const event = track.get(currentFrame);
            triggerGameEvent(event.name, event.payload);
        }
    });

    lastProcessedFrame = currentFrame;
}

function triggerGameEvent(name, data) {
    customConsole.log(`🎬 Timeline Event: Triggering [${name}]`);
    
    // Logic: Look for a global function or a script method
    if (typeof window[name] === 'function') {
        window[name](data);
    } else {
        // Fallback: If it's a specific object message
        const obj = scene.getObjectByProperty('uuid', data.targetUuid);
        if (obj && obj.userData.scriptInstance && typeof obj.userData.scriptInstance[name] === 'function') {
            obj.userData.scriptInstance[name](data);
        }
    }
}

function injectEventTrack(parentElement, objectUuid) {
    const eventRow = document.createElement('div');
    eventRow.className = 'layer-item event-track-label';
    eventRow.innerHTML = `<i class="fas fa-bolt" style="color: #ffcc00"></i> <span>Events</span>`;
    
    eventRow.onclick = () => {
        const func = prompt("Function to trigger:", "playSound");
        if(func) addEventToTimeline(func, { targetUuid: objectUuid });
    };

    parentElement.appendChild(eventRow);
}