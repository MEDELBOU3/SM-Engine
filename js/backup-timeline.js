/**
 * @file timeline.js
 * Manages the animation timeline, keyframe manipulation, UI interactions,
 * and the integration of 3D models into the animation system.
 */

// --- COMPLETE SCRIPT FOR TIMELINE RESIZING & MODAL RESPONSIVENESS ---

// Global elements you define with `const` at the top of *this specific file*.
const resizeHandle = document.querySelector('.resize-handle-timeline');
const timelineRes = document.querySelector('.timeline'); // This refers to the main .timeline container div
const rendererContainer = document.getElementById('renderer-container');
// You stated: "I dont any viewport", so I'm removing the `viewport` const and will calculate heights against `window.innerHeight` or a suitable container like `body.clientHeight`.
// For resize calculation, if renderer-container and timelineRes fill the entire window, `window.innerHeight` is often the top parent.

const contextMenu = document.getElementById('keyframe-context-menu');
let copiedKeyframe = null;

let lastTime = performance.now(); // unused, consider removing
let frameCount = 0;               // unused, consider removing
let dragStart = 0;                // Will be correctly used for panning
let selectedSegment = null;       // Used for segment selection, will be accessed directly.
let timelineMarkers = [];
const markersContainer = document.getElementById('timeline-markers-container');
let _lastMouseOnRulerX = null;

let graphCanvas = null;
let graphCtx = null;
let graphViewTransform = { offsetX: 100, offsetY: 0, scale: 50, valueScale: 50 };
let selectedGraphChannel = 'position.x';
let selectedGraphKeyframe = null;

const selectionBox = document.getElementById('selection-box');
let isBoxSelecting = false;
let boxSelectStart = { x: 0, y: 0 };
let dragKeyframeInitialStates = []; 

let selectedGraphHandle = null;
let isDraggingGraph = false;
let graphDragStart = { x: 0, y: 0 };
let isGraphView = false;
let rulerMarkerPool = [];
let resizeTimeout;

let isSnappingEnabledTimeline = true; 
// --- MODIFIED CODE ---
// Define default bezier handle offsets (relative to keyframe's time and value)
const DEFAULT_BEZIER_HANDLE_X_OFFSET = 0.1; // Represents 0.1 time units (e.g., 0.1 seconds)
const DEFAULT_BEZIER_HANDLE_Y_OFFSET = 0;   // Default vertical offset (value units)
// --- END MODIFIED CODE ---

/*const graphChannels = [
    { name: 'position.x', color: '#ff4444', label: 'Position X', getValue: (kf) => kf.position.x },
    { name: 'position.y', color: '#44ff44', label: 'Position Y', getValue: (kf) => kf.position.y },
    { name: 'position.z', color: '#4444ff', label: 'Position Z', getValue: (kf) => kf.position.z },
    { name: 'rotation.x', color: '#ff8844', label: 'Rotation X', getValue: (kf) => new THREE.Euler().setFromQuaternion(kf.rotation).x },
    { name: 'rotation.y', color: '#88ff44', label: 'Rotation Y', getValue: (kf) => new THREE.Euler().setFromQuaternion(kf.rotation).y },
    { name: 'rotation.z', color: '#4488ff', label: 'Rotation Z', getValue: (kf) => new THREE.Euler().setFromQuaternion(kf.rotation).z },
    { name: 'scale.x', color: '#ff44ff', label: 'Scale X', getValue: (kf) => kf.scale.x },
    { name: 'scale.y', color: '#44ffff', label: 'Scale Y', getValue: (kf) => kf.scale.y },
    { name: 'scale.z', color: '#ffff44', label: 'Scale Z', getValue: (kf) => kf.scale.z }
];*/ 

const graphChannels = [
    { name: 'position.x', color: '#ff4444', label: 'X', group: 'Location' },
    { name: 'position.y', color: '#44ff44', label: 'Y', group: 'Location' },
    { name: 'position.z', color: '#4444ff', label: 'Z', group: 'Location' },
    // For Rotation, we'll map Roll, Pitch, Yaw to Euler X, Y, Z for display.
    // When reading/writing, we convert Quaternions to Euler for these values.
    { name: 'rotation.x', color: '#ff8844', label: 'Roll', group: 'Rotation' },
    { name: 'rotation.y', color: '#88ff44', label: 'Pitch', group: 'Rotation' },
    { name: 'rotation.z', color: '#4488ff', label: 'Yaw', group: 'Rotation' },
    { name: 'scale.x', color: '#ff44ff', label: 'X', group: 'Scale' },
    { name: 'scale.y', color: '#44ffff', label: 'Y', group: 'Scale' },
    { name: 'scale.z', color: '#ffff44', label: 'Z', group: 'Scale' }
];

// This definition will drive the UI generation for the hierarchical layers list.
// It maps to the `graphChannels` above.
const CHANNEL_HIERARCHY_DEFINITION = [
    {
        name: 'Transform',
        type: 'group',
        children: [
            {
                name: 'Location',
                type: 'group',
                channels: graphChannels.filter(c => c.group === 'Location')
            },
            {
                name: 'Rotation',
                type: 'group',
                channels: graphChannels.filter(c => c.group === 'Rotation')
            },
            {
                name: 'Scale',
                type: 'group',
                channels: graphChannels.filter(c => c.group === 'Scale')
            }
        ]
    }
];

// --- BONE ANIMATION: New Globals ---
// These are the core data structures for bone animation.
// It is assumed that `selectedBone` (a THREE.Bone) will be set by your hierarchy/selection manager.
let selectedBone = null;
const boneKeyframes = new Map(); // Format: Map<objectUuid, Map<boneName, { frame: kfData }>>


// --- BONE ANIMATION: New Helper Function ---
/**
 * Traverses up the hierarchy from a bone to find its parent SkinnedMesh.
 * This is crucial for correctly associating bone keyframes with the right character.
 * @param {THREE.Object3D} node - The starting bone or object.
 * @returns {THREE.SkinnedMesh | null} The owner SkinnedMesh or null if not found.
 */
function findSkinnedMeshOwner(node) {
    let current = node;
    while (current) {
        if (current.isSkinnedMesh) return current;
        current = current.parent;
    }
    return null;
}



function debouncedResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const DYNAMIC_MIN_HEIGHT = window.innerHeight * 0.06;
        const DYNAMIC_MAX_HEIGHT = 400;
        
        if (!isResizing) {
            let currentTimelineHeight = timelineRes.offsetHeight;
            currentTimelineHeight = Math.max(DYNAMIC_MIN_HEIGHT, Math.min(DYNAMIC_MAX_HEIGHT, currentTimelineHeight));
            timelineRes.style.height = `${currentTimelineHeight}px`;

            const windowOrParentHeight = window.innerHeight;
            const newRendererHeight = windowOrParentHeight - currentTimelineHeight;
            rendererContainer.style.height = `${newRendererHeight}px`;
            if (typeof onWindowResize === 'function') onWindowResize();

            updatePlayhead();
            renderTimelineRuler();
            resizeGraphCanvas();
        }
    }, 150); // Wait 150ms after last resize event
}

window.addEventListener('resize', debouncedResize);// A map to store the expanded/collapsed state of nodes in the hierarchy, per object UUID.
// Format: { objectUuid: { 'Transform': true, 'Transform_Location': false, ... } }
const expandedHierarchyNodes = new Map();

// Global variables (from your provided list, assumed to be `let` declared elsewhere)
// `isResizing`, `initialHeight`, `initialMouseY` are directly accessed here.
let isResizing = false;
let initialHeight = 0;
let initialMouseY = 0;

// Define min and max heights for timeline (in pixels)
const MIN_HEIGHT = 0.06;
const MAX_HEIGHT = 400; // Maximum height in pixels


// Ensure these event listeners are only attached if elements exist,
// and handle 'resize' event for responsiveness.
if (resizeHandle && timelineRes && rendererContainer) { // No longer checking for 'viewport'
    resizeHandle.addEventListener('mousedown', (event) => {
        isResizing = true; // Use your global isResizing
        initialHeight = timelineRes.offsetHeight;
        initialMouseY = event.clientY;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'none'; // Prevent text selection
        document.body.style.cursor = 'row-resize';
    });

    function handleMouseMove(event) {
        if (isResizing) { // Use your global isResizing
            // Define min/max height constants within scope of this function if they are truly constant based on current environment.
            // If window.innerHeight is your overall height container, use that.
            // Adjust based on your parent container for timelineRes and rendererContainer if it's not body.
            const DYNAMIC_MIN_HEIGHT = window.innerHeight * 0.06; // Based on your ratio
            const DYNAMIC_MAX_HEIGHT = 400; // Your provided fixed max height

            // Calculate the height change (inverted, as mouse moving up means timeline grows)
            const deltaY = initialMouseY - event.clientY;
            let newTimelineHeight = initialHeight + deltaY;

            // Apply height constraints
            newTimelineHeight = Math.max(DYNAMIC_MIN_HEIGHT, Math.min(DYNAMIC_MAX_HEIGHT, newTimelineHeight));

            // Update the timeline height
            timelineRes.style.height = `${newTimelineHeight}px`;

            // Calculate and update renderer container height
            // Assume rendererContainer and timelineRes split the window height.
            const windowOrParentHeight = window.innerHeight; // Or `document.body.clientHeight` or your main app container's clientHeight
            const newRendererHeight = windowOrParentHeight - newTimelineHeight;
            rendererContainer.style.height = `${newRendererHeight}px`;
            // Crucial for responsive Three.js canvases. This function must exist in your main `app.js`
            if (typeof onWindowResize === 'function') onWindowResize();

            // After resizing, update visual elements to adapt to potential new vertical space
            updatePlayhead();
            renderTimelineRuler(); // Crucial for adjusting SVG line heights
            // --- MODIFIED CODE ---
            resizeGraphCanvas(); // Ensure graph canvas resizes and redraws
            // --- END MODIFIED CODE ---

        }
    }

    function handleMouseUp() {
        isResizing = false; // Use your global isResizing
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'auto';
        document.body.style.cursor = 'default';
    }


    // Adjust timeline/renderer heights on window resize
    window.addEventListener('resize', () => {
        const DYNAMIC_MIN_HEIGHT = window.innerHeight * 0.06;
        const DYNAMIC_MAX_HEIGHT = 400; // Your provided fixed max height
        if (!isResizing) { // Only adjust if not actively resizing via handle
            let currentTimelineHeight = timelineRes.offsetHeight;
            currentTimelineHeight = Math.max(DYNAMIC_MIN_HEIGHT, Math.min(DYNAMIC_MAX_HEIGHT, currentTimelineHeight));
            timelineRes.style.height = `${currentTimelineHeight}px`;

            const windowOrParentHeight = window.innerHeight; // Or your main app container's clientHeight
            const newRendererHeight = windowOrParentHeight - currentTimelineHeight;
            rendererContainer.style.height = `${newRendererHeight}px`;
            if (typeof onWindowResize === 'function') onWindowResize(); // Adjust canvas aspect ratio/size

            // These also need to be called on resize because layout changes
            updatePlayhead();
            renderTimelineRuler();
            // --- MODIFIED CODE ---
            resizeGraphCanvas(); // Ensure graph canvas resizes and redraws
            // --- END MODIFIED CODE ---
        }
    });

    // Initial setup on load if timeline height isn't set or is too small
    window.addEventListener('DOMContentLoaded', () => {
        const DYNAMIC_MIN_HEIGHT = window.innerHeight * 0.06;
        const windowOrParentHeight = window.innerHeight;
        // Check if timeline has no height set, or if its current height is below min.
        // Also ensure renderer-container gets its remaining height.
        if (timelineRes.style.height === '' || timelineRes.offsetHeight < DYNAMIC_MIN_HEIGHT) {
            let initialDesiredTimelineHeight = windowOrParentHeight * 0.20; // Assuming 20% initial, or your current 'height: 20%' CSS
            initialDesiredTimelineHeight = Math.max(DYNAMIC_MIN_HEIGHT, Math.min(DYNAMIC_MAX_HEIGHT, initialDesiredTimelineHeight));
            timelineRes.style.height = `${initialDesiredTimelineHeight}px`;

            const newRendererHeight = windowOrParentHeight - initialDesiredTimelineHeight;
            rendererContainer.style.height = `${newRendererHeight}px`;
            if (typeof onWindowResize === 'function') onWindowResize();
        }
    });

} else {
    console.warn("Timeline resizing elements or renderer container not found. Resizing functionality may not work.");
}


// --- DOM Element References specific to timeline.js ---
// These are *your* existing const declarations, strictly maintained.
const timelineScale = document.querySelector('.timeline-scale');
const keyframeLinesSvg = document.getElementById('keyframe-lines');
const timeline = document.querySelector('.timeline-track'); // The .timeline-track div
const playhead = document.querySelector('.playhead'); // The #playhead div (named .playhead in CSS)
const timelineContent = document.querySelector('.timeline-content'); // The #timeline-content div (named .timeline-content in CSS)

let loopEnabled = false;
let loopStart = 0; // in ms
let loopEnd = 0;   // will be set to full duration later

function timeToMs(timeStr) {
    const [mm, ss, ms] = timeStr.split(":").map(Number);
    return (mm * 60 * 1000) + (ss * 1000) + (ms || 0);
}

function msToTime(ms) {
    const minutes = String(Math.floor(ms / 60000)).padStart(2, "0");
    const seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    const millis = String(ms % 1000).padStart(3, "0");
    return `${minutes}:${seconds}:${millis}`;
}


function updatePlayback(delta) {
    if (isPlaying) {
        currentTime += delta;

        if (loopEnabled) {
            if (currentTime * 1000 > loopEnd) {
                currentTime = loopStart / 1000; // reset to loop start
            }
        } else {
            if (currentTime > timelineDuration) {
                stopAnimation();
            }
        }

        updatePlayhead();
        updateTimeDisplay();
        updateSceneFromTimeline();
    }
}
// --- UI Update Functions ---

/**
 * Updates the time display string in the timeline UI (00:00:000 format).
 * This directly accesses the `currentTime` global variable.
 */
function updateTimeDisplay() {
    const timeDisplayEl = document.getElementById('time-display');
    if (timeDisplayEl) {
        const totalSeconds = Math.floor(currentTime); // Use global currentTime
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.round((currentTime - totalSeconds) * 1000);

        timeDisplayEl.textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
    }
}

/**
 * Adjusts the visual zoom level and panning of the timeline UI.
 * This function calculates the total virtual width of the timeline,
 * updates the width of the `timelineScale`, `timelineContent`, and `keyframeLinesSvg` elements.
 * It also clamps the global `timelineOffset` to keep it within bounds,
 * and then triggers re-rendering of the ruler, keyframes, and playhead.
 */
function updateTimelineZoom() {
    // Calculate the total virtual width the timeline content should occupy at the current zoom level.
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel; // Use global variables

    // Apply this calculated width to the `timelineScale`, `timelineContent`, and `keyframeLinesSvg` elements.
    timelineScale.style.width = `${totalVirtualWidth}px`;
    timelineContent.style.width = `${totalVirtualWidth}px`;
    keyframeLinesSvg.style.width = `${totalVirtualWidth}px`;

    // Get the current visible width of the `timeline` track to calculate scrolling limits.
    const timelineTrackClientWidth = timeline.clientWidth; // Use your local `timeline` const (for the track)

    // Calculate the maximum scrollable distance to the right (a positive value).
    const maxScrollableLeft = Math.max(0, totalVirtualWidth - timelineTrackClientWidth);

    // If the total content width is less than the visible track width, no scrolling is necessary.
    if (totalVirtualWidth < timelineTrackClientWidth) {
        timelineOffset = 0; // Use global timelineOffset
    } else {
        // Clamp the global `timelineOffset` to keep it within valid panning bounds.
        const maxOffset = 0;
        const minOffset = -(maxScrollableLeft); // Correct calculation for min offset
        timelineOffset = Math.min(maxOffset, Math.max(minOffset, timelineOffset));
    }

    // Apply the calculated offset (panning) using a CSS `translateX` transform.
    timelineContent.style.transform = `translateX(${timelineOffset}px)`;
    timelineScale.style.transform = `translateX(${timelineOffset}px)`;
    keyframeLinesSvg.style.transform = `translateX(${timelineOffset}px)`;

    // Trigger re-rendering/repositioning of other UI elements.
    renderTimelineRuler();
    updateKeyframesUI();
    updatePlayhead();
    updateLoopZone();
}

/**
 * Renders or re-renders the timeline ruler with dynamic markers and labels based on zoom level.
 * This function handles both HTML markers (time labels and major/minor ticks)
 * and SVG lines (the background vertical grid lines) to ensure they are synchronized with zoom.
 *
function renderTimelineRuler() {
    // Clear existing HTML markers (from `timelineScale`) and SVG lines.
    timelineScale.innerHTML = '';
    keyframeLinesSvg.innerHTML = '';

    // Calculate the total virtual width based on `timelineDuration`, `pixelsPerSecond`, and `zoomLevel`.
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    // Set the SVG element's dimensions. Its width is dynamic; its height matches the `timelineContent` area.
    keyframeLinesSvg.style.width = `${totalVirtualWidth}px`;
    // Use `scrollHeight` of `timelineContent` for accurate height covering all track rows, fallback to `timeline`'s `clientHeight`
    keyframeLinesSvg.style.height = `${timelineContent.scrollHeight || timeline.clientHeight}px`;

    // --- Dynamic Interval Calculation for Ruler Detail ---
    let interval = 1;         // Base interval for drawing HTML ticks/markers (e.g., every 1 second).
    let labelInterval = 5;    // Interval for displaying larger time labels (e.g., every 5 seconds).
    let subMinorInterval = 0; // Interval for finer SVG grid lines (e.g., every 0.1 seconds).

    // `effectivePixelsPerSecond` determines how much detail is visible given the current `zoomLevel`.
    const effectivePixelsPerSecond = pixelsPerSecond * zoomLevel;

    // Logic to adjust `interval`, `labelInterval`, and `subMinorInterval` based on zoom.
    if (effectivePixelsPerSecond < 10) { // Very zoomed out
        interval = 30; labelInterval = 60; subMinorInterval = 0;
    } else if (effectivePixelsPerSecond < 25) { // Moderately zoomed out
        interval = 10; labelInterval = 30; subMinorInterval = 5;
    } else if (effectivePixelsPerSecond < 50) { // Default zoom
        interval = 5; labelInterval = 10; subMinorInterval = 1;
    } else if (effectivePixelsPerSecond < 100) { // Zoomed in
        interval = 1; labelInterval = 5; subMinorInterval = 0.5;
    } else { // Very zoomed in
        interval = 0.5; labelInterval = 1; subMinorInterval = 0.1;
    }

    // --- Draw HTML Markers (labels and shorter ticks) and SVG Vertical Grid Lines ---
    // Loop through the timeline duration, slightly overshooting to ensure the very last marker is drawn.
    for (let i = 0; i <= timelineDuration + interval; i += interval) {
        const time = parseFloat(i.toFixed(2)); // Use parseFloat + toFixed for stable float comparisons.
        const leftPx = (time / timelineDuration) * totalVirtualWidth; // Calculate the horizontal pixel position.

        // 1. Create HTML Marker (for visual ticks and labels)
        const marker = document.createElement('div');
        marker.className = `timeline-scale-marker`;
        marker.style.left = `${leftPx}px`; // Position the HTML marker.

        let isMajorLabel = false;
        // Check if this marker should have a larger time label.
        if (time % labelInterval === 0 || (interval >= 30 && time % 60 === 0)) {
            marker.classList.add('major'); // Add 'major' class for styling.
            isMajorLabel = true;

            const label = document.createElement('div');
            label.className = 'timeline-scale-label';

            const totalSecondsRounded = Math.floor(time);
            const minutes = Math.floor(totalSecondsRounded / 60);
            const seconds = totalSecondsRounded % 60;
            const ms = Math.round((time - totalSecondsRounded) * 1000);

            // Format label content: `mm:ss` or `mm:ss:ms` based on zoom level.
            if (effectivePixelsPerSecond > 100) {
                label.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
            } else {
                label.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            marker.appendChild(label); // Attach label to the HTML marker.
        }
        // Add 'minor' class for intermediate ticks (based on subMinorInterval and zoom).
        else if (effectivePixelsPerSecond >= 50 && (time % subMinorInterval === 0 || Math.abs(time % subMinorInterval) < 0.001)) {
            marker.classList.add('minor');
        } else {
            // Default styling for the smallest ticks.
            marker.classList.add('sub-minor');
        }
        timelineScale.appendChild(marker); // Append the HTML marker to your `timelineScale` const.

        // 2. Draw SVG Vertical Grid Line (for visual continuity across track rows)
        // Draw lines for major labels and important minor ticks; skip sub-minor for less clutter.
        if (isMajorLabel || marker.classList.contains('minor')) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", leftPx.toString());
            line.setAttribute("y1", "0");
            line.setAttribute("x2", leftPx.toString());
            // Set line height to span the full height of the `timelineContent` area (or `timeline` track as fallback).
            line.setAttribute("y2", (timelineContent.scrollHeight || timeline.clientHeight).toString());
            line.setAttribute("stroke", isMajorLabel ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"); // Thicker for major lines.
            line.setAttribute("stroke-width", "1");
            keyframeLinesSvg.appendChild(line); // Append SVG line to `keyframeLinesSvg` element.
        }
    }
    updateLoopZone();
    renderMarkers();

}*/ 


function renderTimelineRuler() {
    // Hide all existing markers first
    rulerMarkerPool.forEach(m => m.style.display = 'none');
    
    keyframeLinesSvg.innerHTML = ''; // SVG still needs clearing
    
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
    keyframeLinesSvg.style.width = `${totalVirtualWidth}px`;
    keyframeLinesSvg.style.height = `${timelineContent.scrollHeight || timeline.clientHeight}px`;

    let interval = 1;
    let labelInterval = 5;
    let subMinorInterval = 0;
    const effectivePixelsPerSecond = pixelsPerSecond * zoomLevel;

    if (effectivePixelsPerSecond < 10) {
        interval = 30; labelInterval = 60; subMinorInterval = 0;
    } else if (effectivePixelsPerSecond < 25) {
        interval = 10; labelInterval = 30; subMinorInterval = 5;
    } else if (effectivePixelsPerSecond < 50) {
        interval = 5; labelInterval = 10; subMinorInterval = 1;
    } else if (effectivePixelsPerSecond < 100) {
        interval = 1; labelInterval = 5; subMinorInterval = 0.5;
    } else {
        interval = 0.5; labelInterval = 1; subMinorInterval = 0.1;
    }

    let poolIndex = 0;
    for (let i = 0; i <= timelineDuration + interval; i += interval) {
        const time = parseFloat(i.toFixed(2));
        const leftPx = (time / timelineDuration) * totalVirtualWidth;

        // Reuse or create marker
        let marker = rulerMarkerPool[poolIndex];
        if (!marker) {
            marker = document.createElement('div');
            marker.className = 'timeline-scale-marker';
            const label = document.createElement('div');
            label.className = 'timeline-scale-label';
            marker.appendChild(label);
            timelineScale.appendChild(marker);
            rulerMarkerPool.push(marker);
        }
        
        marker.style.display = 'block';
        marker.style.left = `${leftPx}px`;
        marker.className = 'timeline-scale-marker'; // Reset classes
        
        const label = marker.querySelector('.timeline-scale-label');
        let isMajorLabel = false;

        if (time % labelInterval === 0 || (interval >= 30 && time % 60 === 0)) {
            marker.classList.add('major');
            isMajorLabel = true;
            
            const totalSecondsRounded = Math.floor(time);
            const minutes = Math.floor(totalSecondsRounded / 60);
            const seconds = totalSecondsRounded % 60;
            const ms = Math.round((time - totalSecondsRounded) * 1000);

            label.textContent = effectivePixelsPerSecond > 100 
                ? `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`
                : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            label.style.display = 'block';
        } else {
            label.style.display = 'none';
            if (effectivePixelsPerSecond >= 50 && (time % subMinorInterval === 0 || Math.abs(time % subMinorInterval) < 0.001)) {
                marker.classList.add('minor');
            } else {
                marker.classList.add('sub-minor');
            }
        }

        // SVG lines (still need to recreate these)
        if (isMajorLabel || marker.classList.contains('minor')) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", leftPx.toString());
            line.setAttribute("y1", "0");
            line.setAttribute("x2", leftPx.toString());
            line.setAttribute("y2", (timelineContent.scrollHeight || timeline.clientHeight).toString());
            line.setAttribute("stroke", isMajorLabel ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)");
            line.setAttribute("stroke-width", "1");
            keyframeLinesSvg.appendChild(line);
        }
        
        poolIndex++;
    }
    
    updateLoopZone();
    renderMarkers();
}



// Convert canvas coordinates to graph time/value
function canvasToGraphCoords(canvasX, canvasY) {
    if (!graphCanvas) return { time: 0, value: 0 };
    
    // Y-axis is inverted in canvas (0 at top, height at bottom), graph usually 0 at center or bottom, increasing upwards
    // To match typical graph: canvasY = height/2 corresponds to value 0.
    // So, value = (height/2 - canvasY - offsetY) / valueScale
    const time = (canvasX - graphViewTransform.offsetX) / graphViewTransform.scale;
    const value = -(canvasY - graphCanvas.height / 2 - graphViewTransform.offsetY) / graphViewTransform.valueScale;
    
    return { time, value };
}

// Convert graph time/value to canvas coordinates
function graphToCanvasCoords(time, value) {
    if (!graphCanvas) return { x: 0, y: 0 };
    
    const x = time * graphViewTransform.scale + graphViewTransform.offsetX;
    const y = graphCanvas.height / 2 - value * graphViewTransform.valueScale + graphViewTransform.offsetY;
    
    return { x, y };
}

// Get keyframe data for a specific channel
// --- MODIFIED CODE ---
/*function getChannelKeyframeData(channelName) {
    if (!selectedObject) return [];
    
    const objectKeyframes = keyframes.get(selectedObject.uuid);
    if (!objectKeyframes) return [];
    
    const channel = graphChannels.find(c => c.name === channelName);
    if (!channel) return [];
    
    const result = [];
    Object.entries(objectKeyframes).forEach(([frame, kfData]) => {
        // Retrieve actual handle values. If not set, use a fallback (e.g., 0 or the default).
        const handleInX = kfData[`handleIn_${channelName}_x`] !== undefined ? kfData[`handleIn_${channelName}_x`] : -DEFAULT_BEZIER_HANDLE_X_OFFSET;
        const handleInY = kfData[`handleIn_${channelName}_y`] !== undefined ? kfData[`handleIn_${channelName}_y`] : DEFAULT_BEZIER_HANDLE_Y_OFFSET;
        const handleOutX = kfData[`handleOut_${channelName}_x`] !== undefined ? kfData[`handleOut_${channelName}_x`] : DEFAULT_BEZIER_HANDLE_X_OFFSET;
        const handleOutY = kfData[`handleOut_${channelName}_y`] !== undefined ? kfData[`handleOut_${channelName}_y`] : DEFAULT_BEZIER_HANDLE_Y_OFFSET;

        result.push({
            time: kfData.time,
            value: channel.getValue(kfData),
            frame: parseInt(frame),
            uuid: selectedObject.uuid, // Add uuid for direct lookup
            originalKfEntry: kfData,    // Reference to the original object in keyframes map
            interpolation: kfData.interpolation || 'bezier',
            handleIn: { x: handleInX, y: handleInY },   // These are relative offsets from kf.time, kf.value
            handleOut: { x: handleOutX, y: handleOutY } // These are relative offsets from kf.time, kf.value
        });
    });
    
    return result.sort((a, b) => a.time - b.time);
}*/ 

/*function getChannelKeyframeData(channelName) {
    if (!selectedObject) return [];
    
    const objectKeyframesMap = keyframes.get(selectedObject.uuid);
    if (!objectKeyframesMap) return [];
    
    const channel = graphChannels.find(c => c.name === channelName);
    if (!channel) return [];
    
    const result = [];
    Object.entries(objectKeyframesMap).forEach(([frame, kfData]) => {
        let value;
        const [prop, subProp] = channelName.split('.'); // e.g., 'position', 'x'

        // --- CRITICAL FIX HERE: Explicitly read from rotationEuler for rotation channels ---
        if (prop === 'rotation') {
            if (kfData.rotationEuler && kfData.rotationEuler[subProp] !== undefined) {
                value = kfData.rotationEuler[subProp];
            } else {
                console.warn(`RotationEuler data missing for ${channelName} at frame ${frame}. Using 0.`);
                value = 0;
            }
        } else if (kfData[prop] && kfData[prop][subProp] !== undefined) {
            value = kfData[prop][subProp];
        } else {
            console.warn(`Data missing for ${channelName} at frame ${frame}. Using 0.`);
            value = 0;
        }
        // --- END CRITICAL FIX ---
        
        // Retrieve actual handle values. If not set, use a fallback.
        const handleInX = kfData[`handleIn_${channelName}_x`] !== undefined ? kfData[`handleIn_${channelName}_x`] : -DEFAULT_BEZIER_HANDLE_X_OFFSET;
        const handleInY = kfData[`handleIn_${channelName}_y`] !== undefined ? kfData[`handleIn_${channelName}_y`] : DEFAULT_BEZIER_HANDLE_Y_OFFSET;
        const handleOutX = kfData[`handleOut_${channelName}_x`] !== undefined ? kfData[`handleOut_${channelName}_x`] : DEFAULT_BEZIER_HANDLE_X_OFFSET;
        const handleOutY = kfData[`handleOut_${channelName}_y`] !== undefined ? kfData[`handleOut_${channelName}_y`] : DEFAULT_BEZIER_HANDLE_Y_OFFSET;

        result.push({
            time: kfData.time,
            value: value,
            frame: parseInt(frame),
            uuid: selectedObject.uuid,
            originalKfEntry: kfData,
            interpolation: kfData.interpolation || 'bezier',
            handleIn: { x: handleInX, y: handleInY },
            handleOut: { x: handleOutX, y: handleOutY }
        });
    });
    
    return result.sort((a, b) => a.time - b.time);
}*/


function getChannelKeyframeData(channelName) {
    let keyframeMap, ownerUuid;

    if (selectedBone) {
        const owner = findSkinnedMeshOwner(selectedBone) || selectedObject;
        if (!owner || !boneKeyframes.has(owner.uuid)) return [];

        const boneMap = boneKeyframes.get(owner.uuid);
        if (!boneMap.has(selectedBone.name)) return [];
        
        keyframeMap = boneMap.get(selectedBone.name);
        ownerUuid = owner.uuid;

    } else if (selectedObject) {
        keyframeMap = keyframes.get(selectedObject.uuid);
        ownerUuid = selectedObject.uuid;
    }

    if (!keyframeMap) return [];
    
    return processKeyframeData(keyframeMap, channelName, ownerUuid);
}

/**
 * Helper function to process a keyframe map into the format needed by the graph editor.
 * This avoids code duplication in getChannelKeyframeData.
 */
function processKeyframeData(keyframeMap, channelName, uuid) {
    const channel = graphChannels.find(c => c.name === channelName);
    if (!channel) return [];

    const result = [];
    Object.entries(keyframeMap).forEach(([frame, kfData]) => {
        let value;
        const [prop, subProp] = channelName.split('.');

        if (prop === 'rotation') {
            value = kfData.rotationEuler?.[subProp] ?? 0;
        } else {
            value = kfData[prop]?.[subProp] ?? 0;
        }
        
        const handleInX = kfData[`handleIn_${channelName}_x`] ?? -DEFAULT_BEZIER_HANDLE_X_OFFSET;
        const handleInY = kfData[`handleIn_${channelName}_y`] ?? DEFAULT_BEZIER_HANDLE_Y_OFFSET;
        const handleOutX = kfData[`handleOut_${channelName}_x`] ?? DEFAULT_BEZIER_HANDLE_X_OFFSET;
        const handleOutY = kfData[`handleOut_${channelName}_y`] ?? DEFAULT_BEZIER_HANDLE_Y_OFFSET;

        result.push({
            time: kfData.time,
            value: value,
            frame: parseInt(frame),
            uuid: uuid,
            originalKfEntry: kfData,
            interpolation: kfData.interpolation || 'bezier',
            handleIn: { x: handleInX, y: handleInY },
            handleOut: { x: handleOutX, y: handleOutY }
        });
    });

    return result.sort((a, b) => a.time - b.time);
}

function screenToCanvas(x, y) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (x - rect.left) / rect.width * canvas.width,
        y: (y - rect.top) / rect.height * canvas.height
    };
}


// --- END MODIFIED CODE ---
function renderGraph() {
    if (!graphCanvas || !graphCtx || !isGraphView) return;

    const width = graphCanvas.width;
    const height = graphCanvas.height;

    // === Background ===
    graphCtx.fillStyle = '#1a1a1a';
    graphCtx.fillRect(0, 0, width, height);

    // === Grid Drawing ===
    graphCtx.strokeStyle = '#2a2a2a';
    graphCtx.lineWidth = 1;

    for (let t = -10; t <= timelineDuration + 10; t++) {
        const pos = graphToCanvasCoords(t, 0);
        if (pos.x < 0 || pos.x > width) continue;

        graphCtx.beginPath();
        graphCtx.moveTo(pos.x, 0);
        graphCtx.lineTo(pos.x, height);
        graphCtx.stroke();

        // Minor sub-lines
        if (graphViewTransform.scale > 100) {
            graphCtx.strokeStyle = '#222';
            graphCtx.lineWidth = 0.5;
            for (let st = t + 0.1; st < t + 1; st += 0.1) {
                const subPos = graphToCanvasCoords(st, 0);
                if (subPos.x >= 0 && subPos.x <= width) {
                    graphCtx.beginPath();
                    graphCtx.moveTo(subPos.x, 0);
                    graphCtx.lineTo(subPos.x, height);
                    graphCtx.stroke();
                }
            }
        }

        // Major second lines
        if (t % 1 === 0) {
            graphCtx.strokeStyle = '#4a4a4a';
            graphCtx.lineWidth = 1;
            graphCtx.beginPath();
            graphCtx.moveTo(pos.x, 0);
            graphCtx.lineTo(pos.x, height);
            graphCtx.stroke();

            graphCtx.fillStyle = '#666';
            graphCtx.font = '10px monospace';
            graphCtx.fillText(t.toFixed(1) + 's', pos.x + 2, height - 5);
        }
    }

    // === Horizontal value grid ===
    const valueRange = 20;
    for (let v = -valueRange; v <= valueRange; v++) {
        const pos = graphToCanvasCoords(0, v);
        if (pos.y < 0 || pos.y > height) continue;

        graphCtx.beginPath();
        graphCtx.moveTo(0, pos.y);
        graphCtx.lineTo(width, pos.y);
        graphCtx.stroke();

        if (v % 5 === 0) {
            graphCtx.fillStyle = '#666';
            graphCtx.font = '10px monospace';
            graphCtx.fillText(v.toString(), 5, pos.y - 2);
        }
    }


    // === Axes ===
    graphCtx.strokeStyle = '#aaa';
    graphCtx.lineWidth = 2;
    const origin = graphToCanvasCoords(0, 0);

    graphCtx.beginPath();
    graphCtx.moveTo(0, origin.y);
    graphCtx.lineTo(width, origin.y);
    graphCtx.stroke();

    graphCtx.beginPath();
    graphCtx.moveTo(origin.x, 0);
    graphCtx.lineTo(origin.x, height);
    graphCtx.stroke();

    // === Curves ===
    graphChannels.forEach(channel => {
        const channelData = getChannelKeyframeData(channel.name);
        if (channelData.length === 0) return;

        const isSelected = channel.name === selectedGraphChannel;
        graphCtx.strokeStyle = isSelected ? channel.color : channel.color + '55';
        graphCtx.lineWidth = isSelected ? 2 : 1;

        for (let i = 0; i < channelData.length - 1; i++) {
            const kf1 = channelData[i];
            const kf2 = channelData[i + 1];
            drawCurveSegment(kf1, kf2, graphCtx);
        }
    });

   
    // === Keyframes ===
    const selectedChannelData = getChannelKeyframeData(selectedGraphChannel);
    const channelColor = graphChannels.find(c => c.name === selectedGraphChannel)?.color || '#fff';

    selectedChannelData.forEach((kf, index) => {
        const pos = graphToCanvasCoords(kf.time, kf.value);

        if (selectedGraphKeyframe === index) {
            // Glow for selected
            graphCtx.shadowColor = 'cyan';
            graphCtx.shadowBlur = 12;
        } else {
            graphCtx.shadowBlur = 0;
        }

        if (selectedGraphKeyframe === index && kf.interpolation === 'bezier') {
            drawBezierHandles(kf, pos, channelColor);
        }

        graphCtx.fillStyle = selectedGraphKeyframe === index ? 'cyan' : channelColor;
        graphCtx.strokeStyle = '#111';
        graphCtx.lineWidth = 2;

        graphCtx.beginPath();
        graphCtx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
        graphCtx.fill();
        graphCtx.stroke();
    });

    // ====================================================================
    // --- âœ¨ Improved Playhead ---
    // ====================================================================
    const playheadX = graphToCanvasCoords(currentTime, 0).x;

    // Glow effect
    const gradient = graphCtx.createLinearGradient(playheadX - 10, 0, playheadX + 10, 0);
    gradient.addColorStop(0, 'rgba(220,53,69,0)');
    gradient.addColorStop(0.5, 'rgba(220,53,69,0.4)');
    gradient.addColorStop(1, 'rgba(220,53,69,0)');

    graphCtx.fillStyle = gradient;
    graphCtx.fillRect(playheadX - 10, 0, 20, height);

    // Solid line
    graphCtx.strokeStyle = '#dc3545';
    graphCtx.lineWidth = 2;
    graphCtx.beginPath();
    graphCtx.moveTo(playheadX, 0);
    graphCtx.lineTo(playheadX, height);
    graphCtx.stroke();

    // Top arrow marker
    graphCtx.fillStyle = '#dc3545';
    graphCtx.shadowColor = 'black';
    graphCtx.shadowBlur = 6;
    graphCtx.beginPath();
    graphCtx.moveTo(playheadX, 0);
    graphCtx.lineTo(playheadX - 7, 14);
    graphCtx.lineTo(playheadX + 7, 14);
    graphCtx.closePath();
    graphCtx.fill();
    graphCtx.shadowBlur = 0; // reset shadow

    // Time label
    graphCtx.fillStyle = '#fff';
    graphCtx.font = '11px monospace';
    graphCtx.textAlign = 'center';
    graphCtx.fillText(currentTime.toFixed(2) + 's', playheadX, 28);
}

function drawCurveSegment(kf1, kf2, ctx) {
    const p1 = graphToCanvasCoords(kf1.time, kf1.value);
    const p2 = graphToCanvasCoords(kf2.time, kf2.value);
    
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    
    if (kf1.interpolation === 'bezier') {
        // Control points are calculated from keyframe time/value PLUS handle offsets
        const cp1 = graphToCanvasCoords(
            kf1.time + kf1.handleOut.x,
            kf1.value + kf1.handleOut.y
        );
        const cp2 = graphToCanvasCoords(
            kf2.time + kf2.handleIn.x,
            kf2.value + kf2.handleIn.y
        );
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
    } else if (kf1.interpolation === 'linear') {
        ctx.lineTo(p2.x, p2.y);
    } else if (kf1.interpolation === 'constant') {
        ctx.lineTo(p2.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }
    
    ctx.stroke();
}

function drawBezierHandles(kf, pos, color) {
    graphCtx.strokeStyle = color;
    graphCtx.lineWidth = 1;
    graphCtx.setLineDash([3, 3]);
    
    // Out handle
    const handleOutPos = graphToCanvasCoords(
        kf.time + kf.handleOut.x, // Handle x is relative to kf.time
        kf.value + kf.handleOut.y // Handle y is relative to kf.value
    );
    graphCtx.beginPath();
    graphCtx.moveTo(pos.x, pos.y);
    graphCtx.lineTo(handleOutPos.x, handleOutPos.y);
    graphCtx.stroke();
    
    /*graphCtx.fillStyle = selectedGraphHandle === 'out' ? '#ffffff' : color;
    graphCtx.setLineDash([]);
    graphCtx.beginPath();
    graphCtx.arc(handleOutPos.x, handleOutPos.y, 4, 0, Math.PI * 2);
    graphCtx.fill();
    graphCtx.strokeStyle = '#000';
    graphCtx.lineWidth = 1;
    graphCtx.stroke();*/

    graphCtx.fillStyle = selectedGraphHandle === 'out' ? '#fff' : color;
    graphCtx.setLineDash([]); // Reset line dash for the handle point
    graphCtx.beginPath();
    graphCtx.arc(handleOutPos.x, handleOutPos.y, 5, 0, Math.PI * 2); // Slightly larger
    graphCtx.fill();
    graphCtx.strokeStyle = '#000'; // Dark border for handle points
    graphCtx.lineWidth = 1;
    graphCtx.stroke();
    
    // In handle
    const handleInPos = graphToCanvasCoords(
        kf.time + kf.handleIn.x, // Handle x is relative to kf.time
        kf.value + kf.handleIn.y // Handle y is relative to kf.value
    );
    graphCtx.strokeStyle = color;
    graphCtx.setLineDash([3, 3]);
    graphCtx.beginPath();
    graphCtx.moveTo(pos.x, pos.y);
    graphCtx.lineTo(handleInPos.x, handleInPos.y);
    graphCtx.stroke();
    
    graphCtx.fillStyle = selectedGraphHandle === 'in' ? '#ffffff' : color;
    graphCtx.setLineDash([]);
    graphCtx.beginPath();
    graphCtx.arc(handleInPos.x, handleInPos.y, 4, 0, Math.PI * 2);
    graphCtx.fill();
    graphCtx.strokeStyle = '#000';
    graphCtx.stroke();
}


function initGraphEditor() {
    graphCanvas = document.getElementById('graph-canvas');
    if (!graphCanvas) return;
    
    graphCtx = graphCanvas.getContext('2d');
    
    // Set canvas size
    function resizeGraphCanvas() {
        const container = document.getElementById('graph-editor-container');
        // Subtract sidebar width from container width
        graphCanvas.width = container.clientWidth - (document.getElementById('graph-channels-list')?.clientWidth || 0);
        graphCanvas.height = container.clientHeight;
        renderGraph(); // Redraw on resize
    }
    resizeGraphCanvas();
    window.addEventListener('resize', resizeGraphCanvas);
    
    // Populate channel list
    const channelsList = document.getElementById('graph-channels-list');
    channelsList.innerHTML = '';
    
    graphChannels.forEach(channel => {
        const item = document.createElement('div');
        item.className = 'graph-channel-item';
        if (channel.name === selectedGraphChannel) item.classList.add('active');
        
        item.innerHTML = `
            <div class="graph-channel-color" style="background: ${channel.color}"></div>
            <span>${channel.label}</span>
        `;
        
        item.addEventListener('click', () => {
            selectedGraphChannel = channel.name;
            selectedGraphKeyframe = null; // Deselect keyframe when changing channel
            document.querySelectorAll('.graph-channel-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            renderGraph();
        });
        
        channelsList.appendChild(item);
    });
    
    // Mouse events
    
    graphCanvas.addEventListener('mousedown', handleGraphMouseDown);
    graphCanvas.addEventListener('mousemove', handleGraphMouseMove);
    graphCanvas.addEventListener('mouseup', handleGraphMouseUp);
    graphCanvas.addEventListener('wheel', handleGraphWheel);
    
  
    renderGraph();
}

function getHitRadius() {
    // Base radius of 8px, adjusted so it's not affected by zoom too much
    const base = 8;
    const zoomFactor = Math.sqrt(
        (graphViewTransform.scale + graphViewTransform.valueScale) / 2
    );
    return base * (1 + 1 / zoomFactor); // Bigger at high zoom
}


function handleGraphMouseDown(e) {
    if (!graphCanvas || !graphCtx) return;
    const rect = graphCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const channelData = getChannelKeyframeData(selectedGraphChannel);
    
    // Check keyframe and handle selection in reverse order (topmost first)
    for (let i = channelData.length - 1; i >= 0; i--) {
        const kf = channelData[i];
        const pos = graphToCanvasCoords(kf.time, kf.value);
        const hitRadius = getHitRadius();

        // Check handles first (they are smaller and "on top" visually)
        if (kf.interpolation === 'bezier') {
            const handleOutPos = graphToCanvasCoords(kf.time + kf.handleOut.x, kf.value + kf.handleOut.y);
            const distOut = Math.sqrt((mouseX - handleOutPos.x) ** 2 + (mouseY - handleOutPos.y) ** 2);
            
            if (distOut < hitRadius) { // Increased hitbox for easier selection
                selectedGraphKeyframe = i;
                selectedGraphHandle = 'out';
                isDraggingGraph = true;
                graphDragStart = { x: mouseX, y: mouseY };
                renderGraph();
                return;
            }
            
            const handleInPos = graphToCanvasCoords(kf.time + kf.handleIn.x, kf.value + kf.handleIn.y);
            const distIn = Math.sqrt((mouseX - handleInPos.x) ** 2 + (mouseY - handleInPos.y) ** 2);
            
            if (distIn < hitRadius) { // Increased hitbox for easier selection
                selectedGraphKeyframe = i;
                selectedGraphHandle = 'in';
                isDraggingGraph = true;
                graphDragStart = { x: mouseX, y: mouseY };
                renderGraph();
                return;
            }
        }

        // Check keyframe selection
        const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
        if (dist < hitRadius + 2) { // Increased hitbox for easier selection
            selectedGraphKeyframe = i;
            selectedGraphHandle = null; // Clear handle selection if keyframe is selected
            isDraggingGraph = true;
            graphDragStart = { x: mouseX, y: mouseY };
            renderGraph();
            return;
        }
    }

    
    // If no keyframe or handle selected, pan view
    selectedGraphKeyframe = null; // Clear any previous selection
    selectedGraphHandle = null;
    isDraggingGraph = true;
    graphDragStart = { x: mouseX, y: mouseY };
    renderGraph(); // Redraw to clear previous selection visuals
}

function handleGraphMouseMove(e) {
    if (!isDraggingGraph) return;
    
    const rect = graphCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (selectedGraphKeyframe !== null && selectedGraphHandle) {
        // Move handle - update keyframe data in main keyframes map
        updateGraphHandlePosition(mouseX, mouseY);
    } else if (selectedGraphKeyframe !== null) {
        // Move keyframe
        updateGraphKeyframePosition(mouseX, mouseY);
    } else {
        // Pan view
        graphViewTransform.offsetX += (mouseX - graphDragStart.x);
        graphViewTransform.offsetY += (mouseY - graphDragStart.y);
    }

    
    graphDragStart = { x: mouseX, y: mouseY };
    renderGraph();
}

function handleGraphMouseUp() {
    isDraggingGraph = false;
    // --- MODIFIED CODE ---
    // selectedGraphHandle = null; // Keep handle selected until new click for better UX

    // Sync back to timeline
    updateKeyframesUI();
    updateSceneFromTimeline();
}

/**
 *
function handleGraphWheel(e) {
    e.preventDefault();
    const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
    
    // Zoom around mouse position
    const rect = graphCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldScaleX = graphViewTransform.scale;
    const oldScaleY = graphViewTransform.valueScale;

    graphViewTransform.scale = Math.max(10, Math.min(200, graphViewTransform.scale * scaleFactor));
    graphViewTransform.valueScale = Math.max(10, Math.min(200, graphViewTransform.valueScale * scaleFactor));

    // Adjust offsets to zoom around mouse cursor
    graphViewTransform.offsetX = mouseX - ((mouseX - graphViewTransform.offsetX) / oldScaleX) * graphViewTransform.scale;
    graphViewTransform.offsetY = mouseY - ((mouseY - graphViewTransform.offsetY) / oldScaleY) * graphViewTransform.valueScale;

    renderGraph();
}

 */

function handleGraphWheel(e) {
    e.preventDefault();
    const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
    
    // Zoom around mouse position
    const rect = graphCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldScaleX = graphViewTransform.scale;
    const oldScaleY = graphViewTransform.valueScale;

    // 🚀 Expanded zoom range
    graphViewTransform.scale = Math.max(0.1, Math.min(2000, graphViewTransform.scale * scaleFactor));
    graphViewTransform.valueScale = Math.max(0.1, Math.min(2000, graphViewTransform.valueScale * scaleFactor));

    // Adjust offsets so zoom centers around mouse cursor
    graphViewTransform.offsetX = mouseX - ((mouseX - graphViewTransform.offsetX) / oldScaleX) * graphViewTransform.scale;
    graphViewTransform.offsetY = mouseY - ((mouseY - graphViewTransform.offsetY) / oldScaleY) * graphViewTransform.valueScale;

    renderGraph();
}


/*
function updateGraphKeyframePosition(mouseX, mouseY) {
    if (selectedGraphKeyframe === null || !selectedGraphChannel) return;

    const channelData = getChannelKeyframeData(selectedGraphChannel);
    const kfToUpdate = channelData[selectedGraphKeyframe]; // This is the *computed* object, not the original map entry

    const graphPos = canvasToGraphCoords(mouseX, mouseY); // New time/value in graph coordinates

    const newTime = Math.max(0, graphPos.time); // Prevent negative time
    const newFrame = Math.round(newTime * fps);

    const originalObjectKeyframes = keyframes.get(kfToUpdate.uuid); // Get the entire object's keyframe map

    if (!originalObjectKeyframes) {
        console.warn("Original object keyframes not found for selected keyframe.");
        return;
    }

    if (newFrame !== kfToUpdate.frame) {
        // Frame changed: Need to remove old entry and add a new one.
        const oldKfData = originalObjectKeyframes[kfToUpdate.frame];
        if (!oldKfData) {
            console.warn("Original keyframe data not found at old frame for moving keyframe.");
            return;
        }

        // Create a new keyframe data object by copying the old one and updating time
        const movedKfData = { ...oldKfData, time: newTime };

        // Update the specific channel's value (position.x, scale.y, rotationEuler.x etc.) on this new data object
        const channelObj = graphChannels.find(c => c.name === selectedGraphChannel);
        if (channelObj) {
            const [prop, subProp] = channelObj.name.split('.');
            if (prop === 'rotation') {
                // Update the Euler component and then re-calculate the Quaternion
                if (movedKfData.rotationEuler && movedKfData.rotationEuler[subProp] !== undefined) {
                    movedKfData.rotationEuler[subProp] = graphPos.value;
                    movedKfData.rotation.setFromEuler(
                        new THREE.Euler(movedKfData.rotationEuler.x, movedKfData.rotationEuler.y, movedKfData.rotationEuler.z, 'XYZ')
                    );
                }
            } else if (movedKfData[prop] && movedKfData[prop][subProp] !== undefined) {
                 movedKfData[prop][subProp] = graphPos.value;
            }
        }

        // Delete the old keyframe entry and add the new one with the updated frame key
        delete originalObjectKeyframes[kfToUpdate.frame];
        originalObjectKeyframes[newFrame] = movedKfData;

        // Update the temporary `kfToUpdate` object (from channelData) to reflect the new state
        kfToUpdate.frame = newFrame;
        kfToUpdate.time = newTime;
        kfToUpdate.value = graphPos.value;
        kfToUpdate.originalKfEntry = movedKfData; // Point to the newly moved keyframe entry in the map

    } else {
        // Frame did not change: Only update the value of the specific channel in the existing keyframe entry.
        const originalKfData = kfToUpdate.originalKfEntry; // Direct reference to the keyframe in the map
        const channelObj = graphChannels.find(c => c.name === selectedGraphChannel);
        if (channelObj) {
            const [prop, subProp] = channelObj.name.split('.');
            if (prop === 'rotation') {
                // Update the Euler component and then re-calculate the Quaternion
                if (originalKfData.rotationEuler && originalKfData.rotationEuler[subProp] !== undefined) {
                    originalKfData.rotationEuler[subProp] = graphPos.value;
                    originalKfData.rotation.setFromEuler(
                        new THREE.Euler(originalKfData.rotationEuler.x, originalKfData.rotationEuler.y, originalKfData.rotationEuler.z, 'XYZ')
                    );
                }
            } else if (originalKfData[prop] && originalKfData[prop][subProp] !== undefined) {
                originalKfData[prop][subProp] = graphPos.value;
            }
        }
        // Update the computed value in kfToUpdate for immediate redraw
        kfToUpdate.value = graphPos.value;
    }
}*/

/**
 * Updates the position of a keyframe in the graph.
 * Now correctly handles both root object and bone keyframes.
 */
function updateGraphKeyframePosition(mouseX, mouseY) {
    if (selectedGraphKeyframe === null || !selectedGraphChannel) return;

    const channelData = getChannelKeyframeData(selectedGraphChannel);
    const kfToUpdate = channelData[selectedGraphKeyframe];
    if (!kfToUpdate) return;

    const graphPos = canvasToGraphCoords(mouseX, mouseY);
    const newTime = Math.max(0, graphPos.time);
    const newFrame = Math.round(newTime * fps);

    // Determine which keyframe map to modify
    let keyframeMap;
    const originalKfData = kfToUpdate.originalKfEntry;
    if (originalKfData.isBoneKeyframe) {
        const owner = scene.getObjectByProperty('uuid', kfToUpdate.uuid);
        if (!owner) return;
        keyframeMap = boneKeyframes.get(owner.uuid)?.get(originalKfData.boneName);
    } else {
        keyframeMap = keyframes.get(kfToUpdate.uuid);
    }
    if (!keyframeMap) return;


    if (newFrame !== kfToUpdate.frame) {
        // Frame changed: move the keyframe
        const oldKfData = keyframeMap[kfToUpdate.frame];
        if (!oldKfData) return;

        const movedKfData = { ...oldKfData, time: newTime };
        
        // Update value
        const [prop, subProp] = selectedGraphChannel.split('.');
        if (prop === 'rotation') {
            movedKfData.rotationEuler[subProp] = graphPos.value;
            movedKfData.rotation.setFromEuler(new THREE.Euler(movedKfData.rotationEuler.x, movedKfData.rotationEuler.y, movedKfData.rotationEuler.z, 'XYZ'));
        } else {
             movedKfData[prop][subProp] = graphPos.value;
        }

        delete keyframeMap[kfToUpdate.frame];
        keyframeMap[newFrame] = movedKfData;

        // Update temporary data for redraw
        kfToUpdate.frame = newFrame;
        kfToUpdate.time = newTime;
        kfToUpdate.value = graphPos.value;
        kfToUpdate.originalKfEntry = movedKfData;
    } else {
        // Frame is the same, just update the value
        const [prop, subProp] = selectedGraphChannel.split('.');
        if (prop === 'rotation') {
            originalKfData.rotationEuler[subProp] = graphPos.value;
            originalKfData.rotation.setFromEuler(new THREE.Euler(originalKfData.rotationEuler.x, originalKfData.rotationEuler.y, originalKfData.rotationEuler.z, 'XYZ'));
        } else {
            originalKfData[prop][subProp] = graphPos.value;
        }
        kfToUpdate.value = graphPos.value;
    }
}


// --- MODIFIED CODE ---
function updateGraphHandlePosition(mouseX, mouseY) {
    if (selectedGraphKeyframe === null || !selectedGraphChannel || !selectedGraphHandle) return;

    const channelData = getChannelKeyframeData(selectedGraphChannel);
    const kfToUpdate = channelData[selectedGraphKeyframe]; // Temporary object from getChannelKeyframeData
    const originalKfData = kfToUpdate.originalKfEntry;     // Direct reference to the original keyframe data in the map

    if (!originalKfData) {
        console.warn("Original keyframe data not found for selected handle.");
        return;
    }

    const graphPos = canvasToGraphCoords(mouseX, mouseY); // New absolute time/value for the handle's end point

    // Calculate handle's position relative to the keyframe's time and value.
    // The handle values `handleIn_..._x` and `handleIn_..._y` are relative offsets.
    const kfTime = originalKfData.time;      // Keyframe's time (absolute)
    const kfValue = kfToUpdate.value;        // Keyframe's computed channel value (absolute)

    const dx = graphPos.time - kfTime;    // Relative time offset
    const dy = graphPos.value - kfValue;  // Relative value offset

    if (selectedGraphHandle === 'in') {
        originalKfData[`handleIn_${selectedGraphChannel}_x`] = dx;
        originalKfData[`handleIn_${selectedGraphChannel}_y`] = dy;
        // Update the temporary kfToUpdate object for immediate redraw
        kfToUpdate.handleIn = { x: dx, y: dy };
    } else if (selectedGraphHandle === 'out') {
        originalKfData[`handleOut_${selectedGraphChannel}_x`] = dx;
        originalKfData[`handleOut_${selectedGraphChannel}_y`] = dy;
        // Update the temporary kfToUpdate object for immediate redraw
        kfToUpdate.handleOut = { x: dx, y: dy };
    }
}

// --- END MODIFIED CODE ---

/**
 * Initializes the timeline scale. This function is now effectively an alias for `renderTimelineRuler()`,
 * as the dynamic ruler is comprehensive and handles all aspects of displaying the time scale from `0`.
 */
function initializeTimelineScale() {
    renderTimelineRuler(); // Your single, dynamic ruler function does it all now.
    // The previous simpler `initializeTimelineScale` logic is now fully superseded.
}

/**
 * Triggers a full update of the timeline's scale and zoom properties.
 * This should be called whenever core timeline parameters like `timelineDuration`,
 * `pixelsPerSecond`, or `zoomLevel` are modified directly.
 */
function updateTimelineScale() {
    // Both initializeTimelineScale (which calls renderTimelineRuler) and updateTimelineZoom
    // handle recalculations based on current settings. Calling updateTimelineZoom
    // will be sufficient as it already calls renderTimelineRuler internally and handles offsets.
    updateTimelineZoom();
}

/**
 * Positions the playhead accurately on the timeline track and ensures it remains visible.
 * It also triggers the `updateTimeDisplay()` function to reflect the current time.
 */
function updatePlayhead() {
    // Calculate the total virtual width of the timeline content based on global variables.
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    // Calculate the playhead's horizontal pixel position relative to this `totalVirtualWidth`.
    const leftPx = (currentTime / timelineDuration) * totalVirtualWidth;

    playhead.style.left = `${leftPx}px`; // Apply the calculated position to the `playhead` DOM element.

    // --- Automatic Panning to Keep Playhead in View ---
    const currentViewLeftEdge = -timelineOffset; // The virtual X-coordinate of the left edge of the visible track.
    const currentViewRightEdge = currentViewLeftEdge + timeline.clientWidth; // The right edge of the visible track.

    // Define a small buffer zone at the edges to prevent frequent, jarring auto-scrolling.
    const buffer = 50; // Pixels from the left/right edge where auto-scroll will kick in.

    // If the playhead falls outside this visible area (considering the buffer), recenter the view.
    if (leftPx < currentViewLeftEdge + buffer || leftPx > currentViewRightEdge - buffer) {
        // Calculate a new `timelineOffset` to visually center the playhead within the visible track area.
        timelineOffset = -(leftPx - timeline.clientWidth / 2); // Global `timelineOffset`

        // Re-clamp this calculated offset to ensure it doesn't pan beyond the actual content boundaries.
        const maxScrollableLeft = Math.max(0, totalVirtualWidth - timeline.clientWidth);
        const minOffset = -maxScrollableLeft;
        timelineOffset = Math.min(0, Math.max(minOffset, timelineOffset)); // Global `timelineOffset`

        // Apply the new `timelineOffset` as a `translateX` transform to pan the relevant elements.
        timelineContent.style.transform = `translateX(${timelineOffset}px)`;
        timelineScale.style.transform = `translateX(${timelineOffset}px)`;
        keyframeLinesSvg.style.transform = `translateX(${timelineOffset}px)`;
    }

    updateTimeDisplay(); // Update the time shown in the UI.
}


// helper: generate unique id
function _mkMarkerId() {
    return 'm_' + Math.random().toString(36).slice(2, 9);
}

// Convert time (seconds) to pixel position (in the virtual timeline coordinate)
function timeToPxSec(timeSec) {
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
    return (timeSec / timelineDuration) * totalVirtualWidth;
}

// Convert pixel (virtual) to time seconds
function pxToTimeSec(px) {
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
    const clampedPx = Math.max(0, Math.min(totalVirtualWidth, px));
    return (clampedPx / totalVirtualWidth) * timelineDuration;
}

// Create and add a new marker
function addMarker(timeSec = currentTime, name = 'Marker', color = '#00a5ff') {
    const id = _mkMarkerId();
    const marker = { id, time: timeSec, name, color };
    timelineMarkers.push(marker);
    renderMarkers();
    return marker;
}

// Delete marker by id
function deleteMarker(id) {
    const idx = timelineMarkers.findIndex(m => m.id === id);
    if (idx !== -1) {
        timelineMarkers.splice(idx, 1);
        renderMarkers();
    }
}

// Move marker to new time (seconds)
/*function moveMarker(id, newTimeSec) {
    const m = timelineMarkers.find(x => x.id === x.id === id); // Fix: `x.id === x.id` should be `x.id === id`
    if (m) {
        m.time = Math.max(0, Math.min(timelineDuration, newTimeSec));
        renderMarkers();
    }
}*/

function moveMarker(id, newTimeSec) {
    const m = timelineMarkers.find(x => x.id === id); // âœ… corrected
    if (m) {
        m.time = Math.max(0, Math.min(timelineDuration, newTimeSec));
        renderMarkers();
    }
}


// Render marker DOM elements (call after zoom/pan/rescale or marker changes)
/*function renderMarkers() {
    if (!markersContainer) return;
    markersContainer.innerHTML = '';

    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
    // Ensure markersContainer width matches content so absolute left positioning works
    markersContainer.style.width = `${totalVirtualWidth}px`;
    markersContainer.style.transform = `translateX(${timelineOffset}px)`;

    timelineMarkers.forEach(marker => {
        const leftPx = timeToPxSec(marker.time);
        const el = document.createElement('div');
        el.className = 'timeline-marker';
        el.dataset.markerId = marker.id;
        el.style.left = `${leftPx}px`;
        el.style.zIndex = 40;

        // marker handle
        const handle = document.createElement('div');
        handle.className = 'marker-handle';
        handle.style.background = marker.color;
        el.appendChild(handle);

        // label
        const label = document.createElement('div');
        label.className = 'marker-label';
        label.textContent = marker.name + ' (' + formatTimeToMMSSms(marker.time) + ')';
        el.appendChild(label);

        // events: drag, click, right click
        attachMarkerEvents(el, marker);

        markersContainer.appendChild(el);
    });
}*/ 

let markerElementPool = [];

function renderMarkers() {
    if (!markersContainer) return;
    
    // Hide all pooled markers
    markerElementPool.forEach(m => m.style.display = 'none');
    
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
    markersContainer.style.width = `${totalVirtualWidth}px`;
    markersContainer.style.transform = `translateX(${timelineOffset}px)`;

    timelineMarkers.forEach((marker, index) => {
        const leftPx = timeToPxSec(marker.time);
        
        let el = markerElementPool[index];
        if (!el) {
            el = document.createElement('div');
            el.className = 'timeline-marker';
            el.innerHTML = `
                <div class="marker-handle"></div>
                <div class="marker-label"></div>
            `;
            markersContainer.appendChild(el);
            markerElementPool.push(el);
            attachMarkerEvents(el, marker);
        }
        
        el.style.display = 'block';
        el.dataset.markerId = marker.id;
        el.style.left = `${leftPx}px`;
        
        const handle = el.querySelector('.marker-handle');
        handle.style.background = marker.color;
        
        const label = el.querySelector('.marker-label');
        label.textContent = marker.name + ' (' + formatTimeToMMSSms(marker.time) + ')';
    });
}

// Attach events to each rendered marker element
function attachMarkerEvents(el, marker) {
    let isDraggingMarker = false;
    let startClientX = 0;
    let startLeftPx = 0;

    // mousedown begins drag
    el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingMarker = true;
        startClientX = e.clientX;
        const rect = el.getBoundingClientRect();
        // compute left relative to container (virtual)
        startLeftPx = parseFloat(el.style.left) || 0;
        document.body.style.cursor = 'grabbing';
        el.classList.add('dragging');
    });

    // mousemove on document while dragging
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingMarker) return;
        // Determine delta in screen space, convert to change in virtual px (accounting for zoom)
        const delta = e.clientX - startClientX;
        // Because markersContainer is translated by timelineOffset, delta maps 1:1 to virtual px
        let newPx = startLeftPx + delta;
        // convert to time
        let newTime = pxToTimeSec(newPx);

        // snap to nearest frame if snap is active (we assume you might have a global `snapToFrame` boolean)
        if (typeof snapToFrame !== 'undefined' && snapToFrame) {
            const newFrame = Math.round(newTime * fps);
            newTime = newFrame / fps;
        }

        // update marker DOM label (live)
        const handle = el.querySelector('.marker-handle');
        const label = el.querySelector('.marker-label');
        el.style.left = `${timeToPxSec(newTime)}px`;
        if (label) label.textContent = marker.name + ' (' + formatTimeToMMSSms(newTime) + ')';
    });

    // mouseup finalizes
    document.addEventListener('mouseup', (e) => {
        if (!isDraggingMarker) return;
        isDraggingMarker = false;
        document.body.style.cursor = 'default';
        el.classList.remove('dragging');

        // final time from element left
        const finalLeft = parseFloat(el.style.left) || 0;
        const finalTime = pxToTimeSec(finalLeft);
        moveMarker(marker.id, finalTime);
        // also move playhead to marker for quick preview
        currentTime = finalTime;
        updatePlayhead();
        updateSceneFromTimeline();
    });

    // left-click: move playhead to marker time
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        currentTime = marker.time;
        updatePlayhead();
        updateSceneFromTimeline();
    });

    // right-click: simple context actions (rename, color, delete)
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // a minimal UI using prompt() for now
        const action = prompt('Marker action (rename / color / delete)\nType "rename", "color", or "delete"');
        if (!action) return;
        if (action.toLowerCase() === 'rename') {
            const newName = prompt('Enter new name:', marker.name);
            if (newName !== null) { marker.name = newName; renderMarkers(); }
        } else if (action.toLowerCase() === 'color') {
            const newColor = prompt('Enter color hex (e.g. #ff0055):', marker.color);
            if (newColor) { marker.color = newColor; renderMarkers(); }
        } else if (action.toLowerCase() === 'delete') {
            if (confirm('Delete marker "' + marker.name + '"?')) {
                deleteMarker(marker.id);
            }
        }
    });
}

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

    // 1. Traverse all child meshes to apply common properties (like shadows).
    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // 2. Add the object to the global `scene`.
    scene.add(object);

    // 3. Set the newly added object as the `selectedObject` globally.
    selectedObject = object;

    // 4. Attach `transformControls` to the `selectedObject` for interactive manipulation in 3D.
    if (typeof transformControls !== 'undefined') { // Check if transformControls is defined globally
        transformControls.attach(object);
    }

    // 5. Integrate the object into the timeline animation system.
    if (object.animations && object.animations.length > 0) {
        // For models with native animations: setup `THREE.AnimationMixer` and pre-sample animations.
        console.log(`Found ${object.animations.length} animations for '${object.name}'. Setting up mixer and timeline.`);
        object.userData.mixer = new THREE.AnimationMixer(object);
        object.animations.forEach(clip => {
            const action = object.userData.mixer.clipAction(clip);
            action.play();
            action.paused = true; // Animations are paused initially; our timeline controls playback.
        });

        autoSetTimelineDurationFromAnimations(object); // Adjust global `timelineDuration` if this animation is longer.
        addObjectToTimeline(object); // Resample native animations into our custom `keyframes` format.
    } else {
        // For static models (no native animations): add an initial keyframe at `currentTime` (typically 0).
        console.log(`'${object.name}' is a static model. Adding initial keyframe.`);
        addKeyframe(); // Makes the object manually animatable on the timeline.
    }

    // 6. Update UI panels (`layers-list`, `keyframes-container`, `hierarchy`) to reflect changes.
    updateLayersUI();
    updateKeyframesUI(); // Crucial to display the new object's track and keyframes.
    if (typeof updateHierarchy === 'function') { // If you have a separate hierarchy panel.
        updateHierarchy();
    }
}

// Your existing 'mixers' array and 'registerMixer' function (commented as potentially redundant).
// const mixers = []; // Your existing declaration
// function registerMixer(mixer) { mixers.push(mixer); } // Your existing function


// --- Segment Selection ---
// (Your existing segment selection logic, using `timelineContent` and `selectedSegment`)
timelineContent.addEventListener('click', (e) => {
    if (e.target.classList.contains('recording-segment')) {
        if (selectedSegment) {
            selectedSegment.classList.remove('selected');
        }
        selectedSegment = e.target; // Uses your global `selectedSegment`
        selectedSegment.classList.add('selected');
    }
});

/**
 * `recordSceneData` needs review for its intended use with `selectedSegment`.
 * It appears to expand a visual segment based on elapsed time, possibly for recording animation.
 */
function recordSceneData() {
    if (isPlaying && selectedSegment && clock) {
        const time = clock.getElapsedTime();
        const position = (time / timelineDuration) * 100;
        selectedSegment.style.width = `${position}%`; // Updates your `selectedSegment`'s style
    }
}


// --- INITIALIZATION (Your functions) ---

/**
 * Initializes the main timeline UI. This function should be called once after
 * the DOM is fully loaded and global variables are available.
 */
function initializeTimeline() {
    initializeTimelineScale(); // This function now calls `renderTimelineRuler()` internally.
    updateLayersUI();         // Populates the layers list initially.
    updateKeyframesUI();      // Populates the keyframes display initially.
    setupTimelineEventListeners(); // Must be called somewhere in your main app,
}

/**
 * Iterates through all visible keyframes and updates their selection state
 * based on whether they intersect with the marquee selection box.
 * @param {boolean} isModifierPressed - If true, adds to the current selection. If false, replaces it.
 */
function updateSelectionFromBox(isModifierPressed) {
    const boxRect = selectionBox.getBoundingClientRect();

    // If not using a modifier key, we start fresh by clearing non-intersecting keyframes.
    if (!isModifierPressed) {
         // Create a new array for items that will remain selected
        const newSelectedKeyframes = [];
        selectedKeyframes.forEach(kfEl => {
            const kfRect = kfEl.getBoundingClientRect();
            // Basic 2D collision detection
            const intersects = (
                boxRect.left < kfRect.right &&
                boxRect.right > kfRect.left &&
                boxRect.top < kfRect.bottom &&
                boxRect.bottom > kfRect.top
            );

            if (!intersects) {
                kfEl.classList.remove('selected');
            } else {
                newSelectedKeyframes.push(kfEl);
            }
        });
        selectedKeyframes = newSelectedKeyframes;
    }
    
    // Now, iterate through ALL keyframes to add newly intersecting ones to the selection.
    const allKeyframes = document.querySelectorAll('#keyframes-container .keyframe');
    allKeyframes.forEach(kfEl => {
        const kfRect = kfEl.getBoundingClientRect();
        const intersects = (
            boxRect.left < kfRect.right &&
            boxRect.right > kfRect.left &&
            boxRect.top < kfRect.bottom &&
            boxRect.bottom > kfRect.top
        );

        if (intersects) {
            if (!kfEl.classList.contains('selected')) {
                kfEl.classList.add('selected');
                selectedKeyframes.push(kfEl);
            }
        }
    });
}

/**
 * Attaches all necessary event listeners for various timeline UI interactions.
 * This includes playback controls, zoom, pan, scrubbing the playhead,
 * and keyframe selection/creation (now with multi-selection capability).
 */
function setupTimelineEventListeners() {
    // Attach click listeners to playback/action buttons.
    document.getElementById('play').addEventListener('click', playAnimation);
    document.getElementById('pause').addEventListener('click', pauseAnimation);
    document.getElementById('stop').addEventListener('click', stopAnimation);
    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    document.getElementById('add-keyframe').addEventListener('click', addKeyframe);
    document.getElementById('delete-keyframe').addEventListener('click', deleteKeyframe);

    // View switching between Timeline and Graph Editor
    document.getElementById('view-graph').addEventListener('click', () => {
        document.querySelector('.timeline-body').style.display = 'none';
        document.getElementById('graph-editor-container').style.display = 'flex';
        document.getElementById('view-timeline').classList.remove('active');
        document.getElementById('view-graph').classList.add('active');
        isGraphView = true;
        initGraphEditor();
    });

    document.getElementById('view-timeline').addEventListener('click', () => {
        document.querySelector('.timeline-body').style.display = 'flex';
        document.getElementById('graph-editor-container').style.display = 'none';
        document.getElementById('view-timeline').classList.add('active');
        document.getElementById('view-graph').classList.remove('active');
        isGraphView = false;
    });

    document.getElementById("playback-speed").addEventListener("change", (e) => {
        playbackSpeed = parseFloat(e.target.value);
    });

    // === Playhead Step Controls ===
    document.getElementById('step-forward').addEventListener('click', () => {
        currentTime = Math.min(timelineDuration, currentTime + 1 / fps); // step 1 frame
        updatePlayhead();
        updateSceneFromTimeline();
    });

    document.getElementById('step-backward').addEventListener('click', () => {
       currentTime = Math.max(0, currentTime - 1 / fps); // step 1 frame
       updatePlayhead();
       updateSceneFromTimeline();
    });

    document.getElementById('step-forward-sec').addEventListener('click', () => {
       currentTime = Math.min(timelineDuration, currentTime + 1); // step 1 second
       updatePlayhead();
       updateSceneFromTimeline();
    });

    document.getElementById('step-backward-sec').addEventListener('click', () => {
       currentTime = Math.max(0, currentTime - 1); // step 1 second
       updatePlayhead();
       updateSceneFromTimeline();
    });

    // --- NEW: Event Listener for the Shatter Modifier Button ---
    document.getElementById('add-shatter-modifier').addEventListener('click', () => {
        if (!selectedObject) {
            alert("Please select a mesh object to shatter!");
            return;
        }

        // Add the modifier to the selected object, starting at the current time
        modifierManager.addModifier(selectedObject, 'shatter', {
            startTime: currentTime,
            duration: 3.0,      // The explosion will last for 3 seconds
            explosionForce: 15.0 // How fast the pieces fly out
        });
    });

    // === Context Menu Handling ===
    document.addEventListener('contextmenu', (e) => {
        if (selectedGraphKeyframe !== null) {
            e.preventDefault();
            contextMenu.style.display = 'block';
            contextMenu.style.left = `${e.pageX}px`;
            contextMenu.style.top = `${e.pageY}px`;
        }
    });

    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && !isDragging) {
            timelineTrack.style.cursor = 'grab';
        }
    });

    contextMenu.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action) return;

        switch (action) {
            case "copy": copyKeyframe(); break;
            case "paste": pasteKeyframe(); break;
            case "duplicate": duplicateKeyframe(); break;
            case "delete": deleteKeyframeAction(); break;
            case "ease-in": setEase("ease-in"); break;
            case "ease-out": setEase("ease-out"); break;
            case "ease-in-out": setEase("ease-in-out"); break;
        }
        contextMenu.style.display = 'none';
    });

    // === Keyboard Shortcuts ===
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.code === "KeyC") copyKeyframe();
        if (e.ctrlKey && e.code === "KeyV") pasteKeyframe();
        if (e.ctrlKey && e.code === "KeyD") duplicateKeyframe();
        if (e.code === "Delete") deleteKeyframeAction();
    });

    const snapToggleBtn = document.getElementById('toggle-snapping');
    snapToggleBtn.addEventListener('click', () => {
       isSnappingEnabledTimeline = !isSnappingEnabledTimeline;
       snapToggleBtn.classList.toggle('active', isSnappingEnabledTimeline);
       console.log(`Snapping ${isSnappingEnabledTimeline ? 'Enabled' : 'Disabled'}`);
    });
    snapToggleBtn.classList.toggle('active', isSnappingEnabledTimeline); // Set initial state


    // --- Interpolation Type Selector Event Listener (From previous feature) ---
    const interpolationSelect = document.getElementById('interpolation-type-select');
    if (interpolationSelect) {
        interpolationSelect.value = currentDefaultInterpolationType; // Use your global
        interpolationSelect.addEventListener('change', (e) => {
            currentDefaultInterpolationType = e.target.value; // Update your global default interpolation type
            console.log("Default interpolation type set to:", currentDefaultInterpolationType);
            updateSceneFromTimeline();
        });
    }

    // --- Timeline drag and scrub logic (using your local `const`s and global `let` vars) ---
    const timelineTrack = timeline; // Your original `timeline` const (track element)
    const playheadElement = playhead; // Your original `playhead` const
    const timelineContentElement = timelineContent; // Your original `timelineContent` const

    let isDraggingPlayhead = false;
    let dragStartX = 0; // Stores mouse X position when a drag starts (for calculating pan offset)

    // Event listener for mousedown on the playhead (initiates scrubbing).
    playheadElement.addEventListener('mousedown', (e) => {
        isDraggingPlayhead = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.stopPropagation(); // Stop event bubbling to prevent conflicting track panning.
    });

    // Event listener for mousedown on the timeline track (initiates panning).
    timelineTrack.addEventListener('mousedown', (e) => {
        // If mousedown occurred on a keyframe, the keyframe's specific mousedown listener (in updateKeyframesUI) will handle it.
        // So, this block only processes mousedown on empty track space.
        if (!e.target.classList.contains('keyframe')) { // Explicitly check if it's NOT a keyframe
            if (e.target === timelineTrack || e.target === timelineContentElement) {
                /*isDragging = true; // Use global `isDragging` for track panning.
                isDraggingPlayhead = false; // Ensure playhead scrubbing is not active.
                dragStartX = e.clientX - timelineOffset; // Use global `timelineOffset`.
                timelineTrack.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';*/

                  // If spacebar is pressed, PAN the timeline.
            
            // Otherwise, start a BOX SELECTION.
            if (e.buttons === 1 && e.code === 'Space') { // e.buttons === 1 checks for left-click
                isDragging = true; // This is your existing PANNING flag
                isBoxSelecting = false;
                dragStartX = e.clientX - timelineOffset;
                timelineTrack.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
            }else if (e.buttons === 1) {
                isBoxSelecting = true;
                isDragging = false; // Ensure panning is off
                
                // Store starting coordinates relative to the timeline track element
                const rect = timelineTrack.getBoundingClientRect();
                boxSelectStart.x = e.clientX - rect.left;
                boxSelectStart.y = e.clientY - rect.top;

                // Position and show the selection box
                selectionBox.style.left = `${boxSelectStart.x}px`;
                selectionBox.style.top = `${boxSelectStart.y}px`;
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.style.display = 'block';
                document.body.style.userSelect = 'none';
            }

                // --- NEW: Clear selections if starting a new pan without a modifier key ---
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    selectedKeyframes.forEach(kf => kf.classList.remove('selected'));
                    selectedKeyframes = [];
                    selectedKeyframe = null; // Clear single selected keyframe reference
                    updateKeyframesUI(); // To remove the 'selected-object-track' highlight visually
                }
            }
        }
    });

    
    const loopToggle = document.getElementById("loop-toggle");
    const loopStartInput = document.getElementById("loop-start-time");
    const loopEndInput = document.getElementById("loop-end-time");
    const setLoopStartBtn = document.getElementById("set-loop-start");
    const setLoopEndBtn = document.getElementById("set-loop-end");

    if (loopToggle && loopStartInput && loopEndInput && setLoopStartBtn && setLoopEndBtn) {
        // Init values
        loopEnabled = loopToggle.checked;
        loopStart = timeToMs(loopStartInput.value);
        loopEnd = timeToMs(loopEndInput.value) || timelineDuration * 1000;

        loopToggle.addEventListener("change", () => {
            loopEnabled = loopToggle.checked;
            updateLoopZone();
        });

        loopStartInput.addEventListener("change", () => {
            loopStart = timeToMs(loopStartInput.value);
            updateLoopZone();
        });

        loopEndInput.addEventListener("change", () => {
            loopEnd = timeToMs(loopEndInput.value);
            updateLoopZone();
        });

        setLoopStartBtn.addEventListener("click", () => {
            loopStart = currentTime * 1000;
            loopStartInput.value = msToTime(loopStart);
            updateLoopZone();
        });

        setLoopEndBtn.addEventListener("click", () => {
            loopEnd = currentTime * 1000;
            loopEndInput.value = msToTime(loopEnd);
            updateLoopZone();
        });
    }

    // --- Timeline Marker Events ---
    let _lastMouseOnRulerX = null;
    if (timelineScale) {
        timelineScale.addEventListener('mousemove', (e) => {
            const rect = timelineScale.getBoundingClientRect();
            _lastMouseOnRulerX = e.clientX - rect.left - timelineOffset;
        });
        timelineScale.addEventListener('mouseleave', () => { _lastMouseOnRulerX = null; });
        timelineScale.addEventListener('click', (e) => {
            if (e.button !== 0) return;
                const rect = timelineScale.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const virtualX = clickX - timelineOffset;
                const time = pxToTimeSec(virtualX);
                addMarker(time, 'Marker', '#00a5ff');
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'm' && !e.repeat) {
            if (e.shiftKey && _lastMouseOnRulerX !== null) {
                const time = pxToTimeSec(_lastMouseOnRulerX);
                addMarker(time, 'Marker', '#00a5ff');
            } else {
                addMarker(currentTime, 'Marker', '#00a5ff');
            }
        }
    });


    // Global mousemove listener (active during playhead scrubbing, timeline panning, OR keyframe dragging).
    document.addEventListener('mousemove', (e) => {
        // --- Keyframe Dragging Logic (NEW/MODIFIED) ---
        /*if (isDraggingKeyframe && draggedKeyframe) { // `isDraggingKeyframe` and `draggedKeyframe` are global variables
            const deltaX = e.clientX - dragKeyframeStartClientX; // Global `dragKeyframeStartClientX`
            let newKeyframeLeftPx = dragKeyframeStartLeftPx + deltaX; // Global `dragKeyframeStartLeftPx`

            const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
            newKeyframeLeftPx = Math.max(0, Math.min(totalVirtualWidth, newKeyframeLeftPx)); // Clamp visual position

            // Convert new pixel position back to time, and then snap to the nearest frame
            let newTime = (newKeyframeLeftPx / totalVirtualWidth) * timelineDuration; // Global `timelineDuration`
            const newFrame = Math.round(newTime * fps); // Global `fps`
            newTime = newFrame / fps; // Snapped time

            // Convert snapped time back to pixels for smooth visual update (the visual snap)
            newKeyframeLeftPx = (newTime / timelineDuration) * totalVirtualWidth;

            // Update the visual position of the dragged keyframe DOM element
            draggedKeyframe.style.left = `${newKeyframeLeftPx}px`;

            // Temporarily update `currentTime` for instant preview during drag.
            // This might eventually apply to ALL `selectedKeyframes` if dragging multiple.
            currentTime = newTime;
            updatePlayhead();
            updateSceneFromTimeline();

        }*/ 
       if (isDraggingKeyframe && dragKeyframeInitialStates.length > 0) {
    const deltaX = e.clientX - dragKeyframeStartClientX;
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    // First, calculate the new time of the primary dragged keyframe
    const primaryInitialState = dragKeyframeInitialStates[0];
    let primaryNewLeftPx = primaryInitialState.startLeftPx + deltaX;
    let primaryNewTime = (primaryNewLeftPx / totalVirtualWidth) * timelineDuration;

    // Get the snapped time
    const snappedTime = getSnappedTime(primaryNewTime);
    
    // Calculate the final delta based on the snap
    const snappedDeltaTime = snappedTime - primaryInitialState.originalData.time;
    const timeToPx = totalVirtualWidth / timelineDuration;

    dragKeyframeInitialStates.forEach(initialState => {
        let newTime = initialState.originalData.time + snappedDeltaTime; // Apply same time delta to all
        const newFrame = Math.round(newTime * fps);
        newTime = newFrame / fps;

        const newLeftPx = newTime * timeToPx;

        initialState.el.style.left = `${newLeftPx}px`;
        initialState.newFrame = newFrame;
        initialState.newTime = newTime;
    });

    // Update playhead...
    currentTime = dragKeyframeInitialStates[0].newTime;
    updatePlayhead();
    updateSceneFromTimeline();
}else if (isDraggingPlayhead) {
            // Logic for scrubbing the playhead (uses global `currentTime`, `timelineDuration`, etc.)
            const timelineContentRect = timelineContentElement.getBoundingClientRect();
            const mouseXInContent = e.clientX - timelineContentRect.left;

            const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
            currentTime = Math.max(0, Math.min(timelineDuration, (mouseXInContent / totalVirtualWidth) * timelineDuration));

            updatePlayhead();
            updateSceneFromTimeline();

        }  else if (isBoxSelecting) {
            const rect = timelineTrack.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
 
            // Calculate box dimensions, handling dragging in any direction
            const newLeft = Math.min(boxSelectStart.x, currentX);
            const newTop = Math.min(boxSelectStart.y, currentY);
            const newWidth = Math.abs(currentX - boxSelectStart.x);
            const newHeight = Math.abs(currentY - boxSelectStart.y);
  
            // Update the visual box
            selectionBox.style.left = `${newLeft}px`;
            selectionBox.style.top = `${newTop}px`;
            selectionBox.style.width = `${newWidth}px`;
            selectionBox.style.height = `${newHeight}px`;

            // Check for keyframes intersecting with the box
            updateSelectionFromBox(e.shiftKey || e.ctrlKey || e.metaKey);
        }

        
        
        else if (isDragging && timelineTrack.style.cursor === 'grabbing') {
            // Logic for panning the timeline horizontally (uses global `isDragging`, `timelineOffset`, etc.)
            timelineOffset = e.clientX - dragStartX; // Use global `timelineOffset` and `dragStartX`

            const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
            const timelineTrackClientWidth = timelineTrack.clientWidth;
            const maxOffset = 0;
            const minOffset = -(Math.max(0, totalVirtualWidth - timelineTrackClientWidth));
            timelineOffset = Math.min(maxOffset, Math.max(minOffset, timelineOffset));

            // Apply `translateX` transform to visual elements for panning effect.
            timelineContentElement.style.transform = `translateX(${timelineOffset}px)`;
            timelineScale.style.transform = `translateX(${timelineOffset}px)`; // Your `timelineScale` const
            keyframeLinesSvg.style.transform = `translateX(${timelineOffset}px)`; // Your global `keyframeLinesSvg`

            updatePlayhead(); // Recalculate playhead position as its offset depends on `timelineOffset`.
        }
    });

    // Global mouseup listener (ends any active dragging operation: keyframe, playhead, or pan).
    document.addEventListener('mouseup', () => {
        // --- Keyframe Dragging End Logic (NEW/MODIFIED) ---
        /*if (isDraggingKeyframe && draggedKeyframe) {
            isDraggingKeyframe = false; // Reset keyframe drag flag
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';

            // Convert final visual position back to snapped time
            const newLeftPx = parseFloat(draggedKeyframe.style.left);
            const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
            let newTime = (newLeftPx / totalVirtualWidth) * timelineDuration;
            const newFrame = Math.round(newTime * fps);
            newTime = newFrame / fps; // Final snapped time

            // --- CRITICAL: Update the actual keyframes data structure in your global `keyframes` Map ---
            const currentObjectKeyframes = keyframes.get(dragKeyframeOriginalUuid); // Global `keyframes`, `dragKeyframeOriginalUuid`
            if (currentObjectKeyframes) {
                // Only perform data update if the keyframe has actually moved to a different frame.
                // Or if it was moved slightly but landed on its own frame, still good practice to process.
                if (newFrame !== dragKeyframeOriginalFrame) {
                    // Handle potential existing keyframe at `newFrame`
                    if (currentObjectKeyframes[newFrame]) {
                        console.warn(`Keyframe at frame ${newFrame} for object ${selectedObject.name} already exists. Overwriting old data.`);
                    }

                    // Delete the old keyframe entry from the map (identified by original frame)
                    delete currentObjectKeyframes[dragKeyframeOriginalFrame];

                    // Create/update the new keyframe entry in the map (at the new frame)
                    // It's important to copy the ORIGINAL data (pos, rot, scale, interp, and handles)
                    // and just update the `time` property.
                    currentObjectKeyframes[newFrame] = {
                        ...dragKeyframeOriginalData, // Global `dragKeyframeOriginalData` (deep copy)
                        time: newTime                // Update only the time
                    };

                    console.log(`Moved keyframe for ${selectedObject.name} from frame ${dragKeyframeOriginalFrame} to frame ${newFrame} (Time: ${newTime.toFixed(2)}s)`);

                    // After modifying `keyframes` Map, rebuild UI elements for that track to ensure consistency.
                    // This is less efficient for individual keyframes, but robust for full redraw after move.
                    updateKeyframesUI();

                    // Re-select the keyframe that was just moved to maintain visual selection
                    // It will have the new `data-frame` attribute.
                    const movedKeyframeEl = document.querySelector(`.keyframe[data-uuid="${dragKeyframeOriginalUuid}"][data-frame="${newFrame}"]`);
                    if(movedKeyframeEl) {
                         // We are moving one keyframe. Select it. This clears multi-selection, but consistent for this context.
                         selectedKeyframes.forEach(kf => kf.classList.remove('selected'));
                         selectedKeyframes = [];
                         selectedKeyframe = null; // Clear global last selected keyframe
                         
                         movedKeyframeEl.classList.add('selected');
                         selectedKeyframes.push(movedKeyframeEl);
                         selectedKeyframe = movedKeyframeEl; // Set the moved keyframe as the new primary selected keyframe.
                    }

                } else {
                    console.log(`Keyframe for ${selectedObject.name} stayed at frame ${newFrame}.`);
                }
            }
            draggedKeyframe = null; // Clear the reference to the dragged DOM element.

        }*/ 
        if (isDraggingKeyframe) {
    isDraggingKeyframe = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';

    // A map to handle frame conflicts (e.g., dragging multiple keyframes to the same new frame)
    const updatesToProcess = new Map();

    // Process all moved keyframes. We iterate in reverse so if we overwrite, the "top" one wins.
    for (let i = dragKeyframeInitialStates.length - 1; i >= 0; i--) {
        const state = dragKeyframeInitialStates[i];
        
        // Skip if the frame hasn't actually changed
        if (state.newFrame === undefined || state.newFrame === state.originalFrame) {
            continue;
        }

        // Prepare the updated keyframe data
        const updatedKfData = {
            ...state.originalData,
            time: state.newTime
        };

        const key = `${state.uuid}_${state.boneName || 'root'}_${state.newFrame}`;
        if (!updatesToProcess.has(key)) {
            updatesToProcess.set(key, {
                uuid: state.uuid,
                boneName: state.boneName,
                newFrame: state.newFrame,
                data: updatedKfData,
                oldFrame: state.originalFrame
            });
        }
    }

    // Now, apply the changes to the master data maps
    updatesToProcess.forEach(update => {
        let keyframeMap;
        if (update.boneName) {
            keyframeMap = boneKeyframes.get(update.uuid)?.get(update.boneName);
        } else {
            keyframeMap = keyframes.get(update.uuid);
        }

        if (keyframeMap) {
            // Add the new keyframe (handles overwrite automatically)
            keyframeMap[update.newFrame] = update.data;
        }
    });
    
    // Now delete all the old keyframes AFTER adding the new ones to avoid data loss
    updatesToProcess.forEach(update => {
        let keyframeMap;
        if (update.boneName) {
            keyframeMap = boneKeyframes.get(update.uuid)?.get(update.boneName);
        } else {
            keyframeMap = keyframes.get(update.uuid);
        }
        if (keyframeMap && keyframeMap[update.oldFrame]) {
            // Check if another keyframe was moved INTO this old spot. If so, don't delete.
            const isOldSpotOccupiedByAnotherMove = Array.from(updatesToProcess.values()).some(upd => upd.newFrame === update.oldFrame);
            if (!isOldSpotOccupiedByAnotherMove) {
                 delete keyframeMap[update.oldFrame];
            }
        }
    });

    dragKeyframeInitialStates = []; // Clear the temporary state
    
    // Redraw the entire UI to ensure consistency
    updateKeyframesUI();
    
    console.log(`Moved ${updatesToProcess.size} keyframe(s).`);

} else if (isDraggingPlayhead) {
            // ... (existing code for playhead dragging mouseup) ...
            isDraggingPlayhead = false;
            document.body.style.cursor = 'default';

        }  else if (isBoxSelecting) {
            isBoxSelecting = false;
            selectionBox.style.display = 'none'; // Hide the box
            document.body.style.userSelect = 'auto';
            // The final selection is already set by the last mousemove event.
        }
        
        else if (isDragging) {
            // ... (existing code for timeline panning mouseup) ...
            isDragging = false;
            timelineTrack.style.cursor = 'grab';
            document.body.style.userSelect = 'auto';
        }
    });

    // Keyframe selection and creation via timeline click.
    timelineContentElement.addEventListener('click', (e) => {
        // --- Refined keyframe selection logic ---
        if (e.target.classList.contains('keyframe')) {
            const clickedKeyframeEl = e.target;
            const isModifierPressed = e.shiftKey || e.ctrlKey || e.metaKey;

            selectKeyframe(clickedKeyframeEl, e); // Call the modified selectKeyframe to handle single/multi logic.

            e.stopPropagation(); // Prevent this click from bubbling up to `timelineContentElement`'s listener.

        } else if (selectedObject && (e.target === timelineContentElement || e.target.closest('.timeline-track-row') === timelineContentElement)) {
            // Logic for clicking an empty part of a track (to add a new keyframe or deselect all)
            const isModifierPressed = e.shiftKey || e.ctrlKey || e.metaKey;

            if (!isModifierPressed) { // If no modifier key, deselect all keyframes
                selectedKeyframes.forEach(kf => kf.classList.remove('selected'));
                selectedKeyframes = [];
                selectedKeyframe = null;
                // Rebuild keyframe UI just to ensure no orphaned highlights if multi-selection allowed cross-object
                // and a track might get redrawn and not have the new state.
                updateKeyframesUI();
            }

            const rect = timelineContentElement.getBoundingClientRect();
            const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

            const clickX = e.clientX - rect.left - timelineOffset;

            if (clickX >= 0 && clickX <= totalVirtualWidth) {
                const timeRatio = clickX / totalVirtualWidth;
                currentTime = Math.max(0, Math.min(timelineDuration, timeRatio * timelineDuration));

                addKeyframe(); // This function will update `keyframes` and then `updateKeyframesUI` to redraw.
                // --- After `addKeyframe()`, we want to auto-select the new keyframe ---
                const newFrame = Math.round(currentTime * fps);
                const newKeyframeEl = document.querySelector(`.keyframe[data-uuid="${selectedObject.uuid}"][data-frame="${newFrame}"]`);
                if (newKeyframeEl) {
                   selectKeyframe(newKeyframeEl, e); // Auto-select the newly created keyframe
                }

                updatePlayhead();
                updateSceneFromTimeline();
            }
        }
    });

    // Mouse Wheel Zoom Listener
    timelineTrack.addEventListener('wheel', (e) => {
        e.preventDefault();

        const oldZoomLevel = zoomLevel;
        const zoomFactor = 1.1;

        if (e.deltaY < 0) { // Wheel up = zoom in.
            zoomLevel = Math.min(zoomLevel * zoomFactor, 100);
        } else { // Wheel down = zoom out.
            zoomLevel = Math.max(zoomLevel / zoomFactor, 0.1);
        }

        const mouseXInTrack = e.clientX - timelineTrack.getBoundingClientRect().left;
        const currentVirtualXAtMouse = (-timelineOffset + mouseXInTrack) / oldZoomLevel;
        const newOffset = -(currentVirtualXAtMouse * zoomLevel - mouseXInTrack);

        timelineOffset = newOffset;
        updateTimelineZoom();
    });
}




function exportMarkers() {
    return JSON.stringify(timelineMarkers.map(m => ({
        id: m.id, time: m.time, name: m.name, color: m.color
    })));
}

function importMarkers(jsonString) {
    try {
        const arr = JSON.parse(jsonString);
        if (!Array.isArray(arr)) throw new Error('Invalid markers JSON');
        timelineMarkers = arr.map(x => ({
            id: x.id || _mkMarkerId(),
            time: x.time || 0,
            name: x.name || 'Marker',
            color: x.color || '#00a5ff'
        }));
        renderMarkers();
    } catch (err) {
        console.warn('importMarkers failed:', err);
    }
}

/**
 * Starts animation playback from the current global `currentTime`.
 
function playAnimation() {
    if (isPlaying) return;
    isPlaying = true;
    console.log("Animation playing. Resuming from:", currentTime.toFixed(2));
}


function pauseAnimation() {
    if (!isPlaying) return;
    isPlaying = false;
    console.log("Animation paused at:", currentTime.toFixed(2));
}


function stopAnimation() {
    isPlaying = false;
    currentTime = 0;
    console.log("Animation stopped and reset.");
    updatePlayhead();
    updateTimeDisplay();
    updateSceneFromTimeline();
}
*/

/* 2

function playAnimation() {
    if (isPlaying) return;
    isPlaying = true;
    console.log("Animation playing. Resuming from:", currentTime.toFixed(2));

    // Resume all mixers
    scene.traverse(obj => {
        if (obj.userData.mixer) {
            obj.userData.mixer.time = currentTime; // ensure sync
            obj.userData.mixer._actions.forEach(action => action.paused = false);
        }
    });
}

function pauseAnimation() {
    if (!isPlaying) return;
    isPlaying = false;
    console.log("Animation paused at:", currentTime.toFixed(2));

    // Pause all mixers
    scene.traverse(obj => {
        if (obj.userData.mixer) {
            obj.userData.mixer._actions.forEach(action => action.paused = true);
        }
    });
}

function stopAnimation() {
    isPlaying = false;
    currentTime = 0;
    console.log("Animation stopped and reset.");

    // Reset all mixers
    scene.traverse(obj => {
        if (obj.userData.mixer) {
            obj.userData.mixer._actions.forEach(action => {
                action.reset();
                action.paused = true;
            });
        }
    });

    updatePlayhead();
    updateTimeDisplay();
    updateSceneFromTimeline();
}*/ 


/**
 * Starts animation playback from the current global `currentTime`.
 * Controls both custom timeline `currentTime` and `THREE.AnimationMixer` instances.
 */
function playAnimation() {
    if (isPlaying) return; // Prevent double-playing
    isPlaying = true;

    scene.traverse((obj) => {
        const mixer = obj.userData?.mixer;
        if (mixer) {
            mixer.timeScale = 1; // Set mixer to play at normal speed

            // IMPORTANT: If the object has custom keyframes on our timeline,
            // we should also synchronize the mixer's time to our timeline's currentTime.
            // This ensures internal bone animations jump to the correct spot when play is hit mid-timeline.
            if (keyframes.has(obj.uuid)) {
                mixer.setTime(currentTime);
                mixer.update(0); // Apply the pose immediately for current time
            }
        }
    });

    console.log("Animation playing. Resuming from:", currentTime.toFixed(2));
}


/**
 * Pauses animation playback.
 * Controls both custom timeline `isPlaying` and `THREE.AnimationMixer` instances.
 */
function pauseAnimation() {
    if (!isPlaying) return; // Only pause if currently playing
    isPlaying = false;

    scene.traverse((obj) => {
        const mixer = obj.userData?.mixer;
        if (mixer) {
            mixer.timeScale = 0; // <--- CRITICAL FIX: Set mixer timeScale to 0 to pause it
        }
    });

    console.log("Animation paused at:", currentTime.toFixed(2));
}


/**
 * Stops animation playback and resets the timeline to 0.
 * Controls both custom timeline and `THREE.AnimationMixer` instances.
 */
function stopAnimation() {
    isPlaying = false;
    currentTime = 0; // Reset custom timeline time

    scene.traverse((obj) => {
        const mixer = obj.userData?.mixer;
        if (mixer) {
            mixer.timeScale = 0; // <--- CRITICAL FIX: Pause mixer
            mixer.setTime(0);    // <--- CRITICAL FIX: Reset mixer to beginning
            // mixer.update(0); // Optional: Apply the time 0 pose immediately if you want visual feedback
        }
    });

    console.log("Animation stopped and reset.");
    updatePlayhead();
    updateTimeDisplay();
    updateSceneFromTimeline(); // Ensure scene state (root motion) is consistent with currentTime = 0
}


/**
 * Increases the timeline's zoom level based on a fixed factor.
 */
function zoomIn() {
    zoomLevel = Math.min(zoomLevel * 1.2, 10);
    updateTimelineZoom();
}

/**
 * Decreases the timeline's zoom level based on a fixed factor.
 */
function zoomOut() {
    zoomLevel = Math.max(zoomLevel / 1.2, 0.1);
    updateTimelineZoom();
}

const loopZone = document.getElementById("loop-zone");

function updateLoopZone() {
    if (!loopZone) return;

    if (!loopEnabled) {
        loopZone.style.display = "none";
        return;
    }

    loopZone.style.display = "block";

    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    const startPx = (loopStart / 1000 / timelineDuration) * totalVirtualWidth;
    const endPx = (loopEnd / 1000 / timelineDuration) * totalVirtualWidth;

    const left = Math.min(startPx, endPx);
    const width = Math.max(0, Math.abs(endPx - startPx));

    loopZone.style.left = `${left}px`;
    loopZone.style.width = `${width}px`;
}


// --- SCENE & MODEL INTEGRATION (Functions using your globals like `scene`, `transformControls`, etc.) ---

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
        object.userData.mixer = new THREE.AnimationMixer(object);
        object.animations.forEach(clip => {
            const action = object.userData.mixer.clipAction(clip);
            action.play();
            action.paused = true;
        });

        autoSetTimelineDurationFromAnimations(object);
        addObjectToTimeline(object);
    } else {
        console.log(`'${object.name}' is a static model. Adding initial keyframe.`);
        addKeyframe();
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

// --- Timeline Data & Keyframe Management (Functions using your globals like `keyframes`, `fps`, etc.) ---

/**
 * Resamples an object's animation clips to create a unified set of complete keyframes for the custom timeline.
 * If the object has no native animations, it creates a single keyframe at time 0 reflecting its initial local transform.
 *
 * @param {THREE.Object3D} object The top-level parent object.
 *
function addObjectToTimeline(object) {
    if (!object || !object.isObject3D || !object.uuid) {
        console.warn("addObjectToTimeline: Invalid object provided.", object);
        return;
    }

    const hasNativeAnimations = object.animations && object.animations.length > 0;
    const objectKeyframes = {};

    let animationTarget = object.getObjectByName('mixamorigHips');
    if (!animationTarget) {
        animationTarget = object;
    }
    object.userData.animationTarget = animationTarget;

    console.log(`Setting up timeline for '${object.name}'. Animation target identified as: ${animationTarget.name || 'Top-level object'}.`);

    _tempBoneLocalPosition.copy(animationTarget.position);
    _tempBoneLocalQuaternion.copy(animationTarget.quaternion);
    _tempBoneLocalScale.copy(animationTarget.scale);

    if (hasNativeAnimations) {
        if (!object.userData.mixer) {
            object.userData.mixer = new THREE.AnimationMixer(object);
        }
        object.animations.forEach(clip => {
            const action = object.userData.mixer.clipAction(clip);
            action.play();
            action.paused = true;
        });
    }

    if (hasNativeAnimations) {
        const allTimes = new Set();
        let maxClipDuration = 0;

        object.animations.forEach(clip => {
            clip.tracks.forEach(track => {
                for (const time of track.times) {
                    allTimes.add(time);
                }
            });
            if (clip.duration > maxClipDuration) maxClipDuration = clip.duration;
        });

        allTimes.add(0);
        allTimes.add(maxClipDuration);

        const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

        animationTarget.position.copy(_tempBoneLocalPosition);
        animationTarget.quaternion.copy(_tempBoneLocalQuaternion);
        animationTarget.scale.copy(_tempBoneLocalScale);
        object.updateMatrixWorld(true);

        sortedTimes.forEach(time => {
            const frame = Math.round(time * fps);

            if (object.userData.mixer) {
                object.userData.mixer.setTime(time);
                object.userData.mixer.update(0);
            }
            object.updateMatrixWorld(true);

            objectKeyframes[frame] = {
                time: time,
                position: animationTarget.position.clone(),
                rotation: animationTarget.quaternion.clone(),
                scale: animationTarget.scale.clone()
                // Handles are NOT set for imported animation clips, only for manually added keyframes
            };
        });

        if (object.userData.mixer) {
            object.userData.mixer.setTime(0);
            object.userData.mixer.update(0);
            object.userData.mixer.stopAllAction();
        }
        animationTarget.position.copy(_tempBoneLocalPosition);
        animationTarget.quaternion.copy(_tempBoneLocalQuaternion);
        animationTarget.scale.copy(_tempBoneLocalScale);
        object.updateMatrixWorld(true);

        if (Object.keys(objectKeyframes).length > 0) {
            keyframes.set(object.uuid, objectKeyframes);
            console.log(`Ã¢Å“â€¦ Timeline populated for '${object.name}' with ${Object.keys(objectKeyframes).length} complete keyframes.`);
            if (maxClipDuration > timelineDuration) {
                timelineDuration = maxClipDuration;
                initializeTimelineScale();
            }
        }
    } else {
        if (!keyframes.has(object.uuid) || Object.keys(keyframes.get(object.uuid)).length === 0) {
            console.log(`'${object.name}' is a static model or has no animations. Adding initial keyframe at 0.`);
            objectKeyframes[0] = {
                time: 0,
                position: _tempBoneLocalPosition.clone(),
                rotation: _tempBoneLocalQuaternion.clone(),
                scale: _tempBoneLocalScale.clone()
                // Handles are NOT set here, only for addKeyframe()
            };
            keyframes.set(object.uuid, objectKeyframes);
        }
    }

    updateKeyframesUI();
    updateLayersUI();
}

  function addObjectToTimeline(object) { 
    if (!object || !object.isObject3D || !object.uuid) {
        console.warn("addObjectToTimeline: Invalid object provided.", object);
        return;
    }

    const hasNativeAnimations = object.animations && object.animations.length > 0;
    const objectKeyframes = {};

    let animationTarget = object.getObjectByName('mixamorigHips');
    

    if (!animationTarget) {
        animationTarget = object;
        console.warn(`addObjectToTimeline: No 'mixamorigHips' found for ${object.name}. Defaulting animation target to top-level object.`);
    } else {
        console.log(`addObjectToTimeline: Found 'mixamorigHips' for ${object.name}. Setting as animation target.`);
    }
    object.userData.animationTarget = animationTarget;

    // Store initial (bind pose) local transforms of the animation target.
    // This is crucial for resetting the target to its neutral state before sampling each time.
    _tempBoneLocalPosition.copy(animationTarget.position);
    _tempBoneLocalQuaternion.copy(animationTarget.quaternion);
    _tempBoneLocalScale.copy(animationTarget.scale);

    if (hasNativeAnimations) {
        if (!object.userData.mixer) {
            object.userData.mixer = new THREE.AnimationMixer(object);
        }

        // --- IMPORTANT: Store references to actions for resampling ---
        // Create and store all actions once. We will manipulate their state in the loop.
        const actions = [];
        object.animations.forEach(clip => {
            const action = object.userData.mixer.clipAction(clip);
            action.play(); // Play them
            action.paused = true; // Immediately pause them so setTime controls the position
            actions.push(action);
        });

        const allTimes = new Set();
        let maxClipDuration = 0;

        object.animations.forEach(clip => {
            clip.tracks.forEach(track => {
                for (const time of track.times) {
                    allTimes.add(time);
                }
            });
            if (clip.duration > maxClipDuration) maxClipDuration = clip.duration;
        });

        // Ensure 0 and max duration are included in sampled times
        allTimes.add(0);
        allTimes.add(maxClipDuration);

        const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

        // --- Sampling Loop ---
        sortedTimes.forEach(time => {
            const frame = Math.round(time * fps);

            // 1. Reset the animationTarget to its original bind pose.
            // This ensures that the mixer applies its transforms from a consistent, neutral base for each sample point.
            animationTarget.position.copy(_tempBoneLocalPosition);
            animationTarget.quaternion.copy(_tempBoneLocalQuaternion);
            animationTarget.scale.copy(_tempBoneLocalScale);

            // 2. Stop all actions and set time for a precise sample.
            // For robust sampling, ensure the mixer is set *freshly* for each time point.
            if (object.userData.mixer) {
                // It's often sufficient to just set the mixer time,
                // but for complex scenarios, ensuring actions are 'ready' is better.
                actions.forEach(action => action.reset()); // Reset actions to start of their clip
                object.userData.mixer.setTime(time);      // Set mixer to the specific time
                object.userData.mixer.update(0);          // Evaluate animation at this exact time (delta=0)
            }
            
            // 3. Force update the object's world matrix.
            // This propagates any changes from the mixer (to bones) up through the hierarchy
            // before we read the animationTarget's final position/rotation/scale.
            object.updateMatrixWorld(true);

            // --- DIAGNOSTIC 2: Transforms during sampling ---
            // console.log(`  -- Sampler: ${object.name} (Frame ${frame}, Time ${time.toFixed(2)}s) - Target Pos:`, animationTarget.position.toArray(), 'Rot:', animationTarget.quaternion.toArray());

            objectKeyframes[frame] = {
                time: time,
                position: animationTarget.position.clone(),
                rotation: animationTarget.quaternion.clone(),
                scale: animationTarget.scale.clone(), 
                interpolation: 'linear'
            };
            // Importantly, native animations from GLB/FBX usually don't have Bezier handles.
            // So we don't add default handle data here. It will rely on graphChannels defaults or 'linear' interpolation.
        });

        // --- DIAGNOSTIC 3: Check if sampled keyframes are actually different ---
        const sampledValues = Object.values(objectKeyframes);
        if (sampledValues.length > 1) {
            const firstKf = sampledValues[0];
            const lastKf = sampledValues[sampledValues.length - 1];
            if (firstKf.position.equals(lastKf.position) && firstKf.rotation.equals(lastKf.rotation) && firstKf.scale.equals(lastKf.scale)) {
                 console.warn(`addObjectToTimeline: All generated keyframes for ${object.name} have IDENTICAL transform data! Mixer might not be affecting animationTarget, or clips are static.`);
            } else {
                 console.log(`addObjectToTimeline: Keyframe data for ${object.name} shows VARIATION, animation data sampled correctly.`);
            }
        } else if (sampledValues.length === 1) {
            console.warn(`addObjectToTimeline: Only ONE keyframe generated for animated model ${object.name}. Expected multiple for animation.`);
        }

        // Reset mixer and target to initial state after sampling is complete
        if (object.userData.mixer) {
            object.userData.mixer.stopAllAction(); // Stop all actions
        }
        animationTarget.position.copy(_tempBoneLocalPosition);
        animationTarget.quaternion.copy(_tempBoneLocalQuaternion);
        animationTarget.scale.copy(_tempBoneLocalScale);
        object.updateMatrixWorld(true); // Final update after reset

        if (Object.keys(objectKeyframes).length > 0) {
            keyframes.set(object.uuid, objectKeyframes);
            console.log(`Ã¢Å“â€¦ Timeline populated for '${object.name}' with ${Object.keys(objectKeyframes).length} complete keyframes.`);
            if (maxClipDuration > timelineDuration) {
                timelineDuration = maxClipDuration;
                initializeTimelineScale();
            }
        }
    } else { // Logic for static models (no native animations)
        if (!keyframes.has(object.uuid) || Object.keys(keyframes.get(object.uuid)).length === 0) {
            console.log(`'${object.name}' is a static model or has no animations. Adding initial keyframe at 0.`);
            const kfData = {
                time: 0,
                position: animationTarget.position.clone(),
                rotation: animationTarget.quaternion.clone(),
                scale: animationTarget.scale.clone(),
                interpolation: currentDefaultInterpolationType
            };

            // Initialize bezier handles for each channel if interpolation is bezier for manually added keyframes
            if (currentDefaultInterpolationType === 'bezier') {
                graphChannels.forEach(channel => {
                    kfData[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
                    kfData[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
                    kfData[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
                    kfData[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
                });
            }
            objectKeyframes[0] = kfData;
            keyframes.set(object.uuid, objectKeyframes);
        }
    }

    updateKeyframesUI();
    updateLayersUI();
}*/ 


/*
!!!!!!!!!!!!! IMPORTANT !!!!!!!!!!
function addObjectToTimeline(object) {
    if (!object || !object.isObject3D || !object.uuid) {
        console.warn("addObjectToTimeline: Invalid object provided.", object);
        return;
    }

    const hasNativeAnimations = object.animations && object.animations.length > 0;
    const objectKeyframes = {};

    // Target bone or root
    let animationTarget = object.getObjectByName('mixamorigHips') || object;
    object.userData.animationTarget = animationTarget;

    // Save bind pose
    _tempBoneLocalPosition.copy(animationTarget.position);
    _tempBoneLocalQuaternion.copy(animationTarget.quaternion);
    _tempBoneLocalScale.copy(animationTarget.scale);

    if (hasNativeAnimations) {
        if (!object.userData.mixer) {
            object.userData.mixer = new THREE.AnimationMixer(object);
        }

        const actions = [];
        object.animations.forEach(clip => {
            const action = object.userData.mixer.clipAction(clip);
            action.play();
            action.paused = false; // natural animation works
            actions.push(action);
        });

        const allTimes = new Set();
        let maxClipDuration = 0;
        object.animations.forEach(clip => {
            clip.tracks.forEach(track => track.times.forEach(t => allTimes.add(t)));
            if (clip.duration > maxClipDuration) maxClipDuration = clip.duration;
        });

        allTimes.add(0);
        allTimes.add(maxClipDuration);
        const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

        sortedTimes.forEach(time => {
            const frame = Math.round(time * fps);

            // Reset pose
            animationTarget.position.copy(_tempBoneLocalPosition);
            animationTarget.quaternion.copy(_tempBoneLocalQuaternion);
            animationTarget.scale.copy(_tempBoneLocalScale);

            object.userData.mixer.setTime(time);
            object.userData.mixer.update(0);
            object.updateMatrixWorld(true);

            // Euler for graph
            const euler = new THREE.Euler().setFromQuaternion(animationTarget.quaternion, 'XYZ');

            const kf = {
                time: time,
                position: animationTarget.position.clone(),
                rotation: animationTarget.quaternion.clone(),
                rotationEuler: { x: euler.x, y: euler.y, z: euler.z },
                scale: animationTarget.scale.clone(),
                interpolation: 'bezier'
            };

            // Bezier handles per channel
            graphChannels.forEach(channel => {
                kf[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
                kf[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
                kf[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
                kf[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
            });

            objectKeyframes[frame] = kf;
        });

        // Store results
        keyframes.set(object.uuid, objectKeyframes);
        if (maxClipDuration > timelineDuration) {
            timelineDuration = maxClipDuration;
            initializeTimelineScale();
        }

    } else {
        // Static model
        const euler = new THREE.Euler().setFromQuaternion(animationTarget.quaternion, 'XYZ');
        const kf = {
            time: 0,
            position: animationTarget.position.clone(),
            rotation: animationTarget.quaternion.clone(),
            rotationEuler: { x: euler.x, y: euler.y, z: euler.z },
            scale: animationTarget.scale.clone(),
            interpolation: currentDefaultInterpolationType
        };
        graphChannels.forEach(channel => {
            kf[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
            kf[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
            kf[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
            kf[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
        });
        objectKeyframes[0] = kf;
        keyframes.set(object.uuid, objectKeyframes);
    }

    updateKeyframesUI();
    updateLayersUI();
}*/ 


// In timeline.js, ensure your `addObjectToTimeline` is this version:
function addObjectToTimeline(object) {
    if (!object || !object.isObject3D || !object.uuid) {
        console.warn("addObjectToTimeline: Invalid object provided.", object);
        return;
    }

    const hasNativeAnimations = object.animations && object.animations.length > 0;
    const objectKeyframes = {};

    // Target bone or root
    let animationTarget = object.getObjectByName('mixamorigHips') || object;
    object.userData.animationTarget = animationTarget;

    // Save bind pose (for resetting during sampling)
    _tempBoneLocalPosition.copy(animationTarget.position);
    _tempBoneLocalQuaternion.copy(animationTarget.quaternion);
    _tempBoneLocalScale.copy(animationTarget.scale);

    if (hasNativeAnimations) {
        if (!object.userData.mixer) {
            object.userData.mixer = new THREE.AnimationMixer(object);
        }

        const actions = [];
        object.animations.forEach(clip => {
            const action = object.userData.mixer.clipAction(clip);
            action.play();
            action.paused = false; // <--- This allows native animation to play by default
            actions.push(action);
        });

        // Collect all unique animation times for sampling
        const allTimes = new Set();
        let maxClipDuration = 0;
        object.animations.forEach(clip => {
            clip.tracks.forEach(track => track.times.forEach(t => allTimes.add(t)));
            if (clip.duration > maxClipDuration) maxClipDuration = clip.duration;
        });

        allTimes.add(0);
        allTimes.add(maxClipDuration);
        const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

        // --- Sampling Loop ---
        sortedTimes.forEach(time => {
            const frame = Math.round(time * fps);

            // Temporarily reset to bind pose before sampling for consistency
            animationTarget.position.copy(_tempBoneLocalPosition);
            animationTarget.quaternion.copy(_tempBoneLocalQuaternion);
            animationTarget.scale.copy(_tempBoneLocalScale);

            // Apply mixer's pose at this specific time for sampling
            object.userData.mixer.setTime(time);
            object.userData.mixer.update(0); // Update with delta=0 to apply the pose immediately
            object.updateMatrixWorld(true);

            // Capture data for keyframe, including Euler for graph editing
            const euler = new THREE.Euler().setFromQuaternion(animationTarget.quaternion, 'XYZ');

            const kf = {
                time: time,
                position: animationTarget.position.clone(),
                rotation: animationTarget.quaternion.clone(),
                rotationEuler: { x: euler.x, y: euler.y, z: euler.z },
                scale: animationTarget.scale.clone(),
                interpolation: 'linear' // Default to linear for imported animations
            };

            // Initialize Bezier handles for each channel
            graphChannels.forEach(channel => {
                kf[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
                kf[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
                kf[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
                kf[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
            });

            objectKeyframes[frame] = kf;
        });

        // Store results in the global keyframes map
        keyframes.set(object.uuid, objectKeyframes);

        // Adjust timeline duration if this animation is longer
        if (maxClipDuration > timelineDuration) {
            timelineDuration = maxClipDuration;
            initializeTimelineScale();
        }

        // --- IMPORTANT: Reset mixer state after sampling but before main loop takes over ---
        object.userData.mixer.setTime(0); // Reset mixer time to 0
        // No need to call mixer.update(0) here, as the initial state will be set by updateSceneFromTimeline
        // or by the first `mixer.setTime(currentTime)` call in the `animate` loop.
        // Actions remain `paused = false` so they are ready to run when `mixer.update(delta)` is called.

    } else {
        // --- Static model (no native animations) logic ---
        // Ensure initial keyframe is added for manual animation
        if (!keyframes.has(object.uuid) || Object.keys(keyframes.get(object.uuid)).length === 0) {
            const euler = new THREE.Euler().setFromQuaternion(animationTarget.quaternion, 'XYZ');
            const kf = {
                time: 0,
                position: animationTarget.position.clone(),
                rotation: animationTarget.quaternion.clone(),
                rotationEuler: { x: euler.x, y: euler.y, z: euler.z },
                scale: animationTarget.scale.clone(),
                interpolation: currentDefaultInterpolationType
            };
            graphChannels.forEach(channel => {
                kf[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
                kf[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
                kf[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
                kf[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
            });
            objectKeyframes[0] = kf;
            keyframes.set(object.uuid, objectKeyframes);
        }
    }

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
        const x_at_u = (1 - u)**3 * P0_time + 3 * (1 - u)**2 * u * C1_time + 3 * (1 - u) * u**2 * C2_time + u**3 * P1_time;
        const dx_du = -3 * (1 - u)**2 * P0_time + 3 * ( (1 - u)**2 - 2 * (1 - u) * u ) * C1_time + 3 * ( 2 * (1 - u) * u - u**2 ) * C2_time + 3 * u**2 * P1_time;

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
    const interpolated_value = (1 - u)**3 * P0_value + 3 * (1 - u)**2 * u * C1_value + 3 * u**2 * (1 - u) * C2_value + u**3 * P1_value;

    return interpolated_value;
}


/**
 * Adds a new keyframe for the currently `selectedObject` at the current `currentTime`.
 */
// --- MODIFIED CODE ---
/*function addKeyframe() {
    if (!selectedObject) {
        console.warn('Cannot add keyframe: No object selected.');
        return;
    }

    const frame = Math.round(currentTime * fps);
    const objectKeyframes = keyframes.get(selectedObject.uuid) || {};

    const animationTarget = selectedObject.userData.animationTarget || selectedObject;
    
    const kfData = {
        time: currentTime,
        position: animationTarget.position.clone(),
        rotation: animationTarget.quaternion.clone(),
        scale: animationTarget.scale.clone(),
        interpolation: currentDefaultInterpolationType
    };

    // Initialize bezier handles for each channel if interpolation is bezier
    // These values are RELATIVE offsets from the keyframe's time and value.
    if (currentDefaultInterpolationType === 'bezier') {
        graphChannels.forEach(channel => {
            kfData[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
            kfData[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
            kfData[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
            kfData[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
        });
    }

    objectKeyframes[frame] = kfData;

    keyframes.set(selectedObject.uuid, objectKeyframes);
    updateKeyframesUI();
    updateLayersUI();
    console.log(`Added keyframe for ${selectedObject.name} at time ${currentTime.toFixed(2)}s (frame ${frame}).`);
}*

function addKeyframe() {
    if (!selectedObject) {
        console.warn('Cannot add keyframe: No object selected.');
        return;
    }

    const frame = Math.round(currentTime * fps);
    const objectKeyframes = keyframes.get(selectedObject.uuid) || {};

    const animationTarget = selectedObject.userData.animationTarget || selectedObject;
    
    // For rotation, capture Euler angles so that 'Roll', 'Pitch', 'Yaw' values are explicit
    const currentEulerRotation = new THREE.Euler().setFromQuaternion(animationTarget.quaternion, 'XYZ');

    const kfData = {
        time: currentTime,
        position: animationTarget.position.clone(),
        // Store the original quaternion but also make Euler components available for graph
        rotation: animationTarget.quaternion.clone(),
        rotationEuler: { x: currentEulerRotation.x, y: currentEulerRotation.y, z: currentEulerRotation.z },
        scale: animationTarget.scale.clone(),
        interpolation: currentDefaultInterpolationType
    };

    // Initialize bezier handles for EACH channel
    // These values are RELATIVE offsets from the keyframe's time and value.
    graphChannels.forEach(channel => {
        kfData[`handleIn_${channel.name}_x`] = -DEFAULT_BEZIER_HANDLE_X_OFFSET;
        kfData[`handleIn_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
        kfData[`handleOut_${channel.name}_x`] = DEFAULT_BEZIER_HANDLE_X_OFFSET;
        kfData[`handleOut_${channel.name}_y`] = DEFAULT_BEZIER_HANDLE_Y_OFFSET;
    });

    objectKeyframes[frame] = kfData;

    keyframes.set(selectedObject.uuid, objectKeyframes);
    updateKeyframesUI();
    updateLayersUI(); // Update layers just in case something changed (e.g. new object)
    console.log(`Added keyframe for ${selectedObject.name} at time ${currentTime.toFixed(2)}s (frame ${frame}).`);
}*/ 

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
        const owner = findSkinnedMeshOwner(selectedBone) || selectedObject;
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
    // updateLayersUI(); // You might not need to update layers on every keyframe add
    if (typeof updateHierarchy === 'function') updateHierarchy();
}



// --- END MODIFIED CODE ---

/**
 * Deletes the currently `selectedKeyframe` from the timeline.
 *
function deleteKeyframe() {
    if (selectedKeyframes.length === 0) { // Check if multiple or single keyframes are selected
        console.warn('Cannot delete keyframe(s): No keyframe(s) selected.');
        return;
    }

    const keyframesToDelete = [...selectedKeyframes]; // Work on a copy

    keyframesToDelete.forEach(kfEl => {
        const frame = parseInt(kfEl.dataset.frame, 10);
        const uuid = kfEl.dataset.uuid;

        const objectKeyframes = keyframes.get(uuid);

        if (objectKeyframes && objectKeyframes[frame]) {
            delete objectKeyframes[frame]; // Remove data
            kfEl.remove();               // Remove DOM element
            // No longer filtering `selectedKeyframes` here; we clear it after loop.

            // If object has no more keyframes, remove its entry from global map and update layers UI
            if (Object.keys(objectKeyframes).length === 0) {
                keyframes.delete(uuid);
                // Also remove the object from transformControls if it was attached.
                if (selectedObject && selectedObject.uuid === uuid) {
                    if (typeof transformControls !== 'undefined') {
                        transformControls.detach(); // Detach controls
                        selectedObject = null; // Clear global selected object
                    }
                }
            }
        }
    });

  

    selectedKeyframes = []; // Clear multi-selection array
    selectedKeyframe = null; // Clear single selection reference

    updateKeyframesUI(); // Full redraw to refresh (and remove empty tracks if needed)
    updateLayersUI();    // To update if any tracks were removed entirely
    updateSceneFromTimeline(); // Ensure scene state is consistent after deletion
    console.log(`Deleted ${keyframesToDelete.length} keyframe(s).`);
}*/ 

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
        }
    });
  
    selectedKeyframes = [];
    selectedKeyframe = null;

    updateKeyframesUI();
    updateSceneFromTimeline();
    console.log(`Deleted selected keyframe(s).`);
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
/*
function updateSceneFromTimeline() {
    const currentFrame = Math.round(currentTime * fps);

    scene.traverse((object) => {
        if (!object.isObject3D || !object.uuid) return;
        if (typeof pathAnimator !== 'undefined' && pathAnimator && pathAnimator.animatingObjects && pathAnimator.animatingObjects.has(object)) {
             return;
        }

        const objectKeyframes = keyframes.get(object.uuid);
        if (!objectKeyframes || Object.keys(objectKeyframes).length === 0) {
            return;
        }

        const animationTarget = object.userData.animationTarget;
        if (!animationTarget) {
            console.warn(`updateSceneFromTimeline: No animation target found in userData for object ${object.name}. Skipping update.`);
            return;
        }

        const frames = Object.keys(objectKeyframes).map(Number).sort((a, b) => a - b);
        if (frames.length === 0) return;

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
} */ 

function updateSceneFromTimeline() {
    const currentFrame = Math.round(currentTime * fps);

    scene.traverse((object) => {
        if (!object.isObject3D || !object.uuid) return;
        
        // --- Layer 1: Apply native mixer animation as the base pose ---
        // We set the time directly for perfect sync with scrubbing.
        const mixer = object.userData?.mixer;
        if (mixer) {
            mixer.setTime(currentTime);
            mixer.update(0); // Delta of 0 applies the pose without advancing time
        }

        // --- Layer 2: Apply custom BONE keyframe overrides ---
        const objBoneKeyframes = boneKeyframes.get(object.uuid);
        if (objBoneKeyframes) {
            objBoneKeyframes.forEach((boneKfMap, boneName) => {
                const bone = object.getObjectByName(boneName);
                if (!bone) return;
                
                interpolateAndApply(bone, boneKfMap, currentFrame);
            });
        }
        
        // --- Layer 3: Apply custom ROOT OBJECT keyframe overrides ---
        const objectKeyframes = keyframes.get(object.uuid);
        if (objectKeyframes) {
            const animationTarget = object.userData.animationTarget || object;
            interpolateAndApply(animationTarget, objectKeyframes, currentFrame);
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

/**
 * Applies the transform properties from a `keyframe` to the object's designated `animationTarget`.
 *
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
}*/ 

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

/**
 * Interpolates the transform properties between two keyframes for an object's `animationTarget`.
 *
// --- MODIFIED CODE (Just added a comment about full Bezier integration) ---
function interpolateKeyframe(object, startKfData, endKfData, t) {
    if (!object || !startKfData || !endKfData) return;

    const animationTarget = object.userData.animationTarget;
    if (!animationTarget) {
        console.warn(`interpolateKeyframe: No animation target found in userData for object ${object.name}. Cannot interpolate.`);
        return;
    }

    const interpolationType = startKfData.interpolation || currentDefaultInterpolationType;
    const clampedT = Math.max(0, Math.min(1, t));

    switch (interpolationType) {
        case 'constant':
            animationTarget.position.copy(startKfData.position);
            animationTarget.quaternion.copy(startKfData.rotation);
            animationTarget.scale.copy(startKfData.scale);
            break;

        case 'linear':
            animationTarget.position.lerpVectors(startKfData.position, endKfData.position, clampedT);
            animationTarget.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, clampedT);
            animationTarget.scale.lerpVectors(startKfData.scale, endKfData.scale, clampedT);
            break;

        case 'bezier':
        default:
            // Current 'bezier' interpolation uses smoothstep as a visual approximation.
            // Implementing true 3D Bezier interpolation driven by the 2D graph handles for each component
            // (position.x, position.y, etc.) requires more complex math to combine the component curves
            // back into a Vector3 or Quaternion, especially for rotations.
            // For now, this provides a smooth ease-in/ease-out transition.
            const smoothedT = clampedT * clampedT * (3 - 2 * clampedT);
            animationTarget.position.lerpVectors(startKfData.position, endKfData.position, smoothedT);
            animationTarget.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, smoothedT);
            animationTarget.scale.lerpVectors(startKfData.scale, endKfData.scale, smoothedT);
            break;
    }
}*

function interpolateKeyframe(object, startKfData, endKfData, t) {
    if (!object || !startKfData || !endKfData) return;

    const animationTarget = object.userData.animationTarget;
    if (!animationTarget) {
        console.warn(`interpolateKeyframe: No animation target found in userData for object ${object.name}. Cannot interpolate.`);
        return;
    }

    const interpolationType = startKfData.interpolation || currentDefaultInterpolationType;
    const clampedT = Math.max(0, Math.min(1, t));

    switch (interpolationType) {
        case 'constant':
            animationTarget.position.copy(startKfData.position);
            animationTarget.quaternion.copy(startKfData.rotation);
            animationTarget.scale.copy(startKfData.scale);
            break;

        case 'linear':
            animationTarget.position.lerpVectors(startKfData.position, endKfData.position, clampedT);
            animationTarget.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, clampedT);
            animationTarget.scale.lerpVectors(startKfData.scale, endKfData.scale, clampedT);
            break;

        case 'bezier':
        default:
            const smoothedT = clampedT * clampedT * (3 - 2 * clampedT);
            animationTarget.position.lerpVectors(startKfData.position, endKfData.position, smoothedT);
            animationTarget.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, smoothedT);
            animationTarget.scale.lerpVectors(startKfData.scale, endKfData.scale, smoothedT);
            break;
    }
}** 


function interpolateKeyframe(object, startKfData, endKfData, t) {
    if (!object || !startKfData || !endKfData) return;

    const animationTarget = object.userData.animationTarget;
    if (!animationTarget) {
        console.warn(`interpolateKeyframe: No animation target found in userData for object ${object.name}. Cannot interpolate.`);
        return;
    }

    const interpolationType = startKfData.interpolation || currentDefaultInterpolationType;
    const clampedT = Math.max(0, Math.min(1, t)); // Ensure t is between 0 and 1 for interpolation

    switch (interpolationType) {
        case 'constant':
            animationTarget.position.copy(startKfData.position);
            animationTarget.quaternion.copy(startKfData.rotation);
            animationTarget.scale.copy(startKfData.scale);
            break;

        case 'linear':
            animationTarget.position.lerpVectors(startKfData.position, endKfData.position, clampedT);
            animationTarget.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, clampedT);
            animationTarget.scale.lerpVectors(startKfData.scale, endKfData.scale, clampedT);
            break;

        case 'bezier':
        default:
            // --- Position Interpolation (Component-wise Bezier) ---
            const pos_x = interpolateBezierComponent(
                clampedT,
                startKfData.position.x, startKfData[`handleOut_position.x_x`], startKfData[`handleOut_position.x_y`],
                endKfData.position.x, endKfData[`handleIn_position.x_x`], endKfData[`handleIn_position.x_y`],
                startKfData.time, endKfData.time
            );
            const pos_y = interpolateBezierComponent(
                clampedT,
                startKfData.position.y, startKfData[`handleOut_position.y_x`], startKfData[`handleOut_position.y_y`],
                endKfData.position.y, endKfData[`handleIn_position.y_x`], endKfData[`handleIn_position.y_y`],
                startKfData.time, endKfData.time
            );
            const pos_z = interpolateBezierComponent(
                clampedT,
                startKfData.position.z, startKfData[`handleOut_position.z_x`], startKfData[`handleOut_position.z_y`],
                endKfData.position.z, endKfData[`handleIn_position.z_x`], endKfData[`handleIn_position.z_y`],
                startKfData.time, endKfData.time
            );
            animationTarget.position.set(pos_x, pos_y, pos_z);

            // --- Rotation Interpolation (Slerp) ---
            // As discussed, slerp is generally preferred for rotations.
            // If the graph editor modifies rotation.x/y/z directly, it's typically working with Euler angles,
            // which would then need to be converted to quaternions. For current simplicity, slerp remains.
            animationTarget.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, clampedT);

            // --- Scale Interpolation (Component-wise Bezier) ---
            const scale_x = interpolateBezierComponent(
                clampedT,
                startKfData.scale.x, startKfData[`handleOut_scale.x_x`], startKfData[`handleOut_scale.x_y`],
                endKfData.scale.x, endKfData[`handleIn_scale.x_x`], endKfData[`handleIn_scale.x_y`],
                startKfData.time, endKfData.time
            );
            const scale_y = interpolateBezierComponent(
                clampedT,
                startKfData.scale.y, startKfData[`handleOut_scale.y_x`], startKfData[`handleOut_scale.y_y`],
                endKfData.scale.y, endKfData[`handleIn_scale.y_x`], endKfData[`handleIn_scale.y_y`],
                startKfData.time, endKfData.time
            );
            const scale_z = interpolateBezierComponent(
                clampedT,
                startKfData.scale.z, startKfData[`handleOut_scale.z_x`], startKfData[`handleOut_scale.z_y`],
                endKfData.scale.z, endKfData[`handleIn_scale.z_x`], endKfData[`handleIn_scale.z_y`],
                startKfData.time, endKfData.time
            );
            animationTarget.scale.set(scale_x, scale_y, scale_z);
            break;
    }
}***

function interpolateKeyframe(object, startKfData, endKfData, t) {
    if (!object || !startKfData || !endKfData) return;

    const animationTarget = object.userData.animationTarget;
    if (!animationTarget) {
        console.warn(`interpolateKeyframe: No animation target found in userData for object ${object.name}. Cannot interpolate.`);
        return;
    }

    const interpolationType = startKfData.interpolation || currentDefaultInterpolationType;
    const clampedT = Math.max(0, Math.min(1, t));

    // Get absolute times for Bezier interpolation
    const startAbsTime = startKfData.time;
    const endAbsTime = endKfData.time;

    // Helper to get channel-specific handle data (X coord for time-offset)
    const getHandle = (kf, channelName, type, coord) => {
        return kf[`handle${type}_${channelName}_${coord}`] !== undefined ? kf[`handle${type}_${channelName}_${coord}`] : 
               (type === 'In' ? -DEFAULT_BEZIER_HANDLE_X_OFFSET : DEFAULT_BEZIER_HANDLE_X_OFFSET);
    };
    
    // Helper to get channel-specific handle data (Y coord for value-offset)
    const getHandleY = (kf, channelName, type) => {
        return kf[`handle${type}_${channelName}_y`] !== undefined ? kf[`handle${type}_${channelName}_y`] : DEFAULT_BEZIER_HANDLE_Y_OFFSET;
    }


    switch (interpolationType) {
        case 'constant':
            animationTarget.position.copy(startKfData.position);
            animationTarget.quaternion.copy(startKfData.rotation); // Use stored Quaternion directly
            animationTarget.scale.copy(startKfData.scale);
            break;

        case 'linear':
            animationTarget.position.lerpVectors(startKfData.position, endKfData.position, clampedT);
            animationTarget.quaternion.slerpQuaternions(startKfData.rotation, endKfData.rotation, clampedT); // Slerp Quaternions
            animationTarget.scale.lerpVectors(startKfData.scale, endKfData.scale, clampedT);
            break;

        case 'bezier':
        default: // Also acts as default for 'bezier' if interpolation is undefined
            // --- Position Interpolation (Component-wise Bezier) ---
            const pos_x = interpolateBezierComponent(
                clampedT,
                startKfData.position.x, getHandle(startKfData, 'position.x', 'Out', 'x'), getHandleY(startKfData, 'position.x', 'Out'),
                endKfData.position.x, getHandle(endKfData, 'position.x', 'In', 'x'), getHandleY(endKfData, 'position.x', 'In'),
                startAbsTime, endAbsTime
            );
            const pos_y = interpolateBezierComponent(
                clampedT,
                startKfData.position.y, getHandle(startKfData, 'position.y', 'Out', 'x'), getHandleY(startKfData, 'position.y', 'Out'),
                endKfData.position.y, getHandle(endKfData, 'position.y', 'In', 'x'), getHandleY(endKfData, 'position.y', 'In'),
                startAbsTime, endAbsTime
            );
            const pos_z = interpolateBezierComponent(
                clampedT,
                startKfData.position.z, getHandle(startKfData, 'position.z', 'Out', 'x'), getHandleY(startKfData, 'position.z', 'Out'),
                endKfData.position.z, getHandle(endKfData, 'position.z', 'In', 'x'), getHandleY(endKfData, 'position.z', 'In'),
                startAbsTime, endAbsTime
            );
            animationTarget.position.set(pos_x, pos_y, pos_z);

            // --- Rotation Interpolation (Component-wise Bezier for Euler angles, then convert to Quaternion) ---
            // This is the correct way to get Bezier curve control over Euler rotation components.
            const rot_x = interpolateBezierComponent(
                clampedT,
                startKfData.rotationEuler.x, getHandle(startKfData, 'rotation.x', 'Out', 'x'), getHandleY(startKfData, 'rotation.x', 'Out'),
                endKfData.rotationEuler.x, getHandle(endKfData, 'rotation.x', 'In', 'x'), getHandleY(endKfData, 'rotation.x', 'In'),
                startAbsTime, endAbsTime
            );
            const rot_y = interpolateBezierComponent(
                clampedT,
                startKfData.rotationEuler.y, getHandle(startKfData, 'rotation.y', 'Out', 'x'), getHandleY(startKfData, 'rotation.y', 'Out'),
                endKfData.rotationEuler.y, getHandle(endKfData, 'rotation.y', 'In', 'x'), getHandleY(endKfData, 'rotation.y', 'In'),
                startAbsTime, endAbsTime
            );
            const rot_z = interpolateBezierComponent(
                clampedT,
                startKfData.rotationEuler.z, getHandle(startKfData, 'rotation.z', 'Out', 'x'), getHandleY(startKfData, 'rotation.z', 'Out'),
                endKfData.rotationEuler.z, getHandle(endKfData, 'rotation.z', 'In', 'x'), getHandleY(endKfData, 'rotation.z', 'In'),
                startAbsTime, endAbsTime
            );
            // Convert the interpolated Euler angles back to a Quaternion (order 'XYZ' should match how it was stored)
            animationTarget.quaternion.setFromEuler(new THREE.Euler(rot_x, rot_y, rot_z, 'XYZ'));

            // --- Scale Interpolation (Component-wise Bezier) ---
            const scale_x = interpolateBezierComponent(
                clampedT,
                startKfData.scale.x, getHandle(startKfData, 'scale.x', 'Out', 'x'), getHandleY(startKfData, 'scale.x', 'Out'),
                endKfData.scale.x, getHandle(endKfData, 'scale.x', 'In', 'x'), getHandleY(endKfData, 'scale.x', 'In'),
                startAbsTime, endAbsTime
            );
            const scale_y = interpolateBezierComponent(
                clampedT,
                startKfData.scale.y, getHandle(startKfData, 'scale.y', 'Out', 'x'), getHandleY(startKfData, 'scale.y', 'Out'),
                endKfData.scale.y, getHandle(endKfData, 'scale.y', 'In', 'x'), getHandleY(endKfData, 'scale.y', 'In'),
                startAbsTime, endAbsTime
            );
            const scale_z = interpolateBezierComponent(
                clampedT,
                startKfData.scale.z, getHandle(startKfData, 'scale.z', 'Out', 'x'), getHandleY(startKfData, 'scale.z', 'Out'),
                endKfData.scale.z, getHandle(endKfData, 'scale.z', 'In', 'x'), getHandleY(endKfData, 'scale.z', 'In'),
                startAbsTime, endAbsTime
            );
            animationTarget.scale.set(scale_x, scale_y, scale_z);
            break;
    }
}
// --- END MODIFIED CODE ---
*/ 

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
            const pos_x = interpolateBezierComponent(clampedT, startKfData.position.x, getHandle(startKfData, 'position.x', 'Out', 'x'), getHandleY(startKfData, 'position.x', 'Out'), endKfData.position.x, getHandle(endKfData, 'position.x', 'In', 'x'), getHandleY(endKfData, 'position.x', 'In'), startAbsTime, endAbsTime);
            const pos_y = interpolateBezierComponent(clampedT, startKfData.position.y, getHandle(startKfData, 'position.y', 'Out', 'x'), getHandleY(startKfData, 'position.y', 'Out'), endKfData.position.y, getHandle(endKfData, 'position.y', 'In', 'x'), getHandleY(endKfData, 'position.y', 'In'), startAbsTime, endAbsTime);
            const pos_z = interpolateBezierComponent(clampedT, startKfData.position.z, getHandle(startKfData, 'position.z', 'Out', 'x'), getHandleY(startKfData, 'position.z', 'Out'), endKfData.position.z, getHandle(endKfData, 'position.z', 'In', 'x'), getHandleY(endKfData, 'position.z', 'In'), startAbsTime, endAbsTime);
            targetObject.position.set(pos_x, pos_y, pos_z);
            const rot_x = interpolateBezierComponent(clampedT, startKfData.rotationEuler.x, getHandle(startKfData, 'rotation.x', 'Out', 'x'), getHandleY(startKfData, 'rotation.x', 'Out'), endKfData.rotationEuler.x, getHandle(endKfData, 'rotation.x', 'In', 'x'), getHandleY(endKfData, 'rotation.x', 'In'), startAbsTime, endAbsTime);
            const rot_y = interpolateBezierComponent(clampedT, startKfData.rotationEuler.y, getHandle(startKfData, 'rotation.y', 'Out', 'x'), getHandleY(startKfData, 'rotation.y', 'Out'), endKfData.rotationEuler.y, getHandle(endKfData, 'rotation.y', 'In', 'x'), getHandleY(endKfData, 'rotation.y', 'In'), startAbsTime, endAbsTime);
            const rot_z = interpolateBezierComponent(clampedT, startKfData.rotationEuler.z, getHandle(startKfData, 'rotation.z', 'Out', 'x'), getHandleY(startKfData, 'rotation.z', 'Out'), endKfData.rotationEuler.z, getHandle(endKfData, 'rotation.z', 'In', 'x'), getHandleY(endKfData, 'rotation.z', 'In'), startAbsTime, endAbsTime);
            targetObject.quaternion.setFromEuler(new THREE.Euler(rot_x, rot_y, rot_z, 'XYZ'));
            const scale_x = interpolateBezierComponent(clampedT, startKfData.scale.x, getHandle(startKfData, 'scale.x', 'Out', 'x'), getHandleY(startKfData, 'scale.x', 'Out'), endKfData.scale.x, getHandle(endKfData, 'scale.x', 'In', 'x'), getHandleY(endKfData, 'scale.x', 'In'), startAbsTime, endAbsTime);
            const scale_y = interpolateBezierComponent(clampedT, startKfData.scale.y, getHandle(startKfData, 'scale.y', 'Out', 'x'), getHandleY(startKfData, 'scale.y', 'Out'), endKfData.scale.y, getHandle(endKfData, 'scale.y', 'In', 'x'), getHandleY(endKfData, 'scale.y', 'In'), startAbsTime, endAbsTime);
            const scale_z = interpolateBezierComponent(clampedT, startKfData.scale.z, getHandle(startKfData, 'scale.z', 'Out', 'x'), getHandleY(startKfData, 'scale.z', 'Out'), endKfData.scale.z, getHandle(endKfData, 'scale.z', 'In', 'x'), getHandleY(endKfData, 'scale.z', 'In'), startAbsTime, endAbsTime);
            targetObject.scale.set(scale_x, scale_y, scale_z);
            break;
    }
}

// --- UI Update Functions (using your globals and local consts for DOM elements) ---
/*function updateLayersUI() {
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
            // 1. Clear 'selected' class and custom random color from all previous layers/tracks
            document.querySelectorAll('.layer-item.selected').forEach(el => el.classList.remove('selected'));
            const prevSelectedTrackRow = document.querySelector('.timeline-track-row.selected-object-track');
            if (prevSelectedTrackRow) {
                // Clear the inline CSS variable for the old selected track row
                prevSelectedTrackRow.style.removeProperty('--selected-track-random-color');
                prevSelectedTrackRow.classList.remove('selected-object-track');
            }
            // Clear the selectedTrackColor from the previous selected object's userData
            if (selectedObject && selectedObject.userData && selectedObject.userData.selectedTrackColor) {
                delete selectedObject.userData.selectedTrackColor;
            }

            // 2. Select the current layer
            layer.classList.add('selected');

            selectedGraphKeyframe = null;
            selectedGraphHandle = null;

            // 3. Set the global selected object
            selectedObject = object;
            if (typeof transformControls !== 'undefined') {
                transformControls.attach(object);
            }

            // 4. Generate and store a random color for the newly selected object's track
            if (!object.userData.selectedTrackColor) { // Generate only if not already present
                object.userData.selectedTrackColor = generateRandomSubtleBackgroundColor();
            }

            // 5. Update UI. `updateKeyframesUI` will now apply this color.
            updateKeyframesUI();
            if (isGraphView) {
                renderGraph();
            }
        });

        layersList.appendChild(layer);
    });
}*

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
            // 1. Clear 'selected' class and custom random color from all previous layers/tracks
            document.querySelectorAll('.layer-item.selected').forEach(el => el.classList.remove('selected'));
            const prevSelectedTrackRow = document.querySelector('.timeline-track-row.selected-object-track');
            if (prevSelectedTrackRow) {
                // Clear the inline CSS variable for the old selected track row
                prevSelectedTrackRow.style.removeProperty('--selected-track-random-color');
                prevSelectedTrackRow.classList.remove('selected-object-track');
            }
            // Clear the selectedTrackColor from the previous selected object's userData
            if (selectedObject && selectedObject.userData && selectedObject.userData.selectedTrackColor) {
                delete selectedObject.userData.selectedTrackColor;
            }

            // 2. Select the current layer
            layer.classList.add('selected');

            // 3. Set the global selected object
            selectedObject = object;
            if (typeof transformControls !== 'undefined') {
                transformControls.attach(object);
            }

            // --- START MODIFIED SECTION: Graph Editor Selection Cleanup ---
            // Clear any active keyframe/handle selection in the Graph Editor
            selectedGraphKeyframe = null;
            selectedGraphHandle = null;
            // --- END MODIFIED SECTION ---

            // 4. Generate and store a random color for the newly selected object's track
            if (!object.userData.selectedTrackColor) { // Generate only if not already present
                object.userData.selectedTrackColor = generateRandomSubtleBackgroundColor();
            }

            // 5. Update UI. `updateKeyframesUI` will now apply this color.
            updateKeyframesUI();

            // --- START MODIFIED SECTION: Re-render Graph Editor if visible ---
            // If the graph editor is currently visible, ensure it re-renders to
            // reflect the new object's channels and cleared selections.
            if (isGraphView) {
                renderGraph();
            }
            // --- END MODIFIED SECTION ---
        });

        layersList.appendChild(layer);
    });
}**/

function updateLayersUI() {
    const layersList = document.getElementById('layers-list');
    layersList.innerHTML = ''; // Clear and rebuild all layers

    keyframes.forEach((_, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;

        // Create the top-level object item
        const objectItem = document.createElement('div');
        objectItem.className = 'layer-item object-item';
        objectItem.dataset.uuid = uuid;
        objectItem.innerHTML = `
            <i class="fas fa-caret-right expand-icon"></i>
            <span class="object-name">${object.name || `Object ${uuid.slice(0, 8)}`}</span>
        `;
        
        // Ensure expanded state is initialized for this object
        if (!expandedHierarchyNodes.has(uuid)) {
            expandedHierarchyNodes.set(uuid, new Map());
        }
        const objectExpandedState = expandedHierarchyNodes.get(uuid);

        if (selectedObject && selectedObject.uuid === uuid) {
            objectItem.classList.add('selected');
        }

        // --- Event Listener for Selecting the Object itself ---
        objectItem.querySelector('.object-name').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent toggling expansion
            handleLayerItemClick(objectItem, object);
        });

        // --- Event Listener for Toggling Expansion ---
        const expandIcon = objectItem.querySelector('.expand-icon');
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'layer-children';
        objectItem.appendChild(childrenContainer); // Add container early for recursive calls

        expandIcon.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent selecting the object when clicking expand icon
            const isExpanded = objectExpandedState.get(objectItem.dataset.uuid + '_' + objectItem.className.split(' ')[0]); // Use object-item class to distinguish
            if (isExpanded) {
                expandIcon.classList.replace('fa-caret-down', 'fa-caret-right');
                childrenContainer.style.display = 'none';
                objectExpandedState.set(objectItem.dataset.uuid + '_' + objectItem.className.split(' ')[0], false);
            } else {
                expandIcon.classList.replace('fa-caret-right', 'fa-caret-down');
                childrenContainer.style.display = 'block';
                objectExpandedState.set(objectItem.dataset.uuid + '_' + objectItem.className.split(' ')[0], true);
            }
        });

        // Recursively build the hierarchy for this object
        buildHierarchy(childrenContainer, CHANNEL_HIERARCHY_DEFINITION, uuid, 1, objectExpandedState, object);

        // Apply initial expansion state
        const isObjectExpanded = objectExpandedState.get(objectItem.dataset.uuid + '_' + objectItem.className.split(' ')[0]);
        if (isObjectExpanded) {
            expandIcon.classList.replace('fa-caret-right', 'fa-caret-down');
            childrenContainer.style.display = 'block';
        } else {
            expandIcon.classList.replace('fa-caret-down', 'fa-caret-right');
            childrenContainer.style.display = 'none';
        }

        layersList.appendChild(objectItem);
    });
}


/**
 * Recursive function to build the nested hierarchy for object channels.
 * @param {HTMLElement} parentElement The DOM element to append children to.
 * @param {Array} definition The `CHANNEL_HIERARCHY_DEFINITION` or a sub-array.
 * @param {string} objectUuid The UUID of the current selected object.
 * @param {number} level Current indentation level.
 * @param {Map} objectExpandedState The map storing expanded state for the current object.
 * @param {THREE.Object3D} threeObject The actual Three.js object.
 */
function buildHierarchy(parentElement, definition, objectUuid, level, objectExpandedState, threeObject) {
    definition.forEach(node => {
        const nodeItem = document.createElement('div');
        nodeItem.className = `layer-item layer-level-${level} ${node.type}-group`; // Add type for styling
        nodeItem.dataset.name = node.name; // Store node name for state tracking
        nodeItem.dataset.objectUuid = objectUuid;

        const paddingLeft = (level * 15) + 'px'; // Indent children
        nodeItem.style.paddingLeft = paddingLeft;

        if (node.type === 'group') {
            const expandIcon = document.createElement('i');
            expandIcon.className = 'fas fa-caret-right expand-icon';
            nodeItem.appendChild(expandIcon);
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = node.name;
            nodeItem.appendChild(nameSpan);

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'layer-children';
            nodeItem.appendChild(childrenContainer); // Add container early for recursive calls

            // Unique key for tracking expanded state (e.g., "objectUuid_Transform_Location")
            const stateKey = `${objectUuid}_${node.name}`;
            
            // Add click listener for toggling expansion
            expandIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = objectExpandedState.get(stateKey);
                if (isExpanded) {
                    expandIcon.classList.replace('fa-caret-down', 'fa-caret-right');
                    childrenContainer.style.display = 'none';
                    objectExpandedState.set(stateKey, false);
                } else {
                    expandIcon.classList.replace('fa-caret-right', 'fa-caret-down');
                    childrenContainer.style.display = 'block';
                    objectExpandedState.set(stateKey, true);
                }
            });

            // Recursively build children
            if (node.children) {
                buildHierarchy(childrenContainer, node.children, objectUuid, level + 1, objectExpandedState, threeObject);
            }
            if (node.channels) {
                buildHierarchy(childrenContainer, node.channels, objectUuid, level + 1, objectExpandedState, threeObject);
            }

            // Apply initial expansion state
            const isNodeExpanded = objectExpandedState.get(stateKey);
            if (isNodeExpanded) {
                expandIcon.classList.replace('fa-caret-right', 'fa-caret-down');
                childrenContainer.style.display = 'block';
            } else {
                expandIcon.classList.replace('fa-caret-down', 'fa-caret-right');
                childrenContainer.style.display = 'none';
            }

        } else if (node.name.startsWith('position.') || node.name.startsWith('rotation.') || node.name.startsWith('scale.')) {
            // This is an individual animation channel (e.g., position.x, rotation.y)
            nodeItem.classList.add('channel-item');
            nodeItem.dataset.channelName = node.name; // Store full channel name
            nodeItem.dataset.channelColor = node.color; // Store color

            const colorSquare = document.createElement('span');
            colorSquare.className = 'channel-color-square';
            colorSquare.style.backgroundColor = node.color;
            nodeItem.appendChild(colorSquare);

            const labelSpan = document.createElement('span');
            labelSpan.textContent = node.label;
            nodeItem.appendChild(labelSpan);

            // Add active class if this is the currently selected graph channel
            if (selectedGraphChannel === node.name) {
                nodeItem.classList.add('active');
            }

            // Click listener for selecting a specific channel
            nodeItem.addEventListener('click', (e) => {
                e.stopPropagation(); // Stop event from bubbling up to parent groups
                
                // If already selected, do nothing
                if (nodeItem.classList.contains('active')) return;

                // Clear previous channel selections
                document.querySelectorAll('.channel-item.active').forEach(el => el.classList.remove('active'));
                
                // Select this channel
                nodeItem.classList.add('active');
                selectedGraphChannel = node.name;
                selectedGraphKeyframe = null; // Deselect keyframe when changing channel
                selectedGraphHandle = null;   // Deselect handle
                
                // Make sure the object this channel belongs to is also selected
                if (selectedObject && selectedObject.uuid !== objectUuid) {
                    handleLayerItemClick(document.querySelector(`.layer-item.object-item[data-uuid="${objectUuid}"]`), threeObject);
                } else if (!selectedObject) {
                     // If no object was selected, select it now.
                     handleLayerItemClick(document.querySelector(`.layer-item.object-item[data-uuid="${objectUuid}"]`), threeObject);
                }

                if (isGraphView) {
                    renderGraph();
                }
            });
        }
        parentElement.appendChild(nodeItem);
    });
}


// --- Helper function for handling object item clicks (replaces repetitive logic) ---
/* function handleLayerItemClick(clickedLayerItem, object) {
    // 1. Clear 'selected' class and custom random color from all previous layers/tracks
    document.querySelectorAll('.layer-item.selected').forEach(el => el.classList.remove('selected'));
    const prevSelectedTrackRow = document.querySelector('.timeline-track-row.selected-object-track');
    if (prevSelectedTrackRow) {
        prevSelectedTrackRow.style.removeProperty('--selected-track-random-color');
        prevSelectedTrackRow.classList.remove('selected-object-track');
    }
    if (selectedObject && selectedObject.userData && selectedObject.userData.selectedTrackColor) {
        delete selectedObject.userData.selectedTrackColor;
    }

    // 2. Select the current layer item (object)
    clickedLayerItem.classList.add('selected');

    // 3. Set the global selected object
    selectedObject = object;
    if (typeof transformControls !== 'undefined') {
        transformControls.attach(object);
    }

    // Clear any active keyframe/handle selection in the Graph Editor
    selectedGraphKeyframe = null;
    selectedGraphHandle = null;

    // 4. Generate and store a random color for the newly selected object's track
    if (!object.userData.selectedTrackColor) {
        object.userData.selectedTrackColor = generateRandomSubtleBackgroundColor();
    }

    // 5. Update UI. `updateKeyframesUI` will now apply this color.
    updateKeyframesUI();

    // If the graph editor is currently visible, ensure it re-renders to
    // reflect the new object's channels and cleared selections.
    if (isGraphView) {
        renderGraph();
    }
}*/

/*function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    keyframesContainer.innerHTML = ''; // Clear and rebuild is simpler for now

    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;

        const trackRow = document.createElement('div');
        trackRow.className = 'timeline-track-row';
        trackRow.dataset.uuid = uuid;

        if (selectedObject && selectedObject.uuid === uuid) {
            trackRow.classList.add('selected-object-track');
            // Apply the random color stored in userData as an inline CSS variable
            if (object.userData.selectedTrackColor) {
                trackRow.style.setProperty('--selected-track-random-color', object.userData.selectedTrackColor);
            }
        }

        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframeEl = document.createElement('div');
            keyframeEl.className = 'keyframe';
            keyframeEl.dataset.frame = frame;
            keyframeEl.dataset.uuid = uuid;
            // --- MODIFIED CODE ---
            keyframeEl.dataset.time = data.time; // Store time for easier lookup in selectKeyframe
            // --- END MODIFIED CODE ---

            // Position based on virtual width
            const leftPx = (data.time / timelineDuration) * totalVirtualWidth;
            keyframeEl.style.left = `${leftPx}px`; // Directly set pixel position
            keyframeEl.title = `Keyframe for: ${object.name}\nFrame: ${frame} (Time: ${data.time.toFixed(2)}s)\nType: ${data.interpolation || 'linear'}`;

            if (selectedKeyframe && selectedKeyframe.dataset.frame === frame && selectedKeyframe.dataset.uuid === uuid) {
                keyframeEl.classList.add('selected');
            }

            keyframeEl.addEventListener('mousedown', (e) => {
                isDraggingKeyframe = true;
                draggedKeyframe = keyframeEl;
                dragKeyframeStartClientX = e.clientX;
                dragKeyframeStartLeftPx = leftPx;
                dragKeyframeOriginalTime = data.time;
                dragKeyframeOriginalUuid = uuid;
                dragKeyframeOriginalFrame = parseInt(frame, 10);
                dragKeyframeOriginalData = JSON.parse(JSON.stringify(data));

                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';

                selectKeyframe(keyframeEl, e); // Pass event to handle multi-selection modifiers

                e.stopPropagation();
            });

            trackRow.appendChild(keyframeEl);
        });

        keyframesContainer.appendChild(trackRow);
    });
    keyframeLinesSvg.style.height = `${timelineContent.scrollHeight || timeline.clientHeight}px`;
    // --- MODIFIED CODE ---
    if (isGraphView) {
        renderGraph(); // Ensure graph redraws if keyframes change while graph is open
    }
    // --- END MODIFIED CODE ---
}*/ 

function generateRandomSubtleBackgroundColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 30) + 20; // 20-50%
    const lightness = Math.floor(Math.random() * 10) + 15; // 15-25%
    const alpha = 0.5; // Fixed alpha for consistency
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
}

// --- Helper function for handling object item clicks ---
function handleLayerItemClick(clickedLayerItem, object) {
    // 1. Clear 'selected' class from all previous layers
    document.querySelectorAll('.layer-item.selected').forEach(el => el.classList.remove('selected'));
    
    // Clear visual selection from track rows but DON'T delete the stored colors
    const prevSelectedTrackRow = document.querySelector('.timeline-track-row.selected-object-track');
    if (prevSelectedTrackRow) {
        prevSelectedTrackRow.classList.remove('selected-object-track');
        prevSelectedTrackRow.style.removeProperty('--selected-track-random-color');
    }

    // 2. Select the current layer item (object)
    clickedLayerItem.classList.add('selected');

    // 3. Set the global selected object
    selectedObject = object;
    if (typeof transformControls !== 'undefined') {
        transformControls.attach(object);
    }

    // Clear any active keyframe/handle selection in the Graph Editor
    selectedGraphKeyframe = null;
    selectedGraphHandle = null;

    // 4. Generate and store a random color ONLY if it doesn't exist yet
    if (!object.userData.selectedTrackColor) {
        object.userData.selectedTrackColor = generateRandomSubtleBackgroundColor();
    }

    // 5. Update UI. `updateKeyframesUI` will now apply this color.
    updateKeyframesUI();

    // If the graph editor is currently visible, ensure it re-renders
    if (isGraphView) {
        renderGraph();
    }
}

/*** 
function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    const fragment = document.createDocumentFragment();
    
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
    
    // Clear container once
    keyframesContainer.innerHTML = '';
    
    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;
        
        // Ensure the object has a persistent color (generate if doesn't exist)
        if (!object.userData.selectedTrackColor) {
            object.userData.selectedTrackColor = generateRandomSubtleBackgroundColor();
        }
        
        const trackRow = document.createElement('div');
        trackRow.className = 'timeline-track-row';
        trackRow.dataset.uuid = uuid;
        
        // Apply the persisted color to the track row background
        trackRow.style.backgroundColor = object.userData.selectedTrackColor;
        
        // If this is the currently selected object, add the selected class
        if (selectedObject && selectedObject.uuid === uuid) {
            trackRow.classList.add('selected-object-track');
        }
        
        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframeEl = document.createElement('div');
            keyframeEl.className = 'keyframe';
            keyframeEl.dataset.frame = frame;
            keyframeEl.dataset.uuid = uuid;
            keyframeEl.dataset.time = data.time;
            
            const leftPx = (data.time / timelineDuration) * totalVirtualWidth;
            keyframeEl.style.left = `${leftPx}px`;
            keyframeEl.title = `Keyframe for: ${object.name}\nFrame: ${frame} (Time: ${data.time.toFixed(2)}s)\nType: ${data.interpolation || 'linear'}`;
            
            if (selectedKeyframe && selectedKeyframe.dataset.frame === frame && selectedKeyframe.dataset.uuid === uuid) {
                keyframeEl.classList.add('selected');
            }
            
            keyframeEl.addEventListener('mousedown', (e) => {
                isDraggingKeyframe = true;
                draggedKeyframe = keyframeEl;
                dragKeyframeStartClientX = e.clientX;
                dragKeyframeStartLeftPx = leftPx;
                dragKeyframeOriginalTime = data.time;
                dragKeyframeOriginalUuid = uuid;
                dragKeyframeOriginalFrame = parseInt(frame, 10);
                dragKeyframeOriginalData = JSON.parse(JSON.stringify(data));
                
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
                
                selectKeyframe(keyframeEl, e);
                e.stopPropagation();
            });
            
            trackRow.appendChild(keyframeEl);
        });
        
        fragment.appendChild(trackRow);
    });
    
    // Single DOM insertion
    keyframesContainer.appendChild(fragment);
    
    keyframeLinesSvg.style.height = `${timelineContent.scrollHeight || timeline.clientHeight}px`;
    
    if (isGraphView) {
        renderGraph();
    }
}*/

/**
 * Updates the visual keyframes on the timeline tracks.
 * Now draws the root track AND a special track for the currently selected bone.
 */
function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    const fragment = document.createDocumentFragment();
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    keyframesContainer.innerHTML = '';
    const allFrameTimes = new Set();

      keyframes.forEach(objectKeyframes => {
        Object.keys(objectKeyframes).forEach(frame => allFrameTimes.add(parseInt(frame)));
    });

    // Collect all unique frame numbers from bone keyframes
    boneKeyframes.forEach(boneMap => {
        boneMap.forEach(keyframeMap => {
            Object.keys(keyframeMap).forEach(frame => allFrameTimes.add(parseInt(frame)));
        });
    });

    const summaryTrackRow = document.createElement('div');
    summaryTrackRow.className = 'timeline-track-row summary-track';
    allFrameTimes.forEach(frame => {
        const time = frame / fps;
        const summaryKf = document.createElement('div');
        summaryKf.className = 'keyframe summary-keyframe'; // Use a different class for styling
        
        const leftPx = (time / timelineDuration) * totalVirtualWidth;
        summaryKf.style.left = `${leftPx}px`;
        summaryKf.title = `Keyframe activity at frame ${frame}`;
        
        summaryTrackRow.appendChild(summaryKf);
    });

    fragment.appendChild(summaryTrackRow);

    // 1. Draw ROOT keyframes for ALL objects
    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (object) {
            createTrackRow(fragment, object, objectKeyframes, totalVirtualWidth, 'root-track');
        }
    });

    // 2. Draw BONE keyframes for the CURRENTLY SELECTED bone
    if (selectedBone) {
        const owner = findSkinnedMeshOwner(selectedBone) || selectedObject;
        if (owner && boneKeyframes.has(owner.uuid)) {
            const boneMap = boneKeyframes.get(owner.uuid);
            if (boneMap.has(selectedBone.name)) {
                const boneKfMap = boneMap.get(selectedBone.name);
                createTrackRow(fragment, selectedBone, boneKfMap, totalVirtualWidth, 'bone-track', owner.uuid);
            }
        }
    }

    keyframesContainer.appendChild(fragment);
    keyframeLinesSvg.style.height = `${keyframesContainer.scrollHeight || timeline.clientHeight}px`;
    if (isGraphView) renderGraph();
}

/**
 * Helper to create a timeline track row DOM element for either an object or a bone.
 */
function createTrackRow(parentFragment, target, keyframeData, totalVirtualWidth, trackClass, ownerUuid = null) {
    const trackRow = document.createElement('div');
    trackRow.className = `timeline-track-row ${trackClass}`;
    trackRow.dataset.uuid = ownerUuid || target.uuid;
    
    // Style the track to match the layer color
    const ownerObject = scene.getObjectByProperty('uuid', ownerUuid || target.uuid);
    if (ownerObject) {
        if (!ownerObject.userData.selectedTrackColor) {
            ownerObject.userData.selectedTrackColor = generateRandomSubtleBackgroundColor();
        }
        trackRow.style.backgroundColor = ownerObject.userData.selectedTrackColor;
    }

    if (trackClass === 'bone-track') {
        trackRow.dataset.boneName = target.name;
    }

    if ((selectedObject && target.uuid === selectedObject.uuid && trackClass !== 'bone-track') ||
        (selectedBone && target.uuid === selectedBone.uuid)) {
        trackRow.classList.add('selected-object-track');
    }

    Object.entries(keyframeData).forEach(([frame, data]) => {
        const keyframeEl = document.createElement('div');
        keyframeEl.className = 'keyframe';
        keyframeEl.dataset.frame = frame;
        keyframeEl.dataset.uuid = ownerUuid || target.uuid;
        keyframeEl.dataset.time = data.time;

        if (trackClass === 'bone-track') {
            keyframeEl.classList.add('bone-keyframe'); // For special styling
            keyframeEl.dataset.boneName = target.name;
        }

        const leftPx = (data.time / timelineDuration) * totalVirtualWidth;
        keyframeEl.style.left = `${leftPx}px`;
        keyframeEl.title = `Keyframe for: ${target.name}\nFrame: ${frame}`;

        /*keyframeEl.addEventListener('mousedown', (e) => {
            // Your existing keyframe drag logic is fine
            isDraggingKeyframe = true;
            draggedKeyframe = keyframeEl;
        });*/
        keyframeEl.addEventListener('mousedown', (e) => {
    e.stopPropagation(); // Prevent timeline pan/box-select

    // First, ensure the selection is correct.
    // If the clicked keyframe is NOT selected, we treat it as a new single selection drag.
    if (!keyframeEl.classList.contains('selected')) {
        // This is a new drag action, deselect everything else.
        selectedKeyframes.forEach(kf => kf.classList.remove('selected'));
        selectedKeyframes = [];
        selectKeyframe(keyframeEl, e); // selectKeyframe handles adding to array
    }

    isDraggingKeyframe = true;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    // Store the initial state for ALL selected keyframes
    dragKeyframeInitialStates = []; // Clear previous states
    dragKeyframeStartClientX = e.clientX; // Store the initial mouse X

    selectedKeyframes.forEach(kf => {
        const frame = parseInt(kf.dataset.frame, 10);
        const uuid = kf.dataset.uuid;
        const boneName = kf.dataset.boneName || null; // Handle bone keyframes
        let keyframeMap;
        
        if (boneName) {
            keyframeMap = boneKeyframes.get(uuid)?.get(boneName);
        } else {
            keyframeMap = keyframes.get(uuid);
        }

        if (keyframeMap && keyframeMap[frame]) {
            dragKeyframeInitialStates.push({
                el: kf,
                startLeftPx: parseFloat(kf.style.left),
                originalFrame: frame,
                originalData: JSON.parse(JSON.stringify(keyframeMap[frame])), // Deep copy
                uuid: uuid,
                boneName: boneName
            });
        }
    });
});

        trackRow.appendChild(keyframeEl);
    });
    
    parentFragment.appendChild(trackRow);
}

/*
function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    const fragment = document.createDocumentFragment();
    
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    // Clear container once
    keyframesContainer.innerHTML = '';

    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;

        const trackRow = document.createElement('div');
        trackRow.className = 'timeline-track-row';
        trackRow.dataset.uuid = uuid;

        if (selectedObject && selectedObject.uuid === uuid) {
            trackRow.classList.add('selected-object-track');
            if (object.userData.selectedTrackColor) {
                trackRow.style.setProperty('--selected-track-random-color', object.userData.selectedTrackColor);
            }
        }

        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframeEl = document.createElement('div');
            keyframeEl.className = 'keyframe';
            keyframeEl.dataset.frame = frame;
            keyframeEl.dataset.uuid = uuid;
            keyframeEl.dataset.time = data.time;

            const leftPx = (data.time / timelineDuration) * totalVirtualWidth;
            keyframeEl.style.left = `${leftPx}px`;
            keyframeEl.title = `Keyframe for: ${object.name}\nFrame: ${frame} (Time: ${data.time.toFixed(2)}s)\nType: ${data.interpolation || 'linear'}`;

            if (selectedKeyframe && selectedKeyframe.dataset.frame === frame && selectedKeyframe.dataset.uuid === uuid) {
                keyframeEl.classList.add('selected');
            }

            keyframeEl.addEventListener('mousedown', (e) => {
                isDraggingKeyframe = true;
                draggedKeyframe = keyframeEl;
                dragKeyframeStartClientX = e.clientX;
                dragKeyframeStartLeftPx = leftPx;
                dragKeyframeOriginalTime = data.time;
                dragKeyframeOriginalUuid = uuid;
                dragKeyframeOriginalFrame = parseInt(frame, 10);
                dragKeyframeOriginalData = JSON.parse(JSON.stringify(data));

                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';

                selectKeyframe(keyframeEl, e);
                e.stopPropagation();
            });

            trackRow.appendChild(keyframeEl);
        });

        fragment.appendChild(trackRow);
    });
    
    // Single DOM insertion
    keyframesContainer.appendChild(fragment);
    
    keyframeLinesSvg.style.height = `${timelineContent.scrollHeight || timeline.clientHeight}px`;
    
    if (isGraphView) {
        renderGraph();
    }
}*/

// --- HELPERS & UTILITIES ---

/**
 * Automatically expands `timelineDuration` if a new animation is longer.
 */
function autoSetTimelineDurationFromAnimations(object) {
    if (object.animations && object.animations.length > 0) {
        let maxDuration = 0;
        object.animations.forEach(clip => {
            if (clip.duration > maxDuration) maxDuration = clip.duration;
        });
        if (maxDuration > timelineDuration) {
            timelineDuration = maxDuration;
            initializeTimelineScale();
        }
    }
}

/**
 * Helper function to efficiently get an interpolated value from a `THREE.KeyframeTrack`.
 */
function getValueAtTime(time, track, defaultValue, outValue) {
    if (!track || track.times.length === 0) {
        return outValue.copy(defaultValue);
    }

    const times = track.times;
    const values = track.values;
    const valueSize = track.getValueSize();

    if (times.length === 1) {
        return outValue.fromArray(values, 0);
    }
    if (time <= times[0]) {
        return outValue.fromArray(values, 0);
    }
    if (time >= times[times.length - 1]) {
        return outValue.fromArray(values, (times.length - 1) * valueSize);
    }

    for (let i = 0; i < times.length - 1; i++) {
        if (time >= times[i] && time < times[i + 1]) {
            const t = (time - times[i]) / (times[i + 1] - times[i]);

            const v0 = new outValue.constructor().fromArray(values, i * valueSize);
            const v1 = new outValue.constructor().fromArray(values, (i + 1) * valueSize);

            if (outValue.isQuaternion) {
                return THREE.Quaternion.slerp(v0, v1, outValue, t);
            } else {
                return outValue.copy(v0).lerp(v1, t);
            }
        }
    }
    console.warn("getValueAtTime: Fallback reached, this indicates a logic error or unexpected time/track data.", { time, track, defaultValue });
    return outValue.copy(defaultValue);
}

/**
 * Manages the 'active' state for a group of toggle buttons.
 */
function activatePanelButtonTool() {
    const buttons = document.querySelectorAll('.panel-button-tool');

    buttons.forEach(button => {
        button.addEventListener('click', function() {
            buttons.forEach(btn => {
                if (btn !== this) {
                    btn.classList.remove('active');
                    updateButtonState(btn);
                }
            });

            this.classList.toggle('active');
            updateButtonState(this);

            const action = this.dataset.action || this.id;
            if (action && typeof window[action] === 'function') {
                window[action]();
            }
        });
    });
}

/**
 * Helper to update ARIA attributes and tooltips for a toggle button's state.
 */
function updateButtonState(button) {
    const isActive = button.classList.contains('active');
    const baseTitle = button.title.split(' (')[0];
    button.setAttribute('aria-pressed', isActive.toString());
    button.title = `${baseTitle} (${isActive ? 'Active' : 'Inactive'})`;
}
// === Actions ===
function copyKeyframe() {
    if (selectedGraphKeyframe !== null) {
        const channelData = getChannelKeyframeData(selectedGraphChannel);
        copiedKeyframe = JSON.parse(JSON.stringify(channelData[selectedGraphKeyframe]));
        console.log("Copied keyframe:", copiedKeyframe);
    }
}

function pasteKeyframe() {
    if (!copiedKeyframe || !selectedObject) return;
    const newFrame = Math.round(currentTime * fps);
    const objectKeyframes = keyframes.get(selectedObject.uuid);

    let newKeyframe = { ...copiedKeyframe.originalKfEntry };
    newKeyframe.time = currentTime;
    objectKeyframes[newFrame] = newKeyframe;

    updateKeyframesUI();
    updateSceneFromTimeline();
    console.log("Pasted keyframe at", currentTime);
}

function duplicateKeyframe() {
    if (selectedGraphKeyframe !== null) {
        copyKeyframe();
        currentTime += 1 / fps; // paste at next frame
        pasteKeyframe();
    }
}

function deleteKeyframeAction() {
    if (selectedGraphKeyframe !== null && selectedObject) {
        const channelData = getChannelKeyframeData(selectedGraphChannel);
        const kf = channelData[selectedGraphKeyframe];
        const objectKeyframes = keyframes.get(selectedObject.uuid);

        delete objectKeyframes[kf.frame];
        selectedGraphKeyframe = null;

        updateKeyframesUI();
        updateSceneFromTimeline();
        renderGraph();
    }
}

function setEase(type) {
    if (selectedGraphKeyframe !== null) {
        const channelData = getChannelKeyframeData(selectedGraphChannel);
        const kf = channelData[selectedGraphKeyframe];
        kf.interpolation = "bezier";
        
        if (type === "ease-in") {
            kf.handleIn = { x: -0.3, y: 0 };
            kf.handleOut = { x: 0.1, y: 0 };
        } else if (type === "ease-out") {
            kf.handleIn = { x: -0.1, y: 0 };
            kf.handleOut = { x: 0.3, y: 0 };
        } else if (type === "ease-in-out") {
            kf.handleIn = { x: -0.3, y: 0 };
            kf.handleOut = { x: 0.3, y: 0 };
        }
        updateSceneFromTimeline();
        renderGraph();
        console.log("Applied ease:", type);
    }
}

/**
 * Updates the timeline UI to display visual tracks for active modifiers.
 */
function updateModifierTracksUI() {
    // First, clear any existing modifier tracks to prevent duplicates
    document.querySelectorAll('.modifier-track-row').forEach(el => el.remove());

    const keyframesContainer = document.getElementById('keyframes-container');
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    modifierManager.registry.forEach((modifiers, uuid) => {
        const trackRow = document.createElement('div');
        trackRow.className = 'timeline-track-row modifier-track-row';
        trackRow.dataset.uuid = uuid;

        modifiers.forEach(modifier => {
            if (modifier.type === 'shatter') {
                const modifierBlock = document.createElement('div');
                modifierBlock.className = 'modifier-block shatter';
                
                const startPx = (modifier.startTime / timelineDuration) * totalVirtualWidth;
                const durationPx = (modifier.duration / timelineDuration) * totalVirtualWidth;

                modifierBlock.style.left = `${startPx}px`;
                modifierBlock.style.width = `${Math.max(2, durationPx)}px`; // Ensure a minimum visible width
                modifierBlock.innerHTML = `<span>💥 Shatter</span>`;
                
                // FUTURE: You can add event listeners here to make the block draggable
                // to change its start time, or resizable to change its duration.

                trackRow.appendChild(modifierBlock);
            }
        });

        // Find the corresponding object track and insert the modifier track before it
        const objectTrack = keyframesContainer.querySelector(`.timeline-track-row[data-uuid="${uuid}"]`);
        if (objectTrack) {
            keyframesContainer.insertBefore(trackRow, objectTrack);
        } else {
            keyframesContainer.appendChild(trackRow);
        }
    });

    // We also need to call this whenever the zoom or timeline duration changes
    // Add this line to the end of updateTimelineZoom()
}


/**
 * Snaps a given time value to the nearest target if snapping is enabled and within threshold.
 * @param {number} time The current time value to be snapped.
 * @returns {number} The snapped time, or the original time if no snap occurred.
 */
function getSnappedTime(time) {
    if (!isSnappingEnabledTimeline) {
        return time;
    }

    const snapThresholdPx = 5; // How many pixels away to trigger a snap
    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
    const snapThresholdTime = (snapThresholdPx / totalVirtualWidth) * timelineDuration;

    let potentialSnapTargets = [currentTime]; // Always include the playhead

    // Add all keyframe times as potential targets
    keyframes.forEach(objKfs => Object.values(objKfs).forEach(kf => potentialSnapTargets.push(kf.time)));
    boneKeyframes.forEach(boneMap => boneMap.forEach(kfs => Object.values(kfs).forEach(kf => potentialSnapTargets.push(kf.time))));

    // Find the closest snap target
    let closestTarget = null;
    let minDistance = Infinity;

    potentialSnapTargets.forEach(targetTime => {
        const distance = Math.abs(time - targetTime);
        if (distance < minDistance) {
            minDistance = distance;
            closestTarget = targetTime;
        }
    });

    if (closestTarget !== null && minDistance < snapThresholdTime) {
        return closestTarget; // Snap to the closest target
    }

    return time; // No snap occurred, return original time
}