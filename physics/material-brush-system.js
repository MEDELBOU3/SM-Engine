// Material Brush System for Terrain Painting
let materialBrushSettings = {
    size: 1.5,
    strength: 0.5,
    falloff: 0.7,
    pattern: 'uniform',
    rotation: 0,
    scale: 1.0,
    opacity: 1.0,
    blendMode: 'normal'
};


let uploadedMaterial = null;      // This will be the HTMLImageElement for painting
let materialPreviewTexture = null;// THREE.Texture version for the 3D brush cursor

// New: Brush preview mesh for 3D cursor
let brushPreviewMesh;


function createOrUpdate3DBrushPreview() {
    if (brushPreviewMesh) {
        scene.remove(brushPreviewMesh);
        brushPreviewMesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose(); // Dispose maps if they are unique to this preview
                child.material.dispose();
            }
        });
    }

    brushPreviewMesh = new THREE.Group(); // Make it a Group

    // 1. The Material Plane (shows the actual material texture)
    const materialPlaneGeo = new THREE.PlaneGeometry(1, 1); // Base size 1x1, will be scaled
    const materialPlaneMat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
    });
    const materialPlane = new THREE.Mesh(materialPlaneGeo, materialPlaneMat);
    materialPlane.name = "materialPlane"; // For easy access
    brushPreviewMesh.add(materialPlane);

    // 2. Outer Ring (Brush Boundary / Max Size)
    const outerRingGeo = new THREE.RingGeometry(0.98, 1, 64); // Inner radius, outer radius, segments
    const outerRingMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, // Or a distinct preview color
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.name = "outerRing";
    // outerRing.rotation.x = -Math.PI / 2; // Already handled by group rotation
    brushPreviewMesh.add(outerRing);

    // 3. Inner Circle/Ring (Falloff Start Indicator)
    const falloffIndicatorGeo = new THREE.RingGeometry(0.48, 0.5, 64); // Example: representing a falloff point
    // OR: new THREE.CircleGeometry(0.5, 64) if you want a solid inner disc
    const falloffIndicatorMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
    });
    const falloffIndicator = new THREE.Mesh(falloffIndicatorGeo, falloffIndicatorMat);
    falloffIndicator.name = "falloffIndicator";
    // falloffIndicator.rotation.x = -Math.PI / 2;
    brushPreviewMesh.add(falloffIndicator);


    brushPreviewMesh.rotation.x = -Math.PI / 2; // Align group with horizontal terrain
    brushPreviewMesh.visible = false;
    scene.add(brushPreviewMesh);
}

// Update brush preview with advanced features
function update3DBrushPreviewOnMouseMove(event, forceVisible = false) {
    if (!terrain || !brushPreviewMesh || !brushPreviewMesh.getObjectByName) return; // Check children too if it's a group

     
    const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrain);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        brushPreviewMesh.position.copy(intersect.point).add(intersect.face.normal.multiplyScalar(0.01));

        const materialPlane = brushPreviewMesh.getObjectByName("materialPlane");
        const outerRing = brushPreviewMesh.getObjectByName("outerRing");
        const falloffIndicator = brushPreviewMesh.getObjectByName("falloffIndicator"); // Or innerCircle
        const directionIndicator = brushPreviewMesh.getObjectByName("directionIndicator"); // If you add one

        // --- Default state: Hide all optional components ---
        if (materialPlane) materialPlane.visible = false;
        if (directionIndicator) directionIndicator.visible = false;
        // Keep outerRing and falloffIndicator as they might be common

        if (selectedTool === TOOLS.MATERIAL_PAINT) {
            if (materialPlane) {
                materialPlane.visible = true;
                materialPlane.material.map = materialPreviewTexture;
                materialPlane.material.color.set(0xffffff);
                materialPlane.material.opacity = materialBrushSettings.opacity * 0.6;
                // ... (texture repeat for scale)
                materialPlane.material.needsUpdate = true;
            }
            if (outerRing) {
                outerRing.material.color.set(0xffffff); // White for material brush outline
                outerRing.material.opacity = 0.5;
                outerRing.material.needsUpdate = true;
            }
            if (falloffIndicator) {
                // falloffIndicator.scale.set(materialBrushSettings.falloff, materialBrushSettings.falloff, 1);
                // ... update falloffIndicator for material brush
            }
            brushPreviewMesh.scale.set(materialBrushSettings.size, materialBrushSettings.size, 1);
            brushPreviewMesh.rotation.z = THREE.MathUtils.degToRad(materialBrushSettings.rotation);

        } else if (selectedTool && selectedTool !== TOOLS.TEXTURE_PAINT) { // Sculpting tools
            if (outerRing) {
                outerRing.material.color.set(0x4A90E2); // Blue for sculpting
                outerRing.material.opacity = 0.3;
                outerRing.material.needsUpdate = true;
            }
            if (falloffIndicator) {
                // falloffIndicator.scale.set(brushFalloff, brushFalloff, 1); // Using general sculpt falloff
                // ... update falloffIndicator for sculpt brush
            }
            // if (directionIndicator && (selectedTool === TOOLS.PINCH || selectedTool === TOOLS.RIDGE /* etc */)) {
            //    directionIndicator.visible = true;
            // }
            brushPreviewMesh.scale.set(window.brushSize || 1.5, window.brushSize || 1.5, 1); // Use general sculpt brushSize
            brushPreviewMesh.rotation.z = 0; // Reset rotation for most sculpt tools
        } else { // No specific tool or texture paint (which might have no 3D preview or a simpler one)
            if (outerRing) outerRing.visible = false;
            if (falloffIndicator) falloffIndicator.visible = false;
        }

        brushPreviewMesh.visible = forceVisible || !!selectedTool; // Show if any tool is selected
    } else {
        brushPreviewMesh.visible = false;
    }
}

function updateHTMLMaterialPreview() {
    if (!uploadedMaterial) {
        const canvas = document.getElementById('materialPreview');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear if no material
        return;
    }

    const canvas = document.getElementById('materialPreview');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Fit image into preview canvas while maintaining aspect ratio
    const hRatio = canvas.width / uploadedMaterial.width;
    const vRatio = canvas.height / uploadedMaterial.height;
    const ratio = Math.min(hRatio, vRatio);
    const centerShift_x = (canvas.width - uploadedMaterial.width * ratio) / 2;
    const centerShift_y = (canvas.height - uploadedMaterial.height * ratio) / 2;
    ctx.drawImage(uploadedMaterial, 0, 0, uploadedMaterial.width, uploadedMaterial.height,
                  centerShift_x, centerShift_y, uploadedMaterial.width * ratio, uploadedMaterial.height * ratio);

    // Update the THREE.Texture for the 3D brush cursor
    if (materialPreviewTexture) {
        materialPreviewTexture.dispose();
    }
    materialPreviewTexture = new THREE.Texture(uploadedMaterial);
    materialPreviewTexture.needsUpdate = true;
}


function applyBrushPatternOnStamp(stampCtx, stampCanvas, radiusPixels) {
    // Ensure this function uses stampCtx and works with radiusPixels
    switch (materialBrushSettings.pattern) {
        case 'noise':
            const noiseCanvas = document.createElement('canvas');
            noiseCanvas.width = stampCanvas.width;
            noiseCanvas.height = stampCanvas.height;
            const noiseCtx = noiseCanvas.getContext('2d');
            const noiseData = noiseCtx.createImageData(stampCanvas.width, stampCanvas.height);
            for (let i = 0; i < noiseData.data.length; i += 4) {
                const value = Math.random() * 255 * materialBrushSettings.strength; // Use strength here potentially
                noiseData.data[i] = value;
                noiseData.data[i + 1] = value;
                noiseData.data[i + 2] = value;
                noiseData.data[i + 3] = 255; // Noise pattern is opaque, falloff handles transparency
            }
            noiseCtx.putImageData(noiseData, 0, 0);
            stampCtx.globalCompositeOperation = 'multiply'; // Or another blend for noise
            stampCtx.drawImage(noiseCanvas, 0, 0);
            stampCtx.globalCompositeOperation = 'source-atop'; // To keep original texture shape if noise applied after texture
            break;
        case 'radial':
            // Radial pattern could mean the texture itself fades radially
            // or it's a pattern applied on top.
            // If it's a pattern ON TOP, draw it. If it's how the main texture fades,
            // the main falloff gradient already does this.
            // Let's assume it's an additive/multiplicative radial pattern.
            const radialGradient = stampCtx.createRadialGradient(
                radiusPixels, radiusPixels, 0,
                radiusPixels, radiusPixels, radiusPixels
            );
            radialGradient.addColorStop(0, 'white'); // Affects existing pixels
            radialGradient.addColorStop(1, 'rgba(0,0,0,0.5)'); // Example: darkens edges
            stampCtx.globalCompositeOperation = 'multiply';
            stampCtx.fillStyle = radialGradient;
            stampCtx.fillRect(0, 0, stampCanvas.width, stampCanvas.height);
            break;
        // Add custom pattern implementation as needed
    }
     // Important: Reset composite operation if pattern was applied to avoid affecting subsequent draws
    stampCtx.globalCompositeOperation = 'source-over'; // Or 'source-atop' if texture already drawn
}


// ADVANCED MATERIAL PAINTING FUNCTION
function applyAdvancedMaterialPaint(event, isSymmetricCall = false) {
    if (!terrain || !terrain.userData.textureCanvas || !uploadedMaterial) {
            if (!uploadedMaterial) console.warn('No material texture selected for painting.');
        return;
    }

    /*const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );*/
    const mouse = getMouseNormalized(event, renderer.domElement);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrain);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (!intersect.uv) {
            console.error("Intersection has no UV coordinates! Ensure terrain geometry has UVs.");
            return;
        }

        // Handle symmetry for texture painting (conceptual)
        if (!isSymmetricCall && symmetryEnabled && terrain.geometry.attributes.uv) {
            const originalUV = intersect.uv.clone();
            let symmetricUV = null;
            if (symmetryAxis === 'x') { // Assuming standard plane UVs [0,1]
                symmetricUV = originalUV.clone();
                symmetricUV.x = 1.0 - originalUV.x;
            } else if (symmetryAxis === 'y') { // Might affect V
                symmetricUV = originalUV.clone();
                symmetricUV.y = 1.0 - originalUV.y;
            }
            // Z-axis symmetry not directly applicable to 2D UVs in this simple way.

            if (symmetricUV) {
                // Create a synthetic intersect for the symmetric paint call
                const symIntersect = { ...intersect, uv: symmetricUV };
                paintMaterialOnCanvas(symIntersect, true); // Call the core logic
            }
        }
        paintMaterialOnCanvas(intersect, isSymmetricCall); // Paint at the primary point
    }
}


/*function paintMaterialOnCanvas(intersect, isSymmetricCall) {
      if (!uploadedMaterial) {
        console.warn('paintMaterialOnCanvas called, but no uploadedMaterial is set. Cannot paint.');
        return;
    }
    // Also check if the image is complete (fully loaded and decoded)
    if (!uploadedMaterial.complete || uploadedMaterial.naturalWidth === 0) {
        console.warn('paintMaterialOnCanvas called, but uploadedMaterial is not complete or has no dimensions. Src:', uploadedMaterial.src.substring(0,100));
        // It might be that the paint event fires before image.onload fully completes in some edge cases
        // or if the image file was invalid.
        return;
    }
    console.log('[paintMaterialOnCanvas] Attempting to paint with material:', uploadedMaterial.src.substring(0,100) + '...');

    const uv = intersect.uv;
    const mainTerrainCtx = terrain.userData.textureContext;
    const mainTerrainCanvas = terrain.userData.textureCanvas;

    // --- START DEBUGGING ---
    console.log('--- Painting Material on Canvas ---');
    console.log('Brush Settings:', JSON.parse(JSON.stringify(materialBrushSettings))); // Deep copy for logging
    console.log('Uploaded Material:', uploadedMaterial ? `width: ${uploadedMaterial.width}, height: ${uploadedMaterial.height}` : 'null');
    // --- END DEBUGGING ---

    const terrainGeoParams = terrain.geometry.parameters;
    const terrainWorldWidth = terrainGeoParams.width;
    const brushPixelRadius = (materialBrushSettings.size / terrainWorldWidth) * mainTerrainCanvas.width;

    // --- START DEBUGGING ---
    console.log('Brush Pixel Radius:', brushPixelRadius);
    // --- END DEBUGGING ---

    if (brushPixelRadius < 0.5) {
        console.log('Brush too small, returning.');
        return;
    }

    const canvasX = uv.x * mainTerrainCanvas.width;
    const canvasY = (1 - uv.y) * mainTerrainCanvas.height;

    const stampCanvas = document.createElement('canvas');
    const stampDiameter = Math.ceil(brushPixelRadius * 2);
    stampCanvas.width = stampDiameter;
    stampCanvas.height = stampDiameter;
    const stampCtx = stampCanvas.getContext('2d');

    stampCtx.save();
    stampCtx.translate(brushPixelRadius, brushPixelRadius);
    stampCtx.rotate(THREE.MathUtils.degToRad(materialBrushSettings.rotation));
    stampCtx.scale(materialBrushSettings.scale, materialBrushSettings.scale);
    stampCtx.drawImage(
        uploadedMaterial,
        -brushPixelRadius / materialBrushSettings.scale,
        -brushPixelRadius / materialBrushSettings.scale,
        stampDiameter / materialBrushSettings.scale,
        stampDiameter / materialBrushSettings.scale
    );
    stampCtx.restore();

    // --- START DEBUGGING ---
    // console.log('Stamp after material draw:', stampCanvas.toDataURL()); // This can be very verbose for large stamps
    // --- END DEBUGGING ---

    if (materialBrushSettings.pattern !== 'uniform') {
        applyBrushPatternOnStamp(stampCtx, stampCanvas, brushPixelRadius);
        stampCtx.globalCompositeOperation = 'source-over';
        // --- START DEBUGGING ---
        // console.log('Stamp after pattern:', stampCanvas.toDataURL());
        // --- END DEBUGGING ---
    }

    const falloffGradient = stampCtx.createRadialGradient(
        brushPixelRadius, brushPixelRadius, 0,
        brushPixelRadius, brushPixelRadius, brushPixelRadius
    );
    const effectiveOpacity = materialBrushSettings.opacity * materialBrushSettings.strength;
    console.log(`[paintMaterialOnCanvas] Effective Opacity: ${effectiveOpacity} (Opacity: ${materialBrushSettings.opacity}, Strength: ${materialBrushSettings.strength})`);
    const innerColor = `rgba(0,0,0, ${effectiveOpacity})`;
    const outerColor = `rgba(0,0,0, 0)`;
    const falloffStart = Math.max(0, Math.min(1, materialBrushSettings.falloff));

    // --- START DEBUGGING ---
    console.log('Effective Opacity for Falloff:', effectiveOpacity, 'Falloff Start:', falloffStart);
    // --- END DEBUGGING ---

    falloffGradient.addColorStop(0, innerColor);
    falloffGradient.addColorStop(falloffStart, innerColor);
    falloffGradient.addColorStop(1, outerColor);

    stampCtx.globalCompositeOperation = 'destination-in';
    stampCtx.fillStyle = falloffGradient;
    stampCtx.fillRect(0, 0, stampDiameter, stampDiameter);
    stampCtx.globalCompositeOperation = 'source-over';

    // --- START DEBUGGING ---
    // console.log('Stamp after falloff:', stampCanvas.toDataURL());
    if (stampDiameter > 0) { // Only log if stamp exists
      try {
        // Only log small data URLs or a portion if too large, to avoid console flooding
        // For quick check, see if it's just transparent
        let isTransparent = true;
        const imgData = stampCtx.getImageData(0, 0, stampCanvas.width, stampCanvas.height);
        for (let i = 3; i < imgData.data.length; i += 4) {
            if (imgData.data[i] > 0) { isTransparent = false; break; }
        }
        console.log('Stamp after falloff is transparent:', isTransparent);
        if (!isTransparent && stampCanvas.width <= 128 && stampCanvas.height <= 128) { // Only if reasonably small
            console.log('Stamp after falloff (data URL):', stampCanvas.toDataURL());
        } else if (!isTransparent) {
            console.log('Stamp after falloff has content (too large to display data URL).');
        }


      } catch (e) {
        console.error("Error getting stampCanvas data URL:", e);
      }
    }
    // --- END DEBUGGING ---


    mainTerrainCtx.globalCompositeOperation = materialBrushSettings.blendMode;
    // --- START DEBUGGING ---
    console.log(`Drawing stamp to main canvas at X:${canvasX - brushPixelRadius}, Y:${canvasY - brushPixelRadius} with blend: ${mainTerrainCtx.globalCompositeOperation}`);
    // --- END DEBUGGING ---
    mainTerrainCtx.drawImage(
        stampCanvas,
        canvasX - brushPixelRadius,
        canvasY - brushPixelRadius
    );
    mainTerrainCtx.globalCompositeOperation = 'source-over';
    terrain.material.map.needsUpdate = true;
    console.log('--- Material paint finished, map needsUpdate set ---');
}*/

function paintMaterialOnCanvas(intersect) {
    // --- 1. Pre-flight Checks ---
    if (!uploadedMaterial || !uploadedMaterial.complete || uploadedMaterial.naturalWidth === 0) {
        console.warn('Cannot paint: uploadedMaterial is not ready.');
        return;
    }

    const uv = intersect.uv;
    const mainTerrainCtx = terrain.userData.textureContext;
    const mainTerrainCanvas = terrain.userData.textureCanvas;
    const terrainGeoParams = terrain.geometry.parameters;
    const terrainWorldWidth = terrainGeoParams.width;

    // --- 2. Calculate Brush Size in Pixels ---
    const brushPixelRadius = (materialBrushSettings.size / terrainWorldWidth) * mainTerrainCanvas.width;
    const stampDiameter = Math.ceil(brushPixelRadius * 2);
    if (stampDiameter < 1) return; // Brush is too small to draw anything

    // The center point on the main canvas where we'll draw our stamp
    const canvasX = uv.x * mainTerrainCanvas.width;
    const canvasY = (1 - uv.y) * mainTerrainCanvas.height;

    // --- 3. Prepare the Stamp Canvas ---
    const stampCanvas = document.createElement('canvas');
    stampCanvas.width = stampDiameter;
    stampCanvas.height = stampDiameter;
    const stampCtx = stampCanvas.getContext('2d');

    // --- 4. Draw the Rotated, Scaled Material onto the Stamp ---
    stampCtx.save();
    stampCtx.translate(brushPixelRadius, brushPixelRadius); // Go to center of stamp
    stampCtx.rotate(THREE.MathUtils.degToRad(materialBrushSettings.rotation));
    stampCtx.scale(materialBrushSettings.scale, materialBrushSettings.scale);
    stampCtx.drawImage(
        uploadedMaterial,
        -brushPixelRadius / materialBrushSettings.scale, // Draw centered on the new origin
        -brushPixelRadius / materialBrushSettings.scale,
        stampDiameter / materialBrushSettings.scale,
        stampDiameter / materialBrushSettings.scale
    );
    stampCtx.restore();

    // (Optional: You can apply patterns here using a composite operation)
    // applyBrushPatternOnStamp(stampCtx, stampCanvas, brushPixelRadius);

    // --- 5. Apply the Falloff Mask (This is the "magic" step) ---
    const falloffGradient = stampCtx.createRadialGradient(
        brushPixelRadius, brushPixelRadius, 0, // Inner circle
        brushPixelRadius, brushPixelRadius, brushPixelRadius // Outer circle
    );

    // Strength and Opacity combine to control the final alpha of the brush
    const effectiveOpacity = materialBrushSettings.opacity * materialBrushSettings.strength;
    const innerColor = `rgba(0,0,0, ${effectiveOpacity})`;
    const outerColor = `rgba(0,0,0, 0)`;
    const falloffStart = Math.max(0, Math.min(1, materialBrushSettings.falloff));

    falloffGradient.addColorStop(0, innerColor);
    falloffGradient.addColorStop(falloffStart, innerColor); // Hard edge until the falloff value
    falloffGradient.addColorStop(1, outerColor);           // Fade to transparent

    // 'destination-in' means "keep the parts of the destination (our material) that overlap with the source (our gradient)".
    // This effectively uses the gradient as an alpha mask for the material we just drew.
    stampCtx.globalCompositeOperation = 'destination-in';
    stampCtx.fillStyle = falloffGradient;
    stampCtx.fillRect(0, 0, stampDiameter, stampDiameter);
    
    // --- 6. Draw the Final Stamp onto the Main Terrain Texture ---
    // Reset composite operation before drawing on the main canvas
    mainTerrainCtx.globalCompositeOperation = materialBrushSettings.blendMode;
    mainTerrainCtx.drawImage(
        stampCanvas,
        canvasX - brushPixelRadius, // Position the stamp correctly
        canvasY - brushPixelRadius
    );
    
    // IMPORTANT: Reset the main context's blend mode for other operations
    mainTerrainCtx.globalCompositeOperation = 'source-over'; 
    
    terrain.material.map.needsUpdate = true; // Tell Three.js to re-upload the texture to the GPU
}





// Pattern Application
function applyBrushPattern(ctx, canvas, radius) {
    switch (materialBrushSettings.pattern) {
        case 'noise':
            const noiseCanvas = document.createElement('canvas');
            noiseCanvas.width = canvas.width;
            noiseCanvas.height = canvas.height;
            const noiseCtx = noiseCanvas.getContext('2d');
            const noiseData = noiseCtx.createImageData(canvas.width, canvas.height);
            for (let i = 0; i < noiseData.data.length; i += 4) {
                const value = Math.random() * 255;
                noiseData.data[i] = value;
                noiseData.data[i + 1] = value;
                noiseData.data[i + 2] = value;
                noiseData.data[i + 3] = 255;
            }
            noiseCtx.putImageData(noiseData, 0, 0);
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(noiseCanvas, 0, 0);
            break;
        case 'radial':
            const radialGradient = ctx.createRadialGradient(
                radius, radius, 0,
                radius, radius, radius
            );
            radialGradient.addColorStop(0, 'white');
            radialGradient.addColorStop(1, 'black');
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = radialGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            break;
        // Add custom pattern implementation as needed
    }
}

// Blend Mode Application
function applyBlendMode(ctx, mode) {
    switch (mode) {
        case 'multiply':
            ctx.globalCompositeOperation = 'multiply';
            break;
        case 'overlay':
            ctx.globalCompositeOperation = 'overlay';
            break;
        case 'add':
            ctx.globalCompositeOperation = 'lighter';
            break;
        default:
            ctx.globalCompositeOperation = 'source-over';
    }
}


let textureUndoStack = [];
let textureRedoStack = [];
const MAX_TEXTURE_UNDO_STATES = 20;

function saveTextureStateForUndo() {
    if (!terrain || !terrain.userData.textureCanvas) return;
    const canvas = terrain.userData.textureCanvas;
    textureUndoStack.push(canvas.toDataURL()); // Save as base64 image data
    textureRedoStack.length = 0; // Clear redo stack

    if (textureUndoStack.length > MAX_TEXTURE_UNDO_STATES) {
        textureUndoStack.shift();
    }
    console.log("Texture state saved. Undo stack:", textureUndoStack.length);
}

function undoTexturePaint() {
    if (textureUndoStack.length <= 1) { // Keep at least one initial state or prevent undoing too far
        console.log("No more texture states to undo or at initial state.");
        if(textureUndoStack.length === 1 && textureRedoStack.length === 0) { // if only one state, move it to redo
            textureRedoStack.push(textureUndoStack.pop());
        }
        // Optionally restore a blank or default texture if stack becomes empty
        return;
    }
    const prevStateDataUrl = textureUndoStack.pop();
    if (prevStateDataUrl) {
         textureRedoStack.push(terrain.userData.textureCanvas.toDataURL()); // Save current state for redo

        const img = new Image();
        img.onload = () => {
            const ctx = terrain.userData.textureContext;
            ctx.clearRect(0, 0, terrain.userData.textureCanvas.width, terrain.userData.textureCanvas.height);
            ctx.drawImage(img, 0, 0);
            terrain.material.map.needsUpdate = true;
            console.log("Texture paint undone. Redo stack:", textureRedoStack.length);
        };
        img.src = prevStateDataUrl; // This is the state we are restoring
    }
}

function redoTexturePaint() {
    if (textureRedoStack.length === 0) {
        console.log("No texture states to redo.");
        return;
    }
    const nextStateDataUrl = textureRedoStack.pop();
    if (nextStateDataUrl) {
        textureUndoStack.push(terrain.userData.textureCanvas.toDataURL()); // Save current for undo

        const img = new Image();
        img.onload = () => {
            const ctx = terrain.userData.textureContext;
            ctx.clearRect(0, 0, terrain.userData.textureCanvas.width, terrain.userData.textureCanvas.height);
            ctx.drawImage(img, 0, 0);
            terrain.material.map.needsUpdate = true;
            console.log("Texture paint redone. Undo stack:", textureUndoStack.length);
        };
        img.src = nextStateDataUrl;
    }
}

function initializePaintEventListeners() {
    // Tool selection
    document.getElementById('materialPaint').addEventListener('click', () => {
        selectedTool = TOOLS.MATERIAL_PAINT;
        console.log("Material Paint tool selected");
        // Ensure brush preview is updated if it was hidden
        if(brushPreviewMesh) brushPreviewMesh.visible = !!uploadedMaterial;
         // Save initial texture state if it's the first time painting
        if (textureUndoStack.length === 0 && terrain && terrain.userData.textureCanvas) {
            saveTextureStateForUndo();
        }
    });

    // Settings listeners
    document.getElementById('materialBrushSize').addEventListener('input', e => materialBrushSettings.size = parseFloat(e.target.value));
    document.getElementById('materialStrength').addEventListener('input', e => materialBrushSettings.strength = parseFloat(e.target.value));
    document.getElementById('materialFalloff').addEventListener('input', e => materialBrushSettings.falloff = parseFloat(e.target.value));
    document.getElementById('materialRotation').addEventListener('input', e => materialBrushSettings.rotation = parseFloat(e.target.value)); // Ensure this is range or number
    document.getElementById('materialScale').addEventListener('input', e => materialBrushSettings.scale = parseFloat(e.target.value));
    document.getElementById('materialOpacity').addEventListener('input', e => materialBrushSettings.opacity = parseFloat(e.target.value));
    document.getElementById('materialPattern').addEventListener('change', e => materialBrushSettings.pattern = e.target.value);
    document.getElementById('materialBlendMode').addEventListener('change', e => materialBrushSettings.blendMode = e.target.value);

    // Mouse/Pointer events on renderer.domElement (from your original code, adapted)
    renderer.domElement.addEventListener('pointerdown', (event) => {
        /*if (event.button !== 0) return; // Only left click
        
        if (selectedTool === TOOLS.MATERIAL_PAINT && uploadedMaterial) {
            isPaintingOrSculpting = true;
            saveTextureStateForUndo(); // Save state BEFORE painting stroke begins
            applyAdvancedMaterialPaint(event);
        } */
        if (event.button !== 0) return; // Only left click

        if (selectedTool === TOOLS.MATERIAL_PAINT && uploadedMaterial) {
            isPaintingOrSculpting = true;
            // SAVE STATE HERE, AT THE START OF THE STROKE
            saveTextureStateForUndo(); 
            applyAdvancedMaterialPaint(event);
        }
        
        else if (selectedTool && selectedTool !== TOOLS.MATERIAL_PAINT && selectedTool !== TOOLS.TEXTURE_PAINT /* other sculpt tools */) {
            isPaintingOrSculpting = true;
            // saveSculptStateForUndo(); // If you have separate undo for sculpt
            // applySculpting(event);
        }
    });

    renderer.domElement.addEventListener('pointermove', (event) => {
        // Call your existing updateBrushPreview OR the new update3DBrushPreviewOnMouseMove
        update3DBrushPreviewOnMouseMove(event, isPaintingOrSculpting);

        if (isPaintingOrSculpting && selectedTool === TOOLS.MATERIAL_PAINT) {
            applyAdvancedMaterialPaint(event);
        }
        /*if (isPaintingOrSculpting) {
            if (selectedTool === TOOLS.MATERIAL_PAINT && uploadedMaterial) {
                applyAdvancedMaterialPaint(event);
            } else if (selectedTool && selectedTool !== TOOLS.MATERIAL_PAINT && selectedTool !== TOOLS.TEXTURE_PAINT) {
                // applySculpting(event);
            }
        }*/
    });

    renderer.domElement.addEventListener('pointerup', () => {
        if (isPaintingOrSculpting) {
            isPaintingOrSculpting = false;
             // update3DBrushPreviewOnMouseMove(event, false); // event might not be available here
            if (brushPreviewMesh) brushPreviewMesh.visible = (selectedTool === TOOLS.MATERIAL_PAINT && !!uploadedMaterial); // Keep visible if tool active
        }
    });
    renderer.domElement.addEventListener('pointerleave', () => {
        if (brushPreviewMesh && !isPaintingOrSculpting) {
             brushPreviewMesh.visible = false;
        }
    });

     // Symmetry (assuming you have HTML for these)
    document.getElementById('symmetryToggle').addEventListener('change', e => symmetryEnabled = e.target.checked);
    document.getElementById('symmetryAxisSelector').addEventListener('change', e => symmetryAxis = e.target.value);
}