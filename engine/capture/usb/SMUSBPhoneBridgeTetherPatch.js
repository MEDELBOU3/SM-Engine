(function () {
    'use strict';

    if (!window.SMUSBPhoneBridge) {
        throw new Error(
            'Load SMUSBPhoneBridge.js before SMUSBPhoneBridgeTetherPatch.js'
        );
    }

    if (!window.SMUSBTetherTransport) {
        throw new Error(
            'Load SMUSBTetherTransport.js before SMUSBPhoneBridgeTetherPatch.js'
        );
    }

    const proto =
        window.SMUSBPhoneBridge
            .prototype;

    if (
        proto
            .__smTetherPatchInstalled
    ) {
        return;
    }

    proto
        .__smTetherPatchInstalled =
        true;

    const originalConnect =
        proto.connect;

    const originalDisconnect =
        proto.disconnect;

    const originalUpdate =
        proto.update;

    proto.connect =
        async function (
            options = {}
        ) {
            const mode =
                String(
                    options.mode ||
                    this.options?.mode ||
                    'auto'
                ).toLowerCase();

            if (
                mode === 'tether' ||
                mode === 'usb-tether' ||
                mode === 'usb-network'
            ) {
                return this
                    ._connectUSBTether(
                        options
                    );
            }

            return originalConnect.call(
                this,
                options
            );
        };

    proto._connectUSBTether =
        async function (
            options = {}
        ) {
            if (!options.url) {
                throw new Error(
                    'USB tether mode requires the ws:// address displayed by the Android app.'
                );
            }

            if (
                Object.prototype
                    .hasOwnProperty.call(
                        options,
                        'trackingEnabled'
                    )
            ) {
                this.options.trackingEnabled =
                    options.trackingEnabled === true;
            }

            if (
                Object.prototype
                    .hasOwnProperty.call(
                        options,
                        'lensTrackingEnabled'
                    )
            ) {
                this.options.lensTrackingEnabled =
                    options.lensTrackingEnabled === true;
            }

            this.state =
                'connecting';

            this.mode =
                'tether';

            if (
                this.captureSystem
                    ?.stopActiveSession &&
                options.stopPrevious !==
                    false
            ) {
                await this.captureSystem
                    .stopActiveSession();
            }

            this._tetherUnsubscribers
                ?.splice?.(0)
                ?.forEach?.(
                    unsubscribe =>
                        unsubscribe?.()
                );

            this.tetherTransport
                ?.destroy?.();

            this.tetherTransport =
                new window
                    .SMUSBTetherTransport({
                        url:
                            options.url,
                        reconnect:
                            options.reconnect ===
                            true,
                        videoReceiver:
                            this.videoReceiver,
                        trackingReceiver:
                            this.trackingReceiver
                    });

            this._tetherUnsubscribers =
                [
                    this.tetherTransport.on(
                        'viewportrequest',
                        detail => {
                            this._handlePhoneViewportRequest?.(
                                detail.message ||
                                {}
                            );
                        }
                    ),
                    this.tetherTransport.on(
                        'virtualcamera',
                        detail => {
                            this._handlePhoneVirtualCameraCommand?.(
                                detail.message ||
                                {}
                            );
                        }
                    )
                ];

            await this
                .tetherTransport
                .connect(
                    options.url
                );

            // Establish the phone socket before creating the local canvas
            // capture session. Canvas MediaStream/video startup can take a
            // moment in Chromium; doing it first made the panel look stuck
            // on "Connecting" even when the phone was ready.
            this.videoReceiver.mode =
                'companion';

            if (
                this.captureSystem
                    ?.createSession
            ) {
                this.session =
                    this.captureSystem
                        .createSession({
                            name:
                                options.name ||
                                'USB Phone Camera',
                            sourceType:
                                'usb-phone',
                            metadata: {
                                transport:
                                    'usb-tether',
                                url:
                                    options.url
                            }
                        });

                this.captureSystem
                    .activeSessionId =
                    this.session.id;

                await this.session.start(
                    this.videoReceiver,
                    {
                        mode:
                            'companion',
                        width:
                            options.width ||
                            1280,
                        height:
                            options.height ||
                            720,
                        frameRate:
                            options.frameRate ||
                            30,
                        sourceType:
                            'usb-phone'
                    }
                );
            } else {
                const result =
                    await this
                        .videoReceiver
                        .start({
                            mode:
                                'companion',
                            width:
                                options.width ||
                                1280,
                            height:
                                options.height ||
                                720,
                            frameRate:
                                options.frameRate ||
                                30
                        });

                this.session = {
                    id:
                        `sm_usb_tether_${Date.now()}`,
                    sourceType:
                        'usb-phone',
                    stream:
                        result.stream,
                    videoElement:
                        result.videoElement,
                    texture:
                        null,
                    input:
                        this.videoReceiver,
                    state:
                        'active',
                    update() {},
                    isActive() {
                        return true;
                    }
                };
            }

            this.state =
                'connected';

            this._syncTrackerActivation?.();

            this.emit?.(
                'connected',
                {
                    mode:
                        'tether',
                    url:
                        options.url,
                    session:
                        this.session
                }
            );

            return this.session;
        };

    proto._handlePhoneViewportRequest =
        function (message = {}) {
            const enabled =
                message.enabled === true;

            const fps =
                Math.max(
                    4,
                    Math.min(
                        20,
                        Number(
                            message.fps
                        ) || 12
                    )
                );

            const quality =
                Math.max(
                    0.35,
                    Math.min(
                        0.9,
                        (
                            Number(
                                message.quality
                            ) || 68
                        ) / 100
                    )
                );

            this._phoneViewportStream = {
                ...(this._phoneViewportStream || {}),
                enabled,
                fps,
                quality,
                maxWidth:
                    960,
                maxHeight:
                    540,
                lastFrameTime:
                    0,
                busy:
                    false
            };

            const trackingEnabled =
                enabled &&
                message.tracking !== false;

            if (trackingEnabled) {
                this._bindPhoneVirtualCameraTarget?.();
            }

            this.setTrackingEnabled?.(
                trackingEnabled,
                {
                    recenter:
                        false
                }
            );

            if (trackingEnabled) {
                this.poseTracker
                    ?.recenter?.();
            }

            this.emit?.(
                'viewportpreviewchange',
                {
                    enabled,
                    fps,
                    quality,
                    trackingEnabled
                }
            );
        };

    proto._bindPhoneVirtualCameraTarget =
        function () {
            const selected =
                window.selectedObject ||
                null;

            const selectedCamera =
                selected?.isCamera
                    ? selected
                    : null;

            if (
                selectedCamera &&
                window.cameraSystem
                    ?.pilotCamera &&
                window.cameraSystem
                    .pilotedCamera !==
                    selectedCamera
            ) {
                try {
                    window.cameraSystem
                        .pilotCamera(
                            selectedCamera
                        );
                } catch (error) {
                    console.warn(
                        '[SM Virtual Camera] Could not pilot selected camera:',
                        error
                    );
                }
            }

            const target =
                selectedCamera ||
                window.cameraSystem
                    ?.pilotedCamera ||
                window.camera ||
                null;

            if (
                target?.isCamera &&
                target !== this.camera
            ) {
                this.bindCamera?.(
                    target
                );
            }

            return target;
        };

    proto._handlePhoneVirtualCameraCommand =
        function (message = {}) {
            const action =
                String(
                    message.action ||
                    ''
                ).toLowerCase();

            if (action === 'recenter') {
                this._bindPhoneVirtualCameraTarget?.();

                this.setTrackingEnabled?.(
                    true,
                    {
                        recenter:
                            false
                    }
                );

                this.poseTracker
                    ?.recenter?.();

                this.emit?.(
                    'virtualcamerarecenter',
                    {}
                );
            }
        };

    proto._updatePhoneViewportStream =
        function () {
            const stream =
                this._phoneViewportStream;

            if (
                !stream?.enabled ||
                stream.busy ||
                this.state !==
                    'connected' ||
                this.mode !==
                    'tether'
            ) {
                return;
            }

            const now =
                performance.now();

            if (
                now -
                    Number(
                        stream.lastFrameTime ||
                        0
                    ) <
                1000 /
                    stream.fps
            ) {
                return;
            }

            const source =
                this.options?.renderer
                    ?.domElement ||
                window.renderer
                    ?.domElement ||
                null;

            if (
                !source ||
                !source.width ||
                !source.height
            ) {
                return;
            }

            const scale =
                Math.min(
                    1,
                    stream.maxWidth /
                        source.width,
                    stream.maxHeight /
                        source.height
                );

            const width =
                Math.max(
                    2,
                    Math.round(
                        source.width *
                        scale
                    )
                );

            const height =
                Math.max(
                    2,
                    Math.round(
                        source.height *
                        scale
                    )
                );

            if (!this._phoneViewportCanvas) {
                this._phoneViewportCanvas =
                    document.createElement(
                        'canvas'
                    );

                this._phoneViewportContext =
                    this._phoneViewportCanvas
                        .getContext(
                            '2d',
                            {
                                alpha:
                                    false,
                                desynchronized:
                                    true
                            }
                        );
            }

            const canvas =
                this._phoneViewportCanvas;

            const context =
                this._phoneViewportContext;

            if (!context) {
                return;
            }

            if (
                canvas.width !== width ||
                canvas.height !== height
            ) {
                canvas.width =
                    width;

                canvas.height =
                    height;
            }

            try {
                context.drawImage(
                    source,
                    0,
                    0,
                    width,
                    height
                );
            } catch (error) {
                this.emit?.(
                    'viewportpreviewerror',
                    {
                        error
                    }
                );

                return;
            }

            stream.busy =
                true;

            stream.lastFrameTime =
                now;

            try {
                canvas.toBlob(
                    async blob => {
                        try {
                            if (
                                !blob ||
                                !this
                                    ._phoneViewportStream
                                    ?.enabled
                            ) {
                                return;
                            }

                            const buffer =
                                await blob
                                    .arrayBuffer();

                            this.tetherTransport
                                ?.sendBinary?.(
                                    buffer
                                );
                        } catch (error) {
                            this.emit?.(
                                'viewportpreviewerror',
                                {
                                    error
                                }
                            );
                        } finally {
                            if (
                                this
                                    ._phoneViewportStream
                            ) {
                                this._phoneViewportStream
                                    .busy =
                                    false;
                            }
                        }
                    },
                    'image/jpeg',
                    stream.quality
                );
            } catch (error) {
                stream.busy =
                    false;

                this.emit?.(
                    'viewportpreviewerror',
                    {
                        error
                    }
                );
            }
        };

    proto.update =
        function (delta = 1 / 60) {
            originalUpdate.call(
                this,
                delta
            );

            this._updatePhoneViewportStream?.();
        };

    proto.disconnect =
        async function () {
            if (
                this._phoneViewportStream
            ) {
                this._phoneViewportStream
                    .enabled =
                    false;
            }

            this.setTrackingEnabled?.(
                false,
                {
                    recenter:
                        false
                }
            );

            this._tetherUnsubscribers
                ?.splice?.(0)
                ?.forEach?.(
                    unsubscribe =>
                        unsubscribe?.()
                );

            try {
                await this
                    .tetherTransport
                    ?.close?.();
            } catch (_) {}

            this.tetherTransport =
                null;

            this._phoneViewportCanvas =
                null;

            this._phoneViewportContext =
                null;

            return originalDisconnect
                .call(this);
        };

    proto.setPhoneStreaming =
        function (enabled) {
            return this
                .tetherTransport
                ?.setStreaming?.(
                    enabled
                ) ?? false;
        };

    proto.setPhoneJPEGQuality =
        function (quality) {
            return this
                .tetherTransport
                ?.setJPEGQuality?.(
                    quality
                ) ?? false;
        };

    proto.switchPhoneCamera =
        function () {
            return this
                .tetherTransport
                ?.switchCamera?.() ??
                false;
        };

    window.SMConnectUSBPhoneTether =
        async function (
            url,
            options = {}
        ) {
            if (
                !window
                    .smUSBPhoneBridge
            ) {
                if (
                    !window
                        .initSMUSBPhoneBridge
                ) {
                    throw new Error(
                        'SM USB Phone Bridge is not loaded.'
                    );
                }

                await window
                    .initSMUSBPhoneBridge({
                        captureSystem:
                            window
                                .captureSystem ||
                            null,
                        camera:
                            window.camera ||
                            null
                    });
            }

            return window
                .smUSBPhoneBridge
                .connect({
                    mode:
                        'tether',
                    url,
                    width:
                        1280,
                    height:
                        720,
                    frameRate:
                        30,
                    ...options
                });
        };
})();
