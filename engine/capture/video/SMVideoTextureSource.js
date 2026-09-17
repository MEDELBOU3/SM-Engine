(function () {
    'use strict';
    class SMVideoTextureSource {
        constructor(options = {}) {
            if (typeof THREE === 'undefined') throw new Error('SMVideoTextureSource requires THREE.');
            this.stream = options.stream || null;
            this._ownsVideoElement = !options.videoElement;
            this.videoElement = options.videoElement || this._createVideoElement(options);
            this.texture = this._createTexture(options);
            this.disposed = false;
        }
        _createVideoElement(options = {}) {
            const video = document.createElement('video');
            video.autoplay = true;
            video.muted = options.muted !== false;
            video.playsInline = true;
            video.controls = false;
            video.loop = false;
            video.style.display = 'none';
            if (this.stream) video.srcObject = this.stream;
            document.body?.appendChild(video);
            video.play?.().catch(() => {});
            return video;
        }
        _createTexture(options = {}) {
            const texture = new THREE.VideoTexture(this.videoElement);
            texture.name = options.name || 'SMCaptureVideoTexture';
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            texture.flipY = options.flipY === true;
            if ('colorSpace' in texture && THREE.SRGBColorSpace !== undefined) texture.colorSpace = THREE.SRGBColorSpace;
            else if ('encoding' in texture && THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
            return texture;
        }
        async attachStream(stream) {
            this.stream = stream || null;
            if (!this.videoElement) {
                this._ownsVideoElement = true;
                this.videoElement = this._createVideoElement();
            }
            this.videoElement.srcObject = this.stream;
            try { await this.videoElement.play(); }
            catch (error) { console.warn('[SMVideoTextureSource] Could not autoplay video:', error); }
            return this.texture;
        }
        update() {
            if (this.disposed || !this.texture || !this.videoElement) return;
            if (this.videoElement.readyState >= this.videoElement.HAVE_CURRENT_DATA) this.texture.needsUpdate = true;
        }
        getAspectRatio() {
            const video = this.videoElement;
            if (!video?.videoWidth || !video?.videoHeight) return 16 / 9;
            return video.videoWidth / video.videoHeight;
        }
        getSize() {
            return { width: this.videoElement?.videoWidth || 0, height: this.videoElement?.videoHeight || 0 };
        }
        dispose() {
            if (this.disposed) return;
            this.disposed = true;
            this.texture?.dispose?.();
            this.texture = null;
            if (this._ownsVideoElement && this.videoElement) {
                try { this.videoElement.pause?.(); } catch (_) {}
                this.videoElement.srcObject = null;
                if (this.videoElement.parentNode) this.videoElement.parentNode.removeChild(this.videoElement);
            }
            this.videoElement = null;
            this.stream = null;
        }
    }
    window.SMVideoTextureSource = SMVideoTextureSource;
})();