/**
 * Local Animation Manifest Loader
 * Automatically discovers and loads FBX animations from the assets/offline-cdn/fbx-animations folder
 */

(async function initializeLocalAnimationLibrary() {
    console.log('[Animation Loader] Starting local animation library initialization...');

    try {
        // 1. Load the manifest
        const response = await fetch('assets/animations-manifest.json');
        if (!response.ok) {
            console.warn('[Animation Loader] Could not load animations manifest:', response.status);
            return;
        }

        const manifest = await response.json();
        console.log('[Animation Loader] Manifest loaded:', manifest.packName);

        // 2. Store as global fallback
        window.LocalAnimationManifest = manifest;

        // 3. Make it available to motion matching system
        // This will be picked up when the player initializes
        window._loadLocalAnimationManifest = async function(player) {
            if (!player || !player.motionMatching) {
                console.warn('[Animation Loader] Player not ready for manifest injection');
                return false;
            }

            console.log('[Animation Loader] Injecting local manifest into player...');
            player.motionMatching.manifest = manifest;
            
            // Queue the manifest to be loaded
            if (typeof player._queueMotionLibraryLoad === 'function') {
                player._queueMotionLibraryLoad();
            }

            return true;
        };

        // 4. Helper: Check which animation files actually exist
        window._verifyAnimationFiles = async function() {
            console.log('[Animation Loader Verification] Checking for animation files...');
            const basePath = manifest.root || 'assets/offline-cdn/fbx-animations/';
            const animations = manifest.animations || [];

            for (const anim of animations) {
                const fullPath = basePath + anim.path;
                try {
                    const response = await fetch(fullPath, { method: 'HEAD' });
                    const exists = response.ok;
                    console.log(`[Animation Loader Verification] ${anim.name}: ${exists ? '✓ FOUND' : '✗ NOT FOUND'} (${fullPath})`);
                } catch (error) {
                    console.log(`[Animation Loader Verification] ${anim.name}: ✗ NOT FOUND (${fullPath})`);
                }
            }
        };

        console.log('[Animation Loader] Local animation library ready');
        console.log(`[Animation Loader] Found ${manifest.animations?.length || 0} animations defined in manifest`);
        console.log('[Animation Loader] Run window._verifyAnimationFiles() in console to check which files exist');

    } catch (error) {
        console.error('[Animation Loader] Error initializing local animation library:', error);
    }
})();
