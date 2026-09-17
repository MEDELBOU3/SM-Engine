// ============================================================
//engine/globals.js
//
// Shared engine state.
// IMPORTANT: this must be the FIRST engine script loaded.
// Because these are plain (non-module) <script> tags, every
// top-level `let`/`const`/`function` declared here lives in the
// same shared global lexical scope as every other engine file
// loaded after it, and can be read/written from those files
// without any window.* prefix (exactly like the original
// monolithic index.js did internally). Splitting the file only
// works because of this - do not change these to `const` inside
// a wrapper function/IIFE or the other engine files will lose
// access to them.
// ============================================================

// Declare engine flow variables (if not already handled by app-bootstrap.js)
if (typeof initStarted === 'undefined') window.initStarted = false;
if (typeof initCompleted === 'undefined') window.initCompleted = false;

// --- Core Three.js / engine objects ---
let scene, camera, renderer, clock, controls, composer, mixer, orthographicCamera;
let naniteSystem, performanceManager, player, waterSystem, lumenSystem, nodeEditor;
let ground, obstaclesGroup, physicsSystem, playerGraphEditor, horseController;
let raycaster, mouse, transformControls, historyManager, dynamicResolutionManager;
let explosionManager, advancedGrid, previewLine, isDragging = false, transformControlsActive = false, isLocked = false;
let selectedObject, modelingGrid;
var objects = window.objects || (window.objects = []);
let smFrameCounter = 0;
let smLastFpsUpdate = performance.now();
let smFramesSinceFpsUpdate = 0;
let smResizeRaf = 0;
let infiniteGrid;
let currentViewMode = 'perspective';

// --- Extra state that used to live as local const/let deep inside
//     the old init() closure. Hoisted here so the extracted helper
//     files (player loader, motion-matching sample, lighting, etc.)
//     can see/update the same values that the orchestrator
//     (index.js) sets during startup. ---
let mainRendererContainer;
let collidableMeshes = [];
let tpsCamera;
let distanceMarkers;
let controlHint;
let isPlayerControlActive = false;
window.isPlayerControlActive = isPlayerControlActive;

// Course/floor constants (used by the grid/material + physics helpers)
let unitSize = 100;
let gridSize = 2000;

function installHemisphereLightDedupe(sceneRef) {
    if (!sceneRef || window.__smHemisphereDedupeScene === sceneRef) return;
    window.__smHemisphereDedupeScene = sceneRef;
    window.dedupeHemisphereLights = function dedupeHemisphereLights(options = {}) {
        const { preserveCustomLights = true } = options;
        const allHemis = [];
        sceneRef.traverse(obj => { if (obj && obj.isHemisphereLight) allHemis.push(obj); });
        if (allHemis.length === 0) return null;

        const keep = window.skyLightingSystem?.hemiLight
            || sceneRef.getObjectByName?.('SkyHemiLight')
            || sceneRef.getObjectByName?.('GameHemiLight')
            || allHemis.find(light => !!light?.userData?.keepForSky)
            || allHemis.find(light => !!light?.userData?.ws_gameLight)
            || allHemis.find(light => !!light?.userData?.isSystemObject)
            || allHemis[0];

        if (keep) {
            keep.name = 'SkyHemiLight';
            keep.userData = keep.userData || {};
            keep.userData.isSystemObject = true;
            keep.userData.ignoreInTimeline = true;
            keep.userData.keepForSky = true;
            const isManagedWorkspaceLight =
                keep === window.skyLightingSystem?.hemiLight ||
                keep.userData.isGameplaySample === true ||
                keep.userData.workspaceOnly === 'GAMEPLAY_SAMPLE' ||
                keep.userData.ws_gameLight === true ||
                keep.userData.ws_terrainLight === true;
            if (typeof keep.intensity === 'number' && !isManagedWorkspaceLight) {
                keep.intensity = Math.min(keep.intensity || 0.45, 0.55);
            }
        }

        const hasDefaultOrSystemIdentity = (light) => {
            const name = String(light?.name || '').trim();
            return (
                !name ||
                /^HemisphereLight([._\s-]?\d+)?$/i.test(name) ||
                name === 'GameHemiLight' ||
                name === 'SkyHemiLight' ||
                !!light?.userData?.isSystemObject ||
                !!light?.userData?.keepForSky ||
                !!light?.userData?.ws_gameLight
            );
        };
        // Gameplay Sample owns a complete lighting rig. Keep its hemisphere
        // light in the scene while the sample is hidden so a later
        // Terrain/Game Development -> Gameplay Sample switch restores the
        // same brightness as a freshly opened sample workspace.
        const isGameplaySampleLight = (light) =>
            light?.userData?.isGameplaySample === true ||
            light?.userData?.workspaceOnly === 'GAMEPLAY_SAMPLE';

        let removed = 0;
        allHemis.forEach(light => {
            if (
                light !== keep &&
                light.parent &&
                !isGameplaySampleLight(light) &&
                (!preserveCustomLights || hasDefaultOrSystemIdentity(light))
            ) {
                light.parent.remove(light);
                light.dispose?.();
                removed++;
            }
        });

        if (removed && typeof window.updateHierarchy === 'function') {
            window.updateHierarchy();
        }
        return keep;
    };
}

// Prevent "Identifier already declared" errors if unified-modeling-system.js is also loaded
try {
    if (typeof vertexHelpers === 'undefined') {
        window.vertexHelpers = new THREE.Group();
        window.edgeHelpers = new THREE.Group();
        window.faceHelpers = new THREE.Group();
    }
} catch (e) { console.warn("Helpers already initialized"); }
