// GameExportSystem.js
const EXPORT_CONFIG = {
    // Project Metadata
    gameName: "My SM Engine Project",
    version: "1.0.0",
    author: "Developer",

    // Build Settings
    defaults: {
        platform: "web",
        minify: true,
        compressTextures: true,
        includePhysics: true
    },

    // External Libraries (What the exported game needs to run)
    libraries: {
        threeJS: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
        cannonJS: "https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js",
        gltfLoader: "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.min.js"
    },

    // Deployment Paths
    paths: {
        assets: "assets/",
        scripts: "js/",
        styles: "css/"
    }
};

class GameExportSystem {
    constructor(engineData) {
        this.scene = engineData.scene;
        this.camera = engineData.camera;
        this.renderer = engineData.renderer;
        this.player = engineData.player;
        this.obstacles = engineData.obstaclesGroup;

        this.config = engineData.config || {
            gameName: "SM_Game_Build",
            includePhysics: true,
            includeLumen: true,
            platform: "web"
        };


        this.init();
    }

    init() {
        this.injectStyles();
        this.bindTriggerButton();
    }

    bindTriggerButton() {
        // This is the button in your main engine UI
        const btn = document.getElementById('export-game-btn');
        if (btn) {
            btn.onclick = () => this.openExportModal();
        }
    }

    openExportModal() {
        const existing = document.getElementById('max-export-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'max-export-modal';
        modal.className = 'max-modal-overlay';
        
        modal.innerHTML = `
        <div class="max-window">
            <div class="max-title-bar">
                <span class="max-title-text">FBX Export (Version: 2019.0)</span>
                <div class="max-title-controls">
                    <button>?</button>
                    <button class="close-modal">×</button>
                </div>
            </div>

            <div class="max-body">
                <div class="max-row preset-row">
                    <label>Presets</label>
                    <div class="max-input-group">
                        <label>Current Preset:</label>
                        <select class="max-select">
                            <option>User Defined</option>
                            <option>Game Export</option>
                        </select>
                    </div>
                </div>

                <div class="max-scroll-area">
                    <!-- SECTION: INCLUDE -->
                    <details class="max-tree-node" open>
                        <summary>Include</summary>
                        <div class="max-tree-content indented">
                            <details class="max-tree-node" open>
                                <summary>Geometry</summary>
                                <div class="max-tree-content indented">
                                    <label class="max-checkbox"><input type="checkbox" checked><span>Smoothing Groups</span></label>
                                    <label class="max-checkbox"><input type="checkbox" checked><span>Tangents and Binormals</span></label>
                                    <label class="max-checkbox"><input type="checkbox" checked><span>Triangulate</span></label>
                                </div>
                            </details>
                        </div>
                    </details>

                    <!-- SECTION: ADVANCED -->
                    <details class="max-tree-node" open>
                        <summary>Advanced Options</summary>
                        <div class="max-tree-content indented">
                            <div class="max-field-row">
                                <label>Up Axis:</label>
                                <select class="max-select"><option>Y-up</option><option>Z-up</option></select>
                            </div>
                        </div>
                    </details>

                    <!-- SECTION: FILE FORMAT (YOUR INTEGRATION) -->
                    <details class="max-tree-node" open>
                        <summary>FBX File Format</summary>
                        <div class="max-tree-content indented">
                            <div class="max-field-row">
                                <label>Type:</label>
                                <select class="max-select" id="exportFormat">
                                    <option value="gltf">GLTF / GLB</option>
                                    <option value="obj">OBJ (Legacy)</option>
                                    <option value="fbx">FBX (Autodesk)</option>
                                    <option value="zip">Project ZIP (Full Build)</option>
                                </select>
                            </div>
                        </div>
                    </details>

                    <!-- SECTION: INFORMATION -->
                    <details class="max-tree-node" open>
                        <summary>Information</summary>
                        <div class="max-tree-content indented info-stats">
                            <p>Models: <span id="stat-models">0</span></p>
                            <p>Status: <span id="progress-text" style="color:#00d4ff">Ready</span></p>
                            
                            <div id="export-progress" class="max-progress-container">
                                <div class="max-progress-bar">
                                    <div id="progress-fill" class="max-progress-fill"></div>
                                </div>
                            </div>
                        </div>
                    </details>
                </div>
            </div>

            <div class="max-footer">
                <button class="max-btn" id="import-btn">Import...</button>
                <div class="max-footer-right">
                    <button class="max-btn primary" id="exportButton">OK</button>
                    <button class="max-btn close-modal">Cancel</button>
                </div>
            </div>
        </div>`;

        document.body.appendChild(modal);

        // Bind events
        modal.querySelectorAll('.close-modal').forEach(b => b.onclick = () => modal.remove());
        modal.querySelector('#exportButton').onclick = () => this.handleExport();
        modal.querySelector('#import-btn').onclick = () => alert("Open file browser for Import...");

        this.updateStats();
    }

    updateStats() {
        let count = 0;
        this.scene.traverse(o => { if (o.isMesh) count++; });
        document.getElementById('stat-models').textContent = count;
    }

    // --- YOUR INTEGRATED LOGIC ---

    handleExport() {
        const format = document.getElementById('exportFormat').value;
        const fill = document.getElementById('progress-fill');
        const text = document.getElementById('progress-text');
        const container = document.getElementById('export-progress');

        container.style.display = "block";
        text.textContent = `Exporting as ${format.toUpperCase()}...`;
        fill.style.width = "50%";

        setTimeout(() => {
            switch (format) {
                case 'gltf': this.exportGLTF(); break;
                case 'obj':  this.exportOBJ(); break;
                case 'fbx':  this.exportFBX(); break;
                case 'zip':  this.exportAsZip(); break;
            }
            fill.style.width = "100%";
            text.textContent = "Done!";
            setTimeout(() => document.getElementById('max-export-modal').remove(), 800);
        }, 500);
    }

    exportGLTF() {
        if (typeof THREE.GLTFExporter === 'undefined') return alert("GLTFExporter not loaded");
        const exporter = new THREE.GLTFExporter();
        exporter.parse(this.scene, (result) => {
            const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
            this.saveFile(blob, "scene.gltf");
        });
    }

    exportOBJ() {
        if (typeof THREE.OBJExporter === 'undefined') return alert("OBJExporter not loaded");
        const exporter = new THREE.OBJExporter();
        const result = exporter.parse(this.scene);
        const blob = new Blob([result], { type: 'text/plain' });
        this.saveFile(blob, "scene.obj");
    }

    exportFBX() {
        if (typeof THREE.FBXExporter === 'undefined') return alert("FBXExporter not loaded");
        const exporter = new THREE.FBXExporter();
        const result = exporter.parse(this.scene);
        const blob = new Blob([result], { type: 'application/octet-stream' });
        this.saveFile(blob, "scene.fbx");
    }

    exportAsZip() {
        if (typeof JSZip === 'undefined') return alert("JSZip library not found");
        const zip = new JSZip();
        // Custom serialization logic
        const sceneData = { metadata: { project: "SM Engine" }, objects: this.scene.toJSON() };
        zip.file("scene.json", JSON.stringify(sceneData, null, 2));

        zip.generateAsync({ type: "blob" }).then((content) => {
            this.saveFile(content, "project_build.zip");
        });
    }

    saveFile(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    injectStyles() {
        if (document.getElementById('max-style')) return;
        const s = document.createElement('style');
        s.id = 'max-style';
        s.textContent = `
            .max-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 100000; font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #eee; }
            .max-window { width: 500px; height: 600px; background: #383838; border: 1px solid #555; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
            .max-title-bar { background: #2d2d2d; padding: 4px 8px; display: flex; justify-content: space-between; border-bottom: 1px solid #222; }
            .max-title-controls button { background: none; border: none; color: #ccc; cursor: pointer; padding: 0 4px; }
            .max-body { flex: 1; padding: 10px; display: flex; flex-direction: column; overflow: hidden; }
            .max-scroll-area { flex: 1; background: #424242; border: 1px solid #252525; overflow-y: auto; margin-top: 5px; }
            .max-tree-node summary { padding: 4px; background: #333; cursor: pointer; font-weight: bold; border-bottom: 1px solid #222; list-style: none; display: flex; align-items: center; outline: none; }
            .max-tree-node summary::before { content: '▶'; font-size: 8px; margin-right: 8px; }
            .max-tree-node[open] > summary::before { transform: rotate(90deg); }
            .indented { padding: 5px 22px; color: #bbb; }
            .max-checkbox { display: flex; align-items: center; gap: 6px; margin: 3px 0; cursor: pointer; }
            .max-select { background: #2b2b2b; color: #eee; border: 1px solid #222; font-size: 11px; padding: 2px; }
            .max-field-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
            .max-progress-container { margin-top: 10px; display: none; background: #111; height: 12px; border: 1px solid #555; }
            .max-progress-fill { width: 0%; height: 100%; background: #00d4ff; transition: width 0.3s; }
            .max-footer { padding: 12px; display: flex; justify-content: space-between; background: #383838; border-top: 1px solid #222; }
            .max-btn { background: #4d4d4d; color: #eee; border: 1px solid #222; padding: 5px 20px; cursor: pointer; min-width: 80px; box-shadow: inset 1px 1px 0 rgba(255,255,255,0.05); }
            .max-btn.primary { font-weight: bold; }
        `;
        document.head.appendChild(s);
    }
}
