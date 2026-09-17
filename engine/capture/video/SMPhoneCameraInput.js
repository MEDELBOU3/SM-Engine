(function () {
    'use strict';
    class SMPhoneCameraInput {
        constructor(options = {}) {
            this.type = 'phone';
            this.deviceManager = options.deviceManager || null;
            this.mode = options.mode || 'local';
            this.facingMode = options.facingMode || 'environment';
            this.stream = null;
            this.videoElement = null;
            this.localInput = null;
            this.remotePeerId = null;
            this.options = {
                width: 1920,
                height: 1080,
                frameRate: 30,
                audio: false,
                mirrorFrontCamera: true,
                ...options
            };
        }
        static isProbablyMobileDevice() {
            return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
        }
        async start(options = {}) {
            const mode = options.mode || this.mode;
            if (mode === 'remote') {
                if (options.stream) return this.attachRemoteStream(options.stream, options);
                throw new Error('Remote phone mode needs a MediaStream from SMWebRTCReceiver. The network folder will provide that connection layer.');
            }
            return this.startLocalCamera(options);
        }
        async startLocalCamera(options = {}) {
            if (!window.SMWebCameraInput) throw new Error('Load SMWebCameraInput.js before SMPhoneCameraInput.js');
            await this.stop();
            this.mode = 'local';
            const facingMode = options.facingMode || this.facingMode || 'environment';
            this.facingMode = facingMode;
            this.localInput = new window.SMWebCameraInput({
                deviceManager: this.deviceManager,
                width: options.width ?? this.options.width,
                height: options.height ?? this.options.height,
                frameRate: options.frameRate ?? this.options.frameRate,
                facingMode,
                audio: options.audio ?? this.options.audio,
                mirror: facingMode === 'user' && this.options.mirrorFrontCamera
            });
            const result = await this.localInput.start({ ...options, facingMode });
            this.stream = result.stream;
            this.videoElement = result.videoElement;
            return { ...result, mode: 'local', facingMode };
        }
        async attachRemoteStream(stream, options = {}) {
            if (!(stream instanceof MediaStream)) throw new Error('SMPhoneCameraInput.attachRemoteStream expects a MediaStream.');
            await this.stop();
            this.mode = 'remote';
            this.stream = stream;
            this.remotePeerId = options.peerId || null;
            const video = document.createElement('video');
            video.autoplay = true;
            video.muted = true;
            video.playsInline = true;
            video.srcObject = stream;
            video.style.position = 'fixed';
            video.style.left = '-10000px';
            video.style.top = '-10000px';
            video.style.width = '1px';
            video.style.height = '1px';
            video.style.opacity = '0';
            video.style.pointerEvents = 'none';
            document.body?.appendChild(video);
            try { await video.play(); }
            catch (error) { console.warn('[SMPhoneCameraInput] Remote video autoplay was blocked:', error); }
            this.videoElement = video;
            return { stream: this.stream, videoElement: this.videoElement, mode: 'remote', peerId: this.remotePeerId };
        }
        async switchFacingMode() {
            this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
            if (this.mode !== 'local') return { facingMode: this.facingMode };
            return this.startLocalCamera({ facingMode: this.facingMode });
        }
        async stop() {
            if (this.localInput) {
                await this.localInput.stop();
                this.localInput = null;
            }
            if (this.mode === 'remote' && this.videoElement) {
                try { this.videoElement.pause?.(); } catch (_) {}
                this.videoElement.srcObject = null;
                if (this.videoElement.parentNode) this.videoElement.parentNode.removeChild(this.videoElement);
            }
            this.videoElement = null;
            if (this.mode === 'local' && this.stream) {
                for (const track of this.stream.getTracks()) {
                    if (track.readyState !== 'ended') track.stop();
                }
            }
            this.stream = null;
            this.remotePeerId = null;
        }
    }
    window.SMPhoneCameraInput = SMPhoneCameraInput;
})();