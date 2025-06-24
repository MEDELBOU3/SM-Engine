
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
    button.innerHTML = '<i class="fas fa-project-diagram"></i> VFX Editor';
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
    document.getElementById('node-editor-close').addEventListener('click', closeNodeEditor);
    document.getElementById('node-editor-close').addEventListener('click', () => {
        document.querySelector('.node-editor-panel').classList.remove('visible');
    });
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
            justify-content: flex-start; /* Align inputs to the left */
        }
        
        .node-outputs .connector-group {
            justify-content: flex-end; /* Align outputs to the right */
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
});
