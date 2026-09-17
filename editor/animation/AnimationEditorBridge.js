// SM Engine - AnimationEditorBridge
(function () {
    function patchAnimationPanel() {
        const panel = window.AnimationGraphPanel;
        if (!panel || panel.__stateMachineBridgeInstalled) return;
        panel.__stateMachineBridgeInstalled = true;
        const originalCompile = typeof panel.compile === 'function' ? panel.compile.bind(panel) : null;
        panel.compile = function () {
            if (window.AnimationStateMachineEditor?.initialized) {
                const result = window.AnimationStateMachineEditor.save();
                if (result?.success === false) console.error('[AnimationEditorBridge] State Machine compile failed:', result.errors);
                return result;
            }
            return originalCompile ? originalCompile() : null;
        };
        const originalSave = typeof panel.save === 'function' ? panel.save.bind(panel) : null;
        panel.save = function () {
            if (window.AnimationStateMachineEditor?.initialized) return window.AnimationStateMachineEditor.save();
            return originalSave ? originalSave() : null;
        };
        const originalVisible = typeof panel.onVisible === 'function' ? panel.onVisible.bind(panel) : null;
        panel.onVisible = function () {
            originalVisible?.();
            if (window.AnimationStateMachineEditor?.initialized) window.AnimationStateMachineEditor.resize?.();
        };
        console.log('[AnimationEditorBridge] State Machine integration installed');
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(patchAnimationPanel, 0), { once: true });
    } else {
        setTimeout(patchAnimationPanel, 0);
    }
    window.addEventListener('sm:node-editor-tab-changed', () => patchAnimationPanel());
})();