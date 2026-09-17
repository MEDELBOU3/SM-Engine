(function () {
    'use strict';

    class SMRemoteCameraServer {
        constructor(options = {}) {
            if (!window.SMWebRTCReceiver) {
                throw new Error(
                    'Load SMWebRTCReceiver.js before SMRemoteCameraServer.js'
                );
            }

            this.options = {
                sessionId:
                    options.sessionId ||
                    this._makeSessionId(),

                signalingMode:
                    options.signalingMode ||
                    'manual',

                ...options
            };

            this.receiver =
                new window.SMWebRTCReceiver({
                    iceServers:
                        options.iceServers
                });

            this.sessionId =
                this.options.sessionId;

            this.listeners = new Map();
            this.state = 'idle';

            this._bindReceiver();
        }

        _makeSessionId() {
            return Math.random()
                .toString(36)
                .slice(2, 8)
                .toUpperCase();
        }

        _bindReceiver() {
            this.receiver.on(
                'stream',
                payload => {
                    this.state = 'streaming';

                    this.emit('stream', {
                        ...payload,
                        sessionId: this.sessionId
                    });
                }
            );

            this.receiver.on(
                'icecandidate',
                payload => {
                    this.emit('icecandidate', {
                        ...payload,
                        sessionId: this.sessionId
                    });
                }
            );

            this.receiver.on(
                'connectionstatechange',
                payload => {
                    this.state =
                        payload.state ||
                        this.state;

                    this.emit(
                        'connectionstatechange',
                        payload
                    );
                }
            );

            this.receiver.on(
                'message',
                payload => {
                    this.emit(
                        'message',
                        payload
                    );
                }
            );
        }

        on(event, callback) {
            if (typeof callback !== 'function') {
                return () => {};
            }

            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Set());
            }

            this.listeners
                .get(event)
                .add(callback);

            return () => {
                this.listeners
                    .get(event)
                    ?.delete(callback);
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
                            '[SMRemoteCameraServer]',
                            error
                        );
                    }
                }
            }

            window.dispatchEvent?.(
                new CustomEvent(
                    `sm:remote-camera-${event}`,
                    {
                        detail
                    }
                )
            );
        }

        getConnectionInfo() {
            return {
                sessionId: this.sessionId,
                signalingMode:
                    this.options.signalingMode,
                state: this.state
            };
        }

        createConnectionPayload() {
            return {
                type: 'sm-remote-camera',
                sessionId: this.sessionId,
                version: 1
            };
        }

        async acceptOffer(offer) {
            this.state = 'connecting';

            const answer =
                await this.receiver.acceptOffer(
                    offer
                );

            this.emit('answercreated', {
                answer,
                sessionId:
                    this.sessionId
            });

            return answer;
        }

        async addRemoteIceCandidate(
            candidate
        ) {
            return this.receiver
                .addIceCandidate(
                    candidate
                );
        }

        getRemoteStream() {
            return this.receiver
                .getRemoteStream();
        }

        sendControlMessage(
            type,
            payload = {}
        ) {
            return this.receiver.send({
                type,
                payload,
                sessionId:
                    this.sessionId,
                timestamp:
                    performance.now()
            });
        }

        async attachToCaptureSystem(
            options = {}
        ) {
            const stream =
                this.getRemoteStream();

            if (!stream) {
                throw new Error(
                    'No remote phone camera stream is available yet.'
                );
            }

            if (
                !window.captureSystem
                    ?.startPhoneCamera
            ) {
                throw new Error(
                    'SMCaptureSystem is not initialized.'
                );
            }

            return window.captureSystem
                .startPhoneCamera({
                    mode: 'remote',
                    stream,
                    peerId:
                        this.sessionId,
                    stopPrevious:
                        options.stopPrevious !==
                        false,
                    ...options
                });
        }

        close() {
            this.state = 'closed';

            return this.receiver.close();
        }

        destroy() {
            this.receiver?.destroy?.();
            this.receiver = null;

            this.listeners.clear();
            this.state = 'destroyed';
        }
    }

    window.SMRemoteCameraServer =
        SMRemoteCameraServer;
})();