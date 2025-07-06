class AnimatorSystem {
    constructor(scene) {
        this.scene = scene;
        this.ui = {
            panel: document.getElementById('animator-panel'),
            toggleBtn: document.getElementById('toggle-animator-btn'),
            targetSelect: document.getElementById('animator-target-select'),
            addStateBtn: document.getElementById('add-state-btn'),
            graphContainer: document.getElementById('animator-graph-container'),
            svgLayer: document.getElementById('animator-svg-layer'),
            propertiesPanel: document.getElementById('animator-properties-panel'),
            propertiesContent: document.getElementById('properties-content'),
        };

        this.currentTarget = null;
        this.nodes = [];
        this.transitions = [];
        this.activeStateNode = null;
        this.selectedObject = null; // Can be a node or a transition

        // Parameters are set by external controllers (like the player)
        this.parameters = {
            speed: 0,
            isGrounded: true
        };

        // For linking and dragging
        this.draggedNode = null;
        this.offset = { x: 0, y: 0 };
        this.isLinking = false;
        this.linkStartNode = null;
        this.tempLinkPath = null;
    }

    init() {
        // Create SVG definitions for arrowheads
        this.ui.svgLayer.innerHTML = `
            <defs>
                <marker id="arrow-marker" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#888"></path>
                </marker>
                <marker id="arrow-marker-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb86c"></path>
                </marker>
            </defs>
        `;

        this.ui.toggleBtn.addEventListener('click', () => this.togglePanel());
        this.ui.addStateBtn.addEventListener('click', () => this.addStateNode('New State'));
        this.ui.targetSelect.addEventListener('change', (e) => this.setTarget(e.target.value));

        this.ui.graphContainer.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.ui.graphContainer.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e)); // Listen on document
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isLinking) this.cancelLinking();
        });
    }

    // --- Core State Machine Logic ---

    setParameter(name, value) {
        this.parameters[name] = value;
    }

    evaluateTransitions() {
        if (!this.activeStateNode) return;

        // Find all transitions leaving the current active node
        const outgoingTransitions = this.transitions.filter(t => t.fromNodeId === this.activeStateNode.id);

        for (const transition of outgoingTransitions) {
            let allConditionsMet = true;
            if (transition.conditions.length === 0) {
                 allConditionsMet = false; // Don't fire transitions with no conditions
            }
            
            for (const condition of transition.conditions) {
                const paramValue = this.parameters[condition.parameter];
                if (paramValue === undefined) {
                    allConditionsMet = false;
                    break;
                }

                const conditionValue = parseFloat(condition.value);
                let conditionMet = false;
                switch (condition.comparison) {
                    case 'greaterThan': conditionMet = paramValue > conditionValue; break;
                    case 'lessThan':    conditionMet = paramValue < conditionValue; break;
                    case 'equals':      conditionMet = paramValue == conditionValue; break; // Use == for boolean/number flexibility
                }
                
                if (!conditionMet) {
                    allConditionsMet = false;
                    break;
                }
            }
            
            if (allConditionsMet) {
                const targetNode = this.nodes.find(n => n.id === transition.toNodeId);
                if (targetNode) {
                    this.setActiveState(targetNode);
                    return; // Exit after firing one transition per frame
                }
            }
        }
    }

    setActiveState(node) {
        if (this.activeStateNode === node) return;

        const oldAction = this.activeStateNode ? this.activeStateNode.action : null;
        if (oldAction) {
            oldAction.fadeOut(0.3);
        }

        if (this.activeStateNode) {
            this.activeStateNode.domElement.classList.remove('active-state');
        }
        this.activeStateNode = node;
        this.activeStateNode.domElement.classList.add('active-state');
        
        const newAction = this.activeStateNode.action;
        if (newAction) {
            newAction.reset().setEffectiveWeight(1).fadeIn(0.3).play();
        }
    }
    
    update(delta) {
        if (!this.currentTarget || !this.currentTarget.userData.mixer) return;
        
        this.evaluateTransitions();
        this.currentTarget.userData.mixer.update(delta);
    }
    
    // --- UI and Interaction Logic ---

    onMouseDown(e) {
        this.deselectAll();

        // Check for click on a transition path
        if (e.target.classList.contains('transition-path')) {
            const transitionId = e.target.dataset.transitionId;
            const transition = this.transitions.find(t => t.id === transitionId);
            this.selectObject(transition);
            return;
        }

        // Check for click on a node
        const nodeElement = e.target.closest('.animator-node');
        if (nodeElement) {
            const nodeId = nodeElement.dataset.nodeId;
            const node = this.nodes.find(n => n.id === nodeId);
            
            if (e.shiftKey) { // START LINKING
                this.startLinking(node);
            } else { // START DRAGGING
                this.draggedNode = node;
                node.domElement.style.cursor = 'grabbing';
                const rect = node.domElement.getBoundingClientRect();
                const containerRect = this.ui.graphContainer.getBoundingClientRect();
                this.offset.x = e.clientX - rect.left + containerRect.left;
                this.offset.y = e.clientY - rect.top + containerRect.top;
                this.selectObject(node);
            }
        }
    }

    onMouseMove(e) {
        if (this.draggedNode) {
            e.preventDefault();
            const newX = e.clientX - this.offset.x;
            const newY = e.clientY - this.offset.y;
            this.draggedNode.domElement.style.left = `${newX}px`;
            this.draggedNode.domElement.style.top = `${newY}px`;
            this.draggedNode.position = { x: newX, y: newY };
            this.updateAllTransitionPaths();
        } else if (this.isLinking) {
            e.preventDefault();
            const containerRect = this.ui.graphContainer.getBoundingClientRect();
            const endX = e.clientX - containerRect.left;
            const endY = e.clientY - containerRect.top;
            const startPos = this.getDOMNodeCenter(this.linkStartNode.domElement);
            this.tempLinkPath.setAttribute('d', `M${startPos.x},${startPos.y} L${endX},${endY}`);
        }
    }

    onMouseUp(e) {
        if (this.draggedNode) {
            this.draggedNode.domElement.style.cursor = 'grab';
            this.draggedNode = null;
        } else if (this.isLinking) {
            const endNodeElement = e.target.closest('.animator-node');
            if (endNodeElement) {
                const endNodeId = endNodeElement.dataset.nodeId;
                const endNode = this.nodes.find(n => n.id === endNodeId);
                if (endNode && endNode !== this.linkStartNode) {
                    this.completeLinking(endNode);
                } else {
                    this.cancelLinking();
                }
            } else {
                this.cancelLinking();
            }
        }
    }

    // --- Linking Methods ---

    startLinking(node) {
        this.isLinking = true;
        this.linkStartNode = node;
        this.tempLinkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.tempLinkPath.setAttribute('class', 'temp-link-path');
        this.ui.svgLayer.appendChild(this.tempLinkPath);
    }

    completeLinking(endNode) {
        // Check if transition already exists
        const exists = this.transitions.some(t => t.fromNodeId === this.linkStartNode.id && t.toNodeId === endNode.id);
        if(!exists) {
            const transition = {
                id: THREE.MathUtils.generateUUID(),
                fromNodeId: this.linkStartNode.id,
                toNodeId: endNode.id,
                conditions: [],
                pathElement: null
            };
            this.transitions.push(transition);
            this.drawTransition(transition);
        }
        this.cancelLinking();
    }
    
    cancelLinking() {
        this.isLinking = false;
        this.linkStartNode = null;
        if (this.tempLinkPath) {
            this.tempLinkPath.remove();
            this.tempLinkPath = null;
        }
    }

    // --- Drawing and UI Update Methods ---
    
    drawTransition(transition) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'transition-path');
        path.dataset.transitionId = transition.id;
        transition.pathElement = path;
        this.ui.svgLayer.appendChild(path);
        
        path.addEventListener('mousedown', (e) => {
            this.onMouseDown(e);
            e.stopPropagation();
        });

        this.updateTransitionPath(transition);
    }

    updateTransitionPath(transition) {
        const fromNode = this.nodes.find(n => n.id === transition.fromNodeId);
        const toNode = this.nodes.find(n => n.id === transition.toNodeId);
        if (!fromNode || !toNode) return;

        const startPos = this.getDOMNodeCenter(fromNode.domElement);
        const endPos = this.getDOMNodeCenter(toNode.domElement);
        
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        
        // Simple quadratic curve for a slight arc
        const controlX = startPos.x + dx / 2 - dy / 4;
        const controlY = startPos.y + dy / 2 + dx / 4;

        transition.pathElement.setAttribute('d', `M${startPos.x},${startPos.y} Q${controlX},${controlY} ${endPos.x},${endPos.y}`);
    }

    updateAllTransitionPaths() {
        this.transitions.forEach(t => this.updateTransitionPath(t));
    }
    
    getDOMNodeCenter(element) {
        return {
            x: element.offsetLeft + element.offsetWidth / 2,
            y: element.offsetTop + element.offsetHeight / 2,
        };
    }

    selectObject(object) {
        this.deselectAll();
        this.selectedObject = object;
        
        if (object.domElement) { // It's a node
            object.domElement.style.borderColor = '#ffb86c';
            this.showNodeProperties(object);
        } else if (object.pathElement) { // It's a transition
            object.pathElement.classList.add('selected');
            object.pathElement.style.markerEnd = 'url(#arrow-marker-selected)';
            this.showTransitionProperties(object);
        }
    }

    deselectAll() {
        this.nodes.forEach(n => n.domElement.style.borderColor = '#8aa3cf');
        this.transitions.forEach(t => {
            t.pathElement.classList.remove('selected');
            t.pathElement.style.markerEnd = 'url(#arrow-marker)';
        });
        this.ui.propertiesContent.innerHTML = 'Select a node or transition to see its properties.';
        this.selectedObject = null;
    }

    showTransitionProperties(transition) {
        let conditionsHTML = '';
        transition.conditions.forEach((cond, index) => {
            conditionsHTML += `
                <div class="condition-row" data-index="${index}">
                    <select class="prop-cond-param">
                        <option value="speed" ${cond.parameter === 'speed' ? 'selected' : ''}>speed</option>
                        <option value="isGrounded" ${cond.parameter === 'isGrounded' ? 'selected' : ''}>isGrounded</option>
                    </select>
                    <select class="prop-cond-comp">
                        <option value="greaterThan" ${cond.comparison === 'greaterThan' ? 'selected' : ''}>></option>
                        <option value="lessThan" ${cond.comparison === 'lessThan' ? 'selected' : ''}><</option>
                        <option value="equals" ${cond.comparison === 'equals' ? 'selected' : ''}>==</option>
                    </select>
                    <input type="number" class="prop-cond-val" value="${cond.value}">
                    <button class="delete-btn" data-index="${index}">-</button>
                </div>
            `;
        });

        this.ui.propertiesContent.innerHTML = `
            <h4>Transition Properties</h4>
            <div id="conditions-list">${conditionsHTML}</div>
            <button id="add-condition-btn">+ Add Condition</button>
        `;

        document.getElementById('add-condition-btn').onclick = () => {
            transition.conditions.push({ parameter: 'speed', comparison: 'greaterThan', value: 0.1 });
            this.showTransitionProperties(transition); // Re-render
        };

        this.ui.propertiesContent.querySelectorAll('.condition-row').forEach(row => {
            const index = parseInt(row.dataset.index);
            row.querySelector('.prop-cond-param').onchange = (e) => transition.conditions[index].parameter = e.target.value;
            row.querySelector('.prop-cond-comp').onchange = (e) => transition.conditions[index].comparison = e.target.value;
            row.querySelector('.prop-cond-val').oninput = (e) => transition.conditions[index].value = e.target.value;
            row.querySelector('.delete-btn').onclick = () => {
                transition.conditions.splice(index, 1);
                this.showTransitionProperties(transition); // Re-render
            };
        });
    }

    // --- Setup and Helper Methods from before ---
    // (addStateNode, populateTargetSelector, setTarget, togglePanel, etc. remain here)
    // I will include them for completeness.

    togglePanel() {
        const isVisible = this.ui.panel.style.display === 'flex';
        this.ui.panel.style.display = isVisible ? 'none' : 'flex';
        this.ui.toggleBtn.textContent = isVisible ? 'Open Animator' : 'Close Animator';
        if (!isVisible) this.populateTargetSelector();
    }
    populateTargetSelector() {
        const currentVal = this.ui.targetSelect.value;
        this.ui.targetSelect.innerHTML = '<option value="">- Select an Object -</option>';
        this.scene.traverse(obj => {
            if (obj.isObject3D && obj.animations && obj.animations.length > 0) {
                const option = document.createElement('option');
                option.value = obj.uuid;
                option.textContent = obj.name || `Object (${obj.type})`;
                this.ui.targetSelect.appendChild(option);
            }
        });
        this.ui.targetSelect.value = currentVal;
    }
    setTarget(uuid) {
        this.clearGraph();
        if (!uuid) { this.currentTarget = null; return; }
        this.currentTarget = this.scene.getObjectByProperty('uuid', uuid);
        if (this.currentTarget && !this.currentTarget.userData.mixer) {
            this.currentTarget.userData.mixer = new THREE.AnimationMixer(this.currentTarget);
        }
        // TODO: Load saved graph here. For now, we create a default entry.
        this.addStateNode('Entry');
    }
    clearGraph() {
        this.nodes.forEach(node => node.domElement.remove());
        this.transitions.forEach(t => t.pathElement.remove());
        this.nodes = [];
        this.transitions = [];
        this.activeStateNode = null;
        this.deselectAll();
    }
    addStateNode(name, pos = { x: 50, y: 50 }) {
        const node = {
            id: THREE.MathUtils.generateUUID(), name, clipName: null, action: null, position: pos,
            domElement: document.createElement('div'),
        };
        node.domElement.className = 'animator-node';
        node.domElement.style.left = `${pos.x}px`;
        node.domElement.style.top = `${pos.y}px`;
        node.domElement.innerHTML = `<div class="animator-node-header">${name}</div><div class="animator-node-clip">(No clip)</div>`;
        node.domElement.dataset.nodeId = node.id;
        this.ui.graphContainer.appendChild(node.domElement);
        this.nodes.push(node);
        if (!this.activeStateNode) this.setActiveState(node);
    }
    showNodeProperties(node) {
        let animationOptions = '<option value="">- Select Animation -</option>';
        if (this.currentTarget && this.currentTarget.animations) {
            this.currentTarget.animations.forEach(clip => {
                const selected = node.clipName === clip.name ? 'selected' : '';
                animationOptions += `<option value="${clip.name}" ${selected}>${clip.name}</option>`;
            });
        }
        this.ui.propertiesContent.innerHTML = `<h4>State Properties</h4><div class="prop-group"><label>State Name</label><input id="prop-name" value="${node.name}"></div><div class="prop-group"><label>Animation Clip</label><select id="prop-clip">${animationOptions}</select></div>`;
        document.getElementById('prop-name').oninput = e => {
            node.name = e.target.value;
            node.domElement.querySelector('.animator-node-header').textContent = node.name;
        };
        document.getElementById('prop-clip').onchange = e => {
            node.clipName = e.target.value;
            node.domElement.querySelector('.animator-node-clip').textContent = `(${node.clipName || 'No clip'})`;
            const clip = this.currentTarget.animations.find(c => c.name === node.clipName);
            if (clip) {
                node.action = this.currentTarget.userData.mixer.clipAction(clip);
                if (this.activeStateNode === node) this.setActiveState(node); // Re-set to play new clip
            } else {
                node.action = null;
            }
        };
    }
}
