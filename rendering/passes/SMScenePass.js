(function (global) {
    'use strict';

    class SMScenePass extends global.SMRenderPass {
        constructor(options = {}) {
            super('ScenePass', {
                order: 100,
                enabled: options.enabled !== false
            });
        }

        onExecute(context) {
            const { renderer, scene, camera } = context;
            if (!renderer || !scene || !camera) return false;

            const water = global.waterSystem;
            if (
                water?.isCameraUnderwater?.(camera) &&
                typeof water.render === 'function'
            ) {
                const handled = water.render(scene, camera);
                if (handled !== false) {
                    context.flags.sceneRendered = true;
                    context.flags.renderPath = 'water';
                    return true;
                }
            }

            const wantsPostProcess =
                context.renderMode === 'rendered' &&
                context.outputTarget == null &&
                global.smPostProcessStack?.enabled !== false &&
                typeof global.smRender?.render === 'function';

            if (wantsPostProcess) {
                global.smRender.render(
                    camera,
                    context.delta,
                    { forcePostProcess: true }
                );
                context.flags.sceneRendered = true;
                context.flags.renderPath = 'post-process';
                return true;
            }

            renderer.render(scene, camera);
            context.flags.sceneRendered = true;
            context.flags.renderPath = 'direct';
            return true;
        }
    }

    global.SMScenePass = SMScenePass;
})(window);
