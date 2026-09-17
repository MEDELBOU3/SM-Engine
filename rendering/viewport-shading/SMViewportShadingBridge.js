(function (global) {
    'use strict';

    class SMViewportShadingBridge {
        constructor(options = {}) {
            this.adapter =
                new global.SMViewportRenderModeAdapter({
                    shading:
                        options.shading ||
                        global.SMViewportShading,

                    renderer:
                        options.renderer ||
                        global.smRenderer,

                    postProcess:
                        options.postProcess ||
                        global.smPostProcessStack
                });

            this.bound = false;

            this._onChanged =
                this._onChanged.bind(
                    this
                );
        }

        initialize() {
            if (
                this.bound
            ) {
                return this;
            }

            global.addEventListener?.(
                'sm:viewport-shading-changed',
                this._onChanged
            );

            global.addEventListener?.(
                'sm:workspace-changed',
                this._onChanged
            );

            this.bound = true;

            this.sync();

            return this;
        }

        _onChanged() {
            this.sync();
        }

        sync() {
            return this.adapter.sync();
        }

        diagnostics() {
            const report = {
                bound:
                    this.bound,

                mode:
                    this.adapter.getMode(),

                shadingController:
                    !!global.SMViewportShading,

                renderer:
                    !!global.smRenderer,

                postProcess:
                    !!global.smPostProcessStack
            };

            console.log(
                '[SMViewportShadingBridge]',
                report
            );

            return report;
        }

        dispose() {
            if (
                !this.bound
            ) {
                return;
            }

            global.removeEventListener?.(
                'sm:viewport-shading-changed',
                this._onChanged
            );

            global.removeEventListener?.(
                'sm:workspace-changed',
                this._onChanged
            );

            this.bound = false;
        }
    }

    function initSMViewportShadingBridge(
        options = {}
    ) {
        if (
            global.smViewportShadingBridge instanceof
            SMViewportShadingBridge
        ) {
            return global.smViewportShadingBridge;
        }

        global.smViewportShadingBridge =
            new SMViewportShadingBridge(
                options
            );

        return global
            .smViewportShadingBridge
            .initialize();
    }

    global.SMViewportShadingBridge =
        SMViewportShadingBridge;

    global.initSMViewportShadingBridge =
        initSMViewportShadingBridge;
})(window);
