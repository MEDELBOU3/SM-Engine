(function () {
    'use strict';

    class SMUSBTrackingReceiver {
        constructor(options = {}) {
            if (typeof THREE === 'undefined') {
                throw new Error(
                    'SMUSBTrackingReceiver requires THREE.'
                );
            }

            this.options = {
                positionScale: 1,
                smoothing: 0.18,
                ...options
            };

            this.position =
                new THREE.Vector3();

            this.rotation =
                new THREE.Quaternion();

            this.targetPosition =
                new THREE.Vector3();

            this.targetRotation =
                new THREE.Quaternion();

            this.orientation = {
                alpha: 0,
                beta: 0,
                gamma: 0
            };

            this.acceleration =
                new THREE.Vector3();

            this.angularVelocity =
                new THREE.Vector3();

            this.lens = {
                focalLength: 50,
                focusDistance: 5,
                aperture: 2.8,
                sensorWidth: 36
            };

            this.poseTracker = null;
            this.lensTracker = null;

            this.enabled = true;
            this.lastPacketTime = 0;
            this.packetCount = 0;

            this.listeners = new Map();
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

            if (!callbacks) return;

            for (const callback of callbacks) {
                try {
                    callback(detail);
                } catch (error) {
                    console.error(
                        '[SMUSBTrackingReceiver]',
                        error
                    );
                }
            }
        }

        bindPoseTracker(tracker) {
            this.poseTracker =
                tracker || null;

            if (
                this.poseTracker?.bindSource
            ) {
                this.poseTracker.bindSource(
                    this
                );
            }

            return this;
        }

        bindLensTracker(tracker) {
            this.lensTracker =
                tracker || null;

            return this;
        }

        handlePacket(packet) {
            if (!packet) return false;

            let data = packet;

            if (
                packet instanceof ArrayBuffer ||
                ArrayBuffer.isView(packet)
            ) {
                try {
                    const bytes =
                        packet instanceof ArrayBuffer
                            ? new Uint8Array(packet)
                            : new Uint8Array(
                                packet.buffer,
                                packet.byteOffset,
                                packet.byteLength
                            );

                    data =
                        JSON.parse(
                            new TextDecoder()
                                .decode(bytes)
                        );
                } catch (error) {
                    console.warn(
                        '[SMUSBTrackingReceiver] Invalid tracking packet:',
                        error
                    );

                    return false;
                }
            } else if (
                typeof packet === 'string'
            ) {
                try {
                    data =
                        JSON.parse(packet);
                } catch (error) {
                    return false;
                }
            }

            const type =
                String(
                    data.type ||
                    data.kind ||
                    'tracking'
                ).toLowerCase();

            this.lastPacketTime =
                performance.now();

            this.packetCount++;

            if (
                type === 'lens'
            ) {
                this._applyLens(
                    data.payload ||
                    data
                );

                return true;
            }

            if (
                type === 'tracking' ||
                type === 'pose' ||
                type === 'sensor'
            ) {
                this._applyTracking(
                    data.payload ||
                    data
                );

                return true;
            }

            return false;
        }

        _applyTracking(data = {}) {
            const scale =
                Number(
                    this.options
                        .positionScale
                ) || 1;

            if (data.position) {
                this.targetPosition.set(
                    Number(data.position.x) || 0,
                    Number(data.position.y) || 0,
                    Number(data.position.z) || 0
                ).multiplyScalar(
                    scale
                );
            }

            if (data.quaternion) {
                this.targetRotation.set(
                    Number(data.quaternion.x) || 0,
                    Number(data.quaternion.y) || 0,
                    Number(data.quaternion.z) || 0,
                    Number(data.quaternion.w) || 1
                ).normalize();
            } else if (data.rotation) {
                const euler =
                    new THREE.Euler(
                        THREE.MathUtils.degToRad(
                            Number(
                                data.rotation.x ??
                                data.rotation.beta
                            ) || 0
                        ),
                        THREE.MathUtils.degToRad(
                            Number(
                                data.rotation.y ??
                                data.rotation.alpha
                            ) || 0
                        ),
                        THREE.MathUtils.degToRad(
                            Number(
                                data.rotation.z ??
                                data.rotation.gamma
                            ) || 0
                        ),
                        'YXZ'
                    );

                this.targetRotation
                    .setFromEuler(euler);
            }

            if (data.orientation) {
                this.orientation.alpha =
                    Number(
                        data.orientation.alpha
                    ) || 0;

                this.orientation.beta =
                    Number(
                        data.orientation.beta
                    ) || 0;

                this.orientation.gamma =
                    Number(
                        data.orientation.gamma
                    ) || 0;
            }

            if (data.acceleration) {
                this.acceleration.set(
                    Number(
                        data.acceleration.x
                    ) || 0,
                    Number(
                        data.acceleration.y
                    ) || 0,
                    Number(
                        data.acceleration.z
                    ) || 0
                );
            }

            if (data.angularVelocity) {
                this.angularVelocity.set(
                    Number(
                        data.angularVelocity.x
                    ) || 0,
                    Number(
                        data.angularVelocity.y
                    ) || 0,
                    Number(
                        data.angularVelocity.z
                    ) || 0
                );
            }

            this.emit('tracking', {
                position:
                    this.targetPosition.clone(),
                quaternion:
                    this.targetRotation.clone(),
                orientation: {
                    ...this.orientation
                },
                acceleration:
                    this.acceleration.clone(),
                angularVelocity:
                    this.angularVelocity.clone()
            });
        }

        _applyLens(data = {}) {
            if (
                data.sensorWidth !== undefined
            ) {
                this.lens.sensorWidth =
                    Math.max(
                        1,
                        Number(
                            data.sensorWidth
                        ) || 36
                    );
            }

            if (
                data.focalLength !== undefined
            ) {
                this.lens.focalLength =
                    Math.max(
                        1,
                        Number(
                            data.focalLength
                        ) || 50
                    );
            }

            if (
                data.focusDistance !== undefined
            ) {
                this.lens.focusDistance =
                    Math.max(
                        0.01,
                        Number(
                            data.focusDistance
                        ) || 0.01
                    );
            }

            if (
                data.aperture !== undefined
            ) {
                this.lens.aperture =
                    Math.max(
                        0.1,
                        Number(
                            data.aperture
                        ) || 2.8
                    );
            }

            if (this.lensTracker) {
                if (
                    this.lensTracker.options &&
                    data.sensorWidth !== undefined
                ) {
                    this.lensTracker.options.sensorWidth =
                        this.lens.sensorWidth;
                }

                this.lensTracker.setLensState?.({
                    focalLength:
                        this.lens.focalLength,
                    focusDistance:
                        this.lens.focusDistance,
                    aperture:
                        this.lens.aperture
                });
            }

            this.emit('lens', {
                lens: {
                    ...this.lens
                }
            });
        }

        update(delta = 1 / 60) {
            if (!this.enabled) return;

            const smoothing =
                THREE.MathUtils.clamp(
                    Number(
                        this.options.smoothing
                    ) || 0,
                    0,
                    1
                );

            const frameScale =
                Math.max(
                    1,
                    Number(delta) * 60
                );

            const alpha =
                1 -
                Math.pow(
                    1 - smoothing,
                    frameScale
                );

            this.position.lerp(
                this.targetPosition,
                alpha
            );

            this.rotation.slerp(
                this.targetRotation,
                alpha
            );

            this.poseTracker?.update?.(
                delta
            );

            this.lensTracker?.update?.(
                delta
            );
        }

        reset() {
            this.position.set(0, 0, 0);
            this.targetPosition.set(0, 0, 0);

            this.rotation.identity();
            this.targetRotation.identity();

            this.acceleration.set(0, 0, 0);
            this.angularVelocity.set(0, 0, 0);

            this.packetCount = 0;
            this.lastPacketTime = 0;
        }

        getState() {
            return {
                position:
                    this.position.clone(),
                quaternion:
                    this.rotation.clone(),
                lens: {
                    ...this.lens
                },
                packetCount:
                    this.packetCount,
                lastPacketTime:
                    this.lastPacketTime
            };
        }

        destroy() {
            this.listeners.clear();
            this.poseTracker = null;
            this.lensTracker = null;
            this.enabled = false;
        }
    }

    window.SMUSBTrackingReceiver =
        SMUSBTrackingReceiver;
})();