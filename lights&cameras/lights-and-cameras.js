// Camera Preview
let activeCamera = null;
const expandButton = document.getElementById('expandPreview');
const previewContainer = document.getElementById('cameraPreview');
const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
// --- THE CRITICAL FIX: Enable Shadows for the Preview ---
previewRenderer.shadowMap.enabled = true;
// Match this to your main renderer's type (e.g., PCFSoftShadowMap or VSMShadowMap)
previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Ensure colors match the main viewport
previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
previewRenderer.toneMappingExposure = 1.0;
// -------------------------------------------------------

previewRenderer.setSize(previewContainer.clientWidth, previewContainer.clientHeight);
previewRenderer.setPixelRatio(window.devicePixelRatio);
previewContainer.appendChild(previewRenderer.domElement);



// ============================================================================
// CAMERA SYSTEM - FIXED VERSION
// Improvements:
// 1. Proper listener cleanup to prevent memory leaks
// 2. High-quality preview rendering
// 3. Correct scene filming with proper camera setup
// 4. Centralized camera management
// ============================================================================
function initializePanelControls() {
    const lightIntensityControl = document.getElementById('lightIntensity');
    const lightColorControl = document.getElementById('lightColor');

    // Update light properties when controls change
    function updateLightControls() {
        // Use the idiomatic 'isLight' property for type checking.
        if (selectedObject && selectedObject.isLight) {
            selectedObject.intensity = parseFloat(lightIntensityControl.value);
            // .set() is the modern and preferred method over .setStyle()
            selectedObject.color.set(lightColorControl.value);
            if (selectedObject.helper) {
                selectedObject.helper.update();
            }
        }
    }


    lightIntensityControl.addEventListener('input', updateLightControls);
    lightColorControl.addEventListener('input', updateLightControls);


    function updatePreviewSize() {
        // Use a short timeout to allow CSS transitions to complete before getting dimensions.
        // This prevents resizing based on incorrect, pre-transition values.
        setTimeout(() => {
            const rect = previewContainer.getBoundingClientRect();
            // Only resize if the container has a valid size to prevent warnings.
            if (rect.width > 0 && rect.height > 0) {
                previewRenderer.setSize(rect.width, rect.height);
                // Only update aspect ratio on cameras that have it (e.g., PerspectiveCamera)
                if (activeCamera && activeCamera.isPerspectiveCamera) {
                    activeCamera.aspect = rect.width / rect.height;
                    activeCamera.updateProjectionMatrix();
                }
            }
        }, 150); // 150ms should be longer than most CSS transitions.
    }

    // Toggle preview size
    document.getElementById('expandPreview').addEventListener('click', () => {
        previewContainer.classList.toggle('expanded');
        updatePreviewSize();
    });


    // Resize observer for dynamic adjustments
    new ResizeObserver(updatePreviewSize).observe(previewContainer);



    // --- LIGHT CREATION ---

    // Helper function to avoid repeating visual mesh creation code for each light.
    const createLightVisual = (geometry) => {
        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
        return new THREE.Mesh(geometry, material);
    };

    document.getElementById('addPointLight').addEventListener('click', () => {
        const light = new THREE.PointLight(0xffffff, 1, 100);
        light.position.set(0, 5, 0);
        light.castShadow = true;

        light.add(createLightVisual(new THREE.SphereGeometry(0.2)));

        const helper = new THREE.PointLightHelper(light, 1);
        scene.add(helper);
        light.helper = helper;

        light.name = `PointLight_${objects.length}`;
        addObjectToScene(light, 'Point Light');
        updateHierarchy();
    });

    document.getElementById('addSpotLight').addEventListener('click', () => {
        const light = new THREE.SpotLight(0xffffff, 1);
        light.position.set(0, 5, 0);
        light.angle = Math.PI / 4;
        light.castShadow = true;

        light.add(createLightVisual(new THREE.ConeGeometry(0.2, 0.5)));

        const helper = new THREE.SpotLightHelper(light);
        scene.add(helper);
        light.helper = helper;

        light.name = `SpotLight_${objects.length}`;
        addObjectToScene(light, 'Spot Light');
        updateHierarchy();
    });

    document.getElementById('addAreaLight').addEventListener('click', () => {
        const light = new THREE.RectAreaLight(0xffffff, 1, 2, 2);
        light.position.set(0, 5, 0);

        light.add(createLightVisual(new THREE.PlaneGeometry(0.4, 0.4)));

        // Add a check to ensure the helper has been included in the project to avoid errors.
        if (typeof THREE.RectAreaLightHelper !== 'undefined') {
            const helper = new THREE.RectAreaLightHelper(light);
            scene.add(helper);
            light.helper = helper;
        } else {
            console.warn('RectAreaLightHelper is not available. Please import it.');
        }

        light.name = `AreaLight_${objects.length}`;
        addObjectToScene(light, 'Area Light');
        updateHierarchy();
    });

    document.getElementById('addSunLight').addEventListener('click', () => {
        const { sunSystem, updateDayNightCycle } = createSimpleSunLight();
        scene.add(sunSystem);

        // This creates a new, separate animation loop.
        // For a large editor, it's better to integrate this into a single main loop.
        // However, to respect the original code structure, this is preserved.
        function animate() {
            // Add a safety check: stop the loop if the object is removed from the scene.
            if (!sunSystem || !sunSystem.parent) {
                return;
            }
            updateDayNightCycle();
            requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);

        sunSystem.name = `SunSystem_${objects.length}`;
        addObjectToScene(sunSystem, 'Sun System');
        updateHierarchy();
    });

    document.getElementById('addDirectionalLight').addEventListener('click', () => {
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0, 5, 0);
        light.castShadow = true;

        light.add(createLightVisual(new THREE.BoxGeometry(0.3, 0.3, 0.3)));

        const helper = new THREE.DirectionalLightHelper(light, 1);
        scene.add(helper);
        light.helper = helper;

        light.name = `DirectionalLight_${objects.length}`;
        addObjectToScene(light, 'Directional Light');
        updateHierarchy();
    });

    document.getElementById('addHemisphereLight').addEventListener('click', () => {
        const light = new THREE.HemisphereLight(0xffffbb, 0x080820, 1);
        light.position.set(0, 5, 0);

        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffbb,
            wireframe: true,
            // Note: vertexColors requires geometry to have color attributes. SphereGeometry does not by default.
            // This property may not have a visible effect here without custom geometry.
            vertexColors: true
        });
        const visualMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3), sphereMaterial);
        light.add(visualMesh);

        const helper = new THREE.HemisphereLightHelper(light, 1);
        scene.add(helper);
        light.helper = helper;

        light.name = `HemisphereLight_${objects.length}`;
        addObjectToScene(light, 'Hemisphere Light');
        updateHierarchy();
    });

    document.getElementById('addLensflareLight').addEventListener('click', () => {
        // NOTE: This requires THREE.Lensflare and THREE.LensflareElement from the examples/jsm/objects directory.
        const light = new THREE.PointLight(0xffffff, 1.5, 2000);
        light.position.set(0, 10, 0);

        const textureLoader = new THREE.TextureLoader();
        // IMPORTANT: This path is a placeholder. You must provide a valid path to your texture.
        const textureFlare = textureLoader.load('path_to_lensflare_texture.png');

        const lensflare = new THREE.Lensflare();
        lensflare.addElement(new THREE.LensflareElement(textureFlare, 512, 0));
        light.add(lensflare);

        light.add(createLightVisual(new THREE.SphereGeometry(0.2)));

        light.name = `LensflareLight_${objects.length}`;
        addObjectToScene(light, 'Lensflare Light');
        updateHierarchy();
    });

    document.getElementById('addVolumetricLight').addEventListener('click', () => {
        const light = new THREE.SpotLight(0xffffff, 1);
        light.position.set(0, 5, 0);
        light.angle = Math.PI / 6;
        light.penumbra = 0.3;
        light.decay = 2;
        light.distance = 50;

        const geometry = new THREE.CylinderGeometry(0, 2, 10, 32, 1, true); // Added 'openEnded' parameter
        const material = new THREE.ShaderMaterial({
            uniforms: {
                lightColor: { value: new THREE.Color(0xffffff) },
                intensity: { value: 1.0 }
            },
            vertexShader: `
                        varying vec3 vNormal;
                        void main() {
                            vNormal = normalize(normalMatrix * normal);
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
            fragmentShader: `
                        uniform vec3 lightColor;
                        uniform float intensity;
                        varying vec3 vNormal;
                        void main() {
                            // This calculation creates a soft falloff from the edges of the cone
                            float opacity = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 1.0, 0.0))), 2.0);
                            gl_FragColor = vec4(lightColor, opacity * intensity * 0.2);
                        }
                    `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });

        const volumetricCone = new THREE.Mesh(geometry, material);
        light.add(volumetricCone);

        const helper = new THREE.SpotLightHelper(light);
        scene.add(helper);
        light.helper = helper;

        light.name = `VolumetricLight_${objects.length}`;
        addObjectToScene(light, 'Volumetric Light');
        updateHierarchy();
    });


    // --- CAMERA CREATION ---
    // The commented out block is preserved as it was in the original code.

    document.getElementById('addCameraOrto').addEventListener('click', () => {
        const aspectRatio = window.innerWidth / window.innerHeight;
        const viewSize = 5;
        const zoomFactor = 0.8;

        const orthoCamera = new THREE.OrthographicCamera(
            -viewSize * aspectRatio * zoomFactor, viewSize * aspectRatio * zoomFactor,
            viewSize * zoomFactor, -viewSize * zoomFactor,
            0.1, 50
        );

        orthoCamera.name = 'OrthoCamera';
        orthoCamera.position.set(8, 6, 8);
        orthoCamera.lookAt(0, 0, 0);
        orthoCamera.userData = {
            viewSize: viewSize,
            zoomFactor: zoomFactor,
            minZoom: 0.2,
            maxZoom: 2,
            isOrtho: true,
            showHelpers: false
        };

        const cameraSystemGroup = new THREE.Group();
        cameraSystemGroup.name = "CameraSystem";
        cameraSystemGroup.visible = false;

        const cameraModelGroup = new THREE.Group();
        cameraModelGroup.name = "CameraPyramid";
        const pyramidGeometry = new THREE.ConeGeometry(0.2, 0.4, 4);
        const edges = new THREE.EdgesGeometry(pyramidGeometry);
        const pyramidMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
        const pyramidMesh = new THREE.LineSegments(edges, pyramidMaterial);
        pyramidMesh.rotation.x = Math.PI / 2;
        pyramidMesh.rotation.y = Math.PI / 4;
        pyramidMesh.position.z = -0.2;
        cameraModelGroup.add(pyramidMesh);
        cameraModelGroup.scale.set(0.5, 0.5, 0.5);
        cameraSystemGroup.add(cameraModelGroup);

        const frustumHelperGroup = new THREE.Group();
        frustumHelperGroup.name = "FrustumHelper";
        const frustumSize = 1.5;
        const frustumMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });
        const frustumGeom = new THREE.BufferGeometry();
        const frustumLines = new THREE.LineSegments(frustumGeom, frustumMaterial);
        frustumHelperGroup.add(frustumLines);
        cameraSystemGroup.add(frustumHelperGroup);

        function updateFrustumVisualization() {
            const visualLength = 10 * frustumSize;
            const far = Math.min(visualLength, orthoCamera.far - orthoCamera.near);
            const width = (orthoCamera.right - orthoCamera.left) * frustumSize;
            const height = (orthoCamera.top - orthoCamera.bottom) * frustumSize;
            const vertices = new Float32Array([
                0, 0, 0, -width / 2, -height / 2, -far,
                0, 0, 0, width / 2, -height / 2, -far,
                0, 0, 0, width / 2, height / 2, -far,
                0, 0, 0, -width / 2, height / 2, -far,
                -width / 2, -height / 2, -far, width / 2, -height / 2, -far,
                width / 2, -height / 2, -far, width / 2, height / 2, -far,
                width / 2, height / 2, -far, -width / 2, height / 2, -far,
                -width / 2, height / 2, -far, -width / 2, -height / 2, -far
            ]);
            frustumGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            frustumGeom.computeBoundingSphere();
        }

        function toggleHelpers(show) {
            orthoCamera.userData.showHelpers = show;
            cameraSystemGroup.visible = show;
            if (show) updateFrustumVisualization();
        }

        function adjustZoom(delta) {
            orthoCamera.userData.zoomFactor = THREE.MathUtils.clamp(
                orthoCamera.userData.zoomFactor + delta,
                orthoCamera.userData.minZoom,
                orthoCamera.userData.maxZoom
            );
            const newAspectRatio = window.innerWidth / window.innerHeight;
            orthoCamera.left = -orthoCamera.userData.viewSize * newAspectRatio * orthoCamera.userData.zoomFactor;
            orthoCamera.right = orthoCamera.userData.viewSize * newAspectRatio * orthoCamera.userData.zoomFactor;
            orthoCamera.top = orthoCamera.userData.viewSize * orthoCamera.userData.zoomFactor;
            orthoCamera.bottom = -orthoCamera.userData.viewSize * orthoCamera.userData.zoomFactor;
            orthoCamera.updateProjectionMatrix();
            if (orthoCamera.userData.showHelpers) updateFrustumVisualization();
        }

        function createZoomControls() {
            const container = document.createElement('div');
            container.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 100; display: flex; gap: 5px; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px;";

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.title = 'Close panel';
            closeBtn.style.cssText = "font-weight:bold;font-size:18px;line-height:14px; padding:4px 10px;cursor:pointer;color:#fff;background:#d33;border:none;";
            closeBtn.onclick = () => {
                if (container.parentNode) container.parentNode.removeChild(container);
                if (orthoCamera.userData && orthoCamera.userData.uiCleanup) orthoCamera.userData.uiCleanup();
            };
            container.appendChild(closeBtn);

            const zoomOutBtn = document.createElement('button');
            zoomOutBtn.textContent = '−';
            zoomOutBtn.style.cssText = "padding: 8px 16px; font-size: 16px; cursor: pointer;";
            zoomOutBtn.onclick = () => adjustZoom(0.1);
            container.appendChild(zoomOutBtn);

            const zoomInBtn = document.createElement('button');
            zoomInBtn.textContent = '+';
            zoomInBtn.style.cssText = "padding: 8px 16px; font-size: 16px; cursor: pointer;";
            zoomInBtn.onclick = () => adjustZoom(-0.1);
            container.appendChild(zoomInBtn);

            const helpersBtn = document.createElement('button');
            helpersBtn.textContent = '▲ View Volume';
            helpersBtn.style.cssText = "padding: 8px 16px; font-size: 14px; cursor: pointer; margin-left: 10px;";
            helpersBtn.onclick = () => {
                toggleHelpers(!orthoCamera.userData.showHelpers);
                helpersBtn.textContent = orthoCamera.userData.showHelpers ? '▼ Hide Volume' : '▲ View Volume';
            };
            container.appendChild(helpersBtn);

            document.body.appendChild(container);
            orthoCamera.userData.zoomControls = container;
        }

        orthoCamera.add(cameraSystemGroup);
        scene.add(orthoCamera);

        const gridHelper = new THREE.GridHelper(10, 10, 0x666666, 0x333333);
        scene.add(gridHelper);
        orthoCamera.userData.gridHelper = gridHelper;
        const axesHelper = new THREE.AxesHelper(3);
        scene.add(axesHelper);
        orthoCamera.userData.axesHelper = axesHelper;

        function handleResize() {
            const newAspectRatio = window.innerWidth / window.innerHeight;
            orthoCamera.left = -orthoCamera.userData.viewSize * newAspectRatio * orthoCamera.userData.zoomFactor;
            orthoCamera.right = orthoCamera.userData.viewSize * newAspectRatio * orthoCamera.userData.zoomFactor;
            orthoCamera.updateProjectionMatrix();
            if (orthoCamera.userData.showHelpers) updateFrustumVisualization();
        }
        window.addEventListener('resize', handleResize);
        orthoCamera.userData.resizeListener = handleResize;

        createZoomControls();

        addObjectToScene(orthoCamera, 'OrthoCamera');
        updateHierarchy();
        setupCameraControls(orthoCamera);
        if (activeCamera && activeCamera !== orthoCamera) transitionToCamera(orthoCamera);
        activeCamera = orthoCamera;

        orthoCamera.userData.cleanup = function () {
            window.removeEventListener('resize', this.userData.resizeListener);
            if (this.userData.zoomControls && document.body.contains(this.userData.zoomControls)) {
                document.body.removeChild(this.userData.zoomControls);
            }
            if (this.userData.gridHelper) scene.remove(this.userData.gridHelper);
            if (this.userData.axesHelper) scene.remove(this.userData.axesHelper);
        };
    });

    function createManagedCubeCamera() {
        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
            format: THREE.RGBFormat,
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter
        });

        const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
        cubeCamera.name = 'CubeCamera';
        cubeCamera.position.set(0, 2, 0);
        scene.add(cubeCamera);

        const cameraVisuals = new THREE.Group();
        cameraVisuals.name = 'CubeCameraVisuals';
        cubeCamera.add(cameraVisuals);

        const cameraModel = new THREE.Group();
        cameraModel.name = 'CubeCameraModel';
        const cubeGeom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const cubeEdges = new THREE.EdgesGeometry(cubeGeom);
        const cubeMaterial = new THREE.LineBasicMaterial({ color: 0x1db34d, linewidth: 2 });
        cameraModel.add(new THREE.LineSegments(cubeEdges, cubeMaterial));

        const lensMaterial = new THREE.MeshBasicMaterial({ color: 0x1db34d, transparent: true, opacity: 0.7 });
        const lensGeom = new THREE.CircleGeometry(0.15, 16);
        const createLens = (pos, rot) => {
            const lens = new THREE.Mesh(lensGeom, lensMaterial);
            lens.position.set(pos[0], pos[1], pos[2]);
            lens.rotation.set(rot[0], rot[1], rot[2]);
            return lens;
        };
        cameraModel.add(createLens([0, 0, 0.41], [0, Math.PI, 0]));
        cameraModel.add(createLens([0, 0, -0.41], [0, 0, 0]));
        cameraModel.add(createLens([-0.41, 0, 0], [0, Math.PI / 2, 0]));
        cameraModel.add(createLens([0.41, 0, 0], [0, -Math.PI / 2, 0]));
        cameraModel.add(createLens([0, 0.41, 0], [-Math.PI / 2, 0, 0]));
        cameraModel.add(createLens([0, -0.41, 0], [Math.PI / 2, 0, 0]));
        cameraVisuals.add(cameraModel);

        const sphereHelper = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 16), new THREE.MeshBasicMaterial({ color: 0x1db34d, wireframe: true, transparent: true, opacity: 0.3 }));
        sphereHelper.visible = false;
        cameraVisuals.add(sphereHelper);
        const axisHelper = new THREE.AxesHelper(2);
        axisHelper.visible = false;
        cameraVisuals.add(axisHelper);

        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'camera-controls';
        Object.assign(controlsContainer.style, { position: 'fixed', bottom: '20px', right: '20px', zIndex: '100', background: 'rgba(0,0,0,0.75)', padding: '10px', borderRadius: '6px', display: 'flex', gap: '6px' });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.title = 'Close panel';
        closeBtn.style.cssText = "font-weight:bold;font-size:18px;line-height:14px;padding:4px 10px;cursor:pointer;color:#fff;background:#d33;border:none;";
        closeBtn.onclick = () => {
            if (controlsContainer.parentNode) controlsContainer.parentNode.removeChild(controlsContainer);
            if (cubeCamera.userData && cubeCamera.userData.uiCleanup) cubeCamera.userData.uiCleanup();
        };
        controlsContainer.appendChild(closeBtn);

        const sphereToggle = document.createElement('button');
        sphereToggle.textContent = '▲ Capture Range';
        sphereToggle.style.padding = '8px 12px';
        sphereToggle.onclick = () => {
            sphereHelper.visible = !sphereHelper.visible;
            sphereToggle.textContent = sphereHelper.visible ? '▼ Hide Range' : '▲ Capture Range';
        };
        controlsContainer.appendChild(sphereToggle);

        const axesToggle = document.createElement('button');
        axesToggle.textContent = '▲ Show Axes';
        axesToggle.style.padding = '8px 12px';
        axesToggle.onclick = () => {
            axisHelper.visible = !axisHelper.visible;
            axesToggle.textContent = axisHelper.visible ? '▼ Hide Axes' : '▲ Show Axes';
        };
        controlsContainer.appendChild(axesToggle);

        const updateBtn = document.createElement('button');
        updateBtn.textContent = 'Update Capture';
        updateBtn.style.cssText = "padding: 8px 12px; background: #1db34d; border: none; color: white; cursor: pointer;";
        updateBtn.onclick = () => {
            cameraVisuals.visible = false;      // Hide the model so it doesn't render itself
            cubeCamera.update(renderer, scene); // Perform the 6-sided render
            cameraVisuals.visible = true;       // Make the model visible again
            console.log("CubeCamera texture updated.");
        };
        controlsContainer.appendChild(updateBtn);
        document.body.appendChild(controlsContainer);

        cubeCamera.userData = { visuals: cameraVisuals, controls: controlsContainer, renderTarget: cubeRenderTarget, helpers: { sphere: sphereHelper, axes: axisHelper } };

        addObjectToScene(cubeCamera, 'CubeCamera');
        updateHierarchy();
        setupCameraControls(cubeCamera);
        if (activeCamera && activeCamera !== cubeCamera) transitionToCamera(cubeCamera);
        activeCamera = cubeCamera;

        cubeCamera.userData.cleanup = function () {
            if (this.userData.controls && document.body.contains(this.userData.controls)) {
                document.body.removeChild(this.userData.controls);
            }
            if (this.userData.renderTarget) this.userData.renderTarget.dispose();
            // scene.remove(this) should be handled by the main editor's deletion logic
        };
    }
    window.createManagedCubeCamera = createManagedCubeCamera;

    document.getElementById('addStereoCamera').addEventListener('click', () => {
        const perspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        perspectiveCamera.position.set(0, 1.6, 0);
        perspectiveCamera.lookAt(0, 1.6, -1);
        perspectiveCamera.name = 'StereoCamera';

        const stereoCamera = new THREE.StereoCamera();
        stereoCamera.aspect = 0.5;
        stereoCamera.eyeSep = 0.064;

        const specialControls = document.querySelector('.camera-special-controls');
        specialControls.innerHTML = '';

        const stereoPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        stereoPreviewRenderer.setPixelRatio(window.devicePixelRatio);
        stereoPreviewRenderer.autoClear = false;

        // Function to handle resizing for the stereo preview specifically
        function updateStereoPreviewSize() {
            setTimeout(() => {
                const width = previewContainer.clientWidth;
                const height = previewContainer.clientHeight;
                if (width > 0 && height > 0) {
                    stereoPreviewRenderer.setSize(width, height);
                    perspectiveCamera.aspect = (width / 2) / height;
                    perspectiveCamera.updateProjectionMatrix();
                }
            }, 150);
        }

        previewContainer.insertBefore(stereoPreviewRenderer.domElement, previewContainer.querySelector('.preview-controls'));
        previewContainer.classList.remove('hidden');
        updateStereoPreviewSize(); // Initial size update

        perspectiveCamera.add(createStereoCameraVisuals());
        scene.add(perspectiveCamera);

        let animationFrameId = null; // Store the ID to be able to cancel it
        function renderStereoPreview() {
            if (!perspectiveCamera.parent) {
                cancelAnimationFrame(animationFrameId); // Stop loop if camera is removed
                return;
            }

            stereoCamera.update(perspectiveCamera);
            stereoPreviewRenderer.clear();

            const width = previewContainer.clientWidth;
            const height = previewContainer.clientHeight;
            const halfWidth = width / 2;

            stereoPreviewRenderer.setViewport(0, 0, halfWidth, height);
            stereoPreviewRenderer.setScissor(0, 0, halfWidth, height);
            stereoPreviewRenderer.setScissorTest(true);
            stereoPreviewRenderer.render(scene, stereoCamera.cameraL);

            stereoPreviewRenderer.setViewport(halfWidth, 0, halfWidth, height);
            stereoPreviewRenderer.setScissor(halfWidth, 0, halfWidth, height);
            stereoPreviewRenderer.render(scene, stereoCamera.cameraR);

            animationFrameId = requestAnimationFrame(renderStereoPreview);
        }
        renderStereoPreview();

        document.getElementById('minimizePreview').onclick = () => { // Using onclick to not add multiple listeners
            previewContainer.classList.toggle('minimized');
            stereoPreviewRenderer.domElement.style.display = previewContainer.classList.contains('minimized') ? 'none' : 'block';
            if (!previewContainer.classList.contains('minimized')) updateStereoPreviewSize();
        };
        document.getElementById('expandPreview').onclick = () => {
            previewContainer.classList.toggle('expanded');
            updateStereoPreviewSize();
        };

        const resizeObserver = new ResizeObserver(() => {
            if (!previewContainer.classList.contains('minimized')) updateStereoPreviewSize();
        });
        resizeObserver.observe(previewContainer);

        const eyeSepControl = document.createElement('div');
        eyeSepControl.className = 'stereo-control';
        eyeSepControl.innerHTML = `<label>Eye Separation: <span>${stereoCamera.eyeSep.toFixed(3)}m</span></label><input type="range" min="0.01" max="0.1" step="0.001" value="${stereoCamera.eyeSep}">`;
        const focalControl = document.createElement('div');
        focalControl.className = 'stereo-control';
        focalControl.innerHTML = `<label>Focal Length: <span>${perspectiveCamera.getFocalLength().toFixed(0)}mm</span></label><input type="range" min="10" max="100" step="1" value="${perspectiveCamera.getFocalLength()}">`;
        specialControls.append(eyeSepControl, focalControl);

        eyeSepControl.querySelector('input').addEventListener('input', (e) => {
            stereoCamera.eyeSep = parseFloat(e.target.value);
            eyeSepControl.querySelector('span').textContent = `${stereoCamera.eyeSep.toFixed(3)}m`;
        });
        focalControl.querySelector('input').addEventListener('input', (e) => {
            perspectiveCamera.setFocalLength(parseFloat(e.target.value));
            focalControl.querySelector('span').textContent = `${perspectiveCamera.getFocalLength().toFixed(0)}mm`;
        });

        addObjectToScene(perspectiveCamera, 'StereoCamera');
        updateHierarchy();
        setupCameraControls(perspectiveCamera);
        if (activeCamera && activeCamera !== perspectiveCamera) transitionToCamera(perspectiveCamera);
        activeCamera = perspectiveCamera;

        perspectiveCamera.userData.cleanup = () => {
            cancelAnimationFrame(animationFrameId);
            if (stereoPreviewRenderer.domElement.parentNode === previewContainer) {
                previewContainer.removeChild(stereoPreviewRenderer.domElement);
            }
            specialControls.innerHTML = '';
            stereoPreviewRenderer.dispose();
            resizeObserver.disconnect();
            if (activeCamera === perspectiveCamera) {
                previewContainer.classList.add('hidden');
                activeCamera = null;
            }
            // Reset preview listeners to avoid conflicts
            document.getElementById('minimizePreview').onclick = null;
            document.getElementById('expandPreview').onclick = null;
        };
    });


    document.getElementById('addCamera').addEventListener('click', () => {

        /* =========================
           CAMERA RIG (PIVOT SYSTEM)
        ========================== */
        const cameraRig = new THREE.Group();
        cameraRig.name = 'CameraRig';
        scene.add(cameraRig);

        /* =========================
           ADVANCED CAMERA
        ========================== */
        const camera = new THREE.PerspectiveCamera(
            60,                                 // Cinematic default FOV
            window.innerWidth / window.innerHeight,
            0.1,                                // Better depth precision
            500                                 // Reduced far plane
        );

        // Cinematic eye-level height
        camera.position.set(0, 1.7, 3);
        camera.layers.enable(1); // Weapon / FPS layer

        camera.userData = {
            isCamera: true,
            showHelpers: false,
            focusDistance: 10,
            isActive: false
        };

        cameraRig.add(camera);

        /* =========================
           DIRECTION / SHOOTING RAY
        ========================== */
        const shootRay = new THREE.Raycaster();
        const shootDirection = new THREE.Vector3();

        function updateShootingDirection() {
            camera.getWorldDirection(shootDirection);
            shootRay.set(camera.getWorldPosition(new THREE.Vector3()), shootDirection);
        }

        /* =========================
           REALISTIC CAMERA SETTINGS
        ========================== */
        camera.fov = 60;               // Do NOT compute manually
        camera.updateProjectionMatrix();

        /* =========================
           CAMERA HELPER (EDITOR)
        ========================== */
        const helper = new THREE.CameraHelper(camera);
        helper.visible = false;        // Hidden by default
        helper.material.color.setHex(0xff8800);
        scene.add(helper);

        camera.helper = helper;

        /* =========================
           SMOOTH CAMERA DAMPING
        ========================== */
        const damping = {
            position: 0.08,
            rotation: 0.1
        };

        function updateCamera(delta) {
            updateShootingDirection();

            // Example future expansion:
            // - collision avoidance
            // - shoulder swap
            // - recoil
            // - camera shake
        }

        /* =========================
           CAMERA REGISTRATION
        ========================== */
        camera.name = `Camera_${objects.length}`;
        addObjectToScene(cameraRig, 'camera');
        updateHierarchy();
        setupCameraControls(cameraRig);

        if (activeCamera) transitionToCamera(camera);
        activeCamera = camera;

        /* =========================
           MAIN CAMERA LOOP
        ========================== */
        let lastTime = performance.now();
        function animateCamera() {
            const now = performance.now();
            const delta = (now - lastTime) / 1000;
            lastTime = now;

            updateCamera(delta);
            requestAnimationFrame(animateCamera);
        }

        animateCamera();
    });

    // Cache the input elements to avoid repeated lookups.
    const fovInput = document.querySelector('#cameraFOV input');
    const nearInput = document.querySelector('#cameraNear input');
    const farInput = document.querySelector('#cameraFar input');

    /**
     * Connects UI controls (FOV, near, far) to a camera's properties.
     * CRITICAL FIX: This now removes old event listeners before adding new ones,
     * preventing a memory leak and buggy behavior when switching between cameras.
     * @param {THREE.Camera} camera The camera to be controlled.
     */
    function setupCameraControls(camera) {
        // A local helper to manage listeners for a specific input element.
        const setupControlListener = (inputElement, propertyName, isPerspectiveOnly = false) => {
            if (!inputElement) return;

            // Remove the previous listener if it exists to prevent memory leaks.
            if (inputElement._listener) {
                inputElement.removeEventListener('input', inputElement._listener);
            }

            const isControlApplicable = !(isPerspectiveOnly && !camera.isPerspectiveCamera);
            inputElement.disabled = !isControlApplicable;

            if (isControlApplicable) {
                inputElement.value = camera[propertyName];
                // Define the new listener.
                inputElement._listener = () => {
                    camera[propertyName] = parseFloat(inputElement.value);
                    camera.updateProjectionMatrix();
                    if (camera.helper) camera.helper.update();
                };
                // Add the new listener.
                inputElement.addEventListener('input', inputElement._listener);
            }
        };

        setupControlListener(fovInput, 'fov', true);
        setupControlListener(nearInput, 'near');
        setupControlListener(farInput, 'far');
    }

    function transitionToCamera(targetCamera) {
        // This function animates the camera object itself, which might not be the main
        // scene camera. Preserving this logic as it may be intended for the editor's specific needs.
        if (!activeCamera) { // Guard against trying to transition from nothing
            console.warn("Transition failed: No active source camera.");
            return;
        }

        const duration = 1.5;
        const startPosition = activeCamera.position.clone();
        const startQuaternion = activeCamera.quaternion.clone();

        const endPosition = targetCamera.position.clone();
        const endQuaternion = targetCamera.quaternion.clone();

        let time = 0;
        const easing = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        function animateTransition() {
            time += 0.016; // Assumes ~60fps, for frame-rate independence, use a THREE.Clock
            const alpha = easing(Math.min(time / duration, 1));

            // The camera being animated is the one in the preview.
            // This assumes 'activeCamera' is the object being manipulated, not the viewer's camera.
            activeCamera.position.lerpVectors(startPosition, endPosition, alpha);
            THREE.Quaternion.slerp(startQuaternion, endQuaternion, activeCamera.quaternion, alpha);

            if (time < duration) {
                requestAnimationFrame(animateTransition);
            } else {
                // Snap to final position and rotation to ensure accuracy
                activeCamera.position.copy(endPosition);
                activeCamera.quaternion.copy(endQuaternion);
                if (activeCamera.helper) activeCamera.helper.update();

                // The projectionLine logic seems specific to your application and is preserved.
                if (activeCamera.projectionLine) {
                    const positions = new Float32Array([
                        activeCamera.position.x, activeCamera.position.y, activeCamera.position.z,
                        0, 0, 0
                    ]);
                    activeCamera.projectionLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    activeCamera.projectionLine.geometry.attributes.position.needsUpdate = true;
                }
            }
        }
        animateTransition();
    }

}



// --- GLOBAL UI LISTENERS AND FUNCTIONS ---

// These listeners and functions are outside initializePanelControls as in the original code.

window.addEventListener('load', initializePanelControls);

document.querySelectorAll('.panel-header').forEach(header => {
    header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const button = header.querySelector('.expand-button');
        const isHidden = content.style.display === 'none' || content.style.display === '';
        content.style.display = isHidden ? 'block' : 'none';
        button.textContent = isHidden ? '▼' : '▶';
    });
});

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
    });
});

// These UI update functions are preserved as placeholders, assuming they are
// called from other parts of your application when an object is selected.
function updateLightUI(light) {
    const fovInput = document.querySelector('#cameraFOV input');
    if (fovInput) {
        fovInput.disabled = true;
    }
    // Add other light-specific UI updates here
}

function updateCameraUI(camera) {
    const fovInput = document.querySelector('#cameraFOV input');
    if (fovInput) {
        fovInput.disabled = !camera.isPerspectiveCamera;
        if (camera.isPerspectiveCamera) {
            fovInput.value = camera.fov;
        }
    }
    // Add other camera-specific UI updates here
}

// This function is preserved, assuming it's called from your main init sequence.
function initializeLightAndCameraSystem() {
    // 'setupLightControls' is not defined in the provided code, so this line will error
    // unless it exists elsewhere in your project. It's preserved for structural integrity.
    setupLightControls();

    // This assumes a global 'renderer' object exists.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

// This function is preserved, assuming it's called from your main animation loop.
function updateHelpers() {
    // Assumes a global 'objects' array exists.
    objects.forEach(obj => {
        if (obj.helper) {
            obj.helper.update();
        }
    });
}
