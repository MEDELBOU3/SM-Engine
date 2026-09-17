// SM Engine - PlayerAnimationActionAdapter Registry Patch
(function () {
    function installPatch() {
        const Adapter = window.PlayerAnimationActionAdapter;
        if (!Adapter || Adapter.prototype.__smRegistryPatchInstalled) return false;
        Adapter.prototype.__smRegistryPatchInstalled = true;
        const originalFindClip = Adapter.prototype._findClip;
        Adapter.prototype._findClip = function (name) {
            const registry = window.playerAnimationClipRegistry;
            const clip = registry?.get?.(name);
            if (clip) return clip;
            return originalFindClip ? originalFindClip.call(this, name) : null;
        };
        const originalGetAction = Adapter.prototype.getAction;
        Adapter.prototype.getAction = function (name) {
            const registry = window.playerAnimationClipRegistry;
            const resolved = registry?.resolveKey?.(name) || name;
            let action = originalGetAction ? originalGetAction.call(this, resolved) : null;
            if (action && resolved !== name) this.actions?.set?.(name, action);
            return action;
        };
        console.log('[PlayerAnimationActionAdapter] ClipRegistry patch installed');
        return true;
    }
    if (!installPatch()) {
        const timer = setInterval(() => {
            if (installPatch()) clearInterval(timer);
        }, 100);
        setTimeout(() => clearInterval(timer), 10000);
    }
})();