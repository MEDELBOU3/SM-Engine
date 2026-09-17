(function (global) {
    'use strict';

    class SMOfflineRenderer {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;
            this.smRenderer = options.smRenderer || global.smRenderer || null;

            this.imageExporter = new global.SMImageExporter({
                renderer: this.renderer,
                scene: this.scene,
                smRenderer: this.smRenderer
            });

            this.videoRenderer = new global.SMVideoRenderer({
                renderer: this.renderer,
                scene: this.scene,
                smRenderer: this.smRenderer
            });

            this.initialized = false;
        }

        initialize() {
            this.initialized = true;
            return this;
        }

        renderImage(options = {}) {
            if (!this.initialized) this.initialize();
            return this.imageExporter.exportPNG(options);
        }

        renderVideo(options = {}) {
            if (!this.initialized) this.initialize();
            return this.videoRenderer.render(options);
        }

        cancelVideoRender() {
            this.videoRenderer.cancel();
        }

        diagnostics() {
            const report = {
                initialized: this.initialized,
                imageExporter: !!this.imageExporter,
                videoRenderer: !!this.videoRenderer,
                videoRendering: this.videoRenderer.rendering
            };

            console.log('[SMOfflineRenderer][Diagnostics]', report);
            return report;
        }
    }

    function initSMOfflineRenderer(options = {}) {
        if (global.smOfflineRenderer instanceof SMOfflineRenderer) {
            return global.smOfflineRenderer;
        }

        global.smOfflineRenderer = new SMOfflineRenderer({
            renderer: options.renderer || global.renderer,
            scene: options.scene || global.scene,
            smRenderer: options.smRenderer || global.smRenderer
        });

        return global.smOfflineRenderer.initialize();
    }

    global.SMOfflineRenderer = SMOfflineRenderer;
    global.initSMOfflineRenderer = initSMOfflineRenderer;
})(window);
