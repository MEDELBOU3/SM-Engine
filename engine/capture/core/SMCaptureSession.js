(function () {
    'use strict';
    class SMCaptureSession {
        constructor(options = {}) {
            this.id = options.id || `sm_capture_${Math.random().toString(36).slice(2, 10)}`;
            this.name = options.name || 'Capture Session';
            this.sourceType = options.sourceType || 'unknown';
            this.input = null;
            this.stream = null;
            this.videoElement = null;
            this.videoTextureSource = null;
            this.texture = null;
            this.state = 'idle';
            this.error = null;
            this.startedAt = 0;
            this.listeners = new Map();
            this.metadata = { ...options.metadata };
        }
        on(event, callback) {
            if (typeof callback !== 'function') return () => {};
            if (!this.listeners.has(event)) this.listeners.set(event, new Set());
            this.listeners.get(event).add(callback);
            return () => this.listeners.get(event)?.delete(callback);
        }
        emit(event, detail = {}) {
            const payload = { session: this, ...detail };
            const callbacks = this.listeners.get(event);
            if (callbacks) {
                for (const callback of callbacks) {
                    try { callback(payload); } catch (error) { console.error('[SMCaptureSession]', error); }
                }
            }
            window.dispatchEvent?.(new CustomEvent(`sm:capture-session-${event}`, { detail: payload }));
        }
        setState(nextState, detail = {}) {
            if (this.state === nextState) return;
            const previousState = this.state;
            this.state = nextState;
            this.emit('statechange', { previousState, state: nextState, ...detail });
        }
        async start(input, options = {}) {
            if (!input) throw new Error('SMCaptureSession.start requires a capture input.');
            if (this.state === 'starting' || this.state === 'active') return this;
            this.input = input;
            this.sourceType = options.sourceType || input.type || this.sourceType;
            this.error = null;
            this.setState('starting');
            try {
                const result = await input.start(options);
                this.stream = result?.stream || input.stream || null;
                this.videoElement = result?.videoElement || input.videoElement || null;
                if (window.SMVideoTextureSource && this.videoElement) {
                    this.videoTextureSource = new window.SMVideoTextureSource({
                        videoElement: this.videoElement,
                        stream: this.stream,
                        ...options.videoTextureOptions
                    });
                    this.texture = this.videoTextureSource.texture;
                }
                this.startedAt = performance.now();
                this.setState('active');
                this.emit('started', { stream: this.stream, videoElement: this.videoElement, texture: this.texture });
                return this;
            } catch (error) {
                this.error = error;
                this.setState('error', { error });
                this.emit('error', { error });
                throw error;
            }
        }
        async stop() {
            if (this.state === 'idle' || this.state === 'stopped') return;
            this.setState('stopping');
            try {
                this.videoTextureSource?.dispose?.();
                this.videoTextureSource = null;
                this.texture = null;
                await this.input?.stop?.();
                if (this.stream) {
                    for (const track of this.stream.getTracks()) {
                        if (track.readyState !== 'ended') track.stop();
                    }
                }
                this.stream = null;
                this.videoElement = null;
                this.input = null;
                this.setState('stopped');
                this.emit('stopped');
            } catch (error) {
                this.error = error;
                this.setState('error', { error });
                this.emit('error', { error });
                throw error;
            }
        }
        isActive() { return this.state === 'active'; }
        getVideoTrack() { return this.stream?.getVideoTracks?.()[0] || null; }
        getAudioTrack() { return this.stream?.getAudioTracks?.()[0] || null; }
        getSettings() {
            const videoTrack = this.getVideoTrack();
            const audioTrack = this.getAudioTrack();
            return { video: videoTrack?.getSettings?.() || null, audio: audioTrack?.getSettings?.() || null };
        }
        update() { this.videoTextureSource?.update?.(); }
        async destroy() {
            try { await this.stop(); }
            catch (error) { console.warn('[SMCaptureSession] Stop during destroy failed:', error); }
            this.listeners.clear();
            this.metadata = {};
        }
    }
    window.SMCaptureSession = SMCaptureSession;
})();