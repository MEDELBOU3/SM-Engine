(function () {
    'use strict';
    class SMCaptureDeviceManager {
        constructor(options = {}) {
            this.options = { includeAudio: true, autoWatchDevices: true, ...options };
            this.devices = { cameras: [], microphones: [], speakers: [] };
            this.listeners = new Map();
            this._boundDeviceChange = this._handleDeviceChange.bind(this);
            this._watching = false;
            if (this.options.autoWatchDevices) this.startWatching();
        }
        on(event, callback) {
            if (typeof callback !== 'function') return () => {};
            if (!this.listeners.has(event)) this.listeners.set(event, new Set());
            this.listeners.get(event).add(callback);
            return () => this.listeners.get(event)?.delete(callback);
        }
        emit(event, detail = {}) {
            const callbacks = this.listeners.get(event);
            if (!callbacks) return;
            for (const callback of callbacks) {
                try { callback(detail); } catch (error) { console.error('[SMCaptureDeviceManager]', error); }
            }
        }
        isSupported() {
            return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.enumerateDevices);
        }
        isSecureContextReady() { return window.isSecureContext === true; }
        async requestPermission(options = {}) {
            if (!this.isSupported()) throw new Error('MediaDevices API is not supported in this browser.');
            const constraints = { video: options.video !== false, audio: options.audio === true };
            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                return true;
            } finally {
                if (stream) for (const track of stream.getTracks()) track.stop();
            }
        }
        async refresh(options = {}) {
            if (!this.isSupported()) throw new Error('MediaDevices API is not supported in this browser.');
            if (options.requestPermission === true) {
                try { await this.requestPermission({ video: options.video !== false, audio: options.audio === true }); }
                catch (error) { console.warn('[SMCaptureDeviceManager] Permission request failed:', error); }
            }
            const rawDevices = await navigator.mediaDevices.enumerateDevices();
            this.devices.cameras = rawDevices.filter(d => d.kind === 'videoinput').map((d, i) => this._normalizeDevice(d, i, 'Camera'));
            this.devices.microphones = rawDevices.filter(d => d.kind === 'audioinput').map((d, i) => this._normalizeDevice(d, i, 'Microphone'));
            this.devices.speakers = rawDevices.filter(d => d.kind === 'audiooutput').map((d, i) => this._normalizeDevice(d, i, 'Speaker'));
            const snapshot = this.getSnapshot();
            this.emit('deviceschange', snapshot);
            window.dispatchEvent?.(new CustomEvent('sm:capture-devices-change', { detail: snapshot }));
            return snapshot;
        }
        _normalizeDevice(device, index, fallbackName) {
            return { deviceId: device.deviceId || '', groupId: device.groupId || '', kind: device.kind || '', label: device.label || `${fallbackName} ${index + 1}`, raw: device };
        }
        getSnapshot() {
            return {
                cameras: this.devices.cameras.map(d => ({ ...d })),
                microphones: this.devices.microphones.map(d => ({ ...d })),
                speakers: this.devices.speakers.map(d => ({ ...d }))
            };
        }
        getCameras() { return this.devices.cameras.slice(); }
        getMicrophones() { return this.devices.microphones.slice(); }
        getSpeakers() { return this.devices.speakers.slice(); }
        getCameraById(deviceId) { return this.devices.cameras.find(d => d.deviceId === deviceId) || null; }
        findCameraByLabel(query) {
            const needle = String(query || '').trim().toLowerCase();
            if (!needle) return null;
            return this.devices.cameras.find(d => String(d.label || '').toLowerCase().includes(needle)) || null;
        }
        findCaptureCardCandidates() {
            const keywords = ['capture', 'elgato', 'cam link', 'hdmi', 'avermedia', 'blackmagic', 'magewell', 'video grabber', 'usb video'];
            return this.devices.cameras.filter(device => {
                const label = String(device.label || '').toLowerCase();
                return keywords.some(keyword => label.includes(keyword));
            });
        }
        getDefaultCamera() { return this.devices.cameras[0] || null; }
        getDefaultMicrophone() { return this.devices.microphones[0] || null; }
        startWatching() {
            if (this._watching || !navigator.mediaDevices?.addEventListener) return;
            navigator.mediaDevices.addEventListener('devicechange', this._boundDeviceChange);
            this._watching = true;
        }
        stopWatching() {
            if (!this._watching || !navigator.mediaDevices?.removeEventListener) return;
            navigator.mediaDevices.removeEventListener('devicechange', this._boundDeviceChange);
            this._watching = false;
        }
        async _handleDeviceChange() {
            try { await this.refresh(); }
            catch (error) { console.warn('[SMCaptureDeviceManager] Device refresh failed:', error); }
        }
        destroy() {
            this.stopWatching();
            this.listeners.clear();
            this.devices.cameras.length = 0;
            this.devices.microphones.length = 0;
            this.devices.speakers.length = 0;
        }
    }
    window.SMCaptureDeviceManager = SMCaptureDeviceManager;
})();
