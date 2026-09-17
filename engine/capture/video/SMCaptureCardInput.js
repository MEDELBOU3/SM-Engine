(function () {
    'use strict';
    if (!window.SMWebCameraInput) throw new Error('Load SMWebCameraInput.js before SMCaptureCardInput.js');
    class SMCaptureCardInput extends window.SMWebCameraInput {
        constructor(options = {}) {
            super({ width: 1920, height: 1080, frameRate: 30, audio: true, mirror: false, ...options });
            this.type = 'capture-card';
            this.preferredKeywords = options.preferredKeywords || [
                'capture', 'elgato', 'cam link', 'hdmi', 'avermedia', 'blackmagic', 'magewell', 'video grabber', 'usb video'
            ];
        }
        async findBestDevice() {
            const manager = this.deviceManager;
            if (!manager) return null;
            let cameras = manager.getCameras?.() || [];
            if (!cameras.length) {
                try {
                    const snapshot = await manager.refresh({ requestPermission: true });
                    cameras = snapshot.cameras || [];
                } catch (error) {
                    console.warn('[SMCaptureCardInput] Device refresh failed:', error);
                }
            }
            const explicit = this.deviceId ? cameras.find(camera => camera.deviceId === this.deviceId) : null;
            if (explicit) return explicit;
            for (const keyword of this.preferredKeywords) {
                const needle = String(keyword).toLowerCase();
                const match = cameras.find(camera => String(camera.label || '').toLowerCase().includes(needle));
                if (match) return match;
            }
            return null;
        }
        async start(options = {}) {
            const merged = { ...this.options, ...options };
            let deviceId = merged.deviceId || this.deviceId || null;
            if (!deviceId) {
                const best = await this.findBestDevice();
                deviceId = best?.deviceId || null;
            }
            if (!deviceId) {
                console.warn('[SMCaptureCardInput] No capture-card-labelled device found. Falling back to the first video input.');
                const fallback = this.deviceManager?.getDefaultCamera?.() || null;
                deviceId = fallback?.deviceId || null;
            }
            return super.start({ ...merged, deviceId, mirror: false });
        }
    }
    window.SMCaptureCardInput = SMCaptureCardInput;
})();