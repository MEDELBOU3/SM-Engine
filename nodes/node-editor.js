class NodeConnection {
    constructor(startSocket, endSocket, editor, options = {}) {
        if (!startSocket || !endSocket || !editor) {
            console.error("NodeConnection: Missing startSocket, endSocket, or editor instance.");
            return;
        }

        this.startSocket = startSocket;
        this.endSocket = endSocket;
        this.editor = editor;
        this.sourceNode = startSocket.closest('.node');
        this.targetNode = endSocket.closest('.node');
        this.sourceSocketType = startSocket.dataset.socketType || 'output';
        this.targetSocketType = endSocket.dataset.socketType || 'input';

        this.options = {
            color: getComputedStyle(document.documentElement).getPropertyValue('--node-connection-color').trim() || '#9e9e9e',
            strokeWidth: 2.5,
            dashed: false,
            showArrow: true,
            hoverColor: getComputedStyle(document.documentElement).getPropertyValue('--node-connection-hover-color').trim() || '#03A9F4',
            selectedColor: getComputedStyle(document.documentElement).getPropertyValue('--node-connection-selected-color').trim() || '#FFC107',
            arrowSize: 8,
            controlPointOffsetFactor: 0.4,
            minControlOffset: 30,
            maxControlOffset: 150,
            animationSpeed: 50,
            dataType: this.getDataTypeFromSocket(startSocket) || 'generic',
            ...options
        };

        this.element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.interactionElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.arrowhead = this.options.showArrow ? document.createElementNS('http://www.w3.org/2000/svg', 'path') : null;
        this.dataTypeIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        
        this.isSelected = false;
        this.isActive = true;
        this.dashOffset = 0;
        this.animationFrameId = null;
        this.lastTimestamp = null;
        this.dataFlowValue = null;
        this.dataFlowAnimationId = null;

        this.initConnection();
        this.addEventListeners();
        
        if (this.options.dashed) {
            this.startDashAnimation();
        }
    }

    getDataTypeFromSocket(socket) {
        return socket.dataset.dataType || 
               socket.closest('.node')?.dataset.outputType || 
               socket.closest('.node')?.dataset.inputType;
    }

    initConnection() {
        const svg = this.editor.svg;
        if (!svg) {
            console.error('NodeConnection: SVG layer not found in NodeEditor instance.');
            return;
        }

        this.element.setAttribute('stroke', this.getDataTypeColor(this.options.dataType));
        this.element.setAttribute('stroke-width', (this.options.strokeWidth / this.editor.scale).toFixed(2));
        this.element.setAttribute('fill', 'none');
        this.element.setAttribute('class', 'node-connection-line');
        this.element.style.pointerEvents = 'none';

        this.interactionElement.setAttribute('stroke', 'transparent');
        this.interactionElement.setAttribute('stroke-width', ((this.options.strokeWidth + 12) / this.editor.scale).toFixed(2));
        this.interactionElement.setAttribute('fill', 'none');
        this.interactionElement.setAttribute('class', 'node-connection-interaction');
        this.interactionElement.style.cursor = 'pointer';

        if (this.options.dashed) {
            this.element.setAttribute('stroke-dasharray', `${(5 / this.editor.scale).toFixed(2)},${(5 / this.editor.scale).toFixed(2)}`);
        }

        svg.appendChild(this.interactionElement);
        svg.appendChild(this.element);

        if (this.arrowhead) {
            this.arrowhead.setAttribute('class', 'node-connection-arrow');
            this.arrowhead.setAttribute('fill', this.getDataTypeColor(this.options.dataType));
            svg.appendChild(this.arrowhead);
        }

        this.dataTypeIndicator.setAttribute('class', 'node-connection-datatype');
        this.dataTypeIndicator.setAttribute('r', (6 / this.editor.scale).toFixed(2));
        this.dataTypeIndicator.setAttribute('fill', this.getDataTypeColor(this.options.dataType));
        svg.appendChild(this.dataTypeIndicator);

        this.update();
    }

    getDataTypeColor(type) {
        const typeColors = {
            'vector': '#4CAF50',
            'number': '#2196F3',
            'boolean': '#FF9800',
            'string': '#9C27B0',
            'color': '#F44336',
            'object': '#607D8B',
            'geometry': '#009688',
            'material': '#795548',
            'texture': '#8BC34A',
            'transform': '#3F51B5',
            'default': this.options.color
        };
        return typeColors[type] || typeColors['default'];
    }

    addEventListeners() {
        this.interactionElement.addEventListener('mouseenter', () => {
            if (!this.isSelected) {
                this.element.setAttribute('stroke', this.options.hoverColor);
                this.element.setAttribute('stroke-width', ((this.options.strokeWidth * 1.2) / this.editor.scale).toFixed(2));
                if (this.arrowhead) this.arrowhead.setAttribute('fill', this.options.hoverColor);
                this.dataTypeIndicator.setAttribute('fill', this.options.hoverColor);
                this.element.classList.add('hovered');
            }
        });

        this.interactionElement.addEventListener('mouseleave', () => {
            if (!this.isSelected) {
                this.element.setAttribute('stroke', this.getDataTypeColor(this.options.dataType));
                this.element.setAttribute('stroke-width', (this.options.strokeWidth / this.editor.scale).toFixed(2));
                if (this.arrowhead) this.arrowhead.setAttribute('fill', this.getDataTypeColor(this.options.dataType));
                this.dataTypeIndicator.setAttribute('fill', this.getDataTypeColor(this.options.dataType));
                this.element.classList.remove('hovered');
            }
        });

        this.interactionElement.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.editor.selectConnection(this);
        });

        this.interactionElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (window.confirm("Delete this connection?")) {
                this.editor.deleteConnection(this);
            }
        });

        this.interactionElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showConnectionContextMenu(e.clientX, e.clientY);
        });
    }

    showConnectionContextMenu(x, y) {
        const menu = document.createElement('div');
        menu.className = 'node-context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        
        menu.innerHTML = `
            <div class="menu-item" data-action="select">Select Connection</div>
            <div class="menu-item" data-action="delete">Delete Connection</div>
            <div class="menu-separator"></div>
            <div class="menu-item" data-action="toggle-active">${this.isActive ? 'Disable' : 'Enable'} Connection</div>
            <div class="menu-item" data-action="reverse">Reverse Direction</div>
            <div class="menu-separator"></div>
            <div class="menu-submenu">
                <div class="menu-item">Connection Style</div>
                <div class="submenu">
                    <div class="menu-item ${!this.options.dashed ? 'selected' : ''}" data-action="set-style-solid">Solid</div>
                    <div class="menu-item ${this.options.dashed ? 'selected' : ''}" data-action="set-style-dashed">Dashed</div>
                </div>
            </div>
        `;

        document.body.appendChild(menu);
        
        const closeMenu = () => {
            document.body.removeChild(menu);
            document.removeEventListener('click', closeMenu);
        };
        
        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                
                switch(action) {
                    case 'select':
                        this.editor.selectConnection(this);
                        break;
                    case 'delete':
                        this.editor.deleteConnection(this);
                        break;
                    case 'toggle-active':
                        this.setActive(!this.isActive);
                        break;
                    case 'reverse':
                        this.reverseDirection();
                        break;
                    case 'set-style-solid':
                        this.setStyle({ dashed: false });
                        break;
                    case 'set-style-dashed':
                        this.setStyle({ dashed: true });
                        break;
                }
                
                closeMenu();
            });
        });
        
        document.addEventListener('click', closeMenu);
    }

    update() {
        if (!this.startSocket || !this.endSocket || !this.editor.canvas || !this.element.isConnected) return;

        const startPos = this.editor.getConnectionEndpoint(this.startSocket);
        const endPos = this.editor.getConnectionEndpoint(this.endSocket);

        if (isNaN(startPos.x) || isNaN(startPos.y) || isNaN(endPos.x) || isNaN(endPos.y)) {
            return;
        }

        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let controlOffset = distance * this.options.controlPointOffsetFactor;
        controlOffset = Math.max(this.options.minControlOffset, Math.min(this.options.maxControlOffset, controlOffset));

        const startDir = this.getSocketDirection(this.startSocket);
        const endDir = this.getSocketDirection(this.endSocket);
        
        const cp1x = startPos.x + controlOffset * startDir.x;
        const cp1y = startPos.y + controlOffset * startDir.y;
        const cp2x = endPos.x - controlOffset * endDir.x;
        const cp2y = endPos.y - controlOffset * endDir.y;

        const pathData = `M ${startPos.x},${startPos.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${endPos.x},${endPos.y}`;

        this.element.setAttribute('d', pathData);
        this.interactionElement.setAttribute('d', pathData);

        const currentScale = this.editor.scale;
        const visualStrokeWidth = (this.element.classList.contains('hovered') || this.isSelected) ? 
            (this.options.strokeWidth * 1.2) / currentScale : 
            this.options.strokeWidth / currentScale;
            
        this.element.setAttribute('stroke-width', visualStrokeWidth.toFixed(2));
        this.interactionElement.setAttribute('stroke-width', ((this.options.strokeWidth + 12) / currentScale).toFixed(2));

        if (this.options.dashed) {
            const dashValue = (5 / currentScale).toFixed(2);
            this.element.setAttribute('stroke-dasharray', `${dashValue},${dashValue}`);
        }

        if (this.arrowhead && this.element.getTotalLength) {
            const pathLength = this.element.getTotalLength();
            if (pathLength > 10) {
                const preTipPoint = this.element.getPointAtLength(pathLength - 10);
                this.drawArrowhead(endPos, preTipPoint, currentScale);
            }
        }

        if (this.dataTypeIndicator && this.element.getTotalLength) {
            const pathLength = this.element.getTotalLength();
            if (pathLength > 20) {
                const midPoint = this.element.getPointAtLength(pathLength * 0.5);
                this.dataTypeIndicator.setAttribute('cx', midPoint.x);
                this.dataTypeIndicator.setAttribute('cy', midPoint.y);
            }
        }

        if (this.dataFlowValue !== null && this.isActive) {
            this.updateDataFlowAnimation();
        }
    }

    getSocketDirection(socket) {
        const node = socket.closest('.node');
        if (!node) return { x: 1, y: 0 };
        
        const nodeRect = node.getBoundingClientRect();
        const socketRect = socket.getBoundingClientRect();
        
        const relX = (socketRect.left + socketRect.width/2) - (nodeRect.left + nodeRect.width/2);
        const relY = (socketRect.top + socketRect.height/2) - (nodeRect.top + nodeRect.height/2);
        
        const length = Math.sqrt(relX * relX + relY * relY);
        if (length === 0) return { x: 1, y: 0 };
        
        return {
            x: relX / length,
            y: relY / length
        };
    }

    drawArrowhead(tip, preTip, scale) {
        if (Math.abs(tip.x - preTip.x) < 0.1 && Math.abs(tip.y - preTip.y) < 0.1) return;

        const angle = Math.atan2(tip.y - preTip.y, tip.x - preTip.x);
        const arrowSize = this.options.arrowSize / scale;
        const arrowAngle = Math.PI / 6;

        const x1 = tip.x - arrowSize * Math.cos(angle - arrowAngle);
        const y1 = tip.y - arrowSize * Math.sin(angle - arrowAngle);
        const x2 = tip.x - arrowSize * Math.cos(angle + arrowAngle);
        const y2 = tip.y - arrowSize * Math.sin(angle + arrowAngle);

        this.arrowhead.setAttribute('d', `M ${tip.x.toFixed(2)},${tip.y.toFixed(2)} L ${x1.toFixed(2)},${y1.toFixed(2)} L ${x2.toFixed(2)},${y2.toFixed(2)} Z`);
    }

    setSelected(selected) {
        this.isSelected = selected;
        const isHovered = this.element.classList.contains('hovered');
        let currentColor = this.getDataTypeColor(this.options.dataType);
        
        if (this.isSelected) {
            currentColor = this.options.selectedColor;
        } else if (isHovered) {
            currentColor = this.options.hoverColor;
        }
        
        this.element.setAttribute('stroke', currentColor);
        const strokeWidth = (this.isSelected || isHovered) ? 
            (this.options.strokeWidth * 1.2) / this.editor.scale : 
            this.options.strokeWidth / this.editor.scale;
            
        this.element.setAttribute('stroke-width', strokeWidth.toFixed(2));

        if (this.arrowhead) this.arrowhead.setAttribute('fill', currentColor);
        if (this.dataTypeIndicator) this.dataTypeIndicator.setAttribute('fill', currentColor);
        this.element.classList.toggle('selected', this.isSelected);
    }

    setActive(active) {
        this.isActive = active;
        if (active) {
            this.element.style.opacity = '1';
            this.interactionElement.style.opacity = '1';
            if (this.arrowhead) this.arrowhead.style.opacity = '1';
            if (this.dataTypeIndicator) this.dataTypeIndicator.style.opacity = '1';
        } else {
            this.element.style.opacity = '0.5';
            this.interactionElement.style.opacity = '0.5';
            if (this.arrowhead) this.arrowhead.style.opacity = '0.5';
            if (this.dataTypeIndicator) this.dataTypeIndicator.style.opacity = '0.5';
        }
    }

    setStyle(styleOptions) {
        this.options = { ...this.options, ...styleOptions };
        
        if (this.options.dashed) {
            this.element.setAttribute('stroke-dasharray', `${(5 / this.editor.scale).toFixed(2)},${(5 / this.editor.scale).toFixed(2)}`);
            this.startDashAnimation();
        } else {
            this.element.removeAttribute('stroke-dasharray');
            this.stopDashAnimation();
        }
        
        this.update();
    }

    reverseDirection() {
        const temp = this.startSocket;
        this.startSocket = this.endSocket;
        this.endSocket = temp;
        
        this.sourceNode = this.startSocket.closest('.node');
        this.targetNode = this.endSocket.closest('.node');
        
        this.sourceSocketType = this.startSocket.dataset.socketType || 'output';
        this.targetSocketType = this.endSocket.dataset.socketType || 'input';
        
        this.update();
    }

    startDashAnimation() {
        if (this.animationFrameId || !this.options.dashed || !this.element.isConnected) return;
        
        const animate = (timestamp) => {
            if (!this.element.isConnected) {
                this.stopDashAnimation(); 
                return;
            }
            
            if (!this.lastTimestamp) this.lastTimestamp = timestamp;
            const deltaTime = (timestamp - this.lastTimestamp) / 1000;
            this.lastTimestamp = timestamp;
            
            this.dashOffset -= this.options.animationSpeed * deltaTime;
            this.element.setAttribute('stroke-dashoffset', this.dashOffset.toFixed(2));
            
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }

    stopDashAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            this.lastTimestamp = null;
        }
    }

    animateDataFlow(value) {
        this.dataFlowValue = value;
        
        if (this.dataFlowAnimationId) {
            cancelAnimationFrame(this.dataFlowAnimationId);
        }
        
        this.updateDataFlowAnimation();
    }

    updateDataFlowAnimation() {
        if (!this.element.isConnected) {
            this.stopDataFlowAnimation();
            return;
        }
        
        const pathLength = this.element.getTotalLength();
        if (pathLength < 10) return;
        
        const gradientSize = Math.min(100, pathLength * 0.3);
        const progress = (performance.now() * 0.001 * this.options.animationSpeed) % 1;
        const startOffset = progress * (pathLength + gradientSize) - gradientSize;
        
        const maskPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        maskPath.setAttribute('d', this.element.getAttribute('d'));
        maskPath.setAttribute('stroke', 'white');
        maskPath.setAttribute('stroke-width', (this.options.strokeWidth * 1.5 / this.editor.scale).toFixed(2));
        maskPath.setAttribute('stroke-dasharray', `${gradientSize},${pathLength + gradientSize}`);
        maskPath.setAttribute('stroke-dashoffset', -startOffset);
        maskPath.setAttribute('fill', 'none');
        
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tempSvg.style.position = 'absolute';
        tempSvg.style.pointerEvents = 'none';
        
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.appendChild(this.element.cloneNode());
        group.appendChild(maskPath);
        
        tempSvg.appendChild(group);
        this.editor.svg.appendChild(tempSvg);
        
        requestAnimationFrame(() => {
            if (tempSvg.parentNode) {
                tempSvg.parentNode.removeChild(tempSvg);
            }
            
            if (this.isActive && this.dataFlowValue !== null) {
                this.dataFlowAnimationId = requestAnimationFrame(() => this.updateDataFlowAnimation());
            }
        });
    }

    stopDataFlowAnimation() {
        if (this.dataFlowAnimationId) {
            cancelAnimationFrame(this.dataFlowAnimationId);
            this.dataFlowAnimationId = null;
        }
        this.dataFlowValue = null;
    }

    remove() {
        this.stopDashAnimation();
        this.stopDataFlowAnimation();
        
        if (this.element?.parentNode) this.element.remove();
        if (this.interactionElement?.parentNode) this.interactionElement.remove();
        if (this.arrowhead?.parentNode) this.arrowhead.remove();
        if (this.dataTypeIndicator?.parentNode) this.dataTypeIndicator.remove();
    }
}

class NodeEditor {
    constructor(sceneInstance, cameraInstance) {
        this.scene = sceneInstance;
        this.camera = cameraInstance;
        this.nodes = new Map();
        this.connections = new Set();
        this.selectedConnections = new Set();
        this.nodeEffects = new Map();
        this.nodeGroups = new Map();
        this.nodeTemplates = new Map();

        this.editorWrapper = document.getElementById('main-node-editor');
        this.canvas = document.getElementById('node-canvas');
        if (!this.editorWrapper || !this.canvas) {
            console.error("NodeEditor: Crucial HTML elements (#main-node-editor or #node-canvas) not found!");
            return;
        }

        this.isDraggingNode = false;
        this.selectedNode = null;
        this.dragOffset = { x: 0, y: 0 };
        this.connectingSocketInfo = null;
        this.isBoxSelecting = false;
        this.boxSelectStart = { x: 0, y: 0 };
        this.boxSelectElement = null;

        this.scale = 1; 
        this.minScale = 0.15; 
        this.maxScale = 3.0;
        this.viewportX = 0; 
        this.viewportY = 0;
        this.isPanning = false; 
        this.lastPanPosition = { x: 0, y: 0 };
        this.gridSize = 20;

        this.gridCanvas = document.createElement('canvas');
        this.gridCanvas.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:0;`;
        this.canvas.appendChild(this.gridCanvas);
        this.gridCtx = this.gridCanvas.getContext('2d');

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:1; overflow:visible;`;
        this.canvas.appendChild(this.svg);

        this.nodesContainer = document.createElement('div');
        this.nodesContainer.style.cssText = `position:absolute; top:0; left:0; transform-origin:0 0; z-index:2;`;
        this.canvas.appendChild(this.nodesContainer);

        this.tempConnectionLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.tempConnectionLine.setAttribute('stroke', '#00bcd4');
        this.tempConnectionLine.setAttribute('stroke-width', '2.5');
        this.tempConnectionLine.setAttribute('fill', 'none');
        this.tempConnectionLine.setAttribute('stroke-dasharray', '5,5');
        this.tempConnectionLine.style.display = 'none';
        this.svg.appendChild(this.tempConnectionLine);

        this.boxSelectElement = document.createElement('div');
        this.boxSelectElement.style.cssText = `position:absolute; border:1px dashed #2196F3; background:rgba(33, 150, 243, 0.1); pointer-events:none; display:none;`;
        this.canvas.appendChild(this.boxSelectElement);

        this.initializeCoreEventListeners();
        this.resizeGridCanvas();
        this.updateViewTransform();
        
        this.loadDefaultTemplates();
        
        window.nodeEditor = this;
    }

    loadDefaultTemplates() {
        this.nodeTemplates.set('object', {
            title: '3D Object',
            category: 'geometry',
            inputs: [
                { name: 'transform', type: 'transform', label: 'Transform' },
                { name: 'material', type: 'material', label: 'Material' }
            ],
            outputs: [
                { name: 'out', type: 'object', label: 'Object' }
            ],
            properties: [
                { name: 'name', type: 'text', label: 'Name', default: 'MyObject' },
                { name: 'visible', type: 'checkbox', label: 'Visible', default: true },
                { name: 'geometry', type: 'select', label: 'Geometry', 
                  options: ['Box', 'Sphere', 'Cylinder', 'Cone', 'Torus', 'Plane'], default: 'Box' },
                { name: 'castShadow', type: 'checkbox', label: 'Cast Shadow', default: true },
                { name: 'receiveShadow', type: 'checkbox', label: 'Receive Shadow', default: true }
            ],
            createObject: (node, props) => {
                let geometry;
                switch(props.geometry) {
                    case 'Sphere': geometry = new THREE.SphereGeometry(0.5, 32, 32); break;
                    case 'Cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
                    case 'Cone': geometry = new THREE.ConeGeometry(0.5, 1, 32); break;
                    case 'Torus': geometry = new THREE.TorusGeometry(0.5, 0.2, 16, 32); break;
                    case 'Plane': geometry = new THREE.PlaneGeometry(1, 1); break;
                    default: geometry = new THREE.BoxGeometry(1, 1, 1); break;
                }
                
                const material = new THREE.MeshStandardMaterial({ 
                    color: 0xcccccc, 
                    name: `${props.name || 'Object'}_Material` 
                });
                
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = props.name || `Object_${Date.now()}`;
                mesh.castShadow = props.castShadow;
                mesh.receiveShadow = props.receiveShadow;
                mesh.visible = props.visible;
                
                return mesh;
            }
        });

        this.nodeTemplates.set('material', {
            title: 'Material',
            category: 'shading',
            inputs: [
                { name: 'color', type: 'color', label: 'Base Color' },
                { name: 'texture', type: 'texture', label: 'Texture' }
            ],
            outputs: [
                { name: 'out', type: 'material', label: 'Material' }
            ],
            properties: [
                { name: 'type', type: 'select', label: 'Type', 
                  options: ['Standard', 'Phong', 'Basic', 'Physical'], default: 'Standard' },
                { name: 'color', type: 'color', label: 'Color', default: '#cccccc' },
                { name: 'metalness', type: 'range', label: 'Metallic', default: 0.1, min: 0, max: 1, step: 0.01 },
                { name: 'roughness', type: 'range', label: 'Roughness', default: 0.5, min: 0, max: 1, step: 0.01 },
                { name: 'emissive', type: 'color', label: 'Emissive', default: '#000000' },
                { name: 'emissiveIntensity', type: 'range', label: 'Emissive Intensity', default: 0, min: 0, max: 1, step: 0.01 }
            ],
            createMaterial: (node, props) => {
                let material;
                const color = new THREE.Color(props.color || '#cccccc');
                const emissive = new THREE.Color(props.emissive || '#000000');
                
                switch(props.type.toLowerCase()) {
                    case 'phong':
                        material = new THREE.MeshPhongMaterial({ 
                            color, 
                            emissive,
                            emissiveIntensity: props.emissiveIntensity || 0
                        });
                        break;
                    case 'basic':
                        material = new THREE.MeshBasicMaterial({ color });
                        break;
                    case 'physical':
                        material = new THREE.MeshPhysicalMaterial({ 
                            color,
                            metalness: props.metalness || 0.1,
                            roughness: props.roughness || 0.5,
                            emissive,
                            emissiveIntensity: props.emissiveIntensity || 0
                        });
                        break;
                    default: // Standard
                        material = new THREE.MeshStandardMaterial({ 
                            color,
                            metalness: props.metalness || 0.1,
                            roughness: props.roughness || 0.5,
                            emissive,
                            emissiveIntensity: props.emissiveIntensity || 0
                        });
                        break;
                }
                
                return material;
            }
        });

        // Add more templates for other node types...
    }

    toggleVisibility() {
        const isVisible = this.editorWrapper.classList.toggle('visible');
        if (isVisible) {
            this.resizeGridCanvas();
            this.updateViewTransform();
        }
    }

    setVisible(visible) {
        this.editorWrapper.classList.toggle('visible', visible);
        if (visible) {
            this.resizeGridCanvas();
            this.updateViewTransform();
        }
    }

    resizeGridCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = window.devicePixelRatio || 1;
        this.gridCanvas.width = rect.width * dpr;
        this.gridCanvas.height = rect.height * dpr;
        this.gridCanvas.style.width = `${rect.width}px`;
        this.gridCanvas.style.height = `${rect.height}px`;
        this.gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    drawGrid() {
        if (!this.gridCtx) return;
        const w = this.gridCanvas.width / (window.devicePixelRatio || 1);
        const h = this.gridCanvas.height / (window.devicePixelRatio || 1);
        this.gridCtx.clearRect(0, 0, w, h);
        const s = this.gridSize * this.scale;
        if (s < 4) return;
        const ox = this.viewportX % s;
        const oy = this.viewportY % s;
        this.gridCtx.lineWidth = Math.max(0.5, 1 / this.scale);
        this.gridCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--node-grid-line-color').trim() || '#383838';
        this.gridCtx.globalAlpha = Math.min(1, s / 25);
        for (let x = ox - s; x < w + s; x += s) {
            this.gridCtx.beginPath(); this.gridCtx.moveTo(x, 0); this.gridCtx.lineTo(x, h); this.gridCtx.stroke();
        }
        for (let y = oy - s; y < h + s; y += s) {
            this.gridCtx.beginPath(); this.gridCtx.moveTo(0, y); this.gridCtx.lineTo(w, y); this.gridCtx.stroke();
        }
        this.gridCtx.globalAlpha = 1.0;
    }

    updateViewTransform() {
        const transformValue = `translate(${this.viewportX}px, ${this.viewportY}px) scale(${this.scale})`;
        this.nodesContainer.style.transform = transformValue;
        this.svg.style.transform = transformValue;
        this.svg.style.transformOrigin = '0 0';
        this.drawGrid();
        this.updateAllConnections();
    }

    initializeCoreEventListeners() {
        this.canvas.addEventListener('wheel', this.handleWheelZoom.bind(this), { passive: false });
        this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleDocumentMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleDocumentMouseUp.bind(this));
        this.nodesContainer.addEventListener('mousedown', this.handleNodesContainerMouseDown.bind(this));
        window.addEventListener('resize', () => { if (this.editorWrapper.classList.contains('visible')) { this.resizeGridCanvas(); this.updateViewTransform(); } });
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.getElementById('node-editor-toggle')?.addEventListener('click', () => this.toggleVisibility());
        document.getElementById('node-editor-close')?.addEventListener('click', () => this.setVisible(false));
        this.editorWrapper.querySelector('.node-toolbar')?.querySelectorAll('.toolbar-button[data-type]').forEach(button => {
            button.addEventListener('click', e => {
                const type = e.currentTarget.dataset.type;
                const rect = this.canvas.getBoundingClientRect();
                const x = (rect.width / 2 - this.viewportX) / this.scale - 100;
                const y = (rect.height / 2 - this.viewportY) / this.scale - 75;
                this.addNode(type, x, y);
            });
        });
    }

    handleWheelZoom(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const oldScale = this.scale;
        let newScale = oldScale * (1 + (e.deltaY < 0 ? 1 : -1) * 0.075);
        newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
        if (Math.abs(newScale - oldScale) < 0.001) return;
        this.viewportX = mx - (mx - this.viewportX) * (newScale / oldScale);
        this.viewportY = my - (my - this.viewportY) * (newScale / oldScale);
        this.scale = newScale;
        this.updateViewTransform();
    }

    handleCanvasMouseDown(e) {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            this.isPanning = true;
            this.lastPanPosition = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
        } else if (e.button === 0 && e.target === this.canvas) {
            if (e.shiftKey) {
                // Start box selection
                this.isBoxSelecting = true;
                const pos = this.getMousePositionInCanvasSpace(e);
                this.boxSelectStart = { x: pos.x, y: pos.y };
                this.boxSelectElement.style.left = `${pos.x}px`;
                this.boxSelectElement.style.top = `${pos.y}px`;
                this.boxSelectElement.style.width = '0';
                this.boxSelectElement.style.height = '0';
                this.boxSelectElement.style.display = 'block';
            } else {
                this.deselectAll();
            }
        }
    }

    handleDocumentMouseMove(e) {
        if (this.isPanning) {
            const dx = e.clientX - this.lastPanPosition.x;
            const dy = e.clientY - this.lastPanPosition.y;
            this.viewportX += dx;
            this.viewportY += dy;
            this.lastPanPosition = { x: e.clientX, y: e.clientY };
            this.updateViewTransform();
        } else if (this.isDraggingNode && this.selectedNode) {
            const newX = this.selectedNodeStartPos.x + (e.clientX - this.dragStartMousePos.x) / this.scale;
            const newY = this.selectedNodeStartPos.y + (e.clientY - this.dragStartMousePos.y) / this.scale;
            this.selectedNode.style.left = `${newX}px`;
            this.selectedNode.style.top = `${newY}px`;
            this.updateConnectionsForNode(this.selectedNode);
        } else if (this.connectingSocketInfo) {
            this.updateTempConnectionLine(e);
        } else if (this.isBoxSelecting) {
            const pos = this.getMousePositionInCanvasSpace(e);
            const left = Math.min(this.boxSelectStart.x, pos.x);
            const top = Math.min(this.boxSelectStart.y, pos.y);
            const width = Math.abs(pos.x - this.boxSelectStart.x);
            const height = Math.abs(pos.y - this.boxSelectStart.y);
            
            this.boxSelectElement.style.left = `${left}px`;
            this.boxSelectElement.style.top = `${top}px`;
            this.boxSelectElement.style.width = `${width}px`;
            this.boxSelectElement.style.height = `${height}px`;
        }
    }

    handleDocumentMouseUp(e) {
        if (this.isPanning) { 
            this.isPanning = false; 
            this.canvas.style.cursor = 'grab'; 
        }
        if (this.isDraggingNode) { 
            this.isDraggingNode = false; 
        }
        if (this.connectingSocketInfo) {
            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.node-socket');
            if (target) this.tryEndConnection(target);
            this.clearTempConnection();
        }
        if (this.isBoxSelecting) {
            this.isBoxSelecting = false;
            this.boxSelectElement.style.display = 'none';
            
            // Select nodes within the box
            const rect = this.boxSelectElement.getBoundingClientRect();
            this.nodesContainer.querySelectorAll('.node').forEach(node => {
                const nodeRect = node.getBoundingClientRect();
                if (nodeRect.right > rect.left && nodeRect.left < rect.right &&
                    nodeRect.bottom > rect.top && nodeRect.top < rect.bottom) {
                    node.classList.add('selected');
                    this.selectedNode = node;
                }
            });
        }
    }

    handleNodesContainerMouseDown(e) {
        const target = e.target;
        const node = target.closest('.node');
        if (node && !target.closest('input, select, button, .node-socket, textarea')) {
            e.stopPropagation();
            if (!node.classList.contains('selected')) {
                this.deselectAll();
                this.selectedNode = node;
                node.classList.add('selected');
            }
            if (this.selectedNode === node) {
                this.isDraggingNode = true;
                this.selectedNodeStartPos = { x: parseFloat(node.style.left || 0), y: parseFloat(node.style.top || 0) };
                this.dragStartMousePos = { x: e.clientX, y: e.clientY };
                this.nodesContainer.appendChild(node);
            }
        } else if (target.classList.contains('node-socket')) {
            e.stopPropagation();
            this.startDraggingConnection(target);
        }
    }

    handleKeyDown(e) {
        if (document.activeElement?.matches('input, textarea')) { 
            if (e.key === 'Escape') document.activeElement.blur(); 
            return; 
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedNode) this.deleteNode(this.selectedNode);
            new Set(this.selectedConnections).forEach(c => this.deleteConnection(c));
        }
        if (e.key === 'Escape') {
            this.clearTempConnection();
            this.deselectAll();
        }
        if (e.key === 'g' && this.selectedNode) {
            // Group selected nodes
            this.createNodeGroup([this.selectedNode]);
        }
    }

    generateNodeContent(type) {
        const template = this.nodeTemplates.get(type);
        if (!template) return '';

        let html = `
            <div class="node-title">${template.title}</div>
            <div class="node-sockets">
                <div class="node-inputs">
                    ${template.inputs.map(input => `
                        <div class="node-socket input" 
                             data-socket-type="input" 
                             data-socket-name="${input.name}"
                             data-data-type="${input.type}"
                             title="${input.label}">
                            <div class="socket-indicator"></div>
                            <div class="socket-label">${input.label}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="node-outputs">
                    ${template.outputs.map(output => `
                        <div class="node-socket output" 
                             data-socket-type="output" 
                             data-socket-name="${output.name}"
                             data-data-type="${output.type}"
                             title="${output.label}">
                            <div class="socket-label">${output.label}</div>
                            <div class="socket-indicator"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="node-content">
        `;

        template.properties.forEach((p, i) => {
            const id = `${type}-${i}`;
            const show = p.showWhen ? `data-show-when="${p.showWhen}"` : (p.showWhenNot ? `data-show-when-not="${p.showWhenNot}"` : '');
            let input = '';

            switch(p.type) {
                case 'select':
                    input = `
                        <select id="${id}" name="${p.name}">
                            ${p.options.map(o => `
                                <option value="${o.toLowerCase()}" ${o.toLowerCase() === (p.default || '').toLowerCase() ? 'selected' : ''}>
                                    ${o}
                                </option>
                            `).join('')}
                        </select>
                    `;
                    break;
                case 'range':
                    const v = parseFloat(p.default);
                    const s = p.step || 0.01;
                    const pr = s.toString().includes('.') ? s.toString().split('.')[1].length : 2;
                    input = `
                        <input type="range" id="${id}" name="${p.name}" 
                               min="${p.min || 0}" max="${p.max || 1}" 
                               step="${s}" value="${v}">
                        <span class="value-display">${v.toFixed(pr)}</span>
                    `;
                    break;
                case 'checkbox':
                    input = `<input type="checkbox" id="${id}" name="${p.name}" ${p.default ? 'checked' : ''}>`;
                    break;
                case 'vector3':
                    const d = p.default;
                    input = `
                        <div class="vector3-input-group">
                            <input type="number" name="${p.name}_x" value="${d.x}" step=".1">
                            <input type="number" name="${p.name}_y" value="${d.y}" step=".1">
                            <input type="number" name="${p.name}_z" value="${d.z}" step=".1">
                        </div>
                    `;
                    break;
                case 'color':
                    input = `<input type="color" id="${id}" name="${p.name}" value="${p.default || '#ffffff'}">`;
                    break;
                default:
                    input = `<input type="${p.type}" id="${id}" name="${p.name}" value="${p.default || ''}">`;
            }

            html += `
                <div class="node-property" ${show}>
                    <label for="${id}">${p.label}</label>
                    ${input}
                </div>
            `;
        });

        return html + `</div>`;
    }

    updatePropertyVisibility(node) {
        const selectedValues = {};
        node.querySelectorAll('select[name="type"]').forEach(s => { 
            selectedValues[s.name] = s.value; 
        });
        
        node.querySelectorAll('.node-property').forEach(d => {
            const show = d.dataset.showWhen;
            const hide = d.dataset.showWhenNot;
            let visible = true;
            
            if (show) {
                visible = show.split(',').every(c => { 
                    const [f, v] = c.split('='); 
                    return selectedValues[f] === v; 
                });
            }
            
            if (hide) {
                visible = !hide.split(',').some(c => { 
                    const [f, v] = c.split('='); 
                    return selectedValues[f] === v; 
                });
            }
            
            d.style.display = visible ? '' : 'none';
        });
    }

    linkNodeToSceneObject(node, obj) {
        const data = this.nodes.get(node);
        if (data) {
            data.object = obj;
            if (data.properties.name) obj.name = data.properties.name;
            this.applyNodePropertiesToSceneObject(node, obj);
        }
    }

    applyNodePropertiesToSceneObject(node, obj) {
        const data = this.nodes.get(node); 
        if (!data || !obj) return;
        
        const props = data.properties;
        if (props.name !== undefined) obj.name = props.name;
        if (props.visible !== undefined) obj.visible = props.visible;
        
        if (props.position) {
            obj.position.set(
                props.position.x || 0,
                props.position.y || 0,
                props.position.z || 0
            );
        }
        
        if (props.rotation) {
            obj.rotation.set(
                THREE.MathUtils.degToRad(props.rotation.x || 0),
                THREE.MathUtils.degToRad(props.rotation.y || 0),
                THREE.MathUtils.degToRad(props.rotation.z || 0)
            );
        }
        
        if (props.scale) {
            obj.scale.set(
                props.scale.x || 1,
                props.scale.y || 1,
                props.scale.z || 1
            );
        }
        
        if (data.type === 'material' && obj.material) {
            const mat = obj.material;
            if (props.color) mat.color = new THREE.Color(props.color);
            if (props.metalness !== undefined && mat.metalness !== undefined) mat.metalness = props.metalness;
            if (props.roughness !== undefined && mat.roughness !== undefined) mat.roughness = props.roughness;
            if (props.shininess !== undefined && mat.shininess !== undefined) mat.shininess = props.shininess;
            if (mat.needsUpdate !== undefined) mat.needsUpdate = true;
        } else if (data.type === 'light' && obj.isLight) {
            if (props.color) obj.color = new THREE.Color(props.color);
            if (props.intensity !== undefined) obj.intensity = props.intensity;
            if (props.castShadow !== undefined && obj.castShadow !== undefined) obj.castShadow = props.castShadow;
        }
    }

    addNode(type, x, y) {
        const node = document.createElement('div');
        node.className = 'node';
        node.dataset.nodeType = type;
        node.innerHTML = this.generateNodeContent(type);
        
        const dx = x !== undefined ? x : (this.canvas.offsetWidth / 2 - 100 - this.viewportX) / this.scale;
        const dy = y !== undefined ? y : (this.canvas.offsetHeight / 2 - 75 - this.viewportY) / this.scale;
        
        node.style.left = `${dx}px`;
        node.style.top = `${dy}px`;
        this.nodesContainer.appendChild(node);
        
        const id = `${type}_${Date.now()}`;
        const props = this.getNodeProperties(node);
        const data = { 
            id, 
            type, 
            properties: props, 
            object: null,
            template: this.nodeTemplates.get(type) 
        };
        
        this.nodes.set(node, data);

        // Add event listeners to inputs
        node.querySelectorAll('input, select').forEach(input => {
            const event = (input.type.match(/range|color|text/)) ? 'input' : 'change';
            input.addEventListener(event, () => {
                this.updateNodeProperties(node);
                if (data.object) this.applyNodePropertiesToSceneObject(node, data.object);
                this.updateConnectedNodesAndEffects(node);
                
                if (input.type === 'range') {
                    input.nextElementSibling.textContent = parseFloat(input.value).toFixed(2);
                }
                
                if (input.name === 'type') {
                    this.updatePropertyVisibility(node);
                    this.updateConnectedNodesAndEffects(node);
                }
            });
        });

        this.updatePropertyVisibility(node);

        // Create associated Three.js object if needed
        const template = this.nodeTemplates.get(type);
        if (template && template.createObject) {
            const obj = template.createObject(node, props);
            this.linkNodeToSceneObject(node, obj);
            
            if (this.scene) {
                this.scene.add(obj);
                if (typeof window.addObjectToTimeline === 'function') {
                    window.addObjectToTimeline(obj);
                }
            }
        }

        return node;
    }

    updateNodeProperties(node) {
        const data = this.nodes.get(node);
        if (data) {
            data.properties = this.getNodeProperties(node);
        }
    }

    updateConnectedNodesAndEffects(sourceNode) {
        this.connections.forEach(conn => {
            if (conn.sourceNode === sourceNode) {
                const targetNode = conn.targetNode;
                const sourceData = this.nodes.get(sourceNode);
                const targetData = this.nodes.get(targetNode);
                
                if (!sourceData || !targetData || !targetData.object) return;
                
                const sourceType = sourceData.type;
                const targetType = targetData.type;

                if (sourceType === 'effect' && targetType === 'object') {
                    this.applyOrUpdateNodeEffect(sourceNode, targetData.object);
                } else if (sourceType === 'material' && targetType === 'object') {
                    this.applyNodePropertiesToSceneObject(sourceNode, targetData.object);
                } else if (sourceType === 'transform' && targetType === 'object') {
                    this.applyNodePropertiesToSceneObject(sourceNode, targetData.object);
                } else if (sourceType === 'physics' && targetType === 'object') {
                    // Placeholder for physics logic
                    console.log("Applying Physics properties from", sourceData.id, "to", targetData.id);
                } else if (sourceType === 'animation' && targetType === 'object') {
                    // Placeholder for animation logic
                    console.log("Applying Animation properties from", sourceData.id, "to", targetData.id);
                }
            }
        });
    }

    deleteNode(node) {
        // Remove all connections to/from this node
        Array.from(this.connections)
            .filter(c => c.sourceNode === node || c.targetNode === node)
            .forEach(c => this.deleteConnection(c));
        
        const data = this.nodes.get(node);
        if (data) {
            // Clean up effects
            if (data.type === 'effect') {
                this.nodeEffects.forEach((eff, obj) => { 
                    if (eff.sourceEffectNode === node) { 
                        eff.cleanup(); 
                        this.nodeEffects.delete(obj); 
                    } 
                });
            }
            
            // Clean up Three.js objects
            if (data.object) {
                if (this.nodeEffects.has(data.object)) { 
                    this.nodeEffects.get(data.object).cleanup(); 
                    this.nodeEffects.delete(data.object); 
                }
                
                if (data.object.parent) {
                    data.object.parent.remove(data.object);
                }
                
                if (data.object.geometry) {
                    data.object.geometry.dispose();
                }
                
                if (data.object.material) {
                    if (Array.isArray(data.object.material)) {
                        data.object.material.forEach(m => m.dispose());
                    } else {
                        data.object.material.dispose();
                    }
                }
            }
        }
        
        if (this.selectedNode === node) {
            this.selectedNode = null;
        }
        
        this.nodes.delete(node);
        node.remove();
    }

    startDraggingConnection(socket) {
        const pos = this.getConnectionEndpoint(socket);
        this.connectingSocketInfo = { 
            socketElement: socket, 
            isOutput: socket.classList.contains('output'), 
            startX: pos.x, 
            startY: pos.y 
        };
        
        this.tempConnectionLine.setAttribute('d', `M ${pos.x},${pos.y} L ${pos.x},${pos.y}`);
        this.tempConnectionLine.style.display = 'block';
    }

    updateTempConnectionLine(e) {
        if (!this.connectingSocketInfo) return;
        
        const endPos = this.getMousePositionInCanvasSpace(e);
        const startX = this.connectingSocketInfo.startX;
        const startY = this.connectingSocketInfo.startY;
        
        const c = Math.max(30, Math.min(150, Math.abs(endPos.x - startX) * 0.4));
        this.tempConnectionLine.setAttribute('d', 
            `M ${startX},${startY} C ${startX + c},${startY} ${endPos.x - c},${endPos.y} ${endPos.x},${endPos.y}`);
    }

    clearTempConnection() {
        this.connectingSocketInfo = null;
        this.tempConnectionLine.style.display = 'none';
        this.canvas.querySelectorAll('.valid-target').forEach(s => s.classList.remove('valid-target'));
    }

    tryEndConnection(endSocket) {
        if (!this.connectingSocketInfo) return;
        
        const startSocket = this.connectingSocketInfo.socketElement;
        if (this.isValidConnectionTarget(startSocket, endSocket)) {
            const finalStart = this.connectingSocketInfo.isOutput ? startSocket : endSocket;
            const finalEnd = this.connectingSocketInfo.isOutput ? endSocket : startSocket;
            
            if (!Array.from(this.connections).some(c => c.startSocket === finalStart && c.endSocket === finalEnd)) {
                const conn = new NodeConnection(finalStart, finalEnd, this);
                this.connections.add(conn);
                this.updateConnectedNodesAndEffects(finalStart.closest('.node'));
                
                finalStart.classList.add('connected');
                finalEnd.classList.add('connected');
            }
        }
        
        this.clearTempConnection();
    }

    isValidConnectionTarget(start, end) {
        if (!start || !end || start === end) return false;
        if (start.closest('.node') === end.closest('.node')) return false;
        
        const startIsOutput = start.classList.contains('output');
        const endIsInput = end.classList.contains('input');
        
        if (!(startIsOutput && endIsInput)) return false;
        
        // Check data type compatibility
        const startType = start.dataset.dataType;
        const endType = end.dataset.dataType;
        
        if (startType && endType && startType !== endType) {
            // Check if types are compatible (e.g., color can connect to vector3)
            const compatibleTypes = {
                'color': ['vector3'],
                'vector3': ['color'],
                'number': ['float', 'int'],
                'float': ['number', 'int'],
                'int': ['number', 'float']
            };
            
            if (!(compatibleTypes[startType]?.includes(endType) || 
                compatibleTypes[endType]?.includes(startType))) {
                   return false;
                }
        }
        
        return true;
    }

    getConnectionEndpoint(socket) {
        const cRect = this.canvas.getBoundingClientRect();
        const sRect = socket.getBoundingClientRect();
        
        const x = (sRect.left + sRect.width / 2 - cRect.left - this.viewportX) / this.scale;
        const y = (sRect.top + sRect.height / 2 - cRect.top - this.viewportY) / this.scale;
        
        return { x, y };
    }

    updateAllConnections() {
        this.connections.forEach(c => c.update());
    }

    updateConnectionsForNode(node) {
        this.connections.forEach(c => {
            if (c.sourceNode === node || c.targetNode === node) {
                c.update();
            }
        });
    }

    selectConnection(conn) {
        if (!conn) return;
        
        this.deselectAll();
        conn.setSelected(true);
        this.selectedConnections.add(conn);
    }

    deleteConnection(conn) {
        if (!conn) return;
        
        if (conn.startSocket) {
            conn.startSocket.classList.remove('connected');
        }
        
        if (conn.endSocket) {
            conn.endSocket.classList.remove('connected');
        }
        
        conn.remove();
        this.connections.delete(conn);
        this.selectedConnections.delete(conn);
    }

    deselectAll() {
        if (this.selectedNode) { 
            this.selectedNode.classList.remove('selected'); 
            this.selectedNode = null; 
        }
        
        this.selectedConnections.forEach(c => c.setSelected(false));
        this.selectedConnections.clear();
    }

    getMousePositionInCanvasSpace(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { 
            x: (e.clientX - rect.left - this.viewportX) / this.scale, 
            y: (e.clientY - rect.top - this.viewportY) / this.scale 
        };
    }

    applyOrUpdateNodeEffect(effectNode, targetObject) {
        const props = this.getNodeProperties(effectNode);
        const type = props.type ? props.type.toLowerCase() : null;
        let effect = this.nodeEffects.get(targetObject);
        let newInstance = !effect;

        if (effect) {
            const instanceType = (effect.constructor.name.replace('Effect', '')).toLowerCase();
            if (instanceType !== type) {
                effect.cleanup();
                this.nodeEffects.delete(targetObject);
                effect = null;
                newInstance = true;
            }
        }
        
        if (newInstance && type) {
            const opts = { ...props, sceneInstance: this.scene, cameraInstance: this.camera };
            
            switch (type) {
                case 'water': 
                    effect = new WaterEffect(targetObject, opts); 
                    break;
                case 'particles': 
                    effect = new ParticleEffect(targetObject, opts); 
                    break;
                case 'trail': 
                    effect = new TrailEffect(targetObject, opts); 
                    break;
                case 'glow': 
                    effect = new GlowEffect(targetObject, opts); 
                    break;
                default: 
                    return;
            }
            
            if (effect) {
                effect.sourceEffectNode = effectNode;
                this.nodeEffects.set(targetObject, effect);
            }
        } else if (effect) {
            effect.setProperties(props);
        } else if (!type && effect) {
            effect.cleanup();
            this.nodeEffects.delete(targetObject);
        }
    }

    update(deltaTime) {
        this.nodeEffects.forEach((effect) => {
            if (effect?.update) {
                effect.update(deltaTime);
            }
        });
    }

    getNodeProperties(node) {
        const props = {};
        
        node.querySelectorAll('input, select').forEach(i => {
            const name = i.name;
            let value;
            
            if (name.startsWith(name.split('_')[0] + "_")) {
                const base = name.split('_')[0];
                if (!props[base]) props[base] = {};
                props[base][name.split('_')[1]] = parseFloat(i.value) || 0;
            } else {
                switch(i.type) {
                    case 'checkbox': 
                        value = i.checked; 
                        break;
                    case 'number': 
                    case 'range': 
                        value = parseFloat(i.value); 
                        break;
                    default: 
                        value = i.value;
                }
                props[name] = value;
            }
        });
        
        return props;
    }

    updateNodeUI(node) {
        const data = this.nodes.get(node);
        if (!data?.properties) return;
        
        const props = data.properties;
        node.querySelectorAll('input, select').forEach(input => {
            let value;
            const name = input.name;
            
            if (name.includes('_x') || name.includes('_y') || name.includes('_z')) {
                const base = name.substring(0, name.lastIndexOf('_'));
                const comp = name.substring(name.lastIndexOf('_') + 1);
                if (props[base]?.[comp] !== undefined) {
                    value = props[base][comp];
                }
            } else if (props[name] !== undefined) {
                value = props[name];
            }

            if (value !== undefined) {
                if (input.type === 'checkbox') {
                    input.checked = Boolean(value);
                } else {
                    input.value = value;
                }
                
                if (input.type === 'range' && input.nextElementSibling) {
                    const step = parseFloat(input.step) || 0.01;
                    const prec = step.toString().includes('.') ? step.toString().split('.')[1].length : 2;
                    input.nextElementSibling.textContent = parseFloat(value).toFixed(prec);
                }
            }
        });
        
        this.updatePropertyVisibility(node);
    }

    createNodeGroup(nodes) {
        if (!nodes || nodes.length === 0) return;
        
        const group = document.createElement('div');
        group.className = 'node-group';
        
        // Calculate group bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        nodes.forEach(node => {
            const rect = node.getBoundingClientRect();
            minX = Math.min(minX, rect.left);
            minY = Math.min(minY, rect.top);
            maxX = Math.max(maxX, rect.right);
            maxY = Math.max(maxY, rect.bottom);
            
            // Move node into group
            const relativeLeft = rect.left - minX;
            const relativeTop = rect.top - minY;
            node.style.position = 'absolute';
            node.style.left = `${relativeLeft}px`;
            node.style.top = `${relativeTop}px`;
            group.appendChild(node);
        });
        
        // Position group
        const groupWidth = maxX - minX;
        const groupHeight = maxY - minY;
        
        group.style.width = `${groupWidth}px`;
        group.style.height = `${groupHeight}px`;
        group.style.left = `${minX}px`;
        group.style.top = `${minY}px`;
        
        this.nodesContainer.appendChild(group);
        
        // Store group reference
        const groupId = `group_${Date.now()}`;
        this.nodeGroups.set(groupId, {
            element: group,
            nodes: nodes,
            position: { x: minX, y: minY }
        });
        
        return group;
    }
}

// Effect Classes (complete implementations)
class WaterEffect {
    constructor(targetObject, options = {}) {
        this.target = targetObject;
        this.options = {
            flowRate: 1.0,
            waterOpacity: 0.9,
            rippleStrength: 0.1,
            waterColor: '#003f5e',
            foamColor: '#e6f2ff',
            foamThreshold: 0.6,
            ...options
        };
        
        this.initEffect();
    }
    
    initEffect() {
        this.waterGeometry = this.createWaterGeometry();
        this.waterMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                flowRate: { value: this.options.flowRate },
                opacity: { value: this.options.waterOpacity },
                rippleStrength: { value: this.options.rippleStrength },
                waterColor: { value: new THREE.Color(this.options.waterColor) },
                foamColor: { value: new THREE.Color(this.options.foamColor) },
                foamThreshold: { value: this.options.foamThreshold }
            },
            vertexShader: this.getWaterVertexShader(),
            fragmentShader: this.getWaterFragmentShader(),
            transparent: true,
            side: THREE.DoubleSide
        });
        
        this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
        this.waterMesh.position.copy(this.target.position);
        this.waterMesh.rotation.copy(this.target.rotation);
        this.waterMesh.scale.copy(this.target.scale);
        this.waterMesh.visible = this.target.visible;
        
        if (this.target.parent) {
            this.target.parent.add(this.waterMesh);
        } else {
            this.target.add(this.waterMesh);
        }
    }
    
    createWaterGeometry() {
        if (this.target.isMesh) {
            return this.target.geometry.clone();
        }
        return new THREE.PlaneGeometry(1, 1, 32, 32);
    }
    
    getWaterVertexShader() {
        return `
            uniform float time;
            uniform float flowRate;
            uniform float rippleStrength;
            
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                vUv = uv;
                vPosition = position;
                vNormal = normal;
                
                // Simple wave animation
                float wave = sin(position.x * 10.0 + time * flowRate) * 
                            cos(position.y * 10.0 + time * flowRate * 0.7) * 
                            rippleStrength;
                
                vec3 newPosition = position + normal * wave;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `;
    }
    
    getWaterFragmentShader() {
        return `
            uniform vec3 waterColor;
            uniform vec3 foamColor;
            uniform float foamThreshold;
            uniform float opacity;
            
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                // Create foam pattern based on wave height
                float foam = smoothstep(foamThreshold - 0.1, foamThreshold + 0.1, 
                                      abs(sin(vPosition.x * 20.0) * abs(cos(vPosition.y * 20.0)));
                
                vec3 color = mix(waterColor, foamColor, foam);
                gl_FragColor = vec4(color, opacity);
            }
        `;
    }
    
    update(deltaTime) {
        if (this.waterMaterial) {
            this.waterMaterial.uniforms.time.value += deltaTime * this.options.flowRate;
            
            if (this.waterMesh) {
                this.waterMesh.position.copy(this.target.position);
                this.waterMesh.rotation.copy(this.target.rotation);
                this.waterMesh.scale.copy(this.target.scale);
                this.waterMesh.visible = this.target.visible;
            }
        }
    }
    
    setProperties(props) {
        this.options = { ...this.options, ...props };
        
        if (this.waterMaterial) {
            this.waterMaterial.uniforms.flowRate.value = this.options.flowRate;
            this.waterMaterial.uniforms.opacity.value = this.options.waterOpacity;
            this.waterMaterial.uniforms.rippleStrength.value = this.options.rippleStrength;
            this.waterMaterial.uniforms.waterColor.value.set(this.options.waterColor);
            this.waterMaterial.uniforms.foamColor.value.set(this.options.foamColor);
            this.waterMaterial.uniforms.foamThreshold.value = this.options.foamThreshold;
        }
    }
    
    cleanup() {
        if (this.waterMesh && this.waterMesh.parent) {
            this.waterMesh.parent.remove(this.waterMesh);
        }
        if (this.waterMaterial) {
            this.waterMaterial.dispose();
        }
        if (this.waterGeometry) {
            this.waterGeometry.dispose();
        }
    }
}

class ParticleEffect {
    constructor(targetObject, options = {}) {
        this.target = targetObject;
        this.options = {
            particleColor: '#ffffff',
            particleSize: 0.1,
            particleSpeed: 1.0,
            particleLifetime: 2.0,
            particleGravity: 0.0,
            particleTurbulence: 0.2,
            emissionRate: 10,
            ...options
        };
        
        this.particles = [];
        this.particleGeometry = new THREE.BufferGeometry();
        this.particleMaterial = new THREE.PointsMaterial({
            color: new THREE.Color(this.options.particleColor),
            size: this.options.particleSize,
            transparent: true,
            opacity: 0.8
        });
        
        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.target.parent.add(this.particleSystem);
        
        this.lastEmissionTime = 0;
    }
    
    update(deltaTime) {
        // Emit new particles
        const now = performance.now();
        if (now - this.lastEmissionTime > 1000 / this.options.emissionRate) {
            this.emitParticle();
            this.lastEmissionTime = now;
        }
        
        // Update existing particles
        this.particles.forEach((p, i) => {
            p.age += deltaTime;
            p.velocity.y -= this.options.particleGravity * deltaTime;
            
            // Apply turbulence
            p.velocity.x += (Math.random() - 0.5) * this.options.particleTurbulence;
            p.velocity.z += (Math.random() - 0.5) * this.options.particleTurbulence;
            
            p.position.x += p.velocity.x * deltaTime;
            p.position.y += p.velocity.y * deltaTime;
            p.position.z += p.velocity.z * deltaTime;
            
            // Remove dead particles
            if (p.age > this.options.particleLifetime) {
                this.particles.splice(i, 1);
            }
        });
        
        // Update geometry
        const positions = new Float32Array(this.particles.length * 3);
        this.particles.forEach((p, i) => {
            positions[i * 3] = p.position.x;
            positions[i * 3 + 1] = p.position.y;
            positions[i * 3 + 2] = p.position.z;
        });
        
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.attributes.position.needsUpdate = true;
        
        // Position system relative to target
        this.particleSystem.position.copy(this.target.position);
    }
    
    emitParticle() {
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * this.options.particleSpeed,
            Math.random() * this.options.particleSpeed * 0.5,
            (Math.random() - 0.5) * this.options.particleSpeed
        );
        
        this.particles.push({
            position: new THREE.Vector3(0, 0, 0),
            velocity: velocity,
            age: 0
        });
    }
    
    setProperties(props) {
        this.options = { ...this.options, ...props };
        
        if (this.particleMaterial) {
            this.particleMaterial.color.set(this.options.particleColor);
            this.particleMaterial.size = this.options.particleSize;
        }
    }
    
    cleanup() {
        if (this.particleSystem && this.particleSystem.parent) {
            this.particleSystem.parent.remove(this.particleSystem);
        }
        if (this.particleMaterial) {
            this.particleMaterial.dispose();
        }
        if (this.particleGeometry) {
            this.particleGeometry.dispose();
        }
    }
}

class TrailEffect {
    constructor(targetObject, options = {}) {
        this.target = targetObject;
        this.options = {
            trailColor: '#00ffff',
            trailLength: 50,
            trailWidth: 0.1,
            fadeSpeed: 0.1,
            ...options
        };
        
        this.trailPoints = [];
        this.trailGeometry = new THREE.BufferGeometry();
        this.trailMaterial = new THREE.LineBasicMaterial({
            color: new THREE.Color(this.options.trailColor),
            linewidth: this.options.trailWidth
        });
        
        this.trailLine = new THREE.Line(this.trailGeometry, this.trailMaterial);
        this.target.parent.add(this.trailLine);
    }
    
    update(deltaTime) {
        // Add current position to trail
        this.trailPoints.push(this.target.position.clone());
        
        // Limit trail length
        if (this.trailPoints.length > this.options.trailLength) {
            this.trailPoints.shift();
        }
        
        // Update geometry
        const positions = new Float32Array(this.trailPoints.length * 3);
        this.trailPoints.forEach((p, i) => {
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
        });
        
        this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.trailGeometry.attributes.position.needsUpdate = true;
    }
    
    setProperties(props) {
        this.options = { ...this.options, ...props };
        
        if (this.trailMaterial) {
            this.trailMaterial.color.set(this.options.trailColor);
            this.trailMaterial.linewidth = this.options.trailWidth;
        }
    }
    
    cleanup() {
        if (this.trailLine && this.trailLine.parent) {
            this.trailLine.parent.remove(this.trailLine);
        }
        if (this.trailMaterial) {
            this.trailMaterial.dispose();
        }
        if (this.trailGeometry) {
            this.trailGeometry.dispose();
        }
    }
}

class GlowEffect {
    constructor(targetObject, options = {}) {
        this.target = targetObject;
        this.options = {
            glowColor: '#00ffff',
            glowScale: 1.05,
            glowIntensity: 1.0,
            glowFalloff: 0.5,
            ...options
        };
        
        this.glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(this.options.glowColor) },
                glowIntensity: { value: this.options.glowIntensity },
                glowFalloff: { value: this.options.glowFalloff }
            },
            vertexShader: this.getGlowVertexShader(),
            fragmentShader: this.getGlowFragmentShader(),
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        
        this.glowMesh = this.target.clone();
        this.glowMesh.material = this.glowMaterial;
        this.glowMesh.scale.multiplyScalar(this.options.glowScale);
        this.target.parent.add(this.glowMesh);
    }
    
    getGlowVertexShader() {
        return `
            varying vec3 vNormal;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
    }
    
    getGlowFragmentShader() {
        return `
            uniform vec3 glowColor;
            uniform float glowIntensity;
            uniform float glowFalloff;
            
            varying vec3 vNormal;
            
            void main() {
                float intensity = pow(glowFalloff - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), glowIntensity);
                gl_FragColor = vec4(glowColor, intensity);
            }
        `;
    }
    
    update() {
        this.glowMesh.position.copy(this.target.position);
        this.glowMesh.rotation.copy(this.target.rotation);
        this.glowMesh.scale.copy(this.target.scale).multiplyScalar(this.options.glowScale);
        this.glowMesh.visible = this.target.visible;
    }
    
    setProperties(props) {
        this.options = { ...this.options, ...props };
        
        if (this.glowMaterial) {
            this.glowMaterial.uniforms.glowColor.value.set(this.options.glowColor);
            this.glowMaterial.uniforms.glowIntensity.value = this.options.glowIntensity;
            this.glowMaterial.uniforms.glowFalloff.value = this.options.glowFalloff;
        }
    }
    
    cleanup() {
        if (this.glowMesh && this.glowMesh.parent) {
            this.glowMesh.parent.remove(this.glowMesh);
        }
        if (this.glowMaterial) {
            this.glowMaterial.dispose();
        }
    }
}