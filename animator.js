

class AdvancedAnimationSystem {
     constructor(mainScene, mainCamera) {
        // --- Core Properties (unchanged) ---
        this.mainScene = mainScene;
        this.mainCamera = mainCamera;
        this.animCanvas = null;
        this.animRenderer = null;
        this.animScene = new THREE.Scene();
        this.animCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        this.animControls = null;
        this.currentCharacter = null;
        this.animations = new Map();
        this.timeline = null;
        this.graphEditor = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.isOpen = false;
        this.selectedBones = new Set();
        this.keyframes = new Map();
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 10;
        this.frameRate = 30;
        this.loop = true;

        // --- New UI/State Properties ---
        this.panel = null;
        this.ui = {}; // To hold references to UI elements
        this.isResizing = false;

        this.init();
    }

    init() {
        this.createAnimatorPanel();
        this.setupAnimationCanvas();
        this.createTimeline();
        this.createGraphEditor();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();

        // --- New UI Initialization ---
        this.setupResizers();
        this.setupBottomTabs();
        this.removeInlineStyles(); // Clean up initial inline styles
    }
    
    /*createAnimatorPanel() {
        this.panel = document.createElement('div');
        this.panel.id = 'advanced-animator';
        this.panel.className = 'animator-panel';
        this.panel.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: #1e1e1e;
            z-index: 10000;
            display: none;
            flex-direction: column;
            font-family: 'Segoe UI', monospace;
            color: #ffffff;
        `;
        
        // Header
        const header = document.createElement('div');
        header.className = 'animator-header';
        header.style.cssText = `
            height: 60px;
            background: #2d2d2d;
            display: flex;
            align-items: center;
            padding: 0 20px;
            border-bottom: 1px solid #404040;
            justify-content: space-between;
        `;
        
        const title = document.createElement('h2');
        title.textContent = 'Advanced Animator';
        title.style.cssText = 'margin: 0; color: #ffffff; font-size: 18px;';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'close-animator';
        closeBtn.style.cssText = `
            background: #ff4444;
            border: none;
            color: white;
            font-size: 24px;
            width: 30px;
            height: 30px;
            border-radius: 3px;
            cursor: pointer;
        `;
        closeBtn.addEventListener('click', () => this.close());
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Main content area
        const mainContent = document.createElement('div');
        mainContent.className = 'animator-main';
        mainContent.style.cssText = `
            flex: 1;
            display: flex;
            overflow: hidden;
        `;
        
        // Left panel - 3D Viewport
        const leftPanel = document.createElement('div');
        leftPanel.className = 'animator-viewport';
        leftPanel.style.cssText = `
            flex: 1;
            background: #252525;
            position: relative;
            border-right: 1px solid #404040;
        `;
        
        // Right panel - Properties and bone list
        const rightPanel = document.createElement('div');
        rightPanel.className = 'animator-properties';
        rightPanel.style.cssText = `
            width: 300px;
            background: #1a1a1a;
            border-left: 1px solid #404040;
            overflow-y: auto;
        `;
        
        // Bottom panel - Timeline and Graph Editor
        const bottomPanel = document.createElement('div');
        bottomPanel.className = 'animator-bottom';
        bottomPanel.style.cssText = `
            height: 300px;
            background: #1a1a1a;
            border-top: 1px solid #404040;
            display: flex;
            flex-direction: column;
        `;
        
        mainContent.appendChild(leftPanel);
        mainContent.appendChild(rightPanel);
        
        this.panel.appendChild(header);
        this.panel.appendChild(mainContent);
        this.panel.appendChild(bottomPanel);
        
        document.body.appendChild(this.panel);
        
        // Store references
        this.viewportContainer = leftPanel;
        this.propertiesPanel = rightPanel;
        this.bottomPanel = bottomPanel;
        
        this.createPropertyPanels();
        this.createToolbar();
    }*/ 

    createAnimatorPanel() {
        // Main panel
        this.panel = document.createElement('div');
        this.panel.id = 'advanced-animator';
        this.panel.className = 'animator-panel';
        
        // Header
        const header = document.createElement('div');
        header.className = 'animator-header';
        
        const title = document.createElement('h2');
        title.textContent = 'Advanced Animator';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'close-animator';
        closeBtn.addEventListener('click', () => this.close());
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Main content area with resizable parts
        const mainContainer = document.createElement('div');
        mainContainer.className = 'animator-main-container';

        // Left Column (Viewport)
        const leftColumn = document.createElement('div');
        leftColumn.className = 'animator-left-column';
        
        this.ui.viewportContainer = document.createElement('div');
        this.ui.viewportContainer.className = 'animator-viewport';

        leftColumn.appendChild(this.ui.viewportContainer);

        // Vertical Resizer
        const resizerV = document.createElement('div');
        resizerV.className = 'resizer resizer-v';
        resizerV.id = 'resizer-v';

        // Right Column (Properties)
        const rightColumn = document.createElement('div');
        rightColumn.className = 'animator-right-column';
        
        this.ui.propertiesPanel = document.createElement('div');
        this.ui.propertiesPanel.className = 'animator-properties';

        rightColumn.appendChild(this.ui.propertiesPanel);
        
        mainContainer.appendChild(leftColumn);
        mainContainer.appendChild(resizerV);
        mainContainer.appendChild(rightColumn);

        // Horizontal Resizer
        const resizerH = document.createElement('div');
        resizerH.className = 'resizer resizer-h';
        resizerH.id = 'resizer-h';
        
        // Bottom Panel (Timeline/Graph)
        const bottomContainer = document.createElement('div');
        bottomContainer.className = 'animator-bottom-container';
        
        // Tabs for switching views
        const bottomPanelTabs = document.createElement('div');
        bottomPanelTabs.className = 'bottom-panel-tabs';
        
        const timelineTab = document.createElement('button');
        timelineTab.className = 'panel-tab active';
        timelineTab.textContent = 'Timeline';
        timelineTab.dataset.target = 'timeline-container';

        const graphTab = document.createElement('button');
        graphTab.className = 'panel-tab';
        graphTab.textContent = 'Graph Editor';
        graphTab.dataset.target = 'graph-editor-container';

        bottomPanelTabs.appendChild(timelineTab);
        bottomPanelTabs.appendChild(graphTab);

        // Content area for bottom panels
        const bottomPanelContent = document.createElement('div');
        bottomPanelContent.className = 'bottom-panel-content';

        this.ui.timelineContainer = document.createElement('div');
        this.ui.timelineContainer.id = 'timeline-container';
        this.ui.timelineContainer.className = 'bottom-panel-wrapper active';

        this.ui.graphEditorContainer = document.createElement('div');
        this.ui.graphEditorContainer.id = 'graph-editor-container';
        this.ui.graphEditorContainer.className = 'bottom-panel-wrapper';

        bottomPanelContent.appendChild(this.ui.timelineContainer);
        bottomPanelContent.appendChild(this.ui.graphEditorContainer);

        bottomContainer.appendChild(bottomPanelTabs);
        bottomContainer.appendChild(bottomPanelContent);
        
        // Assemble main panel
        this.panel.appendChild(header);
        this.panel.appendChild(mainContainer);
        this.panel.appendChild(resizerH);
        this.panel.appendChild(bottomContainer);

        document.body.appendChild(this.panel);

        // Store references for later use
        this.ui.leftColumn = leftColumn;
        this.ui.rightColumn = rightColumn;
        this.ui.mainContainer = mainContainer;
        this.ui.bottomContainer = bottomContainer;

        // Create the content within the new structure
        this.createPropertyPanels();
        this.createToolbar();
    }

     removeInlineStyles() {
        this.panel.style.cssText = '';
        const allChildren = this.panel.querySelectorAll('*');
        allChildren.forEach(el => el.style.cssText = '');
    }


    /*createPropertyPanels() {
        // Bone hierarchy
        const boneSection = document.createElement('div');
        boneSection.style.cssText = 'padding: 15px;';
        
        const boneTitle = document.createElement('h3');
        boneTitle.textContent = 'Bone Hierarchy';
        //boneTitle.style.cssText = 'margin: 0 0 10px 0; color: #ffffff; font-size: 14px;';
        
        this.boneList = document.createElement('div');
        this.boneList.className = 'bone-list';
        this.boneList.style.cssText = `
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid #404040;
            background: #252525;
        `;
        
        boneSection.appendChild(boneTitle);
        boneSection.appendChild(this.boneList);
        
        // Transform properties
        const transformSection = document.createElement('div');
        transformSection.style.cssText = 'padding: 15px; border-top: 1px solid #404040;';
        
        const transformTitle = document.createElement('h3');
        transformTitle.textContent = 'Transform';
        //transformTitle.style.cssText = 'margin: 0 0 10px 0; color: #ffffff; font-size: 14px;';
        
        this.transformControls = this.createTransformInputs();
        
        transformSection.appendChild(transformTitle);
        transformSection.appendChild(this.transformControls);
        
        this.propertiesPanel.appendChild(boneSection);
        this.propertiesPanel.appendChild(transformSection);
    }
    
    createTransformInputs() {
        const container = document.createElement('div');
        
        const properties = [
            { label: 'Position X', prop: 'px', min: -100, max: 100, step: 0.01 },
            { label: 'Position Y', prop: 'py', min: -100, max: 100, step: 0.01 },
            { label: 'Position Z', prop: 'pz', min: -100, max: 100, step: 0.01 },
            { label: 'Rotation X', prop: 'rx', min: -Math.PI, max: Math.PI, step: 0.01 },
            { label: 'Rotation Y', prop: 'ry', min: -Math.PI, max: Math.PI, step: 0.01 },
            { label: 'Rotation Z', prop: 'rz', min: -Math.PI, max: Math.PI, step: 0.01 },
            { label: 'Scale X', prop: 'sx', min: 0.1, max: 5, step: 0.01 },
            { label: 'Scale Y', prop: 'sy', min: 0.1, max: 5, step: 0.01 },
            { label: 'Scale Z', prop: 'sz', min: 0.1, max: 5, step: 0.01 }
        ];
        
        this.transformInputs = {};
        
        properties.forEach(prop => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; margin-bottom: 8px;';
            
            const label = document.createElement('label');
            label.textContent = prop.label;
            label.style.cssText = 'width: 80px; font-size: 12px; color: #cccccc;';
            
            const input = document.createElement('input');
            input.type = 'number';
            input.min = prop.min;
            input.max = prop.max;
            input.step = prop.step;
            input.value = prop.prop.includes('s') ? 1 : 0;
            input.style.cssText = `
                flex: 1;
                background: #404040;
                border: 1px solid #555555;
                color: white;
                padding: 4px;
                font-size: 12px;
                margin-left: 8px;
            `;
            
            input.addEventListener('input', () => {
                this.updateSelectedBoneTransform(prop.prop, parseFloat(input.value));
            });
            
            const keyBtn = document.createElement('button');
            keyBtn.textContent = '●';
            keyBtn.style.cssText = `
                width: 24px;
                height: 24px;
                background: #666666;
                border: none;
                color: #ffaa00;
                margin-left: 4px;
                cursor: pointer;
                border-radius: 3px;
            `;
            keyBtn.addEventListener('click', () => {
                this.setKeyframe(prop.prop, parseFloat(input.value));
            });
            
            row.appendChild(label);
            row.appendChild(input);
            row.appendChild(keyBtn);
            container.appendChild(row);
            
            this.transformInputs[prop.prop] = input;
        });
        
        return container;
    }*/ 

    createPropertyPanels() {
        // Bone hierarchy
        const boneSection = document.createElement('div');
        boneSection.className = 'properties-section';
        const boneTitle = document.createElement('h3');
        boneTitle.textContent = 'Bone Hierarchy';
        this.ui.boneList = document.createElement('div');
        this.ui.boneList.className = 'bone-list';
        boneSection.appendChild(boneTitle);
        boneSection.appendChild(this.ui.boneList);
        
        // Transform properties
        const transformSection = document.createElement('div');
        transformSection.className = 'properties-section';
        const transformTitle = document.createElement('h3');
        transformTitle.textContent = 'Transform';
        this.transformControls = this.createTransformInputs();
        transformSection.appendChild(transformTitle);
        transformSection.appendChild(this.transformControls);
        
        this.ui.propertiesPanel.appendChild(boneSection);
        this.ui.propertiesPanel.appendChild(transformSection);
    }


      createTransformInputs() {
        const container = document.createElement('div');
        this.transformInputs = {};

        const createGroup = (title, properties, groupClass) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = `property-group ${groupClass}`;

            properties.forEach(prop => {
                const row = document.createElement('div');
                row.className = 'property-row';
                
                const label = document.createElement('label');
                label.textContent = prop.label;
                
                const input = document.createElement('input');
                input.type = 'number';
                input.min = prop.min;
                input.max = prop.max;
                input.step = prop.step;
                input.value = prop.prop.includes('s') ? 1 : 0;
                input.addEventListener('input', () => this.updateSelectedBoneTransform(prop.prop, parseFloat(input.value)));
                
                const keyBtn = document.createElement('button');
                keyBtn.className = 'keyframe-btn';
                keyBtn.innerHTML = '◆'; // Diamond shape
                keyBtn.addEventListener('click', () => this.setKeyframe(prop.prop, parseFloat(input.value)));
                
                row.appendChild(label);
                row.appendChild(input);
                row.appendChild(keyBtn);
                groupDiv.appendChild(row);
                
                this.transformInputs[prop.prop] = { input, keyBtn };
            });
            return groupDiv;
        };
        
        const posProps = [
            { label: 'X', prop: 'px' }, { label: 'Y', prop: 'py' }, { label: 'Z', prop: 'pz' }
        ];
        const rotProps = [
            { label: 'X', prop: 'rx' }, { label: 'Y', prop: 'ry' }, { label: 'Z', prop: 'rz' }
        ];
        const scaleProps = [
            { label: 'X', prop: 'sx' }, { label: 'Y', prop: 'sy' }, { label: 'Z', prop: 'sz' }
        ];

        container.appendChild(createGroup('Position', posProps, 'position'));
        container.appendChild(createGroup('Rotation', rotProps, 'rotation'));
        container.appendChild(createGroup('Scale', scaleProps, 'scale'));
        
        return container;
    }
    
    /*createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'animator-toolbar';
        toolbar.style.cssText = `
            height: 40px;
            background: #2d2d2d;
            display: flex;
            align-items: center;
            padding: 0 10px;
            gap: 10px;
            border-bottom: 1px solid #404040;
        `;
        
        // Playback controls
        const playBtn = this.createButton('▶', () => this.togglePlayback());
        const stopBtn = this.createButton('⏹', () => this.stop());
        const prevBtn = this.createButton('⏮', () => this.previousFrame());
        const nextBtn = this.createButton('⏭', () => this.nextFrame());
        
        // Time display
        const timeDisplay = document.createElement('span');
        timeDisplay.style.cssText = 'color: white; font-family: monospace; margin: 0 10px;';
        this.timeDisplay = timeDisplay;
        
        // Loop toggle
        const loopBtn = this.createButton('🔄', () => this.toggleLoop());
        loopBtn.style.backgroundColor = this.loop ? '#0066cc' : '#666666';
        this.loopBtn = loopBtn;
        
        toolbar.appendChild(playBtn);
        toolbar.appendChild(stopBtn);
        toolbar.appendChild(prevBtn);
        toolbar.appendChild(nextBtn);
        toolbar.appendChild(timeDisplay);
        toolbar.appendChild(loopBtn);
        
        this.viewportContainer.insertBefore(toolbar, this.viewportContainer.firstChild);
        this.playBtn = playBtn;
    }*/ 

      createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'animator-toolbar';
        
        this.ui.playBtn = this.createButton('▶', () => this.togglePlayback());
        this.ui.stopBtn = this.createButton('⏹', () => this.stop());
        this.ui.prevBtn = this.createButton('⏮', () => this.previousFrame());
        this.ui.nextBtn = this.createButton('⏭', () => this.nextFrame());
        this.ui.timeDisplay = document.createElement('span');
        this.ui.timeDisplay.className = 'time-display';
        this.ui.loopBtn = this.createButton('🔄', () => this.toggleLoop());
        this.toggleLoop(this.loop); // Set initial state
        
        toolbar.appendChild(this.ui.playBtn);
        toolbar.appendChild(this.ui.stopBtn);
        toolbar.appendChild(this.ui.prevBtn);
        toolbar.appendChild(this.ui.nextBtn);
        toolbar.appendChild(this.ui.timeDisplay);
        toolbar.appendChild(this.ui.loopBtn);
        
        this.ui.viewportContainer.appendChild(toolbar);
    }
    
     createButton(text, onClick) {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.addEventListener('click', onClick);
        return btn;
    }
    
    /*setupAnimationCanvas() {
        this.animCanvas = document.createElement('canvas');
        this.ui.viewportContainer.appendChild(this.animCanvas);
        
        this.animRenderer = new THREE.WebGLRenderer({ canvas: this.animCanvas, antialias: true, alpha: true });
        this.animRenderer.setPixelRatio(window.devicePixelRatio);
        this.animRenderer.shadowMap.enabled = true;
        this.animRenderer.setClearColor(0x000000, 0); // Transparent background

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.animScene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        this.animScene.add(directionalLight);

        this.animCamera.position.set(0, 1.6, 5);
        this.animControls = new THREE.OrbitControls(this.animCamera, this.animCanvas);
        this.animControls.enableDamping = true;
        this.animControls.target.set(0, 1, 0);
        
        const resizeObserver = new ResizeObserver(() => this.resizeAnimationCanvas());
        resizeObserver.observe(this.animCanvas);
    }*/ 

    setupAnimationCanvas() {
    this.animCanvas = document.createElement('canvas');
    this.ui.viewportContainer = this.panel.querySelector('.animator-viewport');
    this.ui.viewportContainer.appendChild(this.animCanvas);

    // Renderer setup
    this.animRenderer = new THREE.WebGLRenderer({ canvas: this.animCanvas, antialias: true, alpha: true });
    this.animRenderer.setPixelRatio(window.devicePixelRatio);
    this.animRenderer.setClearColor(0x202020, 1); // Slightly dark background
    this.animRenderer.shadowMap.enabled = true;
    this.animRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.animScene.add(ambientLight);
    this.animScene.fog = new THREE.Fog(0x202020, 10, 50); // Adds depth

    // Directional light with shadows
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    this.animScene.add(dirLight);

    // Optional: Light helper (for debugging)
    // const lightHelper = new THREE.DirectionalLightHelper(dirLight, 2);
    // this.animScene.add(lightHelper);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.animScene.add(ground);

    // Grid Helper
    const grid = new THREE.GridHelper(100, 100, 0x888888, 0x444444);
    this.animScene.add(grid);

    // Axes Helper
    const axes = new THREE.AxesHelper(2);
    this.animScene.add(axes);

    // Camera
    this.animCamera.position.set(2, 2, 5);
    this.animCamera.lookAt(0, 1, 0);

    // OrbitControls
    this.animControls = new THREE.OrbitControls(this.animCamera, this.animCanvas);
    this.animControls.enableDamping = true;
    this.animControls.dampingFactor = 0.1;
    this.animControls.screenSpacePanning = false;
    this.animControls.minDistance = 1;
    this.animControls.maxDistance = 20;
    this.animControls.target.set(0, 1, 0);
    this.animControls.update();

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => this.resizeAnimationCanvas());
    resizeObserver.observe(this.animCanvas);

    // Start rendering
    //this.animateLoop();
}

/*animateLoop() {
    requestAnimationFrame(() => this.animateLoop());

    const delta = this.clock.getDelta();
    if (this.mixer) this.mixer.update(delta);
    
    this.animControls.update();
    this.animRenderer.render(this.animScene, this.animCamera);
}*/

    
    /*resizeAnimationCanvas() {
        if (!this.animCanvas || !this.animRenderer) return;
        
        const rect = this.animCanvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        this.animCamera.aspect = rect.width / rect.height;
        this.animCamera.updateProjectionMatrix();
        this.animRenderer.setSize(rect.width, rect.height);
    }*/ 

    resizeAnimationCanvas() {
        if (!this.animCanvas || !this.animRenderer) return;

        const rect = this.animCanvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        this.animCamera.aspect = rect.width / rect.height;
        this.animCamera.updateProjectionMatrix();
        this.animRenderer.setSize(rect.width, rect.height, false); // Don't update style
    }
    
    createTimeline() {
        this.timelineCanvas = document.createElement('canvas');
        this.ui.timelineContainer.appendChild(this.timelineCanvas);
        this.timeline = new AnimationTimeline(this.timelineCanvas, this);
    }

    
    /*createGraphEditor() {
        const graphContainer = document.createElement('div');
        graphContainer.className = 'graph-editor-container';
        graphContainer.style.cssText = `
            flex: 1;
            background: #1a1a1a;
            position: relative;
            overflow: hidden;
        `;
        
        // Graph editor header
        const graphHeader = document.createElement('div');
        graphHeader.style.cssText = `
            height: 30px;
            background: #2d2d2d;
            display: flex;
            align-items: center;
            padding: 0 10px;
            border-bottom: 1px solid #404040;
        `;
        
        const graphTitle = document.createElement('span');
        graphTitle.textContent = 'Graph Editor';
        graphTitle.style.cssText = 'color: white; font-weight: bold;';
        graphHeader.appendChild(graphTitle);
        
        // Graph canvas
        this.graphCanvas = document.createElement('canvas');
        this.graphCanvas.style.cssText = `
            width: 100%;
            height: calc(100% - 30px);
            display: block;
            cursor: crosshair;
        `;
        
        graphContainer.appendChild(graphHeader);
        graphContainer.appendChild(this.graphCanvas);
        this.bottomPanel.appendChild(graphContainer);
        
        this.graphEditor = new CurveGraphEditor(this.graphCanvas, this);
    }*/ 

     createGraphEditor() {
        this.graphCanvas = document.createElement('canvas');
        this.ui.graphEditorContainer.appendChild(this.graphCanvas);
        this.graphEditor = new CurveGraphEditor(this.graphCanvas, this);
    }

    // --- NEW UI-FOCUSED METHODS ---

    setupResizers() {
        const resizerV = this.panel.querySelector('#resizer-v');
        const resizerH = this.panel.querySelector('#resizer-h');

        const dragHandler = (resizer, onDrag) => {
            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.isResizing = true;
                document.body.style.cursor = resizer.classList.contains('resizer-v') ? 'col-resize' : 'row-resize';
                document.body.style.userSelect = 'none';

                const mouseMoveHandler = (moveEvent) => {
                    onDrag(moveEvent);
                    this.resizeAnimationCanvas(); // Resize canvas during drag
                };

                const mouseUpHandler = () => {
                    this.isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    document.removeEventListener('mousemove', mouseMoveHandler);
                    document.removeEventListener('mouseup', mouseUpHandler);
                };

                document.addEventListener('mousemove', mouseMoveHandler);
                document.addEventListener('mouseup', mouseUpHandler);
            });
        };

        dragHandler(resizerV, (e) => {
            const totalWidth = this.ui.mainContainer.offsetWidth;
            const leftWidth = e.clientX - this.ui.leftColumn.getBoundingClientRect().left;
            const rightWidth = totalWidth - leftWidth - resizerV.offsetWidth;
            if (leftWidth > 100 && rightWidth > 100) {
                 this.panel.style.setProperty('--left-panel-width', `${leftWidth}px`);
            }
        });

        dragHandler(resizerH, (e) => {
            const totalHeight = this.panel.offsetHeight - this.panel.querySelector('.animator-header').offsetHeight;
            const mainHeight = e.clientY - this.ui.mainContainer.getBoundingClientRect().top;
            const bottomHeight = totalHeight - mainHeight - resizerH.offsetHeight;
            if (mainHeight > 100 && bottomHeight > 80) {
                this.panel.style.setProperty('--bottom-panel-height', `${bottomHeight}px`);
            }
        });
    }

    setupBottomTabs() {
        const tabs = this.panel.querySelectorAll('.panel-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Deactivate all tabs and panels
                this.panel.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
                this.panel.querySelectorAll('.bottom-panel-wrapper').forEach(p => p.classList.remove('active'));

                // Activate the clicked one
                tab.classList.add('active');
                this.panel.querySelector(`#${tab.dataset.target}`).classList.add('active');
            });
        });
    }
    
    
    setupEventListeners() {
        // Character detection from main scene
        const observer = new MutationObserver(() => {
            this.detectCharacterInMainScene();
        });
        
        // Watch for changes in main scene
        if (this.mainScene) {
            this.detectCharacterInMainScene();
        }
    }
    
    detectCharacterInMainScene() {
        if (!this.mainScene) return;
        
        this.mainScene.traverse((child) => {
            if (child.isSkinnedMesh || (child.isMesh && child.skeleton)) {
                if (!this.currentCharacter || this.currentCharacter !== child) {
                    this.loadCharacter(child);
                }
            }
        });
    }
    
    loadCharacter(character) {
        console.log('Loading character into animator:', character);
        
        this.currentCharacter = character;
        
        // Clone character for animation canvas
        const characterClone = character.clone();
        
        // Clear previous character
        this.animScene.traverse((child) => {
            if (child.isSkinnedMesh || child.isMesh) {
                this.animScene.remove(child);
            }
        });
        
        this.animScene.add(characterClone);
        
        // Setup animation mixer
        if (this.mixer) this.mixer.stopAllAction();
        this.mixer = new THREE.AnimationMixer(characterClone);
        
        // Load animations if available
        this.loadAnimations(character);
        
        // Update bone hierarchy
        this.updateBoneHierarchy(characterClone);
        
        // Setup bone visualization
        this.setupBoneVisualization(characterClone);
        
        console.log('Character loaded successfully');
    }
    
    loadAnimations(character) {
        this.animations.clear();
        
        // Check for animations in userData or parent object
        let animationsSource = character.animations;
        
        if (!animationsSource && character.parent) {
            // Check parent for animations (common in GLTF)
            let parent = character.parent;
            while (parent && !animationsSource) {
                if (parent.animations && parent.animations.length > 0) {
                    animationsSource = parent.animations;
                    break;
                }
                parent = parent.parent;
            }
        }
        
        if (animationsSource && animationsSource.length > 0) {
            animationsSource.forEach((clip, index) => {
                this.animations.set(clip.name || `Animation_${index}`, clip);
                console.log(`Loaded animation: ${clip.name || `Animation_${index}`}`);
            });
        }
        
        // Create default animations if none exist
        if (this.animations.size === 0) {
            this.createDefaultAnimations();
        }
    }
    
    createDefaultAnimations() {
        // Create a simple idle animation
        const idleClip = new THREE.AnimationClip('Idle', 2, []);
        this.animations.set('Idle', idleClip);
    }
    
      updateBoneHierarchy(character) {
        this.ui.boneList.innerHTML = '';
        if (!character.skeleton) return;
        
        const createBoneItem = (bone, level) => {
            const boneItem = document.createElement('div');
            boneItem.className = 'bone-item';
            boneItem.textContent = bone.name || `Bone_${bone.uuid.substring(0, 4)}`;
            boneItem.style.paddingLeft = `${10 + level * 15}px`;

            boneItem.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectBone(bone, boneItem);
            });
            this.ui.boneList.appendChild(boneItem);

            // Recursively add children
            if (bone.children) {
                bone.children.forEach(childBone => createBoneItem(childBone, level + 1));
            }
        }
        // Start with root bones (bones with no parent that is also a bone)
        character.skeleton.bones.forEach(bone => {
            if (!bone.parent || !character.skeleton.bones.includes(bone.parent)) {
                 createBoneItem(bone, 0);
            }
        });
    }
    
    setupBoneVisualization(character) {
        if (!character.skeleton) return;
        
        // Create bone helper
        const boneHelper = new THREE.SkeletonHelper(character);
        boneHelper.material.color.setHex(0x00ff00);
        boneHelper.material.linewidth = 2;
        this.animScene.add(boneHelper);
        
        this.boneHelper = boneHelper;
    }
    
     selectBone(bone, boneItem) {
        this.ui.boneList.querySelectorAll('.bone-item').forEach(item => {
            item.classList.remove('selected');
        });
        boneItem.classList.add('selected');
        this.selectedBones.clear();
        this.selectedBones.add(bone);
        this.updateTransformInputs(bone);
    }
    
    updateTransformInputs(bone) {
        if (!bone) return;
        this.transformInputs.px.input.value = bone.position.x.toFixed(3);
        this.transformInputs.py.input.value = bone.position.y.toFixed(3);
        this.transformInputs.pz.input.value = bone.position.z.toFixed(3);
        // ... and so on for all inputs
        this.transformInputs.rx.input.value = bone.rotation.x.toFixed(3);
        this.transformInputs.ry.input.value = bone.rotation.y.toFixed(3);
        this.transformInputs.rz.input.value = bone.rotation.z.toFixed(3);
        this.transformInputs.sx.input.value = bone.scale.x.toFixed(3);
        this.transformInputs.sy.input.value = bone.scale.y.toFixed(3);
        this.transformInputs.sz.input.value = bone.scale.z.toFixed(3);
        this.updateKeyframeButtons();
    }
    
    updateSelectedBoneTransform(property, value) {
        this.selectedBones.forEach(bone => {
            switch(property) {
                case 'px': bone.position.x = value; break;
                case 'py': bone.position.y = value; break;
                case 'pz': bone.position.z = value; break;
                case 'rx': bone.rotation.x = value; break;
                case 'ry': bone.rotation.y = value; break;
                case 'rz': bone.rotation.z = value; break;
                case 'sx': bone.scale.x = value; break;
                case 'sy': bone.scale.y = value; break;
                case 'sz': bone.scale.z = value; break;
            }
        });
    }
    
    setKeyframe(property, value) {
        if (this.selectedBones.size === 0) return;
        
        this.selectedBones.forEach(bone => {
            const boneId = bone.uuid;
            if (!this.keyframes.has(boneId)) {
                this.keyframes.set(boneId, new Map());
            }
            
            const boneKeyframes = this.keyframes.get(boneId);
            const timeKey = this.currentTime.toFixed(3);
            
            if (!boneKeyframes.has(timeKey)) {
                boneKeyframes.set(timeKey, {});
            }
            
            boneKeyframes.get(timeKey)[property] = value;
        });
        
        // Update timeline and graph editor
        this.timeline.addKeyframe(this.currentTime, property, value);
        this.graphEditor.addKeyframe(this.currentTime, value, property);
        this.updateKeyframeButtons();
        console.log(`Keyframe set at ${this.currentTime}s for ${property}: ${value}`);
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;
            
            switch(e.key) {
                case ' ':
                    e.preventDefault();
                    this.togglePlayback();
                    break;
                case 'k':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.setKeyframeForAllSelectedProperties();
                    }
                    break;
                case 'Delete':
                    this.deleteSelectedKeyframes();
                    break;
                case 'ArrowLeft':
                    this.previousFrame();
                    break;
                case 'ArrowRight':
                    this.nextFrame();
                    break;
            }
        });
    }
    
    setKeyframeForAllSelectedProperties() {
        if (this.selectedBones.size === 0) return;
        
        this.selectedBones.forEach(bone => {
            // Set keyframes for all transform properties
            this.setKeyframe('px', bone.position.x);
            this.setKeyframe('py', bone.position.y);
            this.setKeyframe('pz', bone.position.z);
            this.setKeyframe('rx', bone.rotation.x);
            this.setKeyframe('ry', bone.rotation.y);
            this.setKeyframe('rz', bone.rotation.z);
            this.setKeyframe('sx', bone.scale.x);
            this.setKeyframe('sy', bone.scale.y);
            this.setKeyframe('sz', bone.scale.z);
        });
    }
    
     togglePlayback() {
        this.isPlaying = !this.isPlaying;
        this.ui.playBtn.innerHTML = this.isPlaying ? '⏸' : '▶';
        this.ui.playBtn.classList.toggle('playing', this.isPlaying);
        if (this.isPlaying) this.startAnimation();
    }
    
     stop() {
        this.isPlaying = false;
        this.currentTime = 0;
        this.ui.playBtn.innerHTML = '▶';
        this.ui.playBtn.classList.remove('playing');
        this.updateTimeDisplay();
    }
    
    
    previousFrame() {
        this.currentTime = Math.max(0, this.currentTime - 1/this.frameRate);
        this.updateTimeDisplay();
        this.updateAnimation();
    }
    
    nextFrame() {
        this.currentTime = Math.min(this.duration, this.currentTime + 1/this.frameRate);
        this.updateTimeDisplay();
        this.updateAnimation();
    }

    toggleLoop(forceState) {
        this.loop = forceState !== undefined ? forceState : !this.loop;
        this.ui.loopBtn.classList.toggle('loop-active', this.loop);
    }
    
    updateTimeDisplay() {
        const minutes = Math.floor(this.currentTime / 60);
        const seconds = Math.floor(this.currentTime % 60);
        const frames = Math.floor((this.currentTime % 1) * this.frameRate);
        this.ui.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }
    
    
    
    startAnimation() {
        const animate = () => {
            if (!this.isPlaying) return;
            
            const delta = this.clock.getDelta();
            this.currentTime += delta;
            
            if (this.currentTime >= this.duration) {
                if (this.loop) {
                    this.currentTime = 0;
                } else {
                    this.isPlaying = false;
                    this.playBtn.textContent = '▶';
                    return;
                }
            }
            
            this.updateAnimation();
            this.updateTimeDisplay();
            
            requestAnimationFrame(animate);
        };
        
        this.clock.getDelta(); // Reset delta
        animate();
    }
    
    updateAnimation() {
        if (!this.currentCharacter || !this.mixer) return;
        
        // Update mixer
        this.mixer.update(0);
        
        // Apply keyframe interpolation
        this.applyKeyframeInterpolation();
        
        // Update timeline cursor
        this.timeline.setCurrentTime(this.currentTime);
        this.graphEditor.setCurrentTime(this.currentTime);
    }
    
    applyKeyframeInterpolation() {
        this.keyframes.forEach((boneKeyframes, boneId) => {
            const bone = this.findBoneById(boneId);
            if (!bone) return;
            
            const times = Array.from(boneKeyframes.keys()).map(t => parseFloat(t)).sort((a, b) => a - b);
            const currentTime = this.currentTime;
            
            // Find surrounding keyframes
            let prevTime = null;
            let nextTime = null;
            
            for (let time of times) {
                if (time <= currentTime) {
                    prevTime = time;
                } else {
                    nextTime = time;
                    break;
                }
            }
            
            if (prevTime !== null && nextTime !== null) {
                // Interpolate between keyframes
                const t = (currentTime - prevTime) / (nextTime - prevTime);
                const prevKeyframe = boneKeyframes.get(prevTime.toString());
                const nextKeyframe = boneKeyframes.get(nextTime.toString());
                
                this.interpolateKeyframes(bone, prevKeyframe, nextKeyframe, t);
            } else if (prevTime !== null) {
                // Use exact keyframe
                const keyframe = boneKeyframes.get(prevTime.toString());
                this.applyKeyframe(bone, keyframe);
            }
        });
    }
    
    interpolateKeyframes(bone, prevKeyframe, nextKeyframe, t) {
        ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'].forEach(prop => {
            if (prevKeyframe[prop] !== undefined && nextKeyframe[prop] !== undefined) {
                const value = THREE.MathUtils.lerp(prevKeyframe[prop], nextKeyframe[prop], t);
                this.applyPropertyToBone(bone, prop, value);
            }
        });
    }
    
    applyKeyframe(bone, keyframe) {
        Object.keys(keyframe).forEach(prop => {
            this.applyPropertyToBone(bone, prop, keyframe[prop]);
        });
    }
    
    applyPropertyToBone(bone, property, value) {
        switch(property) {
            case 'px': bone.position.x = value; break;
            case 'py': bone.position.y = value; break;
            case 'pz': bone.position.z = value; break;
            case 'rx': bone.rotation.x = value; break;
            case 'ry': bone.rotation.y = value; break;
            case 'rz': bone.rotation.z = value; break;
            case 'sx': bone.scale.x = value; break;
            case 'sy': bone.scale.y = value; break;
            case 'sz': bone.scale.z = value; break;
        }
    }
    
    findBoneById(boneId) {
        if (!this.currentCharacter || !this.currentCharacter.skeleton) return null;
        return this.currentCharacter.skeleton.bones.find(bone => bone.uuid === boneId);
    }
    
    
    deleteSelectedKeyframes() {
        // Implementation for deleting selected keyframes
        console.log('Delete selected keyframes');
    }
    
    /*open(character = null) {
        this.isOpen = true;
        this.panel.style.display = 'flex';
        
        if (character) {
            this.loadCharacter(character);
        } else {
            this.detectCharacterInMainScene();
        }
        
        // Start render loop
        this.startRenderLoop();
        
        // Resize canvas
        setTimeout(() => {
            this.resizeAnimationCanvas();
        }, 100);
    }*/ 

    /*open(character = null) {
        this.isOpen = true;
        this.panel.style.display = 'flex';
        if (character) this.loadCharacter(character);
        else this.detectCharacterInMainScene();
        this.startRenderLoop();
        setTimeout(() => this.resizeAnimationCanvas(), 50); // Defer resize
    }

    close() {
        this.isOpen = false;
        this.panel.style.display = 'none';
        this.isPlaying = false;
    }*/ 

     open(character = null) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.panel.classList.add('animator-open'); // Use class to show panel

    if (character) {
        this.loadCharacter(character);
    } else {
        this.detectCharacterInMainScene();
    }

    this.startRenderLoop();
    
    // --- THIS IS THE CRUCIAL FIX ---
    // Defer the resize calls to ensure the DOM has updated and all panels are visible.
    // This gives the browser a moment to apply the CSS and calculate dimensions.
    setTimeout(() => {
        // Main viewport
        this.resizeAnimationCanvas(); 
        
        // Timeline
        if (this.timeline) {
            this.timeline.resizeCanvas();
        }

        // Graph Editor
        if (this.graphEditor) {
            this.graphEditor.resizeCanvas();
        }
    }, 10); // A small delay like 10ms is very robust.
}

// Find and REPLACE this method in your AdvancedAnimationSystem class
close() {
    this.isOpen = false;
    this.panel.classList.remove('animator-open'); // Use class to hide panel
    this.isPlaying = false; // Also stop playback when closing
}
    
    startRenderLoop() {
        const render = () => {
            if (!this.isOpen) return;
            requestAnimationFrame(render);
            
            // Only render if not actively resizing to prevent lag
            if (this.animControls && !this.isResizing) {
                this.animControls.update();
            }
            if (this.animRenderer && this.animScene && this.animCamera && !this.isResizing) {
                this.animRenderer.render(this.animScene, this.animCamera);
            }
        };
        render();
    }
}

// Animation Timeline Class
class AnimationTimeline {
    constructor(canvas, animator) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.animator = animator;
        
        this.width = 0;
        this.height = 0;
        this.currentTime = 0;
        this.zoom = 1;
        this.offset = 0;
        
        this.keyframes = [];
        this.selectedKeyframes = new Set();
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        
        this.setupEventListeners();
        this.resizeCanvas();
    }
    
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        
        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            this.resizeCanvas();
        });
        resizeObserver.observe(this.canvas.parentElement);
    }
    
    resizeCanvas() {
        // Measure the PARENT, which has the correct flex dimensions.
        const rect = this.canvas.parentElement.getBoundingClientRect();

        // Guard clause: If the panel is not visible, do nothing.
        if (rect.width === 0 || rect.height === 0) {
            return;
        }

        this.width = rect.width;
        this.height = rect.height;
    
        this.canvas.width = this.width * window.devicePixelRatio;
        this.canvas.height = this.height * window.devicePixelRatio;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
    
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.render(); // Re-render after resizing
    }
    

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.isDragging = true;
        this.dragStart = { x, y };
        
        // Check for keyframe selection
        const keyframe = this.getKeyframeAtPosition(x, y);
        if (keyframe) {
            if (!e.ctrlKey) {
                this.selectedKeyframes.clear();
            }
            this.selectedKeyframes.add(keyframe);
        } else {
            // Set timeline position
            const time = this.screenToTime(x);
            this.animator.currentTime = Math.max(0, Math.min(this.animator.duration, time));
            this.animator.updateTimeDisplay();
            this.animator.updateAnimation();
        }
        
        this.render();
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.selectedKeyframes.size > 0) {
            // Move selected keyframes
            const deltaTime = this.screenToTime(x) - this.screenToTime(this.dragStart.x);
            this.moveSelectedKeyframes(deltaTime);
        } else {
            // Pan timeline
            const deltaX = x - this.dragStart.x;
            this.offset -= deltaX / this.zoom;
            this.dragStart.x = x;
        }
        
        this.render();
    }
    
    onMouseUp(e) {
        this.isDragging = false;
    }
    
    onWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const oldZoom = this.zoom;
        this.zoom = Math.max(0.1, Math.min(10, this.zoom * zoomFactor));
        
        // Adjust offset to zoom towards mouse position
        const mouseTime = this.screenToTime(mouseX);
        this.offset = mouseTime - (mouseX / this.zoom);
        
        this.render();
    }
    
    screenToTime(x) {
        return (x / this.zoom) + this.offset;
    }
    
    timeToScreen(time) {
        return (time - this.offset) * this.zoom;
    }
    
    getKeyframeAtPosition(x, y) {
        const time = this.screenToTime(x);
        const tolerance = 5 / this.zoom;
        
        return this.keyframes.find(keyframe => {
            return Math.abs(keyframe.time - time) < tolerance;
        });
    }
    
    moveSelectedKeyframes(deltaTime) {
        this.selectedKeyframes.forEach(keyframe => {
            keyframe.time += deltaTime;
            keyframe.time = Math.max(0, Math.min(this.animator.duration, keyframe.time));
        });
    }
    
    addKeyframe(time, property, value) {
        const keyframe = {
            time,
            property,
            value,
            id: Date.now() + Math.random()
        };
        
        this.keyframes.push(keyframe);
        this.render();
    }
    
    setCurrentTime(time) {
        this.currentTime = time;
        this.render();
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw background
        this.ctx.fillStyle = '#252525';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw time ruler
        this.drawTimeRuler();
        
        // Draw keyframes
        this.drawKeyframes();
    
        // Draw current time indicator
        this.drawCurrentTimeIndicator();
        
        // Draw playback range
        this.drawPlaybackRange();
    }

    /*drawTimeRuler() {
        const rulerHeight = 30;
        
        // Background
        this.ctx.fillStyle = '#2d2d2d';
        this.ctx.fillRect(0, 0, this.width, rulerHeight);
        
        // Time marks
        this.ctx.strokeStyle = '#666666';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'center';
        
        const startTime = Math.floor(this.offset);
        const endTime = Math.ceil(this.offset + this.width / this.zoom);
        
        for (let time = startTime; time <= endTime; time++) {
            const x = this.timeToScreen(time);
            
            if (x >= 0 && x <= this.width) {
                // Major tick
                this.ctx.beginPath();
                this.ctx.moveTo(x, rulerHeight - 10);
                this.ctx.lineTo(x, rulerHeight);
                this.ctx.stroke();
                
                // Time label
                this.ctx.fillText(`${time}s`, x, rulerHeight - 15);
                
                // Minor ticks
                for (let i = 1; i < 10; i++) {
                    const minorX = this.timeToScreen(time + i * 0.1);
                    if (minorX >= 0 && minorX <= this.width) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(minorX, rulerHeight - 5);
                        this.ctx.lineTo(minorX, rulerHeight);
                        this.ctx.stroke();
                    }
                }
            }
        }
    }*/ 

        drawTimeRuler() {
    const rulerHeight = 30;
    const paddingTop = 5;
    
    // Clear ruler background
    this.ctx.fillStyle = '#2d2d2d';
    this.ctx.fillRect(0, 0, this.width, rulerHeight);
    
    // Calculate visible time range
    const visibleStartTime = this.offset;
    const visibleEndTime = this.offset + (this.width / this.zoom);
    
    // Calculate optimal time interval based on zoom level
    const pixelsPerSecond = this.zoom;
    let timeInterval;
    
    if (pixelsPerSecond > 200) {
        timeInterval = 0.1;  // Show tenths of seconds when very zoomed in
    } else if (pixelsPerSecond > 100) {
        timeInterval = 0.2;
    } else if (pixelsPerSecond > 50) {
        timeInterval = 0.5;
    } else if (pixelsPerSecond > 20) {
        timeInterval = 1;    // Show every second
    } else if (pixelsPerSecond > 10) {
        timeInterval = 2;    // Show every 2 seconds
    } else if (pixelsPerSecond > 5) {
        timeInterval = 5;
    } else {
        timeInterval = Math.ceil((visibleEndTime - visibleStartTime) / 10); // Never show more than 10 labels
    }
    
    // Ensure we don't get decimal intervals when zoomed out
    if (timeInterval < 1 && pixelsPerSecond < 50) {
        timeInterval = 1;
    }
    
    // Find first major tick time
    const firstMajorTick = Math.floor(visibleStartTime / timeInterval) * timeInterval;
    
    // Set text style
    this.ctx.font = '12px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.strokeStyle = '#666666';
    
    // Draw major ticks and labels
    for (let time = firstMajorTick; time <= visibleEndTime; time += timeInterval) {
        const x = this.timeToScreen(time);
        
        // Only draw if visible
        if (x < 0 || x > this.width) continue;
        
        // Major tick
        this.ctx.beginPath();
        this.ctx.moveTo(x, rulerHeight - 15);
        this.ctx.lineTo(x, rulerHeight);
        this.ctx.stroke();
        
        // Format time label
        let label;
        if (timeInterval >= 1) {
            label = `${Math.round(time)}s`;
        } else {
            // Show decimals only when needed
            const decimals = Math.max(0, -Math.floor(Math.log10(timeInterval)));
            label = time.toFixed(decimals) + 's';
        }
        
        // Draw label if there's enough space
        const nextX = this.timeToScreen(time + timeInterval);
        if (nextX - x > 40 || time === firstMajorTick || time + timeInterval > visibleEndTime) {
            this.ctx.fillText(label, x, paddingTop);
        }
        
        // Draw minor ticks between major ticks
        if (timeInterval > 0.5) {
            const minorTickCount = 4;
            for (let i = 1; i < minorTickCount; i++) {
                const minorTime = time + (i * timeInterval / minorTickCount);
                const minorX = this.timeToScreen(minorTime);
                if (minorX >= 0 && minorX <= this.width) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(minorX, rulerHeight - 7);
                    this.ctx.lineTo(minorX, rulerHeight);
                    this.ctx.stroke();
                }
            }
        }
    }
    
    // Draw current time indicator on ruler
    const currentX = this.timeToScreen(this.currentTime);
    if (currentX >= 0 && currentX <= this.width) {
        this.ctx.strokeStyle = '#ff5555';
        this.ctx.beginPath();
        this.ctx.moveTo(currentX, 0);
        this.ctx.lineTo(currentX, rulerHeight);
        this.ctx.stroke();
    }
}

    
    
    drawKeyframes() {
        this.keyframes.forEach(keyframe => {
            const x = this.timeToScreen(keyframe.time);
            
            if (x >= 0 && x <= this.width) {
                const y = 50 + (this.getPropertyIndex(keyframe.property) * 20);
                
                // Keyframe diamond
                this.ctx.fillStyle = this.selectedKeyframes.has(keyframe) ? '#ffaa00' : '#00aa00';
                this.ctx.beginPath();
                this.ctx.moveTo(x, y - 5);
                this.ctx.lineTo(x + 5, y);
                this.ctx.lineTo(x, y + 5);
                this.ctx.lineTo(x - 5, y);
                this.ctx.closePath();
                this.ctx.fill();
                
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.stroke();
            }
        });
    }
    
    drawCurrentTimeIndicator() {
        const x = this.timeToScreen(this.currentTime);
        
        if (x >= 0 && x <= this.width) {
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
            this.ctx.lineWidth = 1;
        }
    }
    
    drawPlaybackRange() {
        const startX = this.timeToScreen(0);
        const endX = this.timeToScreen(this.animator.duration);
        
        // Draw range background
        this.ctx.fillStyle = 'rgba(0, 100, 200, 0.1)';
        this.ctx.fillRect(Math.max(0, startX), 30, Math.min(this.width, endX) - Math.max(0, startX), this.height - 30);
        
        // Draw range borders
        this.ctx.strokeStyle = '#0066cc';
        if (startX >= 0 && startX <= this.width) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, 30);
            this.ctx.lineTo(startX, this.height);
            this.ctx.stroke();
        }
        
        if (endX >= 0 && endX <= this.width) {
            this.ctx.beginPath();
            this.ctx.moveTo(endX, 30);
            this.ctx.lineTo(endX, this.height);
            this.ctx.stroke();
        }
    }
    
    getPropertyIndex(property) {
        const properties = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'];
        return properties.indexOf(property);
    }
}

// Curve Graph Editor Class
class CurveGraphEditor {
    constructor(canvas, animator) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.animator = animator;
        
        this.width = 0;
        this.height = 0;
        this.currentTime = 0;
        
        this.curves = new Map();
        this.selectedCurve = null;
        this.selectedPoints = new Set();
        
        this.viewBounds = { minX: 0, maxX: 10, minY: -2, maxY: 2 };
        this.isDragging = false;
        this.dragMode = 'none'; // 'point', 'tangent', 'pan'
        
        this.setupEventListeners();
        this.resizeCanvas();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        
        const resizeObserver = new ResizeObserver(() => {
            this.resizeCanvas();
        });
        resizeObserver.observe(this.canvas.parentElement);
    }
    
   resizeCanvas() {
    // Measure the PARENT, which has the correct flex dimensions.
    const rect = this.canvas.parentElement.getBoundingClientRect();
    
    // Guard clause: If the panel is not visible, do nothing.
    if (rect.width === 0 || rect.height === 0) {
        return;
    }

    this.width = rect.width;
    this.height = rect.height;
    
    this.canvas.width = this.width * window.devicePixelRatio;
    this.canvas.height = this.height * window.devicePixelRatio;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.render(); // Re-render after resizing
}
    
    screenToWorld(x, y) {
        const worldX = this.viewBounds.minX + (x / this.width) * (this.viewBounds.maxX - this.viewBounds.minX);
        const worldY = this.viewBounds.maxY - (y / this.height) * (this.viewBounds.maxY - this.viewBounds.minY);
        return { x: worldX, y: worldY };
    }
    
    worldToScreen(x, y) {
        const screenX = ((x - this.viewBounds.minX) / (this.viewBounds.maxX - this.viewBounds.minX)) * this.width;
        const screenY = ((this.viewBounds.maxY - y) / (this.viewBounds.maxY - this.viewBounds.minY)) * this.height;
        return { x: screenX, y: screenY };
    }
    
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.isDragging = true;
        this.dragStart = { x, y };
        
        // Check for point selection
        const point = this.getPointAtPosition(x, y);
        if (point) {
            if (!e.ctrlKey) {
                this.selectedPoints.clear();
            }
            this.selectedPoints.add(point);
            this.dragMode = 'point';
        } else {
            this.dragMode = 'pan';
        }
        
        this.render();
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const deltaX = x - this.dragStart.x;
        const deltaY = y - this.dragStart.y;
        
        if (this.dragMode === 'point' && this.selectedPoints.size > 0) {
            // Move selected points
            const worldDelta = this.screenToWorld(deltaX, deltaY);
            const worldStart = this.screenToWorld(0, 0);
            const actualDelta = {
                x: worldDelta.x - worldStart.x,
                y: worldDelta.y - worldStart.y
            };
            
            this.selectedPoints.forEach(point => {
                point.x += actualDelta.x;
                point.y += actualDelta.y;
            });
        } else if (this.dragMode === 'pan') {
            // Pan view
            const worldDelta = this.screenToWorld(deltaX, deltaY);
            const worldStart = this.screenToWorld(0, 0);
            const actualDelta = {
                x: worldDelta.x - worldStart.x,
                y: worldDelta.y - worldStart.y
            };
            
            this.viewBounds.minX -= actualDelta.x;
            this.viewBounds.maxX -= actualDelta.x;
            this.viewBounds.minY -= actualDelta.y;
            this.viewBounds.maxY -= actualDelta.y;
        }
        
        this.dragStart = { x, y };
        this.render();
    }
    
    onMouseUp(e) {
        this.isDragging = false;
        this.dragMode = 'none';
    }
    
    onWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(mouseX, mouseY);
        
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        
        const rangeX = this.viewBounds.maxX - this.viewBounds.minX;
        const rangeY = this.viewBounds.maxY - this.viewBounds.minY;
        
        const newRangeX = rangeX * zoomFactor;
        const newRangeY = rangeY * zoomFactor;
        
        const centerX = worldPos.x;
        const centerY = worldPos.y;
        
        this.viewBounds.minX = centerX - newRangeX * (mouseX / this.width);
        this.viewBounds.maxX = centerX + newRangeX * (1 - mouseX / this.width);
        this.viewBounds.minY = centerY - newRangeY * (1 - mouseY / this.height);
        this.viewBounds.maxY = centerY + newRangeY * (mouseY / this.height);
        
        this.render();
    }
    
    getPointAtPosition(screenX, screenY) {
        const tolerance = 10;
        const worldPos = this.screenToWorld(screenX, screenY);
        
        for (let [property, curve] of this.curves) {
            for (let point of curve.points) {
                const screenPoint = this.worldToScreen(point.x, point.y);
                const distance = Math.sqrt(
                    Math.pow(screenPoint.x - screenX, 2) + 
                    Math.pow(screenPoint.y - screenY, 2)
                );
                
                if (distance <= tolerance) {
                    return point;
                }
            }
        }
        
        return null;
    }
    
    addKeyframe(time, value, property) {
        if (!this.curves.has(property)) {
            this.curves.set(property, {
                points: [],
                color: this.getPropertyColor(property),
                visible: true
            });
        }
        
        const curve = this.curves.get(property);
        const point = {
            x: time,
            y: value,
            tangentIn: { x: -0.1, y: 0 },
            tangentOut: { x: 0.1, y: 0 },
            interpolation: 'bezier' // 'linear', 'bezier', 'step'
        };
        
        // Insert point in correct time order
        let insertIndex = curve.points.findIndex(p => p.x > time);
        if (insertIndex === -1) {
            curve.points.push(point);
        } else {
            curve.points.splice(insertIndex, 0, point);
        }
        
        this.render();
    }
    
    getPropertyColor(property) {
        const colors = {
            'px': '#ff0000', 'py': '#00ff00', 'pz': '#0000ff',
            'rx': '#ff8800', 'ry': '#88ff00', 'rz': '#0088ff',
            'sx': '#ff0088', 'sy': '#88ff88', 'sz': '#8800ff'
        };
        return colors[property] || '#ffffff';
    }
    
    setCurrentTime(time) {
        this.currentTime = time;
        this.render();
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw grid
        this.drawGrid();
        
        // Draw curves
        this.drawCurves();
        
        // Draw current time indicator
        this.drawCurrentTimeIndicator();
        
        // Draw selected points
        this.drawSelectedPoints();
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;
        
        // Vertical lines (time)
        const timeStep = this.getGridStep(this.viewBounds.maxX - this.viewBounds.minX);
        for (let t = Math.ceil(this.viewBounds.minX / timeStep) * timeStep; t <= this.viewBounds.maxX; t += timeStep) {
            const screenPos = this.worldToScreen(t, 0);
            this.ctx.beginPath();
            this.ctx.moveTo(screenPos.x, 0);
            this.ctx.lineTo(screenPos.x, this.height);
            this.ctx.stroke();
            
            // Time labels
            this.ctx.fillStyle = '#888888';
            this.ctx.font = '10px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(t.toFixed(1), screenPos.x, this.height - 5);
        }
        
        // Horizontal lines (value)
        const valueStep = this.getGridStep(this.viewBounds.maxY - this.viewBounds.minY);
        for (let v = Math.ceil(this.viewBounds.minY / valueStep) * valueStep; v <= this.viewBounds.maxY; v += valueStep) {
            const screenPos = this.worldToScreen(0, v);
            this.ctx.beginPath();
            this.ctx.moveTo(0, screenPos.y);
            this.ctx.lineTo(this.width, screenPos.y);
            this.ctx.stroke();
            
            // Value labels
            this.ctx.fillStyle = '#888888';
            this.ctx.font = '10px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(v.toFixed(2), 5, screenPos.y - 5);
        }
    }
    
    getGridStep(range) {
        const targetSteps = 10;
        const rawStep = range / targetSteps;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normalized = rawStep / magnitude;
        
        if (normalized <= 1) return magnitude;
        if (normalized <= 2) return 2 * magnitude;
        if (normalized <= 5) return 5 * magnitude;
        return 10 * magnitude;
    }
    
    drawCurves() {
        for (let [property, curve] of this.curves) {
            if (!curve.visible || curve.points.length === 0) continue;
            
            this.ctx.strokeStyle = curve.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            
            for (let i = 0; i < curve.points.length - 1; i++) {
                const p1 = curve.points[i];
                const p2 = curve.points[i + 1];
                
                const start = this.worldToScreen(p1.x, p1.y);
                const end = this.worldToScreen(p2.x, p2.y);
                
                if (i === 0) {
                    this.ctx.moveTo(start.x, start.y);
                }
                
                if (p1.interpolation === 'linear') {
                    this.ctx.lineTo(end.x, end.y);
                } else if (p1.interpolation === 'bezier') {
                    const cp1 = this.worldToScreen(p1.x + p1.tangentOut.x, p1.y + p1.tangentOut.y);
                    const cp2 = this.worldToScreen(p2.x + p2.tangentIn.x, p2.y + p2.tangentIn.y);
                    this.ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
                } else if (p1.interpolation === 'step') {
                    this.ctx.lineTo(end.x, start.y);
                    this.ctx.lineTo(end.x, end.y);
                }
            }
            
            this.ctx.stroke();
            
            // Draw points
            curve.points.forEach(point => {
                const screenPos = this.worldToScreen(point.x, point.y);
                this.ctx.fillStyle = curve.color;
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 4, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            });
        }
    }
    
    drawCurrentTimeIndicator() {
        const screenPos = this.worldToScreen(this.currentTime, 0);
        
        if (screenPos.x >= 0 && screenPos.x <= this.width) {
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(screenPos.x, 0);
            this.ctx.lineTo(screenPos.x, this.height);
            this.ctx.stroke();
        }
    }
    
    drawSelectedPoints() {
        this.selectedPoints.forEach(point => {
            const screenPos = this.worldToScreen(point.x, point.y);
            
            // Highlight selected point
            this.ctx.strokeStyle = '#ffaa00';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(screenPos.x, screenPos.y, 6, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // Draw tangent handles for bezier curves
            if (point.interpolation === 'bezier') {
                const inHandle = this.worldToScreen(point.x + point.tangentIn.x, point.y + point.tangentIn.y);
                const outHandle = this.worldToScreen(point.x + point.tangentOut.x, point.y + point.tangentOut.y);
                
                this.ctx.strokeStyle = '#888888';
                this.ctx.lineWidth = 1;
                
                // Tangent lines
                this.ctx.beginPath();
                this.ctx.moveTo(screenPos.x, screenPos.y);
                this.ctx.lineTo(inHandle.x, inHandle.y);
                this.ctx.moveTo(screenPos.x, screenPos.y);
                this.ctx.lineTo(outHandle.x, outHandle.y);
                this.ctx.stroke();
                
                // Tangent handles
                this.ctx.fillStyle = '#888888';
                this.ctx.beginPath();
                this.ctx.arc(inHandle.x, inHandle.y, 3, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.arc(outHandle.x, outHandle.y, 3, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
    }
}


// Export the main class
window.AdvancedAnimationSystem = AdvancedAnimationSystem;

// Integration code to add to your existing init() function
// Add this after your existing AnimatorTimeline initialization

// Replace your existing AnimatorTimeline with the new AdvancedAnimationSystem
function initializeAdvancedAnimator() {
    // Initialize the advanced animation system
    window.advancedAnimator = new AdvancedAnimationSystem(scene, camera);
    
    // Update the existing button event listener
    const openAnimatorBtn = document.getElementById('open-animator-btn');
    if (openAnimatorBtn) {
        // Remove existing listener
        openAnimatorBtn.removeEventListener('click', () => {
             window.advancedAnimator.open();
        });
        
        // Add new listener for advanced animator
        openAnimatorBtn.addEventListener('click', () => {
            if (player && player.model) {
                window.advancedAnimator.open(player.model);
            } else {
                // Open anyway and let it detect characters automatically
                window.advancedAnimator.open();
            }
        });
    }
    
    // Create the button if it doesn't exist
    if (!openAnimatorBtn) {
        createAnimatorButton();
    }
    
    console.log('✅ Advanced Animator System initialized');
}

function createAnimatorButton() {
    const button = document.createElement('button');
    button.id = 'open-animator-btn';
    button.textContent = 'Open Advanced Animator';
    button.style.cssText = `
        position: fixed;
        top: 80px;
        right: 80px;
        z-index: 9999;
        background: #0066cc;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 5px;
        cursor: pointer;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    
    button.addEventListener('click', () => {
        if (player && player.model) {
            window.advancedAnimator.open(player.model);
        } else {
            window.advancedAnimator.open();
        }
    });
    
    document.body.appendChild(button);
}

// Enhanced character detection system
class CharacterDetectionSystem {
    constructor(mainScene, animator) {
        this.mainScene = mainScene;
        this.animator = animator;
        this.detectedCharacters = new Map();
        this.isWatching = false;
        
        this.init();
    }
    
    init() {
        this.startWatching();
        this.setupSceneObserver();
    }
    
    startWatching() {
        if (this.isWatching) return;
        
        this.isWatching = true;
        this.watchForCharacters();
    }
    
    watchForCharacters() {
        const checkForCharacters = () => {
            if (!this.isWatching) return;
            
            this.scanScene();
            setTimeout(checkForCharacters, 1000); // Check every second
        };
        
        checkForCharacters();
    }
    
    scanScene() {
        const currentCharacters = new Set();
        
        this.mainScene.traverse((object) => {
            if (this.isCharacter(object)) {
                const id = object.uuid;
                currentCharacters.add(id);
                
                if (!this.detectedCharacters.has(id)) {
                    this.onCharacterAdded(object);
                    this.detectedCharacters.set(id, object);
                }
            }
        });
        
        // Check for removed characters
        for (let [id, character] of this.detectedCharacters) {
            if (!currentCharacters.has(id)) {
                this.onCharacterRemoved(character);
                this.detectedCharacters.delete(id);
            }
        }
    }
    
    isCharacter(object) {
        // Check if object is a character based on various criteria
        return (
            object.isSkinnedMesh ||
            (object.isMesh && object.skeleton) ||
            (object.isGroup && this.hasSkeletonInChildren(object)) ||
            (object.type === 'Group' && object.name && 
             (object.name.toLowerCase().includes('character') || 
              object.name.toLowerCase().includes('player') ||
              object.name.toLowerCase().includes('bot')))
        );
    }
    
    hasSkeletonInChildren(group) {
        let hasSkeleton = false;
        group.traverse((child) => {
            if (child.isSkinnedMesh || child.skeleton) {
                hasSkeleton = true;
            }
        });
        return hasSkeleton;
    }
    
    onCharacterAdded(character) {
        console.log('Character detected:', character.name || character.uuid);
        
        // Notify animator
        if (this.animator && this.animator.isOpen) {
            this.animator.loadCharacter(character);
        }
        
        // Dispatch custom event
        const event = new CustomEvent('character-detected', {
            detail: { character }
        });
        document.dispatchEvent(event);
    }
    
    onCharacterRemoved(character) {
        console.log('Character removed:', character.name || character.uuid);
        
        // Dispatch custom event
        const event = new CustomEvent('character-removed', {
            detail: { character }
        });
        document.dispatchEvent(event);
    }
    
    setupSceneObserver() {
        // Listen for scene changes
        document.addEventListener('add-to-scene', (event) => {
            const { object } = event.detail;
            if (this.isCharacter(object)) {
                setTimeout(() => this.scanScene(), 100); // Delay to ensure object is fully added
            }
        });
    }
    
    getDetectedCharacters() {
        return Array.from(this.detectedCharacters.values());
    }
    
    stopWatching() {
        this.isWatching = false;
    }
}

// Enhanced Animation Export/Import System
class AnimationDataManager {
    constructor(animator) {
        this.animator = animator;
    }
    
    exportAnimation(animationName = 'CustomAnimation') {
        if (!this.animator.currentCharacter || this.animator.keyframes.size === 0) {
            console.warn('No character or keyframes to export');
            return null;
        }
        
        const animationData = {
            name: animationName,
            duration: this.animator.duration,
            frameRate: this.animator.frameRate,
            keyframes: {},
            bones: []
        };
        
        // Export keyframes
        this.animator.keyframes.forEach((boneKeyframes, boneId) => {
            const bone = this.animator.findBoneById(boneId);
            if (bone) {
                animationData.bones.push({
                    id: boneId,
                    name: bone.name,
                    uuid: bone.uuid
                });
                
                animationData.keyframes[boneId] = {};
                boneKeyframes.forEach((keyframe, timeKey) => {
                    animationData.keyframes[boneId][timeKey] = { ...keyframe };
                });
            }
        });
        
        return animationData;
    }
    
    importAnimation(animationData) {
        if (!animationData || !this.animator.currentCharacter) {
            console.warn('Invalid animation data or no character loaded');
            return false;
        }
        
        // Clear existing keyframes
        this.animator.keyframes.clear();
        
        // Set animation properties
        this.animator.duration = animationData.duration || 10;
        this.animator.frameRate = animationData.frameRate || 30;
        
        // Import keyframes
        Object.keys(animationData.keyframes).forEach(boneId => {
            const boneKeyframes = animationData.keyframes[boneId];
            const keyframeMap = new Map();
            
            Object.keys(boneKeyframes).forEach(timeKey => {
                keyframeMap.set(timeKey, boneKeyframes[timeKey]);
            });
            
            this.animator.keyframes.set(boneId, keyframeMap);
        });
        
        // Update UI
        this.animator.timeline.render();
        this.animator.graphEditor.render();
        
        console.log('Animation imported successfully:', animationData.name);
        return true;
    }
    
    saveToFile(animationData, filename = 'animation.json') {
        const jsonString = JSON.stringify(animationData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    loadFromFile(callback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const animationData = JSON.parse(e.target.result);
                    callback(animationData);
                } catch (error) {
                    console.error('Error parsing animation file:', error);
                }
            };
            reader.readAsText(file);
        });
        
        input.click();
    }
}

// Animation Presets System
class AnimationPresets {
    constructor(animator) {
        this.animator = animator;
        this.presets = new Map();
        this.initializeDefaultPresets();
    }
    
    initializeDefaultPresets() {
        // Basic walk cycle preset
        this.addPreset('Basic Walk', this.createWalkCycle());
        
        // Idle animation preset
        this.addPreset('Idle Breathing', this.createIdleAnimation());
        
        // Jump animation preset
        this.addPreset('Jump', this.createJumpAnimation());
    }
    
    addPreset(name, animationData) {
        this.presets.set(name, animationData);
    }
    
    applyPreset(name) {
        const preset = this.presets.get(name);
        if (!preset) {
            console.warn('Preset not found:', name);
            return false;
        }
        
        const dataManager = new AnimationDataManager(this.animator);
        return dataManager.importAnimation(preset);
    }
    
    createWalkCycle() {
        return {
            name: 'Basic Walk',
            duration: 1.0,
            frameRate: 30,
            keyframes: {
                // This would contain actual keyframe data for a walk cycle
                // Simplified example - in real implementation, you'd have proper bone transformations
            },
            bones: []
        };
    }
    
    createIdleAnimation() {
        return {
            name: 'Idle Breathing',
            duration: 3.0,
            frameRate: 30,
            keyframes: {
                // Subtle breathing animation keyframes
            },
            bones: []
        };
    }
    
    createJumpAnimation() {
        return {
            name: 'Jump',
            duration: 1.5,
            frameRate: 30,
            keyframes: {
                // Jump animation keyframes
            },
            bones: []
        };
    }
    
    getPresetNames() {
        return Array.from(this.presets.keys());
    }
}

// Animation Blending System
class AnimationBlender {
    constructor(mixer) {
        this.mixer = mixer;
        this.activeAnimations = new Map();
        this.blendSettings = {
            defaultBlendTime: 0.5,
            crossFadeTime: 0.3
        };
    }
    
    playAnimation(clipName, options = {}) {
        const {
            loop = true,
            weight = 1.0,
            blendTime = this.blendSettings.defaultBlendTime,
            crossFade = true
        } = options;
        
        const clip = this.mixer._root.animations?.find(a => a.name === clipName);
        if (!clip) {
            console.warn('Animation clip not found:', clipName);
            return null;
        }
        
        const action = this.mixer.clipAction(clip);
        
        if (crossFade && this.activeAnimations.size > 0) {
            // Cross-fade from current animations
            this.activeAnimations.forEach(activeAction => {
                activeAction.crossFadeTo(action, blendTime, true);
            });
        }
        
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
        action.setEffectiveWeight(weight);
        action.fadeIn(blendTime);
        action.play();
        
        this.activeAnimations.set(clipName, action);
        return action;
    }
    
    stopAnimation(clipName, fadeTime = this.blendSettings.defaultBlendTime) {
        const action = this.activeAnimations.get(clipName);
        if (action) {
            action.fadeOut(fadeTime);
            setTimeout(() => {
                action.stop();
                this.activeAnimations.delete(clipName);
            }, fadeTime * 1000);
        }
    }
    
    blendAnimations(animations, weights) {
        // Blend multiple animations with specified weights
        animations.forEach((clipName, index) => {
            const weight = weights[index] || 0;
            const action = this.activeAnimations.get(clipName);
            if (action) {
                action.setEffectiveWeight(weight);
            }
        });
    }
    
    setAnimationSpeed(clipName, speed) {
        const action = this.activeAnimations.get(clipName);
        if (action) {
            action.setEffectiveTimeScale(speed);
        }
    }
    
    getActiveAnimations() {
        return Array.from(this.activeAnimations.keys());
    }
}

// Integration helper functions
/*function updateAnimateLoopForAdvancedAnimator() {
    // Add this to your existing animate() function after the animatorTimeline update
    
    // Replace this block in your animate() function:
    /*
    if (animatorTimeline) {
        animatorTimeline.update(delta);
    }
    
    
    // With this:
    if (window.advancedAnimator && window.advancedAnimator.isOpen) {
        // Update the advanced animator
        window.advancedAnimator.updateAnimation();
        
        // Render the animation canvas
        if (window.advancedAnimator.animRenderer && 
            window.advancedAnimator.animScene && 
            window.advancedAnimator.animCamera) {
            window.advancedAnimator.animRenderer.render(
                window.advancedAnimator.animScene, 
                window.advancedAnimator.animCamera
            );
        }
    }
    
    // Keep your existing animatorTimeline for backward compatibility
    if (animatorTimeline && (!window.advancedAnimator || !window.advancedAnimator.isOpen)) {
        animatorTimeline.update(delta);
    }
}*/

// GUI Integration
function addAdvancedAnimatorToGUI(gui) {
    if (!window.advancedAnimator) return;
    const animatorFolder = gui.addFolder('Advanced Animator');
    
    const animatorControls = {
        'Open Animator': () => window.advancedAnimator.open(),
        'Close Animator': () => window.advancedAnimator.close(),
        'Export Animation': () => {
            const dataManager = new AnimationDataManager(window.advancedAnimator);
            const animData = dataManager.exportAnimation();
            if (animData) {
                dataManager.saveToFile(animData);
            }
        },
        'Import Animation': () => {
            const dataManager = new AnimationDataManager(window.advancedAnimator);
            dataManager.loadFromFile((data) => {
                dataManager.importAnimation(data);
            });
        },
        'Apply Walk Preset': () => {
            const presets = new AnimationPresets(window.advancedAnimator);
            presets.applyPreset('Basic Walk');
        },
        'Apply Idle Preset': () => {
            const presets = new AnimationPresets(window.advancedAnimator);
            presets.applyPreset('Idle Breathing');
        }
    };
    
    Object.keys(animatorControls).forEach(key => {
        animatorFolder.add(animatorControls, key);
    });
    
    // Animation settings
    const settings = {
        duration: 10,
        frameRate: 30,
        autoDetectCharacters: true
    };
    
    animatorFolder.add(settings, 'duration', 1, 60).onChange((value) => {
        if (window.advancedAnimator) {
            window.advancedAnimator.duration = value;
        }
    });
    
    animatorFolder.add(settings, 'frameRate', 15, 120).onChange((value) => {
        if (window.advancedAnimator) {
            window.advancedAnimator.frameRate = value;
        }
    });
    
    animatorFolder.add(settings, 'autoDetectCharacters').onChange((value) => {
        if (window.characterDetectionSystem) {
            if (value) {
                window.characterDetectionSystem.startWatching();
            } else {
                window.characterDetectionSystem.stopWatching();
            }
        }
    });


}


// Main initialization function to add to your init() function
function initAdvancedAnimationSuite() {
    // Initialize the advanced animator
    initializeAdvancedAnimator();
    
    // Initialize character detection system
    window.characterDetectionSystem = new CharacterDetectionSystem(scene, window.advancedAnimator);
    
    // Add to GUI if it exists
    if (typeof addGUI === 'function' && window.gui) {
        addAdvancedAnimatorToGUI(window.gui);
    }
    
    // Listen for character events
    document.addEventListener('character-detected', (event) => {
        console.log('Character detected event:', event.detail.character);
        
        // Auto-open animator if configured
        if (window.advancedAnimator && !window.advancedAnimator.isOpen) {
            // Optional: Auto-open animator when character is detected
            // window.advancedAnimator.open(event.detail.character);
        }
    });
    
    console.log('✅ Advanced Animation Suite initialized successfully');
}

// Call this function in your init() function after your existing setup
// Add this line to your init() function:
// initAdvancedAnimationSuite();

// Keyboard shortcuts for the animator (global)
document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+A to open animator
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        if (window.advancedAnimator) {
            if (window.advancedAnimator.isOpen) {
                window.advancedAnimator.close();
            } else {
                window.advancedAnimator.open();
            }
        }
    }
    
    // F12 to toggle animator (if not already used by browser)
    if (e.key === 'F12' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (window.advancedAnimator) {
            if (window.advancedAnimator.isOpen) {
                window.advancedAnimator.close();
            } else {
                window.advancedAnimator.open();
            }
        }
    }
});

// Export all classes for external use
window.CharacterDetectionSystem = CharacterDetectionSystem;
window.AnimationDataManager = AnimationDataManager;
window.AnimationPresets = AnimationPresets;
window.AnimationBlender = AnimationBlender;