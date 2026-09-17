class TerrainAwareWaterSystem {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.terrain = null;
        this.waterBodies = [];
        this.waterMesh = null;
        this.pathPoints = [];
        this.pathCurve = null;
        this.pathVisual = null;
        this.controlPointMeshes = [];
        this.isDrawingMode = false;
        this.isEditMode = false;
        this.selectedPoint = null;
        this.isDragging = false;
        this.waterType = 'river';
        this.waterColor = new THREE.Color(0x1e90ff);
        this.deepWaterColor = new THREE.Color(0x0a3f7a);
        this.transparency = 0.78;
        this.waveSpeed = 1.0;
        this.waveHeight = 0.14;
        this.waveFrequency = 0.12;
        this.foamIntensity = 0.5;
        this.flowSpeed = 0.8;
        this.pathWidth = 4.0;
        this.waterDepth = 1.4;
        this.waterLevelOffset = 0.2;
        this.shoreBlend = 2.0;
        this.affectTerrain = true;
        this.enableReflections = true;
        this.enableRefraction = true;
        this.enableCaustics = false;
        this.enableFoam = true;
        this.reflectivity = 0.8;
        this.time = 0;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.pointMaterial = new THREE.MeshBasicMaterial({ color: 0x99ddff });
        this.selectedPointMaterial = new THREE.MeshBasicMaterial({ color: 0xff55cc });
        this.pathMaterial = new THREE.LineBasicMaterial({ color: 0x3cb9ff });
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (!this.renderer || !this.renderer.domElement) return;
        this.renderer.domElement.addEventListener('click', this.onClick.bind(this));
        this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
    }

    update(delta) {
        this.time += delta;
        for (const body of this.waterBodies) {
            const u = body.material?.uniforms;
            if (u) u.uTime.value = this.time;
        }
    }

    setTerrain(terrain) {
        this.terrain = terrain || null;
        if (!this.terrain) return;
        for (const body of this.waterBodies) {
            if (body.affectTerrain !== false) this.applyTerrainCarve(body);
        }
    }

    updateMousePosition(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    getWorldPointFromMouse(event) {
        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 1. Force update to ensure accurate coordinates
        if (this.terrain) this.terrain.updateMatrixWorld(true);

        // 2. IMPORTANT: Filter out helpers and the brush preview
        // We only want to hit the terrain mesh itself
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // Find the first hit that IS the terrain and NOT a helper
        const terrainHit = intersects.find(hit =>
            (hit.object === this.terrain || hit.object.name.includes("Terrain")) &&
            !hit.object.userData.isHelper
        );

        if (terrainHit) {
            return terrainHit.point.clone();
        }

        // Fallback if no terrain hit
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const p = new THREE.Vector3();
        return this.raycaster.ray.intersectPlane(plane, p) ? p.clone() : null;
    }

    onClick(event) {
        if (!this.isDrawingMode) return;

        // Prevent the click from selecting other objects in the background
        event.preventDefault();

        const point = this.getWorldPointFromMouse(event);
        console.log("Attempting to add water point at:", point); // DEBUG LOG

        if (point) {
            this.addPathPoint(point);
        } else {
            console.warn("Water System: Raycast did not hit the terrain.");
        }
    }

    onMouseMove(event) {
        if (!this.isEditMode || !this.selectedPoint || !this.isDragging) return;
        const point = this.getWorldPointFromMouse(event);
        if (!point) return;
        const idx = this.selectedPoint.userData.pointIndex;
        this.pathPoints[idx].copy(point);
        this.selectedPoint.position.copy(point);
        this.updatePathVisual();
    }

    onMouseDown(event) {
        if (!this.isEditMode) return;
        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.controlPointMeshes, false);
        if (intersects.length === 0) return;
        this.selectedPoint = intersects[0].object;
        this.selectedPoint.material = this.selectedPointMaterial;
        this.isDragging = true;
    }

    onMouseUp() {
        if (this.selectedPoint) this.selectedPoint.material = this.pointMaterial;
        this.selectedPoint = null;
        this.isDragging = false;
    }

    onKeyDown(event) {
        if (!this.isDrawingMode) return;
        if (event.key === 'Enter') this.finishDrawing();
        else if (event.key === 'Escape') this.cancelDrawing();
        else if ((event.key === 'z' || event.key === 'Z') && event.ctrlKey) this.undoPoint();
    }

    startDrawing() {
        this.isDrawingMode = true;
        this.isEditMode = false;
        this.pathPoints = [];
        this.clearPathVisuals();

        // Update the UI Panel Status
        const label = document.getElementById('water-status-text');
        const dot = document.getElementById('water-status-dot');
        if (label) label.textContent = "Drawing Path...";
        if (dot) dot.style.background = "#f5a623"; // Amber for "In Progress"
    }

    editMode() {
        if (this.pathPoints.length < 2) return alert('Draw a water path first.');
        this.isDrawingMode = false;
        this.isEditMode = true;
    }

    finishDrawing() {
        if (this.pathPoints.length < 2) return alert('Add at least 2 points.');
        this.isDrawingMode = false;
        this._setDisplay('water-toolbar', false);
        this._setDisplay('water-instructions', false);
    }

    cancelDrawing() {
        this.isDrawingMode = false;
        this.isEditMode = false;
        this.clearPathVisuals();
        this.pathPoints = [];
        this._setDisplay('water-toolbar', false);
        this._setDisplay('water-instructions', false);
        this._setText('water-point-count', '0');
    }

    undoPoint() {
        if (this.pathPoints.length === 0) return;
        this.pathPoints.pop();
        const m = this.controlPointMeshes.pop();
        if (m) {
            this.scene.remove(m);
            m.geometry?.dispose?.();
        }
        this._setText('water-point-count', String(this.pathPoints.length));
        if (this.pathPoints.length >= 2) this.updatePathVisual();
    }

    addPathPoint(position) {
        // Lift the point slightly (0.5 units) so it's always above the grass
        const visualPoint = position.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.pathPoints.push(visualPoint);

        // Create a much larger, visible Sphere so you can see where you clicked
        const pointGeo = new THREE.SphereGeometry(0.4, 16, 16); // Larger radius
        const point = new THREE.Mesh(pointGeo, this.selectedPointMaterial);
        point.position.copy(visualPoint);

        point.userData.isSystemObject = true;
        point.userData.selectable = false; // Don't let the gizmo grab the points yet

        this.scene.add(point);
        this.controlPointMeshes.push(point);

        if (this.pathPoints.length >= 2) this.updatePathVisual();

        this._setText('water-point-count', String(this.pathPoints.length));
    }

    updatePathVisual() {
        if (this.pathVisual) {
            this.scene.remove(this.pathVisual);
            this.pathVisual.geometry?.dispose?.();
        }
        this.pathCurve = new THREE.CatmullRomCurve3(this.pathPoints, false, 'catmullrom', 0.4);
        const pts = this.pathCurve.getPoints(Math.max(30, this.pathPoints.length * 25));
        this.pathVisual = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.pathMaterial);
        this.pathVisual.userData.isSystemObject = true;
        this.scene.add(this.pathVisual);
    }
    createWaterMesh() {
        if (this.pathPoints.length < 2) return alert('Draw a path with at least 2 points first.');
        const body = this.buildWaterBodyFromPath();
        if (!body) return;
        this.waterBodies.push(body);
        this.waterMesh = body.mesh;
        if (this.affectTerrain && this.terrain) this.applyTerrainCarve(body);
        this._setActiveWaterStatus(`${body.type.toUpperCase()} active`);
    }

    buildWaterBodyFromPath() {
        const type = (this.waterType || 'river').toLowerCase();
        const closed = type !== 'river';
        const points = this.pathPoints.map((p) => p.clone());
        if (closed && points.length >= 3 && points[0].distanceToSquared(points[points.length - 1]) > 0.0001) points.push(points[0].clone());

        const level = closed ? points.reduce((s, p) => s + p.y, 0) / points.length + this.waterLevelOffset : null;
        const geometry = closed ? this.createClosedWaterGeometry(points, level) : this.createRiverGeometry(points);
        if (!geometry) return null;

        const material = this.createWaterMaterial(type);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `WaterBody_${type}_${Date.now()}`;
        mesh.renderOrder = 900;
        mesh.userData.isWater = true;
        mesh.userData.isSystemObject = true;
        mesh.frustumCulled = false;
        this.scene.add(mesh);

        return {
            id: `water_${Math.random().toString(36).slice(2, 8)}`,
            type,
            pathPoints: points,
            width: this.pathWidth,
            depth: this.waterDepth,
            waterLevel: level,
            shoreBlend: this.shoreBlend,
            affectTerrain: this.affectTerrain,
            mesh,
            material
        };
    }

    createRiverGeometry(pathPoints) {
        const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.35);
        const length = curve.getLength();
        const segments = Math.max(40, Math.floor(length * 2));
        const points = curve.getPoints(segments);

        const vertices = [];
        const indices = [];
        const uvs = [];

        for (let i = 0; i < points.length; i++) {
            const t = i / (points.length - 1);
            const p = points[i];
            const tangent = curve.getTangent(t).normalize();
            const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            const left = p.clone().addScaledVector(side, this.pathWidth * 0.5);
            const right = p.clone().addScaledVector(side, -this.pathWidth * 0.5);
            left.y += this.waterLevelOffset;
            right.y += this.waterLevelOffset;
            vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
            const vu = t * (length / Math.max(this.pathWidth, 0.001));
            uvs.push(0, vu, 1, vu);
            if (i < points.length - 1) {
                const b = i * 2;
                indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
            }
        }

        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.setIndex(indices);
        g.computeVertexNormals();
        g.computeBoundingBox();
        g.computeBoundingSphere();
        return g;
    }

    createClosedWaterGeometry(pathPoints, waterLevel) {
        if (pathPoints.length < 4) return null;
        const shape = new THREE.Shape();
        shape.moveTo(pathPoints[0].x, pathPoints[0].z);
        for (let i = 1; i < pathPoints.length; i++) shape.lineTo(pathPoints[i].x, pathPoints[i].z);
        const g = new THREE.ShapeGeometry(shape, 64);
        g.rotateX(-Math.PI / 2);

        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, waterLevel);

        g.computeBoundingBox();
        const bb = g.boundingBox;
        const sx = Math.max(0.001, bb.max.x - bb.min.x);
        const sz = Math.max(0.001, bb.max.z - bb.min.z);
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            uv[i * 2] = (pos.getX(i) - bb.min.x) / sx;
            uv[i * 2 + 1] = (pos.getZ(i) - bb.min.z) / sz;
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        return g;
    }

    createWaterMaterial(type) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: this.time },
                uWaterColor: { value: this.waterColor.clone() },
                uDeepWaterColor: { value: this.deepWaterColor.clone() },
                uTransparency: { value: this.transparency },
                uWaveHeight: { value: this.waveHeight },
                uWaveFrequency: { value: this.waveFrequency },
                uWaveSpeed: { value: this.waveSpeed },
                uFlowSpeed: { value: this.flowSpeed },
                uFoamIntensity: { value: this.foamIntensity },
                uEnableFoam: { value: this.enableFoam ? 1.0 : 0.0 },
                uReflectivity: { value: this.reflectivity },
                uEnableReflections: { value: this.enableReflections ? 1.0 : 0.0 },
                uEnableRefraction: { value: this.enableRefraction ? 1.0 : 0.0 },
                uEnableCaustics: { value: this.enableCaustics ? 1.0 : 0.0 },
                uTypeRiver: { value: type === 'river' ? 1.0 : 0.0 }
            },
            vertexShader: `uniform float uTime; uniform float uWaveHeight; uniform float uWaveFrequency; uniform float uWaveSpeed; uniform float uFlowSpeed; uniform float uTypeRiver; varying vec2 vUv; varying float vWave; varying vec3 vWorldPos; varying vec3 vWorldNormal; void main(){vUv=uv; vec3 pos=position; float t=uTime*uWaveSpeed; float base=sin((pos.x+t)*uWaveFrequency)+cos((pos.z+t*0.83)*uWaveFrequency*1.21); float micro=sin((pos.x*0.73+pos.z*1.11+t*1.3)*1.9); float flowBoost=mix(1.0,1.35,uTypeRiver)*(0.8+uFlowSpeed*0.4); float wave=(base*0.55+micro*0.45)*uWaveHeight*flowBoost; pos.y+=wave; vWave=wave; vec4 wp=modelMatrix*vec4(pos,1.0); vWorldPos=wp.xyz; vWorldNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*wp;}`,
            fragmentShader: `uniform vec3 uWaterColor; uniform vec3 uDeepWaterColor; uniform float uTransparency; uniform float uFoamIntensity; uniform float uReflectivity; uniform float uEnableFoam; uniform float uEnableReflections; uniform float uEnableRefraction; uniform float uEnableCaustics; varying vec2 vUv; varying float vWave; varying vec3 vWorldPos; varying vec3 vWorldNormal; float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z);} void main(){vec3 n=normalize(vWorldNormal); vec3 v=normalize(cameraPosition-vWorldPos); float fresnel=pow(1.0-max(dot(v,n),0.0),3.0); float tone=smoothstep(-0.22,0.22,vWave); vec3 c=mix(uDeepWaterColor,uWaterColor,tone); if(uEnableFoam>0.5){float fm=smoothstep(0.03,0.18,vWave); float fn=hash12(vUv*24.0+vec2(vWave*7.0)); c=mix(c,vec3(0.95,0.98,1.0),fm*fn*uFoamIntensity);} if(uEnableCaustics>0.5){float cs=0.5+0.5*sin(vUv.x*90.0+vUv.y*70.0+vWave*50.0); c+=vec3(0.06,0.07,0.04)*cs*0.35;} vec3 refl=vec3(0.58,0.76,0.95)*fresnel*uReflectivity*uEnableReflections; vec3 refr=vec3(0.02,0.06,0.1)*(1.0-fresnel)*0.45*uEnableRefraction; gl_FragColor=vec4(c+refl+refr,uTransparency);}`,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true,
            blending: THREE.NormalBlending
        });
    }
    applyTerrainCarve(body) {
        if (!this.terrain || !body) return;
        const geo = this.terrain.geometry;
        const pos = geo.attributes.position;
        if (!pos) return;

        const wm = this.terrain.matrixWorld;
        const wp = new THREE.Vector3();
        let changed = false;

        if (body.type === 'river') {
            const influence = Math.max(0.25, body.width * 0.7 + body.shoreBlend);
            for (let i = 0; i < pos.count; i++) {
                wp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(wm);
                const d = this.distanceToPolylineXZ(wp.x, wp.z, body.pathPoints);
                if (d > influence) continue;
                const t = 1.0 - THREE.MathUtils.clamp(d / influence, 0, 1);
                const bed = (wp.y + this.waterLevelOffset) - (body.depth * (0.3 + 0.7 * t));
                const y = pos.getY(i);
                const ny = Math.min(y, bed);
                if (ny < y - 1e-5) {
                    pos.setY(i, ny);
                    changed = true;
                }
            }
        } else {
            const shore = Math.max(0.4, body.shoreBlend);
            for (let i = 0; i < pos.count; i++) {
                wp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(wm);
                const inside = this.isPointInPolygonXZ(wp.x, wp.z, body.pathPoints);
                const edge = this.distanceToPolygonEdgesXZ(wp.x, wp.z, body.pathPoints);
                if (!inside && edge > shore) continue;

                const y = pos.getY(i);
                let ny = y;
                if (inside) {
                    const f = THREE.MathUtils.clamp(edge / Math.max(shore, 0.0001), 0, 1);
                    ny = Math.min(y, body.waterLevel - body.depth * (0.3 + 0.7 * f));
                } else {
                    ny = Math.min(y, body.waterLevel - (1.0 - THREE.MathUtils.clamp(edge / shore, 0, 1)) * body.depth * 0.2);
                }

                if (ny < y - 1e-5) {
                    pos.setY(i, ny);
                    changed = true;
                }
            }
        }

        if (!changed) return;
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        if (this.terrain.material?.map) this.terrain.material.map.needsUpdate = true;
    }

    distanceToPolylineXZ(x, z, points) {
        let min = Number.POSITIVE_INFINITY;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1];
            min = Math.min(min, this.distancePointToSegment2D(x, z, a.x, a.z, b.x, b.z));
        }
        return min;
    }

    distanceToPolygonEdgesXZ(x, z, polygon) {
        let min = Number.POSITIVE_INFINITY;
        for (let i = 0; i < polygon.length - 1; i++) {
            const a = polygon[i], b = polygon[i + 1];
            min = Math.min(min, this.distancePointToSegment2D(x, z, a.x, a.z, b.x, b.z));
        }
        return min;
    }

    distancePointToSegment2D(px, pz, ax, az, bx, bz) {
        const abx = bx - ax, abz = bz - az, apx = px - ax, apz = pz - az;
        const ab2 = abx * abx + abz * abz;
        if (ab2 <= 1e-8) return Math.hypot(px - ax, pz - az);
        const t = THREE.MathUtils.clamp((apx * abx + apz * abz) / ab2, 0, 1);
        return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
    }

    isPointInPolygonXZ(x, z, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, zi = polygon[i].z, xj = polygon[j].x, zj = polygon[j].z;
            const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) + 1e-9) + xi);
            if (hit) inside = !inside;
        }
        return inside;
    }

    updateWaterUniforms() {
        for (const body of this.waterBodies) {
            const u = body.material?.uniforms;
            if (!u) continue;
            u.uWaterColor.value.copy(this.waterColor);
            u.uDeepWaterColor.value.copy(this.deepWaterColor);
            u.uTransparency.value = this.transparency;
            u.uWaveHeight.value = this.waveHeight;
            u.uWaveFrequency.value = this.waveFrequency;
            u.uWaveSpeed.value = this.waveSpeed;
            u.uFlowSpeed.value = this.flowSpeed;
            u.uFoamIntensity.value = this.foamIntensity;
            u.uEnableFoam.value = this.enableFoam ? 1.0 : 0.0;
            u.uReflectivity.value = this.reflectivity;
            u.uEnableReflections.value = this.enableReflections ? 1.0 : 0.0;
            u.uEnableRefraction.value = this.enableRefraction ? 1.0 : 0.0;
            u.uEnableCaustics.value = this.enableCaustics ? 1.0 : 0.0;
        }
    }

    applyPreset(name) {
        const presets = {
            'calm-river': { waterType: 'river', waveHeight: 0.06, waveSpeed: 0.45, waveFrequency: 0.09, flowSpeed: 0.6, foamIntensity: 0.2, transparency: 0.82, pathWidth: 3.5, waterDepth: 1.1 },
            'fast-river': { waterType: 'river', waveHeight: 0.18, waveSpeed: 2.1, waveFrequency: 0.17, flowSpeed: 1.8, foamIntensity: 0.85, transparency: 0.68, pathWidth: 4.5, waterDepth: 1.8 },
            'tropical-ocean': { waterType: 'ocean', waveHeight: 0.12, waveSpeed: 0.85, waveFrequency: 0.07, flowSpeed: 0.35, foamIntensity: 0.35, transparency: 0.86, pathWidth: 8.0, waterDepth: 2.0 },
            'stormy-sea': { waterType: 'ocean', waveHeight: 0.42, waveSpeed: 2.9, waveFrequency: 0.14, flowSpeed: 1.0, foamIntensity: 0.92, transparency: 0.58, pathWidth: 8.0, waterDepth: 2.6 },
            'mountain-stream': { waterType: 'river', waveHeight: 0.15, waveSpeed: 1.5, waveFrequency: 0.2, flowSpeed: 1.2, foamIntensity: 0.72, transparency: 0.7, pathWidth: 2.2, waterDepth: 1.5 }
        };
        const p = presets[name];
        if (!p) return;
        Object.assign(this, p);
        this.updateWaterUniforms();
    }

    clearPathVisuals() {
        if (this.pathVisual) {
            this.scene.remove(this.pathVisual);
            this.pathVisual.geometry?.dispose?.();
            this.pathVisual = null;
        }
        for (const m of this.controlPointMeshes) {
            this.scene.remove(m);
            m.geometry?.dispose?.();
        }
        this.controlPointMeshes = [];
    }

    clearAll() { this.clearPathVisuals(); this.pathPoints = []; this.pathCurve = null; this.isDrawingMode = false; this.isEditMode = false; this._setText('water-point-count', '0'); }

    removeWater() {
        for (const body of this.waterBodies) {
            this.scene.remove(body.mesh);
            body.mesh.geometry?.dispose?.();
            body.mesh.material?.dispose?.();
        }
        this.waterBodies = [];
        this.waterMesh = null;
        this.clearAll();
        this._setActiveWaterStatus('No water active');
    }

    _setDisplay(id, active) { const el = document.getElementById(id); if (el) el.classList.toggle('active', !!active); }
    _setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
    _setActiveWaterStatus(text) { const dot = document.getElementById('water-status-dot'); const label = document.getElementById('water-status-text'); if (dot) dot.classList.toggle('active', this.waterBodies.length > 0); if (label) label.textContent = text; }
}

let advancedWaterSystem = null;
function initWaterSystem(scene, camera, renderer) {
    advancedWaterSystem = new TerrainAwareWaterSystem(scene, camera, renderer);
    window.advancedWaterSystem = advancedWaterSystem;
    window.waterSystem = advancedWaterSystem;
    advancedWaterSystem._setActiveWaterStatus('No water active');
    const colorInput = document.getElementById('water-color-pro');
    if (colorInput && !colorInput.dataset.boundWaterColor) {
        colorInput.addEventListener('input', (e) => {
            updateWaterColor(e.target.value);
        });
        colorInput.dataset.boundWaterColor = '1';
    }
    const panel = document.getElementById('water-system-panel');
    if (panel && !panel.dataset.waterKeepOpenBound) {
        panel.dataset.waterKeepOpenBound = '1';
        panel.addEventListener('click', (event) => {
            const closeButton = event.target.closest('[data-water-close]');
            if (closeButton) return;
            event.stopPropagation();
            keepWaterPanelOpen();
        });
        panel.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });
        panel.addEventListener('mousedown', (event) => {
            event.stopPropagation();
        });
    }
}
function keepWaterPanelOpen() {
    const panel = document.getElementById('water-system-panel');
    if (!panel) return;
    panel.hidden = false;
    panel.style.display = 'flex';
    panel.classList.add('active');
    document.body.classList.add('side-panel-open');
    if (window.SecondarySidebar) {
        window.SecondarySidebar.activePanelId = 'water-system-panel';
    }
}
function openWaterSystem() { if (window.SecondarySidebar?.open) window.SecondarySidebar.open('water'); }
function closeWaterSystem() { if (window.SecondarySidebar?.close) window.SecondarySidebar.close(); }
function selectWaterType(type) { if (advancedWaterSystem) advancedWaterSystem.waterType = type; }

function startDrawingWaterPath() {
    if (!window.advancedWaterSystem) {
        console.error("Water System not initialized!");
        return;
    }

    // 1. DETACH EVERYTHING (The Unreal Way)
    if (window.transformControls) window.transformControls.detach();
    if (window.controls) window.controls.enabled = false; // STOP the camera from moving

    // 2. DISABLE OTHER TOOLS
    window.isBrushActive = false;
    window.selectedObject = null;

    // 3. ENSURE TERRAIN IS LINKED
    if (window.terrain) {
        window.advancedWaterSystem.setTerrain(window.terrain);
    } else {
        alert("Please create a terrain first!");
        return;
    }

    // 4. ACTIVATE DRAWING MODE
    window.advancedWaterSystem.startDrawing();

    // 5. VISUAL FEEDBACK
    document.body.style.cursor = 'crosshair';
    const statusText = document.getElementById('water-status-text');
    if (statusText) statusText.innerHTML = "<span style='color:#f5a623'>PLACING NODES (Click Terrain)</span>";

    console.log("⚓ ENTERED WATER SPLINE MODE: OrbitControls disabled. Click to add nodes.");
}
function finishWaterPath() { advancedWaterSystem?.finishDrawing(); }
function cancelWaterPath() { advancedWaterSystem?.cancelDrawing(); }
function undoWaterPoint() { advancedWaterSystem?.undoPoint(); }
function createWater() { advancedWaterSystem?.createWaterMesh(); }
function clearWaterPath() { if (advancedWaterSystem && confirm('Clear the current water path?')) advancedWaterSystem.clearAll(); }
function removeWaterSystem() { if (advancedWaterSystem && confirm('Remove all water bodies?')) { advancedWaterSystem.removeWater(); closeWaterSystem(); } }
function updateWaterColor(v) { if (advancedWaterSystem) { advancedWaterSystem.waterColor = new THREE.Color(v); advancedWaterSystem.updateWaterUniforms(); } }
function updateWaterDeepColor(v) { if (advancedWaterSystem) { advancedWaterSystem.deepWaterColor = new THREE.Color(v); advancedWaterSystem.updateWaterUniforms(); } }
function updateWaterTransparency(v) { if (advancedWaterSystem) { advancedWaterSystem.transparency = parseFloat(v); advancedWaterSystem.updateWaterUniforms(); } const el = document.getElementById('transparency-value'); if (el) el.textContent = parseFloat(v).toFixed(2); }
function updateWaterRoughness(v) { const el = document.getElementById('roughness-value'); if (el) el.textContent = parseFloat(v).toFixed(2); }
function updateWaterMetalness(v) { const el = document.getElementById('metalness-value'); if (el) el.textContent = parseFloat(v).toFixed(2); }
function updateWaveSpeed(v) { if (advancedWaterSystem) { advancedWaterSystem.waveSpeed = parseFloat(v); advancedWaterSystem.updateWaterUniforms(); } const el = document.getElementById('wave-speed-value'); if (el) el.textContent = parseFloat(v).toFixed(1); }
function updateWaveHeight(v) { if (advancedWaterSystem) { advancedWaterSystem.waveHeight = parseFloat(v); advancedWaterSystem.updateWaterUniforms(); } const el = document.getElementById('wave-height-value'); if (el) el.textContent = parseFloat(v).toFixed(2); }
function updateWaveFrequency(v) { if (advancedWaterSystem) { advancedWaterSystem.waveFrequency = parseFloat(v); advancedWaterSystem.updateWaterUniforms(); } const el = document.getElementById('wave-frequency-value'); if (el) el.textContent = parseFloat(v).toFixed(1); }
function updateFoamIntensity(v) { if (advancedWaterSystem) { advancedWaterSystem.foamIntensity = parseFloat(v); advancedWaterSystem.updateWaterUniforms(); } const el = document.getElementById('foam-intensity-value'); if (el) el.textContent = parseFloat(v).toFixed(2); }
function updateFlowSpeed(v) { if (advancedWaterSystem) { advancedWaterSystem.flowSpeed = parseFloat(v); advancedWaterSystem.updateWaterUniforms(); } const el = document.getElementById('flow-speed-value'); if (el) el.textContent = parseFloat(v).toFixed(2); }
function updatePathWidth(v) { if (advancedWaterSystem) advancedWaterSystem.pathWidth = parseFloat(v); const el = document.getElementById('path-width-value'); if (el) el.textContent = parseFloat(v).toFixed(1); }
function updateWaterDepth(v) { if (advancedWaterSystem) advancedWaterSystem.waterDepth = parseFloat(v); const el = document.getElementById('water-depth-value'); if (el) el.textContent = parseFloat(v).toFixed(1); }
function toggleReflections() { if (advancedWaterSystem) { advancedWaterSystem.enableReflections = !!document.getElementById('enable-reflections')?.checked; advancedWaterSystem.updateWaterUniforms(); } }
function toggleRefraction() { if (advancedWaterSystem) { advancedWaterSystem.enableRefraction = !!document.getElementById('enable-refraction')?.checked; advancedWaterSystem.updateWaterUniforms(); } }
function toggleCaustics() { if (advancedWaterSystem) { advancedWaterSystem.enableCaustics = !!document.getElementById('enable-caustics')?.checked; advancedWaterSystem.updateWaterUniforms(); } }
function toggleFoam() { if (advancedWaterSystem) { advancedWaterSystem.enableFoam = !!document.getElementById('enable-foam')?.checked; advancedWaterSystem.updateWaterUniforms(); } }
function updateReflectivity(v) { if (advancedWaterSystem) { advancedWaterSystem.reflectivity = parseFloat(v); advancedWaterSystem.updateWaterUniforms(); } const el = document.getElementById('reflectivity-value'); if (el) el.textContent = parseFloat(v).toFixed(2); }
function applyPreset(name) { advancedWaterSystem?.applyPreset(name); }
