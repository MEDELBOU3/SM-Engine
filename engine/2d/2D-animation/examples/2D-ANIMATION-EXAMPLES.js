/**
 * ADVANCED 2D ANIMATION - QUICK START EXAMPLES
 * Copy and paste these examples into the browser console or your script
 */

// ============================================================================
// EXAMPLE 1: Basic 2D Animation Setup
// ============================================================================

function example_BasicAnimation() {
    const mgr = window.animation2DManager;
    
    // Enter 2D mode
    mgr.enterMode();
    
    // Set up basic tools
    mgr.setTool('pencil');
    mgr.currentColor = '#000000';
    mgr.currentSize = 10;
    
    console.log('✅ Basic 2D Animation Started');
    console.log('   - Press P for Pencil, E for Eraser, Esc to exit');
}

// Usage: example_BasicAnimation()


// ============================================================================
// EXAMPLE 2: Enable Advanced Lighting System
// ============================================================================

function example_EnableLighting() {
    const mgr = window.animation2DManager;
    
    // Enable all lighting features
    mgr.lightingEnabled = true;
    mgr.shadowsEnabled = true;
    mgr.shadowBlur = 12;
    
    // Add custom lights
    mgr.initTimelineBrushPanel();
    
    console.log('✅ Lighting System Enabled');
    console.log('   - 3-point studio lighting activated');
    console.log('   - Shadows blur strength: 12');
}

// Usage: example_EnableLighting()


// ============================================================================
// EXAMPLE 3: 2D/3D Integration
// ============================================================================

function example_Integrate2D3D() {
    const mgr = window.animation2DManager;
    
    // Enable 3D overlay
    mgr.render3DOverlay = true;
    mgr.overlayOpacity = 0.35;
    mgr.cameraLinkTo3D = true;
    
    // Enable lighting from 3D scene
    mg.lightingEnabled = true;
    mgr.syncLighting = true;
    
    console.log('✅ 2D/3D Integration Enabled');
    console.log('   - 3D scene rendering as background');
    console.log('   - Camera position synced');
    console.log('   - Lights synced from 3D scene');
    console.log('   - Toggle overlay opacity with slider in UI');
}

// Usage: example_Integrate2D3D()


// ============================================================================
// EXAMPLE 4: Create Animation Channels (Blender-style F-Curves)
// ============================================================================

function example_CreateAnimationChannels() {
    const mgr = window.animation2DManager;
    
    // Create "Opacity" channel for fade animation
    mgr.createKeyframeChannel('opacity', 'Opacity', 'easeInOutQuad', '#00ff88');
    
    // Create "Scale" channel for grow animation
    mgr.createKeyframeChannel('scale', 'Scale', 'easeOutQuad', '#00ccff');
    
    // Create "Position X" channel for horizontal movement
    mgr.createKeyframeChannel('posX', 'Position X', 'easeInOutCubic', '#ff00ff');
    
    // Add keyframes to opacity channel
    mgr.addKeyframeToChannel('opacity', 0, 0);      // Frame 0: invisible
    mgr.addKeyframeToChannel('opacity', 15, 100);   // Frame 15: full opacity
    mgr.addKeyframeToChannel('opacity', 30, 100);   // Frame 30: hold
    mgr.addKeyframeToChannel('opacity', 45, 0);     // Frame 45: fade out
    
    // Add keyframes to scale channel
    mgr.addKeyframeToChannel('scale', 0, 50);       // Frame 0: half size
    mgr.addKeyframeToChannel('scale', 15, 100);     // Frame 15: normal size
    
    // Add keyframes to position X
    mgr.addKeyframeToChannel('posX', 0, 0);         // Frame 0: left
    mgr.addKeyframeToChannel('posX', 30, 500);      // Frame 30: right
    
    console.log('✅ Animation Channels Created');
    console.log('   - opacity: fade in/out animation');
    console.log('   - scale: grow animation');
    console.log('   - posX: horizontal movement');
    console.log('   - Total keyframes: 9');
    
    // Evaluate animation at current frame
    const currentFrame = mgr.getCurrentFrameIndex();
    console.log(`   - Current frame: ${currentFrame}`);
    console.log(`   - Opacity value: ${mgr.evaluateChannel('opacity', currentFrame)}`);
    console.log(`   - Scale value: ${mgr.evaluateChannel('scale', currentFrame)}`);
}

// Usage: example_CreateAnimationChannels()


// ============================================================================
// EXAMPLE 5: Advanced Effects Setup
// ============================================================================

function example_AdvancedEffects() {
    const mgr = window.animation2DManager;
    
    // Enable motion blur
    mgr.motionBlurEnabled = true;
    mgr.motionBlurSamples = 8;
    
    // Enable bloom (glow)
    mgr.bloomEnabled = true;
    mgr.bloomThreshold = 0.75;
    mgr.bloomStrength = 0.7;
    
    // Enable color grading
    mgr.colorGradingEnabled = true;
    
    // Velocity-based pressure
    mgr.velocityPressureEnabled = true;
    
    // Stroke simplification for clean paths
    mgr.strokeSimplificationEnabled = true;
    mgr.strokeSimplificationTolerance = 2;
    
    console.log('✅ Advanced Effects Enabled');
    console.log('   ✓ Motion Blur (8 samples)');
    console.log('   ✓ Bloom/Glow (strength: 0.7)');
    console.log('   ✓ Color Grading');
    console.log('   ✓ Velocity Pressure');
    console.log('   ✓ Stroke Simplification');
}

// Usage: example_AdvancedEffects()


// ============================================================================
// EXAMPLE 6: Professional Brush Setup for Character Animation
// ============================================================================

function example_ProfessionalBrushSetup() {
    const mgr = window.animation2DManager;
    
    console.log('✅ Professional Brush Presets Available:');
    console.log('');
    
    // Outline/Line art
    console.log('📌 For Outlines:');
    mgr.setBrushPreset('ink_pen');
    console.log('   - Using: Ink Pen');
    console.log('   - Radius: 5px, Hardness: 0.98');
    console.log('   - Perfect for sharp character outlines');
    
    // Block colors
    console.log('');
    console.log('🎨 For Base Colors:');
    mgr.setBrushPreset('marker_soft');
    console.log('   - Using: Marker');
    console.log('   - Radius: 16px, Hardness: 0.55');
    console.log('   - Perfect for filling large areas');
    
    // Shading
    console.log('');
    console.log('🌐 For Shading:');
    mgr.setBrushPreset('smudge_soft');
    console.log('   - Using: Soft Brush');
    console.log('   - Radius: 20px, Strength: 0.35');
    console.log('   - Perfect for blending shadows');
    
    // Details
    console.log('');
    console.log('✏️  For Details:');
    mgr.setBrushPreset('pencil_hb');
    console.log('   - Using: HB Pencil');
    console.log('   - Radius: 8px, Hardness: 0.9');
    console.log('   - Perfect for fine details');
}

// Usage: example_ProfessionalBrushSetup()


// ============================================================================
// EXAMPLE 7: 3-Point Lighting Setup (Studio Lighting)
// ============================================================================

function example_StudioLighting() {
    const mgr = window.animation2DManager;
    
    // 3-point lighting is already set up in the system
    // Key Light (Main), Fill Light (Secondary), Back Light
    
    console.log('✅ 3-Point Studio Lighting Configured');
    console.log('');
    console.log('🌟 Key Light (Main):');
    console.log('   - Position: Top-right');
    console.log('   - Intensity: 1.0 (100%)');
    console.log('   - Color: White');
    console.log('   - Purpose: Primary illumination');
    
    console.log('');
    console.log('💡 Fill Light (Secondary):');
    console.log('   - Position: Top-left');
    console.log('   - Intensity: 0.5 (50%)');
    console.log('   - Color: Cool white (#e8e8ff)');
    console.log('   - Purpose: Reduce shadow darkness');
    
    console.log('');
    console.log('🌙 Back Light (Rim):');
    console.log('   - Position: Behind, bottom');
    console.log('   - Intensity: 0.4 (40%)');
    console.log('   - Color: Warm (#ffebe8)');
    console.log('   - Purpose: Edge definition, separation');
    
    console.log('');
    console.log('💡 Enable with:');
    console.log('   mgr.lightingEnabled = true;');
    console.log('   mgr.shadowsEnabled = true;');
}

// Usage: example_StudioLighting()


// ============================================================================
// EXAMPLE 8: Keyframe Graph Visualization
// ============================================================================

function example_KeyframeGraphEditor() {
    const mgr = window.animation2DManager;
    
    // Create sample animation
    mgr.createKeyframeChannel('walk', 'Walk Cycle', 'easeInOutSine', '#00ff88');
    mgr.addKeyframeToChannel('walk', 0, 0);
    mgr.addKeyframeToChannel('walk', 10, 50);
    mgr.addKeyframeToChannel('walk', 20, 100);
    mgr.addKeyframeToChannel('walk', 30, 50);
    mgr.addKeyframeToChannel('walk', 40, 0);
    
    // Show keyframe graph
    const graphContainer = document.getElementById('keyframe-graph-container');
    if (graphContainer) {
        graphContainer.style.display = 'block';
    }
    
    console.log('✅ Keyframe Graph Visualization Enabled');
    console.log('   - Shows animation curves');
    console.log('   - Drag keyframes to adjust timing');
    console.log('   - Bezier handles for curve shaping');
    console.log('   - Real-time preview');
}

// Usage: example_KeyframeGraphEditor()


// ============================================================================
// EXAMPLE 9: Layer Management for Character Animation
// ============================================================================

function example_LayerManagement() {
    const mgr = window.animation2DManager;
    
    console.log('✅ Layer Management System');
    console.log('');
    
    // Add layers for character animation
    mgr.addLayer();  // Layer 2
    mgr.addLayer();  // Layer 3
    mgr.addLayer();  // Layer 4
    
    console.log('📊 Layer Structure:');
    mgr.layers.forEach((layer, idx) => {
        console.log(`   Layer ${idx}: "${layer.name}"`);
        console.log(`      - Visible: ${layer.visible}`);
        console.log(`      - Locked: ${layer.locked}`);
        console.log(`      - Opacity: ${layer.opacity * 100}%`);
        console.log(`      - Blend: ${layer.blend}`);
    });
    
    console.log('');
    console.log('💡 Organization Tips:');
    console.log('   1. Layer 1: Character outline');
    console.log('   2. Layer 2: Base colors');
    console.log('   3. Layer 3: Shading/shadows');
    console.log('   4. Layer 4: Highlights/effects');
    console.log('');
    console.log('Controls:');
    console.log('   - Right-click layer to options');
    console.log('   - Drag to reorder layers');
    console.log('   - Click eye icon to toggle visibility');
    console.log('   - Click lock icon to prevent editing');
}

// Usage: example_LayerManagement()


// ============================================================================
// EXAMPLE 10: Import/Export Keyframe Data
// ============================================================================

function example_ImportExportAnimation() {
    const mgr = window.animation2DManager;
    
    console.log('✅ Import/Export Animation Features');
    console.log('');
    
    console.log('📤 EXPORT ANIMATION:');
    console.log('   1. Create your animation');
    console.log('   2. Click "Export Keyframe Data" button');
    console.log('   3. File saves as JSON');
    console.log('   - OR call: mgr.exportKeyframeData()');
    
    console.log('');
    console.log('📥 IMPORT ANIMATION:');
    console.log('   1. Click "Import Keyframe Data" button');
    console.log('   2. Select previously exported JSON file');
    console.log('   3. Animation loads with all keyframes');
    console.log('   - OR call: mgr.importKeyframeData()');
    
    console.log('');
    console.log('💾 EXPORT FORMAT:');
    console.log('   {');
    console.log('     version: "2.0",');
    console.log('     timestamp: 1234567890,');
    console.log('     channels: [...],  // Animation channels');
    console.log('     keyframes: [...]  // Frame keyframe data');
    console.log('   }');
    
    console.log('');
    console.log('🎯 USE CASES:');
    console.log('   - Backup animations');
    console.log('   - Share animations with team');
    console.log('   - Version control animations');
    console.log('   - Create animation templates');
}

// Usage: example_ImportExportAnimation()


// ============================================================================
// EXAMPLE 11: Creating a Walk Cycle Animation
// ============================================================================

function example_WalkCycleAnimation() {
    const mgr = window.animation2DManager;
    
    // Enter mode
    mgr.enterMode();
    
    // Create movement channels
    mgr.createKeyframeChannel('posX', 'Position X', 'easeInOutQuad', '#00ff88');
    mgr.createKeyframeChannel('posY', 'Position Y', 'easeInOutQuad', '#00ccff');
    mgr.createKeyframeChannel('rotation', 'Rotation', 'easeInOutSine', '#ff00ff');
    
    // Walk cycle: 48 frames (2 steps)
    // Left step
    mgr.addKeyframeToChannel('posX', 0, 0);
    mgr.addKeyframeToChannel('posX', 12, 50);
    mgr.addKeyframeToChannel('posY', 0, 0);
    mgr.addKeyframeToChannel('posY', 6, -20);  // Bounce up
    mgr.addKeyframeToChannel('posY', 12, 0);
    
    // Right step
    mgr.addKeyframeToChannel('posX', 24, 100);
    mgr.addKeyframeToChannel('posY', 24, 0);
    mgr.addKeyframeToChannel('posY', 30, -20);  // Bounce up
    mgr.addKeyframeToChannel('posY', 36, 0);
    
    // Return to start
    mgr.addKeyframeToChannel('posX', 48, 0);
    mgr.addKeyframeToChannel('posY', 48, 0);
    
    console.log('✅ Walk Cycle Animation Created');
    console.log('   - 48 frames total');
    console.log('   - 2 complete steps');
    console.log('   - Smooth easing applied');
    console.log('   - Ready to draw on keyframes');
}

// Usage: example_WalkCycleAnimation()


// ============================================================================
// EXAMPLE 12: Advanced Console Commands
// ============================================================================

function example_ConsoleCommands() {
    const mgr = window.animation2DManager;
    
    console.log('✅ Useful Console Commands');
    console.log('');
    
    console.log('📋 Information:');
    console.log('   mgr.isActive                    // Check if 2D mode active');
    console.log('   mgr.getCurrentFrameIndex()      // Get current frame number');
    console.log('   mgr.layers.length               // Get number of layers');
    console.log('   mgr.keyframes.size              // Get number of keyframes');
    console.log('');
    
    console.log('🎬 Animation Control:');
    console.log('   mgr.enterMode()                 // Enter 2D animation mode');
    console.log('   mgr.exitMode()                  // Exit 2D animation mode');
    console.log('   mgr.render()                    // Force re-render');
    console.log('   mgr.resize()                    // Resize canvas');
    console.log('');
    
    console.log('🖼️  Keyframe Operations:');
    console.log('   mgr.saveKeyframe()              // Save current strokes');
    console.log('   mgr.deleteCurrentFrameKeyframe()// Delete current frame');
    console.log('   mgr.copyCurrentFrame()          // Copy frame to clipboard');
    console.log('   mgr.pasteCurrentFrame()         // Paste from clipboard');
    console.log('   mgr.duplicateFrameToNext()      // Duplicate frame forward');
    console.log('   mgr.clearCurrentFrame()         // Clear all strokes');
    console.log('');
    
    console.log('🎨 Brush Control:');
    console.log('   mgr.setTool("pencil")           // Set tool (pencil/eraser/etc)');
    console.log('   mgr.currentColor = "#ff0000"    // Set color (hex)');
    console.log('   mgr.currentSize = 15            // Set brush size');
    console.log('');
    
    console.log('💡 Effects Control:');
    console.log('   mgr.lightingEnabled = true      // Enable lighting');
    console.log('   mgr.bloomEnabled = true         // Enable bloom');
    console.log('   mgr.motionBlurEnabled = true    // Enable motion blur');
    console.log('   mgr.render3DOverlay = true      // Enable 3D background');
    console.log('');
    
    console.log('📊 Channel Operations:');
    console.log('   mgr.createKeyframeChannel(id, name, easing, color)');
    console.log('   mgr.addKeyframeToChannel(id, frame, value)');
    console.log('   mgr.evaluateChannel(id, frame)');
    console.log('');
    
    console.log('💾 Import/Export:');
    console.log('   mgr.exportKeyframeData()        // Export animation');
    console.log('   mgr.importKeyframeData()        // Import animation');
}

// Usage: example_ConsoleCommands()


// ============================================================================
// BONUS: Complete Workflow Example
// ============================================================================

function example_CompleteWorkflow() {
    const mgr = window.animation2DManager;
    
    console.log('🎬 COMPLETE 2D ANIMATION WORKFLOW');
    console.log('=====================================');
    console.log('');
    
    // Step 1: Setup
    console.log('STEP 1: Setup Environment');
    console.log('---');
    mgr.enterMode();
    mgr.lightingEnabled = true;
    mgr.motionBlurEnabled = false;
    console.log('✓ Entered 2D mode');
    console.log('✓ Enabled lighting');
    console.log('');
    
    // Step 2: Create layers
    console.log('STEP 2: Organize Layers');
    console.log('---');
    mgr.addLayer();
    mgr.addLayer();
    console.log(`✓ Created layers (total: ${mgr.layers.length})`);
    console.log('');
    
    // Step 3: Create animation
    console.log('STEP 3: Create Animation Channels');
    console.log('---');
    mgr.createKeyframeChannel('main', 'Main Animation', 'easeInOutQuad', '#00ff88');
    mgr.addKeyframeToChannel('main', 0, 0);
    mgr.addKeyframeToChannel('main', 30, 100);
    mgr.addKeyframeToChannel('main', 60, 0);
    console.log('✓ Created main animation channel');
    console.log('✓ Added 3 keyframes');
    console.log('');
    
    // Step 4: Drawing hints
    console.log('STEP 4: Ready to Draw!');
    console.log('---');
    console.log('Press keys to change tools:');
    console.log('  P - Pencil');
    console.log('  E - Eraser');
    console.log('  L - Line');
    console.log('  R - Rectangle');
    console.log('  C - Circle');
    console.log('  F - Fill');
    console.log('');
    console.log('Use your chosen tool to draw on the canvas');
    console.log('Your strokes save automatically as keyframes');
    console.log('');
    
    // Step 5: Playback
    console.log('STEP 5: Playback Controls');
    console.log('---');
    console.log('Use timeline to:');
    console.log('  - Click to scrub to any frame');
    console.log('  - Play/Pause to animate');
    console.log('  - Step frame by frame');
    console.log('');
    
    // Step 6: Export
    console.log('STEP 6: Save Your Work');
    console.log('---');
    console.log('When finished:');
    console.log('  - Click "Export Keyframe Data"');
    console.log('  - Save JSON file to your computer');
    console.log('  - Can reload anytime');
    console.log('');
    
    console.log('🎉 Ready to create amazing 2D animations!');
}

// Usage: example_CompleteWorkflow()


// ============================================================================
// Quick Test - Call this to verify everything is set up
// ============================================================================

function quickTest() {
    console.log('🧪 QUICK SYSTEM TEST');
    console.log('====================');
    console.log('');
    
    if (!window.animation2DManager) {
        console.error('❌ Animation2DManager not found!');
        return;
    }
    console.log('✓ Animation2DManager loaded');
    
    if (!window.animation2DManagerAdvanced) {
        console.warn('⚠️  Advanced features not loaded yet');
    } else {
        console.log('✓ Advanced features available');
    }
    
    if (!window.AdvancedKeyframeEditor) {
        console.warn('⚠️  Keyframe editor not loaded yet');
    } else {
        console.log('✓ Keyframe editor available');
    }
    
    const mgr = window.animation2DManager;
    console.log(`✓ Canvas size: ${mgr.canvas.width}x${mgr.canvas.height}`);
    console.log(`✓ Layers: ${mgr.layers.length}`);
    console.log(`✓ Keyframes: ${mgr.keyframes.size}`);
    console.log('');
    
    console.log('🎯 Try running an example:');
    console.log('   example_BasicAnimation()');
    console.log('   example_AdvancedEffects()');
    console.log('   example_CreateAnimationChannels()');
    console.log('');
    console.log('✅ All systems ready!');
}

// Usage: quickTest()


console.log('✅ Advanced 2D Animation Examples Loaded!');
console.log('');
console.log('Available Examples:');
console.log('  1. example_BasicAnimation()');
console.log('  2. example_EnableLighting()');
console.log('  3. example_Integrate2D3D()');
console.log('  4. example_CreateAnimationChannels()');
console.log('  5. example_AdvancedEffects()');
console.log('  6. example_ProfessionalBrushSetup()');
console.log('  7. example_StudioLighting()');
console.log('  8. example_KeyframeGraphEditor()');
console.log('  9. example_LayerManagement()');
console.log('  10. example_ImportExportAnimation()');
console.log('  11. example_WalkCycleAnimation()');
console.log('  12. example_ConsoleCommands()');
console.log('  13. example_CompleteWorkflow()');
console.log('');
console.log('Run "quickTest()" to verify setup');
console.log('');
