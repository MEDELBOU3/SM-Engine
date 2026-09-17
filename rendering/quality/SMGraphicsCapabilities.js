(function (global) {
    'use strict';

    class SMGraphicsCapabilities {
        constructor(renderer = global.renderer) {
            this.renderer =
                renderer || null;

            this.report = null;
        }

        detect() {
            const renderer =
                this.renderer;

            const gl =
                renderer?.getContext?.();

            const caps =
                renderer?.capabilities;

            const info = {
                webgl2:
                    !!caps?.isWebGL2,

                precision:
                    caps?.precision ||
                    null,

                maxTextures:
                    caps?.maxTextures ||
                    null,

                maxVertexTextures:
                    caps?.maxVertexTextures ||
                    null,

                maxTextureSize:
                    caps?.maxTextureSize ||
                    null,

                maxCubemapSize:
                    caps?.maxCubemapSize ||
                    null,

                maxAnisotropy:
                    caps
                        ?.getMaxAnisotropy
                        ?.() ||
                    1,

                floatFragmentTextures:
                    !!caps
                        ?.floatFragmentTextures,

                maxSamples:
                    caps?.maxSamples ||
                    0,

                rendererString:
                    null,

                vendorString:
                    null
            };

            if (gl) {
                const ext =
                    gl.getExtension(
                        'WEBGL_debug_renderer_info'
                    );

                if (ext) {
                    info.rendererString =
                        gl.getParameter(
                            ext.UNMASKED_RENDERER_WEBGL
                        );

                    info.vendorString =
                        gl.getParameter(
                            ext.UNMASKED_VENDOR_WEBGL
                        );
                }
            }

            info.recommendedTier =
                this._recommendTier(
                    info
                );

            this.report =
                Object.freeze(
                    info
                );

            return this.report;
        }

        _recommendTier(info) {
            const texture =
                info.maxTextureSize || 0;

            const samples =
                info.maxSamples || 0;

            if (
                info.webgl2 &&
                texture >= 16384 &&
                samples >= 4
            ) {
                return 'high';
            }

            if (
                info.webgl2 &&
                texture >= 8192
            ) {
                return 'medium';
            }

            return 'low';
        }

        diagnostics() {
            const report =
                this.report ||
                this.detect();

            console.log(
                '[SMGraphicsCapabilities]',
                report
            );

            return report;
        }
    }

    global.SMGraphicsCapabilities =
        SMGraphicsCapabilities;
})(window);
