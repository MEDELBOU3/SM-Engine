(function () {
    'use strict';

    class SMUSBTetherTransport {
        constructor(options = {}) {
            this.options = {
                url: '',
                reconnect: false,
                reconnectDelayMs: 1500,
                ...options
            };

            this.videoReceiver =
                options.videoReceiver ||
                null;

            this.trackingReceiver =
                options.trackingReceiver ||
                null;

            this.socket = null;
            this.url = '';
            this.state = 'idle';
            this.listeners = new Map();

            this._manualClose = false;
            this._reconnectTimer = null;
        }

        on(event, callback) {
            if (typeof callback !== 'function') {
                return () => {};
            }

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
                            '[SMUSBTetherTransport]',
                            error
                        );
                    }
                }
            }

            window.dispatchEvent?.(
                new CustomEvent(
                    `sm:usb-tether-${event}`,
                    { detail }
                )
            );
        }

        async connect(
            url = this.options.url
        ) {
            if (!url) {
                throw new Error(
                    'A ws:// address from the SM Camera app is required.'
                );
            }

            await this.close();

            this.url =
                String(url);

            this._manualClose =
                false;

            this.state =
                'connecting';

            return new Promise(
                (resolve, reject) => {
                    let settled =
                        false;

                    const timeoutMs =
                        Math.max(
                            1000,
                            Number(
                                this.options
                                    .connectTimeoutMs
                            ) || 8000
                        );

                    const socket =
                        new WebSocket(
                            this.url
                        );

                    const clearConnectTimer =
                        () => {
                            clearTimeout(
                                connectTimer
                            );
                        };

                    const rejectConnection =
                        message => {
                            if (settled) {
                                return;
                            }

                            settled = true;
                            clearConnectTimer();

                            if (
                                this.socket ===
                                socket
                            ) {
                                this.socket = null;
                                this.state =
                                    'error';
                            }

                            try {
                                socket.close();
                            } catch (_) {}

                            reject(
                                new Error(
                                    message
                                )
                            );
                        };

                    const connectTimer =
                        setTimeout(
                            () => {
                                rejectConnection(
                                    `Phone camera did not answer at ${this.url} within ${Math.round(timeoutMs / 1000)} seconds.`
                                );
                            },
                            timeoutMs
                        );

                    socket.binaryType =
                        'arraybuffer';

                    this.socket =
                        socket;

                    socket.onopen = () => {
                        if (
                            this.socket !==
                            socket
                        ) {
                            rejectConnection(
                                'Phone connection was replaced before it opened.'
                            );
                            return;
                        }

                        this.state =
                            'connected';

                        this.emit(
                            'connected',
                            {
                                url:
                                    this.url
                            }
                        );

                        settled =
                            true;

                        clearConnectTimer();

                        resolve(this);
                    };

                    socket.onmessage =
                        event => {
                            this
                                ._handleMessage(
                                    event
                                )
                                .catch(
                                    error => {
                                        console.warn(
                                            '[SMUSBTetherTransport] Message handling failed:',
                                            error
                                        );
                                    }
                                );
                        };

                    socket.onerror =
                        event => {
                            this.emit(
                                'error',
                                {
                                    event,
                                    url:
                                        this.url
                                }
                            );

                            if (!settled) {
                                rejectConnection(
                                    `Could not connect to ${this.url}. Check that SM Camera is open and the phone and PC are on the same Wi-Fi or USB-Tethering network.`
                                );
                            }
                        };

                    socket.onclose =
                        event => {
                            const isCurrent =
                                this.socket ===
                                socket;

                            if (!settled) {
                                rejectConnection(
                                    `Phone camera closed the connection before it was ready (${event.code || 'no code'}).`
                                );
                                return;
                            }

                            if (!isCurrent) {
                                return;
                            }

                            clearConnectTimer();
                            this.socket = null;
                            this.state =
                                'closed';

                            this.emit(
                                'closed',
                                {
                                    event
                                }
                            );

                            if (
                                !this
                                    ._manualClose &&
                                this.options
                                    .reconnect
                            ) {
                                this
                                    ._scheduleReconnect();
                            }
                        };
                }
            );
        }

        async _handleMessage(event) {
            const data =
                event.data;

            if (
                typeof data ===
                'string'
            ) {
                let message = null;

                try {
                    message =
                        JSON.parse(data);
                } catch (_) {
                    return;
                }

                const type =
                    String(
                        message.type ||
                        ''
                    ).toLowerCase();

                if (
                    type === 'tracking' ||
                    type === 'pose' ||
                    type === 'sensor' ||
                    type === 'lens'
                ) {
                    this.trackingReceiver
                        ?.handlePacket?.(
                            message
                        );
                }

                this.emit(
                    type || 'message',
                    {
                        message
                    }
                );

                return;
            }

            if (
                data instanceof
                ArrayBuffer
            ) {
                await this.videoReceiver
                    ?.handleJPEGFrame?.(
                        data,
                        {
                            mimeType:
                                'image/jpeg'
                        }
                    );

                this.emit(
                    'frame',
                    {
                        byteLength:
                            data.byteLength
                    }
                );

                return;
            }

            if (
                data instanceof Blob
            ) {
                await this.videoReceiver
                    ?.handleJPEGFrame?.(
                        data,
                        {
                            mimeType:
                                data.type ||
                                'image/jpeg'
                        }
                    );

                this.emit(
                    'frame',
                    {
                        byteLength:
                            data.size
                    }
                );
            }
        }

        sendControl(
            action,
            value = undefined
        ) {
            if (
                !this.socket ||
                this.socket.readyState !==
                    WebSocket.OPEN
            ) {
                return false;
            }

            const message = {
                type:
                    'control',
                action
            };

            if (
                value !==
                undefined
            ) {
                message.value =
                    value;
            }

            this.socket.send(
                JSON.stringify(
                    message
                )
            );

            return true;
        }

        sendBinary(payload) {
            if (
                !this.socket ||
                this.socket.readyState !==
                    WebSocket.OPEN ||
                !payload
            ) {
                return false;
            }

            // Never accumulate seconds of stale viewport preview frames on a
            // slower phone/network. The next live frame is more valuable.
            if (
                Number(
                    this.socket
                        .bufferedAmount ||
                    0
                ) >
                2 * 1024 * 1024
            ) {
                return false;
            }

            try {
                this.socket.send(
                    payload
                );

                return true;
            } catch (error) {
                this.emit(
                    'error',
                    {
                        error,
                        direction:
                            'engine-to-phone'
                    }
                );

                return false;
            }
        }

        setStreaming(enabled) {
            return this.sendControl(
                'setStreaming',
                !!enabled
            );
        }

        setJPEGQuality(quality) {
            return this.sendControl(
                'setJpegQuality',
                Math.max(
                    25,
                    Math.min(
                        95,
                        Number(
                            quality
                        ) || 72
                    )
                )
            );
        }

        switchCamera() {
            return this.sendControl(
                'switchCamera'
            );
        }

        _scheduleReconnect() {
            clearTimeout(
                this._reconnectTimer
            );

            this._reconnectTimer =
                setTimeout(
                    () => {
                        this.connect(
                            this.url
                        ).catch(
                            () => {}
                        );
                    },
                    this.options
                        .reconnectDelayMs
                );
        }

        async close() {
            this._manualClose =
                true;

            clearTimeout(
                this._reconnectTimer
            );

            this._reconnectTimer =
                null;

            const socket =
                this.socket;

            this.socket =
                null;

            if (
                socket &&
                (
                    socket.readyState ===
                        WebSocket.OPEN ||
                    socket.readyState ===
                        WebSocket.CONNECTING
                )
            ) {
                try {
                    socket.close(
                        1000,
                        'SM Engine disconnect'
                    );
                } catch (_) {}
            }

            this.state =
                'closed';
        }

        destroy() {
            this.close();

            this.listeners.clear();

            this.videoReceiver =
                null;

            this.trackingReceiver =
                null;
        }
    }

    window.SMUSBTetherTransport =
        SMUSBTetherTransport;
})();
