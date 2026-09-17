(function (global) {
    'use strict';

    class SMVideoRenderer {
        constructor(options = {}) {
            this.renderer = options.renderer || global.renderer || null;
            this.scene = options.scene || global.scene || null;
            this.smRenderer = options.smRenderer || global.smRenderer || null;

            this.rendering = false;
            this.cancelRequested = false;
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

        async render(options = {}) {
            if (this.rendering) {
                throw new Error('[SMVideoRenderer] A render is already running.');
            }

            const renderer = this.renderer || global.renderer;
            const scene = this.scene || global.scene;
            const camera = this._resolveCamera(options.camera);

            if (!renderer || !scene || !camera) {
                throw new Error('[SMVideoRenderer] renderer, scene and camera are required.');
            }

            if (
                typeof renderer.domElement.captureStream !== 'function' ||
                typeof MediaRecorder === 'undefined'
            ) {
                throw new Error('[SMVideoRenderer] MediaRecorder/captureStream is unavailable.');
            }

            const fps = Math.max(1, options.fps || 30);
            const startFrame = Math.max(0, options.startFrame || 0);
            const endFrame = Math.max(startFrame, options.endFrame ?? 60);
            const totalFrames = endFrame - startFrame + 1;

            const mimeCandidates = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm'
            ];

            const mimeType =
                mimeCandidates.find(type =>
                    MediaRecorder.isTypeSupported?.(type)
                ) || '';

            const stream = renderer.domElement.captureStream(fps);
            const chunks = [];

            const recorder = new MediaRecorder(
                stream,
                mimeType
                    ? {
                        mimeType,
                        videoBitsPerSecond:
                            options.videoBitsPerSecond || 12000000
                    }
                    : undefined
            );

            const finished = new Promise(resolve => {
                recorder.onstop = resolve;
            });

            recorder.ondataavailable = event => {
                if (event.data?.size) chunks.push(event.data);
            };

            this.rendering = true;
            this.cancelRequested = false;

            const oldOffline = global.isOfflineRendering;
            const oldPlaying = global.isPlaying;

            global.isOfflineRendering = true;
            global.isPlaying = false;

            try {
                recorder.start();

                const track = stream.getVideoTracks?.()[0];
                const requestFrame =
                    track && typeof track.requestFrame === 'function'
                        ? () => track.requestFrame()
                        : null;

                for (let i = 0; i < totalFrames; i++) {
                    if (this.cancelRequested) break;

                    const frame = startFrame + i;
                    const time = frame / fps;

                    global.updateTimelineTime?.(time);

                    scene.updateMatrixWorld?.(true);
                    camera.updateMatrixWorld?.(true);
                    camera.updateProjectionMatrix?.();

                    if (this.smRenderer?.renderFrame) {
                        this.smRenderer.renderFrame({
                            camera,
                            delta: 1 / fps,
                            time,
                            renderMode: 'rendered'
                        });
                    } else if (global.smRender?.render) {
                        global.smRender.render(camera, 1 / fps);
                    } else {
                        renderer.render(scene, camera);
                    }

                    requestFrame?.();

                    options.onProgress?.({
                        frame,
                        current: i + 1,
                        total: totalFrames,
                        progress: (i + 1) / totalFrames
                    });

                    await new Promise(resolve =>
                        setTimeout(resolve, 1000 / fps)
                    );
                }

                recorder.stop();
                await finished;

                const blob = new Blob(chunks, {
                    type: mimeType || 'video/webm'
                });

                const url = URL.createObjectURL(blob);

                if (options.download !== false) {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = options.filename || `SM_Render_${Date.now()}.webm`;
                    link.click();
                }

                return {
                    blob,
                    url,
                    mimeType
                };
            } finally {
                this.rendering = false;
                this.cancelRequested = false;

                global.isOfflineRendering = oldOffline;
                global.isPlaying = oldPlaying;

                stream.getTracks?.().forEach(track => track.stop?.());
            }
        }

        cancel() {
            this.cancelRequested = true;
        }
    }

    global.SMVideoRenderer = SMVideoRenderer;
})(window);
