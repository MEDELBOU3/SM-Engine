/**
 * Advanced Hair Grooming & Physics System for SM Engine
 * Features: Raycast Add Brush, Comb Brush, Verlet Physics, Kajiya-Kay Shading
 */
class AdvancedHairSystem {
    constructor(scene, camera, renderer, targetMesh) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.targetMesh = targetMesh; // The head/body mesh to grow hair on
        
        // System Settings
        this.settings = {
            maxStrands: 50000,
            segmentsPerStrand: 8,
            hairLength: 2.0,
            hairColor: new THREE.Color(0x8a5a3a), // Brown/Copper default
            hairShininess: 40.0,
            brushMode: 'add', // 'add', 'comb', 'cut'
            brushRadius: 1.5,
            brushDensity: 5,  // Hairs added per click/drag
            gravity: -0.05,
            stiffness: 0.85,  // How much hair resists bending
            friction: 0.95
        };

        this.strands = []; // Array of { root: Vector3, normal: Vector3, nodes: [Vector3...] }
        this.isGrooming = false;
        
        this.initGeometry();
        this.initMaterial();
        this.initMesh();
        this.createBrushCursor();
        this.setupControls();
    }

    initGeometry() {
        // Pre-allocate buffer geometry for massive performance
        const maxVertices = this.settings.maxStrands * this.settings.segmentsPerStrand;
        this.geometry = new THREE.BufferGeometry();
        
        this.positions = new Float32Array(maxVertices * 3);
        this.uvs = new Float32Array(maxVertices * 2); // X = segment index (0 to 1 root to tip)
        this.indices = [];

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
        this.geometry.setDrawRange(0, 0);
    }

    initMaterial() {
        // Advanced Kajiya-Kay Anisotropic Hair Shader
        this.material = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib['lights'],
                {
                    baseColor: { value: this.settings.hairColor },
                    specularColor: { value: new THREE.Color(0xffeacc) },
                    shininess: { value: this.settings.hairShininess },
                    lightPosition: { value: new THREE.Vector3(10, 20, 10) } // Sync with your sun
                }
            ]),
            vertexShader: `
                varying vec3 vViewPosition;
                varying vec3 vNormal;
                varying vec2 vUv;
                
                void main() {
                    vUv = uv;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    // Approximate normal by assuming hair points outwards from root
                    vNormal = normalize(normalMatrix * position); 
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 baseColor;
                uniform vec3 specularColor;
                uniform float shininess;
                uniform vec3 lightPosition;
                
                varying vec3 vViewPosition;
                varying vec3 vNormal;
                varying vec2 vUv;
                
                // Kajiya-Kay Specular calculation
                float kajiyaKay(vec3 tangent, vec3 halfVector, float glossiness) {
                    float dotTH = dot(tangent, halfVector);
                    float sinTH = sqrt(1.0 - dotTH * dotTH);
                    float dirAtten = smoothstep(-1.0, 0.0, dotTH);
                    return dirAtten * pow(sinTH, glossiness);
                }

                void main() {
                    // Darken root, lighten tip based on UV (vUv.x is 0 at root, 1 at tip)
                    vec3 color = mix(baseColor * 0.3, baseColor, vUv.x);
                    
                    vec3 viewDir = normalize(vViewPosition);
                    vec3 lightDir = normalize(lightPosition);
                    vec3 halfDir = normalize(lightDir + viewDir);
                    
                    // Strand tangent (approximated along the line)
                    vec3 tangent = normalize(cross(vNormal, vec3(0.0, 1.0, 0.0))); 
                    
                    // Two specular highlights for realistic hair (Primary and Secondary)
                    float spec1 = kajiyaKay(tangent, halfDir, shininess);
                    float spec2 = kajiyaKay(tangent, halfDir, shininess * 0.5) * 0.5;
                    
                    vec3 finalColor = color + (specularColor * spec1) + (baseColor * spec2);
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            lights: true,
            transparent: true,
            depthWrite: true,
            side: THREE.DoubleSide
        });

        // Use LineSegments for extreme performance during grooming
        this.hairMesh = new THREE.LineSegments(this.geometry, this.material);
        this.hairMesh.frustumCulled = false;
        this.scene.add(this.hairMesh);
    }

    createBrushCursor() {
        // Visual indicator for the grooming brush
        const cursorGeo = new THREE.TorusGeometry(1, 0.05, 8, 32);
        const cursorMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true, depthTest: false });
        this.brushCursor = new THREE.Mesh(cursorGeo, cursorMat);
        this.brushCursor.visible = false;
        this.scene.add(this.brushCursor);
    }

    // --- BRUSH & GROOMING LOGIC ---
    
    addHairStrand(rootPos, normal) {
        if (this.strands.length >= this.settings.maxStrands) return;

        let nodes = [];
        const segLen = this.settings.hairLength / this.settings.segmentsPerStrand;
        
        // Build nodes outward along the normal
        for (let i = 0; i <= this.settings.segmentsPerStrand; i++) {
            nodes.push(rootPos.clone().add(normal.clone().multiplyScalar(i * segLen)));
        }

        this.strands.push({
            root: rootPos.clone(),
            normal: normal.clone(),
            nodes: nodes,
            prevNodes: nodes.map(n => n.clone()) // For Verlet physics
        });

        this.updateGeometryBuffers();
    }

    combHairs(center, directionDelta) {
        const radiusSq = this.settings.brushRadius * this.settings.brushRadius;
        
        this.strands.forEach(strand => {
            // Check if strand root is inside brush
            if (strand.root.distanceToSquared(center) < radiusSq) {
                for (let i = 1; i < strand.nodes.length; i++) {
                    // Apply movement. Falloff based on distance from brush center
                    const dist = strand.nodes[i].distanceTo(center);
                    const influence = Math.max(0, 1.0 - (dist / this.settings.brushRadius));
                    strand.nodes[i].add(directionDelta.clone().multiplyScalar(influence * 0.5));
                }
            }
        });
        this.updateGeometryBuffers();
    }

    // --- UPDATE BUFFERS ---

    updateGeometryBuffers() {
        let posIndex = 0;
        let uvIndex = 0;
        let indexArr = [];
        let vCount = 0;

        for (let s = 0; s < this.strands.length; s++) {
            const strand = this.strands[s];
            
            for (let i = 0; i < strand.nodes.length; i++) {
                const node = strand.nodes[i];
                
                this.positions[posIndex++] = node.x;
                this.positions[posIndex++] = node.y;
                this.positions[posIndex++] = node.z;
                
                this.uvs[uvIndex++] = i / (strand.nodes.length - 1); // 0 = root, 1 = tip
                this.uvs[uvIndex++] = 0.5;

                // Create line segments (node 0 to 1, 1 to 2, etc.)
                if (i > 0) {
                    indexArr.push(vCount - 1, vCount);
                }
                vCount++;
            }
        }

        this.geometry.setIndex(indexArr);
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.uv.needsUpdate = true;
        this.geometry.setDrawRange(0, indexArr.length);
    }

    // --- PHYSICS (VERLET INTEGRATION) ---

    updatePhysics(delta) {
        if (!this.strands.length || this.isGrooming) return; // Don't simulate while brushing

        const segLen = this.settings.hairLength / this.settings.segmentsPerStrand;

        for (let s = 0; s < this.strands.length; s++) {
            const strand = this.strands[s];
            
            // Node 0 is the root, it never moves. Update nodes 1 to N
            for (let i = 1; i < strand.nodes.length; i++) {
                let node = strand.nodes[i];
                let prevNode = strand.prevNodes[i];
                
                // Verlet velocity
                let velocity = node.clone().sub(prevNode).multiplyScalar(this.settings.friction);
                
                strand.prevNodes[i].copy(node);
                
                // Apply Gravity & Velocity
                node.add(velocity);
                node.y += this.settings.gravity;

                // Stiffness (pulls hair back towards its original rest shape/normal)
                let restPos = strand.root.clone().add(strand.normal.clone().multiplyScalar(i * segLen));
                node.lerp(restPos, this.settings.stiffness * delta);

                // Distance Constraint (keeps segments correct length)
                let parentNode = strand.nodes[i - 1];
                let dist = node.distanceTo(parentNode);
                let diff = (segLen - dist) / dist;
                node.add(node.clone().sub(parentNode).multiplyScalar(diff * 0.5));

                // Collision with target mesh (basic sphere proxy for head)
                // Replace with raycaster or SDF collision for AAA results
                if (this.targetMesh) {
                    const headCenter = this.targetMesh.position;
                    const headRadius = 2.0; // Estimate
                    if (node.distanceTo(headCenter) < headRadius) {
                        let pushDir = node.clone().sub(headCenter).normalize();
                        node.copy(headCenter.clone().add(pushDir.multiplyScalar(headRadius)));
                    }
                }
            }
        }
        this.updateGeometryBuffers();
    }

    // --- INTERACTION / UI ---

    setupControls() {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let isDragging = false;
        let previousMousePos = new THREE.Vector3();

        this.renderer.domElement.addEventListener('mousemove', (e) => {
            if (!this.targetMesh) return;
            
            const rect = this.renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, this.camera);
            const intersects = raycaster.intersectObject(this.targetMesh, true);

            if (intersects.length > 0) {
                const hit = intersects[0];
                this.brushCursor.visible = true;
                this.brushCursor.position.copy(hit.point);
                this.brushCursor.lookAt(hit.point.clone().add(hit.face.normal));
                this.brushCursor.scale.setScalar(this.settings.brushRadius);

                if (isDragging) {
                    this.isGrooming = true;
                    if (this.settings.brushMode === 'add') {
                        // Scatter hairs randomly inside brush radius
                        for(let i=0; i<this.settings.brushDensity; i++) {
                            const offset = new THREE.Vector3(
                                (Math.random() - 0.5) * this.settings.brushRadius,
                                (Math.random() - 0.5) * this.settings.brushRadius,
                                (Math.random() - 0.5) * this.settings.brushRadius
                            );
                            this.addHairStrand(hit.point.clone().add(offset), hit.face.normal);
                        }
                    } else if (this.settings.brushMode === 'comb') {
                        const deltaMove = hit.point.clone().sub(previousMousePos);
                        this.combHairs(hit.point, deltaMove);
                    }
                    previousMousePos.copy(hit.point);
                }
            } else {
                this.brushCursor.visible = false;
            }
        });

        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if(e.button === 0) { // Left click
                isDragging = true;
                if(this.brushCursor.visible) previousMousePos.copy(this.brushCursor.position);
            }
        });

        this.renderer.domElement.addEventListener('mouseup', () => {
            isDragging = false;
            this.isGrooming = false; // Resume physics
        });
    }
}