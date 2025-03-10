<div align="center" style="
    width: 100%;
    height: 450px;
    background: #f5f5f5;
    margin-bottom: 2rem;
    display: flex;
    justify-content: center;
    align-items: center;
">
    <img src="screenshoots/logo.png" alt="3D Editor Logo" style="
        max-width: 250px;
        height: auto;
        filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
    ">
</div>

# 3D Modeling Editor Project

A modular 3D modeling editor with physics simulation capabilities and node-based editing.
![Interface Overview](screenshoots/Screenshot%20(93).png)
![Interface Overview](screenshoots/Screenshot%20(92).png)
![Interface Overview](screenshoots/Screenshot%20(56).png)
![Workspace Example](screenshoots/Screenshot%20(91).png)
![Workspace Example](screenshoots/Screenshot%20(54).png)

## Features

### Core Tools
- **Node Editor**: Create complex relationships using visual node graphs
- **Physics Demonstrations**: Multiple physics simulation environments
- **Brush Modeling**:
  - Adjustable brush size and density
  - Direct model upload capability
  - File import support (.obj, .fbx, .stl)

### Viewport Controls
- Orthographic camera presets
- Multiple camera angles
- Real-time FPS monitoring
- Object count tracking

### Workflow
- Standard undo/redo system
- Asset management panel
- Export to common 3D formats
- Recording system with time tracking

## Interface Overview

```plaintext
1. Main Toolbar
   - New/Save/Load projects
   - Assets management
   - Export functionality
   - Inspector panel

2. Hierarchy Panel
   - Physics simulation environments
   - Camera controls (Ortho camera_5)
   - Node/Animator organization

3. Brush Settings
   - Density controls
   - Model upload interface
   - File selection dialog

4. I/O Monitoring
   - Real-time FPS counter
   - Active object counter
   - Recording status

Quick Start
Create new scene: File > New
   Add physics environment from Hierarchy
   Use brush tools to sculpt/modify models
   Adjust camera views using orthographic presets
   Monitor performance through Output panel

   Development Requirements
   OpenGL 4.0+ compatible GPU

   .NET Framework 4.8
   8GB VRAM recommended for complex models
```



