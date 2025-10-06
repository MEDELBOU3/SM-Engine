

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

let lastTime = performance.now(); // unused, consider removing
let frameCount = 0;               // unused, consider removing
let dragStart = 0;                // Will be correctly used for panning
let selectedSegment = null;       // Used for segment selection, will be accessed directly.


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

// Your global variables (as per your initial definition).
// `lastTime`, `frameCount`, `dragStart`, `selectedSegment`,
// `currentTime`, `isPlaying`, `timelineDuration`, `keyframes`, `selectedKeyframe`,
// `fps`, `pixelsPerSecond`, `zoomLevel`, `timelineOffset`,
// `_tempBoneLocalPosition`, `_tempBoneLocalQuaternion`, `_tempBoneLocalScale`,
// `currentDefaultInterpolationType`, `isDraggingKeyframe`, `draggedKeyframe`,
// `dragKeyframeStartClientX`, `dragKeyframeStartOffset`, `pathAnimator`, etc.
// are all expected to be declared globally in your main script file.

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
}

/**
 * Renders or re-renders the timeline ruler with dynamic markers and labels based on zoom level.
 * This function handles both HTML markers (time labels and major/minor ticks)
 * and SVG lines (the background vertical grid lines) to ensure they are synchronized with zoom.
 */
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
}

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
    // Important: `setupTimelineEventListeners()` must also be called somewhere in your main app,
    //           preferably after `initializeTimeline()` and the DOM is ready.
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
                isDragging = true; // Use global `isDragging` for track panning.
                isDraggingPlayhead = false; // Ensure playhead scrubbing is not active.
                dragStartX = e.clientX - timelineOffset; // Use global `timelineOffset`.
                timelineTrack.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';

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

    // Global mousemove listener (active during playhead scrubbing, timeline panning, OR keyframe dragging).
    document.addEventListener('mousemove', (e) => {
        // --- Keyframe Dragging Logic (NEW/MODIFIED) ---
        if (isDraggingKeyframe && draggedKeyframe) { // `isDraggingKeyframe` and `draggedKeyframe` are global variables
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

        } else if (isDraggingPlayhead) {
            // Logic for scrubbing the playhead (uses global `currentTime`, `timelineDuration`, etc.)
            const timelineContentRect = timelineContentElement.getBoundingClientRect();
            const mouseXInContent = e.clientX - timelineContentRect.left;

            const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;
            currentTime = Math.max(0, Math.min(timelineDuration, (mouseXInContent / totalVirtualWidth) * timelineDuration));

            updatePlayhead();
            updateSceneFromTimeline();

        } else if (isDragging && timelineTrack.style.cursor === 'grabbing') {
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
        if (isDraggingKeyframe && draggedKeyframe) {
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
                    // It's important to copy the ORIGINAL data (pos, rot, scale, interp)
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

        } else if (isDraggingPlayhead) {
            // ... (existing code for playhead dragging mouseup) ...
            isDraggingPlayhead = false;
            document.body.style.cursor = 'default';

        } else if (isDragging) {
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


/**
 * Starts animation playback from the current global `currentTime`.
 */
function playAnimation() {
    if (isPlaying) return;
    isPlaying = true;
    console.log("Animation playing. Resuming from:", currentTime.toFixed(2));
}

/**
 * Pauses animation playback at the current global `currentTime`.
 */
function pauseAnimation() {
    if (!isPlaying) return;
    isPlaying = false;
    console.log("Animation paused at:", currentTime.toFixed(2));
}

/**
 * Stops animation playback and resets the global `currentTime` to 0.
 * The UI and 3D scene are updated to reflect this initial state.
 */
function stopAnimation() {
    isPlaying = false;
    currentTime = 0;
    console.log("Animation stopped and reset.");
    updatePlayhead();
    updateTimeDisplay();
    updateSceneFromTimeline();
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
 */
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
            console.log(`✅ Timeline populated for '${object.name}' with ${Object.keys(objectKeyframes).length} complete keyframes.`);
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
            };
            keyframes.set(object.uuid, objectKeyframes);
        }
    }

    updateKeyframesUI();
    updateLayersUI();
}

/**
 * Adds a new keyframe for the currently `selectedObject` at the current `currentTime`.
 */
/*function addKeyframe() {
    if (!selectedObject) {
        console.warn('Cannot add keyframe: No object selected.');
        return;
    }

    const frame = Math.round(currentTime * fps);
    const objectKeyframes = keyframes.get(selectedObject.uuid) || {};

    const animationTarget = selectedObject.userData.animationTarget || selectedObject;
    objectKeyframes[frame] = {
        time: currentTime,
        position: animationTarget.position.clone(),
        rotation: animationTarget.quaternion.clone(),
        scale: animationTarget.scale.clone(),
        interpolation: currentDefaultInterpolationType
    };

    keyframes.set(selectedObject.uuid, objectKeyframes);
    updateKeyframesUI();
    updateLayersUI();
    console.log(`Added keyframe for ${selectedObject.name} at time ${currentTime.toFixed(2)}s (frame ${frame}).`);
}*/ 

function addKeyframe() {
    if (!selectedObject) {
        console.warn('Cannot add keyframe: No object selected.');
        return;
    }

    const frame = Math.round(currentTime * fps);
    const objectKeyframes = keyframes.get(selectedObject.uuid) || {};

    const animationTarget = selectedObject.userData.animationTarget || selectedObject;
    objectKeyframes[frame] = {
        time: currentTime,
        position: animationTarget.position.clone(),
        rotation: animationTarget.quaternion.clone(),
        scale: animationTarget.scale.clone(),
        // --- NEW LINE HERE ---
        interpolation: currentDefaultInterpolationType // Store the current default interpolation type
    };

    keyframes.set(selectedObject.uuid, objectKeyframes);
    updateKeyframesUI();
    updateLayersUI();
    console.log(`Added keyframe for ${selectedObject.name} at time ${currentTime.toFixed(2)}s (frame ${frame}).`);
}



/**
 * Deletes the currently `selectedKeyframe` from the timeline.
 *
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

        if (Object.keys(objectKeyframes).length === 0) {
            keyframes.delete(selectedObject.uuid);
            updateLayersUI();
        }

        updateKeyframesUI();
        console.log(`Deleted keyframe for ${selectedObject.name} at frame ${frame}.`);
    }
}*/ 

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
}

/**
 * Visually marks a `keyframeElement` as selected.
 * Deselects any previously selected keyframe (global `selectedKeyframe`).
 * @param {HTMLElement} keyframeElement The keyframe div DOM element to select.
 *
function selectKeyframe(keyframeElement) {
    if (selectedKeyframe) {
        selectedKeyframe.classList.remove('selected');
    }
    selectedKeyframe = keyframeElement;
    selectedKeyframe.classList.add('selected');
}*/ 

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
    }
}


// --- Animation & Scene Updating (Functions using your globals like `scene`, `keyframes`, `pathAnimator`) ---

/**
 * Updates the positions of all animated objects in the scene based on the current `currentTime`.
 */
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
}

/**
 * Applies the transform properties from a `keyframe` to the object's designated `animationTarget`.
 */
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
 */
/*function interpolateKeyframe(object, start, end, t) {
    if (!object || !start || !end) return;

    const animationTarget = object.userData.animationTarget;
    if (!animationTarget) {
        console.warn(`interpolateKeyframe: No animation target found in userData for object ${object.name}. Cannot interpolate.`);
        return;
    }

    animationTarget.position.lerpVectors(start.position, end.position, t);
    animationTarget.quaternion.slerpQuaternions(start.rotation, end.rotation, t);
    animationTarget.scale.lerpVectors(start.scale, end.scale, t);
}*/ 



// --- Your existing `interpolateKeyframe` function, with case statements for interpolation: ---
function interpolateKeyframe(object, start, end, t) {
    if (!object || !start || !end) return;

    const animationTarget = object.userData.animationTarget;
    if (!animationTarget) {
        console.warn(`interpolateKeyframe: No animation target found in userData for object ${object.name}. Cannot interpolate.`);
        return;
    }

    // Get the interpolation type from the *starting* keyframe's data. Fallback to global default if not set on key.
    const interpolationType = start.interpolation || currentDefaultInterpolationType;

    // Clamp `t` to ensure it stays between 0 and 1.
    const clampedT = Math.max(0, Math.min(1, t));

    switch (interpolationType) {
        case 'constant':
            // For constant interpolation, the value holds the `start` keyframe's value
            // up until the moment of the `end` keyframe.
            animationTarget.position.copy(start.position);
            animationTarget.quaternion.copy(start.rotation);
            animationTarget.scale.copy(start.scale);
            break;

        case 'linear':
            // Linear interpolation blends directly between the `start` and `end` values.
            animationTarget.position.lerpVectors(start.position, end.position, clampedT);
            animationTarget.quaternion.slerpQuaternions(start.rotation, end.rotation, clampedT);
            animationTarget.scale.lerpVectors(start.scale, end.scale, clampedT);
            break;

        case 'bezier': // True Bezier requires curve definition; using smoothstep as a smooth approximation for now.
        default:
            // `smoothstep` (Hermite interpolation) provides a natural-looking ease-in/ease-out effect.
            // This is a common and visually pleasing approximation for basic Bezier-like curves without complex handle logic.
            const smoothedT = clampedT * clampedT * (3 - 2 * clampedT);
            animationTarget.position.lerpVectors(start.position, end.position, smoothedT);
            animationTarget.quaternion.slerpQuaternions(start.rotation, end.rotation, smoothedT);
            animationTarget.scale.lerpVectors(start.scale, end.scale, smoothedT);
            break;
    }
    // `object.updateMatrixWorld(true)` is generally called once per frame by the main animate loop,
    // so no explicit call here unless immediate world matrix refresh is strictly needed.
}

// --- UI Update Functions (using your globals and local consts for DOM elements) ---

/**
 * Rebuilds the `layers-list` UI panel based on objects that have keyframes.
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
            document.querySelectorAll('.layer-item.selected').forEach(el => el.classList.remove('selected'));
            layer.classList.add('selected');

            selectedObject = object;
            if (typeof transformControls !== 'undefined') {
                transformControls.attach(object);
            }
            updateKeyframesUI();
        });

        layersList.appendChild(layer);
    });
}

/**
 * Rebuilds the `keyframes-container` UI to display keyframes for all animated objects.
 */
/*function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    keyframesContainer.innerHTML = '';

    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;

        const trackRow = document.createElement('div');
        trackRow.className = 'timeline-track-row';
        trackRow.dataset.uuid = uuid;

        if (selectedObject && selectedObject.uuid === uuid) {
            trackRow.classList.add('selected-object-track');
        }

        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframeEl = document.createElement('div');
            keyframeEl.className = 'keyframe';
            keyframeEl.dataset.frame = frame;
            keyframeEl.dataset.uuid = uuid;

            keyframeEl.style.left = `${(data.time / timelineDuration) * totalVirtualWidth}px`;
            keyframeEl.title = `Keyframe for: ${object.name}\nFrame: ${frame} (Time: ${data.time.toFixed(2)}s)`;

            if (selectedKeyframe && selectedKeyframe.dataset.frame === frame && selectedKeyframe.dataset.uuid === uuid) {
                keyframeEl.classList.add('selected');
            }
            trackRow.appendChild(keyframeEl);
        });

        keyframesContainer.appendChild(trackRow);
    });
    keyframeLinesSvg.style.height = `${timelineContent.scrollHeight || timeline.clientHeight}px`;
}


function updateKeyframesUI() {
    const keyframesContainer = document.getElementById('keyframes-container');
    keyframesContainer.innerHTML = '';

    const totalVirtualWidth = timelineDuration * pixelsPerSecond * zoomLevel;

    keyframes.forEach((objectKeyframes, uuid) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;

        const trackRow = document.createElement('div');
        trackRow.className = 'timeline-track-row';
        trackRow.dataset.uuid = uuid;

        if (selectedObject && selectedObject.uuid === uuid) {
            trackRow.classList.add('selected-object-track');
        }

        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframeEl = document.createElement('div');
            keyframeEl.className = 'keyframe';
            keyframeEl.dataset.frame = frame;
            keyframeEl.dataset.uuid = uuid;

            keyframeEl.style.left = `${(data.time / timelineDuration) * totalVirtualWidth}px`;
            // --- MODIFIED LINE HERE ---
            keyframeEl.title = `Keyframe for: ${object.name}\nFrame: ${frame} (Time: ${data.time.toFixed(2)}s)\nType: ${data.interpolation || 'linear'}`;
            // If data.interpolation is undefined, fallback to 'linear' (or whatever your actual default behavior is)

            if (selectedKeyframe && selectedKeyframe.dataset.frame === frame && selectedKeyframe.dataset.uuid === uuid) {
                keyframeEl.classList.add('selected');
            }
            trackRow.appendChild(keyframeEl);
        });

        keyframesContainer.appendChild(trackRow);
    });
    keyframeLinesSvg.style.height = `${timelineContent.scrollHeight || timeline.clientHeight}px`;
}*/ 

function updateKeyframesUI() {
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
        }

        Object.entries(objectKeyframes).forEach(([frame, data]) => {
            const keyframeEl = document.createElement('div');
            keyframeEl.className = 'keyframe';
            keyframeEl.dataset.frame = frame;
            keyframeEl.dataset.uuid = uuid;

            // Position based on virtual width
            const leftPx = (data.time / timelineDuration) * totalVirtualWidth;
            keyframeEl.style.left = `${leftPx}px`; // Directly set pixel position
            keyframeEl.title = `Keyframe for: ${object.name}\nFrame: ${frame} (Time: ${data.time.toFixed(2)}s)\nType: ${data.interpolation || 'linear'}`;

            if (selectedKeyframe && selectedKeyframe.dataset.frame === frame && selectedKeyframe.dataset.uuid === uuid) {
                keyframeEl.classList.add('selected');
            }

            // --- NEW CODE: Add mousedown listener for keyframe dragging ---
            keyframeEl.addEventListener('mousedown', (e) => {
                isDraggingKeyframe = true;           // Set global drag flag
                draggedKeyframe = keyframeEl;        // Store reference to this keyframe element
                dragKeyframeStartClientX = e.clientX; // Record mouse start X
                dragKeyframeStartLeftPx = leftPx;    // Record keyframe's original pixel position
                dragKeyframeOriginalTime = data.time; // Store original time
                dragKeyframeOriginalUuid = uuid;     // Store original UUID
                dragKeyframeOriginalFrame = parseInt(frame, 10); // Store original frame
                dragKeyframeOriginalData = JSON.parse(JSON.stringify(data)); // Deep copy the data

                // Change cursor globally and disable text selection
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';

                selectKeyframe(keyframeEl); // Automatically select the dragged keyframe

                e.stopPropagation(); // Prevent this mousedown from bubbling up to timeline panning
            });
            // --- END NEW CODE ---

            trackRow.appendChild(keyframeEl);
        });

        keyframesContainer.appendChild(trackRow);
    });
    keyframeLinesSvg.style.height = `${timelineContent.scrollHeight || timeline.clientHeight}px`;
}

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

