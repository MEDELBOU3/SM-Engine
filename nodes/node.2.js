class NodeConnection {
    constructor(startSocket, endSocket, options = {}) {
        this.startSocket = startSocket;
        this.endSocket = endSocket;
        this.sourceNode = startSocket.closest('.node');
        this.targetNode = endSocket.closest('.node');
        this.options = Object.assign({
            color: '#777',
            strokeWidth: 2,
            dashed: false,
            showArrow: true,
            hoverColor: '#4caf50'
        }, options);

        this.element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.initConnection();
        this.addEventListeners();
    }

    initConnection() {
        const svg = document.querySelector('#node-canvas svg');
        if (!svg) {
            console.error('SVG layer not found in #node-canvas');
            return;
        }

        this.element.setAttribute('stroke', this.options.color);
        this.element.setAttribute('stroke-width', this.options.strokeWidth / this.getEditorScale());
        this.element.setAttribute('fill', 'none');
        this.element.setAttribute('class', 'node-connection');

        if (this.options.dashed) {
            this.element.setAttribute('stroke-dasharray', '5,5');
        }

        svg.appendChild(this.element);
        if (this.options.showArrow) {
            svg.appendChild(this.arrowhead);
        }
        this.update();
    }

    addEventListeners() {
        this.element.addEventListener('mouseenter', () => {
            this.element.setAttribute('stroke', this.options.hoverColor);
            this.element.setAttribute('filter', 'drop-shadow(0 0 2px rgba(76, 175, 80, 0.5))');
        });

        this.element.addEventListener('mouseleave', () => {
            this.element.setAttribute('stroke', this.options.color);
            this.element.removeAttribute('filter');
        });
    }

    update() {
        const start = this.getSocketPosition(this.startSocket);
        const end = this.getSocketPosition(this.endSocket);
        const offset = Math.abs(start.x - end.x) / 3;

        // Bezier curve path in transformed space
        const path = `M ${start.x},${start.y} 
                      C ${start.x + offset},${start.y} 
                        ${end.x - offset},${end.y} 
                        ${end.x},${end.y}`;
        this.element.setAttribute('d', path);
        this.element.setAttribute('stroke-width', this.options.strokeWidth / this.getEditorScale());

        if (this.options.showArrow) {
            this.drawArrowhead(end.x, end.y, start.x, start.y);
        }
    }

    drawArrowhead(x, y, startX, startY) {
        const angle = Math.atan2(y - startY, x - startX);
        const scale = this.getEditorScale();
        const arrowSize = 8 / scale; // Adjust arrow size based on zoom
        const arrowPath = `M ${x},${y} 
                           L ${x - arrowSize * Math.cos(angle - Math.PI / 6)},${y - arrowSize * Math.sin(angle - Math.PI / 6)} 
                           L ${x - arrowSize * Math.cos(angle + Math.PI / 6)},${y - arrowSize * Math.sin(angle + Math.PI / 6)} 
                           Z`;

        this.arrowhead.setAttribute('d', arrowPath);
        this.arrowhead.setAttribute('fill', this.options.color);
    }

    getSocketPosition(socket) {
        const editor = this.getEditor();
        if (!editor) return { x: 0, y: 0 };

        const canvas = editor.canvas;
        const canvasRect = canvas.getBoundingClientRect();
        const socketRect = socket.getBoundingClientRect();

        // Calculate position relative to the canvas, adjusted for scale and viewport
        const scaleInverse = 1 / editor.scale;
        const x = ((socketRect.left + socketRect.width / 2) - canvasRect.left - editor.viewportX) * scaleInverse;
        const y = ((socketRect.top + socketRect.height / 2) - canvasRect.top - editor.viewportY) * scaleInverse;

        return { x, y };
    }

    getEditorScale() {
        const editor = this.getEditor();
        return editor ? editor.scale : 1;
    }

    getEditor() {
        const canvas = document.getElementById('node-canvas');
        return canvas.__editor || window.nodeEditor; // Assuming editor is attached globally or to canvas
    }
}


class WaterEffect {
    constructor(object, properties = {}) {
    this.object = object;
    this.properties = {
        flowRate: properties.flowRate || 1.0,
        viscosity: properties.viscosity || 0.5, 
        surfaceTension: properties.surfaceTension || 0.8,
        rippleStrength: properties.rippleStrength || 0.5,
        waterHeight: properties.waterHeight || 0.5,
        waterOpacity: properties.waterOpacity || 0.8
    };
    
    // Store original material
    this.originalMaterial = object.material;
    
    // Create water geometry matching object bounds
    const geometry = object.geometry;
    const waterGeometry = geometry.clone();
    
    // Create custom water material with advanced shaders
    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            flowRate: { value: this.properties.flowRate },
            viscosity: { value: this.properties.viscosity },
            surfaceTension: { value: this.properties.surfaceTension },
            rippleStrength: { value: this.properties.rippleStrength },
            waterHeight: { value: this.properties.waterHeight },
            waterOpacity: { value: this.properties.waterOpacity },
            tNormal: { value: null },
            tCube: { value: null }
        },
        vertexShader: `
            uniform float time;
            uniform float flowRate;
            uniform float rippleStrength;
            uniform float waterHeight;
            
            varying vec3 vPosition;
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec3 vWorldPosition;
            
            void main() {
                vUv = uv;
                vPosition = position;
                vec3 transformedNormal = normalMatrix * normal;
                vNormal = normalize(transformedNormal);
                
                // Advanced wave simulation
                float waves = 0.0;
                
                // Primary waves
                waves += sin(position.x * 2.0 + time * flowRate) * 
                        cos(position.z * 2.0 + time * flowRate) * 0.5;
                        
                // Secondary waves
                waves += sin(position.x * 4.0 - time * flowRate * 1.5) * 
                        cos(position.z * 4.0 + time * flowRate * 0.8) * 0.25;
                        
                // Ripple effects
                waves += sin(length(position.xz) * 8.0 - time * flowRate * 2.0) * 0.125;
                
                // Apply wave displacement
                vec3 newPosition = position;
                newPosition.y += waves * rippleStrength * waterHeight;
                
                vec4 worldPosition = modelMatrix * vec4(newPosition, 1.0);
                vWorldPosition = worldPosition.xyz;
                
                vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
                vViewPosition = -mvPosition.xyz;
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform float viscosity;
            uniform float surfaceTension;
            uniform float waterOpacity;
            
            varying vec3 vPosition;
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec3 vWorldPosition;
            
            void main() {
                vec3 viewVector = normalize(vViewPosition);
                
                // Base water colors
                vec3 shallowColor = vec3(0.1, 0.3, 0.5);
                vec3 deepColor = vec3(0.0, 0.2, 0.4);
                
                // Enhanced Fresnel effect
                float fresnelFactor = pow(1.0 - max(0.0, dot(vNormal, viewVector)), 
                                       5.0 * surfaceTension);
                
                // Dynamic caustics
                float caustics = 0.0;
                caustics += sin(vWorldPosition.x * 10.0 + time) * 
                           cos(vWorldPosition.z * 10.0 + time) * 0.5;
                caustics += sin(vWorldPosition.x * 20.0 - time * 0.5) * 
                           cos(vWorldPosition.z * 20.0 + time * 0.5) * 0.25;
                caustics = max(0.0, caustics);
                
                // Depth calculation
                float depth = smoothstep(0.0, 1.0, vPosition.y);
                
                // Combine all effects
                vec3 waterColor = mix(deepColor, shallowColor, depth);
                waterColor += vec3(caustics * 0.1);
                waterColor = mix(waterColor, vec3(1.0), fresnelFactor * viscosity);
                
                // Final color with dynamic opacity
                float alpha = mix(waterOpacity * 0.5, waterOpacity, fresnelFactor);
                
                gl_FragColor = vec4(waterColor, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });
    
        // Create water mesh
        this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    
        // Apply water mesh
        this.object.material = waterMaterial;
        this.waterMaterial = waterMaterial;
    }
    
    update(deltaTime) {
        if (this.waterMaterial && this.waterMaterial.uniforms) {
            // Update time-based uniforms
            this.waterMaterial.uniforms.time.value += deltaTime;
            
            // Update property-based uniforms
            Object.entries(this.properties).forEach(([key, value]) => {
                if (this.waterMaterial.uniforms[key]) {
                    this.waterMaterial.uniforms[key].value = value;
                }
            });
        }
    }
    
    cleanup() {
        if (this.object && this.originalMaterial) {
            this.object.material = this.originalMaterial;
        }
        
        if (this.waterMaterial) {
            this.waterMaterial.dispose();
        }
    }
    
    setProperties(properties) {
        this.properties = {
            flowRate: parseFloat(properties.flowRate) || this.properties.flowRate,
            viscosity: parseFloat(properties.viscosity) || this.properties.viscosity,
            surfaceTension: parseFloat(properties.surfaceTension) || this.properties.surfaceTension,
            rippleStrength: parseFloat(properties.rippleStrength) || this.properties.rippleStrength,
            waterHeight: parseFloat(properties.waterHeight) || this.properties.waterHeight,
            waterOpacity: parseFloat(properties.waterOpacity) || this.properties.waterOpacity
        };
    
        // Update material uniforms
        Object.entries(this.properties).forEach(([key, value]) => {
            if (this.waterMaterial.uniforms[key]) {
                this.waterMaterial.uniforms[key].value = value;
            }
        });
    }
}

class NodeEditor {
    constructor() {
        this.nodes = new Map(); 
        this.connections = new Set();
        this.canvas = document.getElementById('node-canvas');
        this.isDragging = false;
        this.selectedNode = null;
        this.offset = { x: 0, y: 0 };
        this.connectingSocket = null;
        this.nodeEffects = new Map();
        
        // Grid and zoom properties
        this.scale = 1;
        this.viewportX = 0;
        this.viewportY = 0;
        this.isDraggingCanvas = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.gridSize = 20;
        this.gridColor = '#333333';
        this.gridAccentColor = '#444444';
        
        this.initializeSVGLayer();
        this.initializeGridCanvas();
        this.initializeEventListeners();
        this.drawGrid();
        this.canvas.__editor = this;
    }

    initializeGridCanvas() {
        this.gridCanvas = document.createElement('canvas');
        this.gridCanvas.id = 'grid-canvas'; // Add an ID for debugging
        this.gridCanvas.style.position = 'absolute';
        this.gridCanvas.style.top = '0';
        this.gridCanvas.style.left = '0';
        this.gridCanvas.style.width = '100%';
        this.gridCanvas.style.height = '100%';
        this.gridCanvas.style.pointerEvents = 'none'; // Allow mouse events to pass through
        this.gridCanvas.style.zIndex = '0'; // Ensure it’s behind nodes but visible
        this.canvas.appendChild(this.gridCanvas);
    
        // Create container for nodes
        this.nodesContainer = document.createElement('div');
        this.nodesContainer.style.position = 'absolute';
        this.nodesContainer.style.width = '100%';
        this.nodesContainer.style.height = '100%';
        this.nodesContainer.style.transformOrigin = '0 0';
        this.nodesContainer.style.transform = `scale(${this.scale}) translate(${this.viewportX}px, ${this.viewportY}px)`;
        this.canvas.appendChild(this.nodesContainer);
    
        // Initial resize and draw
        this.resizeGridCanvas();
        this.drawGrid();
    }

    linkNodeToSceneObject(node, sceneObject) {
        const nodeData = this.nodes.get(node);
        if (nodeData) {
            nodeData.object = sceneObject;
            this.nodes.set(node, nodeData);
            this.applyNodeEffect(node, sceneObject);
        }
    }

    initializeSVGLayer() {
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.style.position = 'absolute';
        this.svg.style.width = '100%';
        this.svg.style.height = '100%';
        this.svg.style.pointerEvents = 'none';
        this.svg.style.zIndex = '1';
        this.canvas.appendChild(this.svg);
    }

    initializeEventListeners() {
        // Toggle and close buttons
        document.getElementById('node-editor-toggle').addEventListener('click', () => {
            document.querySelector('.node-editor').classList.toggle('visible');
        });

        document.getElementById('node-editor-close').addEventListener('click', () => {
            document.querySelector('.node-editor').classList.remove('visible');
        });

        // Mouse events for dragging
        this.nodesContainer.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Zoom with mouse wheel
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        
        // Canvas panning (middle mouse button)
        this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
        
        // Toolbar buttons
        document.querySelectorAll('.toolbar-button').forEach(button => {
            button.addEventListener('click', () => {
                const type = button.dataset.type;
                this.addNode(type);
            });
        });

        // Context menu
        this.nodesContainer.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.context-menu1')) {
                document.getElementById('context-menu1').style.display = 'none';
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeGridCanvas();
            this.drawGrid();
        });
    }

    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const zoomSpeed = 0.1;
        const delta = -Math.sign(e.deltaY) * zoomSpeed;
        const newScale = Math.max(0.1, Math.min(3, this.scale + delta));
    
        if (newScale !== this.scale) {
            const scaleFactor = newScale / this.scale;
            this.viewportX = mouseX - (mouseX - this.viewportX) * scaleFactor;
            this.viewportY = mouseY - (mouseY - this.viewportY) * scaleFactor;
            this.scale = newScale;
            this.updateTransform();
        }
    }
    
    handleMouseMove(e) {
        if (this.isDragging && this.selectedNode) {
            const scaleInverse = 1 / this.scale;
            const x = (e.clientX - this.offset.x) * scaleInverse;
            const y = (e.clientY - this.offset.y) * scaleInverse;
            this.selectedNode.style.left = `${x}px`;
            this.selectedNode.style.top = `${y}px`;
            this.updateConnections();
        }
    
        if (this.isDraggingCanvas) {
            const dx = e.clientX - this.lastMousePos.x;
            const dy = e.clientY - this.lastMousePos.y;
            this.viewportX += dx;
            this.viewportY += dy;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.updateTransform();
        }
    }
    
    handleCanvasMouseDown(e) {
        // Middle mouse button (button 1) for canvas panning
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            this.isDraggingCanvas = true;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
        }
    }
    
    updateTransform() {
        this.nodesContainer.style.transform = `scale(${this.scale}) translate(${this.viewportX / this.scale}px, ${this.viewportY / this.scale}px)`;
        this.updateConnections();
        this.drawGrid(); // Redraw grid on transform update
    }
    
    resizeGridCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.gridCanvas.width = rect.width * window.devicePixelRatio; // Account for high-DPI screens
        this.gridCanvas.height = rect.height * window.devicePixelRatio;
        this.gridCanvas.style.width = `${rect.width}px`; // CSS size
        this.gridCanvas.style.height = `${rect.height}px`;
    }
    
    drawGrid() {
        this.resizeGridCanvas();
        const ctx = this.gridCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
    
        // Adjust for device pixel ratio
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
        const scaledGridSize = this.gridSize * this.scale;
        const offsetX = (this.viewportX % scaledGridSize) / this.scale;
        const offsetY = (this.viewportY % scaledGridSize) / this.scale;
        const width = this.gridCanvas.width / window.devicePixelRatio;
        const height = this.gridCanvas.height / window.devicePixelRatio;
    
        // Draw standard grid
        ctx.strokeStyle = this.gridColor; // '#333333'
        ctx.lineWidth = 0.5 / this.scale; // Adjust line width for zoom
        ctx.beginPath();
    
        // Vertical lines
        for (let x = offsetX; x < width; x += scaledGridSize / this.scale) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
    
        // Horizontal lines
        for (let y = offsetY; y < height; y += scaledGridSize / this.scale) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();
    
        // Draw accent lines (every 5 cells)
        ctx.strokeStyle = this.gridAccentColor; // '#444444'
        ctx.lineWidth = 1 / this.scale;
        ctx.beginPath();
        const accentSpacing = scaledGridSize * 5 / this.scale;
    
        // Vertical accent lines
        for (let x = offsetX; x < width; x += accentSpacing) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
    
        // Horizontal accent lines
        for (let y = offsetY; y < height; y += accentSpacing) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();
    
        // Draw origin lines
        const originX = this.viewportX / this.scale;
        const originY = this.viewportY / this.scale;
        if (originX >= 0 && originX <= width && originY >= 0 && originY <= height) {
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 1.5 / this.scale;
            ctx.beginPath();
            ctx.moveTo(originX, 0);
            ctx.lineTo(originX, height);
            ctx.moveTo(0, originY);
            ctx.lineTo(width, originY);
            ctx.stroke();
        }
    }

    addNode(type) {
        const node = document.createElement('div');
        node.className = 'node';
        node.innerHTML = this.generateNodeContent(type);

        const padding = 30;
        const rect = this.canvas.getBoundingClientRect();
        
        // Position relative to the viewport
        const centerX = rect.width / 2 / this.scale - this.viewportX / this.scale;
        const centerY = rect.height / 2 / this.scale - this.viewportY / this.scale;
        
        node.style.left = `${centerX + (Math.random() * 200 - 100)}px`;
        node.style.top = `${centerY + (Math.random() * 100 - 50)}px`;

        this.nodesContainer.appendChild(node);
        this.nodes.set(node, { type, properties: {} });

        if (type === 'object') {
            const geometry = new THREE.BoxGeometry();
            const material = new THREE.MeshStandardMaterial();
            const mesh = new THREE.Mesh(geometry, material);
            // Assuming addObjectToScene is defined elsewhere
            addObjectToScene(mesh, 'Test_Shape');
            this.nodes.set(node, { type, object: mesh, properties: {} });
        }

        // Add socket event listeners
        node.querySelectorAll('.node-socket').forEach(socket => {
            socket.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startConnection(socket);
            });
            socket.addEventListener('mouseup', (e) => {
                e.stopPropagation();
                this.endConnection(socket);
            });
        });

        // Add property change listeners
        node.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', () => {
                this.updateNodeProperties(node);
                this.updateConnectedNodes(node);
            });
            // For range inputs, update on input as well
            if (input.type === 'range') {
                input.addEventListener('input', () => {
                    this.updateNodeProperties(node);
                    this.updateConnectedNodes(node);
                    // Update value display
                    const display = input.nextElementSibling;
                    if (display && display.classList.contains('value-display')) {
                        display.textContent = input.value;
                    }
                });
            }
        });

        if (type === 'effect') {
            const typeSelect = node.querySelector('select[name="type"]');
            typeSelect.addEventListener('change', () => {
                this.updatePropertyVisibility(node);
                this.updateNodeProperties(node);
                this.updateConnectedNodes(node);
            });
            this.updatePropertyVisibility(node);
        }
    }

    updateNodeProperties(node) {
        const properties = this.getNodeProperties(node);
        const nodeData = this.nodes.get(node);
        nodeData.properties = properties;
        this.nodes.set(node, nodeData);
    }

    updateConnectedNodes(sourceNode) {
        this.connections.forEach(connection => {
            const startNode = connection.startSocket.closest('.node');
            const endNode = connection.endSocket.closest('.node');
            
            if (startNode === sourceNode) {
                const targetData = this.nodes.get(endNode);
                if (targetData.type === 'object' && targetData.object && sourceNode.type === 'effect') {
                    this.applyEffectToObject(sourceNode, targetData.object);
                } else {
                    this.propagateProperties(sourceNode, endNode);
                }
                this.updateNodeEffect(sourceNode); // Add this to update effect properties
            }
        });
    }

    generateNodeContent(type) {
        const nodeTypes = {
            object: {
                title: 'Scene Object',
                properties: [
                    { name: 'name', type: 'text', label: 'Name' },
                    { name: 'visible', type: 'checkbox', label: 'Visible' }
                ]
            },
            physics: {
                title: 'Physics',
                properties: [
                    { name: 'type', type: 'select', label: 'Type', 
                      options: ['Static', 'Dynamic', 'Kinematic'] },
                    { name: 'mass', type: 'number', label: 'Mass' },
                    { name: 'friction', type: 'number', label: 'Friction' }
                ]
            },
            effect: {
                title: 'Effect',
                properties: [
                    { name: 'type', type: 'select', label: 'Type', options: ['Particles', 'Trail', 'Glow', 'Water'] },
                    { name: 'intensity', type: 'range', label: 'Intensity', min: 0, max: 1, step: 0.1 },
                    // Particle-specific properties
                    { name: 'particleColor', type: 'color', label: 'Particle Color', showWhen: 'type=Particles' },
                    { name: 'particleSpeed', type: 'range', label: 'Speed', min: 0, max: 2, step: 0.1, showWhen: 'type=Particles' },
                    { name: 'particleSize', type: 'range', label: 'Size', min: 0.01, max: 1, step: 0.01, showWhen: 'type=Particles' },
                    { name: 'particleLifetime', type: 'range', label: 'Lifetime', min: 0.1, max: 5, step: 0.1, showWhen: 'type=Particles' },
                    { name: 'particleGravity', type: 'range', label: 'Gravity', min: -1, max: 1, step: 0.1, showWhen: 'type=Particles' },
                    { name: 'particleTurbulence', type: 'range', label: 'Turbulence', min: 0, max: 1, step: 0.1, showWhen: 'type=Particles' },
                    // Water-specific properties
                    { name: 'flowRate', type: 'range', label: 'Flow Rate', min: 0, max: 2, step: 0.1, showWhen: 'type=Water' },
                    { name: 'viscosity', type: 'range', label: 'Viscosity', min: 0, max: 1, step: 0.1, showWhen: 'type=Water' },
                    { name: 'surfaceTension', type: 'range', label: 'Surface Tension', min: 0, max: 1, step: 0.1, showWhen: 'type=Water' },
                    { name: 'rippleStrength', type: 'range', label: 'Ripple Strength', min: 0, max: 1, step: 0.1, showWhen: 'type=Water' },
                    { name: 'waterHeight', type: 'range', label: 'Water Height', min: 0, max: 2, step: 0.1, showWhen: 'type=Water' },
                    { name: 'waterOpacity', type: 'range', label: 'Water Opacity', min: 0, max: 1, step: 0.1, showWhen: 'type=Water' }
                ]
            },                    
            material: {
                title: 'Material',
                properties: [
                    { name: 'type', type: 'select', label: 'Type',
                      options: ['Basic', 'Phong', 'Standard'] },
                    { name: 'color', type: 'color', label: 'Color' }
                ]
            },
            transform: {
                title: 'Transform',
                properties: [
                    { name: 'position', type: 'vector3', label: 'Position' },
                    { name: 'rotation', type: 'vector3', label: 'Rotation' },
                    { name: 'scale', type: 'vector3', label: 'Scale' }
                ]
            },
            animation: {
                title: 'Animation',
                properties: [
                    { name: 'type', type: 'select', label: 'Type',
                      options: ['Rotation', 'Position', 'Scale'] },
                    { name: 'speed', type: 'range', label: 'Speed' },
                    { name: 'loop', type: 'checkbox', label: 'Loop' }
                ]
            },
            light: {
                title: 'Light',
                properties: [
                    { name: 'type', type: 'select', label: 'Type',
                      options: ['Point', 'Spot', 'Directional', 'Ambient'] },
                    { name: 'color', type: 'color', label: 'Color' },
                    { name: 'intensity', type: 'range', label: 'Intensity' },
                    { name: 'castShadow', type: 'checkbox', label: 'Cast Shadow' }
                ]
            }
        };

        const nodeConfig = nodeTypes[type];
        let html = `
            <div class="node-title">${nodeConfig.title}</div>
            <div class="node-socket input"></div>
            <div class="node-content">
        `;

        nodeConfig.properties.forEach(prop => {
            html += this.generatePropertyInput(prop);
        });

        html += `
            </div>
            <div class="node-socket output"></div>
        `;

        return html;
    }

    generatePropertyInput(prop) {
        if (prop.showWhen) {
             const [dependentField, value] = prop.showWhen.split('=');
        return `
           <div class="node-property" data-show-when="${prop.showWhen}">
                <label>${prop.label}</label>
                <input type="range" 
                    name="${prop.name}" 
                    min="${prop.min || 0}" 
                    max="${prop.max || 1}" 
                    step="${prop.step || 0.1}" 
                    value="${prop.default || (prop.min || 0)}">
                   <span class="value-display">0</span>
            </div>
        `;
        }
        let input = '';
        switch(prop.type) {
            case 'text':
                input = `<input type="text" name="${prop.name}">`;
                break;
            case 'number':
                input = `<input type="number" name="${prop.name}" step="0.1">`;
                break;
            case 'checkbox':
                input = `<input type="checkbox" name="${prop.name}">`;
                break;
            case 'select':
                input = `
                    <select name="${prop.name}">
                        ${prop.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                    </select>
                `;
                break;
            case 'range':
                input = `<input type="range" name="${prop.name}" min="0" max="1" step="0.1">`;
                break;
            case 'color':
                input = `<input type="color" name="${prop.name}">`;
                break;
            case 'vector3':
                input = `
                    <div style="display: flex; gap: 4px;">
                        <input type="number" name="${prop.name}_x" step="0.1" style="width: 60px;" placeholder="X">
                        <input type="number" name="${prop.name}_y" step="0.1" style="width: 60px;" placeholder="Y">
                        <input type="number" name="${prop.name}_z" step="0.1" style="width: 60px;" placeholder="Z">
                    </div>
                `;
                break;
        }
        return `
            <div class="node-property">
                <label>${prop.label}</label>
                ${input}
            </div>
        `;
    }

    updatePropertyVisibility(node) {
          const typeSelect = node.querySelector('select[name="type"]');
         const properties = node.querySelectorAll('[data-show-when]');

         properties.forEach(prop => {
        const [dependentField, value] = prop.dataset.showWhen.split('=');
        if (dependentField === 'type') {
          prop.style.display = typeSelect.value === value ? 'block' : 'none';
        }
        });
    }
    
    handleMouseDown(e) {
        const node = e.target.closest('.node');
        if (node && !e.target.classList.contains('node-socket')) {
            this.isDragging = true;
            this.selectedNode = node;
            const rect = node.getBoundingClientRect();
            this.offset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            // Bring the selected node to front
            node.style.zIndex = '10';
            
            // Reset other nodes z-index
            this.nodes.forEach((nodeData, nodeElement) => {
                if (nodeElement !== node) {
                    nodeElement.style.zIndex = '1';
                }
            });
            
            e.stopPropagation();
        }
    }

    

    handleMouseUp(e) {
        this.isDragging = false;
        this.selectedNode = null;
        
        // End canvas dragging
        if (this.isDraggingCanvas) {
            this.isDraggingCanvas = false;
        }
    }

    handleContextMenu(e) {
        e.preventDefault();
        console.log("Right-click detected:", e);
    
        const node = e.target.closest('.node');
        if (node) {
            const menu = document.getElementById('context-menu1');
            if (!menu) {
                console.error("Context menu not found!");
                return;
            }
    
            menu.style.display = 'block';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
    
            menu.querySelector('[data-action="delete"]').onclick = () => {
                this.deleteNode(node);
                menu.style.display = 'none';
            };
    
            menu.querySelector('[data-action="duplicate"]').onclick = () => {
                this.duplicateNode(node);
                menu.style.display = 'none';
            };
        }
    }
   
    startConnection(socket) {
        this.connectingSocket = socket;
    }

    endConnection(socket) {
        if (this.connectingSocket && this.connectingSocket !== socket) {
            if (this.isValidConnection(this.connectingSocket, socket)) {
                const connection = new NodeConnection(this.connectingSocket, socket);
                this.connections.add(connection);
                this.svg.appendChild(connection.element);
                connection.update();

                // Get connected nodes
                const sourceNode = this.connectingSocket.closest('.node');
                const targetNode = socket.closest('.node');
                const sourceData = this.nodes.get(sourceNode);
                const targetData = this.nodes.get(targetNode);

                // Apply properties based on connection direction
                if (sourceData.type === 'effect' && targetData.type === 'object') {
                    this.applyEffectToObject(sourceNode, targetData.object);
                } else if (sourceData.type === 'object' && targetData.type === 'effect') {
                    this.applyEffectToObject(targetNode, sourceData.object);
                } else {
                    // For other node types, propagate properties
                    this.propagateProperties(sourceNode, targetNode);
                }
            }
        }
        this.connectingSocket = null;
    }

    propagateProperties(sourceNode, targetNode) {
        const sourceProps = this.getNodeProperties(sourceNode);
        const targetData = this.nodes.get(targetNode);
        
        // Update target node properties
        targetData.properties = { ...targetData.properties, ...sourceProps };
        this.nodes.set(targetNode, targetData);

        // Apply properties based on node type
        if (targetData.object && targetData.type === 'object') {
            this.applyNodeEffect(targetNode, targetData.object);
        }

        // Update UI
        this.updateNodeUI(targetNode);
    }

    updateNodeUI(node) {
        const properties = this.getNodeProperties(node);
        const inputs = node.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (properties[input.name] !== undefined) {
                if (input.type === 'checkbox') {
                    input.checked = properties[input.name];
                } else {
                    input.value = properties[input.name];
                }
            }
        });
    }

    applyEffectToObject(effectNode, targetObject) {
        const properties = this.getNodeProperties(effectNode);
        const effectType = properties.type;
    
        // Clean up existing effect without removing the object
        if (this.nodeEffects.has(targetObject)) {
            const existingEffect = this.nodeEffects.get(targetObject);
            if (existingEffect.cleanup) existingEffect.cleanup();
            this.nodeEffects.delete(targetObject);
        }
    
        // Apply new effect
        switch (effectType) {
            case 'Particles':
                this.createParticleEffect(targetObject, parseFloat(properties.intensity) || 0.5);
                const effect = this.nodeEffects.get(targetObject);
                if (effect && effect.updateProperties) effect.updateProperties(properties);
                break;
            case 'Trail':
                this.createTrailEffect(targetObject, parseFloat(properties.intensity) || 0.5);
                break;
            case 'Glow':
                this.createGlowEffect(targetObject, parseFloat(properties.intensity) || 0.5);
                break;
            case 'Water':
                const waterEffect = new WaterEffect(targetObject, {
                    flowRate: parseFloat(properties.flowRate) || 1.0,
                    viscosity: parseFloat(properties.viscosity) || 0.5,
                    surfaceTension: parseFloat(properties.surfaceTension) || 0.8,
                    rippleStrength: parseFloat(properties.rippleStrength) || 0.5,
                    waterHeight: parseFloat(properties.waterHeight) || 0.5,
                    waterOpacity: parseFloat(properties.waterOpacity) || 0.8
                });
                this.nodeEffects.set(targetObject, waterEffect);
                break;
        }
    }

    updateNodeEffect(node) {
        this.connections.forEach(connection => {
            const sourceNode = connection.startSocket.closest('.node');
            const targetNode = connection.endSocket.closest('.node');
            
            if (sourceNode === node) {
                const targetData = this.nodes.get(targetNode);
                if (targetData && targetData.object) {
                    const properties = this.getNodeProperties(node);
                    const effect = this.nodeEffects.get(targetData.object);
                    if (effect && effect.updateProperties) {
                        effect.updateProperties(properties);
                    }
                }
            }
        });
    }


    update(deltaTime = 1/60) {
        this.nodeEffects.forEach((effect, object) => {
            if (effect && effect.update) {
                effect.update(deltaTime);
            }
        });
    }

    updateConnections() {
        // Apply the same transform as nodesContainer to the SVG layer
        this.svg.style.transform = `translate(${this.viewportX}px, ${this.viewportY}px) scale(${this.scale})`;
        this.svg.style.transformOrigin = '0 0'; // Match nodesContainer
    
        // Update all connections
        this.connections.forEach(connection => {
            connection.update();
        });
    }
   

    deleteNode(node) {
        // Remove connections
        this.connections = new Set([...this.connections].filter(conn => {
            const isConnected = conn.startSocket.closest('.node') === node ||
                              conn.endSocket.closest('.node') === node;
            if (isConnected) {
                conn.element.remove();
            }
            return !isConnected;
        }));

        // Remove node
        this.nodes.delete(node);
        node.remove();
    }

    duplicateNode(node) {
        const type = this.nodes.get(node).type;
        this.addNode(type);
    }

    applyNodeEffect(node, targetObject) {
        const nodeData = this.nodes.get(node);
        const type = nodeData.type;
        const properties = this.getNodeProperties(node);
    
        switch (type) {
            case 'object':
                this.applyObjectProperties(targetObject, properties);
                break;
            case 'physics':
                this.applyPhysicsProperties(targetObject, properties);
                break;
            case 'effect':
                this.applyEffectToObject(node, targetObject); // Use node directly
                break;
            case 'material':
                this.applyMaterialProperties(targetObject, properties);
                break;
            case 'transform':
                this.applyTransformProperties(targetObject, properties);
                break;
        }
    }

    getNodeProperties(node) {
        const properties = {};
        node.querySelectorAll('input, select').forEach(input => {
            properties[input.name] = input.type === 'checkbox' ? input.checked : input.value;
        });
        return properties;
    }

    applyObjectProperties(object, properties) {
        if (properties.name) object.name = properties.name;
        if (properties.hasOwnProperty('visible')) object.visible = properties.visible;
    }

    applyPhysicsProperties(object, properties) {
        if (!object.userData.physics) {
            object.userData.physics = {};
        }

        object.userData.physics = {
            type: properties.type || 'Static',
            mass: parseFloat(properties.mass) || 1,
            friction: parseFloat(properties.friction) || 0.5
        };

        // Implement physics using Ammo.js or other physics engine
        this.updatePhysics(object);
    }

    applyEffectProperties(object, properties) {
        const effectType = properties.type;
        
        // Clean up existing effect
        if (this.nodeEffects.has(object)) {
            const existingEffect = this.nodeEffects.get(object);
            if (existingEffect.cleanup) {
                existingEffect.cleanup();
            }
            if (existingEffect instanceof THREE.Object3D) {
                object.remove(existingEffect);
            }
            this.nodeEffects.delete(object);
        }
        
        // Apply new effect based on type
        switch (effectType) {
            case 'Particles':
                this.createParticleEffect(object, parseFloat(properties.intensity) || 0.5);
                break;
            case 'Trail':
                this.createTrailEffect(object, parseFloat(properties.intensity) || 0.5);
                break;
            case 'Glow':
                this.createGlowEffect(object, parseFloat(properties.intensity) || 0.5);
                break;
            case 'Water':
                const waterEffect = new WaterEffect(object, {
                    flowRate: parseFloat(properties.flowRate) || 1.0,
                    viscosity: parseFloat(properties.viscosity) || 0.5,
                    surfaceTension: parseFloat(properties.surfaceTension) || 0.8,
                    rippleStrength: parseFloat(properties.rippleStrength) || 0.5,
                    waterHeight: parseFloat(properties.waterHeight) || 0.5,
                    waterOpacity: parseFloat(properties.waterOpacity) || 0.8
                });
                this.nodeEffects.set(object, waterEffect);
                break;
        }
    }
    
    applyMaterialProperties(object, properties) {
        if (!object.material) return;
    
        const materialType = properties.type || 'Standard';
        const color = properties.color || '#ffffff';
    
        // Dispose of old material safely
        if (object.material.dispose) object.material.dispose();
    
        // Create new material
        let material;
        switch (materialType) {
            case 'Basic':
                material = new THREE.MeshBasicMaterial({ color: color });
                break;
            case 'Phong':
                material = new THREE.MeshPhongMaterial({ color: color });
                break;
            case 'Standard':
            default:
                material = new THREE.MeshStandardMaterial({ color: color });
                break;
        }
    
        object.material = material;
    }
    
    applyTransformProperties(object, properties) {
        // Position
        if (properties.position_x !== undefined) 
            object.position.x = parseFloat(properties.position_x);
        if (properties.position_y !== undefined) 
            object.position.y = parseFloat(properties.position_y);
        if (properties.position_z !== undefined) 
            object.position.z = parseFloat(properties.position_z);
        
        // Rotation (convert from degrees to radians)
        if (properties.rotation_x !== undefined) 
            object.rotation.x = parseFloat(properties.rotation_x) * Math.PI / 180;
        if (properties.rotation_y !== undefined) 
            object.rotation.y = parseFloat(properties.rotation_y) * Math.PI / 180;
        if (properties.rotation_z !== undefined) 
            object.rotation.z = parseFloat(properties.rotation_z) * Math.PI / 180;
        
        // Scale
        if (properties.scale_x !== undefined) 
            object.scale.x = parseFloat(properties.scale_x);
        if (properties.scale_y !== undefined) 
            object.scale.y = parseFloat(properties.scale_y);
        if (properties.scale_z !== undefined) 
            object.scale.z = parseFloat(properties.scale_z);
    }
    
    createParticleEffect(object, intensity) {
        // Pass the effectNode to this method instead of fetching it here
        const particleCount = Math.floor(intensity * 1000);
        const geometry = new THREE.BufferGeometry();
    
        // Particle attributes
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const lifetimes = new Float32Array(particleCount);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const ages = new Float32Array(particleCount);
    
        const objectBounds = new THREE.Box3().setFromObject(object);
        const size = objectBounds.getSize(new THREE.Vector3());
        const baseColor = new THREE.Color('#ffffff'); // Default color, updated via properties later
        const speed = 1.0;
        const particleSize = 0.1;
        const maxLifetime = 2.0;
        const gravity = 0.0;
        const turbulence = 0.2;
    
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
    
            positions[i3] = (Math.random() - 0.5) * size.x;
            positions[i3 + 1] = (Math.random() - 0.5) * size.y;
            positions[i3 + 2] = (Math.random() - 0.5) * size.z;
    
            velocities[i3] = (Math.random() - 0.5) * speed * 0.1 + (Math.random() - 0.5) * turbulence;
            velocities[i3 + 1] = (Math.random() - 0.5) * speed * 0.1 + (Math.random() - 0.5) * turbulence;
            velocities[i3 + 2] = (Math.random() - 0.5) * speed * 0.1 + (Math.random() - 0.5) * turbulence;
    
            lifetimes[i] = Math.random() * maxLifetime;
            ages[i] = Math.random() * lifetimes[i];
    
            colors[i3] = baseColor.r + (Math.random() - 0.5) * 0.2;
            colors[i3 + 1] = baseColor.g + (Math.random() - 0.5) * 0.2;
            colors[i3 + 2] = baseColor.b + (Math.random() - 0.5) * 0.2;
    
            sizes[i] = particleSize * (0.5 + Math.random());
        }
    
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
        geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1));
    
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                baseColor: { value: baseColor }
                // Removed texture for simplicity; add back if you have a local sprite
            },
            vertexShader: `
                attribute vec3 velocity;
                attribute float lifetime;
                attribute float age;
                attribute vec3 color;
                attribute float size;
    
                varying vec3 vColor;
                varying float vAlpha;
    
                void main() {
                    vColor = color;
                    float lifeProgress = age / lifetime;
                    vAlpha = 1.0 - lifeProgress;
    
                    vec3 newPosition = position + velocity * age;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                    gl_PointSize = size * (1.0 - lifeProgress * 0.5);
                }
            `,
            fragmentShader: `
                uniform vec3 baseColor;
    
                varying vec3 vColor;
                varying float vAlpha;
    
                void main() {
                    gl_FragColor = vec4(vColor * baseColor, vAlpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
    
        const particleSystem = new THREE.Points(geometry, material);
        object.add(particleSystem);
    
        const effect = {
            particleSystem,
            properties: { intensity, color: baseColor, speed, size: particleSize, lifetime: maxLifetime, gravity, turbulence },
            update: (delta) => {
                const positions = particleSystem.geometry.attributes.position.array;
                const velocities = particleSystem.geometry.attributes.velocity.array;
                const ages = particleSystem.geometry.attributes.age.array;
                const lifetimes = particleSystem.geometry.attributes.lifetime.array;
    
                for (let i = 0; i < particleCount; i++) {
                    const i3 = i * 3;
                    ages[i] += delta;
                    if (ages[i] >= lifetimes[i]) {
                        positions[i3] = (Math.random() - 0.5) * size.x;
                        positions[i3 + 1] = (Math.random() - 0.5) * size.y;
                        positions[i3 + 2] = (Math.random() - 0.5) * size.z;
                        velocities[i3] = (Math.random() - 0.5) * speed * 0.1 + (Math.random() - 0.5) * turbulence;
                        velocities[i3 + 1] = (Math.random() - 0.5) * speed * 0.1 + (Math.random() - 0.5) * turbulence;
                        velocities[i3 + 2] = (Math.random() - 0.5) * speed * 0.1 + (Math.random() - 0.5) * turbulence;
                        ages[i] = 0;
                    } else {
                        velocities[i3 + 1] -= gravity * delta;
                        positions[i3] += velocities[i3] * delta * 60;
                        positions[i3 + 1] += velocities[i3 + 1] * delta * 60;
                        positions[i3 + 2] += velocities[i3 + 2] * delta * 60;
                    }
                }
                particleSystem.geometry.attributes.position.needsUpdate = true;
                particleSystem.geometry.attributes.age.needsUpdate = true;
                particleSystem.material.uniforms.time.value += delta;
            },
            cleanup: () => {
                object.remove(particleSystem);
                particleSystem.geometry.dispose();
                particleSystem.material.dispose();
            },
            updateProperties: (newProperties) => {
                effect.properties = {
                    intensity: newProperties.intensity || effect.properties.intensity,
                    color: new THREE.Color(newProperties.particleColor || effect.properties.color),
                    speed: parseFloat(newProperties.particleSpeed) || effect.properties.speed,
                    size: parseFloat(newProperties.particleSize) || effect.properties.size,
                    lifetime: parseFloat(newProperties.particleLifetime) || effect.properties.lifetime,
                    gravity: parseFloat(newProperties.particleGravity) || effect.properties.gravity,
                    turbulence: parseFloat(newProperties.particleTurbulence) || effect.properties.turbulence
                };
                particleSystem.material.uniforms.baseColor.value = effect.properties.color;
    
                for (let i = 0; i < particleCount; i++) {
                    const i3 = i * 3;
                    velocities[i3] = (Math.random() - 0.5) * effect.properties.speed * 0.1 + (Math.random() - 0.5) * effect.properties.turbulence;
                    velocities[i3 + 1] = (Math.random() - 0.5) * effect.properties.speed * 0.1 + (Math.random() - 0.5) * effect.properties.turbulence;
                    velocities[i3 + 2] = (Math.random() - 0.5) * effect.properties.speed * 0.1 + (Math.random() - 0.5) * effect.properties.turbulence;
                    lifetimes[i] = Math.random() * effect.properties.lifetime;
                    sizes[i] = effect.properties.size * (0.5 + Math.random());
                }
                particleSystem.geometry.attributes.velocity.needsUpdate = true;
                particleSystem.geometry.attributes.lifetime.needsUpdate = true;
                particleSystem.geometry.attributes.size.needsUpdate = true;
            }
        };
    
        this.nodeEffects.set(object, effect);
    }
    
    createTrailEffect(object, intensity) {
        // Create trail effect using LineSegments
        const maxPoints = Math.floor(intensity * 100);
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(maxPoints * 3);
        
        // Initialize with object's position
        const objectPos = object.position.clone();
        for (let i = 0; i < maxPoints; i++) {
            positions[i * 3] = objectPos.x;
            positions[i * 3 + 1] = objectPos.y;
            positions[i * 3 + 2] = objectPos.z;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Material
        const trailMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.7,
            linewidth: 1
        });
        
        // Create line
        const trail = new THREE.Line(geometry, trailMaterial);
        object.add(trail);
        
        // Store references for updates
        const effect = {
            trail,
            positions,
            maxPoints,
            lastPos: object.position.clone(),
            update: (delta) => {
                const currentPos = object.position.clone();
                
                // Only update if position changed
                if (!currentPos.equals(this.lastPos)) {
                    const positions = trail.geometry.attributes.position.array;
                    
                    // Shift positions
                    for (let i = maxPoints - 1; i > 0; i--) {
                        positions[i * 3] = positions[(i - 1) * 3];
                        positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
                        positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
                    }
                    
                    // Add current position
                    positions[0] = currentPos.x;
                    positions[1] = currentPos.y;
                    positions[2] = currentPos.z;
                    
                    trail.geometry.attributes.position.needsUpdate = true;
                    this.lastPos.copy(currentPos);
                }
            },
            cleanup: () => {
                object.remove(trail);
                trail.geometry.dispose();
                trail.material.dispose();
            }
        };
        
        this.nodeEffects.set(object, effect);
    }
    
    createGlowEffect(object, intensity) {
        // Create a glow effect using a scaled mesh with emissive material
        const objectGeometry = object.geometry.clone();
        
        // Glowing material
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: intensity * 0.5,
            side: THREE.BackSide
        });
        
        // Create glow mesh slightly larger than the original
        const glowMesh = new THREE.Mesh(objectGeometry, glowMaterial);
        glowMesh.scale.multiplyScalar(1.1);
        object.add(glowMesh);
        
        // Store references for updates
        const effect = {
            glowMesh,
            intensity,
            update: (delta) => {
                // Pulse the glow
                const time = Date.now() * 0.001;
                const pulse = Math.sin(time * 2) * 0.1 + 0.9;
                glowMesh.material.opacity = intensity * 0.5 * pulse;
            },
            cleanup: () => {
                object.remove(glowMesh);
                glowMesh.geometry.dispose();
                glowMesh.material.dispose();
            }
        };
        
        this.nodeEffects.set(object, effect);
    }
    
    updatePhysics(object) {
        // This would integrate with a physics engine like Ammo.js
        // Implement physics behavior based on object.userData.physics
        console.log('Physics properties updated for', object.name);
        
        // Example implementation would depend on the physics engine used
        if (object.userData.physics) {
            const type = object.userData.physics.type;
            const mass = object.userData.physics.mass;
            
            // This is where you would call your physics engine functions
            // For example with Ammo.js:
            // const physicsWorld = this.getPhysicsWorld();
            // const shape = new Ammo.btBoxShape(new Ammo.btVector3(1, 1, 1));
            // const transform = new Ammo.btTransform();
            // transform.setIdentity();
            // transform.setOrigin(new Ammo.btVector3(object.position.x, object.position.y, object.position.z));
            // const body = new Ammo.btRigidBody(new Ammo.btRigidBodyConstructionInfo(
            //     mass, new Ammo.btDefaultMotionState(transform), shape, new Ammo.btVector3(0, 0, 0)
            // ));
            // physicsWorld.addRigidBody(body);
        }
    }
    
    isValidConnection(socket1, socket2) {
        // Only allow connections between input and output sockets
        return (socket1.classList.contains('input') && socket2.classList.contains('output')) ||
               (socket1.classList.contains('output') && socket2.classList.contains('input'));
    }
}
    

