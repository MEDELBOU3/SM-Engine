(function (global) {
    'use strict';

    class SMImageExporter {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;
            this.smRenderer = options.smRenderer || global.smRenderer || null;
        }

        _resolveCamera(camera = null) {
            return (
                camera ||
                global.SMViewportSystem?.getActivePanel?.()?.camera ||
                global._viewedCamera ||
                global.camera ||
                null
            );
        }

        async exportPNG(options = {}) {
            const renderer = this.renderer || global.renderer;
            const scene = this.scene || global.scene;
            const camera = this._resolveCamera(options.camera);

            if (!renderer || !scene || !camera) {
                throw new Error('[SMImageExporter] renderer, scene and camera are required.');
            }

            const oldPixelRatio = renderer.getPixelRatio?.() || 1;
            const oldWidth = renderer.domElement.width;
            const oldHeight = renderer.domElement.height;
            const oldCssWidth = renderer.domElement.style.width;
            const oldCssHeight = renderer.domElement.style.height;

            const width = Math.max(1, options.width || renderer.domElement.clientWidth || oldWidth || 1920);
            const height = Math.max(1, options.height || renderer.domElement.clientHeight || oldHeight || 1080);
            const pixelRatio = Math.max(1, options.pixelRatio || 1);

            try {
                renderer.setPixelRatio(pixelRatio);
                renderer.setSize(width, height, false);

                if (this.smRenderer?.renderFrame) {
                    this.smRenderer.renderFrame({
                        camera,
                        width,
                        height,
                        renderMode: 'rendered'
                    });
                } else if (global.smRender?.render) {
                    global.smRender.render(camera, 0);
                } else {
                    renderer.render(scene, camera);
                }

                const dataURL = renderer.domElement.toDataURL('image/png');

                if (options.download !== false) {
                    const link = document.createElement('a');
                    link.href = dataURL;
                    link.download = options.filename || `SM_Render_${Date.now()}.png`;
                    link.click();
                }

                return dataURL;
            } finally {
                renderer.setPixelRatio(oldPixelRatio);
                renderer.setSize(
                    Math.max(1, oldWidth / oldPixelRatio),
                    Math.max(1, oldHeight / oldPixelRatio),
                    false
                );

                renderer.domElement.style.width = oldCssWidth;
                renderer.domElement.style.height = oldCssHeight;
            }
        }
    }

    global.SMImageExporter = SMImageExporter;
})(window);
