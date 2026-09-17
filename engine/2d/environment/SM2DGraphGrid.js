/**
 * SM Engine — 2D Graph Grid Helper
 *
 * Standalone grid provider for the 2D Game Dev viewport.
 * Load AFTER THREE.js and BEFORE SMWorkspaceManager / animate-loop.js.
 */
(function (global) {
    'use strict';

    if (!global.THREE) {
        console.error('[SM2DGraphGrid] THREE.js is required.');
        return;
    }

    const THREE = global.THREE;

    function makeLine(points, material) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.LineSegments(geometry, material);
        line.frustumCulled = false;
        return line;
    }

    function create(options = {}) {
        const extent = Math.max(10, Number(options.extent) || 100);
        const minorStep = Math.max(0.01, Number(options.minorStep) || 1);
        const majorStep = Math.max(minorStep, Number(options.majorStep) || 10);

        const root = new THREE.Group();
        root.name = 'gameModeGrid2D';
        root.userData = {
            isSystemObject: true,
            isEditorHelper: true,
            is2DGridHelper: true,
            editorOnly: true,
            hideInPlay: true,
            workspaceOnly: '2D_GRID',
            smWorkspaceScope: '2D_GRID',
            selectable: false,
            ignoreInHierarchy: true,
            ignoreInTimeline: true
        };

        const minorMaterial = new THREE.LineBasicMaterial({
            color: 0x6f7f95,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            depthTest: false
        });

        const majorMaterial = new THREE.LineBasicMaterial({
            color: 0x9aabc2,
            transparent: true,
            opacity: 0.48,
            depthWrite: false,
            depthTest: false
        });

        const minorPoints = [];
        const majorPoints = [];

        const count = Math.ceil(extent / minorStep);
        for (let i = -count; i <= count; i++) {
            const v = i * minorStep;
            if (Math.abs(v) > extent + 1e-6) continue;

            const isMajor =
                Math.abs(v / majorStep - Math.round(v / majorStep)) < 1e-6;

            const target = isMajor ? majorPoints : minorPoints;

            // XY plane: Z = 0
            target.push(
                new THREE.Vector3(v, -extent, 0),
                new THREE.Vector3(v, extent, 0),
                new THREE.Vector3(-extent, v, 0),
                new THREE.Vector3(extent, v, 0)
            );
        }

        if (minorPoints.length) {
            const minor = makeLine(minorPoints, minorMaterial);
            minor.name = '2DGrid_Minor';
            minor.renderOrder = 900;
            minor.userData.is2DGridPart = true;
            root.add(minor);
        }

        if (majorPoints.length) {
            const major = makeLine(majorPoints, majorMaterial);
            major.name = '2DGrid_Major';
            major.renderOrder = 901;
            major.userData.is2DGridPart = true;
            root.add(major);
        }

        // X/Y axes.
        const axisXMaterial = new THREE.LineBasicMaterial({
            color: 0xe05050,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            depthTest: false
        });
        const axisYMaterial = new THREE.LineBasicMaterial({
            color: 0x50c050,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            depthTest: false
        });

        const xAxis = makeLine([
            new THREE.Vector3(-extent, 0, 0.01),
            new THREE.Vector3(extent, 0, 0.01)
        ], axisXMaterial);
        xAxis.name = '2DGrid_XAxis';
        xAxis.renderOrder = 902;
        xAxis.userData.is2DGridPart = true;

        const yAxis = makeLine([
            new THREE.Vector3(0, -extent, 0.01),
            new THREE.Vector3(0, extent, 0.01)
        ], axisYMaterial);
        yAxis.name = '2DGrid_YAxis';
        yAxis.renderOrder = 902;
        yAxis.userData.is2DGridPart = true;

        root.add(xAxis, yAxis);

        root.userData.gridConfig = {
            extent,
            minorStep,
            majorStep
        };

        return root;
    }

    function update(root, camera, width, height) {
        if (!root || !camera) return;

        // Keep the helper aligned to the XY world plane.
        root.rotation.set(0, 0, 0);

        // Prevent the grid from disappearing because of normal frustum culling.
        root.traverse(function (child) {
            if (child.isLine || child.isLineSegments) {
                child.frustumCulled = false;
                child.renderOrder = Math.max(Number(child.renderOrder) || 0, 900);
            }
        });

        // Optional adaptive scaling hook.
        // The geometry stays stable; this records the active camera state for
        // other editor systems without changing world coordinates.
        root.userData.activeCamera = camera;
        root.userData.viewportWidth = Math.max(1, Number(width) || 1);
        root.userData.viewportHeight = Math.max(1, Number(height) || 1);
    }

    global.SM2DGraphGrid = {
        version: '1.0.0',
        create,
        update
    };

    console.log('[SM2DGraphGrid] 2D graph grid helper loaded.');
})(window);
