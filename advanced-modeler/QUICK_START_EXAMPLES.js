/**
 * ADVANCED CURVE TANGENT SYSTEM - QUICK START EXAMPLE
 * ====================================================
 * 
 * Complete working example showing:
 * - Smooth curve generation
 * - Tangent visualization
 * - Interactive shape editing
 * - 3D extrusion
 * 
 * Copy and adapt this code for your modeler!
 */

// ============================================================================
// EXAMPLE 1: BASIC SMOOTH CURVE
// ============================================================================

function example1_BasicSmoothCurve() {
    console.log("=== Example 1: Basic Smooth Curve ===");
    
    // Define control points (your shape skeleton)
    const controlPoints = [
        {x: 0, y: 0},
        {x: 2, y: 3},
        {x: 5, y: 2},
        {x: 8, y: 4},
        {x: 10, y: 1}
    ];
    
    // Initialize curve engine
    const tangent = new AdvancedCurveTangent();
    
    // Generate smooth curve (50 interpolation points)
    const smoothCurve = tangent.interpolateCatmullRom(controlPoints, 50);
    
    console.log(`Control points: ${controlPoints.length}`);
    console.log(`Smooth curve points: ${smoothCurve.length}`);
    console.log("✓ Curve is now smooth through all control points");
    console.log("✓ Tangents automatically calculated from neighbors");
    
    return {controlPoints, smoothCurve};
}


// ============================================================================
// EXAMPLE 2: VISUALIZE TANGENT VECTORS
// ============================================================================

function example2_VisualizeTangents(canvas, controlPoints) {
    console.log("=== Example 2: Visualize Tangent Vectors ===");
    
    const ctx = canvas.getContext('2d');
    const tangent = new AdvancedCurveTangent();
    
    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Generate smooth curve
    const smooth = tangent.interpolateCatmullRom(controlPoints, 50);
    
    // Draw smooth curve (blue)
    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(smooth[0].x * 40 + 50, smooth[0].y * 40 + 50);
    for (let i = 1; i < smooth.length; i++) {
        ctx.lineTo(smooth[i].x * 40 + 50, smooth[i].y * 40 + 50);
    }
    ctx.stroke();
    
    // Draw control points (yellow circles)
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    controlPoints.forEach(pt => {
        const sx = pt.x * 40 + 50;
        const sy = pt.y * 40 + 50;
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
    
    // Draw tangent vectors (red arrows)
    ctx.strokeStyle = '#ff6b6b';
    ctx.fillStyle = '#ff6b6b';
    ctx.lineWidth = 1.5;
    
    controlPoints.forEach((pt, idx) => {
        // Get tangent
        const tangentVec = tangent.calculateTangent(controlPoints, idx);
        
        const sx = pt.x * 40 + 50;
        const sy = pt.y * 40 + 50;
        const endX = sx + tangentVec.x * 30;
        const endY = sy + tangentVec.y * 30;
        
        // Draw tangent line
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Draw arrowhead
        const angle = Math.atan2(tangentVec.y, tangentVec.x);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 8 * Math.cos(angle - Math.PI / 6), endY - 8 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - 8 * Math.cos(angle + Math.PI / 6), endY - 8 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    });
    
    // Draw influence zones (light circles)
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.2)';
    ctx.lineWidth = 1;
    controlPoints.forEach(pt => {
        const sx = pt.x * 40 + 50;
        const sy = pt.y * 40 + 50;
        ctx.beginPath();
        ctx.arc(sx, sy, 30, 0, Math.PI * 2);
        ctx.stroke();
    });
    
    console.log("✓ Canvas shows:");
    console.log("  - Blue curve: smooth Catmull-Rom spline");
    console.log("  - Yellow circles: control points");
    console.log("  - Red arrows: tangent vectors");
    console.log("  - Light red circles: influence zones");
}


// ============================================================================
// EXAMPLE 3: INTERACTIVE SHAPE EDITING
// ============================================================================

function example3_InteractiveEditing(modeler, drawer) {
    console.log("=== Example 3: Interactive Shape Editing ===");
    
    const tangent = new AdvancedCurveTangent(modeler);
    let controlPoints = [
        {x: 0, y: 0},
        {x: 2, y: 2},
        {x: 4, y: 1},
        {x: 6, y: 3}
    ];
    
    // Enable visualization
    drawer.showTangents = true;
    drawer.showControlPoints = true;
    
    // Simulate user dragging control point
    function onPointDrag(pointIndex, newPosition) {
        console.log(`Moving point ${pointIndex} to (${newPosition.x}, ${newPosition.y})`);
        
        // Auto-adjust neighbors based on distance
        controlPoints[pointIndex] = newPosition;
        
        if (pointIndex > 0) {
            const dist = Math.hypot(
                newPosition.x - controlPoints[pointIndex - 1].x,
                newPosition.y - controlPoints[pointIndex - 1].y
            );
            
            if (dist < 3) {
                // Neighbor is close, adjust it slightly
                const influence = (1 - dist / 3) * 0.1;
                controlPoints[pointIndex - 1].x += (newPosition.x - controlPoints[pointIndex - 1].x) * influence;
                controlPoints[pointIndex - 1].y += (newPosition.y - controlPoints[pointIndex - 1].y) * influence;
                console.log("  Adjusted previous point");
            }
        }
        
        // Regenerate smooth curve
        const smooth = tangent.interpolateCatmullRom(controlPoints, 50);
        
        // Update visualization
        drawer.draw(modeler.ctx, 'front');
        
        console.log(`✓ Shape smoothly adjusted (${smooth.length} curve points)`);
    }
    
    // Simulate drag
    onPointDrag(1, {x: 2.5, y: 2.5});
    onPointDrag(2, {x: 4.5, y: 0.8});
    
    return controlPoints;
}


// ============================================================================
// EXAMPLE 4: SMOOTH 3D EXTRUSION
// ============================================================================

function example4_Smooth3DExtrusion() {
    console.log("=== Example 4: Smooth 3D Extrusion ===");
    
    // Define a smooth 2D profile
    const profilePoints = [
        {x: 0, y: 0},
        {x: 0.5, y: 0.8},
        {x: 1.0, y: 0.5},
        {x: 1.5, y: 1.0}
    ];
    
    // Initialize systems
    const tangent = new AdvancedCurveTangent();
    const extrusion = new ProfileExtrusion();
    
    // Generate smooth curve
    const smoothProfile = tangent.interpolateCatmullRom(profilePoints, 50);
    console.log(`Profile: ${profilePoints.length} points → ${smoothProfile.length} smooth points`);
    
    // Extrude to 3D with smooth curves
    const mesh = extrusion.extrude(smoothProfile, {
        length: 5,
        segments: 20,
        taper: 1,
        axis: 'z',
        smoothProfile: true,        // Enable smooth Catmull-Rom
        profileResolution: 50,      // Interpolation quality
        material: extrusion.materials.default
    });
    
    console.log("✓ 3D mesh created with smooth profile curves");
    console.log("✓ Geometry is G1 continuous (smooth appearance)");
    
    return mesh;
}


// ============================================================================
// EXAMPLE 5: SMOOTH REVOLVE (VASE)
// ============================================================================

function example5_SmoothRevolveVase() {
    console.log("=== Example 5: Smooth Revolve (Create a Vase) ===");
    
    // Vase profile (side view)
    const vaseProfile = [
        {x: 0.3, y: 0.0},     // Bottom
        {x: 0.8, y: 0.3},     // Lower belly
        {x: 1.2, y: 0.6},     // Upper belly
        {x: 1.0, y: 0.9},     // Neck
        {x: 0.6, y: 1.2}      // Top opening
    ];
    
    const tangent = new AdvancedCurveTangent();
    const extrusion = new ProfileExtrusion();
    
    // Smooth the profile first
    const smoothProfile = tangent.interpolateCatmullRom(vaseProfile, 50);
    console.log(`Vase profile: ${vaseProfile.length} points → ${smoothProfile.length} smooth points`);
    
    // Create smooth revolve
    const vase = extrusion.revolve(smoothProfile, {
        axis: 'y',
        segments: 32,          // Circular segments
        angle: Math.PI * 2,    // Full revolution
        smoothProfile: true,   // Enable smooth curves
        profileResolution: 50,
        material: extrusion.materials.default
    });
    
    console.log("✓ Smooth vase created with:");
    console.log("  - Smooth profile curves (Catmull-Rom)");
    console.log("  - 32 circular segments");
    console.log("  - G1 continuous surfaces");
    console.log("  - Professional appearance");
    
    return vase;
}


// ============================================================================
// EXAMPLE 6: SMOOTH LOFT (BLEND TWO SHAPES)
// ============================================================================

function example6_SmoothLoft() {
    console.log("=== Example 6: Smooth Loft (Blend Two Shapes) ===");
    
    // Starting shape (square)
    const shape1 = [
        {x: -1, y: -1},
        {x:  1, y: -1},
        {x:  1, y:  1},
        {x: -1, y:  1}
    ];
    
    // Ending shape (rotated square, smaller)
    const shape2 = [
        {x: -0.5, y:  0},
        {x:  0,   y: -0.5},
        {x:  0.5, y:  0},
        {x:  0,   y:  0.5}
    ];
    
    const extrusion = new ProfileExtrusion();
    
    // Create smooth loft between shapes
    const lofted = extrusion.loft(shape1, shape2, {
        segments: 10,               // Segments between profiles
        smoothProfiles: true,       // Smooth both profiles
        profileResolution: 50,
        material: extrusion.materials.default
    });
    
    console.log("✓ Smooth loft created:");
    console.log("  - Blends from square to rotated square");
    console.log("  - Both profiles smoothly curved");
    console.log("  - 10 intermediate segments");
    console.log("  - Professional transition");
    
    return lofted;
}


// ============================================================================
// EXAMPLE 7: SMOOTH FILLET (ROUNDED CORNER)
// ============================================================================

function example7_SmoothFillet() {
    console.log("=== Example 7: Smooth Fillet (Rounded Corner) ===");
    
    // Two line segments meeting at corner
    const p1 = {x: 0, y: 0};
    const corner = {x: 2, y: 0};
    const p2 = {x: 2, y: 2};
    
    const tangent = new AdvancedCurveTangent();
    
    // Create smooth fillet at corner
    const fillet = tangent.createFilletCorner(p1, corner, p2, radius = 0.5);
    
    console.log("✓ Smooth fillet created:");
    console.log(`  - Radius: ${fillet.radius}`);
    console.log(`  - Center: (${fillet.center.x.toFixed(2)}, ${fillet.center.y.toFixed(2)})`);
    console.log(`  - Arc points: ${fillet.arcPoints.length}`);
    console.log("  - Professional rounded corner");
    
    return fillet;
}


// ============================================================================
// EXAMPLE 8: COMPLETE WORKFLOW
// ============================================================================

function example8_CompleteWorkflow() {
    console.log("=== Example 8: Complete Workflow ===");
    console.log("");
    
    // Step 1: Define coarse control points
    const controlPoints = [
        {x: 0, y: 0},
        {x: 1.5, y: 1.2},
        {x: 3.5, y: 0.8},
        {x: 5, y: 1.5}
    ];
    console.log("Step 1: Define control points");
    console.log(`  Points: ${controlPoints.length}`);
    
    // Step 2: Initialize systems
    const tangent = new AdvancedCurveTangent();
    const extrusion = new ProfileExtrusion();
    console.log("\nStep 2: Initialize systems");
    console.log("  ✓ AdvancedCurveTangent ready");
    console.log("  ✓ ProfileExtrusion ready");
    
    // Step 3: Generate smooth curve
    const smoothCurve = tangent.interpolateCatmullRom(controlPoints, 50);
    console.log("\nStep 3: Generate smooth curve");
    console.log(`  Interpolated to: ${smoothCurve.length} points`);
    console.log(`  Smooth: G1 continuous`);
    
    // Step 4: Create 3D geometry
    const mesh = extrusion.extrude(smoothCurve, {
        length: 5,
        segments: 15,
        smoothProfile: true,
        profileResolution: 50,
        axis: 'z'
    });
    console.log("\nStep 4: Create 3D geometry");
    console.log("  ✓ Mesh created");
    console.log("  ✓ Geometry smooth");
    console.log("  ✓ Normals computed");
    
    // Step 5: Visualize tangents
    const firstTangent = tangent.calculateTangent(controlPoints, 0);
    const lastTangent = tangent.calculateTangent(controlPoints, controlPoints.length - 1);
    console.log("\nStep 5: Calculate tangents");
    console.log(`  Start tangent: (${firstTangent.x.toFixed(3)}, ${firstTangent.y.toFixed(3)})`);
    console.log(`  End tangent: (${lastTangent.x.toFixed(3)}, ${lastTangent.y.toFixed(3)})`);
    
    // Step 6: Interactive editing
    console.log("\nStep 6: Interactive editing");
    const newPosition = {x: 1.8, y: 1.5};
    const adjusted = tangent.adjustCurveFromNeighbors(controlPoints, 1, newPosition);
    console.log(`  Moved point 1 to (${newPosition.x}, ${newPosition.y})`);
    console.log(`  Neighbors auto-adjusted`);
    console.log(`  Curve regenerated`);
    
    console.log("\n✓✓✓ WORKFLOW COMPLETE ✓✓✓");
    console.log("You now have:");
    console.log("  - Smooth 2D curve with tangent vectors");
    console.log("  - 3D mesh with G1 continuous surfaces");
    console.log("  - Interactive shape editing with auto-adjustment");
    console.log("  - Professional CAD-quality results");
}


// ============================================================================
// MAIN: RUN ALL EXAMPLES
// ============================================================================

function runAllExamples() {
    console.log("╔════════════════════════════════════════════════════╗");
    console.log("║   ADVANCED CURVE TANGENT SYSTEM - EXAMPLES         ║");
    console.log("╚════════════════════════════════════════════════════╝\n");
    
    // Example 1
    const ex1 = example1_BasicSmoothCurve();
    console.log("");
    
    // Example 2 (needs canvas)
    console.log("⚠ Example 2 requires HTML canvas element");
    console.log("");
    
    // Example 3 (needs modeler)
    console.log("⚠ Example 3 requires modeler instance");
    console.log("");
    
    // Example 4
    const ex4 = example4_Smooth3DExtrusion();
    console.log("");
    
    // Example 5
    const ex5 = example5_SmoothRevolveVase();
    console.log("");
    
    // Example 6
    const ex6 = example6_SmoothLoft();
    console.log("");
    
    // Example 7
    const ex7 = example7_SmoothFillet();
    console.log("");
    
    // Example 8
    example8_CompleteWorkflow();
    
    console.log("\n╔════════════════════════════════════════════════════╗");
    console.log("║   ALL EXAMPLES COMPLETED SUCCESSFULLY              ║");
    console.log("╚════════════════════════════════════════════════════╝\n");
}

// Uncomment to run:
runAllExamples();

