# Advanced Storyboard 2D Panel - Complete Documentation

## Overview
Professional-grade storyboarding system for animation production integrated with SM-Engine's 2D animation tools. Inspired by professional animation software and Japanese animation production standards.

## Features

### 1. **Multiple View Modes**
- **Grid View**: Classic storyboard layout with visual frame cards
- **List View**: Compact, text-focused view for rapid editing
- **Detail View**: Full-featured editor for individual frames

### 2. **Frame Management**
- Create, duplicate, and delete frames
- Real-time frame numbering and timecode display
- Batch operations support
- Frame linking and grouping

### 3. **Professional Metadata**
- **Scene Names**: Custom scene titling
- **Duration**: Per-frame timing control with FPS synchronization
- **Director's Notes**: Detailed production notes
- **Camera Directions**: Professional cinematography notes
- **Audio/SFX**: Sound design annotations
- **Tags**: Custom tagging system for organization

### 4. **Advanced Features**
- **Undo/Redo System**: Full history with visual state management (50 state limit)
- **Timeline Scrubber**: Interactive timeline with playback controls
- **Export/Import**: JSON-based data exchange for version control
- **Auto-Save**: Automatic data persistence to localStorage
- **Keyboard Shortcuts**: Professional workflow acceleration

### 5. **Integration Features**
- Canvas capture from Animation2DManager
- Layer metadata tracking
- Timeline synchronization
- Real-time preview integration

### 6. **Advanced Export Options**
- Shot list generation (text format)
- Image grid export (for printing)
- PDF export (with html2pdf)
- Comparison/diff analysis with previous versions

## Installation

### Already Integrated
The storyboard panel has been automatically integrated into your SM-Engine:
- CSS: `css/storyboard-panel.css`
- Manager: `2D-editor/2D-tools/Storyboard2DManager.js`
- Integration: `2D-editor/2D-tools/Storyboard2DIntegration.js`

### Manual Integration (if needed)
```html
<!-- Add to your HTML head -->
<link rel="stylesheet" href="css/storyboard-panel.css">

<!-- Add to your HTML body (before closing body tag) -->
<script src="2D-editor/2D-tools/Storyboard2DManager.js"></script>
<script src="2D-editor/2D-tools/Storyboard2DIntegration.js"></script>
```

## Usage Guide

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Create new frame |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+D` | Duplicate frame |
| `Delete` | Delete selected frame |

### Creating Your First Storyboard

1. **Access the Manager**
   ```javascript
   // Via console
   const storyboard = window.storyboard2DManager;
   storyboard.activate();
   ```

2. **Create Frames**
   - Click "+" button in toolbar, or press `Ctrl+N`
   - Each frame gets auto-numbered

3. **Edit Frame Details**
   - Switch to Detail View
   - Fill in scene name, duration, notes
   - Add camera directions and audio cues

4. **Organize with Tags**
   - Add comma-separated tags
   - Use for filtering and categorization

### Programmatic API

#### Creating Frames
```javascript
const storyboard = window.storyboard2DManager;

// Create a new frame
const frameId = storyboard.createNewFrame();

// Create frame with data
const frameId = storyboard.createNewFrame({
    sceneName: 'Opening Scene',
    duration: 3.5,
    notes: 'Wide shot of landscape',
    cameraDirections: 'Slow pan left to right',
    audioSFX: 'Morning birds',
    tags: ['exterior', 'establishing']
});
```

#### Accessing Frame Data
```javascript
// Get all frames
storyboard.frames.forEach((frameData, frameId) => {
    console.log(frameData);
});

// Get specific frame
const frameData = storyboard.frames.get('frame_1');

// Select a frame
storyboard.selectFrame('frame_1');
```

#### View Management
```javascript
// Switch views
storyboard.setViewMode('grid');   // 'grid' | 'list' | 'detail'

// Get current view
console.log(storyboard.currentViewMode);
```

#### Timeline & Playback
```javascript
// Get total duration
const totalDuration = storyboard.getTotalDuration();

// Format timecode
const timecode = storyboard.formatTimecode(15.5); // Returns "0:15:50"

// Get statistics
const stats = storyboard.getStatistics();
console.log(stats);
```

#### Export/Import
```javascript
// Export as JSON
storyboard.exportStoryboard(); // Downloads .json file

// Import from JSON
storyboard.importStoryboard(); // Opens file picker

// Export shot list
const shotList = storyboard.integration.exportShotList();

// Generate statistics
const stats = storyboard.getStatistics();
```

#### History Management
```javascript
// Undo
storyboard.undo();

// Redo
storyboard.redo();

// Check history state
console.log(storyboard.history.currentIndex);
console.log(storyboard.history.states.length);
```

## Advanced Integration

### Canvas Integration
```javascript
// Capture current animation canvas as frame
const integration = window.storyboard2DIntegration;
const frameId = storyboard.createNewFrame();
integration.captureCurrentCanvasToFrame(frameId);

// Preview frame in canvas
integration.previewFrameInCanvas(frameId);
```

### Batch Import
```javascript
const imageUrls = [
    'path/to/image1.png',
    'path/to/image2.png',
    'path/to/image3.png'
];

window.storyboard2DIntegration.batchImportFrames(imageUrls);
```

### Generate Image Grid
```javascript
const canvas = window.storyboard2DIntegration.exportAsImageGrid({
    cols: 3,
    rows: 4,
    scale: 1,
    showLabels: true,
    backgroundColor: '#1e293b'
});

// Save as image
const link = document.createElement('a');
link.href = canvas.toDataURL('image/png');
link.download = 'storyboard.png';
link.click();
```

### Shot List Generation
```javascript
const shotList = window.storyboard2DIntegration.generateShotList();
console.log(shotList);
// Returns formatted text with all scene information
```

### Statistics & Analysis
```javascript
const stats = window.storyboard2DIntegration.getStatistics();
console.log(stats);
/*
{
    frameCount: 10,
    totalDuration: 25.5,
    averageDuration: 2.55,
    minDuration: 1.0,
    maxDuration: 5.0,
    totalTags: 23,
    framesWithNotes: 8,
    estimatedFrameRate: 24,
    totalFrameCount: 612
}
*/
```

### Comparison with Previous Version
```javascript
// Load previously exported data
const oldExport = JSON.parse(localStorage.getItem('storyboard_backup'));

const comparison = window.storyboard2DIntegration.compareWithExport(oldExport);
/*
{
    added: [...],
    removed: [...],
    modified: [...],
    unchanged: 5
}
*/
```

## Data Persistence

### Auto-Save
Storyboard data is automatically saved to localStorage every 30 seconds (configurable).

```javascript
// Manual save
storyboard.saveStoredData();

// Load saved data
storyboard.loadStoredData();
```

### Data Structure
```javascript
{
    version: "1.0",
    exportedAt: "2024-03-19T...",
    settings: {
        autoSave: true,
        frameRate: 24,
        defaultDuration: 2.0
    },
    frames: [
        {
            id: "frame_1",
            number: 1,
            timestamp: 1234567890,
            duration: 2.0,
            sceneName: "Scene 1",
            notes: "Director's notes...",
            cameraDirections: "Pan left",
            audioSFX: "Background music",
            tags: ["establishing", "exterior"],
            previewImage: "data:image/png;base64,...",
            layerData: [...],
            metadata: {}
        }
    ]
}
```

## Customization

### CSS Variables
Modify theme colors by updating CSS variables:

```css
:root {
    --sb-primary: #1e293b;
    --sb-accent: #3b82f6;
    --sb-accent-bright: #60a5fa;
    --sb-text: #f1f5f9;
    --sb-text-muted: #cbd5e1;
    /* ... more variables ... */
}
```

### Settings Configuration
```javascript
storyboard.settings = {
    autoSave: true,
    autoSaveInterval: 30000,  // milliseconds
    frameRate: 24,
    defaultDuration: 2.0,
    showFrameNumbers: true,
    showTimecodes: true,
    gridColumns: 'auto',
    toolbarPosition: 'top'
};
```

### Custom Modals
```javascript
storyboard.showCustomModal('Title', '<div>HTML content here</div>');
```

## Professional Workflow

### Pre-Production
1. Create storyboard with high-level shots
2. Add detailed notes for each scene
3. Specify camera movements
4. Add sound design notes

### Production
1. Capture frames from animation canvas
2. Review in grid/list view
3. Adjust timing as needed
4. Update metadata in real-time

### Post-Production
1. Generate shot list
2. Export image grid for review
3. Compare versions
4. Archive final storyboard

## Performance Optimization

### For Large Projects
1. Use list view instead of grid for 50+ frames
2. Enable auto-save intervals (avoid 10s intervals)
3. Clear history periodically: `storyboard.history.states = [];`
4. Export and archive old projects

### Memory Management
```javascript
// Clear history
storyboard.history.states = [];
storyboard.history.currentIndex = -1;

// Clear preview images (if needed)
storyboard.frames.forEach(frame => {
    frame.previewImage = null;
});
```

## Troubleshooting

### Frames Not Saving
- Check localStorage is enabled
- Verify `autoSave` setting is true
- Call `storyboard.saveStoredData()` manually

### Import Issues
- Ensure JSON file matches expected format
- Check browser console for error messages
- Verify file is not corrupted

### UI Not Appearing
- Check CSS file is loaded
- Verify container element exists
- Call `storyboard.activate()` in console

### Performance Issues
- Use list view instead of grid
- Clear old history
- Reduce preview image quality
- Split into multiple projects

## API Reference

### Storyboard2DManager

#### Methods
```javascript
// Frame Management
createNewFrame(referenceData?)
deleteSelectedFrame()
duplicateSelectedFrame()
selectFrame(frameId)
loadFrameDetails(frameId)
saveFrameDetails()

// UI Control
setViewMode(mode: 'grid'|'list'|'detail')
refreshUI()
activate()
deactivate()

// History
undo()
redo()
saveHistory()

// Data
exportStoryboard()
importStoryboard()
saveStoredData()
loadStoredData()

// Utilities
formatTimecode(seconds: number): string
getTotalDuration(): number
```

#### Properties
```javascript
frames: Map<frameId, frameData>
selectedFrameId: string
currentViewMode: string
settings: object
history: object
elements: Map<elementName, HTMLElement>
```

### Storyboard2DIntegration

#### Methods
```javascript
initialize()
captureCurrentCanvasToFrame(frameId)
previewFrameInCanvas(frameId)
exportAsImageGrid(options?)
exportAsPDF()
batchImportFrames(imageUrls)
generateShotList(): string
exportShotList()
getStatistics(): object
compareWithExport(exportedData): object
```

## Best Practices

1. **Regular Exports**: Export your storyboard regularly for backup
2. **Descriptive Notes**: Add detailed director's notes for clarity
3. **Consistent Tagging**: Use consistent tag naming across project
4. **Timing Values**: Set realistic durations for accurate total time
5. **Scene Organization**: Group related scenes with consistent naming
6. **Backup Strategy**: Use version control for storyboard exports

## Common Workflows

### Quick Sketch & Annotate
1. Create frame with Ctrl+N
2. Switch to Detail view
3. Add notes and camera directions
4. Tag for organization
5. Move to next frame

### Frame-by-Frame Review
1. Use List view
2. Click through frames
3. Annotate as needed
4. Export when satisfied

### Production Planning
1. Create all frames first
2. Generate statistics
3. Create shot list
4. Export image grid
5. Share with team

## Support & Resources

### Keyboard Shortcuts Reference
- Print to PDF in Detail view for shot list
- Use Tags for searchability
- Leverage camera directions for VFX notes

### Performance Tips
- Desktop: Use grid view (faster rendering)
- Mobile: Use list view (better performance)
- Large projects: Split into multiple files

## License & Attribution

This storyboarding system is part of SM-Engine, an advanced web-based 3D/2D editor.

## Version History

### v1.0 (Current)
- Initial release
- Grid, List, Detail views
- Full frame management
- Export/Import system
- Timeline integration
- Auto-save functionality

---

**For more information, visit:** [SM-Engine Repository](https://github.com/MEDELBOU3/SM-Engine)
