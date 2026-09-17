# Advanced 2D Animation System - Complete Guide

## Overview

The SM-Engine now features a **Blender-like advanced 2D animation system** with professional-grade capabilities including:

- 🎨 **Bezier Keyframe Curves** with easing functions
- 🎬 **2D/3D Integration** - Mix animations with 3D scene
- 💡 **Dynamic Lighting & Shadows** from 3D lights
- ⚙️ **Advanced Effects** - Bloom, Motion Blur, Color Grading
- 🖌️ **Enhanced Brushes** - Velocity pressure, simplification, texturing
- 📊 **Keyframe Graph Editor** - F-curve style visualization
- 🚀 **Performance Optimized** - GPU-accelerated rendering

---

## Getting Started

### Entering 2D Animation Mode

1. Click **"2D Mode"** → **"Enter 2D Animation Mode"** in the toolbar
2. Or press the **Enter 2D Animation Mode** button
3. The canvas will switch to 2D animation view with white background
4. The 3D viewport becomes disabled (can be changed in settings)

### Basic Drawing

**Tools Available:**
- **P** - Pencil (pressure-sensitive, smooth strokes)
- **E** - Eraser (non-destructive)
- **L** - Line Tools
- **R** - Rectangle
- **C** - Circle
- **F** - Fill/Color Block
- **Y** - Spray/Particle Brush
- **Alt** - Pan view (hold)
- **Space** - Hand tool (pan)
- **Scroll** - Zoom in/out
- **0** - Reset view

---

## Advanced Features

### 1. Lighting & Shadows System

**Enable Lighting:**
```javascript
animation2DManager.lightingEnabled = true;
animation2DManager.shadowsEnabled = true;
animation2DManager.shadowBlur = 8;  // 0-30
```

**Features:**
- 3-point light setup (Key, Fill, Back)
- DirectionalLight support (sunlight effects)
- PointLight support (glowing effects)
- SpotLight support (focused illumination)
- Soft shadows with customizable blur
- Real-time light syncing from 3D scene

**How it works:**
- Extracts all lights from your 3D scene
- Projects light positions onto 2D canvas
- Applies shadow gradients and glow effects
- Updates in real-time as 3D lights change

### 2. 2D/3D Integration

**Enable 3D Overlay:**
```javascript
animation2DManager.render3DOverlay = true;
animation2DManager.overlayOpacity = 0.3;  // 0-1
animation2DManager.cameraLinkTo3D = true;
```

**Features:**
- Render 3D scene as background layer
- Line up 2D animation with 3D models
- Camera position synchronization
- Project shadows from 3D objects
- Depth-based compositing

**Workflow:**
1. Create your 3D scene with characters/objects
2. Enable "Render 3D Overlay"
3. Draw 2D animation on top
4. Use "Overlay Opacity" to adjust blend
5. Disable when rendering final 2D

### 3. Advanced Keyframe System

**Create Animation Channels:**
```javascript
const manager = window.animation2DManager;
manager.createKeyframeChannel('walkCycle', 'Walk Cycle', 'easeInOutQuad', '#00ff88');
manager.addKeyframeToChannel('walkCycle', 0, 0);
manager.addKeyframeToChannel('walkCycle', 10, 100);
```

**Easing Functions Available:**
- `linear` - Constant speed
- `easeInQuad` - Slow start
- `easeOutQuad` - Slow end
- `easeInOutQuad` - Slow start & end
- `easeInCubic` - Cubic acceleration
- `easeOutCubic` - Cubic deceleration
- `easeInOutCubic` - Smooth cubic
- `easeInCirc` - Sharp acceleration
- `easeOutCirc` - Sharp deceleration
- `easeInOutCirc` - Smooth circular

**Bezier Handles:**
- Right-click on keyframe to edit Bezier handles
- Drag handles to adjust curve smoothness
- Shift-click to select multiple keyframes

### 4. Enhanced Effects

#### Motion Blur
```javascript
animation2DManager.motionBlurEnabled = true;
animation2DManager.motionBlurSamples = 4;
```

#### Color Grading
```javascript
animation2DManager.colorGradingEnabled = true;
// Load LUT (Look-Up Table) for color grading
animation2DManager.colorGradingLUT = lutArray;
```

#### Bloom (Glow)
```javascript
animation2DManager.bloomEnabled = true;
animation2DManager.bloomThreshold = 0.8;  // 0-1
animation2DManager.bloomStrength = 0.5;   // 0-1
```

### 5. Stroke Enhancements

#### Velocity-Based Pressure
```javascript
animation2DManager.velocityPressureEnabled = true;
```
Strokes become thicker when drawing faster, thinner when slow.

#### Stroke Simplification
```javascript
animation2DManager.strokeSimplificationEnabled = true;
animation2DManager.strokeSimplificationTolerance = 2;  // 0.5-5
```
Reduces stroke points while maintaining shape (Ramer-Douglas-Peucker algorithm).

#### Stroke Texturing
```javascript
animation2DManager.strokeTexturingEnabled = true;
```
Adds texture and variation to brush strokes.

### 6. Advanced Brush Settings

**Brush Presets:**
- HB Pencil - Technical precision
- Ink Pen - Sharp, defined lines
- Marker - Soft, blended coverage
- Calligraphy - Tapered elegant strokes
- Hatch - Pattern/texture creation
- Spray - Loose particles
- Soft Eraser - Non-destructive removal
- Fill - Color block filling

**Brush Parameters:**
- **Radius** - Brush size (1-50px)
- **Strength** - Opacity intensity (0-1)
- **Spacing** - Distance between points (0-1)
- **Jitter** - Random variation (0-1)
- **Hardness** - Edge softness (0-1)
- **Streamline** - Stroke smoothing (0-1)
- **Taper Start** - Beginning taper (0-1)
- **Taper End** - Ending taper (0-1)

**Blend Modes:**
- Normal
- Multiply
- Screen
- Overlay
- Soft Light
- Hard Light

### 7. Layers & Organization

**Layer Features:**
- Multiple independent layers
- Layer visibility toggle
- Layer locking (prevent editing)
- Layer opacity control (0-100%)
- Layer blend modes
- Rename layers

**Best Practices:**
1. Use separate layers for:
   - Character outline
   - Shading
   - Highlights
   - Effects/Particles
   - Background

### 8. Symmetry & Stabilization

**Mirror Drawing:**
- Enable "Mirror X" checkbox
- Draw on one side, automatically mirrors to other side

**Stabilizer (Smoothing):**
- Reduces jitter and hand tremor
- Streamlines path for cleaner lines
- Essential for smooth animation

### 9. Reference Images

**Load Reference Image:**
1. Click "Import Image" button
2. Select an image file
3. Adjust opacity with slider
4. Toggle fit mode: **Fit** | **Fill** | **Actual**

**Use Cases:**
- Trace characters
- Match model proportions
- Follow storyboards
- Align with reference poses

---

## Keyframe Editor (F-Curve Graph)

The Keyframe Graph Editor is like Blender's Graph Editor:

### Accessing the Graph Editor
```javascript
// Toggle keyframe graph visibility
const graphContainer = document.getElementById('keyframe-graph-container');
graphContainer.style.display = graphContainer.style.display === 'none' ? 'block' : 'none';
```

### Features
- **View multiple animation channels** simultaneously
- **Edit keyframes** by dragging
- **Adjust Bezier handles** for curve shaping
- **Copy/Paste keyframes** between channels
- **Delete keyframes** (select + press Delete)

---

## 2D/3D Mixing Workflow

### Example: Animate Character Over 3D Scene

**Step 1: Prepare 3D Scene**
```javascript
// Your 3D scene is already set up with a character model
scene.add(characterModel);
scene.add(new THREE.DirectionalLight());
```

**Step 2: Enable Integration**
```javascript
animation2DManager.render3DOverlay = true;
animation2DManager.overlayOpacity = 0.4;
animation2DManager.cameraLinkTo3D = true;
```

**Step 3: Enter 2D Mode and Animate**
- The 3D model appears faintly in background
- Draw 2D animation on top
- Lighting affects both 2D and 3D layers

**Step 4: Export Final**
1. Adjust overlay opacity to 0
2. Render/Export 2D animation
3. Composite with 3D render in post

---

## Performance Tips

1. **Disable unnecessary features:**
   - Turn off lighting if not needed
   - Disable 3D overlay when not animating
   - Use motion blur sparingly

2. **Optimize brush settings:**
   - Reduce jitter for faster rendering
   - Lower brush radius
   - Disable texturing if not needed

3. **Manage strokes:**
   - Simplify strokes regularly
   - Clear old frames you're not using
   - Keep layer count reasonable

4. **Canvas resolution:**
   - Work at 1080p or lower for smooth performance
   - Scale up for export if needed

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| P | Pencil Tool |
| E | Eraser Tool |
| L | Line Tool |
| R | Rectangle |
| C | Circle |
| F | Fill |
| Y | Spray |
| Alt | Pan (hold) |
| Space | Hand tool |
| Scroll | Zoom |
| 0 | Reset view |
| Esc | Exit 2D Mode |
| Shift + Click | Multi-select keyframes |
| Delete | Delete selected keyframes |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |

---

## Import/Export

### Export Keyframe Data

**Export to JSON:**
```javascript
animation2DManager.exportKeyframeData();
// Downloads: 2d-animation-keyframes-[timestamp].json
```

**Export includes:**
- All keyframe data
- Channel information (easing, color)
- Stroke properties
- Layer information
- Timeline metadata

### Import Previous Animation

**Load from JSON:**
```javascript
animation2DManager.importKeyframeData();
// Opens file picker - select previously exported JSON
```

### Batch Operations
```javascript
// Export all animation data
const data = {
    version: '2.0',
    channels: Array.from(animation2DManager.keyframeChannels.entries()),
    keyframes: Array.from(animation2DManager.keyframes.entries())
};
```

---

## Advanced Scripting

### Hook Into Animation Events

```javascript
// Trigger when frame changes
window.addEventListener('timeUpdate', () => {
    console.log('Current frame:', animation2DManager.getCurrentFrameIndex());
});

// Access current stroke data
console.log(animation2DManager.strokes);

// Get channel value at specific time
const value = animation2DManager.evaluateChannel('walkCycle', 15);
```

### Programmatic Animation Creation

```javascript
// Create animation programmatically
function createSimpleAnimation() {
    animation2DManager.createKeyframeChannel('opacity', 'Opacity', 'easeInOutQuad', '#00ff00');
    
    // Fade in
    animation2DManager.addKeyframeToChannel('opacity', 0, 0);
    animation2DManager.addKeyframeToChannel('opacity', 30, 100);
    
    // Hold
    animation2DManager.addKeyframeToChannel('opacity', 60, 100);
    
    // Fade out
    animation2DManager.addKeyframeToChannel('opacity', 90, 0);
}
```

---

## Troubleshooting

### Canvas Not Displaying
```javascript
// Check if manager is active
console.log(animation2DManager.isActive);

// Manually activate if needed
animation2DManager.enterMode();
animation2DManager.render();
```

### Lighting Not Showing
```javascript
// Ensure lighting is enabled
animation2DManager.lightingEnabled = true;

// Check if scene has lights
console.log(scene.children.filter(o => o.isLight));
```

### Performance Issues
```javascript
// Disable heavy features
animation2DManager.bloomEnabled = false;
animation2DManager.motionBlurEnabled = false;
animation2DManager.shadowsEnabled = false;
animation2DManager.render3DOverlay = false;
```

### Brush Strokes Appearing Pixelated
```javascript
// Ensure simplification tolerance is appropriate
animation2DManager.strokeSimplificationTolerance = 1; // Lower = more detail
```

---

## API Reference

### Main Manager Methods

```javascript
const mgr = animation2DManager;

// Mode control
mgr.enterMode()                          // Enter 2D animation mode
mgr.exitMode()                           // Exit 2D animation mode
mgr.isActive                             // Boolean - is mode active

// Keyframe operations
mgr.saveKeyframe()                       // Save current strokes as keyframe
mgr.deleteCurrentFrameKeyframe()         // Delete current frame
mgr.copyCurrentFrame()                   // Copy current frame to clipboard
mgr.pasteCurrentFrame()                  // Paste clipboard to current frame
mgr.duplicateFrameToNext()               // Duplicate frame forward
mgr.clearCurrentFrame()                  // Clear all strokes on frame

// Layer operations
mgr.addLayer()                           // Create new layer
mgr.removeCurrentLayer()                 // Delete active layer
mgr.getCurrentLayer()                    // Get active layer object
mgr.layers                               // Array of all layers

// Brush operations
mgr.setBrushPreset(id)                  // Set active brush preset
mgr.setTool(tool)                       // Set active tool (pencil, eraser, etc)

// Rendering
mgr.render()                             // Force re-render
mgr.resize()                             // Resize canvas

// Import/Export
mgr.exportKeyframeData()                // Export to JSON
mgr.importKeyframeData()                // Import from JSON
```

---

## Best Practices

### Animation Quality
1. **Use high frame rates:** 24fps or 30fps minimum
2. **Smooth strokes:** Enable stabilizer, reduce jitter
3. **Layer organization:** Separate foreground, midground, background
4. **Reference:** Use reference images for proportions
5. **Symmetry:** Enable for bilateral designs

### Performance
1. **Reduce resolution** for faster feedback during animation
2. **Export at high res** when rendering final output
3. **Bake effects** (bloom, blur) when final
4. **Optimize brush settings** for your hardware

### Integration with 3D
1. **Match perspective:** Align 2D drawing angle with 3D camera
2. **Consistent lighting:** Make sure 3D lights match 2D mood
3. **Test compositing:** Preview final 2D + 3D blend
4. **Separate passes:** Export 2D and 3D separately for maximum control

---

## File Structure

```
2D-editor/2D-tools/
├── Animation2DManager.js           (Core 2D animation)
├── Animation2DManagerAdvanced.js   (Advanced features)
├── AdvancedKeyframeEditor.js       (Keyframe graph editor)
├── Advanced2D3DIntegration.js      (2D/3D mixing)
└── Viewport2DManager.js            (Alternative 2D mode)

css/
└── 2d-animation-advanced.css       (UI styling)
```

---

## Recent Improvements (v2.0)

✅ **Blender-like Features**
- Bezier keyframe curves with easing
- Multi-channel animation system
- F-curve graph editor visualization

✅ **Professional Effects**
- 3-point studio lighting
- Dynamic shadow projection
- Color grading & bloom
- Motion blur
- Chromatic aberration

✅ **2D/3D Integration**
- Real-time light syncing
- Camera position linking
- Depth-based compositing
- 3D object shadow projection

✅ **Enhanced Tools**
- Velocity-based pressure
- Stroke simplification (RDP algorithm)
- 9 brush presets + custom settings
- Non-destructive editing

✅ **Professional Workflow**
- Keyframe import/export
- Advanced layer system
- Reference image support
- Grid and snapping

---

## Future Enhancements

🔄 Planned Features:
- Particle effects system
- Procedural brush engine
- IK animation helpers
- Automated in-betweening
- Vector shape tools
- Gradient fills
- Text tool
- Advanced masking
- Onion skin improvements
- Rendering presets

---

## Support & Resources

- **Documentation:** See this file
- **Examples:** Check `QUICK_START_EXAMPLES.js`
- **API:** Reference section above
- **Community:** Share your creations!

---

**Version 2.0 - Built for SM-Engine**
*Professional-grade 2D animation for the web platform*
