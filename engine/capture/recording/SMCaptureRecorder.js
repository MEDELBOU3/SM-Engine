(function () {
    'use strict';

    class SMCaptureRecorder {
        constructor(options = {}) {
            this.options = {
                mimeType: '',
                videoBitsPerSecond: 10000000,
                audioBitsPerSecond: 192000,
                ...options
            };

            this.session = null;
            this.stream = null;

            this.mediaRecorder = null;
            this.chunks = [];

            this.state = 'idle';
            this.startedAt = 0;
            this.stoppedAt = 0;

            this.listeners = new Map();
        }

        on(event, callback) {
            if (typeof callback !== 'function') return () => {};

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
                            '[SMCaptureRecorder]',
                            error
                        );
                    }
                }
            }

            window.dispatchEvent?.(
                new CustomEvent(
                    `sm:capture-recorder-${event}`,
                    { detail }
                )
            );
        }

        _pickMimeType(preferred = '') {
            const candidates = [
                preferred,
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm',
                'audio/webm'
            ].filter(Boolean);

            for (const type of candidates) {
                if (
                    !MediaRecorder.isTypeSupported ||
                    MediaRecorder.isTypeSupported(type)
                ) {
                    return type;
                }
            }

            return '';
        }

        bindSession(session) {
            this.session =
                session ||
                null;

            this.stream =
                session?.stream ||
                null;

            return this;
        }

        bindStream(stream) {
            this.session = null;
            this.stream =
                stream ||
                null;

            return this;
        }

        async start(options = {}) {
            if (!window.MediaRecorder) {
                throw new Error(
                    'MediaRecorder is not available in this browser.'
                );
            }

            if (
                this.state === 'recording'
            ) {
                return this;
            }

            const stream =
                options.stream ||
                this.stream ||
                this.session?.stream ||
                null;

            if (!(stream instanceof MediaStream)) {
                throw new Error(
                    'SMCaptureRecorder requires an active MediaStream.'
                );
            }

            this.stream = stream;

            const merged = {
                ...this.options,
                ...options
            };

            const mimeType =
                this._pickMimeType(
                    merged.mimeType
                );

            const recorderOptions = {};

            if (mimeType) {
                recorderOptions.mimeType =
                    mimeType;
            }

            if (
                merged.videoBitsPerSecond
            ) {
                recorderOptions.videoBitsPerSecond =
                    Number(
                        merged.videoBitsPerSecond
                    );
            }

            if (
                merged.audioBitsPerSecond
            ) {
                recorderOptions.audioBitsPerSecond =
                    Number(
                        merged.audioBitsPerSecond
                    );
            }

            this.chunks = [];

            this.mediaRecorder =
                new MediaRecorder(
                    stream,
                    recorderOptions
                );

            this.mediaRecorder.ondataavailable = event => {
                if (
                    event.data &&
                    event.data.size
                ) {
                    this.chunks.push(
                        event.data
                    );
                }
            };

            this.mediaRecorder.onerror = event => {
                this.state = 'error';

                this.emit('error', {
                    error:
                        event.error ||
                        event
                });
            };

            this.mediaRecorder.onstart = () => {
                this.state = 'recording';
                this.startedAt =
                    performance.now();

                this.emit('start', {
                    mimeType:
                        this.mediaRecorder.mimeType
                });
            };

            this.mediaRecorder.start(
                Math.max(
                    100,
                    Number(
                        merged.timeslice
                    ) || 1000
                )
            );

            return this;
        }

        async stop() {
            if (
                !this.mediaRecorder ||
                this.mediaRecorder.state === 'inactive'
            ) {
                return null;
            }

            return new Promise((resolve, reject) => {
                const recorder =
                    this.mediaRecorder;

                recorder.onstop = () => {
                    this.stoppedAt =
                        performance.now();

                    this.state =
                        'stopped';

                    const mimeType =
                        recorder.mimeType ||
                        'video/webm';

                    const blob =
                        new Blob(
                            this.chunks,
                            {
                                type:
                                    mimeType
                            }
                        );

                    const result = {
                        blob,
                        mimeType,
                        size:
                            blob.size,
                        duration:
                            Math.max(
                                0,
                                this.stoppedAt -
                                this.startedAt
                            ) / 1000
                    };

                    this.emit(
                        'stop',
                        result
                    );

                    resolve(result);
                };

                recorder.onerror = event => {
                    reject(
                        event.error ||
                        event
                    );
                };

                recorder.stop();
            });
        }

        pause() {
            if (
                this.mediaRecorder?.state ===
                'recording'
            ) {
                this.mediaRecorder.pause();
                this.state = 'paused';

                this.emit('pause', {});
                return true;
            }

            return false;
        }

        resume() {
            if (
                this.mediaRecorder?.state ===
                'paused'
            ) {
                this.mediaRecorder.resume();
                this.state =
                    'recording';

                this.emit('resume', {});
                return true;
            }

            return false;
        }

        getElapsedTime() {
            if (!this.startedAt) return 0;

            const end =
                this.state === 'recording' ||
                this.state === 'paused'
                    ? performance.now()
                    : this.stoppedAt;

            return Math.max(
                0,
                end -
                this.startedAt
            ) / 1000;
        }

        destroy() {
            if (
                this.mediaRecorder &&
                this.mediaRecorder.state !==
                'inactive'
            ) {
                try {
                    this.mediaRecorder.stop();
                } catch (_) {}
            }

            this.mediaRecorder = null;
            this.stream = null;
            this.session = null;

            this.chunks.length = 0;
            this.listeners.clear();

            this.state = 'destroyed';
        }
    }

    window.SMCaptureRecorder =
        SMCaptureRecorder;
})();