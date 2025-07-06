
  
  // Paste CLASS NodeConnection (Enhanced) here
        class NodeConnection {
            constructor(startSocket, endSocket, editor, options = {}) {
                // ... (Full class code from previous response)
                if (!startSocket || !endSocket || !editor) {
                    console.error("NodeConnection: Missing startSocket, endSocket, or editor instance.");
                    return;
                }
                this.startSocket = startSocket;
                this.endSocket = endSocket;
                this.editor = editor; // Store a direct reference to the editor
                this.sourceNode = startSocket.closest('.node');
                this.targetNode = endSocket.closest('.node');

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
                    ...options
                };

                this.element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this.interactionElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this.arrowhead = this.options.showArrow ? document.createElementNS('http://www.w3.org/2000/svg', 'path') : null;
                this.isSelected = false;
                this.dashOffset = 0;
                this.animationFrameId = null;
                this.lastTimestamp = null;

                this.initConnection();
                this.addEventListeners();
                if (this.options.dashed) {
                    this.startDashAnimation();
                }
            }

            initConnection() {
                const svg = this.editor.svg;
                if (!svg) {
                    console.error('NodeConnection: SVG layer not found in NodeEditor instance.');
                    return;
                }

                this.element.setAttribute('stroke', this.options.color);
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

                // Insert interaction element before visual element for z-ordering
                svg.appendChild(this.interactionElement);
                svg.appendChild(this.element);


                if (this.arrowhead) {
                    this.arrowhead.setAttribute('class', 'node-connection-arrow');
                    this.arrowhead.setAttribute('fill', this.options.color);
                    svg.appendChild(this.arrowhead); // Arrowhead on top
                }
                this.update();
            }

            addEventListeners() {
                this.interactionElement.addEventListener('mouseenter', () => {
                    if (!this.isSelected) {
                        this.element.setAttribute('stroke', this.options.hoverColor);
                        // Dynamic stroke width on hover based on current scale
                        this.element.setAttribute('stroke-width', ((this.options.strokeWidth * 1.2) / this.editor.scale).toFixed(2) );
                        if (this.arrowhead) this.arrowhead.setAttribute('fill', this.options.hoverColor);
                        this.element.classList.add('hovered');
                    }
                });

                this.interactionElement.addEventListener('mouseleave', () => {
                    if (!this.isSelected) {
                        this.element.setAttribute('stroke', this.options.color);
                        this.element.setAttribute('stroke-width', (this.options.strokeWidth / this.editor.scale).toFixed(2));
                        if (this.arrowhead) this.arrowhead.setAttribute('fill', this.options.color);
                        this.element.classList.remove('hovered');
                    }
                });

                this.interactionElement.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    this.editor.selectConnection(this);
                });
                 this.interactionElement.addEventListener('dblclick', (e) => {
                    e.stopPropagation(); // Prevent editor pan or other actions
                    // Confirm deletion
                    if (window.confirm("Delete this connection?")) { // Use window.confirm for standard dialog
                        this.editor.deleteConnection(this);
                    }
                });
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

                const startIsOutput = this.startSocket.classList.contains('output') || this.startSocket.dataset.socketType === 'output'; // Check data attribute too
                const endIsInput = this.endSocket.classList.contains('input') || this.endSocket.dataset.socketType === 'input';

                let pathData;
                // A common strategy: if start is to the left of end, use a simple curve. Otherwise, S-curve.
                if (startPos.x < endPos.x - 10 ) { // Standard L-to-R flow with some tolerance
                    pathData = `M ${startPos.x},${startPos.y} C ${startPos.x + controlOffset},${startPos.y} ${endPos.x - controlOffset},${endPos.y} ${endPos.x},${endPos.y}`;
                } else { // S-curve for feedback loops or right-to-left connections
                    const midY = startPos.y + dy / 2;
                    const xOffsetDirection = startIsOutput ? 1 : -1; // Adjust based on output/input for natural curve
                    pathData = `M ${startPos.x},${startPos.y} C ${startPos.x + controlOffset * xOffsetDirection},${startPos.y} ${startPos.x + controlOffset * xOffsetDirection},${midY} ${startPos.x + dx/2},${midY} S ${endPos.x - controlOffset * xOffsetDirection},${midY} ${endPos.x - controlOffset * xOffsetDirection},${endPos.y} C ${endPos.x - controlOffset * xOffsetDirection},${endPos.y} ${endPos.x},${endPos.y}`;
                }


                this.element.setAttribute('d', pathData);
                this.interactionElement.setAttribute('d', pathData);

                const currentScale = this.editor.scale;
                const visualStrokeWidth = (this.element.classList.contains('hovered') || this.isSelected) ? (this.options.strokeWidth * 1.2) / currentScale : this.options.strokeWidth / currentScale;
                this.element.setAttribute('stroke-width', visualStrokeWidth.toFixed(2));
                this.interactionElement.setAttribute('stroke-width', ((this.options.strokeWidth + 12) / currentScale).toFixed(2));

                if (this.options.dashed) {
                     const dashValue = (5 / currentScale).toFixed(2);
                    this.element.setAttribute('stroke-dasharray', `${dashValue},${dashValue}`);
                }

                if (this.arrowhead) {
                    this.drawArrowhead(endPos, startPos, currentScale);
                }
            }

            drawArrowhead(tip, preTip, scale) {
                if(Math.abs(tip.x - preTip.x) < 0.1 && Math.abs(tip.y - preTip.y) < 0.1) return; // Avoid NaN from atan2 if points are same

                const angle = Math.atan2(tip.y - preTip.y, tip.x - preTip.x);
                const arrowSize = this.options.arrowSize / scale;

                // Sharper arrowhead by reducing angle spread
                const arrowAngle = Math.PI / 8; // Was PI / 7

                const x1 = tip.x - arrowSize * Math.cos(angle - arrowAngle);
                const y1 = tip.y - arrowSize * Math.sin(angle - arrowAngle);
                const x2 = tip.x - arrowSize * Math.cos(angle + arrowAngle);
                const y2 = tip.y - arrowSize * Math.sin(angle + arrowAngle);

                this.arrowhead.setAttribute('d', `M ${tip.x.toFixed(2)},${tip.y.toFixed(2)} L ${x1.toFixed(2)},${y1.toFixed(2)} L ${x2.toFixed(2)},${y2.toFixed(2)} Z`);
            }


            setSelected(selected) {
                this.isSelected = selected;
                const isHovered = this.element.classList.contains('hovered');
                let currentColor = this.options.color;
                if (this.isSelected) {
                    currentColor = this.options.selectedColor;
                } else if (isHovered) {
                    currentColor = this.options.hoverColor;
                }
                this.element.setAttribute('stroke', currentColor);
                const strokeWidth = (this.isSelected || isHovered) ? (this.options.strokeWidth * 1.2) / this.editor.scale : this.options.strokeWidth / this.editor.scale;
                this.element.setAttribute('stroke-width', strokeWidth.toFixed(2));

                if (this.arrowhead) this.arrowhead.setAttribute('fill', currentColor);
                this.element.classList.toggle('selected', this.isSelected);
            }

            startDashAnimation() {
                if (this.animationFrameId || !this.options.dashed || !this.element.isConnected) return;
                const animate = (timestamp) => {
                    if(!this.element.isConnected) {
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

            remove() {
                this.stopDashAnimation();
                if (this.element && this.element.parentNode) this.element.remove();
                if (this.interactionElement && this.interactionElement.parentNode) this.interactionElement.remove();
                if (this.arrowhead && this.arrowhead.parentNode) this.arrowhead.remove();
            }
        }


      
        // Paste CLASS WaterEffect (Significantly Enhanced) here
        class WaterEffect {
            constructor(object, properties = {}) {
                // ... (Full class code from previous response)
                this.object = object;
                this.scene = sceneInstance || object.parent || window.scene;
                this.camera = cameraInstance || window.camera; 

                this.properties = {
                    flowDirection: new THREE.Vector2(properties.flowDirection?.x || 1.0, properties.flowDirection?.y || 0.3),
                    distortionScale: parseFloat(properties.distortionScale) || 30.0,
                    sunDirection: new THREE.Vector3(properties.sunDirection?.x || 0.8, properties.sunDirection?.y || 0.8, properties.sunDirection?.z || 0.5).normalize(),
                    sunColor: new THREE.Color(properties.sunColor || 0xfff5e1),
                    waterColor: new THREE.Color(properties.waterColor || 0x003f5e),
                    eye: new THREE.Vector3(),
                    size: parseFloat(properties.size) || 1.0,
                    alpha: parseFloat(properties.alpha) || 0.9,
                    noiseScale: parseFloat(properties.noiseScale) || 0.1,
                    waterHeight: parseFloat(properties.waterHeight) || 0.0,
                    rippleStrength: parseFloat(properties.rippleStrength) || 0.1,
                    shininess: parseFloat(properties.shininess) || 80.0,
                    reflectivity: parseFloat(properties.reflectivity) || 0.7,
                    refractionRatio: parseFloat(properties.refractionRatio) || 0.97,
                    foamColor: new THREE.Color(properties.foamColor || 0xe6f2ff),
                    foamThreshold: parseFloat(properties.foamThreshold) || 0.6,
                    foamSoftness: parseFloat(properties.foamSoftness) || 0.1,
                    flowRate: parseFloat(properties.flowRate) || 1.0, // Kept for uTime speed
                    viscosity: parseFloat(properties.viscosity) || 0.5, // Can influence fresnel or distortion
                    surfaceTension: parseFloat(properties.surfaceTension) || 0.8, // Can influence fresnel power
                    ...properties
                };
                 if (properties.waterOpacity !== undefined) this.properties.alpha = parseFloat(properties.waterOpacity);


                const textureLoader = new THREE.TextureLoader();
                // !!! REPLACE THESE PATHS !!!
                const normalMapPath = 'https://threejs.org/examples/textures/waternormals.jpg'; // Placeholder
                this.normalSampler = textureLoader.load(normalMapPath, undefined, undefined, () => {
                    console.warn(`WaterEffect: Failed to load normal map from ${normalMapPath}. Using fallback.`);
                    const data = new Uint8Array([128, 128, 255, 255]); // Flat normal (0,0,1)
                    this.normalSampler = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
                    this.normalSampler.needsUpdate = true;
                    if(this.waterMaterial) this.waterMaterial.uniforms.uNormalSampler.value = this.normalSampler;
                });
                this.normalSampler.wrapS = this.normalSampler.wrapT = THREE.RepeatWrapping;


                const cubeTextureLoader = new THREE.CubeTextureLoader();
                // !!! REPLACE THESE PATHS !!!
                const envMapBasePath = 'https://threejs.org/examples/textures/cube/Bridge2/'; // Placeholder
                this.envMapSampler = cubeTextureLoader.setPath(envMapBasePath)
                    .load(
                        ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'],
                        undefined, undefined,
                        () => {
                            console.warn(`WaterEffect: Failed to load environment map from ${envMapBasePath}. Reflections will be black.`);
                            // Create a fallback cubemap (e.g., solid color)
                            const size = 32;
                            const data = new Uint8Array(size * size * 6 * 4); // R,G,B,A
                            for(let i=0; i < data.length; i+=4) { // Dark grey fallback
                                data[i] = 50; data[i+1] = 50; data[i+2] = 50; data[i+3] = 255;
                            }
                            const fallbackCubeTex = new THREE.CubeTexture();
                            for(let i=0; i<6; ++i) {
                                fallbackCubeTex.images[i] = new THREE.DataTexture(data.slice(i*size*size*4, (i+1)*size*size*4), size, size, THREE.RGBAFormat);
                                fallbackCubeTex.images[i].needsUpdate = true;
                            }
                            fallbackCubeTex.needsUpdate = true;
                            this.envMapSampler = fallbackCubeTex;
                            if(this.waterMaterial) this.waterMaterial.uniforms.uEnvMapSampler.value = this.envMapSampler;
                        }
                    );
                this.envMapSampler.mapping = THREE.CubeReflectionMapping;


                this.originalMaterial = object.material;
                this.waterMaterial = this.createWaterMaterial();
                this.object.material = this.waterMaterial;
            }

            createWaterMaterial() {
                // ... (Full shader material code from previous response)
                 return new THREE.ShaderMaterial({
                    uniforms: THREE.UniformsUtils.merge([
                        THREE.UniformsLib.lights,
                        {
                            uTime: { value: 0.0 },
                            uFlowDirection: { value: this.properties.flowDirection },
                            uDistortionScale: { value: this.properties.distortionScale },
                            uSunDirection: { value: this.properties.sunDirection },
                            uSunColor: { value: this.properties.sunColor },
                            uWaterColor: { value: this.properties.waterColor },
                            uEye: { value: this.properties.eye },
                            uSize: { value: this.properties.size },
                            uAlpha: { value: this.properties.alpha },
                            uNoiseScale: { value: this.properties.noiseScale },
                            uNormalSampler: { value: this.normalSampler },
                            uEnvMapSampler: { value: this.envMapSampler },
                            uWaterHeight: { value: this.properties.waterHeight },
                            uRippleStrength: { value: this.properties.rippleStrength },
                            uShininess: { value: this.properties.shininess },
                            uReflectivity: { value: this.properties.reflectivity },
                            uRefractionRatio: { value: this.properties.refractionRatio },
                            uFoamColor: { value: this.properties.foamColor },
                            uFoamThreshold: { value: this.properties.foamThreshold },
                            uFoamSoftness: { value: this.properties.foamSoftness },
                            uModelMatrix: { value: this.object.matrixWorld },
                        }
                    ]),
                    vertexShader: `
                        uniform float uTime;
                        uniform float uSize;
                        uniform float uWaterHeight;
                        uniform float uRippleStrength;

                        varying vec3 vWorldPosition;
                        varying vec3 vSurfaceNormal;
                        varying vec2 vUv;
                        varying float vWaveHeightFactor;

                        // Gerstner Wave function components
                        // P: position on the plane (x,z)
                        // D: wave direction (unit vector)
                        // A: amplitude
                        // L: wavelength
                        // S: speed modifier
                        // steepness: Q factor (0 to 1, 1 is sharpest crest)
                        // t: time
                        vec3 gerstnerWave(vec2 P, vec2 D, float steepness, float A, float L, float S, float t) {
                            float k = 2.0 * PI / L;        // wave number
                            float c = sqrt(9.8 / k) * S; // phase speed (gravity_constant / k)
                            float f = k * (dot(D, P) - c * t);
                            float qa = steepness / (k * A + 0.0001); // Q factor for steepness (avoid div by zero)

                            return vec3(
                                D.x * qa * A * cos(f), // Horizontal displacement X
                                A * sin(f),            // Vertical displacement Y
                                D.y * qa * A * cos(f)  // Horizontal displacement Z
                            );
                        }

                        // Derivatives for normal calculation
                        // dX/du, dY/du, dZ/du (where u is one of the plane's axes, e.g., x)
                        // dX/dv, dY/dv, dZ/dv (where v is the other plane axis, e.g., z)
                        vec3 dGerstner_dParam(vec2 P, vec2 D, float steepness, float A, float L, float S, float t, vec2 dP_dParam) {
                            float k = 2.0 * PI / L;
                            float c = sqrt(9.8 / k) * S;
                            float f = k * (dot(D, P) - c * t);
                            float qa = steepness / (k * A + 0.0001);
                            float commonFactor = -qa * A * k * sin(f);

                            return vec3(
                                D.x * commonFactor * dot(D, dP_dParam), // d(Horizontal X)/dParam
                                A * k * cos(f) * dot(D, dP_dParam),     // d(Vertical Y)/dParam
                                D.y * commonFactor * dot(D, dP_dParam)  // d(Horizontal Z)/dParam
                            );
                        }


                        void main() {
                            vUv = uv * uSize; // Tile UVs for texture sampling, not for wave math
                            vec3 pos = position;
                            vec3 accumulatedDisplacement = vec3(0.0);

                            // Derivatives of the sum of displacements w.r.t. original x and z
                            vec3 sum_dP_dx = vec3(1.0, 0.0, 0.0); // Start with (1,0,0) for dx component of tangent
                            vec3 sum_dP_dz = vec3(0.0, 0.0, 1.0); // Start with (0,0,1) for dz component of bitangent

                            // Wave 1
                            float A1 = 0.05 * uRippleStrength; float L1 = 2.0; float S1 = 1.0; vec2 D1 = normalize(vec2(0.7, 0.7));
                            vec3 wave1_disp = gerstnerWave(position.xz, D1, 0.8, A1, L1, S1, uTime);
                            accumulatedDisplacement += wave1_disp;
                            sum_dP_dx += dGerstner_dParam(position.xz, D1, 0.8, A1, L1, S1, uTime, vec2(1.0, 0.0));
                            sum_dP_dz += dGerstner_dParam(position.xz, D1, 0.8, A1, L1, S1, uTime, vec2(0.0, 1.0));

                            // Wave 2
                            float A2 = 0.03 * uRippleStrength; float L2 = 1.2; float S2 = 1.5; vec2 D2 = normalize(vec2(-0.5, 0.8));
                            vec3 wave2_disp = gerstnerWave(position.xz, D2, 0.6, A2, L2, S2, uTime);
                            accumulatedDisplacement += wave2_disp;
                            sum_dP_dx += dGerstner_dParam(position.xz, D2, 0.6, A2, L2, S2, uTime, vec2(1.0, 0.0));
                            sum_dP_dz += dGerstner_dParam(position.xz, D2, 0.6, A2, L2, S2, uTime, vec2(0.0, 1.0));

                            // Wave 3
                            float A3 = 0.02 * uRippleStrength; float L3 = 0.7; float S3 = 2.0; vec3 D3 = normalize(vec2(0.3, -1.0));
                            vec3 wave3_disp = gerstnerWave(position.xz, D3, 0.9, A3, L3, S3, uTime);
                            accumulatedDisplacement += wave3_disp;
                            sum_dP_dx += dGerstner_dParam(position.xz, D3, 0.9, A3, L3, S3, uTime, vec2(1.0, 0.0));
                            sum_dP_dz += dGerstner_dParam(position.xz, D3, 0.9, A3, L3, S3, uTime, vec2(0.0, 1.0));

                            pos += accumulatedDisplacement;
                            pos.y += uWaterHeight;

                            vSurfaceNormal = normalize(cross(sum_dP_dx, sum_dP_dz));
                            vWaveHeightFactor = clamp( (accumulatedDisplacement.y / ( (A1+A2+A3) * 0.8 + 0.001)) , 0.0, 1.0);

                            vec4 worldPos = modelMatrix * vec4(pos, 1.0);
                            vWorldPosition = worldPos.xyz;

                            gl_Position = projectionMatrix * viewMatrix * worldPos;
                        }
                    `,
                    fragmentShader: `
                        uniform float uTime;
                        uniform vec2 uFlowDirection;
                        uniform float uDistortionScale;
                        uniform vec3 uSunDirection;
                        uniform vec3 uSunColor;
                        uniform vec3 uWaterColor;
                        uniform vec3 uEye;
                        uniform float uAlpha;
                        uniform float uNoiseScale;
                        uniform sampler2D uNormalSampler;
                        uniform samplerCube uEnvMapSampler;
                        uniform float uShininess;
                        uniform float uReflectivity;
                        uniform float uRefractionRatio;
                        uniform vec3 uFoamColor;
                        uniform float uFoamThreshold;
                        uniform float uFoamSoftness;

                        varying vec3 vWorldPosition;
                        varying vec3 vSurfaceNormal; // Geometric wave normal from vertex shader
                        varying vec2 vUv;            // Tiled UVs for normal map
                        varying float vWaveHeightFactor; // For foam

                        float fresnelSchlick(float cosTheta, float F0) {
                            float R = F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
                            return clamp(R, 0.0, 1.0);
                        }

                        float simpleNoise(vec2 st) {
                            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                        }

                        // Perturb normal using a normal map in world space
                        // Assumes T, B are orthogonal to N and N is normalized
                        vec3 perturbNormalArb(vec3 surf_norm, vec3 surf_pos, vec2 dHdxy) {
                            vec3 vSigmaX = dFdx(surf_pos);
                            vec3 vSigmaY = dFdy(surf_pos);
                            vec3 vN = surf_norm; // normalized surface normal

                            vec3 R1 = cross(vSigmaY, vN);
                            vec3 R2 = cross(vN, vSigmaX);

                            float fDet = dot(vSigmaX, R1);
                             fDet = sign(fDet) * max(abs(fDet), 0.0001); // Add epsilon to avoid division by zero

                            vec3 vT = normalize( (R1 * vSigmaX.x) - (R2 * vSigmaY.x) ) / fDet;
                            vec3 vB = normalize( cross(vN, vT) ); // Recompute B to ensure orthogonality
                            mat3 TBN = mat3(vT, vB, vN);

                            return normalize(TBN * vec3(dHdxy.x, dHdxy.y, 1.0));
                        }


                        void main() {
                            vec2 flowSpeed1 = vec2(0.03, 0.015);
                            vec2 flowSpeed2 = vec2(-0.02, 0.025);
                            vec2 normal_uv1 = vUv * uDistortionScale + uFlowDirection * uTime * flowSpeed1.x; // uDistortionScale for tiling normal map
                            vec2 normal_uv2 = vUv * uDistortionScale * 0.7 - uFlowDirection * uTime * flowSpeed2.y;

                            vec3 normalMapVal1 = texture2D(uNormalSampler, normal_uv1).rgb * 2.0 - 1.0;
                            vec3 normalMapVal2 = texture2D(uNormalSampler, normal_uv2).rgb * 2.0 - 1.0;
                            vec2 blendedNormalMap_dHdxy = (normalMapVal1.xy * 0.6 + normalMapVal2.xy * 0.4); // Blend in tangent space components

                            // Use dFdx/dFdy to create TBN for normal mapping in world space
                            // vec3 worldNormal = perturbNormalArb(normalize(vSurfaceNormal), vWorldPosition, blendedNormalMap_dHdxy * uNoiseScale); // uNoiseScale for strength of normal map
                            // Simplified: Assume vSurfaceNormal is mostly correct and just add a bit of texture normal.
                            // A proper TBN calculation or using standard derivatives is better.
                             vec3 worldNormal = normalize(vSurfaceNormal + (normalMapVal1 + normalMapVal2) * 0.05 * uNoiseScale);


                            vec3 viewDir = normalize(uEye - vWorldPosition);

                            // Reflection
                            vec3 reflectDir = reflect(-viewDir, worldNormal);
                            vec4 skyColor = textureCube(uEnvMapSampler, reflectDir);

                            // Refraction (simplified)
                            float depthFactor = smoothstep(0.0, 2.0 * 0.1 + 0.1, -vWorldPosition.y + uEye.y); // Assumes water level is around y=0
                            vec3 deepWaterColor = uWaterColor * 0.4;
                            vec3 shallowWaterColor = uWaterColor * 1.1;
                            vec3 refractedBaseColor = mix(deepWaterColor, shallowWaterColor, depthFactor);

                            vec3 refractDir = refract(-viewDir, worldNormal, uRefractionRatio);
                            vec4 refractedEnvColor = textureCube(uEnvMapSampler, refractDir); // Sample env map for pseudo-refraction
                            refractedBaseColor = mix(refractedBaseColor, refractedEnvColor.rgb * 0.3, 0.2 + 0.3 * (1.0 - depthFactor));


                            // Fresnel
                            float F0 = 0.028; // Typical F0 for water
                            float fresnel = fresnelSchlick(max(dot(worldNormal, viewDir), 0.0), F0);
                            fresnel = mix(fresnel, 1.0, uReflectivity);

                            // Specular
                            vec3 L = normalize(uSunDirection);
                            vec3 H = normalize(L + viewDir);
                            float NdotH = max(dot(worldNormal, H), 0.0);
                            float specular = pow(NdotH, uShininess);
                            vec3 specularColor = uSunColor * specular * (1.0 - fresnel); // Less specular direct on, more at glancing with fresnel on reflection

                            // Foam
                            float foamPattern = simpleNoise(vUv * 8.0 + uTime * 0.2); // Noise for foam shape
                            float foam = smoothstep(uFoamThreshold - uFoamSoftness, uFoamThreshold + uFoamSoftness, vWaveHeightFactor + foamPattern * 0.05);
                            foam *= smoothstep(0.1, 0.3, vWaveHeightFactor); // More foam on higher waves

                            // Combine
                            vec3 finalColor = mix(refractedBaseColor, skyColor.rgb, fresnel);
                            finalColor += specularColor;
                            finalColor = mix(finalColor, uFoamColor, foam);

                            gl_FragColor = vec4(finalColor, uAlpha);
                        }
                    `,
                    transparent: true,
                    side: THREE.DoubleSide,
                    lights: false
                });
            }

            update(deltaTime) {
                // ... (Full method code from previous response)
                if (this.waterMaterial && this.waterMaterial.uniforms) {
                    this.waterMaterial.uniforms.uTime.value += deltaTime * (this.properties.flowRate || 1.0);
                    if (this.camera) {
                        this.camera.getWorldPosition(this.waterMaterial.uniforms.uEye.value);
                    }
                    this.waterMaterial.uniforms.uModelMatrix.value.copy(this.object.matrixWorld);
                }
            }

            cleanup() {
                // ... (Full method code from previous response)
                if (this.object && this.originalMaterial) {
                    this.object.material = this.originalMaterial;
                }
                if (this.waterMaterial) this.waterMaterial.dispose();
                if (this.normalSampler) this.normalSampler.dispose();
                if (this.envMapSampler) this.envMapSampler.dispose();
            }

            setProperties(newProperties) {
                // ... (Full method code from previous response, ensure mapping for old names like waterOpacity)
                if (newProperties.waterOpacity !== undefined && this.properties.alpha !== undefined) {
                    newProperties.alpha = newProperties.waterOpacity;
                }

                for (const key in newProperties) {
                    if (this.properties.hasOwnProperty(key)) {
                        const propertyValue = newProperties[key];
                        const uniformName = `u${key.charAt(0).toUpperCase() + key.slice(1)}`;

                        if (this.waterMaterial.uniforms[uniformName]) {
                            const uniform = this.waterMaterial.uniforms[uniformName];
                            if (propertyValue instanceof THREE.Color) {
                                this.properties[key].set(propertyValue); // property is THREE.Color
                                uniform.value.set(propertyValue);
                            } else if (propertyValue instanceof THREE.Vector2) {
                                if (!this.properties[key] || !this.properties[key].isVector2) this.properties[key] = new THREE.Vector2();
                                this.properties[key].copy(propertyValue);
                                uniform.value.copy(propertyValue);
                            } else if (propertyValue instanceof THREE.Vector3) {
                                 if (!this.properties[key] || !this.properties[key].isVector3) this.properties[key] = new THREE.Vector3();
                                this.properties[key].copy(propertyValue);
                                uniform.value.copy(propertyValue);
                            } else if (typeof propertyValue === 'object' && propertyValue !== null && (propertyValue.x !== undefined || propertyValue.r !== undefined)) {
                                if (uniform.value.isColor) {
                                     if(!this.properties[key] || !this.properties[key].isColor) this.properties[key] = new THREE.Color();
                                    this.properties[key].setRGB(propertyValue.r ?? propertyValue.x ?? 0, propertyValue.g ?? propertyValue.y ?? 0, propertyValue.b ?? propertyValue.z ?? 0);
                                    uniform.value.set(this.properties[key]);
                                } else if (uniform.value.isVector2) {
                                     if(!this.properties[key] || !this.properties[key].isVector2) this.properties[key] = new THREE.Vector2();
                                    this.properties[key].set(propertyValue.x ?? 0, propertyValue.y ?? 0);
                                    uniform.value.set(propertyValue.x ?? 0, propertyValue.y ?? 0);
                                } else if (uniform.value.isVector3) {
                                     if(!this.properties[key] || !this.properties[key].isVector3) this.properties[key] = new THREE.Vector3();
                                    this.properties[key].set(propertyValue.x ?? 0, propertyValue.y ?? 0, propertyValue.z ?? 0);
                                    uniform.value.set(propertyValue.x ?? 0, propertyValue.y ?? 0, propertyValue.z ?? 0);
                                }
                            } else {
                                const parsedValue = parseFloat(propertyValue);
                                if (!isNaN(parsedValue)) {
                                    this.properties[key] = parsedValue;
                                    uniform.value = parsedValue;
                                }
                            }
                        } else { // Property might not be a direct uniform but used in logic (e.g. flowRate)
                            this.properties[key] = propertyValue;
                        }
                    }
                }
            }
        }

        // Paste CLASS ParticleEffect (New) here
        class ParticleEffect {
            constructor(targetObject, properties = {}) {
                // ... (Full class code from previous response)
                this.targetObject = targetObject;
                this.scene = targetObject.parent || window.scene;

                this.properties = {
                    intensity: parseFloat(properties.intensity) || 0.5,
                    particleColor: new THREE.Color(properties.particleColor || 0xffffff),
                    particleSpeed: parseFloat(properties.particleSpeed) || 1.0,
                    particleSize: parseFloat(properties.particleSize) || 0.1,
                    particleLifetime: parseFloat(properties.particleLifetime) || 2.0,
                    particleGravity: parseFloat(properties.particleGravity) || 0.0,
                    particleTurbulence: parseFloat(properties.particleTurbulence) || 0.2,
                    // shape: properties.shape || 'sprite', // 'sprite', 'sphere', 'box'
                    spriteTexturePath: properties.spriteTexturePath || 'https://threejs.org/examples/textures/sprites/disc.png', // Placeholder
                    emissionRateFactor: parseFloat(properties.emissionRateFactor) || 2000, // particles/sec at intensity 1
                    ...properties
                };
                this.properties.emissionRate = this.properties.intensity * this.properties.emissionRateFactor;


                this.particleCount = Math.ceil(this.properties.emissionRate * this.properties.particleLifetime * 1.2); // Max particles based on rate & lifetime + buffer
                this.particleCount = Math.min(this.particleCount, 20000); // Hard cap
                this.activeParticleCount = 0;
                this.timeToEmit = 0;

                this.geometry = new THREE.BufferGeometry();
                this.positions = new Float32Array(this.particleCount * 3);
                this.velocities = new Float32Array(this.particleCount * 3);
                this.colors = new Float32Array(this.particleCount * 3); // Per-particle color variance
                this.sizes = new Float32Array(this.particleCount);
                this.ages = new Float32Array(this.particleCount); // Current age
                this.lifetimes = new Float32Array(this.particleCount); // Max lifetime for this particle
                this.ageNormalized = new Float32Array(this.particleCount); // Age normalized (0-1) for shader

                this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
                this.geometry.setAttribute('particleColor', new THREE.BufferAttribute(this.colors, 3)); // Renamed for clarity
                this.geometry.setAttribute('particleSize', new THREE.BufferAttribute(this.sizes, 1));
                this.geometry.setAttribute('ageNormalized', new THREE.BufferAttribute(this.ageNormalized, 1));


                const textureLoader = new THREE.TextureLoader();
                this.particleTexture = textureLoader.load(this.properties.spriteTexturePath, undefined, undefined, () => {
                    console.warn(`ParticleEffect: Failed to load sprite texture from ${this.properties.spriteTexturePath}. Using fallback.`);
                    const data = new Uint8Array([255, 255, 255, 255,  200,200,200,255,  150,150,150,255,  100,100,100,255]); // 2x2
                    this.particleTexture = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
                    this.particleTexture.needsUpdate = true;
                    if(this.material) this.material.uniforms.uTexture.value = this.particleTexture;
                });


                this.material = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0.0 },
                        uTexture: { value: this.particleTexture },
                        uGlobalColor: { value: new THREE.Color(this.properties.particleColor) } // Ensure it's a THREE.Color
                    },
                    vertexShader: `
                        attribute float particleSize;
                        attribute vec3 particleColor;
                        attribute float ageNormalized; // Age from 0 (birth) to 1 (death)

                        varying vec3 vColor;
                        varying float vAlpha;

                        void main() {
                            vColor = particleColor;
                            // Fade out based on age, make it sharper
                            vAlpha = 1.0 - pow(ageNormalized, 2.0); 
                            // Size can also decrease with age
                            float sizeFactor = 1.0 - pow(ageNormalized, 3.0);


                            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                            // Make point size smaller at further distances, larger up close, but not excessively so.
                            float pointScale = 200.0 / (-mvPosition.z + 1.0); // Add 1 to avoid div by zero if z is 0
                            gl_PointSize = particleSize * sizeFactor * clamp(pointScale, 0.5, 5.0); // Clamp scale
                            gl_Position = projectionMatrix * mvPosition;
                        }
                    `,
                    fragmentShader: `
                        uniform sampler2D uTexture;
                        uniform vec3 uGlobalColor;

                        varying vec3 vColor;
                        varying float vAlpha;

                        void main() {
                            if (vAlpha < 0.01) discard; // Early discard for fully faded particles

                            vec4 texColor = texture2D(uTexture, gl_PointCoord);
                            if (texColor.a < 0.1) discard; // Discard transparent parts of sprite

                            gl_FragColor = vec4(vColor * uGlobalColor, texColor.a * vAlpha);
                        }
                    `,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    vertexColors: false // Using attribute `particleColor` explicitly now
                });

                this.particleSystem = new THREE.Points(this.geometry, this.material);
                // Emitter is relative to the targetObject's local space
                this.targetObject.add(this.particleSystem);

                this.initializeParticles();
            }

            initializeParticles() {
                for (let i = 0; i < this.particleCount; i++) {
                    this.ages[i] = Infinity; // Mark as dead
                    this.ageNormalized[i] = 1.0; // Fully aged for shader
                    this.positions[i * 3 + 1] = -9999; // Move off-screen
                }
                this.geometry.attributes.position.needsUpdate = true;
                this.geometry.attributes.ageNormalized.needsUpdate = true;
            }

            emitParticle(index) {
                const i3 = index * 3;
                // Emission volume (e.g., a small sphere or box around origin of targetObject)
                const emitRadius = 0.1; // Example: emit from a small sphere
                const r = emitRadius * Math.sqrt(Math.random()); // Distribute uniformly in sphere
                const theta = Math.random() * 2 * Math.PI;
                const phi = Math.acos(2 * Math.random() - 1);

                this.positions[i3 + 0] = r * Math.sin(phi) * Math.cos(theta);
                this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
                this.positions[i3 + 2] = r * Math.cos(phi);


                const speed = this.properties.particleSpeed * (0.8 + Math.random() * 0.4); // Speed variation
                const turbulence = this.properties.particleTurbulence;
                // Initial velocity (e.g., outwards from center, or a specific direction)
                const baseVel = new THREE.Vector3(
                    (Math.random() - 0.5),
                    (Math.random() * 0.5 + 0.5), // Tend to go upwards slightly
                    (Math.random() - 0.5)
                ).normalize().multiplyScalar(speed);

                this.velocities[i3 + 0] = baseVel.x + (Math.random() - 0.5) * turbulence;
                this.velocities[i3 + 1] = baseVel.y + (Math.random() - 0.5) * turbulence;
                this.velocities[i3 + 2] = baseVel.z + (Math.random() - 0.5) * turbulence;

                // Per-particle color variation (e.g., slight hue shift from global color)
                const baseC = this.material.uniforms.uGlobalColor.value;
                this.colors[i3 + 0] = baseC.r * (0.8 + Math.random() * 0.4);
                this.colors[i3 + 1] = baseC.g * (0.8 + Math.random() * 0.4);
                this.colors[i3 + 2] = baseC.b * (0.8 + Math.random() * 0.4);


                this.sizes[index] = this.properties.particleSize * (0.7 + Math.random() * 0.6);
                this.lifetimes[index] = this.properties.particleLifetime * (0.8 + Math.random() * 0.4);
                this.ages[index] = 0.0;
                this.ageNormalized[index] = 0.0;
            }

            update(deltaTime) {
                if (!this.particleSystem.visible) return;
                this.material.uniforms.uTime.value += deltaTime;

                let particlesToEmitThisFrame = 0;
                if (this.properties.emissionRate > 0) {
                    this.timeToEmit += deltaTime;
                    const emitInterval = 1.0 / this.properties.emissionRate;
                    if (emitInterval > 0) { // Avoid division by zero if rate is huge
                         particlesToEmitThisFrame = Math.floor(this.timeToEmit / emitInterval);
                         this.timeToEmit -= particlesToEmitThisFrame * emitInterval;
                    } else {
                        particlesToEmitThisFrame = this.particleCount; // Emit all if rate is effectively infinite
                    }
                }

                let emittedThisFrame = 0;
                let liveParticles = 0;

                for (let i = 0; i < this.particleCount; i++) {
                    const i3 = i * 3;
                    if (this.ages[i] < this.lifetimes[i]) { // Particle is alive
                        this.ages[i] += deltaTime;
                        if (this.ages[i] >= this.lifetimes[i]) { // Particle just died
                            this.ageNormalized[i] = 1.0;
                            this.positions[i3 + 1] = -9999; // Move off-screen
                            this.activeParticleCount = Math.max(0, this.activeParticleCount - 1);
                        } else {
                            // Apply physics
                            this.velocities[i3 + 1] -= this.properties.particleGravity * deltaTime;
                            this.positions[i3 + 0] += this.velocities[i3 + 0] * deltaTime;
                            this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime;
                            this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime;
                            this.ageNormalized[i] = this.ages[i] / this.lifetimes[i];
                            liveParticles++;
                        }
                    } else if (emittedThisFrame < particlesToEmitThisFrame && this.activeParticleCount < this.particleCount) {
                        // Particle is dead, try to emit a new one
                        this.emitParticle(i);
                        emittedThisFrame++;
                        this.activeParticleCount++;
                        liveParticles++;
                    }
                }

                // Update draw range if you want to only draw active particles
                // this.geometry.setDrawRange(0, liveParticles); // May not be necessary if hiding dead ones

                this.geometry.attributes.position.needsUpdate = true;
                this.geometry.attributes.particleColor.needsUpdate = true;
                this.geometry.attributes.particleSize.needsUpdate = true;
                this.geometry.attributes.ageNormalized.needsUpdate = true;
            }

            setProperties(newProperties) {
                 // Important: Make sure to parse values correctly
                for (const key in newProperties) {
                    if (this.properties.hasOwnProperty(key)) {
                        if (key === 'particleColor') {
                            this.properties.particleColor.set(newProperties.particleColor);
                            this.material.uniforms.uGlobalColor.value.set(this.properties.particleColor);
                        } else if (key === 'spriteTexturePath') {
                            this.properties.spriteTexturePath = newProperties.spriteTexturePath;
                            if (this.particleTexture) this.particleTexture.dispose();
                            this.particleTexture = new THREE.TextureLoader().load(this.properties.spriteTexturePath); // Add error handling
                            this.material.uniforms.uTexture.value = this.particleTexture;
                        } else {
                            const parsedValue = parseFloat(newProperties[key]);
                            this.properties[key] = isNaN(parsedValue) ? newProperties[key] : parsedValue;
                        }
                    }
                }
                // Recalculate emission rate if intensity or factor changed
                this.properties.emissionRate = this.properties.intensity * this.properties.emissionRateFactor;
                 // Potentially re-calculate particleCount if lifetime changed significantly, but this is complex
                 // as it would require resizing buffers. For now, max particles is fixed at init.
            }

            cleanup() {
                if (this.particleSystem && this.targetObject) {
                    this.targetObject.remove(this.particleSystem);
                }
                if (this.geometry) this.geometry.dispose();
                if (this.material) this.material.dispose();
                if (this.particleTexture) this.particleTexture.dispose();
            }
        }

        // Paste Simple TrailEffect and GlowEffect classes here
        class TrailEffect {
            constructor(targetObject, properties = {}) {
                this.targetObject = targetObject;
                this.properties = {
                    intensity: parseFloat(properties.intensity) || 0.5,
                    color: new THREE.Color(properties.trailColor || 0x00ffff),
                    length: parseInt(properties.trailLength) || 50,
                    ...properties
                };
                this.points = []; // Not strictly needed with BufferGeometry direct manipulation
                const geometry = new THREE.BufferGeometry();
                this.positions = new Float32Array(this.properties.length * 3);
                geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
                const material = new THREE.LineBasicMaterial({
                    color: this.properties.color,
                    transparent: true,
                    opacity: this.properties.intensity,
                    linewidth: 2 // Note: linewidth > 1 only works with LineMaterial from examples/lines
                });
                this.line = new THREE.Line(geometry, material);

                // Add to scene directly, not as child of target, so trail remains in world space
                this.scene = targetObject.parent || window.scene;
                if(this.scene) this.scene.add(this.line);

                const initialPos = new THREE.Vector3();
                this.targetObject.getWorldPosition(initialPos);
                for (let i = 0; i < this.properties.length; i++) {
                    this.positions[i * 3 + 0] = initialPos.x;
                    this.positions[i * 3 + 1] = initialPos.y;
                    this.positions[i * 3 + 2] = initialPos.z;
                }
                this.lastTargetPos = initialPos.clone();
            }
            update(deltaTime) {
                const currentPos = new THREE.Vector3();
                this.targetObject.getWorldPosition(currentPos);

                // Only update if the target object has moved significantly
                if (currentPos.distanceToSquared(this.lastTargetPos) > 0.0001) {
                    for (let i = this.properties.length - 1; i > 0; i--) {
                        this.positions[i * 3 + 0] = this.positions[(i - 1) * 3 + 0];
                        this.positions[i * 3 + 1] = this.positions[(i - 1) * 3 + 1];
                        this.positions[i * 3 + 2] = this.positions[(i - 1) * 3 + 2];
                    }
                    this.positions[0] = currentPos.x;
                    this.positions[1] = currentPos.y;
                    this.positions[2] = currentPos.z;
                    this.line.geometry.attributes.position.needsUpdate = true;
                    this.line.geometry.computeBoundingSphere(); // Important for visibility
                    this.lastTargetPos.copy(currentPos);
                }
            }
            setProperties(newProperties) {
                if (newProperties.intensity !== undefined) this.properties.intensity = parseFloat(newProperties.intensity);
                if (newProperties.trailColor !== undefined) this.properties.color.set(newProperties.trailColor);
                // Note: Changing length would require re-creating geometry buffer
                this.line.material.opacity = this.properties.intensity;
                this.line.material.color.set(this.properties.color);
            }
            cleanup() {
                if (this.line) {
                    if (this.line.parent) this.line.parent.remove(this.line);
                    this.line.geometry.dispose();
                    this.line.material.dispose();
                }
            }
        }

        class GlowEffect {
            constructor(targetObject, properties = {}) {
                this.targetObject = targetObject;
                 this.properties = {
                    intensity: parseFloat(properties.intensity) || 0.3, // Glows are usually more subtle
                    color: new THREE.Color(properties.glowColor || 0x00ffff),
                    scale: parseFloat(properties.glowScale) || 1.05, // Slightly larger than object
                    ...properties
                };

                if (targetObject.geometry && targetObject.geometry.isBufferGeometry) {
                    const glowGeometry = targetObject.geometry.clone();
                    const glowMaterial = new THREE.MeshBasicMaterial({
                        color: this.properties.color,
                        transparent: true,
                        opacity: this.properties.intensity,
                        side: THREE.BackSide, // Render inside for halo
                        depthWrite: false, // Don't occlude things behind it
                        blending: THREE.AdditiveBlending // Brighter where overlapping
                    });
                    this.glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
                    this.glowMesh.scale.setScalar(this.properties.scale); // Initial scale
                    this.targetObject.add(this.glowMesh);
                } else {
                    console.warn("GlowEffect: Target object has no usable geometry to clone for glow.");
                    this.glowMesh = null;
                }
            }
            update(deltaTime) {
                if (this.glowMesh) {
                    const pulse = 0.95 + 0.05 * Math.sin(Date.now() * 0.0025); // Subtle pulse
                    this.glowMesh.material.opacity = this.properties.intensity * pulse;
                    // Make sure glow mesh follows target if target is animated separately
                    // this.glowMesh.position.copy(this.targetObject.position); // Not needed if child
                    // this.glowMesh.quaternion.copy(this.targetObject.quaternion);
                }
            }
            setProperties(newProperties) {
                if (newProperties.intensity !== undefined) this.properties.intensity = parseFloat(newProperties.intensity);
                if (newProperties.glowColor !== undefined) this.properties.color.set(newProperties.glowColor);
                if (newProperties.glowScale !== undefined) this.properties.scale = parseFloat(newProperties.glowScale);

                if (this.glowMesh) {
                    this.glowMesh.material.opacity = this.properties.intensity;
                    this.glowMesh.material.color.set(this.properties.color);
                    this.glowMesh.scale.setScalar(this.properties.scale);
                }
            }
            cleanup() {
                if (this.glowMesh && this.targetObject) {
                    this.targetObject.remove(this.glowMesh);
                    this.glowMesh.geometry.dispose();
                    this.glowMesh.material.dispose();
                }
            }
        }



        // Paste CLASS NodeEditor (Enhanced Grid and Structure) here
        class NodeEditor {
            constructor(sceneInstance, cameraInstance) {
                this.scene = sceneInstance; // Store scene instance
                this.camera = cameraInstance; // Store camera instance
                this.nodes = new Map();
                this.connections = new Set();
                this.selectedConnections = new Set();
                // Important: Use the #node-canvas div INSIDE your .node-editor wrapper
                this.editorWrapper = document.querySelector('.node-editor'); // Your main wrapper
                this.canvas = document.getElementById('node-canvas');       // The canvas div for drawing

                if (!this.editorWrapper || !this.canvas) {
                    console.error("NodeEditor: Crucial HTML elements (.node-editor or #node-canvas) not found!");
                    return;
                }
                // No need to set position/overflow on this.canvas if its parent (.node-editor) handles it

                this.isDraggingNode = false;
                this.selectedNode = null;
                this.dragOffset = { x: 0, y: 0 };
                this.connectingSocketInfo = null;
                this.nodeEffects = new Map();

                this.scale = 1;
                this.minScale = 0.15;
                this.maxScale = 3.0;
                this.viewportX = 0;
                this.viewportY = 0;
                this.isPanning = false;
                this.lastPanPosition = { x: 0, y: 0 };

                this.gridSize = 20;
                this.gridColor = getComputedStyle(document.documentElement).getPropertyValue('--node-grid-line-color').trim() || '#383838';
                this.gridSubdivisionColor = getComputedStyle(document.documentElement).getPropertyValue('--node-grid-subdivision-color').trim() || '#2e2e2e';
                this.gridAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--node-grid-accent-color').trim() || '#4a4a4a';
                this.gridAccentFrequency = 5;

                this.gridCanvas = document.createElement('canvas');
                this.gridCanvas.id = 'node-editor-grid-canvas';
                this.gridCanvas.style.position = 'absolute';
                this.gridCanvas.style.top = '0';
                this.gridCanvas.style.left = '0';
                this.gridCanvas.style.width = '100%';
                this.gridCanvas.style.height = '100%';
                this.gridCanvas.style.pointerEvents = 'none';
                this.gridCanvas.style.zIndex = '0';
                this.canvas.appendChild(this.gridCanvas); // Append to #node-canvas
                this.gridCtx = this.gridCanvas.getContext('2d');

                this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                this.svg.id = 'node-editor-svg-layer';
                this.svg.style.position = 'absolute';
                this.svg.style.top = '0';
                this.svg.style.left = '0';
                this.svg.style.width = '100%';
                this.svg.style.height = '100%';
                this.svg.style.pointerEvents = 'none';
                this.svg.style.zIndex = '1';
                this.svg.style.overflow = 'visible';
                this.canvas.appendChild(this.svg); // Append to #node-canvas

                this.nodesContainer = document.createElement('div');
                this.nodesContainer.id = 'node-editor-nodes-container';
                this.nodesContainer.style.position = 'absolute';
                this.nodesContainer.style.top = '0';
                this.nodesContainer.style.left = '0';
                this.nodesContainer.style.transformOrigin = '0 0';
                this.nodesContainer.style.zIndex = '2';
                this.canvas.appendChild(this.nodesContainer); // Append to #node-canvas


                this.tempConnectionLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this.tempConnectionLine.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--node-connection-temp-color').trim() || '#00bcd4');
                this.tempConnectionLine.setAttribute('stroke-width', '2.5');
                this.tempConnectionLine.setAttribute('fill', 'none');
                this.tempConnectionLine.setAttribute('stroke-dasharray', '5,5');
                this.tempConnectionLine.style.display = 'none';
                this.svg.appendChild(this.tempConnectionLine);

                this.initializeCoreEventListeners(); // This will now use this.editorWrapper
                this.resizeGridCanvas();
                this.updateViewTransform();

                this.canvas.__editor = this;
                //if (!window.nodeEditor) window.nodeEditor = this;
                //window.nodeEditor = this; // Keep if you need global access for debugging
            }

            // --- Visibility ---
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

            // --- Grid and Viewport (Full methods from previous response) ---
            resizeGridCanvas() {
                // ... (same as previous)
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
                // ... (same as previous, ensure it uses this.gridCtx)
                if (!this.gridCtx) return;
                const canvasWidthUnscaled = this.gridCanvas.width / (window.devicePixelRatio || 1);
                const canvasHeightUnscaled = this.gridCanvas.height / (window.devicePixelRatio || 1);

                this.gridCtx.clearRect(0, 0, canvasWidthUnscaled, canvasHeightUnscaled);

                const scaledGridSize = this.gridSize * this.scale;
                if (scaledGridSize < 4) return;

                const drawOffsetX = this.viewportX % scaledGridSize;
                const drawOffsetY = this.viewportY % scaledGridSize;

                this.gridCtx.lineWidth = Math.max(0.5, 1 / this.scale); // Ensure minimum visible line width


                const subGridScaledSize = scaledGridSize / (this.gridAccentFrequency / 2.5);
                if (subGridScaledSize > 3 / this.scale) {
                    this.gridCtx.strokeStyle = this.gridSubdivisionColor;
                    this.gridCtx.globalAlpha = Math.min(0.5, scaledGridSize / 50);
                    for (let x = drawOffsetX - scaledGridSize; x < canvasWidthUnscaled + scaledGridSize; x += subGridScaledSize) {
                        if ( Math.abs(Math.round( (x - drawOffsetX) / subGridScaledSize ) % (this.gridAccentFrequency / 2.5) ) > 0.01 &&
                             Math.abs(Math.round( (x - drawOffsetX) / scaledGridSize ) % 1) > 0.01 ) {
                            this.gridCtx.beginPath(); this.gridCtx.moveTo(x, 0); this.gridCtx.lineTo(x, canvasHeightUnscaled); this.gridCtx.stroke();
                        }
                    }
                    for (let y = drawOffsetY - scaledGridSize; y < canvasHeightUnscaled + scaledGridSize; y += subGridScaledSize) {
                         if ( Math.abs(Math.round( (y - drawOffsetY) / subGridScaledSize ) % (this.gridAccentFrequency / 2.5) ) > 0.01 &&
                              Math.abs(Math.round( (y - drawOffsetY) / scaledGridSize ) % 1) > 0.01 ) {
                            this.gridCtx.beginPath(); this.gridCtx.moveTo(0, y); this.gridCtx.lineTo(canvasWidthUnscaled, y); this.gridCtx.stroke();
                        }
                    }
                    this.gridCtx.globalAlpha = 1.0;
                }


                this.gridCtx.strokeStyle = this.gridColor;
                this.gridCtx.globalAlpha = Math.min(1, scaledGridSize / 25);
                for (let x = drawOffsetX - scaledGridSize; x < canvasWidthUnscaled + scaledGridSize; x += scaledGridSize) {
                     if ( Math.abs(Math.round( (x - drawOffsetX) / scaledGridSize ) % this.gridAccentFrequency) > 0.01) {
                        this.gridCtx.beginPath(); this.gridCtx.moveTo(x, 0); this.gridCtx.lineTo(x, canvasHeightUnscaled); this.gridCtx.stroke();
                    }
                }
                for (let y = drawOffsetY - scaledGridSize; y < canvasHeightUnscaled + scaledGridSize; y += scaledGridSize) {
                    if ( Math.abs(Math.round( (y - drawOffsetY) / scaledGridSize ) % this.gridAccentFrequency) > 0.01) {
                        this.gridCtx.beginPath(); this.gridCtx.moveTo(0, y); this.gridCtx.lineTo(canvasWidthUnscaled, y); this.gridCtx.stroke();
                    }
                }
                this.gridCtx.globalAlpha = 1.0;


                this.gridCtx.strokeStyle = this.gridAccentColor;
                this.gridCtx.lineWidth = Math.max(0.75, 1.5 / this.scale);
                const accentScaledSize = scaledGridSize * this.gridAccentFrequency;
                const accentDrawOffsetX = this.viewportX % accentScaledSize;
                const accentDrawOffsetY = this.viewportY % accentScaledSize;

                for (let x = accentDrawOffsetX - accentScaledSize; x < canvasWidthUnscaled + accentScaledSize; x += accentScaledSize) {
                    this.gridCtx.beginPath(); this.gridCtx.moveTo(x, 0); this.gridCtx.lineTo(x, canvasHeightUnscaled); this.gridCtx.stroke();
                }
                for (let y = accentDrawOffsetY - accentScaledSize; y < canvasHeightUnscaled + accentScaledSize; y += accentScaledSize) {
                    this.gridCtx.beginPath(); this.gridCtx.moveTo(0, y); this.gridCtx.lineTo(canvasWidthUnscaled, y); this.gridCtx.stroke();
                }

                const originScreenX = this.viewportX;
                const originScreenY = this.viewportY;
                if (originScreenX > -canvasWidthUnscaled * 0.1 && originScreenX < canvasWidthUnscaled * 1.1 &&
                    originScreenY > -canvasHeightUnscaled * 0.1 && originScreenY < canvasHeightUnscaled * 1.1) {
                    this.gridCtx.lineWidth = Math.max(1, 2 / this.scale);
                    this.gridCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--node-grid-origin-y-color').trim() || '#4CAF50';
                    this.gridCtx.beginPath(); this.gridCtx.moveTo(originScreenX, 0); this.gridCtx.lineTo(originScreenX, canvasHeightUnscaled); this.gridCtx.stroke();
                    this.gridCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--node-grid-origin-x-color').trim() || '#E91E63';
                    this.gridCtx.beginPath(); this.gridCtx.moveTo(0, originScreenY); this.gridCtx.lineTo(canvasWidthUnscaled, originScreenY); this.gridCtx.stroke();
                }
            }

            updateViewTransform() {
                // ... (same as previous)
                const transformValue = `translate(${this.viewportX}px, ${this.viewportY}px) scale(${this.scale})`;
                this.nodesContainer.style.transform = transformValue;
                this.svg.style.transform = transformValue;
                this.svg.style.transformOrigin = '0 0';

                this.drawGrid();
                this.updateAllConnections();
            }

            // --- Event Handlers ---
            initializeCoreEventListeners() {
                // Bind to this.canvas (the inner drawing area)
                this.canvas.addEventListener('wheel', this.handleWheelZoom.bind(this), { passive: false });
                this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
                this.canvas.addEventListener('contextmenu', this.handleCanvasContextMenu.bind(this));

                // Bind to document for global mouse move/up
                document.addEventListener('mousemove', this.handleDocumentMouseMove.bind(this));
                document.addEventListener('mouseup', this.handleDocumentMouseUp.bind(this));

                // Bind to nodesContainer for node-specific interactions
                this.nodesContainer.addEventListener('mousedown', this.handleNodesContainerMouseDown.bind(this));

                window.addEventListener('resize', () => {
                    if (this.editorWrapper.classList.contains('visible')) {
                        this.resizeGridCanvas();
                        this.updateViewTransform();
                    }
                });
                document.addEventListener('keydown', this.handleKeyDown.bind(this));

                // Use your provided HTML for toggle and close buttons
                const toggleButton = document.getElementById('node-editor-toggle');
                if (toggleButton) {
                    toggleButton.addEventListener('click', () => this.toggleVisibility());
                }

                const closeButton = document.getElementById('node-editor-close');
                if (closeButton) {
                    closeButton.addEventListener('click', () => this.setVisible(false));
                }

                // Use your provided HTML for node toolbar buttons
                const nodeToolbar = this.editorWrapper.querySelector('.node-toolbar');
                if (nodeToolbar) {
                    nodeToolbar.querySelectorAll('.toolbar-button[data-type]').forEach(button => {
                        button.addEventListener('click', (e) => {
                            const type = e.currentTarget.dataset.type;
                            const canvasRect = this.canvas.getBoundingClientRect();
                            // Place new node in the center of the current view
                            const viewCenterX = (canvasRect.width / 2 - this.viewportX) / this.scale;
                            const viewCenterY = (canvasRect.height / 2 - this.viewportY) / this.scale;
                            this.addNode(type, viewCenterX - 100, viewCenterY - 75); // Offset by approx half node size
                        });
                    });
                }
            }

            handleWheelZoom(e) { /* ... (same as previous, ensure `this.canvas` is used for rect) ... */
                e.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const zoomIntensity = 0.075;
                const direction = e.deltaY < 0 ? 1 : -1;
                const oldScale = this.scale;
                let newScale = oldScale * (1 + direction * zoomIntensity);
                newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
                if (Math.abs(newScale - oldScale) < 0.001) return;

                this.viewportX = mouseX - (mouseX - this.viewportX) * (newScale / oldScale);
                this.viewportY = mouseY - (mouseY - this.viewportY) * (newScale / oldScale);
                this.scale = newScale;
                this.updateViewTransform();
            }
            handleCanvasMouseDown(e) { /* ... (same as previous) ... */
                 if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle mouse or Alt+Left
                    e.preventDefault();
                    this.isPanning = true;
                    this.lastPanPosition = { x: e.clientX, y: e.clientY };
                    this.canvas.style.cursor = 'grabbing';
                } else if (e.button === 0 && e.target === this.canvas) { // Left click on empty canvas area
                    this.deselectAll();
                }
            }
            handleDocumentMouseMove(e) { /* ... (same as previous) ... */
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
                }
            }
            handleDocumentMouseUp(e) { /* ... (same as previous) ... */
                if (this.isPanning) {
                    this.isPanning = false;
                    this.canvas.style.cursor = 'grab';
                }
                if (this.isDraggingNode) {
                    this.isDraggingNode = false;
                     // Don't deselect here, selection should persist until another click
                }
                if (this.connectingSocketInfo) {
                    // Important: Use document.elementFromPoint to get element under mouse
                    // as e.target might be the document if mouse moved fast
                    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
                    const targetSocket = targetElement ? targetElement.closest('.node-socket') : null;

                    if (targetSocket) {
                        this.tryEndConnection(targetSocket);
                    }
                    this.clearTempConnection();
                }
            }
            handleNodesContainerMouseDown(e) { /* ... (same as previous, ensure `this.nodesContainer.appendChild(nodeElement)` for z-index) ... */
                const target = e.target;
                const nodeElement = target.closest('.node');

                if (nodeElement && !target.closest('input, select, button, .node-socket, textarea')) {
                    e.stopPropagation();
                    if(!nodeElement.classList.contains('selected')) { // If not already selected
                        this.deselectAll();
                        this.selectedNode = nodeElement;
                        this.selectedNode.classList.add('selected');
                    } else if (e.ctrlKey || e.metaKey) { // Allow deselecting with Ctrl/Cmd + Click
                        this.selectedNode.classList.remove('selected');
                        this.selectedNode = null;
                    }
                    // Only start drag if it's selected (or becomes selected now)
                    if(this.selectedNode === nodeElement){
                        this.isDraggingNode = true;
                        this.selectedNodeStartPos = {
                            x: parseFloat(nodeElement.style.left || 0),
                            y: parseFloat(nodeElement.style.top || 0)
                        };
                        this.dragStartMousePos = { x: e.clientX, y: e.clientY };
                        this.nodesContainer.appendChild(nodeElement); // Bring to front visually
                    }

                } else if (target.classList.contains('node-socket')) {
                    e.stopPropagation();
                    this.startDraggingConnection(target);
                }
            }
            handleCanvasContextMenu(e) { /* ... (same as previous, implement your actual menu) ... */
                 e.preventDefault();
                console.log("Node Editor context menu. Add node at:", this.getMousePositionInCanvasSpace(e));
                // Example:
                // showMyCustomContextMenu(e.clientX, e.clientY, (chosenNodeType) => {
                //    const pos = this.getMousePositionInCanvasSpace(e);
                //    this.addNode(chosenNodeType, pos.x, pos.y);
                // });
            }
            getMousePositionInCanvasSpace(event) { /* ... (same as previous) ... */
                const rect = this.canvas.getBoundingClientRect();
                const x = (event.clientX - rect.left - this.viewportX) / this.scale;
                const y = (event.clientY - rect.top - this.viewportY) / this.scale;
                return { x, y };
            }
            handleKeyDown(e) { /* ... (same as previous) ... */
                if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable)) {
                    if (e.key === 'Escape') document.activeElement.blur();
                    return;
                }
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (this.selectedNode) {
                        this.deleteNode(this.selectedNode); // deleteNode handles selection clear
                    }
                    // Clone selectedConnections before iterating as deleteConnection modifies it
                    const connectionsToDelete = new Set(this.selectedConnections);
                    connectionsToDelete.forEach(conn => this.deleteConnection(conn));
                }
                if (e.key === 'Escape') {
                    this.clearTempConnection();
                    this.deselectAll();
                }
            }

            // --- Node Content Generation (Full implementation from previous response) ---
            generateNodeContent(type) { /* ... (Full code from previous response) ... */
                const nodeTypes = {
                    object: {
                        title: 'Scene Object',
                        sockets: { inputs: 1, outputs: 1, inputPositions: ['50%'], outputPositions: ['50%'] },
                        properties: [
                            { name: 'name', type: 'text', label: 'Name', default: 'MyObject' },
                            { name: 'visible', type: 'checkbox', label: 'Visible', default: true }
                        ]
                    },
                    physics: {
                        title: 'Physics Body',
                        sockets: { inputs: 1, outputs: 1, inputPositions: ['50%'], outputPositions: ['50%'] },
                        properties: [
                            { name: 'type', type: 'select', label: 'Type', options: ['Static', 'Dynamic', 'Kinematic'], default: 'Static' },
                            { name: 'mass', type: 'number', label: 'Mass', default: 1, min:0, step:0.1, showWhen: 'type=Dynamic' },
                            { name: 'friction', type: 'range', label: 'Friction', default: 0.5, min:0, max:1, step:0.01 },
                            { name: 'restitution', type: 'range', label: 'Bounciness', default: 0.2, min:0, max:1, step:0.01 }
                        ]
                    },
                    effect: {
                        title: 'Visual Effect',
                        sockets: { inputs: 1, outputs: 1, inputPositions: ['50%'], outputPositions: ['50%'] },
                        properties: [
                            { name: 'type', type: 'select', label: 'Type', options: ['Particles', 'Trail', 'Glow', 'Water'], default: 'Particles' },
                            { name: 'intensity', type: 'range', label: 'Intensity', default: 0.5, min: 0, max: 1, step: 0.01 },
                            { name: 'particleColor', type: 'color', label: 'Color', default: '#ffffff', showWhen: 'type=Particles' },
                            { name: 'particleSpeed', type: 'range', label: 'Speed', default: 1.0, min: 0, max: 5, step: 0.1, showWhen: 'type=Particles' },
                            { name: 'particleSize', type: 'range', label: 'Size', default: 0.1, min: 0.01, max: 1, step: 0.01, showWhen: 'type=Particles' },
                            { name: 'particleLifetime', type: 'range', label: 'Lifetime (s)', default: 2.0, min: 0.1, max: 10, step: 0.1, showWhen: 'type=Particles' },
                            { name: 'particleGravity', type: 'range', label: 'Gravity', default: 0.0, min: -5, max: 5, step: 0.1, showWhen: 'type=Particles' },
                            { name: 'particleTurbulence', type: 'range', label: 'Turbulence', default: 0.1, min: 0, max: 2, step: 0.05, showWhen: 'type=Particles' },
                            { name: 'flowRate', type: 'range', label: 'Flow Speed', default: 1.0, min: 0, max: 5, step: 0.1, showWhen: 'type=Water' },
                            { name: 'waterOpacity', type: 'range', label: 'Opacity', default: 0.9, min: 0, max: 1, step: 0.01, showWhen: 'type=Water' },
                            { name: 'rippleStrength', type: 'range', label: 'Ripples', default: 0.1, min: 0, max: 0.5, step: 0.01, showWhen: 'type=Water' },
                            { name: 'waterColor', type: 'color', label: 'Color', default: '#003f5e', showWhen: 'type=Water' },
                            { name: 'foamColor', type: 'color', label: 'Foam Color', default: '#e6f2ff', showWhen: 'type=Water' },
                            { name: 'foamThreshold', type: 'range', label: 'Foam Amount', default: 0.6, min: 0, max:1, step: 0.01, showWhen: 'type=Water'}
                        ]
                    },
                    material: {
                        title: 'Surface Material',
                        sockets: { inputs: 1, outputs: 1, inputPositions: ['50%'], outputPositions: ['50%'] },
                        properties: [
                            { name: 'type', type: 'select', label: 'Shader', options: ['Standard', 'Phong', 'Toon', 'Basic'], default: 'Standard' },
                            { name: 'color', type: 'color', label: 'Base Color', default: '#cccccc' },
                            { name: 'metalness', type: 'range', label: 'Metallic', default: 0.1, min:0, max:1, step:0.01, showWhen:'type=Standard'},
                            { name: 'roughness', type: 'range', label: 'Roughness', default: 0.5, min:0, max:1, step:0.01, showWhen:'type=Standard'},
                            { name: 'shininess', type: 'range', label: 'Shininess', default: 30, min:0, max:200, step:1, showWhen:'type=Phong'}
                        ]
                    },
                    transform: {
                        title: 'Spatial Transform',
                        sockets: { inputs: 1, outputs: 1, inputPositions: ['50%'], outputPositions: ['50%'] },
                        properties: [
                            { name: 'position', type: 'vector3', label: 'Position (m)', default: {x:0,y:0,z:0} },
                            { name: 'rotation', type: 'vector3', label: 'Rotation (°)', default: {x:0,y:0,z:0} },
                            { name: 'scale', type: 'vector3', label: 'Scale Factor', default: {x:1,y:1,z:1} }
                        ]
                    },
                     light: {
                        title: 'Light Source',
                        sockets: { inputs: 1, outputs: 1, inputPositions: ['50%'], outputPositions: ['50%'] },
                        properties: [
                            { name: 'type', type: 'select', label: 'Type', options: ['Directional', 'Point', 'Spot', 'Ambient'], default: 'Directional' },
                            { name: 'color', type: 'color', label: 'Color', default: '#ffffff' },
                            { name: 'intensity', type: 'range', label: 'Intensity', default: 1.0, min:0, max:5, step:0.1 },
                            { name: 'castShadow', type: 'checkbox', label: 'Shadows', default: false, showWhenNot: 'type=Ambient' },
                            { name: 'distance', type: 'number', label: 'Distance', default: 0, min:0, step:1, showWhen: 'type=Point,type=Spot' },
                            { name: 'angle', type: 'range', label: 'Angle (°)', default: 30, min:1, max:90, step:1, showWhen: 'type=Spot' },
                            { name: 'penumbra', type: 'range', label: 'Penumbra', default: 0.1, min:0, max:1, step:0.01, showWhen: 'type=Spot' }
                        ]
                    }
                };

                const nodeConfig = nodeTypes[type];
                if (!nodeConfig) {
                    console.warn(`NodeEditor: Unknown node type "${type}" requested.`);
                    return `<div class="node-title">Unknown Node</div><div class="node-content">Error: Type "${type}" not found.</div>`;
                }

                let html = `<div class="node-title">${nodeConfig.title}</div>`;
                const nodeId = `node-${type}-${Date.now().toString(36)}`; // For unique IDs for labels/inputs

                if (nodeConfig.sockets) {
                    (nodeConfig.sockets.inputPositions || ['50%']).forEach((pos, i) => {
                         html += `<div class="node-socket input socket-pos-${i+1}" data-socket-type="input" style="top: ${pos};"></div>`;
                    });
                     (nodeConfig.sockets.outputPositions || ['50%']).forEach((pos, i) => {
                         html += `<div class="node-socket output socket-pos-${i+1}" data-socket-type="output" style="top: ${pos};"></div>`;
                    });
                } else {
                     html += `<div class="node-socket input socket-pos-1" data-socket-type="input" style="top: 50%;"></div>`;
                     html += `<div class="node-socket output socket-pos-1" data-socket-type="output" style="top: 50%;"></div>`;
                }


                html += '<div class="node-content">';
                nodeConfig.properties.forEach((prop, index) => {
                    const uniqueId = `${nodeId}-prop-${index}`;
                    let inputHtml = '';
                    const defaultValue = prop.default !== undefined ? prop.default : '';
                    const showWhenAttr = prop.showWhen ? `data-show-when="${prop.showWhen}"` : (prop.showWhenNot ? `data-show-when-not="${prop.showWhenNot}"` : '');

                    switch(prop.type) {
                        case 'text':
                            inputHtml = `<input type="text" id="${uniqueId}" name="${prop.name}" value="${defaultValue}">`;
                            break;
                        case 'number':
                            inputHtml = `<input type="number" id="${uniqueId}" name="${prop.name}" value="${defaultValue}" 
                                        ${prop.min !== undefined ? `min="${prop.min}"` : ''} 
                                        ${prop.max !== undefined ? `max="${prop.max}"` : ''} 
                                        step="${prop.step || 0.1}">`;
                            break;
                        case 'checkbox':
                            inputHtml = `<input type="checkbox" id="${uniqueId}" name="${prop.name}" ${defaultValue ? 'checked' : ''}>`;
                            break;
                        case 'select':
                            inputHtml = `<select id="${uniqueId}" name="${prop.name}">
                                ${prop.options.map(opt => `<option value="${opt.toLowerCase()}" ${opt.toLowerCase() === defaultValue.toLowerCase() ? 'selected' : ''}>${opt}</option>`).join('')}
                            </select>`; // Values to lowercase for consistency
                            break;
                        case 'range':
                            const val = parseFloat(defaultValue);
                            inputHtml = `<input type="range" id="${uniqueId}" name="${prop.name}" 
                                         min="${prop.min || 0}" max="${prop.max || 1}" 
                                         step="${prop.step || 0.01}" value="${val}">
                                         <span class="value-display">${val.toFixed(prop.step && prop.step.toString().includes('.') ? prop.step.toString().split('.')[1].length : 2)}</span>`;
                            break;
                        case 'color':
                            inputHtml = `<input type="color" id="${uniqueId}" name="${prop.name}" value="${defaultValue}">`;
                            break;
                        case 'vector3':
                             inputHtml = `<div class="vector3-input-group">
                                <input type="number" id="${uniqueId}_x" name="${prop.name}_x" value="${defaultValue.x || 0}" step="0.1" placeholder="X">
                                <input type="number" id="${uniqueId}_y" name="${prop.name}_y" value="${defaultValue.y || 0}" step="0.1" placeholder="Y">
                                <input type="number" id="${uniqueId}_z" name="${prop.name}_z" value="${defaultValue.z || 0}" step="0.1" placeholder="Z">
                            </div>`;
                            break;
                        default: inputHtml = `<span>Unsupported type: ${prop.type}</span>`;
                    }
                    html += `<div class="node-property" ${showWhenAttr}>
                                <label for="${uniqueId}">${prop.label}</label>
                                ${inputHtml}
                             </div>`;
                });
                html += '</div>';
                return html;
            }

            updatePropertyVisibility(nodeElement) { /* ... (Full code from previous response) ... */
                const typeSelects = nodeElement.querySelectorAll('select[name="type"]'); // Could be more than one 'type' select
                if (typeSelects.length === 0 && !nodeElement.querySelector('[data-show-when],[data-show-when-not]')) return;


                nodeElement.querySelectorAll('.node-property').forEach(propDiv => {
                    const showWhen = propDiv.dataset.showWhen;
                    const showWhenNot = propDiv.dataset.showWhenNot;
                    let shouldShow = true;

                    if (showWhen) {
                        shouldShow = showWhen.split(',').every(condition => {
                            const [field, value] = condition.trim().split('=');
                            const dependentInput = nodeElement.querySelector(`[name="${field}"]`);
                            if (dependentInput) {
                                return dependentInput.type === 'checkbox' ? dependentInput.checked.toString() === value : dependentInput.value.toLowerCase() === value.toLowerCase();
                            }
                            return false;
                        });
                    }
                    if (shouldShow && showWhenNot) { // Only check showWhenNot if showWhen (if any) passed
                        shouldShow = !showWhenNot.split(',').some(condition => { // Use .some() because if ANY hide condition is met, hide
                            const [field, value] = condition.trim().split('=');
                            const dependentInput = nodeElement.querySelector(`[name="${field}"]`);
                            if (dependentInput) {
                                return dependentInput.type === 'checkbox' ? dependentInput.checked.toString() === value : dependentInput.value.toLowerCase() === value.toLowerCase();
                            }
                            return false;
                        });
                    }
                    propDiv.style.display = shouldShow ? '' : 'none';
                });
            }

            linkNodeToSceneObject(nodeElement, sceneObject) { /* ... (Full code from previous response) ... */
                 const nodeData = this.nodes.get(nodeElement);
                if (nodeData) {
                    nodeData.object = sceneObject;
                    const nodeNameFromUI = nodeElement.querySelector('input[name="name"]');
                    if (nodeNameFromUI && nodeNameFromUI.value) {
                        sceneObject.name = nodeNameFromUI.value;
                        nodeData.properties.name = nodeNameFromUI.value; // Sync internal data too
                    } else if (nodeData.properties && nodeData.properties.name) {
                        sceneObject.name = nodeData.properties.name;
                    }
                    console.log(`Node "${nodeData.id}" linked to 3D object "${sceneObject.name || sceneObject.uuid}".`);
                    this.applyNodePropertiesToSceneObject(nodeElement, sceneObject);
                }
            }
            applyNodePropertiesToSceneObject(nodeElement, sceneObject) { /* ... (Full code from previous response) ... */
                 const nodeData = this.nodes.get(nodeElement);
                if (!nodeData || !sceneObject) return;
                const props = this.getNodeProperties(nodeElement); // Current UI values

                if (props.name !== undefined) sceneObject.name = props.name;
                if (props.visible !== undefined) sceneObject.visible = props.visible;

                if (props.position) {
                    sceneObject.position.set(props.position.x || 0, props.position.y || 0, props.position.z || 0);
                }
                if (props.rotation) {
                    sceneObject.rotation.set(
                        THREE.MathUtils.degToRad(props.rotation.x || 0),
                        THREE.MathUtils.degToRad(props.rotation.y || 0),
                        THREE.MathUtils.degToRad(props.rotation.z || 0)
                    );
                }
                if (props.scale) {
                    sceneObject.scale.set(props.scale.x || 1, props.scale.y || 1, props.scale.z || 1);
                }

                if (nodeData.type === 'material' && sceneObject.material) {
                    if (props.color) sceneObject.material.color = new THREE.Color(props.color); // Ensure it's a THREE.Color
                    if (props.metalness !== undefined && sceneObject.material.metalness !== undefined) sceneObject.material.metalness = props.metalness;
                    if (props.roughness !== undefined && sceneObject.material.roughness !== undefined) sceneObject.material.roughness = props.roughness;
                    if (props.shininess !== undefined && sceneObject.material.shininess !== undefined) sceneObject.material.shininess = props.shininess;
                    if (sceneObject.material.needsUpdate !== undefined) sceneObject.material.needsUpdate = true;
                }

                if (nodeData.type === 'light' && sceneObject.isLight) {
                    if (props.color) sceneObject.color = new THREE.Color(props.color);
                    if (props.intensity !== undefined) sceneObject.intensity = props.intensity;
                    if (props.castShadow !== undefined && sceneObject.castShadow !== undefined) sceneObject.castShadow = props.castShadow;
                    if (props.distance !== undefined && sceneObject.distance !== undefined) sceneObject.distance = props.distance;
                    if (props.angle !== undefined && sceneObject.angle !== undefined) sceneObject.angle = THREE.MathUtils.degToRad(props.angle);
                    if (props.penumbra !== undefined && sceneObject.penumbra !== undefined) sceneObject.penumbra = props.penumbra;
                }
            }


            // --- Node Management (addNode and deleteNode full implementations from previous) ---
            addNode(type, x, y) {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'node';
        nodeElement.innerHTML = this.generateNodeContent(type);
        nodeElement.dataset.nodeType = type;

        const defaultX = x !== undefined ? x : (this.canvas.offsetWidth / 2 - 100 - this.viewportX) / this.scale;
        const defaultY = y !== undefined ? y : (this.canvas.offsetHeight / 2 - 75 - this.viewportY) / this.scale;
        nodeElement.style.left = `${defaultX}px`;
        nodeElement.style.top = `${defaultY}px`;

        this.nodesContainer.appendChild(nodeElement);
        const nodeId = `node_${type}_${Date.now().toString(36).slice(2, 7)}`;
        const initialProps = this.getNodeProperties(nodeElement);
        const nodeData = { id: nodeId, type, properties: initialProps, object: null };
        this.nodes.set(nodeElement, nodeData);

        // ... (event listeners for sockets and inputs as before) ...
        nodeElement.querySelectorAll('.node-socket').forEach(socket => {
            socket.addEventListener('mouseenter', (e) => {
                if (this.connectingSocketInfo && this.isValidConnectionTarget(this.connectingSocketInfo.socketElement, e.currentTarget)) {
                    e.currentTarget.classList.add('valid-target');
                }
            });
            socket.addEventListener('mouseleave', (e) => {
                e.currentTarget.classList.remove('valid-target');
            });
        });

        nodeElement.querySelectorAll('input, select').forEach(input => {
            const eventType = (input.type === 'range' || input.type === 'color') ? 'input' : 'change';
            input.addEventListener(eventType, () => {
                this.updateNodeProperties(nodeElement);
                if(nodeData.object) this.applyNodePropertiesToSceneObject(nodeElement, nodeData.object);
                this.updateConnectedNodesAndEffects(nodeElement);
                if (input.type === 'range' && input.nextElementSibling?.classList.contains('value-display')) {
                     const step = parseFloat(input.step) || 0.01;
                     const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
                     input.nextElementSibling.textContent = parseFloat(input.value).toFixed(precision);
                }
                 if(input.name === 'type') this.updatePropertyVisibility(nodeElement);
            });
             if (input.type === 'range' && input.nextElementSibling?.classList.contains('value-display')) {
                const step = parseFloat(input.step) || 0.01;
                const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
                input.nextElementSibling.textContent = parseFloat(input.value).toFixed(precision);
            }
        });

        nodeElement.querySelectorAll('select[name="type"]').forEach(select => {
            select.addEventListener('change', () => this.updatePropertyVisibility(nodeElement));
        });
        this.updatePropertyVisibility(nodeElement);


        // MODIFIED PART: Creating and adding 3D objects
        if (type === 'object') {
            const defaultObject = new THREE.Mesh(
                new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, name: `Material_Object_${nodeId}`})
            );
            // The name set here will be used by your addObjectToScene
            // If your addObjectToScene generates a name, ensure consistency or pass it back.
            // For now, let's assume node editor sets the initial base name.
            const objectName = nodeData.properties.name || `ObjectNode_${nodeId}`;
            defaultObject.name = objectName; // Set initial name for the THREE.Object3D

            this.linkNodeToSceneObject(nodeElement, defaultObject); // Links internally
              // Call YOUR application's addObjectToScene function
            if (typeof window.addObjectToScene === 'function') {
                window.addObjectToScene(defaultObject, objectName); // Pass the object and name
            } else {
                console.warn("NodeEditor: Global addObjectToScene function not found. Object not added to main scene.");
                // Fallback if global function is not available (though less ideal)
                if (this.scene) this.scene.add(defaultObject);
            }
        } else if (type === 'light') {
            let defaultLight;
            const lightProps = nodeData.properties;
            const lightColor = new THREE.Color(lightProps.color || 0xffffff);
            const lightIntensity = parseFloat(lightProps.intensity) || 1.0;
            const lightName = nodeData.properties.name || `LightNode_${nodeId}`;

            switch (lightProps.type ? lightProps.type.toLowerCase() : 'directional') {
                case 'point':
                    defaultLight = new THREE.PointLight(lightColor, lightIntensity, parseFloat(lightProps.distance) || 0);
                    break;
                case 'spot':
                    defaultLight = new THREE.SpotLight(lightColor, lightIntensity, parseFloat(lightProps.distance) || 0, THREE.MathUtils.degToRad(parseFloat(lightProps.angle) || 30), parseFloat(lightProps.penumbra) || 0.1);
                    defaultLight.position.set(0, 5, 0); // Default position for spot
                    break;
                case 'ambient':
                    defaultLight = new THREE.AmbientLight(lightColor, lightIntensity);
                    break;
                case 'directional':
                default:
                    defaultLight = new THREE.DirectionalLight(lightColor, lightIntensity);
                    defaultLight.position.set(5, 5, 5);
                    break;
            }
            defaultLight.name = lightName;
            if (lightProps.castShadow !== undefined && defaultLight.castShadow !== undefined) {
                 defaultLight.castShadow = lightProps.castShadow;
            }


            this.linkNodeToSceneObject(nodeElement, defaultLight);
            if (typeof window.addObjectToScene === 'function') {
                window.addObjectToScene(defaultLight, lightName); // Pass the light and name
                 if (defaultLight.target && defaultLight.target.isObject3D) { // Add target for spot/directional
                    window.addObjectToScene(defaultLight.target, `${lightName}_Target`);
                }
            } else {
                console.warn("NodeEditor: Global addObjectToScene function not found. Light not added to main scene.");
                if (this.scene) {
                    this.scene.add(defaultLight);
                    if (defaultLight.target && defaultLight.target.isObject3D) this.scene.add(defaultLight.target);
                }
            }
        }
        return nodeElement;
    }

            /*addNode(type, x, y) { 
                const nodeElement = document.createElement('div');
                nodeElement.className = 'node';
                nodeElement.innerHTML = this.generateNodeContent(type);
                nodeElement.dataset.nodeType = type;

                const defaultX = x !== undefined ? x : (this.canvas.offsetWidth / 2 - 100 - this.viewportX) / this.scale;
                const defaultY = y !== undefined ? y : (this.canvas.offsetHeight / 2 - 75 - this.viewportY) / this.scale;
                nodeElement.style.left = `${defaultX}px`;
                nodeElement.style.top = `${defaultY}px`;

                this.nodesContainer.appendChild(nodeElement);
                const nodeId = `node_${type}_${Date.now().toString(36).slice(2, 7)}`;
                const initialProps = this.getNodeProperties(nodeElement); // Get defaults from generated HTML
                const nodeData = { id: nodeId, type, properties: initialProps, object: null };
                this.nodes.set(nodeElement, nodeData);

                nodeElement.querySelectorAll('.node-socket').forEach(socket => {
                    socket.addEventListener('mouseenter', (e) => {
                        if (this.connectingSocketInfo && this.isValidConnectionTarget(this.connectingSocketInfo.socketElement, e.currentTarget)) {
                            e.currentTarget.classList.add('valid-target');
                        }
                    });
                    socket.addEventListener('mouseleave', (e) => {
                        e.currentTarget.classList.remove('valid-target');
                    });
                });

                nodeElement.querySelectorAll('input, select').forEach(input => {
                    const eventType = (input.type === 'range' || input.type === 'color') ? 'input' : 'change';
                    input.addEventListener(eventType, () => {
                        this.updateNodeProperties(nodeElement);
                        if(nodeData.object) this.applyNodePropertiesToSceneObject(nodeElement, nodeData.object);
                        this.updateConnectedNodesAndEffects(nodeElement);
                        if (input.type === 'range' && input.nextElementSibling?.classList.contains('value-display')) {
                             const step = parseFloat(input.step) || 0.01;
                             const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
                             input.nextElementSibling.textContent = parseFloat(input.value).toFixed(precision);
                        }
                         if(input.name === 'type') this.updatePropertyVisibility(nodeElement); // For effect/material type changes
                    });
                     if (input.type === 'range' && input.nextElementSibling?.classList.contains('value-display')) {
                        const step = parseFloat(input.step) || 0.01;
                        const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
                        input.nextElementSibling.textContent = parseFloat(input.value).toFixed(precision);
                    }
                });

                nodeElement.querySelectorAll('select[name="type"]').forEach(select => { // More generic way to catch type changes
                    select.addEventListener('change', () => this.updatePropertyVisibility(nodeElement));
                });
                this.updatePropertyVisibility(nodeElement);

                if (type === 'object') {
                    const defaultObject = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color: 0xcccccc}));
                    this.linkNodeToSceneObject(nodeElement, defaultObject); // Name will be set from UI
                    if (window.scene) window.scene.add(defaultObject);
                } else if (type === 'light') {
                    let defaultLight;
                    const lightProps = nodeData.properties;
                    switch(lightProps.type.toLowerCase()) { // Use lowercase from select value
                        case 'point': defaultLight = new THREE.PointLight(new THREE.Color(lightProps.color), lightProps.intensity, lightProps.distance); break;
                        case 'spot': defaultLight = new THREE.SpotLight(new THREE.Color(lightProps.color), lightProps.intensity, lightProps.distance, THREE.MathUtils.degToRad(lightProps.angle), lightProps.penumbra); break;
                        case 'ambient': defaultLight = new THREE.AmbientLight(new THREE.Color(lightProps.color), lightProps.intensity); break;
                        case 'directional':
                        default: defaultLight = new THREE.DirectionalLight(new THREE.Color(lightProps.color), lightProps.intensity);
                                 defaultLight.position.set(5,5,5);
                                 break;
                    }
                    this.linkNodeToSceneObject(nodeElement, defaultLight);
                    if (window.scene) {
                         window.scene.add(defaultLight);
                         if (defaultLight.target && defaultLight.target.isObject3D && window.scene) { // SpotLight and DirectionalLight have targets
                            window.scene.add(defaultLight.target);
                        }
                    }
                }
                return nodeElement;
            }*/

            updateNodeProperties(nodeElement) { /* ... (Full code from previous response) ... */
                 const nodeData = this.nodes.get(nodeElement);
                if (nodeData) {
                    nodeData.properties = this.getNodeProperties(nodeElement); // Update internal data store
                }
            }
            updateConnectedNodesAndEffects(sourceNodeElement) { /* ... (Full code from previous response) ... */
                const sourceNodeData = this.nodes.get(sourceNodeElement);
                if (!sourceNodeData) return;

                this.connections.forEach(conn => {
                    let targetNodeElement = null;
                    let isForwardConnection = false;

                    if (conn.startSocket.closest('.node') === sourceNodeElement) {
                        targetNodeElement = conn.endSocket.closest('.node');
                        isForwardConnection = true;
                    } else if (conn.endSocket.closest('.node') === sourceNodeElement) {
                        // If sourceNode is an input, it's receiving properties.
                        // Generally, don't propagate "backwards" unless there's specific logic for it.
                        // We are interested when the *output* of sourceNodeElement changes.
                        return;
                    }

                    if (targetNodeElement && isForwardConnection) {
                        const targetNodeData = this.nodes.get(targetNodeElement);
                        if (!targetNodeData) return;

                        // 1. Apply source node's direct properties to target's linked 3D object (if applicable)
                        //    This is for direct connections like Material -> Object or Transform -> Object
                        if (targetNodeData.object) {
                             this.applyNodePropertiesToSceneObject(sourceNodeElement, targetNodeData.object);
                        }


                        // 2. Apply/Update Effects
                        // If source is an "Effect" node and target is an "Object" node
                        if (sourceNodeData.type === 'effect' && targetNodeData.type === 'object' && targetNodeData.object) {
                            this.applyOrUpdateNodeEffect(sourceNodeElement, targetNodeData.object);
                        }
                        // If target is an "Effect" node and source is an "Object" node (effect applied TO source)
                        // This case is less common directly via connection; usually an effect node targets an object node.
                        // But if you had an "Object Info" node outputting to an "Effect" node's input:
                        else if (targetNodeData.type === 'effect' && sourceNodeData.type === 'object' && sourceNodeData.object) {
                            // The effect node (targetNodeElement) should be applied to sourceNodeData.object
                            this.applyOrUpdateNodeEffect(targetNodeElement, sourceNodeData.object);
                        }
                        // Could add more specific logic: e.g. if a Light node is connected to an Object node,
                        // maybe the object should use custom shaders that react to that specific light.
                    }
                });

                // If the source node itself is an object and has an effect applied TO IT, update that effect
                if (sourceNodeData.object && this.nodeEffects.has(sourceNodeData.object)) {
                    const effectInstance = this.nodeEffects.get(sourceNodeData.object);
                    // We need to find the Effect Node that applied this effectInstance to update its properties
                    // This is tricky. A simpler model is that an Effect Node *targets* an Object Node.
                    // For now, we assume an effect node's properties are what drive the effect on a target.
                }
            }
            deleteNode(nodeElement) { /* ... (Full code from previous response) ... */
                if (!nodeElement || !this.nodes.has(nodeElement)) return;

                const connectionsToDelete = new Set();
                this.connections.forEach(conn => {
                    if (conn.startSocket.closest('.node') === nodeElement || conn.endSocket.closest('.node') === nodeElement) {
                        connectionsToDelete.add(conn);
                    }
                });
                connectionsToDelete.forEach(conn => this.deleteConnection(conn));

                const nodeData = this.nodes.get(nodeElement);
                if (nodeData) {
                    if (nodeData.object) {
                        // If this node's object had an effect applied by ANOTHER node, that effect remains.
                        // If THIS node was an EFFECT node and applied an effect TO ANOTHER object,
                        // we need to find that connection and clean up the effect.
                        // This is complex. Simplified: clean up effects *managed by* this node if it was an effect source.
                        // A better approach is to track which effect node applied which effect instance.
                        // For now, if nodeData.object is a THREE.Points or a custom effect mesh, it's likely an effect created by this node.
                        if (this.nodeEffects.has(nodeData.object)) { // If this object itself had an effect applied to it
                            const effect = this.nodeEffects.get(nodeData.object);
                            if (effect.cleanup) effect.cleanup();
                            this.nodeEffects.delete(nodeData.object);
                        }
                         // Also, iterate effects and see if this node's object was a target of an effect node
                        this.nodeEffects.forEach((effectInstance, sceneObj) => {
                            if (effectInstance.sourceEffectNode === nodeElement) { // Need to store this link
                                if (effectInstance.cleanup) effectInstance.cleanup();
                                this.nodeEffects.delete(sceneObj);
                            }
                        });


                        if (nodeData.object.parent) {
                            nodeData.object.parent.remove(nodeData.object);
                            if (nodeData.object.isLight && nodeData.object.target && nodeData.object.target.parent) {
                                nodeData.object.target.parent.remove(nodeData.object.target);
                            }
                            try { // Graceful disposal
                                if (nodeData.object.geometry) nodeData.object.geometry.dispose();
                                if (nodeData.object.material) {
                                    if (Array.isArray(nodeData.object.material)) {
                                        nodeData.object.material.forEach(m => { if(m.dispose) m.dispose(); });
                                    } else {
                                        if(nodeData.object.material.dispose) nodeData.object.material.dispose();
                                    }
                                }
                            } catch (e) { console.warn("Error during 3D object disposal:", e); }
                        }
                    }
                }

                if (this.selectedNode === nodeElement) {
                    this.selectedNode.classList.remove('selected');
                    this.selectedNode = null;
                }
                this.nodes.delete(nodeElement);
                nodeElement.remove();
            }


            // --- Connection Management (Full methods from previous response) ---
            startDraggingConnection(socketElement) { /* ... (same) ... */
                const startPos = this.getConnectionEndpoint(socketElement);
                this.connectingSocketInfo = {
                    socketElement: socketElement,
                    isOutput: socketElement.classList.contains('output') || socketElement.dataset.socketType === 'output',
                    startX: startPos.x,
                    startY: startPos.y
                };
                this.tempConnectionLine.setAttribute('d', `M ${startPos.x},${startPos.y} L ${startPos.x},${startPos.y}`);
                this.tempConnectionLine.style.display = 'block';
                this.svg.appendChild(this.tempConnectionLine);
            }
            updateTempConnectionLine(mouseEvent) { /* ... (same, ensure Bezier logic is good) ... */
                if (!this.connectingSocketInfo) return;
                const endPos = this.getMousePositionInCanvasSpace(mouseEvent);
                const startX = this.connectingSocketInfo.startX;
                const startY = this.connectingSocketInfo.startY;

                const dx = endPos.x - startX;
                let controlOffset = Math.abs(dx) * this.tempConnectionLine.controlPointOffsetFactor || 0.4; // Use factor
                controlOffset = Math.max(this.tempConnectionLine.minControlOffset || 30, Math.min(this.tempConnectionLine.maxControlOffset || 150, controlOffset));

                const pathData = `M ${startX},${startY} C ${startX + controlOffset * (this.connectingSocketInfo.isOutput ? 1 : -1)},${startY} ${endPos.x - controlOffset * (this.connectingSocketInfo.isOutput ? -1 : 1)},${endPos.y} ${endPos.x},${endPos.y}`;
                this.tempConnectionLine.setAttribute('d', pathData);
            }
            clearTempConnection() { /* ... (same) ... */
                this.connectingSocketInfo = null;
                this.tempConnectionLine.style.display = 'none';
                this.canvas.querySelectorAll('.node-socket.valid-target').forEach(s => s.classList.remove('valid-target'));
            }
            tryEndConnection(endSocketElement) { /* ... (same, ensure validation and connection creation) ... */
                if (!this.connectingSocketInfo || !endSocketElement || typeof this.isValidConnectionTarget !== 'function') {
                    this.clearTempConnection(); return;
                }
                const startSocketElement = this.connectingSocketInfo.socketElement;
                if (!this.isValidConnectionTarget(startSocketElement, endSocketElement)) {
                    console.warn("NodeEditor: Invalid connection target."); this.clearTempConnection(); return;
                }
                const finalStartSocket = this.connectingSocketInfo.isOutput ? startSocketElement : endSocketElement;
                const finalEndSocket = this.connectingSocketInfo.isOutput ? endSocketElement : startSocketElement;

                for (const conn of this.connections) {
                    if (conn.startSocket === finalStartSocket && conn.endSocket === finalEndSocket) {
                        console.warn("NodeEditor: Connection already exists."); this.clearTempConnection(); return;
                    }
                }
                const connection = new NodeConnection(finalStartSocket, finalEndSocket, this);
                this.connections.add(connection);
                const sourceNodeElement = finalStartSocket.closest('.node');
                this.updateConnectedNodesAndEffects(sourceNodeElement);
                finalStartSocket.classList.add('connected');
                finalEndSocket.classList.add('connected');
                this.clearTempConnection();
            }
            isValidConnectionTarget(startSocket, endSocketCandidate) { /* ... (same) ... */
                if (!startSocket || !endSocketCandidate || startSocket === endSocketCandidate) return false;
                if (startSocket.closest('.node') === endSocketCandidate.closest('.node')) return false;

                const startIsOutput = startSocket.classList.contains('output') || startSocket.dataset.socketType === 'output';
                const endIsInput = endSocketCandidate.classList.contains('input') || endSocketCandidate.dataset.socketType === 'input';
                // An output can only connect to an input.
                return startIsOutput && endIsInput;
            }
            getConnectionEndpoint(socketElement) { /* ... (same) ... */
                const canvasRect = this.canvas.getBoundingClientRect();
                const socketRect = socketElement.getBoundingClientRect();
                const x = (socketRect.left + socketRect.width / 2 - canvasRect.left - this.viewportX) / this.scale;
                const y = (socketRect.top + socketRect.height / 2 - canvasRect.top - this.viewportY) / this.scale;
                return { x, y };
            }
            updateAllConnections() { /* ... (same) ... */ this.connections.forEach(conn => conn.update());}
            updateConnectionsForNode(nodeElement) { /* ... (same) ... */
                 this.connections.forEach(conn => {
                    if (conn.startSocket.closest('.node') === nodeElement || conn.endSocket.closest('.node') === nodeElement) {
                        conn.update();
                    }
                });
            }
            selectConnection(connection) { /* ... (same) ... */
                if (!connection) return;
                this.deselectAll();
                connection.setSelected(true);
                this.selectedConnections.add(connection);
            }
            deleteConnection(connection) { /* ... (same, ensure socket unstyling) ... */
                if (!connection) return;
                if (connection.startSocket) connection.startSocket.classList.remove('connected');
                if (connection.endSocket) connection.endSocket.classList.remove('connected');
                connection.remove();
                this.connections.delete(connection);
                this.selectedConnections.delete(connection);
            }
            deselectAll() { /* ... (same) ... */
                if (this.selectedNode) {
                    this.selectedNode.classList.remove('selected');
                    this.selectedNode = null;
                }
                this.selectedConnections.forEach(conn => conn.setSelected(false));
                this.selectedConnections.clear();
            }

            // --- Effect Application ---
            /*applyOrUpdateNodeEffect(effectNodeElement, targetSceneObject) { 
                if (!effectNodeElement || !targetSceneObject) return;
                const effectNodeData = this.nodes.get(effectNodeElement);
                if (!effectNodeData || effectNodeData.type !== 'effect') return;

                const properties = this.getNodeProperties(effectNodeElement);
                const effectType = properties.type ? properties.type.toLowerCase() : null; // Ensure lowercase for switch

                let effectInstance = this.nodeEffects.get(targetSceneObject);
                // Check if the existing effect is of the correct type
                let needsNewInstance = !effectInstance;
                if (effectInstance) {
                    // A bit hacky to get class name, better to store type on instance
                    const instanceType = (effectInstance.constructor.name.replace('Effect', '')).toLowerCase();
                    if (instanceType !== effectType) {
                        if (typeof effectInstance.cleanup === 'function') effectInstance.cleanup();
                        this.nodeEffects.delete(targetSceneObject);
                        effectInstance = null;
                        needsNewInstance = true;
                    }
                }


                if (needsNewInstance) {
                    switch (effectType) {
                        case 'water':     effectInstance = new WaterEffect(targetSceneObject, properties); break;
                        case 'particles': effectInstance = new ParticleEffect(targetSceneObject, properties); break;
                        case 'trail':     effectInstance = new TrailEffect(targetSceneObject, properties); break;
                        case 'glow':      effectInstance = new GlowEffect(targetSceneObject, properties); break;
                        default:
                            console.warn(`Effect type "${effectType}" not recognized for instantiation.`);
                            return;
                    }
                    if (effectInstance) {
                        effectInstance.sourceEffectNode = effectNodeElement; // Link back to the node for cleanup
                        this.nodeEffects.set(targetSceneObject, effectInstance);
                    }
                } else if (effectInstance && typeof effectInstance.setProperties === 'function') {
                    effectInstance.setProperties(properties);
                }
            }*/

                applyOrUpdateNodeEffect(effectNodeElement, targetSceneObject) {
    if (!effectNodeElement || !targetSceneObject) return;
    const effectNodeData = this.nodes.get(effectNodeElement);
    if (!effectNodeData || effectNodeData.type !== 'effect') return;

    const properties = this.getNodeProperties(effectNodeElement);
    const effectType = properties.type ? properties.type.toLowerCase() : null;

    let effectInstance = this.nodeEffects.get(targetSceneObject);
    let effectClassName = effectType ? `${effectType.charAt(0).toUpperCase() + effectType.slice(1)}Effect` : '';

    let needsNewInstance = !effectInstance;
    if (effectInstance) {
        const instanceType = (effectInstance.constructor.name.replace('Effect', '')).toLowerCase();
        if (instanceType !== effectType) {
            if (typeof effectInstance.cleanup === 'function') effectInstance.cleanup();
            this.nodeEffects.delete(targetSceneObject);
            effectInstance = null;
            needsNewInstance = true;
        }
    }

    if (needsNewInstance) {
        // Pass this.scene and this.camera to the effect constructors
        // The effect constructors would need to be updated to accept these
        const effectOptions = {
            ...properties,
            // You might need to adapt effect constructors to take scene/camera if they don't already
            // For now, assuming they use window.scene/camera or get it from targetObject.parent
        };

        switch (effectType) {
            case 'water':     effectInstance = new WaterEffect(targetSceneObject, effectOptions); break;
            case 'particles': effectInstance = new ParticleEffect(targetSceneObject, effectOptions); break;
            case 'trail':     effectInstance = new TrailEffect(targetSceneObject, effectOptions); break;
            case 'glow':      effectInstance = new GlowEffect(targetSceneObject, effectOptions); break;
            default:
                console.warn(`Effect type "${effectType}" not recognized for instantiation.`);
                return;
        }
        if (effectInstance) {
            effectInstance.sourceEffectNode = effectNodeElement;
            // If effect constructors are updated to take scene/camera:
            // effectInstance.scene = this.scene;
            // effectInstance.camera = this.camera;
            this.nodeEffects.set(targetSceneObject, effectInstance);
        }
    } else if (effectInstance && typeof effectInstance.setProperties === 'function') {
        effectInstance.setProperties(properties);
    }
}


            // --- Update Loop & Utilities ---
            update(deltaTime) { /* ... (same) ... */
                this.nodeEffects.forEach((effectInstance) => {
                    if (effectInstance && typeof effectInstance.update === 'function') {
                        effectInstance.update(deltaTime);
                    }
                });
            }
            getNodeProperties(nodeElement) { /* ... (Full code from previous response) ... */
                 const properties = {};
                nodeElement.querySelectorAll('input, select').forEach(input => {
                    const name = input.name;
                    let value;
                    switch (input.type) {
                        case 'checkbox': value = input.checked; break;
                        case 'number': case 'range': value = parseFloat(input.value); break;
                        case 'color': value = input.value; break;
                        default: value = input.value;
                    }
                    if (name.includes('_x') || name.includes('_y') || name.includes('_z')) {
                        const baseName = name.substring(0, name.lastIndexOf('_'));
                        const component = name.substring(name.lastIndexOf('_') + 1);
                        if (!properties[baseName]) properties[baseName] = {};
                        properties[baseName][component] = isNaN(parseFloat(value)) ? value : parseFloat(value); // Store as number if possible
                    } else {
                        properties[name] = value;
                    }
                });
                return properties;
            }
            updateNodeUI(nodeElement) { /* ... (Full code from previous response) ... */
                const nodeData = this.nodes.get(nodeElement);
                if (!nodeData || !nodeData.properties) return;
                const properties = nodeData.properties;

                nodeElement.querySelectorAll('input, select').forEach(input => {
                    let valueToSet;
                    const name = input.name;

                    if (name.includes('_x') || name.includes('_y') || name.includes('_z')) {
                        const baseName = name.substring(0, name.lastIndexOf('_'));
                        const component = name.substring(name.lastIndexOf('_') + 1);
                        if (properties[baseName] && properties[baseName][component] !== undefined) {
                            valueToSet = properties[baseName][component];
                        }
                    } else if (properties[name] !== undefined) {
                        valueToSet = properties[name];
                    }

                    if (valueToSet !== undefined) {
                        if (input.type === 'checkbox') {
                            input.checked = Boolean(valueToSet);
                        } else {
                            input.value = valueToSet;
                        }
                        if (input.type === 'range' && input.nextElementSibling?.classList.contains('value-display')) {
                             const stepAttr = input.getAttribute('step') || "0.01";
                             const step = parseFloat(stepAttr);
                             const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
                             input.nextElementSibling.textContent = parseFloat(valueToSet).toFixed(precision);
                        }
                    }
                });
                this.updatePropertyVisibility(nodeElement);
            }
        }
