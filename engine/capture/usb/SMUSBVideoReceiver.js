(function () {
    'use strict';

    class SMUSBVideoReceiver {
        constructor(options = {}) {
            this.type = 'usb-phone';

            this.options = {
                mode: 'uvc',
                width: 1920,
                height: 1080,
                frameRate: 30,
                audio: false,
                mirror: false,
                jpegCanvasWidth: 1280,
                jpegCanvasHeight: 720,
                ...options
            };

            this.mode =
                this.options.mode;

            this.stream = null;
            this.videoElement = null;
            this.canvas = null;
            this.context = null;
            this.texture = null;

            this.state = 'idle';
            this.lastFrameTime = 0;
            this.framesReceived = 0;
            this.framesDropped = 0;

            this._frameDecodeBusy = false;
        }

        isUVCSupported() {
            return !!navigator.mediaDevices?.getUserMedia;
        }

        async start(options = {}) {
            const merged = {
                ...this.options,
                ...options
            };

            this.mode =
                merged.mode ||
                this.mode ||
                'uvc';

            if (this.mode === 'companion') {
                return this._startCompanionCanvas(
                    merged
                );
            }

            return this._startUVC(
                merged
            );
        }

        async _startUVC(options = {}) {
            if (!this.isUVCSupported()) {
                throw new Error(
                    'UVC mode requires navigator.mediaDevices.getUserMedia().'
                );
            }

            await this.stop();

            this.mode = 'uvc';
            this.state = 'starting';

            const videoConstraints = {};

            if (options.deviceId) {
                videoConstraints.deviceId = {
                    exact: options.deviceId
                };
            }

            if (options.width) {
                videoConstraints.width = {
                    ideal:
                        Number(options.width)
                };
            }

            if (options.height) {
                videoConstraints.height = {
                    ideal:
                        Number(options.height)
                };
            }

            if (options.frameRate) {
                videoConstraints.frameRate = {
                    ideal:
                        Number(options.frameRate)
                };
            }

            const constraints = {
                video: videoConstraints,
                audio:
                    options.audio === true
            };

            this.stream =
                await navigator.mediaDevices.getUserMedia(
                    constraints
                );

            this.videoElement =
                await this._createHiddenVideo(
                    this.stream,
                    {
                        mirror:
                            options.mirror === true
                    }
                );

            this.state = 'active';

            const track =
                this.stream.getVideoTracks()[0] ||
                null;

            return {
                stream:
                    this.stream,
                videoElement:
                    this.videoElement,
                track,
                settings:
                    track?.getSettings?.() ||
                    null,
                mode:
                    'uvc'
            };
        }

        async _startCompanionCanvas(options = {}) {
            await this.stop();

            this.mode = 'companion';
            this.state = 'starting';

            const width =
                Math.max(
                    2,
                    Number(
                        options.jpegCanvasWidth ||
                        options.width
                    ) || 1280
                );

            const height =
                Math.max(
                    2,
                    Number(
                        options.jpegCanvasHeight ||
                        options.height
                    ) || 720
                );

            const fps =
                Math.max(
                    1,
                    Number(
                        options.frameRate
                    ) || 30
                );

            this.canvas =
                document.createElement('canvas');

            this.canvas.width =
                width;

            this.canvas.height =
                height;

            this.canvas.style.display =
                'none';

            this.context =
                this.canvas.getContext(
                    '2d',
                    {
                        alpha: false,
                        desynchronized: true
                    }
                );

            if (!this.context) {
                throw new Error(
                    'Could not create 2D context for USB companion video.'
                );
            }

            document.body?.appendChild(
                this.canvas
            );

            if (!this.canvas.captureStream) {
                throw new Error(
                    'Companion JPEG mode requires canvas.captureStream().'
                );
            }

            this.stream =
                this.canvas.captureStream(
                    fps
                );

            this.videoElement =
                await this._createHiddenVideo(
                    this.stream,
                    {
                        mirror:
                            options.mirror === true
                    }
                );

            this.state = 'active';

            return {
                stream:
                    this.stream,
                videoElement:
                    this.videoElement,
                track:
                    this.stream.getVideoTracks()[0] ||
                    null,
                settings: {
                    width,
                    height,
                    frameRate: fps
                },
                mode:
                    'companion'
            };
        }

        async _createHiddenVideo(
            stream,
            options = {}
        ) {
            const video =
                document.createElement('video');

            video.autoplay = true;
            video.muted = true;
            video.playsInline = true;
            video.controls = false;
            video.srcObject = stream;

            video.style.position =
                'fixed';

            video.style.left =
                '-10000px';

            video.style.top =
                '-10000px';

            video.style.width =
                '1px';

            video.style.height =
                '1px';

            video.style.opacity =
                '0';

            video.style.pointerEvents =
                'none';

            if (options.mirror) {
                video.style.transform =
                    'scaleX(-1)';
            }

            document.body?.appendChild(
                video
            );

            try {
                // A MediaStream attached to a 1px hidden video can leave
                // play() pending until the first frame arrives. Do not let
                // that browser quirk block phone connection forever; the
                // element will begin playback as soon as metadata is ready.
                const playPromise =
                    video.play?.();

                if (
                    playPromise &&
                    typeof playPromise.then ===
                        'function'
                ) {
                    let timeoutId =
                        null;

                    const timeoutPromise =
                        new Promise(resolve => {
                            timeoutId =
                                setTimeout(
                                    resolve,
                                    1200
                                );
                        });

                    try {
                        await Promise.race([
                            playPromise.catch(
                                error => {
                                    console.warn(
                                        '[SMUSBVideoReceiver] Video autoplay was blocked:',
                                        error
                                    );
                                }
                            ),
                            timeoutPromise
                        ]);
                    } finally {
                        clearTimeout(
                            timeoutId
                        );
                    }
                }
            } catch (error) {
                console.warn(
                    '[SMUSBVideoReceiver] Could not start hidden video:',
                    error
                );
            }

            return video;
        }

        async handleJPEGFrame(
            payload,
            metadata = {}
        ) {
            if (
                this.mode !== 'companion' ||
                !this.context ||
                !this.canvas
            ) {
                return false;
            }

            if (this._frameDecodeBusy) {
                this.framesDropped++;
                return false;
            }

            this._frameDecodeBusy = true;

            try {
                let blob = null;

                if (payload instanceof Blob) {
                    blob = payload;
                } else if (
                    payload instanceof ArrayBuffer
                ) {
                    blob =
                        new Blob(
                            [payload],
                            {
                                type:
                                    metadata.mimeType ||
                                    'image/jpeg'
                            }
                        );
                } else if (
                    ArrayBuffer.isView(payload)
                ) {
                    blob =
                        new Blob(
                            [
                                payload.buffer.slice(
                                    payload.byteOffset,
                                    payload.byteOffset +
                                    payload.byteLength
                                )
                            ],
                            {
                                type:
                                    metadata.mimeType ||
                                    'image/jpeg'
                            }
                        );
                } else {
                    throw new Error(
                        'JPEG frame payload must be Blob, ArrayBuffer, or TypedArray.'
                    );
                }

                const bitmap =
                    await createImageBitmap(
                        blob
                    );

                if (
                    this.canvas.width !==
                        bitmap.width ||
                    this.canvas.height !==
                        bitmap.height
                ) {
                    this.canvas.width =
                        bitmap.width;

                    this.canvas.height =
                        bitmap.height;
                }

                this.context.drawImage(
                    bitmap,
                    0,
                    0,
                    this.canvas.width,
                    this.canvas.height
                );

                bitmap.close?.();

                this.lastFrameTime =
                    performance.now();

                this.framesReceived++;

                return true;
            } catch (error) {
                this.framesDropped++;

                console.warn(
                    '[SMUSBVideoReceiver] Could not decode companion frame:',
                    error
                );

                return false;
            } finally {
                this._frameDecodeBusy =
                    false;
            }
        }

        getVideoTrack() {
            return (
                this.stream?.getVideoTracks?.()[0] ||
                null
            );
        }

        getSettings() {
            return (
                this.getVideoTrack()
                    ?.getSettings?.() ||
                {}
            );
        }

        getStats() {
            return {
                mode:
                    this.mode,
                state:
                    this.state,
                framesReceived:
                    this.framesReceived,
                framesDropped:
                    this.framesDropped,
                lastFrameTime:
                    this.lastFrameTime,
                settings:
                    this.getSettings()
            };
        }

        async stop() {
            if (this.videoElement) {
                try {
                    this.videoElement.pause?.();
                } catch (_) {}

                this.videoElement.srcObject =
                    null;

                this.videoElement.remove?.();
                this.videoElement = null;
            }

            if (this.stream) {
                for (
                    const track of
                    this.stream.getTracks()
                ) {
                    try {
                        track.stop();
                    } catch (_) {}
                }

                this.stream = null;
            }

            if (this.canvas) {
                this.canvas.remove?.();
                this.canvas = null;
            }

            this.context = null;
            this.texture = null;

            this.state = 'stopped';
        }

        destroy() {
            return this.stop();
        }
    }

    window.SMUSBVideoReceiver =
        SMUSBVideoReceiver;
})();
