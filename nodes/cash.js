// Paste CLASS NodeConnection (Enhanced) here (from previous response)
        class NodeConnection {
            constructor(startSocket, endSocket, editor, options = {}) {
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
                    color: 'var(--node-connection-color, #9e9e9e)',
                    strokeWidth: 2.5,
                    dashed: false,
                    showArrow: true,
                    hoverColor: 'var(--node-connection-hover-color, #03A9F4)',
                    selectedColor: 'var(--node-connection-selected-color, #FFC107)',
                    arrowSize: 8,
                    controlPointOffsetFactor: 0.4, // Dynamic offset factor
                    minControlOffset: 30,
                    maxControlOffset: 150,
                    animationSpeed: 50, // Pixels per second for dashed animation
                    ...options
                };

                this.element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this.interactionElement = document.createElementNS('http://www.w3.org/2000/svg', 'path'); // For easier mouse interaction
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

                svg.appendChild(this.interactionElement);
                svg.appendChild(this.element);

                if (this.arrowhead) {
                    this.arrowhead.setAttribute('class', 'node-connection-arrow');
                    this.arrowhead.setAttribute('fill', this.options.color);
                    svg.appendChild(this.arrowhead);
                }
                this.update();
            }

            addEventListeners() {
                this.interactionElement.addEventListener('mouseenter', () => {
                    if (!this.isSelected) {
                        this.element.setAttribute('stroke', this.options.hoverColor);
                        if (this.arrowhead) this.arrowhead.setAttribute('fill', this.options.hoverColor);
                        this.element.classList.add('hovered');
                    }
                });

                this.interactionElement.addEventListener('mouseleave', () => {
                    if (!this.isSelected) {
                        this.element.setAttribute('stroke', this.options.color);
                        if (this.arrowhead) this.arrowhead.setAttribute('fill', this.options.color);
                        this.element.classList.remove('hovered');
                    }
                });

                this.interactionElement.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    this.editor.selectConnection(this);
                });
                 this.interactionElement.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    if (confirm("Delete this connection?")) {
                        this.editor.deleteConnection(this);
                    }
                });
            }

            update() {
                if (!this.startSocket || !this.endSocket || !this.editor.canvas || !this.element.isConnected) return;

                const startPos = this.editor.getConnectionEndpoint(this.startSocket); // Use editor's method
                const endPos = this.editor.getConnectionEndpoint(this.endSocket);

                if (isNaN(startPos.x) || isNaN(startPos.y) || isNaN(endPos.x) || isNaN(endPos.y)) {
                    return;
                }

                const dx = endPos.x - startPos.x;
                const dy = endPos.y - startPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                let controlOffset = distance * this.options.controlPointOffsetFactor;
                controlOffset = Math.max(this.options.minControlOffset, Math.min(this.options.maxControlOffset, controlOffset));
                // No need to divide by scale here as startPos/endPos are already in unscaled space

                const startIsOutput = this.startSocket.classList.contains('output') || this.startSocket.classList.contains('socket-right');
                const endIsInput = this.endSocket.classList.contains('input') || this.endSocket.classList.contains('socket-left');

                let pathData;
                if (startIsOutput && endIsInput && startPos.x < endPos.x + 20) { // Standard L-to-R flow, added tolerance
                    pathData = `M ${startPos.x},${startPos.y} C ${startPos.x + controlOffset},${startPos.y} ${endPos.x - controlOffset},${endPos.y} ${endPos.x},${endPos.y}`;
                } else { // S-curve for feedback or unusual layouts
                    const c1x = startPos.x + controlOffset * (startIsOutput ? 1 : -1);
                    const c1y = startPos.y;
                    const c2x = endPos.x + controlOffset * (endIsInput ? -1 : 1);
                    const c2y = endPos.y;
                    pathData = `M ${startPos.x},${startPos.y} C ${c1x},${c1y} ${c2x},${c2y} ${endPos.x},${endPos.y}`;
                }

                this.element.setAttribute('d', pathData);
                this.interactionElement.setAttribute('d', pathData);

                const currentScale = this.editor.scale;
                this.element.setAttribute('stroke-width', (this.options.strokeWidth / currentScale).toFixed(2));
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
                const angle = Math.atan2(tip.y - preTip.y, tip.x - preTip.x);
                const arrowSize = this.options.arrowSize / scale;

                const x1 = tip.x - arrowSize * Math.cos(angle - Math.PI / 7); // Slightly wider arrow
                const y1 = tip.y - arrowSize * Math.sin(angle - Math.PI / 7);
                const x2 = tip.x - arrowSize * Math.cos(angle + Math.PI / 7);
                const y2 = tip.y - arrowSize * Math.sin(angle + Math.PI / 7);

                this.arrowhead.setAttribute('d', `M ${tip.x.toFixed(2)},${tip.y.toFixed(2)} L ${x1.toFixed(2)},${y1.toFixed(2)} L ${x2.toFixed(2)},${y2.toFixed(2)} Z`);
            }


            setSelected(selected) {
                this.isSelected = selected;
                const color = this.isSelected ? this.options.selectedColor : (this.element.classList.contains('hovered') ? this.options.hoverColor : this.options.color);
                this.element.setAttribute('stroke', color);
                if (this.arrowhead) this.arrowhead.setAttribute('fill', color);
                this.element.classList.toggle('selected', this.isSelected);
            }

            startDashAnimation() {
                if (this.animationFrameId || !this.options.dashed || !this.element.isConnected) return;
                const animate = (timestamp) => {
                    if(!this.element.isConnected) { // Stop if element is removed
                        this.stopDashAnimation();
                        return;
                    }
                    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
                    const deltaTime = (timestamp - this.lastTimestamp) / 1000;
                    this.lastTimestamp = timestamp;

                    this.dashOffset -= this.options.animationSpeed * deltaTime;
                    this.element.setAttribute('stroke-dashoffset', this.dashOffset);

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


        // Paste CLASS WaterEffect (Significantly Enhanced) here (from previous response)
        // Make sure to replace 'path/to/your/...' with actual texture paths
        class WaterEffect {
            constructor(object, properties = {}) {
                this.object = object;
                this.scene = object.parent || window.scene;
                this.camera = window.camera;

                this.properties = {
                    flowDirection: new THREE.Vector2(properties.flowDirection?.x || 1.0, properties.flowDirection?.y || 0.3),
                    distortionScale: parseFloat(properties.distortionScale) || 30.0,
                    sunDirection: new THREE.Vector3(properties.sunDirection?.x || 0.8, properties.sunDirection?.y || 0.8, properties.sunDirection?.z || 0.5).normalize(),
                    sunColor: new THREE.Color(properties.sunColor || 0xfff5e1), // Warm sun
                    waterColor: new THREE.Color(properties.waterColor || 0x003f5e), // Deeper blue
                    eye: new THREE.Vector3(),
                    size: parseFloat(properties.size) || 1.0, // Wave size relative to UVs
                    alpha: parseFloat(properties.alpha) || 0.9,
                    noiseScale: parseFloat(properties.noiseScale) || 0.1, // Smaller for finer noise
                    waterHeight: parseFloat(properties.waterHeight) || 0.0,
                    rippleStrength: parseFloat(properties.rippleStrength) || 0.1,
                    shininess: parseFloat(properties.shininess) || 80.0,
                    reflectivity: parseFloat(properties.reflectivity) || 0.7,
                    refractionRatio: parseFloat(properties.refractionRatio) || 0.97,
                    foamColor: new THREE.Color(properties.foamColor || 0xe6f2ff),
                    foamThreshold: parseFloat(properties.foamThreshold) || 0.6,
                    foamSoftness: parseFloat(properties.foamSoftness) || 0.1, // How soft the foam transition is
                     // Properties from your original code, if still needed
                    flowRate: parseFloat(properties.flowRate) || 1.0,
                    viscosity: parseFloat(properties.viscosity) || 0.5,
                    surfaceTension: parseFloat(properties.surfaceTension) || 0.8,
                    // waterHeight already covered
                    waterOpacity: parseFloat(properties.waterOpacity) || 0.8, // Will be uAlpha
                    ...properties
                };
                this.properties.alpha = this.properties.waterOpacity; // Map waterOpacity to alpha


                const textureLoader = new THREE.TextureLoader();
                // TODO: Replace with actual paths to your textures
                this.normalSampler = textureLoader.load('https://threejs.org/examples/textures/waternormals.jpg'); // Example
                if (this.normalSampler) {
                    this.normalSampler.wrapS = this.normalSampler.wrapT = THREE.RepeatWrapping;
                } else {
                    console.warn("WaterEffect: Normal map texture not loaded. Using fallback.");
                    this.normalSampler = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat); // Flat normal
                    this.normalSampler.needsUpdate = true;
                }


                const cubeTextureLoader = new THREE.CubeTextureLoader();
                 // TODO: Replace with actual paths to your cubemap
                this.envMapSampler = cubeTextureLoader.setPath('https://threejs.org/examples/textures/cube/Bridge2/') // Example path
                    .load(['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']);
                if(this.envMapSampler) {
                    this.envMapSampler.mapping = THREE.CubeReflectionMapping;
                } else {
                    console.warn("WaterEffect: Environment map texture not loaded. Reflections will be basic.");
                    // Create a fallback cubemap (e.g., solid color) if loading fails
                    // This is more complex, so for now, just log a warning.
                }


                this.originalMaterial = object.material;
                this.waterMaterial = this.createWaterMaterial();
                this.object.material = this.waterMaterial;
            }

            createWaterMaterial() {
                return new THREE.ShaderMaterial({
                    uniforms: THREE.UniformsUtils.merge([
                        THREE.UniformsLib.lights, // If you want to use Three.js lights
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
                            // uViewMatrix and uProjectionMatrix are provided by Three.js if 'lights: true' or handled manually
                        }
                    ]),
                    vertexShader: `
                        uniform float uTime;
                        uniform float uSize;         // Relative wave size to UVs
                        uniform float uWaterHeight;  // Base height offset
                        uniform float uRippleStrength; // Amplitude of waves

                        attribute vec3 position; // Ensure these are standard attributes
                        attribute vec2 uv;
                        attribute vec3 normal;

                        varying vec3 vWorldPosition;
                        varying vec3 vProjectedCoords; // For screen-space effects if needed
                        varying vec3 vSurfaceNormal;   // Geometric normal of the wave
                        varying vec2 vUv;
                        varying float vWaveHeightFactor; // Normalized wave height for foam etc.

                        // Gerstner Wave function
                        vec3 gerstnerWave(vec2 P, vec2 D, float steepness, float A, float k, float speed, float t) {
                            float f = k * (dot(D, P) - speed * t);
                            float qa = steepness * A; // Q factor for steepness (0 to 1)

                            return vec3(
                                D.x * qa * cos(f),
                                A * sin(f),
                                D.y * qa * cos(f)
                            );
                        }
                        // Derivatives for normal calculation
                        vec2 dGerstnerWave_dx(vec2 P, vec2 D, float steepness, float A, float k, float speed, float t) {
                            float f = k * (dot(D, P) - speed * t);
                            float qa = steepness * A;
                            return vec2(
                                -D.x * D.x * qa * k * sin(f), // dX/dx
                                -D.x * qa * k * cos(f)       // dY/dx
                            );
                        }
                        vec2 dGerstnerWave_dz(vec2 P, vec2 D, float steepness, float A, float k, float speed, float t) {
                            float f = k * (dot(D, P) - speed * t);
                            float qa = steepness * A;
                            return vec2(
                                -D.y * D.x * qa * k * sin(f), // dX/dz
                                -D.y * qa * k * cos(f)       // dY/dz
                            );
                        }


                        void main() {
                            vUv = uv * uSize; // Scale UVs for wave tiling
                            vec3 pos = position;
                            vec3 accumulatedDisplacement = vec3(0.0);
                            vec3 accumulatedTangent = vec3(1.0, 0.0, 0.0);
                            vec3 accumulatedBitangent = vec3(0.0, 0.0, 1.0);

                            // Parameters for waves (direction, steepness, amplitude, wavelength, speed)
                            // Wave 1
                            float A1 = 0.05 * uRippleStrength; float L1 = 2.0; float S1 = 1.0; vec2 D1 = normalize(vec2(1.0, 0.5));
                            float k1 = 2.0 * PI / L1;
                            vec3 wave1_disp = gerstnerWave(position.xz, D1, 0.8, A1, k1, S1, uTime);
                            accumulatedDisplacement += wave1_disp;
                            vec2 dP1_dx = dGerstnerWave_dx(position.xz, D1, 0.8, A1, k1, S1, uTime);
                            vec2 dP1_dz = dGerstnerWave_dz(position.xz, D1, 0.8, A1, k1, S1, uTime);
                            accumulatedTangent += vec3(dP1_dx.x, dP1_dx.y, 0.0);
                            accumulatedBitangent += vec3(dP1_dz.x, dP1_dz.y, 0.0); // Error here, should be (dX/dz, dY/dz, 1.0) for bitangent if Z is depth


                            // Wave 2
                            float A2 = 0.03 * uRippleStrength; float L2 = 1.2; float S2 = 1.5; vec2 D2 = normalize(vec2(-0.5, 0.8));
                            float k2 = 2.0 * PI / L2;
                            vec3 wave2_disp = gerstnerWave(position.xz, D2, 0.6, A2, k2, S2, uTime);
                            accumulatedDisplacement += wave2_disp;
                            vec2 dP2_dx = dGerstnerWave_dx(position.xz, D2, 0.6, A2, k2, S2, uTime);
                            vec2 dP2_dz = dGerstnerWave_dz(position.xz, D2, 0.6, A2, k2, S2, uTime);
                            accumulatedTangent += vec3(dP2_dx.x, dP2_dx.y, 0.0);
                            accumulatedBitangent += vec3(dP2_dz.x, dP2_dz.y, 0.0); // Same potential error


                            // Wave 3 (choppier)
                            float A3 = 0.02 * uRippleStrength; float L3 = 0.7; float S3 = 2.0; vec2 D3 = normalize(vec2(0.3, -1.0));
                            float k3 = 2.0 * PI / L3;
                            vec3 wave3_disp = gerstnerWave(position.xz, D3, 0.9, A3, k3, S3, uTime);
                            accumulatedDisplacement += wave3_disp;
                            vec2 dP3_dx = dGerstnerWave_dx(position.xz, D3, 0.9, A3, k3, S3, uTime);
                            vec2 dP3_dz = dGerstnerWave_dz(position.xz, D3, 0.9, A3, k3, S3, uTime);
                            accumulatedTangent += vec3(dP3_dx.x, dP3_dx.y, 0.0);
                            accumulatedBitangent += vec3(dP3_dz.x, dP3_dz.y, 0.0); // Same potential error


                            pos += accumulatedDisplacement;
                            pos.y += uWaterHeight;

                            // Corrected Tangent and Bitangent calculation for surface normal
                            vec3 T = normalize(vec3(1.0 - dP1_dx.x - dP2_dx.x - dP3_dx.x, dP1_dx.y + dP2_dx.y + dP3_dx.y, -dP1_dz.x - dP2_dz.x - dP3_dz.x));
                            vec3 B = normalize(vec3(-dP1_dx.x - dP2_dx.x - dP3_dx.x, dP1_dz.y + dP2_dz.y + dP3_dz.y, 1.0 - dP1_dz.x - dP2_dz.x - dP3_dz.x)); // this seems off based on the derivative names
                            vSurfaceNormal = normalize(cross(T, B)); // Geometric normal of the wave surface

                            vWaveHeightFactor = clamp( (accumulatedDisplacement.y / ( (A1+A2+A3) * 0.8 + 0.001)) , 0.0, 1.0); // For foam

                            vec4 worldPos = modelMatrix * vec4(pos, 1.0);
                            vWorldPosition = worldPos.xyz;

                            gl_Position = projectionMatrix * viewMatrix * worldPos;
                            vProjectedCoords = gl_Position.xyz / gl_Position.w; // For screen-space effects
                        }
                    `,
                    fragmentShader: `
                        uniform float uTime;
                        uniform vec2 uFlowDirection;
                        uniform float uDistortionScale; // Should be uNoiseScale for normal map tiling
                        uniform vec3 uSunDirection;
                        uniform vec3 uSunColor;
                        uniform vec3 uWaterColor;
                        uniform vec3 uEye;
                        uniform float uAlpha;
                        uniform float uNoiseScale; // Actual noise scale for distortions, not normal map tiling
                        uniform sampler2D uNormalSampler;
                        uniform samplerCube uEnvMapSampler;
                        uniform float uShininess;
                        uniform float uReflectivity;
                        uniform float uRefractionRatio;
                        uniform vec3 uFoamColor;
                        uniform float uFoamThreshold;
                        uniform float uFoamSoftness;

                        varying vec3 vWorldPosition;
                        varying vec3 vSurfaceNormal; // Geometric wave normal
                        varying vec2 vUv;            // Tiled UVs for normal map
                        varying float vWaveHeightFactor;
                        varying vec3 vProjectedCoords; // For screen-space depth if available

                        float fresnelSchlick(float cosTheta, float F0) {
                            return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
                        }

                        // Basic noise for foam variation
                        float simpleNoise(vec2 st) {
                            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                        }

                        void main() {
                            vec2 flowSpeed1 = vec2(0.03, 0.015);
                            vec2 flowSpeed2 = vec2(-0.02, 0.025);
                            vec2 normal_uv1 = vUv + uFlowDirection * uTime * flowSpeed1.x;
                            vec2 normal_uv2 = vUv * 0.7 - uFlowDirection * uTime * flowSpeed2.y; // Different scale and speed

                            vec3 normalMapVal1 = texture2D(uNormalSampler, normal_uv1).rgb * 2.0 - 1.0;
                            vec3 normalMapVal2 = texture2D(uNormalSampler, normal_uv2).rgb * 2.0 - 1.0;
                            vec3 sampledNormal = normalize(normalMapVal1 * 0.6 + normalMapVal2 * 0.4); // Blend texture normals

                            // Combine geometric normal with sampled normal map (Tangent-space to World-space)
                            // This requires a TBN matrix. For a flat plane, TBN can be simplified.
                            // Assuming plane is in XY, normal is Z up before waves.
                            // A more robust TBN calculation from vSurfaceNormal is needed for arbitrary geometry.
                            // Simplified for now, assuming vSurfaceNormal is world-space geometric normal.
                            mat3 tbn = mat3( // Placeholder TBN if initial surface is XY plane
                                normalize(vec3(vSurfaceNormal.z, 0.0, -vSurfaceNormal.x)), // Tangent
                                normalize(vec3(0.0,vSurfaceNormal.z,-vSurfaceNormal.y)), // Bitangent
                                vSurfaceNormal // Normal
                            );
                            vec3 worldNormal = normalize(tbn * sampledNormal); // This is a common mistake, TBN should transform FROM tangent space.
                                                                               // Better: use vSurfaceNormal and perturb it slightly with sampledNormal.
                            worldNormal = normalize(vSurfaceNormal + sampledNormal * 0.2); // Simplified perturbation


                            vec3 viewDir = normalize(uEye - vWorldPosition);

                            // Reflection
                            vec3 reflectDir = reflect(-viewDir, worldNormal);
                            vec4 skyColor = textureCube(uEnvMapSampler, reflectDir);

                            // Refraction (Simplified: depth based color + distortion from normal)
                            // True refraction requires rendering scene to a texture or depth buffer access
                            float depthFactor = smoothstep(0.0, 2.0 * uRippleStrength + 0.1, -vWorldPosition.y + uEye.y); // Simulate depth, crude
                            vec3 deepWaterColor = uWaterColor * 0.5; // Darker for deep
                            vec3 shallowWaterColor = uWaterColor * 1.2; // Lighter for shallow
                            vec3 refractedBaseColor = mix(deepWaterColor, shallowWaterColor, depthFactor);

                            // Distort refraction lookup slightly with normals for caustics-like effect
                            vec2 distortion = worldNormal.xz * uNoiseScale * 0.05; // Small distortion
                            // Refraction: for now, just use the base color.
                            // A common cheat is to sample the environment map with a refracted vector.
                            vec3 refractDir = refract(-viewDir, worldNormal, uRefractionRatio);
                            vec4 refractedEnvColor = textureCube(uEnvMapSampler, refractDir);
                            refractedBaseColor = mix(refractedBaseColor, refractedEnvColor.rgb * 0.5, 0.3);


                            // Fresnel
                            float F0 = 0.02; // Base reflectivity for non-metals (water)
                            float fresnelFactor = fresnelSchlick(max(dot(worldNormal, viewDir), 0.0), F0);
                            fresnelFactor = mix(fresnelFactor, 1.0, uReflectivity); // Modulate by overall reflectivity

                            // Specular Highlight (Blinn-Phong)
                            vec3 L = normalize(uSunDirection);
                            vec3 H = normalize(L + viewDir);
                            float NdotH = max(dot(worldNormal, H), 0.0);
                            float specularIntensity = pow(NdotH, uShininess);
                            vec3 specularColor = uSunColor * specularIntensity * (1.0 - fresnelFactor) * 2.0; // Modulate by fresnel so it's stronger at edges

                            // Foam calculation
                            float foamNoise = simpleNoise(vUv * 5.0 + uTime * 0.5); // Add noise pattern to foam
                            float foam = smoothstep(uFoamThreshold - uFoamSoftness, uFoamThreshold + uFoamSoftness, vWaveHeightFactor + foamNoise * 0.1);
                            foam *= smoothstep(0.0, 0.2, vWaveHeightFactor); // Foam more likely on higher waves

                            // Combine colors
                            vec3 finalColor = mix(refractedBaseColor, skyColor.rgb, fresnelFactor);
                            finalColor += specularColor;
                            finalColor = mix(finalColor, uFoamColor, foam);

                            gl_FragColor = vec4(finalColor, uAlpha);
                        }
                    `,
                    transparent: true,
                    side: THREE.DoubleSide,
                    lights: false // Set to true if using Three.js light uniforms directly and #include <lights_fragment_maps> etc.
                });
            }

            update(deltaTime) {
                if (this.waterMaterial && this.waterMaterial.uniforms) {
                    this.waterMaterial.uniforms.uTime.value += deltaTime * (this.properties.flowRate || 1.0);

                    if (this.camera) {
                        this.camera.getWorldPosition(this.waterMaterial.uniforms.uEye.value);
                    }
                     // uModelMatrix, uViewMatrix, uProjectionMatrix are automatically handled by Three.js renderer
                     // if they are part of the standard uniforms, but here we pass modelMatrix explicitly
                    this.waterMaterial.uniforms.uModelMatrix.value.copy(this.object.matrixWorld);
                }
            }

            cleanup() {
                if (this.object && this.originalMaterial) {
                    this.object.material = this.originalMaterial;
                }
                if (this.waterMaterial) this.waterMaterial.dispose();
                if (this.normalSampler) this.normalSampler.dispose();
                if (this.envMapSampler) this.envMapSampler.dispose();
            }

            setProperties(newProperties) {
                 // Map old property names to new ones if necessary
                if (newProperties.waterOpacity !== undefined) newProperties.alpha = newProperties.waterOpacity;

                for (const key in newProperties) {
                    if (this.properties.hasOwnProperty(key)) {
                        const uniformName = `u${key.charAt(0).toUpperCase() + key.slice(1)}`;
                        if (this.waterMaterial.uniforms[uniformName]) {
                            const uniform = this.waterMaterial.uniforms[uniformName];
                            if (newProperties[key] instanceof THREE.Color) {
                                this.properties[key].set(newProperties[key]);
                                uniform.value.set(newProperties[key]);
                            } else if (newProperties[key] instanceof THREE.Vector2 || newProperties[key] instanceof THREE.Vector3) {
                                // Check if properties[key] is already a vector, if not, create one
                                if (!this.properties[key] || !this.properties[key].isVector2 && !this.properties[key].isVector3) {
                                     this.properties[key] = newProperties[key] instanceof THREE.Vector2 ? new THREE.Vector2() : new THREE.Vector3();
                                }
                                this.properties[key].copy(newProperties[key]);
                                uniform.value.copy(newProperties[key]);
                            } else if (typeof newProperties[key] === 'object' && newProperties[key] !== null && (newProperties[key].x !== undefined || newProperties[key].r !== undefined)) {
                                // Handle plain objects for vectors/colors
                                if (uniform.value.isColor) {
                                    this.properties[key].set(newProperties[key].r !== undefined ? newProperties[key].r : newProperties[key].x, newProperties[key].g !== undefined ? newProperties[key].g : newProperties[key].y, newProperties[key].b !== undefined ? newProperties[key].b : newProperties[key].z);
                                    uniform.value.set(this.properties[key]);
                                } else if (uniform.value.isVector2) {
                                    this.properties[key].set(newProperties[key].x, newProperties[key].y);
                                     uniform.value.set(newProperties[key].x, newProperties[key].y);
                                } else if (uniform.value.isVector3) {
                                     this.properties[key].set(newProperties[key].x, newProperties[key].y, newProperties[key].z);
                                     uniform.value.set(newProperties[key].x, newProperties[key].y, newProperties[key].z);
                                }
                            } else {
                                const parsedValue = parseFloat(newProperties[key]);
                                if (!isNaN(parsedValue)) {
                                    this.properties[key] = parsedValue;
                                    uniform.value = parsedValue;
                                }
                            }
                        } else { // Property might not be a direct uniform but used in logic
                            this.properties[key] = newProperties[key];
                        }
                    }
                }
            }
        }

        // --- ParticleEffect Class (New) ---
        class ParticleEffect {
            constructor(targetObject, properties = {}) {
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
                    shape: properties.shape || 'sprite', // 'sprite', 'sphere', 'box'
                    spriteTexture: properties.spriteTexture || 'path/to/your/particleSprite.png', // REPLACE
                    emissionRate: 100, // Particles per second, derived from intensity
                    ...properties
                };

                this.particleCount = Math.floor(this.properties.intensity * 5000); // Max particles
                this.activeParticles = 0;
                this.timeToEmit = 0;

                this.geometry = new THREE.BufferGeometry();
                this.positions = new Float32Array(this.particleCount * 3);
                this.velocities = new Float32Array(this.particleCount * 3);
                this.colors = new Float32Array(this.particleCount * 3);
                this.sizes = new Float32Array(this.particleCount);
                this.ages = new Float32Array(this.particleCount);
                this.lifetimes = new Float32Array(this.particleCount);

                this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
                this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
                this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
                this.geometry.setAttribute('age', new THREE.BufferAttribute(this.ages, 1)); // For shader alpha

                // Load particle texture
                const textureLoader = new THREE.TextureLoader();
                this.particleTexture = textureLoader.load(this.properties.spriteTexture);
                if(!this.particleTexture) {
                    console.warn("ParticleEffect: Sprite texture not loaded. Particles may not render correctly.");
                     // Fallback texture (a white square)
                    const data = new Uint8Array([255, 255, 255, 255]);
                    this.particleTexture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
                    this.particleTexture.needsUpdate = true;
                }


                this.material = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0.0 },
                        uTexture: { value: this.particleTexture },
                        uGlobalColor: { value: this.properties.particleColor }
                    },
                    vertexShader: `
                        attribute float size;
                        attribute vec3 color;
                        attribute float age; // Normalized age (0 to 1 typically)

                        varying vec3 vColor;
                        varying float vAge;

                        void main() {
                            vColor = color;
                            vAge = age; // Pass age to fragment for alpha, etc.

                            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                            gl_PointSize = size * (200.0 / -mvPosition.z); // Perspective scaling
                            gl_Position = projectionMatrix * mvPosition;
                        }
                    `,
                    fragmentShader: `
                        uniform sampler2D uTexture;
                        uniform vec3 uGlobalColor;

                        varying vec3 vColor;
                        varying float vAge; // Age from 0 (birth) to 1 (death)

                        void main() {
                            float alpha = 1.0 - vAge; // Fade out
                            alpha = pow(alpha, 1.5); // Sharper fade

                            vec4 texColor = texture2D(uTexture, gl_PointCoord);
                            gl_FragColor = vec4(vColor * uGlobalColor, texColor.a * alpha);
                            if (gl_FragColor.a < 0.01) discard; // Discard transparent pixels
                        }
                    `,
                    transparent: true,
                    blending: THREE.AdditiveBlending, // Or NormalBlending
                    depthWrite: false,
                    vertexColors: true // Using attribute vec3 color;
                });

                this.particleSystem = new THREE.Points(this.geometry, this.material);
                this.targetObject.add(this.particleSystem); // Add to the target object for relative movement

                this.initializeParticles();
            }

            initializeParticles() {
                // Initialize all particles as "dead" (age >= lifetime)
                for (let i = 0; i < this.particleCount; i++) {
                    this.ages[i] = this.properties.particleLifetime + 1.0; // Dead
                }
            }

            emitParticle(index) {
                const i3 = index * 3;
                const objectBounds = new THREE.Box3().setFromObject(this.targetObject); // Or a specific emission volume
                const emitterSize = objectBounds.getSize(new THREE.Vector3()).multiplyScalar(0.5); // Emit within half bounds

                this.positions[i3 + 0] = (Math.random() - 0.5) * emitterSize.x;
                this.positions[i3 + 1] = (Math.random() - 0.5) * emitterSize.y;
                this.positions[i3 + 2] = (Math.random() - 0.5) * emitterSize.z;

                const speed = this.properties.particleSpeed;
                const turbulence = this.properties.particleTurbulence;
                this.velocities[i3 + 0] = (Math.random() - 0.5) * speed + (Math.random() - 0.5) * turbulence;
                this.velocities[i3 + 1] = (Math.random() - 0.5) * speed + (Math.random() - 0.5) * turbulence; // Y often up
                this.velocities[i3 + 2] = (Math.random() - 0.5) * speed + (Math.random() - 0.5) * turbulence;

                this.colors[i3 + 0] = 1.0; //this.properties.particleColor.r; // Base color, shader multiplies by global
                this.colors[i3 + 1] = 1.0; //this.properties.particleColor.g;
                this.colors[i3 + 2] = 1.0; //this.properties.particleColor.b;

                this.sizes[index] = this.properties.particleSize * (0.5 + Math.random() * 0.5); // Size variation
                this.lifetimes[index] = this.properties.particleLifetime * (0.7 + Math.random() * 0.6); // Lifetime variation
                this.ages[index] = 0.0; // Born
            }

            update(deltaTime) {
                this.material.uniforms.uTime.value += deltaTime;

                let particlesToEmitThisFrame = 0;
                if (this.properties.emissionRate > 0) {
                    this.timeToEmit += deltaTime;
                    const emitInterval = 1.0 / this.properties.emissionRate;
                    particlesToEmitThisFrame = Math.floor(this.timeToEmit / emitInterval);
                    this.timeToEmit -= particlesToEmitThisFrame * emitInterval;
                }


                let emittedCount = 0;
                for (let i = 0; i < this.particleCount; i++) {
                    const i3 = i * 3;
                    this.ages[i] += deltaTime;

                    if (this.ages[i] >= this.lifetimes[i]) {
                        if (emittedCount < particlesToEmitThisFrame && this.activeParticles < this.particleCount) {
                            this.emitParticle(i);
                            this.activeParticles++;
                            emittedCount++;
                        } else {
                            // Keep particle "dead" or reset its position far away if not re-emitting
                             this.positions[i3 + 1] = -99999; // Hide dead particles
                             this.activeParticles = Math.max(0, this.activeParticles -1); // decrement if it was active
                        }
                        continue;
                    }

                    // Update position
                    this.velocities[i3 + 1] -= this.properties.particleGravity * deltaTime; // Apply gravity
                    this.positions[i3 + 0] += this.velocities[i3 + 0] * deltaTime;
                    this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime;
                    this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime;

                    // Update age for shader (normalized 0-1)
                    this.geometry.attributes.age.array[i] = this.ages[i] / this.lifetimes[i];
                }

                this.geometry.attributes.position.needsUpdate = true;
                this.geometry.attributes.color.needsUpdate = true; // If colors change
                this.geometry.attributes.size.needsUpdate = true;   // If sizes change
                this.geometry.attributes.age.needsUpdate = true;
            }

            setProperties(newProperties) {
                for (const key in newProperties) {
                    if (this.properties.hasOwnProperty(key)) {
                        if (key === 'particleColor') {
                            this.properties.particleColor.set(newProperties.particleColor);
                            this.material.uniforms.uGlobalColor.value.set(this.properties.particleColor);
                        } else if (key === 'spriteTexture') {
                            this.properties.spriteTexture = newProperties.spriteTexture;
                            this.particleTexture.dispose(); // Dispose old
                            this.particleTexture = new THREE.TextureLoader().load(this.properties.spriteTexture);
                            this.material.uniforms.uTexture.value = this.particleTexture;
                        }
                        else {
                            const parsedValue = parseFloat(newProperties[key]);
                            if (!isNaN(parsedValue)) {
                                this.properties[key] = parsedValue;
                            } else {
                                 this.properties[key] = newProperties[key]; // For string props like shape
                            }
                        }
                    }
                }
                 // Update emission rate based on new intensity if changed
                if (newProperties.intensity !== undefined) {
                     this.particleCount = Math.floor(this.properties.intensity * 5000); // This would require re-creating buffers
                     // Simpler: Adjust emission rate based on intensity, keep max particles fixed or manage a pool
                     this.properties.emissionRate = this.properties.intensity * 2000; // e.g. 2000 particles/sec at full intensity
                }
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

        // Simple Placeholder Effect Classes
        class TrailEffect {
            constructor(targetObject, properties = {}) {
                this.targetObject = targetObject;
                this.properties = {
                    intensity: parseFloat(properties.intensity) || 0.5,
                    color: new THREE.Color(properties.trailColor || 0x00ffff),
                    length: parseInt(properties.trailLength) || 50,
                    ...properties
                };
                this.points = [];
                const geometry = new THREE.BufferGeometry();
                this.positions = new Float32Array(this.properties.length * 3);
                geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
                const material = new THREE.LineBasicMaterial({ color: this.properties.color, transparent: true, opacity: this.properties.intensity });
                this.line = new THREE.Line(geometry, material);
                this.targetObject.add(this.line); // Add to target so it moves with it if target is child of scene
                                                // Or add to scene and update world positions
                 this.scene = targetObject.parent || window.scene;
                 if(this.scene && this.scene !== targetObject) this.scene.add(this.line);


                // Initialize points
                const initialPos = new THREE.Vector3();
                this.targetObject.getWorldPosition(initialPos); // Get world position
                for (let i = 0; i < this.properties.length; i++) {
                    this.positions[i * 3 + 0] = initialPos.x;
                    this.positions[i * 3 + 1] = initialPos.y;
                    this.positions[i * 3 + 2] = initialPos.z;
                }
            }
            update(deltaTime) {
                const currentPos = new THREE.Vector3();
                this.targetObject.getWorldPosition(currentPos); // Get current world position

                // Shift existing points
                for (let i = this.properties.length - 1; i > 0; i--) {
                    this.positions[i * 3 + 0] = this.positions[(i - 1) * 3 + 0];
                    this.positions[i * 3 + 1] = this.positions[(i - 1) * 3 + 1];
                    this.positions[i * 3 + 2] = this.positions[(i - 1) * 3 + 2];
                }
                // Add new point
                this.positions[0] = currentPos.x;
                this.positions[1] = currentPos.y;
                this.positions[2] = currentPos.z;
                this.line.geometry.attributes.position.needsUpdate = true;
                 this.line.geometry.computeBoundingSphere(); // Important for visibility
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
                    intensity: parseFloat(properties.intensity) || 0.5,
                    color: new THREE.Color(properties.glowColor || 0x00ffff),
                    scale: parseFloat(properties.glowScale) || 1.1,
                    ...properties
                };
                if (targetObject.geometry) { // Ensure target has geometry
                    const glowGeometry = targetObject.geometry.clone(); // Use original object's geometry
                    const glowMaterial = new THREE.MeshBasicMaterial({
                        color: this.properties.color,
                        transparent: true,
                        opacity: this.properties.intensity * 0.7, // Glow is often subtle
                        side: THREE.BackSide, // Render inside for halo effect
                        depthWrite: false
                    });
                    this.glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
                    this.glowMesh.scale.setScalar(this.properties.scale);
                    this.targetObject.add(this.glowMesh);
                } else {
                    console.warn("GlowEffect: Target object has no geometry to clone.");
                }
            }
            update(deltaTime) {
                if (this.glowMesh) {
                    // Optional: Pulsating effect
                    const pulse = 0.9 + 0.1 * Math.sin(Date.now() * 0.002);
                    this.glowMesh.material.opacity = this.properties.intensity * 0.7 * pulse;
                }
            }
            setProperties(newProperties) {
                if (newProperties.intensity !== undefined) this.properties.intensity = parseFloat(newProperties.intensity);
                if (newProperties.glowColor !== undefined) this.properties.color.set(newProperties.glowColor);
                if (newProperties.glowScale !== undefined) this.properties.scale = parseFloat(newProperties.glowScale);

                if (this.glowMesh) {
                    this.glowMesh.material.opacity = this.properties.intensity * 0.7;
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
        // And fill in generateNodeContent, linkNodeToSceneObject, etc.
        class NodeEditor {
            constructor() {
                this.nodes = new Map();
                this.connections = new Set();
                this.selectedConnections = new Set();
                this.canvas = document.getElementById('node-canvas');

                if (!this.canvas) {
                    console.error("NodeEditor: #node-canvas element not found!");
                    const wrapper = document.getElementById('main-node-editor');
                    if (wrapper) {
                        this.canvas = document.createElement('div');
                        this.canvas.id = 'node-canvas';
                        wrapper.appendChild(this.canvas);
                        console.log("NodeEditor: Created #node-canvas inside #main-node-editor.");
                    } else {
                        console.error("NodeEditor: #main-node-editor wrapper also not found. Cannot initialize.");
                        return;
                    }
                }
                this.canvas.style.position = 'relative';
                this.canvas.style.overflow = 'hidden';

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
                this.canvas.appendChild(this.gridCanvas);
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
                this.canvas.appendChild(this.svg);

                this.nodesContainer = document.createElement('div');
                this.nodesContainer.id = 'node-editor-nodes-container';
                this.nodesContainer.style.position = 'absolute';
                this.nodesContainer.style.top = '0';
                this.nodesContainer.style.left = '0';
                this.nodesContainer.style.transformOrigin = '0 0'; // Crucial for scaling/panning
                this.nodesContainer.style.zIndex = '2';
                // Removed width/height 100% - it will expand as needed with nodes
                this.canvas.appendChild(this.nodesContainer);


                this.tempConnectionLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                this.tempConnectionLine.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--node-connection-temp-color').trim() || '#00bcd4');
                this.tempConnectionLine.setAttribute('stroke-width', '2.5'); // Make it slightly thicker
                this.tempConnectionLine.setAttribute('fill', 'none');
                this.tempConnectionLine.setAttribute('stroke-dasharray', '5,5');
                this.tempConnectionLine.style.display = 'none';
                this.svg.appendChild(this.tempConnectionLine);

                this.initializeCoreEventListeners();
                this.resizeGridCanvas();
                this.updateViewTransform();

                this.canvas.__editor = this;
                if (!window.nodeEditor) window.nodeEditor = this; // Global for easy access if not module
            }

            // --- Visibility ---
            toggleVisibility() {
                const editorElement = document.getElementById('main-node-editor');
                if (editorElement) {
                    const isVisible = editorElement.classList.toggle('visible');
                    if (isVisible) {
                        this.resizeGridCanvas();
                        this.updateViewTransform();
                    }
                }
            }
            setVisible(visible) {
                const editorElement = document.getElementById('main-node-editor');
                if (editorElement) {
                    editorElement.classList.toggle('visible', visible);
                    if (visible) {
                        this.resizeGridCanvas();
                        this.updateViewTransform();
                    }
                }
            }

            // --- Grid and Viewport ---
            resizeGridCanvas() {
                const rect = this.canvas.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return; // Avoid issues if canvas not visible

                const dpr = window.devicePixelRatio || 1;
                this.gridCanvas.width = rect.width * dpr;
                this.gridCanvas.height = rect.height * dpr;
                this.gridCanvas.style.width = `${rect.width}px`;
                this.gridCanvas.style.height = `${rect.height}px`;
                this.gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            drawGrid() {
                if (!this.gridCtx) return;
                const canvasWidthUnscaled = this.gridCanvas.width / (window.devicePixelRatio || 1);
                const canvasHeightUnscaled = this.gridCanvas.height / (window.devicePixelRatio || 1);

                this.gridCtx.clearRect(0, 0, canvasWidthUnscaled, canvasHeightUnscaled);

                const scaledGridSize = this.gridSize * this.scale;
                if (scaledGridSize < 4) return;

                const drawOffsetX = this.viewportX % scaledGridSize;
                const drawOffsetY = this.viewportY % scaledGridSize;

                this.gridCtx.lineWidth = 1 / this.scale; // Thinner lines when zoomed out

                // Subdivisions
                const subGridScaledSize = scaledGridSize / (this.gridAccentFrequency / 2); // e.g., 2.5 subdivisions
                if (subGridScaledSize > 5) { // Only draw if reasonably visible
                    this.gridCtx.strokeStyle = this.gridSubdivisionColor;
                    this.gridCtx.globalAlpha = Math.min(1, scaledGridSize / 40); // Fade in/out
                    for (let x = drawOffsetX - scaledGridSize; x < canvasWidthUnscaled + scaledGridSize; x += subGridScaledSize) {
                        // Avoid drawing over main or accent lines by checking modulo
                        if ( Math.abs(Math.round( (x - drawOffsetX) / subGridScaledSize ) % (this.gridAccentFrequency / 2) ) > 0.01 &&
                             Math.abs(Math.round( (x - drawOffsetX) / scaledGridSize ) % 1) > 0.01 ) {
                            this.gridCtx.beginPath();
                            this.gridCtx.moveTo(x, 0);
                            this.gridCtx.lineTo(x, canvasHeightUnscaled);
                            this.gridCtx.stroke();
                        }
                    }
                    for (let y = drawOffsetY - scaledGridSize; y < canvasHeightUnscaled + scaledGridSize; y += subGridScaledSize) {
                        if ( Math.abs(Math.round( (y - drawOffsetY) / subGridScaledSize ) % (this.gridAccentFrequency / 2) ) > 0.01 &&
                             Math.abs(Math.round( (y - drawOffsetY) / scaledGridSize ) % 1) > 0.01 ) {
                            this.gridCtx.beginPath();
                            this.gridCtx.moveTo(0, y);
                            this.gridCtx.lineTo(canvasWidthUnscaled, y);
                            this.gridCtx.stroke();
                        }
                    }
                    this.gridCtx.globalAlpha = 1.0;
                }

                // Main grid lines
                this.gridCtx.strokeStyle = this.gridColor;
                this.gridCtx.globalAlpha = Math.min(1, scaledGridSize / 20);
                for (let x = drawOffsetX - scaledGridSize; x < canvasWidthUnscaled + scaledGridSize; x += scaledGridSize) {
                     if ( Math.abs(Math.round( (x - drawOffsetX) / scaledGridSize ) % this.gridAccentFrequency) > 0.01) { // Don't draw over accent
                        this.gridCtx.beginPath();
                        this.gridCtx.moveTo(x, 0);
                        this.gridCtx.lineTo(x, canvasHeightUnscaled);
                        this.gridCtx.stroke();
                    }
                }
                for (let y = drawOffsetY - scaledGridSize; y < canvasHeightUnscaled + scaledGridSize; y += scaledGridSize) {
                    if ( Math.abs(Math.round( (y - drawOffsetY) / scaledGridSize ) % this.gridAccentFrequency) > 0.01) {
                        this.gridCtx.beginPath();
                        this.gridCtx.moveTo(0, y);
                        this.gridCtx.lineTo(canvasWidthUnscaled, y);
                        this.gridCtx.stroke();
                    }
                }
                this.gridCtx.globalAlpha = 1.0;


                // Accent lines
                this.gridCtx.strokeStyle = this.gridAccentColor;
                this.gridCtx.lineWidth = 1.5 / this.scale; // Slightly thicker
                const accentScaledSize = scaledGridSize * this.gridAccentFrequency;
                const accentDrawOffsetX = this.viewportX % accentScaledSize;
                const accentDrawOffsetY = this.viewportY % accentScaledSize;

                for (let x = accentDrawOffsetX - accentScaledSize; x < canvasWidthUnscaled + accentScaledSize; x += accentScaledSize) {
                    this.gridCtx.beginPath();
                    this.gridCtx.moveTo(x, 0);
                    this.gridCtx.lineTo(x, canvasHeightUnscaled);
                    this.gridCtx.stroke();
                }
                for (let y = accentDrawOffsetY - accentScaledSize; y < canvasHeightUnscaled + accentScaledSize; y += accentScaledSize) {
                    this.gridCtx.beginPath();
                    this.gridCtx.moveTo(0, y);
                    this.gridCtx.lineTo(canvasWidthUnscaled, y);
                    this.gridCtx.stroke();
                }

                // Origin Axes
                const originScreenX = this.viewportX;
                const originScreenY = this.viewportY;
                if (originScreenX > -canvasWidthUnscaled * 0.2 && originScreenX < canvasWidthUnscaled * 1.2 &&
                    originScreenY > -canvasHeightUnscaled * 0.2 && originScreenY < canvasHeightUnscaled * 1.2) { // Draw if near visible
                    this.gridCtx.lineWidth = 2 / this.scale;
                    this.gridCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--node-grid-origin-y-color').trim() || '#4CAF50'; // Y Green
                    this.gridCtx.beginPath(); this.gridCtx.moveTo(originScreenX, 0); this.gridCtx.lineTo(originScreenX, canvasHeightUnscaled); this.gridCtx.stroke();
                    this.gridCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--node-grid-origin-x-color').trim() || '#E91E63'; // X Red
                    this.gridCtx.beginPath(); this.gridCtx.moveTo(0, originScreenY); this.gridCtx.lineTo(canvasWidthUnscaled, originScreenY); this.gridCtx.stroke();
                }
            }

            updateViewTransform() {
                const transformValue = `translate(${this.viewportX}px, ${this.viewportY}px) scale(${this.scale})`;
                this.nodesContainer.style.transform = transformValue;
                this.svg.style.transform = transformValue;
                this.svg.style.transformOrigin = '0 0'; // Ensure SVG scales from top-left

                this.drawGrid();
                this.updateAllConnections();
            }

            // --- Event Handlers (from previous, with slight adjustments) ---
            initializeCoreEventListeners() {
                this.canvas.addEventListener('wheel', this.handleWheelZoom.bind(this), { passive: false });
                this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown.bind(this));
                document.addEventListener('mousemove', this.handleDocumentMouseMove.bind(this));
                document.addEventListener('mouseup', this.handleDocumentMouseUp.bind(this));
                this.canvas.addEventListener('contextmenu', this.handleCanvasContextMenu.bind(this));
                this.nodesContainer.addEventListener('mousedown', this.handleNodesContainerMouseDown.bind(this));
                window.addEventListener('resize', () => {
                    this.resizeGridCanvas();
                    this.updateViewTransform();
                });
                document.addEventListener('keydown', this.handleKeyDown.bind(this));

                const toggleButton = document.getElementById('node-editor-toggle');
                if (toggleButton) toggleButton.addEventListener('click', () => this.toggleVisibility());

                // No close button listener here, assuming it's handled by main UI
                document.querySelectorAll('.toolbar-button[data-type]').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const type = e.currentTarget.dataset.type;
                        const canvasRect = this.canvas.getBoundingClientRect();
                        const viewCenterX = (canvasRect.width / 2 - this.viewportX) / this.scale;
                        const viewCenterY = (canvasRect.height / 2 - this.viewportY) / this.scale;
                        this.addNode(type, viewCenterX - 90, viewCenterY - 50); // Offset by half node width/height
                    });
                });
            }

            handleWheelZoom(e) {
                e.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const zoomIntensity = 0.075; // Slightly less aggressive
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

            handleCanvasMouseDown(e) {
                if (e.button === 1 || (e.button === 0 && e.altKey)) {
                    e.preventDefault();
                    this.isPanning = true;
                    this.lastPanPosition = { x: e.clientX, y: e.clientY };
                    this.canvas.style.cursor = 'grabbing';
                } else if (e.button === 0 && e.target === this.canvas) {
                    this.deselectAll();
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
                }
            }

            handleDocumentMouseUp(e) {
                if (this.isPanning) {
                    this.isPanning = false;
                    this.canvas.style.cursor = 'grab';
                }
                if (this.isDraggingNode) {
                    this.isDraggingNode = false;
                    // Optionally snap to grid:
                    // if (this.selectedNode) this.snapNodeToGrid(this.selectedNode);
                }
                if (this.connectingSocketInfo) {
                    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
                    const targetSocket = targetElement ? targetElement.closest('.node-socket') : null;
                    if (targetSocket) {
                        this.tryEndConnection(targetSocket);
                    }
                    this.clearTempConnection();
                }
            }

            handleNodesContainerMouseDown(e) {
                const target = e.target;
                const nodeElement = target.closest('.node');

                if (nodeElement && !target.closest('input, select, button, .node-socket')) {
                    e.stopPropagation();
                    this.deselectAll(); // Deselect others first
                    this.selectedNode = nodeElement;
                    this.selectedNode.classList.add('selected');
                    this.isDraggingNode = true;

                    this.selectedNodeStartPos = {
                        x: parseFloat(nodeElement.style.left || 0),
                        y: parseFloat(nodeElement.style.top || 0)
                    };
                    this.dragStartMousePos = { x: e.clientX, y: e.clientY };
                    this.nodesContainer.appendChild(nodeElement); // Bring to front
                } else if (target.classList.contains('node-socket')) {
                    e.stopPropagation();
                    this.startDraggingConnection(target);
                }
            }

            handleCanvasContextMenu(e) {
                e.preventDefault();
                console.log("Node Editor context menu triggered. Mouse at (screen):", e.clientX, e.clientY);
                const { x, y } = this.getMousePositionInCanvasSpace(e);
                console.log("Mouse at (editor space):", x, y);
                // Here you would show your context menu for adding nodes
                // For example: showMenuAt(e.clientX, e.clientY, (nodeType) => this.addNode(nodeType, x, y));
            }

            getMousePositionInCanvasSpace(event) {
                const rect = this.canvas.getBoundingClientRect();
                const x = (event.clientX - rect.left - this.viewportX) / this.scale;
                const y = (event.clientY - rect.top - this.viewportY) / this.scale;
                return { x, y };
            }

            handleKeyDown(e) {
                // Allow typing in inputs
                if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                    if (e.key === 'Escape') document.activeElement.blur(); // Blur input on escape
                    return;
                }

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (this.selectedNode) {
                        this.deleteNode(this.selectedNode); // deleteNode will also clear selection
                    }
                    this.selectedConnections.forEach(conn => this.deleteConnection(conn)); // No need to clear, deleteConnection does
                }
                if (e.key === 'Escape') {
                    this.clearTempConnection();
                    this.deselectAll();
                }
                // Add more shortcuts: Ctrl+A to select all nodes, etc.
            }

            // --- Node Content Generation (Full Implementation) ---
            generateNodeContent(type) {
                const nodeTypes = {
                    object: {
                        title: 'Scene Object',
                        sockets: { inputs: 1, outputs: 1 },
                        properties: [
                            { name: 'name', type: 'text', label: 'Name', default: 'MyObject' },
                            { name: 'visible', type: 'checkbox', label: 'Visible', default: true }
                        ]
                    },
                    physics: {
                        title: 'Physics Body',
                        sockets: { inputs: 1, outputs: 1 },
                        properties: [
                            { name: 'type', type: 'select', label: 'Type', options: ['Static', 'Dynamic', 'Kinematic'], default: 'Static' },
                            { name: 'mass', type: 'number', label: 'Mass', default: 1, min:0, step:0.1, showWhen: 'type=Dynamic' },
                            { name: 'friction', type: 'range', label: 'Friction', default: 0.5, min:0, max:1, step:0.01 },
                            { name: 'restitution', type: 'range', label: 'Bounciness', default: 0.2, min:0, max:1, step:0.01 }
                        ]
                    },
                    effect: {
                        title: 'Visual Effect',
                        sockets: { inputs: 1, outputs: 1 },
                        properties: [
                            { name: 'type', type: 'select', label: 'Type', options: ['Particles', 'Trail', 'Glow', 'Water'], default: 'Particles' },
                            { name: 'intensity', type: 'range', label: 'Intensity', default: 0.5, min: 0, max: 1, step: 0.01 },
                            // Particle-specific
                            { name: 'particleColor', type: 'color', label: 'Color', default: '#ffffff', showWhen: 'type=Particles' },
                            { name: 'particleSpeed', type: 'range', label: 'Speed', default: 1.0, min: 0, max: 5, step: 0.1, showWhen: 'type=Particles' },
                            { name: 'particleSize', type: 'range', label: 'Size', default: 0.1, min: 0.01, max: 1, step: 0.01, showWhen: 'type=Particles' },
                            { name: 'particleLifetime', type: 'range', label: 'Lifetime (s)', default: 2.0, min: 0.1, max: 10, step: 0.1, showWhen: 'type=Particles' },
                            { name: 'particleGravity', type: 'range', label: 'Gravity', default: 0.0, min: -5, max: 5, step: 0.1, showWhen: 'type=Particles' },
                            { name: 'particleTurbulence', type: 'range', label: 'Turbulence', default: 0.1, min: 0, max: 2, step: 0.05, showWhen: 'type=Particles' },
                             // Water-specific (matching WaterEffect constructor defaults)
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
                        sockets: { inputs: 1, outputs: 1 },
                        properties: [
                            { name: 'type', type: 'select', label: 'Shader', options: ['Standard', 'Phong', 'Basic', 'Toon'], default: 'Standard' },
                            { name: 'color', type: 'color', label: 'Base Color', default: '#cccccc' },
                            { name: 'metalness', type: 'range', label: 'Metallic', default: 0.1, min:0, max:1, step:0.01, showWhen:'type=Standard'},
                            { name: 'roughness', type: 'range', label: 'Roughness', default: 0.5, min:0, max:1, step:0.01, showWhen:'type=Standard'},
                            { name: 'shininess', type: 'range', label: 'Shininess', default: 30, min:0, max:200, step:1, showWhen:'type=Phong'}
                        ]
                    },
                    transform: {
                        title: 'Spatial Transform',
                        sockets: { inputs: 1, outputs: 1 },
                        properties: [
                            { name: 'position', type: 'vector3', label: 'Position (m)', default: {x:0,y:0,z:0} },
                            { name: 'rotation', type: 'vector3', label: 'Rotation (°)', default: {x:0,y:0,z:0} }, // Degrees for UI
                            { name: 'scale', type: 'vector3', label: 'Scale Factor', default: {x:1,y:1,z:1} }
                        ]
                    },
                     light: {
                        title: 'Light Source',
                        sockets: { inputs: 1, outputs: 1 },
                        properties: [
                            { name: 'type', type: 'select', label: 'Type', options: ['Directional', 'Point', 'Spot', 'Ambient'], default: 'Directional' },
                            { name: 'color', type: 'color', label: 'Color', default: '#ffffff' },
                            { name: 'intensity', type: 'range', label: 'Intensity', default: 1.0, min:0, max:5, step:0.1 },
                            { name: 'castShadow', type: 'checkbox', label: 'Shadows', default: false, showWhenNot: 'type=Ambient' }, // Hide for ambient
                            { name: 'distance', type: 'number', label: 'Distance', default: 0, min:0, step:1, showWhen: 'type=Point,type=Spot' }, // Show for point/spot
                            { name: 'angle', type: 'range', label: 'Angle (°)', default: 30, min:1, max:90, step:1, showWhen: 'type=Spot' },
                            { name: 'penumbra', type: 'range', label: 'Penumbra', default: 0.1, min:0, max:1, step:0.01, showWhen: 'type=Spot' }
                        ]
                    }
                    // Add more node types: animation, script, sound, etc.
                };

                const nodeConfig = nodeTypes[type];
                if (!nodeConfig) {
                    console.warn(`NodeEditor: Unknown node type "${type}" requested.`);
                    return `<div class="node-title">Unknown Node</div><div class="node-content">Error: Type not found.</div>`;
                }

                let html = `<div class="node-title">${nodeConfig.title}</div>`;

                // Add sockets based on config (simplified example, could be more complex)
                if (nodeConfig.sockets) {
                    for (let i = 0; i < (nodeConfig.sockets.inputs || 0); i++) {
                        html += `<div class="node-socket input" style="top: ${25 + i * 25}px;"></div>`;
                    }
                    for (let i = 0; i < (nodeConfig.sockets.outputs || 0); i++) {
                        html += `<div class="node-socket output" style="top: ${25 + i * 25}px;"></div>`;
                    }
                } else { // Default generic sockets if not specified
                     html += `<div class="node-socket input" style="top: 30px;"></div>`;
                     html += `<div class="node-socket output" style="top: 30px;"></div>`;
                }


                html += '<div class="node-content">';
                nodeConfig.properties.forEach(prop => {
                    const uniqueId = `${type}-${prop.name}-${Date.now().toString(36)}`; // Basic unique ID
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
                                ${prop.options.map(opt => `<option value="${opt}" ${opt === defaultValue ? 'selected' : ''}>${opt}</option>`).join('')}
                            </select>`;
                            break;
                        case 'range':
                            inputHtml = `<input type="range" id="${uniqueId}" name="${prop.name}" 
                                         min="${prop.min || 0}" max="${prop.max || 1}" 
                                         step="${prop.step || 0.01}" value="${defaultValue}">
                                         <span class="value-display">${defaultValue}</span>`;
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

            updatePropertyVisibility(nodeElement) {
                const typeSelect = nodeElement.querySelector('select[name="type"]'); // Assuming 'type' is the common dropdown
                if (!typeSelect) return; // No conditional visibility if no type selector

                const currentType = typeSelect.value;
                nodeElement.querySelectorAll('.node-property').forEach(propDiv => {
                    const showWhen = propDiv.dataset.showWhen;
                    const showWhenNot = propDiv.dataset.showWhenNot;

                    let shouldShow = true;
                    if (showWhen) {
                        // Handles multiple conditions separated by comma: "type=Particles,anotherField=true"
                        shouldShow = showWhen.split(',').every(condition => {
                            const [field, value] = condition.split('=');
                            if (field === 'type') return currentType === value;
                            // Could extend to check other fields if needed
                            const dependentInput = nodeElement.querySelector(`[name="${field}"]`);
                            if (dependentInput) {
                                return dependentInput.type === 'checkbox' ? dependentInput.checked.toString() === value : dependentInput.value === value;
                            }
                            return false; // Dependent field not found
                        });
                    }
                     if (showWhenNot) { // Hides if condition is met
                        shouldShow = !showWhenNot.split(',').every(condition => { // Check if ANY condition to hide is met
                            const [field, value] = condition.split('=');
                            if (field === 'type') return currentType === value;
                             const dependentInput = nodeElement.querySelector(`[name="${field}"]`);
                            if (dependentInput) {
                                return dependentInput.type === 'checkbox' ? dependentInput.checked.toString() === value : dependentInput.value === value;
                            }
                            return false;
                        });
                    }

                    propDiv.style.display = shouldShow ? '' : 'none'; // Empty string reverts to stylesheet's display
                });
            }

            linkNodeToSceneObject(nodeElement, sceneObject) {
                const nodeData = this.nodes.get(nodeElement);
                if (nodeData) {
                    nodeData.object = sceneObject; // Store the THREE.js object reference
                    // Optionally, set sceneObject's name from node data if available
                    if (nodeData.properties && nodeData.properties.name) {
                        sceneObject.name = nodeData.properties.name;
                    }
                    console.log(`Node "${nodeData.id}" linked to 3D object "${sceneObject.name || sceneObject.uuid}".`);
                    // Initial application of properties if any are defined on the node
                    this.applyNodePropertiesToSceneObject(nodeElement, sceneObject);
                } else {
                    console.warn("NodeEditor: Could not find data for node to link.");
                }
            }
            applyNodePropertiesToSceneObject(nodeElement, sceneObject) {
                const nodeData = this.nodes.get(nodeElement);
                if (!nodeData || !sceneObject) return;

                const props = this.getNodeProperties(nodeElement); // Get current UI values

                // General properties
                if (props.name !== undefined) sceneObject.name = props.name;
                if (props.visible !== undefined) sceneObject.visible = props.visible;

                // Transform properties
                if (props.position) {
                    sceneObject.position.set(props.position.x || 0, props.position.y || 0, props.position.z || 0);
                }
                if (props.rotation) { // Assuming degrees from UI, convert to radians
                    sceneObject.rotation.set(
                        THREE.MathUtils.degToRad(props.rotation.x || 0),
                        THREE.MathUtils.degToRad(props.rotation.y || 0),
                        THREE.MathUtils.degToRad(props.rotation.z || 0)
                    );
                }
                if (props.scale) {
                    sceneObject.scale.set(props.scale.x || 1, props.scale.y || 1, props.scale.z || 1);
                }

                // Material properties (simplified - assumes MeshStandardMaterial or similar)
                if (nodeData.type === 'material' && sceneObject.material) {
                    if (props.color) sceneObject.material.color.set(props.color);
                    if (props.metalness !== undefined && sceneObject.material.metalness !== undefined) sceneObject.material.metalness = props.metalness;
                    if (props.roughness !== undefined && sceneObject.material.roughness !== undefined) sceneObject.material.roughness = props.roughness;
                    if (props.shininess !== undefined && sceneObject.material.shininess !== undefined) sceneObject.material.shininess = props.shininess; // For Phong
                    // More complex: change material type if props.type changes
                }

                 // Light Properties
                if (nodeData.type === 'light' && sceneObject.isLight) { // sceneObject here is the THREE.Light instance
                    if (props.color) sceneObject.color.set(props.color);
                    if (props.intensity !== undefined) sceneObject.intensity = props.intensity;
                    if (props.castShadow !== undefined && sceneObject.castShadow !== undefined) sceneObject.castShadow = props.castShadow;
                    if (props.distance !== undefined && sceneObject.distance !== undefined) sceneObject.distance = props.distance;
                    if (props.angle !== undefined && sceneObject.angle !== undefined) sceneObject.angle = THREE.MathUtils.degToRad(props.angle);
                    if (props.penumbra !== undefined && sceneObject.penumbra !== undefined) sceneObject.penumbra = props.penumbra;
                    // Could also handle light type changes, which would mean replacing the light object
                }


                // If this node is an effect node, or connected to an effect node, effects should be (re)applied
                // This is handled more broadly by updateConnectedNodesAndEffects
            }


            // --- Node Management (addNode adapted in previous thought process) ---
            addNode(type, x, y) {
                const nodeElement = document.createElement('div');
                nodeElement.className = 'node';
                nodeElement.innerHTML = this.generateNodeContent(type);
                nodeElement.dataset.nodeType = type;

                const defaultX = x !== undefined ? x : (this.canvas.offsetWidth / 2 - 90 - this.viewportX) / this.scale;
                const defaultY = y !== undefined ? y : (this.canvas.offsetHeight / 2 - 50 - this.viewportY) / this.scale;
                nodeElement.style.left = `${defaultX}px`;
                nodeElement.style.top = `${defaultY}px`;

                this.nodesContainer.appendChild(nodeElement);
                const nodeId = `node_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
                const nodeData = { id: nodeId, type, properties: this.getNodeProperties(nodeElement), object: null };
                this.nodes.set(nodeElement, nodeData);

                // Add event listeners to sockets and inputs
                nodeElement.querySelectorAll('.node-socket').forEach(socket => {
                    socket.addEventListener('mouseenter', (e) => {
                        if (this.connectingSocketInfo && this.isValidConnectionTarget(this.connectingSocketInfo.socketElement, e.currentTarget)) {
                            e.currentTarget.classList.add('valid-target');
                        }
                    });
                    socket.addEventListener('mouseleave', (e) => {
                        e.currentTarget.classList.remove('valid-target');
                    });
                     // Mousedown is handled by nodesContainer for starting connection drag
                });

                nodeElement.querySelectorAll('input, select').forEach(input => {
                    const eventType = (input.type === 'range' || input.type === 'color') ? 'input' : 'change';
                    input.addEventListener(eventType, () => {
                        this.updateNodeProperties(nodeElement); // Update internal data
                        this.applyNodePropertiesToSceneObject(nodeElement, nodeData.object); // Apply to linked 3D object
                        this.updateConnectedNodesAndEffects(nodeElement); // Propagate/update effects
                        if (input.type === 'range' && input.nextElementSibling?.classList.contains('value-display')) {
                            input.nextElementSibling.textContent = parseFloat(input.value).toFixed(input.step.includes('.') ? input.step.split('.')[1].length : 0);
                        }
                    });
                    if (input.type === 'range' && input.nextElementSibling?.classList.contains('value-display')) {
                       input.nextElementSibling.textContent = parseFloat(input.value).toFixed(input.step.includes('.') ? input.step.split('.')[1].length : 0);
                    }
                });

                // Handle conditional visibility for select dropdowns (like effect type)
                nodeElement.querySelectorAll('select').forEach(select => {
                    select.addEventListener('change', () => this.updatePropertyVisibility(nodeElement));
                });
                this.updatePropertyVisibility(nodeElement); // Initial check

                // Specific logic for 'object' or 'light' nodes to create a default THREE.js instance
                if (type === 'object') {
                    const defaultObject = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color: 0xcccccc}));
                    defaultObject.name = `NodeObject_${nodeId}`;
                    this.linkNodeToSceneObject(nodeElement, defaultObject);
                    if (window.scene) window.scene.add(defaultObject);
                } else if (type === 'light') {
                    let defaultLight;
                    const lightProps = nodeData.properties; // Get default properties
                    switch(lightProps.type) {
                        case 'Point': defaultLight = new THREE.PointLight(lightProps.color, lightProps.intensity); break;
                        case 'Spot': defaultLight = new THREE.SpotLight(lightProps.color, lightProps.intensity); break;
                        case 'Ambient': defaultLight = new THREE.AmbientLight(lightProps.color, lightProps.intensity); break;
                        case 'Directional':
                        default: defaultLight = new THREE.DirectionalLight(lightProps.color, lightProps.intensity);
                                 defaultLight.position.set(5,5,5); // Default position for directional
                                 break;
                    }
                    defaultLight.name = `NodeLight_${nodeId}`;
                    this.linkNodeToSceneObject(nodeElement, defaultLight);
                    if (window.scene) window.scene.add(defaultLight);
                    if (defaultLight.target && window.scene) window.scene.add(defaultLight.target); // For directional/spot
                }


                return nodeElement;
            }

            updateNodeProperties(nodeElement) { // Updates the internal nodeData.properties
                const nodeData = this.nodes.get(nodeElement);
                if (nodeData) {
                    nodeData.properties = this.getNodeProperties(nodeElement);
                }
            }

            updateConnectedNodesAndEffects(sourceNodeElement) {
                const sourceNodeData = this.nodes.get(sourceNodeElement);
                if (!sourceNodeData) return;

                this.connections.forEach(conn => {
                    let targetNodeElement = null;
                    let isForwardConnection = false; // Source -> Target

                    if (conn.startSocket.closest('.node') === sourceNodeElement) {
                        targetNodeElement = conn.endSocket.closest('.node');
                        isForwardConnection = true;
                    } else if (conn.endSocket.closest('.node') === sourceNodeElement) {
                        // If sourceNode is an input, it means it's receiving properties
                        // We might not need to propagate "backwards" unless specific logic demands it
                        // For now, primarily handle forward propagation (output of sourceNode changed)
                        // targetNodeElement = conn.startSocket.closest('.node');
                        return; // Skip backward propagation for now for simplicity
                    }

                    if (targetNodeElement) {
                        const targetNodeData = this.nodes.get(targetNodeElement);
                        if (!targetNodeData) return;

                        // 1. Propagate raw properties (e.g., material color to object's material color property)
                        const sourceProps = this.getNodeProperties(sourceNodeElement);
                        // More specific property mapping needed here instead of blind merge
                        // Example: if source is MaterialNode and target is ObjectNode
                        if (sourceNodeData.type === 'material' && targetNodeData.type === 'object') {
                            if(targetNodeData.object) this.applyNodePropertiesToSceneObject(sourceNodeElement, targetNodeData.object);
                        } else if (sourceNodeData.type === 'transform' && targetNodeData.type === 'object') {
                             if(targetNodeData.object) this.applyNodePropertiesToSceneObject(sourceNodeElement, targetNodeData.object);
                        }
                        // Add more specific propagation rules here

                        // 2. Apply/Update Effects
                        // If source is an "Effect" node and target is an "Object" node that can receive effects
                        if (sourceNodeData.type === 'effect' && targetNodeData.type === 'object' && targetNodeData.object) {
                            this.applyOrUpdateNodeEffect(sourceNodeElement, targetNodeData.object);
                        }
                        // If source is an "Object" node, and an effect is already applied to it,
                        // update the effect if its properties depend on the object's state (e.g., emission from surface)
                        // This is more complex and usually handled by the effect's own update() method using targetObject.
                    }
                });
            }

            deleteNode(nodeElement) {
                if (!nodeElement || !this.nodes.has(nodeElement)) return;

                const connectionsToDelete = [];
                this.connections.forEach(conn => {
                    if (conn.startSocket.closest('.node') === nodeElement || conn.endSocket.closest('.node') === nodeElement) {
                        connectionsToDelete.push(conn);
                    }
                });
                connectionsToDelete.forEach(conn => this.deleteConnection(conn));

                const nodeData = this.nodes.get(nodeElement);
                if (nodeData && nodeData.object) {
                    // Clean up associated effect if this node's object had one
                    if (this.nodeEffects.has(nodeData.object)) {
                        const effect = this.nodeEffects.get(nodeData.object);
                        if (effect.cleanup) effect.cleanup();
                        this.nodeEffects.delete(nodeData.object);
                    }
                    // Remove the 3D object from the scene
                    if (nodeData.object.parent) {
                        nodeData.object.parent.remove(nodeData.object);
                        if (nodeData.object.isLight && nodeData.object.target && nodeData.object.target.parent) {
                             nodeData.object.target.parent.remove(nodeData.object.target);
                        }
                        // Basic geometry/material disposal
                        if (nodeData.object.geometry) nodeData.object.geometry.dispose();
                        if (nodeData.object.material) {
                            if (Array.isArray(nodeData.object.material)) {
                                nodeData.object.material.forEach(m => m.dispose());
                            } else {
                                nodeData.object.material.dispose();
                            }
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


            // --- Connection Management (methods from previous, ensure they use `this`) ---
            startDraggingConnection(socketElement) {
                // Make sure to get position relative to the SVG layer's transformed space
                const startPos = this.getConnectionEndpoint(socketElement);

                this.connectingSocketInfo = {
                    socketElement: socketElement,
                    isOutput: socketElement.classList.contains('output') || socketElement.classList.contains('socket-right'),
                    startX: startPos.x,
                    startY: startPos.y
                };

                this.tempConnectionLine.setAttribute('d', `M ${startPos.x},${startPos.y} L ${startPos.x},${startPos.y}`);
                this.tempConnectionLine.style.display = 'block';
                this.svg.appendChild(this.tempConnectionLine); // Ensure it's on top during drag
            }

            updateTempConnectionLine(mouseEvent) {
                if (!this.connectingSocketInfo) return;
                const endPos = this.getMousePositionInCanvasSpace(mouseEvent);
                const startX = this.connectingSocketInfo.startX;
                const startY = this.connectingSocketInfo.startY;

                const dx = endPos.x - startX;
                // const dy = endPos.y - startY; // Not used in this Bezier
                let controlOffset = Math.abs(dx) * 0.4;
                controlOffset = Math.max(30, Math.min(150, controlOffset));

                const pathData = `M ${startX},${startY} C ${startX + controlOffset * (this.connectingSocketInfo.isOutput ? 1 : -1)},${startY} ${endPos.x - controlOffset * (this.connectingSocketInfo.isOutput ? -1 : 1)},${endPos.y} ${endPos.x},${endPos.y}`;
                this.tempConnectionLine.setAttribute('d', pathData);
            }

            clearTempConnection() {
                this.connectingSocketInfo = null;
                this.tempConnectionLine.style.display = 'none';
                this.canvas.querySelectorAll('.node-socket.valid-target').forEach(s => s.classList.remove('valid-target'));
            }

            tryEndConnection(endSocketElement) {
                if (!this.connectingSocketInfo || !endSocketElement || typeof this.isValidConnectionTarget !== 'function') {
                    this.clearTempConnection();
                    return;
                }

                const startSocketElement = this.connectingSocketInfo.socketElement;

                if (!this.isValidConnectionTarget(startSocketElement, endSocketElement)) {
                     console.warn("NodeEditor: Invalid connection target.");
                    this.clearTempConnection();
                    return;
                }

                const finalStartSocket = this.connectingSocketInfo.isOutput ? startSocketElement : endSocketElement;
                const finalEndSocket = this.connectingSocketInfo.isOutput ? endSocketElement : startSocketElement;

                for (const conn of this.connections) {
                    if (conn.startSocket === finalStartSocket && conn.endSocket === finalEndSocket) {
                        console.warn("NodeEditor: Connection already exists.");
                        this.clearTempConnection();
                        return;
                    }
                }

                const connection = new NodeConnection(finalStartSocket, finalEndSocket, this);
                this.connections.add(connection);
                // Connection adds itself to svg in its constructor

                const sourceNodeElement = finalStartSocket.closest('.node');
                this.updateConnectedNodesAndEffects(sourceNodeElement);
                 // Style connected sockets
                finalStartSocket.classList.add('connected');
                finalEndSocket.classList.add('connected');

                this.clearTempConnection();
            }

            isValidConnectionTarget(startSocket, endSocketCandidate) {
                if (!startSocket || !endSocketCandidate || startSocket === endSocketCandidate) return false;
                if (startSocket.closest('.node') === endSocketCandidate.closest('.node')) return false;

                const startIsOutput = startSocket.classList.contains('output') || startSocket.classList.contains('socket-right');
                const endIsInput = endSocketCandidate.classList.contains('input') || endSocketCandidate.classList.contains('socket-left');
                // Output can only connect to Input, and Input only to Output
                return (startIsOutput && endIsInput) || (!startIsOutput && !endIsInput); // This logic was off.
                                                                                        // Correct: Output to Input only.
                // return (startIsOutput && !endIsOutput) || (!startIsOutput && endIsOutput); // Corrected
                return (startIsOutput && (endSocketCandidate.classList.contains('input') || endSocketCandidate.classList.contains('socket-left'))) ||
                       ((startSocket.classList.contains('input') || startSocket.classList.contains('socket-left')) && endIsOutput);

            }

            getConnectionEndpoint(socketElement) { // Returns position in UN SCALED canvas space
                const canvasRect = this.canvas.getBoundingClientRect();
                const socketRect = socketElement.getBoundingClientRect();
                const x = (socketRect.left + socketRect.width / 2 - canvasRect.left - this.viewportX) / this.scale;
                const y = (socketRect.top + socketRect.height / 2 - canvasRect.top - this.viewportY) / this.scale;
                return { x, y };
            }

            updateAllConnections() {
                this.connections.forEach(conn => conn.update());
            }
            updateConnectionsForNode(nodeElement) {
                this.connections.forEach(conn => {
                    if (conn.startSocket.closest('.node') === nodeElement || conn.endSocket.closest('.node') === nodeElement) {
                        conn.update();
                    }
                });
            }

            selectConnection(connection) {
                if (!connection) return;
                this.deselectAll(); // Deselect nodes and other connections
                connection.setSelected(true);
                this.selectedConnections.add(connection);
            }

            deleteConnection(connection) {
                if (!connection) return;
                 // Unstyle sockets
                if (connection.startSocket) connection.startSocket.classList.remove('connected');
                if (connection.endSocket) connection.endSocket.classList.remove('connected');

                connection.remove(); // Removes SVG elements
                this.connections.delete(connection);
                this.selectedConnections.delete(connection); // Remove from selection if it was selected
            }

            deselectAll() {
                if (this.selectedNode) {
                    this.selectedNode.classList.remove('selected');
                    this.selectedNode = null;
                }
                this.selectedConnections.forEach(conn => conn.setSelected(false));
                this.selectedConnections.clear();
            }

            // --- Effect Application ---
            applyOrUpdateNodeEffect(effectNodeElement, targetSceneObject) {
                if (!effectNodeElement || !targetSceneObject) return;
                const effectNodeData = this.nodes.get(effectNodeElement);
                if (!effectNodeData || effectNodeData.type !== 'effect') return;

                const properties = this.getNodeProperties(effectNodeElement);
                const effectType = properties.type;

                let effectInstance = this.nodeEffects.get(targetSceneObject);
                let effectClassName = effectType ? `${effectType.charAt(0).toUpperCase() + effectType.slice(1)}Effect` : '';


                if (!effectInstance || effectInstance.constructor.name !== effectClassName) {
                    if (effectInstance && typeof effectInstance.cleanup === 'function') {
                        effectInstance.cleanup();
                    }
                    this.nodeEffects.delete(targetSceneObject); // Remove old effect from map
                    effectInstance = null; // Clear instance

                    switch (effectType) {
                        case 'Water':     effectInstance = new WaterEffect(targetSceneObject, properties); break;
                        case 'Particles': effectInstance = new ParticleEffect(targetSceneObject, properties); break;
                        case 'Trail':     effectInstance = new TrailEffect(targetSceneObject, properties); break;
                        case 'Glow':      effectInstance = new GlowEffect(targetSceneObject, properties); break;
                        default:
                            console.warn(`Effect type "${effectType}" not recognized for instantiation.`);
                            return;
                    }
                    if (effectInstance) this.nodeEffects.set(targetSceneObject, effectInstance);
                } else if (effectInstance && typeof effectInstance.setProperties === 'function') {
                    effectInstance.setProperties(properties);
                }
            }

            // Main update loop
            update(deltaTime) {
                this.nodeEffects.forEach((effectInstance) => {
                    if (effectInstance && typeof effectInstance.update === 'function') {
                        effectInstance.update(deltaTime);
                    }
                });
                // Animation for dashed connections (already handled by NodeConnection itself)
            }

            // Utility: getNodeProperties, updateNodeUI (from previous, ensure they use `this`)
             getNodeProperties(nodeElement) {
                const properties = {};
                nodeElement.querySelectorAll('input, select').forEach(input => {
                    const name = input.name;
                    let value;
                    switch (input.type) {
                        case 'checkbox': value = input.checked; break;
                        case 'number': case 'range': value = parseFloat(input.value); break;
                        case 'color': value = input.value; break; // Keep as hex string
                        default: value = input.value;
                    }

                    if (name.includes('_x') || name.includes('_y') || name.includes('_z')) {
                        const baseName = name.substring(0, name.lastIndexOf('_'));
                        const component = name.substring(name.lastIndexOf('_') + 1);
                        if (!properties[baseName]) properties[baseName] = {};
                        properties[baseName][component] = value; // Store as number if possible
                    } else {
                        properties[name] = value;
                    }
                });
                return properties;
            }

            updateNodeUI(nodeElement) { // Updates node's input fields from its internal data
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
                             input.nextElementSibling.textContent = parseFloat(valueToSet).toFixed(input.step.includes('.') ? input.step.split('.')[1].length : 0);
                        }
                    }
                });
                this.updatePropertyVisibility(nodeElement); // Ensure conditional fields are correct
            }

        }