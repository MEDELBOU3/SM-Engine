# ✨ SM-Engine: 3D Modeling & Physics Editor ✨

<div class="logo">
    <img src="logo.svg" alt="SM Engine Logo" width="42" height="42" class="logo__icon">
    <span class="logo__text">SM Engine<span class="logo__text-pro">TM</span></span>
</div>

<p align="center">
  <strong>A comprehensive and modular 3D modeling editor built with html css js and webGL, featuring node-based workflows, integrated physics simulation, and powerful brush tools.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Platform-Windows-informational" alt="Platform: Windows">
  <img src="https://img.shields.io/badge/.NET-4.8-blueviolet" alt=".NET Framework 4.8">
  <img src="https://img.shields.io/badge/OpenGL-4.0%2B-success" alt="OpenGL 4.0+">
  <a href="https://github.com/medelbou3/SM-Engine/releases"><img src="https://img.shields.io/github/v/release/medelbou3/SM-Engine?include_prereleases" alt="Release"></a>
  <a href="https://github.com/medelbou3/SM-Engine/issues"><img src="https://img.shields.io/github/issues/medelbou3/SM-Engine" alt="Issues"></a>
</p>

---

## 📸 Visual Showcase

<div align="center">
  <img src="screenshoots/Screenshot%20(93).png" alt="Main Editor Interface" width="90%">
  <p><em>Main interface with the powerful Node Editor panel and 3D viewport</em></p>
</div>

<div align="center">
  <img src="screenshoots/Screenshot%20(92).png" alt="Physics Simulation" width="90%">
  <p><em>The integrated physics engine with real-time object interactions</em></p>
</div>

<div align="center">
  <img src="screenshoots/Screenshot%20(56).png" alt="Brush Modeling Tools" width="90%">
  <p><em>Brush Modeling panel with density controls and import options</em></p>
</div>

<div align="center">
  <img src="screenshoots/sculpting&modeling.png" alt="Brush Modeling Tools" width="90%">
  <img src="screenshoots/modeling.png" alt="Brush Modeling Tools" width="90%">
  <p><em>Modeling and sculpting tools in real time</em></p>
</div>

<div align="center">
  <h2>Architecture Tools</h2>
  <h3>Wall Tools</h3>
  <img src="screenshoots/wall-preview.png" alt="line preview" width="90%">
  <img src="screenshoots/confirm-wall-placement1.png" alt="wall added" width="90%">
  <img src="screenshoots/confirm-wall-placement2.png" alt="wall added-select" width="90%">
  <h3>Windows and doors tools</h3>
  <img src="screenshoots/window-placement-preview.png" alt="box preview" width="90%">
  <p><em>Architecture Tools Wall to build what you need</em></p>
  
</div>

<div align="center">
  <img src="screenshoots/Screenshot%20(91).png" alt="Editor Workspace" width="90%">
  <p><em>Workspace overview with Scene Hierarchy and Asset Management</em></p>
</div>

<div align="center">
  <img src="screenshoots/Screenshot%20(54).png" alt="3D Viewport" width="90%">
  <p><em>High-fidelity rendering in the 3D viewport</em></p>
</div>

---

## 🌟 Core Features

### 🎨 Brush Modeling Suite
- **Intuitive Sculpting Tools:** Draw, Smooth, Inflate, Flatten, Pinch, and Crease tools for precise mesh manipulation
- **Dynamic Parameters:** Adjustable brush size, strength, density and falloff for complete control
- **Reference Support:** Directly upload and use reference models as sculpting guides
- **Seamless Import:** Drag-and-drop support for base meshes via the integrated file browser

### 🔗 Visual Node Editor
- **Graphical Programming:** Design complex materials, shaders, and procedural geometry without writing code
- **Real-time Preview:** Instant visual feedback as you connect and modify nodes
- **Extensible Architecture:** Create and share custom node types with the SM-Engine community
- **Template Library:** Pre-built node graphs for common materials and effects

### ⚙️ Integrated Physics Engine
- **Multiple Simulation Environments:** Set up and switch between different physics scenarios
- **Comprehensive Dynamics:** Simulate rigid bodies, soft bodies, cloth, and fluid interactions
- **Advanced Controls:** Configure gravity, friction, restitution, and collision properties
- **Constraints System:** Create joints, hinges, springs, and mechanical linkages

### 🖼️ Advanced Viewport
- **High-Performance Rendering:**webGL powered visualization with PBR materials
- **Multiple View Modes:** Orthographic (Top, Front, Side) and Perspective cameras with customizable settings
- **Real-time Analytics:** Monitor FPS, draw calls, polygon count, and memory usage
- **Transformation Tools:** Intuitive gizmos for precise object manipulation (Translate, Rotate, Scale)

### 📂 Robust Workflow & I/O
- **Non-destructive Editing:** Comprehensive Undo/Redo system with history browser
- **Organized Scene Management:** Hierarchical scene structure with nested object support
- **Asset Management:** Dedicated panel for importing, organizing, and applying materials and models
- **File Format Support:** Import/export for industry-standard formats (.obj, .fbx, .stl, .dae, .gltf)
- **Session Recording:** Capture your workflow for tutorials or time-lapse demonstrations

---

## 🛠️ Technology Stack

SM-Engine is built on modern and reliable technologies:

## 🖥 Language
- **JavaScript (ES6+)**
  - Runs natively in the browser
  - Ideal for real-time interactive applications

## 🧱 Graphics API
- **[Three.js](https://threejs.org/)**  
  - Built on top of WebGL
  - Simplifies 3D rendering, lighting, materials, and cameras

## 🖼 GUI Framework
- **[dat.GUI](https://github.com/dataarts/dat.gui)** or **[Tweakpane](https://cocopon.github.io/tweakpane/)**
  - Lightweight GUI for real-time controls and debugging
- **Optional (Advanced UI):**
  - **[React.js](https://reactjs.org/)** or **[Vue.js](https://vuejs.org/)** for component-based UIs

## 🎮 Physics Engine
- **[Ammo.js](https://github.com/kripken/ammo.js)**
  - Port of Bullet Physics to JavaScript/WebAssembly
- **Alternative: [Cannon-es](https://github.com/pmndrs/cannon-es)**
  - Easier to use, great for games and simulations

## 🧳 Asset Processing (3D Models)
- **[Three.js Loaders](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)**
  - Use `GLTFLoader`, `FBXLoader`, `OBJLoader` for importing models
- **Recommended format: GLTF/GLB**
  - Optimized for web performance
- **Tools:** Blender, glTF-Pipeline for converting and optimizing assets

## ✨ Shader System
- **Custom GLSL Shaders**
  - Use `ShaderMaterial` or `RawShaderMaterial` in Three.js
- **Hot Reloading:**
  - Implement with `fetch()` + `ShaderMaterial.needsUpdate = true`
  - Use **Vite** or **Webpack** with file watching for live shader reloading
---

## 🧩 Optional Tools for Development

### 🔧 Dev Environment
- **[Vite](https://vitejs.dev/)** or **[Parcel](https://parceljs.org/)** for bundling and fast dev server

### 🎨 Post-Processing
- Use `EffectComposer` with `ShaderPass`, `BloomPass`, etc. for advanced visual effects

### 🔍 Scene Graph Inspector
- Built-in **[Three.js Editor](https://threejs.org/editor/)** or custom developer tools

---


---

## 📐 Interface Overview

SM-Engine features a customizable, panel-based interface designed for productivity:

```plaintext
+---------------------------------------------------------------+
| Main Toolbar (File, Edit, Assets, Export, View, Help...)      |
+--------------------------+------------------------------------+
| Hierarchy / Scene        |                                    |
|   - Physics Environments |         3D Viewport                |
|   - Objects              |         (Main Work Area)           |
|   - Cameras (Ortho/Persp)|                                    |
|   - Node Graphs          |                                    |
+--------------------------+------------------------------------+
| Assets Panel /           | Inspector / Properties Panel       |
| Brush Settings /         |   - Object Transform               |
| Node Editor              |   - Component Details (Physics,    |
| (Context Dependent)      |     Materials, Scripts...)         |
|                          |   - Brush Parameters               |
+--------------------------+------------------------------------+
| Status Bar / Output (FPS, Object Count, Recording Status)     |
+---------------------------------------------------------------+
```

- **Top:** Main menu and toolbar for global actions
- **Left:** Hierarchical organization of scene elements
- **Center:** Interactive 3D viewport with customizable display settings
- **Right:** Properties and settings for selected objects or tools
- **Bottom:** Real-time performance metrics and application status

---

## 🚀 Quick Start Guide

Get up and running with SM-Engine in just a few steps:

1. **Launch the Editor:**
   - Run `SM-Engine.exe` after installation

2. **Create a New Project:**
   - Select `File > New Project` or use the startup screen
   - Choose a template or start with an empty scene

3. **Add Elements:**
   - Create primitives via `Create > Primitive` in the main menu
   - Import models using `File > Import` or drag files into the viewport
   - Set up a physics environment through the Physics menu

4. **Sculpt & Model:**
   - Select the Brush tool from the toolbar
   - Adjust brush settings in the Context Panel
   - Left-click and drag on meshes to sculpt

5. **Create Materials:**
   - Open the Node Editor from the Context Panel
   - Create a new material graph
   - Connect nodes to build your material
   - Apply to objects via drag-and-drop

6. **Set Up Physics:**
   - Select an object and enable physics in the Inspector
   - Adjust mass, friction, and other properties
   - Click the Play button to start simulation

7. **Navigation Controls:**
   - Orbit: Alt + Left Mouse Button
   - Pan: Alt + Middle Mouse Button
   - Zoom: Mouse Wheel or Alt + Right Mouse Button
   - Focus on object: F key (with object selected)

---

## 🔧 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10 (64-bit) | Windows 11 or Windows 10 (latest) |
| Processor | Intel Core i5 / AMD Ryzen 5 | Intel Core i7 / AMD Ryzen 7 or better |
| Memory | 8 GB RAM | 16 GB RAM or more |
| Graphics | DirectX 11 / OpenGL 4.0 GPU | NVIDIA GTX 1660 / AMD RX 5600 or better |
| VRAM | 2 GB | 6 GB or more |
| Storage | 2 GB available space | 5 GB on SSD |
| Display | 1920×1080 resolution | 2560×1440 or higher |
| Input | Keyboard and mouse | + Graphics tablet for sculpting |
| Software | .NET Framework 4.8 | .NET Framework 4.8 |

---

## 💾 Installation & Running

### Option 1: Using the Installer (Recommended)

1. Download the latest installer from the [Releases Page](https://github.com/medelbou3/SM-Engine/releases)
2. Run the `SM-Engine-Setup.exe` file
3. Follow the installation wizard instructions
4. Launch SM-Engine from the desktop shortcut or Start menu

### Option 2: Portable Version

1. Download the portable .zip file from the [Releases Page](https://github.com/medelbou3/SM-Engine/releases)
2. Extract all contents to a folder of your choice
3. Run `SM-Engine.exe` from the extracted folder
4. Note: .NET Framework 4.8 must be installed on your system

### Option 3: Building from Source

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/medelbou3/SM-Engine.git
   cd SM-Engine
   ```

2. **Prerequisites:**
   - Visual Studio 2022 with ".NET desktop development" workload
   - .NET Framework 4.8 SDK
   - OpenTK NuGet package (automatically restored)
   - BulletSharp NuGet package (automatically restored)

3. **Build the Project:**
   - Open `SM-Engine.sln` in Visual Studio
   - Select Build > Build Solution (or press Ctrl+Shift+B)
   - Select the desired configuration (Debug/Release)

4. **Run the Editor:**
   - Press F5 in Visual Studio to run with debugging
   - Or navigate to `bin/Release` and run `SM-Engine.exe`

---

## 🤝 Contributing

We welcome contributions to SM-Engine! Here's how you can help:

1. **Report Issues:** Found a bug or have a suggestion? Open an issue on our [Issue Tracker](https://github.com/medelbou3/SM-Engine/issues)

2. **Contribute Code:**
   - Fork the repository
   - Create a feature branch (`git checkout -b feature/amazing-feature`)
   - Commit your changes (`git commit -m 'Add: Implement amazing feature'`)
   - Push to your branch (`git push origin feature/amazing-feature`)
   - Open a Pull Request

3. **Documentation:** Help improve our docs, tutorials, or this README

4. **Testing:** Try new features and provide feedback

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines.

---

## 🛣️ Roadmap

Our development roadmap for upcoming versions:

### Short-term (v1.x)
- Advanced material node library expansion
- Texture painting and UV editing tools
- Animation keyframing system
- Improved documentation and tutorials

### Mid-term (v2.x)
- Scripting support via C# API
- Plugin architecture for extensibility
- Terrain generation and editing tools
- Advanced rendering features (volumetrics, GI)

### Long-term (v3.x)
- Real-time collaboration features
- Virtual reality sculpting mode
- AI-assisted modeling tools
- Mobile companion app

---

## 📜 License

SM-Engine is distributed under the MIT License. See the [LICENSE](LICENSE) file for full details.

---

## 🙏 Acknowledgements

- [OpenTK](https://opentk.net/) for the OpenGL wrapper
- [BulletSharp](https://github.com/AndresTraks/BulletSharp) for physics simulation
- [Assimp.Net](https://bitbucket.org/Starnick/assimpnet) for 3D model importing
- [Icons8](https://icons8.com/) for UI icons
- All our contributors and community members

---

<p align="center">
  <a href="https://github.com/medelbou3/SM-Engine">GitHub</a> •
  <a href="https://github.com/medelbou3/SM-Engine/wiki">Documentation</a> •
  <a href="https://github.com/medelbou3/SM-Engine/discussions">Community</a> •
  <a href="https://github.com/medelbou3/SM-Engine/issues">Issues</a>
</p>
