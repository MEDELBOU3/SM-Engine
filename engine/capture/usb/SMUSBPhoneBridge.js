(function () {
    'use strict';

    class SMUSBPhoneBridge {
        constructor(options = {}) {
            if (!window.SMUSBDeviceManager) {
                throw new Error(
                    'Load SMUSBDeviceManager.js before SMUSBPhoneBridge.js'
                );
            }

            if (!window.SMUSBVideoReceiver) {
                throw new Error(
                    'Load SMUSBVideoReceiver.js before SMUSBPhoneBridge.js'
                );
            }

            if (!window.SMUSBTrackingReceiver) {
                throw new Error(
                    'Load SMUSBTrackingReceiver.js before SMUSBPhoneBridge.js'
                );
            }

            this.options = {
                mode: 'auto',
                width: 1920,
                height: 1080,
                frameRate: 30,
                audio: false,
                interfaceNumber: 0,
                alternateSetting: 0,
                endpointIn: null,
                packetSize: 65536,
                webUSBFilters: [],
                // Video capture must never take ownership of the editor
                // viewport. Phone pose/lens tracking is an explicit opt-in.
                trackingEnabled: false,
                lensTrackingEnabled: false,
                ...options
            };

            this.captureSystem =
                options.captureSystem ||
                window.captureSystem ||
                null;

            this.deviceManager =
                options.deviceManager ||
                new window.SMUSBDeviceManager(
                    options.deviceManagerOptions
                );

            this.videoReceiver =
                options.videoReceiver ||
                new window.SMUSBVideoReceiver(
                    options.videoOptions
                );

            this.trackingReceiver =
                options.trackingReceiver ||
                new window.SMUSBTrackingReceiver(
                    options.trackingOptions
                );

            this.usbDevice = null;
            this.session = null;
            this.mode = 'idle';
            this.state = 'idle';
            this.camera = null;

            this.listeners = new Map();

            this._readLoopRunning = false;
            this._readAbort = false;

            this._rxBuffer =
                new Uint8Array(0);

            this._protocol = {
                magic: [
                    0x53,
                    0x4D,
                    0x43,
                    0x50
                ],
                version: 1,
                headerSize: 12,
                typeJPEG: 1,
                typeTrackingJSON: 2,
                typeLensJSON: 3,
                typeStatusJSON: 4
            };
        }

        on(event, callback) {
            if (typeof callback !== 'function') return () => {};

            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Set());
            }

            this.listeners.get(event).add(callback);

            return () => {
                this.listeners.get(event)?.delete(callback);
            };
        }

        emit(event, detail = {}) {
            const callbacks =
                this.listeners.get(event);

            if (callbacks) {
                for (const callback of callbacks) {
                    try {
                        callback(detail);
                    } catch (error) {
                        console.error(
                            '[SMUSBPhoneBridge]',
                            error
                        );
                    }
                }
            }

            window.dispatchEvent?.(
                new CustomEvent(
                    `sm:usb-phone-${event}`,
                    {
                        detail
                    }
                )
            );
        }

        async init() {
            await this.deviceManager
                .refreshMediaDevices()
                .catch(() => []);

            await this.deviceManager
                .refreshAuthorizedUSBDevices()
                .catch(() => []);

            this.emit('ready', {
                bridge: this
            });

            return this;
        }

        setCaptureSystem(
            captureSystem
        ) {
            this.captureSystem =
                captureSystem ||
                null;

            return this;
        }

        bindCamera(camera) {
            if (!camera) {
                return this;
            }

            this.camera = camera;

            if (
                window.SMCameraPoseTracker
            ) {
                if (!this.poseTracker) {
                    this.poseTracker =
                        new window.SMCameraPoseTracker();
                }

                this.poseTracker
                    .bindCamera(camera)
                    .bindSource(
                        this.trackingReceiver
                    );

                this.trackingReceiver
                    .bindPoseTracker(
                        this.poseTracker
                    );
            }

            if (
                camera.isPerspectiveCamera &&
                window.SMLensTracker &&
                this.options
                    .lensTrackingEnabled === true
            ) {
                if (!this.lensTracker) {
                    this.lensTracker =
                        new window.SMLensTracker();
                }

                this.lensTracker
                    .bindCamera(camera);

                this.trackingReceiver
                    .bindLensTracker(
                        this.lensTracker
                    );
            }

            this._syncTrackerActivation();

            return this;
        }

        setTrackingEnabled(
            value,
            options = {}
        ) {
            this.options.trackingEnabled =
                value === true;

            if (
                this.options.trackingEnabled &&
                options.recenter !== false
            ) {
                this.poseTracker
                    ?.captureBasePose?.();
            }

            this._syncTrackerActivation();

            return this.options
                .trackingEnabled;
        }

        setLensTrackingEnabled(value) {
            this.options.lensTrackingEnabled =
                value === true;

            if (
                this.options.lensTrackingEnabled &&
                this.camera
                    ?.isPerspectiveCamera &&
                window.SMLensTracker
            ) {
                if (!this.lensTracker) {
                    this.lensTracker =
                        new window.SMLensTracker();
                }

                this.lensTracker
                    .bindCamera(this.camera);

                this.trackingReceiver
                    .bindLensTracker(
                        this.lensTracker
                    );
            }

            this._syncTrackerActivation();

            return this.options
                .lensTrackingEnabled;
        }

        _syncTrackerActivation() {
            const connected =
                this.state === 'connected';

            const transportHasTracking =
                this.mode === 'companion' ||
                this.mode === 'tether';

            const poseActive =
                connected &&
                transportHasTracking &&
                this.options
                    .trackingEnabled === true;

            const lensActive =
                connected &&
                transportHasTracking &&
                this.options
                    .lensTrackingEnabled === true;

            this.poseTracker
                ?.setEnabled?.(
                    poseActive
                );

            if (this.lensTracker) {
                this.lensTracker.enabled =
                    lensActive;
            }

            return {
                poseActive,
                lensActive
            };
        }

        async connect(options = {}) {
            if (
                this.state === 'connecting' ||
                this.state === 'connected'
            ) {
                return this.session || this;
            }

            const merged = {
                ...this.options,
                ...options
            };

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

            this.state = 'connecting';

            try {
                let mode =
                    String(
                        merged.mode ||
                        'auto'
                    ).toLowerCase();

                if (
                    mode === 'auto' ||
                    mode === 'uvc'
                ) {
                    const camera =
                        await this.deviceManager
                            .findBestUVCCamera({
                                deviceId:
                                    merged.deviceId,
                                label:
                                    merged.label,
                                requestPermission:
                                    merged.requestPermission ===
                                    true
                            });

                    if (camera) {
                        return await this._connectUVC(
                            camera,
                            merged
                        );
                    }

                    if (mode === 'uvc') {
                        throw new Error(
                            'No UVC camera device was found. On the phone, enable USB Webcam mode first.'
                        );
                    }
                }

                return await this._connectCompanion(
                    merged
                );
            } catch (error) {
                this.state = 'error';

                this.emit('error', {
                    error
                });

                throw error;
            }
        }

        async _connectUVC(
            camera,
            options
        ) {
            this.mode = 'uvc';

            if (
                this.captureSystem
                    ?.stopActiveSession &&
                options.stopPrevious !== false
            ) {
                await this.captureSystem
                    .stopActiveSession();
            }

            this.videoReceiver.mode =
                'uvc';

            if (
                this.captureSystem
                    ?.createSession
            ) {
                this.session =
                    this.captureSystem.createSession({
                        name:
                            options.name ||
                            'USB Phone Camera',
                        sourceType:
                            'usb-phone',
                        metadata: {
                            transport:
                                'uvc',
                            deviceId:
                                camera.deviceId,
                            label:
                                camera.label
                        }
                    });

                this.captureSystem.activeSessionId =
                    this.session.id;

                await this.session.start(
                    this.videoReceiver,
                    {
                        mode:
                            'uvc',
                        deviceId:
                            camera.deviceId,
                        width:
                            options.width,
                        height:
                            options.height,
                        frameRate:
                            options.frameRate,
                        audio:
                            options.audio === true,
                        sourceType:
                            'usb-phone'
                    }
                );
            } else {
                const result =
                    await this.videoReceiver.start({
                        mode:
                            'uvc',
                        deviceId:
                            camera.deviceId,
                        width:
                            options.width,
                        height:
                            options.height,
                        frameRate:
                            options.frameRate,
                        audio:
                            options.audio === true
                    });

                this.session = {
                    id:
                        `sm_usb_${Date.now()}`,
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
                    isActive() {
                        return true;
                    }
                };
            }

            this.state = 'connected';

            this._syncTrackerActivation();

            this.emit('connected', {
                mode:
                    'uvc',
                camera,
                session:
                    this.session
            });

            return this.session;
        }

        async _connectCompanion(
            options
        ) {
            this.mode = 'companion';

            let device =
                options.usbDevice ||
                null;

            if (!device) {
                const authorized =
                    await this.deviceManager
                        .refreshAuthorizedUSBDevices();

                device =
                    authorized.find(
                        candidate =>
                            this._matchesUSBDevice(
                                candidate,
                                options
                            )
                    ) ||
                    authorized[0] ||
                    null;
            }

            if (!device) {
                device =
                    await this.deviceManager
                        .requestCompanionDevice({
                            filters:
                                options.webUSBFilters ||
                                this.options.webUSBFilters
                        });
            }

            this.usbDevice =
                await this.deviceManager
                    .openDevice(device);

            await this._configureCompanionInterface(
                this.usbDevice,
                options
            );

            if (
                this.captureSystem
                    ?.stopActiveSession &&
                options.stopPrevious !== false
            ) {
                await this.captureSystem
                    .stopActiveSession();
            }

            this.videoReceiver.mode =
                'companion';

            if (
                this.captureSystem
                    ?.createSession
            ) {
                this.session =
                    this.captureSystem.createSession({
                        name:
                            options.name ||
                            'USB Phone Companion',
                        sourceType:
                            'usb-phone',
                        metadata: {
                            transport:
                                'webusb-companion',
                            usb:
                                this.deviceManager
                                    .describeUSBDevice(
                                        this.usbDevice
                                    )
                        }
                    });

                this.captureSystem.activeSessionId =
                    this.session.id;

                await this.session.start(
                    this.videoReceiver,
                    {
                        mode:
                            'companion',
                        width:
                            options.width,
                        height:
                            options.height,
                        frameRate:
                            options.frameRate,
                        sourceType:
                            'usb-phone'
                    }
                );
            } else {
                const result =
                    await this.videoReceiver.start({
                        mode:
                            'companion',
                        width:
                            options.width,
                        height:
                            options.height,
                        frameRate:
                            options.frameRate
                    });

                this.session = {
                    id:
                        `sm_usb_companion_${Date.now()}`,
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
                    isActive() {
                        return true;
                    }
                };
            }

            this._startReadLoop(
                options
            );

            this.state =
                'connected';

            this._syncTrackerActivation();

            this.emit('connected', {
                mode:
                    'companion',
                device:
                    this.deviceManager
                        .describeUSBDevice(
                            this.usbDevice
                        ),
                session:
                    this.session
            });

            return this.session;
        }

        _matchesUSBDevice(
            device,
            options
        ) {
            if (!device) return false;

            if (
                options.vendorId !==
                    undefined &&
                Number(options.vendorId) !==
                    device.vendorId
            ) {
                return false;
            }

            if (
                options.productId !==
                    undefined &&
                Number(options.productId) !==
                    device.productId
            ) {
                return false;
            }

            return true;
        }

        async _configureCompanionInterface(
            device,
            options
        ) {
            if (!device.configuration) {
                await device.selectConfiguration(
                    Number(
                        options.configurationValue ||
                        1
                    )
                );
            }

            const interfaceNumber =
                Number(
                    options.interfaceNumber ??
                    this.options.interfaceNumber
                );

            await device.claimInterface(
                interfaceNumber
            );

            const alternateSetting =
                Number(
                    options.alternateSetting ??
                    this.options.alternateSetting
                );

            if (
                Number.isFinite(
                    alternateSetting
                )
            ) {
                try {
                    await device.selectAlternateInterface(
                        interfaceNumber,
                        alternateSetting
                    );
                } catch (_) {}
            }

            if (
                options.endpointIn == null &&
                this.options.endpointIn == null
            ) {
                const iface =
                    device.configuration?.interfaces
                        ?.find(
                            item =>
                                item.interfaceNumber ===
                                interfaceNumber
                        );

                const alternate =
                    iface?.alternate;

                const endpoint =
                    alternate?.endpoints?.find(
                        item =>
                            item.direction === 'in' &&
                            item.type === 'bulk'
                    );

                if (!endpoint) {
                    throw new Error(
                        'No bulk IN endpoint found on the SM Camera companion interface.'
                    );
                }

                this.endpointIn =
                    endpoint.endpointNumber;
            } else {
                this.endpointIn =
                    Number(
                        options.endpointIn ??
                        this.options.endpointIn
                    );
            }

            this.interfaceNumber =
                interfaceNumber;
        }

        _startReadLoop(options = {}) {
            if (
                this._readLoopRunning ||
                !this.usbDevice
            ) {
                return;
            }

            this._readLoopRunning = true;
            this._readAbort = false;

            const packetSize =
                Math.max(
                    512,
                    Number(
                        options.packetSize ??
                        this.options.packetSize
                    ) || 65536
                );

            const loop = async () => {
                while (
                    !this._readAbort &&
                    this.usbDevice?.opened
                ) {
                    try {
                        const result =
                            await this.usbDevice
                                .transferIn(
                                    this.endpointIn,
                                    packetSize
                                );

                        if (
                            result.status !==
                            'ok'
                        ) {
                            continue;
                        }

                        if (
                            result.data &&
                            result.data.byteLength
                        ) {
                            const bytes =
                                new Uint8Array(
                                    result.data.buffer,
                                    result.data.byteOffset,
                                    result.data.byteLength
                                );

                            await this._consumeUSBBytes(
                                bytes
                            );
                        }
                    } catch (error) {
                        if (
                            this._readAbort
                        ) {
                            break;
                        }

                        console.warn(
                            '[SMUSBPhoneBridge] USB read failed:',
                            error
                        );

                        this.emit(
                            'transporterror',
                            {
                                error
                            }
                        );

                        break;
                    }
                }

                this._readLoopRunning =
                    false;
            };

            loop();
        }

        async _consumeUSBBytes(
            bytes
        ) {
            const merged =
                new Uint8Array(
                    this._rxBuffer.length +
                    bytes.length
                );

            merged.set(
                this._rxBuffer,
                0
            );

            merged.set(
                bytes,
                this._rxBuffer.length
            );

            this._rxBuffer =
                merged;

            const headerSize =
                this._protocol.headerSize;

            while (
                this._rxBuffer.length >=
                headerSize
            ) {
                if (
                    !this._hasProtocolMagic(
                        this._rxBuffer
                    )
                ) {
                    const next =
                        this._findNextMagic(
                            this._rxBuffer,
                            1
                        );

                    if (next < 0) {
                        this._rxBuffer =
                            this._rxBuffer.slice(
                                Math.max(
                                    0,
                                    this._rxBuffer.length -
                                    3
                                )
                            );

                        return;
                    }

                    this._rxBuffer =
                        this._rxBuffer.slice(
                            next
                        );

                    if (
                        this._rxBuffer.length <
                        headerSize
                    ) {
                        return;
                    }
                }

                const version =
                    this._rxBuffer[4];

                const type =
                    this._rxBuffer[5];

                const view =
                    new DataView(
                        this._rxBuffer.buffer,
                        this._rxBuffer.byteOffset,
                        this._rxBuffer.byteLength
                    );

                const payloadLength =
                    view.getUint32(
                        8,
                        true
                    );

                const total =
                    headerSize +
                    payloadLength;

                if (
                    this._rxBuffer.length <
                    total
                ) {
                    return;
                }

                const payload =
                    this._rxBuffer.slice(
                        headerSize,
                        total
                    );

                this._rxBuffer =
                    this._rxBuffer.slice(
                        total
                    );

                await this._dispatchProtocolPacket(
                    version,
                    type,
                    payload
                );
            }
        }

        _hasProtocolMagic(buffer) {
            const magic =
                this._protocol.magic;

            return (
                buffer[0] === magic[0] &&
                buffer[1] === magic[1] &&
                buffer[2] === magic[2] &&
                buffer[3] === magic[3]
            );
        }

        _findNextMagic(
            buffer,
            start = 0
        ) {
            const magic =
                this._protocol.magic;

            for (
                let i = start;
                i <= buffer.length - 4;
                i++
            ) {
                if (
                    buffer[i] === magic[0] &&
                    buffer[i + 1] === magic[1] &&
                    buffer[i + 2] === magic[2] &&
                    buffer[i + 3] === magic[3]
                ) {
                    return i;
                }
            }

            return -1;
        }

        async _dispatchProtocolPacket(
            version,
            type,
            payload
        ) {
            if (
                version !==
                this._protocol.version
            ) {
                console.warn(
                    '[SMUSBPhoneBridge] Unsupported companion protocol version:',
                    version
                );

                return;
            }

            if (
                type ===
                this._protocol.typeJPEG
            ) {
                await this.videoReceiver
                    .handleJPEGFrame(
                        payload,
                        {
                            mimeType:
                                'image/jpeg'
                        }
                    );

                return;
            }

            if (
                type ===
                    this._protocol.typeTrackingJSON ||
                type ===
                    this._protocol.typeLensJSON ||
                type ===
                    this._protocol.typeStatusJSON
            ) {
                const text =
                    new TextDecoder()
                        .decode(payload);

                let json = null;

                try {
                    json =
                        JSON.parse(text);
                } catch (error) {
                    console.warn(
                        '[SMUSBPhoneBridge] Invalid companion JSON packet:',
                        error
                    );

                    return;
                }

                if (
                    type ===
                    this._protocol.typeTrackingJSON
                ) {
                    this.trackingReceiver
                        .handlePacket({
                            type:
                                'tracking',
                            payload:
                                json
                        });

                    return;
                }

                if (
                    type ===
                    this._protocol.typeLensJSON
                ) {
                    this.trackingReceiver
                        .handlePacket({
                            type:
                                'lens',
                            payload:
                                json
                        });

                    return;
                }

                this.emit('status', {
                    status:
                        json
                });
            }
        }

        update(delta = 1 / 60) {
            const tracking =
                this._syncTrackerActivation();

            if (
                tracking.poseActive ||
                tracking.lensActive
            ) {
                this.trackingReceiver
                    ?.update?.(
                        delta
                    );
            }

            if (!this.captureSystem) {
                this.session
                    ?.update?.();
            }
        }

        getStatus() {
            return {
                state:
                    this.state,
                mode:
                    this.mode,
                session:
                    this.session ||
                    null,
                usbDevice:
                    this.deviceManager
                        .describeUSBDevice(
                            this.usbDevice
                        ),
                video:
                    this.videoReceiver
                        .getStats?.() ||
                    null,
                tracking:
                    this.trackingReceiver
                        .getState?.() ||
                    null
            };
        }

        async disconnect() {
            this._readAbort = true;

            if (
                this.captureSystem &&
                this.session &&
                this.captureSystem
                    .getSession?.(
                        this.session.id
                    )
            ) {
                try {
                    await this.captureSystem
                        .stopSession(
                            this.session
                        );
                } catch (error) {
                    console.warn(
                        '[SMUSBPhoneBridge] Could not stop capture session:',
                        error
                    );
                }
            } else {
                try {
                    await this.videoReceiver
                        .stop?.();
                } catch (_) {}
            }

            if (
                this.usbDevice &&
                this.interfaceNumber !==
                    undefined
            ) {
                try {
                    await this.usbDevice
                        .releaseInterface(
                            this.interfaceNumber
                        );
                } catch (_) {}
            }

            if (this.usbDevice) {
                await this.deviceManager
                    .closeDevice(
                        this.usbDevice
                    );
            }

            this.usbDevice = null;
            this.session = null;
            this.mode = 'idle';
            this.state = 'disconnected';

            this._syncTrackerActivation();

            this._rxBuffer =
                new Uint8Array(0);

            this.emit('disconnected', {});
        }

        async destroy() {
            await this.disconnect()
                .catch(() => {});

            this.poseTracker
                ?.destroy?.();

            this.lensTracker
                ?.destroy?.();

            this.trackingReceiver
                ?.destroy?.();

            this.deviceManager
                ?.destroy?.();

            this.listeners.clear();

            this.captureSystem = null;
            this.camera = null;
            this.poseTracker = null;
            this.lensTracker = null;

            this.state = 'destroyed';
        }
    }

    window.SMUSBPhoneBridge =
        SMUSBPhoneBridge;

    window.initSMUSBPhoneBridge =
        async function (
            options = {}
        ) {
            if (
                window.smUSBPhoneBridge
                    ?.destroy
            ) {
                try {
                    await window
                        .smUSBPhoneBridge
                        .destroy();
                } catch (_) {}
            }

            const bridge =
                new window.SMUSBPhoneBridge({
                    captureSystem:
                        window.captureSystem ||
                        null,
                    ...options
                });

            window.smUSBPhoneBridge =
                bridge;

            await bridge.init();

            if (
                options.camera ||
                window.camera
            ) {
                bridge.bindCamera(
                    options.camera ||
                    window.camera
                );
            }

            return bridge;
        };
})();
