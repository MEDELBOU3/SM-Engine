// Character Sculpting Constants and State
const CHARACTER_TOOLS = {
    FACE_SHAPE: 'faceShape',
    NOSE_SCULPT: 'noseSculpt',
    CHEEK_DEFINITION: 'cheekDefinition',
    JAW_SCULPT: 'jawSculpt',
    FOREHEAD_SHAPE: 'foreheadShape',
    CHIN_SCULPT: 'chinSculpt',
    TEMPLE_SCULPT: 'templeSculpt',
    BROW_RIDGE: 'browRidge',
    EYE_SOCKET: 'eyeSocket',
    LIP_SHAPE: 'lipShape',
    SMOOTH: 'smooth',
    PINCH: 'pinch',
    INFLATE: 'inflate',
    CREASE: 'crease',
    SNAKE_HOOK: 'snakeHook',
    HAIR_BRUSH: 'hairBrush'
};

// Editor modes (assuming defined elsewhere)
const EDITOR_MODE = {
    SCULPT_CHARACTER: 'sculptCharacter',
    SCULPT_TERRAIN: 'sculptTerrain',
    IDLE: 'idle',
    TRANSFORM_OBJECT: 'transformObject'
};

// Hair system state
let physicsEnabled = false;
let physicsAnimationId = null;
let hairBrushActive = false;
let maxHairStrandsPerOperation = 10;
let sculptingTarget = null;

const hairBrushSettings = {
    numSegments: 5,
    segmentLength: 0.05,
    stiffness: 0.8,
    gravity: 0.5,
    windStrength: 0.3,
    turbulence: 0.1,
    springStiffness: 0.8,
    damping: 0.4,
    airResistance: 0.05,
    thickness: 0.004,
    density: 50,
    maxStrands: 5000, // Increased for better visual density
    curl: 0.2,
    randomness: 0.1,
    clumpSize: 3,
    frizz: 0.1,
    wave: 0.2,
    hairStrands: [],
    guides: [],
    materialType: 'anisotropic',
    hairColor: 0x3a1a00,
    specularColor: 0x8B4513,
    useInstancing: true,
    lastUpdateTime: 0,
    lastRebuildTime: 0,
    updateInterval: 100,
    batchSize: 50
};

let currentStrokeTarget = null;

// Optimized hair strand class
class HairStrand {
    constructor(rootPosition, normal) {
        this.segments = [];
        this.initialDirection = normal.clone();
        this.rootPosition = rootPosition.clone();
        this.normal = normal.clone();
        this.needsUpdate = true;
        this.lastPhysicsUpdateTime = 0;

        // Guide influence
        let guideInfluence = new THREE.Vector3();
        let guideWeight = 0;
        hairBrushSettings.guides.forEach(guide => {
            const guideCurve = guide.curve || new THREE.CatmullRomCurve3([
                rootPosition,
                rootPosition.clone().add(normal.clone().multiplyScalar(hairBrushSettings.segmentLength))
            ]);
            const dist = rootPosition.distanceTo(guideCurve.getPoint(0));
            const influence = 1 / (1 + dist * dist * 100);
            guideInfluence.add(guideCurve.getTangent(0).multiplyScalar(influence));
            guideWeight += influence;
        });
        if (guideWeight > 0) {
            guideInfluence.divideScalar(guideWeight);
            this.initialDirection.lerp(guideInfluence, 0.5);
        }

        this.initializeSegments();
    }

    initializeSegments() {
        this.segments = [];
        let currentPos = this.rootPosition.clone();
        const baseDirection = this.initialDirection.clone();

        for (let i = 0; i < hairBrushSettings.numSegments; i++) {
            const t = i / (hairBrushSettings.numSegments - 1 || 1);
            let segmentOffset = new THREE.Vector3();

            const waveAmount = Math.sin(t * Math.PI * hairBrushSettings.wave * 5) * hairBrushSettings.segmentLength * 0.3 * hairBrushSettings.wave;
            const waveDir = new THREE.Vector3().crossVectors(baseDirection, new THREE.Vector3((i % 2 === 0 ? 1 : -1), (i % 3 === 0 ? 1 : -1), 0)).normalize();
            segmentOffset.add(waveDir.multiplyScalar(waveAmount));

            if (hairBrushSettings.curl > 0) {
                const curlAngle = t * hairBrushSettings.curl * Math.PI * 4;
                const curlRadius = hairBrushSettings.curl * hairBrushSettings.segmentLength * 0.5 * Math.sin(t * Math.PI);
                const R = new THREE.Matrix4().makeRotationAxis(baseDirection, curlAngle);
                const curlVec = new THREE.Vector3(curlRadius, 0, 0).applyMatrix4(R);
                segmentOffset.add(curlVec);
            }

            const frizzScale = t * t;
            const frizzOffset = new THREE.Vector3(
                (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)
            ).multiplyScalar(hairBrushSettings.frizz * hairBrushSettings.segmentLength * 0.5 * frizzScale);
            segmentOffset.add(frizzOffset);

            const noiseOffset = new THREE.Vector3(
                (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)
            ).multiplyScalar(hairBrushSettings.randomness * hairBrushSettings.segmentLength * 0.2);

            this.segments.push({
                position: currentPos.clone(),
                prevPosition: currentPos.clone(),
                velocity: new THREE.Vector3(),
                force: new THREE.Vector3(),
                mass: 1.0 - (t * 0.3),
                locked: i === 0,
            });

            if (i < hairBrushSettings.numSegments - 1) {
                const nextSegmentDirection = baseDirection.clone().add(noiseOffset).normalize();
                currentPos.add(nextSegmentDirection.multiplyScalar(hairBrushSettings.segmentLength)).add(segmentOffset);
            }
        }
        this.needsUpdate = true;
    }

    update(deltaTime) {
        if (!physicsEnabled || hairBrushSettings.numSegments <= 1) {
            this.needsUpdate = false;
            return false;
        }

        const now = performance.now();
        if (now - this.lastPhysicsUpdateTime < 16 && deltaTime !== 0) return false;
        this.lastPhysicsUpdateTime = now;

        const gravityForce = new THREE.Vector3(0, -hairBrushSettings.gravity * 0.1, 0);
        let hasChanged = false;

        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (seg.locked) {
                seg.position.copy(this.rootPosition);
                continue;
            }

            const tempPos = seg.position.clone();
            let acceleration = gravityForce.clone();
            const velocity = seg.position.clone().sub(seg.prevPosition);
            acceleration.add(velocity.multiplyScalar(-hairBrushSettings.damping * 5));

            if (hairBrushSettings.windStrength > 0) {
                const windTime = Date.now() * 0.0001;
                const wind = new THREE.Vector3(
                    Math.sin(windTime + this.rootPosition.x) * hairBrushSettings.windStrength,
                    Math.sin(windTime * 0.7 + this.rootPosition.y) * hairBrushSettings.windStrength * 0.5,
                    Math.cos(windTime * 1.3 + this.rootPosition.z) * hairBrushSettings.windStrength
                );
                acceleration.add(wind);
            }

            seg.position.add(velocity).add(acceleration.multiplyScalar(deltaTime * deltaTime));
            seg.prevPosition.copy(tempPos);

            if (tempPos.distanceToSquared(seg.position) > 0.000001) {
                hasChanged = true;
            }
        }

        const iterations = 3;
        for (let iter = 0; iter < iterations; iter++) {
            this.applyConstraints();
        }

        if (sculptingSphere) {
            const sphereRadius = 1;
            for (let i = 1; i < this.segments.length; i++) {
                const seg = this.segments[i];
                const localSegPos = sculptingSphere.worldToLocal(seg.position.clone());
                const distance = localSegPos.length();
                if (distance < sphereRadius) {
                    localSegPos.setLength(sphereRadius + 0.01);
                    seg.position.copy(sculptingSphere.localToWorld(localSegPos));
                    seg.prevPosition.copy(seg.position);
                    hasChanged = true;
                }
            }
        }

        if (hasChanged) this.needsUpdate = true;
        return hasChanged;
    }

    applyConstraints() {
        this.segments[0].position.copy(this.rootPosition);
        for (let i = 0; i < this.segments.length - 1; i++) {
            const segA = this.segments[i];
            const segB = this.segments[i + 1];
            const delta = segB.position.clone().sub(segA.position);
            const dist = delta.length();
            const desiredDist = hairBrushSettings.segmentLength;
            if (dist === 0) continue;

            const diff = (dist - desiredDist) / dist;
            const correction = delta.multiplyScalar(0.5 * diff * hairBrushSettings.stiffness);

            if (!segA.locked) segA.position.add(correction);
            if (!segB.locked) segB.position.sub(correction);

            if (i < this.segments.length - 2) {
                const segC = this.segments[i + 2];
                const dirAB = segB.position.clone().sub(segA.position).normalize();
                const dirBC = segC.position.clone().sub(segB.position).normalize();
                const angle = dirAB.angleTo(dirBC);
                const maxAngle = Math.PI / 6;
                if (angle > maxAngle) {
                    const correctionAxis = dirAB.cross(dirBC).normalize();
                    const correctionRot = new THREE.Quaternion().setFromAxisAngle(
                        correctionAxis,
                        (angle - maxAngle) * hairBrushSettings.stiffness * 0.5
                    );
                    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(correctionRot);
                    segB.position.applyMatrix4(matrix);
                    segC.position.applyMatrix4(matrix);
                }
            }
        }
    }

    getGeometryData() {
        const points = this.segments.map(seg => seg.position);
        if (points.length < 2) {
            console.warn("Strand has insufficient points, adding fallback point");
            points.push(this.rootPosition.clone().add(
                this.initialDirection.clone().multiplyScalar(hairBrushSettings.segmentLength * hairBrushSettings.numSegments)
            ));
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const matrix = new THREE.Matrix4();
        const position = this.rootPosition;
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            this.initialDirection.clone().normalize()
        );
        const scale = new THREE.Vector3(1, 1, 1);
        matrix.compose(position, quaternion, scale);
        return { matrix, curve, points };
    }
}

// Hair mesh management
let hairInstanceMesh = null;
let mergedHairGeometry = null;
let hairMesh = null;

function createInstancedHairMesh() {
    console.log("Creating instanced hair mesh...");
    if (hairInstanceMesh) {
        hairInstanceMesh.geometry.dispose();
        if (hairInstanceMesh.material) hairInstanceMesh.material.dispose();
        if (hairInstanceMesh.parent) hairInstanceMesh.parent.remove(hairInstanceMesh);
        hairInstanceMesh = null;
    }

    const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, hairBrushSettings.segmentLength * hairBrushSettings.numSegments, 0)
    ];
    const strandCurve = new THREE.CatmullRomCurve3(points);
    const strandGeometry = new THREE.TubeGeometry(
        strandCurve,
        hairBrushSettings.numSegments,
        hairBrushSettings.thickness,
        3,
        false
    );

    const material = new THREE.ShaderMaterial({
        uniforms: {
            lightDir: { value: new THREE.Vector3(5, 5, 5).normalize() },
            hairColor: { value: new THREE.Color(hairBrushSettings.hairColor) },
            specularColor: { value: new THREE.Color(hairBrushSettings.specularColor) },
            shininess: { value: 10 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vTangent;
            varying vec3 vViewDir;
            attribute vec3 tangent;
            void main() {
                vNormal = normalize(normal);
                vTangent = normalize(tangent);
                vViewDir = normalize((viewMatrix * vec4(position, 1.0)).xyz);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 lightDir;
            uniform vec3 hairColor;
            uniform vec3 specularColor;
            uniform float shininess;
            varying vec3 vNormal;
            varying vec3 vTangent;
            varying vec3 vViewDir;
            void main() {
                vec3 H = normalize(lightDir + vViewDir);
                float TdotH = dot(vTangent, H);
                float specular = pow(max(TdotH, 0.0), shininess) * 0.5;
                vec3 diffuse = hairColor * max(dot(vNormal, lightDir), 0.0);
                gl_FragColor = vec4(diffuse + specular * specularColor, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });

    hairInstanceMesh = new THREE.InstancedMesh(strandGeometry, material, hairBrushSettings.maxStrands);
    hairInstanceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hairInstanceMesh.castShadow = true;

    const dummyMatrix = new THREE.Matrix4();
    for (let i = 0; i < hairBrushSettings.maxStrands; i++) {
        hairInstanceMesh.setMatrixAt(i, dummyMatrix);
    }
    hairInstanceMesh.count = 0;
    hairInstanceMesh.instanceMatrix.needsUpdate = true;

    if (sculptingSphere) {
        sculptingSphere.add(hairInstanceMesh);
        console.log("Instanced hair mesh added to sculptingSphere:", hairInstanceMesh.uuid);
    } else {
        console.warn("sculptingSphere not found, adding to scene");
        scene.add(hairInstanceMesh);
    }

    // Debug: Add test strand
    if (hairBrushSettings.hairStrands.length === 0) {
        const testStrand = new HairStrand(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 1, 0)
        );
        hairBrushSettings.hairStrands.push(testStrand);
        hairInstanceMesh.count = 1;
        const { matrix } = testStrand.getGeometryData();
        hairInstanceMesh.setMatrixAt(0, matrix);
        hairInstanceMesh.instanceMatrix.needsUpdate = true;
        console.log("Added test strand for debugging");
    }

    return hairInstanceMesh;
}

function createMergedHairGeometry() {
    console.log("Creating merged hair geometry system...");
    if (hairMesh) {
        if (hairMesh.geometry) hairMesh.geometry.dispose();
        if (hairMesh.material) hairMesh.material.dispose();
        if (hairMesh.parent) hairMesh.parent.remove(hairMesh);
        hairMesh = null;
    }

    const material = new THREE.ShaderMaterial({
        uniforms: {
            lightDir: { value: new THREE.Vector3(5, 5, 5).normalize() },
            hairColor: { value: new THREE.Color(hairBrushSettings.hairColor) },
            specularColor: { value: new THREE.Color(hairBrushSettings.specularColor) },
            shininess: { value: 10 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vTangent;
            varying vec3 vViewDir;
            attribute vec3 tangent;
            void main() {
                vNormal = normalize(normal);
                vTangent = normalize(tangent);
                vViewDir = normalize((viewMatrix * vec4(position, 1.0)).xyz);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 lightDir;
            uniform vec3 hairColor;
            uniform vec3 specularColor;
            uniform float shininess;
            varying vec3 vNormal;
            varying vec3 vTangent;
            varying vec3 vViewDir;
            void main() {
                vec3 H = normalize(lightDir + vViewDir);
                float TdotH = dot(vTangent, H);
                float specular = pow(max(TdotH, 0.0), shininess) * 0.5;
                vec3 diffuse = hairColor * max(dot(vNormal, lightDir), 0.0);
                gl_FragColor = vec4(diffuse + specular * specularColor, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });

    const mergedGeometry = new THREE.BufferGeometry();
    hairMesh = new THREE.Mesh(mergedGeometry, material);
    hairMesh.castShadow = true;

    if (sculptingSphere) {
        sculptingSphere.add(hairMesh);
        console.log("Merged hair mesh added to sculptingSphere:", hairMesh.uuid);
    } else {
        console.warn("sculptingSphere not found, adding to scene");
        scene.add(hairMesh);
    }

    return hairMesh;
}

function updateHairMesh() {
    const now = performance.now();
    if (hairBrushSettings.useInstancing) {
        if (!hairInstanceMesh) createInstancedHairMesh();
        updateInstancedHair();
    } else {
        if (!hairMesh) createMergedHairGeometry();
        updateMergedHair();
    }
    hairBrushSettings.lastRebuildTime = now;
}

function updateInstancedHair() {
    if (!hairInstanceMesh || !hairBrushSettings.hairStrands) return;

    const strands = hairBrushSettings.hairStrands;
    const strandCount = Math.min(strands.length, hairBrushSettings.maxStrands);
    hairInstanceMesh.count = strandCount;

    const dummyMatrix = new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0));
    for (let i = 0; i < hairBrushSettings.maxStrands; i++) {
        if (i < strandCount) {
            const strand = strands[i];
            if (strand.needsUpdate || hairBrushActive) {
                const { matrix } = strand.getGeometryData();
                hairInstanceMesh.setMatrixAt(i, matrix);
                strand.needsUpdate = false;
            }
        } else {
            hairInstanceMesh.setMatrixAt(i, dummyMatrix);
        }
    }
    hairInstanceMesh.instanceMatrix.needsUpdate = true;
    console.log("Updated instanced hair mesh with", strandCount, "strands");
}

function updateMergedHair() {
    if (!hairMesh || !hairBrushSettings.hairStrands) {
        console.warn("Merged hair mesh or strands not ready for update.");
        return;
    }

    const strands = hairBrushSettings.hairStrands;
    if (strands.length === 0) {
        if (hairMesh.geometry) hairMesh.geometry.dispose();
        hairMesh.geometry = new THREE.BufferGeometry();
        console.log("Cleared merged hair geometry (0 strands).");
        return;
    }

    const anyStrandNeedsUpdate = strands.some(s => s.needsUpdate);
    if (!anyStrandNeedsUpdate && !hairBrushActive && !physicsEnabled) {
        console.log("No strands need update, skipping merged hair update");
        return;
    }

    console.log(`Updating merged hair with ${strands.length} strands.`);
    const geometries = [];
    for (let i = 0; i < strands.length; i++) {
        const strand = strands[i];
        const { curve } = strand.getGeometryData();
        if (curve.points.length >= 2) {
            const tubeThickness = hairBrushSettings.thickness * (0.8 + Math.random() * 0.4);
            const tubeSegments = Math.max(2, Math.floor(hairBrushSettings.numSegments / 2));
            try {
                const tubeGeometry = new THREE.TubeGeometry(
                    curve,
                    tubeSegments,
                    tubeThickness,
                    3,
                    false
                );
                geometries.push(tubeGeometry);
            } catch (error) {
                console.warn(`Failed to create tube geometry for strand ${i}:`, error);
            }
            strand.needsUpdate = false;
        } else {
            console.warn(`Strand ${i} has insufficient points (${curve.points.length})`);
        }
    }

    if (geometries.length > 0) {
        try {
            const newMergedGeometry = THREE.BufferGeometryUtils.mergeBufferGeometries(geometries);
            if (newMergedGeometry) {
                if (hairMesh.geometry) hairMesh.geometry.dispose();
                hairMesh.geometry = newMergedGeometry;
                console.log("Merged hair geometry updated with", geometries.length, "strands");
            } else {
                console.warn("mergeBufferGeometries returned null");
                if (hairMesh.geometry) hairMesh.geometry.dispose();
                hairMesh.geometry = new THREE.BufferGeometry();
            }
        } catch (error) {
            console.error("Error merging geometries:", error);
            if (hairMesh.geometry) hairMesh.geometry.dispose();
            hairMesh.geometry = new THREE.BufferGeometry();
        }
    } else {
        console.warn("No valid tube geometries to merge");
        if (hairMesh.geometry) hairMesh.geometry.dispose();
        hairMesh.geometry = new THREE.BufferGeometry();
    }
}

function applyHairBrush(event) {
    if (!hairBrushActive || event.buttons !== 1 || !sculptingEnabled) return;

    const raycaster = new THREE.Raycaster();
    const mouseNDC = getMouseCoords(event);
    raycaster.setFromCamera(mouseNDC, camera);

    const intersects = raycaster.intersectObject(sculptingSphere);
    if (intersects.length > 0 && sculptingSphere) {
        const intersect = intersects[0];
        const hitPosition = intersect.point;
        const hitNormal = intersect.face.normal.clone().transformDirection(sculptingSphere.matrixWorld).normalize();

        const brushRadiusWorld = characterBrushSize * 0.2;
        const densityFactor = hairBrushSettings.density / 50;
        const strandsToAttempt = Math.max(1, Math.floor(densityFactor * 5));

        let strandsAddedThisStroke = 0;
        for (let i = 0; i < strandsToAttempt; i++) {
            if (hairBrushSettings.hairStrands.length >= hairBrushSettings.maxStrands) break;
            if (strandsAddedThisStroke >= maxHairStrandsPerOperation) break;

            const randomAngle = Math.random() * Math.PI * 2;
            const randomRadius = Math.random() * brushRadiusWorld;
            let tangent = new THREE.Vector3();
            if (Math.abs(hitNormal.y) < 0.99) {
                tangent.crossVectors(hitNormal, new THREE.Vector3(0, 1, 0)).normalize();
            } else {
                tangent.crossVectors(hitNormal, new THREE.Vector3(1, 0, 0)).normalize();
            }
            let bitangent = new THREE.Vector3().crossVectors(hitNormal, tangent).normalize();
            const offset = tangent.multiplyScalar(Math.cos(randomAngle) * randomRadius)
                           .add(bitangent.multiplyScalar(Math.sin(randomAngle) * randomRadius));
            const strandRootPos = hitPosition.clone().add(offset);

            let tooClose = false;
            for (const existingStrand of hairBrushSettings.hairStrands) {
                if (existingStrand.rootPosition.distanceToSquared(strandRootPos) < (0.005 * 0.005)) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            const strand = new HairStrand(strandRootPos, hitNormal.clone());
            hairBrushSettings.hairStrands.push(strand);
            strandsAddedThisStroke++;
        }

        if (strandsAddedThisStroke > 0) {
            console.log(`Added ${strandsAddedThisStroke} strands. Total: ${hairBrushSettings.hairStrands.length}`);
            if (hairBrushSettings.useInstancing) {
                if (!hairInstanceMesh) {
                    createInstancedHairMesh();
                    console.log("Created instanced hair mesh:", hairInstanceMesh);
                }
                if (hairInstanceMesh && hairInstanceMesh.parent !== sculptingSphere) {
                    sculptingSphere.add(hairInstanceMesh);
                    console.log("Added hairInstanceMesh to sculptingSphere");
                }
            } else {
                if (!hairMesh) {
                    createMergedHairGeometry();
                    console.log("Created merged hair mesh:", hairMesh);
                }
                if (hairMesh && hairMesh.parent !== sculptingSphere) {
                    sculptingSphere.add(hairMesh);
                    console.log("Added hairMesh to sculptingSphere");
                }
            }
            updateHairMesh();
            console.log("Hair mesh updated after adding strands");
        }
        document.getElementById('strandCount').textContent = hairBrushSettings.hairStrands.length;
    } else {
        console.warn("No intersection with sculptingSphere for hair brush");
    }
}

function applyClumping(strands) {
    const clumpGroups = [];
    const clumpRadius = hairBrushSettings.clumpSize * hairBrushSettings.segmentLength;

    for (let i = 0; i < strands.length; i++) {
        const strand = strands[i];
        let group = null;
        for (const existingGroup of clumpGroups) {
            const groupCentroid = existingGroup.strands
                .reduce((sum, s) => sum.add(s.rootPosition), new THREE.Vector3())
                .divideScalar(existingGroup.strands.length);
            if (strand.rootPosition.distanceTo(groupCentroid) < clumpRadius) {
                group = existingGroup;
                break;
            }
        }
        if (!group) {
            group = { strands: [], centroid: new THREE.Vector3() };
            clumpGroups.push(group);
        }
        group.strands.push(strand);
    }

    strands.forEach(strand => {
        const group = clumpGroups.find(g => g.strands.includes(strand));
        if (group && group.strands.length > 1) {
            const centroid = group.strands
                .reduce((sum, s) => sum.add(s.rootPosition), new THREE.Vector3())
                .divideScalar(group.strands.length);
            for (let i = 1; i < strand.segments.length; i++) {
                const seg = strand.segments[i];
                const toCentroid = centroid.clone().sub(seg.position);
                const clumpForce = toCentroid.normalize().multiplyScalar(hairBrushSettings.clumpSize * 0.05);
                seg.force.add(clumpForce);
            }
        }
    });
}

function updateHairPhysics(time) {
    if (!physicsEnabled || !hairBrushSettings.hairStrands || hairBrushSettings.hairStrands.length === 0) {
        if (physicsAnimationId) {
            cancelAnimationFrame(physicsAnimationId);
            physicsAnimationId = null;
        }
        return;
    }

    const deltaTime = 1 / 60;
    let strandsUpdated = 0;
    const cameraDistance = camera.position.distanceTo(sculptingSphere.position);
    const lodFactor = Math.min(1, cameraDistance / 10);
    const batchSize = Math.floor(hairBrushSettings.batchSize * lodFactor);

    applyClumping(hairBrushSettings.hairStrands);

    const processAll = hairBrushSettings.hairStrands.length < batchSize * 2;
    if (processAll) {
        hairBrushSettings.hairStrands.forEach(strand => {
            if (strand.update(deltaTime)) strandsUpdated++;
        });
    } else {
        const batchOffset = Math.floor((time / 100)) % Math.ceil(hairBrushSettings.hairStrands.length / batchSize);
        const startIndex = batchOffset * batchSize;
        const endIndex = Math.min(startIndex + batchSize, hairBrushSettings.hairStrands.length);
        for (let i = startIndex; i < endIndex; i++) {
            if (hairBrushSettings.hairStrands[i].update(deltaTime)) strandsUpdated++;
        }
    }

    if (strandsUpdated > 0 || hairBrushActive) {
        updateHairMesh();
    }

    physicsAnimationId = requestAnimationFrame(updateHairPhysics);
}

// Character modeling variables
let selectedCharacterTool = null;
let isCharacterSculpting = false;
let characterBrushSize = 1.0;
let characterBrushStrength = 0.1;
let characterBrushFalloff = 0.5;
let sculptingSphere = null;
let characterUndoStack = [];
let characterRedoStack = [];
let prevMouseEvent = null;
let sculptingEnabled = true;

function setupLighting() {
    scene.children = scene.children.filter(child => !(child instanceof THREE.Light));

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(5, 5, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0001;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 3, -5);
    fillLight.castShadow = false;
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, 5, -7);
    rimLight.castShadow = false;
    scene.add(rimLight);
}

function addSculptingSphere() {
    console.log("Adding sculpting sphere...");
    if (sculptingSphere) {
        if (sculptingSphere.geometry) sculptingSphere.geometry.dispose();
        if (sculptingSphere.material) sculptingSphere.material.dispose();
        scene.remove(sculptingSphere);
    }

    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const material = new THREE.MeshStandardMaterial({
        color: 0xB08D57,
        roughness: 0.7,
        metalness: 0.0,
    });

    sculptingSphere = new THREE.Mesh(geometry, material);
    sculptingSphere.name = 'SculptingSphere';
    sculptingSphere.castShadow = true;
    sculptingSphere.receiveShadow = true;
    sculptingSphere.userData.isSculptable = true;

    scene.add(sculptingSphere);
    console.log("Sculpting sphere added to scene:", sculptingSphere.uuid);

    if (hairBrushSettings.useInstancing) {
        if (hairInstanceMesh) {
            scene.remove(hairInstanceMesh);
            hairInstanceMesh = null;
        }
        createInstancedHairMesh();
    } else {
        if (hairMesh) {
            scene.remove(hairMesh);
            hairMesh = null;
        }
        createMergedHairGeometry();
    }

    createCharacterBrushPreview();
    setupCharacterSculptingEvents();
    setupLighting();
    return sculptingSphere;
}

function createCharacterBrushPreview() {
    if (window.characterBrushPreview) {
        scene.remove(window.characterBrushPreview);
        window.characterBrushPreview.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }

    const brushPreview = new THREE.Group();
    brushPreview.name = "CharacterBrushCursor";
    brushPreview.userData.ignoreInTimeline = true;

    const innerSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
    );

    const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.48, 0.5, 64),
        new THREE.MeshBasicMaterial({ color: 0x4A90E2, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );

    const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.65, 64),
        new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0xffe400) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;
                void main() {
                    float radius = distance(vUv, vec2(0.5));
                    float glow = 1.0 - smoothstep(0.4, 0.5, radius);
                    float pulse = 0.7 + 0.3 * sin(time * 3.0 + vUv.x * 20.0);
                    gl_FragColor = vec4(color * glow * pulse, glow * pulse * 0.5);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending
        })
    );

    brushPreview.add(innerSphere, outerRing, glowRing);
    brushPreview.renderOrder = 999;
    brushPreview.traverse(child => {
        if (child.isMesh) {
            child.material.depthTest = false;
            child.material.depthWrite = false;
        }
    });

    brushPreview.visible = false;
    window.characterBrushPreview = brushPreview;
    scene.add(brushPreview);
    animateBrushGlow(glowRing.material);
    console.log("✅ Character Brush Preview Created/Updated.");
}

function animateBrushGlow(material) {
    function animate() {
        if (material && window.characterBrushPreview?.visible) {
            material.uniforms.time.value += 0.03;
        }
        requestAnimationFrame(animate);
    }
    animate();
}

function updateCharacterBrushPreview(event) {
    if (!sculptingTarget || !window.characterBrushPreview) {
        if (window.characterBrushPreview) window.characterBrushPreview.visible = false;
        return;
    }

    const mouse = getMouseNormalized(event, renderer.domElement);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(sculptingTarget, true);

    if (intersects.length > 0) {
        const { point, face, object } = intersects[0];
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
        const worldNormal = face.normal.clone().applyMatrix3(normalMatrix).normalize();

        window.characterBrushPreview.position.copy(point);
        const lookTarget = new THREE.Vector3().addVectors(point, worldNormal);
        window.characterBrushPreview.lookAt(lookTarget);
        window.characterBrushPreview.scale.setScalar(characterBrushSize);
        window.characterBrushPreview.visible = true;
        window.lastIntersect = { point, normal: worldNormal, face, object };
    } else {
        window.characterBrushPreview.visible = false;
        window.lastIntersect = null;
    }
}

function onPointerMoveCH(event) {
    switch (currentEditorMode) {
        case EDITOR_MODE.SCULPT_TERRAIN:
            if (typeof updateBrushCursor === 'function') {
                updateBrushCursor(event);
            }
            break;
        case EDITOR_MODE.SCULPT_CHARACTER:
            if (typeof updateCharacterBrushPreview === 'function') {
                updateCharacterBrushPreview(event);
            }
            break;
        case EDITOR_MODE.IDLE:
        case EDITOR_MODE.TRANSFORM_OBJECT:
        default:
            if (window.characterBrushPreview) window.characterBrushPreview.visible = false;
            if (window.universalBrushCursor) window.universalBrushCursor.visible = false;
            break;
    }

    if (isCharacterSculpting && currentEditorMode === EDITOR_MODE.SCULPT_CHARACTER) {
        onCharacterSculptMove(event);
    }
}

function setupCharacterSculptingEvents() {
    const canvas = renderer.domElement;

    document.querySelectorAll('.panel-button-tool').forEach(button => {
        button.addEventListener('click', () => {
            selectedCharacterTool = button.id;
            console.log("Selected tool:", selectedCharacterTool);
            updateToolUI();
        });
    });

    canvas.addEventListener('pointerdown', onCharacterSculptStart);
    canvas.addEventListener('pointermove', onPointerMoveCH);
    canvas.addEventListener('pointerup', onCharacterSculptEnd);
    canvas.addEventListener('pointerleave', onCharacterSculptEnd);

    const sculptingToggleEl = document.getElementById('sculptingToggle');
    if (sculptingToggleEl) {
        sculptingEnabled = sculptingToggleEl.checked;
        sculptingToggleEl.addEventListener('change', (e) => {
            sculptingEnabled = e.target.checked;
            console.log("Sculpting enabled:", sculptingEnabled);
        });
    } else {
        console.warn("Sculpting toggle not found");
    }

    const brushSizeEl = document.getElementById('brushSizeSc');
    if (brushSizeEl) {
        characterBrushSize = parseFloat(brushSizeEl.value);
        document.getElementById('brushSizeValue').textContent = characterBrushSize.toFixed(2);
        brushSizeEl.addEventListener('input', (e) => {
            characterBrushSize = parseFloat(e.target.value);
            document.getElementById('brushSizeValue').textContent = characterBrushSize.toFixed(2);
            updateBrushPreviewSize();
        });
    } else {
        console.warn("Brush Size slider not found");
    }

    const brushStrengthEl = document.getElementById('brushStrength');
    if (brushStrengthEl) {
        characterBrushStrength = parseFloat(brushStrengthEl.value);
        document.getElementById('brushStrengthValue').textContent = characterBrushStrength.toFixed(2);
        brushStrengthEl.addEventListener('input', (e) => {
            characterBrushStrength = parseFloat(e.target.value);
            document.getElementById('brushStrengthValue').textContent = characterBrushStrength.toFixed(2);
        });
    } else {
        console.warn("Brush Strength slider not found");
    }

    const brushFalloffEl = document.getElementById('brushFalloff');
    if (brushFalloffEl) {
        characterBrushFalloff = parseFloat(brushFalloffEl.value);
        document.getElementById('brushFalloffValue').textContent = characterBrushFalloff.toFixed(1);
        brushFalloffEl.addEventListener('input', (e) => {
            characterBrushFalloff = parseFloat(e.target.value);
            document.getElementById('brushFalloffValue').textContent = characterBrushFalloff.toFixed(1);
        });
    } else {
        console.warn("Brush Falloff slider not found");
    }

    const physicsToggleBtn = document.getElementById('togglePhysics') || document.getElementById('enablePhysics');
    if (physicsToggleBtn && !physicsToggleBtn.dataset.listenerAttached) {
        physicsToggleBtn.addEventListener('click', () => {
            physicsEnabled = !physicsEnabled;
            console.log("Physics enabled:", physicsEnabled);
            if (physicsEnabled) {
                updateHairPhysics(performance.now());
            } else if (physicsAnimationId) {
                cancelAnimationFrame(physicsAnimationId);
                physicsAnimationId = null;
            }
            updateToolUI();
        });
        physicsToggleBtn.dataset.listenerAttached = 'true';
    } else if (!physicsToggleBtn) {
        console.warn("Physics toggle button not found");
    }

    setupHairControls();
}

window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.altKey) {
        characterBrushSize += e.deltaY * -0.001;
        characterBrushSize = Math.max(0.1, Math.min(characterBrushSize, 10));
        updateBrushPreviewSize();
    }
});

function updateBrushPreviewSize() {
    if (!window.characterBrushPreview) return;
    const [inner, outer, glow] = window.characterBrushPreview.children;

    inner.geometry.dispose();
    inner.geometry = new THREE.SphereGeometry(characterBrushSize * 0.1, 16, 8);

    outer.geometry.dispose();
    outer.geometry = new THREE.RingGeometry(characterBrushSize * 0.48, characterBrushSize * 0.5, 64);

    glow.geometry.dispose();
    glow.geometry = new THREE.RingGeometry(characterBrushSize * 0.45, characterBrushSize * 0.65, 64);
}

function updateToolUI() {
    document.querySelectorAll('.panel-button-tool').forEach(button => {
        button.classList.toggle('active', button.id === selectedCharacterTool);
    });
    const physicsToggleBtn = document.getElementById('togglePhysics') || document.getElementById('enablePhysics');
    if (physicsToggleBtn) {
        physicsToggleBtn.textContent = physicsEnabled ? 'Disable Physics' : 'Enable Physics';
    }
}

function setupHairControls() {
    const controlMapping = {
        'guideHairDensity': 'density',
        'hairSegments': 'numSegments',
        'hairLength': 'segmentLength',
        'hairDensity': 'density',
        'hairCurl': 'curl',
        'hairStiffness': 'stiffness',
        'hairWave': 'wave',
        'hairFrizz': 'frizz',
        'hairClumpSize': 'clumpSize',
        'hairNoise': 'randomness',
        'hairColor': 'hairColor',
        'hairSpecular': 'specularColor'
    };

    Object.keys(controlMapping).forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            const valueDisplay = element.parentNode.querySelector('.value-display') || element.nextElementSibling;
            if (element.type === 'range' && valueDisplay && valueDisplay.tagName === 'SPAN') {
                valueDisplay.textContent = element.value;
            }

            element.addEventListener('input', (e) => {
                const settingKey = controlMapping[controlId];
                let value = e.target.value;
                if (element.type === 'range' && valueDisplay && valueDisplay.tagName === 'SPAN') {
                    valueDisplay.textContent = value;
                }
                updateHairSettings(settingKey, value, element.type);
            });
        } else {
            console.warn(`Hair control element with ID '${controlId}' not found`);
        }
    });

    const simQualityEl = document.getElementById('simulationQuality');
    if (simQualityEl) {
        simQualityEl.addEventListener('change', (e) => {
            updateSimulationQuality(e.target.value);
        });
    }
}

function updateHairSettings(settingKey, value, elementType) {
    console.log(`Updating hair setting: ${settingKey} = ${value}`);
    let needsReinitialize = false;
    let needsMaterialUpdate = false;

    switch (settingKey) {
        case 'density':
            hairBrushSettings.density = parseFloat(value);
            break;
        case 'numSegments':
            hairBrushSettings.numSegments = parseInt(value);
            needsReinitialize = true;
            break;
        case 'segmentLength':
            hairBrushSettings.segmentLength = parseFloat(value);
            needsReinitialize = true;
            break;
        case 'curl':
            hairBrushSettings.curl = parseFloat(value);
            needsReinitialize = true;
            break;
        case 'stiffness':
            hairBrushSettings.stiffness = parseFloat(value);
            break;
        case 'wave':
            hairBrushSettings.wave = parseFloat(value);
            needsReinitialize = true;
            break;
        case 'frizz':
            hairBrushSettings.frizz = parseFloat(value);
            needsReinitialize = true;
            break;
        case 'clumpSize':
            hairBrushSettings.clumpSize = parseInt(value);
            needsReinitialize = true;
            break;
        case 'randomness':
            hairBrushSettings.randomness = parseFloat(value);
            needsReinitialize = true;
            break;
        case 'hairColor':
            hairBrushSettings.hairColor = new THREE.Color(value).getHex();
            needsMaterialUpdate = true;
            break;
        case 'specularColor':
            hairBrushSettings.specularColor = new THREE.Color(value).getHex();
            needsMaterialUpdate = true;
            break;
        default:
            if (hairBrushSettings.hasOwnProperty(settingKey)) {
                if (elementType === 'range' || typeof hairBrushSettings[settingKey] === 'number') {
                    hairBrushSettings[settingKey] = parseFloat(value);
                } else {
                    hairBrushSettings[settingKey] = value;
                }
            }
    }

    if (needsReinitialize) {
        updateHairStrands();
    }
    if (needsMaterialUpdate) {
        updateHairMaterial();
    }
    updateHairMesh();
}

function updateHairMaterial() {
    const targetMesh = hairBrushSettings.useInstancing ? hairInstanceMesh : hairMesh;
    if (targetMesh && targetMesh.material) {
        targetMesh.material.uniforms.hairColor.value.setHex(hairBrushSettings.hairColor);
        targetMesh.material.uniforms.specularColor.value.setHex(hairBrushSettings.specularColor);
        targetMesh.material.needsUpdate = true;
        console.log("Hair material updated");
    }
}

function updateHairStrands() {
    console.log("Re-initializing all hair strands...");
    hairBrushSettings.hairStrands.forEach(strand => {
        strand.initializeSegments();
    });
    updateHairMesh();
}

function updateSimulationQuality(value) {
    switch (value) {
        case 'low':
            hairBrushSettings.batchSize = 25;
            hairBrushSettings.updateInterval = 200;
            break;
        case 'medium':
            hairBrushSettings.batchSize = 50;
            hairBrushSettings.updateInterval = 100;
            break;
        case 'high':
            hairBrushSettings.batchSize = 100;
            hairBrushSettings.updateInterval = 50;
            break;
    }
}

function onCharacterSculptStart(event) {
    if (event.button !== 0) return;
    if (!sculptingSphere || !sculptingEnabled) {
        isCharacterSculpting = false;
        hairBrushActive = false;
        return;
    }
    if (!selectedCharacterTool && !hairBrushActive) return;

    isCharacterSculpting = true;
    if (selectedCharacterTool === CHARACTER_TOOLS.HAIR_BRUSH) {
        hairBrushActive = true;
    }
    saveUndoState();
    prevMouseEvent = event;

    const position = getMousePosition(event);
    const normal = getMouseNormal(event);
    if (position && normal) {
        applySculptingTool(event, sculptingSphere.geometry.attributes.position.array, position, normal);
    }
}

function onCharacterSculptMove(event) {
    updateCharacterBrushPreview(event);
    if (!isCharacterSculpting || !sculptingEnabled) return;
    if (!selectedCharacterTool && !hairBrushActive) return;

    const vertices = sculptingSphere.geometry.attributes.position.array;
    const position = getMousePosition(event);
    const normal = getMouseNormal(event);
    if (position && normal) {
        applySculptingTool(event, vertices, position, normal);
    }
}

function onCharacterSculptEnd(event) {
    if (event.button !== 0 && event.type !== 'pointerleave') return;
    if (isCharacterSculpting) {
        if (sculptingSphere && sculptingSphere.geometry.attributes.position) {
            sculptingSphere.geometry.attributes.position.needsUpdate = true;
            sculptingSphere.geometry.computeVertexNormals();
        }
    }
    isCharacterSculpting = false;
    hairBrushActive = false;
    prevMouseEvent = null;
}

function getMousePosition(event) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(getMouseCoords(event), camera);
    const intersects = raycaster.intersectObject(sculptingSphere);
    return intersects.length > 0 ? intersects[0].point : null;
}

function getMouseNormal(event) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(getMouseCoords(event), camera);
    const intersects = raycaster.intersectObject(sculptingSphere);
    return intersects.length > 0 ? intersects[0].face.normal.clone().transformDirection(sculptingSphere.matrixWorld).normalize() : null;
}

function getMouseCoords(event) {
    return new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );
}

function getMouseNormalized(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
}

function applySculptingTool(event, vertices, position, normal) {
    if (!position || !normal) return;
    if (!sculptingEnabled && selectedCharacterTool !== CHARACTER_TOOLS.HAIR_BRUSH) return;
    if (selectedCharacterTool === CHARACTER_TOOLS.HAIR_BRUSH && !hairBrushActive) return;

    switch (selectedCharacterTool) {
        case CHARACTER_TOOLS.FACE_SHAPE:
        case CHARACTER_TOOLS.NOSE_SCULPT:
        case CHARACTER_TOOLS.CHEEK_DEFINITION:
        case CHARACTER_TOOLS.JAW_SCULPT:
        case CHARACTER_TOOLS.FOREHEAD_SHAPE:
        case CHARACTER_TOOLS.CHIN_SCULPT:
        case CHARACTER_TOOLS.TEMPLE_SCULPT:
        case CHARACTER_TOOLS.BROW_RIDGE:
        case CHARACTER_TOOLS.EYE_SOCKET:
        case CHARACTER_TOOLS.LIP_SHAPE:
            sculptVertices(vertices, position, normal);
            break;
        case CHARACTER_TOOLS.SMOOTH:
            smoothVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.PINCH:
            pinchVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.INFLATE:
            inflateVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.CREASE:
            creaseVertices(vertices, position);
            break;
        case CHARACTER_TOOLS.SNAKE_HOOK:
            snakeHookVertices(vertices, position, event);
            break;
        case CHARACTER_TOOLS.HAIR_BRUSH:
            applyHairBrush(event);
            break;
        default:
            if (hairBrushActive) {
                applyHairBrush(event);
            }
    }
}

function sculptVertices(vertices, position, normal) {
    if (!sculptingEnabled) return;
    const symmetry = document.getElementById('symmetryToggle')?.checked || false;
    const axis = document.getElementById('symmetryAxis')?.value || 'x';

    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);

        if (distance < characterBrushSize) {
            const falloff = 1 - Math.pow(distance / characterBrushSize, characterBrushFalloff);
            const displacement = normal.clone().multiplyScalar(characterBrushStrength * falloff);

            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;

            if (symmetry) {
                applySymmetry(vertices, i, axis);
            }
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

function smoothVertices(vertices, position) {
    if (!sculptingEnabled) return;
    const tempVertices = new Float32Array(vertices);
    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        if (vertex.distanceTo(position) < characterBrushSize) {
            let avg = new THREE.Vector3();
            let count = 0;

            for (let j = 0; j < vertices.length; j += 3) {
                if (i !== j) {
                    const neighbor = new THREE.Vector3(vertices[j], vertices[j + 1], vertices[j + 2]);
                    if (neighbor.distanceTo(vertex) < characterBrushSize * 0.5) {
                        avg.add(neighbor);
                        count++;
                    }
                }
            }

            if (count > 0) {
                avg.divideScalar(count);
                const falloff = 1 - (vertex.distanceTo(position) / characterBrushSize);
                tempVertices[i] = THREE.MathUtils.lerp(vertices[i], avg.x, falloff * 0.5);
                tempVertices[i + 1] = THREE.MathUtils.lerp(vertices[i + 1], avg.y, falloff * 0.5);
                tempVertices[i + 2] = THREE.MathUtils.lerp(vertices[i + 2], avg.z, falloff * 0.5);
            }
        }
    }
    vertices.set(tempVertices);
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

function pinchVertices(vertices, position) {
    if (!sculptingEnabled) return;
    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);

        if (distance < characterBrushSize) {
            const falloff = 1 - (distance / characterBrushSize);
            const direction = position.clone().sub(vertex).normalize();
            const displacement = direction.multiplyScalar(characterBrushStrength * falloff * 0.5);

            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

function inflateVertices(vertices, position) {
    if (!sculptingEnabled) return;
    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);

        if (distance < characterBrushSize) {
            const falloff = 1 - (distance / characterBrushSize);
            const direction = vertex.clone().normalize();
            const displacement = direction.multiplyScalar(characterBrushStrength * falloff);

            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

function creaseVertices(vertices, position) {
    if (!sculptingEnabled) return;
    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = vertex.distanceTo(position);

        if (distance < characterBrushSize) {
            const falloff = 1 - Math.pow(distance / characterBrushSize, 2);
            const direction = vertex.clone().sub(position).normalize();
            const displacement = direction.multiplyScalar(-characterBrushStrength * falloff);

            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
}

function snakeHookVertices(vertices, position, currentEvent) {
    if (!sculptingEnabled) return;
    if (!prevMouseEvent) {
        prevMouseEvent = currentEvent;
        return;
    }

    const mousePos = getMouseCoords(currentEvent);
    const prevMousePos = getMouseCoords(prevMouseEvent);
    const movement = new THREE.Vector2().subVectors(mousePos, prevMousePos);

    if (movement.lengthSq() === 0) {
        prevMouseEvent = currentEvent;
        return;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mousePos, camera);
    const intersects = raycaster.intersectObject(sculptingSphere);
    if (!intersects.length) {
        prevMouseEvent = currentEvent;
        return;
    }
    const newTargetPoint = intersects[0].point;
    const dragVector = newTargetPoint.clone().sub(position);

    for (let i = 0; i < vertices.length; i += 3) {
        const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distanceToBrushOrigin = vertex.distanceTo(position);

        if (distanceToBrushOrigin < characterBrushSize) {
            const falloff = Math.pow(1 - Math.min(distanceToBrushOrigin / characterBrushSize, 1.0), characterBrushFalloff);
            const displacementAmount = characterBrushStrength * falloff * movement.length() * 20;
            const displacement = dragVector.clone().normalize().multiplyScalar(displacementAmount);

            vertices[i] += displacement.x;
            vertices[i + 1] += displacement.y;
            vertices[i + 2] += displacement.z;
        }
    }
    sculptingSphere.geometry.attributes.position.needsUpdate = true;
    sculptingSphere.geometry.computeVertexNormals();
    prevMouseEvent = currentEvent;
}

function applySymmetry(vertices, index, axis) {
    const vertex = new THREE.Vector3(vertices[index], vertices[index + 1], vertices[index + 2]);
    const symmetricVertex = vertex.clone();

    switch (axis) {
        case 'x':
            symmetricVertex.x = -symmetricVertex.x;
            break;
        case 'y':
            symmetricVertex.y = -symmetricVertex.y;
            break;
        case 'z':
            symmetricVertex.z = -symmetricVertex.z;
            break;
    }

    let closestIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
        const v = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        const distance = v.distanceTo(symmetricVertex);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }

    if (closestIndex >= 0) {
        vertices[closestIndex] = symmetricVertex.x;
        vertices[closestIndex + 1] = symmetricVertex.y;
        vertices[closestIndex + 2] = symmetricVertex.z;
    }
}

function saveUndoState() {
    const vertices = sculptingSphere.geometry.attributes.position.array.slice();
    characterUndoStack.push({
        vertices: vertices,
        hairStrands: hairBrushSettings.hairStrands.map(strand => ({
            rootPosition: strand.rootPosition.clone(),
            normal: strand.normal.clone(),
            segments: strand.segments.map(seg => ({
                position: seg.position.clone(),
                velocity: seg.velocity.clone()
            }))
        }))
    });
    if (characterUndoStack.length > 50) characterUndoStack.shift();
    characterRedoStack = [];
}

function undo() {
    if (characterUndoStack.length === 0) return;

    const currentState = {
        vertices: sculptingSphere.geometry.attributes.position.array.slice(),
        hairStrands: hairBrushSettings.hairStrands.map(strand => ({
            rootPosition: strand.rootPosition.clone(),
            normal: strand.normal.clone(),
            segments: strand.segments.map(seg => ({
                position: seg.position.clone(),
                velocity: seg.velocity.clone()
            }))
        }))
    };

    characterRedoStack.push(currentState);
    const state = characterUndoStack.pop();

    sculptingSphere.geometry.attributes.position.array.set(state.vertices);
    sculptingSphere.geometry.attributes.position.needsUpdate = true;

    hairBrushSettings.hairStrands = state.hairStrands.map(data => {
        const strand = new HairStrand(data.rootPosition, data.normal);
        strand.segments = data.segments.map(seg => ({
            position: seg.position.clone(),
            velocity: seg.velocity.clone(),
            prevPosition: seg.position.clone(),
            force: new THREE.Vector3(),
            mass: 1,
            locked: false,
            normal: data.normal.clone()
        }));
        return strand;
    });
    updateHairMesh();
}

function redo() {
    if (characterRedoStack.length === 0) return;

    const currentState = {
        vertices: sculptingSphere.geometry.attributes.position.array.slice(),
        hairStrands: hairBrushSettings.hairStrands.map(strand => ({
            rootPosition: strand.rootPosition.clone(),
            normal: strand.normal.clone(),
            segments: strand.segments.map(seg => ({
                position: seg.position.clone(),
                velocity: seg.velocity.clone()
            }))
        }))
    };

    characterUndoStack.push(currentState);
    const state = characterRedoStack.pop();

    sculptingSphere.geometry.attributes.position.array.set(state.vertices);
    sculptingSphere.geometry.attributes.position.needsUpdate = true;

    hairBrushSettings.hairStrands = state.hairStrands.map(data => {
        const strand = new HairStrand(data.rootPosition, data.normal);
        strand.segments = data.segments.map(seg => ({
            position: seg.position.clone(),
            velocity: seg.velocity.clone(),
            prevPosition: seg.position.clone(),
            force: new THREE.Vector3(),
            mass: 1,
            locked: false,
            normal: data.normal.clone()
        }));
        return strand;
    });
    updateHairMesh();
}

function initRenderer() {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 1);
    console.log("Renderer initialized with shadowMap and toneMapping");
}

function initCharacterSculpting() {
    initRenderer();
    addSculptingSphere();
    console.log("Scene children:", scene.children.map(c => c.name || c.uuid));
    animate();
}

initCharacterSculpting();

document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'z') undo();
    if (event.ctrlKey && event.key === 'y') redo();
});