/**
 * A visual, node-based Event Graph Editor for the AdvancedPlayerController.
 * This class encapsulates all logic for creating, managing, and interacting
 * with a LiteGraph.js instance tied to a specific player controller.
 *
 * @version 5.0 (Enhanced with Integrated Object Preview System)
 */
class PlayerGraphEditor {
    constructor(playerInstance, buttonId) {
        if (typeof LiteGraph === 'undefined') {
            console.error("CRITICAL: LiteGraph.js is not loaded. The PlayerGraphEditor cannot start.");
            this.isValid = false;
            return;
        }

        this.player = playerInstance;
        this.graph = new LiteGraph.LGraph();
        this.graphCanvas = null;
        this.editorPanel = null;
        this.overlay = null;
        this.isVisible = false;
        this.isValid = true;

        // --- NEW: Preview System Members ---
        this.previewScene = null;
        this.previewCamera = null;
        this.previewRenderer = null;
        this.previewControls = null;
        this.previewLight = null;
        this.previewObject = null; // The currently previewed object (cloned)
        this.previewCanvas = null;

        const triggerButton = document.getElementById(buttonId);
        if (!triggerButton) {
            console.error(`Editor trigger button with ID "${buttonId}" not found.`);
            this.isValid = false;
            return;
        }
        triggerButton.addEventListener('click', () => this.toggleVisibility());

        this.graph.playerInstance = this.player;
        this.createEditorPanel();
        this.initPreviewSystem(); // ★ NEW: Initialize the preview
        this.registerPlayerNodes();
        this.setupEventListeners();
        
        // Override for context menu and search box (unchanged)
        const originalShowContextMenu = this.graphCanvas.showContextMenu.bind(this.graphCanvas);
        this.graphCanvas.showContextMenu = (e) => {
            originalShowContextMenu(e);
            const contextMenu = document.querySelector(".litegraph.litecontextmenu");
            if (contextMenu) {
                this.editorPanel.appendChild(contextMenu);
                const panelRect = this.editorPanel.getBoundingClientRect();
                contextMenu.style.left = (e.clientX - panelRect.left) + 'px';
                contextMenu.style.top = (e.clientY - panelRect.top) + 'px';
            }
        };

        const originalShowSearchBox = this.graphCanvas.showSearchBox.bind(this.graphCanvas);
        this.graphCanvas.showSearchBox = (e) => {
            originalShowSearchBox(e);
            const searchBox = document.querySelector(".litegraph.litesearchbox");
            if (searchBox) {
                this.editorPanel.appendChild(searchBox);
                const panelRect = this.editorPanel.getBoundingClientRect();
                searchBox.style.left = (e.clientX - panelRect.left) + 'px';
                searchBox.style.top = (e.clientY - panelRect.top) + 'px';
                const input = searchBox.querySelector("input");
                if (input) input.focus();
            }
        };

        // ★ NEW: Hook into node selection to auto-preview objects
        this.graphCanvas.onNodeSelected = this.onNodeSelected.bind(this);

        // ★ NEW: Hook into graph execution to update preview dynamically
        this.graph.onAfterExecute = this.updatePreviewFromGraph.bind(this);

        this.graph.start();
        console.log("✅ PlayerGraphEditor initialized with advanced preview system.");
    }

    createEditorPanel() {
        this.editorPanel = document.createElement('div');
        this.editorPanel.id = 'player-graph-panel';
        document.body.appendChild(this.editorPanel);

        // ★ NEW: Use flexbox to split into graph (left) and preview (right)
        this.editorPanel.style.display = 'none';
        this.editorPanel.style.flexDirection = 'row';

        // Graph container (left side)
        const graphContainer = document.createElement('div');
        graphContainer.style.flex = '3'; // 75% width
        graphContainer.style.position = 'relative';
        this.editorPanel.appendChild(graphContainer);

        const canvas = document.createElement('canvas');
        canvas.id = 'player-graph-canvas';
        graphContainer.appendChild(canvas);
        this.graphCanvas = new LiteGraph.LGraphCanvas(canvas, this.graph);

        // Preview container (right side)
        const previewContainer = document.createElement('div');
        previewContainer.id = 'preview-container';
        previewContainer.style.flex = '1'; // 25% width
        previewContainer.style.backgroundColor = '#333';
        previewContainer.style.borderLeft = '1px solid #444';
        previewContainer.style.position = 'relative';
        this.editorPanel.appendChild(previewContainer);

        // Preview canvas
        this.previewCanvas = document.createElement('canvas');
        this.previewCanvas.id = 'preview-canvas';
        this.previewCanvas.style.width = '100%';
        this.previewCanvas.style.height = '100%';
        previewContainer.appendChild(this.previewCanvas);

        this.overlay = document.createElement('div');
        this.overlay.id = 'player-graph-overlay';
        this.overlay.addEventListener('click', () => this.toggleVisibility());
        document.body.appendChild(this.overlay);
    }

    // ★ NEW: Initialize the Three.js preview system
    initPreviewSystem() {
        this.previewScene = new THREE.Scene();
        this.previewScene.background = new THREE.Color(0x444444); // Dark background for contrast

        this.previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        this.previewCamera.position.set(0, 2, 5);
        this.previewCamera.lookAt(0, 0, 0);

        this.previewRenderer = new THREE.WebGLRenderer({ canvas: this.previewCanvas, antialias: true });
        this.previewRenderer.setClearColor(0x444444);
        this.previewRenderer.shadowMap.enabled = true;

        // Add basic lighting for preview
        this.previewLight = new THREE.DirectionalLight(0xffffff, 1);
        this.previewLight.position.set(5, 10, 5);
        this.previewLight.castShadow = true;
        this.previewScene.add(this.previewLight);
        this.previewScene.add(new THREE.AmbientLight(0x404040, 0.5));

        // Add orbit controls for interactive preview
        this.previewControls = new THREE.OrbitControls(this.previewCamera, this.previewCanvas);
        this.previewControls.enableDamping = true;

        // Resize handler for preview
        window.addEventListener('resize', this.resizePreview.bind(this));
        this.resizePreview();
    }

    // ★ NEW: Resize the preview renderer
    resizePreview() {
        if (!this.previewCanvas) return;
        const rect = this.previewCanvas.parentElement.getBoundingClientRect();
        this.previewRenderer.setSize(rect.width, rect.height);
        this.previewCamera.aspect = rect.width / rect.height;
        this.previewCamera.updateProjectionMatrix();
    }

    // ★ NEW: Update method to render preview every frame when visible
    update(delta) {
        if (!this.isValid || !this.isVisible) return;
        this.graph.runStep(1, false);
        this.executeFromEventName('onTick');

        // Render preview
        this.previewControls.update();
        this.previewRenderer.render(this.previewScene, this.previewCamera);
    }

    // ★ NEW: Handle node selection to auto-preview objects
    onNodeSelected(node) {
        if (!node) return;

        // If the node outputs an object (e.g., GetSceneObject), preview it
        if (node.outputs && node.outputs.some(output => output.name === "Object" || output.type === "object")) {
            const objIndex = node.outputs.findIndex(o => o.name === "Object" || o.type === "object");
            const obj = node.getOutputData(objIndex);
            if (obj && obj.isObject3D) {
                this.setPreviewObject(obj);
            }
        }
    }

    // ★ NEW: Update preview after graph execution (to show node effects)
    updatePreviewFromGraph() {
        // Find all SetProperty nodes and apply their effects to preview if applicable
        const setNodes = this.graph.findNodesByTitle("Object/Set Property");
        setNodes.forEach(node => {
            const target = node.getInputData(1); // Object In
            if (target === this.previewObject?.userData?.original) { // Check if affecting previewed object
                const propName = node.getInputData(2) || node.properties.propertyName;
                const value = node.getInputData(3) || node.properties.value;
                if (propName && this.previewObject) {
                    this.previewObject[propName] = value;
                }
            }
        });

        // Re-render happens in update()
    }

    // ★ NEW: Set and display a cloned object in the preview
    setPreviewObject(originalObj) {
        // Clear previous
        if (this.previewObject) {
            this.previewScene.remove(this.previewObject);
        }

        // Clone to avoid modifying original
        this.previewObject = originalObj.clone(true);
        this.previewObject.userData.original = originalObj; // Reference for effects
        this.previewScene.add(this.previewObject);

        // Auto-frame the object
        const box = new THREE.Box3().setFromObject(this.previewObject);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        this.previewCamera.position.set(center.x, center.y, center.z + maxDim * 1.5);
        this.previewCamera.lookAt(center);
        this.previewControls.target.copy(center);
    }

    toggleVisibility() {
        if (!this.isValid) return;
        this.isVisible = !this.isVisible;
        const displayStyle = this.isVisible ? 'flex' : 'none'; // Changed to flex for layout
        this.editorPanel.style.display = displayStyle;
        this.overlay.style.display = displayStyle;
        if (this.isVisible) {
            this.graphCanvas.resize();
            this.resizePreview();
        }
    }

    registerPlayerNodes() {
        // Player Events
        const playerEvents = ['onJump', 'onLanded', 'onBeginPlay', 'onTick'];
        playerEvents.forEach(eventName => {
            function EventNode() { this.addOutput("►", LiteGraph.EVENT); this.title = `Event: ${eventName}`; this.color = "#a22"; }
            EventNode.title = `Events/${eventName}`;
            EventNode.prototype.onExecute = function() { this.triggerSlot(0); };
            LiteGraph.registerNodeType(`player/${EventNode.title}`, EventNode);
        });

        // Player Actions
        const playerActions = { 'jump': [], 'fadeToAction': ['animName', 'duration'] };
        for (const actionName in playerActions) {
            const args = playerActions[actionName];
            function ActionNode() { this.addInput("►", LiteGraph.EVENT); args.forEach(arg => this.addInput(arg, "string")); this.addOutput("►", LiteGraph.EVENT); this.title = `Action: ${actionName}`; this.color = "#2a2"; }
            ActionNode.title = `Actions/${actionName}`;
            ActionNode.prototype.onAction = function() {
                const player = this.graph.playerInstance;
                if (player && typeof player[actionName] === 'function') {
                    const argValues = args.map((_, i) => this.getInputData(i + 1));
                    player[actionName](...argValues);
                }
                this.triggerSlot(0);
            };
            LiteGraph.registerNodeType(`player/${ActionNode.title}`, ActionNode);
        }

        // Player Properties
        const playerProperties = ['isGrounded', 'state', 'velocity', 'moveSpeed'];
        playerProperties.forEach(propName => {
            function GetterNode() { this.addOutput(propName, "string"); this.title = `Get ${propName}`; this.color = "#22a"; }
            GetterNode.title = `Properties/Get ${propName}`;
            GetterNode.prototype.onExecute = function() {
                const player = this.graph.playerInstance;
                if (player) {
                    const value = player[propName];
                    if (value && value.isVector3) { this.setOutputData(0, `(${value.x.toFixed(1)}, ${value.y.toFixed(1)}, ${value.z.toFixed(1)})`); } 
                    else { this.setOutputData(0, value); }
                }
            };
            LiteGraph.registerNodeType(`player/${GetterNode.title}`, GetterNode);
        });
        
        // Utility Nodes
        function PrintStringNode() { this.addInput("►", LiteGraph.EVENT); this.addInput("In", 0); this.addOutput("►", LiteGraph.EVENT); this.title = "Print String"; }
        PrintStringNode.prototype.onAction = function() { console.log("GRAPH PRINT:", this.getInputData(1)); this.triggerSlot(0); };
        LiteGraph.registerNodeType("Utilities/PrintString", PrintStringNode);

        // Scene Interaction Nodes
        function GetSceneObjectNode() {
            this.addInput("Name/UUID", "string");
            this.addOutput("Object", "object");
            this.title = "Get Scene Object";
            this.color = "#4a2";
            this.properties = { objectName: "" };
            this.widget = this.addWidget("text", "Object Name", this.properties.objectName, (value) => { this.properties.objectName = value; });
        }
        GetSceneObjectNode.title = "Scene/Get Object By Name";
        GetSceneObjectNode.prototype.onExecute = function() {
            const objectName = this.getInputData(0) || this.properties.objectName;
            if (!objectName) { this.setOutputData(0, null); return; }
            const targetObject = scene.getObjectByName(objectName);
            this.setOutputData(0, targetObject);
        };
        LiteGraph.registerNodeType(`scene/${GetSceneObjectNode.title}`, GetSceneObjectNode);

        function GetPropertyNode() {
            this.addInput("Object In", "object");
            this.addInput("Property Name", "string");
            this.addOutput("Value", 0);
            this.title = "Get Property";
            this.color = "#a62";
            this.properties = { propertyName: "" };
            this.widget = this.addWidget("text", "Property", this.properties.propertyName, (v) => { this.properties.propertyName = v; });
        }
        GetPropertyNode.title = "Object/Get Property";
        GetPropertyNode.prototype.onExecute = function() {
            const targetObject = this.getInputData(0);
            const propName = this.getInputData(1) || this.properties.propertyName;
            if (targetObject && propName) {
                const value = targetObject[propName];
                this.setOutputData(0, value);
            } else {
                this.setOutputData(0, null);
            }
        };
        LiteGraph.registerNodeType(`scene/${GetPropertyNode.title}`, GetPropertyNode);

        // Enhanced SetPropertyNode
        function SetPropertyNode() {
            this.addInput("►", LiteGraph.EVENT);
            this.addInput("Object In", "object");
            this.addInput("Property Name", "string");
            this.addInput("Value", 0); // Allow dynamic value connection
            this.addOutput("►", LiteGraph.EVENT);

            this.title = "Set Property";
            this.color = "#2a6"; // Dark teal color from the image

            // Properties to hold widget values.
            // Defaults are set to facilitate creating the graph from the image.
            this.properties = { propertyName: "visible", value: false };

            // Add a widget for the property name (e.g., "visible")
            this.addWidget("text", "Property", this.properties.propertyName, (v) => {
                this.properties.propertyName = v;
            });

            // Add a widget for the value. Using a text input is flexible.
            this.addWidget("text", "Value", this.properties.value, (v) => {
                // Parse common string values into correct types
                if (v === "true") this.properties.value = true;
                else if (v === "false") this.properties.value = false;
                else if (!isNaN(parseFloat(v)) && isFinite(v)) this.properties.value = parseFloat(v);
                else this.properties.value = v; // Otherwise, treat as a string
            });
        }
        
        SetPropertyNode.title = "Object/Set Property";

        SetPropertyNode.prototype.onAction = function() {
            const targetObject = this.getInputData(1);

            // Prioritize connected inputs, but fall back to widget values if not connected.
            const propName = this.getInputData(2) !== undefined ? this.getInputData(2) : this.properties.propertyName;
            const value = this.getInputData(3) !== undefined ? this.getInputData(3) : this.properties.value;
            
            if (targetObject && propName) {
                const property = targetObject[propName];
                // Use original robust setters for special THREE types
                if (property && property.isVector3 && value && value.isVector3) {
                    property.copy(value);
                } else if (property && property.isColor && value && value.isColor) {
                    property.copy(value);
                } else {
                    // Simple assignment for other types (e.g., boolean for "visible")
                    targetObject[propName] = value;
                }
            }
            this.triggerSlot(0); // Proceed to the next node in the execution chain
        };
        LiteGraph.registerNodeType(`scene/${SetPropertyNode.title}`, SetPropertyNode);

        // ★ NEW: Add a dedicated Preview Node for explicit preview control
        function PreviewNode() {
            this.addInput("Object", "object");
            this.title = "Preview Object";
            this.color = "#6a2"; // Purple-ish for visibility
            this.size = [150, 60];
        }
        PreviewNode.title = "Utilities/Preview Object";
        PreviewNode.prototype.onExecute = function() {
            const obj = this.getInputData(0);
            if (obj && obj.isObject3D) {
                this.graph._editor.setPreviewObject(obj); // Reference the editor
            }
        };
        LiteGraph.registerNodeType(`utilities/${PreviewNode.title}`, PreviewNode);
    }

    setupEventListeners() {
        class EventDispatcher {
            constructor() { this._listeners = {}; }
            addEventListener(type, cb) { (this._listeners[type] = this._listeners[type] || []).push(cb); }
            dispatch(type, payload) { if (this._listeners[type]) this._listeners[type].forEach(c => c(payload)); }
        }

        if (!this.player.events) {
            this.player.events = new EventDispatcher();
            if (typeof this.player.jump === 'function') {
                const originalJump = this.player.jump.bind(this.player);
                this.player.jump = () => {
                    const wasGrounded = this.player.isGrounded;
                    originalJump();
                    if (wasGrounded) this.player.events.dispatch('onJump');
                };
            }
            if (typeof this.player.activate === 'function') {
                const originalActivate = this.player.activate.bind(this.player);
                this.player.activate = () => {
                    originalActivate();
                    this.player.events.dispatch('onBeginPlay');
                };
            }
        }

        this.player.events.addEventListener('onJump', () => this.executeFromEventName('onJump'));
        this.player.events.addEventListener('onLanded', () => this.executeFromEventName('onLanded'));
        this.player.events.addEventListener('onBeginPlay', () => this.executeFromEventName('onBeginPlay'));
    }

    executeFromEventName(eventName) {
        if (!this.isValid || !this.graph) return;
        const eventNode = this.graph.findNodesByTitle(`Event: ${eventName}`)[0];
        if (eventNode) {
            eventNode.onExecute();
        }
    }
}

/**
 * 

class PlayerGraphEditor {

    constructor(playerInstance, buttonId) {
        // --- 1. VALIDATION ---
        // Ensure LiteGraph.js library is loaded before proceeding.
        if (typeof LiteGraph === 'undefined') {
            console.error("CRITICAL: LiteGraph.js is not loaded. The PlayerGraphEditor cannot start.");
            this.isValid = false;
            return;
        }

        // --- 2. INITIALIZE PROPERTIES ---
        this.player = playerInstance;
        this.graph = new LiteGraph.LGraph();
        this.graphCanvas = null;
        this.editorPanel = null;
        this.overlay = null;
        this.isVisible = false;
        this.isValid = true;

        // --- 3. BIND TO THE TRIGGER BUTTON ---
        const triggerButton = document.getElementById(buttonId);
        if (!triggerButton) {
            console.error(`Editor trigger button with ID "${buttonId}" not found. Editor will not be accessible.`);
            this.isValid = false;
            return;
        }
        triggerButton.addEventListener('click', () => this.toggleVisibility());

        // --- 4. SETUP THE EDITOR ---
        this.graph.playerInstance = this.player; // Make player instance accessible to all nodes
        this.createEditorPanel();
        this.registerPlayerNodes();
        this.setupEventListeners();
        
        // Start the graph's internal loop.
        this.graph.start();

        console.log("✅ PlayerGraphEditor initialized and ready.");
    }

    createEditorPanel() {
        // Create the main panel
        this.editorPanel = document.createElement('div');
        this.editorPanel.id = 'player-graph-panel';
        document.body.appendChild(this.editorPanel);

        // Create the canvas element for LiteGraph
        const canvas = document.createElement('canvas');
        canvas.id = 'player-graph-canvas';
        this.editorPanel.appendChild(canvas);
        
        // Initialize LiteGraph on the canvas
        this.graphCanvas = new LiteGraph.LGraphCanvas(canvas, this.graph);

        // ★★★ THE CORE FIX ★★★
        // Instruct LiteGraph to use our panel as the parent for its pop-up UI.
        // This solves the z-index/stacking context problem permanently.
        this.graphCanvas.search_box_parent_container = this.editorPanel;
        this.graphCanvas.prompt_box_parent_container = this.editorPanel;
        LiteGraph.ContextMenu.parentMenu = this.editorPanel;


        // Create the background overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'player-graph-overlay';
        this.overlay.addEventListener('click', () => this.toggleVisibility()); // Close on click
        document.body.appendChild(this.overlay);
    }


    toggleVisibility() {
        if (!this.isValid) return;

        this.isVisible = !this.isVisible;
        const displayStyle = this.isVisible ? 'block' : 'none';

        this.editorPanel.style.display = displayStyle;
        this.overlay.style.display = displayStyle;

        // When showing the editor, tell the canvas to resize to fit the panel.
        if (this.isVisible) {
            this.graphCanvas.resize();
        }
    }

    registerPlayerNodes() {
        // --- EVENT NODES ---
        const playerEvents = ['onJump', 'onLanded', 'onBeginPlay', 'onTick'];
        playerEvents.forEach(eventName => {
            function EventNode() { this.addOutput("►", LiteGraph.EVENT); this.title = `Event: ${eventName}`; this.color = "#a22"; }
            EventNode.title = `Events/${eventName}`;
            EventNode.prototype.onExecute = function() { this.triggerSlot(0); };
            LiteGraph.registerNodeType(`player/${EventNode.title}`, EventNode);
        });

        // --- ACTION NODES (Methods) ---
        const playerActions = { 'jump': [], 'fadeToAction': ['animName', 'duration'] };
        for (const actionName in playerActions) {
            const args = playerActions[actionName];
            function ActionNode() { this.addInput("►", LiteGraph.EVENT); args.forEach(arg => this.addInput(arg, "string")); this.addOutput("►", LiteGraph.EVENT); this.title = `Action: ${actionName}`; this.color = "#2a2"; }
            ActionNode.title = `Actions/${actionName}`;
            ActionNode.prototype.onAction = function() {
                const player = this.graph.playerInstance;
                if (player && typeof player[actionName] === 'function') {
                    const argValues = args.map((_, i) => this.getInputData(i + 1));
                    player[actionName](...argValues);
                }
                this.triggerSlot(0);
            };
            LiteGraph.registerNodeType(`player/${ActionNode.title}`, ActionNode);
        }

        // --- GETTER NODES (Properties) ---
        const playerProperties = ['isGrounded', 'state', 'velocity', 'moveSpeed'];
        playerProperties.forEach(propName => {
            function GetterNode() { this.addOutput(propName, "string"); this.title = `Get ${propName}`; this.color = "#22a"; }
            GetterNode.title = `Properties/Get ${propName}`;
            GetterNode.prototype.onExecute = function() {
                const player = this.graph.playerInstance;
                if (player) {
                    const value = player[propName];
                    if (value && value.isVector3) { this.setOutputData(0, `(${value.x.toFixed(1)}, ${value.y.toFixed(1)}, ${value.z.toFixed(1)})`); } 
                    else { this.setOutputData(0, value); }
                }
            };
            LiteGraph.registerNodeType(`player/${GetterNode.title}`, GetterNode);
        });
        
        // --- UTILITY NODES ---
        function PrintStringNode() { this.addInput("►", LiteGraph.EVENT); this.addInput("In", 0); this.addOutput("►", LiteGraph.EVENT); this.title = "Print String"; }
        PrintStringNode.prototype.onAction = function() { console.log("GRAPH PRINT:", this.getInputData(1)); this.triggerSlot(0); };
        LiteGraph.registerNodeType("Utilities/PrintString", PrintStringNode);
    }


    setupEventListeners() {
        // A minimal, safe event dispatcher class
        class EventDispatcher {
            constructor() { this._listeners = {}; }
            addEventListener(type, cb) { (this._listeners[type] = this._listeners[type] || []).push(cb); }
            dispatch(type, payload) { if (this._listeners[type]) this._listeners[type].forEach(c => c(payload)); }
        }

        // Attach an event dispatcher to the player instance, but only if one doesn't already exist.
        if (!this.player.events) {
            this.player.events = new EventDispatcher();

            // Safely wrap the 'jump' method to dispatch an event.
            if (typeof this.player.jump === 'function') {
                const originalJump = this.player.jump.bind(this.player);
                this.player.jump = () => {
                    const wasGrounded = this.player.isGrounded;
                    originalJump();
                    // Only dispatch if the jump was actually successful
                    if (wasGrounded) this.player.events.dispatch('onJump');
                };
            }
            // Safely wrap the 'activate' method for a 'begin play' event.
            if (typeof this.player.activate === 'function') {
                const originalActivate = this.player.activate.bind(this.player);
                this.player.activate = () => {
                    originalActivate();
                    this.player.events.dispatch('onBeginPlay');
                };
            }
        }

        // Now, it's safe to add listeners that trigger graph execution.
        this.player.events.addEventListener('onJump', () => this.executeFromEventName('onJump'));
        this.player.events.addEventListener('onLanded', () => this.executeFromEventName('onLanded'));
        this.player.events.addEventListener('onBeginPlay', () => this.executeFromEventName('onBeginPlay'));
    }


    executeFromEventName(eventName) {
        if (!this.isValid || !this.graph) return;
        // LiteGraph's findNodesByTitle is slow. A better approach for many events
        // would be to cache these nodes on startup.
        const eventNode = this.graph.findNodesByTitle(`Event: ${eventName}`)[0];
        if (eventNode) {
            eventNode.onExecute();
        }
    }
    
    
    update(delta) {
        if (!this.isValid) return;
        
        // This runs the graph's internal logic (e.g., for timers, lerps, etc.)
        // The second parameter `true` means it will only run if the canvas is not visible.
        // We set it to false to always run, even when visible.
        this.graph.runStep(1, false);
        
        // Manually trigger the 'onTick' event node on every frame.
        this.executeFromEventName('onTick');
    }
}
 */