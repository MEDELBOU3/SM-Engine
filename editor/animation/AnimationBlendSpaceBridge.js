// SM Engine - AnimationBlendSpaceBridge
(function () {
    function install() {
        const panel = window.AnimationGraphPanel;
        if (!panel || panel.__blendSpaceBridgeInstalled) return false;
        panel.__blendSpaceBridgeInstalled = true;
        const previousCompile = typeof panel.compile === 'function' ? panel.compile.bind(panel) : null;
        panel.compile = function () {
            if (window.AnimationBlendSpaceEditor?.initialized) return window.AnimationBlendSpaceEditor.compile();
            if (window.AnimationStateMachineEditor?.initialized) return window.AnimationStateMachineEditor.save();
            return previousCompile ? previousCompile() : null;
        };
        const previousSave = typeof panel.save === 'function' ? panel.save.bind(panel) : null;
        panel.save = function () {
            if (window.AnimationBlendSpaceEditor?.initialized) return window.AnimationBlendSpaceEditor.save();
            if (window.AnimationStateMachineEditor?.initialized) return window.AnimationStateMachineEditor.save();
            return previousSave ? previousSave() : null;
        };
        const previousVisible = typeof panel.onVisible === 'function' ? panel.onVisible.bind(panel) : null;
        panel.onVisible = function () {
            previousVisible?.();
            if (window.AnimationBlendSpaceEditor?.initialized) window.AnimationBlendSpaceEditor._renderPreview?.();
            if (window.AnimationStateMachineEditor?.initialized) window.AnimationStateMachineEditor.resize?.();
        };
        const previousPlay = typeof panel.playPreview === 'function' ? panel.playPreview.bind(panel) : null;
        panel.playPreview = function () {
            if (window.AnimationBlendSpaceEditor?.initialized) {
                window.AnimationBlendSpaceEditor._renderPreview?.();
                return;
            }
            return previousPlay ? previousPlay() : null;
        };
        console.log('[AnimationBlendSpaceBridge] installed');
        return true;
    }
    function installAssetDragBridge() {
        const root = document.getElementById('global-node-editor-container');
        if (!root || root.dataset.animAssetDragBridge === '1') return;
        root.dataset.animAssetDragBridge = '1';
        root.addEventListener('dragstart', event => {
            const asset = event.target.closest?.('.anim-asset');
            if (!asset) return;
            const clip = asset.dataset.animation || asset.textContent.trim();
            if (!clip) return;
            event.dataTransfer?.setData('text/sm-animation-clip', clip);
            event.dataTransfer?.setData('text/plain', clip);
        });
    }
    const boot = () => {
        install();
        installAssetDragBridge();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
    else setTimeout(boot, 0);
    window.addEventListener('sm:node-editor-tab-changed', boot);
    window.addEventListener('sm:animation-state-machine-open', () => setTimeout(install, 0));
    window.addEventListener('sm:animation-blend-space-open', () => setTimeout(install, 0));
})();