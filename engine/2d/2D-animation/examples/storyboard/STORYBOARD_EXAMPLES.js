/**
 * STORYBOARD 2D - QUICK START GUIDE & EXAMPLES
 * 
 * Open browser console and use these examples to get started
 */

// ===================================================================
//  GETTING STARTED
// ===================================================================

// 1. Access the manager
const storyboard = window.storyboard2DManager;
const integration = window.storyboard2DIntegration;

// 2. Activate the panel
storyboard.activate();

// 3. Switch view mode
storyboard.setViewMode('grid');  // Options: 'grid', 'list', 'detail'


// ===================================================================
//  EXAMPLE 1: QUICK STORYBOARD CREATION
// ===================================================================

function createQuickStoryboard() {
    // Create a simple 3-scene storyboard
    const scenes = [
        {
            sceneName: 'OPENING - Wide Shot',
            duration: 3.0,
            notes: 'Establish the location with a wide pan',
            cameraDirections: 'Slow pan from left to right, 180 degrees',
            audioSFX: 'Ambient nature sounds, light music fade in',
            tags: ['establishing', 'exterior', 'cinematic']
        },
        {
            sceneName: 'CHARACTER INTRO',
            duration: 2.5,
            notes: 'Character emerges from shadows',
            cameraDirections: 'Slow zoom to medium shot, depth of field',
            audioSFX: 'Music crescendo, footsteps',
            tags: ['character', 'dramatic', 'indoor']
        },
        {
            sceneName: 'CLIMAX - Action',
            duration: 5.0,
            notes: 'High-energy action sequence',
            cameraDirections: 'Quick cuts, dynamic camera movement',
            audioSFX: 'Intense music, sound effects',
            tags: ['action', 'climax', 'fast-paced']
        }
    ];

    scenes.forEach(scene => {
        storyboard.createNewFrame(scene);
    });

    console.log('✓ Quick storyboard created with 3 frames');
    storyboard.setViewMode('grid');
}

// Run it:
// createQuickStoryboard();


// ===================================================================
//  EXAMPLE 2: PROFESSIONAL FEATURE FILM STORYBOARD
// ===================================================================

function createFeatureFilmStoryboard() {
    const act1 = [
        {
            sceneName: 'TITLE SEQUENCE',
            duration: 8.0,
            notes: 'Bold, stylized title cards with logo reveal',
            cameraDirections: 'Smooth, elegant transitions',
            audioSFX: 'Epic orchestral score',
            tags: ['visual-effects', 'titles', 'cinematic']
        },
        {
            sceneName: 'ACT 1 - SCENE 1',
            duration: 10.0,
            notes: 'Introduce main character in natural habitat',
            cameraDirections: 'Handheld, naturalistic coverage',
            audioSFX: 'Diegetic dialogue, environmental sounds',
            tags: ['drama', 'character-driven', 'dialogue']
        },
        {
            sceneName: 'ACT 1 - SCENE 2',
            duration: 7.5,
            notes: 'Inciting incident occurs',
            cameraDirections: 'Quick editorial cuts, building tension',
            audioSFX: 'Music swells, sound effects',
            tags: ['turning-point', 'dramatic', 'fast-paced']
        }
    ];

    act1.forEach(scene => storyboard.createNewFrame(scene));
    console.log('✓ Act 1 created with 3 scenes');
}

// Run it:
// createFeatureFilmStoryboard();


// ===================================================================
//  EXAMPLE 3: ANIMATION SEQUENCE
// ===================================================================

function createAnimationSequence() {
    // Create frames for a 24-frame animation (1 second at 24fps)
    const animationSequence = [];
    
    for (let i = 1; i <= 24; i++) {
        animationSequence.push({
            sceneName: `ANIMATION FRAME ${String(i).padStart(3, '0')}`,
            duration: 1/24,  // 1 frame at 24fps
            notes: `Key frame in animation sequence`,
            cameraDirections: `Stable camera, medium shot`,
            audioSFX: `${i === 1 ? 'Action starts' : i === 24 ? 'Action ends' : ''}`,
            tags: ['animation', 'procedural', `frame-${i}`]
        });
    }

    animationSequence.forEach(frame => {
        storyboard.createNewFrame(frame);
    });

    console.log('✓ Animation sequence created (24 frames = 1 second at 24fps)');
    console.log('Total duration:', storyboard.getTotalDuration().toFixed(2), 'seconds');
}

// Run it:
// createAnimationSequence();


// ===================================================================
//  EXAMPLE 4: MUSIC VIDEO STORYBOARD
// ===================================================================

function createMusicVideoStoryboard() {
    const musicVideoBeats = [
        {
            sceneName: 'INTRO - Build Anticipation',
            duration: 8.0,
            notes: 'Dark, moody intro with minimal elements',
            cameraDirections: '360° camera rig, slow rotation',
            audioSFX: 'Music intro, synth buildup',
            tags: ['music-video', 'visual-effects', 'electronic']
        },
        {
            sceneName: 'VERSE 1 - Storytelling',
            duration: 16.0,
            notes: 'Narrative-driven, intimate moments',
            cameraDirections: 'Point-of-view shots, close-ups',
            audioSFX: 'Main vocals, instrumentation',
            tags: ['music-video', 'narrative', 'intimate']
        },
        {
            sceneName: 'CHORUS - EXPLOSION',
            duration: 12.0,
            notes: 'High-energy, visual spectacle',
            cameraDirections: 'Dynamic cuts, fast-paced editing',
            audioSFX: 'Chorus vocals, full production',
            tags: ['music-video', 'energy', 'visual-effects']
        },
        {
            sceneName: 'BREAKDOWN - Minimalist',
            duration: 8.0,
            notes: 'Return to simplicity',
            cameraDirections: 'Static, artistic composition',
            audioSFX: 'Stripped-down instrumental',
            tags: ['music-video', 'breakdown', 'artistic']
        },
        {
            sceneName: 'FINAL CHORUS - Grand Finale',
            duration: 20.0,
            notes: 'Maximum visual impact',
            cameraDirections: 'All camera techniques combined',
            audioSFX: 'Full orchestration, vocal layering',
            tags: ['music-video', 'climax', 'visual-effects']
        }
    ];

    musicVideoBeats.forEach(beat => {
        storyboard.createNewFrame(beat);
    });

    console.log('✓ Music video storyboard created');
    console.log('Video length:', storyboard.getTotalDuration().toFixed(2), 'seconds');
}

// Run it:
// createMusicVideoStoryboard();


// ===================================================================
//  EXAMPLE 5: ADVERTISING SPOT
// ===================================================================

function createAdvertisingSpot() {
    // 30-second commercial
    const adSpot = [
        {
            sceneName: 'HOOK (0-3s)',
            duration: 3.0,
            notes: 'Attention-grabbing opening',
            cameraDirections: 'Quick cuts, eye-catching visuals',
            audioSFX: 'Sound design hit, music start',
            tags: ['commercial', 'hook', 'attention-grabbing']
        },
        {
            sceneName: 'PRODUCT BENEFIT (3-15s)',
            duration: 12.0,
            notes: 'Showcase key features and benefits',
            cameraDirections: 'Product-focused shots, lifestyle integration',
            audioSFX: 'Voiceover, background music',
            tags: ['commercial', 'product', 'testimonial']
        },
        {
            sceneName: 'CALL TO ACTION (15-30s)',
            duration: 15.0,
            notes: 'Drive conversion with compelling message',
            cameraDirections: 'Text overlay, logo reveal',
            audioSFX: 'Strong closing music, voiceover outro',
            tags: ['commercial', 'cta', 'branding']
        }
    ];

    adSpot.forEach(frame => {
        storyboard.createNewFrame(frame);
    });

    console.log('✓ 30-second commercial storyboard created');
}

// Run it:
// createAdvertisingSpot();


// ===================================================================
//  EXAMPLE 6: DATA ANALYSIS AND REPORTING
// ===================================================================

function analyzeStoryboard() {
    const stats = storyboard.getStatistics();
    
    console.log('═══ STORYBOARD ANALYSIS ═══');
    console.log('Total Frames:', stats.frameCount);
    console.log('Total Duration:', stats.totalDuration.toFixed(2) + 's');
    console.log('Average Scene Length:', stats.averageDuration.toFixed(2) + 's');
    console.log('Shortest Scene:', stats.minDuration.toFixed(2) + 's');
    console.log('Longest Scene:', stats.maxDuration.toFixed(2) + 's');
    console.log('Total Tags Used:', stats.totalTags);
    console.log('Scenes with Notes:', stats.framesWithNotes);
    console.log('Frame Rate:', stats.estimatedFrameRate + ' fps');
    console.log('Total Frame Count (estimated):', stats.totalFrameCount + ' frames');
    
    return stats;
}

// Run it:
// analyzeStoryboard();


// ===================================================================
//  EXAMPLE 7: GENERATE SHOT LIST
// ===================================================================

function generateAndExportShotList() {
    const shotList = integration.generateShotList();
    console.log(shotList);
    
    // Also export to file
    integration.exportShotList();
    console.log('✓ Shot list exported');
}

// Run it:
// generateAndExportShotList();


// ===================================================================
//  EXAMPLE 8: EXPORT AS IMAGE GRID (For Review/Printing)
// ===================================================================

function exportStoryboardAsGrid() {
    const canvas = integration.exportAsImageGrid({
        cols: 4,
        rows: 3,
        scale: 1.2,
        showLabels: true,
        backgroundColor: '#0f172a'
    });

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `storyboard_grid_${Date.now()}.png`;
    link.click();

    console.log('✓ Storyboard grid exported as PNG');
}

// Run it:
// exportStoryboardAsGrid();


// ===================================================================
//  EXAMPLE 9: CUSTOM SCRIPTING - ADD FRAME PROGRAMMATICALLY
// ===================================================================

function addFrameProgrammatically() {
    const customFrame = {
        sceneName: 'CUSTOM ANIMATION SCENE',
        duration: 2.0,
        notes: 'Created via JavaScript API',
        cameraDirections: 'Follow camera, 60 degree FOV',
        audioSFX: 'Custom audio track',
        tags: ['api', 'programmatic', 'test']
    };

    const frameId = storyboard.createNewFrame(customFrame);
    console.log('✓ Frame created:', frameId);
    
    // Select and view it
    storyboard.selectFrame(frameId);
    storyboard.setViewMode('detail');
}

// Run it:
// addFrameProgrammatically();


// ===================================================================
//  EXAMPLE 10: BATCH OPERATIONS
// ===================================================================

function batchOperations() {
    // Get all frames
    const allFrames = Array.from(storyboard.frames.values());
    console.log('Total frames:', allFrames.length);

    // Filter frames by tag
    const actionFrames = allFrames.filter(f => 
        f.tags.includes('action')
    );
    console.log('Action frames:', actionFrames.length);

    // Calculate total duration of tagged frames
    const taggedDuration = actionFrames.reduce((sum, f) => sum + f.duration, 0);
    console.log('Total action duration:', taggedDuration.toFixed(2) + 's');

    // Find frames with notes
    const framesWithNotes = allFrames.filter(f => f.notes.length > 0);
    console.log('Frames with notes:', framesWithNotes.length);

    // Update all frames with a new tag
    allFrames.forEach(frame => {
        if (!frame.tags.includes('reviewed')) {
            frame.tags.push('reviewed');
        }
    });
    console.log('✓ Batch update completed');
}

// Run it:
// batchOperations();


// ===================================================================
//  EXAMPLE 11: KEYBOARD SHORTCUTS REFERENCE
// ===================================================================

function showKeyboardShortcuts() {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║           STORYBOARD KEYBOARD SHORTCUTS                 ║
    ╠══════════════════════════════════════════════════════════╣
    ║  Ctrl+N  │  Create new frame                            ║
    ║  Ctrl+Z  │  Undo last action                            ║
    ║  Ctrl+Y  │  Redo last action                            ║
    ║  Ctrl+D  │  Duplicate selected frame                    ║
    ║  Delete  │  Delete selected frame                       ║
    ║  Ctrl+E  │  Export storyboard                           ║
    ║  Ctrl+I  │  Import storyboard                           ║
    ╚══════════════════════════════════════════════════════════╝
    `);
}

// Run it:
// showKeyboardShortcuts();


// ===================================================================
//  EXAMPLE 12: WORKFLOW HELPER FUNCTIONS
// ===================================================================

// Quick duplicate current frame
function quickDuplicate() {
    storyboard.duplicateSelectedFrame();
    console.log('✓ Frame duplicated');
}

// Quick delete current frame
function quickDelete() {
    storyboard.deleteSelectedFrame();
    console.log('✓ Frame deleted');
}

// Switch to next view mode
let viewRotation = ['grid', 'list', 'detail'];
let currentViewIndex = 0;

function rotateView() {
    currentViewIndex = (currentViewIndex + 1) % viewRotation.length;
    storyboard.setViewMode(viewRotation[currentViewIndex]);
    console.log('✓ Switched to', viewRotation[currentViewIndex], 'view');
}

// Clear all frames and start fresh
function clearAllFrames() {
    if (confirm('Delete all frames? This cannot be undone!')) {
        storyboard.frames.clear();
        storyboard.frameCounter = 0;
        storyboard.saveHistory();
        storyboard.refreshUI();
        console.log('✓ All frames cleared');
    }
}

// Save backup to localStorage
function createBackup() {
    storyboard.saveStoredData();
    console.log('✓ Backup created');
}

// Export everything
function exportEverything() {
    console.log('Exporting storyboard...');
    storyboard.exportStoryboard();
    
    setTimeout(() => {
        console.log('Exporting shot list...');
        integration.exportShotList();
    }, 1000);
}


// ===================================================================
//  CONSOLE COMMANDS
// ===================================================================

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                 STORYBOARD 2D QUICK START GUIDE                   ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Try one of these examples in the console:                       ║
║                                                                    ║
║  createQuickStoryboard()           - Quick 3-scene demo          ║
║  createFeatureFilmStoryboard()     - Feature film example        ║
║  createAnimationSequence()         - Animation frames demo       ║
║  createMusicVideoStoryboard()      - Music video structure       ║
║  createAdvertisingSpot()           - 30s commercial example      ║
║  analyzeStoryboard()               - Generate statistics          ║
║  generateAndExportShotList()       - Create shot list            ║
║  exportStoryboardAsGrid()          - Export as image grid        ║
║  addFrameProgrammatically()        - API example                 ║
║  batchOperations()                 - Batch editing example       ║
║  showKeyboardShortcuts()           - Display shortcuts           ║
║                                                                    ║
║  Helper Functions:                                               ║
║  quickDuplicate()                  - Duplicate frame             ║
║  quickDelete()                     - Delete frame                ║
║  rotateView()                      - Cycle through views         ║
║  clearAllFrames()                  - Start fresh                 ║
║  createBackup()                    - Backup to localStorage      ║
║  exportEverything()                - Export all data             ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
`);
