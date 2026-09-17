(function () {
    'use strict';

    class SMAICommandExecutor {
        constructor(registry = window.smAIToolRegistry, policy = window.smAIPermissionPolicy) {
            this.registry = registry;
            this.policy = policy;
        }

        async execute(functionCall, options = {}) {
            const name = String(functionCall?.name || '');
            const args = functionCall?.args && typeof functionCall.args === 'object'
                ? functionCall.args
                : {};
            const tool = this.registry?.get?.(name);
            if (!tool) return { ok: false, error: `Unknown AI tool: ${name}` };

            const permission = await this.policy.authorize(
                tool,
                args,
                options.requestPermission
            );
            if (!permission.allowed) {
                return { ok: false, denied: true, error: permission.reason, tool: name };
            }

            window.dispatchEvent?.(new CustomEvent('sm:ai-tool-start', {
                detail: { name, args, permission: permission.level }
            }));
            try {
                const value = await tool.execute(args, {
                    scene: window.scene,
                    selectedObject: window.selectedObject,
                    camera: window.camera,
                    renderer: window.renderer,
                    history: window.historyManager
                });
                const result = value && typeof value === 'object' ? value : { value };
                window.dispatchEvent?.(new CustomEvent('sm:ai-tool-complete', {
                    detail: { name, args, result }
                }));
                return { ok: true, tool: name, ...result };
            } catch (error) {
                console.error(`[SM AI] Tool ${name} failed:`, error);
                return { ok: false, tool: name, error: error?.message || String(error) };
            }
        }
    }

    window.SMAICommandExecutor = SMAICommandExecutor;
    window.smAICommandExecutor = window.smAICommandExecutor || new SMAICommandExecutor();
}());
