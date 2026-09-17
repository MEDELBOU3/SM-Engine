(function (global) {
    'use strict';

    class SMViewportRenderModeAdapter {
        constructor(options = {}) {
            this.shading =
                options.shading ||
                global.SMViewportShading ||
                null;

            this.renderer =
                options.renderer ||
                global.smRenderer ||
                null;

            this.postProcess =
                options.postProcess ||
                global.smPostProcessStack ||
                null;
        }

        getMode() {
            return (
                this.shading
                    ?.getMode?.() ||
                'solid'
            );
        }

        sync() {
            const mode =
                this.getMode();

            /*
             * Current viewport controller already owns:
             * - Solid material overrides
             * - Wireframe
             * - Material Preview world/material restoration
             *
             * This adapter only maps the viewport mode to the
             * new render architecture.
             */

            if (mode === 'rendered') {
                if (
                    this.postProcess
                ) {
                    this.postProcess.enabled =
                        true;
                }
            } else {
                if (
                    this.postProcess
                ) {
                    this.postProcess.enabled =
                        false;
                }
            }

            return mode;
        }

        renderFrame(options = {}) {
            const mode =
                this.sync();

            const renderer =
                this.renderer ||
                global.smRenderer;

            if (!renderer?.renderFrame) {
                return false;
            }

            return renderer.renderFrame({
                ...options,

                renderMode:
                    mode === 'rendered'
                        ? 'rendered'
                        : 'editor'
            });
        }
    }

    global.SMViewportRenderModeAdapter =
        SMViewportRenderModeAdapter;
})(window);
