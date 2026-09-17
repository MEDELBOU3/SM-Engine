(function () {
    'use strict';
    class SMWebCameraInput {
        constructor(options = {}) {
            this.type = 'webcam';
            this.deviceManager = options.deviceManager || null;
            this.stream = null;
            this.videoElement = null;
            this.deviceId = options.deviceId || null;
            this.options = {
                width: 1920,
                height: 1080,
                frameRate: 30,
                facingMode: undefined,
                audio: false,
                mirror: false,
                ...options
            };
            this.state = 'idle';
        }
        isSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
        _buildVideoConstraints(options = {}) {
            const merged = { ...this.options, ...options };
            const constraints = {};
            if (merged.deviceId) constraints.deviceId = { exact: merged.deviceId };
            else if (merged.facingMode) constraints.facingMode = { ideal: merged.facingMode };
            if (merged.width) constraints.width = { ideal: Number(merged.width) };
            if (merged.height) constraints.height = { ideal: Number(merged.height) };
            if (merged.frameRate) constraints.frameRate = { ideal: Number(merged.frameRate) };
            return constraints;
        }
        _buildAudioConstraints(options = {}) {
            const merged = { ...this.options, ...options };
            if (!merged.audio) return false;
            if (typeof merged.audio === 'object') return merged.audio;
            if (merged.audioDeviceId) return { deviceId: { exact: merged.audioDeviceId } };
            return true;
        }
        async start(options = {}) {
            if (!this.isSupported()) throw new Error('Camera capture requires navigator.mediaDevices.getUserMedia.');
            if (this.stream) await this.stop();
            this.state = 'starting';
            const constraints = {
                video: this._buildVideoConstraints(options),
                audio: this._buildAudioConstraints(options)
            };
            try {
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.videoElement = await this._createVideoElement(this.stream, options);
                this.state = 'active';
                const videoTrack = this.stream.getVideoTracks()[0] || null;
                if (videoTrack) {
                    const settings = videoTrack.getSettings?.() || {};
                    this.deviceId = settings.deviceId || options.deviceId || this.deviceId;
                }
                return {
                    stream: this.stream,
                    videoElement: this.videoElement,
                    track: videoTrack,
                    settings: videoTrack?.getSettings?.() || null
                };
            } catch (error) {
                this.state = 'error';
                throw error;
            }
        }
        async _createVideoElement(stream, options = {}) {
            const video = document.createElement('video');
            video.autoplay = true;
            video.muted = true;
            video.playsInline = true;
            video.controls = false;
            video.srcObject = stream;
            video.style.position = 'fixed';
            video.style.left = '-10000px';
            video.style.top = '-10000px';
            video.style.width = '1px';
            video.style.height = '1px';
            video.style.pointerEvents = 'none';
            video.style.opacity = '0';
            if (options.mirror === true || this.options.mirror === true) video.style.transform = 'scaleX(-1)';
            document.body?.appendChild(video);
            try { await video.play(); }
            catch (error) { console.warn('[SMWebCameraInput] Video autoplay was blocked:', error); }
            return video;
        }
        getVideoTrack() { return this.stream?.getVideoTracks?.()[0] || null; }
        getCapabilities() { return this.getVideoTrack()?.getCapabilities?.() || {}; }
        getSettings() { return this.getVideoTrack()?.getSettings?.() || {}; }
        async applyConstraints(constraints = {}) {
            const track = this.getVideoTrack();
            if (!track) throw new Error('No active camera track.');
            await track.applyConstraints(constraints);
            return this.getSettings();
        }
        async switchDevice(deviceId, options = {}) {
            this.deviceId = deviceId || null;
            return this.start({ ...options, deviceId: this.deviceId });
        }
        async stop() {
            if (this.videoElement) {
                try { this.videoElement.pause?.(); } catch (_) {}
                this.videoElement.srcObject = null;
                if (this.videoElement.parentNode) this.videoElement.parentNode.removeChild(this.videoElement);
                this.videoElement = null;
            }
            if (this.stream) {
                for (const track of this.stream.getTracks()) track.stop();
                this.stream = null;
            }
            this.state = 'stopped';
        }
    }
    window.SMWebCameraInput = SMWebCameraInput;
})();