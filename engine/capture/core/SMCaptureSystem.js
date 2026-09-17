(function () {
    'use strict';
    class SMCaptureSystem {
        constructor(options = {}) {
            if (!window.SMCaptureDeviceManager) throw new Error('Load SMCaptureDeviceManager.js before SMCaptureSystem.js');
            if (!window.SMCaptureSession) throw new Error('Load SMCaptureSession.js before SMCaptureSystem.js');
            this.options = { autoRefreshDevices: true, ...options };
            this.deviceManager = options.deviceManager || new window.SMCaptureDeviceManager(options.deviceManagerOptions);
            this.sessions = new Map();
            this.activeSessionId = null;
            this.listeners = new Map();
            this.ready = false;
        }
        on(event, callback) {
            if (typeof callback !== 'function') return () => {};
            if (!this.listeners.has(event)) this.listeners.set(event, new Set());
            this.listeners.get(event).add(callback);
            return () => this.listeners.get(event)?.delete(callback);
        }
        emit(event, detail = {}) {
            const callbacks = this.listeners.get(event);
            if (callbacks) {
                for (const callback of callbacks) {
                    try { callback(detail); } catch (error) { console.error('[SMCaptureSystem]', error); }
                }
            }
            window.dispatchEvent?.(new CustomEvent(`sm:capture-${event}`, { detail }));
        }
        async init() {
            if (this.ready) return this;
            if (!navigator.mediaDevices?.getUserMedia) {
                console.warn('[SMCaptureSystem] getUserMedia unavailable. Use HTTPS or localhost in a compatible browser.');
            }
            if (this.options.autoRefreshDevices) {
                try { await this.deviceManager.refresh(); }
                catch (error) { console.warn('[SMCaptureSystem] Initial device refresh failed:', error); }
            }
            this.ready = true;
            this.emit('ready', { system: this });
            return this;
        }
        get activeSession() {
            return this.activeSessionId ? this.sessions.get(this.activeSessionId) || null : null;
        }
        async refreshDevices(options = {}) { return this.deviceManager.refresh(options); }
        createSession(options = {}) {
            const session = new window.SMCaptureSession(options);
            this.sessions.set(session.id, session);
            session.on('statechange', payload => this.emit('sessionstatechange', payload));
            session.on('error', payload => this.emit('sessionerror', payload));
            this.emit('sessioncreated', { session });
            return session;
        }
        _createInput(type, options = {}) {
            if (type === 'webcam') {
                if (!window.SMWebCameraInput) throw new Error('SMWebCameraInput.js is not loaded.');
                return new window.SMWebCameraInput({ deviceManager: this.deviceManager, ...options });
            }
            if (type === 'capture-card') {
                if (!window.SMCaptureCardInput) throw new Error('SMCaptureCardInput.js is not loaded.');
                return new window.SMCaptureCardInput({ deviceManager: this.deviceManager, ...options });
            }
            if (type === 'phone') {
                if (!window.SMPhoneCameraInput) throw new Error('SMPhoneCameraInput.js is not loaded.');
                return new window.SMPhoneCameraInput({ deviceManager: this.deviceManager, ...options });
            }
            throw new Error(`Unsupported capture source type: ${type}`);
        }
        async startSource(type, options = {}) {
            if (!this.ready) await this.init();
            if (options.stopPrevious !== false && this.activeSession) {
                await this.removeSession(this.activeSession);
            }
            const input = this._createInput(type, options);
            const session = this.createSession({
                name: options.name || `${type} capture`,
                sourceType: type,
                metadata: options.metadata
            });
            this.activeSessionId = session.id;
            try {
                await session.start(input, { ...options, sourceType: type });
                this.emit('sessionstarted', { session });
                return session;
            } catch (error) {
                if (this.activeSessionId === session.id) this.activeSessionId = null;
                try { await session.destroy(); }
                catch (cleanupError) { console.warn('[SMCaptureSystem] Failed source cleanup:', cleanupError); }
                this.sessions.delete(session.id);
                this.emit('sessionremoved', { session, failed: true });
                throw error;
            }
        }
        startWebCamera(options = {}) { return this.startSource('webcam', options); }
        startCaptureCard(options = {}) { return this.startSource('capture-card', options); }
        startPhoneCamera(options = {}) { return this.startSource('phone', options); }
        async stopSession(sessionOrId) {
            const session = typeof sessionOrId === 'string' ? this.sessions.get(sessionOrId) : sessionOrId;
            if (!session) return false;
            await session.stop();
            if (this.activeSessionId === session.id) this.activeSessionId = null;
            this.emit('sessionstopped', { session });
            return true;
        }
        async stopActiveSession() {
            const session = this.activeSession;
            if (!session) return false;
            return this.stopSession(session);
        }
        async removeSession(sessionOrId) {
            const session = typeof sessionOrId === 'string' ? this.sessions.get(sessionOrId) : sessionOrId;
            if (!session) return false;
            await session.destroy();
            this.sessions.delete(session.id);
            if (this.activeSessionId === session.id) this.activeSessionId = null;
            this.emit('sessionremoved', { session });
            return true;
        }
        getSession(id) { return this.sessions.get(id) || null; }
        getSessions() { return Array.from(this.sessions.values()); }
        update() {
            for (const session of this.sessions.values()) {
                if (session.isActive()) session.update();
            }
        }
        async destroy() {
            const sessions = Array.from(this.sessions.values());
            for (const session of sessions) {
                try { await session.destroy(); }
                catch (error) { console.warn('[SMCaptureSystem] Failed to destroy session:', error); }
            }
            this.sessions.clear();
            this.activeSessionId = null;
            this.deviceManager?.destroy?.();
            this.deviceManager = null;
            this.listeners.clear();
            this.ready = false;
        }
    }
    window.SMCaptureSystem = SMCaptureSystem;
    window.initCaptureSystem = async function (options = {}) {
        if (window.captureSystem?.destroy) {
            try { await window.captureSystem.destroy(); }
            catch (error) { console.warn('[SMCaptureSystem] Previous system destroy failed:', error); }
        }
        const system = new window.SMCaptureSystem(options);
        window.captureSystem = system;
        window.smCaptureSystem = system;
        await system.init();
        return system;
    };
})();
