(function () {
    'use strict';

    class SMUSBDeviceManager {
        constructor(options = {}) {
            this.options = {
                phoneLabelHints: [
                    'android',
                    'iphone',
                    'pixel',
                    'samsung',
                    'galaxy',
                    'xiaomi',
                    'redmi',
                    'oneplus',
                    'oppo',
                    'vivo',
                    'motorola',
                    'phone',
                    'webcam'
                ],
                autoWatchMediaDevices: true,
                ...options
            };

            this.videoInputs = [];
            this.authorizedUSBDevices = [];
            this.listeners = new Map();

            this._watchingMediaDevices = false;
            this._boundMediaDeviceChange =
                this._handleMediaDeviceChange.bind(this);

            this._boundUSBConnect =
                this._handleUSBConnect.bind(this);

            this._boundUSBDisconnect =
                this._handleUSBDisconnect.bind(this);

            if (this.options.autoWatchMediaDevices) {
                this.startWatching();
            }
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
            const callbacks = this.listeners.get(event);

            if (callbacks) {
                for (const callback of callbacks) {
                    try {
                        callback(detail);
                    } catch (error) {
                        console.error('[SMUSBDeviceManager]', error);
                    }
                }
            }

            window.dispatchEvent?.(
                new CustomEvent(`sm:usb-${event}`, {
                    detail
                })
            );
        }

        isMediaCaptureSupported() {
            return !!(
                navigator.mediaDevices?.enumerateDevices &&
                navigator.mediaDevices?.getUserMedia
            );
        }

        isWebUSBSupported() {
            return !!navigator.usb;
        }

        isSecureContextReady() {
            return window.isSecureContext === true;
        }

        async requestCameraPermission() {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error(
                    'Camera access is not supported in this browser.'
                );
            }

            let stream = null;

            try {
                stream =
                    await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });

                return true;
            } finally {
                if (stream) {
                    for (const track of stream.getTracks()) {
                        track.stop();
                    }
                }
            }
        }

        async refreshMediaDevices(options = {}) {
            if (!this.isMediaCaptureSupported()) {
                this.videoInputs = [];
                return [];
            }

            if (options.requestPermission === true) {
                try {
                    await this.requestCameraPermission();
                } catch (error) {
                    console.warn(
                        '[SMUSBDeviceManager] Camera permission was not granted:',
                        error
                    );
                }
            }

            const devices =
                await navigator.mediaDevices.enumerateDevices();

            this.videoInputs = devices
                .filter(device => device.kind === 'videoinput')
                .map((device, index) => ({
                    kind: device.kind,
                    deviceId: device.deviceId || '',
                    groupId: device.groupId || '',
                    label:
                        device.label ||
                        `Camera ${index + 1}`,
                    raw: device
                }));

            this.emit('mediadeviceschange', {
                videoInputs: this.getVideoInputs()
            });

            return this.getVideoInputs();
        }

        getVideoInputs() {
            return this.videoInputs.map(device => ({
                ...device
            }));
        }

        getVideoInputById(deviceId) {
            return (
                this.videoInputs.find(
                    device =>
                        device.deviceId === deviceId
                ) ||
                null
            );
        }

        findLikelyPhoneCameras() {
            const hints =
                this.options.phoneLabelHints.map(
                    item =>
                        String(item)
                            .toLowerCase()
                            .trim()
                );

            return this.videoInputs.filter(device => {
                const label =
                    String(device.label || '')
                        .toLowerCase();

                return hints.some(
                    hint =>
                        hint &&
                        label.includes(hint)
                );
            });
        }

        async findBestUVCCamera(options = {}) {
            if (
                !this.videoInputs.length ||
                options.refresh !== false
            ) {
                await this.refreshMediaDevices({
                    requestPermission:
                        options.requestPermission === true
                });
            }

            if (options.deviceId) {
                return (
                    this.getVideoInputById(
                        options.deviceId
                    ) ||
                    null
                );
            }

            if (options.label) {
                const needle =
                    String(options.label)
                        .toLowerCase()
                        .trim();

                const byLabel =
                    this.videoInputs.find(
                        device =>
                            String(device.label || '')
                                .toLowerCase()
                                .includes(needle)
                    );

                if (byLabel) {
                    return byLabel;
                }
            }

            const phoneCandidates =
                this.findLikelyPhoneCameras();

            if (phoneCandidates.length) {
                return phoneCandidates[0];
            }

            return this.videoInputs[0] || null;
        }

        async refreshAuthorizedUSBDevices() {
            if (!this.isWebUSBSupported()) {
                this.authorizedUSBDevices = [];
                return [];
            }

            const devices =
                await navigator.usb.getDevices();

            this.authorizedUSBDevices =
                devices.slice();

            this.emit('usbdeviceschange', {
                devices:
                    this.authorizedUSBDevices.slice()
            });

            return this.authorizedUSBDevices.slice();
        }

        getAuthorizedUSBDevices() {
            return this.authorizedUSBDevices.slice();
        }

        async requestCompanionDevice(options = {}) {
            if (!this.isWebUSBSupported()) {
                throw new Error(
                    'WebUSB is not supported. Use a Chromium-based browser or UVC webcam mode.'
                );
            }

            const filters =
                Array.isArray(options.filters)
                    ? options.filters.filter(Boolean)
                    : [];

            if (!filters.length) {
                throw new Error(
                    'WebUSB request requires at least one USB filter. ' +
                    'Provide the vendorId/productId or classCode used by the SM Camera companion transport.'
                );
            }

            const device =
                await navigator.usb.requestDevice({
                    filters
                });

            if (
                device &&
                !this.authorizedUSBDevices.includes(device)
            ) {
                this.authorizedUSBDevices.push(device);
            }

            this.emit('usbdevicegranted', {
                device
            });

            return device;
        }

        async openDevice(device) {
            if (!device) {
                throw new Error(
                    'SMUSBDeviceManager.openDevice requires a USBDevice.'
                );
            }

            if (!device.opened) {
                await device.open();
            }

            return device;
        }

        async closeDevice(device) {
            if (!device?.opened) return;

            try {
                await device.close();
            } catch (error) {
                console.warn(
                    '[SMUSBDeviceManager] Failed to close USB device:',
                    error
                );
            }
        }

        describeUSBDevice(device) {
            if (!device) return null;

            return {
                productName:
                    device.productName || '',
                manufacturerName:
                    device.manufacturerName || '',
                serialNumber:
                    device.serialNumber || '',
                vendorId:
                    device.vendorId,
                productId:
                    device.productId,
                opened:
                    !!device.opened,
                configurationValue:
                    device.configuration?.configurationValue ??
                    null
            };
        }

        async getSnapshot(options = {}) {
            const [videoInputs, usbDevices] =
                await Promise.all([
                    this.refreshMediaDevices({
                        requestPermission:
                            options.requestPermission === true
                    }).catch(() => this.getVideoInputs()),

                    this.refreshAuthorizedUSBDevices()
                        .catch(
                            () =>
                                this.getAuthorizedUSBDevices()
                        )
                ]);

            return {
                secureContext:
                    this.isSecureContextReady(),
                webUSB:
                    this.isWebUSBSupported(),
                mediaCapture:
                    this.isMediaCaptureSupported(),
                videoInputs,
                likelyPhoneCameras:
                    this.findLikelyPhoneCameras(),
                authorizedUSBDevices:
                    usbDevices.map(
                        device =>
                            this.describeUSBDevice(
                                device
                            )
                    )
            };
        }

        startWatching() {
            if (
                !this._watchingMediaDevices &&
                navigator.mediaDevices?.addEventListener
            ) {
                navigator.mediaDevices.addEventListener(
                    'devicechange',
                    this._boundMediaDeviceChange
                );

                this._watchingMediaDevices = true;
            }

            if (navigator.usb?.addEventListener) {
                navigator.usb.addEventListener(
                    'connect',
                    this._boundUSBConnect
                );

                navigator.usb.addEventListener(
                    'disconnect',
                    this._boundUSBDisconnect
                );
            }
        }

        stopWatching() {
            if (
                this._watchingMediaDevices &&
                navigator.mediaDevices?.removeEventListener
            ) {
                navigator.mediaDevices.removeEventListener(
                    'devicechange',
                    this._boundMediaDeviceChange
                );

                this._watchingMediaDevices = false;
            }

            if (navigator.usb?.removeEventListener) {
                navigator.usb.removeEventListener(
                    'connect',
                    this._boundUSBConnect
                );

                navigator.usb.removeEventListener(
                    'disconnect',
                    this._boundUSBDisconnect
                );
            }
        }

        async _handleMediaDeviceChange() {
            try {
                await this.refreshMediaDevices();
            } catch (error) {
                console.warn(
                    '[SMUSBDeviceManager] Media device refresh failed:',
                    error
                );
            }
        }

        _handleUSBConnect(event) {
            const device = event.device;

            if (
                device &&
                !this.authorizedUSBDevices.includes(device)
            ) {
                this.authorizedUSBDevices.push(device);
            }

            this.emit('connect', {
                device,
                info:
                    this.describeUSBDevice(device)
            });
        }

        _handleUSBDisconnect(event) {
            const device = event.device;

            this.authorizedUSBDevices =
                this.authorizedUSBDevices.filter(
                    item =>
                        item !== device
                );

            this.emit('disconnect', {
                device,
                info:
                    this.describeUSBDevice(device)
            });
        }

        destroy() {
            this.stopWatching();

            this.videoInputs.length = 0;
            this.authorizedUSBDevices.length = 0;
            this.listeners.clear();
        }
    }

    window.SMUSBDeviceManager =
        SMUSBDeviceManager;
})();