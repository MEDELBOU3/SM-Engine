
// Ensure THREE is globally available or imported if using modules
// e.g., import * as THREE from 'three';

// Add necessary utility functions and global variables if not already present
// For the sake of this example, I'm assuming 'scene', 'renderer', 'camera', 'controls'
// are global variables defined elsewhere in your setup.

// Utility function to make elements draggable (Provided in original code)
function makeElementDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e.preventDefault();
        // Get mouse position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        e.preventDefault();
        // Calculate new position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // Set element's new position
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Utility function to make elements resizable (Provided in original code)
function makeElementResizable(element) {
    const resizer = document.createElement('div');
    resizer.className = 'resizer';
    element.appendChild(resizer);
    
    resizer.addEventListener('mousedown', initResize);
    
    function initResize(e) {
        e.preventDefault();
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResize);
    }
    
    function resize(e) {
        e.preventDefault();
        
        // Calculate new size
        const newWidth = e.clientX - element.getBoundingClientRect().left;
        const newHeight = e.clientY - element.getBoundingClientRect().top;
        
        // Apply minimum size constraints
        element.style.width = `${Math.max(300, newWidth)}px`;
        element.style.height = `${Math.max(200, newHeight)}px`;
    }
    
    function stopResize() {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResize);
    }
}

// Function to initialize the node connection system (Provided in original code)
function initNodeConnectionSystem() {
    // Add connection line styles
    const style = document.createElement('style');
    style.textContent = `
        .connection-line {
            position: absolute;
            z-index: 10;
            pointer-events: none;
            overflow: visible;  // Ensure SVG paths aren't clipped
        }

       .connection-line path {
            stroke: #00aaff;
            stroke-width: 2px;
            fill: none;
            transition: stroke 0.2s;
        }

        .connection-line:hover path {
           stroke: #00ffaa;
        }
        
        .connection-line.temp path {
            stroke: #ffaa00;
            stroke-dasharray: 5, 5;
        }
        
        .connection-line.active path {
            stroke: #00ffaa;
            animation: flow 1s linear infinite;
        }

        @keyframes flow {
            to {
                stroke-dashoffset: -20;
            }
        }
    `;
    document.head.appendChild(style);
}

// Setup node templates (Provided in original code, now updated directly in class)
function setupNodeTemplates() {
    console.log("Setting up node templates");
}

// Setup context menu for node creation (Provided in original code)
function setupNodeContextMenu() {
    console.log("Setting up node context menu");
}

// Add CSS styles for the node editor (Provided in original code, with additions)
function addNodeEditorStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #node-editor-container {
            position: absolute;
            top: 100px;
            left: 100px;
            width: 800px;
            height: 600px;
            background-color: #2a2a2a;
            border: 1px solid #444;
            border-radius: 4px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
            color: #eee;
            font-family: Arial, sans-serif;
            z-index: 1000;
            display: grid;
            grid-template-rows: auto 1fr;
            grid-template-columns: 200px 1fr 250px;
            grid-template-areas:
                "header header header"
                "sidebar canvas properties";
            overflow: hidden;
            resize: both; /* Allow resizing by default browser behavior as well */
            min-width: 400px;
            min-height: 300px;
        }
        
        #node-editor-container.expanded {
            width: 90vw;
            height: 80vh;
            top: 10vh;
            left: 5vw;
        }
        
        .panel-header-vfx {
            grid-area: header;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #222;
            padding: 8px 12px;
            border-bottom: 1px solid #444;
            cursor: grab; /* Changed to grab for better UX */
        }

        .panel-header-vfx:active {
            cursor: grabbing;
        }
        
        .panel-title {
            font-weight: bold;
            font-size: 14px;
        }
        
        .panel-controls {
            display: flex;
            gap: 8px;
        }
        
        .node-sidebar {
            grid-area: sidebar;
            background-color: #333;
            border-right: 1px solid #444;
            padding: 10px;
            overflow-y: auto;
        }
        
        .node-canvas {
            grid-area: canvas;
            background-color: #1a1a1a;
            background-image: 
                linear-gradient(rgba(50, 50, 50, 0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(50, 50, 50, 0.5) 1px, transparent 1px);
            background-size: 20px 20px;
            overflow: auto;
            position: relative;
        }
        
        .node-properties {
            grid-area: properties;
            background-color: #333;
            border-left: 1px solid #444;
            padding: 10px;
            overflow-y: auto;
        }
        
        .node-category {
            margin-bottom: 15px;
        }
        
        .node-category h4 {
            margin: 0 0 5px 0;
            font-size: 13px;
            color: #aaa;
            border-bottom: 1px solid #555;
            padding-bottom: 3px;
        }

        .node {
            position: absolute;
            background-color: #383838;
            border: 1px solid #555;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
            min-width: 150px;
            color: #eee;
            font-size: 12px;
            z-index: 50; /* Ensure nodes are above connections */
        }
        
        .node.selected {
            border-color: #00aaff;
            box-shadow: 0 0 8px rgba(0, 170, 255, 0.6);
        }

        .node-preview {
            margin-top: 8px;
            width: 100px; /* Consistent preview size */
            height: 100px;
            overflow: hidden;
            border: 1px solid #555;
            background-color: #222;
            display: flex; /* Center canvas */
            align-items: center;
            justify-content: center;
        }

        .node-preview canvas {
           width: 100%;
           height: 100%;
           display: block; /* Remove extra space below canvas */
           object-fit: contain; /* Scale content down to fit */
        }
        
        .node-item {
            padding: 5px 8px;
            margin: 2px 0;
            background-color: #444;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .node-item:hover {
            background-color: #555;
        }
            
        .node.dragging {
            opacity: 0.8;
            border-color: #ffaa00;
        }
        
        .node-header {
            padding: 6px 8px;
            background-color: #444;
            border-radius: 4px 4px 0 0;
            font-weight: bold;
            font-size: 12px;
            cursor: grab;
        }
        .node-header:active {
            cursor: grabbing;
        }
        
        .node-body {
            padding: 8px;
            display: flex;
            flex-direction: row;
            justify-content: space-between;
        }
        
        .node-inputs, .node-outputs {
            display: flex;
            flex-direction: column;
            gap: 8px;
            position: relative; /* For connector positioning */
            padding: 5px 0;
        }
       
        .connector-group {
            display: flex;
            align-items: center;
            height: 18px; /* Reduced height for tighter packing */
            position: relative;
        }
        
        .connector-label {
            font-size: 10px;
            padding: 0 5px;
            white-space: nowrap; /* Prevent label wrapping */
        }
        
        .connector {
            position: absolute;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 1px solid #888;
            background-color: #555;
            cursor: pointer;
            transition: background-color 0.2s, border-color 0.2s;
            z-index: 5; /* Ensure connectors are clickable above connections */
        }
        
        .connector:hover {
            background-color: #888;
            border-color: #00aaff;
        }
        
        .connector.input {
           left: -18px; /* Adjusted position */
        }
        
        .connector.output {
           right: -18px; /* Adjusted position */
        }
        
        .node-inputs .connector-group {
            justify-content: flex-start; 
        }
        
        .node-outputs .connector-group {
            justify-content: flex-end; 
        }
        
        .property-item {
            margin-bottom: 8px;
        }
        
        .property-item label {
            display: block;
            font-size: 12px;
            margin-bottom: 3px;
            color: #ccc;
        }
        
        .property-item input, .property-item select {
            width: calc(100% - 10px); /* Adjust width for padding */
            background-color: #222;
            border: 1px solid #555;
            border-radius: 3px;
            padding: 4px;
            color: #eee;
            font-size: 12px;
        }
        
        .property-item input[type="checkbox"] {
            width: auto;
            margin-left: 0;
        }
        
        .process-button {
            background-color: #2a6da7;
            border: none;
            border-radius: 3px;
            color: white;
            padding: 6px 12px;
            margin-top: 10px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .process-button:hover {
            background-color: #3a8dc7;
        }
        
        .node-context-menu {
            position: fixed;
            background-color: #333;
            border: 1px solid #555;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
            padding: 5px 0;
            z-index: 1000;
        }
        
        .menu-item {
            padding: 5px 15px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.2s;
        }
        
        .menu-item:hover {
            background-color: #555;
        }
        
        .resizer {
            position: absolute;
            width: 10px;
            height: 10px;
            right: 0;
            bottom: 0;
            cursor: nwse-resize;
            background-color: #444;
            border-top-left-radius: 3px;
        }
        
        
    `;
    document.head.appendChild(style);
}


// Initialize the node VFX editor
function initNodeVFXEditor() {
    if (!window.THREE || !scene || !renderer || !camera) {
        console.error('Three.js components not initialized');
        // Retry initialization after a short delay if components are missing
        setTimeout(initNodeVFXEditor, 500); 
        return;
    }
    createNodeEditorButton();
    createNodeEditorContainer();
    addNodeEditorStyles();
    setupNodeTemplates(); // Now primarily handled within NodeVFXEditor class
    initNodeConnectionSystem();
    setupNodeContextMenu(); // Now primarily handled within NodeVFXEditor class
    
    // Initialize the nodeEditor instance
    window.nodeEditor = new NodeVFXEditor(scene, renderer, camera);
    
    console.log("Node VFX Editor initialized");
}

function createNodeEditorButton() {
    const button = document.createElement('button');
    button.id = 'node-editor-button';
    button.className = 'tool-button';
    button.innerHTML = 'VFX Editor';
    button.title = "Open VFX";

    //Add to Tool Bar group
    const toolbarGroup = document.getElementById('node-editor-button-grp')|| document.body;
    if(toolbarGroup) {
        toolbarGroup.appendChild(button);
    } else {
        console.warn("Node editor button group not found, appending to body.");
        document.body.appendChild(button);
    }

    // Event listener
    button.addEventListener('click', toggleNodeEditor);
    
    console.log("Node Editor button created");
}

function createNodeEditorContainer() {
    // Create main container
    const container = document.createElement('div');
    container.id = 'node-editor-container';
    container.className = 'node-editor-panel';
    container.style.display = 'none'; // Hidden by default
    
    // Create header with controls
    const header = document.createElement('div');
    header.className = 'panel-header-vfx';
    header.innerHTML = `
        <span class="panel-title">Node VFX Editor</span>
        <div class="panel-controls">
            <button id="node-upload-media" class="panel-button" title="Upload Media">
                <i class="fas fa-upload"></i>
            </button>
            <button id="node-editor-expand" class="panel-button" title="Expand/Collapse">
                <i class="fas fa-expand-alt"></i>
            </button>
            <button id="node-editor-close" class="panel-button" title="Close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Create editor canvas
    const canvas = document.createElement('div');
    canvas.id = 'node-editor-canvas';
    canvas.className = 'node-canvas';
    
    // Create sidebar for node types
    const sidebar = document.createElement('div');
    sidebar.id = 'node-sidebar';
    sidebar.className = 'node-sidebar';
    sidebar.innerHTML = `
        <h3>Node Types</h3>
        <div class="node-category">
            <h4>Inputs</h4>
            <div class="node-item" data-node-type="image">Image</div>
            <div class="node-item" data-node-type="color">Color</div>
            <div class="node-item" data-node-type="vector">Vector</div>
        </div>
        <div class="node-category">
            <h4>Filters</h4>
            <div class="node-item" data-node-type="blur">Blur</div>
            <div class="node-item" data-node-type="sharpen">Sharpen</div>
            <div class="node-item" data-node-type="colorAdjust">Color Adjust</div>
            <div class="node-item" data-node-type="glow">Glow</div>
        </div>
        <div class="node-category">
            <h4>Compositing</h4>
            <div class="node-item" data-node-type="blend">Blend</div>
            <div class="node-item" data-node-type="mask">Mask</div>
            <div class="node-item" data-node-type="overlay">Overlay</div>
        </div>
        <div class="node-category">
            <h4>3D Effects</h4>
            <div class="node-item" data-node-type="particleSystem">Particle System</div>
            <div class="node-item" data-node-type="volumetric">Volumetric (Placeholder)</div>
        </div>
        <div class="node-category">
            <h4>Output</h4>
            <div class="node-item" data-node-type="viewer">Viewer (Scene Output)</div>
        </div>
    `;
    
    // Add property panel for editing node parameters
    const propertyPanel = document.createElement('div');
    propertyPanel.id = 'node-properties';
    propertyPanel.className = 'node-properties';
    propertyPanel.innerHTML = '<h3>Properties</h3><div id="property-container"><p>Select a node to edit properties</p></div>';
    
    // Assemble the components
    container.appendChild(header);
    container.appendChild(sidebar);
    container.appendChild(canvas);
    container.appendChild(propertyPanel);
    
    // Add to document
    document.body.appendChild(container);
    
    // Add event listeners for control buttons
    document.getElementById('node-editor-expand').addEventListener('click', toggleNodeEditorSize);
    document.getElementById('node-editor-close').addEventListener('click', closeNodeEditor);
    
    // Handle media upload
    document.getElementById('node-upload-media').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*, video/*'; // Accept images or videos
        input.multiple = true;
        
        input.onchange = (e) => {
            if (window.nodeEditor) { // Ensure editor is initialized
                window.nodeEditor.handleMediaUpload(e.target.files);
            }
        };
        input.click();
    });

    // Make the editor panel draggable
    makeElementDraggable(container, header);
    
    // Make the editor panel resizable (using CSS resize: both property now, but keeping JS for consistency)
    // makeElementResizable(container); // Can comment out if using CSS `resize: both`
    
    console.log("Node Editor container created");
}

function toggleNodeEditor() {
    const container = document.getElementById('node-editor-container');
    if (container.style.display === 'none') {
        container.style.display = 'grid';
        // Pause orbit controls when editing nodes
        if (controls) {
            controls.enabled = false;
        }
        if (window.nodeEditor) {
            // Re-render the graph when opening to ensure previews are up-to-date
            window.nodeEditor.executeGraph();
        }
    } else {
        container.style.display = 'none';
        // Resume orbit controls
        if (controls) {
            controls.enabled = true;
        }
    }
}

function closeNodeEditor() {
    const container = document.getElementById('node-editor-container');
    container.style.display = 'none';
    // Resume orbit controls
    if (controls) {
        controls.enabled = true;
    }
}

function toggleNodeEditorSize() {
    const container = document.getElementById('node-editor-container');
    const expandButton = document.getElementById('node-editor-expand');
    if (container.classList.contains('expanded')) {
        container.classList.remove('expanded');
        expandButton.innerHTML = '<i class="fas fa-expand-alt"></i>';
    } else {
        container.classList.add('expanded');
        expandButton.innerHTML = '<i class="fas fa-compress-alt"></i>';
    }
}

// Class to manage the node editor functionality
class NodeVFXEditor {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.dragNode = null;
        this.dragConnection = null;
        this.dragOffset = { x: 0, y: 0 };
        this.canvas = document.getElementById('node-editor-canvas');
        this.propertyPanel = document.getElementById('property-container');
        
        this.setupEventListeners();
        
        // --- Core Three.js components for offscreen rendering ---
        // Render target for full-resolution node outputs
        this.fullResRenderTarget = new THREE.WebGLRenderTarget(
            this.renderer.domElement.width, this.renderer.domElement.height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.FloatType // FloatType for higher precision
            }
        );
        // Render target for temporary operations (e.g., ping-pong blurring)
        this.tempRenderTarget = this.fullResRenderTarget.clone(); // Clone for same resolution
        // Render target for node previews
        this.previewRenderTarget = new THREE.WebGLRenderTarget(128, 128, { // Smaller for previews
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });

        // Fullscreen quad for shader-based effects
        this.fullscreenQuad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.ShaderMaterial({
                uniforms: { tDiffuse: { value: null } },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = vec4(position.xy, 0.0, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D tDiffuse;
                    varying vec2 vUv;
                    void main() {
                        gl_FragColor = texture2D(tDiffuse, vUv);
                    }
                `
            })
        );
        // Ensure UVs are correctly set for the fullscreen quad (PlaneGeometry(2,2) defaults to -1 to 1)
        this.fullscreenQuad.geometry.attributes.uv = new THREE.BufferAttribute(new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            // Triangle 2
            1, 0,
            1, 1,
            0, 1
        ]), 2);
        
        // Dedicated scene and camera for offscreen rendering to render targets
        this.offscreenScene = new THREE.Scene();
        this.offscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.offscreenScene.add(this.fullscreenQuad);

        // Mesh to display the final output in the main scene
        this.outputViewerMesh = null;
        // --- End Three.js components ---
        
        console.log("NodeVFXEditor class initialized");
    }
    
    setupEventListeners() {
        const canvas = this.canvas;
        
        // Add node from sidebar to canvas
        const nodeItems = document.querySelectorAll('.node-item');
        nodeItems.forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const nodeType = item.getAttribute('data-node-type');
                // Calculate position relative to canvas content, not screen
                const canvasRect = this.canvas.getBoundingClientRect();
                const x = e.clientX - canvasRect.left + this.canvas.scrollLeft;
                const y = e.clientY - canvasRect.top + this.canvas.scrollTop;

                this.createNode(nodeType, x, y);
            });
        });
        
        // Canvas events for node interaction
        canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleCanvasMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.handleCanvasMouseUp.bind(this));
        
        // Right-click context menu
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const targetNodeElement = e.target.closest('.node');
            this.showContextMenu(e.clientX, e.clientY, targetNodeElement);
        });

        // Handle window resize to update render targets
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    onWindowResize() {
        const width = this.renderer.domElement.width;
        const height = this.renderer.domElement.height;
        
        this.fullResRenderTarget.setSize(width, height);
        this.tempRenderTarget.setSize(width, height); // Ensure temp target resizes too
        
        // Re-process graph to update textures with new resolution
        this.executeGraph();
    }

    handleMediaUpload(files) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                // Create an image node at center of canvas
                const node = this.createNode('image', 
                    this.canvas.clientWidth / 2 + this.canvas.scrollLeft, 
                    this.canvas.clientHeight / 2 + this.canvas.scrollTop
                );
                
                // Update node parameters with file data
                node.nodeData.parameters.source = 'file';
                node.nodeData.parameters.path = file.name; // Store file name
                node.nodeData.imageData = e.target.result; // Base64 data
                
                // Process the node to load the image and update preview
                this.processNode(node);
            };
            
            reader.readAsDataURL(file);
        });
    }
    
    createNode(type, x, y) {
        const node = document.createElement('div');
        node.className = 'node';
        node.setAttribute('data-node-type', type);
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        
        // Get node template based on type
        const template = this.getNodeTemplate(type);
        
        node.innerHTML = `
            <div class="node-header">${template.name}</div>
            <div class="node-body">
                <div class="node-inputs">
                    ${this.createNodeConnectors(template.inputs, 'input')}
                </div>
                <div class="node-outputs">
                    ${this.createNodeConnectors(template.outputs, 'output')}
                </div>
                <div class="node-preview"></div> <!-- Added preview div -->
            </div>
        `;
        
        // Store node data
        node.nodeData = {
            id: 'node_' + Date.now(),
            type: type,
            template: template,
            parameters: JSON.parse(JSON.stringify(template.defaultParameters || {})),
            output: null, // This will hold the THREE.Texture or THREE.Object3D result
            inputValues: {}, // Stores resolved inputs from connected nodes
            previewNeedsUpdate: false, // Flag to indicate if preview needs re-rendering
            sceneObject: null // For 3D nodes, holds the object added to the main scene
        };
        
        this.canvas.appendChild(node);
        this.nodes.push(node);
        
        // Make node draggable
        this.makeNodeDraggable(node);
        
        // Select the new node
        this.selectNode(node);

        // Immediately process the new node, especially for 'image' or 'color' inputs
        this.processNode(node);
        
        return node;
    }
    
    createNodeConnectors(connectors, direction) {
        if (!connectors || connectors.length === 0) return '';
    
        let html = '';
        connectors.forEach((conn, index) => {
            html += `
                <div class="connector-group">
                    <div class="connector ${direction}" 
                         data-type="${conn.type}" 
                         data-name="${conn.name}" 
                         data-direction="${direction}"></div>
                    <div class="connector-label">${conn.name}</div>
                </div>
            `;
        });
    
        return html;
    }
    
    getNodeTemplate(type) {
        // Node templates with inputs, outputs, and parameters
        const templates = {
            'image': {
                name: 'Image Input',
                inputs: [],
                outputs: [{ name: 'Image', type: 'image' }],
                defaultParameters: { 
                    source: 'file', 
                    path: '' // Can be URL or file name
                }
            },
            'color': {
                name: 'Color Input',
                inputs: [],
                outputs: [{ name: 'Color', type: 'color' }],
                defaultParameters: { 
                    r: 1.0, 
                    g: 1.0, 
                    b: 1.0, 
                    a: 1.0 
                }
            },
            'vector': {
                name: 'Vector Input',
                inputs: [],
                outputs: [{ name: 'Vector', type: 'vector' }],
                defaultParameters: { x: 0.0, y: 0.0, z: 0.0 }
            },
            'blur': {
                name: 'Blur Filter',
                inputs: [{ name: 'Image', type: 'image' }],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: { 
                    radius: 5, // Pixel radius for blur kernel
                    iterations: 1 // How many times to apply the blur (for stronger effect)
                }
            },
            'sharpen': {
                name: 'Sharpen Filter',
                inputs: [{ name: 'Image', type: 'image' }],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: { amount: 0.5 }
            },
            'colorAdjust': {
                name: 'Color Adjust',
                inputs: [{ name: 'Image', type: 'image' }],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: {
                    brightness: 0, contrast: 1, saturation: 1, hue: 0
                }
            },
            'blend': {
                name: 'Blend Images',
                inputs: [
                    { name: 'Image A', type: 'image' },
                    { name: 'Image B', type: 'image' }
                ],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: { 
                    mode: 'normal', 
                    opacity: 1.0 
                }
            },
            'mask': {
                name: 'Mask Image',
                inputs: [
                    { name: 'Image', type: 'image' },
                    { name: 'Mask', type: 'image' }
                ],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: { invertMask: false }
            },
            'overlay': {
                name: 'Overlay Image',
                inputs: [
                    { name: 'Base', type: 'image' },
                    { name: 'Overlay', type: 'image' }
                ],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: { opacity: 1.0 }
            },
            'particleSystem': {
                name: 'Particle System',
                inputs: [
                    { name: 'Position (Optional)', type: 'vector' },
                    { name: 'Color (Optional)', type: 'color' }
                ],
                outputs: [{ name: 'Particles', type: '3dobject' }],
                defaultParameters: {
                    count: 1000,
                    size: 0.1,
                    speed: 1,
                    lifetime: 2,
                    spread: 5
                }
            },
            'volumetric': {
                name: 'Volumetric Effect',
                inputs: [
                    { name: 'Density', type: 'float' },
                    { name: 'Color', type: 'color' }
                ],
                outputs: [{ name: 'Volume', type: '3dobject' }],
                defaultParameters: { density: 0.5, size: 10, color: '#ffffff' }
            },
            'glow': { // Post-processing effect, usually applied at the end
                name: 'Glow Effect',
                inputs: [{ name: 'Image', type: 'image' }],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: { radius: 0.8, strength: 0.5, threshold: 0.2 }
            },
            'viewer': {
                name: 'Viewer (Scene Output)',
                inputs: [{ name: 'Final Input', type: 'any' }], // Can accept image or 3dobject
                outputs: [],
                defaultParameters: {}
            }
        };
        
        // Return requested template or a default one
        return templates[type] || {
            name: type.charAt(0).toUpperCase() + type.slice(1),
            inputs: [{ name: 'Input', type: 'any' }],
            outputs: [{ name: 'Output', type: 'any' }],
            defaultParameters: {}
        };
    }
    
    makeNodeDraggable(node) {
        const header = node.querySelector('.node-header');
        
        header.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            this.selectNode(node);
            
            this.dragNode = node;
            const rect = node.getBoundingClientRect();
            // Calculate offset relative to node's current position and canvas scroll
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            node.classList.add('dragging');
        });
    }
    
    handleCanvasMouseDown(e) {
        // Handle mouse down on connectors for connections
        if (e.target.classList.contains('connector')) {
            const connector = e.target;
            e.stopPropagation(); // Prevent canvas drag if clicking connector
            
            if (connector.classList.contains('output')) {
                // Start connection from output
                this.startConnection(connector);
            } else if (connector.classList.contains('input')) {
                // Find existing connection to this input and remove it
                this.removeConnectionsToInput(connector);
                this.startConnection(connector); // Allow new connection from input as well
            }
        } else if (!e.target.closest('.node')) {
            // Click on empty canvas area - deselect current node
            this.selectNode(null);
            this.dragNode = null; // Ensure no node is being dragged
        }
    }
    
    handleCanvasMouseMove(e) {
        // Update node position when dragging
        if (this.dragNode) {
            const canvasRect = this.canvas.getBoundingClientRect();
            const x = e.clientX - canvasRect.left - this.dragOffset.x + this.canvas.scrollLeft;
            const y = e.clientY - canvasRect.top - this.dragOffset.y + this.canvas.scrollTop;
            
            this.dragNode.style.left = `${Math.max(0, x)}px`;
            this.dragNode.style.top = `${Math.max(0, y)}px`;
            
            // Update connections for this node
            this.updateNodeConnections(this.dragNode);
        }
        
        // Update connection preview line when creating a connection
        if (this.dragConnection) {
            const canvasRect = this.canvas.getBoundingClientRect();
            const startConnector = this.dragConnection.startConnector;
            const startRect = startConnector.getBoundingClientRect();
            
            // Calculate start position relative to canvas scroll
            const startX = startRect.left + startRect.width / 2 - canvasRect.left + this.canvas.scrollLeft;
            const startY = startRect.top + startRect.height / 2 - canvasRect.top + this.canvas.scrollTop;
            
            // Calculate end position relative to canvas scroll
            const endX = e.clientX - canvasRect.left + this.canvas.scrollLeft;
            const endY = e.clientY - canvasRect.top + this.canvas.scrollTop;
            
            this.updateConnectionLine(this.dragConnection.element, startX, startY, endX, endY);
        }
    }
    
    handleCanvasMouseUp(e) {
        // End node dragging
        if (this.dragNode) {
            this.dragNode.classList.remove('dragging');
            this.dragNode = null;
        }
        
        // End connection creation
        if (this.dragConnection) {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            
            const startConnector = this.dragConnection.startConnector;
            const startDirection = startConnector.getAttribute('data-direction');

            if (target && target.classList.contains('connector') && target !== startConnector) {
                const targetDirection = target.getAttribute('data-direction');

                let outputConn, inputConn;
                if (startDirection === 'output' && targetDirection === 'input') {
                    outputConn = startConnector;
                    inputConn = target;
                } else if (startDirection === 'input' && targetDirection === 'output') {
                    outputConn = target;
                    inputConn = startConnector;
                }

                if (outputConn && inputConn && this.isConnectionValid(outputConn, inputConn)) {
                    // Remove any existing connection to the target input connector first
                    this.removeConnectionsToInput(inputConn);
                    this.createConnection(outputConn, inputConn);
                    // Process the node that just received the input
                    this.processNode(inputConn.closest('.node'));
                }
            }
            
            // Remove temporary connection line
            this.canvas.removeChild(this.dragConnection.element);
            this.dragConnection = null;
        }
    }
    
    startConnection(connector) {
        // Create temporary connection line
        const line = document.createElement('div');
        line.className = 'connection-line temp';
        this.canvas.appendChild(line);
        
        // Store connection data
        this.dragConnection = {
            element: line,
            startConnector: connector
        };
        
        // Initiate line at connector position
        const canvasRect = this.canvas.getBoundingClientRect();
        const connectorRect = connector.getBoundingClientRect();
        const startX = connectorRect.left + connectorRect.width / 2 - canvasRect.left + this.canvas.scrollLeft;
        const startY = connectorRect.top + connectorRect.height / 2 - canvasRect.top + this.canvas.scrollTop;
        
        this.updateConnectionLine(line, startX, startY, startX, startY);
    }
    
    createConnection(outputConnector, inputConnector) {
        // Get node elements and connection data
        const outputNode = outputConnector.closest('.node');
        const inputNode = inputConnector.closest('.node');
        
        // Create connection line
        const line = document.createElement('div');
        line.className = 'connection-line';
        this.canvas.appendChild(line);
        
        // Store connection data
        const connection = {
            element: line,
            outputNode: outputNode,
            inputNode: inputNode,
            outputConnector: outputConnector,
            inputConnector: inputConnector,
            outputType: outputConnector.getAttribute('data-type'),
            inputType: inputConnector.getAttribute('data-type'),
            outputName: outputConnector.getAttribute('data-name'),
            inputName: inputConnector.getAttribute('data-name')
        };
        
        this.connections.push(connection);
        
        // Update the connection line position
        this.updateConnectionPosition(connection);
        
        // Link nodes in the processing graph - now mainly handled by processNode
        // this.linkNodes(outputNode, inputNode, outputConnector, inputConnector);

        console.log('Created connection:', {
            from: outputNode.nodeData.type + ':' + connection.outputName,
            to: inputNode.nodeData.type + ':' + connection.inputName
        });
    }
    
    updateConnectionPosition(connection) {
        const canvasRect = this.canvas.getBoundingClientRect();
        
        const outputRect = connection.outputConnector.getBoundingClientRect();
        const inputRect = connection.inputConnector.getBoundingClientRect();
        
        // Adjust coordinates for canvas scrolling
        const startX = outputRect.left + outputRect.width / 2 - canvasRect.left + this.canvas.scrollLeft;
        const startY = outputRect.top + outputRect.height / 2 - canvasRect.top + this.canvas.scrollTop;
        const endX = inputRect.left + inputRect.width / 2 - canvasRect.left + this.canvas.scrollLeft;
        const endY = inputRect.top + inputRect.height / 2 - canvasRect.top + this.canvas.scrollTop;
        
        this.updateConnectionLine(connection.element, startX, startY, endX, endY);
    }
    
    updateConnectionLine(line, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const curveStrength = Math.min(distance * 0.3, 80);
        
        // Calculate bounding box
        const minX = Math.min(x1, x2) - curveStrength;
        const minY = Math.min(y1, y2) - curveStrength;
        const width = Math.abs(dx) + curveStrength * 2;
        const height = Math.abs(dy) + curveStrength * 2;
        
        // Adjust coordinates relative to bounding box
        const startX = x1 - minX;
        const startY = y1 - minY;
        const endX = x2 - minX;
        const endY = y2 - minY;
    
        line.innerHTML = `
            <svg width="${width}" height="${height}" style="overflow: visible;">
                <path d="M ${startX} ${startY} C ${startX + curveStrength} ${startY}, 
                        ${endX - curveStrength} ${endY}, ${endX} ${endY}"
                      fill="none" stroke="${this.getConnectionColor(line)}" stroke-width="2"/>
            </svg>
        `;
        
        line.style.left = `${minX}px`;
        line.style.top = `${minY}px`;
        line.style.width = `${width}px`;
        line.style.height = `${height}px`;
    }
    
    getConnectionColor(line) {
        return line.classList.contains('temp') ? '#ffaa00' : '#00aaff';
    }
    
    updateNodeConnections(node) {
        // Update all connections related to this node
        this.connections.forEach(conn => {
            if (conn.inputNode === node || conn.outputNode === node) {
                this.updateConnectionPosition(conn);
            }
        });
    }
    
    selectNode(node) {
        // Deselect current node
        if (this.selectedNode) {
            this.selectedNode.classList.remove('selected');
        }
        
        this.selectedNode = node;
        
        // Select new node
        if (node) {
            node.classList.add('selected');
            this.showNodeProperties(node);
        } else {
            this.clearNodeProperties();
        }
    }
    
    showNodeProperties(node) {
        const propertyContainer = this.propertyPanel;
        propertyContainer.innerHTML = '';
        
        // Get node data and template
        const nodeData = node.nodeData;
        if (!nodeData) return;
        
        const template = nodeData.template;
        const parameters = nodeData.parameters;
        
        // Create property title
        const title = document.createElement('h4');
        title.textContent = template.name + ' Properties';
        propertyContainer.appendChild(title);
        
        // Create inputs for each parameter
        for (const paramName in parameters) {
            const paramValue = parameters[paramName];
            const paramType = typeof paramValue;
            
            const paramContainer = document.createElement('div');
            paramContainer.className = 'property-item';
            
            const label = document.createElement('label');
            label.textContent = this.formatParameterName(paramName);
            paramContainer.appendChild(label);
            
            let input;
            
            // Create appropriate input based on parameter type
            if (paramType === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = paramValue;
            } else if (paramType === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                input.value = paramValue;
                input.step = paramName.match(/(r|g|b|a|opacity|strength|threshold)/i) ? 0.01 : 1; // More precise for colors/opacities
            } else if (paramName === 'mode' || paramName === 'type' || paramName === 'source') {
                // Create select for enum-like parameters
                input = document.createElement('select');
                
                // Add options based on parameter name
                const options = this.getOptionsForParameter(paramName);
                options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    input.appendChild(option);
                });
                
                input.value = paramValue;
            } else if (paramName.includes('color')) { // For hex color input
                input = document.createElement('input');
                input.type = 'color';
                let color = new THREE.Color(paramValue);
                input.value = `#${color.getHexString()}`;
            }
            else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = paramValue;
            }
            
            // Set common attributes
            input.setAttribute('data-param', paramName);
            input.addEventListener('change', (e) => {
                let newValue = this.getInputValue(input);
                if (input.type === 'color') {
                    // Convert hex to float RGB
                    const color = new THREE.Color(newValue);
                    newValue = `#${color.getHexString()}`; // Store as hex string for now, convert to {r,g,b} when processed
                    // For color parameters (r, g, b, a), we often store them separately.
                    // If the parameter is a single 'color' string, then it would be stored as a hex string.
                    // This example assumes parameters are like r, g, b, a or a single hex 'color'
                    if (nodeData.parameters.r !== undefined) {
                        nodeData.parameters.r = color.r;
                        nodeData.parameters.g = color.g;
                        nodeData.parameters.b = color.b;
                    } else {
                        nodeData.parameters[paramName] = newValue;
                    }
                } else {
                    nodeData.parameters[paramName] = newValue;
                }
                
                // Process the node with the new parameter
                this.processNode(node);
            });
            
            paramContainer.appendChild(input);
            propertyContainer.appendChild(paramContainer);
        }
        
        // Add a button to process the node explicitly (useful for complex graphs)
        const processButton = document.createElement('button');
        processButton.textContent = 'Process Node';
        processButton.className = 'process-button';
        processButton.addEventListener('click', () => {
            this.processNode(node);
        });
        
        propertyContainer.appendChild(processButton);
    }
    
    formatParameterName(name) {
        // Convert camelCase to Title Case With Spaces
        return name
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase());
    }
    
    getOptionsForParameter(paramName) {
        // Return appropriate options based on parameter name
        const options = {
            'mode': ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'],
            'type': ['point', 'directional', 'spot', 'ambient'],
            'source': ['file', 'url', 'camera', 'render', 'color', 'noise']
        };
        
        return options[paramName] || ['default'];
    }
    
    getInputValue(input) {
        // Get appropriate value based on input type
        if (input.type === 'checkbox') {
            return input.checked;
        } else if (input.type === 'number') {
            return parseFloat(input.value);
        } else if (input.tagName === 'SELECT' || input.type === 'color') {
            return input.value;
        } else {
            return input.value;
        }
    }
    
    async updateNodeParameter(node, paramName, value) {
        // Update node data
        if (node.nodeData && node.nodeData.parameters) {
            node.nodeData.parameters[paramName] = value;
            
            // Process the node with the new parameter
            await this.processNode(node);
        }
    }

    // --- Core Graph Processing Logic ---
    async processNode(node) {
        if (!node.nodeData) return;

        // 1. Resolve all inputs first
        await this.resolveNodeInputs(node);

        console.log(`Executing node: ${node.nodeData.type}`, node.nodeData.parameters);

        let output = null; // Can be THREE.Texture or THREE.Object3D

        // 2. Perform node-specific processing
        switch (node.nodeData.type) {
            case 'image':
                output = await this._processImageNode(node);
                break;
            case 'color':
                output = this._processColorNode(node);
                break;
            case 'vector': // Simple passthrough for now, can be used by 3D nodes
                output = new THREE.Vector3(node.nodeData.parameters.x, node.nodeData.parameters.y, node.nodeData.parameters.z);
                break;
            case 'blur':
                output = this._processBlurNode(node);
                break;
            case 'blend':
                output = this._processBlendNode(node);
                break;
            case 'sharpen':
                // Placeholder for sharpen
                output = node.nodeData.inputValues['Image'];
                console.warn('Sharpen node not fully implemented, passing input directly.');
                break;
            case 'colorAdjust':
                // Placeholder for color adjust
                output = node.nodeData.inputValues['Image'];
                console.warn('Color Adjust node not fully implemented, passing input directly.');
                break;
            case 'particleSystem':
                output = this._processParticleSystemNode(node);
                break;
            case 'volumetric':
                 output = this._processVolumetricNode(node);
                 break;
            case 'glow':
                // Glow is a post-processing effect, often handled by the final viewer/output node
                // For now, it will simply pass the image through, but a full composer chain would handle this
                output = node.nodeData.inputValues['Image'];
                console.warn('Glow node is a post-processing pass, currently passes input directly. Needs EffectComposer integration for full effect.');
                break;
            case 'viewer':
                this._processViewerNode(node); // Viewer directly affects the main scene
                break;
            default:
                console.warn(`No specific processing for node type: ${node.nodeData.type}`);
                break;
        }

        // 3. Store the output on the node for downstream access
        node.nodeData.output = output;
        node.nodeData.previewNeedsUpdate = true; // Mark for preview update

        // 4. Update the node's preview thumbnail
        this.updateNodePreview(node);

        // 5. Recursively process downstream nodes (only if an output was successfully generated)
        if (output !== null) {
            this.processDownstreamNodes(node);
        }
    }

    async resolveNodeInputs(node) {
        node.nodeData.inputValues = {}; // Clear previous inputs
        const connectionsToThisNode = this.connections.filter(conn => conn.inputNode === node);

        for (const conn of connectionsToThisNode) {
            const upstreamNode = conn.outputNode;
            // Ensure upstream node has been processed and has an output
            if (!upstreamNode.nodeData.output) {
                // If upstream node hasn't processed its output yet, process it first
                await this.processNode(upstreamNode);
            }
            node.nodeData.inputValues[conn.inputName] = upstreamNode.nodeData.output;
        }
    }
    
    // --- Node-Specific Processing Implementations ---

    async _processImageNode(node) {
        const params = node.nodeData.parameters;
        let texture = null;

        if (params.source === 'file' && node.nodeData.imageData) {
            const img = new Image();
            img.src = node.nodeData.imageData;
            await new Promise(resolve => img.onload = resolve); // Wait for image to load
            texture = new THREE.Texture(img);
            texture.needsUpdate = true;
        } else if (params.source === 'url' && params.path) {
            const loader = new THREE.TextureLoader();
            try {
                texture = await loader.loadAsync(params.path);
                texture.needsUpdate = true;
            } catch (error) {
                console.error(`Failed to load image from URL ${params.path}:`, error);
                return null;
            }
        }
        // Add support for other sources like 'camera', 'render', 'noise' etc.

        if (texture) {
            return this._renderToRenderTarget(texture, this.fullResRenderTarget);
        }
        return null;
    }

    _processColorNode(node) {
        const params = node.nodeData.parameters;
        const color = new THREE.Color(params.r, params.g, params.b);
        const alpha = params.a !== undefined ? params.a : 1.0;

        // Create a 1x1 pixel canvas texture
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, ${alpha})`;
        ctx.fillRect(0, 0, 1, 1);
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        return this._renderToRenderTarget(texture, this.fullResRenderTarget);
    }

    _processBlurNode(node) {
        const inputTexture = node.nodeData.inputValues['Image'];
        if (!inputTexture) {
            console.warn('Blur node requires an "Image" input.');
            return null;
        }

        const params = node.nodeData.parameters;
        const radius = Math.max(0, params.radius); // Ensure non-negative radius
        const iterations = Math.max(1, params.iterations); // At least one iteration

        // Use a simple passthrough if radius is 0
        if (radius === 0) {
            return this._renderToRenderTarget(inputTexture, this.fullResRenderTarget);
        }

        // Setup the blur shader material
        const blurShader = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                h: { value: 1.0 / this.fullResRenderTarget.width }, // horizontal blur amount
                v: { value: 1.0 / this.fullResRenderTarget.height }, // vertical blur amount
                radius: { value: radius }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float h;
                uniform float v;
                uniform float radius; // Not directly used in this simple blur, but can be for a Gaussian kernel
                varying vec2 vUv;

                void main() {
                    vec4 sum = vec4(0.0);
                    float samples = 0.0;
                    
                    // Simple box blur approximation
                    for (float i = -2.0; i <= 2.0; i += 1.0) { // -2 to 2 (5 samples)
                        for (float j = -2.0; j <= 2.0; j += 1.0) {
                            float offsetH = i * h * radius * 0.2; // Scale offset by radius
                            float offsetV = j * v * radius * 0.2;
                            sum += texture2D(tDiffuse, vUv + vec2(offsetH, offsetV));
                            samples += 1.0;
                        }
                    }
                    gl_FragColor = sum / samples;
                }
            `
        });

        // Ping-pong rendering for multiple iterations
        let currentInputTexture = inputTexture;
        let readTarget = this.fullResRenderTarget; // Output of current iteration
        let writeTarget = this.tempRenderTarget;   // Input for next iteration

        for (let i = 0; i < iterations; i++) {
            // Swap targets for ping-pong
            [readTarget, writeTarget] = [writeTarget, readTarget];
            
            this.fullscreenQuad.material = blurShader;
            blurShader.uniforms.tDiffuse.value = currentInputTexture;
            blurShader.uniforms.h.value = 1.0 / readTarget.width;
            blurShader.uniforms.v.value = 1.0 / readTarget.height;
            blurShader.uniforms.radius.value = radius; // Pass radius to shader
            blurShader.needsUpdate = true;

            this.renderer.setRenderTarget(readTarget);
            this.renderer.clear();
            this.renderer.render(this.offscreenScene, this.offscreenCamera);
            currentInputTexture = readTarget.texture; // Output becomes input for next iteration
        }
        
        // Restore renderer target
        this.renderer.setRenderTarget(null);

        // The final blurred texture is in 'currentInputTexture' (which is readTarget.texture)
        return currentInputTexture;
    }

    _processBlendNode(node) {
        const imageA = node.nodeData.inputValues['Image A'];
        const imageB = node.nodeData.inputValues['Image B'];
        if (!imageA || !imageB) {
            console.warn('Blend node requires "Image A" and "Image B" inputs.');
            return null;
        }

        const params = node.nodeData.parameters;
        const mode = params.mode;
        const opacity = params.opacity;

        // Simple blend shader for demonstration
        const blendShader = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse1: { value: imageA },
                tDiffuse2: { value: imageB },
                opacity: { value: opacity },
                blendMode: { value: this._getBlendModeEnum(mode) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse1;
                uniform sampler2D tDiffuse2;
                uniform float opacity;
                uniform int blendMode; // 0: normal, 1: multiply, etc.
                varying vec2 vUv;

                vec4 blendNormal(vec4 base, vec4 blend) {
                    return vec4(mix(base.rgb, blend.rgb, blend.a * opacity), base.a + blend.a * (1.0 - base.a));
                }
                vec4 blendMultiply(vec4 base, vec4 blend) {
                    return vec4(base.rgb * blend.rgb * opacity + base.rgb * (1.0 - opacity), 1.0); // Simplified
                }
                // Add more blend modes here (e.g., screen, overlay)

                void main() {
                    vec4 color1 = texture2D(tDiffuse1, vUv);
                    vec4 color2 = texture2D(tDiffuse2, vUv);
                    vec4 blendedColor;

                    if (blendMode == 0) { // Normal
                        blendedColor = blendNormal(color1, color2);
                    } else if (blendMode == 1) { // Multiply
                        blendedColor = blendMultiply(color1, color2);
                    } else { // Default to normal
                         blendedColor = blendNormal(color1, color2);
                    }
                    
                    gl_FragColor = blendedColor;
                }
            `
        });

        // Render the blended output
        this.fullscreenQuad.material = blendShader;
        blendShader.needsUpdate = true;

        return this._renderToRenderTarget(null, this.fullResRenderTarget);
    }

    _getBlendModeEnum(mode) {
        const modes = {
            'normal': 0, 'multiply': 1, 'screen': 2, 'overlay': 3,
            'darken': 4, 'lighten': 5, 'color-dodge': 6, 'color-burn': 7,
            'hard-light': 8, 'soft-light': 9, 'difference': 10, 'exclusion': 11
        };
        return modes[mode] !== undefined ? modes[mode] : 0; // Default to normal
    }

   /* _processParticleSystemNode(node) {
        // Remove existing particle system if present in scene
        if (node.nodeData.sceneObject && this.scene.children.includes(node.nodeData.sceneObject)) {
            this.scene.remove(node.nodeData.sceneObject);
            // Dispose previous geometry/material to prevent memory leaks
            node.nodeData.sceneObject.geometry.dispose();
            node.nodeData.sceneObject.material.dispose();
            node.nodeData.sceneObject = null;
        }

        const params = node.nodeData.parameters;
        const count = params.count;
        const size = params.size;
        const speed = params.speed;
        const lifetime = params.lifetime;
        const spread = params.spread;

        const inputVector = node.nodeData.inputValues['Position (Optional)'];
        const inputColor = node.nodeData.inputValues['Color (Optional)'];

        let basePosition = inputVector instanceof THREE.Vector3 ? inputVector : new THREE.Vector3();
        let particleColor = new THREE.Color(1, 1, 1); // Default white
        if (inputColor instanceof THREE.Texture) {
             // If color input is a texture (from a color node), try to get the color
            const colorNode = this.nodes.find(n => n.nodeData.output === inputColor);
            if (colorNode && colorNode.nodeData.type === 'color') {
                const colorParams = colorNode.nodeData.parameters;
                particleColor.setRGB(colorParams.r, colorParams.g, colorParams.b);
            }
        }
        

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3); // For per-particle color
        const velocities = new Float32Array(count * 3);
        const startTimes = new Float32Array(count); // To track lifetime

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            // Initial position around basePosition with spread
            positions[i3 + 0] = basePosition.x + (Math.random() - 0.5) * spread;
            positions[i3 + 1] = basePosition.y + (Math.random() - 0.5) * spread;
            positions[i3 + 2] = basePosition.z + (Math.random() - 0.5) * spread;

            // Initial color
            colors[i3 + 0] = particleColor.r;
            colors[i3 + 1] = particleColor.g;
            colors[i3 + 2] = particleColor.b;

            // Random initial velocity (e.g., upwards with some randomness)
            velocities[i3 + 0] = (Math.random() - 0.5) * speed * 0.1;
            velocities[i3 + 1] = Math.random() * speed * 0.5 + 0.1; // Mostly upwards
            velocities[i3 + 2] = (Math.random() - 0.5) * speed * 0.1;

            startTimes[i] = Math.random() * lifetime; // Stagger start times
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('startTime', new THREE.BufferAttribute(startTimes, 1));


        const material = new THREE.PointsMaterial({
            size: size,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false, // Don't write to depth buffer for transparent particles
            sizeAttenuation: true // Scale particles based on distance
        });

        const particles = new THREE.Points(geometry, material);
        particles.name = `ParticleSystem_${node.nodeData.id}`;
        this.scene.add(particles);

        node.nodeData.sceneObject = particles; // Store reference to the 3D object
        node.userData = node.userData || {};
        node.userData.particleSystem = { // Data for animation updates
            mesh: particles,
            lifetime: lifetime,
            gravity: new THREE.Vector3(0, -9.8, 0), // Simple gravity
            currentTime: 0,
            update: (deltaTime) => {
                const positions = particles.geometry.attributes.position.array;
                const velocities = particles.geometry.attributes.velocity.array;
                const startTimes = particles.geometry.attributes.startTime.array;
                
                node.userData.particleSystem.currentTime += deltaTime;

                for (let i = 0; i < count; i++) {
                    const i3 = i * 3;
                    const elapsed = node.userData.particleSystem.currentTime - startTimes[i];
                    
                    if (elapsed > lifetime) {
                        // Reset particle
                        positions[i3 + 0] = basePosition.x + (Math.random() - 0.5) * spread;
                        positions[i3 + 1] = basePosition.y + (Math.random() - 0.5) * spread;
                        positions[i3 + 2] = basePosition.z + (Math.random() - 0.5) * spread;

                        velocities[i3 + 0] = (Math.random() - 0.5) * speed * 0.1;
                        velocities[i3 + 1] = Math.random() * speed * 0.5 + 0.1;
                        velocities[i3 + 2] = (Math.random() - 0.5) * speed * 0.1;
                        startTimes[i] = node.userData.particleSystem.currentTime; // New start time
                    } else {
                        // Apply gravity
                        velocities[i3 + 1] += node.userData.particleSystem.gravity.y * deltaTime;
                        
                        positions[i3 + 0] += velocities[i3 + 0] * deltaTime;
                        positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
                        positions[i3 + 2] += velocities[i3 + 2] * deltaTime;
                    }
                }
                particles.geometry.attributes.position.needsUpdate = true;
                particles.geometry.attributes.velocity.needsUpdate = true;
            }
        };
        return particles; // Output is a 3D object
    }

    _processVolumetricNode(node) {
        // Remove previous object if it exists
        if (node.nodeData.sceneObject && this.scene.children.includes(node.nodeData.sceneObject)) {
            this.scene.remove(node.nodeData.sceneObject);
            node.nodeData.sceneObject.geometry.dispose();
            node.nodeData.sceneObject.material.dispose();
            node.nodeData.sceneObject = null;
        }

        const params = node.nodeData.parameters;
        const size = params.size;
        const density = params.density;
        const color = new THREE.Color(params.color);

        // Simple transparent box for now, more complex raymarching shaders would be needed for true volumetric
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: density,
            side: THREE.DoubleSide
        });
        const volumeMesh = new THREE.Mesh(geometry, material);
        volumeMesh.position.set(0, size / 2, 0); // Place it above ground
        volumeMesh.name = `VolumetricEffect_${node.nodeData.id}`;
        this.scene.add(volumeMesh);
        node.nodeData.sceneObject = volumeMesh;
        return volumeMesh;
    }


    _processViewerNode(node) {
        const input = node.nodeData.inputValues['Final Input'];
        if (!input) {
            console.warn('Viewer node requires a "Final Input".');
            // Hide any previous output
            if (this.outputViewerMesh) {
                this.scene.remove(this.outputViewerMesh);
                this.outputViewerMesh = null;
            }
            return;
        }

        // Clean up previous viewer output if it was different type
        if (this.outputViewerMesh && this.scene.children.includes(this.outputViewerMesh)) {
             // If previous was a plane and new is 3D object, or vice-versa
            const isInputTexture = input instanceof THREE.Texture;
            const isViewerMeshTexturePlane = this.outputViewerMesh.userData.isVFXOutputPlane;

            if ((isInputTexture && !isViewerMeshTexturePlane) || (!isInputTexture && isViewerMeshTexturePlane)) {
                this.scene.remove(this.outputViewerMesh);
                if (this.outputViewerMesh.geometry) this.outputViewerMesh.geometry.dispose();
                if (this.outputViewerMesh.material) this.outputViewerMesh.material.dispose();
                this.outputViewerMesh = null;
            }
        }

        if (input instanceof THREE.Texture) {
            // Display the texture on a plane in the main scene
            if (!this.outputViewerMesh || !this.outputViewerMesh.userData.isVFXOutputPlane) {
                // Create a new plane if it doesn't exist or is not a texture plane
                const planeGeometry = new THREE.PlaneGeometry(16, 9); // Standard aspect ratio for video/image
                const planeMaterial = new THREE.MeshBasicMaterial({ map: input, side: THREE.DoubleSide, transparent: true });
                this.outputViewerMesh = new THREE.Mesh(planeGeometry, planeMaterial);
                this.outputViewerMesh.position.set(0, 5, -15); // Position in front of the camera or a specific location
                this.outputViewerMesh.name = "VFX_Output_Plane";
                this.outputViewerMesh.userData.isVFXOutputPlane = true; // Flag to identify
                this.scene.add(this.outputViewerMesh);
                console.log('Added VFX output plane to main scene.');
            } else {
                // Update existing plane's material
                this.outputViewerMesh.material.map = input;
                this.outputViewerMesh.material.needsUpdate = true;
                console.log('Updated VFX output plane in main scene.');
            }
             // Ensure 3D objects from other nodes are potentially hidden if we're showing a texture
            this.nodes.forEach(n => {
                if (n.nodeData.type !== 'viewer' && n.nodeData.output instanceof THREE.Object3D && n.nodeData.sceneObject) {
                    n.nodeData.sceneObject.visible = false;
                }
            });
        } else if (input instanceof THREE.Object3D) {
            // If the input is a 3D object (e.g., from Particle System or Volumetric)
            // Ensure this specific object is added and visible, hide others
            if (!this.scene.children.includes(input)) {
                this.scene.add(input);
            }
            input.visible = true; // Ensure the input object is visible

            this.outputViewerMesh = input; // Store reference to the currently displayed 3D object

            // Hide any previous output plane
            this.nodes.forEach(n => {
                if (n.nodeData.type === 'viewer' && n.nodeData.outputViewerMesh && n.nodeData.outputViewerMesh.userData.isVFXOutputPlane) {
                    this.scene.remove(n.nodeData.outputViewerMesh);
                    n.nodeData.outputViewerMesh = null;
                }
            });

             // Ensure other 3D objects from other nodes are potentially hidden
             this.nodes.forEach(n => {
                if (n.nodeData.type !== 'viewer' && n.nodeData.output instanceof THREE.Object3D && n.nodeData.sceneObject && n.nodeData.sceneObject !== input) {
                    n.nodeData.sceneObject.visible = false;
                }
            });

            console.log('Viewer node displaying 3D object in main scene.');
        } else {
             console.warn('Viewer node received unsupported input type.');
             // Hide any previous output
            if (this.outputViewerMesh) {
                this.scene.remove(this.outputViewerMesh);
                this.outputViewerMesh = null;
            }
        }
    }*/

        
    _processParticleSystemNode(node) {
        // Remove existing particle system if present in scene
        if (node.nodeData.sceneObject) {
            if (window.objects && window.objects.includes(node.nodeData.sceneObject)) {
                window.objects = window.objects.filter(obj => obj !== node.nodeData.sceneObject);
                if (typeof updateHierarchy === 'function') {
                    updateHierarchy();
                }
            }
            if (this.scene.children.includes(node.nodeData.sceneObject)) {
                this.scene.remove(node.nodeData.sceneObject);
            }
            if (node.nodeData.sceneObject.geometry) node.nodeData.sceneObject.geometry.dispose();
            if (node.nodeData.sceneObject.material) node.nodeData.sceneObject.material.dispose();
            node.nodeData.sceneObject = null;
        }

        const params = node.nodeData.parameters;
        const count = params.count;
        const size = params.size;
        const speed = params.speed;
        const lifetime = params.lifetime;
        const spread = params.spread;

        const inputVector = node.nodeData.inputValues['Position (Optional)'];
        const inputColor = node.nodeData.inputValues['Color (Optional)'];

        let basePosition = inputVector instanceof THREE.Vector3 ? inputVector : new THREE.Vector3();
        let particleColor = new THREE.Color(1, 1, 1);
        if (inputColor instanceof THREE.Texture) {
            const colorNode = this.nodes.find(n => n.nodeData.output === inputColor);
            if (colorNode && colorNode.nodeData.type === 'color') {
                const colorParams = colorNode.nodeData.parameters;
                particleColor.setRGB(colorParams.r, colorParams.g, colorParams.b);
            }
        }

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const startTimes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            positions[i3 + 0] = basePosition.x + (Math.random() - 0.5) * spread;
            positions[i3 + 1] = basePosition.y + (Math.random() - 0.5) * spread;
            positions[i3 + 2] = basePosition.z + (Math.random() - 0.5) * spread;

            colors[i3 + 0] = particleColor.r;
            colors[i3 + 1] = particleColor.g;
            colors[i3 + 2] = particleColor.b;

            velocities[i3 + 0] = (Math.random() - 0.5) * speed * 0.1;
            velocities[i3 + 1] = Math.random() * speed * 0.5 + 0.1;
            velocities[i3 + 2] = (Math.random() - 0.5) * speed * 0.1;

            startTimes[i] = Math.random() * lifetime;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('startTime', new THREE.BufferAttribute(startTimes, 1));

        const material = new THREE.PointsMaterial({
            size: size,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true
        });

        const particles = new THREE.Points(geometry, material);
        const particleSystemName = `VFX_ParticleSystem_${node.nodeData.id}`;
        
        // --- ADDED: Set selectable to true for transform controls ---
        particles.userData.selectable = true;
        // --- End ADDED ---

        if (window.addObjectToScene) {
            addObjectToScene(particles, particleSystemName);
        } else {
            this.scene.add(particles);
            particles.name = particleSystemName;
        }

        node.nodeData.sceneObject = particles;
        node.userData = node.userData || {};
        node.userData.particleSystem = {
            mesh: particles,
            lifetime: lifetime,
            gravity: new THREE.Vector3(0, -9.8, 0),
            currentTime: 0,
            update: (deltaTime) => {
                const positions = particles.geometry.attributes.position.array;
                const velocities = particles.geometry.attributes.velocity.array;
                const startTimes = particles.geometry.attributes.startTime.array;
                
                node.userData.particleSystem.currentTime += deltaTime;

                for (let i = 0; i < count; i++) {
                    const i3 = i * 3;
                    const elapsed = node.userData.particleSystem.currentTime - startTimes[i];
                    
                    if (elapsed > lifetime) {
                        positions[i3 + 0] = basePosition.x + (Math.random() - 0.5) * spread;
                        positions[i3 + 1] = basePosition.y + (Math.random() - 0.5) * spread;
                        positions[i3 + 2] = basePosition.z + (Math.random() - 0.5) * spread;

                        velocities[i3 + 0] = (Math.random() - 0.5) * speed * 0.1;
                        velocities[i3 + 1] = Math.random() * speed * 0.5 + 0.1;
                        velocities[i3 + 2] = (Math.random() - 0.5) * speed * 0.1;
                        startTimes[i] = node.userData.particleSystem.currentTime;
                    } else {
                        velocities[i3 + 1] += node.userData.particleSystem.gravity.y * deltaTime;
                        
                        positions[i3 + 0] += velocities[i3 + 0] * deltaTime;
                        positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
                        positions[i3 + 2] += velocities[i3 + 2] * deltaTime;
                    }
                }
                particles.geometry.attributes.position.needsUpdate = true;
                particles.geometry.attributes.velocity.needsUpdate = true;
            }
        };
        return particles;
    }

    _processVolumetricNode(node) {
        if (node.nodeData.sceneObject) {
            if (window.objects && window.objects.includes(node.nodeData.sceneObject)) {
                window.objects = window.objects.filter(obj => obj !== node.nodeData.sceneObject);
                if (typeof updateHierarchy === 'function') {
                    updateHierarchy();
                }
            }
            if (this.scene.children.includes(node.nodeData.sceneObject)) {
                this.scene.remove(node.nodeData.sceneObject);
            }
            if (node.nodeData.sceneObject.geometry) node.nodeData.sceneObject.geometry.dispose();
            if (node.nodeData.sceneObject.material) node.nodeData.sceneObject.material.dispose();
            node.nodeData.sceneObject = null;
        }

        const params = node.nodeData.parameters;
        const size = params.size;
        const density = params.density;
        const color = new THREE.Color(params.color);

        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: density,
            side: THREE.DoubleSide
        });
        const volumeMesh = new THREE.Mesh(geometry, material);
        volumeMesh.position.set(0, size / 2, 0);
        
        const volumetricEffectName = `VFX_VolumetricEffect_${node.nodeData.id}`;

        // --- ADDED: Set selectable to true for transform controls ---
        volumeMesh.userData.selectable = true;
        // --- End ADDED ---

        if (window.addObjectToScene) {
            addObjectToScene(volumeMesh, volumetricEffectName);
        } else {
            this.scene.add(volumeMesh);
            volumeMesh.name = volumetricEffectName;
        }

        node.nodeData.sceneObject = volumeMesh;
        return volumeMesh;
    }

    _processViewerNode(node) {
        const input = node.nodeData.inputValues['Final Input'];

        if (this.outputViewerMesh) {
            const isCurrentOutputPlane = this.outputViewerMesh.userData.isVFXOutputPlane;
            const isInputTexture = input instanceof THREE.Texture;
            const isInputObject3D = input instanceof THREE.Object3D;

            if (isCurrentOutputPlane && isInputObject3D) {
                if (window.objects && window.objects.includes(this.outputViewerMesh)) {
                    window.objects = window.objects.filter(obj => obj !== this.outputViewerMesh);
                    if (typeof updateHierarchy === 'function') updateHierarchy();
                }
                if (this.scene.children.includes(this.outputViewerMesh)) {
                    this.scene.remove(this.outputViewerMesh);
                }
                if (this.outputViewerMesh.geometry) this.outputViewerMesh.geometry.dispose();
                if (this.outputViewerMesh.material) this.outputViewerMesh.material.dispose();
                this.outputViewerMesh = null;
            } else if (!isCurrentOutputPlane && isInputTexture) {
                if (this.outputViewerMesh !== input) {
                    this.outputViewerMesh.visible = false;
                }
                this.outputViewerMesh = null;
            }
        }
        
        if (!input) {
            console.warn('Viewer node requires a "Final Input".');
            if (this.outputViewerMesh) {
                if (this.outputViewerMesh.userData.isVFXOutputPlane) {
                    if (window.objects && window.objects.includes(this.outputViewerMesh)) {
                        window.objects = window.objects.filter(obj => obj !== this.outputViewerMesh);
                        if (typeof updateHierarchy === 'function') updateHierarchy();
                    }
                    if (this.scene.children.includes(this.outputViewerMesh)) {
                        this.scene.remove(this.outputViewerMesh);
                    }
                    if (this.outputViewerMesh.geometry) this.outputViewerMesh.geometry.dispose();
                    if (this.outputViewerMesh.material) this.outputViewerMesh.material.dispose();
                } else {
                    this.outputViewerMesh.visible = false;
                }
                this.outputViewerMesh = null;
            }
            return;
        }

        if (input instanceof THREE.Texture) {
            const outputPlaneName = "VFX_Output_Viewer_Plane";
            if (!this.outputViewerMesh || !this.outputViewerMesh.userData.isVFXOutputPlane) {
                const planeGeometry = new THREE.PlaneGeometry(16, 9);
                const planeMaterial = new THREE.MeshBasicMaterial({ map: input, side: THREE.DoubleSide, transparent: true });
                const newOutputPlane = new THREE.Mesh(planeGeometry, planeMaterial);
                newOutputPlane.position.set(0, 5, -15);
                newOutputPlane.userData.isVFXOutputPlane = true;
                
                // --- ADDED: Set selectable to true for transform controls ---
                newOutputPlane.userData.selectable = true;
                // --- End ADDED ---

                if (window.addObjectToScene) {
                    addObjectToScene(newOutputPlane, outputPlaneName);
                } else {
                    this.scene.add(newOutputPlane);
                    newOutputPlane.name = outputPlaneName;
                }
                this.outputViewerMesh = newOutputPlane;
                console.log('Added VFX output plane to main scene.');
            } else {
                this.outputViewerMesh.material.map = input;
                this.outputViewerMesh.material.needsUpdate = true;
                this.outputViewerMesh.visible = true;
                console.log('Updated VFX output plane in main scene.');
            }

            this.nodes.forEach(n => {
                if (n.nodeData.type !== 'viewer' && n.nodeData.output instanceof THREE.Object3D && n.nodeData.sceneObject) {
                    n.nodeData.sceneObject.visible = false;
                }
            });

        } else if (input instanceof THREE.Object3D) {
            if (!this.scene.children.includes(input)) {
                this.scene.add(input);
                console.warn(`VFX Viewer: 3D object input was not found in main scene, added directly. (Node: ${input.name})`);
            }
            input.visible = true;
            this.outputViewerMesh = input;

            this.nodes.forEach(n => {
                if (n.nodeData.type === 'viewer' && n.nodeData.outputViewerMesh && n.nodeData.outputViewerMesh.userData.isVFXOutputPlane) {
                    if (window.objects && window.objects.includes(n.nodeData.outputViewerMesh)) {
                        window.objects = window.objects.filter(obj => obj !== n.nodeData.outputViewerMesh);
                        if (typeof updateHierarchy === 'function') updateHierarchy();
                    }
                    if (this.scene.children.includes(n.nodeData.outputViewerMesh)) {
                        this.scene.remove(n.nodeData.outputViewerMesh);
                    }
                    if (n.nodeData.outputViewerMesh.geometry) n.nodeData.outputViewerMesh.geometry.dispose();
                    if (n.nodeData.outputViewerMesh.material) n.nodeData.outputViewerMesh.material.dispose();
                    n.nodeData.outputViewerMesh = null;
                }
            });

            this.nodes.forEach(n => {
                if (n.nodeData.type !== 'viewer' && n.nodeData.output instanceof THREE.Object3D && n.nodeData.sceneObject && n.nodeData.sceneObject !== input) {
                    n.nodeData.sceneObject.visible = false;
                }
            });

            console.log('Viewer node displaying 3D object in main scene.');
        } else {
            console.warn('Viewer node received unsupported input type.');
            if (this.outputViewerMesh) {
                if (this.outputViewerMesh.userData.isVFXOutputPlane) {
                    if (window.objects && window.objects.includes(this.outputViewerMesh)) {
                        window.objects = window.objects.filter(obj => obj !== this.outputViewerMesh);
                        if (typeof updateHierarchy === 'function') updateHierarchy();
                    }
                    if (this.scene.children.includes(this.outputViewerMesh)) {
                        this.scene.remove(this.outputViewerMesh);
                    }
                    if (this.outputViewerMesh.geometry) this.outputViewerMesh.geometry.dispose();
                    if (this.outputViewerMesh.material) this.outputViewerMesh.material.dispose();
                } else {
                    this.outputViewerMesh.visible = false;
                }
                this.outputViewerMesh = null;
            }
        }
    }


    // Helper to render a texture to a render target and return its texture
    _renderToRenderTarget(sourceTexture, targetRenderTarget) {
        // Temporarily disable XR for offscreen rendering to prevent issues
        const currentXrEnabled = this.renderer.xr.enabled;
        this.renderer.xr.enabled = false; 

        // Set the source texture for the fullscreen quad
        this.fullscreenQuad.material = new THREE.ShaderMaterial({
            uniforms: { tDiffuse: { value: sourceTexture } },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = texture2D(tDiffuse, vUv);
                }
            `
        });
        this.fullscreenQuad.material.needsUpdate = true; // Ensure material updates if sourceTexture changes

        this.renderer.setRenderTarget(targetRenderTarget);
        this.renderer.clear(); // Clear the render target
        this.renderer.render(this.offscreenScene, this.offscreenCamera);
        this.renderer.setRenderTarget(null); // Restore default render target

        this.renderer.xr.enabled = currentXrEnabled; // Restore XR state

        return targetRenderTarget.texture; // Return the texture from the render target
    }
    
    processDownstreamNodes(node) {
        // Find all connections from this node's outputs
        const connections = this.connections.filter(conn => conn.outputNode === node);
        
        // Process each connected node
        connections.forEach(conn => {
            // Only re-process if the output type is compatible
            if (this.isConnectionValid(conn.outputConnector, conn.inputConnector)) {
                this.processNode(conn.inputNode);
            }
        });
    }
    
    isConnectionValid(outputConnector, inputConnector) {
        // Check if connection is valid (compatible types, no cycles, etc.)
        if (!outputConnector || !inputConnector) return false;
        
        // Don't connect to self
        if (outputConnector.closest('.node') === inputConnector.closest('.node')) {
            console.warn("Cannot connect node to itself.");
            return false;
        }

        // Prevent connecting output to output or input to input
        if (outputConnector.getAttribute('data-direction') === inputConnector.getAttribute('data-direction')) {
            console.warn("Cannot connect same connector types (output to output or input to input).");
            return false;
        }
        
        const outputType = outputConnector.getAttribute('data-type');
        const inputType = inputConnector.getAttribute('data-type');
        
        // Check for type compatibility
        if (inputType === 'any' || outputType === 'any') {
            return true; // 'any' type connects to anything
        }
        if (inputType === outputType) {
            return true; // Direct type match
        }
        
        console.warn(`Type mismatch: Cannot connect ${outputType} to ${inputType}.`);
        return false;
    }
    
    removeConnectionsToInput(inputConnector) {
        // Find and remove existing connections to this input
        const connectionsToRemove = this.connections.filter(conn => conn.inputConnector === inputConnector);
        
        connectionsToRemove.forEach(conn => {
            this.canvas.removeChild(conn.element);
            const index = this.connections.indexOf(conn);
            if (index > -1) {
                this.connections.splice(index, 1);
            }
            console.log(`Removed connection to input ${inputConnector.getAttribute('data-name')} of node ${conn.inputNode.nodeData.type}`);
            // Re-process the affected node after removing an input
            this.processNode(conn.inputNode);
        });
    }
    
    clearNodeProperties() {
        // Clear the property panel
        if (this.propertyPanel) {
            this.propertyPanel.innerHTML = '<h3>Properties</h3><div id="property-container"><p>Select a node to edit properties</p></div>';
        }
    }

    showContextMenu(x, y, nodeElement) { 
        // Remove any existing context menu
        const existingMenu = document.querySelector('.node-context-menu');
        if (existingMenu) {
            document.body.removeChild(existingMenu);
        }

        // Create a context menu for node creation and manipulation
        const menu = document.createElement('div');
        menu.className = 'node-context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        
        // Add menu items
        let menuHTML = `
            <div class="menu-item" data-node-type="image">Add Image Node</div>
            <div class="menu-item" data-node-type="color">Add Color Node</div>
            <div class="menu-item" data-node-type="vector">Add Vector Node</div>
            <hr style="border-color:#555; margin: 5px 0;">
            <div class="menu-item" data-node-type="blur">Add Blur Node</div>
            <div class="menu-item" data-node-type="blend">Add Blend Node</div>
            <div class="menu-item" data-node-type="particleSystem">Add Particle System</div>
            <div class="menu-item" data-node-type="volumetric">Add Volumetric (Placeholder)</div>
            <hr style="border-color:#555; margin: 5px 0;">
            <div class="menu-item" data-node-type="viewer">Add Viewer Node</div>
        `;
        
        if (nodeElement) {
            menuHTML += `
                <hr style="border-color:#555; margin: 5px 0;">
                <div class="menu-item" data-action="delete">Delete Node</div>
                <div class="menu-item" data-action="duplicate">Duplicate Node</div>
            `;
        }
        menu.innerHTML = menuHTML;
        
        document.body.appendChild(menu);
        
        // Add event listeners
        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const nodeType = item.getAttribute('data-node-type');
                const action = item.getAttribute('data-action');
                
                if (nodeType) {
                    const canvasRect = this.canvas.getBoundingClientRect();
                    // Position new node relative to canvas scroll
                    const nodeX = x - canvasRect.left + this.canvas.scrollLeft;
                    const nodeY = y - canvasRect.top + this.canvas.scrollTop;
                    this.createNode(nodeType, nodeX, nodeY);
                } else if (action === 'delete' && nodeElement) {
                    this.deleteNode(nodeElement);
                } else if (action === 'duplicate' && nodeElement) {
                    this.duplicateNode(nodeElement);
                }
                
                document.body.removeChild(menu);
            });
        });
        
        // Close menu on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.button !== 2) { // Exclude right-clicks
                document.body.removeChild(menu);
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        
        document.addEventListener('mousedown', closeMenu);
    }
    
    // Function to delete a node
    /*deleteNode(nodeElement) {
        if (!nodeElement || !this.nodes.includes(nodeElement)) return;
        
        // Remove all associated connections first
        this.connections = this.connections.filter(conn => {
            if (conn.inputNode === nodeElement || conn.outputNode === nodeElement) {
                this.canvas.removeChild(conn.element);
                return false; // Remove this connection
            }
            return true;
        });

        // Remove node from array
        this.nodes = this.nodes.filter(n => n !== nodeElement);
        this.canvas.removeChild(nodeElement); // Remove from DOM

        // If this node had a 3D object in scene, remove it
        if (nodeElement.nodeData.sceneObject && this.scene.children.includes(nodeElement.nodeData.sceneObject)) {
            this.scene.remove(nodeElement.nodeData.sceneObject);
            // Dispose of resources
            if (nodeElement.nodeData.sceneObject.geometry) nodeElement.nodeData.sceneObject.geometry.dispose();
            if (nodeElement.nodeData.sceneObject.material) nodeElement.nodeData.sceneObject.material.dispose();
        }
        
        // If the deleted node was the selected one, clear properties
        if (this.selectedNode === nodeElement) {
            this.selectNode(null);
        }

        // Trigger a graph re-evaluation in case dependencies were broken
        this.executeGraph();
        
        console.log('Node deleted:', nodeElement.nodeData.type);
    }*/

       deleteNode(nodeElement) {
        if (!nodeElement || !this.nodes.includes(nodeElement)) return;
        
        this.connections = this.connections.filter(conn => {
            if (conn.inputNode === nodeElement || conn.outputNode === nodeElement) {
                this.canvas.removeChild(conn.element);
                return false;
            }
            return true;
        });

        if (nodeElement.nodeData.sceneObject) {
            if (window.objects && window.objects.includes(nodeElement.nodeData.sceneObject)) {
                window.objects = window.objects.filter(obj => obj !== nodeElement.nodeData.sceneObject);
                if (typeof updateHierarchy === 'function') {
                    updateHierarchy();
                }
            }
            if (this.scene.children.includes(nodeElement.nodeData.sceneObject)) {
                this.scene.remove(nodeElement.nodeData.sceneObject);
            }
            if (nodeElement.nodeData.sceneObject.geometry) nodeElement.nodeData.sceneObject.geometry.dispose();
            if (nodeElement.nodeData.sceneObject.material) nodeElement.nodeData.sceneObject.material.dispose();
        }

        if (nodeElement.nodeData.type === 'viewer' && this.outputViewerMesh) {
             if (this.outputViewerMesh.userData.isVFXOutputPlane) {
                 if (window.objects && window.objects.includes(this.outputViewerMesh)) {
                    window.objects = window.objects.filter(obj => obj !== this.outputViewerMesh);
                    if (typeof updateHierarchy === 'function') updateHierarchy();
                }
                if (this.scene.children.includes(this.outputViewerMesh)) {
                    this.scene.remove(this.outputViewerMesh);
                }
                if (this.outputViewerMesh.geometry) this.outputViewerMesh.geometry.dispose();
                if (this.outputViewerMesh.material) this.outputViewerMesh.material.dispose();
             } else {
                 this.outputViewerMesh.visible = false;
             }
            this.outputViewerMesh = null;
        }
        
        this.nodes = this.nodes.filter(n => n !== nodeElement);
        this.canvas.removeChild(nodeElement); 
        
        if (this.selectedNode === nodeElement) {
            this.selectNode(null);
        }

        this.executeGraph();
        
        console.log('Node deleted:', nodeElement.nodeData.type);
    }

    
    // Function to duplicate a node
    duplicateNode(nodeElement) {
        if (!nodeElement || !nodeElement.nodeData) return;
        
        const newNodeData = JSON.parse(JSON.stringify(nodeElement.nodeData));
        newNodeData.id = 'node_' + Date.now(); // Generate new ID

        const newX = parseFloat(nodeElement.style.left) + 30;
        const newY = parseFloat(nodeElement.style.top) + 30;

        const newNode = this.createNode(newNodeData.type, newX, newY);
        newNode.nodeData = newNodeData; // Assign the duplicated data
        
        // Re-process the new node to ensure it initializes its output correctly
        this.processNode(newNode);

        console.log('Node duplicated:', newNode.nodeData.type);
    }
    
    update(deltaTime) {
        // Update any animated effects in the node editor
        
        // Execute shader effects for each node that needs it
        this.nodes.forEach(node => {
            if (node.nodeData && node.nodeData.type === 'particleSystem') {
                const particleSystem = node.userData?.particleSystem;
                if (particleSystem && particleSystem.update) {
                    particleSystem.update(deltaTime);
                }
            } else if (node.nodeData && node.nodeData.type === 'volumetric') {
                // Update volumetric effects if any
                // const volumetric = node.userData?.volumetric;
                // if (volumetric) { volumetric.update(deltaTime); }
            }
            
            // Update preview textures for image-based nodes if flagged
            if (node.nodeData && node.nodeData.previewNeedsUpdate) {
                this.updateNodePreview(node);
                node.nodeData.previewNeedsUpdate = false;
            }
        });
        
        // Update connection appearances based on data flow
        this.connections.forEach(conn => {
            // A simple way to mark connections active: if its output node has data
            if (conn.outputNode.nodeData && conn.outputNode.nodeData.output) {
                conn.element.classList.add('active');
                this.animateConnectionFlow(conn, deltaTime);
            } else {
                conn.element.classList.remove('active');
            }
        });
    }
    
    animateConnectionFlow(connection, deltaTime) {
        // Animate data flowing through the connection
        const path = connection.element.querySelector('path');
        if (path) {
            if (!connection.flowAnimation) {
                connection.flowAnimation = {
                    offset: 0,
                    speed: 0.05  // Animation speed, adjust as needed
                };
            }
            
            connection.flowAnimation.offset += deltaTime * connection.flowAnimation.speed;
            if (connection.flowAnimation.offset > 1) { // Reset if offset is too large
                connection.flowAnimation.offset = 0;
            }
            
            path.setAttribute('stroke-dasharray', '5, 5');
            path.setAttribute('stroke-dashoffset', connection.flowAnimation.offset * -10); // Negative for flow direction
        }
    }
    
    updateNodePreview(node) {
        // Update the preview thumbnail for a node
        const previewDiv = node.querySelector('.node-preview');
        if (!previewDiv) return;
        
        const output = node.nodeData?.output;
        if (!output) {
            previewDiv.innerHTML = '<p style="color:#888; font-size:10px;">No Output</p>';
            return;
        }

        let canvas = previewDiv.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            previewDiv.innerHTML = ''; // Clear any 'No Output' message
            previewDiv.appendChild(canvas);
        }
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous content

        // Render based on the type of output
        if (output instanceof THREE.Texture) {
            this._renderTextureToCanvas(output, canvas);
        } else if (output instanceof THREE.Object3D) {
            this._render3DPreview(output, canvas);
        } else if (output instanceof THREE.Vector3) {
            // For vector node, display text
            ctx.fillStyle = '#444';
            ctx.fillRect(0,0,canvas.width, canvas.height);
            ctx.fillStyle = '#eee';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`X:${output.x.toFixed(2)}`, canvas.width / 2, canvas.height / 2 - 10);
            ctx.fillText(`Y:${output.y.toFixed(2)}`, canvas.width / 2, canvas.height / 2 + 5);
            ctx.fillText(`Z:${output.z.toFixed(2)}`, canvas.width / 2, canvas.height / 2 + 20);
        }
        // Add more output types as needed
    }
    
    _renderTextureToCanvas(texture, canvas) {
        const ctx = canvas.getContext('2d');
        
        if (!texture || !texture.isTexture) {
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#eee';
            ctx.font = '10px Arial';
            ctx.fillText('No Texture', 5, canvas.height / 2);
            return;
        }

        // Use the dedicated preview render target
        this._renderToRenderTarget(texture, this.previewRenderTarget);
        
        // Read pixels from the preview render target
        const width = this.previewRenderTarget.width;
        const height = this.previewRenderTarget.height;
        const pixels = new Uint8Array(width * height * 4);
        
        this.renderer.readRenderTargetPixels(
            this.previewRenderTarget, 0, 0, width, height, pixels
        );
        
        // Create ImageData and put on canvas
        const imageData = new ImageData(
            new Uint8ClampedArray(pixels), width, height
        );
        
        // Create a temporary canvas to flip the image (WebGL coordinate system vs Canvas 2D)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        // Draw to final canvas with Y-flip and scale to fit preview size
        ctx.save();
        ctx.scale(1, -1); // Flip Y
        ctx.drawImage(
            tempCanvas, 
            0, 0, width, height, // Source rectangle
            0, -canvas.height, canvas.width, canvas.height // Destination rectangle
        );
        ctx.restore();
    }
    
    _render3DPreview(object3D, canvas) {
        if (!object3D || !object3D.isObject3D) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#333';
            ctx.fillRect(0,0,canvas.width, canvas.height);
            ctx.fillStyle = '#eee';
            ctx.font = '10px Arial';
            ctx.fillText('No 3D Obj', 5, canvas.height / 2);
            return;
        }

        // Create a temporary scene for preview
        const tempScene = new THREE.Scene();
        tempScene.background = new THREE.Color(0x222222);
        
        // Add lighting
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(1, 1, 1);
        tempScene.add(light);
        tempScene.add(new THREE.AmbientLight(0x404040));
        
        // Add the object (clone to avoid modifying original)
        const clonedObject = object3D.clone();
        tempScene.add(clonedObject);
        
        // Center and scale object for preview
        const bbox = new THREE.Box3().setFromObject(clonedObject);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scaleFactor = canvas.width / maxDim * 0.7; // Scale to fit
        clonedObject.scale.set(scaleFactor, scaleFactor, scaleFactor);
        clonedObject.position.sub(center.multiplyScalar(scaleFactor)); // Center it after scaling

        // Camera for preview
        const aspect = canvas.width / canvas.height;
        const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        camera.position.set(2, 2, 2);
        camera.lookAt(0, 0, 0);
        
        // Render to the canvas
        // We use a temporary WebGLRenderer for the preview canvas
        const tempRenderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });
        tempRenderer.setSize(canvas.width, canvas.height, false);
        tempRenderer.setClearColor(0x222222, 1);
        tempRenderer.render(tempScene, camera);

        // Dispose temporary renderer
        tempRenderer.dispose();
        tempScene.traverse(obj => { // Dispose materials/geometries from cloned objects
            if (obj.isMesh) {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            }
        });
    }
    
    exportNodeGraph() {
        // Export the node graph as JSON
        const exportData = {
            nodes: this.nodes.map(node => {
                return {
                    id: node.nodeData.id,
                    type: node.nodeData.type,
                    parameters: node.nodeData.parameters,
                    position: {
                        x: parseFloat(node.style.left),
                        y: parseFloat(node.style.top)
                    },
                    imageData: node.nodeData.imageData // Include imageData for image nodes
                };
            }),
            connections: this.connections.map(conn => {
                return {
                    outputNodeId: conn.outputNode.nodeData.id,
                    inputNodeId: conn.inputNode.nodeData.id,
                    outputName: conn.outputName,
                    inputName: conn.inputName
                };
            })
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    async importNodeGraph(jsonData) {
        try {
            // Clear existing graph
            this.clearNodeGraph();
            
            // Parse JSON data
            const importData = JSON.parse(jsonData);
            
            // Create nodes
            const nodeMap = new Map(); // Map old IDs to new node elements
            
            for (const nodeData of importData.nodes) {
                const node = this.createNode(
                    nodeData.type, 
                    nodeData.position.x, 
                    nodeData.position.y
                );
                
                // Restore parameters
                Object.assign(node.nodeData.parameters, nodeData.parameters);
                if (nodeData.imageData) { // Restore image data
                    node.nodeData.imageData = nodeData.imageData;
                }
                
                // Map old ID to new node
                nodeMap.set(nodeData.id, node);
            }
            
            // Create connections
            importData.connections.forEach(connData => {
                const outputNode = nodeMap.get(connData.outputNodeId);
                const inputNode = nodeMap.get(connData.inputNodeId);
                
                if (outputNode && inputNode) {
                    const outputConnector = this.findConnector(
                        outputNode, 'output', connData.outputName
                    );
                    const inputConnector = this.findConnector(
                        inputNode, 'input', connData.inputName
                    );
                    
                    if (outputConnector && inputConnector) {
                        this.createConnection(outputConnector, inputConnector);
                    }
                }
            });
            
            // Process all nodes in dependency order to update the graph and scene
            await this.executeGraph();
            
            return true;
        } catch (error) {
            console.error('Error importing node graph:', error);
            return false;
        }
    }
    
    findConnector(node, direction, name) {
        // Find a connector by name and direction
        return node.querySelector(
            `.connector.${direction}[data-name="${name}"]`
        );
    }
    
    clearNodeGraph() {
        // Remove all connections from DOM and array
        this.connections.forEach(conn => {
            if (conn.element && conn.element.parentNode) {
                this.canvas.removeChild(conn.element);
            }
        });
        this.connections = [];
        
        // Remove all nodes from DOM and array, dispose 3D objects
        this.nodes.forEach(node => {
            if (node.nodeData.sceneObject && this.scene.children.includes(node.nodeData.sceneObject)) {
                this.scene.remove(node.nodeData.sceneObject);
                if (node.nodeData.sceneObject.geometry) node.nodeData.sceneObject.geometry.dispose();
                if (node.nodeData.sceneObject.material) node.nodeData.sceneObject.material.dispose();
            }
            if (node.parentNode) {
                this.canvas.removeChild(node);
            }
        });
        this.nodes = [];

        // Clear output viewer from main scene
        if (this.outputViewerMesh && this.scene.children.includes(this.outputViewerMesh)) {
            this.scene.remove(this.outputViewerMesh);
            if (this.outputViewerMesh.geometry) this.outputViewerMesh.geometry.dispose();
            if (this.outputViewerMesh.material) this.outputViewerMesh.material.dispose();
            this.outputViewerMesh = null;
        }

        this.selectedNode = null;
        this.clearNodeProperties();
    }
    
    async executeGraph() {
        // Execute the entire node graph from inputs to outputs
        console.log('Executing node graph...');
        
        // Simple topological sort to ensure processing order
        const nodesToProcess = [...this.nodes];
        const processedNodes = new Set();
        let changed = true;

        while (changed && nodesToProcess.length > 0) {
            changed = false;
            for (let i = nodesToProcess.length - 1; i >= 0; i--) {
                const node = nodesToProcess[i];
                // Check if all inputs for this node are already processed
                const allInputsProcessed = this.connections
                    .filter(conn => conn.inputNode === node)
                    .every(conn => processedNodes.has(conn.outputNode.nodeData.id));

                if (allInputsProcessed) {
                    await this.processNode(node);
                    processedNodes.add(node.nodeData.id);
                    nodesToProcess.splice(i, 1); // Remove from list
                    changed = true;
                }
            }
            if (!changed && nodesToProcess.length > 0) {
                console.warn("Circular dependency or unprocessed nodes detected. Processing remaining nodes anyway.");
                // Break infinite loop, process remaining without strict order
                for (const node of nodesToProcess) {
                    await this.processNode(node);
                }
                nodesToProcess.length = 0;
            }
        }
        
        console.log('Node graph execution complete');
    }
    
    // Add ability to save/load presets
    savePreset(name) {
        const preset = {
            name: name,
            graph: this.exportNodeGraph(),
            timestamp: Date.now()
        };
        
        // Save to localStorage or external storage
        const presets = JSON.parse(localStorage.getItem('nodePresets') || '[]');
        presets.push(preset);
        localStorage.setItem('nodePresets', JSON.stringify(presets));
        
        console.log(`Preset '${name}' saved.`);
        return preset;
    }
    
    async loadPreset(name) {
        const presets = JSON.parse(localStorage.getItem('nodePresets') || '[]');
        const preset = presets.find(p => p.name === name);
        
        if (preset) {
            console.log(`Loading preset '${name}'...`);
            return await this.importNodeGraph(preset.graph);
        }
        
        console.warn(`Preset '${name}' not found.`);
        return false;
    }
}


// Initialize the node editor when the page loads
// This part should be called ONCE after your main Three.js scene, renderer, camera are ready.
// The user's original code already moved it to the end of init(), which is correct.
/*
document.addEventListener('DOMContentLoaded', function() {
    // Wait a short time to ensure THREE.js is initialized
    setTimeout(() => {
        initNodeVFXEditor();
    }, 1000);
});
*/

// The rest of your init() function remains largely the same,
// just make sure initNodeVFXEditor() is called after scene, renderer, camera are created.

// Example of where initNodeVFXEditor should be called in your `init()` function:
// (You already have this, just confirming its placement)

/*
    // ... (Your existing init() function code) ...

    // >>>>>>>>>>>>>> NEW: Initialize VFX Node Editor <<<<<<<<<<<<<<<<<<<<<<<<
    // Make sure this is called AFTER scene, renderer, camera are fully set up.
    initNodeVFXEditor();
    // >>>>>>>>>>>>>> END VFX Node Editor Initialization <<<<<<<<<<<<<<<<<<<<

    // ... (rest of your init() function) ...
*/


// --- The provided init() function has a call to NodeTerrainEditor which might be a typo,
// --- it should be NodeVFXEditor if that's what you want to initialize.
// --- I've made the adjustment in the provided init() function below.




/*
// Initialize the node VFX editor
function initNodeVFXEditor() {
    if (!window.THREE || !scene || !renderer || !camera) {
        console.error('Three.js components not initialized');
        return;
    }
    createNodeEditorButton();
    createNodeEditorContainer();
    addNodeEditorStyles();
    setupNodeTemplates();
    initNodeConnectionSystem();
    setupNodeContextMenu();
    
    // Initialize the nodeEditor instance
    window.nodeEditor = new NodeVFXEditor(scene, renderer, camera);
    
    console.log("Node VFX Editor initialized");
}

function createNodeEditorButton() {
    const button = document.createElement('button');
    button.id = 'node-editor-button';
    button.className = 'tool-button';
    button.innerHTML = 'VFX Editor';
    button.title = "Open VFX";

    //Add to Tool Bar group
    const toolbarGroup = document.getElementById('node-editor-button-grp')|| document.body;
    toolbarGroup.appendChild(button)

    // Event listener
    button.addEventListener('click', toggleNodeEditor);
    
    console.log("Node Editor button created");
}

function createNodeEditorContainer() {
    // Create main container
    const container = document.createElement('div');
    container.id = 'node-editor-container';
    container.className = 'node-editor-panel';
    container.style.display = 'none'; // Hidden by default
    
    // Create header with controls
    const header = document.createElement('div');
    header.className = 'panel-header-vfx';
    header.innerHTML = `
        <span class="panel-title">Node VFX Editor</span>
        <div class="panel-controls">
            <button id="node-upload-media" class="panel-button" title="Upload Media">
                <i class="fas fa-upload"></i>
            </button>
            <button id="node-editor-expand" class="panel-button" title="Expand/Collapse">
                <i class="fas fa-expand-alt"></i>
            </button>
            <button  class="panel-button" title="Close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Create editor canvas
    const canvas = document.createElement('div');
    canvas.id = 'node-editor-canvas';
    canvas.className = 'node-canvas';
    
    // Create sidebar for node types
    const sidebar = document.createElement('div');
    sidebar.id = 'node-sidebar';
    sidebar.className = 'node-sidebar';
    sidebar.innerHTML = `
        <h3>Node Types</h3>
        <div class="node-category">
            <h4>Inputs</h4>
            <div class="node-item" data-node-type="image">Image</div>
            <div class="node-item" data-node-type="color">Color</div>
            <div class="node-item" data-node-type="vector">Vector</div>
        </div>
        <div class="node-category">
            <h4>Filters</h4>
            <div class="node-item" data-node-type="blur">Blur</div>
            <div class="node-item" data-node-type="sharpen">Sharpen</div>
            <div class="node-item" data-node-type="colorAdjust">Color Adjust</div>
        </div>
        <div class="node-category">
            <h4>Compositing</h4>
            <div class="node-item" data-node-type="blend">Blend</div>
            <div class="node-item" data-node-type="mask">Mask</div>
            <div class="node-item" data-node-type="overlay">Overlay</div>
        </div>
        <div class="node-category">
            <h4>3D Effects</h4>
            <div class="node-item" data-node-type="particleSystem">Particle System</div>
            <div class="node-item" data-node-type="volumetric">Volumetric</div>
            <div class="node-item" data-node-type="glow">Glow</div>
        </div>
        <div class="node-category">
            <h4>Output</h4>
            <div class="node-item" data-node-type="viewer">Viewer</div>
            <div class="node-item" data-node-type="output">Final Output</div>
        </div>
    `;
    
    // Add property panel for editing node parameters
    const propertyPanel = document.createElement('div');
    propertyPanel.id = 'node-properties';
    propertyPanel.className = 'node-properties';
    propertyPanel.innerHTML = '<h3>Properties</h3><div id="property-container"></div>';
    
    // Assemble the components
    container.appendChild(header);
    container.appendChild(sidebar);
    container.appendChild(canvas);
    container.appendChild(propertyPanel);
    
    // Add to document
    document.body.appendChild(container);
    
    // Add event listeners for control buttons
   
    document.getElementById('node-editor-expand').addEventListener('click', toggleNodeEditorSize);
    
    document.getElementById('node-upload-media').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*'; // Accept images only, modify as needed
        input.multiple = true;
        
        input.onchange = (e) => {
            this.handleMediaUpload(e.target.files);
        };
        input.click();
    });

    // Make the editor panel draggable
    makeElementDraggable(container, header);
    
    // Make the editor panel resizable
    makeElementResizable(container);
    
    console.log("Node Editor container created");
}

function toggleNodeEditor() {
    const container = document.getElementById('node-editor-container');
    if (container.style.display === 'none') {
        container.style.display = 'grid';
        // Pause orbit controls when editing nodes
        if (controls) {
            controls.enabled = false;
        }
    } else {
        container.style.display = 'none';
        // Resume orbit controls
        if (controls) {
            controls.enabled = true;
        }
    }
}

function closeNodeEditor() {
    const container = document.getElementById('node-editor-container');
    container.style.display = 'none';
    // Resume orbit controls
    if (controls) {
        controls.enabled = true;
    }
}

function toggleNodeEditorSize() {
    const container = document.getElementById('node-editor-container');
    if (container.classList.contains('expanded')) {
        container.classList.remove('expanded');
        document.getElementById('node-editor-expand').innerHTML = '<i class="fas fa-expand-alt"></i>';
    } else {
        container.classList.add('expanded');
        document.getElementById('node-editor-expand').innerHTML = '<i class="fas fa-compress-alt"></i>';
    }
}

// Class to manage the node editor functionality
class NodeVFXEditor {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.dragNode = null;
        this.dragConnection = null;
        this.dragOffset = { x: 0, y: 0 };
        this.canvas = document.getElementById('node-editor-canvas');
        this.propertyPanel = document.getElementById('property-container');
        
        this.setupEventListeners();
        
        // Create a render target for previewing node outputs
        this.renderTarget = new THREE.WebGLRenderTarget(256, 256, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });
        
        console.log("NodeVFXEditor class initialized");
    }
    
    setupEventListeners() {
        const canvas = this.canvas;
        
        // Add node from sidebar to canvas
        const nodeItems = document.querySelectorAll('.node-item');
        nodeItems.forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const nodeType = item.getAttribute('data-node-type');
                this.createNode(nodeType, canvas.clientWidth / 2, canvas.clientHeight / 2);
            });
        });
        
        // Canvas events for node interaction
        canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleCanvasMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.handleCanvasMouseUp.bind(this));
        
        // Right-click context menu
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e.clientX, e.clientY);
        });
    }

    handleMediaUpload(files) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                // Create an image node at center of canvas
                const node = this.createNode('image', 
                    this.canvas.clientWidth / 2, 
                    this.canvas.clientHeight / 2
                );
                
                // Update node parameters with file data
                node.nodeData.parameters.source = 'file';
                node.nodeData.parameters.path = file.name;
                node.nodeData.imageData = e.target.result; // Base64 data
                
                // Process the node to load the image
                this.processNode(node);
            };
            
            reader.readAsDataURL(file);
        });
    }
    
    createNode(type, x, y) {
        const node = document.createElement('div');
        node.className = 'node';
        node.setAttribute('data-node-type', type);
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        
        // Get node template based on type
        const template = this.getNodeTemplate(type);
        
        node.innerHTML = `
            <div class="node-header">${template.name}</div>
            <div class="node-body">
                <div class="node-inputs">
                    ${this.createNodeConnectors(template.inputs, 'input')}
                </div>
                <div class="node-outputs">
                    ${this.createNodeConnectors(template.outputs, 'output')}
                </div>
            </div>
        `;
        
        // Store node data
        node.nodeData = {
            id: 'node_' + Date.now(),
            type: type,
            template: template,
            parameters: JSON.parse(JSON.stringify(template.defaultParameters || {}))
        };
        
        this.canvas.appendChild(node);
        this.nodes.push(node);
        
        // Make node draggable
        this.makeNodeDraggable(node);
        
        // Select the new node
        this.selectNode(node);
        
        return node;
    }
    
    createNodeConnectors(connectors, direction) {
        if (!connectors || connectors.length === 0) return '';
    
        let html = '';
        connectors.forEach((conn, index) => {
            // Calculate vertical offset based on index (e.g., 20px per connector)
            const verticalOffset = index * 25; // Adjust this value as needed
            html += `
                <div class="connector-group" style="position: relative; height: 25px;">
                    <div class="connector-label">${conn.name}</div>
                    <div class="connector ${direction}" 
                         data-type="${conn.type}" 
                         data-name="${conn.name}" 
                         style="top: ${verticalOffset}px;"></div>
                </div>
            `;
        });
    
        return html;
    }
    
    getNodeTemplate(type) {
        // Node templates with inputs, outputs, and parameters
        const templates = {
            'image': {
                name: 'Image Input',
                inputs: [],
                outputs: [{ name: 'Image', type: 'image' }],
                defaultParameters: { 
                    source: 'file', 
                    path: '' 
                }
            },
            'color': {
                name: 'Color',
                inputs: [],
                outputs: [{ name: 'Color', type: 'color' }],
                defaultParameters: { 
                    r: 1.0, 
                    g: 1.0, 
                    b: 1.0, 
                    a: 1.0 
                }
            },
            'blur': {
                name: 'Blur',
                inputs: [{ name: 'Image', type: 'image' }],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: { 
                    radius: 5, 
                    iterations: 1 
                }
            },
            'blend': {
                name: 'Blend',
                inputs: [
                    { name: 'Image A', type: 'image' },
                    { name: 'Image B', type: 'image' }
                ],
                outputs: [{ name: 'Result', type: 'image' }],
                defaultParameters: { 
                    mode: 'normal', 
                    opacity: 1.0 
                }
            },
            'particleSystem': {
                name: 'Particle System',
                inputs: [
                    { name: 'Position', type: 'vector' },
                    { name: 'Color', type: 'color' }
                ],
                outputs: [{ name: 'Particles', type: '3dobject' }],
                defaultParameters: {
                    count: 1000,
                    size: 0.1,
                    speed: 1,
                    lifetime: 2
                }
            },
            'output': {
                name: 'Output',
                inputs: [{ name: 'Final', type: 'image' }],
                outputs: [],
                defaultParameters: {}
            }
        };
        
        // Return requested template or a default one
        return templates[type] || {
            name: type.charAt(0).toUpperCase() + type.slice(1),
            inputs: [{ name: 'Input', type: 'any' }],
            outputs: [{ name: 'Output', type: 'any' }],
            defaultParameters: {}
        };
    }
    
    makeNodeDraggable(node) {
        const header = node.querySelector('.node-header');
        
        header.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            this.selectNode(node);
            
            this.dragNode = node;
            const rect = node.getBoundingClientRect();
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            node.classList.add('dragging');
        });
    }
    
    handleCanvasMouseDown(e) {
        // Handle mouse down on connectors for connections
        if (e.target.classList.contains('connector')) {
            const connector = e.target;
            
            if (connector.classList.contains('output')) {
                // Start connection from output
                this.startConnection(connector);
            } else if (connector.classList.contains('input')) {
                // Find existing connection to this input and remove it
                this.removeConnectionsToInput(connector);
            }
        } else if (!e.target.closest('.node')) {
            // Click on empty canvas area - deselect current node
            this.selectNode(null);
        }
    }
    
    handleCanvasMouseMove(e) {
        // Update node position when dragging
        if (this.dragNode) {
            const canvasRect = this.canvas.getBoundingClientRect();
            const x = e.clientX - canvasRect.left - this.dragOffset.x;
            const y = e.clientY - canvasRect.top - this.dragOffset.y;
            
            this.dragNode.style.left = `${Math.max(0, x)}px`;
            this.dragNode.style.top = `${Math.max(0, y)}px`;
            
            // Update connections for this node
            this.updateNodeConnections(this.dragNode);
        }
        
        // Update connection preview line when creating a connection
        if (this.dragConnection) {
            const canvasRect = this.canvas.getBoundingClientRect();
            const startConnector = this.dragConnection.startConnector;
            const startRect = startConnector.getBoundingClientRect();
            
            const startX = startRect.left + startRect.width / 2 - canvasRect.left;
            const startY = startRect.top + startRect.height / 2 - canvasRect.top;
            const endX = e.clientX - canvasRect.left;
            const endY = e.clientY - canvasRect.top;
            
            this.updateConnectionLine(this.dragConnection.element, startX, startY, endX, endY);
        }
    }
    
    handleCanvasMouseUp(e) {
        // End node dragging
        if (this.dragNode) {
            this.dragNode.classList.remove('dragging');
            this.dragNode = null;
        }
        
        // End connection creation
        if (this.dragConnection) {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            
            if (target && target.classList.contains('connector') && target.classList.contains('input')) {
                // Check if connection is valid
                if (this.isConnectionValid(this.dragConnection.startConnector, target)) {
                    // Create permanent connection
                    this.createConnection(this.dragConnection.startConnector, target);
                }
            }
            
            // Remove temporary connection line
            this.canvas.removeChild(this.dragConnection.element);
            this.dragConnection = null;
        }
    }
    
    startConnection(connector) {
        // Create temporary connection line
        const line = document.createElement('div');
        line.className = 'connection-line temp';
        this.canvas.appendChild(line);
        
        // Store connection data
        this.dragConnection = {
            element: line,
            startConnector: connector
        };
        
        // Initiate line at connector position
        const canvasRect = this.canvas.getBoundingClientRect();
        const connectorRect = connector.getBoundingClientRect();
        const startX = connectorRect.left + connectorRect.width / 2 - canvasRect.left;
        const startY = connectorRect.top + connectorRect.height / 2 - canvasRect.top;
        
        this.updateConnectionLine(line, startX, startY, startX, startY);
    }
    
    createConnection(outputConnector, inputConnector) {
        // Get node elements and connection data
        const outputNode = outputConnector.closest('.node');
        const inputNode = inputConnector.closest('.node');
        
        // Create connection line
        const line = document.createElement('div');
        line.className = 'connection-line';
        this.canvas.appendChild(line);
        
        // Store connection data
        const connection = {
            element: line,
            outputNode: outputNode,
            inputNode: inputNode,
            outputConnector: outputConnector,
            inputConnector: inputConnector,
            outputType: outputConnector.getAttribute('data-type'),
            inputType: inputConnector.getAttribute('data-type'),
            outputName: outputConnector.getAttribute('data-name'),
            inputName: inputConnector.getAttribute('data-name')
        };
        
        this.connections.push(connection);
        
        // Update the connection line position
        this.updateConnectionPosition(connection);
        
        // Link nodes in the processing graph
        this.linkNodes(outputNode, inputNode, outputConnector, inputConnector);

        console.log('Created connection:', {
            from: outputNode.nodeData.type,
            to: inputNode.nodeData.type,
            output: connection.outputName,
            input: connection.inputName
        });
    }
    
    updateConnectionPosition(connection) {
        const canvasRect = this.canvas.getBoundingClientRect();
        
        const outputRect = connection.outputConnector.getBoundingClientRect();
        const inputRect = connection.inputConnector.getBoundingClientRect();
        
        const startX = outputRect.left + outputRect.width / 2 - canvasRect.left;
        const startY = outputRect.top + outputRect.height / 2 - canvasRect.top;
        const endX = inputRect.left + inputRect.width / 2 - canvasRect.left;
        const endY = inputRect.top + inputRect.height / 2 - canvasRect.top;
        
        this.updateConnectionLine(connection.element, startX, startY, endX, endY);
    }
    
    updateConnectionLine(line, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const curveStrength = Math.min(distance * 0.3, 80);
        
        // Calculate bounding box
        const minX = Math.min(x1, x2) - curveStrength;
        const minY = Math.min(y1, y2) - curveStrength;
        const width = Math.abs(dx) + curveStrength * 2;
        const height = Math.abs(dy) + curveStrength * 2;
        
        // Adjust coordinates relative to bounding box
        const startX = x1 - minX;
        const startY = y1 - minY;
        const endX = x2 - minX;
        const endY = y2 - minY;
    
        line.innerHTML = `
            <svg width="${width}" height="${height}" style="overflow: visible;">
                <path d="M ${startX} ${startY} C ${startX + curveStrength} ${startY}, 
                        ${endX - curveStrength} ${endY}, ${endX} ${endY}"
                      fill="none" stroke="${this.getConnectionColor(line)}" stroke-width="2"/>
            </svg>
        `;
        
        line.style.left = `${minX}px`;
        line.style.top = `${minY}px`;
        line.style.width = `${width}px`;
        line.style.height = `${height}px`;
    }
    
    getConnectionColor(line) {
        return line.classList.contains('temp') ? '#ffaa00' : '#00aaff';
    }
    
    updateNodeConnections(node) {
        // Update all connections related to this node
        this.connections.forEach(conn => {
            if (conn.inputNode === node || conn.outputNode === node) {
                this.updateConnectionPosition(conn);
            }
        });
    }
    
    selectNode(node) {
        // Deselect current node
        if (this.selectedNode) {
            this.selectedNode.classList.remove('selected');
        }
        
        this.selectedNode = node;
        
        // Select new node
        if (node) {
            node.classList.add('selected');
            this.showNodeProperties(node);
        } else {
            this.clearNodeProperties();
        }
    }
    
    showNodeProperties(node) {
        const propertyContainer = this.propertyPanel;
        propertyContainer.innerHTML = '';
        
        // Get node data and template
        const nodeData = node.nodeData;
        if (!nodeData) return;
        
        const template = nodeData.template;
        const parameters = nodeData.parameters;
        
        // Create property title
        const title = document.createElement('h4');
        title.textContent = template.name + ' Properties';
        propertyContainer.appendChild(title);
        
        // Create inputs for each parameter
        for (const paramName in parameters) {
            const paramValue = parameters[paramName];
            const paramType = typeof paramValue;
            
            const paramContainer = document.createElement('div');
            paramContainer.className = 'property-item';
            
            const label = document.createElement('label');
            label.textContent = this.formatParameterName(paramName);
            paramContainer.appendChild(label);
            
            let input;
            
            // Create appropriate input based on parameter type
            if (paramType === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = paramValue;
            } else if (paramType === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                input.value = paramValue;
                input.step = paramName.includes('color') ? 0.01 : 0.1;
            } else if (paramName === 'mode' || paramName === 'type' || paramName === 'source') {
                // Create select for enum-like parameters
                input = document.createElement('select');
                
                // Add options based on parameter name
                const options = this.getOptionsForParameter(paramName);
                options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    input.appendChild(option);
                });
                
                input.value = paramValue;
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = paramValue;
            }
            
            // Set common attributes
            input.setAttribute('data-param', paramName);
            input.addEventListener('change', (e) => {
                this.updateNodeParameter(node, paramName, this.getInputValue(input));
            });
            
            paramContainer.appendChild(input);
            propertyContainer.appendChild(paramContainer);
        }
        
        // Add a button to process the node
        const processButton = document.createElement('button');
        processButton.textContent = 'Process Node';
        processButton.className = 'process-button';
        processButton.addEventListener('click', () => {
            this.processNode(node);
        });
        
        propertyContainer.appendChild(processButton);
    }
    
    formatParameterName(name) {
        // Convert camelCase to Title Case With Spaces
        return name
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase());
    }
    
    getOptionsForParameter(paramName) {
        // Return appropriate options based on parameter name
        const options = {
            'mode': ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'],
            'type': ['point', 'directional', 'spot', 'ambient'],
            'source': ['file', 'camera', 'render', 'color', 'noise']
        };
        
        return options[paramName] || ['default'];
    }
    
    getInputValue(input) {
        // Get appropriate value based on input type
        if (input.type === 'checkbox') {
            return input.checked;
        } else if (input.type === 'number') {
            return parseFloat(input.value);
        } else if (input.tagName === 'SELECT') {
            return input.value;
        } else {
            return input.value;
        }
    }
    
    updateNodeParameter(node, paramName, value) {
        // Update node data
        if (node.nodeData && node.nodeData.parameters) {
            node.nodeData.parameters[paramName] = value;
            
            // Process the node with the new parameter
            this.processNode(node);
        }
    }
    
    processNode(node) {
        // Get node data
        const nodeData = node.nodeData;
        if (!nodeData) return;
        
        console.log(`Processing node: ${nodeData.type}`, nodeData.parameters);
        
        // Execute node-specific processing
        switch (nodeData.type) {
            case 'image':
                // Handle image loading
                this.processImageNode(node);
                break;
            case 'blur':
                // Apply blur effect
                this.processBlurNode(node);
                break;
            case 'blend':
                // Apply blend operation
                this.processBlendNode(node);
                break;
            case 'particleSystem':
                // Create or update particle system
                this.processParticleSystemNode(node);
                break; 
        }
        
        // Process downstream nodes (nodes connected to outputs)
        this.processDownstreamNodes(node);
    }
    
    processImageNode(node) {
        console.log('Processing Image node');
        
        if (node.nodeData.imageData) {
            const img = new Image();
            img.onload = () => {
                // Create texture or store image data for processing
                node.nodeData.outputTexture = img;
                node.nodeData.previewNeedsUpdate = true;
                
                // Create preview element if not exists
                if (!node.querySelector('.node-preview')) {
                    const preview = document.createElement('div');
                    preview.className = 'node-preview';
                    node.querySelector('.node-body').appendChild(preview);
                }
                
                this.processDownstreamNodes(node);
            };
            img.src = node.nodeData.imageData;
        }
    }
    
    processBlurNode(node) {
        // Implementation would apply blur to the input image
        console.log('Processing Blur node with radius:', node.nodeData.parameters.radius);
    }
    
    processBlendNode(node) {
        // Implementation would blend two input images
        console.log('Processing Blend node with mode:', node.nodeData.parameters.mode);
    }
    
    processParticleSystemNode(node) {
        // Implementation would create/update a particle system in the 3D scene
        console.log('Processing Particle System node with count:', node.nodeData.parameters.count);
    }
    
    processDownstreamNodes(node) {
        // Find all connections from this node's outputs
        const connections = this.connections.filter(conn => conn.outputNode === node);
        
        // Process each connected node
        connections.forEach(conn => {
            this.processNode(conn.inputNode);
        });
    }
    
    isConnectionValid(outputConnector, inputConnector) {
        // Check if connection is valid (compatible types, no cycles, etc.)
        if (!outputConnector || !inputConnector) return false;
        
        // Don't connect to self
        if (outputConnector.closest('.node') === inputConnector.closest('.node')) {
            return false;
        }
        
        const outputType = outputConnector.getAttribute('data-type');
        const inputType = inputConnector.getAttribute('data-type');
        
        // Check for type compatibility
        return inputType === outputType || inputType === 'any' || outputType === 'any';
    }
    
    removeConnectionsToInput(inputConnector) {
        // Find and remove existing connections to this input
        const connectionsToRemove = this.connections.filter(conn => conn.inputConnector === inputConnector);
        
        connectionsToRemove.forEach(conn => {
            this.canvas.removeChild(conn.element);
            const index = this.connections.indexOf(conn);
            if (index > -1) {
                this.connections.splice(index, 1);
            }
        });
    }
    
    linkNodes(outputNode, inputNode, outputConnector, inputConnector) {
        // Link nodes in the processing graph for data flow
        console.log(`Linking ${outputNode.nodeData.type} to ${inputNode.nodeData.type}`);
        
        // Process the receiving node with the new input
        this.processNode(inputNode);
    }
    
    clearNodeProperties() {
        // Clear the property panel
        if (this.propertyPanel) {
            this.propertyPanel.innerHTML = '<p>Select a node to edit properties</p>';
        }
    }

    showContextMenu(x, y, node) { 
        // Create a context menu for node creation and manipulation
        const menu = document.createElement('div');
        menu.className = 'node-context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        
        // Add menu items
        menu.innerHTML = `
            <div class="menu-item" data-node-type="image">Add Image Node</div>
            <div class="menu-item" data-node-type="color">Add Color Node</div>
            <div class="menu-item" data-node-type="blur">Add Blur Node</div>
            <div class="menu-item" data-node-type="blend">Add Blend Node</div>
            <div class="menu-item" data-node-type="particleSystem">Add Particle System</div>
            <div class="menu-item" data-node-type="output">Add Output Node</div>
            ${node ? '<div class="menu-item" data-action="delete">Delete Node</div>' : ''}
            ${node ? '<div class="menu-item" data-action="duplicate">Duplicate Node</div>' : ''}
        `;
        
        document.body.appendChild(menu);
        
        // Add event listeners
        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const nodeType = item.getAttribute('data-node-type');
                const action = item.getAttribute('data-action');
                
                if (nodeType) {
                    const canvasRect = this.canvas.getBoundingClientRect();
                    const nodeX = x - canvasRect.left;
                    const nodeY = y - canvasRect.top;
                    this.createNode(nodeType, nodeX, nodeY);
                } else if (action === 'delete' && node) {
                    this.deleteNode(node);
                } else if (action === 'duplicate' && node) {
                    this.duplicateNode(node);
                }
                
                document.body.removeChild(menu);
            });
        });
        
        // Close menu on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        
        document.addEventListener('mousedown', closeMenu);
    }
    
    // Function to delete a node
    deleteNode(node) {
        if (!node || !this.nodes.includes(node)) return;
        
        this.nodes = this.nodes.filter(n => n !== node);
        node.element.remove(); // Remove from DOM
        console.log('Node deleted:', node);
    }
    
    // Function to duplicate a node
    duplicateNode(node) {
        if (!node) return;
        
        const newNode = { ...node, id: `node-${Date.now()}` };
        newNode.x += 20;
        newNode.y += 20;
        
        this.nodes.push(newNode);
        this.renderNode(newNode); // Function to add it to the UI
        console.log('Node duplicated:', newNode);
    }
    

    
    update(deltaTime) {
        // Update any animated effects in the node editor
        // This is called from the main animation loop
        
        // Execute shader effects for each node that needs it
        this.nodes.forEach(node => {
            if (node.nodeData && node.nodeData.type === 'particleSystem') {
                // Update particle system animation
                const particleSystem = node.userData?.particleSystem;
                if (particleSystem) {
                    particleSystem.update(deltaTime);
                }
            } else if (node.nodeData && node.nodeData.type === 'volumetric') {
                // Update volumetric effects
                const volumetric = node.userData?.volumetric;
                if (volumetric) {
                    volumetric.update(deltaTime);
                }
            }
            
            // Update preview textures for image-based nodes
            if (node.nodeData && node.nodeData.previewNeedsUpdate) {
                this.updateNodePreview(node);
                node.nodeData.previewNeedsUpdate = false;
            }
        });
        
        // Update connection appearances based on data flow
        this.connections.forEach(conn => {
            // Visualize active data flow with animation
            if (conn.active) {
                conn.element.classList.add('active');
                // Animate flow along the connection
                this.animateConnectionFlow(conn, deltaTime);
            } else {
                conn.element.classList.remove('active');
            }
        });
    }
    
    animateConnectionFlow(connection, deltaTime) {
        // Animate data flowing through the connection
        const path = connection.element.querySelector('path');
        if (path) {
            // Get or initialize flow animation data
            if (!connection.flowAnimation) {
                connection.flowAnimation = {
                    offset: 0,
                    speed: 0.5  // Animation speed
                };
            }
            
            // Update flow animation
            connection.flowAnimation.offset += deltaTime * connection.flowAnimation.speed;
            if (connection.flowAnimation.offset > 1) {
                connection.flowAnimation.offset = 0;
            }
            
            // Apply animation using SVG dash array/offset
            path.setAttribute('stroke-dasharray', '5, 5');
            path.setAttribute('stroke-dashoffset', connection.flowAnimation.offset * 10);
        }
    }
    
    updateNodePreview(node) {
        // Update the preview thumbnail for a node
        const preview = node.querySelector('.node-preview');
        if (!preview) return;
        
        // For nodes that generate images/textures
        if (node.nodeData && node.nodeData.outputTexture) {
            // Create a small canvas to display the texture
            let canvas = preview.querySelector('canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width = 100;
                canvas.height = 100;
                preview.appendChild(canvas);
            }
            
            const ctx = canvas.getContext('2d');
            
            // Different handling based on node type
            if (node.nodeData.type === 'image' || node.nodeData.type === 'blur' || 
                node.nodeData.type === 'colorAdjust' || node.nodeData.type === 'blend') {
                // Render texture to canvas
                this.renderTextureToCanvas(node.nodeData.outputTexture, canvas);
            } else if (node.nodeData.type === 'particleSystem' || node.nodeData.type === 'volumetric') {
                // Render 3D preview
                this.render3DPreview(node, canvas);
            }
        }
    }
    
    renderTextureToCanvas(texture, canvas) {
        // Implement texture rendering to canvas preview
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // For WebGL textures, we need to render to a temporary canvas
        if (texture.isTexture) {
            // Create a temporary scene with the texture
            const tempScene = new THREE.Scene();
            const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            
            const material = new THREE.MeshBasicMaterial({ map: texture });
            const plane = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 2),
                material
            );
            tempScene.add(plane);
            
            // Render to the render target
            this.renderer.setRenderTarget(this.renderTarget);
            this.renderer.render(tempScene, tempCamera);
            this.renderer.setRenderTarget(null);
            
            // Read pixels and draw to canvas
            const width = this.renderTarget.width;
            const height = this.renderTarget.height;
            const pixels = new Uint8Array(width * height * 4);
            
            this.renderer.readRenderTargetPixels(
                this.renderTarget, 0, 0, width, height, pixels
            );
            
            // Create ImageData and put on canvas
            const imageData = new ImageData(
                new Uint8ClampedArray(pixels), width, height
            );
            
            // Create a temporary canvas to flip the image (WebGL coordinate system)
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);
            
            // Draw to final canvas with Y-flip
            ctx.save();
            ctx.scale(1, -1);
            ctx.drawImage(
                tempCanvas, 
                0, 0, width, height,
                0, -canvas.height, canvas.width, canvas.height
            );
            ctx.restore();
        } else if (texture instanceof ImageData) {
            // Direct ImageData
            ctx.putImageData(texture, 0, 0);
        } else if (texture instanceof HTMLImageElement) {
            // HTML Image
            ctx.drawImage(texture, 0, 0, canvas.width, canvas.height);
        }
    }
    
    render3DPreview(node, canvas) {
        // Render a 3D preview of a node that outputs a 3D object
        const object3D = node.userData && node.userData.outputObject;
        
        if (object3D && object3D.isObject3D) {
            // Create a temporary scene for preview
            const tempScene = new THREE.Scene();
            tempScene.background = new THREE.Color(0x222222);
            
            // Add lighting
            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(1, 1, 1);
            tempScene.add(light);
            tempScene.add(new THREE.AmbientLight(0x404040));
            
            // Add the object
            tempScene.add(object3D.clone());
            
            // Camera for preview
            const aspect = canvas.width / canvas.height;
            const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
            camera.position.set(2, 2, 2);
            camera.lookAt(0, 0, 0);
            
            // Render to the canvas
            const renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true,
                alpha: true
            });
            renderer.setSize(canvas.width, canvas.height, false);
            renderer.render(tempScene, camera);
        }
    }
    
    exportNodeGraph() {
        // Export the node graph as JSON
        const exportData = {
            nodes: this.nodes.map(node => {
                return {
                    id: node.nodeData.id,
                    type: node.nodeData.type,
                    parameters: node.nodeData.parameters,
                    position: {
                        x: parseFloat(node.style.left),
                        y: parseFloat(node.style.top)
                    }
                };
            }),
            connections: this.connections.map(conn => {
                return {
                    outputNodeId: conn.outputNode.nodeData.id,
                    inputNodeId: conn.inputNode.nodeData.id,
                    outputName: conn.outputName,
                    inputName: conn.inputName
                };
            })
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    importNodeGraph(jsonData) {
        try {
            // Clear existing graph
            this.clearNodeGraph();
            
            // Parse JSON data
            const importData = JSON.parse(jsonData);
            
            // Create nodes
            const nodeMap = new Map(); // Map old IDs to new node elements
            
            importData.nodes.forEach(nodeData => {
                const node = this.createNode(
                    nodeData.type, 
                    nodeData.position.x, 
                    nodeData.position.y
                );
                
                // Restore parameters
                Object.assign(node.nodeData.parameters, nodeData.parameters);
                
                // Map old ID to new node
                nodeMap.set(nodeData.id, node);
            });
            
            // Create connections
            importData.connections.forEach(connData => {
                const outputNode = nodeMap.get(connData.outputNodeId);
                const inputNode = nodeMap.get(connData.inputNodeId);
                
                if (outputNode && inputNode) {
                    const outputConnector = this.findConnector(
                        outputNode, 'output', connData.outputName
                    );
                    const inputConnector = this.findConnector(
                        inputNode, 'input', connData.inputName
                    );
                    
                    if (outputConnector && inputConnector) {
                        this.createConnection(outputConnector, inputConnector);
                    }
                }
            });
            
            // Process all nodes to update the graph
            this.nodes.forEach(node => this.processNode(node));
            
            return true;
        } catch (error) {
            console.error('Error importing node graph:', error);
            return false;
        }
    }
    
    findConnector(node, direction, name) {
        // Find a connector by name and direction
        return node.querySelector(
            `.connector.${direction}[data-name="${name}"]`
        );
    }
    
    clearNodeGraph() {
        // Remove all nodes and connections
        this.connections.forEach(conn => {
            this.canvas.removeChild(conn.element);
        });
        
        this.nodes.forEach(node => {
            this.canvas.removeChild(node);
        });
        
        this.connections = [];
        this.nodes = [];
        this.selectedNode = null;
    }
    
    executeGraph() {
        // Execute the entire node graph from inputs to outputs
        console.log('Executing node graph...');
        
        // Find output nodes
        const outputNodes = this.nodes.filter(
            node => node.nodeData && node.nodeData.type === 'output'
        );
        
        // Process each output node (which will recursively process inputs)
        outputNodes.forEach(node => this.processNode(node));
        
        console.log('Node graph execution complete');
    }
    
    // Add ability to save/load presets
    savePreset(name) {
        const preset = {
            name: name,
            graph: this.exportNodeGraph(),
            timestamp: Date.now()
        };
        
        // Save to localStorage or external storage
        const presets = JSON.parse(localStorage.getItem('nodePresets') || '[]');
        presets.push(preset);
        localStorage.setItem('nodePresets', JSON.stringify(presets));
        
        return preset;
    }
    
    loadPreset(name) {
        const presets = JSON.parse(localStorage.getItem('nodePresets') || '[]');
        const preset = presets.find(p => p.name === name);
        
        if (preset) {
            return this.importNodeGraph(preset.graph);
        }
        
        return false;
    }
}

// Utility function to make elements draggable
function makeElementDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e.preventDefault();
        // Get mouse position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        e.preventDefault();
        // Calculate new position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // Set element's new position
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Utility function to make elements resizable
function makeElementResizable(element) {
    const resizer = document.createElement('div');
    resizer.className = 'resizer';
    element.appendChild(resizer);
    
    resizer.addEventListener('mousedown', initResize);
    
    function initResize(e) {
        e.preventDefault();
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResize);
    }
    
    function resize(e) {
        e.preventDefault();
        
        // Calculate new size
        const newWidth = e.clientX - element.getBoundingClientRect().left;
        const newHeight = e.clientY - element.getBoundingClientRect().top;
        
        // Apply minimum size constraints
        element.style.width = `${Math.max(300, newWidth)}px`;
        element.style.height = `${Math.max(200, newHeight)}px`;
    }
    
    function stopResize() {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResize);
    }
}

// Function to initialize the node connection system
function initNodeConnectionSystem() {
    // Add connection line styles
    const style = document.createElement('style');
    style.textContent = `
        .connection-line {
            position: absolute;
            z-index: 10;
            pointer-events: none;
            overflow: visible;  // Ensure SVG paths aren't clipped
        }

       .connection-line path {
            stroke: #00aaff;
            stroke-width: 2px;
            fill: none;
            transition: stroke 0.2s;
        }

        .connection-line:hover path {
           stroke: #00ffaa;
        }
        
        .connection-line.temp path {
            stroke: #ffaa00;
            stroke-dasharray: 5, 5;
        }
        
        .connection-line.active path {
            stroke: #00ffaa;
        }
    `;
    document.head.appendChild(style);
}

// Setup node templates
function setupNodeTemplates() {
    console.log("Setting up node templates");
}

// Setup context menu for node creation
function setupNodeContextMenu() {
    console.log("Setting up node context menu");
}

// Add CSS styles for the node editor
function addNodeEditorStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #node-editor-container {
            position: absolute;
            top: 100px;
            left: 100px;
            width: 800px;
            height: 600px;
            background-color: #2a2a2a;
            border: 1px solid #444;
            border-radius: 4px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
            color: #eee;
            font-family: Arial, sans-serif;
            z-index: 1000;
            display: grid;
            grid-template-rows: auto 1fr;
            grid-template-columns: 200px 1fr 250px;
            grid-template-areas:
                "header header header"
                "sidebar canvas properties";
            overflow: hidden;
        }
        
        #node-editor-container.expanded {
            width: 90vw;
            height: 80vh;
            top: 10vh;
            left: 5vw;
        }
        
        .panel-header-vfx {
            grid-area: header;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #222;
            padding: 8px 12px;
            border-bottom: 1px solid #444;
            cursor: move;
        }
        
        .panel-title {
            font-weight: bold;
            font-size: 14px;
        }
        
        .panel-controls {
            display: flex;
            gap: 8px;
        }
        
        .node-sidebar {
            grid-area: sidebar;
            background-color: #333;
            border-right: 1px solid #444;
            padding: 10px;
            overflow-y: auto;
        }
        
        .node-canvas {
            grid-area: canvas;
            background-color: #1a1a1a;
            background-image: 
                linear-gradient(rgba(50, 50, 50, 0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(50, 50, 50, 0.5) 1px, transparent 1px);
            background-size: 20px 20px;
            overflow: auto;
            position: relative;
        }
        
        .node-properties {
            grid-area: properties;
            background-color: #333;
            border-left: 1px solid #444;
            padding: 10px;
            overflow-y: auto;
        }
        
        .node-category {
            margin-bottom: 15px;
        }
        
        .node-category h4 {
            margin: 0 0 5px 0;
            font-size: 13px;
            color: #aaa;
            border-bottom: 1px solid #555;
            padding-bottom: 3px;
        }

        .node-preview {
            margin-top: 8px;
            width: 100px;
            height: 100px;
            overflow: hidden;
            border: 1px solid #555;
            background-color: #222;
        }

        .node-preview canvas {
           width: 100%;
           height: 100%;
        }
        
        .node-item {
            padding: 5px 8px;
            margin: 2px 0;
            background-color: #444;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .node-item:hover {
            background-color: #555;
        }
            
        .node.dragging {
            opacity: 0.8;
        }
        
        .node-header {
            padding: 6px 8px;
            background-color: #444;
            border-radius: 4px 4px 0 0;
            font-weight: bold;
            font-size: 12px;
            cursor: move;
        }
        
        .node-body {
            padding: 8px;
            display: flex;
            flex-direction: row;
            justify-content: space-between;
        }
        
        .node-inputs, .node-outputs {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
       
        .connector-group {
            display: flex;
            align-items: center;
            height: 25px;
            position: relative;
        }
        
        .connector-label {
            font-size: 10px;
            padding: 0 5px;
        }
        
        .connector {
            position: absolute;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 1px solid #888;
            background-color: #555;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .connector:hover {
            background-color: #888;
        }
        
        .connector.input {
           left: -14px
        }
        
        .connector.output {
           right: -14px
        }
        
        .node-inputs .connector-group {
            justify-content: flex-start; 
        }
        
        .node-outputs .connector-group {
            justify-content: flex-end; 
        }
        
        .property-item {
            margin-bottom: 8px;
        }
        
        .property-item label {
            display: block;
            font-size: 12px;
            margin-bottom: 3px;
            color: #ccc;
        }
        
        .property-item input, .property-item select {
            width: 100%;
            background-color: #222;
            border: 1px solid #555;
            border-radius: 3px;
            padding: 4px;
            color: #eee;
            font-size: 12px;
        }
        
        .property-item input[type="checkbox"] {
            width: auto;
        }
        
        .process-button {
            background-color: #2a6da7;
            border: none;
            border-radius: 3px;
            color: white;
            padding: 6px 12px;
            margin-top: 10px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .process-button:hover {
            background-color: #3a8dc7;
        }
        
        .node-context-menu {
            position: fixed;
            background-color: #333;
            border: 1px solid #555;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
            padding: 5px 0;
            z-index: 1000;
        }
        
        .menu-item {
            padding: 5px 15px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.2s;
        }
        
        .menu-item:hover {
            background-color: #555;
        }
        
        .resizer {
            position: absolute;
            width: 10px;
            height: 10px;
            right: 0;
            bottom: 0;
            cursor: nwse-resize;
            background-color: #444;
            border-top-left-radius: 3px;
        }
        
        
    `;
    document.head.appendChild(style);
}


// Initialize the node editor when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Wait a short time to ensure THREE.js is initialized
    setTimeout(() => {
        initNodeVFXEditor();
    }, 1000);
});*/