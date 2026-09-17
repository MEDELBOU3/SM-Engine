/* ===========================================
   STORYBOARD 2D - QUICK REFERENCE CARD
   =========================================== */

// ACCESS THE MANAGERS
const storyboard = window.storyboard2DManager;
const integration = window.storyboard2DIntegration;

// ================ ACTIVATION ================
storyboard.activate();      // Show the panel
storyboard.deactivate();    // Hide the panel

// ================ CREATE FRAMES ================
// Basic frame
storyboard.createNewFrame();

// Frame with data
storyboard.createNewFrame({
    sceneName: "Scene Name",
    duration: 2.5,
    notes: "Director notes",
    cameraDirections: "Pan left",
    audioSFX: "Music cue",
    tags: ["tag1", "tag2"]
});

// ================ VIEW MODES ================
storyboard.setViewMode('grid');     // Grid view
storyboard.setViewMode('list');     // List view
storyboard.setViewMode('detail');   // Detail view

// ================ FRAME OPERATIONS ================
storyboard.selectFrame('frame_1');      // Select frame
storyboard.deleteSelectedFrame();       // Delete selected
storyboard.duplicateSelectedFrame();    // Duplicate
storyboard.loadFrameDetails('frame_1'); // Load details for editing
storyboard.saveFrameDetails();          // Save edited details

// ================ TIMELINE ================
storyboard.getTotalDuration();                    // Get total seconds
storyboard.formatTimecode(15.5);                  // Format: "0:15:50"
storyboard.getStatistics();                       // Get analytics object

// ================ EXPORT/IMPORT ================
storyboard.exportStoryboard();                    // Download JSON
storyboard.importStoryboard();                    // Upload JSON
storyboard.saveStoredData();                      // Save to localStorage
storyboard.loadStoredData();                      // Load from localStorage

// ================ HISTORY ================
storyboard.undo();              // Undo last action
storyboard.redo();              // Redo last action
storyboard.saveHistory();       // Manual save to history

// ================ ADVANCED EXPORT ================
integration.exportAsImageGrid({
    cols: 3,
    rows: 4,
    scale: 1,
    showLabels: true,
    backgroundColor: '#1e293b'
});

integration.generateShotList();                   // Get text shot list
integration.exportShotList();                     // Download shot list
integration.getStatistics();                      // Get detailed analytics

// ================ BATCH OPERATIONS ================
// Get all frames
Array.from(storyboard.frames.values());

// Filter by tag
storyboard.frames.forEach((frame, id) => {
    if (frame.tags.includes('action')) {
        console.log(frame);
    }
});

// Update all frames
storyboard.frames.forEach((frame, id) => {
    frame.notes = "Updated note";
});

// ================ CANVAS INTEGRATION ================
integration.captureCurrentCanvasToFrame('frame_1');  // Capture from canvas
integration.previewFrameInCanvas('frame_1');         // Preview in canvas

// ================ ONE-LINE SHORTCUTS ================
storyboard.frames.size;                              // Total frame count
storyboard.selectedFrameId;                          // Currently selected
storyboard.currentViewMode;                          // Current view
storyboard.settings.frameRate;                       // Get FPS
storyboard.settings.defaultDuration;                 // Get duration setting

// ================ COMMON ONE-LINERS ================
storyboard.frames.clear();                           // Delete all frames
storyboard.history.states = [];                      // Clear history
storyboard.refreshUI();                              // Redraw UI

// Create 5 quick frames
for(let i=0; i<5; i++) storyboard.createNewFrame({
    sceneName: `Scene ${i+1}`,
    duration: 2.0,
    tags: ['quick', 'demo']
});

// Export all data
const allData = {
    frames: Array.from(storyboard.frames.entries()),
    stats: storyboard.getStatistics(),
    settings: storyboard.settings
};
console.log(JSON.stringify(allData, null, 2));

// Get frames by duration
const longFrames = Array.from(storyboard.frames.values())
    .filter(f => f.duration > 3.0);

// Get total tag usage
const allTags = Array.from(storyboard.frames.values())
    .flatMap(f => f.tags);
const tagCount = allTags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
}, {});

// ================ EXAMPLE WORKFLOWS ================

// QUICK STORYBOARD (Copy & Paste)
function quickStoryboard() {
    const scenes = [
        { sceneName: 'OPENING', duration: 3, notes: 'Establish', tags: ['opening'] },
        { sceneName: 'MIDDLE', duration: 5, notes: 'Action', tags: ['action'] },
        { sceneName: 'CLOSING', duration: 2, notes: 'End', tags: ['closing'] }
    ];
    scenes.forEach(s => storyboard.createNewFrame(s));
    storyboard.setViewMode('grid');
}

// ANIMATION SEQUENCE
function animationSeq(frames = 24, fps = 24) {
    for(let i=0; i<frames; i++) {
        storyboard.createNewFrame({
            sceneName: `FRAME ${String(i+1).padStart(3, '0')}`,
            duration: 1/fps,
            tags: ['animation', `frame-${i}`]
        });
    }
}

// DUPLICATE 5 TIMES
function duplicateSelection(times = 5) {
    for(let i=0; i<times; i++) {
        storyboard.duplicateSelectedFrame();
    }
}

// ================ KEYBOARD SHORTCUTS ================
// Press these keys:
// Ctrl+N   = New frame
// Ctrl+Z   = Undo
// Ctrl+Y   = Redo
// Ctrl+D   = Duplicate
// Delete   = Delete frame

// ================ CONSOLE COMMANDS ================
// Copy and paste into browser console (F12)

// Add 10 quick frames:
for(let i=1; i<=10; i++) storyboard.createNewFrame({
    sceneName: `Scene ${i}`, duration: 2.0, tags: ['demo']
});

// Get statistics:
console.table(storyboard.getStatistics());

// Export everything:
storyboard.exportStoryboard();
integration.exportShotList();

// Get frame in detail view:
storyboard.setViewMode('detail');

// ================ HELPER QUICK FUNCTIONS ================
function addFrame(name, duration = 2.0, tags = []) {
    return storyboard.createNewFrame({
        sceneName: name,
        duration: duration,
        tags: tags
    });
}

function filterByTag(tag) {
    return Array.from(storyboard.frames.values())
        .filter(f => f.tags.includes(tag));
}

function getTotalByTag(tag) {
    return filterByTag(tag)
        .reduce((sum, f) => sum + f.duration, 0)
        .toFixed(2);
}

function renameFrames(prefix) {
    let i = 1;
    storyboard.frames.forEach((f) => {
        f.sceneName = `${prefix} ${i++}`;
    });
}

function tagAllFrames(tag) {
    storyboard.frames.forEach((f) => {
        if (!f.tags.includes(tag)) f.tags.push(tag);
    });
}

// ================ DEBUG INFO ================
function debugInfo() {
    console.log('=== STORYBOARD DEBUG INFO ===');
    console.log('Frames:', storyboard.frames.size);
    console.log('Current view:', storyboard.currentViewMode);
    console.log('Selected frame:', storyboard.selectedFrameId);
    console.log('History index:', storyboard.history.currentIndex);
    console.log('History states:', storyboard.history.states.length);
    console.log('Settings:', storyboard.settings);
    console.log('Stats:', storyboard.getStatistics());
}

// ================ NOTES ================
/*
• All functions return values or undefined
• Auto-save is enabled by default
• Data persists in localStorage
• Maximum 50 history states
• Grid view best for visual review
• List view best for editing
• Detail view for single frame work
• Export JSON regularly for backup
• Use keyboard shortcuts for speed
• Tags help organize large projects
• Durations sync with FPS setting
• Canvas capture works with Animation2DManager
*/
