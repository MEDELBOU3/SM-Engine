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



// ADVANCED MATERIAL PAINTING FUNCTION
function applyAdvancedMaterialPaint(event, isSymmetricCall = false) {
    if (!terrain || !terrain.userData.textureCanvas || !uploadedMaterial) {
        console.error("Missing requirements:", {
            terrain: !!terrain,
            textureCanvas: !!terrain?.userData.textureCanvas,
            uploadedMaterial: !!uploadedMaterial
        });
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
                if (symmetricUV.x < 0 || symmetricUV.x > 1 || symmetricUV.y < 0 || symmetricUV.y > 1) {
                    console.warn("Symmetric UV coordinates out of bounds:", symmetricUV);
                    return;
                }
                const symIntersect = { ...intersect, uv: symmetricUV };
                paintMaterialOnCanvas(symIntersect, true);
            }
        }
        paintMaterialOnCanvas(intersect, isSymmetricCall); // Paint at the primary point
    }
}




/**
function paintMaterialOnCanvas(intersect, isSymmetricCall) {
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
}

 */

function paintMaterialOnCanvas(intersect, isSymmetricCall) {
    console.log("Painting at UV:", intersect.uv, "Symmetric:", isSymmetricCall);
    if (!uploadedMaterial || !uploadedMaterial.complete || uploadedMaterial.naturalWidth === 0) {
        console.warn("Cannot paint: uploadedMaterial is not ready.");
        return;
    }

    const uv = intersect.uv;
    const mainTerrainCtx = terrain.userData.textureContext;
    const mainTerrainCanvas = terrain.userData.textureCanvas;
    const terrainWorldWidth = terrain.geometry.parameters.width;

    const brushPixelRadius = (materialBrushSettings.size / terrainWorldWidth) * mainTerrainCanvas.width;
    console.log("Brush Pixel Radius:", brushPixelRadius);
    if (brushPixelRadius < 1) {
        console.warn("Brush size too small to paint.");
        return;
    }

    const stampDiameter = Math.ceil(brushPixelRadius * 2);
    const canvasX = uv.x * mainTerrainCanvas.width;
    const canvasY = (1 - uv.y) * mainTerrainCanvas.height;
    console.log("Canvas Coordinates:", canvasX, canvasY);

    if (canvasX < 0 || canvasX > mainTerrainCanvas.width || canvasY < 0 || canvasY > mainTerrainCanvas.height) {
        console.warn("Painting coordinates out of bounds.");
        return;
    }

    const stampCanvas = document.createElement('canvas');
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

    const falloffGradient = stampCtx.createRadialGradient(
        brushPixelRadius, brushPixelRadius, 0,
        brushPixelRadius, brushPixelRadius, brushPixelRadius
    );
    const effectiveOpacity = materialBrushSettings.opacity * materialBrushSettings.strength;
    console.log("Effective Opacity:", effectiveOpacity);
    falloffGradient.addColorStop(0, `rgba(0,0,0,${effectiveOpacity})`);
    falloffGradient.addColorStop(Math.max(0, Math.min(1, materialBrushSettings.falloff)), `rgba(0,0,0,${effectiveOpacity})`);
    falloffGradient.addColorStop(1, `rgba(0,0,0,0)`);

    stampCtx.globalCompositeOperation = 'destination-in';
    stampCtx.fillStyle = falloffGradient;
    stampCtx.fillRect(0, 0, stampDiameter, stampDiameter);

    mainTerrainCtx.globalCompositeOperation = materialBrushSettings.blendMode || 'source-over';
    mainTerrainCtx.drawImage(stampCanvas, canvasX - brushPixelRadius, canvasY - brushPixelRadius);
    mainTerrainCtx.globalCompositeOperation = 'source-over';

    terrain.material.map.needsUpdate = true;
    console.log("Painting completed.");
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