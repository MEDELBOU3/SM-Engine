/**
 * ual2_integration_patch.js
 * ─────────────────────────────────────────────────────────────────────────
 * HOW TO WIRE UAL2 MOTION MATCHING INTO YOUR EXISTING CODE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * STEP 1 — Load the scripts (order matters):
 *
 *   <script src="assets/models/ual2/manifest.js"></script>
 *   <script src="ual2_motion_matching.js"></script>
 *   <!-- …your existing engine scripts… -->
 *
 *
 * STEP 2 — Inside loader.load('…/Xbot.glb', (gltf) => { … }) add ONE line:
 *
 *   loader.load('https://threejs.org/examples/models/gltf/Xbot.glb', (gltf) => {
 *
 *       // … your existing code …
 *       player.init(gltf, collidableMeshes, obstaclesGroup, ground);
 *       player.model = gltf.scene;
 *       addObjectToScene(player.model, 'Player');
 *
 *       // ★ ADD THIS LINE ★
 *       window.ual2Engine = integrateUAL2(player, scene, { hudHostId: 'gui-container', debug: true });
 *
 *       // … rest of your code …
 *   });
 *
 *
 * STEP 3 — Inside animate() feed the desired movement direction each frame.
 *           Add ONE line inside the `if (isPlayerControlActive && player && tpsCamera)` block:
 *
 *   if (isPlayerControlActive && player && tpsCamera) {
 *       player.update(delta);
 *       tpsCamera.update(delta);
 *
 *       // ★ ADD THIS LINE ★
 *       if (window.ual2Engine) {
 *           const t = player.tempVectors;
 *           window.ual2Engine.externalUpdate(delta, t.moveDirection || new THREE.Vector3(0,0,-1));
 *       }
 *   }
 *
 *
 * STEP 4 — Add animations to your manifest.
 *           Open  assets/models/ual2/manifest.js  and uncomment the entries
 *           that match the FBX files you have.  The engine auto-loads them.
 *
 *   Minimum set for a good result (6 clips):
 *     Idle.fbx · Walk_Forward.fbx · Run_Forward.fbx
 *     Walk_Strafe_Left.fbx · Walk_Strafe_Right.fbx · Jump_Start.fbx
 *
 *   Full recommended set (24+ clips):
 *     All entries in manifest.js
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OPTIONAL — Control the engine at runtime from the console:
 *
 *   window.ual2Engine.setDebug(true/false)      // toggle HUD
 *   window.ual2Engine.footIK.enabled = false    // disable foot IK
 *   window.ual2Engine.enabled = false           // pause engine (player falls back to built-in)
 *
 *   // Force a specific clip (good for testing):
 *   player.forceMotionClip('ual2_run_forward')
 *   player.forceMotionClip('')                  // clear force
 *
 *   // Query current state:
 *   player.getMotionMatchingState()
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW THE SCORING WORKS  (UE5-style cost function)
 *
 *   totalCost = stateCost          × 1.0
 *             + poseFeatureCost    × 2.2    ← fingerprint distance
 *             + trajectoryCost     × 1.8    ← trajectory prediction error
 *             + speedBandPenalty           ← outside tolerance band
 *             + directionPenalty           ← outside tolerance angle
 *             + contextualBoosts           ← start/stop/strafe/backward
 *             - continuityCost     × 0.25  ← reward for staying in clip
 *             - ual2SourceBonus    × 0.08  ← small bonus for UAL2 clips
 *
 *   The clip with the LOWEST score wins and is cross-faded in using
 *   inertialization blending (spring-damped, artefact-free).
 *
 *   Blend spaces activate automatically when the matcher switches between
 *   a walk and a run clip on the same direction (e.g. walk_forward ↔
 *   run_forward), producing a seamless speed ramp rather than a pop.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── Self-contained integration that can be called at any time ─────────────
(function () {
    "use strict";

    /**
     * Convenience wrapper — call once after player.init() returns.
     * Handles the timing of the manifest being already loaded vs still loading.
     */
    function tryAutoIntegrate() {
        const player = window.player;
        const scene  = window.scene;

        if (!player || !scene) {
            // Retry until both exist
            setTimeout(tryAutoIntegrate, 250);
            return;
        }

        if (!player.model) {
            // Player model not yet loaded — wait
            const orig = player.init?.bind(player);
            if (orig) {
                player.init = function (...args) {
                    const r = orig(...args);
                    setTimeout(() => {
                        window.ual2Engine = window.integrateUAL2?.(player, scene, {
                            hudHostId: 'gui-container',
                            debug: true
                        });
                    }, 100);
                    return r;
                };
            }
            return;
        }

        // Player already loaded
        if (!window.ual2Engine && typeof window.integrateUAL2 === 'function') {
            window.ual2Engine = window.integrateUAL2(player, scene, {
                hudHostId: 'gui-container',
                debug: true
            });
        }
    }

    // Run after DOM + scripts are ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryAutoIntegrate, { once: true });
    } else {
        tryAutoIntegrate();
    }

    // Also hook into window load for safety
    window.addEventListener('load', () => {
        if (!window.ual2Engine) tryAutoIntegrate();
    }, { once: true });

})();