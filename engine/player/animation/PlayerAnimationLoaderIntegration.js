// SM Engine - PlayerAnimationLoaderIntegration
(function () {
    const Integration = {
        attempts: 0,
        timer: null,
        install() {
            const registry = window.playerAnimationClipRegistry;
            if (!registry) return false;
            const playerSystem = window.playerSystem || null;
            if (playerSystem) {
                registry.playerSystem = playerSystem;
                registry.player = playerSystem.character || registry.player;
            }
            const loader = registry.resolveLoader?.();
            if (loader) {
                registry.registerLoader(loader);
                registry.ensureLoaded?.();
                if (!this.connected) {
                    this.connected = true;
                    console.log('[PlayerAnimationLoaderIntegration] Existing loader connected');
                }
                return true;
            }
            // SMPlayerSystem creates and owns the canonical loader while init is
            // running. Never start a second FBX load in parallel: it doubles
            // parsing work and keeps the editor black/unresponsive at startup.
            if (playerSystem && (playerSystem.loading || !playerSystem.ready)) {
                return false;
            }
            const legacyPlayer = window.player;
            const character =
                playerSystem?.character ||
                legacyPlayer?.character ||
                ((legacyPlayer?.visual || legacyPlayer?.model) ? legacyPlayer : null);
            const manifest = window.SMPlayerAnimationManifest;
            if (typeof window.SMPlayerAnimationLoader === 'function' && character && manifest) {
                try {
                    const instance = new window.SMPlayerAnimationLoader(manifest, character);
                    window.playerAnimationLoader = instance;
                    if (playerSystem && !playerSystem.animationLoader) playerSystem.animationLoader = instance;
                    if (character && !character.animationLoader) character.animationLoader = instance;
                    registry.registerLoader(instance);
                    instance.loadAll().then(() => {
                        instance.registerEmbeddedIdle?.(character);
                        registry.registerLoader(instance);
                        console.log('[PlayerAnimationLoaderIntegration] Loader created and ready:', instance.clips.size);
                    }).catch(error => console.error('[PlayerAnimationLoaderIntegration] loadAll failed:', error));
                    return true;
                } catch (error) {
                    console.error('[PlayerAnimationLoaderIntegration] Could not create loader:', error);
                }
            }
            return false;
        },
        start() {
            if (this.install()) return;
            this.timer = setInterval(() => {
                this.attempts++;
                if (this.install() || this.attempts > 120) {
                    clearInterval(this.timer);
                    this.timer = null;
                    if (this.attempts > 120) console.warn('[PlayerAnimationLoaderIntegration] Animation loader instance was not found.');
                }
            }, 250);
        }
    };
    window.PlayerAnimationLoaderIntegration = Integration;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Integration.start(), { once: true });
    else Integration.start();
})();
